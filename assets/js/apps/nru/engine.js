/*
 * Moteur — Notes de renseignements d'urbanisme (NRU).
 *
 * Lit la note reçue en PDF et la met en forme selon la trame de l'étude, prête à coller dans l'acte :
 *  - Cabinet COURBI (géomètres-experts) : tableau « libellé / réponse » en sept rubriques ;
 *  - Nota Risques Urba (MEDIA IMMO) : page « Synthèse » à deux colonnes (rubrique / texte).
 * Entrée : pages du PDF [{ num, items: [{ str, x, y, w }] }] (pdf.js), ou texte pour les tests.
 * Sortie : blocs { type: 'titre' | 'puce' | 'tiret' | 'p' | 'vide', texte }.
 * Fonctions pures : testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.nru = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const net = (t) => String(t || '').replace(/[\s  ]+/g, ' ').trim();
  const tousItems = (pages) => (pages || []).flatMap((p) => (p.items || []).filter((i) => net(i.str)).map((i) => Object.assign({ page: p.num }, i, { str: net(i.str) })));
  const texteDe = (pages) => tousItems(pages).map((i) => i.str).join(' ');
  // Ordre de lecture : page, puis de haut en bas, puis de gauche à droite.
  const ordre = (a, b) => a.page - b.page || b.y - a.y || a.x - b.x;
  // Lignes : éléments de même hauteur (à `tol` près), assemblés de gauche à droite.
  function lignes(items, tol) {
    const out = [];
    items.slice().sort(ordre).forEach((i) => {
      const l = out.find((x) => x.page === i.page && Math.abs(x.y - i.y) <= (tol || 1.5));
      if (l) l.items.push(i);
      else out.push({ page: i.page, y: i.y, items: [i] });
    });
    out.forEach((l) => { l.items.sort((a, b) => a.x - b.x); l.texte = net(l.items.map((i) => i.str).join(' ')); });
    return out.sort(ordre);
  }

  function detecter(pages) {
    const T = texteDe(pages);
    if (/COURBI/i.test(T)) return 'courbi';
    if (/MEDIA IMMO|SYNTH[ÈE]SE/i.test(T) && /L'unit[ée] fonci[èe]re/i.test(T)) return 'nota';
    return null;
  }

  /* ---------- Cabinet COURBI ---------- */
  const TITRES_COURBI = {
    1: '1- TERRAIN', 2: '2- PREEMPTION', 3: '3- URBANISME', 4: '4- SERVITUDES D’UTILITE PUBLIQUE',
    5: '5- RISQUES', 6: '6- CONTRAINTES', 7: '7- NUISANCES ET ENVIRONNEMENT',
  };
  // Libellés de la note → libellés de la trame de l'étude.
  const LIBELLES_COURBI = [
    [/^Exposition au retrait gonflement des argiles$/i, 'Retrait gonflement des argiles'],
    [/^Potentiel radon$/i, 'Radon'],
    [/^Installation nucl[ée]aire de base$/i, 'Installation nucléaire'],
    [/^Obligation de contr[ôo]le des branchements d.assainissement$/i, 'Obligation contrôle des branchements d’assainissement'],
  ];
  const libelleTrame = (l) => { const m = LIBELLES_COURBI.find(([re]) => re.test(l)); return m ? m[1] : l; };
  const RE_RUBRIQUE = /^([1-7])\s*[-–]\s*[A-ZÀ-Ý’' ]{4,}$/;

  function lireCourbi(pages) {
    const items = tousItems(pages).sort(ordre);
    const res = { type: 'courbi', numero: '', reference: '', demandeur: '', date: '', rubriques: [], avertissements: [] };
    const T = items.map((i) => i.str).join('\n');
    res.numero = (/N° ?([\d-]+)/.exec(T) || [])[1] || '';
    res.reference = net((/V\/R[ée]f\s*:\s*(.+)/.exec(T) || [])[1]);
    res.demandeur = net((/Demandeur\s*:\s*(.+)/.exec(T) || [])[1]);
    res.date = net((/Fait à .+?, le (.+?)\.?$/m.exec(T) || [])[1]);
    // Découpage en rubriques (1 - TERRAIN … 7 - NUISANCES), jusqu'à la mention finale.
    const fin = items.find((i) => /^R[ée]ponse d[ée]livr[ée]e/i.test(i.str));
    let courante = null;
    items.forEach((i) => {
      if (fin && ordre(i, fin) >= 0) { courante = null; return; }
      const m = RE_RUBRIQUE.exec(i.str);
      if (m) { courante = { numero: +m[1], items: [] }; res.rubriques.push(courante); return; }
      if (courante && i.y > 40) courante.items.push(i); // pied de page exclu
    });
    res.rubriques.forEach((r) => {
      if (r.numero === 4) { r.servitudes = servitudesCourbi(r.items); return; }
      r.lignes = lignesCourbi(r.items);
    });
    if (!res.rubriques.length) res.avertissements.push('Rubriques de la note non trouvées.');
    res.rubriques.forEach((r) => delete r.items);
    return res;
  }
  // Tableau à deux colonnes : libellés à gauche (centre < 200), réponses à droite, rattachées au libellé le plus proche.
  function lignesCourbi(items) {
    const centre = (i) => i.x + (i.w || 0) / 2;
    const libs = [];
    items.filter((i) => centre(i) < 200).sort(ordre).forEach((i) => {
      const prec = libs[libs.length - 1];
      // Libellé sur deux lignes (interligne serré).
      if (prec && prec.page === i.page && prec.yBas - i.y < 10.5 && prec.yBas - i.y > 0) { prec.morceaux.push(i.str); prec.yBas = i.y; return; }
      libs.push({ page: i.page, yHaut: i.y, yBas: i.y, morceaux: [i.str], valeurs: [] });
    });
    items.filter((i) => centre(i) >= 200).forEach((v) => {
      let best = null, d = Infinity;
      libs.filter((l) => l.page === v.page).forEach((l) => {
        const dist = Math.abs(v.y - (l.yHaut + l.yBas) / 2);
        if (dist < d) { d = dist; best = l; }
      });
      if (best && d < 12) best.valeurs.push(v);
    });
    return libs.map((l) => {
      const valeur = net(l.valeurs.sort(ordre).map((v) => v.str).join(' '));
      return { libelle: libelleTrame(net(l.morceaux.join(' '))), valeur: valeur === '-' ? '' : valeur };
    });
  }
  // Servitudes : code (colonne de gauche) et description (sur une ou plusieurs lignes).
  function servitudesCourbi(items) {
    const corps = items.filter((i) => !/^(Codification|Description)$/i.test(i.str)).sort(ordre);
    const codes = corps.filter((i) => i.x < 70 && (i.w || 0) < 40 && /^[A-Z]{1,4}\s?\d{0,2}$/.test(i.str));
    const out = codes.map((c) => ({ code: c.str, description: [] , c }));
    corps.filter((i) => !codes.includes(i)).forEach((i) => {
      // Rattachée au dernier code situé au-dessus (ou à la même hauteur).
      const cands = out.filter((s) => s.c.page < i.page || (s.c.page === i.page && s.c.y >= i.y - 2));
      const s = cands[cands.length - 1];
      if (s) s.description.push(i.str);
    });
    return out.map((s) => ({ code: s.code, description: net(s.description.join(' ')) }));
  }

  // Réponse sur plusieurs points (PPR, réseaux) : présentée en sous-tirets comme dans la trame.
  const SOUS_TIRETS = [/^Plan de pr[ée]vention des risques/i, /^Pr[ée]sence de r[ée]seaux/i];
  function sousTirets(valeur) {
    const v = net(valeur).replace(/^Oui\s*\/\s*/i, '');
    const parts = v.split(/,\s*(?=zone\b)/i).map((x) => net(x)).filter(Boolean);
    return parts.map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  }
  function blocsCourbi(lu) {
    const blocs = [];
    const rubs = (lu.rubriques || []).slice().sort((a, b) => a.numero - b.numero);
    rubs.forEach((r, k) => {
      if (k) blocs.push({ type: 'vide' });
      blocs.push({ type: 'titre', texte: (k === 0 ? '« ' : '') + (TITRES_COURBI[r.numero] || r.numero + '-') });
      if (r.servitudes) {
        if (!r.servitudes.length) blocs.push({ type: 'p', texte: 'Néant' });
        r.servitudes.forEach((s) => blocs.push({ type: 'p', texte: s.code + ' : ' + s.description }));
        return;
      }
      (r.lignes || []).forEach((l) => {
        const multi = SOUS_TIRETS.some((re) => re.test(l.libelle)) && l.valeur && !/^(Oui|Non)$/i.test(l.valeur);
        if (multi) {
          blocs.push({ type: 'puce', texte: l.libelle + ' :' });
          sousTirets(l.valeur).forEach((t) => blocs.push({ type: 'tiret', texte: t }));
        } else blocs.push({ type: 'puce', texte: l.libelle + ' :' + (l.valeur ? ' ' + l.valeur : '') });
      });
    });
    fermer(blocs);
    return blocs;
  }
  const fermer = (blocs) => { for (let i = blocs.length - 1; i >= 0; i--) if (blocs[i].type !== 'vide') { blocs[i] = Object.assign({}, blocs[i], { texte: blocs[i].texte.replace(/\s*$/, '') + ' »' }); break; } };

  /* ---------- Nota Risques Urba (MEDIA IMMO) ---------- */
  const RE_INTRO = /^(L'unit[ée] fonci[èe]re|La commune)\b/i;
  function lireNota(pages) {
    const res = { type: 'nota', dossier: '', adresse: '', date: '', rubriques: [], avertissements: [] };
    const T = texteDe(pages);
    res.dossier = (/Dossier n° ?([\d-]+)/.exec(T) || [])[1] || '';
    res.date = (/R[ée]alis[ée] le (\d{2}\/\d{2}\/\d{4})/.exec(T) || [])[1] || '';
    res.adresse = net((/ADRESSE DU BIEN\s+(.+?)\s+Cette Note/i.exec(T) || [])[1]).replace(/\s+,/g, ',');
    // Page « Synthèse » : celle qui porte le titre SYNTHÈSE et le texte « L'unité foncière… ».
    const page = (pages || []).find((p) => (p.items || []).some((i) => /^SYNTH[ÈE]SE$/i.test(net(i.str))) && (p.items || []).some((i) => RE_INTRO.test(net(i.str))));
    if (!page) { res.avertissements.push('Page « Synthèse » non trouvée dans la note.'); return res; }
    const items = tousItems([page]);
    const haut = items.find((i) => /^SYNTH[ÈE]SE$/i.test(i.str));
    const corps = items.filter((i) => i.y < haut.y && i.y > 50 && !/^Int[ée]grez la synth/i.test(i.str) && !/Tous droits|L'[ée]dition et la diffusion|MEDIA IMMO SAS/i.test(i.str));
    // Colonne de droite : le texte ; colonne de gauche : les rubriques.
    const droite = lignes(corps.filter((i) => i.x >= 200));
    const gauche = lignes(corps.filter((i) => i.x < 200));
    droite.forEach((l) => {
      const t = l.texte;
      const r = res.rubriques[res.rubriques.length - 1];
      if (RE_INTRO.test(t) || !r) res.rubriques.push({ y: l.y, titre: '', intro: t, points: [] });
      else if (/^-\s/.test(t)) r.points.push(t);
      else if (r.points.length) r.points[r.points.length - 1] = net(r.points[r.points.length - 1] + ' ' + t);
      else r.intro = net(r.intro + ' ' + t);
    });
    // Titres sur une ou deux lignes, rattachés à la rubrique dont ils sont à la hauteur.
    const titres = [];
    gauche.forEach((l) => {
      const prec = titres[titres.length - 1];
      if (prec && prec.yBas - l.y < 12.5) { prec.texte = net(prec.texte + ' ' + l.texte); prec.yBas = l.y; } else titres.push({ yHaut: l.y, yBas: l.y, texte: l.texte });
    });
    titres.forEach((t) => {
      const k = res.rubriques.findIndex((r, i) => t.yHaut <= r.y + 6 && (i + 1 >= res.rubriques.length || t.yHaut > res.rubriques[i + 1].y + 6));
      if (k >= 0) res.rubriques[k].titre = net((res.rubriques[k].titre + ' ' + t.texte).replace(/\s*\([^)]*\)\s*$/, ''));
    });
    res.rubriques.forEach((r) => delete r.y);
    if (!res.rubriques.length) res.avertissements.push('Aucune rubrique lue dans la synthèse.');
    return res;
  }
  function blocsNota(lu) {
    const blocs = lu.rubriques && lu.rubriques.length ? [{ type: 'p', texte: '«' }] : [];
    (lu.rubriques || []).forEach((r, k) => {
      if (k) blocs.push({ type: 'vide' });
      const titre = net(r.titre).replace(/\s*:$/, '') || 'RUBRIQUE';
      if (!r.points.length) { blocs.push({ type: 'puce', texte: titre + ' : ' + r.intro }); return; }
      blocs.push({ type: 'puce', texte: titre + ' : ' });
      // Dispositions d'urbanisme : le document d'urbanisme à la suite de la phrase, sur une ligne.
      if (/^DISPOSITIONS/i.test(titre)) { blocs.push({ type: 'p', texte: net(r.intro + ' ' + r.points.join(' ')) }); return; }
      blocs.push({ type: 'p', texte: r.intro });
      r.points.forEach((p) => blocs.push({ type: 'p', texte: p }));
    });
    fermer(blocs);
    return blocs;
  }

  function lire(pages, type) {
    const t = type && type !== 'auto' ? type : detecter(pages);
    if (t === 'courbi') return lireCourbi(pages);
    if (t === 'nota') return lireNota(pages);
    return { type: null, rubriques: [], avertissements: ['Note non reconnue : ni Cabinet COURBI, ni Nota Risques Urba (MEDIA IMMO).'] };
  }
  const blocs = (lu) => (lu && lu.type === 'courbi' ? blocsCourbi(lu) : lu && lu.type === 'nota' ? blocsNota(lu) : []);
  // Texte brut (copie sans mise en forme).
  const texte = (bs) => bs.map((b) => (b.type === 'vide' ? '' : b.type === 'puce' ? '• ' + b.texte : b.type === 'tiret' ? '    - ' + b.texte : b.texte)).join('\n');

  return { detecter, lire, lireCourbi, lireNota, blocs, blocsCourbi, blocsNota, texte, lignes };
});
