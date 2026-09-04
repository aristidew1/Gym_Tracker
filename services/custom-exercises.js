// User-defined exercises, kept separate from the built-in catalogue so it
// never needs editing by hand. Consumed by data/exercises.js to make custom
// exercises behave like built-in ones everywhere (stats, programs, history).

const CUSTOM_EXERCISES_KEY = 'muscu_custom_exercises';

function generateId() {
  return `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function emitChange() {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('customExercises:changed'));
  }
}

function readStoredExercises() {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOM_EXERCISES_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((exercise) => (
      exercise && typeof exercise.id === 'string' && typeof exercise.name === 'string' && typeof exercise.muscleCategory === 'string'
    ));
  } catch {
    return [];
  }
}

function writeStoredExercises(exercises) {
  localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(exercises));
}

export function getCustomExercises() {
  return readStoredExercises().map((exercise) => ({ ...exercise, custom: true }));
}

export function getCustomExerciseById(id) {
  return getCustomExercises().find((exercise) => exercise.id === id) || null;
}

export function createCustomExercise({ name, muscleCategory }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName || !muscleCategory) return null;
  const exercise = { id: generateId(), name: trimmedName, muscleCategory };
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
  const index = exercises.findIndex((exercise) => exercise.id === id);
  if (index === -1) return false;
  exercises[index] = { ...exercises[index], name: trimmedName, muscleCategory };
  writeStoredExercises(exercises);
  emitChange();
  return true;
}

export function deleteCustomExercise(id) {
  const exercises = readStoredExercises();
  const next = exercises.filter((exercise) => exercise.id !== id);
  if (next.length === exercises.length) return false;
  writeStoredExercises(next);
  emitChange();
  return true;
}
