/*
 * Import d'un état hypothécaire (PDF « état-réponse » ANF) dans l'outil Origine de propriété,
 * et visionneuse des copies de fiches manuscrites, affichée à côté du formulaire.
 * Le PDF est lu sur le poste avec pdf.js (chargé à la demande) ; rien n'est envoyé sur internet.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, fmtEuro, fmtDate } = A.util;
  const ui = A.ui;

  let etatCourant = null; // { analyse, pdf, nom }
  const ecouteurs = [];

  /* ---------- Chargement de pdf.js et lecture du PDF ---------- */
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
      // Le « worker » est chargé dans la page : pdf.js l'utilise directement (compatible avec file://).
      await script('assets/vendor/pdfjs/pdf.worker.min.js');
      await script('assets/vendor/pdfjs/pdf.min.js');
      root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
    }
    return root.pdfjsLib;
  }
  function choisirFichier() {
    return new Promise((ok) => {
      const input = h('input', { type: 'file', accept: '.pdf,application/pdf' });
      input.addEventListener('change', () => ok(input.files && input.files[0]));
      input.click();
    });
  }
  async function lire(fichier, progression) {
    const lib = await pdfjs();
    const data = new Uint8Array(await fichier.arrayBuffer());
    const pdf = await lib.getDocument({ data }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      pages.push({ num: n, items: tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] })) });
      if (progression) progression(n, pdf.numPages);
    }
    return { pdf, pages };
  }

  /* ---------- Fenêtre d'import ---------- */
  const LIBELLES_TYPES = () => A.engines.origine.TYPES_LISTE;

  function fenetre(titre, contenu, actions, large) {
    const overlay = h('div', { class: 'overlay' });
    const close = () => overlay.remove();
    overlay.appendChild(h('div', { class: ['dialog', large ? 'dialog-large' : ''], role: 'dialog', 'aria-modal': 'true', 'aria-label': titre },
      h('h3', { class: 'dialog-title' }, titre), h('div', { class: 'dialog-body' }, contenu), h('div', { class: 'dialog-actions' }, actions(close))));
    document.body.appendChild(overlay);
    return close;
  }

  async function importer(ctx, appliquer) {
    const fichier = await choisirFichier();
    if (!fichier) return;
    const statut = h('p', null, 'Lecture de l\'état…');
    const fermerAttente = fenetre('Import de l\'état hypothécaire', statut, () => []);
    let lu;
    try {
      lu = await lire(fichier, (n, total) => (statut.textContent = 'Lecture de l\'état… page ' + n + ' sur ' + total));
    } catch (e) {
      fermerAttente();
      return ui.toast('Lecture du PDF impossible : ' + e.message, 'error');
    }
    fermerAttente();
    const analyse = A.etatHypothecaire.analyser(lu.pages);
    etatCourant = { analyse, pdf: lu.pdf, nom: fichier.name };
    ecouteurs.forEach((f) => f());
    if (!analyse.formalites.length) {
      ui.toast(analyse.pagesScannees.length ? 'Aucune formalité informatisée : seules les fiches scannées sont disponibles.' : 'Ce PDF ne ressemble pas à un état-réponse ANF.', 'error');
      if (analyse.pagesScannees.length) ouvrirFiches();
      return;
    }
    selection(ctx, analyse, appliquer);
  }

  function selection(ctx, analyse, appliquer) {
    const ET = A.etatHypothecaire;
    const dem = analyse.demande.immeubles[0] || {};
    const critere = {
      commune: dem.commune || '',
      parcelle: (dem.designations || []).length === 1 ? dem.designations[0] : '',
      lot: (dem.lots || []).length === 1 ? dem.lots[0] : '',
    };
    const choix = new Map(); // formalité → { retenue, type }
    analyse.formalites.filter((f) => f.section === 'Publication').forEach((f) => choix.set(f, { retenue: null, type: f.type || 'vente' }));

    const liste = h('div');
    function majListe() {
      const pub = analyse.formalites.filter((f) => f.section === 'Publication');
      // Sans parcelle indiquée, rien n'est présélectionné (un état peut porter sur plusieurs biens).
      const actif = !!ET.designation(critere.parcelle);
      const concernees = actif ? pub.filter((f) => ET.concerne(f, critere)) : [];
      const autres = pub.filter((f) => !concernees.includes(f));
      const ligne = (f, concerne) => {
        const c = choix.get(f);
        const retenue = c.retenue === null ? concerne && !!f.type : c.retenue;
        const cb = h('input', { type: 'checkbox', checked: retenue, 'aria-label': 'Retenir cette formalité' });
        cb.addEventListener('change', () => { c.retenue = cb.checked; });
        const biens = f.immeubles.map((i) => (i.designation ? i.designation.texte : '') + (i.lots.length ? ' lot' + (i.lots.length > 1 ? 's ' : ' ') + resumeLots(i.lots) : '')).filter(Boolean);
        return h('tr', { class: concerne ? '' : 'muted-row' },
          h('td', null, cb),
          h('td', { class: 'nowrap' }, fmtDate(f.dateActe) || '—'),
          h('td', null, h('div', { class: 'strong' }, f.nature), f.redacteur ? h('div', { class: 'small muted' }, f.redacteur.replace(/^NOT\s+/, 'Maître ')) : null),
          h('td', null, ui.selectInput({ value: c.type, options: LIBELLES_TYPES().map((t) => ({ value: t.id, label: t.libelle })), ariaLabel: 'Type d\'acte', onChange: (v) => { c.type = v; } })),
          h('td', { class: 'small' }, f.disposants.map((p) => p.nom).join(', ') || '—', ' → ', f.beneficiaires.map((p) => p.nom).join(', ') || '—'),
          h('td', { class: 'small' }, Array.from(new Set(biens)).join(' ; ')),
          h('td', { class: 'num nowrap' }, f.prix !== null ? fmtEuro(f.prix) : ''));
      };
      const tete = h('thead', null, h('tr', null, ['', 'Date de l\'acte', 'Formalité', 'Type d\'acte', 'Disposants → bénéficiaires', 'Bien', 'Prix / valeur'].map((x) => h('th', null, x))));
      const chg = actif ? ET.charges(analyse, critere) : [];
      liste.replaceChildren(...[
        h('h4', { class: 'form-sub' }, 'Formalités concernant le bien (' + concernees.length + ')'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table table-compact' }, tete,
          h('tbody', null, concernees.length ? concernees.map((f) => ligne(f, true)) : h('tr', null, h('td', { colspan: 7, class: 'empty' },
            actif ? 'Aucune formalité ne correspond à ce bien.' : 'Indiquez la parcelle (ex. IK 36) et, le cas échéant, le lot vendu.'))))),
        autres.length ? h('details', { class: 'sub-details' }, h('summary', null, 'Autres formalités de l\'état (' + autres.length + ')'),
          h('div', { class: 'table-wrap' }, h('table', { class: 'table table-compact' }, tete.cloneNode(true), h('tbody', null, autres.map((f) => ligne(f, false)))))) : null,
        chg.length ? [h('h4', { class: 'form-sub' }, 'Charges relevées sur le bien'),
          h('ul', { class: 'charges' }, chg.map((c) => h('li', null,
            ui.badge(c.radiee, c.radiee ? 'Radiée' : 'En cours', c.radiee ? null : 'warn'), ' ',
            h('strong', null, c.nature), ' — ', c.creancier || '', c.montant ? ' — ' + fmtEuro(c.montant) : '',
            c.reference ? ' (' + c.reference + (c.dateDepot ? ', ' + fmtDate(c.dateDepot) : '') + ')' : '')))] : null,
      ].flat().filter(Boolean));
    }
    const champ = (label, cle, placeholder) => ui.field(label, ui.textInput({ value: critere[cle], placeholder, onChange: (v) => { critere[cle] = v; majListe(); } }));
    majListe();

    const e = analyse.entete;
    const contenu = h('div', { class: 'stack-sm' },
      h('p', { class: 'muted' }, [e.anf, e.delivre ? 'délivré le ' + e.delivre : null, e.reference].filter(Boolean).join(' · ')),
      h('div', { class: 'kv-inline' },
        h('div', null, h('span', null, 'Formalités informatisées lues'), h('strong', null, String(analyse.formalites.length))),
        h('div', null, h('span', null, 'Pages de fiches manuscrites'), h('strong', null, String(analyse.pagesScannees.length)))),
      h('div', { class: 'grid-3' }, champ('Commune', 'commune', 'ex. AVIGNON'), champ('Parcelle', 'parcelle', 'ex. IK 36'), champ('Lot', 'lot', 'vide = tout l\'immeuble')),
      liste,
      ui.note('Sur l\'état, les personnes physiques ne figurent que par leur nom et leur date de naissance : complétez ensuite leur état civil (prénoms, domicile, situation…) dans l\'onglet Personnes. Les formalités antérieures à l\'informatisation sont sur les fiches manuscrites : consultez-les avec « Voir les fiches scannées ».'));

    const executer = (mode, close) => {
      const actif = !!ET.designation(critere.parcelle);
      const retenues = Array.from(choix.entries()).filter(([f, c]) => (c.retenue === null ? actif && ET.concerne(f, critere) && !!f.type : c.retenue));
      if (!retenues.length) return ui.toast('Cochez au moins une formalité.', 'error');
      const formalites = retenues.map(([f, c]) => Object.assign({}, f, { type: c.type }));
      const E = A.engines.origine;
      const res = ET.versDossier(analyse, formalites, {
        personne: (o) => E.nouvellePersonne(o),
        acte: (type, o) => E.nouvelActe(type, o),
      }, ctx.state.personnes);
      appliquer(res, mode);
      close();
      ui.toast(res.actes.length + ' origine(s) et ' + res.personnes.length + ' personne(s) créées. Complétez l\'état civil dans l\'onglet Personnes.');
    };
    const vide = ctx.state.actes.every((a) => !a.date && !a.acquereurs.length);
    fenetre('Import de l\'état hypothécaire', contenu, (close) => [
      ui.button('Annuler', { variant: 'ghost', onClick: close }),
      analyse.pagesScannees.length ? ui.button('Voir les fiches scannées', { variant: 'ghost', icon: 'file', onClick: () => ouvrirFiches() }) : null,
      vide ? null : ui.button('Ajouter à la suite', { variant: 'soft', onClick: () => executer('ajouter', close) }),
      ui.button(vide ? 'Créer les origines' : 'Remplacer la chaîne', { variant: 'primary', onClick: () => executer('remplacer', close) }),
    ].filter(Boolean), true);
  }

  function resumeLots(l) {
    const out = [];
    for (let i = 0; i < l.length; i++) {
      let j = i;
      while (j + 1 < l.length && l[j + 1] === l[j] + 1) j++;
      out.push(j > i ? l[i] + ' à ' + l[j] : String(l[i]));
      i = j;
    }
    return out.join(', ');
  }

  /* ---------- Visionneuse des fiches scannées ---------- */
  let visionneuse = null;
  function ouvrirFiches() {
    if (!etatCourant) return;
    const pages = etatCourant.analyse.pagesScannees;
    if (!pages.length) return ui.toast('Cet état ne contient pas de fiches scannées.');
    if (visionneuse) visionneuse.remove();
    let index = 0, zoom = 1;
    const titre = h('span');
    const zone = h('div', { class: 'fiches-page' });
    async function afficher() {
      titre.textContent = 'Page ' + pages[index] + ' — fiche ' + (index + 1) + ' sur ' + pages.length;
      const page = await etatCourant.pdf.getPage(pages[index]);
      const largeur = Math.max(320, zone.clientWidth - 8);
      const base = page.getViewport({ scale: 1 });
      const ratio = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: (largeur / base.width) * zoom });
      const canvas = h('canvas', { width: Math.floor(vp.width * ratio), height: Math.floor(vp.height * ratio) });
      canvas.style.width = Math.floor(vp.width) + 'px';
      const c2d = canvas.getContext('2d');
      c2d.setTransform(ratio, 0, 0, ratio, 0, 0);
      zone.replaceChildren(canvas);
      await page.render({ canvasContext: c2d, viewport: vp }).promise;
    }
    const aller = (d) => { index = Math.min(pages.length - 1, Math.max(0, index + d)); afficher(); };
    const fermer = () => { visionneuse.remove(); visionneuse = null; document.body.classList.remove('avec-fiches'); };
    visionneuse = h('aside', { class: 'fiches', 'aria-label': 'Fiches scannées' },
      h('header', { class: 'fiches-barre' },
        h('strong', null, 'Fiches manuscrites'), titre,
        h('div', { class: 'fiches-actions' },
          ui.button('Fiche précédente', { icon: 'up', iconOnly: true, small: true, variant: 'ghost', onClick: () => aller(-1) }),
          ui.button('Fiche suivante', { icon: 'down', iconOnly: true, small: true, variant: 'ghost', onClick: () => aller(1) }),
          ui.button('Zoom −', { small: true, variant: 'ghost', onClick: () => { zoom = Math.max(0.5, zoom - 0.25); afficher(); } }),
          ui.button('Zoom +', { small: true, variant: 'ghost', onClick: () => { zoom = Math.min(3, zoom + 0.25); afficher(); } }),
          ui.button('Fermer', { small: true, variant: 'soft', onClick: fermer }))),
      zone);
    document.body.appendChild(visionneuse);
    document.body.classList.add('avec-fiches');
    afficher();
  }

  A.importEtat = {
    importer, ouvrirFiches,
    courant: () => etatCourant,
    surChangement: (f) => ecouteurs.push(f),
  };
})(typeof self !== 'undefined' ? self : this);
