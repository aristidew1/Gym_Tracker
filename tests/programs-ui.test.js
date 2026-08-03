import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const listeners = new Map();
const container = {
  innerHTML: '',
  addEventListener(type, listener) { listeners.set(type, listener); },
  querySelectorAll() { return []; },
};
const classNames = new Set();
globalThis.document = {
  body: {
    classList: {
      add: (name) => classNames.add(name),
      remove: (name) => classNames.delete(name),
    },
    scrollTop: 0,
  },
  documentElement: { scrollTop: 0 },
  getElementById: (id) => id === 'programs-content' ? container : null,
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, scrollTo() {} };

const { initPrograms } = await import('../programs.js');

test('editing an existing program starts with compact disclosure controls', () => {
  initPrograms();
  listeners.get('click')({
    target: {
      closest: () => ({
        dataset: { action: 'edit', programId: 'pullup_deadlift_cycle' },
      }),
    },
  });

  assert.ok(classNames.has('program-editor-active'));
  assert.match(container.innerHTML, /data-action="editor-toggle-program-meta"/u);
  assert.match(container.innerHTML, /data-action="editor-toggle-session-settings"/u);
  assert.match(container.innerHTML, /data-action="editor-toggle-block"/u);
  assert.doesNotMatch(container.innerHTML, /data-item-field="sets"/u);
});
