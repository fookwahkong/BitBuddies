import React, { useState } from "react";
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { quizQuestions } from "../data/personaQuiz";
import { buildInitialStudentModel, buildSessionFromStudentRecord } from "../data/learningRadar";

function generateStudentID() {
  return `STU-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;
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
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const missingAnswers = quizQuestions.some((question) => !answers[question.id]);

    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Fill in your name, email, and password before continuing.");
      return;
    }

    if (missingAnswers) {
      setError("Complete all 10 onboarding questions so BitBuddies can set the initial radar.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const usersRef = collection(db, "students");
      const existingQuery = query(usersRef, where("email", "==", form.email.trim()));
      const existingSnapshot = await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        setError("This email is already registered. Please log in instead.");
        setLoading(false);
        return;
      }

      const now = Date.now();
      const studentID = generateStudentID();
      const onboardingAnswers = quizQuestions.reduce((result, question) => {
        result[question.id] = answers[question.id];
        return result;
      }, {});
      const initialStudent = buildInitialStudentModel({
        name: form.name.trim(),
        email: form.email.trim(),
        answers,
        questions: quizQuestions,
        timestamp: now,
      });
      const answersMap = quizQuestions.reduce((result, question, index) => {
        result[`q${index + 1}`] = answers[question.id];
        return result;
      }, {});

      const studentRecord = {
        studentID,
        username: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        onboardingAnswers,
        persona: initialStudent.persona,
        learningRadar: initialStudent.learningRadar,
        ...answersMap,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };

      const createdStudent = await addDoc(usersRef, studentRecord);
      onComplete(buildSessionFromStudentRecord({ ...studentRecord, docId: createdStudent.id }));
    } catch (submissionError) {
      console.error("Registration error:", submissionError);
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
          <h1 className="auth-title">Create your profile and set your first Learning Radar baseline.</h1>

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

            <button className="primary-button full-width" type="submit" disabled={loading}>
              {loading ? "Saving profile..." : "Register and continue"}
            </button>
          </form>
        </div>

        <div className="quiz-panel">
          <div className="panel-header">
            <p className="eyebrow">Onboarding Quiz</p>
            <h2>Answer 10 questions so BitBuddies can infer the initial persona and radar base scores.</h2>
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
