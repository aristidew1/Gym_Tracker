// app.js — Main application logic

import {
  EXERCISES,
  MUSCLE_CATEGORIES,
  createIntensityTechnique,
  getExercisesByMuscleCategory,
  getExerciseMuscleCategory,
  getMuscleCategoryDisplayName,
  getLocalizedExerciseName,
  getIntensityTechnique,
  getResolvedExercise,
  getSelectionOptions,
} from './data.js';
import {
  saveWorkout,
  updateWorkout,
  getLastWorkout,
  getNextSession,
  getLastExerciseDataByExerciseId,
  getStats,
  exportData,
  exportProgramsData,
  getExportSummary,
  getProgramsExportSummary,
  getImportSummary,
  getProgramsImportSummary,
  importData,
  importProgramsData,
  getWorkouts,
  getNewPersonalRecords,
  clearActiveWorkoutDraft,
  getActiveWorkoutDraft,
  saveActiveWorkoutDraft,
} from './storage.js';
import { addSupplement, deleteSupplement, getSupplementStatus, getSupplements, getTakenSupplementIds, toggleSupplementTaken } from './supplements.js';
import { initCalendar, openWorkoutDate, renderCalendar } from './calendar.js';
import { initStats, refreshStatsSelector, updateCharts } from './stats.js';
import {
  dismissRestTimerNotification,
  finishRestTimerNotification,
  initNotifications,
  startRestTimerNotification,
  updateNotification,
} from './notifications.js';
import { initPrograms, openNewProgramEditor, renderPrograms } from './programs.js';
import { getActiveProgram, getProgramById, setActiveProgram } from './services/program-storage.js';
import { buildAiProgramPrompt } from './services/ai-program-template.js';
import { copyText } from './services/clipboard.js';
import { formatLocalDate, localDateToDayNumber } from './services/date-utils.js';
import { escapeHtml } from './services/html.js';
import { getLanguage, localizeText, setLanguage, t, translateDocument } from './i18n.js';

// ============================================
// STATE
// ============================================
const state = {
  currentView: 'home',
  activeSessionId: null,
  activeProgramId: null,
  workoutSession: null,
  workoutEditor: { active: false, blockId: null, exerciseId: null, category: 'back' },
  editingWorkout: null,
  choices: {},         // { exerciseId: chosenOptionId }
  exerciseSets: {},    // { exerciseId: [{ weight: number, reps: number, done: bool }] }
  workoutStartTime: null,
  durationInterval: null,
  timerInterval: null,
  timerTotal: 0,
  timerRemaining: 0,
  timerEndsAt: null,
  workoutNote: '',
  exerciseNotes: {},
  confirmCallback: null,
};

const ONBOARDING_KEY = 'muscu_onboarding_completed';
const THEME_KEY = 'muscu_theme';
const ACCESSIBILITY_KEY = 'muscu_accessibility';

function getAccessibilityPreferences() {
  try {
    return {
      textSize: 'normal', highContrast: false, reducedMotion: false, haptics: true, keepScreenAwake: false,
      ...JSON.parse(localStorage.getItem(ACCESSIBILITY_KEY) || '{}'),
    };
  } catch { return { textSize: 'normal', highContrast: false, reducedMotion: false, haptics: true, keepScreenAwake: false }; }
}

function setAccessibilityPreferences(next) {
  localStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(next));
  applyAccessibilityPreferences(next);
}

function applyAccessibilityPreferences(preferences = getAccessibilityPreferences()) {
  const root = document.documentElement;
  root.dataset.textSize = ['normal', 'large', 'xlarge'].includes(preferences.textSize) ? preferences.textSize : 'normal';
  root.classList.toggle('high-contrast', Boolean(preferences.highContrast));
  root.classList.toggle('reduce-motion', Boolean(preferences.reducedMotion));
}

function getTheme() {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  const selectedTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('light-theme', selectedTheme === 'light');
  document.documentElement.style.colorScheme = selectedTheme;
  localStorage.setItem(THEME_KEY, selectedTheme);
  window.dispatchEvent(new Event('themechange'));
}

setTheme(getTheme());
applyAccessibilityPreferences();

function getWorkoutProgram() {
  const program = getProgramById(state.activeProgramId);
  if (program) return program;
  if (state.editingWorkout) {
    return {
      id: state.editingWorkout.programId,
      name: state.editingWorkout.programName || t('custom'),
    };
  }
  return getActiveProgram();
}

function getCurrentWorkoutSession() {
  return state.workoutSession;
}

// ============================================
// INITIALIZATION
// ============================================
async function updateNativeSafeAreaInsets() {
  const plugin = window.Capacitor?.Plugins?.SafeArea;
  if (!plugin?.getInsets) return;

  document.documentElement.classList.add('platform-ios');

  try {
    const insets = await plugin.getInsets();
    const root = document.documentElement;
    const top = Math.max(0, Number(insets?.top) || 0);
    const bottom = Math.max(0, Number(insets?.bottom) || 0);
    root.style.setProperty('--native-safe-area-top', `${top}px`);
    root.style.setProperty('--native-safe-area-bottom', `${bottom}px`);
  } catch (error) {
    console.warn('Unable to read native safe-area insets:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNativeSafeAreaInsets();
  window.addEventListener('resize', updateNativeSafeAreaInsets);
  window.addEventListener('orientationchange', updateNativeSafeAreaInsets);
  translateDocument();
  initNavigation();
  initSupplements();
  renderHome();
  initCalendar();
  initStats();
  initWorkoutControls();
  initTimerControls();
  initTimerLifecycle();
  initConfirmDialog();
  initSettings();
  initSelectPicker();
  initNotifications();
  initPrograms();
  initOnboarding();
  initWorkoutDraftPersistence();
  restoreActiveWorkoutDraft();
  window.addEventListener('workout:edit-requested', (event) => {
    const workout = getWorkouts().find((item) => item.id === event.detail?.workoutId);
    if (workout) startRecordedWorkoutEdit(workout);
  });
  window.addEventListener('language:changed', () => {
    renderHome();
    refreshStatsSelector();
    updateCharts();
    const now = new Date();
    renderCalendar(now.getFullYear(), now.getMonth());
    renderPrograms();
    if (state.currentView === 'workout') { renderChoices(); renderExercises(); }
    updateNotification();
  });
  window.addEventListener('program:changed', () => {
    if (state.currentView !== 'workout') {
      renderHome();
      refreshStatsSelector();
      updateCharts();
      const now = new Date();
      renderCalendar(now.getFullYear(), now.getMonth());
      updateNotification();
    }
  });
});

function shouldShowOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY) === 'true') return false;
  const summary = getExportSummary();
  return summary.workouts === 0
    && summary.programs === 0
    && summary.supplements === 0
    && !summary.baseProgramCustomized;
}

function completeOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
  const overlay = document.getElementById('onboarding-overlay');
  overlay?.classList.remove('active');
  overlay?.setAttribute('aria-hidden', 'true');
}

const FEATURE_TOUR_STEPS = [
  { mark: '🗂️', title: 'tourProgramTitle', description: 'tourProgramDescription' },
  { mark: '✅', title: 'tourWorkoutTitle', description: 'tourWorkoutDescription' },
  { mark: '⏱️', title: 'tourRestTitle', description: 'tourRestDescription' },
  { mark: '📈', title: 'tourProgressTitle', description: 'tourProgressDescription' },
];

function startFeatureTour(onComplete = () => {}) {
  const overlay = document.getElementById('feature-tour-overlay');
  if (!overlay) return onComplete();
  let step = 0;

  const renderStep = () => {
    const current = FEATURE_TOUR_STEPS[step];
    overlay.querySelector('#feature-tour-mark').textContent = current.mark;
    overlay.querySelector('#feature-tour-step').textContent = t('tourStep', { current: step + 1, total: FEATURE_TOUR_STEPS.length });
    overlay.querySelector('#feature-tour-title').textContent = t(current.title);
    overlay.querySelector('#feature-tour-description').textContent = t(current.description);
    overlay.querySelector('#feature-tour-progress').style.setProperty('--tour-progress', `${((step + 1) / FEATURE_TOUR_STEPS.length) * 100}%`);
    overlay.querySelector('#btn-feature-tour-next').textContent = t(step === FEATURE_TOUR_STEPS.length - 1 ? 'tourDone' : 'tourNext');
  };
  const finishTour = () => {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    onComplete();
  };

  overlay.querySelector('#btn-feature-tour-skip').onclick = finishTour;
  overlay.querySelector('#btn-feature-tour-next').onclick = () => {
    if (step === FEATURE_TOUR_STEPS.length - 1) return finishTour();
    step += 1;
    renderStep();
  };
  renderStep();
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
}

function initOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay || !shouldShowOnboarding()) return;

  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.querySelector('[data-onboarding-action="create"]')?.addEventListener('click', () => {
    completeOnboarding();
    startFeatureTour(() => {
      doNavigate('programs');
      openNewProgramEditor();
    });
  });
  overlay.querySelector('[data-onboarding-action="example"]')?.addEventListener('click', () => {
    setActiveProgram('pullup_deadlift_cycle');
    completeOnboarding();
    doNavigate('home');
    startFeatureTour();
  });
  overlay.querySelector('[data-onboarding-action="import"]')?.addEventListener('click', () => {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.getElementById('btn-import-programs')?.click();
  });
  window.addEventListener('programs:imported', () => {
    completeOnboarding();
    startFeatureTour(() => doNavigate('programs'));
  }, { once: true });
}

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      navigateTo(view);
    });
  });
}

function navigateTo(viewName) {
  // Don't navigate away from workout without confirmation
  if (state.currentView === 'workout' && viewName !== 'workout') {
    confirmLeaveWorkout(() => {
      cleanupWorkout();
      doNavigate(viewName);
    });
    return;
  }
  doNavigate(viewName);
}

function confirmLeaveWorkout(callback) {
  const titleKey = state.editingWorkout ? 'leaveRecordedWorkout' : 'leaveWorkout';
  const descriptionKey = state.editingWorkout ? 'leaveRecordedWorkoutDesc' : 'leaveWorkoutDesc';
  showConfirm(t(titleKey), t(descriptionKey), callback);
}

function doNavigate(viewName) {
  state.currentView = viewName;

  // Update views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add('active');

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Show/hide bottom nav during workout
  const nav = document.getElementById('bottom-nav');
  nav.style.display = viewName === 'workout' ? 'none' : '';

  // Update app padding
  const app = document.getElementById('app');
  app.style.paddingBottom = viewName === 'workout' ? '16px' : '';

  // Refresh data when navigating
  if (viewName === 'home') renderHome();
  if (viewName === 'calendar') {
    const now = new Date();
    renderCalendar(now.getFullYear(), now.getMonth());
  }
  if (viewName === 'stats') updateCharts();
  if (viewName === 'programs') renderPrograms();
  if (viewName === 'supplements') renderSupplements();

  // Views share one document scroll position. Without resetting it, switching
  // from a scrolled screen could open the next screen with its header clipped.
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

// ============================================
// DARK SELECT PICKER
// ============================================
let pickerSelect = null;
let ignoreSelectPickerBackdropUntil = 0;
let ignoreSelectPickerOptionUntil = 0;
let selectPointerGesture = null;
let suppressSelectClickUntil = 0;

function getSelectPickerTitle(select) {
  const label = select.closest('label');
  const labelText = label?.querySelector(':scope > span')?.textContent
    || [...(label?.childNodes || [])].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())?.textContent
    || select.closest('.settings-row')?.querySelector('.settings-row-label')?.textContent
    || select.getAttribute('aria-label');
  return labelText?.trim() || t('chooseOption');
}

function closeSelectPicker({ restoreFocus = false } = {}) {
  const overlay = document.getElementById('select-picker-overlay');
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  const select = pickerSelect;
  pickerSelect = null;
  if (restoreFocus && select?.isConnected && document.activeElement !== select) {
    select.focus({ preventScroll: true });
  }
}

function openSelectPicker(select) {
  if (!select || select.disabled || select.multiple) return;
  const overlay = document.getElementById('select-picker-overlay');
  const title = document.getElementById('select-picker-title');
  const options = document.getElementById('select-picker-options');
  pickerSelect = select;
  // On Android WebView, the click generated by the touch that opens a select
  // can be retargeted to the new overlay. Ignore that single trailing click,
  // otherwise the backdrop immediately closes the picker again.
  ignoreSelectPickerBackdropUntil = Date.now() + 400;
  // The retargeted click reaches the first option synchronously on Android.
  // Keep this window short so a deliberate fast tap remains responsive.
  ignoreSelectPickerOptionUntil = Date.now() + 80;
  title.textContent = getSelectPickerTitle(select);
  options.innerHTML = '';

  [...select.options].forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'select-picker-option';
    button.disabled = option.disabled;
    button.dataset.value = option.value;
    button.textContent = option.textContent.trim();
    button.setAttribute('aria-pressed', String(option.selected));
    if (option.selected) button.classList.add('selected');
    options.appendChild(button);
  });

  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
}

function initSelectPicker() {
  const overlay = document.getElementById('select-picker-overlay');
  const options = document.getElementById('select-picker-options');

  const getEligibleSelect = (target) => {
    const select = target.closest?.('select');
    return select && !select.disabled && !select.multiple ? select : null;
  };

  // Opening on pointerdown made a vertical swipe that happened to begin on a
  // select look like a tap. Track the gesture first and open only after a
  // stationary release; scrolling remains a normal browser gesture.
  document.addEventListener('pointerdown', (event) => {
    const select = getEligibleSelect(event.target);
    if (!select) return;
    selectPointerGesture = {
      select,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }, true);
  document.addEventListener('pointermove', (event) => {
    const gesture = selectPointerGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 8) gesture.moved = true;
  }, true);
  document.addEventListener('pointerup', (event) => {
    const gesture = selectPointerGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    selectPointerGesture = null;
    suppressSelectClickUntil = Date.now() + 450;
    if (gesture.moved) return;
    event.preventDefault();
    event.stopPropagation();
    openSelectPicker(gesture.select);
  }, true);
  document.addEventListener('pointercancel', (event) => {
    if (selectPointerGesture?.pointerId === event.pointerId) selectPointerGesture = null;
  }, true);
  document.addEventListener('click', (event) => {
    const select = getEligibleSelect(event.target);
    if (!select) return;
    event.preventDefault();
    event.stopPropagation();
    if (Date.now() < suppressSelectClickUntil) return;
    openSelectPicker(select);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!event.target.matches?.('select') || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openSelectPicker(event.target);
  });
  options.addEventListener('click', (event) => {
    // When a select is near the bottom of the screen, the sheet can appear
    // directly below the finger. Android may then retarget the trailing click
    // of that same gesture to an option in the sheet.
    const option = event.target.closest('.select-picker-option');
    if (!option || !pickerSelect) return;
    if (Date.now() < ignoreSelectPickerOptionUntil) return;
    const select = pickerSelect;
    const changed = select.value !== option.dataset.value;
    select.value = option.dataset.value;
    closeSelectPicker();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.getElementById('select-picker-close').addEventListener('click', () => closeSelectPicker({ restoreFocus: true }));
  document.getElementById('select-picker-cancel').addEventListener('click', () => closeSelectPicker({ restoreFocus: true }));
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay && Date.now() >= ignoreSelectPickerBackdropUntil) {
      closeSelectPicker({ restoreFocus: true });
    }
  });
}

// ============================================
// HOME VIEW
// ============================================
function renderHome() {
  const program = getActiveProgram();
  // Update stats
  const stats = getStats(program);
  document.getElementById('stat-total').textContent = stats.totalWorkouts;
  document.getElementById('stat-streak').textContent = stats.streak;
  document.getElementById('stat-month').textContent = stats.thisMonth;

  // Suggested session
  const nextSession = getNextSession(program);
  const sessionData = program.sessions[nextSession];
  document.getElementById('next-session-name').textContent =
    `${localizeText(sessionData.name)} — ${localizeText(sessionData.subtitle)}`;

  renderHomeSupplements();

  // Session cards
  const grid = document.getElementById('session-grid');
  grid.innerHTML = '';

  for (const sessionId of program.sessionOrder) {
    const session = program.sessions[sessionId];
    const card = document.createElement('div');
    card.className = 'session-card';
    card.style.setProperty('--card-color', session.color);
    card.style.setProperty('--card-color-rgb', session.colorRgb);

    if (sessionId === nextSession) {
      card.classList.add('suggested');
    }

    // Get last workout info
    const lastWorkout = getLastWorkout(sessionId, program.id);
    let lastInfo = '';
    if (lastWorkout) {
      const days = localDateToDayNumber(new Date()) - localDateToDayNumber(lastWorkout.date);
      lastInfo = days === 0 ? t('today') : days === 1 ? t('yesterday') : t('daysAgo', { count: days });
    }

    card.innerHTML = `
      <div class="card-icon">${escapeHtml(session.icon)}</div>
      <div class="card-title">${escapeHtml(localizeText(session.name))}</div>
      <div class="card-subtitle">${escapeHtml(localizeText(session.subtitle))}</div>
      <div class="session-card-footer">
        ${lastInfo ? `<span class="card-badge card-last-workout">${lastInfo}</span>` : ''}
        ${sessionId === nextSession ? `<span class="card-badge card-next">${t('next')}</span>` : ''}
      </div>
    `;

    card.addEventListener('click', () => startSession(sessionId));
    grid.appendChild(card);
  }
}

// ============================================
// SUPPLEMENTS
// ============================================
function initSupplements() {
  document.getElementById('btn-supplements-back').addEventListener('click', () => doNavigate('home'));
}

function renderHomeSupplements() {
  const container = document.getElementById('supplements-home-card');
  const supplements = getSupplements();
  const status = getSupplementStatus();
  container.replaceChildren();

  const header = document.createElement('div');
  header.className = 'supplements-card-header';
  const title = document.createElement('div');
  title.innerHTML = `<span class="supplements-icon" aria-hidden="true">💊</span><div><h2 id="supplements-home-title">${t('supplements')}</h2><p>${supplements.length ? t('supplementsProgress', { taken: status.taken, total: status.total }) : t('supplementsEmptyHome')}</p></div>`;
  const manage = document.createElement('button');
  manage.className = 'supplements-manage-btn';
  manage.type = 'button';
  manage.textContent = supplements.length ? t('manage') : t('addSupplements');
  manage.addEventListener('click', () => doNavigate('supplements'));
  header.append(title, manage);
  container.appendChild(header);

  if (!supplements.length) return;
  const list = document.createElement('div');
  list.className = 'supplements-checklist';
  const taken = new Set(getTakenSupplementIds());
  supplements.forEach((supplement) => {
    const button = document.createElement('button');
    button.className = `supplement-check ${taken.has(supplement.id) ? 'taken' : ''}`;
    button.type = 'button';
    button.setAttribute('aria-pressed', String(taken.has(supplement.id)));
    const dose = [supplement.dose, supplement.unit].filter(Boolean).join(' ');
    button.innerHTML = `<span class="supplement-checkmark">✓</span><span class="supplement-name">${escapeHtml(supplement.name)}${dose ? `<small>${escapeHtml(dose)}</small>` : ''}</span>`;
    button.addEventListener('click', () => {
      toggleSupplementTaken(supplement.id);
      renderHomeSupplements();
      updateNotification();
      const now = new Date();
      renderCalendar(now.getFullYear(), now.getMonth());
    });
    list.appendChild(button);
  });
  container.appendChild(list);
}

function renderSupplements() {
  const container = document.getElementById('supplements-content');
  const supplements = getSupplements();
  container.innerHTML = `
    <form class="supplement-form" id="supplement-form">
      <label><span>${t('supplementName')}</span><input required maxlength="60" name="name" placeholder="${t('supplementNamePlaceholder')}"></label>
      <div class="supplement-dose-fields"><label><span>${t('dose')}</span><input maxlength="20" name="dose" inputmode="decimal" placeholder="5"></label><label><span>${t('unit')}</span><input maxlength="12" name="unit" placeholder="g"></label></div>
      <button class="supplement-add-btn" type="submit">＋ ${t('addSupplement')}</button>
    </form>
    <section class="supplements-list" aria-label="${t('mySupplements')}">
      <h2>${t('mySupplements')}</h2>
      ${supplements.length ? supplements.map((item) => {
        const dose = [item.dose, item.unit].filter(Boolean).join(' ');
        return `<div class="supplement-row"><div><strong>${escapeHtml(item.name)}</strong>${dose ? `<span>${escapeHtml(dose)} ${t('perDay')}</span>` : ''}</div><button class="supplement-delete-btn" type="button" data-supplement-id="${escapeHtml(item.id)}">${t('remove')}</button></div>`;
      }).join('') : `<p class="supplements-empty">${t('supplementsEmpty')}</p>`}
    </section>`;
  container.querySelector('#supplement-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (addSupplement({ name: form.get('name'), dose: form.get('dose'), unit: form.get('unit') })) {
      renderSupplements();
      updateNotification();
    }
  });
  container.querySelectorAll('[data-supplement-id]').forEach((button) => button.addEventListener('click', () => {
    deleteSupplement(button.dataset.supplementId);
    renderSupplements();
    renderHomeSupplements();
    updateNotification();
    const now = new Date();
    renderCalendar(now.getFullYear(), now.getMonth());
  }));
}

// ============================================
// WORKOUT SESSION
// ============================================
function initWorkoutControls() {
  const exercisesContainer = document.getElementById('workout-exercises');

  document.getElementById('btn-back').addEventListener('click', () => {
    confirmLeaveWorkout(() => {
      cleanupWorkout();
      doNavigate('home');
    });
  });

  document.getElementById('btn-finish').addEventListener('click', () => {
    finishWorkout();
  });

  document.getElementById('btn-workout-discard').addEventListener('click', () => {
    showConfirm(t('discardWorkout'), t('discardWorkoutConfirm'), () => {
      cleanupWorkout();
      doNavigate('home');
    });
  });

  document.getElementById('btn-workout-edit').addEventListener('click', toggleWorkoutEditor);
  exercisesContainer.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-workout-editor-action]');
    const action = actionButton?.dataset.workoutEditorAction;
    if (action === 'new-block') addBonusBlock();
    if (action === 'open-add-exercise') {
      state.workoutEditor.blockId = event.target.closest('[data-workout-block-id]')?.dataset.workoutBlockId || null;
      state.workoutEditor.exerciseId = null;
      renderExercises();
    }
    if (action === 'open-replace-exercise') {
      const controls = event.target.closest('[data-workout-exercise-id]');
      const block = getCurrentWorkoutSession()?.blocks.find((item) => item.id === controls?.dataset.workoutBlockId);
      const exercise = block?.items.find((item) => item.id === controls?.dataset.workoutExerciseId);
      state.workoutEditor.blockId = block?.id || null;
      state.workoutEditor.exerciseId = exercise?.id || null;
      state.workoutEditor.category = getExerciseMuscleCategory(getResolvedExercise(exercise, state.choices[exercise?.id]).exerciseId);
      renderExercises();
    }
    if (action === 'apply-exercise') applyWorkoutExerciseSelection(actionButton);
    if (action === 'cancel-exercise-picker') {
      state.workoutEditor.blockId = null;
      state.workoutEditor.exerciseId = null;
      renderExercises();
    }
    if (action === 'move-block-up') moveWorkoutBlock(event.target.closest('[data-workout-block-id]')?.dataset.workoutBlockId, -1);
    if (action === 'move-block-down') moveWorkoutBlock(event.target.closest('[data-workout-block-id]')?.dataset.workoutBlockId, 1);
    if (action === 'move-exercise-up') moveWorkoutExercise(event.target.closest('[data-workout-exercise-id]')?.dataset.workoutBlockId, event.target.closest('[data-workout-exercise-id]')?.dataset.workoutExerciseId, -1);
    if (action === 'move-exercise-down') moveWorkoutExercise(event.target.closest('[data-workout-exercise-id]')?.dataset.workoutBlockId, event.target.closest('[data-workout-exercise-id]')?.dataset.workoutExerciseId, 1);
  });
  exercisesContainer.addEventListener('change', handleWorkoutEditorChange);

  document.getElementById('btn-summary-close').addEventListener('click', () => {
    document.getElementById('summary-overlay').classList.remove('active');
    doNavigate('home');
  });
}

function makeWorkoutEditId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function getBlockPresentation(mode) {
  if (mode === 'superset') return { label: t('superset'), badgeClass: 'superset' };
  if (mode === 'circuit') return { label: t('circuit'), badgeClass: 'traction' };
  return { label: t('block'), badgeClass: 'force' };
}

function createBonusExercise(exerciseId) {
  return {
    id: makeWorkoutEditId('bonus_exercise'),
    exerciseId,
    prescription: {
      setCount: 3,
      repetitionRange: { min: 8, max: 12 },
      segments: [{ type: 'working', setCount: 3 }],
      restSeconds: 90,
      targetRir: 2,
      targetRpe: null,
      tempo: null,
      progressionRuleId: 'double_progression',
    },
    intensityTechnique: createIntensityTechnique('straight_sets'),
    note: null,
  };
}

function getWorkoutEditorBlock() {
  const session = getCurrentWorkoutSession();
  return session?.blocks.find((block) => block.id === state.workoutEditor.blockId) || null;
}

function createInlineExerciseForm(block) {
  const category = state.workoutEditor.category;
  const targetExercise = block.items.find((item) => item.id === state.workoutEditor.exerciseId) || null;
  const currentExerciseId = targetExercise
    ? getResolvedExercise(targetExercise, state.choices[targetExercise.id]).exerciseId
    : null;
  const categoryOptions = MUSCLE_CATEGORIES.map((item) => (
    `<option value="${escapeHtml(item.id)}" ${item.id === category ? 'selected' : ''}>${escapeHtml(getMuscleCategoryDisplayName(item.id))}</option>`
  )).join('');
  const exerciseOptions = getExercisesByMuscleCategory(category).map((exercise) => (
    `<option value="${escapeHtml(exercise.id)}" ${exercise.id === currentExerciseId ? 'selected' : ''}>${escapeHtml(getLocalizedExerciseName(exercise))}</option>`
  )).join('');
  const form = document.createElement('div');
  form.className = 'workout-inline-add-exercise';
  form.dataset.workoutBlockId = block.id;
  if (targetExercise) form.dataset.workoutExerciseId = targetExercise.id;
  form.innerHTML = `
    <label>${t('muscleCategory')}<select data-workout-editor-field="category">${categoryOptions}</select></label>
    <label>${t('exercise')}<select data-workout-editor-field="exercise">${exerciseOptions}</select></label>
    <div class="workout-inline-picker-actions">
      <button data-workout-editor-action="cancel-exercise-picker">${t('cancel')}</button>
      <button class="btn-finish" data-workout-editor-action="apply-exercise">${targetExercise ? t('replace') : t('add')}</button>
    </div>`;
  return form;
}

function toggleWorkoutEditor() {
  if (!getCurrentWorkoutSession()) return;
  state.workoutEditor.active = !state.workoutEditor.active;
  if (!state.workoutEditor.active) {
    state.workoutEditor.blockId = null;
    state.workoutEditor.exerciseId = null;
  }
  document.getElementById('btn-workout-edit').classList.toggle('active', state.workoutEditor.active);
  renderExercises();
}

function addBonusBlock() {
  const session = getCurrentWorkoutSession();
  if (!session) return;
  const block = {
    id: makeWorkoutEditId('bonus_block'),
    name: t('bonusBlock', { count: session.blocks.length + 1 }),
    presentation: getBlockPresentation('sequential'),
    executionMode: 'sequential',
    rounds: 1,
    restBetweenExercisesSeconds: 0,
    restBetweenRoundsSeconds: 90,
    items: [],
  };
  session.blocks.push(block);
  state.workoutEditor.blockId = block.id;
  state.workoutEditor.exerciseId = null;
  renderExercises();
}

function applyWorkoutExerciseSelection(actionButton) {
  const form = actionButton?.closest('.workout-inline-add-exercise');
  const block = getCurrentWorkoutSession()?.blocks.find((item) => item.id === form?.dataset.workoutBlockId);
  const exerciseId = form?.querySelector('[data-workout-editor-field="exercise"]')?.value;
  if (!block || !exerciseId) return;
  const targetExercise = block.items.find((item) => item.id === form.dataset.workoutExerciseId);
  if (targetExercise) {
    targetExercise.exerciseId = exerciseId;
    delete targetExercise.selection;
    delete state.choices[targetExercise.id];
  } else {
    block.items.push(createBonusExercise(exerciseId));
  }
  state.workoutEditor.blockId = null;
  state.workoutEditor.exerciseId = null;
  renderChoices();
  renderExercises();
}

function moveItem(items, id, direction) {
  const index = items.findIndex((item) => item.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= items.length) return false;
  [items[index], items[destination]] = [items[destination], items[index]];
  return true;
}

function moveWorkoutBlock(blockId, direction) {
  const session = getCurrentWorkoutSession();
  if (!session || !moveItem(session.blocks, blockId, direction)) return;
  renderChoices();
  renderExercises();
}

function moveWorkoutExercise(blockId, exerciseId, direction) {
  const block = getCurrentWorkoutSession()?.blocks.find((item) => item.id === blockId);
  if (!block || !moveItem(block.items, exerciseId, direction)) return;
  renderChoices();
  renderExercises();
}

function handleWorkoutEditorChange(event) {
  const field = event.target.dataset.workoutEditorField;
  if (!field) return;
  // The exercise select must keep its chosen value until the user presses
  // Add/Replace. Re-rendering here rebuilt the form and reset it to the first
  // catalogue item (weighted pull-ups for the back category).
  if (field === 'exercise') return;
  if (field === 'category') {
    state.workoutEditor.category = event.target.value;
    renderExercises();
    return;
  }

  const blockId = event.target.closest('[data-workout-block-id]')?.dataset.workoutBlockId;
  const block = getCurrentWorkoutSession()?.blocks.find((item) => item.id === blockId);
  if (!block) return;
  if (field === 'mode') {
    block.executionMode = event.target.value;
    block.presentation = getBlockPresentation(block.executionMode);
  }
  if (field === 'rounds') block.rounds = Math.max(1, Number(event.target.value) || 1);
  if (field === 'rest') block.restBetweenRoundsSeconds = Math.max(0, Number(event.target.value) || 0);
  renderExercises();
}

function startSession(sessionId) {
  const program = getActiveProgram();
  state.activeSessionId = sessionId;
  state.activeProgramId = program.id;
  state.choices = {};
  state.exerciseSets = {};
  state.workoutNote = '';
  state.exerciseNotes = {};
  state.workoutEditor = { active: false, blockId: null, exerciseId: null, category: 'back' };
  state.editingWorkout = null;
  state.workoutStartTime = Date.now();

  // Keep a private, in-memory copy. Bonus edits made during a workout are
  // saved in that workout record but never alter the underlying program.
  const session = JSON.parse(JSON.stringify(program.sessions[sessionId]));
  state.workoutSession = session;

  // Set session color as CSS variable
  document.documentElement.style.setProperty('--session-color-rgb', session.colorRgb);

  // Update header
  document.getElementById('workout-title').textContent = localizeText(session.name);
  const subtitle = document.getElementById('workout-subtitle');
  subtitle.textContent = localizeText(session.subtitle);
  subtitle.hidden = !session.subtitle;
  document.getElementById('workout-duration').textContent = '00:00';

  // Start duration timer
  clearInterval(state.durationInterval);
  state.durationInterval = setInterval(updateDuration, 1000);

  // Load previous choices for this session
  const lastWorkout = getLastWorkout(sessionId, program.id);
  if (lastWorkout && lastWorkout.choices) {
    // Pre-fill choices from last workout
    for (const [key, value] of Object.entries(lastWorkout.choices)) {
      state.choices[key] = value;
    }
  }

  // Navigate to workout view
  state.currentView = 'workout';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-workout').classList.add('active');
  document.getElementById('bottom-nav').style.display = 'none';
  document.getElementById('app').style.paddingBottom = '16px';

  // Render choices first, then exercises
  renderChoices();
  renderExercises();
  persistActiveWorkout();
  window.dispatchEvent(new Event('workout:started'));
}

function buildRecordedWorkoutSession(workout) {
  const programSession = getProgramById(workout.programId)?.sessions?.[workout.sessionId];
  const ids = new Set();
  const items = (workout.exercises || []).map((exercise, index) => {
    const baseId = exercise.programExerciseId || `recorded_exercise_${index + 1}`;
    let id = baseId;
    while (ids.has(id)) id = `${baseId}_${index + 1}`;
    ids.add(id);
    const reps = (exercise.sets || []).map((set) => Number(set.reps) || 0).filter(Boolean);
    return {
      id,
      exerciseId: exercise.exerciseId,
      prescription: exercise.prescription || {
        setCount: Math.max(1, exercise.sets?.length || 0),
        repetitionRange: { min: reps.length ? Math.min(...reps) : 8, max: reps.length ? Math.max(...reps) : 12 },
        segments: [{ type: 'working', setCount: Math.max(1, exercise.sets?.length || 0) }],
        restSeconds: 90,
        targetRir: null,
        targetRpe: null,
        tempo: null,
        progressionRuleId: null,
      },
      intensityTechnique: exercise.intensityTechnique || createIntensityTechnique('straight_sets'),
      note: null,
    };
  });
  return {
    id: workout.sessionId,
    name: programSession?.name || workout.sessionName || workout.sessionId,
    subtitle: programSession?.subtitle || workout.sessionSubtitle || '',
    icon: programSession?.icon || '✎',
    color: programSession?.color || '#4d7cff',
    colorRgb: programSession?.colorRgb || workout.sessionColorRgb || '77, 124, 255',
    blocks: [{
      id: makeWorkoutEditId('recorded_block'),
      name: t('recordedExercises'),
      presentation: getBlockPresentation('sequential'),
      executionMode: 'sequential',
      rounds: 1,
      restBetweenExercisesSeconds: 0,
      restBetweenRoundsSeconds: 90,
      items,
    }],
  };
}

function startRecordedWorkoutEdit(workout) {
  const session = buildRecordedWorkoutSession(workout);
  state.activeSessionId = workout.sessionId;
  state.activeProgramId = workout.programId;
  state.workoutSession = session;
  state.editingWorkout = structuredClone(workout);
  state.choices = { ...(workout.choices || {}) };
  state.exerciseSets = {};
  state.workoutNote = workout.note || '';
  state.exerciseNotes = Object.fromEntries(session.blocks[0].items.map((item, index) => [item.id, workout.exercises[index]?.note || '']));
  session.blocks[0].items.forEach((item, index) => {
    state.exerciseSets[item.id] = (workout.exercises[index]?.sets || []).map((set) => ({
      weight: Number(set.weight) || 0,
      reps: Number(set.reps) || 0,
      done: set.completed !== false,
      segments: (set.segments || []).map((segment) => ({ ...segment, done: segment.completed !== false })),
    }));
  });
  state.workoutEditor = { active: true, blockId: null, exerciseId: null, category: 'back' };
  state.workoutStartTime = Number(workout.startTime) || Date.now();
  clearInterval(state.durationInterval);
  document.documentElement.style.setProperty('--session-color-rgb', session.colorRgb);
  document.getElementById('workout-title').textContent = localizeText(session.name);
  const subtitle = document.getElementById('workout-subtitle');
  subtitle.textContent = t('editingRecordedWorkout');
  subtitle.hidden = false;
  document.getElementById('workout-duration').textContent = formatRecordedDuration(workout);
  document.getElementById('btn-workout-edit').classList.add('active');
  document.getElementById('btn-finish').textContent = t('save');
  doNavigate('workout');
  renderChoices();
  renderExercises();
}

function formatRecordedDuration(workout) {
  const seconds = Math.max(0, Math.floor(getRecordedWorkoutDuration(workout) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function updateDuration() {
  const elapsed = Math.floor((Date.now() - state.workoutStartTime) / 1000);
  const min = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const sec = (elapsed % 60).toString().padStart(2, '0');
  document.getElementById('workout-duration').textContent = `${min}:${sec}`;
}

function cleanupWorkout() {
  clearInterval(state.durationInterval);
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.timerEndsAt = null;
  state.timerRemaining = 0;
  state.activeSessionId = null;
  state.activeProgramId = null;
  state.workoutSession = null;
  state.workoutEditor = { active: false, blockId: null, exerciseId: null, category: 'back' };
  state.editingWorkout = null;
  state.exerciseSets = {};
  state.workoutNote = '';
  state.exerciseNotes = {};
  state.choices = {};
  state.workoutStartTime = null;
  dismissRestTimerNotification();
  document.getElementById('rest-timer-overlay').classList.remove('active');
  document.getElementById('btn-workout-edit').classList.remove('active');
  document.getElementById('btn-finish').textContent = t('finish');
  clearActiveWorkoutDraft();
}

let workoutDraftSaveTimeout = null;

function persistActiveWorkout() {
  if (!state.workoutSession || !state.activeSessionId) return;
  saveActiveWorkoutDraft({
    activeSessionId: state.activeSessionId,
    activeProgramId: state.activeProgramId,
    workoutSession: state.workoutSession,
    editingWorkout: state.editingWorkout,
    choices: state.choices,
    exerciseSets: state.exerciseSets,
    workoutNote: state.workoutNote,
    exerciseNotes: state.exerciseNotes,
    workoutStartTime: state.workoutStartTime,
    timerEndsAt: state.timerEndsAt,
    timerTotal: state.timerTotal,
  });
}

function scheduleActiveWorkoutSave() {
  if (!state.workoutSession) return;
  clearTimeout(workoutDraftSaveTimeout);
  workoutDraftSaveTimeout = setTimeout(persistActiveWorkout, 150);
}

function initWorkoutDraftPersistence() {
  document.addEventListener('input', (event) => {
    if (event.target.closest('#view-workout')) scheduleActiveWorkoutSave();
  });
  document.addEventListener('change', (event) => {
    if (event.target.closest('#view-workout')) scheduleActiveWorkoutSave();
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#view-workout')) scheduleActiveWorkoutSave();
  });
  window.addEventListener('pagehide', persistActiveWorkout);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistActiveWorkout();
  });
}

function restoreActiveWorkoutDraft() {
  const draft = getActiveWorkoutDraft();
  if (!draft) return;

  state.activeSessionId = draft.activeSessionId;
  state.activeProgramId = draft.activeProgramId;
  state.workoutSession = draft.workoutSession;
  state.editingWorkout = draft.editingWorkout || null;
  state.choices = draft.choices || {};
  state.exerciseSets = draft.exerciseSets || {};
  state.workoutNote = draft.workoutNote || '';
  state.exerciseNotes = draft.exerciseNotes || {};
  state.workoutStartTime = Number(draft.workoutStartTime) || Date.now();
  state.workoutEditor = { active: false, blockId: null, exerciseId: null, category: 'back' };

  const session = state.workoutSession;
  document.documentElement.style.setProperty('--session-color-rgb', session.colorRgb || '77, 124, 255');
  document.getElementById('workout-title').textContent = localizeText(session.name);
  const subtitle = document.getElementById('workout-subtitle');
  subtitle.textContent = localizeText(session.subtitle);
  subtitle.hidden = !session.subtitle;

  clearInterval(state.durationInterval);
  state.durationInterval = setInterval(updateDuration, 1000);
  updateDuration();
  doNavigate('workout');
  renderChoices();
  renderExercises();
  window.dispatchEvent(new Event('workout:started'));

  const remaining = Math.max(0, Math.ceil((Number(draft.timerEndsAt) - Date.now()) / 1000));
  if (remaining > 0) startRestTimer(remaining, session.color);
}

// ============================================
// CHOICES
// ============================================
function renderChoices() {
  const session = getCurrentWorkoutSession();
  if (!session) return;
  const container = document.getElementById('workout-choices');
  container.innerHTML = '';

  let hasChoices = false;

  for (const block of session.blocks) {
    for (const exercise of block.items) {
      if (!exercise.selection) continue;
      hasChoices = true;

      const group = document.createElement('div');
      group.className = 'choice-group';
      const label = document.createElement('div');
      label.className = 'choice-label';
      label.textContent = `${localizeText(block.name)} — ${exercise.selection.type === 'method' ? t('method') : t('choice')}`;
      group.appendChild(label);

      const options = document.createElement('div');
      options.className = 'choice-options';
      if (exercise.selection.type === 'method') options.style.flexDirection = 'column';

      getSelectionOptions(exercise).forEach((option) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.style.setProperty('--session-color-rgb', session.colorRgb);
        if (option.description) {
          btn.innerHTML = `${escapeHtml(option.name)}<span class="choice-desc">${escapeHtml(option.description)}</span>`;
        } else {
          btn.textContent = option.name;
        }
        if (state.choices[exercise.id] === option.id) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          state.choices[exercise.id] = option.id;
          renderChoices();
          renderExercises();
        });
        options.appendChild(btn);
      });

      group.appendChild(options);
      container.appendChild(group);
    }
  }

  if (!hasChoices) {
    container.style.display = 'none';
  } else {
    container.style.display = '';
  }
}

// ============================================
// EXERCISE RENDERING
// ============================================
function renderExercises() {
  const session = getCurrentWorkoutSession();
  if (!session) return;
  const container = document.getElementById('workout-exercises');
  container.innerHTML = '';

  if (state.workoutEditor.active) {
    const toolbar = document.createElement('div');
    toolbar.className = 'workout-inline-editor';
    toolbar.innerHTML = `<div><strong>✎ ${t('editWorkout')}</strong><span>${t('bonusOnly')}</span></div><button data-workout-editor-action="new-block">＋ ${t('addBlock')}</button>`;
    container.appendChild(toolbar);
  }

  const sessionNote = document.createElement('label');
  sessionNote.className = 'workout-note-field';
  sessionNote.innerHTML = `<span>${t('workoutNote')}</span><textarea rows="2" maxlength="1000" placeholder="${t('workoutNotePlaceholder')}"></textarea>`;
  const sessionNoteInput = sessionNote.querySelector('textarea');
  sessionNoteInput.value = state.workoutNote;
  sessionNoteInput.addEventListener('input', () => { state.workoutNote = sessionNoteInput.value; });
  container.appendChild(sessionNote);

  for (const block of session.blocks) {
    const blockDiv = document.createElement('div');
    blockDiv.className = 'exercise-block';

    // Block header
    const header = document.createElement('div');
    header.className = 'block-header';
    header.innerHTML = `
      <span class="block-type-badge ${escapeHtml(block.presentation.badgeClass)}">${escapeHtml(localizeText(block.presentation.label))}</span>
      <span class="block-name">${escapeHtml(localizeText(block.name))}</span>
      <span class="block-rest">⏱ ${formatRestTime(block.restBetweenRoundsSeconds)}</span>
    `;

    if (state.workoutEditor.active) {
      const controls = document.createElement('div');
      controls.className = 'workout-inline-block-controls';
      controls.dataset.workoutBlockId = block.id;
      controls.innerHTML = `
        <select data-workout-editor-field="mode" aria-label="${t('blockType')}">
          <option value="sequential" ${block.executionMode === 'sequential' ? 'selected' : ''}>${t('sequential')}</option>
          <option value="superset" ${block.executionMode === 'superset' ? 'selected' : ''}>${t('superset')}</option>
          <option value="circuit" ${block.executionMode === 'circuit' ? 'selected' : ''}>${t('circuit')}</option>
        </select>
        <button class="workout-move-button" data-workout-editor-action="move-block-up" title="${t('moveUp')}" aria-label="${t('moveUp')}">↑</button>
        <button class="workout-move-button" data-workout-editor-action="move-block-down" title="${t('moveDown')}" aria-label="${t('moveDown')}">↓</button>
        <button data-workout-editor-action="open-add-exercise">${t('addExerciseToWorkout')}</button>`;
      header.appendChild(controls);
    }
    blockDiv.appendChild(header);

    if (state.workoutEditor.active && state.workoutEditor.blockId === block.id) {
      blockDiv.appendChild(createInlineExerciseForm(block));
    }

    // Filter exercises with resolved choices
    const visibleExercises = block.items.filter((exercise) => !exercise.selection?.required || state.choices[exercise.id]);

    // For supersets, only auto-start rest timer after the LAST exercise
    for (let exIdx = 0; exIdx < visibleExercises.length; exIdx++) {
      const exercise = visibleExercises[exIdx];
      const isLastInBlock = exIdx === visibleExercises.length - 1;
      const autoTimer = !['superset', 'circuit'].includes(block.executionMode) || isLastInBlock;
      const card = createExerciseCard(exercise, block, session, autoTimer);
      blockDiv.appendChild(card);
    }

    container.appendChild(blockDiv);
  }
}

function createExerciseCard(exercise, block, session, autoTimer = true) {
  const card = document.createElement('div');
  card.className = 'exercise-card';
  card.style.setProperty('--session-color-rgb', session.colorRgb);

  const resolvedExercise = getResolvedExercise(exercise, state.choices[exercise.id]);
  const displayName = resolvedExercise.name;
  const targets = {
    targetSets: resolvedExercise.prescription.setCount,
    targetRepsMin: resolvedExercise.prescription.repetitionRange.min,
    targetRepsMax: resolvedExercise.prescription.repetitionRange.max,
  };
  const dropCount = resolvedExercise.intensityTechnique?.type === 'drop_set'
    ? Number(resolvedExercise.intensityTechnique.drops) || 2
    : 0;

  // Get previous data
  const prevData = getLastExerciseDataByExerciseId(resolvedExercise.exerciseId);
  let prevText = '';
  if (prevData && prevData.sets && prevData.sets.length > 0) {
    const previousSets = prevData.sets;
    const weights = [...new Set(previousSets.map((set) => Number(set.weight) || 0))].join('/');
    const reps = [...new Set(previousSets.map((set) => Number(set.reps) || 0))].join('/');
    prevText = t('previous', { sets: previousSets.length, weights, reps });
  }

  // Header
  const headerDiv = document.createElement('div');
  headerDiv.className = 'exercise-card-header';
  headerDiv.innerHTML = `
    <div>
      <div class="exercise-name">${escapeHtml(displayName)}</div>
      <div class="exercise-target">${targets.targetSets} × ${targets.targetRepsMin}-${targets.targetRepsMax} ${t('reps')}</div>
    </div>
    ${prevText ? `<div class="exercise-prev">${prevText}</div>` : ''}
  `;
  if (state.workoutEditor.active) {
    const controls = document.createElement('div');
    controls.className = 'workout-inline-exercise-controls';
    controls.dataset.workoutBlockId = block.id;
    controls.dataset.workoutExerciseId = exercise.id;
    controls.innerHTML = `
      <button data-workout-editor-action="open-replace-exercise" title="${t('replaceExercise')}" aria-label="${t('replaceExercise')}">⇄</button>
      <button class="workout-move-button" data-workout-editor-action="move-exercise-up" title="${t('moveUp')}" aria-label="${t('moveUp')}">↑</button>
      <button class="workout-move-button" data-workout-editor-action="move-exercise-down" title="${t('moveDown')}" aria-label="${t('moveDown')}">↓</button>`;
    headerDiv.appendChild(controls);
  }
  card.appendChild(headerDiv);

  const techniqueDefinition = getIntensityTechnique(resolvedExercise.intensityTechnique?.type);
  if (techniqueDefinition && resolvedExercise.intensityTechnique.type !== 'straight_sets') {
    const techniqueDiv = document.createElement('div');
    techniqueDiv.className = 'exercise-technique';
    const parameters = Object.entries(resolvedExercise.intensityTechnique)
      .filter(([key]) => key !== 'type')
      .map(([, value]) => value)
      .join(' · ');
    techniqueDiv.textContent = parameters ? `${techniqueDefinition.name} · ${parameters}` : techniqueDefinition.name;
    card.appendChild(techniqueDiv);
  }

  // Note
  const note = resolvedExercise.note;
  if (note) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'exercise-note';
    noteDiv.textContent = note;
    card.appendChild(noteDiv);
  }

  const personalNote = document.createElement('label');
  personalNote.className = 'exercise-personal-note';
  personalNote.innerHTML = `<span>${t('exerciseNote')}</span><textarea rows="2" maxlength="500" placeholder="${t('exerciseNotePlaceholder')}"></textarea>`;
  const personalNoteInput = personalNote.querySelector('textarea');
  personalNoteInput.value = state.exerciseNotes[exercise.id] || '';
  personalNoteInput.addEventListener('input', () => { state.exerciseNotes[exercise.id] = personalNoteInput.value; });
  card.appendChild(personalNote);

  // Initialize sets if not already (undefined means first render)
  if (state.exerciseSets[exercise.id] === undefined) {
    state.exerciseSets[exercise.id] = [];
    // Pre-fill from previous workout or create empty sets
    if (prevData && prevData.sets) {
      for (const set of prevData.sets) {
        state.exerciseSets[exercise.id].push({
          weight: set.weight,
          reps: set.reps,
          done: false,
          segments: (set.segments || []).map((segment) => ({ ...segment, done: false }))
        });
      }
      // Add more sets if target is higher
      while (state.exerciseSets[exercise.id].length < targets.targetSets) {
        const lastSet = prevData.sets[prevData.sets.length - 1];
        state.exerciseSets[exercise.id].push(createWorkoutSet(lastSet?.weight ?? 0, lastSet?.reps ?? targets.targetRepsMin, dropCount, resolvedExercise.intensityTechnique));
      }
    } else {
      for (let i = 0; i < targets.targetSets; i++) {
        state.exerciseSets[exercise.id].push(createWorkoutSet(0, targets.targetRepsMin, dropCount, resolvedExercise.intensityTechnique));
      }
    }
  }

  const sets = state.exerciseSets[exercise.id];

  // ── Skipped state: all sets deleted ──
  if (sets.length === 0) {
    const skippedDiv = document.createElement('div');
    skippedDiv.className = 'exercise-skipped';
    skippedDiv.innerHTML = `
      <span class="skipped-label">${t('skippedExercise')}</span>
      <button class="btn-set-action btn-restore">↩ ${t('restore')}</button>
    `;
    skippedDiv.querySelector('.btn-restore').addEventListener('click', () => {
      // Restore default sets
      for (let i = 0; i < targets.targetSets; i++) {
        sets.push(createWorkoutSet(prevData?.sets?.[i]?.weight ?? 0, prevData?.sets?.[i]?.reps ?? targets.targetRepsMin, dropCount, resolvedExercise.intensityTechnique));
      }
      renderExercises();
    });
    card.appendChild(skippedDiv);
    return card;
  }

  // ── Sets container ──
  const setsContainer = document.createElement('div');
  setsContainer.className = 'sets-container';

  // Header row
  const setsHeader = document.createElement('div');
  setsHeader.className = 'sets-header';
  setsHeader.innerHTML = `
    <span>${t('set')}</span><span>${t('weight')}</span><span>${t('reps')}</span>
    <span>✓</span>
  `;
  setsContainer.appendChild(setsHeader);

  // Set rows
  sets.forEach((set, index) => {
    const row = createSetRow(exercise.id, index, set, block.restBetweenRoundsSeconds, session, autoTimer);
    setsContainer.appendChild(row);
    (set.segments || []).forEach((segment, segmentIndex) => {
      setsContainer.appendChild(createDropRow(exercise.id, index, segmentIndex, segment, set, block.restBetweenRoundsSeconds, session, autoTimer));
    });
  });

  // Actions (add / remove / skip)
  const actions = document.createElement('div');
  actions.className = 'set-actions';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-set-action';
  addBtn.innerHTML = t('addSet');
  addBtn.addEventListener('click', () => {
    const lastSet = sets[sets.length - 1];
    sets.push(createWorkoutSet(lastSet ? lastSet.weight : 0, lastSet ? lastSet.reps : targets.targetRepsMin, dropCount, resolvedExercise.intensityTechnique));
    renderExercises();
  });
  actions.appendChild(addBtn);

  if (sets.length > 1) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-set-action';
    removeBtn.innerHTML = t('removeSet');
    removeBtn.addEventListener('click', () => {
      sets.pop();
      renderExercises();
    });
    actions.appendChild(removeBtn);
  }

  // Skip entire exercise (delete ALL sets)
  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn-set-action btn-skip-exercise';
  skipBtn.innerHTML = t('skipExercise');
  skipBtn.addEventListener('click', () => {
    state.exerciseSets[exercise.id] = [];
    renderExercises();
  });
  actions.appendChild(skipBtn);

  setsContainer.appendChild(actions);
  card.appendChild(setsContainer);

  // Rest timer button
  const timerBtn = document.createElement('button');
  timerBtn.className = 'btn-rest-timer';
  timerBtn.innerHTML = t('restTime', { time: formatRestTime(block.restBetweenRoundsSeconds) });
  timerBtn.addEventListener('click', () => startRestTimer(block.restBetweenRoundsSeconds, session.color));
  card.appendChild(timerBtn);

  return card;
}

function createSetRow(exerciseId, index, set, restTime, session, autoTimer = true) {
  const row = document.createElement('div');
  row.className = 'set-row';
  if (set.done) row.classList.add('completed');

  // Set number
  const numDiv = document.createElement('div');
  numDiv.className = 'set-number';
  numDiv.textContent = index + 1;
  row.appendChild(numDiv);

  // Weight input
  const weightGroup = document.createElement('div');
  weightGroup.className = 'set-input-group';
  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.className = 'set-input';
  weightInput.value = set.weight || '';
  // The permanent unit suffix already communicates the unit. Keeping "kg" as
  // a placeholder rendered "kgkg" on compact devices when the field was empty.
  weightInput.placeholder = '';
  weightInput.min = 0;
  weightInput.step = 0.5;
  weightInput.inputMode = 'decimal';
  weightInput.addEventListener('input', (e) => {
    state.exerciseSets[exerciseId][index].weight = parseFloat(e.target.value) || 0;
  });
  weightGroup.appendChild(weightInput);
  const weightUnit = document.createElement('span');
  weightUnit.className = 'set-input-unit';
  weightUnit.textContent = 'kg';
  weightGroup.appendChild(weightUnit);
  row.appendChild(weightGroup);

  // Reps input
  const repsGroup = document.createElement('div');
  repsGroup.className = 'set-input-group';
  const repsInput = document.createElement('input');
  repsInput.type = 'number';
  repsInput.className = 'set-input';
  repsInput.value = set.reps || '';
  repsInput.placeholder = 'reps';
  repsInput.min = 0;
  repsInput.inputMode = 'numeric';
  repsInput.addEventListener('input', (e) => {
    state.exerciseSets[exerciseId][index].reps = parseInt(e.target.value) || 0;
  });
  repsGroup.appendChild(repsInput);
  row.appendChild(repsGroup);

  // Check button
  const checkBtn = document.createElement('div');
  checkBtn.className = 'set-check' + (set.done ? ' checked' : '');
  checkBtn.innerHTML = set.done ? '✓' : '○';
  checkBtn.addEventListener('click', () => {
    set.done = !set.done;
    // Update the inputs with current values before toggling
    state.exerciseSets[exerciseId][index].weight = parseFloat(weightInput.value) || 0;
    state.exerciseSets[exerciseId][index].reps = parseInt(repsInput.value) || 0;
    row.classList.toggle('completed', set.done);
    checkBtn.classList.toggle('checked', set.done);
    checkBtn.innerHTML = set.done ? '✓' : '○';

    // Auto-start rest timer when completing a set
    // For supersets: only after the LAST exercise in the block
    if (set.done && autoTimer && !(set.segments || []).length) {
      startRestTimer(restTime, session.color);
    }
  });
  row.appendChild(checkBtn);

  return row;
}

function createWorkoutSet(weight, reps, dropCount, technique) {
  const reduction = Number(technique?.loadReductionPercent) || 20;
  const segments = Array.from({ length: dropCount }, (_, index) => ({
    type: 'drop',
    weight: Math.max(0, Number(weight) * ((100 - reduction * (index + 1)) / 100)),
    reps: Number(reps) || 0,
    done: false,
  }));
  return { weight: Number(weight) || 0, reps: Number(reps) || 0, done: false, segments };
}

function createDropRow(exerciseId, setIndex, segmentIndex, segment, parentSet, restTime, session, autoTimer) {
  const row = document.createElement('div');
  row.className = 'set-row drop-row' + (segment.done ? ' completed' : '');
  const label = document.createElement('div');
  label.className = 'set-number';
  label.textContent = `D${segmentIndex + 1}`;
  row.appendChild(label);

  const weightGroup = document.createElement('div');
  weightGroup.className = 'set-input-group';
  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.className = 'set-input';
  weightInput.value = segment.weight || '';
  weightInput.placeholder = 'kg';
  weightInput.min = 0;
  weightInput.step = 0.5;
  weightInput.inputMode = 'decimal';
  weightInput.addEventListener('input', () => { segment.weight = parseFloat(weightInput.value) || 0; });
  weightGroup.appendChild(weightInput);
  row.appendChild(weightGroup);

  const repsGroup = document.createElement('div');
  repsGroup.className = 'set-input-group';
  const repsInput = document.createElement('input');
  repsInput.type = 'number';
  repsInput.className = 'set-input';
  repsInput.value = segment.reps || '';
  repsInput.placeholder = 'reps';
  repsInput.min = 0;
  repsInput.inputMode = 'numeric';
  repsInput.addEventListener('input', () => { segment.reps = parseInt(repsInput.value, 10) || 0; });
  repsGroup.appendChild(repsInput);
  row.appendChild(repsGroup);

  const check = document.createElement('div');
  check.className = 'set-check' + (segment.done ? ' checked' : '');
  check.innerHTML = segment.done ? '✓' : '○';
  check.addEventListener('click', () => {
    segment.done = !segment.done;
    row.classList.toggle('completed', segment.done);
    check.classList.toggle('checked', segment.done);
    check.innerHTML = segment.done ? '✓' : '○';
    if (segment.done && autoTimer && parentSet.done && parentSet.segments.every((item) => item.done)) {
      startRestTimer(restTime, session.color);
    }
  });
  row.appendChild(check);
  return row;
}

// ============================================
// REST TIMER
// ============================================
function initTimerControls() {
  document.getElementById('btn-timer-skip').addEventListener('click', () => {
    stopRestTimer();
  });

  document.getElementById('btn-timer-add30').addEventListener('click', () => {
    if (!state.timerEndsAt) return;
    state.timerEndsAt += 30 * 1000;
    state.timerTotal += 30;
    refreshRestTimer();
    if (!state.timerEndsAt) return;
    startRestTimerNotification(state.timerRemaining);
  });
}

function initTimerLifecycle() {
  // setInterval is paused while the WebView is in the background. Refreshing
  // from the absolute end time keeps the in-app timer aligned with Android's
  // foreground notification as soon as the app becomes visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshRestTimer();
  });
  window.addEventListener('focus', refreshRestTimer);
}

function startRestTimer(seconds, color) {
  // Clear any existing timer
  clearInterval(state.timerInterval);

  state.timerTotal = seconds;
  state.timerRemaining = seconds;
  state.timerEndsAt = Date.now() + seconds * 1000;
  startRestTimerNotification(seconds);

  const overlay = document.getElementById('rest-timer-overlay');
  const progress = document.getElementById('timer-progress');
  const timeDisplay = document.getElementById('timer-time');
  const circumference = 2 * Math.PI * 100; // r=100

  // Set color
  progress.style.stroke = color;

  overlay.classList.add('active');

  // Initial render
  progress.style.strokeDasharray = circumference;
  refreshRestTimer();

  state.timerInterval = setInterval(refreshRestTimer, 250);
  persistActiveWorkout();
}

function refreshRestTimer() {
  if (!state.timerEndsAt) return;

  state.timerRemaining = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
  if (state.timerRemaining <= 0) {
    stopRestTimer({ completed: true });
    // Vibrate if supported
    if (getAccessibilityPreferences().haptics && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    return;
  }

  const progress = document.getElementById('timer-progress');
  const timeDisplay = document.getElementById('timer-time');
  const circumference = 2 * Math.PI * 100; // r=100
  const fraction = state.timerRemaining / state.timerTotal;
  progress.style.strokeDashoffset = circumference * (1 - fraction);

  const min = Math.floor(state.timerRemaining / 60);
  const sec = state.timerRemaining % 60;
  timeDisplay.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
}

function stopRestTimer({ completed = false } = {}) {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.timerEndsAt = null;
  state.timerRemaining = 0;
  if (completed) finishRestTimerNotification();
  else dismissRestTimerNotification();
  document.getElementById('rest-timer-overlay').classList.remove('active');
  persistActiveWorkout();
}

// ============================================
// FINISH WORKOUT
// ============================================
function finishWorkout() {
  // Gather all set data from inputs before saving (in case user didn't blur)
  syncInputValues();

  const program = getWorkoutProgram();
  const session = getCurrentWorkoutSession();
  if (!session) return;
  const editingWorkout = state.editingWorkout;
  const endTime = editingWorkout ? Number(editingWorkout.endTime) || Date.now() : Date.now();
  const durationMs = editingWorkout
    ? getRecordedWorkoutDuration(editingWorkout)
    : endTime - state.workoutStartTime;

  // Build exercises array
  const exercises = [];
  for (const block of session.blocks) {
    for (const exercise of block.items) {
      const sets = state.exerciseSets[exercise.id];
      if (!sets || sets.length === 0) continue;

      // Filter to only sets that have data
      const validSets = sets
        .filter(s => s.reps > 0 || s.weight > 0)
        .map((set, index) => ({
          setNumber: index + 1,
          type: 'working',
          weight: set.weight || 0,
          reps: set.reps || 0,
          rir: null,
          completed: set.done,
          segments: (set.segments || []).map((segment) => ({
            type: segment.type || 'drop',
            weight: segment.weight || 0,
            reps: segment.reps || 0,
            completed: Boolean(segment.done),
          })),
        }));

      if (validSets.length === 0) continue;

      const resolvedExercise = getResolvedExercise(exercise, state.choices[exercise.id]);
      exercises.push({
        programExerciseId: exercise.id,
        exerciseId: resolvedExercise.exerciseId,
        exerciseName: resolvedExercise.name,
        selectionId: state.choices[exercise.id] || null,
      intensityTechnique: resolvedExercise.intensityTechnique,
      prescription: resolvedExercise.prescription,
      note: (state.exerciseNotes[exercise.id] || '').trim(),
      sets: validSets
      });
    }
  }

  if (exercises.length === 0) {
    showConfirm(
      t('emptyWorkout'), t('emptyWorkoutDesc'),
      () => {
        cleanupWorkout();
        doNavigate('home');
      }
    );
    return;
  }

  // Compare against the previous occurrence before saving this workout.
  const previousWorkout = getLastWorkout(state.activeSessionId, program.id);

  // Save workout
  const workout = {
    programId: program.id,
    programName: program.name,
    sessionId: state.activeSessionId,
    sessionName: session.name,
    sessionSubtitle: session.subtitle,
    sessionColorRgb: session.colorRgb,
    choices: { ...state.choices },
    exercises,
    date: editingWorkout?.date,
    startTime: editingWorkout ? editingWorkout.startTime : state.workoutStartTime,
    endTime
  };

  if (editingWorkout) {
    updateWorkout(editingWorkout.id, workout);
    const editedDate = editingWorkout.date;
    updateNotification();
    cleanupWorkout();
    doNavigate('calendar');
    openWorkoutDate(editedDate);
    showToast(t('recordedWorkoutSaved'), 'success');
    return;
  }

  const personalRecords = getNewPersonalRecords(exercises);
  saveWorkout({ ...workout, note: state.workoutNote.trim() });

  // Update persistent notification after saving
  updateNotification();

  // Show summary
  showSummary(session, exercises, durationMs, previousWorkout, personalRecords);
  cleanupWorkout();
}

function syncInputValues() {
  // Go through all set inputs and sync their values to state
  const session = getCurrentWorkoutSession();
  if (!session) return;

  // Re-read all input values from the DOM
  const exerciseCards = document.querySelectorAll('.exercise-card');
  // We rely on the state object being the source of truth after each input change event
  // The change events on inputs already update state, so this is mainly a safety check
}

function showSummary(session, exercises, durationMs, previousWorkout = null, personalRecords = []) {
  const overlay = document.getElementById('summary-overlay');
  const sessionInfo = document.getElementById('summary-session');
  const statsContainer = document.getElementById('summary-stats');
  const comparisonContainer = document.getElementById('summary-comparison');

  sessionInfo.textContent = `${localizeText(session.name)} — ${localizeText(session.subtitle)}`;

  const current = getWorkoutMetrics(exercises, durationMs);

  statsContainer.innerHTML = `
    <div class="summary-stat">
      <div class="summary-stat-value">${current.durationMinutes}</div>
      <div class="summary-stat-label">${t('workoutDuration')}</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value">${current.sets}</div>
      <div class="summary-stat-label">${t('sets')}</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value">${current.reps}</div>
      <div class="summary-stat-label">reps</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value">${formatMetric(current.volume)}</div>
      <div class="summary-stat-label">${t('volume')} kg</div>
    </div>
  `;

  if (previousWorkout) {
    const previous = getWorkoutMetrics(previousWorkout.exercises || [], getRecordedWorkoutDuration(previousWorkout));
    comparisonContainer.innerHTML = `
      <h3>${t('comparedToPrevious')}</h3>
      <div class="summary-comparison-grid">
        ${renderMetricComparison(t('workoutDuration'), current.durationMinutes, previous.durationMinutes, t('minutes'))}
        ${renderMetricComparison(t('sets'), current.sets, previous.sets)}
        ${renderMetricComparison('reps', current.reps, previous.reps)}
        ${renderMetricComparison(`${t('volume')} kg`, current.volume, previous.volume)}
      </div>
    `;
  } else {
    comparisonContainer.innerHTML = `<p class="summary-first-workout">${t('firstWorkoutOfSession')}</p>`;
  }

  if (personalRecords.length) {
    comparisonContainer.insertAdjacentHTML('beforeend', `<div class="personal-records"><h3>🏆 ${t('personalRecords')}</h3>${personalRecords.slice(0, 4).map((record) => `<div class="personal-record"><strong>${escapeHtml(record.exerciseName)}</strong><span>${record.type === 'weight' ? t('recordWeight', { value: formatMetric(record.value) }) : t('recordReps', { value: formatMetric(record.value) })}</span></div>`).join('')}</div>`);
  }

  overlay.classList.add('active');
}

function getWorkoutMetrics(exercises, durationMs) {
  return {
    durationMinutes: Math.floor(Math.max(0, durationMs) / 60000),
    sets: exercises.reduce((sum, exercise) => sum + (exercise.sets || []).length, 0),
    reps: exercises.reduce((sum, exercise) => sum + (exercise.sets || []).reduce((setSum, set) => setSum + (Number(set.reps) || 0), 0), 0),
    volume: exercises.reduce((sum, exercise) => sum + (exercise.sets || []).reduce((setSum, set) => setSum + ((Number(set.weight) || 0) * (Number(set.reps) || 0)), 0), 0),
  };
}

function getRecordedWorkoutDuration(workout) {
  const start = Number(workout?.startTime);
  const end = Number(workout?.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0;
}

function renderMetricComparison(label, current, previous, suffix = '') {
  const delta = current - previous;
  const sign = delta > 0 ? '+' : '';
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  const value = `${sign}${formatMetric(delta)}${suffix ? ` ${suffix}` : ''}`;
  return `<div class="summary-comparison-stat"><span>${label}</span><strong class="${direction}">${value}</strong></div>`;
}

function formatMetric(value) {
  const rounded = Math.round(Number(value) || 0);
  return rounded.toLocaleString(getLanguage() === 'fr' ? 'fr-FR' : 'en-US');
}

// ============================================
// CONFIRM DIALOG
// ============================================
function initConfirmDialog() {
  document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.remove('active');
    state.confirmCallback = null;
  });

  document.getElementById('btn-confirm-ok').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.remove('active');
    if (state.confirmCallback) {
      state.confirmCallback();
      state.confirmCallback = null;
    }
  });
}

function showConfirm(title, message, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  state.confirmCallback = callback;
  document.getElementById('confirm-overlay').classList.add('active');
}

// Make showConfirm available globally for calendar module
window.showConfirm = showConfirm;

// ============================================
// UTILITIES
// ============================================
function formatRestTime(seconds) {
  if (seconds >= 60) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return sec > 0 ? `${min}min${sec.toString().padStart(2, '0')}` : `${min}min`;
  }
  return `${seconds}s`;
}

// ============================================
// SETTINGS
// ============================================
function initSettings() {
  const overlay = document.getElementById('settings-overlay');
  const btnOpen = document.getElementById('btn-settings');
  const btnClose = document.getElementById('btn-settings-close');
  const btnExport = document.getElementById('btn-export-data');
  const btnImport = document.getElementById('btn-import-data');
  const fileInput = document.getElementById('import-file-input');
  const btnExportPrograms = document.getElementById('btn-export-programs');
  const btnImportPrograms = document.getElementById('btn-import-programs');
  const programsFileInput = document.getElementById('import-programs-file-input');
  const btnCopyAiTemplate = document.getElementById('btn-copy-ai-template');
  const languageSelect = document.getElementById('settings-language');
  languageSelect.value = getLanguage();
  languageSelect.addEventListener('change', () => setLanguage(languageSelect.value));

  const themeSelect = document.getElementById('settings-theme');
  themeSelect.value = getTheme();
  themeSelect.addEventListener('change', () => setTheme(themeSelect.value));

  // Open/close settings
  btnOpen.addEventListener('click', () => {
    overlay.classList.add('active');
  });

  btnClose.addEventListener('click', () => {
    overlay.classList.remove('active');
  });

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });

  btnCopyAiTemplate.addEventListener('click', async () => {
    const copied = await copyText(buildAiProgramPrompt());
    showToast(t(copied ? 'aiTemplateCopied' : 'aiTemplateCopyError'), copied ? 'success' : 'error');
  });

  // Export data
  btnExport.addEventListener('click', async () => {
    const data = exportData();
    const summary = getExportSummary();
    if (summary.workouts === 0 && summary.programs === 0) {
      showToast(t('noDataExport'), 'error');
      return;
    }

    const dateStr = formatLocalDate();
    const fileName = `muscu_tracker_${dateStr}.json`;

    // Native Android: use Filesystem + Share
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      try {
        const Filesystem = window.Capacitor.Plugins.Filesystem;
        const Share = window.Capacitor.Plugins.Share;

        // Write to cache directory
        const result = await Filesystem.writeFile({
          path: fileName,
          data: data,
          directory: 'CACHE',
          encoding: 'utf8'
        });

        // Share the file (user chooses: Save, Drive, Email, etc.)
        await Share.share({
          title: 'Muscu Tracker — Export',
          text: t('exportedData').replace(' ✓', ''),
          url: result.uri,
          dialogTitle: t('exportDialog')
        });

        showToast(t('exportedData'), 'success');
      } catch (err) {
        console.error('Native export failed:', err);
        showToast(t('exportError'), 'error');
      }
      return;
    }

    // Web fallback: blob download
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('exportedData'), 'success');
  });

  // Export programs only — workout history is never included in this file.
  btnExportPrograms.addEventListener('click', async () => {
    const data = exportProgramsData();
    if (getProgramsExportSummary().programs === 0) {
      showToast(t('noProgramsExport'), 'error');
      return;
    }

    const dateStr = formatLocalDate();
    const fileName = `muscu_tracker_programmes_${dateStr}.json`;

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      try {
        const Filesystem = window.Capacitor.Plugins.Filesystem;
        const Share = window.Capacitor.Plugins.Share;
        const result = await Filesystem.writeFile({
          path: fileName,
          data,
          directory: 'CACHE',
          encoding: 'utf8'
        });
        await Share.share({
          title: 'Muscu Tracker — Programmes',
          text: t('exportedPrograms').replace(' ✓', ''),
          url: result.uri,
          dialogTitle: t('exportPrograms')
        });
        showToast(t('exportedPrograms'), 'success');
      } catch (err) {
        console.error('Native program export failed:', err);
        showToast(t('exportError'), 'error');
      }
      return;
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('exportedPrograms'), 'success');
  });

  // Import data
  btnImport.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;

      // Validate JSON
      try {
        JSON.parse(content);
        const incoming = getImportSummary(content);
        if (!incoming) {
          showToast(t('invalidExportData'), 'error');
          return;
        }

        const current = getExportSummary();
        const hasCurrentData = current.workouts > 0
          || current.programs > 0
          || current.supplements > 0
          || current.baseProgramCustomized;

        if (hasCurrentData) {
          showConfirm(
            t('importData'), t('importConfirm'),
            () => {
              if (importData(content)) {
                showToast(t('importedData'), 'success');
                renderHome();
                const now = new Date();
                renderCalendar(now.getFullYear(), now.getMonth());
                refreshStatsSelector();
                updateCharts();
              } else {
                showToast(t('importError'), 'error');
              }
            }
          );
        } else {
          if (importData(content)) {
            showToast(t('importedData'), 'success');
            renderHome();
            const now = new Date();
            renderCalendar(now.getFullYear(), now.getMonth());
            refreshStatsSelector();
            updateCharts();
          } else {
            showToast(t('importError'), 'error');
          }
        }
      } catch {
        showToast(t('invalidJson'), 'error');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be imported again
    fileInput.value = '';
  });

  // Import programs only. Existing workout records stay untouched.
  btnImportPrograms.addEventListener('click', () => {
    programsFileInput.click();
  });

  programsFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      try {
        JSON.parse(content);
        if (!getProgramsImportSummary(content)) {
          showToast(t('invalidExportData'), 'error');
          return;
        }

        showConfirm(
          t('importPrograms'), t('programsImportConfirm'),
          () => {
            if (!importProgramsData(content)) {
              showToast(t('importError'), 'error');
              return;
            }
            showToast(t('importedPrograms'), 'success');
            window.dispatchEvent(new Event('programs:imported'));
            renderHome();
            renderPrograms();
            refreshStatsSelector();
            updateCharts();
            updateNotification();
          }
        );
      } catch {
        showToast(t('invalidJson'), 'error');
      }
    };
    reader.readAsText(file);
    programsFileInput.value = '';
  });
}

// ============================================
// TOAST
// ============================================
function showToast(message, type = '') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

window.showToast = showToast;
