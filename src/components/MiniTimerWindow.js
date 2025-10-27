import React from 'react';
import MiniTimerOverlay from './MiniTimerOverlay';

const MiniTimerWindow = ({ snapshot, isCollapsed, onToggleCollapse }) => {
  return (
    <div className="min-h-screen min-w-[240px] bg-white flex items-center justify-center">
      {snapshot && snapshot.project ? (
        <MiniTimerOverlay
          snapshot={snapshot}
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          containerClassName="w-full"
          panelClassName={`shadow-lg border border-gray-200 rounded-xl transition-all duration-200 ${
            isCollapsed ? 'p-3 w-full max-w-[220px]' : 'p-5 w-full max-w-xs'
          }`}
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
