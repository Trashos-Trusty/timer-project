import React, { useEffect, useState } from 'react';
import { Share2, Copy, Check, ExternalLink, Link as LinkIcon, Globe, FolderKanban } from 'lucide-react';

/**
 * Carte "Affichage côté client" — sous le minuteur, pour le projet sélectionné.
 * Modèle unifié : le temps restant du projet timer est le temps de maintenance.
 * 3 façons de le montrer au client :
 *   1. WordPress (plugin) — déjà géré via le bouton "Plugin WP".
 *   2. Portail projet (Project Tracker) — à venir (nécessite un rattachement client).
 *   3. Lien direct /m/{token} — client sans WordPress ni projet.
 */
const ClientShareCard = ({ project, onProjectUpdate = () => {} }) => {
  const [portalUrl, setPortalUrl] = useState(project?.portalUrl || null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const [ptProjects, setPtProjects] = useState([]);
  const [ptProjectId, setPtProjectId] = useState(project?.ptProjectId || null);
  const [linking, setLinking] = useState(false);

  // Réinitialiser quand on change de projet
  useEffect(() => {
    setPortalUrl(project?.portalUrl || null);
    setPtProjectId(project?.ptProjectId || null);
    setCopied(false);
    setError(null);
  }, [project?.id, project?.portalUrl, project?.ptProjectId]);

  // Charger une fois la liste des projets Soreva (Project-tracker)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.electronAPI) return;
      try {
        const list = await window.electronAPI.loadPtProjects();
        if (!cancelled) setPtProjects(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('Erreur chargement projets Soreva:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      console.error('Erreur rattachement projet Soreva:', err);
      setError(String(err?.message || err || 'Erreur de rattachement'));
    } finally {
      setLinking(false);
    }
  };

  const handleGenerate = async () => {
    if (!window.electronAPI || !project?.id) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await window.electronAPI.ensureShareToken(project.id);
      setPortalUrl(result.portalUrl);
      onProjectUpdate({ ...project, clientToken: result.clientToken, portalUrl: result.portalUrl });
    } catch (err) {
      console.error('Erreur génération lien:', err);
      setError(String(err?.message || err || 'Erreur de génération'));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copie impossible:', err);
    }
  };

  const handleOpen = () => {
    if (portalUrl && window.electronAPI) {
      window.electronAPI.openExternal(portalUrl);
    }
  };

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Share2 className="w-4 h-4 text-primary-600" />
        <h3 className="text-sm font-semibold text-gray-900">Affichage du temps restant côté client</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. WordPress */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
          <Globe className="w-4 h-4 text-purple-500 mt-0.5" />
          <div>
            <div className="text-xs font-semibold text-gray-800">Site WordPress</div>
            <p className="text-xs text-gray-500 mt-0.5">
              Le plugin affiche le temps restant sur le site du client (bouton « Plugin WP »).
            </p>
          </div>
        </div>

        {/* 2. Portail projet — rattachement explicite */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
          <FolderKanban className="w-4 h-4 text-blue-500 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800">Portail projet Soreva</div>
            <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
              Affiche le temps restant sur l'espace projet du client.
            </p>
            <select
              value={ptProjectId || ''}
              onChange={(e) => handleLink(e.target.value)}
              disabled={linking}
              className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
            >
              <option value="">— Non rattaché —</option>
              {ptProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.clientName ? `${p.name} · ${p.clientName}` : p.name}
                </option>
              ))}
            </select>
            {ptProjectId ? (
              <p className="text-xs text-success-600 mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" /> Rattaché
              </p>
            ) : null}
          </div>
        </div>

        {/* 3. Lien direct */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary-50 border border-primary-100">
          <LinkIcon className="w-4 h-4 text-primary-600 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800">Lien direct</div>
            <p className="text-xs text-gray-500 mt-0.5">
              Sans WordPress ni projet : un lien sécurisé à partager.
            </p>
          </div>
        </div>
      </div>

      {/* Zone lien /m/ */}
      <div className="mt-3">
        {error && (
          <div className="mb-2 text-xs text-danger-600">{error}</div>
        )}
        {portalUrl ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={portalUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 text-xs border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-gray-700 font-mono"
            />
            <button
              onClick={handleCopy}
              className="btn-secondary flex items-center space-x-1 shrink-0"
              title="Copier le lien"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-success-600" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copier</span>
                </>
              )}
            </button>
            <button
              onClick={handleOpen}
              className="btn-secondary flex items-center shrink-0"
              title="Ouvrir le portail client"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`btn-primary flex items-center space-x-2 ${generating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>{generating ? 'Génération…' : 'Générer le lien client'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ClientShareCard;
