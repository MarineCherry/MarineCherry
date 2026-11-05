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
      regime: 'communaute', option: 'usufruit', partUsufruit: '', actif: [], fraisQU: null,
      base: [], operations: [],
      releve: null,
    };
  }
  const isEmpty = (s) => !s.reference && !s.operations.length && !s.base.some((x) => x.montant) && !s.actif.some((x) => x.montant) && !s.usufruitier.nom;

  /* ---------- Comptes bancaires au décès (succession) ---------- */
  const REGIMES = [{ value: 'communaute', label: 'Communauté' }, { value: 'separation', label: 'Séparation de biens' }, { value: 'aucun', label: 'Non marié / veuf' }];
  const OPTIONS = [{ value: 'usufruit', label: 'Usufruit de la totalité' }, { value: 'quart', label: '1/4 PP et 3/4 US' }, { value: 'complement', label: 'US + complément (758-6)' }, { value: 'autre', label: 'Autre' }];
  const TITULAIRES = [{ value: 'defunt', label: 'Défunt' }, { value: 'conjoint', label: 'Conjoint' }, { value: 'joint', label: 'Compte-joint' }, { value: 'indivision', label: 'En indivision' }];
  const PROPRIETES = [{ value: 'commun', label: 'Commun (½ à la succession)' }, { value: 'propre', label: 'Propre du défunt (100 %)' }, { value: 'indivis', label: 'Indivis (quote-part)' }, { value: 'conjoint', label: 'Propre du conjoint (exclu)' }];
  const TYPES = ['compte', 'compte courant', 'Livret A', 'Livret Développement Durable', 'Livret d\'Epargne Populaire', 'compte sur livret', 'Plan d\'Epargne Logement', 'Compte Epargne Logement', 'compte titres'];
  // Origine par défaut d'après le régime et le titulaire : communauté → commun ; séparation → propre,
  // propre du conjoint ou indivis par moitié (compte-joint).
  function proprieteDefaut(s, titulaire) {
    if (s.regime === 'communaute') return 'commun';
    if (titulaire === 'conjoint') return s.regime === 'separation' ? 'conjoint' : 'propre';
    if (titulaire === 'joint' || titulaire === 'indivision') return 'indivis';
    return 'propre';
  }
  const nouvelActif = (s, o) => Object.assign({ id: uid('a'), etablissement: '', agence: '', titulaire: 'defunt', type: 'compte', numero: '', montant: null, propriete: proprieteDefaut(s, 'defunt'), part: '', soumis: true }, o || {});
  const partActif = (x) => (x.propriete === 'commun' ? '1/2' : x.propriete === 'indivis' ? (x.part || '1/2') : x.propriete === 'conjoint' ? '0' : '');
  // Imputation (art. 758-6) : usufruit évalué à la date du décès (à défaut, de l'acte).
  function imputation(s) {
    const age = E.ageAu(s.usufruitier.naissance, s.dateDeces || s.dateActe);
    if (age === null) return null;
    const u = E.usufruitParAge(A.store.engineParams('commun').bareme669, age);
    const x = E.complementConjoint(u);
    return { age, u, x };
  }
  const pctTexte = (f) => A.util.fmtNum(Math.round(f * 10000) / 100, 2).replace(/,00$/, '') + ' %';
  function partUsufruit(s) {
    if (s.option === 'quart') return '3/4';
    if (s.option === 'autre') return s.partUsufruit || '';
    if (s.option === 'complement') { const im = imputation(s); return im && im.x > 0 ? pctTexte(1 - im.x) : ''; }
    return '';
  }
  const montantBase = (o) => (typeof o.montantBase === 'number' ? o.montantBase : o.montant);
  const SENS = (o) => (o.credit ? 'credit' : 'debit');
  const LIB_FRAIS_QU = 'frais de convention de quasi-usufruit';

  // Données du calcul : base (comptes au décès ou prix de vente) et éléments retranchés.
  function donnees(s) {
    const base = s.cas !== 'vente'
      ? s.actif.filter((x) => x.soumis && x.propriete !== 'conjoint').map((x) => ({
        id: x.id, libelle: x.etablissement, montant: x.montant, part: partActif(x), groupe: x.propriete,
        compte: { etablissement: (x.etablissement || '').trim(), agence: (x.agence || '').trim(), titulaire: x.titulaire, type: x.type, numero: (x.numero || '').trim(), formule: x.formule || '' },
      }))
      : s.operations.filter((o) => o.action === 'base').map((o) => ({ id: o.id, libelle: o.libelle || o.libelleReleve, montant: montantBase(o), part: o.part }))
        .concat(s.base.map((x) => ({ id: x.id, libelle: x.libelle, montant: x.montant, part: x.part })));
    const operations = s.operations.filter((o) => o.action === 'retranche')
      .concat(s.fraisQU ? [{ id: 'frais-qu', action: 'retranche', libelle: LIB_FRAIS_QU, montant: s.fraisQU, repartition: 'totalite' }] : []);
    const im = s.cas !== 'vente' && s.option === 'complement' ? imputation(s) : null;
    const precisionUsufruit = im && im.x > 0
      ? 'Précision étant faite que la valeur de l\'usufruit du conjoint survivant, évaluée à ' + pctTexte(im.u) + ' eu égard à son âge, étant inférieure au quart en pleine propriété de ses droits légaux, la libéralité s\'impute sur ces droits et il lui est assuré un complément de ' + pctTexte(im.x) + ' en pleine propriété (article 758-6 du Code civil) ; ses droits en usufruit portent ainsi sur ' + pctTexte(1 - im.x) + ' des biens de la succession.'
      : '';
    return Object.assign({}, s, { base, operations, partUsufruit: s.cas !== 'vente' ? partUsufruit(s) : '', precisionUsufruit });
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
    // Succession : la base vient des comptes au décès (déclaration de succession) ; les encaissements du relevé sont sans effet.
    if (s.cas !== 'vente') s.operations.filter((o) => o.sens === 'credit').forEach((o) => { o.action = 'ignore'; o.verifier = false; });
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

  /* ---------- Lecture de la déclaration de succession (PDF) ---------- */
  async function importerDDS(ctx) {
    const fichier = await choisirFichier();
    if (!fichier) return;
    ui.toast('Lecture de la déclaration de succession…');
    let lu;
    try {
      lu = E.lireDDS(await pagesDuPdf(fichier));
    } catch (e) {
      console.error(e);
      return ui.toast('Lecture du PDF impossible : ' + e.message, 'error');
    }
    const s = ctx.state;
    if (!lu.comptes.length && !lu.regime && !lu.conjoint) return ui.toast('Ce PDF ne ressemble pas à une déclaration de succession (2705-SD).', 'error');
    if (s.actif.some((x) => x.montant !== null && x.montant !== undefined) && !(await ui.confirm('Remplacer les comptes ?', 'Les comptes déjà saisis seront remplacés par ceux de la déclaration.', 'Remplacer'))) return;
    s.cas = 'succession';
    if (lu.regime) s.regime = lu.regime;
    if (['usufruit', 'quart', 'complement'].includes(lu.option)) s.option = lu.option;
    if (lu.deces) s.dateDeces = lu.deces;
    if (!s.reference && lu.defunt) s.reference = 'Succession ' + lu.defunt;
    if (lu.conjoint) {
      if (!s.usufruitier.nom) s.usufruitier.nom = lu.conjoint.nom;
      if (lu.conjoint.naissance) s.usufruitier.naissance = lu.conjoint.naissance;
    }
    if (lu.heritiers.length && s.nus.every((x) => !x.nom)) s.nus = lu.heritiers.map((x) => Object.assign(nouveauNu(), { nom: x.nom, part: x.part }));
    // Comptes : origine d'après la section de la déclaration (actif de communauté ou biens propres).
    s.actif = lu.comptes.map((c) => nouvelActif(s, {
      etablissement: c.etablissement, agence: c.agence, titulaire: c.indivision ? 'indivision' : c.titulaire, type: c.type, numero: c.numero, montant: c.montant, formule: c.formule || '',
      propriete: c.section === 'communaute' ? 'commun' : c.part || c.titulaire === 'joint' ? 'indivis' : c.titulaire === 'conjoint' ? 'conjoint' : 'propre',
      part: c.section !== 'communaute' && (c.part || c.titulaire === 'joint') ? c.part || '1/2' : '',
    }));
    s.dds = { fichier: fichier.name, avertissements: lu.avertissements };
    ctx.render();
    ctx.changed();
    ui.toast(lu.comptes.length + ' compte' + (lu.comptes.length > 1 ? 's' : '') + ' repris de la déclaration. Vérifiez le régime, l\'option et les origines.');
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
    { subtitle: 'Noms repris de la déclaration de succession ou du relevé : à vérifier. « Répartition (barème) » : la part est partagée entre usufruitier et nu-propriétaire selon l\'âge, au lieu d\'un quasi-usufruit.' });

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
      if (s.actif.length && await ui.confirm('Appliquer le régime aux comptes ?', 'Recalculer l\'origine de chaque compte d\'après le régime et le titulaire ? Vous pourrez ensuite modifier compte par compte.', 'Appliquer')) {
        s.actif.forEach((x) => (x.propriete = proprieteDefaut(s, x.titulaire)));
      }
      ctx.render(); ctx.changed();
    } }));
    const option = h('div', { class: 'qu-option' },
      f('Option du conjoint', ctx.segmented(s, 'option', OPTIONS, { small: true, structural: true })),
      s.option === 'autre' ? f('Part de la succession en usufruit', ctx.text(s, 'partUsufruit', { placeholder: 'ex. 3/4' })) : null,
      s.option === 'complement' ? h('div', { class: 'stack-sm' },
        h('div', { class: 'grid-2' }, f('Date du décès', ctx.date(s, 'dateDeces'), { help: 'Âge de l\'usufruitier au décès, pour évaluer l\'usufruit.' })),
        ctx.live(() => {
          const im = imputation(s);
          if (!im) return ui.note('Indiquez la date de naissance du conjoint (Les parties) et la date du décès.', 'warn');
          return im.x > 0
            ? ui.note('Usufruit évalué à ' + pctTexte(im.u) + ' (' + im.age + ' ans), moins que le quart légal en pleine propriété (25 %) : complément de ' + pctTexte(im.x) + ' en pleine propriété (art. 758-6 C. civ.). Le quasi-usufruit porte sur ' + pctTexte(1 - im.x) + ' de la part de la succession.', 'info')
            : ui.note('Usufruit évalué à ' + pctTexte(im.u) + ' (' + im.age + ' ans) : il couvre le quart légal, pas de complément. Le quasi-usufruit porte sur la totalité.', 'info');
        })) : null);
    const lignes = s.actif.map((x) => h('div', { class: ['row-line', 'qu-compte', x.soumis && x.propriete !== 'conjoint' ? '' : 'qu-actif-hors'] },
      f('Banque', ctx.text(x, 'etablissement', { placeholder: 'ex. BNP PARIBAS' })),
      f('Agence', ctx.text(x, 'agence', { placeholder: 'ex. ORANGE (84100)' })),
      f('Titulaire', ui.selectInput({ value: x.titulaire, options: TITULAIRES, ariaLabel: 'Titulaire', onChange: (v) => { x.titulaire = v; x.propriete = proprieteDefaut(s, v); ctx.render(); ctx.changed(); } })),
      ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { s.actif.splice(s.actif.indexOf(x), 1); ctx.render(); ctx.changed(); } }),
      f('Compte', listeTexte(ctx, x, 'type', TYPES, 'ex. Livret A')),
      f('Numéro', ctx.text(x, 'numero')),
      f('Solde au décès', ctx.num(x, 'montant', { suffix: '€' })),
      f('Origine', ctx.select(x, 'propriete', PROPRIETES, { structural: true })),
      x.propriete === 'indivis' ? f('Quote-part du défunt', ctx.text(x, 'part', { placeholder: '1/2' })) : f('À la succession', ctx.live(() => {
        const fr = E.fraction(partActif(x));
        return h('div', { class: 'readonly' }, fmtEuro((fr === null ? 1 : fr) * (x.montant || 0)));
      })),
      f('Retenu', ui.yesNo(x.soumis, (v) => { x.soumis = v; ctx.render(); ctx.changed(); }, true))));
    return ui.card('Comptes bancaires au décès', h('div', { class: 'stack-sm' },
      h('div', { class: 'qu-import' },
        ui.button(s.dds ? 'Lire une autre déclaration' : 'Lire la déclaration de succession (PDF)', { icon: 'upload', variant: s.dds ? 'soft' : 'primary', onClick: () => importerDDS(ctx) }),
        h('span', { class: 'small muted' }, s.dds ? s.dds.fichier + ' · ' + s.actif.length + ' compte' + (s.actif.length > 1 ? 's' : '') : 'Comptes, régime matrimonial, option du conjoint et héritiers repris de la 2705-SD.')),
      ...(s.dds ? s.dds.avertissements.map((a) => ui.note(a, 'warn')) : []),
      h('div', { class: 'stack-sm' }, regime, option),
      h('div', { class: 'rows' }, lignes.length ? lignes : h('p', { class: 'small muted' }, 'Saisissez les comptes de la déclaration de succession (banque, compte, numéro, solde au décès).')),
      h('div', { class: 'chips' }, ui.button('Ajouter un compte', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.actif.push(nouvelActif(s, s.actif.length ? { etablissement: s.actif[s.actif.length - 1].etablissement, agence: s.actif[s.actif.length - 1].agence } : {})); ctx.render(); } })),
      ctx.live((r) => h('p', { class: 'small' }, 'Revenant à la succession : ', h('strong', null, fmtEuro(r.brutSuccession)),
        r.partUsufruit < 1 ? h('span', null, ' ; en usufruit du conjoint (' + (partUsufruit(s) || '') + ') : ', h('strong', null, fmtEuro(r.brut))) : null))),
    { subtitle: 'Base du quasi-usufruit : les comptes bancaires, avec leur solde au décès (déclaration de succession). Un compte commun revient pour moitié à la succession ; un compte propre du conjoint en est exclu. Les comptes d\'une même banque sont regroupés dans l\'acte.' });
  }
  // Champ texte avec propositions (liste de suggestions).
  function listeTexte(ctx, obj, key, valeurs, placeholder) {
    const id = uid('dl');
    const input = ctx.text(obj, key, { placeholder });
    input.setAttribute('list', id);
    return h('div', null, input, h('datalist', { id }, valeurs.map((v) => h('option', { value: v }))));
  }

  function tableOperations(ctx) {
    const s = ctx.state;
    const vente = s.cas === 'vente';
    const personnes = [{ value: '', label: 'Tous' }].concat(s.nus.map((x, i) => ({ value: x.id, label: x.nom || 'Nu-propriétaire ' + (i + 1) })));
    const effets = (o) => (o.sens === 'credit'
      ? (vente ? [{ value: 'base', label: 'Base de départ' }] : []).concat([{ value: 'ignore', label: 'Sans effet' }])
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
    const ops = s.operations.filter((o) => o.action !== 'base');
    const aVerifier = ops.filter((o) => o.verifier).length;
    const dejaConvention = s.fraisQU && s.operations.some((o) => o.action === 'retranche' && !o.manuel && /QUASI.?USUFRUIT/i.test(o.libelleReleve || ''));
    const ajouter = () => {
      s.operations.push({ id: uid('o'), manuel: true, date: '', libelleReleve: '', montant: null, sens: 'debit', details: [], action: 'retranche', libelle: '', repartition: 'totalite', nature: 'manuel', verifier: false, personne: '', part: '' });
      ctx.render();
    };
    return ui.card('Éléments à retrancher', h('div', { class: 'stack-sm' },
      aVerifier ? ui.note(aVerifier + ' ligne' + (aVerifier > 1 ? 's' : '') + ' à vérifier (en orange) : choisissez l\'effet puis cliquez sur la coche ✓ de la ligne.', 'warn') : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table table-input qu-ops' },
        h('thead', null, h('tr', null, tete.map((t) => h('th', null, t)))),
        h('tbody', null, ops.length ? ops.map(ligne) : h('tr', null, h('td', { colspan: tete.length, class: 'empty' }, 'Lisez le relevé de compte, ou ajoutez les éléments à la main.'))))),
      h('div', { class: 'row-line qu-frais-qu' },
        f('Frais du quasi-usufruit', ctx.num(s, 'fraisQU', { suffix: '€' }), { help: 'Frais de la convention, à prévoir : retranchés en totalité.' }),
        dejaConvention ? ui.note('Le relevé contient déjà des frais de convention de quasi-usufruit (retranchés) : ne les comptez pas deux fois.', 'warn') : h('span')),
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
  const enLettres = (x) => A.lettres.montant(Math.round(x * 100 + 1e-6) / 100, 'EUR', true).replace(/^ZÉRO/, 'ZERO').replace(/[\s\u00a0\u202f]EUR\)$/, ' €)');
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
    s.option = s.option || 'usufruit';
    // Anciens dossiers : la base de départ ou l'actif successoral deviennent des comptes.
    if (!Array.isArray(s.actif)) {
      s.actif = [];
      if (s.cas !== 'vente') {
        const prop = (part) => (/^1\s*\/\s*2$/.test(String(part || '').trim()) ? { propriete: 'commun' } : String(part || '').trim() ? { propriete: 'indivis', part } : { propriete: 'propre' });
        s.operations.filter((o) => o.action === 'base').forEach((o) => s.actif.push(Object.assign(nouvelActif(s, { etablissement: o.libelle || o.libelleReleve, montant: montantBase(o) }), prop(o.part))));
        s.base.forEach((x) => s.actif.push(Object.assign(nouvelActif(s, { etablissement: x.libelle, montant: x.montant }), prop(x.part))));
        s.base = [];
      }
    }
    s.actif = s.actif.filter((x) => x.nature !== 'immobilier').map((x) => Object.assign(nouvelActif(s), x, !x.etablissement && x.libelle ? { etablissement: x.libelle } : {}));
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
