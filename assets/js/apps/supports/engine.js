/*
 * Supports visuels pour les rendez-vous : calculs de la présentation « Communauté légale ou séparation
 * de biens ». Masses de biens de chaque époux, partage en cas de divorce et en cas de décès.
 * Fonctions pures, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.supports = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const n = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(0, v) : 0);
  const part = (v) => Math.min(1, Math.max(0, typeof v === 'number' && isFinite(v) ? v : 0.5));
  const autre = (x) => (x === 'a' ? 'b' : 'a');

  /*
   * Exemple du couple :
   * { a: { prenom, avant, heritage }, b: { … }, acquis: [{ libelle, valeur, partA }], enfants, decede: 'a' | 'b' }
   *   avant    : biens possédés avant le mariage
   *   heritage : biens reçus par donation ou succession pendant le mariage
   *   acquis   : biens achetés pendant le mariage ; partA = part financée par les revenus de l'époux A
   */
  function masses(d) {
    const acquis = (d.acquis || []).filter((x) => n(x.valeur) > 0);
    const totalAcquis = acquis.reduce((t, x) => t + n(x.valeur), 0);
    const finA = acquis.reduce((t, x) => t + n(x.valeur) * part(x.partA), 0);
    const propre = (k) => ({ avant: n(d[k] && d[k].avant), heritage: n(d[k] && d[k].heritage) });
    const pa = propre('a'), pb = propre('b');
    return {
      // Communauté légale : ce qui existait avant le mariage et ce qui est reçu par donation ou succession reste propre ;
      // ce qui est acquis pendant le mariage est commun, quel que soit l'époux qui l'a payé.
      communaute: {
        a: { avant: pa.avant, heritage: pa.heritage, total: pa.avant + pa.heritage },
        b: { avant: pb.avant, heritage: pb.heritage, total: pb.avant + pb.heritage },
        commun: totalAcquis,
      },
      // Séparation de biens : chacun est propriétaire de ce qu'il paie ; un bien acheté à deux est indivis,
      // dans la proportion du financement.
      separation: {
        a: { avant: pa.avant, heritage: pa.heritage, acquis: finA, total: pa.avant + pa.heritage + finA },
        b: { avant: pb.avant, heritage: pb.heritage, acquis: totalAcquis - finA, total: pb.avant + pb.heritage + totalAcquis - finA },
        commun: 0,
      },
      totalAcquis,
      total: pa.avant + pa.heritage + pb.avant + pb.heritage + totalAcquis,
    };
  }

  // Divorce : chacun reprend ses biens personnels ; la communauté est partagée par moitié.
  function divorce(d) {
    const m = masses(d);
    const c = m.communaute, s = m.separation;
    return {
      communaute: {
        a: { propres: c.a.total, commun: c.commun / 2, total: c.a.total + c.commun / 2 },
        b: { propres: c.b.total, commun: c.commun / 2, total: c.b.total + c.commun / 2 },
      },
      separation: {
        a: { propres: s.a.total, commun: 0, total: s.a.total },
        b: { propres: s.b.total, commun: 0, total: s.b.total },
      },
    };
  }

  /*
   * Décès d'un époux, sans donation entre époux ni testament : le conjoint survivant garde ses biens
   * (et sa moitié de communauté) puis hérite. Avec des enfants communs : ¼ en pleine propriété
   * (ou l'usufruit de la totalité, art. 757 C. civ.) ; sans enfant, en l'absence de père et mère : la totalité.
   */
  function deces(d) {
    const m = masses(d);
    const mort = d.decede === 'b' ? 'b' : 'a', vivant = autre(mort);
    const fraction = n(d.enfants) > 0 ? 0.25 : 1;
    const calc = (r) => {
      const moitie = r.commun / 2;
      const succession = r[mort].total + moitie;
      const herite = succession * fraction;
      return {
        garde: r[vivant].total + moitie, dontPropres: r[vivant].total, dontCommun: moitie,
        succession, herite, enfants: succession - herite,
        total: r[vivant].total + moitie + herite,
      };
    };
    return { mort, vivant, fraction, communaute: calc(m.communaute), separation: calc(m.separation) };
  }

  /*
   * Famille recomposée : succession du défunt (sans les biens du conjoint), enfants communs et enfants
   * d'une autre union. Sans testament, le conjoint reçoit ¼ en pleine propriété (seule option dès qu'un enfant
   * n'est pas commun, art. 757 C. civ.) ; ce quart passera ensuite aux héritiers du conjoint (ses propres enfants),
   * jamais aux enfants de l'autre union. Avec un testament ou une donation entre époux en usufruit, le conjoint
   * profite de tout sa vie durant et les enfants reçoivent la nue-propriété à parts égales, puis la pleine
   * propriété au décès du conjoint.
   */
  function recompose(d) {
    const s = n(d.succession);
    const communs = (d.communs || []).filter((x) => (x || '').trim()), autres = (d.autres || []).filter((x) => (x || '').trim());
    const nb = communs.length + autres.length;
    const partEnfant = nb ? (0.75 * s) / nb : 0;
    const quart = nb ? s / 4 : s;
    // Le quart du conjoint revient ensuite à ses enfants (les enfants communs) ; à défaut, à sa propre famille.
    const retour = communs.length ? quart / communs.length : 0;
    const enfants = communs.map((nom) => ({ nom, commun: true, sans: partEnfant, plusTard: retour, totalSans: partEnfant + retour, avec: nb ? s / nb : 0 }))
      .concat(autres.map((nom) => ({ nom, commun: false, sans: partEnfant, plusTard: 0, totalSans: partEnfant, avec: nb ? s / nb : 0 })));
    return {
      succession: s, nbEnfants: nb, communs: communs.length, autres: autres.length,
      optionUsufruitLegale: nb > 0 && autres.length === 0,
      sans: { conjoint: quart, versFamilleConjoint: communs.length ? 0 : quart },
      avec: { usufruit: s },
      enfants,
    };
  }

  const EXEMPLE_RECOMPOSE = { defunt: 'Paul', conjoint: 'Julie', communs: ['Emma'], autres: ['Léo'], succession: 400000 };

  /* ---------- Barèmes communs ---------- */
  function valeurUsufruit(bareme669, age) {
    let v = bareme669.length ? bareme669[0].usufruit : 0;
    for (const row of bareme669) if (age >= row.age) v = row.usufruit;
    return v;
  }
  function droits(bareme, base) {
    let t = 0;
    for (let i = 0; i < bareme.length; i++) {
      const ecart = bareme[i].taux - (i > 0 ? bareme[i - 1].taux : 0);
      if (base > bareme[i].de) t += (base - bareme[i].de) * ecart;
    }
    return Math.max(0, t);
  }
  const ent = (v, min) => Math.max(min || 0, Math.round(n(v)));

  /*
   * Démembrement : donation de la nue-propriété d'un bien aux enfants, comparée à la donation en pleine propriété.
   * Le bien appartient aux donateurs à parts égales ; chaque donateur donne sa part, chaque enfant reçoit autant.
   */
  function demembrement(d, p) {
    const valeur = n(d.valeur), enfants = ent(d.enfants, 1), donateurs = ent(d.donateurs, 1);
    const us = valeurUsufruit(p.bareme669, n(d.age)), np = 1 - us;
    const calc = (fraction) => {
      const parDonateurParEnfant = (valeur * fraction) / donateurs / enfants;
      const taxable = Math.max(0, parDonateurParEnfant - p.abattEnfant);
      const droitsParEnfant = droits(p.bareme777, taxable) * donateurs;
      return { recuParEnfant: parDonateurParEnfant * donateurs, abattementParEnfant: p.abattEnfant * donateurs, taxableParEnfant: taxable * donateurs, droitsParEnfant, total: droitsParEnfant * enfants };
    };
    const pp = calc(1), npc = calc(np);
    return { valeur, us, np, valeurUsufruit: valeur * us, valeurNuePropriete: valeur * np, enfants, donateurs, pp, nuePropriete: npc, economie: pp.total - npc.total };
  }

  /*
   * Abattements renouvelables tous les 15 ans : ce qui peut être donné sans droits à chaque « rechargement ».
   * Le don familial de sommes d'argent (art. 790 G) suppose un donateur de moins de 80 ans.
   */
  function abattements(d, p) {
    const donateurs = ent(d.donateurs, 1), enfants = ent(d.enfants), petits = ent(d.petitsEnfants);
    const age = n(d.age), annee = ent(d.annee) || new Date().getFullYear(), ageMax = n(d.ageMax) || 90;
    const cycles = [];
    for (let k = 0; age + 15 * k <= ageMax && k < 6; k++) {
      const a = age + 15 * k;
      const argent = a < p.ageLimiteDonFamilial;
      const c = {
        annee: annee + 15 * k, age: a,
        enfants: donateurs * enfants * p.abattEnfant,
        petitsEnfants: donateurs * petits * p.abattPetitEnfant,
        donFamilial: argent ? donateurs * enfants * p.donFamilial : 0,
      };
      c.total = c.enfants + c.petitsEnfants + c.donFamilial;
      cycles.push(c);
    }
    return { cycles, total: cycles.reduce((t, c) => t + c.total, 0), parCycle: cycles.length ? cycles[0].total : 0 };
  }

  /* Réserve héréditaire et quotité disponible (art. 913 et 914-1 C. civ.). */
  function reserve(d) {
    const masse = n(d.masse), enfants = ent(d.enfants);
    let qd, reservataires;
    if (enfants >= 3) qd = 0.25;
    else if (enfants === 2) qd = 1 / 3;
    else if (enfants === 1) qd = 0.5;
    else qd = d.conjoint ? 0.75 : 1;
    if (enfants) reservataires = 'enfants';
    else reservataires = d.conjoint ? 'conjoint' : null;
    const res = 1 - qd;
    return { masse, enfants, qd, reserve: res, valeurQd: masse * qd, valeurReserve: masse * res, parEnfant: enfants ? (masse * res) / enfants : 0, reservataires };
  }

  /* Mariage, pacs, concubinage : droits de succession sur ce que l'on transmet à son partenaire. */
  function couple(d, p) {
    const m = n(d.montant);
    const concubin = droits([{ de: 0, taux: p.tauxTiers }], Math.max(0, m - p.abattTiers));
    return {
      montant: m,
      mariage: { droits: 0, recu: m },
      pacs: { droits: 0, recu: m },
      concubinage: { droits: concubin, recu: m - concubin },
    };
  }

  /*
   * Donation entre époux (enfants communs) : valeur de ce que reçoit le conjoint selon l'option,
   * l'usufruit étant évalué selon son âge (art. 669 CGI).
   */
  function donationEpoux(d, p) {
    const s = n(d.succession), enfants = ent(d.enfants, 1);
    const us = valeurUsufruit(p.bareme669, n(d.age));
    const qd = enfants >= 3 ? 0.25 : enfants === 2 ? 1 / 3 : 0.5;
    const opt = (code, libelle, pp, usBase, ddv) => ({ code, libelle, ddv, pp: pp * s, usufruitSur: usBase * s, valeur: pp * s + usBase * s * us, enfants: s - pp * s - usBase * s * us });
    return {
      succession: s, enfants, us, qd,
      options: [
        opt('legal-pp', '¼ en pleine propriété', 0.25, 0, false),
        opt('legal-us', 'Usufruit de tout', 0, 1, false),
        opt('ddv-qd', 'Quotité disponible en pleine propriété', qd, 0, true),
        opt('ddv-mixte', '¼ en pleine propriété et ¾ en usufruit', 0.25, 0.75, true),
        opt('ddv-us', 'Usufruit de tout', 0, 1, true),
      ],
    };
  }

  /*
   * Frais d'acquisition d'un bien ancien : droits de mutation (département, commune, frais d'assiette de l'État),
   * émoluments du notaire (barème proportionnel) et TVA, contribution de sécurité immobilière, débours et formalités.
   */
  function frais(d) {
    const prix = n(d.prix), mobilier = Math.min(n(d.mobilier), prix);
    const assiette = prix - mobilier;
    const departement = assiette * n(d.tauxDepartement);
    const commune = assiette * n(d.tauxCommune);
    const assietteEtat = departement * n(d.fraisAssiette);
    let emoluments = 0, bas = 0;
    (d.tranches || []).forEach((t) => {
      const haut = t.jusqua === null || t.jusqua === undefined ? Infinity : t.jusqua;
      if (assiette > bas) emoluments += (Math.min(assiette, haut) - bas) * n(t.taux);
      bas = haut;
    });
    const tva = (emoluments + n(d.formalitesHT)) * n(d.tva);
    const csi = Math.max(15, assiette * n(d.tauxCsi));
    const postes = [
      { code: 'departement', libelle: 'Le département', valeur: departement },
      { code: 'commune', libelle: 'La commune', valeur: commune },
      { code: 'etat', libelle: 'L\'État (TVA, frais d\'assiette, sécurité immobilière)', valeur: tva + assietteEtat + csi },
      { code: 'notaire', libelle: 'Le notaire (sa rémunération)', valeur: emoluments + n(d.formalitesHT) },
      { code: 'debours', libelle: 'Débours (documents, cadastre, géomètre…)', valeur: n(d.debours) },
    ];
    const total = postes.reduce((t, x) => t + x.valeur, 0);
    return { prix, assiette, departement, commune, assietteEtat, emoluments, tva, csi, postes, total, pourcentage: prix ? total / prix : 0, notaire: emoluments + n(d.formalitesHT) };
  }

  const PARAMS_DEFAUT = {
    abattEnfant: 100000, abattPetitEnfant: 31865, donFamilial: 31865, ageLimiteDonFamilial: 80,
    tauxTiers: 0.6, abattTiers: 1594,
    bareme777: [{ de: 0, taux: 0.05 }, { de: 8072, taux: 0.1 }, { de: 12109, taux: 0.15 }, { de: 15932, taux: 0.2 }, { de: 552324, taux: 0.3 }, { de: 902838, taux: 0.4 }, { de: 1805677, taux: 0.45 }],
    bareme669: [{ age: 0, usufruit: 0.9 }, { age: 21, usufruit: 0.8 }, { age: 31, usufruit: 0.7 }, { age: 41, usufruit: 0.6 }, { age: 51, usufruit: 0.5 }, { age: 61, usufruit: 0.4 }, { age: 71, usufruit: 0.3 }, { age: 81, usufruit: 0.2 }, { age: 91, usufruit: 0.1 }],
  };

  const EXEMPLES = {
    demembrement: { bien: 'Maison familiale', valeur: 500000, age: 65, enfants: 2, donateurs: 2 },
    abattements: { donateurs: 2, enfants: 2, petitsEnfants: 3, age: 60, ageMax: 90 },
    reserve: { masse: 600000, enfants: 2, conjoint: true },
    couple: { montant: 200000, prenomA: 'Sophie', prenomB: 'Marc' },
    donationEpoux: { succession: 400000, enfants: 2, age: 72, conjoint: 'Hélène', defunt: 'Bernard' },
    frais: {
      prix: 250000, mobilier: 0, tauxDepartement: 0.05, tauxCommune: 0.012, fraisAssiette: 0.0237,
      tranches: [{ jusqua: 6500, taux: 0.0387 }, { jusqua: 17000, taux: 0.01596 }, { jusqua: 60000, taux: 0.01064 }, { jusqua: null, taux: 0.00799 }],
      tva: 0.2, tauxCsi: 0.001, formalitesHT: 800, debours: 400,
    },
  };

  const EXEMPLE = {
    a: { prenom: 'Camille', avant: 60000, heritage: 0 },
    b: { prenom: 'Alex', avant: 15000, heritage: 80000 },
    acquis: [
      { libelle: 'Résidence principale', valeur: 320000, partA: 0.75 },
      { libelle: 'Épargne', valeur: 40000, partA: 0.75 },
    ],
    enfants: 2,
    decede: 'a',
  };

  return { masses, divorce, deces, recompose, valeurUsufruit, droits, demembrement, abattements, reserve, couple, donationEpoux, frais, PARAMS_DEFAUT, EXEMPLES, EXEMPLE, EXEMPLE_RECOMPOSE };
});
