import assert from 'node:assert/strict';
import test from 'node:test';

import { formatLocalDate, localDateToDayNumber, parseLocalDate } from '../services/date-utils.js';

test('calendar dates preserve their local calendar day', () => {
  const date = parseLocalDate('2026-01-31');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 31);
  assert.equal(formatLocalDate(date), '2026-01-31');
  assert.equal(localDateToDayNumber('2026-02-01') - localDateToDayNumber('2026-01-31'), 1);
});
