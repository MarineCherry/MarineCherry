/*
 * Moteur de calcul — Succession / donation.
 *
 * Le patrimoine est saisi par branche : biens propres de chaque parent et biens communs (moitié chacun).
 * Les donations envisagées sont des lignes « qui donne, quel bien, quel montant, à quel enfant ».
 * Quatre hypothèses sont comparées, parent par parent puis cumulées :
 *   A : succession sans donation
 *   B : donation en pleine propriété aux enfants, puis succession résiduelle
 *   C : donation en nue-propriété aux enfants (usufruit réservé), puis succession résiduelle
 *   D : comme C, et en plus chaque grand-parent donne à chaque branche un même montant en
 *       nue-propriété, partagé à égalité entre les petits-enfants de la branche (équité entre branches).
 *       Ce don est pris sur le patrimoine conservé (biens non liquides restant après la donation
 *       aux enfants) et réduit d'autant la succession résiduelle.
 * La liquidation (abattement, rappel fiscal, barème progressif) reprend celle du classeur Excel d'origine.
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
  const PARENTS = ['P1', 'P2'];
  const HYPOTHESES = [
    { code: 'A', libelle: 'Succession sans donation', court: 'Sans donation' },
    { code: 'B', libelle: 'Donation en pleine propriété aux enfants', court: 'Pleine propriété' },
    { code: 'C', libelle: 'Donation en nue-propriété aux enfants', court: 'Nue-propriété' },
    { code: 'D', libelle: 'Donation en nue-propriété aux enfants et petits-enfants', court: 'NP + petits-enfants' },
  ];

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

  // Droits au barème progressif (art. 777 CGI).
  function droitsBareme(bareme, base) {
    let droits = 0;
    for (let i = 0; i < bareme.length; i++) {
      const ecart = bareme[i].taux - (i > 0 ? bareme[i - 1].taux : 0);
      if (base > bareme[i].de) droits += (base - bareme[i].de) * ecart;
    }
    return droits;
  }

  // Liquidation pour un bénéficiaire (colonnes B à K de la feuille Calculs du classeur d'origine).
  function liquider(bareme, abattement, transmis, exo, donFamilial, rappel) {
    const net = transmis - exo - donFamilial;
    const abattementUtilise = Math.min(net, Math.max(0, abattement - rappel));
    const resteTaxable = net - abattementUtilise;
    const dejaTaxe = Math.max(0, rappel - abattement);
    const droits = droitsBareme(bareme, dejaTaxe + resteTaxable) - droitsBareme(bareme, dejaTaxe);
    return {
      transmis, exo, donFamilial, net, rappel, abattementUtilise, resteTaxable, dejaTaxe, droits,
      abattement: abattementUtilise, exonerations: exo + donFamilial,
    };
  }
  const VIDE = liquider([{ de: 0, taux: 0 }], 0, 0, 0, 0, 0);

  // Part de chaque parent dans un bien : propre (100 %) ou commun (50 %).
  function partsBien(b, nbParents) {
    if (nbParents === 1) return { P1: 1, P2: 0 };
    if (b.proprietaire === 'P2') return { P1: 0, P2: 1 };
    if (b.proprietaire === 'commun') return { P1: 0.5, P2: 0.5 };
    return { P1: 1, P2: 0 };
  }

  /*
   * Calcul complet. d : dossier ; p : paramètres (barèmes, abattements…).
   */
  function calculer(d, p) {
    const nbParents = d.nbParents === 1 ? 1 : 2;
    const actifs = PARENTS.slice(0, nbParents);
    const bareme = p.bareme777;

    const parents = PARENTS.map((g, i) => {
      const actif = i < nbParents;
      const src = (d.parents || [])[i] || {};
      const age = actif && isNum(src.age) ? src.age : 0;
      const usufruit = actif ? usufruitParAge(p.bareme669, age) : 0;
      return { code: g, index: i, nom: src.nom || '', actif, age, usufruit, nuePropriete: 1 - usufruit };
    });
    const P = { P1: parents[0], P2: parents[1] };

    // Bénéficiaires et rappel fiscal des donations antérieures (par donateur).
    const dateSim = parseDate(d.dateSimulation);
    const limiteRappel = dateSim ? addMonths(dateSim, -12 * p.delaiRappel) : null;
    function rappelDe(id, g) {
      return sum(d.anterieures || [], (a) => {
        const date = parseDate(a.date);
        if (!date || !isNum(a.montant) || a.beneficiaire !== id || a.donateur !== (g === 'P1' ? 1 : 2)) return 0;
        return limiteRappel && toTime(date) > toTime(limiteRappel) ? a.montant : 0;
      });
    }
    const presents = (l) => (l || []).filter((x) => x.nom && x.nom.trim());
    const enf = presents(d.enfants);
    const avecPart = enf.some((x) => isNum(x.part));
    const enfants = enf.map((x) => ({
      id: x.id, nom: x.nom, majeur: !!x.majeur,
      part: avecPart ? n(x.part) : 1 / enf.length,
      rappel: { P1: rappelDe(x.id, 'P1'), P2: rappelDe(x.id, 'P2') },
    }));
    const petitsEnfants = presents(d.petitsEnfants).map((x) => ({
      id: x.id, nom: x.nom, majeur: !!x.majeur, branche: enfants.some((e) => e.id === x.parent) ? x.parent : null,
      rappel: { P1: rappelDe(x.id, 'P1'), P2: rappelDe(x.id, 'P2') },
    }));
    const peDeBranche = (id) => petitsEnfants.filter((x) => x.branche === id);

    // Biens : parts par parent, exonérations, disponible pour donner.
    const regimes = {};
    (p.regimes || []).forEach((r) => (regimes[r.nom] = r));
    const biens = (d.biens || []).map((b) => {
      const valeur = n(b.valeur);
      const regime = regimes[b.regime] || { succession: 0, donation: 0 };
      const parts = partsBien(b, nbParents);
      return {
        source: b, id: b.id, valeur, liquide: b.nature === NATURE_LIQUIDITES,
        exoSucc: n(regime.succession), exoDon: n(regime.donation), parts,
        valeurParent: { P1: valeur * parts.P1, P2: valeur * parts.P2 },
        disponible: { P1: valeur * parts.P1, P2: valeur * parts.P2 },
        donne: { P1: 0, P2: 0 },
      };
    });
    const bienParId = {};
    biens.forEach((b) => (bienParId[b.id] = b));

    // Donations envisagées : chaque ligne est répartie entre ses donateurs, dans la limite de leur part du bien.
    const alertes = [];
    const dons = []; // { g, bien, montant, beneficiaire }
    const lignes = (d.donations || []).map((l, i) => {
      const b = bienParId[l.bienId];
      const res = { source: l, index: i, parDonateur: { P1: 0, P2: 0 }, total: 0, bien: b || null };
      if (!b) return res;
      const donateurs = l.donateur === 'deux' && nbParents === 2 ? ['P1', 'P2'] : [l.donateur === 'P2' && nbParents === 2 ? 'P2' : 'P1'];
      donateurs.forEach((g) => {
        let m = isNum(l.montant) ? l.montant / donateurs.length : b.disponible[g];
        if (m > b.disponible[g] + 0.005) {
          alertes.push('Donation n° ' + (i + 1) + ' : ' + (P[g].nom || (g === 'P1' ? 'Parent 1' : 'Parent 2')) + ' ne détient que '
            + Math.round(b.disponible[g]).toLocaleString('fr-FR') + ' € disponibles sur « ' + (b.source.designation || 'ce bien') + ' ».');
          m = b.disponible[g];
        }
        m = Math.max(0, m);
        b.disponible[g] -= m;
        b.donne[g] += m;
        res.parDonateur[g] = m;
        res.total += m;
        if (m > 0) dons.push({ g, bien: b, montant: m, beneficiaire: l.beneficiaire || 'tous' });
      });
      return res;
    });

    // Masses par donateur et par enfant (valeur en pleine propriété).
    function masses(g, k, nue) {
      const out = { transmis: 0, exo: 0, liquidites: 0 };
      dons.filter((x) => x.g === g).forEach((x) => {
        const part = x.beneficiaire === 'tous' ? k.part : x.beneficiaire === k.id ? 1 : 0;
        if (!part) return;
        const facteur = nue && !x.bien.liquide ? P[g].nuePropriete : 1;
        const v = x.montant * part * facteur;
        out.transmis += v;
        out.exo += v * x.bien.exoDon;
        if (x.bien.liquide) out.liquidites += x.montant * part * (1 - x.bien.exoDon);
      });
      return out;
    }
    const donFamilialActif = !!d.donFamilial;
    function donFamilial(g, personne, liquidites) {
      if (!donFamilialActif || !(P[g].age < p.ageLimiteDonFamilial) || !personne.majeur) return 0;
      return Math.min(liquidites, p.donFamilial);
    }

    // Patrimoine et succession (avant ou après donations) par parent.
    const patrimoine = {};
    PARENTS.forEach((g) => {
      const brut = sum(biens, (b) => b.valeurParent[g]);
      const exo = sum(biens, (b) => b.valeurParent[g] * b.exoSucc);
      const resteBrut = sum(biens, (b) => b.disponible[g]);
      const resteExo = sum(biens, (b) => b.disponible[g] * b.exoSucc);
      // Biens non liquides conservés : assiette du don aux petits-enfants (hypothèse D).
      const nl = biens.filter((b) => !b.liquide);
      const resteNL = sum(nl, (b) => b.disponible[g]);
      patrimoine[g] = {
        brut, exo, resteBrut, resteExo, donne: brut - resteBrut, resteNL,
        tauxExoDonNL: resteNL ? sum(nl, (b) => b.disponible[g] * b.exoDon) / resteNL : 0,
        tauxExoSuccNL: resteNL ? sum(nl, (b) => b.disponible[g] * b.exoSucc) / resteNL : 0,
      };
    });

    // Hypothèse D : montant en nue-propriété donné à chaque branche ayant des petits-enfants, en plus de
    // la donation aux enfants. Plafonné à ce que permet le patrimoine conservé (valeur en pleine propriété).
    const branchesPE = enfants.filter((k) => peDeBranche(k.id).length);
    const donsPE = {};
    const capacitePE = {};
    PARENTS.forEach((g) => {
      const np = P[g].nuePropriete;
      capacitePE[g] = P[g].actif && branchesPE.length && np > 0 ? (patrimoine[g].resteNL * np) / branchesPE.length : 0;
      const voulu = Math.max(0, n((d.donsPE || {})[g]));
      donsPE[g] = Math.min(voulu, capacitePE[g]);
      if (voulu > capacitePE[g] + 0.5 && P[g].actif && branchesPE.length) {
        alertes.push('Petits-enfants : ' + (P[g].nom || (g === 'P1' ? 'Parent 1' : 'Parent 2')) + ' ne peut donner que '
          + Math.round(capacitePE[g]).toLocaleString('fr-FR') + ' € en nue-propriété par branche avec les biens conservés.');
      }
    });

    function hypothese(code) {
      const par = {};
      PARENTS.forEach((g) => {
        const actif = P[g].actif;
        const pat = patrimoine[g];
        const donEnf = enfants.map(() => VIDE);
        const donPE = petitsEnfants.map(() => VIDE);
        const succ = enfants.map(() => VIDE);
        const repartitionPE = [];
        if (actif) {
          enfants.forEach((k, i) => {
            const m = code === 'A' ? { transmis: 0, exo: 0, liquidites: 0 } : masses(g, k, code !== 'B');
            if (code !== 'A') donEnf[i] = liquider(bareme, p.abattEnfant, m.transmis, m.exo, donFamilial(g, k, m.liquidites), k.rappel[g]);
          });
          // D : don en nue-propriété aux petits-enfants, en plus de la donation aux enfants.
          let prelevePP = 0;
          if (code === 'D') {
            const y = donsPE[g];
            branchesPE.forEach((k) => {
              const pe = peDeBranche(k.id);
              repartitionPE.push({ enfant: k.id, nombre: pe.length, montant: y, parPetitEnfant: y / pe.length });
              pe.forEach((x) => {
                const v = y / pe.length;
                donPE[petitsEnfants.indexOf(x)] = liquider(bareme, p.abattPetitEnfant, v, v * pat.tauxExoDonNL, 0, x.rappel[g]);
              });
            });
            prelevePP = P[g].nuePropriete > 0 ? (y * branchesPE.length) / P[g].nuePropriete : 0;
          }
          // Succession : patrimoine entier (A) ou restant après donation ; la donation n'est rappelée
          // que si le décès survient dans le délai de rappel fiscal.
          const deces = d.deces15ans ? 1 : 0;
          enfants.forEach((k, i) => {
            const brut = code === 'A' ? pat.brut : pat.resteBrut - prelevePP;
            const exo = code === 'A' ? pat.exo : pat.resteExo - prelevePP * pat.tauxExoSuccNL;
            const rappel = code === 'A' ? k.rappel[g] : deces * (k.rappel[g] + donEnf[i].net);
            succ[i] = liquider(bareme, p.abattEnfant, k.part * brut, k.part * exo, 0, rappel);
          });
        }
        const droitsDon = sum(donEnf, (x) => x.droits) + sum(donPE, (x) => x.droits);
        const droitsSucc = sum(succ, (x) => x.droits);
        par[g] = { actif, donEnf, donPE, succ, repartitionPE, droitsDonation: droitsDon, droitsSuccession: droitsSucc, total: droitsDon + droitsSucc };
      });
      return par;
    }

    const COLS = ['transmis', 'abattement', 'exonerations', 'resteTaxable', 'droits'];
    const addRows = (rows) => {
      const s = {};
      COLS.forEach((c) => (s[c] = sum(rows, (r) => r[c] || 0)));
      return s;
    };

    const brutes = {};
    HYPOTHESES.forEach((h) => (brutes[h.code] = hypothese(h.code)));

    // Mise en forme : par parent (branche) et cumul des deux parents.
    function vue(code) {
      const par = brutes[code];
      const ref = brutes.A;
      const vueParent = (gs) => {
        const lignesEnf = enfants.map((k, i) => {
          const donation = addRows(gs.map((g) => par[g].donEnf[i]));
          const succession = addRows(gs.map((g) => par[g].succ[i]));
          const totalDroits = donation.droits + succession.droits;
          const droitsA = sum(gs, (g) => ref[g].succ[i].droits);
          return { id: k.id, nom: k.nom, donation, succession, totalDroits, economie: droitsA - totalDroits, net: donation.transmis + succession.transmis - totalDroits };
        });
        const lignesPE = petitsEnfants.map((x, j) => Object.assign({ id: x.id, nom: x.nom, branche: x.branche }, addRows(gs.map((g) => par[g].donPE[j]))));
        const donation = addRows(lignesEnf.map((l) => l.donation).concat(lignesPE));
        const succession = addRows(lignesEnf.map((l) => l.succession));
        const totalDroits = donation.droits + succession.droits;
        const droitsA = sum(gs, (g) => ref[g].droitsSuccession);
        return {
          enfants: lignesEnf, petitsEnfants: lignesPE,
          total: { donation, succession, totalDroits, economie: droitsA - totalDroits },
          repartitionPE: gs.length === 1 ? par[gs[0]].repartitionPE : [],
        };
      };
      const h = HYPOTHESES.find((x) => x.code === code);
      return Object.assign({}, h, {
        parents: PARENTS.map((g) => (P[g].actif ? Object.assign(vueParent([g]), { parent: g }) : null)),
        cumul: vueParent(actifs),
      });
    }
    const hypotheses = {};
    HYPOTHESES.forEach((h) => (hypotheses[h.code] = vue(h.code)));

    const total = sum(biens, (b) => b.valeur);
    const comparatif = HYPOTHESES.map((h) => {
      const t = hypotheses[h.code].cumul.total;
      return { code: h.code, libelle: h.libelle, court: h.court, donation: t.donation.droits, succession: t.succession.droits, total: t.totalDroits };
    });
    const refTotal = comparatif[0].total;
    comparatif.forEach((c) => {
      c.economie = refTotal - c.total;
      c.economiePct = refTotal ? c.economie / refTotal : 0;
      c.chargeFiscale = total ? c.total / total : 0;
    });
    let meilleure = comparatif[0];
    comparatif.slice(1).forEach((c) => { if (c.total < meilleure.total - 0.005) meilleure = c; });

    const parNature = {};
    (p.natures || []).forEach((nat) => (parNature[nat] = 0));
    biens.forEach((b) => {
      if (!b.valeur) return;
      const k = b.source.nature || 'Autre';
      parNature[k] = (parNature[k] || 0) + b.valeur;
    });

    // Contrôles de saisie.
    const sommeParts = sum(enfants, (x) => x.part);
    const controles = [
      { libelle: 'Au moins un enfant', ok: enfants.length > 0, message: 'aucun enfant saisi' },
      { libelle: 'Parts des enfants = 100 %', ok: enfants.length > 0 && Math.abs(sommeParts - 1) < 0.0001, message: 'le total des parts est différent de 100 %' },
      { libelle: 'Âges des parents renseignés', ok: actifs.every((g, i) => isNum(((d.parents || [])[i] || {}).age)), message: 'âge manquant' },
      { libelle: 'Patrimoine saisi', ok: total > 0, message: 'aucun bien saisi' },
      { libelle: 'Donations envisagées', ok: dons.length > 0, message: 'aucune donation saisie : les hypothèses B, C et D sont identiques à A' },
      { libelle: 'Petits-enfants rattachés à un enfant', ok: petitsEnfants.every((x) => x.branche), message: 'un petit-enfant n\'est rattaché à aucun enfant (ignoré dans l\'hypothèse D)' },
      { libelle: 'Montants donnés', ok: alertes.length === 0, message: alertes.join(' ') },
    ];

    return {
      parents, enfants, petitsEnfants, biens, lignes, patrimoine, total, donsPE, capacitePE, limiteRappel: limiteRappel ? new Date(toTime(limiteRappel)).toISOString().slice(0, 10) : null,
      hypotheses, comparatif, meilleure, parNature, controles, alertes,
      patrimoineTotal: total,
    };
  }

  /*
   * Recherche, pour chaque grand-parent, du montant en nue-propriété par branche (en plus de la donation
   * aux enfants) qui minimise le total des droits de l'hypothèse D (donations + succession résiduelle).
   * Le total des droits est une fonction affine par morceaux du montant : on parcourt une grille fine,
   * puis on affine autour du meilleur point. Résultat arrondi à 100 €.
   */
  function optimiserPetitsEnfants(d, p) {
    const base = calculer(Object.assign({}, d, { donsPE: { P1: 0, P2: 0 } }), p);
    const res = {};
    PARENTS.forEach((g, i) => {
      const parent = base.parents[i];
      const hC = base.hypotheses.C.parents[i];
      if (!parent.actif || !hC) return (res[g] = null);
      const max = Math.floor(base.capacitePE[g] / 100) * 100;
      if (!(max > 0)) return (res[g] = { montant: 0, droits: hC.total.totalDroits, droitsC: hC.total.totalDroits, gain: 0, max: 0 });
      const cout = (y) => calculer(Object.assign({}, d, { donsPE: Object.assign({}, d.donsPE, { [g]: y }) }), p).hypotheses.D.parents[i].total.totalDroits;
      const pas = Math.max(100, max / 200);
      let best = 0, bestCout = cout(0);
      for (let y = pas; y <= max + pas / 2; y += pas) {
        const v = cout(Math.min(y, max));
        if (v < bestCout - 0.5) { best = Math.min(y, max); bestCout = v; }
      }
      // Affinage par pas de 100 € autour du meilleur point de la grille.
      for (let y = Math.max(0, best - pas); y <= Math.min(max, best + pas); y += 100) {
        const v = cout(y);
        if (v < bestCout - 0.5) { best = y; bestCout = v; }
      }
      best = Math.round(best / 100) * 100;
      bestCout = cout(best);
      res[g] = { montant: best, droits: bestCout, droitsC: hC.total.totalDroits, gain: hC.total.totalDroits - bestCout, max };
    });
    return res;
  }

  return { calculer, optimiserPetitsEnfants, liquider, droitsBareme, usufruitParAge, partsBien, NATURE_LIQUIDITES, HYPOTHESES, PARENTS };
});
