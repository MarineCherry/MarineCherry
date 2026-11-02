/*
 * Quotités d'acquisition en indivision (données fictives).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Q = require('../assets/js/apps/quotites/engine.js');

test('Apports différents, prêt et frais de prêt par moitié', () => {
  const r = Q.calculer(Q.EXEMPLE);
  // 50 000 + 130 000 − 3 500 = 176 500 ; 20 000 + 130 000 − 3 500 = 146 500 ; total 323 000 = coût de l'acquisition.
  assert.deepStrictEqual(r.lignes.map((l) => l.contribution), [176500, 146500]);
  assert.deepStrictEqual(r.lignes.map((l) => l.quotiteArrondie), [0.5464, 0.4536]);
  assert.ok(r.equilibre);
  assert.ok(Q.clause(r)[0].replace(/\u00a0/g, ' ').includes('Julie MARTIN à concurrence de 54,64 %, Thomas DURAND à concurrence de 45,36 %'));
});

test('Frais de prêt ajoutés au coût ; prêt réparti 70 / 30 ; arrondi à 100 %', () => {
  const r = Q.calculer(Object.assign({}, Q.EXEMPLE, { fraisDansCout: true }));
  assert.strictEqual(r.base, 330000);
  assert.deepStrictEqual(r.lignes.map((l) => l.quotiteArrondie), [0.5455, 0.4545]);
  const d = JSON.parse(JSON.stringify(Q.EXEMPLE));
  d.prets[0].egal = false;
  d.prets[0].repartition = { a1: 0.7, a2: 0.3 };
  const s = Q.calculer(d);
  assert.deepStrictEqual(s.lignes.map((l) => Math.round(l.contribution)), [50000 + 182000 - 4900, 20000 + 78000 - 2100]);
  assert.strictEqual(Q.arrondir([1 / 3, 1 / 3, 1 / 3]).reduce((t, x) => t + x, 0).toFixed(4), '1.0000');
});
