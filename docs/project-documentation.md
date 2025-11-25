# 📘 Documentation TrustyTimer

Cette documentation présente l'application TrustyTimer telle qu'implémentée dans ce dépôt. Elle résume le fonctionnement métier, les parcours utilisateurs majeurs et les composants techniques clés.

## 1. Vue d'ensemble
- **But** : suivre le temps par projet via un mode "Minuteur" connecté à une API et un mode "Chronomètre" autonome pour un usage personnel.
- **Plateforme** : application React empaquetée avec Electron, pouvant communiquer avec des API PHP/WordPress et stocker certaines préférences dans le navigateur/renderer.

## 2. Architecture et composants principaux
- **App.js** orchestre l'authentification, la sélection de mode (minuteur ou chronomètre), la gestion des projets et l'état du mini-timer (overlay ou fenêtre dédiée). Il synchronise l'état réseau via `connectionManager` et pilote l'affichage des modaux (onboarding, feedback, configuration API, etc.).
- **Header** fournit la barre supérieure : changement de mode (Minuteur/Chronomètre), création de projet, accès configuration API et téléchargement du plugin WordPress, avec désactivation automatique quand un timer est actif.
- **ProjectList** affiche les projets provenant de l'API, permet la sélection, l'édition, la suppression et la synchronisation manuelle, tout en interdisant les actions dangereuses quand un chronomètre tourne.
- **ProjectModal** sert à créer ou modifier un projet (nom, client, description), en liaison avec l'API Electron pour la persistance.
- **Timer** gère le suivi détaillé par projet : démarrage/pause/arrêt, saisie d'un sujet de travail, calcul de la durée cumulée, historique des sessions, sauvegarde périodique et reprise après pause. Il déclenche des modaux d'inactivité et d'heures supplémentaires, et applique des restrictions UI lorsqu'un timer est actif.
- **Stopwatch** propose un mode simple non connecté, enregistrant localement des sessions personnelles avec sujet, heure de début/fin et durée.
- **ConnectionStatus** affiche l'état réseau (en ligne, hors ligne, synchronisation en attente/en cours, erreurs) à partir des événements diffusés par `connectionManager`.
- **MiniTimerOverlay/MiniTimerWindow** affichent un mini-timer repositionnable pour continuer à surveiller une session en cours (incluant le sujet et les contrôles basiques) sans bloquer l'écran principal.
- **UpdateManager**, **OnboardingModal** et **FeedbackModal** complètent l'expérience utilisateur (mise à jour disponible, découverte des fonctionnalités, remontée de bugs ou retours produit).

## 3. Parcours utilisateur essentiels
1. **Connexion & configuration API**
   - L'utilisateur saisit ses identifiants dans le `LoginModal` (avec mémorisation optionnelle). En mode développeur, il peut ouvrir le `ApiConfigModal` pour définir l'URL de l'API et le token ; sinon la configuration est fournie par l'environnement Electron.
2. **Gestion des projets (mode Minuteur)**
   - Via `Header` > "Nouveau Projet" ou `ProjectList`, l'utilisateur crée/édite/supprime un projet. Le timer actif verrouille ces actions jusqu'à arrêt.
   - La liste permet aussi de synchroniser manuellement avec l'API et de voir le statut (en cours, en pause, arrêté) et le temps cumulé.
3. **Suivi du temps par projet**
   - Dans `Timer`, l'utilisateur choisit un projet puis lance le chrono avec un sujet de travail. Il peut mettre en pause/reprendre, éditer manuellement le temps, ou stopper en confirmant le sujet final.
   - Un historique détaillé enregistre chaque session (sujet, début/fin, durée) et un récapitulatif du jour est affiché. Des modaux préviennent en cas d'inactivité prolongée ou d'heures supplémentaires.
   - Les sauvegardes sont envoyées à l'API Electron ; en cas d'offline, les sessions sont mises en file d'attente pour synchronisation ultérieure.
4. **Mode Chronomètre personnel**
   - `Stopwatch` offre un chrono indépendant de l'API avec enregistrement local des sessions. Les actions de création/suppression de projet sont désactivées dans ce mode.
5. **Mini-timer & multitâche**
   - L'utilisateur peut afficher un mini-timer (overlay web ou fenêtre Electron) pour suivre une session en cours tout en changeant d'application. La position se mémorise et l'affichage se plie/déplie.
6. **Statut réseau & synchronisation**
   - La bannière `ConnectionStatus` indique si l'application est en ligne, si une file de synchronisation hors ligne est en attente/en cours, et affiche l'heure de dernière synchronisation ou l'erreur rencontrée.
7. **Support et feedback**
   - Un bouton dédié ouvre `FeedbackModal` pour transmettre un bug ou une suggestion, et l'onboarding présente les fonctionnalités clés lors de la première utilisation.

## 4. Données et persistance
- **Projets** : stockent nom, client, description, temps total (`currentTime`), statut (`running/paused/stopped`), sujet actif et historique des sessions. La sauvegarde passe par l'API Electron (`saveProject`) et marque un drapeau `pendingSync` en cas d'envoi différé.
- **Sessions** : chaque enregistrement comporte un sujet, des horodatages début/fin, une durée calculée et la date du jour. Les sessions du jour peuvent être condensées dans un résumé.
- **Préférences locales** : l'application conserve la position du mini-timer, les identifiants mémorisés (si consentement), l'état de l'onboarding vu et la configuration API en environnement développeur.

## 5. Règles d'interface et sécurité
- Changer de mode ou de projet est bloqué quand un timer est actif pour éviter la perte de données.
- Les actions sensibles (suppression de projet, arrêt du timer) ouvrent des confirmations.
- La détection d'expiration de session (API) force le retour à l'écran de connexion et purge le token.
- Un mécanisme d'inactivité système peut auto-mettre en pause ou alerter l'utilisateur pour garantir la fidélité du tracking.

## 6. User stories principales
- **En tant que freelance**, je peux me connecter à l'API et retrouver mes projets afin de suivre précisément le temps facturable par projet.
- **En tant qu'utilisateur en mobilité**, je souhaite passer en mode Chronomètre personnel pour enregistrer rapidement une session locale sans dépendre du réseau.
- **En tant que chef de projet**, je veux consulter l'historique du jour et des sessions passées pour valider les tâches avant de les synchroniser.
- **En tant qu'utilisateur hors ligne**, je veux continuer à saisir du temps ; l'application doit mettre en file d'attente mes modifications et me prévenir lors de la resynchronisation.
- **En tant qu'utilisateur multitâche**, je souhaite détacher un mini-timer pour surveiller ma session tout en travaillant dans d'autres fenêtres.
- **En tant qu'utilisateur vigilant**, je veux que l'application me protège des erreurs : confirmations avant les suppressions, blocage des actions dangereuses quand un timer tourne, et gestion de l'expiration de session.

## 7. Points d'extension prévus
- Le code prévoit des hooks pour l'intégration plugin WordPress (bouton de téléchargement), la configuration API côté développeur et l'écoute d'événements Electron (mise à jour disponible, statut réseau détaillé), facilitant les futures évolutions ou déploiements personnalisés.
