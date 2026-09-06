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
import {
  completeFromUrl,
  consumePendingPasswordReset,
  getCurrentUser,
  initAuth,
  onAuthChange,
  requestPasswordReset,
  resetPassword,
  sendMagicLink,
  signInEmail,
  signInGoogle,
  signOut,
  signUpEmail,
} from './services/auth.js';
import { acceptAccountSwitch, getSyncStatus, initSync, onSyncStatusChange, syncNow } from './services/sync.js';
import { getActiveProgram, getProgramById, restorePrograms, saveProgram, setActiveProgram } from './services/program-storage.js';
import { getOnboardingProgramTemplate } from './data/onboarding-programs.js';
import { getCustomExercises } from './services/custom-exercises.js';
import { formatLocalDate, localDateToDayNumber } from './services/date-utils.js';
import { escapeHtml } from './services/html.js';
import { insertNotePrompt } from './services/note-editor.js';
import { getExerciseCompletionState, getWorkoutCompletionProgress } from './services/workout-progress.js';
import { getLanguage, localizeText, setLanguage, t, translateDocument } from './i18n.js';
import { runTour, showTip, markAllTipsSeen } from './coachmark.js';
import { hasSeenProgramNote, markProgramNoteSeen } from './services/program-notes.js';
import { installSettingsSyncBridge } from './services/settings-sync.js';

// Installed before any setting is read/written below (setTheme/setVisualStyle
// run at the bottom of this section) so every write to a synced preference is
// timestamped for sync from the very first one.
installSettingsSyncBridge();

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
  openNoteEditors: new Set(),
  confirmCallback: null,
  confirmCancelCallback: null,
};

const ONBOARDING_KEY = 'muscu_onboarding_completed';
const TIPS_BOOTSTRAPPED_KEY = 'muscu_tips_bootstrapped';
const LAST_EXPORT_KEY = 'muscu_last_export_at';
const EXPORT_REMINDER_SNOOZE_KEY = 'muscu_export_reminder_snoozed_until';
const EXPORT_REMINDER_INTERVAL_DAYS = 30;
const EXPORT_REMINDER_SNOOZE_DAYS = 14;
// Device-local only: whether the post-first-workout account prompt has been
// shown/dismissed. Deliberately not in settings-sync.js's TRACKED_KEYS — a
// prompt already seen on this device should still be offered on another.
const SYNC_PROMPT_SEEN_KEY = 'muscu_sync_prompt_seen';
const THEME_KEY = 'muscu_theme';
const STYLE_KEY = 'muscu_visual_style';
const VISUAL_STYLES = ['default', 'piste', 'nothing'];
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
  void syncWorkoutWakeLock(next);
}

function applyAccessibilityPreferences(preferences = getAccessibilityPreferences()) {
  const root = document.documentElement;
  root.dataset.textSize = ['normal', 'large', 'xlarge'].includes(preferences.textSize) ? preferences.textSize : 'normal';
  root.classList.toggle('high-contrast', Boolean(preferences.highContrast));
  root.classList.toggle('reduce-motion', Boolean(preferences.reducedMotion));
}

let workoutWakeLock = null;

async function syncWorkoutWakeLock(preferences = getAccessibilityPreferences()) {
  const shouldStayAwake = Boolean(preferences.keepScreenAwake)
    && Boolean(state.workoutSession)
    && document.visibilityState !== 'hidden';

  if (!shouldStayAwake) {
    if (workoutWakeLock) {
      const lock = workoutWakeLock;
      workoutWakeLock = null;
      try { await lock.release(); } catch { /* The system may already have released it. */ }
    }
    return;
  }

  if (workoutWakeLock || !navigator.wakeLock?.request) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    workoutWakeLock = lock;
    lock.addEventListener('release', () => {
      if (workoutWakeLock === lock) workoutWakeLock = null;
    });
  } catch (error) {
    console.warn('[Accessibility] Unable to keep the screen awake:', error);
  }
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

function getVisualStyle() {
  const stored = localStorage.getItem(STYLE_KEY);
  return VISUAL_STYLES.includes(stored) ? stored : 'default';
}

function setVisualStyle(style) {
  const selectedStyle = VISUAL_STYLES.includes(style) ? style : 'default';
  if (selectedStyle === 'default') {
    delete document.documentElement.dataset.style;
  } else {
    document.documentElement.dataset.style = selectedStyle;
  }
  localStorage.setItem(STYLE_KEY, selectedStyle);
  window.dispatchEvent(new Event('themechange'));
}

setTheme(getTheme());
setVisualStyle(getVisualStyle());
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

function fitNoteTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 96), 180)}px`;
}

function createNoteComposer({ id, title, placeholder, value, previousValue = '', maxLength, icon, onInput }) {
  const composer = document.createElement('details');
  composer.className = 'note-composer';
  composer.open = state.openNoteEditors.has(id);
  const previousNote = String(previousValue || '').trim();

  const renderValueState = () => {
    const textarea = composer.querySelector('textarea');
    const currentValue = textarea.value;
    const hasContent = Boolean(currentValue.trim());
    composer.classList.toggle('has-content', hasContent);
    composer.querySelector('.note-composer-preview').textContent = hasContent
      ? currentValue.trim().replace(/\s+/g, ' ')
      : previousNote
        ? t('previousNotePreview', { note: previousNote.replace(/\s+/g, ' ') })
        : t('noteEmptyHint');
    composer.querySelector('.note-composer-state').textContent = t(hasContent ? 'noteSaved' : 'noteAdd');
    composer.querySelector('.note-composer-count').textContent = `${currentValue.length}/${maxLength}`;
    fitNoteTextarea(textarea);
  };

  composer.innerHTML = `
    <summary class="note-composer-summary">
      <span class="note-composer-icon" aria-hidden="true">${icon}</span>
      <span class="note-composer-heading"><strong>${escapeHtml(title)}</strong><span class="note-composer-preview"></span></span>
      <span class="note-composer-state"></span>
      <span class="note-composer-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="note-composer-body">
      ${previousNote ? `<div class="note-previous"><span><strong>${escapeHtml(t('previousNote'))}</strong><span>${escapeHtml(previousNote)}</span></span><button type="button" data-use-previous-note>${escapeHtml(t('reuseNote'))}</button></div>` : ''}
      <textarea maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}" autocapitalize="sentences"></textarea>
      <div class="note-composer-prompts" aria-label="${escapeHtml(t('noteQuickPrompts'))}">
        ${['Technique', 'Pain', 'Equipment', 'Progress'].map((name) => `<button type="button" data-note-prompt="notePrompt${name}">＋ ${escapeHtml(t(`notePrompt${name}`))}</button>`).join('')}
      </div>
      <div class="note-composer-footer"><span><span class="note-save-dot" aria-hidden="true"></span>${escapeHtml(t('noteAutoSave'))}</span><span class="note-composer-count"></span></div>
    </div>`;

  const textarea = composer.querySelector('textarea');
  textarea.value = value || '';
  textarea.addEventListener('input', () => {
    onInput(textarea.value);
    renderValueState();
  });
  textarea.addEventListener('focus', () => {
    setTimeout(() => composer.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  });
  composer.querySelectorAll('[data-note-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      const prompt = `${t(button.dataset.notePrompt)} : `;
      const result = insertNotePrompt(textarea.value, prompt, textarea.selectionStart, textarea.selectionEnd, maxLength);
      textarea.value = result.value;
      textarea.focus();
      textarea.setSelectionRange(result.cursor, result.cursor);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  composer.querySelector('[data-use-previous-note]')?.addEventListener('click', () => {
    textarea.value = previousNote.slice(0, maxLength);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
  composer.addEventListener('toggle', () => {
    if (composer.open) state.openNoteEditors.add(id);
    else state.openNoteEditors.delete(id);
  });
  requestAnimationFrame(renderValueState);
  return composer;
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
  bootstrapOneTimeTips();
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
  initAuthScreen();
  initAccountView();
  initAccountRow();
  initBackupReminder();
  initSyncPrompt();
  initAccountButton();
  initSelectPicker();
  initNotifications();
  initAuth();
  initSync();
  handlePendingPasswordReset();
  // A different account just signed in on a device that still holds the
  // previous one's data. services/sync.js has blocked syncing until this is
  // resolved either way — accepting wipes the old data (it stays on its own
  // account), declining signs back out rather than leaving two accounts'
  // records mixed on one device.
  window.addEventListener('sync:account-switch', (event) => {
    const { previous, next } = event.detail || {};
    showConfirm(
      t('accountSwitchTitle'),
      t('accountSwitchMessage', { previous: previous?.email || '—', next: next?.email || '—' }),
      async () => {
        await acceptAccountSwitch(next);
        showToast(t('accountSwitchDone'), 'success');
      },
      () => signOut(),
    );
  });

  window.addEventListener('auth:password-reset-requested', (event) => {
    const detail = event.detail || {};
    if (detail.token) openAuthScreen({ mode: 'reset', token: detail.token });
    else if (detail.error === 'invalid') openAuthScreen({ mode: 'auth', error: t('authResetInvalid') });
  });
  if (window.Capacitor?.isNativePlatform()) {
    window.Capacitor.Plugins.App?.addListener('appUrlOpen', ({ url }) => {
      if (url?.startsWith('gymtracker://auth-callback')) completeFromUrl(url);
    });
  }
  initPrograms();
  initOnboarding();
  initWorkoutDraftPersistence();
  restoreActiveWorkoutDraft();
  window.addEventListener('workout:edit-requested', (event) => {
    const workout = getWorkouts().find((item) => item.id === event.detail?.workoutId);
    if (workout) startRecordedWorkoutEdit(workout);
  });
  window.addEventListener('supplements:updated', () => {
    renderHomeSupplements();
    updateNotification();
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
    renderAccountButton();
    renderAccountRow();
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
  // Fires both for local edits and after a sync pull merges in remote
  // changes (see services/sync-adapters.js) — refresh the same views a
  // program change would, minus renderPrograms (a workout doesn't affect it).
  window.addEventListener('workouts:changed', () => {
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

// True only while the app is still untouched: nothing recorded, no program of
// their own, no supplement. Anything else means the user already has data worth
// protecting, whether or not they went through the onboarding.
function isPristineFirstRun() {
  const summary = getExportSummary();
  return summary.workouts === 0
    && summary.programs === 0
    && summary.supplements === 0
    && !summary.baseProgramCustomized
    && getCustomExercises().length === 0
    && !getActiveWorkoutDraft();
}

function shouldShowOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY) === 'true') return false;
  return isPristineFirstRun();
}

// The one-time contextual hints, each shown at most once ever. They live in
// several modules (rest timer, home supplements, program editor, settings).
const ONE_TIME_TIP_IDS = ['rest-timer-fullscreen', 'supplements-check-tap', 'intensity-technique', 'settings-advanced'];

// Decided once, on the first launch after this code ships. Someone updating the
// app has no seen-tips record yet, so every hint would fire at once for
// features they've been using for months — mark them all seen instead. A fresh
// install is left alone and still gets the four tips as it meets each feature.
function bootstrapOneTimeTips() {
  if (localStorage.getItem(TIPS_BOOTSTRAPPED_KEY) === 'true') return;
  localStorage.setItem(TIPS_BOOTSTRAPPED_KEY, 'true');
  if (!shouldShowOnboarding()) markAllTipsSeen(ONE_TIME_TIP_IDS);
}

function completeOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
  closeOnboardingOverlay();
}

// Each step spotlights a real element of the actual UI (navigating between
// views as needed) instead of showing a generic card, so users see exactly
// where each feature lives.
const MAIN_TOUR_STEPS = [
  { view: 'home', target: '#home-stats', title: 'tourHomeTitle', body: 'tourHomeDesc' },
  { target: '#supplements-home-card', title: 'tourSupplementsTitle', body: 'tourSupplementsDesc' },
  { target: '#session-grid', title: 'tourSessionsTitle', body: 'tourSessionsDesc' },
  { view: 'calendar', target: '#calendar-legend-details', title: 'tourCalendarTitle', body: 'tourCalendarDesc' },
  { view: 'stats', target: '#stats-group-selector', title: 'tourStatsTitle', body: 'tourStatsDesc' },
  { view: 'programs', target: ['.program-card', '#programs-content'], title: 'tourProgramsTitle', body: 'tourProgramsDesc' },
  { view: 'home', target: '#btn-settings', title: 'tourSettingsTitle', body: 'tourSettingsDesc' },
];

// Keep the first-run walkthrough light. The complete seven-step guide remains
// available from Settings > Help once the user wants the full tour.
const INITIAL_TOUR_STEPS = [MAIN_TOUR_STEPS[0], MAIN_TOUR_STEPS[2], MAIN_TOUR_STEPS[6]];

function localizedTourSteps(steps = MAIN_TOUR_STEPS) {
  return steps.map((step) => ({ ...step, title: t(step.title), body: t(step.body) }));
}

function startMainTour(onFinish = () => doNavigate('home'), { complete = false } = {}) {
  const steps = complete ? MAIN_TOUR_STEPS : INITIAL_TOUR_STEPS;
  runTour(localizedTourSteps(steps), { navigate: doNavigate, onFinish });
}

let onboardingPreviousFocus = null;

function openOnboardingOverlay() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  if (!overlay.classList.contains('active')) onboardingPreviousFocus = document.activeElement;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    overlay.querySelector('[data-onboarding-program].primary, button')?.focus({ preventScroll: true });
  });
}

function closeOnboardingOverlay() {
  const overlay = document.getElementById('onboarding-overlay');
  const ownedFocus = overlay?.contains(document.activeElement);
  overlay?.classList.remove('active');
  overlay?.setAttribute('aria-hidden', 'true');
  if (ownedFocus && onboardingPreviousFocus?.isConnected && typeof onboardingPreviousFocus.focus === 'function') {
    onboardingPreviousFocus.focus({ preventScroll: true });
  }
  onboardingPreviousFocus = null;
}

function skipOnboarding() {
  // On a genuine first run a skip leaves the user with no program at all: the
  // home screen then invites them to create or pick one whenever they're ready,
  // instead of forcing a choice up front. The overlay is also reachable later
  // on (debug button, "Explorer" on the empty home), so anyone who already has
  // data keeps every program they built.
  if (isPristineFirstRun()) restorePrograms([], null);
  completeOnboarding();
  doNavigate('home');
}

function initOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  overlay.querySelectorAll('[data-onboarding-program]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = getOnboardingProgramTemplate(button.dataset.onboardingProgram);
      if (!template) return;
      const saved = saveProgram(template);
      setActiveProgram(saved.id);
      completeOnboarding();
      doNavigate('home');
      startMainTour();
    });
  });
  overlay.querySelector('[data-onboarding-action="create"]')?.addEventListener('click', () => {
    completeOnboarding();
    startMainTour(() => {
      doNavigate('programs');
      openNewProgramEditor();
    });
  });
  overlay.querySelector('[data-onboarding-action="import"]')?.addEventListener('click', () => {
    const input = document.getElementById('import-programs-file-input');
    if (!input) return;
    input.dataset.importSource = 'onboarding';
    input.click();
  });
  document.getElementById('btn-onboarding-skip')?.addEventListener('click', skipOnboarding);
  window.addEventListener('programs:imported', (event) => {
    if (event.detail?.source !== 'onboarding') return;
    completeOnboarding();
    startMainTour(() => doNavigate('programs'));
  });

  document.getElementById('btn-home-empty-create')?.addEventListener('click', () => {
    doNavigate('programs');
    openNewProgramEditor();
  });
  document.getElementById('btn-home-empty-explore')?.addEventListener('click', openOnboardingOverlay);

  // aria-modal does not constrain keyboard navigation by itself. Keep Tab
  // inside the welcome dialog; Escape only hides it, without marking the
  // onboarding complete, so it stays reachable from the empty home.
  overlay.addEventListener('keydown', (event) => {
    if (!overlay.classList.contains('active')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOnboardingOverlay();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (shouldShowOnboarding()) openOnboardingOverlay();
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
  refreshViewData(viewName);

  // Views share one document scroll position. Without resetting it, switching
  // from a scrolled screen could open the next screen with its header clipped.
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function refreshViewData(viewName) {
  if (viewName === 'home') renderHome();
  if (viewName === 'calendar') {
    const now = new Date();
    renderCalendar(now.getFullYear(), now.getMonth());
  }
  if (viewName === 'stats') updateCharts();
  if (viewName === 'programs') renderPrograms();
  if (viewName === 'supplements') renderSupplements();
}

// active-workout-patch.js switches views directly (bypassing doNavigate) while
// a workout is minimized, to avoid clobbering state.currentView. It asks for
// the resulting screen's data render through this event instead.
window.addEventListener('browsing:view-render-requested', (event) => {
  refreshViewData(event.detail?.view);
});

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
// Section labels only exist for the alternate visual styles: keep each one in
// sync with the block it introduces so none of them dangles over an empty area.
function syncSectionEyebrows() {
  document.querySelectorAll('[data-eyebrow-for]').forEach((eyebrow) => {
    const target = document.getElementById(eyebrow.dataset.eyebrowFor);
    const visible = Boolean(target) && target.style.display !== 'none' && target.childElementCount > 0;
    eyebrow.hidden = !visible;
  });
}

function renderHomeDate() {
  const dateElement = document.getElementById('home-date');
  if (!dateElement) return;
  const locale = getLanguage() === 'en' ? 'en-GB' : 'fr-FR';
  dateElement.textContent = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

// A signed-in account with a working sync is itself a backup: nagging about
// manual export on top of that would be a flat-out contradiction ("nothing
// recent... to not lose anything" while everything is already saved online).
function isSyncHealthy() {
  const { status } = getSyncStatus();
  return status !== 'error' && status !== 'expired';
}

// True once there's real data worth losing and no recent export to fall back
// on. Disabling Android's auto-backup (see isPristineFirstRun's comment)
// removed the only safety net users had, so this nudges toward the existing
// manual export instead of silently relying on the OS.
function shouldShowBackupReminder() {
  const summary = getExportSummary();
  if (summary.workouts === 0 && summary.programs === 0 && summary.supplements === 0) return false;

  if (getCurrentUser() && isSyncHealthy()) return false;

  const snoozedUntil = Number(localStorage.getItem(EXPORT_REMINDER_SNOOZE_KEY));
  if (snoozedUntil && Date.now() < snoozedUntil) return false;

  const lastExportAt = localStorage.getItem(LAST_EXPORT_KEY);
  if (!lastExportAt) return true;
  const daysSinceExport = (Date.now() - new Date(lastExportAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceExport >= EXPORT_REMINDER_INTERVAL_DAYS;
}

function renderBackupReminder() {
  const banner = document.getElementById('backup-reminder');
  if (!banner) return;
  banner.hidden = !shouldShowBackupReminder();
  if (banner.hidden) return;

  // Signed-out is the best moment to pitch an account: there IS something to
  // lose right now. Once signed in (but sync unhealthy) the reminder is back
  // to a plain export nudge — offering to "create an account" would be moot.
  const offerAccount = !getCurrentUser();
  const descEl = banner.querySelector('.backup-reminder-text p');
  const accountBtn = document.getElementById('btn-backup-reminder-account');
  if (descEl) {
    const descKey = offerAccount ? 'backupReminderDescAccount' : 'backupReminderDesc';
    descEl.dataset.i18n = descKey;
    descEl.textContent = t(descKey);
  }
  if (accountBtn) accountBtn.hidden = !offerAccount;
}

async function downloadJsonFile(data, fileName) {
  if (window.Capacitor?.isNativePlatform()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    await Filesystem.writeFile({
      path: fileName,
      data,
      directory: 'DOCUMENTS',
      encoding: 'utf8',
    });
    return;
  }

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportFullBackup() {
  const data = exportData();
  const summary = getExportSummary();
  if (summary.workouts === 0 && summary.programs === 0) {
    showToast(t('noDataExport'), 'error');
    return;
  }

  const dateStr = formatLocalDate();
  const fileName = `muscu_tracker_${dateStr}.json`;

  try {
    await downloadJsonFile(data, fileName);
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
    showToast(t('exportedData'), 'success');
    renderBackupReminder();
  } catch (err) {
    console.error('Data download failed:', err);
    showToast(t('exportError'), 'error');
  }
}

function initBackupReminder() {
  document.getElementById('btn-backup-reminder-export')?.addEventListener('click', exportFullBackup);
  document.getElementById('btn-backup-reminder-account')?.addEventListener('click', openAccountEntryPoint);
  document.getElementById('btn-backup-reminder-dismiss')?.addEventListener('click', () => {
    localStorage.setItem(EXPORT_REMINDER_SNOOZE_KEY, String(Date.now() + EXPORT_REMINDER_SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    renderBackupReminder();
  });
  // Auth/sync state directly decides whether this banner should show at all
  // (see shouldShowBackupReminder) — re-render whenever either changes, so it
  // doesn't linger after a sign-in.
  onAuthChange(renderBackupReminder);
  onSyncStatusChange(renderBackupReminder);
}

// Shared by the backup reminder, the post-first-workout sync prompt, the
// header account button, and the settings account row — every entry point
// into "go deal with your account". Routes straight into the auth screen
// overlay: its sign-in view when signed out, its account view (sync status,
// sign out — see initAccountView) when already signed in.
function openAccountEntryPoint() {
  openAuthScreen({ mode: getCurrentUser() ? 'account' : 'auth' });
}

// ============================================
// SYNC ACCOUNT PROMPT
// ============================================
// Offered once, right after the first workout is ever recorded — the moment
// the user actually has something to lose, unlike onboarding where there's
// still nothing at stake and the prompt would just be dismissed on reflex.
function hasSeenSyncPrompt() {
  return localStorage.getItem(SYNC_PROMPT_SEEN_KEY) === '1';
}

function markSyncPromptSeen() {
  localStorage.setItem(SYNC_PROMPT_SEEN_KEY, '1');
}

let syncPromptPreviousFocus = null;

function openSyncPromptOverlay() {
  const overlay = document.getElementById('sync-prompt-overlay');
  if (!overlay) return;
  syncPromptPreviousFocus = document.activeElement;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    document.getElementById('btn-sync-prompt-accept')?.focus({ preventScroll: true });
  });
}

function closeSyncPromptOverlay() {
  const overlay = document.getElementById('sync-prompt-overlay');
  overlay?.classList.remove('active');
  overlay?.setAttribute('aria-hidden', 'true');
  if (syncPromptPreviousFocus?.isConnected && typeof syncPromptPreviousFocus.focus === 'function') {
    syncPromptPreviousFocus.focus({ preventScroll: true });
  }
  syncPromptPreviousFocus = null;
}

// Never shown over the summary overlay — only called from its close handler,
// once it has already been dismissed.
function maybeShowSyncPrompt() {
  if (getCurrentUser() || hasSeenSyncPrompt()) return;
  if (getWorkouts().length !== 1) return;
  openSyncPromptOverlay();
}

function initSyncPrompt() {
  const overlay = document.getElementById('sync-prompt-overlay');
  if (!overlay) return;

  document.getElementById('btn-sync-prompt-accept')?.addEventListener('click', () => {
    markSyncPromptSeen();
    closeSyncPromptOverlay();
    openAccountEntryPoint();
  });
  document.getElementById('btn-sync-prompt-later')?.addEventListener('click', () => {
    markSyncPromptSeen();
    closeSyncPromptOverlay();
  });
  overlay.addEventListener('click', (event) => {
    if (event.target !== overlay) return;
    markSyncPromptSeen();
    closeSyncPromptOverlay();
  });
  // Same keyboard-trap pattern as the onboarding overlay: Escape dismisses
  // (counts as "later" — the user made a choice), Tab stays inside the card.
  overlay.addEventListener('keydown', (event) => {
    if (!overlay.classList.contains('active')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      markSyncPromptSeen();
      closeSyncPromptOverlay();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

// ============================================
// HEADER ACCOUNT BUTTON
// ============================================
// Always visible, signed in or out — the permanent, discoverable entry point
// into the account that used to be missing (Settings was the only way in).
// Once signed in it also carries the sync state as a small badge dot: quiet
// while everything's fine, clearly flagged on error/expired session, and
// animated while a sync is in flight.
function renderAccountButton() {
  const btn = document.getElementById('btn-account');
  const dot = document.getElementById('btn-account-sync-dot');
  const glyph = document.getElementById('btn-account-glyph');
  const initial = document.getElementById('btn-account-initial');
  if (!btn || !dot) return;
  const user = getCurrentUser();
  btn.classList.remove('btn-account--syncing', 'btn-account--error', 'btn-account--expired');
  if (!user) {
    dot.hidden = true;
    if (glyph) glyph.hidden = false;
    if (initial) initial.hidden = true;
    btn.setAttribute('aria-label', t('accountButtonSignedOut'));
    return;
  }

  // Signed in, the generic person glyph gives way to the account's own
  // initial: it tells the two header buttons apart at a glance, and doubles
  // as the confirmation that this device is signed in as someone.
  if (glyph && initial) {
    initial.textContent = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
    glyph.hidden = true;
    initial.hidden = false;
  }
  dot.hidden = false;
  const { status } = getSyncStatus();
  let label;
  if (status === 'syncing') {
    btn.classList.add('btn-account--syncing');
    label = t('syncStatusSyncing');
  } else if (status === 'error') {
    btn.classList.add('btn-account--error');
    label = t('syncStatusError');
  } else if (status === 'expired') {
    btn.classList.add('btn-account--expired');
    label = t('syncStatusExpired');
  } else {
    label = t('syncIndicatorSynced');
  }
  btn.setAttribute('aria-label', label);
}

function initAccountButton() {
  const btn = document.getElementById('btn-account');
  if (!btn) return;
  btn.addEventListener('click', openAccountEntryPoint);
  renderAccountButton();
  onAuthChange(renderAccountButton);
  onSyncStatusChange(renderAccountButton);
}

// ============================================
// SETTINGS ACCOUNT ROW
// ============================================
// The only account-related UI left in Settings: a single row, in both
// states, that opens the auth screen overlay (see openAccountEntryPoint) —
// email, sync status and sign-out now live only in its account view
// (initAccountView), not duplicated here.
function renderAccountRow() {
  const label = document.getElementById('account-row-label');
  const desc = document.getElementById('account-row-desc');
  const btn = document.getElementById('btn-account-row-open');
  if (!label || !btn) return;
  const user = getCurrentUser();
  if (user) {
    label.removeAttribute('data-i18n');
    label.textContent = user.email;
    if (desc) desc.hidden = true;
    btn.dataset.i18n = 'accountManage';
    btn.textContent = t('accountManage');
  } else {
    label.dataset.i18n = 'accountRowSignedOut';
    label.textContent = t('accountRowSignedOut');
    if (desc) desc.hidden = false;
    btn.dataset.i18n = 'accountOpen';
    btn.textContent = t('accountOpen');
  }
}

function initAccountRow() {
  const btn = document.getElementById('btn-account-row-open');
  if (!btn) return;
  btn.addEventListener('click', openAccountEntryPoint);
  renderAccountRow();
  onAuthChange(renderAccountRow);
}

function renderHome() {
  renderBackupReminder();
  const program = getActiveProgram();
  const emptyState = document.getElementById('home-empty-state');
  const homeStats = document.getElementById('home-stats');
  const nextSessionHint = document.getElementById('next-session-hint');
  const grid = document.getElementById('session-grid');

  renderHomeDate();

  if (!program) {
    emptyState.setAttribute('aria-hidden', 'false');
    homeStats.style.display = 'none';
    nextSessionHint.style.display = 'none';
    grid.style.display = 'none';
    grid.innerHTML = '';
    renderHomeSupplements();
    syncSectionEyebrows();
    return;
  }

  emptyState.setAttribute('aria-hidden', 'true');
  homeStats.style.display = '';
  nextSessionHint.style.display = '';
  grid.style.display = '';

  // Update stats
  const stats = getStats(program);
  document.getElementById('stat-total').textContent = stats.totalWorkouts;
  document.getElementById('stat-streak').textContent = stats.streak;
  document.getElementById('stat-month').textContent = stats.thisMonth;

  // Suggested session
  const nextSession = getNextSession(program);
  const sessionData = program.sessions[nextSession];
  document.getElementById('next-session-name').textContent =
    `${localizeText(sessionData.name)} · ${localizeText(sessionData.subtitle)}`;

  renderHomeSupplements();

  // Session cards
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

  syncSectionEyebrows();
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
  title.innerHTML = `<span class="supplements-icon" aria-hidden="true"><svg class="icon-glyph icon-glyph--md" viewBox="0 0 24 24"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg></span><div><h2 id="supplements-home-title">${t('supplements')}</h2><p>${supplements.length ? t('supplementsProgress', { taken: status.taken, total: status.total }) : t('supplementsEmptyHome')}</p></div>`;
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

  if (document.getElementById('view-home')?.classList.contains('active')) {
    showTip('supplements-check-tap', {
      target: '.supplements-checklist',
      title: t('tipSupplementsCheckTitle'),
      body: t('tipSupplementsCheckDesc'),
    });
  }
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
    const supplement = supplements.find((item) => item.id === button.dataset.supplementId);
    if (!supplement) return;
    showConfirm(t('remove'), t('deleteSupplementConfirm', { name: supplement.name }), () => {
      deleteSupplement(supplement.id);
      renderSupplements();
      renderHomeSupplements();
      updateNotification();
      const now = new Date();
      renderCalendar(now.getFullYear(), now.getMonth());
    });
  }));
}

// ============================================
// WORKOUT SESSION
// ============================================
function setWorkoutActionsOpen(open) {
  const trigger = document.getElementById('btn-workout-more');
  const menu = document.getElementById('workout-actions-menu');
  if (!trigger || !menu) return;
  trigger.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
}

function initWorkoutControls() {
  const exercisesContainer = document.getElementById('workout-exercises');
  const actions = document.querySelector('.workout-actions');

  document.getElementById('btn-workout-more').addEventListener('click', (event) => {
    event.stopPropagation();
    const open = document.getElementById('btn-workout-more').getAttribute('aria-expanded') !== 'true';
    setWorkoutActionsOpen(open);
    if (open && event.detail === 0) document.getElementById('btn-workout-edit').focus();
  });
  actions.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => setWorkoutActionsOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setWorkoutActionsOpen(false);
    document.getElementById('btn-workout-more').focus();
  });

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
    setWorkoutActionsOpen(false);
    const name = localizeText(getCurrentWorkoutSession()?.name || t('workouts'));
    showConfirm(t('discardWorkout'), t('discardWorkoutConfirm', { name }), () => {
      cleanupWorkout();
      doNavigate('home');
    });
  });

  document.getElementById('btn-workout-edit').addEventListener('click', () => {
    setWorkoutActionsOpen(false);
    toggleWorkoutEditor();
  });
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
    // Only ever fires right after the workout that made getWorkouts().length
    // hit 1 — later workouts leave the count above 1, so this naturally
    // never re-triggers once it has (or the account already exists).
    maybeShowSyncPrompt();
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
  state.openNoteEditors.clear();
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
  void syncWorkoutWakeLock();
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
  state.openNoteEditors.clear();
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
  void syncWorkoutWakeLock();
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
  state.openNoteEditors.clear();
  state.choices = {};
  state.workoutStartTime = null;
  void syncWorkoutWakeLock();
  dismissRestTimerNotification();
  document.getElementById('rest-timer-overlay').classList.remove('active');
  setWorkoutActionsOpen(false);
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
    void syncWorkoutWakeLock();
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
  state.openNoteEditors.clear();
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
  void syncWorkoutWakeLock();

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

  container.appendChild(createNoteComposer({
    id: 'workout',
    title: t('workoutNote'),
    placeholder: t('workoutNotePlaceholder'),
    value: state.workoutNote,
    maxLength: 1000,
    icon: '✦',
    onInput: (value) => { state.workoutNote = value; },
  }));

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

  const bottomBar = document.createElement('div');
  bottomBar.className = 'workout-bottom-bar';
  bottomBar.appendChild(createNoteComposer({
    id: 'workout-bottom',
    title: t('workoutNote'),
    placeholder: t('workoutNotePlaceholder'),
    value: state.workoutNote,
    maxLength: 1000,
    icon: '✦',
    onInput: (value) => { state.workoutNote = value; },
  }));
  const finishButton = document.createElement('button');
  finishButton.type = 'button';
  finishButton.className = 'btn-finish block';
  finishButton.id = 'btn-finish-bottom';
  finishButton.textContent = document.getElementById('btn-finish').textContent;
  finishButton.addEventListener('click', () => finishWorkout());
  bottomBar.appendChild(finishButton);
  container.appendChild(bottomBar);

  updateWorkoutProgress();
}

function updateWorkoutProgress() {
  const progressElement = document.getElementById('workout-progress');
  const session = getCurrentWorkoutSession();
  if (!progressElement || !session) return;
  const progress = getWorkoutCompletionProgress(session, state.exerciseSets, state.choices);
  progressElement.textContent = t('workoutProgress', progress);
  const ring = document.getElementById('workout-ring');
  if (ring) ring.style.setProperty('--ring-progress', progress.total ? progress.completed / progress.total : 0);
  document.querySelectorAll('.exercise-card[data-exercise-id]').forEach((card) => {
    updateExerciseCardStatus(card, state.exerciseSets[card.dataset.exerciseId]);
  });
}

function updateExerciseCardStatus(card, sets) {
  const statusElement = card.querySelector('[data-exercise-progress]');
  if (!statusElement) return;
  const progress = getExerciseCompletionState(sets);
  card.classList.toggle('is-complete', progress.completed);
  card.classList.toggle('is-skipped', progress.skipped);
  if (progress.skipped) {
    statusElement.textContent = t('exerciseSkippedStatus');
  } else if (progress.completed) {
    statusElement.textContent = `✓ ${t('exerciseCompleted')}`;
  } else {
    statusElement.textContent = t('exerciseSetProgress', {
      completed: progress.completedSets,
      total: progress.totalSets,
    });
  }
}

function createExerciseCard(exercise, block, session, autoTimer = true) {
  const card = document.createElement('div');
  card.className = 'exercise-card';
  card.dataset.exerciseId = exercise.id;
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
      <div class="exercise-card-meta">
        <span class="exercise-target">${targets.targetSets} × ${targets.targetRepsMin}-${targets.targetRepsMax} ${t('reps')}</span>
        <span class="exercise-set-progress" data-exercise-progress aria-live="polite"></span>
      </div>
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

  // Note — shown in full the first time this exact instruction is seen for
  // this exercise, then collapsed on later workouts so it doesn't clutter
  // the screen once it's been read.
  const note = resolvedExercise.note;
  if (note) {
    const noteKey = `${exercise.id}::${note}`;
    const alreadySeen = hasSeenProgramNote(noteKey);
    const noteDiv = document.createElement('details');
    noteDiv.className = 'exercise-note';
    noteDiv.open = !alreadySeen;
    noteDiv.innerHTML = `
      <summary class="exercise-note-summary">
        <span class="exercise-note-icon" aria-hidden="true">◎</span>
        <strong>${escapeHtml(t('programInstruction'))}</strong>
        <span class="exercise-note-chevron" aria-hidden="true">▾</span>
      </summary>
      <p class="exercise-note-text">${escapeHtml(note)}</p>
    `;
    if (!alreadySeen) markProgramNoteSeen(noteKey);
    card.appendChild(noteDiv);
  }

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
  updateExerciseCardStatus(card, sets);

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
  weightInput.enterKeyHint = 'next';
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
  repsInput.enterKeyHint = 'next';
  repsInput.addEventListener('input', (e) => {
    state.exerciseSets[exerciseId][index].reps = parseInt(e.target.value) || 0;
  });
  repsGroup.appendChild(repsInput);
  row.appendChild(repsGroup);

  // Check button
  enhanceSetInput(weightInput);
  enhanceSetInput(repsInput);

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'set-check' + (set.done ? ' checked' : '');
  checkBtn.textContent = '✓';
  checkBtn.setAttribute('aria-pressed', String(set.done));
  checkBtn.setAttribute('aria-label', t(set.done ? 'markSetIncomplete' : 'markSetComplete', { number: index + 1 }));
  checkBtn.addEventListener('click', () => {
    set.done = !set.done;
    // Update the inputs with current values before toggling
    state.exerciseSets[exerciseId][index].weight = parseFloat(weightInput.value) || 0;
    state.exerciseSets[exerciseId][index].reps = parseInt(repsInput.value) || 0;
    row.classList.toggle('completed', set.done);
    checkBtn.classList.toggle('checked', set.done);
    checkBtn.setAttribute('aria-pressed', String(set.done));
    checkBtn.setAttribute('aria-label', t(set.done ? 'markSetIncomplete' : 'markSetComplete', { number: index + 1 }));
    updateWorkoutProgress();

    // Auto-start rest timer when completing a set
    // For supersets: only after the LAST exercise in the block
    if (set.done && autoTimer && !(set.segments || []).length) {
      startRestTimer(restTime, session.color);
    }
  });
  row.appendChild(checkBtn);

  return row;
}

function enhanceSetInput(input) {
  input.addEventListener('focus', () => requestAnimationFrame(() => input.select()));
  input.addEventListener('click', () => input.select());
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputs = [...input.closest('.sets-container')?.querySelectorAll('.set-input') || []];
    const nextInput = inputs[inputs.indexOf(input) + 1];
    if (nextInput) nextInput.focus();
    else input.blur();
  });
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
  weightInput.enterKeyHint = 'next';
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
  repsInput.enterKeyHint = 'next';
  repsInput.addEventListener('input', () => { segment.reps = parseInt(repsInput.value, 10) || 0; });
  repsGroup.appendChild(repsInput);
  row.appendChild(repsGroup);

  enhanceSetInput(weightInput);
  enhanceSetInput(repsInput);

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'set-check' + (segment.done ? ' checked' : '');
  check.textContent = '✓';
  check.setAttribute('aria-pressed', String(segment.done));
  check.setAttribute('aria-label', t(segment.done ? 'markDropIncomplete' : 'markDropComplete', { number: segmentIndex + 1 }));
  check.addEventListener('click', () => {
    segment.done = !segment.done;
    row.classList.toggle('completed', segment.done);
    check.classList.toggle('checked', segment.done);
    check.setAttribute('aria-pressed', String(segment.done));
    check.setAttribute('aria-label', t(segment.done ? 'markDropIncomplete' : 'markDropComplete', { number: segmentIndex + 1 }));
    updateWorkoutProgress();
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

  document.getElementById('btn-timer-minus30').addEventListener('click', () => {
    if (!state.timerEndsAt) return;
    state.timerEndsAt -= 30 * 1000;
    state.timerTotal = Math.max(1, state.timerTotal - 30);
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
function finishWorkout({ incompleteConfirmed = false } = {}) {
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

  if (!editingWorkout && !incompleteConfirmed) {
    const progress = getWorkoutCompletionProgress(session, state.exerciseSets, state.choices);
    if (progress.completed < progress.total) {
      const completed = t(progress.completed === 1 ? 'completedExerciseOne' : 'completedExerciseMany', { count: progress.completed });
      const skipped = t(progress.skipped === 1 ? 'skippedExerciseOne' : 'skippedExerciseMany', { count: progress.skipped });
      const incomplete = t(progress.incomplete === 1 ? 'incompleteExerciseOne' : 'incompleteExerciseMany', { count: progress.incomplete });
      showConfirm(
        t('finishIncompleteTitle'),
        t('finishIncompleteSummary', { completed, skipped, incomplete }),
        () => finishWorkout({ incompleteConfirmed: true }),
      );
      return;
    }
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
  const savedWorkout = saveWorkout({ ...workout, note: state.workoutNote.trim() });

  // Update persistent notification after saving
  updateNotification();

  // Show summary
  showSummary(session, exercises, durationMs, previousWorkout, personalRecords, savedWorkout);
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

function showSummary(session, exercises, durationMs, previousWorkout = null, personalRecords = [], savedWorkout = null) {
  const overlay = document.getElementById('summary-overlay');
  const sessionInfo = document.getElementById('summary-session');
  const statsContainer = document.getElementById('summary-stats');
  const comparisonContainer = document.getElementById('summary-comparison');
  const noteContainer = document.getElementById('summary-note');

  sessionInfo.textContent = `${localizeText(session.name)} · ${localizeText(session.subtitle)}`;

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
    comparisonContainer.insertAdjacentHTML('beforeend', `<div class="personal-records"><h3><span class="icon-tint-warning" aria-hidden="true"><svg class="icon-glyph icon-glyph--sm" viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></span> ${t('personalRecords')}</h3>${personalRecords.slice(0, 4).map((record) => `<div class="personal-record"><strong>${escapeHtml(record.exerciseName)}</strong><span>${record.type === 'weight' ? t('recordWeight', { value: formatMetric(record.value) }) : t('recordReps', { value: formatMetric(record.value) })}</span></div>`).join('')}</div>`);
  }

  noteContainer.innerHTML = '';
  if (savedWorkout) {
    state.openNoteEditors.delete('summary');
    noteContainer.appendChild(createNoteComposer({
      id: 'summary',
      title: t('workoutNote'),
      placeholder: t('workoutNotePlaceholder'),
      value: savedWorkout.note || '',
      maxLength: 1000,
      icon: '✦',
      onInput: (value) => { updateWorkout(savedWorkout.id, { note: value }); },
    }));
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
    state.confirmCancelCallback?.();
    state.confirmCallback = null;
    state.confirmCancelCallback = null;
  });

  document.getElementById('btn-confirm-ok').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.remove('active');
    if (state.confirmCallback) {
      state.confirmCallback();
      state.confirmCallback = null;
    }
    state.confirmCancelCallback = null;
  });
}

function showConfirm(title, message, callback, onCancel = null) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  state.confirmCallback = callback;
  state.confirmCancelCallback = onCancel;
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
// AUTH SCREEN (dedicated sign-in / password-reset / account overlay)
// ============================================
// One overlay, three mutually-exclusive views: 'auth' (sign-in/sign-up),
// 'reset' (password reset) and 'account' (signed-in management — see
// initAccountView). Kept as top-level functions (not part of any init...()
// closure) because they're also called from account entry points elsewhere
// (openAccountEntryPoint, the settings account row, the startup
// password-reset check).
let authScreenPreviousFocus = null;
let pendingResetToken = null;

const AUTH_SCREEN_TITLE_IDS = { auth: 'auth-screen-title', reset: 'auth-reset-title', account: 'auth-screen-account-title' };
const AUTH_SCREEN_FOCUS_TARGETS = { reset: 'auth-new-password', account: 'btn-sync-now' };

function setAuthScreenView(view) {
  const overlay = document.getElementById('auth-screen-overlay');
  const signInView = document.getElementById('auth-screen-signin');
  const resetView = document.getElementById('auth-screen-reset');
  const accountView = document.getElementById('auth-screen-account');
  if (!overlay || !signInView || !resetView || !accountView) return;
  signInView.hidden = view !== 'auth';
  resetView.hidden = view !== 'reset';
  accountView.hidden = view !== 'account';
  // aria-labelledby must track whichever title is actually visible.
  overlay.setAttribute('aria-labelledby', AUTH_SCREEN_TITLE_IDS[view] || AUTH_SCREEN_TITLE_IDS.auth);
}

function openAuthScreen({ mode = 'auth', token = null, error = null } = {}) {
  const overlay = document.getElementById('auth-screen-overlay');
  if (!overlay) return;
  if (!overlay.classList.contains('active')) authScreenPreviousFocus = document.activeElement;
  if (mode === 'reset') pendingResetToken = token;
  setAuthScreenView(mode);
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  if (error) {
    const errorEl = document.getElementById(mode === 'reset' ? 'auth-reset-error' : 'auth-error');
    if (errorEl) { errorEl.textContent = error; errorEl.hidden = false; }
  }
  requestAnimationFrame(() => {
    document.getElementById(AUTH_SCREEN_FOCUS_TARGETS[mode] || 'btn-auth-google')?.focus({ preventScroll: true });
  });
}

function closeAuthScreen() {
  const overlay = document.getElementById('auth-screen-overlay');
  const ownedFocus = overlay?.contains(document.activeElement);
  overlay?.classList.remove('active');
  overlay?.setAttribute('aria-hidden', 'true');
  if (ownedFocus && authScreenPreviousFocus?.isConnected && typeof authScreenPreviousFocus.focus === 'function') {
    authScreenPreviousFocus.focus({ preventScroll: true });
  }
  authScreenPreviousFocus = null;
}

// Checked once at startup (web: the URL carries reset_token/reset_error —
// see consumePendingPasswordReset() in services/auth.js) so a user coming
// back from the reset-password email lands straight in the right screen
// instead of on the home view. The native deep-link equivalent arrives later,
// as the `auth:password-reset-requested` event wired up in DOMContentLoaded.
function handlePendingPasswordReset() {
  let pending = null;
  try {
    pending = consumePendingPasswordReset();
  } catch (error) {
    console.warn('[Auth] consumePendingPasswordReset failed:', error);
  }
  if (!pending) return;
  if (pending.token) openAuthScreen({ mode: 'reset', token: pending.token });
  else if (pending.error === 'invalid') openAuthScreen({ mode: 'auth', error: t('authResetInvalid') });
}

function initAuthScreen() {
  const overlay = document.getElementById('auth-screen-overlay');
  if (!overlay) return;

  // A deliberately permissive check — this only catches typos before they hit
  // the network, Better Auth (and the server's own validation) is the real
  // source of truth for what counts as a valid email.
  const AUTH_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const authForm = document.getElementById('auth-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const btnPasswordToggle = document.getElementById('btn-auth-password-toggle');
  const errorEl = document.getElementById('auth-error');
  const messageEl = document.getElementById('auth-message');
  const btnSubmit = document.getElementById('btn-auth-submit');
  const btnSwitchMode = document.getElementById('btn-auth-switch-mode');
  const btnForgotPassword = document.getElementById('btn-auth-forgot-password');
  const btnGoogle = document.getElementById('btn-auth-google');
  const btnMagicLink = document.getElementById('btn-auth-magic-link');

  let mode = 'sign-in';

  const clearFeedback = () => {
    errorEl.hidden = true;
    messageEl.hidden = true;
  };
  // `field` gets focus so a screen-reader user (and anyone tabbing through)
  // lands straight on whatever needs fixing, instead of just hearing the alert.
  const showError = (message, field) => {
    messageEl.hidden = true;
    errorEl.textContent = message;
    errorEl.hidden = false;
    field?.focus();
  };
  const showMessage = (key) => {
    errorEl.hidden = true;
    messageEl.textContent = t(key);
    messageEl.hidden = false;
  };

  // Keeps every mode-dependent bit of UI in sync: button labels, the
  // forgot-password link (sign-in only — signing up has no password to
  // reset yet), and autocomplete so mobile keyboards offer to *generate* a
  // password on sign-up but *fill* the saved one on sign-in.
  const applyModeUI = () => {
    btnSubmit.textContent = t(mode === 'sign-in' ? 'authSignIn' : 'authSignUp');
    btnSwitchMode.textContent = t(mode === 'sign-in' ? 'authSwitchToSignUp' : 'authSwitchToSignIn');
    btnForgotPassword.hidden = mode !== 'sign-in';
    passwordInput.autocomplete = mode === 'sign-in' ? 'current-password' : 'new-password';
  };
  applyModeUI();
  // These two labels are mode-dependent, so translateDocument() would reset
  // them to their static data-i18n value (always the sign-in wording) on a
  // language switch — re-apply the current mode after it runs.
  window.addEventListener('language:changed', applyModeUI);

  // Every network-backed action in this form funnels through here so a
  // double-tap on a slow connection can't fire the request twice: the whole
  // button row is disabled and the active one gets a loading label, always
  // restored in `finally` — success or failure — never left stuck disabled.
  const actionButtons = [btnSubmit, btnGoogle, btnMagicLink, btnForgotPassword, btnSwitchMode];
  const setBusy = (busy) => { actionButtons.forEach((btn) => { btn.disabled = busy; }); };
  const runAction = async (activeButton, loadingKey, action) => {
    const originalLabel = activeButton.textContent;
    setBusy(true);
    activeButton.textContent = t(loadingKey);
    try {
      return await action();
    } finally {
      setBusy(false);
      activeButton.textContent = originalLabel;
    }
  };

  btnSwitchMode.addEventListener('click', () => {
    mode = mode === 'sign-in' ? 'sign-up' : 'sign-in';
    applyModeUI();
    clearFeedback();
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email) return showError(t('authEmailRequired'), emailInput);
    if (!AUTH_EMAIL_RE.test(email)) return showError(t('authEmailInvalid'), emailInput);
    if (!password) return showError(t('authPasswordRequired'), passwordInput);
    if (mode === 'sign-up' && password.length < 8) return showError(t('authPasswordTooShort'), passwordInput);

    clearFeedback();
    try {
      await runAction(btnSubmit, mode === 'sign-in' ? 'authSigningIn' : 'authCreatingAccount', async () => {
        if (mode === 'sign-in') await signInEmail({ email, password });
        else await signUpEmail({ email, password, name: email.split('@')[0] });
        passwordInput.value = '';
      });
    } catch (error) {
      showError(error.message);
    }
  });

  btnPasswordToggle?.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    btnPasswordToggle.setAttribute('aria-pressed', String(!showing));
    const key = showing ? 'authShowPassword' : 'authHidePassword';
    btnPasswordToggle.dataset.i18nAriaLabel = key;
    btnPasswordToggle.setAttribute('aria-label', t(key));
  });

  btnGoogle.addEventListener('click', async () => {
    clearFeedback();
    try {
      await runAction(btnGoogle, 'authSigningIn', () => signInGoogle());
    } catch (error) {
      showError(error.message);
    }
  });

  btnMagicLink.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) return showError(t('authEmailRequired'), emailInput);
    clearFeedback();
    try {
      await runAction(btnMagicLink, 'authSending', () => sendMagicLink({ email }));
      showMessage('authMagicLinkSent');
    } catch (error) {
      showError(error.message);
    }
  });

  btnForgotPassword.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) return showError(t('authEmailRequired'), emailInput);
    clearFeedback();
    try {
      await runAction(btnForgotPassword, 'authSending', () => requestPasswordReset({ email }));
      showMessage('authResetLinkSent');
    } catch (error) {
      showError(error.message);
    }
  });

  // A successful sign-in can arrive through any path this screen offers
  // (email/password, native Google, or a magic-link/OAuth deep link
  // completed while the screen was left open in the background) — closing
  // here on the shared auth-state event covers all of them at once instead
  // of duplicating a close call after each one.
  onAuthChange(({ user }) => { if (user) closeAuthScreen(); });

  // --- Reset-password mode ---
  const resetForm = document.getElementById('auth-reset-form');
  const newPasswordInput = document.getElementById('auth-new-password');
  const confirmPasswordInput = document.getElementById('auth-confirm-password');
  const resetErrorEl = document.getElementById('auth-reset-error');
  const resetMessageEl = document.getElementById('auth-reset-message');
  const btnResetSubmit = document.getElementById('btn-auth-reset-submit');

  const clearResetFeedback = () => {
    resetErrorEl.hidden = true;
    resetMessageEl.hidden = true;
  };
  const showResetError = (message, field) => {
    resetMessageEl.hidden = true;
    resetErrorEl.textContent = message;
    resetErrorEl.hidden = false;
    field?.focus();
  };

  resetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    if (newPassword.length < 8) return showResetError(t('authPasswordTooShort'), newPasswordInput);
    if (newPassword !== confirmPassword) return showResetError(t('authPasswordMismatch'), confirmPasswordInput);

    clearResetFeedback();
    const originalLabel = btnResetSubmit.textContent;
    btnResetSubmit.disabled = true;
    btnResetSubmit.textContent = t('authResetting');
    try {
      await resetPassword({ token: pendingResetToken, newPassword });
      newPasswordInput.value = '';
      confirmPasswordInput.value = '';
      setAuthScreenView('auth');
      showMessage('authResetDone');
    } catch (error) {
      showResetError(error.message);
    } finally {
      btnResetSubmit.disabled = false;
      btnResetSubmit.textContent = originalLabel;
    }
  });

  // --- Overlay chrome: close button, backdrop click, focus trap ---
  document.getElementById('btn-auth-screen-close')?.addEventListener('click', closeAuthScreen);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeAuthScreen();
  });
  // Same keyboard-trap pattern as the onboarding overlay, filtered to the
  // currently visible sub-view (sign-in vs reset) so Tab never lands on a
  // hidden field from the other one.
  overlay.addEventListener('keydown', (event) => {
    if (!overlay.classList.contains('active')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAuthScreen();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

// ============================================
// AUTH SCREEN — ACCOUNT VIEW (signed-in management: email, sync, sign out)
// ============================================
// The 'account' view of the auth screen overlay (see setAuthScreenView) —
// reached from the header account button, the settings account row, and
// every other account entry point once signed in. There's nothing left to
// "sign into" here, so unlike initAuthScreen this only wires status display
// and two actions.
function initAccountView() {
  const signedInLabel = document.getElementById('account-signed-in-label');
  const syncStatusEl = document.getElementById('account-sync-status');
  const btnSyncNow = document.getElementById('btn-sync-now');
  const btnSignOut = document.getElementById('btn-auth-sign-out');
  if (!signedInLabel) return;

  const render = ({ user }) => {
    if (user) signedInLabel.textContent = t('authSignedInAs', { email: user.email });
  };
  render({ user: getCurrentUser() });
  onAuthChange(render);

  const renderSyncStatus = ({ status, lastSyncedAt }) => {
    if (!syncStatusEl) return;
    if (status === 'syncing') syncStatusEl.textContent = t('syncStatusSyncing');
    else if (status === 'error') syncStatusEl.textContent = t('syncStatusError');
    else if (status === 'expired') syncStatusEl.textContent = t('syncStatusExpired');
    else if (lastSyncedAt) syncStatusEl.textContent = t('syncStatusIdle', { time: new Date(lastSyncedAt).toLocaleTimeString() });
    else syncStatusEl.textContent = t('syncStatusIdleNever');
  };
  renderSyncStatus(getSyncStatus());
  onSyncStatusChange(renderSyncStatus);

  btnSyncNow?.addEventListener('click', () => syncNow());
  // Leaving the account view open with no account left to show would be
  // confusing — close the overlay once the sign-out actually completes.
  btnSignOut?.addEventListener('click', async () => {
    await signOut();
    closeAuthScreen();
  });
}

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
  let settingsTipTimer = null;
  let replayGuideTimer = null;
  const cancelSettingsTip = () => {
    if (settingsTipTimer === null) return;
    clearTimeout(settingsTipTimer);
    settingsTipTimer = null;
  };
  const languageSelect = document.getElementById('settings-language');
  languageSelect.value = getLanguage();
  languageSelect.addEventListener('change', () => setLanguage(languageSelect.value));

  const themeSelect = document.getElementById('settings-theme');
  themeSelect.value = getTheme();
  themeSelect.addEventListener('change', () => setTheme(themeSelect.value));

  const styleSelect = document.getElementById('settings-style');
  styleSelect.value = getVisualStyle();
  styleSelect.addEventListener('change', () => setVisualStyle(styleSelect.value));

  const accessibility = getAccessibilityPreferences();
  const textSizeSelect = document.getElementById('settings-text-size');
  textSizeSelect.value = accessibility.textSize;
  textSizeSelect.addEventListener('change', () => {
    setAccessibilityPreferences({
      ...getAccessibilityPreferences(),
      textSize: textSizeSelect.value,
    });
  });

  const bindAccessibilityToggle = (buttonId, preferenceName) => {
    const button = document.getElementById(buttonId);
    const render = () => {
      const active = Boolean(getAccessibilityPreferences()[preferenceName]);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    };
    render();
    button.addEventListener('click', () => {
      const preferences = getAccessibilityPreferences();
      setAccessibilityPreferences({ ...preferences, [preferenceName]: !preferences[preferenceName] });
      render();
    });
  };

  bindAccessibilityToggle('btn-high-contrast-toggle', 'highContrast');
  bindAccessibilityToggle('btn-reduce-motion-toggle', 'reducedMotion');
  bindAccessibilityToggle('btn-haptics-toggle', 'haptics');
  bindAccessibilityToggle('btn-wake-lock-toggle', 'keepScreenAwake');

  // Open/close settings
  btnOpen.addEventListener('click', () => {
    if (replayGuideTimer !== null) {
      clearTimeout(replayGuideTimer);
      replayGuideTimer = null;
    }
    overlay.classList.add('active');
    // The settings panel slides up over 0.35s (see .settings-panel's
    // transform transition) — wait it out so the target's rect is settled.
    cancelSettingsTip();
    settingsTipTimer = setTimeout(() => {
      settingsTipTimer = null;
      showTip('settings-advanced', {
        target: document.getElementById('settings-style')?.closest('.settings-row'),
        title: t('tipSettingsTitle'),
        body: t('tipSettingsDesc'),
      });
    }, 400);
  });

  btnClose.addEventListener('click', () => {
    cancelSettingsTip();
    overlay.classList.remove('active');
  });

  // Replay the guided tour. The panel slides back down over 0.35s (see
  // .settings-panel's transform transition), so let it clear the screen before
  // the first step measures the element it spotlights.
  document.getElementById('btn-replay-guide')?.addEventListener('click', () => {
    if (replayGuideTimer !== null) return;
    cancelSettingsTip();
    overlay.classList.remove('active');
    replayGuideTimer = setTimeout(() => {
      replayGuideTimer = null;
      document.getElementById('btn-settings')?.focus({ preventScroll: true });
      startMainTour(undefined, { complete: true });
    }, 400);
  });

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cancelSettingsTip();
      overlay.classList.remove('active');
    }
  });

  // Download data
  btnExport.addEventListener('click', exportFullBackup);

  // Export programs only — workout history is never included in this file.
  btnExportPrograms.addEventListener('click', async () => {
    const data = exportProgramsData();
    if (getProgramsExportSummary().programs === 0) {
      showToast(t('noProgramsExport'), 'error');
      return;
    }

    const dateStr = formatLocalDate();
    const fileName = `muscu_tracker_programmes_${dateStr}.json`;

    try {
      await downloadJsonFile(data, fileName);
      showToast(t('exportedPrograms'), 'success');
    } catch (err) {
      console.error('Program download failed:', err);
      showToast(t('exportError'), 'error');
    }
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
    reader.onerror = () => showToast(t('fileReadError'), 'error');
    reader.readAsText(file);
    // Reset input so same file can be imported again
    fileInput.value = '';
  });

  // Import programs only. Existing workout records stay untouched.
  btnImportPrograms.addEventListener('click', () => {
    programsFileInput.dataset.importSource = 'settings';
    programsFileInput.click();
  });

  // The Programs view has another ordinary launcher for this same hidden
  // input. Mark it in capture phase, before that view forwards the click.
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-action="import-programs-from-list"]')) {
      programsFileInput.dataset.importSource = 'settings';
    }
  }, true);

  programsFileInput.addEventListener('change', (e) => {
    const importSource = programsFileInput.dataset.importSource || 'settings';
    delete programsFileInput.dataset.importSource;
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

        if (importSource === 'onboarding') closeOnboardingOverlay();
        showConfirm(
          t('importPrograms'), t('programsImportConfirm'),
          () => {
            if (!importProgramsData(content)) {
              showToast(t('importError'), 'error');
              if (importSource === 'onboarding') openOnboardingOverlay();
              return;
            }
            showToast(t('importedPrograms'), 'success');
            window.dispatchEvent(new CustomEvent('programs:imported', {
              detail: { source: importSource },
            }));
            renderHome();
            renderPrograms();
            refreshStatsSelector();
            updateCharts();
            updateNotification();
          },
          () => {
            if (importSource === 'onboarding') openOnboardingOverlay();
          },
        );
      } catch {
        showToast(t('invalidJson'), 'error');
      }
    };
    reader.onerror = () => showToast(t('fileReadError'), 'error');
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
