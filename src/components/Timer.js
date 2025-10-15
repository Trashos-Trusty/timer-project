import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, Square, Timer, Edit, Clock, BookOpen, Trash2 } from 'lucide-react';
import connectionManager from '../connectionManager';

const LARGE_SCREEN_BREAKPOINT = 768;

const TimerComponent = forwardRef(({ selectedProject, onProjectUpdate, disabled = false, onTimerStateChange }, ref) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showTimeEdit, setShowTimeEdit] = useState(false);
  const [newTime, setNewTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
  
  // Nouveaux états pour les sujets de travail
  const [currentSubject, setCurrentSubject] = useState('');
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subjectModalType, setSubjectModalType] = useState('start'); // 'start', 'stop', 'change'
  const [subjectInput, setSubjectInput] = useState('');
  const [subjectHistory, setSubjectHistory] = useState([]);
  const [pendingConfirmationSubject, setPendingConfirmationSubject] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [workSessions, setWorkSessions] = useState([]); // Historique des sessions
  const [currentSessionStart, setCurrentSessionStart] = useState(null);
  const [accumulatedSessionTime, setAccumulatedSessionTime] = useState(0); // Temps accumulé avant pause(s)
  const [baseProjectTime, setBaseProjectTime] = useState(0); // Temps total déjà sauvegardé pour le projet
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showTodaySummary, setShowTodaySummary] = useState(true);
  const [showAllTodaySessions, setShowAllTodaySessions] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(25); // Pourcentage de largeur pour le panneau de gauche
  const [isDragging, setIsDragging] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.innerWidth >= LARGE_SCREEN_BREAKPOINT;
  });
  const [lastAutoSave, setLastAutoSave] = useState(null);
  
  const intervalRef = useRef(null);
  const activeSessionSubjectRef = useRef('');

  // Fonction pour nettoyer complètement l'état du timer
  const cleanupTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    setCurrentSessionStart(null);
  }, []);

  const persistProject = useCallback(async (projectData) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.saveProject(projectData);
      }
    } finally {
      if (onProjectUpdate) {
        onProjectUpdate(projectData);
      }
    }
  }, [onProjectUpdate]);

  const startTimer = useCallback(async () => {
    try {
      setIsRunning(true);

      const totalTime = baseProjectTime + accumulatedSessionTime;

      const updatedProject = {
        ...selectedProject,
        status: 'running',
        currentTime: totalTime,
        currentSubject: currentSubject,
        sessionStartTime: sessionStartTime,
        subjectHistory: subjectHistory,
        workSessions: workSessions,
        accumulatedSessionTime: accumulatedSessionTime,
        lastSaved: Date.now()
      };
      
      await persistProject(updatedProject);
    } catch (error) {
      console.error('Erreur lors du démarrage:', error);
    }
  }, [selectedProject, baseProjectTime, currentSubject, sessionStartTime, subjectHistory, workSessions, accumulatedSessionTime, persistProject]);

  const loadProject = useCallback(async () => {
    if (!selectedProject) {
      console.log('❌ Aucun projet sélectionné');
      // Nettoyer l'état quand aucun projet n'est sélectionné
      setCurrentTime(0);
      setIsRunning(false);
      setCurrentSubject('');
      activeSessionSubjectRef.current = '';
      setSubjectHistory([]);
      setSessionStartTime(null);
      setWorkSessions([]);
      setCurrentSessionStart(null);
      setAccumulatedSessionTime(0);
      setBaseProjectTime(0);
      return;
    }

    try {
      console.log('📂 Chargement du projet:', selectedProject.id, 'avec currentTime:', selectedProject.currentTime);
      
      // Arrêter le timer actuel avant de charger un nouveau projet
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Initialiser les états avec les données du projet
      const projectCurrentTime = selectedProject.currentTime || 0;
      const projectAccumulatedTime = selectedProject.accumulatedSessionTime || 0;
      const baseTime = Math.max(0, projectCurrentTime - projectAccumulatedTime);

      setBaseProjectTime(baseTime);
      setCurrentTime(projectCurrentTime);
      const initialSubject = selectedProject.currentSubject || '';
      setCurrentSubject(initialSubject);
      activeSessionSubjectRef.current = initialSubject;
      setSubjectHistory(selectedProject.subjectHistory || []);
      setSessionStartTime(selectedProject.sessionStartTime || null);
      setAccumulatedSessionTime(projectAccumulatedTime);

      // S'assurer que toutes les sessions ont une propriété date correcte
      const sessionsWithDate = (selectedProject.workSessions || []).map(session => {
        // Si la session n'a pas de propriété date, la calculer depuis startTime
        if (!session.date || typeof session.date !== 'string') {
          let sessionDate;
          if (session.startTime) {
            // Utiliser startTime pour calculer la date, mais attention au timezone
            const startDate = new Date(session.startTime);
            // S'assurer que c'est une date valide
            if (!isNaN(startDate.getTime())) {
              sessionDate = startDate.toISOString().split('T')[0];
            } else {
              // Si startTime est invalide, utiliser la date actuelle en dernier recours
              sessionDate = new Date().toISOString().split('T')[0];
            }
          } else {
            // Pas de startTime, utiliser la date actuelle
            sessionDate = new Date().toISOString().split('T')[0];
          }
          console.log(`🔧 Session "${session.subject}": date manquante, calculée depuis startTime "${session.startTime}" -> "${sessionDate}"`);
          return { ...session, date: sessionDate };
        }
        return session;
      });
      
      setWorkSessions(sessionsWithDate);
      
      // Reprendre le timer SEULEMENT si le statut est 'running'
      if (selectedProject.status === 'running') {
        console.log('▶️ Reprise du timer avec temps:', projectCurrentTime, 'temps accumulé:', projectAccumulatedTime);
        setIsRunning(true);
        // Important : Redémarrer une nouvelle session pour le temps réel
        setCurrentSessionStart(Date.now());
        setCurrentTime(projectCurrentTime);
      } else {
        console.log('⏸️ Projet en pause/arrêté, temps:', projectCurrentTime, 'temps accumulé:', projectAccumulatedTime);
        setIsRunning(false);
        setCurrentSessionStart(null);
        setCurrentTime(projectCurrentTime);
      }
      
    } catch (error) {
      console.error('❌ Erreur lors du chargement du projet:', error);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Notifier le parent de l'état du timer
  useEffect(() => {
    if (onTimerStateChange) {
      onTimerStateChange(isRunning);
    }
  }, [isRunning, onTimerStateChange]);

  // Nettoyer le timer quand le composant se démonte ou change de projet
  useEffect(() => {
    return () => {
      cleanupTimer();
    };
  }, [cleanupTimer]);

  // Nettoyer le timer quand on change de projet
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [selectedProject?.id]);

  const updateProjectTime = useCallback(async (totalTime, sessionTime = 0) => {
    if (!selectedProject) return;

    try {
      const updatedProject = {
        ...selectedProject,
        currentTime: totalTime,
        currentSubject: currentSubject,
        subjectHistory: subjectHistory,
        sessionStartTime: sessionStartTime,
        accumulatedSessionTime: sessionTime,
        updatedAt: new Date().toISOString()
      };

      await persistProject(updatedProject);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du projet:', error);
      // Notifier le gestionnaire de connexion en cas d'erreur
      if (error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
        connectionManager.handleConnectionError();
      }
    }
  }, [selectedProject, currentSubject, subjectHistory, sessionStartTime, persistProject]);

  useEffect(() => {
    if (isRunning && selectedProject && currentSessionStart) {
      console.log('⏱️ Démarrage de l\'interval timer pour projet:', selectedProject.name);
      intervalRef.current = setInterval(() => {
        // Calculer le temps réel écoulé depuis le début de la session courante
        const now = Date.now();
        const sessionElapsed = Math.floor((now - currentSessionStart) / 1000);
        const totalSessionTime = accumulatedSessionTime + sessionElapsed;
        const totalTime = baseProjectTime + totalSessionTime;

        setCurrentTime(totalTime);

        // Sauvegarder périodiquement (toutes les 10 secondes)
        if (totalTime % 10 === 0) {
          updateProjectTime(totalTime, totalSessionTime);
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        console.log('⏹️ Arrêt de l\'interval timer');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        console.log('🧹 Cleanup interval timer');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, selectedProject, currentSessionStart, accumulatedSessionTime, baseProjectTime, updateProjectTime]);

  const handleStart = async () => {
    if (!selectedProject || isRunning) return;
    
    // Si pas de sujet défini, demander
    if (!currentSubject || currentSubject.trim() === '') {
      setSubjectModalType('start');
      setSubjectInput('');
      setPendingConfirmationSubject('');
      setShowSubjectModal(true);
      return;
    }

    console.log('▶️ Démarrage/reprise du timer pour:', currentSubject, 'temps accumulé:', accumulatedSessionTime);
    
    // Nettoyer tout timer existant avant de démarrer
    cleanupTimer();
    
    // Enregistrer le début de la nouvelle session (reprise ou démarrage)
    const now = Date.now();
    setCurrentSessionStart(now);
    
    // Définir sessionStartTime seulement si c'est un tout premier démarrage
    if (!sessionStartTime) {
      setSessionStartTime(now);
      console.log('🚀 Première session du projet');
    } else {
      console.log('▶️ Reprise après pause, temps déjà accumulé:', accumulatedSessionTime);
    }
    
    await startTimer();
  };

  const handlePause = async () => {
    if (!selectedProject || !isRunning) return;
    
    try {
      let newAccumulatedTime = accumulatedSessionTime;
      
      // Accumuler le temps de la session en cours
      if (currentSessionStart) {
        const sessionEnd = Date.now();
        const sessionDuration = Math.floor((sessionEnd - currentSessionStart) / 1000);
        newAccumulatedTime = accumulatedSessionTime + sessionDuration;

        console.log(`⏸️ Temps session courante: ${sessionDuration}s, temps total accumulé: ${newAccumulatedTime}s`);
        setAccumulatedSessionTime(newAccumulatedTime);
        setCurrentTime(baseProjectTime + newAccumulatedTime);
      }

      // Arrêter le timer
      setIsRunning(false);
      setCurrentSessionStart(null); // Réinitialiser le start de session pour la reprise

      const totalTime = baseProjectTime + newAccumulatedTime;
      const updatedProject = {
        ...selectedProject,
        currentTime: totalTime,
        status: 'paused',
        currentSubject: currentSubject,
        subjectHistory: subjectHistory,
        sessionStartTime: sessionStartTime,
        workSessions: workSessions,
        accumulatedSessionTime: newAccumulatedTime,
        lastSaved: Date.now()
      };

      await persistProject(updatedProject);
      
    } catch (error) {
      console.error('Erreur lors de la pause:', error);
    }
  };

  const handleStop = async () => {
    if (!selectedProject || !isRunning) return;
    
    // Utiliser la fonction de sauvegarde commune
    await saveCurrentSession(false);
  };

  // Fonction d'urgence pour réinitialiser complètement le timer
  const resetTimer = () => {
    console.log('🔄 Réinitialisation forcée du timer');
    cleanupTimer();
    setCurrentTime(selectedProject?.currentTime || 0);
    setCurrentSubject('');
    activeSessionSubjectRef.current = '';
    setCurrentSessionStart(null);
    setSessionStartTime(null);
    setAccumulatedSessionTime(0);
  };

  const handleTimeEdit = () => {
    const hours = Math.floor(currentTime / 3600);
    const minutes = Math.floor((currentTime % 3600) / 60);
    const seconds = currentTime % 60;
    
    setNewTime({ hours, minutes, seconds });
    setShowTimeEdit(true);
  };

  const handleTimeSave = async () => {
    const totalSeconds = (newTime.hours * 3600) + (newTime.minutes * 60) + newTime.seconds;
    setCurrentTime(totalSeconds);
    setBaseProjectTime(totalSeconds);
    setAccumulatedSessionTime(0);
    await updateProjectTime(totalSeconds, 0);
    setShowTimeEdit(false);
  };

  const formatDuration = useCallback((seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }, []);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    if (!selectedProject || !selectedProject.totalTime) return 0;
    // Inverser la progression pour montrer le temps qui diminue
    const remainingPercentage = (getRemainingTime() / selectedProject.totalTime) * 100;
    return Math.max(remainingPercentage, 0);
  };

  const getRemainingTime = () => {
    if (!selectedProject || !selectedProject.totalTime) return 0;
    return Math.max(selectedProject.totalTime - currentTime, 0);
  };

  const confirmationSubject = (subjectInput && subjectInput.trim()) || pendingConfirmationSubject || currentSubject || activeSessionSubjectRef.current || 'Travail général';

  const handleSubjectSubmit = async () => {
    const newSubject = subjectInput.trim();
    if (!newSubject) return;

    if (subjectModalType === 'start') {
      // Modal de démarrage
      setCurrentSubject(newSubject);
      activeSessionSubjectRef.current = newSubject;
      setCurrentSessionStart(Date.now());
      setSessionStartTime(Date.now());
      
      // Ajouter à l'historique si nouveau
      if (!subjectHistory.includes(newSubject)) {
        setSubjectHistory(prev => [newSubject, ...prev.slice(0, 4)]);
      }
      
      setShowSubjectModal(false);
      setSubjectInput('');
      setPendingConfirmationSubject('');
      await startTimer();
      
    } else if (subjectModalType === 'stop') {
      // Modal de confirmation/modification
      if (newSubject !== currentSubject) {
        // Le sujet a été modifié, mettre à jour la dernière session
        setWorkSessions(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1].subject = newSubject;
          }
          return updated;
        });

        setCurrentSubject(newSubject);
        activeSessionSubjectRef.current = newSubject;

        // Ajouter à l'historique si nouveau
        if (!subjectHistory.includes(newSubject)) {
          setSubjectHistory(prev => [newSubject, ...prev.slice(0, 4)]);
        }
      }
      
      console.log('✅ Tâche validée, temps conservé:', currentTime);

      // Réinitialiser seulement les états de session, PAS le temps total
      setCurrentSubject('');
      activeSessionSubjectRef.current = '';
      setCurrentSessionStart(null);
      setSessionStartTime(null);
      
      setShowSubjectModal(false);
      setSubjectInput('');
      setPendingConfirmationSubject('');
      
    } else if (subjectModalType === 'change') {
      // Changement de sujet en cours de session
      const now = Date.now();
      const sessionDuration = currentSessionStart ? Math.floor((now - currentSessionStart) / 1000) : 0;

      // Créer une session pour l'ancien sujet
      if (currentSubject && sessionDuration > 0) {
        const oldSession = {
          id: `session-${Date.now()}-old`,
          subject: currentSubject,
          startTime: new Date(currentSessionStart || sessionStartTime).toISOString(),
          endTime: new Date(now).toISOString(),
          duration: sessionDuration,
          date: new Date().toISOString().split('T')[0]
        };
        setWorkSessions(prev => [...prev, oldSession]);
      }

      // Démarrer la nouvelle session
      setCurrentSubject(newSubject);
      activeSessionSubjectRef.current = newSubject;
      setCurrentSessionStart(now);

      // Ajouter à l'historique si nouveau
      if (!subjectHistory.includes(newSubject)) {
        setSubjectHistory(prev => [newSubject, ...prev.slice(0, 4)]);
      }

      setShowSubjectModal(false);
      setSubjectInput('');
      setPendingConfirmationSubject('');
    }
  };

  // Fonction supprimée car non utilisée
  // const handleChangeSubject = () => {
  //   setSubjectModalType('change');
  //   setSubjectInput(currentSubject);
  //   setShowSubjectModal(true);
  // };

  // Fonction pour supprimer une session de travail
  const handleDeleteSession = useCallback(async (sessionToDelete) => {
    if (!selectedProject || !sessionToDelete) return;
    
    try {
      // Demander confirmation
      if (window.electronAPI && window.electronAPI.showMessageBox) {
        const result = await window.electronAPI.showMessageBox({
          type: 'question',
          title: 'Supprimer la session',
          message: `Êtes-vous sûr de vouloir supprimer cette session ?\n\nSujet: ${sessionToDelete.subject}\nDurée: ${formatDuration(sessionToDelete.duration)}\n\nLe temps sera retiré du total du projet.`,
          buttons: ['Annuler', 'Supprimer'],
          defaultId: 0,
          cancelId: 0
        });

        if (result.response !== 1) {
          return; // Annulation
        }
      } else {
        // Fallback pour navigateur
        const confirmDelete = window.confirm(
          `Êtes-vous sûr de vouloir supprimer cette session ?\n\nSujet: ${sessionToDelete.subject}\nDurée: ${formatDuration(sessionToDelete.duration)}\n\nLe temps sera retiré du total du projet.`
        );
        if (!confirmDelete) return;
      }

      console.log(`🗑️ Suppression de la session: ${sessionToDelete.subject} (${sessionToDelete.duration}s)`);

      // Retirer la session de la liste
      const updatedWorkSessions = workSessions.filter(session => session.id !== sessionToDelete.id);
      
      // Calculer le nouveau temps total en soustrayant la durée de la session supprimée
      const newCurrentTime = Math.max(0, currentTime - sessionToDelete.duration);
      
      // Mettre à jour le projet
      const updatedProject = {
        ...selectedProject,
        currentTime: newCurrentTime,
        workSessions: updatedWorkSessions,
        lastSaved: Date.now()
      };

      // Sauvegarder le projet
      await persistProject(updatedProject);
      console.log(`✅ Session supprimée et temps mis à jour: ${newCurrentTime}s`);

      // Mettre à jour l'état local
      setWorkSessions(updatedWorkSessions);
      setBaseProjectTime(newCurrentTime);
      setCurrentTime(newCurrentTime);
      setAccumulatedSessionTime(0);
      setSessionStartTime(null);

    } catch (error) {
      console.error('❌ Erreur lors de la suppression de la session:', error);
    }
  }, [selectedProject, workSessions, currentTime, formatDuration, persistProject]);

  // Calculer la taille du timer en fonction de la largeur du panneau
  const getTimerSize = () => {
    // Sur petit écran, timer beaucoup plus compact
    if (!isLargeScreen) return { size: 80, fontSize: 'text-sm', strokeWidth: 3 };
    
    // Taille adaptive : de 128px (15%) à 200px (50%)
    const minSize = 128;
    const maxSize = 200;
    const minWidth = 15;
    const maxWidth = 50;
    
    const ratio = (leftPanelWidth - minWidth) / (maxWidth - minWidth);
    const size = Math.round(minSize + (maxSize - minSize) * ratio);
    
    // Adapter la taille de police aussi
    let fontSize = 'text-lg';
    let strokeWidth = 4;
    
    if (size >= 180) {
      fontSize = 'text-2xl';
      strokeWidth = 6;
    } else if (size >= 160) {
      fontSize = 'text-xl';
      strokeWidth = 5;
    }
    
    return { size, fontSize, strokeWidth };
  };

  // Gestion du redimensionnement des panneaux avec throttling
  const containerRef = useRef(null);
  const rafRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e) => {
    if (!containerRef.current) return;
    
    setIsDragging(true);
    e.preventDefault();
    
    // containerRect était assigné mais non utilisé, suppression de cette variable
    startXRef.current = e.clientX;
    startWidthRef.current = leftPanelWidth;
    
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftPanelWidth]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return;
    
    // Utiliser requestAnimationFrame pour lisser les animations
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    rafRef.current = requestAnimationFrame(() => {
      const containerRect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - startXRef.current;
      const deltaPercent = (deltaX / containerRect.width) * 100;
      const newWidth = Math.max(15, Math.min(50, startWidthRef.current + deltaPercent));
      
      setLeftPanelWidth(newWidth);
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: true });
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Gestion responsive
  useEffect(() => {
    const updateLayoutMode = () => {
      const measuredWidth = containerRef.current?.getBoundingClientRect().width;
      const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : LARGE_SCREEN_BREAKPOINT;
      const newIsLargeScreen = (measuredWidth ?? fallbackWidth) >= LARGE_SCREEN_BREAKPOINT;

      setIsLargeScreen(prev => {
        if (prev === newIsLargeScreen) {
          return prev;
        }
        return newIsLargeScreen;
      });

      if (newIsLargeScreen) {
        setShowTodaySummary(true);
      }
    };

    updateLayoutMode();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateLayoutMode);
    }

    let resizeObserver;
    const element = containerRef.current;
    if (typeof ResizeObserver !== 'undefined' && element) {
      resizeObserver = new ResizeObserver(updateLayoutMode);
      resizeObserver.observe(element);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', updateLayoutMode);
      }
      if (resizeObserver && element) {
        resizeObserver.unobserve(element);
        resizeObserver.disconnect();
      }
    };
  }, [selectedProject]);

  // Cleanup des refs au démontage
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Fonction pour sauvegarder automatiquement la session en cours
  const saveCurrentSession = useCallback(async (isAutoSave = false) => {
    if (!selectedProject) {
      console.log('❌ Pas de projet sélectionné pour la sauvegarde');
      return;
    }

    // Lors d'une sauvegarde automatique (fermeture/logout), sauvegarder même si le timer n'est pas en cours
    if (!isAutoSave && (!isRunning || !currentSessionStart)) {
      console.log('❌ Timer non actif ou pas de session en cours pour la sauvegarde manuelle');
      return;
    }

    console.log(isAutoSave ? '💾 Sauvegarde automatique à la fermeture/logout' : '⏹️ Arrêt manuel du timer');
    
    try {
      // Initialiser les sessions mises à jour
      let updatedWorkSessions = [...workSessions];
      let sessionCreated = false;
      let totalSessionDuration = 0;
      let finalTotalTime = baseProjectTime;
      const effectiveSubject = (currentSubject && currentSubject.trim()) || activeSessionSubjectRef.current || '';
      let sessionSubjectForModal = effectiveSubject || 'Travail général';

      // Pour un arrêt manuel, créer une session avec le temps total accumulé
      if (!isAutoSave && isRunning && currentSessionStart) {
        const sessionEnd = Date.now();
        const currentSessionDuration = Math.floor((sessionEnd - currentSessionStart) / 1000);

        // Calculer la durée totale : temps accumulé + session actuelle
        totalSessionDuration = accumulatedSessionTime + currentSessionDuration;
        finalTotalTime = baseProjectTime + totalSessionDuration;

        // Créer une session avec le temps total
        const sessionSubject = effectiveSubject || 'Travail général';
        const newSession = {
          id: `session-${Date.now()}`,
          subject: sessionSubject,
          startTime: new Date(sessionStartTime || currentSessionStart).toISOString(),
          endTime: new Date(sessionEnd).toISOString(),
          duration: totalSessionDuration,
          date: new Date().toISOString().split('T')[0]
        };

        updatedWorkSessions = [...workSessions, newSession];
        sessionCreated = true;
        sessionSubjectForModal = sessionSubject;
        activeSessionSubjectRef.current = sessionSubject;

        // Réinitialiser le temps accumulé
        setAccumulatedSessionTime(0);

        console.log(`⏹️ Session créée (arrêt manuel): ${totalSessionDuration}s pour "${newSession.subject}" (${accumulatedSessionTime}s accumulé + ${currentSessionDuration}s actuel)`);
      }
      // Pour une sauvegarde automatique (logout/fermeture), créer une session avec le temps total si nécessaire
      else if (isAutoSave && (currentSessionStart || accumulatedSessionTime > 0)) {
        const sessionEnd = Date.now();
        const currentSessionDuration = currentSessionStart ? Math.floor((sessionEnd - currentSessionStart) / 1000) : 0;
        totalSessionDuration = accumulatedSessionTime + currentSessionDuration;
        finalTotalTime = baseProjectTime + totalSessionDuration;

        if (totalSessionDuration > 10) {
          const sessionSubject = effectiveSubject || 'Travail général';
          const newSession = {
            id: `session-${Date.now()}`,
            subject: sessionSubject,
            startTime: new Date(sessionStartTime || currentSessionStart).toISOString(),
            endTime: new Date(sessionEnd).toISOString(),
            duration: totalSessionDuration,
            date: new Date().toISOString().split('T')[0]
          };

          updatedWorkSessions = [...workSessions, newSession];
          sessionCreated = true;
          sessionSubjectForModal = sessionSubject;
          activeSessionSubjectRef.current = sessionSubject;

          // Réinitialiser le temps accumulé
          setAccumulatedSessionTime(0);

          console.log(`💾 Session créée (auto): ${totalSessionDuration}s pour "${newSession.subject}" (${accumulatedSessionTime}s accumulé + ${currentSessionDuration}s actuel)`);
        } else {
          console.log(`⏭️ Session auto trop courte (${totalSessionDuration}s), ignorée`);
        }
      } else if (isAutoSave && currentTime > 0) {
        finalTotalTime = Math.max(currentTime, baseProjectTime);
        console.log(`💾 Sauvegarde du temps accumulé (${currentTime}s) sans session active`);
      }

      // Préparer les données du projet mis à jour
      const updatedProject = {
        ...selectedProject,
        currentTime: finalTotalTime,
        status: 'stopped',
        currentSubject: currentSubject,
        subjectHistory: subjectHistory,
        sessionStartTime: null,
        workSessions: updatedWorkSessions,
        accumulatedSessionTime: 0,
        lastSaved: Date.now()
      };

      // Sauvegarder le projet
      await persistProject(updatedProject);
      console.log('✅ Session sauvegardée avec succès');
      
      // Mettre à jour l'état local seulement si ce n'est pas une sauvegarde automatique
      if (!isAutoSave) {
        setWorkSessions(updatedWorkSessions);
        cleanupTimer();
        setCurrentSessionStart(null);
        setAccumulatedSessionTime(0);
        setBaseProjectTime(finalTotalTime);
        setCurrentTime(finalTotalTime);
        setSessionStartTime(null);

        // Afficher la modal de confirmation seulement si une session a été créée
        if (sessionCreated) {
          setSubjectModalType('stop');
          setPendingConfirmationSubject(sessionSubjectForModal);
          setSubjectInput(sessionSubjectForModal);
          setShowSubjectModal(true);
        }
      }
      
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
    }
  }, [selectedProject, isRunning, currentSessionStart, currentTime, currentSubject, sessionStartTime, subjectHistory, workSessions, cleanupTimer, accumulatedSessionTime, baseProjectTime, persistProject]);

  // Exposer la fonction saveCurrentSession au composant parent
  useImperativeHandle(ref, () => ({
    saveCurrentSession
  }), [saveCurrentSession]);

  // Sauvegarde automatique périodique + gestion fermeture
  useEffect(() => {
    let autoSaveInterval;
    
    // Sauvegarde automatique toutes les 30 secondes si le timer est actif
    if (selectedProject && isRunning && currentSessionStart) {
      autoSaveInterval = setInterval(async () => {
        try {
          console.log('💾 Sauvegarde automatique périodique...');

          const totalSessionTime = Math.max(0, currentTime - baseProjectTime);

          // Sauvegarder l'état actuel sans arrêter le timer
          const updatedProject = {
            ...selectedProject,
            currentTime: currentTime,
            status: 'running', // Garder le statut running
            currentSubject: currentSubject,
            subjectHistory: subjectHistory,
            sessionStartTime: sessionStartTime,
            workSessions: workSessions,
            accumulatedSessionTime: totalSessionTime,
            lastSaved: Date.now()
          };
          
          await persistProject(updatedProject);
          setLastAutoSave(new Date());
          console.log('✅ Sauvegarde auto périodique réussie');
        } catch (error) {
          console.error('❌ Erreur sauvegarde auto périodique:', error);
        }
      }, 30000); // 30 secondes
    }

    // Gestionnaire de fermeture pour Electron
    const handleAppClose = async () => {
      if (selectedProject && isRunning && currentSessionStart) {
        console.log('🚨 Fermeture de l\'application détectée');
        await saveCurrentSession(true);
      }
    };

    // Gestionnaire pour fermeture navigateur standard
    const handleWindowClose = () => {
      if (selectedProject && isRunning && currentSessionStart) {
        console.log('🚨 Fermeture fenêtre détectée');
        // Utiliser navigator.sendBeacon pour une sauvegarde fiable
        const sessionEnd = Date.now();
        const currentSegmentDuration = Math.floor((sessionEnd - currentSessionStart) / 1000);
        const totalSessionTime = accumulatedSessionTime + currentSegmentDuration;
        const finalTotalTime = baseProjectTime + totalSessionTime;

        const projectData = {
          ...selectedProject,
          currentTime: finalTotalTime,
          status: 'stopped',
          currentSubject: currentSubject,
          sessionStartTime: null,
          workSessions: [...workSessions, {
            id: `session-${Date.now()}`,
            subject: currentSubject,
            startTime: new Date(currentSessionStart || sessionStartTime).toISOString(),
            endTime: new Date(sessionEnd).toISOString(),
            duration: totalSessionTime,
            date: new Date().toISOString().split('T')[0]
          }],
          accumulatedSessionTime: 0,
          lastSaved: Date.now()
        };
        
        // Tentative de sauvegarde rapide
        persistProject(projectData).catch((error) => {
          console.error('❌ Erreur sauvegarde fermeture:', error);
        });
      }
    };

    // Ajouter les listeners
    if (window.electronAPI && window.electronAPI.onAppClose) {
      window.electronAPI.onAppClose(handleAppClose);
    }
    
    window.addEventListener('unload', handleWindowClose);
    window.addEventListener('pagehide', handleWindowClose);
    
    // Cleanup
    return () => {
      if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
      }
      window.removeEventListener('unload', handleWindowClose);
      window.removeEventListener('pagehide', handleWindowClose);
    };
  }, [selectedProject, isRunning, currentSessionStart, currentTime, currentSubject, sessionStartTime, subjectHistory, workSessions, saveCurrentSession, baseProjectTime, accumulatedSessionTime, persistProject]);

  if (!selectedProject) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Timer className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Aucun projet sélectionné</h3>
          <p className="text-gray-600">Sélectionnez un projet dans la liste pour commencer</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 h-full overflow-hidden">
      {/* Header du projet plus compact */}
      <div className="mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 mb-1">{selectedProject.name}</h1>
            {selectedProject.description && (
              <p className="text-gray-600 text-sm mb-1">{selectedProject.description}</p>
            )}
            {selectedProject.client && (
              <p className="text-xs text-gray-500">Client: {selectedProject.client}</p>
            )}
          </div>
          
          {/* Sujet actuel à droite */}
          {currentSubject && (
            <div className="flex items-center ml-4">
              <div className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                📋 {currentSubject}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Layout principal avec diviseur redimensionnable */}
      <div 
        ref={containerRef}
        className={`flex-1 ${isLargeScreen ? 'flex gap-0' : 'flex flex-col gap-4'} min-h-0 resizable-container`}
      >
        
        {/* Panneau Timer - largeur variable */}
        <div 
          className={`flex flex-col ${!isLargeScreen ? 'mb-4' : ''} ${isDragging ? '' : 'transition-all duration-200'}`}
          style={{ 
            width: isLargeScreen ? `${leftPanelWidth}%` : '100%',
            minWidth: isLargeScreen ? '200px' : 'auto',
            willChange: isDragging ? 'width' : 'auto'
          }}
        >
          <div 
            className="bg-white rounded-lg border border-gray-200 h-fit transition-all duration-200"
            style={{ 
              padding: isLargeScreen && getTimerSize().size > 160 ? '20px' : isLargeScreen ? '16px' : '12px'
            }}
          >
            {/* Layout différent selon la taille d'écran */}
            {isLargeScreen ? (
              // Layout vertical pour grand écran
              <>
                {/* Timer adaptatif */}
                <div 
                  className="relative mx-auto mb-3 transition-all duration-200"
                  style={{ 
                    width: `${getTimerSize().size}px`, 
                    height: `${getTimerSize().size}px` 
                  }}
                >
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth={getTimerSize().strokeWidth}
                      fill="none"
                      className="text-gray-200"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth={getTimerSize().strokeWidth}
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - getProgressPercentage() / 100)}`}
                      className={`transition-all duration-300 ${
                        isRunning ? 'text-warning-500' : 'text-primary-500'
                      }`}
                      strokeLinecap="round"
                    />
                  </svg>
                  
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={`${getTimerSize().fontSize} font-mono font-bold transition-all duration-200 ${isRunning ? 'text-warning-600 timer-active' : 'text-gray-900'}`}>
                        {formatTime(getRemainingTime())}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              // Layout horizontal compact pour petit écran
              <div className="flex items-center gap-4 mb-3">
                {/* Timer compact */}
                <div 
                  className="relative flex-shrink-0 transition-all duration-200"
                  style={{ 
                    width: `${getTimerSize().size}px`, 
                    height: `${getTimerSize().size}px` 
                  }}
                >
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth={getTimerSize().strokeWidth}
                      fill="none"
                      className="text-gray-200"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth={getTimerSize().strokeWidth}
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - getProgressPercentage() / 100)}`}
                      className={`transition-all duration-300 ${
                        isRunning ? 'text-warning-500' : 'text-primary-500'
                      }`}
                      strokeLinecap="round"
                    />
                  </svg>
                  
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={`${getTimerSize().fontSize} font-mono font-bold transition-all duration-200 ${isRunning ? 'text-warning-600 timer-active' : 'text-gray-900'}`}>
                        {formatTime(getRemainingTime())}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Infos compactes à droite du timer */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 mb-1">
                    Travaillé: <span className="font-medium">{formatTime(currentTime)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-1">
                    Restant: <span className="font-medium text-warning-600">{formatTime(getRemainingTime())}</span>
                  </div>
                  {isRunning && lastAutoSave && (
                    <div className="text-xs text-green-600 flex items-center gap-1">
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                      <span>Sauvé {lastAutoSave.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stats compactes - seulement sur grand écran car déjà affiché sur petit écran */}
            {isLargeScreen && (
              <>
                <div className="text-center mb-3">
                  <div className="text-xs text-gray-500 mb-1">
                    Travaillé: {formatTime(currentTime)}
                  </div>
                  
                  {/* Indicateur de sauvegarde automatique */}
                  {isRunning && lastAutoSave && (
                    <div className="text-xs text-green-600 mb-1 flex items-center justify-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                      <span>Sauvé {lastAutoSave.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  
                  <button
                    onClick={handleTimeEdit}
                    className="text-xs text-gray-500 hover:text-primary-600 flex items-center justify-center space-x-1 mx-auto"
                  >
                    <Edit className="w-3 h-3" />
                    <span>Modifier</span>
                  </button>
                </div>

                {/* Infos projet */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                  <div className="text-center bg-gray-50 rounded p-2">
                    <div className="font-bold text-gray-900">{formatTime(selectedProject.totalTime || 0)}</div>
                    <div className="text-gray-500">Total</div>
                  </div>
                  <div className="text-center bg-warning-50 rounded p-2">
                    <div className="font-bold text-warning-600">{formatTime(getRemainingTime())}</div>
                    <div className="text-gray-500">Restant</div>
                  </div>
                </div>
              </>
            )}

            {/* Bouton modifier pour petit écran */}
            {!isLargeScreen && (
              <div className="text-center mb-3">
                <button
                  onClick={handleTimeEdit}
                  className="text-xs text-gray-500 hover:text-primary-600 flex items-center justify-center space-x-1 mx-auto"
                >
                  <Edit className="w-3 h-3" />
                  <span>Modifier temps</span>
                </button>
              </div>
            )}

            {/* Contrôles - layout différent selon la taille d'écran */}
            {isLargeScreen ? (
              // Layout vertical pour grand écran
              <div className="space-y-2">
                <button
                  onClick={handleStart}
                  disabled={disabled || !selectedProject || isRunning}
                  className={`w-full btn-primary flex items-center justify-center space-x-1 py-2 text-sm ${
                    disabled || !selectedProject || isRunning ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Play className="w-4 h-4" />
                  <span>Démarrer</span>
                </button>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handlePause}
                    disabled={disabled || !selectedProject || !isRunning}
                    className={`btn-secondary flex items-center justify-center space-x-1 py-1 text-xs ${
                      disabled || !selectedProject || !isRunning ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Pause className="w-3 h-3" />
                    <span>Pause</span>
                  </button>
                  
                  <button
                    onClick={handleStop}
                    disabled={disabled || !selectedProject || !isRunning}
                    className={`btn-danger flex items-center justify-center space-x-1 py-1 text-xs ${
                      disabled || !selectedProject || !isRunning ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={!isRunning ? 'Le chronomètre doit être démarré pour pouvoir l\'arrêter' : ''}
                  >
                    <Square className="w-3 h-3" />
                    <span>Arrêter</span>
                  </button>
                </div>
              </div>
            ) : (
              // Layout horizontal compact pour petit écran
              <div className="flex gap-2">
                <button
                  onClick={handleStart}
                  disabled={disabled || !selectedProject || isRunning}
                  className={`flex-1 btn-primary flex items-center justify-center space-x-1 py-2 text-xs ${
                    disabled || !selectedProject || isRunning ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Play className="w-3 h-3" />
                  <span>Démarrer</span>
                </button>
                
                <button
                  onClick={handlePause}
                  disabled={disabled || !selectedProject || !isRunning}
                  className={`flex-1 btn-secondary flex items-center justify-center space-x-1 py-2 text-xs ${
                    disabled || !selectedProject || !isRunning ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Pause className="w-3 h-3" />
                  <span>Pause</span>
                </button>
                
                <button
                  onClick={handleStop}
                  disabled={disabled || !selectedProject || !isRunning}
                  className={`flex-1 btn-danger flex items-center justify-center space-x-1 py-2 text-xs ${
                    disabled || !selectedProject || !isRunning ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title={!isRunning ? 'Le chronomètre doit être démarré pour pouvoir l\'arrêter' : ''}
                >
                  <Square className="w-3 h-3" />
                  <span>Stop</span>
                </button>
              </div>
            )}

            {/* Debug */}
            {(isRunning && !intervalRef.current) && (
              <div className="mt-2 text-center">
                <button
                  onClick={resetTimer}
                  className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded border border-yellow-300 hover:bg-yellow-200 transition-colors"
                  title="Réinitialise le timer en cas de problème"
                >
                  🔄 Reset
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Diviseur redimensionnable */}
        {isLargeScreen && (
          <div className="flex flex-col items-center justify-center px-2 group relative">
            <div 
              className={`h-full rounded-full cursor-col-resize select-none ${
                isDragging 
                  ? 'w-2 bg-blue-500' 
                  : 'w-1 bg-gray-300 hover:bg-blue-400 group-hover:w-1.5'
              } transition-colors`}
              onMouseDown={handleMouseDown}
              title="Glissez pour redimensionner les panneaux"
              style={{ 
                transition: isDragging ? 'none' : 'all 0.15s ease-out'
              }}
            />
            
            {/* Tooltip avec pourcentages */}
            <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-900 text-white rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg pointer-events-none transition-opacity ${
              isDragging || false ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}>
              {Math.round(leftPanelWidth)}% / {Math.round(100 - leftPanelWidth)}%
            </div>
          </div>
        )}

        {/* Panneau Sessions - largeur variable */}
        <div 
          className={`flex-1 min-h-0 overflow-hidden ${isDragging ? '' : 'transition-all duration-200'}`}
          style={{ 
            width: isLargeScreen ? `${100 - leftPanelWidth}%` : '100%',
            willChange: isDragging ? 'width' : 'auto'
          }}
        >
          {workSessions.length > 0 && (
            <div className={`bg-white rounded-lg border border-gray-200 p-4 flex flex-col min-h-0 ${
              isLargeScreen ? 'h-full' : 'max-h-96 overflow-y-auto'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Sessions de travail
                </h4>
                <div className="flex items-center gap-2">
                  {/* Bouton toggle "Aujourd'hui" seulement sur petit écran */}
                  {!isLargeScreen && (
                    <button
                      onClick={() => setShowTodaySummary(!showTodaySummary)}
                      className="text-xs px-2 py-1 rounded-md bg-blue-200 text-blue-800 hover:bg-blue-300 transition-colors font-medium"
                      title={showTodaySummary ? 'Masquer le résumé d\'aujourd\'hui' : 'Afficher le résumé d\'aujourd\'hui'}
                    >
                      📊 {showTodaySummary ? 'Masquer' : 'Afficher'}
                    </button>
                  )}
                  <span className="text-sm text-gray-500">
                    {workSessions.length} session{workSessions.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              
              {/* Résumé d'aujourd'hui - conditionnel */}
              {showTodaySummary && (() => {
                // Trier les sessions d'aujourd'hui par ordre chronologique inverse (plus récentes en premier)
                const todayDate = new Date().toISOString().split('T')[0];
                const todaySessionsData = workSessions
                  .filter(session => {
                    // Double vérification : utiliser startTime si date est manquante
                    const sessionDate = session.date || (session.startTime ? new Date(session.startTime).toISOString().split('T')[0] : null);
                    return sessionDate === todayDate;
                  })
                  .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
                
                const todaySessions = Object.entries(
                  todaySessionsData
                    .reduce((acc, session) => {
                      acc[session.subject] = (acc[session.subject] || 0) + session.duration;
                      return acc;
                    }, {})
                );
                
                const maxItemsToShow = isLargeScreen ? 6 : 4;
                const displayedSessions = showAllTodaySessions ? todaySessions : todaySessions.slice(0, maxItemsToShow);
                const hasMoreSessions = todaySessions.length > maxItemsToShow;
                
                return (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-medium text-blue-900 text-sm">📊 Aujourd'hui :</h5>
                      {hasMoreSessions && (
                        <button
                          onClick={() => setShowAllTodaySessions(!showAllTodaySessions)}
                          className="px-2 py-1 text-xs bg-blue-200 text-blue-800 hover:bg-blue-300 rounded-md transition-colors font-medium"
                        >
                          {showAllTodaySessions ? '👁️ Voir moins' : `👁️ Voir tout (${todaySessions.length})`}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                      {displayedSessions.map(([subject, totalTime]) => (
                        <div key={subject} className="flex flex-col items-center p-2 bg-white rounded text-xs">
                          <span className="text-blue-800 font-medium truncate w-full text-center mb-1" title={subject}>
                            {subject}
                          </span>
                          <span className="font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
                            {formatDuration(totalTime)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {!showAllTodaySessions && hasMoreSessions && (
                      <div className="text-center mt-2">
                        <p className="text-xs text-blue-600">
                          ... et {todaySessions.length - maxItemsToShow} autre{todaySessions.length - maxItemsToShow > 1 ? 's' : ''} sujet{todaySessions.length - maxItemsToShow > 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* Sessions détaillées */}
              <div className={`${isLargeScreen ? 'flex-1' : 'flex-shrink-0'} flex flex-col min-h-0`}>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-gray-700 text-sm">📝 Détail des sessions :</h5>
                  {workSessions.length > 8 && (
                    <button
                      onClick={() => setShowAllSessions(!showAllSessions)}
                      className="px-2 py-1 text-xs bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md transition-colors font-medium"
                    >
                      {showAllSessions ? '📋 Voir moins' : `📋 Toutes (${workSessions.length})`}
                    </button>
                  )}
                </div>
                
                <div className={`${isLargeScreen ? 'flex-1' : 'max-h-60'} overflow-y-auto pr-2 space-y-1`} style={{scrollbarWidth: 'thin'}}>
                  {(() => {
                    // Trier les sessions par ordre chronologique inverse (plus récentes en premier)
                    const sortedSessions = [...workSessions].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
                    const sessionsToShow = showAllSessions ? sortedSessions : sortedSessions.slice(0, 8);
                    return sessionsToShow;
                  })().map((session, index) => (
                    <div key={session.id} className="border border-gray-200 rounded p-2 hover:bg-gray-50 transition-colors group">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate" title={session.subject}>
                            {session.subject}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span className="font-medium text-blue-600">{formatDuration(session.duration)}</span>
                            </span>
                            <span className="text-gray-500">
                              {new Date(session.startTime).toLocaleTimeString('fr-FR', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })} - {new Date(session.endTime).toLocaleTimeString('fr-FR', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                            <span className="text-gray-400">
                              {new Date(session.startTime).toLocaleDateString('fr-FR', { 
                                day: 'numeric', 
                                month: 'short' 
                              })}
                            </span>
                          </div>
                        </div>
                        
                        {/* Bouton de suppression - visible au survol */}
                        <button
                          onClick={() => handleDeleteSession(session)}
                          className="ml-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title={`Supprimer cette session (${formatDuration(session.duration)})`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {!showAllSessions && workSessions.length > 8 && (
                  <div className="text-center py-2 border-t border-gray-100 mt-2">
                    <p className="text-xs text-gray-500">
                      ... et {workSessions.length - 8} autres sessions
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {workSessions.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucune session de travail pour ce projet</p>
              <p className="text-sm text-gray-400 mt-1">Démarrez le timer pour commencer à enregistrer</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de sujet */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center justify-center">
              📋
            </h3>
            
            {subjectModalType === 'start' && (
              <>
                <h3 className="text-lg font-semibold mb-4 text-center">
                  Sur quoi allez-vous travailler ?
                </h3>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  Décrivez brièvement la tâche que vous allez accomplir
                </p>
              </>
            )}
            
            {subjectModalType === 'stop' && (
              <>
                <h3 className="text-lg font-semibold mb-4 text-center">
                  Confirmez votre travail
                </h3>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  Vous avez travaillé sur :
                  {' '}
                  <strong>{`"${confirmationSubject}"`}</strong>
                  <br />
                  Confirmez ou modifiez si vous avez aussi travaillé sur autre chose
                </p>
              </>
            )}
            
            {subjectModalType === 'change' && (
              <>
                <h3 className="text-lg font-semibold mb-4 text-center">
                  Modifier le sujet
                </h3>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  Changez le sujet de travail actuel
                </p>
              </>
            )}
            
            {/* Input du sujet */}
            <div className="mb-4">
              <input
                type="text"
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSubjectSubmit()}
                className="input w-full"
                placeholder="Ex: Intégration responsive, Debug API..."
                autoFocus
              />
            </div>
            
            {/* Suggestions basées sur l'historique */}
            {subjectHistory.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Sujets récents :</p>
                <div className="flex flex-wrap gap-2">
                  {subjectHistory.slice(0, 5).map((subject, index) => (
                    <button
                      key={index}
                      onClick={() => setSubjectInput(subject)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowSubjectModal(false);
                  setPendingConfirmationSubject('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSubjectSubmit}
                disabled={!subjectInput.trim()}
                className={`btn-primary ${!subjectInput.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {subjectModalType === 'start' && '▶️ Commencer'}
                {subjectModalType === 'stop' && '✅ Confirmer'}
                {subjectModalType === 'change' && '💾 Modifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition du temps */}
      {showTimeEdit && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Modifier le temps
            </h3>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heures</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={newTime.hours}
                  onChange={(e) => setNewTime({ ...newTime, hours: parseInt(e.target.value) || 0 })}
                  className="input text-center"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={newTime.minutes}
                  onChange={(e) => setNewTime({ ...newTime, minutes: parseInt(e.target.value) || 0 })}
                  className="input text-center"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={newTime.seconds}
                  onChange={(e) => setNewTime({ ...newTime, seconds: parseInt(e.target.value) || 0 })}
                  className="input text-center"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowTimeEdit(false)}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={handleTimeSave}
                className="btn-primary"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Ajouter un nom d'affichage pour le débogage
TimerComponent.displayName = 'TimerComponent';

export default TimerComponent; 