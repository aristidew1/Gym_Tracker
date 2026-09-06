// services/entity-meta.js — shared helpers for the sync layer: timestamps and
// last-write-wins merge by key, reused by every entity's storage module and by
// services/sync-adapters.js.

export function nowIso() {
  return new Date().toISOString();
}

// Merges a remote pull's records into a local raw array by an arbitrary key:
// remote wins only if strictly newer than the local record it would replace,
// so a local edit made after the record was pushed (and before the pull
// response arrived) naturally survives and gets re-pushed on the next sync.
export function mergeByKey(localRaw, remoteRecords, keyFn) {
  const byKey = new Map(localRaw.map((record) => [keyFn(record), record]));
  for (const remote of remoteRecords) {
    const key = keyFn(remote);
    const local = byKey.get(key);
    if (!local || new Date(remote.updatedAt) > new Date(local.updatedAt)) {
      byKey.set(key, remote);
    }
  }
  return [...byKey.values()];
}

export function mergeById(localRaw, remoteRecords) {
  return mergeByKey(localRaw, remoteRecords, (record) => record.id);
}

// Union merge for insert-only, never-un-seen entities (seenFlags): a key
// already known locally is left untouched (its local seenAt, whichever it
// is, stays authoritative for this device) and a key only known remotely is
// simply added — there is no "wins" to compute, presence is all that matters.
export function mergeSeenByKey(localRaw, remoteRecords, keyFn) {
  const byKey = new Map(localRaw.map((record) => [keyFn(record), record]));
  for (const remote of remoteRecords) {
    const key = keyFn(remote);
    if (!byKey.has(key)) byKey.set(key, remote);
  }
  return [...byKey.values()];
}
