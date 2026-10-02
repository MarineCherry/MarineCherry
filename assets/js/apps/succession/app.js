/*
 * Application « Succession & donation » : comparatif succession sans donation,
 * donation en pleine propriété et donation en nue-propriété.
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

  const COURT = { A: 'Sans donation', B: 'Donation en pleine propriété', C: 'Donation en nue-propriété' };
  const COLORS = { donation: '#b08a4f', succession: '#2c4f86' };
  const NATURE_COLORS = ['#2c4f86', '#b08a4f', '#5d8a75', '#8c3b4a', '#8a93a6', '#6b5b95'];

  const newPersonne = () => ({ id: uid('p'), nom: '', majeur: true, part: null });
  const newBien = () => ({
    id: uid('b'), designation: '', nature: 'Immobilier', valeur: null, quotePartP1: null, regime: 'Aucun',
    aDonner: false, montantDonne: null, beneficiaire: 'Enfants', montantPE: null,
  });
  const newAnterieure = () => ({ id: uid('d'), date: '', montant: null, donateur: 1, beneficiaire: '', remarque: '' });
  function empty() {
    return {
      nomDossier: '', dateSimulation: todayISO(), nbParents: 2,
      parents: [{ nom: '', age: null }, { nom: '', age: null }],
      enfants: [newPersonne()], petitsEnfants: [],
      donFamilial: false, deces15ans: false,
      biens: [newBien()], anterieures: [],
    };
  }
  const isEmpty = (s) => !s.nomDossier && s.enfants.every((e) => !e.nom) && s.biens.every((b) => !b.valeur);
  const compute = (s, p) => engine.calculer(s, p);

  const parentNom = (s, i) => (s.parents[i] && s.parents[i].nom) || 'Parent ' + (i + 1);
  const pctCell = (x) => fmtPct(x, 1);

  /* ---------- Onglet « Famille » ---------- */
  function personnes(ctx, liste, titre, sousTitre, resultKey) {
    const s = ctx.state;
    const { field } = ui;
    const rows = s[liste].map((x, i) => h('div', { class: 'row-line row-personne' },
      h('span', { class: 'row-index' }, String(i + 1)),
      field('Nom / prénom', ctx.text(x, 'nom', { structural: true })),
      field('Majeur ?', ctx.yesNo(x, 'majeur', { small: true })),
      field('Part souhaitée', ctx.pct(x, 'part', { placeholder: 'égale' })),
      field('Part retenue', ctx.live((r) => {
        const found = r[resultKey].find((e) => e.id === x.id);
        return h('div', { class: 'readonly' }, found ? fmtPct(found.part) : '—');
      })),
      ui.button('Retirer', {
        icon: 'trash', iconOnly: true, variant: 'ghost', small: true,
        onClick: () => { s[liste].splice(i, 1); ctx.render(); ctx.changed(); },
      })));
    return ui.card(titre, h('div', { class: 'stack-sm' },
      rows.length ? h('div', { class: 'rows' }, rows) : h('p', { class: 'muted' }, 'Aucun pour l\'instant.'),
      ui.button(liste === 'enfants' ? 'Ajouter un enfant' : 'Ajouter un petit-enfant', {
        icon: 'plus', variant: 'soft', small: true, onClick: () => { s[liste].push(newPersonne()); ctx.render(); },
      })), { subtitle: sousTitre });
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
        { help: 'Liquidités données à un enfant majeur, donateur de moins de ' + p.ageLimiteDonFamilial + ' ans (art. 790 G CGI).' }),
      field('Décès dans les ' + p.delaiRappel + ' ans suivant la donation ?', ctx.yesNo(s, 'deces15ans'),
        { help: 'Oui : la donation est rappelée et consomme l\'abattement au décès.' })));

    const controles = ui.card('Contrôles de saisie', ctx.live((r) => h('div', { class: 'checks' },
      r.controles.map((c) => ui.badge(c.ok, c.libelle + (c.ok ? '' : ' : ' + c.message))))));

    return h('div', { class: 'stack' }, dossier, parents,
      personnes(ctx, 'enfants', 'Les enfants', 'Part souhaitée vide = parts égales. Sinon, le total doit faire 100 %.', 'enfants'),
      personnes(ctx, 'petitsEnfants', 'Les petits-enfants', 'Facultatif : pour attribuer des biens aux petits-enfants (onglet Patrimoine).', 'petitsEnfants'),
      options, controles);
  }

  /* ---------- Onglet « Patrimoine » ---------- */
  function tabPatrimoine(ctx) {
    const s = ctx.state;
    const p = ctx.params();
    const deux = s.nbParents === 2;
    const regimes = p.regimes.map((r) => r.nom);
    if (s.biens.some((b) => b.regime && !regimes.includes(b.regime))) regimes.push(...new Set(s.biens.map((b) => b.regime).filter((x) => x && !regimes.includes(x))));

    const head = ['Désignation du bien', 'Nature', 'Valeur (€)']
      .concat(deux ? ['Quote-part ' + parentNom(s, 0), 'Quote-part ' + parentNom(s, 1)] : [])
      .concat(['Régime fiscal', 'À donner (B et C) ?', 'Montant donné (€)', 'Bénéficiaire', 'Dont aux petits-enfants (€)', '']);

    const rows = s.biens.map((b, i) => {
      const donne = b.aDonner;
      const mixte = donne && b.beneficiaire === 'Enfants et petits-enfants';
      return h('tr', null,
        h('td', null, ctx.text(b, 'designation', { placeholder: 'ex. Maison de famille', ariaLabel: 'Désignation' })),
        h('td', null, ctx.select(b, 'nature', p.natures, { ariaLabel: 'Nature' })),
        h('td', null, ctx.num(b, 'valeur', { ariaLabel: 'Valeur' })),
        deux ? h('td', null, ctx.pct(b, 'quotePartP1', { placeholder: '50', ariaLabel: 'Quote-part parent 1' })) : null,
        deux ? h('td', { class: 'num' }, ctx.live(() => h('span', { class: 'readonly' }, fmtPct(1 - (isNum(b.quotePartP1) ? b.quotePartP1 : 0.5))))) : null,
        h('td', null, ctx.select(b, 'regime', regimes, { ariaLabel: 'Régime fiscal' })),
        h('td', null, ctx.yesNo(b, 'aDonner', { small: true, structural: true })),
        h('td', null, donne ? ctx.num(b, 'montantDonne', { placeholder: 'bien entier', ariaLabel: 'Montant donné' }) : h('span', { class: 'muted' }, '—')),
        h('td', null, donne ? ctx.select(b, 'beneficiaire', engine.BENEFICIAIRES, { structural: true, ariaLabel: 'Bénéficiaire' }) : h('span', { class: 'muted' }, '—')),
        h('td', null, mixte ? ctx.num(b, 'montantPE', { ariaLabel: 'Montant aux petits-enfants' }) : h('span', { class: 'muted' }, '—')),
        h('td', null, ui.button('Retirer ce bien', {
          icon: 'trash', iconOnly: true, variant: 'ghost', small: true,
          onClick: () => { s.biens.splice(i, 1); ctx.render(); ctx.changed(); },
        })));
    });

    const tableEl = h('div', { class: 'table-wrap' },
      h('table', { class: 'table table-input' },
        h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))),
        h('tbody', null, rows),
        h('tfoot', null, h('tr', null,
          h('td', null, 'Total'), h('td'),
          h('td', { class: 'num' }, ctx.live((r) => fmtEuro(r.patrimoine), 'strong')),
          h('td', { colspan: head.length - 3 })))));

    return h('div', { class: 'stack' },
      ui.card('Patrimoine des clients', h('div', { class: 'stack-sm' }, tableEl,
        ui.button('Ajouter un bien', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.biens.push(newBien()); ctx.render(); } })),
      { subtitle: 'Un bien par ligne, valeur en pleine propriété.' }),
      h('details', { class: 'card details' },
        h('summary', null, 'Aide à la saisie'),
        h('ul', { class: 'bullets' },
          deux ? h('li', null, 'Quote-part : part du bien appartenant au premier parent (bien commun = 50 %, bien propre = 100 % ou 0 %). Vide = 50 %. Le second parent reçoit le complément.') : h('li', null, 'Un seul parent : toutes les quotes-parts lui reviennent.'),
          h('li', null, '« À donner » : bien donné en pleine propriété (hypothèse B) ou en nue-propriété (hypothèse C). Les liquidités sont toujours données en pleine propriété.'),
          h('li', null, 'Montant donné : seulement si une partie du bien est donnée (parts de société, indivision…). Vide = bien entier. Valeur en pleine propriété, tous donateurs confondus.'),
          h('li', null, 'Bénéficiaire : « Enfants » par défaut, « Petits-enfants », ou « Enfants et petits-enfants » avec la somme affectée aux petits-enfants ; le solde va aux enfants.'),
          h('li', null, 'Régimes particuliers : Dutreil (engagements de conservation à vérifier) ; résidence principale (abattement de 20 % en succession seulement, sous conditions d\'occupation).'))));
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

  /* ---------- Tableaux de résultats (réutilisés à l'impression) ---------- */
  function tableA(vue, label) {
    return ui.table([
      { label: label || 'Enfant', key: 'nom' },
      { label: 'Total transmissible', num: true, render: (x) => fmtEuro(x.transmis) },
      { label: 'Abattement légal', num: true, render: (x) => fmtEuro(x.abattement) },
      { label: 'Exonérations', num: true, render: (x) => fmtEuro(x.exonerations) },
      { label: 'Reste taxable', num: true, render: (x) => fmtEuro(x.resteTaxable) },
      { label: 'Droits de succession', num: true, render: (x) => fmtEuro(x.droits), className: 'col-strong' },
      { label: 'Taux effectif', num: true, render: (x) => pctCell(x.tauxEffectif) },
      { label: 'Net reçu après droits', num: true, render: (x) => fmtEuro(x.net) },
    ], vue.lignes, { total: Object.assign({ nom: 'Total' }, vue.total), empty: 'Aucun enfant saisi.' });
  }

  function tableDonation(vue) {
    const part = (k) => [
      { label: 'Transmis', num: true, render: (x) => (x[k] ? fmtEuro(x[k].transmis) : '') },
      { label: 'Abattement', num: true, render: (x) => (x[k] ? fmtEuro(x[k].abattement) : '') },
      { label: 'Exonérations', num: true, render: (x) => (x[k] ? fmtEuro(x[k].exonerations) : '') },
      { label: 'Taxable', num: true, render: (x) => (x[k] ? fmtEuro(x[k].resteTaxable) : '') },
      { label: 'Droits', num: true, render: (x) => (x[k] ? fmtEuro(x[k].droits) : ''), className: 'col-strong' },
    ];
    const cols = [{ label: 'Enfant', key: 'nom' }].concat(part('donation'), part('residuel'), [
      { label: 'Total des droits', num: true, render: (x) => fmtEuro(x.totalDroits), className: 'col-strong' },
      { label: 'Économie', num: true, render: (x) => h('span', { class: x.economie < -0.5 ? 'neg' : x.economie > 0.5 ? 'pos' : '' }, fmtEuro(x.economie)) },
    ]);
    const enfants = ui.table(cols, vue.lignes, {
      compact: true,
      groups: [{ label: '', span: 1 }, { label: "Donation (aujourd'hui)", span: 5, className: 'group-don' }, { label: 'Succession résiduelle (au décès)', span: 5, className: 'group-succ' }, { label: 'Bilan', span: 2 }],
      total: Object.assign({ nom: 'Total enfants' }, vue.totalEnfants),
      empty: 'Aucun enfant saisi.',
    });
    const pe = vue.petitsEnfants.length ? ui.table([
      { label: 'Petit-enfant (donation)', key: 'nom' },
      { label: 'Transmis', num: true, render: (x) => fmtEuro(x.transmis) },
      { label: 'Abattement', num: true, render: (x) => fmtEuro(x.abattement) },
      { label: 'Exonérations', num: true, render: (x) => fmtEuro(x.exonerations) },
      { label: 'Taxable', num: true, render: (x) => fmtEuro(x.resteTaxable) },
      { label: 'Droits de donation', num: true, render: (x) => fmtEuro(x.droits), className: 'col-strong' },
    ], vue.petitsEnfants, { compact: true, total: Object.assign({ nom: 'Total petits-enfants' }, vue.totalPetitsEnfants) }) : null;
    const t = vue.total;
    const bilan = h('div', { class: 'bilan' },
      ui.stat('Droits de donation', fmtEuro(t.donation.droits)),
      ui.stat('Droits de succession résiduels', fmtEuro(t.residuel.droits)),
      ui.stat('Total de l\'hypothèse', fmtEuro(t.totalDroits), null, 'strong'),
      ui.stat('Économie vs sans donation', fmtEuro(t.economie), null, t.economie > 0.5 ? 'good' : t.economie < -0.5 ? 'bad' : ''));
    return [bilan, enfants, pe];
  }

  function parParent(s, build) {
    return h('details', { class: 'sub-details' },
      h('summary', null, 'Détail parent par parent'),
      [0, 1].slice(0, s.nbParents).map((i) => h('div', { class: 'parent-block' }, h('h4', null, (s.nbParents === 2 ? 'Parent ' + (i + 1) + ' — ' : '') + parentNom(s, i)), build(i))));
  }

  /* ---------- Onglet « Succession » (hypothèse A) ---------- */
  function vueSuccession(s, r) {
    const t = r.succession.cumul.total;
    return [
      h('div', { class: 'bilan' },
        ui.stat('Total transmissible', fmtEuro(t.transmis)),
        ui.stat('Abattements', fmtEuro(t.abattement)),
        ui.stat('Exonérations', fmtEuro(t.exonerations)),
        ui.stat('Droits de succession', fmtEuro(t.droits), 'Taux effectif ' + pctCell(t.tauxEffectif), 'strong')),
      tableA(r.succession.cumul),
    ];
  }
  function tabSuccession(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' },
      ui.card('Hypothèse A — Succession sans donation', ctx.live((r) => vueSuccession(s, r).concat(parParent(s, (i) => tableA(r.succession.parents[i])))),
        { subtitle: 'Droits dus par les enfants si le patrimoine actuel leur est transmis au décès, sans anticipation. Les deux parents cumulés.' }),
      ui.note('« Abattement légal » : ' + fmtEuro(ctx.params().abattEnfant) + ' par parent et par enfant, net des donations rappelées. « Exonérations » : Dutreil, résidence principale (et don familial pour les donations). Chaque parent transmet sa quote-part à ses enfants ; les droits du conjoint survivant ne sont pas modélisés.'));
  }

  /* ---------- Onglet « Donations » (hypothèses B et C) ---------- */
  function vueUsufruit(s, r) {
    return ui.table([
      { label: 'Parent', key: 'nom' },
      { label: 'Âge', num: true, render: (x) => x.age + ' ans' },
      { label: "Valeur de l'usufruit", num: true, render: (x) => fmtPct(x.usufruit, 0) },
      { label: 'Valeur de la nue-propriété', num: true, render: (x) => fmtPct(x.nuePropriete, 0) },
    ], r.parents.filter((x) => x.actif).map((x) => Object.assign({}, x, { nom: parentNom(s, x.index) })), { compact: true });
  }
  function vueBiensDonnes(r) {
    return ui.table([
      { label: 'Bien', render: (x) => x.designation || '(sans désignation)' },
      { label: 'Valeur du bien', num: true, render: (x) => fmtEuro(x.valeur) },
      { label: 'Bénéficiaire', key: 'beneficiaire' },
      { label: 'Donné en pleine propriété (B)', num: true, render: (x) => fmtEuro(x.pleinePropriete) },
      { label: 'Dont aux petits-enfants', num: true, render: (x) => fmtEuro(x.dontPetitsEnfants) },
      { label: 'Nue-propriété donnée (C)', num: true, render: (x) => fmtEuro(x.nuePropriete) },
      { label: 'Usufruit conservé', num: true, render: (x) => fmtEuro(x.usufruitConserve) },
    ], r.biensDonnes, { compact: true, empty: 'Aucun bien coché « à donner » dans l\'onglet Patrimoine.' });
  }
  function tabDonations(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' },
      h('div', { class: 'grid-2 grid-top' },
        ui.card("Valeur de l'usufruit réservé", ctx.live((r) => vueUsufruit(s, r)), { subtitle: 'Barème fiscal, article 669 du CGI.' }),
        ui.card('Lecture', h('p', { class: 'muted' }, 'Comparaison avec la succession sans donation : droits de donation aujourd\'hui + droits de succession résiduels au décès. Les liquidités sont données en pleine propriété dans l\'hypothèse C (non démembrables). Les petits-enfants reçoivent la nue-propriété selon le même barème.'))),
      ui.card('Biens retenus dans la donation', ctx.live((r) => vueBiensDonnes(r))),
      ui.card('Hypothèse B — Donation en pleine propriété', ctx.live((r) => tableDonation(r.hypB.cumul).concat(parParent(s, (i) => tableDonation(r.hypB.parents[i])))),
        { subtitle: 'Les biens à donner sont transmis en pleine propriété ; le reste demeure dans la succession.' }),
      ui.card('Hypothèse C — Donation en nue-propriété (usufruit réservé)', ctx.live((r) => tableDonation(r.hypC.cumul).concat(parParent(s, (i) => tableDonation(r.hypC.parents[i])))),
        { subtitle: "Les parents conservent l'usufruit viager ; il s'éteint au décès sans droits supplémentaires." }));
  }

  /* ---------- Onglet « Synthèse » (document client) ---------- */
  function resume(s, r) {
    const best = r.meilleure, a = r.comparatif[0];
    if (best.code === 'A') return 'Dans la configuration saisie, aucune des hypothèses de donation ne réduit les droits.';
    return 'Sans donation, vos enfants supporteront ' + fmtEuro(a.total) + ' de droits de succession. Avec l\'hypothèse ' + best.code + ' ('
      + (best.code === 'B' ? 'donation en pleine propriété' : "donation en nue-propriété avec réserve d'usufruit") + '), les droits totaux (donation'
      + (r.petitsEnfants.length ? ' aux enfants et aux petits-enfants' : '') + ' + succession) ne seraient que de ' + fmtEuro(best.total)
      + ', soit ' + fmtEuro(best.economie) + ' économisés (' + fmtPct(best.economiePct, 0) + ').';
  }
  function hypotheses(s, p) {
    return [
      'Droits en ligne directe (barème de l\'art. 777 CGI) ; abattement de ' + fmtEuro(p.abattEnfant) + ' par parent et par enfant, renouvelé tous les ' + p.delaiRappel + ' ans.',
      "Usufruit viager valorisé selon le barème fiscal de l'article 669 du CGI, à l'âge de chaque parent ; il s'éteint au décès sans droits supplémentaires.",
      'Chaque parent transmet sa quote-part de patrimoine aux enfants au décès ; les droits du conjoint survivant ne sont pas modélisés.',
      'Donations aux petits-enfants : abattement de ' + fmtEuro(p.abattPetitEnfant) + " par grand-parent et par petit-enfant, barème de la ligne directe ; elles ne réduisent pas l'abattement des enfants.",
      s.deces15ans
        ? 'Décès supposé dans les ' + p.delaiRappel + ' ans suivant la donation : la donation est rappelée fiscalement et consomme l\'abattement.'
        : 'Décès supposé plus de ' + p.delaiRappel + ' ans après la donation : les abattements sont reconstitués.',
      "Valeurs constantes (sans réévaluation) ; frais d'actes, émoluments et frais de partage non inclus.",
    ];
  }

  function vueSynthese(s, r, p) {
    const a = r.comparatif[0], best = r.meilleure;
    const kpis = h('div', { class: 'kpis' },
      ui.stat('Patrimoine transmissible', fmtEuro(r.patrimoine), 'Valeur totale des biens saisis'),
      ui.stat('Droits sans donation', fmtEuro(a.total), 'Succession sans anticipation'),
      ui.stat('Droits avec la meilleure hypothèse', fmtEuro(best.total), best.code === 'A' ? 'Aucune donation retenue' : 'Hypothèse ' + best.code + ' · ' + best.libelle.toLowerCase(), 'strong'),
      ui.stat('Économie réalisée', fmtEuro(best.economie), a.total ? fmtPct(best.economiePct, 0) + ' de droits en moins' : null, best.economie > 0.5 ? 'good' : ''));

    const comparatif = ui.table([
      { label: 'Hypothèse', className: 'nowrap', render: (x) => h('span', { class: 'hyp' }, h('b', null, x.code), ' ', COURT[x.code]) },
      { label: "Donation (aujourd'hui)", num: true, render: (x) => fmtEuro(x.donation) },
      { label: 'Succession (au décès)', num: true, render: (x) => fmtEuro(x.succession) },
      { label: 'Total des droits', num: true, render: (x) => fmtEuro(x.total), className: 'col-strong' },
      { label: 'Économie', num: true, render: (x) => h('span', { class: x.economie < -0.5 ? 'neg' : x.economie > 0.5 ? 'pos' : '' }, fmtEuro(x.economie) + ' · ' + fmtPct(x.economiePct, 0)) },
      { label: 'Charge fiscale', num: true, render: (x) => fmtPct(x.chargeFiscale, 1) },
    ], r.comparatif.map((x) => Object.assign({ __class: x === best && best.code !== 'A' ? 'row-best' : '' }, x)));
    const comparatifNote = h('p', { class: 'field-help' }, 'Charge fiscale : total des droits rapporté au patrimoine transmis. Économie : par rapport à la succession sans donation.');

    const bars = A.charts.stackedBars(
      r.comparatif.map((x) => ({ label: x.code + ' · ' + (x.code === 'A' ? 'Sans donation' : x.code === 'B' ? 'Pleine propriété' : 'Nue-propriété'), parts: [x.donation, x.succession], highlight: x === best })),
      [{ label: 'Droits de donation', color: COLORS.donation }, { label: 'Droits de succession', color: COLORS.succession }],
      { title: 'Droits à payer selon l\'hypothèse' });
    const natures = Object.keys(r.parNature).map((k, i) => ({ label: k, value: r.parNature[k], color: NATURE_COLORS[i % NATURE_COLORS.length] }));
    const donut = A.charts.donut(natures, { title: 'Patrimoine par nature' });

    const detailRows = r.enfants.map((e, k) => ({
      nom: e.nom, a: r.succession.cumul.lignes[k].droits, b: r.hypB.cumul.lignes[k].totalDroits, c: r.hypC.cumul.lignes[k].totalDroits,
    }));
    if (r.petitsEnfants.length) detailRows.push({ nom: 'Petits-enfants (donations)', a: 0, b: r.hypB.cumul.totalPetitsEnfants.droits, c: r.hypC.cumul.totalPetitsEnfants.droits });
    detailRows.forEach((x) => { x.eb = x.a - x.b; x.ec = x.a - x.c; });
    const tot = { nom: 'Total' };
    ['a', 'b', 'c', 'eb', 'ec'].forEach((k) => (tot[k] = detailRows.reduce((t, x) => t + x[k], 0)));
    const detail = ui.table([
      { label: 'Bénéficiaire', key: 'nom' },
      { label: 'A · Sans donation', num: true, render: (x) => fmtEuro(x.a) },
      { label: 'B · Pleine propriété', num: true, render: (x) => fmtEuro(x.b) },
      { label: 'C · Nue-propriété', num: true, render: (x) => fmtEuro(x.c) },
      { label: 'Économie B', num: true, render: (x) => fmtEuro(x.eb) },
      { label: 'Économie C', num: true, render: (x) => fmtEuro(x.ec) },
    ], detailRows, { total: tot, empty: 'Aucun enfant saisi.' });

    return h('div', { class: 'synthese' },
      h('div', { class: 'synthese-head' },
        h('h2', null, 'Transmission à vos enfants'),
        h('p', null, [s.nomDossier, s.dateSimulation ? 'simulation du ' + fmtDate(s.dateSimulation) : null].filter(Boolean).join(' — '))),
      kpis,
      h('h3', { class: 'section-title' }, 'Comparatif des hypothèses'), comparatif, comparatifNote,
      h('div', { class: 'charts' }, bars, donut),
      h('h3', { class: 'section-title' }, 'Droits à payer par bénéficiaire'), detail,
      h('div', { class: 'resume' }, h('h3', { class: 'section-title' }, 'En résumé'), h('p', null, resume(s, r))),
      h('h3', { class: 'section-title' }, 'Hypothèses retenues'),
      h('ul', { class: 'bullets small' }, hypotheses(s, p).map((x) => h('li', null, x))));
  }
  function tabSynthese(ctx) {
    return ui.card(null, ctx.live((r) => vueSynthese(ctx.state, r, ctx.params())), { className: 'card-doc' });
  }

  /* ---------- Panneau de synthèse ---------- */
  function aside(ctx) {
    return ui.card('En un coup d\'œil', ctx.live((r) => {
      const best = r.meilleure;
      return [
        h('ul', { class: 'aside-list aside-hyp' }, r.comparatif.map((x) => h('li', { class: x === best ? 'is-best' : '' },
          h('span', null, h('b', null, x.code), ' ', x.code === 'A' ? 'Sans donation' : x.code === 'B' ? 'Pleine propriété' : 'Nue-propriété'),
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
    const choix = await ui.dialog('Que souhaitez-vous imprimer ?', 'L\'impression permet aussi d\'enregistrer un PDF (choisir « Enregistrer au format PDF » comme imprimante).', [
      { label: 'Annuler', value: null, variant: 'ghost' },
      { label: 'Dossier complet', value: 'complet', variant: 'soft' },
      { label: 'Synthèse client', value: 'synthese', variant: 'primary' },
    ]);
    if (!choix) return;
    const s = ctx.state, r = ctx.result, p = ctx.params();
    const body = [vueSynthese(s, r, p)];
    if (choix === 'complet') {
      body.push(
        h('div', { class: 'page-break' }),
        h('h2', null, 'Famille et patrimoine'),
        ui.table([
          { label: 'Parent', key: 'nom' }, { label: 'Âge', num: true, render: (x) => x.age + ' ans' },
          { label: 'Usufruit', num: true, render: (x) => fmtPct(x.usufruit, 0) }, { label: 'Nue-propriété', num: true, render: (x) => fmtPct(x.nuePropriete, 0) },
        ], r.parents.filter((x) => x.actif).map((x) => Object.assign({}, x, { nom: parentNom(s, x.index) })), { compact: true }),
        ui.table([
          { label: 'Bénéficiaire', key: 'nom' }, { label: 'Lien', key: 'lien' }, { label: 'Majeur', render: (x) => (x.majeur ? 'Oui' : 'Non') },
          { label: 'Part', num: true, render: (x) => fmtPct(x.part) },
        ], r.enfants.map((x) => Object.assign({ lien: 'Enfant' }, x)).concat(r.petitsEnfants.map((x) => Object.assign({ lien: 'Petit-enfant' }, x))), { compact: true }),
        ui.table([
          { label: 'Bien', render: (x) => x.source.designation || '—' }, { label: 'Nature', render: (x) => x.source.nature },
          { label: 'Valeur', num: true, render: (x) => fmtEuro(x.valeur) },
          { label: 'Quote-part P1', num: true, render: (x) => (x.total ? '' : fmtPct(x.parParent[0].brut / (x.valeur || 1), 0)) },
          { label: 'Régime', render: (x) => x.source.regime },
          { label: 'Donné', num: true, render: (x) => (x.total ? '' : x.fractionDonnee ? fmtPct(x.fractionDonnee, 0) : '—') },
          { label: 'Bénéficiaire', render: (x) => (x.total ? '' : x.fractionDonnee ? x.source.beneficiaire : '—') },
        ], r.biens.filter((b) => b.valeur), { compact: true, total: { total: true, source: { designation: 'Total' }, valeur: r.patrimoine } }),
        h('h2', null, 'Hypothèse A — Succession sans donation'), vueSuccession(s, r),
        h('div', { class: 'page-break' }),
        h('h2', null, 'Biens retenus dans la donation'), vueBiensDonnes(r),
        h('h2', null, 'Hypothèse B — Donation en pleine propriété'), tableDonation(r.hypB.cumul),
        h('h2', null, 'Hypothèse C — Donation en nue-propriété'), tableDonation(r.hypC.cumul));
    }
    const doc = ui.printDoc({
      title: choix === 'complet' ? 'Simulation de transmission — dossier complet' : 'Simulation de transmission',
      subtitle: s.nomDossier || null,
      meta: [h('div', { class: 'kv' }, h('span', null, 'Simulation du'), h('strong', null, fmtDate(s.dateSimulation) || '—'))],
      body,
      footer: "Simulation indicative et non contractuelle, établie d'après les informations communiquées et la législation en vigueur ; elle ne remplace pas un conseil personnalisé.",
    });
    ui.print(doc, 'Transmission ' + (s.nomDossier || ''));
  }

  function normalize(s) {
    s.parents = [0, 1].map((i) => Object.assign({ nom: '', age: null }, (s.parents || [])[i]));
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'succession', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.nomDossier,
    tabs: [
      { id: 'famille', label: 'Famille', render: tabFamille },
      { id: 'patrimoine', label: 'Patrimoine', render: tabPatrimoine },
      { id: 'anterieures', label: 'Donations antérieures', render: tabAnterieures },
      { id: 'succession', label: 'A · Succession', render: tabSuccession },
      { id: 'donations', label: 'B · C · Donations', render: tabDonations },
      { id: 'synthese', label: 'Synthèse client', render: tabSynthese },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
