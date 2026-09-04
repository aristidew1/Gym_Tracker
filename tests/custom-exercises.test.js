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
