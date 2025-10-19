const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');

// Remplacer electron-is-dev par une vérification simple
const isDev = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath);

// Imports directs depuis public/utils (toujours disponible)
const ConfigManager = require('./utils/configManager');
const ApiManager = require('./utils/apiManager');
const UpdateManager = require('./utils/updateManager');

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
      sandbox: false, // Garder à false pour React
      preload: path.join(__dirname, 'preload.js'),
      // Sécurité renforcée
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      safeDialogs: true,
      safeDialogsMessage: 'Cette application a tenté d\'ouvrir plusieurs boîtes de dialogue'
    },
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'icon.png'),
    show: false
  });

  // Charger l'application React
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  console.log('🚀 Chargement de l\'URL:', startUrl);
  console.log('📁 __dirname:', __dirname);
  console.log('🏗️ isDev:', isDev);
  
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
    
    // Initialiser l'UpdateManager (toujours pour les handlers IPC)
    updateManager = new UpdateManager(mainWindow);
    
    // Désactiver complètement les vérifications automatiques pour éviter les popups
    // Les utilisateurs peuvent vérifier manuellement s'ils le souhaitent
    // if (!isDev) {
    //   updateManager.scheduleInitialCheck();
    //   updateManager.schedulePeriodicCheck();
    // }
    console.log('⚠️ Vérifications automatiques de mise à jour désactivées pour éviter les popups');
    
    // Ouvrir les DevTools pour déboguer
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
  
  try {
    // Créer les instances des gestionnaires
    configManager = ConfigManager; // ConfigManager est déjà une instance, pas une classe
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
  } catch (error) {
    console.error('⚠️ Erreur lors de l\'initialisation des gestionnaires:', error);
    // En cas d'erreur, créer des instances nulles
    configManager = null;
    apiManager = null;
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
    if (!configManager || !configManager.isApiConfigured()) {
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
    if (!configManager || !configManager.isApiConfigured()) {
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
    if (!configManager || !configManager.isApiConfigured()) {
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
    if (!configManager || !configManager.isApiConfigured()) {
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
  if (!configManager) {
    return { baseUrl: '', username: '', password: '' };
  }
  return configManager.getApiConfig();
});

ipcMain.handle('set-api-config', async (event, apiConfig) => {
  try {
    if (!configManager || !apiManager) {
      throw new Error('Gestionnaires non disponibles');
    }
    
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

// Feedback utilisateur pendant la bêta
ipcMain.handle('send-feedback', async (event, feedbackData) => {
  try {
    if (!configManager || !configManager.isApiConfigured()) {
      throw new Error('Configuration API requise pour envoyer un feedback');
    }

    if (!apiManager) {
      throw new Error('Gestionnaire API indisponible');
    }

    const result = await apiManager.sendFeedback(feedbackData);

    return { success: true, data: result };
  } catch (error) {
    console.error('Erreur lors de l\'envoi du feedback:', error);
    return { success: false, message: error.message };
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

// Les handlers pour les mises à jour sont gérés par UpdateManager dans updateManager.js 