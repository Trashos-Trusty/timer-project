import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import ProjectList from './components/ProjectList';
import Timer from './components/Timer';
import Stopwatch from './components/Stopwatch';
import ProjectModal from './components/ProjectModal';
import LoginModal from './components/LoginModal';
import ApiConfigModal from './components/ApiConfigModal';
import LoadingOverlay from './components/LoadingOverlay';
import ConnectionStatus from './components/ConnectionStatus';
import UpdateManager from './components/UpdateManager';
import OnboardingModal from './components/OnboardingModal';
import FeedbackModal from './components/FeedbackModal';
import MiniTimerOverlay from './components/MiniTimerOverlay';
import MiniTimerWindow from './components/MiniTimerWindow';
import connectionManager from './connectionManager';
import { isSessionExpiredError, markSessionExpiredError } from './utils/authErrors';
import './index.css';

const normalizeProject = (project) => {
  if (!project) {
    return project;
  }

  const client =
    project.client !== undefined && project.client !== null
      ? project.client
      : project.clientName !== undefined && project.clientName !== null
        ? project.clientName
        : '';

  return {
    ...project,
    client
  };
};

const ONBOARDING_STORAGE_KEY = 'timerProjectOnboardingSeen';
const FEEDBACK_FALLBACK_EMAIL = 'enguerran@trustystudio.fr';
const MINI_TIMER_MAX_WAIT_ATTEMPTS = 20;
const MINI_TIMER_WAIT_DELAY_MS = 50;

const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('timer'); // 'timer' ou 'stopwatch'
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [isApiConfigured, setIsApiConfigured] = useState(false);
  const [freelanceInfo, setFreelanceInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [miniTimerSnapshot, setMiniTimerSnapshot] = useState(null);
  const [isMiniTimerVisible, setIsMiniTimerVisible] = useState(false);
  const [isMiniTimerCollapsed, setIsMiniTimerCollapsed] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#mini') {
      return false;
    }
    return true;
  });
  const [miniTimerPosition, setMiniTimerPosition] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedPosition = window.localStorage.getItem('miniTimerPosition');
        if (storedPosition) {
          const parsed = JSON.parse(storedPosition);
          if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
            return parsed;
          }
        }
      } catch (error) {
        console.warn("Impossible de charger la position du mini-timer :", error);
      }
    }

    return { x: 16, y: 16 };
  });

  const isMiniWindowMode = typeof window !== 'undefined' && window.location.hash === '#mini';
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const shouldRenderInlineMiniOverlay = !isElectron;
  const miniTimerHasProject = Boolean(miniTimerSnapshot?.project);
  const miniTimerIsRunning = Boolean(miniTimerSnapshot?.isRunning);
  const miniTimerHasPendingSession = Boolean(miniTimerSnapshot?.hasPendingSession);
  const canShowMiniTimer = Boolean(
    miniTimerHasProject && (miniTimerIsRunning || miniTimerHasPendingSession)
  );

  const miniTimerWasVisibleRef = useRef(false);

  const handleSessionExpired = useCallback(() => {
    console.warn('🔒 Session expirée détectée, retour à l\'écran de connexion.');
    setIsAuthenticated(false);
    setFreelanceInfo(null);
    setSelectedProject(null);
    setMiniTimerSnapshot(null);

    if (typeof window !== 'undefined' && window.electronAPI?.clearToken) {
      try {
        window.electronAPI.clearToken();
      } catch (error) {
        console.error('Erreur lors de la suppression du token après expiration de session:', error);
      }
    }
  }, []);

  const clampMiniTimerPosition = useCallback(
    (position) => {
      if (typeof window === 'undefined') {
        return position;
      }

      const padding = 16;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const estimatedWidth = isMiniTimerCollapsed ? 200 : 300;
      const estimatedHeight = isMiniTimerCollapsed ? 100 : 180;
      const maxX = Math.max(padding, width - estimatedWidth - padding);
      const maxY = Math.max(padding, height - estimatedHeight - padding);

      const nextX = position?.x ?? padding;
      const nextY = position?.y ?? padding;
      const clampedX = Math.min(Math.max(nextX, padding), maxX);
      const clampedY = Math.min(Math.max(nextY, padding), maxY);

      if (
        position &&
        typeof position.x === 'number' &&
        typeof position.y === 'number' &&
        position.x === clampedX &&
        position.y === clampedY
      ) {
        return position;
      }

      return {
        x: clampedX,
        y: clampedY
      };
    },
    [isMiniTimerCollapsed]
  );

  const handleMiniTimerPositionChange = useCallback(
    (nextPosition) => {
      setMiniTimerPosition((prevPosition) => {
        const targetPosition = nextPosition || prevPosition;
        const clamped = clampMiniTimerPosition(targetPosition);

        if (
          prevPosition &&
          typeof prevPosition.x === 'number' &&
          typeof prevPosition.y === 'number' &&
          prevPosition.x === clamped.x &&
          prevPosition.y === clamped.y
        ) {
          return prevPosition;
        }

        return clamped;
      });
    },
    [clampMiniTimerPosition]
  );

  const handleToggleMiniTimer = useCallback(() => {
    setIsMiniTimerVisible((prev) => {
      if (!canShowMiniTimer && !prev) {
        return prev;
      }

      return !prev;
    });
  }, [canShowMiniTimer]);

  useEffect(() => {
    setMiniTimerPosition((prev) => clampMiniTimerPosition(prev));
  }, [clampMiniTimerPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      setMiniTimerPosition((prev) => clampMiniTimerPosition(prev));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [clampMiniTimerPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem('miniTimerPosition', JSON.stringify(miniTimerPosition));
    } catch (error) {
      console.warn("Impossible de sauvegarder la position du mini-timer :", error);
    }
  }, [miniTimerPosition]);

  useEffect(() => {
    if (!canShowMiniTimer) {
      setIsMiniTimerVisible(false);
    }
  }, [canShowMiniTimer]);

  useEffect(() => {
    if (!isTimerRunning && !miniTimerHasPendingSession) {
      setIsMiniTimerVisible(false);
    }
  }, [isTimerRunning, miniTimerHasPendingSession]);

  // Référence au composant Timer pour accéder à sa fonction de sauvegarde
  const timerRef = useRef(null);

  const hideMiniTimerWindow = useCallback(async () => {
    setIsMiniTimerVisible(false);

    if (window?.electronAPI?.setMiniTimerVisibility) {
      try {
        await window.electronAPI.setMiniTimerVisibility(false);
      } catch (error) {
        console.warn('Impossible de masquer la fenêtre mini :', error);
      }
    }
  }, []);

  const focusMainWindow = useCallback(async () => {
    if (!window?.electronAPI?.showMainWindow) {
      return;
    }

    try {
      await window.electronAPI.showMainWindow();
    } catch (error) {
      console.warn('Impossible d\'afficher la fenêtre principale :', error);
    }
  }, []);

  const handleMiniExpand = useCallback(async () => {
    await hideMiniTimerWindow();
    await focusMainWindow();
  }, [hideMiniTimerWindow, focusMainWindow]);

  const ensureTimerControls = useCallback(async () => {
    if (currentView !== 'timer') {
      setCurrentView('timer');
    }

    for (let attempt = 0; attempt < MINI_TIMER_MAX_WAIT_ATTEMPTS; attempt += 1) {
      const timerControls = timerRef.current;

      if (timerControls && typeof timerControls === 'object') {
        return timerControls;
      }

      await delay(MINI_TIMER_WAIT_DELAY_MS);
    }

    return timerRef.current;
  }, [currentView, setCurrentView]);

  const performMiniTimerAction = useCallback(
    async (action) => {
      const actionMap = {
        pause: 'pauseTimer',
        resume: 'resumeTimer',
        stop: 'stopTimer',
      };

      const methodName = actionMap[action];

      if (!methodName) {
        return false;
      }

      let timerControls = timerRef.current;

      if (!timerControls || typeof timerControls[methodName] !== 'function') {
        timerControls = await ensureTimerControls();
      }

      const actionHandler = timerControls?.[methodName];

      if (typeof actionHandler !== 'function') {
        console.warn(
          `Impossible d'exécuter l'action "${action}" depuis le mini-timer : fonction indisponible.`
        );
        return false;
      }

      try {
        await actionHandler();
        return true;
      } catch (error) {
        console.error(`Erreur lors de l'exécution de l'action mini-timer "${action}" :`, error);
        return false;
      }
    },
    [ensureTimerControls]
  );

  const handleMiniPause = useCallback(async () => {
    await performMiniTimerAction('pause');
  }, [performMiniTimerAction]);

  const handleMiniResume = useCallback(async () => {
    await performMiniTimerAction('resume');
  }, [performMiniTimerAction]);

  const handleMiniStop = useCallback(async () => {
    await performMiniTimerAction('stop');
    await handleMiniExpand();
  }, [performMiniTimerAction, handleMiniExpand]);

  const markOnboardingAsSeen = useCallback((status = 'acknowledged') => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ONBOARDING_STORAGE_KEY, status);
      }
    } catch (error) {
      console.warn('Impossible de persister l\'état de l\'onboarding :', error);
    }
  }, []);

  useEffect(() => {
    if (!isMiniWindowMode) {
      return;
    }

    const api = window.electronAPI;
    if (!api?.onMiniTimerSnapshot) {
      return undefined;
    }

    const cleanup = api.onMiniTimerSnapshot((snapshot) => {
      setMiniTimerSnapshot(snapshot || null);
    });

    api.requestMiniTimerSnapshot?.()
      .then((snapshot) => {
        if (snapshot) {
          setMiniTimerSnapshot(snapshot);
        } else {
          setMiniTimerSnapshot(null);
        }
      })
      .catch((error) => {
        console.warn('Impossible de récupérer le snapshot du mini-timer :', error);
      });

    return cleanup;
  }, [isMiniWindowMode]);

  useEffect(() => {
    if (isMiniWindowMode) {
      return;
    }

    const api = window.electronAPI;
    if (!api?.updateMiniTimerSnapshot) {
      return;
    }

    api.updateMiniTimerSnapshot(miniTimerSnapshot);
  }, [isMiniWindowMode, miniTimerSnapshot]);

  useEffect(() => {
    if (typeof window === 'undefined' || isMiniWindowMode) {
      return undefined;
    }

    const api = window.electronAPI;
    if (!api?.onMiniTimerAction) {
      return undefined;
    }

    const cleanup = api.onMiniTimerAction((payload) => {
      const actionType = typeof payload === 'string' ? payload : payload?.type;

      if (!actionType) {
        return;
      }

      const safelyExecute = (fn) => {
        try {
          const result = fn();
          if (result && typeof result.then === 'function') {
            result.catch((error) => {
              console.error('Erreur lors du traitement de l\'action mini-timer :', error);
            });
          }
        } catch (error) {
          console.error('Erreur lors du traitement de l\'action mini-timer :', error);
        }
      };

      if (actionType === 'pause') {
        safelyExecute(handleMiniPause);
      } else if (actionType === 'resume') {
        safelyExecute(handleMiniResume);
      } else if (actionType === 'stop') {
        safelyExecute(handleMiniStop);
      } else if (actionType === 'expand') {
        safelyExecute(handleMiniExpand);
      }
    });

    return cleanup;
  }, [isMiniWindowMode, handleMiniPause, handleMiniResume, handleMiniStop, handleMiniExpand]);

  useEffect(() => {
    if (isMiniWindowMode) {
      return;
    }

    const api = window.electronAPI;
    if (!api?.setMiniTimerVisibility) {
      return;
    }

    const shouldShowMiniWindow = Boolean(isMiniTimerVisible && miniTimerSnapshot?.project);
    api.setMiniTimerVisibility(shouldShowMiniWindow);

    if (shouldShowMiniWindow && !miniTimerWasVisibleRef.current) {
      api.minimizeMainWindow?.();
    }

    miniTimerWasVisibleRef.current = shouldShowMiniWindow;
  }, [isMiniWindowMode, isMiniTimerVisible, miniTimerSnapshot]);

  useEffect(() => {
    if (isMiniWindowMode) {
      return undefined;
    }

    const api = window.electronAPI;

    return () => {
      api?.setMiniTimerVisibility?.(false);
    };
  }, [isMiniWindowMode]);

  // Charger les projets
  const loadProjects = useCallback(async () => {
    try {
      if (isMiniWindowMode) {
        return;
      }

      if (window.electronAPI) {
        console.log('🔄 Chargement des projets...');
        const rawProjects = await window.electronAPI.loadProjects();
        const loadedProjects = Array.isArray(rawProjects)
          ? rawProjects
          : Array.isArray(rawProjects?.projects)
            ? rawProjects.projects
            : [];

        if (!Array.isArray(rawProjects)) {
          console.warn('⚠️ Réponse inattendue lors du chargement des projets:', rawProjects);
        }

        // Filtrer les doublons par ID - garder le plus récent
        const projectMap = new Map();

        loadedProjects.forEach(project => {
          if (!project?.id) {
            return;
          }

          const existingProject = projectMap.get(project.id);
          if (!existingProject ||
              (project.lastSaved && (!existingProject.lastSaved || project.lastSaved > existingProject.lastSaved))) {
            projectMap.set(project.id, project);
          }
        });

        // Convertir la Map en tableau et normaliser les données
        const normalizedProjects = [];
        projectMap.forEach(project => {
          normalizedProjects.push(normalizeProject(project));
        });

        // Trier par nom
        normalizedProjects.sort((a, b) => {
          const nameA = (a?.name || '').toString().toLowerCase();
          const nameB = (b?.name || '').toString().toLowerCase();
          return nameA.localeCompare(nameB);
        });

        console.log(`📋 Projets chargés: ${loadedProjects.length} total, ${normalizedProjects.length} uniques`);
        setProjects(normalizedProjects);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des projets:', error);
      // Notifier le gestionnaire de connexion en cas d'erreur réseau
      if (error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
        connectionManager.handleConnectionError();
      }
    }
  }, [isMiniWindowMode]);

  // Vérifier la configuration API et l'authentification
  const checkApiConfig = useCallback(async () => {
    try {
      console.log('🔧 Vérification de la configuration API...');
      if (isMiniWindowMode) {
        return;
      }
      if (window.electronAPI) {
        // Vérifier si l'API est configurée
        const configured = await window.electronAPI.isApiConfigured();
        console.log('✅ Configuration API:', configured ? 'Configurée' : 'Non configurée');
        setIsApiConfigured(configured);
        
        if (configured) {
          // Essayer de charger un token local existant
          const hasValidToken = await window.electronAPI.hasValidToken();
          if (hasValidToken) {
            const freelanceInfo = await window.electronAPI.getFreelanceInfo();
            setFreelanceInfo(freelanceInfo);
            setIsAuthenticated(true);
            console.log('✅ Authentification automatique réussie');
          } else {
            console.log('ℹ️ Authentification nécessaire - affichage de l\'écran de connexion');
            // Ne plus afficher le modal API, juste demander l'authentification
            setIsAuthenticated(false);
          }
        } else {
          console.log('ℹ️ Configuration API nécessaire');
          setShowApiModal(true);
        }
      }
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de la config API:', error);
      // Seulement afficher le modal si la config n'est vraiment pas disponible
      if (!isApiConfigured) {
        setShowApiModal(true);
      }
    }
  }, [isApiConfigured, isMiniWindowMode]);

  // Initialisation au démarrage
  useEffect(() => {
    if (isMiniWindowMode) {
      setIsLoading(false);
      return;
    }

    const initializeApp = async () => {
      try {
        console.log('🚀 Initialisation de l\'application...');
        setIsLoading(true);
        setIsSaving(false); // S'assurer que isSaving est à false au démarrage
        
        // Vérifier la config API d'abord
        await checkApiConfig();
        
        // Ne pas charger les projets ici - ils seront chargés après authentification
        
      } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
      } finally {
        setIsLoading(false);
        console.log('✅ Initialisation terminée');
      }
    };
    
    initializeApp();
  }, [checkApiConfig, isMiniWindowMode]);

  // Charger les projets quand l'utilisateur est authentifié
  useEffect(() => {
    if (isMiniWindowMode) {
      return;
    }

    if (isAuthenticated) {
      console.log('🔐 Utilisateur authentifié, chargement des projets...');
      loadProjects();
    } else {
      // Vider la liste des projets si l'utilisateur n'est pas authentifié
      setProjects([]);
      setShowOnboarding(false);
    }
  }, [isAuthenticated, isMiniWindowMode, loadProjects]);

  useEffect(() => {
    if (isMiniWindowMode) {
      return;
    }

    if (!isAuthenticated) {
      return;
    }

    try {
      const hasSeenOnboarding = typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
        : null;

      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    } catch (error) {
      console.warn('Impossible de lire l\'état de l\'onboarding :', error);
      setShowOnboarding(true);
    }
  }, [isAuthenticated, isMiniWindowMode]);

  // Gérer les événements de connexion
  useEffect(() => {
    if (isMiniWindowMode) {
      return;
    }

    const unsubscribe = connectionManager.addListener((event) => {
      if (event.type === 'reconnected' && isAuthenticated) {
        // Quand la connexion est rétablie, recharger les projets
        console.log('🔄 Connexion rétablie, rechargement des projets...');
        setTimeout(() => {
          loadProjects();
        }, 1000);
      }
    });

    return unsubscribe;
  }, [isAuthenticated, isMiniWindowMode, loadProjects]);

  // Gestionnaire d'événements du menu Electron
  useEffect(() => {
    if (isMiniWindowMode) {
      return;
    }

    if (window.electronAPI) {
      const cleanup = window.electronAPI.onMenuNewProject(() => {
        handleNewProject();
      });

      return cleanup;
    }
  }, [isMiniWindowMode]);

  const handleLogin = async (credentials) => {
    // Authentification directe via API
    try {
      if (window.electronAPI && window.electronAPI.authenticateUser) {
        const result = await window.electronAPI.authenticateUser(credentials);
        if (result.success) {
          setIsAuthenticated(true);
          setFreelanceInfo(result.freelanceInfo);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Erreur d\'authentification:', error);
      return false;
    }
  };

  const handleLogout = async () => {
    // Sauvegarder automatiquement la session en cours avant de déconnecter
    // Sauvegarder même si le timer n'est pas en cours mais qu'il y a du temps accumulé
    if (selectedProject && timerRef.current && timerRef.current.saveCurrentSession) {
      const hasActiveSession = selectedProject.status === 'running';
      const hasAccumulatedTime = selectedProject.currentTime > 0;
      
      if (hasActiveSession || hasAccumulatedTime) {
        console.log('💾 Sauvegarde automatique avant déconnexion...', {
          hasActiveSession,
          hasAccumulatedTime,
          currentTime: selectedProject.currentTime,
          status: selectedProject.status
        });
        
        try {
          await timerRef.current.saveCurrentSession(true); // true = sauvegarde automatique
          console.log('✅ Session sauvegardée avant déconnexion');
        } catch (error) {
          console.error('❌ Erreur lors de la sauvegarde avant déconnexion:', error);
        }
      }
    }
    
    setIsAuthenticated(false);
    setFreelanceInfo(null);
    setSelectedProject(null);
    setMiniTimerSnapshot(null);
    
    // Effacer le token local
    if (window.electronAPI && window.electronAPI.clearToken) {
      window.electronAPI.clearToken();
    }
  };

  const handleViewChange = async (newView) => {
    // Si on passe au chronomètre, arrêter tous les timers de projet
    if (newView === 'stopwatch') {
      // Arrêter le projet sélectionné s'il est en cours
      if (selectedProject && selectedProject.status === 'running') {
        try {
          const updatedProject = {
            ...selectedProject,
            status: 'paused'
          };
          if (window.electronAPI) {
            await window.electronAPI.saveProject(updatedProject);
            await loadProjects();
          }
        } catch (error) {
          console.error('Erreur lors de l\'arrêt du projet:', error);
          if (isSessionExpiredError(error)) {
            if (!error?.isAuthError) {
              handleSessionExpired();
            }
            markSessionExpiredError(error);
            return;
          }
        }
      }
      // Désélectionner le projet
      setSelectedProject(null);
    }
    if (newView === 'stopwatch') {
      setMiniTimerSnapshot(null);
    }

    setCurrentView(newView);
  };

  const handleNewProject = () => {
    setEditingProject(null);
    setShowProjectModal(true);
  };

  const handleEditProject = (project) => {
    console.log('✏️ Edition projet:', { project });
    setEditingProject(project);
    setShowProjectModal(true);
  };

  const handleProjectUpdate = useCallback((updatedProject) => {
    if (!updatedProject || !updatedProject.id) {
      return;
    }

    const normalizedProject = normalizeProject(updatedProject);

    setProjects((prevProjects) => {
      let found = false;
      const updatedProjects = prevProjects.map((project) => {
        if (project.id === normalizedProject.id) {
          found = true;
          return { ...project, ...normalizedProject };
        }
        return project;
      });

      if (!found) {
        return [...prevProjects, normalizedProject];
      }

      return updatedProjects;
    });

    setSelectedProject((prevSelected) => {
      if (prevSelected?.id === normalizedProject.id) {
        return { ...prevSelected, ...normalizedProject };
      }
      return prevSelected;
    });
  }, []);

  const handleSaveProject = async (projectData) => {
    try {
      console.log('💾 Données projet avant sauvegarde:', projectData);
      
      // DIAGNOSTIC: Vérifier si nous sommes en mode Electron
      console.log('🔍 Diagnostic API Electron:', {
        hasElectronAPI: !!window.electronAPI,
        hasSaveProject: !!window.electronAPI?.saveProject,
        isLoading: isLoading,
        isSaving: isSaving
      });
      
      if (!window.electronAPI) {
        throw new Error('API Electron non disponible - Application en mode navigateur ?');
      }
      
      if (!window.electronAPI.saveProject) {
        throw new Error('Fonction saveProject non disponible dans l\'API Electron');
      }
      
      if (isSaving) {
        console.warn('⚠️ Sauvegarde déjà en cours, ignorée');
        return;
      }
      
      setIsSaving(true);
      
      // Chercher le projet existant par ID pour obtenir l'ancien nom
      const existingProject = projects.find(p => p.id === projectData.id);
      const originalName = existingProject ? existingProject.name : null;
      const isNewProject = !existingProject;
      
      console.log('📝 Sauvegarde projet:', {
        isEditing: !!editingProject,
        isNewProject: isNewProject,
        hasExistingProject: !!existingProject,
        originalName: originalName,
        newName: projectData.name,
        projectId: projectData.id
      });
      
      // Attendre que la sauvegarde soit complètement terminée
      console.log('🚀 Appel window.electronAPI.saveProject...');
      const result = await window.electronAPI.saveProject(projectData, originalName);
      console.log('✅ Réponse de window.electronAPI.saveProject:', result);

      const mergedProject = {
        ...projectData,
        ...(result && typeof result === 'object' ? result : {})
      };

      handleProjectUpdate(mergedProject);

      // Recharger SEULEMENT pour les nouveaux projets pour qu'ils apparaissent dans la liste
      if (isNewProject) {
        console.log('🔄 Rechargement après création de nouveau projet');
        setTimeout(async () => {
          await loadProjects();
        }, 500);
      }
      
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde du projet:', error);
      if (isSessionExpiredError(error)) {
        if (!error?.isAuthError) {
          handleSessionExpired();
        }
        throw markSessionExpiredError(error);
      }

      throw error instanceof Error ? error : new Error(String(error || 'Erreur inconnue lors de la sauvegarde du projet.'));
    } finally {
      // S'assurer que isSaving est remis à false dans tous les cas
      setIsSaving(false);
      console.log('🔓 État isSaving remis à false');
    }
  };

  const handleDeleteProject = async (projectId) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.showMessageBox({
          type: 'question',
          title: 'Confirmer la suppression',
          message: 'Êtes-vous sûr de vouloir supprimer ce projet ?',
          buttons: ['Annuler', 'Supprimer'],
          defaultId: 0,
          cancelId: 0
        });

        if (result.response === 1) {
          await window.electronAPI.deleteProject(projectId);
          await loadProjects();
          if (selectedProject?.id === projectId) {
            setSelectedProject(null);
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du projet:', error);
    }
  };

  const handleSelectProject = (project) => {
    setSelectedProject(project);
  };

  const handleApiConfigSave = async () => {
    setIsApiConfigured(true);
    setIsAuthenticated(true);
    setShowApiModal(false);
    
    // Récupérer les informations du freelance
    try {
      const freelanceInfo = await window.electronAPI.getFreelanceInfo();
      setFreelanceInfo(freelanceInfo);
      console.log('✅ Informations freelance chargées:', freelanceInfo);
    } catch (error) {
      console.error('❌ Erreur lors du chargement des infos freelance:', error);
    }
    
    // Recharger les projets après la configuration
    setTimeout(async () => {
      await loadProjects();
    }, 300);
  };

  const handleRefresh = async () => {
    if (isRefreshing || isSaving) return;

    setIsRefreshing(true);
    try {
      await loadProjects();
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
      // En cas d'erreur d'authentification, redemander la config
      if (error.message && (error.message.includes('401') || error.message.includes('403'))) {
        setIsAuthenticated(false);
        setShowApiModal(true);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenApiConfig = () => {
    setShowApiModal(true);
  };

  const handleOpenFeedback = () => {
    setShowFeedbackModal(true);
  };

  const handleSubmitFeedback = async (feedbackData) => {
    if (!window?.electronAPI?.sendFeedback) {
      throw new Error(
        `La collecte de feedback n'est pas disponible. Vous pouvez nous écrire à ${FEEDBACK_FALLBACK_EMAIL}.`
      );
    }

    try {
      const appVersion = window?.electronAPI?.getAppVersion
        ? await window.electronAPI.getAppVersion()
        : null;

      const result = await window.electronAPI.sendFeedback({
        ...feedbackData,
        appVersion: appVersion || null,
        freelanceId: freelanceInfo?.id || null,
        freelanceName: freelanceInfo?.name || null,
        freelanceEmail: freelanceInfo?.email || null,
        currentView,
        sentAt: new Date().toISOString()
      });

      if (!result?.success) {
        const error = new Error(
          result?.message ||
            `Impossible d'envoyer le feedback pour le moment. Vous pouvez nous écrire à ${FEEDBACK_FALLBACK_EMAIL}.`
        );

        if (result?.code) {
          error.code = result.code;
        }

        throw error;
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        `Une erreur inattendue est survenue. Vous pouvez nous écrire à ${FEEDBACK_FALLBACK_EMAIL}.`
      );
    }
  };

  if (isMiniWindowMode) {
    return (
      <MiniTimerWindow
        snapshot={miniTimerSnapshot}
        isCollapsed={isMiniTimerCollapsed}
        onToggleCollapse={() => setIsMiniTimerCollapsed((prev) => !prev)}
      />
    );
  }

  if (!isAuthenticated) {
    return <LoginModal onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {shouldRenderInlineMiniOverlay && isMiniTimerVisible && (
        <MiniTimerOverlay
          snapshot={miniTimerSnapshot}
          isCollapsed={isMiniTimerCollapsed}
          onToggleCollapse={() => setIsMiniTimerCollapsed((prev) => !prev)}
          isDraggable
          position={miniTimerPosition}
          onPositionChange={handleMiniTimerPositionChange}
          onPause={handleMiniPause}
          onResume={handleMiniResume}
          onStop={handleMiniStop}
          onRequestExpand={handleMiniExpand}
        />
      )}

      <Header
        currentView={currentView}
        onViewChange={handleViewChange}
        onNewProject={handleNewProject}
        onOpenApiConfig={handleOpenApiConfig}
        onLogout={handleLogout}
        onOpenFeedback={handleOpenFeedback}
        isApiConfigured={isApiConfigured}
        freelanceInfo={freelanceInfo}
        disabled={isSaving}
        isTimerRunning={isTimerRunning}
      />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar avec la liste des projets */}
        {currentView === 'timer' && (
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
            <ProjectList
              projects={projects}
              selectedProject={selectedProject}
              onSelectProject={handleSelectProject}
              onEditProject={handleEditProject}
              onDeleteProject={handleDeleteProject}
              onRefresh={handleRefresh}
              disabled={isSaving || isTimerRunning}
              isRefreshing={isRefreshing}
              isTimerRunning={isTimerRunning}
            />
          </div>
        )}

        {/* Zone principale */}
        <div className="flex-1 flex flex-col">
          {currentView === 'timer' ? (
            <Timer
              ref={timerRef}
              selectedProject={selectedProject}
              onProjectUpdate={handleProjectUpdate}
              disabled={isSaving}
              onTimerStateChange={setIsTimerRunning}
              onTimerSnapshot={setMiniTimerSnapshot}
              onToggleMiniTimer={handleToggleMiniTimer}
              isMiniTimerVisible={isMiniTimerVisible}
              canShowMiniTimer={canShowMiniTimer}
              onSessionExpired={handleSessionExpired}
            />
          ) : (
            <Stopwatch />
          )}
        </div>
      </div>

      {/* Modales */}
      {showProjectModal && (
        <ProjectModal
          project={editingProject}
          onSave={handleSaveProject}
          onClose={() => {
            setShowProjectModal(false);
            setEditingProject(null);
          }}
        />
      )}

      {/* Modal de configuration API */}
      <ApiConfigModal
        isOpen={showApiModal}
        onClose={() => setShowApiModal(false)}
        onSave={handleApiConfigSave}
      />

      {showOnboarding && (
        <OnboardingModal
          onComplete={(dontShowAgain) => {
            markOnboardingAsSeen(dontShowAgain ? 'hidden' : 'acknowledged');
            setShowOnboarding(false);
          }}
        />
      )}

      {showFeedbackModal && (
        <FeedbackModal
          freelanceInfo={freelanceInfo}
          onClose={() => setShowFeedbackModal(false)}
          onSubmit={handleSubmitFeedback}
        />
      )}

      {/* Overlay de chargement */}
      <LoadingOverlay
        isVisible={isSaving}
        message={editingProject ? "Mise à jour du projet..." : "Création du projet..."}
      />

      {/* Indicateur de connexion */}
      <ConnectionStatus />
      
      {/* Gestionnaire des mises à jour */}
      <UpdateManager />
    </div>
  );
}

export default App;
