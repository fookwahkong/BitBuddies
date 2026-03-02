import { buildSubjectMasteryModel } from "./academicProfile";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SESSION_GAP_MS = 30 * 60 * 1000;
const MEANINGFUL_ACTIVITY_EVENT_COUNT = 5;
const FULL_CONFIDENCE_EVENT_COUNT = 100;
const DEFAULT_SMOOTHING_ALPHA = 0.2;

export const radarAxes = [
  { key: "consistency", label: "Consistency" },
  { key: "depth", label: "Depth" },
  { key: "challenge", label: "Challenge" },
  { key: "coverage", label: "Coverage" },
  { key: "timeEfficiency", label: "Time Efficiency" },
  { key: "reflectionLoop", label: "Reflection Loop" },
];

export const personaCatalog = {
  crammer: {
    id: "crammer",
    label: "The Crammer",
    shortLabel: "Crammer",
    summary: "Long quiet stretches followed by intense deadline-driven bursts.",
  },
  comfort: {
    id: "comfort",
    label: "Comfort-Zone Grinder",
    shortLabel: "Comfort-Zone Grinder",
    summary: "Consistent activity, but mostly in easier work that feels safe.",
  },
  avoider: {
    id: "avoider",
    label: "The Avoider",
    shortLabel: "Avoider",
    summary: "Weak topics are left alone until they become urgent.",
  },
  perfectionist: {
    id: "perfectionist",
    label: "The Perfectionist",
    shortLabel: "Perfectionist",
    summary: "Moves carefully, reviews heavily, and often spends too long per task.",
  },
  sprinter: {
    id: "sprinter",
    label: "The Sprinter",
    shortLabel: "Sprinter",
    summary: "Many short scattered bursts with not enough sustained depth.",
  },
};

export const personaBaseRadar = {
  crammer: {
    consistency: 25,
    depth: 80,
    challenge: 55,
    coverage: 40,
    timeEfficiency: 60,
    reflectionLoop: 35,
  },
  comfort: {
    consistency: 75,
    depth: 65,
    challenge: 25,
    coverage: 55,
    timeEfficiency: 75,
    reflectionLoop: 45,
  },
  avoider: {
    consistency: 55,
    depth: 55,
    challenge: 45,
    coverage: 25,
    timeEfficiency: 65,
    reflectionLoop: 40,
  },
  perfectionist: {
    consistency: 70,
    depth: 70,
    challenge: 60,
    coverage: 55,
    timeEfficiency: 25,
    reflectionLoop: 70,
  },
  sprinter: {
    consistency: 45,
    depth: 25,
    challenge: 45,
    coverage: 45,
    timeEfficiency: 55,
    reflectionLoop: 30,
  },
};

export const supportedEventTypes = [
  "attempt",
  "review",
  "retry",
  "read_solution",
  "hint_open",
  "topic_open",
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clamp100(value) {
  return Math.max(0, Math.min(100, value));
}

function roundTo(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function normalizeToScore(value) {
  return clamp100(Math.round(clamp01(value) * 100));
}

function normalizeCount(value, target) {
  if (!target) {
    return 0;
  }

  return clamp01(value / target);
}

function safeRatio(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
}

function getTopicShare(events) {
  if (!events.length) {
    return 0;
  }

  const counts = events.reduce((memo, event) => {
    const key = event.topicId || "unknown";
    memo[key] = (memo[key] || 0) + 1;
    return memo;
  }, {});

  const maxCount = Math.max(...Object.values(counts));
  return maxCount / events.length;
}

function expectedTimeForDifficulty(difficulty) {
  const numericDifficulty = Number(difficulty) || 1;

  if (numericDifficulty >= 3) {
    return 180;
  }

  if (numericDifficulty === 2) {
    return 120;
  }

  return 90;
}

function normalizeEvent(event) {
  const timestamp = Number(event?.timestamp);
  const difficulty = Number(event?.difficulty || 1);
  const eventType = supportedEventTypes.includes(event?.eventType) ? event.eventType : "attempt";

  return {
    userId: event?.userId || "",
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    eventType,
    topicId: event?.topicId || "general",
    questionId: event?.questionId || null,
    difficulty: Math.min(3, Math.max(1, Math.round(difficulty))),
    isCorrect: typeof event?.isCorrect === "boolean" ? event.isCorrect : null,
    timeTakenSec: Number.isFinite(Number(event?.timeTakenSec)) ? Math.max(0, Number(event.timeTakenSec)) : null,
  };
}

function createEmptyPersonaScores() {
  return Object.keys(personaCatalog).reduce((scores, personaId) => {
    scores[personaId] = 0;
    return scores;
  }, {});
}

function buildWeightedRadar(matchScores) {
  return radarAxes.reduce((scores, axis) => {
    const weightedValue = Object.entries(matchScores).reduce((sum, [personaId, score]) => {
      const baseValue = personaBaseRadar[personaId]?.[axis.key] ?? 0;
      return sum + baseValue * score;
    }, 0);

    scores[axis.key] = clamp100(Math.round(weightedValue));
    return scores;
  }, {});
}

function buildBaseAxisExplanation(axisKey, scores, primaryPersona) {
  const axis = radarAxes.find((item) => item.key === axisKey);
  const axisScore = scores[axisKey];

  return {
    axis: axis?.label ?? axisKey,
    score: axisScore,
    summary: `${axis?.label ?? axisKey} starts from the onboarding persona mix led by ${primaryPersona.label}.`,
    signals: [
      `Primary persona: ${primaryPersona.label}`,
      `Weighted cold-start prior: ${axisScore}/100`,
      "This score will shift after meaningful activity is logged.",
    ],
  };
}

function toPercentScores(normalizedScores) {
  return Object.entries(normalizedScores).reduce((scores, [key, value]) => {
    scores[key] = normalizeToScore(value);
    return scores;
  }, {});
}

export function rankPersonaScores(matchScores) {
  return Object.entries(matchScores)
    .sort((left, right) => right[1] - left[1])
    .map(([personaId, score]) => ({
      ...personaCatalog[personaId],
      matchScore: roundTo(score, 4),
    }));
}

function normalizeStoredMatchScores(scores, legacyTotals) {
  if (scores) {
    return scores;
  }

  if (!legacyTotals) {
    return null;
  }

  const total = Object.values(legacyTotals).reduce((sum, value) => sum + (Number(value) || 0), 0);

  if (!total) {
    return null;
  }

  return Object.keys(personaCatalog).reduce((result, personaId) => {
    result[personaId] = roundTo((Number(legacyTotals[personaId]) || 0) / total, 4);
    return result;
  }, createEmptyPersonaScores());
}

function buildTopicStats(events) {
  const attemptEvents = events.filter((event) => event.eventType === "attempt" || event.eventType === "retry");

  return attemptEvents.reduce((stats, event) => {
    const topicId = event.topicId || "general";
    const current = stats[topicId] || {
      topicId,
      attempts: 0,
      correct: 0,
      accuracy: 0,
    };

    current.attempts += 1;

    if (event.isCorrect === true) {
      current.correct += 1;
    }

    current.accuracy = roundTo(safeRatio(current.correct, current.attempts), 4);
    stats[topicId] = current;
    return stats;
  }, {});
}

function buildWeakTopicSet(topicStats) {
  const topicList = Object.values(topicStats);
  const weakCandidates = topicList
    .filter((topic) => topic.attempts >= 2 && topic.accuracy < 0.6)
    .sort((left, right) => left.accuracy - right.accuracy);

  if (weakCandidates.length) {
    return weakCandidates.slice(0, 3).map((topic) => topic.topicId);
  }

  return topicList
    .filter((topic) => topic.attempts >= 1)
    .sort((left, right) => left.accuracy - right.accuracy)
    .slice(0, 2)
    .map((topic) => topic.topicId);
}

export function computeBehaviorPersonaScores(features, fallbackScores = null) {
  const rawScores = {
    crammer: clamp01(
      (features.activeDaysLast14 <= 4 ? 0.3 : 0)
      + (features.maxGapDaysLast14 >= 4 ? 0.25 : 0)
      + ((features.recentBurstRatio || 0) >= 0.45 ? 0.25 : 0)
      + (features.medianSessionDuration >= 25 ? 0.1 : 0)
      + (features.medianEventsPerSession >= 5 ? 0.1 : 0)
    ),
    sprinter: clamp01(
      (features.medianSessionDuration <= 12 ? 0.25 : 0)
      + (features.medianEventsPerSession <= 3 ? 0.25 : 0)
      + (features.topicsTouchedLast7 >= 4 ? 0.15 : 0)
      + ((features.topTopicShare || 0) <= 0.35 ? 0.15 : 0)
      + ((features.reviewRatio || 0) <= 0.15 ? 0.1 : 0)
      + ((features.topicSwitchRate || 0) >= 0.5 ? 0.1 : 0)
    ),
    comfort: clamp01(
      (features.activeDaysLast14 >= 6 ? 0.2 : 0)
      + ((features.hardRatio || 0) <= 0.2 ? 0.3 : 0)
      + ((features.avgDifficulty || 0) <= 1.7 ? 0.2 : 0)
      + ((features.timePerQuestionNormalizedAvg || 0) <= 1 ? 0.15 : 0)
      + ((features.pctTooLong || 0) <= 0.2 ? 0.15 : 0)
    ),
    perfectionist: clamp01(
      ((features.timePerQuestionNormalizedAvg || 0) >= 1.25 ? 0.3 : 0)
      + ((features.pctTooLong || 0) >= 0.35 ? 0.25 : 0)
      + ((features.reviewRatio || 0) >= 0.25 ? 0.2 : 0)
      + ((features.retryAfterWrongRate || 0) >= 0.5 ? 0.1 : 0)
      + (features.medianSessionDuration >= 20 ? 0.15 : 0)
    ),
    avoider: clamp01(
      (features.topicsTouchedLast7 <= 2 ? 0.15 : 0)
      + ((features.topTopicShare || 0) >= 0.6 ? 0.2 : 0)
      + ((features.hardRatio || 0) <= 0.25 ? 0.1 : 0)
      + ((features.weakTopicAttemptShare || 0) <= 0.15 ? 0.35 : 0)
      + ((features.weakTopicCoverage || 0) <= 0.25 ? 0.2 : 0)
    ),
  };

  const total = Object.values(rawScores).reduce((sum, value) => sum + value, 0);

  if (!total) {
    if (fallbackScores) {
      return fallbackScores;
    }

    return Object.keys(personaCatalog).reduce((result, personaId) => {
      result[personaId] = roundTo(1 / Object.keys(personaCatalog).length, 4);
      return result;
    }, {});
  }

  return Object.entries(rawScores).reduce((result, [personaId, value]) => {
    result[personaId] = roundTo(value / total, 4);
    return result;
  }, {});
}

export function blendPersonaMatchScores(initialScores, behaviorScores, confidence) {
  const blended = Object.keys(personaCatalog).reduce((result, personaId) => {
    const initialValue = initialScores?.[personaId] || 0;
    const behaviorValue = behaviorScores?.[personaId] || 0;
    result[personaId] = roundTo(((1 - confidence) * initialValue) + (confidence * behaviorValue), 4);
    return result;
  }, {});

  const total = Object.values(blended).reduce((sum, value) => sum + value, 0);

  if (!total) {
    return blended;
  }

  return Object.entries(blended).reduce((result, [personaId, value]) => {
    result[personaId] = roundTo(value / total, 4);
    return result;
  }, {});
}

export function calculateOnboardingPersona(answers, questions) {
  const rawScores = createEmptyPersonaScores();

  questions.forEach((question) => {
    const selectedValue = answers?.[question.id];
    const selectedOption = question.options.find((option) => option.value === selectedValue);

    if (!selectedOption) {
      return;
    }

    Object.entries(selectedOption.scores).forEach(([personaId, score]) => {
      rawScores[personaId] = roundTo((rawScores[personaId] || 0) + score, 4);
    });
  });

  const totalScore = Object.values(rawScores).reduce((sum, value) => sum + value, 0);
  const matchScores = Object.entries(rawScores).reduce((scores, [personaId, value]) => {
    scores[personaId] = totalScore ? roundTo(value / totalScore, 4) : roundTo(1 / Object.keys(rawScores).length, 4);
    return scores;
  }, {});

  const rankedPersonas = rankPersonaScores(matchScores);
  const primaryPersona = rankedPersonas[0];

  return {
    primaryPersona,
    rankedPersonas,
    rawScores,
    matchScores,
  };
}

export function buildInitialRadarProfile(personaProfile) {
  const baseScores = buildWeightedRadar(personaProfile.matchScores);
  const explanations = radarAxes.reduce((result, axis) => {
    result[axis.key] = buildBaseAxisExplanation(axis.key, baseScores, personaProfile.primaryPersona);
    return result;
  }, {});

  return {
    scores: baseScores,
    normalizedScores: Object.entries(baseScores).reduce((result, [key, value]) => {
      result[key] = roundTo(value / 100, 4);
      return result;
    }, {}),
    explanations,
  };
}

export function normalizeLearningEvents(events = []) {
  return events.map(normalizeEvent).sort((left, right) => left.timestamp - right.timestamp);
}

export function computeLearningFeatures(events = [], referenceTime = Date.now(), options = {}) {
  const normalizedEvents = normalizeLearningEvents(events);
  const weakTopicWindowMs = options.weakTopicWindowMs || 28 * DAY_IN_MS;
  const eventsForWeakTopics = normalizedEvents.filter((event) => referenceTime - event.timestamp <= weakTopicWindowMs);
  const topicStats = buildTopicStats(eventsForWeakTopics);
  const weakTopicSet = options.weakTopicSet || buildWeakTopicSet(topicStats);
  const eventsLast14d = normalizedEvents.filter((event) => referenceTime - event.timestamp <= 14 * DAY_IN_MS);
  const eventsLast7d = normalizedEvents.filter((event) => referenceTime - event.timestamp <= 7 * DAY_IN_MS);
  const eventsLast48h = normalizedEvents.filter((event) => referenceTime - event.timestamp <= 2 * DAY_IN_MS);
  const attemptEventsLast14d = eventsLast14d.filter((event) => event.eventType === "attempt" || event.eventType === "retry");
  const reviewEventsLast14d = eventsLast14d.filter((event) => event.eventType === "review" || event.eventType === "read_solution");

  const sessions = [];

  eventsLast14d.forEach((event) => {
    const previousSession = sessions[sessions.length - 1];

    if (!previousSession || event.timestamp - previousSession.lastTimestamp > SESSION_GAP_MS) {
      sessions.push({
        eventsCount: 1,
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
        topicIds: [event.topicId],
      });
      return;
    }

    previousSession.eventsCount += 1;
    previousSession.lastTimestamp = event.timestamp;
    previousSession.topicIds.push(event.topicId);
  });

  const activeDays = [...new Set(eventsLast14d.map((event) => new Date(event.timestamp).toISOString().slice(0, 10)))];
  let maxGapDaysLast14 = 14;

  if (activeDays.length >= 2) {
    const sortedDays = activeDays.map((value) => new Date(value).getTime()).sort((left, right) => left - right);
    maxGapDaysLast14 = sortedDays.slice(1).reduce((maxGap, dayTimestamp, index) => {
      const gap = Math.round((dayTimestamp - sortedDays[index]) / DAY_IN_MS) - 1;
      return Math.max(maxGap, gap);
    }, 0);
  } else if (activeDays.length === 1) {
    maxGapDaysLast14 = 13;
  }

  const hardAttempts = attemptEventsLast14d.filter((event) => event.difficulty >= 3);
  const totalDifficulty = attemptEventsLast14d.reduce((sum, event) => sum + event.difficulty, 0);
  const attemptDurations = attemptEventsLast14d
    .filter((event) => Number.isFinite(event.timeTakenSec))
    .map((event) => event.timeTakenSec);

  const normalizedDurations = attemptEventsLast14d
    .filter((event) => Number.isFinite(event.timeTakenSec))
    .map((event) => event.timeTakenSec / expectedTimeForDifficulty(event.difficulty));

  const tooLongCount = attemptEventsLast14d.filter((event) => {
    if (!Number.isFinite(event.timeTakenSec)) {
      return false;
    }

    return event.timeTakenSec > expectedTimeForDifficulty(event.difficulty) * 1.35;
  }).length;

  let retriedAfterWrong = 0;
  let wrongAttempts = 0;
  let topicTransitions = 0;
  let topicSwitches = 0;

  sessions.forEach((session) => {
    session.topicIds.slice(1).forEach((topicId, index) => {
      topicTransitions += 1;

      if (topicId !== session.topicIds[index]) {
        topicSwitches += 1;
      }
    });
  });

  attemptEventsLast14d.forEach((event, index) => {
    if (event.isCorrect !== false || !event.questionId) {
      return;
    }

    wrongAttempts += 1;

    const nextRetry = attemptEventsLast14d.slice(index + 1).find((candidate) => (
      candidate.questionId === event.questionId
      && candidate.timestamp - event.timestamp <= DAY_IN_MS
      && candidate.eventType === "retry"
    ));

    if (nextRetry) {
      retriedAfterWrong += 1;
    }
  });

  const weakTopicAttempts = attemptEventsLast14d.filter((event) => weakTopicSet.includes(event.topicId)).length;
  const weakTopicsTouched = new Set(
    attemptEventsLast14d
      .filter((event) => weakTopicSet.includes(event.topicId))
      .map((event) => event.topicId),
  ).size;
  const recentBurstRatio = roundTo(safeRatio(eventsLast48h.length, eventsLast14d.length), 4);

  return {
    totalEvents: normalizedEvents.length,
    eventsLast48h: eventsLast48h.length,
    eventsLast14d: eventsLast14d.length,
    activeDaysLast14: activeDays.length,
    maxGapDaysLast14,
    medianEventsPerSession: roundTo(median(sessions.map((session) => session.eventsCount)), 2),
    medianSessionDuration: roundTo(
      median(sessions.map((session) => (session.lastTimestamp - session.firstTimestamp) / 60000)),
      2,
    ),
    hardRatio: roundTo(safeRatio(hardAttempts.length, attemptEventsLast14d.length), 4),
    avgDifficulty: roundTo(safeRatio(totalDifficulty, attemptEventsLast14d.length), 4),
    topicsTouchedLast7: [...new Set(eventsLast7d.map((event) => event.topicId))].length,
    topTopicShare: roundTo(getTopicShare(eventsLast7d), 4),
    timePerQuestionNormalizedAvg: roundTo(median(normalizedDurations), 4),
    pctTooLong: roundTo(safeRatio(tooLongCount, attemptEventsLast14d.length), 4),
    reviewRatio: roundTo(safeRatio(reviewEventsLast14d.length, eventsLast14d.length), 4),
    retryAfterWrongRate: roundTo(safeRatio(retriedAfterWrong, wrongAttempts), 4),
    attemptsLast14d: attemptEventsLast14d.length,
    medianAttemptTimeSec: roundTo(median(attemptDurations), 2),
    recentBurstRatio,
    topicSwitchRate: roundTo(safeRatio(topicSwitches, topicTransitions), 4),
    weakTopicSet,
    weakTopicAttemptShare: roundTo(safeRatio(weakTopicAttempts, attemptEventsLast14d.length), 4),
    weakTopicCoverage: roundTo(safeRatio(weakTopicsTouched, weakTopicSet.length), 4),
    topicStats,
  };
}

function explainConsistency(features, score) {
  if (!features.eventsLast14d) {
    return {
      summary: "Consistency is still running on onboarding priors because no learning events have been logged yet.",
      signals: ["No learning events in the current window."],
    };
  }

  const signals = [
    `${features.activeDaysLast14} active days in the last 14 days`,
    `Longest inactivity stretch: ${features.maxGapDaysLast14} day(s)`,
    `${features.eventsLast48h} events in the last 48 hours`,
  ];

  if (score >= 70) {
    return { summary: "Study activity is showing up on a reliable rhythm.", signals };
  }

  if (score >= 45) {
    return { summary: "The rhythm is usable, but there are still visible gaps between study days.", signals };
  }

  return { summary: "The pattern is bursty right now, with long gaps between active windows.", signals };
}

function explainDepth(features, score) {
  const signals = [
    `Median events per session: ${features.medianEventsPerSession || 0}`,
    `Median session duration: ${features.medianSessionDuration || 0} min`,
    `Average difficulty attempted: ${features.avgDifficulty || 0}`,
  ];

  if (score >= 70) {
    return { summary: "Sessions are long enough and dense enough to support real concept building.", signals };
  }

  if (score >= 45) {
    return { summary: "There is some sustained focus, but not every session reaches deep work territory.", signals };
  }

  return { summary: "The current pattern is too fragmented to build strong depth consistently.", signals };
}

function explainChallenge(features, score) {
  const signals = [
    `Hard-question ratio: ${Math.round((features.hardRatio || 0) * 100)}%`,
    `Average difficulty: ${features.avgDifficulty || 0}`,
    `Retry-after-wrong rate: ${Math.round((features.retryAfterWrongRate || 0) * 100)}%`,
  ];

  if (score >= 70) {
    return { summary: "The learner is engaging with harder work and returns after mistakes.", signals };
  }

  if (score >= 45) {
    return { summary: "Challenge is present, but still mixed with some safer choices.", signals };
  }

  return { summary: "The activity leans too heavily toward comfortable tasks right now.", signals };
}

function explainCoverage(features, score) {
  const signals = [
    `Topics touched in last 7 days: ${features.topicsTouchedLast7}`,
    `Largest topic share: ${Math.round((features.topTopicShare || 0) * 100)}%`,
  ];

  if (score >= 70) {
    return { summary: "The learner is spreading effort across topics instead of tunneling.", signals };
  }

  if (score >= 45) {
    return { summary: "Coverage is moderate, but one or two topics still dominate the week.", signals };
  }

  return { summary: "Study time is concentrated too narrowly, leaving topic coverage exposed.", signals };
}

function explainTimeEfficiency(features, score) {
  const normalizedTime = features.timePerQuestionNormalizedAvg || 0;
  const signals = [
    `Normalized time per attempt: ${roundTo(normalizedTime, 2)}x expected`,
    `Too-long attempt rate: ${Math.round((features.pctTooLong || 0) * 100)}%`,
  ];

  if (score >= 70) {
    return { summary: "Pacing is efficient for the current difficulty mix.", signals };
  }

  if (score >= 45) {
    return { summary: "Pacing is acceptable, but there are signs of over-spending time on some tasks.", signals };
  }

  return { summary: "Too much time is being spent per task relative to the difficulty.", signals };
}

function explainReflectionLoop(features, score) {
  const signals = [
    `Review ratio: ${Math.round((features.reviewRatio || 0) * 100)}%`,
    `Retry-after-wrong rate: ${Math.round((features.retryAfterWrongRate || 0) * 100)}%`,
  ];

  if (score >= 70) {
    return { summary: "The learner is closing the loop after mistakes with review and follow-up work.", signals };
  }

  if (score >= 45) {
    return { summary: "Some reflection is happening, but the repair loop is not consistent yet.", signals };
  }

  return { summary: "Mistakes are not being revisited often enough to build a stable feedback loop.", signals };
}

function buildAxisExplanations(features, scores) {
  const explanationBuilders = {
    consistency: explainConsistency,
    depth: explainDepth,
    challenge: explainChallenge,
    coverage: explainCoverage,
    timeEfficiency: explainTimeEfficiency,
    reflectionLoop: explainReflectionLoop,
  };

  return radarAxes.reduce((result, axis) => {
    const details = explanationBuilders[axis.key](features, scores[axis.key]);
    result[axis.key] = {
      axis: axis.label,
      score: scores[axis.key],
      summary: details.summary,
      signals: details.signals,
    };
    return result;
  }, {});
}

export function computeMeasuredRadar(features) {
  const normalizedScores = {
    consistency: clamp01(
      (normalizeCount(features.activeDaysLast14, 10) * 0.45)
      + ((1 - normalizeCount(features.maxGapDaysLast14, 7)) * 0.35)
      + (normalizeCount(features.eventsLast48h, 8) * 0.2),
    ),
    depth: clamp01(
      (normalizeCount(features.medianEventsPerSession, 8) * 0.35)
      + (normalizeCount(features.medianSessionDuration, 45) * 0.45)
      + (normalizeCount(features.avgDifficulty, 3) * 0.2),
    ),
    challenge: clamp01(
      ((features.hardRatio || 0) * 0.45)
      + (normalizeCount(features.avgDifficulty, 3) * 0.35)
      + ((features.retryAfterWrongRate || 0) * 0.2),
    ),
    coverage: clamp01(
      (normalizeCount(features.topicsTouchedLast7, 6) * 0.55)
      + ((1 - (features.topTopicShare || 0)) * 0.45),
    ),
    timeEfficiency: clamp01(
      ((1 - Math.min(1.5, features.timePerQuestionNormalizedAvg || 1) / 1.5) * 0.55)
      + ((1 - (features.pctTooLong || 0)) * 0.45),
    ),
    reflectionLoop: clamp01(
      ((features.reviewRatio || 0) * 0.55)
      + ((features.retryAfterWrongRate || 0) * 0.45),
    ),
  };

  return {
    normalizedScores: Object.entries(normalizedScores).reduce((result, [key, value]) => {
      result[key] = roundTo(value, 4);
      return result;
    }, {}),
    scores: toPercentScores(normalizedScores),
  };
}

export function shouldRecomputeRadar(events = [], previousMeta = {}, referenceTime = Date.now()) {
  const normalizedEvents = normalizeLearningEvents(events);
  const newEventsSinceLast = normalizedEvents.filter((event) => (
    !previousMeta.lastComputedAt || event.timestamp > previousMeta.lastComputedAt
  ));

  if (!newEventsSinceLast.length) {
    return false;
  }

  const crossedEventThreshold = newEventsSinceLast.length >= MEANINGFUL_ACTIVITY_EVENT_COUNT;
  const newActiveDays = [...new Set(newEventsSinceLast.map((event) => new Date(event.timestamp).toISOString().slice(0, 10)))];
  const crossedDayThreshold = previousMeta.lastComputedAt
    ? newActiveDays.some((day) => new Date(day).getTime() > previousMeta.lastComputedAt)
    : newActiveDays.length > 0;

  return crossedEventThreshold || crossedDayThreshold;
}

export function buildLearningRadar({
  matchScores,
  events = [],
  previousRadar = null,
  previousMeta = null,
  totalEventCount = null,
  pendingEventCount = 0,
  referenceTime = Date.now(),
}) {
  const baseScores = buildWeightedRadar(matchScores);
  const baseNormalizedScores = Object.entries(baseScores).reduce((result, [key, value]) => {
    result[key] = roundTo(value / 100, 4);
    return result;
  }, {});

  const normalizedEvents = normalizeLearningEvents(events);
  const features = computeLearningFeatures(normalizedEvents, referenceTime);
  const measured = computeMeasuredRadar(features);
  const effectiveTotalEventCount = Number.isFinite(totalEventCount) ? totalEventCount : features.totalEvents;
  const confidence = clamp01(effectiveTotalEventCount / FULL_CONFIDENCE_EVENT_COUNT);

  const blendedNormalizedScores = radarAxes.reduce((scores, axis) => {
    const baseValue = baseNormalizedScores[axis.key];
    const measuredValue = measured.normalizedScores[axis.key];
    scores[axis.key] = roundTo(((1 - confidence) * baseValue) + (confidence * measuredValue), 4);
    return scores;
  }, {});

  const smoothingAlpha = previousMeta?.smoothingAlpha ?? DEFAULT_SMOOTHING_ALPHA;
  const smoothedNormalizedScores = radarAxes.reduce((scores, axis) => {
    const nextValue = blendedNormalizedScores[axis.key];
    const previousValue = previousRadar?.normalizedScores?.[axis.key];

    if (typeof previousValue !== "number") {
      scores[axis.key] = nextValue;
      return scores;
    }

    scores[axis.key] = roundTo((previousValue * (1 - smoothingAlpha)) + (nextValue * smoothingAlpha), 4);
    return scores;
  }, {});

  const scores = toPercentScores(smoothedNormalizedScores);
  const explanations = features.totalEvents
    ? buildAxisExplanations(features, scores)
    : radarAxes.reduce((result, axis) => {
        result[axis.key] = {
          axis: axis.label,
          score: scores[axis.key],
          summary: "No behavior has been logged yet, so this score is still using the onboarding baseline.",
          signals: ["Meaningful activity starts once five or more new events are recorded."],
        };
        return result;
      }, {});

  return {
    scores,
    normalizedScores: smoothedNormalizedScores,
    baseScores,
    measuredScores: measured.scores,
    explanations,
    features,
    meta: {
      confidence: roundTo(confidence, 4),
      totalEvents: effectiveTotalEventCount,
      meaningfulActivityThreshold: MEANINGFUL_ACTIVITY_EVENT_COUNT,
      lastComputedAt: referenceTime,
      lastEventAt: normalizedEvents.length ? normalizedEvents[normalizedEvents.length - 1].timestamp : null,
      pendingEventCount,
      smoothingAlpha,
      shouldRefresh: false,
    },
  };
}

export function buildInitialStudentModel({ name, email, answers, questions, timestamp = Date.now() }) {
  const personaProfile = calculateOnboardingPersona(answers, questions);
  const initialRadar = buildLearningRadar({
    matchScores: personaProfile.matchScores,
    events: [],
    referenceTime: timestamp,
  });

  return {
    profile: {
      name,
      email,
    },
    persona: {
      primary: personaProfile.primaryPersona,
      initialPrimary: personaProfile.primaryPersona,
      weakLabel: personaProfile.primaryPersona,
      weakLabelScores: personaProfile.matchScores,
      behaviorLabel: null,
      behaviorLabelScores: null,
      behaviorConfidence: 0,
      behaviorMargin: 0,
      canonicalLabel: personaProfile.primaryPersona,
      labelSource: "weak",
      lastLabelUpdatedAt: timestamp,
      initialMatchScores: personaProfile.matchScores,
      liveMatchScores: personaProfile.matchScores,
      ranked: personaProfile.rankedPersonas,
      rawScores: personaProfile.rawScores,
    },
    behaviorFeatures: null,
    weakTopicSet: [],
    topicStats: {},
    learningRadar: initialRadar,
    learningEvents: [],
  };
}

export function buildSessionFromStudentRecord(studentRecord = {}) {
  const fallbackPrimaryPersonaId = studentRecord?.persona?.primary?.id || studentRecord?.persona?.id || "comfort";
  const legacyMatchScores = normalizeStoredMatchScores(null, studentRecord?.persona?.totals);
  const weakLabelScores = studentRecord?.persona?.weakLabelScores
    || studentRecord?.persona?.initialMatchScores
    || studentRecord?.persona?.liveMatchScores
    || legacyMatchScores
    || { ...createEmptyPersonaScores(), [fallbackPrimaryPersonaId]: 1 };
  const behaviorLabelScores = studentRecord?.persona?.behaviorLabelScores || null;
  const fallbackMatchScores = studentRecord?.persona?.initialMatchScores
    || studentRecord?.persona?.liveMatchScores
    || legacyMatchScores
    || { ...createEmptyPersonaScores(), [fallbackPrimaryPersonaId]: 1 };
  const labelSource = studentRecord?.persona?.labelSource || "weak";
  const activeScores = labelSource === "behavior_rule" && behaviorLabelScores
    ? behaviorLabelScores
    : weakLabelScores;
  const canonicalLabel = studentRecord?.persona?.canonicalLabel
    || studentRecord?.persona?.primary
    || {
      ...(personaCatalog[fallbackPrimaryPersonaId] || personaCatalog.comfort),
      matchScore: activeScores[fallbackPrimaryPersonaId] || 1,
    };
  const primaryPersona = {
    ...(personaCatalog[canonicalLabel.id] || personaCatalog[fallbackPrimaryPersonaId] || personaCatalog.comfort),
    ...canonicalLabel,
    matchScore: canonicalLabel.matchScore ?? activeScores[canonicalLabel.id] ?? 1,
  };

  const learningRadar = studentRecord?.learningRadar
    || buildLearningRadar({
      matchScores: weakLabelScores,
      events: studentRecord?.learningEvents || [],
    });
  const academicProfile = studentRecord?.academicProfile || null;
  const subjectMastery = studentRecord?.subjectMastery
    || (academicProfile ? buildSubjectMasteryModel(academicProfile) : null);

  return {
    docId: studentRecord.docId || studentRecord.firestoreDocId || null,
    uid: studentRecord.docId || studentRecord.firestoreDocId || null,
    studentID: studentRecord.studentID,
    name: studentRecord.username || studentRecord.name || "Student",
    email: studentRecord.email || "",
    academicProfile,
    subjectMastery,
    practiceIntake: studentRecord.practiceIntake || null,
    persona: {
      primary: primaryPersona,
      initialPrimary: studentRecord?.persona?.initialPrimary || primaryPersona,
      weakLabel: studentRecord?.persona?.weakLabel || studentRecord?.persona?.primary || primaryPersona,
      weakLabelScores,
      behaviorLabel: studentRecord?.persona?.behaviorLabel || null,
      behaviorLabelScores,
      behaviorConfidence: studentRecord?.persona?.behaviorConfidence || 0,
      behaviorMargin: studentRecord?.persona?.behaviorMargin || 0,
      canonicalLabel: primaryPersona,
      labelSource,
      lastLabelUpdatedAt: studentRecord?.persona?.lastLabelUpdatedAt || null,
      initialMatchScores: studentRecord?.persona?.initialMatchScores || fallbackMatchScores,
      liveMatchScores: studentRecord?.persona?.liveMatchScores || activeScores,
      ranked: studentRecord?.persona?.ranked || rankPersonaScores(activeScores),
      rawScores: studentRecord?.persona?.rawScores || null,
    },
    personaConfidence: primaryPersona.matchScore
      || (typeof studentRecord?.personaConfidence === "number" ? studentRecord.personaConfidence : 0),
    behaviorFeatures: studentRecord?.behaviorFeatures || learningRadar?.features || null,
    weakTopicSet: studentRecord?.weakTopicSet || learningRadar?.features?.weakTopicSet || [],
    topicStats: studentRecord?.topicStats || learningRadar?.features?.topicStats || {},
    learningRadar,
    latestPracticeAnalysis: studentRecord?.latestPracticeAnalysis || null,
    studyPlanTodos: Array.isArray(studentRecord?.studyPlanTodos) ? studentRecord.studyPlanTodos : [],
    learningEvents: studentRecord.learningEvents || [],
  };
}
