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
      {!showLogin ? (
        <section className="landing-hero landing-hero-minimal">
          <div className="landing-copy landing-copy-minimal">
            <p className="eyebrow">BitBuddies</p>
            <h1>BitBuddies</h1>
            <p className="hero-text landing-text-minimal">
              A study dashboard that reads revision behavior, identifies learning personas, and turns it into
              clearer next-step guidance.
            </p>
            <div className="hero-actions landing-actions-minimal">
              <button className="primary-button" type="button" onClick={onStart}>
                Start assessment
              </button>
              <button className="secondary-button" type="button" onClick={() => setShowLogin(true)}>
                Login
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <header className="top-bar">
            <div className="brand-lockup">
              <div className="brand-mark">B</div>
              <div>
                <p className="brand-name">BitBuddies</p>
                <p className="brand-tag">Explainable study direction for exam prep</p>
              </div>
            </div>
          </header>

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

              <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#6b7693" }}>
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
                onClick={() => {
                  setShowLogin(false);
                  setError("");
                  setForm({ email: "", password: "" });
                }}
                className="status-pill status-pill-button"
                style={{ marginTop: "1rem" }}
              >
                Back
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
