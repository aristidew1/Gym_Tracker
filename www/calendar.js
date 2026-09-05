// calendar.js — Calendar view for the workout tracking app
// Renders a monthly calendar grid, highlights workout days, and shows day details.

import { getWorkoutsByMonth, getWorkoutsByDate, deleteWorkout, getStats } from './storage.js';
import { getWorkoutSessionId } from './models/workout-schema.js';
import { getActiveProgram, getProgramById } from './services/program-storage.js';
import { getExerciseDisplayName } from './data.js';
import { getLanguage, localizeText, t } from './i18n.js';
import { getSupplementStatus, getSupplements, getTakenSupplementIds, toggleSupplementTaken } from './supplements.js';
import { escapeHtml } from './services/html.js';

// ── Internal navigation state ───────────────────────────────────────────────
const now = new Date();
let currentYear  = now.getFullYear();
let currentMonth = now.getMonth(); // 0-indexed
let detailDate = null;
let supplementDetailsOpen = false;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * initCalendar()
 * Wires up the prev/next navigation buttons and renders the calendar
 * for the current month.
 */
export function initCalendar() {
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');

  prevBtn.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar(currentYear, currentMonth);
  });

  nextBtn.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar(currentYear, currentMonth);
  });

  // Initial render for today's month
  renderCalendar(currentYear, currentMonth);
}

export function openWorkoutDate(dateStr) {
  const [year, month] = dateStr.split('-').map(Number);
  currentYear = year;
  currentMonth = month - 1;
  renderCalendar(currentYear, currentMonth);
  showDayDetail(dateStr);
}

/**
 * renderCalendar(year, month)
 * Builds and injects the full calendar grid for the given year/month.
 * @param {number} year  – full year (e.g. 2026)
 * @param {number} month – 0-indexed month (0 = January)
 */
export function renderCalendar(year, month) {
  // ── 1. Update the month/year title ──────────────────────────────────────
  const titleEl = document.getElementById('cal-month-title');
  titleEl.textContent = new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-US' : 'fr-FR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));

  // ── 2. Calculate first day offset (ISO week: Monday = 0) & total days ──
  const firstDayOfMonth = new Date(year, month, 1);
  // getDay() returns 0 (Sun) – 6 (Sat). Convert to Mon-based offset:
  // Mon=0, Tue=1, … Sun=6
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const totalDays   = new Date(year, month + 1, 0).getDate();

  // ── 3. Fetch workouts for this month ────────────────────────────────────
  const workouts = getWorkoutsByMonth(year, month);
  renderCalendarLegend();

  // Build a lookup: day number → first workout's sessionType
  // (if multiple workouts on the same day, the first one determines color)
  const workoutByDay = {};
  workouts.forEach(w => {
    const day = parseInt(w.date.split('-')[2], 10);
    if (!workoutByDay[day]) {
      workoutByDay[day] = w;
    }
  });

  // ── 4. Build the grid cells ─────────────────────────────────────────────
  const container = document.getElementById('calendar-days');
  container.innerHTML = '';

  // Today reference for highlighting
  const today     = new Date();
  const todayDay  = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear  = today.getFullYear();

  // Empty padding cells before the first day
  for (let i = 0; i < startOffset; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.classList.add('calendar-day', 'empty');
    container.appendChild(emptyCell);
  }

  // Day cells
  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement('div');
    cell.classList.add('calendar-day');
    cell.textContent = day;

    // Highlight today
    if (day === todayDay && month === todayMonth && year === todayYear) {
      cell.classList.add('today');
    }

    // Highlight workout days with session color
    if (workoutByDay[day]) {
      cell.classList.add('has-workout');
      const workout = workoutByDay[day];
      const session = getProgramById(workout.programId)?.sessions[getWorkoutSessionId(workout)];
      cell.style.setProperty('--day-color-rgb', session?.colorRgb || workout.sessionColorRgb || '77, 124, 255');
    }

    // Build the date string (YYYY-MM-DD) for click handler
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const supplementStatus = getSupplementStatus(dateStr);
    // The current day is trackable throughout the day; only dates after today
    // must remain unmarked.
    const isFuture = new Date(`${dateStr}T00:00:00`).getTime() > Date.now();
    if (supplementStatus && !isFuture) {
      const state = supplementStatusState(supplementStatus);
      cell.classList.add(`supplements-${state}`);
      cell.setAttribute('aria-label', supplementStatusLabel(state));
      const marker = document.createElement('span');
      marker.className = `calendar-supplement-marker ${state}`;
      marker.setAttribute('aria-hidden', 'true');
      cell.appendChild(marker);
    }
    cell.addEventListener('click', () => showDayDetail(dateStr));

    container.appendChild(cell);
  }

  // ── 5. Update streak display ────────────────────────────────────────────
  const stats = getStats(getActiveProgram());
  const streakEl = document.getElementById('cal-streak-value');
  if (streakEl) {
    streakEl.textContent = stats.streak;
  }
  const streakLabel = document.getElementById('cal-streak-label');
  if (streakLabel) streakLabel.textContent = t(stats.streakUnit === 'week' ? 'consecutiveWeeks' : 'consecutiveWorkouts');
}

function supplementStatusState(status) {
  if (status.complete) return 'complete';
  if (status.taken > 0) return 'partial';
  return 'incomplete';
}

function supplementStatusLabel(state) {
  if (state === 'complete') return t('supplementsTakenCalendar');
  if (state === 'partial') return t('supplementsPartialCalendar');
  return t('supplementsMissingCalendar');
}

function renderCalendarLegend() {
  const legend = document.getElementById('calendar-legend');
  const program = getActiveProgram();
  legend.replaceChildren();
  legend.setAttribute('aria-label', t('calendarLegend'));

  const sessionIds = (program?.sessionOrder || []).filter((sessionId) => program.sessions[sessionId]);
  if (sessionIds.length > 0) {
    const group = document.createElement('div');
    group.className = 'calendar-legend-group';
    const title = document.createElement('span');
    title.className = 'calendar-legend-group-title';
    title.textContent = t('calendarLegendSessionsTitle');
    group.appendChild(title);
    sessionIds.forEach((sessionId) => {
      const session = program.sessions[sessionId];
      const item = document.createElement('span');
      item.className = 'calendar-legend-item';
      const dot = document.createElement('span');
      dot.className = 'calendar-legend-dot';
      dot.style.setProperty('--legend-color-rgb', session.colorRgb || '77, 124, 255');
      const name = document.createElement('span');
      name.textContent = localizeText(session.name);
      item.append(dot, name);
      group.appendChild(item);
    });
    legend.appendChild(group);
  }

  if (getSupplements().length > 0) {
    const group = document.createElement('div');
    group.className = 'calendar-legend-group';
    const title = document.createElement('span');
    title.className = 'calendar-legend-group-title';
    title.textContent = t('calendarLegendSupplementsTitle');
    group.appendChild(title);
    const complete = document.createElement('span');
    complete.className = 'calendar-legend-item supplement-legend-item';
    complete.innerHTML = `<span class="supplement-calendar-dot complete"></span><span>${t('supplementsTakenCalendar')}</span>`;
    const partial = document.createElement('span');
    partial.className = 'calendar-legend-item supplement-legend-item';
    partial.innerHTML = `<span class="supplement-calendar-dot partial"></span><span>${t('supplementsPartialCalendar')}</span>`;
    const incomplete = document.createElement('span');
    incomplete.className = 'calendar-legend-item supplement-legend-item';
    incomplete.innerHTML = `<span class="supplement-calendar-dot incomplete"></span><span>${t('supplementsMissingCalendar')}</span>`;
    group.append(complete, partial, incomplete);
    legend.appendChild(group);
  }
}

/**
 * showDayDetail(dateStr)
 * Opens the detail panel for a specific day, listing all workouts and
 * their exercises.
 * @param {string} dateStr – date in 'YYYY-MM-DD' format
 */
export function showDayDetail(dateStr) {
  const panel = document.getElementById('calendar-detail');
  const workouts = getWorkoutsByDate(dateStr);
  const supplementStatus = getSupplementStatus(dateStr);
  // The current day is trackable throughout the day; only dates after today
  // must remain uneditable/unmarked.
  const isFuture = new Date(`${dateStr}T00:00:00`).getTime() > Date.now();

  // No tracked activity → hide the panel
  if ((!workouts || workouts.length === 0) && !supplementStatus) {
    panel.classList.remove('active');
    return;
  }

  // The supplement checklist starts collapsed each time a different day is
  // opened, but stays open across re-renders triggered by toggling within it.
  if (dateStr !== detailDate) supplementDetailsOpen = false;
  detailDate = dateStr;

  // Format the date nicely in French (e.g. "5 Juillet 2026")
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const formattedDate = new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr)));

  // Build detail HTML for every workout on that day
  let html = '';
  if (supplementStatus && !isFuture) {
    const state = supplementStatusState(supplementStatus);
    const icon = state === 'complete' ? '✓' : state === 'partial' ? '~' : '!';
    const takenIds = new Set(getTakenSupplementIds(dateStr));
    const supplements = getSupplements().filter((item) => !item.createdAt || item.createdAt <= dateStr);
    html += `<details class="calendar-supplement-details"${supplementDetailsOpen ? ' open' : ''}>
      <summary class="calendar-supplement-status ${state}"><span class="calendar-supplement-icon" aria-hidden="true">${icon}</span><div><strong>${t('supplements')}</strong><small>${t('supplementsProgress', supplementStatus)}</small></div><span class="calendar-supplement-chevron" aria-hidden="true">▾</span></summary>
      <div class="supplements-checklist calendar-supplements-checklist">${supplements.map((item) => {
        const taken = takenIds.has(item.id);
        const dose = [item.dose, item.unit].filter(Boolean).join(' ');
        return `<button type="button" class="supplement-check ${taken ? 'taken' : ''}" data-calendar-supplement-id="${escapeHtml(item.id)}" aria-pressed="${taken}"><span class="supplement-checkmark">✓</span><span class="supplement-name">${escapeHtml(item.name)}${dose ? `<small>${escapeHtml(dose)}</small>` : ''}</span></button>`;
      }).join('')}</div>
    </details>`;
  }

  workouts.forEach(workout => {
    const sessionId = getWorkoutSessionId(workout);
    const session = getProgramById(workout.programId)?.sessions[sessionId];
    const sessionName     = session?.name || workout.sessionName || sessionId;
    const sessionSubtitle = session?.subtitle || workout.sessionSubtitle || '';

    // ── Header ────────────────────────────────────────────────────────────
    html += `
      <div class="calendar-detail-header">
        <h3>${escapeHtml(localizeText(sessionName))}${sessionSubtitle ? ` — ${escapeHtml(localizeText(sessionSubtitle))}` : ''}</h3>
        <span class="detail-date">${formattedDate}</span>
      </div>`;

    // ── Exercise list ─────────────────────────────────────────────────────
    if (workout.exercises && workout.exercises.length > 0) {
      workout.exercises.forEach(ex => {
        const setsStr = ex.sets.map(s => {
          // If weight is 0 (bodyweight), show just reps
          const drops = (s.segments || []).map((segment) => `D ${segment.weight === 0 ? '' : `${segment.weight}kg×`}${segment.reps}`).join(' + ');
          if (s.weight === 0) {
            return `${s.reps} reps${drops ? ` (${drops})` : ''}`;
          }
          return `${s.weight}kg×${s.reps}${drops ? ` (${drops})` : ''}`;
        }).join(' / ');

        html += `
      <div class="detail-exercise">
        <span class="detail-ex-name">${escapeHtml(getExerciseDisplayName(ex.exerciseId, ex.exerciseName))}</span>
        <span class="detail-ex-data">${escapeHtml(setsStr)}</span>
      </div>`;
      });
    }

    // ── Workout actions ───────────────────────────────────────────────────
    html += `
      <div class="calendar-workout-actions">
        <button class="btn-edit-recorded-workout" data-id="${escapeHtml(workout.id)}">✎ ${t('editRecordedWorkout')}</button>
        <button class="btn-delete-workout" data-id="${escapeHtml(workout.id)}">${t('deleteRecordedWorkout')}</button>
      </div>`;
  });

  panel.innerHTML = html;
  panel.classList.add('active');

  // ── Wire up the supplement disclosure and checklist toggles ─────────────
  const supplementDetails = panel.querySelector('.calendar-supplement-details');
  supplementDetails?.addEventListener('toggle', () => {
    supplementDetailsOpen = supplementDetails.open;
  });
  panel.querySelectorAll('[data-calendar-supplement-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleSupplementTaken(btn.dataset.calendarSupplementId, dateStr);
      supplementDetailsOpen = true;
      renderCalendar(currentYear, currentMonth);
      showDayDetail(dateStr);
      window.dispatchEvent(new CustomEvent('supplements:updated'));
    });
  });

  panel.querySelectorAll('.btn-edit-recorded-workout').forEach(btn => {
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('workout:edit-requested', { detail: { workoutId: btn.dataset.id } }));
    });
  });

  // ── Wire up delete buttons ──────────────────────────────────────────────
  panel.querySelectorAll('.btn-delete-workout').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const workout = workouts.find((entry) => entry.id === id);
      const sessionId = getWorkoutSessionId(workout || {});
      const session = workout ? getProgramById(workout.programId)?.sessions[sessionId] : null;
      const name = localizeText(session?.name || workout?.sessionName || sessionId || t('workouts'));
      window.showConfirm?.(t('deleteRecordedWorkout'), t('deleteRecordedWorkoutConfirm', { name, date: formattedDate }), () => {
        deleteWorkout(id);
        // Re-render the calendar to reflect the deletion
        renderCalendar(currentYear, currentMonth);
        // Refresh the detail panel for the same day
        showDayDetail(dateStr);
      });
    });
  });
}
