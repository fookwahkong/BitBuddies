import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "../firebaseConfig.js";
import { chatStyles, styles } from "./toDoPageStyles.js";

const metrics = [
  { key: "mastery", label: "Mastery" },
  { key: "clarity", label: "Clarity" },
  { key: "confidence", label: "Confidence" },
  { key: "speed", label: "Speed" },
  { key: "readiness", label: "Readiness" },
];

const currentState = {
  mastery: 54,
  clarity: 48,
  confidence: 62,
  speed: 44,
  readiness: 51,
};

const DEFAULT_NODE_MAP = {
  start: {
    id: "start",
    label: "Start point",
    parentId: null,
    depth: 0,
    tag: "Anchor",
    assignment: "Choose one path to shape the next study session.",
    reason: [
      "Possible Worlds lets the learner compare paths before committing.",
      "Each node explains what the assignment does and why it matters.",
      "Dragging the bubbles lets the student physically arrange the plan.",
    ],
    impact: { mastery: 0, clarity: 0, confidence: 0, speed: 0, readiness: 0 },
  },
  review: {
    id: "review",
    label: "Review the weak step",
    parentId: "start",
    depth: 1,
    tag: "Branch A",
    assignment:
      "Open worked examples and isolate the exact step that keeps breaking.",
    reason: [
      "Best when the student is making the same mistake repeatedly.",
      "Reduces confusion before they move into harder timed work.",
      "Good reset path when confidence is higher than actual accuracy.",
    ],
    impact: { mastery: 10, clarity: 16, confidence: -4, speed: 4, readiness: 8 },
  },
  stretch: {
    id: "stretch",
    label: "Push into harder practice",
    parentId: "start",
    depth: 1,
    tag: "Branch B",
    assignment:
      "Skip the safe questions and jump straight into high-demand exam tasks.",
    reason: [
      "Useful when the student already understands the concept but needs pressure.",
      "Improves exam readiness by exposing harder mark schemes earlier.",
      "Works well if time is limited and easy marks are already stable.",
    ],
    impact: { mastery: 8, clarity: 4, confidence: -2, speed: 10, readiness: 15 },
  },
  flashcards: {
    id: "flashcards",
    label: "Make recall cards",
    parentId: "review",
    depth: 2,
    tag: "Assignment",
    assignment:
      "Turn formulas, definitions, or common mistakes into short active-recall cards.",
    reason: [
      "Good for content that must be remembered exactly.",
      "Builds retention without overwhelming the student.",
      "Creates a reusable revision asset for later sessions.",
    ],
    impact: { mastery: 7, clarity: 8, confidence: 4, speed: 2, readiness: 6 },
  },
  teach: {
    id: "teach",
    label: "Explain it out loud",
    parentId: "review",
    depth: 2,
    tag: "Assignment",
    assignment:
      "Have the learner teach the method to a friend, camera, or empty room in one take.",
    reason: [
      "Exposes missing logic faster than silent review.",
      "Improves explanation quality for show-your-working questions.",
      "Strong choice when understanding exists but language is weak.",
    ],
    impact: { mastery: 9, clarity: 14, confidence: 3, speed: 1, readiness: 9 },
  },
  quiz: {
    id: "quiz",
    label: "Timed mini quiz",
    parentId: "stretch",
    depth: 2,
    tag: "Assignment",
    assignment: "Run a short timer and answer 4 to 5 mixed questions with no notes.",
    reason: [
      "Makes weak spots visible under pressure.",
      "Raises pace and decision speed without a full mock paper.",
      "Useful before a longer homework or practice block.",
    ],
    impact: { mastery: 6, clarity: 3, confidence: -1, speed: 12, readiness: 13 },
  },
  drill: {
    id: "drill",
    label: "Exam-style drill",
    parentId: "stretch",
    depth: 2,
    tag: "Assignment",
    assignment:
      "Do one multi-step exam question, then mark it immediately using the rubric.",
    reason: [
      "Closest match to the real assessment context.",
      "Improves mark conversion, not just topic familiarity.",
      "Best when the learner needs realistic rehearsal instead of more theory.",
    ],
    impact: { mastery: 11, clarity: 5, confidence: -2, speed: 8, readiness: 17 },
  },
};

const DEFAULT_POSITIONS = {
  start: { x: 50, y: 14 },
  review: { x: 30, y: 42 },
  stretch: { x: 70, y: 42 },
  flashcards: { x: 18, y: 74 },
  teach: { x: 42, y: 74 },
  quiz: { x: 60, y: 74 },
  drill: { x: 82, y: 74 },
};

const STARTER_MESSAGES = [
  {
    role: "assistant",
    content:
      "Hi! I'm your study buddy. Ask me anything about your revision plan, or tell me how your last session went.",
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePosition(position, fallback) {
  return {
    x: clamp(position?.x ?? fallback.x, 10, 90),
    y: clamp(position?.y ?? fallback.y, 10, 90),
  };
}

function normalizeNode(nodeMap, node) {
  const fallback = nodeMap?.start ?? DEFAULT_NODE_MAP.start;
  const rawNode = node && typeof node === "object" ? node : fallback;

  return {
    ...fallback,
    ...rawNode,
    reason: Array.isArray(rawNode.reason) ? rawNode.reason : fallback.reason,
    impact:
      rawNode.impact && typeof rawNode.impact === "object"
        ? rawNode.impact
        : fallback.impact,
  };
}

function getPathIds(nodeMap, targetId) {
  const path = new Set();
  let cursor = targetId;

  while (cursor && nodeMap?.[cursor]) {
    path.add(cursor);
    cursor = nodeMap[cursor].parentId;
  }

  return path;
}

function buildProjectedState(node) {
  const impact = node?.impact ?? {};

  return metrics.reduce((acc, metric) => {
    acc[metric.key] = clamp(currentState[metric.key] + (impact[metric.key] ?? 0), 0, 100);
    return acc;
  }, {});
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

function getAutoPosition(nodeMap, positionMap, node) {
  if (!node?.parentId) return DEFAULT_POSITIONS.start;

  const parentPosition =
    positionMap[node.parentId] ??
    DEFAULT_POSITIONS[node.parentId] ??
    DEFAULT_POSITIONS.start;
  const siblingIds = getSiblingIds(nodeMap, node.parentId);
  const siblingIndex = Math.max(0, siblingIds.indexOf(node.id));
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

  return { x, y };
}

function buildPositionMap(nodeMap, positions) {
  const resolvedPositions = {};
  const nodesByDepth = Object.values(nodeMap).sort((a, b) => {
    const depthDiff = getNodeDepth(nodeMap, a) - getNodeDepth(nodeMap, b);
    return depthDiff !== 0 ? depthDiff : a.id.localeCompare(b.id);
  });

  nodesByDepth.forEach((node) => {
    const fallback =
      DEFAULT_POSITIONS[node.id] ?? getAutoPosition(nodeMap, resolvedPositions, node);
    resolvedPositions[node.id] = normalizePosition(positions?.[node.id], fallback);
  });

  return resolvedPositions;
}

function RadarChart({ values }) {
  const center = 96;
  const radius = 62;
  const rings = [20, 40, 60, 80, 100];

  const points = metrics.map((metric, index) => {
    const angle = ((Math.PI * 2) / metrics.length) * index - Math.PI / 2;
    return {
      ...metric,
      angle,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });

  const polygon = points
    .map((point) => {
      const valueRadius = (values[point.key] / 100) * radius;
      return `${center + Math.cos(point.angle) * valueRadius},${
        center + Math.sin(point.angle) * valueRadius
      }`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 192 192"
      style={{ width: "100%", height: "100%" }}
      role="img"
      aria-label="Projected radar chart"
    >
      {rings.map((ring) => {
        const ringPoints = points
          .map((point) => {
            const ringRadius = (ring / 100) * radius;
            return `${center + Math.cos(point.angle) * ringRadius},${
              center + Math.sin(point.angle) * ringRadius
            }`;
          })
          .join(" ");

        return (
          <polygon
            key={ring}
            points={ringPoints}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.8"
          />
        );
      })}

      {points.map((point) => (
        <line
          key={point.key}
          x1={center}
          y1={center}
          x2={point.x}
          y2={point.y}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.8"
        />
      ))}

      <polygon
        points={polygon}
        fill="rgba(99,179,237,0.18)"
        stroke="#63b3ed"
        strokeWidth="1.5"
      />

      {points.map((point) => {
        const valueRadius = (values[point.key] / 100) * radius;
        const x = center + Math.cos(point.angle) * valueRadius;
        const y = center + Math.sin(point.angle) * valueRadius;
        return <circle key={point.key} cx={x} cy={y} r="3.5" fill="#63b3ed" />;
      })}

      {points.map((point) => {
        const labelRadius = radius + 17;
        const x = center + Math.cos(point.angle) * labelRadius;
        const y = center + Math.sin(point.angle) * labelRadius;

        return (
          <text
            key={`${point.key}-label`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="8"
            fill="rgba(255,255,255,0.55)"
            fontFamily="inherit"
          >
            {point.label}
          </text>
        );
      })}
    </svg>
  );
}

function PossibleWorldsMap({
  nodeMap,
  positions,
  selectedId,
  setPositions,
  setSelectedId,
}) {
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const sceneRef = useRef(null);
  const dragRef = useRef(null);
  const audioCtxRef = useRef(null);

  const edges = useMemo(() => {
    return Object.values(nodeMap)
      .filter((node) => node.parentId)
      .map((node) => ({
        id: `${node.parentId}-${node.id}`,
        from: node.parentId,
        to: node.id,
      }));
  }, [nodeMap]);

  const safePositions = useMemo(() => buildPositionMap(nodeMap, positions), [nodeMap, positions]);

  const nodes = useMemo(() => {
    return Object.values(nodeMap).map((node) => ({
      ...normalizeNode(nodeMap, node),
      position: safePositions[node.id] ?? DEFAULT_POSITIONS.start,
    }));
  }, [nodeMap, safePositions]);

  useEffect(() => {
    if (!nodeMap[selectedId]) {
      setSelectedId(nodeMap.teach ? "teach" : "start");
    }
  }, [nodeMap, selectedId, setSelectedId]);

  useEffect(() => {
    const missingIds = Object.keys(safePositions).filter((id) => !positions?.[id]);
    if (!missingIds.length) return;

    setPositions((current) => {
      const next = { ...(current ?? {}) };
      let changed = false;

      missingIds.forEach((id) => {
        if (!next[id] && safePositions[id]) {
          next[id] = safePositions[id];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [positions, safePositions, setPositions]);

  const selectedNode = useMemo(() => {
    const fallbackId = nodeMap[selectedId] ? selectedId : nodeMap.teach ? "teach" : "start";
    return normalizeNode(nodeMap, nodeMap[fallbackId]);
  }, [nodeMap, selectedId]);

  const projectedState = useMemo(() => buildProjectedState(selectedNode), [selectedNode]);
  const activePath = useMemo(
    () => getPathIds(nodeMap, selectedNode.id),
    [nodeMap, selectedNode.id]
  );

  function playTone() {
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextCtor();
      }

      const context = audioCtxRef.current;
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }

      const now = context.currentTime;

      [268, 402].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02 + index * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22 + index * 0.04);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + index * 0.03);
        oscillator.stop(now + 0.26 + index * 0.04);
      });
    } catch (error) {
      // Ignore audio errors in unsupported browsers.
    }
  }

  function selectNode(id) {
    if (!nodeMap[id]) return;
    setSelectedId(id);
    playTone();
  }

  useEffect(() => {
    function onMove(event) {
      if (!dragRef.current || !sceneRef.current) return;

      const dragState = dragRef.current;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragState.moved = true;
      }

      const rect = sceneRef.current.getBoundingClientRect();
      const nextX = clamp(((event.clientX - rect.left) / rect.width) * 100, 10, 90);
      const nextY = clamp(((event.clientY - rect.top) / rect.height) * 100, 10, 90);

      setPositions((current) => ({
        ...(current ?? {}),
        [dragState.id]: { x: nextX, y: nextY },
      }));
    }

    function onUp() {
      if (!dragRef.current) return;

      const { id, moved } = dragRef.current;
      dragRef.current = null;

      if (!moved) {
        selectNode(id);
      }
    }

    function resetDrag() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("blur", resetDrag);
    document.addEventListener("visibilitychange", resetDrag);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", resetDrag);
      document.removeEventListener("visibilitychange", resetDrag);
    };
  }, [setPositions]);

  return (
    <div style={styles.mapSection}>
      <div style={styles.mapHeader}>
        <span style={styles.eyebrow}>Interactive assignment map</span>
        <h2 style={styles.mapTitle}>Possible Worlds</h2>
        <p style={styles.mapSubtitle}>
          Tap a bubble to select an assignment path. Drag any bubble except the
          anchor to rearrange. Student prompts can now add new branches or leaf
          options without replacing the whole tree.
        </p>
      </div>

      <div style={styles.boardWrap} ref={sceneRef}>
        <svg
          viewBox="0 0 100 100"
          style={styles.branchSvg}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {edges.map((edge) => {
            const from = safePositions[edge.from];
            const to = safePositions[edge.to];
            if (!from || !to) return null;

            const isActive = activePath.has(edge.from) && activePath.has(edge.to);

            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={isActive ? "#63b3ed" : "rgba(255,255,255,0.12)"}
                strokeWidth={isActive ? "0.7" : "0.4"}
                style={{
                  filter: isActive ? "drop-shadow(0 0 3px #63b3ed)" : undefined,
                  transition: "stroke 0.3s, stroke-width 0.3s",
                }}
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const isSelected = node.id === selectedNode.id;
          const isRoot = node.id === "start";
          const inPath = activePath.has(node.id);

          return (
            <button
              key={node.id}
              type="button"
              style={{
                ...styles.node,
                left: `${node.position.x}%`,
                top: `${node.position.y}%`,
                background: isSelected
                  ? "linear-gradient(135deg,#2b6cb0,#63b3ed)"
                  : inPath
                  ? "rgba(99,179,237,0.18)"
                  : "rgba(255,255,255,0.06)",
                border: isSelected
                  ? "1.5px solid #63b3ed"
                  : inPath
                  ? "1.5px solid rgba(99,179,237,0.5)"
                  : "1.5px solid rgba(255,255,255,0.12)",
                boxShadow: isSelected
                  ? "0 0 18px rgba(99,179,237,0.45), 0 4px 16px rgba(0,0,0,0.4)"
                  : "0 2px 8px rgba(0,0,0,0.3)",
                cursor: isRoot ? "default" : "grab",
                transform: isSelected
                  ? "translate(-50%,-50%) scale(1.06)"
                  : "translate(-50%,-50%)",
              }}
              onPointerDown={(event) => {
                if (isRoot) return;

                event.currentTarget.setPointerCapture?.(event.pointerId);
                dragRef.current = {
                  id: node.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  moved: false,
                };
              }}
              onClick={() => {
                if (isRoot) {
                  selectNode(node.id);
                }
              }}
            >
              <span style={styles.nodeTag}>{node.tag}</span>
              <strong style={styles.nodeLabel}>{node.label}</strong>
            </button>
          );
        })}

        <div
          style={{
            ...styles.drawer,
            ...(drawerExpanded ? styles.drawerExpanded : {}),
          }}
          onClick={() => {
            if (!drawerExpanded) {
              setDrawerExpanded(true);
            }
          }}
        >
          <div style={styles.drawerHeader}>
            <div>
              <span style={styles.eyebrow}>Selected world</span>
              <h3 style={styles.drawerTitle}>{selectedNode.label}</h3>
            </div>
            <button
              type="button"
              style={styles.drawerToggle}
              onClick={(event) => {
                event.stopPropagation();
                setDrawerExpanded((current) => !current);
              }}
            >
              {drawerExpanded ? "Minimize" : "Expand"}
            </button>
          </div>

          <div
            style={{
              ...styles.drawerBody,
              ...(drawerExpanded ? styles.drawerBodyExpanded : {}),
            }}
          >
            <p style={styles.drawerAssignment}>{selectedNode.assignment}</p>

            <div style={styles.radarWrap}>
              <RadarChart values={projectedState} />
            </div>

            <div style={styles.metricGrid}>
              {metrics.map((metric) => (
                <div key={metric.key} style={styles.metricCard}>
                  <span style={styles.metricLabel}>{metric.label}</span>
                  <strong style={styles.metricValue}>
                    {projectedState[metric.key]}
                  </strong>
                </div>
              ))}
            </div>

            {drawerExpanded ? (
              <div style={styles.expandedCopy}>
                <div>
                  <h4 style={styles.expandedHeading}>Why this choice</h4>
                  <ul style={styles.expandedList}>
                    {selectedNode.reason.map((item) => (
                      <li key={item} style={styles.expandedItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 style={styles.expandedHeading}>What changes</h4>
                  <p style={styles.expandedText}>
                    This path shifts the learner from the current baseline into a
                    new possible world with a stronger emphasis on{" "}
                    {selectedNode.depth >= 2
                      ? "a concrete assignment"
                      : "a direction choice"}
                    .
                  </p>
                </div>
              </div>
            ) : (
              <p style={styles.drawerHint}>
                Press this card to open the full explanation and radar details.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentPrompt({
  user,
  setNodeMapState,
  setPositionsState,
  setSelectedIdState,
}) {
  const [messages, setMessages] = useState(STARTER_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:3001/api/tree-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          message: text,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error("Chat request failed");

      if (data.newTreeState) {
        if (data.newTreeState.nodeMap) {
          setNodeMapState(data.newTreeState.nodeMap);
        }
        if (data.newTreeState.positions) {
          setPositionsState(data.newTreeState.positions);
        }
        if (data.newTreeState.selectedId) {
          setSelectedIdState(data.newTreeState.selectedId);
        }
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.replyText,
        },
      ]);
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            "I couldn't reach the chat server. Make sure `node server.js` is running and check Terminal logs.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={chatStyles.wrap}>
      <div style={chatStyles.header}>
        <span style={chatStyles.eyebrow}>Student Prompt</span>
        <h2 style={chatStyles.title}>Ask your study buddy</h2>
        <p style={chatStyles.subtitle}>
          Ask a question, describe what is confusing, or say how your last
          session went.
        </p>
      </div>

      <div style={chatStyles.feed}>
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              ...chatStyles.bubble,
              ...(message.role === "user"
                ? chatStyles.bubbleUser
                : chatStyles.bubbleBot),
            }}
          >
            {message.role === "assistant" && <span style={chatStyles.avatar}>B</span>}
            <p style={chatStyles.bubbleText}>{message.content}</p>
          </div>
        ))}

        {loading && (
          <div style={{ ...chatStyles.bubble, ...chatStyles.bubbleBot }}>
            <span style={chatStyles.avatar}>B</span>
            <p style={{ ...chatStyles.bubbleText, ...chatStyles.typing }}>
              <span style={chatStyles.dot} />
              <span style={{ ...chatStyles.dot, animationDelay: "0.18s" }} />
              <span style={{ ...chatStyles.dot, animationDelay: "0.36s" }} />
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={chatStyles.inputRow}>
        <textarea
          rows={1}
          style={chatStyles.textarea}
          placeholder="Type your question..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          type="button"
          style={{
            ...chatStyles.sendBtn,
            opacity: input.trim() ? 1 : 0.4,
          }}
          onClick={handleSend}
          disabled={!input.trim() || loading}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default function ToDoPage({ user, onBackHome }) {
  const [nodeMapState, setNodeMapState] = useState(DEFAULT_NODE_MAP);
  const [positionsState, setPositionsState] = useState(DEFAULT_POSITIONS);
  const [selectedIdState, setSelectedIdState] = useState("teach");

  useEffect(() => {
    async function loadTree() {
      if (!user?.uid) return;

      const docRef = doc(db, "userTrees", user.uid);
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.nodeMap) setNodeMapState(data.nodeMap);
        if (data.positions) setPositionsState(data.positions);
        if (data.selectedId) setSelectedIdState(data.selectedId);
        return;
      }

      await setDoc(docRef, {
        nodeMap: DEFAULT_NODE_MAP,
        positions: DEFAULT_POSITIONS,
        selectedId: "teach",
        updatedAt: Date.now(),
      });
    }

    loadTree();
  }, [user?.uid]);

  useEffect(() => {
    async function saveTree() {
      if (!user?.uid) return;

      const docRef = doc(db, "userTrees", user.uid);

      await setDoc(docRef, {
        nodeMap: nodeMapState,
        positions: positionsState,
        selectedId: selectedIdState,
        updatedAt: Date.now(),
      });
    }

    saveTree();
  }, [nodeMapState, positionsState, selectedIdState, user?.uid]);

  return (
    <main className="screen-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">ToDo Page</p>
          <p className="hero-kicker">{user?.name}</p>
          <h1>Your recommended revision tasks are organized here.</h1>
          <p className="hero-text">
            This page turns the BitBuddies recommendation into a concrete task
            list. Start with the highest impact task first, then move down in
            order.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">Current persona</span>
            <strong>{user?.persona?.label}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Logged events</span>
            <strong>{user.learningRadar?.meta?.totalEvents || 0}</strong>
          </div>
          <div className="stat-card stat-card-highlight">
            <span className="stat-label">Goal</span>
            <strong>
              Convert the next best move into short, trackable actions.
            </strong>
          </div>
        </div>
      </section>

      <section className="student-card">
        <PossibleWorldsMap
          nodeMap={nodeMapState}
          positions={positionsState}
          selectedId={selectedIdState}
          setPositions={setPositionsState}
          setSelectedId={setSelectedIdState}
        />

        <StudentPrompt
          user={user}
          setNodeMapState={setNodeMapState}
          setPositionsState={setPositionsState}
          setSelectedIdState={setSelectedIdState}
        />

        <button
          className="primary-button todo-back-button"
          type="button"
          onClick={onBackHome}
        >
          Return to homepage
        </button>
      </section>
    </main>
  );
}
