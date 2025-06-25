const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.timer-project-config.json');
    this.config = {
      // Configuration API centralisée
      api: {
        baseUrl: 'https://trusty-projet.fr/api/api-timer.php', // Serveur API PHP sur trusty-projet.fr
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
      },
      // Configuration locale
      app: {
        theme: 'light',
        language: 'fr',
        autoSave: true,
        autoSaveInterval: 30000, // 30 secondes
        syncInterval: 300000 // 5 minutes
      },
      // Authentification utilisateur
      auth: {
        rememberCredentials: false,
        autoLogin: false
      },
      // Configuration spécifique au freelance
      freelance: {
        id: null,
        name: '',
        email: '',
        timezone: 'Europe/Paris'
      }
    };
    this.loadConfig();
  }

  async loadConfig() {
    try {
      if (await fs.pathExists(this.configPath)) {
        const savedConfig = await fs.readJSON(this.configPath);
        this.config = { ...this.config, ...savedConfig };
        console.log('✅ Configuration chargée');
      } else {
        console.log('ℹ️ Aucune configuration existante, utilisation des valeurs par défaut');
        await this.saveConfig();
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement de la configuration:', error);
    }
  }

  async saveConfig() {
    try {
      await fs.writeJSON(this.configPath, this.config, { spaces: 2 });
      console.log('✅ Configuration sauvegardée');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde de la configuration:', error);
    }
  }

  // Méthodes pour la configuration API
  getApiConfig() {
    return this.config.api;
  }

  async setApiConfig(apiConfig) {
    this.config.api = { ...this.config.api, ...apiConfig };
    await this.saveConfig();
  }

  isApiConfigured() {
    const api = this.config.api;
    return api.baseUrl && api.baseUrl.trim() !== '';
  }

  // Méthodes pour la configuration utilisateur
  getFreelanceConfig() {
    return this.config.freelance;
  }

  async setFreelanceConfig(freelanceConfig) {
    this.config.freelance = { ...this.config.freelance, ...freelanceConfig };
    await this.saveConfig();
  }

  // Méthodes pour la configuration d'authentification
  getAuthConfig() {
    return this.config.auth;
  }

  async setAuthConfig(authConfig) {
    this.config.auth = { ...this.config.auth, ...authConfig };
    await this.saveConfig();
  }

  // Méthodes pour la configuration de l'application
  getAppConfig() {
    return this.config.app;
  }

  async setAppConfig(appConfig) {
    this.config.app = { ...this.config.app, ...appConfig };
    await this.saveConfig();
  }

  // Migration depuis l'ancienne configuration FTP (nettoyage)
  async migrateFtpToApi() {
    try {
      console.log('🔄 Nettoyage de l\'ancienne configuration FTP...');
      
      // Vérifier s'il y a une ancienne configuration FTP et la supprimer
      if (this.config.ftp) {
        console.log('📤 Ancienne configuration FTP détectée, suppression...');
        
        // Supprimer la configuration FTP obsolète
        delete this.config.ftp;
        
        // Sauvegarder la nouvelle configuration
        await this.saveConfig();
        
        console.log('✅ Configuration FTP supprimée');
        return true;
      }
      
      console.log('ℹ️ Aucune ancienne configuration FTP trouvée');
      return false;
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error);
      return false;
    }
  }

  // Vérification de la santé de la configuration
  validateConfig() {
    const errors = [];
    
    // Vérifier la configuration API
    if (!this.config.api.baseUrl) {
      errors.push('URL de l\'API manquante');
    }
    
    if (this.config.api.timeout < 5000) {
      errors.push('Timeout API trop court (minimum 5 secondes)');
    }
    
    // Vérifier la configuration du freelance
    if (!this.config.freelance.id) {
      console.warn('⚠️ ID freelance non configuré - authentification nécessaire');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Réinitialisation de la configuration
  async resetConfig() {
    try {
      console.log('🔄 Réinitialisation de la configuration...');
      
      // Supprimer le fichier de configuration
      if (await fs.pathExists(this.configPath)) {
        await fs.remove(this.configPath);
      }
      
      // Réinitialiser la configuration en mémoire
      this.config = {
        api: {
          baseUrl: 'https://trusty-projet.fr/api/api-timer.php',
          timeout: 30000,
          retryAttempts: 3,
          retryDelay: 1000
        },
        app: {
          theme: 'light',
          language: 'fr',
          autoSave: true,
          autoSaveInterval: 30000,
          syncInterval: 300000
        },
        auth: {
          rememberCredentials: false,
          autoLogin: false
        },
        freelance: {
          id: null,
          name: '',
          email: '',
          timezone: 'Europe/Paris'
        }
      };
      
      // Sauvegarder la configuration par défaut
      await this.saveConfig();
      
      console.log('✅ Configuration réinitialisée');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la réinitialisation:', error);
      return false;
    }
  }

  // Export de la configuration
  async exportConfig(exportPath) {
    try {
      const configToExport = {
        ...this.config,
        // Ne pas exporter les informations sensibles
        auth: {
          ...this.config.auth,
          // Exporter les préférences mais pas les tokens
        }
      };
      
      await fs.writeJSON(exportPath, configToExport, { spaces: 2 });
      console.log('✅ Configuration exportée');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de l\'export:', error);
      return false;
    }
  }

  // Import de la configuration
  async importConfig(importPath) {
    try {
      if (!(await fs.pathExists(importPath))) {
        throw new Error('Fichier de configuration introuvable');
      }
      
      const importedConfig = await fs.readJSON(importPath);
      
      // Valider la configuration importée
      if (!importedConfig.api || !importedConfig.api.baseUrl) {
        throw new Error('Configuration API invalide');
      }
      
      // Fusionner avec la configuration actuelle
      this.config = { ...this.config, ...importedConfig };
      
      // Sauvegarder
      await this.saveConfig();
      
      console.log('✅ Configuration importée');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de l\'import:', error);
      return false;
    }
  }

  // Méthodes FTP obsolètes - Maintenues pour compatibilité mais vides
  getFTPConfig() {
    console.warn('⚠️ FTP non supporté - Migration vers API recommandée');
    return { host: '', user: '', password: '', port: 21, secure: false, projectsFolder: '' };
  }

  async setFTPConfig(ftpConfig) {
    console.warn('⚠️ FTP non supporté - Configuration ignorée');
    return false;
  }

  isFTPConfigured() {
    return false;
  }
}

module.exports = new ConfigManager();