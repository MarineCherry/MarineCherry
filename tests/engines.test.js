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

/*
 * Succession : le patrimoine est désormais saisi par branche (biens propres / communs) et les donations
 * ligne par ligne. Les scénarios Excel sont convertis dans ce format ; un bien détenu à 80 / 20 devient
 * un bien propre du premier parent (60 %) plus un bien commun (40 %), ce qui donne les mêmes parts.
 */
function convertir(old) {
  const biens = [], donations = [];
  old.biens.forEach((b, i) => {
    const q = old.nbParents === 1 ? 1 : b.quotePartP1 === null || b.quotePartP1 === undefined ? 0.5 : b.quotePartP1;
    const morceaux = [];
    if (q === 0.5) morceaux.push(['commun', b.valeur]);
    else if (q === 1) morceaux.push(['P1', b.valeur]);
    else if (q === 0) morceaux.push(['P2', b.valeur]);
    else if (q > 0.5) morceaux.push(['P1', (2 * q - 1) * b.valeur], ['commun', (2 - 2 * q) * b.valeur]);
    else morceaux.push(['P2', (1 - 2 * q) * b.valeur], ['commun', 2 * q * b.valeur]);
    const fraction = b.aDonner ? (typeof b.montantDonne === 'number' ? Math.min(1, b.montantDonne / b.valeur) : 1) : 0;
    morceaux.forEach(([proprietaire, valeur], j) => {
      const id = 'b' + i + '_' + j;
      biens.push({ id, designation: b.designation, nature: b.nature, valeur, proprietaire, regime: b.regime });
      if (fraction > 0 && b.beneficiaire === 'Enfants') {
        donations.push({ id: 'd' + id, donateur: proprietaire === 'commun' ? 'deux' : proprietaire, bienId: id, montant: fraction === 1 ? null : fraction * valeur, beneficiaire: 'tous' });
      }
    });
  });
  return Object.assign({}, old, { biens, donations, donsPE: { P1: 0, P2: 0 } });
}

const A_COLS = ['transmis', 'abattement', 'exonerations', 'resteTaxable', 'droits'];
const PART_COLS = ['transmis', 'abattement', 'exonerations', 'resteTaxable', 'droits'];

for (const file of scenarios('succession')) {
  test('Succession — ' + file + ' (hypothèse A)', () => {
    const sc = load(file);
    const exp = load(file.replace('.json', '.expected.json'));
    const r = succ.calculer(convertir(sc.dossier), succParams);
    const A = r.hypotheses.A;
    exp.A_cumul.forEach((row, k) => A_COLS.forEach((c, j) => near(A.cumul.enfants[k].succession[c], row[j], `A cumul enfant ${k + 1} ${c}`)));
    exp.A_p1.forEach((row, k) => A_COLS.forEach((c, j) => near(A.parents[0].enfants[k].succession[c], row[j], `A parent 1 enfant ${k + 1} ${c}`)));
    if (sc.dossier.nbParents === 2) exp.A_p2.forEach((row, k) => A_COLS.forEach((c, j) => near(A.parents[1].enfants[k].succession[c], row[j], `A parent 2 enfant ${k + 1} ${c}`)));
    near(r.patrimoineTotal, exp.synthese.patrimoine, 'patrimoine');
  });
}

// Scénario sans petits-enfants : les hypothèses B (pleine propriété) et C (nue-propriété) doivent
// donner exactement les résultats du classeur, enfant par enfant et parent par parent.
test('Succession — succession-3.json (hypothèses B et C, comparées au classeur)', () => {
  const sc = load('succession-3.json');
  const exp = load('succession-3.expected.json');
  const r = succ.calculer(convertir(sc.dossier), succParams);
  for (const [code, H] of [['B', r.hypotheses.B], ['C', r.hypotheses.C]]) {
    for (const [suffix, v] of [['cumul', H.cumul], ['p1', H.parents[0]], ['p2', H.parents[1]]]) {
      exp[code + '_' + suffix + '_enfants'].forEach((row, k) => {
        const l = v.enfants[k];
        PART_COLS.forEach((c, j) => near(l.donation[c], row[j], `${code} ${suffix} enfant ${k + 1} donation ${c}`));
        PART_COLS.forEach((c, j) => near(l.succession[c], row[5 + j], `${code} ${suffix} enfant ${k + 1} résiduel ${c}`));
        near(l.totalDroits, row[10], `${code} ${suffix} enfant ${k + 1} total`);
        near(l.economie, row[11], `${code} ${suffix} enfant ${k + 1} économie`);
      });
      const t = exp[code + '_' + suffix + '_total'];
      near(v.total.totalDroits, t[10], `${code} ${suffix} total des droits`);
    }
  }
  exp.comparatif.forEach((row, i) => {
    const c = r.comparatif[i];
    ['donation', 'succession', 'total', 'economie'].forEach((k, j) => near(c[k], row[j], `comparatif ${c.code} ${k}`));
  });
});

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
