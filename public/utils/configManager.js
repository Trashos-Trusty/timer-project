const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

class ConfigManager {
  constructor() {
    this.configDir = path.join(app.getPath('userData'), 'config');
    this.configFile = path.join(this.configDir, 'app-config.json');
    this.defaultConfig = {
      // Configuration par défaut vide - FTP supprimé pour sécurité
    };
    this.config = { ...this.defaultConfig };
  }

  async loadConfig() {
    try {
      await fs.ensureDir(this.configDir);
      
      if (await fs.pathExists(this.configFile)) {
        const savedConfig = await fs.readJson(this.configFile);
        this.config = { ...this.defaultConfig, ...savedConfig };
      } else {
        await this.saveConfig();
      }
      
      return this.config;
    } catch (error) {
      console.error('Erreur lors du chargement de la configuration:', error);
      return this.defaultConfig;
    }
  }

  async saveConfig() {
    try {
      await fs.ensureDir(this.configDir);
      await fs.writeJson(this.configFile, this.config, { spaces: 2 });
      return true;
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la configuration:', error);
      return false;
    }
  }

  // Méthodes FTP supprimées pour sécurité
  getFTPConfig() {
    console.warn('⚠️ FTP non supporté');
    return { host: '', user: '', password: '', port: 21, secure: false, projectsFolder: '' };
  }

  async setFTPConfig(ftpConfig) {
    console.warn('⚠️ FTP non supporté');
    return false;
  }

  isFTPConfigured() {
    return false;
  }
}

module.exports = new ConfigManager(); 