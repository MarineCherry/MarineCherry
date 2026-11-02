/*
 * Import d'un mail (.msg Outlook, .eml), d'une offre ou d'un compromis (PDF, Word .docx, texte) dans le suivi des dossiers.
 * Le fichier est lu sur le poste (msgreader, pdf.js) ; rien n'est envoyé sur internet.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, fmtEuro } = A.util;
  const ui = A.ui;
  const X = () => A.engines.extraction;

  const FORMATS = '.msg,.eml,.pdf,.docx,.docm,.dotx,.doc,.rtf,.odt,.txt,.htm,.html';

  function script(src) {
    return new Promise((ok, ko) => {
      if (document.querySelector('script[data-src="' + src + '"]')) return ok();
      const s = h('script', { src, 'data-src': src });
      s.onload = () => ok();
      s.onerror = () => ko(new Error('Impossible de charger ' + src));
      document.head.appendChild(s);
    });
  }
  async function pdfjs() {
    if (!root.pdfjsLib) {
      await script('assets/vendor/pdfjs/pdf.worker.min.js');
      await script('assets/vendor/pdfjs/pdf.min.js');
      root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
    }
    return root.pdfjsLib;
  }
  function choisirFichier() {
    return new Promise((ok) => {
      const input = h('input', { type: 'file', accept: FORMATS });
      input.addEventListener('change', () => ok(input.files && input.files[0]));
      input.click();
    });
  }

  // Texte d'un PDF, ligne par ligne (regroupement des morceaux par ordonnée).
  async function textePdf(fichier) {
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
    const lignes = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const tc = await (await pdf.getPage(n)).getTextContent();
      const parY = new Map();
      tc.items.forEach((i) => {
        const y = Math.round(i.transform[5]);
        const k = [...parY.keys()].find((v) => Math.abs(v - y) <= 2);
        const cle = k === undefined ? y : k;
        if (!parY.has(cle)) parY.set(cle, []);
        parY.get(cle).push({ x: i.transform[4], s: i.str });
      });
      [...parY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
        lignes.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim());
      });
    }
    return lignes.join('\n');
  }

  // Lecture d'un fichier : { nom, sujet, expediteur, corps, piecesJointes }
  // Le type du document est reconnu d'après son contenu (signature des premiers octets), puis son extension.
  async function lireFichier(fichier) {
    const nom = fichier.name || 'document';
    const ext = (nom.includes('.') ? nom.split('.').pop() : '').toLowerCase();
    const sujet = nom.replace(/\.[^.]+$/, '');
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const sig = (...x) => x.every((v, k) => octets[k] === v);
    const debut = new TextDecoder('latin1').decode(octets.subarray(0, 16));
    const doc = (corps) => ({ nom, sujet, expediteur: '', corps, piecesJointes: [] });

    if (sig(0x50, 0x4b, 0x03, 0x04)) {
      // Archive : Word (.docx, .docm, .dotx) ou OpenOffice (.odt).
      const f = await A.zip.lire(octets);
      if (f['word/document.xml']) return doc(X().texteDocx(A.zip.texte(f['word/document.xml'])));
      if (f['content.xml']) return doc(X().texteOdt(A.zip.texte(f['content.xml'])));
      throw new Error('« ' + nom + ' » est une archive qui ne contient pas de document Word.');
    }
    if (sig(0x25, 0x50, 0x44, 0x46)) return doc(await textePdf(fichier));
    if (/^\{\\rtf/.test(debut)) return doc(X().texteRtf(new TextDecoder('latin1').decode(octets)));
    if (sig(0xd0, 0xcf, 0x11, 0xe0)) {
      // Format binaire Microsoft : mail Outlook (.msg) ou ancien document Word (.doc).
      if (ext !== 'doc' && ext !== 'dot') {
        try {
          await script('assets/vendor/msgreader/msgreader.min.js');
          const r = new root.MsgReader(octets.buffer);
          const i = r.getFileData();
          if (!i.error && (i.subject || i.body || i.bodyHtml)) {
            const exp = [i.senderName, i.senderEmail ? '<' + (i.senderSmtpAddress || i.senderEmail) + '>' : ''].filter(Boolean).join(' ');
            return {
              nom, sujet: i.subject || '', expediteur: exp, date: i.messageDeliveryTime || i.clientSubmitTime || '',
              corps: i.body || (i.bodyHtml ? X().htmlEnTexte(i.bodyHtml) : ''),
              piecesJointes: (i.attachments || []).filter((a) => !a.attachmentHidden).map((a) => a.fileName || a.name || 'pièce jointe'),
            };
          }
        } catch (e) { /* pas un mail : ancien document Word */ }
      }
      const t = X().texteDocBinaire(octets);
      if (t.length < 40) throw new Error('« ' + nom + ' » n\'a pas pu être lu. Ouvrez-le dans Word et enregistrez-le en .docx, puis importez-le.');
      return doc(t);
    }
    // Fichiers texte : mail enregistré (.eml), page web, texte.
    const texte = new TextDecoder('utf-8').decode(octets);
    if (ext === 'eml' || /^(?:Return-Path|Received|From|MIME-Version|Delivered-To|Date|Subject):/im.test(texte.slice(0, 2000))) return Object.assign({ nom }, X().lireEml(texte));
    if (ext === 'html' || ext === 'htm' || /^\s*<(?:!doctype|html)/i.test(texte)) return doc(X().htmlEnTexte(texte));
    if (ext === 'txt' || !/[\x00-\x08\x0e-\x1f]/.test(texte.slice(0, 2000))) return doc(texte);
    throw new Error('Format de « ' + nom + ' » non pris en charge : utilisez un mail Outlook (.msg), un mail enregistré (.eml), un PDF, un document Word (.docx ou .doc), RTF ou OpenOffice (.odt), ou un texte.');
  }

  /* ---------- Fenêtre de vérification ---------- */
  function fenetre(titre, contenu, actions) {
    return new Promise((resolve) => {
      const overlay = h('div', { class: 'overlay' });
      const close = (v) => { overlay.remove(); resolve(v); };
      overlay.appendChild(h('div', { class: 'dialog dialog-large', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre },
        h('h3', { class: 'dialog-title' }, titre), h('div', { class: 'dialog-body' }, contenu), h('div', { class: 'dialog-actions' }, actions(close))));
      document.body.appendChild(overlay);
    });
  }
  const NOMS_PIECES = (p) => {
    const l = (p.pieces && p.pieces.vente) || [];
    return (id) => (l.find((x) => x.id === id) || {}).libelle || id;
  };
  function personneTexte(x) {
    return [x.civilite, x.nom].filter(Boolean).join(' ') + (x.qualite === 'societe' && x.representants ? ', représentée par ' + x.representants : '')
      + (x.commune ? ' — ' + [x.adresse, x.codePostal, x.commune].filter(Boolean).join(' ') : '');
  }

  /*
   * Montre ce qui a été trouvé ; renvoie { groupes, cible: 'nouveau' | 'courant' } ou null.
   * avecCourant : propose de compléter le dossier ouvert.
   */
  function verifier(lu, res, params, avecCourant) {
    const groupes = { parties: true, bien: true, prix: true, financement: true, agence: true, notaires: true, pieces: true };
    const nomPiece = NOMS_PIECES(params);
    const bloc = (cle, titre, lignes) => {
      if (!lignes.length) return null;
      const cb = h('input', { type: 'checkbox', checked: true, onchange: () => (groupes[cle] = cb.checked) });
      return h('div', { class: 'import-bloc' },
        h('label', { class: 'import-titre' }, cb, h('span', null, titre)),
        h('ul', { class: 'import-liste' }, lignes.map((l) => h('li', null, l))));
    };
    const b = res.bien;
    const contenu = h('div', { class: 'stack-sm' },
      h('p', { class: 'small muted' }, lu.nom + (lu.sujet && lu.sujet !== lu.nom ? ' — « ' + lu.sujet + ' »' : '')),
      res.trouve.length ? ui.note('Trouvé : ' + res.trouve.join(', ') + '. Décochez ce que vous ne voulez pas reprendre ; tout reste modifiable ensuite.')
        : ui.note('Aucune information reconnue dans ce document. Vous pouvez tout de même créer le dossier et le compléter.', 'warn'),
      bloc('parties', 'Parties', [].concat(
        res.vendeurs.map((x) => 'Vendeur : ' + personneTexte(x)),
        res.acquereurs.map((x) => 'Acquéreur : ' + personneTexte(x)))),
      bloc('bien', 'Bien', [
        [b.adresse, b.codePostal, b.commune].filter(Boolean).join(' '),
        b.description || '',
        b.cadastre ? 'Cadastre : ' + b.cadastre + (b.contenance ? ' (' + b.contenance + ')' : '') : '',
        b.copro ? 'En copropriété' : '',
        b.travauxRecents ? 'Travaux de moins de 10 ans' : '',
      ].filter(Boolean)),
      bloc('prix', 'Prix', [
        res.prix.prix ? 'Prix : ' + fmtEuro(res.prix.prix) + (res.prix.prixFAI ? ' (' + fmtEuro(res.prix.prixFAI) + ' honoraires compris)' : '') : '',
        res.prix.honoraires ? 'Honoraires : ' + fmtEuro(res.prix.honoraires) + (res.prix.chargeHonoraires ? ' à la charge ' + (res.prix.chargeHonoraires === 'vendeur' ? 'du vendeur' : 'de l\'acquéreur') : '') : '',
      ].filter(Boolean)),
      bloc('financement', 'Financement', [
        res.financement.pret === true ? 'Prêt' + (res.financement.montantPret ? ' de ' + fmtEuro(res.financement.montantPret) : '') : res.financement.pret === false ? 'Sans prêt' : '',
        res.financement.texte || '',
        res.financement.depotGarantie ? 'Dépôt de garantie : ' + fmtEuro(res.financement.depotGarantie) : '',
      ].filter(Boolean)),
      bloc('notaires', 'Notaires', res.notaires.map((n) => n.nom + (n.ville ? ', notaire à ' + n.ville : '') + (n.pour ? ' — pour ' + n.pour : ''))),
      bloc('agence', 'Agence', [
        [res.agence.nom, res.agence.contact].filter(Boolean).join(' — '),
        [res.agence.telephone, res.agence.email].filter(Boolean).join(' · '),
        res.agence.mandat ? 'Mandat n° ' + res.agence.mandat : '',
      ].filter(Boolean)),
      bloc('pieces', 'Pièces jointes et pièces annoncées', res.piecesJointes.map((x) => x.fichier + (x.piece ? ' → ' + nomPiece(x.piece) + ' (reçue)' : ' → non classée'))
        .concat((res.aSuivre || []).map((x) => 'À suivre : ' + x + ' (ajouté aux notes)'))));
    return fenetre('Informations trouvées', contenu, (close) => [
      ui.button('Annuler', { variant: 'ghost', onClick: () => close(null) }),
      avecCourant ? ui.button('Compléter ce dossier', { variant: 'soft', onClick: () => close({ groupes, cible: 'courant' }) }) : null,
      ui.button(avecCourant ? 'Créer un nouveau dossier' : 'Créer le dossier', { variant: avecCourant ? 'ghost' : 'primary', icon: 'plus', onClick: () => close({ groupes, cible: 'nouveau' }) }),
    ].filter(Boolean));
  }

  /*
   * Parcours complet : choix (ou fichier déposé), lecture, vérification.
   * Renvoie { lu, res, choix } ou null.
   */
  async function importer(params, avecCourant, fichierDepose) {
    const fichier = fichierDepose || (await choisirFichier());
    if (!fichier) return null;
    let lu;
    try {
      lu = await lireFichier(fichier);
    } catch (e) {
      ui.toast(e.message, 'error');
      return null;
    }
    const res = X().extraire(lu);
    const choix = await verifier(lu, res, params, avecCourant);
    return choix ? { lu, res, choix } : null;
  }

  A.importDossier = { importer, lireFichier, FORMATS };
})(typeof self !== 'undefined' ? self : this);
