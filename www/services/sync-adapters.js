// services/sync-adapters.js — applies a /sync pull response into localStorage,
// and builds the push payload from local raw state. Kept separate from
// services/sync.js (network/orchestration) so the merge rules are easy to
// test in isolation.

import { DEFAULT_PROGRAM } from '../data/default-program.js';
import { getAllWorkoutsRaw, replaceAllWorkoutsRaw } from '../storage.js';
import { appendPrograms, getAllProgramsRaw, replaceAllProgramsRaw } from './program-storage.js';
import { mergeById } from './entity-meta.js';

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

export function applyPull(changes) {
  applyWorkoutsPull(changes?.workouts || []);
  applyProgramsPull(changes?.programs || []);
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
  };
}
