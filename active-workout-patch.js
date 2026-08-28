// Non-destructive live workout UX layer.
// Keeps a live workout in memory while the user browses the app. Each rest
// countdown opens fullscreen first and can then be explicitly reduced.

const patchState = {
  liveWorkout: false,
  browsing: false,
  browsingView: 'home',
  pendingLiveStart: false,
  recordedEditPending: false,
  bannerInterval: null,
  timerFullscreen: false,
};

function isFrench() {
  return (document.documentElement.lang || navigator.language || 'fr').toLowerCase().startsWith('fr');
}

function injectActiveWorkoutStyles() {
  if (document.getElementById('active-workout-patch-styles')) return;
  const style = document.createElement('style');
  style.id = 'active-workout-patch-styles';
  style.textContent = `
    /* Compact rest timer. Space is reserved below it so it never covers workout content. */
    .rest-timer-overlay {
      position: fixed !important;
      top: calc(var(--safe-area-top) + 8px) !important;
      left: max(12px, calc((100vw - 480px) / 2 + 12px)) !important;
      right: max(12px, calc((100vw - 480px) / 2 + 12px)) !important;
      bottom: auto !important;
      width: auto !important;
      min-height: 64px !important;
      padding: 8px 10px !important;
      border: 1px solid rgba(var(--session-color-rgb, 77, 124, 255), .32) !important;
      border-radius: 16px !important;
      background: rgba(18, 18, 31, .97) !important;
      backdrop-filter: blur(18px) !important;
      -webkit-backdrop-filter: blur(18px) !important;
      box-shadow: 0 10px 28px rgba(0, 0, 0, .38) !important;
      align-items: center !important;
      justify-content: space-between !important;
      flex-direction: row !important;
      gap: 8px !important;
      z-index: 120 !important;
      animation: none !important;
    }

    html.rest-timer-running:not(.rest-timer-fullscreen) .view.active {
      padding-top: 84px !important;
    }

    .rest-timer-overlay .timer-circle {
      flex: 0 0 48px !important;
      width: 48px !important;
      height: 48px !important;
      margin: 0 !important;
    }

    .rest-timer-overlay .timer-circle .timer-bg,
    .rest-timer-overlay .timer-circle .timer-progress {
      stroke-width: 12 !important;
    }

    .rest-timer-overlay .timer-display .timer-time {
      font-size: 1rem !important;
      line-height: 1 !important;
      letter-spacing: -.02em !important;
    }

    .rest-timer-overlay .timer-display .timer-label {
      display: none !important;
    }

    .rest-timer-overlay .timer-controls {
      margin-left: auto !important;
      gap: 6px !important;
    }

    .rest-timer-overlay .btn-timer {
      min-height: 40px !important;
      padding: 8px 11px !important;
      border-radius: 10px !important;
      font-size: .76rem !important;
      white-space: nowrap !important;
    }

    .rest-timer-overlay .btn-timer-expand {
      width: 40px !important;
      min-width: 40px !important;
      padding-inline: 0 !important;
      font-size: 1.08rem !important;
    }

    /* Explicit fullscreen mode, enabled only by the user. */
    .rest-timer-overlay.timer-fullscreen {
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      min-height: 100vh !important;
      min-height: 100dvh !important;
      padding: max(24px, calc(var(--safe-area-top) + 16px)) 20px max(24px, calc(var(--safe-area-bottom) + 16px)) !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: rgba(7, 7, 13, .97) !important;
      box-shadow: none !important;
      flex-direction: column !important;
      justify-content: center !important;
      gap: 28px !important;
      z-index: 180 !important;
    }

    .rest-timer-overlay.timer-fullscreen .timer-circle {
      flex: 0 0 240px !important;
      width: 240px !important;
      height: 240px !important;
    }

    .rest-timer-overlay.timer-fullscreen .timer-circle .timer-bg,
    .rest-timer-overlay.timer-fullscreen .timer-circle .timer-progress {
      stroke-width: 8 !important;
    }

    .rest-timer-overlay.timer-fullscreen .timer-display .timer-time {
      font-size: 3.15rem !important;
      line-height: 1 !important;
    }

    .rest-timer-overlay.timer-fullscreen .timer-display .timer-label {
      display: block !important;
      margin-top: 8px !important;
    }

    .rest-timer-overlay.timer-fullscreen .timer-controls {
      margin-left: 0 !important;
      justify-content: center !important;
      gap: 10px !important;
    }

    .rest-timer-overlay.timer-fullscreen .btn-timer {
      min-height: 48px !important;
      padding: 10px 16px !important;
      font-size: .88rem !important;
    }

    .rest-timer-overlay.timer-fullscreen .btn-timer-expand {
      width: auto !important;
      min-width: 48px !important;
      padding-inline: 14px !important;
      font-size: .82rem !important;
    }

    html.light-theme .rest-timer-overlay:not(.timer-fullscreen) {
      background: rgba(255, 255, 255, .97) !important;
      box-shadow: 0 10px 28px rgba(38, 52, 82, .16) !important;
    }
    html.light-theme .rest-timer-overlay.timer-fullscreen {
      background: rgba(244, 246, 251, .98) !important;
    }

    .active-workout-banner {
      display: none;
      align-items: center;
      gap: 10px;
      margin: 10px 16px 4px;
      padding: 11px 12px;
      border: 1px solid rgba(var(--session-color-rgb, 77, 124, 255), .28);
      border-radius: 14px;
      background: linear-gradient(145deg, rgba(var(--session-color-rgb, 77, 124, 255), .15), rgba(255,255,255,.045));
      box-shadow: 0 8px 22px rgba(0,0,0,.18);
    }

    .active-workout-banner.visible { display: flex; }

    /* Immediate safe slot for the compact timer. The stack measurement layer
       refines this offset afterwards, but this default prevents the banner
       from ever flashing underneath the timer when Back is tapped right after
       the reduction button. */
    html.rest-timer-running:not(.rest-timer-fullscreen) .active-workout-banner.visible {
      margin-top: max(88px, calc(var(--safe-area-top) + 82px));
    }

    .active-workout-banner-main { min-width: 0; flex: 1; }
    .active-workout-banner-kicker {
      color: var(--text-secondary);
      font-size: .65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    .active-workout-banner-title {
      overflow: hidden;
      margin-top: 1px;
      color: var(--text-primary);
      font-size: .84rem;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .active-workout-banner-duration {
      flex: 0 0 auto;
      color: var(--text-secondary);
      font-size: .78rem;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }
    .active-workout-resume {
      flex: 0 0 auto;
      min-height: 38px;
      padding: 7px 11px;
      border: 0;
      border-radius: 10px;
      background: rgb(var(--session-color-rgb, 77, 124, 255));
      color: #fff;
      font: inherit;
      font-size: .74rem;
      font-weight: 800;
      cursor: pointer;
    }

    @media (max-width: 390px) {
      .rest-timer-overlay:not(.timer-fullscreen) .btn-timer {
        padding-inline: 8px !important;
        font-size: .7rem !important;
      }
      .rest-timer-overlay:not(.timer-fullscreen) .btn-timer-expand {
        width: 36px !important;
        min-width: 36px !important;
        padding-inline: 0 !important;
      }
      .active-workout-banner-duration { display: none; }
    }
  `;
  document.head.appendChild(style);
}

function ensureActiveWorkoutBanner() {
  let banner = document.getElementById('active-workout-banner');
  if (banner) return banner;

  banner = document.createElement('div');
  banner.id = 'active-workout-banner';
  banner.className = 'active-workout-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <div class="active-workout-banner-main">
      <div class="active-workout-banner-kicker" id="active-workout-banner-kicker">Séance en cours</div>
      <div class="active-workout-banner-title" id="active-workout-banner-title">Séance</div>
    </div>
    <div class="active-workout-banner-duration" id="active-workout-banner-duration">00:00</div>
    <button type="button" class="active-workout-resume" id="active-workout-resume">Reprendre</button>
  `;

  const app = document.getElementById('app');
  const firstView = app?.querySelector('.view');
  if (app && firstView) app.insertBefore(banner, firstView);
  else app?.prepend(banner);

  banner.querySelector('#active-workout-resume')?.addEventListener('click', resumeWorkout);
  syncLocalizedPatchText();
  return banner;
}

function syncLocalizedPatchText() {
  const french = isFrench();
  const kicker = document.getElementById('active-workout-banner-kicker');
  const resume = document.getElementById('active-workout-resume');
  const back = document.getElementById('btn-back');
  if (kicker) kicker.textContent = french ? 'Séance en cours' : 'Workout in progress';
  if (resume) resume.textContent = french ? 'Reprendre' : 'Resume';
  if (back && patchState.liveWorkout) {
    back.setAttribute('aria-label', french ? "Parcourir l’app sans terminer la séance" : 'Browse the app without ending the workout');
    back.title = french ? "Parcourir l’app" : 'Browse app';
  }
  syncTimerExpandButton();
}

function syncBannerText() {
  const title = document.getElementById('workout-title')?.textContent?.trim();
  const duration = document.getElementById('workout-duration')?.textContent?.trim();
  const bannerTitle = document.getElementById('active-workout-banner-title');
  const bannerDuration = document.getElementById('active-workout-banner-duration');
  if (bannerTitle && title) bannerTitle.textContent = title;
  if (bannerDuration && duration) bannerDuration.textContent = duration;
}

function setBannerVisible(visible) {
  const banner = ensureActiveWorkoutBanner();
  banner?.classList.toggle('visible', Boolean(visible));
  if (visible) {
    syncBannerText();
    clearInterval(patchState.bannerInterval);
    patchState.bannerInterval = setInterval(syncBannerText, 1000);
  } else {
    clearInterval(patchState.bannerInterval);
    patchState.bannerInterval = null;
  }
}

function setView(viewName, { workout = false } = {}) {
  const target = document.getElementById(`view-${viewName}`);
  if (!target) return;

  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  target.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('active', !workout && button.dataset.view === viewName);
  });

  const nav = document.getElementById('bottom-nav');
  if (nav) nav.style.display = workout ? 'none' : '';

  const app = document.getElementById('app');
  if (app) app.style.paddingBottom = workout ? '16px' : '';

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function browseAwayFromWorkout(viewName = 'home') {
  if (!patchState.liveWorkout) return;
  patchState.browsing = true;
  patchState.browsingView = viewName;
  setView(viewName);
  setBannerVisible(true);
}

function resumeWorkout() {
  if (!patchState.liveWorkout) return;
  patchState.browsing = false;
  setBannerVisible(false);
  setView('workout', { workout: true });
  syncLocalizedPatchText();
}

function markWorkoutStarted() {
  patchState.pendingLiveStart = false;
  patchState.recordedEditPending = false;
  patchState.liveWorkout = true;
  patchState.browsing = false;
  setBannerVisible(false);
  syncLocalizedPatchText();
}

function clearLiveWorkout() {
  patchState.liveWorkout = false;
  patchState.pendingLiveStart = false;
  patchState.browsing = false;
  setBannerVisible(false);
  const back = document.getElementById('btn-back');
  if (back) {
    back.removeAttribute('title');
    back.setAttribute('aria-label', isFrench() ? 'Retour' : 'Back');
  }
}

function ensureTimerExpandButton() {
  const controls = document.querySelector('#rest-timer-overlay .timer-controls');
  if (!controls) return null;
  let button = document.getElementById('btn-timer-expand');
  if (button) return button;

  button = document.createElement('button');
  button.type = 'button';
  button.id = 'btn-timer-expand';
  button.className = 'btn-timer secondary btn-timer-expand';
  button.addEventListener('click', () => setTimerFullscreen(!patchState.timerFullscreen));
  controls.appendChild(button);
  syncTimerExpandButton();
  return button;
}

function syncTimerExpandButton() {
  const button = document.getElementById('btn-timer-expand');
  if (!button) return;
  const french = isFrench();
  if (patchState.timerFullscreen) {
    button.textContent = french ? 'Réduire' : 'Compact';
    button.setAttribute('aria-label', french ? 'Réduire le compte à rebours' : 'Use compact countdown');
    button.title = french ? 'Mode compact' : 'Compact mode';
  } else {
    button.textContent = '⛶';
    button.setAttribute('aria-label', french ? 'Compte à rebours en plein écran' : 'Fullscreen countdown');
    button.title = french ? 'Plein écran' : 'Fullscreen';
  }
}

function setTimerFullscreen(enabled) {
  const overlay = document.getElementById('rest-timer-overlay');
  if (!overlay) return;
  patchState.timerFullscreen = Boolean(enabled) && overlay.classList.contains('active');
  overlay.classList.toggle('timer-fullscreen', patchState.timerFullscreen);
  document.documentElement.classList.toggle('rest-timer-fullscreen', patchState.timerFullscreen);
  syncTimerExpandButton();
}

function observeTimer() {
  const overlay = document.getElementById('rest-timer-overlay');
  if (!overlay) return;
  ensureTimerExpandButton();
  let wasRunning = false;
  const sync = () => {
    const running = overlay.classList.contains('active');

    // A new rest period should be immersive by default, as it was before the
    // compact timer was introduced. `wasRunning` means a user reduction stays
    // reduced for the rest of this same countdown.
    if (running && !wasRunning) setTimerFullscreen(true);

    document.documentElement.classList.toggle('rest-timer-running', running);
    if (!running && patchState.timerFullscreen) setTimerFullscreen(false);
    wasRunning = running;
  };
  sync();
  new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

function observeWorkoutLifecycle() {
  const summary = document.getElementById('summary-overlay');
  const workoutView = document.getElementById('view-workout');

  if (summary) {
    new MutationObserver(() => {
      if (summary.classList.contains('active')) clearLiveWorkout();
    }).observe(summary, { attributes: true, attributeFilter: ['class'] });
  }

  if (!workoutView) return;
  new MutationObserver(() => {
    const active = workoutView.classList.contains('active');

    // A session card click marks a pending live start before app.js changes the
    // view. Observing the actual view transition avoids the former microtask race.
    if (active && patchState.pendingLiveStart && !patchState.recordedEditPending) {
      markWorkoutStarted();
      return;
    }

    // When our own browsing code hides the workout, keep it alive. If app.js
    // hides it for another reason while we are not browsing, the session ended.
    if (!active && patchState.liveWorkout && !patchState.browsing) {
      clearLiveWorkout();
    }
  }).observe(workoutView, { attributes: true, attributeFilter: ['class'] });
}

function installNavigationGuards() {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const sessionCard = target.closest('.session-card');
    if (sessionCard) {
      if (patchState.liveWorkout) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resumeWorkout();
        return;
      }
      // Set this synchronously. The MutationObserver will mark the workout live
      // only after app.js has actually activated #view-workout.
      patchState.pendingLiveStart = true;
      patchState.recordedEditPending = false;
      return;
    }

    const back = target.closest('#btn-back');
    if (back && patchState.liveWorkout && !patchState.browsing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      browseAwayFromWorkout('home');
      return;
    }

    const navButton = target.closest('.nav-btn');
    if (navButton && patchState.liveWorkout && patchState.browsing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const view = navButton.dataset.view || 'home';
      patchState.browsingView = view;
      setView(view);
      return;
    }

    if (target.closest('#btn-supplements-back') && patchState.liveWorkout && patchState.browsing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      patchState.browsingView = 'home';
      setView('home');
      return;
    }

    if (target.closest('.supplements-manage-btn') && patchState.liveWorkout && patchState.browsing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      patchState.browsingView = 'supplements';
      setView('supplements');
    }
  }, true);

  window.addEventListener('workout:edit-requested', (event) => {
    patchState.recordedEditPending = true;
    patchState.pendingLiveStart = false;
    if (patchState.liveWorkout) {
      event.stopImmediatePropagation();
      patchState.recordedEditPending = false;
      resumeWorkout();
    } else {
      setTimeout(() => { patchState.recordedEditPending = false; }, 0);
    }
  }, true);

  window.addEventListener('workout:started', markWorkoutStarted);

  window.addEventListener('language:changed', syncLocalizedPatchText);
}

function installPatch() {
  injectActiveWorkoutStyles();
  ensureActiveWorkoutBanner();
  observeTimer();
  observeWorkoutLifecycle();
  installNavigationGuards();

  // A restored workout may already be visible before this asynchronously
  // loaded module installs its event listeners. Treat that visible view as a
  // live session so the Back button opens browsing instead of the abandon
  // confirmation.
  if (document.getElementById('view-workout')?.classList.contains('active')) {
    markWorkoutStarted();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installPatch, { once: true });
} else {
  installPatch();
}
