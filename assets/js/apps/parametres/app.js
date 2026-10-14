/*
 * Application « Paramètres » : barèmes et taux utilisés par les simulateurs.
 * Les modifications sont enregistrées sur ce poste ; elles peuvent être exportées
 * dans un fichier et importées sur le poste d'un collègue.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, clone, fmtPct, todayISO } = A.util;
  const ui = A.ui;

  const app = {
    id: 'parametres',
    title: 'Paramètres',
    caption: 'Barèmes et taux',
    icon: 'settings',
    gradient: 'linear-gradient(150deg, #434b5c 0%, #747d91 100%)',
  };

  const SECTIONS = [
    { id: 'commun', title: 'Barème commun', sub: "Valeur de l'usufruit viager (art. 669 CGI), utilisée par tous les outils." },
    { id: 'plusValue', title: 'Plus-value immobilière', sub: 'Taux d\'imposition et forfaits.' },
    { id: 'succession', title: 'Succession & donation', sub: 'Abattements, barème en ligne directe et régimes particuliers.' },
    { id: 'origine', title: 'Origine de propriété', sub: 'Présentation des dates et des prix ; trames de rédaction.' },
    { id: 'dossiers', title: 'Suivi des dossiers', sub: 'Pièces attendues à chaque étape ; communes soumises à un arrêté termites ou mérule.' },
  ];
  const ANCHOR = { 'plus-value': 'plusValue', succession: 'succession', commun: 'commun', origine: 'origine', dossiers: 'dossiers' };

  function mount(container, arg) {
    let params = A.store.getParams();

    // Enregistrement d'une section (barèmes triés). Pas de nouveau rendu pendant la saisie,
    // sauf changement de structure (ajout ou retrait d'une ligne).
    const persist = A.util.debounce((section) => {
      const v = clone(params[section]);
      if (v.bareme669) v.bareme669.sort((a, b) => a.age - b.age);
      if (v.bareme777) v.bareme777.sort((a, b) => a.de - b.de);
      A.store.setParams(section, v);
      const tag = document.getElementById('modifie-' + section);
      if (tag) tag.hidden = false;
      const btn = document.getElementById('reset-' + section);
      if (btn) btn.disabled = false;
      ui.toast('Paramètres enregistrés sur ce poste.');
    }, 600);
    function save(section, structural) {
      persist(section);
      if (structural) render();
    }

    const num = (obj, key, section, opts) => ui.numberInput(Object.assign({}, opts, {
      value: obj[key], onChange: (v) => { if (v !== null) { obj[key] = v; save(section); } },
    }));
    const pct = (obj, key, section, opts) => num(obj, key, section, Object.assign({ percent: true }, opts));
    const row = (label, control, help) => h('div', { class: 'param-row' },
      h('div', null, h('div', { class: 'param-label' }, label), help ? h('div', { class: 'param-help' }, help) : null), control);

    async function reset(section, title) {
      if (await ui.confirm('Rétablir les valeurs par défaut ?', 'Section « ' + title + ' ». Les valeurs modifiées seront remplacées par celles d\'origine.', 'Rétablir')) {
        A.store.resetParams(section);
        params = A.store.getParams();
        render();
        ui.toast('Valeurs par défaut rétablies.');
      }
    }

    function sectionCommun() {
      const c = params.commun;
      const npCells = new WeakMap();
      return ui.table([
        { label: "Âge de l'usufruitier (à partir de)", render: (x) => num(x, 'age', 'commun', { suffix: 'ans', ariaLabel: 'Âge' }) },
        { label: 'Usufruit', render: (x) => {
          const np = h('span', { class: 'readonly' }, fmtPct(1 - x.usufruit));
          const input = ui.numberInput({ percent: true, value: x.usufruit, ariaLabel: 'Usufruit', onChange: (v) => {
            if (v === null) return;
            x.usufruit = v;
            np.textContent = fmtPct(1 - v);
            save('commun');
          } });
          npCells.set(x, np);
          return input;
        } },
        { label: 'Nue-propriété', num: true, render: (x) => npCells.get(x) },
      ], c.bareme669, { compact: true });
    }

    function sectionPlusValue() {
      const p = params.plusValue;
      return h('div', { class: 'param-list' },
        row("Taux d'impôt sur le revenu", pct(p, 'tauxIR', 'plusValue'), 'Art. 200 B CGI.'),
        row('Taux des prélèvements sociaux', pct(p, 'tauxPS', 'plusValue'), 'Plus-values immobilières des particuliers.'),
        row("Forfait de frais d'acquisition", pct(p, 'forfaitFrais', 'plusValue'), 'Acquisition à titre onéreux (art. 150 VB II 3° CGI).'),
        row('Forfait de travaux', pct(p, 'forfaitTravaux', 'plusValue'), 'Immeuble bâti détenu depuis plus de 5 ans (art. 150 VB II 4° CGI).'),
        row('Parité franc / euro', num(p, 'pariteFranc', 'plusValue', { suffix: 'F' }), '1 € = 6,55957 F.'));
    }

    function sectionSuccession() {
      const p = params.succession;
      const bareme = ui.table([
        { label: 'Au-delà de', render: (x) => num(x, 'de', 'succession', { suffix: '€', ariaLabel: 'Seuil' }) },
        { label: 'Taux', render: (x) => pct(x, 'taux', 'succession', { ariaLabel: 'Taux' }) },
      ], p.bareme777, { compact: true });
      const regimes = ui.table([
        { label: 'Régime', render: (x) => x.nom === 'Aucun' ? h('span', null, 'Aucun') : ui.textInput({ value: x.nom, ariaLabel: 'Nom du régime', onChange: (v) => { x.nom = v; save('succession'); } }) },
        { label: 'Exonération en succession', render: (x) => pct(x, 'succession', 'succession', { ariaLabel: 'Exonération en succession' }) },
        { label: 'Exonération en donation', render: (x) => pct(x, 'donation', 'succession', { ariaLabel: 'Exonération en donation' }) },
        { label: '', render: (x) => x.nom === 'Aucun' ? null : ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { p.regimes.splice(p.regimes.indexOf(x), 1); save('succession', true); } }) },
      ], p.regimes, { compact: true });
      return h('div', null,
        h('div', { class: 'param-list' },
          row('Abattement parent → enfant', num(p, 'abattEnfant', 'succession', { suffix: '€' }), 'Par parent et par enfant (art. 779 CGI).'),
          row('Abattement grand-parent → petit-enfant', num(p, 'abattPetitEnfant', 'succession', { suffix: '€' }), 'Donations seulement (art. 790 B CGI).'),
          row("Don familial de sommes d'argent", num(p, 'donFamilial', 'succession', { suffix: '€' }), 'Par donateur et donataire (art. 790 G CGI).'),
          row('Âge limite du donateur (don familial)', num(p, 'ageLimiteDonFamilial', 'succession', { suffix: 'ans' }), 'Le donateur doit avoir moins de cet âge.'),
          row('Délai du rappel fiscal', num(p, 'delaiRappel', 'succession', { suffix: 'ans' }), 'Art. 784 CGI.')),
        h('h4', { class: 'param-sub' }, 'Barème des droits en ligne directe (art. 777 CGI)'), bareme,
        h('h4', { class: 'param-sub' }, 'Régimes particuliers (exonération partielle de la valeur)'), regimes,
        ui.button('Ajouter un régime', { icon: 'plus', variant: 'soft', small: true, onClick: () => { p.regimes.push({ nom: 'Nouveau régime', succession: 0, donation: 0 }); save('succession', true); } }));
    }

    function sectionOrigine() {
      const p = params.origine;
      const nb = Object.keys(p.trames || {}).length;
      const choix = (cle, options) => ui.segmented({ value: cle === 'prixEnLettres' ? p[cle] !== false : !!p[cle], small: true, options, onChange: (v) => { p[cle] = v; save('origine'); } });
      return h('div', { class: 'param-list' },
        row('Dates', choix('datesEnLettres', [{ value: false, label: '15 mars 2010' }, { value: true, label: 'En lettres' }]), 'Présentation des dates dans le texte rédigé.'),
        row('Prix', choix('prixEnLettres', [{ value: true, label: 'Lettres et chiffres' }, { value: false, label: 'Chiffres' }]), 'Ex. : CENT MILLE EUROS (100 000,00 EUR).'),
        row('Trames de rédaction', h('a', { class: 'btn btn-soft btn-sm', href: '#/origine' }, 'Modifier les trames'),
          nb ? nb + ' trame(s) personnalisée(s) sur ce poste ; elles sont incluses dans l\'export.' : 'Trames d\'origine (aucune modification).'));
    }

    function sectionDossiers() {
      const p = params.dossiers;
      const E = A.engines.dossiers;
      const texte = (obj, key, aria, structural) => ui.textInput({ value: obj[key], ariaLabel: aria, onChange: (v) => { obj[key] = v; save('dossiers'); }, onCommit: structural ? () => render() : null });
      const choix = (obj, key, options, aria) => ui.selectInput({ value: obj[key] || '', options, ariaLabel: aria, onChange: (v) => { obj[key] = v; save('dossiers'); } });
      const retirer = (liste, x) => ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { liste.splice(liste.indexOf(x), 1); save('dossiers', true); } });
      const listePieces = (type) => {
        const liste = p.pieces[type];
        return h('div', { class: 'stack-sm' },
          ui.table([
            { label: 'Pièce', render: (x) => texte(x, 'libelle', 'Pièce') },
            { label: 'Étape', render: (x) => choix(x, 'etape', E.ETAPES[type].map((e) => ({ value: e.id, label: e.libelle })), 'Étape') },
            { label: 'Demandée', render: (x) => (x.auto === 'diagnostics' ? h('span', { class: 'readonly' }, 'selon les diagnostics') : choix(x, 'condition', E.CONDITIONS.map((c) => ({ value: c.id, label: c.libelle })), 'Condition')) },
            { label: '', render: (x) => retirer(liste, x) },
          ], liste, { compact: true }),
          ui.button('Ajouter une pièce', { icon: 'plus', variant: 'soft', small: true, onClick: () => { liste.push({ id: 'perso' + Date.now().toString(36), libelle: 'Nouvelle pièce', etape: E.ETAPES[type][0].id, condition: '' }); save('dossiers', true); } }));
      };
      const listeZones = (cle, cleDept) => {
        const liste = p[cle];
        const depts = p[cleDept];
        return h('div', { class: 'stack-sm' },
          ui.table([
            { label: 'Département', render: (x) => texte(x, 'dept', 'Département') },
            { label: 'Commune (* = tout le département)', render: (x) => texte(x, 'commune', 'Commune') },
            { label: 'Arrêté', render: (x) => texte(x, 'arrete', 'Arrêté') },
            { label: '', render: (x) => retirer(liste, x) },
          ], liste, { compact: true, empty: 'Aucune commune.' }),
          ui.button('Ajouter une commune', { icon: 'plus', variant: 'soft', small: true, onClick: () => { liste.push({ dept: '84', commune: '', arrete: '' }); save('dossiers', true); } }),
          h('h4', { class: 'param-sub' }, 'Couverture des départements'),
          h('p', { class: 'param-help' }, 'Pour une commune absente de la liste : « en partie » ou inconnu = à vérifier ; « aucun arrêté » = non requis.'),
          ui.table([
            { label: 'Département', render: (x) => h('span', null, x.dept) },
            { label: 'Arrêté', render: (x) => ui.selectInput({ value: depts[x.dept], options: [{ value: 'tout', label: 'Tout le département' }, { value: 'partie', label: 'Une partie des communes' }, { value: 'aucun', label: 'Aucun arrêté' }], ariaLabel: 'Couverture', onChange: (v) => { depts[x.dept] = v; save('dossiers'); } }) },
            { label: '', render: (x) => ui.button('Retirer', { icon: 'trash', iconOnly: true, variant: 'ghost', small: true, onClick: () => { delete depts[x.dept]; save('dossiers', true); } }) },
          ], Object.keys(depts).sort().map((k) => ({ dept: k })), { compact: true, empty: 'Aucun département renseigné.' }),
          (() => {
            const champ = ui.textInput({ value: '', placeholder: 'n° (ex. : 30)', ariaLabel: 'Département à ajouter', onChange: () => {} });
            return h('div', { class: 'inline-add' }, champ, ui.button('Ajouter le département', { icon: 'plus', variant: 'soft', small: true, onClick: () => { const v = champ.value.trim(); if (v) { depts[v] = 'partie'; save('dossiers', true); } } }));
          })());
      };
      return h('div', null,
        h('div', { class: 'param-list' },
          row('Relance des pièces demandées', ui.numberInput({ value: p.delaiRelance, suffix: 'jours', onChange: (v) => { if (v !== null) { p.delaiRelance = v; save('dossiers'); } } }), 'Une pièce demandée depuis plus longtemps est signalée « à relancer ».')),
        h('h4', { class: 'param-sub' }, 'Pièces — ventes'), listePieces('vente'),
        h('h4', { class: 'param-sub' }, 'Pièces — successions'), listePieces('succession'),
        h('h4', { class: 'param-sub' }, 'Termites : communes délimitées par arrêté préfectoral'),
        ui.note('Liste préremplie à partir de sources non officielles pour le Vaucluse : à confirmer avec l\'arrêté en vigueur (préfecture, DDT ou mairie) et à compléter pour votre secteur.', 'warn'),
        listeZones('zonesTermites', 'departementsTermites'),
        h('h4', { class: 'param-sub' }, 'Mérule : zones de présence d\'un risque'),
        listeZones('zonesMerule', 'departementsMerule'));
    }

    const builders = { commun: sectionCommun, plusValue: sectionPlusValue, succession: sectionSuccession, origine: sectionOrigine, dossiers: sectionDossiers };

    async function importer() {
      try {
        const file = await A.store.openJSON();
        if (!file || file.format !== 'atelier-notarial-parametres' || !file.parametres) throw new Error("Ce fichier ne contient pas de paramètres de l'Atelier notarial.");
        if (!(await ui.confirm('Importer ces paramètres ?', 'Ils remplaceront les paramètres actuels de ce poste.', 'Importer'))) return;
        SECTIONS.forEach((s) => { if (file.parametres[s.id]) A.store.setParams(s.id, file.parametres[s.id]); });
        params = A.store.getParams();
        render();
        ui.toast('Paramètres importés.');
      } catch (e) {
        ui.toast(e.message, 'error');
      }
    }
    function exporter() {
      A.store.downloadJSON('parametres-atelier-notarial-' + todayISO() + '.json', { format: 'atelier-notarial-parametres', version: 1, exporteLe: new Date().toISOString(), parametres: A.store.getParams() });
      ui.toast('Paramètres exportés dans vos téléchargements.');
    }

    const body = h('div', { class: 'params-body' });
    const el = h('div', { class: 'sim theme-parametres' },
      h('header', { class: 'sim-top' },
        h('div', { class: 'sim-top-inner' },
          h('a', { class: 'back', href: '#/', title: "Retour à l'accueil" }, ui.icon('back', 20), h('span', null, 'Accueil')),
          h('div', { class: 'sim-title' },
            h('span', { class: 'app-glyph app-glyph-sm', style: { background: app.gradient } }, ui.icon(app.icon, 18)),
            h('div', null, h('h1', null, 'Paramètres'), h('p', { class: 'sim-ref' }, 'Barèmes et taux utilisés par les simulateurs'))),
          h('div', { class: 'toolbar' },
            ui.button('Importer', { icon: 'upload', variant: 'ghost', onClick: importer, title: 'Importer des paramètres depuis un fichier' }),
            ui.button('Exporter', { icon: 'save', variant: 'ghost', onClick: exporter, title: 'Exporter les paramètres pour les partager' })))),
      h('div', { class: 'params-wrap' }, body));
    container.replaceChildren(el);

    function render() {
      body.replaceChildren(
        ui.note('Les paramètres sont enregistrés sur ce poste dès qu\'ils sont modifiés et s\'appliquent immédiatement à tous les dossiers. Pour les partager avec vos collègues, utilisez « Exporter » puis « Importer » sur leur poste.'),
        ...SECTIONS.map((s) => {
          const custom = A.store.isCustomized(s.id);
          return h('section', { class: 'card', id: 'section-' + s.id },
            h('header', { class: 'card-head' },
              h('div', null, h('h3', { class: 'card-title' }, s.title, h('span', { class: 'tag tag-accent', id: 'modifie-' + s.id, hidden: !custom }, 'modifié')), h('p', { class: 'card-sub' }, s.sub)),
              h('div', { class: 'card-actions' }, Object.assign(ui.button('Valeurs par défaut', { icon: 'reset', variant: 'ghost', small: true, disabled: !custom, onClick: () => reset(s.id, s.title) }), { id: 'reset-' + s.id }))),
            h('div', { class: 'card-body' }, builders[s.id]()));
        }));
    }
    render();

    const target = ANCHOR[arg];
    if (target) setTimeout(() => {
      const t = document.getElementById('section-' + target);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  A.apps = A.apps || [];
  A.apps.push(Object.assign({}, app, { mount }));
})(typeof self !== 'undefined' ? self : this);
