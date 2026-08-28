// Keeps the compact rest timer and the "workout in progress" banner from
// occupying the same vertical space while the user browses the app.
//
// Important: the workout back button is intercepted by active-workout-patch.js
// with stopImmediatePropagation(). We therefore prime the stacking layout from
// the window capture phase, before the banner is made visible. This prevents a
// one-frame/first-open overlap that used to disappear only after toggling the
// timer fullscreen mode.

function installWorkoutStatusStackFix() {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return;

  const root = document.documentElement;
  const timer = document.getElementById('rest-timer-overlay');
  const banner = document.getElementById('active-workout-banner');
  const app = document.getElementById('app');
  if (!root || !timer || !banner || !app) return;

  if (!document.getElementById('active-workout-stack-fix-styles')) {
    const style = document.createElement('style');
    style.id = 'active-workout-stack-fix-styles';
    style.textContent = `
      /* The fixed compact timer owns the first top slot. When a live workout is
         minimized, its resume banner starts immediately below that slot. */
      html.rest-timer-running.workout-status-stacked:not(.rest-timer-fullscreen) .view.active {
        padding-top: 0 !important;
      }

      html.rest-timer-running.workout-status-stacked:not(.rest-timer-fullscreen) .active-workout-banner.visible {
        margin-top: var(--workout-status-stack-offset, 88px) !important;
      }
    `;
    document.head.appendChild(style);
  }

  let frame = 0;
  let primedForBrowse = false;

  const isTimerCompact = () => (
    timer.classList.contains('active')
    && !timer.classList.contains('timer-fullscreen')
  );

  const calculateOffset = () => {
    const timerRect = timer.getBoundingClientRect();
    const gap = 8;

    // The banner is the first child of #app, whose normal-flow origin is the
    // viewport's top in the WebView. Using #app's computed padding here can
    // incorrectly produce 0px and place the banner beneath the compact timer.
    // Anchor the reservation to the timer's actual viewport bottom instead.
    return Math.max(88, Math.ceil(timerRect.bottom + gap));
  };

  const measure = ({ forceStack = false } = {}) => {
    frame = 0;
    const timerCompact = isTimerCompact();
    const bannerVisible = banner.classList.contains('visible');
    const stacked = timerCompact && (bannerVisible || forceStack || primedForBrowse);

    root.classList.toggle('workout-status-stacked', stacked);

    if (!stacked) {
      root.style.removeProperty('--workout-status-stack-offset');
      if (!bannerVisible) primedForBrowse = false;
      return;
    }

    // getBoundingClientRect forces a current layout read, so the CSS variable is
    // correct before the browser paints the newly-visible banner.
    root.style.setProperty('--workout-status-stack-offset', `${calculateOffset()}px`);

    if (bannerVisible) primedForBrowse = false;
  };

  const scheduleMeasure = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => measure());
  };

  const primeStackBeforeBrowse = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('#btn-back')) return;
    if (!isTimerCompact()) return;

    // This runs on window capture, before active-workout-patch.js handles the
    // click on document capture and reveals the resume banner.
    primedForBrowse = true;
    measure({ forceStack: true });

    // Re-check after the click handler has revealed the banner, then once again
    // at paint time in case safe-area/layout values changed in the same turn.
    queueMicrotask(() => measure({ forceStack: true }));
    scheduleMeasure();
  };

  window.addEventListener('click', primeStackBeforeBrowse, true);

  new MutationObserver(() => {
    // Apply synchronously first: class changes can occur immediately before a
    // paint. The scheduled pass then catches any geometry change caused by CSS.
    measure();
    scheduleMeasure();
  }).observe(timer, {
    attributes: true,
    attributeFilter: ['class'],
  });

  new MutationObserver(() => {
    measure();
    scheduleMeasure();
  }).observe(banner, {
    attributes: true,
    attributeFilter: ['class'],
  });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      measure();
      scheduleMeasure();
    }).observe(timer);
  }

  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('orientationchange', scheduleMeasure);
  measure();
  scheduleMeasure();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installWorkoutStatusStackFix, { once: true });
  } else {
    installWorkoutStatusStackFix();
  }
}
