import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import admin from "firebase-admin";
import zlib from "node:zlib";
import serviceAccount from "./serviceAccountKey.json" with { type: "json" };
import { detectSubjectFromCatalog, mapToAllowedSubjectLabel } from "./src/data/subjectCatalog.js";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const METRIC_KEYS = ["mastery", "clarity", "confidence", "speed", "readiness"];
const MAX_TREE_NODES = 12;
const ROOT_NODE = {
  id: "start",
  label: "Start point",
  parentId: null,
  depth: 0,
  tag: "Anchor",
  assignment: "Choose one path to shape the next study session.",
  reason: ["The tree will grow from the student's chat prompts."],
  impact: { mastery: 0, clarity: 0, confidence: 0, speed: 0, readiness: 0 },
};
const AFFIRMATIVE_RESPONSES = new Set([
  "yes",
  "y",
  "ok",
  "okay",
  "sure",
  "sounds good",
  "go ahead",
  "add it",
  "add them",
  "do it",
  "yep",
  "yeah",
]);
const NEGATIVE_RESPONSES = new Set([
  "no",
  "n",
  "nope",
  "not yet",
  "dont add",
  "don't add",
  "change it",
  "change them",
  "not this",
]);
const STUDY_KEYWORDS = [
  "study",
  "revise",
  "revision",
  "exam",
  "test",
  "quiz",
  "math",
  "science",
  "subject",
  "homework",
  "practice",
  "problem",
  "formula",
  "topic",
  "learn",
  "weak",
  "strategy",
  "strategies",
  "plan",
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getNodeDepth(nodeMap, node) {
  if (Number.isFinite(node?.depth)) return node.depth;
  if (!node?.parentId || !nodeMap?.[node.parentId]) return 0;
  return getNodeDepth(nodeMap, nodeMap[node.parentId]) + 1;
}

function getSiblingIds(nodeMap, parentId) {
  return Object.values(nodeMap)
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => node.id);
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons) || !reasons.length) {
    return ["Generated from the student's latest prompt."];
  }

  return reasons
    .map((reason) => String(reason).trim())
    .filter(Boolean)
    .slice(0, 4);
}

function canonicalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function isAffirmativeMessage(message) {
  const normalized = canonicalizeText(message);
  return AFFIRMATIVE_RESPONSES.has(normalized);
}

function isNegativeMessage(message) {
  const normalized = canonicalizeText(message);
  return NEGATIVE_RESPONSES.has(normalized);
}

function isStudyRelatedMessage(message) {
  const normalized = canonicalizeText(message);
  return STUDY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function getProposalChoice(message, pendingProposals) {
  const normalized = canonicalizeText(message);

  const numericMatch = normalized.match(/\b([1-9]|10)\b/);
  if (numericMatch) {
    const index = Number(numericMatch[1]) - 1;
    if (pendingProposals[index]) {
      return pendingProposals[index];
    }
  }

  return (
    pendingProposals.find((proposal) => {
      const label = canonicalizeText(proposal.label);
      return label && normalized.includes(label);
    }) ?? null
  );
}

function normalizeImpact(impact) {
  return METRIC_KEYS.reduce((acc, key) => {
    const nextValue = Number(impact?.[key] ?? 0);
    acc[key] = Number.isFinite(nextValue) ? clamp(nextValue, -25, 25) : 0;
    return acc;
  }, {});
}

function detectSubjectFromText(text, allowedSubjects = []) {
  return detectSubjectFromCatalog(text, allowedSubjects);
}

function decodeDataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:.*?;base64,(.+)$/);
  if (!match) {
    return null;
  }

  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function decodePdfLiteralString(value) {
  return value
    .replace(/\\([\\()])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function extractReadablePdfTextFromStream(streamText) {
  const literalMatches = Array.from(streamText.matchAll(/\(((?:\\.|[^\\)])+)\)/g))
    .map((match) => decodePdfLiteralString(match[1]))
    .join(" ");
  const hexMatches = Array.from(streamText.matchAll(/<([0-9A-Fa-f\s]{8,})>/g))
    .map((match) => {
      const hex = match[1].replace(/\s+/g, "");
      if (!hex || hex.length % 2 !== 0) {
        return "";
      }

      try {
        return Buffer.from(hex, "hex").toString("utf8");
      } catch {
        return "";
      }
    })
    .join(" ");

  return `${literalMatches} ${hexMatches}`.replace(/\s+/g, " ").trim();
}

function extractTextFromPdfBuffer(buffer) {
  const binary = buffer.toString("latin1");
  const textChunks = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match = streamRegex.exec(binary);

  while (match) {
    const rawStream = match[1];
    const rawBuffer = Buffer.from(rawStream, "latin1");
    const candidates = [rawBuffer];

    try {
      candidates.unshift(zlib.inflateSync(rawBuffer));
    } catch {
      // Ignore compressed streams that do not inflate cleanly.
    }

    for (const candidate of candidates) {
      const extracted = extractReadablePdfTextFromStream(candidate.toString("latin1"));
      if (extracted) {
        textChunks.push(extracted);
      }
    }

    match = streamRegex.exec(binary);
  }

  return textChunks.join(" ").replace(/\s+/g, " ").trim();
}

async function classifyPracticeTextWithAi({ fileName, fileType, extractedText, allowedSubjects = [] }) {
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: `
You classify uploaded study documents.
Choose the most likely subject and a short topic from the extracted text.
If the text is ambiguous, return an empty subjectLabel and low confidence.
Prefer one of these tracked subjects when supported by evidence: ${allowedSubjects.join(", ") || "none provided"}.

Return ONLY valid JSON:
{
  "subjectLabel": "",
  "detectedTopic": "",
  "confidence": "high|medium|low",
  "confidenceNote": ""
}
`,
      },
      {
        role: "user",
        content: `Filename: ${fileName}\nFile type: ${fileType}\n\nExtracted text:\n${String(extractedText || "").slice(0, 7000)}`,
      },
    ],
    temperature: 0.1,
  });

  const parsed = parseModelJson(response.output_text);

  return {
    subjectLabel: mapToAllowedSubjectLabel(String(parsed.subjectLabel ?? "").trim(), allowedSubjects)
      || String(parsed.subjectLabel ?? "").trim(),
    detectedTopic: String(parsed.detectedTopic ?? "General Practice").trim() || "General Practice",
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
    confidenceNote:
      String(parsed.confidenceNote ?? "").trim()
      || "Detected from extracted document text. Please confirm before logging.",
  };
}

async function detectPracticeDocument({ fileName, fileType, fileDataUrl, allowedSubjects = [] }) {
  const filenameDetection = detectSubjectFromText(fileName, allowedSubjects);
  const debug = {
    fileName,
    fileType,
    allowedSubjects,
    readableTextChars: 0,
    filenameFallbackSubject: filenameDetection.subjectLabel || "",
  };

  if (fileType?.includes("pdf") && fileDataUrl) {
    const pdfBuffer = decodeDataUrlToBuffer(fileDataUrl);
    const extractedText = pdfBuffer ? extractTextFromPdfBuffer(pdfBuffer) : "";
    debug.readableTextChars = extractedText.length;

    if (extractedText) {
      const keywordDetection = detectSubjectFromText(`${fileName} ${extractedText}`, allowedSubjects);
      const aiDetection = await classifyPracticeTextWithAi({
        fileName,
        fileType,
        extractedText,
        allowedSubjects,
      });
      const normalizedKeywordSubject = canonicalizeText(keywordDetection.subjectLabel);
      const normalizedAiSubject = canonicalizeText(aiDetection.subjectLabel);
      const hasKeywordSubject = Boolean(normalizedKeywordSubject);
      const hasAiSubject = Boolean(normalizedAiSubject);
      const detectionsAgree =
        hasKeywordSubject &&
        hasAiSubject &&
        normalizedKeywordSubject === normalizedAiSubject;
      let resolvedDetection = keywordDetection;
      let detectionMode = "pdf_text_keywords";

      if (!hasKeywordSubject && hasAiSubject) {
        resolvedDetection = aiDetection;
        detectionMode = "pdf_text_ai_fallback";
      } else if (detectionsAgree) {
        resolvedDetection = {
          ...keywordDetection,
          detectedTopic: aiDetection.detectedTopic || keywordDetection.detectedTopic,
          confidence: "high",
          confidenceNote: "Document text and AI classification agree on the subject. Please confirm before logging.",
        };
        detectionMode = "pdf_text_consensus";
      } else if (hasKeywordSubject && hasAiSubject && !detectionsAgree) {
        resolvedDetection = {
          ...keywordDetection,
          confidence: "low",
          confidenceNote:
            `Conflicting subject signals detected. Text classification suggests ${keywordDetection.subjectLabel}, while AI suggests ${aiDetection.subjectLabel}. Please confirm manually.`,
        };
        detectionMode = "pdf_text_conflict";
      }

      const result = {
        ...resolvedDetection,
        detectionMode,
        debug: {
          ...debug,
          keywordSubject: keywordDetection.subjectLabel || "",
          aiSubject: aiDetection.subjectLabel || "",
          finalSubject: resolvedDetection.subjectLabel || "",
          textVsAiAgreement: detectionsAgree,
        },
      };
      console.log("[practice-detect]", JSON.stringify(result.debug));

      return {
        ...result,
      };
    }

    const result = {
      ...filenameDetection,
      confidence: "low",
      confidenceNote: "This PDF did not expose readable text automatically. Please confirm the subject manually.",
      detectionMode: "pdf_unreadable_fallback",
      debug,
    };
    console.log("[practice-detect]", JSON.stringify(result.debug));
    return result;
  }

  if (!fileType?.startsWith("image/") || !fileDataUrl) {
    const result = {
      ...filenameDetection,
      detectionMode: "filename_fallback",
      debug,
    };
    console.log("[practice-detect]", JSON.stringify(result.debug));
    return result;
  }

  const systemPrompt = `
You classify uploaded study images.
Choose the most likely subject and a short topic.
If possible, prefer one of these tracked subjects: ${allowedSubjects.join(", ") || "none provided"}.
If the image is too ambiguous, return an empty subjectLabel and low confidence instead of guessing.

Return ONLY valid JSON:
{
  "subjectLabel": "",
  "detectedTopic": "",
  "confidence": "high|medium|low",
  "confidenceNote": ""
}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Filename: ${fileName}\nFile type: ${fileType}`,
          },
          {
            type: "input_image",
            image_url: fileDataUrl,
          },
        ],
      },
    ],
    temperature: 0.1,
  });

  const parsed = parseModelJson(response.output_text);

  const result = {
    subjectLabel: mapToAllowedSubjectLabel(String(parsed.subjectLabel ?? "").trim(), allowedSubjects)
      || String(parsed.subjectLabel ?? "").trim(),
    detectedTopic: String(parsed.detectedTopic ?? "General Practice").trim() || "General Practice",
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
    confidenceNote:
      String(parsed.confidenceNote ?? "").trim()
      || "Detected from the uploaded image. Please confirm before logging.",
    detectionMode: "ai_vision",
    debug,
  };
  console.log("[practice-detect]", JSON.stringify(result.debug));
  return result;
}

function getAutoPosition(nodeMap, positions, nodeId) {
  const node = nodeMap[nodeId];
  if (!node?.parentId) {
    return { x: 50, y: 14 };
  }

  const parentPosition = positions[node.parentId] ?? { x: 50, y: 14 };
  const siblingIds = getSiblingIds(nodeMap, node.parentId);
  const siblingIndex = Math.max(0, siblingIds.indexOf(nodeId));
  const siblingCount = Math.max(1, siblingIds.length);
  const spread =
    node.parentId === "start"
      ? Math.min(52, 28 + (siblingCount - 1) * 10)
      : Math.min(42, 20 + (siblingCount - 1) * 7);
  const step = siblingCount === 1 ? 0 : spread / (siblingCount - 1);
  const x =
    siblingCount === 1
      ? parentPosition.x
      : parentPosition.x - spread / 2 + step * siblingIndex;
  const depth = Math.max(1, getNodeDepth(nodeMap, node));
  const y = clamp(Math.max(parentPosition.y + 24, 14 + depth * 22), 14, 84);

  return {
    x: clamp(x, 10, 90),
    y,
  };
}

function ensureTreeRoot(treeState) {
  const nodeMap = { start: ROOT_NODE, ...(treeState?.nodeMap ?? {}) };
  const positions = { start: { x: 50, y: 14 }, ...(treeState?.positions ?? {}) };
  const committedNodeId = treeState?.committedNodeId && nodeMap[treeState.committedNodeId]
    ? treeState.committedNodeId
    : null;

  return {
    ...treeState,
    nodeMap,
    positions,
    committedNodeId,
    selectedId: treeState?.selectedId ?? null,
    pendingProposals: Array.isArray(treeState?.pendingProposals)
      ? treeState.pendingProposals
      : [],
    pendingSelectedProposalId: treeState?.pendingSelectedProposalId ?? null,
  };
}

function normalizeNodeForInsert(rawNode, nodeMap, committedNodeId = null) {
  const id = String(rawNode?.id ?? "").trim();
  if (!id || id === "start") return null;

  const parentId = committedNodeId && nodeMap[committedNodeId] ? committedNodeId : "start";
  const parentDepth = nodeMap[parentId] ? getNodeDepth(nodeMap, nodeMap[parentId]) : 0;

  return {
    id,
    label: String(rawNode?.label ?? "New option").trim() || "New option",
    parentId,
    depth: parentDepth + 1,
    tag: String(rawNode?.tag ?? "").trim() || "Plan",
    assignment:
      String(rawNode?.assignment ?? "").trim() ||
      "Generated from the student's latest prompt.",
    reason: normalizeReasons(rawNode?.reason),
    whyThisFits:
      String(rawNode?.whyThisFits ?? "").trim() ||
      normalizeReasons(rawNode?.reason)[0],
    impact: normalizeImpact(rawNode?.impact),
  };
}

function findDuplicateNodeId(nodeMap, candidateNode) {
  const candidateLabel = canonicalizeText(candidateNode.label);
  const candidateAssignment = canonicalizeText(candidateNode.assignment);

  return (
    Object.values(nodeMap).find((node) => {
      if (node.id === "start") {
        return false;
      }

      if (node.parentId !== candidateNode.parentId) {
        return false;
      }

      const sameLabel = canonicalizeText(node.label) === candidateLabel;
      const sameAssignment =
        candidateAssignment &&
        canonicalizeText(node.assignment) === candidateAssignment;

      return sameLabel || sameAssignment;
    })?.id ?? null
  );
}

function normalizeProposalList(rawProposals, nodeMap, committedNodeId = null) {
  const seen = new Set();

  return (Array.isArray(rawProposals) ? rawProposals : [])
    .map((proposal) => normalizeNodeForInsert(proposal, nodeMap, committedNodeId))
    .filter(Boolean)
    .filter((proposal) => {
      const signature = `${canonicalizeText(proposal.label)}|${canonicalizeText(proposal.assignment)}`;
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    })
    .slice(0, 3);
}

function extractJsonObject(text) {
  const source = String(text ?? "").trim();
  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : source;

  const firstBrace = candidate.indexOf("{");
  if (firstBrace === -1) {
    throw new Error("No JSON object found in model response.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return candidate.slice(firstBrace, index + 1);
      }
    }
  }

  throw new Error("Incomplete JSON object in model response.");
}

function parseModelJson(text) {
  return JSON.parse(extractJsonObject(text));
}

function normalizePatchedNode(nodeMap, currentNode, patch) {
  const nextNode = { ...currentNode, ...patch };

  if (nextNode.id === "start") {
    nextNode.parentId = null;
    nextNode.depth = 0;
  } else {
    const nextParentId =
      nextNode.parentId && nodeMap[nextNode.parentId] ? nextNode.parentId : currentNode.parentId;
    const parentDepth =
      nextParentId && nodeMap[nextParentId]
        ? getNodeDepth(nodeMap, nodeMap[nextParentId])
        : 0;

    nextNode.parentId = nextParentId ?? "start";
    nextNode.depth = Number.isFinite(nextNode.depth)
      ? Math.max(parentDepth + 1, nextNode.depth)
      : parentDepth + 1;
  }

  nextNode.label = String(nextNode.label ?? currentNode.label).trim() || currentNode.label;
  nextNode.assignment =
    String(nextNode.assignment ?? currentNode.assignment).trim() || currentNode.assignment;
  nextNode.tag =
    String(nextNode.tag ?? currentNode.tag).trim() ||
    (nextNode.depth <= 1 ? "Branch" : "Assignment");

  if ("reason" in patch) {
    nextNode.reason = normalizeReasons(patch.reason);
  }

  if ("whyThisFits" in patch) {
    nextNode.whyThisFits =
      String(patch.whyThisFits ?? "").trim() ||
      nextNode.whyThisFits ||
      nextNode.reason?.[0] ||
      "";
  }

  if ("impact" in patch) {
    nextNode.impact = normalizeImpact(patch.impact);
  }

  return nextNode;
}

function ensureAllPositions(nodeMap, positions) {
  const nextPositions = { ...(positions ?? {}) };
  const sortedIds = Object.values(nodeMap)
    .sort((a, b) => {
      const depthDiff = getNodeDepth(nodeMap, a) - getNodeDepth(nodeMap, b);
      return depthDiff !== 0 ? depthDiff : a.id.localeCompare(b.id);
    })
    .map((node) => node.id);

  sortedIds.forEach((id) => {
    if (!nextPositions[id]) {
      nextPositions[id] = getAutoPosition(nodeMap, nextPositions, id);
    } else {
      nextPositions[id] = {
        x: clamp(nextPositions[id].x ?? 50, 10, 90),
        y: clamp(nextPositions[id].y ?? 14, 10, 90),
      };
    }
  });

  return nextPositions;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, context } = req.body;

    const systemPrompt = `
You are BitBuddies, a learning behavior coach.
Be specific, concise, and actionable.
Use the provided context if available.
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt + JSON.stringify(context || {}) },
        ...messages,
      ],
      temperature: 0.3,
    });

    res.json({ reply: response.output_text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "chat_failed" });
  }
});

app.post("/api/detect-practice-subject", async (req, res) => {
  try {
    const { fileName, fileType, fileDataUrl, allowedSubjects } = req.body || {};

    const detection = await detectPracticeDocument({
      fileName: String(fileName || ""),
      fileType: String(fileType || ""),
      fileDataUrl: typeof fileDataUrl === "string" ? fileDataUrl : "",
      allowedSubjects: Array.isArray(allowedSubjects) ? allowedSubjects : [],
    });

    res.json(detection);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "practice_detection_failed" });
  }
});

async function fetchStudentContext(userId) {
  const snapshot = await db.collection("students").doc(userId).get();

  if (!snapshot.exists) {
    return null;
  }

  const student = snapshot.data();
  return {
    personaLabel: student?.persona?.primary?.label || student?.persona?.canonicalLabel?.label || "Unknown persona",
    personaSummary: student?.persona?.primary?.summary || student?.persona?.canonicalLabel?.summary || "",
    weakTopics: Array.isArray(student?.weakTopicSet) ? student.weakTopicSet.slice(0, 3) : [],
    behaviorConfidence: student?.persona?.behaviorConfidence || 0,
    subjectLabels: Array.isArray(student?.academicProfile?.subjects)
      ? student.academicProfile.subjects.map((subject) => subject.label).slice(0, 6)
      : [],
    latestPracticeAnalysis: student?.latestPracticeAnalysis || null,
  };
}

app.post("/api/tree-chat", async (req, res) => {
  try {
    const { userId, message } = req.body;
    console.log("userId received:", userId);
    const docRef = db.collection("userTrees").doc(userId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return res.status(400).json({ error: "Tree not found" });
    }

    const treeState = ensureTreeRoot(snapshot.data());
    const studentContext = await fetchStudentContext(userId);
    const trimmedMessage = String(message ?? "").trim();

    if (treeState.pendingProposals.length) {
      const chosenProposal = getProposalChoice(trimmedMessage, treeState.pendingProposals);

      if (chosenProposal) {
        const focusedTree = {
          ...treeState,
          pendingSelectedProposalId: chosenProposal.id,
        };

        await docRef.set({
          ...focusedTree,
          updatedAt: Date.now(),
        });

        return res.json({
          replyText: `You picked "${chosenProposal.label}". Should I add this plan to the tree path now? Reply with yes or no.`,
          newTreeState: focusedTree,
        });
      }

      if (isAffirmativeMessage(trimmedMessage)) {
        const selectedProposal =
          treeState.pendingProposals.find(
            (proposal) => proposal.id === treeState.pendingSelectedProposalId
          ) ?? null;

        if (!selectedProposal) {
          const optionsText = treeState.pendingProposals
            .map((proposal, index) => `${index + 1}. ${proposal.label}`)
            .join(" ");

          return res.json({
            replyText: `Pick which strategy you want first. Reply with a number or the exact label: ${optionsText}`,
            newTreeState: treeState,
          });
        }

        const proposedOperations = [selectedProposal].map((proposal) => ({
          op: "add_node",
          newNode: proposal,
        }));
        const nextSelectedId = selectedProposal.id;
        const updatedTree = applyOperations(
          {
            ...treeState,
            pendingProposals: [],
            pendingSelectedProposalId: null,
          },
          [
            ...proposedOperations,
            ...(nextSelectedId ? [{ op: "select_node", id: nextSelectedId }] : []),
          ]
        );

        await docRef.set({
          ...updatedTree,
          updatedAt: Date.now(),
        });

        return res.json({
          replyText: `Added "${selectedProposal.label}" to your study path. Tap any node to compare the plan, hear the sound, and switch the explanation panel.`,
          newTreeState: updatedTree,
        });
      }

      if (isNegativeMessage(trimmedMessage)) {
        const clearedTree = {
          ...treeState,
          pendingProposals: [],
          pendingSelectedProposalId: null,
        };

        await docRef.set({
          ...clearedTree,
          updatedAt: Date.now(),
        });

        return res.json({
          replyText:
            "Okay. Tell me what you want changed, and I will suggest a different study step before adding anything.",
          newTreeState: clearedTree,
        });
      }

      return res.json({
        replyText:
          "I still have suggested study plans waiting. First choose one by replying with its number or label, then reply with yes or no.",
        newTreeState: treeState,
      });
    }

    if (!isStudyRelatedMessage(trimmedMessage)) {
      return res.json({
        replyText:
          "I only add study-related plans. Tell me the subject, topic, weakness, or exam you want help with, and I will suggest strategies before adding anything.",
        newTreeState: treeState,
      });
    }

    const systemPrompt = `
You are BitBuddies.

The user is editing a study decision tree.
You do NOT add nodes directly. You only suggest 1 to 3 study plans based on the
student's latest message, then ask for confirmation.

Rules:
- If there is no committed node, every suggestion should sit directly under "start".
- If there is a committed node, every new suggestion should extend that committed node as the next step in the path.
- Suggest concrete study plans or strategies, not generic labels.
- Only suggest plans if the student's message clearly describes a study need, subject, exam, weak topic, or request for study strategies.
- Never propose generic filler like "choose a subject to study" or anything triggered by greetings alone.
- Keep each label short.
- Each assignment should clearly say what the student should do.
- Each reason list should explain why that plan fits the student's message, persona, recent weak areas, and the latest practice analysis if available.
- Include a short "whyThisFits" sentence that explains the strongest reason this activity was suggested.
- End the reply by asking whether the student wants you to add the suggestion(s) to the tree.
- Do not claim that the nodes were already added.

Return ONLY valid JSON:
{
  "replyText": "...",
  "proposals": [
    {
      "id": "short-lowercase-slug",
      "label": "...",
      "assignment": "...",
      "whyThisFits": "...",
      "reason": ["...", "..."],
      "impact": {
        "mastery": 0,
        "clarity": 0,
        "confidence": 0,
        "speed": 0,
        "readiness": 0
      }
    }
  ]
}

Do not include any explanation outside JSON.
`;

    const aiResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `
Student prompt: ${message}

Current selected node: ${treeState.selectedId || "none"}
Committed path parent: ${treeState.committedNodeId || "start"}
Student persona: ${studentContext?.personaLabel || "Unknown"}
Persona summary: ${studentContext?.personaSummary || "Unavailable"}
Weak topics: ${(studentContext?.weakTopics || []).join(", ") || "None recorded yet"}
Tracked subjects: ${(studentContext?.subjectLabels || []).join(", ") || "Unknown"}
Latest practice analysis summary: ${studentContext?.latestPracticeAnalysis?.summary || "None available"}
Latest practice document signals: ${(studentContext?.latestPracticeAnalysis?.documentSignals || []).join(" | ") || "None available"}
Latest practice recommended actions: ${(studentContext?.latestPracticeAnalysis?.recommendedActions || []).join(" | ") || "None available"}
Latest practice persona insights: ${(studentContext?.latestPracticeAnalysis?.personaPeerInsights || []).join(" | ") || "None available"}
Latest practice history recommendations: ${(studentContext?.latestPracticeAnalysis?.personalHistoryRecommendations || []).join(" | ") || "None available"}

Current tree:
${JSON.stringify(treeState.nodeMap)}
          `,
        },
      ],
    });

    const parsed = parseModelJson(aiResponse.output_text);
    const proposedNodes = normalizeProposalList(
      parsed.proposals,
      treeState.nodeMap,
      treeState.committedNodeId,
    );
    const duplicateSelections = proposedNodes
      .map((proposal) => findDuplicateNodeId(treeState.nodeMap, proposal))
      .filter(Boolean);

    if (!proposedNodes.length && duplicateSelections.length) {
      const selectedId = duplicateSelections[0];
      const updatedTree = {
        ...treeState,
        selectedId,
        pendingProposals: [],
      };

      await docRef.set({
        ...updatedTree,
        updatedAt: Date.now(),
      });

      return res.json({
        replyText:
          "That strategy is already on your first layer. I highlighted the closest existing node so you can compare it directly.",
        newTreeState: updatedTree,
      });
    }

    if (!proposedNodes.length) {
      return res.json({
        replyText:
          "I need a bit more study detail before I suggest a plan. Tell me the subject, the weak topic, or what kind of strategy you want.",
        newTreeState: {
          ...treeState,
          pendingProposals: [],
          pendingSelectedProposalId: null,
        },
      });
    }

    const updatedTree = {
      ...treeState,
      pendingProposals: proposedNodes,
      pendingSelectedProposalId: proposedNodes.length === 1 ? proposedNodes[0].id : null,
    };

    await docRef.set({
      ...updatedTree,
      updatedAt: Date.now(),
    });

    const fallbackReply =
      proposedNodes.length === 1
        ? `I suggest "${proposedNodes[0].label}". Reply with yes to add it to your study path, or no to reject it.`
        : "I have a few study path suggestions ready. Choose one by number or label before I add anything.";

    res.json({
      replyText: parsed.replyText || fallbackReply,
      newTreeState: updatedTree,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "tree_chat_failed" });
  }
});

function applyOperations(treeState, operations) {
  const baseTree = ensureTreeRoot(treeState);
  const newNodeMap = { ...(baseTree.nodeMap ?? {}) };
  let nextSelectedId =
    baseTree.selectedId && newNodeMap[baseTree.selectedId] ? baseTree.selectedId : null;

  for (const operation of Array.isArray(operations) ? operations : []) {
    if (!operation || typeof operation !== "object") continue;

    if (operation.op === "update_node") {
      if (!newNodeMap[operation.id] || !operation.patch || typeof operation.patch !== "object") {
        continue;
      }

      newNodeMap[operation.id] = normalizePatchedNode(
        newNodeMap,
        newNodeMap[operation.id],
        operation.patch
      );
      continue;
    }

    if (operation.op === "add_node") {
      if (Object.keys(newNodeMap).length >= MAX_TREE_NODES) {
        continue;
      }

      const nextNode = normalizeNodeForInsert(
        operation.newNode,
        newNodeMap,
        baseTree.committedNodeId,
      );
      if (!nextNode || newNodeMap[nextNode.id]) {
        continue;
      }

      const duplicateNodeId = findDuplicateNodeId(newNodeMap, nextNode);
      if (duplicateNodeId) {
        nextSelectedId = duplicateNodeId;
        continue;
      }

      newNodeMap[nextNode.id] = nextNode;
      continue;
    }

    if (operation.op === "select_node" && newNodeMap[operation.id]) {
      nextSelectedId = operation.id;
    }
  }

  const newPositions = ensureAllPositions(newNodeMap, baseTree.positions);

  if (!newNodeMap[nextSelectedId] || nextSelectedId === "start") {
    nextSelectedId = Object.keys(newNodeMap).find((id) => id !== "start") ?? null;
  }

  return {
    ...baseTree,
    nodeMap: newNodeMap,
    positions: newPositions,
    selectedId: nextSelectedId,
  };
}

app.listen(3001, () => {
  console.log("Chat API running on http://localhost:3001");
});
