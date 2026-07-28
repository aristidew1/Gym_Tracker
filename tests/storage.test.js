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
