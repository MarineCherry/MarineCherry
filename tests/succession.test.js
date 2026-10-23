/*
 * Succession & donation : patrimoine par branche, donations envisagées, hypothèse D
 * (montage optimisé : part donnée aux enfants, petits-enfants à égalité entre branches, part gardée pour la succession).
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

// Coût du montage D d'un grand-parent, recalculé à la main pour une répartition (t, y) donnée.
function coutBranche(r, g, t, y) {
  const par = r.parents.find((x) => x.code === g);
  const np = par.nuePropriete;
  return r.enfants.reduce((tot, k) => {
    const pe = r.petitsEnfants.filter((x) => x.branche === k.id);
    const pp = (r.patrimoine[g].brut - r.patrimoine[g].resteBrut) * k.part;
    const yy = pe.length ? y : 0;
    const donEnf = S.liquider(P.bareme777, P.abattEnfant, t * pp * np, 0, 0, 0);
    const donPE = pe.reduce((a) => a + S.liquider(P.bareme777, P.abattPetitEnfant, yy / pe.length, 0, 0, 0).droits, 0);
    const succ = S.liquider(P.bareme777, P.abattEnfant, k.part * r.patrimoine[g].resteBrut + (1 - t) * pp - yy / np, 0, 0, 0);
    return tot + donEnf.droits + donPE + succ.droits;
  }, 0);
}

test('Hypothèse D : montage optimisé (part donnée, petits-enfants, part gardée pour la succession)', () => {
  const r = S.calculer(dossier(), P);
  const D = r.hypotheses.D.parents[0];
  const C = r.hypotheses.C.parents[0];
  const m = r.montage.P1;
  // Équité : même montant par branche, partagé entre les petits-enfants de la branche.
  const pe = Object.fromEntries(D.petitsEnfants.map((x) => [x.nom, x]));
  near(pe['Léa'].transmis, m.y / 2, 'branche d\'Alice : y / 2');
  near(pe['Zoé'].transmis, m.y / 3, 'branche de Bruno : y / 3');
  assert.strictEqual(m.y % 100, 0);
  // Ce qui n'est pas donné reste dans la succession de l'enfant de la branche.
  const b = m.branches[0];
  near(D.enfants[0].succession.transmis, 150000 + (300000 - b.donnePP) - b.pePP, 'succession d\'Alice');
  near(D.enfants[0].donation.transmis, b.donnePP * 0.6, 'donation à Alice en nue-propriété');
  // Le montage est au moins aussi bon que C et que toute autre répartition testée.
  assert.ok(D.total.totalDroits <= C.total.totalDroits + 0.01);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) for (const y of [0, 20000, 40000]) {
    assert.ok(D.total.totalDroits <= coutBranche(r, 'P1', t, y) + 50, `t=${t}, y=${y}`);
  }
});

test('Hypothèse D : gros patrimoine donné en totalité, les petits-enfants reçoivent une part', () => {
  // Tout est donné en C : chaque enfant est taxé à 20 %. Le montage donne aux petits-enfants
  // et garde une partie pour la succession (nouvel abattement après 15 ans).
  const d = dossier({
    biens: [{ id: 'm', designation: 'Maison', nature: 'Immobilier', valeur: 2000000, proprietaire: 'commun', regime: 'Aucun' }],
    donations: [{ id: 'd1', donateur: 'deux', bienId: 'm', montant: null, beneficiaire: 'tous' }],
  });
  const r = S.calculer(d, P);
  assert.ok(r.montage.P1.y > 0, 'don aux petits-enfants');
  assert.ok(r.montage.P1.branches[0].successionPP > 0, 'une part est gardée pour la succession');
  assert.ok(r.hypotheses.D.cumul.total.totalDroits < r.hypotheses.C.cumul.total.totalDroits - 10000);
  // Décès dans les 15 ans : la donation est rappelée, garder pour la succession n'apporte rien de plus.
  const r2 = S.calculer(Object.assign({}, d, { deces15ans: true }), P);
  assert.ok(r2.hypotheses.D.cumul.total.totalDroits <= r2.hypotheses.C.cumul.total.totalDroits);
  assert.ok(r2.montage.P1.y > 0);
});

test('Contrôle : donation supérieure à la part du donateur', () => {
  const r = S.calculer(dossier({ donations: [{ id: 'x', donateur: 'P2', bienId: 'c', montant: 50000, beneficiaire: 'a' }] }), P);
  assert.strictEqual(r.controles.find((c) => c.libelle === 'Montants donnés').ok, false);
  near(r.hypotheses.B.parents[1].enfants[0].donation.transmis, 0, 'le parent 2 ne possède pas le compte titres');
});

test('Hypothèse D désactivée : seules A, B et C sont comparées', () => {
  const r = S.calculer(dossier({ hypotheseD: false }), P);
  assert.deepStrictEqual(r.comparatif.map((x) => x.code), ['A', 'B', 'C']);
  assert.strictEqual(r.hypotheses.D, undefined);
  assert.ok(!r.controles.some((x) => /Petits-enfants/.test(x.libelle)));
  assert.deepStrictEqual(S.calculer(dossier(), P).comparatif.map((x) => x.code), ['A', 'B', 'C', 'D']);
});
