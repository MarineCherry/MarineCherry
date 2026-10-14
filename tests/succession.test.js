/*
 * Succession & donation : patrimoine par branche, donations envisagées, hypothèse D
 * (nue-propriété aux petits-enfants en plus des enfants, équité entre branches) et recherche du montant optimal.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const defaults = require('../assets/js/core/defaults.js');
const S = require('../assets/js/apps/succession/engine.js');

const P = Object.assign({}, defaults.succession, { bareme669: defaults.commun.bareme669 });
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.01, `${label} : obtenu ${a}, attendu ${b}`);
const droits = (base) => S.droitsBareme(P.bareme777, base);

// Couple de 70 ans (usufruit 40 %, nue-propriété 60 %), deux enfants, cinq petits-enfants :
// deux dans la branche d'Alice, trois dans celle de Bruno.
function dossier(o) {
  return Object.assign({
    dateSimulation: '2026-10-13', nbParents: 2,
    parents: [{ nom: 'Jean', age: 70 }, { nom: 'Marie', age: 70 }],
    enfants: [{ id: 'a', nom: 'Alice', majeur: true, part: null }, { id: 'b', nom: 'Bruno', majeur: true, part: null }],
    petitsEnfants: [
      { id: 'a1', nom: 'Léa', majeur: true, parent: 'a' }, { id: 'a2', nom: 'Hugo', majeur: true, parent: 'a' },
      { id: 'b1', nom: 'Zoé', majeur: true, parent: 'b' }, { id: 'b2', nom: 'Tom', majeur: true, parent: 'b' }, { id: 'b3', nom: 'Max', majeur: false, parent: 'b' },
    ],
    donFamilial: false, deces15ans: false,
    biens: [
      { id: 'm', designation: 'Maison', nature: 'Immobilier', valeur: 1200000, proprietaire: 'commun', regime: 'Aucun' },
      { id: 'c', designation: 'Compte titres', nature: 'Titres / parts sociales', valeur: 300000, proprietaire: 'P1', regime: 'Aucun' },
      { id: 'l', designation: 'Livret', nature: 'Liquidités', valeur: 100000, proprietaire: 'P2', regime: 'Aucun' },
    ],
    donations: [{ id: 'd1', donateur: 'deux', bienId: 'm', montant: null, beneficiaire: 'tous' }],
    donsPE: { P1: 30000, P2: 0 },
    anterieures: [],
  }, o || {});
}

test('Patrimoine par branche : biens propres et biens communs', () => {
  const r = S.calculer(dossier(), P);
  near(r.patrimoine.P1.brut, 600000 + 300000, 'patrimoine du parent 1');
  near(r.patrimoine.P2.brut, 600000 + 100000, 'patrimoine du parent 2');
  near(r.patrimoine.P1.resteBrut, 300000, 'reste après donation, parent 1');
  near(r.patrimoineTotal, 1600000, 'patrimoine total');
});

test('Hypothèses B et C : pleine propriété puis nue-propriété (60 %)', () => {
  const r = S.calculer(dossier(), P);
  const b = r.hypotheses.B.parents[0].enfants[0];
  const c = r.hypotheses.C.parents[0].enfants[0];
  near(b.donation.transmis, 300000, 'B : Alice reçoit de Jean la moitié de sa part de maison');
  near(b.donation.droits, droits(200000), 'B : droits de donation');
  near(c.donation.transmis, 180000, 'C : nue-propriété = 60 % de 300 000');
  near(c.donation.droits, droits(80000), 'C : droits de donation');
  near(c.succession.transmis, 150000, 'C : succession résiduelle (moitié du compte titres)');
});

test('Hypothèse D : montant en nue-propriété par branche, en plus de la donation aux enfants', () => {
  const r = S.calculer(dossier(), P);
  const D = r.hypotheses.D.parents[0];
  const C = r.hypotheses.C.parents[0];
  // La donation aux enfants est la même qu'en C.
  near(D.enfants[0].donation.transmis, 180000, 'Alice : 60 % de 300 000, comme en C');
  near(D.enfants[0].donation.droits, C.enfants[0].donation.droits, 'Alice : mêmes droits de donation qu\'en C');
  const pe = Object.fromEntries(D.petitsEnfants.map((x) => [x.nom, x]));
  near(pe['Léa'].transmis, 15000, 'branche d\'Alice : 30 000 / 2');
  near(pe['Zoé'].transmis, 10000, 'branche de Bruno : 30 000 / 3');
  near(pe['Zoé'].droits, 0, 'sous l\'abattement de 31 865 €');
  // 2 branches × 30 000 en nue-propriété = 100 000 en pleine propriété pris sur le compte titres conservé.
  near(D.enfants[0].succession.transmis, (300000 - 100000) / 2, 'succession résiduelle réduite');
  near(D.enfants[0].succession.droits, 0, '100 000 : couvert par l\'abattement');
  near(C.enfants[0].succession.droits, droits(50000), 'en C : 150 000 − 100 000 taxables');
  // Capacité : 300 000 × 60 % / 2 branches.
  near(r.capacitePE.P1, 90000, 'montant maximal par branche');
  // Le parent 2 n'a rien attribué aux petits-enfants : D = C pour lui.
  near(r.hypotheses.D.parents[1].total.totalDroits, r.hypotheses.C.parents[1].total.totalDroits, 'parent 2');
  assert.ok(r.hypotheses.D.cumul.total.totalDroits < r.hypotheses.C.cumul.total.totalDroits);
});

test('Hypothèse D : montant plafonné au patrimoine conservé', () => {
  const r = S.calculer(dossier({ donsPE: { P1: 200000, P2: 0 } }), P);
  near(r.donsPE.P1, 90000, 'plafond');
  near(r.hypotheses.D.parents[0].enfants[0].succession.transmis, 0, 'plus rien à transmettre par succession');
  assert.strictEqual(r.controles.find((c) => c.libelle === 'Montants donnés').ok, false);
});

test('Montant optimal pour les petits-enfants : minimum du total des droits', () => {
  const d = dossier();
  const opt = S.optimiserPetitsEnfants(d, P);
  const cout = (y) => S.calculer(Object.assign({}, d, { donsPE: { P1: y, P2: 0 } }), P).hypotheses.D.parents[0].total.totalDroits;
  let min = Infinity;
  for (let y = 0; y <= 90000; y += 100) min = Math.min(min, cout(y));
  near(opt.P1.droits, min, 'droits au montant optimal');
  assert.ok(opt.P1.montant > 0 && opt.P1.montant <= 90000);
  near(opt.P1.gain, opt.P1.droitsC - opt.P1.droits, 'économie par rapport à C');
  assert.strictEqual(opt.P1.montant % 100, 0);
});

test('Contrôle : donation supérieure à la part du donateur', () => {
  const r = S.calculer(dossier({ donations: [{ id: 'x', donateur: 'P2', bienId: 'c', montant: 50000, beneficiaire: 'a' }] }), P);
  assert.strictEqual(r.controles.find((c) => c.libelle === 'Montants donnés').ok, false);
  near(r.hypotheses.B.parents[1].enfants[0].donation.transmis, 0, 'le parent 2 ne possède pas le compte titres');
});
