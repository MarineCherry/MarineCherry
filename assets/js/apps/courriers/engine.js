/*
 * Courriers de succession : modèles de courriers, rédaction à partir de la fiche du défunt,
 * fichier Word (.docx) construit sur le papier à en-tête de l'étude, carnet d'adresses
 * et lecture des réponses de l'annuaire de l'administration.
 * Fonctions pures (aucun accès au DOM ni à internet) : testables sous Node.
 */
(function (root, factory) {
  const lettres = typeof module === 'object' && module.exports ? require('../origine/lettres.js') : root.Atelier.lettres;
  const zip = typeof module === 'object' && module.exports ? require('../../core/zip.js') : root.Atelier.zip;
  const mod = factory(lettres, zip);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.courriers = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (L, Z) {
  'use strict';

  /* ======================================================================
     1. Destinataires et modèles
     ====================================================================== */

  const TYPES = [
    { id: 'banque', libelle: 'Banque', pluriel: 'Banques' },
    { id: 'assurance', libelle: 'Assurance-vie', pluriel: 'Assurances-vie' },
    { id: 'mutuelle', libelle: 'Mutuelle', pluriel: 'Mutuelles' },
    { id: 'departement', libelle: 'Conseil départemental', pluriel: 'Conseil départemental' },
    { id: 'tresor', libelle: 'Trésor public', pluriel: 'Trésor public' },
    { id: 'retraite', libelle: 'Caisse de retraite', pluriel: 'Caisses de retraite' },
    { id: 'ehpad', libelle: 'Maison de retraite', pluriel: 'Maisons de retraite' },
    { id: 'autre', libelle: 'Autre destinataire', pluriel: 'Autres destinataires' },
  ];
  const typeDe = (id) => TYPES.find((t) => t.id === id) || TYPES[TYPES.length - 1];

  /*
   * Syntaxe des modèles :
   *   {variable}                          valeur de la fiche (« ...... » si elle manque)
   *   {si variable} … {sinon} … {fin}     passage conditionnel ; {si non variable}
   *   {accord : forme masculine | forme féminine}   accord selon le défunt
   *   **texte**                           texte en gras
   *   Chaque ligne est un paragraphe ; une ligne vide laisse un blanc.
   */
  const CONSERVER = 'Je vous serais reconnaissant de bien vouloir me faire parvenir votre réponse à l\'adresse de l\'étude ou par courriel à l\'adresse indiquée ci-dessus.';
  const SALUTATIONS = 'Je vous prie de croire, Madame, Monsieur, à l\'assurance de mes salutations distinguées.';
  const MODELES = [
    {
      id: 'banque-position', type: 'banque', titre: 'Banque — demande de position',
      appel: 'Madame, Monsieur le Directeur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession ci-dessus référencée, je vous remercie de bien vouloir m\'indiquer concernant la personne décédée{si conjoint} et son conjoint{fin} :',
        '- la liste des comptes individuels, joints ou indivis, plans et livrets ouverts dans l\'une ou plusieurs de vos agences en me précisant leur caractère (compte courant, compte sur livret, compte joint, compte épargne-logement, …) ;',
        '- et, la position, au jour du décès et à ce jour, de ces comptes ;',
        '- la liste, la désignation et le cours des différents titres et valeurs détenus en tout ou partie, au jour du décès, à ce jour et la moyenne des 30 derniers jours ;',
        '- la situation, au jour du décès, de tout emprunt ou ouverture de crédit dont la personne décédée est, le cas échéant, débitrice ou codébitrice en me précisant alors si le remboursement de la dette est pris en charge par une assurance ;',
        '- le ou les contrats de cautionnement souscrits le cas échéant par la personne décédée et encore en vigueur en me précisant alors leurs caractéristiques ;',
        '- s\'il existe un coffre-fort dont la personne décédée serait titulaire ou cotitulaire ;',
        '- les contrats d\'assurance-vie souscrits par {accord : le défunt | la défunte}, en précisant la date de souscription, les références de l\'assurance, les montants et la date des primes versées{si conjoint} et d\'autre part les contrats d\'assurance-vie souscrits par le conjoint {accord : du défunt | de la défunte} quelle que soit la date de souscription, avec indication de la valeur de rachat au jour du décès{fin}.',
        'J\'attire votre attention sur le fait que ma responsabilité professionnelle ne saurait être recherchée au cas où de tels contrats ne m\'auraient pas été révélés.',
        'Je vous laisse également le soin de me communiquer les autres renseignements que vous jugeriez pouvoir m\'être utiles.',
        '{si conjoint}Vous voudrez bien me préciser si vous laissez au conjoint la libre disposition d\'un ou plusieurs comptes.{fin}',
        'Dans l\'attente de vous lire et vous en remerciant à l\'avance,',
        'Je vous prie de croire, Madame, Monsieur le Directeur, à l\'assurance de mes salutations distinguées.',
      ].join('\n'),
    },
    {
      id: 'banque-deblocage', type: 'banque', titre: 'Banque — déblocage des comptes', rib: true,
      appel: 'Madame, Monsieur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession ci-dessus visée, je vous prie de bien vouloir trouver sous ce pli, les pièces héréditaires suivantes :',
        '- la copie de l\'acte de notoriété',
        '- le RIB de l\'étude',
        '',
        'Je vous serais reconnaissant de bien vouloir solder l\'ensemble des comptes individuels {accord : du défunt | de la défunte}{si comptes} (dont les numéros sont cités plus haut){fin} et de m\'adresser les fonds, sur mon compte CDC, faisant mon affaire personnelle de la remise des fonds aux ayants droit sous mon entière responsabilité et me portant fort pour eux.',
        '',
        'Avec mes remerciements anticipés,',
        SALUTATIONS,
      ].join('\n'),
    },
    {
      id: 'banque-acompte', type: 'banque', titre: 'Banque — demande d\'acompte', rib: true,
      appel: 'Madame, Monsieur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession ci-dessus visée, et avec l\'accord des ayants droit, je vous remercie de bien vouloir virer en ma comptabilité un acompte d\'un montant de {montant}.',
        '',
        'A cet effet, je joins à cet envoi, les pièces suivantes :',
        '- la copie de l\'extrait d\'acte de décès',
        '- et le relevé d\'identité bancaire de l\'étude',
        '',
        'Dans cette attente et avec mes remerciements,',
        SALUTATIONS,
      ].join('\n'),
    },
    {
      id: 'assurance-vie', type: 'assurance', titre: 'Assurance-vie — déblocage de l\'avoir',
      appel: 'Madame, Monsieur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession ci-dessus visée, je vous prie de bien vouloir trouver sous ce pli, les pièces héréditaires suivantes :',
        '- la copie de l\'acte de notoriété',
        '',
        'Ces documents vous permettront de procéder au déblocage de l\'avoir successoral détenu en votre Établissement.',
        '',
        'Avec mes remerciements anticipés,',
        SALUTATIONS,
      ].join('\n'),
    },
    {
      id: 'mutuelle', type: 'mutuelle', titre: 'Mutuelle — sommes dues',
      appel: 'Madame, Monsieur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession citée en références, je vous remercie de bien vouloir m\'indiquer si la personne décédée était redevable envers votre établissement d\'une quelconque somme au jour de son décès.',
        'Par ailleurs, je vous remercie de m\'indiquer si des sommes restent dues à sa succession, à quelque titre que ce soit.',
        'Vous trouverez ci-joint une copie de l\'extrait d\'acte de décès.',
        'Dans l\'attente de vous lire et vous en remerciant d\'avance,',
        SALUTATIONS,
      ].join('\n'),
    },
    {
      id: 'departement-aide-sociale', type: 'departement', titre: 'Conseil départemental — aide sociale et attestation de créancier', annexe: 'attestation',
      appel: 'Madame, Monsieur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession de la personne sus-désignée, je vous remercie de bien vouloir me préciser si cette dernière bénéficiait de prestations relatives à l\'aide sociale et, dans l\'affirmative, je vous serais obligé de bien vouloir me retourner, complétée et signée, l\'**ATTESTATION DE CREANCIER** que vous trouverez sous ce pli, en y portant notamment :',
        '> le motif de la créance,',
        '> sa date,',
        '> son montant, arrêté le cas échéant, à la date du décès.',
        'Selon l\'importance de l\'actif successoral, je désintéresserais le Département de sa créance en partie ou en totalité.',
        '',
        'Dans cette attente,',
        SALUTATIONS,
      ].join('\n'),
    },
    {
      id: 'tresor-bordereau', type: 'tresor', titre: 'Trésor public — bordereau de situation',
      appel: 'Monsieur le Trésorier Principal,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession du défunt ci-dessus référencé, et en vue de déterminer le passif successoral, je vous remercie de bien vouloir me faire parvenir un bordereau de situation, revêtu de la mention d\'attestation de créancier, et faisant apparaître le montant des impositions dues par {accord : le défunt | la défunte}, à votre service des impôts, au jour du décès.',
        '',
        'Dans cette attente,',
        'Je vous prie d\'agréer, Madame, Monsieur, l\'expression de mes respectueuses salutations.',
      ].join('\n'),
    },
    {
      id: 'retraite', type: 'retraite', titre: 'Caisse de retraite — sommes dues et revenus à déclarer',
      appel: 'Madame, Monsieur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession citée en référence, au vu des documents qui m\'ont été communiqués, {accord : le défunt | la défunte} serait titulaire d\'une pension de retraite.',
        'Pour me permettre de mener à bien ma mission, je vous remercie de bien vouloir me préciser :',
        '- si une somme reste due à la succession et le montant des sommes versées pour la période comprise entre le 1er janvier et le {date_deces} ;',
        '- dans quelles conditions et sur quelles justifications il vous sera possible de me faire parvenir ces sommes, sous ma propre responsabilité ;',
        '- le montant des sommes à déclarer au titre de l\'impôt sur le revenu pour la période du 1er janvier au jour du décès.',
        'En outre, pourriez-vous me préciser si la personne décédée bénéficiait du fonds national de solidarité ou de toutes autres aides faisant l\'objet d\'un recouvrement sur l\'actif successoral.',
        'Dans cette attente,',
        SALUTATIONS,
      ].join('\n'),
    },
    {
      id: 'ehpad', type: 'ehpad', titre: 'Maison de retraite — sommes dues, caution et meubles', annexe: 'attestation', rib: true,
      appel: 'Madame, Monsieur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession de la personne sus-désignée, je vous remercie de bien vouloir m\'indiquer :',
        '- le montant des sommes qui étaient dues à votre établissement au jour du décès (attestation de créancier ci-jointe à compléter et me retourner),',
        '- le montant de la caution éventuelle que vous pouvez détenir.',
        'Par ailleurs, je vous remercie également de bien vouloir m\'indiquer si {accord : le défunt | la défunte} possédait des meubles en votre établissement.',
        'Dans la négative, vous voudrez bien me faire parvenir une attestation.',
        '',
        'Enfin, vous voudrez bien m\'indiquer si des sommes étaient dues par votre établissement à la succession.',
        'Auquel cas, vous trouverez ci-après le RIB de l\'Étude, vous permettant de m\'adresser les fonds.',
        'Dans l\'attente de vous lire,',
        SALUTATIONS,
      ].join('\n'),
    },
    {
      id: 'libre', type: 'autre', titre: 'Courrier libre',
      appel: 'Madame, Monsieur,',
      texte: [
        'En ma qualité de notaire chargé du règlement de la succession ci-dessus visée, ',
        '',
        CONSERVER,
        '',
        'Dans cette attente et avec mes remerciements,',
        SALUTATIONS,
      ].join('\n'),
    },
  ];
  // Courriers proposés par défaut pour chaque type de destinataire.
  const PAR_DEFAUT = { banque: 'banque-position', assurance: 'assurance-vie', mutuelle: 'mutuelle', departement: 'departement-aide-sociale', tresor: 'tresor-bordereau', retraite: 'retraite', ehpad: 'ehpad', autre: 'libre' };
  const modelesPour = (type, modeles) => (modeles || MODELES).filter((m) => m.type === type || (type !== 'autre' && m.type === 'autre'));

  // Modèles en vigueur : modèles d'origine, modifiés par l'étude (textes enregistrés sur le poste).
  function modeles(perso) {
    const p = perso || {};
    return MODELES.map((m) => (p[m.id] ? Object.assign({}, m, p[m.id], { modifie: true }) : m));
  }

  /* ======================================================================
     2. Rédaction
     ====================================================================== */

  const REGIMES = [
    'communauté de biens réduite aux acquêts',
    'communauté de meubles et acquêts',
    'communauté universelle',
    'séparation de biens',
    'participation aux acquêts',
  ];
  const CIVILITE = { M: 'Monsieur', Mme: 'Madame' };
  const maj = (s) => (s || '').trim().toLocaleUpperCase('fr-FR');
  const txt = (s) => (s || '').trim();
  const fem = (p) => (p && p.civilite) === 'Mme';
  const designation = (p) => (txt(p.nom) || txt(p.prenoms) ? [CIVILITE[p.civilite] || '', txt(p.prenoms), maj(p.nom)].filter(Boolean).join(' ') : '');
  const dateLongue = (iso) => L.date(iso, false);
  const lieuEtCp = (l) => (l && txt(l.commune) ? maj(l.commune) + ' (' + (txt(l.codePostal) || txt(l.departement)) + ')' : '');

  function montantEnLettres(x) {
    if (!(typeof x === 'number' && isFinite(x) && x > 0)) return null;
    return L.montant(x, 'EUR', true).replace(/\sEUR\)$/, ' €)');
  }

  // Variables disponibles dans les modèles, pour un dossier et un destinataire.
  function variables(d, dest) {
    const df = d.defunt || {};
    const conj = d.conjoint || {};
    return {
      defunt: designation(df) || null,
      le_defunt: fem(df) ? 'la défunte' : 'le défunt',
      nom_defunt: maj(df.nom) || null,
      date_deces: dateLongue(df.deces && df.deces.date) || null,
      lieu_deces: lieuEtCp(df.deces) || null,
      conjoint: d.situation === 'marie' || d.situation === 'pacse' ? designation(conj) || null : null,
      destinataire: dest ? txt(dest.nom) || txt((dest.lignes || '').split('\n')[0]) || null : null,
      comptes: dest && txt(dest.comptes) ? dest.comptes.split(/\n|;/).map(txt).filter(Boolean).join(', ') : null,
      montant: dest ? montantEnLettres(dest.montant) : null,
      numero_retraite: dest && txt(dest.numero) ? txt(dest.numero) : null,
      notaire: txt(d.signataire) || null,
    };
  }

  // Interprétation d'un modèle : liste de lignes (paragraphes), chaque ligne étant une liste de segments.
  function interpreter(src, vars, feminin, manquants) {
    const jetons = String(src || '').split(/(\{[^{}]*\})/);
    const pile = [{ actif: true, sinon: false, cond: true }];
    // Lignes produites ; une ligne non vide dans le modèle mais vide une fois les conditions appliquées disparaît.
    const lignes = [];
    let out = '', source = false;
    const finLigne = () => { if (!(source && !out.trim())) lignes.push(out); out = ''; source = false; };
    const actif = () => pile.every((x) => x.actif);
    for (const j of jetons) {
      const m = /^\{\s*(si|sinon|fin|accord)\b\s*(.*?)\s*\}$/.exec(j);
      if (/^\{.*\}$/.test(j)) source = true;
      if (m && m[1] === 'si') {
        const non = /^non\s+/.test(m[2]);
        const nom = m[2].replace(/^non\s+/, '').trim();
        const v = vars[nom];
        let ok = v !== null && v !== undefined && v !== '' && v !== false;
        if (non) ok = !ok;
        pile.push({ actif: ok, cond: ok });
      } else if (m && m[1] === 'sinon') {
        const top = pile[pile.length - 1];
        if (pile.length > 1) top.actif = !top.cond;
      } else if (m && m[1] === 'fin') {
        if (pile.length > 1) pile.pop();
      } else if (m && m[1] === 'accord') {
        if (actif()) {
          const formes = m[2].replace(/^:\s*/, '').split('|').map((x) => x.trim());
          out += feminin ? (formes[1] !== undefined ? formes[1] : formes[0]) : formes[0];
        }
      } else if (/^\{[\p{L}_][\p{L}\p{N}_]*\}$/u.test(j)) {
        if (!actif()) continue;
        const nom = j.slice(1, -1);
        const v = vars[nom];
        if (v === null || v === undefined || v === '') {
          if (manquants) manquants.add(nom);
          out += '......';
        } else out += v;
      } else if (actif()) {
        j.split('\n').forEach((x, k) => {
          if (k > 0) finLigne();
          if (x.trim()) source = true;
          out += x;
        });
      }
    }
    finLigne();
    return lignes.map(segments);
  }
  // « texte **gras** texte » → [{ t }, { t, b: true }, { t }]
  function segments(ligne) {
    const parts = ligne.split('**');
    return parts.map((t, i) => (i % 2 ? { t, b: true } : { t })).filter((x) => x.t !== '');
  }

  // Bloc « SUCCESSION DE : » du défunt.
  function blocSuccession(d) {
    const df = d.defunt || {};
    const f = fem(df);
    const conj = d.conjoint || {};
    const lignes = [[{ t: 'SUCCESSION DE :', b: true, u: true }], [{ t: designation(df) || '......', b: true }]];
    const dom = df.domicile || {};
    if (txt(dom.adresse) || txt(dom.commune)) lignes.push([{ t: 'Domicile : ' + [txt(dom.adresse), txt(dom.commune) ? 'à ' + lieuEtCp(dom) : ''].filter(Boolean).join(' ') }]);
    const nomConj = () => [{ t: [CIVILITE[conj.civilite] || '', txt(conj.prenoms)].filter(Boolean).join(' ') + ' ' }, { t: maj(conj.nom), b: true }];
    const lien = { marie: f ? 'Épouse de ' : 'Époux de ', veuf: f ? 'Veuve de ' : 'Veuf de ', divorce: f ? 'Divorcée de ' : 'Divorcé de ', pacse: (f ? 'Liée' : 'Lié') + ' par un pacte civil de solidarité avec ' }[d.situation];
    if (lien && txt(conj.nom)) lignes.push([{ t: lien }].concat(nomConj(), [{ t: d.situation === 'marie' ? ',' : '' }]));
    else if (d.situation === 'celibataire') lignes.push([{ t: f ? 'Célibataire' : 'Célibataire' }]);
    if (d.situation === 'marie' && txt(d.regime)) lignes.push([{ t: 'Régime matrimonial : ' + txt(d.regime) }]);
    if (df.naissance && (df.naissance.date || df.naissance.commune)) {
      lignes.push([{ t: (f ? 'Née' : 'Né') + (txt(df.naissance.commune) ? ' à ' + lieuEtCp(df.naissance) : '') + (df.naissance.date ? ', le ' + dateLongue(df.naissance.date) : '') + '.' }]);
    }
    if (df.deces && (df.deces.date || df.deces.commune)) {
      lignes.push([{ t: (f ? 'Décédée' : 'Décédé') + (txt(df.deces.commune) ? ' à ' + lieuEtCp(df.deces) : '') + (df.deces.date ? ', le ' + dateLongue(df.deces.date) : '') + '.' }]);
    }
    return lignes;
  }

  /*
   * Courrier prêt à mettre en page :
   * { destinataire: [lignes], lieuDate, references: [lignes], succession: [[segments]], avant: [[segments]],
   *   appel, corps: [[segments]], signature, annexe, manquants: [variables non renseignées] }
   */
  function rediger(d, dest, modele, opts) {
    const o = opts || {};
    const vars = variables(d, dest);
    const manquants = new Set();
    const feminin = fem(d.defunt);
    const corps = interpreter(modele.texte, vars, feminin, manquants);
    // Retire les lignes vides en tête et en fin.
    while (corps.length && !corps[0].length) corps.shift();
    while (corps.length && !corps[corps.length - 1].length) corps.pop();
    const avant = [];
    if (dest && dest.type === 'banque' && txt(dest.comptes) && modele.id === 'banque-deblocage') {
      const nums = dest.comptes.split(/\n|;/).map(txt).filter(Boolean);
      avant.push([{ t: 'NUMÉRO' + (nums.length > 1 ? 'S' : '') + ' DE COMPTE' + (nums.length > 1 ? 'S' : '') + ' : ', b: true }, { t: nums.join(' – ') }]);
    }
    if (dest && dest.type === 'retraite' && txt(dest.numero)) avant.push([{ t: 'N° d\'immatriculation : ', b: true }, { t: txt(dest.numero), b: true }]);
    const clerc = d.clerc || {};
    const lignesDest = String((dest && dest.lignes) || '').split('\n').map(txt).filter(Boolean);
    return {
      destinataire: lignesDest,
      lieuDate: (maj(o.ville) || '......') + ', le ' + (dateLongue(d.dateCourrier || o.aujourdhui) || '......'),
      references: [
        'Nos réf. : ' + (txt(d.nosRef) || ''),
        'Dossier suivi par : ' + (txt(clerc.nom) || ''),
        txt(clerc.email),
        'Vos réf. : ' + ((dest && txt(dest.vosRef)) || ''),
      ].filter((x) => x !== ''),
      succession: blocSuccession(d),
      avant,
      appel: interpreter(modele.appel || 'Madame, Monsieur,', vars, feminin, manquants)[0].map((x) => x.t).join(''),
      corps,
      signature: txt(d.signataire) || txt(o.signataire) || '',
      annexe: modele.annexe === 'attestation' ? attestation(d, o) : null,
      rib: modele.rib && txt(o.rib) ? o.rib.split('\n').map((l) => l.replace(/\s+$/, '')) : null,
      manquants: Array.from(manquants),
    };
  }

  // Attestation de créancier jointe au courrier (art. 1754 V-4 CGI reproduit).
  function attestation(d, o) {
    const df = d.defunt || {};
    const dom = df.domicile || {};
    const pointilles = '..........................................................................................................';
    return {
      entete: [
        (txt(d.signataire) || txt(o.signataire) || 'Maître ......') + ' notaire à ' + (maj(o.ville) || '......'),
        'Références de l\'étude : ' + (txt(d.nosRef) || '......'),
        'Dossier : Succession ' + (designation(df) || '......'),
      ],
      titre: 'ATTESTATION DE CRÉANCIER',
      corps: [
        [{ t: 'JE SOUSSIGNÉ ' + pointilles.slice(0, 60) }],
        [{ t: 'Atteste que ' + ([CIVILITE[df.civilite] || '', txt(df.prenoms).split(' ')[0], maj(df.nom)].filter(Boolean).join(' ') || '......') + ', en son vivant demeurant' + (txt(dom.commune) ? ' à ' + lieuEtCp(dom) : '') + (txt(dom.adresse) ? ', ' + txt(dom.adresse) : '') + ', était, au moment de son décès, ' + (fem(df) ? 'débitrice' : 'débiteur') + ' envers moi EN VERTU :' }],
        [{ t: '(Indiquer ci-après l\'origine de la créance)', i: true }],
        [{ t: pointilles }], [{ t: pointilles }], [{ t: pointilles }],
        [{ t: 'Montants dus :', b: true }],
        [{ t: 'De la somme de : ' + pointilles.slice(0, 40) }],
        [{ t: 'Dont en capital : ' + pointilles.slice(0, 40) }],
        [{ t: 'Intérêts au décès : ' + pointilles.slice(0, 40) }],
        [{ t: 'Soit au total : ' + pointilles.slice(0, 40) }],
        [{ t: 'Et délivre la présente attestation sur la demande des héritiers ' + (fem(df) ? 'de la défunte susnommée' : 'du défunt susnommé') + ', pour être déposée au bureau de l\'enregistrement à l\'appui d\'une demande en déduction du passif grevant la succession.' }],
        [{ t: 'Je déclare en outre connaître les dispositions du 4 du V de l\'article 1754 du code général des impôts relatives aux peines en cas de fausse attestation, et ci-après littéralement retranscrites :' }],
        [{ t: '« Le prétendu créancier qui a faussement attesté l\'existence d\'une dette dont la déduction est demandée pour la perception des droits de mutation par décès est tenu, solidairement avec le déclarant, au paiement de l\'intérêt de retard et de la majoration prévue à l\'article 1729 ».', i: true }],
        [],
        [{ t: 'FAIT A : ......................' }],
        [{ t: 'Le : ......................' }],
      ],
    };
  }

  /* ======================================================================
     3. Fichier Word (.docx)
     ====================================================================== */

  const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function run(seg, rPrPlus) {
    const rpr = (seg.b ? '<w:b/>' : '') + (seg.i ? '<w:i/>' : '') + (seg.u ? '<w:u w:val="single"/>' : '') + (rPrPlus || '');
    return '<w:r>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + xmlEsc(seg.t) + '</w:t></w:r>';
  }
  function para(segs, pPr, rPrPlus) {
    return '<w:p>' + (pPr ? '<w:pPr>' + pPr + '</w:pPr>' : '') + (segs || []).map((s) => run(s, rPrPlus)).join('') + '</w:p>';
  }
  const P_DEST = '<w:ind w:left="2552" w:firstLine="0"/><w:jc w:val="left"/>';
  const P_REF = '<w:ind w:left="0" w:firstLine="0"/><w:jc w:val="left"/>';
  const P_CORPS = '<w:ind w:firstLine="709"/><w:jc w:val="both"/>';
  const P_CENTRE = '<w:ind w:firstLine="0"/><w:jc w:val="center"/>';
  const P_SANS = '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/><w:jc w:val="left"/>';
  const R_TABLEAU = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>';

  function corpsXml(c) {
    const x = [];
    c.destinataire.forEach((l, i) => x.push(para([{ t: l, b: i === 0 || /^\d{5}\s|cedex/i.test(l) }], P_DEST)));
    for (let i = 0; i < 3; i++) x.push(para([], P_DEST));
    x.push(para([{ t: c.lieuDate }], P_DEST), para([], P_DEST));
    c.references.forEach((l) => x.push(para([{ t: l }], P_REF)));
    x.push(para([], P_REF));
    const bord = '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>';
    x.push('<w:tbl><w:tblPr><w:tblW w:w="7080" w:type="dxa"/><w:tblBorders>' + bord + '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="7080"/></w:tblGrid>'
      + '<w:tr><w:tc><w:tcPr><w:tcW w:w="7080" w:type="dxa"/></w:tcPr>'
      + c.succession.map((l) => para(l, P_SANS, R_TABLEAU)).join('')
      + '</w:tc></w:tr></w:tbl>');
    x.push(para([], P_REF));
    c.avant.forEach((l) => x.push(para(l, P_REF), para([], P_REF)));
    x.push(para([{ t: c.appel }], P_CORPS), para([], P_CORPS));
    c.corps.forEach((l) => x.push(para(l, P_CORPS)));
    x.push(para([], P_CORPS), para([], P_CORPS));
    if (c.signature) x.push(para([{ t: c.signature }], P_CENTRE));
    if (c.rib) {
      x.push(para([], P_REF), para([], P_REF), para([{ t: 'COORDONNÉES BANCAIRES DE L\'OFFICE NOTARIAL :', b: true }], P_REF));
      c.rib.forEach((l) => x.push(para([{ t: l }], P_REF)));
    }
    if (c.annexe) {
      x.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      c.annexe.entete.forEach((l) => x.push(para([{ t: l }], P_CENTRE)));
      x.push(para([], P_CENTRE), para([{ t: c.annexe.titre, b: true, u: true }], P_CENTRE), para([], P_CENTRE));
      c.annexe.corps.forEach((l) => x.push(para(l, P_CORPS)));
    }
    return x.join('');
  }

  // Paquet Word minimal (sans papier à en-tête importé).
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  function paquetMinimal() {
    return {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'word/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:jc w:val="both"/></w:pPr></w:style></w:styles>',
      'word/document.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>',
    };
  }

  // Remplace le contenu du document par le courrier, en gardant l'en-tête, le pied de page et la mise en page.
  function documentXml(gabarit, courrier) {
    const debut = /^[\s\S]*?<w:body>/.exec(gabarit);
    const sect = /<w:sectPr[\s\S]*<\/w:sectPr>(?=\s*<\/w:body>)/.exec(gabarit);
    if (!debut) throw new Error('Modèle Word illisible.');
    return debut[0] + corpsXml(courrier) + (sect ? sect[0] : '') + '</w:body></w:document>';
  }

  // Fichier .docx (Uint8Array) pour un courrier ; paquet = contenu du papier à en-tête importé (ou paquet minimal).
  function docx(courrier, paquet) {
    const fichiers = {};
    const src = paquet || paquetMinimal();
    Object.keys(src).forEach((k) => (fichiers[k] = typeof src[k] === 'string' ? Z.octets(src[k]) : src[k]));
    fichiers['word/document.xml'] = Z.octets(documentXml(Z.texte(fichiers['word/document.xml']), courrier));
    return Z.ecrire(fichiers);
  }

  /* ======================================================================
     4. Import du papier à en-tête (un courrier Word de l'étude)
     ====================================================================== */

  const RETIRER = [/^customXml\//, /^docProps\/custom\.xml$/, /^word\/glossary\//];
  const TYPES_RETIRES = /\/(customXml|custom-properties|glossaryDocument)"/;

  // Garde la mise en page, l'en-tête et le pied de page ; retire les données du dossier d'origine.
  function nettoyerPaquet(entrees) {
    const out = {};
    Object.keys(entrees).forEach((k) => {
      if (RETIRER.some((re) => re.test(k))) return;
      out[k] = entrees[k];
    });
    const edit = (nom, fn) => { if (out[nom]) out[nom] = Z.octets(fn(Z.texte(out[nom]))); };
    edit('[Content_Types].xml', (x) => x.replace(/<Override PartName="\/(customXml\/[^"]*|docProps\/custom\.xml|word\/glossary\/[^"]*)"[^>]*\/>/g, ''));
    edit('_rels/.rels', (x) => x.replace(/<Relationship [^>]*\/>/g, (r) => (TYPES_RETIRES.test(r) ? '' : r)));
    edit('word/_rels/document.xml.rels', (x) => x.replace(/<Relationship [^>]*\/>/g, (r) => (TYPES_RETIRES.test(r) ? '' : r)));
    edit('word/settings.xml', (x) => x.replace(/<w:docVars>[\s\S]*?<\/w:docVars>/, '').replace(/<w:attachedTemplate [^>]*\/>/, ''));
    edit('docProps/core.xml', (x) => x.replace(/<dc:title>[^<]*<\/dc:title>/, '<dc:title>Courrier</dc:title>').replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>').replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>'));
    // Le corps du courrier d'origine (données d'un autre dossier) est vidé ; il sera remplacé à chaque courrier.
    edit('word/document.xml', (x) => (/^[\s\S]*?<w:body>/.exec(x) || [''])[0] + '<w:p/>' + ((/<w:sectPr[\s\S]*<\/w:sectPr>(?=\s*<\/w:body>)/.exec(x) || [''])[0]) + '</w:body></w:document>');
    return out;
  }

  // Paragraphes d'un fragment XML : [{ align, taille, segments: [{ t, b, i, u, taille }] }]
  function paragraphes(xml) {
    const out = [];
    const reP = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
    let m;
    while ((m = reP.exec(xml))) {
      const p = m[1] || '';
      const pPr = (/<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p) || [])[1] || '';
      const align = (/<w:jc w:val="(\w+)"/.exec(pPr) || [])[1] || 'left';
      const taillePara = +((/<w:sz w:val="(\d+)"/.exec(pPr) || [])[1] || 0) / 2 || null;
      const segs = [];
      const reR = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
      let r;
      while ((r = reR.exec(p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '')))) {
        const rPr = (/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r[1]) || [])[1] || '';
        const on = (tag) => new RegExp('<w:' + tag + '(?:\\s+w:val="(?:1|true|on)")?\\s*/>').test(rPr) || (tag === 'u' && /<w:u w:val="(?!none)/.test(rPr));
        const corps = r[1].replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
        let t = '';
        corps.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:br\s*\/>|<w:tab\s*\/>/g, (all, x) => { t += x !== undefined ? x : all.startsWith('<w:br') ? '\n' : ' '; return ''; });
        t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        if (t) segs.push({ t, b: on('b'), i: on('i'), u: on('u'), taille: +((/<w:sz w:val="(\d+)"/.exec(rPr) || [])[1] || 0) / 2 || null });
      }
      out.push({ align, taille: taillePara, segments: segs });
    }
    return out;
  }

  const EMU_MM = 36000;
  const TWIP_MM = 1440 / 25.4;
  /*
   * Papier à en-tête de la première page, décrit pour être reproduit à l'écran et dans les PDF :
   * { elements: [{ type: 'image'|'texte'|'trait', x, y, l, h (mm), paragraphes, image }], marges: { haut, gauche, droite, bas } (mm),
   *   ville, signataire }
   */
  function extrairePapier(entrees) {
    const T = (k) => (entrees[k] ? Z.texte(entrees[k]) : '');
    const doc = T('word/document.xml');
    const rels = T('word/_rels/document.xml.rels');
    const sect = (/<w:sectPr[\s\S]*<\/w:sectPr>(?=\s*<\/w:body>)/.exec(doc) || [''])[0];
    const premiere = /<w:titlePg(?:\s+w:val="(?:1|true)")?\s*\/>/.test(sect);
    const ref = (new RegExp('<w:headerReference w:type="' + (premiere ? 'first' : 'default') + '" r:id="(\\w+)"').exec(sect) || [])[1];
    const cible = ref && (new RegExp('Id="' + ref + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('Target="([^"]+)"[^>]*Id="' + ref + '"').exec(rels) || [])[1];
    const marge = (k, def) => { const m = new RegExp('w:' + k + '="(\\d+)"').exec((/<w:pgMar [^>]*>/.exec(sect) || [''])[0]); return m ? +m[1] / TWIP_MM : def; };
    const marges = { haut: marge('top', 25), gauche: marge('left', 25), droite: marge('right', 20), bas: marge('bottom', 20) };
    const elements = [];
    if (cible) {
      const nomEntete = 'word/' + cible.replace(/^\/?word\//, '');
      const hx = T(nomEntete).replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
      const hrels = T(nomEntete.replace(/([^/]+)$/, '_rels/$1.rels'));
      hx.split('<wp:anchor').slice(1).forEach((seg) => {
        const pos = (axe) => { const m = new RegExp('<wp:position' + axe + ' relativeFrom="(\\w+)">[\\s\\S]*?<wp:posOffset>(-?\\d+)</wp:posOffset>').exec(seg); return m ? { rel: m[1], v: +m[2] / EMU_MM } : null; };
        const ext = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(seg);
        const ph = pos('H'), pv = pos('V');
        if (!ph || !pv || !ext) return;
        const base = { x: ph.v + (ph.rel === 'margin' ? marges.gauche : 0), y: pv.v + (pv.rel === 'margin' ? marges.haut : 0), l: +ext[1] / EMU_MM, h: +ext[2] / EMU_MM };
        const emb = /<a:blip r:embed="(\w+)"/.exec(seg);
        if (emb) {
          const cibleImg = (new RegExp('Id="' + emb[1] + '"[^>]*Target="([^"]+)"').exec(hrels) || [])[1];
          const nomImg = cibleImg && 'word/' + cibleImg.replace(/^\/?word\//, '').replace(/^\.\.\//, '');
          if (nomImg && entrees[nomImg]) {
            const ext2 = nomImg.split('.').pop().toLowerCase();
            elements.push(Object.assign(base, { type: 'image', mime: ext2 === 'png' ? 'image/png' : ext2 === 'gif' ? 'image/gif' : 'image/jpeg', base64: base64(entrees[nomImg]) }));
          }
          return;
        }
        const boite = /<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/.exec(seg);
        if (boite) {
          const ps = paragraphes(boite[1]);
          if (ps.some((p) => p.segments.length)) elements.push(Object.assign(base, { type: 'texte', paragraphes: ps }));
          return;
        }
        if (/prstGeom prst="(?:line|straightConnector1)"|<wps:cNvCnPr|<a:ln/.test(seg) && (base.l < 0.5 || base.h < 0.5)) elements.push(Object.assign(base, { type: 'trait' }));
      });
    }
    const textes = elements.filter((e) => e.type === 'texte').map((e) => e.paragraphes.map((p) => p.segments.map((s) => s.t).join('')).join('\n')).join('\n');
    const ville = (/\d{5}\s+([A-ZÀ-Ÿ' -]+?)(?:\s+CEDEX.*)?\s*(?:\n|$)/.exec(textes) || [])[1] || '';
    const sign = (/(Ma[îi]tre\s+[^\n]{3,60})/.exec(doc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) || [])[1];
    const titre = elements.filter((e) => e.type === 'texte').sort((a, b) => a.y - b.y)[0];
    const nomTitre = titre && titre.paragraphes[0] ? titre.paragraphes[0].segments.map((s) => s.t).join('').trim() : '';
    return { elements, marges, ville: ville.trim(), signataire: sign ? sign.trim().replace(/\s+\S*$/, (x) => (/[A-Z]{2}/.test(x) ? x : '')).trim() : nomTitre ? 'Maître ' + nomTitre : '' };
  }
  function base64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deBase64(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Import complet : { papier, paquet (base64 d'un .docx nettoyé) }
  async function importerPapier(octets) {
    const entrees = await Z.lire(octets);
    if (!entrees['word/document.xml']) throw new Error('Ce fichier n\'est pas un document Word (.docx).');
    const papier = extrairePapier(entrees);
    const paquet = nettoyerPaquet(entrees);
    return { papier, paquet: base64(Z.ecrire(paquet)) };
  }
  const ouvrirPaquet = async (b64) => (b64 ? Z.lire(deBase64(b64)) : null);

  /* ======================================================================
     5. Annuaire de l'administration et carnet d'adresses
     ====================================================================== */

  // Types de services de l'annuaire (service-public.fr) recherchés pour chaque destinataire.
  const PIVOTS = { departement: ['cg', 'conseil_departemental'], tresor: ['sip', 'sie_sip'], retraite: ['carsat', 'cnav', 'msa'] };

  const json = (v) => {
    if (Array.isArray(v) || (v && typeof v === 'object')) return v;
    try { return JSON.parse(v || 'null'); } catch (e) { return null; }
  };
  // Entrées « pivot » d'un service : [{ type, communes: [codes INSEE] }]
  const pivots = (rec) => (json(rec.pivot) || []).map((p) => ({ type: (p.type_service_local || '').toLowerCase(), communes: p.code_insee_commune || [] }));

  // Services compétents pour une commune, du plus pertinent au moins pertinent.
  function servicesCompetents(records, codeInsee, type) {
    const voulus = PIVOTS[type] || [type];
    const notes = (records || []).map((rec) => {
      const pv = pivots(rec);
      const p = pv.find((x) => voulus.includes(x.type));
      if (!p) return null;
      const competent = p.communes.includes(codeInsee);
      return { rec, note: (competent ? 2 : 0) + (voulus.indexOf(p.type) === 0 ? 1 : 0) };
    }).filter(Boolean);
    return notes.sort((a, b) => b.note - a.note).map((x) => x.rec);
  }

  // Adresse postale d'un service de l'annuaire : { nom, lignes: [..], email }
  function adresseService(rec) {
    const adrs = json(rec.adresse) || [];
    const a = adrs.find((x) => /postale/i.test(x.type_adresse || '')) || adrs[0] || {};
    const lignes = [maj(rec.nom)];
    [a.complement1, a.complement2, a.numero_voie, a.service_distribution].map(txt).filter(Boolean).forEach((l) => lignes.push(l));
    const ville = [txt(a.code_postal), maj(a.nom_commune)].filter(Boolean).join(' ');
    if (ville) lignes.push(ville);
    const mails = json(rec.adresse_courriel);
    const email = Array.isArray(mails) ? mails[0] || '' : txt(rec.adresse_courriel);
    return { nom: txt(rec.nom), lignes, email: typeof email === 'string' ? email : (email && email.valeur) || '' };
  }

  // Adresse du carnet la plus adaptée : même type, même nom (banque…), même département de préférence.
  // Départements couverts par une adresse du carnet (« 13, 84, 04 ») ; vide : tous.
  const departements = (c) => String((c && c.departement) || '').split(/[\s,;]+/).filter(Boolean);
  const couvre = (c, departement) => { const l = departements(c); return !l.length || l.includes(departement); };
  // Adresses du carnet pour un établissement : « LCL » → LCL (Nantes), LCL (Lyon)… (services régionaux).
  const cleNom = (s) => (s || '').replace(/\([^)]*\)/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function candidats(carnet, type, nom) {
    const n = cleNom(nom);
    return (carnet || []).filter((c) => c.type === type && (!n || cleNom(c.nom) === n || cleNom(c.nom).includes(n) || n.includes(cleNom(c.nom))));
  }
  function suggestion(carnet, type, nom, departement) {
    const cle = cleNom;
    const n = cle(nom);
    const liste = candidats(carnet, type, nom);
    if (!liste.length) return null;
    const score = (c) => (departements(c).includes(departement) ? 2 : !departements(c).length ? 1 : 0) + (cle(c.nom) === n ? 1 : 0);
    return liste.slice().sort((a, b) => score(b) - score(a))[0];
  }

  // Carnet de l'étude complété des adresses fournies avec l'outil (sauf celles que l'étude a supprimées).
  function carnetComplet(carnet, fournies, supprimees) {
    const l = (carnet || []).slice();
    (fournies || []).forEach((c) => {
      const i = l.findIndex((x) => x.id === c.id);
      // Adresse fournie mise à jour depuis : remplacée tant que l'étude ne l'a pas modifiée.
      if (i >= 0 && (c.anciennes || []).includes(l[i].lignes)) l[i] = Object.assign({}, c);
      else if (i >= 0 && l[i].lignes === c.lignes) {
        // Adresse inchangée : le nom et les coordonnées fournis depuis sont repris.
        l[i] = Object.assign({}, l[i], { nom: c.nom });
        ['email', 'telephone'].forEach((k) => { if (!l[i][k] && c[k]) l[i][k] = c[k]; });
      }
      else if (i < 0 && !(supprimees || []).includes(c.id)) l.push(Object.assign({}, c));
    });
    return l.map((c) => { const x = Object.assign({}, c); delete x.anciennes; return x; });
  }

  // Nom de fichier : « Courrier - LA BANQUE POSTALE - Déblocage des comptes - MARTIN.docx »
  function nomFichier(d, dest, modele, ext) {
    const propre = (s) => (s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    const qui = propre(dest.nom || (dest.lignes || '').split('\n')[0] || typeDe(dest.type).libelle).slice(0, 50);
    const quoi = propre(modele.titre.replace(/^[^—]*—\s*/, '')).slice(0, 60);
    return ['Courrier', qui, quoi, propre(maj(d.defunt && d.defunt.nom))].filter(Boolean).join(' - ') + '.' + ext;
  }

  return {
    TYPES, typeDe, MODELES, PAR_DEFAUT, modeles, modelesPour, REGIMES,
    variables, interpreter, rediger, blocSuccession, montantEnLettres,
    documentXml, docx, paquetMinimal, nettoyerPaquet, extrairePapier, paragraphes, importerPapier, ouvrirPaquet, base64, deBase64,
    PIVOTS, servicesCompetents, adresseService, suggestion, candidats, couvre, carnetComplet, nomFichier, designation,
  };
});
