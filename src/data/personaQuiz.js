export const personas = {
  crammer: {
    label: "The Crammer",
    summary: "Long quiet stretches followed by intense deadline-driven bursts.",
  },
  comfort: {
    label: "The Comfort-Zone Grinder",
    summary: "High activity, but mostly on easier work that feels safe.",
  },
  avoider: {
    label: "The Avoider",
    summary: "Weak areas are left untouched until they become urgent.",
  },
  perfectionist: {
    label: "The Perfectionist",
    summary: "Spends too long per question and hesitates to move on.",
  },
  sprinter: {
    label: "The Sprinter",
    summary: "Lots of short scattered sessions with low depth.",
  },
};

export const quizQuestions = [
  {
    id: "study_pattern",
    prompt: "When exams are still far away, what does your revision usually look like?",
    options: [
      { value: "a", label: "I barely revise until the deadline feels close.", scores: { crammer: 3, avoider: 1 } },
      { value: "b", label: "I revise often, but I stick to topics I already know.", scores: { comfort: 3 } },
      { value: "c", label: "I do quick short sessions whenever I can fit them in.", scores: { sprinter: 3 } },
      { value: "d", label: "I plan to revise, but I keep putting hard topics off.", scores: { avoider: 3 } },
    ],
  },
  {
    id: "hard_questions",
    prompt: "How do you react when you hit a question that feels difficult?",
    options: [
      { value: "a", label: "I skip it and return to easier ones first.", scores: { comfort: 2, avoider: 2 } },
      { value: "b", label: "I stay on it for a long time until I feel satisfied.", scores: { perfectionist: 3 } },
      { value: "c", label: "I attempt it fast, then jump to something else.", scores: { sprinter: 2 } },
      { value: "d", label: "I leave it for later and hope I can cram it closer to the exam.", scores: { crammer: 2 } },
    ],
  },
  {
    id: "time_block",
    prompt: "What does a typical study session feel like for you?",
    options: [
      { value: "a", label: "Short and frequent, but not always focused deeply.", scores: { sprinter: 3 } },
      { value: "b", label: "Rare, but when I start I go all in for a long time.", scores: { crammer: 3 } },
      { value: "c", label: "Long because I worry about getting each answer perfect.", scores: { perfectionist: 3 } },
      { value: "d", label: "Consistent, but I mostly repeat familiar question types.", scores: { comfort: 3 } },
    ],
  },
  {
    id: "weak_topics",
    prompt: "What happens to topics you know you are weak at?",
    options: [
      { value: "a", label: "I delay them and hope I will have energy later.", scores: { avoider: 3 } },
      { value: "b", label: "I do a few, then go back to easier wins.", scores: { comfort: 2 } },
      { value: "c", label: "I save them for a major revision sprint close to the exam.", scores: { crammer: 2 } },
      { value: "d", label: "I overfocus on one weak question for too long.", scores: { perfectionist: 2 } },
    ],
  },
  {
    id: "progress_check",
    prompt: "How do you know a study session went well?",
    options: [
      { value: "a", label: "I completed many quick questions, even if they were shallow.", scores: { sprinter: 2 } },
      { value: "b", label: "I got through familiar questions correctly.", scores: { comfort: 2 } },
      { value: "c", label: "I fixed one question perfectly, even if it took a while.", scores: { perfectionist: 2 } },
      { value: "d", label: "I suddenly covered a lot because the deadline was near.", scores: { crammer: 2 } },
    ],
  },
];

export function calculatePersona(answers) {
  const totals = {
    crammer: 0,
    comfort: 0,
    avoider: 0,
    perfectionist: 0,
    sprinter: 0,
  };

  quizQuestions.forEach((question) => {
    const selectedValue = answers[question.id];
    const selectedOption = question.options.find((option) => option.value === selectedValue);

    if (!selectedOption) {
      return;
    }

    Object.entries(selectedOption.scores).forEach(([personaId, score]) => {
      totals[personaId] += score;
    });
  });

  const [personaId] = Object.entries(totals).sort((left, right) => right[1] - left[1])[0];

  return {
    id: personaId,
    ...personas[personaId],
    totals,
  };
}
