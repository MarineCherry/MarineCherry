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
  function charger() {
    const s = A.store.loadDraft(CLE);
    const d = clone(E.EXEMPLE);
    if (s && s.contrat) {
      Object.assign(d, s.contrat);
      d.a = Object.assign({}, E.EXEMPLE.a, s.contrat.a);
      d.b = Object.assign({}, E.EXEMPLE.b, s.contrat.b);
    }
    return d;
  }
  const sauver = A.util.debounce((d) => A.store.saveDraft(CLE, { contrat: d }), 300);

  /* ---------- Présentation : communauté légale ou séparation de biens ---------- */
  const e = (i, ...enfants) => h('div', { class: 'sv-e', 'data-e': i }, ...enfants);
  const nomA = (d) => d.a.prenom || 'Époux 1';
  const nomB = (d) => d.b.prenom || 'Époux 2';
  const nomDe = (d, k) => (k === 'a' ? nomA(d) : nomB(d));

  // Colonne remplie (« panier ») : hauteur proportionnelle à la valeur.
  function panier(couleur, titre, valeur, max, icone, detail) {
    const pct = max > 0 ? Math.max(4, (100 * valeur) / max) : 4;
    return h('div', { class: 'sv-panier sv-' + couleur },
      h('div', { class: 'sv-panier-montant' }, fmtEuro(valeur)),
      h('div', { class: 'sv-panier-bocal' }, h('div', { class: 'sv-panier-niveau', style: { height: pct + '%' } })),
      h('div', { class: 'sv-panier-titre' }, icone ? dessin(icone) : null, titre),
      detail ? h('div', { class: 'sv-panier-detail' }, detail) : null);
  }
  // Barre empilée : [{ valeur, couleur, libelle }]
  function barre(morceaux, max) {
    return h('div', { class: 'sv-barre' }, morceaux.filter((m) => m.valeur > 0.5).map((m) =>
      h('div', { class: 'sv-morceau sv-' + m.couleur, style: { width: (100 * m.valeur) / max + '%' }, title: m.libelle + ' : ' + fmtEuro(m.valeur) },
        (100 * m.valeur) / max > 12 ? h('span', null, fmtEuro(m.valeur)) : null)));
  }
  const legende = (items) => h('div', { class: 'sv-legende' }, items.map(([c, t]) => h('span', null, h('i', { class: 'sv-' + c }), t)));

  const CONTRAT = {
    id: 'contrat-mariage',
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
          const lignes = [];
          if (d.a.avant) lignes.push(['a', 'avant', nomA(d) + ' possède avant le mariage', d.a.avant]);
          if (d.b.avant) lignes.push(['b', 'avant', nomB(d) + ' possède avant le mariage', d.b.avant]);
          if (d.a.heritage) lignes.push(['a', 'cadeau', nomA(d) + ' reçoit une donation ou un héritage', d.a.heritage]);
          if (d.b.heritage) lignes.push(['b', 'cadeau', nomB(d) + ' reçoit une donation ou un héritage', d.b.heritage]);
          return h('div', { class: 'sv-situation' },
            e(1, h('div', { class: 'sv-liste' }, lignes.map(([k, ic, t, v]) => h('div', { class: 'sv-ligne' }, h('span', { class: 'sv-pastille sv-' + k }, dessin(ic)), h('span', null, t), h('strong', null, fmtEuro(v)))))),
            e(2, h('div', { class: 'sv-liste' }, (d.acquis || []).filter((x) => x.valeur > 0).map((x) => h('div', { class: 'sv-ligne' },
              h('span', { class: 'sv-pastille sv-commun' }, dessin(/r[ée]sidence|maison|appartement/i.test(x.libelle) ? 'maison' : 'tirelire')),
              h('span', null, 'Ensemble, pendant le mariage : ' + (x.libelle || 'acquisition').toLowerCase()), h('strong', null, fmtEuro(x.valeur)),
              h('span', { class: 'sv-finance' }, 'payé à ' + Math.round(100 * x.partA) + ' % par ' + nomA(d) + ', ' + Math.round(100 * (1 - x.partA)) + ' % par ' + nomB(d)))))),
            e(3, h('p', { class: 'sv-bulle-info' }, dessin('enfants'), (d.enfants ? d.enfants + ' enfant' + (d.enfants > 1 ? 's' : '') + ' commun' + (d.enfants > 1 ? 's' : '') : 'Pas d\'enfant') + '.')));
        },
      },
      {
        titre: 'Les paniers selon le régime',
        etapes: 2,
        rendu: (d) => {
          const m = E.masses(d);
          const max = Math.max(m.communaute.a.total, m.communaute.b.total, m.communaute.commun, m.separation.a.total, m.separation.b.total);
          const bloc = (r, titre) => h('div', { class: 'sv-regime' }, h('h3', null, titre), h('div', { class: 'sv-paniers' },
            panier('a', nomA(d), r.a.total, max),
            r.commun ? panier('commun', 'Communs', r.commun, max) : panier('vide', 'Communs', 0, max, null, 'aucun'),
            panier('b', nomB(d), r.b.total, max)));
          return h('div', { class: 'sv-deux' }, e(1, bloc(m.communaute, 'Communauté légale')), e(2, bloc(m.separation, 'Séparation de biens')));
        },
      },
      {
        titre: 'En cas de divorce',
        etapes: 3,
        rendu: (d) => {
          const r = E.divorce(d);
          const max = Math.max(r.communaute.a.total, r.communaute.b.total, r.separation.a.total, r.separation.b.total);
          const ligne = (k, x) => h('div', { class: 'sv-personne' }, h('div', { class: 'sv-personne-nom' }, h('span', { class: 'sv-point sv-' + k }), nomDe(d, k)),
            barre([{ valeur: x.propres, couleur: k, libelle: 'Ses biens' }, { valeur: x.commun, couleur: 'commun', libelle: 'Moitié des biens communs' }], max),
            h('strong', { class: 'sv-total' }, fmtEuro(x.total)));
          const bloc = (rr, titre) => h('div', { class: 'sv-regime' }, h('h3', null, titre), ligne('a', rr.a), ligne('b', rr.b));
          const ecart = r.communaute.b.total - r.separation.b.total;
          const qui = ecart >= 0 ? 'b' : 'a';
          return h('div', { class: 'sv-col' },
            h('p', { class: 'sv-intro' }, 'Chacun repart avec ses biens ; les biens communs sont partagés par moitié.'),
            e(1, bloc(r.communaute, 'Communauté légale')), e(2, bloc(r.separation, 'Séparation de biens')),
            legende([['a', 'Biens de ' + nomA(d)], ['b', 'Biens de ' + nomB(d)], ['commun', 'Moitié des biens communs']]),
            e(3, Math.abs(ecart) > 0.5 ? h('p', { class: 'sv-bulle-info' }, dessin('balance'), 'Avec la communauté, ' + nomDe(d, qui) + ' repart avec ' + fmtEuro(Math.abs(ecart)) + ' de plus.') : null));
        },
      },
      {
        titre: (d) => 'En cas de décès de ' + nomDe(d, d.decede === 'b' ? 'b' : 'a'),
        etapes: 4,
        rendu: (d) => {
          const r = E.deces(d);
          const v = nomDe(d, r.vivant);
          const max = Math.max(r.communaute.total, r.separation.total, r.communaute.enfants, r.separation.enfants);
          const bloc = (x, titre) => h('div', { class: 'sv-regime' }, h('h3', null, titre),
            h('div', { class: 'sv-personne' }, h('div', { class: 'sv-personne-nom' }, h('span', { class: 'sv-point sv-' + r.vivant }), v),
              barre([{ valeur: x.dontPropres, couleur: r.vivant, libelle: 'Ses biens' }, { valeur: x.dontCommun, couleur: 'commun', libelle: 'Sa moitié des biens communs' }, { valeur: x.herite, couleur: 'herite', libelle: 'Ce qu\'il hérite' }], max),
              h('strong', { class: 'sv-total' }, fmtEuro(x.total))),
            d.enfants ? h('div', { class: 'sv-personne' }, h('div', { class: 'sv-personne-nom' }, h('span', { class: 'sv-point sv-enfants' }), 'Les enfants'),
              barre([{ valeur: x.enfants, couleur: 'enfants', libelle: 'Héritent' }], max), h('strong', { class: 'sv-total' }, fmtEuro(x.enfants))) : null);
          const ecart = r.communaute.total - r.separation.total;
          return h('div', { class: 'sv-col' },
            h('p', { class: 'sv-intro' }, v + ' garde ses biens et sa moitié des biens communs, puis hérite ' + (r.fraction < 1 ? 'd\'un quart (ou de l\'usufruit de tout)' : 'de tout (sans enfant ni père et mère)') + '.'),
            e(1, bloc(r.communaute, 'Communauté légale')), e(2, bloc(r.separation, 'Séparation de biens')),
            legende([[r.vivant, 'Biens de ' + v], ['commun', 'Moitié des biens communs'], ['herite', 'Ce que ' + v + ' hérite'], d.enfants ? ['enfants', 'Part des enfants'] : null].filter(Boolean)),
            e(3, Math.abs(ecart) > 0.5 ? h('p', { class: 'sv-bulle-info' }, dessin('bouclier'), 'Avec la ' + (ecart > 0 ? 'communauté' : 'séparation de biens') + ', ' + v + ' conserve ' + fmtEuro(Math.abs(ecart)) + ' de plus.') : null),
            e(4, h('p', { class: 'sv-note' }, 'Sans donation entre époux ni testament : une donation entre époux peut augmenter la part du conjoint, quel que soit le régime.')));
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

  const PRESENTATIONS = [CONTRAT];

  /* ---------- Lecteur de présentation ---------- */
  function lecteur(container, pres) {
    let d = charger();
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
      const maj = () => { sauver(d); afficher(false); };
      const nb = (obj, k, opts) => ui.numberInput(Object.assign({ value: obj[k], suffix: '€', onChange: (v) => { obj[k] = v || 0; maj(); } }, opts || {}));
      const tx = (obj, k) => ui.textInput({ value: obj[k], onChange: (v) => { obj[k] = v; maj(); } });
      const epoux = (k) => h('div', { class: 'sv-panneau-bloc sv-bord-' + k },
        ui.field('Prénom', tx(d[k], 'prenom')),
        ui.field('Biens avant le mariage', nb(d[k], 'avant')),
        ui.field('Donations et héritages', nb(d[k], 'heritage')));
      const acquis = (d.acquis || []).map((x, i) => h('div', { class: 'sv-panneau-bloc' },
        ui.field('Achat pendant le mariage', tx(x, 'libelle')),
        ui.field('Valeur', nb(x, 'valeur')),
        ui.field('Payé par ' + nomA(d), ui.numberInput({ value: x.partA, percent: true, onChange: (v) => { x.partA = v === null ? 0.5 : v; maj(); } })),
        ui.button('Retirer', { icon: 'trash', variant: 'ghost', small: true, onClick: () => { d.acquis.splice(i, 1); remplirPanneau(); maj(); } })));
      panneau.replaceChildren(
        h('div', { class: 'sv-panneau-tete' }, h('strong', null, 'Chiffres de l\'exemple'), ui.button('Fermer', { variant: 'ghost', small: true, onClick: () => { panneau.hidden = true; } })),
        epoux('a'), epoux('b'), ...acquis,
        ui.button('Ajouter un achat', { icon: 'plus', variant: 'soft', small: true, onClick: () => { d.acquis.push({ libelle: 'Achat', valeur: 0, partA: 0.5 }); remplirPanneau(); maj(); } }),
        h('div', { class: 'sv-panneau-bloc' },
          ui.field('Enfants communs', ui.numberInput({ value: d.enfants, onChange: (v) => { d.enfants = Math.max(0, Math.round(v || 0)); maj(); } })),
          ui.field('Décès de', ui.segmented({ value: d.decede, small: true, options: [{ value: 'a', label: nomA(d) }, { value: 'b', label: nomB(d) }], onChange: (v) => { d.decede = v; maj(); } }))),
        ui.button('Revenir à l\'exemple d\'origine', { icon: 'reset', variant: 'ghost', small: true, onClick: () => { d = clone(E.EXEMPLE); sauver(d); remplirPanneau(); afficher(false); } }));
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
