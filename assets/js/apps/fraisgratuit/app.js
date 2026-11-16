/*
 * Application « Frais d'acquisition (bien reçu) » : part des droits de succession et des frais d'actes
 * imputable au bien vendu, pour le calcul de la plus-value (art. 150 VB CGI). Utilisable seule ; le
 * résultat peut être repris dans l'outil Plus-value (frais d'acquisition réels d'une origine « Gratuit »).
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid, fmtPct, todayISO } = A.util;
  const fmtEuro = (x) => A.util.fmtEuro(x, 2);
  const ui = A.ui;
  const E = A.engines.fraisGratuit;

  const app = {
    id: 'frais-gratuit',
    fileSuffix: 'frais-acquisition',
    title: 'Frais d\'acquisition (bien reçu)',
    caption: 'Droits et frais de succession imputables au bien vendu',
    icon: 'fraisGratuit',
    gradient: 'linear-gradient(150deg, #6b4a8a 0%, #a98bc9 100%)',
  };

  const nouvelHeritier = (o) => Object.assign({ id: uid('h'), nom: '', droits: null, partFrais: '', vendeur: true, recu: null, nature: '' }, o || {});
  const nouveauFrais = (o) => Object.assign({ id: uid('f'), libelle: '', libelleReleve: '', montant: null, retenu: true, manuel: true }, o || {});
  function empty() {
    return {
      reference: '', baseChoix: 'brut', actifBrut: null, actifNet: null, baseAutre: null,
      bien: { designation: '', valeur: null, residencePrincipale: false },
      immeubles: [], heritiers: [nouvelHeritier()], frais: [], dds: null, releve: null,
    };
  }
  const isEmpty = (s) => !s.reference && !s.actifBrut && !s.bien.valeur && !s.frais.length;
  const baseDe = (s) => (s.baseChoix === 'net' ? s.actifNet : s.baseChoix === 'autre' ? s.baseAutre : s.actifBrut);
  const donnees = (s) => ({ baseTotale: baseDe(s), bien: s.bien, heritiers: s.heritiers, frais: s.frais });
  const compute = (s) => E.calculer(donnees(s));
  const f = (label, control, opts) => ui.field(label, control, opts);
  const retirer = (ctx, liste, x) => ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { liste.splice(liste.indexOf(x), 1); ctx.render(); ctx.changed(); } });
  const pctTexte = (x) => A.util.fmtNum(Math.round(x * 10000) / 100, 2).replace(/,00$/, '') + ' %';

  /* ---------- Lecture des documents ---------- */
  async function lireDDS(ctx) {
    const fichier = await A.lecturePdf.choisirFichier();
    if (!fichier) return;
    ui.toast('Lecture de la déclaration de succession…');
    let lu;
    try { lu = E.lireDDS(await A.lecturePdf.pagesDuPdf(fichier)); } catch (e) { console.error(e); return ui.toast('Lecture du PDF impossible : ' + e.message, 'error'); }
    if (!lu.actifBrut && !lu.heritiers.length) return ui.toast('Ce PDF ne ressemble pas à une déclaration de succession (2705-SD).', 'error');
    const s = ctx.state;
    s.actifBrut = lu.actifBrut; s.actifNet = lu.actifNet;
    s.immeubles = lu.immeubles;
    if (lu.immeubles.length === 1 && !s.bien.valeur) Object.assign(s.bien, { designation: lu.immeubles[0].designation, valeur: lu.immeubles[0].valeurSuccession });
    // Part des frais de chaque héritier : sa part de la valeur transmise.
    const totalRecu = lu.heritiers.reduce((t, x) => t + (x.recu || 0), 0);
    s.heritiers = lu.heritiers.map((x) => nouvelHeritier({
      nom: x.nom, droits: x.droits, recu: x.recu, nature: x.nature,
      partFrais: totalRecu > 0 && x.recu ? pctTexte(x.recu / totalRecu) : '', vendeur: x.nature !== 'US',
    }));
    s.dds = { fichier: fichier.name, avertissements: lu.avertissements };
    ctx.render(); ctx.changed();
    ui.toast('Déclaration lue : actif, immeubles, héritiers et droits repris.');
  }
  async function lireReleve(ctx) {
    const fichier = await A.lecturePdf.choisirFichier();
    if (!fichier) return;
    let lu;
    try { lu = A.engines.quasi.lireReleve(await A.lecturePdf.pagesDuPdf(fichier)); } catch (e) { console.error(e); return ui.toast('Lecture du PDF impossible : ' + e.message, 'error'); }
    if (!lu.operations.length) return ui.toast(lu.avertissements[0] || 'Aucune opération trouvée.', 'error');
    const s = ctx.state;
    s.frais = s.frais.filter((x) => x.manuel).concat(E.fraisDuReleve(lu.operations).filter((x) => !x.droits).map((x) => nouveauFrais(Object.assign({}, x, { manuel: false }))));
    s.releve = { fichier: fichier.name, periode: lu.periode };
    if (!s.reference) s.reference = lu.intitule;
    ctx.render(); ctx.changed();
    ui.toast('Relevé lu : frais d\'actes repris (cochez ceux à retenir).');
  }

  /* ---------- Écran ---------- */
  function tabCalcul(ctx) {
    const s = ctx.state;
    const docs = ui.card('Documents du dossier', h('div', { class: 'stack-sm' },
      f('Dossier', ctx.text(s, 'reference', { placeholder: 'ex. Succession M. DUPONT — vente de la maison' })),
      h('div', { class: 'chips' },
        ui.button(s.dds ? 'Lire une autre déclaration' : 'Lire la déclaration de succession (PDF)', { icon: 'upload', variant: s.dds ? 'soft' : 'primary', small: true, onClick: () => lireDDS(ctx) }),
        ui.button(s.releve ? 'Lire un autre relevé' : 'Lire le relevé de compte (PDF)', { icon: 'upload', variant: 'soft', small: true, onClick: () => lireReleve(ctx) })),
      h('p', { class: 'small muted' }, [s.dds ? 'Déclaration : ' + s.dds.fichier : 'Déclaration : actif, immeubles, héritiers et droits payés.', s.releve ? 'Relevé : ' + s.releve.fichier : 'Relevé : frais d\'actes de la succession.'].join(' · ')),
      ...(s.dds ? s.dds.avertissements.map((a) => ui.note(a, 'warn')) : [])));

    const succession = ui.card('La succession et le bien vendu', h('div', { class: 'stack-sm' },
      h('div', { class: 'grid-2' },
        f('Actif brut de la succession', ctx.num(s, 'actifBrut', { suffix: '€' })),
        f('Actif net de la succession', ctx.num(s, 'actifNet', { suffix: '€' }))),
      f('Base du prorata', h('div', { class: 'stack-sm' },
        ctx.segmented(s, 'baseChoix', [{ value: 'brut', label: 'Actif brut' }, { value: 'net', label: 'Actif net' }, { value: 'autre', label: 'Autre' }], { small: true, structural: true }),
        s.baseChoix === 'autre' ? ctx.num(s, 'baseAutre', { suffix: '€' }) : null), { help: 'Valeur totale de la succession à laquelle on compare le bien vendu.' }),
      s.immeubles.length > 1 ? f('Bien vendu (repris de la déclaration)', ui.selectInput({
        value: '', ariaLabel: 'Immeuble',
        options: [{ value: '', label: '— Choisir l\'immeuble vendu —' }].concat(s.immeubles.map((x, i) => ({ value: String(i), label: x.designation + ' — ' + fmtEuro(x.valeurSuccession) + (x.communaute ? ' (moitié de ' + fmtEuro(x.valeurDeclaree) + ')' : '') }))),
        onChange: (v) => { const x = s.immeubles[+v]; if (x) { s.bien.designation = x.designation; s.bien.valeur = x.valeurSuccession; ctx.render(); ctx.changed(); } },
      })) : null,
      h('div', { class: 'grid-2' },
        f('Bien vendu', ctx.text(s.bien, 'designation', { placeholder: 'ex. Maison à ORANGE' })),
        f('Valeur du bien dans la succession', ctx.num(s.bien, 'valeur', { suffix: '€' }), { help: 'Bien commun : la moitié revenant à la succession.' })),
      f('Résidence principale du défunt (abattement de 20 %, art. 764 bis)', ctx.yesNo(s.bien, 'residencePrincipale', { small: true }),
        { help: 'Oui : la valeur retenue est diminuée de 20 %, pour la plus-value comme pour le prorata.' }),
      ctx.live((r) => h('p', { class: 'small' }, 'Quote-part du bien dans la succession : ', h('strong', null, r.base > 0 ? pctTexte(r.quotePart) : '—'),
        r.base > 0 ? ' (' + fmtEuro(r.valeurBien) + ' ÷ ' + fmtEuro(r.base) + ')' : ''))));

    const heritiers = ui.card('Les héritiers', h('div', { class: 'stack-sm' },
      h('div', { class: 'rows' }, s.heritiers.map((x) => h('div', { class: 'row-line fg-heritier' },
        f('Héritier', ctx.text(x, 'nom', { placeholder: 'ex. Madame Claire DURAND' }), { help: x.nature ? ({ PP: 'Pleine propriété', NP: 'Nue-propriété', US: 'Usufruit' })[x.nature] + (x.recu ? ' · reçu ' + fmtEuro(x.recu) : '') : null }),
        f('Droits de succession payés', ctx.num(x, 'droits', { suffix: '€' })),
        f('Part des frais supportée', ctx.text(x, 'partFrais', { placeholder: 'ex. 1/2' })),
        f('Vendeur', ctx.yesNo(x, 'vendeur', { small: true, structural: true })),
        s.heritiers.length > 1 ? retirer(ctx, s.heritiers, x) : h('span')))),
      ui.button('Ajouter un héritier', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.heritiers.push(nouvelHeritier()); ctx.render(); } })),
    { subtitle: 'Droits de succession : ceux payés par chacun (déclaration). Part des frais : par défaut, la part de la valeur transmise reçue par chacun.' });

    const frais = ui.card('Frais d\'actes de la succession', h('div', { class: 'stack-sm' },
      s.frais.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table-input fg-frais' },
        h('thead', null, h('tr', null, ['Retenu', 'Frais', 'Montant', ''].map((t) => h('th', null, t)))),
        h('tbody', null, s.frais.map((x) => h('tr', { class: x.retenu ? '' : 'qu-op-ignore' },
          h('td', null, ui.yesNo(x.retenu !== false, (v) => { x.retenu = v; ctx.render(); ctx.changed(); }, true)),
          h('td', null, x.manuel ? ctx.text(x, 'libelle', { placeholder: 'ex. frais de déclaration de succession' }) : h('div', { class: 'qu-lib' }, h('span', null, x.libelle), h('span', { class: 'small muted' }, x.libelleReleve))),
          h('td', { class: 'num' }, x.manuel ? ctx.num(x, 'montant', { suffix: '€' }) : fmtEuro(x.montant)),
          h('td', null, retirer(ctx, s.frais, x))))))) : h('p', { class: 'small muted' }, 'Lisez le relevé de compte du dossier, ou ajoutez les frais à la main.'),
      ui.button('Ajouter des frais', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.frais.push(nouveauFrais()); ctx.render(); } }),
      ctx.live((r) => h('p', { class: 'small' }, 'Frais retenus : ', h('strong', null, fmtEuro(r.fraisRetenus)), ' ; part du bien vendu : ', h('strong', null, fmtEuro(r.fraisBien))))),
    { subtitle: 'Frais d\'acte ou de déclaration de la mutation (notoriété, déclaration, attestation, publicité foncière…). Pas les frais de partage, ni les procurations ou la convention de quasi-usufruit (décochés par défaut).' });

    return h('div', { class: 'stack' }, docs, succession, heritiers, frais, resultat(ctx));
  }

  function resultat(ctx) {
    const s = ctx.state;
    return ctx.live((r) => {
      const vendeurs = r.heritiers.filter((x) => x.vendeur);
      // Résultat mis à disposition de l'outil Plus-value (sur ce poste).
      try {
        A.store.setPref('fraisGratuit', { reference: s.reference || '', bien: s.bien.designation || '', date: todayISO(), valeurBien: r.valeurBien,
          heritiers: vendeurs.map((x) => ({ nom: x.nom, total: x.total, droits: x.droitsImputables, frais: x.fraisImputables })) });
      } catch (e) { /* stockage indisponible */ }
      return ui.card('Frais d\'acquisition à retenir pour la plus-value', h('div', { class: 'stack-sm' },
        ...r.alertes.map((a) => ui.note(a, 'warn')),
        ui.table([
          { label: 'Vendeur', render: (x) => x.nom || '—' },
          { label: 'Droits payés', num: true, render: (x) => fmtEuro(x.droits) },
          { label: 'Droits imputables', num: true, render: (x) => fmtEuro(x.droitsImputables) },
          { label: 'Frais imputables', num: true, render: (x) => fmtEuro(x.fraisImputables) + (x.partFrais ? ' (' + pctTexte(x.partFrais) + ')' : '') },
          { label: 'Frais d\'acquisition', num: true, render: (x) => h('strong', null, fmtEuro(x.total)) },
        ], vendeurs, { compact: true, empty: 'Aucun héritier vendeur.' }),
        h('p', { class: 'small muted' }, 'Prix d\'acquisition (valeur retenue pour les droits) : ' + fmtEuro(r.valeurBien) + (s.bien.residencePrincipale ? ' (après l\'abattement de 20 %)' : '') + ' pour la totalité du bien, à répartir selon les droits de chacun. Pas de forfait de 7,5 % pour un bien reçu.'),
        h('p', { class: 'small' }, 'Ces montants sont proposés dans l\'outil Plus-value, sur une origine « Gratuit » : bouton « Reprendre » sous « Frais d\'acquisition réels ».'),
        h('div', { class: 'chips' }, ui.button('Ouvrir la plus-value', { icon: 'open', variant: 'soft', small: true, onClick: () => { location.hash = '#/plus-value'; } }))),
      { className: 'qu-resultat' });
    });
  }

  function aside(ctx) {
    return ui.card('En un coup d\'œil', ctx.live((r) => [
      h('ul', { class: 'aside-list' },
        h('li', null, h('span', null, 'Quote-part du bien'), h('strong', null, r.base > 0 ? pctTexte(r.quotePart) : '—')),
        h('li', null, h('span', null, 'Frais retenus'), h('strong', null, fmtEuro(r.fraisRetenus))),
        ...r.heritiers.filter((x) => x.vendeur).map((x) => h('li', null, h('span', null, x.nom || 'Vendeur'), h('strong', null, fmtEuro(x.total))))),
    ]), { className: 'aside-card' });
  }

  function print(ctx) {
    const s = ctx.state, r = ctx.result;
    ui.print(ui.printDoc({
      title: 'Frais d\'acquisition d\'un bien reçu par succession',
      subtitle: [s.reference, s.bien.designation].filter(Boolean).join(' — ') || null,
      meta: ['Art. 150 VB CGI : droits et frais à proportion de la valeur du bien cédé'],
      body: [
        h('h2', null, 'Prorata'),
        ui.table([{ label: '', key: 'l' }, { label: '', num: true, key: 'v' }], [
          { l: 'Valeur du bien dans la succession' + (s.bien.residencePrincipale ? ' (après abattement de 20 %)' : ''), v: fmtEuro(r.valeurBien) },
          { l: 'Valeur totale de la succession (' + ({ brut: 'actif brut', net: 'actif net', autre: 'base retenue' })[s.baseChoix] + ')', v: fmtEuro(r.base) },
          { l: 'Quote-part du bien', v: pctTexte(r.quotePart) },
        ], { compact: true }),
        h('h2', null, 'Frais d\'actes retenus'),
        ui.table([{ label: 'Frais', key: 'libelle' }, { label: 'Montant', num: true, render: (x) => fmtEuro(x.montant) }], s.frais.filter((x) => x.retenu !== false && x.montant), { compact: true, total: { libelle: 'Total', montant: r.fraisRetenus } }),
        h('h2', null, 'Par vendeur'),
        ui.table([
          { label: 'Vendeur', key: 'nom' },
          { label: 'Droits payés × quote-part', num: true, render: (x) => fmtEuro(x.droits) + ' × ' + pctTexte(r.quotePart) + ' = ' + fmtEuro(x.droitsImputables) },
          { label: 'Frais × quote-part × part', num: true, render: (x) => fmtEuro(x.fraisImputables) },
          { label: 'Frais d\'acquisition', num: true, render: (x) => fmtEuro(x.total) },
        ], r.heritiers.filter((x) => x.vendeur), { compact: true }),
      ],
      footer: 'Calcul établi d\'après la déclaration de succession et les frais justifiés ; à vérifier.',
    }), 'Frais d\'acquisition ' + (s.reference || ''));
  }

  function normalize(s) {
    s.bien = Object.assign({ designation: '', valeur: null, residencePrincipale: false }, s.bien || {});
    s.heritiers = (s.heritiers && s.heritiers.length ? s.heritiers : [nouvelHeritier()]).map((x) => nouvelHeritier(x));
    s.frais = (s.frais || []).map((x) => nouveauFrais(x));
    s.immeubles = s.immeubles || [];
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'commun', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.reference || s.bien.designation,
    tabs: [{ id: 'calcul', label: 'Calcul', render: tabCalcul }],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
