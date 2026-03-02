import React from "react";

export default function TopNav({
  user,
  onOpenPractice,
  onOpenJudge,
  onOpenToDo,
  onOpenPersonas,
  onGoHome,
  onSignOut,
  activePage,
}) {
  const profileLabel = user?.name ? user.name.charAt(0).toUpperCase() : "U";

  return (
    <header className="top-bar app-nav">
      <div className="nav-left">
        <button
          className={`nav-pill brand-pill ${activePage === "home" ? "nav-pill-active" : ""}`}
          type="button"
          onClick={onGoHome}
        >
          <span className="brand-mark small">B</span>
          <span>BitBuddies</span>
        </button>

        <button
          className={`nav-pill ${activePage === "practice" ? "nav-pill-active" : ""}`}
          type="button"
          onClick={onOpenPractice}
        >
          Practice
        </button>

        <button
          className={`nav-pill ${activePage === "todo" ? "nav-pill-active" : ""}`}
          type="button"
          onClick={onOpenToDo}
        >
          ToDo
        </button>

        <button
          className={`nav-pill ${activePage === "personas" ? "nav-pill-active" : ""}`}
          type="button"
          onClick={onOpenPersonas}
        >
          Personas
        </button>

        <button
          className={`nav-pill ${activePage === "judge" ? "nav-pill-active" : ""}`}
          type="button"
          onClick={onOpenJudge}
        >
          Judge Desk
        </button>
      </div>

      <div className="nav-right">
        <button className="nav-pill subtle-pill" type="button" onClick={onSignOut}>
          Sign out
        </button>
        <button className="profile-pill" type="button" aria-label={user?.name ? `${user.name} profile` : "Profile"}>
          <span className="profile-avatar">{profileLabel}</span>
          <span className="profile-text">{user?.name ?? "Student"}</span>
        </button>
      </div>
    </header>
  );
}
