import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const store = await import('../services/program-storage.js');
const { DEFAULT_PROGRAM } = await import('../data/default-program.js');

test('program library saves, activates and deletes custom programs without touching the preset', () => {
  values.clear();
  const generated = JSON.parse(JSON.stringify(DEFAULT_PROGRAM));
  generated.id = 'manual_program';
  generated.name = 'Programme manuel';
  const saved = store.saveProgram(generated);
  store.setActiveProgram(saved.id);
  assert.equal(store.getActiveProgram().id, saved.id);
  assert.equal(store.getPrograms().length, 2);
  store.deleteProgram(saved.id);
  assert.equal(store.getActiveProgram().id, 'pullup_deadlift_cycle');
  assert.equal(store.getPrograms().length, 1);
});

test('editing the base program keeps its id instead of creating a copy', () => {
  values.clear();
  const editedBase = structuredClone(DEFAULT_PROGRAM);
  editedBase.name = 'Mon programme de base';

  const saved = store.saveProgram(editedBase);

  assert.equal(saved.id, DEFAULT_PROGRAM.id);
  assert.equal(store.getProgramById(DEFAULT_PROGRAM.id).name, 'Mon programme de base');
  assert.equal(store.getPrograms().length, 1);
  assert.equal(store.getPrograms()[0].builtIn, true);
});

test('the base program can be deleted when another program is available', () => {
  values.clear();
  const customProgram = structuredClone(DEFAULT_PROGRAM);
  customProgram.id = 'replacement_program';
  customProgram.name = 'Programme de remplacement';
  store.saveProgram(customProgram);
  store.setActiveProgram(DEFAULT_PROGRAM.id);

  store.deleteProgram(DEFAULT_PROGRAM.id);

  assert.equal(store.getProgramById(DEFAULT_PROGRAM.id), null);
  assert.equal(store.getActiveProgram().id, customProgram.id);
  assert.deepEqual(store.getPrograms().map((program) => program.id), [customProgram.id]);
});

test('the last available program cannot be deleted', () => {
  values.clear();
  assert.throws(() => store.deleteProgram(DEFAULT_PROGRAM.id));
  assert.equal(store.getActiveProgram().id, DEFAULT_PROGRAM.id);
});

test('stored programs with the former day frequency are migrated without losing them', () => {
  values.clear();
  const legacyProgram = structuredClone(DEFAULT_PROGRAM);
  legacyProgram.id = 'legacy_program';
  legacyProgram.schemaVersion = 3;
  delete legacyProgram.trainingFrequency;
  legacyProgram.trainingFrequencyDays = 5;
  values.set('muscu_programs', JSON.stringify([legacyProgram]));

  const migrated = store.getProgramById(legacyProgram.id);

  assert.equal(migrated.schemaVersion, 4);
  assert.deepEqual(migrated.trainingFrequency, { mode: 'interval', intervalDays: 5 });
  assert.deepEqual(JSON.parse(values.get('muscu_programs'))[0].trainingFrequency, { mode: 'interval', intervalDays: 5 });
});
