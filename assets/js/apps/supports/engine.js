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

  return { masses, divorce, deces, EXEMPLE };
});
