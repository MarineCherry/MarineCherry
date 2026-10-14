/*
 * Enregistrement des dossiers suivis.
 *
 * Deux modes :
 *   - « partagé » : un dossier choisi sur le réseau de l'étude (lecteur partagé, NAS, serveur de fichiers),
 *     un fichier .json par dossier. Les collègues qui choisissent le même dossier voient les mêmes dossiers.
 *     Utilise l'accès aux fichiers des navigateurs Chrome et Edge (File System Access).
 *   - « poste » : dans le navigateur de ce poste (repli, par exemple avec Firefox).
 * Un enregistrement vérifie qu'un collègue n'a pas modifié le dossier entre-temps (numéro de révision).
 */
(function (root) {
  'use strict';
  const A = root.Atelier;

  const CLE_LOCAL = 'atelier.dossiers.v1';
  const CLE_UTILISATEUR = 'atelier.utilisateur';
  const FORMAT = 'atelier-notarial';
  const OUTIL = 'dossiers';

  /* ---------- Poignée du dossier partagé, conservée dans IndexedDB ---------- */
  function idb(action, valeur) {
    return new Promise((ok) => {
      let req;
      try {
        req = indexedDB.open('atelier-notarial', 1);
      } catch (e) {
        return ok(null);
      }
      req.onupgradeneeded = () => req.result.createObjectStore('reglages');
      req.onerror = () => ok(null);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('reglages', action === 'get' ? 'readonly' : 'readwrite');
        const st = tx.objectStore('reglages');
        const r = action === 'get' ? st.get('dossierPartage') : action === 'del' ? st.delete('dossierPartage') : st.put(valeur, 'dossierPartage');
        r.onsuccess = () => ok(action === 'get' ? r.result || null : true);
        r.onerror = () => ok(null);
      };
    });
  }

  let poignee = null; // FileSystemDirectoryHandle
  let etat = { mode: 'poste', nom: '', permission: 'aucune' };
  const partageDisponible = () => typeof root.showDirectoryPicker === 'function';

  async function init() {
    const h = await idb('get');
    if (h && h.kind === 'directory') {
      poignee = h;
      let p = 'prompt';
      try {
        p = await h.queryPermission({ mode: 'readwrite' });
      } catch (e) { /* ancienne poignée */ }
      etat = { mode: 'partage', nom: h.name, permission: p === 'granted' ? 'ok' : 'a_demander' };
    } else {
      etat = { mode: 'poste', nom: '', permission: 'ok' };
    }
    return etat;
  }
  // Doit être appelé depuis un clic (le navigateur demande l'accord).
  async function reconnecter() {
    if (!poignee) return init();
    const p = await poignee.requestPermission({ mode: 'readwrite' });
    etat.permission = p === 'granted' ? 'ok' : 'a_demander';
    return etat;
  }
  async function choisirDossier() {
    const h = await root.showDirectoryPicker({ id: 'atelier-dossiers', mode: 'readwrite' });
    poignee = h;
    await idb('put', h);
    etat = { mode: 'partage', nom: h.name, permission: 'ok' };
    return etat;
  }
  // Pour les essais : utiliser une poignée fournie (par ex. le stockage privé du navigateur).
  async function utiliserPoignee(h) {
    poignee = h;
    etat = { mode: 'partage', nom: h.name || 'dossier', permission: 'ok' };
    return etat;
  }
  async function passerSurCePoste() {
    poignee = null;
    await idb('del');
    etat = { mode: 'poste', nom: '', permission: 'ok' };
    return etat;
  }
  const actif = () => etat.mode === 'poste' || etat.permission === 'ok';

  /* ---------- Utilisateur (initiales affichées dans « modifié par ») ---------- */
  const utilisateur = () => {
    try {
      return localStorage.getItem(CLE_UTILISATEUR) || '';
    } catch (e) {
      return '';
    }
  };
  const definirUtilisateur = (v) => {
    try {
      localStorage.setItem(CLE_UTILISATEUR, v || '');
    } catch (e) { /* ignoré */ }
  };

  /* ---------- Lecture / écriture ---------- */
  function lireLocal() {
    try {
      return JSON.parse(localStorage.getItem(CLE_LOCAL) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function ecrireLocal(map) {
    localStorage.setItem(CLE_LOCAL, JSON.stringify(map));
  }
  const nomFichier = (id) => 'dossier-' + id + '.json';
  const envelopper = (d) => ({ format: FORMAT, version: 1, outil: OUTIL, enregistreLe: new Date().toISOString(), dossier: d });

  async function lireFichier(fh) {
    const f = await fh.getFile();
    const data = JSON.parse(await f.text());
    if (!data || data.format !== FORMAT || data.outil !== OUTIL || !data.dossier) return null;
    return data.dossier;
  }

  async function lister() {
    if (etat.mode === 'poste') return Object.values(lireLocal());
    if (!actif()) throw new Error('Accès au dossier partagé à autoriser.');
    const out = [];
    for await (const [nom, fh] of poignee.entries()) {
      if (fh.kind !== 'file' || !/^dossier-.+\.json$/.test(nom)) continue;
      try {
        const d = await lireFichier(fh);
        if (d) out.push(d);
      } catch (e) { /* fichier illisible : ignoré */ }
    }
    return out;
  }
  async function lire(id) {
    if (etat.mode === 'poste') return lireLocal()[id] || null;
    try {
      return await lireFichier(await poignee.getFileHandle(nomFichier(id)));
    } catch (e) {
      return null;
    }
  }

  /*
   * Enregistre le dossier. Si la version enregistrée est plus récente que celle qui a été ouverte
   * (un collègue l'a modifiée), renvoie { conflit: dossierEnregistré } sans rien écrire, sauf si force.
   */
  async function enregistrer(d, force) {
    const existant = await lire(d.id);
    if (existant && !force && (existant.rev || 0) > (d.rev || 0)) return { conflit: existant };
    d.rev = Math.max(d.rev || 0, existant ? existant.rev || 0 : 0) + 1;
    d.modifieLe = new Date().toISOString();
    d.modifiePar = utilisateur();
    if (etat.mode === 'poste') {
      const map = lireLocal();
      map[d.id] = d;
      ecrireLocal(map);
    } else {
      const fh = await poignee.getFileHandle(nomFichier(d.id), { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(envelopper(d), null, 2));
      await w.close();
    }
    return { ok: true, rev: d.rev };
  }
  async function supprimer(id) {
    if (etat.mode === 'poste') {
      const map = lireLocal();
      delete map[id];
      ecrireLocal(map);
      return;
    }
    await poignee.removeEntry(nomFichier(id));
  }
  // Copie des dossiers de ce poste vers le dossier partagé.
  async function copierVersPartage() {
    const locaux = Object.values(lireLocal());
    let n = 0;
    for (const d of locaux) {
      const r = await enregistrer(Object.assign({}, d, { rev: 0 }), false);
      if (r.ok) n++;
    }
    return { copies: n, total: locaux.length };
  }
  const nbLocaux = () => Object.keys(lireLocal()).length;

  A.stockageDossiers = {
    init, reconnecter, choisirDossier, utiliserPoignee, passerSurCePoste, partageDisponible, actif,
    get etat() { return etat; },
    lister, lire, enregistrer, supprimer, copierVersPartage, nbLocaux, utilisateur, definirUtilisateur, envelopper,
  };
})(typeof self !== 'undefined' ? self : this);
