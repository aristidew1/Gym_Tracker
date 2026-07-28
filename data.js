// Compatibility entry point for the application. New code should import the
// focused data modules directly when it only needs one responsibility.

export { DEFAULT_PROGRAM as PROGRAM, getProgramExerciseIds, getResolvedExercise, getSelectionOptions } from './data/default-program.js';
export { EXERCISES, MUSCLE_CATEGORIES, getExerciseById, getExercises, getExerciseDisplayName, getLocalizedExerciseName, getMuscleCategoryDisplayName, getExerciseColor, getExerciseMuscleCategory, getExercisesByMuscleCategory } from './data/exercises.js';
export { INTENSITY_TECHNIQUES, getIntensityTechnique, createIntensityTechnique } from './data/intensity-techniques.js';

import { DEFAULT_PROGRAM, getProgramExerciseIds, getResolvedExercise } from './data/default-program.js';
import { getExerciseDisplayName, getExerciseColor } from './data/exercises.js';

export function getExerciseName(item, selectionId) {
  return getResolvedExercise(item, selectionId).name;
}

export function getExerciseTargets(item, selectionId) {
  const resolved = getResolvedExercise(item, selectionId);
  const range = resolved.prescription?.repetitionRange || { min: 0, max: 0 };
  return {
    targetSets: resolved.prescription?.setCount || 0,
    targetRepsMin: range.min,
    targetRepsMax: range.max,
  };
}

export function getAllExerciseIds(program = DEFAULT_PROGRAM) {
  return getProgramExerciseIds(program).map((id) => ({
    id,
    name: getExerciseDisplayName(id),
    color: getExerciseColor(id),
  }));
}
