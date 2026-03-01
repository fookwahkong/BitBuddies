export const currentState = {
  mastery: 62,
  stability: 48,
  retention: 54,
  confidence: 71,
  examReadiness: 58,
};

export const focusOptions = [
  {
    id: "chain-rule",
    topic: "Differentiation - Chain Rule",
    duration: "15 min",
    impact: {
      mastery: 14,
      stability: 10,
      retention: 8,
      confidence: -6,
      examReadiness: 12,
    },
    outcome: "accuracy rises while overconfidence normalizes",
    peerInsight:
      "Students with a profile close to yours improved fastest when they fixed procedural math topics before timed mixed practice.",
    reason: [
      "3 of your last 7 attempts in this topic were incorrect.",
      "Your self-rated confidence is high relative to actual accuracy.",
      "This topic is tagged as high-weight for the upcoming exam.",
    ],
    nextMove: "Do 5 targeted chain rule questions, then one timed mixed question.",
  },
  {
    id: "vectors",
    topic: "Vectors - Show That Questions",
    duration: "20 min",
    impact: {
      mastery: 8,
      stability: 12,
      retention: 6,
      confidence: -4,
      examReadiness: 9,
    },
    outcome: "reasoning quality improves and careless explanation gaps shrink",
    peerInsight:
      "Similar learners usually plateau in vectors until they practice written justification, not just calculation speed.",
    reason: [
      "You often complete the calculation but miss the final explanation step.",
      "This is a repeated mistake cluster in your last 6 vector tasks.",
      "Improving here reduces a high-frequency exam error pattern.",
    ],
    nextMove: "Complete 3 proof-style vector prompts with a written justification checklist.",
  },
  {
    id: "inequalities",
    topic: "Algebra - Inequalities",
    duration: "18 min",
    impact: {
      mastery: 11,
      stability: 7,
      retention: 9,
      confidence: -2,
      examReadiness: 15,
    },
    outcome: "mark gain potential increases because of high exam weight",
    peerInsight:
      "Students with your pattern often gain marks fastest by switching early into high-weight weak topics instead of polishing safe topics.",
    reason: [
      "This topic has lower mastery than your average baseline.",
      "It carries one of the highest exam-weight tags in your revision map.",
      "The opportunity cost of delaying this topic is high.",
    ],
    nextMove: "Work through 4 inequalities questions from medium to hard and review the first mistake immediately.",
  },
];

export const metricLabels = [
  { key: "mastery", label: "Mastery" },
  { key: "stability", label: "Stability" },
  { key: "retention", label: "Retention" },
  { key: "confidence", label: "Calibration" },
  { key: "examReadiness", label: "Exam Readiness" },
];

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

export function buildProjectedState(option) {
  return metricLabels.reduce((nextState, metric) => {
    nextState[metric.key] = clamp(currentState[metric.key] + option.impact[metric.key]);
    return nextState;
  }, {});
}
