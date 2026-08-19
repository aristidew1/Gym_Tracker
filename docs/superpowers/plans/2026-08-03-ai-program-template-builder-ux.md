# AI Program Template and Compact Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localized, copyable AI prompt that produces importable Muscu Tracker programs and replace the overloaded mobile program builder with compact, stateful accordions.

**Architecture:** Keep prompt generation and builder presentation logic in focused service modules that can be tested without a browser. `app.js` only wires the settings button to prompt generation and clipboard copying; `programs.js` owns DOM rendering while consuming pure disclosure and summary helpers. Root web files remain the source of truth and are synchronized to `www/` only after tests pass.

**Tech Stack:** Vanilla JavaScript ES modules, Node.js built-in test runner, HTML/CSS, Capacitor 8, Android Gradle, ADB.

## Global Constraints

- The prompt must use the application's active language: French for `fr`, English for `en`.
- JSON keys, schema identifiers, exercise IDs, and enum values remain language-independent.
- Generated JSON must use `format: "muscu-tracker-programs"`, export `version: 1`, and program `schemaVersion: 2`.
- Existing program fields and advanced editing capabilities must remain available.
- The builder must have no horizontal overflow at approximately 448 CSS pixels on the connected Pixel 8 Pro.
- The add-exercise button and save action must remain reachable at all times.
- Root files are authoritative; never edit `www/` manually.
- Add no third-party runtime or test dependency.

---

### Task 1: Localized AI program prompt generator

**Files:**
- Create: `services/ai-program-template.js`
- Create: `tests/ai-program-template.test.js`
- Read: `models/workout-schema.js`
- Read: `storage.js`
- Read: `data/exercises.js`
- Read: `data/intensity-techniques.js`

**Interfaces:**
- Consumes: `getLanguage(): "fr" | "en"`, `EXERCISES`, `getLocalizedExerciseName(exercise)`, and `INTENSITY_TECHNIQUES`.
- Produces: `createAiProgramImportExample(language?: "fr" | "en"): object` and `buildAiProgramPrompt(): string`, which always reads the active application language.

- [ ] **Step 1: Write failing prompt contract tests**

Create `tests/ai-program-template.test.js` with a localStorage language stub before dynamic imports. Assert that the example is accepted by both `validateProgram` and `getProgramsImportSummary`, that the active ID matches, and that each language contains every canonical exercise and technique ID.

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const { setLanguage } = await import('../i18n.js');
const { EXERCISES } = await import('../data/exercises.js');
const { INTENSITY_TECHNIQUES } = await import('../data/intensity-techniques.js');
const { validateProgram } = await import('../models/workout-schema.js');
const { getProgramsImportSummary } = await import('../storage.js');
const { buildAiProgramPrompt, createAiProgramImportExample } = await import('../services/ai-program-template.js');

test('AI example follows the program-only import contract', () => {
  const example = createAiProgramImportExample('fr');
  assert.deepEqual(getProgramsImportSummary(JSON.stringify(example)), { programs: 1 });
  assert.equal(example.activeProgramId, example.programs[0].id);
  assert.deepEqual(validateProgram(example.programs[0]), []);
});

test('AI prompt follows the active application language and complete catalog', () => {
  setLanguage('fr');
  const french = buildAiProgramPrompt();
  assert.match(french, /programme de musculation/iu);
  assert.match(french, /Tractions lestées/u);

  setLanguage('en');
  const english = buildAiProgramPrompt();
  assert.match(english, /strength-training program/iu);
  assert.match(english, /Weighted Pull-up/u);
  assert.doesNotMatch(english, /Réponds uniquement/u);

  for (const prompt of [french, english]) {
    assert.match(prompt, /"format": "muscu-tracker-programs"/u);
    assert.match(prompt, /without Markdown|sans Markdown/u);
    EXERCISES.forEach(({ id }) => assert.ok(prompt.includes(id), id));
    INTENSITY_TECHNIQUES.forEach(({ id }) => assert.ok(prompt.includes(id), id));
  }
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/ai-program-template.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `services/ai-program-template.js`.

- [ ] **Step 3: Implement a valid example and localized prompt**

Create `services/ai-program-template.js`. Use an explicit language dictionary, a JSON example with one session/block/item, and generated catalog lines. The implementation must include all of these program fields in the example:

```js
import { EXERCISES, getLocalizedExerciseName } from '../data/exercises.js';
import { INTENSITY_TECHNIQUES } from '../data/intensity-techniques.js';
import { getLanguage } from '../i18n.js';

const copy = {
  fr: {
    programName: 'Programme exemple IA', sessionName: 'Séance A', blockName: 'Bloc principal',
    intro: "Tu crées un programme de musculation pour Muscu Tracker.",
    output: "Réponds uniquement avec le JSON final valide, sans Markdown ni commentaire.",
    need: "BESOIN UTILISATEUR À REMPLACER : décris ici l'objectif, le niveau, le matériel et la fréquence.",
  },
  en: {
    programName: 'AI example program', sessionName: 'Workout A', blockName: 'Main block',
    intro: 'You create a strength-training program for Muscu Tracker.',
    output: 'Reply only with valid final JSON, without Markdown or commentary.',
    need: 'USER REQUIREMENT TO REPLACE: describe the goal, level, equipment, and frequency here.',
  },
};

export function createAiProgramImportExample(language = getLanguage()) {
  const text = copy[language] || copy.fr;
  const id = 'ai_program_example';
  return {
    format: 'muscu-tracker-programs', version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z', activeProgramId: id,
    programs: [{
      id, schemaVersion: 2, name: text.programName, description: '', goal: 'custom',
      experienceLevel: 'intermediate', sessionDurationMinutes: 60,
      sessionOrder: ['session_a'], sessions: { session_a: {
        id: 'session_a', name: text.sessionName, subtitle: '', icon: '🏋️',
        color: '#4d7cff', colorRgb: '77, 124, 255', blocks: [{
          id: 'main_block', name: text.blockName,
          presentation: { label: text.blockName, badgeClass: 'force' },
          executionMode: 'sequential', rounds: 1,
          restBetweenExercisesSeconds: 0, restBetweenRoundsSeconds: 90,
          items: [{
            id: 'main_exercise', exerciseId: 'barbell_back_squat',
            prescription: { setCount: 3, repetitionRange: { min: 8, max: 10 },
              segments: [{ type: 'working', setCount: 3 }], restSeconds: 120,
              targetRir: 2, targetRpe: null, tempo: null, progressionRuleId: 'double_progression' },
            intensityTechnique: { type: 'straight_sets' }, note: null,
          }],
        }],
      } },
    }],
  };
}
```

`buildAiProgramPrompt` must append localized schema rules, the pretty-printed example, `EXERCISES.map(exercise => \`${exercise.id} — ${getLocalizedExerciseName(exercise)}\`)`, and technique entries including `parameters` and `defaults`. It must end with the localized user-requirement line.

- [ ] **Step 4: Run prompt tests and the whole suite**

Run: `node --test tests/ai-program-template.test.js && npm test`

Expected: all tests PASS with no warnings.

- [ ] **Step 5: Commit the prompt generator**

```bash
git add services/ai-program-template.js tests/ai-program-template.test.js
git commit -m "feat: generate localized AI program prompts"
```

---

### Task 2: Clipboard service and settings action

**Files:**
- Create: `services/clipboard.js`
- Create: `tests/clipboard.test.js`
- Modify: `index.html:205-271`
- Modify: `i18n.js:4-72`
- Modify: `app.js:1-25,1364-1599`

**Interfaces:**
- Consumes: `buildAiProgramPrompt(): string` from Task 1 and existing `showToast(message, type)`.
- Produces: `copyText(text: string, options?: { navigatorRef?: object, documentRef?: object }): Promise<boolean>` and the `#btn-copy-ai-template` settings action.

- [ ] **Step 1: Write failing clipboard behavior tests**

Create `tests/clipboard.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { copyText } from '../services/clipboard.js';

test('copyText uses the asynchronous Clipboard API', async () => {
  let copied = '';
  const result = await copyText('prompt', {
    navigatorRef: { clipboard: { writeText: async (text) => { copied = text; } } },
    documentRef: null,
  });
  assert.equal(result, true);
  assert.equal(copied, 'prompt');
});

test('copyText falls back to a temporary textarea', async () => {
  let selected = false;
  let removed = false;
  const textarea = { value: '', style: {}, setAttribute() {}, select() { selected = true; }, remove() { removed = true; } };
  const documentRef = {
    body: { appendChild(node) { assert.equal(node, textarea); } },
    createElement: () => textarea,
    execCommand: (command) => command === 'copy',
  };
  const result = await copyText('fallback', {
    navigatorRef: { clipboard: { writeText: async () => { throw new Error('denied'); } } },
    documentRef,
  });
  assert.equal(result, true);
  assert.equal(textarea.value, 'fallback');
  assert.equal(selected, true);
  assert.equal(removed, true);
});
```

- [ ] **Step 2: Verify clipboard tests fail**

Run: `node --test tests/clipboard.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `services/clipboard.js`.

- [ ] **Step 3: Implement clipboard copy with fallback**

Create `services/clipboard.js`:

```js
export async function copyText(text, {
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
} = {}) {
  try {
    if (navigatorRef?.clipboard?.writeText) {
      await navigatorRef.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue with the WebView-compatible fallback.
  }
  if (!documentRef?.body || typeof documentRef.createElement !== 'function') return false;
  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  documentRef.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try { copied = documentRef.execCommand?.('copy') === true; } catch { copied = false; }
  textarea.remove();
  return copied;
}
```

- [ ] **Step 4: Add localized settings copy and markup**

Add these keys to both dictionaries in `i18n.js`: `createWithAi`, `aiProgramTemplate`, `aiProgramTemplateDesc`, `copyTemplate`, `aiTemplateCopied`, and `aiTemplateCopyError`.

Add a settings section before « Données » in `index.html` using the existing `.settings-section`, `.settings-row`, `.settings-row-info`, and `.settings-action-btn` classes. The button ID is exactly `btn-copy-ai-template` and every visible string uses `data-i18n`.

Import the two services at the top of `app.js`, capture the button in `initSettings`, and wire:

```js
btnCopyAiTemplate.addEventListener('click', async () => {
  const copied = await copyText(buildAiProgramPrompt());
  showToast(t(copied ? 'aiTemplateCopied' : 'aiTemplateCopyError'), copied ? 'success' : 'error');
});
```

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/clipboard.test.js tests/i18n.test.js tests/ai-program-template.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit the settings feature**

```bash
git add services/clipboard.js tests/clipboard.test.js index.html i18n.js app.js
git commit -m "feat: copy AI program template from settings"
```

---

### Task 3: Pure builder summaries and disclosure state

**Files:**
- Create: `services/program-builder-view.js`
- Create: `tests/program-builder-view.test.js`

**Interfaces:**
- Consumes: program, block, and item objects from schema version 2.
- Produces: `createBuilderDisclosureState(program, { isNew?: boolean }): object`, `toggleDisclosure(set, id): Set<string>`, `formatPrescriptionSummary(item): string`, and `formatBlockSummary(block): string`.

- [ ] **Step 1: Write failing builder-view tests**

Create `tests/program-builder-view.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBuilderDisclosureState, formatBlockSummary, formatPrescriptionSummary, toggleDisclosure,
} from '../services/program-builder-view.js';

const program = {
  sessionOrder: ['a'], sessions: { a: { id: 'a', blocks: [
    { id: 'block_a', executionMode: 'superset', rounds: 3, restBetweenRoundsSeconds: 90, items: [{ id: 'item_a' }, { id: 'item_b' }] },
  ] } },
};

test('existing programs start compact while new programs guide the first edit', () => {
  const existing = createBuilderDisclosureState(program, { isNew: false });
  assert.equal(existing.programInfoOpen, false);
  assert.equal(existing.sessionSettingsOpen.size, 0);
  assert.equal(existing.openBlocks.size, 0);

  const fresh = createBuilderDisclosureState(program, { isNew: true });
  assert.equal(fresh.programInfoOpen, true);
  assert.ok(fresh.sessionSettingsOpen.has('a'));
  assert.ok(fresh.openBlocks.has('block_a'));
});

test('summaries expose useful information without advanced fields', () => {
  const item = { prescription: { setCount: 5, repetitionRange: { min: 3, max: 5 }, restSeconds: 150, targetRir: 2 } };
  assert.equal(formatPrescriptionSummary(item), '5 × 3–5 · 150 s · RIR 2');
  assert.equal(formatBlockSummary(program.sessions.a.blocks[0]), 'Superset · 2 exercices · 3 rounds · 90 s');
  assert.deepEqual([...toggleDisclosure(new Set(), 'block_a')], ['block_a']);
  assert.equal(toggleDisclosure(new Set(['block_a']), 'block_a').size, 0);
});
```

- [ ] **Step 2: Verify builder-view tests fail**

Run: `node --test tests/program-builder-view.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `services/program-builder-view.js`.

- [ ] **Step 3: Implement the pure presentation functions**

Create the state object with `Set` instances named `sessionSettingsOpen`, `openBlocks`, `openItems`, and `openAdvancedItems`. Use `isNew` to open program information, the first session settings, and the first block. Implement immutable set toggling. Summaries omit absent optional values and pluralize French labels through a `language` parameter defaulting to `getLanguage()`.

```js
export function toggleDisclosure(values, id) {
  const next = new Set(values);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
```

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/program-builder-view.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit the builder presentation model**

```bash
git add services/program-builder-view.js tests/program-builder-view.test.js
git commit -m "feat: add compact builder presentation state"
```

---

### Task 4: Accordion-based program builder

**Files:**
- Modify: `programs.js:18-396`
- Modify: `i18n.js:20-71`
- Modify: `index.css:2035-2350`
- Create: `tests/programs-ui.test.js`

**Interfaces:**
- Consumes: all helpers from `services/program-builder-view.js`.
- Produces: toggle actions `editor-toggle-program-meta`, `editor-toggle-session-settings`, `editor-toggle-block`, `editor-toggle-item`, and `editor-toggle-item-advanced` in the existing delegated click handler.

- [ ] **Step 1: Add a failing integration test for the rendered editor**

Create `tests/programs-ui.test.js` with a minimal real container and document boundary. Capture the delegated click listener, open the built-in program through the real `initPrograms()` flow, and assert on the resulting editor HTML:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};
const listeners = new Map();
const container = {
  innerHTML: '',
  addEventListener(type, listener) { listeners.set(type, listener); },
  querySelectorAll() { return []; },
};
const classNames = new Set();
globalThis.document = {
  body: { classList: { add: (name) => classNames.add(name), remove: (name) => classNames.delete(name) }, scrollTop: 0 },
  documentElement: { scrollTop: 0 },
  getElementById: (id) => id === 'programs-content' ? container : null,
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, scrollTo() {} };

const { initPrograms } = await import('../programs.js');

test('editing an existing program starts with compact disclosure controls', () => {
  initPrograms();
  listeners.get('click')({ target: { closest: () => ({
    dataset: { action: 'edit', programId: 'pullup_deadlift_cycle' },
  }) } });
  assert.ok(classNames.has('program-editor-active'));
  assert.match(container.innerHTML, /data-action="editor-toggle-program-meta"/u);
  assert.match(container.innerHTML, /data-action="editor-toggle-session-settings"/u);
  assert.match(container.innerHTML, /data-action="editor-toggle-block"/u);
  assert.doesNotMatch(container.innerHTML, /data-item-field="sets"/u);
});
```

- [ ] **Step 2: Verify the integration assertion fails**

Run: `node --test tests/programs-ui.test.js`

Expected: FAIL because the rendered editor does not contain `editor-toggle-program-meta`.

- [ ] **Step 3: Initialize and preserve disclosure state**

Import the Task 3 helpers. Add `disclosure` to `ui`. Change `openEditor(program, { isNew = false } = {})` to initialize state. Pass `{ isNew: true }` only for `new-program`; duplicated and edited programs start compact.

When a structural action creates a block or item, add its new ID to the corresponding open set before rerendering. Do not include disclosure state in saved JSON or history snapshots.

- [ ] **Step 4: Replace always-expanded metadata and session controls**

Render a `.builder-panel` button with a chevron and localized summary before each collapsible body. Program metadata and session settings are rendered only while open. Add localized keys `programInformation`, `sessionSettings`, `advancedOptions`, `collapse`, `expand`, `exerciseCountSummary`, `roundSummary`, and `restSummary`.

Before closing a section, call `syncEditor()` so values in controls about to leave the DOM are retained.

- [ ] **Step 5: Replace blocks and exercises with compact accordions**

Closed blocks render only their header and `formatBlockSummary`. Open blocks render their fields, item list, and add-exercise form. Closed items render their localized exercise name plus `formatPrescriptionSummary`. Open items render basic fields; advanced fields and technique parameters render only if `openAdvancedItems` contains the item ID.

Mark open editable containers with `data-block-expanded="true"` and `data-item-expanded="true"`. Update synchronization selectors exactly as follows so collapsed summaries cannot overwrite stored values with empty defaults:

```js
document.querySelectorAll('.editor-block[data-block-expanded="true"]').forEach((element) => syncBlock(session, element));
element.querySelectorAll('.editor-item[data-item-expanded="true"]').forEach((itemElement) => syncItem(block, itemElement));
```

- [ ] **Step 6: Make the footer sticky and eliminate horizontal overflow**

Give `.workspace-footer` a sticky bottom position, safe-area padding, opaque/glass background, and sufficient z-index. Use a two-column add form at wider phone sizes with exercise select and add button spanning the full row; switch to one column under 420px. Every grid child gets `min-width: 0`.

```css
.editor-add-exercise {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 7px;
}
.editor-add-exercise [data-editor-add-exercise],
.editor-add-exercise .secondary-command { grid-column: 1 / -1; min-width: 0; }
.workspace-footer {
  position: sticky;
  bottom: 0;
  z-index: 30;
  padding: 12px 0 max(12px, env(safe-area-inset-bottom));
  background: rgba(7, 7, 13, 0.96);
}
```

- [ ] **Step 7: Run all automated checks**

Run: `node --test tests/programs-ui.test.js tests/program-builder-view.test.js && npm test && npm run sync:web && git diff --check`

Expected: tests PASS, `www synchronisé depuis les sources racines.`, and no whitespace errors.

- [ ] **Step 8: Commit the compact builder**

```bash
git add programs.js i18n.js index.css tests/programs-ui.test.js tests/program-builder-view.test.js www
git commit -m "feat: simplify the mobile program builder"
```

---

### Task 5: Android build and real-device acceptance

**Files:**
- Generated by synchronization: `www/`
- Generated build artifact: `android/app/build/outputs/apk/debug/app-debug.apk`

**Interfaces:**
- Consumes: synchronized web source from Tasks 1-4.
- Produces: an installed debug APK verified on `fr.aris.gymtrack` without saving test drafts.

- [ ] **Step 1: Run final automated verification from a clean process**

Run: `npm test && npm run sync:android && (cd android && ./gradlew assembleDebug)`

Expected: Node tests PASS, Capacitor sync succeeds, and Gradle ends with `BUILD SUCCESSFUL`.

- [ ] **Step 2: Install and launch the APK**

Run:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am force-stop fr.aris.gymtrack
adb shell monkey -p fr.aris.gymtrack -c android.intent.category.LAUNCHER 1
```

Expected: `Success` from installation and Muscu Tracker in the foreground.

- [ ] **Step 3: Verify compact builder acceptance via ADB**

Navigate to Programmes, open the contextual menu, and edit the built-in program. Capture screenshots and a UIAutomator dump. Confirm:

- program information, session settings, blocks, and exercises have clickable collapsed summaries;
- the existing program starts with blocks collapsed;
- opening a block and its add form gives the « Ajouter » / “Add” button non-zero bounds inside `[0,1344]`;
- `document` content does not visually extend beyond the right edge;
- the sticky save footer remains visible after a vertical swipe;
- adding an exercise opens its row and canceling the draft leaves stored programs unchanged.

- [ ] **Step 4: Verify localized template copy on device**

Open settings in French, tap `#btn-copy-ai-template`, and confirm the French success toast. Change language to English, tap the same action, and confirm the English success toast. Use the automated prompt tests as the content-level proof; the device check proves the WebView clipboard path.

- [ ] **Step 5: Run final repository checks and commit synchronized output if needed**

Run: `npm test && git diff --check && git status --short`

Expected: all tests PASS, no whitespace errors, and no uncommitted source or synchronized-web differences. If Capacitor synchronization changed tracked Android metadata, commit only those in-scope files with:

```bash
git add android www
git commit -m "build: synchronize compact builder for Android"
```
