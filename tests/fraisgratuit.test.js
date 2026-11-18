'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../assets/js/apps/fraisgratuit/engine.js');

test('frais gratuit : prorata des droits et des frais', () => {
  const r = E.calculer({
    baseTotale: 400000,
    bien: { designation: 'Maison', valeur: 200000, residencePrincipale: false },
    heritiers: [
      { id: 'a', nom: 'Claire', droits: 10000, partFrais: '1/2', vendeur: true },
      { id: 'b', nom: 'Paul', droits: 6000, partFrais: '50 %', vendeur: true },
    ],
    frais: [
      { libelle: 'Déclaration de succession', montant: 3000, retenu: true },
      { libelle: 'Attestation immobilière', montant: 1000, retenu: true },
      { libelle: 'Procuration', montant: 200, retenu: false },
    ],
  });
  assert.strictEqual(r.quotePart, 0.5);
  assert.strictEqual(r.fraisRetenus, 4000);
  assert.strictEqual(r.fraisBien, 2000);
  assert.deepStrictEqual(r.heritiers.map((x) => [x.droitsImputables, x.fraisImputables, x.total]), [[5000, 1000, 6000], [3000, 1000, 4000]]);
  assert.deepStrictEqual(r.alertes, []);
});

test('frais gratuit : résidence principale (−20 %) et alertes', () => {
  const r = E.calculer({
    baseTotale: 160000,
    bien: { valeur: 250000, residencePrincipale: true },
    heritiers: [{ nom: 'A', droits: 0, partFrais: '1/3' }],
    frais: [{ libelle: 'Acte de PARTAGE', montant: 500, retenu: true }],
  });
  assert.strictEqual(r.valeurBien, 200000);
  assert.strictEqual(r.quotePart, 1);
  assert.ok(r.alertes.some((a) => /dépasse/.test(a)));
  assert.ok(r.alertes.some((a) => /100 %/.test(a)));
  assert.ok(r.alertes.some((a) => /partage/i.test(a)));
});

test('frais gratuit : fractions', () => {
  assert.strictEqual(E.fraction('1/4'), 0.25);
  assert.strictEqual(E.fraction('25 %'), 0.25);
  assert.strictEqual(E.fraction('25'), 0.25);
  assert.strictEqual(E.fraction('0,5'), 0.5);
  assert.strictEqual(E.fraction(''), null);
});

test('frais gratuit : frais repris du relevé (partage et procuration non retenus)', () => {
  const f = E.fraisDuReleve([
    { libelle: 'DECLARATION DE SUCCESSION', debit: 1200 },
    { libelle: 'ACTE DE PARTAGE', debit: 900 },
    { libelle: 'PROCURATION', debit: 60 },
    { libelle: 'VIREMENT RECU', credit: 5000 },
  ]);
  const par = (re) => f.find((x) => re.test(x.libelleReleve));
  assert.ok(!f.some((x) => /VIREMENT/.test(x.libelleReleve)));
  assert.strictEqual(par(/PARTAGE/).retenu, false);
  assert.strictEqual(par(/PROCURATION/).retenu, false);
});

test('frais gratuit : bien divisé depuis la succession (valeur ou surfaces)', () => {
  const base = { baseTotale: 400000, heritiers: [{ nom: 'A', droits: 10000, partFrais: '1' }], frais: [{ libelle: 'Déclaration', montant: 2000 }] };
  const s = E.calculer(Object.assign({}, base, { bien: { valeur: 200000, division: 'surface', surfaceTotale: 1000, surfaceVendue: 250 } }));
  assert.strictEqual(s.valeurTotale, 200000);
  assert.strictEqual(s.fractionDivision, 0.25);
  assert.strictEqual(s.valeurBien, 50000);
  assert.strictEqual(s.quotePart, 0.125);
  assert.strictEqual(s.heritiers[0].total, 1250 + 250);
  const v = E.calculer(Object.assign({}, base, { bien: { valeur: 200000, residencePrincipale: true, division: 'valeur', valeurPartie: 80000 } }));
  assert.strictEqual(v.valeurBien, 64000);
  assert.strictEqual(v.fractionDivision, 0.4);
  const x = E.calculer(Object.assign({}, base, { bien: { valeur: 200000, division: 'surface', surfaceTotale: 100, surfaceVendue: 150 } }));
  assert.ok(x.alertes.some((a) => /dépasse le bien d'origine/.test(a)));
});

test('frais gratuit : références cadastrales de la déclaration', () => {
  const p = E.cadastre('Cadastrée : section : BT, numéro : 182, lieudit : RUE DU TERRIER, contenance : 0ha 09a 74ca . section : BT, numéro : 209, lieudit :, LE BARON, contenance : 1ha 07a 00ca .');
  assert.deepStrictEqual(p.map((x) => [x.section, x.numero, x.lieudit, x.surface]), [['BT', '182', 'RUE DU TERRIER', 974], ['BT', '209', 'LE BARON', 10700]]);
  assert.strictEqual(E.contenance(10700), '1 ha 07 a 00 ca');
});

test('frais gratuit : plusieurs immeubles, lot divisé + 1/3 du chemin d\'accès', () => {
  // Terrain de 4 000 m² valant 120 000 € divisé en 4 : on vend un lot de 900 m² et 1/3 du chemin de 300 m².
  const r = E.calculer({
    baseTotale: 600000,
    bien: { parties: [
      { designation: 'Lot B', valeur: 120000, division: 'surface', surfaceTotale: 4000, surfaceVendue: 900 },
      { designation: 'Chemin', valeur: 120000, division: 'surface', surfaceTotale: 4000, surfaceVendue: 300, quoteVendue: '1/3' },
    ] },
    heritiers: [{ nom: 'A', droits: 6000, partFrais: '1' }],
    frais: [{ libelle: 'Déclaration', montant: 3000 }],
  });
  assert.deepStrictEqual(r.parties.map((x) => x.valeur), [27000, 3000]);
  assert.strictEqual(r.valeurBien, 30000);
  assert.strictEqual(r.quotePart, 0.05);
  assert.strictEqual(r.heritiers[0].total, 300 + 150);
  assert.deepStrictEqual(r.alertes, []);
});
