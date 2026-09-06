// services/sync.js — orchestrates push/pull with the sync server: when it
// runs, concurrency, retry, and status reporting. The actual merge rules live
// in services/sync-adapters.js; this file is plumbing only.

import { apiFetch, getToken, onAuthChange } from './auth.js';
import { applyPull, buildPushPayload, clearLocalDataForAccountSwitch } from './sync-adapters.js';

const CURSOR_KEY = 'muscu_sync_last_synced_at';
// Which account the local data belongs to. Signing out deliberately leaves
// both the data and the cursor in place (so signing back in is instant and
// offline edits survive), which means the *next* sign-in has to prove it's
// the same account — otherwise the previous user's records stay visible and,
// worse, get pushed into the newcomer's account on the next full push.
const ACCOUNT_ID_KEY = 'muscu_sync_account_id';
const ACCOUNT_EMAIL_KEY = 'muscu_sync_account_email';
const FOREGROUND_SYNC_MIN_INTERVAL_MS = 60_000;
const CHANGE_DEBOUNCE_MS = 4000;
const RETRY_DELAY_MS = 30_000;

let status = 'idle'; // 'idle' | 'syncing' | 'error' | 'expired'
let lastSyncedAt = null;
let inFlight = null;
let debounceTimer = null;
let stopped = false;
// Set while a different account has signed in and the user hasn't yet agreed
// to wipe the previous one's data — syncing stays blocked until then, so
// nothing of either account leaks into the other.
let pendingAccountSwitch = null;
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

function rememberAccount(user) {
  if (!user?.id) return;
  localStorage.setItem(ACCOUNT_ID_KEY, user.id);
  if (user.email) localStorage.setItem(ACCOUNT_EMAIL_KEY, user.email);
}

// null when this device has never synced (a first sign-in, where merging the
// local data into the account is exactly what the user wants).
function getStoredAccount() {
  const id = localStorage.getItem(ACCOUNT_ID_KEY);
  return id ? { id, email: localStorage.getItem(ACCOUNT_EMAIL_KEY) || '' } : null;
}

// Called once the user has confirmed the switch (app.js owns the prompt —
// this module has no UI). Everything the old account owned goes, including
// the cursor: the new account then pulls its *whole* history rather than
// only what changed since a cursor that belonged to someone else.
export function acceptAccountSwitch(user) {
  clearLocalDataForAccountSwitch();
  setCursor(null);
  localStorage.removeItem(ACCOUNT_ID_KEY);
  localStorage.removeItem(ACCOUNT_EMAIL_KEY);
  rememberAccount(user);
  pendingAccountSwitch = null;
  stopped = false;
  return requestSync();
}

export function getPendingAccountSwitch() {
  return pendingAccountSwitch;
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
  if (stopped || !getToken() || pendingAccountSwitch) return Promise.resolve();
  if (inFlight) return inFlight;

  setStatus('syncing');
  inFlight = runSync()
    .then(() => {
      setStatus('idle');
    })
    .catch((error) => {
      console.warn('[Sync] failed:', error);
      if (error?.status === 401) {
        // No retry will happen until the next sign-in, so the UI must not claim one is coming.
        stopped = true; // resumes on the next sign-in, see onAuthChange below
        setStatus('expired');
      } else {
        setStatus('error');
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
  onAuthChange(({ token, user }) => {
    if (!token) {
      // Signing out clears any unresolved switch, so declining one and coming
      // back as the original account isn't left permanently blocked.
      pendingAccountSwitch = null;
      return;
    }
    stopped = false;
    const stored = getStoredAccount();
    if (stored && user?.id && stored.id !== user.id) {
      // Block every sync path until app.js has asked the user what to do —
      // acceptAccountSwitch() wipes and resumes, signing out clears it.
      pendingAccountSwitch = { previous: stored, next: { id: user.id, email: user.email || '' } };
      window.dispatchEvent(new CustomEvent('sync:account-switch', { detail: pendingAccountSwitch }));
      return;
    }
    pendingAccountSwitch = null;
    rememberAccount(user);
    requestSync();
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

  // No startup sync here on purpose: initAuth() always ends by notifying its
  // listeners (restored session, no session, or callback), so the handler
  // above runs either way — and it is the only path that checks the signed-in
  // account against the data already on this device.
}
