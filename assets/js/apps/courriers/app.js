/*
 * Application « Courriers de succession » : lecture de l'acte de décès, fiche du défunt,
 * recherche des destinataires (annuaire de l'administration, carnet d'adresses de l'étude),
 * courriers rédigés sur le papier à en-tête de l'étude, téléchargés en Word ou en PDF.
 * L'acte est lu sur le poste. Seuls la commune et son code sont envoyés aux annuaires publics
 * (geo.api.gouv.fr et annuaire de service-public.fr), et seulement sur demande.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid, todayISO, slug } = A.util;
  const ui = A.ui;
  const E = A.engines.courriers;
  const X = A.engines.acteDeces;

  const app = {
    id: 'courriers',
    fileSuffix: 'courriers',
    title: 'Courriers de succession',
    caption: 'Acte de décès, banques, organismes',
    icon: 'mail',
    gradient: 'linear-gradient(150deg, #2f6b6b 0%, #5fa3a0 100%)',
  };

  const lieuVide = () => ({ commune: '', codePostal: '', departement: '', insee: '' });
  function empty() {
    return {
      reference: '',
      defunt: { civilite: 'M', prenoms: '', nom: '', naissance: Object.assign(lieuVide(), { date: '' }), deces: Object.assign(lieuVide(), { date: '' }), domicile: Object.assign(lieuVide(), { adresse: '' }) },
      situation: '', regime: '', conjoint: { civilite: 'Mme', prenoms: '', nom: '' },
      nosRef: '', clerc: { nom: '', email: '' }, signataire: '', dateCourrier: todayISO(),
      lecture: { fichier: '', statut: '', aVerifier: [] },
      destinataires: [nouveauDest('departement'), nouveauDest('tresor'), nouveauDest('retraite')],
      coches: {},
    };
  }
  function nouveauDest(type) {
    return { id: uid('d'), type, nom: '', lignes: '', email: '', telephone: '', vosRef: '', comptes: '', montant: null, numero: '', source: '', aVerifier: false };
  }
  const isEmpty = (s) => !s.defunt.nom && !s.reference && s.destinataires.every((d) => !d.lignes);
  const reference = (s) => s.reference || (s.defunt.nom ? 'Succession ' + s.defunt.nom.toUpperCase() : '');

  const params = () => {
    const p = A.store.getParams().courriers;
    return Object.assign({}, p, { carnet: E.carnetComplet(p.carnet, A.defaults.courriers.carnet, p.carnetSupprimes) });
  };
  // Copie dans le presse-papiers (adresse mail à coller dans la messagerie).
  async function copier(texte) {
    try {
      await navigator.clipboard.writeText(texte);
    } catch (e) {
      const t = h('textarea', { style: { position: 'fixed', left: '-1000px' } });
      t.value = texte;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    ui.toast('Copié : ' + texte);
  }
  const boutonCopier = (texte) => (texte ? ui.button('Copier', { icon: 'copy', variant: 'ghost', small: true, title: 'Copier l\'adresse mail', onClick: (e) => { e.preventDefault(); copier(texte); } }) : null);
  function compute(s) {
    const p = params();
    const modeles = E.modeles(p.modeles);
    const courriers = [];
    s.destinataires.forEach((d) => {
      E.modelesPour(d.type, modeles).forEach((m) => {
        const cle = d.id + ':' + m.id;
        const coche = s.coches[cle] !== undefined ? s.coches[cle] : m.id === E.PAR_DEFAUT[d.type];
        courriers.push({ cle, dest: d, modele: m, coche });
      });
    });
    return { courriers, modeles, papier: p.papier };
  }
  const dossierPourCourrier = (s) => Object.assign({}, s, { signataire: s.signataire || params().signataire || (params().papier && params().papier.signataire) || '' });
  const optionsCourrier = () => ({ ville: (params().papier && params().papier.ville) || '', signataire: params().signataire || (params().papier && params().papier.signataire) || '', rib: params().rib || '' });

  /* ---------- Petits composants ---------- */
  const f = (label, control, opts) => ui.field(label, control, opts);
  function zone(obj, key, ctx, opts) {
    const o = opts || {};
    const t = h('textarea', { class: 'input textarea', rows: o.rows || 4, placeholder: o.placeholder || '', 'aria-label': o.aria || null });
    t.value = obj[key] || '';
    t.addEventListener('input', () => { obj[key] = t.value; if (o.onInput) o.onInput(); ctx.changed(); });
    return t;
  }
  function attention(s, cle, texte) {
    return s.lecture.aVerifier.includes(cle) ? h('span', { class: 'tag tag-warn', title: 'Information lue dans l\'acte : à vérifier' }, '⚠ ' + (texte || 'à vérifier')) : null;
  }
  function verifie(ctx, cle) {
    const s = ctx.state;
    if (!s.lecture.aVerifier.includes(cle)) return null;
    return ui.button('C\'est vérifié', { icon: 'check', variant: 'soft', small: true, onClick: () => { s.lecture.aVerifier = s.lecture.aVerifier.filter((x) => x !== cle); ctx.render(); ctx.changed(); } });
  }
  const titreCarte = (s, cle, titre) => h('span', null, titre, attention(s, cle));

  /* ---------- Lecture de l'acte (pdf.js chargé à la demande) ---------- */
  let acteCourant = null; // { nom, type, url, pdf }
  function script(src) {
    return new Promise((ok, ko) => {
      if (document.querySelector('script[data-src="' + src + '"]')) return ok();
      const el = h('script', { src, 'data-src': src });
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
  async function texteDuPdf(fichier) {
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
    let texte = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      let y = null;
      tc.items.forEach((it) => {
        const yy = Math.round(it.transform[5]);
        texte += (y !== null && Math.abs(yy - y) > 3 ? '\n' : y !== null ? ' ' : '') + it.str;
        y = yy;
      });
      texte += '\n';
    }
    return { pdf, texte };
  }

  async function lireActe(ctx, fichier) {
    if (!fichier) return;
    const s = ctx.state;
    const estPdf = /pdf$/i.test(fichier.type) || /\.pdf$/i.test(fichier.name);
    const estImage = /^image\//.test(fichier.type);
    if (!estPdf && !estImage) return ui.toast('Format non reconnu : déposez un PDF ou une photo de l\'acte.', 'error');
    if (acteCourant && acteCourant.url) URL.revokeObjectURL(acteCourant.url);
    acteCourant = { nom: fichier.name, type: estPdf ? 'pdf' : 'image', url: URL.createObjectURL(fichier), pdf: null };
    let texte = '';
    if (estPdf) {
      try {
        const lu = await texteDuPdf(fichier);
        acteCourant.pdf = lu.pdf;
        texte = lu.texte;
      } catch (e) {
        ui.toast('Lecture du PDF impossible : ' + e.message, 'error');
      }
    }
    let r = X.analyser(texte);
    let parOcr = false;
    // Acte scanné ou photographié : reconnaissance de caractères sur le poste.
    if (r.vide) {
      const attente = attenteOcr();
      try {
        texte = await reconnaitre(await imagesActe(fichier, acteCourant.pdf), attente.etape);
        r = X.analyser(texte);
        parOcr = true;
      } catch (e) {
        console.error(e);
        ui.toast('Reconnaissance du texte impossible : ' + e.message, 'error');
      } finally {
        attente.fermer();
      }
    }
    s.lecture.fichier = fichier.name;
    if (r.vide) {
      s.lecture.statut = 'scan';
      s.lecture.aVerifier = ['identite', 'naissance', 'deces', 'domicile', 'situation'];
      ctx.render();
      ctx.changed();
      return ui.toast('Texte de l\'acte illisible (acte manuscrit ?) : saisissez les informations en vous aidant de l\'aperçu.', 'error');
    }
    const df = s.defunt;
    const poser = (cible, source, cles) => cles.forEach((k) => { if (source[k]) cible[k] = source[k]; });
    poser(df, r, ['civilite', 'prenoms', 'nom']);
    poser(df.naissance, r.naissance, ['date', 'commune', 'departement']);
    poser(df.deces, r.deces, ['date', 'commune', 'departement']);
    poser(df.domicile, r.domicile, ['adresse', 'commune', 'departement', 'codePostal']);
    if (r.situation) s.situation = r.situation;
    if (r.conjoint && r.conjoint.nom) Object.assign(s.conjoint, r.conjoint);
    if (!s.nosRef && df.nom) s.nosRef = 'Succession ' + df.nom.toUpperCase();
    s.lecture.statut = parOcr ? 'ocr' : 'texte';
    // Tout ce qui a été lu est à vérifier ; ce qui manque est signalé.
    s.lecture.aVerifier = ['identite', 'naissance', 'deces', 'domicile', 'situation'];
    ctx.render();
    ctx.changed();
    ui.toast(r.manquants.length ? 'Acte lu : complétez les informations signalées.' : 'Acte lu : vérifiez les informations.');
    completerCodes(ctx, true);
  }

  /* ---------- Reconnaissance de caractères (Tesseract, hors connexion) ---------- */
  let tesseract = null;
  async function moteurOcr() {
    if (!tesseract) {
      await script('assets/vendor/tesseract/tesseract-core-lstm.wasm.js');
      await script('assets/vendor/tesseract/fra-traineddata.js');
      const M = await root.TesseractCore();
      const gz = E.deBase64(root.ATELIER_TESSDATA_FRA);
      const donnees = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      M.FS.writeFile('/fra.traineddata', donnees);
      const api = new M.TessBaseAPI();
      if (api.Init('/', 'fra')) throw new Error('initialisation impossible');
      tesseract = { M, api };
    }
    return tesseract;
  }
  const canvasEnPng = (c) => new Promise((ok) => c.toBlob((b) => b.arrayBuffer().then((x) => ok(new Uint8Array(x))), 'image/png'));
  // Images des pages de l'acte (3 premières pages au plus), à une résolution adaptée à la lecture.
  async function imagesActe(fichier, pdf) {
    const out = [];
    if (pdf) {
      for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
        const page = await pdf.getPage(n);
        // Page scannée : l'image d'origine est lue telle quelle (meilleure reconnaissance qu'une page redessinée).
        const scan = await imageDeLaPage(page);
        if (scan) { out.push(await canvasEnPng(scan)); continue; }
        const vp = page.getViewport({ scale: 2.5 });
        const c = h('canvas', { width: Math.round(vp.width), height: Math.round(vp.height) });
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        out.push(await canvasEnPng(c));
      }
    } else {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('image illisible')); i.src = acteCourant.url; });
      const k = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = h('canvas', { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      out.push(await canvasEnPng(c));
    }
    return out;
  }
  // Image principale d'une page de PDF (scan) dans un canvas, à sa résolution d'origine ; null s'il n'y en a pas.
  async function imageDeLaPage(page) {
    try {
      const lib = await pdfjs();
      const ops = await page.getOperatorList();
      let meilleur = null;
      ops.fnArray.forEach((fn, i) => {
        if (fn !== lib.OPS.paintImageXObject) return;
        const [id, l, ht] = ops.argsArray[i];
        if (!meilleur || l * ht > meilleur.l * meilleur.ht) meilleur = { id, l, ht };
      });
      if (!meilleur || meilleur.l < 800) return null;
      const img = await new Promise((ok) => (page.objs.has(meilleur.id) ? ok(page.objs.get(meilleur.id)) : page.objs.get(meilleur.id, ok)));
      if (!img) return null;
      const c = h('canvas', { width: img.width, height: img.height });
      const g = c.getContext('2d');
      if (img.bitmap) g.drawImage(img.bitmap, 0, 0);
      else if (img.data) {
        const px = g.createImageData(img.width, img.height);
        const src = img.data, dst = px.data, nb = img.width * img.height;
        if (img.kind === 3) dst.set(src.subarray(0, nb * 4));
        else if (img.kind === 2) for (let k = 0, j = 0; k < nb; k++) { dst[j++] = src[k * 3]; dst[j++] = src[k * 3 + 1]; dst[j++] = src[k * 3 + 2]; dst[j++] = 255; }
        else return null;
        g.putImageData(px, 0, 0);
      } else return null;
      return c;
    } catch (e) {
      return null;
    }
  }
  const pause = () => new Promise((ok) => setTimeout(ok, 60));
  async function reconnaitre(images, etape) {
    etape('Préparation de la reconnaissance du texte…');
    await pause();
    const { M, api } = await moteurOcr();
    let texte = '';
    for (let i = 0; i < images.length; i++) {
      etape('Lecture de la page ' + (i + 1) + ' sur ' + images.length + '… (quelques secondes)');
      await pause();
      M.FS.writeFile('/input', images[i]);
      api.SetImageFile(1, 0);
      api.Recognize(null);
      texte += api.GetUTF8Text() + '\n';
    }
    return texte;
  }
  function attenteOcr() {
    const texte = h('p', null, 'Acte scanné : reconnaissance du texte en cours…');
    const overlay = h('div', { class: 'overlay' }, h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
      h('h3', { class: 'dialog-title' }, 'Lecture de l\'acte de décès'), h('div', { class: 'dialog-body' }, texte, h('p', { class: 'small muted' }, 'L\'acte est lu sur ce poste ; rien n\'est envoyé sur internet.'))));
    document.body.appendChild(overlay);
    return { etape: (t) => (texte.textContent = t), fermer: () => overlay.remove() };
  }

  /* ---------- Annuaires publics (sur demande, si le poste a accès à internet) ---------- */
  const GEO = 'https://geo.api.gouv.fr/communes';
  const ANNUAIRE = 'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records';
  const cleNom = (x) => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(le|la|les|l)\s+|['’ -]+/g, '');
  async function getJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Réponse ' + r.status);
    return r.json();
  }
  async function commune(l) {
    const champs = '&fields=nom,code,codesPostaux,codeDepartement&format=json';
    let liste = [];
    if (/^\d{5}$/.test(l.codePostal || '')) liste = await getJSON(GEO + '?codePostal=' + l.codePostal + champs);
    if (!liste.length && l.commune) liste = await getJSON(GEO + '?nom=' + encodeURIComponent(l.commune) + (l.departement ? '&codeDepartement=' + l.departement : '') + '&boost=population&limit=5' + champs);
    const c = liste.find((x) => cleNom(x.nom) === cleNom(l.commune)) || liste[0];
    return c ? { insee: c.code, codePostal: (l.codePostal && c.codesPostaux.includes(l.codePostal) ? l.codePostal : c.codesPostaux[0]) || '', departement: c.codeDepartement, commune: c.nom } : null;
  }
  async function completerCodes(ctx, silencieux) {
    const df = ctx.state.defunt;
    let ok = 0, ko = 0;
    for (const l of [df.domicile, df.naissance, df.deces]) {
      if (!l.commune || (l.codePostal && l.insee)) continue;
      try {
        const c = await commune(l);
        if (c) { Object.assign(l, { insee: c.insee, codePostal: l.codePostal || c.codePostal, departement: c.departement }); ok++; } else ko++;
      } catch (e) {
        ko++;
      }
    }
    if (ok) { ctx.render(); ctx.changed(); }
    if (!silencieux || ko) ui.toast(ko ? 'Codes postaux : ' + ko + ' commune(s) non trouvée(s) (pas d\'accès internet ?). Complétez-les à la main.' : 'Codes postaux complétés : à vérifier.', ko ? 'error' : '');
  }
  async function annuaire(where) {
    const r = await getJSON(ANNUAIRE + '?limit=100&where=' + encodeURIComponent(where));
    return r.results || [];
  }
  async function serviceAnnuaire(type, insee, dep) {
    let recs = [];
    try { recs = await annuaire('search(pivot, "' + insee + '")'); } catch (e) { recs = []; }
    let res = E.servicesCompetents(recs, insee, type);
    for (const piv of E.PIVOTS[type] || []) {
      if (res.length) break;
      try { recs = await annuaire('search(pivot, "' + piv + '") and startswith(code_insee_commune, "' + dep + '")'); } catch (e) { recs = []; }
      res = E.servicesCompetents(recs, insee, type);
    }
    return res[0] ? E.adresseService(res[0]) : null;
  }

  // Préremplit les adresses : carnet de l'étude d'abord, annuaire de l'administration ensuite.
  async function rechercherAdresses(ctx) {
    const s = ctx.state;
    const dom = s.defunt.domicile;
    if (!dom.commune) return ui.toast('Indiquez d\'abord la commune du domicile du défunt.', 'error');
    ui.toast('Recherche des adresses…');
    if (!dom.insee) {
      try {
        const c = await commune(dom);
        if (c) Object.assign(dom, { insee: c.insee, codePostal: dom.codePostal || c.codePostal, departement: c.departement });
      } catch (e) { /* hors connexion : carnet seulement */ }
    }
    let trouves = 0, absents = 0;
    for (const d of s.destinataires) {
      if (d.source === 'saisie' && d.lignes) continue;
      const c = E.suggestion(params().carnet, d.type, d.nom, dom.departement);
      if (c && (d.type !== 'banque' && d.type !== 'assurance' && d.type !== 'mutuelle' ? E.couvre(c, dom.departement) : true)) {
        Object.assign(d, { nom: c.nom, carnetId: c.id, recherche: d.recherche || d.nom, lignes: c.lignes, email: c.email || d.email, telephone: c.telephone || d.telephone, source: 'carnet', aVerifier: !E.couvre(c, dom.departement) });
        trouves++;
        continue;
      }
      if (E.PIVOTS[d.type] && dom.insee) {
        try {
          const a = await serviceAnnuaire(d.type, dom.insee, dom.departement);
          if (a) {
            Object.assign(d, { nom: a.nom, lignes: a.lignes.join('\n'), email: a.email || d.email, source: 'annuaire', aVerifier: true });
            trouves++;
            continue;
          }
        } catch (e) { /* annuaire indisponible */ }
      }
      if (!d.lignes) absents++;
    }
    ctx.render();
    ctx.changed();
    ui.toast(trouves + ' adresse(s) préremplie(s)' + (absents ? ', ' + absents + ' à saisir' : '') + '.', absents ? 'error' : '');
  }

  function memoriser(ctx, d) {
    const p = params();
    const dep = ctx.state.defunt.domicile.departement || '';
    const local = d.type === 'departement' || d.type === 'tresor' || d.type === 'retraite' || d.type === 'ehpad';
    const nom = d.nom || (d.lignes || '').split('\n')[0];
    const carnet = (p.carnet || []).slice();
    const i = carnet.findIndex((c) => c.type === d.type && cleNom(c.nom) === cleNom(nom) && (c.departement || '') === (local ? dep : c.departement || ''));
    const entree = { id: i >= 0 ? carnet[i].id : uid('c'), type: d.type, nom, departement: local ? dep : i >= 0 ? carnet[i].departement : '', lignes: d.lignes, email: d.email || '', telephone: d.telephone || '' };
    if (i >= 0) carnet[i] = entree; else carnet.push(entree);
    A.store.setParams('courriers', Object.assign({}, p, { carnet }));
    ui.toast('Adresse mémorisée dans le carnet de l\'étude.');
    ctx.render();
  }

  /* ---------- Onglet 1 : acte de décès et fiche ---------- */
  function apercuActe() {
    if (!acteCourant) return null;
    const cadre = h('div', { class: 'acte-apercu' });
    if (acteCourant.type === 'image') cadre.appendChild(h('img', { src: acteCourant.url, alt: 'Acte de décès' }));
    else if (acteCourant.pdf) {
      (async () => {
        for (let n = 1; n <= Math.min(acteCourant.pdf.numPages, 4); n++) {
          const page = await acteCourant.pdf.getPage(n);
          const vp = page.getViewport({ scale: 1.4 });
          const c = h('canvas', { width: vp.width, height: vp.height });
          cadre.appendChild(c);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        }
      })();
    } else cadre.appendChild(h('iframe', { src: acteCourant.url, title: 'Acte de décès' }));
    return cadre;
  }

  function lieuChamps(ctx, l, libelle, avecAdresse) {
    return [
      avecAdresse ? f('Adresse', ctx.text(l, 'adresse', { placeholder: 'ex. 12 rue des Lilas' }), { wide: true }) : null,
      f('Commune' + (libelle ? ' ' + libelle : ''), ctx.text(l, 'commune', { structural: true })),
      f('Code postal', ctx.text(l, 'codePostal', { placeholder: l.departement ? 'département ' + l.departement : '' })),
    ];
  }

  function tabActe(ctx) {
    const s = ctx.state;
    const df = s.defunt;
    const depot = h('div', { class: 'depot-zone' },
      ui.icon('upload', 26),
      h('div', null, h('strong', null, 'Déposez ici l\'acte de décès'), h('div', { class: 'small muted' }, 'PDF ou photo. Il est lu sur ce poste et n\'est pas conservé.')),
      ui.button('Choisir un fichier', { variant: 'soft', small: true, onClick: () => {
        const input = h('input', { type: 'file', accept: '.pdf,application/pdf,image/*' });
        input.addEventListener('change', () => lireActe(ctx, input.files && input.files[0]));
        input.click();
      } }));
    depot.ondragover = (e) => { e.preventDefault(); depot.classList.add('depot'); };
    depot.ondragleave = () => depot.classList.remove('depot');
    depot.ondrop = (e) => { e.preventDefault(); depot.classList.remove('depot'); lireActe(ctx, e.dataTransfer.files && e.dataTransfer.files[0]); };

    const etat = s.lecture.statut === 'scan'
      ? ui.note('⚠ Acte illisible (« ' + s.lecture.fichier + ' »), manuscrit par exemple : il ne peut pas être lu automatiquement. Saisissez les informations en vous aidant de l\'aperçu ; les rubriques à remplir sont signalées.', 'warn')
      : s.lecture.statut === 'ocr' ? ui.note('Acte scanné « ' + s.lecture.fichier + ' » lu par reconnaissance de caractères. Les rubriques marquées ⚠ ont été remplies automatiquement : comparez-les attentivement avec l\'aperçu (orthographe des noms, dates), puis cliquez sur « C\'est vérifié ».', 'warn')
      : s.lecture.statut === 'texte' ? ui.note('Acte « ' + s.lecture.fichier + ' » lu. Les rubriques marquées ⚠ ont été remplies à partir de l\'acte : vérifiez-les puis cliquez sur « C\'est vérifié ».') : null;

    const identite = ui.card(titreCarte(s, 'identite', 'Le défunt'), h('div', { class: 'grid-3' },
      f('Civilité', ctx.segmented(df, 'civilite', [{ value: 'M', label: 'Monsieur' }, { value: 'Mme', label: 'Madame' }], { small: true })),
      f('Prénoms', ctx.text(df, 'prenoms')),
      f('Nom', ctx.text(df, 'nom', { structural: true }))), { actions: verifie(ctx, 'identite') });
    const naissance = ui.card(titreCarte(s, 'naissance', 'Naissance'), h('div', { class: 'grid-3' },
      f('Date', ctx.date(df.naissance, 'date')), lieuChamps(ctx, df.naissance)), { actions: verifie(ctx, 'naissance') });
    const deces = ui.card(titreCarte(s, 'deces', 'Décès'), h('div', { class: 'grid-3' },
      f('Date', ctx.date(df.deces, 'date')), lieuChamps(ctx, df.deces)), { actions: verifie(ctx, 'deces') });
    const domicile = ui.card(titreCarte(s, 'domicile', 'Dernier domicile'), h('div', { class: 'stack-sm' },
      h('div', { class: 'grid-3' }, lieuChamps(ctx, df.domicile, null, true)),
      h('p', { class: 'small muted' }, 'Le domicile détermine le conseil départemental et le service des impôts compétents.')), {
      actions: [verifie(ctx, 'domicile'), ui.button('Compléter les codes postaux', { icon: 'search', variant: 'ghost', small: true, onClick: () => completerCodes(ctx) })] });

    const marie = s.situation === 'marie';
    const situation = ui.card(titreCarte(s, 'situation', 'Situation familiale'), h('div', { class: 'stack-sm' },
      f('Situation', ctx.select(s, 'situation', [{ value: '', label: '— Choisir —' }, { value: 'marie', label: 'Marié(e)' }, { value: 'pacse', label: 'Pacsé(e)' }, { value: 'veuf', label: 'Veuf / veuve' }, { value: 'divorce', label: 'Divorcé(e)' }, { value: 'celibataire', label: 'Célibataire' }], { structural: true })),
      s.situation && s.situation !== 'celibataire' ? h('div', { class: 'grid-3' },
        f(marie ? 'Conjoint' : s.situation === 'pacse' ? 'Partenaire' : 'Ex-conjoint / conjoint prédécédé', ctx.segmented(s.conjoint, 'civilite', [{ value: 'M', label: 'Monsieur' }, { value: 'Mme', label: 'Madame' }], { small: true })),
        f('Prénoms', ctx.text(s.conjoint, 'prenoms')), f('Nom', ctx.text(s.conjoint, 'nom'))) : null,
      marie ? h('div', { class: 'grid-2' }, f(h('span', null, 'Régime matrimonial', !s.regime ? h('span', { class: 'tag tag-warn' }, '⚠ à préciser') : null), regimeChoix(ctx), { help: 'Il ne figure pas dans l\'acte de décès.' })) : null), { actions: verifie(ctx, 'situation') });

    const pClercs = params().clercs || [];
    const dossier = ui.card('Le dossier', h('div', { class: 'grid-3' },
      f('Nos références', ctx.text(s, 'nosRef', { placeholder: 'ex. Succession MARTIN - NN' })),
      f('Dossier suivi par', clercChoix(ctx, pClercs)),
      f('Courriel', ctx.text(s.clerc, 'email')),
      f('Date des courriers', ctx.date(s, 'dateCourrier')),
      f('Signataire', ctx.text(s, 'signataire', { placeholder: params().signataire || (params().papier && params().papier.signataire) || 'Maître …' }))));

    return h('div', { class: 'acte-layout' + (acteCourant ? ' avec-apercu' : '') },
      h('div', { class: 'stack' }, depot, etat, identite, naissance, deces, domicile, situation, dossier),
      acteCourant ? h('div', { class: 'acte-cote' }, h('div', { class: 'acte-cote-titre small muted' }, acteCourant.nom), apercuActe()) : null);
  }
  function regimeChoix(ctx) {
    const s = ctx.state;
    const input = h('input', { class: 'input', list: 'regimes-liste', value: s.regime || '', placeholder: 'ex. communauté de biens réduite aux acquêts' });
    input.addEventListener('input', () => { s.regime = input.value; ctx.changed(); });
    input.addEventListener('change', () => ctx.render());
    return h('div', null, input, h('datalist', { id: 'regimes-liste' }, E.REGIMES.map((r) => h('option', { value: r }))));
  }
  function clercChoix(ctx, clercs) {
    const s = ctx.state;
    const input = h('input', { class: 'input', list: 'clercs-liste', value: s.clerc.nom || '' });
    input.addEventListener('input', () => {
      s.clerc.nom = input.value;
      const c = clercs.find((x) => x.nom === input.value);
      if (c && c.email && !s.clerc.email) { s.clerc.email = c.email; ctx.render(); }
      ctx.changed();
    });
    input.addEventListener('change', () => {
      // Mémorise la personne (et son courriel) pour les prochains dossiers.
      const nom = input.value.trim();
      if (!nom) return;
      const p = params();
      const liste = (p.clercs || []).filter((x) => x.nom !== nom).concat([{ nom, email: s.clerc.email || '' }]);
      A.store.setParams('courriers', Object.assign({}, p, { clercs: liste.slice(-12) }));
    });
    return h('div', null, input, h('datalist', { id: 'clercs-liste' }, clercs.map((c) => h('option', { value: c.nom }))));
  }

  /* ---------- Onglet 2 : destinataires ---------- */
  const NOMS_BANQUES = ['La Banque Postale', 'Crédit Agricole', 'Caisse d\'Épargne', 'Banque Populaire', 'BNP Paribas', 'Société Générale', 'LCL', 'Crédit Mutuel', 'CIC', 'Banque de France', 'Boursorama', 'ING', 'Hello bank!'];
  function tabDestinataires(ctx) {
    const s = ctx.state;
    const carnet = params().carnet || [];
    const groupe = (types, titre, sous, ajout) => {
      const liste = s.destinataires.filter((d) => types.includes(d.type));
      return ui.card(titre, h('div', { class: 'stack-sm' },
        liste.length ? h('div', { class: 'rows' }, liste.map((d) => ligneDest(ctx, d, carnet))) : h('p', { class: 'muted' }, 'Aucun pour l\'instant.'),
        ajout ? h('div', { class: 'chips' }, ajout.map(([type, libelle]) => ui.button(libelle, { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.destinataires.push(nouveauDest(type)); ctx.render(); ctx.changed(); } }))) : null), { subtitle: sous });
    };
    return h('div', { class: 'stack' },
      ui.note(h('span', null, 'Les adresses sont proposées à partir du domicile du défunt : d\'abord celles du ', h('strong', null, 'carnet de l\'étude'), ', puis l\'annuaire officiel de l\'administration (service-public.fr, accès internet nécessaire ; seule la commune est transmise). Chaque adresse reste modifiable ; « Mémoriser » l\'enregistre dans le carnet pour les prochains dossiers.')),
      h('div', null, ui.button('Rechercher les adresses', { icon: 'search', variant: 'primary', onClick: () => rechercherAdresses(ctx) })),
      groupe(['departement', 'tresor', 'retraite', 'ehpad'], 'Organismes', 'Conseil départemental et service des impôts du domicile ; caisse de retraite ; maison de retraite.', [['retraite', 'Caisse de retraite'], ['ehpad', 'Maison de retraite'], ['departement', 'Conseil départemental'], ['tresor', 'Trésor public']]),
      groupe(['banque', 'assurance', 'mutuelle'], 'Banques, assurances et mutuelles', 'Indiquez le nom de l\'établissement : l\'adresse du carnet (service successions) est proposée.', [['banque', 'Banque'], ['assurance', 'Assurance-vie'], ['mutuelle', 'Mutuelle']]),
      groupe(['autre'], 'Autres destinataires', null, [['autre', 'Autre destinataire']]),
      h('datalist', { id: 'noms-etablissements' }, Array.from(new Set(carnet.filter((c) => ['banque', 'assurance', 'mutuelle'].includes(c.type)).map((c) => c.nom).concat(NOMS_BANQUES))).map((n) => h('option', { value: n }))));
  }
  function ligneDest(ctx, d, carnet) {
    const s = ctx.state;
    const T = E.typeDe(d.type);
    const etab = ['banque', 'assurance', 'mutuelle'].includes(d.type);
    const nom = h('input', { class: 'input', list: etab ? 'noms-etablissements' : null, value: d.nom || '', placeholder: etab ? 'ex. Crédit Agricole' : T.libelle });
    const appliquer = (c) => Object.assign(d, { nom: c.nom, carnetId: c.id, lignes: c.lignes, email: c.email || '', telephone: c.telephone || '', source: 'carnet', aVerifier: !E.couvre(c, s.defunt.domicile.departement) });
    nom.addEventListener('input', () => { d.nom = nom.value; d.recherche = nom.value; ctx.changed(); });
    nom.addEventListener('change', () => {
      if (d.source === 'saisie' && d.lignes) return;
      const c = E.suggestion(carnet, d.type, d.nom, s.defunt.domicile.departement);
      if (c) appliquer(c);
      ctx.render();
      ctx.changed();
    });
    // Plusieurs services (régionaux) pour le même établissement : choix de l'adresse.
    const choix = etab ? E.candidats(carnet, d.type, d.recherche || d.nom) : [];
    const selecteur = choix.length > 1 ? f('Adresse du carnet', ui.selectInput({
      value: d.carnetId || '', options: [{ value: '', label: '— Choisir —' }].concat(choix.map((c) => ({ value: c.id, label: c.nom + (c.departement ? ' — ' + c.departement : '') }))),
      onChange: (v) => { const c = choix.find((x) => x.id === v); if (c) { appliquer(c); ctx.render(); ctx.changed(); } },
    }), { help: choix.length + ' services pour cet établissement.' }) : null;
    const adresse = zone(d, 'lignes', ctx, { rows: 4, placeholder: 'Nom du destinataire\nService\nAdresse\nCode postal VILLE', aria: 'Adresse', onInput: () => { d.source = 'saisie'; d.aVerifier = false; } });
    const origine = d.source === 'annuaire' ? h('span', { class: 'tag tag-warn' }, '⚠ annuaire : à vérifier')
      : d.source === 'carnet' ? h('span', { class: d.aVerifier ? 'tag tag-warn' : 'tag' }, d.aVerifier ? '⚠ carnet (autre département)' : 'carnet de l\'étude')
        : !d.lignes ? h('span', { class: 'tag tag-warn' }, '⚠ adresse à saisir') : null;
    const supp = ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { s.destinataires = s.destinataires.filter((x) => x !== d); ctx.render(); ctx.changed(); } });
    return h('div', { class: 'dest-ligne' },
      h('div', { class: 'dest-tete' }, h('strong', null, T.libelle), origine, h('span', { class: 'dest-actions' },
        d.lignes ? ui.button('Mémoriser', { icon: 'book', variant: 'ghost', small: true, onClick: () => memoriser(ctx, d), title: 'Enregistrer cette adresse dans le carnet de l\'étude' }) : null, supp)),
      h('div', { class: 'grid-2' },
        h('div', { class: 'stack-sm' },
          f(etab ? 'Établissement' : 'Nom', nom),
          selecteur,
          f('Vos références', ctx.text(d, 'vosRef')),
          d.type === 'banque' ? f('Numéros de compte', zone(d, 'comptes', ctx, { rows: 2, placeholder: 'un numéro par ligne' }), { help: 'Repris dans le courrier de déblocage.' }) : null,
          d.type === 'banque' ? f('Montant de l\'acompte', ctx.num(d, 'montant', { suffix: '€' }), { help: 'Pour la demande d\'acompte.' }) : null,
          d.type === 'retraite' ? f('N° d\'immatriculation', ctx.text(d, 'numero')) : null),
        h('div', { class: 'stack-sm' }, f('Adresse', adresse),
          f('Adresse mail', h('div', { class: 'champ-copie' }, ctx.text(d, 'email'), boutonCopier(d.email)), { help: 'Pour envoyer le courrier en pièce jointe.' }),
          f('Téléphone', ctx.text(d, 'telephone')))));
  }

  /* ---------- Mise en page d'un courrier (aperçu, impression, PDF) ---------- */
  const MM = 96 / 25.4;
  function segmentsHtml(segs) {
    return (segs || []).map((x) => h('span', { style: { fontWeight: x.b ? '700' : null, fontStyle: x.i ? 'italic' : null, textDecoration: x.u ? 'underline' : null } }, x.t));
  }
  function papierHtml(papier) {
    return (papier.elements || []).map((e) => {
      const pos = { left: e.x + 'mm', top: e.y + 'mm', width: e.l + 'mm', height: e.h + 'mm' };
      if (e.type === 'image') return h('img', { class: 'lp-img', src: 'data:' + e.mime + ';base64,' + e.base64, alt: '', style: pos });
      if (e.type === 'trait') return h('div', { class: e.h > e.l ? 'lp-trait lp-v' : 'lp-trait lp-h', style: pos });
      return h('div', { class: 'lp-texte', style: Object.assign({}, pos, { height: null, minHeight: e.h + 'mm' }) }, e.paragraphes.map((p) => {
        const taille = (p.segments[0] && p.segments[0].taille) || p.taille || 10;
        return h('p', { style: { textAlign: p.align === 'both' ? 'justify' : p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'left', fontSize: taille + 'pt', minHeight: taille * 1.15 + 'pt' } },
          p.segments.map((x) => h('span', { style: { fontWeight: x.b ? '700' : null, fontStyle: x.i ? 'italic' : null, textDecoration: x.u ? 'underline' : null, fontSize: x.taille ? x.taille + 'pt' : null } }, x.t)));
      }));
    });
  }
  // Blocs du courrier, dans l'ordre ; { el, saut } (saut : nouvelle page avant le bloc).
  function blocs(c) {
    const out = [];
    const p = (cls, segs) => h('p', { class: cls }, segmentsHtml(segs));
    out.push({ el: h('div', { class: 'lc-dest' }, c.destinataire.map((l, i) => h('div', { style: { fontWeight: i === 0 || /^\d{5}\s|cedex/i.test(l) ? '700' : null } }, l))) });
    out.push({ el: h('div', { class: 'lc-date' }, c.lieuDate) });
    out.push({ el: h('div', { class: 'lc-refs' }, c.references.map((l) => h('div', null, l))) });
    out.push({ el: h('div', { class: 'lc-succession' }, c.succession.map((l) => h('div', null, segmentsHtml(l)))) });
    c.avant.forEach((l) => out.push({ el: p('lc-ref', l) }));
    out.push({ el: h('p', { class: 'lc-appel' }, c.appel) });
    c.corps.forEach((l) => out.push({ el: l.length ? p('lc-p', l) : h('p', { class: 'lc-vide' }, ' ') }));
    if (c.signature) out.push({ el: h('p', { class: 'lc-signature' }, c.signature) });
    if (c.rib) out.push({ el: h('div', { class: 'lc-rib' }, h('div', { style: { fontWeight: '700' } }, 'COORDONNÉES BANCAIRES DE L\'OFFICE NOTARIAL :'), c.rib.map((l) => h('div', null, l || ' '))) });
    if (c.annexe) {
      out.push({ saut: true, el: h('div', { class: 'lc-annexe-tete' }, c.annexe.entete.map((l) => h('div', null, l))) });
      out.push({ el: h('p', { class: 'lc-annexe-titre' }, c.annexe.titre) });
      c.annexe.corps.forEach((l) => out.push({ el: l.length ? p('lc-p', l) : h('p', { class: 'lc-vide' }, ' ') }));
    }
    return out;
  }
  // Pages A4 d'un courrier ; les blocs qui ne tiennent pas passent sur la page suivante.
  function pagesCourrier(c, papier) {
    const m = papier ? papier.marges : { haut: 25, gauche: 25, droite: 20, bas: 20 };
    const largeur = 210 - m.gauche - m.droite;
    const hauteur = 297 - m.haut - m.bas;
    const page = (premiere) => {
      const corps = h('div', { class: 'lc-corps', style: { left: m.gauche + 'mm', top: m.haut + 'mm', width: largeur + 'mm' } });
      const el = h('div', { class: 'lettre-page' }, premiere && papier ? papierHtml(papier) : null, corps);
      return { el, corps };
    };
    const mesure = h('div', { class: 'lettre-mesure', style: { width: largeur + 'mm' } });
    document.body.appendChild(mesure);
    const pages = [page(true)];
    let utilise = 0;
    try {
      blocs(c).forEach((b) => {
        mesure.replaceChildren(b.el);
        const st = getComputedStyle(b.el);
        const hMm = (b.el.getBoundingClientRect().height + parseFloat(st.marginTop || 0) + parseFloat(st.marginBottom || 0)) / MM;
        if (b.saut || (utilise + hMm > hauteur && utilise > 0)) {
          pages.push(page(false));
          utilise = 0;
        }
        pages[pages.length - 1].corps.appendChild(b.el);
        utilise += hMm;
      });
    } finally {
      mesure.remove();
    }
    return pages.map((x) => x.el);
  }

  /* ---------- Onglet 3 : courriers ---------- */
  let apercuCle = null;
  function tabCourriers(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' }, ctx.live((r) => {
      const liste = r.courriers;
      if (!s.destinataires.length) return ui.note('Ajoutez des destinataires dans l\'onglet précédent.', 'warn');
      const coches = liste.filter((x) => x.coche);
      const groupes = s.destinataires.map((d) => {
        const lignes = liste.filter((x) => x.dest === d);
        const qui = d.nom || (d.lignes || '').split('\n')[0] || E.typeDe(d.type).libelle;
        return h('div', { class: 'courrier-groupe' },
          h('div', { class: 'courrier-dest' }, h('strong', null, qui), h('span', { class: 'muted small' }, ' · ' + E.typeDe(d.type).libelle), !d.lignes ? h('span', { class: 'tag tag-warn' }, '⚠ adresse manquante') : null,
            d.email ? h('span', { class: 'courrier-mail' }, h('span', { class: 'small' }, d.email), boutonCopier(d.email)) : null),
          lignes.map((x) => {
            const cb = h('input', { type: 'checkbox', checked: x.coche || null, 'aria-label': x.modele.titre });
            cb.addEventListener('change', () => { s.coches[x.cle] = cb.checked; ctx.changed(); });
            return h('label', { class: ['courrier-ligne', x.coche ? 'is-on' : ''] }, cb,
              h('span', { class: 'courrier-titre' }, x.modele.titre, x.modele.provisoire ? h('span', { class: 'tag tag-warn', title: 'Trame rédigée en attendant celle de l\'étude' }, 'trame provisoire') : null),
              ui.button('Aperçu', { variant: 'ghost', small: true, onClick: (e) => { e.preventDefault(); apercuCle = x.cle; ctx.changed(); } }));
          }));
      });
      const choisi = liste.find((x) => x.cle === apercuCle) || coches[0];
      const apercu = choisi ? apercuCourrier(s, choisi) : h('p', { class: 'muted' }, 'Cochez un courrier pour le voir ici.');
      return h('div', { class: 'courriers-layout' },
        h('div', { class: 'stack-sm' },
          ui.card('Courriers à préparer', h('div', { class: 'stack-sm' }, groupes), { subtitle: 'Cochez les courriers à télécharger ; ils seront rattachés au dossier.' }),
          ui.card('Télécharger la sélection', h('div', { class: 'stack-sm' },
            h('p', { class: 'small' }, coches.length + ' courrier' + (coches.length > 1 ? 's' : '') + ' sélectionné' + (coches.length > 1 ? 's' : '') + '.'),
            h('div', { class: 'chips' },
              ui.button('En Word (.docx)', { icon: 'save', variant: 'primary', disabled: !coches.length, onClick: () => telecharger(ctx, coches, 'docx') }),
              ui.button('En PDF', { icon: 'save', variant: 'soft', disabled: !coches.length, onClick: () => telecharger(ctx, coches, 'pdf') })),
            h('label', { class: 'small check-line' }, regrouperCase(), ' Regrouper dans un seul fichier .zip'),
            !params().paquet ? ui.note('Papier à en-tête non importé : les courriers Word sont créés sans en-tête. Importez un courrier Word de l\'étude dans l\'onglet « Modèles ».', 'warn') : null))),
        h('div', { class: 'courrier-apercu' }, choisi ? h('div', { class: 'small muted apercu-titre' }, choisi.modele.titre + ' — ' + (choisi.dest.nom || E.typeDe(choisi.dest.type).libelle)) : null, apercu));
    }));
  }
  let regrouper = false;
  function regrouperCase() {
    const cb = h('input', { type: 'checkbox', checked: regrouper || null });
    cb.addEventListener('change', () => (regrouper = cb.checked));
    return cb;
  }
  function apercuCourrier(s, x) {
    const c = E.rediger(dossierPourCourrier(s), x.dest, x.modele, optionsCourrier());
    const pages = pagesCourrier(c, params().papier);
    return h('div', { class: 'apercu-pages' },
      c.manquants.length ? ui.note('Informations manquantes dans ce courrier : ' + c.manquants.join(', ') + ' (« ...... » dans le texte).', 'warn') : null,
      pages.map((p) => h('div', { class: 'apercu-page' }, p)));
  }

  function telechargerBlob(blob, nom) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: nom });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function telecharger(ctx, coches, format) {
    const s = ctx.state;
    const d = dossierPourCourrier(s);
    const opts = optionsCourrier();
    const fichiers = {};
    ui.toast('Préparation de ' + coches.length + ' courrier(s)…');
    try {
      const paquet = format === 'docx' ? await E.ouvrirPaquet(params().paquet) : null;
      for (const x of coches) {
        const c = E.rediger(d, x.dest, x.modele, opts);
        let nom = E.nomFichier(d, x.dest, x.modele, format);
        while (fichiers[nom]) nom = nom.replace(/(\.\w+)$/, ' (2)$1');
        if (format === 'docx') fichiers[nom] = E.docx(c, paquet);
        else fichiers[nom] = new Uint8Array(await (await A.pdf.pagesA4(pagesCourrier(c, params().papier))).arrayBuffer());
      }
      const noms = Object.keys(fichiers);
      const type = format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
      if (regrouper && noms.length > 1) telechargerBlob(new Blob([A.zip.ecrire(fichiers)], { type: 'application/zip' }), 'Courriers - ' + (slug(reference(s)) || 'succession') + '.zip');
      else noms.forEach((n, i) => setTimeout(() => telechargerBlob(new Blob([fichiers[n]], { type }), n), i * 350));
      ui.toast(noms.length + ' courrier(s) enregistré(s) dans vos téléchargements.');
    } catch (e) {
      console.error(e);
      ui.toast('Création impossible : ' + e.message, 'error');
    }
  }

  /* ---------- Onglet 4 : modèles et papier à en-tête ---------- */
  let modeleSel = E.MODELES[0].id;
  function tabModeles(ctx) {
    const p = params();
    const importer = () => {
      const input = h('input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      input.addEventListener('change', async () => {
        const fichier = input.files && input.files[0];
        if (!fichier) return;
        try {
          const r = await E.importerPapier(new Uint8Array(await fichier.arrayBuffer()));
          const q = params();
          A.store.setParams('courriers', Object.assign({}, q, { papier: r.papier, paquet: r.paquet, nomPapier: fichier.name, signataire: q.signataire || r.papier.signataire }));
          ui.toast('Papier à en-tête importé.');
          ctx.render();
        } catch (e) {
          ui.toast(e.message, 'error');
        }
      });
      input.click();
    };
    const papier = ui.card('Papier à en-tête', h('div', { class: 'stack-sm' },
      p.papier ? h('div', { class: 'papier-resume' },
        h('div', { class: 'papier-mini' }, h('div', { class: 'lettre-page' }, papierHtml(p.papier))),
        h('div', { class: 'stack-sm' },
          h('p', null, 'Importé depuis « ', h('strong', null, p.nomPapier || 'courrier Word'), ' ». Les courriers Word reprennent exactement ce papier ; les PDF le reproduisent.'),
          f('Ville de l\'étude (« ORANGE, le … »)', ui.textInput({ value: p.papier.ville, onChange: (v) => A.store.setParams('courriers', Object.assign({}, params(), { papier: Object.assign({}, params().papier, { ville: v }) })) })),
          f('Signataire', ui.textInput({ value: p.signataire || p.papier.signataire, onChange: (v) => A.store.setParams('courriers', Object.assign({}, params(), { signataire: v })) })))) : ui.note('Importez un courrier Word de l\'étude (n\'importe lequel) : son en-tête, sa colonne de gauche et son pied de page serviront à tous les courriers. Le texte du courrier importé n\'est pas conservé.'),
      f('Coordonnées bancaires de l\'étude (RIB)', ribZone(), { help: 'Ajoutées sous la signature des courriers qui le prévoient (déblocage, acompte, maison de retraite). Enregistrées sur ce poste uniquement.' }),
      h('div', { class: 'chips' }, ui.button(p.papier ? 'Remplacer le papier à en-tête' : 'Importer un courrier Word de l\'étude', { icon: 'upload', variant: p.papier ? 'ghost' : 'primary', small: !!p.papier, onClick: importer }))),
    { subtitle: 'Enregistré sur ce poste ; inclus dans l\'export des paramètres pour vos collègues.' });

    const modeles = E.modeles(p.modeles);
    const m = modeles.find((x) => x.id === modeleSel) || modeles[0];
    const liste = h('div', { class: 'card trame-liste' }, E.TYPES.map((t) => {
      const ms = modeles.filter((x) => x.type === t.id);
      return ms.length ? [h('div', { class: 'trame-groupe' }, t.pluriel), ms.map((x) => h('button', { type: 'button', class: ['trame-item', x.id === m.id ? 'is-active' : ''], onclick: () => { modeleSel = x.id; ctx.render(); } },
        x.titre.replace(/^[^—]*—\s*/, ''), x.modifie ? h('span', { class: 'tag tag-accent' }, 'modifié') : x.provisoire ? h('span', { class: 'tag tag-warn' }, 'provisoire') : null))] : null;
    }));
    const sauver = (champ, valeur) => {
      const q = params();
      const perso = Object.assign({}, q.modeles);
      const origine = E.MODELES.find((x) => x.id === m.id);
      const cur = Object.assign({ appel: origine.appel, texte: origine.texte }, perso[m.id] || {}, { [champ]: valeur });
      if (cur.appel === origine.appel && cur.texte === origine.texte) delete perso[m.id];
      else perso[m.id] = { appel: cur.appel, texte: cur.texte };
      A.store.setParams('courriers', Object.assign({}, q, { modeles: perso }));
      ctx.changed();
    };
    const appel = ui.textInput({ value: m.appel, onChange: A.util.debounce((v) => sauver('appel', v), 300) });
    const texte = h('textarea', { class: 'input textarea trame-editeur', rows: 16, spellcheck: 'true' });
    texte.value = m.texte;
    texte.addEventListener('input', A.util.debounce(() => sauver('texte', texte.value), 300));
    const inserer = (v) => { texte.setRangeText(v, texte.selectionStart, texte.selectionEnd, 'end'); texte.focus(); sauver('texte', texte.value); };
    const VARS = [['defunt', 'Monsieur Paul MARTIN'], ['le_defunt', 'le défunt / la défunte'], ['date_deces', 'date du décès'], ['lieu_deces', 'commune du décès'], ['conjoint', 'conjoint ou partenaire'], ['comptes', 'numéros de compte'], ['montant', 'montant de l\'acompte en lettres et en chiffres'], ['numero_retraite', 'numéro d\'assuré'], ['destinataire', 'nom du destinataire'], ['notaire', 'signataire']];
    const editeur = ui.card(m.titre, h('div', { class: 'stack-sm' },
      m.provisoire && !m.modifie ? ui.note('Trame provisoire, rédigée en attendant celle de l\'étude : remplacez le texte par le vôtre.', 'warn') : null,
      f('Formule d\'appel', appel),
      f('Texte du courrier', texte, { help: 'Le bloc « SUCCESSION DE », les références, la date et la signature sont ajoutés automatiquement.' }),
      h('div', { class: 'var-chips' }, VARS.map(([n, d]) => h('button', { type: 'button', class: 'var-chip', title: d, onclick: () => inserer('{' + n + '}') }, '{' + n + '}')),
        h('button', { type: 'button', class: 'var-chip', title: 'Accord selon le défunt', onclick: () => inserer('{accord : le défunt | la défunte}') }, '{accord : … | … }')),
      h('p', { class: 'small muted' }, 'Chaque ligne est un paragraphe. **texte** : en gras. {si comptes} … {fin} : passage écrit seulement si la donnée existe.'),
      m.modifie ? ui.button('Rétablir le texte d\'origine', { icon: 'reset', variant: 'ghost', small: true, onClick: async () => {
        if (!(await ui.confirm('Rétablir le texte d\'origine ?', 'Vos modifications de ce modèle seront perdues.', 'Rétablir'))) return;
        const q = params();
        const perso = Object.assign({}, q.modeles);
        delete perso[m.id];
        A.store.setParams('courriers', Object.assign({}, q, { modeles: perso }));
        ctx.render();
      } }) : null));
    return h('div', { class: 'stack' }, papier, h('div', { class: 'trames' }, liste, editeur));
  }

  function ribZone() {
    const t = h('textarea', { class: 'input textarea', rows: 6, placeholder: 'Banque : …\nTitulaire : …\nIBAN : …\nBIC : …' });
    t.value = params().rib || '';
    t.addEventListener('input', A.util.debounce(() => A.store.setParams('courriers', Object.assign({}, A.store.getParams().courriers, { rib: t.value })), 400));
    return t;
  }

  /* ---------- Onglet 5 : carnet d'adresses ---------- */
  function tabCarnet(ctx) {
    const p = params();
    const carnet = (p.carnet || []).slice();
    const enregistrer = A.util.debounce(() => A.store.setParams('courriers', Object.assign({}, params(), { carnet })), 400);
    const lignes = E.TYPES.map((t) => {
      const q = filtreCarnet.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const items = carnet.filter((c) => c.type === t.id && (!q || [c.nom, c.lignes, c.email].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)));
      if (!items.length) return null;
      return [h('h4', { class: 'form-sub' }, t.pluriel), h('div', { class: 'rows' }, items.map((c) => {
        const nom = ui.textInput({ value: c.nom, onChange: (v) => { c.nom = v; enregistrer(); } });
        const dep = ui.textInput({ value: c.departement || '', placeholder: 'tous', onChange: (v) => { c.departement = v.trim(); enregistrer(); } });
        const adr = h('textarea', { class: 'input textarea', rows: 4 });
        adr.value = c.lignes || '';
        adr.addEventListener('input', () => { c.lignes = adr.value; enregistrer(); });
        const mail = ui.textInput({ value: c.email || '', onChange: (v) => { c.email = v; enregistrer(); } });
        const tel = ui.textInput({ value: c.telephone || '', onChange: (v) => { c.telephone = v; enregistrer(); } });
        return h('div', { class: 'row-line carnet-ligne' },
          h('div', { class: 'stack-sm' }, f('Nom', nom), f('Départements', dep, { help: 'Ex. « 13, 84 ». Vide : proposé quel que soit le domicile.' }), f('Adresse mail', mail), f('Téléphone', tel)),
          f('Adresse', adr),
          ui.button('Supprimer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: async () => {
            if (!(await ui.confirm('Supprimer cette adresse ?', c.nom, 'Supprimer'))) return;
            const q = A.store.getParams().courriers;
            const fournie = A.defaults.courriers.carnet.some((x) => x.id === c.id);
            A.store.setParams('courriers', Object.assign({}, q, { carnet: carnet.filter((x) => x !== c), carnetSupprimes: fournie ? (q.carnetSupprimes || []).concat([c.id]) : q.carnetSupprimes || [] }));
            ctx.render();
          } }));
      }))];
    });
    const ajout = h('div', { class: 'chips' }, E.TYPES.map((t) => ui.button(t.libelle, { icon: 'plus', variant: 'soft', small: true, onClick: () => {
      carnet.push({ id: uid('c'), type: t.id, nom: '', departement: '', lignes: '', email: '' });
      A.store.setParams('courriers', Object.assign({}, params(), { carnet }));
      ctx.render();
    } })));
    return h('div', { class: 'stack' }, nouveauTiers(ctx, carnet), ui.card('Carnet d\'adresses de l\'étude', h('div', { class: 'stack-sm' },
      ui.note('Adresses proposées en priorité dans les courriers : services successions des banques, assureurs, mutuelles, organismes du secteur. Pour un établissement qui a plusieurs services régionaux, précisez-le entre parenthèses : « LCL (Lyon) », « LCL (Nantes) ». Le carnet est enregistré sur ce poste et inclus dans l\'export des paramètres.'),
      recherche(ctx), lignes, h('h4', { class: 'form-sub' }, 'Ajouter une ligne vide'), ajout)));
  }
  let filtreCarnet = '';
  function recherche(ctx) {
    const input = h('input', { class: 'input', type: 'search', placeholder: 'Rechercher dans le carnet (nom, ville…)', value: filtreCarnet });
    input.addEventListener('change', () => { filtreCarnet = input.value; ctx.render(); });
    return input;
  }
  // Formulaire d'ajout d'un nouveau tiers au carnet.
  function nouveauTiers(ctx, carnet) {
    const t = { type: 'banque', nom: '', departement: '', lignes: '', email: '', telephone: '' };
    const type = ui.selectInput({ value: t.type, options: E.TYPES.map((x) => ({ value: x.id, label: x.libelle })), onChange: (v) => (t.type = v) });
    const champ = (k, ph) => ui.textInput({ value: '', placeholder: ph || '', onChange: (v) => (t[k] = v) });
    const adr = h('textarea', { class: 'input textarea', rows: 4, placeholder: 'NOM DE L\'ÉTABLISSEMENT\nService Successions\nAdresse\nCode postal VILLE' });
    adr.addEventListener('input', () => (t.lignes = adr.value));
    return ui.card('Ajouter un tiers au carnet', h('div', { class: 'stack-sm' },
      h('div', { class: 'grid-3' }, f('Type', type), f('Nom', champ('nom', 'ex. LCL (Lyon)')), f('Départements', champ('departement', 'vide : tous'))),
      h('div', { class: 'grid-2' }, f('Adresse', adr), h('div', { class: 'stack-sm' }, f('Adresse mail', champ('email')), f('Téléphone', champ('telephone')))),
      h('div', null, ui.button('Ajouter au carnet', { icon: 'plus', variant: 'primary', onClick: () => {
        if (!t.nom.trim() && !t.lignes.trim()) return ui.toast('Indiquez au moins le nom ou l\'adresse.', 'error');
        if (!t.nom.trim()) t.nom = t.lignes.split('\n')[0];
        carnet.push(Object.assign({ id: uid('c') }, t, { nom: t.nom.trim(), departement: t.departement.trim() }));
        A.store.setParams('courriers', Object.assign({}, params(), { carnet }));
        ui.toast('« ' + t.nom.trim() + ' » ajouté au carnet.');
        ctx.render();
      } }))), { subtitle: 'Banque, assureur, mutuelle, caisse de retraite, maison de retraite… ; il sera proposé dans les prochains dossiers.' });
  }

  /* ---------- Panneau latéral et impression ---------- */
  function aside(ctx) {
    const s = ctx.state;
    return ui.card('En un coup d\'œil', ctx.live((r) => {
      const df = s.defunt;
      const nb = r.courriers.filter((x) => x.coche).length;
      const sansAdresse = s.destinataires.filter((d) => !d.lignes).length;
      return [
        h('ul', { class: 'aside-list' },
          h('li', null, h('span', null, 'Défunt'), h('strong', null, E.designation(df) || '—')),
          h('li', null, h('span', null, 'Destinataires'), h('strong', null, String(s.destinataires.length))),
          h('li', null, h('span', null, 'Courriers cochés'), h('strong', null, String(nb)))),
        s.lecture.aVerifier.length ? ui.badge(false, s.lecture.aVerifier.length + ' rubrique(s) de la fiche à vérifier') : null,
        sansAdresse ? ui.badge(false, sansAdresse + ' adresse(s) à saisir') : null,
        !params().papier ? ui.badge(false, 'Papier à en-tête à importer (onglet Modèles)') : ui.badge(true, 'Papier à en-tête de l\'étude'),
        ui.button('Voir les courriers', { variant: 'soft', small: true, onClick: () => ctx.goTab('courriers') }),
      ];
    }), { className: 'aside-card' });
  }
  function print(ctx) {
    const s = ctx.state;
    const coches = ctx.result.courriers.filter((x) => x.coche);
    if (!coches.length) return ui.toast('Cochez au moins un courrier (onglet Courriers).', 'error');
    const d = dossierPourCourrier(s);
    const pages = [];
    coches.forEach((x) => pagesCourrier(E.rediger(d, x.dest, x.modele, optionsCourrier()), params().papier).forEach((p) => pages.push(p)));
    const style = h('style', null, '@page { size: A4; margin: 0; }');
    document.head.appendChild(style);
    window.addEventListener('afterprint', () => style.remove(), { once: true });
    ui.print(h('div', { class: 'lettres-print' }, pages), 'Courriers ' + reference(s));
  }

  function normalize(s) {
    const e = empty();
    s.defunt = Object.assign({}, e.defunt, s.defunt || {});
    ['naissance', 'deces', 'domicile'].forEach((k) => (s.defunt[k] = Object.assign({}, e.defunt[k], s.defunt[k] || {})));
    s.conjoint = Object.assign({}, e.conjoint, s.conjoint || {});
    s.clerc = Object.assign({}, e.clerc, s.clerc || {});
    s.lecture = Object.assign({}, e.lecture, s.lecture || {});
    s.destinataires = (s.destinataires || []).map((d) => Object.assign(nouveauDest(d.type || 'autre'), d));
    s.coches = s.coches || {};
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'courriers', empty, isEmpty, normalize, compute, aside, print, reference,
    tabs: [
      { id: 'acte', label: 'Acte de décès', render: tabActe },
      { id: 'destinataires', label: 'Destinataires', render: tabDestinataires },
      { id: 'courriers', label: 'Courriers', render: tabCourriers },
      { id: 'modeles', label: 'Modèles et papier à en-tête', render: tabModeles },
      { id: 'carnet', label: 'Carnet d\'adresses', render: tabCarnet },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
