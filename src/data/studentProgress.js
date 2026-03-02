import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { applyAttemptToAcademicProfile, buildSubjectMasteryModel } from "./academicProfile";
import {
  buildLearningRadar,
  buildSessionFromStudentRecord,
  computeBehaviorPersonaScores,
  computeLearningFeatures,
  rankPersonaScores,
} from "./learningRadar";

const RADAR_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const WEAK_TOPIC_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
const BEHAVIOR_ELIGIBILITY_EVENT_COUNT = 25;
const BEHAVIOR_PROMOTION_CONFIDENCE = 0.6;
const BEHAVIOR_PROMOTION_MARGIN = 0.15;

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
  if (!snapshots.length) {
    return "timestamp,totalEvents,weakLabel,behaviorLabel,behaviorConfidence,behaviorMargin,canonicalLabel,labelSource\n";
  }

  const featureKeys = [...new Set(
    snapshots.flatMap((snapshot) => Object.keys(snapshot.features || {})),
  )].sort();
  const headers = [
    "timestamp",
    "totalEvents",
    "weakLabel",
    "behaviorLabel",
    "behaviorConfidence",
    "behaviorMargin",
    "canonicalLabel",
    "labelSource",
    ...featureKeys,
  ];

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
      snapshot.behaviorConfidence,
      snapshot.behaviorMargin,
      snapshot.canonicalLabel,
      snapshot.labelSource,
    ];
    const featureValues = featureKeys.map((key) => snapshot.features?.[key]);

    return [...baseValues, ...featureValues].map(escapeValue).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function createSeedActionPlan(referenceTime = Date.now()) {
  const baseEvents = [
    { dayOffset: 11, minuteOffset: 0, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: false, timeTakenSec: 210 },
    { dayOffset: 11, minuteOffset: 6, eventType: "retry", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 160 },
    { dayOffset: 11, minuteOffset: 12, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 175 },
    { dayOffset: 11, minuteOffset: 19, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 2, isCorrect: true, timeTakenSec: 145 },
    { dayOffset: 11, minuteOffset: 26, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: false, timeTakenSec: 220 },
    { dayOffset: 11, minuteOffset: 33, eventType: "review", topicId: "differentiation_chain_rule", difficulty: 2 },

    { dayOffset: 6, minuteOffset: 0, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 190 },
    { dayOffset: 6, minuteOffset: 7, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: false, timeTakenSec: 205 },
    { dayOffset: 6, minuteOffset: 14, eventType: "retry", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 150 },
    { dayOffset: 6, minuteOffset: 22, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 2, isCorrect: true, timeTakenSec: 135 },
    { dayOffset: 6, minuteOffset: 29, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 180 },
    { dayOffset: 6, minuteOffset: 36, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: false, timeTakenSec: 215 },

    { dayOffset: 1, minuteOffset: 0, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 185 },
    { dayOffset: 1, minuteOffset: 7, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 178 },
    { dayOffset: 1, minuteOffset: 14, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: false, timeTakenSec: 225 },
    { dayOffset: 1, minuteOffset: 21, eventType: "retry", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 155 },
    { dayOffset: 1, minuteOffset: 28, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 2, isCorrect: true, timeTakenSec: 140 },
    { dayOffset: 1, minuteOffset: 35, eventType: "review", topicId: "differentiation_chain_rule", difficulty: 2 },
    { dayOffset: 1, minuteOffset: 42, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 188 },

    { dayOffset: 0, minuteOffset: -80, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 182 },
    { dayOffset: 0, minuteOffset: -72, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: false, timeTakenSec: 218 },
    { dayOffset: 0, minuteOffset: -64, eventType: "retry", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 148 },
    { dayOffset: 0, minuteOffset: -56, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 176 },
    { dayOffset: 0, minuteOffset: -48, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 172 },
    { dayOffset: 0, minuteOffset: -40, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 2, isCorrect: true, timeTakenSec: 138 },
    { dayOffset: 0, minuteOffset: -32, eventType: "attempt", topicId: "differentiation_chain_rule", difficulty: 3, isCorrect: true, timeTakenSec: 181 },
  ];

  return baseEvents.map((event, index) => {
    const timestamp = referenceTime - (event.dayOffset * 24 * 60 * 60 * 1000) + (event.minuteOffset * 60 * 1000);

    return {
      ...event,
      questionId: `seed-${index + 1}`,
      subjectId: event.topicId,
      detectedTopic: "Chain Rule Demo",
      questionType: "Seeded Demo",
      sourceFile: {
        name: "seed-demo.json",
        type: "application/json",
        size: 1024,
      },
      timestamp,
    };
  });
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
  const eligible = (student.learningRadar?.meta?.totalEvents || 0) + 1 >= BEHAVIOR_ELIGIBILITY_EVENT_COUNT;
  const canPromote = eligible
    && behaviorOutcome.top
    && behaviorOutcome.confidence >= BEHAVIOR_PROMOTION_CONFIDENCE
    && behaviorOutcome.margin >= BEHAVIOR_PROMOTION_MARGIN;
  const canonicalLabel = canPromote ? behaviorOutcome.top : weakLabel;
  const labelSource = canPromote ? "behavior_rule" : "weak";
  const ranked = canPromote ? behaviorOutcome.ranked : rankPersonaScores(weakLabelScores);

  return {
    weakLabel,
    weakLabelScores,
    behaviorLabel: eligible ? behaviorOutcome.top : null,
    behaviorLabelScores: eligible ? behaviorOutcome.ranked.reduce((scores, persona) => {
      scores[persona.id] = persona.matchScore;
      return scores;
    }, {}) : null,
    behaviorConfidence: eligible ? behaviorOutcome.confidence : 0,
    behaviorMargin: eligible ? behaviorOutcome.margin : 0,
    canonicalLabel: {
      ...canonicalLabel,
      matchScore: canonicalLabel.matchScore ?? (canPromote ? behaviorOutcome.confidence : weakLabel.matchScore),
    },
    labelSource,
    ranked,
    lastLabelUpdatedAt: timestamp,
  };
}

async function saveTrainingSnapshot(studentDocId, timestamp, features, personaState) {
  await addDoc(collection(db, "students", studentDocId, "trainingSnapshots"), {
    timestamp,
    totalEvents: features.totalEvents,
    features,
    weakLabel: personaState.weakLabel.id,
    behaviorLabel: personaState.behaviorLabel?.id || null,
    behaviorConfidence: personaState.behaviorConfidence,
    behaviorMargin: personaState.behaviorMargin,
    canonicalLabel: personaState.canonicalLabel.id,
    labelSource: personaState.labelSource,
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
      liveMatchScores: personaState.labelSource === "behavior_rule" && personaState.behaviorLabelScores
        ? personaState.behaviorLabelScores
        : personaState.weakLabelScores,
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

    await saveTrainingSnapshot(docId, nextEvent.timestamp, features, personaState);
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
  });
}

export async function seedDemoLearningJourney(student) {
  let nextSession = student;
  const seedActions = createSeedActionPlan();

  for (const action of seedActions) {
    nextSession = await recordLearningAction(nextSession, action);
  }

  return nextSession;
}
