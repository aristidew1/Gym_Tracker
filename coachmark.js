// Real spotlight coachmarks: highlight an actual UI element instead of
// showing a generic card. Two modes share the same visuals:
//  - runTour(): a blocking, multi-step guided walkthrough (Next/Skip).
//  - showTip(): a single, non-blocking contextual hint shown once ever.
import { t } from './i18n.js';
import { escapeHtml } from './services/html.js';

const SEEN_KEY = 'muscu_seen_coachmarks';
const TIP_AUTO_DISMISS_MS = 8000;
// Views animate in (translate + fade), so a target keeps moving for a few
// frames after it lands in the DOM. Re-measure until its rect stops changing,
// with a hard cap so a permanently animated target can't spin forever.
const SETTLE_MS = 600;
const SETTLE_STABLE_FRAMES = 2;

let uid = 0;
const activeTips = new Set();

function getSeen() {
  try {
    const value = JSON.parse(localStorage.getItem(SEEN_KEY));
    return Array.isArray(value) ? new Set(value) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeen(seen) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
}

function markSeen(id) {
  const seen = getSeen();
  seen.add(id);
  saveSeen(seen);
}

export function hasSeenTip(id) {
  return getSeen().has(id);
}

// Lets the app suppress onboarding tips wholesale for users who are not new:
// someone upgrading already uses these features and shouldn't be taught them.
// Unions into what is stored, so resetSeenTips() still clears everything.
export function markAllTipsSeen(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const seen = getSeen();
  for (const id of ids) {
    if (id) seen.add(id);
  }
  saveSeen(seen);
}

// Test-only helper: lets a "replay onboarding" debug button clear every
// contextual tip's seen flag so they can all be re-triggered.
export function resetSeenTips() {
  localStorage.removeItem(SEEN_KEY);
}

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'coachmark-styles';
  style.textContent = `
    .coachmark-catcher { position: fixed; inset: 0; z-index: 3100; background: transparent; }
    .coachmark-hole {
      position: fixed; z-index: 3101; pointer-events: none; border-radius: 14px;
      box-shadow: 0 0 0 9999px rgba(4, 6, 12, 0.74);
      transition: top 0.22s ease, left 0.22s ease, width 0.22s ease, height 0.22s ease;
    }
    /* Easing is only wanted when the spotlight travels from one step to the
       next; while tracking scroll it would make the halo float behind. */
    .coachmark-hole.coachmark-instant { transition: none; }
    .coachmark-hole.tip {
      box-shadow: 0 0 0 4px rgba(var(--accent-rgb), 0.9), 0 0 0 9999px rgba(4, 6, 12, 0.02);
    }
    .coachmark-bubble {
      position: fixed; z-index: 3102; width: min(88vw, 320px); padding: 16px 16px 14px;
      border: 1px solid var(--border-glass); border-radius: var(--radius-lg, 16px);
      background: linear-gradient(145deg, var(--bg-elevated), var(--bg-elevated-2));
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); color: var(--text-primary);
      animation: coachmark-in 0.2s ease;
    }
    @keyframes coachmark-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .coachmark-step { margin: 0 0 6px; color: var(--text-secondary); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .coachmark-bubble h3 { margin: 0 0 6px; font-size: 1rem; }
    .coachmark-bubble p { margin: 0; color: var(--text-secondary); font-size: 0.82rem; line-height: 1.45; }
    .coachmark-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px; }
    .coachmark-skip { margin-right: auto; border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-size: 0.78rem; cursor: pointer; padding: 6px 0; }
    .coachmark-next, .coachmark-gotit {
      border: 0; border-radius: var(--radius-md, 10px); padding: 9px 16px; font: inherit; font-weight: 700;
      font-size: 0.82rem; cursor: pointer; background: var(--accent, #4d7cff); color: #fff;
    }
    .coachmark-close { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border: 0; border-radius: 50%; background: transparent; color: var(--text-secondary); font-size: 0.95rem; cursor: pointer; }
    .coachmark-bubble.tip .coachmark-close { color: var(--text-secondary); }
  `;
  document.head.appendChild(style);
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Hidden elements (e.g. markup that only lives inside another, currently
// inactive view) resolve to a real DOM node but a zero-size rect — treat
// them the same as "not found" so a step never spotlights a phantom.
function resolveTarget(target) {
  const selectors = Array.isArray(target) ? target : [target];
  for (const selector of selectors) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el && isVisible(el)) return el;
  }
  return null;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusableIn(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled);
}

// Keeps Tab inside the bubble: the scrim only blocks the mouse, so without
// this the keyboard walks into the content hidden behind it.
function trapFocus(bubble, event) {
  if (event.key !== 'Tab') return;
  const items = focusableIn(bubble);
  if (!items.length) {
    event.preventDefault();
    bubble.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === bubble || !bubble.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || active === bubble || !bubble.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function canRestoreFocus(element) {
  if (!element?.isConnected || element.disabled || typeof element.focus !== 'function') return false;
  if (element.closest?.('[aria-hidden="true"]')) return false;
  const overlay = element.closest?.('[class*="overlay"]');
  if (overlay && !overlay.classList.contains('active')) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function getTopActiveOverlay() {
  return [...document.querySelectorAll('[class*="overlay"].active')]
    .filter((element) => canRestoreFocus(element))
    .sort((left, right) => (Number.parseInt(getComputedStyle(left).zIndex, 10) || 0) - (Number.parseInt(getComputedStyle(right).zIndex, 10) || 0))
    .at(-1) || null;
}

// Only called when the coachmark still owns focus. If its original trigger is
// now inside a closed sheet, use a visible control from the active app view.
function restoreFocus(previous) {
  const activeOverlay = getTopActiveOverlay();
  const previousIsExposed = !activeOverlay || activeOverlay.contains(previous);
  const fallbackRoot = activeOverlay || document.querySelector('.view.active') || document;
  const fallback = focusableIn(fallbackRoot).find((element) => canRestoreFocus(element))
    || document.querySelector('.nav-btn.active:not(:disabled)');
  const target = previousIsExposed && canRestoreFocus(previous) ? previous : fallback;
  if (canRestoreFocus(target)) target.focus({ preventScroll: true });
}

function positionHole(hole, rect) {
  const pad = 6;
  hole.style.top = `${rect.top - pad}px`;
  hole.style.left = `${rect.left - pad}px`;
  hole.style.width = `${rect.width + pad * 2}px`;
  hole.style.height = `${rect.height + pad * 2}px`;
}

function positionBubble(bubble, rect) {
  const margin = 12;
  const bubbleRect = bubble.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeBelow = spaceBelow > bubbleRect.height + margin || spaceBelow > rect.top;
  const top = placeBelow
    ? Math.min(rect.bottom + margin, window.innerHeight - bubbleRect.height - margin)
    : Math.max(margin, rect.top - bubbleRect.height - margin);
  let left = rect.left + rect.width / 2 - bubbleRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - bubbleRect.width - margin));
  bubble.style.top = `${Math.max(margin, top)}px`;
  bubble.style.left = `${left}px`;
}

function rectKey(rect) {
  return `${rect.top}:${rect.left}:${rect.width}:${rect.height}`;
}

function hasRunningAnimation(element) {
  for (let current = element; current; current = current.parentElement) {
    if (typeof current.getAnimations !== 'function') continue;
    if (current.getAnimations().some((animation) => ['pending', 'running'].includes(animation.playState))) return true;
  }
  return false;
}

// Keeps the spotlight glued to its target across layout shifts (scroll,
// resize, or the tour navigating between views).
function trackTarget(el, hole, bubble) {
  const apply = (rect) => {
    positionHole(hole, rect);
    positionBubble(bubble, rect);
  };
  const update = () => apply(el.getBoundingClientRect());

  // A target revealed by expanding a section (e.g. "advanced options") can
  // land below the fold — bring it fully into view before spotlighting it.
  const rect = el.getBoundingClientRect();
  const fits = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (!fits) el.scrollIntoView({ block: 'center' });
  update();

  let settleFrame = null;
  let trackFrame = null;
  const goInstant = () => hole.classList.add('coachmark-instant');

  // The target can still be animating (including through an ancestor): its
  // size need not change, so ResizeObserver stays silent. Poll until both the
  // rect and its animation chain settle, while retaining step-to-step easing.
  const settleUntil = performance.now() + SETTLE_MS;
  let stableFrames = 0;
  let lastKey = rectKey(el.getBoundingClientRect());
  const settle = () => {
    const next = el.getBoundingClientRect();
    const key = rectKey(next);
    if (key === lastKey) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      lastKey = key;
      apply(next);
    }
    if ((stableFrames >= SETTLE_STABLE_FRAMES && !hasRunningAnimation(el)) || performance.now() >= settleUntil) {
      settleFrame = null;
      return;
    }
    settleFrame = requestAnimationFrame(settle);
  };
  settleFrame = requestAnimationFrame(settle);

  // Scroll fires far more often than once per frame on a phone; coalesce.
  const scheduleUpdate = () => {
    goInstant();
    if (trackFrame !== null) return;
    trackFrame = requestAnimationFrame(() => {
      trackFrame = null;
      update();
    });
  };

  // ResizeObserver always fires once for the initial observation — ignoring it
  // keeps the step-to-step easing from being cancelled the moment it starts.
  let observed = false;
  const resizeObserver = new ResizeObserver(() => {
    if (!observed) {
      observed = true;
      return;
    }
    scheduleUpdate();
  });
  resizeObserver.observe(el);
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('scroll', scheduleUpdate, true);
  return () => {
    if (settleFrame !== null) cancelAnimationFrame(settleFrame);
    if (trackFrame !== null) cancelAnimationFrame(trackFrame);
    hole.classList.remove('coachmark-instant');
    resizeObserver.disconnect();
    window.removeEventListener('resize', scheduleUpdate);
    window.removeEventListener('scroll', scheduleUpdate, true);
  };
}

export function runTour(steps, { navigate, onFinish = () => {} } = {}) {
  ensureStyles();
  let index = 0;
  let cleanup = null;
  let renderFrame = null;
  let finished = false;
  const previousFocus = document.activeElement;
  uid += 1;
  const titleId = `coachmark-title-${uid}`;
  const bodyId = `coachmark-body-${uid}`;
  const catcher = document.createElement('div');
  catcher.className = 'coachmark-catcher';
  const hole = document.createElement('div');
  hole.className = 'coachmark-hole';
  const bubble = document.createElement('div');
  bubble.className = 'coachmark-bubble';
  bubble.setAttribute('role', 'dialog');
  bubble.setAttribute('aria-modal', 'true');
  bubble.setAttribute('aria-labelledby', titleId);
  bubble.setAttribute('aria-describedby', bodyId);
  bubble.tabIndex = -1;
  document.body.append(catcher, hole, bubble);

  const teardown = () => {
    cleanup?.();
    cleanup = null;
    if (renderFrame !== null) cancelAnimationFrame(renderFrame);
    renderFrame = null;
    document.removeEventListener('keydown', onKeyDown, true);
    const owned = bubble.contains(document.activeElement);
    catcher.remove();
    hole.remove();
    bubble.remove();
    return owned;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const shouldRestoreFocus = teardown();
    try {
      onFinish();
    } finally {
      const active = document.activeElement;
      if (shouldRestoreFocus && (active === document.body || active === document.documentElement || !canRestoreFocus(active))) {
        restoreFocus(previousFocus);
      }
    }
  };

  // Escape is the standard way out of a modal dialog, so it means the same
  // thing as "Passer le guide" — including running onFinish.
  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish();
      return;
    }
    trapFocus(bubble, event);
  }
  document.addEventListener('keydown', onKeyDown, true);

  const renderStep = () => {
    if (renderFrame !== null) cancelAnimationFrame(renderFrame);
    renderFrame = null;
    cleanup?.();
    cleanup = null;
    if (finished) return;
    const step = steps[index];
    if (!step) return finish();
    if (step.view) navigate?.(step.view);

    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      if (finished) return;
      const el = resolveTarget(step.target);
      if (!el) {
        index += 1;
        return renderStep();
      }
      const isLast = index === steps.length - 1;
      bubble.innerHTML = `
        <p class="coachmark-step">${escapeHtml(t('tourStep', { current: index + 1, total: steps.length }))}</p>
        <h3 id="${titleId}">${escapeHtml(step.title)}</h3>
        <p id="${bodyId}">${escapeHtml(step.body)}</p>
        <div class="coachmark-actions">
          <button type="button" class="coachmark-skip">${escapeHtml(t('tourSkip'))}</button>
          <button type="button" class="coachmark-next">${escapeHtml(t(isLast ? 'tourDone' : 'tourNext'))}</button>
        </div>
      `;
      bubble.querySelector('.coachmark-skip').addEventListener('click', finish);
      bubble.querySelector('.coachmark-next').addEventListener('click', (event) => {
        event.currentTarget.disabled = true;
        index += 1;
        renderStep();
      });
      cleanup = trackTarget(el, hole, bubble);
      // Focus the dialog itself so the whole step is announced, and without
      // scrolling — that would move the target we just spotlighted.
      bubble.focus({ preventScroll: true });
    });
  };

  renderStep();
}

export function showTip(id, { target, title, body } = {}) {
  if (hasSeenTip(id) || activeTips.has(id)) return;
  const el = resolveTarget(target);
  if (!el) return;
  ensureStyles();

  const previousFocus = document.activeElement;
  uid += 1;
  const titleId = `coachmark-title-${uid}`;
  const bodyId = `coachmark-body-${uid}`;
  const hole = document.createElement('div');
  hole.className = 'coachmark-hole tip';
  const bubble = document.createElement('div');
  bubble.className = 'coachmark-bubble tip';
  // A tip doesn't block the app, so it is a dialog but not a modal one.
  bubble.setAttribute('role', 'dialog');
  bubble.setAttribute('aria-modal', 'false');
  bubble.setAttribute('aria-labelledby', titleId);
  bubble.setAttribute('aria-describedby', bodyId);
  bubble.tabIndex = -1;
  bubble.innerHTML = `
    <button type="button" class="coachmark-close" aria-label="${escapeHtml(t('dismissTip'))}">✕</button>
    <h3 id="${titleId}">${escapeHtml(title)}</h3>
    <p id="${bodyId}">${escapeHtml(body)}</p>
    <div class="coachmark-actions">
      <button type="button" class="coachmark-gotit">${escapeHtml(t('gotIt'))}</button>
    </div>
  `;
  document.body.append(hole, bubble);
  activeTips.add(id);

  let closed = false;
  let autoDismissTimer = null;
  let untrack = null;
  // A tip is only ever burned when the user actually acknowledges it. Merely
  // going away (timeout, tapping elsewhere, Escape) leaves it unseen, so an
  // unread hint gets another chance instead of being lost forever.
  const close = (acknowledged) => {
    if (closed) return;
    closed = true;
    activeTips.delete(id);
    if (acknowledged) markSeen(id);
    clearTimeout(autoDismissTimer);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    el.removeEventListener('click', onTargetClick);
    untrack?.();
    const owned = bubble.contains(document.activeElement);
    hole.remove();
    bubble.remove();
    if (owned) restoreFocus(previousFocus);
  };

  // Using the spotlighted control is the strongest possible "understood".
  function onTargetClick() {
    close(true);
  }
  function onPointerDown(event) {
    if (bubble.contains(event.target)) return;
    close(el.contains(event.target));
  }
  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(false);
  }

  bubble.querySelector('.coachmark-close').addEventListener('click', () => close(true));
  bubble.querySelector('.coachmark-gotit').addEventListener('click', () => close(true));
  el.addEventListener('click', onTargetClick);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  autoDismissTimer = setTimeout(() => close(false), TIP_AUTO_DISMISS_MS);

  untrack = trackTarget(el, hole, bubble);
  bubble.focus({ preventScroll: true });
}
