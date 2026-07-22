import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Wrench,
  Play,
  Square,
  Trash2,
  Plus,
  Copy,
  ExternalLink,
  RefreshCw,
  Check
} from 'lucide-react';

// Formate une durée (secondes) en "Xh Ym" ou "Ym Zs".
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

const EMPTY_FORM = { factureClientId: '', label: 'Maintenance', hours: '', minutes: '' };

/**
 * Panneau Maintenance : forfaits par client (facture_clients), découplés des projets.
 * - Créer/éditer un forfait (enveloppe fixe qui se consomme)
 * - Démarrer/arrêter une session (consomme du temps)
 * - Copier / ouvrir le lien du portail client
 */
const MaintenancePanel = ({ disabled = false, onRunningChange = () => {} }) => {
  const [clients, setClients] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Session en cours : { maintenanceId, startedAt(ms) }
  const [running, setRunning] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!window.electronAPI) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [clientList, maintenanceList] = await Promise.all([
        window.electronAPI.loadClients(),
        window.electronAPI.loadMaintenance()
      ]);
      setClients(Array.isArray(clientList) ? clientList : []);
      setItems(Array.isArray(maintenanceList) ? maintenanceList : []);
    } catch (err) {
      console.error('Erreur chargement maintenance:', err);
      setError(String(err?.message || err || 'Erreur de chargement'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tick d'horloge pendant une session
  useEffect(() => {
    if (running) {
      onRunningChange(true);
      intervalRef.current = setInterval(() => setNowTick(Date.now()), 1000);
    } else {
      onRunningChange(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, onRunningChange]);

  const elapsedForRunning = running
    ? Math.floor((nowTick - running.startedAt) / 1000)
    : 0;

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleEdit = (item) => {
    const total = item.totalSeconds || 0;
    setForm({
      factureClientId: String(item.factureClientId || ''),
      label: item.label || 'Maintenance',
      hours: String(Math.floor(total / 3600) || ''),
      minutes: String(Math.floor((total % 3600) / 60) || '')
    });
    setEditingId(item.id);
  };

  const handleSave = async () => {
    if (!window.electronAPI) return;
    const factureClientId = parseInt(form.factureClientId, 10);
    if (!factureClientId) {
      setError('Sélectionnez un client.');
      return;
    }
    const totalSeconds =
      (parseInt(form.hours, 10) || 0) * 3600 + (parseInt(form.minutes, 10) || 0) * 60;

    setSaving(true);
    setError(null);
    try {
      await window.electronAPI.saveMaintenance({
        factureClientId,
        label: (form.label || 'Maintenance').trim() || 'Maintenance',
        totalSeconds
      });
      resetForm();
      await refresh();
    } catch (err) {
      console.error('Erreur sauvegarde maintenance:', err);
      setError(String(err?.message || err || 'Erreur de sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.electronAPI) return;
    const confirmResult = await window.electronAPI.showMessageBox({
      type: 'question',
      title: 'Confirmer la suppression',
      message: `Supprimer le forfait de maintenance de « ${item.clientName || 'ce client'} » ?`,
      buttons: ['Annuler', 'Supprimer'],
      defaultId: 0,
      cancelId: 0
    });
    if (confirmResult.response !== 1) return;

    try {
      await window.electronAPI.deleteMaintenance({ id: item.id });
      if (editingId === item.id) resetForm();
      await refresh();
    } catch (err) {
      console.error('Erreur suppression maintenance:', err);
      setError(String(err?.message || err || 'Erreur de suppression'));
    }
  };

  const handleStart = (item) => {
    if (running || disabled) return;
    setRunning({ maintenanceId: item.id, startedAt: Date.now() });
    setNowTick(Date.now());
  };

  const handleStop = async () => {
    if (!running || !window.electronAPI) return;
    const durationSeconds = Math.max(0, Math.floor((Date.now() - running.startedAt) / 1000));
    const maintenanceId = running.maintenanceId;
    const startedIso = new Date(running.startedAt).toISOString();
    const endedIso = new Date().toISOString();
    setRunning(null);

    if (durationSeconds < 1) {
      return;
    }

    try {
      await window.electronAPI.logMaintenance({
        maintenanceId,
        durationSeconds,
        sessionStart: startedIso,
        sessionEnd: endedIso,
        sessionDate: startedIso.slice(0, 10)
      });
      await refresh();
    } catch (err) {
      console.error('Erreur enregistrement session maintenance:', err);
      setError(String(err?.message || err || 'Erreur d\'enregistrement de la session'));
    }
  };

  const handleCopy = async (item) => {
    if (!item.portalUrl) return;
    try {
      await navigator.clipboard.writeText(item.portalUrl);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 2000);
    } catch (err) {
      console.error('Copie impossible:', err);
    }
  };

  const handleOpen = (item) => {
    if (item.portalUrl && window.electronAPI) {
      window.electronAPI.openExternal(item.portalUrl);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-primary-100 text-primary-600 rounded-lg">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Maintenance</h2>
              <p className="text-sm text-gray-500">
                Forfait par client — visible sur le portail client, sans projet ni WordPress.
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className={`btn-secondary flex items-center space-x-2 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Rafraîchir</span>
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 bg-danger-50 text-danger-700 border border-danger-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Formulaire création / édition */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {editingId ? 'Modifier le forfait' : 'Nouveau forfait de maintenance'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
              <select
                value={form.factureClientId}
                onChange={(e) => setForm((f) => ({ ...f, factureClientId: e.target.value }))}
                disabled={Boolean(editingId)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
              >
                <option value="">— Choisir un client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company ? `${c.name} (${c.company})` : c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Intitulé</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Maintenance"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Heures</label>
              <input
                type="number"
                min="0"
                value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                placeholder="0"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Minutes</label>
              <input
                type="number"
                min="0"
                max="59"
                value={form.minutes}
                onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))}
                placeholder="0"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || disabled}
              className={`btn-primary flex items-center space-x-2 ${saving || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Plus className="w-4 h-4" />
              <span>{editingId ? 'Enregistrer' : 'Créer le forfait'}</span>
            </button>
            {editingId && (
              <button onClick={resetForm} className="btn-secondary">
                Annuler
              </button>
            )}
          </div>
        </div>

        {/* Liste des forfaits */}
        <div className="space-y-3">
          {loading && items.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">Chargement…</p>
          )}
          {!loading && items.length === 0 && (
            <div className="text-center py-10 bg-white rounded-lg border border-dashed border-gray-300">
              <Wrench className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                Aucun forfait de maintenance. Créez-en un ci-dessus pour un client.
              </p>
            </div>
          )}

          {items.map((item) => {
            const isRunningItem = running && running.maintenanceId === item.id;
            const liveUsed = (item.usedSeconds || 0) + (isRunningItem ? elapsedForRunning : 0);
            const total = item.totalSeconds || 0;
            const remaining = Math.max(0, total - liveUsed);
            const percent = total > 0 ? Math.min(100, (liveUsed / total) * 100) : 0;
            const depleted = total > 0 && remaining <= 0;

            return (
              <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {item.clientName || 'Client inconnu'}
                      {item.company ? <span className="text-gray-400 font-normal"> · {item.company}</span> : null}
                    </h4>
                    <p className="text-xs text-gray-500">{item.label || 'Maintenance'}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${depleted ? 'text-danger-600' : 'text-success-600'}`}>
                      {formatDuration(remaining)}
                    </div>
                    <div className="text-xs text-gray-400">restant / {formatDuration(total)}</div>
                  </div>
                </div>

                {/* Barre de progression */}
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full transition-all duration-500 ${depleted ? 'bg-danger-500' : 'bg-primary-500'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isRunningItem ? (
                    <button
                      onClick={handleStop}
                      className="btn-primary flex items-center space-x-2 bg-danger-600 hover:bg-danger-700 border-danger-600"
                    >
                      <Square className="w-4 h-4" />
                      <span>Arrêter ({formatDuration(elapsedForRunning)})</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(item)}
                      disabled={Boolean(running) || disabled}
                      className={`btn-primary flex items-center space-x-2 ${running || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={running ? 'Une session est déjà en cours' : 'Démarrer une session de maintenance'}
                    >
                      <Play className="w-4 h-4" />
                      <span>Démarrer</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleEdit(item)}
                    disabled={Boolean(running)}
                    className={`btn-secondary ${running ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Modifier
                  </button>

                  {item.portalUrl && (
                    <>
                      <button
                        onClick={() => handleCopy(item)}
                        className="btn-secondary flex items-center space-x-2"
                        title="Copier le lien du portail client"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-4 h-4 text-success-600" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span className="hidden md:inline">Lien portail</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleOpen(item)}
                        className="btn-secondary flex items-center space-x-2"
                        title="Ouvrir le portail client"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => handleDelete(item)}
                    disabled={Boolean(running)}
                    className={`btn-secondary flex items-center space-x-2 text-danger-600 border-danger-200 hover:bg-danger-50 ml-auto ${running ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Supprimer le forfait"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MaintenancePanel;
