// services/sync-adapters.js — applies a /sync pull response into localStorage,
// and builds the push payload from local raw state. Kept separate from
// services/sync.js (network/orchestration) so the merge rules are easy to
// test in isolation.

import { DEFAULT_PROGRAM } from '../data/default-program.js';
import { getAllWorkoutsRaw, replaceAllWorkoutsRaw } from '../storage.js';
import { appendPrograms, clearAllProgramsRaw, getAllProgramsRaw, replaceAllProgramsRaw } from './program-storage.js';
import { getAllCustomExercisesRaw, replaceAllCustomExercisesRaw } from './custom-exercises.js';
import {
  getAllSupplementLogRaw,
  getAllSupplementsRaw,
  replaceAllSupplementLogRaw,
  replaceAllSupplementsRaw,
} from '../supplements.js';
import { getAllSettingsRaw, applySettingsPull, clearSyncedSettings } from './settings-sync.js';
import { getAllSeenTipsRaw, mergeSeenTipsRaw, resetSeenTips } from '../coachmark.js';
import { getAllSeenProgramNotesRaw, mergeSeenProgramNotesRaw, clearSeenProgramNotes } from './program-notes.js';
import { mergeByKey, mergeById } from './entity-meta.js';

// Every program id is a per-device crypto.randomUUID() *except* the one
// built-in program, which shares the same fixed id (DEFAULT_PROGRAM.id) on
// every install. Two independently-created programs colliding on a random id
// is practically impossible, but two devices customizing the *built-in*
// program differently before their first sync is the realistic case — and
// its updatedAt (backfilled at migration time, not real edit history, see
// models/workout-schema.js) can't be trusted to pick a winner. So: plain
// last-write-wins for ordinary programs, but never silently overwrite the
// built-in program on conflicting content — import the pulled version as a
// new program instead, using the existing dedupe-by-name logic.
function applyProgramsPull(remoteRecords) {
  if (remoteRecords.length === 0) return;
  const local = getAllProgramsRaw();
  const localById = new Map(local.map((program) => [program.id, program]));
  const toMerge = [];
  const toAppend = [];

  for (const remote of remoteRecords) {
    // remote.data is already the full raw program record (it's what the
    // client sent as-is when it was pushed — see toPushRecord below), so no
    // reshaping is needed here, just deciding merge vs. append.
    const data = remote.data;
    const existing = localById.get(remote.id);
    const isConflictingBaseProgram = remote.id === DEFAULT_PROGRAM.id
      && existing
      && JSON.stringify(existing) !== JSON.stringify(data);
    if (isConflictingBaseProgram) {
      toAppend.push(data);
    } else {
      toMerge.push(data);
    }
  }

  if (toMerge.length > 0) replaceAllProgramsRaw(mergeById(local, toMerge));
  if (toAppend.length > 0) appendPrograms(toAppend);
}

function applyWorkoutsPull(remoteRecords) {
  if (remoteRecords.length === 0) return;
  const local = getAllWorkoutsRaw();
  const remoteRaw = remoteRecords.map((record) => record.data);
  replaceAllWorkoutsRaw(mergeById(local, remoteRaw));
}

function applyCustomExercisesPull(remoteRecords) {
  if (remoteRecords.length === 0) return;
  const local = getAllCustomExercisesRaw();
  replaceAllCustomExercisesRaw(mergeById(local, remoteRecords));
}

function applySupplementsPull(remoteRecords) {
  if (remoteRecords.length === 0) return;
  const local = getAllSupplementsRaw();
  replaceAllSupplementsRaw(mergeById(local, remoteRecords));
}

const supplementLogKey = (entry) => `${entry.logDate}|${entry.supplementId}`;

function applySupplementLogPull(remoteRecords) {
  if (remoteRecords.length === 0) return;
  const local = getAllSupplementLogRaw();
  replaceAllSupplementLogRaw(mergeByKey(local, remoteRecords, supplementLogKey));
}

export function applyPull(changes) {
  applyWorkoutsPull(changes?.workouts || []);
  applyProgramsPull(changes?.programs || []);
  applyCustomExercisesPull(changes?.customExercises || []);
  applySupplementsPull(changes?.supplements || []);
  applySupplementLogPull(changes?.supplementLog || []);
  applySettingsPull(changes?.settings || []);
  const seenFlags = changes?.seenFlags || [];
  mergeSeenTipsRaw(seenFlags.filter((flag) => flag.flagType === 'coachmark'));
  mergeSeenProgramNotesRaw(seenFlags.filter((flag) => flag.flagType === 'program_note'));
}

// Wipes every synced entity off this device, used only when a *different*
// account signs in (see services/sync.js). Without it, the previous account's
// records would stay visible to the new one and — since a fresh cursor makes
// the next push send everything local — would be uploaded into their account.
// Everything removed here has already been synced to the account it belongs
// to, so it survives there; the confirmation prompt in app.js says so before
// this runs. Device-local state (the in-progress workout draft, export
// bookkeeping) is deliberately left alone: it belongs to the device, not to
// an account.
export function clearLocalDataForAccountSwitch() {
  replaceAllWorkoutsRaw([]);
  clearAllProgramsRaw();
  replaceAllCustomExercisesRaw([]);
  replaceAllSupplementsRaw([]);
  replaceAllSupplementLogRaw([]);
  clearSyncedSettings();
  resetSeenTips();
  clearSeenProgramNotes();
}

function toPushRecord(raw) {
  return { id: raw.id, data: raw, updatedAt: raw.updatedAt, deletedAt: raw.deletedAt ?? null };
}

export function buildPushPayload(since) {
  const cutoff = since ? new Date(since) : null;
  const changedSince = (raw) => !cutoff || new Date(raw.updatedAt) > cutoff;

  return {
    workouts: getAllWorkoutsRaw().filter(changedSince).map(toPushRecord),
    programs: getAllProgramsRaw().filter(changedSince).map(toPushRecord),
    customExercises: getAllCustomExercisesRaw().filter(changedSince),
    supplements: getAllSupplementsRaw().filter(changedSince),
    supplementLog: getAllSupplementLogRaw().filter(changedSince),
    settings: getAllSettingsRaw().filter(changedSince),
    seenFlags: [...getAllSeenTipsRaw(), ...getAllSeenProgramNotesRaw()]
      .filter((flag) => !cutoff || new Date(flag.seenAt) > cutoff),
  };
}
