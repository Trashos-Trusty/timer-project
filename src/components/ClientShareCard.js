import React, { useEffect, useState } from 'react';
import { Share2, Copy, Check, ExternalLink, Link as LinkIcon } from 'lucide-react';

/**
 * Barre compacte "Affichage côté client" sous le minuteur, pour le projet sélectionné.
 * Modèle unifié : le temps restant du projet timer est le temps de maintenance.
 *  - Lien direct /m/{token} (client sans WordPress ni projet).
 *  - Rattachement à un projet Soreva : proposé seulement s'il existe déjà un projet
 *    pour CE client (sinon rien).
 * Volontairement minimale pour ne pas masquer la colonne du minuteur.
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

  // Charger les projets Soreva du client de CETTE enveloppe (vide si aucun)
  useEffect(() => {
    let cancelled = false;
    setPtProjects([]);
    (async () => {
      if (!window.electronAPI || !project?.id) return;
      try {
        const list = await window.electronAPI.loadPtProjects(project.id);
        if (!cancelled) setPtProjects(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('Erreur chargement projets Soreva:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

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

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="flex items-center gap-1 text-gray-500 font-medium shrink-0">
          <Share2 className="w-3.5 h-3.5" /> Lien client
        </span>

        {portalUrl ? (
          <>
            <input
              type="text"
              readOnly
              value={portalUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-[140px] text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50 text-gray-600 font-mono"
            />
            <button onClick={handleCopy} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Copier le lien">
              {copied ? <Check className="w-4 h-4 text-success-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <button onClick={handleOpen} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Ouvrir le portail client">
              <ExternalLink className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`flex items-center gap-1 px-2.5 py-1 rounded bg-primary-50 text-primary-700 hover:bg-primary-100 ${generating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            {generating ? 'Génération…' : 'Générer un lien'}
          </button>
        )}

        {/* Rattachement projet : seulement si un projet existe pour ce client */}
        {ptProjects.length > 0 && (
          <div className="flex items-center gap-1 shrink-0 border-l border-gray-200 pl-2 ml-1">
            <span className="text-gray-400">Projet&nbsp;:</span>
            <select
              value={ptProjectId || ''}
              onChange={(e) => handleLink(e.target.value)}
              disabled={linking}
              className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white max-w-[160px] disabled:opacity-50"
              title="Afficher aussi le temps restant sur l'espace projet du client"
            >
              <option value="">Non rattaché</option>
              {ptProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {error && <span className="text-danger-600 shrink-0">{error}</span>}
      </div>
    </div>
  );
};

export default ClientShareCard;
