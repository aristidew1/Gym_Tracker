export function getExerciseCompletionState(sets) {
  const normalizedSets = Array.isArray(sets) ? sets : [];
  const skipped = Array.isArray(sets) && sets.length === 0;
  const completedSets = normalizedSets.filter((set) => (
    set.done && (set.segments || []).every((segment) => segment.done)
  )).length;
  return {
    completedSets,
    totalSets: normalizedSets.length,
    skipped,
    completed: normalizedSets.length > 0 && completedSets === normalizedSets.length,
  };
}

export function getWorkoutCompletionProgress(session, exerciseSets = {}, choices = {}) {
  const exercises = (session?.blocks || [])
    .flatMap((block) => block.items || [])
    .filter((exercise) => !exercise.selection?.required || choices[exercise.id]);
  const states = exercises.map((exercise) => getExerciseCompletionState(exerciseSets[exercise.id]));
  const completed = states.filter((state) => state.completed).length;
  const skipped = states.filter((state) => state.skipped).length;
  return {
    completed,
    skipped,
    incomplete: Math.max(0, exercises.length - completed - skipped),
    total: exercises.length,
  };
}
