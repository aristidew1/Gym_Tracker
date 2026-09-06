import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const supplements = await import('../supplements.js');
const { mergeByKey } = await import('../services/entity-meta.js');

test('a supplement can be added, taken, and removed', () => {
  values.clear();
  const created = supplements.addSupplement({ name: 'Créatine', dose: '5', unit: 'g' });
  assert.ok(created.id.startsWith('sup_'));
  assert.deepEqual(supplements.getSupplements().map((item) => item.id), [created.id]);

  supplements.toggleSupplementTaken(created.id, '2026-01-01');
  assert.deepEqual(supplements.getTakenSupplementIds('2026-01-01'), [created.id]);

  supplements.toggleSupplementTaken(created.id, '2026-01-01');
  assert.deepEqual(supplements.getTakenSupplementIds('2026-01-01'), []);
});

test('deleting a supplement tombstones it and its log history instead of removing them', () => {
  values.clear();
  const created = supplements.addSupplement({ name: 'Whey' });
  supplements.toggleSupplementTaken(created.id, '2026-01-01');

  supplements.deleteSupplement(created.id);

  assert.equal(supplements.getSupplements().length, 0);
  assert.deepEqual(supplements.getTakenSupplementIds('2026-01-01'), []);

  const rawSupplement = supplements.getAllSupplementsRaw().find((item) => item.id === created.id);
  assert.ok(rawSupplement.deletedAt, 'the supplement should stay in raw storage as a tombstone');
  const rawLogEntry = supplements.getAllSupplementLogRaw().find((entry) => entry.supplementId === created.id);
  assert.ok(rawLogEntry.deletedAt, 'its log entries should also be tombstoned so the deletion syncs');
});

test('an old-format supplement log ({ date: [ids] }) migrates transparently to per-entry records', () => {
  values.clear();
  const created = supplements.addSupplement({ name: 'Magnésium' });
  // Simulate a pre-M3 log written directly (bypassing toggleSupplementTaken).
  localStorage.setItem('muscu_supplement_log', JSON.stringify({ '2026-02-01': [created.id] }));

  assert.deepEqual(supplements.getTakenSupplementIds('2026-02-01'), [created.id]);
  const raw = supplements.getAllSupplementLogRaw();
  assert.equal(raw.length, 1);
  assert.equal(raw[0].logDate, '2026-02-01');
  assert.equal(raw[0].supplementId, created.id);
  assert.equal(raw[0].deletedAt, null);
});

test('replaceAllSupplementLogRaw merges a pull by last-write-wins per (date, supplement)', () => {
  values.clear();
  const created = supplements.addSupplement({ name: 'Zinc' });
  supplements.toggleSupplementTaken(created.id, '2026-03-01');

  const key = (entry) => `${entry.logDate}|${entry.supplementId}`;
  const remoteUntaken = { logDate: '2026-03-01', supplementId: created.id, updatedAt: '2999-01-01T00:00:00.000Z', deletedAt: '2999-01-01T00:00:00.000Z' };
  supplements.replaceAllSupplementLogRaw(mergeByKey(supplements.getAllSupplementLogRaw(), [remoteUntaken], key));

  assert.deepEqual(supplements.getTakenSupplementIds('2026-03-01'), []);
});

test('a supplement created before M3 (missing updatedAt/deletedAt) is backfilled on read', () => {
  values.clear();
  localStorage.setItem('muscu_supplements', JSON.stringify([{ id: 'sup_old', name: 'Ancien', dose: '', unit: '', createdAt: '2025-01-01' }]));

  const [item] = supplements.getSupplements();
  assert.equal(item.id, 'sup_old');
  assert.ok(item.updatedAt);
  assert.equal(item.deletedAt, null);
});
