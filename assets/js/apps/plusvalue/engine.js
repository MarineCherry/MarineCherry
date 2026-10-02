/*
 * Moteur de calcul — Plus-value immobilière des particuliers.
 * Reprend à l'identique les formules du classeur « simulateur_plus_value » (feuilles Origines et Récapitulatif).
 * Fonctions pures : aucune dépendance au navigateur, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.plusValue = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DROITS = ['Pleine propriété', 'Usufruit', 'Nue-propriété'];
  const NATURES = ['Onéreux', 'Gratuit', 'Construction'];

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const n = (v) => (isNum(v) ? v : 0);

  // ROUND d'Excel : arrondi au plus proche, demi s'éloignant de zéro.
  function round(x, digits) {
    const f = Math.pow(10, digits || 0);
    const v = Math.abs(x) * f;
    return (Math.sign(x) * Math.round(v + 1e-9 * Math.max(1, v))) / f;
  }

  // Dates au format AAAA-MM-JJ, manipulées en UTC pour éviter les décalages de fuseau.
  function parseDate(s) {
    if (!s || typeof s !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  const toTime = (p) => Date.UTC(p.y, p.m - 1, p.d);

  // DATEDIF(debut, fin, "y") : années révolues.
  function fullYears(from, to) {
    let y = to.y - from.y;
    if (to.m < from.m || (to.m === from.m && to.d < from.d)) y -= 1;
    return y;
  }

  // EDATE : ajoute des mois, le jour est ramené au dernier jour du mois si besoin.
  function addMonths(p, months) {
    const total = p.y * 12 + (p.m - 1) + months;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { y: y, m: m, d: Math.min(p.d, last) };
  }

  // Barème de l'art. 669 CGI : [{age, usufruit}] trié par âge croissant.
  function usufruitParAge(bareme, age) {
    if (!isNum(age)) return null;
    let v = null;
    for (const row of bareme) if (age >= row.age) v = row.usufruit;
    return v;
  }

  // Abattement pour durée de détention — impôt sur le revenu (art. 150 VC CGI).
  function abattementIR(annees) {
    if (annees <= 5) return 0;
    if (annees >= 22) return 1;
    return 0.06 * (annees - 5);
  }

  // Abattement pour durée de détention — prélèvements sociaux.
  function abattementPS(annees) {
    if (annees <= 5) return 0;
    if (annees <= 21) return 0.0165 * (annees - 5);
    if (annees === 22) return 0.28;
    if (annees >= 30) return 1;
    return 0.28 + 0.09 * (annees - 22);
  }

  // Surtaxe sur les plus-values élevées (art. 1609 nonies G CGI), avant arrondi.
  function surtaxe(pv) {
    if (pv <= 50000) return 0;
    if (pv <= 60000) return 0.02 * pv - (60000 - pv) / 20;
    if (pv <= 100000) return 0.02 * pv;
    if (pv <= 110000) return 0.03 * pv - (110000 - pv) / 10;
    if (pv <= 150000) return 0.03 * pv;
    if (pv <= 160000) return 0.04 * pv - (160000 - pv) * 0.15;
    if (pv <= 200000) return 0.04 * pv;
    if (pv <= 210000) return 0.05 * pv - (210000 - pv) * 0.2;
    if (pv <= 250000) return 0.05 * pv;
    if (pv <= 260000) return 0.06 * pv - (260000 - pv) * 0.25;
    return 0.06 * pv;
  }

  const pct = (x) => round(x * 100, 2).toString().replace('.', ',');

  /*
   * Calcul d'une origine de propriété (une ligne de la feuille Origines).
   */
  function calculOrigine(o, dossier, params) {
    const cession = parseDate(dossier.dateCession);
    const droitRecu = o.droitRecu || 'Pleine propriété';
    const droitCede = o.droitCede || droitRecu;
    const cleVente = n(dossier.cleUsufruitVente);
    const cleAcq = n(dossier.cleUsufruitAcquisition);
    const quotePart = n(o.quotePart);
    const partPrix = n(o.partPrix);

    const prixEuros = o.devise === 'FRF' ? n(o.prix) / params.pariteFranc : n(o.prix);
    const coefVente = droitCede === 'Usufruit' ? cleVente : droitCede === 'Nue-propriété' ? 1 - cleVente : 1;
    const coefAcq = droitRecu === 'Usufruit' ? cleAcq : droitRecu === 'Nue-propriété' ? 1 - cleAcq : 1;

    const prixCessionBrut = n(dossier.prixVente) * quotePart * partPrix * coefVente;
    const fraisCession = n(dossier.fraisVendeurs) * quotePart * partPrix * coefVente;
    const prixCessionNet = prixCessionBrut - fraisCession;
    const prixAcquisition = prixEuros * quotePart * coefAcq;
    const fraisAcquisition = isNum(o.fraisReels)
      ? o.fraisReels
      : o.nature === 'Onéreux' ? params.forfaitFrais * prixAcquisition : 0;

    const acquisition = parseDate(o.dateAcquisition);
    const annees = cession && acquisition ? fullYears(acquisition, cession) : 0;

    let travaux = 0;
    if (isNum(o.travauxReels)) travaux = o.travauxReels;
    else if (dossier.bati && cession) {
      const depart = parseDate(o.dateAchevement) || acquisition;
      if (depart && toTime(addMonths(depart, 60)) < toTime(cession)) travaux = params.forfaitTravaux * prixAcquisition;
    }

    const prixMajore = prixAcquisition + fraisAcquisition + travaux;
    const pvBrute = prixCessionNet - prixMajore;
    const abatIR = abattementIR(annees);
    const abatPS = abattementPS(annees);
    const pvIR = Math.max(0, pvBrute) * (1 - abatIR);
    const pvPS = Math.max(0, pvBrute) * (1 - abatPS);

    let regle = o.nature === 'Onéreux'
      ? 'Achat : prix + ' + (isNum(o.fraisReels) ? 'frais réels' : 'forfait ' + pct(params.forfaitFrais) + ' %')
      : o.nature === 'Construction'
        ? 'Construction : coût réel de construction (pas de forfait de ' + pct(params.forfaitFrais) + ' %)'
        : 'Gratuit : valeur retenue + frais réels';
    if (travaux > 0) regle += ' + travaux (' + (isNum(o.travauxReels) ? 'réels' : 'forfait ' + pct(params.forfaitTravaux) + ' %') + ')';
    regle += ' ; ' + annees + ' ans de détention : abattement IR ' + pct(abatIR) + ' %, PS ' + pct(abatPS) + ' %';
    if (droitCede !== droitRecu) regle += ' ; droit reçu : ' + droitRecu + ', droit cédé : ' + droitCede;

    let controle = 'OK';
    let alerte = false;
    if (!acquisition) { controle = "À contrôler : date d'acquisition manquante"; alerte = true; }
    else if (o.nature === 'Onéreux' && droitRecu !== 'Pleine propriété') { controle = "À contrôler : achat onéreux d'un droit démembré non géré"; alerte = true; }
    else if (o.nature === 'Construction' && droitRecu !== 'Pleine propriété') { controle = 'À contrôler : construction sur droit démembré non gérée'; alerte = true; }
    else if (o.nature === 'Construction' && !parseDate(o.dateAchevement)) { controle = "À contrôler : date d'achèvement manquante"; alerte = true; }
    else if (pvBrute < 0) controle = 'Moins-value : non imputable, à vérifier';

    return {
      prixEuros, coefVente, coefAcq, prixCessionBrut, fraisCession, prixCessionNet,
      prixAcquisition, fraisAcquisition, annees, travaux, prixMajore, pvBrute,
      abatIR, abatPS, pvIR, pvPS, regle, controle, alerte, moinsValue: pvBrute < 0,
    };
  }

  /*
   * Calcul complet du dossier : une ligne par origine, puis récapitulatif par vendeur.
   */
  function calculer(dossier, params) {
    const vendeurs = (dossier.vendeurs || []).filter((v) => v.nom && v.nom.trim());
    const origines = (dossier.origines || []).map((o) => ({
      origine: o,
      resultat: o.vendeur ? calculOrigine(o, dossier, params) : null,
    }));

    const champs = ['prixCessionBrut', 'fraisCession', 'prixCessionNet', 'prixAcquisition', 'fraisAcquisition', 'travaux', 'prixMajore', 'pvBrute', 'pvIR', 'pvPS'];
    const parVendeur = vendeurs.map((v) => {
      const s = {};
      champs.forEach((c) => (s[c] = 0));
      origines.forEach(({ origine, resultat }) => {
        if (resultat && origine.vendeur === v.nom) champs.forEach((c) => (s[c] += resultat[c]));
      });
      const pvImposableIR = round(s.pvIR, 0);
      const pvImposablePS = round(s.pvPS, 0);
      const ir = v.exonere ? 0 : round(pvImposableIR * params.tauxIR, 0);
      const st = v.exonere ? 0 : round(surtaxe(pvImposableIR), 0);
      const ps = v.exonere ? 0 : round(pvImposablePS * params.tauxPS, 0);
      return Object.assign({ nom: v.nom, exonere: !!v.exonere, motif: v.motif || '' }, s, {
        pvImposableIR, pvImposablePS, impotRevenu: ir, surtaxe: st, prelevementsSociaux: ps, total: ir + st + ps,
      });
    });

    const total = { prixCessionBrut: 0, total: 0, impotRevenu: 0, surtaxe: 0, prelevementsSociaux: 0 };
    parVendeur.forEach((v) => Object.keys(total).forEach((k) => (total[k] += v[k])));

    const prix = n(dossier.prixVente);
    let controleRepartition = null;
    if (prix !== 0) {
      controleRepartition = Math.abs(total.prixCessionBrut - prix) < 0.01
        ? { ok: true, texte: 'Les droits saisis couvrent 100 % du prix de vente.' }
        : { ok: false, texte: 'Les droits saisis couvrent ' + pct(total.prixCessionBrut / prix) + ' % du prix de vente.' };
    }
    const lignes = origines.filter((x) => x.resultat);
    const controleLignes = !lignes.length
      ? { ok: false, texte: 'Aucune origine calculée (vendeur à choisir).' }
      : lignes.some((x) => x.resultat.alerte)
      ? { ok: false, texte: 'Des origines sont à contrôler.' }
      : lignes.some((x) => x.resultat.moinsValue)
        ? { ok: false, texte: 'Moins-value sur au moins une origine.' }
        : { ok: true, texte: 'Toutes les origines sont cohérentes.' };

    // Ventilation facultative terrain / construction.
    const vt = n(dossier.valeurTerrain), vc = n(dossier.valeurConstruction);
    const ventilation = vt + vc === 0 ? null : { construction: vc / (vt + vc), terrain: 1 - vc / (vt + vc) };

    return {
      origines, parVendeur, total, controleRepartition, controleLignes, ventilation,
      cleSuggeree: usufruitParAge(params.bareme669, dossier.ageUsufruitier),
    };
  }

  return { calculer, calculOrigine, abattementIR, abattementPS, surtaxe, usufruitParAge, round, fullYears, addMonths, DROITS, NATURES };
});
