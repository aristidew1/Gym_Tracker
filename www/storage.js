// localStorage persistence with schema migration at the boundary.

import { DEFAULT_PROGRAM } from './data/default-program.js';
import { getExerciseDisplayName } from './data/exercises.js';
import {
  createWorkoutRecord,
  getWorkoutSessionId,
  migratePrograms,
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
import { getSupplementsBackup, restoreSupplementsBackup } from './supplements.js';
import { localDateToDayNumber, parseLocalDate } from './services/date-utils.js';
import { getProgressionProximity } from './services/progression-engine.js';

const STORAGE_KEY = 'muscu_workouts';
const ACTIVE_WORKOUT_KEY = 'muscu_active_workout';
const EXPORT_FORMAT = 'muscu-tracker-backup';
const EXPORT_VERSION = 3;
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

// Kept separately from history: an interrupted session is not a completed workout.
export function saveActiveWorkoutDraft(draft) {
  try {
    if (!draft || typeof draft !== 'object') return;
    localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch (error) {
    console.warn('Impossible de sauvegarder la séance en cours.', error);
  }
}

export function getActiveWorkoutDraft() {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKOUT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft?.workoutSession && draft?.activeSessionId ? draft : null;
  } catch (error) {
    console.warn('Impossible de restaurer la séance en cours.', error);
    return null;
  }
}

export function clearActiveWorkoutDraft() {
  localStorage.removeItem(ACTIVE_WORKOUT_KEY);
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

export function updateWorkout(id, workout) {
  const workouts = getWorkouts();
  const index = workouts.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const previous = workouts[index];
  const record = createWorkoutRecord({
    ...previous,
    ...workout,
    id,
    date: workout.date || previous.date,
    updatedAt: new Date().toISOString(),
  }, id, previous.savedAt);
  const errors = validateWorkout(record);
  if (errors.length > 0) throw new Error(`Séance invalide : ${errors.join(' ')}`);
  workouts[index] = record;
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
    const date = parseLocalDate(workout.date);
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
  const order = program?.sessionOrder || [];
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

function getExerciseBestSet(exercise) {
  const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
  return sets.reduce((best, set) => ({
    maxWeight: Math.max(best.maxWeight, Number(set?.weight) || 0),
    maxReps: Math.max(best.maxReps, Number(set?.reps) || 0),
  }), { maxWeight: 0, maxReps: 0 });
}

// Records are calculated from local workout history. Nothing new is collected
// or sent to a server, and editing/deleting a workout automatically updates them.
export function getNewPersonalRecords(exercises) {
  const previousBests = new Map();
  getWorkouts().forEach((workout) => {
    (workout.exercises || []).forEach((exercise) => {
      if (!exercise.exerciseId) return;
      const previous = previousBests.get(exercise.exerciseId) || { maxWeight: 0, maxReps: 0, hasHistory: false };
      const current = getExerciseBestSet(exercise);
      previousBests.set(exercise.exerciseId, {
        maxWeight: Math.max(previous.maxWeight, current.maxWeight),
        maxReps: Math.max(previous.maxReps, current.maxReps),
        hasHistory: true,
      });
    });
  });

  return (exercises || []).flatMap((exercise) => {
    if (!exercise?.exerciseId) return [];
    const current = getExerciseBestSet(exercise);
    const previous = previousBests.get(exercise.exerciseId);
    if (current.maxWeight <= 0 && current.maxReps <= 0) return [];
    const name = exercise.exerciseName || getExerciseDisplayName(exercise.exerciseId);
    if (!previous) {
      return [{ exerciseId: exercise.exerciseId, exerciseName: name, type: current.maxWeight > 0 ? 'weight' : 'reps', value: current.maxWeight || current.maxReps, first: true }];
    }
    if (current.maxWeight > previous.maxWeight && current.maxWeight > 0) {
      return [{ exerciseId: exercise.exerciseId, exerciseName: name, type: 'weight', value: current.maxWeight, first: false }];
    }
    if (current.maxReps > previous.maxReps) {
      return [{ exerciseId: exercise.exerciseId, exerciseName: name, type: 'reps', value: current.maxReps, first: false }];
    }
    return [];
  });
}

// All-time bests per exercise, independent of any single workout. Powers the
// Stats overview so records stay visible without having to hunt for them.
export function getAllTimePersonalRecords() {
  const bests = new Map();
  [...getWorkouts()]
    .sort((a, b) => new Date(a.savedAt || a.date) - new Date(b.savedAt || b.date))
    .forEach((workout) => {
      (workout.exercises || []).forEach((exercise) => {
        if (!exercise.exerciseId) return;
        const current = getExerciseBestSet(exercise);
        if (current.maxWeight <= 0 && current.maxReps <= 0) return;
        const name = exercise.exerciseName || getExerciseDisplayName(exercise.exerciseId);
        const entry = bests.get(exercise.exerciseId) || {
          exerciseId: exercise.exerciseId, exerciseName: name, maxWeight: 0, maxWeightDate: null, maxReps: 0, maxRepsDate: null,
        };
        entry.exerciseName = name;
        if (current.maxWeight > entry.maxWeight) {
          entry.maxWeight = current.maxWeight;
          entry.maxWeightDate = workout.date;
        }
        if (current.maxReps > entry.maxReps) {
          entry.maxReps = current.maxReps;
          entry.maxRepsDate = workout.date;
        }
        bests.set(exercise.exerciseId, entry);
      });
    });

  return [...bests.values()]
    .map((entry) => (entry.maxWeight > 0
      ? { exerciseId: entry.exerciseId, exerciseName: entry.exerciseName, type: 'weight', value: entry.maxWeight, date: entry.maxWeightDate }
      : { exerciseId: entry.exerciseId, exerciseName: entry.exerciseName, type: 'reps', value: entry.maxReps, date: entry.maxRepsDate }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Exercises whose last logged workout is at most one set away from hitting
// the top of its rep range under double progression — i.e. about to unlock
// (or already ready for) a load increase.
export function getProgressionCandidates() {
  const latestByExercise = new Map();
  [...getWorkouts()]
    .sort((a, b) => new Date(a.savedAt || a.date) - new Date(b.savedAt || b.date))
    .forEach((workout) => {
      (workout.exercises || []).forEach((exercise) => {
        if (!exercise.exerciseId || !exercise.prescription?.repetitionRange) return;
        latestByExercise.set(exercise.exerciseId, {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName || getExerciseDisplayName(exercise.exerciseId),
          date: workout.date,
          prescription: exercise.prescription,
          sets: exercise.sets,
        });
      });
    });

  return [...latestByExercise.values()]
    .flatMap((entry) => {
      const proximity = getProgressionProximity({
        prescription: entry.prescription,
        progressionRule: entry.prescription.progressionRuleId,
        workoutHistory: [{ sets: entry.sets }],
      });
      return proximity ? [{ exerciseId: entry.exerciseId, exerciseName: entry.exerciseName, date: entry.date, ...proximity }] : [];
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function dateToDayNumber(dateValue) {
  return localDateToDayNumber(dateValue);
}

function getIntervalStreak(workouts, intervalDays, todayDay) {
  const sortedDays = [...new Set(workouts.map((workout) => dateToDayNumber(workout.date)))]
    .sort((a, b) => b - a);
  if (!sortedDays.length || todayDay - sortedDays[0] > intervalDays) return 0;

  let streak = 1;
  for (let index = 1; index < sortedDays.length; index += 1) {
    if (sortedDays[index - 1] - sortedDays[index] > intervalDays) break;
    streak += 1;
  }
  return streak;
}

function getWeekStart(dayNumber) {
  return dayNumber - ((dayNumber + 3) % 7);
}

function getWeeklyStreak(workouts, sessionsPerWeek, todayDay) {
  const workoutsByWeek = new Map();
  workouts.forEach((workout) => {
    const weekStart = getWeekStart(dateToDayNumber(workout.date));
    workoutsByWeek.set(weekStart, (workoutsByWeek.get(weekStart) || 0) + 1);
  });

  let weekStart = getWeekStart(todayDay);
  // The current week only joins the streak once its target is reached and
  // cannot break the previous completed weeks before it ends.
  if ((workoutsByWeek.get(weekStart) || 0) < sessionsPerWeek) weekStart -= 7;

  let streak = 0;
  while ((workoutsByWeek.get(weekStart) || 0) >= sessionsPerWeek) {
    streak += 1;
    weekStart -= 7;
  }
  return streak;
}

export function getStats(program = DEFAULT_PROGRAM, now = new Date()) {
  const workouts = getWorkouts();
  const frequency = program?.trainingFrequency || { mode: 'interval', intervalDays: 2 };
  const streakUnit = frequency.mode === 'weekly' ? 'week' : 'workout';
  if (workouts.length === 0) return { totalWorkouts: 0, streak: 0, streakUnit, thisMonth: 0 };

  const thisMonth = workouts.filter((workout) => {
    const date = parseLocalDate(workout.date);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
  const programWorkouts = workouts.filter((workout) => workout.programId === program?.id);
  const todayDay = dateToDayNumber(now);
  const streak = frequency.mode === 'weekly'
    ? getWeeklyStreak(programWorkouts, frequency.sessionsPerWeek || 3, todayDay)
    : getIntervalStreak(programWorkouts, frequency.intervalDays || 2, todayDay);
  return { totalWorkouts: workouts.length, streak, streakUnit, thisMonth };
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
    ...getSupplementsBackup(),
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

export function exportProgramData(programId) {
  const program = getPrograms().find((entry) => entry.id === programId);
  if (!program) return null;
  const { builtIn, ...exportedProgram } = program;
  return JSON.stringify({
    format: PROGRAM_EXPORT_FORMAT,
    version: PROGRAM_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    programs: [exportedProgram],
    activeProgramId: exportedProgram.id,
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
    if (!isLegacyExport && (!Number.isInteger(raw.version) || raw.version < 2 || raw.version > EXPORT_VERSION)) return null;
    if (!isLegacyExport && (!Array.isArray(raw.programs) || typeof raw.activeProgramId !== 'string')) return null;

    const { workouts } = migrateWorkouts(workoutsInput);
    if (workouts.some((workout) => validateWorkout(workout).length > 0)) return null;

    const programs = isLegacyExport ? null : migratePrograms(raw.programs).programs;
    if (programs && (
      programs.some((program) => !program || validateProgram(program).length > 0)
      || programs.some((program) => typeof program.id !== 'string' || !program.id.trim())
      || new Set(programs.map((program) => program.id)).size !== programs.length
      || !programs.some((program) => program.id === raw.activeProgramId)
    )) return null;

    return {
      workouts,
      programs: programs || null,
      activeProgramId: isLegacyExport ? null : raw.activeProgramId,
      supplements: isLegacyExport ? [] : raw.supplements,
      supplementLog: isLegacyExport ? {} : raw.supplementLog,
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
      || raw.version !== PROGRAM_EXPORT_VERSION
      || !Array.isArray(raw.programs)
      || typeof raw.activeProgramId !== 'string'
    ) return null;

    const programs = migratePrograms(raw.programs).programs;
    if (
      programs.some((program) => !program || validateProgram(program).length > 0)
      || programs.some((program) => typeof program.id !== 'string' || !program.id.trim())
      || new Set(programs.map((program) => program.id)).size !== programs.length
      || !programs.some((program) => program.id === raw.activeProgramId)
    ) return null;

    return { programs, activeProgramId: raw.activeProgramId };
  } catch {
    return null;
  }
}

export function getExportSummary() {
  const storedPrograms = getPrograms();
  const baseProgramCustomized = storedPrograms.some((program) => (
    program.id === DEFAULT_PROGRAM.id
    && JSON.stringify({ ...program, builtIn: undefined }) !== JSON.stringify({ ...DEFAULT_PROGRAM, builtIn: undefined })
  ));
  return {
    workouts: getWorkouts().length,
    programs: getCustomPrograms().length,
    supplements: getSupplementsBackup().supplements.length,
    baseProgramCustomized,
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
  restoreSupplementsBackup(data);
  return true;
}

export function importProgramsData(jsonString) {
  const data = parseProgramsImportData(jsonString);
  if (!data) return false;
  return appendPrograms(data.programs);
}
