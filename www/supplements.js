// Daily supplement tracking, kept separate from workout records.

import { formatLocalDate } from './services/date-utils.js';
import { nowIso } from './services/entity-meta.js';

const SUPPLEMENTS_KEY = 'muscu_supplements';
const SUPPLEMENT_LOG_KEY = 'muscu_supplement_log';

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function today() {
  return formatLocalDate();
}

function createId() {
  return `sup_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function emitChange() {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('supplements:changed'));
  }
}

// Soft-delete + updatedAt were retrofitted for sync (M3) after this store
// already shipped without them — an entry saved before that has neither, so
// backfill both once here (persisting the backfill) rather than on every read.
function readStoredSupplements() {
  const stored = read(SUPPLEMENTS_KEY, []);
  const validRaw = Array.isArray(stored) ? stored.filter((item) => item?.id && item?.name) : [];
  let changed = validRaw.length !== (Array.isArray(stored) ? stored.length : 0);
  const backfilled = validRaw.map((item) => {
    if (item.updatedAt && item.deletedAt !== undefined) return item;
    changed = true;
    return { ...item, updatedAt: item.updatedAt || nowIso(), deletedAt: item.deletedAt ?? null };
  });
  if (changed) localStorage.setItem(SUPPLEMENTS_KEY, JSON.stringify(backfilled));
  return backfilled;
}

function writeStoredSupplements(items) {
  localStorage.setItem(SUPPLEMENTS_KEY, JSON.stringify(items));
}

// Before M3, the log was `{ [date]: [supplementId, ...] }` with no way to
// tell when an entry was taken/untaken — needed to sync it. Migrates once, at
// the read boundary, into a flat array of per-(date, supplement) entries that
// each carry their own updatedAt/deletedAt, and persists the migrated shape.
function readStoredSupplementLog() {
  const stored = read(SUPPLEMENT_LOG_KEY, []);
  if (Array.isArray(stored)) {
    return stored.filter((entry) => (
      entry && typeof entry.logDate === 'string' && typeof entry.supplementId === 'string' && typeof entry.updatedAt === 'string'
    ));
  }
  if (stored && typeof stored === 'object') {
    const timestamp = nowIso();
    const migrated = [];
    Object.entries(stored).forEach(([logDate, supplementIds]) => {
      if (!Array.isArray(supplementIds)) return;
      supplementIds.forEach((supplementId) => {
        if (typeof supplementId === 'string') migrated.push({ logDate, supplementId, updatedAt: timestamp, deletedAt: null });
      });
    });
    localStorage.setItem(SUPPLEMENT_LOG_KEY, JSON.stringify(migrated));
    return migrated;
  }
  return [];
}

function writeStoredSupplementLog(entries) {
  localStorage.setItem(SUPPLEMENT_LOG_KEY, JSON.stringify(entries));
}

// Display-facing shape kept identical to before the M3 retrofit: taken
// supplement ids grouped by date, tombstones excluded.
function deriveSupplementLog(entries) {
  const log = {};
  entries.forEach((entry) => {
    if (entry.deletedAt) return;
    (log[entry.logDate] ||= []).push(entry.supplementId);
  });
  return log;
}

export function getSupplements() {
  return readStoredSupplements().filter((item) => !item.deletedAt);
}

// Unfiltered accessors (tombstones included) for the sync layer only.
export function getAllSupplementsRaw() {
  return readStoredSupplements();
}

export function getAllSupplementLogRaw() {
  return readStoredSupplementLog();
}

// Sync layer only: writes back merged raw arrays (pushed/pulled).
export function replaceAllSupplementsRaw(records) {
  if (!Array.isArray(records)) return;
  const valid = records.filter((item) => item?.id && item?.name && typeof item.updatedAt === 'string');
  writeStoredSupplements(valid);
  emitChange();
}

export function replaceAllSupplementLogRaw(records) {
  if (!Array.isArray(records)) return;
  const valid = records.filter((entry) => (
    entry && typeof entry.logDate === 'string' && typeof entry.supplementId === 'string' && typeof entry.updatedAt === 'string'
  ));
  writeStoredSupplementLog(valid);
  emitChange();
}

export function addSupplement({ name, dose = '', unit = '' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;
  const supplement = {
    id: createId(), name: cleanName, dose: String(dose || '').trim(), unit: String(unit || '').trim(),
    createdAt: today(), updatedAt: nowIso(), deletedAt: null,
  };
  writeStoredSupplements([...readStoredSupplements(), supplement]);
  emitChange();
  return supplement;
}

// Soft delete: the supplement and its log history stay in storage as
// tombstones so the deletion itself can be synced — see getSupplements()/
// getSupplementLog() (filter tombstones out) vs. the raw accessors above.
export function deleteSupplement(id) {
  const timestamp = nowIso();
  const supplements = readStoredSupplements();
  const index = supplements.findIndex((item) => item.id === id && !item.deletedAt);
  if (index === -1) return;
  supplements[index] = { ...supplements[index], deletedAt: timestamp, updatedAt: timestamp };
  writeStoredSupplements(supplements);

  const entries = readStoredSupplementLog().map((entry) => (
    entry.supplementId === id && !entry.deletedAt ? { ...entry, deletedAt: timestamp, updatedAt: timestamp } : entry
  ));
  writeStoredSupplementLog(entries);
  emitChange();
}

export function getSupplementLog() {
  return deriveSupplementLog(readStoredSupplementLog());
}

export function getTakenSupplementIds(date = today()) {
  const taken = getSupplementLog()[date];
  return Array.isArray(taken) ? taken : [];
}

export function toggleSupplementTaken(id, date = today()) {
  if (!getSupplements().some((item) => item.id === id)) return;
  const timestamp = nowIso();
  const entries = readStoredSupplementLog();
  const index = entries.findIndex((entry) => entry.logDate === date && entry.supplementId === id);
  if (index === -1) {
    entries.push({ logDate: date, supplementId: id, updatedAt: timestamp, deletedAt: null });
  } else if (entries[index].deletedAt) {
    entries[index] = { ...entries[index], updatedAt: timestamp, deletedAt: null };
  } else {
    entries[index] = { ...entries[index], updatedAt: timestamp, deletedAt: timestamp };
  }
  writeStoredSupplementLog(entries);
  emitChange();
}

export function getSupplementStatus(date = today()) {
  const supplements = getSupplements().filter((item) => !item.createdAt || item.createdAt <= date);
  if (supplements.length === 0) return null;
  const activeIds = new Set(supplements.map((item) => item.id));
  const count = getTakenSupplementIds(date).filter((id) => activeIds.has(id)).length;
  return { total: supplements.length, taken: count, complete: count === supplements.length };
}

export function getSupplementsBackup() {
  return { supplements: getSupplements(), supplementLog: getSupplementLog() };
}

export function restoreSupplementsBackup(data) {
  const supplements = Array.isArray(data?.supplements) ? data.supplements.filter((item) => item?.id && item?.name) : [];
  const supplementLog = data?.supplementLog && typeof data.supplementLog === 'object' && !Array.isArray(data.supplementLog) ? data.supplementLog : {};
  const timestamp = nowIso();
  writeStoredSupplements(supplements.map((item) => ({ ...item, updatedAt: item.updatedAt || timestamp, deletedAt: item.deletedAt ?? null })));

  const entries = [];
  Object.entries(supplementLog).forEach(([logDate, supplementIds]) => {
    if (!Array.isArray(supplementIds)) return;
    supplementIds.forEach((supplementId) => {
      if (typeof supplementId === 'string') entries.push({ logDate, supplementId, updatedAt: timestamp, deletedAt: null });
    });
  });
  writeStoredSupplementLog(entries);
  emitChange();
}
