import React from "react";
import RadarChart from "../components/RadarChart";
import TopNav from "../components/TopNav";

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

export default function HomePage({ onSignOut, onOpenToDo, user }) {
  const primaryPersona = user.persona.primary;
  const rankedPersonas = user.persona.ranked.slice(0, 3);
  const radar = user.learningRadar;
  const features = radar.features || {};
  const recomputeDate = radar.meta?.lastComputedAt
    ? new Date(radar.meta.lastComputedAt).toLocaleString()
    : "Not computed yet";

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenToDo={onOpenToDo}
        onGoHome={() => {}}
        onSignOut={onSignOut}
        activePage="home"
      />

      <section className="student-card">
        <div className="panel-header">
          <p className="eyebrow">Student Snapshot</p>
          <h2>{user.name}</h2>
        </div>

        <div className="student-grid">
          <div className="student-item">
            <span>Primary persona</span>
            <strong>{primaryPersona.label}</strong>
            <p className="student-helper">{primaryPersona.summary}</p>
          </div>
          <div className="student-item">
            <span>Top persona match</span>
            <strong>{formatPercent(primaryPersona.matchScore)}</strong>
            <p className="student-helper">Current strongest persona signal after blending onboarding and behavior.</p>
          </div>
          <div className="student-item">
            <span>Behavior confidence</span>
            <strong>{formatPercent(radar.meta?.confidence)}</strong>
            <p className="student-helper">
              BitBuddies fully trusts behavior at {radar.meta?.meaningfulActivityThreshold || 5}+ new events per refresh cycle.
            </p>
          </div>
          <div className="student-item">
            <span>Latest recompute</span>
            <strong>{recomputeDate}</strong>
            <p className="student-helper">
              Recompute only happens after meaningful activity so the radar stays smooth.
            </p>
          </div>
        </div>

        <div className="persona-scoreboard">
          {rankedPersonas.map((persona) => (
            <div key={persona.id} className="persona-chip">
              <span>{persona.label}</span>
              <strong>{formatPercent(persona.matchScore)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="current-state-card">
        <div className="panel-header">
          <p className="eyebrow">Current State</p>
          <h2>Learning Radar and explainable signals</h2>
        </div>

        <div className="current-state-grid">
          <RadarChart title="Learning Radar" metrics={radar.scores} tone="current" />

          <div className="current-state-stack">
            <div className="explain-card">
              <h3>How this score is managed</h3>
              <ul>
                <li>Initial radar starts from the onboarding persona mix.</li>
                <li>Live radar blends measured behavior as learning events accumulate.</li>
                <li>Updates are smoothed to avoid sharp day-to-day swings.</li>
              </ul>
            </div>

            <div className="explain-card">
              <h3>Current activity window</h3>
              <ul>
                <li>{features.totalEvents || 0} total logged events</li>
                <li>{features.activeDaysLast14 || 0} active days in the last 14 days</li>
                <li>{features.topicsTouchedLast7 || 0} topics touched in the last 7 days</li>
                <li>{features.eventsLast48h || 0} events in the last 48 hours</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="axis-explanations">
          {Object.values(radar.explanations).map((item) => (
            <div key={item.axis} className="axis-card">
              <div className="axis-card-header">
                <div>
                  <p className="axis-label">{item.axis}</p>
                  <h3>{item.score}/100</h3>
                </div>
              </div>
              <p className="axis-summary">{item.summary}</p>
              <ul className="axis-signal-list">
                {item.signals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
