// Non-destructive live workout UX layer.
// Loaded before app.js through data.js so it can preserve an in-progress workout
// while the user temporarily browses the rest of the application.

const patchState = {
  liveWorkout: false,
  browsing: false,
  browsingView: 'home',
  bannerInterval: null,
};

function injectActiveWorkoutStyles() {
  if (document.getElementById('active-workout-patch-styles')) return;
  const style = document.createElement('style');
  style.id = 'active-workout-patch-styles';
  style.textContent = `
    /* Compact rest timer: fixed at the top, with layout space reserved below it. */
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
      gap: 10px !important;
      z-index: 120 !important;
      animation: none !important;
    }

    html.rest-timer-running .view.active {
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
      gap: 7px !important;
    }

    .rest-timer-overlay .btn-timer {
      min-height: 40px !important;
      padding: 8px 13px !important;
      border-radius: 10px !important;
      font-size: .78rem !important;
      white-space: nowrap !important;
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

    @media (max-width: 370px) {
      .rest-timer-overlay .btn-timer { padding-inline: 9px !important; }
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
      <div class="active-workout-banner-kicker">Séance en cours</div>
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
  return banner;
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
}

function markWorkoutStarted() {
  if (!document.getElementById('view-workout')?.classList.contains('active')) return;
  patchState.liveWorkout = true;
  patchState.browsing = false;
  setBannerVisible(false);
}

function clearLiveWorkout() {
  patchState.liveWorkout = false;
  patchState.browsing = false;
  setBannerVisible(false);
}

function observeTimer() {
  const overlay = document.getElementById('rest-timer-overlay');
  if (!overlay) return;
  const sync = () => document.documentElement.classList.toggle('rest-timer-running', overlay.classList.contains('active'));
  sync();
  new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

function observeWorkoutCompletion() {
  const summary = document.getElementById('summary-overlay');
  const workoutView = document.getElementById('view-workout');

  if (summary) {
    new MutationObserver(() => {
      if (summary.classList.contains('active')) clearLiveWorkout();
    }).observe(summary, { attributes: true, attributeFilter: ['class'] });
  }

  if (workoutView) {
    new MutationObserver(() => {
      if (patchState.liveWorkout && !patchState.browsing && !workoutView.classList.contains('active')) {
        clearLiveWorkout();
      }
    }).observe(workoutView, { attributes: true, attributeFilter: ['class'] });
  }
}

function installNavigationGuards() {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

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
      return;
    }

    const sessionCard = target.closest('.session-card');
    if (sessionCard) {
      if (patchState.liveWorkout) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resumeWorkout();
        return;
      }
      queueMicrotask(markWorkoutStarted);
    }
  }, true);

  window.addEventListener('workout:edit-requested', (event) => {
    if (!patchState.liveWorkout) return;
    event.stopImmediatePropagation();
    resumeWorkout();
  }, true);
}

function installPatch() {
  injectActiveWorkoutStyles();
  ensureActiveWorkoutBanner();
  observeTimer();
  observeWorkoutCompletion();
  installNavigationGuards();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installPatch, { once: true });
} else {
  installPatch();
}
