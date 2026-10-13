/*
 * Application « Origine de propriété » : saisie de la chaîne de propriété,
 * rédaction automatique à partir des trames, copie vers Word, éditeur de trames.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, fmtDate } = A.util;
  const ui = A.ui;
  const E = A.engines.origine;

  const app = {
    id: 'origine',
    fileSuffix: 'origine',
    title: 'Origine de propriété',
    caption: 'Rédaction trentenaire',
    icon: 'origine',
    gradient: 'linear-gradient(150deg, #2b6555 0%, #4f9a82 100%)',
  };

  const empty = () => ({ reference: '', vendeurDirect: true, personnes: [], actes: [E.nouvelActe('vente')] });
  const isEmpty = (s) => !s.reference && !s.personnes.length && s.actes.every((a) => !a.date && !a.acquereurs.length);
  function normalize(s) {
    if (s.vendeurDirect === undefined) s.vendeurDirect = true;
    s.personnes = (s.personnes || []).map((p) => E.nouvellePersonne(p));
    s.actes = (s.actes || []).map((a) => E.completerActe(Object.assign(E.nouvelActe(a.type), a)));
    return s;
  }

  function options(params) {
    return { trames: params.trames || {}, datesEnLettres: !!params.datesEnLettres, prixEnLettres: params.prixEnLettres !== false };
  }
  const compute = (s, params) => E.rediger(s, options(params));

  const nom = (s, id) => {
    const p = s.personnes.find((x) => x.id === id);
    return p ? (p.nom || p.prenoms ? E.nomCourt(p) : 'Personne sans nom') : 'Personne supprimée';
  };

  /* ---------- Sélecteur de personnes ---------- */
  async function creerPersonne(ctx) {
    const p = E.nouvellePersonne();
    const corps = h('div', { class: 'grid-3 dialog-form' },
      ui.field('Civilité', ui.segmented({ value: 'M', options: [{ value: 'M', label: 'M.' }, { value: 'Mme', label: 'Mme' }], onChange: (v) => (p.civilite = v) })),
      ui.field('Prénoms', ui.textInput({ value: '', onChange: (v) => (p.prenoms = v) })),
      ui.field('Nom', ui.textInput({ value: '', onChange: (v) => (p.nom = v) })));
    const ok = await ui.dialog('Nouvelle personne', corps, [{ label: 'Annuler', value: false, variant: 'ghost' }, { label: 'Ajouter', value: true, variant: 'primary' }]);
    if (!ok || !(p.nom || p.prenoms)) return null;
    ctx.state.personnes.push(p);
    ui.toast('Pensez à compléter son état civil dans l\'onglet Personnes.');
    return p.id;
  }

  // Plusieurs personnes (liste d'identifiants).
  function choixPersonnes(ctx, liste, opts) {
    const s = ctx.state;
    const o = opts || {};
    const dispo = s.personnes.filter((p) => !liste.includes(p.id));
    const select = h('select', { class: 'input select chip-add', 'aria-label': 'Ajouter une personne' },
      h('option', { value: '' }, liste.length ? '+ Ajouter…' : '+ Choisir…'),
      dispo.map((p) => h('option', { value: p.id }, nom(s, p.id))),
      h('option', { value: '__nouveau' }, '+ Nouvelle personne…'));
    select.addEventListener('change', async () => {
      const v = select.value;
      select.value = '';
      const id = v === '__nouveau' ? await creerPersonne(ctx) : v;
      if (!id) return;
      if (o.single) liste.splice(0, liste.length, id);
      else liste.push(id);
      ctx.render();
      ctx.changed();
    });
    return h('div', { class: 'chips' },
      liste.map((id, i) => h('span', { class: 'chip' }, nom(s, id),
        h('button', { type: 'button', class: 'chip-x', 'aria-label': 'Retirer ' + nom(s, id), onclick: () => { liste.splice(i, 1); ctx.render(); ctx.changed(); } }, '×'))),
      o.single && liste.length ? null : select);
  }

  function textarea(obj, key, ctx, placeholder) {
    const t = h('textarea', { class: 'input textarea', rows: 3, placeholder: placeholder || '' });
    t.value = obj[key] || '';
    t.addEventListener('input', () => { obj[key] = t.value; ctx.changed(); });
    return t;
  }

  function notaireInputs(obj, key, ctx) {
    if (!obj[key] || typeof obj[key] !== 'object') obj[key] = { nom: '', ville: '' };
    const n = obj[key];
    return h('div', { class: 'pair' },
      ctx.text(n, 'nom', { placeholder: 'Prénom et nom du notaire', ariaLabel: 'Nom du notaire' }),
      ctx.text(n, 'ville', { placeholder: 'Résidence', ariaLabel: 'Résidence du notaire' }));
  }

  /* ---------- Onglet « Chaîne de propriété » ---------- */
  function champ(ctx, a, c) {
    if (c.si && !c.si(a)) return null;
    const label = typeof c.libelle === 'function' ? c.libelle(a) : c.libelle;
    let control;
    switch (c.type) {
      case 'texte': control = ctx.text(a, c.cle); break;
      case 'zone': control = textarea(a, c.cle, ctx); break;
      case 'date': control = ctx.date(a, c.cle); break;
      case 'montant':
        control = h('div', { class: 'with-unit' },
          ctx.num(a, c.cle, { suffix: a.prixDevise === 'FRF' ? 'F' : '€' }),
          ctx.segmented(a, 'prixDevise', [{ value: 'EUR', label: '€' }, { value: 'FRF', label: 'F' }], { structural: true, small: true, ariaLabel: 'Devise' }));
        break;
      case 'choix':
        control = c.options.length === 2
          ? ctx.segmented(a, c.cle, c.options.map(([value, l]) => ({ value, label: l })), { structural: true, small: true })
          : ctx.select(a, c.cle, c.options.map(([value, l]) => ({ value, label: l })), { structural: true });
        break;
      case 'oui-non': control = ctx.yesNo(a, c.cle, { structural: true }); break;
      case 'notaire': control = notaireInputs(a, c.cle, ctx); break;
      case 'personnes': if (!Array.isArray(a[c.cle])) a[c.cle] = []; control = choixPersonnes(ctx, a[c.cle]); break;
      case 'personne': {
        const l = a[c.cle] ? [a[c.cle]] : [];
        control = choixPersonnes(ctx, new Proxy(l, {
          set(t, k, v) { t[k] = v; a[c.cle] = t[0] || ''; return true; },
          deleteProperty(t, k) { delete t[k]; a[c.cle] = t[0] || ''; return true; },
        }), { single: true });
        break;
      }
      default: control = ctx.text(a, c.cle);
    }
    const wide = ['zone', 'personnes', 'personne', 'notaire'].includes(c.type);
    return ui.field(label, control, { help: c.aide, wide });
  }

  function acteCard(ctx, a, i) {
    const s = ctx.state;
    const t = E.TYPES[a.type] || E.TYPES.vente;
    const precedent = i > 0 ? s.actes[i - 1] : null;
    const reprendre = precedent && !a.acquereurs.length ? (precedent.type === 'partage' ? precedent.defunts : precedent.cedants) || [] : [];

    const parties = h('div', { class: 'grid-2' },
      ui.field(t.acquereurs, h('div', null, choixPersonnes(ctx, a.acquereurs),
        reprendre.length ? ui.button('Reprendre les précédents propriétaires de l\'origine n° ' + i, {
          small: true, variant: 'soft', onClick: () => { a.acquereurs.push(...reprendre); ctx.render(); ctx.changed(); },
        }) : null), { help: i === 0 ? 'En principe, le vendeur aux présentes.' : null }),
      ui.field(t.cedants, choixPersonnes(ctx, a.cedants)));

    const acte = h('div', { class: 'grid-2' },
      ui.field(t.acte + ' — date', ctx.date(a, 'date')),
      ui.field(t.acte + ' — notaire', notaireInputs(a, 'notaire', ctx)),
      ui.field('Publication — service de la publicité foncière', ctx.text(a.publication, 'service', { placeholder: 'ex. Lyon 1er' })),
      ui.field('Date de publication', ctx.date(a.publication, 'date'), { help: 'Avant 1956 : rédigé comme une transcription.' }),
      ui.field('Volume', ctx.text(a.publication, 'volume', { placeholder: 'ex. 2015P' })),
      ui.field('Numéro', ctx.text(a.publication, 'numero')));

    const specifiques = t.champs.map((c) => champ(ctx, a, c)).filter(Boolean);
    const etat = h('div', { class: 'grid-2' },
      ui.field('État hypothécaire', ctx.segmented(a.etat, 'mode', [{ value: 'negatif', label: 'Négatif' }, { value: 'texte', label: 'Autre (à rédiger)' }], { structural: true, small: true })),
      a.etat.mode === 'texte' ? ui.field('Résultat de l\'état', textarea(a.etat, 'texte', ctx, 'ex. a révélé une hypothèque conventionnelle… radiée depuis'), { wide: true, help: 'Complète la phrase « L\'état délivré sur cette formalité … ».' }) : null);

    const apercu = h('details', { class: 'sub-details' }, h('summary', null, 'Aperçu du texte de cette origine'),
      ctx.live((r) => {
        const b = r.blocs[i];
        return b ? h('div', { class: 'redaction redaction-sm' }, b.paragraphes.map((p) => paragraphe(p))) : null;
      }));

    return ui.card(h('span', null, 'Origine n° ' + (i + 1), h('span', { class: 'card-title-sub' }, i === 0 ? ' · immédiate' : ' · antérieure')), h('div', { class: 'stack-sm' },
      a.importNotes ? h('details', { class: 'import-notes' }, h('summary', null, 'Relevé sur l\'état hypothécaire'), h('p', null, a.importNotes)) : null,
      ui.field("Type d'acte", ui.selectInput({
        value: a.type, options: E.TYPES_LISTE.map((x) => ({ value: x.id, label: x.libelle })),
        onChange: (v) => { a.type = v; E.completerActe(a); ctx.render(); ctx.changed(); },
      })),
      h('h4', { class: 'form-sub' }, 'Parties'), parties,
      h('h4', { class: 'form-sub' }, 'Acte et publication'), acte,
      specifiques.length ? [h('h4', { class: 'form-sub' }, 'Particularités'), h('div', { class: 'grid-2' }, specifiques)] : null,
      etat, apercu), {
      className: 'acte',
      subtitle: t.libelle + (a.date ? ' · ' + fmtDate(a.date) : ''),
      actions: [
        ui.button('Monter', { icon: 'up', iconOnly: true, variant: 'ghost', small: true, disabled: i === 0, onClick: () => { s.actes.splice(i - 1, 0, s.actes.splice(i, 1)[0]); ctx.render(); ctx.changed(); } }),
        ui.button('Descendre', { icon: 'down', iconOnly: true, variant: 'ghost', small: true, disabled: i === s.actes.length - 1, onClick: () => { s.actes.splice(i + 1, 0, s.actes.splice(i, 1)[0]); ctx.render(); ctx.changed(); } }),
        ui.button('Supprimer', { icon: 'trash', variant: 'ghost', small: true, onClick: async () => {
          if (await ui.confirm('Supprimer cette origine ?', 'Origine n° ' + (i + 1) + ' (' + t.libelle + ').', 'Supprimer')) { s.actes.splice(i, 1); ctx.render(); ctx.changed(); }
        } }),
      ],
    });
  }

  function tabActes(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' },
      ui.card('Le dossier', h('div', { class: 'grid-2' },
        ui.field('Référence du dossier', ctx.text(s, 'reference', { placeholder: 'ex. Vente DUPONT / MARTIN' })),
        ui.field('Bénéficiaires de l\'origine immédiate désignés « le VENDEUR »', ctx.yesNo(s, 'vendeurDirect', { structural: true }),
          { help: 'Oui : le propriétaire actuel, déjà identifié en tête d\'acte, n\'est pas redésigné (« appartient au VENDEUR »).' }),
        isEmpty(s) ? h('div', { class: 'suggest' },
          h('div', null, h('div', { class: 'suggest-label' }, 'Découvrir'), h('div', { class: 'suggest-value' }, 'Charger un dossier d\'exemple fictif')),
          ui.button('Charger l\'exemple', { small: true, variant: 'soft', onClick: () => { Object.assign(s, normalize(E.exemple())); ctx.render(); ctx.changed(); } })) : null)),
      ui.card('Depuis un état hypothécaire', h('div', { class: 'import-line' },
        h('p', { class: 'muted' }, 'Importez un état hors formalités (PDF de l\'ANF) : les formalités informatisées concernant le bien sont transformées en origines, les personnes sont créées. Les fiches manuscrites s\'affichent à côté du formulaire.'),
        h('div', { class: 'card-actions' },
          A.importEtat.courant() && A.importEtat.courant().analyse.pagesScannees.length
            ? ui.button('Fiches scannées (' + A.importEtat.courant().analyse.pagesScannees.length + ')', { icon: 'file', variant: 'ghost', small: true, onClick: () => A.importEtat.ouvrirFiches() }) : null,
          ui.button('Importer un état (PDF)', { icon: 'upload', variant: 'primary', small: true, onClick: () => A.importEtat.importer(ctx, (res, mode) => {
            s.personnes.push(...res.personnes);
            if (mode === 'remplacer') s.actes = res.actes;
            else s.actes.push(...res.actes);
            ctx.render();
            ctx.changed();
          }) })))),
      ui.note('Saisissez les origines de la plus récente à la plus ancienne, jusqu\'à remonter à plus de trente ans. Chaque personne n\'est saisie qu\'une fois : son état civil complet est donné à sa première mention, puis elle est rappelée « susnommée ».'),
      s.actes.map((a, i) => acteCard(ctx, a, i)),
      h('div', { class: 'add-row' }, ui.button('Ajouter une origine antérieure', {
        icon: 'plus', variant: 'soft', onClick: () => {
          const prec = s.actes[s.actes.length - 1];
          const a = E.nouvelActe('vente');
          if (prec) a.acquereurs = ((prec.type === 'partage' ? prec.defunts : prec.cedants) || []).slice();
          s.actes.push(a);
          ctx.render();
          ctx.changed();
        },
      })));
  }

  /* ---------- Onglet « Personnes » ---------- */
  function roles(s, id) {
    const out = [];
    s.actes.forEach((a, i) => {
      const t = E.TYPES[a.type] || E.TYPES.vente;
      if (a.acquereurs.includes(id)) out.push(t.acquereurs.replace('(s)', '') + ' (origine ' + (i + 1) + ')');
      if (a.cedants.includes(id)) out.push(t.cedants.replace('(s)', '') + ' (origine ' + (i + 1) + ')');
      ['defunts', 'autresDonataires'].forEach((k) => { if ((a[k] || []).includes(id)) out.push((k === 'defunts' ? 'Défunt' : 'Donataire') + ' (origine ' + (i + 1) + ')'); });
      if (a.predecede === id) out.push('Prédécédé (origine ' + (i + 1) + ')');
    });
    return out;
  }

  function boutonSupprimer(ctx, p, i, r) {
    const s = ctx.state;
    return ui.button('Supprimer', { icon: 'trash', variant: 'ghost', small: true, onClick: async () => {
      if (r.length && !(await ui.confirm('Supprimer cette personne ?', 'Elle sera retirée des origines où elle figure : ' + r.join(', ') + '.', 'Supprimer'))) return;
      s.personnes.splice(i, 1);
      s.actes.forEach((a) => {
        ['acquereurs', 'cedants', 'defunts', 'autresDonataires'].forEach((k) => { if (Array.isArray(a[k])) a[k] = a[k].filter((x) => x !== p.id); });
        if (a.predecede === p.id) a.predecede = '';
      });
      ctx.render();
      ctx.changed();
    } });
  }

  function personneCard(ctx, p, i) {
    const s = ctx.state;
    const { field } = ui;
    const r = roles(s, p.id);
    const vendeur = s.vendeurDirect !== false && s.actes[0] && s.actes[0].acquereurs.includes(p.id);
    const titre = h('span', null, p.nom || p.prenoms ? E.nomCourt(p) : 'Nouvelle personne',
      vendeur ? h('span', { class: 'tag tag-accent' }, 'le VENDEUR') : null,
      p.importe ? h('span', { class: 'tag tag-warn' }, 'importée — à compléter') : null);
    const nature = field('Nature', ctx.segmented(p, 'morale', [{ value: false, label: 'Personne physique' }, { value: true, label: 'Société' }], { small: true, structural: true }));
    if (p.morale) {
      return ui.card(titre, h('div', { class: 'stack-sm' },
        h('div', { class: 'grid-3' },
          nature,
          field('Dénomination', ctx.text(p, 'nom', { placeholder: 'ex. SCI DU BANAY' })),
          field('Forme sociale', ctx.text(p, 'profession', { placeholder: 'ex. société civile immobilière' }), { optional: true }),
          field('Siège social', ctx.text(p, 'domicile', { placeholder: 'ex. ORANGE (84100), 2 rue des Prés' }), { wide: true }),
          field('Numéro SIREN', ctx.text(p, 'siren')),
          field('Déjà désignée dans l\'acte en cours ?', ctx.yesNo(p, 'dejaDesigne'))),
        h('div', { class: 'designation' }, h('span', { class: 'suggest-label' }, 'Désignation complète'),
          ctx.live(() => h('p', null, paragraphe(E.designation(p, options(ctx.params()))))))), {
        subtitle: r.length ? r.join(' · ') : 'Pas encore rattachée à une origine',
        actions: boutonSupprimer(ctx, p, i, r),
      });
    }
    return ui.card(titre, h('div', { class: 'stack-sm' },
      vendeur ? ui.note('Vendeur aux présentes : désigné « le VENDEUR » dans l\'origine, sans reprise de son état civil (déjà donné en tête d\'acte).') : null,
      h('div', { class: 'grid-3' },
        nature,
        h('div'), h('div'),
        field('Civilité', ctx.segmented(p, 'civilite', [{ value: 'M', label: 'Monsieur' }, { value: 'Mme', label: 'Madame' }], { small: true, structural: true })),
        field('Prénoms', ctx.text(p, 'prenoms', { placeholder: 'dans l\'ordre de l\'état civil' })),
        field('Nom de naissance', ctx.text(p, 'nom')),
        field("Nom d'usage", ctx.text(p, 'nomUsage', { placeholder: 'ex. nom d\'épouse' }), { optional: true }),
        field('Profession', ctx.text(p, 'profession')),
        field('Nationalité', ctx.text(p, 'nationalite', { placeholder: 'française' }), { optional: true }),
        field('Domicile', ctx.text(p, 'domicile', { placeholder: 'ex. LYON (69003), 12 rue Paul Bert' }), { wide: true }),
        field('Date de naissance', ctx.date(p, 'naissanceDate')),
        field('Lieu de naissance', ctx.text(p, 'naissanceLieu', { placeholder: 'ex. VILLEURBANNE (69100)' })),
        h('div'),
        field('Situation matrimoniale', textarea(p, 'situation', ctx, 'ex. époux de Madame Claire MARTIN, avec laquelle il est marié sous le régime de la communauté légale…'), { wide: true }),
        field('Décédé(e) ?', ctx.yesNo(p, 'decede', { structural: true })),
        p.decede ? field('Date du décès', ctx.date(p, 'decesDate')) : null,
        p.decede ? field('Lieu du décès', ctx.text(p, 'decesLieu')) : null,
        p.decede ? field('Décès en son domicile ?', ctx.yesNo(p, 'decesDomicile')) : null,
        field('Déjà désigné(e) dans l\'acte en cours ?', ctx.yesNo(p, 'dejaDesigne'), { help: 'Oui : la personne est seulement rappelée (« susnommé »), sans état civil.' })),
      h('div', { class: 'designation' }, h('span', { class: 'suggest-label' }, 'Désignation complète'),
        ctx.live(() => h('p', null, paragraphe(E.designation(p, options(ctx.params()))))))), {
      subtitle: r.length ? r.join(' · ') : 'Pas encore rattachée à une origine',
      actions: boutonSupprimer(ctx, p, i, r),
    });
  }

  function tabPersonnes(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' },
      ui.note('Les personnes ajoutées depuis une origine apparaissent ici : complétez leur état civil. Il ne sera rédigé qu\'une fois, à la première mention.'),
      s.personnes.length ? s.personnes.map((p, i) => personneCard(ctx, p, i)) : ui.card(null, h('p', { class: 'muted' }, 'Aucune personne pour l\'instant.')),
      h('div', { class: 'add-row' }, ui.button('Ajouter une personne', { icon: 'plus', variant: 'soft', onClick: () => { s.personnes.push(E.nouvellePersonne()); ctx.render(); } })));
  }

  /* ---------- Texte rédigé ---------- */
  function paragraphe(segs) {
    return segs.map((x) => (x.m !== undefined ? h('mark', { class: 'manque', title: 'À compléter : ' + x.m }, x.m) : x.t.split('\n').flatMap((l, i) => (i ? [h('br'), l] : [l]))));
  }
  function redaction(r) {
    return h('div', { class: 'redaction' }, r.blocs.map((b) => [h('h3', null, b.titre), b.paragraphes.map((p) => h('p', null, paragraphe(p)))]));
  }

  async function copier(r) {
    const html = E.html(r.blocs), texte = E.texte(r.blocs);
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texte], { type: 'text/plain' }) })]);
      } else throw new Error('indisponible');
    } catch (e) {
      // Repli : sélection d'un bloc mis en forme puis copie classique.
      const div = h('div', { contenteditable: 'true', style: { position: 'fixed', left: '-9999px', top: '0' }, html });
      document.body.appendChild(div);
      const range = document.createRange();
      range.selectNodeContents(div);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
      div.remove();
    }
    ui.toast(r.manquants ? 'Texte copié. ' + r.manquants + ' élément(s) restent à compléter (« ...... »).' : 'Texte copié : collez-le dans votre acte (Ctrl + V).');
  }

  function telechargerWord(s, r) {
    const doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
      + '<head><meta charset="utf-8"><title>Origine de propriété</title></head><body style="font-family:\'Times New Roman\',serif;font-size:12pt">' + E.html(r.blocs) + '</body></html>';
    const blob = new Blob(['﻿' + doc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: (A.util.slug(s.reference) || 'origine-de-propriete') + '.doc' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.toast('Fichier Word téléchargé.');
  }

  function optionsRedaction(ctx) {
    const p = A.store.getParams().origine;
    const set = (k, v) => { A.store.setParams('origine', Object.assign({}, A.store.getParams().origine, { [k]: v })); ctx.changed(); };
    return h('div', { class: 'options-line' },
      ui.field('Dates', ui.segmented({ value: !!p.datesEnLettres, small: true, options: [{ value: false, label: '15 mars 2010' }, { value: true, label: 'En lettres' }], onChange: (v) => set('datesEnLettres', v) })),
      ui.field('Prix', ui.segmented({ value: p.prixEnLettres !== false, small: true, options: [{ value: true, label: 'Lettres et chiffres' }, { value: false, label: 'Chiffres' }], onChange: (v) => set('prixEnLettres', v) })));
  }

  function tabTexte(ctx) {
    const s = ctx.state;
    return h('div', { class: 'stack' },
      ui.card('Texte rédigé', h('div', { class: 'stack-sm' },
        h('div', { class: 'texte-toolbar' },
          optionsRedaction(ctx),
          h('div', { class: 'card-actions' },
            ui.button('Télécharger (.doc)', { icon: 'save', variant: 'ghost', small: true, onClick: () => telechargerWord(s, ctx.result) }),
            ui.button('Copier pour Word', { icon: 'copy', variant: 'primary', small: true, onClick: () => copier(ctx.result) }))),
        ctx.live((r) => r.manquants ? ui.note(r.manquants + ' élément(s) à compléter, surlignés ci-dessous. Ils apparaîtront « ...... » dans Word.', 'warn') : null),
        ctx.live((r) => (r.blocs.length ? redaction(r) : h('p', { class: 'muted' }, 'Ajoutez une origine pour voir le texte.'))))));
  }

  /* ---------- Onglet « Trames » ---------- */
  let trameSel = 'acte:vente';

  function tabTrames(ctx) {
    const overrides = () => Object.assign({}, A.store.getParams().origine.trames || {});
    const actes = E.IDS_TRAMES.filter((id) => id.startsWith('acte:'));
    const communs = E.IDS_TRAMES.filter((id) => id.startsWith('commun:'));
    const item = (id) => h('button', {
      type: 'button', class: ['trame-item', id === trameSel ? 'is-active' : ''],
      onclick: () => { trameSel = id; ctx.render(); },
    }, E.nomTrame(id), overrides()[id] !== undefined ? h('span', { class: 'tag tag-accent' }, 'modifiée') : null);

    const valeur = overrides()[trameSel] !== undefined ? overrides()[trameSel] : E.TRAMES_DEFAUT[trameSel];
    const editeur = h('textarea', { class: 'input textarea trame-editeur', rows: 16, spellcheck: 'true', 'aria-label': 'Texte de la trame' });
    editeur.value = valeur;
    const statut = h('span', { class: 'muted small' });
    function enregistrer() {
      const o = overrides();
      if (editeur.value === E.TRAMES_DEFAUT[trameSel]) delete o[trameSel];
      else o[trameSel] = editeur.value;
      A.store.setParams('origine', Object.assign({}, A.store.getParams().origine, { trames: o }));
      statut.textContent = 'Enregistré sur ce poste.';
      ctx.changed();
    }
    editeur.addEventListener('input', A.util.debounce(enregistrer, 250));

    const inserer = (texte) => {
      const d = editeur.selectionStart, f = editeur.selectionEnd;
      editeur.setRangeText(texte, d, f, 'end');
      editeur.focus();
      enregistrer();
    };
    const doc = E.documentation(trameSel);
    const aide = h('div', { class: 'trame-aide' },
      h('h4', { class: 'form-sub' }, 'Variables disponibles'),
      h('div', { class: 'var-chips' }, doc.variables.map(([n, d]) => h('button', { type: 'button', class: 'var-chip', title: d, onclick: () => inserer('{' + n + '}') }, '{' + n + '}'))),
      doc.groupes.length ? [h('h4', { class: 'form-sub' }, 'Accords'), h('div', { class: 'var-chips' }, doc.groupes.map((g) =>
        h('button', { type: 'button', class: 'var-chip', title: 'Accord selon le genre et le nombre', onclick: () => inserer('{accord ' + g + ' : il | elle | ils | elles}') }, '{accord ' + g + ' : … }')))] : null,
      h('details', { class: 'sub-details' }, h('summary', null, 'Syntaxe des trames'),
        h('ul', { class: 'bullets small' },
          h('li', null, h('code', null, '{variable}'), ' insère une valeur ; si elle n\'est pas saisie, « ...... » apparaît.'),
          h('li', null, h('code', null, '{si variable} … {sinon} … {fin}'), ' : passage conditionnel. Aussi ', h('code', null, '{si paiement = terme}'), ' et ', h('code', null, '{si non variable}'), '.'),
          h('li', null, h('code', null, '{accord acquereurs : il | elle | ils | elles}'), ' : accord en genre et en nombre ; avec deux formes, singulier | pluriel.'),
          h('li', null, 'Une ligne vide sépare deux paragraphes. Un paragraphe vide (condition non remplie) disparaît.'))));

    const reset = ui.button('Rétablir la trame d\'origine', {
      icon: 'reset', variant: 'ghost', small: true, disabled: overrides()[trameSel] === undefined,
      onClick: async () => {
        if (!(await ui.confirm('Rétablir la trame d\'origine ?', 'Vos modifications de « ' + E.nomTrame(trameSel) + ' » seront perdues.', 'Rétablir'))) return;
        const o = overrides();
        delete o[trameSel];
        A.store.setParams('origine', Object.assign({}, A.store.getParams().origine, { trames: o }));
        ctx.render();
        ctx.changed();
      },
    });

    const apercu = ctx.live(() => {
      const ap = E.apercu(trameSel, ctx.state, options(ctx.params()));
      return [
        ap.erreurs.length ? ui.note(ap.erreurs.join(' '), 'warn') : null,
        ap.inconnues.length ? ui.note('Variable(s) inconnue(s) : ' + ap.inconnues.map((x) => '{' + x + '}').join(', '), 'warn') : null,
        ap.exemple ? h('p', { class: 'field-help' }, 'Aucune origine de ce type dans le dossier : aperçu sur un exemple fictif.') : null,
        ap.bloc ? h('div', { class: 'redaction redaction-sm' }, h('h3', null, ap.bloc.titre), ap.bloc.paragraphes.map((p) => h('p', null, paragraphe(p)))) : h('p', { class: 'muted' }, 'Ajoutez une origine pour voir l\'aperçu.'),
      ];
    });

    return h('div', { class: 'trames' },
      h('nav', { class: 'card trame-liste' },
        h('div', { class: 'trame-groupe' }, 'Trames par type d\'acte'), actes.map(item),
        h('div', { class: 'trame-groupe' }, 'Éléments communs'), communs.map(item)),
      h('div', { class: 'stack' },
        ui.card(E.nomTrame(trameSel), h('div', { class: 'stack-sm' }, editeur, statut, aide), { actions: reset, subtitle: 'Vos modifications s\'appliquent à tous les dossiers de ce poste ; exportez-les depuis Paramètres pour les partager.' }),
        ui.card('Aperçu', apercu)));
  }

  /* ---------- Panneau latéral ---------- */
  function aside(ctx) {
    return ui.card('Contrôles', ctx.live((r) => [
      h('div', { class: 'checks' },
        r.controles.map((c) => ui.badge(c.ok, c.texte)),
        r.manquants ? ui.badge(false, r.manquants + ' élément(s) à compléter') : r.blocs.length ? ui.badge(true, 'Toutes les mentions sont renseignées') : null,
        r.erreurs.length ? ui.badge(false, 'Trame à corriger : ' + r.erreurs[0]) : null),
      ui.button('Copier pour Word', { icon: 'copy', variant: 'primary', small: true, onClick: () => copier(r) }),
      ui.button('Voir le texte rédigé', { variant: 'soft', small: true, onClick: () => ctx.goTab('texte') }),
    ]), { className: 'aside-card aside-origine' });
  }

  function print(ctx) {
    const s = ctx.state, r = ctx.result;
    ui.print(ui.printDoc({
      title: 'Origine de propriété',
      subtitle: s.reference || null,
      meta: [h('div', { class: 'kv' }, h('span', null, 'Édité le'), h('strong', null, fmtDate(A.util.todayISO())))],
      body: redaction(r),
      footer: 'Projet de rédaction établi d\'après les titres saisis ; à relire avec les titres de propriété et les états hypothécaires.',
    }), 'Origine de propriété ' + (s.reference || ''));
  }

  const mount = A.simulator({
    app, paramsSection: 'origine', empty, isEmpty, normalize, compute, aside, print,
    reference: (s) => s.reference,
    tabs: [
      { id: 'actes', label: 'Chaîne de propriété', render: tabActes },
      { id: 'personnes', label: 'Personnes', render: tabPersonnes },
      { id: 'texte', label: 'Texte rédigé', render: tabTexte },
      { id: 'trames', label: 'Trames', render: tabTrames },
    ],
  });

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
