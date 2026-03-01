import React, { Component, useEffect, useMemo, useRef, useState } from "react";

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

const nodeMap = {
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
    impact: {
      mastery: 0,
      clarity: 0,
      confidence: 0,
      speed: 0,
      readiness: 0,
    },
  },
  review: {
    id: "review",
    label: "Review the weak step",
    parentId: "start",
    depth: 1,
    tag: "Branch A",
    assignment: "Open worked examples and isolate the exact step that keeps breaking.",
    reason: [
      "Best when the student is making the same mistake repeatedly.",
      "Reduces confusion before they move into harder timed work.",
      "Good reset path when confidence is higher than actual accuracy.",
    ],
    impact: {
      mastery: 10,
      clarity: 16,
      confidence: -4,
      speed: 4,
      readiness: 8,
    },
  },
  stretch: {
    id: "stretch",
    label: "Push into harder practice",
    parentId: "start",
    depth: 1,
    tag: "Branch B",
    assignment: "Skip the safe questions and jump straight into high-demand exam tasks.",
    reason: [
      "Useful when the student already understands the concept but needs pressure.",
      "Improves exam readiness by exposing harder mark schemes earlier.",
      "Works well if time is limited and easy marks are already stable.",
    ],
    impact: {
      mastery: 8,
      clarity: 4,
      confidence: -2,
      speed: 10,
      readiness: 15,
    },
  },
  flashcards: {
    id: "flashcards",
    label: "Make recall cards",
    parentId: "review",
    depth: 2,
    tag: "Assignment",
    assignment: "Turn formulas, definitions, or common mistakes into short active-recall cards.",
    reason: [
      "Good for content that must be remembered exactly.",
      "Builds retention without overwhelming the student.",
      "Creates a reusable revision asset for later sessions.",
    ],
    impact: {
      mastery: 7,
      clarity: 8,
      confidence: 4,
      speed: 2,
      readiness: 6,
    },
  },
  teach: {
    id: "teach",
    label: "Explain it out loud",
    parentId: "review",
    depth: 2,
    tag: "Assignment",
    assignment: "Have the learner teach the method to a friend, camera, or empty room in one take.",
    reason: [
      "Exposes missing logic faster than silent review.",
      "Improves explanation quality for show-your-working questions.",
      "Strong choice when understanding exists but language is weak.",
    ],
    impact: {
      mastery: 9,
      clarity: 14,
      confidence: 3,
      speed: 1,
      readiness: 9,
    },
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
    impact: {
      mastery: 6,
      clarity: 3,
      confidence: -1,
      speed: 12,
      readiness: 13,
    },
  },
  drill: {
    id: "drill",
    label: "Exam-style drill",
    parentId: "stretch",
    depth: 2,
    tag: "Assignment",
    assignment: "Do one multi-step exam question, then mark it immediately using the rubric.",
    reason: [
      "Closest match to the real assessment context.",
      "Improves mark conversion, not just topic familiarity.",
      "Best when the learner needs realistic rehearsal instead of more theory.",
    ],
    impact: {
      mastery: 11,
      clarity: 5,
      confidence: -2,
      speed: 8,
      readiness: 17,
    },
  },
};

const edges = Object.values(nodeMap)
  .filter((node) => node.parentId)
  .map((node) => ({
    id: `${node.parentId}-${node.id}`,
    from: node.parentId,
    to: node.id,
  }));

const initialPositions = {
  start: { x: 50, y: 17 },
  review: { x: 31, y: 41 },
  stretch: { x: 69, y: 41 },
  flashcards: { x: 19, y: 73 },
  teach: { x: 43, y: 73 },
  quiz: { x: 62, y: 73 },
  drill: { x: 82, y: 73 },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePosition(position, fallback) {
  return {
    x: clamp(position?.x ?? fallback.x, 10, 90),
    y: clamp(position?.y ?? fallback.y, 14, 86),
  };
}

function normalizeNode(node) {
  const fallback = nodeMap.start;
  const resolved = node && typeof node === "object" ? node : fallback;

  return {
    ...fallback,
    ...resolved,
    reason: Array.isArray(resolved.reason) ? resolved.reason : fallback.reason,
    impact: resolved.impact && typeof resolved.impact === "object" ? resolved.impact : fallback.impact,
  };
}

function buildProjectedState(node) {
  const impact = node?.impact ?? {};

  return metrics.reduce((nextState, metric) => {
    nextState[metric.key] = clamp(currentState[metric.key] + (impact[metric.key] ?? 0), 0, 100);
    return nextState;
  }, {});
}

function getPathIds(targetId) {
  const path = new Set();
  let cursor = targetId;

  while (cursor && nodeMap[cursor]) {
    path.add(cursor);
    cursor = nodeMap[cursor].parentId;
  }

  return path;
}

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Possible Worlds page crashed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="crash-shell">
          <div className="crash-card">
            <p className="eyebrow">Possible Worlds</p>
            <h1>This page hit a runtime error.</h1>
            <p>Refresh once. If it still breaks, the console will now show the exact error instead of a blank page.</p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
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
      return `${center + Math.cos(point.angle) * valueRadius},${center + Math.sin(point.angle) * valueRadius}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 192 192" className="radar-svg" role="img" aria-label="Projected radar chart">
      {rings.map((ring) => {
        const ringPoints = points
          .map((point) => {
            const ringRadius = (ring / 100) * radius;
            return `${center + Math.cos(point.angle) * ringRadius},${center + Math.sin(point.angle) * ringRadius}`;
          })
          .join(" ");

        return <polygon key={ring} points={ringPoints} className="radar-ring" />;
      })}
      {points.map((point) => (
        <line key={point.key} x1={center} y1={center} x2={point.x} y2={point.y} className="radar-axis" />
      ))}
      <polygon points={polygon} className="radar-shape" />
      {points.map((point) => {
        const valueRadius = (values[point.key] / 100) * radius;
        const x = center + Math.cos(point.angle) * valueRadius;
        const y = center + Math.sin(point.angle) * valueRadius;
        return <circle key={point.key} cx={x} cy={y} r="3.5" className="radar-dot" />;
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
            className="radar-label"
          >
            {point.label}
          </text>
        );
      })}
    </svg>
  );
}

function PossibleWorldsPage() {
  const [selectedId, setSelectedId] = useState("teach");
  const [positions, setPositions] = useState(initialPositions);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const sceneRef = useRef(null);
  const dragRef = useRef(null);
  const audioContextRef = useRef(null);

  const safePositions = useMemo(() => {
    return Object.keys(initialPositions).reduce((nextPositions, key) => {
      nextPositions[key] = normalizePosition(positions[key], initialPositions[key]);
      return nextPositions;
    }, {});
  }, [positions]);

  const nodes = useMemo(() => {
    return Object.values(nodeMap).map((node) => ({
      ...normalizeNode(node),
      position: safePositions[node.id] ?? initialPositions.start,
    }));
  }, [safePositions]);

  const selectedNode = useMemo(() => normalizeNode(nodeMap[selectedId]), [selectedId]);
  const projectedState = useMemo(() => buildProjectedState(selectedNode), [selectedNode]);
  const activePath = useMemo(() => getPathIds(selectedNode.id), [selectedNode.id]);

  function playSelectionTone() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      const context = audioContextRef.current;
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }

      const now = context.currentTime;
      const freqs = [268, 402];

      freqs.forEach((frequency, index) => {
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
      console.error("Unable to play selection tone", error);
    }
  }

  function selectNode(id) {
    if (!nodeMap[id]) {
      return;
    }

    setSelectedId(id);
    playSelectionTone();
  }

  useEffect(() => {
    function handlePointerMove(event) {
      if (!dragRef.current || !sceneRef.current) {
        return;
      }

      const deltaX = event.clientX - dragRef.current.startX;
      const deltaY = event.clientY - dragRef.current.startY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        dragRef.current.moved = true;
      }

      const rect = sceneRef.current.getBoundingClientRect();
      const nextX = clamp(((event.clientX - rect.left) / rect.width) * 100, 10, 90);
      const nextY = clamp(((event.clientY - rect.top) / rect.height) * 100, 14, 86);

      setPositions((current) => {
        const dragState = dragRef.current;
        if (!dragState || !initialPositions[dragState.id]) {
          return current;
        }

        return {
          ...current,
          [dragState.id]: { x: nextX, y: nextY },
        };
      });
    }

    function handlePointerUp() {
      if (!dragRef.current) {
        return;
      }

      const { id, moved } = dragRef.current;
      dragRef.current = null;

      if (!moved) {
        selectNode(id);
      }
    }

    function resetDragState() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("blur", resetDragState);
    document.addEventListener("visibilitychange", resetDragState);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("blur", resetDragState);
      document.removeEventListener("visibilitychange", resetDragState);
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="grid-overlay" />
      <header className="top-bar">
        <div className="nav-pill brand-pill">B</div>
        <button type="button" className="nav-pill nav-pill-active">
          Possible worlds
        </button>
        <button type="button" className="nav-pill">
          Feature #2
        </button>
        <button type="button" className="profile-pill">
          Profile
        </button>
      </header>

      <main className="world-frame">
        <section className="world-copy">
          <p className="eyebrow">Interactive assignment map</p>
          <h1>Choose a path, light the branch, and preview the learning world it creates.</h1>
          <p className="world-summary">
            Tap a bubble to select an assignment. Drag any non-root bubble to rearrange the map. The branch back
            to the start point lights up, and the bottom-right detail panel updates with the reason and projected
            radar change for that choice.
          </p>
        </section>

        <section className="world-board" ref={sceneRef}>
          <div className="board-note">
            <span className="board-note-title">Student prompt</span>
            <p>What should I do next if I want the biggest improvement this session?</p>
          </div>

          <svg viewBox="0 0 100 100" className="branch-layer" preserveAspectRatio="none" aria-hidden="true">
            {edges.map((edge) => {
              const from = safePositions[edge.from];
              const to = safePositions[edge.to];
              const active = activePath.has(edge.from) && activePath.has(edge.to);

              if (!from || !to) {
                return null;
              }

              return (
                <line
                  key={edge.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={active ? "branch branch-active" : "branch"}
                />
              );
            })}
          </svg>

          {nodes.map((node) => {
            const position = node.position;
            const isSelected = node.id === selectedId;
            const isRoot = node.id === "start";

            return (
              <button
                key={node.id}
                type="button"
                className={isSelected ? "world-node selected" : "world-node"}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                onPointerDown={(event) => {
                  if (isRoot) {
                    return;
                  }

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
                <span className="node-tag">{node.tag}</span>
                <strong>{node.label}</strong>
              </button>
            );
          })}

          <aside
            className={drawerExpanded ? "choice-drawer expanded" : "choice-drawer"}
            onClick={() => {
              if (!drawerExpanded) {
                setDrawerExpanded(true);
              }
            }}
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Selected world</p>
                <h2>{selectedNode.label}</h2>
              </div>
              <button
                type="button"
                className="drawer-toggle"
                onClick={(event) => {
                  event.stopPropagation();
                  setDrawerExpanded((value) => !value);
                }}
              >
                {drawerExpanded ? "Minimize" : "Expand"}
              </button>
            </div>

            <p className="drawer-assignment">{selectedNode.assignment}</p>

            <div className="drawer-radar-wrap">
              <RadarChart values={projectedState} />
            </div>

            <div className="metric-grid">
              {metrics.map((metric) => (
                <div key={metric.key} className="metric-card">
                  <span>{metric.label}</span>
                  <strong>{projectedState[metric.key]}</strong>
                </div>
              ))}
            </div>

            {drawerExpanded ? (
              <div className="drawer-expanded-copy">
                <div>
                  <h3>Why this choice</h3>
                  <ul>
                    {selectedNode.reason.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>What changes</h3>
                  <p>
                    This path shifts the learner from the current baseline into a new possible world with a stronger
                    emphasis on {selectedNode.depth === 2 ? "an actual assignment" : "a direction choice"}.
                  </p>
                </div>
              </div>
            ) : (
              <p className="drawer-hint">Press this card to open the full explanation and radar details.</p>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <PageErrorBoundary>
      <PossibleWorldsPage />
    </PageErrorBoundary>
  );
}
