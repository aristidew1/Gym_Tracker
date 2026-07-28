// Technique definitions are data, allowing programs to use them without UI-specific branches.

import { getLanguage } from '../i18n.js';

export const INTENSITY_TECHNIQUES = [
  { id: 'straight_sets', name: 'Séries classiques', parameters: {}, defaults: {} },
  { id: 'superset', name: 'Superset', parameters: { restBetweenExercisesSeconds: 'number' }, defaults: { restBetweenExercisesSeconds: 0 } },
  { id: 'drop_set', name: 'Drop set', parameters: { drops: 'number', loadReductionPercent: 'number', target: 'string' }, defaults: { drops: 2, loadReductionPercent: 20, target: 'technical_failure' } },
  { id: 'rest_pause', name: 'Rest-pause', parameters: { pauses: 'number', pauseSeconds: 'number' }, defaults: { pauses: 2, pauseSeconds: 20 } },
  { id: 'myo_reps', name: 'Myo-reps', parameters: { activationReps: 'number', miniSetReps: 'number', restSeconds: 'number' }, defaults: { activationReps: 15, miniSetReps: 4, restSeconds: 15 } },
  { id: 'cluster', name: 'Cluster set', parameters: { clusterSize: 'number', intraSetRestSeconds: 'number' }, defaults: { clusterSize: 2, intraSetRestSeconds: 20 } },
  { id: 'giant_set', name: 'Giant set', parameters: { exercises: 'number' }, defaults: { exercises: 3 } },
  { id: 'emom', name: 'EMOM', parameters: { durationMinutes: 'number' }, defaults: { durationMinutes: 10 } },
  { id: 'amrap', name: 'AMRAP', parameters: { durationMinutes: 'number' }, defaults: { durationMinutes: 10 } },
  { id: 'tempo', name: 'Tempo', parameters: { tempo: 'string' }, defaults: { tempo: '3-1-1-0' } },
  { id: 'partial_reps', name: 'Répétitions partielles', parameters: { partialReps: 'number' }, defaults: { partialReps: 3 } },
];

const TECHNIQUE_BY_ID = new Map(INTENSITY_TECHNIQUES.map((technique) => [technique.id, technique]));

export function getIntensityTechnique(id) {
  const technique = TECHNIQUE_BY_ID.get(id) || null;
  if (!technique || getLanguage() !== 'en') return technique;
  const names = { straight_sets: 'Straight sets', superset: 'Superset', drop_set: 'Drop set', rest_pause: 'Rest-pause', myo_reps: 'Myo-reps', cluster: 'Cluster set', giant_set: 'Giant set', emom: 'EMOM', amrap: 'AMRAP', tempo: 'Tempo', partial_reps: 'Partial reps' };
  return { ...technique, name: names[id] || technique.name };
}

export function createIntensityTechnique(type, config = {}) {
  const definition = getIntensityTechnique(type);
  if (!definition) throw new Error(`Technique d'intensification inconnue : ${type}`);
  return { type, ...definition.defaults, ...config };
}

export function validateIntensityTechnique(technique) {
  if (!technique || !getIntensityTechnique(technique.type)) return false;
  return Object.entries(technique).every(([key, value]) => {
    if (key === 'type') return true;
    return value !== undefined && value !== null;
  });
}
