/*
 * Moteur — Frais d'acquisition d'un bien reçu par succession (plus-value immobilière).
 *
 * Art. 150 VB CGI : le prix d'acquisition d'un bien reçu à titre gratuit est la valeur retenue pour les
 * droits de succession (après l'abattement de 20 % de la résidence principale, art. 764 bis, le cas
 * échéant), majorée des frais d'acquisition pour leur montant réel (pas de forfait de 7,5 %) :
 * frais d'acte et de déclaration et droits de succession, à proportion de la valeur du bien cédé.
 * Quand la succession comprend plusieurs biens, on ventile :
 *   quote-part = valeur du bien dans la succession ÷ valeur totale de l'actif de la succession ;
 *   droits imputables à un héritier = ses droits payés × quote-part ;
 *   frais imputables = frais d'actes de la succession × quote-part × part des frais supportée par l'héritier.
 * Les frais de partage ne sont pas retenus (le partage est une opération intercalaire, art. 150 U, IV).
 * Fonctions pures : testables sous Node.
 */
(function (root, factory) {
  const quasi = typeof module === 'object' && module.exports ? require('../quasi/engine.js') : null;
  const mod = factory(() => quasi || (root.Atelier && root.Atelier.engines && root.Atelier.engines.quasi));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.fraisGratuit = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (quasiEngine) {
  'use strict';

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const n = (v) => (isNum(v) ? v : 0);
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const arrondi = (x) => (x < 0 ? -1 : 1) * Math.round(Math.abs(x) * 100 + 1e-6) / 100;
  const montant = (s) => { const v = parseFloat(String(s || '').replace(/[\s  ]/g, '').replace(',', '.')); return isFinite(v) ? v : null; };
  function fraction(s) {
    if (isNum(s)) return s;
    const t = String(s || '').replace(/\s/g, '').replace(',', '.');
    let m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
    if (m) return +m[2] ? +m[1] / +m[2] : null;
    m = /^(\d+(?:\.\d+)?)%$/.exec(t);
    if (m) return +m[1] / 100;
    if (/^\d+(?:\.\d+)?$/.test(t)) { const v = +t; return v > 1 ? v / 100 : v; }
    return null;
  }

  /*
   * d = {
   *   baseTotale,                          // valeur totale de l'actif de la succession (prorata)
   *   bien: { designation, valeur, residencePrincipale },   // valeur du bien dans la succession
   *   heritiers: [{ id, nom, droits, partFrais, vendeur }],
   *   frais: [{ libelle, montant, retenu }],
   * }
   */
  function calculer(d) {
    const b = d.bien || {};
    // Le bien vendu peut réunir plusieurs immeubles de la succession (ou des parties d'immeubles divisés).
    const parties = (Array.isArray(b.parties) && b.parties.length ? b.parties : [b]).map((x, i) => {
      const valeurDeclaree = n(x.valeur);
      // Valeur de l'immeuble entier retenue pour les droits (après l'abattement de 20 % de la résidence principale).
      const valeurTotale = x.residencePrincipale ? arrondi(valeurDeclaree * 0.8) : valeurDeclaree;
      // Immeuble divisé depuis la succession : seule la partie vendue compte, par sa valeur ou au prorata des surfaces.
      let valeurPartie = valeurTotale, fractionDivision = null;
      if (x.division === 'surface') {
        fractionDivision = n(x.surfaceTotale) > 0 ? n(x.surfaceVendue) / n(x.surfaceTotale) : 0;
        valeurPartie = valeurTotale * fractionDivision;
      } else if (x.division === 'valeur') {
        valeurPartie = x.residencePrincipale ? n(x.valeurPartie) * 0.8 : n(x.valeurPartie);
        fractionDivision = valeurTotale > 0 ? valeurPartie / valeurTotale : null;
      }
      // Quote-part vendue (ex. 1/3 d'un chemin d'accès commun) ; vide = en totalité.
      const qt = String(x.quoteVendue === undefined || x.quoteVendue === null ? '' : x.quoteVendue).trim();
      const qv = qt ? fraction(qt) : 1;
      const quoteVendue = qv === null ? 0 : qv;
      return { index: i, designation: x.designation || '', cadastre: x.cadastreVendu || x.cadastre || '', division: x.division || 'aucune',
        valeurDeclaree, valeurTotale, fractionDivision, quoteVendue, quoteTexte: qt, quoteInvalide: qv === null, valeur: arrondi(valeurPartie * quoteVendue),
        surfaceTotale: n(x.surfaceTotale), surfaceVendue: n(x.surfaceVendue), residencePrincipale: !!x.residencePrincipale };
    });
    const valeurDeclaree = arrondi(sum(parties, (x) => x.valeurDeclaree));
    const valeurTotale = arrondi(sum(parties, (x) => x.valeurTotale));
    const valeurBien = arrondi(sum(parties, (x) => x.valeur));
    const fractionDivision = parties.length === 1 ? (parties[0].fractionDivision === null && parties[0].quoteVendue === 1 ? null : (valeurTotale > 0 ? valeurBien / valeurTotale : null)) : null;
    const base = n(d.baseTotale);
    const quotePart = base > 0 ? Math.min(1, valeurBien / base) : 0;
    const frais = (d.frais || []).filter((f) => n(f.montant));
    const fraisRetenus = arrondi(sum(frais.filter((f) => f.retenu !== false), (f) => n(f.montant)));
    const fraisBien = arrondi(fraisRetenus * quotePart);
    const heritiers = (d.heritiers || []).map((h) => {
      const pf = fraction(h.partFrais);
      const partFrais = pf === null ? 0 : pf;
      const droitsImputables = arrondi(n(h.droits) * quotePart);
      const fraisImputables = arrondi(fraisRetenus * quotePart * partFrais);
      return {
        id: h.id, nom: h.nom || '', vendeur: h.vendeur !== false, droits: n(h.droits), partFrais, partFraisTexte: String(h.partFrais || '').trim(),
        droitsImputables, fraisImputables, total: arrondi(droitsImputables + fraisImputables),
      };
    });
    const alertes = [];
    if (!(base > 0)) alertes.push('Indiquez la valeur totale de l\'actif de la succession.');
    if (base > 0 && valeurBien > base + 0.005) alertes.push('La valeur du bien dépasse l\'actif de la succession : vérifiez les montants.');
    parties.forEach((x) => {
      const nom = parties.length > 1 ? 'Immeuble ' + (x.index + 1) + (x.designation ? ' (' + x.designation + ')' : '') + ' : ' : '';
      if (!(x.valeurDeclaree > 0)) alertes.push(nom + 'indiquez la valeur ' + (parties.length > 1 ? 'de l\'immeuble' : 'du bien vendu') + ' dans la succession.');
      if (x.division === 'surface' && !(x.surfaceTotale > 0 && x.surfaceVendue > 0)) alertes.push(nom + 'bien divisé, indiquez la superficie du bien d\'origine et celle de la partie vendue.');
      if (x.division === 'valeur' && !(x.fractionDivision > 0)) alertes.push(nom + 'bien divisé, indiquez la valeur de la partie vendue.');
      if (x.fractionDivision !== null && x.fractionDivision > 1.0001) alertes.push(nom + 'la partie vendue dépasse le bien d\'origine, vérifiez les chiffres.');
      if (x.quoteInvalide || x.quoteVendue > 1) alertes.push(nom + 'quote-part vendue « ' + x.quoteTexte + ' » non comprise (ex. 1/3 ou 33,33 %).');
    });
    const sommeParts = sum(heritiers, (h) => h.partFrais);
    if (heritiers.length && Math.abs(sommeParts - 1) > 0.001 && sommeParts > 0) alertes.push('Les parts des frais des héritiers font ' + (Math.round(sommeParts * 10000) / 100).toLocaleString('fr-FR') + ' % (au lieu de 100 %).');
    if (frais.some((f) => f.retenu !== false && /PARTAGE/i.test(f.libelle || ''))) alertes.push('Des frais de partage sont retenus : ils ne doivent pas l\'être (art. 150 U, IV CGI).');
    return { parties, valeurDeclaree, valeurTotale, fractionDivision, valeurBien, base, quotePart, fraisRetenus, fraisBien, heritiers, alertes };
  }

  /* ---------- Lecture de la déclaration de succession ---------- */
  const RE_EUROS = /([\d\s  .]+,\d{2})/;
  function apres(T, re) {
    const m = re.exec(T);
    return m ? montant(m[m.length - 1]) : null;
  }
  // Immeubles de l'actif (communauté : la moitié revient à la succession).
  function immeubles(zone, communaute) {
    const out = [];
    const reItem = /(\d+)\)\s*(?:La|LA|Le|Les|L')\s+((?:MOITI[ÉE]|QUART|TIERS)[^)]{0,30}?en\s+)?(?:TOUTE|PLEINE)\s+PROPRI[ÉE]T[ÉE]/gi;
    const items = [];
    let m;
    while ((m = reItem.exec(zone))) items.push({ index: m.index, quote: m[2] || '' });
    let enAttente = ''; // article « évalué ensemble » avec le suivant (pas de « Ci » propre)
    items.forEach((it, k) => {
      let bloc = zone.slice(it.index, k + 1 < items.length ? items[k + 1].index : zone.length);
      const fin = /Soit,?\s+ensemble|FORFAIT MOBILIER|Soit un actif brut/i.exec(bloc);
      if (fin) bloc = bloc.slice(0, fin.index);
      const ci = [...bloc.matchAll(/Ci\s*[,.]?[\s.…]*([\d\s ]+,\d{2})\s*€/g)];
      if (!ci.length) { enAttente += bloc + ' '; return; }
      bloc = enAttente + bloc;
      enAttente = '';
      const valeurCi = montant(ci[ci.length - 1][1]);
      const commune = (/Sur la commune de\s+(.+?)(?:,|\s+Figurant|\s+Une\s|\s+Un\s)/i.exec(bloc) || [])[1] || '';
      const nature = ((/(Une? (?:maison|appartement|terrain|immeuble|local|parcelle|garage)[^.,]{0,60})/i.exec(bloc) || [])[1] || '').split(/\s+(?:Et|Lesquels|Figurant|comprenant)\b/i)[0];
      const designation = [nature.trim(), commune.trim() ? 'à ' + commune.trim() : ''].filter(Boolean).join(' ') || 'Immeuble n° ' + (k + 1);
      const parcelles = cadastre(bloc);
      out.push({ designation, valeurDeclaree: valeurCi, valeurSuccession: communaute ? arrondi(valeurCi / 2) : valeurCi, communaute,
        parcelles, cadastre: texteCadastre(parcelles), copropriete: /copropri/i.test(bloc), surface: parcelles.reduce((t, x) => t + x.surface, 0) || null });
    });
    return out;
  }
  // Parcelles : « section : AZ, numéro : 307, lieudit : RUE X, contenance : 0ha 05a 59ca ».
  function cadastre(bloc) {
    const re = /section\s*:\s*([A-Z0-9]{1,3})\s*,\s*num[ée]ro\s*:\s*(\d+)\s*,\s*lieu-?dit\s*:\s*(.*?)\s*,\s*contenance\s*:\s*(\d+)\s*ha\s*(\d+)\s*a\s*(\d+)\s*ca/gi;
    return [...bloc.matchAll(re)].map((m) => ({
      section: m[1].toUpperCase(), numero: m[2], lieudit: m[3].replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s+/g, ' '),
      surface: +m[4] * 10000 + +m[5] * 100 + +m[6],
    }));
  }
  const contenance = (m2) => { const ha = Math.floor(m2 / 10000), a = Math.floor((m2 % 10000) / 100), ca = m2 % 100; return (ha ? ha + ' ha ' : '') + String(a).padStart(2, '0') + ' a ' + String(ca).padStart(2, '0') + ' ca'; };
  const texteCadastre = (parcelles) => parcelles.map((x) => 'section ' + x.section + ' n° ' + x.numero + (x.lieudit ? ', ' + x.lieudit : '') + ' (' + contenance(x.surface) + ')').join(' ; ');

  function lireDDS(source) {
    const T = quasiEngine().texteDDS(source);
    const res = { actifBrut: null, passif: null, actifNet: null, immeubles: [], heritiers: [], avertissements: [] };
    res.actifBrut = apres(T, /masse active de succession s.[ée]levant [àa]\s*:?[\s.…]*([\d\s]+,\d{2})/i)
      || apres(T, /actif brut de succession de\s*:?.{0,200}?\(([\d\s.]+,\d{2})\s*€\)/i);
    res.passif = apres(T, /masse passive [àa]\s*:?[\s.…]*([\d\s]+,\d{2})/i);
    res.actifNet = apres(T, /actif net de succession d.un montant de\s*:?[\s.…]*([\d\s]+,\d{2})/i);
    const comm = /ACTIF DE COMMUNAUTE(.*?)(?:PASSIF DE COMMUNAUTE|Soit un actif brut de communaut)/i.exec(T);
    const succ = /ACTIF DE SUCCESSION(.*?)(?:PASSIF DE SUCCESSION|Soit un actif brut de succession)/i.exec(T);
    if (comm) res.immeubles.push(...immeubles(comm[1], true));
    if (succ) res.immeubles.push(...immeubles(succ[1], false));
    // Droits des parties : un bloc par bénéficiaire.
    const parts = T.split(/\d+\s*-\s*REVENANT A\s*:?\s*/i).slice(1);
    parts.forEach((bloc) => {
      // « Madame Prénom(s) NOM » : le nom s'arrête après les mots en capitales.
      const nom = (/^((?:Madame|Monsieur)\s+(?:\p{Lu}[\p{Ll}'-]+\s+)*(?:\p{Lu}[\p{Lu}'-]+)(?:\s+\p{Lu}[\p{Lu}'-]+)*)/u.exec(bloc) || [])[1] || '';
      const nature = /nue-propri/i.test(bloc.slice(0, 300)) ? 'NP' : /usufruit/i.test(bloc.slice(0, 300)) ? 'US' : 'PP';
      const quote = (/\((\d+\/\d+)\)/.exec(bloc.slice(0, 300)) || [])[1] || '';
      const recu = apres(bloc, /Montant [ée]gal [àa] ses droits\s*:?[\s.…]*([\d\s]+,\d{2})/i) || apres(bloc, /Part recueillie\s*:?[\s.…]*([\d\s]+,\d{2})/i)
        || apres(bloc, /MONTANT des DROITS DU CONJOINT\s*:?[\s.…]*([\d\s]+,\d{2})/i);
      let droits = apres(bloc, /Montant des droits [àa] acquitter\s*:?[\s.…]*([\d\s]+,\d{2})/i);
      if (droits === null) droits = apres(bloc, /(?:Droits dus|Droits [àa] payer|Montant des droits)\s*:?[\s.…]*([\d\s]+,\d{2})/i);
      if (droits === null && /Reste taxable\s*:?[\s.…]*0,00/i.test(bloc) && !/Reste taxable\s*:?[\s.…]*[1-9]/i.test(bloc)) droits = 0;
      res.heritiers.push({ nom: nom.replace(/\s+/g, ' ').trim(), nature, quote, recu, droits });
    });
    if (!res.actifBrut) res.avertissements.push('Actif de la succession non trouvé : à indiquer.');
    if (res.heritiers.some((h) => h.droits === null)) res.avertissements.push('Droits payés non trouvés pour un héritier : à indiquer.');
    return res;
  }

  // Frais d'actes de la succession repris du relevé de compte (hors partage, hors versements).
  function fraisDuReleve(operations) {
    const Q = quasiEngine();
    return (operations || []).filter((o) => o.debit).map((o) => {
      const c = Q.classer(o, 'succession');
      const partage = /PARTAGE/i.test(o.libelle);
      const acte = c.action === 'retranche' && !['droits', 'provision', 'pret', 'agence', 'plus-value'].includes(c.nature);
      // Retenus par défaut : actes et formalités de la mutation (notoriété, déclaration, attestation, option…),
      // pas les procurations, la convention de quasi-usufruit ni le partage.
      const retenu = acte && !partage && c.nature !== 'procuration' && !/QUASI.?USUFRUIT/i.test(o.libelle);
      return { libelle: c.libelle && !partage ? c.libelle : o.libelle, libelleReleve: o.libelle, montant: o.debit, retenu, nature: partage ? 'partage' : c.nature, droits: c.nature === 'droits' };
    }).filter((f) => f.nature !== 'versement' && f.nature !== 'autre-dossier');
  }

  return { calculer, lireDDS, fraisDuReleve, fraction, arrondi, cadastre, contenance };
});
