import { EXERCISES, getLocalizedExerciseName } from '../data/exercises.js';
import { INTENSITY_TECHNIQUES, getIntensityTechnique } from '../data/intensity-techniques.js';
import { getLanguage } from '../i18n.js';

const COPY = {
  fr: {
    programName: 'Programme exemple IA',
    sessionName: 'Séance A',
    blockName: 'Bloc principal',
    presentationLabel: 'Principal',
    intro: 'Tu crées un programme de musculation pour Muscu Tracker.',
    output: 'Réponds uniquement avec le JSON final valide, sans Markdown ni commentaire.',
    contract: 'CONTRAT DE SORTIE',
    rules: 'RÈGLES DU SCHÉMA',
    techniques: "TECHNIQUES D’INTENSIFICATION AUTORISÉES",
    exercises: 'EXERCICES AUTORISÉS',
    example: 'EXEMPLE MINIMAL VALIDE',
    need: "BESOIN UTILISATEUR À REMPLACER : décris ici l’objectif, le niveau, le matériel disponible, la fréquence et les contraintes.",
    techniqueNone: 'aucun paramètre supplémentaire',
    lines: [
      '- Produis exactement un objet racine avec format="muscu-tracker-programs", version=1, exportedAt au format ISO, programs contenant exactement un programme, et activeProgramId égal à l’id de ce programme.',
      '- Le programme utilise schemaVersion=4. Son id est unique et stable. goal vaut custom, strength, hypertrophy, endurance ou mixed. experienceLevel vaut beginner, intermediate ou advanced.',
      '- trainingFrequency vaut soit {mode:"interval", intervalDays:X} avec X entier de 1 à 30, soit {mode:"weekly", sessionsPerWeek:X} avec X entier de 1 à 7.',
      '- sessionOrder contient au moins un id et donne l’ordre exact des séances. Chaque id doit être une clé de sessions et être identique au champ id de cette séance.',
      '- Chaque séance contient id, name, subtitle, icon, color au format #RRGGBB, colorRgb sous la forme "R, G, B", et un tableau blocks.',
      '- Chaque bloc contient un id unique, name, presentation {label, badgeClass}, executionMode valant sequential, superset ou circuit, rounds >= 1, les deux temps de repos en secondes, et un tableau items non vide.',
      '- Chaque item contient un id unique, un exerciseId choisi uniquement dans le catalogue ci-dessous, une prescription, une intensityTechnique et une note ou null.',
      '- Une prescription contient setCount >= 1, repetitionRange {min, max} avec 0 <= min <= max, segments [{type:"working", setCount}] cohérent, restSeconds >= 0, targetRir, targetRpe, tempo et progressionRuleId.',
      '- targetRir, targetRpe et tempo valent null lorsqu’ils ne sont pas utilisés. progressionRuleId vaut "double_progression" ou null.',
      '- intensityTechnique contient toujours un type autorisé. Ajoute uniquement les paramètres listés pour ce type, avec des valeurs du bon type.',
      '- N’invente aucun identifiant d’exercice ou de technique. N’ajoute aucune clé JavaScript, aucun commentaire et aucune virgule finale.',
      '- Donne des prescriptions réalistes et cohérentes avec l’objectif, le niveau, le matériel et la récupération de l’utilisateur.',
    ],
  },
  en: {
    programName: 'AI example program',
    sessionName: 'Workout A',
    blockName: 'Main block',
    presentationLabel: 'Main',
    intro: 'You create a strength-training program for Muscu Tracker.',
    output: 'Reply only with valid final JSON, without Markdown or commentary.',
    contract: 'OUTPUT CONTRACT',
    rules: 'SCHEMA RULES',
    techniques: 'ALLOWED INTENSITY TECHNIQUES',
    exercises: 'ALLOWED EXERCISES',
    example: 'MINIMAL VALID EXAMPLE',
    need: 'USER REQUIREMENT TO REPLACE: describe the goal, level, available equipment, frequency, and constraints here.',
    techniqueNone: 'no additional parameters',
    lines: [
      '- Produce exactly one root object with format="muscu-tracker-programs", version=1, an ISO exportedAt value, programs containing exactly one program, and activeProgramId equal to that program id.',
      '- The program uses schemaVersion=4. Its id is unique and stable. goal is custom, strength, hypertrophy, endurance, or mixed. experienceLevel is beginner, intermediate, or advanced.',
      '- trainingFrequency is either {mode:"interval", intervalDays:X} with an integer X from 1 to 30, or {mode:"weekly", sessionsPerWeek:X} with an integer X from 1 to 7.',
      '- sessionOrder contains at least one id and defines the exact workout order. Each id must be a sessions key and match that workout’s id field.',
      '- Each workout contains id, name, subtitle, icon, color as #RRGGBB, colorRgb as "R, G, B", and a blocks array.',
      '- Each block contains a unique id, name, presentation {label, badgeClass}, executionMode set to sequential, superset, or circuit, rounds >= 1, both rest durations in seconds, and a non-empty items array.',
      '- Each item contains a unique id, an exerciseId selected only from the catalog below, a prescription, an intensityTechnique, and a note or null.',
      '- A prescription contains setCount >= 1, repetitionRange {min, max} with 0 <= min <= max, matching segments [{type:"working", setCount}], restSeconds >= 0, targetRir, targetRpe, tempo, and progressionRuleId.',
      '- targetRir, targetRpe, and tempo are null when unused. progressionRuleId is "double_progression" or null.',
      '- intensityTechnique always contains an allowed type. Add only the parameters listed for that type, using the required value types.',
      '- Never invent exercise or technique IDs. Do not add JavaScript keys, comments, or trailing commas.',
      '- Use realistic prescriptions consistent with the user’s goal, level, equipment, and recovery.',
    ],
  },
};

export function createAiProgramImportExample(language = getLanguage()) {
  const text = COPY[language] || COPY.fr;
  const id = 'ai_program_example';
  return {
    format: 'muscu-tracker-programs',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    programs: [{
      id,
      schemaVersion: 4,
      name: text.programName,
      description: '',
      goal: 'custom',
      experienceLevel: 'intermediate',
      sessionDurationMinutes: 60,
      trainingFrequency: { mode: 'weekly', sessionsPerWeek: 3 },
      sessionOrder: ['session_a'],
      sessions: {
        session_a: {
          id: 'session_a',
          name: text.sessionName,
          subtitle: '',
          icon: '🏋️',
          color: '#4d7cff',
          colorRgb: '77, 124, 255',
          blocks: [{
            id: 'main_block',
            name: text.blockName,
            presentation: { label: text.presentationLabel, badgeClass: 'force' },
            executionMode: 'sequential',
            rounds: 1,
            restBetweenExercisesSeconds: 0,
            restBetweenRoundsSeconds: 90,
            items: [{
              id: 'main_exercise',
              exerciseId: 'barbell_back_squat',
              prescription: {
                setCount: 3,
                repetitionRange: { min: 8, max: 10 },
                segments: [{ type: 'working', setCount: 3 }],
                restSeconds: 120,
                targetRir: 2,
                targetRpe: null,
                tempo: null,
                progressionRuleId: 'double_progression',
              },
              intensityTechnique: { type: 'straight_sets' },
              note: null,
            }],
          }],
        },
      },
    }],
    activeProgramId: id,
  };
}

function techniqueLine(technique, text) {
  const localized = getIntensityTechnique(technique.id);
  const parameters = Object.keys(technique.parameters).length
    ? `parameters=${JSON.stringify(technique.parameters)}, defaults=${JSON.stringify(technique.defaults)}`
    : text.techniqueNone;
  return `${technique.id} — ${localized?.name || technique.name}: ${parameters}`;
}

export function buildAiProgramPrompt() {
  const language = getLanguage();
  const text = COPY[language] || COPY.fr;
  const exerciseCatalog = EXERCISES
    .map((exercise) => `${exercise.id} — ${getLocalizedExerciseName(exercise)}`)
    .join('\n');
  const techniqueCatalog = INTENSITY_TECHNIQUES
    .map((technique) => techniqueLine(technique, text))
    .join('\n');

  return [
    text.intro,
    text.output,
    '',
    text.contract,
    ...text.lines.slice(0, 1),
    '',
    text.rules,
    ...text.lines.slice(1),
    '',
    text.techniques,
    techniqueCatalog,
    '',
    text.exercises,
    exerciseCatalog,
    '',
    text.example,
    JSON.stringify(createAiProgramImportExample(language), null, 2),
    '',
    text.need,
  ].join('\n');
}
