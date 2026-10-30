/*
 * Supports visuels : communauté légale ou séparation de biens (exemple fictif).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../assets/js/apps/supports/engine.js');

const D = {
  a: { prenom: 'Camille', avant: 60000, heritage: 0 },
  b: { prenom: 'Alex', avant: 15000, heritage: 80000 },
  acquis: [{ libelle: 'Résidence', valeur: 320000, partA: 0.75 }, { libelle: 'Épargne', valeur: 40000, partA: 0.75 }],
  enfants: 2, decede: 'a',
};

test('Masses : propres et communs (communauté), biens de chacun selon le financement (séparation)', () => {
  const m = S.masses(D);
  assert.deepStrictEqual([m.communaute.a.total, m.communaute.b.total, m.communaute.commun], [60000, 95000, 360000]);
  assert.deepStrictEqual([m.separation.a.total, m.separation.b.total, m.separation.commun], [330000, 185000, 0]);
  assert.strictEqual(m.total, 515000);
});

test('Divorce : partage de la communauté par moitié', () => {
  const r = S.divorce(D);
  assert.deepStrictEqual([r.communaute.a.total, r.communaute.b.total], [240000, 275000]);
  assert.deepStrictEqual([r.separation.a.total, r.separation.b.total], [330000, 185000]);
});

test('Décès : le conjoint garde ses biens et hérite du quart (enfants communs)', () => {
  const r = S.deces(D);
  assert.strictEqual(r.vivant, 'b');
  // Communauté : garde 95 000 + 180 000 ; succession 60 000 + 180 000, dont ¼ = 60 000.
  assert.deepStrictEqual([r.communaute.garde, r.communaute.succession, r.communaute.herite, r.communaute.total, r.communaute.enfants], [275000, 240000, 60000, 335000, 180000]);
  // Séparation : garde 185 000 ; succession 330 000, dont ¼ = 82 500.
  assert.deepStrictEqual([r.separation.garde, r.separation.herite, r.separation.total, r.separation.enfants], [185000, 82500, 267500, 247500]);
  // Sans enfant (ni père et mère) : la totalité.
  assert.strictEqual(S.deces(Object.assign({}, D, { enfants: 0 })).separation.total, 515000);
});

test('Famille recomposée : le quart du conjoint ne revient jamais à l\'enfant d\'une autre union', () => {
  const r = S.recompose({ defunt: 'Paul', conjoint: 'Julie', communs: ['Emma'], autres: ['Léo'], succession: 400000 });
  assert.strictEqual(r.optionUsufruitLegale, false);
  assert.strictEqual(r.sans.conjoint, 100000);
  const [emma, leo] = r.enfants;
  assert.deepStrictEqual([emma.sans, emma.plusTard, emma.totalSans, emma.avec], [150000, 100000, 250000, 200000]);
  assert.deepStrictEqual([leo.sans, leo.plusTard, leo.totalSans, leo.avec], [150000, 0, 150000, 200000]);
  // Sans enfant commun : le quart part dans la famille du conjoint.
  const s = S.recompose({ communs: [], autres: ['Léo', 'Zoé'], succession: 400000 });
  assert.strictEqual(s.sans.versFamilleConjoint, 100000);
  assert.deepStrictEqual(s.enfants.map((x) => x.totalSans), [150000, 150000]);
  // Tous les enfants communs : l'option pour l'usufruit existe sans testament.
  assert.strictEqual(S.recompose({ communs: ['A', 'B'], autres: [], succession: 1 }).optionUsufruitLegale, true);
});

const P = S.PARAMS_DEFAUT;
test('Démembrement : la nue-propriété réduit les droits (barème 669)', () => {
  const r = S.demembrement({ valeur: 500000, age: 65, enfants: 2, donateurs: 2 }, P);
  assert.strictEqual(r.us, 0.4);
  assert.strictEqual(r.valeurNuePropriete, 300000);
  // Pleine propriété : 125 000 par parent et par enfant, 25 000 taxables → 3 194,35 € × 4.
  assert.ok(Math.abs(r.pp.total - 12777.4) < 0.01);
  assert.strictEqual(r.nuePropriete.total, 0);
});

test('Abattements renouvelables tous les 15 ans ; don d\'argent avant 80 ans', () => {
  const r = S.abattements({ donateurs: 2, enfants: 2, petitsEnfants: 3, age: 60, ageMax: 90 }, P);
  assert.deepStrictEqual(r.cycles.map((c) => c.age), [60, 75, 90]);
  assert.strictEqual(r.cycles[0].total, 400000 + 6 * 31865 + 4 * 31865);
  assert.strictEqual(r.cycles[2].donFamilial, 0);
});

test('Réserve héréditaire et quotité disponible', () => {
  assert.strictEqual(S.reserve({ masse: 600000, enfants: 2 }).valeurQd, 200000);
  assert.strictEqual(S.reserve({ masse: 600000, enfants: 4 }).qd, 0.25);
  assert.strictEqual(S.reserve({ masse: 600000, enfants: 0, conjoint: true }).qd, 0.75);
  assert.strictEqual(S.reserve({ masse: 600000, enfants: 0 }).qd, 1);
});

test('Union libre : 60 % après abattement ; donation entre époux ; frais d\'acquisition', () => {
  assert.ok(Math.abs(S.couple({ montant: 200000 }, P).concubinage.droits - 119043.6) < 0.01);
  const d = S.donationEpoux({ succession: 400000, enfants: 2, age: 72 }, P);
  assert.deepStrictEqual(d.options.map((o) => Math.round(o.valeur)), [100000, 120000, 133333, 190000, 120000]);
  const f = S.frais(S.EXEMPLES.frais);
  assert.strictEqual(Math.round(f.departement), 12500);
  assert.ok(Math.abs(f.emoluments - 2394.75) < 0.01);
  assert.strictEqual(f.csi, 250);
});
