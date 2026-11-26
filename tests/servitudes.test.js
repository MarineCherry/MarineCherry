/*
 * Plan de servitudes : lecture des clauses et tracé des assiettes (parcelles fictives).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../assets/js/apps/servitudes/engine.js');

const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label} : obtenu ${a}, attendu ${b}`);

test('servitudes : largeurs écrites en lettres ou en chiffres', () => {
  assert.deepStrictEqual(E.longueurs('d\'une largeur de cinq mètres').map((x) => x.valeur), [5]);
  assert.deepStrictEqual(E.longueurs('de sept mètre vingt centimètres de largeur').map((x) => x.valeur), [7.2]);
  assert.deepStrictEqual(E.longueurs('à une distance de 7,20 mètres environ').map((x) => x.valeur), [7.2]);
  assert.deepStrictEqual(E.longueurs('deux mètres cinquante de chaque côté').map((x) => x.valeur), [2.5]);
  assert.deepStrictEqual(E.lireRefs('AR 186 - 187 et AO 1'), ['AR186', 'AR187', 'AO1']);
  assert.strictEqual(E.lireRef('ar n° 0188'), 'AR188');
});

const TEXTE = `1)	Aux termes d'un acte pris par Monsieur Le Préfet de VAUCLUSE, le 5 avril 1984, il a été établi une convention de servitude pour l'établissement de câbles souterrains de télécommunications.

2)	Aux termes de l'acte reçu par Maître Paul MARTIN, Notaire à ORANGE, en date du 20 janvier 1999, il a été stipulé :
« Fonds servant : ZA 1
Fonds dominant : ZA 3
Il est créé une servitude de passage pour piétons et véhicules, d'une largeur de cinq mètres le long de la limite NORD de la parcelle cadastrée sous le N° 1, jusqu'à la parcelle cadastrée sous le N° 3. »

3)	Aux termes de l'acte reçu par Maître Paul MARTIN, Notaire à ORANGE, en date du 3 février 1999 :
L'assiette de la servitude de passage pour l'entretien des canalisations s'exercera sur une bande de terrain :
Concernant l'immeuble section ZA n°2 (fonds servant) :
de sept mètre vingt centimètres de largeur prise à l'angle Nord Est dudit fonds pour arriver à cinq mètres de largeur à l'angle Nord Ouest.
Fonds servant : ZA 2
Fonds dominant : ZA 3`;

test('servitudes : lecture des clauses numérotées', () => {
  const l = E.analyser(TEXTE);
  assert.strictEqual(l.length, 3);
  assert.deepStrictEqual([l[0].nature, l[0].localisee], ['reseau', false]);
  assert.strictEqual(l[0].acte, 'acte de M. le Préfet de VAUCLUSE du 5 avril 1984');
  assert.deepStrictEqual([l[1].nature, l[1].servants, l[1].dominants, l[1].acte], ['passage', ['ZA1'], ['ZA3'], 'acte de Me Paul MARTIN du 20 janvier 1999']);
  assert.deepStrictEqual(l[1].assiettes.map((a) => [a.parcelle, a.cote, a.largeur, a.jusqua]), [['ZA1', 'N', 5, 'ZA3']]);
  assert.deepStrictEqual(l[2].assiettes.map((a) => [a.parcelle, a.cote, a.largeur, a.largeurFin]), [['ZA2', 'N', 7.2, 5]]);
  assert.match(E.legende(l[1]), /^Servitude de passage sur ZA 1 au profit de ZA 3, largeur 5 m \(acte de Me Paul MARTIN/);
});

// Trois parcelles fictives en mètres (projection autour de 0,0) : ZA 1 grand terrain au sud, ZA 2 et ZA 3 au-dessus.
const proj = E.projection(0, 0);
const deg = (x, y) => proj.depuis([x, y]);
const carre = (x1, y1, x2, y2) => [[deg(x1, y1), deg(x2, y1), deg(x2, y2), deg(x1, y2), deg(x1, y1)]];
const GEO = { type: 'FeatureCollection', features: [
  { properties: { section: 'ZA', numero: '0001' }, geometry: { type: 'Polygon', coordinates: carre(0, 0, 100, 40) } },
  { properties: { section: 'ZA', numero: '0002' }, geometry: { type: 'Polygon', coordinates: carre(50, 40, 100, 80) } },
  { properties: { section: 'ZA', numero: '0003' }, geometry: { type: 'Polygon', coordinates: carre(20, 40, 50, 80) } },
  { properties: { section: 'ZA', numero: '0004' }, geometry: { type: 'Polygon', coordinates: carre(0, 80, 100, 100) } },
] };

test('servitudes : bande le long de la limite Nord, arrêtée à une parcelle, largeur variable', () => {
  const idx = {};
  E.parcelles(GEO, proj).forEach((p) => { idx[p.ref] = p; });
  // Passage sur ZA 1 le long de sa limite Nord, depuis l'est jusqu'à ZA 3 (x = 50).
  const t = E.tracerAssiette({ parcelle: 'ZA1', cote: 'N', largeur: 5, jusqua: 'ZA3' }, idx);
  const xs = t.polygone.map((p) => p[0]), ys = t.polygone.map((p) => p[1]);
  near(Math.min(...xs), 50, 0.05, 'arrêt à ZA 3'); near(Math.max(...xs), 100, 0.05, 'départ à l\'est');
  near(Math.min(...ys), 35, 0.05, 'largeur 5 m'); near(Math.max(...ys), 40, 0.05, 'limite Nord');
  // ZA 2 : 7,20 m à l'est, 5 m à l'ouest, le long de sa limite Nord (avec ZA 4).
  const b = E.tracerAssiette({ parcelle: 'ZA2', cote: 'N', largeur: 7.2, largeurFin: 5 }, idx);
  const bas = b.polygone.slice(b.polygone.length / 2);
  near(Math.min(...bas.filter((p) => p[0] > 99).map((p) => p[1])), 72.8, 0.05, '7,20 m côté est');
  near(Math.min(...bas.filter((p) => p[0] < 51).map((p) => p[1])), 75, 0.05, '5 m côté ouest');
  // Limite qui ne longe aucune parcelle (voie publique) : écartée par défaut.
  assert.ok(E.tracerAssiette({ parcelle: 'ZA2', cote: 'E', largeur: 3 }, idx).erreur);
  assert.ok(E.tracerAssiette({ parcelle: 'ZA2', cote: 'E', largeur: 3, voirie: true }, idx).polygone);
});
