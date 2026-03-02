import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { applyAttemptToAcademicProfile, buildSubjectMasteryModel } from "./academicProfile";
import {
  blendPersonaMatchScores,
  buildLearningRadar,
  buildSessionFromStudentRecord,
  computeBehaviorPersonaScores,
  computeLearningFeatures,
  rankPersonaScores,
} from "./learningRadar";

const RADAR_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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
  const cutoff = referenceTime - RADAR_WINDOW_MS;
  const eventsRef = collection(db, "students", studentDocId, "learningEvents");
  const recentQuery = query(eventsRef, where("timestamp", ">=", cutoff));
  const snapshot = await getDocs(recentQuery);

  return snapshot.docs.map((eventDoc) => eventDoc.data());
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
  let nextPrimary = student.persona.primary;
  let liveMatchScores = student.persona.liveMatchScores;
  let ranked = student.persona.ranked;
  let nextRecentEvents = [...(student.learningEvents || []), nextEvent].filter((event) => (
    nextEvent.timestamp - event.timestamp <= RADAR_WINDOW_MS
  ));

  if (shouldRefresh || !student.learningRadar) {
    const recentEvents = await fetchRecentLearningEvents(docId, nextEvent.timestamp);
    const features = computeLearningFeatures(recentEvents, nextEvent.timestamp);
    const confidence = Math.min(1, nextTotalEvents / 100);
    const behaviorMatchScores = computeBehaviorPersonaScores(features);
    liveMatchScores = blendPersonaMatchScores(student.persona.initialMatchScores, behaviorMatchScores, confidence);
    ranked = rankPersonaScores(liveMatchScores);
    nextPrimary = ranked[0];
    nextRecentEvents = recentEvents;
    nextRadar = buildLearningRadar({
      matchScores: student.persona.initialMatchScores,
      events: recentEvents,
      previousRadar: student.learningRadar,
      previousMeta,
      totalEventCount: nextTotalEvents,
      pendingEventCount: 0,
      referenceTime: nextEvent.timestamp,
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
    updatePayload["persona.primary"] = nextPrimary;
    updatePayload["persona.liveMatchScores"] = liveMatchScores;
    updatePayload["persona.ranked"] = ranked;
  }

  if (!student.persona.initialPrimary) {
    updatePayload["persona.initialPrimary"] = student.persona.primary;
  }

  await updateDoc(doc(db, "students", docId), updatePayload);

  return buildSessionFromStudentRecord({
    ...student,
    docId,
    username: student.name,
    persona: {
      ...student.persona,
      primary: nextPrimary,
      initialPrimary: student.persona.initialPrimary || student.persona.primary,
      liveMatchScores,
      ranked,
    },
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
