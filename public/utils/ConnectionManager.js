class ConnectionManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.listeners = [];
    this.retryInterval = null;
    this.retryDelay = 1000; // Commencer avec 1 seconde
    this.maxRetryDelay = 30000; // Maximum 30 secondes
    this.retryCount = 0;
    this.maxRetries = 50; // Retry jusqu'à 50 fois
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Écouter les changements de connexion réseau
    window.addEventListener('online', () => {
      console.log('🌐 Connexion réseau rétablie');
      this.isOnline = true;
      this.retryCount = 0;
      this.retryDelay = 1000;
      this.notifyListeners({ type: 'online' });
      this.clearRetryInterval();
    });

    window.addEventListener('offline', () => {
      console.log('📵 Connexion réseau perdue');
      this.isOnline = false;
      this.notifyListeners({ type: 'offline' });
      this.startRetrying();
    });

    // Écouter la visibilité de la page (quand on revient sur l'onglet)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        console.log('👀 Page redevenue visible');
        this.checkConnectionStatus();
      }
    });

    // Écouter les événements de focus/blur de la fenêtre
    window.addEventListener('focus', () => {
      console.log('🔍 Fenêtre redevenue active');
      this.checkConnectionStatus();
    });

    // Écouter les erreurs de fetch pour détecter les problèmes de connexion
    this.setupFetchInterceptor();
  }

  setupFetchInterceptor() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // Si on avait des problèmes de connexion et qu'une requête réussit,
        // considérer que la connexion est rétablie
        if (!this.isOnline && response.ok) {
          this.isOnline = true;
          this.retryCount = 0;
          this.retryDelay = 1000;
          this.notifyListeners({ type: 'fetch_success' });
        }
        
        return response;
      } catch (error) {
        // Si la requête échoue, vérifier si c'est un problème de réseau
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          console.warn('🚫 Erreur de fetch détectée:', error.message);
          this.handleConnectionError();
        }
        throw error;
      }
    };
  }

  handleConnectionError() {
    if (this.isOnline) {
      this.isOnline = false;
      this.notifyListeners({ type: 'connection_error' });
      this.startRetrying();
    }
  }

  startRetrying() {
    if (this.retryInterval) return;
    
    console.log('🔄 Démarrage des tentatives de reconnexion...');
    
    this.retryInterval = setInterval(() => {
      this.checkConnectionStatus();
    }, this.retryDelay);
  }

  clearRetryInterval() {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }

  async checkConnectionStatus() {
    try {
      // Tester avec une requête simple vers le serveur de développement
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/manifest.json', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        if (!this.isOnline) {
          console.log('✅ Connexion rétablie');
          this.isOnline = true;
          this.retryCount = 0;
          this.retryDelay = 1000;
          this.notifyListeners({ type: 'reconnected' });
          this.clearRetryInterval();
        }
      } else {
        throw new Error('Response not ok');
      }
    } catch (error) {
      console.warn(`❌ Tentative de reconnexion ${this.retryCount + 1}/${this.maxRetries} échouée`);
      
      this.retryCount++;
      
      if (this.retryCount >= this.maxRetries) {
        console.error('🚨 Nombre maximum de tentatives de reconnexion atteint');
        this.clearRetryInterval();
        this.notifyListeners({ type: 'max_retries_reached' });
        return;
      }
      
      // Augmenter progressivement le délai de retry (exponential backoff)
      this.retryDelay = Math.min(this.retryDelay * 1.5, this.maxRetryDelay);
      
      if (this.retryInterval) {
        clearInterval(this.retryInterval);
        this.retryInterval = setInterval(() => {
          this.checkConnectionStatus();
        }, this.retryDelay);
      }
    }
  }

  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners(event) {
    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Erreur dans le listener de connexion:', error);
      }
    });
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      retryCount: this.retryCount,
      retryDelay: this.retryDelay,
      isRetrying: !!this.retryInterval
    };
  }

  // Forcer une vérification manuelle
  forceCheck() {
    this.checkConnectionStatus();
  }

  // Nettoyer les ressources
  destroy() {
    this.clearRetryInterval();
    this.listeners = [];
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('focus', this.handleFocus);
  }
}

// Instance singleton
const connectionManager = new ConnectionManager();

export default connectionManager; 