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
import connectionManager from './connectionManager';
import './index.css';

const ONBOARDING_STORAGE_KEY = 'timerProjectOnboardingSeen';

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

  // Référence au composant Timer pour accéder à sa fonction de sauvegarde
  const timerRef = useRef(null);

  const markOnboardingAsSeen = useCallback((status = 'acknowledged') => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ONBOARDING_STORAGE_KEY, status);
      }
    } catch (error) {
      console.warn('Impossible de persister l\'état de l\'onboarding :', error);
    }
  }, []);

  // Charger les projets
  const loadProjects = async () => {
    try {
      if (window.electronAPI) {
        console.log('🔄 Chargement des projets...');
        const loadedProjects = await window.electronAPI.loadProjects();
        
        // Filtrer les doublons par ID - garder le plus récent
        const uniqueProjects = [];
        const projectMap = new Map();
        
        (loadedProjects || []).forEach(project => {
          const existingProject = projectMap.get(project.id);
          if (!existingProject || 
              (project.lastSaved && (!existingProject.lastSaved || project.lastSaved > existingProject.lastSaved))) {
            projectMap.set(project.id, project);
          }
        });
        
        // Convertir la Map en tableau
        projectMap.forEach(project => uniqueProjects.push(project));
        
        // Trier par nom
        uniqueProjects.sort((a, b) => a.name.localeCompare(b.name));
        
        console.log(`📋 Projets chargés: ${loadedProjects?.length || 0} total, ${uniqueProjects.length} uniques`);
        setProjects(uniqueProjects);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des projets:', error);
      // Notifier le gestionnaire de connexion en cas d'erreur réseau
      if (error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
        connectionManager.handleConnectionError();
      }
    }
  };

  // Vérifier la configuration API et l'authentification
  const checkApiConfig = useCallback(async () => {
    try {
      console.log('🔧 Vérification de la configuration API...');
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
  }, [isApiConfigured]);

  // Initialisation au démarrage
  useEffect(() => {
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
  }, [checkApiConfig]);

  // Charger les projets quand l'utilisateur est authentifié
  useEffect(() => {
    if (isAuthenticated) {
      console.log('🔐 Utilisateur authentifié, chargement des projets...');
      loadProjects();
    } else {
      // Vider la liste des projets si l'utilisateur n'est pas authentifié
      setProjects([]);
      setShowOnboarding(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
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
  }, [isAuthenticated]);

  // Gérer les événements de connexion
  useEffect(() => {
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
  }, [isAuthenticated]); // Removed loadProjects dependency to avoid infinite re-renders

  // Gestionnaire d'événements du menu Electron
  useEffect(() => {
    if (window.electronAPI) {
      const cleanup = window.electronAPI.onMenuNewProject(() => {
        handleNewProject();
      });
      
      return cleanup;
    }
  }, []);

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
        }
      }
      // Désélectionner le projet
      setSelectedProject(null);
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
      
      // Recharger SEULEMENT pour les nouveaux projets pour qu'ils apparaissent dans la liste
      if (isNewProject) {
        console.log('🔄 Rechargement après création de nouveau projet');
        setTimeout(async () => {
          await loadProjects();
        }, 500);
      }
      
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde du projet:', error);
      throw error;
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

  const handleProjectUpdate = useCallback((updatedProject) => {
    if (!updatedProject || !updatedProject.id) {
      return;
    }

    setProjects((prevProjects) => {
      let found = false;
      const updatedProjects = prevProjects.map((project) => {
        if (project.id === updatedProject.id) {
          found = true;
          return { ...project, ...updatedProject };
        }
        return project;
      });

      if (!found) {
        return [...prevProjects, updatedProject];
      }

      return updatedProjects;
    });

    setSelectedProject((prevSelected) => {
      if (prevSelected?.id === updatedProject.id) {
        return { ...prevSelected, ...updatedProject };
      }
      return prevSelected;
    });
  }, []);

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

  if (!isAuthenticated) {
    return <LoginModal onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
            <Header
        currentView={currentView}
        onViewChange={handleViewChange}
        onNewProject={handleNewProject}
        onOpenApiConfig={handleOpenApiConfig}
        onLogout={handleLogout}
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