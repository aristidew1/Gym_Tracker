import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const storage = await import('../storage.js');
const programStore = await import('../services/program-storage.js');
const syncAdapters = await import('../services/sync-adapters.js');
const { mergeById } = await import('../services/entity-meta.js');
const { DEFAULT_PROGRAM } = await import('../data/default-program.js');
const customExercises = await import('../services/custom-exercises.js');
const supplements = await import('../supplements.js');
const coachmark = await import('../coachmark.js');
const programNotes = await import('../services/program-notes.js');

function makeWorkout(overrides = {}) {
  return storage.saveWorkout({
    programId: 'custom', sessionId: 'one', exercises: [{
      programExerciseId: 'press_main', exerciseId: 'barbell_bench_press', exerciseName: 'Développé couché',
      sets: [{ setNumber: 1, type: 'working', weight: 80, reps: 8, rir: 2, completed: true }],
    }],
    ...overrides,
  });
}

test('mergeById keeps the remote record only if strictly newer than local', () => {
  const local = [{ id: 'a', updatedAt: '2026-01-02T00:00:00.000Z', v: 'local' }];

  const olderRemoteWins = mergeById(local, [{ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', v: 'remote' }]);
  assert.equal(olderRemoteWins[0].v, 'local');

  const newerRemoteWins = mergeById(local, [{ id: 'a', updatedAt: '2026-01-03T00:00:00.000Z', v: 'remote' }]);
  assert.equal(newerRemoteWins[0].v, 'remote');

  const newRemoteId = mergeById(local, [{ id: 'b', updatedAt: '2026-01-01T00:00:00.000Z', v: 'remote' }]);
  assert.equal(newRemoteId.length, 2);
});

test('applying a workouts pull merges by last-write-wins and survives a concurrent local edit', () => {
  values.clear();
  const saved = makeWorkout();

  // Simulate a pull carrying an older version of the same workout (e.g.
  // echoed back from a push the local device made itself) — must not
  // regress the already-current local record.
  syncAdapters.applyPull({
    workouts: [{ id: saved.id, updatedAt: '2000-01-01T00:00:00.000Z', data: { ...saved, exercises: [] } }],
    programs: [],
  });
  assert.equal(storage.getAllWorkoutsRaw().find((w) => w.id === saved.id).exercises.length, 1);

  // A genuinely newer remote version must win.
  const newer = { ...saved, exercises: [], updatedAt: '2999-01-01T00:00:00.000Z' };
  syncAdapters.applyPull({ workouts: [{ id: saved.id, updatedAt: newer.updatedAt, data: newer }], programs: [] });
  assert.equal(storage.getAllWorkoutsRaw().find((w) => w.id === saved.id).exercises.length, 0);
});

test('a pulled program with a fresh id merges normally', () => {
  values.clear();
  const remoteProgram = { ...structuredClone(DEFAULT_PROGRAM), id: 'remote_program', name: 'Venu d’un autre appareil', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null };

  syncAdapters.applyPull({ workouts: [], programs: [{ id: remoteProgram.id, updatedAt: remoteProgram.updatedAt, data: remoteProgram }] });

  assert.equal(programStore.getProgramById(remoteProgram.id).name, 'Venu d’un autre appareil');
});

test('a pulled base program that conflicts with a locally-customized one is appended as a new program, not overwritten', () => {
  values.clear();
  const localBase = structuredClone(DEFAULT_PROGRAM);
  localBase.name = 'Ma version locale';
  programStore.saveProgram(localBase);

  const remoteBase = { ...structuredClone(DEFAULT_PROGRAM), name: 'Une autre version', updatedAt: '2999-01-01T00:00:00.000Z', deletedAt: null };
  syncAdapters.applyPull({ workouts: [], programs: [{ id: DEFAULT_PROGRAM.id, updatedAt: remoteBase.updatedAt, data: remoteBase }] });

  // The local customization must survive under its original id...
  assert.equal(programStore.getProgramById(DEFAULT_PROGRAM.id).name, 'Ma version locale');
  // ...and the conflicting remote version must show up as a separate program.
  const appended = programStore.getPrograms().find((p) => p.name === 'Une autre version');
  assert.ok(appended, 'the conflicting remote base program should be appended as a new program');
  assert.notEqual(appended.id, DEFAULT_PROGRAM.id);
});

test('buildPushPayload only includes records changed since the given cursor, tombstones included', () => {
  values.clear();
  const untouched = makeWorkout({ date: '2026-01-01' });
  const changedAfterCutoff = makeWorkout({ date: '2026-01-02' });
  const deletedAfterCutoff = makeWorkout({ date: '2026-01-03' });
  // Pin explicit, deterministic timestamps rather than relying on wall-clock
  // ordering between statements.
  storage.replaceAllWorkoutsRaw(storage.getAllWorkoutsRaw().map((workout) => {
    if (workout.id === untouched.id) return { ...workout, updatedAt: '2020-01-01T00:00:00.000Z' };
    if (workout.id === changedAfterCutoff.id) return { ...workout, updatedAt: '2030-01-01T00:00:00.000Z' };
    if (workout.id === deletedAfterCutoff.id) return { ...workout, updatedAt: '2030-01-02T00:00:00.000Z', deletedAt: '2030-01-02T00:00:00.000Z' };
    return workout;
  }));

  const payload = syncAdapters.buildPushPayload('2025-01-01T00:00:00.000Z');

  const ids = payload.workouts.map((record) => record.id);
  assert.equal(ids.includes(untouched.id), false, 'unchanged-since-cursor records should not be pushed');
  assert.equal(ids.includes(changedAfterCutoff.id), true);
  assert.equal(ids.includes(deletedAfterCutoff.id), true, 'a tombstone must be pushed like any other change');
  const tombstone = payload.workouts.find((record) => record.id === deletedAfterCutoff.id);
  assert.ok(tombstone.deletedAt);
});

test('buildPushPayload and applyPull round-trip every M3 entity', () => {
  values.clear();
  const exercise = customExercises.createCustomExercise({ name: 'Curl pupitre maison', muscleCategory: 'biceps' });
  const supplement = supplements.addSupplement({ name: 'Créatine', dose: '5', unit: 'g' });
  supplements.toggleSupplementTaken(supplement.id, '2026-01-01');
  localStorage.setItem('muscu_theme', 'light');
  coachmark.markAllTipsSeen(['tip_local']);
  programNotes.markProgramNoteSeen('local::note');

  const payload = syncAdapters.buildPushPayload(null);
  assert.deepEqual(payload.customExercises.map((r) => r.id), [exercise.id]);
  assert.deepEqual(payload.supplements.map((r) => r.id), [supplement.id]);
  assert.deepEqual(payload.supplementLog.map((r) => r.supplementId), [supplement.id]);
  assert.ok(payload.settings.some((r) => r.key === 'muscu_theme' && r.value === 'light'));
  assert.ok(payload.seenFlags.some((r) => r.flagType === 'coachmark' && r.flagId === 'tip_local'));
  assert.ok(payload.seenFlags.some((r) => r.flagType === 'program_note' && r.flagId === 'local::note'));

  // A remote pull, all newer, must land through each entity's own store.
  syncAdapters.applyPull({
    customExercises: [{ id: 'remote_ex', name: 'Presse distante', muscleCategory: 'quadriceps', updatedAt: '2026-06-01T00:00:00.000Z', deletedAt: null }],
    supplements: [{ id: 'remote_sup', name: 'Zinc', dose: null, unit: null, createdAt: '2026-01-01', updatedAt: '2026-06-01T00:00:00.000Z', deletedAt: null }],
    supplementLog: [{ logDate: '2026-02-01', supplementId: 'remote_sup', updatedAt: '2026-06-01T00:00:00.000Z', deletedAt: null }],
    settings: [{ key: 'muscu_theme', value: 'dark', updatedAt: '2999-01-01T00:00:00.000Z' }],
    seenFlags: [
      { flagType: 'coachmark', flagId: 'tip_remote', seenAt: '2026-06-01T00:00:00.000Z' },
      { flagType: 'program_note', flagId: 'remote::note', seenAt: '2026-06-01T00:00:00.000Z' },
    ],
  });

  assert.equal(customExercises.getCustomExerciseById('remote_ex').name, 'Presse distante');
  assert.equal(supplements.getSupplements().find((s) => s.id === 'remote_sup').name, 'Zinc');
  assert.deepEqual(supplements.getTakenSupplementIds('2026-02-01'), ['remote_sup']);
  assert.equal(localStorage.getItem('muscu_theme'), 'dark');
  assert.equal(coachmark.hasSeenTip('tip_remote'), true);
  assert.equal(programNotes.hasSeenProgramNote('remote::note'), true);
});
