import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json" with { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
- Each reason list should explain why that plan fits the student's message, persona, and recent weak areas.
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
