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
  // Arrondi au centime (au plus proche, 0,005 arrondi au centime supérieur malgré l'imprécision des nombres décimaux).
  const arrondi = (x) => (x < 0 ? -1 : 1) * Math.round(Math.abs(x) * 100 + 1e-6) / 100;
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

  /* ---------- 1 bis. Lecture de la déclaration de succession (2705-SD) ---------- */
  // Texte d'un PDF : lignes reconstituées (éléments de même hauteur), pages mises bout à bout.
  function texteDesPages(pages) {
    const lignes = [];
    (pages || []).forEach((page) => {
      const rangs = [];
      (page.items || []).filter((i) => String(i.str || '').trim()).slice().sort((a, b) => b.y - a.y || a.x - b.x).forEach((i) => {
        const r = rangs.find((x) => Math.abs(x.y - i.y) <= 2);
        if (r) r.items.push(i); else rangs.push({ y: i.y, items: [i] });
      });
      // Éléments accolés (sans espace dans le PDF) : réunis sans espace (« ORANG » + « E »).
      rangs.forEach((r) => lignes.push(r.items.sort((a, b) => a.x - b.x).reduce((t, i, k, arr) => {
        if (!k) return i.str.trim();
        const prec = arr[k - 1];
        const colle = isNum(prec.w) && i.x - (prec.x + prec.w) < 0.8 && !/\s$/.test(prec.str) && !/^\s/.test(i.str);
        return t + (colle ? '' : ' ') + i.str.trim();
      }, '')));
    });
    return lignes;
  }
  // Mentions répétées sur chaque page du formulaire (en-têtes, affirmation de sincérité, signatures).
  const RE_FORMULAIRE = [/AFFIRMATION DE SINC/i, /A ne signer qu/i, /l[ée]gataires, leurs tuteurs/i, /J'affirme/i, /peines [ée]dict[ée]es/i, /comptant, les cr[ée]ances/i,
    /appartenaient au d[ée]funt/i, /^A\s+\S.*,\s*le\s*…/i, /Signature\(s\)/i, /^Page\s+\d+\s*\/\s*\d+/i, /N°\s*2705/i, /^\(\s*\d{2}\s*-\s*\d{4}\s*\)$/, /^A\s+remplir/i, /R[ée]serv[ée] [àa]/i,
    /^ACTIF ET PASSIF DE LA SUCCESSION/i, /par le d[ée]clarant/i, /l.administration$/i, /^en euros$/i, /DIRECTION GENERALE DES FINANCES/i, /D[ÉE]CLARATION DE SUCCESSION$/i, /feuille de suite/i,
    /@internet/i, /^\d{5}\s*\*\s*\d{2}$/, /^\(1\)\s*[ÉE]noncez/i, /avec le d[ée]funt, leurs date/i];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateEnLettres(t) {
    const m = /(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/i.exec(t || '');
    if (!m) return '';
    const k = MOIS.indexOf(m[2].toLowerCase());
    return k < 0 ? '' : m[3] + '-' + String(k + 1).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
  }
  const civiliteNom = (civ, nom) => (/^Mada/i.test(civ) ? 'Madame ' : 'Monsieur ') + nom.replace(/\s+/g, ' ').trim();

  function lireDDS(source) {
    const lignes = typeof source === 'string' ? source.split('\n') : Array.isArray(source) && typeof source[0] === 'string' ? source : texteDesPages(source);
    const utiles = lignes.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !RE_FORMULAIRE.some((re) => re.test(l)));
    const T = utiles.join(' ').replace(/\s+/g, ' ').replace(/\s*-\s*joint/gi, '-joint').replace(/\s+,/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
      .replace(/\((\d+)\s*\/\s*(\d+)\)/g, '($1/$2)');
    const res = { defunt: '', regime: null, option: null, conjoint: null, heritiers: [], comptes: [], avertissements: [] };

    // Défunt.
    const nomDef = /Nom de naissance du d[ée]funt\s*:\s*(.+?)\s+Pr[ée]nom\(s\)\s*:\s*(.+?)\s+Date de naissance/i.exec(T);
    if (nomDef) res.defunt = (/Succession de\s*:.*?☒\s*Mme/i.test(T) ? 'Mme ' : 'M. ') + nomDef[2].trim().split(' ')[0] + ' ' + nomDef[1].trim().toUpperCase();
    const dec = /D[ée]c[ée]d[ée]\(e\)\s*[àa]\s*.{0,400}?\bLe\s*:\s*(\d{1,2}(?:er)?\s+[a-zéû]+\s+\d{4})/i.exec(T);
    if (dec) res.deces = dateEnLettres(dec[1]);
    // Régime matrimonial.
    const reg = /R[ée]gime matrimonial adopt[ée] par les [ée]poux\s*:\s*(.*?)\s+En cas d/i.exec(T);
    if (reg && /communaut/i.test(reg[1])) res.regime = 'communaute';
    else if ((reg && /s[ée]paration/i.test(reg[1])) || /s[ée]par[ée]\(e\) de biens\s*☒/i.test(T)) res.regime = 'separation';
    else if (/Veuf\(ve\) de\s*:\s*\p{Lu}/u.test(T) || /Divorc[ée]\(e\) de\s*:\s*\p{Lu}/u.test(T) || /☒\s*C[ée]libataire/i.test(T)) res.regime = 'aucun';
    else if (/r[ée]gime de la communaut[ée]/i.test(T)) res.regime = 'communaute';
    else if (/r[ée]gime de la s[ée]paration de biens/i.test(T)) res.regime = 'separation';
    // Option du conjoint survivant.
    const opt = /(?:option du conjoint survivant|Acceptation de la donation entre [ée]poux)(.{0,700}?)(?:Absence de partage|ABSENCE|Attestation|Notori[ée]t[ée]|Consentement|$)/i.exec(T);
    const texteOption = opt ? opt[1] : ((/Quotit[ée] \(part disponible\) choisie\s*:\s*(.*?)\s+Dispositions testamentaires/i.exec(T) || [])[1] || '');
    // Cumul des droits légaux (1/4 en propriété) et de la donation entre époux (usufruit du surplus) :
    // les enfants reçoivent leur part « des TROIS QUARTS des biens de succession ».
    const cumul = /des TROIS QUARTS\s*\(3\/4\)\s*des biens de succession/i.test(T);
    // Imputation (art. 758-6) : usufruit d'une valeur inférieure au quart légal, complété.
    const complement = /compl[ée]ment [àa] hauteur de ses droits l[ée]gaux|valeur de l.usufruit [ée]tant inf[ée]rieure au quart/i.test(T);
    if (complement) {
      res.option = 'complement';
      res.avertissements.push('Droits du conjoint : usufruit de la donation entre époux, inférieur au quart légal, complété en pleine propriété (art. 758-6 C. civ.), d\'après la liquidation de la déclaration. À vérifier.');
    } else if (/trois quarts en usufruit|3\s*\/\s*4 en usufruit/i.test(texteOption)) res.option = 'quart';
    else if (cumul && !complement) {
      res.option = 'quart';
      res.avertissements.push('Droits du conjoint : 1/4 en pleine propriété (droits légaux) et usufruit des 3/4 (donation entre époux), d\'après la liquidation de la déclaration. À vérifier.');
    }
    else if (/usufruit/i.test(texteOption)) res.option = 'usufruit';
    else if (/quart en (pleine )?propri/i.test(texteOption)) { res.option = 'propriete'; res.avertissements.push('Le conjoint a opté pour une part en pleine propriété : pas d\'usufruit, à vérifier.'); }
    // Conjoint survivant (quasi-usufruitier).
    const cj = /Son conjoint survivant\s+(Madame|Monsieur)\s+([^,]+?),(.{0,400}?)N[ée]e? [àa]\s.{0,80}?,\s*le\s+(\d{1,2}(?:er)?\s+[a-zéû]+\s+\d{4})/i.exec(T);
    if (cj) res.conjoint = { nom: civiliteNom(cj[1], cj[2]), naissance: dateEnLettres(cj[4]) };
    // Héritiers et proportions.
    const her = /Ses h[ée]ritiers(.*?)(?:Qualit[ée]s h[ée]r[ée]ditaires|QUALITES HEREDITAIRES)/i.exec(T);
    if (her) {
      const re = /\d+\)\s*(Madame|Monsieur)\s+([^,]+?)\s*,/g;
      let m;
      while ((m = re.exec(her[1]))) res.heritiers.push({ nom: civiliteNom(m[1], m[2]), part: '' });
    }
    const prop = /Proportions h[ée]r[ée]ditaires(.*?)(?:EXPOSE|RAPPEL DES ACTES|$)/i.exec(T);
    if (prop) {
      const re = /-\s*(Madame|Monsieur)\s+([^,]+?)\s*,\s*pour\s+[^(]*\((\d+\s*\/\s*\d+)\)/g;
      let m;
      while ((m = re.exec(prop[1]))) {
        const mots = m[2].toUpperCase().split(/\s+/);
        const h = res.heritiers.find((x) => { const ws = x.nom.toUpperCase().split(/\s+/); return mots.every((w) => ws.includes(w)); });
        if (h) h.part = m[3].replace(/\s/g, '');
      }
    }
    // Comptes bancaires : actif de communauté, puis actif de succession (biens propres).
    const sections = [
      { code: 'communaute', re: /ACTIF DE COMMUNAUTE(.*?)(?:PASSIF DE COMMUNAUTE|Soit un actif brut de communaut)/i },
      { code: 'succession', re: /ACTIF DE SUCCESSION(.*?)(?:PASSIF DE SUCCESSION|Soit un actif brut de succession)/i },
    ];
    sections.forEach((sec) => {
      const m = sec.re.exec(T);
      if (!m) return;
      const zone = m[1];
      const tetes = [];
      const reTete = /(\d+)\)\s*(?:A|Au|Aux|À|Auprès de)\s+(?:la\s+|le\s+|l')?(.+?),\s*agence\s+(?:de\s+|d')?(.+?),\s*(?:\((\d{5})\)\s*,?\s*:?)?/g;
      let t;
      while ((t = reTete.exec(zone))) tetes.push({ index: t.index, fin: reTete.lastIndex, etab: t[2].trim(), agence: t[3].trim() + (t[4] ? ' (' + t[4] + ')' : '') });
      tetes.forEach((tt, k) => {
        let bloc = zone.slice(tt.fin, k + 1 < tetes.length ? tetes[k + 1].index : zone.length);
        const coupe = /\s\d+\)\s*(?:La|Le|Les|L')\s/.exec(bloc);
        if (coupe) bloc = bloc.slice(0, coupe.index);
        const reCompte = /-\s*(Au nom du (D[ÉE]FUNT|CONJOINT)|Au nom de\s+[^,]+|En compte-joint|En indivision|Au nom des deux [ée]poux)\s*,\s*(?:le|la|l')\s*(.+?)\s+num[ée]ro\s+([^,]+?)\s*,(.*?)\(([\d\s.]+,\d{2})\s*€\)(?=(.{0,60}))/gi;
        let c;
        while ((c = reCompte.exec(bloc))) {
          const tit = /CONJOINT/i.test(c[1]) ? 'conjoint' : /joint|deux|indivision/i.test(c[1]) ? 'joint' : 'defunt';
          // « dont la moitié (1/2) appartenant à la succession ».
          const qp = /dont\s+(?:la|une)?\s*[^()]{0,30}\((\d+\/\d+)\)\s*appartenant/i.exec(c[7]);
          res.comptes.push({
            etablissement: tt.etab, agence: tt.agence, titulaire: tit, type: c[3].replace(/\s+/g, ' ').trim(), numero: c[4].replace(/\s+/g, ''),
            montant: montant(c[6]), section: sec.code, part: qp ? qp[1] : '', indivision: /indivision/i.test(c[1]),
            formule: /capital et int[ée]r[êe]ts/i.test(c[5]) ? 'capital' : /solde cr[ée]diteur/i.test(c[5]) ? 'solde' : '',
          });
        }
      });
    });
    if (!res.comptes.length) res.avertissements.push('Aucun compte bancaire trouvé dans la déclaration : saisissez-les à la main.');
    if (!res.regime) res.avertissements.push('Régime matrimonial non trouvé : à indiquer.');
    if (!res.option) res.avertissements.push('Option du conjoint non trouvée : à indiquer.');
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
    if (/DROITS DE SUCCESSION|DROITS SS?ION|PAIEMENT DES DROITS|DROITS DE MUTATION|\bDMTG\b|\bSIE\b|\bSPFE\b|\bSDE\b|DGFIP|TRESOR PUBLIC|RECETTE DES (IMPOTS|FINANCES)|SERVICE DES IMPOTS|IMPOTS? .*SUCCESSION/.test(L)) return r('retranche', 'droits de succession', { nature: 'droits' });
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
  /*
   * Imputation de l'article 758-6 C. civ. : la libéralité en usufruit de la totalité (valeur u, barème de
   * l'art. 669) s'impute sur les droits légaux (quart en pleine propriété). Si u < 1/4, le conjoint reçoit un
   * complément en pleine propriété x tel que x + u (1 − x) = 1/4, soit x = (1/4 − u) / (1 − u) ;
   * son usufruit porte sur le surplus (1 − x).
   */
  const complementConjoint = (u) => (isNum(u) && u < 0.25 && u < 1 ? (0.25 - u) / (1 - u) : 0);
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
    // Les comptes au décès sont gardés même à solde nul (ils figurent dans le détail de l'acte).
    const base = (d.base || []).filter((x) => n(x.montant) || (x.compte && isNum(x.montant)));
    const lignesBase = base.map((x) => {
      const f = fraction(x.part);
      const part = f === null ? 1 : f;
      return {
        id: x.id, libelle: x.libelle || '', montant: n(x.montant), partTexte: String(x.part || '').trim(), part, demembre: arrondi(n(x.montant) * part),
        groupe: x.groupe || (Math.abs(part - 0.5) < 1e-9 ? 'commun' : part < 1 ? 'indivis' : 'propre'),
        compte: x.compte || null, actif: !!x.actif,
      };
    });
    const brutTotal = sum(lignesBase, (x) => x.montant);
    // Succession : part de la succession sur laquelle le conjoint a l'usufruit, selon son option (ex. 3/4).
    const fu = fraction(d.partUsufruit);
    const partUsufruit = fu === null || fu <= 0 ? 1 : Math.min(1, fu);
    const brutSuccession = arrondi(sum(lignesBase, (x) => x.demembre));
    const brut = arrondi(brutSuccession * partUsufruit);
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
    return { lignesBase, brutTotal, brutSuccession, partUsufruit, partUsufruitTexte: String(d.partUsufruit || '').trim(), brut, q, frais, totalFrais, net, age, usufruit, nus: lignesNus, assietteQU, alertes };
  }

  /* ---------- 4. Tableau et paragraphes pour la convention ---------- */
  const euros = (x) => arrondi(x).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ') + ' €';
  /*
   * Blocs : { type: 'titre' | 'sous-titre' | 'p' | 'table', texte, lignes, gras, droite, sansBordure }.
   * enLettres(x) : montant en toutes lettres suivi des chiffres.
   * Succession : trame « II – Calcul des droits sur lesquels s'exerce le quasi-usufruit » (comptes regroupés
   * par établissement, détail des comptes au décès, assiette). Vente : détermination des sommes.
   * La dette de restitution est indiquée pour son montant global.
   */
  const TITULAIRES = { defunt: 'Au nom du DEFUNT', conjoint: 'Au nom du CONJOINT', joint: 'En compte-joint', indivision: 'En indivision' };
  const FRACTIONS_LETTRES = { '1/2': 'la moitié', '1/3': 'le tiers', '2/3': 'les deux tiers', '1/4': 'le quart', '3/4': 'les trois quarts' };
  const estLivret = (t) => /LIVRET|LDD|LEP|PEL|CEL|EPARGNE|PLAN/i.test(t || '');
  function blocs(d, r, enLettres) {
    const lettres = enLettres || ((x) => euros(x));
    const succession = d.cas !== 'vente';
    const B = [];
    const lignes = [];
    const gras = ['Total', 'Total frais :', 'Solde :', 'Assiette du quasi-usufruit :', 'Déduction faite des frais :'];
    const nomEtab = (x) => ((x.compte && x.compte.etablissement) || x.libelle || 'Liquidités').trim();
    // Comptes regroupés par établissement : « Comptes BNP PARIBAS ».
    const parEtablissement = (ls) => {
      const g = [];
      ls.forEach((x) => {
        const k = nomEtab(x).toUpperCase();
        let e = g.find((y) => y.cle === k);
        if (!e) g.push((e = { cle: k, nom: nomEtab(x), montant: 0, nb: 0, lignes: [] }));
        e.montant += x.montant; e.nb++; e.lignes.push(x);
      });
      return g;
    };
    const libGroupe = (e) => (e.lignes.some((x) => x.compte) ? (e.nb > 1 ? 'Comptes ' : 'Compte ') + e.nom : e.nom);
    const sansCommunaute = succession && !r.lignesBase.some((x) => x.groupe === 'commun');
    if (sansCommunaute) {
      // Pas de communauté : actif de succession par banque, pour la part revenant à la succession (comme la déclaration).
      lignes.push(['ACTIF DE SUCCESSION', '']);
      gras.push('ACTIF DE SUCCESSION');
      const etabs = parEtablissement(r.lignesBase);
      etabs.forEach((e) => lignes.push([libGroupe(e), euros(sum(e.lignes, (x) => x.demembre))]));
      if (etabs.length > 1) lignes.push(['Total', euros(r.brutSuccession)]);
      if (r.partUsufruit < 1) lignes.push(['Droits du conjoint en usufruit (' + (r.partUsufruitTexte || fmtFraction(r.partUsufruit)) + ') :', euros(r.brut)]);
    } else if (succession) {
      const titres = { commun: 'ACTIF DE COMMUNAUTE', propre: 'BIENS PROPRES DU DEFUNT', indivis: 'BIENS INDIVIS' };
      const groupes = ['commun', 'propre', 'indivis'].filter((g) => r.lignesBase.some((x) => (x.groupe || 'propre') === g));
      groupes.forEach((g) => {
        const ls = r.lignesBase.filter((x) => (x.groupe || 'propre') === g);
        lignes.push([titres[g], '']);
        gras.push(titres[g]);
        const etabs = parEtablissement(ls);
        etabs.forEach((e) => lignes.push([libGroupe(e), euros(e.montant)]));
        const total = sum(ls, (x) => x.montant), dem = sum(ls, (x) => x.demembre);
        if (etabs.length > 1 || g === 'commun') lignes.push(['Total', euros(total)]);
        if (g === 'commun') lignes.push(['1/2 revenant à la succession :', euros(dem)]);
        else if (g === 'indivis') lignes.push(['Quote-part revenant à la succession :', euros(dem)]);
      });
      if (groupes.length > 1) { lignes.push(['Total revenant à la succession :', euros(r.brutSuccession)]); gras.push('Total revenant à la succession :'); }
      if (r.partUsufruit < 1) lignes.push(['Droits du conjoint en usufruit (' + (r.partUsufruitTexte || fmtFraction(r.partUsufruit)) + ') :', euros(r.brut)]);
    } else {
      r.lignesBase.forEach((x) => lignes.push([x.libelle || 'Prix de vente', euros(x.montant)]));
      if (r.lignesBase.length > 1) lignes.push(['Total', euros(r.brutTotal)]);
      if (Math.abs(r.brut - r.brutTotal) > 0.005) {
        const parts = [...new Set(r.lignesBase.map((x) => x.partTexte).filter(Boolean))];
        lignes.push(['Quote-part sur laquelle s\'exerce le démembrement de propriété' + (parts.length === 1 ? ' (' + parts[0] + ')' : '') + ' :', euros(r.brut)]);
      }
    }
    if (r.frais.length) {
      lignes.push(['Déduction faite des frais :', '']);
      r.frais.forEach((f) => lignes.push([f.libelle, euros(f.montant)]));
      lignes.push(['Total frais :', euros(r.totalFrais)]);
    }
    lignes.push(['Solde :', euros(r.net)]);
    const detailNus = r.nus.length > 1 && (r.nus.some((x) => x.propres.length) || r.nus.some((x) => x.mode === 'bareme'));
    if (detailNus) {
      r.nus.forEach((x) => {
        lignes.push(['Revenant à ' + (x.nom || 'XXXX') + ' (' + (x.partTexte || fmtFraction(x.part)) + ')', euros(x.quote)]);
        x.propres.forEach((o) => lignes.push([o.libelle + (/^plus-value$/i.test(o.libelle) ? ' due par ' + (x.nom || 'XXXX') : ''), euros(o.montant)]));
        lignes.push([x.mode === 'qu' ? 'Assiette du quasi-usufruit :' : 'Montant réparti selon le barème :', euros(x.assiette)]);
      });
    } else if (r.nus.length === 1 && r.nus[0].propres.length) {
      r.nus[0].propres.forEach((o) => lignes.push([o.libelle + (/^plus-value$/i.test(o.libelle) ? ' due par ' + (r.nus[0].nom || 'XXXX') : ''), euros(o.montant)]));
      lignes.push(['Assiette du quasi-usufruit :', euros(r.nus[0].assiette)]);
    }
    B.push({ type: 'sous-titre', texte: succession ? 'II - CALCUL DES DROITS SUR LESQUELS S\'EXERCE LE QUASI-USUFRUIT' : 'DETERMINATION DES SOMMES OBJETS DU QUASI-USUFRUIT' });
    B.push({ type: 'table', lignes, gras, sansBordure: true });
    if (!detailNus && !(r.nus.length === 1 && r.nus[0].propres.length)) B.push({ type: 'p', texte: 'sur lequel s\'exerce les droits en usufruit du conjoint.' });
    if (succession && d.precisionUsufruit) B.push({ type: 'p', texte: d.precisionUsufruit });

    // Détail des comptes au décès (déclaration de succession) et des autres actifs (parts de SCPI…).
    const comptes = r.lignesBase.filter((x) => x.compte);
    const autres = succession ? r.lignesBase.filter((x) => !x.compte && x.actif) : [];
    if (succession && (comptes.length || autres.length)) {
      if (comptes.length) B.push({ type: 'p', texte: 'Précision étant ici faite que les comptes bancaires se composaient au décès des comptes suivants :' });
      parEtablissement(comptes).forEach((e) => {
        const c0 = e.lignes[0].compte;
        B.push({ type: 'p', texte: 'Auprès de ' + e.nom + (c0.agence ? ', agence de ' + c0.agence : '') + ',' });
        e.lignes.forEach((x) => {
          const c = x.compte;
          const type = (c.type || 'compte').trim();
          const designation = /^compte/i.test(type) ? 'le ' + type.charAt(0).toLowerCase() + type.slice(1) : 'le ' + type;
          const qp = x.groupe === 'indivis' && x.part < 1 ? (x.partTexte || fmtFraction(x.part)) : '';
          B.push({ type: 'p', texte: '- ' + (TITULAIRES[c.titulaire] || TITULAIRES.defunt) + ', ' + designation + (c.numero ? ' numéro ' + c.numero : '') + ', '
            + ((c.formule ? c.formule === 'capital' : estLivret(type)) ? 'd\'un montant en capital et intérêts' : 'd\'un solde créditeur') + ', au jour du décès, de ' + lettres(x.montant)
            + (qp ? ', dont ' + (FRACTIONS_LETTRES[qp] || qp) + ' (' + qp + ') appartenant à la succession, soit la somme de ' + lettres(x.demembre) : '') + ',' });
          B.push({ type: 'p', texte: 'Ci, ' + euros(qp ? x.demembre : x.montant), droite: true });
        });
        const totalEtab = sansCommunaute ? sum(e.lignes, (x) => x.demembre) : e.montant;
        if (e.nb > 1) B.push({ type: 'p', texte: 'Soit un montant total auprès de ' + e.nom + ', de ' + lettres(totalEtab) + '.' });
      });
      if (autres.length) {
        B.push({ type: 'p', texte: comptes.length ? 'Et que les autres actifs financiers se composaient au décès des éléments suivants :' : 'Précision étant ici faite que les actifs financiers se composaient au décès des éléments suivants :' });
        autres.forEach((x) => {
          const qp = x.part < 1 ? (x.partTexte || fmtFraction(x.part)) : '';
          B.push({ type: 'p', texte: '- ' + (x.libelle || 'Actif') + ', d\'une valeur au jour du décès de ' + lettres(x.montant)
            + (qp ? ', dont ' + (FRACTIONS_LETTRES[qp] || qp) + ' (' + qp + ') revenant à la succession, soit la somme de ' + lettres(x.demembre) : '') + ',' });
          B.push({ type: 'p', texte: 'Ci, ' + euros(qp ? x.demembre : x.montant), droite: true });
        });
      }
      const plusieurs = r.nus.length > 1;
      B.push({ type: 'p', texte: plusieurs ? 'Les nus-propriétaires déclarent renoncer à demander qu\'il soit fait plus ample inventaire, l\'état de l\'actif net ainsi déclaré leur étant suffisant.'
        : 'Le nu-propriétaire déclare renoncer à demander qu\'il soit fait plus ample inventaire, l\'état de l\'actif net ainsi déclaré lui étant suffisant.' });
    }

    const qu = r.nus.filter((x) => x.mode === 'qu');
    if (qu.length || !r.nus.length) {
      B.push({ type: 'sous-titre', texte: 'ASSIETTE DU QUASI-USUFRUIT' });
      B.push({ type: 'p', texte: succession
        ? 'En application pure et simple de l\'article 587 du Code civil, le QUASI-USUFRUITIER exercera un quasi-usufruit sur les actifs financiers ci-dessus énumérés et arrêtés au jour du décès à la somme de : ' + lettres(r.assietteQU) + ' ;'
        : 'En application pure et simple de l\'article 587 du Code civil, le QUASI-USUFRUITIER exercera un quasi-usufruit sur la quote-part du prix de vente ci-dessus déterminée, arrêtée à la somme de : ' + lettres(r.assietteQU) + ' ;' });
      B.push({ type: 'p', texte: 'A l\'extinction de son droit d\'usufruit, le QUASI-USUFRUITIER sera tenu d\'une obligation de restitution, ayant pour objet la valeur nominale des sommes ci-dessus déterminées, soit la somme globale de ' + lettres(r.assietteQU) + '.' });
    }
    const bar = r.nus.filter((x) => x.mode === 'bareme');
    if (bar.length) {
      B.push({ type: 'sous-titre', texte: 'REPARTITION SELON LE BAREME FISCAL' });
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

  return { complementConjoint, lireReleve, lireDDS, texteDesPages, classer, personneCitee, calculer, blocs, texte, fraction, montant, ageAu, usufruitParAge, euros, fmtFraction };
});
