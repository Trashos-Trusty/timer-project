import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Minimize2, Clock, Play, Pause, Square } from 'lucide-react';

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
  enableWindowDrag = false,
  onPause,
  onResume,
  onStop,
  onRequestExpand,
  sizeVariant = 'default'
}) => {
  const hasSnapshot = Boolean(snapshot?.project);
  const project = snapshot?.project;
  const currentTime = snapshot?.currentTime ?? 0;
  const isRunning = snapshot?.isRunning ?? false;
  const currentSubject = snapshot?.currentSubject ?? '';
  const currentSessionTime = snapshot?.currentSessionTime ?? 0;
  const hasPendingSession = snapshot?.hasPendingSession ?? false;
  const subjectLabel = currentSubject.trim ? currentSubject.trim() || 'Sujet non défini' : 'Sujet non défini';
  const containerRef = useRef(null);
  const dragStateRef = useRef({
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
    lastUserSelect: ''
  });
  const animationFrameRef = useRef(null);
  const lastUpdateRef = useRef({
    sessionTime: currentSessionTime,
    totalTime: currentTime,
    timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  });
  const [displaySessionTime, setDisplaySessionTime] = useState(currentSessionTime);
  const [displayTotalTime, setDisplayTotalTime] = useState(currentTime);
  const effectivePosition = position || { x: 16, y: 16 };
  const isWindowVariant = sizeVariant === 'window';
  const isCompact = isWindowVariant || sizeVariant === 'compact';
  const containerClasses = [
    containerClassName || (isDraggable ? 'fixed z-50' : 'fixed top-4 left-4 z-50'),
    isDraggable ? 'cursor-grab active:cursor-grabbing touch-none' : ''
  ]
    .filter(Boolean)
    .join(' ');
  const panelClasses = panelClassName
    ? panelClassName
    : isWindowVariant
      ? `relative flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-[24px] border border-primary-100/60 bg-white/95 px-3 shadow-xl transition-all duration-200 ${
          isCollapsed ? 'h-[176px] w-[188px] py-2.5' : 'h-[192px] w-[200px] py-3.5'
        }`
      : `relative overflow-hidden backdrop-blur bg-white/95 shadow-xl border border-primary-100/60 ${
          isCompact ? 'rounded-2xl' : 'rounded-[32px]'
        } transition-all duration-200 ${
          isCollapsed
            ? isCompact
              ? 'px-4 py-3 w-[220px]'
              : 'px-5 py-4 w-[220px]'
            : isCompact
              ? 'px-4 py-3 w-[250px]'
              : 'px-6 py-5 w-[260px]'
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

  useEffect(() => {
    const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    lastUpdateRef.current = {
      sessionTime: currentSessionTime,
      totalTime: currentTime,
      timestamp: getNow(),
    };

    setDisplaySessionTime(currentSessionTime);
    setDisplayTotalTime(currentTime);
  }, [currentSessionTime, currentTime]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const cancelAnimation = () => {
      if (
        animationFrameRef.current &&
        typeof window !== 'undefined' &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
    };

    const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (!isRunning) {
      cancelAnimation();
      setDisplaySessionTime(lastUpdateRef.current.sessionTime);
      setDisplayTotalTime(lastUpdateRef.current.totalTime);
      lastUpdateRef.current.timestamp = getNow();
      return cancelAnimation;
    }

    lastUpdateRef.current.timestamp = getNow();

    const tick = () => {
      const now = getNow();
      const elapsedSeconds = Math.max(0, (now - lastUpdateRef.current.timestamp) / 1000);
      const nextSessionTime = lastUpdateRef.current.sessionTime + elapsedSeconds;
      const nextTotalTime = lastUpdateRef.current.totalTime + elapsedSeconds;

      setDisplaySessionTime(nextSessionTime);
      setDisplayTotalTime(nextTotalTime);

      lastUpdateRef.current.sessionTime = nextSessionTime;
      lastUpdateRef.current.totalTime = nextTotalTime;
      lastUpdateRef.current.timestamp = now;

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        animationFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      animationFrameRef.current = window.requestAnimationFrame(tick);
    }

    return cancelAnimation;
  }, [isRunning]);

  useEffect(() => {
    return () => {
      if (
        animationFrameRef.current &&
        typeof window !== 'undefined' &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const containerStyle = (() => {
    const style = {};

    if (isDraggable) {
      style.left = effectivePosition.x ?? 16;
      style.top = effectivePosition.y ?? 16;
    }

    if (enableWindowDrag) {
      style.WebkitAppRegion = 'drag';
    }

    return Object.keys(style).length > 0 ? style : undefined;
  })();

  const interactiveStyle = enableWindowDrag ? { WebkitAppRegion: 'no-drag' } : undefined;
  const dragRegionStyle = enableWindowDrag ? { WebkitAppRegion: 'drag' } : undefined;

  const circleSize = (() => {
    if (isWindowVariant) {
      return isCollapsed ? 108 : 124;
    }

    if (!isCompact) {
      return isCollapsed ? 168 : 208;
    }

    return isCollapsed ? 132 : 156;
  })();
  const PauseResumeIcon = isRunning ? Pause : Play;
  const pauseButtonLabel = isRunning ? 'Pause' : 'Reprendre';

  const handlePauseClick = () => {
    if (isRunning) {
      onPause?.();
    } else {
      onResume?.();
    }
  };

  const handleStopClick = () => {
    if (typeof onStop === 'function') {
      onStop();
    }
  };

  const handleExpandClick = () => {
    window?.electronAPI?.showMainWindow?.();
    window?.electronAPI?.setMiniTimerVisibility?.(false);

    if (typeof onRequestExpand === 'function') {
      onRequestExpand();
    }
  };

  const canResume = Boolean(!isRunning && typeof onResume === 'function');
  const canPause = Boolean(isRunning && typeof onPause === 'function');
  const showPauseButton = canPause || canResume;
  const showStopButton = typeof onStop === 'function';
  const contentClasses = isWindowVariant
    ? 'flex h-full w-full flex-col items-center justify-start gap-1.5 pt-1.5 pb-2'
    : `flex flex-col items-center ${isCompact ? 'gap-2.5' : 'gap-4'}`;
  const headerGapClass = isWindowVariant ? 'gap-0.5' : isCompact ? 'gap-2' : 'gap-3';
  const projectInfoGapClass = isWindowVariant ? 'gap-0.5' : isCompact ? 'gap-1.5' : 'gap-2';
  const projectNameClass = isWindowVariant ? 'text-[9.5px]' : isCompact ? 'text-xs' : 'text-sm';
  const statusTypographyClass = isWindowVariant ? 'gap-0.5 text-[8.5px]' : isCompact ? 'gap-1.5 text-[10px]' : 'gap-2 text-[11px]';
  const stateIndicatorClass = isWindowVariant ? 'h-1.5 w-1.5' : isCompact ? 'h-2.5 w-2.5' : 'h-2.5 w-2.5';
  const innerCircleInsetClass = isWindowVariant ? 'absolute inset-[8px]' : isCompact ? 'absolute inset-[10px]' : 'absolute inset-[12px]';
  const expandButtonPositionClass = isCompact ? 'absolute top-2.5 right-2.5' : 'absolute top-3 right-3';
  const expandButtonSizeClass = isWindowVariant ? 'h-5 w-5' : isCompact ? 'h-7 w-7' : 'h-8 w-8';
  const expandIconSizeClass = isWindowVariant ? 'h-2.5 w-2.5' : isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const circleContentPaddingClass = isWindowVariant ? 'px-3' : isCompact ? 'px-4' : 'px-6';
  const circleLabelClass = isWindowVariant ? 'text-[8.5px] tracking-[0.18em]' : isCompact ? 'text-[10px] tracking-[0.18em]' : 'text-[11px] tracking-[0.25em]';
  const timerValueClass = isWindowVariant ? 'text-base' : isCompact ? 'text-xl' : 'text-2xl';
  const subjectTextClass = isWindowVariant ? 'mt-0.5 text-[10px] leading-tight' : isCompact ? 'mt-1 text-xs leading-snug' : 'mt-2 text-sm leading-tight';
  const totalBadgeClass = isWindowVariant ? 'mt-1.5 gap-1 px-2 py-0.5 text-[9px]' : isCompact ? 'mt-2 gap-1.5 px-2.5 py-0.5 text-[10px]' : 'mt-4 gap-2 px-3 py-1 text-xs';
  const totalIconClass = isWindowVariant ? 'h-2.5 w-2.5' : isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const bottomSectionGapClass = isWindowVariant ? 'gap-1.5' : isCompact ? 'gap-2' : 'gap-3';
  const toggleInfoClass = isWindowVariant ? 'gap-0.5 text-[8.5px]' : isCompact ? 'gap-1.5 text-[10px]' : 'gap-2 text-[11px]';
  const toggleButtonClass = isWindowVariant ? 'px-1 py-0.5 text-[8.5px]' : isCompact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
  const controlsGapClass = isWindowVariant ? 'gap-1.5' : 'gap-3';
  const primaryButtonSizeClass = isWindowVariant
    ? 'h-7 w-7 p-0'
    : isCompact
      ? 'min-w-[84px] px-3 py-1.5 text-xs'
      : 'min-w-[92px] px-4 py-2 text-sm';
  const controlIconSizeClass = isWindowVariant ? 'h-3.5 w-3.5' : isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const circleContentClass = `relative z-10 flex h-full w-full flex-col items-center justify-center ${circleContentPaddingClass} text-center`;
  const showTotalBadge = !isWindowVariant;
  const showButtonLabels = !isWindowVariant;
  const showHeader = !isWindowVariant;
  const showToggleInfo = !isWindowVariant;
  const showDragHandle = Boolean(isWindowVariant && enableWindowDrag);

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
        {isWindowVariant && (
          <div className="absolute top-2 right-2" style={interactiveStyle}>
            <button
              type="button"
              onClick={handleExpandClick}
              className={`inline-flex items-center justify-center rounded-full bg-white/80 text-gray-500 shadow-sm transition hover:text-primary-600 hover:bg-white ${expandButtonSizeClass}`}
              aria-label="Ouvrir l'application principale"
            >
              <Minimize2 className={expandIconSizeClass} />
            </button>
          </div>
        )}
        <div className={contentClasses} style={interactiveStyle}>
          {showDragHandle && (
            <div className="flex w-full justify-center pb-1" style={dragRegionStyle}>
              <span className="h-1 w-10 rounded-full bg-gray-200"></span>
            </div>
          )}

          {showHeader && (
            <div className={`flex w-full items-center justify-between ${headerGapClass}`} style={dragRegionStyle}>
              <div className={`flex items-center ${projectInfoGapClass} min-w-0`}>
                <span
                  className={`inline-flex ${stateIndicatorClass} rounded-full ${
                    isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                  }`}
                ></span>
                <span className={`${projectNameClass} font-medium text-gray-700 truncate`}>
                  {project.name}
                </span>
              </div>
              <div
                className={`inline-flex items-center uppercase tracking-wide ${statusTypographyClass} ${
                  isRunning ? 'text-green-600' : 'text-gray-500'
                }`}
              >
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current"></span>
                {isRunning ? 'En cours' : 'En pause'}
              </div>
            </div>
          )}

          <div
            className={`relative flex items-center justify-center ${isWindowVariant ? 'flex-1 w-full' : ''}`}
            style={{
              width: `${circleSize}px`,
              height: `${circleSize}px`,
              maxWidth: `${circleSize}px`,
              maxHeight: `${circleSize}px`,
            }}
            data-prevent-drag
            onDoubleClick={onToggleCollapse}
          >
            <div
              className={`pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br ${
                isRunning
                  ? 'from-green-200/80 via-green-100/70 to-white/80'
                  : 'from-gray-200/70 via-gray-100/60 to-white/80'
              }`}
            ></div>
            <div
              className={`pointer-events-none ${innerCircleInsetClass} rounded-full bg-white/95 border border-white/60 shadow-inner`}
            ></div>
            {!isWindowVariant && (
              <div className={expandButtonPositionClass} style={interactiveStyle}>
                <button
                  type="button"
                  onClick={handleExpandClick}
                  className={`inline-flex items-center justify-center rounded-full bg-white/80 text-gray-500 shadow-sm transition hover:text-primary-600 hover:bg-white ${
                    expandButtonSizeClass
                  }`}
                  aria-label="Ouvrir l'application principale"
                >
                  <Minimize2 className={expandIconSizeClass} />
                </button>
              </div>
            )}
            <div className={circleContentClass}>
              <span
                className={`${circleLabelClass} uppercase text-gray-400`}
              >
                Tâche en cours
              </span>
              <span className={`mt-1 font-mono font-semibold text-gray-900 ${timerValueClass}`}>
                {formatTime(displaySessionTime)}
              </span>
              <span
                className={`text-gray-600 line-clamp-2 ${subjectTextClass}`}
              >
                {subjectLabel}
              </span>
              {showTotalBadge && (
                <div
                  className={`inline-flex items-center rounded-full bg-white/75 font-medium text-gray-600 ${totalBadgeClass}`}
                >
                  <Clock className={`${totalIconClass} text-gray-400`} />
                  <span>Total projet&nbsp;: {formatTime(displayTotalTime)}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`flex w-full flex-col items-center ${bottomSectionGapClass}`} style={interactiveStyle}>
            {showToggleInfo && (
              <div
                className={`flex items-center text-gray-400 uppercase tracking-wide ${toggleInfoClass} ${
                  isWindowVariant ? 'justify-center' : ''
                }`}
              >
                <span>{isWindowVariant ? (isCollapsed ? 'Compact' : 'Détaillée') : isCollapsed ? 'Mode compact' : 'Vue détaillée'}</span>
                {typeof onToggleCollapse === 'function' && (
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    className={`rounded-full bg-white/70 font-medium text-primary-600 shadow-sm transition hover:bg-primary-50 ${toggleButtonClass}`}
                  >
                    {isCollapsed ? 'Afficher plus' : 'Réduire'}
                  </button>
                )}
              </div>
            )}

            <div className={`flex w-full items-center justify-center ${controlsGapClass}`}>
              {showPauseButton && (
                <button
                  type="button"
                  onClick={handlePauseClick}
                  className={`flex items-center justify-center ${showButtonLabels ? 'gap-2' : ''} rounded-full font-medium transition ${
                    isRunning
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25 hover:bg-primary-500'
                      : 'bg-white text-primary-600 border border-primary-200 hover:bg-primary-50'
                  } ${primaryButtonSizeClass}`}
                  style={interactiveStyle}
                  disabled={isRunning ? !canPause : !canResume}
                  aria-label={pauseButtonLabel}
                >
                  <PauseResumeIcon className={controlIconSizeClass} />
                  {showButtonLabels && pauseButtonLabel}
                </button>
              )}

              {showStopButton && (
                <button
                  type="button"
                  onClick={handleStopClick}
                  className={`flex items-center justify-center ${showButtonLabels ? 'gap-2' : ''} rounded-full border border-red-200 bg-white font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 ${
                    primaryButtonSizeClass
                  }`}
                  style={interactiveStyle}
                  disabled={!hasPendingSession}
                  aria-label="Stop"
                >
                  <Square className={controlIconSizeClass} />
                  {showButtonLabels && 'Stop'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MiniTimerOverlay;
