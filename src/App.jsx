import React, { useState } from "react";

const currentState = {
  mastery: 62,
  stability: 48,
  retention: 54,
  confidence: 71,
  examReadiness: 58,
};

const focusOptions = [
  {
    id: "chain-rule",
    topic: "Differentiation - Chain Rule",
    duration: "15 min",
    impact: {
      mastery: 14,
      stability: 10,
      retention: 8,
      confidence: -6,
      examReadiness: 12,
    },
    outcome: "accuracy rises while overconfidence normalizes",
    peerInsight:
      "Students with a profile close to yours improved fastest when they fixed procedural math topics before timed mixed practice.",
    reason: [
      "3 of your last 7 attempts in this topic were incorrect.",
      "Your self-rated confidence is high relative to actual accuracy.",
      "This topic is tagged as high-weight for the upcoming exam.",
    ],
    nextMove: "Do 5 targeted chain rule questions, then one timed mixed question.",
  },
  {
    id: "vectors",
    topic: "Vectors - Show That Questions",
    duration: "20 min",
    impact: {
      mastery: 8,
      stability: 12,
      retention: 6,
      confidence: -4,
      examReadiness: 9,
    },
    outcome: "reasoning quality improves and careless explanation gaps shrink",
    peerInsight:
      "Similar learners usually plateau in vectors until they practice written justification, not just calculation speed.",
    reason: [
      "You often complete the calculation but miss the final explanation step.",
      "This is a repeated mistake cluster in your last 6 vector tasks.",
      "Improving here reduces a high-frequency exam error pattern.",
    ],
    nextMove: "Complete 3 proof-style vector prompts with a written justification checklist.",
  },
  {
    id: "inequalities",
    topic: "Algebra - Inequalities",
    duration: "18 min",
    impact: {
      mastery: 11,
      stability: 7,
      retention: 9,
      confidence: -2,
      examReadiness: 15,
    },
    outcome: "mark gain potential increases because of high exam weight",
    peerInsight:
      "Students with your pattern often gain marks fastest by switching early into high-weight weak topics instead of polishing safe topics.",
    reason: [
      "This topic has lower mastery than your average baseline.",
      "It carries one of the highest exam-weight tags in your revision map.",
      "The opportunity cost of delaying this topic is high.",
    ],
    nextMove: "Work through 4 inequalities questions from medium to hard and review the first mistake immediately.",
  },
];

const metricLabels = [
  { key: "mastery", label: "Mastery" },
  { key: "stability", label: "Stability" },
  { key: "retention", label: "Retention" },
  { key: "confidence", label: "Calibration" },
  { key: "examReadiness", label: "Exam Readiness" },
];

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function buildProjectedState(option) {
  return metricLabels.reduce((nextState, metric) => {
    nextState[metric.key] = clamp(currentState[metric.key] + option.impact[metric.key]);
    return nextState;
  }, {});
}

function RadarChart({ title, metrics, tone }) {
  const center = 150;
  const radius = 100;
  const levels = [20, 40, 60, 80, 100];
  const axisPoints = metricLabels.map((metric, index) => {
    const angle = ((Math.PI * 2) / metricLabels.length) * index - Math.PI / 2;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    return { ...metric, angle, x, y };
  });

  const polygonPoints = axisPoints
    .map((point) => {
      const valueRadius = (metrics[point.key] / 100) * radius;
      const x = center + Math.cos(point.angle) * valueRadius;
      const y = center + Math.sin(point.angle) * valueRadius;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={`radar-card radar-card-${tone}`}>
      <div className="panel-header">
        <p className="eyebrow">{tone === "current" ? "Current State" : "Projected State"}</p>
        <h3>{title}</h3>
      </div>
      <svg viewBox="0 0 300 300" className="radar-svg" role="img" aria-label={title}>
        {levels.map((level) => {
          const levelPoints = axisPoints
            .map((point) => {
              const levelRadius = (level / 100) * radius;
              const x = center + Math.cos(point.angle) * levelRadius;
              const y = center + Math.sin(point.angle) * levelRadius;
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <polygon
              key={level}
              points={levelPoints}
              className="radar-grid"
            />
          );
        })}
        {axisPoints.map((point) => (
          <line
            key={point.key}
            x1={center}
            y1={center}
            x2={point.x}
            y2={point.y}
            className="radar-axis"
          />
        ))}
        <polygon points={polygonPoints} className="radar-fill" />
        {axisPoints.map((point) => {
          const valueRadius = (metrics[point.key] / 100) * radius;
          const x = center + Math.cos(point.angle) * valueRadius;
          const y = center + Math.sin(point.angle) * valueRadius;
          return <circle key={`${point.key}-dot`} cx={x} cy={y} r="4" className="radar-dot" />;
        })}
        {axisPoints.map((point) => {
          const labelRadius = radius + 28;
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
      <div className="metric-list">
        {metricLabels.map((metric) => (
          <div key={metric.key} className="metric-row">
            <span>{metric.label}</span>
            <strong>{metrics[metric.key]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [selectedTopicId, setSelectedTopicId] = useState(focusOptions[0].id);
  const selectedOption = focusOptions.find((option) => option.id === selectedTopicId) ?? focusOptions[0];
  const projectedState = buildProjectedState(selectedOption);

  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left" />
      <div className="background-glow background-glow-right" />
      <header className="top-bar">
        <div className="brand-lockup">
          <div className="brand-mark">B</div>
          <div>
            <p className="brand-name">BitBuddies</p>
            <p className="brand-tag">Explainable study direction for exam prep</p>
          </div>
        </div>
        <button className="status-pill" type="button">
          Live demo
        </button>
      </header>

      <main className="page-grid">
        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">Homepage</p>
            <p className="hero-kicker">BitBuddies</p>
            <h1>Personalized study direction that students and judges can understand at a glance.</h1>
            <p className="hero-text">
              BitBuddies turns learning events into clear next steps. This homepage demo shows a sample
              learner, their current radar, and a projected future state when they focus on a specific topic.
              Every recommendation is visible, explainable, and tied to measurable impact.
            </p>
            <div className="hero-actions">
              <button className="primary-button" type="button">
                Explore demo
              </button>
              <div className="hero-proof">
                <span className="hero-proof-value">5</span>
                <span className="hero-proof-label">learning signals tracked per topic</span>
              </div>
            </div>
          </div>
          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-label">Next best move</span>
              <strong>{selectedOption.topic}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Session length</span>
              <strong>{selectedOption.duration}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Expected effect</span>
              <strong>{selectedOption.outcome}</strong>
            </div>
            <div className="stat-card stat-card-highlight">
              <span className="stat-label">Why BitBuddies matters</span>
              <strong>Students stop guessing what to revise, and judges can immediately see the product logic.</strong>
            </div>
          </div>
        </section>

        <section className="overview-strip">
          <div className="overview-card">
            <span className="overview-label">What it tracks</span>
            <strong>Mastery, stability, retention, confidence, exam readiness</strong>
          </div>
          <div className="overview-card">
            <span className="overview-label">What it explains</span>
            <strong>Why this topic, why now, and what changes after one focused session</strong>
          </div>
          <div className="overview-card">
            <span className="overview-label">What users do</span>
            <strong>Choose a topic, compare the projected radar, and act on the next best move</strong>
          </div>
        </section>

        <section className="student-card">
          <div className="panel-header">
            <p className="eyebrow">Student Snapshot</p>
            <h2>Alya Tan, Grade 11</h2>
          </div>
          <div className="student-grid">
            <div className="student-item">
              <span>Upcoming exam</span>
              <strong>Math Paper in 12 days</strong>
            </div>
            <div className="student-item">
              <span>Recent activity</span>
              <strong>28 learning events this week</strong>
            </div>
            <div className="student-item">
              <span>Risk flag</span>
              <strong>Overconfident in procedural topics</strong>
            </div>
            <div className="student-item">
              <span>Peer insight</span>
              <strong>{selectedOption.peerInsight}</strong>
            </div>
          </div>
        </section>

        <section className="simulator-card">
          <div className="panel-header">
            <p className="eyebrow">Possible Worlds</p>
            <h2>Pick a focus topic and preview the learning trade-off</h2>
          </div>
          <div className="topic-picker" role="tablist" aria-label="Topic options">
            {focusOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === selectedTopicId ? "topic-chip active" : "topic-chip"}
                onClick={() => setSelectedTopicId(option.id)}
              >
                {option.topic}
              </button>
            ))}
          </div>
          <div className="insight-grid">
            <div className="explain-card">
              <h3>Why this focus now</h3>
              <ul>
                {selectedOption.reason.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="action-card">
              <h3>Do it now</h3>
              <p>{selectedOption.nextMove}</p>
            </div>
          </div>
        </section>

        <section className="radar-grid-wrap">
          <RadarChart title="Learning Radar" metrics={currentState} tone="current" />
          <RadarChart
            title={`If Alya focuses on ${selectedOption.topic}`}
            metrics={projectedState}
            tone="projected"
          />
        </section>
      </main>
    </div>
  );
}
