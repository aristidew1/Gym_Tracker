// Real spotlight coachmarks: highlight an actual UI element instead of
// showing a generic card. Two modes share the same visuals:
//  - runTour(): a blocking, multi-step guided walkthrough (Next/Skip).
//  - showTip(): a single, non-blocking contextual hint shown once ever.
import { t } from './i18n.js';
import { escapeHtml } from './services/html.js';

const SEEN_KEY = 'muscu_seen_coachmarks';

function getSeen() {
  try {
    const value = JSON.parse(localStorage.getItem(SEEN_KEY));
    return Array.isArray(value) ? new Set(value) : new Set();
  } catch {
    return new Set();
  }
}

function markSeen(id) {
  const seen = getSeen();
  seen.add(id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
}

export function hasSeenTip(id) {
  return getSeen().has(id);
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

// Keeps the spotlight glued to its target across layout shifts (scroll,
// resize, or the tour navigating between views).
function trackTarget(el, hole, bubble) {
  const update = () => {
    const rect = el.getBoundingClientRect();
    positionHole(hole, rect);
    positionBubble(bubble, rect);
  };
  // A target revealed by expanding a section (e.g. "advanced options") can
  // land below the fold — bring it fully into view before spotlighting it.
  const rect = el.getBoundingClientRect();
  const fits = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (!fits) el.scrollIntoView({ block: 'center' });
  update();
  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(el);
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update, true);
  return () => {
    resizeObserver.disconnect();
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', update, true);
  };
}

export function runTour(steps, { navigate, onFinish = () => {} } = {}) {
  ensureStyles();
  let index = 0;
  let cleanup = null;
  const catcher = document.createElement('div');
  catcher.className = 'coachmark-catcher';
  const hole = document.createElement('div');
  hole.className = 'coachmark-hole';
  const bubble = document.createElement('div');
  bubble.className = 'coachmark-bubble';
  document.body.append(catcher, hole, bubble);

  const teardown = () => {
    cleanup?.();
    catcher.remove();
    hole.remove();
    bubble.remove();
  };

  const finish = () => {
    teardown();
    onFinish();
  };

  const renderStep = () => {
    cleanup?.();
    const step = steps[index];
    if (!step) return finish();
    if (step.view) navigate?.(step.view);

    requestAnimationFrame(() => {
      const el = resolveTarget(step.target);
      if (!el) {
        index += 1;
        return renderStep();
      }
      const isLast = index === steps.length - 1;
      bubble.innerHTML = `
        <p class="coachmark-step">${escapeHtml(t('tourStep', { current: index + 1, total: steps.length }))}</p>
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.body)}</p>
        <div class="coachmark-actions">
          <button type="button" class="coachmark-skip">${escapeHtml(t('tourSkip'))}</button>
          <button type="button" class="coachmark-next">${escapeHtml(t(isLast ? 'tourDone' : 'tourNext'))}</button>
        </div>
      `;
      bubble.querySelector('.coachmark-skip').addEventListener('click', finish);
      bubble.querySelector('.coachmark-next').addEventListener('click', () => {
        index += 1;
        renderStep();
      });
      cleanup = trackTarget(el, hole, bubble);
    });
  };

  renderStep();
}

export function showTip(id, { target, title, body } = {}) {
  if (hasSeenTip(id)) return;
  const el = resolveTarget(target);
  if (!el) return;
  markSeen(id);
  ensureStyles();

  const hole = document.createElement('div');
  hole.className = 'coachmark-hole tip';
  const bubble = document.createElement('div');
  bubble.className = 'coachmark-bubble tip';
  bubble.innerHTML = `
    <button type="button" class="coachmark-close" aria-label="${escapeHtml(t('dismissTip'))}">✕</button>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
    <div class="coachmark-actions">
      <button type="button" class="coachmark-gotit">${escapeHtml(t('gotIt'))}</button>
    </div>
  `;
  document.body.append(hole, bubble);

  let autoDismissTimer = null;
  const dismiss = () => {
    cleanup();
    clearTimeout(autoDismissTimer);
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    hole.remove();
    bubble.remove();
  };
  // A tip isn't blocking, so it must not linger indefinitely: a tap
  // anywhere else, or simply enough time passing, clears it on its own.
  const onOutsidePointerDown = (event) => {
    if (bubble.contains(event.target)) return;
    dismiss();
  };
  bubble.querySelector('.coachmark-close').addEventListener('click', dismiss);
  bubble.querySelector('.coachmark-gotit').addEventListener('click', dismiss);
  el.addEventListener('click', dismiss, { once: true });
  document.addEventListener('pointerdown', onOutsidePointerDown, true);
  autoDismissTimer = setTimeout(dismiss, 8000);

  const cleanup = trackTarget(el, hole, bubble);
}
