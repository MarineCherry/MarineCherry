/*
 * Lecture d'un mail d'agence (format .eml, données fictives) et repérage des informations.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const X = require('../assets/js/apps/dossiers/extraction.js');

const qp = (s) => Buffer.from(s, 'utf8').toString('binary').replace(/[^\x20-\x7e\n]|=/g, (c) => '=' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const CORPS = `Bonjour à vous,

Nous aimerions prendre rendez-vous pour la vente MARTIN // SCI LES OLIVIERS représentée par M. et Mme BERNARD

Maître DURAND représentera Monsieur et Madame MARTIN et Maître PETIT notaire à CAVAILLON représentera la SCI LES OLIVIERS

VENDEURS :

Monsieur MARTIN Paul

Adresse: 12 rue des Lilas 84000 Avignon
Téléphone: 06 00 00 00 01
Email: paul.martin@example.fr <mailto:paul.martin@example.fr>
Profession: Retraité

Madame MARTIN Jeanne

Adresse: 12 rue des Lilas 84000 Avignon
Téléphone: 06 00 00 00 02
Email: jeanne.martin@example.fr
Situation familiale: mariés sans contrat

ACQUÉREURS : SCI LES OLIVIERS représentée par

Monsieur BERNARD Luc

Adresse: 5 chemin des Vignes 84300 Cavaillon
Téléphone: 06 00 00 00 03
Email: luc.bernard@example.fr

Madame BERNARD Anne

Adresse: 5 chemin des Vignes 84300 Cavaillon

DÉTAILS FINANCEMENT :

Financement : Prêt bancaire de 150 000 €
Dépôt de garantie : Le dépôt de garantie sera 5 000 €

INFORMATIONS BIEN VENDU :

Adresse du bien vendu: 12 rue des Lilas 84000 Avignon
Type de bien: Appartement T3 en copropriété d'environ 68 m² habitables
Cadastré: Section AB 112 pour 5a 20ca
Prix de vente: 210 000 € commission comprise soit 200 000 € net vendeur et 10 000 € de commission à CHARGE ACQUÉREUR
Mandat de vente n°452 du 02/05/2026

Bien cordialement

Julie LEROY
06 11 22 33 44
`;
const EML = [
  'From: "Agence du Palais" <contact@agence-exemple.fr>',
  'Subject: =?UTF-8?Q?Agence_du_Palais_:_Demande_de_rendez-vous_Promesse_MARTIN?=',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="SEP"',
  '',
  '--SEP',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  qp(CORPS),
  '--SEP',
  'Content-Type: image/jpeg; name="CI recto M.jpg"',
  'Content-Disposition: attachment; filename="CI recto M.jpg"',
  'Content-Transfer-Encoding: base64',
  '',
  'AAAA',
  '--SEP',
  'Content-Type: application/pdf; name="Diagnostics DDT.pdf"',
  'Content-Disposition: attachment; filename="Diagnostics DDT.pdf"',
  '',
  'AAAA',
  '--SEP--',
  '',
].join('\r\n');

test('Mail .eml : en-têtes, corps et pièces jointes', () => {
  const m = X.lireEml(EML);
  assert.strictEqual(m.sujet, 'Agence du Palais : Demande de rendez-vous Promesse MARTIN');
  assert.ok(m.corps.includes('ACQUÉREURS : SCI LES OLIVIERS'));
  assert.deepStrictEqual(m.piecesJointes, ['CI recto M.jpg', 'Diagnostics DDT.pdf']);
});

test('Informations repérées dans le mail', () => {
  const m = X.lireEml(EML);
  const r = X.extraire({ sujet: m.sujet, expediteur: m.expediteur, corps: m.corps, piecesJointes: m.piecesJointes });
  assert.strictEqual(r.vendeurs.length, 2);
  assert.strictEqual(r.vendeurs[0].nom, 'MARTIN Paul');
  assert.strictEqual(r.vendeurs[0].civilite, 'M.');
  assert.strictEqual(r.vendeurs[0].commune, 'Avignon');
  assert.strictEqual(r.vendeurs[0].email, 'paul.martin@example.fr');
  assert.strictEqual(r.vendeurs[1].situation, 'marie');
  // La SCI est l'acquéreur ; ses gérants sont ses représentants.
  assert.strictEqual(r.acquereurs.length, 1);
  assert.strictEqual(r.acquereurs[0].nom, 'SCI LES OLIVIERS');
  assert.strictEqual(r.acquereurs[0].qualite, 'societe');
  assert.strictEqual(r.acquereurs[0].representants, 'M. BERNARD Luc et Mme BERNARD Anne');
  assert.deepStrictEqual({ cp: r.bien.codePostal, commune: r.bien.commune, type: r.bien.type, copro: r.bien.copro, surface: r.bien.surface, cadastre: r.bien.cadastre },
    { cp: '84000', commune: 'Avignon', type: 'appartement', copro: true, surface: 68, cadastre: 'AB 112' });
  assert.deepStrictEqual(r.prix, { prix: 200000, prixFAI: 210000, honoraires: 10000, chargeHonoraires: 'acquereur' });
  assert.strictEqual(r.financement.pret, true);
  assert.strictEqual(r.financement.montantPret, 150000);
  assert.strictEqual(r.financement.depotGarantie, 5000);
  assert.deepStrictEqual(r.notaires, [
    { nom: 'Maître DURAND', ville: '', pour: 'M. et Mme MARTIN' },
    { nom: 'Maître PETIT', ville: 'CAVAILLON', pour: 'la SCI LES OLIVIERS' },
  ]);
  assert.strictEqual(r.agence.nom, 'Agence du Palais');
  assert.strictEqual(r.agence.email, 'contact@agence-exemple.fr');
  assert.strictEqual(r.agence.contact, 'Julie LEROY');
  assert.strictEqual(r.agence.mandat, '452 du 02/05/2026');
  assert.deepStrictEqual(r.piecesJointes.map((x) => x.piece), ['identite', 'diagnostics']);
});

test('Adresse et montants', () => {
  assert.deepStrictEqual(X.adresse('12 rue des Lilas 84 100 Orange'), { adresse: '12 rue des Lilas', codePostal: '84100', commune: 'Orange' });
  assert.strictEqual(X.montant('282.000,50 euros'), 282000.5);
});

test('Report dans un dossier : champs vides seulement, pas de doublon, pièces reçues', () => {
  const m = X.lireEml(EML);
  const r = X.extraire({ sujet: m.sujet, expediteur: m.expediteur, corps: m.corps, piecesJointes: m.piecesJointes });
  const d = { vendeurs: [{ id: 'v1', nom: 'Martin Paul', telephone: '04 90 00 00 00' }], acquereurs: [], bien: { commune: 'AVIGNON' }, pieces: {} };
  const tous = { parties: true, bien: true, prix: true, financement: true, agence: true, notaires: true, pieces: true };
  X.fusionner(d, r, tous, { aujourdhui: '2026-10-14', source: 'mail.eml' });
  assert.strictEqual(d.vendeurs.length, 2, 'MARTIN Paul déjà présent');
  assert.strictEqual(d.vendeurs[0].telephone, '04 90 00 00 00');
  assert.strictEqual(d.acquereurs[0].nom, 'SCI LES OLIVIERS');
  assert.strictEqual(d.bien.commune, 'AVIGNON', 'champ déjà rempli conservé');
  assert.strictEqual(d.bien.cadastre, 'AB 112');
  assert.strictEqual(d.prix.prix, 200000);
  assert.strictEqual(d.financement.pret, true);
  assert.strictEqual(d.notaires.length, 2);
  assert.strictEqual(d.pieces.identite.statut, 'recue');
  assert.strictEqual(d.pieces.diagnostics.statut, 'recue');
  assert.strictEqual(d.documents.length, 3);
  X.fusionner(d, r, tous, { aujourdhui: '2026-10-15' });
  assert.strictEqual(d.notaires.length, 2, 'pas de doublon');
  assert.strictEqual(d.pieces.identite.date, '2026-10-14', 'déjà reçue');
});

test('Mail transféré, sans civilité ni libellés (données fictives)', () => {
  const corps = [
    'De : Julie LEROY <julie.leroy@example.fr>',
    'Envoyé : mardi 29 septembre 2026 10:54',
    'À : Étude <etude@84000.notaires.fr>',
    'Objet : VENTE DUPONT / ROUX',
    '',
    'Bonjour Maître,',
    '',
    "Dans le cadre de la vente immobilière de l'appartement situé :",
    '',
    'Résidence Les Pins - avenue des Pins - Bât 2, 3ème étage - 84100 Orange',
    '',
    '- Acheteurs :',
    '',
    'Claire ROUX',
    '06 00 000 00 01',
    'claire.roux@example.fr <mailto:claire.roux@example.fr>',
    'Domiciliée au : 6, impasse des Roses - 84100 Orange',
    '',
    '- Vendeurs :',
    '',
    'Marc DUPONT',
    '06 00 00 00 02',
    'Domicilié au : 3 rue Haute - 84000 Avignon',
    '',
    '- Prix de vente : 99 000 €',
    '- Prix net vendeur : 93 000 €',
    "- Frais d'agence : 6 000 €",
    '- Dépôt de garantie : 4 000 €',
    '',
    'Il manque au dossier :',
    '- Le rapport de diagnostics,',
    '- Le contrôle assainissement.',
    '',
    'Travaux de moins de 10 ans : menuiseries',
    '',
    'Respectueusement,',
    '',
    'Julie LEROY',
    '',
    '--',
    'Agence des Remparts',
    '06 11 22 33 44',
  ].join('\n');
  const r = X.extraire({ sujet: 'TR: VENTE DUPONT / ROUX', expediteur: 'Étude <etude@84000.notaires.fr>', corps, piecesJointes: [] });
  assert.deepStrictEqual(r.acquereurs.map((x) => [x.nom, x.telephone, x.email, x.commune]), [['ROUX Claire', '06 00 000 00 01', 'claire.roux@example.fr', 'Orange']]);
  assert.deepStrictEqual(r.vendeurs.map((x) => [x.nom, x.commune]), [['DUPONT Marc', 'Avignon']]);
  assert.deepStrictEqual({ cp: r.bien.codePostal, type: r.bien.type, copro: r.bien.copro, travaux: r.bien.travauxRecents }, { cp: '84100', type: 'appartement', copro: true, travaux: true });
  assert.strictEqual(r.bien.adresse, 'Résidence Les Pins - avenue des Pins - Bât 2, 3ème étage');
  assert.deepStrictEqual(r.prix, { prix: 93000, prixFAI: 99000, honoraires: 6000 });
  assert.strictEqual(r.financement.depotGarantie, 4000);
  assert.deepStrictEqual(r.agence, { contact: 'Julie LEROY', telephone: '06 11 22 33 44', email: 'julie.leroy@example.fr', nom: 'Agence des Remparts' });
  assert.deepStrictEqual(r.aSuivre, ['Le rapport de diagnostics,', 'Le contrôle assainissement.']);
  const d = { notes: '' };
  X.fusionner(d, r, { parties: true, bien: true, pieces: true }, { source: 'mail.msg' });
  assert.ok(d.notes.startsWith('À suivre (mail.msg) :\n- Le rapport de diagnostics,'));
  assert.strictEqual(d.bien.travauxRecents, true);
});
