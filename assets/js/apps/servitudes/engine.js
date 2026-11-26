/*
 * Moteur — Plan de servitudes.
 *
 *  - Lecture des clauses de servitude collées (fonds servants et dominants, nature, largeur, côté, acte).
 *  - Géométrie des parcelles (cadastre IGN, GeoJSON en WGS84) projetée en mètres autour du bien.
 *  - Tracé de l'assiette : bande le long d'une limite (Nord, Sud, Est, Ouest ou limite avec une parcelle),
 *    de largeur constante ou variable, éventuellement arrêtée à une parcelle ; ou tracé à la main.
 * Fonctions pures : testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.servitudes = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const net = (t) => String(t || '').replace(/[\s  ]+/g, ' ').trim();
  const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* ---------- Références cadastrales ---------- */
  // « AR 188 », « ar188 », « AR n° 0188 » → « AR188 ».
  function ref(section, numero) { return String(section || '').toUpperCase().replace(/\s/g, '') + String(parseInt(numero, 10)); }
  function lireRef(t) {
    const m = /^\s*([A-Za-z0-9]{1,3}?)\s*(?:n[°o]\s*)?0*(\d{1,4})\s*$/i.exec(String(t || ''));
    return m ? ref(m[1], m[2]) : null;
  }
  const libelleRef = (r) => String(r || '').replace(/^([A-Z0-9]*?[A-Z])(\d+)$/, '$1 $2');
  // Liste de références : « AR 186 - 187 », « AR 188, AR 190 », « D 765 - 766 et 767 ».
  function lireRefs(t) {
    const out = [];
    const re = /\b([A-Z]{1,2})\s*(?:n[°o]s?\s*)?(\d{1,4}(?:\s*(?:[-,/]|et)\s*\d{1,4})*)/g;
    let m;
    while ((m = re.exec(String(t || '')))) m[2].split(/\s*(?:[-,/]|et)\s*/).forEach((n) => { const r = ref(m[1], n); if (!out.includes(r)) out.push(r); });
    return out;
  }

  /* ---------- Nombres écrits en lettres (largeurs) ---------- */
  const UNITES = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
  function nombre(t) {
    const s = sansAccent(t).toLowerCase().replace(/[-\s]+et[-\s]+/g, ' ').replace(/-/g, ' ').trim();
    if (/^\d+(?:[.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'));
    let total = 0, ok = false;
    s.split(/\s+/).forEach((w) => { if (w in UNITES) { total += UNITES[w]; ok = true; } });
    return ok ? total : null;
  }
  const MOT_NB = '(?:\\d+(?:[.,]\\d+)?|(?:(?:zero|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante)(?![a-z])(?:[-\\s]+(?:et[-\\s]+)?)?)+)';
  // « cinq mètres », « sept mètre vingt centimètres », « 7,20 mètres », « 5 m », « deux mètres cinquante ».
  const RE_LONGUEUR = new RegExp('(' + MOT_NB + ')\\s*(?:metres?|m\\b)(?:\\s+(' + MOT_NB + ')(?:\\s*centimetres?)?)?', 'gi');
  function longueurs(t) {
    const s = sansAccent(t);
    const out = [];
    let m;
    RE_LONGUEUR.lastIndex = 0;
    while ((m = RE_LONGUEUR.exec(s))) {
      const a = nombre(m[1]);
      if (a === null) continue;
      const b = m[2] ? nombre(m[2]) : null;
      out.push({ valeur: Math.round((a + (b !== null ? b / 100 : 0)) * 100) / 100, index: m.index, texte: m[0] });
    }
    return out;
  }
  // Largeurs de l'assiette : celles écrites près du mot « largeur ».
  function largeurs(t) {
    const s = sansAccent(t);
    return longueurs(t).filter((l) => {
      const autour = s.slice(Math.max(0, l.index - 40), l.index + l.texte.length + 40);
      return /largeur/i.test(autour) && !/de chaque cote/i.test(s.slice(l.index - 12, l.index + l.texte.length + 25));
    }).map((l) => l.valeur);
  }

  /* ---------- Lecture des clauses ---------- */
  const COTES = { nord: 'N', sud: 'S', est: 'E', ouest: 'O' };
  const NATURES = {
    passage: { libelle: 'Servitude de passage', couleur: '#d9822b' },
    canalisations: { libelle: 'Servitude de canalisations', couleur: '#2f7fc1' },
    reseau: { libelle: 'Servitude de réseau (câbles, lignes)', couleur: '#8a4fb5' },
    vue: { libelle: 'Servitude de vue', couleur: '#2e9c6a' },
    nonAedificandi: { libelle: 'Servitude non aedificandi', couleur: '#c0392b' },
    autre: { libelle: 'Servitude', couleur: '#6b7280' },
  };
  function nature(t) {
    let s = sansAccent(t).toLowerCase();
    // « … est supprimée. Seule subsiste la servitude de … » : la nature est celle qui subsiste.
    const sub = /seule subsiste\s+(.{0,160})/.exec(s);
    if (sub) s = sub[1];
    if (/canalisation|tout a l.egout|assainissement|adduction/.test(s) && !/passage pour pietons/.test(s)) return 'canalisations';
    if (/telecommunication|cables?|ptt|lignes? electrique|electricite|enedis|edf|gaz/.test(s) && !/passage pour pietons/.test(s)) return 'reseau';
    if (/passage/.test(s)) return 'passage';
    if (/\bvues?\b|jour/.test(s)) return 'vue';
    if (/non aedificandi|interdiction de construire/.test(s)) return 'nonAedificandi';
    return 'autre';
  }
  // Côté de l'assiette : « limite NORD », « au Nord » ; `large` admet aussi « angle Nord Est » (partie par parcelle).
  function cote(t, large) {
    const s = sansAccent(t);
    const m = /limite\s+(nord|sud|est|ouest)\b/i.exec(s) || /\bau\s+(nord|sud|est|ouest)\b/i.exec(s) || (large ? /\b(nord|sud|est|ouest)\b/i.exec(s) : null);
    return m ? COTES[m[1].toLowerCase()] : null;
  }
  function acte(t) {
    const s = net(t);
    let m = /(?:Ma[îi]tre|Me)\s+([A-ZÉ][\wéèëïî-]+(?:\s+[A-ZÉ][\wéèëïî-]+)*),?\s*[Nn]otaire[^,]*?,?\s*(?:en date )?du\s+(\d{1,2}(?:er)?\s+[a-zéû]+\s+\d{4}|\d{2}\/\d{2}\/\d{4})/.exec(s);
    if (m) return 'acte de Me ' + m[1] + ' du ' + m[2];
    m = /pris par\s+(Monsieur le Pr[ée]fet de [A-ZÉ]+)[^,]*,\s*le\s+(\d{1,2}(?:er)?\s+[a-zéû]+\s+\d{4})/i.exec(s);
    if (m) return 'acte de ' + m[1].replace(/^Monsieur le/i, 'M. le') + ' du ' + m[2];
    return '';
  }
  // Fonds servants / dominants : la dernière mention « Fonds servant(s) : … » du passage (après une modification,
  // c'est la situation actuelle), sinon « (fonds servant) » écrit après une parcelle.
  function fonds(t, quoi) {
    const re = new RegExp('fonds\\s+' + quoi + 's?\\s*:\\s*([^\\n]{1,120})', 'gi');
    const lignes = [...net(t).replace(/(fonds\s+(?:servant|dominant)s?\s*:)/gi, '\n$1').split('\n').join('\n').matchAll(re)];
    if (lignes.length) return lireRefs(lignes[lignes.length - 1][1].split(/\b(?:appartenant|faisant|fonds)\b/i)[0]);
    const out = [];
    const re2 = new RegExp('section\\s+([A-Z]{1,2})\\s*n[°o]s?\\s*(\\d{1,4})\\s*\\(fonds\\s+' + quoi, 'gi');
    let m;
    while ((m = re2.exec(t))) { const r = ref(m[1], m[2]); if (!out.includes(r)) out.push(r); }
    return out;
  }
  // Parties d'assiette décrites parcelle par parcelle : « Concernant l'immeuble section AR n°187 (fonds servant) : … ».
  function assiettes(t, servants, dominants) {
    const parts = net(t).split(/(?=Concernant l.immeuble\s+section)/i);
    const desc = parts.length > 1 ? parts.slice(1) : null;
    const assiette = (texte, parcelle, large) => {
      const l = largeurs(texte);
      const jusqua = /jusqu.(?:a|à) la parcelle/i.test(texte) && dominants.length ? dominants[0] : '';
      return { parcelle, cote: cote(texte, large) || 'N', largeur: l[0] || null, largeurFin: l.length > 1 && l[1] !== l[0] ? l[1] : null, jusqua };
    };
    if (desc) return desc.map((p) => { const m = /section\s+([A-Z]{1,2})\s*n[°o]\s*(\d{1,4})/i.exec(p); return assiette(p.split(/Telle que|Fonds servants?\s*:/i)[0], m ? ref(m[1], m[2]) : servants[0], true); });
    // Après une modification, seule la partie qui suit la dernière désignation des fonds décrit la situation actuelle.
    const k = net(t).search(/Fonds servants?\s*:(?![\s\S]*Fonds servants?\s*:)/i);
    const actuel = k >= 0 && net(t).length - k > 120 ? net(t).slice(k) : net(t);
    const loc = cote(actuel) && largeurs(actuel).length;
    return loc && servants.length ? [assiette(actuel, servants[0], false)] : [];
  }
  // Découpe le texte collé en servitudes : « 1) … 2) … » (sinon un seul bloc).
  function analyser(texte) {
    const T = String(texte || '').replace(/\r/g, '');
    const blocs = T.split(/\n\s*(?=\d{1,2}\s*[).]\s+\S)/).map((b) => b.trim()).filter((b) => b.length > 20);
    return (blocs.length ? blocs : [T.trim()]).filter(Boolean).map((b, i) => {
      const servants = fonds(b, 'servant'), dominants = fonds(b, 'dominant');
      const nat = nature(b);
      const ass = assiettes(b, servants, dominants);
      const larg = largeurs(b);
      return {
        numero: i + 1, nature: nat, servants, dominants, acte: acte(b),
        largeur: ass.length ? ass[0].largeur : larg[0] || null,
        assiettes: ass, localisee: ass.length > 0,
        extrait: net(b).slice(0, 160),
      };
    });
  }
  function legende(s) {
    const n = NATURES[s.nature] || NATURES.autre;
    const parts = [s.libelle || n.libelle];
    if (s.servants && s.servants.length) parts.push('sur ' + s.servants.map(libelleRef).join(', '));
    if (s.dominants && s.dominants.length) parts.push('au profit de ' + s.dominants.map(libelleRef).join(', '));
    const m = (x) => (Number.isInteger(+x) ? String(+x) : (+x).toFixed(2).replace('.', ',')) + ' m';
    const ass = (s.assiettes || []).filter((a) => a.largeur);
    const larg = ass.map((a) => (a.largeurFin && +a.largeurFin !== +a.largeur ? m(a.largeur) + ' à ' + m(a.largeurFin) : m(a.largeur)) + (ass.length > 1 ? ' sur ' + libelleRef(a.parcelle) : ''));
    return parts.join(' ') + (larg.length ? ', largeur ' + [...new Set(larg)].join(', ') : '') + (s.acte ? ' (' + s.acte + ')' : '') + (s.localisee === false ? ' — non localisée sur le plan' : '');
  }

  /* ---------- Géométrie ---------- */
  // Projection locale en mètres (x vers l'est, y vers le nord) autour d'un point.
  function projection(lon0, lat0) {
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
    return { vers: (c) => [(c[0] - lon0) * kx, (c[1] - lat0) * ky], depuis: (p) => [lon0 + p[0] / kx, lat0 + p[1] / ky] };
  }
  const aire = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  function sansDoublon(r) {
    const out = r.filter((p, i) => { const q = r[(i + 1) % r.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01; });
    return out;
  }
  // Anneau extérieur, sans point de fermeture, orienté dans le sens direct (antihoraire).
  function anneau(coords, proj) {
    let r = coords.map(proj.vers);
    if (r.length > 1 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.01) r = r.slice(0, -1);
    r = sansDoublon(r);
    return aire(r) < 0 ? r.reverse() : r;
  }
  function centroide(r) {
    let a = 0, x = 0, y = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length], f = p[0] * q[1] - q[0] * p[1];
      a += f; x += (p[0] + q[0]) * f; y += (p[1] + q[1]) * f;
    }
    return a ? [x / (3 * a), y / (3 * a)] : r[0];
  }
  function dedans(pt, r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < (r[j][0] - r[i][0]) * (pt[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  }
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  const distBord = (p, r) => Math.min(...r.map((a, i) => distSeg(p, a, r[(i + 1) % r.length])));

  // Parcelles du cadastre IGN (FeatureCollection) → { ref, section, numero, contenance, anneaux }.
  function parcelles(geojson, proj) {
    return ((geojson && geojson.features) || []).map((f) => {
      const p = f.properties || {};
      const g = f.geometry || {};
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      const anneaux = polys.map((poly) => anneau(poly[0], proj)).filter((r) => r.length >= 3);
      return { ref: ref(p.section, p.numero), section: String(p.section || ''), numero: parseInt(p.numero, 10), contenance: p.contenance || null, anneaux };
    }).filter((p) => p.anneaux.length);
  }
  // Découpe d'un anneau par un rectangle (Sutherland-Hodgman) : partie visible d'une parcelle.
  function decouper(r, x1, y1, x2, y2) {
    const bords = [[(p) => p[0] >= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
      [(p) => p[0] <= x2, (a, b) => [x2, a[1] + (b[1] - a[1]) * (x2 - a[0]) / (b[0] - a[0])]],
      [(p) => p[1] >= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]],
      [(p) => p[1] <= y2, (a, b) => [a[0] + (b[0] - a[0]) * (y2 - a[1]) / (b[1] - a[1]), y2]]];
    let out = r;
    bords.forEach(([dans, inter]) => {
      const src = out; out = [];
      src.forEach((p, i) => {
        const q = src[(i + 1) % src.length];
        if (dans(q)) { if (!dans(p)) out.push(inter(p, q)); out.push(q); } else if (dans(p)) out.push(inter(p, q));
      });
    });
    return out;
  }
  const principal = (parc) => parc.anneaux.slice().sort((a, b) => aire(b) - aire(a))[0];

  // Arêtes de la limite d'un côté (normale extérieure à moins de `tol` degrés de la direction), en une chaîne continue.
  const DIRS = { N: [0, 1], S: [0, -1], E: [1, 0], O: [-1, 0] };
  function chaines(r, garder) {
    const n = r.length;
    const ok = r.map((p, i) => garder(p, r[(i + 1) % n], i));
    if (ok.every(Boolean)) return [r.concat([r[0]])];
    const debut = ok.findIndex((v, i) => v && !ok[(i - 1 + n) % n]);
    if (debut < 0) return [];
    const out = [];
    let cur = null;
    for (let k = 0; k < n; k++) {
      const i = (debut + k) % n;
      if (ok[i]) { if (!cur) cur = [r[i]]; cur.push(r[(i + 1) % n]); } else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
  }
  const longueur = (c) => c.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]) : 0), 0);
  // Réunit deux chaînes séparées par un court décrochement (< `saut` m).
  function fusionner(cs, saut) {
    const out = cs.slice();
    for (let changé = true; changé;) {
      changé = false;
      for (let i = 0; i < out.length && !changé; i++) for (let j = 0; j < out.length && !changé; j++) {
        if (i === j) continue;
        const a = out[i], b = out[j];
        const fin = a[a.length - 1], deb = b[0];
        if (Math.hypot(fin[0] - deb[0], fin[1] - deb[1]) < saut) { out[i] = a.concat(b); out.splice(j, 1); changé = true; }
      }
    }
    return out;
  }
  // `voisins` : anneaux des autres parcelles ; une limite séparative longe une parcelle voisine (pas la voie publique).
  function limiteCote(r, c, tol, voisins) {
    const d = DIRS[c];
    const cosTol = Math.cos((tol || 40) * Math.PI / 180);
    const longe = (m) => !voisins || voisins.some((v) => distBord(m, v) < 0.8);
    const cs = chaines(r, (p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
      return l > 0.2 && (dy * d[0] - dx * d[1]) / l >= cosTol // normale extérieure (dy, -dx) pour un anneau direct
        && longe([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
    });
    const fus = fusionner(cs, 3);
    return fus.sort((a, b) => longueur(b) - longueur(a))[0] || null;
  }
  // Limite séparative avec une autre parcelle : arêtes dont le milieu est sur le bord de celle-ci.
  function limiteAvec(r, autre) {
    const cs = chaines(r, (p, q) => distBord([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], autre) < 0.8);
    return cs.sort((a, b) => longueur(b) - longueur(a))[0] || null;
  }
  // Coupe la chaîne : depuis l'extrémité la plus éloignée de la parcelle `x` jusqu'au premier point qui la touche.
  function jusqua(chaine, x) {
    if (!chaine || !x) return chaine;
    const d = (p) => distBord(p, x) - (dedans(p, x) ? 1e6 : 0);
    const c = d(chaine[0]) >= d(chaine[chaine.length - 1]) ? chaine.slice() : chaine.slice().reverse();
    // Premier point (tous les 50 cm) qui touche la parcelle x.
    for (let i = 1; i < c.length; i++) {
      const a = c[i - 1], b = c[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(l / 0.5));
      for (let j = 1; j <= n; j++) {
        const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n];
        if (distBord(p, x) < 1) {
          // Affinage : on avance par pas de 2 cm jusqu'au contact (ou jusqu'à ce que la distance remonte).
          const t0 = (j - 1) / n;
          let best = null, dBest = Infinity;
          for (let t = t0; t <= 1 + 1e-9; t += 0.02 / (l || 1)) {
            const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const dq = distBord(q, x);
            if (dq < dBest - 1e-6) { dBest = dq; best = q; } else if (dq > dBest + 0.05) break;
            if (dq < 0.02) break;
          }
          return c.slice(0, i).concat([best || p]);
        }
      }
    }
    return c;
  }
  // Bande à l'intérieur de la parcelle le long d'une chaîne (anneau direct : intérieur à gauche),
  // de largeur w1 au début à w2 à la fin.
  function bande(chaine, w1, w2, versLaDroite) {
    if (!chaine || chaine.length < 2 || !(w1 > 0)) return null;
    const c = chaine;
    const L = longueur(c);
    const sgn = versLaDroite ? -1 : 1;
    const normale = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [sgn * -dy / l, sgn * dx / l]; };
    let s = 0;
    const off = c.map((p, i) => {
      if (i) s += Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]);
      const w = w1 + ((w2 > 0 ? w2 : w1) - w1) * (L ? s / L : 0);
      const n1 = i > 0 ? normale(c[i - 1], p) : null, n2 = i < c.length - 1 ? normale(p, c[i + 1]) : null;
      let n = n1 && n2 ? [n1[0] + n2[0], n1[1] + n2[1]] : n1 || n2;
      const ln = Math.hypot(n[0], n[1]) || 1;
      n = [n[0] / ln, n[1] / ln];
      const ref = n2 || n1;
      const miter = Math.min(3, 1 / Math.max(0.33, n[0] * ref[0] + n[1] * ref[1]));
      return [p[0] + n[0] * w * miter, p[1] + n[1] * w * miter];
    });
    return c.concat(off.reverse());
  }
  // Assiette d'une partie de servitude sur une parcelle.
  function tracerAssiette(a, index) {
    const p = index[a.parcelle];
    if (!p) return { erreur: 'Parcelle ' + libelleRef(a.parcelle) + ' non trouvée sur le plan.' };
    const r = principal(p);
    // Voisines (hors voie publique), sauf si l'assiette longe aussi la voie.
    const c0 = centroide(r);
    const voisins = a.voirie ? null : Object.values(index).filter((x) => x !== p).map(principal)
      .filter((v) => v.some((q) => Math.hypot(q[0] - c0[0], q[1] - c0[1]) < 2000));
    let ch = a.cote === 'limite' ? (index[a.avec] ? limiteAvec(r, principal(index[a.avec])) : null) : limiteCote(r, a.cote || 'N', a.tolerance, voisins);
    if (!ch) return { erreur: 'Limite ' + (a.cote === 'limite' ? 'avec ' + libelleRef(a.avec) : ({ N: 'Nord', S: 'Sud', E: 'Est', O: 'Ouest' })[a.cote]) + ' non trouvée pour ' + libelleRef(a.parcelle) + '.' };
    if (a.jusqua && index[a.jusqua] && a.jusqua !== a.parcelle) ch = jusqua(ch, principal(index[a.jusqua]));
    if (a.inverser) ch = ch.slice().reverse();
    const inv = !!a.inverser;
    const poly = bande(ch, +a.largeur, +a.largeurFin || +a.largeur, inv);
    return poly ? { polygone: poly, longueur: Math.round(longueur(ch)) } : { erreur: 'Largeur à indiquer pour ' + libelleRef(a.parcelle) + '.' };
  }
  // Tracé à la main : ligne d'une largeur donnée (bande centrée), ou polygone.
  function bandeCentree(pts, w) {
    if (!pts || pts.length < 2 || !(w > 0)) return null;
    const g = bande(pts, w / 2, w / 2, false), d = bande(pts, w / 2, w / 2, true);
    return g.slice(pts.length).reverse().concat(d.slice(pts.length));
  }

  return {
    ref, lireRef, lireRefs, libelleRef, nombre, longueurs, largeurs, nature, cote, acte, fonds, analyser, legende, NATURES,
    projection, parcelles, principal, decouper, centroide, aire, dedans, distBord, limiteCote, limiteAvec, jusqua, bande, bandeCentree, tracerAssiette, longueur,
  };
});
