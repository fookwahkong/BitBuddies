const IMPORTANCE_LEVELS = {
  1: { label: "Low", score: 1 },
  2: { label: "Medium", score: 2 },
  3: { label: "High", score: 3 },
};

const WEAKNESS_LEVELS = {
  1: { label: "Strong", score: 1, prior: 0.75 },
  2: { label: "Okay", score: 2, prior: 0.5 },
  3: { label: "Weak", score: 3, prior: 0.25 },
};

const INSTITUTION_CATALOG = {
  secondary: {
    label: "Secondary",
    courses: [
      "Express STEM Track",
      "Express Balanced Track",
      "Normal Academic",
      "Normal Technical",
      "IP Foundation Track",
    ],
    subjects: [
      "Additional Mathematics",
      "Elementary Mathematics",
      "Physics",
      "Chemistry",
      "English",
    ],
  },
  jc: {
    label: "JC",
    courses: [
      "Science Stream",
      "Hybrid Stream",
      "Arts Stream",
      "Math-Enrichment Track",
      "Exam Sprint Track",
    ],
    subjects: [
      "H2 Mathematics",
      "H2 Physics",
      "H2 Chemistry",
      "Economics",
      "General Paper",
    ],
  },
  poly: {
    label: "Poly",
    courses: [
      "Engineering Diploma",
      "Business Diploma",
      "IT Diploma",
      "Media Diploma",
      "Applied Science Diploma",
    ],
    subjects: [
      "Programming Fundamentals",
      "Applied Mathematics",
      "Project Work",
      "Communication Skills",
      "Domain Core Module",
    ],
  },
  uni: {
    label: "Uni",
    courses: [
      "Computer Science",
      "Engineering",
      "Business Analytics",
      "Life Sciences",
      "Social Sciences",
    ],
    subjects: [
      "Calculus",
      "Programming",
      "Data Structures",
      "Statistics",
      "Academic Writing",
    ],
  },
};

function roundTo(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampProbability(value) {
  return Math.max(0.01, Math.min(0.99, value));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getImportanceConfig(score) {
  return IMPORTANCE_LEVELS[score] || IMPORTANCE_LEVELS[2];
}

function getWeaknessConfig(score) {
  return WEAKNESS_LEVELS[score] || WEAKNESS_LEVELS[2];
}

function buildSubjectRecord(subjectInput) {
  const importance = getImportanceConfig(Number(subjectInput.importanceScore));
  const weakness = getWeaknessConfig(Number(subjectInput.weaknessScore));
  const impactScore = importance.score * weakness.score;
  const masteryProbability = clampProbability(
    typeof subjectInput.masteryProbability === "number" ? subjectInput.masteryProbability : weakness.prior,
  );
  const attemptCount = Number(subjectInput.attemptCount) || 0;
  const correctCount = Number(subjectInput.correctCount) || 0;

  return {
    id: subjectInput.id || slugify(subjectInput.label || "subject"),
    label: subjectInput.label || "Subject",
    importanceScore: importance.score,
    importanceLabel: importance.label,
    weaknessScore: weakness.score,
    weaknessLabel: weakness.label,
    impactScore,
    normalizedWeight: 0,
    masteryProbability: roundTo(masteryProbability, 4),
    masteryScore: Math.round(masteryProbability * 100),
    attemptCount,
    correctCount,
    lastPracticedAt: subjectInput.lastPracticedAt || null,
    examDate: subjectInput.examDate || "",
    targetGrade: subjectInput.targetGrade || "",
    lastDetectedTopic: subjectInput.lastDetectedTopic || "",
  };
}

function normalizeSubjectWeights(subjects) {
  const totalImpact = subjects.reduce((sum, subject) => sum + subject.impactScore, 0);

  return {
    subjects: subjects.map((subject) => ({
      ...subject,
      normalizedWeight: totalImpact ? roundTo(subject.impactScore / totalImpact, 4) : 0,
    })),
    totalImpact,
  };
}

function getBktParameters(difficulty) {
  const normalizedDifficulty = Math.max(1, Math.min(3, Math.round(Number(difficulty) || 2)));

  if (normalizedDifficulty >= 3) {
    return { guess: 0.16, slip: 0.14, transition: 0.18 };
  }

  if (normalizedDifficulty === 1) {
    return { guess: 0.24, slip: 0.08, transition: 0.08 };
  }

  return { guess: 0.2, slip: 0.1, transition: 0.12 };
}

function applyBktUpdate(previousProbability, isCorrect, difficulty) {
  if (typeof isCorrect !== "boolean") {
    return clampProbability(previousProbability);
  }

  const prior = clampProbability(previousProbability);
  const { guess, slip, transition } = getBktParameters(difficulty);
  const numerator = isCorrect ? prior * (1 - slip) : prior * slip;
  const denominator = isCorrect
    ? numerator + ((1 - prior) * guess)
    : numerator + ((1 - prior) * (1 - guess));

  const posterior = denominator ? numerator / denominator : prior;
  return clampProbability(posterior + ((1 - posterior) * transition));
}

export const institutionCatalog = INSTITUTION_CATALOG;
export const institutionOptions = Object.entries(INSTITUTION_CATALOG).map(([value, config]) => ({
  value,
  label: config.label,
}));
export const importanceOptions = Object.entries(IMPORTANCE_LEVELS).map(([value, config]) => ({
  value: Number(value),
  label: config.label,
}));
export const weaknessOptions = Object.entries(WEAKNESS_LEVELS).map(([value, config]) => ({
  value: Number(value),
  label: config.label,
  prior: config.prior,
}));

export function getCourseOptions(institutionLevel) {
  const catalog = INSTITUTION_CATALOG[institutionLevel] || INSTITUTION_CATALOG.secondary;
  return catalog.courses;
}

export function getSubjectOptions(institutionLevel) {
  const catalog = INSTITUTION_CATALOG[institutionLevel] || INSTITUTION_CATALOG.secondary;
  return catalog.subjects.map((label) => ({
    id: slugify(label),
    label,
  }));
}

export function buildAcademicProfile({
  institutionLevel,
  courseTrack,
  subjects = [],
  timestamp = Date.now(),
}) {
  const levelKey = INSTITUTION_CATALOG[institutionLevel] ? institutionLevel : "secondary";
  const normalizedSubjects = subjects.map(buildSubjectRecord);
  const weightedSubjects = normalizeSubjectWeights(normalizedSubjects);

  return {
    institutionLevel: levelKey,
    institutionLabel: INSTITUTION_CATALOG[levelKey].label,
    courseTrack: courseTrack || getCourseOptions(levelKey)[0],
    subjects: weightedSubjects.subjects,
    meta: {
      totalImpactScore: weightedSubjects.totalImpact,
      subjectCount: weightedSubjects.subjects.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export function buildSubjectMasteryModel(academicProfile = {}, referenceTime = Date.now()) {
  const subjects = Array.isArray(academicProfile.subjects) ? academicProfile.subjects : [];
  const probabilities = subjects.reduce((result, subject) => {
    result[subject.id] = roundTo(subject.masteryProbability || 0, 4);
    return result;
  }, {});
  const scores = subjects.reduce((result, subject) => {
    result[subject.id] = Math.round((subject.masteryProbability || 0) * 100);
    return result;
  }, {});

  const underPracticedHighImpact = [...subjects]
    .sort((left, right) => {
      const leftPriority = (left.impactScore * 10) - left.attemptCount;
      const rightPriority = (right.impactScore * 10) - right.attemptCount;
      return rightPriority - leftPriority;
    })
    .slice(0, 3)
    .map((subject) => ({
      id: subject.id,
      label: subject.label,
      reason: `${subject.attemptCount} logged attempt(s), weight ${(subject.normalizedWeight * 100).toFixed(0)}%`,
    }));

  const overInvestedMastered = [...subjects]
    .filter((subject) => subject.attemptCount >= 3 && subject.masteryProbability >= 0.75)
    .sort((left, right) => {
      const leftExcess = left.attemptCount - (left.impactScore || 0);
      const rightExcess = right.attemptCount - (right.impactScore || 0);
      return rightExcess - leftExcess;
    })
    .slice(0, 3)
    .map((subject) => ({
      id: subject.id,
      label: subject.label,
      reason: `${subject.attemptCount} attempt(s) despite ${subject.masteryScore}/100 mastery`,
    }));

  const lowestMastery = [...subjects]
    .sort((left, right) => left.masteryProbability - right.masteryProbability)
    .slice(0, 3)
    .map((subject) => ({
      id: subject.id,
      label: subject.label,
      reason: `Current baseline ${subject.masteryScore}/100`,
    }));

  return {
    scores,
    probabilities,
    insights: {
      underPracticedHighImpact,
      overInvestedMastered,
      lowestMastery,
    },
    meta: {
      trackedSubjects: subjects.length,
      totalAttempts: subjects.reduce((sum, subject) => sum + (subject.attemptCount || 0), 0),
      lastUpdatedAt: referenceTime,
    },
  };
}

export function buildSubjectMasteryAxes(academicProfile = {}) {
  const subjects = Array.isArray(academicProfile.subjects) ? academicProfile.subjects : [];

  return subjects.map((subject) => ({
    key: subject.id,
    label: subject.label,
  }));
}

export function applyAttemptToAcademicProfile(academicProfile = {}, attempt = {}, referenceTime = Date.now()) {
  const subjects = Array.isArray(academicProfile.subjects) ? academicProfile.subjects : [];

  if (!attempt.subjectId || !subjects.length || !["attempt", "retry"].includes(attempt.eventType)) {
    return academicProfile;
  }

  let updated = false;

  const nextSubjects = subjects.map((subject) => {
    if (subject.id !== attempt.subjectId) {
      return subject;
    }

    updated = true;
    const nextProbability = applyBktUpdate(subject.masteryProbability || 0.5, attempt.isCorrect, attempt.difficulty);

    return {
      ...subject,
      masteryProbability: roundTo(nextProbability, 4),
      masteryScore: Math.round(nextProbability * 100),
      attemptCount: (subject.attemptCount || 0) + 1,
      correctCount: (subject.correctCount || 0) + (attempt.isCorrect ? 1 : 0),
      lastPracticedAt: new Date(referenceTime).toISOString(),
      lastDetectedTopic: attempt.detectedTopic || subject.lastDetectedTopic || "",
    };
  });

  if (!updated) {
    return academicProfile;
  }

  const weightedSubjects = normalizeSubjectWeights(nextSubjects);

  return {
    ...academicProfile,
    subjects: weightedSubjects.subjects,
    meta: {
      ...(academicProfile.meta || {}),
      totalImpactScore: weightedSubjects.totalImpact,
      subjectCount: weightedSubjects.subjects.length,
      updatedAt: referenceTime,
    },
  };
}
