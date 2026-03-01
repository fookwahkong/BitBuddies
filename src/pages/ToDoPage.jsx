import React, {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {doc, getDoc, setDoc} from "firebase/firestore";
import {db} from "../firebaseConfig.js"

// ─── Data ────────────────────────────────────────────────────────────────────

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

const edges = Object.values(DEFAULT_NODE_MAP)
  .filter((n) => n.parentId)
  .map((n) => ({ id: `${n.parentId}-${n.id}`, from: n.parentId, to: n.id }));

const DEFAULT_POSITIONS = {
  start: { x: 50, y: 14 },
  review: { x: 30, y: 42 },
  stretch: { x: 70, y: 42 },
  flashcards: { x: 18, y: 74 },
  teach: { x: 42, y: 74 },
  quiz: { x: 60, y: 74 },
  drill: { x: 82, y: 74 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function normalizePosition(pos, fallback) {
  return {
    x: clamp(pos?.x ?? fallback.x, 10, 90),
    y: clamp(pos?.y ?? fallback.y, 10, 90),
  };
}

function normalizeNode(nodeMap, node) {
  const fb = nodeMap?.start ?? DEFAULT_NODE_MAP.start;
  const r = node && typeof node === "object" ? node : fb;
  return {
    ...fb,
    ...r,
    reason: Array.isArray(r.reason) ? r.reason : fb.reason,
    impact: r.impact && typeof r.impact === "object" ? r.impact : fb.impact,
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
  return metrics.reduce((acc, m) => {
    acc[m.key] = clamp(currentState[m.key] + (impact[m.key] ?? 0), 0, 100);
    return acc;
  }, {});
}


// ─── Radar Chart ─────────────────────────────────────────────────────────────

function RadarChart({ values }) {
  const center = 96;
  const radius = 62;
  const rings = [20, 40, 60, 80, 100];

  const points = metrics.map((metric, i) => {
    const angle = ((Math.PI * 2) / metrics.length) * i - Math.PI / 2;
    return {
      ...metric,
      angle,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });

  const polygon = points
    .map((p) => {
      const vr = (values[p.key] / 100) * radius;
      return `${center + Math.cos(p.angle) * vr},${center + Math.sin(p.angle) * vr}`;
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
        const rp = points
          .map((p) => {
            const rr = (ring / 100) * radius;
            return `${center + Math.cos(p.angle) * rr},${center + Math.sin(p.angle) * rr}`;
          })
          .join(" ");
        return (
          <polygon
            key={ring}
            points={rp}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.8"
          />
        );
      })}
      {points.map((p) => (
        <line
          key={p.key}
          x1={center}
          y1={center}
          x2={p.x}
          y2={p.y}
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
      {points.map((p) => {
        const vr = (values[p.key] / 100) * radius;
        const x = center + Math.cos(p.angle) * vr;
        const y = center + Math.sin(p.angle) * vr;
        return (
          <circle key={p.key} cx={x} cy={y} r="3.5" fill="#63b3ed" />
        );
      })}
      {points.map((p) => {
        const lr = radius + 17;
        const x = center + Math.cos(p.angle) * lr;
        const y = center + Math.sin(p.angle) * lr;
        return (
          <text
            key={`${p.key}-label`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="8"
            fill="rgba(255,255,255,0.55)"
            fontFamily="inherit"
          >
            {p.label}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Possible Worlds Map Section ─────────────────────────────────────────────

function PossibleWorldsMap({nodeMap, setNodeMap, positions, setPositions}) {
  const [selectedId, setSelectedId] = useState("teach");
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const sceneRef = useRef(null);
  const dragRef = useRef(null);
  const audioCtxRef = useRef(null);

  const edges = useMemo(() => {
    return Object.values(nodeMap)
      .filter((n) => n.parentId)
      .map((n) => ({ id: `${n.parentId}-${n.id}`, from: n.parentId, to: n.id }));
  }, [nodeMap]);

  const safePositions = useMemo(() => {
    return Object.keys(DEFAULT_POSITIONS).reduce((acc, key) => {
      acc[key] = normalizePosition(positions[key], DEFAULT_POSITIONS[key]);
      return acc;
    }, {});
  }, [positions]);

  const nodes = useMemo(() => {
    return Object.values(nodeMap).map((node) => ({
      ...normalizeNode(nodeMap, node),
      position: safePositions[node.id] ?? DEFAULT_POSITIONS.start,
    }));
  }, [safePositions, nodeMap]);

  const selectedNode = useMemo(
    () => normalizeNode(nodeMap, nodeMap[selectedId]),
    [selectedId, nodeMap]
  );
  const projectedState = useMemo(
    () => buildProjectedState(selectedNode),
    [selectedNode]
  );
  const activePath = useMemo(
    () => getPathIds(nodeMap, selectedNode.id),
    [selectedNode.id, nodeMap]
  );

  function playTone() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      [268, 402].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02 + i * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22 + i * 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.03);
        osc.stop(now + 0.26 + i * 0.04);
      });
    } catch (e) {
      /* silent */
    }
  }

  function selectNode(id) {
    if (!nodeMap[id]) return;
    setSelectedId(id);
    playTone();
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current || !sceneRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
      const rect = sceneRef.current.getBoundingClientRect();
      const nx = clamp(((e.clientX - rect.left) / rect.width) * 100, 10, 90);
      const ny = clamp(((e.clientY - rect.top) / rect.height) * 100, 10, 90);
      setPositions((cur) => {
        const ds = dragRef.current;
        if (!ds || !DEFAULT_POSITIONS[ds.id]) return cur;
        return { ...cur, [ds.id]: { x: nx, y: ny } };
      });
    }
    function onUp() {
      if (!dragRef.current) return;
      const { id, moved } = dragRef.current;
      dragRef.current = null;
      if (!moved) selectNode(id);
    }
    function reset() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);

  return (
    <div style={styles.mapSection}>
      {/* Header */}
      <div style={styles.mapHeader}>
        <span style={styles.eyebrow}>Interactive assignment map</span>
        <h2 style={styles.mapTitle}>Possible Worlds</h2>
        <p style={styles.mapSubtitle}>
          Tap a bubble to select an assignment path. Drag any bubble (except the
          anchor) to rearrange. The active branch lights up and the detail panel
          updates below.
        </p>
      </div>

      {/* Board */}
      <div style={styles.boardWrap} ref={sceneRef}>
        {/* SVG branch lines */}
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
            const active =
              activePath.has(edge.from) && activePath.has(edge.to);
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={active ? "#63b3ed" : "rgba(255,255,255,0.12)"}
                strokeWidth={active ? "0.7" : "0.4"}
                style={{
                  filter: active
                    ? "drop-shadow(0 0 3px #63b3ed)"
                    : undefined,
                  transition: "stroke 0.3s, stroke-width 0.3s",
                }}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const isSelected = node.id === selectedId;
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
                transform: isSelected ? "translate(-50%,-50%) scale(1.06)" : "translate(-50%,-50%)",
              }}
              onPointerDown={(e) => {
                if (isRoot) return;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                dragRef.current = {
                  id: node.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  moved: false,
                };
              }}
              onClick={() => {
                if (isRoot) selectNode(node.id);
              }}
            >
              <span style={styles.nodeTag}>{node.tag}</span>
              <strong style={styles.nodeLabel}>{node.label}</strong>
            </button>
          );
        })}

        {/* Choice Drawer */}
        <div
          style={{
            ...styles.drawer,
            ...(drawerExpanded ? styles.drawerExpanded : {}),
          }}
          onClick={() => {
            if (!drawerExpanded) setDrawerExpanded(true);
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
              onClick={(e) => {
                e.stopPropagation();
                setDrawerExpanded((v) => !v);
              }}
            >
              {drawerExpanded ? "Minimize" : "Expand"}
            </button>
          </div>

          <p style={styles.drawerAssignment}>{selectedNode.assignment}</p>

          <div style={styles.radarWrap}>
            <RadarChart values={projectedState} />
          </div>

          <div style={styles.metricGrid}>
            {metrics.map((m) => (
              <div key={m.key} style={styles.metricCard}>
                <span style={styles.metricLabel}>{m.label}</span>
                <strong style={styles.metricValue}>
                  {projectedState[m.key]}
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
                  {selectedNode.depth === 2
                    ? "an actual assignment"
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
  );
}

// ─── Inline Styles ────────────────────────────────────────────────────────────

const styles = {
  mapSection: {
    marginTop: "2rem",
    borderRadius: "1.25rem",
    overflow: "hidden",
    background: "linear-gradient(160deg,#0d1b2e 0%,#0a1628 60%,#0d2240 100%)",
    border: "1px solid rgba(99,179,237,0.15)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  },
  mapHeader: {
    padding: "1.75rem 2rem 0",
  },
  eyebrow: {
    fontSize: "0.65rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#63b3ed",
    fontWeight: 600,
    display: "block",
    marginBottom: "0.4rem",
  },
  mapTitle: {
    margin: "0 0 0.5rem",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#fff",
  },
  mapSubtitle: {
    margin: "0 0 1.25rem",
    fontSize: "0.82rem",
    color: "rgba(255,255,255,0.45)",
    lineHeight: 1.55,
  },
  boardWrap: {
    position: "relative",
    width: "100%",
    height: "420px",
    overflow: "hidden",
  },
  branchSvg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  node: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.2rem",
    padding: "0.55rem 0.85rem",
    borderRadius: "999px",
    backdropFilter: "blur(6px)",
    transition: "background 0.25s, border 0.25s, transform 0.2s, box-shadow 0.25s",
    fontFamily: "inherit",
    textAlign: "center",
    minWidth: "90px",
    maxWidth: "130px",
  },
  nodeTag: {
    fontSize: "0.55rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.45)",
    fontWeight: 600,
  },
  nodeLabel: {
    fontSize: "0.7rem",
    color: "#fff",
    fontWeight: 600,
    lineHeight: 1.3,
  },
  drawer: {
    position: "absolute",
    bottom: "1rem",
    right: "1rem",
    width: "240px",
    background: "rgba(13,27,46,0.92)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(99,179,237,0.2)",
    borderRadius: "1rem",
    padding: "1rem",
    cursor: "pointer",
    transition: "height 0.3s, width 0.3s",
    overflow: "hidden",
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  },
  drawerExpanded: {
    width: "300px",
    cursor: "default",
  },
  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  },
  drawerTitle: {
    margin: 0,
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#fff",
  },
  drawerToggle: {
    background: "rgba(99,179,237,0.15)",
    border: "1px solid rgba(99,179,237,0.3)",
    borderRadius: "6px",
    color: "#63b3ed",
    fontSize: "0.65rem",
    fontWeight: 600,
    padding: "0.25rem 0.5rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
    letterSpacing: "0.05em",
    fontFamily: "inherit",
  },
  drawerAssignment: {
    fontSize: "0.72rem",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 1.5,
    margin: "0 0 0.75rem",
  },
  radarWrap: {
    width: "100%",
    height: "130px",
    marginBottom: "0.75rem",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "0.3rem",
    marginBottom: "0.5rem",
  },
  metricCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "6px",
    padding: "0.3rem 0.2rem",
  },
  metricLabel: {
    fontSize: "0.5rem",
    color: "rgba(255,255,255,0.4)",
    marginBottom: "0.15rem",
    textAlign: "center",
  },
  metricValue: {
    fontSize: "0.8rem",
    color: "#63b3ed",
    fontWeight: 700,
  },
  drawerHint: {
    fontSize: "0.62rem",
    color: "rgba(255,255,255,0.3)",
    margin: 0,
    textAlign: "center",
  },
  expandedCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  expandedHeading: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#fff",
    margin: "0 0 0.35rem",
    letterSpacing: "0.04em",
  },
  expandedList: {
    margin: 0,
    paddingLeft: "1.1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  expandedItem: {
    fontSize: "0.68rem",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 1.5,
  },
  expandedText: {
    fontSize: "0.68rem",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 1.5,
    margin: 0,
  },
};

// ─── Student Prompt (Chatbot) ─────────────────────────────────────────────────

const STARTER_MESSAGES = [
  { role: "assistant", 
    content: "Hi! I'm your study buddy. Ask me anything about your revision plan, or tell me how your last session went." },
];

function StudentPrompt({ user, setNodeMapState, setPositionsState }) {
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

    // always use { role, content }
    const userMsg = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3001/api/tree-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          message: text,
        }),
      });
    
      const data = await res.json();
    
      if (!res.ok) throw new Error("Chat request failed");
    
      // Update tree state from backend
      if (data.newTreeState) {
        setNodeMapState(data.newTreeState.nodeMap);
        setPositionsState(data.newTreeState.positions);
      }
    
      // Add assistant reply
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.replyText,
        },
      ]);
    
    } catch (e) {
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

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={chatStyles.wrap}>
      <div style={chatStyles.header}>
        <span style={chatStyles.eyebrow}>Student Prompt</span>
        <h2 style={chatStyles.title}>Ask your study buddy</h2>
        <p style={chatStyles.subtitle}>
          Ask a question, describe what's confusing, or say how your last session went.
        </p>
      </div>

      <div style={chatStyles.feed}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...chatStyles.bubble,
              ...(msg.role === "user" ? chatStyles.bubbleUser : chatStyles.bubbleBot),
            }}
          >
            {msg.role === "assistant" && <span style={chatStyles.avatar}>B</span>}
            <p style={chatStyles.bubbleText}>{msg.content}</p>
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
          placeholder="Type your question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
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

const chatStyles = {
  wrap: {
    marginTop: "1.75rem",
    borderRadius: "1.25rem",
    background: "linear-gradient(160deg,#0d1b2e 0%,#0a1628 60%,#0d2240 100%)",
    border: "1px solid rgba(99,179,237,0.15)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "1.5rem 1.75rem 0.75rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  eyebrow: {
    fontSize: "0.65rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#63b3ed",
    fontWeight: 600,
    display: "block",
    marginBottom: "0.35rem",
  },
  title: {
    margin: "0 0 0.3rem",
    fontSize: "1.2rem",
    fontWeight: 700,
    color: "#fff",
  },
  subtitle: {
    margin: 0,
    fontSize: "0.78rem",
    color: "rgba(255,255,255,0.4)",
    lineHeight: 1.5,
  },
  feed: {
    padding: "1rem 1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.7rem",
    maxHeight: "260px",
    overflowY: "auto",
  },
  bubble: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.55rem",
    maxWidth: "80%",
  },
  bubbleBot: {
    alignSelf: "flex-start",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  avatar: {
    flexShrink: 0,
    width: "26px",
    height: "26px",
    borderRadius: "50%",
    background: "linear-gradient(135deg,#2b6cb0,#63b3ed)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "#fff",
    lineHeight: 1,
    paddingTop: "1px",
  },
  bubbleText: {
    margin: 0,
    padding: "0.55rem 0.85rem",
    borderRadius: "1rem",
    fontSize: "0.8rem",
    lineHeight: 1.55,
    color: "rgba(255,255,255,0.88)",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  typing: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    minHeight: "1.2rem",
  },
  dot: {
    display: "inline-block",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#63b3ed",
    animation: "blink 1.2s infinite ease-in-out",
  },
  inputRow: {
    display: "flex",
    gap: "0.6rem",
    padding: "0.85rem 1.25rem 1.1rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    resize: "none",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(99,179,237,0.2)",
    borderRadius: "0.75rem",
    color: "#fff",
    fontSize: "0.82rem",
    padding: "0.6rem 0.9rem",
    fontFamily: "inherit",
    lineHeight: 1.5,
    outline: "none",
    minHeight: "38px",
  },
  sendBtn: {
    background: "linear-gradient(135deg,#2b6cb0,#63b3ed)",
    border: "none",
    borderRadius: "0.75rem",
    color: "#fff",
    fontWeight: 700,
    fontSize: "0.78rem",
    padding: "0.6rem 1.1rem",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.04em",
    transition: "opacity 0.2s",
    whiteSpace: "nowrap",
  },
};

// ─── Main ToDo Page ───────────────────────────────────────────────────────────

export default function ToDoPage({ user, onBackHome, onSignOut }) {
  const[nodeMapState, setNodeMapState] = useState(DEFAULT_NODE_MAP);
  const[positionsState, setPositionsState] = useState(DEFAULT_POSITIONS);
  useEffect(() => {
    async function loadTree() {
      if (!user?.uid) return;
  
      const docRef = doc(db, "userTrees", user.uid);
      const snap = await getDoc(docRef);
  
      if (snap.exists()) {
        const data = snap.data();
        if (data.nodeMap) setNodeMapState(data.nodeMap);
        if (data.positions) setPositionsState(data.positions);
      } else {
        // First time user → create default tree
        await setDoc(docRef, {
          nodeMap: DEFAULT_NODE_MAP,
          positions: DEFAULT_POSITIONS,
          selectedId: "teach",
          updatedAt: Date.now(),
        });
      }
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
        updatedAt: Date.now(),
      });
    }
  
    saveTree();
  }, [nodeMapState, positionsState]);
  return (
    <main className="screen-shell">
      {/* Keep original TopNav if available */}
      {/* <TopNav user={user} onOpenToDo={() => {}} onGoHome={onBackHome} onSignOut={onSignOut} activePage="todo" /> */}

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
            <span className="stat-label">Priority block</span>
            <strong>Differentiation and Algebra</strong>
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
        {/* ── Possible Worlds Map ─────────────────────────────────────── */}
        <PossibleWorldsMap 
          nodeMap={nodeMapState}
          setNodeMap={setNodeMapState}
          positions={positionsState}
          setPositions={setPositionsState}
        />
        {/* ────────────────────────────────────────────────────────────── */}

        {/* ── Student Prompt ──────────────────────────────────────────── */}
        <StudentPrompt 
        user={user} 
        setNodeMapState={setNodeMapState}
        setPositionsState={setPositionsState}
        />
        {/* ────────────────────────────────────────────────────────────── */}

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
