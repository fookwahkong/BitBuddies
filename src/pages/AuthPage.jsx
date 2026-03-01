import React, { useState } from "react";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { calculatePersona, quizQuestions } from "../data/personaQuiz";


// Generates a simple unique student ID, e.g. "STU-1A2B3C4D"
function generateStudentID() {
  return "STU-" + Math.random().toString(36).toUpperCase().substring(2, 10);
}

export default function AuthPage({ onBack, onComplete }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleInputChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
  }

  function handleAnswerChange(questionId, value) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const missingAnswers = quizQuestions.some((question) => !answers[question.id]);

    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Fill in your name, email, and password before continuing.");
      return;
    }

    if (missingAnswers) {
      setError("Complete all persona questions so BitBuddies can classify the student profile.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Check if email already registered
      const usersRef = collection(db, "students");
      const existingQuery = query(usersRef, where("email", "==", form.email.trim()));
      const existingSnapshot = await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        setError("This email is already registered. Please log in instead.");
        setLoading(false);
        return;
      }

      const persona = calculatePersona(answers);
      const studentID = generateStudentID();

      // Build answers map: { q1: "answer", q2: "answer", ... }
      const answersMap = {};
      quizQuestions.forEach((question, index) => {
        answersMap[`q${index + 1}`] = answers[question.id];
      });

      // Save to Firestore
      await addDoc(usersRef, {
        studentID,
        username: form.name.trim(),
        email: form.email.trim(),
        password: form.password, // ⚠️ Plain text — switch to Firebase Auth for production
        persona,
        ...answersMap,           // q1, q2, q3, q4, q5
        createdAt: new Date().toISOString(),
      });

      onComplete({
        studentID,
        name: form.name.trim(),
        email: form.email.trim(),
        persona,
      });
    } catch (err) {
      console.error("Registration error:", err);
      setError("Something went wrong while saving your profile. Please try again.");
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
            <p className="brand-tag">Login and persona intake</p>
          </div>
        </div>
        <button className="status-pill status-pill-button" type="button" onClick={onBack}>
          Back
        </button>
      </header>

      <section className="auth-layout">
        <div className="auth-panel">
          <p className="eyebrow">New Student</p>
          <h1 className="auth-title">Create your profile and discover your study persona.</h1>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="input-group">
              <span>Name</span>
              <input
                name="name"
                type="text"
                placeholder="Alya Tan"
                value={form.name}
                onChange={handleInputChange}
              />
            </label>
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
                placeholder="Create a password"
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
              {loading ? "Saving profile…" : "Register and continue"}
            </button>
          </form>
        </div>

        <div className="quiz-panel">
          <div className="panel-header">
            <p className="eyebrow">Persona Test</p>
            <h2>Answer these hypothetical questions to assign a study persona.</h2>
          </div>

          <div className="quiz-list">
            {quizQuestions.map((question, index) => (
              <div key={question.id} className="quiz-card">
                <p className="quiz-step">Question {index + 1}</p>
                <h3>{question.prompt}</h3>
                <div className="quiz-options">
                  {question.options.map((option) => (
                    <label key={option.value} className="quiz-option">
                      <input
                        type="radio"
                        name={question.id}
                        value={option.value}
                        checked={answers[question.id] === option.value}
                        onChange={() => handleAnswerChange(question.id, option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
