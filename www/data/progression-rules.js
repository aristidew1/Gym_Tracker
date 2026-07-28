export const PROGRESSION_RULES = {
  double_progression: {
    id: 'double_progression',
    name: 'Double progression',
    type: 'double_progression',
    config: { loadIncrement: 2.5 },
  },
};

export function getProgressionRule(id) {
  return PROGRESSION_RULES[id] || null;
}
