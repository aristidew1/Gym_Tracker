import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const { hasSeenTip, markAllTipsSeen, resetSeenTips, getAllSeenTipsRaw, mergeSeenTipsRaw } = await import('../coachmark.js');

test('markAllTipsSeen and getAllSeenTipsRaw expose seen tips as timestamped sync rows', () => {
  values.clear();
  assert.equal(hasSeenTip('tip_a'), false);

  markAllTipsSeen(['tip_a', 'tip_b']);
  assert.equal(hasSeenTip('tip_a'), true);
  assert.equal(hasSeenTip('tip_b'), true);

  const raw = getAllSeenTipsRaw();
  assert.equal(raw.length, 2);
  assert.ok(raw.every((row) => row.flagType === 'coachmark' && row.seenAt));

  // Marking an already-seen tip again must not disturb its recorded seenAt.
  const firstSeenAt = getAllSeenTipsRaw().find((row) => row.flagId === 'tip_a').seenAt;
  markAllTipsSeen(['tip_a']);
  assert.equal(getAllSeenTipsRaw().find((row) => row.flagId === 'tip_a').seenAt, firstSeenAt);

  resetSeenTips();
  assert.equal(hasSeenTip('tip_a'), false);
  assert.equal(getAllSeenTipsRaw().length, 0);
});

test('mergeSeenTipsRaw unions a pull in without overwriting an already-known tip', () => {
  values.clear();
  markAllTipsSeen(['tip_local']);
  const localSeenAt = getAllSeenTipsRaw().find((row) => row.flagId === 'tip_local').seenAt;

  mergeSeenTipsRaw([
    { flagType: 'coachmark', flagId: 'tip_local', seenAt: '2000-01-01T00:00:00.000Z' },
    { flagType: 'coachmark', flagId: 'tip_remote', seenAt: '2026-01-01T00:00:00.000Z' },
  ]);

  assert.equal(hasSeenTip('tip_remote'), true);
  // A tip already seen locally keeps its own seenAt — a flag never needs to
  // "win" a conflict, presence is all that matters.
  assert.equal(getAllSeenTipsRaw().find((row) => row.flagId === 'tip_local').seenAt, localSeenAt);
});
