import React from "react";
import RadarChart from "../components/RadarChart";
import TopNav from "../components/TopNav";
import { buildSubjectMasteryAxes } from "../data/academicProfile";

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function buildPersonaDisplayMix(rankedPersonas) {
  const normalized = rankedPersonas.map((persona) => {
    const exactPercent = (persona.matchScore || 0) * 100;

    return {
      ...persona,
      displayPercent: Math.floor(exactPercent),
      remainder: exactPercent - Math.floor(exactPercent),
    };
  });

  const remainingPoints = 100 - normalized.reduce((sum, persona) => sum + persona.displayPercent, 0);

  normalized
    .slice()
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder;
      }

      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, remainingPoints)
    .forEach((persona) => {
      const originalPersona = normalized.find((item) => item.id === persona.id);

      if (originalPersona) {
        originalPersona.displayPercent += 1;
      }
    });

  return normalized
    .map(({ remainder, ...persona }) => persona)
    .sort((left, right) => {
      if (right.displayPercent !== left.displayPercent) {
        return right.displayPercent - left.displayPercent;
      }

      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      return left.label.localeCompare(right.label);
    });
}

function joinInsight(items, fallback) {
  if (!items?.length) {
    return fallback;
  }

  return items.map((item) => `${item.label} (${item.reason})`).join(" • ");
}

export default function HomePage({ onSignOut, onOpenPractice, onOpenToDo, user }) {
  const primaryPersona = user.persona.primary;
  const rankedPersonas = buildPersonaDisplayMix(user.persona.ranked);
  const radar = user.learningRadar;
  const features = radar.features || {};
  const subjectMastery = user.subjectMastery;
  const subjectAxes = buildSubjectMasteryAxes(user.academicProfile);
  const subjectRadarAxes = subjectAxes.length
    ? subjectAxes
    : [
        { key: "subject_a", label: "Subject A" },
        { key: "subject_b", label: "Subject B" },
        { key: "subject_c", label: "Subject C" },
      ];
  const subjectRadarMetrics = subjectAxes.length
    ? subjectMastery?.scores
    : { subject_a: 0, subject_b: 0, subject_c: 0 };
  const subjectInsights = subjectMastery?.insights || {};
  const recomputeDate = radar.meta?.lastComputedAt
    ? new Date(radar.meta.lastComputedAt).toLocaleString()
    : "Not computed yet";

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenPractice={onOpenPractice}
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
            <span>Persona confidence</span>
            <strong>{formatPercent(user.personaConfidence)}</strong>
            <p className="student-helper">
              This is the confidence of the onboarding quiz classification before behavior takes over.
            </p>
          </div>
          <div className="student-item">
            <span>Latest recompute</span>
            <strong>{recomputeDate}</strong>
            <p className="student-helper">
              Recompute only happens after meaningful activity so the revision radar stays smooth.
            </p>
          </div>
          <div className="student-item">
            <span>Academic setup</span>
            <strong>
              {user.academicProfile?.institutionLabel || "Not set"} • {user.academicProfile?.courseTrack || "No track"}
            </strong>
            <p className="student-helper">
              {user.academicProfile?.meta?.subjectCount || 0} subject(s) are currently tracked for subject-level BKT.
            </p>
          </div>
        </div>

        <div className="persona-scoreboard">
          {rankedPersonas.map((persona) => (
            <div key={persona.id} className="persona-chip">
              <span>{persona.label}</span>
              <strong>{persona.displayPercent}%</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="current-state-card">
        <div className="panel-header panel-header-spread">
          <div>
            <p className="eyebrow">Dual Radar Snapshot</p>
            <h2>Revision ability and subject mastery are tracked side by side.</h2>
          </div>
          <button className="primary-button" type="button" onClick={onOpenPractice}>
            Start practice intake
          </button>
        </div>

        <div className="radar-grid-wrap">
          <RadarChart title="Revision Ability Radar" metrics={radar.scores} tone="current" />
          <RadarChart
            title="Subject Mastery Radar"
            metrics={subjectRadarMetrics}
            tone="projected"
            axes={subjectRadarAxes}
            eyebrow="BKT Baseline"
          />
        </div>

        <div className="insight-grid">
          <div className="explain-card">
            <h3>How this score is managed</h3>
            <ul>
              <li>Revision ability starts from the onboarding persona mix.</li>
              <li>Subject mastery starts from weakness-based priors per selected subject.</li>
              <li>Each logged practice attempt updates the relevant subject through a simple BKT pass.</li>
            </ul>
          </div>

          <div className="explain-card">
            <h3>Current activity window</h3>
            <ul>
              <li>{features.totalEvents || 0} total logged events</li>
              <li>{features.activeDaysLast14 || 0} active days in the last 14 days</li>
              <li>{features.topicsTouchedLast7 || 0} topics touched in the last 7 days</li>
              <li>{subjectMastery?.meta?.totalAttempts || 0} subject-level attempt(s) in BKT</li>
            </ul>
          </div>
        </div>

        <div className="insight-grid">
          <div className="action-card">
            <h3>Under-practised high-impact subjects</h3>
            <p>
              {joinInsight(
                subjectInsights.underPracticedHighImpact,
                "Start logging practice so BitBuddies can surface which high-impact subjects are being neglected.",
              )}
            </p>
          </div>

          <div className="action-card">
            <h3>Over-invested mastered subjects</h3>
            <p>
              {joinInsight(
                subjectInsights.overInvestedMastered,
                "No over-invested mastered subjects are obvious yet.",
              )}
            </p>
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
