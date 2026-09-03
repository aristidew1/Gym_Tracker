import { getProgressionRule } from '../data/progression-rules.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getLastCompletedSets(workoutHistory) {
  const lastEntry = [...(workoutHistory || [])]
    .reverse()
    .find((entry) => Array.isArray(entry.sets) && entry.sets.length > 0);
  return lastEntry?.sets.filter((set) => set.completed !== false) || [];
}

export function getNextPrescription({ prescription, progressionRule, workoutHistory = [] }) {
  const next = clone(prescription);
  const rule = typeof progressionRule === 'string'
    ? getProgressionRule(progressionRule)
    : progressionRule;

  if (!rule || rule.type !== 'double_progression') {
    return { prescription: next, changed: false, reason: 'Aucune règle de progression applicable.' };
  }

  const completedSets = getLastCompletedSets(workoutHistory);
  const range = next.repetitionRange;
  const reachedTopOfRange = completedSets.length >= next.setCount
    && completedSets.every((set) => Number(set.reps) >= range.max);

  if (!reachedTopOfRange) {
    return {
      prescription: next,
      changed: false,
      reason: `Conserver la charge jusqu'à ${next.setCount} séries de ${range.max} reps.`,
    };
  }

  const loadIncrement = Number(rule.config?.loadIncrement) || 2.5;
  return {
    prescription: { ...next, suggestedLoadIncrement: loadIncrement },
    changed: true,
    reason: `Objectif atteint : augmenter de ${loadIncrement} kg à la prochaine séance.`,
  };
}

// How close the exercise's last logged workout is to unlocking a load
// increase under double progression. Returns null when the rule doesn't
// apply, when nothing was logged yet, or when more than one set is still
// short of the top of the rep range.
export function getProgressionProximity({ prescription, progressionRule, workoutHistory = [] }) {
  const rule = typeof progressionRule === 'string'
    ? getProgressionRule(progressionRule)
    : progressionRule;
  if (!rule || rule.type !== 'double_progression') return null;

  const completedSets = getLastCompletedSets(workoutHistory);
  if (completedSets.length === 0) return null;

  const repMax = prescription.repetitionRange.max;
  const setCount = prescription.setCount;
  const setsAtMax = completedSets.filter((set) => Number(set.reps) >= repMax).length;
  const missingSets = Math.max(0, setCount - setsAtMax);
  if (missingSets > 1) return null;

  return { ready: missingSets === 0, setsAtMax, setCount, repMax };
}
