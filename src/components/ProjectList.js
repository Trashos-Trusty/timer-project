import React from 'react';
import { FolderOpen, Edit, Trash2, Clock, Play, Pause, RefreshCw } from 'lucide-react';

const ProjectList = ({ 
  projects, 
  selectedProject, 
  onSelectProject, 
  onEditProject, 
  onDeleteProject, 
  onRefresh,
  disabled = false,
  isRefreshing = false,
  isTimerRunning = false
}) => {
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'text-success-600 bg-success-50';
      case 'paused':
        return 'text-warning-600 bg-warning-50';
      case 'stopped':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <Play className="w-3 h-3" />;
      case 'paused':
        return <Pause className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <FolderOpen className="w-5 h-5 mr-2" />
            Projets ({projects.length})
          </h2>
          
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={disabled || isRefreshing}
              className={`flex items-center space-x-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                disabled || isRefreshing
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-primary-50'
              }`}
              title={
                isTimerRunning 
                  ? 'Veuillez stopper le chronomètre avant de synchroniser' 
                  : 'Synchroniser avec le serveur API'
              }
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Sync...' : 'Sync'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Message informatif quand le timer est en cours */}
      {isTimerRunning && (
        <div className="mx-4 mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
            <p className="text-sm text-orange-800 font-medium">
              Chronomètre en cours
            </p>
          </div>
          <p className="text-xs text-orange-600 mt-1">
            Arrêtez le timer pour pouvoir changer de projet ou effectuer d'autres actions
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {projects.length === 0 ? (
          <div className="text-center py-8">
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">Aucun projet créé</p>
            <p className="text-sm text-gray-400">Créez votre premier projet pour commencer</p>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={`card p-4 transition-all duration-200 ${
                selectedProject?.id === project.id 
                  ? 'ring-2 ring-primary-500 border-primary-200' 
                  : ''
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}`}
              onClick={() => !disabled && onSelectProject(project)}
              title={
                isTimerRunning && selectedProject?.id !== project.id
                  ? 'Veuillez stopper le chronomètre avant de changer de projet'
                  : ''
              }
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 mb-1">{project.name}</h3>
                  {project.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{project.description}</p>
                  )}
                  {project.client && (
                    <p className="text-xs text-gray-500 mt-1">Client: {project.client}</p>
                  )}
                </div>
                
                <div className="flex items-center space-x-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!disabled) onEditProject(project);
                    }}
                    disabled={disabled}
                    className={`p-1 text-gray-400 hover:text-primary-600 transition-colors ${
                      disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={
                      isTimerRunning 
                        ? 'Veuillez stopper le chronomètre avant de modifier le projet' 
                        : 'Modifier'
                    }
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!disabled) onDeleteProject(project.id);
                    }}
                    disabled={disabled}
                    className={`p-1 text-gray-400 hover:text-danger-600 transition-colors ${
                      disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={
                      isTimerRunning 
                        ? 'Veuillez stopper le chronomètre avant de supprimer le projet' 
                        : 'Supprimer'
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                    {getStatusIcon(project.status)}
                    <span className="capitalize">{project.status === 'running' ? 'En cours' : project.status === 'paused' ? 'En pause' : 'Arrêté'}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm font-mono text-gray-900">
                    {formatTime(project.currentTime || 0)}
                  </div>
                  <div className="text-xs text-gray-500">
                    sur {formatTime(project.totalTime || 0)}h
                  </div>
                </div>
              </div>

              {project.status === 'running' && (
                <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                  <div 
                    className="bg-success-500 h-1 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min((project.currentTime / project.totalTime) * 100, 100)}%` 
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectList; 