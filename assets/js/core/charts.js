/*
 * Graphiques SVG simples (sans bibliothèque) : barres empilées et anneau.
 */
(function (root) {
  'use strict';
  const A = root.Atelier;
  const { h, fmtEuro, fmtNum } = A.util;
  const s = (tag, props, ...children) => h(tag, Object.assign({ __svg: true }, props), ...children);

  // Arrondi « joli » de l'échelle verticale.
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  const short = (v) => (v >= 1e6 ? fmtNum(v / 1e6, v % 1e6 ? 1 : 0) + ' M€' : v >= 1e3 ? fmtNum(v / 1e3, 0) + ' k€' : fmtNum(v, 0) + ' €');

  /*
   * bars : [{ label, parts: [valeurs] , highlight }] ; series : [{ label, color }]
   */
  function stackedBars(bars, series, opts) {
    const o = opts || {};
    const W = 560, H = 280, L = 64, R = 16, T = 28, B = 46;
    const max = niceMax(Math.max(1, ...bars.map((b) => b.parts.reduce((a, x) => a + x, 0))));
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const slot = (W - L - R) / bars.length;
    const bw = Math.min(88, slot * 0.5);
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => s('g', null,
      s('line', { x1: L, x2: W - R, y1: y(max * f), y2: y(max * f), class: 'chart-grid' }),
      s('text', { x: L - 8, y: y(max * f) + 4, 'text-anchor': 'end', class: 'chart-axis' }, short(max * f))));
    const cols = bars.map((b, i) => {
      const x = L + slot * i + (slot - bw) / 2;
      let acc = 0;
      const total = b.parts.reduce((a, v) => a + v, 0);
      const rects = b.parts.map((v, k) => {
        const y0 = y(acc + v), hgt = y(acc) - y(acc + v);
        acc += v;
        return v > 0 ? s('rect', { x, y: y0, width: bw, height: Math.max(0, hgt), rx: 3, fill: series[k].color }, s('title', null, series[k].label + ' : ' + fmtEuro(v))) : null;
      });
      return s('g', null, rects,
        s('text', { x: x + bw / 2, y: y(total) - 8, 'text-anchor': 'middle', class: ['chart-value', b.highlight ? 'chart-value-hl' : ''].join(' ') }, fmtEuro(total)),
        s('text', { x: x + bw / 2, y: H - B + 20, 'text-anchor': 'middle', class: ['chart-label', b.highlight ? 'chart-label-hl' : ''].join(' ') }, b.label));
    });
    return h('figure', { class: 'chart' },
      o.title ? h('figcaption', null, o.title) : null,
      s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.title || 'Graphique' }, grid, cols),
      legend(series.map((x) => ({ label: x.label, color: x.color }))));
  }

  /*
   * items : [{ label, value, color }]
   */
  function donut(items, opts) {
    const o = opts || {};
    const data = items.filter((x) => x.value > 0);
    const total = data.reduce((a, x) => a + x.value, 0);
    const R = 80, r = 52, C = 100;
    let angle = -Math.PI / 2;
    const arcs = data.map((x) => {
      const a = (x.value / total) * Math.PI * 2;
      const a0 = angle, a1 = angle + a - (data.length > 1 ? 0.012 : 0);
      angle += a;
      if (data.length === 1) {
        return s('g', null, s('circle', { cx: C, cy: C, r: (R + r) / 2, fill: 'none', stroke: x.color, 'stroke-width': R - r }));
      }
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, ang) => (C + rad * Math.cos(ang)).toFixed(2) + ' ' + (C + rad * Math.sin(ang)).toFixed(2);
      const d = 'M ' + p(R, a0) + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + p(R, a1) + ' L ' + p(r, a1) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 0 ' + p(r, a0) + ' Z';
      return s('path', { d, fill: x.color }, s('title', null, x.label + ' : ' + fmtEuro(x.value)));
    });
    return h('figure', { class: 'chart chart-donut' },
      o.title ? h('figcaption', null, o.title) : null,
      h('div', { class: 'donut-wrap' },
        s('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': o.title || 'Graphique' }, arcs,
          s('text', { x: C, y: C - 4, 'text-anchor': 'middle', class: 'donut-total' }, total ? short(total) : '—'),
          s('text', { x: C, y: C + 16, 'text-anchor': 'middle', class: 'donut-caption' }, 'au total')),
        legend(data.map((x) => ({ label: x.label, color: x.color, value: fmtEuro(x.value) + ' · ' + fmtNum((x.value / total) * 100, 0) + ' %' })), true)));
  }

  function legend(items, vertical) {
    return h('ul', { class: ['legend', vertical ? 'legend-v' : ''] }, items.map((x) =>
      h('li', null, h('span', { class: 'swatch', style: { background: x.color } }), h('span', null, x.label), x.value ? h('strong', null, x.value) : null)));
  }

  A.charts = { stackedBars, donut };
})(typeof self !== 'undefined' ? self : this);
