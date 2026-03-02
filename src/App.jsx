import React, { useState } from "react";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import PracticePage from "./pages/PracticePage";
import JudgePage from "./pages/JudgePage";
import PersonasPage from "./pages/PersonasPage";
import ToDoPage from "./pages/ToDoPage";
import { recordLearningAction, seedDemoLearningJourney } from "./data/studentProgress";

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

  async function handleSeedDemoJourney() {
    if (!session) {
      return;
    }

    const updatedSession = await seedDemoLearningJourney(session);
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
          onOpenJudge={() => setScreen("judge")}
          onOpenPersonas={() => setScreen("personas")}
        />
      ) : null}

      {screen === "practice" && session ? (
        <PracticePage
          user={session}
          onBackHome={() => setScreen("home")}
          onLogLearningAction={handleLearningAction}
          onOpenToDo={() => setScreen("todo")}
          onOpenJudge={() => setScreen("judge")}
          onOpenPersonas={() => setScreen("personas")}
          onSignOut={handleSignOut}
        />
      ) : null}

      {screen === "judge" && session ? (
        <JudgePage
          user={session}
          onBackHome={() => setScreen("home")}
          onOpenPractice={() => setScreen("practice")}
          onOpenToDo={() => setScreen("todo")}
          onOpenPersonas={() => setScreen("personas")}
          onSignOut={handleSignOut}
          onSeedDemoJourney={handleSeedDemoJourney}
        />
      ) : null}

      {screen === "personas" && session ? (
        <PersonasPage
          user={session}
          onBackHome={() => setScreen("home")}
          onOpenPractice={() => setScreen("practice")}
          onOpenToDo={() => setScreen("todo")}
          onOpenJudge={() => setScreen("judge")}
          onSignOut={handleSignOut}
        />
      ) : null}

      {screen === "todo" && session ? (
        <ToDoPage
          user={session}
          onLogLearningAction={handleLearningAction}
          onBackHome={() => setScreen("home")}
          onOpenPractice={() => setScreen("practice")}
          onOpenJudge={() => setScreen("judge")}
          onOpenPersonas={() => setScreen("personas")}
          onSignOut={handleSignOut}
        />
      ) : null}
    </div>
  );
}
