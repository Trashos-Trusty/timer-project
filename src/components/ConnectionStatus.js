import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import connectionManager from '../connectionManager';

const ConnectionStatus = () => {
  const [connectionState, setConnectionState] = useState({
    isOnline: connectionManager.getStatus().isOnline,
    isRetrying: connectionManager.getStatus().isRetrying,
    retryCount: connectionManager.getStatus().retryCount,
    showIndicator: false
  });

  useEffect(() => {
    const unsubscribe = connectionManager.addListener((event) => {
      const status = connectionManager.getStatus();
      
      switch (event.type) {
        case 'offline':
        case 'connection_error':
          setConnectionState(prev => ({
            ...prev,
            isOnline: false,
            showIndicator: true,
            isRetrying: status.isRetrying,
            retryCount: status.retryCount
          }));
          break;
          
        case 'online':
        case 'reconnected':
        case 'fetch_success':
          setConnectionState(prev => ({
            ...prev,
            isOnline: true,
            isRetrying: false,
            retryCount: 0,
            showIndicator: true
          }));
          
          // Masquer l'indicateur après 3 secondes quand la connexion est rétablie
          setTimeout(() => {
            setConnectionState(prev => ({
              ...prev,
              showIndicator: false
            }));
          }, 3000);
          break;
          
        case 'max_retries_reached':
          setConnectionState(prev => ({
            ...prev,
            isRetrying: false,
            showIndicator: true
          }));
          break;
          
        default:
          setConnectionState(prev => ({
            ...prev,
            isOnline: status.isOnline,
            isRetrying: status.isRetrying,
            retryCount: status.retryCount
          }));
      }
    });

    return unsubscribe;
  }, []);

  const handleRetry = () => {
    connectionManager.forceCheck();
    setConnectionState(prev => ({
      ...prev,
      showIndicator: true
    }));
  };

  // Ne pas afficher l'indicateur si tout va bien et qu'on n'a pas besoin de le montrer
  if (connectionState.isOnline && !connectionState.showIndicator) {
    return null;
  }

  const getStatusMessage = () => {
    if (connectionState.isOnline) {
      return 'Connexion rétablie';
    }
    
    if (connectionState.isRetrying) {
      return `Reconnexion en cours... (${connectionState.retryCount})`;
    }
    
    return 'Connexion perdue';
  };

  const getStatusColor = () => {
    if (connectionState.isOnline) {
      return 'bg-green-500';
    }
    
    if (connectionState.isRetrying) {
      return 'bg-yellow-500';
    }
    
    return 'bg-red-500';
  };

  const getIcon = () => {
    if (connectionState.isOnline) {
      return <Wifi className="w-4 h-4" />;
    }
    
    if (connectionState.isRetrying) {
      return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
    
    return <WifiOff className="w-4 h-4" />;
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`${getStatusColor()} text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg transition-all duration-300`}>
        {getIcon()}
        <span className="text-sm font-medium">
          {getStatusMessage()}
        </span>
        
        {!connectionState.isOnline && !connectionState.isRetrying && (
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