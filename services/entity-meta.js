// services/entity-meta.js — shared helpers for the sync layer: timestamps and
// last-write-wins merge by id, reused by every entity's storage module and by
// services/sync-adapters.js.

export function nowIso() {
  return new Date().toISOString();
}

// Merges a remote pull's records into a local raw array by id: remote wins
// only if strictly newer than the local record it would replace, so a local
// edit made after the record was pushed (and before the pull response
// arrived) naturally survives and gets re-pushed on the next sync.
export function mergeById(localRaw, remoteRecords) {
  const byId = new Map(localRaw.map((record) => [record.id, record]));
  for (const remote of remoteRecords) {
    const local = byId.get(remote.id);
    if (!local || new Date(remote.updatedAt) > new Date(local.updatedAt)) {
      byId.set(remote.id, remote);
    }
  }
  return [...byId.values()];
}
