/*
 * Application « Succession & donation » : patrimoine par branche (biens propres et communs),
 * donations envisagées, comparaison des hypothèses A, B, C et D parent par parent.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid, fmtEuro, fmtPct, fmtDate, todayISO, isNum } = A.util;
  const ui = A.ui;
  const engine = A.engines.succession;

  const app = {
    id: 'succession',
    fileSuffix: 'succession',
    title: 'Succession & donation',
    caption: 'Comparatif des droits',
    icon: 'succession',
    gradient: 'linear-gradient(150deg, #7c2f40 0%, #b0566a 100%)',
  };

  // Couleurs : donation (laiton), succession sans donation (bleu), succession résiduelle (vert d'eau).
  const COLORS = { donation: '#b08a4f', succession: '#2c4f86', residuelle: '#2f8f83' };
  const NATURE_COLORS = ['#2c4f86', '#b08a4f', '#5d8a75', '#8c3b4a', '#8a93a6', '#6b5b95'];

  const newEnfant = () => ({ id: uid('e'), nom: '', majeur: true, part: null });
  const newPetitEnfant = (parent) => ({ id: uid('pe'), nom: '', majeur: true, parent: parent || '' });
  const newBien = (proprietaire) => ({ id: uid('b'), designation: '', nature: 'Immobilier', valeur: null, proprietaire: proprietaire || 'commun', regime: 'Aucun' });
  const newDonation = (donateur) => ({ id: uid('d'), donateur: donateur || 'deux', bienId: '', montant: null, beneficiaire: 'tous' });
  const newAnterieure = () => ({ id: uid('a'), date: '', montant: null, donateur: 1, beneficiaire: '', remarque: '' });
  function empty() {
    return {
      nomDossier: '', dateSimulation: todayISO(), nbParents: 2,
      parents: [{ nom: '', age: null }, { nom: '', age: null }],
      enfants: [newEnfant()], petitsEnfants: [],
      donFamilial: false, deces15ans: false,
      biens: [], donations: [], donsPE: { P1: null, P2: null }, anterieures: [],
    };
  }
  const isEmpty = (s) => !s.nomDossier && s.enfants.every((e) => !e.nom) && s.biens.every((b) => !b.valeur);
  const compute = (s, p) => engine.calculer(s, p);

  const parentNom = (s, i) => (s.parents[i] && s.parents[i].nom) || 'Parent ' + (i + 1);
  const nomDonateur = (s, g) => (g === 'deux' ? 'Les deux parents' : parentNom(s, g === 'P2' ? 1 : 0));
  const pctCell = (x) => fmtPct(x, 1);

  /* ---------- Onglet « Famille » ---------- */
  function listeEnfants(ctx) {
    const s = ctx.state;
    const { field } = ui;
    const rows = s.enfants.map((x, i) => h('div', { class: 'row-line row-personne' },
      h('span', { class: 'row-index' }, String(i + 1)),
      field('Nom / prénom', ctx.text(x, 'nom', { structural: true })),
      field('Majeur ?', ctx.yesNo(x, 'majeur', { small: true })),
      field('Part souhaitée', ctx.pct(x, 'part', { placeholder: 'égale' })),
      field('Part retenue', ctx.live((r) => {
        const found = r.enfants.find((e) => e.id === x.id);
        return h('div', { class: 'readonly' }, found ? fmtPct(found.part) : '—');
      })),
      ui.button('Retirer', {
        icon: 'trash', iconOnly: true, variant: 'ghost', small: true,
        onClick: () => { s.enfants.splice(i, 1); ctx.render(); ctx.changed(); },
      })));
    return ui.card('Les enfants', h('div', { class: 'stack-sm' },
      rows.length ? h('div', { class: 'rows' }, rows) : h('p', { class: 'muted' }, 'Aucun pour l\'instant.'),
      ui.button('Ajouter un enfant', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.enfants.push(newEnfant()); ctx.render(); } })),
    { subtitle: 'Part souhaitée vide = parts égales. Sinon, le total doit faire 100 %.' });
  }

  function listePetitsEnfants(ctx) {
    const s = ctx.state;
    const { field } = ui;
    const branches = [{ value: '', label: '— Choisir —' }].concat(s.enfants.filter((e) => e.nom).map((e) => ({ value: e.id, label: e.nom })));
    const rows = s.petitsEnfants.map((x, i) => h('div', { class: 'row-line row-pe' },
      h('span', { class: 'row-index' }, String(i + 1)),
      field('Nom / prénom', ctx.text(x, 'nom', { structural: true })),
      field('Enfant de', ctx.select(x, 'parent', branches)),
      field('Majeur ?', ctx.yesNo(x, 'majeur', { small: true })),
      ui.button('Retirer', {
        icon: 'trash', iconOnly: true, variant: 'ghost', small: true,
        onClick: () => { s.petitsEnfants.splice(i, 1); ctx.render(); ctx.changed(); },
      })));
    return ui.card('Les petits-enfants', h('div', { class: 'stack-sm' },
      rows.length ? h('div', { class: 'rows' }, rows) : h('p', { class: 'muted' }, 'Aucun pour l\'instant.'),
      ui.button('Ajouter un petit-enfant', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.petitsEnfants.push(newPetitEnfant()); ctx.render(); } })),
    { subtitle: 'Facultatif. Chaque petit-enfant est rattaché à son parent : dans l\'hypothèse D, chaque branche reçoit le même montant, partagé entre ses enfants.' });
  }

  function tabFamille(ctx) {
    const s = ctx.state;
    const p = ctx.params();
    const { field } = ui;

    const dossier = ui.card('Le dossier', h('div', { class: 'grid-2' },
      field('Dossier / clients', ctx.text(s, 'nomDossier', { placeholder: 'ex. M. et Mme Dupont' }), { wide: true }),
      field('Date de la simulation', ctx.date(s, 'dateSimulation'), { help: 'Sert au rappel fiscal des donations antérieures.' }),
      field('Nombre de parents donateurs', ctx.segmented(s, 'nbParents', [{ value: 1, label: 'Un parent' }, { value: 2, label: 'Deux parents' }], { structural: true }))));

    const parentRows = [0, 1].slice(0, s.nbParents).map((i) => h('div', { class: 'row-line row-parent' },
      h('span', { class: 'row-index' }, String(i + 1)),
      field('Parent ' + (i + 1) + ' — nom / prénom', ctx.text(s.parents[i], 'nom', { structural: true })),
      field('Âge', ctx.num(s.parents[i], 'age', { suffix: 'ans' })),
      field('Usufruit / nue-propriété', ctx.live((r) => h('div', { class: 'readonly' },
        fmtPct(r.parents[i].usufruit, 0) + ' / ' + fmtPct(r.parents[i].nuePropriete, 0))), { help: 'Barème fiscal (art. 669 CGI).' })));
    const parents = ui.card('Les parents', h('div', { class: 'rows' }, parentRows));

    const options = ui.card('Options de calcul', h('div', { class: 'grid-2' },
      field("Don familial de sommes d'argent (" + fmtEuro(p.donFamilial) + ')', ctx.yesNo(s, 'donFamilial'),
        { help: 'Liquidités données à un enfant ou petit-enfant majeur, donateur de moins de ' + p.ageLimiteDonFamilial + ' ans (art. 790 G CGI).' }),
      field('Décès dans les ' + p.delaiRappel + ' ans suivant la donation ?', ctx.yesNo(s, 'deces15ans'),
        { help: 'Oui : la donation est rappelée et consomme l\'abattement au décès.' })));

    const controles = ui.card('Contrôles de saisie', ctx.live((r) => h('div', { class: 'checks' },
      r.controles.map((c) => ui.badge(c.ok, c.libelle + (c.ok ? '' : ' : ' + c.message))))));

    return h('div', { class: 'stack' }, dossier, parents, listeEnfants(ctx), listePetitsEnfants(ctx), options, controles);
  }

  /* ---------- Onglet « Patrimoine » (par branche) ---------- */
  function rubriques(s) {
    if (s.nbParents === 1) return [{ code: 'P1', titre: 'Patrimoine de ' + parentNom(s, 0), sous: 'Un bien par ligne, valeur en pleine propriété.' }];
    return [
      { code: 'P1', titre: 'Biens propres de ' + parentNom(s, 0), sous: 'Biens appartenant à ce seul parent.' },
      { code: 'P2', titre: 'Biens propres de ' + parentNom(s, 1), sous: 'Biens appartenant à ce seul parent.' },
      { code: 'commun', titre: 'Biens communs', sous: 'Répartis par moitié entre les deux branches.' },
    ];
  }

  function tabPatrimoine(ctx) {
    const s = ctx.state;
    const p = ctx.params();
    const regimes = p.regimes.map((r) => r.nom);
    s.biens.forEach((b) => { if (b.regime && !regimes.includes(b.regime)) regimes.push(b.regime); });
    const rub = rubriques(s);
    const dans = (b, code) => (s.nbParents === 1 ? true : (b.proprietaire || 'commun') === code);

    const cartes = rub.map((rb) => {
      const biens = s.biens.filter((b) => dans(b, rb.code));
      const rows = biens.map((b) => h('tr', null,
        h('td', null, ctx.text(b, 'designation', { placeholder: 'ex. Maison de famille', ariaLabel: 'Désignation' })),
        h('td', null, ctx.select(b, 'nature', p.natures, { ariaLabel: 'Nature' })),
        h('td', null, ctx.num(b, 'valeur', { suffix: '€', ariaLabel: 'Valeur' })),
        h('td', null, ctx.select(b, 'regime', regimes, { ariaLabel: 'Régime fiscal' })),
        s.nbParents === 2 ? h('td', null, ctx.select(b, 'proprietaire', [
          { value: 'P1', label: 'Propre ' + parentNom(s, 0) }, { value: 'P2', label: 'Propre ' + parentNom(s, 1) }, { value: 'commun', label: 'Commun' },
        ], { structural: true, ariaLabel: 'Appartient à' })) : null,
        h('td', null, ui.button('Retirer ce bien', {
          icon: 'trash', iconOnly: true, variant: 'ghost', small: true,
          onClick: () => {
            s.biens.splice(s.biens.indexOf(b), 1);
            s.donations = s.donations.filter((d) => d.bienId !== b.id);
            ctx.render();
            ctx.changed();
          },
        }))));
      const head = ['Désignation du bien', 'Nature', 'Valeur', 'Régime fiscal'].concat(s.nbParents === 2 ? ['Appartient à'] : []).concat(['']);
      return ui.card(rb.titre, h('div', { class: 'stack-sm' },
        h('div', { class: 'table-wrap' }, h('table', { class: 'table table-input' },
          h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))),
          h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: head.length, class: 'empty' }, 'Aucun bien.'))),
          h('tfoot', null, h('tr', null, h('td', null, 'Total'), h('td'),
            h('td', { class: 'num' }, ctx.live(() => fmtEuro(biens.reduce((t, b) => t + (isNum(b.valeur) ? b.valeur : 0), 0)), 'strong')),
            h('td', { colspan: head.length - 3 }))))),
        ui.button('Ajouter un bien', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.biens.push(newBien(rb.code === 'commun' ? 'commun' : rb.code)); ctx.render(); } })),
      { subtitle: rb.sous, className: 'branche-' + rb.code });
    });

    const resume = ui.card('Patrimoine par branche', ctx.live((r) => h('div', { class: 'bilan' },
      r.parents.filter((x) => x.actif).map((x) => ui.stat('Branche de ' + parentNom(s, x.index), fmtEuro(r.patrimoine[x.code].brut),
        s.nbParents === 2 ? 'propres + moitié des biens communs' : null)),
      ui.stat('Patrimoine total', fmtEuro(r.patrimoineTotal), null, 'strong'))));

    return h('div', { class: 'stack' }, resume, cartes,
      h('details', { class: 'card details' },
        h('summary', null, 'Aide à la saisie'),
        h('ul', { class: 'bullets' },
          h('li', null, 'Biens propres : biens reçus par donation ou succession, ou acquis avant le mariage (régime légal). Biens communs : acquis pendant le mariage ; chaque parent en transmet la moitié.'),
          h('li', null, 'Les biens à donner se choisissent dans l\'onglet « Donations envisagées ».'),
          h('li', null, 'Régimes particuliers : Dutreil (engagements de conservation à vérifier) ; résidence principale (abattement de 20 % en succession seulement, sous conditions d\'occupation).'))));
  }

  /* ---------- Onglet « Donations envisagées » ---------- */
  function biensDuDonateur(s, g) {
    return s.biens.filter((b) => {
      const pr = s.nbParents === 1 ? 'P1' : b.proprietaire || 'commun';
      if (g === 'deux') return pr === 'commun';
      return pr === g || pr === 'commun';
    });
  }

  function tabDonations(ctx) {
    const s = ctx.state;
    const deux = s.nbParents === 2;
    const donateurs = [{ value: 'P1', label: parentNom(s, 0) }].concat(deux ? [{ value: 'P2', label: parentNom(s, 1) }, { value: 'deux', label: 'Les deux parents (bien commun)' }] : []);
    const beneficiaires = [{ value: 'tous', label: 'Tous les enfants (selon leurs parts)' }].concat(s.enfants.filter((e) => e.nom).map((e) => ({ value: e.id, label: e.nom })));

    const rows = s.donations.map((d, i) => {
      if (!deux) d.donateur = 'P1';
      const biens = biensDuDonateur(s, d.donateur);
      const opts = [{ value: '', label: biens.length ? '— Choisir le bien —' : 'Aucun bien disponible' }]
        .concat(biens.map((b) => ({ value: b.id, label: (b.designation || 'Bien sans désignation') + ' — ' + fmtEuro(b.valeur) })));
      return h('tr', null,
        h('td', null, ui.selectInput({ value: d.donateur, options: donateurs, ariaLabel: 'Donateur', onChange: (v) => { d.donateur = v; if (!biensDuDonateur(s, v).some((b) => b.id === d.bienId)) d.bienId = ''; ctx.render(); ctx.changed(); } })),
        h('td', null, ctx.select(d, 'bienId', opts, { ariaLabel: 'Bien donné' })),
        h('td', null, ctx.num(d, 'montant', { suffix: '€', placeholder: 'totalité', ariaLabel: 'Montant donné' })),
        h('td', null, ctx.select(d, 'beneficiaire', beneficiaires, { ariaLabel: 'Bénéficiaire' })),
        h('td', { class: 'num' }, ctx.live((r) => {
          const l = r.lignes[i];
          if (!l || !l.bien) return h('span', { class: 'muted' }, '—');
          const np = engine.PARENTS.reduce((t, g, k) => t + l.parDonateur[g] * (l.bien.liquide ? 1 : r.parents[k].nuePropriete), 0);
          return h('div', { class: 'cell-2' }, h('strong', null, fmtEuro(l.total)), h('span', { class: 'muted small' }, 'NP ' + fmtEuro(np)));
        })),
        h('td', null, ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { s.donations.splice(i, 1); ctx.render(); ctx.changed(); } })));
    });

    const enfantsCard = ui.card('Donations aux enfants', h('div', { class: 'stack-sm' },
      h('div', { class: 'table-wrap' }, h('table', { class: 'table table-input' },
        h('thead', null, h('tr', null, ['Qui donne ?', 'Quel bien ?', 'Montant (pleine propriété)', 'À qui ?', 'Donné (PP / NP)', ''].map((x) => h('th', null, x)))),
        h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: 6, class: 'empty' }, 'Aucune donation envisagée.'))))),
      ui.button('Ajouter une donation', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.donations.push(newDonation(deux ? 'deux' : 'P1')); ctx.render(); } }),
      ctx.live((r) => h('div', { class: 'checks' },
        r.parents.filter((x) => x.actif).map((x) => {
          const pat = r.patrimoine[x.code];
          return h('p', { class: 'small' }, h('strong', null, parentNom(s, x.index)), ' donne ', fmtEuro(pat.donne), ' en pleine propriété',
            pat.donne ? ', soit en nue-propriété ' + fmtPct(x.nuePropriete, 0) + ' de la valeur (usufruit ' + fmtPct(x.usufruit, 0) + ')' : '',
            ' ; il conserve ', fmtEuro(pat.resteBrut), '.');
        }),
        r.alertes.map((a) => ui.badge(false, a))))),
    { subtitle: 'Montant en pleine propriété ; vide = toute la part du donateur dans le bien. B : donné en pleine propriété. C et D : la nue-propriété est donnée, l\'usufruit réservé (les liquidités sont données en pleine propriété).' });

    const pe = s.petitsEnfants.filter((x) => x.nom);
    const peCard = ui.card('Donations aux petits-enfants (hypothèse D)', pe.length ? h('div', { class: 'stack-sm' },
      ui.note('En plus de la donation aux enfants, chaque grand-parent donne à chaque branche le même montant en nue-propriété, partagé à égalité entre les petits-enfants de la branche. Ce don est pris sur les biens conservés (hors liquidités) : il réduit d\'autant la succession résiduelle. Le montant indiqué est celui reçu en nue-propriété.'),
      h('div', { class: 'grid-2 grid-top' }, engine.PARENTS.slice(0, s.nbParents).map((g, i) => h('div', { class: 'pe-donateur' },
        ui.field('Montant par branche — ' + parentNom(s, i), ctx.num(s.donsPE, g, { suffix: '€', placeholder: '0' }), { help: 'Valeur reçue en nue-propriété par l\'ensemble des petits-enfants d\'une branche.' }),
        ctx.live((r) => {
          const v = r.hypotheses.D.parents[i];
          if (!v) return null;
          return h('div', { class: 'stack-sm' },
            h('ul', { class: 'aside-list' }, v.repartitionPE.filter((x) => x.nombre).map((x) => {
              const enf = r.enfants.find((e) => e.id === x.enfant);
              return h('li', null, h('span', null, 'Branche de ' + enf.nom + ' (' + x.nombre + ')'),
                h('strong', null, fmtEuro(x.parPetitEnfant) + ' chacun'));
            })),
            h('p', { class: 'small muted' }, 'Pris sur les biens conservés : ' + fmtEuro(r.parents[i].nuePropriete ? (r.donsPE[g] * v.repartitionPE.length) / r.parents[i].nuePropriete : 0)
              + ' en pleine propriété (au plus ' + fmtEuro(r.capacitePE[g]) + ' en nue-propriété par branche).'),
            h('p', { class: 'small muted' }, 'Droits de ce grand-parent : ' + fmtEuro(v.total.totalDroits) + ' en D, contre ' + fmtEuro(r.hypotheses.C.parents[i].total.totalDroits) + ' en C.'));
        })))),
      h('div', { class: 'card-actions' }, ui.button('Calculer le montant optimal', {
        icon: 'check', variant: 'primary', small: true, onClick: () => {
          const opt = engine.optimiserPetitsEnfants(s, ctx.params());
          let gain = 0;
          engine.PARENTS.forEach((g) => { if (opt[g]) { s.donsPE[g] = opt[g].montant; gain += opt[g].gain; } });
          ctx.render();
          ctx.changed();
          ui.toast(gain > 0.5 ? 'Montants optimaux appliqués : ' + fmtEuro(gain) + ' de droits en moins par rapport à C.' : 'Aucun don aux petits-enfants ne réduit les droits dans cette configuration.');
        },
      }))) : ui.note('Ajoutez les petits-enfants dans l\'onglet Famille, en indiquant de quel enfant ils sont issus.'),
    { subtitle: 'Le bouton « Calculer le montant optimal » recherche, pour chaque grand-parent, le montant qui rend le total des droits le plus faible.' });

    return h('div', { class: 'stack' }, enfantsCard, peCard);
  }

  /* ---------- Onglet « Donations antérieures » ---------- */
  function tabAnterieures(ctx) {
    const s = ctx.state;
    const personnesOpts = [{ value: '', label: '— Choisir —' }]
      .concat(s.enfants.filter((e) => e.nom).map((e) => ({ value: e.id, label: e.nom + ' (enfant)' })))
      .concat(s.petitsEnfants.filter((e) => e.nom).map((e) => ({ value: e.id, label: e.nom + ' (petit-enfant)' })));
    const donateurs = [1, 2].slice(0, s.nbParents).map((i) => ({ value: String(i), label: parentNom(s, i - 1) }));

    const rows = s.anterieures.map((a, i) => h('tr', null,
      h('td', null, ctx.date(a, 'date', { ariaLabel: 'Date' })),
      h('td', null, ctx.num(a, 'montant', { suffix: '€', ariaLabel: 'Montant taxable' })),
      h('td', null, ui.selectInput({ value: String(a.donateur), options: donateurs, ariaLabel: 'Donateur', onChange: (v) => { a.donateur = Number(v); ctx.changed(); } })),
      h('td', null, ctx.select(a, 'beneficiaire', personnesOpts, { ariaLabel: 'Bénéficiaire' })),
      h('td', null, ctx.text(a, 'remarque', { ariaLabel: 'Remarque' })),
      h('td', null, ctx.live((r) => {
        if (!a.date || !isNum(a.montant)) return h('span', { class: 'muted' }, '—');
        const ok = r.limiteRappel && a.date > r.limiteRappel;
        return ok ? ui.badge(true, 'Rappelée', 'info') : h('span', { class: 'muted' }, 'Non (plus de ' + ctx.params().delaiRappel + ' ans)');
      })),
      h('td', null, ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { s.anterieures.splice(i, 1); ctx.render(); ctx.changed(); } }))));

    return h('div', { class: 'stack' },
      ui.card('Donations antérieures', h('div', { class: 'stack-sm' },
        ctx.live((r) => ui.note('Rappel fiscal : seules les donations consenties après le ' + (fmtDate(r.limiteRappel) || '—') + ' consomment l\'abattement.')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table table-input' },
          h('thead', null, h('tr', null, ['Date de la donation', 'Montant taxable', 'Donateur', 'Bénéficiaire', 'Remarque', 'Prise en compte', ''].map((x) => h('th', null, x)))),
          h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: 7, class: 'empty' }, 'Aucune donation antérieure saisie.'))))),
        ui.button('Ajouter une donation antérieure', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.anterieures.push(newAnterieure()); ctx.render(); } }),
        h('p', { class: 'field-help' }, 'Montant à saisir : valeur taxable de la donation, hors partie exonérée au titre du don familial de sommes d\'argent.')),
      { subtitle: 'Rappel fiscal de ' + ctx.params().delaiRappel + ' ans (art. 784 CGI).' }));
  }

  /* ---------- Résultats (réutilisés à l'impression) ---------- */
  // Tableau d'une branche (ou du cumul) pour une hypothèse.
  function tableBranche(v, code, detail) {
    const sansDon = code === 'A';
    const cols = [{ label: 'Bénéficiaire', key: 'nom' }];
    const succLabel = sansDon ? 'Succession' : 'Succession résiduelle';
    if (!sansDon) {
      cols.push(
        { label: 'Reçu', num: true, className: 'col-don', render: (x) => (x.donation ? fmtEuro(x.donation.transmis) : '') },
        detail ? { label: 'Abattement', num: true, className: 'col-don', render: (x) => (x.donation ? fmtEuro(x.donation.abattement) : '') } : null,
        detail ? { label: 'Exonérations', num: true, className: 'col-don', render: (x) => (x.donation ? fmtEuro(x.donation.exonerations) : '') } : null,
        { label: 'Droits', num: true, className: 'col-don col-strong', render: (x) => (x.donation ? fmtEuro(x.donation.droits) : '') });
    }
    cols.push(
      { label: 'Reçu', num: true, className: 'col-succ', render: (x) => (x.succession ? fmtEuro(x.succession.transmis) : '—') },
      detail ? { label: 'Abattement', num: true, className: 'col-succ', render: (x) => (x.succession ? fmtEuro(x.succession.abattement) : '') } : null,
      detail ? { label: 'Exonérations', num: true, className: 'col-succ', render: (x) => (x.succession ? fmtEuro(x.succession.exonerations) : '') } : null,
      { label: 'Droits', num: true, className: 'col-succ col-strong', render: (x) => (x.succession ? fmtEuro(x.succession.droits) : '—') });
    if (!sansDon) {
      cols.push(
        { label: 'Total des droits', num: true, className: 'col-strong', render: (x) => fmtEuro(x.totalDroits) },
        { label: 'Économie', num: true, render: (x) => (x.economie === undefined ? '' : h('span', { class: x.economie < -0.5 ? 'neg' : x.economie > 0.5 ? 'pos' : '' }, fmtEuro(x.economie))) });
    }
    const colonnes = cols.filter(Boolean);
    const nDon = sansDon ? 0 : detail ? 4 : 2;
    const nSucc = detail ? 4 : 2;
    const rows = v.enfants.slice();
    v.petitsEnfants.filter((x) => x.transmis > 0).forEach((x) => rows.push({ nom: x.nom + ' (petit-enfant)', donation: x, succession: null, totalDroits: x.droits, __class: 'row-pe' }));
    return ui.table(colonnes, rows, {
      compact: true,
      groups: [{ label: '', span: 1 }].concat(nDon ? [{ label: "Donation (aujourd'hui)", span: nDon, className: 'group-don' }] : [])
        .concat([{ label: sansDon ? 'Succession (au décès)' : succLabel + ' (au décès)', span: nSucc, className: sansDon ? 'group-succ' : 'group-res' }])
        .concat(sansDon ? [] : [{ label: 'Bilan', span: 2 }]),
      total: Object.assign({ nom: 'Total' }, v.total, { economie: v.total.economie }),
      empty: 'Aucun enfant saisi.',
    });
  }

  function vueHypothese(s, r, code, opts) {
    const o = opts || {};
    const H = r.hypotheses[code];
    const c = r.comparatif.find((x) => x.code === code);
    const branches = H.parents.filter(Boolean);
    return h('div', { class: 'stack-sm hyp-' + code },
      h('div', { class: 'bilan' },
        code === 'A' ? null : ui.stat('Droits de donation', fmtEuro(c.donation), null, 'don'),
        ui.stat(code === 'A' ? 'Droits de succession' : 'Succession résiduelle', fmtEuro(c.succession), null, code === 'A' ? '' : 'res'),
        ui.stat('Total de l\'hypothèse', fmtEuro(c.total), code === 'A' ? 'Taux : ' + pctCell(r.patrimoineTotal ? c.total / r.patrimoineTotal : 0) + ' du patrimoine' : null, 'strong'),
        code === 'A' ? null : ui.stat('Économie vs sans donation', fmtEuro(c.economie), fmtPct(c.economiePct, 0), c.economie > 0.5 ? 'good' : c.economie < -0.5 ? 'bad' : '')),
      branches.length > 1
        ? h('div', { class: 'branches' }, branches.map((v) => h('div', { class: 'branche' },
          h('h4', null, 'Branche de ' + parentNom(s, v.parent === 'P2' ? 1 : 0)),
          tableBranche(v, code, o.detail))))
        : tableBranche(branches[0], code, o.detail),
      branches.length > 1 ? h('details', { class: 'sub-details', open: o.ouvert || null }, h('summary', null, 'Cumul des deux parents'), tableBranche(H.cumul, code, !o.ouvert)) : null);
  }

  function tabResultats(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' },
      ui.note('Résultats présentés branche par branche : chaque parent transmet sa part (biens propres et moitié des biens communs). Colonnes dorées : donation ; bleues : succession sans donation ; vertes : succession résiduelle après donation.'),
      engine.HYPOTHESES.map((hyp) => ui.card('Hypothèse ' + hyp.code + ' — ' + hyp.libelle, ctx.live((r) => vueHypothese(s, r, hyp.code)), { className: 'card-hyp' })));
  }

  /* ---------- Synthèse (document client) ---------- */
  function resume(s, r) {
    const best = r.meilleure, a = r.comparatif[0];
    if (best.code === 'A') return 'Dans la configuration saisie, aucune des hypothèses de donation ne réduit les droits.';
    const libelles = { B: 'donation en pleine propriété aux enfants', C: "donation en nue-propriété aux enfants avec réserve d'usufruit", D: "donation en nue-propriété aux enfants et aux petits-enfants avec réserve d'usufruit" };
    return 'Sans donation, vos enfants supporteront ' + fmtEuro(a.total) + ' de droits de succession. Avec l\'hypothèse ' + best.code + ' (' + libelles[best.code]
      + '), les droits totaux (donation + succession) ne seraient que de ' + fmtEuro(best.total) + ', soit ' + fmtEuro(best.economie) + ' économisés (' + fmtPct(best.economiePct, 0) + ').';
  }
  function hypothesesTexte(s, p) {
    return [
      'Droits en ligne directe (barème de l\'art. 777 CGI) ; abattement de ' + fmtEuro(p.abattEnfant) + ' par parent et par enfant, renouvelé tous les ' + p.delaiRappel + ' ans.',
      "Usufruit viager valorisé selon le barème fiscal de l'article 669 du CGI, à l'âge de chaque parent ; il s'éteint au décès sans droits supplémentaires.",
      'Chaque parent transmet ses biens propres et la moitié des biens communs ; les droits du conjoint survivant ne sont pas modélisés.',
      'Hypothèse D : chaque branche reçoit des grands-parents le même montant en nue-propriété, partagé entre les petits-enfants de la branche, en plus de la donation aux enfants et pris sur le patrimoine conservé ; abattement de ' + fmtEuro(p.abattPetitEnfant) + ' par grand-parent et par petit-enfant.',
      s.deces15ans
        ? 'Décès supposé dans les ' + p.delaiRappel + ' ans suivant la donation : la donation est rappelée fiscalement et consomme l\'abattement.'
        : 'Décès supposé plus de ' + p.delaiRappel + ' ans après la donation : les abattements sont reconstitués.',
      "Valeurs constantes (sans réévaluation) ; frais d'actes, émoluments et frais de partage non inclus.",
    ];
  }

  function vueSynthese(s, r, p) {
    const a = r.comparatif[0], best = r.meilleure;
    const kpis = h('div', { class: 'kpis' },
      ui.stat('Patrimoine transmissible', fmtEuro(r.patrimoineTotal), 'Valeur totale des biens saisis'),
      ui.stat('Droits sans donation', fmtEuro(a.total), 'Succession sans anticipation'),
      ui.stat('Droits avec la meilleure hypothèse', fmtEuro(best.total), best.code === 'A' ? 'Aucune donation retenue' : 'Hypothèse ' + best.code + ' · ' + best.court.toLowerCase(), 'strong'),
      ui.stat('Économie réalisée', fmtEuro(best.economie), a.total ? fmtPct(best.economiePct, 0) + ' de droits en moins' : null, best.economie > 0.5 ? 'good' : ''));

    const comparatif = ui.table([
      { label: 'Hypothèse', render: (x) => h('span', { class: 'hyp' }, h('b', null, x.code), ' ', x.libelle) },
      { label: "Donation (aujourd'hui)", num: true, className: 'col-don', render: (x) => fmtEuro(x.donation) },
      { label: 'Succession (au décès)', num: true, className: 'col-succ-mix', render: (x) => h('span', { class: x.code === 'A' ? 'txt-succ' : 'txt-res' }, fmtEuro(x.succession)) },
      { label: 'Total des droits', num: true, render: (x) => fmtEuro(x.total), className: 'col-strong' },
      { label: 'Économie', num: true, render: (x) => h('span', { class: x.economie < -0.5 ? 'neg' : x.economie > 0.5 ? 'pos' : '' }, fmtEuro(x.economie) + ' · ' + fmtPct(x.economiePct, 0)) },
      { label: 'Charge fiscale', num: true, render: (x) => fmtPct(x.chargeFiscale, 1) },
    ], r.comparatif.map((x) => Object.assign({ __class: x === best && best.code !== 'A' ? 'row-best' : '' }, x)));

    const bars = A.charts.stackedBars(
      r.comparatif.map((x) => ({ label: x.code + ' · ' + x.court, parts: x.code === 'A' ? [0, x.succession, 0] : [x.donation, 0, x.succession], highlight: x === best })),
      [{ label: 'Droits de donation', color: COLORS.donation }, { label: 'Succession sans donation', color: COLORS.succession }, { label: 'Succession résiduelle', color: COLORS.residuelle }],
      { title: 'Droits à payer selon l\'hypothèse' });
    const natures = Object.keys(r.parNature).map((k, i) => ({ label: k, value: r.parNature[k], color: NATURE_COLORS[i % NATURE_COLORS.length] }));
    const donut = A.charts.donut(natures, { title: 'Patrimoine par nature' });

    // Par branche : total des droits de chaque hypothèse, parent par parent.
    const actifs = r.parents.filter((x) => x.actif);
    const parBranche = actifs.length > 1 ? ui.table(
      [{ label: 'Branche', key: 'nom' }, { label: 'Patrimoine', num: true, render: (x) => fmtEuro(x.patrimoine) }]
        .concat(engine.HYPOTHESES.map((hy) => ({ label: hy.code + ' · ' + hy.court, num: true, render: (x) => fmtEuro(x[hy.code]) }))),
      actifs.map((x) => {
        const row = { nom: parentNom(s, x.index), patrimoine: r.patrimoine[x.code].brut };
        engine.HYPOTHESES.forEach((hy) => (row[hy.code] = r.hypotheses[hy.code].parents[x.index].total.totalDroits));
        return row;
      })) : null;

    const detailRows = r.enfants.map((e, k) => {
      const row = { nom: e.nom };
      engine.HYPOTHESES.forEach((hy) => (row[hy.code] = r.hypotheses[hy.code].cumul.enfants[k].totalDroits));
      return row;
    });
    if (r.petitsEnfants.length) {
      const row = { nom: 'Petits-enfants (donations)' };
      engine.HYPOTHESES.forEach((hy) => (row[hy.code] = r.hypotheses[hy.code].cumul.petitsEnfants.reduce((t, x) => t + x.droits, 0)));
      detailRows.push(row);
    }
    const tot = { nom: 'Total' };
    engine.HYPOTHESES.forEach((hy) => (tot[hy.code] = detailRows.reduce((t, x) => t + x[hy.code], 0)));
    const detail = ui.table([{ label: 'Bénéficiaire', key: 'nom' }].concat(engine.HYPOTHESES.map((hy) => ({ label: hy.code + ' · ' + hy.court, num: true, render: (x) => fmtEuro(x[hy.code]) }))),
      detailRows, { total: tot, empty: 'Aucun enfant saisi.' });

    return h('div', { class: 'synthese' },
      h('div', { class: 'synthese-head' },
        h('h2', null, 'Transmission à vos enfants'),
        h('p', null, [s.nomDossier, s.dateSimulation ? 'simulation du ' + fmtDate(s.dateSimulation) : null].filter(Boolean).join(' — '))),
      kpis,
      h('h3', { class: 'section-title' }, 'Comparatif des hypothèses'), comparatif,
      h('p', { class: 'field-help' }, 'Charge fiscale : total des droits rapporté au patrimoine transmis. Économie : par rapport à la succession sans donation.'),
      h('div', { class: 'charts' }, bars, donut),
      parBranche ? [h('h3', { class: 'section-title' }, 'Droits par branche'), parBranche] : null,
      h('h3', { class: 'section-title' }, 'Droits à payer par bénéficiaire'), detail,
      h('div', { class: 'resume' }, h('h3', { class: 'section-title' }, 'En résumé'), h('p', null, resume(s, r))),
      h('h3', { class: 'section-title' }, 'Hypothèses retenues'),
      h('ul', { class: 'bullets small' }, hypothesesTexte(s, p).map((x) => h('li', null, x))));
  }

  function documentSynthese(s, r, p, complet) {
    const body = [vueSynthese(s, r, p)];
    if (complet) {
      body.push(
        h('div', { class: 'page-break' }),
        h('h2', null, 'Famille et patrimoine'),
        ui.table([
          { label: 'Parent', key: 'nom' }, { label: 'Âge', num: true, render: (x) => x.age + ' ans' },
          { label: 'Usufruit', num: true, render: (x) => fmtPct(x.usufruit, 0) }, { label: 'Nue-propriété', num: true, render: (x) => fmtPct(x.nuePropriete, 0) },
          { label: 'Patrimoine', num: true, render: (x) => fmtEuro(r.patrimoine[x.code].brut) },
        ], r.parents.filter((x) => x.actif).map((x) => Object.assign({}, x, { nom: parentNom(s, x.index) })), { compact: true }),
        ui.table([
          { label: 'Bien', render: (x) => x.source.designation || '—' }, { label: 'Nature', render: (x) => x.source.nature || '' },
          { label: 'Appartient à', render: (x) => (x.total ? '' : s.nbParents === 1 ? parentNom(s, 0) : x.source.proprietaire === 'commun' ? 'Commun' : 'Propre ' + parentNom(s, x.source.proprietaire === 'P2' ? 1 : 0)) },
          { label: 'Valeur', num: true, render: (x) => fmtEuro(x.valeur) },
          { label: 'Régime', render: (x) => x.source.regime || '' },
        ], r.biens.filter((b) => b.valeur), { compact: true, total: { total: true, source: { designation: 'Total' }, valeur: r.patrimoineTotal } }),
        r.lignes.some((l) => l.total) ? [h('h2', null, 'Donations envisagées'), ui.table([
          { label: 'Donateur', render: (x) => nomDonateur(s, x.source.donateur) },
          { label: 'Bien', render: (x) => (x.bien ? x.bien.source.designation || '—' : '—') },
          { label: 'Bénéficiaire', render: (x) => (x.source.beneficiaire === 'tous' ? 'Tous les enfants' : (r.enfants.find((e) => e.id === x.source.beneficiaire) || {}).nom || '—') },
          { label: 'Montant (pleine propriété)', num: true, render: (x) => fmtEuro(x.total) },
        ], r.lignes.filter((l) => l.total), { compact: true })] : null);
      engine.HYPOTHESES.forEach((hy) => body.push(h('h2', null, 'Hypothèse ' + hy.code + ' — ' + hy.libelle), vueHypothese(s, r, hy.code, { ouvert: true })));
    }
    return ui.printDoc({
      title: complet ? 'Simulation de transmission — dossier complet' : 'Simulation de transmission',
      subtitle: s.nomDossier || null,
      meta: [h('div', { class: 'kv' }, h('span', null, 'Simulation du'), h('strong', null, fmtDate(s.dateSimulation) || '—'))],
      body,
      footer: "Simulation indicative et non contractuelle, établie d'après les informations communiquées et la législation en vigueur ; elle ne remplace pas un conseil personnalisé.",
    });
  }

  async function telechargerPdf(ctx, complet) {
    const s = ctx.state;
    const nom = 'synthese-' + (A.util.slug(s.nomDossier) || 'transmission') + '-' + todayISO() + '.pdf';
    try {
      ui.toast('Préparation du PDF…');
      await A.pdf.telecharger(documentSynthese(s, ctx.result, ctx.params(), complet), nom);
      ui.toast('PDF enregistré dans vos téléchargements.');
    } catch (e) {
      console.error(e);
      ui.toast('Création du PDF impossible : ' + e.message, 'error');
    }
  }

  function tabSynthese(ctx) {
    return h('div', { class: 'stack' },
      h('div', { class: 'synthese-actions' },
        ui.button('Télécharger la synthèse (PDF)', { icon: 'save', variant: 'primary', onClick: () => telechargerPdf(ctx, false) }),
        ui.button('Dossier complet (PDF)', { icon: 'save', variant: 'soft', onClick: () => telechargerPdf(ctx, true) })),
      ui.card(null, ctx.live((r) => vueSynthese(ctx.state, r, ctx.params())), { className: 'card-doc' }));
  }

  /* ---------- Panneau de synthèse ---------- */
  function aside(ctx) {
    return ui.card('En un coup d\'œil', ctx.live((r) => {
      const best = r.meilleure;
      return [
        h('ul', { class: 'aside-list aside-hyp' }, r.comparatif.map((x) => h('li', { class: x === best ? 'is-best' : '' },
          h('span', null, h('b', null, x.code), ' ', x.court),
          h('strong', null, fmtEuro(x.total))))),
        h('div', { class: 'aside-total' },
          h('span', null, best.code === 'A' ? 'Aucune donation ne réduit les droits' : 'Économie avec l\'hypothèse ' + best.code),
          h('strong', null, fmtEuro(best.economie))),
        h('div', { class: 'aside-checks' }, r.controles.filter((c) => !c.ok).map((c) => ui.badge(false, c.libelle + ' : ' + c.message))),
        ui.button('Voir la synthèse client', { variant: 'soft', small: true, onClick: () => ctx.goTab('synthese') }),
      ];
    }), { className: 'aside-card' });
  }

  /* ---------- Impression ---------- */
  async function print(ctx) {
    const choix = await ui.dialog('Imprimer ou enregistrer en PDF', 'Le PDF est enregistré directement dans vos téléchargements.', [
      { label: 'Annuler', value: null, variant: 'ghost' },
      { label: 'Imprimer le dossier complet', value: 'imprimer-complet', variant: 'ghost' },
      { label: 'Imprimer la synthèse', value: 'imprimer', variant: 'soft' },
      { label: 'Synthèse en PDF', value: 'pdf', variant: 'primary' },
    ]);
    if (!choix) return;
    if (choix === 'pdf') return telechargerPdf(ctx, false);
    const s = ctx.state;
    ui.print(documentSynthese(s, ctx.result, ctx.params(), choix === 'imprimer-complet'), 'Transmission ' + (s.nomDossier || ''));
  }

  /*
   * Dossiers enregistrés avec l'ancienne version (quote-part et donation saisies dans le patrimoine) :
   * conversion en biens propres / communs et en lignes de donation.
   */
  function migrer(s) {
    if (!s.biens.some((b) => b.proprietaire === undefined)) return;
    const biens = [], donations = [];
    s.biens.forEach((b) => {
      const q = s.nbParents === 1 ? 1 : isNum(b.quotePartP1) ? b.quotePartP1 : 0.5;
      const v = isNum(b.valeur) ? b.valeur : null;
      const morceaux = q === 0.5 ? [['commun', 1]] : q === 1 ? [['P1', 1]] : q === 0 ? [['P2', 1]]
        : q > 0.5 ? [['P1', 2 * q - 1], ['commun', 2 - 2 * q]] : [['P2', 1 - 2 * q], ['commun', 2 * q]];
      const fraction = b.aDonner && v ? (isNum(b.montantDonne) ? Math.min(1, b.montantDonne / v) : 1) : 0;
      morceaux.forEach(([proprietaire, f], j) => {
        const id = j ? uid('b') : b.id || uid('b');
        biens.push({ id, designation: b.designation + (morceaux.length > 1 ? (proprietaire === 'commun' ? ' (part commune)' : ' (part propre)') : ''), nature: b.nature, valeur: v === null ? null : v * f, proprietaire, regime: b.regime || 'Aucun' });
        if (fraction > 0) donations.push({ id: uid('d'), donateur: proprietaire === 'commun' ? 'deux' : proprietaire, bienId: id, montant: fraction === 1 ? null : fraction * v * f, beneficiaire: 'tous' });
      });
    });
    s.biens = biens;
    s.donations = donations;
  }

  function normalize(s) {
    s.parents = [0, 1].map((i) => Object.assign({ nom: '', age: null }, (s.parents || [])[i]));
    s.biens = s.biens || [];
    s.donations = s.donations || [];
    s.donsPE = Object.assign({ P1: null, P2: null }, s.donsPE || {});
    s.petitsEnfants = (s.petitsEnfants || []).map((x) => Object.assign({ parent: '' }, x));
    migrer(s);
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'succession', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.nomDossier,
    tabs: [
      { id: 'famille', label: 'Famille', render: tabFamille },
      { id: 'patrimoine', label: 'Patrimoine', render: tabPatrimoine },
      { id: 'donations', label: 'Donations envisagées', render: tabDonations },
      { id: 'anterieures', label: 'Donations antérieures', render: tabAnterieures },
      { id: 'resultats', label: 'Résultats A · B · C · D', render: tabResultats },
      { id: 'synthese', label: 'Synthèse client', render: tabSynthese },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
