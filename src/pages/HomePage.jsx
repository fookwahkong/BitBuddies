import React, { useState } from "react";
import RadarChart from "../components/RadarChart";
import TopNav from "../components/TopNav";
import { buildProjectedState, currentState, focusOptions } from "../data/demoData";

export default function HomePage({ onSignOut, onOpenToDo, user }) {
  const [selectedTopicId, setSelectedTopicId] = useState(focusOptions[0].id);
  const selectedOption = focusOptions.find((option) => option.id === selectedTopicId) ?? focusOptions[0];
  const projectedState = buildProjectedState(selectedOption);

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenToDo={onOpenToDo}
        onGoHome={() => {}}
        onSignOut={onSignOut}
        activePage="home"
      />

      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Homepage</p>
          <p className="hero-kicker">{user.name}</p>
          <h1>{user.persona.label} is the current learning persona driving this dashboard.</h1>
          <p className="hero-text">
            {user.persona.summary} BitBuddies uses this persona to shape explanations, flag weak learning
            habits, and prioritize which topic should move first.
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button">
              Continue revision
            </button>
            <div className="hero-proof">
              <span className="hero-proof-value">{Object.values(user.persona.totals).reduce((sum, value) => sum + value, 0)}</span>
              <span className="hero-proof-label">persona score built from the intake quiz</span>
            </div>
          </div>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">Assigned persona</span>
            <strong>{user.persona.label}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Student email</span>
            <strong>{user.email}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Next best move</span>
            <strong>{selectedOption.topic}</strong>
          </div>
          <div className="stat-card stat-card-highlight">
            <span className="stat-label">Why this recommendation</span>
            <strong>{selectedOption.peerInsight}</strong>
          </div>
        </div>
      </section>

      <section className="overview-strip">
        <div className="overview-card">
          <span className="overview-label">Current risk</span>
          <strong>Overconfidence is higher than demonstrated consistency in procedural topics.</strong>
        </div>
        <div className="overview-card">
          <span className="overview-label">Upcoming deadline</span>
          <strong>Math Paper in 12 days with high-weight algebra and differentiation topics.</strong>
        </div>
        <div className="overview-card">
          <span className="overview-label">Interpretation</span>
          <strong>BitBuddies recommends depth before fluency so weak spots become exam-safe.</strong>
        </div>
      </section>

      <section className="student-card">
        <div className="panel-header">
          <p className="eyebrow">Student Snapshot</p>
          <h2>{user.name}, Grade 11</h2>
        </div>
        <div className="student-grid">
          <div className="student-item">
            <span>Recent activity</span>
            <strong>28 learning events this week</strong>
          </div>
          <div className="student-item">
            <span>Detected pattern</span>
            <strong>{user.persona.label}</strong>
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
          title={`If ${user.name} focuses on ${selectedOption.topic}`}
          metrics={projectedState}
          tone="projected"
        />
      </section>
    </main>
  );
}
