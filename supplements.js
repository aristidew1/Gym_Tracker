// Daily supplement tracking, kept separate from workout records.

import { formatLocalDate } from './services/date-utils.js';

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

export function getSupplements() {
  const supplements = read(SUPPLEMENTS_KEY, []);
  return Array.isArray(supplements) ? supplements.filter((item) => item?.id && item?.name) : [];
}

export function addSupplement({ name, dose = '', unit = '' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;
  const supplement = { id: createId(), name: cleanName, dose: String(dose || '').trim(), unit: String(unit || '').trim(), createdAt: today() };
  localStorage.setItem(SUPPLEMENTS_KEY, JSON.stringify([...getSupplements(), supplement]));
  return supplement;
}

export function deleteSupplement(id) {
  localStorage.setItem(SUPPLEMENTS_KEY, JSON.stringify(getSupplements().filter((item) => item.id !== id)));
  const log = getSupplementLog();
  Object.keys(log).forEach((date) => {
    log[date] = log[date].filter((supplementId) => supplementId !== id);
    if (log[date].length === 0) delete log[date];
  });
  localStorage.setItem(SUPPLEMENT_LOG_KEY, JSON.stringify(log));
}

export function getSupplementLog() {
  const log = read(SUPPLEMENT_LOG_KEY, {});
  return log && typeof log === 'object' && !Array.isArray(log) ? log : {};
}

export function getTakenSupplementIds(date = today()) {
  const taken = getSupplementLog()[date];
  return Array.isArray(taken) ? taken : [];
}

export function toggleSupplementTaken(id, date = today()) {
  if (!getSupplements().some((item) => item.id === id)) return;
  const log = getSupplementLog();
  const taken = new Set(Array.isArray(log[date]) ? log[date] : []);
  if (taken.has(id)) taken.delete(id); else taken.add(id);
  if (taken.size === 0) delete log[date]; else log[date] = [...taken];
  localStorage.setItem(SUPPLEMENT_LOG_KEY, JSON.stringify(log));
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
  localStorage.setItem(SUPPLEMENTS_KEY, JSON.stringify(supplements));
  localStorage.setItem(SUPPLEMENT_LOG_KEY, JSON.stringify(supplementLog));
}
