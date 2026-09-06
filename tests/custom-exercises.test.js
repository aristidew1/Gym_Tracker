import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const customExercises = await import('../services/custom-exercises.js');
const exercises = await import('../data/exercises.js');
const { mergeById } = await import('../services/entity-meta.js');

test('a custom exercise can be created, listed, updated and deleted', () => {
  values.clear();
  const created = customExercises.createCustomExercise({ name: 'Curl banc Scott maison', muscleCategory: 'biceps' });
  assert.ok(created.id.startsWith('custom_'));
  assert.equal(created.custom, true);
  assert.deepEqual(customExercises.getCustomExercises().map((entry) => entry.id), [created.id]);

  assert.ok(customExercises.updateCustomExercise(created.id, { name: 'Curl Scott maison', muscleCategory: 'biceps' }));
  assert.equal(customExercises.getCustomExerciseById(created.id).name, 'Curl Scott maison');

  assert.ok(customExercises.deleteCustomExercise(created.id));
  assert.equal(customExercises.getCustomExercises().length, 0);
});

test('creating a custom exercise without a name or category is rejected', () => {
  values.clear();
  assert.equal(customExercises.createCustomExercise({ name: '  ', muscleCategory: 'back' }), null);
  assert.equal(customExercises.createCustomExercise({ name: 'Sans catégorie', muscleCategory: '' }), null);
  assert.equal(customExercises.getCustomExercises().length, 0);
});

test('custom exercises behave like built-in ones in the exercise catalogue', () => {
  values.clear();
  const created = customExercises.createCustomExercise({ name: 'Presse à cuisses maison', muscleCategory: 'quadriceps' });

  assert.deepEqual(exercises.getExerciseById(created.id), created);
  assert.equal(exercises.getExerciseMuscleCategory(created.id), 'quadriceps');
  assert.equal(exercises.getExerciseDisplayName(created.id), 'Presse à cuisses maison');
  assert.ok(exercises.getExercisesByMuscleCategory('quadriceps').some((exercise) => exercise.id === created.id));
  assert.deepEqual(exercises.getExerciseStatsGroups(created.id), ['legs']);
});

test('an unknown custom exercise id resolves to null instead of throwing', () => {
  values.clear();
  assert.equal(exercises.getExerciseById('custom_does_not_exist'), null);
  assert.equal(exercises.getExerciseDisplayName('custom_does_not_exist'), 'Exercice inconnu');
});

test('deleting a custom exercise leaves a tombstone for sync instead of removing it', () => {
  values.clear();
  const created = customExercises.createCustomExercise({ name: 'Curl marteau maison', muscleCategory: 'biceps' });
  assert.ok(customExercises.deleteCustomExercise(created.id));

  assert.equal(customExercises.getCustomExercises().length, 0);
  const raw = customExercises.getAllCustomExercisesRaw().find((entry) => entry.id === created.id);
  assert.ok(raw.deletedAt, 'a deleted custom exercise should stay in raw storage as a tombstone');
  assert.ok(raw.updatedAt >= created.updatedAt);

  // Deleting the same id again is a no-op, not a second tombstone bump.
  assert.equal(customExercises.deleteCustomExercise(created.id), false);
});

test('replaceAllCustomExercisesRaw merges a pull by last-write-wins', () => {
  values.clear();
  const created = customExercises.createCustomExercise({ name: 'Presse locale', muscleCategory: 'quadriceps' });

  customExercises.replaceAllCustomExercisesRaw(customExercises.getAllCustomExercisesRaw());
  assert.equal(customExercises.getCustomExercises().length, 1);

  const remoteNewer = { id: created.id, name: 'Presse distante', muscleCategory: 'quadriceps', updatedAt: '2999-01-01T00:00:00.000Z', deletedAt: null };
  customExercises.replaceAllCustomExercisesRaw(mergeById(customExercises.getAllCustomExercisesRaw(), [remoteNewer]));
  assert.equal(customExercises.getCustomExerciseById(created.id).name, 'Presse distante');
});
