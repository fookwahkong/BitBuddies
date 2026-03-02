export function normalizeSubjectText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const subjectCatalog = [
  {
    label: "Additional Mathematics",
    aliases: ["additional math", "a math", "amath", "add math"],
    keywords: ["algebra", "trigonometry", "calculus", "differentiate", "integration", "binomial", "logarithm", "surd", "function", "quadratic"],
  },
  {
    label: "Elementary Mathematics",
    aliases: ["elementary math", "e math", "emath", "math"],
    keywords: ["percentage", "ratio", "linear graph", "simultaneous equation", "mensuration", "probability", "statistics", "geometry", "circle", "triangle"],
  },
  {
    label: "H2 Mathematics",
    aliases: ["h2 math", "h2 mathematics", "jc math"],
    keywords: ["vectors", "maclaurin", "sampling", "hypothesis testing", "normal distribution", "permutation", "combination", "differentiation", "integration", "complex numbers"],
  },
  {
    label: "Applied Mathematics",
    aliases: ["applied math", "engineering math"],
    keywords: ["matrix", "differential equation", "laplace", "numerical method", "probability", "statistics", "calculus"],
  },
  {
    label: "Calculus",
    aliases: ["calc", "calculus"],
    keywords: ["differentiate", "derivative", "integral", "limit", "rate of change", "optimization"],
  },
  {
    label: "Statistics",
    aliases: ["stats", "statistics"],
    keywords: ["mean", "median", "variance", "distribution", "probability", "hypothesis", "regression", "sampling"],
  },
  {
    label: "Physics",
    aliases: ["phy", "physics"],
    keywords: ["force", "velocity", "acceleration", "momentum", "energy", "newton", "electric field", "circuit", "wave", "kinematics"],
  },
  {
    label: "H2 Physics",
    aliases: ["h2 physics", "jc physics"],
    keywords: ["superposition", "electric potential", "gravitational field", "quantum", "oscillation", "capacitance", "current", "wave particle"],
  },
  {
    label: "Chemistry",
    aliases: ["chem", "chemistry"],
    keywords: ["mole", "atom", "bond", "acid", "alkali", "titration", "organic", "compound", "reaction", "periodic table", "mixture", "element", "chemical", "susbtance", "chemical", "reaction"],
  },
  {
    label: "H2 Chemistry",
    aliases: ["h2 chemistry", "jc chemistry"],
    keywords: ["enthalpy", "electrochemistry", "equilibrium", "kinetics", "organic chemistry", "redox", "hybridisation"],
  },
  {
    label: "Biology",
    aliases: ["bio", "biology"],
    keywords: ["cell", "enzyme", "photosynthesis", "respiration", "dna", "genetics", "ecology", "organism"],
  },
  {
    label: "English",
    aliases: ["eng", "english language"],
    keywords: ["comprehension", "essay", "summary", "situational writing", "editing", "grammar", "inference"],
  },
  {
    label: "General Paper",
    aliases: ["gp", "general paper"],
    keywords: ["argument", "aq", "comprehension", "essay question", "media", "politics", "society", "globalisation"],
  },
  {
    label: "Economics",
    aliases: ["econs", "economics"],
    keywords: ["demand", "supply", "market failure", "elasticity", "gdp", "inflation", "fiscal policy", "monetary policy"],
  },
  {
    label: "Programming Fundamentals",
    aliases: ["programming", "coding", "programming fundamentals"],
    keywords: ["variable", "function", "loop", "array", "algorithm", "debug", "syntax", "condition"],
  },
  {
    label: "Programming",
    aliases: ["coding", "computer programming", "programming"],
    keywords: ["class", "object", "function", "recursion", "debug", "algorithm", "runtime", "compiler"],
  },
  {
    label: "Data Structures",
    aliases: ["dsa", "data structures"],
    keywords: ["linked list", "stack", "queue", "tree", "graph", "hash map", "heap", "binary search tree"],
  },
  {
    label: "Project Work",
    aliases: ["pw", "project work"],
    keywords: ["written report", "oral presentation", "insight", "evaluation", "proposal", "stakeholder"],
  },
  {
    label: "Communication Skills",
    aliases: ["communication", "presentation skills"],
    keywords: ["presentation", "email", "report writing", "audience", "clarity", "tone"],
  },
  {
    label: "Domain Core Module",
    aliases: ["core module", "domain module"],
    keywords: ["module", "case study", "application", "industry", "assignment"],
  },
  {
    label: "Academic Writing",
    aliases: ["writing", "academic writing"],
    keywords: ["thesis", "citation", "literature review", "paragraph", "argument", "evidence"],
  },
];

function getSearchTerms(entry) {
  return [entry.label, ...(entry.aliases || []), ...(entry.keywords || [])].map(normalizeSubjectText).filter(Boolean);
}

export function scoreSubjectLabelMatch(subjectLabel, targetLabel) {
  const normalizedSubject = normalizeSubjectText(subjectLabel);
  const normalizedTarget = normalizeSubjectText(targetLabel);

  if (!normalizedSubject || !normalizedTarget) {
    return 0;
  }

  if (normalizedSubject === normalizedTarget) {
    return 100;
  }

  const entry = subjectCatalog.find((item) => {
    const terms = getSearchTerms(item);
    return terms.includes(normalizedSubject);
  });

  if (!entry) {
    return normalizedSubject.includes(normalizedTarget) || normalizedTarget.includes(normalizedSubject) ? 40 : 0;
  }

  const terms = getSearchTerms(entry);
  if (terms.includes(normalizedTarget)) {
    return 90;
  }

  return terms.some((term) => normalizedTarget.includes(term) || term.includes(normalizedTarget)) ? 55 : 0;
}

export function mapToAllowedSubjectLabel(subjectLabel, allowedSubjects = []) {
  let bestLabel = "";
  let bestScore = 0;

  for (const allowedSubject of allowedSubjects) {
    const score = scoreSubjectLabelMatch(subjectLabel, allowedSubject);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = allowedSubject;
    }
  }

  return bestScore >= 55 ? bestLabel : "";
}

export function detectSubjectFromCatalog(text, allowedSubjects = []) {
  const normalized = normalizeSubjectText(text);
  if (!normalized) {
    return {
      subjectLabel: "",
      detectedTopic: "General Practice",
      confidence: "low",
      confidenceNote: "No clear subject signal was detected automatically.",
    };
  }

  const entries = allowedSubjects.length
    ? allowedSubjects.map((label) => {
      const aliasEntry = subjectCatalog.find((entry) => scoreSubjectLabelMatch(entry.label, label) >= 55);
      return aliasEntry || { label, aliases: [label], keywords: [] };
    })
    : subjectCatalog;

  const ranked = entries
    .map((entry) => {
      const aliasTerms = [entry.label, ...(entry.aliases || [])].map(normalizeSubjectText).filter(Boolean);
      const keywordTerms = (entry.keywords || []).map(normalizeSubjectText).filter(Boolean);
      const aliasScore = aliasTerms.reduce((total, term) => (
        normalized.includes(term) ? total + 6 : total
      ), 0);
      const keywordScore = keywordTerms.reduce((total, term) => (
        normalized.includes(term) ? total + 2 : total
      ), 0);

      return {
        label: entry.label,
        score: aliasScore + keywordScore,
      };
    })
    .sort((left, right) => right.score - left.score);

  const top = ranked[0];
  if (!top || top.score === 0) {
    return {
      subjectLabel: "",
      detectedTopic: "General Practice",
      confidence: "low",
      confidenceNote: "No clear subject signal was detected automatically.",
    };
  }

  const subjectLabel = mapToAllowedSubjectLabel(top.label, allowedSubjects) || top.label;

  return {
    subjectLabel,
    detectedTopic: "Auto-detected practice topic",
    confidence: top.score >= 10 ? "high" : top.score >= 4 ? "medium" : "low",
    confidenceNote:
      top.score >= 4
        ? "Detected from document subject signals. Please confirm before logging."
        : "Weak subject signal detected automatically. Please confirm manually.",
  };
}
