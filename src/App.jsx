import React, { useState } from "react";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";

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

  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left" />
      <div className="background-glow background-glow-right" />

      {screen === "landing" ? (
        <LandingPage
          onStart={() => setScreen("auth")}
          onLoginSuccess={handleAuthComplete}  // ← was missing
        />
      ) : null}

      {screen === "auth" ? (
        <AuthPage
          onBack={() => setScreen("landing")}
          onComplete={handleAuthComplete}
        />
      ) : null}

      {screen === "home" && session ? (
        <HomePage user={session} onSignOut={handleSignOut} />
      ) : null}
    </div>
  );
}
