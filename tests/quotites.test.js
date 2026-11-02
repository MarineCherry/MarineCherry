/*
 * Quotités d'acquisition en indivision (données fictives).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Q = require('../assets/js/apps/quotites/engine.js');
const L = require('../assets/js/apps/origine/lettres.js');

test('Méthode de l\'étude : frais de prêt compris dans le coût de l\'opération', () => {
  const r = Q.calculer(Q.EXEMPLE);
  // (50 000 + 130 000) / 330 000 et (20 000 + 130 000) / 330 000.
  assert.strictEqual(r.base, 330000);
  assert.deepStrictEqual(r.lignes.map((l) => l.contribution), [180000, 150000]);
  assert.deepStrictEqual(r.lignes.map((l) => l.quotiteArrondie), [0.5455, 0.4545]);
  assert.ok(r.equilibre);
});

test('Autre méthode : frais de prêt déduits de l\'apport ; prêt réparti 70 / 30 ; arrondi à 100 %', () => {
  const r = Q.calculer(Object.assign({}, Q.EXEMPLE, { fraisDansCout: false }));
  assert.deepStrictEqual(r.lignes.map((l) => l.contribution), [176500, 146500]);
  assert.deepStrictEqual(r.lignes.map((l) => l.quotiteArrondie), [0.5464, 0.4536]);
  const d = JSON.parse(JSON.stringify(Q.EXEMPLE));
  d.prets[0].egal = false;
  d.prets[0].repartition = { a1: 0.7, a2: 0.3 };
  assert.deepStrictEqual(Q.calculer(d).lignes.map((l) => Math.round(l.contribution)), [50000 + 182000, 20000 + 78000]);
  assert.strictEqual(Q.arrondir([1 / 3, 1 / 3, 1 / 3]).reduce((t, x) => t + x, 0).toFixed(4), '1.0000');
});

test('Clause de l\'étude complétée : quotités, coût, fonds personnels, prêt, récapitulatif', () => {
  const r = Q.calculer(Q.EXEMPLE);
  const c = Q.clauseActe(Q.EXEMPLE, r, (x) => L.montant(x, 'EUR', true));
  const t = Q.clauseTexte(c.blocs).replace(/[  ]/g, ' ');
  assert.ok(t.includes('54,55 % en pleine propriété pour Madame Julie MARTIN'));
  assert.ok(t.includes('Frais de prêt\t7 000,00 EUROS'));
  assert.ok(t.includes('Ensemble\t330 000,00 EUROS'));
  assert.ok(t.includes('Madame Julie MARTIN apporte CINQUANTE MILLE EUROS (50 000,00 EUR) provenant de fonds lui appartenant à titre personnel.'));
  assert.ok(t.includes('pour un montant de DEUX CENT SOIXANTE MILLE EUROS (260 000,00 EUR) auprès de Banque Exemple.'));
  assert.ok(t.includes('Monsieur Thomas DURAND à concurrence de 50,00 %'));
  assert.ok(t.includes('Soit en proportion du coût de l\'opération\t54,55 %\t45,45 %\t100 %'));
  assert.ok(c.equilibre);
});

test('frais du syndic comptés dans le coût et repris dans la clause', () => {
  const d = JSON.parse(JSON.stringify(Q.EXEMPLE));
  d.emplois.push({ code: 'fraisSyndic', montant: 600 });
  d.acquereurs[0].apports[0].montant += 600;
  const r = Q.calculer(d);
  assert.equal(r.base, 330600);
  assert.ok(r.equilibre);
  const txt = Q.clauseTexte(Q.clauseActe(d, r, (x) => String(x)).blocs);
  assert.match(txt, /Frais du syndic\t600,00 EUROS/);
});
