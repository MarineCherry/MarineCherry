/*
 * Application « Suivi des dossiers » : tableau de bord des dossiers de l'étude (ventes, successions),
 * fiche de chaque dossier (parties, bien, pièces, diagnostics, notes) et import d'un mail ou d'un document.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, fmtEuro, fmtDate, todayISO, uid, debounce, isNum } = A.util;
  const ui = A.ui;
  const E = () => A.engines.dossiers;
  const S = () => A.stockageDossiers;

  const app = {
    id: 'dossiers',
    title: 'Suivi des dossiers',
    caption: 'Pièces, diagnostics, échéances',
    icon: 'dossiers',
    gradient: 'linear-gradient(150deg, #2f6b5a 0%, #5d9c86 100%)',
  };
  const params = () => A.store.getParams().dossiers;

  /* ---------- Modèles ---------- */
  function nouveau(type) {
    const d = {
      id: uid('d'), type, statut: 'en_cours', etape: type === 'succession' ? 'ouverture' : 'promesse', reference: '',
      creeLe: new Date().toISOString(), rev: 0,
      vendeurs: [], acquereurs: [], notaires: [], agence: {}, bien: {}, prix: {}, financement: {}, dates: {},
      diagnostics: {}, pieces: {}, piecesAjoutees: [], documents: [], notes: '',
    };
    if (type === 'succession') Object.assign(d, { defunt: {}, heritiers: [] });
    return d;
  }
  function normaliser(d) {
    const base = nouveau(d.type === 'succession' ? 'succession' : 'vente');
    const r = Object.assign(base, d);
    ['agence', 'bien', 'prix', 'financement', 'dates', 'diagnostics', 'pieces'].forEach((k) => (r[k] = r[k] || {}));
    ['vendeurs', 'acquereurs', 'notaires', 'piecesAjoutees', 'documents'].forEach((k) => (r[k] = r[k] || []));
    if (r.type === 'succession') { r.defunt = r.defunt || {}; r.heritiers = r.heritiers || []; }
    return r;
  }
  const nouvellePersonne = (qualite) => ({ id: uid('p'), qualite: qualite || 'personne', civilite: '', nom: '', adresse: '', codePostal: '', commune: '', telephone: '', email: '', profession: '', situation: '', representants: '' });
  const etatDe = (d) => E().etat(Object.assign({}, d, { aujourdhui: todayISO() }), params());
  const titre = (d) => E().reference(d) || (d.type === 'succession' ? 'Succession sans nom' : 'Vente sans nom');

  const STATUTS_DOSSIER = [
    { value: 'en_cours', label: 'En cours' },
    { value: 'signe', label: 'Signé' },
    { value: 'archive', label: 'Archivé' },
  ];

  /* ---------- Petits composants ---------- */
  function barre(taux, tone) {
    return h('div', { class: ['jauge', tone ? 'jauge-' + tone : ''] }, h('span', { style: { width: Math.round(Math.max(0, Math.min(1, taux)) * 100) + '%' } }));
  }
  function jourTexte(j) {
    if (j === null || j === undefined) return '';
    if (j === 0) return "aujourd'hui";
    if (j === 1) return 'demain';
    if (j < 0) return 'il y a ' + -j + ' j';
    return 'dans ' + j + ' j';
  }
  const ton = (t) => (t >= 0.999 ? 'ok' : t >= 0.5 ? 'mid' : 'low');
  const OBLIG = { oui: ['Obligatoire', 'bad'], non: ['Non requis', 'muted'], a_verifier: ['À vérifier', 'warn'] };
  const ETAT_DIAG = { valide: ['Reçu', 'ok'], perime: ['Périmé', 'bad'], manquant: ['À obtenir', 'warn'], a_verifier: ['À préciser', 'muted'], na: ['—', 'muted'] };
  const COURT = { dpe: 'DPE', amiante: 'Amiante', plomb: 'Plomb', electricite: 'Électricité', gaz: 'Gaz', termites: 'Termites', merule: 'Mérule', erp: 'ERP', assainissement: 'Assainissement', carrez: 'Carrez', bruit: 'Bruit', audit: 'Audit énergétique' };
  const chip = (texte, tone) => h('span', { class: ['chip', tone ? 'chip-' + tone : ''] }, texte);

  /* ---------- Cadre ---------- */
  function cadre(entete, actions, contenu, retour, onglets) {
    return h('div', { class: 'sim theme-dossiers' },
      h('header', { class: 'sim-top' },
        h('div', { class: 'sim-top-inner' },
          h('a', { class: 'back', href: retour || '#/', title: retour ? 'Retour aux dossiers' : "Retour à l'accueil" }, ui.icon('back', 20), h('span', null, retour ? 'Dossiers' : 'Accueil')),
          h('div', { class: 'sim-title' },
            h('span', { class: 'app-glyph app-glyph-sm', style: { background: app.gradient } }, ui.icon(app.icon, 18)),
            h('div', null, entete)),
          h('div', { class: 'toolbar' }, actions)),
        onglets ? h('div', { class: 'sim-tabs-inner' }, onglets) : null),
      contenu);
  }

  /* ---------- Stockage : bandeau ---------- */
  function bandeauStockage(rafraichir) {
    const st = S().etat;
    if (st.mode === 'partage' && st.permission === 'ok') return null;
    if (st.mode === 'partage') {
      return ui.note(h('div', { class: 'bandeau' },
        h('span', null, 'Dossier partagé « ' + st.nom + ' » : le navigateur demande votre accord pour y accéder.'),
        ui.button('Autoriser l\'accès', { variant: 'primary', small: true, onClick: async () => { await S().reconnecter(); rafraichir(); } })), 'warn');
    }
    if (!S().partageDisponible()) {
      return ui.note('Les dossiers sont enregistrés dans le navigateur de ce poste. Pour les partager avec vos collègues, ouvrez l\'Atelier avec Chrome ou Edge : vous pourrez choisir un dossier sur le réseau de l\'étude.');
    }
    return ui.note(h('div', { class: 'bandeau' },
      h('span', null, 'Les dossiers sont enregistrés sur ce poste. Pour travailler à plusieurs, choisissez un dossier sur le réseau de l\'étude (lecteur partagé) : chaque collègue choisit le même.'),
      ui.button('Choisir le dossier partagé', { variant: 'soft', small: true, icon: 'open', onClick: () => choisirPartage(rafraichir) })));
  }
  async function choisirPartage(rafraichir) {
    try {
      const avant = S().nbLocaux();
      await S().choisirDossier();
      if (avant > 0 && await ui.confirm('Copier les dossiers de ce poste ?', avant + ' dossier(s) sont enregistrés sur ce poste. Les copier dans le dossier partagé ?', 'Copier')) {
        const r = await S().copierVersPartage();
        ui.toast(r.copies + ' dossier(s) copié(s) dans le dossier partagé.');
      } else ui.toast('Dossier partagé choisi.');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      ui.toast('Choix du dossier impossible : ' + (e.message || e), 'error');
    }
    rafraichir();
  }
  async function menuStockage(rafraichir) {
    const st = S().etat;
    const initiales = ui.textInput({ value: S().utilisateur(), placeholder: 'ex. : MT', onChange: (v) => S().definirUtilisateur(v.trim()) });
    const choix = await ui.dialog('Enregistrement des dossiers', h('div', { class: 'stack-sm' },
      h('p', null, st.mode === 'partage' ? 'Les dossiers sont enregistrés dans le dossier partagé « ' + st.nom + ' ».' : 'Les dossiers sont enregistrés dans le navigateur de ce poste.'),
      h('p', { class: 'small muted' }, 'Le dossier partagé est un dossier du réseau de l\'étude (lecteur réseau, serveur ou NAS) que chaque collègue choisit une fois sur son poste. Un fichier y est créé par dossier.'),
      ui.field('Vos initiales', initiales, { help: 'Affichées dans « modifié par » pour vos collègues.' })),
    [
      { label: 'Fermer', value: null, variant: 'ghost' },
      st.mode === 'partage' ? { label: 'Revenir à ce poste', value: 'poste', variant: 'ghost' } : null,
      S().partageDisponible() ? { label: st.mode === 'partage' ? 'Changer de dossier partagé' : 'Choisir le dossier partagé', value: 'partage', variant: 'primary', icon: 'open' } : null,
    ].filter(Boolean));
    if (choix === 'partage') await choisirPartage(rafraichir);
    if (choix === 'poste') { await S().passerSurCePoste(); rafraichir(); }
  }

  /* ---------- Tableau de bord ---------- */
  const filtres = { type: 'tous', statut: 'en_cours', texte: '' };

  async function tableauDeBord(container) {
    const corps = h('div', { class: 'dash' });
    const st = S().etat;
    const rafraichir = () => tableauDeBord(container);
    container.replaceChildren(cadre([h('h1', null, app.title), h('p', { class: 'sim-ref' }, 'Pièces, diagnostics et échéances de chaque dossier')], [
      ui.button(st.mode === 'partage' ? 'Partagé' : 'Sur ce poste', { icon: st.mode === 'partage' ? 'users' : 'lock', variant: 'ghost', onClick: () => menuStockage(rafraichir), title: 'Où sont enregistrés les dossiers' }),
      ui.button('Nouveau dossier', { icon: 'plus', variant: 'ghost', onClick: () => creer(container) }),
      ui.button('Importer un mail ou un document', { icon: 'mail', variant: 'primary', onClick: () => importer(null) }),
      h('a', { class: 'btn btn-ghost btn-icon', href: '#/parametres/dossiers', title: 'Paramètres : listes de pièces, zones termites', 'aria-label': 'Paramètres' }, ui.icon('settings', 18)),
    ], h('div', { class: 'dash-wrap' }, corps)));

    let liste = [];
    let erreur = null;
    try {
      liste = S().actif() ? (await S().lister()).map(normaliser) : [];
    } catch (e) {
      erreur = e.message;
    }
    const etats = new Map(liste.map((d) => [d.id, etatDe(d)]));

    // Glisser-déposer d'un mail sur le tableau de bord.
    corps.ondragover = (e) => { e.preventDefault(); corps.classList.add('depot'); };
    corps.ondragleave = () => corps.classList.remove('depot');
    corps.ondrop = (e) => {
      e.preventDefault();
      corps.classList.remove('depot');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importer(null, f);
    };

    function rendre() {
      const t = filtres.texte.trim().toLowerCase();
      const visibles = liste.filter((d) => (filtres.type === 'tous' || d.type === filtres.type)
        && (filtres.statut === 'tous' || (d.statut || 'en_cours') === filtres.statut)
        && (!t || JSON.stringify([titre(d), d.bien, d.vendeurs, d.acquereurs, d.defunt, d.agence]).toLowerCase().includes(t)));
      visibles.sort((a, b) => {
        const pa = etats.get(a.id).prochaine, pb = etats.get(b.id).prochaine;
        if (pa && pb) return pa.date < pb.date ? -1 : 1;
        if (pa || pb) return pa ? -1 : 1;
        return (b.modifieLe || '') < (a.modifieLe || '') ? -1 : 1;
      });
      const enCours = liste.filter((d) => (d.statut || 'en_cours') === 'en_cours');
      const proches = enCours.filter((d) => { const p = etats.get(d.id).prochaine; return p && p.jours !== null && p.jours <= 15; }).length;
      const relances = enCours.reduce((n, d) => n + etats.get(d.id).alertes.filter((a) => a.niveau === 'faible').length, 0);
      const fortes = enCours.filter((d) => etats.get(d.id).alertes.some((a) => a.niveau === 'fort')).length;

      grille.replaceChildren(...(visibles.length ? visibles.map((d) => carteDossier(d, etats.get(d.id))) : [h('div', { class: 'dash-vide' },
        ui.icon('dossiers', 40),
        h('p', null, liste.length ? 'Aucun dossier ne correspond aux filtres.' : 'Aucun dossier pour l\'instant.'),
        liste.length ? null : h('p', { class: 'small muted' }, 'Importez le mail d\'ouverture de l\'agence (glissez-le ici depuis Outlook ou utilisez le bouton « Importer ») ou créez un dossier.'))]));
      stats.replaceChildren(
        ui.stat('Dossiers en cours', String(enCours.length), null, 'strong'),
        ui.stat('Signatures sous 15 jours', String(proches), null, proches ? 'res' : ''),
        ui.stat('Dossiers en alerte', String(fortes), null, fortes ? 'bad' : ''),
        ui.stat('Pièces à relancer', String(relances), null, relances ? 'don' : ''));
    }
    const grille = h('div', { class: 'dash-grille' });
    const stats = h('div', { class: 'bilan dash-stats' });
    const recherche = ui.textInput({ value: filtres.texte, placeholder: 'Rechercher un nom, une commune…', onChange: (v) => { filtres.texte = v; rendre(); } });
    corps.append(
      bandeauStockage(rafraichir) || '',
      erreur ? ui.note(erreur, 'warn') : '',
      stats,
      h('div', { class: 'dash-filtres' },
        ui.segmented({ value: filtres.type, small: true, options: [{ value: 'tous', label: 'Tous' }, { value: 'vente', label: 'Ventes' }, { value: 'succession', label: 'Successions' }], onChange: (v) => { filtres.type = v; rendre(); } }),
        ui.segmented({ value: filtres.statut, small: true, options: [{ value: 'en_cours', label: 'En cours' }, { value: 'signe', label: 'Signés' }, { value: 'archive', label: 'Archivés' }, { value: 'tous', label: 'Tous' }], onChange: (v) => { filtres.statut = v; rendre(); } }),
        h('div', { class: 'dash-recherche' }, recherche)),
      grille);
    rendre();
  }

  function carteDossier(d, r) {
    const b = d.bien || {};
    const lieu = d.type === 'succession' ? (d.defunt && d.defunt.dateDeces ? 'Décès le ' + fmtDate(d.defunt.dateDeces) : '') : [b.commune, b.codePostal ? '(' + b.codePostal.slice(0, 2) + ')' : ''].filter(Boolean).join(' ');
    const fortes = r.alertes.filter((a) => a.niveau === 'fort');
    const diagChips = r.diagnostics.filter((x) => x.obligatoire === 'oui').map((x) => {
      return chip(COURT[x.code], x.etat === 'valide' ? 'ok' : x.etat === 'perime' ? 'bad' : x.code === 'termites' ? 'bad' : 'warn');
    });
    const etapeCour = (E().ETAPES[r.type].find((e) => e.id === r.etapeCourante) || {}).libelle;
    return h('a', { class: ['dossier-carte', fortes.length ? 'dossier-alerte' : '', d.statut !== 'en_cours' ? 'dossier-clos' : ''], href: '#/dossiers/' + encodeURIComponent(d.id) },
      h('div', { class: 'dc-haut' },
        chip(d.type === 'succession' ? 'Succession' : 'Vente', d.type === 'succession' ? 'succ' : 'vente'),
        h('span', { class: 'dc-etape' }, d.statut === 'signe' ? 'Signé' : d.statut === 'archive' ? 'Archivé' : 'Étape : ' + etapeCour),
        fortes.length ? h('span', { class: 'dc-alerte', title: fortes.map((a) => a.texte).join('\n') }, ui.icon('alert', 16)) : null),
      h('h3', { class: 'dc-titre' }, titre(d)),
      h('p', { class: 'dc-lieu' }, lieu || ' '),
      h('div', { class: 'dc-etapes' }, r.etapes.map((e) => h('div', { class: ['dc-etape-ligne', e.id === r.etapeCourante ? 'courante' : ''] },
        h('span', { class: 'dc-etape-nom' }, e.libelle),
        barre(e.taux, ton(e.taux)),
        h('span', { class: 'dc-compte' }, e.recues + '/' + e.total)))),
      diagChips.length ? h('div', { class: 'dc-chips' }, diagChips) : null,
      h('div', { class: 'dc-bas' },
        r.prochaine ? h('span', { class: ['dc-date', r.prochaine.jours !== null && r.prochaine.jours <= 15 ? 'proche' : ''] }, ui.icon('calendar', 15), r.prochaine.libelle.replace('Signature de la ', '').replace(/^./, (c) => c.toUpperCase()) + ' le ' + fmtDate(r.prochaine.date) + ' · ' + jourTexte(r.prochaine.jours))
          : h('span', { class: 'dc-date muted' }, 'Aucune date fixée'),
        d.modifiePar ? h('span', { class: 'dc-par', title: 'Modifié par' }, d.modifiePar) : null));
  }

  async function creer() {
    const type = await ui.dialog('Nouveau dossier', 'Quel type de dossier ?', [
      { label: 'Annuler', value: null, variant: 'ghost' },
      { label: 'Succession', value: 'succession', variant: 'soft' },
      { label: 'Vente', value: 'vente', variant: 'primary' },
    ]);
    if (!type) return;
    const d = nouveau(type);
    await S().enregistrer(d);
    location.hash = '#/dossiers/' + encodeURIComponent(d.id);
  }

  // Import : nouveau dossier, ou complément du dossier ouvert (courant).
  async function importer(courant, fichier, apresFusion) {
    const r = await A.importDossier.importer(params(), !!courant, fichier);
    if (!r) return;
    const opts = { aujourdhui: todayISO(), source: r.lu.nom, uid };
    if (r.choix.cible === 'courant' && courant) {
      A.engines.extraction.fusionner(courant, r.res, r.choix.groupes, opts);
      if (apresFusion) apresFusion();
      ui.toast('Dossier complété à partir de « ' + r.lu.nom + ' ».');
      return;
    }
    const d = nouveau(r.res.type);
    A.engines.extraction.fusionner(d, r.res, r.choix.groupes, opts);
    if (/promesse|compromis/i.test(r.lu.sujet || '')) d.etape = 'promesse';
    await S().enregistrer(d);
    ui.toast('Dossier créé à partir de « ' + r.lu.nom + ' ».');
    location.hash = '#/dossiers/' + encodeURIComponent(d.id);
  }

  /* ---------- Fiche dossier ---------- */
  const ongletParDossier = {};

  async function fiche(container, id) {
    let d = await S().lire(id);
    if (!d) {
      ui.toast('Dossier introuvable.', 'error');
      location.hash = '#/dossiers';
      return;
    }
    d = normaliser(d);
    let onglet = ongletParDossier[id] || 'synthese';
    const enregistrement = h('span', { class: 'sim-ref' });
    const refEl = h('h1');
    const sousEl = h('p', { class: 'sim-ref' });
    let live = [];

    const majInfos = () => {
      refEl.textContent = titre(d);
      sousEl.textContent = (d.type === 'succession' ? 'Succession' : 'Vente') + (d.modifiePar ? ' — modifié par ' + d.modifiePar : '');
    };
    async function sauver(force) {
      try {
        const res = await S().enregistrer(d, force);
        if (res.conflit) {
          const c = res.conflit;
          const choix = await ui.dialog('Dossier modifié par un collègue', 'Ce dossier a été modifié' + (c.modifiePar ? ' par ' + c.modifiePar : '') + ' le '
            + new Date(c.modifieLe).toLocaleString('fr-FR') + ' pendant que vous le consultiez.', [
            { label: 'Recharger sa version', value: 'recharger', variant: 'ghost' },
            { label: 'Garder ma version', value: 'garder', variant: 'primary' },
          ]);
          if (choix === 'garder') return sauver(true);
          d = normaliser(c);
          rendre();
          return;
        }
        enregistrement.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        enregistrement.textContent = 'Enregistrement impossible : ' + e.message;
        ui.toast('Enregistrement impossible : ' + e.message, 'error');
      }
    }
    const sauverPlusTard = debounce(() => sauver(false), 700);
    const changed = () => {
      live.forEach((f) => f());
      majInfos();
      enregistrement.textContent = 'Modifications en cours…';
      sauverPlusTard();
    };
    const structure = () => { rendre(); enregistrement.textContent = 'Modifications en cours…'; sauverPlusTard(); };

    // Champs liés.
    const txt = (o, k, opts) => ui.textInput(Object.assign({}, opts, { value: o[k], onChange: (v) => { o[k] = v; changed(); } }));
    const num = (o, k, opts) => ui.numberInput(Object.assign({}, opts, { value: o[k], onChange: (v) => { o[k] = v; changed(); } }));
    const dat = (o, k, opts) => ui.dateInput(Object.assign({}, opts, { value: o[k], onChange: (v) => { o[k] = v; changed(); } }));
    const sel = (o, k, options, opts) => ui.selectInput(Object.assign({}, opts, { value: o[k] === undefined ? '' : o[k], options, onChange: (v) => { o[k] = v; (opts && opts.structural) ? structure() : changed(); } }));
    const seg = (o, k, options, opts) => ui.segmented({ value: o[k], options, small: true, onChange: (v) => { o[k] = v; (opts && opts.structural) ? structure() : changed(); } });
    const oui = (o, k, opts) => seg(o, k, [{ value: false, label: 'Non' }, { value: true, label: 'Oui' }], opts);
    const zone = (o, k, opts) => {
      const t = h('textarea', { class: 'input textarea', rows: (opts && opts.rows) || 4, placeholder: (opts && opts.placeholder) || '' });
      t.value = o[k] || '';
      t.addEventListener('input', () => { o[k] = t.value; changed(); });
      return t;
    };
    const vivant = (fn) => {
      const el = h('div');
      const maj = () => el.replaceChildren(...[].concat(fn(etatDe(d))).filter(Boolean));
      live.push(maj);
      maj();
      return el;
    };

    const ONGLETS = d.type === 'succession'
      ? [['synthese', 'Vue d\'ensemble'], ['defunt', 'Défunt et héritiers'], ['pieces', 'Pièces'], ['notes', 'Notes et documents']]
      : [['synthese', 'Vue d\'ensemble'], ['parties', 'Parties'], ['bien', 'Bien et prix'], ['pieces', 'Pièces'], ['diagnostics', 'Diagnostics'], ['notes', 'Notes et documents']];

    const tabs = h('nav', { class: 'tabs', role: 'tablist' });
    const main = h('div', { class: 'fiche-main' });
    const el = cadre([refEl, sousEl], [
      enregistrement,
      ui.button('Importer un mail', { icon: 'mail', variant: 'ghost', onClick: () => importer(d, null, () => structure()) }),
      ui.button('Imprimer', { icon: 'print', variant: 'ghost', onClick: () => imprimer(d) }),
      ui.button('Supprimer', { icon: 'trash', variant: 'ghost', iconOnly: true, onClick: async () => {
        if (!(await ui.confirm('Supprimer ce dossier ?', 'Le dossier « ' + titre(d) + ' » sera supprimé' + (S().etat.mode === 'partage' ? ' pour tous les collègues' : '') + '. Pour le garder sans l\'afficher, choisissez plutôt le statut « Archivé ».', 'Supprimer'))) return;
        await S().supprimer(d.id);
        ui.toast('Dossier supprimé.');
        location.hash = '#/dossiers';
      } }),
    ], h('div', { class: 'fiche-wrap' }, main), '#/dossiers', tabs);
    container.replaceChildren(el);

    // Glisser un mail sur la fiche : complément du dossier.
    main.ondragover = (e) => { e.preventDefault(); main.classList.add('depot'); };
    main.ondragleave = () => main.classList.remove('depot');
    main.ondrop = (e) => {
      e.preventDefault();
      main.classList.remove('depot');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importer(d, f, () => structure());
    };

    function rendre() {
      live = [];
      tabs.replaceChildren(...ONGLETS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(k === onglet), onclick: () => { onglet = k; ongletParDossier[id] = k; rendre(); window.scrollTo({ top: 0 }); } }, l)));
      const vues = { synthese, parties, bien, pieces, diagnostics, notes, defunt };
      main.replaceChildren(vues[onglet]());
      majInfos();
    }

    /* ----- Vue d'ensemble ----- */
    function synthese() {
      const entete = h('div', { class: 'fiche-entete' },
        h('div', { class: 'fiche-entete-g' },
          ui.field('Intitulé du dossier', ui.textInput({ value: d.reference, placeholder: E().reference(Object.assign({}, d, { reference: '' })) || 'ex. : DUPONT / MARTIN', onChange: (v) => { d.reference = v; changed(); } })),
          ui.field('Statut', seg(d, 'statut', STATUTS_DOSSIER)),
          ui.field('Étape en cours', seg(d, 'etape', E().ETAPES[d.type].map((e) => ({ value: e.id, label: e.libelle })), { structural: true }))));
      const dates = d.type === 'succession'
        ? h('div', { class: 'grid-3' },
          ui.field('Date du décès', dat(d.defunt, 'dateDeces')),
          ui.field('Rendez-vous de signature', dat(d.dates, 'rdv')))
        : h('div', { class: 'grid-3' },
          ui.field('Signature de la promesse', dat(d.dates, 'promesse')),
          ui.field('Signature de la vente', dat(d.dates, 'vente')),
          ui.field('Fin de la condition de prêt', dat(d.dates, 'conditionPret'), { optional: true }));
      return h('div', { class: 'stack' },
        ui.card(null, h('div', { class: 'stack' }, entete, dates)),
        vivant((r) => h('div', { class: 'synthese-grille' },
          ui.card('Avancement', h('div', { class: 'stack-sm' },
            r.etapes.map((e) => h('div', { class: ['avancement', e.id === r.etapeCourante ? 'courante' : ''] },
              h('div', { class: 'avancement-tete' }, h('strong', null, e.libelle), h('span', null, e.recues + ' reçue(s) sur ' + e.total + (e.demandees ? ' · ' + e.demandees + ' demandée(s)' : ''))),
              barre(e.taux, ton(e.taux)),
              e.manquantes + e.demandees > 0 ? h('ul', { class: 'manque' }, r.pieces.filter((x) => x.etape === e.id && (x.statut === 'manquante' || x.statut === 'demandee')).map((x) =>
                h('li', null, chip(x.statut === 'demandee' ? 'Demandée' : 'À obtenir', x.statut === 'demandee' ? 'info' : 'warn'), ' ', x.libelle))) : h('p', { class: 'small pos' }, 'Toutes les pièces sont reçues.'))),
            ui.button('Gérer les pièces', { small: true, variant: 'soft', onClick: () => { onglet = 'pieces'; rendre(); } }))),
          h('div', { class: 'stack' },
            ui.card('Alertes', r.alertes.length ? h('ul', { class: 'alertes' }, r.alertes.map((a) => h('li', { class: 'alerte-' + a.niveau }, ui.icon(a.niveau === 'faible' ? 'info' : 'alert', 16), h('span', null, a.texte))))
              : h('p', { class: 'small pos' }, 'Rien à signaler.')),
            ui.card('Échéances', r.echeances.length ? h('ul', { class: 'echeances' }, r.echeances.map((e) => h('li', { class: e.jours !== null && e.jours < 0 ? 'passe' : '' }, h('span', null, e.libelle), h('strong', null, fmtDate(e.date)), h('span', { class: 'muted' }, jourTexte(e.jours)))))
              : h('p', { class: 'small muted' }, 'Aucune date renseignée.')),
            d.type === 'vente' ? ui.card('Diagnostics', h('div', { class: 'stack-sm' }, h('div', { class: 'dc-chips' }, r.diagnostics.filter((x) => x.obligatoire !== 'non').map((x) => chip(COURT[x.code] + (x.obligatoire === 'a_verifier' ? ' ?' : ''), x.etat === 'valide' ? 'ok' : x.etat === 'perime' ? 'bad' : x.obligatoire === 'a_verifier' ? 'muted' : 'warn'))),
              h('p', { class: 'small muted' }, 'En couleur : obligatoires ; « ? » : à préciser (caractéristiques du bien ou arrêté de la commune).')),
            { actions: ui.button('Détail', { small: true, variant: 'ghost', onClick: () => { onglet = 'diagnostics'; rendre(); } }) }) : null,
            resume()))));
    }
    function resume() {
      if (d.type === 'succession') {
        return ui.card('En bref', h('dl', { class: 'resume-liste' },
          h('dt', null, 'Défunt'), h('dd', null, d.defunt.nom || '—'),
          h('dt', null, 'Héritiers'), h('dd', null, d.heritiers.map((x) => x.nom).filter(Boolean).join(', ') || '—')));
      }
      const b = d.bien;
      const pers = (l) => l.map((x) => (x.civilite ? x.civilite + ' ' : '') + x.nom + (x.qualite === 'societe' && x.representants ? ' (représentée par ' + x.representants + ')' : '')).filter((x) => x.trim()).join(' ; ') || '—';
      return ui.card('En bref', h('dl', { class: 'resume-liste' },
        h('dt', null, 'Vendeurs'), h('dd', null, pers(d.vendeurs)),
        h('dt', null, 'Acquéreurs'), h('dd', null, pers(d.acquereurs)),
        h('dt', null, 'Bien'), h('dd', null, [b.adresse, b.codePostal, b.commune].filter(Boolean).join(' ') || '—', b.cadastre ? h('div', { class: 'small muted' }, 'Cadastre ' + b.cadastre + (b.copro ? ' · copropriété' : '')) : null),
        h('dt', null, 'Prix'), h('dd', null, isNum(d.prix.prix) ? fmtEuro(d.prix.prix) + (isNum(d.prix.honoraires) ? ' + ' + fmtEuro(d.prix.honoraires) + ' d\'honoraires (charge ' + (d.prix.chargeHonoraires === 'acquereur' ? 'acquéreur' : 'vendeur') + ')' : '') : '—'),
        h('dt', null, 'Financement'), h('dd', null, d.financement.pret === true ? 'Prêt' + (isNum(d.financement.montantPret) ? ' de ' + fmtEuro(d.financement.montantPret) : '') : d.financement.pret === false ? 'Sans prêt' : '—',
          d.financement.texte ? h('div', { class: 'small muted' }, d.financement.texte) : null),
        h('dt', null, 'Notaires'), h('dd', null, d.notaires.map((n) => n.nom + (n.ville ? ' (' + n.ville + ')' : '') + (n.pour ? ' pour ' + n.pour : '')).join(' ; ') || '—'),
        h('dt', null, 'Agence'), h('dd', null, [d.agence.nom, d.agence.contact, d.agence.telephone].filter(Boolean).join(' — ') || '—')));
    }

    /* ----- Parties ----- */
    const SITUATIONS = [{ value: '', label: '—' }, { value: 'celibataire', label: 'Célibataire' }, { value: 'marie', label: 'Marié(e)' }, { value: 'pacse', label: 'Pacsé(e)' }, { value: 'divorce', label: 'Divorcé(e)' }, { value: 'veuf', label: 'Veuf / veuve' }];
    function personnes(liste, libelle, avecSociete) {
      return h('div', { class: 'stack-sm' },
        liste.map((x, i) => h('div', { class: 'personne' },
          h('div', { class: 'personne-tete' },
            avecSociete ? seg(x, 'qualite', [{ value: 'personne', label: 'Personne' }, { value: 'societe', label: 'Société' }], { structural: true }) : null,
            ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { liste.splice(i, 1); structure(); } })),
          h('div', { class: 'grid-3' },
            x.qualite === 'societe' ? null : ui.field('Civilité', sel(x, 'civilite', [{ value: '', label: '—' }, { value: 'M.', label: 'M.' }, { value: 'Mme', label: 'Mme' }])),
            ui.field(x.qualite === 'societe' ? 'Dénomination' : 'Nom et prénoms', txt(x, 'nom', { structural: false })),
            x.qualite === 'societe' ? ui.field('Représentée par', txt(x, 'representants')) : ui.field('Situation familiale', sel(x, 'situation', SITUATIONS, { structural: true })),
            x.lien !== undefined ? ui.field('Lien avec le défunt', txt(x, 'lien')) : null,
            ui.field('Adresse', txt(x, 'adresse')),
            ui.field('Code postal', txt(x, 'codePostal')),
            ui.field('Commune', txt(x, 'commune')),
            ui.field('Téléphone', txt(x, 'telephone')),
            ui.field('E-mail', txt(x, 'email')),
            x.qualite === 'societe' ? null : ui.field('Profession', txt(x, 'profession'))))),
        ui.button('Ajouter ' + libelle, { icon: 'plus', variant: 'soft', small: true, onClick: () => { liste.push(Object.assign(nouvellePersonne(), d.type === 'succession' ? { lien: '' } : {})); structure(); } }));
    }
    function parties() {
      return h('div', { class: 'stack' },
        ui.card('Vendeurs', personnes(d.vendeurs, 'un vendeur', true)),
        ui.card('Acquéreurs', personnes(d.acquereurs, 'un acquéreur', true)),
        ui.card('Notaires', h('div', { class: 'stack-sm' },
          d.notaires.map((n, i) => h('div', { class: 'row-line row-notaire' },
            ui.field('Notaire', txt(n, 'nom')), ui.field('Ville', txt(n, 'ville')), ui.field('Pour', txt(n, 'pour')),
            ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { d.notaires.splice(i, 1); structure(); } }))),
          ui.button('Ajouter un notaire', { icon: 'plus', variant: 'soft', small: true, onClick: () => { d.notaires.push({ id: uid('n'), nom: '', ville: '', pour: '' }); structure(); } }))),
        ui.card('Agence', h('div', { class: 'grid-3' },
          ui.field('Agence', txt(d.agence, 'nom')), ui.field('Interlocuteur', txt(d.agence, 'contact')), ui.field('Mandat', txt(d.agence, 'mandat')),
          ui.field('Téléphone', txt(d.agence, 'telephone')), ui.field('E-mail', txt(d.agence, 'email')))));
    }

    /* ----- Bien et prix ----- */
    function bien() {
      const b = d.bien;
      return h('div', { class: 'stack' },
        ui.card('Le bien', h('div', { class: 'stack' },
          h('div', { class: 'grid-3' },
            ui.field('Adresse', txt(b, 'adresse')), ui.field('Code postal', txt(b, 'codePostal')), ui.field('Commune', txt(b, 'commune')),
            ui.field('Type', sel(b, 'type', [{ value: '', label: '—' }, { value: 'maison', label: 'Maison' }, { value: 'appartement', label: 'Appartement' }, { value: 'immeuble', label: 'Immeuble' }, { value: 'local', label: 'Local professionnel' }, { value: 'terrain', label: 'Terrain' }], { structural: true })),
            ui.field('Cadastre', txt(b, 'cadastre', { placeholder: 'ex. : BK 34' })), ui.field('Contenance', txt(b, 'contenance')),
            ui.field('Surface habitable', num(b, 'surface', { suffix: 'm²' })), ui.field('Lots', txt(b, 'lots'), { optional: true })),
          ui.field('Description', txt(b, 'description'), { wide: true }),
          h('div', { class: 'grid-3' },
            ui.field('Copropriété', oui(b, 'copro', { structural: true })),
            ui.field('Travaux récents (moins de 10 ans)', oui(b, 'travauxRecents', { structural: true })),
            ui.field('Permis de construire à produire', oui(b, 'permis', { structural: true }))))),
        ui.card('Prix et financement', h('div', { class: 'grid-3' },
          ui.field('Prix de vente (net vendeur)', num(d.prix, 'prix', { suffix: '€' })),
          ui.field('Honoraires de l\'agence', num(d.prix, 'honoraires', { suffix: '€' })),
          ui.field('À la charge', seg(d.prix, 'chargeHonoraires', [{ value: 'vendeur', label: 'Vendeur' }, { value: 'acquereur', label: 'Acquéreur' }])),
          ui.field('Prêt', oui(d.financement, 'pret', { structural: true })),
          d.financement.pret ? ui.field('Montant du prêt', num(d.financement, 'montantPret', { suffix: '€' })) : null,
          ui.field('Dépôt de garantie', num(d.financement, 'depotGarantie', { suffix: '€' })),
          ui.field('Conditions particulières', txt(d.financement, 'texte'), { wide: true }))));
    }

    /* ----- Pièces ----- */
    function pieces() {
      const cond = Object.fromEntries(E().CONDITIONS.map((c) => [c.id, c.libelle]));
      const r = etatDe(d);
      const situation = d.type === 'vente'
        ? ui.card('Situation du dossier', h('div', { class: 'grid-3' },
          ui.field('Copropriété', oui(d.bien, 'copro', { structural: true })),
          ui.field('Prêt', oui(d.financement, 'pret', { structural: true })),
          ui.field('Travaux récents', oui(d.bien, 'travauxRecents', { structural: true })),
          ui.field('Permis de construire à produire', oui(d.bien, 'permis', { structural: true }))),
        { subtitle: 'Ces réponses ajoutent ou retirent les pièces concernées. Une partie société ou mariée se renseigne dans l\'onglet Parties.' })
        : ui.card('Situation du dossier', h('div', { class: 'grid-3' },
          ui.field('Situation du défunt', sel(d.defunt, 'situation', SITUATIONS, { structural: true })),
          ui.field('Testament', oui(d.defunt, 'testament', { structural: true }))));
      const etapes = E().ETAPES[d.type].map((e) => {
        const liste = r.pieces.filter((x) => x.etape === e.id);
        const st = r.etapes.find((x) => x.id === e.id);
        return ui.card(e.libelle, h('div', { class: 'pieces' },
          liste.map((x) => {
            const suivi = d.pieces[x.id] = d.pieces[x.id] || {};
            const auto = x.auto === 'diagnostics';
            return h('div', { class: ['piece', 'piece-' + x.statut] },
              h('div', { class: 'piece-nom' },
                h('span', null, x.libelle),
                x.condition ? h('span', { class: 'piece-cond' }, cond[x.condition]) : null,
                auto ? h('span', { class: 'piece-cond' }, x.detail + ' — onglet Diagnostics') : null),
              auto ? h('div', { class: 'piece-auto' }, chip(x.statut === 'recue' ? 'Complet' : 'Incomplet', x.statut === 'recue' ? 'ok' : 'warn'),
                ui.button('Voir', { small: true, variant: 'ghost', onClick: () => { onglet = 'diagnostics'; rendre(); } }))
                : ui.segmented({ value: x.statut, small: true, options: E().STATUTS.map((s) => ({ value: s.id, label: s.libelle })), onChange: (v) => {
                  suivi.statut = v;
                  if ((v === 'demandee' || v === 'recue') && !suivi.date) suivi.date = todayISO();
                  structure();
                } }),
              auto ? h('span') : ui.dateInput({ value: suivi.date || '', ariaLabel: 'Date', onChange: (v) => { suivi.date = v; changed(); } }),
              ui.textInput({ value: suivi.note || '', placeholder: 'Note', onChange: (v) => { suivi.note = v; changed(); } }),
              x.ajoutee ? ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { d.piecesAjoutees = d.piecesAjoutees.filter((y) => y.id !== x.id); delete d.pieces[x.id]; structure(); } }) : h('span'));
          }),
          ui.button('Ajouter une pièce', { icon: 'plus', variant: 'soft', small: true, onClick: async () => {
            const champ = ui.textInput({ value: '', placeholder: 'ex. : Attestation d\'assurance', onChange: () => {} });
            const ok = await ui.dialog('Ajouter une pièce — ' + e.libelle, h('div', null, champ), [{ label: 'Annuler', value: false, variant: 'ghost' }, { label: 'Ajouter', value: true, variant: 'primary' }]);
            if (ok && champ.value.trim()) { d.piecesAjoutees.push({ id: uid('pc'), libelle: champ.value.trim(), etape: e.id, ajoutee: true }); structure(); }
          } })),
        { subtitle: st.recues + ' reçue(s) sur ' + st.total + (st.demandees ? ', ' + st.demandees + ' demandée(s)' : ''), actions: barre(st.taux, ton(st.taux)) });
      });
      return h('div', { class: 'stack' }, situation, ...etapes,
        h('p', { class: 'small muted' }, 'Les listes de pièces se modifient pour toute l\'étude dans Paramètres → Suivi des dossiers.'));
    }

    /* ----- Diagnostics ----- */
    function diagnostics() {
      const b = d.bien;
      const caracteres = ui.card('Caractéristiques du bien', h('div', { class: 'grid-3' },
        ui.field('Commune', h('div', { class: 'readonly' }, [b.codePostal, b.commune].filter(Boolean).join(' ') || '— (onglet Bien)')),
        ui.field('Type de bien', sel(b, 'type', [{ value: '', label: '—' }, { value: 'maison', label: 'Maison' }, { value: 'appartement', label: 'Appartement' }, { value: 'immeuble', label: 'Immeuble' }, { value: 'local', label: 'Local professionnel' }, { value: 'terrain', label: 'Terrain' }], { structural: true })),
        ui.field('Permis de construire', sel(b, 'construction', [{ value: '', label: '—' }, { value: 'avant1949', label: 'Construit avant 1949' }, { value: '1949-1997', label: 'De 1949 à juin 1997' }, { value: 'apres1997', label: 'Après le 1er juillet 1997' }], { structural: true })),
        ui.field('Installation électrique', sel(b, 'electricite', [{ value: '', label: '—' }, { value: 'plus15', label: 'Plus de 15 ans' }, { value: 'moins15', label: 'Moins de 15 ans' }], { structural: true })),
        ui.field('Installation de gaz', sel(b, 'gaz', [{ value: '', label: '—' }, { value: 'plus15', label: 'Plus de 15 ans' }, { value: 'moins15', label: 'Moins de 15 ans' }, { value: 'aucune', label: 'Pas de gaz' }], { structural: true })),
        ui.field('Assainissement', sel(b, 'assainissement', [{ value: '', label: '—' }, { value: 'collectif', label: 'Tout-à-l\'égout' }, { value: 'non_collectif', label: 'Fosse / non collectif' }], { structural: true })),
        ui.field('Classe du DPE', sel(b, 'dpeClasse', ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map((x) => ({ value: x, label: x || '—' })), { structural: true })),
        ui.field('Zone de bruit d\'aérodrome', seg(b, 'zoneBruit', [{ value: undefined, label: '?' }, { value: false, label: 'Non' }, { value: true, label: 'Oui' }], { structural: true })),
        ui.field('Copropriété', oui(b, 'copro', { structural: true }))));
      const r = etatDe(d);
      const AVEC_RESULTAT = { amiante: 1, plomb: 1 };
      const lignes = r.diagnostics.map((x) => {
        const s = d.diagnostics[x.code] = d.diagnostics[x.code] || {};
        const [ol, ot] = OBLIG[x.obligatoire];
        const [el, et] = ETAT_DIAG[x.etat];
        const recu = h('input', { type: 'checkbox', checked: !!s.recu, 'aria-label': 'Reçu', onchange: () => { s.recu = recu.checked; structure(); } });
        return h('div', { class: ['diag', 'diag-' + x.obligatoire] },
          h('div', { class: 'diag-nom' }, h('strong', null, x.libelle), h('span', { class: 'small muted' }, x.motif)),
          chip(ol, ot),
          h('label', { class: 'diag-recu' }, recu, 'Reçu'),
          ui.dateInput({ value: s.date || '', ariaLabel: 'Date du diagnostic', onChange: (v) => { s.date = v; structure(); } }),
          AVEC_RESULTAT[x.code] ? ui.selectInput({ value: s.resultat || '', options: [{ value: '', label: 'Résultat' }, { value: 'negatif', label: 'Négatif' }, { value: 'positif', label: 'Positif' }], onChange: (v) => { s.resultat = v; structure(); } }) : h('span'),
          h('div', { class: 'diag-etat' }, x.obligatoire === 'non' && !x.recu ? null : chip(el, et),
            x.recu && x.date ? h('span', { class: 'small muted' }, x.finValidite ? 'valable jusqu\'au ' + fmtDate(x.finValidite) : 'durée illimitée') : null));
      });
      const ref = d.etape === 'vente' ? d.dates.vente : d.dates.promesse || d.dates.vente;
      return h('div', { class: 'stack' },
        caracteres,
        ui.card('Diagnostics', h('div', { class: 'diags' }, lignes),
          { subtitle: ref ? 'Validité contrôlée à la date de signature (' + fmtDate(ref) + ').' : 'Renseignez la date de signature (Vue d\'ensemble) pour contrôler la validité.' }),
        enLigne());
    }
    function enLigne() {
      const b = d.bien;
      const resultat = h('div', { class: 'stack-sm' }, d.georisques ? georisquesVue(d.georisques) : null);
      return ui.card('Recherches en ligne', h('div', { class: 'stack-sm' },
        h('p', { class: 'small' }, 'Zones termites et mérule : liste tenue dans Paramètres (arrêtés préfectoraux). Pour l\'état des risques, Géorisques donne les risques connus de la commune.'),
        h('div', { class: 'card-actions' },
          ui.button('Interroger Géorisques', { icon: 'search', variant: 'soft', small: true, onClick: async () => {
            resultat.replaceChildren(h('p', { class: 'small muted' }, 'Recherche en cours…'));
            try {
              d.georisques = await rechercheGeorisques(b);
              changed();
              resultat.replaceChildren(georisquesVue(d.georisques));
            } catch (e) {
              resultat.replaceChildren(ui.note('Recherche impossible depuis ce poste (' + e.message + '). Utilisez le lien Géorisques ci-contre.', 'warn'));
            }
          } }),
          h('a', { class: 'btn btn-ghost btn-sm', href: 'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi', target: '_blank', rel: 'noopener' }, ui.icon('link', 16), h('span', null, 'Ouvrir Géorisques')),
          h('a', { class: 'btn btn-ghost btn-sm', href: 'https://www.cerema.fr/fr/actualites/cartographie-nationale-termites-merules', target: '_blank', rel: 'noopener' }, ui.icon('link', 16), h('span', null, 'Carte termites et mérule (Cerema)'))),
        resultat));
    }

    /* ----- Succession ----- */
    function defunt() {
      const df = d.defunt;
      return h('div', { class: 'stack' },
        ui.card('Le défunt', h('div', { class: 'grid-3' },
          ui.field('Nom et prénoms', txt(df, 'nom')), ui.field('Date du décès', dat(df, 'dateDeces')), ui.field('Lieu du décès', txt(df, 'lieuDeces')),
          ui.field('Dernier domicile', txt(df, 'domicile')), ui.field('Situation', sel(df, 'situation', SITUATIONS, { structural: true })), ui.field('Testament', oui(df, 'testament', { structural: true })))),
        ui.card('Héritiers et ayants droit', personnes(d.heritiers, 'un héritier', false)),
        ui.card('Notaires', h('div', { class: 'stack-sm' },
          d.notaires.map((n, i) => h('div', { class: 'row-line row-notaire' },
            ui.field('Notaire', txt(n, 'nom')), ui.field('Ville', txt(n, 'ville')), ui.field('Pour', txt(n, 'pour')),
            ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { d.notaires.splice(i, 1); structure(); } }))),
          ui.button('Ajouter un notaire', { icon: 'plus', variant: 'soft', small: true, onClick: () => { d.notaires.push({ id: uid('n'), nom: '', ville: '', pour: '' }); structure(); } }))));
    }

    /* ----- Notes ----- */
    function notes() {
      return h('div', { class: 'stack' },
        ui.card('Notes', zone(d, 'notes', { rows: 8, placeholder: 'Points à suivre, échanges avec l\'agence, le syndic…' })),
        ui.card('Documents reçus', d.documents.length ? ui.table([
          { label: 'Date', render: (x) => fmtDate(x.date) },
          { label: 'Document', render: (x) => x.fichier + (x.lu && x.source ? ' — « ' + x.source + ' »' : '') },
          { label: 'Classé dans', render: (x) => (x.lu ? 'lu par l\'Atelier' : x.piece ? (etatDe(d).pieces.find((p) => p.id === x.piece) || {}).libelle || x.piece : '—') },
        ], d.documents.slice().reverse(), { compact: true }) : h('p', { class: 'small muted' }, 'Les mails et pièces jointes importés apparaissent ici.'),
        { subtitle: 'Seuls les noms des fichiers sont conservés : les pièces restent dans votre messagerie ou votre logiciel de rédaction.' }));
    }

    rendre();
  }

  /* ---------- Géorisques ---------- */
  async function json(url) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => ctrl && ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctrl ? ctrl.signal : undefined });
      if (!r.ok) throw new Error('réponse ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  async function rechercheGeorisques(b) {
    const q = [b.adresse, b.codePostal, b.commune].filter(Boolean).join(' ');
    if (!q.trim()) throw new Error('adresse du bien non renseignée');
    const adr = await json('https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(q));
    const f = adr.features && adr.features[0];
    if (!f) throw new Error('adresse introuvable');
    const insee = f.properties.citycode;
    const [lon, lat] = f.geometry.coordinates;
    const base = 'https://georisques.gouv.fr/api/v1/';
    const essai = (p) => p.catch(() => null);
    const [risques, sismique, radon, rga] = await Promise.all([
      json(base + 'gaspar/risques?code_insee=' + insee),
      essai(json(base + 'zonage_sismique?code_insee=' + insee)),
      essai(json(base + 'radon?code_insee=' + insee)),
      essai(json(base + 'rga?latlon=' + lon + ',' + lat)),
    ]);
    const det = ((risques && risques.data && risques.data[0]) || {}).risques_detail || [];
    const s = ((sismique && sismique.data && sismique.data[0]) || {});
    const rd = ((radon && radon.data && radon.data[0]) || {});
    return {
      date: todayISO(), adresse: f.properties.label, insee,
      risques: det.map((x) => x.libelle_risque_long).filter(Boolean),
      sismicite: s.zone_sismicite || '',
      radon: rd.classe_potentiel ? 'catégorie ' + rd.classe_potentiel : '',
      argiles: rga ? rga.exposition || '' : '',
    };
  }
  function georisquesVue(g) {
    return h('div', { class: 'georisques' },
      h('p', { class: 'small muted' }, 'Géorisques, consulté le ' + fmtDate(g.date) + ' — ' + g.adresse),
      h('ul', { class: 'bullets small' },
        g.risques.length ? g.risques.map((x) => h('li', null, x)) : h('li', null, 'Aucun risque recensé pour la commune.'),
        g.sismicite ? h('li', null, 'Sismicité : zone ' + g.sismicite) : null,
        g.radon ? h('li', null, 'Radon : ' + g.radon) : null,
        g.argiles ? h('li', null, 'Retrait-gonflement des argiles : ' + g.argiles) : null));
  }

  /* ---------- Impression ---------- */
  function imprimer(d) {
    const r = etatDe(d);
    const lib = (s) => (E().STATUTS.find((x) => x.id === s) || {}).libelle || s;
    const body = [];
    E().ETAPES[d.type].forEach((e) => {
      body.push(h('h2', null, e.libelle));
      body.push(ui.table([
        { label: 'Pièce', render: (x) => x.libelle },
        { label: 'État', render: (x) => lib(x.statut) },
        { label: 'Date', render: (x) => fmtDate(x.date) },
        { label: 'Note', render: (x) => x.note || x.detail || '' },
      ], r.pieces.filter((x) => x.etape === e.id && x.statut !== 'na'), { compact: true }));
    });
    if (r.diagnostics.length) {
      body.push(h('h2', null, 'Diagnostics'));
      body.push(ui.table([
        { label: 'Diagnostic', render: (x) => x.libelle },
        { label: 'Obligatoire', render: (x) => OBLIG[x.obligatoire][0] },
        { label: 'État', render: (x) => (x.obligatoire === 'non' && !x.recu ? '' : ETAT_DIAG[x.etat][0]) },
        { label: 'Validité', render: (x) => (x.recu && x.date ? (x.finValidite ? 'jusqu\'au ' + fmtDate(x.finValidite) : 'illimitée') : '') },
      ], r.diagnostics.filter((x) => x.obligatoire !== 'non' || x.recu), { compact: true }));
    }
    if (r.alertes.length) body.push(h('h2', null, 'Alertes'), h('ul', { class: 'bullets' }, r.alertes.map((a) => h('li', null, a.texte))));
    ui.print(ui.printDoc({
      title: 'Suivi du dossier — ' + titre(d),
      subtitle: d.type === 'succession' ? 'Succession' : [d.bien.adresse, d.bien.codePostal, d.bien.commune].filter(Boolean).join(' '),
      meta: [h('div', { class: 'kv' }, h('span', null, 'Édité le'), h('strong', null, fmtDate(todayISO())))],
      body,
      footer: 'Liste établie d\'après les informations saisies ; les obligations de diagnostic sont à confirmer au regard de la situation du bien.',
    }), 'Suivi ' + titre(d));
  }

  /* ---------- Montage ---------- */
  let initialise = false;
  async function mount(container, arg) {
    if (!initialise) {
      await S().init();
      initialise = true;
    }
    if (arg) fiche(container, arg);
    else tableauDeBord(container);
  }

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
