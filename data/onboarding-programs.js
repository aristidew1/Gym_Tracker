const straightSets = () => ({ type: 'straight_sets' });

const prescription = (setCount, min, max, restSeconds, targetRir = 2) => ({
  setCount,
  repetitionRange: { min, max },
  segments: [{ type: 'working', setCount }],
  restSeconds,
  targetRir,
  targetRpe: null,
  tempo: null,
  progressionRuleId: 'double_progression',
});

const exercise = (id, exerciseId, setCount, min, max, restSeconds, targetRir = 2) => ({
  id,
  exerciseId,
  prescription: prescription(setCount, min, max, restSeconds, targetRir),
  intensityTechnique: straightSets(),
  note: null,
});

const block = (id, name, restSeconds, items) => ({
  id,
  name,
  presentation: { label: 'Séries classiques', badgeClass: 'hypertrophy' },
  executionMode: 'sequential',
  rounds: 1,
  restBetweenExercisesSeconds: 0,
  restBetweenRoundsSeconds: restSeconds,
  items,
});

const session = (id, name, subtitle, icon, color, colorRgb, items, restSeconds = 90) => ({
  id,
  name,
  subtitle,
  icon,
  color,
  colorRgb,
  blocks: [block(`${id}_main`, 'Corps de séance', restSeconds, items)],
});

const FULL_BODY_BEGINNER = {
  id: 'starter_full_body',
  schemaVersion: 4,
  name: 'Full body débutant',
  description: 'Deux séances simples à alterner, trois fois par semaine. Tous les grands mouvements sont couverts.',
  trainingFrequency: { mode: 'weekly', sessionsPerWeek: 3 },
  sessionOrder: ['full_body_a', 'full_body_b'],
  sessions: {
    full_body_a: session('full_body_a', 'Full body A', 'Bases : jambes, poussée et tirage', '🌱', '#4d7cff', '77, 124, 255', [
      exercise('fba_goblet_squat', 'goblet_squat', 3, 8, 12, 90, 3),
      exercise('fba_dumbbell_press', 'dumbbell_bench_press', 3, 8, 12, 90, 3),
      exercise('fba_cable_row', 'cable_row', 3, 8, 12, 90, 3),
      exercise('fba_romanian_deadlift', 'romanian_deadlift', 3, 8, 12, 90, 3),
      exercise('fba_plank', 'plank', 3, 30, 45, 60, 3),
    ]),
    full_body_b: session('full_body_b', 'Full body B', 'Machines et mouvements faciles à progresser', '🌿', '#3ddc84', '61, 220, 132', [
      exercise('fbb_leg_press', 'leg_press', 3, 10, 15, 90, 3),
      exercise('fbb_lat_pulldown', 'neutral_grip_lat_pulldown', 3, 8, 12, 90, 3),
      exercise('fbb_shoulder_press', 'dumbbell_shoulder_press', 3, 8, 12, 90, 3),
      exercise('fbb_hip_thrust', 'hip_thrust', 3, 8, 12, 90, 3),
      exercise('fbb_hammer_curl', 'hammer_curl', 2, 10, 15, 60, 3),
    ]),
  },
};

const UPPER_LOWER_HYPERTROPHY = {
  id: 'upper_lower_hypertrophy',
  schemaVersion: 4,
  name: 'Haut/Bas hypertrophie',
  description: 'Quatre séances équilibrées pour développer tout le corps avec un volume modéré.',
  trainingFrequency: { mode: 'weekly', sessionsPerWeek: 4 },
  sessionOrder: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
  sessions: {
    upper_a: session('upper_a', 'Haut A', 'Pectoraux et dos en priorité', '🏋️', '#ff8a3d', '255, 138, 61', [
      exercise('ua_bench_press', 'barbell_bench_press', 4, 6, 10, 120),
      exercise('ua_cable_row', 'cable_row', 4, 8, 12, 90),
      exercise('ua_incline_press', 'incline_dumbbell_press', 3, 8, 12, 90),
      exercise('ua_lat_pulldown', 'neutral_grip_lat_pulldown', 3, 8, 12, 90),
      exercise('ua_lateral_raise', 'dumbbell_lateral_raise', 3, 12, 20, 60),
    ]),
    lower_a: session('lower_a', 'Bas A', 'Quadriceps et chaîne postérieure', '🦵', '#3ddc84', '61, 220, 132', [
      exercise('la_back_squat', 'barbell_back_squat', 4, 6, 10, 150),
      exercise('la_romanian_deadlift', 'romanian_deadlift', 4, 8, 12, 120),
      exercise('la_leg_press', 'leg_press', 3, 10, 15, 90),
      exercise('la_leg_curl', 'leg_curl', 3, 10, 15, 75),
      exercise('la_calf_raise', 'standing_calf_raise', 3, 12, 20, 60),
    ], 120),
    upper_b: session('upper_b', 'Haut B', 'Épaules, dos et bras', '💪', '#4d7cff', '77, 124, 255', [
      exercise('ub_overhead_press', 'barbell_overhead_press', 4, 6, 10, 120),
      exercise('ub_chest_row', 'chest_supported_row', 4, 8, 12, 90),
      exercise('ub_dumbbell_press', 'dumbbell_bench_press', 3, 8, 12, 90),
      exercise('ub_wide_pulldown', 'wide_grip_lat_pulldown', 3, 8, 12, 90),
      exercise('ub_curl', 'incline_dumbbell_curl', 3, 10, 15, 60),
      exercise('ub_triceps', 'cable_triceps_extension', 3, 10, 15, 60),
    ]),
    lower_b: session('lower_b', 'Bas B', 'Fessiers et jambes complètes', '🔥', '#ff4d6a', '255, 77, 106', [
      exercise('lb_deadlift', 'barbell_deadlift', 3, 4, 6, 180),
      exercise('lb_hack_squat', 'hack_squat', 4, 8, 12, 120),
      exercise('lb_hip_thrust', 'hip_thrust', 3, 8, 12, 90),
      exercise('lb_leg_extension', 'leg_extension', 3, 12, 15, 75),
      exercise('lb_leg_curl', 'leg_curl', 3, 10, 15, 75),
    ], 120),
  },
};

const TEMPLATES = {
  [FULL_BODY_BEGINNER.id]: FULL_BODY_BEGINNER,
  [UPPER_LOWER_HYPERTROPHY.id]: UPPER_LOWER_HYPERTROPHY,
};

export const ONBOARDING_PROGRAM_TEMPLATE_IDS = Object.freeze(Object.keys(TEMPLATES));

export function getOnboardingProgramTemplate(id) {
  const template = TEMPLATES[id];
  return template ? structuredClone(template) : null;
}
