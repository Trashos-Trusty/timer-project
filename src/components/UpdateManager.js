import React, { useState, useEffect } from 'react';
import { Download, X, AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';

const UpdateManager = () => {
  const [updateStatus, setUpdateStatus] = useState({
    isCheckingForUpdate: false,
    isUpdateAvailable: false,
    isUpdateDownloaded: false,
    updateInfo: null
  });
  
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [notification, setNotification] = useState({ type: '', message: '', details: '' });

  useEffect(() => {
    // Vérifier si nous sommes dans l'environnement Electron
    if (!window.electronAPI) {
      console.warn('⚠️ UpdateManager: electronAPI non disponible (mode développement navigateur)');
      return;
    }
    
    // Enregistrer les écouteurs d'événements
    const cleanupFunctions = [];
    
    if (window.electronAPI.onUpdateChecking) {
      cleanupFunctions.push(window.electronAPI.onUpdateChecking(() => {
        console.log('🔍 Vérification des mises à jour en cours...');
        setUpdateStatus(prev => ({ ...prev, isCheckingForUpdate: true }));
        showNotification('info', 'Vérification des mises à jour...', '');
      }));
    }

    if (window.electronAPI.onUpdateAvailable) {
      cleanupFunctions.push(window.electronAPI.onUpdateAvailable((info) => {
        console.log('✅ Mise à jour disponible:', info);
        setUpdateStatus(prev => ({
          ...prev,
          isCheckingForUpdate: false,
          isUpdateAvailable: true,
          updateInfo: info
        }));
        setShowUpdateNotification(true);
        showNotification('success', 'Mise à jour disponible !', `Version ${info.version} disponible`);
      }));
    }

    if (window.electronAPI.onUpdateNotAvailable) {
      cleanupFunctions.push(window.electronAPI.onUpdateNotAvailable(() => {
        console.log('ℹ️ Aucune mise à jour disponible');
        setUpdateStatus(prev => ({ ...prev, isCheckingForUpdate: false }));
        showNotification('info', 'Aucune mise à jour disponible', 'Vous avez déjà la dernière version');
      }));
    }

    if (window.electronAPI.onUpdateDownloaded) {
      cleanupFunctions.push(window.electronAPI.onUpdateDownloaded((info) => {
        console.log('⬇️ Mise à jour téléchargée:', info);
        setUpdateStatus(prev => ({ ...prev, isUpdateDownloaded: true }));
        setDownloadProgress(null);
        showNotification('success', 'Mise à jour prête !', 'Cliquez pour installer et redémarrer');
      }));
    }

    if (window.electronAPI.onDownloadProgress) {
      cleanupFunctions.push(window.electronAPI.onDownloadProgress((progress) => {
        console.log('📥 Progression:', progress);
        setDownloadProgress(progress);
      }));
    }

    if (window.electronAPI.onUpdateError) {
      cleanupFunctions.push(window.electronAPI.onUpdateError((error) => {
        console.error('❌ Erreur de mise à jour:', error);
        setUpdateStatus(prev => ({ ...prev, isCheckingForUpdate: false }));
        setDownloadProgress(null);
        showNotification('error', 'Erreur de mise à jour', error.message || 'Une erreur est survenue');
      }));
    }

    // Nettoyer les écouteurs à la fermeture
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup && cleanup());
    };
  }, []);

  const showNotification = (type, message, details) => {
    setNotification({ type, message, details });
    setTimeout(() => setNotification({ type: '', message: '', details: '' }), 5000);
  };

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) {
      showNotification('info', 'Vérification des mises à jour', 'Fonctionnalité pas encore implémentée');
      return;
    }
    
    try {
      setUpdateStatus(prev => ({ ...prev, isCheckingForUpdate: true }));
      await window.electronAPI.checkForUpdates();
      showNotification('info', 'Vérification en cours...', '');
    } catch (error) {
      setUpdateStatus(prev => ({ ...prev, isCheckingForUpdate: false }));
      showNotification('error', 'Erreur', error.message);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!window.electronAPI?.downloadUpdate) {
      showNotification('info', 'Téléchargement', 'Fonctionnalité pas encore implémentée');
      return;
    }
    
    try {
      setDownloadProgress(0);
      await window.electronAPI.downloadUpdate();
      showNotification('info', 'Téléchargement démarré...', '');
    } catch (error) {
      setDownloadProgress(null);
      showNotification('error', 'Erreur', error.message);
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.electronAPI?.installUpdate) {
      showNotification('info', 'Installation', 'Fonctionnalité pas encore implémentée');
      return;
    }
    
    try {
      await window.electronAPI.installUpdate();
    } catch (error) {
      showNotification('error', 'Erreur', error.message);
    }
  };

  const handleCancelUpdate = async () => {
    if (!window.electronAPI?.cancelUpdate) {
      setShowUpdateNotification(false);
      return;
    }
    
    try {
      await window.electronAPI.cancelUpdate();
      setShowUpdateNotification(false);
    } catch (error) {
      showNotification('error', 'Erreur', error.message);
    }
  };

  const handleOpenReleaseNotes = () => {
    if (updateStatus.updateInfo?.releaseNotesUrl && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(updateStatus.updateInfo.releaseNotesUrl);
    }
  };

  // Si electronAPI n'est pas disponible, ne rien afficher
  if (!window.electronAPI) {
    return null;
  }

  return (
    <div className="update-manager">
      {/* Notification temporaire */}
      {notification.message && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center space-x-3 ${
          notification.type === 'error' ? 'bg-red-100 border border-red-300' :
          notification.type === 'success' ? 'bg-green-100 border border-green-300' :
          'bg-blue-100 border border-blue-300'
        }`}>
          {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
          {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
          {notification.type === 'info' && <Info className="w-5 h-5 text-blue-600" />}
          <div>
            <p className={`font-medium ${
              notification.type === 'error' ? 'text-red-900' :
              notification.type === 'success' ? 'text-green-900' :
              'text-blue-900'
            }`}>
              {notification.message}
            </p>
            {notification.details && (
              <p className={`text-sm ${
                notification.type === 'error' ? 'text-red-700' :
                notification.type === 'success' ? 'text-green-700' :
                'text-blue-700'
              }`}>
                {notification.details}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bouton de vérification manuelle des mises à jour */}
      <div className="fixed bottom-4 right-4">
        <button
          onClick={handleCheckForUpdates}
          disabled={updateStatus.isCheckingForUpdate}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors flex items-center space-x-2"
          title="Vérifier les mises à jour"
        >
          <RefreshCw className={`w-5 h-5 ${updateStatus.isCheckingForUpdate ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Modal de mise à jour disponible */}
      {showUpdateNotification && updateStatus.isUpdateAvailable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Download className="w-5 h-5 mr-2 text-blue-600" />
                Mise à jour disponible
              </h3>
              <button
                onClick={handleCancelUpdate}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {updateStatus.updateInfo && (
              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  <strong>Nouvelle version :</strong> {updateStatus.updateInfo.version}
                </p>
                <p className="text-gray-700 mb-4">
                  <strong>Date de publication :</strong> {
                    updateStatus.updateInfo.releaseDate ? 
                    new Date(updateStatus.updateInfo.releaseDate).toLocaleDateString('fr-FR') :
                    'N/A'
                  }
                </p>
                
                {updateStatus.updateInfo.releaseNotes && (
                  <div className="bg-gray-50 p-3 rounded-lg mb-4">
                    <p className="text-sm text-gray-600 font-medium mb-2">Notes de version :</p>
                    <p className="text-sm text-gray-700">
                      {updateStatus.updateInfo.releaseNotes}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Barre de progression du téléchargement */}
            {downloadProgress && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Téléchargement en cours...</span>
                  <span>{Math.round(downloadProgress.percent || 0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress.percent || 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{formatBytes(downloadProgress.transferred || 0)}</span>
                  <span>{formatBytes(downloadProgress.total || 0)}</span>
                </div>
              </div>
            )}

            <div className="flex space-x-3">
              {!updateStatus.isUpdateDownloaded ? (
                <>
                  <button
                    onClick={handleDownloadUpdate}
                    disabled={!!downloadProgress}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                  >
                    {downloadProgress ? 'Téléchargement...' : 'Télécharger'}
                  </button>
                  <button
                    onClick={handleCancelUpdate}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Plus tard
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleInstallUpdate}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                  >
                    Installer et redémarrer
                  </button>
                  <button
                    onClick={handleCancelUpdate}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Plus tard
                  </button>
                </>
              )}
            </div>

            {updateStatus.updateInfo?.releaseNotesUrl && (
              <button
                onClick={handleOpenReleaseNotes}
                className="w-full mt-3 text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                Voir les notes de version complètes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Fonction utilitaire pour formater les bytes
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export default UpdateManager; 