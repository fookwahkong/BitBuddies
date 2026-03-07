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
        <section className="landing-login-shell">
          <div className="landing-login-side">
            <button
              type="button"
              className="landing-login-back"
              onClick={() => {
                setShowLogin(false);
                setError("");
                setForm({ email: "", password: "" });
              }}
            >
              Back
            </button>

            <div className="brand-lockup landing-login-brand">
              <div className="brand-mark">B</div>
              <div>
                <p className="brand-name">BitBuddies</p>
                <p className="brand-tag landing-login-tag">Explainable study direction for exam prep</p>
              </div>
            </div>

            <div className="landing-login-copy">
              <p className="eyebrow landing-login-eyebrow">Returning Student</p>
              <h1 className="landing-login-title">
                <span>Welcome back.</span>
              </h1>

              <div className="landing-login-note">
                <strong>What waits inside</strong>
                <p>Practice recommendations, ToDo pathways, and revision signals remain connected to your latest activity.</p>
              </div>
            </div>

            <p className="landing-login-footer">
              BitBuddies keeps your study direction explainable, so every next step is tied back to persona, behavior,
              and recent practice.
            </p>
          </div>

          <div className="landing-login-form-panel">
            <div className="landing-login-form-shell">
              <p className="landing-login-form-kicker">Account Access</p>
              <form className="auth-form landing-login-form" onSubmit={handleLogin}>
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

              <div className="landing-login-register">
                <p>Need an account?</p>
                <button
                  type="button"
                  className="secondary-button full-width"
                  onClick={() => {
                    setShowLogin(false);
                    onStart();
                  }}
                >
                  Start your assessment
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
