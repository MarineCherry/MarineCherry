/*
 * Application « Supports visuels » : petites présentations à montrer aux clients en rendez-vous,
 * en plein écran, étape par étape. Les chiffres de l'exemple se modifient en direct.
 * Première présentation : communauté légale ou séparation de biens (contrat de mariage).
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, fmtEuro, clone } = A.util;
  const ui = A.ui;
  const E = A.engines.supports;

  const app = {
    id: 'supports',
    title: 'Supports visuels',
    caption: 'Présentations pour les rendez-vous',
    icon: 'supports',
    gradient: 'linear-gradient(150deg, #c2567a 0%, #ec9a7c 100%)',
  };

  /* ---------- Petits dessins (traits 24 × 24) ---------- */
  const DESSINS = {
    maison: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
    cadeau: '<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M2.5 9h19v-3h-19z"/><path d="M12 6v14"/><path d="M12 6c-2-3.5-6-3-5.2-.6C7.4 6.8 12 6 12 6zM12 6c2-3.5 6-3 5.2-.6C16.6 6.8 12 6 12 6z"/>',
    tirelire: '<path d="M5 11a7 6 0 0 1 13-2l2.5-1v4l-1.5.8A7 6 0 0 1 15 17v2.5h-2.5V18h-3v1.5H7V17A6 6 0 0 1 5 11z"/><circle cx="15.5" cy="10.5" r=".8"/><path d="M10 6.2h3"/>',
    alliances: '<circle cx="9" cy="13" r="5"/><circle cx="15" cy="13" r="5"/><path d="m13.5 4 1.5 2 1.5-2"/>',
    salaire: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
    avant: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l-3 2"/>',
    balance: '<path d="M12 4v16M7 20h10"/><path d="M5 7h14"/><path d="m5 7-3 6h6zM19 7l-3 6h6z"/>',
    coeur: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    enfants: '<circle cx="8" cy="7" r="2.6"/><circle cx="16.5" cy="9" r="2.1"/><path d="M3.5 19a4.5 4.5 0 0 1 9 0"/><path d="M12.8 19a3.7 3.7 0 0 1 7.4 0"/>',
    bouclier: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
    entreprise: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V5.5h6V8M3 13h18"/>',
    cle: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l1.5 1.5"/>',
  };
  function dessin(nom, cls) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.6');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('class', 'sv-dessin ' + (cls || ''));
    el.innerHTML = DESSINS[nom] || '';
    return el;
  }

  /* ---------- Données de l'exemple (enregistrées sur ce poste) ---------- */
  const CLE = 'supports';
  function charger(pres) {
    const s = A.store.loadDraft(CLE) || {};
    const d = clone(pres.exemple);
    const x = s[pres.cle];
    if (x) {
      Object.assign(d, x);
      Object.keys(pres.exemple).forEach((k) => {
        if (pres.exemple[k] && typeof pres.exemple[k] === 'object' && !Array.isArray(pres.exemple[k])) d[k] = Object.assign({}, pres.exemple[k], x[k]);
      });
    }
    return d;
  }
  const sauver = A.util.debounce((pres, d) => A.store.saveDraft(CLE, Object.assign({}, A.store.loadDraft(CLE) || {}, { [pres.cle]: d })), 300);
  const champ = (maj) => ({
    nb: (obj, k, opts) => ui.numberInput(Object.assign({ value: obj[k], suffix: '€', onChange: (v) => { obj[k] = v || 0; maj(); } }, opts || {})),
    tx: (obj, k) => ui.textInput({ value: obj[k], onChange: (v) => { obj[k] = v; maj(); } }),
  });

  /* ---------- Présentation : communauté légale ou séparation de biens ---------- */
  const e = (i, ...enfants) => h('div', { class: 'sv-e', 'data-e': i }, ...enfants);
  const nomA = (d) => d.a.prenom || 'Époux 1';
  const nomB = (d) => d.b.prenom || 'Époux 2';
  const nomDe = (d, k) => (k === 'a' ? nomA(d) : nomB(d));

  // Barre empilée : [{ valeur, couleur, libelle }]
  function barre(morceaux, max) {
    return h('div', { class: 'sv-barre' }, morceaux.filter((m) => m.valeur > 0.5).map((m) =>
      h('div', { class: 'sv-morceau sv-' + m.couleur, style: { width: (100 * m.valeur) / max + '%' }, title: m.libelle + ' : ' + fmtEuro(m.valeur) },
        (100 * m.valeur) / max > 12 ? h('span', null, fmtEuro(m.valeur)) : null)));
  }
  const legende = (items) => h('div', { class: 'sv-legende' }, items.map(([c, t]) => h('span', null, h('i', { class: 'sv-' + c }), t)));

  // Jeton : un bien, avec son dessin, son libellé et sa valeur.
  function jeton(couleur, icone, libelle, valeur) {
    return h('div', { class: 'sv-jeton sv-' + couleur }, h('span', { class: 'sv-jeton-ic' }, dessin(icone)), h('span', { class: 'sv-jeton-lib' }, libelle), h('strong', null, fmtEuro(valeur)));
  }
  const icone = (x) => (/r[ée]sidence|maison|appartement|logement/i.test(x.libelle || '') ? 'maison' : 'tirelire');
  function fraction(p) {
    const F = [[1, 'tout'], [0.75, '¾'], [2 / 3, '⅔'], [0.5, '½'], [1 / 3, '⅓'], [0.25, '¼'], [0, 'rien']];
    const f = F.find(([v]) => Math.abs(v - p) < 0.005);
    return f ? f[1] : Math.round(p * 100) + ' %';
  }
  // Petite opération posée : [[valeur, légende, couleur], '+', …]
  function equation(termes) {
    return h('div', { class: 'sv-eq' }, termes.map((t) => (typeof t === 'string' ? h('span', { class: 'sv-op' }, t)
      : h('span', { class: 'sv-terme sv-' + t[2] }, h('b', null, typeof t[0] === 'number' ? fmtEuro(t[0]) : t[0]), t[1] ? h('small', null, t[1]) : null))));
  }

  function panneauContrat(d, maj, refaire) {
    const { nb, tx } = champ(maj);
    const epoux = (k) => h('div', { class: 'sv-panneau-bloc sv-bord-' + k },
      ui.field('Prénom', tx(d[k], 'prenom')),
      ui.field('Biens avant le mariage', nb(d[k], 'avant')),
      ui.field('Donations et héritages', nb(d[k], 'heritage')));
    const acquis = (d.acquis || []).map((x, i) => h('div', { class: 'sv-panneau-bloc' },
      ui.field('Achat pendant le mariage', tx(x, 'libelle')),
      ui.field('Valeur', nb(x, 'valeur')),
      ui.field('Payé par ' + nomA(d), ui.numberInput({ value: x.partA, percent: true, onChange: (v) => { x.partA = v === null ? 0.5 : v; maj(); } })),
      ui.button('Retirer', { icon: 'trash', variant: 'ghost', small: true, onClick: () => { d.acquis.splice(i, 1); refaire(); maj(); } })));
    return [epoux('a'), epoux('b'), ...acquis,
      ui.button('Ajouter un achat', { icon: 'plus', variant: 'soft', small: true, onClick: () => { d.acquis.push({ libelle: 'Achat', valeur: 0, partA: 0.5 }); refaire(); maj(); } }),
      h('div', { class: 'sv-panneau-bloc' },
        ui.field('Enfants communs', ui.numberInput({ value: d.enfants, onChange: (v) => { d.enfants = Math.max(0, Math.round(v || 0)); maj(); } })),
        ui.field('Décès de', ui.segmented({ value: d.decede, small: true, options: [{ value: 'a', label: nomA(d) }, { value: 'b', label: nomB(d) }], onChange: (v) => { d.decede = v; maj(); } })))];
  }

  const CONTRAT = {
    id: 'contrat-mariage',
    cle: 'contrat',
    exemple: E.EXEMPLE,
    panneau: panneauContrat,
    titre: 'Communauté légale ou séparation de biens',
    resume: 'Les trois masses de biens, puis ce que devient le patrimoine du couple en cas de divorce et en cas de décès.',
    icone: 'alliances',
    diapos: [
      {
        etapes: 1,
        rendu: (d) => h('div', { class: 'sv-titre-diapo' },
          h('div', { class: 'sv-couple' },
            h('div', { class: 'sv-bulle sv-a' }, nomA(d).slice(0, 1).toUpperCase()),
            dessin('alliances', 'sv-grand'),
            h('div', { class: 'sv-bulle sv-b' }, nomB(d).slice(0, 1).toUpperCase())),
          h('h1', null, 'Communauté ou séparation de biens ?'),
          h('p', { class: 'sv-sous-titre' }, 'Ce que change votre contrat de mariage'),
          e(1, h('p', { class: 'sv-noms' }, nomA(d) + ' & ' + nomB(d)))),
      },
      {
        titre: 'Vos biens se rangent dans trois paniers',
        etapes: 3,
        rendu: (d) => h('div', { class: 'sv-trois' },
          e(1, h('div', { class: 'sv-carte sv-a' }, dessin('cle', 'sv-moyen'), h('h3', null, 'Les biens de ' + nomA(d)), h('p', null, 'Ses biens personnels, dits « propres »'))),
          e(3, h('div', { class: 'sv-carte sv-commun' }, dessin('coeur', 'sv-moyen'), h('h3', null, 'Les biens communs'), h('p', null, 'Ils appartiennent aux deux, à parts égales'))),
          e(2, h('div', { class: 'sv-carte sv-b' }, dessin('cle', 'sv-moyen'), h('h3', null, 'Les biens de ' + nomB(d)), h('p', null, 'Ses biens personnels, dits « propres »')))),
      },
      {
        titre: 'Sans contrat : la communauté légale',
        etapes: 4,
        rendu: () => h('div', { class: 'sv-regles' },
          e(1, regle('avant', 'Ce que chacun possédait avant le mariage', 'reste personnel', 'propre')),
          e(2, regle('cadeau', 'Les donations et héritages reçus pendant le mariage', 'restent personnels', 'propre')),
          e(3, regle('salaire', 'Tout ce qui est acheté pendant le mariage avec les revenus', 'est commun, même si un seul a payé', 'commun')),
          e(4, h('p', { class: 'sv-bulle-info' }, dessin('balance'), 'Au partage, les biens communs sont divisés par moitié.'))),
      },
      {
        titre: 'Avec un contrat : la séparation de biens',
        etapes: 4,
        rendu: () => h('div', { class: 'sv-regles' },
          e(1, regle('avant', 'Ce que chacun possédait avant le mariage', 'reste personnel', 'propre')),
          e(2, regle('cadeau', 'Les donations et héritages reçus pendant le mariage', 'restent personnels', 'propre')),
          e(3, regle('salaire', 'Ce qui est acheté pendant le mariage', 'appartient à celui qui l\'a payé', 'propre')),
          e(4, regle('maison', 'Un bien acheté à deux', 'est en indivision, selon la part payée par chacun', 'indivis'))),
      },
      {
        titre: 'Votre situation',
        etapes: 3,
        rendu: (d) => {
          const col = (k) => {
            const p = d[k];
            return h('div', { class: 'sv-fiche sv-' + k },
              h('div', { class: 'sv-fiche-tete' }, h('span', { class: 'sv-bulle sv-petite sv-' + k }, nomDe(d, k).slice(0, 1).toUpperCase()), nomDe(d, k)),
              p.avant ? jeton(k, 'avant', 'Avant le mariage', p.avant) : null,
              p.heritage ? jeton(k, 'cadeau', 'Donation / héritage', p.heritage) : null,
              !p.avant && !p.heritage ? h('p', { class: 'sv-vide' }, 'Rien avant le mariage') : null);
          };
          const achats = (d.acquis || []).filter((x) => x.valeur > 0);
          return h('div', { class: 'sv-situation3' },
            e(1, col('a')),
            e(3, h('div', { class: 'sv-fiche sv-commun sv-centre' },
              h('div', { class: 'sv-fiche-tete' }, dessin('alliances'), 'Achetés pendant le mariage'),
              achats.map((x) => h('div', { class: 'sv-achat' }, jeton('commun', icone(x), x.libelle, x.valeur),
                h('div', { class: 'sv-paye' }, h('span', { class: 'sv-paye-a', style: { flex: x.partA } }, fraction(x.partA)), h('span', { class: 'sv-paye-b', style: { flex: 1 - x.partA } }, fraction(1 - x.partA))),
                h('div', { class: 'sv-paye-leg' }, 'payé par ' + nomA(d) + ' / ' + nomB(d)))))),
            e(2, col('b')));
        },
      },
      {
        titre: 'À qui appartient chaque bien ?',
        etapes: 2,
        rendu: (d) => {
          const achats = (d.acquis || []).filter((x) => x.valeur > 0);
          const propres = (k) => [d[k].avant ? jeton(k, 'avant', 'Avant le mariage', d[k].avant) : null, d[k].heritage ? jeton(k, 'cadeau', 'Héritage', d[k].heritage) : null];
          const m = E.masses(d);
          const panier2 = (cls, titre, contenu, total) => h('div', { class: 'sv-panier2 sv-' + cls }, h('div', { class: 'sv-panier2-titre' }, titre), h('div', { class: 'sv-panier2-contenu' }, contenu), h('div', { class: 'sv-panier2-total' }, fmtEuro(total)));
          const ligneRegime = (titre, a, c, b) => h('div', { class: 'sv-ligne-regime' }, h('div', { class: 'sv-ligne-regime-titre' }, titre), h('div', { class: 'sv-paniers2' }, a, c, b));
          return h('div', { class: 'sv-col' },
            e(1, ligneRegime('Communauté légale',
              panier2('a', nomA(d), propres('a'), m.communaute.a.total),
              panier2('commun', 'Communs (à deux)', achats.map((x) => jeton('commun', icone(x), x.libelle, x.valeur)), m.communaute.commun),
              panier2('b', nomB(d), propres('b'), m.communaute.b.total))),
            e(2, ligneRegime('Séparation de biens',
              panier2('a', nomA(d), propres('a').concat(achats.map((x) => (x.partA > 0 ? jeton('a', icone(x), fraction(x.partA) + ' ' + x.libelle.toLowerCase(), x.valeur * x.partA) : null))), m.separation.a.total),
              panier2('vide', 'Communs', h('p', { class: 'sv-vide' }, 'aucun'), 0),
              panier2('b', nomB(d), propres('b').concat(achats.map((x) => (x.partA < 1 ? jeton('b', icone(x), fraction(1 - x.partA) + ' ' + x.libelle.toLowerCase(), x.valeur * (1 - x.partA)) : null))), m.separation.b.total))));
        },
      },
      {
        titre: 'En cas de divorce : qui repart avec quoi ?',
        etapes: 3,
        rendu: (d) => {
          const r = E.divorce(d);
          const carte = (rr, titre, cls, avecCommun) => h('div', { class: 'sv-calcul sv-' + cls }, h('h3', null, titre),
            ['a', 'b'].map((k) => h('div', { class: 'sv-eq-ligne' }, h('span', { class: 'sv-eq-nom' }, h('span', { class: 'sv-point sv-' + k }), nomDe(d, k)),
              avecCommun ? equation([[rr[k].propres, 'ses biens', k], '+', [rr[k].commun, '½ des communs', 'commun'], '=', [rr[k].total, '', 'total']])
                : equation([[rr[k].propres, 'ses biens', k], '=', [rr[k].total, '', 'total']]))));
          const ecart = r.communaute.b.total - r.separation.b.total;
          const gagnant = ecart >= 0 ? 'b' : 'a';
          return h('div', { class: 'sv-col' },
            e(1, carte(r.communaute, 'Communauté légale', 'commun', true)),
            e(2, carte(r.separation, 'Séparation de biens', 'sep', false)),
            e(3, Math.abs(ecart) > 0.5 ? h('p', { class: 'sv-bulle-info' }, dessin('balance'), 'Avec la communauté, ' + nomDe(d, gagnant) + ' repart avec ' + fmtEuro(Math.abs(ecart)) + ' de plus.') : null));
        },
      },
      {
        titre: (d) => 'En cas de décès de ' + nomDe(d, d.decede === 'b' ? 'b' : 'a'),
        etapes: 4,
        rendu: (d) => {
          const r = E.deces(d);
          const v = nomDe(d, r.vivant), mort = nomDe(d, r.mort);
          const frac = r.fraction < 1 ? '¼' : 'Tout';
          const ligne = (lib, valeur, cls, detail) => h('div', { class: 'sv-ld ' + (cls || '') }, h('span', { class: 'sv-ld-lib' }, lib), h('span', { class: 'sv-ld-val' }, fmtEuro(valeur)), detail ? h('small', null, detail) : null);
          const carte = (x, titre, cls, avecCommun) => h('div', { class: 'sv-calcul sv-' + cls }, h('h3', null, titre),
            ligne(v + ' garde', x.garde, 'sv-ld-' + r.vivant, avecCommun ? 'ses biens ' + fmtEuro(x.dontPropres) + ' + ½ des communs ' + fmtEuro(x.dontCommun) : 'ses biens'),
            ligne(v + ' hérite', x.herite, 'sv-ld-herite', (frac === 'Tout' ? 'toute' : frac + ' de') + ' la succession de ' + mort + ' (' + fmtEuro(x.succession) + ')'),
            ligne('Total pour ' + v, x.total, 'sv-ld-total'),
            d.enfants ? ligne('Les enfants', x.enfants, 'sv-ld-enfants', 'le reste de la succession') : null);
          const ecart = r.communaute.total - r.separation.total;
          return h('div', { class: 'sv-col' },
            h('p', { class: 'sv-intro' }, 'Sans testament : ' + v + ' garde ses biens, puis hérite ' + (r.fraction < 1 ? 'd\'un quart de la succession de ' + mort + '.' : 'de toute la succession (ni enfant, ni père et mère).')),
            h('div', { class: 'sv-deux' }, e(1, carte(r.communaute, 'Communauté légale', 'commun', true)), e(2, carte(r.separation, 'Séparation de biens', 'sep', false))),
            e(3, Math.abs(ecart) > 0.5 ? h('p', { class: 'sv-bulle-info' }, dessin('bouclier'), 'Avec la ' + (ecart > 0 ? 'communauté' : 'séparation de biens') + ', ' + v + ' conserve ' + fmtEuro(Math.abs(ecart)) + ' de plus.') : null),
            e(4, h('p', { class: 'sv-note' }, 'Un testament ou une donation entre époux peut augmenter la part du conjoint, quel que soit le régime.')));
        },
      },
      {
        titre: 'À retenir',
        etapes: 3,
        rendu: () => h('div', { class: 'sv-col' },
          h('div', { class: 'sv-deux' },
            e(1, h('div', { class: 'sv-carte sv-commun sv-gauche' }, h('h3', null, dessin('coeur'), 'Communauté légale'), h('ul', null,
              h('li', null, 'Solidarité : on construit ensemble, on partage par moitié'),
              h('li', null, 'Protège celui qui gagne moins ou qui réduit son activité'),
              h('li', null, 'Les créanciers d\'un époux peuvent saisir les biens communs')))),
            e(2, h('div', { class: 'sv-carte sv-sep sv-gauche' }, h('h3', null, dessin('entreprise'), 'Séparation de biens'), h('ul', null,
              h('li', null, 'Indépendance : chacun reste propriétaire de ce qu\'il paie'),
              h('li', null, 'Protège le patrimoine d\'un époux chef d\'entreprise ou profession libérale'),
              h('li', null, 'Moins protecteur pour celui qui gagne moins : à compléter (donation entre époux…)'))))),
          e(3, h('p', { class: 'sv-bulle-info' }, dessin('cle'), 'Des solutions sur mesure existent : séparation avec société d\'acquêts, participation aux acquêts, clauses de préciput ou d\'attribution.'))),
      },
    ],
  };
  function regle(icone, quoi, devient, cible) {
    const lib = { propre: 'personnel', commun: 'commun', indivis: 'indivision' }[cible];
    return h('div', { class: 'sv-regle' }, h('span', { class: 'sv-pastille sv-gris' }, dessin(icone)), h('span', { class: 'sv-quoi' }, quoi),
      h('span', { class: 'sv-fleche' }, '→'), h('span', { class: 'sv-cible sv-' + cible }, lib), h('span', { class: 'sv-devient' }, devient));
  }

  /* ---------- Présentation : famille recomposée, droits du conjoint et testament ---------- */
  const COUL_ENF = ['#34a483', '#2f9aa8', '#5bb96f', '#3c8dbc', '#7bb661', '#2b7a78'];
  function enfantsDe(d, r) {
    let ic = 0, ia = 0;
    return r.enfants.map((x) => Object.assign({}, x, { couleur: x.commun ? COUL_ENF[(ic++) % 3 * 2] : COUL_ENF[((ia++) % 3) * 2 + 1] }));
  }
  // Camembert SVG : [{ valeur, couleur, libelle }]
  function camembert(parts) {
    const total = parts.reduce((t, p) => t + p.valeur, 0) || 1;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-1.1 -1.1 2.2 2.2');
    svg.setAttribute('class', 'sv-camembert');
    let angle = -Math.PI / 2;
    parts.forEach((p) => {
      const a = (2 * Math.PI * p.valeur) / total;
      const x1 = Math.cos(angle), y1 = Math.sin(angle), x2 = Math.cos(angle + a), y2 = Math.sin(angle + a);
      const el = document.createElementNS('http://www.w3.org/2000/svg', a >= 2 * Math.PI - 1e-6 ? 'circle' : 'path');
      if (el.tagName === 'circle') { el.setAttribute('r', '1'); }
      else el.setAttribute('d', 'M0 0 L' + x1 + ' ' + y1 + ' A1 1 0 ' + (a > Math.PI ? 1 : 0) + ' 1 ' + x2 + ' ' + y2 + ' Z');
      el.setAttribute('fill', p.couleur);
      el.setAttribute('stroke', '#fff');
      el.setAttribute('stroke-width', '0.02');
      svg.appendChild(el);
      angle += a;
    });
    return svg;
  }
  const noeud = (classe, nom, sous, couleur) => h('div', { class: 'sv-noeud ' + classe, style: couleur ? { '--c': couleur } : null }, h('span', { class: 'sv-bulle sv-petite' }, (nom || '?').slice(0, 1).toUpperCase()), h('strong', null, nom), sous ? h('small', null, sous) : null);
  const ligneEnfant = (x, valeur, sous) => h('div', { class: 'sv-ligne-enfant', style: { '--c': x.couleur } }, h('span', { class: 'sv-point' }), h('strong', null, x.nom), h('small', null, x.commun ? 'enfant commun' : 'enfant d\'une autre union'), h('b', null, fmtEuro(valeur)), sous ? h('em', null, sous) : null);

  function panneauRecompose(d, maj) {
    const { nb, tx } = champ(maj);
    const liste = (k) => {
      const t = ui.textInput({ value: (d[k] || []).join(', '), onChange: (v) => { d[k] = v.split(',').map((x) => x.trim()).filter(Boolean); maj(); } });
      return t;
    };
    return [
      h('div', { class: 'sv-panneau-bloc sv-bord-a' }, ui.field('Prénom du défunt', tx(d, 'defunt')), ui.field('Sa succession (ses biens)', nb(d, 'succession'))),
      h('div', { class: 'sv-panneau-bloc sv-bord-b' }, ui.field('Prénom du conjoint', tx(d, 'conjoint'))),
      h('div', { class: 'sv-panneau-bloc' }, ui.field('Enfants communs', liste('communs'), { help: 'Prénoms séparés par des virgules' }), ui.field('Enfants d\'une autre union (du défunt)', liste('autres'))),
    ];
  }

  const RECOMPOSE = {
    id: 'famille-recomposee',
    cle: 'recompose',
    exemple: E.EXEMPLE_RECOMPOSE,
    panneau: panneauRecompose,
    titre: 'Famille recomposée : protéger son conjoint',
    resume: 'Le quart du conjoint sans testament, ce qu\'il devient ensuite pour l\'enfant d\'une première union, et l\'intérêt d\'un testament en usufruit.',
    icone: 'coeur',
    diapos: [
      {
        etapes: 1,
        rendu: (d) => h('div', { class: 'sv-titre-diapo' },
          h('div', { class: 'sv-couple' }, h('div', { class: 'sv-bulle sv-a' }, (d.defunt || '?').slice(0, 1).toUpperCase()), dessin('coeur', 'sv-grand sv-rose'), h('div', { class: 'sv-bulle sv-b' }, (d.conjoint || '?').slice(0, 1).toUpperCase())),
          h('h1', null, 'Protéger son conjoint sans oublier ses enfants'),
          h('p', { class: 'sv-sous-titre' }, 'Famille recomposée : qui hérite de quoi ?'),
          e(1, h('p', { class: 'sv-noms' }, (d.defunt || '') + ' & ' + (d.conjoint || '')))),
      },
      {
        titre: 'Votre famille',
        etapes: 2,
        rendu: (d) => {
          const r = E.recompose(d);
          const enf = enfantsDe(d, r);
          const autres = enf.filter((x) => !x.commun), communs = enf.filter((x) => x.commun);
          return h('div', { class: 'sv-arbre' },
            h('div', { class: 'sv-arbre-haut' },
              autres.length ? noeud('sv-ex', '1re union', 'précédent(e) conjoint(e)', '#9aa3b8') : null,
              noeud('sv-a', d.defunt, 'le défunt'),
              h('span', { class: 'sv-lien-mariage' }, dessin('alliances')),
              noeud('sv-b', d.conjoint, 'son conjoint')),
            e(1, h('div', { class: 'sv-arbre-bas' },
              autres.length ? h('div', { class: 'sv-fratrie sv-fratrie-autre' }, autres.map((x) => noeud('', x.nom, 'enfant de ' + d.defunt + ' seulement', x.couleur))) : null,
              communs.length ? h('div', { class: 'sv-fratrie' }, communs.map((x) => noeud('', x.nom, 'enfant commun', x.couleur))) : null)),
            e(2, h('p', { class: 'sv-bulle-info' }, dessin('enfants'), autres.length ? (autres.map((x) => x.nom).join(' et ') + (autres.length > 1 ? ' ne sont pas les enfants' : ' n\'est pas l\'enfant') + ' de ' + d.conjoint + ' : ' + (autres.length > 1 ? 'ils n\'hériteront' : 'il n\'héritera') + ' jamais de ' + d.conjoint + '.') : 'Tous les enfants sont communs.')));
        },
      },
      {
        titre: 'Ce que prévoit la loi pour le conjoint',
        etapes: 2,
        rendu: (d) => {
          const r = E.recompose(d);
          const carte = (actif, titre, texte) => h('div', { class: ['sv-carte', 'sv-gauche', actif ? 'sv-b sv-actif' : 'sv-gris sv-inactif'] }, h('h3', null, titre), h('p', null, texte), actif ? h('span', { class: 'sv-tampon' }, 'Votre cas') : null);
          return h('div', { class: 'sv-col' },
            h('div', { class: 'sv-deux' },
              e(1, carte(r.optionUsufruitLegale, 'Tous les enfants sont communs', 'Le conjoint choisit : ¼ de la succession en pleine propriété, OU l\'usufruit de toute la succession.')),
              e(2, carte(!r.optionUsufruitLegale, 'Un enfant d\'une autre union', 'Le conjoint reçoit ¼ de la succession en pleine propriété. Pas de choix : l\'usufruit n\'est pas possible sans testament.'))),
            h('p', { class: 'sv-note' }, 'Sans testament ni donation entre époux (art. 757 du Code civil). Le conjoint peut aussi demander, dans l\'année, à habiter le logement toute sa vie (droit viager au logement).'));
        },
      },
      {
        titre: (d) => 'Sans testament : la succession de ' + d.defunt,
        etapes: 2,
        rendu: (d) => {
          const r = E.recompose(d);
          const enf = enfantsDe(d, r);
          const parts = [{ valeur: r.sans.conjoint, couleur: 'var(--sv-b)', libelle: d.conjoint }].concat(enf.map((x) => ({ valeur: x.sans, couleur: x.couleur, libelle: x.nom })));
          return h('div', { class: 'sv-gateau' },
            h('div', { class: 'sv-gateau-dessin' }, camembert(parts.map((p) => Object.assign({}, p, { couleur: p.couleur.startsWith('var') ? '#ee7552' : p.couleur }))), h('div', { class: 'sv-gateau-centre' }, fmtEuro(r.succession))),
            h('div', { class: 'sv-col' },
              e(1, h('div', { class: 'sv-ligne-enfant', style: { '--c': '#ee7552' } }, h('span', { class: 'sv-point' }), h('strong', null, d.conjoint), h('small', null, '¼ en pleine propriété'), h('b', null, fmtEuro(r.sans.conjoint)))),
              e(2, h('div', { class: 'sv-col' }, enf.map((x) => ligneEnfant(x, x.sans, null)), h('p', { class: 'sv-note' }, '¾ partagés à égalité entre les ' + r.nbEnfants + ' enfants.')))));
        },
      },
      {
        titre: (d) => 'Et au décès de ' + d.conjoint + ' ?',
        etapes: 3,
        rendu: (d) => {
          const r = E.recompose(d);
          const enf = enfantsDe(d, r);
          const communs = enf.filter((x) => x.commun), autres = enf.filter((x) => !x.commun);
          const max = Math.max(...enf.map((x) => x.totalSans), 1);
          return h('div', { class: 'sv-col' },
            e(1, h('div', { class: 'sv-flux' },
              h('div', { class: 'sv-flux-depart', style: { '--c': '#ee7552' } }, h('small', null, 'Le quart de ' + d.conjoint), h('b', null, fmtEuro(r.sans.conjoint))),
              h('span', { class: 'sv-flux-fleche' }, '→'),
              h('div', { class: 'sv-flux-arrivee' },
                communs.length ? communs.map((x) => h('div', { class: 'sv-flux-oui', style: { '--c': x.couleur } }, '✓ ', h('strong', null, x.nom), ' : ' + fmtEuro(x.plusTard))) : h('div', { class: 'sv-flux-oui', style: { '--c': '#9aa3b8' } }, '✓ la famille de ' + d.conjoint),
                autres.map((x) => h('div', { class: 'sv-flux-non' }, '✗ ', h('strong', null, x.nom), ' : rien'))))),
            e(2, h('div', { class: 'sv-regime' }, h('h3', null, 'Au final, chaque enfant reçoit'),
              enf.map((x) => h('div', { class: 'sv-personne' }, h('div', { class: 'sv-personne-nom' }, h('span', { class: 'sv-point', style: { '--c': x.couleur } }), x.nom),
                h('div', { class: 'sv-barre' }, h('div', { class: 'sv-morceau', style: { '--c': x.couleur, width: (100 * x.sans) / max + '%' } }, h('span', null, fmtEuro(x.sans))),
                  x.plusTard ? h('div', { class: 'sv-morceau', style: { '--c': '#ee7552', width: (100 * x.plusTard) / max + '%' } }, h('span', null, '+ ' + fmtEuro(x.plusTard))) : null),
                h('strong', { class: 'sv-total' }, fmtEuro(x.totalSans)))))),
            e(3, autres.length ? h('p', { class: 'sv-bulle-info sv-alerte' }, dessin('balance'), autres.map((x) => x.nom).join(' et ') + ' ne ' + (autres.length > 1 ? 'reçoivent' : 'reçoit') + ' jamais rien du quart de ' + d.conjoint + (communs.length ? ' : ' + (autres.length > 1 ? 'ils sont' : 'il est') + ' désavantagé' + (autres.length > 1 ? 's' : '') + ' par rapport à ' + communs.map((x) => x.nom).join(' et ') + '.' : ', qui part dans la famille de ' + d.conjoint + '.')) : null));
        },
      },
      {
        titre: 'La solution : un testament en usufruit',
        etapes: 3,
        rendu: (d) => {
          const r = E.recompose(d);
          const enf = enfantsDe(d, r);
          return h('div', { class: 'sv-maison-schema' },
            h('div', { class: 'sv-maison' },
              h('div', { class: 'sv-toit' }),
              e(1, h('div', { class: 'sv-usufruit' }, h('small', null, 'Usufruit'), h('strong', null, d.conjoint), h('span', null, 'en profite toute sa vie'))),
              e(2, h('div', { class: 'sv-murs' }, h('small', null, 'Nue-propriété, à parts égales'), h('div', { class: 'sv-murs-enfants' }, enf.map((x) => h('span', { class: 'sv-mur', style: { '--c': x.couleur } }, x.nom)))))),
            h('div', { class: 'sv-col' },
              e(1, h('p', { class: 'sv-puce' }, dessin('maison'), d.defunt + ' lègue à ' + d.conjoint + ' l\'usufruit de toute sa succession.')),
              e(1, h('p', { class: 'sv-puce' }, dessin('cle'), d.conjoint + ' reste dans le logement toute sa vie, ou le loue et en perçoit les loyers.')),
              e(2, h('p', { class: 'sv-puce' }, dessin('enfants'), 'Les enfants deviennent nus-propriétaires dès le décès de ' + d.defunt + ', ' + (r.autres ? 'y compris ' + enf.filter((x) => !x.commun).map((x) => x.nom).join(' et ') : 'à égalité') + '.')),
              e(3, h('p', { class: 'sv-puce' }, dessin('bouclier'), 'Au décès de ' + d.conjoint + ', l\'usufruit s\'éteint : les enfants récupèrent la pleine propriété, sans droits de succession supplémentaires.'))));
        },
      },
      {
        titre: 'Comparons',
        etapes: 2,
        rendu: (d) => {
          const r = E.recompose(d);
          const enf = enfantsDe(d, r);
          return h('div', { class: 'sv-col' },
            h('table', { class: 'sv-compare' },
              h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Sans testament'), h('th', { class: 'sv-col-mieux' }, 'Avec testament (usufruit)'))),
              h('tbody', null,
                h('tr', null, h('td', null, h('span', { class: 'sv-point', style: { '--c': '#ee7552' } }), d.conjoint),
                  h('td', null, '¼ en pleine propriété : ' + fmtEuro(r.sans.conjoint), h('br'), h('small', null, 'logement : droit d\'y habiter à vie, à demander')),
                  h('td', { class: 'sv-col-mieux' }, 'Profite de tout (' + fmtEuro(r.succession) + ') sa vie durant', h('br'), h('small', null, 'logement, revenus, loyers'))),
                enf.map((x) => h('tr', null, h('td', null, h('span', { class: 'sv-point', style: { '--c': x.couleur } }), x.nom, h('small', null, x.commun ? ' enfant commun' : ' autre union')),
                  h('td', null, fmtEuro(x.totalSans), x.plusTard ? h('small', null, ' dont ' + fmtEuro(x.plusTard) + ' au décès de ' + d.conjoint) : null),
                  h('td', { class: 'sv-col-mieux' }, fmtEuro(x.avec), h('small', null, ' (en pleine propriété au décès de ' + d.conjoint + ')')))))),
            e(1, h('p', { class: 'sv-bulle-info' }, dessin('balance'), 'Avec le testament, les enfants sont traités à égalité et la protection de ' + d.conjoint + ' est renforcée.')),
            e(2, h('p', { class: 'sv-note' }, 'À savoir : un enfant d\'une autre union peut demander à remplacer l\'usufruit du conjoint par la pleine propriété de la quotité disponible (art. 1098 du Code civil). Le notaire vous conseille sur la rédaction la plus adaptée.')));
        },
      },
      {
        titre: 'À retenir',
        etapes: 3,
        rendu: (d) => h('div', { class: 'sv-col' },
          e(1, h('p', { class: 'sv-puce sv-grande' }, dessin('coeur'), 'Sans testament, dans une famille recomposée, le conjoint n\'a droit qu\'à ¼ en pleine propriété.')),
          e(2, h('p', { class: 'sv-puce sv-grande' }, dessin('enfants'), 'Ce quart passera ensuite aux héritiers du conjoint : jamais à l\'enfant de la première union.')),
          e(3, h('p', { class: 'sv-puce sv-grande' }, dessin('cle'), 'Un testament ou une donation entre époux en usufruit protège le conjoint toute sa vie et préserve l\'égalité entre tous les enfants.'))),
      },
    ],
  };

  const PRESENTATIONS = [CONTRAT, RECOMPOSE];

  /* ---------- Lecteur de présentation ---------- */
  function lecteur(container, pres) {
    let d = charger(pres);
    let n = 0, etape = 0;
    const scene = h('div', { class: 'sv-scene' });
    const diapo = h('div', { class: 'sv-diapo' });
    scene.appendChild(diapo);
    const compteur = h('span', { class: 'sv-compteur' });
    const points = h('div', { class: 'sv-points' });
    const panneau = h('aside', { class: 'sv-panneau', hidden: true });
    const cadre = h('div', { class: 'sv-cadre' }, scene, panneau);

    const titreDe = (x) => (typeof x.titre === 'function' ? x.titre(d) : x.titre);
    function afficher(anime) {
      const x = pres.diapos[n];
      const corps = x.rendu(d);
      diapo.replaceChildren(...[titreDe(x) ? h('h2', { class: 'sv-h2' }, titreDe(x)) : null, h('div', { class: 'sv-corps' }, corps)].filter(Boolean));
      diapo.classList.toggle('sv-anime', !!anime);
      diapo.querySelectorAll('.sv-e').forEach((el) => el.classList.toggle('sv-vu', +el.dataset.e <= etape));
      compteur.textContent = (n + 1) + ' / ' + pres.diapos.length;
      points.replaceChildren(...pres.diapos.map((_, i) => h('button', { type: 'button', class: ['sv-pt', i === n ? 'is-on' : ''], 'aria-label': 'Diapositive ' + (i + 1), onclick: () => aller(i, 0) })));
    }
    function aller(i, et) {
      n = Math.max(0, Math.min(pres.diapos.length - 1, i));
      etape = et === 'fin' ? pres.diapos[n].etapes : et;
      afficher(true);
    }
    const suivant = () => (etape < pres.diapos[n].etapes ? (etape++, afficher(false)) : n < pres.diapos.length - 1 ? aller(n + 1, 0) : null);
    const precedent = () => (etape > 0 ? (etape--, afficher(false)) : n > 0 ? aller(n - 1, 'fin') : null);
    scene.addEventListener('click', (ev) => { if (!ev.target.closest('button, input')) suivant(); });
    const clavier = (ev) => {
      if (!document.body.contains(cadre)) return document.removeEventListener('keydown', clavier);
      if (ev.target.closest && ev.target.closest('input, textarea, select')) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(ev.key)) { ev.preventDefault(); suivant(); }
      if (['ArrowLeft', 'PageUp', 'Backspace'].includes(ev.key)) { ev.preventDefault(); precedent(); }
    };
    document.addEventListener('keydown', clavier);

    // Panneau des chiffres de l'exemple, modifiables pendant le rendez-vous.
    function remplirPanneau() {
      const maj = () => { sauver(pres, d); afficher(false); };
      panneau.replaceChildren(
        h('div', { class: 'sv-panneau-tete' }, h('strong', null, 'Chiffres de l\'exemple'), ui.button('Fermer', { variant: 'ghost', small: true, onClick: () => { panneau.hidden = true; } })),
        ...pres.panneau(d, maj, remplirPanneau),
        ui.button('Revenir à l\'exemple d\'origine', { icon: 'reset', variant: 'ghost', small: true, onClick: () => { d = clone(pres.exemple); sauver(pres, d); remplirPanneau(); afficher(false); } }));
    }

    const pleinEcran = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (cadre.requestFullscreen) cadre.requestFullscreen().catch(() => ui.toast('Plein écran indisponible sur cet appareil.', 'error'));
      else ui.toast('Plein écran indisponible sur cet appareil.', 'error');
    };
    const imprimer = () => {
      const pages = pres.diapos.map((x) => {
        const p = h('div', { class: 'sv-page' }, h('div', { class: 'sv-diapo sv-imprime' }, titreDe(x) ? h('h2', { class: 'sv-h2' }, titreDe(x)) : null, h('div', { class: 'sv-corps' }, x.rendu(d))));
        p.querySelectorAll('.sv-e').forEach((el) => el.classList.add('sv-vu'));
        return p;
      });
      const style = h('style', null, '@page { size: A4 landscape; margin: 0; }');
      document.head.appendChild(style);
      window.addEventListener('afterprint', () => style.remove(), { once: true });
      ui.print(h('div', { class: 'sv-impression' }, pages), pres.titre);
    };

    const barreOutils = h('div', { class: 'sv-outils' },
      ui.button('Précédent', { icon: 'back', variant: 'ghost', small: true, onClick: precedent }),
      compteur,
      ui.button('Suivant', { variant: 'soft', small: true, onClick: suivant }),
      points,
      h('span', { class: 'sv-espace' }),
      ui.button('Chiffres', { icon: 'settings', variant: 'ghost', small: true, onClick: () => { panneau.hidden = !panneau.hidden; if (!panneau.hidden) remplirPanneau(); } }),
      ui.button('Imprimer / PDF', { icon: 'print', variant: 'ghost', small: true, onClick: imprimer }),
      ui.button('Plein écran', { icon: 'open', variant: 'primary', small: true, onClick: pleinEcran }));
    cadre.appendChild(barreOutils);

    container.replaceChildren(h('div', { class: 'sim theme-supports' },
      h('header', { class: 'sim-top' }, h('div', { class: 'sim-top-inner' },
        h('a', { class: 'back', href: '#/supports', title: 'Toutes les présentations' }, ui.icon('back', 20), h('span', null, 'Présentations')),
        h('div', { class: 'sim-title' }, h('span', { class: 'app-glyph app-glyph-sm', style: { background: app.gradient } }, ui.icon(app.icon, 18)),
          h('div', null, h('h1', null, pres.titre), h('p', { class: 'sim-ref' }, 'Cliquez sur la diapositive ou utilisez les flèches du clavier'))))),
      h('div', { class: 'sv-page-ecran' }, cadre)));
    afficher(true);
  }

  /* ---------- Galerie ---------- */
  function galerie(container) {
    container.replaceChildren(h('div', { class: 'sim theme-supports' },
      h('header', { class: 'sim-top' }, h('div', { class: 'sim-top-inner' },
        h('a', { class: 'back', href: '#/', title: "Retour à l'accueil" }, ui.icon('back', 20), h('span', null, 'Accueil')),
        h('div', { class: 'sim-title' }, h('span', { class: 'app-glyph app-glyph-sm', style: { background: app.gradient } }, ui.icon(app.icon, 18)),
          h('div', null, h('h1', null, app.title), h('p', { class: 'sim-ref' }, 'Présentations à montrer aux clients en rendez-vous'))))),
      h('div', { class: 'sv-galerie' },
        PRESENTATIONS.map((p) => h('a', { class: 'sv-vignette', href: '#/supports/' + p.id },
          h('span', { class: 'sv-vignette-dessin' }, dessin(p.icone, 'sv-moyen')),
          h('strong', null, p.titre), h('span', { class: 'small muted' }, p.resume),
          h('span', { class: 'small muted' }, p.diapos.length + ' diapositives'))),
        h('div', { class: 'sv-vignette sv-bientot' }, h('span', { class: 'sv-vignette-dessin' }, ui.icon('plus', 30)), h('strong', null, 'Prochaine présentation'), h('span', { class: 'small muted' }, 'Donation-partage, démembrement, droits du conjoint… à construire ensemble.')))));
  }

  function mount(container, arg) {
    const p = PRESENTATIONS.find((x) => x.id === arg);
    if (p) lecteur(container, p);
    else galerie(container);
  }

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
