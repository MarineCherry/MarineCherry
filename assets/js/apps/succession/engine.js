/*
 * Moteur de calcul — Succession / donation (comparatif des hypothèses A, B et C).
 * Reprend les formules de la feuille « Calculs » du classeur « Simulateur_Succession_Donation_V2 ».
 *   A : succession sans donation
 *   B : donation en pleine propriété, puis succession résiduelle
 *   C : donation en nue-propriété (usufruit réservé), puis succession résiduelle
 * Fonctions pures : aucune dépendance au navigateur, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.succession = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NATURE_LIQUIDITES = 'Liquidités';
  const BENEFICIAIRES = ['Enfants', 'Petits-enfants', 'Enfants et petits-enfants'];

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const n = (v) => (isNum(v) ? v : 0);
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  const toTime = (p) => Date.UTC(p.y, p.m - 1, p.d);
  function addMonths(p, months) {
    const total = p.y * 12 + (p.m - 1) + months;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { y: y, m: m, d: Math.min(p.d, last) };
  }

  function usufruitParAge(bareme, age) {
    let v = bareme.length ? bareme[0].usufruit : 0;
    for (const row of bareme) if (age >= row.age) v = row.usufruit;
    return v;
  }

  // Droits au barème progressif (art. 777 CGI) sur une base donnée.
  function droitsBareme(bareme, base) {
    let droits = 0;
    for (let i = 0; i < bareme.length; i++) {
      const ecart = bareme[i].taux - (i > 0 ? bareme[i - 1].taux : 0);
      if (base > bareme[i].de) droits += (base - bareme[i].de) * ecart;
    }
    return droits;
  }

  /*
   * Une ligne de liquidation pour un bénéficiaire (colonnes B à K de la feuille Calculs).
   *   transmis : total transmissible ; exo : exonérations ; donFamilial ; rappel : donations rappelées
   */
  function liquider(bareme, abattement, transmis, exo, donFamilial, rappel) {
    const net = transmis - exo - donFamilial;
    const abattementUtilise = Math.min(net, Math.max(0, abattement - rappel));
    const resteTaxable = net - abattementUtilise;
    const dejaTaxe = Math.max(0, rappel - abattement);
    const droits = droitsBareme(bareme, dejaTaxe + resteTaxable) - droitsBareme(bareme, dejaTaxe);
    return { transmis, exo, donFamilial, net, rappel, abattementUtilise, resteTaxable, dejaTaxe, droits };
  }

  function calculer(d, params) {
    const p = params;
    const nbParents = d.nbParents === 1 ? 1 : 2;
    const parents = [0, 1].map((i) => {
      const actif = i === 0 || nbParents === 2;
      const age = actif && isNum((d.parents[i] || {}).age) ? d.parents[i].age : 0;
      const usufruit = actif ? usufruitParAge(p.bareme669, age) : 0;
      return { index: i, nom: (d.parents[i] || {}).nom || '', actif, age, usufruit, nuePropriete: 1 - usufruit };
    });

    // Bénéficiaires : seules les personnes nommées sont prises en compte.
    const dateSim = parseDate(d.dateSimulation);
    const limiteRappel = dateSim ? addMonths(dateSim, -12 * p.delaiRappel) : null;
    function rappelDe(personne, parentIndex) {
      return sum(d.anterieures || [], (a) => {
        const date = parseDate(a.date);
        if (!date || !isNum(a.montant) || a.beneficiaire !== personne.id) return 0;
        if (a.donateur !== parentIndex + 1) return 0;
        return limiteRappel && toTime(date) > toTime(limiteRappel) ? a.montant : 0;
      });
    }
    function preparer(liste) {
      const presents = (liste || []).filter((x) => x.nom && x.nom.trim());
      const avecPart = presents.some((x) => isNum(x.part));
      return presents.map((x) => ({
        id: x.id, nom: x.nom, majeur: !!x.majeur,
        part: avecPart ? n(x.part) : 1 / presents.length,
        rappel: [rappelDe(x, 0), rappelDe(x, 1)],
      }));
    }
    const enfants = preparer(d.enfants);
    const petitsEnfants = preparer(d.petitsEnfants);
    const nbPE = petitsEnfants.length;

    // Biens : ventilation par parent et par hypothèse.
    const regimes = {};
    (p.regimes || []).forEach((r) => (regimes[r.nom] = r));
    const biens = (d.biens || []).map((b) => {
      const valeur = n(b.valeur);
      const liquidite = b.nature === NATURE_LIQUIDITES;
      const q1 = nbParents === 1 ? 1 : isNum(b.quotePartP1) ? b.quotePartP1 : 0.5;
      const q = [q1, 1 - q1];
      const regime = regimes[b.regime] || { succession: 0, donation: 0 };
      const exoSucc = n(regime.succession), exoDon = n(regime.donation);
      const fractionDonnee = b.aDonner && valeur > 0 ? (isNum(b.montantDonne) ? Math.min(1, b.montantDonne / valeur) : 1) : 0;
      let fractionPE = 0;
      if (fractionDonnee > 0 && nbPE > 0) {
        if (b.beneficiaire === 'Petits-enfants') fractionPE = 1;
        else if (b.beneficiaire === 'Enfants et petits-enfants') fractionPE = Math.min(1, n(b.montantPE) / (valeur * fractionDonnee));
      }
      const parParent = [0, 1].map((i) => {
        const np = liquidite ? 1 : parents[i].nuePropriete;
        const brut = valeur * q[i];
        const baseSucc = brut * (1 - exoSucc);
        const bEnfants = brut * fractionDonnee * (1 - fractionPE);
        const bPE = brut * fractionDonnee * fractionPE;
        return {
          brut, baseSucc, bEnfants, bPE,
          cEnfants: bEnfants * np, cPE: bPE * np,
          residuelBrut: brut * (1 - fractionDonnee), residuelBase: baseSucc * (1 - fractionDonnee),
        };
      });
      return { source: b, valeur, liquidite, exoSucc, exoDon, fractionDonnee, fractionPE, parParent };
    });

    // Totaux par parent (feuille Calculs, lignes 70 à 86).
    const totaux = [0, 1].map((i) => {
      const t = (f) => sum(biens, (b) => f(b.parParent[i], b));
      const donne = (key) => ({
        valeur: t((x) => x[key]),
        exo: t((x, b) => x[key] * b.exoDon),
        liquidites: t((x, b) => (b.liquidite ? x[key] * (1 - b.exoDon) : 0)),
      });
      const brut = t((x) => x.brut), base = t((x) => x.baseSucc);
      return {
        brut, exoSuccession: brut - base, base,
        bEnfants: donne('bEnfants'), cEnfants: donne('cEnfants'), bPE: donne('bPE'), cPE: donne('cPE'),
        residuelBrut: t((x) => x.residuelBrut), residuelBase: t((x) => x.residuelBase),
      };
    });

    const bareme = p.bareme777;
    const donFamilialActif = !!d.donFamilial;
    function donFamilial(i, personne, liquidites) {
      if (!donFamilialActif || !(parents[i].age < p.ageLimiteDonFamilial) || !personne.majeur) return 0;
      return Math.min(personne.part * liquidites, p.donFamilial);
    }

    // Tableaux de liquidation, indexés [parent][bénéficiaire].
    const A = [0, 1].map((i) => enfants.map((e) =>
      liquider(bareme, p.abattEnfant, e.part * totaux[i].brut, e.part * totaux[i].exoSuccession, 0, e.rappel[i])));

    function donation(cle, liste, abattement) {
      return [0, 1].map((i) => liste.map((x) => {
        const t = totaux[i][cle];
        return liquider(bareme, abattement, x.part * t.valeur, x.part * t.exo, donFamilial(i, x, t.liquidites), x.rappel[i]);
      }));
    }
    const B = { enfants: donation('bEnfants', enfants, p.abattEnfant), petitsEnfants: donation('bPE', petitsEnfants, p.abattPetitEnfant) };
    const C = { enfants: donation('cEnfants', enfants, p.abattEnfant), petitsEnfants: donation('cPE', petitsEnfants, p.abattPetitEnfant) };

    // Succession résiduelle : la donation n'est rappelée que si le décès survient dans le délai de rappel.
    const deces = d.deces15ans ? 1 : 0;
    function residuel(don) {
      return [0, 1].map((i) => enfants.map((e, k) => {
        const t = totaux[i];
        return liquider(bareme, p.abattEnfant, e.part * t.residuelBrut, e.part * (t.residuelBrut - t.residuelBase), 0,
          deces * (e.rappel[i] + don[i][k].net));
      }));
    }
    B.residuel = residuel(B.enfants);
    C.residuel = residuel(C.enfants);

    // Agrégation des deux parents pour un bénéficiaire.
    function cumul(table, k) {
      const a = table[0][k], b = table[1][k];
      return {
        transmis: a.transmis + b.transmis,
        abattement: a.abattementUtilise + b.abattementUtilise,
        exonerations: a.exo + a.donFamilial + b.exo + b.donFamilial,
        resteTaxable: a.resteTaxable + b.resteTaxable,
        droits: a.droits + b.droits,
      };
    }
    function parent(table, i, k) {
      const a = table[i][k];
      return { transmis: a.transmis, abattement: a.abattementUtilise, exonerations: a.exo + a.donFamilial, resteTaxable: a.resteTaxable, droits: a.droits };
    }
    const sumRows = (rows, keys) => {
      const s = {};
      keys.forEach((key) => (s[key] = sum(rows, (r) => r[key] || 0)));
      return s;
    };
    const COLS = ['transmis', 'abattement', 'exonerations', 'resteTaxable', 'droits'];

    // Présentation « Succession » (hypothèse A).
    function vueA(sel) {
      const lignes = enfants.map((e, k) => {
        const r = sel(A, k);
        return Object.assign({ nom: e.nom }, r, { tauxEffectif: r.transmis ? r.droits / r.transmis : 0, net: r.transmis - r.droits });
      });
      const total = sumRows(lignes, COLS.concat(['net']));
      total.tauxEffectif = total.transmis ? total.droits / total.transmis : 0;
      return { lignes, total };
    }
    const succession = {
      cumul: vueA((t, k) => cumul(t, k)),
      parents: [0, 1].map((i) => vueA((t, k) => parent(t, i, k))),
    };

    // Présentation « Donations » (hypothèses B et C).
    function vueDonation(H, refA, sel) {
      const lignes = enfants.map((e, k) => {
        const don = sel(H.enfants, k), res = sel(H.residuel, k);
        const total = don.droits + res.droits;
        return { nom: e.nom, donation: don, residuel: res, totalDroits: total, economie: refA.lignes[k].droits - total };
      });
      const pe = petitsEnfants.map((x, k) => Object.assign({ nom: x.nom }, sel(H.petitsEnfants, k)));
      const totEnf = {
        donation: sumRows(lignes.map((l) => l.donation), COLS),
        residuel: sumRows(lignes.map((l) => l.residuel), COLS),
        totalDroits: sum(lignes, (l) => l.totalDroits),
        economie: sum(lignes, (l) => l.economie),
      };
      const totPE = sumRows(pe, COLS);
      const donationTotale = sumRows([totEnf.donation, totPE], COLS);
      const totalDroits = donationTotale.droits + totEnf.residuel.droits;
      return {
        lignes, petitsEnfants: pe, totalEnfants: totEnf, totalPetitsEnfants: totPE,
        total: { donation: donationTotale, residuel: totEnf.residuel, totalDroits, economie: refA.total.droits - totalDroits },
      };
    }
    function vuesHypothese(H) {
      return {
        cumul: vueDonation(H, succession.cumul, (t, k) => cumul(t, k)),
        parents: [0, 1].map((i) => vueDonation(H, succession.parents[i], (t, k) => parent(t, i, k))),
      };
    }
    const hypB = vuesHypothese(B);
    const hypC = vuesHypothese(C);

    // Biens retenus dans la donation.
    const biensDonnes = biens.filter((b) => b.fractionDonnee > 0 && b.valeur > 0).map((b) => {
      const pp = sum(b.parParent, (x) => x.bEnfants + x.bPE);
      const np = sum(b.parParent, (x) => x.cEnfants + x.cPE);
      return {
        designation: b.source.designation || '', valeur: b.valeur,
        beneficiaire: b.source.beneficiaire || 'Enfants',
        pleinePropriete: pp, dontPetitsEnfants: sum(b.parParent, (x) => x.bPE),
        nuePropriete: np, usufruitConserve: pp - np,
      };
    });

    // Synthèse.
    const patrimoine = sum(biens, (b) => b.valeur);
    const comparatif = [
      { code: 'A', libelle: 'Aucune donation (succession)', donation: 0, succession: succession.cumul.total.droits },
      { code: 'B', libelle: 'Donation en pleine propriété', donation: hypB.cumul.total.donation.droits, succession: hypB.cumul.total.residuel.droits },
      { code: 'C', libelle: 'Donation en nue-propriété (usufruit réservé)', donation: hypC.cumul.total.donation.droits, succession: hypC.cumul.total.residuel.droits },
    ].map((h) => Object.assign(h, { total: h.donation + h.succession }));
    const refTotal = comparatif[0].total;
    comparatif.forEach((h) => {
      h.economie = refTotal - h.total;
      h.economiePct = refTotal ? h.economie / refTotal : 0;
      h.chargeFiscale = patrimoine ? h.total / patrimoine : 0;
    });
    // Meilleure hypothèse : la moins coûteuse ; A en cas d'égalité ou si aucune donation n'améliore la situation.
    let meilleure = comparatif[0];
    comparatif.slice(1).forEach((h) => { if (h.total < meilleure.total - 0.005) meilleure = h; });

    const parNature = {};
    (p.natures || []).forEach((nat) => (parNature[nat] = 0));
    biens.forEach((b) => {
      if (!b.valeur) return;
      const k = b.source.nature || 'Autre';
      parNature[k] = (parNature[k] || 0) + b.valeur;
    });

    // Contrôles de saisie (feuille Dossier).
    const sommeParts = (l) => sum(l, (x) => x.part);
    const controles = [
      { libelle: 'Au moins un enfant', ok: enfants.length > 0, message: 'aucun enfant saisi' },
      { libelle: 'Parts des enfants = 100 %', ok: enfants.length > 0 && Math.abs(sommeParts(enfants) - 1) < 0.0001, message: 'le total des parts est différent de 100 %' },
      { libelle: 'Âges des parents renseignés', ok: isNum((d.parents[0] || {}).age) && (nbParents === 1 || isNum((d.parents[1] || {}).age)), message: 'âge manquant' },
      { libelle: 'Patrimoine saisi', ok: patrimoine > 0, message: 'aucun bien saisi' },
      { libelle: 'Parts des petits-enfants = 100 %', ok: nbPE === 0 || Math.abs(sommeParts(petitsEnfants) - 1) < 0.0001, message: 'le total des parts est différent de 100 %' },
    ];
    const affectePE = (d.biens || []).some((b) => b.beneficiaire === 'Petits-enfants' || b.beneficiaire === 'Enfants et petits-enfants');
    const depasse = (d.biens || []).some((b) => n(b.montantPE) > n(b.valeur));
    controles.push({
      libelle: 'Affectations aux petits-enfants',
      ok: !(nbPE === 0 && affectePE) && !depasse,
      message: nbPE === 0 && affectePE ? 'petits-enfants non saisis' : 'montant aux petits-enfants supérieur à la valeur du bien',
    });

    return {
      parents, enfants, petitsEnfants, biens, totaux, limiteRappel: limiteRappel ? new Date(toTime(limiteRappel)).toISOString().slice(0, 10) : null,
      A, B, C, succession, hypB, hypC, biensDonnes, patrimoine, comparatif, meilleure, parNature, controles,
    };
  }

  return { calculer, liquider, droitsBareme, usufruitParAge, NATURE_LIQUIDITES, BENEFICIAIRES };
});
