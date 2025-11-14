// Mock de ConnectionManager pour le côté React
// Communique avec Electron via IPC et relaie les événements de synchronisation hors ligne

class ConnectionManagerMock {
  constructor() {
    this.listeners = [];
    this.status = {
      isOnline: true,
      isRetrying: false,
      retryCount: 0,
      pendingSync: false,
      offlineSync: this.createOfflineSyncState()
    };
    this._hasDetailedOfflineEvents = false;

    if (typeof window !== 'undefined' && window.electronAPI) {
      this.setupIpcListeners();
    }
  }

  createOfflineSyncState() {
    return {
      state: 'idle',
      pending: 0,
      lastError: null,
      lastSyncedAt: null,
      lastUpdatedAt: null,
    };
  }

  setupIpcListeners() {
    if (typeof window.electronAPI.onConnectionStatusChanged === 'function') {
      window.electronAPI.onConnectionStatusChanged((status = {}) => {
        this.status = {
          ...this.status,
          ...status,
          offlineSync: this.status.offlineSync,
          pendingSync: this.status.pendingSync,
        };
        this.emitEvent(status);
      });
    }

    this.registerOfflineListener('onOfflineSyncPending', 'pending');
    this.registerOfflineListener('onOfflineSyncing', 'syncing');
    this.registerOfflineListener('onOfflineSyncComplete', 'complete');
    this.registerOfflineListener('onOfflineSyncError', 'error');

    if (typeof window.electronAPI.onOfflineSyncStatus === 'function') {
      window.electronAPI.onOfflineSyncStatus((payload = {}) => {
        this.mapLegacyOfflineStatus(payload);
      });
    }
  }

  registerOfflineListener(methodName, targetState) {
    if (typeof window.electronAPI?.[methodName] !== 'function') {
      return;
    }

    this._hasDetailedOfflineEvents = true;
    window.electronAPI[methodName]((payload = {}) => {
      this.handleOfflineSyncStateChange(targetState, payload);
    });
  }

  handleOfflineSyncStateChange(state, payload = {}) {
    const previous = this.status.offlineSync || this.createOfflineSyncState();
    const timestamp = payload.timestamp || new Date().toISOString();

    const resolvePending = () => {
      if (typeof payload.pending === 'number' && payload.pending >= 0) {
        return payload.pending;
      }

      if (typeof payload.total === 'number' && payload.total >= 0) {
        return payload.total;
      }

      if (state === 'complete') {
        return 0;
      }

      if (state === 'pending' && previous.pending > 0) {
        return previous.pending;
      }

      return previous.pending;
    };

    const nextPending = resolvePending();

    const nextOfflineState = {
      ...previous,
      state,
      pending: Math.max(0, nextPending),
      lastError: state === 'error' ? (payload.message || payload.error || previous.lastError) : null,
      lastSyncedAt: state === 'complete' ? timestamp : previous.lastSyncedAt,
      lastUpdatedAt: timestamp,
    };

    const hasPendingSync = state === 'pending' || state === 'syncing' || (state === 'error' && nextOfflineState.pending > 0);

    this.status = {
      ...this.status,
      offlineSync: nextOfflineState,
      pendingSync: hasPendingSync,
    };

    this.emitEvent({ type: `offline_sync_${state}`, payload });
  }

  mapLegacyOfflineStatus(payload = {}) {
    const status = payload.status;
    if (!status) {
      return;
    }

    if (!this._hasDetailedOfflineEvents) {
      switch (status) {
        case 'queued':
          this.handleOfflineSyncStateChange('pending', payload);
          break;
        case 'started':
          this.handleOfflineSyncStateChange('syncing', payload);
          break;
        case 'success':
          this.handleOfflineSyncStateChange('complete', payload);
          break;
        case 'partial':
        case 'error':
          this.handleOfflineSyncStateChange('error', payload);
          break;
        default:
          break;
      }
    }

    if (status === 'offline') {
      const pendingCount = typeof payload.pending === 'number'
        ? payload.pending
        : (this.status.offlineSync?.pending ?? 0);

      this.status = {
        ...this.status,
        isOnline: false,
        pendingSync: pendingCount > 0 || this.status.pendingSync,
      };

      this.emitEvent({ type: 'offline', payload });
      return;
    }

    if (status === 'online') {
      this.status = {
        ...this.status,
        isOnline: true,
      };

      this.emitEvent({ type: 'online', payload });
    }
  }

  emitEvent(event) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Erreur dans le listener de connexion:', error);
      }
    });
  }

  getStatus() {
    return this.status;
  }

  addListener(callback) {
    this.listeners.push(callback);

    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  handleConnectionError() {
    if (window.electronAPI?.handleConnectionError) {
      window.electronAPI.handleConnectionError();
    }
  }

  forceCheck() {
    if (window.electronAPI?.forceConnectionCheck) {
      window.electronAPI.forceConnectionCheck();
    }
  }
}

const connectionManager = new ConnectionManagerMock();
export default connectionManager;