/*
 * Nombres, montants et dates en toutes lettres (orthographe traditionnelle des actes).
 *   enLettres(150000)            → « cent cinquante mille »
 *   montant(150000, 'EUR', true) → « CENT CINQUANTE MILLE EUROS (150 000,00 EUR) »
 *   date('2010-03-15', false)    → « 15 mars 2010 » ; en lettres → « quinze mars deux mille dix »
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.lettres = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
    'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function moinsDeCent(n) {
    if (n < 20) return UNITES[n];
    const d = Math.floor(n / 10), u = n % 10;
    if (d === 7 || d === 9) {
      if (n === 71) return 'soixante et onze';
      return DIZAINES[d] + '-' + UNITES[10 + u];
    }
    if (u === 0) return d === 8 ? 'quatre-vingts' : DIZAINES[d];
    if (u === 1 && d !== 8) return DIZAINES[d] + ' et un';
    return DIZAINES[d] + '-' + UNITES[u];
  }

  // « cent » et « vingt » ne prennent pas de s devant « mille ».
  function moinsDeMille(n, devantMille) {
    const c = Math.floor(n / 100), r = n % 100;
    let s = '';
    if (c > 0) {
      s = c === 1 ? 'cent' : UNITES[c] + ' cent';
      if (r === 0 && c > 1) s += 's';
    }
    if (r > 0) s += (s ? ' ' : '') + moinsDeCent(r);
    return devantMille ? s.replace(/(cent|vingt)s$/, '$1') : s;
  }

  function enLettres(nombre) {
    let n = Math.floor(Math.abs(nombre));
    if (n === 0) return 'zéro';
    const parts = [];
    const milliards = Math.floor(n / 1e9);
    const millions = Math.floor(n / 1e6) % 1000;
    const milliers = Math.floor(n / 1000) % 1000;
    const reste = n % 1000;
    if (milliards) parts.push(moinsDeMille(milliards) + ' milliard' + (milliards > 1 ? 's' : ''));
    if (millions) parts.push(moinsDeMille(millions) + ' million' + (millions > 1 ? 's' : ''));
    if (milliers) parts.push(milliers === 1 ? 'mille' : moinsDeMille(milliers, true) + ' mille');
    if (reste) parts.push(moinsDeMille(reste));
    return (nombre < 0 ? 'moins ' : '') + parts.join(' ');
  }

  const fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Espaces insécables classiques (mieux gérées par Word que l'espace fine).
  const chiffres = (x) => fmt.format(x).replace(/[  ]/g, ' ');

  const DEVISES = {
    EUR: { un: 'euro', plusieurs: 'euros', code: 'EUR', voyelle: true },
    FRF: { un: 'franc', plusieurs: 'francs', code: 'F', voyelle: false },
  };

  // Montant en lettres (majuscules) suivi des chiffres entre parenthèses.
  function montant(x, devise, enToutesLettres) {
    const d = DEVISES[devise] || DEVISES.EUR;
    const enChiffres = chiffres(x) + ' ' + d.code;
    if (!enToutesLettres) return enChiffres;
    const entier = Math.floor(x + 1e-9);
    const centimes = Math.round((x - entier) * 100);
    const rond = entier > 0 && entier % 1e6 === 0;
    // « un million d'euros », « deux millions de francs »
    let s = enLettres(entier) + ' ' + (rond ? (d.voyelle ? "d'" : 'de ') : '') + (entier > 1 ? d.plusieurs : d.un);
    if (centimes) s += ' et ' + enLettres(centimes) + ' centime' + (centimes > 1 ? 's' : '');
    return s.toUpperCase() + ' (' + enChiffres + ')';
  }

  function parseDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  function date(iso, enToutesLettres) {
    const p = parseDate(iso);
    if (!p) return '';
    if (enToutesLettres) return (p.d === 1 ? 'premier' : enLettres(p.d)) + ' ' + MOIS[p.m - 1] + ' ' + enLettres(p.y);
    return (p.d === 1 ? '1er' : String(p.d)) + ' ' + MOIS[p.m - 1] + ' ' + p.y;
  }

  return { enLettres, montant, date, chiffres, parseDate, MOIS };
});
