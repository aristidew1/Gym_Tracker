// Keeps the compact rest timer and the "workout in progress" banner from
// occupying the same vertical space while the user browses the app.

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
      /* When both status surfaces are visible, the timer owns the fixed top slot.
         The workout banner is moved immediately below it and the view no longer
         reserves a second timer-sized gap. */
      html.rest-timer-running.workout-status-stacked:not(.rest-timer-fullscreen) .view.active {
        padding-top: 0 !important;
      }

      html.rest-timer-running.workout-status-stacked:not(.rest-timer-fullscreen) .active-workout-banner.visible {
        margin-top: var(--workout-status-stack-offset, 80px) !important;
      }
    `;
    document.head.appendChild(style);
  }

  let frame = 0;

  const measure = () => {
    frame = 0;
    const timerCompact = timer.classList.contains('active') && !timer.classList.contains('timer-fullscreen');
    const bannerVisible = banner.classList.contains('visible');
    const stacked = timerCompact && bannerVisible;

    root.classList.toggle('workout-status-stacked', stacked);

    if (!stacked) {
      root.style.removeProperty('--workout-status-stack-offset');
      return;
    }

    const timerRect = timer.getBoundingClientRect();
    const appRect = app.getBoundingClientRect();
    const appPaddingTop = Number.parseFloat(getComputedStyle(app).paddingTop) || 0;
    const appContentTop = appRect.top + appPaddingTop;
    const gap = 8;
    const offset = Math.max(0, Math.ceil(timerRect.bottom - appContentTop + gap));
    root.style.setProperty('--workout-status-stack-offset', `${offset}px`);
  };

  const scheduleMeasure = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };

  new MutationObserver(scheduleMeasure).observe(timer, {
    attributes: true,
    attributeFilter: ['class'],
  });
  new MutationObserver(scheduleMeasure).observe(banner, {
    attributes: true,
    attributeFilter: ['class'],
  });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(scheduleMeasure).observe(timer);
  }

  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('orientationchange', scheduleMeasure);
  scheduleMeasure();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installWorkoutStatusStackFix, { once: true });
  } else {
    installWorkoutStatusStackFix();
  }
}
