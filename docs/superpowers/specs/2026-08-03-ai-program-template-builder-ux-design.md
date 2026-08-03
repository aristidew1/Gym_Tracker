# Template IA et simplification du constructeur de programme

Date : 2026-08-03

## Objectif

Permettre à une personne de copier depuis les paramètres un prompt complet expliquant à une IA comment produire un programme directement importable dans Muscu Tracker. Réduire en parallèle la surcharge visuelle du constructeur de programme sur téléphone sans supprimer aucun réglage existant.

## Constat vérifié sur téléphone

Le parcours a été reproduit via ADB sur un Pixel 8 Pro utilisant l'application installée `com.muscu.tracker`.

- Le constructeur affiche immédiatement les informations générales, les réglages de séance, tous les blocs et tous les champs de chaque exercice.
- Il faut environ six grands balayages pour atteindre les actions situées à la fin de la première séance du programme intégré.
- Le viewport du WebView mesure environ 448 pixels CSS. La disposition mobile de `.editor-add-exercise` ne s'active actuellement qu'à 420 pixels.
- La rangée d'ajout conserve donc quatre colonnes trop larges. Le bouton « Ajouter » est rendu hors écran avec des bounds Android `[0,0][0,0]` et ne peut pas être utilisé.

La surcharge est ainsi à la fois un problème de hiérarchie de l'information et un défaut fonctionnel de responsive design.

## Expérience du constructeur

Le constructeur reste une page unique, mais utilise une divulgation progressive.

### Structure générale

- L'en-tête contient le retour, le titre et l'historique annuler/rétablir. L'action d'enregistrement n'est plus dupliquée dans l'en-tête.
- Les informations générales du programme sont regroupées dans une section repliable présentant, lorsqu'elle est fermée, le nom, l'objectif, le niveau et la durée.
- Les onglets de séances restent horizontaux et une seule séance est affichée à la fois.
- Le nom, le sous-titre, l'icône, la couleur, le déplacement et la suppression d'une séance sont réunis dans une section « Réglages de la séance », fermée par défaut pour un programme existant.
- Une barre d'action collante, compatible avec la safe area Android, garde « Annuler » et « Enregistrer et activer » accessibles en permanence.

### Blocs

Chaque bloc devient un accordéon. Son état fermé affiche :

- son nom ;
- son mode d'exécution ;
- son nombre d'exercices ;
- une synthèse des rounds et du repos.

L'ouverture révèle ses réglages, ses exercices et l'ajout d'un exercice. Plusieurs blocs peuvent rester ouverts afin de permettre la comparaison, mais tous les blocs d'un programme existant sont fermés à l'ouverture du constructeur. Pour un nouveau programme vide, le premier bloc est ouvert afin de guider la saisie.

### Exercices

Un exercice fermé tient sur une ligne compacte affichant son nom et une prescription lisible, par exemple `5 × 3–5 · 150 s · RIR 2`. L'ouverture affiche d'abord les réglages courants : catégorie, exercice, séries, répétitions et repos.

RIR, RPE, tempo, progression, note et technique d'intensification sont rangés dans un sous-accordéon « Options avancées ». Les actions de déplacement et de suppression restent dans l'exercice ouvert afin de réduire le bruit et les manipulations accidentelles.

### Ajout d'un exercice

L'ajout se trouve à la fin de chaque bloc ouvert. La mise en page doit dépendre de l'espace réellement disponible et non d'un breakpoint trop étroit :

- catégorie et recherche peuvent partager une première ligne lorsque la largeur le permet ;
- la sélection de l'exercice utilise toute la largeur restante ;
- le bouton « Ajouter » occupe une ligne ou une largeur garantissant qu'il reste toujours visible et tactile ;
- aucun contrôle ne doit provoquer de débordement horizontal.

### État d'interface

Les identifiants des sections ouvertes sont conservés dans l'état local du module du constructeur. Un rendu provoqué par un changement de technique, un ajout ou un déplacement conserve les sections pertinentes ouvertes. Le changement de séance restaure l'état de cette séance lorsqu'il existe. Cet état n'est pas persisté dans le programme JSON, car il ne décrit que l'interface d'édition.

## Template destiné aux IA

### Accès dans les paramètres

Une section localisée « Création avec une IA » / « Create with AI » est ajoutée aux paramètres. Elle contient une courte explication et un bouton « Copier le template » / « Copy template ».

Le prompt est produit au moment du clic dans la langue active de l'application :

- français lorsque l'application est en français ;
- anglais lorsque l'application est en anglais.

Les explications et les noms d'exercices sont localisés. Les identifiants techniques, les clés JSON et les valeurs d'énumération restent inchangés pour garantir la compatibilité du fichier.

### Contenu du prompt

Le prompt copié est autonome et contient :

1. le rôle demandé à l'IA et l'instruction de répondre uniquement avec du JSON, sans balises Markdown ;
2. l'enveloppe d'import de programmes avec `format: "muscu-tracker-programs"`, `version: 1`, `programs` et `activeProgramId` ;
3. le schéma de programme version 2 et la relation obligatoire entre `sessionOrder`, les clés de `sessions` et les `id` ;
4. les structures de séance, bloc, exercice, prescription et technique d'intensification ;
5. les valeurs autorisées pour l'objectif, le niveau, le mode d'exécution, la progression et les techniques ;
6. les règles de cohérence, notamment des identifiants uniques, des blocs non vides, une plage de répétitions ordonnée et un `activeProgramId` correspondant au programme généré ;
7. le catalogue actuel des exercices sous la forme `identifiant — nom localisé` ;
8. la liste actuelle des techniques et de leurs paramètres ;
9. un exemple minimal valide ;
10. une zone explicite invitant la personne à remplacer une description de besoin avant d'envoyer le prompt.

Le catalogue et les techniques sont dérivés des données de l'application plutôt que recopiés manuellement. Une évolution future du catalogue se reflète donc automatiquement dans le texte copié.

### Contrat JSON généré

Le fichier demandé à l'IA contient exactement un programme dans `programs`. Son `id` correspond à `activeProgramId`. Le programme respecte `schemaVersion: 2` et fournit au minimum une séance, un bloc non vide et un exercice issu du catalogue.

Une prescription contient :

- `setCount` ;
- `repetitionRange.min` et `repetitionRange.max` ;
- `segments` cohérent avec le nombre de séries ;
- `restSeconds` ;
- `targetRir`, `targetRpe`, `tempo` et `progressionRuleId`, avec `null` lorsque la valeur n'est pas utilisée.

Une technique contient toujours un `type` valide et seulement les paramètres attendus par ce type. Les champs de présentation nécessaires à l'affichage d'un bloc sont également fournis.

## Copie et retours utilisateur

La copie essaie d'abord `navigator.clipboard.writeText`. Si cette API n'est pas disponible ou échoue dans le WebView, un champ temporaire sélectionné et la commande de copie du document servent de solution de secours.

Un toast localisé confirme la réussite. Si les deux méthodes échouent, un toast d'erreur localisé est affiché et l'overlay des paramètres reste ouvert. Aucun téléchargement ni aucune modification des programmes n'a lieu lors de la copie.

## Limites du périmètre

- Le bouton ne contacte aucune IA et n'envoie aucune donnée.
- L'application ne parse pas directement une réponse collée ; l'utilisateur importe le JSON produit avec l'action existante « Importer des programmes ».
- Aucun champ du schéma de programme n'est supprimé.
- Aucun refactoring sans rapport avec le constructeur, les paramètres ou le template n'est inclus.

## Vérification

### Tests automatisés

- Le modèle d'exemple du prompt passe la validation de programme et le contrat d'import de programmes.
- Le prompt français contient les instructions et noms localisés français.
- Le prompt anglais contient les instructions et noms localisés anglais.
- Les deux prompts incluent tous les identifiants d'exercices et de techniques exposés par l'application.
- Les fonctions de synthèse produisent les libellés compacts attendus pour les blocs et prescriptions, y compris les valeurs absentes.
- L'état initial de divulgation ouvre le premier bloc d'un nouveau programme et replie les blocs d'un programme existant.

### Validation manuelle sur Pixel 8 Pro

- La page ne possède aucun débordement horizontal à environ 448 pixels CSS.
- Les informations, séances, blocs et exercices peuvent être ouverts et refermés au toucher.
- Le bouton « Ajouter » a des bounds non nuls, reste visible et ajoute réellement l'exercice choisi.
- Les sections pertinentes restent ouvertes après une modification structurelle.
- La barre d'enregistrement reste accessible pendant le défilement et respecte la barre de navigation Android.
- Le prompt copié depuis une application en français est français ; après passage en anglais, il est anglais.
- Le JSON obtenu à partir du prompt peut être importé avec le flux « Programmes uniquement » sans modifier l'historique des séances.
