/*
 * Supports visuels : présentations complémentaires (démembrement, abattements, réserve héréditaire,
 * mariage / pacs / union libre, donation entre époux, frais d'acquisition).
 * Elles utilisent le lecteur et les dessins de l'application « Supports visuels ».
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, fmtEuro, fmtPct } = A.util;
  const ui = A.ui;
  const E = A.engines.supports;
  const S = A.supports;
  const { dessin, e, fraction, equation, camembert, champ } = S.aides;

  // Barèmes et abattements de l'application « Paramètres ».
  function params() {
    const g = A.store.getParams();
    const f = (g.conjoint && g.conjoint.fiscal) || {};
    return Object.assign({}, E.PARAMS_DEFAUT, {
      bareme669: g.commun.bareme669, bareme777: g.succession.bareme777,
      abattEnfant: g.succession.abattEnfant, abattPetitEnfant: g.succession.abattPetitEnfant,
      donFamilial: g.succession.donFamilial, ageLimiteDonFamilial: g.succession.ageLimiteDonFamilial,
      abattTiers: f.abattDefaut || E.PARAMS_DEFAUT.abattTiers,
      tauxTiers: (f.baremeTiers && f.baremeTiers[0] && f.baremeTiers[0].taux) || E.PARAMS_DEFAUT.tauxTiers,
    });
  }
  const pct = (x, d) => fmtPct(x, d === undefined ? 0 : d);
  const nb = (v, min) => Math.max(min || 0, Math.round(v || 0));
  const puce = (icone, texte, cls) => h('p', { class: 'sv-puce ' + (cls || '') }, dessin(icone), texte);
  const bulle = (icone, texte, cls) => h('p', { class: 'sv-bulle-info ' + (cls || '') }, dessin(icone), texte);
  const titre = (icone, t, sous, extra) => h('div', { class: 'sv-titre-diapo' }, dessin(icone, 'sv-grand sv-rose'), h('h1', null, t), h('p', { class: 'sv-sous-titre' }, sous), extra ? e(1, extra) : null);
  const ligneVal = (lib, valeur, cls, detail) => h('div', { class: 'sv-ld ' + (cls || '') }, h('span', { class: 'sv-ld-lib' }, lib), h('span', { class: 'sv-ld-val' }, typeof valeur === 'number' ? fmtEuro(valeur) : valeur), detail ? h('small', null, detail) : null);
  const segments = (opts, valeur, onChange) => ui.segmented({ value: valeur, small: true, options: opts, onChange });

  /* ======================================================================
     1. Démembrement de propriété
     ====================================================================== */
  const TRANCHES_669 = ['moins de 21 ans', '21 à 30', '31 à 40', '41 à 50', '51 à 60', '61 à 70', '71 à 80', '81 à 90', '91 et plus'];
  S.ajouter({
    id: 'demembrement',
    cle: 'demembrement',
    exemple: E.EXEMPLES.demembrement,
    titre: 'Donner la nue-propriété, garder l\'usufruit',
    resume: 'Le démembrement de propriété : la maison coupée en deux, la valeur de l\'usufruit selon l\'âge, l\'économie de droits.',
    icone: 'maison',
    panneau: (d, maj) => {
      const { nb: n, tx } = champ(maj);
      return [h('div', { class: 'sv-panneau-bloc' },
        ui.field('Bien donné', tx(d, 'bien')), ui.field('Valeur', n(d, 'valeur')),
        ui.field('Âge des donateurs', ui.numberInput({ value: d.age, suffix: 'ans', onChange: (v) => { d.age = nb(v); maj(); } })),
        ui.field('Donateurs', segments([{ value: 1, label: 'Un parent' }, { value: 2, label: 'Les deux parents' }], d.donateurs, (v) => { d.donateurs = v; maj(); })),
        ui.field('Nombre d\'enfants', ui.numberInput({ value: d.enfants, onChange: (v) => { d.enfants = nb(v, 1); maj(); } })))];
    },
    diapos: [
      { etapes: 0, rendu: (d) => titre('maison', 'Donner la nue-propriété, garder l\'usufruit', 'Le démembrement de propriété') },
      {
        titre: 'Une propriété en deux morceaux',
        etapes: 3,
        rendu: (d) => h('div', { class: 'sv-maison-schema' },
          h('div', { class: 'sv-maison' },
            h('div', { class: 'sv-toit' }),
            e(1, h('div', { class: 'sv-usufruit' }, h('small', null, 'L\'usufruit'), h('strong', null, d.donateurs > 1 ? 'Vous deux' : 'Vous'), h('span', null, 'toute votre vie'))),
            e(2, h('div', { class: 'sv-murs' }, h('small', null, 'La nue-propriété'), h('div', { class: 'sv-murs-enfants' }, h('span', { class: 'sv-mur', style: { '--c': '#34a483' } }, d.enfants > 1 ? 'Vos enfants' : 'Votre enfant'))))),
          h('div', { class: 'sv-col' },
            e(1, puce('cle', 'L\'usufruit : le droit d\'utiliser le bien (y habiter) ou d\'en percevoir les revenus (les loyers).')),
            e(2, puce('enfants', 'La nue-propriété : être propriétaire, sans pouvoir utiliser le bien pour l\'instant.')),
            e(3, puce('sablier', 'Au décès de l\'usufruitier, l\'usufruit disparaît : les enfants deviennent pleinement propriétaires.')))),
      },
      {
        titre: 'Combien vaut l\'usufruit ?',
        etapes: 2,
        rendu: (d) => {
          const p = params();
          const us = E.valeurUsufruit(p.bareme669, d.age);
          return h('div', { class: 'sv-col' },
            h('p', { class: 'sv-intro' }, 'L\'administration fiscale fixe la valeur de l\'usufruit selon l\'âge de l\'usufruitier : plus il est jeune, plus l\'usufruit vaut cher.'),
            h('div', { class: 'sv-bareme' }, p.bareme669.map((r, i) => h('div', { class: ['sv-bareme-col', r.usufruit === us ? 'is-on' : ''] },
              h('div', { class: 'sv-bareme-barre' },
                h('div', { class: 'sv-bareme-us', style: { height: r.usufruit * 100 + '%' } }, pct(r.usufruit)),
                h('div', { class: 'sv-bareme-np', style: { height: (1 - r.usufruit) * 100 + '%' } }, pct(1 - r.usufruit))),
              h('small', null, TRANCHES_669[i] || r.age + ' ans')))),
            h('div', { class: 'sv-legende' }, h('span', { style: { '--c': '#ee7552' } }, h('i'), 'Usufruit'), h('span', { style: { '--c': '#34a483' } }, h('i'), 'Nue-propriété')),
            e(1, bulle('sablier', 'À ' + d.age + ' ans, l\'usufruit vaut ' + pct(us) + ' du bien et la nue-propriété ' + pct(1 - us) + '.')),
            e(2, h('p', { class: 'sv-note' }, 'Barème de l\'article 669 du Code général des impôts.')));
        },
      },
      {
        titre: (d) => d.bien || 'Votre bien',
        etapes: 2,
        rendu: (d) => {
          const r = E.demembrement(d, params());
          return h('div', { class: 'sv-col' },
            h('div', { class: 'sv-paye sv-grosse' }, h('span', { class: 'sv-paye-b', style: { flex: r.us } }, 'Usufruit ' + fmtEuro(r.valeurUsufruit)), h('span', { class: 'sv-paye-vert', style: { flex: r.np } }, 'Nue-propriété ' + fmtEuro(r.valeurNuePropriete))),
            e(1, h('div', { class: 'sv-calcul sv-enfants' }, h('h3', null, 'Ce qui est donné aux enfants'),
              equation([[r.valeur, 'valeur du bien', 'gris'], '×', [pct(r.np), 'nue-propriété', 'texte'], '=', [r.valeurNuePropriete, 'valeur taxable', 'total']]))),
            e(2, bulle('maison', (d.donateurs > 1 ? 'Vous gardez' : 'Vous gardez') + ' l\'usage du bien : seule la nue-propriété est donnée.')));
        },
      },
      {
        titre: 'Les droits de donation',
        etapes: 3,
        rendu: (d) => {
          const r = E.demembrement(d, params());
          const carte = (x, t, cls) => h('div', { class: 'sv-calcul sv-' + cls }, h('h3', null, t),
            ligneVal('Chaque enfant reçoit', x.recuParEnfant),
            ligneVal('Abattement', '− ' + fmtEuro(x.abattementParEnfant), '', r.donateurs > 1 ? '100 000 € par parent' : 'renouvelable tous les 15 ans'),
            ligneVal('Part taxée', x.taxableParEnfant),
            ligneVal('Droits pour ' + (r.enfants > 1 ? 'les ' + r.enfants + ' enfants' : 'l\'enfant'), x.total, 'sv-ld-total'));
          return h('div', { class: 'sv-col' },
            h('div', { class: 'sv-deux' }, e(1, carte(r.pp, 'Donner la pleine propriété', 'sep')), e(2, carte(r.nuePropriete, 'Donner la nue-propriété', 'enfants'))),
            e(3, r.economie > 0.5 ? bulle('bouclier', 'En donnant seulement la nue-propriété : ' + fmtEuro(r.economie) + ' de droits en moins.') : bulle('bouclier', 'Les abattements suffisent : aucun droit à payer.')));
        },
      },
      {
        titre: 'Et au décès ?',
        etapes: 2,
        rendu: () => h('div', { class: 'sv-col' },
          h('div', { class: 'sv-flux' },
            h('div', { class: 'sv-flux-depart', style: { '--c': '#ee7552' } }, h('small', null, 'Usufruit'), h('b', null, 'Parents')),
            h('span', { class: 'sv-flux-fleche' }, '+'),
            h('div', { class: 'sv-flux-depart', style: { '--c': '#34a483' } }, h('small', null, 'Nue-propriété'), h('b', null, 'Enfants')),
            e(1, h('span', { class: 'sv-flux-fleche' }, '→')),
            e(1, h('div', { class: 'sv-flux-depart', style: { '--c': '#1e2a44' } }, h('small', null, 'Pleine propriété'), h('b', null, 'Enfants')))),
          e(1, bulle('sablier', 'Au décès, l\'usufruit s\'éteint : les enfants deviennent pleinement propriétaires, sans droits de succession sur ce bien.')),
          e(2, puce('euro', 'Si le bien a pris de la valeur entre-temps, cette hausse leur revient sans droits.'))),
      },
      {
        titre: 'À retenir',
        etapes: 3,
        rendu: () => h('div', { class: 'sv-col' },
          e(1, puce('cle', 'Vous gardez l\'usage du bien ou ses revenus, toute votre vie.', 'sv-grande')),
          e(2, puce('sablier', 'Plus on donne tôt, moins la nue-propriété vaut cher : moins de droits.', 'sv-grande')),
          e(3, puce('calendrier', 'Les abattements (100 000 € par parent et par enfant) se rechargent tous les 15 ans.', 'sv-grande'))),
      },
    ],
  });

  /* ======================================================================
     2. Abattements renouvelables
     ====================================================================== */
  S.ajouter({
    id: 'abattements',
    cle: 'abattements',
    exemple: E.EXEMPLES.abattements,
    titre: 'Donner régulièrement : les abattements',
    resume: 'Les compteurs de donation sans droits, qui se rechargent tous les 15 ans : enfants, petits-enfants, dons d\'argent.',
    icone: 'calendrier',
    panneau: (d, maj) => [h('div', { class: 'sv-panneau-bloc' },
      ui.field('Donateurs', segments([{ value: 1, label: 'Un parent' }, { value: 2, label: 'Les deux parents' }], d.donateurs, (v) => { d.donateurs = v; maj(); })),
      ui.field('Âge des donateurs', ui.numberInput({ value: d.age, suffix: 'ans', onChange: (v) => { d.age = nb(v); maj(); } })),
      ui.field('Enfants', ui.numberInput({ value: d.enfants, onChange: (v) => { d.enfants = nb(v); maj(); } })),
      ui.field('Petits-enfants', ui.numberInput({ value: d.petitsEnfants, onChange: (v) => { d.petitsEnfants = nb(v); maj(); } })),
      ui.field('Jusqu\'à quel âge ?', ui.numberInput({ value: d.ageMax, suffix: 'ans', onChange: (v) => { d.ageMax = nb(v); maj(); } })))],
    diapos: [
      { etapes: 0, rendu: () => titre('calendrier', 'Donner régulièrement', 'Des compteurs qui se rechargent tous les 15 ans') },
      {
        titre: 'Vos compteurs de donation sans droits',
        etapes: 4,
        rendu: () => {
          const p = params();
          const carte = (i, icone, t, montant, sous, cls) => e(i, h('div', { class: 'sv-carte sv-compteur-carte sv-' + cls }, dessin(icone, 'sv-moyen'), h('h3', null, t), h('div', { class: 'sv-montant' }, fmtEuro(montant)), h('p', null, sous)));
          return h('div', { class: 'sv-quatre' },
            carte(1, 'enfants', 'Parent → enfant', p.abattEnfant, 'par parent et par enfant', 'enfants'),
            carte(2, 'coeur', 'Grand-parent → petit-enfant', p.abattPetitEnfant, 'par grand-parent et par petit-enfant', 'indivis'),
            carte(3, 'euro', 'Don d\'argent', p.donFamilial, 'en plus, si le donateur a moins de ' + p.ageLimiteDonFamilial + ' ans et le bénéficiaire est majeur', 'herite'),
            carte(4, 'alliances', 'Entre époux ou partenaires de Pacs', 80724, 'par donation', 'b'));
        },
      },
      {
        titre: 'Ils se rechargent tous les 15 ans',
        etapes: 3,
        rendu: (d) => {
          const r = E.abattements(d, params());
          return h('div', { class: 'sv-col' },
            h('div', { class: 'sv-frise' }, r.cycles.map((c, i) => e(Math.min(i + 1, 3), h('div', { class: 'sv-frise-point' },
              h('div', { class: 'sv-frise-annee' }, String(c.annee)), h('div', { class: 'sv-frise-rond' }, dessin('calendrier')), h('small', null, 'à ' + c.age + ' ans'),
              h('strong', null, fmtEuro(c.total)), h('small', null, 'sans droits'))))),
            h('p', { class: 'sv-note' }, 'Exemple : une donation aujourd\'hui, puis une nouvelle dans 15 ans, puis encore 15 ans plus tard.'));
        },
      },
      {
        titre: 'Pour votre famille, à chaque fois',
        etapes: 3,
        rendu: (d) => {
          const p = params();
          const r = E.abattements(d, p);
          const c = r.cycles[0] || { enfants: 0, petitsEnfants: 0, donFamilial: 0, total: 0 };
          const lignes = [
            [1, d.donateurs + ' parent' + (d.donateurs > 1 ? 's' : '') + ' × ' + d.enfants + ' enfant' + (d.enfants > 1 ? 's' : '') + ' × ' + fmtEuro(p.abattEnfant), c.enfants, 'enfants'],
            d.petitsEnfants ? [2, d.donateurs + ' grand-parent' + (d.donateurs > 1 ? 's' : '') + ' × ' + d.petitsEnfants + ' petit' + (d.petitsEnfants > 1 ? 's' : '') + '-enfant' + (d.petitsEnfants > 1 ? 's' : '') + ' × ' + fmtEuro(p.abattPetitEnfant), c.petitsEnfants, 'indivis'] : null,
            c.donFamilial ? [2, 'Dons d\'argent : ' + d.donateurs + ' × ' + d.enfants + ' × ' + fmtEuro(p.donFamilial), c.donFamilial, 'herite'] : null,
          ].filter(Boolean);
          return h('div', { class: 'sv-col' },
            lignes.map(([i, t, v, cls]) => e(i, ligneVal(t, v, 'sv-ld-' + cls))),
            e(3, ligneVal('Transmis sans aucun droit', c.total, 'sv-ld-total')),
            e(3, bulle('bouclier', 'Et cela peut recommencer tous les 15 ans : jusqu\'à ' + fmtEuro(r.total) + ' sur ' + r.cycles.length + ' donations.')));
        },
      },
      {
        titre: 'Attention : le rappel des 15 ans',
        etapes: 2,
        rendu: () => h('div', { class: 'sv-col' },
          h('div', { class: 'sv-frise sv-frise-rappel' },
            h('div', { class: 'sv-frise-point' }, h('div', { class: 'sv-frise-rond' }, dessin('cadeau')), h('strong', null, 'Donation'), h('small', null, 'abattement utilisé')),
            h('div', { class: 'sv-frise-zone' }, h('span', null, '15 ans')),
            e(1, h('div', { class: 'sv-frise-point' }, h('div', { class: 'sv-frise-rond sv-rouge' }, dessin('sablier')), h('strong', null, 'Décès avant 15 ans'), h('small', null, 'l\'abattement déjà utilisé est déduit')))),
          e(1, puce('sablier', 'Si le décès survient moins de 15 ans après la donation, l\'abattement déjà consommé n\'est pas disponible une seconde fois dans la succession.')),
          e(2, puce('calendrier', 'Au-delà de 15 ans, les compteurs sont à nouveau pleins : d\'où l\'intérêt de commencer tôt.'))),
      },
      {
        titre: 'À retenir',
        etapes: 3,
        rendu: () => h('div', { class: 'sv-col' },
          e(1, puce('enfants', '100 000 € par parent et par enfant, sans droits, tous les 15 ans.', 'sv-grande')),
          e(2, puce('coeur', 'Les grands-parents peuvent aussi donner à leurs petits-enfants.', 'sv-grande')),
          e(3, puce('calendrier', 'Donner tôt et régulièrement : chaque rechargement est une économie.', 'sv-grande'))),
      },
    ],
  });

  /* ======================================================================
     3. Réserve héréditaire et quotité disponible
     ====================================================================== */
  const VERT = ['#34a483', '#2f9aa8', '#5bb96f', '#3c8dbc', '#7bb661', '#2b7a78'];
  function gateau(r, avecMontants) {
    const parts = [];
    for (let i = 0; i < r.enfants; i++) parts.push({ valeur: r.parEnfant, couleur: VERT[i % VERT.length] });
    if (!r.enfants && r.reservataires === 'conjoint') parts.push({ valeur: r.valeurReserve, couleur: '#ee7552' });
    parts.push({ valeur: r.valeurQd, couleur: '#f0b23a' });
    return h('div', { class: 'sv-gateau-dessin' }, camembert(parts), avecMontants ? h('div', { class: 'sv-gateau-centre' }, fmtEuro(r.masse)) : null);
  }
  S.ajouter({
    id: 'reserve',
    cle: 'reserve',
    exemple: E.EXEMPLES.reserve,
    titre: 'Ce que je peux donner librement',
    resume: 'La réserve héréditaire des enfants et la quotité disponible, en gâteau, selon le nombre d\'enfants.',
    icone: 'gateau',
    panneau: (d, maj) => {
      const { nb: n } = champ(maj);
      return [h('div', { class: 'sv-panneau-bloc' },
        ui.field('Patrimoine (et donations déjà faites)', n(d, 'masse')),
        ui.field('Nombre d\'enfants', ui.numberInput({ value: d.enfants, onChange: (v) => { d.enfants = nb(v); maj(); } })),
        ui.field('Marié(e)', ui.yesNo(d.conjoint, (v) => { d.conjoint = v; maj(); }, true)))];
    },
    diapos: [
      { etapes: 0, rendu: () => titre('gateau', 'Ce que je peux donner librement', 'Réserve héréditaire et quotité disponible') },
      {
        titre: 'Votre patrimoine est un gâteau',
        etapes: 2,
        rendu: (d) => {
          const r = E.reserve(d);
          return h('div', { class: 'sv-gateau' }, gateau(r, true),
            h('div', { class: 'sv-col' },
              e(1, r.enfants ? h('div', { class: 'sv-ligne-enfant', style: { '--c': '#34a483' } }, h('span', { class: 'sv-point' }), h('strong', null, 'La réserve'), h('small', null, 'revient obligatoirement ' + (r.enfants > 1 ? 'à vos ' + r.enfants + ' enfants, ' + fmtEuro(r.parEnfant) + ' chacun' : 'à votre enfant')), h('b', null, fmtEuro(r.valeurReserve)))
                : r.reservataires === 'conjoint' ? h('div', { class: 'sv-ligne-enfant', style: { '--c': '#ee7552' } }, h('span', { class: 'sv-point' }), h('strong', null, 'La réserve du conjoint'), h('small', null, '¼, à défaut d\'enfant'), h('b', null, fmtEuro(r.valeurReserve))) : h('p', { class: 'sv-intro' }, 'Sans enfant ni conjoint : aucune part n\'est réservée.')),
              e(2, h('div', { class: 'sv-ligne-enfant', style: { '--c': '#d99a1e' } }, h('span', { class: 'sv-point' }), h('strong', null, 'La quotité disponible'), h('small', null, fraction(r.qd) + ' : vous en faites ce que vous voulez'), h('b', null, fmtEuro(r.valeurQd))))));
        },
      },
      {
        titre: 'Tout dépend du nombre d\'enfants',
        etapes: 3,
        rendu: (d) => {
          const actif = Math.min(3, Math.max(1, nb(d.enfants)));
          const mini = (i, k, t) => e(i, h('div', { class: ['sv-mini', k === actif && d.enfants ? 'is-on' : ''] }, gateau(E.reserve({ masse: 1, enfants: k }), false), h('strong', null, t), h('small', null, 'libre : ' + fraction(E.reserve({ masse: 1, enfants: k }).qd))));
          return h('div', { class: 'sv-col' },
            h('div', { class: 'sv-trois' }, mini(1, 1, '1 enfant'), mini(2, 2, '2 enfants'), mini(3, 3, '3 enfants ou plus')),
            h('div', { class: 'sv-legende' }, h('span', { style: { '--c': '#34a483' } }, h('i'), 'Réserve des enfants'), h('span', { style: { '--c': '#f0b23a' } }, h('i'), 'Quotité disponible (libre)')));
        },
      },
      {
        titre: 'La part libre : à qui vous voulez',
        etapes: 2,
        rendu: () => h('div', { class: 'sv-col' },
          e(1, h('div', { class: 'sv-jetons-grands' },
            [['coeur', 'Votre conjoint'], ['enfants', 'Un enfant, en plus de sa part'], ['cadeau', 'Un petit-enfant'], ['cle', 'Un ami, un proche'], ['etat', 'Une association']].map(([ic, t]) => h('div', { class: 'sv-jeton-grand' }, dessin(ic, 'sv-moyen'), h('span', null, t))))),
          e(2, bulle('plume', 'Par donation de votre vivant ou par testament.'))),
      },
      {
        titre: 'Et si on donne trop ?',
        etapes: 2,
        rendu: (d) => {
          const r = E.reserve(d);
          return h('div', { class: 'sv-col' },
            e(1, puce('balance', 'Au décès, on additionne le patrimoine restant et les donations déjà faites, pour vérifier que chaque enfant a bien sa réserve.')),
            e(1, puce('alliances', r.enfants ? 'Les enfants sont les seuls « réservataires » ; sans enfant, c\'est le conjoint (¼).' : 'Sans enfant, le conjoint est réservataire pour ¼.')),
            e(2, bulle('balance', 'Si une donation dépasse la part libre, l\'enfant lésé peut demander une indemnité de réduction.', 'sv-alerte')));
        },
      },
      {
        titre: 'À retenir',
        etapes: 3,
        rendu: () => h('div', { class: 'sv-col' },
          e(1, puce('enfants', 'Vos enfants ont droit à une part minimale : la réserve.', 'sv-grande')),
          e(2, puce('gateau', 'Le reste (½, ⅓ ou ¼ selon le nombre d\'enfants) est libre.', 'sv-grande')),
          e(3, puce('plume', 'Testament, donation, assurance-vie : le notaire vous aide à utiliser la part libre.', 'sv-grande'))),
      },
    ],
  });

  /* ======================================================================
     4. Mariage, Pacs ou union libre
     ====================================================================== */
  const OUI = (t) => h('span', { class: 'sv-coche sv-oui' }, '✓ ', t || '');
  const NON = (t) => h('span', { class: 'sv-coche sv-non' }, '✗ ', t || '');
  const MOYEN = (t) => h('span', { class: 'sv-coche sv-moyen-c' }, '~ ', t || '');
  function tableau3(lignes) {
    return h('table', { class: 'sv-compare sv-compare3' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, dessin('alliances'), ' Mariage'), h('th', null, dessin('plume'), ' Pacs'), h('th', null, dessin('coeur'), ' Union libre'))),
      h('tbody', null, lignes.map(([lib, ...cols], i) => h('tr', { class: 'sv-e', 'data-e': i + 1 }, h('td', null, lib), cols.map((c) => h('td', null, c))))));
  }
  S.ajouter({
    id: 'couple',
    cle: 'couple',
    exemple: E.EXEMPLES.couple,
    titre: 'Mariage, Pacs ou union libre ?',
    resume: 'Ce que chaque statut change pour le couple : héritage, droits de succession, logement, réversion, séparation.',
    icone: 'balance',
    panneau: (d, maj) => {
      const { nb: n } = champ(maj);
      return [h('div', { class: 'sv-panneau-bloc' }, ui.field('Montant transmis au partenaire', n(d, 'montant')))];
    },
    diapos: [
      { etapes: 0, rendu: () => titre('alliances', 'Mariage, Pacs ou union libre ?', 'Ce qui change pour votre couple') },
      {
        titre: 'Au décès : qui est protégé ?',
        etapes: 4,
        rendu: () => tableau3([
          ['Hérite sans testament', OUI(), NON('testament indispensable'), NON('testament indispensable')],
          ['Droits de succession', OUI('aucun'), OUI('aucun, avec un testament'), NON('60 %')],
          ['Logement du couple', OUI('gratuit 1 an, puis à vie'), MOYEN('gratuit 1 an'), NON()],
          ['Pension de réversion', OUI(), NON(), NON()],
        ]),
      },
      {
        titre: (d) => 'Exemple : transmettre ' + fmtEuro(d.montant),
        etapes: 3,
        rendu: (d) => {
          const r = E.couple(d, params());
          const col = (i, t, x, icone) => e(i, h('div', { class: 'sv-col3' }, h('h3', null, dessin(icone), t),
            h('div', { class: 'sv-pile' }, x.droits > 0.5 ? h('div', { class: 'sv-pile-impot', style: { flex: x.droits } }, 'Impôt ' + fmtEuro(x.droits)) : null, h('div', { class: 'sv-pile-recu', style: { flex: x.recu } }, fmtEuro(x.recu))),
            h('small', null, x.droits > 0.5 ? 'reçus après impôt' : 'reçus intégralement')));
          return h('div', { class: 'sv-col' },
            h('div', { class: 'sv-trois sv-trois-bas' }, col(1, 'Mariage', r.mariage, 'alliances'), col(2, 'Pacs (avec testament)', r.pacs, 'plume'), col(3, 'Union libre (avec testament)', r.concubinage, 'coeur')),
            e(3, h('p', { class: 'sv-note' }, 'Union libre : droits de 60 % après un abattement de ' + fmtEuro(params().abattTiers) + '. L\'assurance-vie peut atténuer cette taxation.')));
        },
      },
      {
        titre: 'Pendant la vie commune',
        etapes: 3,
        rendu: () => tableau3([
          ['Les biens achetés', 'communs (sauf contrat)', 'à chacun (sauf choix de l\'indivision)', 'à celui qui paie'],
          ['Dettes du ménage', 'solidaires', 'solidaires', 'chacun les siennes'],
          ['Donation entre partenaires', 'abattement de 80 724 €', 'abattement de 80 724 €', '60 % de droits'],
        ]),
      },
      {
        titre: 'En cas de séparation',
        etapes: 3,
        rendu: () => tableau3([
          ['Comment se séparer', 'divorce (avocats, juge ou notaire)', 'simple déclaration', 'aucune formalité'],
          ['Compensation possible', OUI('prestation compensatoire'), NON(), NON()],
          ['Partage des biens', 'liquidation du régime', 'partage de l\'indivision', 'partage de l\'indivision'],
        ]),
      },
      {
        titre: 'À retenir',
        etapes: 3,
        rendu: () => h('div', { class: 'sv-col' },
          e(1, puce('alliances', 'Le mariage est le statut le plus protecteur au décès.', 'sv-grande')),
          e(2, puce('plume', 'Pacsés : sans testament, votre partenaire n\'hérite de rien.', 'sv-grande')),
          e(3, puce('coeur', 'En union libre : testament et assurance-vie sont indispensables pour se protéger.', 'sv-grande'))),
      },
    ],
  });

  /* ======================================================================
     5. Donation entre époux
     ====================================================================== */
  const COUL_CONJ = '#ee7552';
  function gateauOption(o, s) {
    const parts = [];
    if (o.pp) parts.push({ valeur: o.pp, couleur: COUL_CONJ });
    if (o.usufruitSur) parts.push({ valeur: o.usufruitSur, couleur: '#f6b19c' });
    parts.push({ valeur: Math.max(0, s - o.pp - o.usufruitSur), couleur: '#34a483' });
    return h('div', { class: 'sv-gateau-dessin' }, camembert(parts));
  }
  const legendeOptions = () => h('div', { class: 'sv-legende' }, h('span', { style: { '--c': COUL_CONJ } }, h('i'), 'Pleine propriété du conjoint'), h('span', { style: { '--c': '#f6b19c' } }, h('i'), 'Usufruit du conjoint (les enfants ont la nue-propriété)'), h('span', { style: { '--c': '#34a483' } }, h('i'), 'Pleine propriété des enfants'));
  S.ajouter({
    id: 'donation-entre-epoux',
    cle: 'ddv',
    exemple: E.EXEMPLES.donationEpoux,
    titre: 'La donation entre époux',
    resume: 'Les options du conjoint survivant avec et sans donation entre époux, en gâteaux et en valeur selon son âge.',
    icone: 'bouclier',
    panneau: (d, maj) => {
      const { nb: n, tx } = champ(maj);
      return [h('div', { class: 'sv-panneau-bloc' },
        ui.field('Prénom du conjoint survivant', tx(d, 'conjoint')),
        ui.field('Âge du conjoint survivant', ui.numberInput({ value: d.age, suffix: 'ans', onChange: (v) => { d.age = nb(v); maj(); } })),
        ui.field('Succession', n(d, 'succession')),
        ui.field('Enfants (communs)', ui.numberInput({ value: d.enfants, onChange: (v) => { d.enfants = nb(v, 1); maj(); } })))];
    },
    diapos: [
      { etapes: 0, rendu: () => titre('coeur', 'La donation entre époux', 'Mieux protéger son conjoint') },
      {
        titre: 'Sans donation entre époux',
        etapes: 2,
        rendu: (d) => {
          const r = E.donationEpoux(d, params());
          const opt = (i, o) => e(i, h('div', { class: 'sv-mini' }, gateauOption(o, r.succession), h('strong', null, o.libelle)));
          return h('div', { class: 'sv-col' },
            h('p', { class: 'sv-intro' }, 'Avec des enfants communs, ' + d.conjoint + ' choisit entre :'),
            h('div', { class: 'sv-deux sv-deux-centre' }, opt(1, r.options[0]), opt(2, r.options[1])), legendeOptions());
        },
      },
      {
        titre: 'Avec une donation entre époux : plus de choix',
        etapes: 3,
        rendu: (d) => {
          const r = E.donationEpoux(d, params());
          const opt = (i, o) => e(i, h('div', { class: 'sv-mini' }, gateauOption(o, r.succession), h('strong', null, o.code === 'ddv-qd' ? fraction(r.qd) + ' en pleine propriété' : o.libelle)));
          return h('div', { class: 'sv-col' },
            h('div', { class: 'sv-trois' }, opt(1, r.options[2]), opt(2, r.options[3]), opt(3, r.options[4])), legendeOptions());
        },
      },
      {
        titre: (d) => 'En valeur, pour ' + d.conjoint + ' (' + d.age + ' ans)',
        etapes: 2,
        rendu: (d) => {
          const r = E.donationEpoux(d, params());
          const max = r.succession || 1;
          const ligne = (o) => h('div', { class: 'sv-personne sv-personne-large' }, h('div', { class: 'sv-personne-nom' }, h('span', { class: 'sv-tag-opt' + (o.ddv ? ' sv-tag-ddv' : '') }, o.ddv ? 'donation' : 'loi'), o.code === 'ddv-qd' ? fraction(r.qd) + ' en pleine propriété' : o.libelle),
            h('div', { class: 'sv-barre' }, h('div', { class: 'sv-morceau', style: { '--c': COUL_CONJ, width: (100 * o.valeur) / max + '%' } }, h('span', null, fmtEuro(o.valeur))), h('div', { class: 'sv-morceau', style: { '--c': '#34a483', width: (100 * o.enfants) / max + '%' } }, h('span', null, fmtEuro(o.enfants)))));
          const meilleur = r.options.reduce((m, o) => (o.valeur > m.valeur ? o : m), r.options[0]);
          return h('div', { class: 'sv-col' },
            h('p', { class: 'sv-intro' }, 'L\'usufruit est évalué selon l\'âge : à ' + d.age + ' ans, ' + pct(r.us) + ' de la valeur des biens.'),
            r.options.map(ligne),
            h('div', { class: 'sv-legende' }, h('span', { style: { '--c': COUL_CONJ } }, h('i'), 'Ce que reçoit ' + d.conjoint), h('span', { style: { '--c': '#34a483' } }, h('i'), 'Ce que reçoivent les enfants')),
            e(1, bulle('bouclier', 'La donation entre époux permet jusqu\'à ' + fmtEuro(meilleur.valeur) + ' pour ' + d.conjoint + ' (' + meilleur.libelle.toLowerCase() + ').')),
            e(2, h('p', { class: 'sv-note' }, 'Valeurs fiscales (art. 669 du Code général des impôts). Le conjoint ne paie aucun droit de succession.')));
        },
      },
      {
        titre: 'Le choix se fait au décès',
        etapes: 3,
        rendu: (d) => h('div', { class: 'sv-col' },
          e(1, puce('sablier', d.conjoint + ' choisit l\'option au moment du décès, selon ses besoins : rester dans la maison, disposer d\'un capital…')),
          e(2, puce('gateau', 'Le cantonnement : ' + d.conjoint + ' peut ne prendre qu\'une partie de ce qui lui est donné ; le reste revient directement aux enfants.')),
          e(3, puce('plume', 'La donation entre époux se signe chez le notaire, reste confidentielle et peut être révoquée.'))),
      },
      {
        titre: 'À retenir',
        etapes: 3,
        rendu: () => h('div', { class: 'sv-col' },
          e(1, puce('coeur', 'Elle augmente la part du conjoint survivant, sans droits de succession pour lui.', 'sv-grande')),
          e(2, puce('sablier', 'Le conjoint choisit au décès, et peut cantonner au profit des enfants.', 'sv-grande')),
          e(3, puce('enfants', 'Avec un enfant d\'une autre union, elle est encore plus utile : voir la présentation « Famille recomposée ».', 'sv-grande'))),
      },
    ],
  });

  /* ======================================================================
     6. Frais d'acquisition (« frais de notaire »)
     ====================================================================== */
  const COUL_FRAIS = { departement: '#3d7be0', commune: '#8b5fd6', etat: '#8a93a6', notaire: '#ee7552', debours: '#f0b23a' };
  S.ajouter({
    id: 'frais-de-notaire',
    cle: 'frais',
    exemple: E.EXEMPLES.frais,
    titre: 'Où vont les « frais de notaire » ?',
    resume: 'Les frais d\'un achat dans l\'ancien, poste par poste : surtout des impôts, et une petite part pour le notaire.',
    icone: 'euro',
    panneau: (d, maj) => {
      const { nb: n } = champ(maj);
      const taux = (obj, k, lib) => ui.field(lib, ui.numberInput({ value: obj[k], percent: true, onChange: (v) => { obj[k] = v || 0; maj(); } }));
      return [
        h('div', { class: 'sv-panneau-bloc' }, ui.field('Prix d\'achat', n(d, 'prix')), ui.field('Dont mobilier', n(d, 'mobilier'))),
        h('div', { class: 'sv-panneau-bloc' }, taux(d, 'tauxDepartement', 'Taux du département'), taux(d, 'tauxCommune', 'Taxe communale'), taux(d, 'fraisAssiette', 'Frais d\'assiette (sur le droit départemental)')),
        h('div', { class: 'sv-panneau-bloc' }, h('small', null, 'Émoluments du notaire (barème, HT)'),
          d.tranches.map((t, i) => taux(t, 'taux', i === 0 ? 'Jusqu\'à 6 500 €' : i === 1 ? 'De 6 500 à 17 000 €' : i === 2 ? 'De 17 000 à 60 000 €' : 'Au-delà de 60 000 €'))),
        h('div', { class: 'sv-panneau-bloc' }, ui.field('Formalités (HT)', n(d, 'formalitesHT')), ui.field('Débours', n(d, 'debours'))),
      ];
    },
    diapos: [
      {
        etapes: 1,
        rendu: (d) => titre('euro', 'Où vont les « frais de notaire » ?', 'Pour un achat de ' + fmtEuro(d.prix) + ' dans l\'ancien', h('p', { class: 'sv-noms' }, 'Environ ' + fmtEuro(Math.round(E.frais(d).total / 100) * 100) + ' de frais')),
      },
      {
        titre: 'Le partage des frais',
        etapes: 2,
        rendu: (d) => {
          const r = E.frais(d);
          return h('div', { class: 'sv-gateau' },
            h('div', { class: 'sv-gateau-dessin' }, camembert(r.postes.map((p) => ({ valeur: p.valeur, couleur: COUL_FRAIS[p.code] }))), h('div', { class: 'sv-gateau-centre' }, fmtEuro(r.total))),
            h('div', { class: 'sv-col' }, r.postes.map((p, i) => e(p.code === 'notaire' ? 2 : 1, h('div', { class: 'sv-ligne-enfant', style: { '--c': COUL_FRAIS[p.code] } }, h('span', { class: 'sv-point' }), h('strong', null, p.libelle), h('small', null, pct(p.valeur / r.total)), h('b', null, fmtEuro(p.valeur)))))));
        },
      },
      {
        titre: 'Sur 100 € de frais…',
        etapes: 2,
        rendu: (d) => {
          const r = E.frais(d);
          const nbNotaire = Math.round((100 * r.notaire) / r.total);
          const nbDebours = Math.round((100 * (r.postes.find((p) => p.code === 'debours') || { valeur: 0 }).valeur) / r.total);
          const cases = [];
          for (let i = 0; i < 100; i++) cases.push(h('span', { class: 'sv-case', style: { '--c': i < 100 - nbNotaire - nbDebours ? '#3d7be0' : i < 100 - nbNotaire ? '#f0b23a' : '#ee7552' } }));
          return h('div', { class: 'sv-gateau sv-gateau-gaufre' },
            h('div', { class: 'sv-gaufre' }, cases),
            h('div', { class: 'sv-col' },
              e(1, h('div', { class: 'sv-ligne-enfant', style: { '--c': '#3d7be0' } }, h('span', { class: 'sv-point' }), h('strong', null, 'Impôts et taxes'), h('b', null, (100 - nbNotaire - nbDebours) + ' €'))),
              e(1, h('div', { class: 'sv-ligne-enfant', style: { '--c': '#f0b23a' } }, h('span', { class: 'sv-point' }), h('strong', null, 'Débours'), h('b', null, nbDebours + ' €'))),
              e(2, h('div', { class: 'sv-ligne-enfant', style: { '--c': '#ee7552' } }, h('span', { class: 'sv-point' }), h('strong', null, 'Le notaire'), h('b', null, nbNotaire + ' €'))),
              e(2, bulle('etat', 'Le notaire collecte ces impôts pour l\'État et les collectivités, puis les reverse.'))));
        },
      },
      {
        titre: 'Le détail',
        etapes: 3,
        rendu: (d) => {
          const r = E.frais(d);
          return h('div', { class: 'sv-col' },
            e(1, ligneVal('Droits de mutation', r.departement + r.commune + r.assietteEtat, 'sv-ld-a', 'département ' + pct(d.tauxDepartement, 2) + ', commune ' + pct(d.tauxCommune, 1) + ', État ' + pct(d.fraisAssiette, 2) + ' du droit départemental')),
            e(2, ligneVal('Émoluments du notaire', r.emoluments + d.formalitesHT, 'sv-ld-b', 'barème fixé par l\'État, dégressif, le même chez tous les notaires ; ' + fmtEuro(r.tva) + ' de TVA en plus')),
            e(3, ligneVal('Contribution de sécurité immobilière', r.csi, '', '0,10 % du prix, pour le service de la publicité foncière')),
            e(3, ligneVal('Débours', d.debours, 'sv-ld-herite', 'documents d\'urbanisme, cadastre, état hypothécaire…')),
            ligneVal('Total', r.total, 'sv-ld-total', pct(r.pourcentage, 1) + ' du prix'));
        },
      },
      {
        titre: 'À retenir',
        etapes: 3,
        rendu: () => h('div', { class: 'sv-col' },
          e(1, puce('etat', 'Les « frais de notaire » sont surtout des impôts.', 'sv-grande')),
          e(2, puce('balance', 'La rémunération du notaire est fixée par l\'État : identique dans toutes les études.', 'sv-grande')),
          e(3, puce('maison', 'Dans le neuf, les droits sont réduits : les frais tombent à environ 2 à 3 % du prix.', 'sv-grande'))),
      },
    ],
  });
})(typeof self !== 'undefined' ? self : this);
