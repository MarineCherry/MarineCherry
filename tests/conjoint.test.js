/*
 * Droits du conjoint survivant : liquidation, options, représentation, fiscalité (cas chiffrés à la main).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const defaults = require('../assets/js/core/defaults.js');
const C = require('../assets/js/apps/conjoint/engine.js');

const P = Object.assign({}, defaults.conjoint, {
  bareme669: defaults.commun.bareme669, bareme777: defaults.succession.bareme777, abattEnfant: defaults.succession.abattEnfant,
});
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.01, `${label} : obtenu ${a}, attendu ${b}`);
const scen = (r, code) => r.scenarios.find((s) => s.code === code);
const ligne = (s, nom) => s.fisc.lignes.find((x) => x.nom === nom);

// Couple marié sous la communauté légale, conjoint de 72 ans (usufruit 30 %), deux enfants communs.
function dossier(o) {
  return Object.assign({
    regime: 'communaute', dateDeces: '2026-06-01', conjoint: { nom: 'Claire', age: 72 },
    enfants: [{ id: 'e1', nom: 'Alice', commun: true }, { id: 'e2', nom: 'Bruno', commun: true }],
    biens: [
      { id: 'b1', designation: 'Maison', valeur: 400000, propriete: 'commun' },
      { id: 'b2', designation: 'Compte', valeur: 100000, propriete: 'defunt' },
    ],
    passif: [], donations: [], legs: [], liberaliteConjoint: { type: 'ddv' },
  }, o || {});
}

test('Liquidation de la communauté : moitié des biens communs + propres', () => {
  const r = C.calculer(dossier(), P);
  near(r.liquidation.partCommunaute, 200000, 'part de communauté');
  near(r.liquidation.actifNet, 300000, 'actif net');
});

test('Options du conjoint et droits des enfants', () => {
  const r = C.calculer(dossier(), P);
  assert.deepStrictEqual(r.scenarios.map((s) => s.code), ['legal-pp', 'legal-us', 'ddv-qd', 'ddv-mixte', 'ddv-us']);
  // ¼ PP : 75 000 au conjoint, 112 500 par enfant (12 500 taxables).
  const a = scen(r, 'legal-pp');
  near(a.conjoint.pp, 75000, 'conjoint ¼ PP');
  near(ligne(a, 'Alice').valeur, 112500, 'part d\'Alice');
  near(ligne(a, 'Alice').droits, 865.95, 'droits d\'Alice');
  // Usufruit total : nue-propriété 150 000 × 70 % = 105 000 par enfant.
  const u = scen(r, 'legal-us');
  near(u.conjoint.usValeur, 90000, 'usufruit évalué');
  near(ligne(u, 'Bruno').valeur, 105000, 'nue-propriété de Bruno');
  near(ligne(u, 'Bruno').droits, 250, 'droits de Bruno');
  // QD ordinaire (1/3) : 100 000 au conjoint, 100 000 par enfant, pas de droits.
  const q = scen(r, 'ddv-qd');
  near(q.conjoint.pp, 100000, 'quotité disponible');
  near(q.totalDroits, 0, 'droits');
  // ¼ PP + ¾ US : 75 000 + usufruit sur 225 000.
  const m = scen(r, 'ddv-mixte');
  near(m.conjoint.pp, 75000, 'pleine propriété');
  near(m.conjoint.usBase, 225000, 'assiette de l\'usufruit');
  near(ligne(m, 'Alice').valeur, 78750, 'nue-propriété d\'Alice');
});

test('Enfant non commun : seulement ¼ en pleine propriété au titre des droits légaux', () => {
  const r = C.calculer(dossier({ enfants: [{ id: 'e1', nom: 'Alice', commun: true }, { id: 'e2', nom: 'Bruno', commun: false }] }), P);
  assert.ok(!r.scenarios.some((s) => s.code === 'legal-us'));
});

test('Cantonnement à la moitié de l\'usufruit', () => {
  const r = C.calculer(dossier({ liberaliteConjoint: { type: 'ddv', cantonnement: { mode: 'fraction', fraction: 0.5 } } }), P);
  const u = scen(r, 'ddv-us');
  near(u.conjoint.usBase, 150000, 'usufruit cantonné');
  near(ligne(u, 'Alice').valeur, 75000 * 0.7 + 75000, 'Alice : NP sur 75 000 + PP sur 75 000');
});

test('Droit viager au logement imputé sur le quart en pleine propriété', () => {
  const r = C.calculer(dossier({ logementViager: { actif: true, bienId: 'b1' } }), P);
  const a = scen(r, 'legal-pp');
  near(a.conjoint.viager, 0.6 * 0.3 * 200000, 'valeur du droit d\'habitation');
  near(a.conjoint.valeur, 75000, 'droits du conjoint inchangés');
  near(ligne(a, 'Alice').valeur, 112500, 'part d\'Alice');
});

test('Représentation : petits-enfants d\'un enfant prédécédé, abattement partagé', () => {
  const r = C.calculer(dossier({
    regime: 'aucun', biens: [{ id: 'b', valeur: 300000, propriete: 'defunt' }],
    enfants: [{ id: 'e1', nom: 'Alice' }, { id: 'e2', nom: 'Bruno', statut: 'predecede' }],
    petitsEnfants: [{ id: 'p1', nom: 'Léa', parent: 'e2' }, { id: 'p2', nom: 'Tom', parent: 'e2' }],
  }), P);
  const s = r.scenarios[0];
  near(ligne(s, 'Léa').valeur, 75000, 'part de Léa');
  near(ligne(s, 'Léa').abattementTotal, 50000, 'abattement partagé');
  near(ligne(s, 'Léa').droits, 3194.35, 'droits de Léa');
});

test('Sans descendants : père et mère, frères et sœurs, neveux par représentation', () => {
  const r = C.calculer(dossier({ enfants: [], pere: { vivant: true }, mere: { vivant: true }, liberaliteConjoint: { type: 'aucune' } }), P);
  const l = scen(r, 'legal');
  near(l.conjoint.pp, 150000, 'conjoint ½');
  near(ligne(l, 'Père').valeur, 75000, 'père ¼');
  const f = C.calculer(dossier({
    regime: 'aucun', enfants: [], biens: [{ id: 'b', valeur: 200000, propriete: 'defunt' }],
    fratrie: [{ id: 'f1', nom: 'Paul' }, { id: 'f2', nom: 'Sophie', statut: 'predecede' }],
    neveux: [{ id: 'n1', nom: 'Jules', parent: 'f2' }, { id: 'n2', nom: 'Inès', parent: 'f2' }],
  }), P).scenarios[0];
  near(ligne(f, 'Paul').droits, 35387.6, 'droits du frère');
  near(ligne(f, 'Jules').droits, 16472.3, 'droits du neveu (barème des frères et sœurs)');
});

test('Biens de famille (art. 757-3) : moitié aux frères et sœurs', () => {
  const r = C.calculer(dossier({
    enfants: [], liberaliteConjoint: { type: 'aucune' }, fratrie: [{ id: 'f1', nom: 'Paul' }],
    biens: [{ id: 'b', valeur: 100000, propriete: 'defunt', familial: true }, { id: 'c', valeur: 50000, propriete: 'defunt' }],
  }), P);
  const l = scen(r, 'legal');
  near(ligne(l, 'Paul').valeur, 50000, 'moitié des biens de famille');
  near(l.conjoint.pp, 100000, 'reste au conjoint');
});

test('Récompenses (art. 1469) et participation aux acquêts', () => {
  near(C.recompense({ type: 'acquisition', depense: 50000, coutTotal: 200000, valeurActuelle: 300000 }).montant, 75000, 'profit subsistant');
  near(C.recompense({ type: 'necessaire', depense: 10000, coutTotal: 100000, valeurActuelle: 80000 }).montant, 10000, 'dépense nécessaire');
  near(C.recompense({ type: 'autre', depense: 10000, coutTotal: 100000, valeurActuelle: 80000 }).montant, 8000, 'la plus faible');
  const r = C.calculer(dossier({
    recompenses: [{ id: 'r', epoux: 'defunt', sens: 'du', mode: 'saisie', montant: 40000 }],
  }), P);
  // Masse commune 400 000 − 40 000 = 360 000 ; part du défunt 180 000 + reprise 40 000.
  near(r.liquidation.partCommunaute, 220000, 'récompense due au défunt');
  const pa = C.calculer(dossier({ regime: 'participation', biens: [{ id: 'b', valeur: 300000, propriete: 'defunt' }],
    participation: { originaireDefunt: 100000, finalDefunt: 300000, originaireConjoint: 50000, finalConjoint: 150000 } }), P);
  near(pa.liquidation.actifNet, 250000, 'créance de participation du conjoint déduite');
});

test('Attribution intégrale de la communauté et actif net saisi', () => {
  const r = C.calculer(dossier({ avantages: { attributionIntegrale: true } }), P);
  near(r.liquidation.actifNet, 100000, 'seuls les propres');
  const m = C.calculer(dossier({ biens: [], actifNetManuel: 500000 }), P);
  near(m.liquidation.actifNet, 500000, 'actif saisi');
});

test('Assurance-vie : 990 I et 757 B', () => {
  const r = C.calculer(dossier({ assurancesVie: [{ id: 'a', beneficiaire: 'e1', capitalAvant70: 200000, primesApres70: 50500 }] }), P);
  const a = ligne(scen(r, 'legal-pp'), 'Alice');
  near(a.droits990, 9500, '20 % sur 47 500');
  near(a.ajout757B, 20000, 'primes après 70 ans au-delà de 30 500');
});

test('Legs à un tiers au-delà de la quotité disponible : réduit à la quotité disponible', () => {
  const r = C.calculer(dossier({ legs: [{ id: 'l', nom: 'Ami', lien: 'tiers', mode: 'montant', montant: 150000 }] }), P);
  const a = scen(r, 'legal-pp');
  assert.ok(a.alertes.some((x) => /Legs réduits/.test(x)));
  near(ligne(a, 'Ami').valeur, 100000, 'legs réduit au tiers de 300 000');
  near(ligne(a, 'Ami').droits, (100000 - 1594) * 0.6, 'droits du légataire');
  near(a.conjoint.pp, 0, 'plus rien de disponible pour le quart légal');
  near(ligne(a, 'Alice').valeur, 100000, 'réserve d\'Alice');
});

test('Donation hors part excédant la quotité disponible : imputée sur la réserve du gratifié', () => {
  const r = C.calculer(dossier({
    regime: 'aucun', biens: [{ id: 'b', valeur: 100000, propriete: 'defunt' }],
    donations: [{ id: 'd', beneficiaire: 'e1', date: '2015-01-01', valeur: 200000, horsPart: true }],
  }), P);
  const s = r.scenarios[0];
  // Masse 300 000, QD 100 000 : excédent 100 000 imputé sur la part d'Alice.
  assert.ok(s.alertes.some((x) => /réduction de 100\s000 €/.test(x)));
  near(ligne(s, 'Alice').valeur, 0, 'Alice ne reçoit plus rien');
  near(ligne(s, 'Bruno').valeur, 100000, 'Bruno reçoit sa réserve');
});

test('Donation à un non-réservataire excédant la quotité disponible : indemnité de réduction', () => {
  const r = C.calculer(dossier({
    regime: 'aucun', biens: [{ id: 'b', valeur: 100000, propriete: 'defunt' }], fratrie: [{ id: 'f1', nom: 'Paul' }],
    donations: [{ id: 'd', beneficiaire: 'f1', date: '2015-01-01', valeur: 200000, horsPart: true }],
  }), P);
  const s = r.scenarios[0];
  near(s.rep.calc.indemnitesTiers, 100000, 'indemnité due par Paul');
  near(ligne(s, 'Alice').valeur, 100000, 'Alice : moitié des biens et de l\'indemnité');
  near(ligne(s, 'Bruno').valeur, 100000, 'Bruno');
});

test('Rapport : donation supérieure à la part, indemnité due aux cohéritiers', () => {
  const r = C.calculer(dossier({
    regime: 'aucun', biens: [{ id: 'b', valeur: 100000, propriete: 'defunt' }],
    donations: [{ id: 'd', beneficiaire: 'e1', date: '2015-01-01', valeur: 300000 }],
  }), P);
  const s = r.scenarios[0];
  // (100 000 + 300 000) / 2 = 200 000 : Alice doit 100 000 à Bruno, qui reçoit 200 000.
  near(s.rep.calc.souches[0].indemnite, 100000, 'indemnité due par Alice');
  near(ligne(s, 'Bruno').valeur, 200000, 'Bruno');
});

test('Rapport d\'une donation en présence de l\'usufruit du conjoint', () => {
  const r = C.calculer(dossier({ donations: [{ id: 'd', beneficiaire: 'e1', date: '2018-01-01', valeur: 60000 }] }), P);
  const u = scen(r, 'legal-us');
  assert.ok(!u.alertes.some((x) => /dépasse sa part/.test(x)));
  // (300 000 + 60 000) / 2 = 180 000 ; Alice reçoit 120 000 en nue-propriété, Bruno 180 000.
  near(ligne(u, 'Alice').np, 120000, 'nue-propriété d\'Alice');
  near(ligne(u, 'Bruno').np, 180000, 'nue-propriété de Bruno');
});

// Cas réel anonymisé : donations en avancement de part (2005), hors part et donation-partage (2021).
function dossierPartage() {
  return dossier({
    dateDeces: '2026-05-19', conjoint: { nom: 'Claire', age: 85 },
    biens: [{ id: 'b', designation: 'Actif', valeur: 152597.14, propriete: 'defunt' }],
    donations: [
      { id: 'd1', beneficiaire: 'e1', date: '2005-01-17', valeur: 54900, nature: 'avancement' },
      { id: 'd2', beneficiaire: 'e2', date: '2005-01-17', valeur: 54900, nature: 'avancement' },
      { id: 'd3', beneficiaire: 'e1', date: '2021-11-19', valeur: 65000, nature: 'horsPart' },
      { id: 'd4', beneficiaire: 'e1', date: '2021-12-23', valeur: 26000, nature: 'partage' },
      { id: 'd5', beneficiaire: 'e2', date: '2021-12-23', valeur: 26000, nature: 'partage' },
    ],
  });
}

test('Donation-partage : réunie à la masse, imputée sur la réserve, non rapportée', () => {
  const r = C.calculer(dossierPartage(), P);
  const q = scen(r, 'legal-pp');
  const c = q.rep.calc;
  near(c.M, 379397.14, 'masse de calcul');
  near(c.reserveGlobale, 252931.43, 'réserve');
  near(c.masse758, 262397.14, 'masse de l\'art. 758-5 (sans la donation-partage)');
  // Quart légal 65 599,29 plafonné à la QD restante (126 465,71 − 65 000 hors part).
  near(q.conjoint.pp, 61465.71, 'quart légal plafonné');
  near(ligne(q, 'Alice').valeur, 45565.71, 'Alice');
  near(ligne(q, 'Bruno').valeur, 45565.71, 'Bruno');
  // Réserve de Bruno : 45 565,71 + 54 900 + 26 000 = 126 465,71 (⅓ de la masse).
  assert.ok(Math.abs(ligne(q, 'Alice').droits - 5507) <= 1, 'droits d\'Alice : ' + ligne(q, 'Alice').droits);
  near(ligne(q, 'Bruno').droits, 0, 'droits de Bruno');

  const u = scen(r, 'legal-us');
  near(u.conjoint.valeur, 30519.43, 'usufruit (20 %)');
  near(ligne(u, 'Alice').valeur, 61038.86, 'nue-propriété d\'Alice');
  assert.ok(Math.abs(ligne(u, 'Alice').droits - 8602) <= 1, 'droits d\'Alice : ' + ligne(u, 'Alice').droits);
});

test('Anciens dossiers : l\'indicateur « horsPart » vaut nature hors part', () => {
  assert.strictEqual(C.nature({ horsPart: true }), 'horsPart');
  assert.strictEqual(C.nature({}), 'avancement');
  assert.strictEqual(C.nature({ nature: 'partage', horsPart: true }), 'partage');
});
