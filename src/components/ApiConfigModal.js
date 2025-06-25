import React, { useState, useEffect } from 'react';

const ApiConfigModal = ({ isOpen, onClose, onSave }) => {
  const [config, setConfig] = useState({
    baseUrl: 'https://trusty-projet.fr/api/api-timer.php',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  });
  
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    rememberMe: false
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Charger la configuration actuelle au montage
  useEffect(() => {
    if (isOpen) {
      loadCurrentConfig();
    }
  }, [isOpen]);

  const loadCurrentConfig = async () => {
    try {
      if (window.electronAPI) {
        const apiConfig = await window.electronAPI.getApiConfig();
        setConfig(apiConfig);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la config API:', error);
    }
  };

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCredentialsChange = (field, value) => {
    setCredentials(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setTestResult(null);

      // Valider la configuration
      if (!config.baseUrl || !config.baseUrl.trim()) {
        throw new Error('L\'URL de l\'API est requise');
      }

      if (!credentials.username || !credentials.password) {
        throw new Error('Les identifiants sont requis');
      }

      // Sauvegarder la configuration API
      if (window.electronAPI) {
        await window.electronAPI.setApiConfig(config);
        
        // Tenter l'authentification
        const authResult = await window.electronAPI.authenticateUser(credentials);
        
        if (authResult.success) {
          setTestResult({
            success: true,
            message: `Authentification réussie ! ID Freelance: ${authResult.freelanceId}`,
            data: authResult
          });
          
          // Fermer le modal après succès
          setTimeout(() => {
            onSave();
            onClose();
          }, 2000);
        } else {
          throw new Error(authResult.message || 'Échec de l\'authentification');
        }
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      setTestResult({
        success: false,
        message: error.message || 'Erreur lors de la configuration'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsLoading(true);
      setTestResult(null);

      if (window.electronAPI) {
        const result = await window.electronAPI.testApiConnection(config);
        
        setTestResult({
          success: result.success,
          message: result.success 
            ? 'Connexion à l\'API réussie !'
            : result.message || 'Échec de la connexion',
          data: result.data
        });
      }
    } catch (error) {
      console.error('Erreur lors du test de connexion:', error);
      setTestResult({
        success: false,
        message: error.message || 'Erreur lors du test de connexion'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetToDefaults = () => {
    setConfig({
      baseUrl: 'https://trusty-projet.fr/api/api-timer.php',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Configuration API Centralisée
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isLoading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Configuration API */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Configuration de l'API</h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  URL de l'API *
                </label>
                <input
                  type="url"
                  id="baseUrl"
                  value={config.baseUrl}
                  onChange={(e) => handleConfigChange('baseUrl', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://trusty-projet.fr/api/api-timer.php"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Authentification */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Authentification</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Nom d'utilisateur *
                </label>
                <input
                  type="text"
                  id="username"
                  value={credentials.username}
                  onChange={(e) => handleCredentialsChange('username', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Votre nom d'utilisateur"
                  disabled={isLoading}
                  autoComplete="username"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Mot de passe *
                </label>
                <input
                  type="password"
                  id="password"
                  value={credentials.password}
                  onChange={(e) => handleCredentialsChange('password', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Votre mot de passe"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={credentials.rememberMe}
                onChange={(e) => handleCredentialsChange('rememberMe', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={isLoading}
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700">
                Se souvenir de mes identifiants
              </label>
            </div>
          </div>

          {/* Configuration avancée */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <svg 
                className={`w-4 h-4 mr-1 transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Configuration avancée
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-md">
                <div>
                  <label htmlFor="timeout" className="block text-sm font-medium text-gray-700 mb-1">
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    id="timeout"
                    value={config.timeout}
                    onChange={(e) => handleConfigChange('timeout', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="5000"
                    max="120000"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="retryAttempts" className="block text-sm font-medium text-gray-700 mb-1">
                    Tentatives
                  </label>
                  <input
                    type="number"
                    id="retryAttempts"
                    value={config.retryAttempts}
                    onChange={(e) => handleConfigChange('retryAttempts', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                    max="10"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="retryDelay" className="block text-sm font-medium text-gray-700 mb-1">
                    Délai (ms)
                  </label>
                  <input
                    type="number"
                    id="retryDelay"
                    value={config.retryDelay}
                    onChange={(e) => handleConfigChange('retryDelay', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="500"
                    max="10000"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Résultat du test */}
          {testResult && (
            <div className={`p-4 rounded-md ${
              testResult.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  {testResult.success ? (
                    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="ml-3">
                  <p className={`text-sm font-medium ${
                    testResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {testResult.message}
                  </p>
                  {testResult.data && (
                    <pre className="mt-2 text-xs text-gray-600 overflow-x-auto">
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isLoading || !config.baseUrl}
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Test...' : 'Tester la connexion'}
            </button>
            
            <button
              type="button"
              onClick={resetToDefaults}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Valeurs par défaut
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler
            </button>
            
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading || !config.baseUrl || !credentials.username || !credentials.password}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Configuration...' : 'Sauvegarder et se connecter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiConfigModal; 