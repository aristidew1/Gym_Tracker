import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_PROGRAM, getResolvedExercise } from '../data/default-program.js';
import { getNextPrescription, getProgressionProximity } from '../services/progression-engine.js';
import { createWorkoutRecord, migrateProgram, migrateWorkout, validateProgram, validateWorkout } from '../models/workout-schema.js';
import { createBlankProgram } from '../programs.js';

test('legacy workout is migrated to the versioned schema without losing its sets', () => {
  const migrated = migrateWorkout({
    id: 'legacy', date: '2026-01-10', sessionType: 'B',
    exercises: [{ exerciseId: 'bloc_force_b', exerciseName: 'Développé couché', choiceId: 'dev_couche', sets: [{ weight: 80, reps: 5 }] }],
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.sessionId, 'B');
  assert.equal(migrated.exercises[0].programExerciseId, 'bloc_force_b');
  assert.equal(migrated.exercises[0].exerciseId, 'barbell_bench_press');
  assert.deepEqual(migrated.exercises[0].sets[0], { setNumber: 1, type: 'working', weight: 80, reps: 5, rir: null, completed: true, segments: [] });
  assert.deepEqual(validateWorkout(migrated), []);
  assert.deepEqual(migrateWorkout(migrated), migrated);
});

test('a finished workout is dated by the local calendar day, not the UTC one', () => {
  const originalTz = process.env.TZ;
  // UTC+14: local day has already rolled over while UTC is still on the previous day.
  process.env.TZ = 'Pacific/Kiritimati';
  try {
    const record = createWorkoutRecord({ exercises: [] }, 'seed', '2026-09-04T23:30:00.000Z');
    assert.equal(record.date, '2026-09-05');
  } finally {
    process.env.TZ = originalTz;
  }
});

test('method choices retain the pull-up exercise during migration', () => {
  const migrated = migrateWorkout({
    sessionType: 'D', exercises: [{ exerciseId: 'tractions_endurance', choiceId: 'emom', sets: [{ weight: 0, reps: 5 }] }],
  });
  assert.equal(migrated.exercises[0].exerciseId, 'pull_up');
  assert.equal(migrated.exercises[0].selectionId, 'emom');
});

test('drop-set segments survive normalization', () => {
  const migrated = migrateWorkout({
    sessionType: 'A',
    exercises: [{ exerciseId: 'tractions_lestees', sets: [{ weight: 20, reps: 6, segments: [{ type: 'drop', weight: 15, reps: 8, completed: true }] }] }],
  });
  assert.deepEqual(migrated.exercises[0].sets[0].segments, [{ type: 'drop', weight: 15, reps: 8, completed: true }]);
});

test('the default preset resolves an exercise choice and an intensity method', () => {
  const benchItem = DEFAULT_PROGRAM.sessions.B.blocks[0].items[0];
  const emomItem = DEFAULT_PROGRAM.sessions.D.blocks[1].items[0];
  assert.equal(getResolvedExercise(benchItem, 'barbell_bench_press').name, 'Développé couché');
  assert.equal(getResolvedExercise(emomItem, 'emom').intensityTechnique.type, 'emom');
});

test('manually composed program satisfies the generic schema', () => {
  const program = JSON.parse(JSON.stringify(DEFAULT_PROGRAM));
  program.id = 'manual_test';
  program.name = 'Programme manuel';
  assert.deepEqual(validateProgram(DEFAULT_PROGRAM), []);
  assert.deepEqual(validateProgram(program), []);
  assert.deepEqual(validateProgram(createBlankProgram()), []);
});

test('legacy program frequencies migrate to the polyvalent schema', () => {
  const legacyProgram = structuredClone(DEFAULT_PROGRAM);
  legacyProgram.schemaVersion = 3;
  delete legacyProgram.trainingFrequency;
  legacyProgram.trainingFrequencyDays = 4;

  const migrated = migrateProgram(legacyProgram);

  assert.equal(migrated.schemaVersion, 4);
  assert.deepEqual(migrated.trainingFrequency, { mode: 'interval', intervalDays: 4 });
  assert.equal('trainingFrequencyDays' in migrated, false);
  assert.deepEqual(validateProgram(migrated), []);
});

test('program schema accepts interval and weekly frequencies', () => {
  const intervalProgram = structuredClone(DEFAULT_PROGRAM);
  intervalProgram.trainingFrequency = { mode: 'interval', intervalDays: 5 };
  const weeklyProgram = structuredClone(DEFAULT_PROGRAM);
  weeklyProgram.trainingFrequency = { mode: 'weekly', sessionsPerWeek: 4 };

  assert.deepEqual(validateProgram(intervalProgram), []);
  assert.deepEqual(validateProgram(weeklyProgram), []);
});

test('double progression only proposes a load increase when all sets reach the top range', () => {
  const result = getNextPrescription({
    prescription: { setCount: 3, repetitionRange: { min: 8, max: 12 } },
    progressionRule: 'double_progression',
    workoutHistory: [{ sets: [{ reps: 12, completed: true }, { reps: 12, completed: true }, { reps: 12, completed: true }] }],
  });
  assert.equal(result.changed, true);
  assert.equal(result.prescription.suggestedLoadIncrement, 2.5);
});

test('progression proximity flags an exercise one set away from the top of its rep range', () => {
  const proximity = getProgressionProximity({
    prescription: { setCount: 4, repetitionRange: { min: 8, max: 12 } },
    progressionRule: 'double_progression',
    workoutHistory: [{ sets: [{ reps: 12, completed: true }, { reps: 12, completed: true }, { reps: 12, completed: true }, { reps: 10, completed: true }] }],
  });
  assert.deepEqual(proximity, { ready: false, setsAtMax: 3, setCount: 4, repMax: 12 });
});

test('progression proximity marks an exercise ready once every set reaches the top of its rep range', () => {
  const proximity = getProgressionProximity({
    prescription: { setCount: 2, repetitionRange: { min: 8, max: 12 } },
    progressionRule: 'double_progression',
    workoutHistory: [{ sets: [{ reps: 12, completed: true }, { reps: 12, completed: true }] }],
  });
  assert.deepEqual(proximity, { ready: true, setsAtMax: 2, setCount: 2, repMax: 12 });
});

test('progression proximity ignores exercises still more than one set away or without double progression', () => {
  const farFromCap = getProgressionProximity({
    prescription: { setCount: 4, repetitionRange: { min: 8, max: 12 } },
    progressionRule: 'double_progression',
    workoutHistory: [{ sets: [{ reps: 12, completed: true }, { reps: 9, completed: true }, { reps: 8, completed: true }, { reps: 10, completed: true }] }],
  });
  assert.equal(farFromCap, null);

  const noRule = getProgressionProximity({
    prescription: { setCount: 2, repetitionRange: { min: 8, max: 12 } },
    progressionRule: null,
    workoutHistory: [{ sets: [{ reps: 12, completed: true }, { reps: 12, completed: true }] }],
  });
  assert.equal(noRule, null);
});
