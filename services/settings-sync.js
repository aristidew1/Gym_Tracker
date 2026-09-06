// services/settings-sync.js — bridges a fixed set of scattered
// localStorage-backed preferences into the /sync "settings" entity without
// each call site needing to know sync exists. installSettingsSyncBridge()
// wraps localStorage.setItem once, at app startup, to timestamp writes to
// the tracked keys below; every existing getter/setter (app.js's
// theme/style/accessibility/onboarding, i18n.js's language,
// notifications.js's toggles) keeps reading and writing its own key exactly
// as before — this module never owns the values themselves.
//
// Deliberately excludes device-local bookkeeping that shouldn't follow the
// user across devices: export-reminder timers, and the one-time "tips
// bootstrapped" migration flag.

import { nowIso } from './entity-meta.js';

const META_KEY = 'muscu_settings_meta';
const TRACKED_KEYS = [
  'muscu_theme',
  'muscu_visual_style',
  'muscu_accessibility',
  'muscu_language',
  'muscu_onboarding_completed',
  'muscu_notif_enabled',
  'muscu_rest_timer_notif_enabled',
];

// Captured at import time, before installSettingsSyncBridge() ever patches
// localStorage.setItem — this is always the real, unwrapped write.
const originalSetItem = typeof localStorage !== 'undefined' ? localStorage.setItem.bind(localStorage) : () => {};

function readMeta() {
  try {
    const value = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeMeta(meta) {
  originalSetItem(META_KEY, JSON.stringify(meta));
}

function emitChange() {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('settings:changed'));
  }
}

let patched = false;

export function installSettingsSyncBridge() {
  if (patched || typeof localStorage === 'undefined') return;
  patched = true;
  localStorage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (!TRACKED_KEYS.includes(key)) return;
    const meta = readMeta();
    meta[key] = nowIso();
    writeMeta(meta);
    emitChange();
  };
}

function parseValue(rawValue) {
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue; // plain strings like theme's "dark" aren't valid JSON
  }
}

function serializeValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Sync layer only: every tracked key currently set, as { key, value,
// updatedAt } rows. A key with a value but no recorded updatedAt (set before
// this bridge was installed) is backfilled once here — like the built-in
// program's migration-backfilled updatedAt, this is a fabricated timestamp,
// not real edit history, but it only needs to be "older than a real future
// edit", which backfilling at read time satisfies.
export function getAllSettingsRaw() {
  const meta = readMeta();
  let metaChanged = false;
  const rows = [];
  for (const storageKey of TRACKED_KEYS) {
    const rawValue = localStorage.getItem(storageKey);
    if (rawValue === null || rawValue === undefined) continue;
    if (!meta[storageKey]) {
      meta[storageKey] = nowIso();
      metaChanged = true;
    }
    rows.push({ key: storageKey, value: parseValue(rawValue), updatedAt: meta[storageKey] });
  }
  if (metaChanged) writeMeta(meta);
  return rows;
}

// Sync layer only: applies pulled { key, value, updatedAt } rows straight
// through the captured original setItem (bypassing the bridge above) so
// applying a pull records the remote updatedAt, not "now" — and only if it's
// actually newer than what this device already has recorded.
export function applySettingsPull(remoteRecords) {
  if (!Array.isArray(remoteRecords) || remoteRecords.length === 0) return;
  const meta = readMeta();
  let changed = false;
  for (const record of remoteRecords) {
    if (!TRACKED_KEYS.includes(record.key)) continue;
    const local = meta[record.key];
    if (local && new Date(local) >= new Date(record.updatedAt)) continue;
    originalSetItem(record.key, serializeValue(record.value));
    meta[record.key] = record.updatedAt;
    changed = true;
  }
  if (changed) writeMeta(meta);
}
