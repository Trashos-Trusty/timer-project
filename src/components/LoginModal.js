import React, { useState, useEffect, useCallback } from 'react';
import { User, Lock, Zap, ExternalLink } from 'lucide-react';

const CREDENTIALS_STORAGE_KEY = 'timer-project.remembered-credentials';

const hasBrowserStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const loadRememberedCredentials = () => {
  if (!hasBrowserStorage()) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      username: parsed.username || '',
      password: parsed.password || '',
      rememberMe: parsed.rememberMe !== false
    };
  } catch (error) {
    console.error('❌ Erreur lors du chargement des identifiants mémorisés:', error);
    return null;
  }
};

const persistRememberedCredentials = (credentials) => {
  if (!hasBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      CREDENTIALS_STORAGE_KEY,
      JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        rememberMe: true,
        savedAt: Date.now()
      })
    );
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde des identifiants:', error);
  }
};

const clearRememberedCredentials = () => {
  if (!hasBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
  } catch (error) {
    console.error('❌ Erreur lors de la suppression des identifiants mémorisés:', error);
  }
};

const LoginModal = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    rememberMe: false
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const storedCredentials = loadRememberedCredentials();
    if (storedCredentials) {
      setCredentials((prev) => ({
        ...prev,
        ...storedCredentials
      }));
    }
  }, []);

  const attemptLogin = useCallback(async (creds, shouldRemember, { silent = false } = {}) => {
    if (!silent) {
      setError('');
    }

    setIsLoading(true);

    try {
      const loginPayload = {
        username: creds.username,
        password: creds.password
      };
      const success = await onLogin(loginPayload);

      if (success) {
        if (shouldRemember) {
          persistRememberedCredentials(loginPayload);
        } else {
          clearRememberedCredentials();
        }
        return true;
      }

      if (!silent) {
        setError('Identifiants incorrects');
      }
      return false;
    } catch (err) {
      if (!silent) {
        setError('Erreur de connexion');
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [onLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await attemptLogin(credentials, credentials.rememberMe);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCredentials({
      ...credentials,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSignUp = () => {
    // URL d'inscription - à adapter selon votre site
    const signupUrl = process.env.REACT_APP_SIGNUP_URL || 'https://trusty-projet.fr/inscription';
    
    // Ouvrir dans le navigateur par défaut
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(signupUrl);
    } else {
      // Fallback pour le développement web
      window.open(signupUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 bg-primary-600 rounded-xl mx-auto mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Timer Project</h2>
          <p className="text-gray-600">Connectez-vous pour accéder à l'application</p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-danger-50 border border-danger-200 text-danger-800 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Nom d'utilisateur
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="username"
                name="username"
                value={credentials.username}
                onChange={handleChange}
                className="input pl-10"
                placeholder="Entrez votre nom d'utilisateur"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Mot de passe
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                id="password"
                name="password"
                value={credentials.password}
                onChange={handleChange}
                className="input pl-10"
                placeholder="Entrez votre mot de passe"
                required
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="rememberMe"
              name="rememberMe"
              checked={credentials.rememberMe}
              onChange={handleChange}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              disabled={isLoading}
            />
            <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-700">
              Se souvenir de moi
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full btn-primary py-3 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
          >
            {isLoading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        {/* Section inscription */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-3">
              Pas encore de compte freelance ?
            </p>
            <button
              onClick={handleSignUp}
              className="inline-flex items-center justify-center space-x-2 w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all duration-200"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Créer un compte sur notre site</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginModal; 
