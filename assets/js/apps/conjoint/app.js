/*
 * Application « Conjoint survivant » : liquidation du régime matrimonial, droits légaux du conjoint,
 * donation entre époux ou testament (options, cantonnement), legs, droits de succession par héritier.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid, fmtEuro, fmtPct, fmtDate, todayISO, isNum } = A.util;
  const ui = A.ui;
  const engine = A.engines.conjoint;

  const app = {
    id: 'conjoint',
    fileSuffix: 'conjoint',
    title: 'Conjoint survivant',
    caption: 'Droits légaux, donation entre époux',
    icon: 'conjoint',
    gradient: 'linear-gradient(150deg, #5b3f7a 0%, #8f74b0 100%)',
  };
  const NATURES = [
    { value: 'avancement', label: 'En avancement de part' },
    { value: 'partage', label: 'Donation-partage' },
    { value: 'horsPart', label: 'Hors part' },
  ];
  const natureCourte = (x) => ({ partage: 'donation-partage', horsPart: 'hors part' })[engine.nature(x)] || '';
  const COULEURS = { conjoint: '#5b3f7a', heritiers: '#2c4f86', droits: '#b08a4f' };

  const nouvellePersonne = (o) => Object.assign({ id: uid('p'), nom: '', handicape: false }, o || {});
  const nouveauBien = (propriete) => ({ id: uid('b'), designation: '', valeur: null, propriete: propriete || 'commun', quoteDefunt: 0.5, residencePrincipale: false, familial: false });
  function empty() {
    return {
      reference: '', dateDeces: '', regime: 'communaute',
      defunt: { nom: '' }, conjoint: { nom: '', age: null },
      enfants: [nouvellePersonne({ commun: true, statut: 'vivant' })], petitsEnfants: [],
      pere: { vivant: false, nom: '' }, mere: { vivant: false, nom: '' }, fratrie: [], neveux: [], autres: [],
      biens: [], passif: [], fraisFuneraires: null, recompenses: [], avantages: { attributionIntegrale: false, partSurvivant: null, preciput: null },
      participation: {}, actifNetManuel: null,
      donations: [], liberaliteConjoint: { type: 'aucune', cantonnement: { mode: 'aucun', fraction: 0.5, biens: [] } },
      legs: [], logementViager: { actif: false, bienId: '', valeur: null }, abattementRP: false, assurancesVie: [],
    };
  }
  const isEmpty = (s) => !s.reference && !s.defunt.nom && s.biens.length === 0 && s.enfants.every((e) => !e.nom);
  function parametres(p) {
    const all = A.store.getParams();
    return Object.assign({}, p, { bareme777: all.succession.bareme777, abattEnfant: all.succession.abattEnfant });
  }
  const compute = (s, p) => engine.calculer(s, parametres(p));

  const regimeDe = (s) => engine.REGIMES.find((r) => r.id === s.regime) || engine.REGIMES[0];
  const nomConjoint = (s) => (s.conjoint.nom && s.conjoint.nom.trim()) || (s.regime === 'pacs' ? 'Partenaire' : 'Conjoint');
  const ligne = (cols, ...enfants) => h('div', { class: 'row-line', style: { gridTemplateColumns: cols } }, ...enfants);
  const retirer = (ctx, liste, x) => ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { liste.splice(liste.indexOf(x), 1); ctx.render(); ctx.changed(); } });
  const ajouter = (ctx, libelle, f) => ui.button(libelle, { icon: 'plus', variant: 'soft', small: true, onClick: () => { f(); ctx.render(); ctx.changed(); } });

  // Bénéficiaires possibles (donations, legs, assurance-vie).
  function beneficiaires(s, avecConjoint) {
    const out = [{ value: '', label: '— Choisir —' }];
    if (avecConjoint && regimeDe(s).id !== 'aucun') out.push({ value: 'conjoint', label: nomConjoint(s) + ' (conjoint)' });
    const add = (l, suffixe) => l.filter((x) => x.nom).forEach((x) => out.push({ value: x.id, label: x.nom + ' (' + suffixe + ')' }));
    add(s.enfants, 'enfant');
    add(s.petitsEnfants, 'petit-enfant');
    if (s.pere.vivant) out.push({ value: 'pere', label: (s.pere.nom || 'Père') + ' (père)' });
    if (s.mere.vivant) out.push({ value: 'mere', label: (s.mere.nom || 'Mère') + ' (mère)' });
    add(s.fratrie, 'frère ou sœur');
    add(s.neveux, 'neveu ou nièce');
    add(s.autres, 'héritier');
    return out;
  }
  const LIENS_OPTIONS = engine.LIENS.filter((l) => l.id !== 'conjoint').map((l) => ({ value: l.id, label: l.libelle }));
  const STATUTS = [{ value: 'vivant', label: 'Vivant' }, { value: 'predecede', label: 'Prédécédé' }, { value: 'renonce', label: 'Renonçant' }];

  /* ---------- Onglet « Famille » ---------- */
  function tabFamille(ctx) {
    const s = ctx.state;
    const r = regimeDe(s);
    const f = ui.field;
    const dossier = ui.card('Le dossier', h('div', { class: 'grid-3' },
      f('Référence du dossier', ctx.text(s, 'reference', { placeholder: 'ex. Succession DUPONT' })),
      f('Défunt', ctx.text(s.defunt, 'nom', { placeholder: 'Nom et prénoms' })),
      f('Date du décès', ctx.date(s, 'dateDeces')),
      f('Situation du conjoint', ctx.select(s, 'regime', engine.REGIMES.map((x) => ({ value: x.id, label: x.libelle })), { structural: true }), { help: 'Régime matrimonial ou PACS ; il détermine la liquidation et les droits du survivant.' }),
      r.id !== 'aucun' ? f(r.id === 'pacs' ? 'Partenaire' : 'Conjoint survivant', ctx.text(s.conjoint, 'nom', { placeholder: 'Nom et prénoms' })) : null,
      r.id !== 'aucun' ? f('Âge du survivant au décès', ctx.num(s.conjoint, 'age', { suffix: 'ans' }), { help: 'Valeur de l\'usufruit (art. 669 CGI).' }) : null));

    const enfants = ui.card('Enfants du défunt', h('div', { class: 'stack-sm' },
      s.enfants.map((x) => ligne('minmax(180px,1.6fr) ' + (r.marie ? 'auto ' : '') + 'minmax(130px,0.8fr) auto 32px',
        f('Nom et prénom', ctx.text(x, 'nom', { structural: true })),
        r.marie ? f('Enfant des deux époux', ctx.yesNo(x, 'commun', { small: true, structural: true })) : null,
        f('Situation', ctx.select(x, 'statut', STATUTS, { structural: true })),
        f('Handicapé', ctx.yesNo(x, 'handicape', { small: true })),
        retirer(ctx, s.enfants, x))),
      ajouter(ctx, 'Ajouter un enfant', () => s.enfants.push(nouvellePersonne({ commun: true, statut: 'vivant' })))),
    { subtitle: 'Un enfant prédécédé ou renonçant est représenté par ses propres descendants (ci-dessous).' });

    const repres = s.enfants.filter((e) => e.nom && e.statut && e.statut !== 'vivant');
    const petits = repres.length || s.petitsEnfants.length ? ui.card('Petits-enfants venant par représentation', h('div', { class: 'stack-sm' },
      s.petitsEnfants.map((x) => ligne('minmax(180px,1.6fr) minmax(160px,1fr) auto 32px',
        f('Nom et prénom', ctx.text(x, 'nom', { structural: true })),
        f('Représente', ctx.select(x, 'parent', [{ value: '', label: '— Choisir —' }].concat(repres.map((e) => ({ value: e.id, label: e.nom }))), { structural: true })),
        f('Handicapé', ctx.yesNo(x, 'handicape', { small: true })),
        retirer(ctx, s.petitsEnfants, x))),
      ajouter(ctx, 'Ajouter un petit-enfant', () => s.petitsEnfants.push(nouvellePersonne({ parent: repres[0] ? repres[0].id : '' }))))) : null;

    const sansDescendants = !s.enfants.some((e) => e.nom);
    const autres = ui.card('En l\'absence de descendants', h('div', { class: 'stack' },
      h('div', { class: 'grid-2' },
        h('div', { class: 'stack-sm' }, f('Père vivant', ctx.yesNo(s.pere, 'vivant', { small: true, structural: true })), s.pere.vivant ? f('Nom', ctx.text(s.pere, 'nom')) : null),
        h('div', { class: 'stack-sm' }, f('Mère vivante', ctx.yesNo(s.mere, 'vivant', { small: true, structural: true })), s.mere.vivant ? f('Nom', ctx.text(s.mere, 'nom')) : null)),
      h('h4', { class: 'param-sub' }, 'Frères et sœurs'),
      h('div', { class: 'stack-sm' }, s.fratrie.map((x) => ligne('minmax(180px,1.6fr) minmax(130px,0.8fr) auto 32px',
        f('Nom et prénom', ctx.text(x, 'nom', { structural: true })),
        f('Situation', ctx.select(x, 'statut', STATUTS, { structural: true })),
        f('Handicapé', ctx.yesNo(x, 'handicape', { small: true })),
        retirer(ctx, s.fratrie, x))),
      ajouter(ctx, 'Ajouter un frère ou une sœur', () => s.fratrie.push(nouvellePersonne({ statut: 'vivant' })))),
      s.fratrie.some((x) => x.statut && x.statut !== 'vivant') || s.neveux.length ? [h('h4', { class: 'param-sub' }, 'Neveux et nièces venant par représentation'),
        h('div', { class: 'stack-sm' }, s.neveux.map((x) => ligne('minmax(180px,1.6fr) minmax(160px,1fr) auto 32px',
          f('Nom et prénom', ctx.text(x, 'nom', { structural: true })),
          f('Représente', ctx.select(x, 'parent', [{ value: '', label: '— Choisir —' }].concat(s.fratrie.filter((y) => y.nom && y.statut !== 'vivant').map((y) => ({ value: y.id, label: y.nom }))), { structural: true })),
          f('Handicapé', ctx.yesNo(x, 'handicape', { small: true })),
          retirer(ctx, s.neveux, x))),
        ajouter(ctx, 'Ajouter un neveu ou une nièce', () => s.neveux.push(nouvellePersonne({ parent: '' }))))] : null,
      h('h4', { class: 'param-sub' }, 'Autres héritiers (sans père, mère, frère ni sœur)'),
      h('div', { class: 'stack-sm' }, s.autres.map((x) => ligne('minmax(180px,1.6fr) minmax(160px,1fr) minmax(110px,0.6fr) 32px',
        f('Nom et prénom', ctx.text(x, 'nom', { structural: true })),
        f('Lien de parenté', ctx.select(x, 'lien', LIENS_OPTIONS)),
        f('Part', ctx.pct(x, 'part', { placeholder: 'égale' })),
        retirer(ctx, s.autres, x))),
      ajouter(ctx, 'Ajouter un héritier', () => s.autres.push(nouvellePersonne({ lien: 'parent4', part: null }))))),
    { subtitle: sansDescendants ? 'Le défunt n\'a pas de descendant : père, mère, frères et sœurs.' : 'Sans effet tant que le défunt a des descendants.', className: sansDescendants ? '' : 'card-muted' });
    return h('div', { class: 'stack' }, dossier, enfants, petits, autres);
  }

  /* ---------- Onglet « Patrimoine » ---------- */
  function proprietes(r) {
    if (r.communaute) return [{ value: 'commun', label: 'Bien commun' }, { value: 'defunt', label: 'Propre du défunt' }, { value: 'conjoint', label: 'Propre du survivant' }];
    return [{ value: 'defunt', label: 'Au défunt' }, { value: 'indivis', label: 'Indivis' }, { value: 'conjoint', label: 'Au survivant' }];
  }
  function tabPatrimoine(ctx) {
    const s = ctx.state;
    const r = regimeDe(s);
    const f = ui.field;
    if (!r.communaute) s.biens.forEach((b) => { if (b.propriete === 'commun') b.propriete = 'indivis'; });
    const biens = ui.card('Biens', h('div', { class: 'stack-sm' },
      ui.note('Saisissez les biens pour faire calculer la liquidation, ou laissez vide et indiquez directement l\'actif net en bas de page.'),
      s.biens.map((b) => ligne('minmax(160px,1.5fr) minmax(110px,0.8fr) minmax(150px,0.9fr) ' + (b.propriete === 'indivis' ? 'minmax(90px,0.5fr) ' : '') + 'auto auto 32px',
        f('Désignation', ctx.text(b, 'designation', { structural: true })),
        f('Valeur', ctx.num(b, 'valeur', { suffix: '€' })),
        f('Propriété', ctx.select(b, 'propriete', proprietes(r), { structural: true })),
        b.propriete === 'indivis' ? f('Part du défunt', ctx.pct(b, 'quoteDefunt')) : null,
        f('Résidence principale', ctx.yesNo(b, 'residencePrincipale', { small: true })),
        f('Bien de famille', ctx.yesNo(b, 'familial', { small: true })),
        retirer(ctx, s.biens, b))),
      ajouter(ctx, 'Ajouter un bien', () => s.biens.push(nouveauBien(r.communaute ? 'commun' : 'defunt')))),
    { subtitle: '« Bien de famille » : reçu par le défunt de ses ascendants (droit de retour des frères et sœurs, art. 757-3 C. civ.).' });

    const passif = ui.card('Passif et frais', h('div', { class: 'stack-sm' },
      s.passif.map((x) => ligne('minmax(180px,1.6fr) minmax(120px,0.8fr) minmax(150px,0.9fr) 32px',
        f('Dette', ctx.text(x, 'libelle')),
        f('Montant', ctx.num(x, 'montant', { suffix: '€' })),
        r.communaute ? f('À la charge', ctx.select(x, 'charge', [{ value: 'commun', label: 'De la communauté' }, { value: 'defunt', label: 'Du défunt' }])) : h('div'),
        retirer(ctx, s.passif, x))),
      ajouter(ctx, 'Ajouter une dette', () => s.passif.push({ id: uid('d'), libelle: '', montant: null, charge: r.communaute ? 'commun' : 'defunt' })),
      h('div', { class: 'grid-3' }, f('Frais funéraires', ctx.num(s, 'fraisFuneraires', { suffix: '€' }), { help: 'Déduits en totalité ; fiscalement dans la limite de 1 500 € (art. 775 CGI).' }))));

    const recompenses = r.communaute ? ui.card('Récompenses', h('div', { class: 'stack-sm' },
      s.recompenses.map((x) => {
        const calc = x.calcul = x.calcul || { type: 'acquisition', depense: null, coutTotal: null, valeurActuelle: null };
        return h('div', { class: 'stack-sm recompense' },
          ligne('minmax(160px,1.4fr) minmax(130px,0.8fr) minmax(220px,1.2fr) auto 32px',
            f('Objet', ctx.text(x, 'libelle', { placeholder: 'ex. Apport de fonds propres à l\'achat' })),
            f('Époux', ctx.select(x, 'epoux', [{ value: 'defunt', label: 'Défunt' }, { value: 'conjoint', label: 'Survivant' }])),
            f('Sens', ctx.select(x, 'sens', [{ value: 'du', label: 'La communauté doit à l\'époux' }, { value: 'doit', label: 'L\'époux doit à la communauté' }])),
            f('Montant', ctx.segmented(x, 'mode', [{ value: 'saisie', label: 'Saisi' }, { value: 'calcul', label: 'Calculé' }], { small: true, structural: true })),
            retirer(ctx, s.recompenses, x)),
          x.mode === 'calcul'
            ? h('div', { class: 'grid-3 recompense-calcul' },
              f('Nature de la dépense', ctx.select(calc, 'type', [{ value: 'acquisition', label: 'Acquisition, amélioration, conservation' }, { value: 'necessaire', label: 'Dépense nécessaire' }, { value: 'autre', label: 'Autre' }])),
              f('Somme fournie (dépense faite)', ctx.num(calc, 'depense', { suffix: '€' })),
              f('Coût total du bien à l\'époque', ctx.num(calc, 'coutTotal', { suffix: '€' }), { help: 'Prix et frais d\'acquisition, ou coût des travaux.' }),
              f('Valeur actuelle du bien', ctx.num(calc, 'valeurActuelle', { suffix: '€' })),
              f('Récompense', ctx.live(() => {
                const c = engine.recompense(calc);
                return h('div', { class: 'readonly' }, fmtEuro(c.montant), h('span', { class: 'small muted' }, '\u00a0— profit subsistant ' + fmtEuro(c.profit)));
              })))
            : h('div', { class: 'grid-3' }, f('Montant de la récompense', ctx.num(x, 'montant', { suffix: '€' }))));
      }),
      ajouter(ctx, 'Ajouter une récompense', () => s.recompenses.push({ id: uid('r'), libelle: '', epoux: 'defunt', sens: 'du', mode: 'saisie', montant: null }))),
    { subtitle: 'Art. 1469 C. civ. : la récompense est égale à la plus faible de la dépense faite et du profit subsistant ; pas moins que la dépense si elle était nécessaire, pas moins que le profit subsistant pour une acquisition ou une amélioration.' }) : null;

    const avantages = r.communaute ? ui.card('Avantages matrimoniaux', h('div', { class: 'grid-3' },
      f('Attribution intégrale au survivant', ctx.yesNo(s.avantages, 'attributionIntegrale', { small: true, structural: true })),
      s.avantages.attributionIntegrale ? null : f('Part de la communauté au survivant', ctx.pct(s.avantages, 'partSurvivant', { placeholder: '50 %' }), { help: 'Partage inégal ; vide = moitié.' }),
      s.avantages.attributionIntegrale ? null : f('Préciput', ctx.num(s.avantages, 'preciput', { suffix: '€' }), { help: 'Valeur des biens prélevés par le survivant avant partage.' }))) : null;

    const participation = r.id === 'participation' ? ui.card('Créance de participation', h('div', { class: 'grid-2' },
      f('Patrimoine originaire du défunt', ctx.num(s.participation, 'originaireDefunt', { suffix: '€' })),
      f('Patrimoine final du défunt', ctx.num(s.participation, 'finalDefunt', { suffix: '€' })),
      f('Patrimoine originaire du survivant', ctx.num(s.participation, 'originaireConjoint', { suffix: '€' })),
      f('Patrimoine final du survivant', ctx.num(s.participation, 'finalConjoint', { suffix: '€' }))),
    { subtitle: 'La moitié de la différence des acquêts nets est due par l\'époux qui s\'est le plus enrichi.' }) : null;

    const resultat = ui.card('Liquidation et actif net de succession', h('div', { class: 'stack-sm' },
      ctx.live((res) => {
        const l = res.liquidation;
        const rows = [['Biens propres du défunt', l.propresDefunt], ['Part indivise du défunt', l.indivis]];
        if (l.regime.communaute) {
          rows.push(['Biens communs', l.communs], ['Passif de communauté', -l.passifCommun], ['Récompenses dues à la communauté', l.dues], ['Récompenses dues par la communauté', -l.doitComm]);
          if (l.preciput) rows.push(['Préciput du survivant', -l.preciput]);
          rows.push(['Part de communauté revenant à la succession', l.partCommunaute]);
        }
        if (l.creanceParticipation) rows.push([l.creanceParticipation > 0 ? 'Créance de participation contre le survivant' : 'Créance de participation du survivant', l.creanceParticipation]);
        rows.push(['Passif du défunt', -l.passifDefunt], ['Frais funéraires', -l.frais]);
        return h('div', { class: 'stack-sm' },
          ui.table([{ label: '', key: 'l' }, { label: 'Montant', num: true, render: (x) => fmtEuro(x.v) }],
            rows.filter((x) => x[1]).map(([l2, v]) => ({ l: l2, v })), { compact: true, total: { l: 'Actif net calculé', v: l.calcule } }),
          l.alertes.map((a) => ui.badge(false, a)));
      }),
      h('div', { class: 'grid-3' }, ui.field('Actif net retenu', ctx.num(s, 'actifNetManuel', { suffix: '€', placeholder: 'calculé' }), { help: 'À remplir pour remplacer le montant calculé (ou si aucun bien n\'est saisi).' }))));
    return h('div', { class: 'stack' }, biens, passif, recompenses, avantages, participation, resultat);
  }

  /* ---------- Onglet « Libéralités » ---------- */
  function tabLiberalites(ctx) {
    const s = ctx.state;
    const r = regimeDe(s);
    const f = ui.field;
    const benef = beneficiaires(s, true);
    const lc = s.liberaliteConjoint;
    lc.cantonnement = lc.cantonnement || { mode: 'aucun', fraction: 0.5, biens: [] };

    const conjoint = r.id === 'aucun' ? null : ui.card(r.marie ? 'Donation entre époux ou testament au profit du conjoint' : 'Testament au profit du partenaire', h('div', { class: 'stack' },
      h('div', { class: 'grid-2' },
        f('Libéralité', ctx.segmented(lc, 'type', r.marie
          ? [{ value: 'aucune', label: 'Aucune' }, { value: 'ddv', label: 'Donation entre époux' }, { value: 'testament', label: 'Testament' }]
          : [{ value: 'aucune', label: 'Aucune' }, { value: 'testament', label: 'Testament' }], { structural: true })),
        lc.type !== 'aucune' ? f('Cantonnement', ctx.segmented(lc.cantonnement, 'mode', [{ value: 'aucun', label: 'Aucun' }, { value: 'fraction', label: 'À une fraction' }, { value: 'biens', label: 'À certains biens' }], { structural: true }),
          { help: 'Le conjoint limite son émolument (art. 1094-1 al. 2 C. civ.) ; appliqué aux options de la libéralité.' }) : null),
      lc.type !== 'aucune' && lc.cantonnement.mode === 'fraction' ? h('div', { class: 'grid-3' }, f('Fraction conservée', ctx.pct(lc.cantonnement, 'fraction'), { help: 'Ex. 50 % : la moitié de l\'option choisie.' })) : null,
      lc.type !== 'aucune' && lc.cantonnement.mode === 'biens' ? h('div', { class: 'cantonnement-biens' }, s.biens.filter((b) => b.designation).length
        ? s.biens.filter((b) => b.designation).map((b) => {
          const cb = h('input', { type: 'checkbox', checked: lc.cantonnement.biens.includes(b.id), onchange: () => {
            lc.cantonnement.biens = cb.checked ? lc.cantonnement.biens.concat(b.id) : lc.cantonnement.biens.filter((x) => x !== b.id);
            ctx.changed();
          } });
          return h('label', { class: 'check' }, cb, h('span', null, b.designation));
        }) : h('p', { class: 'small muted' }, 'Saisissez les biens dans l\'onglet Patrimoine.')) : null,
      r.marie ? h('p', { class: 'small muted' }, 'Options comparées : quotité disponible ordinaire en pleine propriété, ¼ en pleine propriété et ¾ en usufruit, totalité en usufruit (art. 1094-1 C. civ.) ; sans descendant : totalité en pleine propriété.')
        : h('p', { class: 'small muted' }, 'Le partenaire pacsé n\'hérite pas sans testament ; il est exonéré de droits (art. 796-0 bis CGI).')));

    const logement = r.marie ? ui.card('Logement du conjoint', h('div', { class: 'stack-sm' },
      ui.note('Droit temporaire au logement : pendant un an, le conjoint occupe gratuitement le logement et le mobilier (art. 763 C. civ.) ; ce droit n\'est pas un droit successoral et n\'est pas taxé.'),
      h('div', { class: 'grid-3' },
        f('Droit viager d\'habitation et d\'usage', ctx.yesNo(s.logementViager, 'actif', { small: true, structural: true }), { help: 'Art. 764 : valeur imputée sur les droits du conjoint (art. 765).' }),
        s.logementViager.actif ? f('Logement', ctx.select(s.logementViager, 'bienId', [{ value: '', label: 'Valeur saisie ci-contre' }].concat(s.biens.filter((b) => b.designation).map((b) => ({ value: b.id, label: b.designation }))), { structural: true })) : null,
        s.logementViager.actif && !s.logementViager.bienId ? f('Valeur du logement (part successorale)', ctx.num(s.logementViager, 'valeur', { suffix: '€' })) : null),
      h('div', { class: 'grid-3' }, f('Abattement de 20 % sur la résidence principale', ctx.yesNo(s, 'abattementRP', { small: true }), { help: 'Si elle est occupée par le conjoint ou un enfant mineur à la date du décès (art. 764 bis CGI). Cocher le bien « résidence principale ».' })))) : null;

    const donations = ui.card('Donations antérieures consenties par le défunt', h('div', { class: 'stack-sm' },
      s.donations.map((x) => (x.nature || (x.nature = engine.nature(x)), x)).map((x) => ligne('minmax(170px,1.2fr) minmax(130px,0.7fr) minmax(120px,0.8fr) minmax(120px,0.8fr) auto 32px',
        f('Bénéficiaire', ctx.select(x, 'beneficiaire', benef, { structural: true })),
        f('Date', ctx.date(x, 'date')),
        f('Valeur au décès', ctx.num(x, 'valeur', { suffix: '€' }), { help: 'Pour le calcul civil (rapport, réserve).' }),
        f('Montant déclaré', ctx.num(x, 'montantFiscal', { suffix: '€', placeholder: 'idem' }), { help: 'Pour le rappel fiscal (15 ans).' }),
        f('Nature', ctx.select(x, 'nature', NATURES, { structural: true })),
        retirer(ctx, s.donations, x))),
      ajouter(ctx, 'Ajouter une donation', () => s.donations.push({ id: uid('dn'), beneficiaire: '', date: '', valeur: null, montantFiscal: null, nature: 'avancement' }))),
    { subtitle: 'En avancement de part : rapportées entre enfants. Donation-partage : imputée sur la réserve, non rapportée (valeur au jour de la donation-partage, art. 1078). Hors part (préciput) : imputée sur la quotité disponible.' });

    const legs = ui.card('Legs à d\'autres bénéficiaires', h('div', { class: 'stack-sm' },
      s.legs.map((x) => ligne('minmax(170px,1.2fr) ' + (x.beneficiaire ? '' : 'minmax(150px,1fr) minmax(140px,0.8fr) ') + 'minmax(150px,0.8fr) minmax(120px,0.8fr) 32px',
        f('Bénéficiaire', ctx.select(x, 'beneficiaire', [{ value: '', label: 'Autre personne…' }].concat(benef.slice(1).filter((b) => b.value !== 'conjoint')), { structural: true })),
        x.beneficiaire ? null : f('Nom', ctx.text(x, 'nom')),
        x.beneficiaire ? null : f('Lien de parenté', ctx.select(x, 'lien', LIENS_OPTIONS)),
        f('Legs', ctx.segmented(x, 'mode', [{ value: 'montant', label: 'Somme / bien' }, { value: 'quotite', label: 'Quote-part' }], { small: true, structural: true })),
        x.mode === 'quotite' ? f('Quote-part', ctx.pct(x, 'quotite')) : f('Valeur', ctx.num(x, 'montant', { suffix: '€' })),
        retirer(ctx, s.legs, x))),
      ajouter(ctx, 'Ajouter un legs', () => s.legs.push({ id: uid('l'), beneficiaire: '', nom: '', lien: 'tiers', mode: 'montant', montant: null, quotite: null }))),
    { subtitle: 'Legs à un héritier (hors part) ou à un légataire : pris sur les biens existants et imputés sur la quotité disponible.' });

    const av = ui.card('Assurance-vie', h('div', { class: 'stack-sm' },
      s.assurancesVie.map((x) => ligne('minmax(170px,1.2fr) minmax(140px,0.8fr) minmax(140px,0.8fr) 32px',
        f('Bénéficiaire', ctx.select(x, 'beneficiaire', benef, { structural: true })),
        f('Capital (primes avant 70 ans)', ctx.num(x, 'capitalAvant70', { suffix: '€' }), { help: 'Art. 990 I.' }),
        f('Primes versées après 70 ans', ctx.num(x, 'primesApres70', { suffix: '€' }), { help: 'Art. 757 B.' }),
        retirer(ctx, s.assurancesVie, x))),
      ajouter(ctx, 'Ajouter un contrat', () => s.assurancesVie.push({ id: uid('av'), beneficiaire: '', capitalAvant70: null, primesApres70: null }))),
    { subtitle: 'Hors succession civile. 990 I : 152 500 € d\'abattement par bénéficiaire, puis 20 % et 31,25 %. 757 B : primes au-delà de 30 500 € ajoutées à la part taxable.' });

    return h('div', { class: 'stack' }, conjoint, logement, donations, legs, av);
  }

  /* ---------- Détail des calculs ---------- */
  const FRACTIONS = [[1 / 2, '½'], [1 / 3, '⅓'], [1 / 4, '¼'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, 'totalité']];
  const fraction = (x) => (FRACTIONS.find((f) => Math.abs(f[0] - x) < 1e-9) || [0, fmtPct(x, 2)])[1];
  // Tableau « libellé / montant » avec sous-totaux en gras.
  function tableauCalcul(lignes) {
    return h('div', { class: 'calc-table' }, ui.table([
      { label: '', render: (x) => (x.indent ? h('span', { class: 'calc-indent' }, x.l) : x.l) },
      { label: '', render: (x) => h('span', { class: 'small muted' }, x.note || '') },
      { label: 'Montant', num: true, render: (x) => (x.v === null || x.v === undefined ? '' : fmtEuro(x.v)) },
    ], lignes.filter(Boolean).map((x) => Object.assign({ __class: x.total ? 'strong' : '' }, x)), { compact: true }));
  }
  function detailLiquidation(s, r) {
    const l = r.liquidation;
    const reg = l.regime;
    const biens = s.biens.filter((b) => isNum(b.valeur) && b.valeur);
    const nom = (b) => b.designation || 'Bien sans désignation';
    const blocs = [];
    if (reg.communaute) {
      const recs = l.recompenses;
      const lignes = [{ l: 'Biens communs', total: true }]
        .concat(biens.filter((b) => b.propriete === 'commun').map((b) => ({ l: nom(b), v: b.valeur, indent: true })))
        .concat([{ l: 'Total des biens communs', v: l.communs, total: true }])
        .concat(s.passif.filter((x) => x.charge === 'commun' && x.montant).map((x) => ({ l: 'Passif : ' + (x.libelle || 'dette'), v: -x.montant, indent: true })))
        .concat(recs.filter((x) => x.sens === 'doit' && x.montantCalcule).map((x) => ({ l: 'Récompense due par ' + (x.epoux === 'defunt' ? 'le défunt' : 'le survivant') + ' : ' + (x.libelle || ''), v: x.montantCalcule, indent: true, note: 'réunie à la masse' })))
        .concat(recs.filter((x) => x.sens === 'du' && x.montantCalcule).map((x) => ({ l: 'Récompense due ' + (x.epoux === 'defunt' ? 'au défunt' : 'au survivant') + ' : ' + (x.libelle || ''), v: -x.montantCalcule, indent: true, note: 'prélevée sur la masse' })))
        .concat([{ l: 'Masse commune nette', v: l.masseCommune, total: true }])
        .concat(l.preciput ? [{ l: 'Préciput du survivant', v: -l.preciput, indent: true }, { l: 'Masse à partager', v: l.aPartager, total: true }] : [])
        .concat(s.avantages.attributionIntegrale
          ? [{ l: 'Attribution intégrale au survivant', v: null, note: 'aucune part de communauté dans la succession' }]
          : [{ l: 'Part du défunt', v: l.aPartager * (1 - l.partSurvivant), note: fmtPct(1 - l.partSurvivant, 0) + ' de ' + fmtEuro(l.aPartager), indent: true }]
            .concat(recs.filter((x) => x.epoux === 'defunt' && x.montantCalcule).map((x) => ({ l: x.sens === 'du' ? 'Plus : récompense due au défunt' : 'Moins : récompense due par le défunt', v: x.sens === 'du' ? x.montantCalcule : -x.montantCalcule, indent: true }))))
        .concat([{ l: 'Part de communauté revenant à la succession', v: l.partCommunaute, total: true }]);
      blocs.push(ui.card('1. Liquidation de la communauté', tableauCalcul(lignes)));
    }
    const lignes = [{ l: 'Actif de succession', total: true }]
      .concat(biens.filter((b) => b.propriete === 'defunt').map((b) => ({ l: nom(b), v: b.valeur, indent: true, note: 'propre' })))
      .concat(biens.filter((b) => b.propriete === 'indivis').map((b) => ({ l: nom(b), v: b.valeur * (b.quoteDefunt || 0), indent: true, note: fmtPct(b.quoteDefunt || 0, 0) + ' de ' + fmtEuro(b.valeur) })))
      .concat(reg.communaute ? [{ l: 'Part de communauté', v: l.partCommunaute, indent: true }] : [])
      .concat(l.creanceParticipation ? [{ l: 'Créance de participation', v: l.creanceParticipation, indent: true }] : [])
      .concat(s.passif.filter((x) => (x.charge !== 'commun' || !reg.communaute) && x.montant).map((x) => ({ l: 'Passif : ' + (x.libelle || 'dette'), v: -x.montant, indent: true })))
      .concat(l.frais ? [{ l: 'Frais funéraires', v: -l.frais, indent: true }] : [])
      .concat([{ l: 'Actif net calculé', v: l.calcule, total: true }])
      .concat(l.manuel ? [{ l: 'Actif net retenu (saisi)', v: l.actifNet, total: true }] : []);
    blocs.push(ui.card((reg.communaute ? '2' : '1') + '. Actif net de succession', tableauCalcul(lignes)));
    return blocs;
  }
  function detailMasse(s, r) {
    const sc = r.scenarios[0];
    if (!sc) return null;
    const c = sc.rep.calc;
    const n = r.heritiers.souches.length;
    const lignes = [
      { l: 'Actif net de succession (biens existants)', v: c.A },
      c.Dr ? { l: 'Donations rapportables (en avancement de part)', v: c.Dr, note: 'réunion fictive' } : null,
      c.Dp ? { l: 'Donations-partages', v: c.Dp, note: 'réunion fictive (valeur art. 1078)' } : null,
      c.Dh ? { l: 'Donations hors part', v: c.Dh, note: 'réunion fictive' } : null,
      c.Dc ? { l: 'Donations au conjoint', v: c.Dc, note: 'réunion fictive' } : null,
      { l: 'Masse de calcul (art. 922 C. civ.)', v: c.M, total: true },
    ];
    if (n) {
      lignes.push(
        { l: 'Quotité disponible ordinaire', v: c.qdo * c.M, note: fraction(c.qdo) + ' (' + n + ' souche' + (n > 1 ? 's' : '') + ' de descendants)' },
        { l: 'Réserve des descendants', v: c.reserveGlobale, note: fraction(1 - c.qdo) },
        c.Dr ? { l: 'dont déjà reçue par donations rapportables', v: c.Dr, indent: true } : null,
        c.DpReserve ? { l: 'dont déjà reçue par donations-partages', v: c.DpReserve, indent: true, note: 'imputées sur la réserve, non rapportées' } : null,
        { l: 'Réserve restant à prendre sur les biens existants', v: c.reserveSurBiens, indent: true });
    }
    if (c.L) lignes.push({ l: 'Legs à d\'autres bénéficiaires', v: c.L, note: 'pris sur les biens existants' });
    return ui.card((regimeDe(s).communaute ? '3' : '2') + '. Masse de calcul, réserve et quotité disponible', tableauCalcul(lignes));
  }
  function detailOption(s, sc, us) {
    const c = sc.rep.calc;
    const conj = sc.conjoint;
    const lignes = [];
    if (c.conjBrut !== null && c.conjBrut !== undefined) {
      const base = sc.code === 'legal-pp' ? 'actif net ' + fmtEuro(c.A) + (c.Dr ? ' + donations rapportables ' + fmtEuro(c.Dr) : '') + ' (art. 758-5)' : 'masse de calcul ' + fmtEuro(c.M);
      lignes.push({ l: 'Pleine propriété du conjoint', v: c.fraction * c.assiette, note: fraction(c.fraction) + ' × ' + base });
      if (c.Dc) lignes.push({ l: 'Moins : donations déjà reçues par le conjoint', v: -c.Dc, indent: true, note: 'imputées' });
      if (c.conjBrut > c.plafond + 0.5) lignes.push({ l: 'Plafond (biens existants, réserve préservée)', v: c.plafond, indent: true });
    }
    if (conj.usBase) lignes.push({ l: 'Usufruit du conjoint', v: conj.usValeur, note: fmtPct(us, 0) + ' × ' + fmtEuro(conj.usBase) + ' de biens' });
    if (conj.viager) {
      lignes.push(
        { l: 'dont droit viager d\'habitation et d\'usage', v: conj.viager, indent: true, note: '60 % de l\'usufruit (' + fmtPct(us, 0) + ') sur le logement, imputé (art. 765)' },
        { l: 'dont pleine propriété', v: conj.pp, indent: true });
    }
    lignes.push({ l: 'Total reçu par le conjoint', v: conj.valeur, total: true });
    if (c.souches) {
      const excesTotal = sum(c.souches, (x) => x.excesReduction);
      lignes.push(
        { l: 'Biens restant aux descendants', v: c.R, note: c.U ? 'dont ' + fmtEuro(c.U) + ' en nue-propriété' : '' },
        c.Dr ? { l: 'Plus : donations rapportables', v: c.Dr, indent: true } : null,
        excesTotal ? { l: 'Plus : excédent des donations hors part réduites', v: excesTotal, indent: true, note: 'imputé sur la part du gratifié' } : null,
        c.indemnitesTiers ? { l: 'Plus : indemnités de réduction dues par des tiers', v: c.indemnitesTiers, indent: true } : null,
        { l: 'Masse à partager entre les souches', v: c.pool, total: true },
        { l: 'Part de chaque souche', v: c.partNette, note: '÷ ' + c.souches.length });
      c.souches.forEach((x) => {
        const moins = x.donations ? 'part − ' + fmtEuro(x.donations) + (x.excesReduction ? ' (rapport et réduction)' : ' rapportés') : 'part entière';
        lignes.push({ l: 'Souche ' + x.nom + (x.membres.length > 1 || x.membres[0] !== x.nom ? ' (' + x.membres.join(', ') + ')' : ''), v: x.net, indent: true, note: moins + (x.indemnite ? ' — doit ' + fmtEuro(x.indemnite) + ' à ses cohéritiers' : '') });
      });
    }
    return ui.card(sc.libelle, h('div', { class: 'stack' }, tableauReduction(s, c), tableauCalcul(lignes)), { className: 'card-hyp' });
  }
  // Imputation des libéralités sur la quotité disponible et réduction (art. 923 et 924 C. civ.).
  function tableauReduction(s, c) {
    const red = c.reduction;
    if (!red || (!red.imputees.length && !red.legs.length && !c.L)) return null;
    const nomBenef = (id) => (beneficiaires(s, true).find((b) => b.value === id) || {}).label || id || '—';
    const rows = red.imputees.map((x) => ({
      lib: 'Donation' + (x.don.date ? ' du ' + fmtDate(x.don.date) : '') + (x.don.surplusPartage ? ' (donation-partage, part excédant la réserve)' : engine.nature(x.don) === 'horsPart' ? ' hors part' : ''), benef: nomBenef(x.don.beneficiaire), valeur: x.valeur, impute: x.impute, reduction: x.exces,
      effet: x.exces > 0.5 ? (x.heritier ? 'imputée sur sa part de réserve' : 'indemnité due à la succession') : '',
    }));
    if (red.legs.length) {
      red.legs.forEach((x) => rows.push({ lib: 'Legs', benef: x.legs.beneficiaire ? nomBenef(x.legs.beneficiaire) : x.legs.nom || 'Légataire', valeur: x.valeur, impute: x.reduit, reduction: x.valeur - x.reduit, effet: 'legs réduit' }));
    } else if (c.L) rows.push({ lib: 'Legs', benef: '', valeur: c.L, impute: c.L, reduction: 0, effet: '' });
    return h('div', { class: 'stack-sm' },
      h('h4', { class: 'param-sub' }, 'Imputation sur la quotité disponible (' + fmtEuro(c.qdo * c.M) + ')'),
      ui.table([
        { label: 'Libéralité', key: 'lib' }, { label: 'Bénéficiaire', key: 'benef' },
        { label: 'Valeur', num: true, render: (x) => fmtEuro(x.valeur) },
        { label: 'Imputé sur la QD', num: true, render: (x) => fmtEuro(x.impute) },
        { label: 'Réduction', num: true, className: 'col-strong', render: (x) => (x.reduction > 0.5 ? fmtEuro(x.reduction) : '—') },
        { label: '', render: (x) => h('span', { class: 'small muted' }, x.effet) },
      ], rows, { compact: true }),
      h('p', { class: 'small muted' }, 'Les donations s\'imputent de la plus ancienne à la plus récente ; les legs viennent ensuite et sont réduits les premiers, au prorata (art. 923). La réduction se fait en valeur (art. 924).'));
  }
  function detailFiscal(s, r, p) {
    const sc = r.scenarios[0];
    if (!sc) return null;
    const A2 = sc.rep.A;
    const rp = s.abattementRP ? s.biens.find((b) => b.residencePrincipale) : null;
    const lignes = [{ l: 'Actif net civil', v: A2 }];
    if (rp) lignes.push({ l: 'Abattement de ' + fmtPct(p.fiscal.abattementRP, 0) + ' sur la résidence principale', v: null, note: rp.designation || '' });
    if ((s.fraisFuneraires || 0) > p.fiscal.forfaitFuneraire) lignes.push({ l: 'Frais funéraires non déductibles au-delà de ' + fmtEuro(p.fiscal.forfaitFuneraire), v: s.fraisFuneraires - p.fiscal.forfaitFuneraire });
    lignes.push({ l: 'Coefficient appliqué aux parts reçues', v: null, note: fmtPct(sc.fisc.coef, 2), total: true });
    // Rappel fiscal : donations du défunt de moins de 15 ans, qu'elles soient en avancement de part ou hors part.
    const deces = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.dateDeces || '');
    const limite = deces ? (+deces[1] - p.fiscal.delaiRappel) + '-' + deces[2] + '-' + deces[3] : null;
    const rappels = sc.fisc.lignes.filter((x) => !x.conjoint).map((x) => {
      const dons = s.donations.filter((d) => d.beneficiaire === x.id && isNum(d.valeur));
      return { x, dons, recents: dons.filter((d) => limite && d.date && d.date > limite) };
    }).filter((y) => y.dons.length);
    const tableRappel = rappels.length ? h('div', { class: 'stack-sm' },
      h('h4', { class: 'param-sub' }, 'Rappel des donations antérieures (art. 784 CGI)'),
      ui.table([
        { label: 'Bénéficiaire', render: (y) => y.x.nom },
        { label: 'Donations', render: (y) => h('div', null, y.dons.map((d) => h('div', { class: 'small' }, fmtDate(d.date) + ' — ' + fmtEuro(isNum(d.montantFiscal) ? d.montantFiscal : d.valeur) + (natureCourte(d) ? ' (' + natureCourte(d) + ')' : '') + (y.recents.includes(d) ? '' : ' : plus de ' + p.fiscal.delaiRappel + ' ans, non rappelée')))) },
        { label: 'Montant rappelé', num: true, render: (y) => fmtEuro(y.x.rappel) },
        { label: 'Abattement', num: true, render: (y) => fmtEuro(y.x.abattementTotal) },
        { label: 'Abattement restant', num: true, className: 'col-strong', render: (y) => fmtEuro(Math.max(0, y.x.abattementTotal - y.x.rappel)) },
      ], rappels, { compact: true }),
      h('p', { class: 'small muted' }, 'Fiscalement, toutes les donations consenties par le défunt depuis moins de ' + p.fiscal.delaiRappel + ' ans consomment l\'abattement du bénéficiaire, y compris celles faites hors part successorale (qui, civilement, s\'imputent sur la quotité disponible). Seule la part donnée par le défunt est à saisir pour une donation faite par les deux époux.')) : null;
    return ui.card('Passage à l\'actif fiscal', h('div', { class: 'stack' }, tableauCalcul(lignes), tableRappel), { subtitle: 'Les droits sont ensuite liquidés pour chaque bénéficiaire (onglet Résultats) : abattement, rappel des donations de moins de ' + p.fiscal.delaiRappel + ' ans, barème selon le lien de parenté.' });
  }
  function tabDetail(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' }, ctx.live((r) => {
      const p = parametres(ctx.params());
      return [].concat(
        detailLiquidation(s, r),
        detailMasse(s, r),
        h('h3', { class: 'section-title' }, 'Droits de chacun, option par option'),
        r.scenarios.map((sc) => detailOption(s, sc, r.usufruit)),
        detailFiscal(s, r, p),
      ).filter(Boolean);
    }));
  }

  /* ---------- Résultats ---------- */
  const LIBELLE_LIEN = Object.fromEntries(engine.LIENS.map((l) => [l.id, l.libelle]));
  function tableRepartition(sc, s, compact) {
    const lignes = sc.fisc.lignes.slice();
    const conj = sc.conjoint;
    const lc = { nom: nomConjoint(s), lien: 'conjoint', pp: conj.pp, np: 0, us: conj.usValeur, viager: conj.viager, valeur: conj.valeur, abattement: null, resteTaxable: null, droits: 0, totalDroits: 0, conjoint: true };
    const rows = (s.regime === 'aucun' || (!conj.valeur && s.regime === 'pacs') ? [] : [lc]).concat(lignes);
    const cols = [
      { label: 'Bénéficiaire', render: (x) => h('span', null, x.nom, h('div', { class: 'small muted' }, x.lien === '' ? '' : x.conjoint ? (s.regime === 'pacs' ? 'partenaire' : 'conjoint') : (LIBELLE_LIEN[x.lien] || x.lien).toLowerCase() + (x.represente ? ', représente ' + x.represente.nom : ''))) },
      { label: 'Pleine propriété', num: true, render: (x) => (x.pp ? fmtEuro(x.pp) : '—') },
      { label: 'Usufruit / habitation', num: true, render: (x) => (x.conjoint ? (x.us || x.viager ? fmtEuro(x.us + x.viager) : '—') : '') },
      { label: 'Nue-propriété', num: true, render: (x) => (x.np ? fmtEuro(x.np * (1 - sc.rep.us)) + (compact ? '' : ' (sur ' + fmtEuro(x.np) + ')') : '') },
      { label: 'Valeur reçue', num: true, className: 'col-strong', render: (x) => fmtEuro(x.valeur) },
      compact ? null : { label: 'Abattement', num: true, render: (x) => (x.conjoint ? 'exonéré' : fmtEuro(x.abattement)) },
      compact ? null : { label: 'Reste taxable', num: true, render: (x) => (x.conjoint ? '' : fmtEuro(x.resteTaxable)) },
      { label: 'Droits', num: true, className: 'col-strong', render: (x) => (x.conjoint ? '0 €' : fmtEuro(x.droits)) },
      sc.fisc.lignes.some((x) => x.droits990) ? { label: 'Assurance-vie (990 I)', num: true, render: (x) => (x.droits990 ? fmtEuro(x.droits990) : '') } : null,
    ].filter(Boolean);
    return h('div', { class: 'conj-table' }, ui.table(cols, rows, { compact: true, total: { nom: 'Total', conjoint: false, pp: null, np: 0, valeur: sum(rows, (x) => x.valeur), abattement: null, resteTaxable: null, droits: sum(lignes, (x) => x.droits), droits990: sum(lignes, (x) => x.droits990 || 0), lien: '' } }));
  }
  const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);

  function comparatif(r, s) {
    const best = r.meilleure;
    return ui.table([
      { label: 'Option', render: (x) => h('span', null, h('b', null, x.court), ' ', h('span', { class: 'small muted' }, x.libelle)) },
      { label: s.regime === 'pacs' ? 'Partenaire' : 'Conjoint', num: true, render: (x) => fmtEuro(x.conjoint.valeur) },
      { label: 'dont pleine propriété', num: true, render: (x) => fmtEuro(x.conjoint.pp) },
      { label: 'dont usufruit', num: true, render: (x) => fmtEuro(x.conjoint.usValeur + x.conjoint.viager) },
      { label: 'Autres bénéficiaires', num: true, render: (x) => fmtEuro(sum(x.fisc.lignes, (l) => l.valeur)) },
      { label: 'Droits de succession', num: true, className: 'col-strong', render: (x) => fmtEuro(x.totalDroits) },
    ], r.scenarios.map((x) => Object.assign({ __class: r.scenarios.length > 1 && x === best ? 'row-best' : '' }, x)), { compact: true });
  }

  function tabResultats(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' }, ctx.live((r) => [
      ui.card('Comparatif des options', h('div', { class: 'stack-sm' },
        comparatif(r, s),
        h('p', { class: 'small muted' }, 'Usufruit évalué à ' + fmtPct(r.usufruit, 0) + ' (art. 669 CGI, ' + (isNum(s.conjoint.age) ? s.conjoint.age + ' ans' : 'âge non renseigné') + '). Actif net de succession : ' + fmtEuro(r.liquidation.actifNet) + '.'),
        r.alertes.map((a) => ui.badge(false, a)))),
    ].concat(r.scenarios.map((sc) => ui.card(sc.libelle, h('div', { class: 'stack-sm' },
      tableRepartition(sc, s),
      sc.alertes.map((a) => ui.badge(false, a))), { subtitle: 'Total des droits : ' + fmtEuro(sc.totalDroits), className: 'card-hyp' })))));
  }

  /* ---------- Synthèse ---------- */
  function hypotheses(s, r, p) {
    const reg = regimeDe(s);
    return [
      'Situation : ' + reg.libelle.toLowerCase() + '. Actif net de succession : ' + fmtEuro(r.liquidation.actifNet) + (r.liquidation.manuel ? ' (montant saisi)' : '') + '.',
      reg.marie || reg.id === 'pacs' ? 'Usufruit évalué selon le barème de l\'article 669 CGI : ' + fmtPct(r.usufruit, 0) + '.' : null,
      reg.marie ? 'Droits légaux du conjoint : art. 757 à 757-3 C. civ. ; libéralités entre époux : art. 1094-1 C. civ.' : null,
      'Droits de succession : conjoint et partenaire pacsé exonérés (art. 796-0 bis CGI) ; abattement de ' + fmtEuro(p.abattEnfant) + ' en ligne directe, barèmes de l\'article 777 CGI ; donations de moins de ' + p.fiscal.delaiRappel + ' ans rappelées.',
      s.logementViager.actif ? 'Droit viager au logement évalué à ' + fmtPct(p.coefHabitation, 0) + ' de l\'usufruit et imputé sur les droits du conjoint.' : null,
    ].filter(Boolean);
  }
  function vueSynthese(s, r, p) {
    const best = r.meilleure;
    const bars = A.charts.stackedBars(
      r.scenarios.map((x) => ({ label: x.court, parts: [x.totalDroits], highlight: r.scenarios.length > 1 && x === best })),
      [{ label: 'Droits de succession', color: COULEURS.droits }], { title: 'Droits à payer selon l\'option' });
    const valeurs = A.charts.stackedBars(
      r.scenarios.map((x) => ({ label: x.court, parts: [x.conjoint.valeur, sum(x.fisc.lignes, (l) => l.valeur)] })),
      [{ label: s.regime === 'pacs' ? 'Partenaire' : 'Conjoint', color: COULEURS.conjoint }, { label: 'Autres bénéficiaires', color: COULEURS.heritiers }], { title: 'Ce que reçoit chacun' });
    return h('div', { class: 'synthese' },
      h('div', { class: 'synthese-head' },
        h('h2', null, s.defunt.nom ? 'Succession de ' + s.defunt.nom : 'Droits du conjoint survivant'),
        h('p', null, [s.reference, s.dateDeces ? 'décès le ' + fmtDate(s.dateDeces) : null].filter(Boolean).join(' — '))),
      h('div', { class: 'bilan' },
        ui.stat('Actif net de succession', fmtEuro(r.liquidation.actifNet), null, 'strong'),
        ui.stat('Usufruit (art. 669)', fmtPct(r.usufruit, 0)),
        ui.stat('Option la moins taxée', best ? best.court : '—', best ? fmtEuro(best.totalDroits) + ' de droits' : null, 'good')),
      h('h3', { class: 'section-title' }, 'Comparatif des options'), comparatif(r, s),
      h('div', { class: 'charts' }, valeurs, bars),
      r.scenarios.map((sc) => [h('h3', { class: 'section-title' }, sc.libelle), tableRepartition(sc, s, true)]),
      h('h3', { class: 'section-title' }, 'Hypothèses retenues'),
      h('ul', { class: 'bullets small' }, hypotheses(s, r, p).concat(r.alertes).map((x) => h('li', null, x))));
  }
  // Données saisies, pour le dossier complet.
  function donneesSaisies(s, r) {
    const reg = regimeDe(s);
    const out = [];
    const t = (titre, cols, rows) => (rows.length ? [h('h3', { class: 'section-title' }, titre), ui.table(cols, rows, { compact: true })] : null);
    const STAT = { vivant: 'vivant', predecede: 'prédécédé', renonce: 'renonçant' };
    out.push(t('Défunt et conjoint', [{ label: '', key: 'l' }, { label: '', key: 'v' }], [
      { l: 'Défunt', v: s.defunt.nom || '—' }, { l: 'Date du décès', v: fmtDate(s.dateDeces) || '—' }, { l: 'Situation', v: reg.libelle },
      reg.id !== 'aucun' ? { l: reg.id === 'pacs' ? 'Partenaire' : 'Conjoint survivant', v: (s.conjoint.nom || '—') + (isNum(s.conjoint.age) ? ', ' + s.conjoint.age + ' ans' : '') } : null,
    ].filter(Boolean)));
    const pers = [].concat(
      s.enfants.filter((x) => x.nom).map((x) => ({ nom: x.nom, qualite: 'Enfant' + (reg.marie && x.commun === false ? ' (non commun)' : ''), statut: STAT[x.statut || 'vivant'], handicape: x.handicape })),
      s.petitsEnfants.filter((x) => x.nom).map((x) => ({ nom: x.nom, qualite: 'Petit-enfant, représente ' + ((s.enfants.find((e) => e.id === x.parent) || {}).nom || '—'), statut: '', handicape: x.handicape })),
      s.pere.vivant ? [{ nom: s.pere.nom || 'Père', qualite: 'Père', statut: 'vivant' }] : [],
      s.mere.vivant ? [{ nom: s.mere.nom || 'Mère', qualite: 'Mère', statut: 'vivante' }] : [],
      s.fratrie.filter((x) => x.nom).map((x) => ({ nom: x.nom, qualite: 'Frère ou sœur', statut: STAT[x.statut || 'vivant'], handicape: x.handicape })),
      s.neveux.filter((x) => x.nom).map((x) => ({ nom: x.nom, qualite: 'Neveu ou nièce, représente ' + ((s.fratrie.find((e) => e.id === x.parent) || {}).nom || '—'), statut: '' })),
      s.autres.filter((x) => x.nom).map((x) => ({ nom: x.nom, qualite: LIBELLE_LIEN[x.lien] || 'Héritier', statut: '' })));
    out.push(t('Héritiers', [{ label: 'Nom', key: 'nom' }, { label: 'Qualité', key: 'qualite' }, { label: 'Situation', key: 'statut' }, { label: 'Handicapé', render: (x) => (x.handicape ? 'oui' : '') }], pers));
    const PROP = { commun: 'Commun', defunt: 'Propre du défunt', conjoint: 'Propre du survivant', indivis: 'Indivis' };
    out.push(t('Biens', [
      { label: 'Désignation', render: (x) => x.designation || '—' },
      { label: 'Propriété', render: (x) => PROP[x.propriete] + (x.propriete === 'indivis' ? ' (' + fmtPct(x.quoteDefunt || 0, 0) + ' au défunt)' : '') },
      { label: 'Particularités', render: (x) => [x.residencePrincipale ? 'résidence principale' : '', x.familial ? 'bien de famille' : ''].filter(Boolean).join(', ') },
      { label: 'Valeur', num: true, render: (x) => fmtEuro(x.valeur) },
    ], s.biens.filter((b) => isNum(b.valeur))));
    out.push(t('Passif', [{ label: 'Dette', render: (x) => x.libelle || '—' }, { label: 'Charge', render: (x) => (x.charge === 'commun' && reg.communaute ? 'Communauté' : 'Défunt') }, { label: 'Montant', num: true, render: (x) => fmtEuro(x.montant) }],
      s.passif.filter((x) => isNum(x.montant)).concat(isNum(s.fraisFuneraires) && s.fraisFuneraires ? [{ libelle: 'Frais funéraires', charge: 'defunt', montant: s.fraisFuneraires }] : [])));
    out.push(t('Récompenses', [
      { label: 'Objet', render: (x) => x.libelle || '—' },
      { label: 'Sens', render: (x) => (x.sens === 'du' ? 'Due par la communauté ' : 'Due à la communauté par ') + (x.epoux === 'defunt' ? (x.sens === 'du' ? 'au défunt' : 'le défunt') : (x.sens === 'du' ? 'au survivant' : 'le survivant')) },
      { label: 'Calcul', render: (x) => (x.mode === 'calcul' ? 'dépense ' + fmtEuro(x.calcul.depense) + ', profit subsistant ' + fmtEuro(engine.recompense(x.calcul).profit) : 'saisie') },
      { label: 'Montant', num: true, render: (x) => fmtEuro(x.montantCalcule) },
    ], r.liquidation.recompenses));
    const nomBenef = (id) => (id === 'conjoint' ? nomConjoint(s) : (beneficiaires(s, true).find((b) => b.value === id) || {}).label || '—');
    out.push(t('Donations antérieures', [
      { label: 'Bénéficiaire', render: (x) => nomBenef(x.beneficiaire) }, { label: 'Date', render: (x) => fmtDate(x.date) },
      { label: 'Nature', render: (x) => (NATURES.find((y) => y.value === engine.nature(x)) || NATURES[0]).label },
      { label: 'Valeur au décès', num: true, render: (x) => fmtEuro(x.valeur) }, { label: 'Montant déclaré', num: true, render: (x) => fmtEuro(isNum(x.montantFiscal) ? x.montantFiscal : x.valeur) },
    ], s.donations.filter((x) => isNum(x.valeur))));
    const lc = s.liberaliteConjoint;
    if (lc.type !== 'aucune') {
      const c = lc.cantonnement || {};
      out.push(t('Libéralité au conjoint', [{ label: '', key: 'l' }, { label: '', key: 'v' }], [
        { l: 'Nature', v: lc.type === 'ddv' ? 'Donation entre époux' : 'Testament' },
        { l: 'Cantonnement', v: c.mode === 'fraction' ? fmtPct(c.fraction || 0, 0) + ' de l\'option choisie' : c.mode === 'biens' ? s.biens.filter((b) => (c.biens || []).includes(b.id)).map((b) => b.designation).join(', ') || '—' : 'Aucun' },
        s.logementViager.actif ? { l: 'Droit viager au logement', v: 'Oui' } : null,
      ].filter(Boolean)));
    }
    out.push(t('Legs', [
      { label: 'Bénéficiaire', render: (x) => (x.beneficiaire ? nomBenef(x.beneficiaire) : (x.nom || '—') + ' (' + (LIBELLE_LIEN[x.lien] || '').toLowerCase() + ')') },
      { label: 'Legs', num: true, render: (x) => (x.mode === 'quotite' ? fmtPct(x.quotite || 0, 2) : fmtEuro(x.montant)) },
    ], s.legs.filter((x) => x.beneficiaire || x.nom)));
    out.push(t('Assurance-vie', [
      { label: 'Bénéficiaire', render: (x) => nomBenef(x.beneficiaire) },
      { label: 'Capital (primes avant 70 ans)', num: true, render: (x) => fmtEuro(x.capitalAvant70) }, { label: 'Primes après 70 ans', num: true, render: (x) => fmtEuro(x.primesApres70) },
    ], s.assurancesVie.filter((x) => x.beneficiaire)));
    return out.filter(Boolean);
  }

  function documentSynthese(s, r, p, complet) {
    const body = [vueSynthese(s, r, p)];
    if (complet) {
      body.push(
        h('div', { class: 'page-break' }),
        h('h2', null, 'Données du dossier'),
        donneesSaisies(s, r),
        h('div', { class: 'page-break' }),
        h('h2', null, 'Détail des calculs'),
        detailLiquidation(s, r), detailMasse(s, r),
        r.scenarios.map((sc) => detailOption(s, sc, r.usufruit)),
        detailFiscal(s, r, p),
        h('div', { class: 'page-break' }),
        h('h2', null, 'Résultats détaillés par option'),
        r.scenarios.map((sc) => h('div', { class: 'hyp-conj' }, h('h3', { class: 'section-title' }, sc.libelle + ' — droits : ' + fmtEuro(sc.totalDroits)), tableRepartition(sc, s), sc.alertes.length ? h('ul', { class: 'bullets small' }, sc.alertes.map((a) => h('li', null, a))) : null)));
    }
    return ui.printDoc({
      title: complet ? 'Droits du conjoint survivant — dossier complet' : 'Droits du conjoint survivant',
      subtitle: s.reference || s.defunt.nom || null,
      meta: [h('div', { class: 'kv' }, h('span', null, 'Édité le'), h('strong', null, fmtDate(todayISO())))],
      body,
      footer: 'Simulation indicative et non contractuelle, établie d\'après les informations communiquées et la législation en vigueur ; elle ne remplace pas un conseil personnalisé.',
    });
  }
  async function telechargerPdf(ctx, complet) {
    const s = ctx.state;
    const nom = (complet ? 'dossier-' : '') + 'conjoint-survivant-' + (A.util.slug(s.reference || s.defunt.nom) || 'dossier') + '-' + todayISO() + '.pdf';
    try {
      ui.toast('Préparation du PDF…');
      await A.pdf.telecharger(documentSynthese(s, ctx.result, parametres(ctx.params()), complet), nom);
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
      ui.card(null, ctx.live((r) => vueSynthese(ctx.state, r, parametres(ctx.params()))), { className: 'card-doc' }));
  }

  function aside(ctx) {
    return ui.card('En un coup d\'œil', ctx.live((r) => {
      const best = r.meilleure;
      return [
        h('ul', { class: 'aside-list' },
          h('li', null, h('span', null, 'Actif net'), h('strong', null, fmtEuro(r.liquidation.actifNet))),
          r.scenarios.map((x) => h('li', { class: r.scenarios.length > 1 && x === best ? 'is-best' : '' }, h('span', null, x.court), h('strong', null, fmtEuro(x.totalDroits))))),
        best && r.scenarios.length > 1 ? h('div', { class: 'aside-total' }, h('span', null, 'Option la moins taxée'), h('strong', null, best.court)) : null,
        h('div', { class: 'aside-checks' }, r.alertes.map((a) => ui.badge(false, a))),
        ui.button('Voir la synthèse client', { variant: 'soft', small: true, onClick: () => ctx.goTab('synthese') }),
      ];
    }), { className: 'aside-card' });
  }
  async function print(ctx) {
    const choix = await ui.dialog('Imprimer ou enregistrer en PDF', 'Le dossier complet reprend la synthèse, les données saisies, le détail des calculs et les résultats de chaque option. Le PDF est enregistré directement dans vos téléchargements.', [
      { label: 'Annuler', value: null, variant: 'ghost' },
      { label: 'Imprimer le dossier complet', value: 'imprimer-complet', variant: 'ghost' },
      { label: 'Imprimer la synthèse', value: 'imprimer', variant: 'ghost' },
      { label: 'Dossier complet en PDF', value: 'pdf-complet', variant: 'soft' },
      { label: 'Synthèse en PDF', value: 'pdf', variant: 'primary' },
    ]);
    if (!choix) return;
    if (choix.startsWith('pdf')) return telechargerPdf(ctx, choix === 'pdf-complet');
    ui.print(documentSynthese(ctx.state, ctx.result, parametres(ctx.params()), choix === 'imprimer-complet'), 'Conjoint survivant');
  }

  function normalize(s) {
    const e = empty();
    ['defunt', 'conjoint', 'pere', 'mere', 'avantages', 'participation', 'liberaliteConjoint', 'logementViager'].forEach((k) => (s[k] = Object.assign({}, e[k], s[k] || {})));
    s.liberaliteConjoint.cantonnement = Object.assign({}, e.liberaliteConjoint.cantonnement, s.liberaliteConjoint.cantonnement || {});
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'conjoint', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.reference || s.defunt.nom,
    tabs: [
      { id: 'famille', label: 'Famille', render: tabFamille },
      { id: 'patrimoine', label: 'Patrimoine et liquidation', render: tabPatrimoine },
      { id: 'liberalites', label: 'Libéralités', render: tabLiberalites },
      { id: 'detail', label: 'Détail des calculs', render: tabDetail },
      { id: 'resultats', label: 'Résultats', render: tabResultats },
      { id: 'synthese', label: 'Synthèse client', render: tabSynthese },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
