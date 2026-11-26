/*
 * Application « Plan de servitudes » : contours des parcelles récupérés au cadastre (IGN), clauses de servitude
 * collées et lues, assiettes tracées (bande le long d'une limite ou à la main), légende, nord et échelle.
 * Seules la commune et les références cadastrales sont envoyées aux services publics (geo.api.gouv.fr, apicarto.ign.fr).
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid } = A.util;
  const ui = A.ui;
  const E = A.engines.servitudes;

  const app = {
    id: 'servitudes',
    fileSuffix: 'plan-servitudes',
    title: 'Plan de servitudes',
    caption: 'Plan des servitudes sur le cadastre, avec légende',
    icon: 'servitudes',
    gradient: 'linear-gradient(150deg, #7a4b1f 0%, #d9a066 100%)',
  };
  const COTES = [{ value: 'N', label: 'Nord' }, { value: 'S', label: 'Sud' }, { value: 'E', label: 'Est' }, { value: 'O', label: 'Ouest' }, { value: 'limite', label: 'Limite avec…' }];
  const NATURES = Object.keys(E.NATURES).map((k) => ({ value: k, label: E.NATURES[k].libelle }));

  const nouvelleAssiette = (o) => Object.assign({ id: uid('a'), parcelle: '', cote: 'N', avec: '', largeur: null, largeurFin: null, jusqua: '', inverser: false, voirie: false }, o || {});
  const nouvelleServitude = (o) => Object.assign({ id: uid('s'), nature: 'passage', libelle: '', legende: '', servants: [], dominants: [], acte: '', assiettes: [], traces: [], afficher: true }, o || {});
  const empty = () => ({ reference: '', commune: '', departement: '', insee: '', nomCommune: '', biens: '', texte: '', geo: null, centre: null, servitudes: [], titre: '' });
  const isEmpty = (s) => !s.reference && !s.biens && !s.texte && !s.servitudes.length;

  /* ---------- Calcul : parcelles projetées et assiettes ---------- */
  function compute(s) {
    if (!s.geo || !s.centre) return { parcelles: [], index: {}, traces: [] };
    const proj = E.projection(s.centre[0], s.centre[1]);
    const parcelles = E.parcelles(s.geo, proj);
    const index = {};
    parcelles.forEach((p) => { index[p.ref] = p; });
    const traces = [];
    s.servitudes.forEach((sv, k) => {
      if (sv.afficher === false) return;
      sv.assiettes.forEach((a) => {
        const t = E.tracerAssiette(a, index);
        traces.push(Object.assign({ servitude: k, assiette: a.id }, t));
      });
      (sv.traces || []).forEach((t) => {
        const poly = t.ferme ? (t.points.length >= 3 ? t.points : null) : E.bandeCentree(t.points, +t.largeur || 1);
        if (poly) traces.push({ servitude: k, polygone: poly, main: true });
      });
    });
    return { proj, parcelles, index, traces, biens: E.lireRefs(s.biens.toUpperCase()) };
  }

  /* ---------- Cadastre en ligne ---------- */
  async function json(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('service indisponible (' + r.status + ')');
    return r.json();
  }
  async function communeInsee(s) {
    if (/^\d[\dAB]\d{3}$/.test(s.commune.trim())) return { code: s.commune.trim(), nom: s.commune.trim() };
    const q = 'https://geo.api.gouv.fr/communes?nom=' + encodeURIComponent(s.commune.trim()) + (s.departement ? '&codeDepartement=' + encodeURIComponent(s.departement.trim()) : '') + '&fields=code,nom,codeDepartement&boost=population&limit=5';
    const l = await json(q);
    if (!l.length) throw new Error('commune « ' + s.commune + ' » introuvable');
    return l[0];
  }
  const parcelleUrl = (insee, r) => {
    const m = /^([A-Z0-9]*?[A-Z])(\d+)$/.exec(r);
    return 'https://apicarto.ign.fr/api/cadastre/parcelle?code_insee=' + insee + '&section=' + m[1].padStart(2, '0') + '&numero=' + m[2].padStart(4, '0');
  };
  async function chargerCadastre(ctx) {
    const s = ctx.state;
    const biens = E.lireRefs(s.biens.toUpperCase());
    if (!s.commune.trim() || !biens.length) return ui.toast('Indiquez la commune et la ou les parcelles vendues (ex. AR 188).', 'error');
    ui.toast('Recherche des parcelles au cadastre…');
    try {
      const c = await communeInsee(s);
      s.insee = c.code; s.nomCommune = c.nom;
      const refs = [...new Set(biens.concat(...s.servitudes.map((x) => x.servants.concat(x.dominants))))];
      const trouvees = [], manquantes = [];
      for (const r of refs) {
        const g = await json(parcelleUrl(s.insee, r));
        if (g.features && g.features.length) trouvees.push(...g.features); else manquantes.push(r);
      }
      if (!trouvees.length) throw new Error('parcelles introuvables dans cette commune');
      // Emprise : les parcelles vendues, élargie de 120 m, pour avoir le voisinage.
      const pts = trouvees.filter((f) => biens.includes(E.ref(f.properties.section, f.properties.numero))).flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flatMap((p) => p[0]));
      const base = pts.length ? pts : trouvees.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flatMap((p) => p[0]));
      const lons = base.map((p) => p[0]), lats = base.map((p) => p[1]);
      const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2, lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
      const dLat = 120 / 110574, dLon = 120 / (111320 * Math.cos(lat0 * Math.PI / 180));
      const x1 = Math.min(...lons) - dLon, x2 = Math.max(...lons) + dLon, y1 = Math.min(...lats) - dLat, y2 = Math.max(...lats) + dLat;
      const zone = { type: 'Polygon', coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]] };
      const v = await json('https://apicarto.ign.fr/api/cadastre/parcelle?geom=' + encodeURIComponent(JSON.stringify(zone)) + '&_limit=1000');
      const vus = new Set();
      const features = (v.features || []).concat(trouvees).filter((f) => { const k = f.properties.idu || f.id; if (vus.has(k)) return false; vus.add(k); return true; })
        .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { section: f.properties.section, numero: f.properties.numero, contenance: f.properties.contenance } }));
      s.geo = { type: 'FeatureCollection', features };
      s.centre = [lon0, lat0];
      if (!s.titre) s.titre = 'Plan des servitudes — ' + s.nomCommune + ' — ' + biens.map(E.libelleRef).join(', ');
      ctx.render(); ctx.changed();
      ui.toast(features.length + ' parcelles chargées' + (manquantes.length ? ' ; introuvables : ' + manquantes.map(E.libelleRef).join(', ') : '') + '.', manquantes.length ? 'error' : undefined);
    } catch (e) {
      console.error(e);
      ui.toast('Cadastre : ' + e.message + '. Vérifiez la connexion Internet.', 'error');
    }
  }

  /* ---------- Lecture des clauses ---------- */
  function analyserTexte(ctx) {
    const s = ctx.state;
    const lues = E.analyser(s.texte);
    if (!lues.length) return ui.toast('Collez d\'abord le texte des servitudes.', 'error');
    s.servitudes = lues.map((x) => nouvelleServitude({
      nature: x.nature, servants: x.servants, dominants: x.dominants, acte: x.acte,
      assiettes: x.assiettes.map((a) => nouvelleAssiette(a)), extrait: x.extrait, localisee: x.localisee,
    }));
    ctx.render(); ctx.changed();
    const manque = s.servitudes.some((x) => x.servants.concat(x.dominants).length) && s.geo;
    ui.toast(lues.length + ' servitude' + (lues.length > 1 ? 's' : '') + ' lue' + (lues.length > 1 ? 's' : '') + ' : vérifiez chaque fiche.' + (manque ? ' Rechargez le cadastre si des parcelles manquent.' : ''));
  }

  /* ---------- Dessin du plan (SVG) ---------- */
  const LARGEUR = 1000, HAUT_CARTE = 700;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function emprise(s, r) {
    const pts = [];
    (r.biens || []).forEach((b) => { if (r.index[b]) pts.push(...E.principal(r.index[b])); });
    r.traces.forEach((t) => { if (t.polygone) pts.push(...t.polygone); });
    s.servitudes.forEach((sv) => sv.dominants.forEach((d) => { if (r.index[d]) pts.push(...E.principal(r.index[d])); }));
    if (!pts.length) r.parcelles.slice(0, 1).forEach((p) => pts.push(...E.principal(p)));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const m = 25;
    let x1 = Math.min(...xs) - m, x2 = Math.max(...xs) + m, y1 = Math.min(...ys) - m, y2 = Math.max(...ys) + m;
    // Proportions de la carte.
    const ratio = LARGEUR / HAUT_CARTE;
    if ((x2 - x1) / (y2 - y1) > ratio) { const d = (x2 - x1) / ratio - (y2 - y1); y1 -= d / 2; y2 += d / 2; } else { const d = (y2 - y1) * ratio - (x2 - x1); x1 -= d / 2; x2 += d / 2; }
    return { x1, x2, y1, y2, k: LARGEUR / (x2 - x1) };
  }
  function echelleNette(k) {
    const cible = 150 / k;
    return [5, 10, 20, 25, 50, 100, 200, 250, 500].find((v) => v >= cible * 0.6) || 500;
  }
  function plan(s, r) {
    if (!r.parcelles.length) return null;
    const e = emprise(s, r);
    const X = (p) => ((p[0] - e.x1) * e.k).toFixed(1), Y = (p) => ((e.y2 - p[1]) * e.k).toFixed(1);
    const pts = (ring) => ring.map((p) => X(p) + ',' + Y(p)).join(' ');
    const biens = new Set(r.biens), dominants = new Set(s.servitudes.flatMap((x) => (x.afficher === false ? [] : x.dominants)));
    const out = [];
    const legendeL = s.servitudes.filter((x) => x.afficher !== false);
    const hautLegende = 40 + (legendeL.length + 2) * 22;
    void hautLegende;
    const H = HAUT_CARTE + hautLegende + 50;
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + LARGEUR + ' ' + H + '" width="' + LARGEUR + '" height="' + H + '" font-family="Arial, Helvetica, sans-serif">');
    out.push('<defs>' + legendeL.map((sv, i) => { const c = (E.NATURES[sv.nature] || E.NATURES.autre).couleur; return '<pattern id="h' + i + '" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="' + c + '" fill-opacity="0.18"/><line x1="0" y1="0" x2="0" y2="8" stroke="' + c + '" stroke-width="3"/></pattern>'; }).join('')
      + '<clipPath id="carte"><rect x="0" y="0" width="' + LARGEUR + '" height="' + HAUT_CARTE + '"/></clipPath></defs>');
    out.push('<rect width="' + LARGEUR + '" height="' + H + '" fill="#ffffff"/>');
    out.push('<g clip-path="url(#carte)"><rect width="' + LARGEUR + '" height="' + HAUT_CARTE + '" fill="#f3f1ec"/>');
    // Parcelles.
    r.parcelles.forEach((p) => p.anneaux.forEach((ring) => {
      const fond = biens.has(p.ref) ? '#f8d7e3' : '#ffffff';
      out.push('<polygon points="' + pts(ring) + '" fill="' + fond + '" stroke="#555" stroke-width="' + (biens.has(p.ref) ? 2.2 : 0.8) + '"/>');
    }));
    // Assiettes.
    r.traces.forEach((t) => {
      if (!t.polygone) return;
      const i = legendeL.indexOf(s.servitudes[t.servitude]);
      const c = (E.NATURES[s.servitudes[t.servitude].nature] || E.NATURES.autre).couleur;
      out.push('<polygon points="' + pts(t.polygone) + '" fill="url(#h' + i + ')" stroke="' + c + '" stroke-width="1.6"/>');
    });
    // Fonds dominants : contour.
    r.parcelles.forEach((p) => { if (dominants.has(p.ref) && !biens.has(p.ref)) p.anneaux.forEach((ring) => out.push('<polygon points="' + pts(ring) + '" fill="none" stroke="#b3261e" stroke-width="2" stroke-dasharray="7 4"/>')); });
    // Numéros.
    r.parcelles.forEach((p) => {
      // Numéro au centre de la partie visible de la parcelle.
      const ring = E.decouper(E.principal(p), e.x1, e.y1, e.x2, e.y2);
      if (ring.length < 3) return;
      const surf = Math.abs(E.aire(ring)) * e.k * e.k;
      const imp = biens.has(p.ref) || dominants.has(p.ref) || s.servitudes.some((x) => x.servants.includes(p.ref));
      if (surf < (imp ? 300 : 1200)) return;
      let c = E.centroide(ring);
      if (!E.dedans(c, ring)) return;
      out.push('<text x="' + X(c) + '" y="' + Y(c) + '" text-anchor="middle" dominant-baseline="middle" font-size="' + (imp ? 15 : 11) + '" font-weight="' + (imp ? 700 : 400) + '" fill="' + (imp ? '#1d1d1f' : '#6b6b6b') + '">' + esc(imp ? E.libelleRef(p.ref) : p.numero) + '</text>');
    });
    out.push('</g><rect width="' + LARGEUR + '" height="' + HAUT_CARTE + '" fill="none" stroke="#333" stroke-width="1.2"/>');
    // Nord et échelle.
    out.push('<g transform="translate(' + (LARGEUR - 50) + ',58)"><circle r="26" fill="#fff" fill-opacity="0.9" stroke="#333"/><path d="M0,-20 L8,8 L0,3 L-8,8 Z" fill="#1d1d1f"/><text y="22" text-anchor="middle" font-size="12" font-weight="700">N</text></g>');
    const L = echelleNette(e.k), lp = L * e.k;
    out.push('<g transform="translate(24,' + (HAUT_CARTE - 26) + ')"><rect x="-8" y="-20" width="' + (lp + 60) + '" height="34" fill="#fff" fill-opacity="0.9"/><rect width="' + (lp / 2) + '" height="6" fill="#1d1d1f"/><rect x="' + (lp / 2) + '" width="' + (lp / 2) + '" height="6" fill="#fff" stroke="#1d1d1f"/><text y="-6" font-size="11">0</text><text x="' + lp + '" y="-6" font-size="11" text-anchor="middle">' + L + ' m</text></g>');
    // Légende.
    let y = HAUT_CARTE + 30;
    out.push('<text x="0" y="' + y + '" font-size="16" font-weight="700">' + esc(s.titre || 'Plan des servitudes') + '</text>');
    y += 26;
    const domBien = [...dominants].some((d) => biens.has(d));
    out.push('<rect x="0" y="' + (y - 12) + '" width="22" height="14" fill="#f8d7e3" stroke="#555" stroke-width="2"/><text x="32" y="' + y + '" font-size="13">Bien vendu : ' + esc(r.biens.map(E.libelleRef).join(', ')) + (domBien ? ' (fonds dominant)' : '') + '</text>');
    if ([...dominants].some((d) => !biens.has(d))) { y += 22; out.push('<rect x="0" y="' + (y - 12) + '" width="22" height="14" fill="none" stroke="#b3261e" stroke-width="2" stroke-dasharray="5 3"/><text x="32" y="' + y + '" font-size="13">Fonds dominant</text>'); }
    legendeL.forEach((sv, i) => {
      y += 22;
      const c = (E.NATURES[sv.nature] || E.NATURES.autre).couleur;
      const loc = r.traces.some((t) => t.polygone && s.servitudes[t.servitude] === sv);
      const txt = (sv.legende || E.legende(Object.assign({}, sv, { localisee: loc }))).slice(0, 160);
      out.push((loc ? '<rect x="0" y="' + (y - 12) + '" width="22" height="14" fill="url(#h' + i + ')" stroke="' + c + '"/>' : '<line x1="0" y1="' + (y - 5) + '" x2="22" y2="' + (y - 5) + '" stroke="' + c + '" stroke-width="3" stroke-dasharray="4 3"/>')
        + '<text x="32" y="' + y + '" font-size="12.5">' + (i + 1) + '. ' + esc(txt) + '</text>');
    });
    y += 30;
    out.push('<text x="0" y="' + y + '" font-size="10.5" fill="#6b6b6b">Fond de plan : cadastre (IGN, Etalab). Plan indicatif établi d\'après les actes, sans valeur de bornage ; l\'assiette exacte résulte des actes et de leurs plans annexés.</text>');
    out.push('</svg>');
    return { svg: out.join(''), emprise: e, hauteur: H };
  }

  /* ---------- Export ---------- */
  async function enImage(svg, w, hgt) {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = hgt * 2;
    const g = c.getContext('2d');
    g.scale(2, 2); g.drawImage(img, 0, 0, w, hgt);
    URL.revokeObjectURL(url);
    return new Promise((ok) => c.toBlob(ok, 'image/png'));
  }
  async function telecharger(ctx) {
    const p = plan(ctx.state, ctx.result);
    if (!p) return;
    const blob = await enImage(p.svg, LARGEUR, p.hauteur);
    const a = h('a', { href: URL.createObjectURL(blob), download: ('Plan servitudes ' + (ctx.state.reference || ctx.state.biens || '')).trim().replace(/[\\/:*?"<>|]+/g, ' ') + '.png' });
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function copierImage(ctx) {
    const p = plan(ctx.state, ctx.result);
    if (!p) return;
    try {
      const blob = await enImage(p.svg, LARGEUR, p.hauteur);
      await navigator.clipboard.write([new root.ClipboardItem({ 'image/png': blob })]);
      ui.toast('Plan copié : collez-le dans l\'acte (Ctrl+V).');
    } catch (e) { ui.toast('Copie impossible : utilisez « Télécharger l\'image ».', 'error'); }
  }

  /* ---------- Écran ---------- */
  const f = (label, control, opts) => ui.field(label, control, opts);
  let traceEnCours = null; // { servitude, points, largeur, ferme }

  function tabPlan(ctx) {
    const s = ctx.state, r = ctx.result;
    const lieu = ui.card('Le bien', h('div', { class: 'stack-sm' },
      f('Dossier', ctx.text(s, 'reference', { placeholder: 'ex. Vente CARTON / CASTEL' })),
      h('div', { class: 'grid-2' },
        f('Commune', ctx.text(s, 'commune', { placeholder: 'ex. Jonquières' })),
        f('Département', ctx.text(s, 'departement', { placeholder: 'ex. 84' }))),
      f('Parcelle(s) vendue(s)', ctx.text(s, 'biens', { placeholder: 'ex. AR 188' })),
      h('div', { class: 'chips' }, ui.button(s.geo ? 'Recharger le cadastre' : 'Charger le plan cadastral', { icon: 'servitudes', variant: s.geo ? 'soft' : 'primary', small: true, onClick: () => chargerCadastre(ctx) })),
      h('p', { class: 'small muted' }, s.geo ? (s.nomCommune + ' (' + s.insee + ') · ' + r.parcelles.length + ' parcelles chargées') : 'Les contours viennent du cadastre de l\'IGN : seules la commune et les références cadastrales sont envoyées.')));

    const texte = ui.card('Les servitudes', h('div', { class: 'stack-sm' },
      f('Texte des servitudes (rappels, constitutions)', ctx.textarea ? ctx.textarea(s, 'texte') : zoneTexte(ctx)),
      h('div', { class: 'chips' },
        ui.button('Lire les servitudes', { icon: 'check', variant: 'primary', small: true, onClick: () => analyserTexte(ctx) }),
        ui.button('Ajouter une servitude', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.servitudes.push(nouvelleServitude()); ctx.render(); ctx.changed(); } })),
      h('div', { class: 'rows' }, s.servitudes.map((sv, i) => ficheServitude(ctx, sv, i)))),
    { subtitle: 'Collez les clauses numérotées 1), 2)… : chaque servitude devient une fiche à vérifier (nature, fonds, largeur, côté). Une servitude sans emplacement décrit figure seulement dans la légende.' });

    const p = plan(s, r);
    const carte = h('div', { class: 'sv-plan' });
    if (p) {
      carte.innerHTML = p.svg;
      const svg = carte.querySelector('svg');
      svg.style.width = '100%'; svg.style.height = 'auto';
      if (traceEnCours) {
        svg.style.cursor = 'crosshair';
        svg.addEventListener('click', (ev) => {
          const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
          const q = pt.matrixTransform(svg.getScreenCTM().inverse());
          if (q.y > HAUT_CARTE) return;
          const e = p.emprise;
          traceEnCours.points.push([e.x1 + q.x / e.k, e.y2 - q.y / e.k]);
          majTrace(ctx);
        });
      }
    }
    const resultat = ui.card('Le plan', h('div', { class: 'stack-sm' },
      p ? h('div', { class: 'chips' },
        ui.button('Copier l\'image', { icon: 'copy', variant: 'primary', small: true, onClick: () => copierImage(ctx) }),
        ui.button('Télécharger l\'image', { icon: 'save', variant: 'soft', small: true, onClick: () => telecharger(ctx) })) : null,
      f('Titre du plan', ctx.text(s, 'titre', { placeholder: 'Plan des servitudes — commune — parcelle', structural: true })),
      traceEnCours ? ui.note('Tracé à la main : cliquez sur le plan pour placer les points (' + traceEnCours.points.length + ' placés), puis « Terminer le tracé ».', 'info') : null,
      p ? carte : h('p', { class: 'small muted' }, 'Chargez le plan cadastral pour voir le plan.'),
      r.traces.filter((t) => t.erreur).map((t) => ui.note(t.erreur, 'warn'))));
    return h('div', { class: 'stack' }, lieu, texte, resultat);
  }
  function majTrace(ctx) {
    const sv = ctx.state.servitudes[traceEnCours.servitude];
    const t = sv.traces[sv.traces.length - 1];
    t.points = traceEnCours.points.slice();
    ctx.render(); ctx.changed();
  }
  function zoneTexte(ctx) {
    const t = h('textarea', { class: 'input sv-texte', rows: 8, placeholder: '1) Aux termes d\'un acte reçu par Maître … il a été constitué une servitude de passage … Fonds servant : AO 1 – Fonds dominant : AR 188 …' });
    t.value = ctx.state.texte || '';
    t.addEventListener('input', () => { ctx.state.texte = t.value; ctx.changed(); });
    return t;
  }
  const refsTexte = (l) => (l || []).map(E.libelleRef).join(', ');
  function ficheServitude(ctx, sv, i) {
    const s = ctx.state;
    const refs = (obj, key) => ui.textInput({ value: refsTexte(obj[key]), placeholder: 'ex. AR 186, AR 187', onChange: (v) => { obj[key] = E.lireRefs(v.toUpperCase()); ctx.changed(); }, onCommit: () => ctx.render() });
    return h('div', { class: 'row-line sv-fiche' },
      h('div', { class: 'sv-tete' },
        h('strong', null, 'Servitude ' + (i + 1)),
        h('span', { class: 'sv-pastille', style: { background: (E.NATURES[sv.nature] || E.NATURES.autre).couleur } }),
        h('span', { class: 'small muted' }, sv.extrait ? sv.extrait.slice(0, 90) + '…' : ''),
        h('span', { style: { flex: '1' } }),
        ui.button(sv.afficher === false ? 'Afficher' : 'Masquer', { variant: 'ghost', small: true, onClick: () => { sv.afficher = sv.afficher === false; ctx.render(); ctx.changed(); } }),
        ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { s.servitudes.splice(i, 1); ctx.render(); ctx.changed(); } })),
      h('div', { class: 'grid-2' },
        f('Nature', ctx.select(sv, 'nature', NATURES, { structural: true })),
        f('Acte', ctx.text(sv, 'acte', { placeholder: 'ex. acte de Me VIOU du 20 janvier 1999', structural: true }))),
      h('div', { class: 'grid-2' },
        f('Fonds servant(s)', refs(sv, 'servants')),
        f('Fonds dominant(s)', refs(sv, 'dominants'))),
      f('Légende', ctx.text(sv, 'legende', { placeholder: E.legende(sv), structural: true }), { help: 'Vide : légende rédigée automatiquement.' }),
      h('div', { class: 'stack-sm' }, sv.assiettes.map((a) => ficheAssiette(ctx, sv, a))),
      h('div', { class: 'chips' },
        ui.button('Ajouter une bande le long d\'une limite', { icon: 'plus', variant: 'soft', small: true, onClick: () => { sv.assiettes.push(nouvelleAssiette({ parcelle: sv.servants[0] || '', largeur: 5 })); ctx.render(); ctx.changed(); } }),
        traceEnCours && traceEnCours.servitude === i
          ? ui.button('Terminer le tracé', { icon: 'check', variant: 'primary', small: true, onClick: () => { traceEnCours = null; ctx.render(); } })
          : ui.button('Tracer à la main', { variant: 'soft', small: true, onClick: () => { sv.traces.push({ points: [], largeur: 4, ferme: false }); traceEnCours = { servitude: i, points: [] }; ctx.render(); } }),
        sv.traces.length ? ui.button('Effacer le tracé à la main', { variant: 'ghost', small: true, onClick: () => { sv.traces = []; traceEnCours = null; ctx.render(); ctx.changed(); } }) : null),
      sv.traces.map((t) => h('div', { class: 'grid-2' },
        f('Tracé à la main', ui.segmented({ value: !!t.ferme, small: true, options: [{ value: false, label: 'Chemin (largeur)' }, { value: true, label: 'Surface (contour)' }], onChange: (v) => { t.ferme = v; ctx.render(); ctx.changed(); } })),
        t.ferme ? h('span') : f('Largeur', ctx.num(t, 'largeur', { suffix: 'm' })))));
  }
  function ficheAssiette(ctx, sv, a) {
    const refSel = (key, vide) => ui.selectInput({
      value: a[key] || '', ariaLabel: key,
      options: [{ value: '', label: vide }].concat([...new Set(sv.servants.concat(sv.dominants, ctx.result.biens || [], a[key] ? [a[key]] : []))].map((r) => ({ value: r, label: E.libelleRef(r) }))),
      onChange: (v) => { a[key] = v; ctx.render(); ctx.changed(); },
    });
    return h('div', { class: 'sv-assiette' },
      f('Bande sur', refSel('parcelle', '— parcelle —')),
      f('Le long de la limite', ctx.select(a, 'cote', COTES, { structural: true })),
      a.cote === 'limite' ? f('avec la parcelle', ui.textInput({ value: E.libelleRef(a.avec), placeholder: 'ex. AR 194', onChange: (v) => { a.avec = E.lireRef(v.toUpperCase()) || ''; }, onCommit: () => { ctx.render(); ctx.changed(); } })) : null,
      f('Largeur', ctx.num(a, 'largeur', { suffix: 'm' })),
      f('Largeur à l\'autre bout', ctx.num(a, 'largeurFin', { suffix: 'm', placeholder: 'identique' })),
      f('Jusqu\'à', refSel('jusqua', 'toute la limite')),
      f('Options', h('div', { class: 'chips' },
        ui.button(a.inverser ? 'Sens inversé' : 'Inverser le sens', { variant: a.inverser ? 'primary' : 'ghost', small: true, onClick: () => { a.inverser = !a.inverser; ctx.render(); ctx.changed(); } }),
        ui.button(a.voirie ? 'Longe la voie : oui' : 'Longe la voie : non', { variant: a.voirie ? 'primary' : 'ghost', small: true, onClick: () => { a.voirie = !a.voirie; ctx.render(); ctx.changed(); } }),
        ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { sv.assiettes.splice(sv.assiettes.indexOf(a), 1); ctx.render(); ctx.changed(); } }))));
  }

  function aside(ctx) {
    const s = ctx.state, r = ctx.result;
    return ui.card('En un coup d\'œil', h('ul', { class: 'aside-list' },
      h('li', null, h('span', null, 'Commune'), h('strong', null, s.nomCommune || '—')),
      h('li', null, h('span', null, 'Parcelles'), h('strong', null, String(r.parcelles.length))),
      h('li', null, h('span', null, 'Servitudes'), h('strong', null, String(s.servitudes.length))),
      h('li', null, h('span', null, 'Tracées'), h('strong', null, String(new Set(r.traces.filter((t) => t.polygone).map((t) => t.servitude)).size)))), { className: 'aside-card' });
  }
  function print(ctx) {
    const p = plan(ctx.state, ctx.result);
    if (!p) return ui.toast('Chargez d\'abord le plan cadastral.', 'error');
    const d = h('div', { class: 'sv-plan' });
    d.innerHTML = p.svg;
    d.querySelector('svg').style.width = '100%';
    ui.print(ui.printDoc({ title: 'Plan des servitudes', subtitle: ctx.state.reference || null, meta: [ctx.state.nomCommune || ''], body: d }), 'Plan servitudes ' + (ctx.state.reference || ''));
  }
  function normalize(s) {
    s.servitudes = (s.servitudes || []).map((x) => nouvelleServitude(Object.assign({}, x, { assiettes: (x.assiettes || []).map((a) => nouvelleAssiette(a)), traces: x.traces || [] })));
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'commun', empty, isEmpty, compute, aside, print, normalize,
    reference: (s) => s.reference || s.biens,
    tabs: [{ id: 'plan', label: 'Plan de servitudes', render: tabPlan }],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
