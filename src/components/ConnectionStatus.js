import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Archive,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import connectionManager from '../connectionManager';

const ConnectionStatus = () => {
  const initialStatus = connectionManager.getStatus();
  const initialOffline = initialStatus.offlineSync || { state: 'idle', pending: 0 };
  const hideTimeoutRef = useRef(null);

  const [connectionState, setConnectionState] = useState({
    display: 'online',
    pendingCount: initialOffline.pending || 0,
    isRetrying: initialStatus.isRetrying,
    retryCount: initialStatus.retryCount,
    lastError: initialOffline.lastError || null,
    showIndicator: false,
  });

  const resolveDisplayState = (event, status, offlineSync) => {
    const offlineState = offlineSync?.state || 'idle';

    switch (event?.type) {
      case 'offline_sync_pending':
        return 'pending';
      case 'offline_sync_syncing':
        return 'syncing';
      case 'offline_sync_complete':
        return 'complete';
      case 'offline_sync_error':
        return 'error';
      case 'offline':
      case 'connection_error':
      case 'max_retries_reached':
        return 'offline';
      case 'online':
      case 'reconnected':
      case 'fetch_success':
        return status.isOnline ? 'online' : 'offline';
      default:
        break;
    }

    if (!status.isOnline) {
      return 'offline';
    }

    switch (offlineState) {
      case 'pending':
        return 'pending';
      case 'syncing':
        return 'syncing';
      case 'complete':
        return 'complete';
      case 'error':
        return offlineSync.pending > 0 ? 'pending' : 'error';
      default:
        break;
    }

    return status.isOnline ? 'online' : 'offline';
  };

  useEffect(() => {
    const updateStateFromManager = (event = {}) => {
      const status = connectionManager.getStatus();
      const offlineSync = status.offlineSync || { state: 'idle', pending: 0 };
      const nextDisplay = resolveDisplayState(event, status, offlineSync);
      const pendingCount = offlineSync.pending || 0;
      const lastError = offlineSync.lastError || null;

      const shouldAutoHide = nextDisplay === 'online' || nextDisplay === 'complete';
      const shouldShow = nextDisplay !== 'online' || event.type !== 'init';

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      if (shouldShow && shouldAutoHide) {
        hideTimeoutRef.current = setTimeout(() => {
          setConnectionState((prev) => ({
            ...prev,
            showIndicator: false,
          }));
        }, 3000);
      }

      setConnectionState({
        display: nextDisplay,
        pendingCount,
        isRetrying: status.isRetrying,
        retryCount: status.retryCount,
        lastError,
        showIndicator: shouldShow,
      });
    };

    const unsubscribe = connectionManager.addListener(updateStateFromManager);
    updateStateFromManager({ type: 'init' });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
  }, []);

  if (!connectionState.showIndicator) {
    return null;
  }

  const STATUS_CONFIG = {
    online: {
      color: 'bg-green-500',
      icon: Wifi,
      message: 'Connexion rétablie',
    },
    offline: {
      color: 'bg-red-600',
      icon: WifiOff,
      message: connectionState.isRetrying
        ? `Déconnecté – reconnexion (${connectionState.retryCount})`
        : 'Déconnecté',
    },
    pending: {
      color: 'bg-amber-500',
      icon: Archive,
      message: connectionState.pendingCount > 0
        ? `${connectionState.pendingCount} ${connectionState.pendingCount > 1 ? 'éléments' : 'élément'} en cache`
        : 'En cache',
    },
    syncing: {
      color: 'bg-blue-500',
      icon: RefreshCw,
      message: connectionState.pendingCount > 0
        ? `Synchronisation en cours (${connectionState.pendingCount} ${connectionState.pendingCount > 1 ? 'éléments' : 'élément'})`
        : 'Synchronisation en cours',
    },
    complete: {
      color: 'bg-green-600',
      icon: CheckCircle2,
      message: 'Synchronisation terminée',
    },
    error: {
      color: 'bg-red-600',
      icon: AlertTriangle,
      message: connectionState.pendingCount > 0
        ? `Erreur de synchronisation (${connectionState.pendingCount} ${connectionState.pendingCount > 1 ? 'éléments' : 'élément'} en attente)`
        : 'Erreur de synchronisation',
    }
  };

  const currentConfig = STATUS_CONFIG[connectionState.display] || STATUS_CONFIG.online;
  const Icon = currentConfig.icon;
  const iconClassName = connectionState.display === 'syncing'
    ? 'w-4 h-4 animate-spin'
    : 'w-4 h-4';

  const handleRetry = () => {
    connectionManager.forceCheck();
  };

  const shouldShowRetryButton = connectionState.display === 'offline' && !connectionState.isRetrying;

  const indicatorTitle = connectionState.display === 'error' && connectionState.lastError
    ? connectionState.lastError
    : undefined;

  return (
    <div className="fixed top-4 right-4 z-50">
      <div
        className={`${currentConfig.color} text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg transition-all duration-300`}
        title={indicatorTitle}
      >
        <Icon className={iconClassName} />
        <span className="text-sm font-medium">
          {currentConfig.message}
        </span>

        {shouldShowRetryButton && (
          <button
            onClick={handleRetry}
            className="ml-2 p-1 hover:bg-white hover:bg-opacity-20 rounded transition-colors"
            title="Réessayer la connexion"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;