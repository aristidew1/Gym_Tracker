// Tracks which per-program "notes" the user has already dismissed, so the
// same note doesn't reappear every time its program is opened. Pulled out of
// app.js (which has no exports) so the sync layer can reach it the same way
// it reaches coachmark.js's seen-tips store.

import { nowIso } from './entity-meta.js';

const SEEN_KEY = 'muscu_seen_program_notes';
const FLAG_TYPE = 'program_note';

// Stored as { [noteKey]: seenAtIso } — sync (M3) needs a per-flag timestamp
// (see getAllSeenProgramNotesRaw/mergeSeenProgramNotesRaw below).
function getSeenMap() {
  try {
    const value = JSON.parse(localStorage.getItem(SEEN_KEY));
    if (Array.isArray(value)) return {}; // pre-M3 shape: no timestamps to recover, start fresh
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveSeenMap(seen) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}

export function hasSeenProgramNote(noteKey) {
  return noteKey in getSeenMap();
}

export function markProgramNoteSeen(noteKey) {
  const seen = getSeenMap();
  if (noteKey in seen) return;
  saveSeenMap({ ...seen, [noteKey]: nowIso() });
}

// Sync layer only: drops every seen note when a different account signs in
// on this device — see services/sync-adapters.js.
export function clearSeenProgramNotes() {
  localStorage.removeItem(SEEN_KEY);
}

// Sync layer only: this flagType's rows as { flagType, flagId, seenAt }.
export function getAllSeenProgramNotesRaw() {
  return Object.entries(getSeenMap()).map(([flagId, seenAt]) => ({ flagType: FLAG_TYPE, flagId, seenAt }));
}

// Sync layer only: union-merges pulled { flagId, seenAt } rows into local
// storage — a locally-unknown key is added, an already-known one is untouched.
export function mergeSeenProgramNotesRaw(remoteEntries) {
  if (!Array.isArray(remoteEntries) || remoteEntries.length === 0) return;
  const seen = getSeenMap();
  const next = { ...seen };
  for (const entry of remoteEntries) {
    if (entry?.flagId && !(entry.flagId in next)) next[entry.flagId] = entry.seenAt;
  }
  saveSeenMap(next);
}
