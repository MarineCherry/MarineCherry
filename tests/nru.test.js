/*
 * Notes de renseignements d'urbanisme : lecture des notes Courbi et Nota Risques Urba (données fictives).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const N = require('../assets/js/apps/nru/engine.js');

const it = (str, x, y, w) => ({ str, x, y, w: w || str.length * 4 });
// Note COURBI fictive : libellés centrés à gauche, réponses à droite, servitudes en tableau code / description.
const COURBI = [{ num: 1, items: [
  it('Cabinet COURBI', 233, 795, 130),
  it('NOTE DE RENSEIGNEMENTS D’URBANISME N° 1234-5678', 150, 724, 307),
  it('V/Réf : Vente DUPONT / MARTIN', 176, 684, 200),
  it('1 - TERRAIN', 274, 621, 47),
  it('Références cadastrales', 51, 608, 73), it('AB 12', 346, 608, 24),
  it('Bâti', 82, 596, 12), it('Oui', 352, 596, 11),
  it('2 - PRÉEMPTION', 269, 570, 56),
  it('Droit de préemption urbain (DPU)', 36, 558, 104), it('Oui / simple', 336, 558, 42),
  it('Autre', 80, 546, 17), it('-', 356, 546, 2),
  it('4 – SERVITUDES D’UTILITÉ PUBLIQUE', 232, 500, 130),
  it('Codification', 31, 488, 36), it('Description', 301, 488, 35),
  it('AC 1', 42, 476, 15), it('Servitudes de protection des monuments historiques', 73, 476, 200),
  it('5 – RISQUES', 276, 440, 43),
  it('Exposition au retrait gonflement des argiles', 35, 428, 134), it('1 – Exposition faible', 334, 428, 74),
  it('Plan de prévention des risques (PPR)', 44, 416, 117), it('Oui / PPR inondation du Rhône (approuvé), zone bleue', 225, 416, 292),
  it('6 - CONTRAINTES', 267, 380, 61),
  it('Obligation de contrôle des', 62, 368, 81), it('branchements d’assainissement', 52, 359, 100), it('Non', 366, 363.5, 13),
  it('Réponse délivrée par le CABINET COURBI', 150, 300, 294),
  it('Fait à Orange, le lundi 2 novembre 2026.', 417, 280, 136),
] }];

test('NRU Courbi : rubriques, libellés de la trame, servitudes et sous-tirets', () => {
  assert.strictEqual(N.detecter(COURBI), 'courbi');
  const lu = N.lire(COURBI);
  assert.strictEqual(lu.numero, '1234-5678');
  assert.strictEqual(lu.reference, 'Vente DUPONT / MARTIN');
  const t = N.texte(N.blocs(lu)).split('\n');
  assert.deepStrictEqual(t, [
    '« 1- TERRAIN', '• Références cadastrales : AB 12', '• Bâti : Oui', '',
    '2- PREEMPTION', '• Droit de préemption urbain (DPU) : Oui / simple', '• Autre :', '',
    '4- SERVITUDES D’UTILITE PUBLIQUE', 'AC 1 : Servitudes de protection des monuments historiques', '',
    '5- RISQUES', '• Retrait gonflement des argiles : 1 – Exposition faible', '• Plan de prévention des risques (PPR) :',
    '    - PPR inondation du Rhône (approuvé)', '    - Zone bleue', '',
    '6- CONTRAINTES', '• Obligation contrôle des branchements d’assainissement : Non »',
  ]);
});

// Synthèse Nota Risques Urba fictive : rubriques à gauche (x < 200), texte à droite.
const NOTA = [{ num: 3, items: [
  it('Dossier n° 2026-11-02-000001', 445, 795), it('Réalisé le 02/11/2026', 482, 784),
  it('SYNTHÈSE', 57, 689, 45),
  it('Intégrez la synthèse de votre Note de Renseignements d\'Urbanisme directement sur l\'acte en effectuant un COPIER / COLLER.', 57, 656, 383),
  it('DISPOSITIONS D\'URBANISME', 40, 615.8), it('L\'unité foncière est concernée par :', 230, 624.8),
  it('- Plan Local d\'Urbanisme approuvé le 01/02/2010,', 230, 615.8), it('modifié le 03/04/2020.', 400, 615.8),
  it('ZONAGE', 40, 573.2), it('L\'unité foncière est dans la Zone UA', 230, 573.8),
  it('SERVITUDES D\'UTILITÉ PUBLIQUE', 40, 483.7), it('L\'unité foncière est concernée par les servitudes d\'utilité publique :', 230, 501.7),
  it('- AC1 - Protection des abords des monuments historiques', 230, 492.7), it('(AC1)', 230, 483.7),
  it('RISQUES NATURELS, MINIERS ET', 40, 315.1), it('TECHNOLOGIQUES', 40, 304.3),
  it('La commune est concernée par les risques suivants :', 230, 323.5), it('- Inondation par crue Approuvé', 230, 314.5),
  it('- Taxe d\'aménagement', 230, 305.5), it(': part communale : 5%', 302, 305.5),
  it('Tous droits réservés. Les marques commerciales mentionnées appartiennent à la société MEDIA IMMO.', 28, 38),
] }];

test('NRU Nota Risques Urba : synthèse à deux colonnes mise en forme selon la trame', () => {
  assert.strictEqual(N.detecter(NOTA), 'nota');
  const lu = N.lire(NOTA);
  assert.strictEqual(lu.dossier, '2026-11-02-000001');
  assert.deepStrictEqual(N.texte(N.blocs(lu)).split('\n'), [
    '«',
    '• DISPOSITIONS D\'URBANISME : ', 'L\'unité foncière est concernée par : - Plan Local d\'Urbanisme approuvé le 01/02/2010, modifié le 03/04/2020.', '',
    '• ZONAGE : L\'unité foncière est dans la Zone UA', '',
    '• SERVITUDES D\'UTILITÉ PUBLIQUE : ', 'L\'unité foncière est concernée par les servitudes d\'utilité publique :', '- AC1 - Protection des abords des monuments historiques (AC1)', '',
    '• RISQUES NATURELS, MINIERS ET TECHNOLOGIQUES : ', 'La commune est concernée par les risques suivants :', '- Inondation par crue Approuvé', '- Taxe d\'aménagement : part communale : 5% »',
  ]);
});

test('NRU : note non reconnue', () => {
  const lu = N.lire([{ num: 1, items: [it('Un autre document', 50, 700)] }]);
  assert.strictEqual(lu.type, null);
  assert.deepStrictEqual(N.blocs(lu), []);
});
