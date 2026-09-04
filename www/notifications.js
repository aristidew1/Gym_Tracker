// notifications.js — Persistent Android notification for daily training status
// Uses custom PersistentNotification native plugin on Android,
// falls back to Service Worker + Notification API on Web.

import { getNextSession, getLastWorkout, getWorkouts } from './storage.js';
import { getActiveProgram } from './services/program-storage.js';
import { getSupplementStatus } from './supplements.js';
import { localizeText, t } from './i18n.js';
import { localDateToDayNumber } from './services/date-utils.js';

const NOTIFICATION_TAG = 'muscu-daily-status';
const REST_TIMER_NOTIFICATION_TAG = 'muscu-rest-timer';
const REST_TIMER_NOTIFICATIONS_KEY = 'muscu_rest_timer_notif_enabled';
const SW_PATH = './sw.js';

let swRegistration = null;
let notificationsEnabled = false;
let restTimerNotificationsEnabled = true;
let restTimerEndAt = null;
let restTimerInterval = null;

// Helper: get native plugin (only on Android via Capacitor)
function getNativePlugin() {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      // In Capacitor, custom plugins registered via registerPlugin() in Java
      // are available on Capacitor.Plugins
      const plugin = window.Capacitor.Plugins.PersistentNotification;
      if (plugin) return plugin;
    }
  } catch (e) {
    console.warn('Could not get native plugin:', e);
  }
  return null;
}

// ============================================
// PUBLIC API
// ============================================

export async function initNotifications() {
  const native = getNativePlugin();
  const webSupported = ('Notification' in window) && ('serviceWorker' in navigator);

  console.log('[Notif] init — native:', !!native, 'webSupported:', webSupported);

  if (!native && !webSupported) {
    hideNotifButton();
    hideRestTimerNotifButton();
    return;
  }

  initRestTimerNotificationToggle();

  const btn = document.getElementById('btn-notif-toggle');
  if (!btn) return;

  notificationsEnabled = localStorage.getItem('muscu_notif_enabled') === 'true';
  updateNotifButton(btn);

  btn.addEventListener('click', async () => {
    console.log('[Notif] Button clicked, currently enabled:', notificationsEnabled);

    if (notificationsEnabled) {
      // Disable
      notificationsEnabled = false;
      localStorage.setItem('muscu_notif_enabled', 'false');
      await cancelNotification();
      updateNotifButton(btn);
    } else {
      // Enable
      let granted = false;

      if (native) {
        try {
          const permission = native.requestPermissions
            ? await native.requestPermissions()
            : { display: 'granted' };
          granted = permission?.display === 'granted';
        } catch (error) {
          console.warn('Unable to request native notification permission:', error);
        }
      } else {
        try {
          const permission = await Notification.requestPermission();
          granted = permission === 'granted';
        } catch (error) {
          console.warn('Unable to request notification permission:', error);
        }
      }

      if (granted) {
        if (!native) await registerSW();
        notificationsEnabled = await showDailyNotification();
        localStorage.setItem('muscu_notif_enabled', String(notificationsEnabled));
        updateNotifButton(btn);
      }
    }
  });

  // If already enabled, show/update notification
  if (notificationsEnabled) {
    let displayed = false;
    if (native) {
      displayed = await showDailyNotification();
    } else if (Notification.permission === 'granted') {
      await registerSW();
      displayed = await showDailyNotification();
    }
    if (!displayed) {
      notificationsEnabled = false;
      localStorage.setItem('muscu_notif_enabled', 'false');
      updateNotifButton(btn);
    }
  }
}

export async function updateNotification() {
  if (!notificationsEnabled) return;
  await showDailyNotification();
}

// ============================================
// REST TIMER NOTIFICATIONS
// ============================================

export async function startRestTimerNotification(seconds) {
  if (!restTimerNotificationsEnabled) return;
  const durationSeconds = Math.max(1, Math.ceil(Number(seconds) || 0));
  const payload = {
    durationSeconds,
    title: t('timerNotificationTitle'),
    body: t('timerNotificationBody'),
    completedTitle: t('timerFinishedTitle'),
    completedBody: t('timerFinishedBody'),
  };
  const native = getNativePlugin();

  if (native?.startRestTimer) {
    try {
      await native.startRestTimer(payload);
    } catch (error) {
      console.warn('Unable to start native rest timer notification:', error);
    }
    return;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn('Unable to request notification permission:', error);
    }
  }
  if (Notification.permission !== 'granted') return;

  await registerSW();
  if (!swRegistration) return;
  restTimerEndAt = Date.now() + durationSeconds * 1000;
  clearInterval(restTimerInterval);
  await showRestTimerNotification();
  restTimerInterval = setInterval(() => { showRestTimerNotification(); }, 1000);
}

function initRestTimerNotificationToggle() {
  const btn = document.getElementById('btn-rest-timer-notif-toggle');
  if (!btn || btn.dataset.initialized === 'true') return;

  restTimerNotificationsEnabled = localStorage.getItem(REST_TIMER_NOTIFICATIONS_KEY) !== 'false';
  updateRestTimerNotifButton(btn);
  btn.dataset.initialized = 'true';
  btn.addEventListener('click', async () => {
    restTimerNotificationsEnabled = !restTimerNotificationsEnabled;
    localStorage.setItem(REST_TIMER_NOTIFICATIONS_KEY, String(restTimerNotificationsEnabled));
    if (!restTimerNotificationsEnabled) await dismissRestTimerNotification();
    updateRestTimerNotifButton(btn);
  });
}

export async function dismissRestTimerNotification() {
  restTimerEndAt = null;
  clearInterval(restTimerInterval);
  restTimerInterval = null;

  const native = getNativePlugin();
  if (native?.stopRestTimer) {
    try {
      await native.stopRestTimer();
    } catch (error) {
      console.warn('Unable to stop native rest timer notification:', error);
    }
    return;
  }

  await closeWebNotifications(REST_TIMER_NOTIFICATION_TAG);
}

export async function finishRestTimerNotification() {
  restTimerEndAt = null;
  clearInterval(restTimerInterval);
  restTimerInterval = null;

  if (!restTimerNotificationsEnabled) return;
  // Android's alarm owns the completion notification even when the WebView is
  // in the background.
  if (getNativePlugin()?.startRestTimer) return;
  if (!swRegistration || Notification.permission !== 'granted') return;

  try {
    await swRegistration.showNotification(t('timerFinishedTitle'), {
      body: t('timerFinishedBody'),
      tag: REST_TIMER_NOTIFICATION_TAG,
      requireInteraction: false,
      silent: false,
      renotify: true,
    });
  } catch (error) {
    console.warn('Unable to show rest timer completion notification:', error);
  }
}

async function showRestTimerNotification() {
  if (!swRegistration || !restTimerEndAt) return;
  const remaining = Math.max(0, Math.ceil((restTimerEndAt - Date.now()) / 1000));
  if (remaining <= 0) return;
  try {
    await swRegistration.showNotification(t('timerNotificationTitle'), {
      body: `${t('timerNotificationBody')} · ${formatTimer(remaining)}`,
      tag: REST_TIMER_NOTIFICATION_TAG,
      requireInteraction: true,
      silent: true,
      renotify: false,
    });
  } catch (error) {
    console.warn('Unable to update rest timer notification:', error);
  }
}

async function closeWebNotifications(tag) {
  if (!swRegistration) return;
  try {
    const notifications = await swRegistration.getNotifications({ tag });
    notifications.forEach((notification) => notification.close());
  } catch (error) {
    console.warn('Unable to close notification:', error);
  }
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

// ============================================
// SERVICE WORKER (Web only)
// ============================================

async function registerSW() {
  try {
    swRegistration = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
    await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
  }
}

// ============================================
// NOTIFICATION LOGIC
// ============================================

async function showDailyNotification() {
  const { title, body } = getDailyStatus();
  const native = getNativePlugin();

  console.log('[Notif] showDailyNotification — native:', !!native, 'title:', title);

  if (native) {
    try {
      const result = await native.show({ title, body });
      console.log('[Notif] Native show result:', result);
      return true;
    } catch (err) {
      console.error('[Notif] Native persistent notification failed:', err);
      return false;
    }
  }

  // Web fallback
  if (!swRegistration) return false;
  try {
    await swRegistration.showNotification(title, {
      body,
      tag: NOTIFICATION_TAG,
      requireInteraction: true,
      silent: true,
      renotify: false,
    });
    return true;
  } catch (err) {
    console.warn('Web notification failed:', err);
    return false;
  }
}

async function cancelNotification() {
  const native = getNativePlugin();
  if (native) {
    try {
      await native.cancel();
    } catch (err) {
      console.warn('Failed to cancel native notification:', err);
    }
    return;
  }

  if (!swRegistration) return;
  try {
    const notifications = await swRegistration.getNotifications({ tag: NOTIFICATION_TAG });
    notifications.forEach(n => n.close());
  } catch (err) {
    console.warn('Failed to cancel web notification:', err);
  }
}

// ============================================
// STATUS CALCULATION
// ============================================

export function getWeeklyRecommendation(workouts, sessionsPerWeek, now = new Date()) {
  const target = Math.min(7, Math.max(1, Number(sessionsPerWeek) || 3));
  const todayDay = localDateToDayNumber(now);
  const weekStart = todayDay - ((todayDay + 3) % 7);
  const dayIndex = todayDay - weekStart;
  const completedThisWeek = workouts.filter((workout) => {
    const day = localDateToDayNumber(workout.date);
    return day >= weekStart && day <= todayDay;
  });
  const completedToday = completedThisWeek.some((workout) => localDateToDayNumber(workout.date) === todayDay);

  if (completedThisWeek.length >= target) {
    return { completedToday, dueToday: false, daysUntilNext: 7 - dayIndex };
  }

  const plannedDays = Array.from({ length: target }, (_, index) => Math.floor(index * 7 / target));
  let nextPlannedDay = plannedDays[completedThisWeek.length];
  if (completedToday) nextPlannedDay = Math.max(nextPlannedDay, dayIndex + 1);
  const daysUntilNext = Math.max(0, nextPlannedDay - dayIndex);
  return { completedToday, dueToday: daysUntilNext === 0, daysUntilNext };
}

function getDailyStatus() {
  const program = getActiveProgram();
  const workouts = getWorkouts().filter((workout) => workout.programId === program.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const order = program.sessionOrder;

  let workoutStatus;
  if (workouts.length === 0) {
    const session = program.sessions[order[0]];
    workoutStatus = { title: t('workoutToday', { name: localizeText(session.name) }), body: localizeText(session.subtitle) };
  } else {
    const sorted = [...workouts].sort((a, b) => new Date(b.savedAt || b.date) - new Date(a.savedAt || a.date));
    const daysDiff = localDateToDayNumber(today) - localDateToDayNumber(sorted[0].date);
    const lastSessionId = sorted[0].sessionId || sorted[0].sessionType;
    const lastIndex = order.indexOf(lastSessionId);
    const nextType = order[(lastIndex === -1 ? 0 : lastIndex + 1) % order.length];
    const nextSession = program.sessions[nextType];
    const weeklyRecommendation = program.trainingFrequency?.mode === 'weekly'
      ? getWeeklyRecommendation(workouts, program.trainingFrequency.sessionsPerWeek, today)
      : null;
    const frequencyDays = program.trainingFrequency?.intervalDays || 2;
    const dueToday = weeklyRecommendation?.dueToday ?? daysDiff >= frequencyDays;
    if (dueToday) {
      workoutStatus = { title: t('workoutToday', { name: localizeText(nextSession.name) }), body: localizeText(nextSession.subtitle) };
    } else {
      const daysUntilNext = weeklyRecommendation?.daysUntilNext ?? frequencyDays - daysDiff;
      const nextLabel = daysUntilNext === 1
        ? t('tomorrowWorkout', { name: localizeText(nextSession.name) })
        : t('nextWorkoutInDays', { count: daysUntilNext, name: localizeText(nextSession.name) });
      workoutStatus = {
        title: (weeklyRecommendation?.completedToday ?? daysDiff === 0) ? t('workoutCompletedToday') : t('restToday'),
        body: `${nextLabel} · ${localizeText(nextSession.subtitle)}`,
      };
    }
  }

  const supplementStatus = getSupplementStatus();
  if (!supplementStatus) return workoutStatus;
  return {
    ...workoutStatus,
    body: `${workoutStatus.body}\n${supplementStatus.complete ? t('supplementsNotificationComplete') : t('supplementsNotificationPending')}`,
  };
}

// ============================================
// UI HELPERS
// ============================================

function updateNotifButton(btn) {
  if (notificationsEnabled) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
  btn.setAttribute('aria-pressed', String(notificationsEnabled));
}

function updateRestTimerNotifButton(btn) {
  btn.classList.toggle('active', restTimerNotificationsEnabled);
  btn.setAttribute('aria-pressed', String(restTimerNotificationsEnabled));
}

function hideNotifButton() {
  const btn = document.getElementById('btn-notif-toggle');
  if (btn) {
    // Hide the entire settings row containing the notification toggle
    const row = btn.closest('.settings-row');
    if (row) row.style.display = 'none';
  }
}

function hideRestTimerNotifButton() {
  const btn = document.getElementById('btn-rest-timer-notif-toggle');
  const row = btn?.closest('.settings-row');
  if (row) row.style.display = 'none';
}
