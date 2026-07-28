// localStorage persistence with schema migration at the boundary.

import { DEFAULT_PROGRAM } from './data/default-program.js';
import { getExerciseDisplayName } from './data/exercises.js';
import {
  createWorkoutRecord,
  getWorkoutSessionId,
  migrateWorkouts,
  validateProgram,
  validateWorkout,
} from './models/workout-schema.js';
import {
  getActiveProgramId,
  appendPrograms,
  getCustomPrograms,
  getPrograms,
  restorePrograms,
} from './services/program-storage.js';

const STORAGE_KEY = 'muscu_workouts';
const EXPORT_FORMAT = 'muscu-tracker-backup';
const EXPORT_VERSION = 2;
const PROGRAM_EXPORT_FORMAT = 'muscu-tracker-programs';
const PROGRAM_EXPORT_VERSION = 1;

function generateId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

function readStoredWorkouts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('Historique Muscu Tracker invalide : tableau attendu. Les données ont été conservées.');
      return [];
    }
    const { workouts, changed } = migrateWorkouts(parsed);
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
    return workouts;
  } catch (error) {
    console.warn('Impossible de lire l’historique Muscu Tracker. Les données n’ont pas été modifiées.', error);
    return [];
  }
}

export function getWorkouts() {
  return readStoredWorkouts();
}

export function saveWorkout(workout) {
  const record = createWorkoutRecord(workout, generateId());
  const errors = validateWorkout(record);
  if (errors.length > 0) throw new Error(`Séance invalide : ${errors.join(' ')}`);
  const workouts = getWorkouts();
  workouts.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
  return record;
}

export function deleteWorkout(id) {
  const workouts = getWorkouts().filter((workout) => workout.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
}

export function getLastWorkout(sessionId, programId = null) {
  const workouts = getWorkouts()
    .filter((workout) => getWorkoutSessionId(workout) === sessionId)
    .filter((workout) => !programId || workout.programId === programId)
    .sort((a, b) => new Date(b.savedAt || b.date) - new Date(a.savedAt || a.date));
  return workouts[0] || null;
}

export function getWorkoutsByMonth(year, month) {
  return getWorkouts().filter((workout) => {
    const date = new Date(workout.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

export function getWorkoutsByDate(date) {
  return getWorkouts().filter((workout) => workout.date === date);
}

export function getExerciseHistory(exerciseId) {
  const history = [];
  getWorkouts()
    .sort((a, b) => new Date(a.savedAt || a.date) - new Date(b.savedAt || b.date))
    .forEach((workout) => {
      (workout.exercises || []).forEach((exercise) => {
        if (exercise.exerciseId === exerciseId) {
          history.push({
            date: workout.date,
            sessionId: getWorkoutSessionId(workout),
            sets: exercise.sets || [],
            selectionId: exercise.selectionId || null,
          });
        }
      });
    });
  return history;
}

export function getTrackedExercises() {
  const exercises = new Map();
  getWorkouts().forEach((workout) => {
    (workout.exercises || []).forEach((exercise) => {
      if (!exercise.exerciseId) return;
      exercises.set(exercise.exerciseId, {
        id: exercise.exerciseId,
        name: exercise.exerciseName || getExerciseDisplayName(exercise.exerciseId),
      });
    });
  });
  return [...exercises.values()];
}

export function getNextSession(program = DEFAULT_PROGRAM) {
  const order = program.sessionOrder || [];
  if (order.length === 0) return null;
  const workouts = getWorkouts()
    .filter((workout) => !workout.programId || workout.programId === program.id)
    .sort((a, b) => new Date(b.savedAt || b.date) - new Date(a.savedAt || a.date));
  if (workouts.length === 0) return order[0];

  const lastIndex = order.indexOf(getWorkoutSessionId(workouts[0]));
  return lastIndex === -1 ? order[0] : order[(lastIndex + 1) % order.length];
}

export function getLastExerciseData(programExerciseId, sessionId, programId = null) {
  const lastWorkout = getLastWorkout(sessionId, programId);
  if (!lastWorkout) return null;
  return (lastWorkout.exercises || []).find((exercise) => exercise.programExerciseId === programExerciseId) || null;
}

// Unlike a program item id, an exercise id is stable across programs and
// sessions. Use it to carry a user's last performance into a new routine.
export function getLastExerciseDataByExerciseId(exerciseId) {
  const workouts = getWorkouts()
    .sort((a, b) => new Date(b.savedAt || b.date) - new Date(a.savedAt || a.date));

  for (const workout of workouts) {
    const exercise = (workout.exercises || []).find((item) => item.exerciseId === exerciseId);
    if (exercise) return exercise;
  }
  return null;
}

export function getStats() {
  const workouts = getWorkouts();
  if (workouts.length === 0) return { totalWorkouts: 0, streak: 0, thisMonth: 0 };

  const now = new Date();
  const thisMonth = workouts.filter((workout) => {
    const date = new Date(workout.date);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
  const sortedDates = [...new Set(workouts.map((workout) => workout.date))]
    .sort((a, b) => new Date(b) - new Date(a));
  const daysSinceLast = Math.floor((Date.now() - new Date(sortedDates[0]).getTime()) / 86400000);
  let streak = 0;
  if (daysSinceLast <= 2) {
    streak = 1;
    for (let index = 1; index < sortedDates.length; index += 1) {
      const gap = Math.floor((new Date(sortedDates[index - 1]) - new Date(sortedDates[index])) / 86400000);
      if (gap > 3) break;
      streak += 1;
    }
  }
  return { totalWorkouts: workouts.length, streak, thisMonth };
}

export function exportData() {
  const programs = getPrograms().map(({ builtIn, ...program }) => program);
  return JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    workouts: getWorkouts(),
    programs,
    activeProgramId: getActiveProgramId(),
  }, null, 2);
}

// Program-only backups deliberately omit workout history. This makes it safe
// to share or move routines without carrying over completed-session data.
export function exportProgramsData() {
  const programs = getPrograms().map(({ builtIn, ...program }) => program);
  return JSON.stringify({
    format: PROGRAM_EXPORT_FORMAT,
    version: PROGRAM_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    programs,
    activeProgramId: getActiveProgramId(),
  }, null, 2);
}

function parseImportData(jsonString) {
  try {
    const raw = JSON.parse(jsonString);
    // Exports created before backup v2 were simply an array of workouts.
    const isLegacyExport = Array.isArray(raw);
    const workoutsInput = isLegacyExport ? raw : raw?.workouts;
    if (!Array.isArray(workoutsInput)) return null;
    if (!isLegacyExport && raw.format !== EXPORT_FORMAT) return null;
    if (!isLegacyExport && (!Array.isArray(raw.programs) || typeof raw.activeProgramId !== 'string')) return null;

    const { workouts } = migrateWorkouts(workoutsInput);
    if (workouts.some((workout) => validateWorkout(workout).length > 0)) return null;

    const programs = isLegacyExport ? null : raw.programs;
    if (programs && (
      programs.some((program) => !program || validateProgram(program).length > 0)
      || new Set(programs.map((program) => program.id)).size !== programs.length
      || !programs.some((program) => program.id === raw.activeProgramId)
    )) return null;

    return {
      workouts,
      programs: programs || null,
      activeProgramId: isLegacyExport ? null : raw.activeProgramId,
    };
  } catch {
    return null;
  }
}

function parseProgramsImportData(jsonString) {
  try {
    const raw = JSON.parse(jsonString);
    if (
      raw?.format !== PROGRAM_EXPORT_FORMAT
      || !Array.isArray(raw.programs)
      || typeof raw.activeProgramId !== 'string'
    ) return null;

    if (
      raw.programs.some((program) => !program || validateProgram(program).length > 0)
      || new Set(raw.programs.map((program) => program.id)).size !== raw.programs.length
      || !raw.programs.some((program) => program.id === raw.activeProgramId)
    ) return null;

    return { programs: raw.programs, activeProgramId: raw.activeProgramId };
  } catch {
    return null;
  }
}

export function getExportSummary() {
  return {
    workouts: getWorkouts().length,
    programs: getCustomPrograms().length,
  };
}

export function getProgramsExportSummary() {
  return { programs: getPrograms().length };
}

export function getImportSummary(jsonString) {
  const data = parseImportData(jsonString);
  if (!data) return null;
  return { workouts: data.workouts.length, programs: data.programs?.length || 0 };
}

export function getProgramsImportSummary(jsonString) {
  const data = parseProgramsImportData(jsonString);
  return data ? { programs: data.programs.length } : null;
}

export function importData(jsonString) {
  const data = parseImportData(jsonString);
  if (!data) return false;
  if (data.programs && !restorePrograms(data.programs, data.activeProgramId)) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data.workouts));
  return true;
}

export function importProgramsData(jsonString) {
  const data = parseProgramsImportData(jsonString);
  if (!data) return false;
  return appendPrograms(data.programs);
}
