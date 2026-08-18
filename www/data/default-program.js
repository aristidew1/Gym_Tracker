import { getExerciseById, getExerciseDisplayName, getLocalizedExerciseName } from './exercises.js';
import { createIntensityTechnique } from './intensity-techniques.js';
import { localizeText, t } from '../i18n.js';

const prescription = (setCount, min, max, restSeconds, extras = {}) => ({
  setCount,
  repetitionRange: { min, max },
  segments: [{ type: 'working', setCount }],
  restSeconds,
  targetRir: extras.targetRir ?? null,
  targetRpe: extras.targetRpe ?? null,
  tempo: extras.tempo ?? null,
  progressionRuleId: extras.progressionRuleId ?? null,
});

const exercise = (id, exerciseId, setCount, min, max, restSeconds, extras = {}) => ({
  id,
  exerciseId,
  prescription: prescription(setCount, min, max, restSeconds, extras),
  intensityTechnique: extras.intensityTechnique || createIntensityTechnique('straight_sets'),
  note: extras.note || null,
});

const exerciseChoice = (id, name, exerciseOptions, setCount, min, max, restSeconds, extras = {}) => ({
  id,
  name,
  selection: { type: 'exercise', required: true, options: exerciseOptions.map((exerciseId) => ({ id: exerciseId })) },
  prescription: prescription(setCount, min, max, restSeconds, extras),
  intensityTechnique: extras.intensityTechnique || createIntensityTechnique('straight_sets'),
  note: extras.note || null,
});

const methodChoice = (id, exerciseId, name, methods, extras = {}) => ({
  id,
  exerciseId,
  name,
  selection: { type: 'method', required: true, options: methods },
  prescription: extras.prescription || prescription(1, 1, 1, 60),
  intensityTechnique: extras.intensityTechnique || createIntensityTechnique('straight_sets'),
  note: extras.note || null,
});

const block = (id, name, presentation, executionMode, restBetweenRoundsSeconds, items) => ({
  id,
  name,
  presentation,
  executionMode,
  rounds: 1,
  restBetweenExercisesSeconds: executionMode === 'superset' ? 0 : null,
  restBetweenRoundsSeconds,
  items,
});

// This preset is the former A/B/C/D cycle expressed with the generic schema.
export const DEFAULT_PROGRAM = {
  id: 'pullup_deadlift_cycle',
  schemaVersion: 4,
  name: 'Cycle tractions et deadlift',
  description: 'Cycle roulant A/B/C/D, un jour sur deux.',
  trainingFrequency: { mode: 'interval', intervalDays: 2 },
  sessionOrder: ['A', 'B', 'C', 'D'],
  sessions: {
    A: {
      id: 'A', name: 'Séance A', subtitle: 'Tractions force + dos / biceps', icon: '💪', color: '#4d7cff', colorRgb: '77, 124, 255',
      blocks: [
        block('a_strength', 'Bloc force', { label: '⚡ Force', badgeClass: 'force' }, 'sequential', 150, [
          exercise('tractions_lestees', 'weighted_pull_up', 5, 3, 5, 150, { targetRir: 2, progressionRuleId: 'double_progression', note: 'Quand tu fais 5×5 propre, ajoute +1 à +2,5 kg' }),
        ]),
        block('a_superset_1', 'Superset 1', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exercise('rowing_poulie', 'cable_row', 3, 8, 12, 75),
          exercise('curl_incline', 'incline_dumbbell_curl', 3, 10, 12, 75),
        ]),
        block('a_superset_2', 'Superset 2', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exercise('tirage_vertical_neutre', 'neutral_grip_lat_pulldown', 3, 10, 12, 75),
          exercise('face_pull_a', 'reverse_fly_machine', 3, 15, 20, 75),
        ]),
        block('a_superset_3', 'Superset 3', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exercise('curl_marteau', 'hammer_curl', 3, 10, 15, 75),
          exercise('gainage_suspendu', 'hanging_knee_raise', 3, 8, 15, 75),
        ]),
      ],
    },
    B: {
      id: 'B', name: 'Séance B', subtitle: 'Push + tractions faciles', icon: '🏋️', color: '#ff8a3d', colorRgb: '255, 138, 61',
      blocks: [
        block('b_strength', 'Bloc force', { label: '⚡ Force', badgeClass: 'force' }, 'sequential', 180, [
          exerciseChoice('bloc_force_b', 'Développé', ['barbell_bench_press', 'barbell_overhead_press'], 4, 3, 5, 180, { targetRir: 2, progressionRuleId: 'double_progression' }),
        ]),
        block('b_superset_1', 'Superset 1', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exercise('dev_incline_halteres', 'incline_dumbbell_press', 3, 8, 12, 75),
          exercise('elevations_laterales', 'dumbbell_lateral_raise', 3, 12, 20, 75),
        ]),
        block('b_superset_2', 'Superset 2', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exerciseChoice('dips_pompes_b', 'Dips ou pompes', ['dip', 'weighted_push_up'], 3, 8, 12, 75),
          exercise('extension_triceps', 'cable_triceps_extension', 3, 10, 15, 75),
        ]),
        block('b_pullups', 'Bloc traction facile', { label: '🎯 Traction', badgeClass: 'traction' }, 'sequential', 60, [
          exercise('tractions_pdc_b', 'pull_up', 6, 5, 9, 60, { targetRir: 3, note: '50-60% de ton max, volume propre sans échec' }),
        ]),
      ],
    },
    C: {
      id: 'C', name: 'Séance C', subtitle: 'Deadlift + traction technique', icon: '🔥', color: '#ff4d6a', colorRgb: '255, 77, 106',
      blocks: [
        block('c_strength', 'Bloc force', { label: '⚡ Force', badgeClass: 'force' }, 'sequential', 210, [
          exercise('deadlift', 'barbell_deadlift', 4, 3, 5, 210, { targetRir: 2, progressionRuleId: 'double_progression', note: 'Commence à 3 séries. Le deadlift fatigue fort.' }),
        ]),
        block('c_superset_1', 'Superset 1', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exercise('leg_curl', 'leg_curl', 3, 10, 15, 75),
          exercise('face_pull_c', 'reverse_fly_machine', 3, 15, 20, 75),
        ]),
        block('c_superset_2', 'Superset 2', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exerciseChoice('hip_thrust_back_ext', 'Hip thrust ou back ext.', ['hip_thrust', 'back_extension'], 3, 8, 12, 75),
          exercise('mollets_c', 'standing_calf_raise', 3, 12, 20, 75),
        ]),
        block('c_pullups', 'Bloc traction technique', { label: '🎯 Traction', badgeClass: 'traction' }, 'sequential', 90, [
          exercise('tractions_strictes', 'pull_up', 4, 4, 6, 90, { targetRir: 3, tempo: '2-0-3-0', note: 'Montée propre, descente contrôlée, amplitude complète' }),
        ]),
      ],
    },
    D: {
      id: 'D', name: 'Séance D', subtitle: 'Legs + tractions endurance', icon: '🦵', color: '#3ddc84', colorRgb: '61, 220, 132',
      blocks: [
        block('d_strength', 'Bloc force', { label: '⚡ Force', badgeClass: 'force' }, 'sequential', 180, [
          exerciseChoice('bloc_force_d', 'Squat ou Presse', ['barbell_back_squat', 'leg_press'], 4, 3, 5, 180, { targetRir: 2, progressionRuleId: 'double_progression' }),
        ]),
        block('d_pullups', 'Bloc traction endurance', { label: '🎯 Traction', badgeClass: 'traction' }, 'sequential', 60, [
          methodChoice('tractions_endurance', 'pull_up', 'Tractions endurance', [
            { id: 'emom', name: 'EMOM 10 min', description: 'Chaque minute, 3 à 6 tractions', prescription: prescription(10, 3, 6, 60), intensityTechnique: createIntensityTechnique('emom', { durationMinutes: 10 }) },
            { id: 'ladders', name: 'Ladders', description: '1→2→3→4→5 reps, 2 à 4 cycles', prescription: prescription(15, 1, 5, 60), intensityTechnique: createIntensityTechnique('straight_sets') },
            { id: 'volume', name: 'Volume simple', description: '30 à 50 tractions en plusieurs séries', prescription: prescription(8, 3, 8, 60), intensityTechnique: createIntensityTechnique('straight_sets') },
          ]),
        ]),
        block('d_superset_1', 'Superset 1', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exerciseChoice('fentes_split', 'Fentes ou split squat', ['lunge', 'split_squat'], 3, 8, 12, 75, { note: 'Par jambe' }),
          exercise('leg_extension', 'leg_extension', 3, 12, 15, 75),
        ]),
        block('d_superset_2', 'Superset 2', { label: '🔄 Superset', badgeClass: 'superset' }, 'superset', 75, [
          exercise('mollets_d', 'standing_calf_raise', 3, 12, 20, 75),
          exercise('abdos_gainage', 'plank', 3, 10, 20, 75),
        ]),
      ],
    },
  },
};

export function getSelectionOptions(item) {
  if (!item.selection) return [];
  return item.selection.options.map((option) => {
    if (item.selection.type === 'exercise') {
      return { ...option, name: getExerciseDisplayName(option.id) };
    }
    return { ...option, name: localizeText(option.name), description: localizeText(option.description) };
  });
}

export function getResolvedExercise(item, selectionId = null) {
  const selected = getSelectionOptions(item).find((option) => option.id === selectionId) || null;
  const exerciseId = item.selection?.type === 'exercise' ? selected?.id : item.exerciseId;
  const exercise = getExerciseById(exerciseId);
  const prescriptionValue = selected?.prescription || item.prescription;
  const intensityTechnique = selected?.intensityTechnique || item.intensityTechnique;
  const name = item.selection?.type === 'method' && selected
    ? `${localizeText(item.name)} — ${selected.name}`
    : getLocalizedExerciseName(exercise, localizeText(item.name) || t('unknownExercise'));

  return {
    programExerciseId: item.id,
    exerciseId: exerciseId || null,
    exercise,
    name,
    prescription: prescriptionValue,
    intensityTechnique,
    note: localizeText(selected?.description || item.note) || null,
  };
}

export function getProgramExerciseIds(program = DEFAULT_PROGRAM) {
  const ids = new Set();
  Object.values(program.sessions).forEach((session) => session.blocks.forEach((workoutBlock) => {
    workoutBlock.items.forEach((item) => {
      if (item.exerciseId) ids.add(item.exerciseId);
      getSelectionOptions(item).forEach((option) => {
        if (item.selection?.type === 'exercise') ids.add(option.id);
      });
    });
  }));
  return [...ids];
}
