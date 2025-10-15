const { autoUpdater } = require('electron-updater');
const { dialog, shell } = require('electron');
const { ipcMain } = require('electron');

class UpdateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.updateInfo = null;
    this.isCheckingForUpdate = false;
    this.isUpdateAvailable = false;
    this.isUpdateDownloaded = false;
    this.hasNoReleasesOnGithub = false; // Flag pour désactiver les vérifications auto
    this.periodicCheckInterval = null; // Référence vers l'interval
    this.suppressAllPopups = false; // Flag pour supprimer tous les popups d'erreur
    
    this.initializeUpdater();
    this.setupEventListeners();
    this.setupIpcHandlers();
  }

  initializeUpdater() {
    // Vérifier si nous sommes en mode développement
    const isDev = process.env.NODE_ENV === 'development' || process.defaultApp;
    
    if (isDev) {
      console.log('🔄 UpdateManager initialisé (mode développement - auto-updater désactivé)');
      return;
    }

    // Configuration de l'auto-updater
    autoUpdater.checkForUpdatesAndNotify = false; // On gère manuellement
    autoUpdater.autoDownload = false; // On demande confirmation avant le téléchargement
    autoUpdater.allowPrerelease = false; // Seulement les versions stables
    autoUpdater.autoInstallOnAppQuit = false; // Pas d'installation automatique

    // Désactiver les notifications automatiques d'erreur de l'auto-updater
    if (autoUpdater.fullChangelog !== undefined) {
      autoUpdater.fullChangelog = false;
    }

    // Configuration des logs (utile pour le debug)
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'debug'; // Plus de détails

    console.log('🔄 UpdateManager initialisé');
  }

  setupEventListeners() {
    // Événement : Vérification des mises à jour
    autoUpdater.on('checking-for-update', () => {
      console.log('🔍 Vérification des mises à jour...');
      this.isCheckingForUpdate = true;
      this.sendToRenderer('update-checking');
    });

    // Événement : Mise à jour disponible
    autoUpdater.on('update-available', (info) => {
      console.log('🆕 Mise à jour disponible:', info.version);
      this.updateInfo = info;
      this.isCheckingForUpdate = false;
      this.isUpdateAvailable = true;
      this.sendToRenderer('update-available', info);
      this.showUpdateAvailableDialog(info);
    });

    // Événement : Pas de mise à jour
    autoUpdater.on('update-not-available', (info) => {
      console.log('✅ Application à jour (version:', info.version, ')');
      this.isCheckingForUpdate = false;
      this.isUpdateAvailable = false;
      this.sendToRenderer('update-not-available', info);
    });

    // Événement : Erreur lors de la vérification
    autoUpdater.on('error', (error) => {
      console.error('❌ Erreur lors de la mise à jour:', error);
      console.error('❌ Type d\'erreur:', typeof error);
      console.error('❌ Message d\'erreur:', error.message);
      console.error('❌ Stack:', error.stack);
      
      this.isCheckingForUpdate = false;
      
      // Si les popups sont supprimés, ne rien faire
      if (this.suppressAllPopups) {
        console.log('🔇 Popup supprimé - erreur ignorée');
        return;
      }
      
      // Vérifier si c'est une "erreur" normale (pas de releases sur GitHub)
      const normalErrors = [
        'No published version on Github',
        'latest version not published',
        'No published version on GitHub',
        'net::ERR_INTERNET_DISCONNECTED',
        'net::ERR_NAME_NOT_RESOLVED'
      ];
      
      const errorMessage = error.message || error.toString() || '';
      const isNormalError = normalErrors.some(normalError => 
        errorMessage.includes(normalError)
      );
      
      console.log('🔍 Vérification erreur normale:', isNormalError, 'pour message:', errorMessage);
      
      if (isNormalError) {
        console.log('ℹ️ Aucune mise à jour disponible sur GitHub - suppression des futures vérifications');
        this.hasNoReleasesOnGithub = true; // Marquer qu'il n'y a pas de releases
        this.suppressAllPopups = true; // Supprimer tous les futurs popups
        
        // Arrêter les vérifications périodiques si pas de releases
        if (this.periodicCheckInterval) {
          clearInterval(this.periodicCheckInterval);
          this.periodicCheckInterval = null;
          console.log('⏹️ Vérifications périodiques désactivées (pas de releases GitHub)');
        }
        
        // Désactiver complètement l'auto-updater pour éviter les vérifications automatiques
        try {
          autoUpdater.removeAllListeners('error');
          autoUpdater.removeAllListeners('checking-for-update');
          autoUpdater.removeAllListeners('update-available');
          autoUpdater.removeAllListeners('update-not-available');
          console.log('🔇 Auto-updater complètement désactivé');
        } catch (e) {
          console.log('⚠️ Erreur lors de la désactivation auto-updater:', e.message);
        }
        
        this.sendToRenderer('update-not-available', { version: require('electron').app.getVersion() });
        // NE PAS afficher de popup du tout pour les erreurs normales
        return;
      } else {
        console.log('❌ Vraie erreur détectée - affichage du popup');
        this.sendToRenderer('update-error', error);
        this.showUpdateErrorDialog(error);
      }
    });

    // Événement : Progression du téléchargement
    autoUpdater.on('download-progress', (progressObj) => {
      let logMessage = `📥 Téléchargement: ${Math.round(progressObj.percent)}%`;
      logMessage += ` (${Math.round(progressObj.bytesPerSecond / 1024)} Ko/s)`;
      console.log(logMessage);
      this.sendToRenderer('update-download-progress', progressObj);
    });

    // Événement : Téléchargement terminé
    autoUpdater.on('update-downloaded', (info) => {
      console.log('✅ Mise à jour téléchargée:', info.version);
      this.isUpdateDownloaded = true;
      this.sendToRenderer('update-downloaded', info);
      this.showUpdateReadyDialog(info);
    });
  }

  setupIpcHandlers() {
    // Handler : Vérifier les mises à jour manuellement
    ipcMain.handle('check-for-updates', async () => {
      return this.checkForUpdates();
    });

    // Handler : Télécharger la mise à jour
    ipcMain.handle('download-update', async () => {
      return this.downloadUpdate();
    });

    // Handler : Installer et redémarrer
    ipcMain.handle('install-update', async () => {
      return this.installUpdate();
    });

    // Handler : Obtenir le statut des mises à jour
    ipcMain.handle('get-update-status', async () => {
      return {
        isCheckingForUpdate: this.isCheckingForUpdate,
        isUpdateAvailable: this.isUpdateAvailable,
        isUpdateDownloaded: this.isUpdateDownloaded,
        updateInfo: this.updateInfo
      };
    });

    // Handler : Annuler la mise à jour
    ipcMain.handle('cancel-update', async () => {
      this.isUpdateAvailable = false;
      this.isUpdateDownloaded = false;
      this.updateInfo = null;
      this.sendToRenderer('update-cancelled');
      return true;
    });
  }

  async checkForUpdates() {
    try {
      if (this.isCheckingForUpdate) {
        console.log('⏳ Vérification déjà en cours...');
        return false;
      }
      
      // Vérifier si nous sommes en mode développement
      const isDev = process.env.NODE_ENV === 'development' || process.defaultApp;

      if (isDev) {
        console.log('🔍 Mode développement: simulation de vérification des mises à jour...');
        this.isCheckingForUpdate = true;
        this.sendToRenderer('update-checking');
        
        // Simuler une vérification
        setTimeout(() => {
          this.isCheckingForUpdate = false;
          console.log('ℹ️ Mode développement: aucune mise à jour disponible (simulation)');
          this.sendToRenderer('update-not-available', { 
            version: require('electron').app.getVersion() 
          });
        }, 1000);
        
        return true;
      }

      console.log('🔍 Vérification manuelle des mises à jour...');
      const result = await autoUpdater.checkForUpdates();
      return result !== null;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification:', error);
      return false;
    }
  }

  async downloadUpdate() {
    try {
      if (!this.isUpdateAvailable) {
        console.log('⚠️ Aucune mise à jour disponible à télécharger');
        return false;
      }

      console.log('📥 Démarrage du téléchargement...');
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      console.error('❌ Erreur lors du téléchargement:', error);
      return false;
    }
  }

  async installUpdate() {
    try {
      if (!this.isUpdateDownloaded) {
        console.log('⚠️ Aucune mise à jour téléchargée à installer');
        return false;
      }

      console.log('🔄 Installation et redémarrage...');
      autoUpdater.quitAndInstall();
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de l\'installation:', error);
      return false;
    }
  }

  showUpdateAvailableDialog(info) {
    const options = {
      type: 'info',
      title: 'Mise à jour disponible',
      message: `Une nouvelle version (${info.version}) est disponible !`,
      detail: `Version actuelle : ${require('electron').app.getVersion()}\nNouvelle version : ${info.version}\n\n${info.releaseNotes || 'Améliorations et corrections de bugs.'}`,
      buttons: ['Télécharger maintenant', 'Plus tard', 'Voir les détails'],
      defaultId: 0,
      cancelId: 1
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      switch (result.response) {
        case 0: // Télécharger maintenant
          this.downloadUpdate();
          break;
        case 1: // Plus tard
          console.log('📅 Mise à jour reportée');
          break;
        case 2: // Voir les détails
          if (info.releaseNotesUrl) {
            shell.openExternal(info.releaseNotesUrl);
          }
          break;
      }
    });
  }

  showUpdateReadyDialog(info) {
    const options = {
      type: 'info',
      title: 'Mise à jour prête',
      message: `La mise à jour vers la version ${info.version} est prête !`,
      detail: 'L\'application va redémarrer pour appliquer la mise à jour.',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      if (result.response === 0) {
        this.installUpdate();
      } else {
        console.log('📅 Installation reportée');
      }
    });
  }

  showUpdateErrorDialog(error) {
    console.log('🚨 showUpdateErrorDialog appelée avec:', error.message || error.toString());
    
    // Si les popups sont supprimés, ne rien afficher
    if (this.suppressAllPopups) {
      console.log('🔇 showUpdateErrorDialog: Popup supprimé');
      return;
    }
    
    // Ne pas afficher de popup pour certaines "erreurs" normales
    const normalErrors = [
      'No published version on Github',
      'No published version on GitHub',
      'latest version not published',
      'net::ERR_INTERNET_DISCONNECTED',
      'net::ERR_NAME_NOT_RESOLVED'
    ];
    
    const errorMessage = error.message || error.toString() || '';
    const isNormalError = normalErrors.some(normalError => 
      errorMessage.includes(normalError)
    );
    
    if (isNormalError) {
      console.log('ℹ️ showUpdateErrorDialog: Erreur normale détectée, aucun popup affiché');
      
      // Marquer qu'il n'y a plus de releases disponibles pour éviter les vérifications futures
      this.hasNoReleasesOnGithub = true;
      this.suppressAllPopups = true; // Supprimer les futurs popups automatiques
      
      // Envoyer un événement "pas de mise à jour" au renderer
      this.sendToRenderer('update-not-available', { version: require('electron').app.getVersion() });
      return;
    }
    
    console.log('🚨 showUpdateErrorDialog: Affichage du popup pour vraie erreur:', errorMessage);
    
    // Afficher la popup pour les vraies erreurs techniques
    const options = {
      type: 'error',
      title: 'Erreur de mise à jour',
      message: 'Une erreur est survenue lors de la vérification des mises à jour',
      detail: errorMessage,
      buttons: ['OK']
    };

    dialog.showMessageBox(this.mainWindow, options);
  }

  sendToRenderer(channel, data = null) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // Vérification automatique au démarrage (appelée après 30 secondes)
  scheduleInitialCheck() {
    setTimeout(() => {
      console.log('⏰ Vérification automatique des mises à jour au démarrage');
      this.checkForUpdates();
    }, 30000); // 30 secondes après le démarrage
  }

  // Vérification périodique (toutes les 24 heures au lieu de 6 heures)
  schedulePeriodicCheck() {
    this.periodicCheckInterval = setInterval(() => {
      // Ne pas vérifier si on sait déjà qu'il n'y a pas de releases
      if (this.hasNoReleasesOnGithub) {
        console.log('⏹️ Vérification périodique annulée (pas de releases GitHub)');
        return;
      }
      
      console.log('⏰ Vérification périodique des mises à jour');
      this.checkForUpdates();
    }, 24 * 60 * 60 * 1000); // 24 heures
  }
}

module.exports = UpdateManager; 