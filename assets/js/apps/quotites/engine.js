/*
 * Quotités d'acquisition en indivision : part de chaque acquéreur, d'après son financement.
 *
 * Contribution d'un acquéreur = son apport personnel, net de sa part des frais de prêt
 *                               (l'apport déclaré comprend ces frais : garantie, dossier, courtage…)
 *                             + sa part du capital de chaque prêt.
 * Les frais de prêt n'entrent pas dans la valeur du bien. Quotité = contribution / total des contributions,
 * ce total devant correspondre au coût de l'acquisition (prix et frais d'acquisition).
 * Fonctions pures, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.quotites = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const somme = (l, f) => l.reduce((t, x) => t + f(x), 0);

  // Répartition d'un prêt entre les acquéreurs : parts saisies (en fraction), ou à parts égales.
  function parts(pret, acquereurs) {
    const r = pret.repartition || {};
    const saisies = acquereurs.map((a) => (typeof r[a.id] === 'number' && isFinite(r[a.id]) ? Math.max(0, r[a.id]) : null));
    if (saisies.every((x) => x === null) || pret.egal !== false) return acquereurs.map(() => 1 / acquereurs.length);
    const total = somme(saisies, (x) => x || 0);
    return saisies.map((x) => (total ? (x || 0) / total : 1 / acquereurs.length));
  }

  // Arrondi des quotités au centième de pourcent, le total faisant exactement 100 % (plus forts restes).
  function arrondir(fractions, pas) {
    const unite = pas || 10000;
    const brut = fractions.map((f) => f * unite);
    const bas = brut.map(Math.floor);
    let reste = unite - somme(bas, (x) => x);
    brut.map((x, i) => ({ i, r: x - bas[i] })).sort((a, b) => b.r - a.r).forEach((x) => { if (reste > 0) { bas[x.i]++; reste--; } });
    return bas.map((x) => x / unite);
  }

  function calculer(d) {
    const acquereurs = (d.acquereurs || []).filter(Boolean);
    const emplois = (d.emplois || []).filter((x) => n(x.montant));
    const prets = (d.prets || []).filter((x) => n(x.capital) || n(x.frais));
    const baseEmplois = somme(emplois, (x) => n(x.montant));
    const lignes = acquereurs.map((a) => ({
      id: a.id, nom: a.nom || '', apports: somme(a.apports || [], (x) => n(x.montant)), prets: 0, fraisPrets: 0, detailPrets: [],
    }));
    prets.forEach((p) => {
      const pp = parts(p, acquereurs);
      lignes.forEach((l, i) => {
        l.prets += n(p.capital) * pp[i];
        l.fraisPrets += n(p.frais) * pp[i];
        l.detailPrets.push({ id: p.id, part: pp[i], capital: n(p.capital) * pp[i], frais: n(p.frais) * pp[i] });
      });
    });
    // Convention : frais de prêt déduits de la contribution (par défaut), ou comptés dans le coût de l'acquisition.
    const fraisDansCout = !!d.fraisDansCout;
    lignes.forEach((l) => (l.contribution = l.apports + l.prets - (fraisDansCout ? 0 : l.fraisPrets)));
    const total = somme(lignes, (l) => l.contribution);
    const fr = lignes.map((l) => (total > 0 ? Math.max(0, l.contribution) / total : 0));
    const arr = total > 0 ? arrondir(fr) : fr;
    lignes.forEach((l, i) => { l.quotite = fr[i]; l.quotiteArrondie = arr[i]; });
    const ressources = somme(lignes, (l) => l.apports + l.prets);
    const fraisPrets = somme(prets, (p) => n(p.frais));
    const base = baseEmplois + (fraisDansCout ? fraisPrets : 0);
    return {
      lignes, base, baseEmplois, total, ressources, fraisPrets, fraisDansCout,
      // Écart entre le financement (net des frais de prêt) et le coût de l'acquisition.
      ecart: total - base,
      equilibre: Math.abs(total - base) < 0.5,
      negatif: lignes.some((l) => l.contribution < -0.005),
    };
  }

  // Quotité en toutes lettres pour l'acte : « 54,64 % » ou « 5 464 / 10 000èmes ».
  const pct = (f) => (Math.round(f * 10000) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0%';
  function clause(r, opts) {
    const o = opts || {};
    const euros = (x) => Math.round(x).toLocaleString('fr-FR') + '\u00a0€';
    const noms = r.lignes.map((l) => l.nom || 'l\'acquéreur');
    const partsTxt = r.lignes.map((l, i) => noms[i] + ' à concurrence de ' + pct(l.quotiteArrondie)).join(', ');
    const net = !r.fraisDansCout;
    const det = r.lignes.map((l, i) => {
      const apport = l.apports ? (net && l.fraisPrets
        ? euros(l.apports - l.fraisPrets) + ' de deniers personnels (apport de ' + euros(l.apports) + ' dont ' + euros(l.fraisPrets) + ' affectés aux frais de prêt)'
        : euros(l.apports) + ' de deniers personnels') : null;
      return '- ' + noms[i] + ' : ' + [apport, l.prets ? euros(l.prets) + ' au moyen du prêt' : null].filter(Boolean).join(' et ') + ', soit ' + euros(l.contribution) + '.';
    });
    return [
      'Les acquéreurs acquièrent le bien en indivision, ' + partsTxt + '.',
      'Ces quotités correspondent au financement de l\'acquisition, dont le coût total s\'élève à ' + euros(r.base) + (o.detailCout ? ' (' + o.detailCout + ')' : '') + ', financé ainsi :',
    ].concat(det);
  }

  /*
   * Clause de l'étude « Fixation de la proportion de propriété indivise », complétée avec le dossier.
   * Renvoie des blocs : { type: 'titre' | 'sous-titre' | 'p' | 'table', texte, lignes }.
   * enLettres(x) : montant en lettres et en chiffres (« CINQUANTE MILLE EUROS (50 000,00 EUR) »).
   */
  const CIVILITES = { M: 'Monsieur', Mme: 'Madame' };
  function clauseActe(d, r, enLettres) {
    const lettres = enLettres || ((x) => Math.round(x).toLocaleString('fr-FR') + ' EUROS');
    const euros = (x) => (Math.round(x * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUROS';
    const eur = (x) => Math.round(x).toLocaleString('fr-FR') + ' €';
    const acq = (d.acquereurs || []).filter(Boolean);
    const nomDe = (i) => {
      const a = acq[i] || {};
      return [CIVILITES[a.civilite] || '', (a.nom || 'XXXX').trim()].filter(Boolean).join(' ');
    };
    const emplois = (d.emplois || []).filter((x) => n(x.montant));
    const parCode = (code) => somme(emplois.filter((x) => x.code === code), (x) => n(x.montant));
    const prets = (d.prets || []).filter((x) => n(x.capital));
    const fraisPrets = somme(d.prets || [], (x) => n(x.frais));
    const fondsPerso = somme(r.lignes, (l) => l.apports);
    const fondsEmpr = somme(prets, (x) => n(x.capital));
    const cout = [
      ['Prix', parCode('prix')],
      ['Montant des travaux à effectuer', parCode('travaux')],
      ['Frais de la vente', parCode('fraisVente')],
      r.fraisDansCout ? ['Frais de prêt', fraisPrets] : null,
      ['Frais de négociation', parCode('fraisNegociation')],
      ['Provision syndic et taxe foncière', parCode('fraisSyndic')],
    ].filter(Boolean).concat(emplois.filter((x) => !x.code || x.code === 'autre').map((x) => [x.libelle || 'Autre', n(x.montant)]))
      .filter((x) => x[1] || ['Prix', 'Frais de la vente'].includes(x[0]));
    const totalCout = somme(cout, (x) => x[1]);
    const B = [];
    const t = (texte) => B.push({ type: 'titre', texte });
    const st = (texte) => B.push({ type: 'sous-titre', texte });
    const p = (texte) => B.push({ type: 'p', texte });
    const pct = (f) => (Math.round(f * 10000) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

    t('Fixation de la proportion de propriété indivise');
    st('Proportions entre les acquéreurs');
    p('Les ACQUEREURS font la présente acquisition dans les proportions indivises suivantes :');
    r.lignes.forEach((l, i) => p(pct(l.quotiteArrondie) + ' en pleine propriété pour ' + nomDe(i)));
    p('Ces quotités sont définitives et déterminent le droit de propriété de chacun des ACQUEREURS, elles concordent avec la répartition de l\'effort de financement entre eux tel que prévu ci-dessous.');

    st('Détermination de la contribution des acquéreurs au financement');
    p('Les ACQUEREURS détaillent leurs apports, leurs obligations aux charges vis-à-vis des créanciers et fixent leurs contributions respectives à celles-ci et ce afin d\'établir si nécessaire, lors de la liquidation, selon le cas, de leur régime matrimonial ou de l\'indivision, l\'existence de créances liées à un excès de contribution.');
    p('Ils déclarent que les quotités d\'acquisition ont été calculées en tenant compte du coût global de l\'opération et de la prise en charge de chacun quant à son financement, ainsi qu\'il est détaillé ci-après.');

    st('Coût et financement de l\'opération');
    p('Le coût et le financement de l\'opération sont les suivants :');
    B.push({ type: 'table', lignes: cout.map((x) => [x[0], euros(x[1])]).concat([['Ensemble', euros(totalCout)], ['', ''], ['FINANCEMENT', '']])
      .concat([['Fonds personnels', euros(fondsPerso)], fondsEmpr ? ['Fonds empruntés', euros(fondsEmpr)] : null].filter(Boolean)).concat([['', ''], ['Ensemble', euros(fondsPerso + fondsEmpr)]]), gras: ['Ensemble', 'FINANCEMENT'] });

    st('Prise en charge du financement de l\'opération');
    st('A - Fonds personnels');
    p('Le financement du prix et des frais au moyen de leur apport personnel est réalisé par chacun des ACQUEREURS à concurrence des sommes suivantes :');
    r.lignes.forEach((l, i) => { if (l.apports) p(nomDe(i) + ' apporte ' + lettres(l.apports) + ' provenant de fonds lui appartenant à titre personnel.'); });

    if (prets.length) {
      st('B - Fonds empruntés');
      prets.forEach((k, j) => {
        const auprès = (k.preteur || '').trim() || '……………';
        p((j === 0 ? 'A ce financement personnel s\'ajoute un financement extérieur' : 'S\'y ajoute un second financement extérieur') + ' à concurrence d\'une somme empruntée pour un montant de ' + lettres(n(k.capital)) + ' auprès de ' + auprès + '.');
      });
      p('Les ACQUEREURS sont, au titre de l\'obligation à la dette, solidaires de leur remboursement.');
      prets.forEach((k, j) => {
        const pp = parts(k, acq);
        p('La prise en charge ' + (prets.length > 1 ? 'des remboursements du prêt ' + ((k.libelle || '').trim() ? '« ' + k.libelle.trim() + ' » ' : 'n° ' + (j + 1) + ' ') : 'de ces remboursements ') + 'sera assurée par eux de la façon suivante :');
        acq.forEach((a, i) => p(nomDe(i) + ' à concurrence de ' + pct(pp[i])));
      });
      p('Cette convention est inopposable au créancier compte tenu de la solidarité rappelée ci-dessus.');
      p('S\'il est dérogé à cette convention de répartition, il en sera tenu compte au jour de la liquidation de cette indivision, sous réserve d\'en justifier à cette date.');
      p('L\'assurance décès-invalidité, dans la mesure où elle serait mise en œuvre, profitera en toute hypothèse à l\'indivision et ne sera pas constitutive d\'une créance.');
    }

    st('Récapitulatif de l\'effort respectif de financement');
    const entete = [''].concat(r.lignes.map((l, i) => nomDe(i)), ['Total']);
    const ligne = (lib, f, tot) => [lib].concat(r.lignes.map(f), [tot]);
    const totalContrib = somme(r.lignes, (l) => l.contribution);
    B.push({ type: 'table', entete, gras: ['Total', 'Soit en proportion du coût de l\'opération'], lignes: [
      ligne('Apport personnel', (l) => eur(r.fraisDansCout ? l.apports : l.apports - l.fraisPrets), eur(r.fraisDansCout ? fondsPerso : fondsPerso - r.fraisPrets)),
      prets.length ? ligne('Prêt', (l) => eur(l.prets), eur(fondsEmpr)) : null,
      ligne('Total', (l) => eur(l.contribution), eur(totalContrib)),
      ligne('Soit en proportion du coût de l\'opération', (l) => pct(l.quotiteArrondie), '100 %'),
    ].filter(Boolean) });

    st('C – Contribution à la dette – Modification');
    p('Dans le cas où ces modalités de contribution à la dette ne pourraient pas être respectées, les ACQUEREURS pourront en modifier les règles. Mais, dans ce cas, les obligations nées de ce chef resteront néanmoins à la charge définitive des ACQUEREURS en proportion de leurs droits dans l\'indivision.');
    p('Les ACQUEREURS entendent en outre écarter toute présomption de libéralité indirecte si la contribution effective de chacun d\'eux ne correspondait pas aux quotes-parts acquises. Cette différence constituera en toute hypothèse une créance entre époux ou entre indivisaires.');
    p('Cette créance entre époux ou entre indivisaires ne sera exigible que lors de la liquidation du régime matrimonial ou de l\'indivision, ou lors de la vente ou du partage du bien.');
    p('Elle ne pourra pas faire l\'objet d\'une compensation avec l\'obligation aux charges du mariage ou du ménage.');

    st('D - Prise en charge d\'un financement extérieur ultérieur');
    p('En cas de financement extérieur ultérieur pour des travaux, il est conseillé aux ACQUEREURS d\'établir également une convention de ce type afin de prévenir toute difficulté lors de la liquidation du régime matrimonial ou de l\'indivision. A défaut le financement sera présumé proportionnel aux quotités acquises.');

    st('E - Prise en charge d\'un financement personnel ultérieur');
    p('Si l\'un des ACQUEREURS améliore l\'état du bien indivis, ou si l\'indivision retire un profit des dépenses nécessaires à la conservation de l\'immeuble réalisées par l\'un des indivisaires seul, ou pour un montant supérieur à sa part dans l\'immeuble, il lui en sera tenu compte conformément aux dispositions de l\'article 815-13 du Code civil.');

    st('F - Industrie personnelle');
    p('Il est fait observer que l\'industrie personnelle des ACQUEREURS (leur travail) et celle de leurs ayants droit dans les travaux effectués, qu\'ils soient d\'entretien ou non, ne seront ni cause de créance ni cause d\'indemnité.');

    st('G - Répartition lors de la revente ou du partage');
    p('En cas de revente ou de partage du BIEN, et sauf accord contraire des parties à cette époque, il sera procédé de la manière suivante :');
    p('a) Si, à cette date, tous les prêts contractés pour le financement de l\'acquisition ont été remboursés, la proportion de propriété déterminée aux présentes sera celle utilisée pour la répartition du prix (ou de la valeur retenue en cas de partage) :');
    p('Toutes les charges afférentes au BIEN, telles que l\'impôt sur la plus-value, les impôts locaux et taxes exigibles ou à valoir, ainsi que les charges de toutes sortes exigibles ou estimées liées au BIEN et à son utilisation, en ce compris, le cas échéant, les frais attachés à la radiation des inscriptions, seront réparties en proportion des quotités d\'acquisition.');
    p('Sur la quote-part revenant à chacune des parties seront retenues les sommes dont elles sont redevables l\'une envers l\'autre.');
    p('b) Si, à cette date, tous les prêts contractés pour le financement de l\'acquisition n\'ont pas été intégralement remboursés, la proportion de propriété déterminée aux présentes sera celle utilisée pour la répartition du prix (ou de la valeur retenue en cas de partage) :');
    p('Sur la quote-part de prix ainsi définie sera imputé tout ce qui concernera le remboursement du solde du ou des prêts (capital, intérêts, indemnités, etc.) réparti conformément aux proportions fixées ci-dessus quant à la prise en charge de ces remboursements.');
    p('Toutes les autres charges afférentes au BIEN énumérées ci-dessus au a) seront réparties en proportion des quotités d\'acquisition.');
    p('Sur la quote-part revenant définitivement à chacune des parties seront retenues les sommes dont elles sont redevables l\'une envers l\'autre.');
    p('Ces conventions sont acceptées par chacun des ACQUEREURS indivisaires.');
    p('ETANT PRECISE que les conventions qui précèdent s\'appliqueront à défaut de dispositions contraires contenues dans le contrat de mariage ou le pacte civil de solidarité pouvant lier les ACQUEREURS.');
    return { blocs: B, totalCout, fondsPerso, fondsEmpr, equilibre: Math.abs(totalCout - (fondsPerso + fondsEmpr) + (r.fraisDansCout ? 0 : fraisPrets)) < 0.5 };
  }

  // Fonds à verser à l'étude par chaque acquéreur (appel de la somme globale) et reste à verser.
  // Dû = apport personnel (moins sa part des frais de prêt lorsqu'ils sont réglés directement à la banque)
  // + sa part du capital des prêts, à débloquer entre les mains de l'étude.
  function versements(d, r) {
    const fraisALaBanque = d.fraisPretsEtude !== true;
    const acq = d.acquereurs || [];
    const lignes = r.lignes.map((l, i) => {
      const liste = ((acq[i] || {}).versements || []).filter((v) => n(v.montant));
      const apport = l.apports - (fraisALaBanque ? l.fraisPrets : 0);
      const du = apport + l.prets;
      const verse = somme(liste, (v) => n(v.montant));
      return { id: l.id, nom: l.nom, apport, pret: l.prets, du, verse, reste: du - verse, versements: liste };
    });
    const besoin = r.baseEmplois + (fraisALaBanque ? 0 : r.fraisPrets);
    const du = somme(lignes, (l) => l.du);
    const verse = somme(lignes, (l) => l.verse);
    return {
      lignes, fraisALaBanque, besoin, du, verse, reste: du - verse,
      apport: somme(lignes, (l) => l.apport), pret: somme(lignes, (l) => l.pret),
      ecart: du - besoin, coherent: Math.abs(du - besoin) < 0.5,
    };
  }

  // Texte brut (copie) : tableaux en colonnes séparées par des tabulations.
  function clauseTexte(blocs) {
    return blocs.map((b) => (b.type === 'table' ? [b.entete].concat(b.lignes).filter(Boolean).map((l) => l.join('\t')).join('\n') : b.texte)).join('\n\n');
  }

  const EXEMPLE = {
    reference: '',
    acquereurs: [
      { id: 'a1', civilite: 'Mme', nom: 'Julie MARTIN', apports: [{ id: 'p1', libelle: 'Épargne', montant: 50000 }] },
      { id: 'a2', civilite: 'M', nom: 'Thomas DURAND', apports: [{ id: 'p2', libelle: 'Épargne', montant: 20000 }] },
    ],
    emplois: [
      { id: 'e1', code: 'prix', libelle: 'Prix', montant: 300000 },
      { id: 'e2', code: 'fraisVente', libelle: 'Frais de la vente', montant: 23000 },
    ],
    prets: [{ id: 'k1', libelle: 'Prêt immobilier', preteur: 'Banque Exemple', capital: 260000, frais: 7000, egal: true, repartition: {} }],
    fraisDansCout: true,
  };
  EXEMPLE.acquereurs[0].versements = [{ id: 'v1', date: '2026-09-15', libelle: 'Dépôt de garantie', montant: 15000 }];

  return { calculer, parts, arrondir, clause, clauseActe, clauseTexte, versements, pct, EXEMPLE };
});
