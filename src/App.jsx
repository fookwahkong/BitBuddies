import React, { useState } from "react";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import PracticePage from "./pages/PracticePage";
import ToDoPage from "./pages/ToDoPage";
import { recordLearningAction } from "./data/studentProgress";

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [session, setSession] = useState(null);

  function handleAuthComplete(userProfile) {
    setSession(userProfile);
    setScreen("home");
  }

  function handleSignOut() {
    setSession(null);
    setScreen("landing");
  }

  async function handleLearningAction(action) {
    if (!session) {
      return;
    }

    const updatedSession = await recordLearningAction(session, action);
    setSession(updatedSession);
    return updatedSession;
  }

  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left" />
      <div className="background-glow background-glow-right" />

      {screen === "landing" ? (
        <LandingPage
          onStart={() => setScreen("auth")}
          onLoginSuccess={handleAuthComplete}
        />
      ) : null}

      {screen === "auth" ? (
        <AuthPage
          onBack={() => setScreen("landing")}
          onComplete={handleAuthComplete}
        />
      ) : null}

      {screen === "home" && session ? (
        <HomePage
          user={session}
          onSignOut={handleSignOut}
          onOpenPractice={() => setScreen("practice")}
          onOpenToDo={() => setScreen("todo")}
        />
      ) : null}

      {screen === "practice" && session ? (
        <PracticePage
          user={session}
          onBackHome={() => setScreen("home")}
          onLogLearningAction={handleLearningAction}
          onOpenToDo={() => setScreen("todo")}
          onSignOut={handleSignOut}
        />
      ) : null}

      {screen === "todo" && session ? (
        <ToDoPage
          user={session}
          onLogLearningAction={handleLearningAction}
          onBackHome={() => setScreen("home")}
          onSignOut={handleSignOut}
        />
      ) : null}
    </div>
  );
}
