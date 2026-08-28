import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const storage = await import('../storage.js');
const programs = await import('../services/program-storage.js');
const supplements = await import('../supplements.js');
const { DEFAULT_PROGRAM } = await import('../data/default-program.js');

test('storage migrates old local data in place and keeps the next session generic', () => {
  values.clear();
  values.set('muscu_workouts', JSON.stringify([{
    id: 'old', date: '2026-02-01', savedAt: '2026-02-01T10:00:00.000Z', sessionType: 'A',
    exercises: [{ exerciseId: 'tractions_lestees', exerciseName: 'Tractions lestées', sets: [{ weight: 10, reps: 5 }] }],
  }]));

  const workouts = storage.getWorkouts();
  assert.equal(workouts[0].schemaVersion, 2);
  assert.equal(workouts[0].exercises[0].exerciseId, 'weighted_pull_up');
  assert.equal(storage.getNextSession({ id: 'custom', sessionOrder: ['one', 'two'] }), 'one');
  assert.equal(JSON.parse(values.get('muscu_workouts'))[0].schemaVersion, 2);
});

test('storage saves versioned records and looks them up by program exercise id', () => {
  values.clear();
  storage.saveWorkout({
    programId: 'custom', sessionId: 'one', exercises: [{
      programExerciseId: 'press_main', exerciseId: 'barbell_bench_press', exerciseName: 'Développé couché',
      sets: [{ setNumber: 1, type: 'working', weight: 80, reps: 8, rir: 2, completed: true }],
    }],
  });
  assert.equal(storage.getLastExerciseData('press_main', 'one').exerciseId, 'barbell_bench_press');
});

test('an interrupted workout draft is separate from completed workout history', () => {
  values.clear();
  storage.saveActiveWorkoutDraft({
    activeSessionId: 'A', activeProgramId: 'custom', workoutSession: { id: 'A', name: 'Séance A' },
    exerciseSets: { press: [{ weight: 40, reps: 8, done: true }] },
  });

  assert.equal(storage.getWorkouts().length, 0);
  assert.equal(storage.getActiveWorkoutDraft().exerciseSets.press[0].weight, 40);
  storage.clearActiveWorkoutDraft();
  assert.equal(storage.getActiveWorkoutDraft(), null);
});

test('storage updates a recorded workout in place without changing its date or id', () => {
  values.clear();
  const saved = storage.saveWorkout({
    date: '2026-07-14', programId: 'custom', sessionId: 'one', exercises: [{
      programExerciseId: 'press_main', exerciseId: 'barbell_bench_press', exerciseName: 'Développé couché',
      sets: [{ weight: 80, reps: 8 }],
    }],
  });
  const updated = storage.updateWorkout(saved.id, {
    exercises: [{
      programExerciseId: 'press_main', exerciseId: 'dumbbell_bench_press', exerciseName: 'Développé couché haltères',
      sets: [{ weight: 32, reps: 10 }],
    }],
  });

  assert.equal(storage.getWorkouts().length, 1);
  assert.equal(updated.id, saved.id);
  assert.equal(updated.date, '2026-07-14');
  assert.equal(updated.exercises[0].exerciseId, 'dumbbell_bench_press');
});

test('last exercise data follows the exercise across programs and sessions', () => {
  values.clear();
  storage.saveWorkout({
    programId: 'old_program', sessionId: 'old_session', exercises: [{
      programExerciseId: 'old_bench_item', exerciseId: 'barbell_bench_press', exerciseName: 'Développé couché',
      sets: [
        { setNumber: 1, type: 'working', weight: 80, reps: 8, completed: true },
        { setNumber: 2, type: 'working', weight: 80, reps: 7, completed: true },
      ],
    }],
  });

  const previous = storage.getLastExerciseDataByExerciseId('barbell_bench_press');
  assert.equal(previous.programExerciseId, 'old_bench_item');
  assert.equal(previous.sets.length, 2);
  assert.equal(previous.sets[0].weight, 80);
  assert.equal(previous.sets[1].reps, 7);
});

test('the previous workout lookup stays within the same program and session', () => {
  values.clear();
  storage.saveWorkout({ programId: 'other_program', sessionId: 'A', exercises: [] });
  storage.saveWorkout({ programId: 'active_program', sessionId: 'B', exercises: [] });
  storage.saveWorkout({ programId: 'active_program', sessionId: 'A', exercises: [] });

  assert.equal(storage.getLastWorkout('A', 'active_program').programId, 'active_program');
  assert.equal(storage.getLastWorkout('A', 'active_program').sessionId, 'A');
});

test('interval streak follows the active program frequency', () => {
  values.clear();
  const program = { ...structuredClone(DEFAULT_PROGRAM), id: 'frequency_program', trainingFrequency: { mode: 'interval', intervalDays: 3 } };
  ['2026-08-12', '2026-08-15', '2026-08-18'].forEach((date) => {
    storage.saveWorkout({ programId: program.id, sessionId: 'A', date, exercises: [] });
  });
  storage.saveWorkout({ programId: 'another_program', sessionId: 'A', date: '2026-08-17', exercises: [] });

  assert.equal(storage.getStats(program, new Date(2026, 7, 18)).streak, 3);
  assert.equal(storage.getStats(program, new Date(2026, 7, 21)).streak, 3);
  assert.equal(storage.getStats(program, new Date(2026, 7, 22)).streak, 0);
});

test('weekly streak counts consecutive weeks that reach their workout target', () => {
  values.clear();
  const program = { ...structuredClone(DEFAULT_PROGRAM), id: 'weekly_program', trainingFrequency: { mode: 'weekly', sessionsPerWeek: 3 } };
  [
    '2026-07-27', '2026-07-29', '2026-07-31',
    '2026-08-03', '2026-08-05', '2026-08-07',
    '2026-08-10', '2026-08-12', '2026-08-14',
    '2026-08-17',
  ].forEach((date) => storage.saveWorkout({ programId: program.id, sessionId: 'A', date, exercises: [] }));

  const currentPartialWeek = storage.getStats(program, new Date(2026, 7, 18));
  assert.equal(currentPartialWeek.streak, 3);
  assert.equal(currentPartialWeek.streakUnit, 'week');

  ['2026-08-18', '2026-08-19'].forEach((date) => storage.saveWorkout({ programId: program.id, sessionId: 'A', date, exercises: [] }));
  assert.equal(storage.getStats(program, new Date(2026, 7, 19)).streak, 4);
});

test('backup exports and restores workouts, custom programs, and the active program', () => {
  values.clear();
  const customProgram = structuredClone(DEFAULT_PROGRAM);
  customProgram.id = 'exported_program';
  customProgram.name = 'Programme exporté';
  programs.saveProgram(customProgram);
  programs.setActiveProgram(customProgram.id);
  storage.saveWorkout({
    programId: customProgram.id,
    sessionId: 'A',
    exercises: [{
      programExerciseId: 'tractions_lestees', exerciseId: 'weighted_pull_up', exerciseName: 'Tractions lestées',
      sets: [{ weight: 10, reps: 5 }],
    }],
  });

  const backup = storage.exportData();
  const parsed = JSON.parse(backup);
  assert.equal(parsed.format, 'muscu-tracker-backup');
  assert.equal(parsed.workouts.length, 1);
  assert.equal(parsed.programs.length, 2);
  assert.equal(parsed.programs.find((program) => program.id === customProgram.id).id, customProgram.id);
  assert.equal(parsed.activeProgramId, customProgram.id);

  values.clear();
  assert.equal(storage.importData(backup), true);
  assert.equal(storage.getWorkouts().length, 1);
  assert.equal(programs.getActiveProgram().id, customProgram.id);
  assert.equal(programs.getProgramById(customProgram.id).name, 'Programme exporté');
});

test('program-only backup adds programs without changing workout history or the active program', () => {
  values.clear();
  const customProgram = structuredClone(DEFAULT_PROGRAM);
  customProgram.id = 'program_only_export';
  customProgram.name = 'Programme sans séances';
  programs.saveProgram(customProgram);
  programs.setActiveProgram(customProgram.id);
  storage.saveWorkout({ programId: customProgram.id, sessionId: 'A', exercises: [] });

  const backup = storage.exportProgramsData();
  const parsed = JSON.parse(backup);
  assert.equal(parsed.format, 'muscu-tracker-programs');
  assert.equal('workouts' in parsed, false);
  assert.equal(storage.getProgramsImportSummary(backup).programs, 2);

  assert.equal(storage.importProgramsData(backup), true);
  assert.equal(storage.getWorkouts().length, 1);
  assert.equal(programs.getActiveProgram().id, customProgram.id);
  assert.equal(programs.getPrograms().length, 4);
  assert.ok(programs.getPrograms().some((program) => program.name === 'Programme sans séances (1)'));

  assert.equal(storage.importProgramsData(backup), true);
  assert.ok(programs.getPrograms().some((program) => program.name === 'Programme sans séances (2)'));
});

test('storage still imports the legacy workout-array export format', () => {
  values.clear();
  const legacyExport = JSON.stringify([{
    id: 'legacy', date: '2026-02-01', sessionType: 'A', exercises: [{
      exerciseId: 'weighted_pull_up', programExerciseId: 'tractions_lestees', sets: [],
    }],
  }]);

  assert.equal(storage.importData(legacyExport), true);
  assert.equal(storage.getWorkouts().length, 1);
  assert.equal(programs.getCustomPrograms().length, 0);
});

test('supplements persist daily intake and are included in full backups', () => {
  values.clear();
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const creatine = supplements.addSupplement({ name: 'Créatine', dose: '5', unit: 'g' });
  const omega = supplements.addSupplement({ name: 'Oméga-3' });
  supplements.toggleSupplementTaken(creatine.id, date);
  assert.deepEqual(supplements.getSupplementStatus(date), { total: 2, taken: 1, complete: false });

  const backup = storage.exportData();
  values.clear();
  assert.equal(storage.importData(backup), true);
  assert.equal(supplements.getSupplements().length, 2);
  assert.deepEqual(supplements.getTakenSupplementIds(date), [creatine.id]);
  assert.equal(supplements.getSupplementStatus(date).complete, false);
  assert.equal(supplements.getSupplements()[1].id, omega.id);
});

test('backup summary includes supplements and edits to the built-in program', () => {
  values.clear();
  supplements.addSupplement({ name: 'Créatine' });
  assert.deepEqual(storage.getExportSummary(), {
    workouts: 0, programs: 0, supplements: 1, baseProgramCustomized: false,
  });

  const editedBase = structuredClone(DEFAULT_PROGRAM);
  editedBase.name = 'Mon programme principal';
  programs.saveProgram(editedBase);
  assert.equal(storage.getExportSummary().baseProgramCustomized, true);
});

test('versioned imports reject unsupported future backup versions', () => {
  values.clear();
  const fullBackup = JSON.parse(storage.exportData());
  fullBackup.version += 1;
  assert.equal(storage.getImportSummary(JSON.stringify(fullBackup)), null);
  assert.equal(storage.importData(JSON.stringify(fullBackup)), false);

  const programsBackup = JSON.parse(storage.exportProgramsData());
  programsBackup.version += 1;
  assert.equal(storage.getProgramsImportSummary(JSON.stringify(programsBackup)), null);
  assert.equal(storage.importProgramsData(JSON.stringify(programsBackup)), false);
});
