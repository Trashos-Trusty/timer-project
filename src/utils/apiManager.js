const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class ApiManager {
  constructor() {
    this.config = {
      baseUrl: 'https://trusty-projet.fr/api/api-timer.php',
      timeout: 30000,
      token: null,
      freelanceId: null
    };
    
    // Système de queue pour éviter les conflits de concurrence
    this.operationQueue = [];
    this.isProcessingQueue = false;
    
    this.tempDir = path.join(os.tmpdir(), 'timer-project-temp');
  }

  // Configuration de l'API
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  // Authentification et récupération du token
  async authenticate(credentials) {
    try {
      const url = `${this.config.baseUrl}?action=login`;
      console.log('🔍 DEBUG - URL d\'authentification:', url);
      console.log('🔍 DEBUG - Config baseUrl:', this.config.baseUrl);
      console.log('🔍 DEBUG - Credentials:', { username: credentials.username, password: '***' });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password
        }),
        timeout: this.config.timeout
      });

      console.log('🔍 DEBUG - Response status:', response.status);
      console.log('🔍 DEBUG - Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const responseText = await response.text();
        console.log('🔍 DEBUG - Response text:', responseText);
        throw new Error(`Erreur d'authentification: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.token) {
        this.config.token = data.token;
        this.config.freelanceId = data.freelance_id;
        
        // Sauvegarder le token localement (chiffré)
        await this.saveTokenLocally(data.token, data.freelance_id);
        
        console.log('✅ Authentification réussie');
        return { success: true, token: data.token, freelanceId: data.freelance_id };
      } else {
        throw new Error(data.message || 'Échec de l\'authentification');
      }
    } catch (error) {
      console.error('❌ Erreur d\'authentification:', error);
      throw error;
    }
  }

  // Vérification du token
  async verifyToken() {
    if (!this.config.token) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}?action=verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        timeout: this.config.timeout
      });

      return response.ok;
    } catch (error) {
      console.error('❌ Erreur de vérification du token:', error);
      return false;
    }
  }

  // Renouvellement automatique du token
  async refreshToken() {
    try {
      const response = await fetch(`${this.config.baseUrl}?action=refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        timeout: this.config.timeout
      });

      if (response.ok) {
        const data = await response.json();
        this.config.token = data.token;
        await this.saveTokenLocally(data.token, this.config.freelanceId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Erreur de renouvellement du token:', error);
      return false;
    }
  }

  // Sauvegarde locale sécurisée du token
  async saveTokenLocally(token, freelanceId) {
    try {
      await fs.ensureDir(this.tempDir);
      const tokenData = {
        token: token,
        freelanceId: freelanceId,
        timestamp: Date.now()
      };
      
      const tokenPath = path.join(this.tempDir, '.auth_token');
      await fs.writeJSON(tokenPath, tokenData);
    } catch (error) {
      console.error('❌ Erreur sauvegarde token local:', error);
    }
  }

  // Chargement du token local
  async loadTokenLocally() {
    try {
      const tokenPath = path.join(this.tempDir, '.auth_token');
      if (await fs.pathExists(tokenPath)) {
        const tokenData = await fs.readJSON(tokenPath);
        
        // Vérifier que le token n'est pas trop ancien (24h max)
        const tokenAge = Date.now() - tokenData.timestamp;
        if (tokenAge < 24 * 60 * 60 * 1000) {
          this.config.token = tokenData.token;
          this.config.freelanceId = tokenData.freelanceId;
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ Erreur chargement token local:', error);
      return false;
    }
  }

  // Effacement du token local
  async clearTokenLocally() {
    try {
      const tokenPath = path.join(this.tempDir, '.auth_token');
      if (await fs.pathExists(tokenPath)) {
        await fs.remove(tokenPath);
        console.log('✅ Token local effacé');
      }
      return true;
    } catch (error) {
      console.error('❌ Erreur effacement token local:', error);
      return false;
    }
  }

  // Ajouter une opération à la queue
  async queueOperation(operation, operationName = 'unknown') {
    return new Promise((resolve, reject) => {
      this.operationQueue.push({
        operation,
        operationName,
        resolve,
        reject
      });
      
      this.processQueue();
    });
  }

  // Traiter la queue d'opérations
  async processQueue() {
    if (this.isProcessingQueue || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    console.log(`🔄 Traitement de la queue API (${this.operationQueue.length} opérations en attente)`);

    while (this.operationQueue.length > 0) {
      const { operation, operationName, resolve, reject } = this.operationQueue.shift();
      
      try {
        console.log(`▶️ Exécution opération API: ${operationName}`);
        const result = await operation();
        console.log(`✅ Opération API terminée: ${operationName}`);
        resolve(result);
      } catch (error) {
        console.error(`❌ Erreur opération API ${operationName}:`, error);
        
        // Si erreur d'authentification, essayer de renouveler le token
        if (error.message.includes('401') || error.message.includes('403')) {
          const refreshed = await this.refreshToken();
          if (refreshed) {
            // Remettre l'opération en queue
            this.operationQueue.unshift({ operation, operationName, resolve, reject });
            continue;
          }
        }
        
        reject(error);
      }
    }

    this.isProcessingQueue = false;
    console.log('🏁 Queue API terminée');
  }

  // Requête API sécurisée avec gestion automatique du token
  async makeSecureRequest(endpoint, options = {}) {
    if (!this.config.token) {
      throw new Error('Token d\'authentification manquant');
    }

    const url = `${this.config.baseUrl}?action=${endpoint}`;
    const requestOptions = {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: this.config.timeout
    };

    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Token expiré ou invalide');
      }
      throw new Error(`Erreur API: ${response.status} - ${response.statusText}`);
    }

    return await response.json();
  }

  // Sauvegarder un projet via l'API
  async saveProject(project, originalName = null) {
    return this.queueOperation(async () => {
      console.log('🌐 Sauvegarde API:', {
        projectId: project.id,
        projectName: project.name,
        freelanceId: this.config.freelanceId,
        originalName: originalName
      });

      const projectData = {
        ...project,
        freelance_id: this.config.freelanceId,
        original_name: originalName,
        last_saved: new Date().toISOString()
      };

      const response = await this.makeSecureRequest('projects', {
        method: 'POST',
        body: JSON.stringify(projectData)
      });

      if (response.success) {
        console.log('✅ Projet sauvegardé avec succès');
        return response.data;
      } else {
        throw new Error(response.message || 'Erreur lors de la sauvegarde');
      }
    }, 'saveProject');
  }

  // Charger tous les projets du freelance
  async loadProjects() {
    return this.queueOperation(async () => {
      console.log('📋 Chargement des projets depuis l\'API...');

      const response = await this.makeSecureRequest('projects', {
        method: 'GET'
      });

      if (response.success) {
        const projects = response.data || [];
        console.log(`${projects.length} projets chargés depuis l'API`);
        return projects;
      } else {
        throw new Error(response.message || 'Erreur lors du chargement');
      }
    }, 'loadProjects');
  }

  // Supprimer un projet
  async deleteProject(projectId) {
    return this.queueOperation(async () => {
      console.log('🗑️ Suppression du projet:', projectId);

      const response = await this.makeSecureRequest('projects', {
        method: 'DELETE',
        body: JSON.stringify({ id: projectId })
      });

      if (response.success) {
        console.log('✅ Projet supprimé avec succès');
        return true;
      } else {
        throw new Error(response.message || 'Erreur lors de la suppression');
      }
    }, 'deleteProject');
  }

  // Synchroniser les logs d'un projet
  async syncProjectLogs(projectId, logs) {
    return this.queueOperation(async () => {
      console.log('📊 Synchronisation des logs:', projectId);

      const response = await this.makeSecureRequest(`/projects/${projectId}/logs`, {
        method: 'POST',
        body: JSON.stringify({
          logs: logs,
          sync_timestamp: new Date().toISOString()
        })
      });

      if (response.success) {
        console.log('✅ Logs synchronisés avec succès');
        return response.data;
      } else {
        throw new Error(response.message || 'Erreur lors de la synchronisation');
      }
    }, 'syncProjectLogs');
  }

  // Test de connexion à l'API
  async testConnection() {
    try {
      console.log('🔍 Test de connexion à l\'API...');
      
      const response = await fetch(`${this.config.baseUrl}?action=health`, {
        method: 'GET',
        timeout: this.config.timeout
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Connexion API réussie:', data);
        return { success: true, data };
      } else {
        throw new Error(`Erreur de connexion: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Test de connexion API échoué:', error);
      throw error;
    }
  }

  // Nettoyage des ressources
  async cleanup() {
    try {
      // Nettoyer le dossier temporaire
      if (await fs.pathExists(this.tempDir)) {
        await fs.remove(this.tempDir);
      }
      console.log('🧹 Nettoyage terminé');
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error);
    }
  }
}

module.exports = ApiManager; 