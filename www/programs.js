import { EXERCISES, INTENSITY_TECHNIQUES, MUSCLE_CATEGORIES, createIntensityTechnique, getExerciseMuscleCategory, getExercisesByMuscleCategory, getIntensityTechnique, getLocalizedExerciseName, getMuscleCategoryDisplayName } from './data.js';
import { getLanguage, localizeText, t } from './i18n.js';
import { showTip } from './coachmark.js';
import {
  deleteProgram,
  duplicateProgram,
  getActiveProgramId,
  getPrograms,
  saveProgram,
  setActiveProgram,
} from './services/program-storage.js';
import {
  createCustomExercise,
  deleteCustomExercise,
  getCustomExercises,
  updateCustomExercise,
} from './services/custom-exercises.js';
import {
  createBuilderDisclosureState,
  formatBlockSummary,
  formatPrescriptionSummary,
  toggleDisclosure,
} from './services/program-builder-view.js';
import { escapeHtml } from './services/html.js';
import { exportProgramData } from './storage.js';
import { formatLocalDate } from './services/date-utils.js';
import { buildAiProgramPrompt } from './services/ai-program-template.js';
import { copyText } from './services/clipboard.js';

const SESSION_COLORS = ['#4d7cff', '#ff8a3d', '#ff4d6a', '#3ddc84', '#e7c65c', '#45c4d9'];
const PARAMETER_LABELS = {
  restBetweenExercisesSeconds: 'restBetweenExercises', drops: 'drops', loadReductionPercent: 'loadReduction', target: 'target', pauses: 'pauses', pauseSeconds: 'pauseDuration', activationReps: 'activationReps',
  miniSetReps: 'miniSetReps', restSeconds: 'techniqueRest', clusterSize: 'clusterReps', intraSetRestSeconds: 'intraSetRest', exercises: 'exerciseCount', durationMinutes: 'duration', tempo: 'tempo', partialReps: 'partialReps',
};
const ui = {
  screen: 'list', editing: null, editorSessionId: null, editorQuery: '', editorCategory: 'back',
  history: [], future: [], disclosure: null, exerciseDraft: null, libraryEditingId: null,
  aiCardOpen: false,
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function makeId(prefix) { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }
function byId(items, id) { return items.find((item) => item.id === id); }
function hexToRgb(hex) { const value = hex.replace('#', ''); return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`; }
function formatFrequency(frequency) {
  if (frequency?.mode === 'weekly') {
    return frequency.sessionsPerWeek === 1
      ? t('oncePerWeek')
      : t('timesPerWeek', { count: frequency.sessionsPerWeek });
  }
  const days = frequency?.intervalDays || 2;
  return days === 1 ? t('everyDay') : t('everyDays', { count: days });
}

export function getProgramMenuPlacement({ menuHeight, spaceAbove, spaceBelow }) {
  return menuHeight > spaceBelow && spaceAbove > spaceBelow ? 'up' : 'down';
}

function positionProgramActionMenu(card) {
  const menu = card?.querySelector('.program-action-menu');
  if (!menu) return;
  card.classList.remove('actions-open-up');
  const cardRect = card.getBoundingClientRect();
  const menuHeight = menu.getBoundingClientRect().height;
  const placement = getProgramMenuPlacement({
    menuHeight,
    spaceAbove: cardRect.top - 12,
    spaceBelow: window.innerHeight - cardRect.bottom - 12,
  });
  card.classList.toggle('actions-open-up', placement === 'up');
}

function makeProgramFileName(program) {
  const slug = String(program.name || 'programme')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'programme';
  return `muscu_tracker_${slug}_${formatLocalDate()}.json`;
}

async function shareProgram(programId) {
  const program = getPrograms().find((entry) => entry.id === programId);
  const data = exportProgramData(programId);
  if (!program || !data) throw new Error(t('programNotFound'));
  const fileName = makeProgramFileName(program);

  if (window.Capacitor?.isNativePlatform()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    const Share = window.Capacitor.Plugins.Share;
    const result = await Filesystem.writeFile({ path: fileName, data, directory: 'CACHE', encoding: 'utf8' });
    await Share.share({
      title: localizeText(program.name),
      text: t('shareProgram'),
      url: result.uri,
      dialogTitle: t('shareProgram'),
    });
    return;
  }

  const file = new File([data], fileName, { type: 'application/json' });
  if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
    throw new Error(t('shareUnavailable'));
  }
  await navigator.share({ title: localizeText(program.name), files: [file] });
}

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
  return { id: '', schemaVersion: 4, name: t('newProgram'), description: '', goal: 'custom', experienceLevel: 'intermediate', sessionDurationMinutes: null, trainingFrequency: { mode: 'interval', intervalDays: 2 }, sessionOrder: [session.id], sessions: { [session.id]: session } };
}

export function openNewProgramEditor() {
  openEditor(createBlankProgram(), { isNew: true });
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

function renderProgramsTabs(active) {
  return `<div class="programs-tabs" role="tablist">
    <button type="button" class="programs-tab ${active === 'list' ? 'active' : ''}" data-action="programs-tab-list" role="tab" aria-selected="${active === 'list'}">${t('programsTabPrograms')}</button>
    <button type="button" class="programs-tab ${active === 'exercises' ? 'active' : ''}" data-action="programs-tab-exercises" role="tab" aria-selected="${active === 'exercises'}">${t('programsTabExercises')}</button>
  </div>`;
}

function renderAiProgramCard() {
  const open = ui.aiCardOpen;
  return `<div class="ai-program-card ${open ? 'open' : ''}">
    <button type="button" class="ai-program-card-head" data-action="toggle-ai-card" aria-expanded="${open}">
      <span class="ai-program-card-icon" aria-hidden="true"><svg class="icon-glyph icon-glyph--sm" viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/><path d="M19 3v4"/><path d="M17 5h4"/></svg></span>
      <div class="ai-program-card-head-copy">
        <h2>${t('programsAiCardTitle')}</h2>
        ${open ? `<p>${t('programsAiCardDesc')}</p>` : ''}
      </div>
      <span class="ai-program-card-chevron" aria-hidden="true">⌄</span>
    </button>
    ${open ? `
    <ol class="ai-program-card-steps">
      <li>${t('programsAiCardStep1')}</li>
      <li>${t('programsAiCardStep2')}</li>
      <li>${t('programsAiCardStep3')}</li>
    </ol>
    <button class="ai-program-card-button" data-action="copy-ai-template"><span aria-hidden="true">⧉</span>${t('copyTemplate')}</button>` : ''}
  </div>`;
}

export function renderPrograms() {
  if (ui.screen === 'editor') return renderEditor();
  if (ui.screen === 'exercises') return renderExerciseLibrary();
  document.body.classList.remove('program-editor-active');
  const activeId = getActiveProgramId();
  const programs = getPrograms();
  getContainer().innerHTML = `
    ${renderProgramsTabs('list')}
    <div class="programs-heading"><div><h1>${t('programsHeading')}</h1><p>${t('programsSubtitle')}</p></div><div class="programs-heading-actions"><button class="icon-button primary-icon" data-action="new-program" title="${t('create')}" aria-label="${t('create')}">＋</button></div></div>
    ${renderAiProgramCard()}
    <div class="program-list">${programs.map((program) => renderProgramCard(program, activeId)).join('')}</div>
    <div class="program-actions-row">
      <button class="program-create-button" data-action="new-program">${t('customProgram')}</button>
      <button class="program-import-button" data-action="import-programs-from-list">${t('importPrograms')}</button>
    </div>`;
}

function renderExerciseLibrary() {
  document.body.classList.remove('program-editor-active');
  const exercises = getCustomExercises().sort((a, b) => a.name.localeCompare(b.name, getLanguage()));
  const editingId = ui.libraryEditingId;
  getContainer().innerHTML = `<div class="program-workspace">
    ${renderProgramsTabs('exercises')}
    <div class="programs-heading"><div><h1>${t('exerciseLibrary')}</h1><p>${t('exerciseLibrarySubtitle')}</p></div></div>
    ${editingId === 'new' ? renderLibraryForm(null) : ''}
    <div class="exercise-library-list">${exercises.length ? exercises.map((exercise) => (editingId === exercise.id ? renderLibraryForm(exercise) : renderLibraryRow(exercise))).join('') : (editingId === 'new' ? '' : `<div class="editor-empty compact-empty"><strong>${t('noCustomExercise')}</strong><p>${t('noCustomExerciseHelp')}</p></div>`)}</div>
    ${editingId ? '' : `<button class="add-row-button" data-action="library-new-exercise">＋ ${t('createExercise')}</button>`}
  </div>`;
}

function renderLibraryRow(exercise) {
  return `<div class="exercise-library-row">
    <div class="exercise-library-row-copy"><strong>${escapeHtml(exercise.name)}</strong><span>${escapeHtml(getMuscleCategoryDisplayName(exercise.muscleCategory))}</span></div>
    <div class="mini-actions"><button class="icon-button" data-action="library-edit-exercise" data-exercise-id="${escapeHtml(exercise.id)}" title="${t('edit')}" aria-label="${t('edit')}">✎</button><button class="icon-button danger-icon" data-action="library-delete-exercise" data-exercise-id="${escapeHtml(exercise.id)}" title="${t('delete')}" aria-label="${t('delete')}">⌫</button></div>
  </div>`;
}

function renderLibraryForm(exercise) {
  return `<div class="exercise-draft-form">
    <label>${t('exerciseName')}<input data-new-exercise-name value="${escapeHtml(exercise?.name || '')}" placeholder="${escapeHtml(t('exerciseName'))}" /></label>
    <label>${t('muscleCategory')}<select data-new-exercise-category>${renderCategoryOptions(exercise?.muscleCategory || 'back')}</select></label>
    <div class="mini-actions">
      <button type="button" class="secondary-command compact" data-action="library-cancel">${t('cancel')}</button>
      <button type="button" class="primary-command compact" data-action="library-save">${exercise ? t('save') : t('createExercise')}</button>
    </div>
  </div>`;
}

function renderProgramCard(program, activeId) {
  const active = program.id === activeId;
  const sessionCount = program.sessionOrder.length;
  const actions = `${active ? '' : `<button data-action="activate" data-program-id="${escapeHtml(program.id)}">▶ ${t('activate')}</button>`}<button data-action="duplicate" data-program-id="${escapeHtml(program.id)}">⧉ ${t('duplicate')}</button><button data-action="edit" data-program-id="${escapeHtml(program.id)}">✎ ${t('edit')}</button><button class="program-share-action" data-action="share" data-program-id="${escapeHtml(program.id)}">↗ ${t('shareProgram')}</button><button class="danger" data-action="delete" data-program-id="${escapeHtml(program.id)}">⌫ ${t('delete')}</button>`;
  return `<article class="program-card ${active ? 'active-program' : ''}">
    <div class="program-card-accent" style="background:${escapeHtml(program.sessions[program.sessionOrder[0]]?.color || '#4d7cff')}"></div>
    <div class="program-card-main"><div class="program-card-title-row"><h2>${escapeHtml(localizeText(program.name))}</h2>${active ? `<span class="active-pill">${t('active')}</span>` : ''}</div><p>${escapeHtml(localizeText(program.description) || `${sessionCount} ${t('workouts').toLowerCase()}`)}</p><span class="program-meta">${sessionCount} ${t('workouts').toLowerCase()} · ${escapeHtml(formatFrequency(program.trainingFrequency))} · ${escapeHtml(program.goal === 'custom' ? t('custom') : t(program.goal || 'custom'))}</span></div>
    <div class="program-card-actions">${active ? '<span class="program-active-check">✓</span>' : ''}<button class="icon-button" data-action="program-actions" title="${t('moreActions')}" aria-label="${t('moreActions')}">⋯</button><div class="program-action-menu">${actions}</div></div>
  </article>`;
}

function openEditor(program, { isNew = false } = {}) {
  const draft = clone(program);
  if (draft.builtIn) localizeBuiltInDraft(draft);
  delete draft.builtIn;
  ui.editing = draft;
  ui.editorSessionId = draft.sessionOrder[0];
  ui.editorQuery = '';
  ui.editorCategory = 'back';
  ui.exerciseDraft = null;
  ui.history = [];
  ui.future = [];
  ui.disclosure = createBuilderDisclosureState(draft, { isNew });
  ui.screen = 'editor';
  renderEditor();
  resetDocumentScroll();
}

function disclosureHeader(action, title, summary, open, dataAttributes = '') {
  const stateLabel = open ? t('collapse') : t('expand');
  return `<button type="button" class="builder-disclosure" data-action="${action}" ${dataAttributes} aria-expanded="${open}" title="${escapeHtml(stateLabel)}">
    <span class="builder-disclosure-copy"><strong>${escapeHtml(title)}</strong>${summary ? `<span>${escapeHtml(summary)}</span>` : ''}</span>
    <span class="builder-disclosure-chevron" aria-hidden="true">${open ? '⌃' : '⌄'}</span>
  </button>`;
}

function programSummary(program) {
  const goal = t(program.goal || 'custom');
  const level = t(program.experienceLevel || 'intermediate');
  const duration = program.sessionDurationMinutes ? ` · ${program.sessionDurationMinutes} ${t('minutes')}` : '';
  return `${localizeText(program.name)} · ${goal} · ${level} · ${formatFrequency(program.trainingFrequency)}${duration}`;
}

function renderEditor() {
  const program = ui.editing;
  if (!program) { ui.screen = 'list'; return renderPrograms(); }
  const frequency = program.trainingFrequency || { mode: 'interval', intervalDays: 2 };
  const weeklyFrequency = frequency.mode === 'weekly';
  document.body.classList.add('program-editor-active');
  const session = program.sessions[ui.editorSessionId] || program.sessions[program.sessionOrder[0]] || null;
  if (session && session.id !== ui.editorSessionId) ui.editorSessionId = session.id;
  ui.disclosure ||= createBuilderDisclosureState(program);
  const programInfoOpen = ui.disclosure.programInfoOpen;
  getContainer().innerHTML = `<div class="program-workspace editor-workspace">
    <div class="workspace-header"><button class="icon-button" data-action="programs-back" title="${t('back')}">←</button><div><h1>${t('builder')}</h1><p>${t('everythingEditable')}</p></div><div class="editor-history-actions"><button class="secondary-command compact" data-action="editor-undo" ${ui.history.length ? '' : 'disabled'} title="${t('undo')}">↶ ${t('undo')}</button><button class="secondary-command compact" data-action="editor-redo" ${ui.future.length ? '' : 'disabled'} title="${t('redo')}">↷ ${t('redo')}</button></div></div>
    <section class="builder-section program-information-section">
      ${disclosureHeader('editor-toggle-program-meta', t('programInformation'), programSummary(program), programInfoOpen)}
      ${programInfoOpen ? `<div class="editor-meta editor-program-meta builder-section-body">
      <label>${t('name')}<input id="editor-program-name" value="${escapeHtml(program.name)}" /></label>
      <label>${t('programDescription')}<input id="editor-program-description" value="${escapeHtml(program.description || '')}" /></label>
      <label>${t('goal')}<select id="editor-program-goal">${['custom','strength','hypertrophy','endurance','mixed'].map((goal) => `<option value="${goal}" ${program.goal === goal ? 'selected' : ''}>${t(goal)}</option>`).join('')}</select></label>
      <label>${t('level')}<select id="editor-program-level">${['beginner','intermediate','advanced'].map((level) => `<option value="${level}" ${(program.experienceLevel || 'intermediate') === level ? 'selected' : ''}>${t(level)}</option>`).join('')}</select></label>
      <label>${t('duration')}<input id="editor-program-duration" type="number" min="0" step="5" value="${program.sessionDurationMinutes ?? ''}" placeholder="${t('minutes')}" /></label>
      <label>${t('trainingFrequency')}<select id="editor-program-frequency-mode"><option value="interval" ${weeklyFrequency ? '' : 'selected'}>${t('frequencyInterval')}</option><option value="weekly" ${weeklyFrequency ? 'selected' : ''}>${t('frequencyWeekly')}</option></select></label>
      <label>${weeklyFrequency ? t('sessionsPerWeek') : t('daysBetweenWorkouts')}<input id="editor-program-frequency-value" type="number" min="1" max="${weeklyFrequency ? 7 : 30}" step="1" value="${weeklyFrequency ? frequency.sessionsPerWeek : frequency.intervalDays}" /><small>${weeklyFrequency ? t('weeklyFrequencyHelp') : t('intervalFrequencyHelp')}</small></label>
      </div>` : ''}
    </section>
    <div class="session-tabs">${program.sessionOrder.map((sessionId) => `<button class="session-tab ${session && sessionId === session.id ? 'active' : ''}" data-action="editor-session" data-session-id="${escapeHtml(sessionId)}">${escapeHtml(localizeText(program.sessions[sessionId].name))}</button>`).join('')}<button class="icon-button" data-action="editor-add-session" title="${t('addWorkout')}">＋</button></div>
    ${session ? renderSessionEditor(session) : `<div class="editor-empty"><strong>${t('noWorkout')}</strong><p>${t('addWorkoutHelp')}</p><button class="add-row-button" data-action="editor-add-session">＋ ${t('addWorkout')}</button></div>`}
    <div class="workspace-footer"><button class="secondary-command" data-action="programs-back">${t('cancel')}</button><button class="primary-command" data-action="editor-save">${t('saveActivate')}</button></div>
  </div>`;
}

function renderSessionEditor(session) {
  const settingsOpen = ui.disclosure.sessionSettingsOpen.has(session.id);
  const blockCount = session.blocks.length;
  const sessionSummary = `${session.icon || '🏋️'} ${localizeText(session.subtitle) || `${blockCount} ${t('block').toLowerCase()}${blockCount === 1 ? '' : 's'}`}`;
  return `<section class="editor-session" data-session-id="${escapeHtml(session.id)}">
    <div class="builder-section session-settings-section">
      ${disclosureHeader('editor-toggle-session-settings', t('sessionSettings'), sessionSummary, settingsOpen, `data-session-id="${escapeHtml(session.id)}"`)}
      ${settingsOpen ? `<div class="editor-session-header advanced-session-header builder-section-body"><input class="editor-title-input" data-session-field="name" value="${escapeHtml(session.name)}" /><input class="editor-subtitle-input" data-session-field="subtitle" value="${escapeHtml(session.subtitle || '')}" placeholder="${t('workoutGoal')}" /><label class="icon-field">${t('icon')}<input data-session-field="icon" value="${escapeHtml(session.icon || '🏋️')}" /></label><label class="color-field">${t('color')}<input type="color" data-session-field="color" value="${escapeHtml(session.color || '#4d7cff')}" /></label><div class="mini-actions"><button class="icon-button" data-action="editor-session-left" title="${t('moveLeft')}">←</button><button class="icon-button" data-action="editor-session-right" title="${t('moveRight')}">→</button><button class="danger-command" data-action="editor-delete-session">${t('deleteWorkout')}</button></div></div>` : ''}
    </div>
    <div class="editor-blocks">${session.blocks.length ? session.blocks.map(renderEditorBlock).join('') : `<div class="editor-empty compact-empty"><strong>${t('noBlock')}</strong><p>${t('addFirstBlock')}</p></div>`}</div><button class="add-row-button" data-action="editor-add-block">＋ ${t('addBlock')}</button>
  </section>`;
}

function renderEditorBlock(block) {
  const open = ui.disclosure.openBlocks.has(block.id);
  return `<section class="editor-block ${open ? 'expanded' : ''}" data-block-id="${escapeHtml(block.id)}" data-block-expanded="${open}">
    ${disclosureHeader('editor-toggle-block', localizeText(block.name), formatBlockSummary(block), open, `data-block-id="${escapeHtml(block.id)}"`)}
    ${open ? `<div class="editor-block-body">
      <div class="editor-block-head advanced-block-head"><input data-block-field="name" value="${escapeHtml(block.name)}" /><select data-block-field="executionMode"><option value="sequential" ${block.executionMode === 'sequential' ? 'selected' : ''}>${t('sequential')}</option><option value="superset" ${block.executionMode === 'superset' ? 'selected' : ''}>Superset</option><option value="circuit" ${block.executionMode === 'circuit' ? 'selected' : ''}>${t('circuit')}</option></select><label>${t('rounds')}<input type="number" min="1" max="20" data-block-field="rounds" value="${block.rounds || 1}" /></label><label>${t('exerciseRest')}<input type="number" min="0" step="5" data-block-field="exerciseRest" value="${block.restBetweenExercisesSeconds || 0}" /></label><label>${t('roundRest')}<input type="number" min="0" step="5" data-block-field="roundRest" value="${block.restBetweenRoundsSeconds || 0}" /></label><div class="mini-actions"><button class="icon-button" data-action="editor-block-up" title="${t('moveUp')}">↑</button><button class="icon-button" data-action="editor-block-down" title="${t('moveDown')}">↓</button><button class="danger-command" data-action="editor-delete-block">${t('deleteBlock')}</button></div></div>
      <div class="editor-items">${block.items.length ? block.items.map(renderEditorItem).join('') : `<div class="editor-empty compact-empty"><strong>${t('noExercise')}</strong><p>${t('searchAddExercise')}</p></div>`}</div>
      <div class="editor-add-exercise">
        <label><span>${t('muscleCategory')}</span><select data-editor-category>${renderCategoryOptions(ui.editorCategory)}</select></label>
        <label><span>${t('filterIn', { category: categoryName(ui.editorCategory) })}</span><input data-editor-query value="${escapeHtml(ui.editorQuery)}" placeholder="${escapeHtml(t('filterIn', { category: categoryName(ui.editorCategory) }))}" /></label>
        <label class="editor-add-exercise-choice"><span>${t('exercise')}</span><select data-editor-add-exercise>${filteredExercises().map((exercise) => `<option value="${exercise.id}">${escapeHtml(getLocalizedExerciseName(exercise))}</option>`).join('')}${createExerciseOption()}</select></label>
        <button class="secondary-command" data-action="editor-add-item">＋ ${t('add')}</button>
      </div>
      ${ui.exerciseDraft?.scope === 'add' && ui.exerciseDraft.blockId === block.id ? renderExerciseDraftForm() : ''}
    </div>` : ''}
  </section>`;
}

function renderEditorItem(item) {
  const p = item.prescription || defaultPrescription();
  const technique = item.intensityTechnique || createIntensityTechnique('straight_sets');
  const selectedExerciseId = item.exerciseId || item.selection?.options?.[0]?.id || EXERCISES[0].id;
  const muscleCategory = getExerciseMuscleCategory(selectedExerciseId);
  const categoryExercises = getExercisesByMuscleCategory(muscleCategory);
  const open = ui.disclosure.openItems.has(item.id);
  const advancedOpen = ui.disclosure.openAdvancedItems.has(item.id);
  const exerciseName = getLocalizedExerciseName(selectedExerciseId, localizeText(item.name) || t('unknownExercise'));
  return `<div class="editor-item advanced-editor-item ${open ? 'expanded' : ''}" data-item-id="${escapeHtml(item.id)}" data-item-expanded="${open}">
    ${disclosureHeader('editor-toggle-item', exerciseName, formatPrescriptionSummary(item), open, `data-item-id="${escapeHtml(item.id)}"`)}
    ${open ? `<div class="editor-item-body">
      <div class="exercise-selector-pair"><label>${t('muscleCategory')}<select data-item-field="muscleCategory">${renderCategoryOptions(muscleCategory)}</select></label><label>${t('exercise')}<select data-item-field="exerciseId">${categoryExercises.map((exercise) => `<option value="${exercise.id}" ${exercise.id === selectedExerciseId ? 'selected' : ''}>${escapeHtml(getLocalizedExerciseName(exercise))}</option>`).join('')}${createExerciseOption()}</select></label></div>
      ${ui.exerciseDraft?.scope === 'item' && ui.exerciseDraft.itemId === item.id ? renderExerciseDraftForm() : ''}
      <div class="editor-item-settings prescription-grid basic-prescription-grid"><label>${t('sets')}<input type="number" min="1" max="30" data-item-field="sets" value="${p.setCount}" /></label><label>${t('minReps')}<input type="number" min="0" data-item-field="min" value="${p.repetitionRange.min}" /></label><label>${t('maxReps')}<input type="number" min="0" data-item-field="max" value="${p.repetitionRange.max}" /></label><label>${t('rest')} (s)<input type="number" min="0" step="5" data-item-field="rest" value="${p.restSeconds || 0}" /></label></div>
      <div class="advanced-options-section">
        ${disclosureHeader('editor-toggle-item-advanced', t('advancedOptions'), '', advancedOpen, `data-item-id="${escapeHtml(item.id)}"`)}
        ${advancedOpen ? `<div class="advanced-options-body"><div class="editor-item-settings prescription-grid advanced-prescription-grid"><label>${t('rir')}<input type="number" min="0" max="10" data-item-field="rir" value="${p.targetRir ?? ''}" /></label><label>${t('rpe')}<input type="number" min="1" max="10" step="0.5" data-item-field="rpe" value="${p.targetRpe ?? ''}" /></label><label>${t('tempo')}<input data-item-field="tempo" value="${escapeHtml(p.tempo || '')}" placeholder="3-1-1-0" /></label><label>${t('progression')}<select data-item-field="progression"><option value="" ${!p.progressionRuleId ? 'selected' : ''}>${t('none')}</option><option value="double_progression" ${p.progressionRuleId === 'double_progression' ? 'selected' : ''}>${t('doubleProgression')}</option></select></label><label class="wide-field">${t('note')}<input data-item-field="note" value="${escapeHtml(item.note || '')}" placeholder="${t('personalInstructions')}" /></label></div>
        <div class="technique-editor"><label>${t('technique')}<select data-item-field="technique">${INTENSITY_TECHNIQUES.map((entry) => `<option value="${entry.id}" ${entry.id === technique.type ? 'selected' : ''}>${escapeHtml(getIntensityTechnique(entry.id).name)}</option>`).join('')}</select></label><div class="technique-parameters">${renderTechniqueParameters(technique)}</div></div></div>` : ''}
      </div>
      <div class="mini-actions"><button class="icon-button" data-action="editor-item-up" title="${t('moveUp')}">↑</button><button class="icon-button" data-action="editor-item-down" title="${t('moveDown')}">↓</button><button class="danger-command" data-action="editor-delete-item">${t('removeExercise')}</button></div>
    </div>` : ''}
  </div>`;
}

function renderTechniqueParameters(technique) {
  const definition = getIntensityTechnique(technique.type);
  return Object.entries(definition?.parameters || {}).map(([key, type]) => `<label>${escapeHtml(t(PARAMETER_LABELS[key] || key))}<input data-tech-param="${escapeHtml(key)}" type="${type === 'number' ? 'number' : 'text'}" value="${escapeHtml(technique[key] ?? definition.defaults[key] ?? '')}" /></label>`).join('');
}

function renderCategoryOptions(selectedId) {
  return MUSCLE_CATEGORIES.map((category) => `<option value="${category.id}" ${category.id === selectedId ? 'selected' : ''}>${escapeHtml(getMuscleCategoryDisplayName(category))}</option>`).join('');
}

function createExerciseOption() {
  return `<option value="__create__">${escapeHtml(t('createNewExerciseOption'))}</option>`;
}

function renderExerciseDraftForm() {
  return `<div class="exercise-draft-form">
    <label>${t('exerciseName')}<input data-new-exercise-name value="" placeholder="${escapeHtml(t('exerciseName'))}" /></label>
    <label>${t('muscleCategory')}<select data-new-exercise-category>${renderCategoryOptions(ui.exerciseDraft.muscleCategory)}</select></label>
    <div class="mini-actions">
      <button type="button" class="secondary-command compact" data-action="cancel-create-exercise">${t('cancel')}</button>
      <button type="button" class="primary-command compact" data-action="confirm-create-exercise">${t('createExercise')}</button>
    </div>
  </div>`;
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
  const nameInput = document.getElementById('editor-program-name');
  const descriptionInput = document.getElementById('editor-program-description');
  const goalInput = document.getElementById('editor-program-goal');
  const levelInput = document.getElementById('editor-program-level');
  const durationInput = document.getElementById('editor-program-duration');
  const frequencyModeInput = document.getElementById('editor-program-frequency-mode');
  const frequencyValueInput = document.getElementById('editor-program-frequency-value');
  if (nameInput) program.name = nameInput.value.trim() || program.name;
  if (descriptionInput) program.description = descriptionInput.value.trim();
  if (goalInput) program.goal = goalInput.value || 'custom';
  if (levelInput) program.experienceLevel = levelInput.value || 'intermediate';
  if (durationInput) program.sessionDurationMinutes = durationInput.value ? Number(durationInput.value) : null;
  if (frequencyModeInput && frequencyValueInput) {
    const frequencyValue = Number(frequencyValueInput.value);
    program.trainingFrequency = frequencyModeInput.value === 'weekly'
      ? { mode: 'weekly', sessionsPerWeek: Math.min(7, Math.max(1, Number.isInteger(frequencyValue) ? frequencyValue : 3)) }
      : { mode: 'interval', intervalDays: Math.min(30, Math.max(1, Number.isInteger(frequencyValue) ? frequencyValue : 2)) };
  }
  const session = program.sessions[ui.editorSessionId];
  if (!session) return;
  const sessionNameInput = document.querySelector('[data-session-field="name"]');
  const sessionSubtitleInput = document.querySelector('[data-session-field="subtitle"]');
  const sessionIconInput = document.querySelector('[data-session-field="icon"]');
  const sessionColorInput = document.querySelector('[data-session-field="color"]');
  if (sessionNameInput) session.name = sessionNameInput.value.trim() || session.name;
  if (sessionSubtitleInput) session.subtitle = sessionSubtitleInput.value.trim();
  if (sessionIconInput) session.icon = sessionIconInput.value.trim() || '🏋️';
  if (sessionColorInput) session.color = sessionColorInput.value || session.color;
  session.colorRgb = hexToRgb(session.color);
  document.querySelectorAll('.editor-block[data-block-expanded="true"]').forEach((element) => syncBlock(session, element));
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
  element.querySelectorAll('.editor-item[data-item-expanded="true"]').forEach((itemElement) => syncItem(block, itemElement));
}

function syncItem(block, element) {
  const item = byId(block.items, element.dataset.itemId);
  if (!item) return;
  const input = (field) => element.querySelector(`[data-item-field="${field}"]`);
  const value = (field) => input(field)?.value;
  const exerciseInput = input('exerciseId');
  if (exerciseInput) {
    item.exerciseId = exerciseInput.value || item.exerciseId;
    delete item.selection;
  }
  item.prescription ||= defaultPrescription();
  item.prescription.setCount = Math.max(1, Number(value('sets')) || 1);
  item.prescription.repetitionRange = { min: Math.max(0, Number(value('min')) || 0), max: Math.max(0, Number(value('max')) || 0) };
  item.prescription.repetitionRange.max = Math.max(item.prescription.repetitionRange.min, item.prescription.repetitionRange.max);
  item.prescription.restSeconds = Math.max(0, Number(value('rest')) || 0);
  if (input('rir')) item.prescription.targetRir = value('rir') === '' ? null : Number(value('rir'));
  if (input('rpe')) item.prescription.targetRpe = value('rpe') === '' ? null : Number(value('rpe'));
  if (input('tempo')) item.prescription.tempo = value('tempo') || null;
  if (input('progression')) item.prescription.progressionRuleId = value('progression') || null;
  item.prescription.segments = [{ type: 'working', setCount: item.prescription.setCount }];
  if (input('note')) item.note = value('note').trim() || null;
  const techniqueInput = input('technique');
  if (techniqueInput) {
    const type = techniqueInput.value || 'straight_sets';
    const config = {};
    const definition = getIntensityTechnique(type);
    element.querySelectorAll('[data-tech-param]').forEach((parameterInput) => {
      if (definition?.parameters[parameterInput.dataset.techParam]) config[parameterInput.dataset.techParam] = parameterInput.type === 'number' ? Number(parameterInput.value) : parameterInput.value;
    });
    item.intensityTechnique = createIntensityTechnique(type, config);
  }
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

function toggleEditorDisclosure(action, button) {
  syncEditor();
  if (action === 'editor-toggle-program-meta') ui.disclosure.programInfoOpen = !ui.disclosure.programInfoOpen;
  if (action === 'editor-toggle-session-settings') {
    ui.disclosure.sessionSettingsOpen = toggleDisclosure(ui.disclosure.sessionSettingsOpen, button.dataset.sessionId);
  }
  if (action === 'editor-toggle-block') {
    ui.disclosure.openBlocks = toggleDisclosure(ui.disclosure.openBlocks, button.dataset.blockId);
  }
  if (action === 'editor-toggle-item') {
    ui.disclosure.openItems = toggleDisclosure(ui.disclosure.openItems, button.dataset.itemId);
  }
  if (action === 'editor-toggle-item-advanced') {
    const itemId = button.dataset.itemId;
    const justOpened = !ui.disclosure.openAdvancedItems.has(itemId);
    ui.disclosure.openAdvancedItems = toggleDisclosure(ui.disclosure.openAdvancedItems, itemId);
    if (justOpened) {
      requestAnimationFrame(() => {
        showTip('intensity-technique', {
          target: `.editor-item[data-item-id="${itemId}"] .technique-editor`,
          title: t('tipTechniqueTitle'),
          body: t('tipTechniqueDesc'),
        });
      });
    }
  }
  renderEditor();
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'new-program') openEditor(createBlankProgram(), { isNew: true });
    if (action === 'import-programs-from-list') document.getElementById('import-programs-file-input')?.click();
    if (action === 'toggle-ai-card') { ui.aiCardOpen = !ui.aiCardOpen; renderPrograms(); }
    if (action === 'copy-ai-template') {
      const copied = await copyText(buildAiProgramPrompt());
      window.showToast?.(t(copied ? 'aiTemplateCopied' : 'aiTemplateCopyError'), copied ? 'success' : 'error');
    }
    if (action === 'programs-tab-list') { ui.screen = 'list'; ui.libraryEditingId = null; renderPrograms(); resetDocumentScroll(); }
    if (action === 'programs-tab-exercises') { ui.screen = 'exercises'; ui.libraryEditingId = null; renderPrograms(); resetDocumentScroll(); }
    if (action === 'library-new-exercise') { ui.libraryEditingId = 'new'; renderPrograms(); }
    if (action === 'library-edit-exercise') { ui.libraryEditingId = button.dataset.exerciseId; renderPrograms(); }
    if (action === 'library-cancel') { ui.libraryEditingId = null; renderPrograms(); }
    if (action === 'library-save') {
      const nameInput = document.querySelector('[data-new-exercise-name]');
      const categorySelect = document.querySelector('[data-new-exercise-category]');
      const payload = { name: nameInput?.value, muscleCategory: categorySelect?.value };
      const ok = ui.libraryEditingId === 'new' ? !!createCustomExercise(payload) : updateCustomExercise(ui.libraryEditingId, payload);
      if (!ok) { window.showToast?.(t('exerciseNameRequired'), 'error'); return; }
      ui.libraryEditingId = null;
      renderPrograms();
    }
    if (action === 'library-delete-exercise') {
      const exercise = getCustomExercises().find((entry) => entry.id === button.dataset.exerciseId);
      if (exercise && window.confirm(t('deleteExerciseConfirm', { name: exercise.name }))) { deleteCustomExercise(exercise.id); renderPrograms(); }
    }
    if (action === 'confirm-create-exercise') confirmCreateExercise();
    if (action === 'cancel-create-exercise') { ui.exerciseDraft = null; renderEditor(); }
    if (action === 'program-actions') {
      const card = button.closest('.program-card');
      const willOpen = !card?.classList.contains('actions-open');
      getContainer().querySelectorAll('.program-card.actions-open').forEach((entry) => entry.classList.remove('actions-open'));
      if (willOpen && card) {
        card.classList.add('actions-open');
        positionProgramActionMenu(card);
      }
      return;
    }
    if (action === 'programs-back') { ui.screen = 'list'; ui.editing = null; renderPrograms(); resetDocumentScroll(); }
    if (action === 'activate') setActiveProgram(button.dataset.programId);
    if (action === 'duplicate') openEditor(duplicateProgram(button.dataset.programId));
    if (action === 'edit') { const program = getPrograms().find((entry) => entry.id === button.dataset.programId); if (program) openEditor(program); }
    if (action === 'share') await shareProgram(button.dataset.programId);
    if (action === 'delete') {
      const program = getPrograms().find((entry) => entry.id === button.dataset.programId);
      if (program && window.confirm(t('programDeleteConfirm', { name: program.name }))) deleteProgram(program.id);
    }
    if (action === 'editor-save') { syncEditor(); const saved = saveProgram(ui.editing); setActiveProgram(saved.id); ui.screen = 'list'; renderPrograms(); resetDocumentScroll(); }
    if (action === 'editor-undo') undoEditor();
    if (action === 'editor-redo') redoEditor();
    if (['editor-toggle-program-meta', 'editor-toggle-session-settings', 'editor-toggle-block', 'editor-toggle-item', 'editor-toggle-item-advanced'].includes(action)) {
      toggleEditorDisclosure(action, button);
      return;
    }
    if (action === 'editor-session') { syncEditor(); ui.editorSessionId = button.dataset.sessionId; renderEditor(); }
    if (action === 'editor-add-session') addSession();
    if (action === 'editor-delete-session') deleteSession();
    if (action === 'editor-session-left') moveSession(-1);
    if (action === 'editor-session-right') moveSession(1);
    if (['editor-add-block', 'editor-delete-block', 'editor-block-up', 'editor-block-down', 'editor-add-item', 'editor-delete-item', 'editor-item-up', 'editor-item-down'].includes(action)) handleStructureAction(action, button);
  } catch (error) { window.showToast?.(error.message || t('errorOccurred'), 'error'); }
}

function addSession() {
  syncEditor();
  pushHistory();
  const session = createSession(ui.editing.sessionOrder.length);
  ui.editing.sessions[session.id] = session;
  ui.editing.sessionOrder.push(session.id);
  ui.editorSessionId = session.id;
  ui.disclosure.sessionSettingsOpen.add(session.id);
  if (session.blocks[0]) ui.disclosure.openBlocks.add(session.blocks[0].id);
  renderEditor();
}

function deleteSession() {
  syncEditor();
  pushHistory();
  ui.disclosure.sessionSettingsOpen.delete(ui.editorSessionId);
  delete ui.editing.sessions[ui.editorSessionId];
  ui.editing.sessionOrder = ui.editing.sessionOrder.filter((id) => id !== ui.editorSessionId);
  ui.editorSessionId = ui.editing.sessionOrder[0] || null;
  renderEditor();
}
function moveSession(direction) { syncEditor(); const index = ui.editing.sessionOrder.indexOf(ui.editorSessionId); const target = index + direction; if (target >= 0 && target < ui.editing.sessionOrder.length) { pushHistory(); [ui.editing.sessionOrder[index], ui.editing.sessionOrder[target]] = [ui.editing.sessionOrder[target], ui.editing.sessionOrder[index]]; } renderEditor(); }

function handleStructureAction(action, button) {
  syncEditor();
  const session = ui.editing.sessions[ui.editorSessionId];
  const blockElement = button.closest('.editor-block');
  const itemElement = button.closest('.editor-item');
  const block = blockElement ? byId(session.blocks, blockElement.dataset.blockId) : null;
  if (action === 'editor-add-block') {
    pushHistory();
    const createdBlock = createBlock(session.blocks.length);
    session.blocks.push(createdBlock);
    ui.disclosure.openBlocks.add(createdBlock.id);
  }
  if (action === 'editor-delete-block' && block) {
    pushHistory();
    ui.disclosure.openBlocks.delete(block.id);
    block.items.forEach((item) => {
      ui.disclosure.openItems.delete(item.id);
      ui.disclosure.openAdvancedItems.delete(item.id);
    });
    session.blocks = session.blocks.filter((entry) => entry.id !== block.id);
  }
  if (action === 'editor-block-up' && block) { pushHistory(); move(session.blocks, block.id, -1); }
  if (action === 'editor-block-down' && block) { pushHistory(); move(session.blocks, block.id, 1); }
  if (action === 'editor-add-item' && block) {
    const exerciseId = blockElement.querySelector('[data-editor-add-exercise]')?.value;
    if (!exerciseId) throw new Error(t('noSearchExercise'));
    pushHistory();
    const createdItem = createItem(exerciseId);
    block.items.push(createdItem);
    ui.disclosure.openItems.add(createdItem.id);
  }
  if (itemElement && block) {
    const item = byId(block.items, itemElement.dataset.itemId);
    if (action === 'editor-delete-item') {
      pushHistory();
      ui.disclosure.openItems.delete(item.id);
      ui.disclosure.openAdvancedItems.delete(item.id);
      block.items = block.items.filter((entry) => entry.id !== item.id);
    }
    if (action === 'editor-item-up') { pushHistory(); move(block.items, item.id, -1); }
    if (action === 'editor-item-down') { pushHistory(); move(block.items, item.id, 1); }
  }
  renderEditor();
}

function handleChange(event) {
  if (event.target.id === 'editor-program-frequency-mode') { syncEditor(); renderEditor(); return; }
  if (event.target.dataset.editorAddExercise !== undefined && event.target.value === '__create__') {
    const blockElement = event.target.closest('.editor-block');
    openExerciseDraft({ scope: 'add', blockId: blockElement?.dataset.blockId, category: blockElement?.querySelector('[data-editor-category]')?.value || ui.editorCategory });
    return;
  }
  if (event.target.dataset.itemField === 'exerciseId' && event.target.value === '__create__') {
    const itemElement = event.target.closest('.editor-item');
    const blockElement = event.target.closest('.editor-block');
    openExerciseDraft({
      scope: 'item',
      blockId: blockElement?.dataset.blockId,
      itemId: itemElement?.dataset.itemId,
      category: itemElement?.querySelector('[data-item-field="muscleCategory"]')?.value || 'back',
    });
    return;
  }
  if (event.target.dataset.editorCategory !== undefined) updateAddExerciseOptions(event.target, '');
  if (event.target.dataset.itemField === 'muscleCategory') { changeItemMuscleCategory(event.target); }
  if (event.target.dataset.editorQuery !== undefined) updateAddExerciseOptions(event.target.closest('.editor-block')?.querySelector('[data-editor-category]'), event.target.value);
  if (event.target.dataset.itemField === 'technique') { pushHistory(); syncEditor(); renderEditor(); }
}

function openExerciseDraft({ scope, blockId, itemId, category }) {
  syncEditor();
  ui.exerciseDraft = { scope, blockId, itemId, muscleCategory: category };
  renderEditor();
}

function confirmCreateExercise() {
  const nameInput = document.querySelector('[data-new-exercise-name]');
  const categorySelect = document.querySelector('[data-new-exercise-category]');
  const created = createCustomExercise({ name: nameInput?.value, muscleCategory: categorySelect?.value });
  if (!created) { window.showToast?.(t('exerciseNameRequired'), 'error'); return; }
  const draft = ui.exerciseDraft;
  const session = ui.editing.sessions[ui.editorSessionId];
  const block = byId(session?.blocks || [], draft.blockId);
  if (draft.scope === 'add' && block) {
    pushHistory();
    const createdItem = createItem(created.id);
    block.items.push(createdItem);
    ui.disclosure.openItems.add(createdItem.id);
    ui.editorCategory = created.muscleCategory;
  } else if (draft.scope === 'item' && block) {
    const item = byId(block.items, draft.itemId);
    if (item) {
      pushHistory();
      item.exerciseId = created.id;
      delete item.selection;
    }
  }
  ui.exerciseDraft = null;
  renderEditor();
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
  const createOption = document.createElement('option');
  createOption.value = '__create__';
  createOption.textContent = t('createNewExerciseOption');
  exerciseSelect.appendChild(createOption);
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
