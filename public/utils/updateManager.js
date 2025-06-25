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
    
    this.initializeUpdater();
    this.setupEventListeners();
    this.setupIpcHandlers();
  }

  initializeUpdater() {
    // Configuration de l'auto-updater
    autoUpdater.checkForUpdatesAndNotify = false; // On gère manuellement
    autoUpdater.autoDownload = false; // On demande confirmation avant le téléchargement
    autoUpdater.allowPrerelease = false; // Seulement les versions stables
    
    // Configuration des logs (utile pour le debug)
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'info';
    
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
      this.isCheckingForUpdate = false;
      this.sendToRenderer('update-error', error);
      this.showUpdateErrorDialog(error);
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
      detail: `Version actuelle : ${require('../../package.json').version}\nNouvelle version : ${info.version}\n\n${info.releaseNotes || 'Améliorations et corrections de bugs.'}`,
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
    const options = {
      type: 'error',
      title: 'Erreur de mise à jour',
      message: 'Une erreur est survenue lors de la vérification des mises à jour',
      detail: error.message,
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

  // Vérification périodique (toutes les 6 heures)
  schedulePeriodicCheck() {
    setInterval(() => {
      console.log('⏰ Vérification périodique des mises à jour');
      this.checkForUpdates();
    }, 6 * 60 * 60 * 1000); // 6 heures
  }
}

module.exports = UpdateManager; 