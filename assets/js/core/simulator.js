/*
 * Contrôleur commun des simulateurs.
 * Gère l'état du dossier, la sauvegarde automatique (brouillon), les actions Nouveau / Ouvrir /
 * Enregistrer / Imprimer, les onglets et le recalcul en direct des zones de résultats.
 *
 * cfg = {
 *   app,                        // description de l'application (id, titre, icône…)
 *   paramsSection,              // section de paramètres utilisée par le moteur
 *   empty(),                    // nouveau dossier vide
 *   normalize(state),           // complète un dossier ouvert depuis un fichier (facultatif)
 *   compute(state, params),     // calcul
 *   tabs: [{ id, label, render(ctx) }],
 *   aside(ctx),                 // panneau de synthèse
 *   reference(state),           // libellé du dossier (nom de fichier, titre)
 *   print(ctx),                 // impression
 *   isEmpty(state),
 * }
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, debounce, clone, slug, todayISO, uid } = A.util;

  // Date de modification lisible : « à l'instant », « il y a 5 min », « hier à 14 h 05 », « 12/10/2026 ».
  function quand(iso) {
    const d = new Date(iso), maintenant = new Date();
    const min = Math.round((maintenant - d) / 60000);
    const heure = d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0');
    if (min < 1) return 'à l\'instant';
    if (min < 60) return 'il y a ' + min + ' min';
    const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const ecart = Math.round((jour(maintenant) - jour(d)) / 86400000);
    if (ecart === 0) return 'aujourd\'hui à ' + heure;
    if (ecart === 1) return 'hier à ' + heure;
    return d.toLocaleDateString('fr-FR');
  }
  const ui = A.ui;

  A.simulator = function (cfg) {
    return function mount(container) {
      const saved = A.store.loadDraft(cfg.app.id);
      let state = saved && saved.state ? normalize(saved.state) : cfg.empty();
      let tab = saved && cfg.tabs.some((t) => t.id === saved.tab) ? saved.tab : cfg.tabs[0].id;
      // Identifiant du dossier en cours dans les « dossiers récents ».
      let dossierId = (saved && saved.id) || uid('dos');
      let result = null;
      let live = [];

      function normalize(s) {
        return cfg.normalize ? cfg.normalize(Object.assign(cfg.empty(), s)) : Object.assign(cfg.empty(), s);
      }
      const params = () => A.store.engineParams(cfg.paramsSection);
      function compute() {
        try {
          result = cfg.compute(state, params());
        } catch (e) {
          console.error(e);
          result = null;
        }
      }
      function persistNow() {
        A.store.saveDraft(cfg.app.id, { state, tab, id: dossierId });
        if (!cfg.isEmpty(state)) {
          A.store.enregistrerHistorique(cfg.app.id, { id: dossierId, titre: cfg.reference(state) || 'Dossier sans nom', state: clone(state), tab });
        }
      }
      const persist = debounce(persistNow, 400);
      // Ouvre un dossier (récent ou fichier) en gardant le dossier en cours dans les récents.
      function charger(nouvelEtat, id, onglet) {
        persistNow();
        state = nouvelEtat;
        dossierId = id || uid('dos');
        tab = onglet && cfg.tabs.some((t) => t.id === onglet) ? onglet : cfg.tabs[0].id;
        render();
        persistNow();
      }

      // Panneau « Dossiers récents » : recherche, ouverture, suppression.
      function panneauRecents() {
        persistNow();
        let filtre = '';
        const liste = h('div', { class: 'recents-liste' });
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        function remplir() {
          const f = filtre.trim().toLowerCase();
          const items = A.store.listeHistorique(cfg.app.id).filter((x) => !f || (x.titre || '').toLowerCase().includes(f));
          liste.replaceChildren(...(items.length ? items.map((x) => h('div', { class: 'recent' + (x.id === dossierId ? ' recent-actif' : '') },
            h('button', { type: 'button', class: 'recent-ouvrir', onclick: () => {
              close();
              if (x.id === dossierId) return;
              charger(normalize(clone(x.state)), x.id, x.tab);
              ui.toast('Dossier « ' + x.titre + ' » ouvert.');
            } },
              h('span', { class: 'recent-titre' }, x.titre || 'Dossier sans nom'),
              h('span', { class: 'recent-date' }, x.id === dossierId ? 'Dossier en cours · ' + quand(x.modifie) : quand(x.modifie))),
            h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Retirer de la liste', 'aria-label': 'Retirer ' + x.titre, onclick: async () => {
              const ok = await ui.confirm('Retirer ce dossier ?', '« ' + x.titre + ' » sera retiré des dossiers récents de ce poste.', 'Retirer');
              if (!ok) return;
              A.store.supprimerHistorique(cfg.app.id, x.id);
              remplir();
            } }, ui.icon('trash', 16))))
            : [h('p', { class: 'muted recents-vide' }, f ? 'Aucun dossier ne correspond.' : 'Aucun dossier pour l\'instant : les dossiers travaillés s\'ajoutent ici automatiquement.')]));
        }
        const recherche = h('input', { class: 'input', type: 'search', placeholder: 'Rechercher un dossier…', 'aria-label': 'Rechercher un dossier', oninput: (e) => { filtre = e.target.value; remplir(); } });
        const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } },
          h('div', { class: 'dialog dialog-recents', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Dossiers récents' },
            h('h3', { class: 'dialog-title' }, 'Dossiers récents'),
            h('p', { class: 'small muted' }, 'Gardés automatiquement sur ce poste (dans ce navigateur), du plus récent au plus ancien.'),
            recherche, liste,
            h('div', { class: 'dialog-actions' },
              ui.button('Nouveau dossier', { icon: 'plus', variant: 'soft', onClick: () => { close(); actions.nouveau(); } }),
              ui.button('Fermer', { variant: 'ghost', onClick: close }))));
        remplir();
        document.body.appendChild(overlay);
        document.addEventListener('keydown', onKey);
        recherche.focus();
      }

      const ctx = {
        get state() { return state; },
        get result() { return result; },
        params,
        // Valeur modifiée : recalcul et mise à jour des zones de résultats.
        changed() {
          compute();
          live.forEach((f) => f());
          persist();
        },
        // Changement de structure (ajout / suppression de ligne…) : nouveau rendu complet.
        render,
        goTab(id) {
          tab = id;
          render();
          persist();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        // Élément recalculé à chaque modification.
        live(fn, tag, props) {
          const el = h(tag || 'div', props || null);
          const update = () => {
            let content;
            try {
              content = result ? fn(result) : ui.note('Calcul impossible avec les données saisies.', 'warn');
            } catch (e) {
              console.error(e);
              content = ui.note('Calcul impossible avec les données saisies.', 'warn');
            }
            el.replaceChildren(...[].concat(content).filter((x) => x !== null && x !== undefined && x !== false));
          };
          live.push(update);
          update();
          return el;
        },
        // Champs liés à une propriété d'un objet de l'état.
        num(obj, key, opts) {
          return ui.numberInput(Object.assign({}, opts, { value: obj[key], onChange: (v) => { obj[key] = v; ctx.changed(); } }));
        },
        pct(obj, key, opts) {
          return ctx.num(obj, key, Object.assign({ percent: true }, opts));
        },
        text(obj, key, opts) {
          const o = opts || {};
          return ui.textInput(Object.assign({}, o, {
            value: obj[key],
            onChange: (v) => { obj[key] = v; ctx.changed(); },
            onCommit: o.structural ? () => render() : null,
          }));
        },
        date(obj, key, opts) {
          return ui.dateInput(Object.assign({}, opts, { value: obj[key], onChange: (v) => { obj[key] = v; ctx.changed(); } }));
        },
        select(obj, key, options, opts) {
          const o = opts || {};
          return ui.selectInput(Object.assign({}, o, {
            value: obj[key], options,
            onChange: (v) => { obj[key] = o.parse ? o.parse(v) : v; o.structural ? (render(), persist()) : ctx.changed(); },
          }));
        },
        yesNo(obj, key, opts) {
          const o = opts || {};
          return ui.yesNo(obj[key], (v) => { obj[key] = v; o.structural ? (render(), persist()) : ctx.changed(); }, o.small);
        },
        segmented(obj, key, options, opts) {
          const o = opts || {};
          return ui.segmented({
            value: obj[key], options, small: o.small, ariaLabel: o.ariaLabel,
            onChange: (v) => { obj[key] = v; o.structural ? (render(), persist()) : ctx.changed(); },
          });
        },
      };

      const actions = {
        nouveau() {
          const avait = !cfg.isEmpty(state);
          charger(cfg.empty(), null, null);
          ui.toast(avait ? 'Nouveau dossier prêt. Le précédent est dans « Récents ».' : 'Nouveau dossier prêt.');
        },
        recents() { panneauRecents(); },
        async ouvrir() {
          try {
            const file = await A.store.openJSON();
            charger(normalize(A.store.unwrapFile(cfg.app.id, file)), null, null);
            ui.toast('Dossier ouvert.');
          } catch (e) {
            ui.toast(e.message, 'error');
          }
        },
        enregistrer() {
          const name = slug(cfg.reference(state)) || 'dossier';
          A.store.downloadJSON(name + '-' + cfg.app.fileSuffix + '-' + todayISO() + '.json', A.store.wrapFile(cfg.app.id, clone(state)));
          ui.toast('Dossier enregistré dans vos téléchargements.');
        },
        imprimer() {
          compute();
          if (!result) return ui.toast('Calcul impossible : vérifiez la saisie.', 'error');
          cfg.print(ctx);
        },
      };

      const referenceEl = h('p', { class: 'sim-ref' });
      const frame = ui.shell({ app: cfg.app, tabs: cfg.tabs, actions, reference: referenceEl, onTab: (id) => ctx.goTab(id) });
      container.replaceChildren(frame.el);

      function render() {
        live = [];
        compute();
        frame.setTab(tab);
        const current = cfg.tabs.find((t) => t.id === tab);
        frame.main.replaceChildren(current.render(ctx));
        frame.aside.replaceChildren(cfg.aside(ctx));
        live.push(() => (referenceEl.textContent = cfg.reference(state) || 'Dossier sans nom'));
        live[live.length - 1]();
      }
      render();
    };
  };
})(typeof self !== 'undefined' ? self : this);
