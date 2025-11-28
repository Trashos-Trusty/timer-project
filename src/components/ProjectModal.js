import React, { useState, useEffect } from 'react';
import { X, Save, FolderPlus, Clock } from 'lucide-react';

const ProjectModal = ({ project, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    client: '',
    totalTime: 0,
    currentTime: 0,
    status: 'stopped'
  });
  const [timeInput, setTimeInput] = useState({ hours: 0, minutes: 0 });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (project) {
      // Modification d'un projet existant - s'assurer que toutes les propriétés ont des valeurs par défaut
      setFormData({
        id: project.id || '',
        name: project.name || '',
        description: project.description || '',
        client: project.client || project.clientName || '',
        totalTime: project.totalTime || 0,
        currentTime: project.currentTime || 0,
        status: project.status || 'stopped'
      });
      const hours = Math.floor((project.totalTime || 0) / 3600);
      const minutes = Math.floor(((project.totalTime || 0) % 3600) / 60);
      setTimeInput({ hours, minutes });
      setSubmitError(null);
    } else {
      // Nouveau projet - générer un nouvel ID unique
      setFormData({
        id: Date.now().toString(),
        name: '',
        description: '',
        client: '',
        totalTime: 0,
        currentTime: 0,
        status: 'stopped'
      });
      setTimeInput({ hours: 0, minutes: 0 });
      setSubmitError(null);
    }
  }, [project]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Le nom du projet est requis';
    }
    
    if (timeInput.hours === 0 && timeInput.minutes === 0) {
      newErrors.time = 'Veuillez définir un temps total pour le projet';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setSubmitError(null);
    
    try {
      const totalSeconds = (timeInput.hours * 3600) + (timeInput.minutes * 60);
      const projectData = {
        ...formData,
        totalTime: totalSeconds,
        // Conserver l'ID existant pour les modifications, générer un nouveau pour les créations
        id: project ? project.id : (formData.id || Date.now().toString()),
        createdAt: project ? project.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Debug: Afficher les données du projet avant sauvegarde
      console.log('💾 Données projet avant sauvegarde:', {
        mode: project ? 'MODIFICATION' : 'CREATION',
        originalId: project?.id,
        newId: projectData.id,
        originalName: project?.name,
        newName: projectData.name,
        projectData
      });
      
      await onSave(projectData);

      // Fermer la modal seulement si la sauvegarde a réussi
      console.log('✅ Sauvegarde réussie, fermeture de la modal');

      // Nettoyer les états avant fermeture
      setErrors({});

      // Fermer la modal
      onClose();

    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      // Afficher l'erreur à l'utilisateur mais ne pas fermer la modal
      const statusInfo = [
        error?.status ? `statut ${error.status}` : null,
        error?.statusText ? `${error.statusText}` : null
      ].filter(Boolean).join(' - ');

      const details = error?.details
        ? (typeof error.details === 'string' ? error.details : JSON.stringify(error.details, null, 2))
        : null;

      const message = [
        `Erreur lors de la sauvegarde: ${error.message}`,
        statusInfo ? `Informations de statut: ${statusInfo}` : null,
        details ? `Détails supplémentaires: ${details}` : null
      ].filter(Boolean).join(' · ');

      setSubmitError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Effacer l'erreur quand l'utilisateur tape
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleTimeChange = (field, value) => {
    const numValue = parseInt(value) || 0;
    setTimeInput(prev => ({
      ...prev,
      [field]: Math.max(0, numValue)
    }));
    
    if (errors.time) {
      setErrors(prev => ({
        ...prev,
        time: ''
      }));
    }
  };

  const formatTimeDisplay = () => {
    const totalSeconds = (timeInput.hours * 3600) + (timeInput.minutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}min`;
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-lg">
              <FolderPlus className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {project ? 'Modifier le projet' : 'Nouveau projet'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {submitError && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-800 text-sm flex space-x-3">
              <div className="flex-shrink-0">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-danger-100 text-danger-700 text-xs font-semibold">!
                </span>
              </div>
              <div className="space-y-1">
                <p className="font-semibold">Impossible d'enregistrer le projet</p>
                <p className="leading-relaxed">{submitError}</p>
              </div>
            </div>
          )}

          {/* Nom du projet */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nom du projet *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`input ${errors.name ? 'border-danger-300 focus:ring-danger-500' : ''}`}
              placeholder="Entrez le nom du projet"
              required
            />
            {errors.name && (
              <p className="mt-1 text-sm text-danger-600">{errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="input resize-none"
              placeholder="Description du projet (optionnel)"
            />
          </div>

          {/* Client */}
          <div>
            <label htmlFor="client" className="block text-sm font-medium text-gray-700 mb-2">
              Client
            </label>
            <input
              type="text"
              id="client"
              name="client"
              value={formData.client}
              onChange={handleChange}
              className="input"
              placeholder="Nom du client (optionnel)"
            />
          </div>

          {/* Temps total */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temps total alloué *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Heures</label>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={timeInput.hours}
                  onChange={(e) => handleTimeChange('hours', e.target.value)}
                  className={`input text-center ${errors.time ? 'border-danger-300 focus:ring-danger-500' : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={timeInput.minutes}
                  onChange={(e) => handleTimeChange('minutes', e.target.value)}
                  className={`input text-center ${errors.time ? 'border-danger-300 focus:ring-danger-500' : ''}`}
                />
              </div>
            </div>
            <div className="mt-2 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">
                Total: {formatTimeDisplay()}
              </span>
            </div>
            {errors.time && (
              <p className="mt-1 text-sm text-danger-600">{errors.time}</p>
            )}
          </div>

          {/* Temps actuel (affichage seulement en mode édition) */}
          {project && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temps déjà utilisé
              </label>
              <div className="input bg-gray-50 text-gray-700 cursor-not-allowed">
                {Math.floor(project.currentTime / 3600)}h {Math.floor((project.currentTime % 3600) / 60)}min {project.currentTime % 60}s
              </div>
            </div>
          )}

          {/* Boutons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={isLoading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className={`btn-primary flex items-center space-x-2 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
              disabled={isLoading}
            >
              <Save className="w-4 h-4" />
              <span>{isLoading ? 'Sauvegarde...' : 'Sauvegarder'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectModal; 