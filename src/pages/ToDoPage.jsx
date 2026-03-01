import React from "react";
import TopNav from "../components/TopNav";

const tasks = [
  {
    id: "task-1",
    title: "Complete 5 Chain Rule questions",
    detail: "Focus on medium difficulty and review the first mistake immediately.",
    status: "Today",
  },
  {
    id: "task-2",
    title: "Review vectors justification checklist",
    detail: "Practice writing the final explanation line after solving the calculation.",
    status: "Next",
  },
  {
    id: "task-3",
    title: "Attempt one timed mixed question",
    detail: "Use it to test whether the concept holds under exam pressure.",
    status: "Stretch",
  },
];

export default function ToDoPage({ user, onBackHome, onSignOut }) {
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
          <h1>Your recommended revision tasks are organized here.</h1>
          <p className="hero-text">
            This page turns the BitBuddies recommendation into a concrete task list. Start with the highest
            impact task first, then move down in order.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">Current persona</span>
            <strong>{user.persona.label}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Priority block</span>
            <strong>Differentiation and Algebra</strong>
          </div>
          <div className="stat-card stat-card-highlight">
            <span className="stat-label">Goal</span>
            <strong>Convert the next best move into short, trackable actions.</strong>
          </div>
        </div>
      </section>

      <section className="student-card">
        <div className="panel-header">
          <p className="eyebrow">Task Queue</p>
          <h2>Today&apos;s focused revision list</h2>
        </div>

        <div className="todo-list">
          {tasks.map((task) => (
            <div key={task.id} className="todo-card">
              <span className="todo-badge">{task.status}</span>
              <h3>{task.title}</h3>
              <p>{task.detail}</p>
            </div>
          ))}
        </div>

        <button className="primary-button todo-back-button" type="button" onClick={onBackHome}>
          Return to homepage
        </button>
      </section>
    </main>
  );
}
