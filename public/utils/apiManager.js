const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class ApiManager {
  constructor() {
    this.config = {
      baseUrl: 'https://timer.soreva.app/api-timer.php',
      timeout: 30000,
      token: null,
      freelanceId: null,
      coreUserId: null,
      orgId: null,
      expiresAt: null
    };

    // Système de queue pour éviter les conflits de concurrence
    this.operationQueue = [];
    this.isProcessingQueue = false;

    this.tempDir = path.join(os.tmpdir(), 'timer-project-temp');

    // Gestion du throttling d'authentification pour éviter les blocages serveur
    this.lastAuthAttempt = 0;
    this.authCooldownMs = 10_000; // Intervalle minimum entre deux tentatives
    this.authLockedUntil = null;
  }

  // Configuration de l'API
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  // Authentification et récupération du token
  async authenticate(credentials) {
    try {
      const now = Date.now();

      // Empêcher de réessayer si le serveur a renvoyé un 429 récemment
      if (this.authLockedUntil && now < this.authLockedUntil) {
        const remainingSeconds = Math.ceil((this.authLockedUntil - now) / 1000);
        throw new Error(`Trop de tentatives de connexion. Veuillez patienter ${remainingSeconds} seconde(s) avant de réessayer.`);
      }

      // Appliquer un temps minimum entre deux tentatives pour éviter les rafales
      if (now - this.lastAuthAttempt < this.authCooldownMs) {
        const waitSeconds = Math.ceil((this.authCooldownMs - (now - this.lastAuthAttempt)) / 1000);
        throw new Error(`Tentatives de connexion trop rapprochées. Réessayez dans ${waitSeconds} seconde(s).`);
      }

      this.lastAuthAttempt = now;

      const url = `${this.config.baseUrl}?action=login`;
      console.log('🔍 DEBUG - URL d\'authentification:', url);
      console.log('🔍 DEBUG - Config baseUrl:', this.config.baseUrl);
      console.log('🔍 DEBUG - Credentials:', { email: credentials.email, password: '***' });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password
        }),
        timeout: this.config.timeout
      });

      console.log('🔍 DEBUG - Response status:', response.status);
      console.log('🔍 DEBUG - Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const fallbackDelayMs = 120_000; // 2 minutes par défaut si aucune indication
        let retryAfterMs = fallbackDelayMs;

        if (retryAfterHeader) {
          const parsedSeconds = parseInt(retryAfterHeader, 10);

          if (!Number.isNaN(parsedSeconds)) {
            retryAfterMs = parsedSeconds * 1000;
          } else {
            const retryDate = Date.parse(retryAfterHeader);
            if (!Number.isNaN(retryDate)) {
              retryAfterMs = Math.max(retryDate - Date.now(), this.authCooldownMs);
            }
          }
        }

        this.authLockedUntil = Date.now() + Math.max(retryAfterMs, this.authCooldownMs);

        console.warn('⚠️ Authentification suspendue suite à un code 429. Prochaine tentative possible après:', new Date(this.authLockedUntil).toISOString());

        throw new Error('Le serveur a temporairement bloqué les connexions suite à de trop nombreuses tentatives. Merci de réessayer un peu plus tard.');
      }

      if (!response.ok) {
        const responseText = await response.text();
        console.log('🔍 DEBUG - Response text:', responseText.substring(0, 500));
        throw new Error(`Erreur d'authentification: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.token) {
        this.config.token = data.token;
        this.config.freelanceId = data.freelance_id;
        this.config.coreUserId = data.core_user_id || null;
        this.config.orgId = data.org_id || null;
        this.config.expiresAt = data.expires_at || null;

        this.authLockedUntil = null;
        this.lastAuthAttempt = 0;

        await this.saveTokenLocally(data.token, data.freelance_id, data.core_user_id, data.org_id, data.expires_at);

        console.log('✅ Authentification réussie (CoreAuth)');
        return {
          success: true,
          token: data.token,
          freelanceId: data.freelance_id,
          coreUserId: data.core_user_id || null,
          orgId: data.org_id || null,
          freelanceInfo: {
            name: data.freelance_name || null,
            ...(data.freelance || {})
          }
        };
      } else {
        throw new Error(data.message || 'Échec de l\'authentification');
      }
    } catch (error) {
      const formattedError = this.formatFetchError(error, 'authentification');
      console.error('❌ Erreur d\'authentification:', formattedError.originalError);
      throw formattedError.userFacingError;
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
      const formattedError = this.formatFetchError(error, 'vérification du token');
      console.error('❌ Erreur de vérification du token:', formattedError.originalError);
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
        this.config.expiresAt = data.expires_at || null;
        await this.saveTokenLocally(data.token, this.config.freelanceId, this.config.coreUserId, this.config.orgId, data.expires_at);
        return true;
      }
      return false;
    } catch (error) {
      const formattedError = this.formatFetchError(error, 'renouvellement du token');
      console.error('❌ Erreur de renouvellement du token:', formattedError.originalError);
      return false;
    }
  }

  async saveTokenLocally(token, freelanceId, coreUserId = null, orgId = null, expiresAt = null) {
    try {
      await fs.ensureDir(this.tempDir);
      const tokenData = {
        token,
        freelanceId,
        coreUserId: coreUserId || null,
        orgId: orgId || null,
        timestamp: Date.now(),
        expiresAt: expiresAt || null
      };

      const tokenPath = path.join(this.tempDir, '.auth_token');
      await fs.writeJSON(tokenPath, tokenData);
    } catch (error) {
      console.error('❌ Erreur sauvegarde token local:', error);
    }
  }

  async loadTokenLocally() {
    try {
      const tokenPath = path.join(this.tempDir, '.auth_token');
      if (!(await fs.pathExists(tokenPath))) return false;

      const tokenData = await fs.readJSON(tokenPath);

      // Rejeter si expiration connue et dépassée
      if (tokenData.expiresAt) {
        const expiresAtMs = new Date(tokenData.expiresAt).getTime();
        if (Number.isFinite(expiresAtMs) && Date.now() >= expiresAtMs) return false;
      } else {
        // Rétrocompatibilité : sans expiresAt, accepter au plus 2h (aligné sur TTL Timer)
        const tokenAge = Date.now() - (tokenData.timestamp || 0);
        if (tokenAge >= 2 * 60 * 60 * 1000) return false;
      }

      this.config.token = tokenData.token;
      this.config.freelanceId = tokenData.freelanceId;
      this.config.coreUserId = tokenData.coreUserId || null;
      this.config.orgId = tokenData.orgId || null;
      this.config.expiresAt = tokenData.expiresAt || null;
      return true;
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

        const statusCode = error && typeof error === 'object' ? error.status : undefined;
        const message = typeof error?.message === 'string' ? error.message : '';
        const isAuthError = statusCode === 401 || statusCode === 403 ||
          message.includes('401') || message.includes('403') || message.toLowerCase().includes('token expiré');

        // Si erreur d'authentification, essayer de renouveler le token
        if (isAuthError) {
          const refreshed = await this.refreshToken();
          if (refreshed) {
            // Remettre l'opération en queue
            this.operationQueue.unshift({ operation, operationName, resolve, reject });
            continue;
          }

          const sessionError = new Error('Votre session a expiré. Veuillez vous reconnecter.');
          sessionError.status = statusCode || 401;
          reject(sessionError);
          continue;
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

    // Rafraîchir proactivement si le token expire dans moins de 15 min
    if (this.config.expiresAt) {
      const expiresAtMs = new Date(this.config.expiresAt).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() < 15 * 60 * 1000) {
        await this.refreshToken();
      }
    }

    const url = `${this.config.baseUrl}?action=${endpoint}`;
    const tokenPreview = this.config.token ? `${this.config.token.slice(0, 8)}...${this.config.token.slice(-8)}` : 'none';
    console.log(`🔐 Requête sécurisée vers ${endpoint}`, {
      url,
      tokenPresent: Boolean(this.config.token),
      tokenPreview,
      freelanceId: this.config.freelanceId,
    });
    const requestOptions = {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: this.config.timeout
    };

    let response;

    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      const formattedError = this.formatFetchError(error, `requête vers ${endpoint}`);
      console.error(`❌ Erreur lors de l'appel API (${endpoint}):`, formattedError.originalError);
      throw formattedError.userFacingError;
    }

    if (!response.ok) {
      let errorMessage = `Erreur API: ${response.status} - ${response.statusText}`;
      let errorBody = null;

      try {
        errorBody = await response.json();
        if (errorBody && typeof errorBody === 'object' && errorBody.message) {
          errorMessage = `${errorBody.message} (${response.status})`;
        }
      } catch (parseError) {
        // Ignorer les erreurs de parsing JSON et conserver le message par défaut
      }

      if (response.status === 401 && !errorMessage.includes('401')) {
        errorMessage = `${errorMessage} (401)`;
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.statusText = response.statusText;
      error.responseBody = errorBody;
      throw error;
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

      let response;

      try {
        response = await this.makeSecureRequest('save-project', {
          method: 'POST',
          body: JSON.stringify(projectData)
        });
      } catch (error) {
        // Préserver les informations d'erreur de l'API pour l'IPC
        const structuredError = {
          status: error.status || error.statusCode || null,
          statusText: error.statusText || null,
          message: error.message || 'Erreur lors de la sauvegarde du projet',
          details: error.responseBody || null
        };

        // Les erreurs réseau doivent remonter pour être gérées par le handler IPC (offline queue, etc.)
        if (error.isNetworkError || (!structuredError.status && !structuredError.statusText)) {
          throw error;
        }

        // Aligné sur processQueue : 401/403 relancés pour déclencher refresh + retry
        const statusCode = structuredError.status;
        const msg = typeof structuredError.message === 'string' ? structuredError.message : '';
        const isAuthError = statusCode === 401 || statusCode === 403 ||
          msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('token expiré');
        if (isAuthError) {
          const authErr = new Error(structuredError.message);
          authErr.status = statusCode;
          authErr.statusText = structuredError.statusText;
          authErr.responseBody = structuredError.details;
          throw authErr;
        }

        return { error: structuredError };
      }

      if (response.success) {
        const payload = response.data?.project || response.data || response;
        const normalizedProject = {
          ...project,
          id: payload.project_uuid || payload.id || project.id,
          projectId: payload.project_id || payload.id || project.projectId,
          currentTime: payload.currentTime ?? payload.current_time ?? project.currentTime ?? 0,
          status: payload.status ?? project.status ?? 'active'
        };

        console.log('✅ Projet sauvegardé avec succès', {
          returnedProjectId: normalizedProject.id,
          projectId: normalizedProject.projectId,
          status: normalizedProject.status
        });
        console.log('🧪 Vérification retour saveProject:', normalizedProject ? 'OK' : 'NUL');

        return normalizedProject;
      } else {
        return {
          error: {
            status: response.status || null,
            statusText: response.statusText || null,
            message: response.message || 'Erreur lors de la sauvegarde',
            details: response.data || null,
          }
        };
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

  // Charger la liste des clients existants (pour création de projet)
  async loadClients() {
    return this.queueOperation(async () => {
      const response = await this.makeSecureRequest('clients', {
        method: 'GET'
      });
      if (response.success) {
        return response.data || [];
      }
      throw new Error(response.message || 'Erreur chargement clients');
    }, 'loadClients');
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

  // Envoyer un feedback utilisateur durant la bêta
  async sendFeedback(feedback) {
    return this.queueOperation(async () => {
      console.log('📝 Envoi d\'un feedback:', {
        type: feedback?.type || 'bug',
        hasMessage: !!feedback?.message,
        freelanceId: this.config.freelanceId
      });

      const payload = {
        type: feedback?.type || 'bug',
        message: feedback?.message || '',
        email: feedback?.email || '',
        freelance_id: this.config.freelanceId,
        app_version: feedback?.appVersion || null,
        freelance_name: feedback?.freelanceName || null,
        freelance_email: feedback?.freelanceEmail || feedback?.email || null,
        current_view: feedback?.currentView || null,
        sent_at: feedback?.sentAt || new Date().toISOString()
      };

      let response;

      try {
        response = await this.makeSecureRequest('feedback', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } catch (error) {
        if (error?.message && error.message.includes('404')) {
          const friendlyError = new Error(
            "Le serveur n'a pas reconnu la route de feedback. Vérifiez que votre URL API pointe bien vers le fichier `api-timer.php` à jour ou utilisez l'envoi par email."
          );
          friendlyError.code = 'FEEDBACK_ENDPOINT_NOT_FOUND';
          throw friendlyError;
        }

        throw error;
      }

      if (response.success) {
        console.log('✅ Feedback envoyé avec succès');
        return response.data || true;
      }

      const apiError = new Error(response.message || 'Erreur lors de l\'envoi du feedback');
      apiError.code = response.code || null;
      throw apiError;
    }, 'sendFeedback');
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
      const formattedError = this.formatFetchError(error, 'test de connexion API');
      console.error('❌ Test de connexion API échoué:', formattedError.originalError);
      throw formattedError.userFacingError;
    }
  }

  formatFetchError(error, context) {
    const defaultMessage = `Une erreur est survenue lors de ${context}.`;

    if (!error || typeof error !== 'object') {
      return {
        originalError: error,
        userFacingError: new Error(defaultMessage)
      };
    }

    const cause = error.cause || {};
    let userMessage = defaultMessage;
    let isNetworkIssue = false;

    if (cause.code === 'UND_ERR_CONNECT_TIMEOUT') {
      userMessage = 'La connexion au serveur a expiré. Vérifiez votre connexion internet ou l\'accessibilité du serveur API.';
      isNetworkIssue = true;
    } else if (cause.code === 'UND_ERR_CONNECT') {
      userMessage = 'Impossible de se connecter au serveur. Vérifiez l\'URL de l\'API et votre connexion réseau.';
      isNetworkIssue = true;
    } else if (cause.code === 'UND_ERR_DNS') {
      userMessage = 'Le nom de domaine de l\'API est introuvable. Assurez-vous que l\'adresse est correcte.';
      isNetworkIssue = true;
    } else if (error.name === 'AbortError') {
      userMessage = 'La requête a été annulée avant d\'être terminée. Veuillez réessayer.';
    }

    if (error.name === 'TypeError' || /fetch/i.test(error.message || '')) {
      isNetworkIssue = true;
    }

    const userFacingError = new Error(userMessage);

    if (typeof error.status === 'number') {
      userFacingError.status = error.status;
    }

    if (isNetworkIssue) {
      userFacingError.isNetworkError = true;
      if (cause?.code) {
        userFacingError.networkCode = cause.code;
      } else if (error.code) {
        userFacingError.networkCode = error.code;
      }
    }

    return {
      originalError: error,
      userFacingError
    };
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
