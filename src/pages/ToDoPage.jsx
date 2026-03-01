import React, { useState } from "react";
import TopNav from "../components/TopNav";

const tasks = [
  {
    id: "task-1",
    title: "Complete 5 Chain Rule questions",
    detail: "Focus on medium difficulty and review the first mistake immediately.",
    status: "Today",
    topicId: "differentiation_chain_rule",
    questionId: "chain-rule-01",
    difficulty: 2,
  },
  {
    id: "task-2",
    title: "Review vectors justification checklist",
    detail: "Practice writing the final explanation line after solving the calculation.",
    status: "Next",
    topicId: "vectors_justification",
    questionId: "vectors-justify-01",
    difficulty: 2,
  },
  {
    id: "task-3",
    title: "Attempt one timed mixed question",
    detail: "Use it to test whether the concept holds under exam pressure.",
    status: "Stretch",
    topicId: "mixed_exam_practice",
    questionId: "mixed-01",
    difficulty: 3,
  },
];

function createAttemptPayload(task) {
  const isCorrect = task.id !== "task-3";
  const timeTakenSec = task.difficulty === 3 ? 215 : task.difficulty === 2 ? 135 : 95;

  return {
    eventType: "attempt",
    topicId: task.topicId,
    questionId: task.questionId,
    difficulty: task.difficulty,
    isCorrect,
    timeTakenSec,
  };
}

function createReviewPayload(task) {
  return {
    eventType: "review",
    topicId: task.topicId,
    questionId: task.questionId,
    difficulty: task.difficulty,
  };
}

function createRetryPayload(task) {
  return {
    eventType: "retry",
    topicId: task.topicId,
    questionId: task.questionId,
    difficulty: task.difficulty,
    isCorrect: true,
    timeTakenSec: Math.max(60, task.difficulty * 70),
  };
}

export default function ToDoPage({ user, onBackHome, onLogLearningAction, onSignOut }) {
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [message, setMessage] = useState("");

  async function handleTaskAction(task, payload, label) {
    setBusyTaskId(task.id);

    try {
      const action = {
        ...payload,
        timestamp: Date.now(),
      };
      const updatedUser = await onLogLearningAction(action);
      const didRecompute = updatedUser?.learningRadar?.meta?.lastComputedAt === action.timestamp;
      const pendingEventCount = updatedUser?.learningRadar?.meta?.pendingEventCount || 0;

      if (didRecompute) {
        setMessage(`${label} logged for ${task.title}. The Learning Radar was recomputed and saved.`);
      } else {
        setMessage(
          `${label} logged for ${task.title}. Event saved to Firestore. ${pendingEventCount} new event(s) are queued before the next radar refresh.`,
        );
      }
    } catch (error) {
      console.error("Failed to log learning action:", error);
      setMessage("The action could not be saved. Please try again.");
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenToDo={() => {}}
        onGoHome={onBackHome}
        onSignOut={onSignOut}
        activePage="todo"
      />

      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">ToDo Page</p>
          <p className="hero-kicker">{user.name}</p>
          <h1>Use these task actions to generate the first real learning events.</h1>
          <p className="hero-text">
            Each action below writes a structured learning event into Firestore. Once meaningful activity is
            reached, BitBuddies recomputes and stores the latest Learning Radar on the student record.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">Current persona</span>
            <strong>{user.persona.primary.label}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Logged events</span>
            <strong>{user.learningRadar?.meta?.totalEvents || 0}</strong>
          </div>
          <div className="stat-card stat-card-highlight">
            <span className="stat-label">Refresh rule</span>
            <strong>Radar updates after meaningful activity and persists to Firestore.</strong>
          </div>
        </div>
      </section>

      <section className="student-card">
        <div className="panel-header">
          <p className="eyebrow">Task Queue</p>
          <h2>Log real study actions</h2>
        </div>

        {message ? <p className="todo-feedback">{message}</p> : null}

        <div className="todo-list">
          {tasks.map((task) => {
            const isBusy = busyTaskId === task.id;

            return (
              <div key={task.id} className="todo-card">
                <span className="todo-badge">{task.status}</span>
                <h3>{task.title}</h3>
                <p>{task.detail}</p>

                <div className="todo-action-row">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleTaskAction(task, createAttemptPayload(task), "Attempt")}
                  >
                    {isBusy ? "Saving..." : "Log attempt"}
                  </button>
                  <button
                    className="secondary-button todo-action-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleTaskAction(task, createReviewPayload(task), "Review")}
                  >
                    Log review
                  </button>
                  <button
                    className="secondary-button todo-action-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleTaskAction(task, createRetryPayload(task), "Retry")}
                  >
                    Log retry
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button className="primary-button todo-back-button" type="button" onClick={onBackHome}>
          Return to homepage
        </button>
      </section>
    </main>
  );
}
