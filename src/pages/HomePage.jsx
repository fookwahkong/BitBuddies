import React from "react";
import PersonaVisual from "../components/PersonaVisual";
import RadarChart from "../components/RadarChart";
import TopNav from "../components/TopNav";
import { buildSubjectMasteryAxes } from "../data/academicProfile";

export default function HomePage({
  onSignOut,
  onOpenPractice,
  onOpenToDo,
  onOpenJudge,
  onOpenPersonas,
  user,
}) {
  const primaryPersona = user.persona.primary;
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
  const recomputeDate = radar.meta?.lastComputedAt
    ? new Date(radar.meta.lastComputedAt).toLocaleString()
    : "Not computed yet";

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenPractice={onOpenPractice}
        onOpenToDo={onOpenToDo}
        onOpenJudge={onOpenJudge}
        onOpenPersonas={onOpenPersonas}
        onGoHome={() => {}}
        onSignOut={onSignOut}
        activePage="home"
      />

      <section className="student-card">
        <div className="panel-header panel-header-spread">
          <div>
            <p className="eyebrow">Student Snapshot</p>
            <h2>{user.name}</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onOpenPersonas}>
            View persona guide
          </button>
        </div>

        <div className="student-profile-shell">
          <div className="student-profile-copy">
            <p className="student-intro">
              Your homepage now focuses on one trusted persona instead of multiple mini panels. The rest of the
              profile details stay grouped here for a cleaner first glance.
            </p>

            <div className="student-profile-grid">
              <div className="student-detail-card">
                <span>Username</span>
                <strong>{user.name}</strong>
              </div>

              <div className="student-detail-card">
                <span>Academic setup</span>
                <strong>
                  {user.academicProfile?.institutionLabel || "Not set"} | {user.academicProfile?.courseTrack || "No track"}
                </strong>
              </div>

              <div className="student-detail-card">
                <span>Tracked subjects</span>
                <strong>{user.academicProfile?.meta?.subjectCount || 0} subject(s)</strong>
              </div>

              <div className="student-detail-card">
                <span>Latest recompute</span>
                <strong>{recomputeDate}</strong>
              </div>
            </div>
          </div>

          <div className="student-portrait-panel">
            <PersonaVisual
              persona={primaryPersona}
              matchScore={primaryPersona.matchScore}
              showSummary
              summaryText={primaryPersona.summary}
            />
          </div>
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
          <RadarChart
            title="Revision Ability Radar"
            metrics={radar.scores}
            tone="current"
            axisHelp={radar.explanations}
          />
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
              <li>Revision ability starts from the onboarding weak label and radar prior.</li>
              <li>After 25 events, behavior scores can promote the canonical label if the signal is strong enough.</li>
              <li>Each logged practice attempt updates the relevant subject through a simple BKT pass.</li>
            </ul>
          </div>

          <div className="explain-card">
            <h3>Current activity window</h3>
            <ul>
              <li>{radar.meta?.totalEvents || 0} total logged events</li>
              <li>{features.activeDaysLast14 || 0} active days in the last 14 days</li>
              <li>{features.topicsTouchedLast7 || 0} topics touched in the last 7 days</li>
              <li>{subjectMastery?.meta?.totalAttempts || 0} subject-level attempt(s) in BKT</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
