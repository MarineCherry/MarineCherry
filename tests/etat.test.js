/*
 * Tests de la lecture des états hypothécaires (état-réponse ANF).
 * L'état est reconstitué ici avec des données fictives, en reproduisant la mise en page réelle
 * (positions des libellés et des colonnes) : aucun document client n'est conservé dans le projet.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ET = require('../assets/js/apps/origine/etat.js');
const E = require('../assets/js/apps/origine/engine.js');

// Ligne de texte : [[x, texte], …] à l'ordonnée y.
const L = (y, cells) => cells.map(([x, str]) => ({ x, y, str }));
const pied = (n, total, droite) => L(21, [[32, 'ANF_2026_00000001'], [397, n + ' sur ' + total]].concat(droite ? [[700, droite]] : []));

function blocPublication(nature, page, o) {
  const items = [
    L(559, [[32, 'Relevé des formalités - Publication']]),
    L(531, [[330, nature], [713, 'PAGE ' + page + ' À PAGE ' + page]]),
    L(507, [[40, 'Rédacteur :'], [87, 'NOT'], [107, o.notaire], [429, 'Date de dépôt :'], [491, o.depot]]),
    L(494, [[40, 'Commune :'], [88, o.commune], [429, "Référence d'enliassement :"], [538, o.ref]]),
    L(480, [[40, "Date de l'acte :"], [100, o.acte], [429, 'Code sages :'], [483, '6904P01'], [522, '-'], [526, 'LYON 1']]),
    L(443, [[40, 'Disposition n° 1 / UD1 :'], [133, nature]]),
    L(424, [[40, 'Disposant, Donateur'], [507, 'Date de naissance']]),
  ];
  let y = 405;
  o.disposants.forEach(([n, nom, d]) => { items.push(L(y, [[38, String(n)], [56, nom], [507, d]])); y -= 19; });
  items.push(L(y - 8, [[40, 'Bénéficiaire, Donataire'], [507, 'Date de naissance']])); y -= 27;
  o.beneficiaires.forEach(([n, nom, d]) => { items.push(L(y, [[38, String(n)], [56, nom], [507, d]])); y -= 19; });
  items.push(L(y - 8, [[40, 'Immeuble(s)'], [616, 'Volume'], [717, 'Lot']])); y -= 27;
  o.immeubles.forEach(([commune, des, lots]) => {
    items.push(L(y, [[40, 'Bénéficiaire :'], [94, '2 - Toute propriété'], [274, commune], [507, des], [616, '-']].concat(lots.length ? [] : [[717, '-']])));
    lots.forEach((l) => { y -= 10; items.push(L(y, [[717, l]])); });
    y -= 19;
  });
  items.push(L(y, [[40, 'Prix/évaluation :'], [107, o.prix]])); y -= 30;
  if (o.complement) items.push(L(y, [[40, 'Complément :'], [99, o.complement]]));
  items.push(pied(page, 6));
  return { num: page, items: items.flat() };
}

function etatFictif() {
  const pages = [];
  pages.push({ num: 1, items: [L(560, [[30, 'Personne issue de la demande -'], [209, 'formalités du flux']]),
    L(531, [[38, 'Civilité'], [77, 'Nom'], [202, 'Premier prénom'], [296, 'Deuxième prénom'], [390, 'Date de naissance'], [492, 'Lieu de naissance'], [632, 'Formalités']]),
    L(507, [[38, 'MME'], [77, 'MARTIN'], [202, 'SOPHIE'], [296, 'ANNE'], [390, '12/03/1975'], [492, 'GRENOBLE'], [632, 'Oui']]),
    L(462, [[30, 'Immeuble issu de la demande -'], [205, 'formalités du flux']]),
    L(432, [[38, 'Code - Commune'], [296, 'Préfixe'], [343, 'Désignation cadastrale'], [468, 'Volume'], [546, 'Lot'], [632, 'Formalités']]),
    L(407, [[38, '23 - LYON'], [296, '-'], [343, 'AB 12'], [468, '-'], [632, 'Oui']]),
    L(397, [[546, '5']]),
    L(371, [[339, 'Référence dossier :'], [433, '2026000001 / Vente MARTIN']]),
    pied(1, 6)].flat() });
  pages.push(blocPublication('VENTE', 2, {
    notaire: 'Paul LEGRAND', commune: 'LYON', depot: '20/05/2021', ref: '2021 P 4567', acte: '12/05/2021',
    disposants: [[1, 'DURAND', '01/06/1950']], beneficiaires: [[2, 'MARTIN', '12/03/1975']],
    immeubles: [['LYON', 'AB 12', ['5', '7 à 8']]], prix: '250 000,00 EUR',
  }));
  pages.push(blocPublication('VENTE', 3, {
    notaire: 'Paul LEGRAND', commune: 'LYON', depot: '10/02/2010', ref: '2010 P 900', acte: '01/02/2010',
    disposants: [[1, 'SCI LES TILLEULS', '512 345 678']], beneficiaires: [[2, 'MARTIN', '12/03/1975']],
    immeubles: [['LYON', 'CD 8', []]], prix: '90 000,00 EUR',
  }));
  pages.push(blocPublication('ATTESTATION APRES DECES', 4, {
    notaire: 'Claire BLANC', commune: 'VILLEURBANNE', depot: '15/09/2005', ref: '2005 P 3210', acte: '02/09/2005',
    disposants: [[1, 'DURAND', '04/04/1920']], beneficiaires: [[2, 'DURAND', '01/06/1950']],
    immeubles: [['LYON', 'AB 12', ['5']]], prix: '80 000,00 EUR', complement: 'Disposant décédé le 01/02/2004 laissant le bénéficiaire (n° 2) pour la totalité.',
  }));
  pages.push({ num: 5, items: [
    L(559, [[32, 'Relevé des formalités - Charge']]),
    L(531, [[300, 'HYPOTHEQUE CONVENTIONNELLE'], [713, 'PAGE 5 À PAGE 5']]),
    L(507, [[40, 'Rédacteur :'], [87, 'NOT'], [107, 'Paul LEGRAND'], [429, 'Date de dépôt :'], [491, '25/05/2021']]),
    L(494, [[40, 'Commune :'], [88, 'LYON'], [429, "Référence d'enliassement :"], [538, '2021 V 1234']]),
    L(480, [[40, "Date de l'acte :"], [100, '12/05/2021']]),
    L(424, [[40, 'Créancier'], [507, "Numéro d'identité"]]),
    L(405, [[38, '-'], [56, 'BANQUE FICTIVE'], [507, '111 222 333']]),
    L(378, [[40, 'Immeuble(s)'], [616, 'Volume'], [717, 'Lot']]),
    L(359, [[40, 'Débiteur :'], [94, '-'], [274, 'LYON'], [507, 'AB 12'], [616, '-']]),
    L(349, [[717, '5']]),
    L(330, [[40, 'Montant principal'], [113, ':'], [117, '200 000,00 EUR']]),
    L(300, [[40, 'Complément :'], [99, 'Radiation totale du 10/01/2024.']]),
    pied(5, 6)].flat() });
  pages.push({ num: 6, items: [L(580, [[700, '6904P01 2005000000 R']]), pied(6, 6, 'Copie de fiche Stock')].flat() });
  return pages;
}

test('Analyse de l\'état : en-tête, demande, formalités, fiches scannées', () => {
  const r = ET.analyser(etatFictif());
  assert.strictEqual(r.entete.reference, '2026000001 / Vente MARTIN');
  assert.deepStrictEqual(r.pagesScannees, [6]);
  assert.strictEqual(r.demande.personnes[0].prenoms, 'Sophie Anne');
  assert.strictEqual(r.demande.personnes[0].civilite, 'Mme');
  assert.deepStrictEqual(r.demande.immeubles[0], { commune: 'LYON', designations: ['AB 12'], lots: ['5'] });
  assert.strictEqual(r.formalites.length, 4);
  const v = r.formalites[0];
  assert.strictEqual(v.type, 'vente');
  assert.strictEqual(v.dateActe, '2021-05-12');
  assert.strictEqual(v.dateDepot, '2021-05-20');
  assert.strictEqual(v.reference, '2021 P 4567');
  assert.strictEqual(v.prix, 250000);
  assert.deepStrictEqual(v.immeubles[0].lots, [5, 7, 8]);
  assert.strictEqual(r.formalites[1].disposants[0].morale, true);
  assert.strictEqual(r.formalites[1].disposants[0].siren, '512345678');
  assert.strictEqual(r.formalites[2].type, 'succession');
  const h = r.formalites[3];
  assert.strictEqual(h.section, 'Charge');
  assert.strictEqual(h.montant, 200000);
  assert.strictEqual(h.radiee, true);
});

test('Sélection par parcelle et lot', () => {
  const r = ET.analyser(etatFictif());
  const pub = (c) => r.formalites.filter((f) => f.section === 'Publication' && ET.concerne(f, c)).map((f) => f.dateActe);
  assert.deepStrictEqual(pub({ parcelle: 'AB 12', lot: '5' }), ['2021-05-12', '2005-09-02']);
  assert.deepStrictEqual(pub({ parcelle: 'AB 12', lot: '8' }), ['2021-05-12']);
  assert.deepStrictEqual(pub({ parcelle: 'CD 8' }), ['2010-02-01']);
  assert.deepStrictEqual(pub({ commune: 'Villeurbanne', parcelle: 'AB 12' }), []);
  assert.strictEqual(ET.charges(r, { parcelle: 'AB 12', lot: '5' })[0].creancier, 'BANQUE FICTIVE');
  assert.deepStrictEqual(ET.designation('L1à2'), { section: 'L', numeros: [1, 2], texte: 'L1à2' });
});

test('Conversion en origines puis rédaction', () => {
  const r = ET.analyser(etatFictif());
  const retenues = r.formalites.filter((f) => f.section === 'Publication' && ET.concerne(f, { parcelle: 'AB 12', lot: '5' }));
  const res = ET.versDossier(r, retenues, { personne: E.nouvellePersonne, acte: E.nouvelActe }, []);
  assert.strictEqual(res.actes.length, 2);
  assert.strictEqual(res.personnes.length, 3); // MARTIN, DURAND (1950), DURAND (1920) — sans doublon
  const [vente, succ] = res.actes;
  assert.strictEqual(vente.type, 'vente');
  assert.deepStrictEqual(vente.notaire, { nom: 'Paul LEGRAND', ville: 'LYON' });
  assert.deepStrictEqual(vente.publication, { service: 'LYON 1', date: '2021-05-20', volume: '2021P', numero: '4567' });
  assert.strictEqual(vente.prix, 250000);
  assert.strictEqual(succ.type, 'succession');
  assert.strictEqual(vente.cedants[0], succ.acquereurs[0]);
  const martin = res.personnes.find((p) => p.nom === 'MARTIN');
  assert.strictEqual(martin.prenoms, 'Sophie Anne');
  const defunt = res.personnes.find((p) => p.naissanceDate === '1920-04-04');
  assert.strictEqual(defunt.decesDate, '2004-02-01');
  const texte = E.texte(E.rediger({ personnes: res.personnes, actes: res.actes }, { aujourdhui: '2026-10-13' }).blocs);
  assert.match(texte, /appartient au VENDEUR, au moyen de l'acquisition qu'il en a faite de Monsieur/);
  assert.match(texte, /publié au fichier immobilier de LYON 1, le 20 mai 2021, volume 2021P, n° 4567/);
  assert.match(texte, /pour l'avoir recueilli dans la succession de Monsieur/);
});

test('Société : désignation complète et accord au féminin', () => {
  const d = E.exemple();
  d.personnes.push(E.nouvellePersonne({ id: 'sci', morale: true, nom: 'SCI les Tilleuls', domicile: 'LYON (69002)', siren: '512345678', profession: 'société civile immobilière' }));
  d.actes[0].cedants = ['sci'];
  const t = E.texte(E.rediger(d, { aujourdhui: '2026-10-13' }).blocs);
  assert.match(t, /de la société dénommée SCI LES TILLEULS, société civile immobilière, dont le siège est à LYON \(69002\), identifiée au SIREN sous le numéro 512 345 678,/);
  assert.match(t, /La venderesse a, notamment, déclaré/);
});
