/*
 * Application « Quotités d'acquisition » : part de chaque acquéreur d'un bien acheté en indivision,
 * d'après ses apports et sa part des prêts (et de leurs frais). Clause prête à reprendre dans l'acte.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid, fmtEuro, fmtPct } = A.util;
  const ui = A.ui;
  const E = A.engines.quotites;

  const app = {
    id: 'quotites',
    fileSuffix: 'quotites',
    title: 'Quotités d\'acquisition',
    caption: 'Achat en indivision : part de chacun',
    icon: 'quotites',
    gradient: 'linear-gradient(150deg, #a8573a 0%, #e0956b 100%)',
  };
  const COULEURS = ['#3d7be0', '#ee7552', '#34a483', '#8b5fd6', '#f0b23a', '#2f9aa8'];

  const nouvelAcquereur = (nom) => ({ id: uid('a'), nom: nom || '', apports: [{ id: uid('p'), libelle: 'Apport personnel', montant: null }] });
  function empty() {
    return {
      reference: '',
      acquereurs: [nouvelAcquereur(), nouvelAcquereur()],
      emplois: [{ id: uid('e'), libelle: 'Prix de vente', montant: null }, { id: uid('e'), libelle: 'Frais d\'acquisition (droits et émoluments)', montant: null }, { id: uid('e'), libelle: 'Frais d\'agence (à la charge de l\'acquéreur)', montant: null }],
      prets: [{ id: uid('k'), libelle: 'Prêt immobilier', capital: null, frais: null, egal: true, repartition: {} }],
      fraisDansCout: false,
    };
  }
  const isEmpty = (s) => !s.reference && s.acquereurs.every((a) => !a.nom) && s.emplois.every((x) => !x.montant);
  const compute = (s) => E.calculer(s);
  const pct2 = (x) => fmtPct(x, 2);
  const f = (label, control, opts) => ui.field(label, control, opts);
  const retirer = (ctx, liste, x) => ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { liste.splice(liste.indexOf(x), 1); ctx.render(); ctx.changed(); } });

  /* ---------- Saisie ---------- */
  function tabSaisie(ctx) {
    const s = ctx.state;
    const nomDe = (a, i) => a.nom || 'Acquéreur ' + (i + 1);

    const acquereurs = ui.card('Les acquéreurs et leurs apports', h('div', { class: 'stack-sm' },
      s.acquereurs.map((a, i) => h('div', { class: 'qt-acq', style: { '--c': COULEURS[i % COULEURS.length] } },
        h('div', { class: 'qt-acq-tete' }, h('span', { class: 'qt-pastille' }), f('Nom', ctx.text(a, 'nom', { structural: true, placeholder: 'Acquéreur ' + (i + 1) })),
          s.acquereurs.length > 2 ? retirer(ctx, s.acquereurs, a) : null),
        h('div', { class: 'rows' }, a.apports.map((p) => h('div', { class: 'row-line qt-ligne' },
          f('Apport', ctx.text(p, 'libelle', { placeholder: 'ex. épargne, donation, vente d\'un bien' })),
          f('Montant', ctx.num(p, 'montant', { suffix: '€' })),
          a.apports.length > 1 ? retirer(ctx, a.apports, p) : h('span')))),
        ui.button('Ajouter un apport', { icon: 'plus', variant: 'ghost', small: true, onClick: () => { a.apports.push({ id: uid('p'), libelle: '', montant: null }); ctx.render(); } }))),
      ui.button('Ajouter un acquéreur', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.acquereurs.push(nouvelAcquereur()); ctx.render(); } })),
    { subtitle: 'Indiquez l\'origine des fonds : elle pourra être reprise dans l\'acte (déclaration d\'origine des deniers).' });

    const cout = ui.card('Coût de l\'acquisition', h('div', { class: 'stack-sm' },
      h('div', { class: 'rows' }, s.emplois.map((x) => h('div', { class: 'row-line qt-ligne' },
        f('Poste', ctx.text(x, 'libelle')), f('Montant', ctx.num(x, 'montant', { suffix: '€' })), retirer(ctx, s.emplois, x)))),
      ui.button('Ajouter un poste', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.emplois.push({ id: uid('e'), libelle: '', montant: null }); ctx.render(); } })),
    { subtitle: 'Prix, frais d\'acquisition, frais d\'agence à la charge de l\'acquéreur, travaux financés…' });

    const prets = ui.card('Prêts', h('div', { class: 'stack-sm' },
      s.prets.map((p) => h('div', { class: 'qt-pret' },
        h('div', { class: 'row-line qt-ligne3' },
          f('Prêt', ctx.text(p, 'libelle')), f('Capital emprunté', ctx.num(p, 'capital', { suffix: '€' })),
          f('Frais du prêt', ctx.num(p, 'frais', { suffix: '€' }), { help: 'Garantie, dossier, courtage…' }), retirer(ctx, s.prets, p)),
        h('div', { class: 'qt-repartition' },
          f('Répartition entre les acquéreurs', ctx.segmented(p, 'egal', [{ value: true, label: 'À parts égales' }, { value: false, label: 'Autre répartition' }], { small: true, structural: true })),
          p.egal === false ? h('div', { class: 'qt-parts' }, s.acquereurs.map((a, i) => f(nomDe(a, i), ui.numberInput({
            value: p.repartition[a.id], percent: true, placeholder: '%',
            onChange: (v) => { p.repartition[a.id] = v; ctx.changed(); },
          })))) : null))),
      ui.button('Ajouter un prêt', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.prets.push({ id: uid('k'), libelle: '', capital: null, frais: null, egal: true, repartition: {} }); ctx.render(); } }),
      f('Frais de prêt', ctx.segmented(s, 'fraisDansCout', [{ value: false, label: 'Déduits de la part de chacun' }, { value: true, label: 'Ajoutés au coût de l\'acquisition' }], { small: true }),
        { help: 'Par défaut, les frais de prêt ne font pas partie de la valeur du bien : la part de chaque emprunteur dans ces frais est déduite de sa contribution.' })),
    { subtitle: 'Un prêt souscrit ensemble est en principe supporté par moitié ; sinon, indiquez la part de chacun.' });

    return h('div', { class: 'stack' }, f('Dossier', ctx.text(s, 'reference', { placeholder: 'ex. Acquisition MARTIN / DURAND' })), acquereurs, cout, prets, ctx.live((r) => resultat(s, r)));
  }

  /* ---------- Résultat ---------- */
  function resultat(s, r) {
    const nom = (l, i) => l.nom || 'Acquéreur ' + (i + 1);
    const tableau = ui.table([
      { label: 'Acquéreur', render: (l) => h('span', { class: 'qt-nom', style: { '--c': COULEURS[r.lignes.indexOf(l) % COULEURS.length] } }, h('span', { class: 'qt-pastille' }), nom(l, r.lignes.indexOf(l))) },
      { label: 'Apports', num: true, render: (l) => fmtEuro(l.apports) },
      { label: 'Part des prêts', num: true, render: (l) => fmtEuro(l.prets) },
      r.fraisDansCout ? null : { label: 'Part des frais de prêt', num: true, render: (l) => (l.fraisPrets ? '− ' + fmtEuro(l.fraisPrets) : '—') },
      { label: 'Contribution', num: true, render: (l) => h('strong', null, fmtEuro(l.contribution)) },
      { label: 'Quotité', num: true, render: (l) => h('strong', { class: 'qt-quotite' }, pct2(l.quotiteArrondie)) },
    ].filter(Boolean), r.lignes);
    // Ligne de total.
    const tot = h('tr', { class: 'strong' }, h('td', null, 'Total'), h('td', { class: 'num' }, fmtEuro(r.lignes.reduce((t, l) => t + l.apports, 0))), h('td', { class: 'num' }, fmtEuro(r.lignes.reduce((t, l) => t + l.prets, 0))),
      r.fraisDansCout ? null : h('td', { class: 'num' }, r.fraisPrets ? '− ' + fmtEuro(r.fraisPrets) : '—'), h('td', { class: 'num' }, fmtEuro(r.total)), h('td', { class: 'num' }, '100,00 %'));
    tableau.querySelector('table').appendChild(h('tfoot', null, tot));
    const barre = h('div', { class: 'qt-barre' }, r.lignes.map((l, i) => h('div', { class: 'qt-morceau', style: { '--c': COULEURS[i % COULEURS.length], flex: Math.max(l.quotite, 0.0001) } }, h('span', null, nom(l, i)), h('strong', null, pct2(l.quotiteArrondie)))));
    const controle = r.equilibre ? ui.badge(true, 'Le financement correspond au coût de l\'acquisition (' + fmtEuro(r.base) + ').')
      : ui.note('Le financement' + (r.fraisDansCout ? '' : ', net des frais de prêt,') + ' (' + fmtEuro(r.total) + ') ' + (r.ecart > 0 ? 'dépasse' : 'n\'atteint pas') + ' le coût de l\'acquisition (' + fmtEuro(r.base) + ') : écart de ' + fmtEuro(Math.abs(r.ecart)) + '. Vérifiez les montants ; les quotités sont calculées sur le financement saisi.', 'warn');
    return ui.card('Quotités', h('div', { class: 'stack-sm' }, barre, tableau, controle,
      r.negatif ? ui.note('Un acquéreur a une contribution négative : vérifiez ses apports et sa part des frais de prêt.', 'warn') : null,
      h('p', { class: 'small muted' }, 'Quotités arrondies au centième de pourcent ; le total fait exactement 100 %.')), { className: 'qt-resultat' });
  }

  /* ---------- Clause ---------- */
  function texteClause(s, r) {
    const detail = s.emplois.filter((x) => x.montant).map((x) => (x.libelle || 'poste').toLowerCase() + ' ' + Math.round(x.montant).toLocaleString('fr-FR') + ' €').join(', ');
    return E.clause(r, { detailCout: detail + (r.fraisDansCout && r.fraisPrets ? ', frais de prêt ' + Math.round(r.fraisPrets).toLocaleString('fr-FR') + ' €' : '') });
  }
  function tabClause(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' }, ctx.live((r) => {
      const lignes = texteClause(s, r);
      const texte = lignes.join('\n');
      return ui.card('Clause pour l\'acte', h('div', { class: 'stack-sm' },
        h('div', { class: 'qt-clause' }, lignes.map((l) => h('p', null, l))),
        h('div', null, ui.button('Copier le texte', { icon: 'copy', variant: 'primary', small: true, onClick: async () => {
          try { await navigator.clipboard.writeText(texte); ui.toast('Clause copiée.'); } catch (e) { ui.toast('Copie impossible : sélectionnez le texte à la main.', 'error'); }
        } }))), { subtitle: 'À adapter : origine des deniers, déclarations d\'emploi, clause d\'accroissement le cas échéant.' });
    }));
  }

  /* ---------- Panneau et impression ---------- */
  function aside(ctx) {
    return ui.card('En un coup d\'œil', ctx.live((r) => [
      h('ul', { class: 'aside-list' }, r.lignes.map((l, i) => h('li', null, h('span', null, l.nom || 'Acquéreur ' + (i + 1)), h('strong', null, pct2(l.quotiteArrondie))))),
      r.equilibre ? ui.badge(true, 'Financement équilibré') : ui.badge(false, 'Écart de ' + fmtEuro(Math.abs(r.ecart))),
    ]), { className: 'aside-card' });
  }
  function print(ctx) {
    const s = ctx.state, r = ctx.result;
    ui.print(ui.printDoc({
      title: 'Quotités d\'acquisition',
      subtitle: s.reference || null,
      meta: [],
      body: [
        h('h2', null, 'Coût de l\'acquisition'),
        ui.table([{ label: 'Poste', key: 'libelle' }, { label: 'Montant', num: true, render: (x) => fmtEuro(x.montant) }], s.emplois.filter((x) => x.montant), { compact: true, total: { libelle: 'Total', montant: r.baseEmplois } }),
        h('h2', null, 'Financement et quotités'),
        resultat(s, r),
        h('h2', null, 'Clause'),
        h('div', { class: 'qt-clause' }, texteClause(s, r).map((l) => h('p', null, l))),
      ],
      footer: 'Calcul établi d\'après les montants communiqués ; à vérifier avant reprise dans l\'acte.',
    }), 'Quotités ' + (s.reference || ''));
  }
  function normalize(s) {
    s.acquereurs = (s.acquereurs || []).map((a) => Object.assign(nouvelAcquereur(), a, { apports: a.apports && a.apports.length ? a.apports : nouvelAcquereur().apports }));
    s.prets = (s.prets || []).map((p) => Object.assign({ egal: true, repartition: {} }, p));
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'commun', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.reference || s.acquereurs.map((a) => a.nom).filter(Boolean).join(' / '),
    tabs: [
      { id: 'saisie', label: 'Financement et quotités', render: tabSaisie },
      { id: 'clause', label: 'Clause pour l\'acte', render: tabClause },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
