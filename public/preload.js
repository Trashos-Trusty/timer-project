const { contextBridge, ipcRenderer } = require('electron');

// Exposer les APIs sécurisées à l'application React
contextBridge.exposeInMainWorld('electronAPI', {
  // Informations sur l'application
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Boîtes de dialogue
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  
  // Ouverture de liens externes
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Écouteurs d'événements du menu
  onMenuNewProject: (callback) => {
    ipcRenderer.on('menu-new-project', callback);
    return () => ipcRenderer.removeListener('menu-new-project', callback);
  },
  
  // API pour les projets (nouvelle architecture API REST)
  saveProject: (projectData, originalName = null) => ipcRenderer.invoke('save-project', projectData, originalName),
  loadProjects: () => ipcRenderer.invoke('load-projects'),
  loadProject: (projectId) => ipcRenderer.invoke('load-project', projectId),
  deleteProject: (projectId) => ipcRenderer.invoke('delete-project', projectId),
  
  // API pour la gestion du temps
  startTimer: (projectId) => ipcRenderer.invoke('start-timer', projectId),
  pauseTimer: (projectId) => ipcRenderer.invoke('pause-timer', projectId),
  stopTimer: (projectId) => ipcRenderer.invoke('stop-timer', projectId),
  
  // Écouteur pour les mises à jour du timer
  onTimerUpdate: (callback) => {
    ipcRenderer.on('timer-update', callback);
    return () => ipcRenderer.removeListener('timer-update', callback);
  },
  
  // Écouteur pour les changements de statut de connexion
  onConnectionStatusChanged: (callback) => {
    ipcRenderer.on('connection-status-changed', callback);
    return () => ipcRenderer.removeListener('connection-status-changed', callback);
  },
  
  // Gestion des erreurs de connexion
  handleConnectionError: () => ipcRenderer.invoke('handle-connection-error'),
  forceConnectionCheck: () => ipcRenderer.invoke('force-connection-check'),
  
  // Configuration API (remplace la configuration FTP)
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  setApiConfig: (config) => ipcRenderer.invoke('set-api-config', config),
  testApiConnection: () => ipcRenderer.invoke('test-api-connection'),
  isApiConfigured: () => ipcRenderer.invoke('is-api-configured'),
  
  // Authentification API
  authenticateApi: (credentials) => ipcRenderer.invoke('authenticate-api', credentials),
  authenticateUser: (credentials) => ipcRenderer.invoke('authenticate-api', credentials),
  hasValidToken: () => ipcRenderer.invoke('has-valid-token'),
  getFreelanceInfo: () => ipcRenderer.invoke('get-freelance-info'),
  clearToken: () => ipcRenderer.invoke('clear-token'),
  
  // Configuration générale
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config) => ipcRenderer.invoke('set-config', config),
  
  // Fonctions de mise à jour
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  cancelUpdate: () => ipcRenderer.invoke('cancel-update'),
  
  // Écouteurs d'événements pour les mises à jour
  onUpdateChecking: (callback) => {
    ipcRenderer.on('update-checking', callback);
    return () => ipcRenderer.removeListener('update-checking', callback);
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', callback);
    return () => ipcRenderer.removeListener('update-available', callback);
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on('update-not-available', callback);
    return () => ipcRenderer.removeListener('update-not-available', callback);
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', callback);
    return () => ipcRenderer.removeListener('update-downloaded', callback);
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', callback);
    return () => ipcRenderer.removeListener('download-progress', callback);
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', callback);
    return () => ipcRenderer.removeListener('update-error', callback);
  }
}); 