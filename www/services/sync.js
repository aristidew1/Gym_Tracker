// services/sync.js — orchestrates push/pull with the sync server: when it
// runs, concurrency, retry, and status reporting. The actual merge rules live
// in services/sync-adapters.js; this file is plumbing only.

import { apiFetch, getToken, onAuthChange } from './auth.js';
import { applyPull, buildPushPayload } from './sync-adapters.js';

const CURSOR_KEY = 'muscu_sync_last_synced_at';
const FOREGROUND_SYNC_MIN_INTERVAL_MS = 60_000;
const CHANGE_DEBOUNCE_MS = 4000;
const RETRY_DELAY_MS = 30_000;

let status = 'idle'; // 'idle' | 'syncing' | 'error'
let lastSyncedAt = null;
let inFlight = null;
let debounceTimer = null;
let stopped = false;
const listeners = new Set();

function getCursor() {
  return localStorage.getItem(CURSOR_KEY);
}

function setCursor(value) {
  if (value) localStorage.setItem(CURSOR_KEY, value);
  else localStorage.removeItem(CURSOR_KEY);
}

function setStatus(next) {
  status = next;
  listeners.forEach((cb) => {
    try { cb(getSyncStatus()); } catch (error) { console.warn('[Sync] listener failed:', error); }
  });
}

export function getSyncStatus() {
  return { status, lastSyncedAt };
}

export function onSyncStatusChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

async function runSync() {
  const since = getCursor();
  const changes = buildPushPayload(since);
  const response = await apiFetch('/sync', { method: 'POST', body: { since, changes } });
  applyPull(response.changes);
  lastSyncedAt = response.syncedAt;
  setCursor(response.syncedAt);
}

export function requestSync() {
  if (stopped || !getToken()) return Promise.resolve();
  if (inFlight) return inFlight;

  setStatus('syncing');
  inFlight = runSync()
    .then(() => {
      setStatus('idle');
    })
    .catch((error) => {
      console.warn('[Sync] failed:', error);
      setStatus('error');
      if (error?.status === 401) {
        stopped = true; // resumes on the next sign-in, see onAuthChange below
      } else {
        setTimeout(() => { stopped = false; requestSync(); }, RETRY_DELAY_MS);
      }
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function syncNow() {
  return requestSync();
}

function scheduleDebouncedSync() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(requestSync, CHANGE_DEBOUNCE_MS);
}

let lastForegroundSyncAt = 0;
function syncOnForeground() {
  const now = Date.now();
  if (now - lastForegroundSyncAt < FOREGROUND_SYNC_MIN_INTERVAL_MS) return;
  lastForegroundSyncAt = now;
  requestSync();
}

export function initSync() {
  onAuthChange(({ token }) => {
    if (token) {
      stopped = false;
      requestSync();
    }
  });

  window.addEventListener('workouts:changed', scheduleDebouncedSync);
  window.addEventListener('program:changed', scheduleDebouncedSync);
  window.addEventListener('customExercises:changed', scheduleDebouncedSync);
  window.addEventListener('supplements:changed', scheduleDebouncedSync);
  window.addEventListener('settings:changed', scheduleDebouncedSync);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncOnForeground();
  });

  if (window.Capacitor?.isNativePlatform()) {
    window.Capacitor.Plugins.App?.addListener('resume', syncOnForeground);
  }

  if (getToken()) requestSync();
}
