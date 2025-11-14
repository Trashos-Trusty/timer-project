const { app, BrowserWindow, Menu, ipcMain, shell, powerMonitor } = require('electron');
const path = require('path');
const log = require('electron-log/main');

// Remplacer electron-is-dev par une vérification simple
const isDev = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath);

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
};

function setupProductionLogging() {
  try {
    log.transports.file.level = 'debug';
    log.transports.file.maxSize = 10 * 1024 * 1024; // 10 Mo pour éviter un fichier trop volumineux
    log.transports.console.level = 'debug';

    const logFile = log.transports.file.getFile();

    Object.assign(console, log.functions);

    log.info('📝 Journalisation production activée (niveau debug)');
    if (logFile?.path) {
      log.info(`📄 Fichier de logs: ${logFile.path}`);
    }

    app.on('browser-window-created', (_event, window) => {
      window.webContents.on('console-message', (_e, level, message, line, sourceId) => {
        const levelMap = {
          0: 'info',
          1: 'warn',
          2: 'error',
          3: 'info',
          4: 'debug',
        };

        const logger = log[levelMap[level]] || log.info;
        const source = sourceId ? sourceId.replace(appStartUrl, '').trim() : 'renderer';
        logger(`[renderer:${source}:${line}] ${message}`);
      });
    });
  } catch (error) {
    originalConsole.error('❌ Impossible d\'initialiser la journalisation production:', error);
  }
}

// Imports directs depuis public/utils (toujours disponible)
const ConfigManager = require('./utils/configManager');
const ApiManager = require('./utils/apiManager');
const UpdateManager = require('./utils/updateManager');
const offlineQueue = require('./services/offlineQueue');

// Variables globales
let mainWindow;
let miniWindow;
let configManager;
let apiManager;
let updateManager;
let lastMiniTimerSnapshot = null;

const NETWORK_PING_INTERVAL = 60 * 1000;
let networkMonitorInterval = null;
let isNetworkReachable = null;
let isDrainingOfflineQueue = false;

const appStartUrl = isDev
  ? 'http://localhost:3000'
  : `file://${path.join(__dirname, '../build/index.html')}`;

if (!isDev) {
  setupProductionLogging();
}

function broadcastOfflineStatus(payload) {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('offline-sync-status', payload);
    }
  });
}

function isNetworkError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if (error.isNetworkError) {
    return true;
  }

  const status = error.status || error.statusCode;
  if (status && [502, 503, 504].includes(status)) {
    return true;
  }

  const code = error.code || error.networkCode;
  if (code && /ECONN|EAI_AGAIN|ENOTFOUND|ETIMEDOUT/i.test(String(code))) {
    return true;
  }

  const name = error.name || '';
  if (name === 'TypeError') {
    return true;
  }

  const message = error.message || '';
  return /fetch|network|connexion|ECONN|EAI_AGAIN|ENOTFOUND|ETIMEDOUT/i.test(message);
}

async function attemptOfflineSync({ skipConnectivityCheck = false } = {}) {
  if (!apiManager || !configManager || !configManager.isApiConfigured()) {
    return;
  }

  const pending = await offlineQueue.getPending();
  if (!pending.length || isDrainingOfflineQueue) {
    return;
  }

  if (!skipConnectivityCheck) {
    try {
      await apiManager.testConnection();
      isNetworkReachable = true;
    } catch (error) {
      if (isNetworkError(error)) {
        isNetworkReachable = false;
        broadcastOfflineStatus({
          status: 'offline',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.error('Erreur inattendue lors du test réseau:', error);
      }
      return;
    }
  }

  isDrainingOfflineQueue = true;
  broadcastOfflineStatus({
    status: 'started',
    total: pending.length,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await offlineQueue.drain(async (projectData, originalName = null) => {
      await apiManager.saveProject(projectData, originalName);
    });

    if (result.failed === 0) {
      broadcastOfflineStatus({
        status: 'success',
        processed: result.processed,
        pending: 0,
        timestamp: new Date().toISOString(),
      });
    } else if (result.processed > 0) {
      broadcastOfflineStatus({
        status: 'partial',
        processed: result.processed,
        failed: result.failed,
        pending: result.failed,
        timestamp: new Date().toISOString(),
      });
    } else {
      broadcastOfflineStatus({
        status: 'error',
        failed: result.failed,
        pending: result.failed,
        message: 'Aucune entrée n\'a pu être synchronisée.',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Erreur lors de la resynchronisation hors ligne:', error);
    broadcastOfflineStatus({
      status: 'error',
      message: error.message,
      pending: await offlineQueue.getPending().then((items) => items.length).catch(() => null),
      timestamp: new Date().toISOString(),
    });
  } finally {
    isDrainingOfflineQueue = false;
  }
}

function startNetworkWatcher() {
  if (networkMonitorInterval) {
    return;
  }

  const checkConnectivity = async () => {
    if (!apiManager || !configManager || !configManager.isApiConfigured()) {
      return;
    }

    const pending = await offlineQueue.getPending();
    if (!pending.length) {
      return;
    }

    try {
      await apiManager.testConnection();
      if (!isNetworkReachable) {
        isNetworkReachable = true;
        broadcastOfflineStatus({
          status: 'online',
          timestamp: new Date().toISOString(),
        });
      }
      await attemptOfflineSync({ skipConnectivityCheck: true });
    } catch (error) {
      if (isNetworkError(error)) {
        if (isNetworkReachable !== false) {
          isNetworkReachable = false;
          broadcastOfflineStatus({
            status: 'offline',
            message: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        console.error('Erreur inattendue lors de la vérification réseau périodique:', error);
      }
    }
  };

  networkMonitorInterval = setInterval(() => {
    checkConnectivity().catch((error) => {
      console.error('Erreur lors du watcher réseau:', error);
    });
  }, NETWORK_PING_INTERVAL);

  checkConnectivity().catch((error) => {
    console.error('Erreur lors de la vérification réseau initiale:', error);
  });
}

function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    return miniWindow;
  }

  miniWindow = new BrowserWindow({
    width: 320,
    height: 160,
    resizable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  miniWindow.setAlwaysOnTop(true, 'floating');
  miniWindow.loadURL(`${appStartUrl}#mini`);

  miniWindow.once('ready-to-show', () => {
    miniWindow.show();
    if (lastMiniTimerSnapshot) {
      miniWindow.webContents.send('mini-timer-snapshot', lastMiniTimerSnapshot);
    }
  });

  miniWindow.webContents.on('did-finish-load', () => {
    if (lastMiniTimerSnapshot) {
      miniWindow.webContents.send('mini-timer-snapshot', lastMiniTimerSnapshot);
    }
  });

  miniWindow.on('closed', () => {
    miniWindow = null;
  });

  return miniWindow;
}

function bringMainWindowToFront() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    const wasAlwaysOnTop = mainWindow.isAlwaysOnTop();
    const canSetVisibleEverywhere = typeof mainWindow.setVisibleOnAllWorkspaces === 'function';

    try {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    } catch (error) {
      console.warn("Impossible d'activer temporairement alwaysOnTop:", error);
    }

    if (canSetVisibleEverywhere) {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    if (process.platform === 'darwin') {
      app.focus({ steal: true });
    } else {
      app.focus();
    }

    mainWindow.show();
    mainWindow.focus();

    if (typeof mainWindow.moveTop === 'function') {
      mainWindow.moveTop();
    }

    mainWindow.flashFrame(true);

    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      if (!wasAlwaysOnTop) {
        mainWindow.setAlwaysOnTop(false);
      }

      if (canSetVisibleEverywhere) {
        mainWindow.setVisibleOnAllWorkspaces(false);
      }

      mainWindow.flashFrame(false);
    }, 2000);
  } catch (error) {
    console.error('Erreur lors de la mise au premier plan de la fenêtre principale:', error);
  }
}

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
      safeDialogsMessage: 'Cette application a tenté d\'ouvrir plusieurs boîtes de dialogue',
      backgroundThrottling: false,
    },
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'icon.png'),
    show: false
  });

  // Charger l'application React
  console.log('🚀 Chargement de l\'URL:', appStartUrl);
  console.log('📁 __dirname:', __dirname);
  console.log('🏗️ isDev:', isDev);

  mainWindow.loadURL(appStartUrl);
  
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
  const viewSubmenu = [
    { role: 'reload', label: 'Actualiser' },
    { role: 'forcereload', label: 'Actualiser (force)' }
  ];

  viewSubmenu.push({ role: 'toggledevtools', label: 'Outils de développement' });

  viewSubmenu.push({ type: 'separator' });

  viewSubmenu.push(
    { role: 'resetzoom', label: 'Zoom normal' },
    { role: 'zoomin', label: 'Zoom avant' },
    { role: 'zoomout', label: 'Zoom arrière' }
  );

  viewSubmenu.push({ type: 'separator' });
  viewSubmenu.push({ role: 'togglefullscreen', label: 'Plein écran' });

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
      submenu: viewSubmenu
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
  startNetworkWatcher();
});

app.on('window-all-closed', async () => {
  // Nettoyer les ressources API
  if (apiManager) {
    await apiManager.cleanup();
  }

  if (networkMonitorInterval) {
    clearInterval(networkMonitorInterval);
    networkMonitorInterval = null;
  }

  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.destroy();
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

app.on('before-quit', () => {
  if (networkMonitorInterval) {
    clearInterval(networkMonitorInterval);
    networkMonitorInterval = null;
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
    if (isNetworkError(error)) {
      console.warn('Connexion indisponible, mise en attente de la sauvegarde:', error);
      try {
        await offlineQueue.enqueue({ projectData, originalName });
        const pending = await offlineQueue.getPending();
        broadcastOfflineStatus({
          status: 'queued',
          pending: pending.length,
          projectId: projectData?.id ?? null,
          timestamp: new Date().toISOString(),
        });
        return { ...projectData, queued: true };
      } catch (queueError) {
        console.error('Impossible de mettre la sauvegarde hors ligne en file d\'attente:', queueError);
      }
    }

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
    return {
      success: false,
      message: error.message,
      code: error.code || null
    };
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
    return {
      success: false,
      message: error.message,
      code: error.code || null
    };
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

ipcMain.handle('set-mini-timer-visibility', async (event, shouldShow) => {
  try {
    if (shouldShow) {
      const window = createMiniWindow();
      if (window && !window.isDestroyed()) {
        window.show();
      }
    } else if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.hide();
    }

    return true;
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la fenêtre mini-timer:', error);
    return false;
  }
});

ipcMain.handle('show-main-window', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      bringMainWindowToFront();
    }

    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.hide();
    }

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'affichage de la fenêtre principale:', error);
    return false;
  }
});

ipcMain.handle('minimize-main-window', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
      return true;
    }

    return false;
  } catch (error) {
    console.error('Erreur lors de la réduction de la fenêtre principale:', error);
    return false;
  }
});

ipcMain.handle('get-system-idle-time', async () => {
  try {
    if (!powerMonitor || typeof powerMonitor.getSystemIdleTime !== 'function') {
      return null;
    }

    const idleTime = powerMonitor.getSystemIdleTime();

    if (typeof idleTime === 'number' && Number.isFinite(idleTime) && idleTime >= 0) {
      return idleTime;
    }

    return null;
  } catch (error) {
    console.error('Erreur lors de la récupération du temps d\'inactivité système:', error);
    return null;
  }
});

ipcMain.handle('mini-timer-action', async (_event, payload) => {
  try {
    const actionType = typeof payload === 'string' ? payload : payload?.type;

    if (!actionType) {
      return false;
    }

    const normalizedPayload =
      payload && typeof payload === 'object'
        ? { ...payload, type: actionType }
        : { type: actionType };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mini-timer-action', normalizedPayload);
    }

    if (['stop', 'expand'].includes(actionType)) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }

      if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.hide();
      }
    }

    return true;
  } catch (error) {
    console.error('Erreur lors du traitement de l\'action mini-timer:', error);
    return false;
  }
});

ipcMain.on('mini-timer-snapshot', (event, snapshot) => {
  try {
    lastMiniTimerSnapshot = snapshot;

    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('mini-timer-snapshot', snapshot);
    }
  } catch (error) {
    console.error('Erreur lors de l\'envoi du snapshot du mini-timer:', error);
  }
});

ipcMain.handle('request-mini-timer-snapshot', () => {
  return lastMiniTimerSnapshot;
});
