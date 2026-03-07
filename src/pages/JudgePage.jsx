import React, { useEffect, useState } from "react";
import TopNav from "../components/TopNav";
import { buildTrainingSnapshotCsv, fetchTrainingSnapshots } from "../data/studentProgress";

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Not available";
  }

  return new Date(timestamp).toLocaleString();
}

function downloadTextFile(filename, contents, mimeType) {
  const blob = new Blob([contents], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function LabelHistoryChart({ snapshots }) {
  if (!snapshots.length) {
    return <p className="debug-message">No snapshots available yet.</p>;
  }

  const orderedSnapshots = [...snapshots].reverse();

  return (
    <div className="label-history-chart" aria-label="Judge desk label history">
      {orderedSnapshots.map((snapshot) => (
        <div key={snapshot.id} className="label-history-bar-wrap">
          <div
            className={`label-history-bar label-history-bar-${snapshot.canonicalLabel || "unknown"}`}
            style={{ height: `${Math.max(20, Math.round((snapshot.behaviorConfidence || 0.2) * 100))}%` }}
            title={`${snapshot.canonicalLabel || "unknown"} at ${formatDateTime(snapshot.timestamp)}`}
          />
          <span className="label-history-caption">{snapshot.canonicalLabel || "n/a"}</span>
        </div>
      ))}
    </div>
  );
}

export default function JudgePage({
  user,
  onBackHome,
  onOpenPractice,
  onOpenToDo,
  onOpenPersonas,
  onSignOut,
  onSeedDemoJourney,
  onSeedPatternJourney,
}) {
  const [trainingSnapshots, setTrainingSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importedSnapshots, setImportedSnapshots] = useState([]);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadSnapshots() {
      setLoading(true);
      setError("");

      try {
        const snapshots = await fetchTrainingSnapshots(user);

        if (!isActive) {
          return;
        }

        setTrainingSnapshots(snapshots);
      } catch (loadError) {
        console.error("Failed to load judge snapshots:", loadError);

        if (!isActive) {
          return;
        }

        setError("Training snapshots could not be loaded.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadSnapshots();

    return () => {
      isActive = false;
    };
  }, [user.docId, user.email, user.studentID, user.persona.lastLabelUpdatedAt]);

  function handleExportJson() {
    const filename = `${user.studentID || "student"}-judge-training-snapshots.json`;
    downloadTextFile(filename, JSON.stringify(trainingSnapshots, null, 2), "application/json");
  }

  function handleExportCsv() {
    const filename = `${user.studentID || "student"}-judge-training-snapshots.csv`;
    downloadTextFile(filename, buildTrainingSnapshotCsv(trainingSnapshots), "text/csv;charset=utf-8");
  }

  async function handleSeedDemo() {
    setSeeding(true);
    setError("");
    setSeedMessage("");

    try {
      await onSeedDemoJourney();
      setSeedMessage("Demo journey seeded. Open ToDo to inspect the updated recommendation card.");
    } catch (seedError) {
      console.error("Failed to seed from judge desk:", seedError);
      setError("Demo events could not be seeded.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleSeedPattern(patternType) {
    setSeeding(true);
    setError("");
    setSeedMessage("");

    try {
      await onSeedPatternJourney(patternType);
      setSeedMessage(`Pattern seed applied: ${patternType}. Open ToDo to verify the behavior card.`);
    } catch (seedError) {
      console.error(`Failed to seed ${patternType} pattern:`, seedError);
      setError(`Could not seed pattern: ${patternType}.`);
    } finally {
      setSeeding(false);
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const nextSnapshots = Array.isArray(parsed) ? parsed : [];
      setImportedSnapshots(nextSnapshots);
    } catch (importError) {
      console.error("Failed to import snapshot file:", importError);
      setError("The selected file is not a valid snapshot JSON export.");
    }
  }

  const visibleSnapshots = importedSnapshots.length ? importedSnapshots : trainingSnapshots;

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenPractice={onOpenPractice}
        onOpenToDo={onOpenToDo}
        onOpenJudge={() => {}}
        onOpenPersonas={onOpenPersonas}
        onGoHome={onBackHome}
        onSignOut={onSignOut}
        activePage="judge"
      />

      <section className="current-state-card">
        <div className="panel-header panel-header-spread">
          <div>
            <p className="eyebrow">Judge Desk</p>
            <h2>Inspect and export the training dataset without opening the dashboard.</h2>
          </div>
          <div className="debug-action-row">
            <button className="primary-button" type="button" onClick={handleSeedDemo} disabled={seeding}>
              {seeding ? "Seeding..." : "Seed demo events"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => handleSeedPattern("inactive")}
              disabled={seeding}
            >
              Seed inactive pattern
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => handleSeedPattern("bursty")}
              disabled={seeding}
            >
              Seed bursty pattern
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => handleSeedPattern("fragmented")}
              disabled={seeding}
            >
              Seed fragmented pattern
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => handleSeedPattern("deadlineDriven")}
              disabled={seeding}
            >
              Seed deadline pattern
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleExportJson}
              disabled={!trainingSnapshots.length}
            >
              Export JSON
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleExportCsv}
              disabled={!trainingSnapshots.length}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="insight-grid">
          <div className="explain-card">
            <h3>Current live dataset</h3>
            <ul>
              <li>{trainingSnapshots.length} saved training snapshot(s)</li>
              <li>{user.learningRadar?.meta?.totalEvents || 0} total learning events</li>
              <li>Current trusted label: {user.persona.canonicalLabel?.label || user.persona.primary.label}</li>
              <li>Current label source: {user.persona.labelSource === "behavior_rule" ? "Behavior Rule" : "Onboarding"}</li>
            </ul>
          </div>

          <div className="explain-card">
            <h3>Import preview</h3>
            <label className="input-group">
              <span>Load exported snapshot JSON</span>
              <input type="file" accept=".json,application/json" onChange={handleImportFile} />
            </label>
            <p className="student-helper">
              Imported files are preview-only. They do not overwrite Firestore.
            </p>
          </div>
        </div>

        {loading ? <p className="debug-message">Loading training snapshots...</p> : null}
        {error ? <p className="debug-message debug-message-error">{error}</p> : null}
        {seedMessage ? <p className="debug-message">{seedMessage}</p> : null}

        <div className="explain-card" style={{ marginTop: "18px" }}>
          <h3>Canonical label history</h3>
          <LabelHistoryChart snapshots={visibleSnapshots.slice(0, 10)} />
        </div>

        <div className="snapshot-list">
          {visibleSnapshots.slice(0, 10).map((snapshot, index) => (
            <div key={snapshot.id || `${snapshot.timestamp}-${index}`} className="snapshot-card">
              <div className="snapshot-card-header">
                <div>
                  <p className="axis-label">Snapshot</p>
                  <h3>{formatDateTime(snapshot.timestamp)}</h3>
                </div>
                <span className="snapshot-pill">{snapshot.labelSource === "behavior_rule" ? "Promoted" : "Weak"}</span>
              </div>
              <p className="axis-summary">
                {snapshot.totalEvents || 0} total events | canonical label: {snapshot.canonicalLabel || "unknown"}
              </p>
              <ul className="axis-signal-list">
                <li>Weak label: {snapshot.weakLabel || "unknown"}</li>
                <li>Behavior label: {snapshot.behaviorLabel || "not eligible"}</li>
                <li>Behavior confidence: {formatPercent(snapshot.behaviorConfidence)}</li>
                <li>Behavior margin: {formatPercent(snapshot.behaviorMargin)}</li>
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
