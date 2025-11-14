# 🚀 TrustyTimer

## 📋 Description

**TrustyTimer** est une application de gestion du temps développée en **Electron** qui permet de suivre précisément le temps de travail sur différents projets. L'application offre une interface moderne et intuitive pour la gestion de projets avec un système de chronométrage avancé.

## ✨ Fonctionnalités Principales

### 🎯 **Gestion des Projets**
- ✅ **Création de projets** avec nom, description et client
- ✅ **Modification** des informations de projets
- ✅ **Suppression** avec confirmation de sécurité
- ✅ **Liste organisée** avec recherche et tri
- ✅ **Sauvegarde automatique** en temps réel

### ⏱️ **Système de Chronométrage**
- ✅ **Timer intelligent** avec démarrage/pause/arrêt
- ✅ **Accumulation du temps** lors des pauses
- ✅ **Sessions de travail** avec sujets détaillés
- ✅ **Historique complet** des sessions par projet
- ✅ **Validation manuelle** des tâches effectuées
- ✅ **Sauvegarde automatique** périodique (30s)

### 🏷️ **Gestion des Tâches**
- ✅ **Sujets de travail** détaillés pour chaque session
- ✅ **Historique des sujets** avec suggestions automatiques
- ✅ **Modal de confirmation** lors de l'arrêt du timer
- ✅ **Modification possible** du sujet avant validation

### 📊 **Suivi et Historique**
- ✅ **Résumé quotidien** des sessions par sujet
- ✅ **Historique détaillé** avec heures de début/fin
- ✅ **Tri chronologique inverse** (plus récent en premier)
- ✅ **Suppression de sessions** avec mise à jour du temps total
- ✅ **Affichage adaptatif** (desktop/mobile)

### 🔄 **Modes de Fonctionnement**
- ✅ **Mode Timer** : Gestion de projets avec API
- ✅ **Mode Chronomètre** : Utilisation personnelle hors ligne
- ✅ **Basculement facile** entre les deux modes

### 🔐 **Sécurité et Authentification**
- ✅ **Système d'authentification** sécurisé
- ✅ **API centralisée** avec gestion des freelances
- ✅ **Restrictions d'interface** pendant le chronométrage
- ✅ **Sauvegarde de sécurité** avant déconnexion

### 🎨 **Interface Utilisateur**
- ✅ **Design moderne** et responsive
- ✅ **Interface verrouillée** pendant le timer actif
- ✅ **Messages informatifs** et tooltips
- ✅ **Panneau redimensionnable** sur desktop
- ✅ **Indicateurs visuels** d'état

## 🔌 Statuts de connexion & synchronisation hors ligne

La barre d'état en haut à droite affiche désormais clairement la situation réseau et la synchronisation hors ligne :

- **Déconnecté** (rouge) : la connexion est perdue, l'application tente automatiquement une reconnexion.
- **En cache** (ambre) : vos modifications sont sauvegardées localement et seront envoyées dès que possible.
- **Synchronisation en cours** (bleu) : la file hors ligne est en train d'être envoyée au serveur.
- **Synchronisation terminée** (vert) : toutes les données en attente ont été synchronisées avec succès.

Un badge discret apparaît aussi dans l'en-tête lorsque des éléments attendent l'envoi ; aucune action manuelle n'est nécessaire, l'application gère la synchronisation pour vous.

## 🛠️ Architecture Technique

### **Frontend**
- **React** avec hooks et contexte
- **Tailwind CSS** pour le styling
- **Lucide React** pour les icônes
- **Interface responsive** multi-écrans

### **Backend**
- **Electron** pour l'application desktop
- **IPC** pour la communication main/renderer
- **API REST** centralisée en PHP
- **Base de données MySQL**

### **Sauvegarde**
- **API centralisée** avec synchronisation temps réel
- **Gestion des conflits** et déduplication
- **Sauvegarde automatique** périodique
- **Recovery** en cas de fermeture inattendue

## 🗄️ Structure des Données

### **Projets**
```json
{
  "id": "unique_project_id",
  "name": "Nom du projet",
  "description": "Description détaillée",
  "clientName": "Nom du client",
  "company": "Entreprise",
  "totalTime": 0,
  "currentTime": 0,
  "status": "active|paused|stopped",
  "workSessions": [],
  "subjectHistory": [],
  "lastSaved": "timestamp"
}
```

### **Sessions de Travail**
```json
{
  "id": "session_id",
  "subject": "Sujet de la tâche",
  "startTime": "ISO_datetime",
  "endTime": "ISO_datetime", 
  "duration": 3600,
  "date": "YYYY-MM-DD"
}
```

## 🚀 Installation et Utilisation

### **Prérequis**
- Node.js (v16+)
- npm ou yarn
- Serveur web avec PHP 8.0+
- Base de données MySQL

### **Installation**
```bash
# Cloner le projet
git clone [repository-url]
cd Timer-project

# Installer les dépendances
npm install

# Démarrer en mode développement
npm run electron-dev

# Build pour production
npm run electron-pack
```

### **Configuration API**
1. Configurer la base de données MySQL
2. Déployer `api-timer.php` sur votre serveur
3. Configurer les credentials dans l'application
4. Tester la connexion

## 🔧 Configuration

### **Base de Données**
L'application utilise les tables suivantes :
- `freelances` : Informations des utilisateurs
- `projects` : Données des projets
- `project_logs` : Historique des sessions
- `clients` : Informations des clients

### **API Endpoints**
- `POST /api-timer.php?action=login` : Authentification
- `GET /api-timer.php?action=projects` : Liste des projets
- `POST /api-timer.php?action=save-project` : Sauvegarde projet

## 🌐 Plugin WordPress

Un plugin WordPress compagnon permet aux clients de consulter leur temps restant sur leurs projets via le nom de domaine correspondant au nom du projet.

**Fonctionnalités du plugin :**
- ✅ Affichage du temps de maintenance restant
- ✅ Historique des sessions par projet
- ✅ Interface client moderne
- ✅ Synchronisation automatique avec l'API

## 📱 Responsive Design

L'application s'adapte automatiquement à tous les types d'écrans :
- **Desktop** : Interface complète avec panneaux redimensionnables
- **Tablette** : Layout optimisé avec priorité au timer
- **Mobile** : Interface simplifiée et tactile

## 🛡️ Sécurité

### **Protections Implémentées**
- Interface verrouillée pendant le chronométrage
- Confirmation obligatoire pour les actions destructives
- Sauvegarde automatique avant déconnexion
- Gestion des erreurs réseau
- Récupération d'état après crash

### **Restrictions d'Interface**
Pendant qu'un timer est actif :
- ❌ Impossible de changer de projet
- ❌ Boutons de navigation désactivés  
- ❌ Modification/suppression de projets bloquée
- ❌ Déconnexion empêchée
- ✅ Indications visuelles claires

## 🎯 Workflow Utilisateur

1. **Connexion** avec identifiants API
2. **Sélection** d'un projet dans la liste
3. **Démarrage** du timer avec sujet de travail
4. **Pause/Reprise** selon les besoins
5. **Arrêt** avec confirmation du travail effectué
6. **Consultation** de l'historique et statistiques

## 🗺️ Roadmap d'Évolution

### 🎯 **Phase 1 - Optimisations Immédiates** _(Q1 2025)_
- 🔄 **Performance** : Optimisation du rendu et de la synchronisation
- 📱 **PWA** : Transformation en Progressive Web App
- ⌨️ **Raccourcis clavier** : Contrôles rapides (Space = Play/Pause, etc.)
- 🎨 **Thèmes** : Mode sombre et personnalisation des couleurs
- 📊 **Export de données** : PDF, Excel, CSV des rapports
- 🔔 **Notifications desktop** : Alertes et rappels personnalisables

### 💼 **Phase 2 - Fonctionnalités Business** _(Q2 2025)_
- 💰 **Gestion tarifaire** : Tarifs horaires et calcul automatique
- 🧾 **Facturation** : Génération de factures depuis les sessions
- 📈 **Tableau de bord** : Analytics avancées et métriques de productivité
- 👥 **Gestion d'équipe** : Multi-utilisateurs et attribution de projets
- 📅 **Planning intégré** : Calendrier et planification des tâches
- 🏷️ **Étiquettes et catégories** : Classification avancée des projets

### 🔗 **Phase 3 - Intégrations** _(Q3 2025)_
- 💬 **Slack/Teams** : Notifications et contrôles depuis les chats
- 📋 **Trello/Asana** : Synchronisation automatique des tâches
- 📧 **Google Calendar** : Intégration bidirectionnelle
- 💻 **GitHub/GitLab** : Tracking automatique depuis les commits
- 🌐 **API publique** : Endpoints pour intégrations tierces
- 📲 **Webhooks** : Notifications temps réel vers systèmes externes

### 📱 **Phase 4 - Applications Mobiles** _(Q4 2025)_
- 📱 **App mobile native** : iOS et Android (React Native)
- 🔄 **Synchronisation temps réel** : Multi-appareils instantané
- 📍 **Géolocalisation** : Tracking automatique par lieu
- 🎙️ **Commandes vocales** : "Démarre projet X", "Pause timer"
- 📷 **Scan QR Code** : Démarrage rapide de projets via QR
- 🔔 **Notifications push** : Rappels et alerts intelligents

### 🤖 **Phase 5 - Intelligence Artificielle** _(2026)_
- 🧠 **Suggestions automatiques** : Prédiction des tâches et temps
- 🕵️ **Détection d'inactivité** : Pause automatique intelligente
- 📊 **Analytics prédictives** : Estimation de fin de projet
- 🏷️ **Catégorisation auto** : Classification intelligente des tâches
- 📈 **Optimisation de productivité** : Recommandations personnalisées
- 🔍 **Recherche sémantique** : Recherche naturelle dans l'historique

### 🌐 **Phase 6 - Écosystème Avancé** _(2026+)_
- 🏢 **Version Enterprise** : SSO, Active Directory, compliance
- ☁️ **Infrastructure Cloud** : Scalabilité et haute disponibilité
- 🔒 **Sécurité renforcée** : Chiffrement end-to-end, audit trails
- 🌍 **Multi-langues** : Internationalisation complète
- 🎯 **Widgets bureau** : Mini-timers sur desktop
- 📊 **Business Intelligence** : Rapports exécutifs et KPIs avancés

## 🚀 **Innovations Futures**

### 💡 **Idées en Exploration**
- **Réalité Augmentée** : Timer overlay sur environnement de travail
- **IoT Integration** : Contrôles via boutons physiques intelligents
- **Biométrie** : Détection automatique de fatigue et pauses suggérées
- **Blockchain** : Horodatage cryptographique des sessions
- **Voice UI** : Assistant vocal dédié à la gestion du temps

### 📊 **Métriques d'Impact**
- **Productivité** : +30% d'efficacité dans le tracking
- **Précision** : 95% de précision dans le temps enregistré
- **Adoption** : Interface utilisable en < 30 secondes
- **Satisfaction** : Score NPS > 50 auprès des utilisateurs

## 🎯 **Contributions Communautaires**

### 🤝 **Comment Contribuer**
- **Feedback utilisateurs** : Suggestions et rapports de bugs
- **Beta testing** : Test des nouvelles fonctionnalités
- **Intégrations tierces** : Développement de connecteurs
- **Plugins** : Extensions personnalisées pour besoins spécifiques

### 💬 **Canaux de Communication**
- **Issues GitHub** : Bugs et demandes de fonctionnalités
- **Discussions** : Échanges sur les améliorations
- **Email** : Contact direct pour partenariats

---

*Cette roadmap est évolutive et peut être ajustée selon les besoins des utilisateurs et les opportunités technologiques.*

## 🤝 Contribution

Ce projet est développé pour une utilisation professionnelle de gestion du temps. Pour toute suggestion d'amélioration ou rapport de bug, veuillez contacter l'équipe de développement.

## 📄 Licence

Propriétaire - Tous droits réservés