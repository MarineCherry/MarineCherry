/*
 * Enregistrement direct d'un document en PDF (sans passer par la fenêtre d'impression).
 * Le document est mis en page hors écran au format A4, chaque bloc est photographié
 * (html2canvas) puis placé dans le PDF (jsPDF), en évitant de couper un bloc entre deux pages.
 * Les deux bibliothèques sont chargées à la demande depuis assets/vendor/pdf (aucun accès internet).
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h } = A.util;

  const PAGE = { largeur: 210, hauteur: 297, marge: 12 };
  const LARGEUR_PX = 720; // largeur de rendu du contenu (≈ 186 mm à 96 dpi)

  function script(src) {
    return new Promise((ok, ko) => {
      if (document.querySelector('script[data-src="' + src + '"]')) return ok();
      const s = h('script', { src, 'data-src': src });
      s.onload = () => ok();
      s.onerror = () => ko(new Error('Impossible de charger ' + src));
      document.head.appendChild(s);
    });
  }
  async function bibliotheques() {
    if (!root.html2canvas) await script('assets/vendor/pdf/html2canvas.min.js');
    if (!root.jspdf) await script('assets/vendor/pdf/jspdf.umd.min.js');
    return { html2canvas: root.html2canvas, jsPDF: root.jspdf.jsPDF };
  }

  // Blocs à placer : en-tête, sections de la synthèse, tableaux… ; les sauts de page sont conservés.
  function blocs(docEl) {
    const out = [];
    const parcourir = (el) => {
      Array.from(el.children).forEach((c) => {
        if (c.classList.contains('synthese') || c.classList.contains('stack-sm') || c.tagName === 'DIV' && c.classList.length === 0) parcourir(c);
        else out.push(c);
      });
    };
    parcourir(docEl);
    return out;
  }

  async function telecharger(docEl, nomFichier) {
    const { html2canvas, jsPDF } = await bibliotheques();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const zone = h('div', { class: 'pdf-mode', style: { position: 'fixed', left: '-10000px', top: '0', width: LARGEUR_PX + 'px', background: '#fff' } }, docEl);
    document.body.appendChild(zone);
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const utile = PAGE.largeur - 2 * PAGE.marge;
      const mmParPx = utile / LARGEUR_PX;
      const bas = PAGE.hauteur - PAGE.marge - 6; // place pour le numéro de page
      let y = PAGE.marge;
      const liste = blocs(docEl);
      for (let i = 0; i < liste.length; i++) {
        const el = liste[i];
        if (el.classList.contains('page-break')) {
          if (y > PAGE.marge) { pdf.addPage(); y = PAGE.marge; }
          continue;
        }
        const style = getComputedStyle(el);
        const avant = (parseFloat(style.marginTop) || 0) * mmParPx;
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
        const largeurMm = (canvas.width / 2) * mmParPx;
        const hauteurMm = (canvas.height / 2) * mmParPx;
        if (!hauteurMm) continue;
        // Un titre de section reste avec le bloc qui le suit.
        let suivant = 0;
        if (/^H[1-4]$/.test(el.tagName) && liste[i + 1] && !liste[i + 1].classList.contains('page-break')) {
          suivant = Math.min(40, liste[i + 1].getBoundingClientRect().height * mmParPx);
        }
        if (y > PAGE.marge) y += Math.min(avant, 6) || 2.5;
        if (y + hauteurMm + suivant > bas && y > PAGE.marge) { pdf.addPage(); y = PAGE.marge; }
        if (hauteurMm <= bas - PAGE.marge) {
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', PAGE.marge, y, largeurMm, hauteurMm);
          y += hauteurMm;
        } else {
          // Bloc plus haut qu'une page : découpage en tranches.
          const pxParMm = canvas.height / hauteurMm;
          let fait = 0;
          while (fait < canvas.height) {
            const dispoMm = bas - y;
            const tranche = Math.min(canvas.height - fait, Math.floor(dispoMm * pxParMm));
            const c = document.createElement('canvas');
            c.width = canvas.width;
            c.height = tranche;
            c.getContext('2d').drawImage(canvas, 0, fait, canvas.width, tranche, 0, 0, canvas.width, tranche);
            pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', PAGE.marge, y, largeurMm, tranche / pxParMm);
            fait += tranche;
            y += tranche / pxParMm;
            if (fait < canvas.height) { pdf.addPage(); y = PAGE.marge; }
          }
        }
      }
      const total = pdf.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.setFontSize(8);
        pdf.setTextColor(140);
        pdf.text('Page ' + p + ' / ' + total, PAGE.largeur - PAGE.marge, PAGE.hauteur - 8, { align: 'right' });
      }
      pdf.save(nomFichier);
    } finally {
      zone.remove();
    }
  }

  /*
   * Pages A4 déjà mises en page (courriers sur papier à en-tête) : chaque page est photographiée
   * en entier et occupe toute la feuille. Renvoie le PDF (Blob) ; l'enregistre si un nom est donné.
   */
  async function pagesA4(pages, nomFichier) {
    const { html2canvas, jsPDF } = await bibliotheques();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const zone = h('div', { style: { position: 'fixed', left: '-10000px', top: '0', background: '#fff' } }, pages);
    document.body.appendChild(zone);
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      for (let i = 0; i < pages.length; i++) {
        if (i) pdf.addPage();
        const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, PAGE.largeur, PAGE.hauteur);
      }
      if (nomFichier) pdf.save(nomFichier);
      return pdf.output('blob');
    } finally {
      zone.remove();
    }
  }

  A.pdf = { telecharger, pagesA4 };
})(typeof self !== 'undefined' ? self : this);
