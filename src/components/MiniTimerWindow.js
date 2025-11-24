import React, { useCallback } from 'react';
import MiniTimerOverlay from './MiniTimerOverlay';

const MiniTimerWindow = ({ snapshot, isCollapsed, onToggleCollapse }) => {
  const triggerAction = useCallback(async (type) => {
    if (!window?.electronAPI?.triggerMiniTimerAction) {
      return;
    }

    try {
      await window.electronAPI.triggerMiniTimerAction({
        type,
        projectId: snapshot?.project?.id ?? null,
      });
    } catch (error) {
      console.error('Impossible de déclencher l\'action mini-timer:', error);
    }
  }, [snapshot?.project?.id]);

  const handlePause = useCallback(() => {
    if (!snapshot?.project) {
      return;
    }

    triggerAction('pause');
  }, [snapshot, triggerAction]);

  const handleResume = useCallback(() => {
    if (!snapshot?.project) {
      return;
    }

    triggerAction('resume');
  }, [snapshot, triggerAction]);

  const handleStop = useCallback(async () => {
    if (!snapshot?.project) {
      return;
    }

    await triggerAction('stop');

    if (window?.electronAPI?.showMainWindow) {
      await window.electronAPI.showMainWindow();
    }

    window?.electronAPI?.setMiniTimerVisibility?.(false);
  }, [snapshot, triggerAction]);

  const handleExpand = useCallback(async () => {
    await triggerAction('expand');

    if (window?.electronAPI?.showMainWindow) {
      await window.electronAPI.showMainWindow();
    }

    window?.electronAPI?.setMiniTimerVisibility?.(false);
  }, [triggerAction]);

  return (
    <div
      className="h-full w-full bg-white flex items-center justify-center py-2"
      style={{ WebkitAppRegion: 'drag' }}
    >
      {snapshot && snapshot.project ? (
        <MiniTimerOverlay
          snapshot={snapshot}
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          containerClassName="w-full h-full flex items-center justify-center"
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onRequestExpand={handleExpand}
          enableWindowDrag
          sizeVariant="window"
        />
      ) : (
        <div className="text-center text-sm text-gray-500 px-6">
          Aucun minuteur en cours. Lancez un projet depuis l'application principale.
        </div>
      )}
    </div>
  );
};

export default MiniTimerWindow;
