/*
 * Application « Plus-value immobilière » : saisie, résultats, impression.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid, fmtEuro, fmtPct, fmtDate, todayISO } = A.util;
  const ui = A.ui;
  const engine = A.engines.plusValue;

  const app = {
    id: 'plus-value',
    fileSuffix: 'plus-value',
    title: 'Plus-value immobilière',
    caption: 'Particuliers',
    icon: 'plusValue',
    gradient: 'linear-gradient(150deg, #2c4f86 0%, #4b7fc4 100%)',
  };

  const newVendeur = () => ({ id: uid('v'), nom: '', exonere: false, motif: '' });
  const newOrigine = (vendeurId) => ({
    id: uid('o'), vendeurId: vendeurId || '', libelle: '', nature: 'Onéreux', dateAcquisition: '',
    droitRecu: 'Pleine propriété', droitCede: '', quotePart: 1, partPrix: 1, prix: null, devise: 'EUR',
    fraisReels: null, travauxReels: null, dateAchevement: '',
  });
  function empty() {
    const v = newVendeur();
    return {
      reference: '', dateCession: todayISO(), prixVente: null, fraisVendeurs: null, bati: true,
      ageUsufruitier: null, cleUsufruitVente: null, cleUsufruitAcquisition: null,
      vendeurs: [v], valeurTerrain: null, valeurConstruction: null, origines: [newOrigine(v.id)],
    };
  }
  const isEmpty = (s) => !s.prixVente && !s.reference && s.vendeurs.every((v) => !v.nom) && s.origines.every((o) => !o.prix);

  // Le moteur rattache les origines aux vendeurs par leur nom.
  function compute(s, params) {
    const noms = {};
    s.vendeurs.forEach((v) => (noms[v.id] = (v.nom || '').trim()));
    const dossier = Object.assign({}, s, {
      vendeurs: s.vendeurs.map((v) => ({ nom: (v.nom || '').trim(), exonere: v.exonere, motif: v.motif })),
      origines: s.origines.map((o) => Object.assign({}, o, { vendeur: noms[o.vendeurId] || '' })),
    });
    return engine.calculer(dossier, params);
  }

  const vendeurNom = (s, id) => {
    const v = s.vendeurs.find((x) => x.id === id);
    return v && v.nom ? v.nom : '';
  };

  /* ---------- Onglet « La vente » ---------- */
  function tabVente(ctx) {
    const s = ctx.state;
    const { field } = ui;

    const vente = ui.card('La vente', h('div', { class: 'grid-2' },
      field('Référence du dossier', ctx.text(s, 'reference', { placeholder: 'ex. Vente Martin / Durand' }), { wide: true }),
      field('Date de la cession', ctx.date(s, 'dateCession'), { help: "Signature de l'acte de vente." }),
      field('Prix de vente', ctx.num(s, 'prixVente', { suffix: '€' }), { help: 'Bien entier, en pleine propriété.' }),
      field('Frais et taxes supportés par les vendeurs', ctx.num(s, 'fraisVendeurs', { suffix: '€' }), { help: 'Commission d\'agence, diagnostics… Répartis au prorata des droits.' }),
      field('Immeuble bâti ?', ctx.yesNo(s, 'bati'), { help: 'Le forfait travaux ne s\'applique pas aux terrains à bâtir.' })));

    const vendeurs = ui.card('Les vendeurs', h('div', { class: 'stack-sm' },
      h('div', { class: 'rows' }, s.vendeurs.map((v, i) => h('div', { class: 'row-line row-vendeur' },
        h('span', { class: 'row-index' }, String(i + 1)),
        field('Nom du vendeur', ctx.text(v, 'nom', { placeholder: 'Nom et prénom', structural: true })),
        field('Exonéré ?', ctx.yesNo(v, 'exonere', { small: true, structural: true })),
        v.exonere ? field('Motif', ctx.text(v, 'motif', { placeholder: 'ex. résidence principale' })) : h('div'),
        ui.button('Supprimer ce vendeur', {
          icon: 'trash', iconOnly: true, variant: 'ghost', small: true, disabled: s.vendeurs.length === 1,
          onClick: () => { s.vendeurs.splice(i, 1); s.origines.forEach((o) => { if (o.vendeurId === v.id) o.vendeurId = ''; }); ctx.render(); ctx.changed(); },
        })))),
      ui.button('Ajouter un vendeur', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.vendeurs.push(newVendeur()); ctx.render(); } }),
      ui.note('Vendeur exonéré (résidence principale, etc.) : l\'impôt est ramené à zéro sur son récapitulatif. Les conditions de l\'exonération ne sont pas contrôlées.')),
    { subtitle: 'Une ligne par vendeur.' });

    const usufruit = ui.card('Usufruit et nue-propriété', h('div', { class: 'grid-2' },
      field("Âge de l'usufruitier à la vente", ctx.num(s, 'ageUsufruitier', { suffix: 'ans' }), { optional: true, help: 'Sert seulement à suggérer la clé du barème.' }),
      ctx.live((r) => r.cleSuggeree === null
        ? h('div', { class: 'suggest muted' }, 'Indiquez un âge pour obtenir la clé du barème fiscal (art. 669 CGI).')
        : h('div', { class: 'suggest' },
          h('div', null, h('div', { class: 'suggest-label' }, 'Clé suggérée'), h('div', { class: 'suggest-value' }, 'Usufruit ' + fmtPct(r.cleSuggeree, 0) + ' · nue-propriété ' + fmtPct(1 - r.cleSuggeree, 0))),
          ui.button('Appliquer', { small: true, variant: 'soft', onClick: () => { s.cleUsufruitVente = r.cleSuggeree; ctx.render(); ctx.changed(); } }))),
      field("Clé d'usufruit à la date de la vente", ctx.pct(s, 'cleUsufruitVente'), { help: 'Répartit le prix de vente entre usufruit et nue-propriété.' }),
      field("Clé d'usufruit à l'acquisition à titre gratuit", ctx.pct(s, 'cleUsufruitAcquisition'), { help: 'À reprendre de la déclaration de succession ou de l\'acte de donation.' })),
    { subtitle: 'À renseigner seulement si un droit démembré est vendu ou a été reçu.' });

    const terrain = ui.card('Terrain bâti par le vendeur', h('div', { class: 'grid-2' },
      field('Valeur du terrain à la date de la vente', ctx.num(s, 'valeurTerrain', { suffix: '€' })),
      field('Valeur de la construction à la date de la vente', ctx.num(s, 'valeurConstruction', { suffix: '€' })),
      ctx.live((r) => r.ventilation
        ? h('div', { class: 'kv-inline field-wide' },
          h('div', null, h('span', null, 'Part du prix afférente à la construction'), h('strong', null, fmtPct(r.ventilation.construction))),
          h('div', null, h('span', null, 'Part du prix afférente au terrain'), h('strong', null, fmtPct(r.ventilation.terrain))))
        : null, 'div', { class: 'field-wide' }),
      h('p', { class: 'field-help field-wide' }, 'Ventilation proposée au prorata des valeurs vénales, sauf ventilation prévue à l\'acte. À reporter dans « Part du prix de cession » des origines Terrain et Construction.')),
    { subtitle: 'Facultatif.' });

    return h('div', { class: 'stack' }, vente, vendeurs, usufruit, terrain);
  }

  /* ---------- Onglet « Origines de propriété » ---------- */
  const LIBELLE_DATE = { 'Onéreux': "Date de l'acte d'acquisition", 'Gratuit': 'Date du décès ou de la donation', 'Construction': 'Date de début des travaux' };
  const LIBELLE_PRIX = {
    'Onéreux': "Prix d'acquisition (100 % du bien)",
    'Gratuit': 'Valeur retenue pour les droits (100 % en pleine propriété)',
    'Construction': 'Coût réel de construction',
  };

  function origineCard(ctx, o, i) {
    const s = ctx.state;
    const p = ctx.params();
    const { field } = ui;
    const vendeurs = [{ value: '', label: '— Choisir le vendeur —' }].concat(s.vendeurs.filter((v) => v.nom).map((v) => ({ value: v.id, label: v.nom })));
    const nom = vendeurNom(s, o.vendeurId);

    const body = h('div', null,
      h('div', { class: 'grid-3' },
        field('Vendeur', ctx.select(o, 'vendeurId', vendeurs, { structural: true })),
        field('Origine de propriété', ctx.text(o, 'libelle', { placeholder: 'ex. Succession de M. X' })),
        field("Nature de l'acquisition", ctx.segmented(o, 'nature', engine.NATURES.map((x) => ({ value: x, label: x })), { structural: true, small: true })),
        field(LIBELLE_DATE[o.nature], ctx.date(o, 'dateAcquisition')),
        field('Droit reçu dans cette origine', ctx.select(o, 'droitRecu', engine.DROITS, { structural: true })),
        field('Droit cédé à la vente', ctx.select(o, 'droitCede', [{ value: '', label: 'Identique au droit reçu' }].concat(engine.DROITS.map((x) => ({ value: x, label: x }))))),
        field('Quote-part du bien (en pleine propriété)', ctx.pct(o, 'quotePart')),
        field('Part du prix de cession rattachée à cet acte', ctx.pct(o, 'partPrix'), { help: '100 % sauf plusieurs actes, ou terrain / construction.' }),
        field(LIBELLE_PRIX[o.nature], h('div', { class: 'with-unit' },
          ctx.num(o, 'prix', { suffix: o.devise === 'FRF' ? 'F' : '€' }),
          ctx.segmented(o, 'devise', [{ value: 'EUR', label: '€' }, { value: 'FRF', label: 'F' }], { structural: true, small: true, ariaLabel: 'Devise' }))),
        field("Frais d'acquisition réels", ctx.num(o, 'fraisReels', { suffix: '€', placeholder: o.nature === 'Onéreux' ? 'Forfait ' + fmtPct(p.forfaitFrais) : 'Aucun' }), { help: 'Vide = forfait pour un achat ; frais réels seulement pour un bien reçu.' }),
        field('Travaux réels justifiés', ctx.num(o, 'travauxReels', { suffix: '€', placeholder: 'Forfait ' + fmtPct(p.forfaitTravaux) + ' si éligible' })),
        field("Date d'achèvement de la construction", ctx.date(o, 'dateAchevement'), { optional: o.nature !== 'Construction', help: 'Terrain bâti par le vendeur : sur la ligne du terrain et celle de la construction.' })),
      ctx.live((r) => {
        const x = r.origines[i] && r.origines[i].resultat;
        if (!x) return ui.note('Choisissez le vendeur pour calculer cette origine.');
        return h('div', { class: 'origine-result' },
          h('div', { class: 'mini-stats' },
            mini('Prix de cession net', fmtEuro(x.prixCessionNet)),
            mini("Prix d'acquisition majoré", fmtEuro(x.prixMajore)),
            mini('Plus-value brute', fmtEuro(x.pvBrute), x.pvBrute < 0 ? 'neg' : ''),
            mini('Détention', x.annees + ' an' + (x.annees > 1 ? 's' : '')),
            mini('Abattements IR / PS', fmtPct(x.abatIR) + ' / ' + fmtPct(x.abatPS)),
            mini('Imposable IR / PS', fmtEuro(x.pvIR) + ' / ' + fmtEuro(x.pvPS))),
          h('p', { class: 'regle' }, x.regle),
          ui.badge(x.controle === 'OK', x.controle === 'OK' ? 'Contrôle : OK' : x.controle));
      }));

    return ui.card(h('span', null, 'Origine n° ' + (i + 1), nom ? h('span', { class: 'card-title-sub' }, ' · ' + nom) : null), body, {
      className: 'origine',
      subtitle: o.nature + ' · ' + (o.droitRecu || 'Pleine propriété'),
      actions: [
        ui.button('Dupliquer', { icon: 'copy', variant: 'ghost', small: true, onClick: () => { s.origines.splice(i + 1, 0, Object.assign({}, o, { id: uid('o') })); ctx.render(); } }),
        ui.button('Supprimer', { icon: 'trash', variant: 'ghost', small: true, onClick: async () => {
          if (await ui.confirm('Supprimer cette origine ?', 'Origine n° ' + (i + 1) + (nom ? ' de ' + nom : '') + '.', 'Supprimer')) { s.origines.splice(i, 1); ctx.render(); ctx.changed(); }
        } }),
      ],
    });
  }
  const mini = (label, value, tone) => h('div', { class: ['mini', tone] }, h('span', null, label), h('strong', null, value));

  function tabOrigines(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' },
      ui.note('Une origine par vendeur, par acte d\'acquisition et par nature de droit (pleine propriété, usufruit, nue-propriété).'),
      s.origines.map((o, i) => origineCard(ctx, o, i)),
      h('div', { class: 'add-row' }, ui.button('Ajouter une origine de propriété', {
        icon: 'plus', variant: 'soft', onClick: () => { s.origines.push(newOrigine(s.vendeurs.length === 1 ? s.vendeurs[0].id : '')); ctx.render(); },
      })),
      h('details', { class: 'card details' },
        h('summary', null, 'Terrain acheté puis bâti par le vendeur : comment saisir'),
        h('ol', { class: 'steps' },
          h('li', null, "Ligne du terrain : nature Onéreux (ou Gratuit), date d'acquisition du terrain, prix du terrain. Le forfait de 7,5 % ne porte que sur ce prix."),
          h('li', null, "Ligne de la construction : nature Construction, date de début d'exécution des travaux (récépissé de déclaration d'ouverture de chantier), coût réel de construction."),
          h('li', null, "Date d'achèvement de la construction sur les deux lignes : elle sert au test des 5 ans du forfait de 15 %."),
          h('li', null, 'Part du prix de cession de chaque ligne : voir la ventilation proposée dans « La vente ».'),
          h('li', null, "Abattements : la fraction du terrain court depuis l'acquisition du terrain, celle de la construction depuis le début des travaux."),
          h('li', null, 'Coût de construction : dépenses facturées par des entreprises, payées et justifiées (matériaux achetés par le vendeur exclus).'))));
  }

  /* ---------- Onglet « Récapitulatif » ---------- */
  const RECAP_ROWS = [
    ['prixCessionBrut', 'Prix de cession brut afférent'],
    ['fraisCession', 'Frais et taxes supportés par le vendeur'],
    ['prixCessionNet', 'Prix de cession net'],
    ['prixAcquisition', "Prix d'acquisition retenu"],
    ['fraisAcquisition', "Frais d'acquisition retenus"],
    ['travaux', 'Travaux retenus'],
    ['prixMajore', "Prix d'acquisition majoré"],
    ['pvBrute', 'Plus-value brute'],
    ['pvImposableIR', "Plus-value imposable à l'IR, après abattements", 'sep'],
    ['pvImposablePS', 'Plus-value imposable aux PS, après abattements'],
    ['impotRevenu', 'Impôt sur le revenu', 'sep'],
    ['surtaxe', 'Surtaxe sur plus-value élevée'],
    ['prelevementsSociaux', 'Prélèvements sociaux'],
    ['total', 'Total à payer', 'strong'],
  ];

  function recapTable(r) {
    const vs = r.parVendeur;
    const rows = [{ label: 'Exonération', values: vs.map((v) => (v.exonere ? 'Oui' + (v.motif ? ' (' + v.motif + ')' : '') : 'Non')), total: '' }]
      .concat(RECAP_ROWS.map(([k, label, cls]) => ({
        label, __class: cls, values: vs.map((v) => fmtEuro(v[k])), total: fmtEuro(vs.reduce((t, v) => t + v[k], 0)),
      })));
    const cols = [{ label: '', key: 'label', className: 'row-head' }]
      .concat(vs.map((v, i) => ({ label: v.nom, num: true, render: (row) => row.values[i] })))
      .concat(vs.length > 1 ? [{ label: 'Total', num: true, key: 'total', className: 'col-total' }] : []);
    return ui.table(cols, rows, { empty: 'Saisissez au moins un vendeur.' });
  }

  function detailTable(r, s, compact) {
    const rows = r.origines.filter((x) => x.resultat).map((x, i) => Object.assign({ n: i + 1, o: x.origine }, x.resultat));
    return ui.table([
      { label: 'Vendeur', render: (x) => x.o.vendeur },
      { label: 'Origine', render: (x) => [x.o.nature, x.o.libelle].filter(Boolean).join(' · ') },
      { label: 'Date', render: (x) => fmtDate(x.o.dateAcquisition) },
      { label: 'Droit reçu → cédé', render: (x) => (x.o.droitRecu || 'Pleine propriété') + (x.o.droitCede && x.o.droitCede !== x.o.droitRecu ? ' → ' + x.o.droitCede : '') },
      { label: 'Prix net', num: true, render: (x) => fmtEuro(x.prixCessionNet) },
      { label: 'Acquisition majorée', num: true, render: (x) => fmtEuro(x.prixMajore) },
      { label: 'Plus-value brute', num: true, render: (x) => fmtEuro(x.pvBrute) },
      { label: 'Années', num: true, key: 'annees' },
      { label: 'Abatt. IR', num: true, render: (x) => fmtPct(x.abatIR) },
      { label: 'Abatt. PS', num: true, render: (x) => fmtPct(x.abatPS) },
      { label: 'Imposable IR', num: true, render: (x) => fmtEuro(x.pvIR) },
      { label: 'Imposable PS', num: true, render: (x) => fmtEuro(x.pvPS) },
    ].concat(compact ? [] : [{ label: 'Contrôle', render: (x) => ui.badge(x.controle === 'OK', x.controle === 'OK' ? 'OK' : x.controle) }]),
    rows, { compact: true, empty: 'Aucune origine calculée.' });
  }

  function controles(r) {
    return h('div', { class: 'checks' },
      r.controleRepartition ? ui.badge(r.controleRepartition.ok, 'Répartition du prix : ' + r.controleRepartition.texte) : ui.badge(false, 'Prix de vente non renseigné.'),
      ui.badge(r.controleLignes.ok, 'Origines : ' + r.controleLignes.texte));
  }

  function tabRecap(ctx) {
    return h('div', { class: 'stack' },
      ui.card('Récapitulatif par vendeur', ctx.live((r) => [recapTable(r), controles(r)]),
        { subtitle: 'Montants à reporter dans la déclaration de plus-value de chaque vendeur. Plus-values imposables et impôts arrondis à l\'euro.' }),
      ui.card('Détail par origine', ctx.live((r) => detailTable(r, ctx.state))));
  }

  /* ---------- Onglet « Règles appliquées » ---------- */
  function regles(p) {
    return [
      ['Prix de cession', "Prix de vente − frais et taxes supportés par le vendeur (art. 150 VA CGI), réparti selon les droits de chaque vendeur. En cas de vente conjointe d'un bien démembré, le prix est ventilé entre usufruit et nue-propriété selon le barème de l'art. 669 CGI."],
      ["Prix d'acquisition – onéreux", "Prix stipulé à l'acte (converti en euros si en francs), pour la part du vendeur. Majoré des frais réels ou du forfait de " + fmtPct(p.forfaitFrais) + ' (art. 150 VB II 3° CGI).'],
      ["Prix d'acquisition – gratuit", "Valeur retenue pour la liquidation des droits de mutation à titre gratuit (art. 150 VB I CGI). Usufruit et nue-propriété valorisés avec la clé de la déclaration de succession ou de l'acte de donation. Majoré des seuls frais réels (droits acquittés et frais d'acte) : pas de forfait (art. 150 VB II 2° CGI)."],
      ['Travaux', 'Travaux réels justifiés, sinon forfait de ' + fmtPct(p.forfaitTravaux) + " du prix d'acquisition si l'immeuble est bâti et détenu depuis plus de 5 ans (art. 150 VB II 4° CGI). Les deux ne se cumulent pas."],
      ['Durée de détention', "Du jour de l'acte pour un achat ; du jour du décès ou de la donation pour un bien reçu à titre gratuit. Comptée en années révolues (art. 150 VC CGI)."],
      ['Abattement IR', '6 % par an de la 6e à la 21e année, 4 % la 22e année : exonération totale à 22 ans de détention.'],
      ['Abattement prélèvements sociaux', '1,65 % par an de la 6e à la 21e année, 1,60 % la 22e, puis 9 % par an de la 23e à la 30e : exonération totale à 30 ans.'],
      ['Taux', 'Impôt sur le revenu ' + fmtPct(p.tauxIR) + ' (art. 200 B CGI). Prélèvements sociaux ' + fmtPct(p.tauxPS) + '. Modifiables dans Paramètres.'],
      ['Surtaxe', "Barème de l'art. 1609 nonies G CGI, appliqué par vendeur lorsque la plus-value imposable à l'IR dépasse 50 000 €."],
      ['Terrain bâti par le vendeur', 'Deux origines : le terrain (acquisition onéreuse ou gratuite) et la construction (nature Construction, coût réel). Le forfait de frais ne porte que sur le prix du terrain. Le forfait travaux porte sur le prix du terrain plus le coût de construction, si l\'immeuble est achevé depuis plus de 5 ans. Abattements : le terrain court depuis son acquisition, la construction depuis le début des travaux (BOI-RFPI-PVI-20-20, § 40).'],
      ['Droit reçu / droit cédé', "Le droit reçu valorise l'acquisition (clé de la succession ou de la donation). Le droit cédé répartit le prix de vente (clé du jour de la vente). Cas où ils diffèrent : nue-propriété reçue puis réunie à l'usufruit avant la vente. Le traitement fiscal de la réunion est à vérifier au dossier."],
      ['Exonération', "Simple interrupteur par vendeur (résidence principale, etc.) : l'impôt est mis à 0. Les conditions de l'exonération ne sont pas contrôlées."],
    ];
  }
  const LIMITES = [
    "Achat onéreux d'un droit démembré (usufruit ou nue-propriété acquis par acte de vente) : non géré, l'origine est signalée.",
    'Moins-values : non imputées entre origines, l\'origine est signalée.',
    "Ventilation du prix de cession entre terrain et construction : au prorata des valeurs vénales par défaut, à confirmer selon l'acte et le dossier.",
    "Travaux de reconstruction ou d'agrandissement assimilés à une construction nouvelle : à saisir comme une origine Construction, avec un contrôle au cas par cas.",
    'Régimes particuliers non traités : non-résidents, terrains à bâtir, cessions à titre gratuit, plus-values de partage, sociétés.',
    'Le simulateur aide au calcul : les chiffres sont à relire avant toute déclaration.',
  ];
  function tabRegles(ctx) {
    const p = ctx.params();
    return h('div', { class: 'stack' },
      ui.card('Règles appliquées par le simulateur', h('dl', { class: 'rules' }, regles(p).map(([t, d]) => [h('dt', null, t), h('dd', null, d)]))),
      ui.card('Limites', h('ul', { class: 'bullets' }, LIMITES.map((x) => h('li', null, x)))));
  }

  /* ---------- Panneau de synthèse ---------- */
  function aside(ctx) {
    return ui.card('Synthèse', ctx.live((r) => {
      const vs = r.parVendeur;
      return [
        h('div', { class: 'aside-total' }, h('span', null, 'Total à payer'), h('strong', null, fmtEuro(r.total.total))),
        vs.length ? h('ul', { class: 'aside-list' }, vs.map((v) => h('li', null,
          h('span', null, v.nom, v.exonere ? h('em', { class: 'tag' }, 'exonéré') : null), h('strong', null, fmtEuro(v.total))))) : null,
        h('div', { class: 'aside-checks' }, controles(r)),
      ];
    }), { className: 'aside-card' });
  }

  /* ---------- Impression ---------- */
  function print(ctx) {
    const s = ctx.state, r = ctx.result, p = ctx.params();
    const kv = (label, value) => h('div', { class: 'kv' }, h('span', null, label), h('strong', null, value));
    const doc = ui.printDoc({
      title: 'Plus-value immobilière',
      subtitle: s.reference || null,
      meta: [kv('Date de la cession', fmtDate(s.dateCession) || '—'), kv('Édité le', fmtDate(todayISO()))],
      body: [
        h('section', { class: 'print-kv' },
          kv('Prix de vente', fmtEuro(s.prixVente)), kv('Frais et taxes des vendeurs', fmtEuro(s.fraisVendeurs || 0)),
          kv('Immeuble bâti', s.bati ? 'Oui' : 'Non'), kv('Taux IR / PS', fmtPct(p.tauxIR) + ' / ' + fmtPct(p.tauxPS)),
          A.util.isNum(s.cleUsufruitVente) ? kv("Clé d'usufruit à la vente", fmtPct(s.cleUsufruitVente)) : null,
          A.util.isNum(s.cleUsufruitAcquisition) ? kv("Clé d'usufruit à l'acquisition", fmtPct(s.cleUsufruitAcquisition)) : null),
        h('h2', null, 'Récapitulatif par vendeur'),
        recapTable(r),
        h('div', { class: 'print-checks' }, controles(r)),
        h('h2', null, 'Détail par origine de propriété'),
        detailTable(r, s, true),
        h('p', { class: 'print-small' }, r.origines.filter((x) => x.resultat).map((x, i) => (i + 1) + '. ' + x.origine.vendeur + ' — ' + x.resultat.regle + (x.resultat.controle !== 'OK' ? ' — ' + x.resultat.controle : '')).join('\n')),
      ],
      footer: 'Simulation indicative établie d\'après les informations communiquées et la législation en vigueur ; les montants sont à relire avant toute déclaration.',
    });
    ui.print(doc, 'Plus-value ' + (s.reference || ''));
  }

  const mount = A.simulator({
    app, paramsSection: 'plusValue', empty, isEmpty, compute, aside, print,
    reference: (s) => s.reference,
    tabs: [
      { id: 'vente', label: 'La vente', render: tabVente },
      { id: 'origines', label: 'Origines de propriété', render: tabOrigines },
      { id: 'recap', label: 'Récapitulatif', render: tabRecap },
      { id: 'regles', label: 'Règles appliquées', render: tabRegles },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
