import assert from 'node:assert/strict';
import test from 'node:test';

import { getExerciseById } from '../data/exercises.js';
import { getOnboardingProgramTemplate, ONBOARDING_PROGRAM_TEMPLATE_IDS } from '../data/onboarding-programs.js';
import { validateProgram } from '../models/workout-schema.js';

test('first-run templates are distinct valid programs', () => {
  assert.deepEqual(ONBOARDING_PROGRAM_TEMPLATE_IDS, ['starter_full_body', 'upper_lower_hypertrophy']);
  const templates = ONBOARDING_PROGRAM_TEMPLATE_IDS.map(getOnboardingProgramTemplate);
  assert.deepEqual(templates.map((program) => program.trainingFrequency.sessionsPerWeek), [3, 4]);
  templates.forEach((program) => assert.deepEqual(validateProgram(program), []));
});

test('every first-run template references known exercises and unique item ids', () => {
  ONBOARDING_PROGRAM_TEMPLATE_IDS.map(getOnboardingProgramTemplate).forEach((program) => {
    const items = program.sessionOrder.flatMap((sessionId) => (
      program.sessions[sessionId].blocks.flatMap((block) => block.items)
    ));
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
    items.forEach((item) => assert.ok(getExerciseById(item.exerciseId), item.exerciseId));
  });
});

test('templates are cloned before they are edited', () => {
  const first = getOnboardingProgramTemplate('starter_full_body');
  first.name = 'Modifié';
  assert.equal(getOnboardingProgramTemplate('starter_full_body').name, 'Full body débutant');
  assert.equal(getOnboardingProgramTemplate('unknown'), null);
});
