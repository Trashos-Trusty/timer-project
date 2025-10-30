import React from 'react';
import {
  Clock,
  Timer,
  Plus,
  LogOut,
  Zap,
  Server,
  AlertTriangle,
  Download,
  MessageCircle
} from 'lucide-react';

const Header = ({ 
  currentView, 
  onViewChange, 
  onNewProject, 
  onOpenApiConfig, 
  onLogout,
  onOpenFeedback = () => {},
  isApiConfigured,
  freelanceInfo,
  disabled = false,
  isTimerRunning = false
}) => {
  // Mode développeur - désactivé par défaut pour les utilisateurs finaux
  // Pour l'activer, changer cette ligne ou créer un fichier .env avec REACT_APP_DEVELOPER_MODE=true
  const isDeveloperMode = process.env.REACT_APP_DEVELOPER_MODE === 'true' || false;

  // Fonction pour télécharger le plugin WordPress
  const handleDownloadPlugin = () => {
    // URL sécurisée vers le plugin - à adapter selon votre hébergement
    const pluginUrl =
      process.env.REACT_APP_PLUGIN_DOWNLOAD_URL || 'https://trusty-projet.fr/plugin/plugin.zip';
    
    // Créer un élément de téléchargement temporaire
    const link = document.createElement('a');
    link.href = pluginUrl;
    link.download = 'timer-project-wordpress-plugin.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Logo et titre */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-lg">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Timer Project</h1>
            <p className="text-sm text-gray-500">
              {freelanceInfo ? `Bonjour ${freelanceInfo.name}` : 'Gestionnaire de temps de projet'}
            </p>
          </div>
        </div>

        {/* Switch Timer/Chronomètre */}
        <div className="flex items-center space-x-4">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => !isTimerRunning && onViewChange('timer')}
              disabled={isTimerRunning}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-all duration-200 ${
                currentView === 'timer'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              } ${isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={isTimerRunning ? 'Veuillez stopper le chronomètre avant de changer de mode' : ''}
            >
              <Timer className="w-4 h-4" />
              <span className="font-medium">Minuteur</span>
            </button>
            <button
              onClick={() => !isTimerRunning && onViewChange('stopwatch')}
              disabled={isTimerRunning}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-all duration-200 ${
                currentView === 'stopwatch'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              } ${isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={isTimerRunning ? 'Veuillez stopper le chronomètre avant de changer de mode' : ''}
            >
              <Clock className="w-4 h-4" />
              <span className="font-medium">Chronomètre</span>
            </button>
          </div>
          
          {/* Indicateur de mode */}
          {currentView === 'stopwatch' && (
            <div className="flex items-center space-x-2 px-3 py-2 bg-warning-50 text-warning-700 rounded-lg border border-warning-200">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Mode perso</span>
            </div>
          )}

          {/* Boutons d'action */}
          <div className="flex items-center space-x-2">
            {/* Alerte API non configurée - seulement visible en mode développeur */}
            {isDeveloperMode && !isApiConfigured && currentView === 'timer' && (
              <div className="flex items-center space-x-2 px-3 py-2 bg-danger-50 text-danger-700 rounded-lg border border-danger-200">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">API non configurée</span>
              </div>
            )}

            <button
              onClick={() => !isTimerRunning && onNewProject()}
              className={`btn-primary flex items-center space-x-2 ${
                disabled || currentView === 'stopwatch' || !isApiConfigured || isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={disabled || currentView === 'stopwatch' || !isApiConfigured || isTimerRunning}
              title={
                isTimerRunning ? 'Veuillez stopper le chronomètre avant de créer un nouveau projet' :
                !isApiConfigured ? 'Connexion API requise' : 
                disabled ? 'Sauvegarde en cours...' : ''
              }
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Projet</span>
            </button>

            {/* Bouton configuration API - seulement visible en mode développeur */}
            {isDeveloperMode && (
              <button
                onClick={() => !isTimerRunning && onOpenApiConfig()}
                disabled={isTimerRunning}
                className={`btn-secondary flex items-center space-x-2 ${
                  !isApiConfigured ? 'bg-danger-100 text-danger-700 border-danger-300' : ''
                } ${isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={
                  isTimerRunning 
                    ? 'Veuillez stopper le chronomètre avant de configurer l\'API' 
                    : 'Configuration API'
                }
              >
                <Server className="w-4 h-4" />
                <span className="hidden md:inline">API</span>
              </button>
            )}

            {/* Bouton téléchargement plugin WordPress */}
            <button
              onClick={() => !isTimerRunning && handleDownloadPlugin()}
              disabled={isTimerRunning}
              className={`btn-secondary flex items-center space-x-2 bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200 ${
                isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              title={
                isTimerRunning 
                  ? 'Veuillez stopper le chronomètre avant de télécharger le plugin' 
                  : 'Télécharger le plugin WordPress'
              }
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Plugin WP</span>
            </button>
            
            <button
              onClick={() => !isTimerRunning && onOpenFeedback && onOpenFeedback()}
              disabled={isTimerRunning}
              className={`btn-secondary flex items-center space-x-2 border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 ${
                isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              title={
                isTimerRunning
                  ? 'Veuillez stopper le chronomètre avant de partager un feedback'
                  : 'Partager un retour ou signaler un bug'
              }
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden md:inline">Feedback</span>
            </button>

            <button
              onClick={() => !isTimerRunning && onLogout()}
              disabled={isTimerRunning}
              className={`btn-secondary flex items-center space-x-2 ${
                isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              title={isTimerRunning ? 'Veuillez stopper le chronomètre avant de vous déconnecter' : 'Se déconnecter'}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 