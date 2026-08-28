import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeHtml } from '../services/html.js';

test('user-provided HTML is escaped before template rendering', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
});
