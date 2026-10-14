/*
 * Moteur de calcul — Succession / donation.
 *
 * Le patrimoine est saisi par branche : biens propres de chaque parent et biens communs (moitié chacun).
 * Les donations envisagées sont des lignes « qui donne, quel bien, quel montant, à quel enfant ».
 * Quatre hypothèses sont comparées, parent par parent puis cumulées :
 *   A : succession sans donation
 *   B : donation en pleine propriété aux enfants, puis succession résiduelle
 *   C : donation en nue-propriété aux enfants (usufruit réservé), puis succession résiduelle
 *   D : montage optimisé en nue-propriété : pour chaque branche, part des biens désignés donnée à
 *       l'enfant, don aux petits-enfants (même montant par branche, partagé entre eux) et part
 *       conservée pour la succession, choisis pour que le total des droits soit minimal.
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
    { code: 'D', libelle: 'Donation optimisée en nue-propriété aux enfants et petits-enfants', court: 'Montage optimisé' },
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
      const out = { transmis: 0, exo: 0, liquidites: 0, pp: 0, ppNL: 0, exoSucc: 0 };
      dons.filter((x) => x.g === g).forEach((x) => {
        const part = x.beneficiaire === 'tous' ? k.part : x.beneficiaire === k.id ? 1 : 0;
        if (!part) return;
        const facteur = nue && !x.bien.liquide ? P[g].nuePropriete : 1;
        const v = x.montant * part * facteur;
        out.transmis += v;
        out.exo += v * x.bien.exoDon;
        if (x.bien.liquide) out.liquidites += x.montant * part * (1 - x.bien.exoDon);
        out.pp += x.montant * part;
        if (!x.bien.liquide) out.ppNL += x.montant * part;
        out.exoSucc += x.montant * part * x.bien.exoSucc;
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
      const totalNL = sum(nl, (b) => b.valeurParent[g]);
      patrimoine[g] = {
        brut, exo, resteBrut, resteExo, donne: brut - resteBrut, resteNL,
        tauxExoDonNL: totalNL ? sum(nl, (b) => b.valeurParent[g] * b.exoDon) / totalNL : 0,
        tauxExoSuccNL: totalNL ? sum(nl, (b) => b.valeurParent[g] * b.exoSucc) / totalNL : 0,
      };
    });

    /*
     * Hypothèse D : montage optimisé, grand-parent par grand-parent.
     * Pour chaque branche (enfant k) :
     *   - t : part de la donation envisagée (C) réellement donnée à l'enfant, en nue-propriété ;
     *     le reste est conservé et sera transmis par succession (nouvel abattement après 15 ans) ;
     *   - y : valeur en nue-propriété donnée aux petits-enfants de la branche, identique pour toutes
     *     les branches (équité), partagée à égalité entre eux. Elle est prise sur ce que le grand-parent
     *     conserve pour cette branche (biens non liquides) et réduit d'autant la succession de l'enfant.
     * On retient les valeurs de t et y qui rendent le total des droits (donations + successions) minimal.
     */
    const branchesPE = enfants.filter((k) => peDeBranche(k.id).length);
    const deces = d.deces15ans ? 1 : 0;
    function brancheD(g, k, m, t, y) {
      const pat = patrimoine[g];
      const np = P[g].nuePropriete;
      const pe = peDeBranche(k.id);
      const yPP = pe.length && np > 0 ? y / np : 0;
      const donEnf = liquider(bareme, p.abattEnfant, t * m.transmis, t * m.exo, donFamilial(g, k, t * m.liquidites), k.rappel[g]);
      const donPE = pe.map((x) => liquider(bareme, p.abattPetitEnfant, pe.length ? y / pe.length : 0, (pe.length ? y / pe.length : 0) * pat.tauxExoDonNL, 0, x.rappel[g]));
      const brut = Math.max(0, k.part * pat.resteBrut + (1 - t) * m.pp - yPP);
      const exo = Math.max(0, Math.min(brut, k.part * pat.resteExo + (1 - t) * m.exoSucc - yPP * pat.tauxExoSuccNL));
      const succ = liquider(bareme, p.abattEnfant, brut, exo, 0, deces * (k.rappel[g] + donEnf.net));
      const droits = donEnf.droits + sum(donPE, (x) => x.droits) + succ.droits;
      return { donEnf, donPE, succ, droits, yPP };
    }
    // Plus grande part donnée à l'enfant compatible avec le don y aux petits-enfants.
    function tMax(g, k, m, y) {
      const np = P[g].nuePropriete;
      if (!peDeBranche(k.id).length || !(y > 0)) return 1;
      const manque = y / np - k.part * patrimoine[g].resteNL;
      if (manque <= 0) return 1;
      return m.ppNL > 0 ? Math.max(0, 1 - manque / m.ppNL) : 0;
    }
    // Minimum d'une fonction sur [a, b] : grille puis affinage (fonctions affines par morceaux).
    function minimiser(fn, a, b, n) {
      if (!(b > a)) return { x: a, v: fn(a) };
      let best = { x: a, v: fn(a) };
      const pas = (b - a) / n;
      for (let i = 1; i <= n; i++) {
        const x = i === n ? b : a + pas * i;
        const v = fn(x);
        if (v < best.v - 0.005) best = { x, v };
      }
      let lo = Math.max(a, best.x - pas), hi = Math.min(b, best.x + pas);
      for (let it = 0; it < 30; it++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (fn(m1) <= fn(m2)) hi = m2; else lo = m1;
      }
      const v = fn((lo + hi) / 2);
      if (v < best.v - 0.005) best = { x: (lo + hi) / 2, v };
      return best;
    }
    const montage = {};
    PARENTS.forEach((g) => {
      if (!P[g].actif) return (montage[g] = null);
      const np = P[g].nuePropriete;
      const mC = enfants.map((k) => masses(g, k, true));
      // Meilleure part donnée à chaque enfant pour un don y donné aux petits-enfants.
      const optT = (y) => enfants.map((k, i) => {
        const tm = tMax(g, k, mC[i], y);
        if (!(mC[i].pp > 0)) return { t: 0, v: brancheD(g, k, mC[i], 0, y).droits };
        const r = minimiser((t) => brancheD(g, k, mC[i], t, y).droits, 0, tm, 20);
        // Arrondi : montant donné en pleine propriété à 100 € près.
        let t = Math.min(tm, Math.round((r.x * mC[i].pp) / 100) * 100 / mC[i].pp);
        if ((tm - t) * mC[i].pp < 100) t = tm;
        return { t, v: brancheD(g, k, mC[i], t, y).droits };
      });
      const total = (y) => optT(y).reduce((a, x) => a + x.v, 0);
      const yMax = branchesPE.length && np > 0
        ? Math.min(...branchesPE.map((k) => (k.part * patrimoine[g].resteNL + mC[enfants.indexOf(k)].ppNL) * np)) : 0;
      let y = 0;
      if (yMax > 0) {
        y = Math.min(yMax, Math.round(minimiser(total, 0, yMax, 24).x / 100) * 100);
        if (y > yMax) y = Math.floor(yMax / 100) * 100;
        if (total(y) > total(0) - 0.5) y = 0;
      }
      const ts = optT(y);
      montage[g] = {
        y, yMax,
        branches: enfants.map((k, i) => {
          const r = brancheD(g, k, mC[i], ts[i].t, y);
          return {
            enfant: k.id, part: ts[i].t, prevuPP: mC[i].pp, donnePP: ts[i].t * mC[i].pp, donneNP: r.donEnf.transmis,
            petitsEnfants: peDeBranche(k.id).length, pePP: r.yPP, peNP: peDeBranche(k.id).length ? y : 0, successionPP: r.succ.transmis,
          };
        }),
      };
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
          if (code === 'D') {
            const mt = montage[g];
            enfants.forEach((k, i) => {
              const r = brancheD(g, k, masses(g, k, true), mt.branches[i].part, mt.y);
              donEnf[i] = r.donEnf;
              succ[i] = r.succ;
              const pe = peDeBranche(k.id);
              pe.forEach((x, j) => (donPE[petitsEnfants.indexOf(x)] = r.donPE[j]));
              if (pe.length) repartitionPE.push({ enfant: k.id, nombre: pe.length, montant: mt.y, parPetitEnfant: mt.y / pe.length });
            });
          } else {
            enfants.forEach((k, i) => {
              const m = code === 'A' ? { transmis: 0, exo: 0, liquidites: 0 } : masses(g, k, code !== 'B');
              if (code !== 'A') donEnf[i] = liquider(bareme, p.abattEnfant, m.transmis, m.exo, donFamilial(g, k, m.liquidites), k.rappel[g]);
            });
            // Succession : patrimoine entier (A) ou restant après donation ; la donation n'est rappelée
            // que si le décès survient dans le délai de rappel fiscal.
            enfants.forEach((k, i) => {
              const brut = code === 'A' ? pat.brut : pat.resteBrut;
              const exo = code === 'A' ? pat.exo : pat.resteExo;
              const rappel = code === 'A' ? k.rappel[g] : deces * (k.rappel[g] + donEnf[i].net);
              succ[i] = liquider(bareme, p.abattEnfant, k.part * brut, k.part * exo, 0, rappel);
            });
          }
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
      parents, enfants, petitsEnfants, biens, lignes, patrimoine, total, montage, limiteRappel: limiteRappel ? new Date(toTime(limiteRappel)).toISOString().slice(0, 10) : null,
      hypotheses, comparatif, meilleure, parNature, controles, alertes,
      patrimoineTotal: total,
    };
  }

  return { calculer, liquider, droitsBareme, usufruitParAge, partsBien, NATURE_LIQUIDITES, HYPOTHESES, PARENTS };
});
