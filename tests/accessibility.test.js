import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../index.css', import.meta.url), 'utf8');

test('accessibility controls persist their changes', () => {
  assert.match(appSource, /settings-text-size[\s\S]*addEventListener\('change'/);
  assert.match(appSource, /bindAccessibilityToggle\('btn-high-contrast-toggle', 'highContrast'\)/);
  assert.match(appSource, /bindAccessibilityToggle\('btn-reduce-motion-toggle', 'reducedMotion'\)/);
  assert.match(appSource, /bindAccessibilityToggle\('btn-haptics-toggle', 'haptics'\)/);
  assert.match(appSource, /bindAccessibilityToggle\('btn-wake-lock-toggle', 'keepScreenAwake'\)/);
  assert.match(appSource, /setAttribute\('aria-pressed', String\(active\)\)/);
});

test('accessibility preferences have visible effects', () => {
  assert.match(cssSource, /:root\[data-text-size="large"\]/);
  assert.match(cssSource, /:root\[data-text-size="xlarge"\]/);
  assert.match(cssSource, /:root\.high-contrast/);
  assert.match(cssSource, /:root\.reduce-motion/);
  assert.match(appSource, /navigator\.wakeLock\?\.request/);
});
