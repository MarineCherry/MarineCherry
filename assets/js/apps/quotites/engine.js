/*
 * Quotités d'acquisition en indivision : part de chaque acquéreur, d'après son financement.
 *
 * Contribution d'un acquéreur = ses apports personnels
 *                             + sa part du capital de chaque prêt
 *                             − sa part des frais de chaque prêt (garantie, dossier, courtage…),
 * les frais de prêt n'entrant pas dans la valeur du bien. Quotité = contribution / total des contributions,
 * ce total devant correspondre au coût de l'acquisition (prix et frais d'acquisition).
 * Fonctions pures, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.quotites = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const somme = (l, f) => l.reduce((t, x) => t + f(x), 0);

  // Répartition d'un prêt entre les acquéreurs : parts saisies (en fraction), ou à parts égales.
  function parts(pret, acquereurs) {
    const r = pret.repartition || {};
    const saisies = acquereurs.map((a) => (typeof r[a.id] === 'number' && isFinite(r[a.id]) ? Math.max(0, r[a.id]) : null));
    if (saisies.every((x) => x === null) || pret.egal !== false) return acquereurs.map(() => 1 / acquereurs.length);
    const total = somme(saisies, (x) => x || 0);
    return saisies.map((x) => (total ? (x || 0) / total : 1 / acquereurs.length));
  }

  // Arrondi des quotités au centième de pourcent, le total faisant exactement 100 % (plus forts restes).
  function arrondir(fractions, pas) {
    const unite = pas || 10000;
    const brut = fractions.map((f) => f * unite);
    const bas = brut.map(Math.floor);
    let reste = unite - somme(bas, (x) => x);
    brut.map((x, i) => ({ i, r: x - bas[i] })).sort((a, b) => b.r - a.r).forEach((x) => { if (reste > 0) { bas[x.i]++; reste--; } });
    return bas.map((x) => x / unite);
  }

  function calculer(d) {
    const acquereurs = (d.acquereurs || []).filter(Boolean);
    const emplois = (d.emplois || []).filter((x) => n(x.montant));
    const prets = (d.prets || []).filter((x) => n(x.capital) || n(x.frais));
    const baseEmplois = somme(emplois, (x) => n(x.montant));
    const lignes = acquereurs.map((a) => ({
      id: a.id, nom: a.nom || '', apports: somme(a.apports || [], (x) => n(x.montant)), prets: 0, fraisPrets: 0, detailPrets: [],
    }));
    prets.forEach((p) => {
      const pp = parts(p, acquereurs);
      lignes.forEach((l, i) => {
        l.prets += n(p.capital) * pp[i];
        l.fraisPrets += n(p.frais) * pp[i];
        l.detailPrets.push({ id: p.id, part: pp[i], capital: n(p.capital) * pp[i], frais: n(p.frais) * pp[i] });
      });
    });
    // Convention : frais de prêt déduits de la contribution (par défaut), ou comptés dans le coût de l'acquisition.
    const fraisDansCout = !!d.fraisDansCout;
    lignes.forEach((l) => (l.contribution = l.apports + l.prets - (fraisDansCout ? 0 : l.fraisPrets)));
    const total = somme(lignes, (l) => l.contribution);
    const fr = lignes.map((l) => (total > 0 ? Math.max(0, l.contribution) / total : 0));
    const arr = total > 0 ? arrondir(fr) : fr;
    lignes.forEach((l, i) => { l.quotite = fr[i]; l.quotiteArrondie = arr[i]; });
    const ressources = somme(lignes, (l) => l.apports + l.prets);
    const fraisPrets = somme(prets, (p) => n(p.frais));
    const base = baseEmplois + (fraisDansCout ? fraisPrets : 0);
    return {
      lignes, base, baseEmplois, total, ressources, fraisPrets, fraisDansCout,
      // Écart entre le financement (net des frais de prêt) et le coût de l'acquisition.
      ecart: total - base,
      equilibre: Math.abs(total - base) < 0.5,
      negatif: lignes.some((l) => l.contribution < -0.005),
    };
  }

  // Quotité en toutes lettres pour l'acte : « 54,64 % » ou « 5 464 / 10 000èmes ».
  const pct = (f) => (Math.round(f * 10000) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0%';
  function clause(r, opts) {
    const o = opts || {};
    const euros = (x) => Math.round(x).toLocaleString('fr-FR') + '\u00a0€';
    const noms = r.lignes.map((l) => l.nom || 'l\'acquéreur');
    const partsTxt = r.lignes.map((l, i) => noms[i] + ' à concurrence de ' + pct(l.quotiteArrondie)).join(', ');
    const det = r.lignes.map((l, i) => '- ' + noms[i] + ' : ' + [l.apports ? euros(l.apports) + ' d\'apport personnel' : null, l.prets ? euros(l.prets) + ' au moyen du prêt' : null].filter(Boolean).join(' et ')
      + (l.fraisPrets && !r.fraisDansCout ? ', déduction faite de sa part des frais de prêt (' + euros(l.fraisPrets) + ')' : '') + ', soit ' + euros(l.contribution) + '.');
    return [
      'Les acquéreurs acquièrent le bien en indivision, ' + partsTxt + '.',
      'Ces quotités correspondent au financement de l\'acquisition, dont le coût total s\'élève à ' + euros(r.base) + (o.detailCout ? ' (' + o.detailCout + ')' : '') + ', financé ainsi :',
    ].concat(det);
  }

  const EXEMPLE = {
    reference: '',
    acquereurs: [
      { id: 'a1', nom: 'Julie MARTIN', apports: [{ id: 'p1', libelle: 'Épargne', montant: 50000 }] },
      { id: 'a2', nom: 'Thomas DURAND', apports: [{ id: 'p2', libelle: 'Épargne', montant: 20000 }] },
    ],
    emplois: [
      { id: 'e1', libelle: 'Prix de vente', montant: 300000 },
      { id: 'e2', libelle: 'Frais d\'acquisition (droits et émoluments)', montant: 23000 },
    ],
    prets: [{ id: 'k1', libelle: 'Prêt immobilier', capital: 260000, frais: 7000, egal: true, repartition: {} }],
  };

  return { calculer, parts, arrondir, clause, pct, EXEMPLE };
});
