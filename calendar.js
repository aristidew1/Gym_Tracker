// calendar.js — Calendar view for the workout tracking app
// Renders a monthly calendar grid, highlights workout days, and shows day details.

import { getWorkoutsByMonth, getWorkoutsByDate, deleteWorkout, getStats } from './storage.js';
import { getWorkoutSessionId } from './models/workout-schema.js';
import { getActiveProgram, getProgramById } from './services/program-storage.js';
import { getExerciseDisplayName } from './data.js';
import { getLanguage, localizeText, t } from './i18n.js';
import { getSupplementStatus } from './supplements.js';

// ── Internal navigation state ───────────────────────────────────────────────
const now = new Date();
let currentYear  = now.getFullYear();
let currentMonth = now.getMonth(); // 0-indexed

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
      cell.classList.add(supplementStatus.complete ? 'supplements-complete' : 'supplements-incomplete');
      cell.setAttribute('aria-label', supplementStatus.complete ? t('supplementsTakenCalendar') : t('supplementsMissingCalendar'));
      const marker = document.createElement('span');
      marker.className = `calendar-supplement-marker ${supplementStatus.complete ? 'complete' : 'incomplete'}`;
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

function renderCalendarLegend() {
  const legend = document.getElementById('calendar-legend');
  const program = getActiveProgram();
  legend.replaceChildren();
  legend.setAttribute('aria-label', t('calendarLegend'));
  (program?.sessionOrder || []).forEach((sessionId) => {
    const session = program.sessions[sessionId];
    if (!session) return;
    const item = document.createElement('span');
    item.className = 'calendar-legend-item';
    const dot = document.createElement('span');
    dot.className = 'calendar-legend-dot';
    dot.style.setProperty('--legend-color-rgb', session.colorRgb || '77, 124, 255');
    const name = document.createElement('span');
    name.textContent = localizeText(session.name);
    item.append(dot, name);
    legend.appendChild(item);
  });
  if (getSupplementStatus()) {
    const complete = document.createElement('span');
    complete.className = 'calendar-legend-item supplement-legend-item';
    complete.innerHTML = `<span class="supplement-calendar-dot complete"></span><span>${t('supplementsTakenCalendar')}</span>`;
    const incomplete = document.createElement('span');
    incomplete.className = 'calendar-legend-item supplement-legend-item';
    incomplete.innerHTML = `<span class="supplement-calendar-dot incomplete"></span><span>${t('supplementsMissingCalendar')}</span>`;
    legend.append(complete, incomplete);
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

  // No tracked activity → hide the panel
  if ((!workouts || workouts.length === 0) && !supplementStatus) {
    panel.classList.remove('active');
    return;
  }

  // Format the date nicely in French (e.g. "5 Juillet 2026")
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const formattedDate = new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr)));

  // Build detail HTML for every workout on that day
  let html = supplementStatus ? `<div class="calendar-supplement-status ${supplementStatus.complete ? 'complete' : 'incomplete'}"><span aria-hidden="true">${supplementStatus.complete ? '✓' : '!'}</span><div><strong>${t('supplements')}</strong><small>${supplementStatus.complete ? t('supplementsTakenCalendar') : t('supplementsProgress', supplementStatus)}</small></div></div>` : '';

  workouts.forEach(workout => {
    const sessionId = getWorkoutSessionId(workout);
    const session = getProgramById(workout.programId)?.sessions[sessionId];
    const sessionName     = session?.name || workout.sessionName || sessionId;
    const sessionSubtitle = session?.subtitle || workout.sessionSubtitle || '';

    // ── Header ────────────────────────────────────────────────────────────
    html += `
      <div class="calendar-detail-header">
        <h3>${localizeText(sessionName)}${sessionSubtitle ? ' — ' + localizeText(sessionSubtitle) : ''}</h3>
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
        <span class="detail-ex-name">${getExerciseDisplayName(ex.exerciseId, ex.exerciseName)}</span>
        <span class="detail-ex-data">${setsStr}</span>
      </div>`;
      });
    }

    // ── Workout actions ───────────────────────────────────────────────────
    html += `
      <div class="calendar-workout-actions">
        <button class="btn-edit-recorded-workout" data-id="${workout.id}">✎ ${t('editRecordedWorkout')}</button>
        <button class="btn-delete-workout" data-id="${workout.id}">${t('deleteRecordedWorkout')}</button>
      </div>`;
  });

  panel.innerHTML = html;
  panel.classList.add('active');

  panel.querySelectorAll('.btn-edit-recorded-workout').forEach(btn => {
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('workout:edit-requested', { detail: { workoutId: btn.dataset.id } }));
    });
  });

  // ── Wire up delete buttons ──────────────────────────────────────────────
  panel.querySelectorAll('.btn-delete-workout').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (confirm(t('deleteRecordedWorkoutConfirm'))) {
        deleteWorkout(id);
        // Re-render the calendar to reflect the deletion
        renderCalendar(currentYear, currentMonth);
        // Refresh the detail panel for the same day
        showDayDetail(dateStr);
      }
    });
  });
}
