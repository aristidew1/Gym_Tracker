import { EXERCISES, INTENSITY_TECHNIQUES, MUSCLE_CATEGORIES, createIntensityTechnique, getExerciseMuscleCategory, getExercisesByMuscleCategory, getIntensityTechnique, getLocalizedExerciseName, getMuscleCategoryDisplayName } from './data.js';
import { localizeText, t } from './i18n.js';
import {
  deleteProgram,
  duplicateProgram,
  getActiveProgramId,
  getPrograms,
  saveProgram,
  setActiveProgram,
} from './services/program-storage.js';

const SESSION_COLORS = ['#4d7cff', '#ff8a3d', '#ff4d6a', '#3ddc84', '#e7c65c', '#45c4d9'];
const PARAMETER_LABELS = {
  restBetweenExercisesSeconds: 'restBetweenExercises', drops: 'drops', loadReductionPercent: 'loadReduction', target: 'target', pauses: 'pauses', pauseSeconds: 'pauseDuration', activationReps: 'activationReps',
  miniSetReps: 'miniSetReps', restSeconds: 'techniqueRest', clusterSize: 'clusterReps', intraSetRestSeconds: 'intraSetRest', exercises: 'exerciseCount', durationMinutes: 'duration', tempo: 'tempo', partialReps: 'partialReps',
};
const ui = { screen: 'list', editing: null, editorSessionId: null, editorQuery: '', editorCategory: 'back', history: [], future: [] };

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function makeId(prefix) { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function byId(items, id) { return items.find((item) => item.id === id); }
function hexToRgb(hex) { const value = hex.replace('#', ''); return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`; }

function defaultPrescription() {
  return { setCount: 3, repetitionRange: { min: 8, max: 12 }, segments: [{ type: 'working', setCount: 3 }], restSeconds: 90, targetRir: 2, targetRpe: null, tempo: null, progressionRuleId: 'double_progression' };
}

function presentationForMode(mode) {
  if (mode === 'superset') return { label: 'Superset', badgeClass: 'superset' };
  if (mode === 'circuit') return { label: 'Circuit', badgeClass: 'traction' };
  return { label: t('block'), badgeClass: 'force' };
}

function createItem(exerciseId = EXERCISES[0].id) {
  return { id: makeId('exercise'), exerciseId, prescription: defaultPrescription(), intensityTechnique: createIntensityTechnique('straight_sets'), note: null };
}

function createBlock(index = 0) {
  return { id: makeId('block'), name: `${t('block')} ${index + 1}`, presentation: presentationForMode('sequential'), executionMode: 'sequential', rounds: 1, restBetweenExercisesSeconds: 0, restBetweenRoundsSeconds: 90, items: [createItem()] };
}

function createSession(index = 0) {
  const color = SESSION_COLORS[index % SESSION_COLORS.length];
  const id = makeId('session');
  return { id, name: `${t('workouts').replace(/s$/, '')} ${index + 1}`, subtitle: '', icon: '🏋️', color, colorRgb: hexToRgb(color), blocks: [createBlock()] };
}

export function createBlankProgram() {
  const session = createSession(0);
  return { id: '', schemaVersion: 2, name: t('newProgram'), description: '', goal: 'custom', experienceLevel: 'intermediate', sessionDurationMinutes: null, sessionOrder: [session.id], sessions: { [session.id]: session } };
}

function getContainer() { return document.getElementById('programs-content'); }
function resetDocumentScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function localizeBuiltInDraft(program) {
  program.name = localizeText(program.name);
  program.description = localizeText(program.description);
  Object.values(program.sessions).forEach((session) => {
    session.name = localizeText(session.name);
    session.subtitle = localizeText(session.subtitle);
    session.blocks.forEach((block) => {
      block.name = localizeText(block.name);
      block.presentation.label = localizeText(block.presentation.label);
      block.items.forEach((item) => {
        item.name = localizeText(item.name);
        item.note = localizeText(item.note);
        item.selection?.options?.forEach((option) => {
          option.name = localizeText(option.name);
          option.description = localizeText(option.description);
        });
      });
    });
  });
}

export function initPrograms() {
  const container = getContainer();
  container.addEventListener('click', handleClick);
  container.addEventListener('change', handleChange);
  container.addEventListener('input', handleInput);
  document.addEventListener('click', (event) => {
    // A contextual menu should behave like a popover: a tap outside of its
    // actions dismisses it, without requiring the user to reopen the card.
    if (event.target.closest('.program-card-actions')) return;
    container.querySelectorAll('.program-card.actions-open').forEach((card) => card.classList.remove('actions-open'));
  });
  window.addEventListener('program:changed', () => { if (ui.screen === 'list') renderPrograms(); });
  renderPrograms();
}

export function renderPrograms() {
  if (ui.screen === 'editor') return renderEditor();
  document.body.classList.remove('program-editor-active');
  const activeId = getActiveProgramId();
  const programs = getPrograms();
  getContainer().innerHTML = `
    <div class="programs-heading"><div><h1>${t('programsHeading')}</h1><p>${t('programsSubtitle')}</p></div><button class="icon-button primary-icon" data-action="new-program" title="${t('create')}" aria-label="${t('create')}">＋</button></div>
    <div class="program-list">${programs.map((program) => renderProgramCard(program, activeId)).join('')}</div>
    <button class="program-create-button" data-action="new-program">${t('customProgram')}</button>`;
}

function renderProgramCard(program, activeId) {
  const active = program.id === activeId;
  const sessionCount = program.sessionOrder.length;
  const actions = `${active ? '' : `<button data-action="activate" data-program-id="${escapeHtml(program.id)}">▶ ${t('activate')}</button>`}<button data-action="duplicate" data-program-id="${escapeHtml(program.id)}">⧉ ${t('duplicate')}</button><button data-action="edit" data-program-id="${escapeHtml(program.id)}">✎ ${t('edit')}</button>${program.builtIn ? '' : `<button class="danger" data-action="delete" data-program-id="${escapeHtml(program.id)}">⌫ ${t('delete')}</button>`}`;
  return `<article class="program-card ${active ? 'active-program' : ''}">
    <div class="program-card-accent" style="background:${escapeHtml(program.sessions[program.sessionOrder[0]]?.color || '#4d7cff')}"></div>
    <div class="program-card-main"><div class="program-card-title-row"><h2>${escapeHtml(localizeText(program.name))}</h2>${active ? `<span class="active-pill">${t('active')}</span>` : ''}</div><p>${escapeHtml(localizeText(program.description) || `${sessionCount} ${t('workouts').toLowerCase()}`)}</p><span class="program-meta">${sessionCount} ${t('workouts').toLowerCase()} · ${escapeHtml(program.goal === 'custom' ? t('custom') : t(program.goal || 'custom'))}</span></div>
    <div class="program-card-actions">${active ? '<span class="program-active-check">✓</span>' : ''}<button class="icon-button" data-action="program-actions" title="${t('moreActions')}" aria-label="${t('moreActions')}">⋯</button><div class="program-action-menu">${actions}</div></div>
  </article>`;
}

function openEditor(program) {
  const draft = clone(program);
  if (draft.builtIn) localizeBuiltInDraft(draft);
  delete draft.builtIn;
  ui.editing = draft;
  ui.editorSessionId = draft.sessionOrder[0];
  ui.editorQuery = '';
  ui.editorCategory = 'back';
  ui.history = [];
  ui.future = [];
  ui.screen = 'editor';
  renderEditor();
  resetDocumentScroll();
}

function renderEditor() {
  const program = ui.editing;
  if (!program) { ui.screen = 'list'; return renderPrograms(); }
  document.body.classList.add('program-editor-active');
  const session = program.sessions[ui.editorSessionId] || program.sessions[program.sessionOrder[0]] || null;
  if (session && session.id !== ui.editorSessionId) ui.editorSessionId = session.id;
  getContainer().innerHTML = `<div class="program-workspace editor-workspace">
    <div class="workspace-header"><button class="icon-button" data-action="programs-back" title="${t('back')}">←</button><div><h1>${t('builder')}</h1><p>${t('everythingEditable')}</p></div><div class="editor-history-actions"><button class="secondary-command compact" data-action="editor-undo" ${ui.history.length ? '' : 'disabled'} title="${t('undo')}">↶ ${t('undo')}</button><button class="secondary-command compact" data-action="editor-redo" ${ui.future.length ? '' : 'disabled'} title="${t('redo')}">↷ ${t('redo')}</button></div><button class="primary-command compact" data-action="editor-save">${t('save')}</button></div>
    <div class="editor-meta editor-program-meta">
      <label>${t('name')}<input id="editor-program-name" value="${escapeHtml(program.name)}" /></label>
      <label>${t('programDescription')}<input id="editor-program-description" value="${escapeHtml(program.description || '')}" /></label>
      <label>${t('goal')}<select id="editor-program-goal">${['custom','strength','hypertrophy','endurance','mixed'].map((goal) => `<option value="${goal}" ${program.goal === goal ? 'selected' : ''}>${t(goal)}</option>`).join('')}</select></label>
      <label>${t('level')}<select id="editor-program-level">${['beginner','intermediate','advanced'].map((level) => `<option value="${level}" ${program.experienceLevel === level ? 'selected' : ''}>${t(level)}</option>`).join('')}</select></label>
      <label>${t('duration')}<input id="editor-program-duration" type="number" min="0" step="5" value="${program.sessionDurationMinutes ?? ''}" placeholder="${t('minutes')}" /></label>
    </div>
    <div class="session-tabs">${program.sessionOrder.map((sessionId) => `<button class="session-tab ${session && sessionId === session.id ? 'active' : ''}" data-action="editor-session" data-session-id="${escapeHtml(sessionId)}">${escapeHtml(localizeText(program.sessions[sessionId].name))}</button>`).join('')}<button class="icon-button" data-action="editor-add-session" title="${t('addWorkout')}">＋</button></div>
    ${session ? renderSessionEditor(session) : `<div class="editor-empty"><strong>${t('noWorkout')}</strong><p>${t('addWorkoutHelp')}</p><button class="add-row-button" data-action="editor-add-session">＋ ${t('addWorkout')}</button></div>`}
    <div class="workspace-footer"><button class="secondary-command" data-action="programs-back">${t('cancel')}</button><button class="primary-command" data-action="editor-save">${t('saveActivate')}</button></div>
  </div>`;
}

function renderSessionEditor(session) {
  return `<section class="editor-session" data-session-id="${escapeHtml(session.id)}">
    <div class="editor-session-header advanced-session-header"><input class="editor-title-input" data-session-field="name" value="${escapeHtml(session.name)}" /><input class="editor-subtitle-input" data-session-field="subtitle" value="${escapeHtml(session.subtitle || '')}" placeholder="${t('workoutGoal')}" /><label class="icon-field">${t('icon')}<input data-session-field="icon" value="${escapeHtml(session.icon || '🏋️')}" /></label><label class="color-field">${t('color')}<input type="color" data-session-field="color" value="${escapeHtml(session.color || '#4d7cff')}" /></label><div class="mini-actions"><button class="icon-button" data-action="editor-session-left" title="${t('moveLeft')}">←</button><button class="icon-button" data-action="editor-session-right" title="${t('moveRight')}">→</button><button class="danger-command" data-action="editor-delete-session">${t('deleteWorkout')}</button></div></div>
    <div class="editor-blocks">${session.blocks.length ? session.blocks.map(renderEditorBlock).join('') : `<div class="editor-empty compact-empty"><strong>${t('noBlock')}</strong><p>${t('addFirstBlock')}</p></div>`}</div><button class="add-row-button" data-action="editor-add-block">＋ ${t('addBlock')}</button>
  </section>`;
}

function renderEditorBlock(block) {
  return `<section class="editor-block" data-block-id="${escapeHtml(block.id)}">
    <div class="editor-block-head advanced-block-head"><input data-block-field="name" value="${escapeHtml(block.name)}" /><select data-block-field="executionMode"><option value="sequential" ${block.executionMode === 'sequential' ? 'selected' : ''}>${t('sequential')}</option><option value="superset" ${block.executionMode === 'superset' ? 'selected' : ''}>Superset</option><option value="circuit" ${block.executionMode === 'circuit' ? 'selected' : ''}>${t('circuit')}</option></select><label>${t('rounds')}<input type="number" min="1" max="20" data-block-field="rounds" value="${block.rounds || 1}" /></label><label>${t('exerciseRest')}<input type="number" min="0" step="5" data-block-field="exerciseRest" value="${block.restBetweenExercisesSeconds || 0}" /></label><label>${t('roundRest')}<input type="number" min="0" step="5" data-block-field="roundRest" value="${block.restBetweenRoundsSeconds || 0}" /></label><div class="mini-actions"><button class="icon-button" data-action="editor-block-up" title="${t('moveUp')}">↑</button><button class="icon-button" data-action="editor-block-down" title="${t('moveDown')}">↓</button><button class="danger-command" data-action="editor-delete-block">${t('deleteBlock')}</button></div></div>
    <div class="editor-items">${block.items.length ? block.items.map(renderEditorItem).join('') : `<div class="editor-empty compact-empty"><strong>${t('noExercise')}</strong><p>${t('searchAddExercise')}</p></div>`}</div>
    <div class="editor-add-exercise"><select data-editor-category aria-label="${t('muscleCategory')}">${renderCategoryOptions(ui.editorCategory)}</select><input data-editor-query value="${escapeHtml(ui.editorQuery)}" placeholder="${escapeHtml(t('filterIn', { category: categoryName(ui.editorCategory) }))}" /><select data-editor-add-exercise aria-label="${t('exercise')}">${filteredExercises().map((exercise) => `<option value="${exercise.id}">${escapeHtml(getLocalizedExerciseName(exercise))}</option>`).join('')}</select><button class="secondary-command" data-action="editor-add-item">${t('add')}</button></div>
  </section>`;
}

function renderEditorItem(item) {
  const p = item.prescription || defaultPrescription();
  const technique = item.intensityTechnique || createIntensityTechnique('straight_sets');
  const selectedExerciseId = item.exerciseId || item.selection?.options?.[0]?.id || EXERCISES[0].id;
  const muscleCategory = getExerciseMuscleCategory(selectedExerciseId);
  const categoryExercises = getExercisesByMuscleCategory(muscleCategory);
  return `<div class="editor-item advanced-editor-item" data-item-id="${escapeHtml(item.id)}">
    <div class="exercise-selector-pair"><label>${t('muscleCategory')}<select data-item-field="muscleCategory">${renderCategoryOptions(muscleCategory)}</select></label><label>${t('exercise')}<select data-item-field="exerciseId">${categoryExercises.map((exercise) => `<option value="${exercise.id}" ${exercise.id === selectedExerciseId ? 'selected' : ''}>${escapeHtml(getLocalizedExerciseName(exercise))}</option>`).join('')}</select></label></div>
    <div class="editor-item-settings prescription-grid"><label>${t('sets')}<input type="number" min="1" max="30" data-item-field="sets" value="${p.setCount}" /></label><label>${t('minReps')}<input type="number" min="0" data-item-field="min" value="${p.repetitionRange.min}" /></label><label>${t('maxReps')}<input type="number" min="0" data-item-field="max" value="${p.repetitionRange.max}" /></label><label>${t('rest')} (s)<input type="number" min="0" step="5" data-item-field="rest" value="${p.restSeconds || 0}" /></label><label>${t('rir')}<input type="number" min="0" max="10" data-item-field="rir" value="${p.targetRir ?? ''}" /></label><label>${t('rpe')}<input type="number" min="1" max="10" step="0.5" data-item-field="rpe" value="${p.targetRpe ?? ''}" /></label><label>${t('tempo')}<input data-item-field="tempo" value="${escapeHtml(p.tempo || '')}" placeholder="3-1-1-0" /></label><label>${t('progression')}<select data-item-field="progression"><option value="" ${!p.progressionRuleId ? 'selected' : ''}>${t('none')}</option><option value="double_progression" ${p.progressionRuleId === 'double_progression' ? 'selected' : ''}>${t('doubleProgression')}</option></select></label><label class="wide-field">${t('note')}<input data-item-field="note" value="${escapeHtml(item.note || '')}" placeholder="${t('personalInstructions')}" /></label></div>
    <div class="technique-editor"><label>${t('technique')}<select data-item-field="technique">${INTENSITY_TECHNIQUES.map((entry) => `<option value="${entry.id}" ${entry.id === technique.type ? 'selected' : ''}>${escapeHtml(getIntensityTechnique(entry.id).name)}</option>`).join('')}</select></label><div class="technique-parameters">${renderTechniqueParameters(technique)}</div></div>
    <div class="mini-actions"><button class="icon-button" data-action="editor-item-up" title="${t('moveUp')}">↑</button><button class="icon-button" data-action="editor-item-down" title="${t('moveDown')}">↓</button><button class="danger-command" data-action="editor-delete-item">${t('removeExercise')}</button></div>
  </div>`;
}

function renderTechniqueParameters(technique) {
  const definition = getIntensityTechnique(technique.type);
  return Object.entries(definition?.parameters || {}).map(([key, type]) => `<label>${escapeHtml(t(PARAMETER_LABELS[key] || key))}<input data-tech-param="${escapeHtml(key)}" type="${type === 'number' ? 'number' : 'text'}" value="${escapeHtml(technique[key] ?? definition.defaults[key] ?? '')}" /></label>`).join('');
}

function renderCategoryOptions(selectedId) {
  return MUSCLE_CATEGORIES.map((category) => `<option value="${category.id}" ${category.id === selectedId ? 'selected' : ''}>${escapeHtml(getMuscleCategoryDisplayName(category))}</option>`).join('');
}

function categoryName(categoryId) {
  return getMuscleCategoryDisplayName(categoryId);
}

function filteredExercises(categoryId = ui.editorCategory, queryValue = ui.editorQuery) {
  const query = queryValue.trim().toLowerCase();
  return getExercisesByMuscleCategory(categoryId).filter((exercise) => !query || getLocalizedExerciseName(exercise).toLowerCase().includes(query) || exercise.name.toLowerCase().includes(query) || exercise.movementPattern.includes(query) || exercise.primaryMuscles.some((muscle) => muscle.includes(query)));
}

function syncEditor() {
  const program = ui.editing;
  if (!program) return;
  program.name = document.getElementById('editor-program-name')?.value.trim() || program.name;
  program.description = document.getElementById('editor-program-description')?.value.trim() || '';
  program.goal = document.getElementById('editor-program-goal')?.value || 'custom';
  program.experienceLevel = document.getElementById('editor-program-level')?.value || 'intermediate';
  const duration = document.getElementById('editor-program-duration')?.value;
  program.sessionDurationMinutes = duration ? Number(duration) : null;
  const session = program.sessions[ui.editorSessionId];
  if (!session) return;
  session.name = document.querySelector('[data-session-field="name"]')?.value.trim() || session.name;
  session.subtitle = document.querySelector('[data-session-field="subtitle"]')?.value.trim() || '';
  session.icon = document.querySelector('[data-session-field="icon"]')?.value.trim() || '🏋️';
  session.color = document.querySelector('[data-session-field="color"]')?.value || session.color;
  session.colorRgb = hexToRgb(session.color);
  document.querySelectorAll('.editor-block').forEach((element) => syncBlock(session, element));
}

function syncBlock(session, element) {
  const block = byId(session.blocks, element.dataset.blockId);
  if (!block) return;
  const value = (field) => element.querySelector(`[data-block-field="${field}"]`)?.value;
  block.name = value('name')?.trim() || block.name;
  block.executionMode = value('executionMode') || block.executionMode;
  block.presentation = presentationForMode(block.executionMode);
  block.rounds = Math.max(1, Number(value('rounds')) || 1);
  block.restBetweenExercisesSeconds = Math.max(0, Number(value('exerciseRest')) || 0);
  block.restBetweenRoundsSeconds = Math.max(0, Number(value('roundRest')) || 0);
  element.querySelectorAll('.editor-item').forEach((itemElement) => syncItem(block, itemElement));
}

function syncItem(block, element) {
  const item = byId(block.items, element.dataset.itemId);
  if (!item) return;
  const value = (field) => element.querySelector(`[data-item-field="${field}"]`)?.value;
  item.exerciseId = value('exerciseId') || item.exerciseId;
  delete item.selection;
  item.prescription ||= defaultPrescription();
  item.prescription.setCount = Math.max(1, Number(value('sets')) || 1);
  item.prescription.repetitionRange = { min: Math.max(0, Number(value('min')) || 0), max: Math.max(0, Number(value('max')) || 0) };
  item.prescription.repetitionRange.max = Math.max(item.prescription.repetitionRange.min, item.prescription.repetitionRange.max);
  item.prescription.restSeconds = Math.max(0, Number(value('rest')) || 0);
  item.prescription.targetRir = value('rir') === '' ? null : Number(value('rir'));
  item.prescription.targetRpe = value('rpe') === '' ? null : Number(value('rpe'));
  item.prescription.tempo = value('tempo') || null;
  item.prescription.progressionRuleId = value('progression') || null;
  item.prescription.segments = [{ type: 'working', setCount: item.prescription.setCount }];
  item.note = value('note')?.trim() || null;
  const type = value('technique') || 'straight_sets';
  const config = {};
  const definition = getIntensityTechnique(type);
  element.querySelectorAll('[data-tech-param]').forEach((input) => {
    if (definition?.parameters[input.dataset.techParam]) config[input.dataset.techParam] = input.type === 'number' ? Number(input.value) : input.value;
  });
  item.intensityTechnique = createIntensityTechnique(type, config);
}

function move(items, id, direction) {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index >= 0 && target >= 0 && target < items.length) [items[index], items[target]] = [items[target], items[index]];
}

function snapshot() {
  return { editing: clone(ui.editing), editorSessionId: ui.editorSessionId };
}

function pushHistory() {
  ui.history.push(snapshot());
  if (ui.history.length > 50) ui.history.shift();
  ui.future = [];
}

function restoreSnapshot(value) {
  ui.editing = clone(value.editing);
  ui.editorSessionId = value.editorSessionId;
  renderEditor();
}

function undoEditor() {
  if (!ui.history.length) return;
  syncEditor();
  ui.future.push(snapshot());
  restoreSnapshot(ui.history.pop());
}

function redoEditor() {
  if (!ui.future.length) return;
  syncEditor();
  ui.history.push(snapshot());
  restoreSnapshot(ui.future.pop());
}

function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'new-program') openEditor(createBlankProgram());
    if (action === 'program-actions') {
      const card = button.closest('.program-card');
      const willOpen = !card?.classList.contains('actions-open');
      getContainer().querySelectorAll('.program-card.actions-open').forEach((entry) => entry.classList.remove('actions-open'));
      if (willOpen) card?.classList.add('actions-open');
      return;
    }
    if (action === 'programs-back') { ui.screen = 'list'; ui.editing = null; renderPrograms(); resetDocumentScroll(); }
    if (action === 'activate') setActiveProgram(button.dataset.programId);
    if (action === 'duplicate') openEditor(duplicateProgram(button.dataset.programId));
    if (action === 'edit') { const program = getPrograms().find((entry) => entry.id === button.dataset.programId); if (program) openEditor(program); }
    if (action === 'delete' && window.confirm(t('programDeleteConfirm'))) deleteProgram(button.dataset.programId);
    if (action === 'editor-save') { syncEditor(); const saved = saveProgram(ui.editing); setActiveProgram(saved.id); ui.screen = 'list'; renderPrograms(); resetDocumentScroll(); }
    if (action === 'editor-undo') undoEditor();
    if (action === 'editor-redo') redoEditor();
    if (action === 'editor-session') { syncEditor(); ui.editorSessionId = button.dataset.sessionId; renderEditor(); }
    if (action === 'editor-add-session') addSession();
    if (action === 'editor-delete-session') deleteSession();
    if (action === 'editor-session-left') moveSession(-1);
    if (action === 'editor-session-right') moveSession(1);
    if (['editor-add-block', 'editor-delete-block', 'editor-block-up', 'editor-block-down', 'editor-add-item', 'editor-delete-item', 'editor-item-up', 'editor-item-down'].includes(action)) handleStructureAction(action, button);
  } catch (error) { window.showToast?.(error.message || t('errorOccurred'), 'error'); }
}

function addSession() { syncEditor(); pushHistory(); const session = createSession(ui.editing.sessionOrder.length); ui.editing.sessions[session.id] = session; ui.editing.sessionOrder.push(session.id); ui.editorSessionId = session.id; renderEditor(); }
function deleteSession() { syncEditor(); pushHistory(); delete ui.editing.sessions[ui.editorSessionId]; ui.editing.sessionOrder = ui.editing.sessionOrder.filter((id) => id !== ui.editorSessionId); ui.editorSessionId = ui.editing.sessionOrder[0] || null; renderEditor(); }
function moveSession(direction) { syncEditor(); const index = ui.editing.sessionOrder.indexOf(ui.editorSessionId); const target = index + direction; if (target >= 0 && target < ui.editing.sessionOrder.length) { pushHistory(); [ui.editing.sessionOrder[index], ui.editing.sessionOrder[target]] = [ui.editing.sessionOrder[target], ui.editing.sessionOrder[index]]; } renderEditor(); }

function handleStructureAction(action, button) {
  syncEditor();
  const session = ui.editing.sessions[ui.editorSessionId];
  const blockElement = button.closest('.editor-block');
  const itemElement = button.closest('.editor-item');
  const block = blockElement ? byId(session.blocks, blockElement.dataset.blockId) : null;
  if (action === 'editor-add-block') { pushHistory(); session.blocks.push(createBlock(session.blocks.length)); }
  if (action === 'editor-delete-block' && block) { pushHistory(); session.blocks = session.blocks.filter((entry) => entry.id !== block.id); }
  if (action === 'editor-block-up' && block) { pushHistory(); move(session.blocks, block.id, -1); }
  if (action === 'editor-block-down' && block) { pushHistory(); move(session.blocks, block.id, 1); }
  if (action === 'editor-add-item' && block) { const exerciseId = blockElement.querySelector('[data-editor-add-exercise]')?.value; if (!exerciseId) throw new Error(t('noSearchExercise')); pushHistory(); block.items.push(createItem(exerciseId)); }
  if (itemElement && block) {
    const item = byId(block.items, itemElement.dataset.itemId);
    if (action === 'editor-delete-item') { pushHistory(); block.items = block.items.filter((entry) => entry.id !== item.id); }
    if (action === 'editor-item-up') { pushHistory(); move(block.items, item.id, -1); }
    if (action === 'editor-item-down') { pushHistory(); move(block.items, item.id, 1); }
  }
  renderEditor();
}

function handleChange(event) {
  if (event.target.dataset.editorCategory !== undefined) updateAddExerciseOptions(event.target, '');
  if (event.target.dataset.itemField === 'muscleCategory') { changeItemMuscleCategory(event.target); }
  if (event.target.dataset.editorQuery !== undefined) updateAddExerciseOptions(event.target.closest('.editor-block')?.querySelector('[data-editor-category]'), event.target.value);
  if (event.target.dataset.itemField === 'technique') { pushHistory(); syncEditor(); renderEditor(); }
}

function updateAddExerciseOptions(categorySelect, query) {
  if (!categorySelect) return;
  const blockElement = categorySelect.closest('.editor-block');
  const exerciseSelect = blockElement?.querySelector('[data-editor-add-exercise]');
  const queryInput = blockElement?.querySelector('[data-editor-query]');
  ui.editorCategory = categorySelect.value;
  ui.editorQuery = query;
  if (queryInput) {
    queryInput.value = query;
    queryInput.placeholder = t('filterIn', { category: categoryName(categorySelect.value) });
  }
  if (!exerciseSelect) return;
  exerciseSelect.innerHTML = '';
  filteredExercises(categorySelect.value, query).forEach((exercise) => {
    const option = document.createElement('option');
    option.value = exercise.id;
    option.textContent = getLocalizedExerciseName(exercise);
    exerciseSelect.appendChild(option);
  });
}

function changeItemMuscleCategory(select) {
  syncEditor();
  const itemElement = select.closest('.editor-item');
  const blockElement = select.closest('.editor-block');
  const session = ui.editing.sessions[ui.editorSessionId];
  const block = byId(session.blocks, blockElement?.dataset.blockId);
  const item = byId(block?.items || [], itemElement?.dataset.itemId);
  const firstExercise = getExercisesByMuscleCategory(select.value)[0];
  if (!item || !firstExercise) return;
  pushHistory();
  item.exerciseId = firstExercise.id;
  renderEditor();
}

function handleInput(event) {
  if (event.target.dataset.editorQuery !== undefined) {
    updateAddExerciseOptions(event.target.closest('.editor-block')?.querySelector('[data-editor-category]'), event.target.value);
  }
}
