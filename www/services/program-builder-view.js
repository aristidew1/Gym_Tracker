import { getLanguage } from '../i18n.js';

export function createBuilderDisclosureState(program, { isNew = false } = {}) {
  const firstSessionId = program?.sessionOrder?.[0] || null;
  const firstBlockId = firstSessionId ? program.sessions?.[firstSessionId]?.blocks?.[0]?.id : null;
  return {
    programInfoOpen: isNew,
    sessionSettingsOpen: new Set(isNew && firstSessionId ? [firstSessionId] : []),
    openBlocks: new Set(isNew && firstBlockId ? [firstBlockId] : []),
    openItems: new Set(),
    openAdvancedItems: new Set(),
  };
}

export function toggleDisclosure(values, id) {
  const next = new Set(values);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatPrescriptionSummary(item) {
  const prescription = item?.prescription || {};
  const setCount = finiteNumber(prescription.setCount);
  const min = finiteNumber(prescription.repetitionRange?.min);
  const max = finiteNumber(prescription.repetitionRange?.max);
  const rest = finiteNumber(prescription.restSeconds);
  const rir = finiteNumber(prescription.targetRir);
  const rpe = finiteNumber(prescription.targetRpe);
  const parts = [];

  if (setCount !== null && min !== null && max !== null) {
    parts.push(`${setCount} × ${min === max ? min : `${min}–${max}`}`);
  } else if (setCount !== null) {
    parts.push(`${setCount} ×`);
  }
  if (rest !== null && rest > 0) parts.push(`${rest} s`);
  if (rir !== null) parts.push(`RIR ${rir}`);
  else if (rpe !== null) parts.push(`RPE ${rpe}`);
  return parts.join(' · ');
}

export function formatBlockSummary(block, language = getLanguage()) {
  const isEnglish = language === 'en';
  const modeNames = isEnglish
    ? { sequential: 'Sequential', superset: 'Superset', circuit: 'Circuit' }
    : { sequential: 'Séquentiel', superset: 'Superset', circuit: 'Circuit' };
  const itemCount = Array.isArray(block?.items) ? block.items.length : 0;
  const rounds = Math.max(1, finiteNumber(block?.rounds) || 1);
  const rest = finiteNumber(block?.restBetweenRoundsSeconds);
  const parts = [modeNames[block?.executionMode] || modeNames.sequential];
  parts.push(isEnglish
    ? `${itemCount} ${itemCount === 1 ? 'exercise' : 'exercises'}`
    : `${itemCount} ${itemCount === 1 ? 'exercice' : 'exercices'}`);
  if (rounds > 1) parts.push(`${rounds} rounds`);
  if (rest !== null && rest > 0) parts.push(`${rest} s`);
  return parts.join(' · ');
}
