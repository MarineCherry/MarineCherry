/*
 * Compare les moteurs JavaScript aux valeurs calculées par les classeurs Excel d'origine
 * (fichiers tests/fixtures/*.expected.json, générés par tests/excel/reference.py).
 * Lancer : node --test tests/
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const defaults = require('../assets/js/core/defaults.js');
const pv = require('../assets/js/apps/plusvalue/engine.js');
const succ = require('../assets/js/apps/succession/engine.js');

const FIX = path.join(__dirname, 'fixtures');
const load = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const scenarios = (kind) => fs.readdirSync(FIX).filter((f) => f.startsWith(kind + '-') && !f.includes('.expected')).sort();

const pvParams = Object.assign({}, defaults.plusValue, { bareme669: defaults.commun.bareme669 });
const succParams = Object.assign({}, defaults.succession, { bareme669: defaults.commun.bareme669 });

function near(actual, expected, label) {
  if (expected === null || expected === '' || expected === undefined) return;
  // LibreOffice écrit les décimales avec un point, Excel en français avec une virgule.
  if (typeof expected === 'string') return assert.strictEqual(actual, expected.replace(/(\d)\.(\d)/g, '$1,$2'), label);
  assert.ok(Math.abs(actual - expected) < 0.01, `${label} : obtenu ${actual}, attendu ${expected}`);
}

for (const file of scenarios('plusvalue')) {
  test('Plus-value — ' + file, () => {
    const sc = load(file);
    const exp = load(file.replace('.json', '.expected.json'));
    const r = pv.calculer(sc.dossier, pvParams);
    exp.origines.forEach((e, i) => {
      const got = r.origines[i].resultat;
      for (const k of Object.keys(e)) near(got[k], e[k], `origine ${i + 1} ${k}`);
    });
    exp.vendeurs.forEach((e, i) => {
      for (const k of Object.keys(e)) near(r.parVendeur[i][k], e[k], `vendeur ${i + 1} ${k}`);
    });
    if (exp.controleRepartition) assert.strictEqual(r.controleRepartition.ok, exp.controleRepartition.startsWith('OK'));
  });
}

const A_COLS = ['transmis', 'abattement', 'exonerations', 'resteTaxable', 'droits', 'tauxEffectif', 'net'];
const PART_COLS = ['transmis', 'abattement', 'exonerations', 'resteTaxable', 'droits'];

function compareA(vue, rows, label) {
  rows.forEach((row, k) => A_COLS.forEach((c, j) => near(vue.lignes[k][c], row[j], `${label} enfant ${k + 1} ${c}`)));
}
function compareDonation(vue, exp, prefix) {
  exp[prefix + '_enfants'].forEach((row, k) => {
    const l = vue.lignes[k];
    PART_COLS.forEach((c, j) => near(l.donation[c], row[j], `${prefix} enfant ${k + 1} donation ${c}`));
    PART_COLS.forEach((c, j) => near(l.residuel[c], row[5 + j], `${prefix} enfant ${k + 1} résiduel ${c}`));
    near(l.totalDroits, row[10], `${prefix} enfant ${k + 1} total`);
    near(l.economie, row[11], `${prefix} enfant ${k + 1} économie`);
  });
  exp[prefix + '_pe'].forEach((row, k) => PART_COLS.forEach((c, j) => near(vue.petitsEnfants[k][c], row[j], `${prefix} PE ${k + 1} ${c}`)));
  const t = exp[prefix + '_total'];
  PART_COLS.forEach((c, j) => near(vue.total.donation[c], t[j], `${prefix} total donation ${c}`));
  PART_COLS.forEach((c, j) => near(vue.total.residuel[c], t[5 + j], `${prefix} total résiduel ${c}`));
  near(vue.total.totalDroits, t[10], `${prefix} total des droits`);
  near(vue.total.economie, t[11], `${prefix} économie totale`);
}

for (const file of scenarios('succession')) {
  test('Succession — ' + file, () => {
    const sc = load(file);
    const exp = load(file.replace('.json', '.expected.json'));
    const r = succ.calculer(sc.dossier, succParams);

    compareA(r.succession.cumul, exp.A_cumul, 'A cumul');
    compareA(r.succession.parents[0], exp.A_p1, 'A parent 1');
    if (sc.dossier.nbParents === 2) compareA(r.succession.parents[1], exp.A_p2, 'A parent 2');

    for (const [code, vues] of [['B', r.hypB], ['C', r.hypC]]) {
      compareDonation(vues.cumul, exp, code + '_cumul');
      compareDonation(vues.parents[0], exp, code + '_p1');
      if (sc.dossier.nbParents === 2) compareDonation(vues.parents[1], exp, code + '_p2');
    }

    exp.comparatif.forEach((row, i) => {
      const h = r.comparatif[i];
      ['donation', 'succession', 'total', 'economie', 'economiePct', 'chargeFiscale'].forEach((c, j) => near(h[c], row[j], `comparatif ${h.code} ${c}`));
    });
    near(r.patrimoine, exp.synthese.patrimoine, 'patrimoine');

    exp.biensDonnes.forEach((row, i) => {
      const b = r.biensDonnes[i];
      assert.strictEqual(b.designation, row[0]);
      ['valeur', 'beneficiaire', 'pleinePropriete', 'dontPetitsEnfants', 'nuePropriete', 'usufruitConserve']
        .forEach((c, j) => near(b[c], row[j + 1], `bien donné ${i + 1} ${c}`));
    });

    exp.controles.forEach((v, i) => assert.strictEqual(r.controles[[1, 0, 2, 3, 4, 5][i]].ok, v.startsWith('✔'), `contrôle ${i + 1}`));
  });
}

test('Barème progressif : 100 000 € taxables en ligne directe', () => {
  // 8 072 × 5 % + 4 037 × 10 % + 3 823 × 15 % + 84 068 × 20 % = 18 194,35 €
  assert.ok(Math.abs(succ.droitsBareme(defaults.succession.bareme777, 100000) - 18194.35) < 0.01);
});

test('Abattements pour durée de détention', () => {
  assert.strictEqual(pv.abattementIR(5), 0);
  assert.ok(Math.abs(pv.abattementIR(21) - 0.96) < 1e-9);
  assert.strictEqual(pv.abattementIR(22), 1);
  assert.strictEqual(pv.abattementPS(22), 0.28);
  assert.ok(Math.abs(pv.abattementPS(29) - 0.91) < 1e-9);
  assert.strictEqual(pv.abattementPS(30), 1);
});
