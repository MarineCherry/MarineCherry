/*
 * Accueil (écran d'applications) et navigation entre les outils.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, longDate } = A.util;
  const ui = A.ui;

  // Ordre d'affichage sur l'écran d'accueil.
  const ORDER = ['dossiers', 'plus-value', 'succession', 'conjoint', 'courriers', 'origine', 'parametres'];
  const appRoot = document.getElementById('app');

  function draftLabel(app) {
    const d = A.store.loadDraft(app.id);
    const s = d && d.state;
    const ref = s && (s.reference || s.nomDossier);
    return ref ? 'En cours : ' + ref : app.caption;
  }

  function home() {
    const apps = ORDER.map((id) => A.apps.find((a) => a.id === id)).filter(Boolean);
    const tiles = apps.map((a, i) => h('a', { class: 'tile', href: '#/' + a.id, style: { animationDelay: i * 60 + 'ms' } },
      h('span', { class: 'app-glyph', style: { background: a.gradient } }, ui.icon(a.icon, 34)),
      h('span', { class: 'tile-name' }, a.title),
      h('span', { class: 'tile-caption' }, draftLabel(a))));
    tiles.push(h('div', { class: 'tile tile-soon', style: { animationDelay: apps.length * 60 + 'ms' }, 'aria-disabled': 'true' },
      h('span', { class: 'app-glyph app-glyph-soon' }, ui.icon('soon', 30)),
      h('span', { class: 'tile-name' }, 'Nouvel outil'),
      h('span', { class: 'tile-caption' }, 'Bientôt disponible')));

    appRoot.replaceChildren(h('div', { class: 'home' },
      h('header', { class: 'home-head' },
        h('div', { class: 'monogram', 'aria-hidden': 'true' }, 'AN'),
        h('p', { class: 'home-date' }, longDate()),
        h('h1', { class: 'home-title' }, 'Atelier notarial'),
        h('p', { class: 'home-sub' }, 'Les outils de calcul de l\'étude')),
      h('nav', { class: 'home-grid', 'aria-label': 'Outils' }, tiles),
      h('footer', { class: 'home-foot' }, ui.icon('lock', 16),
        h('span', null, 'Les dossiers restent sur ce poste ou sur le réseau de l\'étude : rien n\'est envoyé sur internet sans votre demande.'))));
  }

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const id = decodeURIComponent(parts[0] || '');
    const arg = parts[1] ? decodeURIComponent(parts[1]) : '';
    const app = id && A.apps.find((a) => a.id === id);
    if (id && !app) {
      location.hash = '#/';
      return;
    }
    document.body.dataset.view = app ? app.id : 'accueil';
    if (app) {
      app.mount(appRoot, arg);
      document.title = app.title + ' — Atelier notarial';
    } else {
      home();
      document.title = 'Atelier notarial';
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  route();
})(typeof self !== 'undefined' ? self : this);
