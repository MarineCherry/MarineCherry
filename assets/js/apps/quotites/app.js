/*
 * Application « Quotités d'acquisition » : part de chaque acquéreur d'un bien acheté en indivision,
 * d'après ses apports et sa part des prêts (et de leurs frais). Clause prête à reprendre dans l'acte.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, uid, fmtEuro, fmtPct } = A.util;
  const ui = A.ui;
  const E = A.engines.quotites;

  const app = {
    id: 'quotites',
    fileSuffix: 'quotites',
    title: 'Quotités d\'acquisition',
    caption: 'Achat en indivision : part de chacun',
    icon: 'quotites',
    gradient: 'linear-gradient(150deg, #a8573a 0%, #e0956b 100%)',
  };
  const COULEURS = ['#3d7be0', '#ee7552', '#34a483', '#8b5fd6', '#f0b23a', '#2f9aa8'];

  const nouvelAcquereur = (nom) => ({ id: uid('a'), civilite: '', nom: nom || '', versements: [], apports: [{ id: uid('p'), libelle: 'Apport personnel', montant: null }] });
  // Postes du coût de l'opération, dans l'ordre de la clause de l'étude.
  const POSTES = [['prix', 'Prix'], ['travaux', 'Montant des travaux à effectuer'], ['fraisVente', 'Frais de la vente'], ['fraisNegociation', 'Frais de négociation'], ['fraisSyndic', 'Provision syndic et taxe foncière']];
  const emploisDefaut = () => POSTES.map(([code, libelle]) => ({ id: uid('e'), code, libelle, montant: null }));
  function empty() {
    return {
      reference: '',
      acquereurs: [nouvelAcquereur(), nouvelAcquereur()],
      emplois: emploisDefaut(),
      prets: [{ id: uid('k'), libelle: 'Prêt immobilier', preteur: '', capital: null, frais: null, egal: true, repartition: {} }],
      fraisDansCout: true,
      fraisPretsEtude: false,
      methode: 2,
    };
  }
  const isEmpty = (s) => !s.reference && s.acquereurs.every((a) => !a.nom) && s.emplois.every((x) => !x.montant);
  const compute = (s) => E.calculer(s);
  const pct2 = (x) => fmtPct(x, 2);
  const f = (label, control, opts) => ui.field(label, control, opts);
  const retirer = (ctx, liste, x) => ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { liste.splice(liste.indexOf(x), 1); ctx.render(); ctx.changed(); } });

  /* ---------- Saisie ---------- */
  function tabSaisie(ctx) {
    const s = ctx.state;
    const nomDe = (a, i) => a.nom || 'Acquéreur ' + (i + 1);

    const acquereurs = ui.card('Les acquéreurs et leurs apports', h('div', { class: 'stack-sm' },
      s.acquereurs.map((a, i) => h('div', { class: 'qt-acq', style: { '--c': COULEURS[i % COULEURS.length] } },
        h('div', { class: 'qt-acq-tete' }, h('span', { class: 'qt-pastille' }),
          f('Civilité', ctx.segmented(a, 'civilite', [{ value: 'M', label: 'Monsieur' }, { value: 'Mme', label: 'Madame' }], { small: true })),
          f('Prénom et NOM', ctx.text(a, 'nom', { structural: true, placeholder: 'Acquéreur ' + (i + 1) })),
          s.acquereurs.length > 2 ? retirer(ctx, s.acquereurs, a) : null),
        h('div', { class: 'rows' }, a.apports.map((p) => h('div', { class: 'row-line qt-ligne' },
          f('Apport', ctx.text(p, 'libelle', { placeholder: 'ex. épargne, donation, vente d\'un bien' })),
          f('Montant', ctx.num(p, 'montant', { suffix: '€' })),
          a.apports.length > 1 ? retirer(ctx, a.apports, p) : h('span')))),
        ui.button('Ajouter un apport', { icon: 'plus', variant: 'ghost', small: true, onClick: () => { a.apports.push({ id: uid('p'), libelle: '', montant: null }); ctx.render(); } }))),
      ui.button('Ajouter un acquéreur', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.acquereurs.push(nouvelAcquereur()); ctx.render(); } })),
    { subtitle: 'Indiquez l\'origine des fonds : elle pourra être reprise dans l\'acte (déclaration d\'origine des deniers).' });

    const cout = ui.card('Coût de l\'acquisition', h('div', { class: 'stack-sm' },
      h('div', { class: 'qt-postes' }, s.emplois.filter((x) => x.code && x.code !== 'autre').map((x) => f(x.libelle, ctx.num(x, 'montant', { suffix: '€' }))),
        h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Frais de prêt'), ctx.live((r) => h('div', { class: 'readonly' }, fmtEuro(r.fraisPrets) + (r.fraisDansCout ? '' : ' (non comptés)'))))),
      h('div', { class: 'rows' }, s.emplois.filter((x) => !x.code || x.code === 'autre').map((x) => h('div', { class: 'row-line qt-ligne' },
        f('Autre poste', ctx.text(x, 'libelle')), f('Montant', ctx.num(x, 'montant', { suffix: '€' })), retirer(ctx, s.emplois, x)))),
      ui.button('Ajouter un autre poste', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.emplois.push({ id: uid('e'), code: 'autre', libelle: '', montant: null }); ctx.render(); } })),
    { subtitle: 'Les frais de prêt viennent de la rubrique « Prêts ». Frais de négociation : honoraires d\'agence à la charge de l\'acquéreur.' });

    const prets = ui.card('Prêts', h('div', { class: 'stack-sm' },
      s.prets.map((p) => h('div', { class: 'qt-pret' },
        h('div', { class: 'row-line qt-ligne3' },
          f('Prêt', ctx.text(p, 'libelle')), f('Auprès de', ctx.text(p, 'preteur', { placeholder: 'ex. Crédit Agricole Alpes Provence' })), f('Capital emprunté', ctx.num(p, 'capital', { suffix: '€' })),
          f('Frais du prêt', ctx.num(p, 'frais', { suffix: '€' }), { help: 'Garantie, dossier, courtage…' }), retirer(ctx, s.prets, p)),
        h('div', { class: 'qt-repartition' },
          f('Répartition entre les acquéreurs', ctx.segmented(p, 'egal', [{ value: true, label: 'À parts égales' }, { value: false, label: 'Autre répartition' }], { small: true, structural: true })),
          p.egal === false ? h('div', { class: 'qt-parts' }, s.acquereurs.map((a, i) => f(nomDe(a, i), ui.numberInput({
            value: p.repartition[a.id], percent: true, placeholder: '%',
            onChange: (v) => { p.repartition[a.id] = v; ctx.changed(); },
          })))) : null))),
      ui.button('Ajouter un prêt', { icon: 'plus', variant: 'soft', small: true, onClick: () => { s.prets.push({ id: uid('k'), libelle: '', capital: null, frais: null, egal: true, repartition: {} }); ctx.render(); } }),
      f('Frais de prêt', ctx.segmented(s, 'fraisDansCout', [{ value: true, label: 'Pris en compte dans le calcul' }, { value: false, label: 'Déduits de l\'apport de chacun' }], { small: true, structural: true }),
        { help: 'Méthode de la clause de l\'étude : les frais de prêt comptent dans le coût de l\'opération pour le calcul des pourcentages, même s\'ils sont réglés directement à la banque et non appelés par l\'étude.' })),
    { subtitle: 'Un prêt souscrit ensemble est en principe supporté par moitié ; sinon, indiquez la part de chacun.' });

    return h('div', { class: 'stack' }, f('Dossier', ctx.text(s, 'reference', { placeholder: 'ex. Acquisition MARTIN / DURAND' })), acquereurs, cout, prets, ctx.live((r) => resultat(s, r)));
  }

  /* ---------- Résultat ---------- */
  function resultat(s, r) {
    const nom = (l, i) => l.nom || 'Acquéreur ' + (i + 1);
    const tableau = ui.table([
      { label: 'Acquéreur', render: (l) => h('span', { class: 'qt-nom', style: { '--c': COULEURS[r.lignes.indexOf(l) % COULEURS.length] } }, h('span', { class: 'qt-pastille' }), nom(l, r.lignes.indexOf(l))) },
      { label: 'Apport', num: true, render: (l) => fmtEuro(l.apports) },
      r.fraisDansCout ? null : { label: 'dont frais de prêt', num: true, render: (l) => (l.fraisPrets ? '− ' + fmtEuro(l.fraisPrets) : '—') },
      r.fraisDansCout ? null : { label: 'Apport net', num: true, render: (l) => fmtEuro(l.apports - l.fraisPrets) },
      { label: 'Part des prêts', num: true, render: (l) => fmtEuro(l.prets) },
      { label: 'Contribution', num: true, render: (l) => h('strong', null, fmtEuro(l.contribution)) },
      { label: 'Quotité', num: true, render: (l) => h('strong', { class: 'qt-quotite' }, pct2(l.quotiteArrondie)) },
    ].filter(Boolean), r.lignes);
    // Ligne de total.
    const sApports = r.lignes.reduce((t, l) => t + l.apports, 0);
    const tot = h('tr', { class: 'strong' }, h('td', null, 'Total'), h('td', { class: 'num' }, fmtEuro(sApports)),
      r.fraisDansCout ? null : h('td', { class: 'num' }, r.fraisPrets ? '− ' + fmtEuro(r.fraisPrets) : '—'),
      r.fraisDansCout ? null : h('td', { class: 'num' }, fmtEuro(sApports - r.fraisPrets)),
      h('td', { class: 'num' }, fmtEuro(r.lignes.reduce((t, l) => t + l.prets, 0))), h('td', { class: 'num' }, fmtEuro(r.total)), h('td', { class: 'num' }, '100,00 %'));
    tableau.querySelector('table').appendChild(h('tfoot', null, tot));
    const barre = h('div', { class: 'qt-barre' }, r.lignes.map((l, i) => h('div', { class: 'qt-morceau', style: { '--c': COULEURS[i % COULEURS.length], flex: Math.max(l.quotite, 0.0001) } }, h('span', null, nom(l, i)), h('strong', null, pct2(l.quotiteArrondie)))));
    const controle = r.equilibre ? ui.badge(true, 'Le financement correspond au coût de l\'acquisition (' + fmtEuro(r.base) + ').')
      : ui.note('Le financement' + (r.fraisDansCout ? '' : ', net des frais de prêt,') + ' (' + fmtEuro(r.total) + ') ' + (r.ecart > 0 ? 'dépasse' : 'n\'atteint pas') + ' le coût de l\'acquisition (' + fmtEuro(r.base) + ') : écart de ' + fmtEuro(Math.abs(r.ecart)) + '. Vérifiez les montants ; les quotités sont calculées sur le financement saisi.', 'warn');
    const appel = r.fraisPrets && r.fraisDansCout && !s.fraisPretsEtude ? h('p', { class: 'small muted' }, 'Somme globale à appeler par l\'étude (apports et prêts) : ' + fmtEuro(r.baseEmplois)
      + '. Les frais de prêt (' + fmtEuro(r.fraisPrets) + ') sont réglés à la banque : ils ne servent qu\'au calcul des pourcentages. Détail dans l\'onglet « Versements ».') : null;
    return ui.card('Quotités', h('div', { class: 'stack-sm' }, barre, tableau, controle, appel,
      r.negatif ? ui.note('Un acquéreur a une contribution négative : vérifiez ses apports et sa part des frais de prêt.', 'warn') : null,
      h('p', { class: 'small muted' }, 'Quotités arrondies au centième de pourcent ; le total fait exactement 100 %.')), { className: 'qt-resultat' });
  }

  /* ---------- Clause ---------- */
  const enLettres = (x) => A.lettres.montant(x, 'EUR', true);
  const clauseDe = (s, r) => E.clauseActe(s, r, enLettres);
  // Mise en page de la clause (écran, impression et copie vers Word).
  function clauseHtml(blocs) {
    return h('div', { class: 'qt-acte' }, blocs.map((b) => {
      if (b.type === 'titre') return h('h3', { class: 'qt-acte-titre' }, b.texte);
      if (b.type === 'sous-titre') return h('h4', { class: 'qt-acte-st' }, b.texte);
      if (b.type === 'p') return h('p', null, b.texte);
      return h('table', { class: 'qt-acte-table' },
        b.entete ? h('thead', null, h('tr', null, b.entete.map((c) => h('th', null, c)))) : null,
        h('tbody', null, b.lignes.map((l) => h('tr', { class: (b.gras || []).includes(l[0]) ? 'gras' : null }, l.map((c, k) => h('td', { class: k ? 'num' : null }, c))))));
    }));
  }
  // Fichier Word de la clause (tableaux compris).
  function docxClause(blocs) {
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
  function tabClause(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' }, ctx.live((r) => {
      const c = clauseDe(s, r);
      const vue = clauseHtml(c.blocs);
      const copier = async () => {
        const html = '<html><body>' + vue.outerHTML + '</body></html>';
        try {
          if (root.ClipboardItem) await navigator.clipboard.write([new root.ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([E.clauseTexte(c.blocs)], { type: 'text/plain' }) })]);
          else await navigator.clipboard.writeText(E.clauseTexte(c.blocs));
          ui.toast('Clause copiée : collez-la dans l\'acte (tableaux compris).');
        } catch (e) { ui.toast('Copie impossible : utilisez « Télécharger en Word ».', 'error'); }
      };
      const word = () => {
        const nom = 'Clause indivision - ' + (s.reference || s.acquereurs.map((a) => a.nom).filter(Boolean).join(' ') || 'acquisition') + '.docx';
        const url = URL.createObjectURL(new Blob([docxClause(c.blocs)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        const a = h('a', { href: url, download: nom.replace(/[\\/:*?"<>|]+/g, ' ') });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
      return ui.card('Clause pour l\'acte', h('div', { class: 'stack-sm' },
        !r.equilibre ? ui.note('Le financement ne correspond pas au coût de l\'opération (écart de ' + fmtEuro(Math.abs(r.ecart)) + ') : vérifiez les montants avant de reprendre la clause.', 'warn') : null,
        h('div', { class: 'chips' },
          ui.button('Copier la clause', { icon: 'copy', variant: 'primary', small: true, onClick: copier }),
          ui.button('Télécharger en Word', { icon: 'save', variant: 'soft', small: true, onClick: word })),
        vue), { subtitle: 'Trame de l\'étude « Fixation de la proportion de propriété indivise », complétée avec le dossier.' });
    }));
  }

  /* ---------- Versements ---------- */
  function recapVersements(s, r) {
    const v = E.versements(s, r);
    const nom = (l, i) => l.nom || 'Acquéreur ' + (i + 1);
    const resteTxt = (x) => (x < -0.005 ? h('span', { class: 'qt-trop' }, 'Trop-versé ' + fmtEuro(-x)) : h('strong', null, fmtEuro(Math.max(0, x))));
    const tableau = ui.table([
      { label: 'Acquéreur', render: (l) => h('span', { class: 'qt-nom', style: { '--c': COULEURS[v.lignes.indexOf(l) % COULEURS.length] } }, h('span', { class: 'qt-pastille' }), nom(l, v.lignes.indexOf(l))) },
      { label: 'Apport', num: true, render: (l) => fmtEuro(l.apport) },
      { label: 'Prêt', num: true, render: (l) => fmtEuro(l.pret) },
      { label: 'À verser à l\'étude', num: true, render: (l) => h('strong', null, fmtEuro(l.du)) },
      { label: 'Déjà versé', num: true, render: (l) => fmtEuro(l.verse) },
      { label: 'Reste à verser', num: true, render: (l) => resteTxt(l.reste) },
    ], v.lignes);
    tableau.querySelector('table').appendChild(h('tfoot', null, h('tr', { class: 'strong' }, h('td', null, 'Total'),
      h('td', { class: 'num' }, fmtEuro(v.apport)), h('td', { class: 'num' }, fmtEuro(v.pret)), h('td', { class: 'num' }, fmtEuro(v.du)), h('td', { class: 'num' }, fmtEuro(v.verse)), h('td', { class: 'num' }, resteTxt(v.reste)))));
    return { v, tableau, nom };
  }
  function tabVersements(ctx) {
    const s = ctx.state;
    const saisie = s.acquereurs.map((a, i) => ui.card('Versements de ' + (a.nom || 'l\'acquéreur ' + (i + 1)), h('div', { class: 'qt-acq stack-sm', style: { '--c': COULEURS[i % COULEURS.length] } },
      h('div', { class: 'rows' }, (a.versements || []).map((x) => h('div', { class: 'row-line qt-vers' },
        f('Date', ctx.date(x, 'date')),
        f('Nature', ctx.text(x, 'libelle', { placeholder: 'ex. acompte, provision sur frais, déblocage du prêt' })),
        f('Montant', ctx.num(x, 'montant', { suffix: '€' })),
        retirer(ctx, a.versements, x)))),
      !(a.versements || []).length ? h('p', { class: 'small muted' }, 'Aucun versement enregistré.') : null,
      ui.button('Ajouter un versement', { icon: 'plus', variant: 'soft', small: true, onClick: () => {
        a.versements = a.versements || [];
        a.versements.push({ id: uid('v'), date: A.util.todayISO(), libelle: a.versements.length ? 'Virement' : 'Dépôt de garantie', montant: null });
        ctx.render(); ctx.changed();
      } }))));
    const recap = ctx.live((r) => {
      const { v, tableau, nom } = recapVersements(s, r);
      const copier = async () => {
        const txt = [s.reference || 'Fonds à verser à l\'étude'].concat(v.lignes.map((l, i) => nom(l, i) + ' : à verser ' + fmtEuro(l.du) + ' (apport ' + fmtEuro(l.apport) + ' + prêt ' + fmtEuro(l.pret) + '), déjà versé ' + fmtEuro(l.verse)
          + (l.reste < -0.005 ? ', trop-versé ' + fmtEuro(-l.reste) : ', reste à verser ' + fmtEuro(Math.max(0, l.reste))))).join('\n');
        try { await navigator.clipboard.writeText(txt); ui.toast('Récapitulatif copié.'); } catch (e) { ui.toast('Copie impossible.', 'error'); }
      };
      return ui.card('Reste à verser', h('div', { class: 'stack-sm' }, tableau,
        v.coherent ? null : ui.note('Les apports saisis (' + fmtEuro(v.du) + ') ne correspondent pas aux fonds nécessaires à l\'étude (' + fmtEuro(v.besoin)
          + ' = coût de l\'acquisition' + (v.fraisALaBanque ? ' hors frais de prêt' : '') + ') : écart de ' + fmtEuro(Math.abs(v.ecart)) + '. Vérifiez les apports dans le premier onglet.', 'warn'),
        h('p', { class: 'small muted' }, 'Somme globale appelée : à verser = apport de chacun' + (v.fraisALaBanque ? ' (moins sa part des frais de prêt, réglés à la banque)' : '') + ' + sa part du prêt, à débloquer entre les mains de l\'étude. Enregistrez le déblocage du prêt comme un versement.'),
        h('div', { class: 'chips' }, ui.button('Copier le récapitulatif', { icon: 'copy', variant: 'soft', small: true, onClick: copier }))));
    });
    const reglage = ui.card('Frais de prêt', f('Les frais de prêt sont', ctx.segmented(s, 'fraisPretsEtude', [{ value: false, label: 'Réglés directement à la banque' }, { value: true, label: 'Appelés par l\'étude' }], { small: true })));
    return h('div', { class: 'stack' }, recap, reglage, saisie);
  }

  /* ---------- Panneau et impression ---------- */
  function aside(ctx) {
    return ui.card('En un coup d\'œil', ctx.live((r) => [
      h('ul', { class: 'aside-list' }, r.lignes.map((l, i) => h('li', null, h('span', null, l.nom || 'Acquéreur ' + (i + 1)), h('strong', null, pct2(l.quotiteArrondie))))),
      r.equilibre ? ui.badge(true, 'Financement équilibré') : ui.badge(false, 'Écart de ' + fmtEuro(Math.abs(r.ecart))),
    ]), { className: 'aside-card' });
  }
  function print(ctx) {
    const s = ctx.state, r = ctx.result;
    ui.print(ui.printDoc({
      title: 'Quotités d\'acquisition',
      subtitle: s.reference || null,
      meta: [],
      body: [
        h('h2', null, 'Coût de l\'acquisition'),
        ui.table([{ label: 'Poste', key: 'libelle' }, { label: 'Montant', num: true, render: (x) => fmtEuro(x.montant) }], s.emplois.filter((x) => x.montant), { compact: true, total: { libelle: 'Total', montant: r.baseEmplois } }),
        h('h2', null, 'Financement et quotités'),
        resultat(s, r),
        ...(E.versements(s, r).verse ? [h('h2', null, 'Fonds versés et reste à verser'), recapVersements(s, r).tableau] : []),
        h('div', { class: 'page-break' }),
        clauseHtml(clauseDe(s, r).blocs),
      ],
      footer: 'Calcul établi d\'après les montants communiqués ; à vérifier avant reprise dans l\'acte.',
    }), 'Quotités ' + (s.reference || ''));
  }
  function normalize(s) {
    s.acquereurs = (s.acquereurs || []).map((a) => Object.assign(nouvelAcquereur(), a, { apports: a.apports && a.apports.length ? a.apports : nouvelAcquereur().apports }));
    s.prets = (s.prets || []).map((p) => Object.assign({ egal: true, repartition: {}, preteur: '' }, p));
    // Dossiers créés avant la clause de l'étude : postes du coût et méthode de l'étude.
    if (!(s.emplois || []).some((x) => x.code)) {
      const anciens = s.emplois || [];
      const postes = emploisDefaut();
      ['prix', 'fraisVente', 'fraisNegociation'].forEach((code, i) => { if (anciens[i]) postes.find((x) => x.code === code).montant = anciens[i].montant; });
      anciens.slice(3).forEach((x) => postes.push(Object.assign({}, x, { code: 'autre' })));
      s.emplois = postes;
      s.fraisDansCout = true;
      s.methode = 2;
    }
    POSTES.forEach(([code, libelle]) => {
      const x = s.emplois.find((e) => e.code === code);
      if (x) x.libelle = libelle; else s.emplois.push({ id: uid('e'), code, libelle, montant: null });
    });
    return s;
  }

  const mount = A.simulator({
    app, paramsSection: 'commun', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.reference || s.acquereurs.map((a) => a.nom).filter(Boolean).join(' / '),
    tabs: [
      { id: 'saisie', label: 'Financement et quotités', render: tabSaisie },
      { id: 'versements', label: 'Versements', render: tabVersements },
      { id: 'clause', label: 'Clause pour l\'acte', render: tabClause },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
