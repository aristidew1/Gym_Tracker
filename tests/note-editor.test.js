import assert from 'node:assert/strict';
import test from 'node:test';

import { insertNotePrompt } from '../services/note-editor.js';

test('a note prompt starts on a new line and places the cursor after its label', () => {
  const result = insertNotePrompt('Bonne amplitude', 'Douleur : ', 15, 15, 500);
  assert.equal(result.value, 'Bonne amplitude\nDouleur : ');
  assert.equal(result.cursor, result.value.length);
});

test('a note prompt replaces the current selection without exceeding the limit', () => {
  const result = insertNotePrompt('Technique moyenne', 'Technique : ', 0, 17, 12);
  assert.equal(result.value, 'Technique : ');
  assert.equal(result.cursor, 12);
});
