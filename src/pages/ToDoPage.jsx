import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import TopNav from "../components/TopNav";

import { db } from "../firebaseConfig.js";

const DEFAULT_NODE_MAP = {
  start: {
    id: "start",
    label: "Start point",
    parentId: null,
    depth: 0,
    tag: "Anchor",
    assignment: "Choose one path to shape the next study session.",
    reason: [
      "Possible Worlds lets the learner compare paths before committing.",
      "Each node explains what the assignment does and why it matters.",
      "Dragging the bubbles lets the student physically arrange the plan.",
    ],
    impact: { mastery: 0, clarity: 0, confidence: 0, speed: 0, readiness: 0 },
  },
  review: {
    id: "review",
    label: "Review the weak step",
    parentId: "start",
    depth: 1,
    tag: "Branch A",
    assignment:
      "Open worked examples and isolate the exact step that keeps breaking.",
    reason: [
      "Best when the student is making the same mistake repeatedly.",
      "Reduces confusion before they move into harder timed work.",
      "Good reset path when confidence is higher than actual accuracy.",
    ],
    impact: { mastery: 10, clarity: 16, confidence: -4, speed: 4, readiness: 8 },
  },
  stretch: {
    id: "stretch",
    label: "Push into harder practice",
    parentId: "start",
    depth: 1,
    tag: "Branch B",
    assignment:
      "Skip the safe questions and jump straight into high-demand exam tasks.",
    reason: [
      "Useful when the student already understands the concept but needs pressure.",
      "Improves exam readiness by exposing harder mark schemes earlier.",
      "Works well if time is limited and easy marks are already stable.",
    ],
    impact: { mastery: 8, clarity: 4, confidence: -2, speed: 10, readiness: 15 },
  },
  flashcards: {
    id: "flashcards",
    label: "Make recall cards",
    parentId: "review",
    depth: 2,
    tag: "Assignment",
    assignment:
      "Turn formulas, definitions, or common mistakes into short active-recall cards.",
    reason: [
      "Good for content that must be remembered exactly.",
      "Builds retention without overwhelming the student.",
      "Creates a reusable revision asset for later sessions.",
    ],
    impact: { mastery: 7, clarity: 8, confidence: 4, speed: 2, readiness: 6 },
  },
  teach: {
    id: "teach",
    label: "Explain it out loud",
    parentId: "review",
    depth: 2,
    tag: "Assignment",
    assignment:
      "Have the learner teach the method to a friend, camera, or empty room in one take.",
    reason: [
      "Exposes missing logic faster than silent review.",
      "Improves explanation quality for show-your-working questions.",
      "Strong choice when understanding exists but language is weak.",
    ],
    impact: { mastery: 9, clarity: 14, confidence: 3, speed: 1, readiness: 9 },
  },
  quiz: {
    id: "quiz",
    label: "Timed mini quiz",
    parentId: "stretch",
    depth: 2,
    tag: "Assignment",
    assignment: "Run a short timer and answer 4 to 5 mixed questions with no notes.",
    reason: [
      "Makes weak spots visible under pressure.",
      "Raises pace and decision speed without a full mock paper.",
      "Useful before a longer homework or practice block.",
    ],
    impact: { mastery: 6, clarity: 3, confidence: -1, speed: 12, readiness: 13 },
  },
  drill: {
    id: "drill",
    label: "Exam-style drill",
    parentId: "stretch",
    depth: 2,
    tag: "Assignment",
    assignment:
      "Do one multi-step exam question, then mark it immediately using the rubric.",
    reason: [
      "Closest match to the real assessment context.",
      "Improves mark conversion, not just topic familiarity.",
      "Best when the learner needs realistic rehearsal instead of more theory.",
    ],
    impact: { mastery: 11, clarity: 5, confidence: -2, speed: 8, readiness: 17 },
  },
};

const INITIAL_NODE_MAP = {
  start: DEFAULT_NODE_MAP.start,
};

const DEFAULT_POSITIONS = {
  start: { x: 50, y: 14 },
  review: { x: 30, y: 42 },
  stretch: { x: 70, y: 42 },
  flashcards: { x: 18, y: 74 },
  teach: { x: 42, y: 74 },
  quiz: { x: 60, y: 74 },
  drill: { x: 82, y: 74 },
};

const INITIAL_POSITIONS = {
  start: DEFAULT_POSITIONS.start,
};

const STARTER_MESSAGES = [
  {
    role: "assistant",
    content:
      "Hi! I'm your study buddy. Tell me what topic feels weak or what happened in your last revision session. I will suggest study plans for the first layer of the tree and ask for your approval before adding them.",
  },
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const STUDY_SESSION_GAP_MS = 90 * 60 * 1000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePosition(position, fallback) {
  return {
    x: clamp(position?.x ?? fallback.x, 10, 90),
    y: clamp(position?.y ?? fallback.y, 10, 90),
  };
}

function normalizeNode(nodeMap, node) {
  const fallback = nodeMap?.start ?? DEFAULT_NODE_MAP.start;
  const rawNode = node && typeof node === "object" ? node : fallback;

  return {
    ...fallback,
    ...rawNode,
    reason: Array.isArray(rawNode.reason) ? rawNode.reason : fallback.reason,
    whyThisFits:
      rawNode?.whyThisFits
      || (Array.isArray(rawNode.reason) && rawNode.reason.length ? rawNode.reason[0] : fallback.reason?.[0]),
    impact:
      rawNode.impact && typeof rawNode.impact === "object"
        ? rawNode.impact
        : fallback.impact,
  };
}

function getPathIds(nodeMap, targetId) {
  const path = new Set();
  let cursor = targetId;

  while (cursor && nodeMap?.[cursor]) {
    path.add(cursor);
    cursor = nodeMap[cursor].parentId;
  }

  return path;
}

function getNodeDepth(nodeMap, node) {
  if (Number.isFinite(node?.depth)) return node.depth;
  if (!node?.parentId || !nodeMap?.[node.parentId]) return 0;
  return getNodeDepth(nodeMap, nodeMap[node.parentId]) + 1;
}

function getSiblingIds(nodeMap, parentId) {
  return Object.values(nodeMap)
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => node.id);
}

function getAutoPosition(nodeMap, positionMap, node) {
  if (!node?.parentId) return DEFAULT_POSITIONS.start;

  const parentPosition =
    positionMap[node.parentId] ??
    DEFAULT_POSITIONS[node.parentId] ??
    DEFAULT_POSITIONS.start;
  const siblingIds = getSiblingIds(nodeMap, node.parentId);
  const siblingIndex = Math.max(0, siblingIds.indexOf(node.id));
  const siblingCount = Math.max(1, siblingIds.length);
  const spread =
    node.parentId === "start"
      ? Math.min(52, 28 + (siblingCount - 1) * 10)
      : Math.min(42, 20 + (siblingCount - 1) * 7);
  const step = siblingCount === 1 ? 0 : spread / (siblingCount - 1);
  const x =
    siblingCount === 1
      ? parentPosition.x
      : parentPosition.x - spread / 2 + step * siblingIndex;
  const depth = Math.max(1, getNodeDepth(nodeMap, node));
  const y = clamp(Math.max(parentPosition.y + 24, 14 + depth * 22), 14, 84);

  return { x, y };
}

function buildPositionMap(nodeMap, positions) {
  const resolvedPositions = {};
  const nodesByDepth = Object.values(nodeMap).sort((a, b) => {
    const depthDiff = getNodeDepth(nodeMap, a) - getNodeDepth(nodeMap, b);
    return depthDiff !== 0 ? depthDiff : a.id.localeCompare(b.id);
  });

  nodesByDepth.forEach((node) => {
    const fallback =
      DEFAULT_POSITIONS[node.id] ?? getAutoPosition(nodeMap, resolvedPositions, node);
    resolvedPositions[node.id] = normalizePosition(positions?.[node.id], fallback);
  });

  return resolvedPositions;
}

function collectNodeBranchIds(nodeMap, rootId) {
  const collected = new Set([rootId]);
  const queue = [rootId];

  while (queue.length) {
    const currentId = queue.shift();

    Object.values(nodeMap).forEach((node) => {
      if (node.parentId === currentId && !collected.has(node.id)) {
        collected.add(node.id);
        queue.push(node.id);
      }
    });
  }

  return [...collected];
}

function toDayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getMinutesFromEvent(event) {
  const fromTimeSpent = Number(event?.timeSpentSec);
  const fromTimeTaken = Number(event?.timeTakenSec);
  const seconds = Number.isFinite(fromTimeSpent) && fromTimeSpent > 0
    ? fromTimeSpent
    : (Number.isFinite(fromTimeTaken) && fromTimeTaken > 0 ? fromTimeTaken : 180);
  return seconds / 60;
}

function getExamDaysLeft(academicProfile, referenceTime = Date.now()) {
  const subjects = academicProfile?.subjects || [];
  const candidateDays = subjects
    .map((subject) => subject?.examDate)
    .filter(Boolean)
    .map((dateValue) => new Date(dateValue))
    .filter((dateValue) => Number.isFinite(dateValue.getTime()))
    .map((dateValue) => Math.ceil((dateValue.getTime() - referenceTime) / DAY_IN_MS))
    .filter((days) => days >= 0);

  if (!candidateDays.length) {
    return null;
  }

  return Math.min(...candidateDays);
}

function buildStudyRhythmInsights(user, referenceTime = Date.now()) {
  const events = Array.isArray(user?.learningEvents)
    ? user.learningEvents.filter((event) => Number.isFinite(event?.timestamp))
    : [];
  const learningFeatures = user?.learningRadar?.features || {};
  const todos = Array.isArray(user?.studyPlanTodos) ? user.studyPlanTodos : [];
  const uncompletedTodos = todos.filter((item) => !item.completed);
  const currentWindowDays = 14;
  const windowStart = referenceTime - (currentWindowDays - 1) * DAY_IN_MS;
  const recentEvents = events
    .filter((event) => event.timestamp >= windowStart && event.timestamp <= referenceTime)
    .sort((left, right) => left.timestamp - right.timestamp);
  const dayIndex = Array.from({ length: currentWindowDays }, (_, index) => {
    const timestamp = windowStart + index * DAY_IN_MS;
    return toDayKey(timestamp);
  });
  const dailyMinutesMap = dayIndex.reduce((result, dayKey) => {
    result[dayKey] = 0;
    return result;
  }, {});

  recentEvents.forEach((event) => {
    const dayKey = toDayKey(event.timestamp);
    if (dayKey in dailyMinutesMap) {
      dailyMinutesMap[dayKey] += getMinutesFromEvent(event);
    }
  });

  const dailyMinutes = dayIndex.map((dayKey) => dailyMinutesMap[dayKey] || 0);
  const activeDays = dailyMinutes.filter((minutes) => minutes > 0).length;
  const zeroDaysPct = currentWindowDays
    ? (currentWindowDays - activeDays) / currentWindowDays
    : 1;
  const avgDailyMinutes = currentWindowDays
    ? dailyMinutes.reduce((sum, value) => sum + value, 0) / currentWindowDays
    : 0;
  const maxDailyMinutes = Math.max(0, ...dailyMinutes);
  const variance = currentWindowDays
    ? dailyMinutes.reduce((sum, value) => sum + ((value - avgDailyMinutes) ** 2), 0) / currentWindowDays
    : 0;
  const stdDailyMinutes = Math.sqrt(variance);
  const topTwoSum = [...dailyMinutes].sort((left, right) => right - left).slice(0, 2).reduce((sum, value) => sum + value, 0);
  const totalMinutes = dailyMinutes.reduce((sum, value) => sum + value, 0);
  const topTwoShare = totalMinutes ? topTwoSum / totalMinutes : 0;
  const burstDays = dailyMinutes.filter((minutes) => minutes >= 90).length;
  const nowDayKey = toDayKey(referenceTime);
  const mostRecentEvent = events.slice().sort((left, right) => right.timestamp - left.timestamp)[0] || null;
  const daysSinceLastStudy = mostRecentEvent
    ? Math.max(0, Math.floor((new Date(nowDayKey).getTime() - new Date(toDayKey(mostRecentEvent.timestamp)).getTime()) / DAY_IN_MS))
    : 999;
  const activeDayTimes = [...new Set(events.map((event) => new Date(toDayKey(event.timestamp)).getTime()))].sort((left, right) => left - right);
  let longestInactiveGap = currentWindowDays;
  let inactiveGapsAbove3Days = 0;

  if (activeDayTimes.length >= 2) {
    longestInactiveGap = 0;
    for (let index = 1; index < activeDayTimes.length; index += 1) {
      const gapDays = Math.max(0, Math.round((activeDayTimes[index] - activeDayTimes[index - 1]) / DAY_IN_MS) - 1);
      longestInactiveGap = Math.max(longestInactiveGap, gapDays);
      if (gapDays > 3) {
        inactiveGapsAbove3Days += 1;
      }
    }
  } else if (activeDayTimes.length === 1) {
    longestInactiveGap = Math.max(0, daysSinceLastStudy);
    inactiveGapsAbove3Days = longestInactiveGap > 3 ? 1 : 0;
  }

  const sessions = [];
  recentEvents.forEach((event) => {
    const previous = sessions[sessions.length - 1];
    if (!previous || event.timestamp - previous.lastTimestamp > STUDY_SESSION_GAP_MS) {
      sessions.push({
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
      });
      return;
    }
    previous.lastTimestamp = event.timestamp;
  });

  const sessionSpacingHours = sessions.slice(1).map((session, index) => (
    (session.firstTimestamp - sessions[index].lastTimestamp) / (60 * 60 * 1000)
  ));
  const averageSessionSpacingHours = sessionSpacingHours.length
    ? sessionSpacingHours.reduce((sum, value) => sum + value, 0) / sessionSpacingHours.length
    : null;
  const nearestExamDays = getExamDaysLeft(user?.academicProfile, referenceTime);
  const recent3DayMinutes = dailyMinutes.slice(-3).reduce((sum, value) => sum + value, 0);
  const previous7DayMinutes = dailyMinutes.slice(0, -3).slice(-7).reduce((sum, value) => sum + value, 0);
  const accelerationRatio = previous7DayMinutes > 0
    ? (recent3DayMinutes / 3) / (previous7DayMinutes / 7)
    : (recent3DayMinutes > 0 ? 2 : 1);
  const weakTopicSet = Array.isArray(user?.weakTopicSet) ? user.weakTopicSet : [];
  const weakTopicTouchedAfterGap = weakTopicSet.length
    ? recentEvents.some((event) => weakTopicSet.includes(event.topicId))
    : true;

  const signals = {
    daysSinceLastStudy,
    longestInactiveGap,
    inactiveGapsAbove3Days,
    zeroDaysPct,
    stdDailyMinutes,
    maxToAvgDailyRatio: avgDailyMinutes > 0 ? maxDailyMinutes / avgDailyMinutes : 0,
    topTwoShare,
    burstDays,
    activeDays,
    averageSessionSpacingHours,
    nearestExamDays,
    accelerationRatio,
    weakTopicTouchedAfterGap,
    topicSwitchRate: Number(learningFeatures.topicSwitchRate) || 0,
    medianSessionDuration: Number(learningFeatures.medianSessionDuration) || 0,
    recentBurstRatio: Number(learningFeatures.recentBurstRatio) || 0,
  };

  const patternScores = {
    inactive: 0,
    bursty: 0,
    fragmented: 0,
    deadlineDriven: 0,
  };

  if (signals.daysSinceLastStudy >= 5) patternScores.inactive += 0.55;
  if (signals.zeroDaysPct >= 0.6) patternScores.inactive += 0.25;
  if (signals.longestInactiveGap >= 5) patternScores.inactive += 0.2;

  if (signals.topTwoShare >= 0.65) patternScores.bursty += 0.4;
  if (signals.maxToAvgDailyRatio >= 2.6) patternScores.bursty += 0.3;
  if (signals.burstDays >= 1) patternScores.bursty += 0.15;
  if (signals.stdDailyMinutes >= 30) patternScores.bursty += 0.15;

  if (signals.medianSessionDuration <= 16) patternScores.fragmented += 0.35;
  if (signals.topicSwitchRate >= 0.55) patternScores.fragmented += 0.35;
  if (signals.averageSessionSpacingHours !== null && signals.averageSessionSpacingHours <= 10) patternScores.fragmented += 0.2;
  if (signals.activeDays >= 6 && signals.maxToAvgDailyRatio <= 1.8) patternScores.fragmented += 0.1;

  if (signals.nearestExamDays !== null && signals.nearestExamDays <= 10) patternScores.deadlineDriven += 0.45;
  if (signals.accelerationRatio >= 1.7) patternScores.deadlineDriven += 0.3;
  if (signals.recentBurstRatio >= 0.45) patternScores.deadlineDriven += 0.15;
  if (!signals.weakTopicTouchedAfterGap) patternScores.deadlineDriven += 0.1;

  const rankedPatterns = Object.entries(patternScores)
    .sort((left, right) => right[1] - left[1]);
  const [topPatternKey, topPatternScore] = rankedPatterns[0];

  const defaultIntervention = {
    label: "Steady rhythm",
    reason: "Your recent pattern looks stable enough to keep regular progress.",
    message: "Keep your next sessions spaced, and finish one committed task fully before switching.",
    cta: "Continue with your top pending task.",
    recommendedTodos: uncompletedTodos.slice(0, 3),
  };

  if (!events.length || topPatternScore < 0.45) {
    return {
      patternKey: "steady",
      score: topPatternScore || 0,
      signals,
      intervention: defaultIntervention,
    };
  }

  if (topPatternKey === "inactive") {
    return {
      patternKey: "inactive",
      score: topPatternScore,
      signals,
      intervention: {
        label: "Inactive pattern",
        reason: `You had a ${signals.daysSinceLastStudy}-day gap since the last study session.`,
        message: "Restart small: do one short recap first, then return to the full plan.",
        cta: "Start with one 15-minute recap task.",
        recommendedTodos: uncompletedTodos.slice(0, 1),
        quickActions: [
          "15-minute recap on your weakest topic",
          "One low-pressure checkpoint question",
        ],
      },
    };
  }

  if (topPatternKey === "bursty") {
    return {
      patternKey: "bursty",
      score: topPatternScore,
      signals,
      intervention: {
        label: "Bursty pattern",
        reason: "Most effort is concentrated into a few heavy days, which can hurt retention.",
        message: "You’re making progress, but avoid cramming by spreading the next tasks across separate days.",
        cta: "Distribute your next 3 tasks instead of doing them in one block.",
        recommendedTodos: uncompletedTodos.slice(0, 3),
        quickActions: [
          "Do task 1 today, task 2 tomorrow, task 3 the day after",
          "Mix one weak-topic task into the next session",
        ],
      },
    };
  }

  if (topPatternKey === "fragmented") {
    return {
      patternKey: "fragmented",
      score: topPatternScore,
      signals,
      intervention: {
        label: "Fragmented pattern",
        reason: "Sessions are short with frequent topic switching.",
        message: "Increase depth by finishing one weak topic before switching.",
        cta: "Run one focused 35-minute block on a single topic.",
        recommendedTodos: uncompletedTodos.slice(0, 2),
        quickActions: [
          "Set a 35-minute focus block",
          "Delay topic switching until one task is marked complete",
        ],
      },
    };
  }

  return {
    patternKey: "deadlineDriven",
    score: topPatternScore,
    signals,
    intervention: {
      label: "Deadline-driven pattern",
      reason: signals.nearestExamDays !== null
        ? `${signals.nearestExamDays} day(s) left to the nearest exam, with late intensity spikes.`
        : "Effort is ramping up late and unevenly.",
      message: "Shift from perfection to triage: prioritize high-impact weak topics first.",
      cta: "Tackle uncovered weak areas before polishing strong topics.",
      recommendedTodos: uncompletedTodos.slice(0, 3),
      quickActions: [
        "Prioritize weak and high-weight topics first",
        "Use short timed drills instead of long theory blocks",
      ],
    },
  };
}

function PossibleWorldsMap({
  user,
  nodeMap,
  positions,
  selectedId,
  setPositions,
  setSelectedId,
  onResetTree,
  onCommitStudyPlan,
  onRemoveNodeBranch,
  committedNodeId,
  setCommittedNodeId,
}) {
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const sceneRef = useRef(null);
  const dragRef = useRef(null);
  const audioCtxRef = useRef(null);
  const hasGeneratedNodes = useMemo(
    () => Object.keys(nodeMap).some((id) => id !== "start"),
    [nodeMap]
  );

  const edges = useMemo(() => {
    const committedPathIds = (user?.studyPlanTodos || [])
      .map((item) => item.sourceNodeId)
      .filter((nodeId) => nodeMap[nodeId]);

    return committedPathIds.map((nodeId, index) => ({
      id: `${index === 0 ? "start" : committedPathIds[index - 1]}-${nodeId}`,
      from: index === 0 ? "start" : committedPathIds[index - 1],
      to: nodeId,
    }));
  }, [nodeMap, user?.studyPlanTodos]);

  const safePositions = useMemo(() => buildPositionMap(nodeMap, positions), [nodeMap, positions]);

  const nodes = useMemo(() => {
    return Object.values(nodeMap).map((node) => ({
      ...normalizeNode(nodeMap, node),
      position: safePositions[node.id] ?? DEFAULT_POSITIONS.start,
    }));
  }, [nodeMap, safePositions]);

  useEffect(() => {
    if (!hasGeneratedNodes) {
      if (selectedId !== null) {
        setSelectedId(null);
      }
      return;
    }

    if (!nodeMap[selectedId] || selectedId === "start") {
      const firstGeneratedId = Object.keys(nodeMap).find((id) => id !== "start") ?? null;
      setSelectedId(firstGeneratedId);
    }
  }, [hasGeneratedNodes, nodeMap, selectedId, setSelectedId]);

  useEffect(() => {
    const missingIds = Object.keys(safePositions).filter((id) => !positions?.[id]);
    if (!missingIds.length) return;

    setPositions((current) => {
      const next = { ...(current ?? {}) };
      let changed = false;

      missingIds.forEach((id) => {
        if (!next[id] && safePositions[id]) {
          next[id] = safePositions[id];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [positions, safePositions, setPositions]);

  const selectedNode = useMemo(() => {
    if (!hasGeneratedNodes) {
      return null;
    }

    const fallbackId =
      nodeMap[selectedId] && selectedId !== "start"
        ? selectedId
        : Object.keys(nodeMap).find((id) => id !== "start") ?? null;

    return fallbackId ? normalizeNode(nodeMap, nodeMap[fallbackId]) : null;
  }, [hasGeneratedNodes, nodeMap, selectedId]);

  const activePath = useMemo(
    () => (selectedNode ? getPathIds(nodeMap, selectedNode.id) : new Set()),
    [nodeMap, selectedNode]
  );
  const committedTodo = useMemo(
    () => user?.studyPlanTodos?.find((item) => item.sourceNodeId === selectedNode?.id) || null,
    [selectedNode?.id, user?.studyPlanTodos]
  );
  const committedNode = useMemo(
    () => (committedNodeId && nodeMap[committedNodeId] ? normalizeNode(nodeMap, nodeMap[committedNodeId]) : null),
    [committedNodeId, nodeMap]
  );

  function playTone() {
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextCtor();
      }

      const context = audioCtxRef.current;
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }

      const now = context.currentTime;

      [268, 402].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02 + index * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22 + index * 0.04);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + index * 0.03);
        oscillator.stop(now + 0.26 + index * 0.04);
      });
    } catch (error) {
      // Ignore audio errors in unsupported browsers.
    }
  }

  function selectNode(id) {
    if (!nodeMap[id]) return;
    setSelectedId(id);
    playTone();
  }

  async function handleCommitSelectedNode(event) {
    event.stopPropagation();
    if (!selectedNode) {
      return;
    }

    await onCommitStudyPlan(selectedNode);
    setCommittedNodeId(selectedNode.id);
  }

  useEffect(() => {
    function onMove(event) {
      if (!dragRef.current || !sceneRef.current) return;

      const dragState = dragRef.current;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragState.moved = true;
      }

      const rect = sceneRef.current.getBoundingClientRect();
      const nextX = clamp(((event.clientX - rect.left) / rect.width) * 100, 10, 90);
      const nextY = clamp(((event.clientY - rect.top) / rect.height) * 100, 10, 90);

      setPositions((current) => ({
        ...(current ?? {}),
        [dragState.id]: { x: nextX, y: nextY },
      }));
    }

    function onUp() {
      if (!dragRef.current) return;

      dragRef.current = null;
    }

    function resetDrag() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("blur", resetDrag);
    document.addEventListener("visibilitychange", resetDrag);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", resetDrag);
      document.removeEventListener("visibilitychange", resetDrag);
    };
  }, [setPositions]);

  return (
    <div className="todo-map-shell">
      <div className="todo-map-header">
        <div>
          <span className="todo-eyebrow">Interactive assignment map</span>
          <h2 className="todo-map-title">PATH</h2>
          {committedNode ? (
            <p className="todo-map-subtitle">
              Current committed path anchor: <strong>{committedNode.label}</strong>
            </p>
          ) : null}
        </div>
        <button type="button" className="secondary-button todo-reset-button" onClick={onResetTree}>
          Reset tree
        </button>
      </div>

      <div className="todo-map-board" ref={sceneRef}>
        {!hasGeneratedNodes ? (
          <div className="todo-map-empty">
            <span className="todo-eyebrow">Tree starts empty</span>
            <h3 className="todo-map-empty-title">No revision branches yet</h3>
            <p className="todo-map-empty-text">
              Ask the chatbot about a weak topic, confusing question, or what to
              do next. BitBuddies will create the first branch and explanation
              from that conversation.
            </p>
          </div>
        ) : (
          <>
            <svg
              viewBox="0 0 100 100"
              className="todo-map-branches"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {edges.map((edge) => {
                const from = safePositions[edge.from];
                const to = safePositions[edge.to];
                if (!from || !to) return null;

                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className="todo-map-edge todo-map-edge-active"
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const isSelected = node.id === selectedNode?.id;
              const isRoot = node.id === "start";
              const inPath = activePath.has(node.id) && !isRoot;

              return (
                <div
                  key={node.id}
                  className={`todo-world-node${isSelected ? " is-selected" : ""}${inPath ? " is-path" : ""}${isRoot ? " is-root" : ""}`}
                  style={{
                    left: `${node.position.x}%`,
                    top: `${node.position.y}%`,
                  }}
                  onPointerDown={(event) => {
                    selectNode(node.id);
                    if (isRoot) return;

                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    dragRef.current = {
                      id: node.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    };
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectNode(node.id);
                    }
                  }}
                >
                  {!isRoot ? (
                    <button
                      type="button"
                      className="todo-world-remove"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveNodeBranch(node.id);
                      }}
                    >
                      x
                    </button>
                  ) : null}
                  <span className="todo-world-node-tag">{node.tag}</span>
                  <strong className="todo-world-node-label">{node.label}</strong>
                </div>
              );
            })}

            {selectedNode ? (
              <div
                className={`todo-world-drawer${drawerExpanded ? " is-expanded" : ""}`}
                onClick={() => {
                  if (!drawerExpanded) {
                    setDrawerExpanded(true);
                  }
                }}
              >
                <div className="todo-world-drawer-header">
                  <div>
                    <span className="todo-eyebrow">Selected world</span>
                    <h3 className="todo-world-drawer-title">{selectedNode.label}</h3>
                  </div>
                  <button
                    type="button"
                    className="todo-world-toggle"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDrawerExpanded((current) => !current);
                    }}
                  >
                  {drawerExpanded ? "Minimize" : "Expand"}
                  </button>
                </div>

                <div className={`todo-world-drawer-body${drawerExpanded ? " is-expanded" : ""}`}>
                  <p className="todo-world-assignment">{selectedNode.assignment}</p>
                  <div className="todo-world-explain-panel">
                    <h4 className="todo-world-expanded-heading">Why BitBuddies suggested this</h4>
                    <p className="todo-world-explain-lead">{selectedNode.whyThisFits}</p>
                    <ul className="todo-world-expanded-list">
                      {selectedNode.reason.map((item) => (
                        <li key={item} className="todo-world-expanded-item">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    className="primary-button todo-commit-button"
                    onClick={handleCommitSelectedNode}
                  >
                    {committedNodeId === selectedNode.id
                      ? "Committed path anchor"
                      : committedTodo
                        ? "Set as committed path"
                        : "Commit this study plan"}
                  </button>

                  {drawerExpanded ? (
                    <div className="todo-world-expanded">
                      <div>
                        <h4 className="todo-world-expanded-heading">What changes</h4>
                        <p className="todo-world-expanded-text">
                          This path shifts the learner from the current baseline into a
                          new possible world with a stronger emphasis on{" "}
                          {selectedNode.depth >= 2
                            ? "a concrete assignment"
                            : "a direction choice"}
                          .
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="todo-world-hint">
                      Press this card to open the full explanation and radar details.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function StudentPrompt({
  user,
  setNodeMapState,
  setPositionsState,
  setSelectedIdState,
  setCommittedNodeIdState,
  messages,
  setMessages,
  pendingProposals,
  setPendingProposals,
  pendingSelectedProposalId,
  setPendingSelectedProposalId,
  committedNodeId,
  nodeMap,
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hoveredProposalId, setHoveredProposalId] = useState(null);
  const bottomRef = useRef(null);

  const activeProposal = useMemo(
    () => pendingProposals.find((proposal) => proposal.id === hoveredProposalId)
      || pendingProposals.find((proposal) => proposal.id === pendingSelectedProposalId)
      || pendingProposals[0]
      || null,
    [hoveredProposalId, pendingProposals, pendingSelectedProposalId]
  );
  const committedParentLabel = committedNodeId && nodeMap?.[committedNodeId]
    ? nodeMap[committedNodeId].label
    : "Start point";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!pendingProposals.length) {
      setHoveredProposalId(null);
      return;
    }

    if (!pendingProposals.some((proposal) => proposal.id === hoveredProposalId)) {
      setHoveredProposalId(pendingSelectedProposalId || pendingProposals[0].id);
    }
  }, [hoveredProposalId, pendingProposals, pendingSelectedProposalId]);

  function isIntermediateProposalMessage(message) {
    if (!message || typeof message.content !== "string") {
      return false;
    }

    const content = message.content.trim();

    if (message.role === "user" && /^\d+$/.test(content)) {
      return true;
    }

    if (
      message.role === "assistant"
      && content.includes("Should I add this plan to the tree path now?")
    ) {
      return true;
    }

    return false;
  }

  const visibleMessages = useMemo(
    () => messages.filter((message) => !isIntermediateProposalMessage(message)),
    [messages]
  );

  async function sendText(rawText, options = {}) {
    const {
      hideUserMessage = false,
      hideAssistantMessage = false,
    } = options;
    const text = rawText.trim();
    if (!text || loading) return;

    const userMessage = { role: "user", content: text };
    const nextMessages = hideUserMessage ? [...messages] : [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:3001/api/tree-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          message: text,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error("Chat request failed");

      if (data.newTreeState) {
        if (data.newTreeState.nodeMap) {
          setNodeMapState(data.newTreeState.nodeMap);
        }
        if (data.newTreeState.positions) {
          setPositionsState(data.newTreeState.positions);
        }
        setSelectedIdState(data.newTreeState.selectedId ?? null);
        setCommittedNodeIdState(data.newTreeState.committedNodeId ?? null);
        setPendingProposals(data.newTreeState.pendingProposals ?? []);
        setPendingSelectedProposalId(data.newTreeState.pendingSelectedProposalId ?? null);
      }

      if (hideAssistantMessage) {
        setMessages(nextMessages);
      } else {
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.replyText,
          },
        ]);
      }
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            "I couldn't reach the chat server. Make sure `node server.js` is running and check Terminal logs.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    return sendText(input);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="todo-chat-shell">
      <div className="todo-chat-header">
        <span className="todo-eyebrow">Guided User Intelligence for Dynamic Education</span>
        <h2 className="todo-chat-title">GUIDE</h2>
        <p className="todo-chat-subtitle">
          Ask a question, describe what is confusing, or say how your last
          session went.
        </p>
      </div>

      <div className="todo-chat-feed">
        {visibleMessages.map((message, index) => (
          <div
            key={index}
            className={`todo-chat-bubble${message.role === "user" ? " is-user" : " is-bot"}`}
          >
            {message.role === "assistant" && <span className="todo-chat-avatar">B</span>}
            <p className="todo-chat-bubble-text">{message.content}</p>
          </div>
        ))}

        {loading && (
          <div className="todo-chat-bubble is-bot">
            <span className="todo-chat-avatar">B</span>
            <p className="todo-chat-bubble-text todo-chat-typing">
              <span className="todo-chat-dot" />
              <span className="todo-chat-dot" style={{ animationDelay: "0.18s" }} />
              <span className="todo-chat-dot" style={{ animationDelay: "0.36s" }} />
            </p>
          </div>
        )}

        {pendingProposals.length ? (
          <div className="todo-chat-proposals">
            <p className="todo-chat-proposals-title">Suggested study plans</p>
            <div className="todo-chat-proposals-layout">
              <div className="todo-chat-proposal-list">
                {pendingProposals.map((proposal, index) => {
                  const isSelected = proposal.id === pendingSelectedProposalId;

                  return (
                    <button
                      key={proposal.id}
                      type="button"
                      className={`todo-chat-proposal-card${isSelected ? " is-selected" : ""}`}
                      onClick={() => sendText(String(index + 1), {
                        hideUserMessage: true,
                        hideAssistantMessage: true,
                      })}
                      onMouseEnter={() => setHoveredProposalId(proposal.id)}
                      onFocus={() => setHoveredProposalId(proposal.id)}
                      disabled={loading}
                    >
                      <span className="todo-chat-proposal-index">{index + 1}</span>
                      <div className="todo-chat-proposal-copy">
                        <strong>{proposal.label}</strong>
                        <span>{proposal.assignment}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeProposal ? (
                <div className="todo-chat-proposal-preview">
                  <p className="todo-chat-proposal-preview-kicker">
                    Builds under: {committedParentLabel}
                  </p>
                  <h3>{activeProposal.label}</h3>
                  <p className="todo-chat-proposal-preview-lead">{activeProposal.whyThisFits}</p>
                  <ul className="todo-world-expanded-list">
                    {activeProposal.reason.map((item) => (
                      <li key={item} className="todo-world-expanded-item">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="todo-chat-proposal-actions">
              <button
                type="button"
                className="todo-chat-action-button"
                onClick={() => sendText("yes")}
                disabled={loading || !pendingSelectedProposalId}
              >
                Add selected
              </button>
              <button
                type="button"
                className="todo-chat-action-button is-secondary"
                onClick={() => sendText("no")}
                disabled={loading}
              >
                Reject
              </button>
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="todo-chat-input-row">
        <textarea
          rows={1}
          className="todo-chat-textarea"
          placeholder="Type your question..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          type="button"
          className="todo-chat-send"
          style={{ opacity: input.trim() ? 1 : 0.4 }}
          onClick={handleSend}
          disabled={!input.trim() || loading}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default function ToDoPage({
  user,
  chatSessionId,
  onBackHome,
  onOpenPractice,
  onOpenJudge,
  onOpenPersonas,
  onSignOut,
  onCommitStudyPlan,
  onRemoveStudyPlanNodes,
}) {
  const [nodeMapState, setNodeMapState] = useState(INITIAL_NODE_MAP);
  const [positionsState, setPositionsState] = useState(INITIAL_POSITIONS);
  const [selectedIdState, setSelectedIdState] = useState(null);
  const [pendingProposalsState, setPendingProposalsState] = useState([]);
  const [pendingSelectedProposalIdState, setPendingSelectedProposalIdState] = useState(null);
  const [committedNodeIdState, setCommittedNodeIdState] = useState(null);
  const [messagesState, setMessagesState] = useState(STARTER_MESSAGES);
  const [treeReady, setTreeReady] = useState(false);
  const adaptiveInsights = useMemo(() => buildStudyRhythmInsights(user), [user]);
  const uncompletedTodos = useMemo(
    () => (Array.isArray(user?.studyPlanTodos) ? user.studyPlanTodos.filter((item) => !item.completed) : []),
    [user?.studyPlanTodos],
  );
  const orderedTodos = useMemo(() => {
    const recommendedIds = new Set((adaptiveInsights.intervention.recommendedTodos || []).map((item) => item.id));
    const prioritized = uncompletedTodos.filter((item) => recommendedIds.has(item.id));
    const remaining = uncompletedTodos.filter((item) => !recommendedIds.has(item.id));
    return [...prioritized, ...remaining];
  }, [adaptiveInsights.intervention.recommendedTodos, uncompletedTodos]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    async function loadTree() {
      if (!user?.uid || !chatSessionId) return;

      const docRef = doc(db, "userTrees", user.uid);
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        const data = snapshot.data();
        const shouldResetChat = data.lastChatSessionId !== chatSessionId;

        if (data.nodeMap) setNodeMapState(data.nodeMap);
        if (data.positions) setPositionsState(data.positions);
        setSelectedIdState(data.selectedId ?? null);
        setPendingProposalsState(shouldResetChat ? [] : (data.pendingProposals ?? []));
        setPendingSelectedProposalIdState(shouldResetChat ? null : (data.pendingSelectedProposalId ?? null));
        setCommittedNodeIdState(data.committedNodeId ?? null);
        setMessagesState(shouldResetChat ? STARTER_MESSAGES : (data.messages ?? STARTER_MESSAGES));

        if (shouldResetChat) {
          await setDoc(docRef, {
            ...data,
            messages: STARTER_MESSAGES,
            pendingProposals: [],
            pendingSelectedProposalId: null,
            lastChatSessionId: chatSessionId,
            updatedAt: Date.now(),
          });
        }

        setTreeReady(true);
        return;
      }

      await setDoc(docRef, {
        nodeMap: INITIAL_NODE_MAP,
        positions: INITIAL_POSITIONS,
        selectedId: null,
        committedNodeId: null,
        messages: STARTER_MESSAGES,
        pendingProposals: [],
        pendingSelectedProposalId: null,
        lastChatSessionId: chatSessionId,
        updatedAt: Date.now(),
      });
      setTreeReady(true);
    }

    loadTree();
  }, [chatSessionId, user?.uid]);

  useEffect(() => {
    async function saveTree() {
      if (!user?.uid || !treeReady) return;

      const docRef = doc(db, "userTrees", user.uid);

      await setDoc(docRef, {
        nodeMap: nodeMapState,
        positions: positionsState,
        selectedId: selectedIdState,
        committedNodeId: committedNodeIdState,
        messages: messagesState,
        pendingProposals: pendingProposalsState,
        pendingSelectedProposalId: pendingSelectedProposalIdState,
        lastChatSessionId: chatSessionId,
        updatedAt: Date.now(),
      });
    }

    saveTree();
  }, [
    nodeMapState,
    positionsState,
    selectedIdState,
    committedNodeIdState,
    messagesState,
    pendingProposalsState,
    pendingSelectedProposalIdState,
    chatSessionId,
    treeReady,
    user?.uid,
  ]);

  async function handleResetTree() {
    if (!user?.uid) {
      return;
    }

    const docRef = doc(db, "userTrees", user.uid);
    const nextState = {
      nodeMap: INITIAL_NODE_MAP,
      positions: INITIAL_POSITIONS,
      selectedId: null,
      committedNodeId: null,
      messages: STARTER_MESSAGES,
      pendingProposals: [],
      pendingSelectedProposalId: null,
      lastChatSessionId: chatSessionId,
      updatedAt: Date.now(),
    };
    const committedNodeIds = (user?.studyPlanTodos || [])
      .map((item) => item.sourceNodeId)
      .filter(Boolean);

    await setDoc(docRef, nextState);
    if (committedNodeIds.length) {
      await onRemoveStudyPlanNodes(committedNodeIds);
    }
    setNodeMapState(INITIAL_NODE_MAP);
    setPositionsState(INITIAL_POSITIONS);
    setSelectedIdState(null);
    setCommittedNodeIdState(null);
    setMessagesState(STARTER_MESSAGES);
    setPendingProposalsState([]);
    setPendingSelectedProposalIdState(null);
  }

  async function handleRemoveNodeBranch(nodeId) {
    if (!nodeMapState[nodeId]) {
      return;
    }

    const removedIds = collectNodeBranchIds(nodeMapState, nodeId);
    const removedSet = new Set(removedIds);
    const nextNodeMap = Object.fromEntries(
      Object.entries(nodeMapState).filter(([id]) => !removedSet.has(id))
    );
    const nextPositions = Object.fromEntries(
      Object.entries(positionsState).filter(([id]) => !removedSet.has(id))
    );
    const parentId = nodeMapState[nodeId]?.parentId;
    const fallbackCommittedId = parentId && parentId !== "start" && !removedSet.has(parentId) ? parentId : null;

    setNodeMapState(nextNodeMap);
    setPositionsState(nextPositions);
    setSelectedIdState((current) => (removedSet.has(current) ? fallbackCommittedId : current));
    setCommittedNodeIdState((current) => (removedSet.has(current) ? fallbackCommittedId : current));
    setPendingProposalsState([]);
    setPendingSelectedProposalIdState(null);

    await onRemoveStudyPlanNodes(removedIds);
  }

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenPractice={onOpenPractice}
        onOpenToDo={() => {}}
        onOpenJudge={onOpenJudge}
        onOpenPersonas={onOpenPersonas}
        onGoHome={onBackHome}
        onSignOut={onSignOut}
        activePage="todo"
      />

      <section className="hero-card todo-hero-card">
        <div className="hero-copy todo-hero-copy">
          <p className="eyebrow">Personalised Adaptive Task Hierachy</p>
          <h1>
            <span className="todo-hero-title-line">Your recommended revision tasks</span>
            <span className="todo-hero-title-line">are organized here</span>
          </h1>
        </div>
      </section>

      <section className="student-card">
        <div className={`todo-adaptive-card is-${adaptiveInsights.patternKey}`}>
          <div className="todo-adaptive-header">
            <span className="todo-badge">{adaptiveInsights.intervention.label}</span>
            <strong className="todo-adaptive-cta">{adaptiveInsights.intervention.cta}</strong>
          </div>
          <p className="todo-adaptive-reason">{adaptiveInsights.intervention.reason}</p>
          <p className="todo-adaptive-message">{adaptiveInsights.intervention.message}</p>

          {adaptiveInsights.intervention.quickActions?.length ? (
            <ul className="todo-adaptive-list">
              {adaptiveInsights.intervention.quickActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : null}

          {orderedTodos.length ? (
            <div className="todo-adaptive-task-list">
              {orderedTodos.slice(0, 3).map((item, index) => (
                <div key={item.id} className="todo-adaptive-task">
                  <span>{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.details}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="todo-feedback">
              No committed PATH task yet. Commit one node below and it will appear here as the next adaptive action.
            </div>
          )}
        </div>

        <PossibleWorldsMap
          user={user}
          nodeMap={nodeMapState}
          positions={positionsState}
          selectedId={selectedIdState}
          setPositions={setPositionsState}
          setSelectedId={setSelectedIdState}
          onResetTree={handleResetTree}
          onCommitStudyPlan={onCommitStudyPlan}
          onRemoveNodeBranch={handleRemoveNodeBranch}
          committedNodeId={committedNodeIdState}
          setCommittedNodeId={setCommittedNodeIdState}
        />

        <StudentPrompt
          user={user}
          setNodeMapState={setNodeMapState}
          setPositionsState={setPositionsState}
          setSelectedIdState={setSelectedIdState}
          setCommittedNodeIdState={setCommittedNodeIdState}
          messages={messagesState}
          setMessages={setMessagesState}
          pendingProposals={pendingProposalsState}
          setPendingProposals={setPendingProposalsState}
          pendingSelectedProposalId={pendingSelectedProposalIdState}
          setPendingSelectedProposalId={setPendingSelectedProposalIdState}
          committedNodeId={committedNodeIdState}
          nodeMap={nodeMapState}
        />

        <button
          className="primary-button todo-back-button"
          type="button"
          onClick={onBackHome}
        >
          Return to homepage
        </button>
      </section>
    </main>
  );
}
