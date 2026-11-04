/*
 * Application « Quasi-usufruit » : assiette d'une convention de quasi-usufruit après une succession ou
 * une vente. Le relevé de compte du dossier (PDF) est lu et chaque opération est classée ; tout reste
 * modifiable. Tableau et paragraphes pour la convention, à copier ou télécharger en Word.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid, fmtPct, fmtDate, todayISO } = A.util;
  const fmtEuro = (x) => A.util.fmtEuro(x, 2);
  const ui = A.ui;
  const E = A.engines.quasi;

  const app = {
    id: 'quasi',
    fileSuffix: 'quasi-usufruit',
    title: 'Quasi-usufruit',
    caption: 'Assiette de la convention',
    icon: 'quasi',
    gradient: 'linear-gradient(150deg, #3f6b5a 0%, #7fb59a 100%)',
  };

  const nouveauNu = () => ({ id: uid('n'), nom: '', part: '', mode: 'qu' });
  function empty() {
    return {
      reference: '', cas: 'succession', dateActe: todayISO(),
      usufruitier: { nom: '', naissance: '', age: null },
      nus: [nouveauNu(), nouveauNu()],
      regime: 'communaute', actif: [],
      base: [], operations: [],
      releve: null,
    };
  }
  const isEmpty = (s) => !s.reference && !s.operations.length && !s.base.some((x) => x.montant) && !s.actif.some((x) => x.montant) && !s.usufruitier.nom;

  /* ---------- Actif successoral ---------- */
  const NATURES = [{ value: 'liquidites', label: 'Liquidités (comptes, livrets)' }, { value: 'titres', label: 'Valeurs mobilières' }, { value: 'immobilier', label: 'Immobilier' }, { value: 'autre', label: 'Autre' }];
  const REGIMES = [{ value: 'communaute', label: 'Communauté' }, { value: 'separation', label: 'Séparation de biens' }, { value: 'aucun', label: 'Non marié / veuf' }];
  const PROPRIETES = [{ value: 'commun', label: 'Bien commun (½ à la succession)' }, { value: 'propre', label: 'Bien propre du défunt (100 %)' }, { value: 'indivis', label: 'Indivis (quote-part)' }];
  const proprieteDefaut = (s) => (s.regime === 'communaute' ? 'commun' : 'propre');
  // Seules les sommes d'argent (biens consomptibles) sont en principe soumises au quasi-usufruit (art. 587 C. civ.).
  const soumisDefaut = (nature) => nature === 'liquidites';
  const nouvelActif = (s, o) => Object.assign({ id: uid('a'), libelle: '', nature: 'liquidites', montant: null, propriete: proprieteDefaut(s), part: '', soumis: true, opId: '' }, o || {});
  const partActif = (x) => (x.propriete === 'commun' ? '1/2' : x.propriete === 'indivis' ? x.part : '');
  const montantBase = (o) => (typeof o.montantBase === 'number' ? o.montantBase : o.montant);
  // Libellé d'une ligne d'actif reprise du relevé : « reçu de BNP POUR COMPTE SSION » → « BNP PARIBAS (fonds versés) ».
  function actifDepuisOperation(s, o) {
    const tiers = (/^re[çc]u de (.+?) pour compte/i.exec(o.libelleReleve) || [])[1];
    return nouvelActif(s, { libelle: (tiers ? tiers.toUpperCase() : 'Fonds') + ' (fonds versés au dossier)', montant: o.montant, opId: o.id });
  }
  const SENS = (o) => (o.credit ? 'credit' : 'debit');

  // Données du calcul : lignes de base (relevé + saisies) et éléments retranchés.
  function donnees(s) {
    // Succession : base = actif successoral soumis au quasi-usufruit, selon son origine (communauté, propre, indivis).
    const base = s.cas !== 'vente'
      ? s.actif.filter((x) => x.soumis).map((x) => ({ id: x.id, libelle: x.libelle, montant: x.montant, part: partActif(x), groupe: x.propriete }))
      : s.operations.filter((o) => o.action === 'base').map((o) => ({ id: o.id, libelle: o.libelle || o.libelleReleve, montant: montantBase(o), part: o.part }))
        .concat(s.base.map((x) => ({ id: x.id, libelle: x.libelle, montant: x.montant, part: x.part })));
    return Object.assign({}, s, { base, operations: s.operations.filter((o) => o.action === 'retranche') });
  }
  const compute = (s, p) => E.calculer(donnees(s), p);

  /* ---------- Lecture du relevé (PDF) ---------- */
  function script(src) {
    return new Promise((ok, ko) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => ok();
      el.onerror = () => ko(new Error('Impossible de charger ' + src));
      document.head.appendChild(el);
    });
  }
  async function pdfjs() {
    if (!root.pdfjsLib) {
      await script('assets/vendor/pdfjs/pdf.worker.min.js');
      await script('assets/vendor/pdfjs/pdf.min.js');
      root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
    }
    return root.pdfjsLib;
  }
  async function pagesDuPdf(fichier) {
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
    const pages = [];
    for (let k = 1; k <= pdf.numPages; k++) {
      const tc = await (await pdf.getPage(k)).getTextContent();
      pages.push({ num: k, items: tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })) });
    }
    return pages;
  }
  function choisirFichier() {
    return new Promise((ok) => {
      const input = h('input', { type: 'file', accept: '.pdf,application/pdf' });
      input.addEventListener('change', () => ok(input.files && input.files[0]));
      input.click();
    });
  }
  const titreCase = (t) => String(t || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase());
  // « Mme BLANCHARD Annie Berthe » → « Madame Annie BLANCHARD » ; « M LECOUSTEY Sylvain » → « Monsieur Sylvain LECOUSTEY ».
  function nomDepuisReleve(t) {
    const m = /^(MME|Mme|MLLE|Mlle|MR|M|Monsieur|Madame)\.?\s+([A-ZÀ-Ý' -]{2,}?)\s+([A-ZÀ-Ý][a-zà-ÿ].*)$/.exec(String(t || '').trim());
    if (!m) return titreCase(t);
    const civ = /^M(R)?$|^Monsieur$/i.test(m[1]) ? 'Monsieur' : 'Madame';
    return civ + ' ' + m[3].trim().split(/\s+/)[0] + ' ' + m[2].trim().toUpperCase();
  }
  const motsNom = (t) => String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Z]+/).filter((x) => x.length > 2 && !['MME', 'MADAME', 'MONSIEUR', 'MLLE'].includes(x));
  const correspond = (a, b) => { const x = motsNom(a), y = motsNom(b); return x.length && y.length && x.filter((m) => y.includes(m)).length >= Math.min(2, x.length, y.length); };

  async function importer(ctx) {
    const fichier = await choisirFichier();
    if (!fichier) return;
    ui.toast('Lecture du relevé…');
    let lu;
    try {
      lu = E.lireReleve(await pagesDuPdf(fichier));
    } catch (e) {
      console.error(e);
      return ui.toast('Lecture du PDF impossible : ' + e.message, 'error');
    }
    if (!lu.operations.length) return ui.toast(lu.avertissements[0] || 'Aucune opération trouvée.', 'error');
    const s = ctx.state;
    if (s.operations.length && !(await ui.confirm('Remplacer le relevé ?', 'Les opérations déjà lues seront remplacées par celles de ce relevé (les saisies manuelles sont gardées).', 'Remplacer'))) return;
    // Cas : d'après l'intitulé du compte.
    if (/\bVENTE\b/i.test(lu.intitule)) s.cas = 'vente';
    else if (/SUCCESSION|\bSSION\b/i.test(lu.intitule)) s.cas = 'succession';
    if (!s.reference) s.reference = lu.intitule;
    // Noms : quasi-usufruitier cité par la convention, personnes citées par les déclarations de plus-value.
    const conv = lu.operations.find((o) => /QUASI.?USUFRUIT\s+(MME|M\.?|MR)\s+/i.test(o.libelle));
    if (conv && !s.usufruitier.nom) {
      const m = /QUASI.?USUFRUIT\s+(MME|M\.?|MR)\s+([A-ZÀ-Ý'-]+)/i.exec(conv.libelle);
      if (m) s.usufruitier.nom = (/MME/i.test(m[1]) ? 'Madame ' : 'Monsieur ') + m[2].toUpperCase();
    }
    const manuelles = s.operations.filter((o) => o.manuel);
    s.operations = lu.operations.map((o) => {
      const c = E.classer(o, s.cas);
      return {
        id: uid('o'), date: o.date, libelleReleve: o.libelle, montant: o.debit || o.credit, sens: SENS(o), details: o.details,
        action: c.action, libelle: c.libelle, repartition: c.repartition, nature: c.nature, verifier: c.verifier, personneTexte: c.personneTexte || '', personne: '', part: '',
      };
    }).concat(manuelles);
    // Succession : les fonds versés au dossier alimentent l'actif successoral (montants modifiables).
    if (s.cas !== 'vente') {
      s.actif = s.actif.filter((x) => !x.opId);
      s.operations.filter((o) => o.action === 'base' && o.sens === 'credit').forEach((o) => s.actif.push(actifDepuisOperation(s, o)));
    }
    // Plus-values : rattachées au nu-propriétaire cité, sinon sans effet (part en pleine propriété de l'usufruitier).
    const cites = [...new Set(s.operations.filter((o) => o.personneTexte).map((o) => o.personneTexte))];
    cites.forEach((t) => {
      if (s.usufruitier.nom && correspond(t, s.usufruitier.nom)) return;
      if (/^(MME|MADAME)\b/i.test(t) && !s.usufruitier.nom && s.cas === 'vente' && cites.length > 1 && cites.indexOf(t) === 0) { s.usufruitier.nom = nomDepuisReleve(t); return; }
      if (s.nus.some((x) => x.nom && correspond(t, x.nom))) return;
      const vide = s.nus.find((x) => !x.nom);
      if (vide) vide.nom = nomDepuisReleve(t); else s.nus.push(Object.assign(nouveauNu(), { nom: nomDepuisReleve(t) }));
    });
    s.operations.filter((o) => o.personneTexte).forEach((o) => {
      const nu = s.nus.find((x) => x.nom && correspond(o.personneTexte, x.nom));
      if (nu) { o.personne = nu.id; o.libelle = 'plus-value'; } else { o.action = 'ignore'; o.verifier = true; }
    });
    s.releve = { fichier: fichier.name, compte: lu.compte, intitule: lu.intitule, periode: lu.periode, avertissements: lu.avertissements, date: todayISO() };
    ctx.render();
    ctx.changed();
    const nb = s.operations.filter((o) => !o.manuel).length;
    ui.toast(nb + ' opérations lues. Vérifiez les lignes signalées en orange.');
  }

  /* ---------- Onglet « Calcul » ---------- */
  const f = (label, control, opts) => ui.field(label, control, opts);
  const retirer = (ctx, liste, x) => ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { liste.splice(liste.indexOf(x), 1); ctx.render(); ctx.changed(); } });

  function tabCalcul(ctx) {
    const s = ctx.state;
    const vente = s.cas === 'vente';

    const dossier = ui.card('Le dossier', h('div', { class: 'stack-sm' },
      h('div', { class: 'grid-2' },
        f('Dossier', ctx.text(s, 'reference', { placeholder: vente ? 'ex. Vente CTS DUPONT / MARTIN' : 'ex. Succession M. DUPONT' })),
        f('Quasi-usufruit après', ctx.segmented(s, 'cas', [{ value: 'succession', label: 'Une succession' }, { value: 'vente', label: 'Une vente' }], { structural: true }))),
      h('div', { class: 'qu-import' },
        ui.button(s.releve ? 'Lire un autre relevé' : 'Lire le relevé de compte (PDF)', { icon: 'upload', variant: s.releve ? 'soft' : 'primary', onClick: () => importer(ctx) }),
        s.releve ? h('span', { class: 'small muted' }, s.releve.fichier + (s.releve.periode ? ' · du ' + s.releve.periode : '') + ' · ' + s.operations.filter((o) => !o.manuel).length + ' opérations') : h('span', { class: 'small muted' }, 'Relevé de compte du dossier exporté de la comptabilité (Fiducial). La lecture se fait sur ce poste.')),
      ...(s.releve ? s.releve.avertissements.map((a) => ui.note(a, 'warn')) : [])));

    const parties = ui.card('Les parties', h('div', { class: 'stack-sm' },
      h('div', { class: 'row-line qu-usu' },
        f('Quasi-usufruitier', ctx.text(s.usufruitier, 'nom', { placeholder: 'ex. Madame Gisèle DUPONT' })),
        f('Date de naissance', ctx.date(s.usufruitier, 'naissance')),
        f('Date de l\'acte', ctx.date(s, 'dateActe')),
        f('Usufruit (art. 669)', ctx.live((r) => h('div', { class: 'readonly' }, r.age === null ? '—' : r.age + ' ans · ' + fmtPct(r.usufruit, 0))))),
      h('div', { class: 'rows' }, s.nus.map((x) => h('div', { class: 'row-line qu-nu' },
        f('Nu-propriétaire', ctx.text(x, 'nom', { placeholder: 'ex. Monsieur Paul DUPONT' })),
        f('Part', ctx.text(x, 'part', { placeholder: 'égale' }), { help: 'ex. 1/2' }),
        f('Sur sa part', ctx.segmented(x, 'mode', [{ value: 'qu', label: 'Quasi-usufruit' }, { value: 'bareme', label: 'Répartition (barème)' }], { small: true })),
        s.nus.length > 1 ? retirer(ctx, s.nus, x) : h('span')))),
      ui.button('Ajouter un nu-propriétaire', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.nus.push(nouveauNu()); ctx.render(); } })),
    { subtitle: 'Noms repris du relevé quand il les cite : à compléter. « Répartition (barème) » : la part est partagée entre usufruitier et nu-propriétaire selon l\'âge, au lieu d\'un quasi-usufruit.' });

    // Base de départ : opérations du relevé retenues et saisies manuelles.
    const credits = s.operations.filter((o) => o.sens === 'credit' && (o.nature === (vente ? 'prix' : 'liquidites')));
    const toutPrendre = () => {
      credits.forEach((o) => (o.action = 'base'));
      ctx.render(); ctx.changed();
      ui.toast(credits.length ? credits.length + ' ligne' + (credits.length > 1 ? 's' : '') + ' du relevé en base de départ.' : 'Aucune ligne de ce type trouvée dans le relevé : saisissez la base à la main.');
    };
    const lignesReleve = s.operations.filter((o) => o.action === 'base');
    const base = ui.card('Base de départ', h('div', { class: 'stack-sm' },
      h('div', { class: 'chips' },
        ui.button(vente ? 'Tout le prix de vente' : 'Tout l\'actif versé', { icon: 'check', variant: 'soft', small: true, onClick: toutPrendre }),
        ui.button('Ajouter une ligne', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.base.push({ id: uid('b'), libelle: '', montant: null, part: '' }); ctx.render(); } })),
      h('div', { class: 'rows' },
        lignesReleve.map((o) => h('div', { class: 'row-line qu-base' },
          f('Ligne du relevé', ctx.text(o, 'libelle', { placeholder: o.libelleReleve })),
          f('Montant', ctx.num(o, 'montantBase', { suffix: '€', placeholder: A.util.fmtNum(o.montant, 2) }), { help: o.montantBase !== undefined && o.montantBase !== null && o.montantBase !== o.montant ? 'Relevé : ' + fmtEuro(o.montant) : 'Lu sur le relevé, modifiable' }),
          f(vente ? 'Quote-part démembrée' : 'Part de la succession', ctx.text(o, 'part', { placeholder: '100 %' }), { help: vente ? 'ex. 95/100, 3/8' : 'ex. 1/2 (communauté)' }),
          ui.button('Retirer de la base', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { o.action = 'ignore'; ctx.render(); ctx.changed(); } }))),
        s.base.map((x) => h('div', { class: 'row-line qu-base' },
          f('Saisie manuelle', ctx.text(x, 'libelle', { placeholder: vente ? 'ex. Prix de vente' : 'ex. Comptes BNP PARIBAS' })),
          f('Montant', ctx.num(x, 'montant', { suffix: '€' })),
          f(vente ? 'Quote-part démembrée' : 'Part de la succession', ctx.text(x, 'part', { placeholder: '100 %' }), { help: vente ? 'ex. 95/100, 3/8' : 'ex. 1/2 (communauté)' }),
          retirer(ctx, s.base, x)))),
      !lignesReleve.length && !s.base.length ? h('p', { class: 'small muted' }, 'Aucune ligne : utilisez le bouton ci-dessus ou saisissez la base.') : null,
      ctx.live((r) => h('p', { class: 'small' }, 'Base démembrée : ', h('strong', null, fmtEuro(r.brut)), r.brutTotal !== r.brut ? ' (sur ' + fmtEuro(r.brutTotal) + ')' : ''))),
    { subtitle: vente ? 'Prix de vente encaissé, avec la quote-part sur laquelle porte le démembrement.' : 'Liquidités versées sur le compte du dossier. Ajoutez ce qui n\'apparaît pas (comptes au décès, actif non encore versé).' });

    return h('div', { class: 'stack' }, dossier, parties, vente ? base : carteActif(ctx), tableOperations(ctx), resultat(ctx));
  }

  function carteActif(ctx) {
    const s = ctx.state;
    const regime = f('Régime matrimonial du défunt', ui.segmented({ value: s.regime, options: REGIMES, small: true, onChange: async (v) => {
      s.regime = v;
      if (s.actif.length && await ui.confirm('Appliquer le régime ?', 'Rattacher toutes les lignes de l\'actif ' + (v === 'communaute' ? 'à la communauté (½ à la succession)' : 'aux biens propres du défunt (100 %)') + ' ? Vous pourrez ensuite modifier ligne par ligne.', 'Appliquer')) {
        s.actif.forEach((x) => { if (x.propriete !== 'indivis') x.propriete = proprieteDefaut(s); });
      }
      ctx.render(); ctx.changed();
    } }));
    const lignes = s.actif.map((x) => h('div', { class: ['row-line', 'qu-actif', x.soumis ? '' : 'qu-actif-hors'] },
      f('Bien', ctx.text(x, 'libelle', { placeholder: 'ex. BNP PARIBAS : comptes et livrets' }), { help: x.opId ? 'Repris du relevé : montant modifiable' : null }),
      f('Nature', ui.selectInput({ value: x.nature, options: NATURES, ariaLabel: 'Nature', onChange: (v) => { x.nature = v; x.soumis = soumisDefaut(v); ctx.render(); ctx.changed(); } })),
      f('Montant au décès', ctx.num(x, 'montant', { suffix: '€' })),
      ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => {
        s.actif.splice(s.actif.indexOf(x), 1);
        const op = x.opId && s.operations.find((o) => o.id === x.opId);
        if (op) op.action = 'ignore';
        ctx.render(); ctx.changed();
      } }),
      f('Origine', ctx.select(x, 'propriete', PROPRIETES, { structural: true })),
      x.propriete === 'indivis' ? f('Quote-part du défunt', ctx.text(x, 'part', { placeholder: 'ex. 1/2' })) : f('À la succession', ctx.live(() => {
        const fr = E.fraction(partActif(x));
        return h('div', { class: 'readonly' }, fmtEuro((fr === null ? 1 : fr) * (x.montant || 0)));
      })),
      f('Soumis au quasi-usufruit', ui.yesNo(x.soumis, (v) => { x.soumis = v; ctx.render(); ctx.changed(); }, true))));
    const versees = s.operations.filter((o) => o.sens === 'credit' && o.nature === 'liquidites');
    const reprendre = () => {
      let n = 0;
      versees.forEach((o) => { if (!s.actif.some((x) => x.opId === o.id)) { o.action = 'base'; s.actif.push(actifDepuisOperation(s, o)); n++; } });
      ctx.render(); ctx.changed();
      ui.toast(n ? n + ' ligne' + (n > 1 ? 's' : '') + ' reprise' + (n > 1 ? 's' : '') + ' du relevé.' : versees.length ? 'Les fonds versés sont déjà dans l\'actif.' : 'Aucun versement de fonds trouvé dans le relevé.');
    };
    return ui.card('Actif successoral', h('div', { class: 'stack-sm' },
      regime,
      h('div', { class: 'rows' }, lignes.length ? lignes : h('p', { class: 'small muted' }, 'Aucune ligne : reprenez les fonds versés au dossier ou saisissez l\'actif (bordereau de situation au décès, immobilier…).')),
      h('div', { class: 'chips' },
        ui.button('Ajouter un bien', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.actif.push(nouvelActif(s)); ctx.render(); } }),
        ui.button('Tout l\'actif versé (relevé)', { icon: 'check', variant: 'soft', small: true, onClick: reprendre })),
      ctx.live((r) => h('p', { class: 'small' }, 'Soumis au quasi-usufruit, revenant à la succession : ', h('strong', null, fmtEuro(r.brut))))),
    { subtitle: 'Indiquez les montants au décès (bordereau de situation), même s\'ils diffèrent des sommes reçues. Seules les lignes marquées « Quasi-usufruit » entrent dans l\'assiette : par défaut les liquidités ; l\'immobilier reste en usufruit ordinaire.' });
  }

  function tableOperations(ctx) {
    const s = ctx.state;
    const vente = s.cas === 'vente';
    const personnes = [{ value: '', label: 'Tous' }].concat(s.nus.map((x, i) => ({ value: x.id, label: x.nom || 'Nu-propriétaire ' + (i + 1) })));
    const effets = (o) => (o.sens === 'credit'
      ? [{ value: 'base', label: vente ? 'Base de départ' : 'Repris dans l\'actif' }, { value: 'ignore', label: 'Sans effet' }]
      : [{ value: 'retranche', label: 'Retranché' }, { value: 'ignore', label: 'Sans effet' }]);
    const ligne = (o) => {
      const ret = o.action === 'retranche';
      return h('tr', { class: ['qu-op', o.action === 'ignore' ? 'qu-op-ignore' : '', o.verifier ? 'qu-op-verif' : ''] },
        h('td', { class: 'nowrap' }, o.manuel ? h('span', { class: 'muted small' }, 'à venir') : fmtDate(o.date)),
        h('td', null, o.manuel ? ctx.text(o, 'libelleReleve', { placeholder: 'ex. frais de déclaration de succession (estimation)' })
          : h('div', { class: 'qu-lib' }, h('span', null, o.libelleReleve),
            o.details && o.details.length ? h('span', { class: 'small muted' }, o.details.map((d) => d.libelle + ' ' + fmtEuro(d.montant)).join(' · ')) : null)),
        h('td', { class: 'num nowrap' }, o.manuel ? ctx.num(o, 'montant', { suffix: '€' }) : h('span', { class: o.sens === 'credit' ? 'pos' : '' }, (o.sens === 'credit' ? '+ ' : '') + fmtEuro(o.montant))),
        h('td', null, h('div', { class: 'qu-cell' },
          ui.selectInput({ value: o.action, options: effets(o), ariaLabel: 'Effet', onChange: (v) => {
            o.action = v; o.verifier = false;
            // Succession : un versement repris (ou retiré) alimente (ou quitte) l'actif successoral.
            if (!vente && o.sens === 'credit') {
              if (v === 'base' && !s.actif.some((x) => x.opId === o.id)) s.actif.push(actifDepuisOperation(s, o));
              if (v !== 'base') s.actif = s.actif.filter((x) => x.opId !== o.id);
            }
            ctx.render(); ctx.changed();
          } }),
          ret && vente && !o.personne ? ctx.segmented(o, 'repartition', [{ value: 'totalite', label: 'Totalité' }, { value: 'prorata', label: 'Prorata' }], { small: true }) : null)),
        h('td', null, ret ? h('div', { class: 'qu-cell' },
          ctx.text(o, 'libelle', { placeholder: 'libellé dans l\'acte' }),
          s.nus.length > 1 ? h('label', { class: 'qu-supporte' }, h('span', { class: 'small muted' }, 'Supporté par'), ctx.select(o, 'personne', personnes, { ariaLabel: 'Supporté par', structural: true })) : null) : null),
        h('td', null, o.verifier ? ui.button('Marquer comme vérifié', { icon: 'check', iconOnly: true, variant: 'soft', small: true, title: 'Marquer comme vérifié', onClick: () => { o.verifier = false; ctx.render(); ctx.changed(); } })
          : o.manuel ? ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { s.operations.splice(s.operations.indexOf(o), 1); ctx.render(); ctx.changed(); } }) : null));
    };
    const tete = ['Date', 'Opération du relevé', 'Montant', vente ? 'Effet · répartition' : 'Effet', 'Libellé dans l\'acte', ''];
    const ops = s.operations.filter((o) => o.action !== 'base' || !vente);
    const aVerifier = ops.filter((o) => o.verifier).length;
    const ajouter = () => {
      s.operations.push({ id: uid('o'), manuel: true, date: '', libelleReleve: '', montant: null, sens: 'debit', details: [], action: 'retranche', libelle: '', repartition: 'totalite', nature: 'manuel', verifier: false, personne: '', part: '' });
      ctx.render();
    };
    return ui.card('Éléments à retrancher', h('div', { class: 'stack-sm' },
      aVerifier ? ui.note(aVerifier + ' ligne' + (aVerifier > 1 ? 's' : '') + ' à vérifier (en orange) : choisissez l\'effet puis cliquez sur la coche ✓ de la ligne.', 'warn') : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table table-input qu-ops' },
        h('thead', null, h('tr', null, tete.map((t) => h('th', null, t)))),
        h('tbody', null, ops.length ? ops.map(ligne) : h('tr', null, h('td', { colspan: tete.length, class: 'empty' }, 'Lisez le relevé de compte, ou ajoutez les éléments à la main.'))))),
      ui.button('Ajouter un élément à venir', { icon: 'plus', variant: 'soft', small: true, onClick: ajouter })),
    { subtitle: 'Classement proposé d\'après le libellé du relevé. Les lignes de même libellé dans l\'acte sont additionnées. ' + (vente ? '« Prorata » : seule la quote-part démembrée est retranchée. ' : '') + '« Supporté par » : un élément propre à un nu-propriétaire (sa plus-value) n\'est retranché que de sa part.' });
  }

  function resultat(ctx) {
    return ctx.live((r) => {
      const lignes = [
        ['Base démembrée', fmtEuro(r.brut)],
        ['Éléments retranchés', '− ' + fmtEuro(r.totalFrais)],
        ['Solde', fmtEuro(r.net)],
      ];
      return ui.card('Résultat', h('div', { class: 'stack-sm' },
        ...r.alertes.map((a) => ui.note(a, 'warn')),
        h('div', { class: 'bilan' },
          ui.stat('Solde après retranchements', fmtEuro(r.net)),
          ui.stat('Assiette du quasi-usufruit', fmtEuro(r.assietteQU), null, 'strong')),
        ui.table([{ label: '', render: (l) => l[0] }, { label: '', num: true, render: (l) => l[1] }], lignes, { compact: true }),
        r.nus.length ? ui.table([
          { label: 'Nu-propriétaire', render: (x) => x.nom || '—' },
          { label: 'Part', num: true, render: (x) => x.partTexte || E.fmtFraction(x.part) },
          { label: 'Sur le solde', num: true, render: (x) => fmtEuro(x.quote) },
          { label: 'Propre (plus-value…)', num: true, render: (x) => (x.propres.length ? '− ' + fmtEuro(x.propres.reduce((t, o) => t + o.montant, 0)) : '—') },
          { label: 'Créance de restitution', num: true, render: (x) => (x.mode === 'qu' ? h('strong', null, fmtEuro(x.creance)) : '—') },
          { label: 'Barème : usufruit / NP', num: true, render: (x) => (x.mode === 'bareme' ? (x.usufruitier === null ? 'âge manquant' : fmtEuro(x.usufruitier) + ' / ' + fmtEuro(x.nuePropriete)) : '—') },
        ], r.nus, { compact: true }) : null), { className: 'qu-resultat' });
    });
  }

  /* ---------- Onglet « Pour l'acte » ---------- */
  const enLettres = (x) => A.lettres.montant(Math.round(x * 100) / 100, 'EUR', true).replace(/[\s\u00a0\u202f]EUR\)$/, ' €)');
  const blocsDe = (s, r) => E.blocs(donnees(s), r, enLettres);
  function tabActe(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' }, ctx.live((r) => {
      const b = blocsDe(s, r);
      const nom = 'Quasi-usufruit - ' + (s.reference || 'dossier') + '.docx';
      return ui.card('Tableau et assiette pour la convention', h('div', { class: 'stack-sm' },
        ...r.alertes.map((a) => ui.note(a, 'warn')),
        h('div', { class: 'chips' },
          ui.button('Copier pour l\'acte', { icon: 'copy', variant: 'primary', small: true, onClick: () => A.acteDoc.copier(b, 'Copié : collez-le dans la convention (tableau compris).') }),
          ui.button('Télécharger en Word', { icon: 'save', variant: 'soft', small: true, onClick: () => A.acteDoc.telecharger(b, nom) })),
        A.acteDoc.html(b)), { subtitle: 'À reprendre dans la partie « Calcul des droits sur lesquels s\'exerce le quasi-usufruit » et « Assiette du quasi-usufruit » de la convention.' });
    }));
  }

  /* ---------- Panneau et impression ---------- */
  function aside(ctx) {
    return ui.card('En un coup d\'œil', ctx.live((r) => [
      h('ul', { class: 'aside-list' },
        h('li', null, h('span', null, 'Base démembrée'), h('strong', null, fmtEuro(r.brut))),
        h('li', null, h('span', null, 'Retranché'), h('strong', null, '− ' + fmtEuro(r.totalFrais))),
        h('li', null, h('span', null, 'Assiette du quasi-usufruit'), h('strong', null, fmtEuro(r.assietteQU)))),
      ctx.state.operations.some((o) => o.verifier) ? ui.badge(false, ctx.state.operations.filter((o) => o.verifier).length + ' ligne(s) à vérifier') : ui.badge(true, 'Toutes les lignes vérifiées'),
    ]), { className: 'aside-card' });
  }
  function print(ctx) {
    const s = ctx.state, r = ctx.result;
    const retenues = s.operations.filter((o) => o.action === 'retranche' && o.montant);
    ui.print(ui.printDoc({
      title: 'Convention de quasi-usufruit — calcul de l\'assiette',
      subtitle: s.reference || null,
      meta: [s.releve ? 'Relevé : ' + s.releve.fichier + (s.releve.periode ? ' (du ' + s.releve.periode + ')' : '') : null, s.dateActe ? 'Acte du ' + fmtDate(s.dateActe) : null].filter(Boolean),
      body: [
        A.acteDoc.html(blocsDe(s, r)),
        h('h2', null, 'Détail des éléments retranchés (traçabilité)'),
        ui.table([
          { label: 'Date', render: (o) => (o.manuel ? 'à venir' : fmtDate(o.date)) },
          { label: 'Opération du relevé', render: (o) => o.libelleReleve },
          { label: 'Libellé dans l\'acte', render: (o) => o.libelle + (o.personne ? ' (' + ((s.nus.find((x) => x.id === o.personne) || {}).nom || '') + ')' : '') },
          { label: 'Montant', num: true, render: (o) => fmtEuro(o.montant) },
          { label: 'Retenu', num: true, render: (o) => (o.repartition === 'prorata' && !o.personne ? fmtEuro(o.montant * r.q) + ' (prorata)' : fmtEuro(o.montant)) },
        ], retenues, { compact: true }),
      ],
      footer: 'Calcul établi d\'après le relevé de compte du dossier et les éléments saisis ; à vérifier avant reprise dans l\'acte.',
    }), 'Quasi-usufruit ' + (s.reference || ''));
  }
  function normalize(s) {
    s.usufruitier = Object.assign({ nom: '', naissance: '', age: null }, s.usufruitier || {});
    s.nus = (s.nus && s.nus.length ? s.nus : [nouveauNu()]).map((x) => Object.assign(nouveauNu(), x));
    s.base = s.base || [];
    s.operations = s.operations || [];
    s.regime = s.regime || 'communaute';
    // Anciens dossiers de succession : la base de départ devient l'actif successoral.
    if (!Array.isArray(s.actif)) {
      s.actif = [];
      if (s.cas !== 'vente') {
        const prop = (part) => (/^1\s*\/\s*2$/.test(String(part || '').trim()) ? { propriete: 'commun' } : String(part || '').trim() ? { propriete: 'indivis', part } : { propriete: 'propre' });
        s.operations.filter((o) => o.action === 'base').forEach((o) => s.actif.push(Object.assign(nouvelActif(s, { libelle: o.libelle || o.libelleReleve, montant: montantBase(o), opId: o.id }), prop(o.part))));
        s.base.forEach((x) => s.actif.push(Object.assign(nouvelActif(s, { libelle: x.libelle, montant: x.montant }), prop(x.part))));
        s.base = [];
      }
    }
    s.actif = s.actif.map((x) => Object.assign(nouvelActif(s), x));
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'commun', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.reference,
    tabs: [
      { id: 'calcul', label: 'Relevé et calcul', render: tabCalcul },
      { id: 'acte', label: 'Pour l\'acte', render: tabActe },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
