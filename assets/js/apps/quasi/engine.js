/*
 * Moteur — Convention de quasi-usufruit.
 *
 * 1. Lecture du relevé de compte du dossier (Fiducial, PDF) : opérations datées, libellé, débit ou crédit,
 *    détail des honoraires. Les éléments de texte du PDF (avec leur position) sont fournis par pdf.js.
 * 2. Classement de chaque opération : base de départ (liquidités versées, prix de vente), élément à
 *    retrancher (frais d'actes, débours, procurations, agence, prêt, mainlevée, plus-value, droits),
 *    ou mouvement sans effet (versements aux parties, remboursements de prorata…), avec un repère
 *    « à vérifier » quand le classement est incertain.
 * 3. Calcul : base démembrée (chaque ligne avec sa quote-part), moins les éléments retranchés (en totalité
 *    ou au prorata de la quote-part démembrée), répartie entre les nus-propriétaires ; chacun supporte
 *    ses propres éléments (sa plus-value). Pour chacun : quasi-usufruit (créance de restitution) ou
 *    répartition du prix selon le barème de l'article 669 du CGI.
 * 4. Tableau et paragraphes pour la convention.
 * Fonctions pures : testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.quasi = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const n = (v) => (isNum(v) ? v : 0);
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const arrondi = (x) => Math.round(x * 100) / 100;
  const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = (s) => sansAccents(s).toUpperCase().replace(/\s+/g, ' ').trim();

  const RE_MONTANT = /^-?\d{1,3}(?:[   ]\d{3})*,\d{2}$/;
  const RE_DATE = /^\d{2}\/\d{2}\/\d{4}$/;
  function montant(s) {
    const t = String(s || '').replace(/[   ]/g, '').replace(',', '.');
    const v = parseFloat(t);
    return isFinite(v) ? v : null;
  }
  const isoDe = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };

  // « 1/2 », « 95/100 », « 50 % », « 0,5 » → fraction (null si illisible).
  function fraction(s) {
    if (isNum(s)) return s;
    const t = String(s || '').replace(/\s/g, '').replace(',', '.');
    if (!t) return null;
    let m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
    if (m) return +m[2] ? +m[1] / +m[2] : null;
    m = /^(\d+(?:\.\d+)?)%$/.exec(t);
    if (m) return +m[1] / 100;
    m = /^\d+(?:\.\d+)?$/.exec(t);
    if (m) { const v = +t; return v > 1 ? v / 100 : v; }
    return null;
  }

  /* ---------- 1. Lecture du relevé ---------- */
  // pages : [{ items: [{ str, x, y, w }] }] (y croissant vers le haut, comme dans pdf.js).
  function lireReleve(pages) {
    const res = { compte: '', intitule: '', periode: '', operations: [], totaux: null, avertissements: [] };
    let courante = null;
    (pages || []).forEach((page) => {
      const items = (page.items || []).filter((i) => String(i.str || '').trim());
      // Lignes : éléments de même hauteur (à 2 points près).
      const lignes = [];
      items.slice().sort((a, b) => b.y - a.y || a.x - b.x).forEach((i) => {
        const l = lignes.find((x) => Math.abs(x.y - i.y) <= 2);
        if (l) l.items.push(i); else lignes.push({ y: i.y, items: [i] });
      });
      lignes.forEach((l) => l.items.sort((a, b) => a.x - b.x));
      const entete = lignes.find((l) => l.items.some((i) => /^D[ée]bit$/i.test(i.str.trim())) && l.items.some((i) => /^Cr[ée]dit$/i.test(i.str.trim())));
      if (!entete) return;
      const xDebit = entete.items.find((i) => /^D[ée]bit$/i.test(i.str.trim())).x;
      const xCredit = entete.items.find((i) => /^Cr[ée]dit$/i.test(i.str.trim())).x;
      const xLibelle = (entete.items.find((i) => /^Libell/i.test(i.str.trim())) || { x: 200 }).x;
      lignes.forEach((l) => {
        const texte = l.items.map((i) => i.str.trim()).join(' ');
        if (!res.compte) {
          const m = /Compte\s*:\s*([\d ]+?)\s+(\D.*?)(?:\s+\d+\/\d+)?$/.exec(texte);
          if (m) { res.compte = m[1].trim(); res.intitule = m[2].trim(); }
        }
        if (!res.periode) {
          const m = /^Du (\d{2}\/\d{2}\/\d{4}) au (\d{2}\/\d{2}\/\d{4})/.exec(texte);
          if (m) res.periode = m[1] + ' au ' + m[2];
        }
      });
      lignes.filter((l) => l.y < entete.y - 1).forEach((l) => {
        const texte = l.items.map((i) => i.str.trim()).join(' ');
        if (/^Membre d|^Total à reporter|^Report\b/i.test(texte) || /Total à reporter|^\s*Report\s/.test(texte)) return;
        if (/^Solde\b/i.test(texte) || /Solde (du Compte|en votre faveur|en notre faveur)/i.test(texte)) {
          const ms = l.items.filter((i) => RE_MONTANT.test(i.str.trim()));
          if (ms.length >= 2) res.totaux = { debit: montant(ms[ms.length - 2].str), credit: montant(ms[ms.length - 1].str) };
          return;
        }
        const montants = l.items.filter((i) => RE_MONTANT.test(i.str.trim()));
        const mots = l.items.filter((i) => !RE_MONTANT.test(i.str.trim()));
        const premier = mots[0];
        const droite = (i) => i.x + (isNum(i.w) ? i.w : i.str.length * 4.5);
        // Nouvelle opération : date dans la première colonne.
        if (premier && RE_DATE.test(premier.str.trim()) && premier.x < xLibelle - 100) {
          const libelle = mots.slice(1).map((i) => i.str.trim()).join(' ');
          let debit = null, credit = null;
          montants.forEach((i) => {
            const v = montant(i.str);
            if (droite(i) > xCredit) credit = v;
            else if (droite(i) > xDebit) debit = v;
          });
          courante = { date: isoDe(premier.str.trim()), libelle, debit, credit, details: [] };
          res.operations.push(courante);
          return;
        }
        if (!courante) return;
        // Détail des honoraires : « - Honoraires   50,00 ».
        if (/^-\s/.test(texte) && montants.length) {
          courante.details.push({ libelle: mots.map((i) => i.str.trim()).join(' ').replace(/^-\s*/, ''), montant: montant(montants[montants.length - 1].str) });
          return;
        }
        // Suite du libellé sur la ligne suivante.
        if (!montants.length && mots.length) courante.libelle += ' ' + mots.map((i) => i.str.trim()).join(' ');
      });
    });
    res.operations.forEach((o, i) => { o.libelle = o.libelle.replace(/\s+/g, ' ').trim(); o.index = i; });
    if (res.totaux) {
      const d = sum(res.operations, (o) => n(o.debit)), c = sum(res.operations, (o) => n(o.credit));
      if (Math.abs(d - res.totaux.debit) > 0.01 || Math.abs(c - res.totaux.credit) > 0.01) {
        res.avertissements.push('Les totaux lus (débit ' + d.toFixed(2) + ', crédit ' + c.toFixed(2) + ') ne correspondent pas aux totaux du relevé (débit '
          + res.totaux.debit.toFixed(2) + ', crédit ' + res.totaux.credit.toFixed(2) + ') : une ligne a pu être mal lue.');
      }
    }
    if (!res.operations.length) res.avertissements.push('Aucune opération trouvée : ce PDF ne ressemble pas à un relevé de compte de l\'étude.');
    return res;
  }

  /* ---------- 2. Classement des opérations ---------- */
  // Nom de la personne citée après « PVI … : » (déclaration de plus-value) : « M LECOUSTEY Sylvain Robert Maurice ».
  function personneCitee(libelle) {
    const m = /:\s*((?:M|MR|MME|MLLE|Mme|Mlle|Monsieur|Madame)\.?\s+[^-]+?)(?:\s+-\s|$)/.exec(libelle || '');
    return m ? m[1].trim() : '';
  }
  /*
   * cas : 'succession' ou 'vente'. Renvoie { action, libelle, repartition, verifier, nature, personneTexte }.
   * action : 'base' (base de départ), 'retranche' (élément retranché), 'ignore' (sans effet).
   */
  function classer(op, cas) {
    const L = norm(op.libelle);
    const vente = cas === 'vente';
    const r = (action, libelle, o) => Object.assign({ action, libelle, repartition: 'totalite', verifier: false, nature: '' }, o || {});
    if (op.credit && !op.debit) {
      if (/PRIX DE VENTE|PRIX PAYABLE|SOLDE DU PRIX|PRIX COMPTANT/.test(L)) return r('base', 'Prix de vente', { nature: 'prix', verifier: !vente });
      if (/^RECU DE|POUR COMPTE (SS?ION|SUCCESSION)|\bSOLDE (DE )?COMPTE|\bCLOTURE\b|\bLIVRET\b|ASSURANCE.?VIE|CAPITAL DECES/.test(L)) {
        const tiers = (/^RECU DE (.+?) POUR COMPTE/.exec(L) || [])[1];
        return r(vente ? 'ignore' : 'base', tiers ? 'Fonds reçus de ' + tiers.replace(/\b(\w)(\w*)/g, (a, b, c) => b + c.toLowerCase()) : 'Liquidités reçues', { nature: 'liquidites', verifier: vente });
      }
      return r('ignore', '', { nature: 'credit', verifier: !/PRORATA|FONDS DE TRAVAUX|CHARGES|PLUS.?VALUE|PROVISION|FRAIS|RBRST|REMBOURSEMENT/.test(L) });
    }
    // Versements et virements aux parties ou vers un autre compte : sans effet sur l'assiette.
    if (/^A (MME|M|MR|MLLE|MONSIEUR|MADAME|MADEMOISELLE)\.? /.test(L) || /QUOTE.?PART|SOLDE PRIX|PARTIE SUCCESSION|SOLDE QUASI|MONTANT SOLDE|RBRST COMPTE|DEMEMBREMENT/.test(L)) {
      if (!/PLUS.?VALUE|PROVISION SUR FRAIS/.test(L) || /^A (MME|M|MR|MLLE)\.? /.test(L)) return r('ignore', '', { nature: 'versement', verifier: true });
    }
    if (/PROVISION SUR FRAIS/.test(L)) {
      if (/DONATION|VENTE|ACQUISITION/.test(L.replace(/^DE .*? A /, ''))) return r('ignore', '', { nature: 'autre-dossier', verifier: true });
      return r('retranche', 'provision frais règlement succession', { nature: 'provision' });
    }
    if (/QUASI.?USUFRUIT/.test(L)) return r('retranche', 'frais de convention de quasi-usufruit', { nature: 'acte' });
    if (/NOTORIETE/.test(L)) return r('retranche', 'frais de notoriété', { nature: 'acte' });
    if (/OPTION DU CONJOINT|\bOPTION\b/.test(L)) return r('retranche', 'frais d\'option du conjoint', { nature: 'acte' });
    if (/ATTESTATION (DE PROPRIETE|IMMOBILIERE)/.test(L)) return r('retranche', 'frais d\'attestation immobilière', { nature: 'acte' });
    if (/DECLARATION DE SUCCESSION/.test(L)) return r('retranche', 'frais de déclaration de succession', { nature: 'acte' });
    if (/DROITS DE SUCCESSION|\bSIE\b|DGFIP|TRESOR PUBLIC|RECETTE DES (IMPOTS|FINANCES)|SERVICE DES IMPOTS/.test(L)) return r('retranche', 'droits de succession', { nature: 'droits' });
    if (/PROCURATION/.test(L)) return r('retranche', 'honoraires procuration', { nature: 'procuration' });
    if (/MAINLEVEE/.test(L)) return r('retranche', /^DEPOT/.test(L) ? 'dépôt mainlevée' : 'frais mainlevée', { nature: 'mainlevee' });
    if (/^PVI\b|PLUS.?VALUE/.test(L)) return r('retranche', 'plus-value', { nature: 'plus-value', personneTexte: personneCitee(op.libelle), verifier: true });
    if (/\bPRET\b|\bRA\b|REMBOURSEMENT ANTICIPE|CREDIT FONCIER|\bCFF\b|SOLDE (DU )?PRET|ECHEANCE/.test(L)) {
      return r('retranche', /\bRA\b|ANTICIPE/.test(L) && n(op.debit) < 5000 ? 'remboursement anticipé du prêt' : 'remboursement solde prêt', { nature: 'pret', repartition: vente ? 'prorata' : 'totalite' });
    }
    if (/AGENCE|IMMOBILI|\bIAD\b|\bFACT\b|NEGOCIATION|COMMISSION/.test(L)) return r('retranche', 'paiement honoraires agence', { nature: 'agence', verifier: !vente });
    if (/REAFFECTATION/.test(L)) return r('ignore', '', { nature: 'autre', verifier: true });
    if (/COMEDEC|SCEC|ETAT.?CIVIL/.test(L)) return r('retranche', vente ? 'débours' : 'frais de notoriété', { nature: 'debours' });
    if (/^CSI\b|REQUISITION|COPIE/.test(L)) return r('retranche', vente ? 'frais de vente (copies, réquisitions)' : 'frais d\'attestation immobilière', { nature: 'debours', verifier: vente });
    if (/ENREGISTREMENT|\bDEPOT\b|FORMALIT|DEBOURS/.test(L)) return r('retranche', 'frais d\'enregistrement et de formalités', { nature: 'debours', verifier: true });
    if (/HONORAIRES|EMOLUMENTS|\bACTE\b/.test(L)) return r('retranche', 'frais d\'acte', { nature: 'acte', verifier: true });
    return r('ignore', '', { nature: 'autre', verifier: true });
  }

  /* ---------- 3. Calcul ---------- */
  function usufruitParAge(bareme, age) {
    let v = bareme && bareme.length ? bareme[0].usufruit : 0;
    (bareme || []).forEach((row) => { if (age >= row.age) v = row.usufruit; });
    return v;
  }
  function ageAu(naissance, date) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(naissance || ''), b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!a || !b) return null;
    let age = +b[1] - +a[1];
    if (+b[2] < +a[2] || (+b[2] === +a[2] && +b[3] < +a[3])) age--;
    return age;
  }

  /*
   * d = { cas, dateActe, usufruitier: { nom, naissance, age }, nus: [{ id, nom, part, mode }],
   *       base: [{ id, libelle, montant, part }], operations: [{ id, montant, action, libelle, repartition, personne }] }
   * p = { bareme669 }
   */
  function calculer(d, p) {
    const base = (d.base || []).filter((x) => n(x.montant));
    const lignesBase = base.map((x) => {
      const f = fraction(x.part);
      const part = f === null ? 1 : f;
      return { id: x.id, libelle: x.libelle || '', montant: n(x.montant), partTexte: String(x.part || '').trim(), part, demembre: n(x.montant) * part, groupe: x.groupe || '' };
    });
    const brutTotal = sum(lignesBase, (x) => x.montant);
    const brut = sum(lignesBase, (x) => x.demembre);
    const q = brutTotal > 0 ? brut / brutTotal : 1;

    const nus = (d.nus || []).filter(Boolean);
    const ops = (d.operations || []).filter((o) => o.action === 'retranche' && n(o.montant));
    const montantRetenu = (o) => (o.repartition === 'prorata' ? n(o.montant) * q : n(o.montant));
    const personnelle = (o) => o.personne && nus.some((x) => x.id === o.personne);
    // Frais communs : regroupés par libellé (ordre de première apparition).
    const frais = [];
    ops.filter((o) => !personnelle(o)).forEach((o) => {
      const lib = (o.libelle || 'frais').trim();
      let g = frais.find((x) => x.libelle === lib);
      if (!g) frais.push((g = { libelle: lib, montant: 0, lignes: 0 }));
      g.montant += montantRetenu(o);
      g.lignes++;
    });
    frais.forEach((g) => (g.montant = arrondi(g.montant)));
    const totalFrais = arrondi(sum(frais, (x) => x.montant));
    const net = arrondi(brut - totalFrais);

    // Usufruitier : âge au jour de l'acte (ou saisi), valeur de l'usufruit (art. 669 CGI).
    const u = d.usufruitier || {};
    const age = isNum(u.age) ? u.age : ageAu(u.naissance, d.dateActe);
    const usufruit = age === null ? null : usufruitParAge(p && p.bareme669, age);

    const avecPart = nus.some((x) => fraction(x.part) !== null);
    const poids = nus.map((x) => (avecPart ? fraction(x.part) || 0 : 1));
    const totalPoids = sum(poids, (x) => x);
    // Parts arrondies au centime ; l'écart d'arrondi va au dernier, pour que le total fasse le solde.
    const quotes = nus.map((x, i) => arrondi(net * (totalPoids > 0 ? poids[i] / totalPoids : 0)));
    if (quotes.length && totalPoids > 0) {
      const k = quotes.length - 1 - poids.slice().reverse().findIndex((x) => x > 0);
      quotes[k] = arrondi(quotes[k] + net - sum(quotes, (x) => x));
    }
    const lignesNus = nus.map((x, i) => {
      const s = totalPoids > 0 ? poids[i] / totalPoids : 0;
      const quote = quotes[i];
      const propres = ops.filter((o) => o.personne === x.id).map((o) => ({ libelle: (o.libelle || 'frais').trim(), montant: arrondi(n(o.montant)) }));
      const assiette = arrondi(quote - sum(propres, (o) => o.montant));
      const bareme = x.mode === 'bareme';
      return {
        id: x.id, nom: x.nom || '', part: s, partTexte: String(x.part || '').trim(), mode: bareme ? 'bareme' : 'qu', quote, propres, assiette,
        creance: bareme ? 0 : assiette,
        usufruitier: bareme && usufruit !== null ? arrondi(assiette * usufruit) : null,
        nuePropriete: bareme && usufruit !== null ? arrondi(assiette - arrondi(assiette * usufruit)) : null,
      };
    });
    const assietteQU = arrondi(sum(lignesNus.filter((x) => x.mode === 'qu'), (x) => x.assiette));
    const alertes = [];
    if (!lignesBase.length) alertes.push('Base de départ à compléter.');
    if (!nus.length) alertes.push('Aucun nu-propriétaire saisi.');
    if (lignesNus.some((x) => x.mode === 'bareme') && usufruit === null) alertes.push('Âge de l\'usufruitier manquant : la répartition selon le barème ne peut pas être calculée.');
    if (net < 0) alertes.push('Les éléments retranchés dépassent la base de départ.');
    return { lignesBase, brutTotal, brut, q, frais, totalFrais, net, age, usufruit, nus: lignesNus, assietteQU, alertes };
  }

  /* ---------- 4. Tableau et paragraphes pour la convention ---------- */
  const euros = (x) => (Math.round(x * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ') + ' €';
  /*
   * Blocs : { type: 'sous-titre' | 'p' | 'table', texte, lignes, gras }.
   * enLettres(x) : montant en toutes lettres suivi des chiffres.
   */
  function blocs(d, r, enLettres) {
    const lettres = enLettres || ((x) => euros(x));
    const succession = d.cas !== 'vente';
    const B = [];
    const lignes = [];
    const gras = ['Total', 'Total frais :', 'Solde :', 'Assiette du quasi-usufruit :', 'Déduction faite des frais :'];
    const parGroupe = succession && r.lignesBase.some((x) => x.groupe);
    if (parGroupe) {
      // Actif successoral par origine : communauté (moitié), biens propres, biens indivis (quote-part).
      const titres = { commun: 'ACTIF DE COMMUNAUTE', propre: 'BIENS PROPRES DU DEFUNT', indivis: 'BIENS INDIVIS' };
      ['commun', 'propre', 'indivis'].forEach((g) => {
        const ls = r.lignesBase.filter((x) => (x.groupe || 'propre') === g);
        if (!ls.length) return;
        lignes.push([titres[g], '']);
        gras.push(titres[g]);
        ls.forEach((x) => lignes.push([x.libelle || 'Liquidités', euros(x.montant)]));
        const total = sum(ls, (x) => x.montant), dem = sum(ls, (x) => x.demembre);
        if (g === 'commun') {
          if (ls.length > 1) lignes.push(['Total', euros(total)]);
          lignes.push(['1/2 revenant à la succession :', euros(dem)]);
        } else if (g === 'indivis') {
          lignes.push(['Quote-part revenant à la succession :', euros(dem)]);
        } else if (ls.length > 1) lignes.push(['Total', euros(total)]);
      });
      if (new Set(r.lignesBase.map((x) => x.groupe || 'propre')).size > 1) { lignes.push(['Total revenant à la succession :', euros(r.brut)]); gras.push('Total revenant à la succession :'); }
    } else {
      r.lignesBase.forEach((x) => lignes.push([x.libelle || (succession ? 'Liquidités' : 'Prix de vente'), euros(x.montant)]));
      if (r.lignesBase.length > 1) lignes.push(['Total', euros(r.brutTotal)]);
    }
    if (!parGroupe && Math.abs(r.brut - r.brutTotal) > 0.005) {
      const parts = [...new Set(r.lignesBase.map((x) => x.partTexte).filter(Boolean))];
      const libPart = succession
        ? (parts.length === 1 ? parts[0] + ' revenant à la succession' : 'Part revenant à la succession')
        : 'Quote-part sur laquelle s\'exerce le démembrement de propriété' + (parts.length === 1 ? ' (' + parts[0] + ')' : '');
      lignes.push([libPart + ' :', euros(r.brut)]);
    }
    if (r.frais.length) {
      lignes.push(['Déduction faite des frais :', '']);
      r.frais.forEach((f) => lignes.push([f.libelle, euros(f.montant)]));
      lignes.push(['Total frais :', euros(r.totalFrais)]);
    }
    lignes.push(['Solde :', euros(r.net)]);
    const plusieurs = r.nus.length > 1 && (r.nus.some((x) => x.propres.length) || r.nus.some((x) => x.mode === 'bareme'));
    if (plusieurs) {
      r.nus.forEach((x) => {
        lignes.push(['Revenant à ' + (x.nom || 'XXXX') + ' (' + (x.partTexte || fmtFraction(x.part)) + ')', euros(x.quote)]);
        x.propres.forEach((o) => lignes.push([o.libelle + (/^plus-value$/i.test(o.libelle) ? ' due par ' + (x.nom || 'XXXX') : ''), euros(o.montant)]));
        lignes.push([x.mode === 'qu' ? 'Assiette du quasi-usufruit :' : 'Montant réparti selon le barème :', euros(x.assiette)]);
      });
    } else if (r.nus.length === 1 && r.nus[0].propres.length) {
      r.nus[0].propres.forEach((o) => lignes.push([o.libelle + (/^plus-value$/i.test(o.libelle) ? ' due par ' + (r.nus[0].nom || 'XXXX') : ''), euros(o.montant)]));
      lignes.push(['Assiette du quasi-usufruit :', euros(r.nus[0].assiette)]);
    }
    B.push({ type: 'sous-titre', texte: succession ? 'Calcul des droits sur lesquels s\'exerce le quasi-usufruit' : 'Détermination des sommes objets du quasi-usufruit' });
    B.push({ type: 'table', lignes, gras });
    if (!plusieurs && !(r.nus.length === 1 && r.nus[0].propres.length)) B.push({ type: 'p', texte: 'sur lequel s\'exerce les droits en usufruit du conjoint.' });

    const qu = r.nus.filter((x) => x.mode === 'qu');
    if (qu.length) {
      B.push({ type: 'sous-titre', texte: 'Assiette du quasi-usufruit' });
      B.push({ type: 'p', texte: 'En application de l\'article 587 du Code civil, le QUASI-USUFRUITIER exercera un quasi-usufruit sur les sommes ci-dessus déterminées, arrêtées à la somme de : ' + lettres(r.assietteQU) + ' ;' });
      B.push({ type: 'p', texte: 'A l\'extinction de son droit d\'usufruit, le QUASI-USUFRUITIER sera tenu d\'une obligation de restitution ayant pour objet la valeur nominale de ces sommes, soit au profit de chacun des NUS-PROPRIETAIRES :' });
      qu.forEach((x) => B.push({ type: 'p', texte: '- ' + (x.nom || 'XXXX') + ' : ' + lettres(x.creance) + '.' }));
    }
    const bar = r.nus.filter((x) => x.mode === 'bareme');
    if (bar.length) {
      B.push({ type: 'sous-titre', texte: 'Répartition selon le barème fiscal' });
      B.push({ type: 'p', texte: 'Les sommes revenant aux NUS-PROPRIETAIRES ci-après sont réparties entre l\'usufruitier et le nu-propriétaire selon le barème de l\'article 669 du Code général des impôts'
        + (r.age !== null ? ', l\'usufruitier étant âgé de ' + r.age + ' ans (usufruit ' + Math.round(r.usufruit * 100) + ' %, nue-propriété ' + Math.round((1 - r.usufruit) * 100) + ' %)' : '') + ' :' });
      bar.forEach((x) => B.push({ type: 'p', texte: '- sur ' + euros(x.assiette) + ' revenant à ' + (x.nom || 'XXXX') + ' : ' + (x.usufruitier === null ? 'âge de l\'usufruitier à compléter.'
        : euros(x.usufruitier) + ' à l\'usufruitier' + ((d.usufruitier || {}).nom ? ' (' + d.usufruitier.nom + ')' : '') + ' et ' + euros(x.nuePropriete) + ' au nu-propriétaire.') }));
    }
    return B;
  }
  function fmtFraction(f) {
    const connues = [[1, 1], [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 8], [3, 8], [3, 16], [1, 16]];
    const k = connues.find(([a, b]) => Math.abs(a / b - f) < 1e-6);
    return k ? k[0] + '/' + k[1] : Math.round(f * 10000) / 100 + ' %';
  }
  const texte = (B) => B.map((b) => (b.type === 'table' ? b.lignes.map((l) => l.join('\t')).join('\n') : b.texte)).join('\n\n');

  return { lireReleve, classer, personneCitee, calculer, blocs, texte, fraction, montant, ageAu, usufruitParAge, euros, fmtFraction };
});
