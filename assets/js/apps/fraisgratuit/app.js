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
  const nouvellePartie = (o) => Object.assign({ id: uid('i'), designation: '', cadastre: '', valeur: null, residencePrincipale: false,
    division: 'aucune', valeurPartie: null, surfaceTotale: null, surfaceVendue: null, cadastreVendu: '', quoteVendue: '' }, o || {});
  const nouveauBien = () => ({ designation: '', parties: [nouvellePartie()] });
  // Reprend un immeuble de la déclaration (désignation, cadastre, valeur, contenance hors copropriété).
  const prendreImmeuble = (partie, x) => Object.assign(partie, { designation: x.designation, cadastre: x.cadastre || '', valeur: x.valeurSuccession,
    surfaceTotale: x.surface && !x.copropriete ? x.surface : partie.surfaceTotale });
  function empty() {
    return {
      reference: '', droitsTotal: null, baseChoix: 'brut', actifBrut: null, actifNet: null, baseAutre: null,
      bien: nouveauBien(),
      immeubles: [], heritiers: [nouvelHeritier()], frais: [], dds: null, releve: null,
    };
  }
  const isEmpty = (s) => !s.reference && !s.actifBrut && !s.bien.parties.some((x) => x.valeur) && !s.frais.length;
  const baseDe = (s) => (s.baseChoix === 'net' ? s.actifNet : s.baseChoix === 'autre' ? s.baseAutre : s.actifBrut);
  const donnees = (s) => ({ baseTotale: baseDe(s), droitsTotal: s.droitsTotal, bien: s.bien, heritiers: s.heritiers, frais: s.frais });
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
    if (lu.immeubles.length === 1 && !s.bien.parties[0].valeur) prendreImmeuble(s.bien.parties[0], lu.immeubles[0]);
    if (!s.bien.designation && s.bien.parties.length === 1 && s.bien.parties[0].designation) s.bien.designation = s.bien.parties[0].designation;
    // Part des frais de chaque héritier : la quotité qu'il reçoit dans la succession (déclaration).
    s.heritiers = lu.heritiers.map((x) => nouvelHeritier({
      nom: x.nom, droits: x.droits, recu: x.recu, nature: x.nature, partFrais: x.quote || '', vendeur: x.nature !== 'US',
    }));
    if (lu.heritiers.length && lu.heritiers.every((x) => typeof x.droits === 'number')) s.droitsTotal = lu.heritiers.reduce((t, x) => t + x.droits, 0);
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
    const droitsReleve = E.fraisDuReleve(lu.operations).filter((x) => x.droits).reduce((t, x) => t + x.montant, 0);
    if (droitsReleve && !(s.droitsTotal > 0)) s.droitsTotal = Math.round(droitsReleve * 100) / 100;
    s.releve = { fichier: fichier.name, periode: lu.periode };
    if (!s.reference) s.reference = lu.intitule;
    ctx.render(); ctx.changed();
    ui.toast('Relevé lu : frais d\'actes repris (cochez ceux à retenir).');
  }

  // Un immeuble (ou une partie d'immeuble) composant le bien vendu.
  function carteImmeuble(ctx, x, i) {
    const s = ctx.state;
    return h('div', { class: 'row-line fg-immeuble' },
      h('div', { class: 'fg-immeuble-tete' }, h('strong', null, 'Immeuble ' + (i + 1)),
        s.bien.parties.length > 1 ? retirer(ctx, s.bien.parties, x) : null),
      s.immeubles.length ? f('Repris de la déclaration', ui.selectInput({
        value: '', ariaLabel: 'Immeuble de la déclaration',
        options: [{ value: '', label: '— Choisir un immeuble de la déclaration —' }].concat(s.immeubles.map((y, k) => ({ value: String(k), label: y.designation + (y.cadastre ? ' — ' + y.cadastre : '') + ' — ' + fmtEuro(y.valeurSuccession) + (y.communaute ? ' (moitié de ' + fmtEuro(y.valeurDeclaree) + ')' : '') }))),
        onChange: (v) => { const y = s.immeubles[+v]; if (y) { prendreImmeuble(x, y); ctx.render(); ctx.changed(); } },
      })) : null,
      h('div', { class: 'grid-2' },
        f('Immeuble', ctx.text(x, 'designation', { placeholder: 'ex. Terrain à ORANGE' })),
        f('Valeur dans la succession', ctx.num(x, 'valeur', { suffix: '€' }), { help: 'Bien commun : la moitié revenant à la succession.' })),
      f('Références cadastrales', ctx.text(x, 'cadastre', { placeholder: 'ex. section AZ n° 307 (05 a 59 ca)' })),
      f('Divisé depuis la succession ?', ctx.segmented(x, 'division', [
        { value: 'aucune', label: 'Non' }, { value: 'valeur', label: 'Oui : valeur de la partie vendue' }, { value: 'surface', label: 'Oui : prorata des surfaces' },
      ], { small: true, structural: true })),
      x.division !== 'aucune' ? h('div', { class: 'stack-sm' },
        f('Partie concernée (nouvelles références cadastrales)', ctx.text(x, 'cadastreVendu', { placeholder: 'ex. section AZ n° 412 issue de la division du n° 307' })),
        x.division === 'valeur'
          ? f('Valeur de la partie au jour du décès', ctx.num(x, 'valeurPartie', { suffix: '€' }), { help: 'Sur la même base que le bien entier : la moitié s\'il était commun.' })
          : h('div', { class: 'grid-2' },
            f('Superficie du bien d\'origine', ctx.num(x, 'surfaceTotale', { suffix: 'm²' }), { help: x.surfaceTotale ? 'Soit ' + E.contenance(Math.round(x.surfaceTotale)) : 'Contenance cadastrale totale' }),
            f('Superficie de la partie', ctx.num(x, 'surfaceVendue', { suffix: 'm²' })))) : null,
      h('div', { class: 'grid-2' },
        f('Quote-part vendue', ctx.text(x, 'quoteVendue', { placeholder: 'En totalité' }), { help: 'Ex. 1/3 du chemin d\'accès commun aux trois lots.' }),
        f('Résidence principale du défunt (−20 %)', ctx.yesNo(x, 'residencePrincipale', { small: true }))),
      ctx.live((r) => {
        const y = r.parties[i];
        if (!y || !(y.valeurTotale > 0)) return null;
        const etapes = [fmtEuro(y.valeurTotale) + (y.residencePrincipale ? ' (après −20 %)' : '')];
        if (y.fractionDivision !== null) etapes.push('× ' + pctTexte(y.fractionDivision) + (y.division === 'surface' ? ' (' + A.util.fmtNum(y.surfaceVendue) + ' / ' + A.util.fmtNum(y.surfaceTotale) + ' m²)' : ' (partie)'));
        if (y.quoteVendue !== 1) etapes.push('× ' + (y.quoteTexte || pctTexte(y.quoteVendue)));
        return h('p', { class: 'small' }, 'Valeur retenue : ', h('strong', null, fmtEuro(y.valeur)), etapes.length > 1 ? ' = ' + etapes.join(' ') : '');
      }));
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

    const succession = ui.card('La succession', h('div', { class: 'stack-sm' },
      h('div', { class: 'grid-2' },
        f('Actif brut de la succession', ctx.num(s, 'actifBrut', { suffix: '€' })),
        f('Actif net de la succession', ctx.num(s, 'actifNet', { suffix: '€' }))),
      f('Base du prorata', h('div', { class: 'stack-sm' },
        ctx.segmented(s, 'baseChoix', [{ value: 'brut', label: 'Actif brut' }, { value: 'net', label: 'Actif net' }, { value: 'autre', label: 'Autre' }], { small: true, structural: true }),
        s.baseChoix === 'autre' ? ctx.num(s, 'baseAutre', { suffix: '€' }) : null), { help: 'Valeur totale de la succession à laquelle on compare le bien vendu.' }),
      s.immeubles.length ? h('div', { class: 'table-wrap' }, ui.table([
        { label: 'Immeuble de la déclaration', render: (x) => x.designation },
        { label: 'Cadastre', render: (x) => x.cadastre || '—' },
        { label: 'Valeur pour la succession', num: true, render: (x) => fmtEuro(x.valeurSuccession) + (x.communaute ? ' (½)' : '') },
      ], s.immeubles, { compact: true })) : null));

    const bien = ui.card('Le bien vendu', h('div', { class: 'stack-sm' },
      f('Désignation du bien vendu', ctx.text(s.bien, 'designation', { placeholder: 'ex. Lot B et 1/3 du chemin d\'accès' })),
      h('div', { class: 'rows' }, s.bien.parties.map((x, i) => carteImmeuble(ctx, x, i))),
      ui.button('Ajouter un immeuble', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.bien.parties.push(nouvellePartie()); ctx.render(); ctx.changed(); } }),
      ctx.live((r) => h('p', { class: 'small' },
        r.parties.length > 1 ? ['Valeur du bien vendu : ', h('strong', null, fmtEuro(r.valeurBien)), ' (' + r.parties.map((x) => fmtEuro(x.valeur)).join(' + ') + '). '] : null,
        'Quote-part du bien dans la succession : ', h('strong', null, r.base > 0 ? pctTexte(r.quotePart) : '—'),
        r.base > 0 ? ' (' + fmtEuro(r.valeurBien) + ' ÷ ' + fmtEuro(r.base) + ')' : ''))),
    { subtitle: 'Un immeuble par ligne de la déclaration. Bien divisé : seule la partie vendue compte. Partie commune (chemin d\'accès…) : indiquez la quote-part vendue, ex. 1/3.' });

    const heritiers = ui.card('Les héritiers', h('div', { class: 'stack-sm' },
      f('Droits de succession payés au total', ctx.num(s, 'droitsTotal', { suffix: '€' }), { help: 'Répartis selon la quotité de chacun, en grisé ci-dessous. Si les droits n\'ont pas suivi les quotités (donation antérieure, abattement déjà utilisé…), saisissez le montant réellement payé par l\'héritier : le reste du total est réparti entre les autres.' }),
      h('div', { class: 'rows' }, s.heritiers.map((x) => h('div', { class: 'row-line fg-heritier' },
        f('Héritier', ctx.text(x, 'nom', { placeholder: 'ex. Madame Claire DURAND' }), { help: x.nature ? ({ PP: 'Pleine propriété', NP: 'Nue-propriété', US: 'Usufruit' })[x.nature] + (x.recu ? ' · reçu ' + fmtEuro(x.recu) : '') : null }),
        f('Droits de succession payés', h('div', { class: 'stack-xs' },
          ctx.num(x, 'droits', { suffix: '€', placeholder: s.droitsTotal > 0 ? 'Selon la quotité' : '' }),
          ctx.live((r) => {
            const y = r.heritiers.find((z) => z.id === x.id);
            if (!y) return null;
            if (!y.droitsSaisis) return y.droitsSelonQuotite !== null ? h('span', { class: 'small muted' }, (r.heritiers.some((z) => z.droitsSaisis) ? 'Reste du total : ' : 'Selon la quotité : ') + fmtEuro(y.droitsSelonQuotite)) : null;
            return y.droitsSelonQuotite !== null && Math.abs(y.droits - y.droitsSelonQuotite) > 0.5 ? h('span', { class: 'small muted' }, 'Selon la quotité : ' + fmtEuro(y.droitsSelonQuotite) + ' (modifié)') : null;
          }))),
        f('Quotité reçue (part des frais)', ctx.text(x, 'partFrais', { placeholder: 'ex. 1/2', structural: true })),
        f('Vendeur', ctx.yesNo(x, 'vendeur', { small: true, structural: true })),
        s.heritiers.length > 1 ? retirer(ctx, s.heritiers, x) : h('span')))),
      ui.button('Ajouter un héritier', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.heritiers.push(nouvelHeritier()); ctx.render(); } })),
    { subtitle: 'Droits de succession : ceux payés par chacun (déclaration), ou le total réparti selon les quotités. Part des frais : la quotité reçue par chacun dans la succession (ex. 1/2, ou 1/6 des 3/4 = 1/8), reprise de la déclaration.' });

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

    return h('div', { class: 'stack' }, docs, succession, bien, heritiers, frais, resultat(ctx));
  }

  function resultat(ctx) {
    const s = ctx.state;
    return ctx.live((r) => {
      const vendeurs = r.heritiers.filter((x) => x.vendeur);
      // Résultat mis à disposition de l'outil Plus-value (sur ce poste).
      try {
        A.store.setPref('fraisGratuit', { reference: s.reference || '', bien: s.bien.designation || '', cadastre: r.parties.map((x) => x.cadastre).filter(Boolean).join(' ; '), date: todayISO(), valeurBien: r.valeurBien,
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
        h('p', { class: 'small muted' }, 'Prix d\'acquisition (valeur retenue pour les droits) : ' + fmtEuro(r.valeurBien) + (r.parties.some((x) => x.residencePrincipale) ? ' (après l\'abattement de 20 %)' : '') + (r.parties.length > 1 || r.valeurBien !== r.valeurTotale ? ' pour ce qui est vendu (' + r.parties.map((x) => fmtEuro(x.valeur)).join(' + ') + '),' : ' pour la totalité du bien,') + ' à répartir selon les droits de chacun. Pas de forfait de 7,5 % pour un bien reçu.'),
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
          ...r.parties.map((y) => ({
            l: (y.designation || 'Immeuble ' + (y.index + 1)) + (y.cadastre ? ' — ' + y.cadastre : '') + ' : ' + fmtEuro(y.valeurTotale) + (y.residencePrincipale ? ' (après −20 %)' : '')
              + (y.fractionDivision !== null ? ' × ' + pctTexte(y.fractionDivision) + (y.division === 'surface' ? ' (' + A.util.fmtNum(y.surfaceVendue) + ' / ' + A.util.fmtNum(y.surfaceTotale) + ' m²)' : ' (partie)') : '')
              + (y.quoteVendue !== 1 ? ' × ' + (y.quoteTexte || pctTexte(y.quoteVendue)) : ''),
            v: fmtEuro(y.valeur),
          })),
          { l: 'Valeur du bien vendu', v: fmtEuro(r.valeurBien) },
          { l: 'Valeur totale de la succession (' + ({ brut: 'actif brut', net: 'actif net', autre: 'base retenue' })[s.baseChoix] + ')', v: fmtEuro(r.base) },
          { l: 'Quote-part du bien', v: pctTexte(r.quotePart) },
        ].filter(Boolean), { compact: true }),
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
    // Anciens dossiers : un seul immeuble décrit directement dans « bien ».
    const b = s.bien || {};
    s.bien = { designation: b.designation || '', parties: (Array.isArray(b.parties) && b.parties.length ? b.parties : [b]).map((x) => nouvellePartie(x)) };
    s.heritiers = (s.heritiers && s.heritiers.length ? s.heritiers : [nouvelHeritier()]).map((x) => nouvelHeritier(x));
    s.frais = (s.frais || []).map((x) => nouveauFrais(x));
    s.immeubles = s.immeubles || [];
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'commun', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.reference || s.bien.designation || (s.bien.parties[0] && s.bien.parties[0].designation),
    tabs: [{ id: 'calcul', label: 'Calcul', render: tabCalcul }],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
