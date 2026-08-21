const LANGUAGE_KEY = 'muscu_language';
const SUPPORTED_LANGUAGES = ['fr', 'en'];

const FR = {
  programNotFound: 'Programme introuvable.', baseProgramDelete: 'Le programme de base ne peut pas être supprimé.',
  name: 'Nom', newProgram: 'Nouveau programme', block: 'Bloc', strength: 'Force', hypertrophy: 'Hypertrophie', endurance: 'Endurance', mixed: 'Mixte', technique: 'Technique', remove: 'Retirer', errorOccurred: 'Une erreur est survenue.',
  restBetweenExercises: 'Repos entre exercices (s)', drops: 'Nombre de baisses', loadReduction: 'Réduction de charge (%)', target: 'Cible', pauses: 'Nombre de pauses', pauseDuration: 'Durée des pauses (s)', activationReps: "Reps d’activation", miniSetReps: 'Reps par mini-série', techniqueRest: 'Repos technique (s)', clusterReps: 'Reps par cluster', intraSetRest: 'Repos intra-série (s)', exerciseCount: "Nombre d’exercices", partialReps: 'Reps partielles',
  exportError: "Erreur lors de l'export",
  settings: 'Paramètres', language: 'Langue', french: 'Français', english: 'Anglais', privacyPolicy: 'Politique de confidentialité', home: 'Accueil', calendar: 'Calendrier', stats: 'Stats', programs: 'Programmes',
  supplements: 'Compléments', supplementsSubtitle: 'Gère tes prises quotidiennes', supplementsProgress: '{taken}/{total} pris aujourd’hui', supplementsEmptyHome: 'Ajoute tes compléments pour les suivre chaque jour.', addSupplements: 'Ajouter', manage: 'Gérer', supplementName: 'Nom du complément', supplementNamePlaceholder: 'ex. Créatine', dose: 'Dose', unit: 'Unité', addSupplement: 'Ajouter le complément', mySupplements: 'Mes compléments', perDay: 'par jour', supplementsEmpty: 'Aucun complément pour le moment.', supplementsTakenCalendar: 'Compléments pris', supplementsMissingCalendar: 'Compléments incomplets',
  supplementsNotificationPending: '💊 Compléments : à prendre', supplementsNotificationComplete: '💊 Compléments : ✅',
  workouts: 'Séances', streak: 'Streak 🔥', thisMonth: 'Ce mois', rollingCycle: 'Cycle roulant — 1 jour sur 2', nextSuggested: 'Prochaine séance suggérée :',
  finish: 'Terminer', back: 'Retour', workoutInProgress: 'Séance en cours', resumeWorkout: 'Reprendre', previousMonth: 'Mois précédent', nextMonth: 'Mois suivant', consecutiveWorkouts: 'séances consécutives', consecutiveWeeks: 'semaines réussies consécutives', statistics: 'Statistiques', performanceProgress: 'Progression de tes performances', editWorkout: 'Éditer la séance', editWorkoutDesc: 'Ajoute ou remplace des exercices pour cette séance uniquement.', bonusBlock: 'Bloc bonus {count}', selectBlock: 'Bloc à modifier', newBonusBlock: '＋ Nouveau bloc bonus', blockName: 'Nom du bloc', blockType: 'Type de bloc', superset: 'Superset', addExerciseToWorkout: 'Ajouter un exercice', bonusOnly: 'Les changements ne modifient pas ton programme.', replace: 'Remplacer', replaceExercise: "Changer d'exercice", recordedExercises: 'Exercices enregistrés', editingRecordedWorkout: "Modification d'une séance enregistrée", editRecordedWorkout: 'Modifier cette séance', recordedWorkoutSaved: 'Séance modifiée ✓',
  oneMonth: '1 mois', threeMonths: '3 mois', sixMonths: '6 mois', all: 'Tout', liftedWeight: 'Poids soulevé (kg)', repetitions: 'Répétitions', noStats: "Commence à t'entraîner pour voir tes stats !",
  rest: 'repos', skip: 'Passer', workoutFinished: 'Séance terminée !', great: 'Parfait !', confirm: 'Confirmer', areYouSure: 'Es-tu sûr ?', cancel: 'Annuler', chooseOption: 'Choisir une option',
  notifications: 'Notifications', persistentNotification: 'Notification persistante', persistentNotificationDesc: "Affiche le statut du jour (repos ou entraînement) dans la barre de notifications", restTimerNotification: 'Compte à rebours dans les notifications', restTimerNotificationDesc: 'Affiche le temps de repos et l’alerte de fin dans les notifications',
  createWithAi: 'Création avec une IA', aiProgramTemplate: 'Template de programme pour IA', aiProgramTemplateDesc: "Copie un prompt complet qui explique le format Muscu Tracker et demande un JSON directement importable.", copyTemplate: 'Copier le template', aiTemplateCopied: 'Template IA copié ✓', aiTemplateCopyError: 'Impossible de copier le template',
  data: 'Données', backupFull: 'Sauvegarde complète', programsOnly: 'Programmes uniquement', calendarLegend: 'Couleur de chaque séance', exportData: 'Exporter les données', exportDataDesc: 'Télécharge tes séances, programmes et compléments en fichier JSON', export: 'Exporter', importData: 'Importer des données', importDataDesc: 'Charge une sauvegarde JSON de tes séances, programmes et compléments', import: 'Importer', exportPrograms: 'Exporter les programmes', exportProgramsDesc: 'Télécharge uniquement tes programmes, sans les séances', importPrograms: 'Importer des programmes', importProgramsDesc: 'Ajoute des programmes sans modifier tes séances',
  mondayShort: 'Lun', tuesdayShort: 'Mar', wednesdayShort: 'Mer', thursdayShort: 'Jeu', fridayShort: 'Ven', saturdayShort: 'Sam', sundayShort: 'Dim',
  leaveWorkout: 'Quitter la séance ?', leaveWorkoutDesc: 'Ta séance en cours ne sera pas sauvegardée.', leaveRecordedWorkout: 'Quitter la modification ?', leaveRecordedWorkoutDesc: 'Tes modifications ne seront pas enregistrées.', today: "Aujourd'hui", yesterday: 'Hier', daysAgo: 'Il y a {count}j', next: 'Suivante', method: 'Méthode', choice: 'Choix',
  previous: 'Préc: {sets} séries · {weights} kg × {reps} reps', timerNotificationTitle: 'Repos', timerNotificationBody: 'Compte à rebours en cours', timerFinishedTitle: 'Repos terminé', timerFinishedBody: 'C’est parti pour la prochaine série !', reps: 'reps', skippedExercise: 'Exercice skippé', restore: 'Restaurer', set: 'Série', weight: 'Poids', addSet: '＋ Série', removeSet: '－ Série', skipExercise: '⊘ Skip exo', restTime: '⏱ Repos {time}',
  emptyWorkout: 'Séance vide', emptyWorkoutDesc: "Tu n'as enregistré aucune série. Quitter quand même ?", sets: 'séries', workoutDuration: 'durée', volume: 'volume', comparedToPrevious: 'Comparé à la séance précédente', firstWorkoutOfSession: 'Première séance enregistrée pour ce format.', noDataExport: 'Aucune donnée à exporter', exportedData: 'Données exportées ✓', exportDialog: 'Exporter les données',
  invalidExportData: 'Format de sauvegarde invalide', importConfirm: 'Cette sauvegarde remplacera tes données actuelles, y compris tes programmes. Continuer ?', importedData: 'Données importées ✓', importError: "Erreur lors de l'import", invalidJson: 'Fichier JSON invalide', noProgramsExport: 'Aucun programme à exporter', exportedPrograms: 'Programmes exportés ✓', importedPrograms: 'Programmes importés ✓', programsImportConfirm: 'Cette sauvegarde ajoutera les programmes importés sans modifier tes séances. Les noms similaires seront renommés. Continuer ?',
  programsHeading: 'Programmes', programsSubtitle: 'Compose chaque détail de ton entraînement.', create: 'Créer', customProgram: 'Créer un programme sur mesure', active: 'Actif', custom: 'sur mesure', activate: 'Activer', duplicate: 'Dupliquer', edit: 'Modifier', delete: 'Supprimer', moreActions: 'Plus d’actions',
  builder: 'Constructeur', everythingEditable: 'Tout est modifiable manuellement', undo: 'Annuler', redo: 'Rétablir', save: 'Enregistrer', programInformation: 'Informations du programme', sessionSettings: 'Réglages de la séance', advancedOptions: 'Options avancées', collapse: 'Replier', expand: 'Déplier', programName: 'Nom du programme', programDescription: 'Description', goal: 'Objectif', level: 'Niveau', duration: 'Durée indicative', minutes: 'minutes', trainingFrequency: "Fréquence d’entraînement", frequencyInterval: 'Tous les X jours', frequencyWeekly: 'Nombre de fois par semaine', daysBetweenWorkouts: 'Jours entre les séances', sessionsPerWeek: 'Séances par semaine', intervalFrequencyHelp: 'De 1 à 30 jours', weeklyFrequencyHelp: 'De 1 à 7 séances', everyDay: 'tous les jours', everyDays: 'tous les {count} jours', oncePerWeek: '1 fois par semaine', timesPerWeek: '{count} fois par semaine',
  beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé', addWorkout: 'Ajouter une séance', noWorkout: 'Aucune séance', addWorkoutHelp: 'Ajoute une séance pour continuer la construction.', saveActivate: 'Enregistrer et activer', workoutGoal: 'Objectif de la séance', icon: 'Icône', color: 'Couleur',
  moveLeft: 'Déplacer à gauche', moveRight: 'Déplacer à droite', deleteWorkout: 'Supprimer la séance', noBlock: 'Aucun bloc', addFirstBlock: 'Ajoute ton premier bloc ci-dessous.', addBlock: 'Ajouter un bloc', sequential: 'Séquentiel', circuit: 'Circuit', rounds: 'Rounds', exerciseRest: 'Repos exercices', roundRest: 'Repos rounds', moveUp: 'Monter', moveDown: 'Descendre', deleteBlock: 'Supprimer le bloc',
  noExercise: 'Aucun exercice', searchAddExercise: 'Recherche puis ajoute un exercice.', muscleCategory: 'Catégorie musculaire', exercise: 'Exercice', filterIn: 'Filtrer dans {category}', add: 'Ajouter', minReps: 'Reps min', maxReps: 'Reps max', rir: 'RIR', rpe: 'RPE', tempo: 'Tempo', progression: 'Progression', none: 'Aucune', doubleProgression: 'Double progression', note: 'Note', personalInstructions: 'Consignes personnelles',
  intensityTechnique: "Technique d'intensification", removeExercise: "Supprimer l'exercice", categoryFallback: 'la catégorie', programDeleteConfirm: 'Supprimer ce programme ? Son historique sera conservé.', noSearchExercise: 'Aucun exercice ne correspond à la recherche.',
  deleteRecordedWorkout: 'Supprimer cette séance', deleteRecordedWorkoutConfirm: 'Voulez-vous vraiment supprimer cette séance ?', restTomorrow: '😴 Repos demain', restToday: "😴 Repos aujourd'hui", workoutCompletedToday: '✅ Séance terminée aujourd’hui', nextWorkout: 'Prochaine séance : {name}', nextWorkoutInDays: 'Dans {count} jours : {name}', tomorrowWorkout: 'Demain : {name}', workoutToday: "🏋️ {name} aujourd'hui", unknownExercise: 'Exercice inconnu', copySuffix: '{name} - copie',
};

const EN = {
  programNotFound: 'Program not found.', baseProgramDelete: 'The built-in program cannot be deleted.',
  name: 'Name', newProgram: 'New program', block: 'Block', strength: 'Strength', hypertrophy: 'Hypertrophy', endurance: 'Endurance', mixed: 'Mixed', technique: 'Technique', remove: 'Remove', errorOccurred: 'An error occurred.',
  restBetweenExercises: 'Rest between exercises (s)', drops: 'Number of drops', loadReduction: 'Load reduction (%)', target: 'Target', pauses: 'Number of pauses', pauseDuration: 'Pause duration (s)', activationReps: 'Activation reps', miniSetReps: 'Reps per mini-set', techniqueRest: 'Technique rest (s)', clusterReps: 'Reps per cluster', intraSetRest: 'Intra-set rest (s)', exerciseCount: 'Number of exercises', partialReps: 'Partial reps',
  exportError: 'Export failed',
  settings: 'Settings', language: 'Language', french: 'French', english: 'English', privacyPolicy: 'Privacy policy',
  home: 'Home', calendar: 'Calendar', stats: 'Stats', programs: 'Programs',
  supplements: 'Supplements', supplementsSubtitle: 'Manage your daily intake', supplementsProgress: '{taken}/{total} taken today', supplementsEmptyHome: 'Add supplements to track them every day.', addSupplements: 'Add', manage: 'Manage', supplementName: 'Supplement name', supplementNamePlaceholder: 'e.g. Creatine', dose: 'Dose', unit: 'Unit', addSupplement: 'Add supplement', mySupplements: 'My supplements', perDay: 'per day', supplementsEmpty: 'No supplements yet.', supplementsTakenCalendar: 'Supplements taken', supplementsMissingCalendar: 'Supplements incomplete',
  supplementsNotificationPending: '💊 Supplements: to take', supplementsNotificationComplete: '💊 Supplements: ✅',
  workouts: 'Workouts', streak: 'Streak 🔥', thisMonth: 'This month',
  rollingCycle: 'Rolling cycle — every other day', nextSuggested: 'Next suggested workout:',
  finish: 'Finish', back: 'Back', workoutInProgress: 'Workout in progress', resumeWorkout: 'Resume', previousMonth: 'Previous month', nextMonth: 'Next month', editWorkout: 'Edit workout', editWorkoutDesc: 'Add or replace exercises for this workout only.', bonusBlock: 'Bonus block {count}', selectBlock: 'Block to edit', newBonusBlock: '＋ New bonus block', blockName: 'Block name', blockType: 'Block type', superset: 'Superset', addExerciseToWorkout: 'Add exercise', bonusOnly: 'These changes do not modify your program.', replace: 'Replace', replaceExercise: 'Change exercise', recordedExercises: 'Recorded exercises', editingRecordedWorkout: 'Editing a recorded workout', editRecordedWorkout: 'Edit this workout', recordedWorkoutSaved: 'Workout updated ✓',
  consecutiveWorkouts: 'consecutive workouts', consecutiveWeeks: 'consecutive successful weeks', statistics: 'Statistics', performanceProgress: 'Your performance progress',
  oneMonth: '1 month', threeMonths: '3 months', sixMonths: '6 months', all: 'All',
  liftedWeight: 'Weight lifted (kg)', repetitions: 'Repetitions', noStats: 'Start training to see your stats!',
  rest: 'rest', skip: 'Skip', workoutFinished: 'Workout complete!', great: 'Great!',
  confirm: 'Confirm', areYouSure: 'Are you sure?', cancel: 'Cancel', chooseOption: 'Choose an option',
  notifications: 'Notifications', persistentNotification: 'Persistent notification',
  persistentNotificationDesc: 'Shows today’s status (rest or training) in the notification bar', restTimerNotification: 'Countdown in notifications', restTimerNotificationDesc: 'Shows rest time and the completion alert in notifications',
  createWithAi: 'Create with AI', aiProgramTemplate: 'AI program template', aiProgramTemplateDesc: 'Copy a complete prompt that explains the Muscu Tracker format and requests directly importable JSON.', copyTemplate: 'Copy template', aiTemplateCopied: 'AI template copied ✓', aiTemplateCopyError: 'Could not copy the template',
  data: 'Data', backupFull: 'Full backup', programsOnly: 'Programs only', calendarLegend: 'Workout color legend', exportData: 'Export data', exportDataDesc: 'Downloads your workouts, programs, and supplements as a JSON file', export: 'Export',
  importData: 'Import data', importDataDesc: 'Loads a JSON backup of your workouts, programs, and supplements', import: 'Import', exportPrograms: 'Export programs', exportProgramsDesc: 'Downloads only your programs, without workouts', importPrograms: 'Import programs', importProgramsDesc: 'Adds programs without changing your workouts',
  mondayShort: 'Mon', tuesdayShort: 'Tue', wednesdayShort: 'Wed', thursdayShort: 'Thu', fridayShort: 'Fri', saturdayShort: 'Sat', sundayShort: 'Sun',
  leaveWorkout: 'Leave workout?', leaveWorkoutDesc: 'Your current workout will not be saved.', leaveRecordedWorkout: 'Leave editing?', leaveRecordedWorkoutDesc: 'Your changes to this recorded workout will not be saved.',
  today: 'Today', yesterday: 'Yesterday', daysAgo: '{count}d ago', next: 'Next', method: 'Method', choice: 'Choice',
  previous: 'Previous: {sets} sets · {weights} kg × {reps} reps', timerNotificationTitle: 'Rest', timerNotificationBody: 'Countdown in progress', timerFinishedTitle: 'Rest complete', timerFinishedBody: 'Time for your next set!', reps: 'reps', skippedExercise: 'Exercise skipped', restore: 'Restore',
  set: 'Set', weight: 'Weight', addSet: '＋ Set', removeSet: '－ Set', skipExercise: '⊘ Skip exercise', restTime: '⏱ Rest {time}',
  emptyWorkout: 'Empty workout', emptyWorkoutDesc: 'You have not recorded any sets. Leave anyway?', sets: 'sets', workoutDuration: 'duration', volume: 'volume', comparedToPrevious: 'Compared with the previous workout', firstWorkoutOfSession: 'First recorded workout for this session.',
  noDataExport: 'No data to export', exportedData: 'Data exported ✓', exportDialog: 'Export data',
  invalidExportData: 'Invalid backup format', importConfirm: 'This backup will replace your current data, including your programs. Continue?',
  importedData: 'Data imported ✓', importError: 'Import failed', invalidJson: 'Invalid JSON file', noProgramsExport: 'No programs to export', exportedPrograms: 'Programs exported ✓', importedPrograms: 'Programs imported ✓', programsImportConfirm: 'This backup will add imported programs without changing your workouts. Similar names will be renamed. Continue?',
  programsHeading: 'Programs', programsSubtitle: 'Build every detail of your training.', create: 'Create', customProgram: 'Create a custom program',
  active: 'Active', custom: 'custom', activate: 'Activate', duplicate: 'Duplicate', edit: 'Edit', delete: 'Delete', moreActions: 'More actions',
  builder: 'Builder', everythingEditable: 'Everything can be edited manually', undo: 'Undo', redo: 'Redo', save: 'Save', programInformation: 'Program information', sessionSettings: 'Workout settings', advancedOptions: 'Advanced options', collapse: 'Collapse', expand: 'Expand',
  programName: 'Program name', programDescription: 'Description', goal: 'Goal', level: 'Level', duration: 'Estimated duration', minutes: 'minutes', trainingFrequency: 'Training frequency', frequencyInterval: 'Every X days', frequencyWeekly: 'Number of times per week', daysBetweenWorkouts: 'Days between workouts', sessionsPerWeek: 'Workouts per week', intervalFrequencyHelp: 'From 1 to 30 days', weeklyFrequencyHelp: 'From 1 to 7 workouts', everyDay: 'every day', everyDays: 'every {count} days', oncePerWeek: 'once per week', timesPerWeek: '{count} times per week',
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', addWorkout: 'Add workout', noWorkout: 'No workout',
  addWorkoutHelp: 'Add a workout to continue building.', saveActivate: 'Save and activate', workoutGoal: 'Workout goal', icon: 'Icon', color: 'Color',
  moveLeft: 'Move left', moveRight: 'Move right', deleteWorkout: 'Delete workout', noBlock: 'No block', addFirstBlock: 'Add your first block below.', addBlock: 'Add block',
  sequential: 'Sequential', circuit: 'Circuit', rounds: 'Rounds', exerciseRest: 'Exercise rest', roundRest: 'Round rest', moveUp: 'Move up', moveDown: 'Move down', deleteBlock: 'Delete block',
  noExercise: 'No exercise', searchAddExercise: 'Search for and add an exercise.', muscleCategory: 'Muscle group', exercise: 'Exercise', filterIn: 'Filter in {category}', add: 'Add',
  minReps: 'Min reps', maxReps: 'Max reps', rir: 'RIR', rpe: 'RPE', tempo: 'Tempo', progression: 'Progression', none: 'None', doubleProgression: 'Double progression', note: 'Note', personalInstructions: 'Personal instructions',
  intensityTechnique: 'Intensity technique', removeExercise: 'Remove exercise', categoryFallback: 'the category', programDeleteConfirm: 'Delete this program? Its workout history will be kept.', noSearchExercise: 'No exercise matches your search.',
  deleteRecordedWorkout: 'Delete this workout', deleteRecordedWorkoutConfirm: 'Are you sure you want to delete this workout?',
  restTomorrow: '😴 Rest tomorrow', restToday: '😴 Rest today', workoutCompletedToday: '✅ Workout completed today', nextWorkout: 'Next workout: {name}', nextWorkoutInDays: 'In {count} days: {name}', tomorrowWorkout: 'Tomorrow: {name}', workoutToday: '🏋️ {name} today',
  unknownExercise: 'Unknown exercise', copySuffix: '{name} - copy',
};

const TEXT_EN = {
  'Cycle tractions et deadlift': 'Pull-up and deadlift cycle',
  'Cycle roulant A/B/C/D, un jour sur deux.': 'Rolling A/B/C/D cycle, every other day.',
  'Séance A': 'Workout A', 'Séance B': 'Workout B', 'Séance C': 'Workout C', 'Séance D': 'Workout D',
  'Tractions force + dos / biceps': 'Strength pull-ups + back / biceps', 'Push + tractions faciles': 'Push + easy pull-ups',
  'Deadlift + traction technique': 'Deadlift + pull-up technique', 'Legs + tractions endurance': 'Legs + pull-up endurance',
  'Bloc force': 'Strength block', 'Superset 1': 'Superset 1', 'Superset 2': 'Superset 2', 'Superset 3': 'Superset 3',
  'Bloc traction facile': 'Easy pull-up block', 'Bloc traction technique': 'Technique pull-up block', 'Bloc traction endurance': 'Endurance pull-up block',
  'Développé': 'Press', 'Dips ou pompes': 'Dips or push-ups', 'Hip thrust ou back ext.': 'Hip thrust or back extension',
  'Squat ou Presse': 'Squat or leg press', 'Fentes ou split squat': 'Lunges or split squat', 'Tractions endurance': 'Endurance pull-ups',
  'Chaque minute, 3 à 6 tractions': 'Every minute, perform 3 to 6 pull-ups', '1→2→3→4→5 reps, 2 à 4 cycles': '1→2→3→4→5 reps, 2 to 4 cycles',
  '30 à 50 tractions en plusieurs séries': '30 to 50 pull-ups across several sets',
  'Quand tu fais 5×5 propre, ajoute +1 à +2,5 kg': 'Once you complete a clean 5×5, add 1 to 2.5 kg',
  '50-60% de ton max, volume propre sans échec': '50-60% of your max, clean volume without failure',
  'Commence à 3 séries. Le deadlift fatigue fort.': 'Start with 3 sets. Deadlifts are highly fatiguing.',
  'Montée propre, descente contrôlée, amplitude complète': 'Clean ascent, controlled descent, full range of motion', 'Par jambe': 'Per leg',
  '⚡ Force': '⚡ Strength', '🔄 Superset': '🔄 Superset', '🎯 Traction': '🎯 Pull-up',
};

export function getLanguage() {
  const value = globalThis.localStorage?.getItem(LANGUAGE_KEY);
  return SUPPORTED_LANGUAGES.includes(value) ? value : 'fr';
}

export function t(key, variables = {}) {
  const dictionary = getLanguage() === 'en' ? EN : FR;
  const template = dictionary[key] || key;
  return Object.entries(variables).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), template);
}

export function localizeText(value) {
  if (getLanguage() !== 'en' || !value) return value;
  return TEXT_EN[value] || value;
}

export function setLanguage(language) {
  if (!SUPPORTED_LANGUAGES.includes(language)) return;
  globalThis.localStorage?.setItem(LANGUAGE_KEY, language);
  if (typeof document !== 'undefined') translateDocument();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('language:changed', { detail: { language } }));
}

export function translateDocument(root = globalThis.document) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = getLanguage();
  root.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((element) => { element.title = t(element.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
}
