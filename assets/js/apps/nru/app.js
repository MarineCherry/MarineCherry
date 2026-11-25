/*
 * Application « Notes d'urbanisme » : lit la note de renseignements d'urbanisme reçue en PDF
 * (Cabinet COURBI ou Nota Risques Urba) et la met en forme selon la trame de l'étude,
 * à copier dans l'acte en gardant la présentation (puces, italique, retours à la ligne).
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h } = A.util;
  const ui = A.ui;
  const E = A.engines.nru;

  const app = {
    id: 'nru',
    fileSuffix: 'nru',
    title: 'Notes d\'urbanisme',
    caption: 'NRU Courbi ou Nota Risques Urba mise en forme pour l\'acte',
    icon: 'nru',
    gradient: 'linear-gradient(150deg, #2f6b4f 0%, #7fb59a 100%)',
  };
  const TYPES = { courbi: 'Cabinet COURBI', nota: 'Nota Risques Urba' };

  const empty = () => ({ reference: '', fichier: '', type: 'auto', lu: null });
  const isEmpty = (s) => !s.reference && !s.lu;
  const compute = (s) => ({ blocs: s.lu ? E.blocs(s.lu) : [] });
  let dernieresPages = null; // pages du dernier PDF lu (relecture si l'on force le type)

  function appliquer(ctx, fichier) {
    const s = ctx.state;
    const lu = E.lire(dernieresPages, s.type);
    s.lu = lu;
    if (fichier) s.fichier = fichier;
    if (!s.reference) s.reference = lu.reference || lu.adresse || '';
    ctx.render(); ctx.changed();
    if (lu.type) ui.toast('Note ' + TYPES[lu.type] + ' lue : vérifiez puis copiez-la dans l\'acte.');
    else ui.toast(lu.avertissements[0], 'error');
  }
  async function lirePdf(ctx) {
    const fichier = await A.lecturePdf.choisirFichier();
    if (!fichier) return;
    ui.toast('Lecture de la note…');
    try { dernieresPages = await A.lecturePdf.pagesDuPdf(fichier); } catch (e) { console.error(e); return ui.toast('Lecture du PDF impossible : ' + e.message, 'error'); }
    ctx.state.reference = '';
    appliquer(ctx, fichier.name);
  }

  /* ---------- Rendu pour Word : styles en ligne, repris au collage ---------- */
  const S_P = 'margin:0;font-style:italic;';
  function vueWord(blocs) {
    const out = [];
    let liste = null;
    blocs.forEach((b) => {
      if (b.type === 'puce') {
        if (!liste) { liste = h('ul', { style: 'margin-top:0;margin-bottom:0;' }); out.push(liste); }
        liste.appendChild(h('li', { style: S_P }, b.texte));
        return;
      }
      liste = null;
      if (b.type === 'vide') out.push(h('p', { style: 'margin:0;' }, ' '));
      else if (b.type === 'titre') out.push(h('p', { style: S_P + 'text-decoration:underline;' }, b.texte));
      else if (b.type === 'tiret') out.push(h('p', { style: S_P + 'margin-left:72pt;text-indent:-18pt;' }, '-   ' + b.texte));
      else out.push(h('p', { style: S_P }, b.texte));
    });
    return out;
  }
  async function copier(el, texteBrut) {
    const page = '<html><body>' + el.innerHTML + '</body></html>';
    try {
      if (root.ClipboardItem) await navigator.clipboard.write([new root.ClipboardItem({ 'text/html': new Blob([page], { type: 'text/html' }), 'text/plain': new Blob([texteBrut], { type: 'text/plain' }) })]);
      else await navigator.clipboard.writeText(texteBrut);
      ui.toast('Copié : collez dans l\'acte (Ctrl+V), la présentation est conservée.');
    } catch (e) {
      // Repli : sélection du texte pour un Ctrl+C manuel.
      const r = document.createRange(); r.selectNodeContents(el);
      const sel = root.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      ui.toast('Copie automatique impossible : le texte est sélectionné, faites Ctrl+C.', 'error');
    }
  }

  function tabNote(ctx) {
    const s = ctx.state;
    const lu = s.lu;
    const lecture = ui.card('La note reçue', h('div', { class: 'stack-sm' },
      f('Dossier', ctx.text(s, 'reference', { placeholder: 'ex. Vente CARTON / CASTEL' })),
      f('Type de note', ctx.segmented(s, 'type', [{ value: 'auto', label: 'Reconnaître' }, { value: 'courbi', label: 'Courbi' }, { value: 'nota', label: 'Nota Risques Urba' }], { small: true, structural: true }),
        { help: 'Laissez « Reconnaître » : l\'outil voit seul de quelle note il s\'agit.' }),
      h('div', { class: 'chips' },
        ui.button(lu ? 'Lire une autre note' : 'Lire la note d\'urbanisme (PDF)', { icon: 'upload', variant: lu ? 'soft' : 'primary', small: true, onClick: () => lirePdf(ctx) }),
        lu && dernieresPages && s.type !== 'auto' && s.type !== lu.type ? ui.button('Relire comme ' + TYPES[s.type], { variant: 'soft', small: true, onClick: () => appliquer(ctx) }) : null),
      lu ? h('p', { class: 'small muted' }, [
        s.fichier, lu.type ? TYPES[lu.type] : null,
        lu.numero ? 'NRU n° ' + lu.numero : lu.dossier ? 'Dossier n° ' + lu.dossier : null,
        lu.adresse || null, lu.date ? 'du ' + lu.date : null,
      ].filter(Boolean).join(' · ')) : null,
      ...(lu ? lu.avertissements.map((a) => ui.note(a, 'warn')) : [])));
    if (!lu || !lu.type) return h('div', { class: 'stack' }, lecture);

    const blocs = ctx.result.blocs;
    const zone = h('div', { class: 'nru-apercu', contenteditable: 'true', spellcheck: 'false' }, vueWord(blocs));
    const resultat = ui.card('Pour l\'acte', h('div', { class: 'stack-sm' },
      h('div', { class: 'chips' },
        ui.button('Copier pour Word', { icon: 'copy', variant: 'primary', small: true, onClick: () => copier(zone, zone.innerText || E.texte(blocs)) }),
        ui.button('Remettre la note lue', { variant: 'ghost', small: true, onClick: () => ctx.render() })),
      h('p', { class: 'small muted' }, 'Vous pouvez corriger le texte directement ci-dessous avant de le copier. Collez ensuite dans l\'acte avec Ctrl+V : puces, italique et retours à la ligne sont conservés.'),
      zone));
    return h('div', { class: 'stack' }, lecture, resultat);
  }
  const f = (label, control, opts) => ui.field(label, control, opts);

  function aside(ctx) {
    const lu = ctx.state.lu;
    return ui.card('En un coup d\'œil', h('ul', { class: 'aside-list' },
      h('li', null, h('span', null, 'Note'), h('strong', null, lu && lu.type ? TYPES[lu.type] : '—')),
      h('li', null, h('span', null, 'Rubriques lues'), h('strong', null, lu ? String((lu.rubriques || []).length) : '—'))), { className: 'aside-card' });
  }

  function print(ctx) {
    const s = ctx.state;
    ui.print(ui.printDoc({
      title: 'Note de renseignements d\'urbanisme',
      subtitle: s.reference || null,
      meta: [s.lu && s.lu.type ? TYPES[s.lu.type] : ''],
      body: h('div', { class: 'nru-apercu' }, vueWord(ctx.result.blocs)),
      footer: 'Mise en forme de la note reçue ; à vérifier avant reprise dans l\'acte.',
    }), 'NRU ' + (s.reference || ''));
  }

  const mount = A.simulator({
    app, paramsSection: 'commun', empty, isEmpty, compute, aside, print,
    normalize: (s) => s,
    reference: (s) => s.reference,
    tabs: [{ id: 'note', label: 'Note d\'urbanisme', render: tabNote }],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
