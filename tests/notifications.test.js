import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
};

const { getWeeklyRecommendation } = await import('../notifications.js');

test('weekly notification recommendations follow the calendar-week target', () => {
  const workouts = [
    { date: '2026-08-17' },
    { date: '2026-08-19' },
  ];

  assert.deepEqual(
    getWeeklyRecommendation(workouts, 3, new Date(2026, 7, 20)),
    { completedToday: false, dueToday: false, daysUntilNext: 1 }
  );
  assert.deepEqual(
    getWeeklyRecommendation(workouts, 3, new Date(2026, 7, 21)),
    { completedToday: false, dueToday: true, daysUntilNext: 0 }
  );
});

test('a completed weekly target waits until the next Monday', () => {
  const workouts = [
    { date: '2026-08-17' },
    { date: '2026-08-19' },
    { date: '2026-08-21' },
  ];
  assert.deepEqual(
    getWeeklyRecommendation(workouts, 3, new Date(2026, 7, 21)),
    { completedToday: true, dueToday: false, daysUntilNext: 3 }
  );
});
