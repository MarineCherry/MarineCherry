/*
 * Suivi des dossiers : pièces selon la situation, diagnostics obligatoires, zones termites, alertes.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const defaults = require('../assets/js/core/defaults.js');
const E = require('../assets/js/apps/dossiers/engine.js');

const P = defaults.dossiers;
const vente = (o) => Object.assign({
  type: 'vente', etape: 'promesse', aujourdhui: '2026-10-14',
  vendeurs: [{ nom: 'MARTIN Paul', situation: 'marie' }], acquereurs: [{ nom: 'SCI LES OLIVIERS', qualite: 'societe' }],
  bien: { adresse: '12 rue des Lilas', codePostal: '84000', commune: 'Avignon', type: 'maison', construction: '1949-1997', electricite: 'plus15', gaz: 'aucune', assainissement: 'collectif' },
  dates: { promesse: '2026-10-20' }, pieces: {}, diagnostics: {},
}, o || {});

test('Zones termites : commune listée, département entier, département partiel', () => {
  assert.strictEqual(E.zone(P.zonesTermites, P.departementsTermites, { codePostal: '84000', commune: 'AVIGNON' }).statut, 'oui');
  assert.strictEqual(E.zone(P.zonesTermites, P.departementsTermites, { codePostal: '13100', commune: 'Aix-en-Provence' }).statut, 'oui');
  // Vaucluse : liste complète (carte DDT 2022).
  assert.strictEqual(E.zone(P.zonesTermites, P.departementsTermites, { codePostal: '84100', commune: 'Orange' }).statut, 'non');
  assert.strictEqual(E.zone(P.zonesTermites, P.departementsTermites, { codePostal: '84700', commune: 'Sorgues' }).statut, 'oui');
  assert.strictEqual(E.zone(P.zonesTermites, P.departementsTermites, { codePostal: '84800', commune: 'L\'Isle sur la Sorgue' }).statut, 'oui');
  assert.strictEqual(E.zone(P.zonesTermites, P.departementsTermites, { codePostal: '83000', commune: 'Toulon' }).statut, 'inconnu');
  assert.strictEqual(E.zone(P.zonesMerule, P.departementsMerule, { codePostal: '84000', commune: 'Avignon' }).statut, 'oui');
  assert.strictEqual(E.zone(P.zonesMerule, P.departementsMerule, { codePostal: '84300', commune: 'Cavaillon' }).statut, 'non');
  assert.strictEqual(E.normCommune('St-Rémy-de-Provence'), 'saint remy de provence');
});

test('Diagnostics : Avignon, maison de 1975, électricité de plus de 15 ans', () => {
  const r = E.etat(vente(), P);
  const d = Object.fromEntries(r.diagnostics.map((x) => [x.code, x.obligatoire]));
  assert.strictEqual(d.termites, 'oui');
  assert.strictEqual(d.amiante, 'oui');
  assert.strictEqual(d.plomb, 'non');
  assert.strictEqual(d.electricite, 'oui');
  assert.strictEqual(d.gaz, 'non');
  assert.strictEqual(d.erp, 'oui');
  assert.strictEqual(d.carrez, 'non');
  assert.strictEqual(d.assainissement, 'non');
  assert.strictEqual(d.audit, 'a_verifier', 'classe du DPE non renseignée');
  assert.ok(r.alertes.some((a) => /termites/.test(a.texte) && a.niveau === 'fort'));
});

test('Diagnostics : validité à la date de signature', () => {
  const r = E.etat(vente({ diagnostics: { termites: { recu: true, date: '2026-03-01' }, erp: { recu: true, date: '2026-09-01' } } }), P);
  const t = r.diagnostics.find((x) => x.code === 'termites');
  assert.strictEqual(t.finValidite, '2026-09-01');
  assert.strictEqual(t.etat, 'perime');
  assert.strictEqual(r.diagnostics.find((x) => x.code === 'erp').etat, 'valide');
  assert.ok(r.alertes.some((a) => /plus valable/.test(a.texte)));
});

test('Audit énergétique : maison classée F', () => {
  const r = E.etat(vente({ bien: Object.assign(vente().bien, { dpeClasse: 'F' }) }), P);
  assert.strictEqual(r.diagnostics.find((x) => x.code === 'audit').obligatoire, 'oui');
});

test('Pièces selon la situation : copropriété, société, mariés', () => {
  const r = E.etat(vente({ bien: Object.assign(vente().bien, { copro: true }) }), P);
  const p = Object.fromEntries(r.pieces.map((x) => [x.id, x.statut]));
  assert.strictEqual(p.preEtatDate, 'manquante');
  assert.strictEqual(p.etatDate, 'manquante');
  assert.strictEqual(p.statutsKbis, 'manquante');
  assert.strictEqual(p.contratMariage, 'manquante');
  assert.strictEqual(p.offrePret, 'na');
  assert.strictEqual(p.factures, 'na');
  const sansCopro = E.etat(vente(), P);
  assert.strictEqual(sansCopro.pieces.find((x) => x.id === 'etatDate').statut, 'na');
});

test('Avancement par étape et alerte avant signature', () => {
  const d = vente({ pieces: { identite: { statut: 'recue' }, titre: { statut: 'recue' }, cadastre: { statut: 'demandee', date: '2026-09-01' } } });
  const r = E.etat(d, P);
  const promesse = r.etapes.find((e) => e.id === 'promesse');
  assert.strictEqual(promesse.recues, 2);
  assert.strictEqual(promesse.demandees, 1);
  assert.strictEqual(r.prochaine.jours, 6);
  assert.ok(r.alertes[0].texte.startsWith('Signature de la promesse dans 6 jour(s)'));
  assert.ok(r.alertes.some((a) => /Relancer : Plan cadastral/.test(a.texte)));
});

test('Succession : échéance de la déclaration à 6 mois', () => {
  const r = E.etat({ type: 'succession', aujourdhui: '2026-10-14', defunt: { nom: 'Dupont', dateDeces: '2026-08-31', situation: 'marie' }, pieces: {} }, P);
  assert.strictEqual(r.echeances[0].date, '2027-02-28');
  assert.strictEqual(r.pieces.find((x) => x.id === 'contratMariageDefunt').statut, 'manquante');
  assert.strictEqual(r.pieces.find((x) => x.id === 'testament').statut, 'na');
  assert.strictEqual(r.diagnostics.length, 0);
});

test('Intitulé du dossier', () => {
  assert.strictEqual(E.reference(vente()), 'MARTIN / SCI LES OLIVIERS');
  assert.strictEqual(E.reference({ type: 'succession', defunt: { nom: 'Dupont' } }), 'Succession DUPONT');
});
