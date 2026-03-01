import React, { useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

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
      // Query Firestore for a user with matching email
      const usersRef = collection(db, "students");
      const q = query(usersRef, where("email", "==", form.email.trim()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError("No account found with this email. Please register first.");
        setLoading(false);
        return;
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();

      // Check password (plain comparison — use Firebase Auth for production hashing)
      if (userData.password !== form.password) {
        setError("Incorrect password. Please try again.");
        setLoading(false);
        return;
      }

      // Login success — pass user data up
      onLoginSuccess({
        studentID: userData.studentID,
        name: userData.username,
        email: userData.email,
        persona: userData.persona,
      });
    } catch (err) {
      console.error("Login error:", err?.code, err?.message);
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
              <h1>Find the study pattern behind your results before you even log in.</h1>
              <p className="hero-text">
                BitBuddies turns revision behavior into a clear student persona, then uses that persona to
                explain what to focus on next. This first screen introduces the product before the user enters
                the login and quiz flow.
              </p>
              <div className="hero-actions">
                <button className="primary-button" type="button" onClick={onStart}>
                  Start assessment
                </button>
                <div className="hero-proof">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setShowLogin(true)}
                  >
                    Login
                  </button>
                </div>
              </div>
            </div>

            <div className="landing-panel">
              <div className="landing-stat">
                <span className="stat-label">Step 1</span>
                <strong>Discover your revision persona</strong>
              </div>
              <div className="landing-stat">
                <span className="stat-label">Step 2</span>
                <strong>Log in with context instead of generic onboarding</strong>
              </div>
              <div className="landing-stat">
                <span className="stat-label">Step 3</span>
                <strong>See a homepage that explains your next best move</strong>
              </div>
            </div>
          </section>

          <section className="overview-strip">
            <div className="overview-card">
              <span className="overview-label">Why it exists</span>
              <strong>Students often revise without knowing their actual behavioral pattern.</strong>
            </div>
            <div className="overview-card">
              <span className="overview-label">What changes</span>
              <strong>The product makes learning strategy visible before showing recommendations.</strong>
            </div>
            <div className="overview-card">
              <span className="overview-label">What comes next</span>
              <strong>Login, complete a short persona test, then enter a personalized homepage.</strong>
            </div>
          </section>
        </>
      ) : (
        <section className="auth-layout">
          <div className="auth-panel">
            <p className="eyebrow">Returning Student</p>
            <h1 className="auth-title">Welcome back. Log in to continue your study journey.</h1>

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

              <button
                className="primary-button full-width"
                type="submit"
                disabled={loading}
              >
                {loading ? "Logging in…" : "Login"}
              </button>
            </form>

            <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#666" }}>
              Don't have an account?{" "}
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
              ← Back
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
