import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const { getLanguage, setLanguage, t } = await import('../i18n.js');
const { EXERCISES, MUSCLE_CATEGORIES, getLocalizedExerciseName, getMuscleCategoryDisplayName } = await import('../data/exercises.js');

test('language preference is persistent and translates interface strings', () => {
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('settings'), 'Settings');
  assert.equal(t('daysAgo', { count: 3 }), '3d ago');

  setLanguage('fr');
  assert.equal(t('settings'), 'Paramètres');
});

test('every exercise and muscle category has an English display name', () => {
  setLanguage('en');
  EXERCISES.forEach((exercise) => {
    const name = getLocalizedExerciseName(exercise);
    assert.ok(name, `${exercise.id} should have an English name`);
  });
  MUSCLE_CATEGORIES.forEach((category) => assert.ok(getMuscleCategoryDisplayName(category)));
  assert.equal(getLocalizedExerciseName('pull_up'), 'Pull-up');
  assert.equal(getMuscleCategoryDisplayName('back'), 'Back');
});
