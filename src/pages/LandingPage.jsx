import React, { useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { buildSessionFromStudentRecord } from "../data/learningRadar";

export default function LandingPage({ onStart, onLoginSuccess }) {
  const [showLogin, setShowLogin] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleInputChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!form.email.trim() || !form.password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const usersRef = collection(db, "students");
      const userQuery = query(usersRef, where("email", "==", form.email.trim()));
      const snapshot = await getDocs(userQuery);

      if (snapshot.empty) {
        setError("No account was found with this email. Register first.");
        setLoading(false);
        return;
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();

      if (userData.password !== form.password) {
        setError("Incorrect password. Please try again.");
        setLoading(false);
        return;
      }

      onLoginSuccess(buildSessionFromStudentRecord({ ...userData, docId: userDoc.id }));
    } catch (loginError) {
      console.error("Login error:", loginError?.code, loginError?.message);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="screen-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <div className="brand-mark">B</div>
          <div>
            <p className="brand-name">BitBuddies</p>
            <p className="brand-tag">Explainable study direction for exam prep</p>
          </div>
        </div>
        <button className="status-pill" type="button">
          Hackathon Demo
        </button>
      </header>

      {!showLogin ? (
        <>
          <section className="landing-hero">
            <div className="landing-copy">
              <p className="eyebrow">Landing Page</p>
              <p className="hero-kicker">BitBuddies</p>
              <h1>Set a Learning Radar before enough activity exists to personalize it.</h1>
              <p className="hero-text">
                BitBuddies starts with an onboarding persona prior, then shifts toward behavior-based radar
                scores once meaningful learning events accumulate. The experience stays explainable from day
                one instead of showing blank analytics.
              </p>
              <div className="hero-actions">
                <button className="primary-button" type="button" onClick={onStart}>
                  Start assessment
                </button>
                <div className="hero-proof">
                  <button className="secondary-button" type="button" onClick={() => setShowLogin(true)}>
                    Login
                  </button>
                </div>
              </div>
            </div>

            <div className="landing-panel">
              <div className="landing-stat">
                <span className="stat-label">Step 1</span>
                <strong>Use 10 onboarding questions to classify the starting persona mix.</strong>
              </div>
              <div className="landing-stat">
                <span className="stat-label">Step 2</span>
                <strong>Generate a cold-start radar using weighted persona base scores.</strong>
              </div>
              <div className="landing-stat">
                <span className="stat-label">Step 3</span>
                <strong>Recompute only after meaningful activity so the radar stays stable.</strong>
              </div>
            </div>
          </section>

          <section className="overview-strip">
            <div className="overview-card">
              <span className="overview-label">Cold Start</span>
              <strong>Every new student gets an explainable baseline from the onboarding answers.</strong>
            </div>
            <div className="overview-card">
              <span className="overview-label">Personalization</span>
              <strong>Behavior gradually overrides the prior as learning events accumulate.</strong>
            </div>
            <div className="overview-card">
              <span className="overview-label">Stability</span>
              <strong>Radar refreshes only after meaningful activity so scores do not swing daily.</strong>
            </div>
          </section>
        </>
      ) : (
        <section className="auth-layout">
          <div className="auth-panel">
            <p className="eyebrow">Returning Student</p>
            <h1 className="auth-title">Welcome back. Log in to continue from your latest radar state.</h1>

            <form className="auth-form" onSubmit={handleLogin}>
              <label className="input-group">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  placeholder="alya@example.com"
                  value={form.email}
                  onChange={handleInputChange}
                />
              </label>
              <label className="input-group">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handleInputChange}
                />
              </label>

              {error ? <p className="form-error">{error}</p> : null}

              <button className="primary-button full-width" type="submit" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>

            <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#aebdd4" }}>
              Need an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setShowLogin(false);
                  onStart();
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                  color: "inherit",
                  fontSize: "inherit",
                  padding: 0,
                }}
              >
                Start your assessment
              </button>
            </p>

            <button
              type="button"
              className="status-pill status-pill-button"
              onClick={() => {
                setShowLogin(false);
                setError("");
                setForm({ email: "", password: "" });
              }}
              style={{ marginTop: "1rem" }}
            >
              Back
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
