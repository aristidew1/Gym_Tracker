// User-defined exercises, kept separate from the built-in catalogue so it
// never needs editing by hand. Consumed by data/exercises.js to make custom
// exercises behave like built-in ones everywhere (stats, programs, history).

import { nowIso } from './entity-meta.js';

const CUSTOM_EXERCISES_KEY = 'muscu_custom_exercises';

function generateId() {
  return `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function emitChange() {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('customExercises:changed'));
  }
}

// Soft-delete + updatedAt were retrofitted for sync (M3) after this store
// already shipped without them — an entry saved before that has neither, so
// backfill both once here (persisting the backfill) rather than on every read.
function backfillMeta(exercises) {
  let changed = false;
  const backfilled = exercises.map((exercise) => {
    if (exercise.updatedAt && exercise.deletedAt !== undefined) return exercise;
    changed = true;
    return { ...exercise, updatedAt: exercise.updatedAt || nowIso(), deletedAt: exercise.deletedAt ?? null };
  });
  return { exercises: backfilled, changed };
}

function readStoredExercises() {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOM_EXERCISES_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    const validRaw = value.filter((exercise) => (
      exercise && typeof exercise.id === 'string' && typeof exercise.name === 'string' && typeof exercise.muscleCategory === 'string'
    ));
    const { exercises, changed } = backfillMeta(validRaw);
    if (changed || validRaw.length !== value.length) writeStoredExercises(exercises);
    return exercises;
  } catch {
    return [];
  }
}

function writeStoredExercises(exercises) {
  localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(exercises));
}

export function getCustomExercises() {
  return readStoredExercises().filter((exercise) => !exercise.deletedAt).map((exercise) => ({ ...exercise, custom: true }));
}

// Unfiltered accessor (tombstones included) for the sync layer only.
export function getAllCustomExercisesRaw() {
  return readStoredExercises();
}

// Sync layer only: writes back a merged raw array (pushed/pulled).
export function replaceAllCustomExercisesRaw(records) {
  if (!Array.isArray(records)) return;
  const valid = records.filter((exercise) => (
    exercise && typeof exercise.id === 'string' && typeof exercise.name === 'string'
    && typeof exercise.updatedAt === 'string'
  ));
  writeStoredExercises(valid);
  emitChange();
}

export function getCustomExerciseById(id) {
  return getCustomExercises().find((exercise) => exercise.id === id) || null;
}

export function createCustomExercise({ name, muscleCategory }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName || !muscleCategory) return null;
  const exercise = { id: generateId(), name: trimmedName, muscleCategory, updatedAt: nowIso(), deletedAt: null };
  const exercises = readStoredExercises();
  exercises.push(exercise);
  writeStoredExercises(exercises);
  emitChange();
  return { ...exercise, custom: true };
}

export function updateCustomExercise(id, { name, muscleCategory }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName || !muscleCategory) return false;
  const exercises = readStoredExercises();
  const index = exercises.findIndex((exercise) => exercise.id === id && !exercise.deletedAt);
  if (index === -1) return false;
  exercises[index] = { ...exercises[index], name: trimmedName, muscleCategory, updatedAt: nowIso() };
  writeStoredExercises(exercises);
  emitChange();
  return true;
}

// Soft delete: the record stays in storage as a tombstone (deletedAt set) so
// the deletion itself can be synced to other devices — see
// getCustomExercises() (filters tombstones out) vs.
// getAllCustomExercisesRaw() (includes them).
export function deleteCustomExercise(id) {
  const exercises = readStoredExercises();
  const index = exercises.findIndex((exercise) => exercise.id === id && !exercise.deletedAt);
  if (index === -1) return false;
  const timestamp = nowIso();
  exercises[index] = { ...exercises[index], deletedAt: timestamp, updatedAt: timestamp };
  writeStoredExercises(exercises);
  emitChange();
  return true;
}
