from pathlib import Path


def replace_once(path, old, new):
    text = Path(path).read_text()
    if old not in text:
        raise RuntimeError(f"Expected block not found in {path}: {old[:80]!r}")
    Path(path).write_text(text.replace(old, new, 1))


def replace_between(path, start_marker, end_marker, replacement):
    text = Path(path).read_text()
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    Path(path).write_text(text[:start] + replacement + text[end:])


# app.js — allow a live workout to continue while browsing the app.
replace_once(
    "app.js",
    """  initWorkoutControls();\n  initTimerControls();""",
    """  initWorkoutControls();\n  initActiveWorkoutBanner();\n  initTimerControls();""",
)

replace_once(
    "app.js",
    """function navigateTo(viewName) {\n  // Don't navigate away from workout without confirmation\n  if (state.currentView === 'workout' && viewName !== 'workout') {\n    confirmLeaveWorkout(() => {\n      cleanupWorkout();\n      doNavigate(viewName);\n    });\n    return;\n  }\n  doNavigate(viewName);\n}\n""",
    """function navigateTo(viewName) {\n  // A live workout stays in memory while the user browses the app. Editing a\n  // recorded workout remains destructive, so it still asks for confirmation.\n  if (state.currentView === 'workout' && viewName !== 'workout' && state.editingWorkout) {\n    confirmLeaveWorkout(() => {\n      cleanupWorkout();\n      doNavigate(viewName);\n    });\n    return;\n  }\n  doNavigate(viewName);\n}\n""",
)

replace_once(
    "app.js",
    """  // Update app padding\n  const app = document.getElementById('app');\n  app.style.paddingBottom = viewName === 'workout' ? '16px' : '';\n""",
    """  // Update app padding\n  const app = document.getElementById('app');\n  app.style.paddingBottom = viewName === 'workout' ? '16px' : '';\n  updateActiveWorkoutBanner();\n""",
)

replace_once(
    "app.js",
    """function initWorkoutControls() {\n  const exercisesContainer = document.getElementById('workout-exercises');\n\n  document.getElementById('btn-back').addEventListener('click', () => {\n    confirmLeaveWorkout(() => {\n      cleanupWorkout();\n      doNavigate('home');\n    });\n  });\n""",
    """function initWorkoutControls() {\n  const exercisesContainer = document.getElementById('workout-exercises');\n\n  document.getElementById('btn-back').addEventListener('click', () => {\n    if (state.editingWorkout) {\n      confirmLeaveWorkout(() => {\n        cleanupWorkout();\n        doNavigate('home');\n      });\n      return;\n    }\n    // Minimise the current workout instead of destroying it.\n    doNavigate('home');\n  });\n""",
)

insert_anchor = "// ============================================\n// WORKOUT SESSION\n// ============================================\n"
active_banner_code = """// ============================================\n// ACTIVE WORKOUT BANNER\n// ============================================\nfunction initActiveWorkoutBanner() {\n  document.getElementById('btn-resume-workout').addEventListener('click', () => {\n    if (!state.workoutSession) return;\n    doNavigate('workout');\n  });\n  updateActiveWorkoutBanner();\n}\n\nfunction updateActiveWorkoutBanner() {\n  const banner = document.getElementById('active-workout-banner');\n  if (!banner) return;\n  const hasLiveWorkout = Boolean(state.workoutSession && !state.editingWorkout);\n  const shouldShow = hasLiveWorkout && state.currentView !== 'workout';\n  banner.hidden = !shouldShow;\n  if (!hasLiveWorkout) return;\n\n  const title = document.getElementById('active-workout-name');\n  const duration = document.getElementById('active-workout-duration');\n  title.textContent = localizeText(state.workoutSession.name);\n  const elapsed = Math.max(0, Math.floor((Date.now() - state.workoutStartTime) / 1000));\n  const min = Math.floor(elapsed / 60).toString().padStart(2, '0');\n  const sec = (elapsed % 60).toString().padStart(2, '0');\n  duration.textContent = `${t('workoutInProgress')} · ${min}:${sec}`;\n  document.getElementById('btn-resume-workout').textContent = t('resumeWorkout');\n}\n\n"""
replace_once("app.js", insert_anchor, active_banner_code + insert_anchor)

replace_once(
    "app.js",
    """function startSession(sessionId) {\n  const program = getActiveProgram();""",
    """function startSession(sessionId) {\n  // Only one live workout can exist at a time. Tapping another session while\n  // one is active resumes the current workout instead of overwriting it.\n  if (state.workoutSession && !state.editingWorkout) {\n    doNavigate('workout');\n    return;\n  }\n  const program = getActiveProgram();""",
)

replace_once(
    "app.js",
    """  renderChoices();\n  renderExercises();\n}\n\nfunction buildRecordedWorkoutSession""",
    """  renderChoices();\n  renderExercises();\n  updateActiveWorkoutBanner();\n}\n\nfunction buildRecordedWorkoutSession""",
)

replace_once(
    "app.js",
    """function updateDuration() {\n  const elapsed = Math.floor((Date.now() - state.workoutStartTime) / 1000);\n  const min = Math.floor(elapsed / 60).toString().padStart(2, '0');\n  const sec = (elapsed % 60).toString().padStart(2, '0');\n  document.getElementById('workout-duration').textContent = `${min}:${sec}`;\n}\n""",
    """function updateDuration() {\n  const elapsed = Math.floor((Date.now() - state.workoutStartTime) / 1000);\n  const min = Math.floor(elapsed / 60).toString().padStart(2, '0');\n  const sec = (elapsed % 60).toString().padStart(2, '0');\n  document.getElementById('workout-duration').textContent = `${min}:${sec}`;\n  updateActiveWorkoutBanner();\n}\n""",
)

replace_once(
    "app.js",
    """  document.getElementById('btn-workout-edit').classList.remove('active');\n  document.getElementById('btn-finish').textContent = t('finish');\n}\n""",
    """  document.getElementById('btn-workout-edit').classList.remove('active');\n  document.getElementById('btn-finish').textContent = t('finish');\n  updateActiveWorkoutBanner();\n}\n""",
)

replace_once(
    "app.js",
    """    if (state.currentView === 'workout') { renderChoices(); renderExercises(); }\n    updateNotification();""",
    """    if (state.currentView === 'workout') { renderChoices(); renderExercises(); }\n    updateActiveWorkoutBanner();\n    updateNotification();""",
)

# index.html — put both live-workout and rest-timer cards at the top of normal flow.
html = Path("index.html").read_text()
old_top = """  <div id=\"app\">\n\n    <!-- ============ HOME VIEW ============ -->"""
new_top = """  <div id=\"app\">\n\n    <!-- ============ ACTIVE WORKOUT ============ -->\n    <div class=\"active-workout-banner\" id=\"active-workout-banner\" hidden>\n      <div class=\"active-workout-copy\">\n        <strong id=\"active-workout-name\">Séance</strong>\n        <span id=\"active-workout-duration\">Séance en cours · 00:00</span>\n      </div>\n      <button type=\"button\" class=\"btn-resume-workout\" id=\"btn-resume-workout\">Reprendre</button>\n    </div>\n\n    <!-- ============ REST TIMER ============ -->\n    <div class=\"rest-timer-overlay\" id=\"rest-timer-overlay\" aria-live=\"polite\">\n      <div class=\"timer-circle\" aria-hidden=\"true\">\n        <svg viewBox=\"0 0 220 220\">\n          <circle class=\"timer-bg\" cx=\"110\" cy=\"110\" r=\"100\" />\n          <circle class=\"timer-progress\" id=\"timer-progress\" cx=\"110\" cy=\"110\" r=\"100\" stroke-dasharray=\"628.32\" stroke-dashoffset=\"0\" />\n        </svg>\n      </div>\n      <div class=\"timer-display\">\n        <div class=\"timer-time\" id=\"timer-time\">2:30</div>\n        <div class=\"timer-label\" data-i18n=\"rest\">repos</div>\n      </div>\n      <div class=\"timer-controls\">\n        <button class=\"btn-timer secondary\" id=\"btn-timer-skip\" data-i18n=\"skip\">Passer</button>\n        <button class=\"btn-timer secondary\" id=\"btn-timer-add30\">+30s</button>\n      </div>\n    </div>\n\n    <!-- ============ HOME VIEW ============ -->"""
if old_top not in html:
    raise RuntimeError("index.html app top anchor not found")
html = html.replace(old_top, new_top, 1)
start = html.index("    <!-- ============ REST TIMER OVERLAY ============ -->")
end = html.index("    <!-- ============ WORKOUT SUMMARY OVERLAY ============ -->", start)
html = html[:start] + html[end:]
Path("index.html").write_text(html)

# index.css — compact cards in document flow, never covering workout controls/content.
replace_between(
    "index.css",
    "/* --- Rest Timer Overlay --- */",
    "/* Start rest timer button (inside exercise card) */",
    """/* --- Active workout / rest timer banners --- */\n.active-workout-banner {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin: 10px 16px 4px;\n  padding: 11px 12px;\n  border: 1px solid rgba(var(--session-color-rgb, 77, 124, 255), 0.28);\n  border-radius: var(--radius-md);\n  background: linear-gradient(145deg, rgba(var(--session-color-rgb, 77, 124, 255), 0.14), rgba(255,255,255,0.035));\n}\n.active-workout-banner[hidden] { display: none; }\n.active-workout-copy { display: grid; min-width: 0; }\n.active-workout-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .82rem; }\n.active-workout-copy span { margin-top: 2px; color: var(--text-secondary); font-size: .69rem; font-variant-numeric: tabular-nums; }\n.btn-resume-workout { flex: 0 0 auto; min-height: 36px; padding: 7px 11px; border: 0; border-radius: 9px; background: rgb(var(--session-color-rgb, 77, 124, 255)); color: white; font-size: .72rem; font-weight: 750; cursor: pointer; }\n\n.rest-timer-overlay {\n  display: none;\n  align-items: center;\n  gap: 10px;\n  margin: 10px 16px 8px;\n  padding: 9px 10px;\n  min-height: 64px;\n  border: 1px solid rgba(var(--session-color-rgb, 77, 124, 255), .3);\n  border-radius: var(--radius-md);\n  background: linear-gradient(145deg, rgba(var(--session-color-rgb, 77, 124, 255), .12), rgba(255,255,255,.035));\n  box-shadow: var(--shadow-sm);\n  animation: fadeIn .2s ease;\n}\n.rest-timer-overlay.active { display: flex; }\n.timer-circle { position: relative; flex: 0 0 44px; width: 44px; height: 44px; }\n.timer-circle svg { width: 100%; height: 100%; transform: rotate(-90deg); }\n.timer-circle .timer-bg { fill: none; stroke: rgba(255,255,255,.08); stroke-width: 15; }\n.timer-circle .timer-progress { fill: none; stroke-width: 15; stroke-linecap: round; transition: stroke-dashoffset .25s linear; }\n.timer-display { min-width: 62px; }\n.timer-display .timer-time { font-size: 1.18rem; line-height: 1.05; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }\n.timer-display .timer-label { margin-top: 2px; color: var(--text-secondary); font-size: .65rem; }\n.timer-controls { display: flex; gap: 6px; margin-left: auto; }\n.btn-timer { min-height: 36px; padding: 7px 10px; border-radius: 9px; font-size: .69rem; font-weight: 700; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }\n.btn-timer.primary { border: 0; background: var(--accent); color: white; }\n.btn-timer.secondary { background: rgba(255,255,255,.045); border: 1px solid var(--border-glass); color: var(--text-primary); }\n.btn-timer:active { transform: scale(.97); }\n\n@media (max-width: 360px) {\n  .rest-timer-overlay { gap: 7px; margin-left: 10px; margin-right: 10px; }\n  .timer-circle { flex-basis: 38px; width: 38px; height: 38px; }\n  .timer-display { min-width: 54px; }\n  .btn-timer { padding-left: 8px; padding-right: 8px; }\n}\n\n""",
)

# i18n labels.
replace_once(
    "i18n.js",
    """  finish: 'Terminer', back: 'Retour', previousMonth:""",
    """  finish: 'Terminer', back: 'Retour', workoutInProgress: 'Séance en cours', resumeWorkout: 'Reprendre', previousMonth:""",
)
replace_once(
    "i18n.js",
    """  finish: 'Finish', back: 'Back', previousMonth:""",
    """  finish: 'Finish', back: 'Back', workoutInProgress: 'Workout in progress', resumeWorkout: 'Resume', previousMonth:""",
)

print("Active workout + compact rest timer update applied.")
