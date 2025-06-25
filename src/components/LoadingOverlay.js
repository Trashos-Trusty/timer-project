import React from 'react';
import { LoaderIcon } from 'lucide-react';

const LoadingOverlay = ({ isVisible, message = "Sauvegarde en cours..." }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center space-y-4">
          {/* Icône animée */}
          <div className="relative">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
              <LoaderIcon className="w-8 h-8 text-primary-600" />
            </div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          </div>
          
          {/* Message */}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Synchronisation API
            </h3>
            <p className="text-gray-600 text-sm">
              {message}
            </p>
          </div>
          
          {/* Barre de progression animée */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full animate-pulse w-2/3"></div>
          </div>
          
          {/* Instructions */}
          <p className="text-xs text-gray-500 text-center">
            Veuillez patienter pendant la mise à jour...
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay; 