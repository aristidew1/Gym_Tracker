import assert from 'node:assert/strict';
import test from 'node:test';

import { copyText } from '../services/clipboard.js';

test('copyText uses the asynchronous Clipboard API', async () => {
  let copied = '';
  const result = await copyText('prompt', {
    navigatorRef: { clipboard: { writeText: async (text) => { copied = text; } } },
    documentRef: null,
  });
  assert.equal(result, true);
  assert.equal(copied, 'prompt');
});

test('copyText falls back to a temporary textarea', async () => {
  let selected = false;
  let removed = false;
  const textarea = {
    value: '',
    style: {},
    setAttribute() {},
    select() { selected = true; },
    remove() { removed = true; },
  };
  const documentRef = {
    body: { appendChild(node) { assert.equal(node, textarea); } },
    createElement: () => textarea,
    execCommand: (command) => command === 'copy',
  };
  const result = await copyText('fallback', {
    navigatorRef: { clipboard: { writeText: async () => { throw new Error('denied'); } } },
    documentRef,
  });
  assert.equal(result, true);
  assert.equal(textarea.value, 'fallback');
  assert.equal(selected, true);
  assert.equal(removed, true);
});

test('copyText reports failure when neither copy mechanism is available', async () => {
  const result = await copyText('prompt', { navigatorRef: {}, documentRef: null });
  assert.equal(result, false);
});
