import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const {
  createBuilderDisclosureState,
  formatBlockSummary,
  formatPrescriptionSummary,
  toggleDisclosure,
} = await import('../services/program-builder-view.js');

const program = {
  sessionOrder: ['a'],
  sessions: {
    a: {
      id: 'a',
      blocks: [{
        id: 'block_a',
        executionMode: 'superset',
        rounds: 3,
        restBetweenRoundsSeconds: 90,
        items: [{ id: 'item_a' }, { id: 'item_b' }],
      }],
    },
  },
};

test('existing programs start compact while new programs guide the first edit', () => {
  const existing = createBuilderDisclosureState(program, { isNew: false });
  assert.equal(existing.programInfoOpen, false);
  assert.equal(existing.sessionSettingsOpen.size, 0);
  assert.equal(existing.openBlocks.size, 0);

  const fresh = createBuilderDisclosureState(program, { isNew: true });
  assert.equal(fresh.programInfoOpen, true);
  assert.ok(fresh.sessionSettingsOpen.has('a'));
  assert.ok(fresh.openBlocks.has('block_a'));
  assert.equal(fresh.openItems.size, 0);
  assert.equal(fresh.openAdvancedItems.size, 0);
});

test('summaries expose useful information without advanced fields', () => {
  const item = {
    prescription: {
      setCount: 5,
      repetitionRange: { min: 3, max: 5 },
      restSeconds: 150,
      targetRir: 2,
    },
  };
  assert.equal(formatPrescriptionSummary(item), '5 × 3–5 · 150 s · RIR 2');
  assert.equal(formatBlockSummary(program.sessions.a.blocks[0]), 'Superset · 2 exercices · 3 rounds · 90 s');
  assert.deepEqual([...toggleDisclosure(new Set(), 'block_a')], ['block_a']);
  assert.equal(toggleDisclosure(new Set(['block_a']), 'block_a').size, 0);
});

test('summaries omit optional targets that are not configured', () => {
  const item = { prescription: { setCount: 3, repetitionRange: { min: 8, max: 8 }, restSeconds: 0, targetRir: null, targetRpe: null } };
  assert.equal(formatPrescriptionSummary(item), '3 × 8');
  assert.equal(formatBlockSummary({ executionMode: 'sequential', rounds: 1, items: [{}] }), 'Séquentiel · 1 exercice');
});
