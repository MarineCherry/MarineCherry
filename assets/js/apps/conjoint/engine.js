/*
 * Moteur — Droits du conjoint survivant.
 *
 * 1. Liquidation du régime matrimonial (communauté, séparation, participation aux acquêts, PACS),
 *    récompenses (art. 1469 C. civ.) et avantages matrimoniaux → actif net de succession.
 * 2. Dévolution : descendants (par souches, représentation), père et mère, frères et sœurs, autres héritiers.
 * 3. Droits du conjoint : droits légaux (art. 757 à 757-3), donation entre époux ou testament
 *    (art. 1094-1 : quotité disponible ordinaire, ¼ PP + ¾ US, totalité en usufruit), cantonnement,
 *    droit viager au logement (art. 764), legs à d'autres bénéficiaires, contrôle de la quotité disponible.
 * 4. Droits de succession par bénéficiaire (art. 777 et suivants CGI), usufruit évalué selon l'art. 669,
 *    rappel fiscal, abattement de 20 % sur la résidence principale, assurance-vie (art. 990 I et 757 B).
 * Fonctions pures : aucune dépendance au navigateur, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.conjoint = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REGIMES = [
    { id: 'communaute', libelle: 'Communauté réduite aux acquêts', marie: true, communaute: true },
    { id: 'universelle', libelle: 'Communauté universelle', marie: true, communaute: true },
    { id: 'separation', libelle: 'Séparation de biens', marie: true },
    { id: 'participation', libelle: 'Participation aux acquêts', marie: true },
    { id: 'pacs', libelle: 'Partenaires pacsés', marie: false },
    { id: 'aucun', libelle: 'Pas de conjoint survivant', marie: false },
  ];
  const LIENS = [
    { id: 'enfant', libelle: 'Enfant' },
    { id: 'petit-enfant', libelle: 'Petit-enfant' },
    { id: 'parent', libelle: 'Père ou mère' },
    { id: 'frere', libelle: 'Frère ou sœur' },
    { id: 'neveu', libelle: 'Neveu ou nièce' },
    { id: 'parent4', libelle: 'Parent jusqu\'au 4e degré' },
    { id: 'tiers', libelle: 'Autre (non parent)' },
    { id: 'conjoint', libelle: 'Conjoint ou partenaire pacsé' },
  ];

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const n = (v) => (isNum(v) ? v : 0);
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const clamp0 = (v) => Math.max(0, v);

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function usufruitParAge(bareme, age) {
    let v = bareme.length ? bareme[0].usufruit : 0;
    for (const row of bareme) if (age >= row.age) v = row.usufruit;
    return v;
  }
  function droitsBareme(bareme, base) {
    let droits = 0;
    for (let i = 0; i < bareme.length; i++) {
      const ecart = bareme[i].taux - (i > 0 ? bareme[i - 1].taux : 0);
      if (base > bareme[i].de) droits += (base - bareme[i].de) * ecart;
    }
    return droits;
  }

  /* ---------- Récompense (art. 1469 C. civ.) ---------- */
  /*
   * type : 'necessaire' (dépense nécessaire : pas moins que la dépense faite),
   *        'acquisition' (acquisition, conservation, amélioration d'un bien existant : pas moins que le profit subsistant),
   *        'autre' (la plus faible des deux sommes).
   * profit subsistant = dépense × valeur actuelle du bien / coût total d'origine.
   */
  function recompense(c) {
    const depense = n(c.depense);
    const profit = n(c.coutTotal) > 0 ? (depense * n(c.valeurActuelle)) / n(c.coutTotal) : depense;
    const base = Math.min(depense, profit);
    let montant = base;
    if (c.type === 'necessaire') montant = Math.max(base, depense);
    if (c.type === 'acquisition') montant = Math.max(base, profit);
    return { depense, profit, montant };
  }
  const montantRecompense = (r) => (r.mode === 'calcul' ? recompense(r.calcul || {}).montant : n(r.montant));

  /* ---------- 1. Liquidation du régime ---------- */
  function liquider(d, p) {
    const regime = REGIMES.find((r) => r.id === d.regime) || REGIMES[0];
    const av = d.avantages || {};
    const biens = (d.biens || []).map((b) => Object.assign({}, b, { valeur: n(b.valeur) }));
    const passif = (d.passif || []).map((x) => Object.assign({}, x, { montant: n(x.montant) }));
    const recs = regime.communaute ? (d.recompenses || []).map((r) => Object.assign({}, r, { montantCalcule: montantRecompense(r) })) : [];

    const propresDefunt = sum(biens.filter((b) => b.propriete === 'defunt'), (b) => b.valeur);
    const indivis = sum(biens.filter((b) => b.propriete === 'indivis'), (b) => b.valeur * n(b.quoteDefunt));
    const communs = regime.communaute ? sum(biens.filter((b) => b.propriete === 'commun'), (b) => b.valeur) : 0;
    const passifCommun = regime.communaute ? sum(passif.filter((x) => x.charge === 'commun'), (x) => x.montant) : 0;
    const passifDefunt = sum(passif.filter((x) => x.charge !== 'commun' || !regime.communaute), (x) => x.montant);

    // Récompenses : « doit » = l'époux doit à la communauté ; « du » = la communauté doit à l'époux.
    const rec = (epoux, sens) => sum(recs.filter((r) => r.epoux === epoux && r.sens === sens), (r) => r.montantCalcule);
    const dues = rec('defunt', 'doit') + rec('conjoint', 'doit');
    const doitComm = rec('defunt', 'du') + rec('conjoint', 'du');
    const preciput = regime.communaute ? n(av.preciput) : 0;
    const masseCommune = communs - passifCommun + dues - doitComm;
    const aPartager = masseCommune - preciput;
    const partSurvivant = av.attributionIntegrale ? 1 : isNum(av.partSurvivant) ? av.partSurvivant : 0.5;
    const pD = regime.communaute ? 1 - partSurvivant : 0;
    let partCommunaute = regime.communaute ? aPartager * pD + rec('defunt', 'du') - rec('defunt', 'doit') : 0;
    if (regime.communaute && av.attributionIntegrale) partCommunaute = 0;

    // Participation aux acquêts : créance de participation.
    let creanceParticipation = 0;
    if (regime.id === 'participation') {
      const pa = d.participation || {};
      const acqD = clamp0(n(pa.finalDefunt) - n(pa.originaireDefunt));
      const acqC = clamp0(n(pa.finalConjoint) - n(pa.originaireConjoint));
      creanceParticipation = (acqC - acqD) / 2; // > 0 : le conjoint doit à la succession ; < 0 : la succession doit au conjoint
    }

    const frais = n(d.fraisFuneraires);
    const calcule = propresDefunt + indivis + partCommunaute + creanceParticipation - passifDefunt - frais;
    const saisie = biens.length === 0 && passif.length === 0 && !isNum(d.actifNetManuel) ? null : d.actifNetManuel;
    const actifNet = isNum(saisie) ? saisie : calcule;

    // Part de chaque bien dans la succession (résidence principale, logement, biens de famille, cantonnement).
    const fraction = (b) => (b.propriete === 'defunt' ? 1 : b.propriete === 'indivis' ? n(b.quoteDefunt) : b.propriete === 'commun' && regime.communaute ? pD : 0);
    const partBien = (b) => b.valeur * fraction(b);

    const alertes = [];
    const avantage = regime.communaute && (av.attributionIntegrale || preciput > 0 || (isNum(av.partSurvivant) && av.partSurvivant !== 0.5));
    if (avantage && (d.enfants || []).some((e) => e.nom && e.commun === false)) {
      alertes.push('Avantage matrimonial en présence d\'enfants non issus des deux époux : action en retranchement possible (art. 1527 C. civ.), non calculée ici.');
    }
    if (actifNet < 0) alertes.push('Actif net négatif : la succession est déficitaire.');
    return {
      regime, propresDefunt, indivis, communs, passifCommun, passifDefunt, dues, doitComm, preciput, masseCommune, aPartager,
      partSurvivant, partCommunaute, creanceParticipation, frais, calcule, actifNet, manuel: isNum(saisie),
      recompenses: recs, fraction, partBien, alertes,
    };
  }

  /* ---------- 2. Héritiers ---------- */
  function heritiers(d) {
    const nom = (x) => x && x.nom && x.nom.trim();
    const enfants = (d.enfants || []).filter(nom);
    const pe = (d.petitsEnfants || []).filter(nom);
    // Souches de descendants : enfant vivant, ou représenté par ses descendants (prédécédé ou renonçant).
    const souches = [];
    enfants.forEach((e) => {
      const statut = e.statut || 'vivant';
      if (statut === 'vivant') souches.push({ id: e.id, tete: e, membres: [{ personne: e, lien: 'enfant', represente: null }] });
      else {
        const rep = pe.filter((x) => x.parent === e.id);
        if (rep.length) souches.push({ id: e.id, tete: e, membres: rep.map((x) => ({ personne: x, lien: 'petit-enfant', represente: e })) });
      }
    });
    const fratrie = (d.fratrie || []).filter(nom);
    const neveux = (d.neveux || []).filter(nom);
    const souchesFratrie = [];
    fratrie.forEach((f) => {
      const statut = f.statut || 'vivant';
      if (statut === 'vivant') souchesFratrie.push({ id: f.id, tete: f, membres: [{ personne: f, lien: 'frere', represente: null }] });
      else {
        const rep = neveux.filter((x) => x.parent === f.id);
        if (rep.length) souchesFratrie.push({ id: f.id, tete: f, membres: rep.map((x) => ({ personne: x, lien: 'neveu', represente: f })) });
      }
    });
    const parents = [];
    if (d.pere && d.pere.vivant) parents.push({ personne: { id: 'pere', nom: d.pere.nom || 'Père' }, lien: 'parent' });
    if (d.mere && d.mere.vivant) parents.push({ personne: { id: 'mere', nom: d.mere.nom || 'Mère' }, lien: 'parent' });
    const autres = (d.autres || []).filter(nom);
    return { enfants, souches, souchesFratrie, parents, autres, tousCommuns: enfants.every((e) => e.commun !== false) };
  }

  /* ---------- 3. Scénarios ---------- */
  const OPTIONS = {
    'legal-pp': { libelle: 'Droits légaux : ¼ en pleine propriété', court: 'Légal ¼ PP' },
    'legal-us': { libelle: 'Droits légaux : totalité en usufruit', court: 'Légal usufruit' },
    legal: { libelle: 'Droits légaux', court: 'Légal' },
    'ddv-qd': { libelle: 'Quotité disponible ordinaire en pleine propriété', court: 'QD en PP' },
    'ddv-mixte': { libelle: '¼ en pleine propriété et ¾ en usufruit', court: '¼ PP + ¾ US' },
    'ddv-us': { libelle: 'Totalité en usufruit', court: 'Totalité US' },
    'ddv-total': { libelle: 'Totalité en pleine propriété (libéralité)', court: 'Totalité PP' },
    'legs-partenaire': { libelle: 'Legs au partenaire', court: 'Legs' },
    sans: { libelle: 'Dévolution légale', court: 'Dévolution' },
  };

  function scenarios(d, h) {
    const regime = REGIMES.find((r) => r.id === d.regime) || REGIMES[0];
    const lib = d.liberaliteConjoint && d.liberaliteConjoint.type && d.liberaliteConjoint.type !== 'aucune';
    if (regime.marie) {
      if (h.souches.length) {
        const out = ['legal-pp'];
        if (h.tousCommuns) out.push('legal-us');
        if (lib) out.push('ddv-qd', 'ddv-mixte', 'ddv-us');
        return out;
      }
      return lib ? ['legal', 'ddv-total'] : ['legal'];
    }
    if (regime.id === 'pacs' && lib) return ['sans', 'legs-partenaire'];
    return ['sans'];
  }

  // Nature d'une donation : en avancement de part (rapportable), donation-partage ou hors part.
  // Les anciens dossiers ne connaissent que l'indicateur « horsPart ».
  function nature(x) {
    return x.nature || (x.horsPart ? 'horsPart' : 'avancement');
  }

  function qdOrdinaire(nbEnfants) {
    if (nbEnfants <= 0) return 1;
    return nbEnfants === 1 ? 1 / 2 : nbEnfants === 2 ? 1 / 3 : 1 / 4;
  }

  /*
   * Répartition des biens existants pour un scénario.
   * Renvoie la part en pleine propriété et en nue-propriété de chaque bénéficiaire (valeurs civiles).
   */
  function repartir(code, d, p, liq, h) {
    const regime = REGIMES.find((r) => r.id === d.regime) || REGIMES[0];
    const us = regime.marie || regime.id === 'pacs' ? usufruitParAge(p.bareme669, n(d.conjoint && d.conjoint.age)) : 0;
    const A = clamp0(liq.actifNet);
    const dons = (d.donations || []).filter((x) => n(x.valeur) > 0);
    const estConjoint = (id) => id === 'conjoint';
    const souchesId = new Map();
    h.souches.forEach((s) => s.membres.forEach((m) => souchesId.set(m.personne.id, s.id)));
    h.souches.forEach((s) => souchesId.set(s.id, s.id));
    const Dc = sum(dons.filter((x) => estConjoint(x.beneficiaire)), (x) => n(x.valeur));
    const aHeritier = (x) => !estConjoint(x.beneficiaire) && souchesId.has(x.beneficiaire);
    const rapportables = dons.filter((x) => aHeritier(x) && nature(x) === 'avancement');
    // Donation-partage (art. 1075 s.) : réunie à la masse de calcul (valeur fixée selon l'art. 1078),
    // imputée sur la réserve du gratifié, mais ni rapportée ni comprise dans la masse de l'art. 758-5.
    const partages = dons.filter((x) => aHeritier(x) && nature(x) === 'partage');
    const Dr = sum(rapportables, (x) => n(x.valeur));
    const Dp = sum(partages, (x) => n(x.valeur));
    const Dh = sum(dons, (x) => n(x.valeur)) - Dc - Dr - Dp;
    const M = A + Dr + Dp + Dh + Dc; // masse de calcul (art. 922)
    const nbEnf = h.souches.length;
    const qdo = qdOrdinaire(nbEnf);
    const alertes = [];
    // Part de la donation-partage qui excède la réserve individuelle du gratifié : imputée sur la quotité disponible.
    const surplusPartage = [];
    if (nbEnf) {
      const resInd = ((1 - qdo) * M) / nbEnf;
      h.souches.forEach((s) => {
        const ds = partages.filter((x) => souchesId.get(x.beneficiaire) === s.id);
        const exc = sum(ds, (x) => n(x.valeur)) - resInd;
        if (exc > 0.5) {
          const dernier = ds.slice().sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1))[0];
          surplusPartage.push(Object.assign({}, dernier, { valeur: exc, surplusPartage: true }));
        }
      });
    }
    const DpReserve = Dp - sum(surplusPartage, (x) => x.valeur);

    // Legs à d'autres bénéficiaires (préciput ou légataires), pris sur les biens existants.
    let legs = (d.legs || []).filter((l) => l.beneficiaire || (l.nom && l.nom.trim())).map((l) => {
      const v = l.mode === 'quotite' ? n(l.quotite) * A : n(l.montant);
      return { legs: l, valeur: Math.min(v, A) };
    });
    let L = sum(legs, (x) => x.valeur);
    if (L > A) {
      legs.forEach((x) => (x.valeur = (x.valeur * A) / L));
      L = A;
    }

    /*
     * Réduction des libéralités excédant la quotité disponible (descendants réservataires).
     * Ordre (art. 923 C. civ.) : les donations s'imputent de la plus ancienne à la plus récente ;
     * les legs (et la libéralité au conjoint) ne viennent qu'ensuite et sont réduits les premiers, au prorata.
     * Indemnité de réduction en valeur (art. 924) : pour un héritier réservataire, l'excédent s'impute
     * d'abord sur sa part de réserve (il est traité comme une avance sur sa part) ; un tiers verse l'excédent
     * à la succession.
     */
    const reduction = { donations: [], legs: [], imputees: [], indemnitesTiers: 0, excesHeritiers: new Map(), qdRestante: null };
    const us0 = us;
    if (nbEnf) {
      const qdoVal = qdo * M;
      let restant = qdoVal;
      dons.filter((x) => !estConjoint(x.beneficiaire) && !rapportables.includes(x) && !partages.includes(x))
        .concat(surplusPartage)
        .sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : 0))
        .forEach((x) => {
          const v = n(x.valeur);
          const imp = Math.min(v, clamp0(restant));
          restant -= imp;
          const exces = v - imp;
          const heritier = souchesId.has(x.beneficiaire);
          reduction.imputees.push({ don: x, valeur: v, impute: imp, exces, heritier });
          if (exces > 0.5) {
            reduction.donations.push({ don: x, valeur: v, impute: imp, exces, heritier });
            if (heritier) {
              const sid = souchesId.get(x.beneficiaire);
              reduction.excesHeritiers.set(sid, (reduction.excesHeritiers.get(sid) || 0) + exces);
            } else reduction.indemnitesTiers += exces;
          }
        });
      restant = clamp0(restant);
      // Plafond des legs : reste de la quotité disponible ordinaire ; pour une libéralité au conjoint,
      // le cumul ne peut dépasser la plus forte des quotités disponibles (ordinaire ou spéciale).
      let lmax = restant;
      if (code.startsWith('ddv')) {
        const qds = code === 'ddv-qd' ? qdoVal : code === 'ddv-mixte' ? (0.25 + 0.75 * us0) * M : us0 * M;
        const cap = Math.max(qdoVal, qds) - (qdoVal - restant) - Dc;
        let l2 = Infinity;
        if (code === 'ddv-qd') l2 = cap - clamp0(qdo * M - Dc);
        if (code === 'ddv-mixte') {
          const ppc = clamp0(0.25 * M - Dc);
          l2 = (cap - ppc - us0 * (A - ppc)) / (1 - us0);
        }
        if (code === 'ddv-us') l2 = (cap - us0 * A) / (1 - us0);
        if (l2 < -0.5) alertes.push('La libéralité au conjoint dépasse à elle seule la quotité disponible restante : réduction de la libéralité au conjoint à prévoir (non calculée).');
        lmax = Math.min(lmax, clamp0(l2));
      }
      if (L > lmax + 0.5) {
        const f = L > 0 ? lmax / L : 0;
        legs.forEach((x) => {
          reduction.legs.push({ legs: x.legs, valeur: x.valeur, reduit: x.valeur * f });
          x.valeur *= f;
        });
        L = lmax;
      }
      reduction.qdRestante = clamp0(restant - L);
      reduction.donations.forEach((r) => alertes.push('Donation ' + (r.don.date ? 'du ' + r.don.date.split('-').reverse().join('/') + ' ' : '') + 'au-delà de la quotité disponible : réduction de ' + Math.round(r.exces).toLocaleString('fr-FR') + ' € ' + (r.heritier ? '(imputée sur la part de réserve du gratifié).' : '(indemnité due à la succession).')));
      if (reduction.legs.length) alertes.push('Legs réduits au prorata de ' + Math.round(sum(reduction.legs, (x) => x.valeur - x.reduit)).toLocaleString('fr-FR') + ' € pour respecter la quotité disponible.');
    }
    const excesHeritiers = sum([...reduction.excesHeritiers.values()], (x) => x);

    // Conjoint.
    const conj = { pp: 0, usBase: 0, viager: 0, libelle: '' };
    const lc = d.liberaliteConjoint || {};
    const cant = (code.startsWith('ddv') || code === 'legs-partenaire') && lc.cantonnement && lc.cantonnement.mode !== 'aucun' ? lc.cantonnement : null;
    const valeurBiens = (ids) => sum((d.biens || []).filter((b) => (ids || []).includes(b.id)), (b) => liq.partBien(b));
    const dispo = A - L;
    // Réserve des descendants (art. 913) et part de réserve à prendre sur les biens existants
    // (les donations rapportables s'imputent sur la réserve).
    const reserveGlobale = nbEnf ? (1 - qdo) * M : 0;
    // L'excédent des donations réduites remplit la réserve (imputation ou indemnité versée).
    const reserveSurBiens = clamp0(reserveGlobale - Dr - DpReserve - excesHeritiers - reduction.indemnitesTiers);
    const calc = { A, L, Dr, Dp, DpReserve, Dh, Dc, M, qdo, reserveGlobale, reserveSurBiens, dispo, masse758: A + Dr, conjBrut: null, plafond: null, fraction: null, assiette: null, reduction };
    if (regime.marie && nbEnf) {
      if (code === 'legal-pp') Object.assign(calc, { fraction: 0.25, assiette: A + Dr, conjBrut: 0.25 * (A + Dr) - Dc, plafond: clamp0(dispo - reserveSurBiens) });
      if (code === 'ddv-qd') Object.assign(calc, { fraction: qdo, assiette: M, conjBrut: qdo * M - Dc, plafond: dispo });
      if (code === 'ddv-mixte') Object.assign(calc, { fraction: 0.25, assiette: M, conjBrut: 0.25 * M - Dc, plafond: dispo });
      if (code === 'legal-us' || code === 'ddv-us') conj.usBase = dispo;
      if (calc.conjBrut !== null) conj.pp = Math.min(clamp0(calc.conjBrut), calc.plafond);
      if (code === 'legal-pp' && calc.conjBrut > calc.plafond + 0.5) {
        alertes.push('Le quart légal du conjoint (' + Math.round(calc.conjBrut).toLocaleString('fr-FR') + ' €) est réduit à ' + Math.round(calc.plafond).toLocaleString('fr-FR') + ' € pour préserver la réserve des descendants (art. 758-5 al. 2 C. civ.).');
      }
      if (code === 'ddv-mixte') conj.usBase = clamp0(dispo - conj.pp);
    }
    const parts = []; // { id, nom, lien, represente, souche, pp, np }
    const ajouter = (personne, lien, represente, pp, np, extra) => {
      let x = parts.find((y) => y.id === personne.id);
      if (!x) {
        x = { id: personne.id, nom: personne.nom, lien, represente: represente || null, handicape: !!personne.handicape, pp: 0, np: 0, legs: 0 };
        parts.push(x);
      }
      x.pp += pp;
      x.np += np;
      if (extra) x.legs += extra;
      return x;
    };

    // Cantonnement : fraction ou biens choisis.
    if (cant) {
      if (cant.mode === 'fraction') {
        const f = Math.min(1, clamp0(n(cant.fraction)));
        conj.pp *= f;
        conj.usBase *= f;
      } else if (cant.mode === 'biens') {
        const vb = valeurBiens(cant.biens);
        if (conj.usBase > 0 && conj.pp > 0) {
          conj.pp = Math.min(conj.pp, vb);
          conj.usBase = Math.min(conj.usBase, clamp0(vb - conj.pp));
        } else if (conj.usBase > 0) conj.usBase = Math.min(conj.usBase, vb);
        else conj.pp = Math.min(conj.pp, vb);
      }
    }

    // Droit viager au logement (art. 764) : imputé sur les droits du conjoint (art. 765).
    if (regime.marie && d.logementViager && d.logementViager.actif) {
      const b = (d.biens || []).find((x) => x.id === d.logementViager.bienId);
      const valeurLogement = b ? liq.partBien(b) : n(d.logementViager.valeur);
      const v = p.coefHabitation * us * valeurLogement;
      if (conj.usBase > 0) {
        alertes.push('Droit viager au logement : absorbé par l\'usufruit du conjoint (pas de valeur distincte).');
      } else {
        conj.viager = v;
        // Le conjoint reçoit au moins la valeur du droit ; sa part en pleine propriété est diminuée d'autant.
        conj.pp = clamp0(conj.pp - v);
      }
    }

    // Pas de descendants, conjoint marié.
    let restePP = 0;
    if (regime.marie && !nbEnf) {
      let partConjoint = 1;
      const nbParents = h.parents.length;
      if (code === 'legal') partConjoint = nbParents === 2 ? 0.5 : nbParents === 1 ? 0.75 : 1;
      let base = dispo - conj.viager;
      // Biens de famille (art. 757-3) : moitié aux frères et sœurs (ou leurs descendants) en l'absence de père et mère.
      let famille = 0;
      if (code === 'legal' && !nbParents && h.souchesFratrie.length) {
        famille = 0.5 * sum((d.biens || []).filter((b) => b.familial), (b) => liq.partBien(b));
        famille = Math.min(famille, base);
        const parSouche = famille / h.souchesFratrie.length;
        h.souchesFratrie.forEach((s) => s.membres.forEach((m) => ajouter(m.personne, m.lien, m.represente, parSouche / s.membres.length, 0)));
      }
      conj.pp = (base - famille) * partConjoint + (code === 'legal' ? 0 : 0);
      if (code === 'legal' && nbParents) {
        const partParent = (base * (1 - partConjoint)) / nbParents;
        h.parents.forEach((x) => ajouter(x.personne, 'parent', null, partParent, 0));
      }
      if (code === 'ddv-total') conj.pp = base;
      // Réserve du conjoint (art. 914-1) : ¼ en l'absence de descendants.
      if (L > 0.75 * (A + Dh + Dr + Dp) + 0.005) alertes.push('Legs supérieurs à la quotité disponible : la réserve du conjoint (¼) est atteinte (art. 914-1 C. civ.).');
    } else if (nbEnf) {
      // Descendants : pleine propriété restante et nue-propriété, par souches, rapport en moins prenant.
      const R = clamp0(dispo - conj.pp - conj.viager);
      const U = Math.min(conj.usBase, R);
      const nueTotale = U;
      const donsSouche = new Map(h.souches.map((s) => [s.id, 0]));
      rapportables.forEach((x) => {
        const sid = souchesId.get(x.beneficiaire);
        donsSouche.set(sid, donsSouche.get(sid) + n(x.valeur));
      });
      // Réduction d'une donation hors part à un héritier : l'excédent s'impute sur sa part (comme un rapport).
      reduction.excesHeritiers.forEach((v, sid) => donsSouche.set(sid, donsSouche.get(sid) + v));
      // Partage égal de (biens + donations rapportées + indemnités versées par des tiers).
      // Une souche dont les donations dépassent sa part ne reçoit rien et doit l'excédent à ses cohéritiers.
      const pool = R + reduction.indemnitesTiers + sum(h.souches, (s) => donsSouche.get(s.id));
      const partNette = pool / h.souches.length;
      const nets = h.souches.map((s) => partNette - donsSouche.get(s.id));
      const positif = sum(nets, (x) => clamp0(x));
      Object.assign(calc, {
        R, U, pool, partNette, indemnitesTiers: reduction.indemnitesTiers,
        souches: h.souches.map((s, i) => ({ nom: s.tete.nom, membres: s.membres.map((m) => m.personne.nom), donations: donsSouche.get(s.id), excesReduction: reduction.excesHeritiers.get(s.id) || 0, net: clamp0(nets[i]), indemnite: clamp0(-nets[i]) })),
      });
      h.souches.forEach((s, i) => {
        const net = clamp0(nets[i]);
        if (nets[i] < -0.5) alertes.push('Les donations reçues par la souche ' + s.tete.nom + ' dépassent sa part de ' + Math.round(-nets[i]).toLocaleString('fr-FR') + ' € : indemnité due à ses cohéritiers.');
        // La nue-propriété (biens grevés de l'usufruit) est répartie au prorata des parts nettes.
        const np = positif > 0 ? (U * net) / positif : 0;
        const pp = net - np;
        s.membres.forEach((m) => ajouter(m.personne, m.lien, m.represente, pp / s.membres.length, np / s.membres.length));
      });
    } else {
      // Sans conjoint héritier (PACS ou aucun) et sans descendants : parents, frères et sœurs, autres.
      let base = dispo;
      if (code === 'legs-partenaire') {
        conj.pp = base;
        base = 0;
      }
      if (base > 0) {
        const nbP = h.parents.length;
        const nbF = h.souchesFratrie.length;
        let partParents = 0;
        if (nbP && nbF) partParents = 0.25 * nbP;
        else if (nbP) partParents = 1;
        h.parents.forEach((x) => ajouter(x.personne, 'parent', null, (base * partParents) / nbP, 0));
        if (nbF) {
          const parSouche = (base * (1 - partParents)) / nbF;
          h.souchesFratrie.forEach((s) => s.membres.forEach((m) => ajouter(m.personne, m.lien, m.represente, parSouche / s.membres.length, 0)));
        }
        if (!nbP && !nbF) {
          const tot = sum(h.autres, (x) => n(x.part)) || h.autres.length;
          h.autres.forEach((x) => ajouter(x, x.lien || 'parent4', null, (base * (n(x.part) || 1)) / tot, 0));
          if (!h.autres.length && base > 0) alertes.push('Aucun héritier saisi : la succession reviendrait à l\'État.');
        }
      }
    }
    // PACS avec descendants : legs au partenaire = quotité disponible en pleine propriété.
    if (code === 'legs-partenaire' && nbEnf) {
      // Recalcul : le partenaire reçoit la quotité disponible, les descendants le reste.
      parts.length = 0;
      conj.pp = Math.min(qdo * M, dispo);
      const R = dispo - conj.pp;
      h.souches.forEach((s) => s.membres.forEach((m) => ajouter(m.personne, m.lien, m.represente, R / h.souches.length / s.membres.length, 0)));
    }

    // Legs aux autres bénéficiaires.
    legs.forEach((x) => {
      const l = x.legs;
      const heritier = parts.find((y) => y.id === l.beneficiaire);
      if (heritier) {
        heritier.pp += x.valeur;
        heritier.legs += x.valeur;
      } else {
        const pers = findPersonne(d, l.beneficiaire) || { id: l.id, nom: l.nom || 'Légataire' };
        ajouter(pers, l.lien || pers.lien || 'tiers', null, x.valeur, 0, x.valeur);
      }
    });

    calc.viager = conj.viager;
    // Indemnité de réduction due par un donataire non héritier réservataire.
    reduction.donations.filter((r) => !r.heritier).forEach((r) => {
      const pers = findPersonne(d, r.don.beneficiaire) || { id: r.don.beneficiaire, nom: r.don.beneficiaire };
      const x = parts.find((y) => y.id === pers.id);
      if (x) x.indemnite = (x.indemnite || 0) + r.exces;
    });
    return { code, us, A, M, qdo, Dr, Dp, Dh, Dc, L, conj, parts, alertes, calc };
  }

  function findPersonne(d, id) {
    if (!id) return null;
    const all = [].concat(d.enfants || [], d.petitsEnfants || [], d.fratrie || [], d.neveux || [], d.autres || []);
    const p = all.find((x) => x.id === id);
    if (p) return p;
    if (id === 'pere' && d.pere) return { id: 'pere', nom: d.pere.nom || 'Père', lien: 'parent' };
    if (id === 'mere' && d.mere) return { id: 'mere', nom: d.mere.nom || 'Mère', lien: 'parent' };
    return null;
  }

  /* ---------- 4. Fiscalité ---------- */
  function liquiderDroits(bareme, abattement, base, rappel) {
    const abattementUtilise = Math.min(base, clamp0(abattement - rappel));
    const resteTaxable = clamp0(base - abattementUtilise);
    const dejaTaxe = clamp0(rappel - abattement);
    const droits = droitsBareme(bareme, dejaTaxe + resteTaxable) - droitsBareme(bareme, dejaTaxe);
    return { abattement: abattementUtilise, resteTaxable, droits };
  }
  function regleFiscale(lien, p) {
    const f = p.fiscal;
    switch (lien) {
      case 'enfant': case 'petit-enfant-rep': case 'parent': return { abattement: p.abattEnfant, bareme: p.bareme777 };
      case 'petit-enfant': return { abattement: f.abattDefaut, bareme: p.bareme777 };
      case 'frere': case 'neveu-rep': return { abattement: f.abattFrere, bareme: f.baremeFrere };
      case 'neveu': return { abattement: f.abattNeveu, bareme: f.baremeParent4 };
      case 'parent4': return { abattement: f.abattDefaut, bareme: f.baremeParent4 };
      case 'conjoint': return { exonere: true };
      default: return { abattement: f.abattDefaut, bareme: f.baremeTiers };
    }
  }

  function fiscalite(rep, d, p, liq) {
    const f = p.fiscal;
    const A = rep.A;
    // Ajustements fiscaux : abattement de 20 % sur la résidence principale, frais funéraires limités à 1 500 €.
    let ajust = 0;
    if (d.abattementRP) {
      const rp = (d.biens || []).find((b) => b.residencePrincipale);
      if (rp) ajust -= f.abattementRP * liq.partBien(rp);
    }
    ajust += clamp0(n(d.fraisFuneraires) - f.forfaitFuneraire);
    const coef = A > 0 ? clamp0(A + ajust) / A : 1;
    const dateDeces = parseDate(d.dateDeces);
    const limite = dateDeces ? Date.UTC(dateDeces.y - f.delaiRappel, dateDeces.m - 1, dateDeces.d) : null;
    const rappelDe = (id) => sum((d.donations || []).filter((x) => x.beneficiaire === id), (x) => {
      const dt = parseDate(x.date);
      if (!dt || !limite || Date.UTC(dt.y, dt.m - 1, dt.d) <= limite) return 0;
      return isNum(x.montantFiscal) ? x.montantFiscal : n(x.valeur);
    });

    // Assurance-vie.
    const contrats = (d.assurancesVie || []).filter((c) => c.beneficiaire);
    const primesApres = sum(contrats, (c) => n(c.primesApres70));
    const excedent757B = clamp0(primesApres - f.abattement757B);
    const av = new Map();
    contrats.forEach((c) => {
      const x = av.get(c.beneficiaire) || { avant70: 0, apres70: 0 };
      x.avant70 += n(c.capitalAvant70);
      x.apres70 += n(c.primesApres70);
      av.set(c.beneficiaire, x);
    });

    // Abattement partagé entre représentants d'une même souche.
    const nbRep = new Map();
    rep.parts.forEach((x) => { if (x.represente) nbRep.set(x.represente.id, (nbRep.get(x.represente.id) || 0) + 1); });

    const lignes = rep.parts.map((x) => {
      const valeur = x.pp + x.np * (1 - rep.us);
      let lien = x.lien;
      if (x.represente && lien === 'petit-enfant') lien = 'petit-enfant-rep';
      if (x.represente && lien === 'neveu') lien = 'neveu-rep';
      const regle = regleFiscale(lien, p);
      const a = av.get(x.id) || { avant70: 0, apres70: 0 };
      const ajout757B = primesApres > 0 ? (excedent757B * a.apres70) / primesApres : 0;
      const base = valeur * coef + ajout757B;
      let abattement = regle.abattement || 0;
      if (x.represente) abattement = abattement / (nbRep.get(x.represente.id) || 1);
      if (x.handicape) abattement += f.abattHandicap;
      const rappel = rappelDe(x.id);
      const l = regle.exonere ? { abattement: 0, resteTaxable: 0, droits: 0 } : liquiderDroits(regle.bareme, abattement, base, rappel);
      const c990 = clamp0(a.avant70 - f.abattement990I);
      const droits990 = regle.exonere ? 0 : f.taux990I1 * Math.min(c990, f.seuil990I) + f.taux990I2 * clamp0(c990 - f.seuil990I);
      return Object.assign({}, x, { valeur, base, rappel, ajout757B, capitalAv: a.avant70, droits990, abattementTotal: abattement }, l, { totalDroits: l.droits + droits990 });
    });
    // Assurance-vie d'un bénéficiaire qui n'hérite pas (conjoint, tiers).
    av.forEach((a, id) => {
      if (lignes.some((x) => x.id === id)) return;
      const pers = id === 'conjoint' ? { id: 'conjoint', nom: (d.conjoint && d.conjoint.nom) || 'Conjoint', lien: 'conjoint' } : findPersonne(d, id) || { id, nom: id, lien: 'tiers' };
      const regle = regleFiscale(pers.lien || 'tiers', p);
      const ajout757B = primesApres > 0 ? (excedent757B * a.apres70) / primesApres : 0;
      const l = regle.exonere ? { abattement: 0, resteTaxable: 0, droits: 0 } : liquiderDroits(regle.bareme, regle.abattement + (pers.handicape ? f.abattHandicap : 0), ajout757B, rappelDe(id));
      const c990 = clamp0(a.avant70 - f.abattement990I);
      const droits990 = regle.exonere ? 0 : f.taux990I1 * Math.min(c990, f.seuil990I) + f.taux990I2 * clamp0(c990 - f.seuil990I);
      if (id === 'conjoint') return;
      lignes.push(Object.assign({ id, nom: pers.nom, lien: pers.lien || 'tiers', pp: 0, np: 0, legs: 0, valeur: 0, base: ajout757B, rappel: 0, ajout757B, capitalAv: a.avant70, droits990 }, l, { totalDroits: l.droits + droits990 }));
    });
    return { coef, lignes, totalDroits: sum(lignes, (x) => x.totalDroits) };
  }

  /* ---------- Calcul complet ---------- */
  function calculer(d, p) {
    const liq = liquider(d, p);
    const h = heritiers(d);
    const codes = scenarios(d, h);
    const regime = liq.regime;
    const res = codes.map((code) => {
      const rep = repartir(code, d, p, liq, h);
      const fisc = fiscalite(rep, d, p, liq);
      const conj = rep.conj;
      const valeurConjoint = conj.pp + conj.viager + rep.us * conj.usBase;
      return Object.assign({ code }, OPTIONS[code], {
        rep, fisc,
        conjoint: { pp: conj.pp, usBase: conj.usBase, usValeur: rep.us * conj.usBase, viager: conj.viager, valeur: valeurConjoint },
        totalDroits: fisc.totalDroits,
        alertes: rep.alertes,
      });
    });
    let meilleure = null;
    res.forEach((r) => { if (!meilleure || r.totalDroits < meilleure.totalDroits - 0.5) meilleure = r; });
    const controles = [];
    if (regime.marie && !(d.conjoint && isNum(d.conjoint.age))) controles.push('Âge du conjoint non renseigné : l\'usufruit est évalué à 90 % (barème de l\'art. 669).');
    if (!h.souches.length && !h.parents.length && !h.souchesFratrie.length && !h.autres.length && !regime.marie) controles.push('Aucun héritier saisi.');
    if (h.enfants.some((e) => (e.statut === 'predecede' || e.statut === 'renonce') && !(d.petitsEnfants || []).some((x) => x.parent === e.id && x.nom))) {
      controles.push('Un enfant prédécédé ou renonçant sans descendant n\'est pas compté (sa part revient aux autres souches).');
    }
    return {
      liquidation: liq, heritiers: h, scenarios: res, meilleure,
      usufruit: regime.marie || regime.id === 'pacs' ? usufruitParAge(p.bareme669, n(d.conjoint && d.conjoint.age)) : 0,
      alertes: liq.alertes.concat(controles),
    };
  }

  return { calculer, liquider, heritiers, repartir, fiscalite, recompense, droitsBareme, usufruitParAge, qdOrdinaire, nature, REGIMES, LIENS, OPTIONS };
});
