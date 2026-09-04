import assert from 'node:assert/strict';
import test from 'node:test';

import { EXERCISES, MUSCLE_CATEGORIES, STATS_MUSCLE_GROUPS, getExerciseMuscleCategory, getExerciseStatsGroups, getExercisesByMuscleCategory, getStatsMuscleGroup } from '../data/exercises.js';

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

test('every muscle category maps to exactly one push/pull/legs stats group', () => {
  MUSCLE_CATEGORIES.forEach((category) => assert.ok(getStatsMuscleGroup(category.id), category.id));
  const seen = new Set();
  STATS_MUSCLE_GROUPS.forEach((group) => group.categories.forEach((categoryId) => {
    assert.ok(!seen.has(categoryId), `${categoryId} listed in more than one stats group`);
    seen.add(categoryId);
  }));
});

test('the conventional deadlift counts as both a legs and a pull stats exercise', () => {
  assert.deepEqual(getExerciseStatsGroups('barbell_deadlift'), ['legs', 'pull']);
  assert.deepEqual(getExerciseStatsGroups('dumbbell_deadlift'), ['legs', 'pull']);
  // Hinge variants that don't load the back the same way stay legs-only.
  assert.deepEqual(getExerciseStatsGroups('romanian_deadlift'), ['legs']);
});

test('common barbell movements also expose their dumbbell variants', () => {
  const ids = new Set(EXERCISES.map((exercise) => exercise.id));
  [
    'barbell_shrug', 'dumbbell_shrug',
    'barbell_deadlift', 'dumbbell_deadlift',
    'romanian_deadlift', 'dumbbell_romanian_deadlift',
    'barbell_curl', 'dumbbell_curl',
    'barbell_upright_row', 'dumbbell_upright_row',
    'barbell_wrist_curl', 'wrist_curl',
  ].forEach((id) => assert.ok(ids.has(id), id));
});
