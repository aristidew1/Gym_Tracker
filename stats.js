// Statistics are driven by the exercise catalogue and recorded sessions.

import { getExerciseHistory, getTrackedExercises } from './storage.js';
import {
  MUSCLE_CATEGORIES,
  getExerciseColor,
  getExerciseDisplayName,
  getExerciseMuscleCategory,
  getMuscleCategoryDisplayName,
  getProgramExerciseIds,
} from './data.js';
import { getActiveProgram } from './services/program-storage.js';
import { getLanguage } from './i18n.js';
import { parseLocalDate } from './services/date-utils.js';

let weightChart = null;
let repsChart = null;
let initialized = false;

function getChartTheme() {
  const light = document.documentElement.classList.contains('light-theme');
  return light
    ? { grid: 'rgba(37, 51, 82, 0.12)', ticks: 'rgba(37, 51, 82, 0.7)' }
    : { grid: 'rgba(255,255,255,0.05)', ticks: 'rgba(255,255,255,0.4)' };
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `${red},${green},${blue}`;
}

function formatDate(dateString) {
  const date = parseLocalDate(dateString);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getSelectorExercises() {
  const exercises = new Map();
  getProgramExerciseIds(getActiveProgram()).forEach((id) => exercises.set(id, { id, name: getExerciseDisplayName(id) }));
  getTrackedExercises().forEach((exercise) => {
    if (!exercises.has(exercise.id)) exercises.set(exercise.id, { ...exercise, name: getExerciseDisplayName(exercise.id, exercise.name) });
  });
  return [...exercises.values()]
    .map((exercise) => ({ ...exercise, muscleCategory: getExerciseMuscleCategory(exercise.id) }))
    .sort((first, second) => first.name.localeCompare(second.name, getLanguage()));
}

function getSelectorCategories(exercises) {
  const available = new Set(exercises.map((exercise) => exercise.muscleCategory));
  return MUSCLE_CATEGORIES
    .filter((category) => available.has(category.id))
    .map((category) => ({ id: category.id, name: getMuscleCategoryDisplayName(category) }));
}

function fillExerciseSelector(exercises, preferredExerciseId = null) {
  const exerciseSelector = document.getElementById('stats-exercise-selector');
  const muscleSelector = document.getElementById('stats-muscle-selector');
  const visibleExercises = exercises.filter((exercise) => exercise.muscleCategory === muscleSelector.value);
  exerciseSelector.innerHTML = '';

  visibleExercises.forEach((exercise) => {
    const option = document.createElement('option');
    option.value = exercise.id;
    option.textContent = exercise.name;
    exerciseSelector.appendChild(option);
  });

  if (visibleExercises.some((exercise) => exercise.id === preferredExerciseId)) {
    exerciseSelector.value = preferredExerciseId;
  }
}

export function refreshStatsSelector() {
  const muscleSelector = document.getElementById('stats-muscle-selector');
  const exerciseSelector = document.getElementById('stats-exercise-selector');
  const previousMuscle = muscleSelector.value;
  const previousExercise = exerciseSelector.value;
  const exercises = getSelectorExercises();
  const categories = getSelectorCategories(exercises);
  muscleSelector.innerHTML = '';

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    muscleSelector.appendChild(option);
  });

  const previousExerciseCategory = exercises.find((exercise) => exercise.id === previousExercise)?.muscleCategory;
  if (categories.some((category) => category.id === previousMuscle)) muscleSelector.value = previousMuscle;
  else if (categories.some((category) => category.id === previousExerciseCategory)) muscleSelector.value = previousExerciseCategory;
  fillExerciseSelector(exercises, previousExercise);
}

export function initStats() {
  refreshStatsSelector();
  if (initialized) return;
  initialized = true;

  document.getElementById('stats-muscle-selector').addEventListener('change', () => {
    fillExerciseSelector(getSelectorExercises());
    updateCharts();
  });

  document.getElementById('stats-exercise-selector').addEventListener('change', () => {
    updateCharts();
  });

  document.getElementById('stats-period-selector').addEventListener('click', (event) => {
    const button = event.target.closest('.stats-period-btn');
    if (!button) return;
    document.querySelectorAll('.stats-period-btn').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    updateCharts();
  });

  window.addEventListener('themechange', updateCharts);

  updateCharts();
}

export function updateCharts() {
  const exerciseId = document.getElementById('stats-exercise-selector')?.value;
  const period = Number(document.querySelector('#stats-period-selector .stats-period-btn.active')?.dataset.period || 0);
  const emptyElement = document.getElementById('stats-empty');
  const chartsElement = document.getElementById('stats-charts');
  if (!exerciseId) {
    emptyElement.style.display = 'block';
    chartsElement.style.display = 'none';
    return;
  }

  let history = getExerciseHistory(exerciseId);
  if (period > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    cutoff.setHours(0, 0, 0, 0);
    history = history.filter((entry) => parseLocalDate(entry.date) >= cutoff);
  }

  if (!history.length || !window.Chart) {
    emptyElement.style.display = 'block';
    chartsElement.style.display = 'none';
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    if (repsChart) { repsChart.destroy(); repsChart = null; }
    return;
  }

  emptyElement.style.display = 'none';
  chartsElement.style.display = '';
  const color = getExerciseColor(exerciseId);
  const rgb = hexToRgb(color);
  const labels = history.map((entry) => formatDate(entry.date));
  const maxWeights = history.map((entry) => Math.max(0, ...(entry.sets || []).map((set) => Number(set.weight) || 0)));
  const totalReps = history.map((entry) => (entry.sets || []).reduce((sum, set) => sum + (Number(set.reps) || 0), 0));
  const chartTheme = getChartTheme();
  const sharedScale = {
    grid: { color: chartTheme.grid },
    ticks: { color: chartTheme.ticks, font: { family: 'Inter', size: 10 } },
  };
  const plugins = { legend: { display: false }, tooltip: { titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } } };

  if (weightChart) weightChart.destroy();
  if (repsChart) repsChart.destroy();
  weightChart = new window.Chart(document.getElementById('chart-weight').getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data: maxWeights, borderColor: color, backgroundColor: `rgba(${rgb},0.1)`, fill: true, tension: 0.3, pointBackgroundColor: color, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: sharedScale, y: { ...sharedScale, beginAtZero: false } }, plugins },
  });
  repsChart = new window.Chart(document.getElementById('chart-reps').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ data: totalReps, backgroundColor: `rgba(${rgb},0.6)`, borderRadius: 4, borderSkipped: false }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: sharedScale, y: { ...sharedScale, beginAtZero: true } }, plugins },
  });
}
