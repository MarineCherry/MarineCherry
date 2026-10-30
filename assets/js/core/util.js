/*
 * Outils communs : formatage à la française, saisie des nombres, construction du DOM.
 */
(function (root) {
  'use strict';
  const A = (root.Atelier = root.Atelier || {});

  const nfCache = {};
  function nf(decimals) {
    const k = String(decimals);
    if (!nfCache[k]) nfCache[k] = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return nfCache[k];
  }
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  function fmtNum(x, decimals) {
    if (!isNum(x)) return '';
    const v = nf(decimals || 0).format(x);
    return v === '-0' ? '0' : v;
  }
  const fmtEuro = (x, decimals) => (isNum(x) ? fmtNum(x, decimals || 0) + ' €' : '—');
  const fmtPct = (x, decimals) => (isNum(x) ? fmtNum(x * 100, decimals === undefined ? 2 : decimals).replace(/,00$/, '') + ' %' : '—');

  // « 305 000,50 € » → 305000.5 ; chaîne vide → null.
  function parseNumber(s) {
    if (s === null || s === undefined) return null;
    const t = String(s).replace(/[\s  €%]/g, '').replace(',', '.');
    if (t === '' || t === '-' || t === '.') return null;
    const v = Number(t);
    return isFinite(v) ? v : null;
  }

  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function longDate(d) {
    const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d || new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  let counter = 0;
  const uid = (prefix) => (prefix || 'id') + Date.now().toString(36) + (counter++).toString(36);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  // Nom de fichier sans caractères interdits.
  const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

  /*
   * h('div', { class: 'x', onclick: fn }, enfant1, [enfant2, enfant3], 'texte')
   */
  function h(tag, props) {
    const svg = tag === 'svg' || (props && props.__svg);
    const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined || v === false || k === '__svg') continue;
        if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
        else if (k === 'style' && typeof v === 'object') {
          // Les variables CSS (« --c ») ne peuvent être posées que par setProperty.
          for (const p in v) {
            if (v[p] === null || v[p] === undefined) continue;
            if (p.startsWith('--')) el.style.setProperty(p, v[p]);
            else el.style[p] = v[p];
          }
        }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'value' && !svg) el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => append(el, x));
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  A.util = { isNum, fmtNum, fmtEuro, fmtPct, parseNumber, fmtDate, todayISO, longDate, uid, clone, debounce, slug, h };
})(typeof self !== 'undefined' ? self : this);
