/*
 * Quasi-usufruit : lecture d'un relevé de compte (mise en page Fiducial, données fictives),
 * classement des opérations, assiette et créances de restitution.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Q = require('../assets/js/apps/quasi/engine.js');
const defaults = require('../assets/js/core/defaults.js');

const P = { bareme669: defaults.commun.bareme669 };
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.006, `${label} : obtenu ${a}, attendu ${b}`);
const fr = (x) => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ');

// Page de relevé fictive : mêmes colonnes que les relevés de l'étude (débit et crédit alignés à droite).
function page(intitule, lignes, totaux) {
  const items = [];
  const at = (str, x, y) => items.push({ str, x, y, w: str.length * 5 });
  const droite = (str, bord, y) => items.push({ str, x: bord - str.length * 5, y, w: str.length * 5 });
  at('Du', 21, 591); at('01/01/2026', 40, 591); at('au', 90, 591); at('31/12/2026', 107, 591);
  at('Compte :', 21, 562); at('01234567', 58, 562); at('0001', 103, 562); at(intitule, 126, 562); at('1/1', 550, 562);
  at('Date', 37.5, 545); at('Libellé', 211.5, 545); at('Débit', 421.5, 545); at('Crédit', 509.3, 545);
  let y = 518;
  lignes.forEach((l) => {
    at(l.date, 27, y);
    at(l.lib, 78, y);
    if (l.debit) droite(fr(l.debit), 474, y);
    if (l.credit) droite(fr(l.credit), 565, y);
    y -= 12;
    (l.suite ? [l.suite] : []).forEach((t) => { at(t, 78, y); y -= 12; });
    (l.details || []).forEach(([lib, m]) => { at('- ' + lib, 81, y); droite(fr(m), 378, y); y -= 10.5; });
  });
  if (totaux) { at('Solde du Compte en EURO', 140, y - 10); droite(fr(totaux[0]), 474, y - 10); droite(fr(totaux[1]), 565, y - 10); }
  at('Membre d une Association Agréée, le règlement par chèque est accepté.', 21, 26);
  return { items };
}

// Vente d'un bien appartenant pour 95/100 à une succession (usufruit du conjoint) et 5/100 au conjoint.
const VENTE = [
  { date: '09/04/2026', lib: 'De ACHETEUR à CTS MARTIN prix de vente payable', suite: 'comptant de ce jour', credit: 200000 },
  { date: '09/04/2026', lib: 'HONORAIRES PROCURATION M. MARTIN 09/04/2026 C2600001', debit: 89.87, details: [['Honoraires', 50], ['Débours Non Soumis à T.V.A.', 29.87], ['T.V.A.', 10]] },
  { date: '09/04/2026', lib: 'De CTS MARTIN à SSION M. MARTIN PAUL PROVISION SUR', suite: 'FRAIS', debit: 2000 },
  { date: '10/04/2026', lib: 'A AGENCE DU CENTRE FACT 2026-001 CTS MARTIN', debit: 10000 },
  { date: '10/04/2026', lib: 'A BANQUE EXEMPLE RA MARTIN PRET 000001', debit: 100000 },
  { date: '13/04/2026', lib: 'MAINLEVEE BANQUE/MARTIN 13/04/2026 100 C2600002', debit: 300, details: [['Emoluments Fixes', 150], ['Formalités', 100], ['T.V.A.', 50]] },
  { date: '14/04/2026', lib: 'Dépôt Mainlevée simplifiée totale (Art. 2436 alinéa 3 CC) 100/', debit: 50 },
  { date: '01/10/2026', lib: 'PVI 2048-IMM-SD : M MARTIN Luc Pierre - 1 rue des Lilas', debit: 1000 },
  { date: '02/10/2026', lib: 'A MME MARTIN QUOTE-PART PRIX DE VENTE', debit: 20000 },
  { date: '02/10/2026', lib: 'CONVENTION QUASI-USUFRUIT MME MARTIN 02/10/2026 500', suite: 'C2600003', debit: 1300, details: [['Honoraires', 1000], ['T.V.A.', 200], ['Droits sur états', 100]] },
];

test('Lecture du relevé : opérations, libellés sur deux lignes, détail, débit et crédit, contrôle des totaux', () => {
  const debit = VENTE.reduce((t, l) => t + (l.debit || 0), 0), credit = VENTE.reduce((t, l) => t + (l.credit || 0), 0);
  const r = Q.lireReleve([page('VENTE CTS MARTIN / ACHETEUR', VENTE, [debit, credit])]);
  assert.strictEqual(r.compte, '01234567 0001');
  assert.strictEqual(r.intitule, 'VENTE CTS MARTIN / ACHETEUR');
  assert.strictEqual(r.periode, '01/01/2026 au 31/12/2026');
  assert.strictEqual(r.operations.length, VENTE.length);
  assert.deepStrictEqual(r.avertissements, []);
  const o = r.operations;
  assert.strictEqual(o[0].credit, 200000);
  assert.strictEqual(o[0].libelle, 'De ACHETEUR à CTS MARTIN prix de vente payable comptant de ce jour');
  assert.strictEqual(o[1].debit, 89.87);
  assert.deepStrictEqual(o[1].details.map((d) => d.montant), [50, 29.87, 10]);
  assert.strictEqual(o[9].libelle, 'CONVENTION QUASI-USUFRUIT MME MARTIN 02/10/2026 500 C2600003');
  assert.strictEqual(o[0].date, '2026-04-09');
  // Totaux faux : avertissement.
  assert.strictEqual(Q.lireReleve([page('X', VENTE, [debit + 1, credit])]).avertissements.length, 1);
});

test('Classement des opérations : base, éléments retranchés, versements sans effet', () => {
  const ops = Q.lireReleve([page('VENTE', VENTE)]).operations.map((o) => Q.classer(o, 'vente'));
  assert.deepStrictEqual(ops.map((c) => c.action), ['base', 'retranche', 'retranche', 'retranche', 'retranche', 'retranche', 'retranche', 'retranche', 'ignore', 'retranche']);
  assert.deepStrictEqual(ops.map((c) => c.libelle).slice(1, 8), ['honoraires procuration', 'provision frais règlement succession', 'paiement honoraires agence',
    'remboursement solde prêt', 'frais mainlevée', 'dépôt mainlevée', 'plus-value']);
  assert.strictEqual(ops[4].repartition, 'prorata');
  assert.strictEqual(ops[7].personneTexte, 'M MARTIN Luc Pierre');
  assert.ok(ops[8].verifier);
  // Succession : fonds reçus en base ; actes, débours ; provision pour une donation sans effet.
  const succ = [
    { libelle: 'reçu de BANQUE EXEMPLE POUR COMPTE SSION', credit: 30000 },
    { libelle: 'NOTORIETE SSION M. DURAND 28/04/2026 276 C2600504', debit: 200 },
    { libelle: 'OPTION DU CONJOINT SSION M. DURAND', debit: 365 },
    { libelle: 'Attestation de propriété SSION M. DURAND', debit: 3000 },
    { libelle: 'Dépôt Attestation de propriété - ACTE ELECTRONIQUE 1/26', debit: 60 },
    { libelle: 'Déclaration de succession M. DURAND', debit: 2800 },
    { libelle: 'CSI/2026-Réquisition Succession DURAND', debit: 12 },
    { libelle: 'A MME DURAND PARTIE SUCCESSION', debit: 10000 },
    { libelle: 'De SSION DURAND à DURAND ANNE PROVISION SUR FRAIS DONATION', debit: 5000 },
  ].map((o) => Q.classer(o, 'succession'));
  assert.deepStrictEqual(succ.map((c) => c.action), ['base', 'retranche', 'retranche', 'retranche', 'retranche', 'retranche', 'retranche', 'ignore', 'ignore']);
  assert.deepStrictEqual(succ.slice(1, 7).map((c) => c.libelle), ['frais de notoriété', 'frais d\'option du conjoint', 'frais d\'attestation immobilière',
    'frais d\'attestation immobilière', 'frais de déclaration de succession', 'frais d\'attestation immobilière']);
});

test('Succession : moitié des comptes de communauté, frais regroupés, créance de restitution de chaque enfant', () => {
  const d = {
    cas: 'succession', dateActe: '2026-06-19', usufruitier: { nom: 'Madame Anne DURAND', naissance: '1938-09-24' },
    nus: [{ id: 'a', nom: 'Madame Claire DURAND', part: '' }, { id: 'b', nom: 'Monsieur Marc DURAND', part: '' }],
    base: [{ id: 'x', libelle: 'Comptes BANQUE EXEMPLE', montant: 80000, part: '1/2' }],
    operations: [
      { action: 'retranche', libelle: 'frais de notoriété', montant: 200 },
      { action: 'retranche', libelle: 'frais d\'attestation immobilière', montant: 3000 },
      { action: 'retranche', libelle: 'frais d\'attestation immobilière', montant: 60 },
      { action: 'retranche', libelle: 'frais de convention de quasi-usufruit', montant: 1300 },
      { action: 'ignore', libelle: '', montant: 10000 },
    ],
  };
  const r = Q.calculer(d, P);
  near(r.brut, 40000, 'moitié revenant à la succession');
  assert.deepStrictEqual(r.frais.map((x) => [x.libelle, x.montant]), [['frais de notoriété', 200], ['frais d\'attestation immobilière', 3060], ['frais de convention de quasi-usufruit', 1300]]);
  near(r.totalFrais, 4560, 'total frais');
  near(r.net, 35440, 'solde');
  near(r.assietteQU, 35440, 'assiette');
  assert.deepStrictEqual(r.nus.map((x) => x.creance), [17720, 17720]);
  assert.strictEqual(r.age, 87);
  const t = Q.texte(Q.blocs(d, r));
  assert.ok(t.includes('1/2 revenant à la succession :\t40 000,00 €'));
  assert.ok(t.includes('Total frais :\t4 560,00 €'));
  assert.ok(t.includes('Solde :\t35 440,00 €'));
  assert.ok(t.includes('Madame Claire DURAND : 17 720,00 €.'));
});

test('Vente : quote-part démembrée, prêt au prorata, plus-value propre, répartition selon le barème', () => {
  const d = {
    cas: 'vente', dateActe: '2026-10-02', usufruitier: { nom: 'Madame Anne MARTIN', age: 78 },
    nus: [{ id: 'a', nom: 'Monsieur Luc MARTIN', part: '1/2', mode: 'qu' }, { id: 'b', nom: 'Madame Julie MARTIN', part: '1/2', mode: 'bareme' }],
    base: [{ id: 'x', libelle: 'Prix de vente', montant: 200000, part: '95/100' }],
    operations: [
      { action: 'retranche', libelle: 'paiement honoraires agence', montant: 10000, repartition: 'totalite' },
      { action: 'retranche', libelle: 'remboursement solde prêt', montant: 100000, repartition: 'prorata' },
      { action: 'retranche', libelle: 'plus-value', montant: 1000, personne: 'a' },
    ],
  };
  const r = Q.calculer(d, P);
  near(r.brut, 190000, 'quote-part démembrée');
  near(r.totalFrais, 10000 + 95000, 'agence en totalité, prêt au prorata (95 %)');
  near(r.net, 85000, 'solde');
  // Luc : 42 500 − sa plus-value 1 000 ; Julie : répartition à 30 % / 70 % (78 ans).
  assert.deepStrictEqual(r.nus.map((x) => [x.quote, x.assiette, x.creance]), [[42500, 41500, 41500], [42500, 42500, 0]]);
  near(r.nus[1].usufruitier, 12750, 'part de l\'usufruitier');
  near(r.nus[1].nuePropriete, 29750, 'part de la nue-propriétaire');
  near(r.assietteQU, 41500, 'assiette du quasi-usufruit');
  const t = Q.texte(Q.blocs(d, r, (x) => 'MONTANT (' + Q.euros(x) + ')'));
  assert.ok(t.includes('Quote-part sur laquelle s\'exerce le démembrement de propriété (95/100) :\t190 000,00 €'));
  assert.ok(t.includes('plus-value due par Monsieur Luc MARTIN\t1 000,00 €'));
  assert.ok(t.includes('arrêtées à la somme de : MONTANT (41 500,00 €) ;'));
  assert.ok(t.includes('usufruit 30 %, nue-propriété 70 %'));
  assert.ok(t.includes('12 750,00 € à l\'usufruitier (Madame Anne MARTIN) et 29 750,00 € au nu-propriétaire.'));
});

test('Fractions et montants', () => {
  assert.strictEqual(Q.fraction('95/100'), 0.95);
  assert.strictEqual(Q.fraction('50 %'), 0.5);
  assert.strictEqual(Q.fraction('3/8'), 0.375);
  assert.strictEqual(Q.fraction(''), null);
  assert.strictEqual(Q.montant('132 842,60'), 132842.6);
  assert.strictEqual(Q.ageAu('1938-09-24', '2026-06-19'), 87);
});

test('Arrondi : les créances de restitution font exactement le solde', () => {
  const r = Q.calculer({ cas: 'succession', nus: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], base: [{ montant: 100000.01 }], operations: [] }, P);
  near(r.nus.reduce((t, x) => t + x.creance, 0), 100000.01, 'total des créances');
  near(r.assietteQU, 100000.01, 'assiette');
});

test('Succession : actif par origine (communauté, propre, indivis) dans le tableau de l\'acte', () => {
  const d = {
    cas: 'succession', nus: [{ id: 'a', nom: 'Madame Claire DURAND' }],
    base: [
      { libelle: 'BANQUE EXEMPLE : comptes et livrets', montant: 100000, part: '1/2', groupe: 'commun' },
      { libelle: 'Livret A au nom du défunt (bien propre)', montant: 20000, part: '', groupe: 'propre' },
      { libelle: 'Compte joint avec un tiers', montant: 9000, part: '1/3', groupe: 'indivis' },
    ],
    operations: [{ action: 'retranche', libelle: 'frais de notoriété', montant: 500 }],
  };
  const r = Q.calculer(d, P);
  near(r.brut, 50000 + 20000 + 3000, 'revenant à la succession');
  near(r.assietteQU, 72500, 'assiette');
  const t = Q.texte(Q.blocs(d, r));
  assert.ok(t.includes('ACTIF DE COMMUNAUTE\t\nBANQUE EXEMPLE : comptes et livrets\t100 000,00 €\n1/2 revenant à la succession :\t50 000,00 €'));
  assert.ok(t.includes('BIENS PROPRES DU DEFUNT\t\nLivret A au nom du défunt (bien propre)\t20 000,00 €'));
  assert.ok(t.includes('Quote-part revenant à la succession :\t3 000,00 €'));
  assert.ok(t.includes('Total revenant à la succession :\t73 000,00 €'));
  assert.ok(t.includes('Solde :\t72 500,00 €'));
});
