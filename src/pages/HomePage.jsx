import React, { useEffect, useRef, useState } from "react";
import PersonaVisual from "../components/PersonaVisual";
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

export default function HomePage({
  onSignOut,
  onOpenPractice,
  onOpenToDo,
  onOpenJudge,
  onOpenPersonas,
  onToggleStudyPlan,
  user,
}) {
  const [showPersonaExplanation, setShowPersonaExplanation] = useState(false);
  const [dismissingTodoIds, setDismissingTodoIds] = useState({});
  const [hiddenTodoIds, setHiddenTodoIds] = useState({});
  const dismissTimersRef = useRef({});

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

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
  const recomputeDate = radar.meta?.lastComputedAt
    ? new Date(radar.meta.lastComputedAt).toLocaleString()
    : "Not computed yet";
  const studyPlanTodos = Array.isArray(user.studyPlanTodos) ? user.studyPlanTodos : [];
  const visibleStudyPlanTodos = studyPlanTodos.filter((item) => {
    if (dismissingTodoIds[item.id]) {
      return true;
    }

    if (hiddenTodoIds[item.id]) {
      return false;
    }

    return !item.completed;
  });
  const scoreSource = user.persona.labelSource === "behavior_rule" ? "behavior signal" : "onboarding quiz";
  const secondPersona = rankedPersonas[1] || null;
  const liveScores = Object.entries(user.persona.liveMatchScores || {})
    .map(([id, value]) => ({
      id,
      label: rankedPersonas.find((persona) => persona.id === id)?.label || id,
      value: Number(value) || 0,
    }))
    .sort((left, right) => right.value - left.value);

  useEffect(() => {
    return () => {
      Object.values(dismissTimersRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      dismissTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const activeTodoIds = new Set(studyPlanTodos.map((item) => item.id));
    const visibleHiddenIds = Object.entries(hiddenTodoIds).reduce((result, [id, value]) => {
      if (!value || !activeTodoIds.has(id)) {
        return result;
      }

      const matchedTodo = studyPlanTodos.find((todo) => todo.id === id);
      if (matchedTodo?.completed) {
        result[id] = true;
      }

      return result;
    }, {});

    const nextKey = Object.keys(visibleHiddenIds).sort().join("|");
    const currentKey = Object.keys(hiddenTodoIds).sort().join("|");
    const hasChanged = nextKey !== currentKey;
    if (hasChanged) {
      setHiddenTodoIds(visibleHiddenIds);
    }
  }, [hiddenTodoIds, studyPlanTodos]);

  function handleCompleteTodo(todoId) {
    if (dismissingTodoIds[todoId] || hiddenTodoIds[todoId]) {
      return;
    }

    setDismissingTodoIds((current) => ({
      ...current,
      [todoId]: true,
    }));

    dismissTimersRef.current[todoId] = setTimeout(() => {
      setDismissingTodoIds((current) => {
        const next = { ...current };
        delete next[todoId];
        return next;
      });
      setHiddenTodoIds((current) => ({
        ...current,
        [todoId]: true,
      }));
      delete dismissTimersRef.current[todoId];
    }, 300);

    onToggleStudyPlan(todoId);
  }

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
          </div>
          <button className="secondary-button" type="button" onClick={() => setShowPersonaExplanation(true)}>
            Why this persona?
          </button>
        </div>

        <div className="student-profile-shell">
          <div className="student-profile-copy">

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

      <section className="student-card">
        <div className="panel-header panel-header-spread">
          <div>
            <p className="eyebrow">Committed Plans</p>
            <h2>Your PATH list updates automatically from committed study nodes</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onOpenToDo}>
            Open ToDo planner
          </button>
        </div>

        {visibleStudyPlanTodos.length ? (
          <div className="study-plan-list">
            {visibleStudyPlanTodos.map((item) => {
              const isDismissing = Boolean(dismissingTodoIds[item.id]);

              return (
              <label key={item.id} className={`study-plan-item${isDismissing ? " is-dismissing" : ""}`}>
                <input
                  type="checkbox"
                  checked={isDismissing || Boolean(item.completed)}
                  onChange={() => handleCompleteTodo(item.id)}
                  disabled={isDismissing}
                />
                <div className="study-plan-copy">
                  <strong>{item.title}</strong>
                  <p>{item.details}</p>
                </div>
              </label>
            );
            })}
          </div>
        ) : (
          <div className="explain-card" style={{ marginTop: "20px" }}>
            <h3>No committed plans yet</h3>
            <p className="student-helper">
              Commit a node from the PATH page and it will appear here automatically as a checklist item.
            </p>
          </div>
        )}
      </section>

      {showPersonaExplanation ? (
        <div className="persona-explain-overlay" onClick={() => setShowPersonaExplanation(false)}>
          <div className="persona-explain-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header panel-header-spread">
              <div>
                <p className="eyebrow">Persona Explanation</p>
                <h2>{primaryPersona.label}</h2>
              </div>
              <button className="secondary-button" type="button" onClick={() => setShowPersonaExplanation(false)}>
                Close
              </button>
            </div>

            <div className="insight-grid" style={{ marginTop: "20px" }}>
              <div className="explain-card">
                <h3>Why this persona is active</h3>
                <ul>
                  <li>Trusted persona: {primaryPersona.label}</li>
                  <li>Decision source: {scoreSource}</li>
                  <li>Current top match: {formatPercent(primaryPersona.matchScore)}</li>
                </ul>
              </div>

              <div className="explain-card">
                <h3>Calculation breakdown</h3>
                <ul>
                  {liveScores.map((score) => (
                    <li key={score.id}>
                      {score.label}: {formatPercent(score.value)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="explain-card" style={{ marginTop: "20px" }}>
              <h3>How BitBuddies decides</h3>
              <p className="student-helper">
                BitBuddies ranks the current persona scores and trusts the highest active one. The original onboarding
                quiz provides the starting label, and later behavior data can take over if the behavior signal becomes
                strong enough.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
