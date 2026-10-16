/*
 * Tests de l'outil « Origine de propriété » : nombres en lettres, trames, rappel des personnes, contrôles.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../assets/js/apps/origine/lettres.js');
const E = require('../assets/js/apps/origine/engine.js');

const OPTS = { aujourdhui: '2026-10-09' };
const texteDe = (r) => E.texte(r.blocs);

test('Nombres en lettres (orthographe traditionnelle)', () => {
  const cas = { 21: 'vingt et un', 71: 'soixante et onze', 80: 'quatre-vingts', 81: 'quatre-vingt-un', 200: 'deux cents', 201: 'deux cent un',
    80000: 'quatre-vingt mille', 200000: 'deux cent mille', 1980: 'mille neuf cent quatre-vingts', 2000000: 'deux millions' };
  for (const [n, s] of Object.entries(cas)) assert.strictEqual(L.enLettres(+n), s);
});

test('Montants et dates', () => {
  assert.strictEqual(L.montant(150000, 'EUR', true), 'CENT CINQUANTE MILLE EUROS (150 000,00 EUR)');
  assert.strictEqual(L.montant(1000000, 'EUR', true), "UN MILLION D'EUROS (1 000 000,00 EUR)");
  assert.strictEqual(L.montant(10.5, 'EUR', true), 'DIX EUROS ET CINQUANTE CENTIMES (10,50 EUR)');
  assert.strictEqual(L.date('2010-03-01'), '1er mars 2010');
  assert.strictEqual(L.date('2010-03-15', true), 'quinze mars deux mille dix');
});

test('Accords en genre et en nombre', () => {
  const f = ['il', 'elle', 'ils', 'elles'];
  assert.strictEqual(E.accorder({ n: 1, f: false }, f), 'il');
  assert.strictEqual(E.accorder({ n: 1, f: true }, f), 'elle');
  assert.strictEqual(E.accorder({ n: 2, f: false }, f), 'ils');
  assert.strictEqual(E.accorder({ n: 2, f: true }, f), 'elles');
  assert.strictEqual(E.accorder({ n: 2, f: true }, ['a', 'ont']), 'ont');
});

test('Exemple : rédaction complète, rappel « susnommé », contrôles', () => {
  const r = E.rediger(E.exemple(), OPTS);
  const t = texteDe(r);
  assert.strictEqual(r.manquants, 0);
  assert.deepStrictEqual(r.erreurs, []);
  assert.deepStrictEqual(r.inconnues, []);
  // État civil complet une seule fois, puis rappel.
  assert.strictEqual(t.split('né à MÂCON (71000) le 12 janvier 1950').length - 1, 1);
  assert.match(t, /appartenait à Monsieur Paul BERNARD, susnommé, pour l'avoir recueilli/);
  assert.match(t, /^ORIGINE DE PROPRIÉTÉ\n\nLe BIEN objet des présentes appartient au VENDEUR, au moyen de l'acquisition qu'il en a faite de Monsieur Paul BERNARD, retraité/);
  assert.doesNotMatch(t, /Jean Michel DUPONT/);
  assert.match(t, /DEUX CENT QUATRE-VINGT-CINQ MILLE EUROS/);
  assert.match(t, /la donatrice étant décédée à CLUNY \(71250\), le 2 novembre 1995/);
  assert.ok(r.controles.every((c) => c.ok));
});

test('Vendeur aux présentes désactivé : état civil complet ou rappel', () => {
  const d = E.exemple();
  d.vendeurDirect = false;
  let t = texteDe(E.rediger(d, OPTS));
  assert.match(t, /Madame Claire MARTIN, épouse DUPONT, professeure, demeurant à LYON \(69003\), 12 rue Paul Bert, née à GRENOBLE/);
  d.personnes.forEach((p) => { if (p.id === 'ex1') p.dejaDesigne = true; });
  t = texteDe(E.rediger(d, OPTS));
  assert.match(t, /appartient à Monsieur Jean Michel DUPONT, susnommé et Madame Claire MARTIN, épouse DUPONT/);
});

test('Le VENDEUR : accord au singulier, quittance et vendeur cité parmi d\'autres', () => {
  const d = E.exemple();
  Object.assign(d.actes[0], { paiement: 'terme', prixComptant: 200000, quittance: true });
  assert.match(texteDe(E.rediger(d, OPTS)), /Le VENDEUR s'est libéré du solde de son prix d'acquisition/);
  // Un seul des deux acquéreurs de l'origine immédiate figure dans une autre liste.
  d.actes[1].acquereurs = ['ex3', 'ex1'];
  assert.match(texteDe(E.rediger(d, OPTS)), /Monsieur Jean Michel DUPONT, VENDEUR aux présentes/);
});

test('Origine trentenaire non atteinte et rupture de la chaîne', () => {
  const d = E.exemple();
  d.actes = d.actes.slice(0, 2);
  d.actes[1].acquereurs = [];
  const c = E.rediger(d, OPTS).controles;
  assert.ok(c.some((x) => !x.ok && /trentenaire non atteinte/.test(x.texte)));
  assert.ok(c.some((x) => !x.ok && /Paul BERNARD devrait y figurer/.test(x.texte)));
});

test('Éléments manquants signalés et rendus « ...... »', () => {
  const d = E.exemple();
  d.actes[0].notaire = { nom: '', ville: '' };
  const r = E.rediger(d, OPTS);
  assert.strictEqual(r.blocs[0].manquants.length, 1);
  assert.match(texteDe(r), /Suivant acte reçu par \.{22}, le 12 juin 2015/);
});

test('Toutes les trames d\'actes se rédigent sans erreur', () => {
  for (const t of E.TYPES_LISTE) {
    const r = E.rediger(E.exemple(t.id), OPTS);
    assert.deepStrictEqual(r.erreurs, [], t.id);
    assert.deepStrictEqual(r.inconnues, [], t.id);
    assert.ok(r.blocs[0].paragraphes.length > 1, t.id);
  }
});

test('Trame personnalisée, conditions et erreurs de syntaxe', () => {
  const d = E.exemple();
  const r = E.rediger(d, Object.assign({ trames: { 'commun:ouverture_immediate': 'Le BIEN appartient' } }, OPTS));
  assert.match(texteDe(r), /^ORIGINE DE PROPRIÉTÉ\n\nLe BIEN appartient au VENDEUR/);
  const r2 = E.rediger(d, Object.assign({ trames: { 'acte:vente': '{si paiement = terme}À terme{sinon}Comptant{fin} {inconnue}' } }, OPTS));
  assert.match(texteDe(r2), /Comptant \{inconnue\}/);
  assert.deepStrictEqual(r2.inconnues, ['inconnue']);
  assert.deepStrictEqual(E.parse('{si x}a').erreurs, ['Il manque 1 {fin}.']);
});

test('Actes anciens : transcription avant 1956, témoins avant 1967, cahier des charges avant 2007', () => {
  const d = E.exemple('donation');
  d.actes[0].date = '1950-05-02';
  d.actes[0].publication.date = '1950-06-01';
  const t = texteDe(E.rediger(d, OPTS));
  assert.match(t, /Suivant acte reçu en présence réelle de témoins par/);
  assert.match(t, /transcrit au bureau des hypothèques de Mâcon, le 1er juin 1950/);
  const a = E.exemple('adjudication');
  a.actes[0].cahierDate = '2005-01-10';
  assert.match(texteDe(E.rediger(a, OPTS)), /cahier des charges/);
});

test('Apport en société : société bénéficiaire, titres attribués, apport partiellement onéreux', () => {
  const ex = E.exemple('apport');
  ex.vendeurDirect = false;
  Object.assign(ex.actes[0], { titreApport: 'onereux', passif: 50000, natureTitres: 'actions', nombreTitres: '1' });
  const t = E.texte(E.rediger(ex, {}).blocs);
  assert.ok(t.includes('appartient à la société dénommée LES TILLEULS, société civile immobilière'));
  assert.ok(t.includes("par suite de l'apport qui lui en a été fait par Monsieur Paul BERNARD"));
  assert.ok(t.includes("suivant acte d'augmentation de capital reçu par Maître Henri FAURE, notaire à MÂCON, le 15 mars 2010"));
  assert.match(t, /à titre partiellement onéreux à concurrence du passif de CINQUANTE MILLE EUROS \(50\s000,00\sEUR\) pris en charge par la société/);
  assert.ok(t.includes('attribué à Monsieur Paul BERNARD UN (1) action de la société LES TILLEULS, d\'une valeur nominale de 10 euros chacune.'));
});
