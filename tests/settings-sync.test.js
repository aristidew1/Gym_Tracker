import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const { installSettingsSyncBridge, getAllSettingsRaw, applySettingsPull } = await import('../services/settings-sync.js');

test('a tracked key written before the bridge is installed is backfilled with a stable updatedAt', () => {
  values.clear();
  localStorage.setItem('muscu_theme', 'light');

  const first = getAllSettingsRaw().find((row) => row.key === 'muscu_theme');
  assert.equal(first.value, 'light');
  assert.ok(first.updatedAt);

  // Reading again must not keep bumping the backfilled timestamp forward —
  // otherwise this key would get pushed on every single sync forever.
  const second = getAllSettingsRaw().find((row) => row.key === 'muscu_theme');
  assert.equal(second.updatedAt, first.updatedAt);
});

test('installSettingsSyncBridge timestamps writes to tracked keys without changing how they read back', () => {
  values.clear();
  installSettingsSyncBridge();

  localStorage.setItem('muscu_theme', 'dark');
  assert.equal(localStorage.getItem('muscu_theme'), 'dark');

  localStorage.setItem('muscu_accessibility', JSON.stringify({ textSize: 'large' }));
  const rows = getAllSettingsRaw();
  const accessibility = rows.find((row) => row.key === 'muscu_accessibility');
  assert.deepEqual(accessibility.value, { textSize: 'large' });

  // An untracked key is written through untouched and never shows up as a
  // sync row.
  localStorage.setItem('muscu_last_export_at', '2026-01-01T00:00:00.000Z');
  assert.equal(rows.some((row) => row.key === 'muscu_last_export_at'), false);
});

test('applySettingsPull only applies a remote row newer than what is already recorded', () => {
  values.clear();
  installSettingsSyncBridge();
  localStorage.setItem('muscu_theme', 'dark');
  const localUpdatedAt = getAllSettingsRaw().find((row) => row.key === 'muscu_theme').updatedAt;

  applySettingsPull([{ key: 'muscu_theme', value: 'light', updatedAt: '2000-01-01T00:00:00.000Z' }]);
  assert.equal(localStorage.getItem('muscu_theme'), 'dark', 'a stale remote value must not overwrite a newer local one');

  applySettingsPull([{ key: 'muscu_theme', value: 'light', updatedAt: '2999-01-01T00:00:00.000Z' }]);
  assert.equal(localStorage.getItem('muscu_theme'), 'light', 'a genuinely newer remote value should be applied');
  assert.notEqual(getAllSettingsRaw().find((row) => row.key === 'muscu_theme').updatedAt, localUpdatedAt);
});
