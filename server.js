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

function normalizeNodeForInsert(rawNode, nodeMap) {
  const id = String(rawNode?.id ?? "").trim();
  if (!id || id === "start") return null;

  const parentId = rawNode?.parentId && nodeMap[rawNode.parentId] ? rawNode.parentId : "start";
  const parentDepth = nodeMap[parentId] ? getNodeDepth(nodeMap, nodeMap[parentId]) : 0;
  const requestedDepth = Number(rawNode?.depth);
  const depth = Number.isFinite(requestedDepth)
    ? Math.max(parentDepth + 1, requestedDepth)
    : parentDepth + 1;

  return {
    id,
    label: String(rawNode?.label ?? "New option").trim() || "New option",
    parentId,
    depth,
    tag:
      String(rawNode?.tag ?? "").trim() ||
      (depth <= 1 ? "Branch" : "Assignment"),
    assignment:
      String(rawNode?.assignment ?? "").trim() ||
      "Generated from the student's latest prompt.",
    reason: normalizeReasons(rawNode?.reason),
    impact: normalizeImpact(rawNode?.impact),
  };
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

app.post("/api/tree-chat", async (req, res) => {
  try {
    const { userId, message } = req.body;
    console.log("userId received:", userId);
    const docRef = db.collection("userTrees").doc(userId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return res.status(400).json({ error: "Tree not found" });
    }

    const treeState = snapshot.data();

    const systemPrompt = `
You are BitBuddies.

The user is editing an existing study decision tree. Keep the current tree and
adjust it incrementally based on the student's latest prompt.

Rules:
- Do not regenerate the whole tree.
- Prefer updating the most relevant existing node or adding 1 to 2 new options.
- New options may be new top-level branches from "start" or new leaf nodes under an existing branch.
- Never remove nodes.
- Keep the full tree under ${MAX_TREE_NODES} total nodes.
- Use "select_node" to highlight the best next option for the student.

Return ONLY valid JSON:
{
  "replyText": "...",
  "operations": [ ... ]
}

Allowed operations:
- update_node
- add_node
- select_node

For add_node, use:
{
  "op": "add_node",
  "newNode": {
    "id": "short-lowercase-slug",
    "label": "...",
    "parentId": "existing-node-id",
    "depth": 1,
    "tag": "Branch or Assignment",
    "assignment": "...",
    "reason": ["...", "..."],
    "impact": {
      "mastery": 0,
      "clarity": 0,
      "confidence": 0,
      "speed": 0,
      "readiness": 0
    }
  }
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

Current selected node: ${treeState.selectedId || "teach"}

Current tree:
${JSON.stringify(treeState.nodeMap)}
          `,
        },
      ],
    });

    const parsed = JSON.parse(aiResponse.output_text);
    const updatedTree = applyOperations(treeState, parsed.operations);

    await docRef.set({
      ...updatedTree,
      updatedAt: Date.now(),
    });

    res.json({
      replyText: parsed.replyText,
      newTreeState: updatedTree,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "tree_chat_failed" });
  }
});

function applyOperations(treeState, operations) {
  const newNodeMap = { ...(treeState.nodeMap ?? {}) };
  let nextSelectedId =
    treeState.selectedId && newNodeMap[treeState.selectedId]
      ? treeState.selectedId
      : newNodeMap.teach
      ? "teach"
      : "start";

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

      const nextNode = normalizeNodeForInsert(operation.newNode, newNodeMap);
      if (!nextNode || newNodeMap[nextNode.id]) {
        continue;
      }

      newNodeMap[nextNode.id] = nextNode;
      continue;
    }

    if (operation.op === "select_node" && newNodeMap[operation.id]) {
      nextSelectedId = operation.id;
    }
  }

  const newPositions = ensureAllPositions(newNodeMap, treeState.positions);

  if (!newNodeMap[nextSelectedId]) {
    nextSelectedId = newNodeMap.teach ? "teach" : "start";
  }

  return {
    ...treeState,
    nodeMap: newNodeMap,
    positions: newPositions,
    selectedId: nextSelectedId,
  };
}

app.listen(3001, () => {
  console.log("Chat API running on http://localhost:3001");
});
