/*
 * Enregistrement local : paramètres, brouillons automatiques, fichiers de dossier.
 * Rien n'est envoyé sur internet : tout reste dans le navigateur de ce poste
 * ou dans les fichiers que l'utilisateur enregistre lui-même.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { clone } = A.util;

  const KEY_PARAMS = 'atelier.parametres.v1';
  const KEY_DRAFT = 'atelier.brouillon.';
  const FILE_FORMAT = 'atelier-notarial';

  function read(key) {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }
  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Paramètres : valeurs par défaut, surchargées par les modifications enregistrées.
  const listeners = [];
  function getParams() {
    const saved = read(KEY_PARAMS) || {};
    const d = clone(A.defaults);
    ['commun', 'plusValue', 'succession'].forEach((s) => Object.assign(d[s], saved[s] || {}));
    return d;
  }
  function setParams(section, values) {
    const saved = read(KEY_PARAMS) || {};
    saved[section] = values;
    write(KEY_PARAMS, saved);
    listeners.forEach((f) => f());
  }
  function resetParams(section) {
    const saved = read(KEY_PARAMS) || {};
    if (section) delete saved[section];
    write(KEY_PARAMS, section ? saved : null);
    listeners.forEach((f) => f());
  }
  const isCustomized = (section) => !!(read(KEY_PARAMS) || {})[section];
  const onParamsChange = (f) => listeners.push(f);

  // Paramètres prêts à l'emploi pour un moteur de calcul.
  function engineParams(section) {
    const p = getParams();
    return Object.assign({}, p[section], { bareme669: p.commun.bareme669 });
  }

  const saveDraft = (appId, data) => write(KEY_DRAFT + appId, data);
  const loadDraft = (appId) => read(KEY_DRAFT + appId);

  // Téléchargement d'un fichier JSON sur le poste.
  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Ouverture d'un fichier JSON choisi par l'utilisateur.
  function openJSON() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            resolve(JSON.parse(reader.result));
          } catch (e) {
            reject(new Error("Ce fichier n'est pas un dossier valide."));
          }
        };
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsText(file);
      });
      input.click();
    });
  }

  // Enveloppe des fichiers de dossier, pour reconnaître l'outil à la réouverture.
  const wrapFile = (outil, data) => ({ format: FILE_FORMAT, version: 1, outil, enregistreLe: new Date().toISOString(), dossier: data });
  function unwrapFile(outil, file) {
    if (!file || file.format !== FILE_FORMAT || !file.dossier) throw new Error("Ce fichier n'a pas été créé par l'Atelier notarial.");
    if (file.outil !== outil) throw new Error('Ce fichier appartient à un autre outil.');
    return file.dossier;
  }

  A.store = { getParams, setParams, resetParams, isCustomized, onParamsChange, engineParams, saveDraft, loadDraft, downloadJSON, openJSON, wrapFile, unwrapFile };
})(typeof self !== 'undefined' ? self : this);
