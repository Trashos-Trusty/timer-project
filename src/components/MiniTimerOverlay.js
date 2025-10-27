import React from 'react';
import { Maximize2, Minimize2, Clock, Play, Pause } from 'lucide-react';

const formatTime = (seconds = 0) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');

  return `${hrs}:${mins}:${secs}`;
};

const MiniTimerOverlay = ({
  snapshot,
  isCollapsed,
  onToggleCollapse,
  containerClassName,
  panelClassName,
}) => {
  if (!snapshot || !snapshot.project) {
    return null;
  }

  const { project, currentTime, isRunning, currentSubject } = snapshot;
  const subjectLabel = currentSubject?.trim() || 'Sujet non défini';
  const containerClasses = containerClassName || 'fixed top-4 left-4 z-50';
  const panelClasses =
    panelClassName ||
    `backdrop-blur bg-white/90 shadow-lg border border-gray-200 rounded-xl transition-all duration-200 ${
      isCollapsed ? 'p-2 min-w-[140px]' : 'p-4 w-64'
    }`;

  return (
    <div className={containerClasses}>
      <div className={panelClasses}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
              }`}
            ></div>
            <span className="text-xs font-medium text-gray-600 truncate">
              {project.name}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={isCollapsed ? 'Afficher plus de détails du minuteur' : 'Réduire le minuteur'}
          >
            {isCollapsed ? (
              <Maximize2 className="w-4 h-4" />
            ) : (
              <Minimize2 className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className={`mt-2 ${isCollapsed ? '' : 'space-y-2'}`}>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-50 text-primary-600">
              {isRunning ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </div>
            <div className="font-mono font-semibold text-lg text-gray-900">
              {formatTime(currentTime)}
            </div>
          </div>

          {!isCollapsed && (
            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex items-start gap-2">
                <Clock className="w-3 h-3 mt-0.5 text-gray-400" />
                <span className="leading-tight">{subjectLabel}</span>
              </div>
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${
                  isRunning
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isRunning ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                ></span>
                {isRunning ? 'En cours' : 'En pause'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MiniTimerOverlay;
