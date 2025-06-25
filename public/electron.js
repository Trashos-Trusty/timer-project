const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');

// Remplacer electron-is-dev par une vérification simple
const isDev = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath);

const ConfigManager = require('../src/utils/configManager');
const ApiManager = require('../src/utils/apiManager');
const UpdateManager = require('../src/utils/updateManager');

// Variables globales
let mainWindow;
let configManager;
let apiManager;
let updateManager;

function createWindow() {
  // Créer la fenêtre principale de l'application
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'icon.png'),
    show: false
  });

  // Charger l'application React
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  mainWindow.loadURL(startUrl);
  
  // Sécurité supplémentaire : Intercepter les nouvelles fenêtres
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Permettre uniquement les URLs sûres ou les ouvrir dans le navigateur externe
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Sécurité : Bloquer la navigation vers des URLs externes
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Permettre seulement les URLs locales et l'API
    if (parsedUrl.origin !== 'http://localhost:3000' && 
        parsedUrl.origin !== 'file://' && 
        !parsedUrl.origin.includes('trusty-projet.fr')) {
      event.preventDefault();
    }
  });

  // Afficher la fenêtre quand elle est prête
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Initialiser l'UpdateManager après que la fenêtre soit prête
    if (!isDev) {
      updateManager = new UpdateManager(mainWindow);
      updateManager.scheduleInitialCheck();
      updateManager.schedulePeriodicCheck();
    }
    
    // Ouvrir les DevTools en mode développement
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Menu de l'application
function createMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouveau Projet',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Actualiser' },
        { role: 'forcereload', label: 'Actualiser (force)' },
        { role: 'toggledevtools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'resetzoom', label: 'Zoom normal' },
        { role: 'zoomin', label: 'Zoom avant' },
        { role: 'zoomout', label: 'Zoom arrière' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Événements de l'application
app.whenReady().then(async () => {
  // Configuration de sécurité CSP dynamique
  if (!isDev) {
    // En production, CSP plus strict
    app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
  }
  
  // Initialiser les gestionnaires
  configManager = ConfigManager; // ConfigManager est déjà une instance
  apiManager = new ApiManager();
  
  // Charger la configuration
  await configManager.loadConfig();
  const apiConfig = configManager.getApiConfig();
  apiManager.setConfig(apiConfig);
  
  // Initialiser la connexion API si configurée
  if (configManager.isApiConfigured()) {
    console.log('🔌 Initialisation de la connexion API...');
    try {
      // Charger le token local s'il existe
      await apiManager.loadTokenLocally();
      console.log('✅ Connexion API initialisée avec succès');
    } catch (error) {
      console.warn('⚠️ Erreur lors de l\'initialisation API:', error.message);
    }
  } else {
    console.log('ℹ️ Configuration API manquante, connexion non initialisée');
  }
  
  createWindow();
  createMenu();
});

app.on('window-all-closed', async () => {
  // Nettoyer les ressources API
  if (apiManager) {
    await apiManager.cleanup();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers pour la communication avec le renderer
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-message-box', async (event, options) => {
  const { dialog } = require('electron');
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

// Ouverture de liens externes dans le navigateur par défaut
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de l\'ouverture du lien externe:', error);
    return { success: false, error: error.message };
  }
});

// Gestion des projets avec API
ipcMain.handle('load-projects', async () => {
  try {
    if (!configManager.isApiConfigured()) {
      console.log('API non configuré, retour d\'une liste vide');
      return [];
    }
    
    return await apiManager.loadProjects();
  } catch (error) {
    console.error('Erreur lors du chargement des projets:', error);
    return [];
  }
});

ipcMain.handle('load-project', async (event, projectId) => {
  try {
    if (!configManager.isApiConfigured()) {
      console.log('API non configuré, impossible de charger le projet');
      return null;
    }
    
    // Charger tous les projets et trouver celui avec l'ID correspondant
    const projects = await apiManager.loadProjects();
    const project = projects.find(p => p.id === projectId);
    
    if (project) {
      console.log('✅ Projet trouvé:', project.name);
      return project;
    } else {
      console.log('❌ Projet non trouvé avec l\'ID:', projectId);
      return null;
    }
  } catch (error) {
    console.error('Erreur lors du chargement du projet:', error);
    return null;
  }
});

ipcMain.handle('save-project', async (event, projectData, originalName = null) => {
  try {
    if (!configManager.isApiConfigured()) {
      throw new Error('Configuration API requise');
    }
    
    // Debug: Afficher les paramètres reçus par Electron
    console.log('⚡ Electron reçoit:', {
      projectId: projectData.id,
      projectName: projectData.name,
      originalName: originalName,
      hasOriginalName: !!originalName
    });
    
    await apiManager.saveProject(projectData, originalName);
    console.log('Projet sauvegardé via API:', projectData.name);
    return projectData;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
    throw error;
  }
});

ipcMain.handle('delete-project', async (event, projectId) => {
  try {
    if (!configManager.isApiConfigured()) {
      throw new Error('Configuration API requise');
    }
    
    // Charger d'abord les projets pour trouver le nom
    const projects = await apiManager.loadProjects();
    const project = projects.find(p => p.id === projectId);
    
    if (project) {
      await apiManager.deleteProject(project.name);
      console.log('Projet supprimé via API:', project.name);
    }
    
    return true;
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    throw error;
  }
});

// Gestion de la configuration API
ipcMain.handle('get-api-config', async () => {
  return configManager.getApiConfig();
});

ipcMain.handle('set-api-config', async (event, apiConfig) => {
  try {
    await configManager.setApiConfig(apiConfig);
    apiManager.setConfig(apiConfig);
    console.log('Configuration API mise à jour');
    return true;
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la config API:', error);
    return false;
  }
});

ipcMain.handle('test-api-connection', async () => {
  try {
    if (!configManager.isApiConfigured()) {
      return { success: false, message: 'Configuration API incomplète' };
    }
    
    const result = await apiManager.testConnection();
    return result;
  } catch (error) {
    console.error('Erreur lors du test API:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('is-api-configured', async () => {
  return configManager.isApiConfigured();
});

// Authentification API
ipcMain.handle('authenticate-api', async (event, credentials) => {
  try {
    const result = await apiManager.authenticate(credentials);
    return result;
  } catch (error) {
    console.error('Erreur lors de l\'authentification API:', error);
    return { success: false, message: error.message };
  }
});

// Vérification du token
ipcMain.handle('has-valid-token', async () => {
  try {
    return await apiManager.verifyToken();
  } catch (error) {
    console.error('Erreur lors de la vérification du token:', error);
    return false;
  }
});

// Informations du freelance
ipcMain.handle('get-freelance-info', async () => {
  try {
    const config = configManager.getFreelanceConfig();
    return config;
  } catch (error) {
    console.error('Erreur lors de la récupération des infos freelance:', error);
    return null;
  }
});

// Effacer le token
ipcMain.handle('clear-token', async () => {
  try {
    // Effacer le token de l'API Manager
    apiManager.config.token = null;
    apiManager.config.freelanceId = null;
    
    // Effacer le token local sauvegardé
    await apiManager.clearTokenLocally();
    
    console.log('✅ Token effacé');
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'effacement du token:', error);
    return false;
  }
});

// Configuration générale
ipcMain.handle('get-config', async () => {
  return configManager.getConfig();
});

ipcMain.handle('set-config', async (event, config) => {
  try {
    await configManager.setConfig(config);
    console.log('Configuration générale mise à jour');
    return true;
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la configuration:', error);
    return false;
  }
});

// Handlers pour les mises à jour
ipcMain.handle('check-for-updates', async () => {
  try {
    if (isDev) {
      // En mode développement, simuler une vérification
      console.log('🔍 Mode développement - Simulation de vérification de mise à jour');
      if (mainWindow) {
        mainWindow.webContents.send('update-checking');
        
        // Simuler une réponse après 2 secondes
        setTimeout(() => {
          mainWindow.webContents.send('update-not-available');
        }, 2000);
      }
      return { success: true, message: 'Vérification simulée en mode développement' };
    }
    
    if (updateManager) {
      await updateManager.checkForUpdates();
      return { success: true, message: 'Vérification des mises à jour démarrée' };
    } else {
      throw new Error('UpdateManager non initialisé');
    }
  } catch (error) {
    console.error('Erreur lors de la vérification des mises à jour:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    if (isDev) {
      console.log('🔽 Mode développement - Simulation de téléchargement');
      if (mainWindow) {
        // Simuler un téléchargement progressif
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          mainWindow.webContents.send('download-progress', {
            percent: progress,
            transferred: progress * 1024 * 1024,
            total: 100 * 1024 * 1024
          });
          
          if (progress >= 100) {
            clearInterval(interval);
            mainWindow.webContents.send('update-downloaded', {
              version: '1.0.1',
              releaseDate: new Date().toISOString()
            });
          }
        }, 500);
      }
      return { success: true, message: 'Téléchargement simulé en mode développement' };
    }
    
    if (updateManager) {
      await updateManager.downloadUpdate();
      return { success: true, message: 'Téléchargement de la mise à jour démarré' };
    } else {
      throw new Error('UpdateManager non initialisé');
    }
  } catch (error) {
    console.error('Erreur lors du téléchargement:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  try {
    if (isDev) {
      console.log('🔧 Mode développement - Simulation d\'installation');
      return { success: true, message: 'Installation simulée en mode développement' };
    }
    
    if (updateManager) {
      updateManager.quitAndInstall();
      return { success: true, message: 'Installation de la mise à jour en cours...' };
    } else {
      throw new Error('UpdateManager non initialisé');
    }
  } catch (error) {
    console.error('Erreur lors de l\'installation:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('cancel-update', async () => {
  try {
    console.log('❌ Annulation de la mise à jour');
    // Pas d'action spécifique nécessaire, juste confirmer l'annulation
    return { success: true, message: 'Mise à jour annulée' };
  } catch (error) {
    console.error('Erreur lors de l\'annulation:', error);
    return { success: false, message: error.message };
  }
}); 