import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const { hasSeenProgramNote, markProgramNoteSeen, getAllSeenProgramNotesRaw, mergeSeenProgramNotesRaw } = await import('../services/program-notes.js');

test('markProgramNoteSeen and getAllSeenProgramNotesRaw expose seen notes as timestamped sync rows', () => {
  values.clear();
  const noteKey = 'press_main::Monte lentement';
  assert.equal(hasSeenProgramNote(noteKey), false);

  markProgramNoteSeen(noteKey);
  assert.equal(hasSeenProgramNote(noteKey), true);

  const raw = getAllSeenProgramNotesRaw();
  assert.deepEqual(raw.map((row) => row.flagId), [noteKey]);
  assert.equal(raw[0].flagType, 'program_note');
});

test('mergeSeenProgramNotesRaw unions a pull in without overwriting an already-known note', () => {
  values.clear();
  markProgramNoteSeen('local::note');
  const localSeenAt = getAllSeenProgramNotesRaw().find((row) => row.flagId === 'local::note').seenAt;

  mergeSeenProgramNotesRaw([
    { flagType: 'program_note', flagId: 'local::note', seenAt: '2000-01-01T00:00:00.000Z' },
    { flagType: 'program_note', flagId: 'remote::note', seenAt: '2026-01-01T00:00:00.000Z' },
  ]);

  assert.equal(hasSeenProgramNote('remote::note'), true);
  assert.equal(getAllSeenProgramNotesRaw().find((row) => row.flagId === 'local::note').seenAt, localSeenAt);
});
