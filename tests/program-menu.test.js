import assert from 'node:assert/strict';
import test from 'node:test';

const { getProgramMenuPlacement } = await import('../programs.js');

test('the program menu opens upward near the bottom of the viewport', () => {
  assert.equal(getProgramMenuPlacement({ menuHeight: 240, spaceAbove: 500, spaceBelow: 80 }), 'up');
});

test('the program menu keeps opening downward when it fits', () => {
  assert.equal(getProgramMenuPlacement({ menuHeight: 240, spaceAbove: 120, spaceBelow: 300 }), 'down');
});
