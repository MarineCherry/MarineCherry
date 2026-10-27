/*
 * Lecture d'un acte de décès (copie intégrale ou extrait) à partir de son texte :
 * identité du défunt, naissance, décès, domicile, situation familiale, conjoint.
 * Les dates peuvent être écrites en lettres (« le seize juin deux mille vingt-deux »).
 * Le texte est analysé sur le poste ; rien n'est envoyé sur internet. Fonctions pures, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.acteDeces = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const sansAccent = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

  /* ---------- Départements ---------- */
  const DEPARTEMENTS = {
    '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes',
    '09': 'Ariège', 10: 'Aube', 11: 'Aude', 12: 'Aveyron', 13: 'Bouches-du-Rhône', 14: 'Calvados', 15: 'Cantal', 16: 'Charente', 17: 'Charente-Maritime', 18: 'Cher',
    19: 'Corrèze', '2A': 'Corse-du-Sud', '2B': 'Haute-Corse', 21: 'Côte-d\'Or', 22: 'Côtes-d\'Armor', 23: 'Creuse', 24: 'Dordogne', 25: 'Doubs', 26: 'Drôme', 27: 'Eure',
    28: 'Eure-et-Loir', 29: 'Finistère', 30: 'Gard', 31: 'Haute-Garonne', 32: 'Gers', 33: 'Gironde', 34: 'Hérault', 35: 'Ille-et-Vilaine', 36: 'Indre', 37: 'Indre-et-Loire',
    38: 'Isère', 39: 'Jura', 40: 'Landes', 41: 'Loir-et-Cher', 42: 'Loire', 43: 'Haute-Loire', 44: 'Loire-Atlantique', 45: 'Loiret', 46: 'Lot', 47: 'Lot-et-Garonne',
    48: 'Lozère', 49: 'Maine-et-Loire', 50: 'Manche', 51: 'Marne', 52: 'Haute-Marne', 53: 'Mayenne', 54: 'Meurthe-et-Moselle', 55: 'Meuse', 56: 'Morbihan', 57: 'Moselle',
    58: 'Nièvre', 59: 'Nord', 60: 'Oise', 61: 'Orne', 62: 'Pas-de-Calais', 63: 'Puy-de-Dôme', 64: 'Pyrénées-Atlantiques', 65: 'Hautes-Pyrénées', 66: 'Pyrénées-Orientales',
    67: 'Bas-Rhin', 68: 'Haut-Rhin', 69: 'Rhône', 70: 'Haute-Saône', 71: 'Saône-et-Loire', 72: 'Sarthe', 73: 'Savoie', 74: 'Haute-Savoie', 75: 'Paris', 76: 'Seine-Maritime',
    77: 'Seine-et-Marne', 78: 'Yvelines', 79: 'Deux-Sèvres', 80: 'Somme', 81: 'Tarn', 82: 'Tarn-et-Garonne', 83: 'Var', 84: 'Vaucluse', 85: 'Vendée', 86: 'Vienne',
    87: 'Haute-Vienne', 88: 'Vosges', 89: 'Yonne', 90: 'Territoire de Belfort', 91: 'Essonne', 92: 'Hauts-de-Seine', 93: 'Seine-Saint-Denis', 94: 'Val-de-Marne',
    95: 'Val-d\'Oise', 971: 'Guadeloupe', 972: 'Martinique', 973: 'Guyane', 974: 'La Réunion', 976: 'Mayotte',
  };
  const cleDep = (s) => sansAccent(s).toLowerCase().replace(/[^a-z]/g, '');
  const PAR_NOM = {};
  Object.keys(DEPARTEMENTS).forEach((k) => (PAR_NOM[cleDep(DEPARTEMENTS[k])] = String(k)));
  PAR_NOM.basesalpes = '04';
  PAR_NOM.reunion = '974';
  const codeDepartement = (nom) => PAR_NOM[cleDep(nom)] || (/^\d{2,3}$|^2[AB]$/i.test((nom || '').trim()) ? nom.trim().toUpperCase() : '');

  /* ---------- Nombres et dates en lettres ---------- */
  const UNITES = {
    zero: 0, un: 1, une: 1, premier: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
    treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
    cent: 100, cents: 100, mille: 1000, mil: 1000,
  };
  const estMotNombre = (w) => sansAccent(w).toLowerCase() in UNITES || w.toLowerCase() === 'et';
  function nombreEnLettres(mots) {
    let total = 0, courant = 0;
    for (const brut of mots) {
      const w = sansAccent(brut).toLowerCase();
      if (w === 'et') continue;
      const v = UNITES[w];
      if (v === undefined) return null;
      if (v === 1000) {
        total += (courant || 1) * 1000;
        courant = 0;
      } else if (v === 100) courant = (courant || 1) * 100;
      else if (v === 20 && courant % 100 === 4) courant += 76; // quatre-vingt(s)
      else courant += v;
    }
    return total + courant;
  }
  const iso = (j, m, a) => (j >= 1 && j <= 31 && m >= 1 && m <= 12 && a > 1800 && a < 2200
    ? a + '-' + String(m).padStart(2, '0') + '-' + String(j).padStart(2, '0') : '');

  // Toutes les dates du texte, dans l'ordre : [{ iso, index, fin }]
  function dates(texte) {
    const out = [];
    const t = texte;
    let m;
    const reChiffres = /\b(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})\b/gi;
    while ((m = reChiffres.exec(t))) {
      const mois = MOIS.indexOf(sansAccent(m[2]).toLowerCase());
      if (mois >= 0) out.push({ iso: iso(+m[1], mois + 1, +m[3]), index: m.index, fin: reChiffres.lastIndex });
    }
    const reSlash = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;
    while ((m = reSlash.exec(t))) out.push({ iso: iso(+m[1], +m[2], +m[3]), index: m.index, fin: reSlash.lastIndex });
    // En lettres : « seize juin deux mille vingt-deux », « premier mars mil neuf cent … »
    const reMois = new RegExp('\\b(' + MOIS.join('|').replace('fevrier', 'f[ée]vrier').replace('aout', 'ao[uû]t').replace('decembre', 'd[ée]cembre') + ')\\b', 'gi');
    while ((m = reMois.exec(t))) {
      const avant = t.slice(Math.max(0, m.index - 60), m.index).split(/[\s-]+/).filter(Boolean);
      const jour = [];
      for (let i = avant.length - 1; i >= 0 && jour.length < 3 && estMotNombre(avant[i]); i--) jour.unshift(avant[i]);
      const apres = t.slice(reMois.lastIndex, reMois.lastIndex + 80);
      const motsApres = apres.split(/([\s-]+)/);
      const an = [];
      let longueur = 0;
      for (let i = 0; i < motsApres.length; i++) {
        const w = motsApres[i];
        if (!w.trim() || /^[\s-]+$/.test(w)) { longueur += w.length; continue; }
        const propre = w.replace(/[,.;:]$/, '');
        if (!estMotNombre(propre)) break;
        an.push(propre);
        longueur += w.length;
        if (propre !== w) break;
      }
      if (!jour.length || !an.length) continue;
      const j = nombreEnLettres(jour), a = nombreEnLettres(an);
      const debut = m.index - avant.slice(avant.length - jour.length).join(' ').length - 1;
      const d = iso(j, MOIS.indexOf(sansAccent(m[1]).toLowerCase()) + 1, a);
      if (d) out.push({ iso: d, index: Math.max(0, debut), fin: reMois.lastIndex + longueur });
    }
    return out.sort((a, b) => a.index - b.index);
  }

  /* ---------- Analyse de l'acte ---------- */
  const MAJ = "A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ";
  const MIN = "a-zàâäçéèêëîïôöùûüÿ";
  const PRENOM = '[' + MAJ + '][' + MIN + "]+(?:-[" + MAJ + '][' + MIN + ']+)?';
  const NOM_MAJ = '[' + MAJ + "][" + MAJ + "'’-]+(?:[ -][" + MAJ + "][" + MAJ + "'’-]+)*";
  const reLieu = new RegExp('([' + MAJ + "][" + MIN + MAJ + "'’ -]+?)\\s*\\(([^)]+)\\)", 'g');

  function nettoyer(texte) {
    // Les traits de remplissage des formulaires (« ------ ») sont retirés.
    return (texte || '').replace(/\r/g, '').replace(/[-_—–]{3,}|\.{4,}/g, ' ').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/-\n(?=[a-zà-ÿ])/g, '').trim();
  }
  const uneLigne = (s) => s.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // « Orange (Vaucluse) » → { commune: 'Orange', departement: '84' }
  function lieu(s) {
    const t = (s || '').trim();
    reLieu.lastIndex = 0;
    let m, dernier = null;
    while ((m = reLieu.exec(t))) dernier = m;
    if (dernier) {
      const commune = dernier[1].replace(/^(?:à|a|au|en|aux)\s+/i, '').replace(/.*,\s*/, '').trim();
      return { commune, departement: codeDepartement(dernier[2]) || (/\d{5}/.exec(dernier[2]) || [''])[0].slice(0, 2) };
    }
    const cp = /(\d{5})\s+([A-Za-zÀ-ÿ'’ -]+)$/.exec(t);
    if (cp) return { commune: cp[2].trim(), departement: cp[1].slice(0, 2), codePostal: cp[1] };
    return { commune: t.replace(/^(?:à|a|au|en)\s+/i, '').replace(/[.,;]$/, ''), departement: '' };
  }

  function libelle(texte, etiquettes) {
    const re = new RegExp('(?:^|\\n)\\s*(?:' + etiquettes + ')\\s*(?:\\(s\\))?\\s*:?\\s*([^\\n]+)', 'i');
    const m = re.exec(texte);
    return m ? m[1].trim() : '';
  }

  const PROFESSION = /,\s*([a-zà-ÿ][a-zà-ÿ' -]{2,40}),\s*(?:domicili|fils|fille|époux|épouse|veuf|veuve|divorc|célibataire|non mari)/i;

  function analyser(brut) {
    const texte = nettoyer(brut);
    const t = uneLigne(texte);
    const res = { civilite: '', prenoms: '', nom: '', profession: '', naissance: { date: '', commune: '', departement: '' }, deces: { date: '', commune: '', departement: '', lieu: '' },
      domicile: { adresse: '', commune: '', departement: '', codePostal: '' }, situation: '', conjoint: { civilite: '', prenoms: '', nom: '' }, trouves: [] };
    if (!t || t.length < 40) return Object.assign(res, { vide: true, manquants: ['identite', 'naissance', 'deces', 'domicile', 'situation'] });

    // Sexe : accords de l'acte.
    const fem = /\bd[ée]c[ée]d[ée]e(?![a-zà-ÿ])|\bn[ée]e\s+(?:le|à|a)(?=\s)|\bn[ée]e\s*:|\bfille de\b|\b[ée]pouse de\b|\bveuve de\b|\bdivorc[ée]e de\b|\bsexe\s*:?\s*f/i.test(t);
    res.civilite = fem ? 'Mme' : 'M';

    // Identité : extrait (libellés) ou copie intégrale (« …, Prénoms NOM, né(e) … »).
    const lNom = libelle(texte, 'NOM du défunt|Nom de naissance|Nom'), lPrenoms = libelle(texte, 'Prénoms|Prénom');
    if (lNom && lPrenoms) {
      res.nom = lNom.replace(/\s*(?:épouse|veuve|époux).*/i, '').toUpperCase();
      res.prenoms = lPrenoms.replace(/\s*,\s*/g, ' ').replace(/[.\s]+$/, '');
    } else {
      const reId = new RegExp('((?:' + PRENOM + '\\s+)+?)(' + NOM_MAJ + ')\\s*,?\\s*(?:\\([^)]*\\)\\s*,?\\s*)?n[ée]e?\\s+(?:le|à|a|au)(?=\\s)');
      const m = reId.exec(t);
      if (m) {
        res.prenoms = m[1].trim();
        res.nom = m[2].trim();
      } else {
        const inv = new RegExp('(' + NOM_MAJ + ')\\s+((?:' + PRENOM + '\\s*)+?)\\s*,?\\s*n[ée]e?\\s+(?:le|à|a|au)(?=\\s)').exec(t);
        if (inv) {
          res.nom = inv[1].trim();
          res.prenoms = inv[2].trim();
        }
      }
    }
    if (res.nom) res.trouves.push('identite');

    // Naissance : « né(e) à X (Dépt) le DATE » ou « né(e) le DATE à X (Dépt) ».
    const toutes = dates(t);
    const iNe = t.search(/\bn[ée]e?\s+(?:le|à|a|au)(?=\s)/i);
    const lNaiss = libelle(texte, 'Date et lieu de naissance|Né\\(e\\) le|Née? le');
    // Formulaire : « Née : le 03 avril 1936 » puis « À : Montfaucon (Gard) ».
    const fNe = (/(?:^|\n)\s*N[ée]e?\s*(?:\(e\))?\s*:\s*([^\n]+)/i.exec(texte) || [])[1];
    const fA = (/(?:^|\n)\s*[ÀA]\s*:\s*([^\n]+)/.exec(texte) || [])[1];
    if (fNe && dates(fNe)[0]) {
      res.naissance.date = dates(fNe)[0].iso;
      if (fA) Object.assign(res.naissance, lieu(fA.replace(/[.\s]+$/, '')));
      res.trouves.push('naissance');
    } else if (iNe >= 0 || lNaiss) {
      const seg = lNaiss || t.slice(iNe, iNe + 160);
      const offset = lNaiss ? -1 : iNe;
      const d = lNaiss ? dates(lNaiss)[0] : toutes.find((x) => x.index >= iNe && x.index < iNe + 160);
      if (d) res.naissance.date = d.iso;
      const segLieu = (d ? seg.slice(0, offset < 0 ? d.index : d.index - offset) + ' ' + seg.slice(offset < 0 ? d.fin : d.fin - offset) : seg)
        .replace(/^n[ée]e?\s+/i, '').replace(/^(?:le\s+)?/, '');
      const ml = new RegExp('(?:à|a|au)\\s+([' + MAJ + "][^,()]*?\\([^)]+\\))").exec(segLieu);
      if (ml) Object.assign(res.naissance, lieu(ml[1]));
      if (res.naissance.date) res.trouves.push('naissance');
    }

    // Décès : date (« Le … » en tête de l'acte ou libellé), lieu.
    const iDec = t.search(/\best\s+d[ée]c[ée]d[ée]e?(?![a-zà-ÿ])|\bd[ée]c[ée]d[ée]e?\s+(?:le|à|a|au|en)(?=\s)|date du d[ée]c[èe]s/i);
    const lDate = libelle(texte, 'Date et heure du décès|Date du décès|Décédée? le');
    let dDeces = lDate ? dates(lDate)[0] : null;
    if (!dDeces && iDec >= 0) dDeces = toutes.filter((x) => x.index < iDec).pop() || toutes.find((x) => x.index > iDec && x.index < iDec + 60);
    if (!dDeces && toutes.length) dDeces = toutes[0].iso !== res.naissance.date ? toutes[0] : null;
    if (dDeces) res.deces.date = dDeces.iso;
    const lLieu = libelle(texte, 'Lieu du décès|Lieu de décès');
    if (lLieu) Object.assign(res.deces, lieu(lLieu), { lieu: lLieu });
    else if (iDec >= 0) {
      const apres = t.slice(iDec).replace(/^est\s+/i, '').replace(/^d[ée]c[ée]d[ée]e?\s*/i, '');
      const fin = res.nom ? apres.indexOf(res.prenoms ? res.prenoms.split(' ')[0] : res.nom) : -1;
      const seg = fin > 0 ? apres.slice(0, fin) : apres.slice(0, 160);
      const l = lieu(seg.replace(/,\s*$/, ''));
      Object.assign(res.deces, l, { lieu: seg.replace(/,\s*$/, '').trim() });
      if (/en son domicile/i.test(seg)) {
        const adr = /en son domicile\s*,?\s*(.*?)\s*,\s*([^,]*\([^)]+\))\s*,?\s*$/i.exec(seg.trim());
        if (adr) Object.assign(res.domicile, { adresse: adr[1] }, lieu(adr[2]));
      }
    }
    if (res.deces.date) res.trouves.push('deces');

    // Domicile.
    const lDom = libelle(texte, 'Domicile|Domicilié\\(e\\)|Domiciliée?');
    const dom = lDom || ((/\bdomicili[ée]e?\s+(?:à\s+)?(.{5,140}?)(?=,\s*(?:fils|fille|[ée]poux|[ée]pouse|veuf|veuve|divorc|c[ée]libataire|non mari|partenaire)|\.\s|$)/i.exec(t) || [])[1] || '');
    if (dom) {
      // « 34 clos Saint-Jacques, Orange (Vaucluse) » ou « Orange (Vaucluse), 34 clos Saint-Jacques »
      const l = lieu(dom);
      const reste = dom.replace(/[^,]*\([^)]+\)/, '').replace(/^\s*,\s*|\s*,\s*$/g, '').replace(/\d{5}\s+\S.*$/, '').trim();
      Object.assign(res.domicile, l, { adresse: reste || res.domicile.adresse });
    }
    if (res.domicile.commune) res.trouves.push('domicile');

    // Situation familiale et conjoint.
    const reConj = new RegExp('(?:^|[^A-Za-zÀ-ÿ])([ÉéEe]poux|[ÉéEe]pouse|[Vv]euf|[Vv]euve|[Dd]ivorc[ée]e?|[Pp]artenaire(?: lié[e]? par un pacte civil de solidarité)?)\\s+(?:de|d\')\\s*(?:(Monsieur|Madame|M\\.|Mme)\\s+)?((?:' + PRENOM + ',?\\s+)*?)(' + NOM_MAJ + ')(?:\\s+((?:' + PRENOM + '\\s*)+))?');
    const mc = reConj.exec(t);
    if (mc) {
      const k = sansAccent(mc[1]).toLowerCase();
      res.situation = k.startsWith('epou') ? 'marie' : k.startsWith('veu') ? 'veuf' : k.startsWith('divorc') ? 'divorce' : 'pacse';
      res.conjoint.prenoms = (mc[3] || mc[5] || '').replace(/\s*,\s*/g, ' ').trim();
      res.conjoint.nom = mc[4].trim();
      res.conjoint.civilite = mc[2] ? (/^(madame|mme)/i.test(mc[2]) ? 'Mme' : 'M') : (fem ? 'M' : 'Mme');
    } else if (/c[ée]libataire|non mari[ée]/i.test(t)) res.situation = 'celibataire';
    if (res.situation) res.trouves.push('situation');

    const mp = PROFESSION.exec(t);
    if (mp && !/domicil/i.test(mp[1])) res.profession = mp[1].trim();

    res.manquants = ['identite', 'naissance', 'deces', 'domicile', 'situation'].filter((k) => !res.trouves.includes(k));
    return res;
  }

  return { analyser, dates, nombreEnLettres, lieu, codeDepartement, DEPARTEMENTS };
});
