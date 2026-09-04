// Canonical exercise catalogue. Programs only reference these stable IDs.

import { getLanguage, t } from '../i18n.js';
import { getCustomExerciseById, getCustomExercises } from '../services/custom-exercises.js';

export const EXERCISES = [
  { id: 'weighted_pull_up', name: 'Tractions lestées', category: 'strength', movementPattern: 'vertical_pull', primaryMuscles: ['lats', 'biceps'], secondaryMuscles: ['upper_back', 'forearms'], equipment: ['pullup_bar', 'weight_belt'], level: 'intermediate', unilateral: false, tags: ['compound', 'bodyweight'], color: '#4d7cff' },
  { id: 'pull_up', name: 'Tractions au poids du corps', category: 'strength', movementPattern: 'vertical_pull', primaryMuscles: ['lats', 'biceps'], secondaryMuscles: ['upper_back', 'forearms'], equipment: ['pullup_bar'], level: 'beginner', unilateral: false, tags: ['compound', 'bodyweight'], color: '#4d7cff' },
  { id: 'cable_row', name: 'Rowing poulie', category: 'strength', movementPattern: 'horizontal_pull', primaryMuscles: ['middle_back', 'lats'], secondaryMuscles: ['biceps'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#4d7cff' },
  { id: 'incline_dumbbell_curl', name: 'Curl incliné', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: true, tags: ['isolation', 'free_weight'], color: '#4d7cff' },
  { id: 'neutral_grip_lat_pulldown', name: 'Tirage vertical prise neutre', category: 'strength', movementPattern: 'vertical_pull', primaryMuscles: ['lats'], secondaryMuscles: ['biceps'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#4d7cff' },
  { id: 'reverse_fly_machine', name: 'Machine arrière épaule', category: 'strength', movementPattern: 'horizontal_abduction', primaryMuscles: ['rear_delts'], secondaryMuscles: ['upper_back'], equipment: ['reverse_fly_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#4d7cff' },
  { id: 'hammer_curl', name: 'Curl marteau', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['brachialis', 'biceps'], secondaryMuscles: ['forearms'], equipment: ['dumbbells'], level: 'beginner', unilateral: true, tags: ['isolation', 'free_weight'], color: '#4d7cff' },
  { id: 'hanging_knee_raise', name: 'Gainage suspendu / relevés de genoux', category: 'strength', movementPattern: 'trunk_flexion', primaryMuscles: ['abs'], secondaryMuscles: ['hip_flexors'], equipment: ['pullup_bar'], level: 'beginner', unilateral: false, tags: ['bodyweight'], color: '#4d7cff' },
  { id: 'barbell_bench_press', name: 'Développé couché', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps'], secondaryMuscles: ['front_delts'], equipment: ['barbell', 'bench', 'plates'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'barbell_overhead_press', name: 'Développé militaire', category: 'strength', movementPattern: 'vertical_push', primaryMuscles: ['front_delts', 'triceps'], secondaryMuscles: ['upper_chest'], equipment: ['barbell', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'incline_dumbbell_press', name: 'Développé incliné haltères', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['upper_chest', 'triceps'], secondaryMuscles: ['front_delts'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'dumbbell_lateral_raise', name: 'Élévations latérales', category: 'strength', movementPattern: 'shoulder_abduction', primaryMuscles: ['side_delts'], secondaryMuscles: [], equipment: ['dumbbells'], level: 'beginner', unilateral: true, tags: ['isolation', 'free_weight'], color: '#ff8a3d' },
  { id: 'dip', name: 'Dips', category: 'strength', movementPattern: 'vertical_push', primaryMuscles: ['chest', 'triceps'], secondaryMuscles: ['front_delts'], equipment: ['dip_bars'], level: 'intermediate', unilateral: false, tags: ['compound', 'bodyweight'], color: '#ff8a3d' },
  { id: 'weighted_push_up', name: 'Pompes lestées', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps'], secondaryMuscles: ['front_delts'], equipment: ['floor', 'weight_plate'], level: 'beginner', unilateral: false, tags: ['compound', 'bodyweight'], color: '#ff8a3d' },
  { id: 'cable_triceps_extension', name: 'Extension triceps poulie', category: 'strength', movementPattern: 'elbow_extension', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff8a3d' },
  { id: 'barbell_deadlift', name: 'Deadlift', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['hamstrings', 'glutes', 'lower_back'], secondaryMuscles: ['lats', 'forearms'], equipment: ['barbell', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff4d6a' },
  { id: 'leg_curl', name: 'Leg curl', category: 'strength', movementPattern: 'knee_flexion', primaryMuscles: ['hamstrings'], secondaryMuscles: [], equipment: ['leg_curl_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff4d6a' },
  { id: 'hip_thrust', name: 'Hip thrust', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: ['barbell', 'bench', 'plates'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff4d6a' },
  { id: 'back_extension', name: 'Back extension', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['lower_back', 'glutes'], secondaryMuscles: ['hamstrings'], equipment: ['back_extension_bench'], level: 'beginner', unilateral: false, tags: ['bodyweight'], color: '#ff4d6a' },
  { id: 'standing_calf_raise', name: 'Mollets', category: 'strength', movementPattern: 'plantar_flexion', primaryMuscles: ['calves'], secondaryMuscles: [], equipment: ['calf_raise_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff4d6a' },
  { id: 'barbell_back_squat', name: 'Squat', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['core'], equipment: ['barbell', 'rack', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'leg_press', name: 'Presse lourde', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings'], equipment: ['leg_press_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#3ddc84' },
  { id: 'lunge', name: 'Fentes', category: 'strength', movementPattern: 'lunge', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings'], equipment: ['dumbbells'], level: 'beginner', unilateral: true, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'split_squat', name: 'Split squat', category: 'strength', movementPattern: 'lunge', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings'], equipment: ['dumbbells'], level: 'beginner', unilateral: true, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'leg_extension', name: 'Leg extension', category: 'strength', movementPattern: 'knee_extension', primaryMuscles: ['quads'], secondaryMuscles: [], equipment: ['leg_extension_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#3ddc84' },
  { id: 'plank', name: 'Abdos / gainage', category: 'strength', movementPattern: 'anti_extension', primaryMuscles: ['abs', 'core'], secondaryMuscles: [], equipment: ['floor'], level: 'beginner', unilateral: false, tags: ['bodyweight'], color: '#3ddc84' },
  { id: 'dumbbell_row', name: 'Rowing haltère', category: 'strength', movementPattern: 'horizontal_pull', primaryMuscles: ['lats', 'middle_back'], secondaryMuscles: ['biceps'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: true, tags: ['compound', 'free_weight'], color: '#4d7cff' },
  { id: 'goblet_squat', name: 'Goblet squat', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['core'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'romanian_deadlift', name: 'Soulevé de terre roumain', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['lower_back'], equipment: ['barbell', 'plates'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff4d6a' },
  { id: 'dumbbell_floor_press', name: 'Développé haltères au sol', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps'], secondaryMuscles: ['front_delts'], equipment: ['dumbbells', 'floor'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'chin_up', name: 'Tractions supination', category: 'strength', movementPattern: 'vertical_pull', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'upper_back'], equipment: ['pullup_bar'], level: 'beginner', unilateral: false, tags: ['compound', 'bodyweight'], color: '#4d7cff' },
  { id: 'assisted_pull_up', name: 'Tractions assistées', category: 'strength', movementPattern: 'vertical_pull', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'upper_back'], equipment: ['assisted_pullup_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#4d7cff' },
  { id: 'wide_grip_lat_pulldown', name: 'Tirage vertical prise large', category: 'strength', movementPattern: 'vertical_pull', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'upper_back'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#4d7cff' },
  { id: 'close_grip_lat_pulldown', name: 'Tirage vertical prise serrée', category: 'strength', movementPattern: 'vertical_pull', primaryMuscles: ['lats'], secondaryMuscles: ['biceps'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#4d7cff' },
  { id: 'straight_arm_pulldown', name: 'Pull-over à la poulie', category: 'strength', movementPattern: 'shoulder_extension', primaryMuscles: ['lats'], secondaryMuscles: ['triceps'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#4d7cff' },
  { id: 'barbell_row', name: 'Rowing barre', category: 'strength', movementPattern: 'horizontal_pull', primaryMuscles: ['middle_back'], secondaryMuscles: ['lats', 'biceps'], equipment: ['barbell', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#4d7cff' },
  { id: 'chest_supported_row', name: 'Rowing poitrine sur banc', category: 'strength', movementPattern: 'horizontal_pull', primaryMuscles: ['middle_back'], secondaryMuscles: ['lats', 'biceps'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#4d7cff' },
  { id: 't_bar_row', name: 'Rowing T-bar', category: 'strength', movementPattern: 'horizontal_pull', primaryMuscles: ['middle_back'], secondaryMuscles: ['lats', 'biceps'], equipment: ['t_bar_machine'], level: 'intermediate', unilateral: false, tags: ['compound', 'machine'], color: '#4d7cff' },
  { id: 'machine_row', name: 'Rowing machine convergente', category: 'strength', movementPattern: 'horizontal_pull', primaryMuscles: ['middle_back'], secondaryMuscles: ['lats', 'biceps'], equipment: ['row_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#4d7cff' },
  { id: 'inverted_row', name: 'Rowing inversé', category: 'strength', movementPattern: 'horizontal_pull', primaryMuscles: ['middle_back'], secondaryMuscles: ['lats', 'biceps'], equipment: ['barbell', 'rack'], level: 'beginner', unilateral: false, tags: ['compound', 'bodyweight'], color: '#4d7cff' },
  { id: 'dumbbell_pullover', name: 'Pull-over haltère', category: 'strength', movementPattern: 'shoulder_extension', primaryMuscles: ['lats'], secondaryMuscles: ['chest', 'triceps'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#4d7cff' },
  { id: 'barbell_shrug', name: 'Shrugs barre', category: 'strength', movementPattern: 'scapular_elevation', primaryMuscles: ['upper_back'], secondaryMuscles: ['forearms'], equipment: ['barbell', 'plates'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#4d7cff' },
  { id: 'dumbbell_bench_press', name: 'Développé couché haltères', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'incline_barbell_press', name: 'Développé incliné barre', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['upper_chest'], secondaryMuscles: ['triceps', 'front_delts'], equipment: ['barbell', 'bench', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'decline_bench_press', name: 'Développé décliné', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: ['barbell', 'decline_bench', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'chest_press_machine', name: 'Développé convergent machine', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], equipment: ['chest_press_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#ff8a3d' },
  { id: 'push_up', name: 'Pompes', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], equipment: ['floor'], level: 'beginner', unilateral: false, tags: ['compound', 'bodyweight'], color: '#ff8a3d' },
  { id: 'cable_fly', name: 'Écartés à la poulie', category: 'strength', movementPattern: 'horizontal_adduction', primaryMuscles: ['chest'], secondaryMuscles: ['front_delts'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff8a3d' },
  { id: 'low_to_high_cable_fly', name: 'Écartés poulie basse', category: 'strength', movementPattern: 'horizontal_adduction', primaryMuscles: ['upper_chest'], secondaryMuscles: ['front_delts'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff8a3d' },
  { id: 'pec_deck', name: 'Pec deck', category: 'strength', movementPattern: 'horizontal_adduction', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: ['pec_deck_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff8a3d' },
  { id: 'dumbbell_fly', name: 'Écartés haltères', category: 'strength', movementPattern: 'horizontal_adduction', primaryMuscles: ['chest'], secondaryMuscles: ['front_delts'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#ff8a3d' },
  { id: 'dumbbell_shoulder_press', name: 'Développé épaules haltères', category: 'strength', movementPattern: 'vertical_push', primaryMuscles: ['front_delts'], secondaryMuscles: ['triceps', 'side_delts'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#e7c65c' },
  { id: 'arnold_press', name: 'Développé Arnold', category: 'strength', movementPattern: 'vertical_push', primaryMuscles: ['front_delts'], secondaryMuscles: ['side_delts', 'triceps'], equipment: ['dumbbells', 'bench'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#e7c65c' },
  { id: 'shoulder_press_machine', name: 'Développé épaules machine', category: 'strength', movementPattern: 'vertical_push', primaryMuscles: ['front_delts'], secondaryMuscles: ['triceps', 'side_delts'], equipment: ['shoulder_press_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#e7c65c' },
  { id: 'cable_lateral_raise', name: 'Élévations latérales poulie', category: 'strength', movementPattern: 'shoulder_abduction', primaryMuscles: ['side_delts'], secondaryMuscles: [], equipment: ['cable_machine'], level: 'beginner', unilateral: true, tags: ['isolation', 'machine'], color: '#e7c65c' },
  { id: 'machine_lateral_raise', name: 'Élévations latérales machine', category: 'strength', movementPattern: 'shoulder_abduction', primaryMuscles: ['side_delts'], secondaryMuscles: [], equipment: ['lateral_raise_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#e7c65c' },
  { id: 'dumbbell_front_raise', name: 'Élévations frontales', category: 'strength', movementPattern: 'shoulder_flexion', primaryMuscles: ['front_delts'], secondaryMuscles: [], equipment: ['dumbbells'], level: 'beginner', unilateral: true, tags: ['isolation', 'free_weight'], color: '#e7c65c' },
  { id: 'dumbbell_reverse_fly', name: 'Oiseau haltères', category: 'strength', movementPattern: 'horizontal_abduction', primaryMuscles: ['rear_delts'], secondaryMuscles: ['upper_back'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#e7c65c' },
  { id: 'face_pull', name: 'Face pull', category: 'strength', movementPattern: 'horizontal_abduction', primaryMuscles: ['rear_delts'], secondaryMuscles: ['upper_back'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#e7c65c' },
  { id: 'barbell_upright_row', name: 'Tirage menton', category: 'strength', movementPattern: 'shoulder_abduction', primaryMuscles: ['side_delts'], secondaryMuscles: ['upper_back', 'biceps'], equipment: ['barbell', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#e7c65c' },
  { id: 'barbell_curl', name: 'Curl barre droite', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: ['barbell', 'plates'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'ez_bar_curl', name: 'Curl barre EZ', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: ['ez_bar', 'plates'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'preacher_curl', name: 'Curl pupitre', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: ['ez_bar', 'preacher_bench'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'cable_curl', name: 'Curl poulie basse', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#45c4d9' },
  { id: 'concentration_curl', name: 'Curl concentration', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: true, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'spider_curl', name: 'Spider curl', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: ['dumbbells', 'bench'], level: 'intermediate', unilateral: false, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'bayesian_curl', name: 'Curl bayésien', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: ['cable_machine'], level: 'intermediate', unilateral: true, tags: ['isolation', 'machine'], color: '#45c4d9' },
  { id: 'reverse_curl', name: 'Curl inversé', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['brachialis'], secondaryMuscles: ['forearms', 'biceps'], equipment: ['ez_bar', 'plates'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'rope_pushdown', name: 'Extension triceps corde', category: 'strength', movementPattern: 'elbow_extension', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff4d6a' },
  { id: 'overhead_cable_extension', name: 'Extension triceps au-dessus de la tête', category: 'strength', movementPattern: 'elbow_extension', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff4d6a' },
  { id: 'skull_crusher', name: 'Barre au front', category: 'strength', movementPattern: 'elbow_extension', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: ['ez_bar', 'bench', 'plates'], level: 'intermediate', unilateral: false, tags: ['isolation', 'free_weight'], color: '#ff4d6a' },
  { id: 'close_grip_bench_press', name: 'Développé couché prise serrée', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['triceps'], secondaryMuscles: ['chest', 'front_delts'], equipment: ['barbell', 'bench', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff4d6a' },
  { id: 'dumbbell_triceps_kickback', name: 'Kickback triceps', category: 'strength', movementPattern: 'elbow_extension', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: true, tags: ['isolation', 'free_weight'], color: '#ff4d6a' },
  { id: 'bench_dip', name: 'Dips entre deux bancs', category: 'strength', movementPattern: 'elbow_extension', primaryMuscles: ['triceps'], secondaryMuscles: ['chest', 'front_delts'], equipment: ['bench'], level: 'beginner', unilateral: false, tags: ['compound', 'bodyweight'], color: '#ff4d6a' },
  { id: 'front_squat', name: 'Front squat', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'core'], equipment: ['barbell', 'rack', 'plates'], level: 'advanced', unilateral: false, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'hack_squat', name: 'Hack squat', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: ['hack_squat_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#3ddc84' },
  { id: 'bulgarian_split_squat', name: 'Fentes bulgares', category: 'strength', movementPattern: 'lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'hamstrings'], equipment: ['dumbbells', 'bench'], level: 'intermediate', unilateral: true, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'step_up', name: 'Montées sur banc', category: 'strength', movementPattern: 'lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: true, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'pendulum_squat', name: 'Pendulum squat', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: ['pendulum_squat_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#3ddc84' },
  { id: 'sissy_squat', name: 'Sissy squat', category: 'strength', movementPattern: 'knee_extension', primaryMuscles: ['quads'], secondaryMuscles: [], equipment: ['bodyweight'], level: 'advanced', unilateral: false, tags: ['isolation', 'bodyweight'], color: '#3ddc84' },
  { id: 'single_leg_press', name: 'Presse à une jambe', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: ['leg_press_machine'], level: 'beginner', unilateral: true, tags: ['compound', 'machine'], color: '#3ddc84' },
  { id: 'stiff_leg_deadlift', name: 'Soulevé de terre jambes tendues', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'lower_back'], equipment: ['barbell', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'sumo_deadlift', name: 'Soulevé de terre sumo', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'quads'], equipment: ['barbell', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'good_morning', name: 'Good morning', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'lower_back'], equipment: ['barbell', 'rack', 'plates'], level: 'advanced', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'glute_bridge', name: 'Glute bridge', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: ['floor', 'barbell', 'plates'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'nordic_curl', name: 'Nordic curl', category: 'strength', movementPattern: 'knee_flexion', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes'], equipment: ['nordic_bench'], level: 'advanced', unilateral: false, tags: ['isolation', 'bodyweight'], color: '#ff8a3d' },
  { id: 'seated_leg_curl', name: 'Leg curl assis', category: 'strength', movementPattern: 'knee_flexion', primaryMuscles: ['hamstrings'], secondaryMuscles: [], equipment: ['seated_leg_curl_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#ff8a3d' },
  { id: 'single_leg_curl', name: 'Leg curl unilatéral', category: 'strength', movementPattern: 'knee_flexion', primaryMuscles: ['hamstrings'], secondaryMuscles: [], equipment: ['leg_curl_machine'], level: 'beginner', unilateral: true, tags: ['isolation', 'machine'], color: '#ff8a3d' },
  { id: 'cable_pull_through', name: 'Pull-through à la poulie', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['compound', 'machine'], color: '#ff8a3d' },
  { id: 'seated_calf_raise', name: 'Mollets assis', category: 'strength', movementPattern: 'plantar_flexion', primaryMuscles: ['calves'], secondaryMuscles: [], equipment: ['seated_calf_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#e7c65c' },
  { id: 'leg_press_calf_raise', name: 'Mollets à la presse', category: 'strength', movementPattern: 'plantar_flexion', primaryMuscles: ['calves'], secondaryMuscles: [], equipment: ['leg_press_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#e7c65c' },
  { id: 'single_leg_calf_raise', name: 'Mollets debout unilatéral', category: 'strength', movementPattern: 'plantar_flexion', primaryMuscles: ['calves'], secondaryMuscles: [], equipment: ['bodyweight'], level: 'beginner', unilateral: true, tags: ['isolation', 'bodyweight'], color: '#e7c65c' },
  { id: 'donkey_calf_raise', name: 'Donkey calf raise', category: 'strength', movementPattern: 'plantar_flexion', primaryMuscles: ['calves'], secondaryMuscles: [], equipment: ['donkey_calf_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#e7c65c' },
  { id: 'crunch', name: 'Crunch', category: 'strength', movementPattern: 'trunk_flexion', primaryMuscles: ['abs'], secondaryMuscles: [], equipment: ['floor'], level: 'beginner', unilateral: false, tags: ['isolation', 'bodyweight'], color: '#45c4d9' },
  { id: 'cable_crunch', name: 'Crunch à la poulie', category: 'strength', movementPattern: 'trunk_flexion', primaryMuscles: ['abs'], secondaryMuscles: [], equipment: ['cable_machine'], level: 'beginner', unilateral: false, tags: ['isolation', 'machine'], color: '#45c4d9' },
  { id: 'ab_wheel', name: 'Roue abdominale', category: 'strength', movementPattern: 'anti_extension', primaryMuscles: ['abs'], secondaryMuscles: ['core', 'lats'], equipment: ['ab_wheel'], level: 'intermediate', unilateral: false, tags: ['compound', 'bodyweight'], color: '#45c4d9' },
  { id: 'hanging_leg_raise', name: 'Relevés de jambes suspendu', category: 'strength', movementPattern: 'trunk_flexion', primaryMuscles: ['abs'], secondaryMuscles: ['hip_flexors'], equipment: ['pullup_bar'], level: 'intermediate', unilateral: false, tags: ['compound', 'bodyweight'], color: '#45c4d9' },
  { id: 'reverse_crunch', name: 'Crunch inversé', category: 'strength', movementPattern: 'trunk_flexion', primaryMuscles: ['abs'], secondaryMuscles: ['hip_flexors'], equipment: ['floor'], level: 'beginner', unilateral: false, tags: ['isolation', 'bodyweight'], color: '#45c4d9' },
  { id: 'russian_twist', name: 'Russian twist', category: 'strength', movementPattern: 'rotation', primaryMuscles: ['obliques'], secondaryMuscles: ['abs'], equipment: ['weight_plate'], level: 'beginner', unilateral: false, tags: ['bodyweight'], color: '#45c4d9' },
  { id: 'pallof_press', name: 'Pallof press', category: 'strength', movementPattern: 'anti_rotation', primaryMuscles: ['core'], secondaryMuscles: ['obliques'], equipment: ['cable_machine'], level: 'beginner', unilateral: true, tags: ['isolation', 'machine'], color: '#45c4d9' },
  { id: 'side_plank', name: 'Gainage latéral', category: 'strength', movementPattern: 'anti_lateral_flexion', primaryMuscles: ['obliques'], secondaryMuscles: ['core'], equipment: ['floor'], level: 'beginner', unilateral: true, tags: ['bodyweight'], color: '#45c4d9' },
  { id: 'dead_bug', name: 'Dead bug', category: 'strength', movementPattern: 'anti_extension', primaryMuscles: ['core'], secondaryMuscles: ['abs'], equipment: ['floor'], level: 'beginner', unilateral: true, tags: ['bodyweight'], color: '#45c4d9' },
  { id: 'wrist_curl', name: 'Flexions de poignets', category: 'strength', movementPattern: 'wrist_flexion', primaryMuscles: ['forearms'], secondaryMuscles: [], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#e7c65c' },
  { id: 'reverse_wrist_curl', name: 'Extensions de poignets', category: 'strength', movementPattern: 'wrist_extension', primaryMuscles: ['forearms'], secondaryMuscles: [], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#e7c65c' },
  { id: 'farmer_carry', name: 'Farmer walk', category: 'strength', movementPattern: 'carry', primaryMuscles: ['forearms'], secondaryMuscles: ['upper_back', 'core'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#e7c65c' },
  { id: 'dead_hang', name: 'Suspension passive', category: 'strength', movementPattern: 'grip', primaryMuscles: ['forearms'], secondaryMuscles: ['lats'], equipment: ['pullup_bar'], level: 'beginner', unilateral: false, tags: ['isolation', 'bodyweight'], color: '#e7c65c' },
  { id: 'dumbbell_deadlift', name: 'Soulevé de terre haltères', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['hamstrings', 'glutes', 'lower_back'], secondaryMuscles: ['lats', 'forearms'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff4d6a' },
  { id: 'dumbbell_romanian_deadlift', name: 'Soulevé de terre roumain haltères', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['lower_back'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff4d6a' },
  { id: 'dumbbell_stiff_leg_deadlift', name: 'Soulevé de terre jambes tendues haltères', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'lower_back'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'dumbbell_sumo_deadlift', name: 'Soulevé de terre sumo haltère', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'quads'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'dumbbell_good_morning', name: 'Good morning haltère', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'lower_back'], equipment: ['dumbbells'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'dumbbell_hip_thrust', name: 'Hip thrust haltère', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: ['dumbbells', 'bench'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff4d6a' },
  { id: 'dumbbell_glute_bridge', name: 'Glute bridge haltère', category: 'strength', movementPattern: 'hinge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: ['dumbbells', 'floor'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'dumbbell_shrug', name: 'Shrugs haltères', category: 'strength', movementPattern: 'scapular_elevation', primaryMuscles: ['upper_back'], secondaryMuscles: ['forearms'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#4d7cff' },
  { id: 'dumbbell_curl', name: 'Curl haltères', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: ['dumbbells'], level: 'beginner', unilateral: true, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'dumbbell_upright_row', name: 'Tirage menton haltères', category: 'strength', movementPattern: 'shoulder_abduction', primaryMuscles: ['side_delts'], secondaryMuscles: ['upper_back', 'biceps'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#e7c65c' },
  { id: 'dumbbell_squat', name: 'Squat haltères', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['core'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'dumbbell_front_squat', name: 'Front squat haltères', category: 'strength', movementPattern: 'squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'core'], equipment: ['dumbbells'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'barbell_lunge', name: 'Fentes à la barre', category: 'strength', movementPattern: 'lunge', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings'], equipment: ['barbell', 'rack', 'plates'], level: 'intermediate', unilateral: true, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'barbell_split_squat', name: 'Split squat à la barre', category: 'strength', movementPattern: 'lunge', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings'], equipment: ['barbell', 'rack', 'plates'], level: 'intermediate', unilateral: true, tags: ['compound', 'free_weight'], color: '#3ddc84' },
  { id: 'barbell_floor_press', name: 'Développé à la barre au sol', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps'], secondaryMuscles: ['front_delts'], equipment: ['barbell', 'floor', 'plates'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'decline_dumbbell_press', name: 'Développé décliné haltères', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], equipment: ['dumbbells', 'decline_bench'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff8a3d' },
  { id: 'dumbbell_close_grip_bench_press', name: 'Développé couché prise serrée haltères', category: 'strength', movementPattern: 'horizontal_push', primaryMuscles: ['triceps'], secondaryMuscles: ['chest', 'front_delts'], equipment: ['dumbbells', 'bench'], level: 'intermediate', unilateral: false, tags: ['compound', 'free_weight'], color: '#ff4d6a' },
  { id: 'dumbbell_skull_crusher', name: 'Barre au front haltères', category: 'strength', movementPattern: 'elbow_extension', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: ['dumbbells', 'bench'], level: 'intermediate', unilateral: false, tags: ['isolation', 'free_weight'], color: '#ff4d6a' },
  { id: 'dumbbell_preacher_curl', name: 'Curl pupitre haltères', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: ['dumbbells', 'preacher_bench'], level: 'beginner', unilateral: true, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'dumbbell_reverse_curl', name: 'Curl inversé haltères', category: 'strength', movementPattern: 'elbow_flexion', primaryMuscles: ['brachialis'], secondaryMuscles: ['forearms', 'biceps'], equipment: ['dumbbells'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#45c4d9' },
  { id: 'barbell_front_raise', name: 'Élévations frontales à la barre', category: 'strength', movementPattern: 'shoulder_flexion', primaryMuscles: ['front_delts'], secondaryMuscles: [], equipment: ['barbell', 'plates'], level: 'intermediate', unilateral: false, tags: ['isolation', 'free_weight'], color: '#e7c65c' },
  { id: 'barbell_wrist_curl', name: 'Flexions de poignets à la barre', category: 'strength', movementPattern: 'wrist_flexion', primaryMuscles: ['forearms'], secondaryMuscles: [], equipment: ['barbell', 'bench', 'plates'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#e7c65c' },
  { id: 'barbell_reverse_wrist_curl', name: 'Extensions de poignets à la barre', category: 'strength', movementPattern: 'wrist_extension', primaryMuscles: ['forearms'], secondaryMuscles: [], equipment: ['barbell', 'bench', 'plates'], level: 'beginner', unilateral: false, tags: ['isolation', 'free_weight'], color: '#e7c65c' },
];

export const MUSCLE_CATEGORIES = [
  { id: 'back', name: 'Dos', muscles: ['lats', 'middle_back', 'upper_back', 'lower_back'] },
  { id: 'chest', name: 'Pectoraux', muscles: ['chest', 'upper_chest'] },
  { id: 'shoulders', name: 'Épaules', muscles: ['front_delts', 'side_delts', 'rear_delts'] },
  { id: 'biceps', name: 'Biceps', muscles: ['biceps', 'brachialis'] },
  { id: 'triceps', name: 'Triceps', muscles: ['triceps'] },
  { id: 'quadriceps', name: 'Quadriceps', muscles: ['quads'] },
  { id: 'posterior_chain', name: 'Ischios et fessiers', muscles: ['hamstrings', 'glutes'] },
  { id: 'calves', name: 'Mollets', muscles: ['calves'] },
  { id: 'core', name: 'Abdominaux', muscles: ['abs', 'core', 'obliques'] },
  { id: 'forearms', name: 'Avant-bras', muscles: ['forearms'] },
];

// Stats-only grouping: folds the fine-grained muscle categories into the
// push/pull/legs split most lifters already think in, so the Stats view
// doesn't require picking through all ten categories at once.
export const STATS_MUSCLE_GROUPS = [
  { id: 'push', categories: ['chest', 'shoulders', 'triceps'] },
  { id: 'pull', categories: ['back', 'biceps', 'forearms'] },
  { id: 'legs', categories: ['quadriceps', 'posterior_chain', 'calves', 'core'] },
];

const STATS_GROUP_BY_CATEGORY = new Map(STATS_MUSCLE_GROUPS.flatMap((group) => group.categories.map((categoryId) => [categoryId, group.id])));

export function getStatsMuscleGroup(categoryId) {
  return STATS_GROUP_BY_CATEGORY.get(categoryId) || null;
}

const CATEGORY_IDS = new Set(MUSCLE_CATEGORIES.map((category) => category.id));

const CATEGORY_BY_MUSCLE = new Map(MUSCLE_CATEGORIES.flatMap((category) => category.muscles.map((muscle) => [muscle, category.id])));

const EXERCISE_BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

export function getExerciseById(id) {
  return EXERCISE_BY_ID.get(id) || getCustomExerciseById(id);
}

export function getExerciseMuscleCategory(exerciseOrId) {
  const exercise = typeof exerciseOrId === 'string' ? getExerciseById(exerciseOrId) : exerciseOrId;
  if (exercise?.custom) return CATEGORY_IDS.has(exercise.muscleCategory) ? exercise.muscleCategory : 'other';
  return CATEGORY_BY_MUSCLE.get(exercise?.primaryMuscles?.[0]) || 'other';
}

export function getExercisesByMuscleCategory(categoryId) {
  const builtIn = EXERCISES.filter((exercise) => getExerciseMuscleCategory(exercise) === categoryId);
  const custom = getCustomExercises().filter((exercise) => exercise.muscleCategory === categoryId);
  return [...builtIn, ...custom];
}

// A handful of exercises pull real weight in a second push/pull/legs group
// beyond the one their primary muscle implies — the conventional deadlift is
// a legs/posterior-chain lift but also loads the back and grip like a pull.
const STATS_GROUP_EXTRAS = {
  barbell_deadlift: ['pull'],
  dumbbell_deadlift: ['pull'],
};

export function getExerciseStatsGroups(exerciseOrId) {
  const exercise = typeof exerciseOrId === 'string' ? getExerciseById(exerciseOrId) : exerciseOrId;
  if (!exercise) return [];
  const primaryGroup = getStatsMuscleGroup(getExerciseMuscleCategory(exercise));
  const extraGroups = STATS_GROUP_EXTRAS[exercise.id] || [];
  return [...new Set([primaryGroup, ...extraGroups].filter(Boolean))];
}

function englishExerciseName(id) {
  const acronyms = new Map([['ez', 'EZ'], ['t', 'T']]);
  return String(id).split('_').map((word) => acronyms.get(word) || `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ')
    .replaceAll('Pull Up', 'Pull-up').replaceAll('Push Up', 'Push-up');
}

export function getLocalizedExerciseName(exerciseOrId, fallback = t('unknownExercise')) {
  const exercise = typeof exerciseOrId === 'string' ? getExerciseById(exerciseOrId) : exerciseOrId;
  if (!exercise) return fallback;
  if (exercise.custom) return exercise.name;
  return getLanguage() === 'en' ? englishExerciseName(exercise.id) : exercise.name;
}

export function getMuscleCategoryDisplayName(categoryOrId) {
  const category = typeof categoryOrId === 'string' ? MUSCLE_CATEGORIES.find((item) => item.id === categoryOrId) : categoryOrId;
  if (!category) return t('categoryFallback');
  const englishNames = { back: 'Back', chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Quadriceps', posterior_chain: 'Hamstrings and glutes', calves: 'Calves', core: 'Abs and core', forearms: 'Forearms' };
  return getLanguage() === 'en' ? englishNames[category.id] : category.name;
}

export function getExercises(filters = {}) {
  return EXERCISES.filter((exercise) => {
    if (filters.movementPattern && exercise.movementPattern !== filters.movementPattern) return false;
    if (filters.level && exercise.level !== filters.level) return false;
    if (filters.equipment && !filters.equipment.every((item) => exercise.equipment.includes(item))) return false;
    if (filters.muscle && !exercise.primaryMuscles.includes(filters.muscle)) return false;
    return true;
  });
}

export function getExerciseDisplayName(id, fallback = t('unknownExercise')) {
  return getLocalizedExerciseName(id, fallback);
}

export function getExerciseColor(id) {
  const exercise = getExerciseById(id);
  if (exercise?.color) return exercise.color;

  const palette = ['#4d7cff', '#ff8a3d', '#ff4d6a', '#3ddc84', '#e7c65c', '#45c4d9'];
  const hash = [...String(id)].reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}
