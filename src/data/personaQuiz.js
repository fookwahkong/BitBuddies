import { buildInitialRadarProfile, calculateOnboardingPersona, personaCatalog } from "./learningRadar";

export const personas = personaCatalog;

export const quizQuestions = [
  {
    id: "study_rhythm",
    prompt: "When exams are still a few weeks away, what does your study rhythm usually look like?",
    options: [
      { value: "a", label: "I mostly wait until the pressure feels real, then I lock in hard.", scores: { crammer: 3, avoider: 1 } },
      { value: "b", label: "I study often, but I prefer topics I already know how to do.", scores: { comfort: 3, avoider: 0.5 } },
      { value: "c", label: "I do many short bursts whenever I can squeeze them in.", scores: { sprinter: 3 } },
      { value: "d", label: "I keep a regular plan and revisit work carefully.", scores: { perfectionist: 2, comfort: 1 } },
    ],
  },
  {
    id: "hard_question_reaction",
    prompt: "What is your first instinct when a question feels difficult?",
    options: [
      { value: "a", label: "Skip it first and clear the easier ones.", scores: { comfort: 2, avoider: 2 } },
      { value: "b", label: "Stay on it for a long time until I feel satisfied.", scores: { perfectionist: 3 } },
      { value: "c", label: "Take a quick shot, then move on fast.", scores: { sprinter: 2, crammer: 0.5 } },
      { value: "d", label: "Leave it for later and deal with it closer to the deadline.", scores: { crammer: 2.5, avoider: 1 } },
    ],
  },
  {
    id: "session_shape",
    prompt: "What does a typical study session feel like for you?",
    options: [
      { value: "a", label: "Short, quick, and a bit scattered.", scores: { sprinter: 3 } },
      { value: "b", label: "Rare, but very intense when I finally start.", scores: { crammer: 3 } },
      { value: "c", label: "Long because I double-check almost everything.", scores: { perfectionist: 3 } },
      { value: "d", label: "Steady and familiar, usually on practice I already understand.", scores: { comfort: 3 } },
    ],
  },
  {
    id: "weak_topics",
    prompt: "What usually happens to topics you know you are weak at?",
    options: [
      { value: "a", label: "I delay them and hope I will have the energy later.", scores: { avoider: 3 } },
      { value: "b", label: "I touch them briefly, then go back to easier wins.", scores: { comfort: 2.5 } },
      { value: "c", label: "I save them for a major push close to the exam.", scores: { crammer: 2.5, avoider: 0.5 } },
      { value: "d", label: "I can get stuck on one weak question for too long.", scores: { perfectionist: 2.5 } },
    ],
  },
  {
    id: "progress_metric",
    prompt: "How do you usually decide a study session went well?",
    options: [
      { value: "a", label: "I finished many questions, even if they were quick.", scores: { sprinter: 2.5, comfort: 0.5 } },
      { value: "b", label: "I cleared familiar questions correctly.", scores: { comfort: 2.5 } },
      { value: "c", label: "I fixed one hard question properly, even if it took a while.", scores: { perfectionist: 2, crammer: 0.5 } },
      { value: "d", label: "I suddenly covered a lot because the deadline was close.", scores: { crammer: 2.5 } },
    ],
  },
  {
    id: "deadline_response",
    prompt: "A test is now three days away. What changes most for you?",
    options: [
      { value: "a", label: "My effort spikes sharply and I do long catch-up blocks.", scores: { crammer: 3 } },
      { value: "b", label: "I keep doing what I know I can complete quickly.", scores: { comfort: 2.5 } },
      { value: "c", label: "I panic a little and bounce between topics without staying long.", scores: { sprinter: 2.5 } },
      { value: "d", label: "I slow down because I want every revision step to feel complete.", scores: { perfectionist: 2.5 } },
    ],
  },
  {
    id: "topic_choice",
    prompt: "If you only have 20 minutes, what are you most likely to pick?",
    options: [
      { value: "a", label: "A safe topic I can finish cleanly.", scores: { comfort: 2.5 } },
      { value: "b", label: "A weak topic, but I might avoid the hardest parts.", scores: { avoider: 2 } },
      { value: "c", label: "A fast mix of whatever is in front of me.", scores: { sprinter: 2.5 } },
      { value: "d", label: "A high-stakes weak topic because I am running out of time.", scores: { crammer: 2.5 } },
    ],
  },
  {
    id: "mistake_follow_up",
    prompt: "After getting a question wrong, what do you usually do next?",
    options: [
      { value: "a", label: "Review the solution carefully and try to understand every step.", scores: { perfectionist: 2.5 } },
      { value: "b", label: "Retry it once, then move back to easier work.", scores: { comfort: 1.5, perfectionist: 0.5 } },
      { value: "c", label: "Note it mentally, but I often move on quickly.", scores: { sprinter: 2 } },
      { value: "d", label: "Leave it for a later revision push.", scores: { crammer: 1.5, avoider: 1.5 } },
    ],
  },
  {
    id: "attention_span",
    prompt: "Which statement sounds most like your attention pattern during revision?",
    options: [
      { value: "a", label: "I can stay a long time, but I sometimes get trapped in one detail.", scores: { perfectionist: 3 } },
      { value: "b", label: "I prefer moving quickly between small tasks.", scores: { sprinter: 3 } },
      { value: "c", label: "I can focus deeply, but only when the urgency is high.", scores: { crammer: 2.5 } },
      { value: "d", label: "I focus best when the task feels familiar and low risk.", scores: { comfort: 2.5, avoider: 0.5 } },
    ],
  },
  {
    id: "confidence_pattern",
    prompt: "Which risk is most likely to describe your study pattern?",
    options: [
      { value: "a", label: "I leave too much until late, then try to recover all at once.", scores: { crammer: 3 } },
      { value: "b", label: "I stay busy, but I may not stretch myself enough.", scores: { comfort: 3 } },
      { value: "c", label: "I avoid the weakest areas until they become uncomfortable.", scores: { avoider: 3 } },
      { value: "d", label: "I spend so long getting things right that pacing becomes the problem.", scores: { perfectionist: 2.5, sprinter: 0.5 } },
    ],
  },
];

export function calculatePersona(answers) {
  const personaProfile = calculateOnboardingPersona(answers, quizQuestions);

  return {
    primary: personaProfile.primaryPersona,
    weakLabel: personaProfile.primaryPersona,
    weakLabelScores: personaProfile.matchScores,
    behaviorLabel: null,
    behaviorLabelScores: null,
    behaviorConfidence: 0,
    behaviorMargin: 0,
    canonicalLabel: personaProfile.primaryPersona,
    labelSource: "weak",
    initialMatchScores: personaProfile.matchScores,
    liveMatchScores: personaProfile.matchScores,
    ranked: personaProfile.rankedPersonas,
    rawScores: personaProfile.rawScores,
    initialRadar: buildInitialRadarProfile(personaProfile),
  };
}
