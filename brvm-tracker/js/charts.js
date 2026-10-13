/* BRVM Tracker Joe — graphiques SVG légers (sans bibliothèque) : courbes, anneau, barres. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  BT.PALETTE = ['#2a78d6', '#e8833a', '#2fa37a', '#8c5bd6', '#d6455d', '#c4a12b', '#2b9fb6', '#7a8597', '#b0572e', '#5e7d2e'];

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function niceTicks(min, max, n) {
    if (min === max) { min -= 1; max += 1; }
    const raw = (max - min) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function tooltip(host) {
    let tip = host.querySelector('.chart-tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; host.appendChild(tip); }
    return tip;
  }

  /* series: [{ name, color, points: [{x: 'AAAA-MM-JJ', y}] , area, dash }] */
  BT.lineChart = function (host, series, opts) {
    opts = opts || {};
    host.innerHTML = '';
    host.classList.add('chart');
    const W = host.clientWidth || 600, H = opts.height || 260;
    const m = { l: 62, r: 12, t: 12, b: 26 };
    const all = series.flatMap((s) => s.points);
    if (all.length < 2) { host.innerHTML = '<div class="empty">Pas encore assez de données pour tracer ce graphique.</div>'; return; }
    const xs = [...new Set(all.map((p) => p.x))].sort();
    const xi = Object.fromEntries(xs.map((x, i) => [x, i]));
    let ymin = Math.min(...all.map((p) => p.y)), ymax = Math.max(...all.map((p) => p.y));
    if (opts.zero) ymin = Math.min(0, ymin);
    const pad = (ymax - ymin) * 0.06 || Math.abs(ymax) * 0.05 || 1;
    const ticks = niceTicks(ymin - (opts.zero && ymin === 0 ? 0 : pad), ymax + pad, 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const X = (x) => m.l + (xs.length === 1 ? 0 : xi[x] / (xs.length - 1)) * (W - m.l - m.r);
    const Y = (y) => m.t + (1 - (y - y0) / (y1 - y0)) * (H - m.t - m.b);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, host);
    for (const t of ticks) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid' }, svg);
      el('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'axis' }, svg).textContent = (opts.fmtY || BT.short)(t);
    }
    const nx = Math.min(6, xs.length);
    for (let i = 0; i < nx; i++) {
      const x = xs[Math.round(i * (xs.length - 1) / Math.max(1, nx - 1))];
      el('text', { x: X(x), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle', class: 'axis' }, svg).textContent = BT.dateShort(x);
    }
    series.forEach((s, si) => {
      const pts = s.points.slice().sort((a, b) => a.x.localeCompare(b.x));
      if (!pts.length) return;
      const color = s.color || BT.PALETTE[si % BT.PALETTE.length];
      const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join('');
      if (s.area) el('path', { d: d + `L${X(pts[pts.length - 1].x)},${Y(Math.max(y0, 0))}L${X(pts[0].x)},${Y(Math.max(y0, 0))}Z`, fill: color, opacity: 0.12 }, svg);
      el('path', { d, fill: 'none', stroke: color, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash || '', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      if (s.markers) for (const mk of s.markers) {
        if (xi[mk.x] == null) continue;
        el('circle', { cx: X(mk.x), cy: Y(mk.y), r: 4.5, fill: mk.color, stroke: 'var(--bg)', 'stroke-width': 1.5 }, svg);
      }
    });
    if (opts.legend !== false && series.length > 1) {
      const lg = document.createElement('div'); lg.className = 'legend';
      lg.innerHTML = series.map((s, i) => `<span><i style="background:${s.color || BT.PALETTE[i]}"></i>${BT.esc(s.name)}</span>`).join('');
      host.appendChild(lg);
    }
    // survol : ligne verticale + infobulle
    const vline = el('line', { y1: m.t, y2: H - m.b, class: 'hover-line', visibility: 'hidden' }, svg);
    const tip = tooltip(host);
    const maps = series.map((s) => Object.fromEntries(s.points.map((p) => [p.x, p.y])));
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const sx = px * W / r.width;
      const i = Math.max(0, Math.min(xs.length - 1, Math.round((sx - m.l) / (W - m.l - m.r) * (xs.length - 1))));
      const x = xs[i];
      vline.setAttribute('x1', X(x)); vline.setAttribute('x2', X(x)); vline.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${BT.dateLong(x)}</b>` + series.map((s, si) => maps[si][x] == null ? '' : `<div><i style="background:${s.color || BT.PALETTE[si]}"></i>${BT.esc(s.name)} : <b>${(opts.fmtTip || BT.money)(maps[si][x])}</b></div>`).join('');
      tip.style.display = 'block';
      const left = X(x) * r.width / W;
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left + 12)) + 'px';
      tip.style.top = '8px';
    };
    svg.addEventListener('mousemove', move);
    svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; vline.setAttribute('visibility', 'hidden'); });
  };

  /* items: [{ label, value, color }] */
  BT.donut = function (host, items, opts) {
    opts = opts || {};
    host.innerHTML = '';
    host.classList.add('chart', 'donut-wrap');
    items = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
    if (items.length > 8) {
      const rest = items.slice(7).reduce((a, i) => a + i.value, 0);
      items = items.slice(0, 7).concat([{ label: 'Autres', value: rest, color: '#9aa4b2' }]);
    }
    const total = items.reduce((a, i) => a + i.value, 0);
    if (!total) { host.innerHTML = '<div class="empty">Aucune position.</div>'; return; }
    const S = 180, R = 80, r = 52, c = S / 2;
    const svg = el('svg', { viewBox: `0 0 ${S} ${S}`, width: S, height: S, class: 'donut' }, host);
    let a0 = -Math.PI / 2;
    items.forEach((it, i) => {
      it.color = it.color || BT.PALETTE[i % BT.PALETTE.length];
      const frac = it.value / total;
      const a1 = a0 + frac * Math.PI * 2 - (items.length > 1 ? 0.012 : 0);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (ang, rad) => `${c + rad * Math.cos(ang)},${c + rad * Math.sin(ang)}`;
      const d = frac >= 0.9999
        ? `M${c},${c - R}A${R},${R} 0 1 1 ${c - 0.01},${c - R}L${c - 0.01},${c - r}A${r},${r} 0 1 0 ${c},${c - r}Z`
        : `M${p(a0, R)}A${R},${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 ${large} 0 ${p(a0, r)}Z`;
      const path = el('path', { d, fill: it.color }, svg);
      el('title', {}, path).textContent = `${it.label} : ${(frac * 100).toFixed(1).replace('.', ',')} %`;
      a0 += frac * Math.PI * 2;
    });
    if (opts.center) {
      el('text', { x: c, y: c - 2, 'text-anchor': 'middle', class: 'donut-v' }, svg).textContent = opts.center;
      el('text', { x: c, y: c + 16, 'text-anchor': 'middle', class: 'axis' }, svg).textContent = opts.centerSub || '';
    }
    const lg = document.createElement('ul'); lg.className = 'donut-legend';
    lg.innerHTML = items.map((it) => `<li><i style="background:${it.color}"></i><span>${BT.esc(it.label)}</span><b>${(it.value / total * 100).toFixed(1).replace('.', ',')} %</b></li>`).join('');
    host.appendChild(lg);
  };

  /* items: [{ label, value, color }] — barres verticales */
  BT.barChart = function (host, items, opts) {
    opts = opts || {};
    host.innerHTML = '';
    host.classList.add('chart');
    if (!items.length) { host.innerHTML = '<div class="empty">Aucune donnée.</div>'; return; }
    const W = host.clientWidth || 500, H = opts.height || 220, m = { l: 56, r: 8, t: 14, b: 26 };
    const vals = items.map((i) => i.value);
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const Y = (y) => m.t + (1 - (y - y0) / (y1 - y0)) * (H - m.t - m.b);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H }, host);
    for (const t of ticks) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid' }, svg);
      el('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'axis' }, svg).textContent = BT.short(t);
    }
    const bw = (W - m.l - m.r) / items.length;
    items.forEach((it, i) => {
      const x = m.l + i * bw + bw * 0.18, w = bw * 0.64;
      const ya = Y(Math.max(0, it.value)), yb = Y(Math.min(0, it.value));
      const color = it.color || (it.value < 0 ? 'var(--neg)' : opts.color || 'var(--accent)');
      const rect = el('rect', { x, y: ya, width: w, height: Math.max(1, yb - ya), rx: 3, fill: color }, svg);
      el('title', {}, rect).textContent = `${it.label} : ${(opts.fmt || BT.money)(it.value)}`;
      if (items.length <= 14) el('text', { x: x + w / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis' }, svg).textContent = it.label;
      if (opts.values && items.length <= 10) el('text', { x: x + w / 2, y: ya - 4, 'text-anchor': 'middle', class: 'axis strong' }, svg).textContent = BT.short(it.value);
    });
  };

  /* mini-courbe pour les tableaux */
  BT.sparkline = function (values, w, h) {
    w = w || 80; h = h || 24;
    if (!values || values.length < 2) return '';
    const mn = Math.min(...values), mx = Math.max(...values);
    const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - 2 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (h - 4)).toFixed(1)}`).join(' ');
    const up = values[values.length - 1] >= values[0];
    return `<svg width="${w}" height="${h}" class="spark"><polyline points="${pts}" fill="none" stroke="${up ? 'var(--pos)' : 'var(--neg)'}" stroke-width="1.5"/></svg>`;
  };
})();
