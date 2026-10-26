/*
 * Courriers de succession : lecture de l'acte de décès, rédaction, fichier Word, papier à en-tête,
 * annuaire et carnet d'adresses (données fictives).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const X = require('../assets/js/apps/courriers/acte.js');
const E = require('../assets/js/apps/courriers/engine.js');
const Z = require('../assets/js/core/zip.js');

const COPIE = [
  'ACTE DE DÉCÈS N° 245',
  'Le seize juin deux mille vingt-deux, à quatorze heures trente minutes, est décédé en son domicile, 12 rue des Lilas, Orange (Vaucluse),',
  'Paul Henri MARTIN, né à Fos (Haute-Garonne) le six juin mille neuf cent quarante-quatre, retraité, fils de Louis MARTIN et de Jeanne DURAND,',
  'époux décédés. Époux de Claire Marie ROUX.',
  'Dressé le dix-sept juin deux mille vingt-deux, à dix heures, sur la déclaration de Luc MARTIN.',
].join('\n');

test('Acte de décès en copie intégrale (dates en lettres)', () => {
  const r = X.analyser(COPIE);
  assert.deepStrictEqual([r.civilite, r.prenoms, r.nom], ['M', 'Paul Henri', 'MARTIN']);
  assert.deepStrictEqual(r.naissance, { date: '1944-06-06', commune: 'Fos', departement: '31' });
  assert.strictEqual(r.deces.date, '2022-06-16');
  assert.strictEqual(r.deces.commune, 'Orange');
  assert.deepStrictEqual([r.domicile.adresse, r.domicile.commune, r.domicile.departement], ['12 rue des Lilas', 'Orange', '84']);
  assert.strictEqual(r.situation, 'marie');
  assert.deepStrictEqual(r.conjoint, { civilite: 'Mme', prenoms: 'Claire Marie', nom: 'ROUX' });
  assert.deepStrictEqual(r.manquants, []);
});

test('Extrait d\'acte de décès (libellés) et décès hors du domicile', () => {
  const r = X.analyser(['EXTRAIT D\'ACTE DE DÉCÈS', 'Nom : DUPONT', 'Prénoms : Jeanne Paule', 'Date du décès : 19 mai 2026', 'Lieu du décès : Avignon (Vaucluse)',
    'Date et lieu de naissance : 3 avril 1936 à Montfaucon (Gard)', 'Domicile : 29, rue de la Poste, Montfaucon (Gard)', 'Veuve de Jean BERNARD'].join('\n'));
  assert.deepStrictEqual([r.civilite, r.prenoms, r.nom], ['Mme', 'Jeanne Paule', 'DUPONT']);
  assert.deepStrictEqual([r.deces.date, r.deces.commune, r.naissance.date, r.naissance.departement], ['2026-05-19', 'Avignon', '1936-04-03', '30']);
  assert.deepStrictEqual([r.domicile.adresse, r.domicile.commune], ['29, rue de la Poste', 'Montfaucon']);
  assert.deepStrictEqual([r.situation, r.conjoint.prenoms, r.conjoint.nom], ['veuf', 'Jean', 'BERNARD']);
  const h = X.analyser('Le 2 mars 2025, à 8 heures, est décédée au Centre hospitalier, 40 avenue de Lattre, Carpentras (Vaucluse), Lucie ROBERT, née le 1er février 1940 à Pertuis (Vaucluse), sans profession, domiciliée à Pertuis (Vaucluse), 5 chemin des Vignes, célibataire.');
  assert.deepStrictEqual([h.deces.commune, h.domicile.commune, h.domicile.adresse, h.naissance.date, h.situation], ['Carpentras', 'Pertuis', '5 chemin des Vignes', '1940-02-01', 'celibataire']);
});

test('Acte scanné (sans texte) : tout est à compléter', () => {
  const r = X.analyser('  ');
  assert.ok(r.vide);
  assert.strictEqual(r.manquants.length, 5);
});

test('Nombres en lettres', () => {
  assert.strictEqual(X.nombreEnLettres('mille neuf cent quatre-vingt-dix-neuf'.split(/[\s-]+/)), 1999);
  assert.strictEqual(X.nombreEnLettres('deux mille vingt-deux'.split(/[\s-]+/)), 2022);
  assert.strictEqual(X.nombreEnLettres(['soixante', 'et', 'onze']), 71);
});

const DOSSIER = {
  defunt: { civilite: 'M', prenoms: 'Paul Henri', nom: 'Martin', naissance: { date: '1944-06-06', commune: 'Fos', codePostal: '31440' }, deces: { date: '2022-06-16', commune: 'Orange', codePostal: '84100' }, domicile: { adresse: '12 rue des Lilas', commune: 'Orange', codePostal: '84100' } },
  situation: 'marie', regime: 'communauté de biens réduite aux acquêts', conjoint: { civilite: 'Mme', prenoms: 'Claire', nom: 'Roux' },
  nosRef: 'Succession MARTIN - NN', clerc: { nom: 'Julie LEROY', email: 'julie@example.fr' }, dateCourrier: '2026-10-26', signataire: 'Maître Anne EXEMPLE',
};
const modele = (id) => E.MODELES.find((m) => m.id === id);
const texte = (lignes) => lignes.map((l) => l.map((s) => s.t).join('')).join('\n');

test('Rédaction : bloc « SUCCESSION DE », comptes, acompte en lettres', () => {
  const dest = { type: 'banque', nom: 'Banque Exemple', lignes: 'BANQUE EXEMPLE\nService successions\n75000 PARIS', comptes: '0001\n0002', montant: 1000 };
  const c = E.rediger(DOSSIER, dest, modele('banque-deblocage'), { ville: 'Orange' });
  assert.strictEqual(c.lieuDate, 'ORANGE, le 26 octobre 2026');
  assert.deepStrictEqual(c.destinataire, ['BANQUE EXEMPLE', 'Service successions', '75000 PARIS']);
  assert.strictEqual(texte(c.succession), ['SUCCESSION DE :', 'Monsieur Paul Henri MARTIN', 'Domicile : 12 rue des Lilas à ORANGE (84100)', 'Époux de Madame Claire ROUX,',
    'Régime matrimonial : communauté de biens réduite aux acquêts', 'Né à FOS (31440), le 6 juin 1944.', 'Décédé à ORANGE (84100), le 16 juin 2022.'].join('\n'));
  assert.strictEqual(texte(c.avant), 'NUMÉROS DE COMPTES : 0001 – 0002');
  assert.ok(texte(c.corps).includes('comptes individuels du défunt (dont les numéros sont cités plus haut)'));
  const a = E.rediger(DOSSIER, dest, modele('banque-acompte'), {});
  assert.ok(texte(a.corps).replace(/\u00a0/g, ' ').includes('un acompte d\'un montant de MILLE EUROS (1 000,00 €).'));
  // Défunte : accords au féminin ; donnée manquante signalée.
  const f = E.rediger(Object.assign({}, DOSSIER, { defunt: Object.assign({}, DOSSIER.defunt, { civilite: 'Mme' }) }), { type: 'banque' }, modele('banque-acompte'), {});
  assert.ok(texte(f.succession).includes('Épouse de Madame Claire ROUX,'));
  assert.ok(texte(f.succession).includes('Décédée à ORANGE'));
  assert.deepStrictEqual(f.manquants, ['montant']);
});

test('Modèles : conditions, accords, gras et texte modifié par l\'étude', () => {
  const l = E.interpreter('A {si x}avec {x}{sinon}sans{fin} — {accord : il | elle} **gras**', { x: null }, true);
  assert.deepStrictEqual(l, [[{ t: 'A sans — elle ' }, { t: 'gras', b: true }]]);
  const perso = E.modeles({ 'tresor-bordereau': { appel: 'Madame, Monsieur,', texte: 'Texte de l\'étude.' } });
  const m = perso.find((x) => x.id === 'tresor-bordereau');
  assert.ok(m.modifie);
  assert.strictEqual(texte(E.rediger(DOSSIER, { type: 'tresor' }, m, {}).corps), 'Texte de l\'étude.');
});

test('Fichier Word : archive valide, en-tête et mise en page du modèle conservés', async () => {
  const c = E.rediger(DOSSIER, { type: 'departement', lignes: 'CONSEIL DÉPARTEMENTAL\n84000 AVIGNON' }, modele('departement-aide-sociale'), { ville: 'Orange' });
  const fichiers = await Z.lire(E.docx(c, null));
  const doc = Z.texte(fichiers['word/document.xml']);
  assert.ok(doc.includes('CONSEIL DÉPARTEMENTAL') && doc.includes('ATTESTATION DE CRÉANCIER') && doc.includes('<w:br w:type="page"/>'));
  assert.ok(/<w:pgMar w:top="1418"/.test(doc), 'mise en page du paquet conservée');
  assert.ok(doc.trim().endsWith('</w:sectPr></w:body></w:document>'));
});

// Courrier Word fictif d'une étude : en-tête de première page (logo, titre, colonne), données d'un ancien dossier.
function courrierWordFictif() {
  const ancre = (x, y, cx, cy, contenu) => '<wp:anchor><wp:positionH relativeFrom="page"><wp:posOffset>' + x + '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>' + y + '</wp:posOffset></wp:positionV><wp:extent cx="' + cx + '" cy="' + cy + '"/>' + contenu + '</wp:anchor>';
  const boite = (ps) => '<mc:AlternateContent><mc:Choice><wps:txbx><w:txbxContent>' + ps + '</w:txbxContent></wps:txbx></mc:Choice><mc:Fallback><w:txbxContent><w:p><w:r><w:t>doublon</w:t></w:r></w:p></w:txbxContent></mc:Fallback></mc:AlternateContent>';
  const p = (t, b, jc) => '<w:p><w:pPr>' + (jc ? '<w:jc w:val="' + jc + '"/>' : '') + '</w:pPr><w:r><w:rPr>' + (b ? '<w:b/>' : '') + '<w:sz w:val="18"/></w:rPr><w:t>' + t + '</w:t></w:r></w:p>';
  const entete = '<w:hdr>' + ancre(694690, 273685, 1180800, 1065600, '<a:blip r:embed="rId1"/>')
    + ancre(2360930, 452120, 4725670, 984885, boite(p('Anne EXEMPLE', true, 'center') + p('Notaire', false, 'center')))
    + ancre(241300, 1717675, 2008505, 8253095, boite(p('Anne EXEMPLE', true) + p('1, place de la Mairie') + p('84000 AVIGNON')))
    + ancre(2221230, 1610360, 0, 8184515, '<a:prstGeom prst="line"/>') + '</w:hdr>';
  return {
    '[Content_Types].xml': '<Types><Override PartName="/word/document.xml" ContentType="x"/><Override PartName="/customXml/itemProps1.xml" ContentType="y"/><Override PartName="/docProps/custom.xml" ContentType="z"/></Types>',
    '_rels/.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>',
    'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Ancien dossier DURAND</w:t></w:r></w:p><w:p><w:r><w:t>Maître Anne EXEMPLE</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="first" r:id="rId15"/><w:pgMar w:top="2835" w:right="1134" w:bottom="1134" w:left="3686"/><w:titlePg/></w:sectPr></w:body></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId15" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header3.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>',
    'word/header3.xml': entete,
    'word/_rels/header3.xml.rels': '<Relationships><Relationship Id="rId1" Type="image" Target="media/image1.png"/></Relationships>',
    'word/media/image1.png': new Uint8Array([137, 80, 78, 71]),
    'word/settings.xml': '<w:settings><w:docVars><w:docVar w:name="dossier" w:val="DURAND"/></w:docVars></w:settings>',
    'customXml/item1.xml': '<DocumentData>client DURAND</DocumentData>',
    'docProps/custom.xml': '<Properties>DURAND</Properties>',
  };
}

test('Papier à en-tête importé : en-tête reproduit, données de l\'ancien dossier retirées', async () => {
  const brut = Z.ecrire(courrierWordFictif());
  const { papier, paquet } = await E.importerPapier(brut);
  assert.deepStrictEqual(papier.elements.map((e) => e.type), ['image', 'texte', 'texte', 'trait']);
  assert.ok(Math.abs(papier.elements[2].y - 47.7) < 0.1 && Math.abs(papier.marges.gauche - 65) < 0.1);
  assert.deepStrictEqual(papier.elements[1].paragraphes.map((x) => [x.align, x.segments[0].t, x.segments[0].b]), [['center', 'Anne EXEMPLE', true], ['center', 'Notaire', false]]);
  assert.strictEqual(papier.ville, 'AVIGNON');
  assert.strictEqual(papier.signataire, 'Maître Anne EXEMPLE');
  const ent = await E.ouvrirPaquet(paquet);
  assert.ok(!Object.keys(ent).some((k) => /customXml|custom\.xml/.test(k)));
  const tout = Object.keys(ent).map((k) => (/\.(xml|rels)$/.test(k) ? Z.texte(ent[k]) : '')).join('');
  assert.ok(!/DURAND/.test(tout), 'aucune donnée de l\'ancien dossier');
  assert.ok(Z.texte(ent['word/document.xml']).includes('<w:titlePg/>'));
  const doc = Z.texte((await Z.lire(E.docx(E.rediger(DOSSIER, { type: 'tresor', lignes: 'SIP\n84000 AVIGNON' }, modele('tresor-bordereau'), {}), ent)))['word/document.xml']);
  assert.ok(doc.includes('Monsieur le Trésorier Principal') && doc.includes('w:left="3686"'));
});

test('Annuaire de l\'administration et carnet d\'adresses', () => {
  const recs = [
    { nom: 'Mairie d\'Orange', pivot: '[{"type_service_local":"mairie","code_insee_commune":["84087"]}]', adresse: '[]' },
    { nom: 'Service des impôts des particuliers de Carpentras', pivot: '[{"type_service_local":"sip","code_insee_commune":["84031"]}]', adresse: '[]' },
    { nom: 'Service des impôts des particuliers d\'Orange', pivot: '[{"type_service_local":"sip","code_insee_commune":["84087","84019"]}]',
      adresse: '[{"type_adresse":"Adresse","numero_voie":"1 rue X","code_postal":"84100","nom_commune":"Orange"},{"type_adresse":"Adresse postale","numero_voie":"CS 10001","code_postal":"84106","nom_commune":"Orange Cedex"}]',
      adresse_courriel: '["sip.orange@example.fr"]' },
  ];
  const s = E.servicesCompetents(recs, '84087', 'tresor');
  assert.strictEqual(s.length, 2);
  assert.deepStrictEqual(E.adresseService(s[0]), { nom: 'Service des impôts des particuliers d\'Orange', lignes: ['SERVICE DES IMPÔTS DES PARTICULIERS D\'ORANGE', 'CS 10001', '84106 ORANGE CEDEX'], email: 'sip.orange@example.fr' });
  const carnet = [
    { type: 'banque', nom: 'Banque Exemple', departement: '13', lignes: 'Agence Marseille' },
    { type: 'banque', nom: 'Banque Exemple', departement: '84', lignes: 'Agence Avignon' },
    { type: 'banque', nom: 'Autre Banque', departement: '', lignes: 'Siège' },
  ];
  assert.strictEqual(E.suggestion(carnet, 'banque', 'banque exemple', '84').lignes, 'Agence Avignon');
  assert.strictEqual(E.suggestion(carnet, 'banque', 'Autre banque', '84').lignes, 'Siège');
  assert.strictEqual(E.suggestion(carnet, 'mutuelle', 'X', '84'), null);
});

test('Archive ZIP : écriture puis relecture', async () => {
  const z = Z.ecrire({ 'a.txt': 'été', 'b/c.bin': new Uint8Array([1, 2, 3]) });
  const r = await Z.lire(z);
  assert.strictEqual(Z.texte(r['a.txt']), 'été');
  assert.deepStrictEqual(Array.from(r['b/c.bin']), [1, 2, 3]);
});
