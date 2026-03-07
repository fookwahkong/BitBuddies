import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { applyAttemptToAcademicProfile, buildSubjectMasteryModel } from "./academicProfile";
import {
  buildLearningRadar,
  buildSessionFromStudentRecord,
  computeBehaviorPersonaScores,
  computeLearningFeatures,
  personaCatalog,
  rankPersonaScores,
} from "./learningRadar";

const RADAR_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const WEAK_TOPIC_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BEHAVIOR_ELIGIBILITY_EVENT_COUNT = 25;
const BEHAVIOR_PROMOTION_CONFIDENCE = 0.6;
const BEHAVIOR_PROMOTION_MARGIN = 0.15;
const DEMO_SOURCE_PREFIX = "seed-";
const JUDGE_DESK_DEMO_ORIGIN = "judge-desk";

function createEventPayload(student, action) {
  const timestamp = action.timestamp || Date.now();
  const timeSpentSec = typeof action.timeSpentSec === "number"
    ? action.timeSpentSec
    : (typeof action.timeTakenSec === "number" ? action.timeTakenSec : null);

  return {
    userId: student.studentID,
    timestamp,
    eventType: action.eventType,
    topicId: action.topicId || action.subjectId || "general",
    subjectId: action.subjectId || action.topicId || "general",
    questionId: action.questionId || null,
    difficulty: action.difficulty || 1,
    isCorrect: typeof action.isCorrect === "boolean" ? action.isCorrect : null,
    timeSpentSec,
    timeTakenSec: timeSpentSec,
    attemptNo: Number(action.attemptNo) || 1,
    hintUsed: Boolean(action.hintUsed),
    sourceFile: action.sourceFile || null,
    detectedTopic: action.detectedTopic || "",
    questionType: action.questionType || "",
    demoMeta: action.demoMeta || null,
  };
}

async function resolveStudentDocId(student) {
  if (student.docId) {
    return student.docId;
  }

  const usersRef = collection(db, "students");

  if (student.studentID) {
    const byStudentId = query(usersRef, where("studentID", "==", student.studentID));
    const byStudentSnapshot = await getDocs(byStudentId);

    if (!byStudentSnapshot.empty) {
      return byStudentSnapshot.docs[0].id;
    }
  }

  if (student.email) {
    const byEmail = query(usersRef, where("email", "==", student.email));
    const byEmailSnapshot = await getDocs(byEmail);

    if (!byEmailSnapshot.empty) {
      return byEmailSnapshot.docs[0].id;
    }
  }

  throw new Error("Student record could not be located in Firestore.");
}

function shouldRefreshFromMeta(previousMeta = {}, eventTimestamp) {
  const nextPendingEventCount = (previousMeta.pendingEventCount || 0) + 1;

  if (nextPendingEventCount >= (previousMeta.meaningfulActivityThreshold || 5)) {
    return true;
  }

  if (!previousMeta.lastComputedAt) {
    return true;
  }

  const lastComputedDay = new Date(previousMeta.lastComputedAt).toISOString().slice(0, 10);
  const currentDay = new Date(eventTimestamp).toISOString().slice(0, 10);

  return currentDay !== lastComputedDay;
}

async function fetchRecentLearningEvents(studentDocId, referenceTime) {
  const cutoff = referenceTime - WEAK_TOPIC_WINDOW_MS;
  const eventsRef = collection(db, "students", studentDocId, "learningEvents");
  const recentQuery = query(eventsRef, where("timestamp", ">=", cutoff));
  const snapshot = await getDocs(recentQuery);

  return snapshot.docs.map((eventDoc) => eventDoc.data());
}

export async function fetchTrainingSnapshots(student) {
  const docId = await resolveStudentDocId(student);
  const snapshotsRef = collection(db, "students", docId, "trainingSnapshots");
  const snapshot = await getDocs(snapshotsRef);

  return snapshot.docs
    .map((snapshotDoc) => ({
      id: snapshotDoc.id,
      ...snapshotDoc.data(),
    }))
    .sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
}

export function buildTrainingSnapshotCsv(snapshots = []) {
  const baseHeaders = [
    "timestamp",
    "totalEvents",
    "weakLabel",
    "behaviorLabel",
    "behaviorEligible",
    "behaviorConfidence",
    "behaviorMargin",
    "canonicalLabel",
    "labelSource",
    "activeLabelScores",
    "behaviorLabelScores",
    "weakLabelScores",
    "scenarioKind",
    "scenarioPersonaId",
    "patternType",
  ];

  if (!snapshots.length) {
    return `${baseHeaders.join(",")}\n`;
  }

  const featureKeys = [...new Set(
    snapshots.flatMap((snapshot) => Object.keys(snapshot.features || {})),
  )].sort();
  const headers = [...baseHeaders, ...featureKeys];

  const escapeValue = (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  };

  const rows = snapshots.map((snapshot) => {
    const baseValues = [
      snapshot.timestamp,
      snapshot.totalEvents,
      snapshot.weakLabel,
      snapshot.behaviorLabel,
      snapshot.behaviorEligible,
      snapshot.behaviorConfidence,
      snapshot.behaviorMargin,
      snapshot.canonicalLabel,
      snapshot.labelSource,
      snapshot.activeLabelScores || null,
      snapshot.behaviorLabelScores || null,
      snapshot.weakLabelScores || null,
      snapshot.demoMeta?.scenarioKind || null,
      snapshot.demoMeta?.personaId || null,
      snapshot.demoMeta?.patternType || null,
    ];
    const featureValues = featureKeys.map((key) => snapshot.features?.[key]);

    return [...baseValues, ...featureValues].map(escapeValue).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function createDemoSourceFile(fileName) {
  return {
    name: fileName,
    type: "application/json",
    size: 1024,
  };
}

function createDemoMeta({ scenarioKind, personaId = null, patternType = null }) {
  return {
    origin: JUDGE_DESK_DEMO_ORIGIN,
    scenarioKind,
    personaId,
    patternType,
  };
}

function createSeededAction({
  referenceTime,
  dayOffset,
  minuteOffset,
  counter,
  eventType = "attempt",
  topicId,
  difficulty = 2,
  isCorrect = null,
  timeTakenSec = null,
  questionId = null,
  detectedTopic,
  questionType,
  sourceFileName,
  demoMeta,
}) {
  return {
    eventType,
    topicId,
    subjectId: topicId,
    difficulty,
    isCorrect,
    timeTakenSec,
    questionId: questionId || `${sourceFileName.replace(".json", "")}-${counter}`,
    detectedTopic,
    questionType,
    sourceFile: createDemoSourceFile(sourceFileName),
    demoMeta,
    timestamp: referenceTime - (dayOffset * DAY_IN_MS) + (minuteOffset * 60 * 1000),
  };
}

function buildPersonaScenarioActions(personaId, referenceTime = Date.now()) {
  const normalizedPersonaId = personaCatalog[personaId] ? personaId : "comfort";
  const scenarioMeta = createDemoMeta({ scenarioKind: "persona", personaId: normalizedPersonaId });
  const sourceFileName = `${DEMO_SOURCE_PREFIX}persona-${normalizedPersonaId}.json`;
  const questionType = "Seeded Persona Scenario";
  const actions = [];
  let counter = 1;

  const pushAction = (config) => {
    actions.push(createSeededAction({
      ...config,
      referenceTime,
      counter,
      questionType,
      sourceFileName,
      demoMeta: scenarioMeta,
    }));
    counter += 1;
  };

  if (normalizedPersonaId === "comfort") {
    const dayOffsets = [13, 11, 10, 8, 7, 5, 4, 2, 0];
    const topicPool = [
      "algebra_linear_equations",
      "geometry_triangles",
      "chemistry_atomic_structure",
      "biology_cells",
    ];

    dayOffsets.forEach((dayOffset, dayIndex) => {
      for (let block = 0; block < 5; block += 1) {
        const topicId = topicPool[(dayIndex + block) % topicPool.length];
        pushAction({
          dayOffset,
          minuteOffset: block * 8,
          eventType: "attempt",
          topicId,
          difficulty: block % 4 === 0 ? 2 : 1,
          isCorrect: block === 2 ? false : true,
          timeTakenSec: 72 + ((block % 3) * 12),
          detectedTopic: "Comfort Persona Demo",
        });
      }
    });
  } else if (normalizedPersonaId === "perfectionist") {
    const dayOffsets = [12, 10, 8, 6, 4, 2, 0];

    dayOffsets.forEach((dayOffset, dayIndex) => {
      for (let block = 0; block < 2; block += 1) {
        const topicId = dayIndex % 2 === 0 ? "differentiation_chain_rule" : "electrolysis_redox";
        const questionId = `perfectionist-q-${dayIndex + 1}-${block + 1}`;

        pushAction({
          dayOffset,
          minuteOffset: block * 24,
          eventType: "attempt",
          topicId,
          difficulty: 3,
          isCorrect: false,
          timeTakenSec: 260 + (block * 18),
          questionId,
          detectedTopic: "Perfectionist Persona Demo",
        });
        pushAction({
          dayOffset,
          minuteOffset: (block * 24) + 7,
          eventType: "review",
          topicId,
          difficulty: 2,
          timeTakenSec: 150,
          questionId: `${questionId}-review`,
          detectedTopic: "Perfectionist Persona Demo",
        });
        pushAction({
          dayOffset,
          minuteOffset: (block * 24) + 15,
          eventType: "retry",
          topicId,
          difficulty: 3,
          isCorrect: true,
          timeTakenSec: 240 + (block * 12),
          questionId,
          detectedTopic: "Perfectionist Persona Demo",
        });
      }

      pushAction({
        dayOffset,
        minuteOffset: 56,
        eventType: "attempt",
        topicId: dayIndex % 2 === 0 ? "differentiation_chain_rule" : "electrolysis_redox",
        difficulty: 2,
        isCorrect: true,
        timeTakenSec: 190,
        detectedTopic: "Perfectionist Persona Demo",
      });
    });

    [1, 0].forEach((dayOffset) => {
      for (let index = 0; index < 4; index += 1) {
        const questionId = `perfectionist-bonus-${dayOffset}-${index + 1}`;

        pushAction({
          dayOffset,
          minuteOffset: 90 + (index * 10),
          eventType: "attempt",
          topicId: "differentiation_chain_rule",
          difficulty: 3,
          isCorrect: index % 2 === 0,
          timeTakenSec: 250 + (index * 16),
          questionId,
          detectedTopic: "Perfectionist Persona Demo",
        });

        if (index % 2 === 1) {
          pushAction({
            dayOffset,
            minuteOffset: 95 + (index * 10),
            eventType: "review",
            topicId: "differentiation_chain_rule",
            difficulty: 2,
            timeTakenSec: 140,
            questionId: `${questionId}-review`,
            detectedTopic: "Perfectionist Persona Demo",
          });
        }
      }
    });
  } else if (normalizedPersonaId === "crammer") {
    const dayPlans = [
      { dayOffset: 13, startMinute: 0, eventCount: 5 },
      { dayOffset: 9, startMinute: 0, eventCount: 5 },
      { dayOffset: 1, startMinute: 30, eventCount: 15 },
      { dayOffset: 0, startMinute: 60, eventCount: 20 },
    ];
    const topicPool = ["differentiation_chain_rule", "integration_substitution"];

    dayPlans.forEach((plan, planIndex) => {
      for (let index = 0; index < plan.eventCount; index += 1) {
        const questionId = `crammer-${plan.dayOffset}-${Math.floor(index / 2) + 1}`;

        pushAction({
          dayOffset: plan.dayOffset,
          minuteOffset: plan.startMinute + (index * 8),
          eventType: index % 6 === 5 ? "review" : (index % 5 === 2 ? "retry" : "attempt"),
          topicId: topicPool[(planIndex + index) % topicPool.length],
          difficulty: index % 4 === 0 ? 2 : 3,
          isCorrect: index % 5 === 1 ? false : true,
          timeTakenSec: 170 + ((index % 5) * 15),
          questionId,
          detectedTopic: "Crammer Persona Demo",
        });
      }
    });
  } else if (normalizedPersonaId === "avoider") {
    [
      { dayOffset: 13, topicId: "probability_tree", correct: false },
      { dayOffset: 12, topicId: "trigonometry_identities", correct: false },
      { dayOffset: 11, topicId: "kinematics_velocity", correct: false },
      { dayOffset: 10, topicId: "probability_tree", correct: true },
    ].forEach((item, index) => {
      pushAction({
        dayOffset: item.dayOffset,
        minuteOffset: 0,
        eventType: "attempt",
        topicId: item.topicId,
        difficulty: 3,
        isCorrect: item.correct,
        timeTakenSec: 165,
        detectedTopic: "Avoider Persona Demo",
      });

      if (index === 0) {
        pushAction({
          dayOffset: item.dayOffset,
          minuteOffset: 8,
          eventType: "review",
          topicId: item.topicId,
          difficulty: 2,
          timeTakenSec: 110,
          detectedTopic: "Avoider Persona Demo",
        });
      }
    });

    [9, 7, 5, 4, 2, 1, 0].forEach((dayOffset, dayIndex) => {
      for (let block = 0; block < 6; block += 1) {
        pushAction({
          dayOffset,
          minuteOffset: block * 7,
          eventType: "attempt",
          topicId: block === 5 && dayIndex % 3 === 0 ? "algebra_factorisation" : "algebra_linear_equations",
          difficulty: block % 5 === 0 ? 2 : 1,
          isCorrect: block === 1 && dayIndex % 2 === 0 ? false : true,
          timeTakenSec: 82 + ((block % 2) * 14),
          detectedTopic: "Avoider Persona Demo",
        });
      }
    });
  } else {
    const topicPool = [
      "algebra_factorisation",
      "probability_tree",
      "trigonometry_identities",
      "kinematics_velocity",
      "differentiation_chain_rule",
    ];

    for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
      for (let block = 0; block < 3; block += 1) {
        pushAction({
          dayOffset,
          minuteOffset: block * 6,
          eventType: "attempt",
          topicId: topicPool[(dayOffset + block) % topicPool.length],
          difficulty: block === 2 ? 2 : 1,
          isCorrect: block === 1 && dayOffset % 3 === 0 ? false : true,
          timeTakenSec: 65 + (block * 10),
          detectedTopic: "Sprinter Persona Demo",
        });
      }
    }

    [1, 0].forEach((dayOffset) => {
      pushAction({
        dayOffset,
        minuteOffset: 90,
        eventType: "attempt",
        topicId: topicPool[dayOffset],
        difficulty: 2,
        isCorrect: true,
        timeTakenSec: 78,
        detectedTopic: "Sprinter Persona Demo",
      });
      pushAction({
        dayOffset,
        minuteOffset: 96,
        eventType: "attempt",
        topicId: topicPool[(dayOffset + 1) % topicPool.length],
        difficulty: 1,
        isCorrect: true,
        timeTakenSec: 72,
        detectedTopic: "Sprinter Persona Demo",
      });
    });
  }

  return actions.sort((left, right) => left.timestamp - right.timestamp);
}

function createPatternActionPlan(patternType, referenceTime = Date.now()) {
  const baseTopicPool = [
    "differentiation_chain_rule",
    "algebra_factorisation",
    "probability_tree",
    "trigonometry_identities",
    "kinematics_velocity",
  ];
  const scenarioMeta = createDemoMeta({ scenarioKind: "pattern", patternType });

  function buildPatternAction(config, suffix) {
    return createSeededAction({
      ...config,
      referenceTime,
      counter: suffix,
      questionType: "Seeded Pattern",
      sourceFileName: `${DEMO_SOURCE_PREFIX}${patternType}.json`,
      demoMeta: scenarioMeta,
    });
  }

  if (patternType === "inactive") {
    const dayOffsets = [13, 12, 10, 9, 8, 7, 6];
    return dayOffsets.map((dayOffset, index) => buildPatternAction({
      dayOffset,
      minuteOffset: 0,
      eventType: index % 4 === 0 ? "review" : "attempt",
      topicId: baseTopicPool[index % baseTopicPool.length],
      difficulty: index % 3 === 0 ? 3 : 2,
      isCorrect: index % 3 !== 1,
      timeTakenSec: 220 - ((index % 3) * 20),
      questionId: `inactive-${index + 1}`,
      detectedTopic: "Inactive Seed",
    }, index + 1));
  }

  if (patternType === "bursty") {
    const actions = [];
    const heavyDayOffsets = [0, 1];
    let counter = 1;

    heavyDayOffsets.forEach((dayOffset) => {
      for (let index = 0; index < 8; index += 1) {
        actions.push(buildPatternAction({
          dayOffset,
          minuteOffset: index * 18,
          eventType: "attempt",
          topicId: baseTopicPool[index % 2],
          difficulty: 3,
          isCorrect: index % 3 !== 0,
          timeTakenSec: 820 + (index * 15),
          questionId: `bursty-heavy-${counter}`,
          detectedTopic: "Bursty Heavy Block",
        }, counter));
        counter += 1;
      }
    });

    [5, 9, 12].forEach((dayOffset, index) => {
      actions.push(buildPatternAction({
        dayOffset,
        minuteOffset: 0,
        eventType: "attempt",
        topicId: baseTopicPool[(index + 2) % baseTopicPool.length],
        difficulty: 2,
        isCorrect: true,
        timeTakenSec: 140,
        questionId: `bursty-light-${index + 1}`,
        detectedTopic: "Bursty Light Block",
      }, counter));
      counter += 1;
    });

    return actions.sort((left, right) => left.timestamp - right.timestamp);
  }

  if (patternType === "fragmented") {
    const actions = [];
    let counter = 1;
    for (let dayOffset = 0; dayOffset <= 6; dayOffset += 1) {
      for (let block = 0; block < 3; block += 1) {
        const topicId = baseTopicPool[(counter - 1) % baseTopicPool.length];
        actions.push(buildPatternAction({
          dayOffset,
          minuteOffset: block * 150,
          eventType: "attempt",
          topicId,
          difficulty: 2,
          isCorrect: counter % 4 !== 0,
          timeTakenSec: 110 + ((counter % 3) * 18),
          questionId: `fragmented-${counter}`,
          detectedTopic: "Fragmented Seed",
        }, counter));
        counter += 1;
      }
    }
    return actions.sort((left, right) => left.timestamp - right.timestamp);
  }

  if (patternType === "deadlineDriven") {
    const actions = [];
    let counter = 1;

    [13, 12, 11, 10, 9, 8].forEach((dayOffset) => {
      actions.push(buildPatternAction({
        dayOffset,
        minuteOffset: 0,
        eventType: "attempt",
        topicId: baseTopicPool[0],
        difficulty: 2,
        isCorrect: true,
        timeTakenSec: 170,
        questionId: `deadline-early-${counter}`,
        detectedTopic: "Deadline Early",
      }, counter));
      counter += 1;
    });

    for (let dayOffset = 2; dayOffset >= 0; dayOffset -= 1) {
      for (let index = 0; index < 7; index += 1) {
        const topicId = baseTopicPool[index % 2];
        actions.push(buildPatternAction({
          dayOffset,
          minuteOffset: index * 28,
          eventType: "attempt",
          topicId,
          difficulty: 3,
          isCorrect: index % 5 !== 0,
          timeTakenSec: 420 + (index * 24),
          questionId: `deadline-late-${counter}`,
          detectedTopic: "Deadline Late Push",
        }, counter));
        counter += 1;
      }
    }

    return actions.sort((left, right) => left.timestamp - right.timestamp);
  }

  return buildPersonaScenarioActions("crammer", referenceTime);
}

function getTopBehaviorOutcome(behaviorLabelScores) {
  const ranked = rankPersonaScores(behaviorLabelScores);
  const top = ranked[0];
  const second = ranked[1];
  const confidence = top?.matchScore || 0;
  const margin = Number(top && second ? (top.matchScore - second.matchScore).toFixed(4) : confidence.toFixed(4));

  return {
    ranked,
    top,
    confidence,
    margin,
  };
}

function buildCanonicalPersonaState(student, behaviorOutcome, timestamp) {
  const weakLabel = student.persona.weakLabel || student.persona.primary;
  const weakLabelScores = student.persona.weakLabelScores || student.persona.initialMatchScores;
  const behaviorEligible = (student.learningRadar?.meta?.totalEvents || 0) + 1 >= BEHAVIOR_ELIGIBILITY_EVENT_COUNT;
  const canPromote = behaviorEligible
    && behaviorOutcome.top
    && behaviorOutcome.confidence >= BEHAVIOR_PROMOTION_CONFIDENCE
    && behaviorOutcome.margin >= BEHAVIOR_PROMOTION_MARGIN;
  const canonicalLabel = canPromote ? behaviorOutcome.top : weakLabel;
  const labelSource = canPromote ? "behavior_rule" : "weak";
  const ranked = canPromote ? behaviorOutcome.ranked : rankPersonaScores(weakLabelScores);
  const behaviorLabelScores = behaviorEligible ? behaviorOutcome.ranked.reduce((scores, persona) => {
    scores[persona.id] = persona.matchScore;
    return scores;
  }, {}) : null;

  return {
    weakLabel,
    weakLabelScores,
    behaviorEligible,
    behaviorLabel: behaviorEligible ? behaviorOutcome.top : null,
    behaviorLabelScores,
    behaviorConfidence: behaviorEligible ? behaviorOutcome.confidence : 0,
    behaviorMargin: behaviorEligible ? behaviorOutcome.margin : 0,
    canonicalLabel: {
      ...canonicalLabel,
      matchScore: canonicalLabel.matchScore ?? (canPromote ? behaviorOutcome.confidence : weakLabel.matchScore),
    },
    labelSource,
    ranked,
    lastLabelUpdatedAt: timestamp,
    activeLabelScores: labelSource === "behavior_rule" && behaviorLabelScores ? behaviorLabelScores : weakLabelScores,
  };
}

async function saveTrainingSnapshot(studentDocId, timestamp, features, personaState) {
  await addDoc(collection(db, "students", studentDocId, "trainingSnapshots"), {
    timestamp,
    totalEvents: features.totalEvents,
    features,
    weakLabel: personaState.weakLabel.id,
    weakLabelScores: personaState.weakLabelScores,
    behaviorLabel: personaState.behaviorLabel?.id || null,
    behaviorLabelScores: personaState.behaviorLabelScores,
    behaviorEligible: personaState.behaviorEligible,
    behaviorConfidence: personaState.behaviorConfidence,
    behaviorMargin: personaState.behaviorMargin,
    canonicalLabel: personaState.canonicalLabel.id,
    labelSource: personaState.labelSource,
    activeLabelScores: personaState.activeLabelScores,
    demoMeta: personaState.demoMeta || null,
  });
}

export async function recordLearningAction(student, action) {
  const docId = await resolveStudentDocId(student);
  const nextEvent = createEventPayload(student, action);
  const previousMeta = student.learningRadar?.meta || {};
  const nextTotalEvents = (previousMeta.totalEvents || 0) + 1;
  const shouldRefresh = shouldRefreshFromMeta(previousMeta, nextEvent.timestamp);
  const nextAcademicProfile = applyAttemptToAcademicProfile(
    student.academicProfile,
    nextEvent,
    nextEvent.timestamp,
  );
  const academicProfileChanged = nextAcademicProfile !== student.academicProfile;
  const nextSubjectMastery = academicProfileChanged
    ? buildSubjectMasteryModel(nextAcademicProfile, nextEvent.timestamp)
    : student.subjectMastery;

  await addDoc(collection(db, "students", docId, "learningEvents"), nextEvent);

  let nextRadar = student.learningRadar;
  let nextRecentEvents = [...(student.learningEvents || []), nextEvent].filter((event) => (
    nextEvent.timestamp - event.timestamp <= WEAK_TOPIC_WINDOW_MS
  ));
  let nextBehaviorFeatures = student.behaviorFeatures || null;
  let nextWeakTopicSet = student.weakTopicSet || [];
  let nextTopicStats = student.topicStats || {};
  let nextPersona = { ...student.persona };

  if (shouldRefresh || !student.learningRadar) {
    const recentEvents = await fetchRecentLearningEvents(docId, nextEvent.timestamp);
    const features = computeLearningFeatures(recentEvents, nextEvent.timestamp, {
      weakTopicWindowMs: WEAK_TOPIC_WINDOW_MS,
    });
    const behaviorLabelScores = computeBehaviorPersonaScores(features, student.persona.weakLabelScores);
    const behaviorOutcome = getTopBehaviorOutcome(behaviorLabelScores);
    const personaState = buildCanonicalPersonaState(student, behaviorOutcome, nextEvent.timestamp);

    nextRecentEvents = recentEvents;
    nextBehaviorFeatures = features;
    nextWeakTopicSet = features.weakTopicSet;
    nextTopicStats = features.topicStats;
    nextPersona = {
      ...student.persona,
      primary: personaState.canonicalLabel,
      initialPrimary: student.persona.initialPrimary || student.persona.primary,
      weakLabel: personaState.weakLabel,
      weakLabelScores: personaState.weakLabelScores,
      behaviorLabel: personaState.behaviorLabel,
      behaviorLabelScores: personaState.behaviorLabelScores,
      behaviorConfidence: personaState.behaviorConfidence,
      behaviorMargin: personaState.behaviorMargin,
      canonicalLabel: personaState.canonicalLabel,
      labelSource: personaState.labelSource,
      lastLabelUpdatedAt: personaState.lastLabelUpdatedAt,
      liveMatchScores: personaState.activeLabelScores,
      ranked: personaState.ranked,
    };
    nextRadar = buildLearningRadar({
      matchScores: student.persona.weakLabelScores || student.persona.initialMatchScores,
      events: recentEvents,
      previousRadar: student.learningRadar,
      previousMeta,
      totalEventCount: nextTotalEvents,
      pendingEventCount: 0,
      referenceTime: nextEvent.timestamp,
    });

    await saveTrainingSnapshot(docId, nextEvent.timestamp, features, {
      ...personaState,
      demoMeta: nextEvent.demoMeta || null,
    });
  } else {
    nextRadar = {
      ...student.learningRadar,
      meta: {
        ...previousMeta,
        totalEvents: nextTotalEvents,
        pendingEventCount: (previousMeta.pendingEventCount || 0) + 1,
        lastEventAt: nextEvent.timestamp,
        shouldRefresh: false,
      },
    };
  }

  const updatePayload = {
    learningRadar: nextRadar,
    updatedAt: new Date(nextEvent.timestamp).toISOString(),
    "practiceIntake.lastUploadedSource": nextEvent.sourceFile || null,
    "practiceIntake.pendingMetadata": {
      subjectId: nextEvent.subjectId || null,
      detectedTopic: nextEvent.detectedTopic || "",
      questionType: nextEvent.questionType || "",
      difficulty: nextEvent.difficulty || 1,
      updatedAt: new Date(nextEvent.timestamp).toISOString(),
    },
  };

  if (academicProfileChanged) {
    updatePayload.academicProfile = nextAcademicProfile;
    updatePayload.subjectMastery = nextSubjectMastery;
  }

  if (shouldRefresh || !student.persona.ranked) {
    updatePayload.behaviorFeatures = nextBehaviorFeatures;
    updatePayload.weakTopicSet = nextWeakTopicSet;
    updatePayload.topicStats = nextTopicStats;
    updatePayload.personaConfidence = nextPersona.primary?.matchScore || 0;
    updatePayload["persona.primary"] = nextPersona.primary;
    updatePayload["persona.initialPrimary"] = nextPersona.initialPrimary;
    updatePayload["persona.weakLabel"] = nextPersona.weakLabel;
    updatePayload["persona.weakLabelScores"] = nextPersona.weakLabelScores;
    updatePayload["persona.behaviorLabel"] = nextPersona.behaviorLabel;
    updatePayload["persona.behaviorLabelScores"] = nextPersona.behaviorLabelScores;
    updatePayload["persona.behaviorConfidence"] = nextPersona.behaviorConfidence;
    updatePayload["persona.behaviorMargin"] = nextPersona.behaviorMargin;
    updatePayload["persona.canonicalLabel"] = nextPersona.canonicalLabel;
    updatePayload["persona.labelSource"] = nextPersona.labelSource;
    updatePayload["persona.lastLabelUpdatedAt"] = nextPersona.lastLabelUpdatedAt;
    updatePayload["persona.liveMatchScores"] = nextPersona.liveMatchScores;
    updatePayload["persona.ranked"] = nextPersona.ranked;
  }

  await updateDoc(doc(db, "students", docId), updatePayload);

  return buildSessionFromStudentRecord({
    ...student,
    docId,
    username: student.name,
    persona: nextPersona,
    behaviorFeatures: nextBehaviorFeatures,
    weakTopicSet: nextWeakTopicSet,
    topicStats: nextTopicStats,
    academicProfile: nextAcademicProfile,
    subjectMastery: nextSubjectMastery,
    practiceIntake: {
      ...(student.practiceIntake || {}),
      lastUploadedSource: nextEvent.sourceFile || null,
      pendingMetadata: {
        subjectId: nextEvent.subjectId || null,
        detectedTopic: nextEvent.detectedTopic || "",
        questionType: nextEvent.questionType || "",
        difficulty: nextEvent.difficulty || 1,
        updatedAt: new Date(nextEvent.timestamp).toISOString(),
      },
    },
    learningEvents: nextRecentEvents,
    learningRadar: nextRadar,
    judgeDeskDemo: student.judgeDeskDemo || null,
  });
}

export async function saveLatestPracticeAnalysis(student, analysis) {
  if (!student || !analysis) {
    return student;
  }

  const docId = await resolveStudentDocId(student);
  const nextAnalysis = {
    title: analysis.title || "Practice document analysis",
    summary: analysis.summary || "",
    documentSignals: Array.isArray(analysis.documentSignals) ? analysis.documentSignals.slice(0, 6) : [],
    recommendedActions: Array.isArray(analysis.recommendedActions) ? analysis.recommendedActions.slice(0, 4) : [],
    personaPeerInsights: Array.isArray(analysis.personaPeerInsights) ? analysis.personaPeerInsights.slice(0, 4) : [],
    personalHistoryRecommendations: Array.isArray(analysis.personalHistoryRecommendations)
      ? analysis.personalHistoryRecommendations.slice(0, 4)
      : [],
    evidence: Array.isArray(analysis.evidence) ? analysis.evidence.slice(0, 6) : [],
    updatedAt: new Date().toISOString(),
  };

  await updateDoc(doc(db, "students", docId), {
    latestPracticeAnalysis: nextAnalysis,
    updatedAt: nextAnalysis.updatedAt,
  });

  return buildSessionFromStudentRecord({
    ...student,
    docId,
    latestPracticeAnalysis: nextAnalysis,
  });
}

function createDemoBaseline(student) {
  return {
    persona: student.persona || null,
    personaConfidence: typeof student.personaConfidence === "number" ? student.personaConfidence : 0,
    behaviorFeatures: student.behaviorFeatures || null,
    weakTopicSet: student.weakTopicSet || [],
    topicStats: student.topicStats || {},
    learningRadar: student.learningRadar || null,
    academicProfile: student.academicProfile || null,
    subjectMastery: student.subjectMastery || null,
    practiceIntake: student.practiceIntake || {
      lastUploadedSource: null,
      pendingMetadata: null,
    },
    latestPracticeAnalysis: student.latestPracticeAnalysis || null,
  };
}

function isDemoEventRecord(record) {
  return record?.demoMeta?.origin === JUDGE_DESK_DEMO_ORIGIN
    || String(record?.sourceFile?.name || "").startsWith(DEMO_SOURCE_PREFIX);
}

function isDemoSnapshotRecord(record) {
  return record?.demoMeta?.origin === JUDGE_DESK_DEMO_ORIGIN;
}

async function deleteMatchingDocs(docId, collectionName, predicate) {
  const snapshot = await getDocs(collection(db, "students", docId, collectionName));
  const deletions = snapshot.docs
    .filter((snapshotDoc) => predicate(snapshotDoc.data()))
    .map((snapshotDoc) => deleteDoc(snapshotDoc.ref));

  await Promise.all(deletions);
}

async function resetDemoGeneratedData(student, docId, baseline) {
  const nowIso = new Date().toISOString();

  await deleteMatchingDocs(docId, "learningEvents", isDemoEventRecord);
  await deleteMatchingDocs(docId, "trainingSnapshots", isDemoSnapshotRecord);

  const resetPayload = {
    persona: baseline.persona || student.persona,
    personaConfidence: typeof baseline.personaConfidence === "number"
      ? baseline.personaConfidence
      : (student.personaConfidence || 0),
    behaviorFeatures: baseline.behaviorFeatures || null,
    weakTopicSet: baseline.weakTopicSet || [],
    topicStats: baseline.topicStats || {},
    learningRadar: baseline.learningRadar || null,
    academicProfile: baseline.academicProfile || null,
    subjectMastery: baseline.subjectMastery || null,
    practiceIntake: baseline.practiceIntake || null,
    latestPracticeAnalysis: baseline.latestPracticeAnalysis || null,
    judgeDeskDemo: {
      baseline,
      activeScenario: null,
      updatedAt: nowIso,
    },
    updatedAt: nowIso,
  };

  await updateDoc(doc(db, "students", docId), resetPayload);

  return buildSessionFromStudentRecord({
    ...student,
    docId,
    username: student.name,
    persona: resetPayload.persona,
    personaConfidence: resetPayload.personaConfidence,
    behaviorFeatures: resetPayload.behaviorFeatures,
    weakTopicSet: resetPayload.weakTopicSet,
    topicStats: resetPayload.topicStats,
    learningRadar: resetPayload.learningRadar,
    academicProfile: resetPayload.academicProfile,
    subjectMastery: resetPayload.subjectMastery,
    practiceIntake: resetPayload.practiceIntake,
    latestPracticeAnalysis: resetPayload.latestPracticeAnalysis,
    learningEvents: [],
    judgeDeskDemo: resetPayload.judgeDeskDemo,
  });
}

async function prepareDemoSeedSession(student, scenario) {
  const docId = await resolveStudentDocId(student);
  const baseline = student.judgeDeskDemo?.baseline || createDemoBaseline(student);
  const nowIso = new Date().toISOString();
  const resetSession = await resetDemoGeneratedData(student, docId, baseline);

  await updateDoc(doc(db, "students", docId), {
    judgeDeskDemo: {
      baseline,
      activeScenario: scenario,
      updatedAt: nowIso,
    },
    updatedAt: nowIso,
  });

  return buildSessionFromStudentRecord({
    ...resetSession,
    docId,
    username: student.name,
    judgeDeskDemo: {
      baseline,
      activeScenario: scenario,
      updatedAt: nowIso,
    },
  });
}

export async function seedPersonaLearningJourney(student, personaId) {
  const normalizedPersonaId = personaCatalog[personaId] ? personaId : "comfort";
  let nextSession = await prepareDemoSeedSession(student, {
    scenarioKind: "persona",
    personaId: normalizedPersonaId,
    patternType: null,
  });
  const seedActions = buildPersonaScenarioActions(normalizedPersonaId);

  for (const action of seedActions) {
    nextSession = await recordLearningAction(nextSession, action);
  }

  return nextSession;
}

export async function seedDemoLearningJourney(student) {
  return seedPersonaLearningJourney(student, "comfort");
}

export async function seedNonLinearPatternJourney(student, patternType) {
  const supportedTypes = new Set(["inactive", "bursty", "fragmented", "deadlineDriven"]);
  const normalizedType = supportedTypes.has(patternType) ? patternType : "bursty";
  let nextSession = await prepareDemoSeedSession(student, {
    scenarioKind: "pattern",
    personaId: null,
    patternType: normalizedType,
  });
  const docId = await resolveStudentDocId(nextSession);
  const referenceTime = Date.now();
  const seedActions = createPatternActionPlan(normalizedType, referenceTime);

  if (normalizedType === "deadlineDriven") {
    const currentAcademicProfile = nextSession.academicProfile || { subjects: [] };
    const subjects = Array.isArray(currentAcademicProfile.subjects) ? currentAcademicProfile.subjects : [];
    const fallbackSubjects = subjects.length
      ? subjects
      : [{
        id: "differentiation_chain_rule",
        label: "Mathematics",
        importanceScore: 3,
        weaknessScore: 3,
        targetGrade: "",
        normalizedWeight: 1,
      }];
    const nextSubjects = fallbackSubjects.map((subject, index) => ({
      ...subject,
      examDate: index < 2
        ? new Date(referenceTime + (5 * DAY_IN_MS)).toISOString().slice(0, 10)
        : (subject.examDate || ""),
    }));
    const nextAcademicProfile = {
      ...currentAcademicProfile,
      subjects: nextSubjects,
      updatedAt: referenceTime,
    };

    await updateDoc(doc(db, "students", docId), {
      academicProfile: nextAcademicProfile,
      updatedAt: new Date(referenceTime).toISOString(),
    });

    nextSession = buildSessionFromStudentRecord({
      ...nextSession,
      docId,
      academicProfile: nextAcademicProfile,
    });
  }

  for (const action of seedActions) {
    nextSession = await recordLearningAction(nextSession, action);
  }

  return nextSession;
}
