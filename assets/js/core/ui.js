/*
 * Composants d'interface : icônes, champs de saisie, cartes, onglets, fenêtres, impression.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, fmtNum, parseNumber, isNum } = A.util;

  /* ---------- Icônes (traits 24 × 24) ---------- */
  const ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    plusValue: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="m9 16.5 2.2-2.2 1.8 1.8 3-3"/><path d="M14.5 13.1H16v1.5"/>',
    succession: '<circle cx="12" cy="5.5" r="2.5"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/><path d="M12 8v4M5.5 16v-2.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5V16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    soon: '<path d="M12 5v14M5 12h14"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L22 12H7.5a2 2 0 0 0-1.9 1.4L3 20"/>',
    save: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M5 3h14"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    origine: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M10 11h6M10 14.5h6M10 18h4"/><path d="M4 7v12a2 2 0 0 0 2 2"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    dossiers: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m8.5 13.5 2.5 2.5 4.5-5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14a5 5 0 0 1 3 5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    link: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };
  function icon(name, size) {
    const s = size || 20;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('width', s);
    el.setAttribute('height', s);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.8');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = ICONS[name] || '';
    return el;
  }

  /* ---------- Boutons ---------- */
  function button(label, opts) {
    const o = opts || {};
    return h('button', {
      type: 'button',
      class: ['btn', o.variant ? 'btn-' + o.variant : '', o.small ? 'btn-sm' : '', o.iconOnly ? 'btn-icon' : ''],
      title: o.title || (o.iconOnly ? label : null),
      'aria-label': o.iconOnly ? label : null,
      onclick: o.onClick,
      disabled: o.disabled,
    }, o.icon ? icon(o.icon, o.small ? 16 : 18) : null, o.iconOnly ? null : h('span', null, label));
  }

  /* ---------- Champs de saisie ---------- */
  const inputFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });
  const showNumber = (v, percent) => (isNum(v) ? inputFmt.format(percent ? Math.round(v * 1e8) / 1e6 : v) : '');

  // Nombre (montants, âges) ou pourcentage (stocké en fraction : 12,5 % → 0,125).
  function numberInput(o) {
    const input = h('input', {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'input',
      placeholder: o.placeholder || '', value: showNumber(o.value, o.percent), 'aria-label': o.ariaLabel || null,
    });
    input.addEventListener('input', () => {
      let v = parseNumber(input.value);
      if (v !== null && o.percent) v = v / 100;
      o.onChange(v);
    });
    input.addEventListener('blur', () => {
      let v = parseNumber(input.value);
      if (v !== null && o.percent) v = v / 100;
      input.value = showNumber(v, o.percent);
    });
    const suffix = o.suffix || (o.percent ? '%' : null);
    return suffix ? h('div', { class: 'affix' }, input, h('span', { class: 'affix-text' }, suffix)) : input;
  }
  function textInput(o) {
    const input = h('input', { type: 'text', class: 'input', value: o.value || '', placeholder: o.placeholder || '', 'aria-label': o.ariaLabel || null });
    input.addEventListener('input', () => o.onChange(input.value));
    if (o.onCommit) input.addEventListener('change', () => o.onCommit(input.value));
    return input;
  }
  function dateInput(o) {
    const input = h('input', { type: 'date', class: 'input', value: o.value || '', 'aria-label': o.ariaLabel || null });
    input.addEventListener('change', () => o.onChange(input.value || ''));
    return input;
  }
  function selectInput(o) {
    const opts = o.options.map((x) => (typeof x === 'string' ? { value: x, label: x } : x));
    const sel = h('select', { class: 'input select', 'aria-label': o.ariaLabel || null },
      opts.map((x) => h('option', { value: x.value, selected: x.value === o.value }, x.label)));
    if (!opts.some((x) => x.value === o.value)) sel.value = opts.length ? opts[0].value : '';
    sel.addEventListener('change', () => o.onChange(sel.value));
    return sel;
  }
  // Choix segmenté : options [{value, label}].
  function segmented(o) {
    const wrap = h('div', { class: ['segmented', o.small ? 'segmented-sm' : ''], role: 'radiogroup', 'aria-label': o.ariaLabel || null });
    o.options.forEach((x) => {
      const b = h('button', {
        type: 'button', role: 'radio', class: 'segment', 'aria-checked': String(x.value === o.value),
        onclick: () => {
          wrap.querySelectorAll('.segment').forEach((s) => s.setAttribute('aria-checked', 'false'));
          b.setAttribute('aria-checked', 'true');
          o.onChange(x.value);
        },
      }, x.label);
      wrap.appendChild(b);
    });
    return wrap;
  }
  const yesNo = (value, onChange, small) => segmented({ value: !!value, onChange, small, options: [{ value: false, label: 'Non' }, { value: true, label: 'Oui' }] });

  function field(label, control, opts) {
    const o = opts || {};
    return h('div', { class: ['field', o.wide ? 'field-wide' : '', o.className] },
      h('label', { class: 'field-label' }, label, o.optional ? h('span', { class: 'optional' }, ' facultatif') : null),
      control,
      o.help ? h('p', { class: 'field-help' }, o.help) : null);
  }

  /* ---------- Mise en page ---------- */
  function card(title, body, opts) {
    const o = opts || {};
    return h('section', { class: ['card', o.className] },
      title || o.actions ? h('header', { class: 'card-head' },
        h('div', null, title ? h('h3', { class: 'card-title' }, title) : null, o.subtitle ? h('p', { class: 'card-sub' }, o.subtitle) : null),
        o.actions ? h('div', { class: 'card-actions' }, o.actions) : null) : null,
      h('div', { class: 'card-body' }, body));
  }
  function badge(ok, text, kind) {
    return h('span', { class: ['badge', kind ? 'badge-' + kind : ok ? 'badge-ok' : 'badge-warn'] }, icon(ok ? 'check' : 'alert', 14), text);
  }
  function note(text, kind) {
    return h('div', { class: ['note', 'note-' + (kind || 'info')] }, icon(kind === 'warn' ? 'alert' : 'info', 18), h('div', null, text));
  }
  function stat(label, value, sub, tone) {
    return h('div', { class: ['stat', tone ? 'stat-' + tone : ''] },
      h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), sub ? h('div', { class: 'stat-sub' }, sub) : null);
  }

  /*
   * Tableau de résultats.
   *   cols : [{ label, key | render(row), num: true, className }]
   *   rows : objets ; opts.total : ligne de total ; opts.groups : en-têtes groupés [{label, span}]
   */
  function table(cols, rows, opts) {
    const o = opts || {};
    const cell = (tag, c, row, cls) => {
      const v = c.render ? c.render(row) : row[c.key];
      return h(tag, { class: [c.num ? 'num' : '', c.className, cls] }, v instanceof Node ? v : v === undefined || v === null ? '' : String(v));
    };
    return h('div', { class: 'table-wrap' },
      h('table', { class: ['table', o.compact ? 'table-compact' : ''] },
        h('thead', null,
          o.groups ? h('tr', { class: 'group-row' }, o.groups.map((g) => h('th', { colspan: g.span, class: g.className }, g.label))) : null,
          h('tr', null, cols.map((c) => h('th', { class: [c.num ? 'num' : '', c.className] }, c.label)))),
        h('tbody', null,
          rows.length ? rows.map((r) => h('tr', { class: r.__class }, cols.map((c) => cell('td', c, r))))
            : h('tr', null, h('td', { colspan: cols.length, class: 'empty' }, o.empty || 'Aucune ligne.'))),
        o.total ? h('tfoot', null, (Array.isArray(o.total) ? o.total : [o.total]).map((t) => h('tr', null, cols.map((c) => cell('td', c, t))))) : null));
  }

  /* ---------- Notifications et fenêtres ---------- */
  let toastTimer;
  function toast(message, kind) {
    let el = document.getElementById('toast');
    if (!el) {
      el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(el);
    }
    el.className = 'toast show ' + (kind || '');
    el.replaceChildren(icon(kind === 'error' ? 'alert' : 'check', 18), h('span', null, message));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
  }

  // Fenêtre de choix : buttons [{ label, value, variant }] ; renvoie une promesse.
  function dialog(title, message, buttons) {
    return new Promise((resolve) => {
      const close = (v) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
        h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h('h3', { class: 'dialog-title' }, title),
          message ? h('div', { class: 'dialog-body' }, message) : null,
          h('div', { class: 'dialog-actions' }, buttons.map((b) => button(b.label, { variant: b.variant, icon: b.icon, onClick: () => close(b.value) })))));
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
      const first = overlay.querySelector('.btn-primary') || overlay.querySelector('.btn');
      if (first) first.focus();
    });
  }
  const confirm = (title, message, okLabel) =>
    dialog(title, message, [{ label: 'Annuler', value: false, variant: 'ghost' }, { label: okLabel || 'Confirmer', value: true, variant: 'primary' }]);

  /* ---------- Impression ---------- */
  // Insère le document à imprimer dans #print-root, ouvre la boîte d'impression (qui permet aussi « Enregistrer en PDF »).
  function print(docEl, title) {
    const rootEl = document.getElementById('print-root');
    rootEl.replaceChildren(docEl);
    const previous = document.title;
    if (title) document.title = title;
    const done = () => {
      document.title = previous;
      rootEl.replaceChildren();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }
  function printDoc(o) {
    return h('article', { class: 'print-doc' },
      h('header', { class: 'print-head' },
        h('div', null, h('div', { class: 'print-brand' }, 'Atelier notarial'), h('h1', null, o.title), o.subtitle ? h('p', { class: 'print-sub' }, o.subtitle) : null),
        h('div', { class: 'print-meta' }, o.meta)),
      o.body,
      h('footer', { class: 'print-foot' }, o.footer || 'Simulation indicative et non contractuelle, établie d\'après les informations communiquées et la législation en vigueur.'));
  }

  /*
   * Cadre commun des simulateurs : barre d'outils, onglets, zone principale et panneau de synthèse.
   */
  function shell(o) {
    const tabs = h('nav', { class: 'tabs', role: 'tablist' });
    const main = h('div', { class: 'sim-main' });
    const aside = h('aside', { class: 'sim-aside' });
    const tabButtons = {};
    o.tabs.forEach((t) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => o.onTab(t.id) }, t.label);
      tabButtons[t.id] = b;
      tabs.appendChild(b);
    });
    const a = o.actions;
    const el = h('div', { class: ['sim', 'theme-' + o.app.id] },
      h('header', { class: 'sim-top' },
        h('div', { class: 'sim-top-inner' },
          h('a', { class: 'back', href: '#/', title: "Retour à l'accueil" }, icon('back', 20), h('span', null, 'Accueil')),
          h('div', { class: 'sim-title' },
            h('span', { class: 'app-glyph app-glyph-sm', style: { background: o.app.gradient } }, icon(o.app.icon, 18)),
            h('div', null, h('h1', null, o.app.title), o.reference)),
          h('div', { class: 'toolbar' },
            button('Nouveau', { icon: 'file', variant: 'ghost', onClick: a.nouveau, title: 'Nouveau dossier' }),
            button('Ouvrir', { icon: 'open', variant: 'ghost', onClick: a.ouvrir, title: 'Ouvrir un dossier enregistré sur ce poste' }),
            button('Enregistrer', { icon: 'save', variant: 'ghost', onClick: a.enregistrer, title: 'Enregistrer le dossier sur ce poste' }),
            button('Imprimer / PDF', { icon: 'print', variant: 'primary', onClick: a.imprimer }),
            h('a', { class: 'btn btn-ghost btn-icon', href: '#/parametres/' + o.app.id, title: 'Paramètres de cet outil', 'aria-label': 'Paramètres' }, icon('settings', 18)))),
        h('div', { class: 'sim-tabs-inner' }, tabs)),
      h('div', { class: 'sim-body' }, main, aside));
    return {
      el, main, aside,
      setTab(id) {
        Object.keys(tabButtons).forEach((k) => tabButtons[k].setAttribute('aria-selected', String(k === id)));
      },
    };
  }

  A.ui = { icon, button, numberInput, textInput, dateInput, selectInput, segmented, yesNo, field, card, badge, note, stat, table, toast, dialog, confirm, print, printDoc, shell };
})(typeof self !== 'undefined' ? self : this);
