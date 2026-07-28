import assert from 'node:assert/strict';
import test from 'node:test';

import { EXERCISES, MUSCLE_CATEGORIES, getExerciseMuscleCategory, getExercisesByMuscleCategory } from '../data/exercises.js';

test('expanded exercise catalogue has unique IDs and every exercise has a muscle category', () => {
  assert.ok(EXERCISES.length >= 100);
  assert.equal(new Set(EXERCISES.map((exercise) => exercise.id)).size, EXERCISES.length);
  const categoryIds = new Set(MUSCLE_CATEGORIES.map((category) => category.id));
  EXERCISES.forEach((exercise) => assert.ok(categoryIds.has(getExerciseMuscleCategory(exercise)), exercise.id));
});

test('pull-ups are available after selecting the back category', () => {
  const backExerciseIds = getExercisesByMuscleCategory('back').map((exercise) => exercise.id);
  assert.ok(backExerciseIds.includes('pull_up'));
  assert.ok(backExerciseIds.includes('weighted_pull_up'));
});

test('every muscle category contains exercises', () => {
  MUSCLE_CATEGORIES.forEach((category) => assert.ok(getExercisesByMuscleCategory(category.id).length > 0, category.id));
});
