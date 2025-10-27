import React, { useRef, useCallback, useEffect } from 'react';
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

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], [data-prevent-drag]';

const MiniTimerOverlay = ({
  snapshot,
  isCollapsed,
  onToggleCollapse,
  containerClassName,
  panelClassName,
  isDraggable = false,
  position,
  onPositionChange,
}) => {
  const hasSnapshot = Boolean(snapshot?.project);
  const project = snapshot?.project;
  const currentTime = snapshot?.currentTime ?? 0;
  const isRunning = snapshot?.isRunning ?? false;
  const currentSubject = snapshot?.currentSubject ?? '';
  const subjectLabel = currentSubject.trim ? currentSubject.trim() || 'Sujet non défini' : 'Sujet non défini';
  const containerRef = useRef(null);
  const dragStateRef = useRef({
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    lastUserSelect: ''
  });
  const effectivePosition = position || { x: 16, y: 16 };
  const containerClasses = [
    containerClassName || (isDraggable ? 'fixed z-50' : 'fixed top-4 left-4 z-50'),
    isDraggable ? 'cursor-grab active:cursor-grabbing touch-none' : ''
  ]
    .filter(Boolean)
    .join(' ');
  const panelClasses =
    panelClassName ||
    `backdrop-blur bg-white/90 shadow-lg border border-gray-200 rounded-xl transition-all duration-200 ${
      isCollapsed ? 'p-2 min-w-[140px]' : 'p-4 w-64'
    }`;

  const handlePointerMove = useCallback(
    (event) => {
      if (!dragStateRef.current.isDragging || typeof window === 'undefined') {
        return;
      }

      if (typeof onPositionChange !== 'function') {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      event.preventDefault();

      const width = container.offsetWidth || 0;
      const height = container.offsetHeight || 0;
      const padding = 16;
      const nextX = event.clientX - dragStateRef.current.offsetX;
      const nextY = event.clientY - dragStateRef.current.offsetY;
      const maxX = Math.max(padding, window.innerWidth - width - padding);
      const maxY = Math.max(padding, window.innerHeight - height - padding);
      const clampedX = Math.min(Math.max(nextX, padding), maxX);
      const clampedY = Math.min(Math.max(nextY, padding), maxY);

      onPositionChange({ x: clampedX, y: clampedY });
    },
    [onPositionChange]
  );

  const handlePointerUp = useCallback(() => {
    if (!dragStateRef.current.isDragging || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    dragStateRef.current.isDragging = false;
    document.body.style.userSelect = dragStateRef.current.lastUserSelect || '';
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = useCallback(
    (event) => {
      if (
        !isDraggable ||
        typeof onPositionChange !== 'function' ||
        typeof window === 'undefined' ||
        typeof document === 'undefined'
      ) {
        return;
      }

      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      const target = event.target;
      if (target && typeof target.closest === 'function' && target.closest(INTERACTIVE_SELECTOR)) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      dragStateRef.current.isDragging = true;
      dragStateRef.current.offsetX = event.clientX - rect.left;
      dragStateRef.current.offsetY = event.clientY - rect.top;
      dragStateRef.current.lastUserSelect = document.body.style.userSelect || '';

      document.body.style.userSelect = 'none';

      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', handlePointerUp);

      event.preventDefault();
    },
    [handlePointerMove, handlePointerUp, isDraggable, onPositionChange]
  );

  useEffect(() => {
    const dragState = dragStateRef.current;

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      }

      if (dragState.isDragging && typeof document !== 'undefined') {
        dragState.isDragging = false;
        document.body.style.userSelect = dragState.lastUserSelect || '';
      }
    };
  }, [handlePointerMove, handlePointerUp, dragStateRef]);

  const containerStyle = isDraggable
    ? { left: effectivePosition.x ?? 16, top: effectivePosition.y ?? 16 }
    : undefined;

  if (!hasSnapshot || !project) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      style={containerStyle}
      onPointerDown={isDraggable ? handlePointerDown : undefined}
    >
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
