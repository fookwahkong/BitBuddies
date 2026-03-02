const PERSONA_PEER_RECOMMENDATIONS = {
  crammer: [
    "Break the uploaded worksheet into two short rounds today instead of one late sprint.",
    "Do the hardest marked question first while urgency is useful, then close with one accuracy check.",
  ],
  comfort: [
    "Mix one familiar question with one harder variation from the same document so the session stretches you.",
    "Avoid spending the whole session on safe question types from the upload.",
  ],
  avoider: [
    "Start with the weakest topic found in the document before touching easier pages.",
    "Set a 10-minute first-contact block for the hardest section so it does not keep getting deferred.",
  ],
  perfectionist: [
    "Cap each question with a time box so review does not swallow the whole paper.",
    "Mark one answer quickly, note the error pattern, then move on instead of polishing every line.",
  ],
  sprinter: [
    "Stay on one document section long enough to complete a full mini-set before switching topics.",
    "Use a short timer, but keep the same problem family for multiple attempts to build depth.",
  ],
};

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function getAttemptTrend(events = [], subjectId) {
  const subjectAttempts = events
    .filter((event) => event.eventType === "attempt" && event.subjectId === subjectId)
    .slice(-6);

  if (!subjectAttempts.length) {
    return {
      accuracy: null,
      averageTimeSec: null,
      recentIncorrectCount: 0,
    };
  }

  const correctCount = subjectAttempts.filter((event) => event.isCorrect).length;
  const timedAttempts = subjectAttempts.filter((event) => typeof event.timeSpentSec === "number");
  const averageTimeSec = timedAttempts.length
    ? Math.round(timedAttempts.reduce((sum, event) => sum + event.timeSpentSec, 0) / timedAttempts.length)
    : null;

  return {
    accuracy: correctCount / subjectAttempts.length,
    averageTimeSec,
    recentIncorrectCount: subjectAttempts.length - correctCount,
  };
}

export function buildPracticeAnalysis({ user, action, uploadedFile }) {
  const personaId = user?.persona?.primary?.id || "comfort";
  const personaLabel = user?.persona?.primary?.label || "Current persona";
  const subject = user?.academicProfile?.subjects?.find((item) => item.id === action.subjectId) || null;
  const subjectMastery = user?.subjectMastery?.subjects?.find((item) => item.id === action.subjectId) || null;
  const trend = getAttemptTrend(user?.learningEvents || [], action.subjectId);
  const wasCorrect = Boolean(action.isCorrect);
  const difficulty = Number(action.difficulty) || 2;
  const timeSpentSec = Number(action.timeSpentSec) || 0;

  const recommendedActions = [
    wasCorrect
      ? `Use the same ${action.detectedTopic} document for one harder follow-up while the method is still fresh.`
      : `Redo one similar ${action.detectedTopic} question immediately and compare only the step where the method broke.`,
    difficulty >= 3
      ? "Keep the next practice block short and focused on one error pattern from this file."
      : "Escalate to one harder question from the same topic so the improvement transfers beyond routine items.",
    action.hintUsed
      ? "Attempt one no-hint question from the same document before ending the session."
      : "Write a one-line checkpoint rule from this attempt so you can reuse it on the next question.",
  ];

  const personaPeerInsights = PERSONA_PEER_RECOMMENDATIONS[personaId] || PERSONA_PEER_RECOMMENDATIONS.comfort;
  const personalHistoryRecommendations = [
    trend.accuracy === null
      ? "This is your first logged attempt in this subject, so build a short baseline set of 3 to 5 questions next."
      : `Your recent ${subject?.label || "subject"} accuracy is ${formatPercent(trend.accuracy)}. The next session should target the exact weak step instead of switching topics too early.`,
    trend.averageTimeSec
      ? `Your recent average time is ${trend.averageTimeSec}s per attempt. Keep the next round around that pace and only speed up after accuracy stabilizes.`
      : "Log time spent on the next few attempts so BitBuddies can separate pacing problems from understanding problems.",
    subjectMastery
      ? `${subjectMastery.label || subject?.label || "This subject"} currently sits at ${subjectMastery.masteryScore}/100 mastery, so this upload should be treated as a progression checkpoint.`
      : `${subject?.label || "This subject"} does not have enough history yet, so use the next upload to establish a clearer pattern.`,
  ];

  return {
    title: uploadedFile?.name || "Practice document analysis",
    summary: `BitBuddies logged this ${action.questionType.toLowerCase()} under ${subject?.label || "your selected subject"} and generated the next actions from your result, persona, and recent history.`,
    documentSignals: [
      `Topic: ${action.detectedTopic}`,
      `Difficulty: ${difficulty}/3`,
      `Result: ${wasCorrect ? "Correct" : "Wrong"}`,
      `Time spent: ${timeSpentSec}s`,
      `File: ${uploadedFile?.name || "Uploaded document"}`,
    ],
    recommendedActions,
    personaPeerInsights,
    personalHistoryRecommendations,
    evidence: [
      `Primary persona: ${personaLabel}`,
      `Persona confidence: ${formatPercent(user?.personaConfidence || user?.persona?.primary?.matchScore || 0)}`,
      `Subject mastery: ${subjectMastery?.masteryScore || subject?.masteryScore || 0}/100`,
      `Recent incorrect attempts in this subject: ${trend.recentIncorrectCount}`,
    ],
  };
}
