/*
 * Texte pour l'acte : affichage (police de l'acte), copie vers Word (tableaux compris) et fichier Word.
 * Blocs : { type: 'titre' | 'sous-titre' | 'p' | 'table', texte, lignes, entete, gras }.
 * Utilisé par « Quotités d'acquisition » et « Quasi-usufruit ».
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h } = A.util;

  function html(blocs) {
    return h('div', { class: 'qt-acte' }, blocs.map((b) => {
      if (b.type === 'titre') return h('h3', { class: 'qt-acte-titre' }, b.texte);
      if (b.type === 'sous-titre') return h('h4', { class: 'qt-acte-st' }, b.texte);
      if (b.type === 'p') return h('p', null, b.texte);
      return h('table', { class: 'qt-acte-table' },
        b.entete ? h('thead', null, h('tr', null, b.entete.map((c) => h('th', null, c)))) : null,
        h('tbody', null, b.lignes.map((l) => h('tr', { class: (b.gras || []).includes(l[0]) ? 'gras' : null }, l.map((c, k) => h('td', { class: k ? 'num' : null }, c))))));
    }));
  }

  const texte = (blocs) => blocs.map((b) => (b.type === 'table' ? [b.entete].concat(b.lignes).filter(Boolean).map((l) => l.join('\t')).join('\n') : b.texte)).join('\n\n');

  function docx(blocs) {
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const run = (t, gras) => '<w:r>' + (gras ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>';
    const para = (t, o) => '<w:p><w:pPr>' + (o && o.titre ? '<w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="center"/>' : o && o.st ? '<w:keepNext/><w:spacing w:before="200" w:after="80"/>' : '<w:spacing w:after="80"/><w:jc w:val="both"/>') + (o && o.droite ? '<w:jc w:val="right"/>' : '') + '</w:pPr>' + (t ? run(t, o && (o.titre || o.st || o.gras)) : '') + '</w:p>';
    const bord = '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>';
    const corps = blocs.map((b) => {
      if (b.type === 'titre') return para(b.texte.toUpperCase(), { titre: true });
      if (b.type === 'sous-titre') return para(b.texte, { st: true });
      if (b.type === 'p') return para(b.texte);
      const lignes = (b.entete ? [b.entete] : []).concat(b.lignes);
      return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' + bord + '</w:tblPr>' + lignes.map((l, i) => '<w:tr>' + l.map((c, k) => '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>'
        + para(c, { gras: (b.entete && i === 0) || (b.gras || []).includes(l[0]), droite: k > 0 }) + '</w:tc>').join('') + '</w:tr>').join('') + '</w:tbl>' + para('');
    }).join('');
    const paquet = A.engines.courriers.paquetMinimal();
    paquet['word/document.xml'] = paquet['word/document.xml'].replace('<w:body><w:p/>', '<w:body>' + corps);
    return A.zip.ecrire(paquet);
  }

  async function copier(blocs, message) {
    const vue = html(blocs);
    const page = '<html><body>' + vue.outerHTML + '</body></html>';
    try {
      if (root.ClipboardItem) await navigator.clipboard.write([new root.ClipboardItem({ 'text/html': new Blob([page], { type: 'text/html' }), 'text/plain': new Blob([texte(blocs)], { type: 'text/plain' }) })]);
      else await navigator.clipboard.writeText(texte(blocs));
      A.ui.toast(message || 'Copié : collez-le dans l\'acte (tableaux compris).');
    } catch (e) {
      A.ui.toast('Copie impossible : utilisez « Télécharger en Word ».', 'error');
    }
  }

  function telecharger(blocs, nom) {
    const url = URL.createObjectURL(new Blob([docx(blocs)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const a = h('a', { href: url, download: String(nom || 'document.docx').replace(/[\\/:*?"<>|]+/g, ' ') });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  A.acteDoc = { html, texte, docx, copier, telecharger };
})(typeof self !== 'undefined' ? self : this);
