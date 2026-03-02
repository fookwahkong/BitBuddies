import React, { useMemo, useState } from "react";
import TopNav from "../components/TopNav";

function buildDefaultMetadata(subjects = [], file = null) {
  const fallbackSubject = subjects[0] || null;

  return {
    subjectId: fallbackSubject?.id || "",
    detectedTopic: fallbackSubject?.label ? `${fallbackSubject.label} Core Skills` : "General Practice",
    questionType: file?.type?.includes("pdf") ? "Worksheet Upload" : "Question Snapshot",
    difficulty: 2,
  };
}

function formatFileSize(size) {
  if (!size) {
    return "0 KB";
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function PracticePage({
  user,
  onBackHome,
  onLogLearningAction,
  onOpenToDo,
  onSignOut,
}) {
  const subjects = useMemo(() => user?.academicProfile?.subjects || [], [user]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [metadata, setMetadata] = useState(() => buildDefaultMetadata(subjects));
  const [attempt, setAttempt] = useState({
    questionId: "",
    isCorrect: "correct",
    timeSpentSec: "120",
    attemptNo: "1",
    hintUsed: false,
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hasUploadedFile = Boolean(selectedFile);
  const selectedSubject = subjects.find((subject) => subject.id === metadata.subjectId) || subjects[0] || null;

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;

    if (!file) {
      return;
    }

    setSelectedFile(file);
    setMetadata(buildDefaultMetadata(subjects, file));
    setStatus("File received. Confirm the extracted details before logging the attempt.");
    setError("");
  }

  function handleMetadataChange(event) {
    const { name, value } = event.target;
    setMetadata((current) => ({ ...current, [name]: name === "difficulty" ? Number(value) : value }));
    setStatus("");
    setError("");
  }

  function handleAttemptChange(event) {
    const { name, type, checked, value } = event.target;
    setAttempt((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setStatus("");
    setError("");
  }

  function handleResetUpload(nextStatus = "") {
    setSelectedFile(null);
    setMetadata(buildDefaultMetadata(subjects));
    setAttempt({
      questionId: "",
      isCorrect: "correct",
      timeSpentSec: "120",
      attemptNo: "1",
      hintUsed: false,
    });
    setStatus(nextStatus);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedFile) {
      setError("Upload a PDF or image before logging the attempt.");
      return;
    }

    if (!metadata.subjectId || !metadata.detectedTopic.trim()) {
      setError("Confirm the detected subject and topic before logging the attempt.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");

    try {
      await onLogLearningAction({
        eventType: "attempt",
        subjectId: metadata.subjectId,
        topicId: metadata.subjectId,
        questionId: attempt.questionId.trim() || `practice-${Date.now()}`,
        isCorrect: attempt.isCorrect === "correct",
        timeSpentSec: Number(attempt.timeSpentSec) || 0,
        attemptNo: Number(attempt.attemptNo) || 1,
        hintUsed: Boolean(attempt.hintUsed),
        difficulty: Number(metadata.difficulty) || 2,
        detectedTopic: metadata.detectedTopic.trim(),
        questionType: metadata.questionType.trim(),
        sourceFile: {
          name: selectedFile.name,
          type: selectedFile.type || "unknown",
          size: selectedFile.size || 0,
        },
      });

      handleResetUpload("Attempt logged. Upload another file when you are ready.");
    } catch (submissionError) {
      console.error("Practice logging error:", submissionError);
      setError("The attempt could not be logged. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenPractice={() => {}}
        onOpenToDo={onOpenToDo}
        onGoHome={onBackHome}
        onSignOut={onSignOut}
        activePage="practice"
      />

      {!hasUploadedFile ? (
        <section className="practice-stage-card practice-upload-stage">
          <div className="practice-stage-shell">
            <p className="eyebrow">Practice Intake</p>
            <h1 className="auth-title">Upload a PDF or image to begin.</h1>
            <p className="hero-text practice-stage-copy">
              This intake step is intentionally minimal. Upload first, then BitBuddies will show a confirmation
              screen with the extracted practice details.
            </p>

            <label className="practice-upload-dropzone" htmlFor="practice-upload-input">
              <span className="practice-upload-label">Choose file</span>
              <span className="practice-upload-helper">PDF, worksheet image, or question snapshot</span>
            </label>

            <input
              id="practice-upload-input"
              className="practice-upload-input"
              type="file"
              accept=".pdf,image/*"
              onChange={handleFileChange}
            />

            {status ? <p className="hero-text practice-status-text">{status}</p> : null}
            {error ? <p className="form-error practice-status-text">{error}</p> : null}
          </div>
        </section>
      ) : (
        <section className="practice-stage-card">
          <div className="panel-header panel-header-spread">
            <div>
              <p className="eyebrow">Confirmation</p>
              <h2>Review the uploaded file details before logging the attempt.</h2>
            </div>
            <button className="secondary-button" type="button" onClick={handleResetUpload}>
              Upload another file
            </button>
          </div>

          <div className="insight-grid" style={{ marginTop: "20px" }}>
            <div className="explain-card">
              <h3>Uploaded file</h3>
              <ul>
                <li>{selectedFile.name}</li>
                <li>{selectedFile.type || "Unknown file type"}</li>
                <li>{formatFileSize(selectedFile.size || 0)}</li>
              </ul>
            </div>

            <div className="explain-card">
              <h3>Current subject prior</h3>
              <ul>
                <li>{selectedSubject?.label || "No subject selected yet"}</li>
                <li>{selectedSubject?.masteryScore || 0}/100 starting mastery</li>
                <li>{((selectedSubject?.normalizedWeight || 0) * 100).toFixed(0)}% impact weight</li>
              </ul>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="inline-field-row">
              <label className="input-group">
                <span>Detected subject</span>
                <select name="subjectId" value={metadata.subjectId} onChange={handleMetadataChange}>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="input-group">
                <span>Difficulty</span>
                <select name="difficulty" value={metadata.difficulty} onChange={handleMetadataChange}>
                  <option value={1}>1 - Foundational</option>
                  <option value={2}>2 - Standard</option>
                  <option value={3}>3 - Challenging</option>
                </select>
              </label>
            </div>

            <div className="inline-field-row">
              <label className="input-group">
                <span>Detected topic</span>
                <input
                  name="detectedTopic"
                  type="text"
                  value={metadata.detectedTopic}
                  onChange={handleMetadataChange}
                  placeholder="Algebraic manipulation"
                />
              </label>

              <label className="input-group">
                <span>Question type</span>
                <input
                  name="questionType"
                  type="text"
                  value={metadata.questionType}
                  onChange={handleMetadataChange}
                  placeholder="Worksheet Upload"
                />
              </label>
            </div>

            <div className="inline-field-row">
              <label className="input-group">
                <span>Question ID (optional)</span>
                <input
                  name="questionId"
                  type="text"
                  value={attempt.questionId}
                  onChange={handleAttemptChange}
                  placeholder="Q-ALG-042"
                />
              </label>

              <label className="input-group">
                <span>Result</span>
                <select name="isCorrect" value={attempt.isCorrect} onChange={handleAttemptChange}>
                  <option value="correct">Correct</option>
                  <option value="wrong">Wrong</option>
                </select>
              </label>
            </div>

            <div className="inline-field-row">
              <label className="input-group">
                <span>Time spent (sec)</span>
                <input
                  name="timeSpentSec"
                  type="number"
                  min="0"
                  value={attempt.timeSpentSec}
                  onChange={handleAttemptChange}
                />
              </label>

              <label className="input-group">
                <span>Attempt no.</span>
                <input
                  name="attemptNo"
                  type="number"
                  min="1"
                  value={attempt.attemptNo}
                  onChange={handleAttemptChange}
                />
              </label>
            </div>

            <label className="checkbox-row">
              <input
                name="hintUsed"
                type="checkbox"
                checked={attempt.hintUsed}
                onChange={handleAttemptChange}
              />
              <span>Hint used during this attempt</span>
            </label>

            {status ? <p className="hero-text practice-status-text">{status}</p> : null}
            {error ? <p className="form-error practice-status-text">{error}</p> : null}

            <div className="wizard-actions wizard-actions-spread">
              <button className="secondary-button" type="button" onClick={onBackHome}>
                Back to dashboard
              </button>
              <button className="primary-button" type="submit" disabled={loading || !subjects.length}>
                {loading ? "Logging attempt..." : "Log practice attempt"}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
