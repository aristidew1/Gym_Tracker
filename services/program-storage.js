import { DEFAULT_PROGRAM } from '../data/default-program.js';
import { migrateProgram, migratePrograms, validateProgram } from '../models/workout-schema.js';
import { t } from '../i18n.js';

const PROGRAMS_KEY = 'muscu_programs';
const ACTIVE_PROGRAM_KEY = 'muscu_active_program_id';
const BASE_PROGRAM_DELETED_KEY = 'muscu_base_program_deleted';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readStoredPrograms() {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRAMS_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    const { programs, changed } = migratePrograms(value);
    const validPrograms = programs.filter((program) => validateProgram(program).length === 0);
    if (changed || validPrograms.length !== value.length) writeStoredPrograms(validPrograms);
    return validPrograms;
  } catch {
    return [];
  }
}

function writeStoredPrograms(programs) {
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs));
}

function emitChange() {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('program:changed'));
  }
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return `program_${globalThis.crypto.randomUUID()}`;
  return `program_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeProgramName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function makeUniqueProgramName(name, existingNames) {
  const baseName = String(name).trim();
  if (!existingNames.has(normalizeProgramName(baseName))) return baseName;

  let suffix = 1;
  let candidate = `${baseName} (${suffix})`;
  while (existingNames.has(normalizeProgramName(candidate))) {
    suffix += 1;
    candidate = `${baseName} (${suffix})`;
  }
  return candidate;
}

export function getPrograms() {
  const storedPrograms = readStoredPrograms();
  const savedBaseProgram = storedPrograms.find((program) => program.id === DEFAULT_PROGRAM.id);
  const baseProgramDeleted = localStorage.getItem(BASE_PROGRAM_DELETED_KEY) === 'true';
  return [
    ...(baseProgramDeleted ? [] : [{ ...clone(savedBaseProgram || DEFAULT_PROGRAM), builtIn: true }]),
    ...storedPrograms
      .filter((program) => program.id !== DEFAULT_PROGRAM.id)
      .map((program) => ({ ...clone(program), builtIn: false })),
  ];
}

// The base program is persisted only after it has been edited. This keeps a
// fresh install lightweight while allowing the preset itself to be customised.
export function getCustomPrograms() {
  return clone(readStoredPrograms().filter((program) => program.id !== DEFAULT_PROGRAM.id));
}

export function getProgramById(id) {
  return getPrograms().find((program) => program.id === id) || null;
}

export function getActiveProgramId() {
  const savedId = localStorage.getItem(ACTIVE_PROGRAM_KEY);
  return getProgramById(savedId)?.id || getPrograms()[0]?.id || null;
}

export function getActiveProgram() {
  return getProgramById(getActiveProgramId());
}

export function saveProgram(program) {
  const next = migrateProgram(clone(program));
  next.id = next.id || makeId();
  delete next.builtIn;
  const errors = validateProgram(next);
  if (errors.length) throw new Error(errors.join(' '));

  const programs = readStoredPrograms();
  const index = programs.findIndex((item) => item.id === next.id);
  if (index === -1) {
    programs.push(next);
  } else {
    programs[index] = next;
  }
  writeStoredPrograms(programs);
  if (next.id === DEFAULT_PROGRAM.id) localStorage.removeItem(BASE_PROGRAM_DELETED_KEY);
  emitChange();
  return clone(next);
}

export function duplicateProgram(id) {
  const source = getProgramById(id);
  if (!source) throw new Error(t('programNotFound'));
  const copy = clone(source);
  copy.id = makeId();
  copy.name = t('copySuffix', { name: source.name });
  delete copy.builtIn;
  return saveProgram(copy);
}

export function deleteProgram(id) {
  const availablePrograms = getPrograms();
  if (!availablePrograms.some((program) => program.id === id)) throw new Error(t('programNotFound'));
  if (availablePrograms.length === 1) throw new Error(t('lastProgramDelete'));
  const programs = readStoredPrograms().filter((program) => program.id !== id);
  writeStoredPrograms(programs);
  if (id === DEFAULT_PROGRAM.id) localStorage.setItem(BASE_PROGRAM_DELETED_KEY, 'true');
  if (localStorage.getItem(ACTIVE_PROGRAM_KEY) === id || !getProgramById(localStorage.getItem(ACTIVE_PROGRAM_KEY))) {
    const fallbackId = getPrograms()[0]?.id;
    if (fallbackId) localStorage.setItem(ACTIVE_PROGRAM_KEY, fallbackId);
    else localStorage.removeItem(ACTIVE_PROGRAM_KEY);
  }
  emitChange();
}

export function setActiveProgram(id) {
  if (!getProgramById(id)) throw new Error(t('programNotFound'));
  localStorage.setItem(ACTIVE_PROGRAM_KEY, id);
  emitChange();
}

export function restorePrograms(programs, activeProgramId) {
  if (!Array.isArray(programs)) return false;
  const migratedPrograms = migratePrograms(programs).programs;
  if (migratedPrograms.some((program) => (
    !program
    || typeof program.id !== 'string'
    || !program.id.trim()
    || validateProgram(program).length > 0
  ))) return false;
  if (new Set(migratedPrograms.map((program) => program.id)).size !== migratedPrograms.length) return false;

  const nextPrograms = clone(migratedPrograms);
  writeStoredPrograms(nextPrograms);
  const includesBaseProgram = nextPrograms.some((program) => program.id === DEFAULT_PROGRAM.id);
  localStorage.setItem(BASE_PROGRAM_DELETED_KEY, String(!includesBaseProgram));
  const availablePrograms = getPrograms();
  const activeExists = availablePrograms.some((program) => program.id === activeProgramId);
  const fallbackId = availablePrograms[0]?.id;
  if (activeExists || fallbackId) localStorage.setItem(ACTIVE_PROGRAM_KEY, activeExists ? activeProgramId : fallbackId);
  else localStorage.removeItem(ACTIVE_PROGRAM_KEY);
  emitChange();
  return true;
}

// Program-only imports are additive: they leave the current library and the
// active program intact. New ids avoid collisions, while names are made unique
// so the user can easily distinguish imported copies.
export function appendPrograms(programs) {
  if (!Array.isArray(programs)) return false;
  const migratedPrograms = migratePrograms(programs).programs;
  if (migratedPrograms.some((program) => (
    !program
    || typeof program.id !== 'string'
    || !program.id.trim()
    || validateProgram(program).length > 0
  ))) return false;

  const existingNames = new Set(getPrograms().map((program) => normalizeProgramName(program.name)));
  const nextPrograms = readStoredPrograms();
  const usedIds = new Set(getPrograms().map((program) => program.id));

  migratedPrograms.forEach((program) => {
    const next = clone(program);
    next.name = makeUniqueProgramName(next.name, existingNames);
    existingNames.add(normalizeProgramName(next.name));

    do {
      next.id = makeId();
    } while (usedIds.has(next.id));
    usedIds.add(next.id);
    delete next.builtIn;
    nextPrograms.push(next);
  });

  writeStoredPrograms(nextPrograms);
  emitChange();
  return true;
}
