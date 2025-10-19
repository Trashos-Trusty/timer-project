import React, { useState } from 'react';
import { X, FolderPlus, MousePointerClick, PlayCircle } from 'lucide-react';

const steps = [
  {
    id: 1,
    title: 'Crée ton premier projet',
    description: 'Ajoute un projet pour commencer à suivre ton temps.',
    icon: FolderPlus
  },
  {
    id: 2,
    title: 'Clique dessus pour l\'ouvrir',
    description: 'Sélectionne le projet dans la liste pour accéder aux détails.',
    icon: MousePointerClick
  },
  {
    id: 3,
    title: 'Lance le chrono et confirme ta tâche',
    description: 'Démarre le timer et valide l\'activité réalisée.',
    icon: PlayCircle
  }
];

const OnboardingModal = ({ onComplete }) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (onComplete) {
      onComplete(dontShowAgain);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-60 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          aria-label="Fermer la modale d'accueil"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8">
          <div className="mb-6 flex items-center space-x-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-2xl">👋</span>
            <h2 className="text-2xl font-semibold text-gray-900">Bienvenue dans Timer Project</h2>
          </div>
          <p className="mb-8 text-gray-600">
            Découvre comment démarrer en quelques étapes simples.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className="group flex h-full flex-col rounded-xl border border-gray-100 bg-gray-50 p-4 text-center transition hover:border-primary-200 hover:bg-primary-50"
                >
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-inner">
                    <Icon className="h-6 w-6 text-primary-500" />
                  </div>
                  <span className="mb-2 text-sm font-semibold text-primary-600">Étape {step.id.toString().padStart(2, '0')}</span>
                  <h3 className="mb-1 text-base font-semibold text-gray-900">{step.title}</h3>
                  <p className="text-sm text-gray-600">{step.description}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-gray-100 pt-6 md:flex-row md:items-center">
            <label className="inline-flex items-center space-x-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(event) => setDontShowAgain(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span>Ne plus afficher</span>
            </label>

            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center rounded-lg bg-primary-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              C'est parti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
