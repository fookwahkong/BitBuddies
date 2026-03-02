import React, { useMemo, useState } from "react";
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { quizQuestions } from "../data/personaQuiz";
import { buildInitialStudentModel, buildSessionFromStudentRecord } from "../data/learningRadar";
import {
  buildAcademicProfile,
  buildSubjectMasteryModel,
  getCourseOptions,
  getSubjectOptions,
  importanceOptions,
  institutionOptions,
  weaknessOptions,
} from "../data/academicProfile";

function generateStudentID() {
  return `STU-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;
}

function buildAcademicStateForLevel(institutionLevel) {
  const subjects = getSubjectOptions(institutionLevel);
  const selectedSubjectIds = subjects.slice(0, 3).map((subject) => subject.id);
  const subjectConfigs = subjects.reduce((result, subject) => {
    result[subject.id] = {
      importanceScore: 2,
      weaknessScore: 2,
      examDate: "",
      targetGrade: "",
    };
    return result;
  }, {});

  return {
    institutionLevel,
    courseTrack: getCourseOptions(institutionLevel)[0],
    selectedSubjectIds,
    subjectConfigs,
  };
}

export default function AuthPage({ onBack, onComplete }) {
  const steps = [
    { id: "account", label: "Account", helper: "Create demo login details" },
    { id: "persona", label: "Persona", helper: "Answer the 10-question quiz" },
    { id: "academic", label: "Academic", helper: "Set subject weights and priors" },
  ];

  const [stepIndex, setStepIndex] = useState(0);
  const [account, setAccount] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [answers, setAnswers] = useState({});
  const [academic, setAcademic] = useState(() => buildAcademicStateForLevel("secondary"));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const subjectOptions = useMemo(
    () => getSubjectOptions(academic.institutionLevel),
    [academic.institutionLevel],
  );
  const selectedSubjects = useMemo(
    () => subjectOptions.filter((subject) => academic.selectedSubjectIds.includes(subject.id)),
    [academic.selectedSubjectIds, subjectOptions],
  );
  const currentStep = steps[stepIndex];
  const answeredCount = quizQuestions.filter((question) => answers[question.id]).length;

  function clearError() {
    setError("");
  }

  function handleAccountChange(event) {
    const { name, value } = event.target;
    setAccount((current) => ({ ...current, [name]: value }));
    clearError();
  }

  function handleAnswerChange(questionId, value) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    clearError();
  }

  function handleAcademicChange(event) {
    const { name, value } = event.target;

    if (name === "institutionLevel") {
      setAcademic(buildAcademicStateForLevel(value));
      clearError();
      return;
    }

    if (name === "courseTrack") {
      setAcademic((current) => ({ ...current, courseTrack: value }));
      clearError();
    }
  }

  function handleSubjectToggle(subjectId) {
    setAcademic((current) => {
      const selected = current.selectedSubjectIds.includes(subjectId)
        ? current.selectedSubjectIds.filter((value) => value !== subjectId)
        : [...current.selectedSubjectIds, subjectId];

      return {
        ...current,
        selectedSubjectIds: selected,
      };
    });
    clearError();
  }

  function handleSubjectConfigChange(subjectId, field, value) {
    setAcademic((current) => ({
      ...current,
      subjectConfigs: {
        ...current.subjectConfigs,
        [subjectId]: {
          ...current.subjectConfigs[subjectId],
          [field]: field === "importanceScore" || field === "weaknessScore" ? Number(value) : value,
        },
      },
    }));
    clearError();
  }

  function validateStep(index) {
    if (index === 0) {
      if (!account.username.trim() || !account.email.trim() || !account.password.trim()) {
        setError("Fill in your username, email, and password before continuing.");
        return false;
      }
      return true;
    }

    if (index === 1) {
      const missingAnswers = quizQuestions.some((question) => !answers[question.id]);

      if (missingAnswers) {
        setError("Complete all 10 onboarding questions so BitBuddies can classify the initial persona.");
        return false;
      }

      return true;
    }

    if (!academic.institutionLevel || !academic.courseTrack) {
      setError("Choose an institution level and course track.");
      return false;
    }

    if (!academic.selectedSubjectIds.length) {
      setError("Select at least one subject so BitBuddies can initialize BKT.");
      return false;
    }

    return true;
  }

  function moveToNextStep() {
    if (!validateStep(stepIndex)) {
      return;
    }

    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
    clearError();
  }

  function moveToPreviousStep() {
    setStepIndex((current) => Math.max(current - 1, 0));
    clearError();
  }

  async function handleCreateProfile(event) {
    event.preventDefault();

    if (!validateStep(2)) {
      return;
    }

    setLoading(true);
    clearError();

    try {
      const usersRef = collection(db, "students");
      const existingQuery = query(usersRef, where("email", "==", account.email.trim()));
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
        name: account.username.trim(),
        email: account.email.trim(),
        answers,
        questions: quizQuestions,
        timestamp: now,
      });
      const subjectPayload = selectedSubjects.map((subject) => ({
        id: subject.id,
        label: subject.label,
        ...academic.subjectConfigs[subject.id],
      }));
      const academicProfile = buildAcademicProfile({
        institutionLevel: academic.institutionLevel,
        courseTrack: academic.courseTrack,
        subjects: subjectPayload,
        timestamp: now,
      });
      const subjectMastery = buildSubjectMasteryModel(academicProfile, now);
      const answersMap = quizQuestions.reduce((result, question, index) => {
        result[`q${index + 1}`] = answers[question.id];
        return result;
      }, {});

      const studentRecord = {
        studentID,
        username: account.username.trim(),
        email: account.email.trim(),
        password: account.password,
        onboardingAnswers,
        persona: initialStudent.persona,
        personaConfidence: initialStudent.persona.primary.matchScore || 0,
        behaviorFeatures: initialStudent.behaviorFeatures,
        weakTopicSet: initialStudent.weakTopicSet,
        topicStats: initialStudent.topicStats,
        learningRadar: initialStudent.learningRadar,
        academicProfile,
        subjectMastery,
        practiceIntake: {
          lastUploadedSource: null,
          pendingMetadata: null,
        },
        studyPlanTodos: [],
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
            <p className="brand-tag">Multi-step onboarding wizard</p>
          </div>
        </div>
        <button className="status-pill status-pill-button" type="button" onClick={onBack}>
          Back
        </button>
      </header>

      <section className="auth-layout">
        <div className="auth-panel">
          <p className="eyebrow">New Student</p>
          <h1 className="auth-title">Create your profile, then set the first revision and mastery baselines.</h1>
          <p className="hero-text" style={{ marginTop: "14px" }}>
            Account details come first, the persona quiz sets the revision-behavior prior, and the academic setup
            initializes subject-level BKT before any practice is logged.
          </p>

          <div className="wizard-steps">
            {steps.map((step, index) => {
              const isActive = index === stepIndex;
              const isComplete = index < stepIndex;

              return (
                <div
                  key={step.id}
                  className={`wizard-step${isActive ? " wizard-step-active" : ""}${isComplete ? " wizard-step-complete" : ""}`}
                >
                  <span className="wizard-step-index">{index + 1}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.helper}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="todo-feedback" style={{ marginTop: "20px" }}>
            {currentStep.id === "account" ? "Step A: collect demo login details." : null}
            {currentStep.id === "persona" ? `Step B: ${answeredCount}/10 quiz answers completed.` : null}
            {currentStep.id === "academic"
              ? `Step C: ${selectedSubjects.length} subject(s) selected for initial BKT tracking.`
              : null}
          </div>

          {error ? <p className="form-error" style={{ marginTop: "16px" }}>{error}</p> : null}
        </div>

        <div className="quiz-panel">
          {stepIndex === 0 ? (
            <>
              <div className="panel-header">
                <p className="eyebrow">Step A</p>
                <h2>Enter the account details first.</h2>
              </div>

              <form
                className="auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  moveToNextStep();
                }}
              >
                <label className="input-group">
                  <span>Username</span>
                  <input
                    name="username"
                    type="text"
                    placeholder="Alya Tan"
                    value={account.username}
                    onChange={handleAccountChange}
                  />
                </label>
                <label className="input-group">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    placeholder="alya@example.com"
                    value={account.email}
                    onChange={handleAccountChange}
                  />
                </label>
                <label className="input-group">
                  <span>Password</span>
                  <input
                    name="password"
                    type="password"
                    placeholder="Create a password"
                    value={account.password}
                    onChange={handleAccountChange}
                  />
                </label>

                <div className="wizard-actions">
                  <button className="primary-button" type="submit">
                    Continue to persona quiz
                  </button>
                </div>
              </form>
            </>
          ) : null}

          {stepIndex === 1 ? (
            <>
              <div className="panel-header">
                <p className="eyebrow">Step B</p>
                <h2>Answer 10 questions so BitBuddies can infer the initial persona and revision radar.</h2>
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

              <div className="wizard-actions wizard-actions-spread">
                <button className="secondary-button" type="button" onClick={moveToPreviousStep}>
                  Back
                </button>
                <button className="primary-button" type="button" onClick={moveToNextStep}>
                  Continue to academic setup
                </button>
              </div>
            </>
          ) : null}

          {stepIndex === 2 ? (
            <>
              <div className="panel-header">
                <p className="eyebrow">Step C</p>
                <h2>Set the academic context and initial subject weights.</h2>
              </div>

              <form className="auth-form" onSubmit={handleCreateProfile}>
                <div className="inline-field-row">
                  <label className="input-group">
                    <span>Institution level</span>
                    <select
                      name="institutionLevel"
                      value={academic.institutionLevel}
                      onChange={handleAcademicChange}
                    >
                      {institutionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="input-group">
                    <span>Course / track</span>
                    <select name="courseTrack" value={academic.courseTrack} onChange={handleAcademicChange}>
                      {getCourseOptions(academic.institutionLevel).map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="input-group">
                  <span>Subjects / modules</span>
                  <div className="selection-grid">
                    {subjectOptions.map((subject) => {
                      const isActive = academic.selectedSubjectIds.includes(subject.id);

                      return (
                        <button
                          key={subject.id}
                          type="button"
                          className={`selection-chip${isActive ? " selection-chip-active" : ""}`}
                          onClick={() => handleSubjectToggle(subject.id)}
                        >
                          {subject.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="subject-config-list">
                  {selectedSubjects.map((subject) => {
                    const config = academic.subjectConfigs[subject.id];

                    return (
                      <div key={subject.id} className="subject-config-card">
                        <div className="panel-header">
                          <p className="eyebrow">Subject Setup</p>
                          <h3>{subject.label}</h3>
                        </div>

                        <div className="inline-field-row">
                          <label className="input-group">
                            <span>Importance</span>
                            <select
                              value={config.importanceScore}
                              onChange={(event) => handleSubjectConfigChange(subject.id, "importanceScore", event.target.value)}
                            >
                              {importanceOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="input-group">
                            <span>Self-rated weakness</span>
                            <select
                              value={config.weaknessScore}
                              onChange={(event) => handleSubjectConfigChange(subject.id, "weaknessScore", event.target.value)}
                            >
                              {weaknessOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="inline-field-row">
                          <label className="input-group">
                            <span>Exam date (optional)</span>
                            <input
                              type="date"
                              value={config.examDate}
                              onChange={(event) => handleSubjectConfigChange(subject.id, "examDate", event.target.value)}
                            />
                          </label>

                          <label className="input-group">
                            <span>Target grade (optional)</span>
                            <input
                              type="text"
                              placeholder="A1 / Distinction / B+"
                              value={config.targetGrade}
                              onChange={(event) => handleSubjectConfigChange(subject.id, "targetGrade", event.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="wizard-actions wizard-actions-spread">
                  <button className="secondary-button" type="button" onClick={moveToPreviousStep}>
                    Back
                  </button>
                  <button className="primary-button" type="submit" disabled={loading}>
                    {loading ? "Saving profile..." : "Create profile and open dashboard"}
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
