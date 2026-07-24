import React, { useEffect, useState, useCallback } from 'react';
import { Share2, Copy, Check, ExternalLink, Globe, Link as LinkIcon } from 'lucide-react';

/**
 * Carte "Affichage côté client" sous le minuteur, pour le projet sélectionné.
 * Modèle unifié : le temps restant du projet timer est le temps de maintenance.
 *
 * UX : au premier usage, on demande simplement si le client a un site WordPress.
 *  - Oui  → on affiche le JETON à coller dans le plugin WordPress Soreva.
 *  - Non  → on affiche le LIEN direct /m/{token} (aucun compte requis).
 * Les deux dérivent du même jeton de partage. Le choix est modifiable à tout
 * moment via les onglets (WordPress / Lien direct / Les deux) et mémorisé par projet.
 * Le rattachement à un projet Soreva (portail projet) reste proposé quand il existe
 * déjà un projet pour ce client.
 */

const MODE_STORAGE_KEY = (projectId) => `soreva-timer:client-share-mode:${projectId}`;

const readStoredMode = (projectId) => {
  if (!projectId) return null;
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY(projectId));
  } catch (_e) {
    return null;
  }
};

const writeStoredMode = (projectId, mode) => {
  if (!projectId) return;
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY(projectId), mode);
  } catch (_e) {
    /* localStorage indisponible : on garde le choix en mémoire seulement */
  }
};

const ClientShareCard = ({ project, onProjectUpdate = () => {} }) => {
  const [portalUrl, setPortalUrl] = useState(project?.portalUrl || null);
  const [clientToken, setClientToken] = useState(project?.clientToken || null);
  // 'wordpress' | 'portal' | 'both' | null (null = poser la question)
  const [mode, setMode] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState(null); // 'token' | 'url'
  const [error, setError] = useState(null);

  const [ptProjects, setPtProjects] = useState([]);
  const [ptProjectId, setPtProjectId] = useState(project?.ptProjectId || null);
  const [linking, setLinking] = useState(false);

  // Jeton effectif : privilégie clientToken, sinon on l'extrait du lien portail.
  const tokenValue =
    clientToken || (portalUrl && portalUrl.includes('/m/') ? portalUrl.split('/m/').pop() : null);
  const hasShare = Boolean(portalUrl || tokenValue);

  // Réinitialiser quand on change de projet
  useEffect(() => {
    setPortalUrl(project?.portalUrl || null);
    setClientToken(project?.clientToken || null);
    setPtProjectId(project?.ptProjectId || null);
    setCopiedField(null);
    setError(null);

    const shareExists = Boolean(project?.portalUrl || project?.clientToken);
    const stored = readStoredMode(project?.id);
    // Si un partage existe déjà : mode mémorisé, sinon « les deux » (rien de caché).
    // Sinon : null → on pose la question WordPress oui/non.
    setMode(shareExists ? (stored || 'both') : null);
  }, [project?.id, project?.portalUrl, project?.ptProjectId, project?.clientToken]);

  // Charger les projets Soreva du client de CETTE enveloppe (vide si aucun)
  useEffect(() => {
    let cancelled = false;
    setPtProjects([]);
    (async () => {
      if (!window.electronAPI || !project?.id) return;
      try {
        const list = await window.electronAPI.loadPtProjects(project.id);
        if (!cancelled) setPtProjects(Array.isArray(list) ? list : []);
      } catch (_err) {
        /* silencieux : le sélecteur reste simplement masqué */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  const selectMode = useCallback(
    (nextMode) => {
      setMode(nextMode);
      writeStoredMode(project?.id, nextMode);
    },
    [project?.id]
  );

  // Génère le jeton de partage si nécessaire (le même alimente jeton et lien).
  const ensureShare = useCallback(async () => {
    if (clientToken && portalUrl) {
      return { clientToken, portalUrl };
    }
    const result = await window.electronAPI.ensureShareToken(project.id);
    setPortalUrl(result.portalUrl);
    setClientToken(result.clientToken);
    onProjectUpdate({ ...project, clientToken: result.clientToken, portalUrl: result.portalUrl });
    return result;
  }, [clientToken, portalUrl, project, onProjectUpdate]);

  // Réponse à « le client a-t-il un WordPress ? » : génère le partage + choisit le mode.
  const handleChoose = async (chosenMode) => {
    if (!window.electronAPI || !project?.id) return;
    setGenerating(true);
    setError(null);
    try {
      await ensureShare();
      selectMode(chosenMode);
    } catch (err) {
      setError(String(err?.message || err || 'Erreur de génération'));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text, field) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (_err) {
      /* copie indisponible : l'utilisateur peut sélectionner le champ manuellement */
    }
  };

  const handleOpen = () => {
    if (portalUrl && window.electronAPI) {
      window.electronAPI.openExternal(portalUrl);
    }
  };

  const handleLink = async (value) => {
    if (!window.electronAPI || !project?.id) return;
    const newPtId = value ? parseInt(value, 10) : null;
    setLinking(true);
    setError(null);
    try {
      const result = await window.electronAPI.linkPtProject(project.id, newPtId);
      setPtProjectId(result.ptProjectId);
      onProjectUpdate({ ...project, ptProjectId: result.ptProjectId });
    } catch (err) {
      setError(String(err?.message || err || 'Erreur de rattachement'));
    } finally {
      setLinking(false);
    }
  };

  const showWordpress = mode === 'wordpress' || mode === 'both';
  const showPortal = mode === 'portal' || mode === 'both';

  const TabButton = ({ value, icon: Icon, label }) => (
    <button
      type="button"
      onClick={() => selectMode(value)}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
        mode === value
          ? 'bg-white text-primary-700 shadow-sm font-medium'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
      {/* En-tête + onglets (dès qu'un partage existe) */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium shrink-0">
          <Share2 className="w-3.5 h-3.5" /> Affichage côté client
        </span>
        {hasShare && (
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
            <TabButton value="wordpress" icon={Globe} label="WordPress" />
            <TabButton value="portal" icon={LinkIcon} label="Lien direct" />
            <TabButton value="both" icon={Share2} label="Les deux" />
          </div>
        )}
      </div>

      {!hasShare ? (
        /* Première utilisation : question simple */
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-600">
            Le site de votre client tourne-t-il sous WordPress&nbsp;?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleChoose('wordpress')}
              disabled={generating}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-primary-50 text-primary-700 hover:bg-primary-100 ${
                generating ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Oui, il a WordPress
            </button>
            <button
              type="button"
              onClick={() => handleChoose('portal')}
              disabled={generating}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 ${
                generating ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" /> Non
            </button>
          </div>
          {generating && <span className="text-xs text-gray-400">Génération…</span>}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Bloc WordPress : jeton à coller dans le plugin */}
          {showWordpress && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
              <p className="text-xs text-gray-600 mb-1.5">
                <span className="font-medium text-gray-700">Site WordPress</span> — installez le
                plugin « Soreva Maintenance » sur le site du client, puis collez ce jeton dans ses
                réglages :
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={tokenValue || ''}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-[140px] text-[11px] border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(tokenValue, 'token')}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
                  title="Copier le jeton"
                >
                  {copiedField === 'token' ? (
                    <Check className="w-4 h-4 text-success-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Bloc lien direct : à envoyer au client */}
          {showPortal && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
              <p className="text-xs text-gray-600 mb-1.5">
                <span className="font-medium text-gray-700">Lien direct</span> — envoyez ce lien à
                votre client, aucun compte requis :
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={portalUrl || ''}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-[140px] text-[11px] border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(portalUrl, 'url')}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
                  title="Copier le lien"
                >
                  {copiedField === 'url' ? (
                    <Check className="w-4 h-4 text-success-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleOpen}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
                  title="Ouvrir le portail client"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rattachement projet Soreva : seulement si un projet existe pour ce client */}
      {ptProjects.length > 0 && (
        <div className="flex items-center gap-1 text-xs mt-2 pt-2 border-t border-gray-100">
          <span className="text-gray-400 shrink-0">Portail projet Soreva&nbsp;:</span>
          <select
            value={ptProjectId || ''}
            onChange={(e) => handleLink(e.target.value)}
            disabled={linking}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white max-w-[180px] disabled:opacity-50"
            title="Afficher aussi le temps restant sur l'espace projet du client"
          >
            <option value="">Non rattaché</option>
            {ptProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-xs text-danger-600 mt-1.5">{error}</p>}
    </div>
  );
};

export default ClientShareCard;
