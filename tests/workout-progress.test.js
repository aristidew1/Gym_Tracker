import assert from 'node:assert/strict';
import test from 'node:test';

import { getExerciseCompletionState, getWorkoutCompletionProgress } from '../services/workout-progress.js';

const session = {
  blocks: [{ items: [
    { id: 'first' },
    { id: 'second' },
    { id: 'choice', selection: { required: true } },
  ] }],
};

test('workout progress counts only fully completed visible exercises', () => {
  const progress = getWorkoutCompletionProgress(session, {
    first: [{ done: true, segments: [] }],
    second: [{ done: true, segments: [{ done: false }] }],
  });
  assert.deepEqual(progress, { completed: 1, skipped: 0, incomplete: 1, total: 2 });
});

test('a resolved exercise choice joins workout progress', () => {
  const progress = getWorkoutCompletionProgress(session, {}, { choice: 'selected' });
  assert.deepEqual(progress, { completed: 0, skipped: 0, incomplete: 3, total: 3 });
});

test('exercise progress counts a drop set only after every segment is complete', () => {
  assert.deepEqual(getExerciseCompletionState([
    { done: true, segments: [{ done: true }] },
    { done: true, segments: [{ done: false }] },
    { done: false, segments: [] },
  ]), { completedSets: 1, totalSets: 3, skipped: false, completed: false });
});

test('an explicitly emptied exercise is counted as skipped', () => {
  const progress = getWorkoutCompletionProgress(session, { first: [], second: [] });
  assert.deepEqual(progress, { completed: 0, skipped: 2, incomplete: 0, total: 2 });
});
