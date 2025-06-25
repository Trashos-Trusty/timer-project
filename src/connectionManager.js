// Mock de ConnectionManager pour le côté React
// Communique avec Electron via IPC

class ConnectionManagerMock {
  constructor() {
    this.listeners = [];
    this.status = {
      isOnline: true,
      isRetrying: false,
      retryCount: 0
    };
    
    // Écouter les événements de connexion depuis Electron
    if (window.electronAPI) {
      window.electronAPI.onConnectionStatusChanged((status) => {
        this.status = status;
        this.listeners.forEach(listener => listener(status));
      });
    }
  }

  getStatus() {
    return this.status;
  }

  addListener(callback) {
    this.listeners.push(callback);
    
    // Retourner une fonction de désabonnement
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  handleConnectionError() {
    // Notifier Electron d'une erreur de connexion
    if (window.electronAPI) {
      window.electronAPI.handleConnectionError();
    }
  }

  forceCheck() {
    // Demander à Electron de forcer une vérification
    if (window.electronAPI) {
      window.electronAPI.forceConnectionCheck();
    }
  }
}

const connectionManager = new ConnectionManagerMock();
export default connectionManager; 