import React, { useState } from 'react';
import {
  X,
  Send,
  MessageCircle,
  Bug,
  Lightbulb,
  Mail,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

const FEEDBACK_TYPES = [
  {
    value: 'bug',
    label: 'Bug',
    description: 'Quelque chose ne fonctionne pas comme prévu',
    icon: Bug
  },
  {
    value: 'idea',
    label: 'Amélioration',
    description: 'Suggestion d\'évolution ou retour général',
    icon: Lightbulb
  }
];

const FALLBACK_EMAIL = 'enguerran@trustystudio.fr';

const FeedbackModal = ({ onClose, onSubmit, freelanceInfo }) => {
  const [feedbackType, setFeedbackType] = useState('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(freelanceInfo?.email || '');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!message.trim()) {
      setError('Merci de détailler votre retour.');
      return;
    }

    if (message.trim().length < 10) {
      setError('Ajoutez quelques précisions supplémentaires pour nous aider à reproduire le problème.');
      return;
    }

    setIsSending(true);
    setError('');
    setErrorCode(null);

    try {
      await onSubmit({
        type: feedbackType,
        message: message.trim(),
        email: email.trim()
      });
      setIsSuccess(true);
    } catch (submitError) {
      const friendlyMessage =
        submitError?.message ||
        "Impossible d'envoyer le feedback. Vous pouvez également nous écrire directement par email.";

      setError(friendlyMessage);
      setErrorCode(submitError?.code || null);
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenEmailFallback = () => {
    if (!window?.electronAPI?.openExternal) {
      return;
    }

    const subject = encodeURIComponent('Feedback Timer Project');
    const body = encodeURIComponent(`${message}\n\n--\nEnvoyé depuis Timer Project`);
    window.electronAPI.openExternal(`mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${body}`);
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-100 text-success-600">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-gray-900">Merci pour votre retour !</h2>
          <p className="mt-3 text-sm text-gray-600">
            Votre message a bien été envoyé. Nous reviendrons vers vous dès que possible.
          </p>
          <button
            onClick={onClose}
            className="btn-primary mt-8 inline-flex items-center space-x-2"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Fermer</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-600">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Partager un feedback</h2>
              <p className="text-sm text-gray-500">Signalez un bug ou proposez une amélioration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fermer la fenêtre de feedback"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-1">
              <span className="text-sm font-medium text-gray-700">Type de retour</span>
              <p className="mt-1 text-xs text-gray-500">Aidez-nous à prioriser vos retours pendant la bêta.</p>
            </div>
            <div className="md:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row">
                {FEEDBACK_TYPES.map(({ value, label, description, icon: Icon }) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setFeedbackType(value)}
                    className={`flex flex-1 items-start space-x-3 rounded-lg border p-4 text-left transition-all ${
                      feedbackType === value
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-gray-200 bg-white hover:border-primary-200'
                    }`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      feedbackType === value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="md:col-span-1">
              <label htmlFor="feedback-message" className="text-sm font-medium text-gray-700">
                Détaillez votre retour
              </label>
              <p className="mt-1 text-xs text-gray-500">Plus vous êtes précis, plus il nous sera facile de corriger le bug.</p>
            </div>
            <div className="md:col-span-2">
              <textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                className="input min-h-[144px] resize-y"
                placeholder="Décrivez ce qui s'est passé, les étapes pour reproduire, les messages d'erreur..."
                required
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="md:col-span-1">
              <label htmlFor="feedback-email" className="text-sm font-medium text-gray-700">
                Email de contact
              </label>
              <p className="mt-1 text-xs text-gray-500">Facultatif, uniquement si vous souhaitez un retour.</p>
            </div>
            <div className="md:col-span-2">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  id="feedback-email"
                  className="input pl-10"
                  placeholder="votre.email@exemple.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 flex items-start space-x-3 rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="text-sm">
                <p>{error}</p>
                {errorCode === 'FEEDBACK_ENDPOINT_NOT_FOUND' && (
                  <p className="mt-2 text-xs text-danger-700">
                    Assurez-vous que l'URL API configurée pointe vers le fichier <code>api-timer.php</code> le plus récent sur votre serveur OVH.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleOpenEmailFallback}
                  className="mt-2 inline-flex items-center text-sm font-medium text-danger-700 underline"
                >
                  Ou envoyez-nous un email directement
                </button>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary w-full sm:w-auto"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSending}
              className={`btn-primary inline-flex w-full items-center justify-center space-x-2 sm:w-auto ${
                isSending ? 'opacity-75' : ''
              }`}
            >
              <Send className="h-4 w-4" />
              <span>{isSending ? 'Envoi en cours...' : 'Envoyer le feedback'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FeedbackModal;
