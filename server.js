import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

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
} catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed" });
}
});

app.post("/api/tree-chat", async (req, res) => {
    try {
    const { userId, message } = req.body;

      // 1️⃣ Load tree from Firestore
    const docRef = db.collection("userTrees").doc(userId);
    const snap = await docRef.get();

    if (!snap.exists) {
        return res.status(400).json({ error: "Tree not found" });
}

const treeState = snap.data();

      // 2️⃣ Call OpenAI to produce JSON operations
const systemPrompt = `
You are BitBuddies.

The user can modify a study tree.

Return ONLY valid JSON:
{
    "replyText": "...",
    "operations": [ ... ]
}

Allowed operations:
- update_node
- add_node
- select_node

Do not explain outside JSON.
`;

    const aiResponse = await client.responses.create({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        input: [
        { role: "system", content: systemPrompt },
        {
            role: "user",
            content: `
User message: ${message}

Current tree:
${JSON.stringify(treeState.nodeMap)}
        `,
        },
    ],
    });


    const outputText = aiResponse.output_text;

    const parsed = JSON.parse(outputText);

      // 3️⃣ Apply operations safely
    const updatedTree = applyOperations(treeState, parsed.operations);

      // 4️⃣ Save updated tree
    await docRef.set({
        ...updatedTree,
        updatedAt: Date.now(),
    });

      // 5️⃣ Return to frontend
    res.json({
        replyText: parsed.replyText,
        newTreeState: updatedTree,
    });
    } catch (err) {
    console.error(err);
    res.status(500).json({ error: "tree_chat_failed" });
    }
});

function applyOperations(treeState, operations) {
    const newNodeMap = { ...treeState.nodeMap };

    for (const op of operations) {
    if (op.op === "update_node") {
        if (!newNodeMap[op.id]) continue;

        newNodeMap[op.id] = {
    ...newNodeMap[op.id],
    ...op.patch,
        };
    }

    if (op.op === "add_node") {
        const newNode = op.newNode;
        if (!newNode?.id) continue;
        if (newNodeMap[newNode.id]) continue;

        newNodeMap[newNode.id] = newNode;
    }

    if (op.op === "select_node") {
        treeState.selectedId = op.id;
    }
    }

    return {
    ...treeState,
    nodeMap: newNodeMap,
    };
}

app.listen(3001, () => {
console.log("Chat API running on http://localhost:3001");
});