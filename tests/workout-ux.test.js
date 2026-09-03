import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const patchSource = await readFile(new URL('../active-workout-patch.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../i18n.js', import.meta.url), 'utf8');

test('rest starts compact and fullscreen remains optional', () => {
  assert.match(patchSource, /if \(running && !wasRunning\) setTimerFullscreen\(false\)/);
  assert.doesNotMatch(patchSource, /if \(running && !wasRunning\) setTimerFullscreen\(true\)/);
  assert.match(patchSource, /html\.rest-timer-running \.btn-rest-timer[\s\S]*display: none/);
  assert.match(patchSource, /button\.textContent = '⛶'/);
});

test('workout edit and discard actions live in a labelled secondary menu', () => {
  assert.match(htmlSource, /id="btn-workout-more"[\s\S]*aria-haspopup="menu"/);
  assert.match(htmlSource, /id="workout-actions-menu" role="menu" hidden/);
  assert.match(htmlSource, /id="btn-workout-edit"[\s\S]*data-i18n="editWorkout"/);
  assert.match(htmlSource, /id="btn-workout-discard"[\s\S]*data-i18n="discardWorkout"/);
  assert.match(appSource, /function setWorkoutActionsOpen\(open\)/);
});

test('workout labels describe the action and completion scope', () => {
  assert.match(i18nSource, /skipExercise: '⊘ Ignorer l’exercice'/);
  assert.match(i18nSource, /restTime: '⏱ Lancer un repos de \{time\}'/);
  assert.match(i18nSource, /workoutProgress: '\{completed\}\/\{total\} exercices terminés'/);
  assert.match(i18nSource, /exerciseSetProgress: '\{completed\}\/\{total\} séries terminées'/);
});

test('incomplete workouts explain their state before saving', () => {
  assert.match(appSource, /progress\.completed < progress\.total/);
  assert.match(appSource, /finishIncompleteSummary/);
  assert.match(appSource, /finishWorkout\(\{ incompleteConfirmed: true \}\)/);
});

test('irreversible supplement deletion requires a named confirmation', () => {
  assert.match(appSource, /deleteSupplementConfirm[\s\S]*deleteSupplement\(supplement\.id\)/);
  assert.match(i18nSource, /deleteSupplementConfirm: 'Supprimer définitivement « \{name\} »/);
});
