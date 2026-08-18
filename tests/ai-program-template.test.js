import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const { setLanguage } = await import('../i18n.js');
const { EXERCISES } = await import('../data/exercises.js');
const { INTENSITY_TECHNIQUES } = await import('../data/intensity-techniques.js');
const { validateProgram } = await import('../models/workout-schema.js');
const { getProgramsImportSummary } = await import('../storage.js');
const { buildAiProgramPrompt, createAiProgramImportExample } = await import('../services/ai-program-template.js');

test('AI example follows the program-only import contract', () => {
  const example = createAiProgramImportExample('fr');
  assert.deepEqual(getProgramsImportSummary(JSON.stringify(example)), { programs: 1 });
  assert.equal(example.activeProgramId, example.programs[0].id);
  assert.equal(example.programs[0].schemaVersion, 4);
  assert.deepEqual(example.programs[0].trainingFrequency, { mode: 'weekly', sessionsPerWeek: 3 });
  assert.deepEqual(validateProgram(example.programs[0]), []);
});

test('AI prompt follows the active application language and complete catalog', () => {
  setLanguage('fr');
  const french = buildAiProgramPrompt();
  assert.match(french, /programme de musculation/iu);
  assert.match(french, /Tractions lestées/u);

  setLanguage('en');
  const english = buildAiProgramPrompt();
  assert.match(english, /strength-training program/iu);
  assert.match(english, /Weighted Pull-up/u);
  assert.doesNotMatch(english, /Réponds uniquement/u);

  for (const prompt of [french, english]) {
    assert.match(prompt, /"format": "muscu-tracker-programs"/u);
    assert.match(prompt, /trainingFrequency/u);
    assert.match(prompt, /without Markdown|sans Markdown/u);
    EXERCISES.forEach(({ id }) => assert.ok(prompt.includes(id), id));
    INTENSITY_TECHNIQUES.forEach(({ id }) => assert.ok(prompt.includes(id), id));
  }
});
