/*
 * Moteur de rédaction — Origine de propriété.
 *   1. Les personnes sont saisies une seule fois (état civil complet).
 *   2. Les actes forment la chaîne de propriété, du plus récent au plus ancien.
 *   3. Chaque acte est rédigé à partir de sa trame ; une personne déjà désignée plus haut
 *      (ou dans l'acte en cours) est simplement rappelée : « Monsieur Jean DUPONT, susnommé ».
 * Fonctions pures : aucune dépendance au navigateur, testables sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./lettres.js'), require('./trames.js'));
  } else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.origine = factory(root.Atelier.lettres, root.Atelier.tramesOrigine);
  }
})(typeof self !== 'undefined' ? self : this, function (L, T) {
  'use strict';

  const PARITE_FRANC = 6.55957;
  const VIDE = '......................';

  /* ======================================================================
     1. Trames : lecture et rendu
     ====================================================================== */

  const parseCache = new Map();

  // Analyse une trame en arbre de nœuds : texte, variable, condition, accord.
  function parse(src) {
    if (parseCache.has(src)) return parseCache.get(src);
    const erreurs = [];
    const racine = [];
    const pile = [{ noeud: null, liste: racine }];
    const tokens = String(src || '').split(/(\{[^{}]*\})/);
    for (const tok of tokens) {
      if (!tok) continue;
      const courant = pile[pile.length - 1];
      if (tok[0] !== '{' || tok[tok.length - 1] !== '}') {
        courant.liste.push({ type: 'texte', texte: tok });
        continue;
      }
      const inner = tok.slice(1, -1).trim();
      let m;
      if ((m = /^si\s+(.+)$/i.exec(inner))) {
        const n = { type: 'si', cond: parseCondition(m[1]), alors: [], sinon: [] };
        courant.liste.push(n);
        pile.push({ noeud: n, liste: n.alors });
      } else if (/^sinon$/i.test(inner)) {
        if (courant.noeud) courant.liste = courant.noeud.sinon;
        else erreurs.push('{sinon} sans {si} correspondant.');
      } else if (/^fin$/i.test(inner)) {
        if (pile.length > 1) pile.pop();
        else erreurs.push('{fin} sans {si} correspondant.');
      } else if ((m = /^accord\s+([\p{L}_]+)\s*:([\s\S]*)$/u.exec(inner))) {
        courant.liste.push({ type: 'accord', groupe: m[1], formes: m[2].split('|').map((x) => x.trim()) });
      } else if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(inner)) {
        courant.liste.push({ type: 'variable', nom: inner });
      } else {
        courant.liste.push({ type: 'texte', texte: tok });
        erreurs.push('Élément non reconnu : ' + tok);
      }
    }
    if (pile.length > 1) erreurs.push('Il manque ' + (pile.length - 1) + ' {fin}.');
    const res = { noeuds: racine, erreurs };
    parseCache.set(src, res);
    return res;
  }

  function parseCondition(s) {
    let m;
    if ((m = /^non\s+([\p{L}_][\p{L}\p{N}_]*)$/u.exec(s.trim()))) return { nom: m[1], non: true };
    if ((m = /^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+)$/u.exec(s.trim()))) return { nom: m[1], egal: m[2].trim() };
    return { nom: s.trim() };
  }

  // Valeur calculée à la demande (au moment où elle est rédigée, pour respecter l'ordre des mentions).
  function lazy(present, fn) {
    return { __lazy: true, present: !!present, fn };
  }
  const manque = (libelle) => ({ m: libelle });

  function estPresent(v) {
    if (v === null || v === undefined || v === false) return false;
    if (v.__lazy) return v.present;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
  }

  function valeurBrute(v) {
    if (v && v.__lazy) return v.raw !== undefined ? v.raw : '';
    return v === null || v === undefined ? '' : String(v);
  }

  /*
   * scope : { vars, groupes, ctx } — ctx : { trames, options, personnes, mentionnees, erreurs, inconnues }
   */
  function rendreNoeuds(noeuds, scope, out) {
    for (const n of noeuds) {
      if (n.type === 'texte') out.push({ t: n.texte });
      else if (n.type === 'variable') {
        if (!(n.nom in scope.vars)) {
          scope.ctx.inconnues.add(n.nom);
          out.push({ t: '{' + n.nom + '}' });
        } else rendreValeur(scope.vars[n.nom], scope, out, libelle(n.nom));
      } else if (n.type === 'si') {
        const c = n.cond;
        if (!(c.nom in scope.vars)) scope.ctx.inconnues.add(c.nom);
        const v = scope.vars[c.nom];
        let ok = c.egal !== undefined ? valeurBrute(v).toLowerCase() === c.egal.toLowerCase() : estPresent(v);
        if (c.non) ok = !ok;
        rendreNoeuds(ok ? n.alors : n.sinon, scope, out);
      } else if (n.type === 'accord') {
        out.push({ t: accorder(scope.groupes[n.groupe], n.formes) });
      }
    }
    return out;
  }

  function rendreValeur(v, scope, out, lib) {
    if (v === null || v === undefined) out.push(manque(lib));
    else if (v.__lazy) rendreValeur(v.fn(scope), scope, out, lib);
    else if (Array.isArray(v)) v.forEach((x) => rendreValeur(x, scope, out, lib));
    else if (typeof v === 'object' && ('t' in v || 'm' in v)) out.push(v);
    else out.push({ t: String(v) });
  }

  // Formes : 2 (singulier | pluriel) ou 4 (masc. sing. | fém. sing. | masc. plur. | fém. plur.).
  function accorder(g, formes) {
    const grp = g || { n: 1, f: false };
    const pluriel = grp.n > 1;
    if (formes.length >= 4) return formes[(pluriel ? 2 : 0) + (grp.f ? 1 : 0)];
    if (formes.length === 3) return pluriel ? formes[2] : formes[grp.f ? 1 : 0];
    if (formes.length === 2) return formes[pluriel ? 1 : 0];
    return formes[0] || '';
  }

  function rendreTrame(id, vars, groupes, ctx) {
    const src = ctx.trames[id] !== undefined ? ctx.trames[id] : T.defaults[id];
    const p = parse(src);
    p.erreurs.forEach((e) => ctx.erreurs.add(nomTrame(id) + ' : ' + e));
    return rendreNoeuds(p.noeuds, { vars, groupes, ctx }, []);
  }

  /* ======================================================================
     2. Personnes
     ====================================================================== */

  const CIVILITES = { M: 'Monsieur', Mme: 'Madame' };
  const txt = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);
  const majuscules = (s) => (txt(s) ? s.trim().toLocaleUpperCase('fr-FR') : null);
  // Personne morale (société, SCI…) : désignée « la société X », accord au féminin.
  const nomCourt = (p) => (p.morale ? 'la société ' + (majuscules(p.nom) || '') : [CIVILITES[p.civilite] || 'Monsieur', txt(p.prenoms), majuscules(p.nom)].filter(Boolean).join(' '));
  const feminin = (p) => p.morale || p.civilite === 'Mme';
  const groupe = (personnes) => ({ n: personnes.length, f: personnes.length > 0 && personnes.every(feminin) });
  const formatSiren = (s) => (s || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');
  // Le vendeur aux présentes (propriétaire actuel) est désigné « le VENDEUR » : accord au masculin singulier.
  const estVendeur = (p, ctx) => ctx.vendeurs.has(p.id);
  const tousVendeurs = (pers, ctx) => pers.length > 0 && pers.every((p) => estVendeur(p, ctx));
  const groupeCtx = (pers, ctx) => (tousVendeurs(pers, ctx) ? { n: 1, f: false } : groupe(pers));

  function dateTexte(iso, ctx) {
    return L.parseDate(iso) ? L.date(iso, ctx.options.datesEnLettres) : null;
  }

  function lieuDateDeces(p, ctx) {
    const lieu = txt(p.decesLieu);
    return [p.decesDomicile ? 'en son domicile à ' : 'à ', lieu === null ? manque('lieu du décès') : lieu, ', le ', dateTexte(p.decesDate, ctx) || manque('date du décès')];
  }

  function varsPersonne(p, ctx) {
    if (p.morale) {
      return {
        civilite: 'la société', prenoms: '', nom: majuscules(p.nom), denomination: majuscules(p.nom),
        siege: txt(p.domicile), siren: formatSiren(p.siren) || null, forme: txt(p.profession) || '',
      };
    }
    return {
      civilite: CIVILITES[p.civilite] || 'Monsieur',
      prenoms: txt(p.prenoms),
      nom: majuscules(p.nom),
      nom_usage: majuscules(p.nomUsage) || '',
      profession: txt(p.profession) || '',
      domicile: txt(p.domicile),
      naissance_lieu: txt(p.naissanceLieu),
      naissance_date: dateTexte(p.naissanceDate, ctx),
      situation: txt(p.situation) || '',
      nationalite: txt(p.nationalite) || '',
      decede: p.decede ? 'oui' : '',
    };
  }

  // Désignation d'une personne : état civil complet à la première mention, rappel ensuite.
  function designer(p, ctx, forcerRappel) {
    const g = { personne: groupe([p]) };
    if (estVendeur(p, ctx)) return rendreTrame('commun:vendeur_nomme', varsPersonne(p, ctx), g, ctx);
    if (p.morale && !(forcerRappel || p.dejaDesigne || ctx.mentionnees.has(p.id))) {
      ctx.mentionnees.add(p.id);
      return rendreTrame('commun:societe', varsPersonne(p, ctx), g, ctx);
    }
    if (forcerRappel || p.dejaDesigne || ctx.mentionnees.has(p.id)) return rendreTrame('commun:personne_rappel', varsPersonne(p, ctx), g, ctx);
    ctx.mentionnees.add(p.id);
    return rendreTrame('commun:personne', varsPersonne(p, ctx), g, ctx);
  }

  function liste(parts) {
    const out = [];
    parts.forEach((x, i) => {
      if (i > 0) out.push({ t: i === parts.length - 1 ? ' et ' : ', ' });
      out.push(x);
    });
    return out;
  }

  // Variable « personnes » (désignations successives, avec rappel groupé « susnommés »).
  function personnesVar(ids, ctx, libelleVide) {
    const pers = (ids || []).map((id) => ctx.personnes[id]).filter(Boolean);
    if (!pers.length) return null;
    return lazy(true, () => {
      if (tousVendeurs(pers, ctx)) return rendreTrame('commun:vendeur', {}, {}, ctx);
      const dejaTous = pers.length > 1 && pers.every((p) => p.dejaDesigne || ctx.mentionnees.has(p.id));
      if (dejaTous) {
        const g = groupe(pers);
        return liste(pers.map((p) => nomCourt(p))).concat({ t: ', ' + accorder(g, ['susnommé', 'susnommée', 'susnommés', 'susnommées']) });
      }
      return liste(pers.map((p) => designer(p, ctx)));
    });
  }
  const nomsVar = (ids, ctx) => {
    const pers = (ids || []).map((id) => ctx.personnes[id]).filter(Boolean);
    if (!pers.length) return null;
    if (tousVendeurs(pers, ctx)) return lazy(true, () => rendreTrame('commun:vendeur', {}, {}, ctx));
    return liste(pers.map(nomCourt));
  };
  const personnesDe = (ids, ctx) => (ids || []).map((id) => ctx.personnes[id]).filter(Boolean);

  /* ======================================================================
     3. Éléments communs aux actes
     ====================================================================== */

  /*
   * Prénom avant le NOM : « NEGRIN-MORTEAU Nathalie » → « Nathalie NEGRIN-MORTEAU ».
   * Le nom est repéré par ses capitales ; un nom saisi entièrement en capitales ou en minuscules est laissé tel quel.
   */
  function prenomAvantNom(s) {
    const t = txt(s);
    if (!t) return t;
    const mots = t.split(/\s+/);
    const estNom = (m) => /[A-ZÀ-Ý]{2}/.test(m) && m === m.toLocaleUpperCase('fr-FR');
    const i = mots.findIndex((m) => !estNom(m));
    // Seulement si le texte commence par le nom en capitales et se poursuit par des prénoms.
    if (i <= 0 || !mots.slice(i).every((m) => !estNom(m))) return t;
    return mots.slice(i).concat(mots.slice(0, i)).join(' ');
  }
  function notaireVar(n, ctx) {
    if (!n || (!txt(n.nom) && !txt(n.ville))) return null;
    return lazy(true, () => rendreTrame('commun:notaire', { notaire_nom: prenomAvantNom(n.nom), notaire_ville: majuscules(n.ville) }, {}, ctx));
  }
  const memeNotaire = (a, b) => a && b && txt(a.nom) && (a.nom || '').trim().toLowerCase() === (b.nom || '').trim().toLowerCase();

  function montantVar(valeur, devise, ctx) {
    if (typeof valeur !== 'number' || !isFinite(valeur)) return null;
    let s = L.montant(valeur, devise, ctx.options.prixEnLettres !== false);
    if (devise === 'FRF') s += ', soit ' + L.chiffres(valeur / PARITE_FRANC) + ' EUR';
    return s;
  }

  const AVANT_1956 = (iso) => L.parseDate(iso) && iso < '1956-01-01';

  function publicationVar(a, terminaison, ctx) {
    const p = a.publication || {};
    if (!txt(p.service) && !txt(p.date) && !txt(p.volume) && !txt(p.numero)) return null;
    const ancienne = AVANT_1956(p.date || a.date);
    return lazy(true, () => rendreTrame(ancienne ? 'commun:publication_ancienne' : 'commun:publication', {
      service: txt(p.service), date_publication: dateTexte(p.date, ctx), volume: txt(p.volume), numero: txt(p.numero), e: terminaison,
    }, {}, ctx));
  }

  function etatVar(a) {
    const e = a.etat || {};
    if (e.mode === 'texte') return txt(e.texte);
    return 'était négatif de saisie, demande en nullité et inscription';
  }

  // Avant le 1er janvier 2022 : privilège de vendeur ; depuis : hypothèque légale spéciale.
  const hypothequeVendeur = (a) => (L.parseDate(a.date) && a.date < '2022-01-01' ? 'privilège de vendeur' : 'l\'hypothèque légale spéciale de vendeur');

  function testamentVar(a, ctx) {
    const date = dateTexte(a.testamentDate, ctx) || manque('date du testament');
    const n1 = notaireVar(a.testamentNotaire, ctx) || manque('notaire du testament');
    if (a.testamentForme === 'olographe') {
      return ['de son testament fait en la forme olographe à ', txt(a.testamentLieu) || manque('lieu du testament'), ', le ', date,
        ', déposé au rang des minutes de ', n1, ', suivant procès-verbal d\'ouverture et de description en date du ', dateTexte(a.depotDate, ctx) || manque('date du dépôt')];
    }
    if (a.testamentForme === 'temoins') return ['d\'un testament reçu, en présence de témoins, par ', n1, ', le ', date];
    return ['d\'un testament reçu par ', n1, ' et ', notaireVar(a.testamentNotaire2, ctx) || manque('second notaire'), ', le ', date];
  }

  // « ainsi que le constatent deux actes de notoriété dressés par Me X, notaire à Y, savoir : l'un après le décès de… »
  function notorietesVar(ids, notaire, ctx) {
    const pers = personnesDe(ids, ctx);
    if (!pers.length) return null;
    const n = notaireVar(notaire, ctx) || manque('notaire des notoriétés');
    const apres = (p) => ['après le décès de ', nomCourt(p), ', survenu ', lieuDateDeces(p, ctx)];
    if (pers.length === 1) return ['ainsi que le constate un acte de notoriété dressé par ', n, ', ', apres(pers[0])];
    const parts = ['ainsi que le constatent ', L.enLettres(pers.length), ' actes de notoriété dressés par ', n, ', savoir : '];
    if (pers.length === 2) return parts.concat(['l\'un ', apres(pers[0]), ', et l\'autre ', apres(pers[1])]);
    return parts.concat(liste(pers.map(apres)));
  }

  function lieuDateDecesVar(ids, ctx) {
    const pers = personnesDe(ids, ctx);
    if (!pers.length) return null;
    if (pers.length === 1) return lieuDateDeces(pers[0], ctx);
    return liste(pers.map((p) => [nomCourt(p), ' ', lieuDateDeces(p, ctx)]));
  }
  function decesVar(ids, ctx) {
    const pers = personnesDe(ids, ctx);
    if (!pers.length) return null;
    return liste(pers.map((p) => [p.civilite === 'Mme' ? 'décédée ' : 'décédé ', lieuDateDeces(p, ctx)]));
  }

  function listeNumerotee(ids, ctx) {
    const pers = personnesDe(ids, ctx);
    if (!pers.length) return null;
    return lazy(true, () => {
      const out = [];
      pers.forEach((p, i) => {
        if (i > 0) out.push({ t: '\n\n' });
        out.push({ t: (i + 1) + '° ' + (i > 0 && i === pers.length - 1 ? 'Et ' : '') }, designer(p, ctx), { t: i < pers.length - 1 ? ' ;' : '' });
      });
      return out;
    });
  }
  function listeTirets(ids, ctx) {
    const pers = personnesDe(ids, ctx);
    if (!pers.length) return null;
    return lazy(true, () => {
      const out = [];
      pers.forEach((p, i) => {
        if (i > 0) out.push({ t: '\n\n' });
        out.push({ t: '- ' }, designer(p, ctx));
      });
      return out;
    });
  }

  const QUOTITES = { 2: 'moitié', 3: 'un tiers', 4: 'un quart', 5: 'un cinquième', 6: 'un sixième' };

  /* ======================================================================
     4. Types d'actes : libellés, champs du formulaire, variables
     ====================================================================== */

  const NOTAIRE = 'notaire';
  const CHAMPS_VENTE = [
    { cle: 'prix', libelle: "Prix d'acquisition", type: 'montant' },
    { cle: 'paiement', libelle: 'Paiement du prix', type: 'choix', options: [['comptant', 'Comptant, quittancé à l\'acte'], ['terme', 'En partie à terme']], defaut: 'comptant' },
    { cle: 'prixComptant', libelle: 'Montant payé comptant', type: 'montant', si: (a) => a.paiement === 'terme' },
    { cle: 'situationVendeur', libelle: 'Le vendeur a déclaré être marié…', type: 'texte', aide: 'Facultatif. Ex. : « sous le régime de la communauté légale ». Vide = paragraphe omis.' },
    { cle: 'quittance', libelle: 'Quittance ultérieure du solde du prix', type: 'oui-non' },
    { cle: 'quittanceNotaire', libelle: 'Notaire de la quittance', type: NOTAIRE, si: (a) => a.quittance },
    { cle: 'quittanceDate', libelle: 'Date de la quittance', type: 'date', si: (a) => a.quittance },
  ];
  const CHAMPS_TESTAMENT = [
    { cle: 'testamentForme', libelle: 'Forme du testament', type: 'choix', options: [['authentique', 'Authentique (deux notaires)'], ['temoins', 'Authentique (témoins)'], ['olographe', 'Olographe']], defaut: 'olographe' },
    { cle: 'testamentLieu', libelle: 'Lieu de rédaction', type: 'texte', si: (a) => a.testamentForme === 'olographe' },
    { cle: 'testamentDate', libelle: 'Date du testament', type: 'date' },
    { cle: 'testamentNotaire', libelle: (a) => (a.testamentForme === 'olographe' ? 'Notaire dépositaire' : 'Notaire'), type: NOTAIRE },
    { cle: 'testamentNotaire2', libelle: 'Second notaire', type: NOTAIRE, si: (a) => a.testamentForme === 'authentique' },
    { cle: 'depotDate', libelle: 'Date du procès-verbal de dépôt', type: 'date', si: (a) => a.testamentForme === 'olographe' },
  ];
  const NOTORIETE = [
    { cle: 'notorieteNotaire', libelle: "Notaire de l'acte de notoriété", type: NOTAIRE },
    { cle: 'notorieteDate', libelle: "Date de l'acte de notoriété", type: 'date' },
  ];
  const si = (cond, champs) => champs.map((c) => Object.assign({}, c, { si: c.si ? (a) => cond(a) && c.si(a) : cond }));

  function varsVente(a, ctx) {
    return {
      prix: montantVar(a.prix, a.prixDevise, ctx),
      paiement: a.paiement || 'comptant',
      prix_comptant: montantVar(a.prixComptant, a.prixDevise, ctx),
      situation_vendeur: txt(a.situationVendeur) || '',
      quittance: a.quittance ? 'oui' : '',
      quittance_notaire: notaireVar(a.quittanceNotaire, ctx),
      quittance_date: dateTexte(a.quittanceDate, ctx),
      hypotheque_vendeur: hypothequeVendeur(a),
    };
  }
  const DOC_VENTE = [
    ['prix', 'prix en lettres et en chiffres'], ['paiement', '« comptant » ou « terme »'], ['prix_comptant', 'part payée comptant'],
    ['situation_vendeur', 'déclaration du vendeur sur son mariage'], ['quittance', 'oui si une quittance est mentionnée'],
    ['quittance_notaire', 'notaire de la quittance'], ['quittance_date', 'date de la quittance'],
    ['hypotheque_vendeur', '« privilège de vendeur » (avant 2022) ou « l\'hypothèque légale spéciale de vendeur »'],
  ];
  function varsTestament(a, ctx) { return { testament: testamentVar(a, ctx) }; }
  function soulteVar(a, formes) {
    if (!a.soulte || a.soulte === 'aucune') return formes.aucune;
    const qui = txt(a.soultePar) || manque('débiteur de la soulte');
    return a.soulte === 'quittancee' ? [formes.quittancee[0], qui, formes.quittancee[1]] : ['sans soulte à la charge de ', qui];
  }
  const CHAMPS_SOULTE = [
    { cle: 'soulte', libelle: 'Soulte', type: 'choix', options: [['aucune', 'Sans soulte'], ['sans-charge', 'Sans soulte à la charge de…'], ['quittancee', 'Soulte quittancée à l\'acte']], defaut: 'aucune' },
    { cle: 'soultePar', libelle: (a) => (a.soulte === 'quittancee' ? 'Soulte à la charge de' : 'Partie concernée'), type: 'texte', si: (a) => a.soulte && a.soulte !== 'aucune', aide: 'Ex. : M. Jean DUPONT' },
  ];

  const TYPES = {
    vente: {
      libelle: 'Acquisition (vente)', acquereurs: 'Acquéreur(s)', cedants: 'Vendeur(s)', acte: 'Acte de vente',
      champs: CHAMPS_VENTE, vars: varsVente, doc: DOC_VENTE,
    },
    construction: {
      libelle: 'Acquisition du terrain et construction', acquereurs: 'Propriétaire(s)', cedants: 'Vendeur(s) du terrain', acte: "Acte d'acquisition du terrain",
      champs: [
        { cle: 'permisCommune', libelle: 'Permis de construire délivré par le maire de', type: 'texte' },
        { cle: 'permisDate', libelle: 'Date du permis de construire', type: 'date' },
        { cle: 'conformite', libelle: 'Conformité', type: 'choix', options: [['certificat', 'Certificat de conformité'], ['attestation', 'Attestation de non-opposition']], defaut: 'certificat' },
        { cle: 'conformiteDate', libelle: 'Date de la conformité', type: 'date' },
      ].concat(CHAMPS_VENTE),
      vars: (a, ctx) => Object.assign(varsVente(a, ctx), {
        permis_commune: majuscules(a.permisCommune), permis_date: dateTexte(a.permisDate, ctx),
        conformite: a.conformite || 'certificat', conformite_date: dateTexte(a.conformiteDate, ctx),
      }),
      doc: [['permis_commune', 'commune du permis'], ['permis_date', 'date du permis'], ['conformite', '« certificat » ou « attestation »'], ['conformite_date', 'date de la conformité']].concat(DOC_VENTE),
    },
    adjudication: {
      libelle: 'Adjudication amiable', acquereurs: 'Adjudicataire(s)', cedants: 'Vendeur(s) requérant(s)', acte: "Procès-verbal d'adjudication",
      champs: [
        { cle: 'cahierDate', libelle: 'Date du cahier des conditions de vente', type: 'date', aide: 'Avant 2007, le texte dira « cahier des charges ».' },
        { cle: 'prix', libelle: "Prix d'adjudication", type: 'montant' },
        { cle: 'declarations', libelle: 'Déclarations des vendeurs au cahier', type: 'zone', aide: 'Facultatif.' },
        { cle: 'inscriptionDate', libelle: "Date d'inscription de la sûreté du vendeur", type: 'date' },
        { cle: 'inscriptionVolume', libelle: 'Volume', type: 'texte' },
        { cle: 'inscriptionNumero', libelle: 'Numéro', type: 'texte' },
        { cle: 'quittance', libelle: 'Quittance du prix d\'adjudication', type: 'oui-non', defaut: true },
        { cle: 'quittanceNotaire', libelle: 'Notaire de la quittance', type: NOTAIRE, si: (a) => a.quittance },
        { cle: 'quittanceDate', libelle: 'Date de la quittance', type: 'date', si: (a) => a.quittance },
      ],
      vars: (a, ctx) => Object.assign(varsVente(a, ctx), {
        cahier: L.parseDate(a.cahierDate || a.date) && (a.cahierDate || a.date) < '2007-01-01' ? 'cahier des charges' : 'cahier des conditions de vente',
        cahier_date: dateTexte(a.cahierDate, ctx),
        cedants_liste: listeTirets(a.cedants, ctx),
        declarations: txt(a.declarations) || '',
        inscription_date: dateTexte(a.inscriptionDate, ctx), inscription_volume: txt(a.inscriptionVolume), inscription_numero: txt(a.inscriptionNumero),
      }),
      doc: [['cahier', '« cahier des conditions de vente » (ou « cahier des charges » avant 2007)'], ['cahier_date', 'date du cahier'], ['cedants_liste', 'vendeurs, un par ligne'],
        ['declarations', 'déclarations des vendeurs'], ['inscription_date', "date d'inscription"], ['inscription_volume', 'volume'], ['inscription_numero', 'numéro']].concat(DOC_VENTE),
    },
    donation: {
      libelle: 'Donation', acquereurs: 'Donataire(s)', cedants: 'Donateur(s)', acte: 'Acte de donation',
      champs: [
        { cle: 'definitive', libelle: 'Donation devenue définitive (donateur décédé)', type: 'oui-non', aide: 'Le lieu et la date du décès se saisissent dans la fiche du donateur.' },
      ].concat(si((a) => a.definitive, [
        { cle: 'reserve', libelle: 'Héritiers réservataires', type: 'choix', options: [['aucun', "Sans héritier à réserve"], ['donataire', 'Seul réservataire : le donataire'], ['reduction', 'Sans réduction pour atteinte à la réserve']], defaut: 'aucun' },
      ].concat(NOTORIETE, [
        { cle: 'partage', libelle: 'Acte de partage à mentionner', type: 'oui-non' },
        { cle: 'partageNotaire', libelle: 'Notaire du partage', type: NOTAIRE, si: (a) => a.partage },
        { cle: 'partageDate', libelle: 'Date du partage', type: 'date', si: (a) => a.partage },
      ]))),
      vars: (a, ctx) => ({
        temoins: L.parseDate(a.date) && a.date < '1966-12-28' ? 'oui' : '',
        definitive: a.definitive ? 'oui' : '',
        lieu_date_deces: lieuDateDecesVar(a.cedants, ctx),
        reserve: { aucun: "sans laisser d'héritier à réserve", donataire: "sans laisser d'autre héritier à réserve que le donataire", reduction: "sans qu'elle ait donné lieu à réduction pour atteinte à la réserve" }[a.reserve || 'aucun'],
        notoriete_notaire: notaireVar(a.notorieteNotaire, ctx), notoriete_date: dateTexte(a.notorieteDate, ctx),
        partage: a.partage ? 'oui' : '', partage_notaire: notaireVar(a.partageNotaire, ctx), partage_date: dateTexte(a.partageDate, ctx),
      }),
      doc: [['temoins', 'oui si l\'acte est antérieur au 28 décembre 1966'], ['definitive', 'oui si le donateur est décédé'], ['lieu_date_deces', 'lieu et date du décès du donateur'],
        ['reserve', 'mention relative à la réserve'], ['notoriete_notaire', 'notaire de la notoriété'], ['notoriete_date', 'date de la notoriété'],
        ['partage', 'oui si un partage est mentionné'], ['partage_notaire', 'notaire du partage'], ['partage_date', 'date du partage']],
    },
    'donation-partage-conjonctive': {
      libelle: 'Donation-partage conjonctive', acquereurs: 'Attributaire(s)', cedants: 'Donateurs', acte: 'Acte de donation-partage',
      champs: [
        { cle: 'autresDonataires', libelle: 'Autres donataires', type: 'personnes' },
        { cle: 'quotite', libelle: 'Chacun pour', type: 'texte', aide: 'Vide = calculé (moitié, un tiers…).' },
        { cle: 'definitive', libelle: 'Donateurs décédés (exécution de la donation)', type: 'oui-non' },
        { cle: 'notorieteNotaire', libelle: 'Notaire des actes de notoriété', type: NOTAIRE, si: (a) => a.definitive },
      ],
      vars: (a, ctx) => {
        const donataires = (a.acquereurs || []).concat(a.autresDonataires || []);
        const n = personnesDe(donataires, ctx).length;
        return {
          temoins: L.parseDate(a.date) && a.date < '1966-12-28' ? 'oui' : '',
          donataires_liste: listeNumerotee(donataires, ctx),
          nombre_donataires: n ? L.enLettres(n) : null,
          quotite: txt(a.quotite) || QUOTITES[n] || (n ? '1/' + n : null),
          definitive: a.definitive ? 'oui' : '',
          notorietes: notorietesVar(a.cedants, a.notorieteNotaire, ctx),
        };
      },
      groupes: (a, ctx) => ({ donataires: groupe(personnesDe((a.acquereurs || []).concat(a.autresDonataires || []), ctx)) }),
      doc: [['temoins', 'oui avant le 28 décembre 1966'], ['donataires_liste', 'donataires numérotés (1°, 2°…)'], ['nombre_donataires', 'nombre de donataires en lettres'],
        ['quotite', 'quotité de chacun'], ['definitive', 'oui si les donateurs sont décédés'], ['notorietes', '« ainsi que le constatent deux actes de notoriété… »']],
    },
    'donation-partage-cumulative': {
      libelle: 'Donation-partage cumulative', acquereurs: 'Attributaire(s)', cedants: 'Donateur', acte: 'Acte de donation-partage',
      champs: [
        { cle: 'autresDonataires', libelle: 'Autres donataires', type: 'personnes' },
        { cle: 'predecede', libelle: 'Conjoint prédécédé (succession partagée)', type: 'personne' },
        { cle: 'predecedeLien', libelle: 'Lien avec les donataires', type: 'texte', defaut: 'leur mère' },
        { cle: 'predecedeNotorieteNotaire', libelle: 'Notaire de la notoriété du prédécédé', type: NOTAIRE },
        { cle: 'predecedeNotorieteDate', libelle: 'Date de cette notoriété', type: 'date' },
        { cle: 'definitive', libelle: 'Donateur décédé (exécution de la donation)', type: 'oui-non' },
      ].concat(si((a) => a.definitive, NOTORIETE)),
      vars: (a, ctx) => {
        const donataires = (a.acquereurs || []).concat(a.autresDonataires || []);
        const n = personnesDe(donataires, ctx).length;
        return {
          temoins: L.parseDate(a.date) && a.date < '1966-12-28' ? 'oui' : '',
          donataires_liste: listeNumerotee(donataires, ctx),
          nombre_donataires: n ? L.enLettres(n) : null,
          predecede: personnesVar(a.predecede ? [a.predecede] : [], ctx),
          predecede_lien: txt(a.predecedeLien),
          predecede_deces: decesVar(a.predecede ? [a.predecede] : [], ctx),
          predecede_notoriete_notaire: notaireVar(a.predecedeNotorieteNotaire, ctx),
          predecede_notoriete_date: dateTexte(a.predecedeNotorieteDate, ctx),
          definitive: a.definitive ? 'oui' : '',
          lieu_date_deces: lieuDateDecesVar(a.cedants, ctx),
          notoriete_notaire: notaireVar(a.notorieteNotaire, ctx), notoriete_date: dateTexte(a.notorieteDate, ctx),
        };
      },
      groupes: (a, ctx) => ({ donataires: groupe(personnesDe((a.acquereurs || []).concat(a.autresDonataires || []), ctx)) }),
      doc: [['donataires_liste', 'donataires numérotés'], ['nombre_donataires', 'nombre en lettres'], ['predecede', 'conjoint prédécédé'], ['predecede_lien', 'ex. « leur mère »'],
        ['predecede_deces', '« décédée en son domicile à … »'], ['predecede_notoriete_notaire', 'notaire'], ['predecede_notoriete_date', 'date'],
        ['definitive', 'oui si le donateur est décédé'], ['lieu_date_deces', 'lieu et date du décès du donateur'], ['notoriete_notaire', 'notaire'], ['notoriete_date', 'date']],
    },
    echange: {
      libelle: 'Échange', acquereurs: 'Bénéficiaire(s)', cedants: 'Coéchangiste(s)', acte: "Contrat d'échange",
      champs: [{ cle: 'enPropre', libelle: 'Bien propre', type: 'oui-non' }].concat(CHAMPS_SOULTE, [
        { cle: 'origineContrepartie', libelle: "Origine de l'immeuble cédé en échange", type: 'zone', aide: 'Facultatif (rare : absence de renonciation à l\'action en répétition).' },
      ]),
      vars: (a) => ({
        en_propre: a.enPropre ? 'oui' : '',
        soulte: soulteVar(a, { aucune: "sans soulte de part ni d'autre", quittancee: ['à charge par ', " d'une soulte quittancée à l'acte"] }),
        origine_contrepartie: txt(a.origineContrepartie) || '',
      }),
      doc: [['en_propre', 'oui si bien propre'], ['soulte', 'mention de soulte'], ['origine_contrepartie', 'origine du bien cédé en contre-échange']],
    },
    'legs-universel': {
      libelle: 'Legs universel', acquereurs: 'Légataire(s) universel(s)', cedants: 'Testateur', acte: 'Attestation de propriété',
      champs: CHAMPS_TESTAMENT.concat(NOTORIETE, [
        { cle: 'possession', libelle: 'Entrée en possession', type: 'choix', options: [['aucune', 'Sans mention'], ['formalites', 'Formalités du notaire (depuis le 1er novembre 2017)'], ['envoi', 'Envoi en possession (ordonnance)']], defaut: 'aucune' },
        { cle: 'envoiTribunal', libelle: 'Tribunal judiciaire de', type: 'texte', si: (a) => a.possession === 'envoi' },
        { cle: 'envoiDate', libelle: "Date de l'ordonnance", type: 'date', si: (a) => a.possession === 'envoi' },
        { cle: 'envoiNotaire', libelle: 'Notaire dépositaire de l\'ordonnance', type: NOTAIRE, si: (a) => a.possession === 'envoi' },
        { cle: 'envoiDepotDate', libelle: 'Date du dépôt', type: 'date', si: (a) => a.possession === 'envoi' },
      ]),
      vars: (a, ctx) => Object.assign(varsTestament(a, ctx), {
        deces_cedants: decesVar(a.cedants, ctx),
        notoriete_notaire: notaireVar(a.notorieteNotaire, ctx), notoriete_date: dateTexte(a.notorieteDate, ctx),
        possession: a.possession || 'aucune',
        envoi_tribunal: majuscules(a.envoiTribunal), envoi_date: dateTexte(a.envoiDate, ctx),
        envoi_notaire: notaireVar(a.envoiNotaire, ctx), envoi_depot_date: dateTexte(a.envoiDepotDate, ctx),
      }),
      doc: [['testament', 'forme et date du testament'], ['deces_cedants', '« décédé en son domicile à … »'], ['notoriete_notaire', 'notaire'], ['notoriete_date', 'date'],
        ['possession', '« aucune », « formalites » ou « envoi »'], ['envoi_tribunal', 'tribunal'], ['envoi_date', 'date de l\'ordonnance'], ['envoi_notaire', 'notaire dépositaire'], ['envoi_depot_date', 'date du dépôt']],
    },
    'legs-particulier': {
      libelle: 'Legs à titre particulier', acquereurs: 'Légataire(s)', cedants: 'Testateur', acte: 'Attestation de propriété',
      champs: CHAMPS_TESTAMENT.concat([
        { cle: 'delivrancePar', libelle: 'Legs délivré par', type: 'texte', aide: 'Ex. : M. Paul DURAND, seul héritier à réserve du testateur' },
        { cle: 'delivranceNotaire', libelle: 'Notaire de la délivrance', type: NOTAIRE },
        { cle: 'delivranceDate', libelle: 'Date de la délivrance', type: 'date' },
      ]),
      vars: (a, ctx) => Object.assign(varsTestament(a, ctx), {
        deces_cedants: decesVar(a.cedants, ctx),
        delivrance_par: txt(a.delivrancePar), delivrance_notaire: notaireVar(a.delivranceNotaire, ctx), delivrance_date: dateTexte(a.delivranceDate, ctx),
      }),
      doc: [['testament', 'forme et date du testament'], ['deces_cedants', '« décédé en son domicile à … »'], ['delivrance_par', 'auteur de la délivrance'], ['delivrance_notaire', 'notaire'], ['delivrance_date', 'date']],
    },
    partage: {
      libelle: 'Partage', acquereurs: 'Attributaire(s)', cedants: 'Autre(s) copartageant(s)', acte: 'Acte de partage',
      champs: [
        { cle: 'enPropre', libelle: 'Bien propre', type: 'oui-non' },
        { cle: 'defunts', libelle: 'Défunt(s) dont les successions sont partagées', type: 'personnes' },
        { cle: 'lienDefunts', libelle: 'Lien avec les copartageants', type: 'texte', defaut: 'leur père et mère' },
        { cle: 'notorieteNotaire', libelle: 'Notaire des actes de notoriété', type: NOTAIRE },
      ].concat(CHAMPS_SOULTE),
      vars: (a, ctx) => {
        const defunts = personnesDe(a.defunts, ctx);
        return {
          en_propre: a.enPropre ? 'oui' : '',
          defunts: personnesVar(a.defunts, ctx),
          defunts_noms: nomsVar(a.defunts, ctx),
          successions_de: defunts.length > 1 ? 'des successions réunies et confondues de' : 'de la succession de',
          lien_defunts: txt(a.lienDefunts),
          defunts_deces: decesVar(a.defunts, ctx),
          notorietes: notorietesVar(a.defunts, a.notorieteNotaire, ctx),
          soulte: soulteVar(a, { aucune: 'sans soulte', quittancee: ['moyennant une soulte à la charge de ', ", quittancée à l'acte"] }),
        };
      },
      groupes: (a, ctx) => ({ defunts: groupe(personnesDe(a.defunts, ctx)) }),
      precedents: (a) => a.defunts || [],
      doc: [['en_propre', 'oui si bien propre'], ['defunts', 'défunts (état civil)'], ['defunts_noms', 'noms des défunts'], ['successions_de', '« de la succession de » / « des successions réunies et confondues de »'],
        ['lien_defunts', 'ex. « leur père et mère »'], ['defunts_deces', 'décès des défunts'], ['notorietes', 'actes de notoriété'], ['soulte', 'mention de soulte']],
    },
    apport: {
      libelle: 'Apport en société', acquereurs: 'Société bénéficiaire', cedants: 'Apporteur(s)', acte: "Acte d'apport",
      champs: [
        { cle: 'operation', libelle: 'Acte', type: 'choix', options: [['constitution', 'De constitution'], ['augmentation', "D'augmentation de capital"], ['apport-partiel', "D'apport partiel d'actif"], ['fusion', 'De fusion']], defaut: 'constitution' },
        { cle: 'titreApport', libelle: 'Apport consenti à titre', type: 'choix', options: [['pur', 'Pur et simple'], ['onereux', 'Partiellement onéreux']], defaut: 'pur' },
        { cle: 'passif', libelle: 'Passif pris en charge par la société', type: 'montant', si: (a) => a.titreApport === 'onereux' },
        { cle: 'nombreTitres', libelle: 'Nombre de titres attribués', type: 'texte', aide: 'Ex. : 1 000 (écrit en lettres et en chiffres dans le texte).' },
        { cle: 'natureTitres', libelle: 'Titres', type: 'choix', options: [['parts', 'Parts sociales'], ['actions', 'Actions']], defaut: 'parts' },
        { cle: 'valeurNominale', libelle: 'Valeur nominale de chaque titre', type: 'texte', aide: 'Ex. : 10 euros' },
      ],
      vars: (a, ctx) => {
        const n = Number(String(a.nombreTitres || '').replace(/[\s.]/g, ''));
        const nombre = Number.isInteger(n) && n > 0 ? L.enLettres(n).toUpperCase() + ' (' + n.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ') + ')' : txt(a.nombreTitres);
        const un = n === 1;
        const societes = personnesDe(a.acquereurs, ctx).map((p) => majuscules(p.nom)).filter(Boolean);
        return {
          operation: { constitution: 'de constitution', augmentation: "d'augmentation de capital", 'apport-partiel': "d'apport partiel d'actif", fusion: 'de fusion' }[a.operation || 'constitution'],
          titre_apport: a.titreApport || 'pur',
          passif: montantVar(a.passif, a.prixDevise, ctx),
          nombre_titres: nombre,
          titres: a.natureTitres === 'actions' ? (un ? 'action' : 'actions') : (un ? 'part sociale' : 'parts sociales'),
          societe: societes.length ? societes.join(' et ') : null,
          valeur_nominale: txt(a.valeurNominale),
        };
      },
      doc: [['operation', '« de constitution », « d\'augmentation de capital », « d\'apport partiel d\'actif » ou « de fusion »'],
        ['titre_apport', '« pur » ou « onereux »'], ['passif', 'passif pris en charge par la société'], ['nombre_titres', 'nombre de titres, en lettres et en chiffres'],
        ['titres', '« parts sociales » ou « actions »'], ['societe', 'dénomination de la société bénéficiaire'], ['valeur_nominale', 'valeur nominale de chaque titre']],
    },
    succession: {
      libelle: 'Succession', acquereurs: 'Héritier(s)', cedants: 'Défunt', acte: 'Attestation immobilière',
      champs: [{ cle: 'lienDefunt', libelle: 'Lien de parenté avec le défunt', type: 'texte', aide: 'Ex. : son père, son frère' }].concat(NOTORIETE),
      vars: (a, ctx) => ({
        lien_defunt: txt(a.lienDefunt),
        deces_cedants: decesVar(a.cedants, ctx),
        notoriete_notaire: notaireVar(a.notorieteNotaire, ctx), notoriete_date: dateTexte(a.notorieteDate, ctx),
        attestation_notaire: memeNotaire(a.notaire, a.notorieteNotaire) ? 'le même notaire' : notaireVar(a.notaire, ctx),
      }),
      doc: [['lien_defunt', 'ex. « son père »'], ['deces_cedants', '« décédé à … le … »'], ['notoriete_notaire', 'notaire'], ['notoriete_date', 'date'],
        ['attestation_notaire', '« le même notaire » ou le notaire de l\'attestation']],
    },
  };

  const DOC_COMMUNE = [
    ['ouverture', '« L\'immeuble ci-dessus appartient » ou « Antérieurement, ledit immeuble appartenait »'],
    ['acquereurs', 'bénéficiaires de l\'acte (état civil complet ou « susnommé »)'], ['acquereurs_noms', 'leurs noms seulement'],
    ['cedants', 'précédents propriétaires (état civil complet ou « susnommé »)'], ['cedants_noms', 'leurs noms seulement'],
    ['date', "date de l'acte"], ['notaire', '« Maître X, notaire à Y »'],
    ['publication', '« publié au service de la publicité foncière de … »'], ['publication_feminin', 'idem, accordé au féminin (attestation)'], ['publication_pluriel', 'idem, au pluriel'],
    ['ancien', 'oui si la formalité est antérieure au 1er janvier 1956'], ['etat', 'résultat de l\'état hypothécaire'],
  ];
  const DOC_GROUPES = ['acquereurs', 'cedants'];

  // Variables communes à toutes les trames d'actes.
  function variablesActe(a, index, ctx) {
    const type = TYPES[a.type] || TYPES.vente;
    const vars = {
      ouverture: rendreTrame(index === 0 ? 'commun:ouverture_immediate' : 'commun:ouverture_anterieure', {}, {}, ctx),
      acquereurs: personnesVar(a.acquereurs, ctx),
      acquereurs_noms: nomsVar(a.acquereurs, ctx),
      cedants: personnesVar(a.cedants, ctx),
      cedants_noms: nomsVar(a.cedants, ctx),
      date: dateTexte(a.date, ctx),
      notaire: notaireVar(a.notaire, ctx),
      publication: publicationVar(a, '', ctx),
      publication_feminin: publicationVar(a, 'e', ctx),
      publication_pluriel: publicationVar(a, 's', ctx),
      ancien: AVANT_1956((a.publication || {}).date || a.date) ? 'oui' : '',
      etat: etatVar(a),
    };
    Object.assign(vars, type.vars(a, ctx));
    const groupes = Object.assign({
      acquereurs: groupeCtx(personnesDe(a.acquereurs, ctx), ctx),
      cedants: groupeCtx(personnesDe(a.cedants, ctx), ctx),
    }, type.groupes ? type.groupes(a, ctx) : {});
    return { vars, groupes };
  }

  /* ======================================================================
     5. Rédaction du document
     ====================================================================== */

  function contexte(dossier, options) {
    const personnes = {};
    (dossier.personnes || []).forEach((p) => (personnes[p.id] = p));
    return {
      trames: Object.assign({}, (options && options.trames) || {}),
      options: options || {},
      personnes,
      // Bénéficiaires de l'origine immédiate = vendeur aux présentes (sauf option contraire).
      vendeurs: new Set(dossier.vendeurDirect !== false && dossier.actes && dossier.actes[0] ? dossier.actes[0].acquereurs || [] : []),
      mentionnees: new Set(),
      erreurs: new Set(),
      inconnues: new Set(),
    };
  }

  // Découpe en paragraphes, nettoie la ponctuation, compte les éléments manquants.
  function finaliser(segments) {
    const manquants = [];
    let s = '';
    for (const seg of segments) {
      if (seg.m !== undefined) {
        manquants.push(seg.m);
        s += '' + (manquants.length - 1) + '';
      } else s += seg.t;
    }
    s = s.replace(/[ \t]+/g, ' ')
      .replace(/ +([,.])/g, '$1')
      .replace(/,(\s*,)+/g, ',')
      .replace(/\.(\s*\.)+(?!\.)/g, '.')
      .replace(/ *\n */g, '\n')
      // « à le VENDEUR » → « au VENDEUR » (termes définis en majuscules).
      .replace(/(^|[\s(])à les (?=[A-ZÉÈ]{2,})/g, '$1aux ')
      .replace(/(^|[\s(])à le (?=[A-ZÉÈ]{2,})/g, '$1au ')
      .replace(/(^|[\s(])([dD])e les (?=[A-ZÉÈ]{2,})/g, '$1$2es ')
      .replace(/(^|[\s(])([dD])e le (?=[A-ZÉÈ]{2,})/g, '$1$2u ');
    const paragraphes = s.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.replace(/[\s,.;:\-]/g, '') !== '');
    return {
      manquants,
      paragraphes: paragraphes.map((p) => {
        const segs = [];
        p.split(/(\d+)/).forEach((part, i) => {
          if (!part) return;
          const m = /^(\d+)$/.exec(part);
          if (m) segs.push({ m: manquants[+m[1]] });
          else segs.push({ t: i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part });
        });
        return segs;
      }),
    };
  }

  function rediger(dossier, options) {
    const ctx = contexte(dossier, options);
    const actes = dossier.actes || [];
    let manquants = 0;
    const blocs = actes.map((a, i) => {
      const { vars, groupes } = variablesActe(a, i, ctx);
      const segs = rendreTrame('acte:' + (TYPES[a.type] ? a.type : 'vente'), vars, groupes, ctx);
      const f = finaliser(segs);
      manquants += f.manquants.length;
      const titre = finaliser(rendreTrame(i === 0 ? 'commun:titre_immediate' : 'commun:titre_anterieure', {}, {}, ctx)).paragraphes[0] || [];
      return { acteId: a.id, titre: titre.map((x) => x.t || '').join(''), paragraphes: f.paragraphes, manquants: f.manquants };
    });
    return {
      blocs, manquants,
      erreurs: Array.from(ctx.erreurs),
      inconnues: Array.from(ctx.inconnues),
      controles: controler(dossier, options),
    };
  }

  // Aperçu d'une seule trame (éditeur de trames).
  function apercu(idTrame, dossier, options) {
    const r = rediger(dossier, options);
    if (idTrame.startsWith('acte:')) {
      const type = idTrame.slice(5);
      const i = (dossier.actes || []).findIndex((a) => a.type === type);
      if (i >= 0) return { bloc: r.blocs[i], erreurs: r.erreurs, inconnues: r.inconnues };
      const ex = exemple(type);
      const r2 = rediger(ex, options);
      return { bloc: r2.blocs[0], exemple: true, erreurs: r2.erreurs, inconnues: r2.inconnues };
    }
    return { bloc: r.blocs[0] || null, erreurs: r.erreurs, inconnues: r.inconnues };
  }

  /* ---------- Sorties texte et Word ---------- */
  function texte(blocs) {
    return blocs.map((b) => [b.titre].concat(b.paragraphes.map((p) => p.map((s) => (s.m !== undefined ? VIDE : s.t)).join(''))).join('\n\n')).join('\n\n');
  }
  const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function html(blocs) {
    return blocs.map((b) => '<p style="margin:12pt 0 6pt"><b><u>' + echapper(b.titre) + '</u></b></p>'
      + b.paragraphes.map((p) => '<p style="margin:0 0 6pt;text-align:justify">'
        + echapper(p.map((s) => (s.m !== undefined ? VIDE : s.t)).join('')).replace(/\n/g, '<br>') + '</p>').join('')).join('');
  }

  /* ======================================================================
     6. Contrôles
     ====================================================================== */

  function controler(dossier, options) {
    const actes = dossier.actes || [];
    const personnes = {};
    (dossier.personnes || []).forEach((p) => (personnes[p.id] = p));
    const nom = (id) => (personnes[id] ? nomCourt(personnes[id]) : 'une personne supprimée');
    const out = [];
    if (!actes.length) return out;

    // Origine trentenaire : l'acte le plus ancien doit avoir au moins 30 ans.
    const ref = (options && options.aujourdhui) || new Date().toISOString().slice(0, 10);
    const limite = (+ref.slice(0, 4) - 30) + ref.slice(4);
    const dates = actes.map((a) => a.date).filter((d) => L.parseDate(d));
    if (dates.length < actes.length) out.push({ ok: false, texte: 'Date manquante sur ' + (actes.length - dates.length) + ' acte(s).' });
    if (dates.length) {
      const plusAncien = dates.sort()[0];
      out.push(plusAncien <= limite
        ? { ok: true, texte: 'Origine trentenaire atteinte (acte le plus ancien : ' + L.date(plusAncien) + ').' }
        : { ok: false, texte: 'Origine trentenaire non atteinte : remonter à un acte antérieur au ' + L.date(limite) + '.' });
    }

    // Continuité : les précédents propriétaires d'un acte doivent être propriétaires dans l'acte suivant.
    for (let i = 0; i < actes.length - 1; i++) {
      const a = actes[i], suivant = actes[i + 1];
      const type = TYPES[a.type] || TYPES.vente;
      const precedents = type.precedents ? type.precedents(a) : a.cedants || [];
      const proprietaires = new Set((suivant.acquereurs || []).concat(suivant.type === 'donation-partage-cumulative' && suivant.predecede ? [suivant.predecede] : []));
      const absents = precedents.filter((id) => !proprietaires.has(id));
      if (absents.length) {
        out.push({ ok: false, texte: 'Origine n° ' + (i + 2) + ' : ' + absents.map(nom).join(', ') + ' devrait y figurer parmi les bénéficiaires (précédent propriétaire de l\'origine n° ' + (i + 1) + ').' });
      }
    }
    if (out.every((c) => c.ok) && actes.length > 1) out.push({ ok: true, texte: 'Chaîne de propriété continue.' });
    return out;
  }

  /* ======================================================================
     7. Création d'objets, documentation, exemple
     ====================================================================== */

  let compteur = 0;
  const uid = (p) => p + Date.now().toString(36) + (compteur++).toString(36);

  function nouvellePersonne(o) {
    return Object.assign({
      id: uid('p'), civilite: 'M', prenoms: '', nom: '', nomUsage: '', profession: '', domicile: '',
      naissanceDate: '', naissanceLieu: '', situation: '', nationalite: '',
      decede: false, decesDate: '', decesLieu: '', decesDomicile: false, dejaDesigne: false,
      morale: false, siren: '', importe: false,
    }, o || {});
  }

  function nouvelActe(type, o) {
    const a = {
      id: uid('a'), type: type || 'vente', acquereurs: [], cedants: [], date: '',
      notaire: { nom: '', ville: '' }, publication: { service: '', date: '', volume: '', numero: '' },
      etat: { mode: 'negatif', texte: '' }, prixDevise: 'EUR',
    };
    completerActe(a);
    return Object.assign(a, o || {});
  }
  // Ajoute les valeurs par défaut des champs propres au type d'acte.
  function completerActe(a) {
    const t = TYPES[a.type] || TYPES.vente;
    t.champs.forEach((c) => {
      if (a[c.cle] !== undefined) return;
      if (c.defaut !== undefined) a[c.cle] = c.defaut;
      else if (c.type === NOTAIRE) a[c.cle] = { nom: '', ville: '' };
      else if (c.type === 'personnes') a[c.cle] = [];
      else if (c.type === 'oui-non') a[c.cle] = false;
      else if (c.type === 'personne') a[c.cle] = '';
      else if (c.type === 'montant') a[c.cle] = null;
      else a[c.cle] = '';
    });
    if (!a.prixDevise) a.prixDevise = 'EUR';
    return a;
  }

  const NOMS_COMMUNS = {
    titre_immediate: 'Titre — origine immédiate', titre_anterieure: 'Titre — origine antérieure',
    ouverture_immediate: 'Ouverture — origine immédiate', ouverture_anterieure: 'Ouverture — origine antérieure',
    publication: 'Mention de publication', publication_ancienne: 'Mention de transcription (avant 1956)',
    personne: 'Désignation d\'une personne (état civil complet)', personne_rappel: 'Rappel d\'une personne déjà désignée',
    vendeur: 'Vendeur aux présentes', vendeur_nomme: 'Vendeur aux présentes, cité parmi d\'autres',
    societe: 'Désignation d\'une société (personne morale)',
    notaire: 'Désignation du notaire',
  };
  function nomTrame(id) {
    const [genre, cle] = id.split(':');
    return genre === 'acte' ? (TYPES[cle] ? TYPES[cle].libelle : cle) : NOMS_COMMUNS[cle] || cle;
  }
  const DOC_FRAGMENTS = {
    publication: [['service', 'service de la publicité foncière'], ['date_publication', 'date'], ['volume', 'volume'], ['numero', 'numéro'], ['e', 'accord : « », « e » ou « s »']],
    personne: [['civilite', 'Monsieur / Madame'], ['prenoms', 'prénoms'], ['nom', 'nom (majuscules)'], ['nom_usage', "nom d'usage"], ['profession', 'profession'], ['domicile', 'domicile'],
      ['naissance_lieu', 'lieu de naissance'], ['naissance_date', 'date de naissance'], ['situation', 'situation matrimoniale'], ['nationalite', 'nationalité'], ['decede', 'oui si décédé(e)']],
    notaire: [['notaire_nom', 'prénom et nom du notaire'], ['notaire_ville', 'résidence']],
  };
  DOC_FRAGMENTS.publication_ancienne = DOC_FRAGMENTS.publication;
  DOC_FRAGMENTS.personne_rappel = DOC_FRAGMENTS.personne;
  DOC_FRAGMENTS.vendeur_nomme = DOC_FRAGMENTS.personne;
  DOC_FRAGMENTS.vendeur = [];
  DOC_FRAGMENTS.societe = [['denomination', 'dénomination'], ['forme', 'forme sociale (ex. société civile immobilière)'], ['siege', 'siège social'], ['siren', 'numéro SIREN']];

  // Variables utilisables dans une trame, pour l'aide de l'éditeur.
  function documentation(idTrame) {
    const [genre, cle] = idTrame.split(':');
    if (genre === 'acte') {
      const t = TYPES[cle];
      return { variables: DOC_COMMUNE.concat(t ? t.doc : []), groupes: DOC_GROUPES.concat(t && t.groupes ? Object.keys(t.groupes({}, { personnes: {} })) : []) };
    }
    return { variables: DOC_FRAGMENTS[cle] || [], groupes: cle && cle.startsWith('personne') ? ['personne'] : [] };
  }

  const LIBELLES = {};
  Object.keys(TYPES).forEach((k) => TYPES[k].doc.forEach(([n, d]) => (LIBELLES[n] = LIBELLES[n] || d)));
  Object.assign(LIBELLES, {
    acquereurs: 'bénéficiaire', cedants: 'précédent propriétaire', date: "date de l'acte", notaire: 'notaire', publication: 'publication',
    publication_feminin: 'publication', publication_pluriel: 'publication', etat: 'état hypothécaire', prix: 'prix', prenoms: 'prénoms', nom: 'nom',
    domicile: 'domicile', naissance_lieu: 'lieu de naissance', naissance_date: 'date de naissance', notaire_nom: 'nom du notaire', notaire_ville: 'résidence du notaire',
    service: 'service de publicité foncière', date_publication: 'date de publication', volume: 'volume', numero: 'numéro',
    predecede: 'conjoint prédécédé', predecede_lien: 'lien du prédécédé', predecede_deces: 'décès du prédécédé',
    predecede_notoriete_notaire: 'notaire de la notoriété du prédécédé', predecede_notoriete_date: 'date de la notoriété du prédécédé',
    defunts: 'défunts', defunts_noms: 'défunts', defunts_deces: 'décès des défunts', notorietes: 'actes de notoriété', lien_defunts: 'lien des défunts',
    deces_cedants: 'décès', lieu_date_deces: 'lieu et date du décès', notoriete_notaire: 'notaire de la notoriété', notoriete_date: 'date de la notoriété',
    delivrance_par: 'auteur de la délivrance', delivrance_notaire: 'notaire de la délivrance', delivrance_date: 'date de la délivrance',
    partage_notaire: 'notaire du partage', partage_date: 'date du partage', quittance_notaire: 'notaire de la quittance', quittance_date: 'date de la quittance',
    envoi_notaire: "notaire dépositaire de l'ordonnance", envoi_depot_date: 'date du dépôt', envoi_tribunal: 'tribunal', envoi_date: "date de l'ordonnance",
    donataires_liste: 'donataires', cedants_liste: 'vendeurs', nombre_donataires: 'nombre de donataires', quotite: 'quotité', testament: 'testament',
    lien_defunt: 'lien avec le défunt', attestation_notaire: "notaire de l'attestation", prix_comptant: 'part payée comptant', cahier_date: 'date du cahier',
    nombre_titres: 'nombre de titres attribués', valeur_nominale: 'valeur nominale des titres', societe: 'société bénéficiaire', passif: 'passif pris en charge',
  });
  function libelle(nom) {
    const l = LIBELLES[nom] || nom.replace(/_/g, ' ');
    return l.length > 40 ? nom.replace(/_/g, ' ') : l;
  }

  // Dossier d'exemple (fictif) : vente, succession, donation.
  function exemple(typeSeul) {
    const P = {
      dupont: nouvellePersonne({ id: 'ex1', prenoms: 'Jean Michel', nom: 'Dupont', profession: 'ingénieur', domicile: 'LYON (69003), 12 rue Paul Bert', naissanceDate: '1975-04-18', naissanceLieu: 'VILLEURBANNE (69100)', situation: 'époux de Madame Claire MARTIN, avec laquelle il est marié sous le régime de la communauté légale à défaut de contrat préalable à leur union célébrée à la mairie de LYON (69003) le 2 juin 2001', nationalite: 'française' }),
      martin: nouvellePersonne({ id: 'ex2', civilite: 'Mme', prenoms: 'Claire', nom: 'Martin', nomUsage: 'Dupont', profession: 'professeure', domicile: 'LYON (69003), 12 rue Paul Bert', naissanceDate: '1977-09-03', naissanceLieu: 'GRENOBLE (38000)', situation: 'épouse de Monsieur Jean Michel DUPONT', nationalite: 'française' }),
      bernard: nouvellePersonne({ id: 'ex3', prenoms: 'Paul', nom: 'Bernard', profession: 'retraité', domicile: 'MÂCON (71000), 4 place aux Herbes', naissanceDate: '1950-01-12', naissanceLieu: 'MÂCON (71000)', situation: 'veuf de Madame Anne GIRARD, non remarié', nationalite: 'française' }),
      louis: nouvellePersonne({ id: 'ex4', prenoms: 'Louis', nom: 'Bernard', profession: 'agriculteur', domicile: 'MÂCON (71000), 4 place aux Herbes', naissanceDate: '1922-06-30', naissanceLieu: 'CLUNY (71250)', situation: 'veuf de Madame Marie ROUX', decede: true, decesDate: '2001-02-10', decesLieu: 'MÂCON (71000)', decesDomicile: true }),
      jeanne: nouvellePersonne({ id: 'ex5', civilite: 'Mme', prenoms: 'Jeanne', nom: 'Bernard', profession: 'sans profession', domicile: 'CLUNY (71250)', naissanceDate: '1898-11-05', naissanceLieu: 'CLUNY (71250)', situation: 'veuve de Monsieur Henri BERNARD', decede: true, decesDate: '1995-11-02', decesLieu: 'CLUNY (71250)' }),
    };
    const actes = [
      nouvelActe('vente', {
        id: 'exa1', acquereurs: ['ex1', 'ex2'], cedants: ['ex3'], date: '2015-06-12', notaire: { nom: 'Sophie LEROY', ville: 'Lyon' },
        publication: { service: 'Lyon 1er', date: '2015-07-03', volume: '2015P', numero: '4567' }, prix: 285000, situationVendeur: '',
      }),
      nouvelActe('succession', {
        id: 'exa2', acquereurs: ['ex3'], cedants: ['ex4'], date: '2001-09-20', lienDefunt: 'son père', notaire: { nom: 'Henri FAURE', ville: 'Mâcon' },
        notorieteNotaire: { nom: 'Henri FAURE', ville: 'Mâcon' }, notorieteDate: '2001-05-04',
        publication: { service: 'Mâcon', date: '2001-10-15', volume: '2001P', numero: '1203' },
      }),
      nouvelActe('donation', {
        id: 'exa3', acquereurs: ['ex4'], cedants: ['ex5'], date: '1988-03-22', notaire: { nom: 'André CLÉMENT', ville: 'Cluny' },
        publication: { service: 'Mâcon', date: '1988-04-30', volume: '1988', numero: '77' },
        definitive: true, reserve: 'donataire', notorieteNotaire: { nom: 'André CLÉMENT', ville: 'Cluny' }, notorieteDate: '1996-01-15',
      }),
    ];
    const dossier = { reference: 'Exemple', personnes: Object.values(P), actes };
    if (typeSeul) {
      const modele = actes.find((a) => a.type === typeSeul);
      if (typeSeul === 'apport') {
        dossier.personnes.push(nouvellePersonne({ id: 'ex6', morale: true, nom: 'Les Tilleuls', profession: 'société civile immobilière', domicile: 'MÂCON (71000), 4 place aux Herbes', siren: '123456789' }));
        dossier.actes = [nouvelActe('apport', { id: 'exa', acquereurs: ['ex6'], cedants: ['ex3'], date: '2010-03-15', notaire: { nom: 'Henri FAURE', ville: 'Mâcon' },
          publication: { service: 'Mâcon', date: '2010-04-02', volume: '2010P', numero: '845' }, operation: 'augmentation', nombreTitres: '1000', valeurNominale: '10 euros' })];
        return dossier;
      }
      const a = modele || nouvelActe(typeSeul, { id: 'exa', acquereurs: ['ex3'], cedants: ['ex4'], date: '2001-09-20', notaire: { nom: 'Henri FAURE', ville: 'Mâcon' }, publication: { service: 'Mâcon', date: '2001-10-15', volume: '2001P', numero: '1203' } });
      dossier.actes = [a];
    }
    return dossier;
  }

  // Désignation complète d'une personne (aperçu dans sa fiche).
  function designation(personne, options) {
    const ctx = contexte({ personnes: [personne] }, options);
    return finaliser(designer(Object.assign({}, personne, { dejaDesigne: false }), ctx)).paragraphes[0] || [];
  }

  const TYPES_LISTE = Object.keys(TYPES).map((k) => ({ id: k, libelle: TYPES[k].libelle }));
  const IDS_TRAMES = Object.keys(T.defaults);

  return {
    rediger, apercu, designation, texte, html, controler, parse, accorder, documentation, nomTrame,
    nouvellePersonne, nouvelActe, completerActe, exemple, nomCourt, prenomAvantNom,
    TYPES, TYPES_LISTE, IDS_TRAMES, TRAMES_DEFAUT: T.defaults, VIDE,
  };
});
