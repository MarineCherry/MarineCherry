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
  const { h, debounce, clone, slug, todayISO } = A.util;
  const ui = A.ui;

  A.simulator = function (cfg) {
    return function mount(container) {
      const saved = A.store.loadDraft(cfg.app.id);
      let state = saved && saved.state ? normalize(saved.state) : cfg.empty();
      let tab = saved && cfg.tabs.some((t) => t.id === saved.tab) ? saved.tab : cfg.tabs[0].id;
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
      const persist = debounce(() => A.store.saveDraft(cfg.app.id, { state, tab }), 300);

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
        async nouveau() {
          if (!cfg.isEmpty(state)) {
            const ok = await ui.confirm('Nouveau dossier', "Le dossier en cours sera effacé de l'écran. Pensez à l'enregistrer si vous souhaitez le conserver.", 'Commencer un nouveau dossier');
            if (!ok) return;
          }
          state = cfg.empty();
          tab = cfg.tabs[0].id;
          render();
          persist();
          ui.toast('Nouveau dossier prêt.');
        },
        async ouvrir() {
          try {
            const file = await A.store.openJSON();
            state = normalize(A.store.unwrapFile(cfg.app.id, file));
            render();
            persist();
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
