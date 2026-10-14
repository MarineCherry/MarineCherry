/*
 * Moteur — Suivi des dossiers (ventes et successions).
 *
 * À partir d'un dossier et des paramètres (listes de pièces, zones termites / mérule) :
 *   - liste des pièces attendues à chaque étape, selon la situation (copropriété, société, mariés…) ;
 *   - diagnostics obligatoires pour une vente, avec leur durée de validité ;
 *   - avancement et alertes, pour le tableau de bord.
 * Fonctions pures : aucune dépendance au navigateur, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.dossiers = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = [
    { id: 'vente', libelle: 'Vente' },
    { id: 'succession', libelle: 'Succession' },
  ];
  const ETAPES = {
    vente: [{ id: 'promesse', libelle: 'Promesse' }, { id: 'vente', libelle: 'Vente' }],
    succession: [{ id: 'ouverture', libelle: 'Ouverture' }, { id: 'reglement', libelle: 'Règlement' }],
  };
  // Conditions d'application d'une pièce ; la valeur est lue dans le dossier.
  const CONDITIONS = [
    { id: '', libelle: 'Toujours' },
    { id: 'copro', libelle: 'Si copropriété' },
    { id: 'societe', libelle: 'Si une partie est une société' },
    { id: 'maries', libelle: 'Si une partie est mariée ou pacsée' },
    { id: 'pret', libelle: 'Si prêt' },
    { id: 'travaux', libelle: 'Si travaux récents' },
    { id: 'permis', libelle: 'Si permis de construire à produire' },
    { id: 'conjoint', libelle: 'Si le défunt était marié ou pacsé' },
    { id: 'testament', libelle: 'S\'il existe un testament' },
  ];
  const STATUTS = [
    { id: 'manquante', libelle: 'À obtenir' },
    { id: 'demandee', libelle: 'Demandée' },
    { id: 'recue', libelle: 'Reçue' },
    { id: 'na', libelle: 'Sans objet' },
  ];

  const isNum = (v) => typeof v === 'number' && isFinite(v);

  /* ---------- Dates ---------- */
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  const toTime = (p) => Date.UTC(p.y, p.m - 1, p.d);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  function addMonths(s, months) {
    const p = parseDate(s);
    if (!p) return null;
    const total = p.y * 12 + (p.m - 1) + months;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return iso(Date.UTC(y, m - 1, Math.min(p.d, last)));
  }
  const avant = (a, b) => !!(parseDate(a) && parseDate(b)) && toTime(parseDate(a)) < toTime(parseDate(b));
  const joursEntre = (a, b) => Math.round((toTime(parseDate(b)) - toTime(parseDate(a))) / 86400000);

  /* ---------- Communes ---------- */
  // « Saint-Rémy-de-Provence » → « saint remy de provence » ; « St » → « saint ».
  function normCommune(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').replace(/\b(st)\b/g, 'saint').replace(/\b(ste)\b/g, 'sainte').trim();
  }
  function departement(codePostal) {
    const cp = String(codePostal || '').replace(/\s/g, '');
    if (!/^\d{5}$/.test(cp)) return '';
    if (cp.startsWith('20')) return +cp < 20200 ? '2A' : '2B';
    if (cp.startsWith('97')) return cp.slice(0, 3);
    return cp.slice(0, 2);
  }
  /*
   * Zone termites ou mérule de la commune du bien.
   * zones : [{ dept, commune ('*' = tout le département), arrete, aConfirmer }]
   * departements : { [dept]: 'tout' | 'liste' | 'partie' | 'aucun' } (couverture connue du département ;
   *   'liste' : la liste des communes du département est complète)
   * Résultat : { statut: 'oui' | 'non' | 'inconnu', zone, motif }
   */
  function zone(liste, couverture, bien) {
    const dept = departement(bien.codePostal);
    const commune = normCommune(bien.commune);
    if (!dept && !commune) return { statut: 'inconnu', motif: 'Commune du bien non renseignée.' };
    const z = (liste || []).find((x) => String(x.dept) === dept && (x.commune === '*' || normCommune(x.commune) === commune));
    if (z) return { statut: 'oui', zone: z, motif: (z.commune === '*' ? 'Tout le département (' + dept + ') est concerné' : 'Commune listée') + (z.arrete ? ' : ' + z.arrete : '') + '.' };
    const c = (couverture || {})[dept];
    if (c === 'aucun') return { statut: 'non', motif: 'Aucun arrêté connu dans le département.' };
    if (c === 'liste') return { statut: 'non', motif: 'La commune ne figure pas parmi les communes délimitées par arrêté dans le département.' };
    if (c === 'partie') return { statut: 'inconnu', motif: 'Le département n\'est couvert qu\'en partie et la commune n\'est pas dans la liste : à vérifier auprès de la mairie ou de la préfecture.' };
    return { statut: 'inconnu', motif: 'Pas d\'information pour ce département : à vérifier auprès de la mairie ou de la préfecture.' };
  }

  /* ---------- Conditions ---------- */
  const parties = (d) => [].concat(d.vendeurs || [], d.acquereurs || [], d.heritiers || []);
  function conditionsDe(d) {
    const ps = parties(d);
    const b = d.bien || {};
    return {
      '': true,
      copro: !!b.copro,
      societe: ps.some((x) => x.qualite === 'societe'),
      maries: ps.some((x) => x.situation === 'marie' || x.situation === 'pacse'),
      pret: !!(d.financement && d.financement.pret),
      travaux: !!b.travauxRecents,
      permis: !!b.permis,
      conjoint: !!(d.defunt && (d.defunt.situation === 'marie' || d.defunt.situation === 'pacse')),
      testament: !!(d.defunt && d.defunt.testament),
    };
  }

  /* ---------- Diagnostics (vente) ---------- */
  /*
   * Règles (vente d'un immeuble bâti) — art. L. 271-4 CCH :
   *   DPE ; amiante si permis antérieur au 1er juillet 1997 ; plomb (CREP) si construit avant 1949 ;
   *   électricité et gaz si installation de plus de 15 ans ; termites et mérule selon arrêté préfectoral ;
   *   état des risques (ERP) ; assainissement non collectif ; Carrez pour un lot de copropriété ;
   *   audit énergétique pour une maison ou un immeuble en monopropriété classé E, F ou G.
   */
  function diagnostics(d, p) {
    const b = d.bien || {};
    const dg = d.diagnostics || {};
    const bati = b.type !== 'terrain';
    const habitation = bati && b.type !== 'local';
    const dateRef = (d.dates && (d.etape === 'vente' ? d.dates.vente : d.dates.promesse || d.dates.vente)) || '';
    const out = [];
    function ajouter(code, libelle, obligatoire, motif, validite) {
      const saisie = dg[code] || {};
      const item = { code, libelle, obligatoire, motif, validite, date: saisie.date || '', resultat: saisie.resultat || '', recu: !!saisie.recu };
      // Fin de validité (null = illimitée).
      let fin = null;
      if (item.date && validite) fin = validite(item.date, item.resultat);
      item.finValidite = fin === undefined ? null : fin;
      if (!item.recu) item.etat = obligatoire === 'non' ? 'na' : obligatoire === 'a_verifier' ? 'a_verifier' : 'manquant';
      else if (item.finValidite && dateRef && avant(item.finValidite, dateRef)) item.etat = 'perime';
      else if (item.finValidite && !dateRef && avant(item.finValidite, d.aujourdhui || '')) item.etat = 'perime';
      else item.etat = 'valide';
      out.push(item);
      return item;
    }
    const mois = (n) => (date) => addMonths(date, n);

    // DPE : 10 ans, sauf anciens DPE (validité réduite par le décret du 17 juin 2020).
    ajouter('dpe', 'Diagnostic de performance énergétique (DPE)', habitation ? 'oui' : bati ? 'oui' : 'non',
      habitation ? 'Obligatoire pour tout logement vendu.' : bati ? 'Obligatoire pour un bâtiment (sauf exceptions).' : 'Terrain non bâti.',
      (date) => {
        if (avant(date, '2013-01-01')) return '2022-12-31';
        if (avant(date, '2018-01-01')) return '2022-12-31';
        if (avant(date, '2021-07-01')) return '2024-12-31';
        return addMonths(date, 120);
      });

    // Audit énergétique : maison ou immeuble en monopropriété, classe E, F ou G.
    const classe = (b.dpeClasse || '').toUpperCase();
    const monopropriete = habitation && !b.copro && (b.type === 'maison' || b.type === 'immeuble');
    const auditObligatoire = monopropriete && (classe === 'F' || classe === 'G' || (classe === 'E' && !avant(dateRef || d.aujourdhui || '2025-01-01', '2025-01-01')));
    if (monopropriete) {
      ajouter('audit', 'Audit énergétique', !classe ? 'a_verifier' : auditObligatoire ? 'oui' : 'non',
        !classe ? 'Obligatoire si le DPE classe le bien en E, F ou G : renseigner la classe du DPE.'
          : auditObligatoire ? 'Maison en monopropriété classée ' + classe + ' au DPE.' : 'Classe ' + classe + ' : non obligatoire.', mois(60));
    }

    // Amiante : permis de construire délivré avant le 1er juillet 1997.
    const c = b.construction || '';
    ajouter('amiante', 'Constat amiante', !bati ? 'non' : c === '' ? 'a_verifier' : c === 'apres1997' ? 'non' : 'oui',
      !bati ? 'Terrain non bâti.' : c === '' ? 'Obligatoire si le permis de construire est antérieur au 1er juillet 1997 : renseigner l\'époque de construction.'
        : c === 'apres1997' ? 'Permis de construire délivré après le 1er juillet 1997.' : 'Permis de construire antérieur au 1er juillet 1997.',
      (date, res) => (res === 'positif' ? addMonths(date, 36) : null));

    // Plomb (CREP) : logement construit avant le 1er janvier 1949.
    ajouter('plomb', 'Constat de risque d\'exposition au plomb (CREP)', !habitation ? 'non' : c === '' ? 'a_verifier' : c === 'avant1949' ? 'oui' : 'non',
      !habitation ? 'Ne concerne que les logements.' : c === '' ? 'Obligatoire si le logement a été construit avant le 1er janvier 1949.'
        : c === 'avant1949' ? 'Logement construit avant le 1er janvier 1949.' : 'Construit après le 1er janvier 1949.',
      (date, res) => (res === 'positif' ? addMonths(date, 12) : null));

    // Électricité et gaz : installation de plus de 15 ans (logement).
    const inst = (v, nom) => (!habitation ? 'non' : v === 'plus15' ? 'oui' : v === 'moins15' || v === 'aucune' ? 'non' : 'a_verifier');
    const instMotif = (v, nom) => (!habitation ? 'Ne concerne que les logements.' : v === 'plus15' ? 'Installation ' + nom + ' de plus de 15 ans.'
      : v === 'moins15' ? 'Installation ' + nom + ' de moins de 15 ans.' : v === 'aucune' ? 'Pas d\'installation ' + nom + '.'
        : 'Obligatoire si l\'installation ' + nom + ' a plus de 15 ans.');
    ajouter('electricite', 'État de l\'installation intérieure d\'électricité', inst(b.electricite), instMotif(b.electricite, 'd\'électricité'), mois(36));
    ajouter('gaz', 'État de l\'installation intérieure de gaz', inst(b.gaz), instMotif(b.gaz, 'de gaz'), mois(36));

    // Termites : arrêté préfectoral.
    const t = zone(p.zonesTermites, p.departementsTermites, b);
    const it = ajouter('termites', 'État relatif à la présence de termites', !bati ? 'non' : t.statut === 'oui' ? 'oui' : t.statut === 'non' ? 'non' : 'a_verifier',
      !bati ? 'Terrain non bâti.' : t.motif, mois(6));
    it.arrete = t.zone ? t.zone.arrete || '' : '';
    // Mérule : information de l'acquéreur si la commune est en zone de présence d'un risque.
    const m = zone(p.zonesMerule, p.departementsMerule, b);
    ajouter('merule', 'Information sur la présence d\'un risque de mérule', !bati ? 'non' : m.statut === 'oui' ? 'oui' : m.statut === 'non' ? 'non' : 'a_verifier',
      !bati ? 'Terrain non bâti.' : m.motif, null);

    // État des risques : toujours.
    ajouter('erp', 'État des risques et pollutions (ERP) — Géorisques', 'oui', 'Obligatoire pour toute vente ; à établir avec Géorisques.', mois(6));

    // Assainissement non collectif.
    const a = b.assainissement || '';
    ajouter('assainissement', 'Contrôle de l\'assainissement non collectif', !bati ? 'non' : a === 'non_collectif' ? 'oui' : a === 'collectif' ? 'non' : 'a_verifier',
      !bati ? 'Terrain non bâti.' : a === 'non_collectif' ? 'Le bien n\'est pas raccordé au tout-à-l\'égout.' : a === 'collectif' ? 'Raccordé au réseau collectif (contrôle de raccordement selon la commune).' : 'Obligatoire si le bien n\'est pas raccordé au tout-à-l\'égout.', mois(36));

    // Mesurage Carrez : lot de copropriété.
    ajouter('carrez', 'Mesurage loi Carrez', b.copro && bati ? 'oui' : 'non', b.copro ? 'Lot de copropriété.' : 'Hors copropriété.', null);

    // Zone de bruit d'un aérodrome : à vérifier.
    ajouter('bruit', 'Diagnostic bruit (zone d\'un plan d\'exposition au bruit)', b.zoneBruit === true ? 'oui' : b.zoneBruit === false ? 'non' : 'a_verifier',
      b.zoneBruit === true ? 'Bien situé dans une zone de bruit d\'aérodrome.' : b.zoneBruit === false ? 'Hors zone de bruit.' : 'Obligatoire si le bien est dans une zone du plan d\'exposition au bruit d\'un aérodrome.', null);

    return out;
  }

  /* ---------- Pièces ---------- */
  function pieces(d, p) {
    const modeles = ((p.pieces || {})[d.type] || []).concat(d.piecesAjoutees || []);
    const cond = conditionsDe(d);
    const suivi = d.pieces || {};
    return modeles.map((m) => {
      const s = suivi[m.id] || {};
      const applicable = cond[m.condition || ''] !== false;
      let statut = s.statut || (applicable ? 'manquante' : 'na');
      if (!applicable && !s.statut) statut = 'na';
      return { id: m.id, libelle: m.libelle, etape: m.etape, condition: m.condition || '', applicable, statut, date: s.date || '', note: s.note || '', ajoutee: !!m.ajoutee, auto: m.auto || '' };
    });
  }

  /* ---------- État complet ---------- */
  function etat(d, p) {
    const type = d.type === 'succession' ? 'succession' : 'vente';
    const today = d.aujourdhui || '';
    const diags = type === 'vente' ? diagnostics(d, p) : [];
    const ps = pieces(d, p);

    // Pièce « Diagnostics » : reçue quand tous les diagnostics obligatoires sont reçus et valides.
    const diagsRequis = diags.filter((x) => x.obligatoire === 'oui');
    ps.forEach((x) => {
      if (x.auto !== 'diagnostics' || (d.pieces && d.pieces[x.id] && d.pieces[x.id].statut === 'na')) return;
      const ok = diagsRequis.length > 0 && diagsRequis.every((y) => y.etat === 'valide') && !diags.some((y) => y.obligatoire === 'a_verifier' && !y.recu);
      if (ok) x.statut = 'recue';
      else if (x.statut === 'recue') x.statut = 'demandee';
      x.detail = diagsRequis.filter((y) => y.etat === 'valide').length + ' / ' + diagsRequis.length + ' obligatoires reçus';
    });

    const etapes = ETAPES[type].map((e) => {
      const liste = ps.filter((x) => x.etape === e.id && x.statut !== 'na');
      const recues = liste.filter((x) => x.statut === 'recue').length;
      const demandees = liste.filter((x) => x.statut === 'demandee').length;
      return { id: e.id, libelle: e.libelle, total: liste.length, recues, demandees, manquantes: liste.length - recues - demandees, taux: liste.length ? recues / liste.length : 1 };
    });
    const etapeCourante = ETAPES[type].some((e) => e.id === d.etape) ? d.etape : ETAPES[type][0].id;

    // Échéances.
    const echeances = [];
    const dates = d.dates || {};
    if (type === 'vente') {
      if (dates.promesse) echeances.push({ id: 'promesse', libelle: 'Signature de la promesse', date: dates.promesse });
      if (dates.vente) echeances.push({ id: 'vente', libelle: 'Signature de la vente', date: dates.vente });
      if (dates.conditionPret) echeances.push({ id: 'pret', libelle: 'Condition suspensive de prêt', date: dates.conditionPret });
    } else {
      const deces = d.defunt && d.defunt.dateDeces;
      if (deces) echeances.push({ id: 'declaration', libelle: 'Dépôt de la déclaration de succession (6 mois)', date: addMonths(deces, 6) });
      if (dates.rdv) echeances.push({ id: 'rdv', libelle: 'Rendez-vous de signature', date: dates.rdv });
    }
    echeances.forEach((e) => (e.jours = today ? joursEntre(today, e.date) : null));
    const aVenir = echeances.filter((e) => e.jours === null || e.jours >= 0).sort((a, b) => (a.date < b.date ? -1 : 1));
    const prochaine = aVenir[0] || null;

    // Alertes.
    const alertes = [];
    // Diagnostics : on signale ceux qui dépendent de la commune ou du bien (termites, mérule, audit),
    // les autres apparaissent dans la liste des pièces.
    const SIGNALES = { termites: 'fort', merule: 'moyen', audit: 'moyen' };
    const commune = (d.bien && d.bien.commune) || 'la commune';
    diags.forEach((x) => {
      if (SIGNALES[x.code] && x.obligatoire === 'oui' && x.etat === 'manquant') {
        alertes.push({ niveau: SIGNALES[x.code], texte: x.code === 'termites'
          ? 'Diagnostic termites obligatoire à ' + commune + (x.arrete ? ' — ' + x.arrete : '') + '.'
          : x.libelle + ' : obligatoire (' + x.motif.replace(/\.$/, '') + ').' });
      }
      if (x.code === 'termites' && x.obligatoire === 'a_verifier' && !x.recu && d.bien && d.bien.commune) alertes.push({ niveau: 'faible', texte: 'Termites : arrêté à vérifier pour ' + commune + '.' });
      if (x.etat === 'perime') alertes.push({ niveau: 'fort', texte: x.libelle + ' : plus valable à la date de signature (fin de validité le ' + x.finValidite.split('-').reverse().join('/') + ').' });
    });
    const cur = etapes.find((e) => e.id === etapeCourante);
    if (prochaine && prochaine.jours !== null && prochaine.jours <= 15 && cur && cur.manquantes + cur.demandees > 0) {
      alertes.unshift({ niveau: 'fort', texte: prochaine.libelle + ' dans ' + prochaine.jours + ' jour(s) : ' + (cur.manquantes + cur.demandees) + ' pièce(s) non reçue(s).' });
    }
    // Relances : pièces demandées depuis plus de 15 jours.
    ps.filter((x) => x.statut === 'demandee' && x.date && today && joursEntre(x.date, today) > (p.delaiRelance || 15)).forEach((x) => {
      alertes.push({ niveau: 'faible', texte: 'Relancer : ' + x.libelle + ' (demandée le ' + x.date.split('-').reverse().join('/') + ').' });
    });

    return {
      type, etapes, etapeCourante, pieces: ps, diagnostics: diags, echeances, prochaine, alertes,
      termites: diags.find((x) => x.code === 'termites') || null,
      progression: (() => {
        const all = ps.filter((x) => x.statut !== 'na');
        return all.length ? all.filter((x) => x.statut === 'recue').length / all.length : 0;
      })(),
    };
  }

  // Intitulé du dossier : « MARTIN / SCI LES OLIVIERS » ou « Succession DUPONT ».
  function reference(d) {
    if (d.reference) return d.reference;
    const noms = (l) => (l || []).filter((x) => x.nom).map((x) => (x.qualite === 'societe' ? x.nom : (x.nom.split(/\s+/)[0] || '').toUpperCase()));
    const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);
    if (d.type === 'succession') return d.defunt && d.defunt.nom ? 'Succession ' + d.defunt.nom.toUpperCase() : '';
    const v = uniq(noms(d.vendeurs)).join(' - '), a = uniq(noms(d.acquereurs)).join(' - ');
    return v || a ? (v || '…') + ' / ' + (a || '…') : '';
  }

  return { TYPES, ETAPES, CONDITIONS, STATUTS, etat, diagnostics, pieces, zone, departement, normCommune, reference, addMonths, conditionsDe };
});
