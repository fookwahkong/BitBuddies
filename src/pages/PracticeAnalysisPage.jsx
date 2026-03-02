import React, { useEffect } from "react";
import TopNav from "../components/TopNav";

export default function PracticeAnalysisPage({
  user,
  analysis,
  onBackHome,
  onOpenPractice,
  onScanAnotherDocument,
  onOpenToDo,
  onOpenJudge,
  onOpenPersonas,
  onSignOut,
}) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  if (!analysis) {
    return (
      <main className="screen-shell">
        <TopNav
          user={user}
          onOpenPractice={onOpenPractice}
          onOpenToDo={onOpenToDo}
          onOpenJudge={onOpenJudge}
          onOpenPersonas={onOpenPersonas}
          onGoHome={onBackHome}
          onSignOut={onSignOut}
          activePage="practice"
        />

        <section className="student-card">
          <div className="panel-header">
            <p className="eyebrow">Practice Analysis</p>
            <h2>No document analysis available.</h2>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenPractice={onOpenPractice}
        onOpenToDo={onOpenToDo}
        onOpenJudge={onOpenJudge}
        onOpenPersonas={onOpenPersonas}
        onGoHome={onBackHome}
        onSignOut={onSignOut}
        activePage="practice"
      />

      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Document Analysis</p>
          <p className="hero-kicker">{analysis.title}</p>
          <h1>BitBuddies turned the uploaded practice into a next-step analysis.</h1>
          <p className="hero-text">{analysis.summary}</p>
        </div>

        <div className="hero-stats">
          {analysis.evidence.map((item) => (
            <div key={item} className="stat-card">
              <strong>{item}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="student-card">
        <div className="panel-header">
          <p className="eyebrow">Document Signals</p>
          <h2>What BitBuddies pulled from this logged practice</h2>
        </div>
        <div className="insight-grid" style={{ marginTop: "20px" }}>
          <div className="explain-card">
            <h3>Snapshot</h3>
            <ul>
              {analysis.documentSignals.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="action-card">
            <h3>Recommended next actions</h3>
            <ul>
              {analysis.recommendedActions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="student-card">
        <div className="panel-header">
          <p className="eyebrow">Persona-Based Advice</p>
          <h2>Recommendations from learners with a similar persona pattern</h2>
        </div>
        <div className="insight-grid" style={{ marginTop: "20px" }}>
          <div className="action-card">
            <h3>What similar learners do next</h3>
            <ul>
              {analysis.personaPeerInsights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="action-card">
            <h3>Based on your own history</h3>
            <ul>
              {analysis.personalHistoryRecommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="wizard-actions wizard-actions-spread" style={{ marginTop: "20px" }}>
          <button className="secondary-button" type="button" onClick={onScanAnotherDocument}>
            Scan another document
          </button>
          <button className="secondary-button" type="button" onClick={onOpenToDo}>
            Go to ToDo
          </button>
          <button className="primary-button" type="button" onClick={onBackHome}>
            Return to homepage
          </button>
        </div>
      </section>
    </main>
  );
}
