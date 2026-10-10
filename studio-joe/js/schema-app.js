/* Studio Joe — Diagrammes Joe : organigrammes, logigrammes, cartes mentales, schémas et tableau blanc.
   Le schéma est un dessin SVG : formes (doc.els, t:'shape'), connecteurs accrochés aux formes (t:'link')
   et traits à main levée (t:'ink'). Les coordonnées sont celles du « monde » ; la vue (view.x, view.y, view.k)
   donne le déplacement et le zoom. Organigrammes et cartes mentales se réorganisent automatiquement
   en suivant les connecteurs (de la forme a vers la forme b). */
(function () {
  const { $, $$, toast, modal, confirmBox, download, pickFiles, baseName, initMenus } = Studio;
  const svg = $('#svg'), layer = $('#layer'), ui = $('#ui'), world = $('#world'), work = $('#work');
  const FONT = "'Segoe UI', Roboto, Arial, sans-serif";
  const NS = 'http://www.w3.org/2000/svg';
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const FILLS = ['#ffffff', '#fff59d', '#ffe0b2', '#ffcdd2', '#f8bbd0', '#e1bee7', '#c5cae9', '#bbdefb', '#b2ebf2', '#c8e6c9', '#eeeeee', '#1f3864', '#2f5496', '#37474f', '#c62828', '#2e7d32'];
  const STROKES = ['#37474f', '#000000', '#1565c0', '#2e7d32', '#c62828', '#ef6c00', '#6a1b9a', '#00838f', '#9e9e9e', '#ffffff'];
  const TEXTS = ['#1a1a1a', '#ffffff', '#1565c0', '#c62828', '#2e7d32', '#6a1b9a'];
  const BRANCH = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#f4511e', '#3949ab'];
  const KINDS = { round: 'Rectangle arrondi', rect: 'Rectangle', ellipse: 'Ellipse', circle: 'Cercle', diamond: 'Losange (décision)', term: 'Début / fin', para: 'Entrée / sortie', doc: 'Document', cyl: 'Base de données', hex: 'Préparation', tri: 'Triangle', note: 'Post-it', text: 'Texte seul', person: 'Personne', cloud: 'Nuage' };
  const SIZE = { round: [150, 64], rect: [150, 64], ellipse: [140, 80], circle: [90, 90], diamond: [150, 100], term: [140, 56], para: [160, 64], doc: [150, 80], cyl: [110, 100], hex: [160, 64], tri: [120, 100], note: [160, 140], text: [160, 40], person: [60, 110], cloud: [170, 100], image: [200, 150] };

  /* ================= Document ================= */
  const newDoc = (title = 'Schéma') => ({ id: uid(), title, els: [], view: { x: 60, y: 60, k: 1 }, snap: true, layout: null, updated: Date.now() });
  let doc = newDoc();
  let sel = new Set();
  let tool = 'select';
  const penSt = { pen: { stroke: '#1565c0', sw: 3 }, hl: { stroke: '#ffeb3b', sw: 18 } };
  const byId = (id) => doc.els.find((e) => e.id === id);
  const shapes = () => doc.els.filter((e) => e.t === 'shape');
  const links = () => doc.els.filter((e) => e.t === 'link');
  const selEls = () => doc.els.filter((e) => sel.has(e.id));
  const selShape = () => { const s = selEls().filter((e) => e.t === 'shape'); return s.length === 1 ? s[0] : null; };
  const G = 10; const snapV = (v) => (doc.snap ? Math.round(v / G) * G : v);

  function defStyle(kind) {
    if (kind === 'note') return { fill: '#fff59d', stroke: '#e0c200', sw: 1, color: '#1a1a1a', fs: 15 };
    if (kind === 'text') return { fill: 'none', stroke: 'none', sw: 2, color: '#1a1a1a', fs: 18 };
    if (kind === 'person') return { fill: '#ffffff', stroke: '#37474f', sw: 2, color: '#1a1a1a', fs: 14 };
    return { fill: '#ffffff', stroke: '#37474f', sw: 2, color: '#1a1a1a', fs: 16 };
  }
  function makeShape(kind, x, y, w, h, text = '', st = {}) {
    const [dw, dh] = SIZE[kind] || [150, 64];
    return { id: uid(), t: 'shape', kind, x, y, w: w || dw, h: h || dh, text, st: { ...defStyle(kind), ...st } };
  }
  const makeLink = (a, b, o = {}) => ({ id: uid(), t: 'link', a, b, route: 'straight', arrow: 'end', text: '', st: { stroke: '#37474f', sw: 2 }, ...o });

  /* ================= Texte ================= */
  const mctx = document.createElement('canvas').getContext('2d');
  function wrap(text, width, fs, bold) {
    mctx.font = `${bold ? '600 ' : ''}${fs}px ${FONT}`;
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/(\s+)/).filter((w) => w !== ''); let line = '';
      if (!words.length) { out.push(''); continue; }
      for (const w of words) {
        const tryL = line + w;
        if (mctx.measureText(tryL).width <= width || !line.trim()) {
          if (mctx.measureText(tryL).width > width && !line.trim()) { // mot trop long : coupé
            let cur = ''; for (const ch of w) { if (mctx.measureText(cur + ch).width > width && cur) { out.push(cur); cur = ''; } cur += ch; } line = cur; continue;
          }
          line = tryL;
        } else { out.push(line.trimEnd()); line = w.trimStart(); }
      }
      out.push(line.trimEnd());
    }
    return out;
  }
  const textWidth = (t, fs, bold) => { mctx.font = `${bold ? '600 ' : ''}${fs}px ${FONT}`; return Math.max(0, ...String(t || '').split('\n').map((l) => mctx.measureText(l).width)); };
  function textBlock(text, cx, cy, width, st, align = 'center', x0 = 0, x1 = 0) {
    if (!text) return '';
    const fs = st.fs || 16; const lines = wrap(text, Math.max(20, width), fs, st.bold); const lh = fs * 1.25;
    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'; const x = align === 'left' ? x0 : align === 'right' ? x1 : cx;
    return `<text x="${x}" font-family="${esc(FONT)}" font-size="${fs}" fill="${st.color || '#1a1a1a'}" text-anchor="${anchor}"${st.bold ? ' font-weight="600"' : ''}${st.italic ? ' font-style="italic"' : ''}>${lines.map((l, i) => `<tspan x="${x}" y="${(cy - ((lines.length - 1) * lh) / 2 + i * lh + fs * 0.35).toFixed(1)}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
  }

  /* ================= Dessin SVG ================= */
  const dashOf = (st) => (st.dash === 'dash' ? `${st.sw * 4} ${st.sw * 3}` : st.dash === 'dot' ? `${st.sw} ${st.sw * 2}` : '');
  function shapeSVG(e) {
    const { x, y, w, h } = e; const st = e.st; const fill = st.fill || 'none'; const stroke = st.stroke || 'none';
    const a = `fill="${fill}" stroke="${stroke}" stroke-width="${st.sw || 0}"${dashOf(st) ? ` stroke-dasharray="${dashOf(st)}"` : ''} stroke-linejoin="round" pointer-events="all"`;
    const poly = (pts) => `<polygon points="${pts.map((p) => p.map((v) => +v.toFixed(1)).join(',')).join(' ')}" ${a}/>`;
    let body = ''; let cx = x + w / 2, cy = y + h / 2, tw = w - 14;
    switch (e.kind) {
      case 'rect': body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`; break;
      case 'round': body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(12, h / 4, w / 4)}" ${a}/>`; break;
      case 'term': body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(h, w) / 2}" ${a}/>`; tw = w - h / 2; break;
      case 'ellipse': case 'circle': body = `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" ${a}/>`; tw = w * 0.74; break;
      case 'diamond': body = poly([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]); tw = w * 0.6; break;
      case 'para': { const k = Math.min(w * 0.18, h * 0.5); body = poly([[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]]); tw = w - 2 * k; break; }
      case 'hex': { const k = Math.min(w * 0.18, h * 0.5); body = poly([[x + k, y], [x + w - k, y], [x + w, cy], [x + w - k, y + h], [x + k, y + h], [x, cy]]); tw = w - 2 * k; break; }
      case 'tri': body = poly([[cx, y], [x + w, y + h], [x, y + h]]); cy = y + h * 0.66; tw = w * 0.55; break;
      case 'doc': body = `<path d="M${x} ${y}H${x + w}V${y + h * 0.84}C${x + w * 0.75} ${y + h * 0.66} ${x + w * 0.25} ${y + h * 1.04} ${x} ${y + h * 0.84}Z" ${a}/>`; cy = y + h * 0.42; break;
      case 'cyl': { const ry = Math.min(h * 0.14, 16); body = `<path d="M${x} ${y + ry}V${y + h - ry}A${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry}V${y + ry}Z" ${a}/><ellipse cx="${cx}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" ${a}/>`; cy = y + h / 2 + ry / 2; break; }
      case 'note': body = `<path d="M${x} ${y}H${x + w - 18}L${x + w} ${y + 18}V${y + h}H${x}Z" ${a}/><path d="M${x + w - 18} ${y}V${y + 18}H${x + w}" fill="rgba(0,0,0,.08)" stroke="${stroke}" stroke-width="${st.sw || 0}"/>`; break;
      case 'person': { const r = Math.min(w * 0.22, h * 0.13); const hy = y + r + 2, by = y + h * 0.62; body = `<g ${a.replace('pointer-events="all"', '')} fill="none"><circle cx="${cx}" cy="${hy}" r="${r}" fill="${fill}"/><path d="M${cx} ${hy + r}V${by}M${x + w * 0.12} ${hy + r + h * 0.12}H${x + w * 0.88}M${cx} ${by}L${x + w * 0.15} ${y + h * 0.84}M${cx} ${by}L${x + w * 0.85} ${y + h * 0.84}"/></g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="none" pointer-events="all"/>`; cy = y + h + (st.fs || 14) * 0.9; tw = Math.max(w * 2.4, 120); break; }
      case 'cloud': { const p = (u, v) => `${(x + u * w).toFixed(1)} ${(y + v * h).toFixed(1)}`; body = `<path d="M${p(0.25, 0.8)}C${p(0.02, 0.8)} ${p(0.02, 0.45)} ${p(0.2, 0.42)}C${p(0.18, 0.12)} ${p(0.48, 0.05)} ${p(0.55, 0.25)}C${p(0.65, 0.05)} ${p(0.92, 0.15)} ${p(0.85, 0.42)}C${p(1.02, 0.45)} ${p(1.02, 0.82)} ${p(0.78, 0.8)}Z" ${a}/>`; cy = y + h * 0.55; tw = w * 0.66; break; }
      case 'image': body = `<image href="${esc(e.src || '')}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${stroke === 'none' ? 0 : st.sw || 0}" pointer-events="all"/>`; break;
      default: body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
    }
    const al = st.align || 'center';
    return `<g data-id="${e.id}">${body}${textBlock(e.text, cx, cy, tw, st, al, x + 8, x + w - 8)}</g>`;
  }
  // point du contour d'une forme dans la direction (dx, dy) depuis son centre
  function border(e, dx, dy) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2; if (!dx && !dy) return { x: cx, y: cy };
    const hw = e.w / 2, hh = e.h / 2; let f;
    if (e.kind === 'ellipse' || e.kind === 'circle') f = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
    else if (e.kind === 'diamond') f = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    else f = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: cx + dx * f, y: cy + dy * f };
  }
  function endBox(end) {
    const s = end && end.id && byId(end.id);
    if (s && s.t === 'shape') return { e: s, x: s.x, y: s.y, w: s.w, h: s.h, cx: s.x + s.w / 2, cy: s.y + s.h / 2 };
    const p = end || { x: 0, y: 0 }; return { x: p.x, y: p.y, w: 0, h: 0, cx: p.x, cy: p.y };
  }
  function linkGeom(l) {
    const A = endBox(l.a), B = endBox(l.b);
    const gapX = Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w)), gapY = Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h));
    const horiz = l.o ? l.o === 'h' : gapX > gapY;
    let s, e, c1, c2, segs;
    const side = (box, other, h) => (h ? { x: other.cx >= box.cx ? box.x + box.w : box.x, y: box.cy } : { x: box.cx, y: other.cy >= box.cy ? box.y + box.h : box.y });
    if (l.route === 'straight') {
      s = A.e ? border(A.e, B.cx - A.cx, B.cy - A.cy) : { x: A.cx, y: A.cy };
      e = B.e ? border(B.e, A.cx - B.cx, A.cy - B.cy) : { x: B.cx, y: B.cy };
    } else { s = side(A, B, horiz); e = side(B, A, horiz); if (l.o === 'v' && A.e && B.e && B.cy < A.cy) { s = { x: A.cx, y: A.y }; e = { x: B.cx, y: B.y + B.h }; } }
    const size = 7 + (l.st.sw || 2) * 2;
    const dirAt = (from, to) => { const dx = to.x - from.x, dy = to.y - from.y, n = Math.hypot(dx, dy) || 1; return { x: dx / n, y: dy / n }; };
    let dEnd, dStart, mid;
    if (l.route === 'elbow') {
      if (horiz) { const mx = s.x + Math.sign(e.x - s.x) * Math.min(Math.abs(e.x - s.x) / 2, 35); segs = [s, { x: mx, y: s.y }, { x: mx, y: e.y }, e]; } else { const my = s.y + Math.sign(e.y - s.y) * Math.min(Math.abs(e.y - s.y) / 2, 30); segs = [s, { x: s.x, y: my }, { x: e.x, y: my }, e]; }
      dEnd = dirAt(segs[2], e); if (segs[2].x === e.x && segs[2].y === e.y) dEnd = dirAt(segs[1], e); dStart = dirAt(segs[1], s); if (segs[1].x === s.x && segs[1].y === s.y) dStart = dirAt(segs[2], s);
      mid = { x: (segs[1].x + segs[2].x) / 2, y: (segs[1].y + segs[2].y) / 2 };
    } else if (l.route === 'curve') {
      const k = horiz ? Math.max(30, Math.abs(e.x - s.x) / 2) : Math.max(30, Math.abs(e.y - s.y) / 2);
      c1 = horiz ? { x: s.x + Math.sign(e.x - s.x || 1) * k, y: s.y } : { x: s.x, y: s.y + Math.sign(e.y - s.y || 1) * k };
      c2 = horiz ? { x: e.x - Math.sign(e.x - s.x || 1) * k, y: e.y } : { x: e.x, y: e.y - Math.sign(e.y - s.y || 1) * k };
      dEnd = dirAt(c2, e); dStart = dirAt(c1, s); mid = { x: (s.x + 3 * c1.x + 3 * c2.x + e.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + e.y) / 8 };
    } else { dEnd = dirAt(s, e); dStart = dirAt(e, s); mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }; }
    const ae = l.arrow === 'end' || l.arrow === 'both', as = l.arrow === 'start' || l.arrow === 'both';
    const e2 = ae ? { x: e.x - dEnd.x * size * 0.75, y: e.y - dEnd.y * size * 0.75 } : e, s2 = as ? { x: s.x - dStart.x * size * 0.75, y: s.y - dStart.y * size * 0.75 } : s;
    let d;
    const f = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    if (l.route === 'elbow') { const p = [s2, segs[1], segs[2], e2]; d = `M${f(p[0])}L${f(p[1])}L${f(p[2])}L${f(p[3])}`; }
    else if (l.route === 'curve') d = `M${f(s2)}C${f(c1)} ${f(c2)} ${f(e2)}`;
    else d = `M${f(s2)}L${f(e2)}`;
    const head = (tip, dir) => { const px = -dir.y, py = dir.x; const b = { x: tip.x - dir.x * size, y: tip.y - dir.y * size }; return `${f(tip)} ${f({ x: b.x + px * size * 0.5, y: b.y + py * size * 0.5 })} ${f({ x: b.x - px * size * 0.5, y: b.y - py * size * 0.5 })}`; };
    return { d, s, e, mid, pts: [s, e, c1, c2].filter(Boolean), heads: [ae ? head(e, dEnd) : null, as ? head(s, dStart) : null].filter(Boolean) };
  }
  function linkSVG(l) {
    const g = linkGeom(l); const st = l.st; const col = st.stroke || '#37474f';
    let lab = '';
    if (l.text) {
      const fs = st.fs || 13; const lines = String(l.text).split('\n'); const w = textWidth(l.text, fs) + 10, h = lines.length * fs * 1.25 + 4;
      lab = `<rect x="${(g.mid.x - w / 2).toFixed(1)}" y="${(g.mid.y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#ffffff" fill-opacity=".92"/>` + textBlock(l.text, g.mid.x, g.mid.y, w + 40, { fs, color: st.color || col });
    }
    return `<g data-id="${l.id}"><path d="${g.d}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke"/><path d="${g.d}" fill="none" stroke="${col}" stroke-width="${st.sw || 2}"${dashOf(st) ? ` stroke-dasharray="${dashOf(st)}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>${g.heads.map((p) => `<polygon points="${p}" fill="${col}"/>`).join('')}${lab}</g>`;
  }
  function inkPath(pts) {
    if (!pts.length) return '';
    const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    if (pts.length < 3) return `M${f(pts[0])}L${f(pts[pts.length - 1])}`;
    let d = `M${f(pts[0])}`;
    for (let i = 1; i < pts.length - 1; i++) { const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; d += `Q${f(pts[i])} ${f(m)}`; }
    return d + `L${f(pts[pts.length - 1])}`;
  }
  const inkSVG = (k) => `<g data-id="${k.id}"><path d="${inkPath(k.pts)}" fill="none" stroke="${k.st.stroke}" stroke-width="${k.st.sw}" stroke-linecap="round" stroke-linejoin="round"${k.st.hl ? ' stroke-opacity=".4"' : ''} pointer-events="stroke"/></g>`;
  const elSVG = (e) => (e.t === 'shape' ? shapeSVG(e) : e.t === 'link' ? linkSVG(e) : e.t === 'ink' ? inkSVG(e) : '');

  function bboxOf(e) {
    if (e.t === 'shape') return e.kind === 'person' && e.text ? { x: Math.min(e.x, e.x + e.w / 2 - textWidth(e.text, e.st.fs || 14) / 2), y: e.y, x2: Math.max(e.x + e.w, e.x + e.w / 2 + textWidth(e.text, e.st.fs || 14) / 2), y2: e.y + e.h + (e.st.fs || 14) * 1.6 } : { x: e.x, y: e.y, x2: e.x + e.w, y2: e.y + e.h };
    if (e.t === 'ink') { const xs = e.pts.map((p) => p[0]), ys = e.pts.map((p) => p[1]); const r = e.st.sw / 2; return { x: Math.min(...xs) - r, y: Math.min(...ys) - r, x2: Math.max(...xs) + r, y2: Math.max(...ys) + r }; }
    const g = linkGeom(e); const xs = g.pts.map((p) => p.x), ys = g.pts.map((p) => p.y); return { x: Math.min(...xs) - 6, y: Math.min(...ys) - 6, x2: Math.max(...xs) + 6, y2: Math.max(...ys) + 6 };
  }
  function bounds(els = doc.els) {
    if (!els.length) return null; const bs = els.map(bboxOf);
    return { x: Math.min(...bs.map((b) => b.x)), y: Math.min(...bs.map((b) => b.y)), x2: Math.max(...bs.map((b) => b.x2)), y2: Math.max(...bs.map((b) => b.y2)) };
  }

  /* ================= Affichage ================= */
  function applyView() {
    const v = doc.view; world.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.k})`);
    const p = $('#grid'); p.setAttribute('width', 20 * v.k); p.setAttribute('height', 20 * v.k); p.setAttribute('x', v.x); p.setAttribute('y', v.y);
    $('#gridBg').style.display = doc.snap ? '' : 'none';
    $('#zoomO').textContent = Math.round(v.k * 100) + ' %';
  }
  function render() { layer.innerHTML = doc.els.map(elSVG).join(''); renderUI(); applyView(); $('#docName').textContent = doc.title; }
  let temp = ''; // tracé provisoire (création, sélection rectangulaire, connecteur, crayon)
  function renderUI() {
    const k = doc.view.k; const px = (n) => n / k; let h = '';
    for (const e of selEls()) {
      const b = bboxOf(e);
      if (e.t !== 'link') h += `<rect x="${b.x - px(4)}" y="${b.y - px(4)}" width="${b.x2 - b.x + px(8)}" height="${b.y2 - b.y + px(8)}" fill="none" stroke="#1a73e8" stroke-width="${px(1.5)}" stroke-dasharray="${px(5)} ${px(4)}" pointer-events="none"/>`;
    }
    const one = selEls().length === 1 ? selEls()[0] : null;
    if (one && one.t === 'shape') {
      const { x, y, w, h: hh } = one; const s = px(10);
      const H = { nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + hh / 2], se: [x + w, y + hh], s: [x + w / 2, y + hh], sw: [x, y + hh], w: [x, y + hh / 2] };
      const cur = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' };
      for (const [n, [hx, hy]] of Object.entries(H)) h += `<rect data-h="${n}" x="${hx - s / 2}" y="${hy - s / 2}" width="${s}" height="${s}" rx="${px(2)}" fill="#fff" stroke="#1a73e8" stroke-width="${px(1.5)}" style="cursor:${cur[n]}-resize"/>`;
      const o = px(22), r = px(7.5);
      for (const [n, cx, cy] of [['t', x + w / 2, y - o], ['r', x + w + o, y + hh / 2], ['b', x + w / 2, y + hh + o], ['l', x - o, y + hh / 2]]) h += `<g data-c="${n}" style="cursor:crosshair"><circle cx="${cx}" cy="${cy}" r="${r * 1.6}" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#1a73e8" fill-opacity=".85"/><path d="M${cx - r * 0.5} ${cy}H${cx + r * 0.5}M${cx} ${cy - r * 0.5}V${cy + r * 0.5}" stroke="#fff" stroke-width="${px(2)}"/></g>`;
    }
    if (one && one.t === 'link') { const g = linkGeom(one); for (const [n, p] of [['a', g.s], ['b', g.e]]) h += `<circle data-le="${n}" cx="${p.x}" cy="${p.y}" r="${px(7)}" fill="#fff" stroke="#1a73e8" stroke-width="${px(2)}" style="cursor:move"/>`; }
    ui.innerHTML = h + temp;
  }

  /* ================= Annuler, sauvegarde ================= */
  const undoStack = [], redoStack = [];
  const snapshot = () => JSON.stringify(doc.els);
  function pushUndo(before) { if (before === snapshot()) return false; undoStack.push(before); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; return true; }
  function mutate(fn) { const b = snapshot(); fn(); if (pushUndo(b)) dirty(); render(); props(); }
  function undo() { if (!undoStack.length) return toast('Rien à annuler'); redoStack.push(snapshot()); doc.els = JSON.parse(undoStack.pop()); sel = new Set([...sel].filter(byId)); dirty(); render(); props(); }
  function redo() { if (!redoStack.length) return toast('Rien à rétablir'); undoStack.push(snapshot()); doc.els = JSON.parse(redoStack.pop()); sel = new Set([...sel].filter(byId)); dirty(); render(); props(); }
  const idb = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('schema-joe', 1); r.onupgradeneeded = () => { r.result.createObjectStore('docs'); r.result.createObjectStore('kv'); }; r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
    async op(store, mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction(store, mode); const q = fn(tx.objectStore(store)); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); },
    get(s, k) { return this.op(s, 'readonly', (o) => o.get(k)); }, set(s, k, v) { return this.op(s, 'readwrite', (o) => o.put(v, k)); }, del(s, k) { return this.op(s, 'readwrite', (o) => o.delete(k)); }, all(s) { return this.op(s, 'readonly', (o) => o.getAll()); },
  };
  let saveT = null, isDirty = false;
  function dirty() { isDirty = true; clearTimeout(saveT); saveT = setTimeout(save, 700); }
  async function save() { clearTimeout(saveT); try { doc.updated = Date.now(); await idb.set('docs', doc.id, doc); await idb.set('kv', 'current', doc.id); isDirty = false; } catch (e) { console.warn(e); } }
  addEventListener('beforeunload', () => { if (isDirty) save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && isDirty) save(); });
  function loadDoc(d, fit = false) {
    doc = { ...newDoc(), ...d, view: { ...newDoc().view, ...(d.view || {}) } }; doc.els = doc.els || [];
    sel = new Set(); undoStack.length = 0; redoStack.length = 0; render(); props();
    if (fit) fitView(); dirty();
  }

  /* ================= Vue : zoom et déplacement ================= */
  const svgRect = () => svg.getBoundingClientRect();
  const toWorld = (cx, cy) => { const r = svgRect(), v = doc.view; return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k }; };
  function zoomAt(k, cx, cy) { const r = svgRect(); const v = doc.view; if (cx === undefined) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; } const w = toWorld(cx, cy); v.k = Math.max(0.1, Math.min(4, k)); v.x = cx - r.left - w.x * v.k; v.y = cy - r.top - w.y * v.k; applyView(); renderUI(); placeEditor(); }
  function fitView() {
    const b = bounds(); const r = svgRect(); if (!r.width) return;
    if (!b) { doc.view = { x: r.width / 2 - 200, y: 80, k: 1 }; applyView(); return; }
    const padL = innerWidth > 760 ? 70 : 20, padB = innerWidth > 760 ? 30 : 80;
    const k = Math.max(0.1, Math.min(1.5, (r.width - padL - 40) / (b.x2 - b.x), (r.height - padB - 40) / (b.y2 - b.y)));
    doc.view = { k, x: padL + (r.width - padL - (b.x2 - b.x) * k) / 2 - b.x * k, y: 20 + (r.height - padB - 20 - (b.y2 - b.y) * k) / 2 - b.y * k };
    applyView(); renderUI();
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(doc.view.k * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    else { doc.view.x -= e.deltaX; doc.view.y -= e.deltaY; applyView(); }
    renderUI(); placeEditor();
  }, { passive: false });

  /* ================= Outils ================= */
  const HINTS = {
    select: '', hand: 'Glissez pour déplacer la vue',
    link: 'Glissez d\'une forme vers une autre pour les relier',
    pen: 'Dessinez à main levée', hl: 'Surlignez à main levée', eraser: 'Passez sur un trait pour l\'effacer',
  };
  let hintT = null;
  function hint(t, ms = 3500) { const h = $('#hint'); if (!t) { h.hidden = true; return; } h.textContent = t; h.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => { h.hidden = true; }, ms); }
  function setTool(t) {
    tool = t; $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    svg.classList.toggle('pan', t === 'hand'); svg.classList.toggle('draw', /^(pen|hl|eraser|link|shape:)/.test(t));
    $('#more').hidden = true;
    if (t.startsWith('shape:')) hint(`Touchez ou glissez sur la page pour poser : ${KINDS[t.slice(6)] || 'forme'}`); else hint(HINTS[t] || '');
    props();
  }
  $('#tools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  function moreShapes() {
    const m = $('#more'); if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = Object.entries(KINDS).map(([k, n]) => { const s = makeShape(k, 4, 4, 52, k === 'person' ? 36 : 32, ''); s.st = { ...s.st, sw: 2 }; if (k === 'person') { s.w = 24; s.x = 18; } return `<button data-kind="${k}" title="${n}"><svg viewBox="0 0 60 40">${shapeSVG(s).replace(/data-id="[^"]*"/, '')}</svg>${n.split(' ')[0]}</button>`; }).join('');
    m.hidden = false;
  }
  $('#more').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) setTool('shape:' + b.dataset.kind); });

  /* ================= Pointeur ================= */
  const pointers = new Map(); let drag = null; let lastTap = { t: 0, id: null }; let spaceDown = false;
  const elFromTarget = (t) => { const g = t && t.closest && t.closest('[data-id]'); return g && layer.contains(g) ? byId(g.dataset.id) : null; };
  const shapeAtPoint = (cx, cy, except) => { for (const n of document.elementsFromPoint(cx, cy)) { const e = elFromTarget(n); if (e && e.t === 'shape' && e.id !== except) return e; } return null; };
  svg.addEventListener('pointerdown', (ev) => {
    if (editing) commitEdit();
    $('#more').hidden = true;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignoré */ }
    if (pointers.size === 2) { // pincer pour zoomer
      if (drag && drag.before) { doc.els = JSON.parse(drag.before); render(); }
      const [p1, p2] = [...pointers.values()]; drag = { mode: 'pinch', d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), k0: doc.view.k, c0: toWorld((p1.x + p2.x) / 2, (p1.y + p2.y) / 2) }; temp = ''; renderUI(); return;
    }
    if (pointers.size > 2) return;
    const w = toWorld(ev.clientX, ev.clientY); const t = ev.target;
    if (ev.button === 1 || tool === 'hand' || spaceDown) { drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, vx: doc.view.x, vy: doc.view.y }; return; }
    if (t.closest('[data-h]')) { const s = selShape(); drag = { mode: 'resize', h: t.closest('[data-h]').dataset.h, o: { ...s }, id: s.id, before: snapshot() }; return; }
    if (t.closest('[data-c]')) { const s = selShape(); drag = { mode: 'link', from: s.id, side: t.closest('[data-c]').dataset.c, x0: w.x, y0: w.y, w, before: snapshot(), dot: true }; return; }
    if (t.closest('[data-le]')) { const l = selEls()[0]; drag = { mode: 'lend', end: t.closest('[data-le]').dataset.le, id: l.id, before: snapshot() }; return; }
    const el = elFromTarget(t);
    if (tool === 'select') {
      if (el) {
        const now = Date.now();
        if (now - lastTap.t < 380 && lastTap.id === el.id) { lastTap = { t: 0, id: null }; if (el.t !== 'ink') editText(el); return; }
        lastTap = { t: now, id: el.id };
        if (ev.shiftKey || ev.ctrlKey) { sel.has(el.id) ? sel.delete(el.id) : sel.add(el.id); } else if (!sel.has(el.id)) sel = new Set([el.id]);
        render(); props();
        drag = { mode: 'move', x0: w.x, y0: w.y, orig: new Map(selEls().map((e) => [e.id, clone(e)])), before: snapshot(), moved: false };
      } else {
        const now = Date.now(); if (now - lastTap.t < 380 && lastTap.id === 'bg') { lastTap = { t: 0, id: null }; createAt('round', w.x, w.y, true); return; }
        lastTap = { t: now, id: 'bg' };
        if (!ev.shiftKey) { sel = new Set(); render(); props(); }
        drag = ev.pointerType === 'mouse' ? { mode: 'rubber', x0: w.x, y0: w.y, keep: new Set(sel) } : { mode: 'pan', sx: ev.clientX, sy: ev.clientY, vx: doc.view.x, vy: doc.view.y };
      }
      return;
    }
    if (tool.startsWith('shape:')) { drag = { mode: 'create', kind: tool.slice(6), x0: w.x, y0: w.y, w }; return; }
    if (tool === 'link') { drag = { mode: 'link', from: el && el.t === 'shape' ? el.id : null, x0: w.x, y0: w.y, w, before: snapshot() }; return; }
    if (tool === 'pen' || tool === 'hl') { drag = { mode: 'draw', pts: [[w.x, w.y]] }; return; }
    if (tool === 'eraser') { drag = { mode: 'erase', before: snapshot() }; eraseAt(ev.clientX, ev.clientY); }
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!drag) return;
    const w = toWorld(ev.clientX, ev.clientY);
    switch (drag.mode) {
      case 'pinch': {
        const [p1, p2] = [...pointers.values()]; if (!p2) return;
        const r = svgRect(); const v = doc.view; v.k = Math.max(0.1, Math.min(4, drag.k0 * Math.hypot(p1.x - p2.x, p1.y - p2.y) / drag.d0));
        const cx = (p1.x + p2.x) / 2 - r.left, cy = (p1.y + p2.y) / 2 - r.top; v.x = cx - drag.c0.x * v.k; v.y = cy - drag.c0.y * v.k; applyView(); renderUI(); break;
      }
      case 'pan': doc.view.x = drag.vx + ev.clientX - drag.sx; doc.view.y = drag.vy + ev.clientY - drag.sy; applyView(); break;
      case 'move': {
        const dx = w.x - drag.x0, dy = w.y - drag.y0; if (!drag.moved && Math.hypot(dx, dy) * doc.view.k < 3) return; drag.moved = true;
        const firstShape = [...drag.orig.values()].find((o) => o.t === 'shape');
        const sdx = firstShape ? snapV(firstShape.x + dx) - firstShape.x : dx, sdy = firstShape ? snapV(firstShape.y + dy) - firstShape.y : dy;
        for (const [id, o] of drag.orig) {
          const e = byId(id); if (!e) continue;
          if (e.t === 'shape') { e.x = o.x + sdx; e.y = o.y + sdy; }
          else if (e.t === 'ink') e.pts = o.pts.map((p) => [p[0] + sdx, p[1] + sdy]);
          else if (e.t === 'link') { if (!o.a.id) e.a = { x: o.a.x + sdx, y: o.a.y + sdy }; if (!o.b.id) e.b = { x: o.b.x + sdx, y: o.b.y + sdy }; }
        }
        render(); break;
      }
      case 'resize': {
        const e = byId(drag.id), o = drag.o; let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if (/w/.test(drag.h)) x1 = Math.min(snapV(w.x), x2 - 20); if (/e/.test(drag.h)) x2 = Math.max(snapV(w.x), x1 + 20);
        if (/^n/.test(drag.h)) y1 = Math.min(snapV(w.y), y2 - 20); if (/^s/.test(drag.h)) y2 = Math.max(snapV(w.y), y1 + 20);
        if (ev.shiftKey && drag.h.length === 2) { const r = o.w / o.h; if ((x2 - x1) / (y2 - y1) > r) { if (/w/.test(drag.h)) x1 = x2 - (y2 - y1) * r; else x2 = x1 + (y2 - y1) * r; } }
        Object.assign(e, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }); render(); break;
      }
      case 'rubber': {
        const x = Math.min(drag.x0, w.x), y = Math.min(drag.y0, w.y), x2 = Math.max(drag.x0, w.x), y2 = Math.max(drag.y0, w.y);
        sel = new Set(drag.keep); for (const e of doc.els) { const b = bboxOf(e); if (b.x >= x && b.y >= y && b.x2 <= x2 && b.y2 <= y2) sel.add(e.id); }
        temp = `<rect x="${x}" y="${y}" width="${x2 - x}" height="${y2 - y}" fill="rgba(26,115,232,.08)" stroke="#1a73e8" stroke-width="${1 / doc.view.k}" pointer-events="none"/>`; render(); break;
      }
      case 'create': {
        const x = Math.min(drag.x0, w.x), y = Math.min(drag.y0, w.y);
        temp = `<rect x="${x}" y="${y}" width="${Math.abs(w.x - drag.x0)}" height="${Math.abs(w.y - drag.y0)}" fill="rgba(26,115,232,.06)" stroke="#1a73e8" stroke-dasharray="4 3" stroke-width="${1 / doc.view.k}" pointer-events="none"/>`; drag.w = w; renderUI(); break;
      }
      case 'link': case 'lend': {
        const tgt = shapeAtPoint(ev.clientX, ev.clientY, drag.mode === 'link' ? drag.from : null);
        if (drag.mode === 'lend') { const l = byId(drag.id); l[drag.end] = tgt ? { id: tgt.id } : { x: w.x, y: w.y }; render(); }
        else {
          drag.w = w; const tmp = makeLink(drag.from ? { id: drag.from } : { x: drag.x0, y: drag.y0 }, tgt ? { id: tgt.id } : { x: w.x, y: w.y }, { route: 'straight' });
          temp = `<g pointer-events="none" opacity=".7">${linkSVG(tmp).replace(/data-id="[^"]*"/, '')}${tgt ? `<rect x="${tgt.x - 4}" y="${tgt.y - 4}" width="${tgt.w + 8}" height="${tgt.h + 8}" fill="none" stroke="#1a73e8" stroke-width="${2 / doc.view.k}" rx="4"/>` : ''}</g>`; renderUI();
        }
        break;
      }
      case 'draw': {
        const last = drag.pts[drag.pts.length - 1]; if (Math.hypot(w.x - last[0], w.y - last[1]) * doc.view.k < 2) return;
        drag.pts.push([w.x, w.y]); const st = penSt[tool];
        temp = `<path d="${inkPath(drag.pts)}" fill="none" stroke="${st.stroke}" stroke-width="${st.sw}" stroke-linecap="round" stroke-linejoin="round"${tool === 'hl' ? ' stroke-opacity=".4"' : ''} pointer-events="none"/>`; renderUI(); break;
      }
      case 'erase': eraseAt(ev.clientX, ev.clientY); break;
      default:
    }
  });
  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    if (!drag) return;
    if (drag.mode === 'pinch') { if (pointers.size === 0) drag = null; return; }
    const d = drag; drag = null; temp = '';
    const w = toWorld(ev.clientX, ev.clientY);
    switch (d.mode) {
      case 'move': case 'resize': case 'lend': case 'erase': if (pushUndo(d.before)) dirty(); render(); props(); break;
      case 'rubber': render(); props(); break;
      case 'create': {
        const dx = Math.abs(w.x - d.x0), dy = Math.abs(w.y - d.y0);
        if (dx * doc.view.k < 8 && dy * doc.view.k < 8) createAt(d.kind, d.x0, d.y0, d.kind === 'text' || d.kind === 'note');
        else { const x = snapV(Math.min(d.x0, w.x)), y = snapV(Math.min(d.y0, w.y)); const s = makeShape(d.kind, x, y, Math.max(20, snapV(dx)), Math.max(20, snapV(dy))); mutate(() => doc.els.push(s)); sel = new Set([s.id]); setTool('select'); render(); props(); if (d.kind === 'text' || d.kind === 'note') editText(s); }
        break;
      }
      case 'link': {
        const tgt = shapeAtPoint(ev.clientX, ev.clientY, d.from);
        const far = Math.hypot(w.x - d.x0, w.y - d.y0) * doc.view.k > 12;
        if (!tgt && !far) { renderUI(); break; }
        let newShape = null;
        if (!tgt && d.dot && d.from) { // tiré depuis un point bleu et lâché dans le vide : nouvelle forme reliée
          const f = byId(d.from); newShape = makeShape(f.kind === 'text' || f.kind === 'image' ? 'round' : f.kind, 0, 0, f.w, f.h, '', clone(f.st)); newShape.x = snapV(w.x - newShape.w / 2); newShape.y = snapV(w.y - newShape.h / 2);
        }
        const l = makeLink(d.from ? { id: d.from } : { x: d.x0, y: d.y0 }, tgt ? { id: tgt.id } : newShape ? { id: newShape.id } : { x: w.x, y: w.y }, defaultLinkStyle(d.from));
        mutate(() => { if (newShape) doc.els.push(newShape); doc.els.push(l); });
        sel = new Set([newShape ? newShape.id : l.id]); if (tool === 'link') setTool('select'); render(); props();
        if (newShape) editText(newShape);
        break;
      }
      case 'draw': {
        if (d.pts.length < 2) d.pts.push([d.pts[0][0] + 0.5, d.pts[0][1] + 0.5]);
        const st = penSt[tool]; const k = { id: uid(), t: 'ink', pts: simplify(d.pts, 0.6 / doc.view.k).map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]), st: { stroke: st.stroke, sw: st.sw, hl: tool === 'hl' } };
        mutate(() => doc.els.push(k)); break;
      }
      default: renderUI();
    }
  }
  svg.addEventListener('pointerup', endPointer); svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('dblclick', (e) => e.preventDefault());
  function defaultLinkStyle(fromId) {
    const prev = fromId && links().find((l) => l.a.id === fromId); // reprendre le style des connecteurs voisins
    if (prev) return { route: prev.route, arrow: prev.arrow, o: prev.o, st: clone(prev.st) };
    return { route: doc.layout === 'mind' ? 'curve' : doc.layout === 'org' ? 'elbow' : 'straight', arrow: doc.layout ? 'none' : 'end', o: doc.layout === 'org' ? 'v' : doc.layout ? 'h' : undefined };
  }
  function eraseAt(cx, cy) {
    const r = 8; let hit = false;
    for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) for (const n of document.elementsFromPoint(cx + dx, cy + dy)) { const e = elFromTarget(n); if (e && e.t === 'ink') { doc.els = doc.els.filter((x) => x !== e); hit = true; } }
    if (hit) render();
  }
  function simplify(pts, eps) { // Ramer-Douglas-Peucker
    if (pts.length < 3) return pts;
    const dist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const n = Math.hypot(dx, dy); if (!n) return Math.hypot(p[0] - a[0], p[1] - a[1]); return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / n; };
    let md = 0, mi = 0; for (let i = 1; i < pts.length - 1; i++) { const d = dist(pts[i], pts[0], pts[pts.length - 1]); if (d > md) { md = d; mi = i; } }
    if (md <= eps) return [pts[0], pts[pts.length - 1]];
    return [...simplify(pts.slice(0, mi + 1), eps).slice(0, -1), ...simplify(pts.slice(mi), eps)];
  }
  function createAt(kind, x, y, edit) {
    const s = makeShape(kind, 0, 0); s.x = snapV(x - s.w / 2); s.y = snapV(y - s.h / 2);
    mutate(() => doc.els.push(s)); sel = new Set([s.id]); setTool('select'); render(); props();
    if (edit) editText(s);
    return s;
  }

  /* ================= Édition du texte ================= */
  let editing = null; const ed = document.createElement('textarea'); ed.id = 'editor'; ed.hidden = true; work.appendChild(ed);
  function placeEditor() {
    if (!editing) return; const e = byId(editing.id); if (!e) return; const v = doc.view;
    let x, y, w, h, fs;
    if (e.t === 'shape') { x = e.x; y = e.y; w = e.w; h = e.h; fs = e.st.fs || 16; if (e.kind === 'person') { y = e.y + e.h; h = 40; x = e.x - 50; w = e.w + 100; } }
    else { const g = linkGeom(e); w = 180; h = 44; x = g.mid.x - 90; y = g.mid.y - 22; fs = e.st.fs || 13; }
    Object.assign(ed.style, { left: x * v.k + v.x + 'px', top: y * v.k + v.y + 'px', width: Math.max(80, w * v.k) + 'px', height: Math.max(34, h * v.k) + 'px', fontSize: Math.max(12, fs * v.k) + 'px', fontWeight: e.st && e.st.bold ? 600 : 400, textAlign: (e.st && e.st.align) || 'center' });
    const lines = (ed.value.match(/\n/g) || []).length + 1; ed.style.paddingTop = Math.max(2, (Math.max(34, h * v.k) - lines * Math.max(12, fs * v.k) * 1.25) / 2 - 2) + 'px';
  }
  // ramène l'élément dans la partie visible (au-dessus des panneaux sur téléphone)
  function ensureVisible(e) {
    const r = svgRect(); const v = doc.view; const b = bboxOf(e); const mob = innerWidth <= 760;
    const vis = { x: mob ? 10 : 70, y: 10, x2: r.width - (mob ? 10 : 270), y2: r.height - (mob ? 70 : 10) };
    const sx = b.x * v.k + v.x, sy = b.y * v.k + v.y, sx2 = b.x2 * v.k + v.x, sy2 = b.y2 * v.k + v.y;
    if (sx >= vis.x && sy >= vis.y && sx2 <= vis.x2 && sy2 <= vis.y2) return;
    v.x += (vis.x + vis.x2) / 2 - (sx + sx2) / 2; v.y += (vis.y + Math.min(vis.y2, r.height * 0.45)) / 2 - (sy + sy2) / 2; applyView(); renderUI();
  }
  function editText(e) {
    if (!e || e.t === 'ink') return;
    editing = { id: e.id, before: snapshot() }; sel = new Set([e.id]); render(); props();
    ensureVisible(e);
    ed.value = e.text || ''; ed.hidden = false; placeEditor();
    setTimeout(() => { ed.focus(); ed.select(); }, 0);
  }
  function commitEdit(cancel = false) {
    if (!editing) return; const e = byId(editing.id); const before = editing.before; editing = null; ed.hidden = true;
    if (e && !cancel) { e.text = ed.value.replace(/\s+$/, ''); if (pushUndo(before)) dirty(); }
    render(); props();
  }
  ed.addEventListener('input', placeEditor);
  ed.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); commitEdit(true); }
    else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitEdit(); }
    else if (ev.key === 'Tab') { ev.preventDefault(); commitEdit(); addRelated(ev.shiftKey); }
  });
  ed.addEventListener('blur', () => setTimeout(() => { if (editing && document.activeElement !== ed) commitEdit(); }, 120));

  /* ================= Arbres : enfants, frères, réorganisation ================= */
  const kids = (id) => links().filter((l) => l.a.id === id && l.b.id && byId(l.b.id) && byId(l.b.id).t === 'shape').map((l) => byId(l.b.id));
  const parentLink = (id) => links().find((l) => l.b.id === id && l.a.id && byId(l.a.id));
  function rootOf(id) { const seen = new Set([id]); let cur = id; for (;;) { const p = parentLink(cur); if (!p || seen.has(p.a.id)) return cur; seen.add(p.a.id); cur = p.a.id; } }
  function flowOf(id) { const l = links().find((x) => (x.a.id === id || x.b.id === id) && x.o); return l ? (l.o === 'v' ? 'org' : doc.layout === 'mind' ? 'mind' : 'right') : doc.layout || 'org'; }
  function addRelated(sibling) {
    const p = selShape(); if (!p) return toast('Sélectionnez d\'abord une forme');
    let parent = p; if (sibling) { const pl = parentLink(p.id); if (!pl) return toast('Cet élément n\'a pas de parent : utilisez « Ajouter un élément enfant » (Tab)'); parent = byId(pl.a.id); }
    const flow = flowOf(parent.id); const sibs = kids(parent.id);
    const model = sibling ? p : sibs[0] || null;
    const kind = model ? model.kind : parent.kind === 'ellipse' || parent.kind === 'circle' ? 'round' : parent.kind;
    const st = model ? clone(model.st) : clone(parent.st);
    if (!model && doc.layout === 'mind') { const c = BRANCH[sibs.length % BRANCH.length]; Object.assign(st, { fill: c, stroke: c, color: '#ffffff', fs: 16, bold: true }); }
    const n = makeShape(kind, 0, 0, model ? model.w : parent.w, model ? model.h : parent.h, '', st);
    const last = sibs[sibs.length - 1];
    if (flow === 'org') { n.x = last ? last.x + last.w + 30 : parent.x + parent.w / 2 - n.w / 2; n.y = last ? last.y : parent.y + parent.h + 60; }
    else { const left = parent.x > (byId(rootOf(parent.id)) || parent).x + 1 ? false : last && last.x < parent.x; n.x = left ? parent.x - 60 - n.w : parent.x + parent.w + 60; n.y = last ? last.y + last.h + 16 : parent.y + parent.h / 2 - n.h / 2; }
    const pl = parentLink(p.id); const lstyle = sibs.length ? (() => { const l0 = links().find((l) => l.a.id === parent.id && l.b.id === sibs[0].id); return { route: l0.route, arrow: l0.arrow, o: l0.o, st: clone(l0.st) }; })() : pl && !sibling ? { route: pl.route, arrow: pl.arrow, o: pl.o, st: clone(pl.st) } : defaultLinkStyle(null);
    if (!sibs.length && doc.layout === 'mind') lstyle.st = { ...lstyle.st, stroke: st.stroke || lstyle.st.stroke };
    const l = makeLink({ id: parent.id }, { id: n.id }, lstyle);
    mutate(() => { doc.els.push(n, l); if (doc.layout) layoutTree(rootOf(parent.id), doc.layout); });
    sel = new Set([n.id]); render(); props(); editText(n);
  }
  function layoutTree(rootId, mode) {
    const root = byId(rootId); if (!root) return;
    const seen = new Set(); const T = (s) => { seen.add(s.id); return { s, kids: kids(s.id).filter((k) => !seen.has(k.id)).map((k) => (seen.has(k.id) ? null : T(k))).filter(Boolean) }; };
    const tree = T(root); const ax = root.x, ay = root.y;
    const linkOf = (a, b) => links().find((l) => l.a.id === a.id && l.b.id === b.id);
    if (mode === 'org') {
      const GX = 30, GY = 60; const depthH = [];
      const meas = (n, d) => { depthH[d] = Math.max(depthH[d] || 0, n.s.h); n.kids.forEach((k) => meas(k, d + 1)); const tw = n.kids.reduce((a, k) => a + k.W, 0) + GX * Math.max(0, n.kids.length - 1); n.W = Math.max(n.s.w, tw); n.TW = tw; };
      meas(tree, 0); const yAt = (d) => depthH.slice(0, d).reduce((a, h) => a + h + GY, 0);
      const place = (n, left, d) => { n.s.x = left + (n.W - n.s.w) / 2; n.s.y = yAt(d) + (depthH[d] - n.s.h) / 2; let cx = left + (n.W - n.TW) / 2; n.kids.forEach((k) => { place(k, cx, d + 1); cx += k.W + GX; const l = linkOf(n.s, k.s); if (l) { l.route = 'elbow'; l.o = 'v'; } }); };
      place(tree, 0, 0);
    } else {
      const GX = mode === 'mind' ? 70 : 60, GY = mode === 'mind' ? 14 : 20;
      const meas = (n) => { n.kids.forEach(meas); const th = n.kids.reduce((a, k) => a + k.H, 0) + GY * Math.max(0, n.kids.length - 1); n.H = Math.max(n.s.h, th); n.TH = th; };
      const place = (n, top, dir) => { n.s.y = top + (n.H - n.s.h) / 2; let cy = top + (n.H - n.TH) / 2; n.kids.forEach((k) => { k.s.x = dir > 0 ? n.s.x + n.s.w + GX : n.s.x - GX - k.s.w; place(k, cy, dir); cy += k.H + GY; const l = linkOf(n.s, k.s); if (l) { l.o = 'h'; l.route = mode === 'mind' ? 'curve' : 'elbow'; } }); };
      tree.s.x = 0;
      if (mode === 'mind' && tree.kids.length > 1) {
        tree.kids.forEach(meas); const R = [], L = []; let hr = 0, hl = 0;
        tree.kids.forEach((k) => { if (hr <= hl) { R.push(k); hr += k.H + GY; } else { L.push(k); hl += k.H + GY; } });
        const side = (list, dir) => { const th = list.reduce((a, k) => a + k.H, 0) + GY * Math.max(0, list.length - 1); let cy = tree.s.h / 2 - th / 2; list.forEach((k) => { k.s.x = dir > 0 ? tree.s.w + GX : -GX - k.s.w; place(k, cy, dir); cy += k.H + GY; const l = linkOf(tree.s, k.s); if (l) { l.o = 'h'; l.route = 'curve'; } }); };
        tree.s.y = 0; side(R, 1); side(L.reverse(), -1);
      } else { meas(tree); place(tree, 0, 1); }
    }
    // la racine reste à sa place
    const dx = ax - root.x, dy = ay - root.y; const move = (n) => { n.s.x = Math.round(n.s.x + dx); n.s.y = Math.round(n.s.y + dy); n.kids.forEach(move); }; move(tree);
  }
  function relayout(mode) {
    let roots = [];
    const s = selShape(); if (s) roots = [rootOf(s.id)];
    else { roots = shapes().filter((x) => !parentLink(x.id) && kids(x.id).length).map((x) => x.id); }
    if (!roots.length) return toast('Reliez d\'abord des formes par des connecteurs (de la forme parente vers l\'enfant)');
    mutate(() => { doc.layout = mode === 'right' ? null : mode; roots.forEach((r) => layoutTree(r, mode)); });
    toast(mode === 'org' ? 'Organigramme réorganisé' : mode === 'mind' ? 'Carte mentale réorganisée' : 'Schéma réorganisé de gauche à droite');
  }

  /* ================= Générateurs ================= */
  function parseOutline(text) {
    const roots = []; const stack = [];
    for (const raw of String(text).split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const m = /^([\s\t]*)(?:[-*•–]\s*|\d+[.)]\s+)?(.*)$/.exec(raw.replace(/\t/g, '    '));
      const depth = Math.floor(m[1].length / 2); const node = { text: m[2].trim().replace(/\s*\|\s*/g, '\n'), kids: [] };
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      if (stack.length) stack[stack.length - 1].node.kids.push(node); else roots.push(node);
      stack.push({ depth, node });
    }
    return roots;
  }
  function sizeFor(text, fs, bold, minW, maxW, minH) {
    const w = Math.min(maxW, Math.max(minW, textWidth(text, fs, bold) + 34));
    const n = wrap(text, w - 16, fs, bold).length; return [Math.round(w / 10) * 10, Math.max(minH, Math.ceil((n * fs * 1.25 + 22) / 10) * 10)];
  }
  function buildOrg(roots, origin) {
    const FILL = [['#1f3864', '#ffffff'], ['#2f5496', '#ffffff'], ['#d9e2f3', '#1f3864'], ['#ffffff', '#1a1a1a']];
    const added = []; const rootIds = [];
    const mk = (n, d, parent) => {
      const [f, c] = FILL[Math.min(d, 3)]; const [w, h] = sizeFor(n.text, d ? 14 : 16, d < 2, 150, 220, 56);
      const s = makeShape('round', 0, 0, w, h, n.text, { fill: f, stroke: d >= 2 ? '#2f5496' : f, color: c, fs: d ? 14 : 16, bold: d < 2 });
      added.push(s); if (parent) added.push(makeLink({ id: parent.id }, { id: s.id }, { route: 'elbow', o: 'v', arrow: 'none', st: { stroke: '#2f5496', sw: 2 } })); else rootIds.push(s.id);
      n.kids.forEach((k) => mk(k, d + 1, s));
    };
    roots.forEach((r) => mk(r, 0, null));
    return finishGen(added, rootIds, 'org', origin);
  }
  function buildMind(roots, origin) {
    const added = []; const rootIds = [];
    roots.forEach((r) => {
      const [w, h] = sizeFor(r.text, 20, true, 160, 260, 80);
      const root = makeShape('ellipse', 0, 0, w + 20, h + 10, r.text, { fill: '#37474f', stroke: '#37474f', color: '#ffffff', fs: 20, bold: true }); added.push(root); rootIds.push(root.id);
      r.kids.forEach((k, i) => {
        const col = BRANCH[i % BRANCH.length];
        const mk = (n, d, parent) => {
          const fs = d === 1 ? 16 : 14; const [bw, bh] = sizeFor(n.text, fs, d === 1, d === 1 ? 120 : 100, 220, d === 1 ? 46 : 36);
          const s = makeShape('round', 0, 0, bw, bh, n.text, d === 1 ? { fill: col, stroke: col, color: '#ffffff', fs, bold: true } : { fill: col + '1f', stroke: col, color: '#1a1a1a', fs, sw: 1.5 });
          added.push(s, makeLink({ id: parent.id }, { id: s.id }, { route: 'curve', o: 'h', arrow: 'none', st: { stroke: col, sw: d === 1 ? 3 : 2 } }));
          n.kids.forEach((c) => mk(c, d + 1, s));
        };
        mk(k, 1, root);
      });
    });
    return finishGen(added, rootIds, 'mind', origin);
  }
  function buildFlow(text, origin) {
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const added = []; let prev = null; let pendingLabel = ''; let y = 0; const X = 0; const W = 220;
    const push = (s, label) => { s.x = X + (W - s.w) / 2; s.y = y; y += s.h + 50; added.push(s); if (prev) added.push(makeLink({ id: prev.id }, { id: s.id }, { route: 'elbow', o: 'v', text: label || '', st: { stroke: '#37474f', sw: 2 } })); prev = s; };
    const first = lines[0] || ''; if (!/^d[ée]but/i.test(first)) push(makeShape('term', 0, 0, 140, 50, 'Début', { fill: '#c8e6c9', stroke: '#2e7d32' }));
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i];
      if (/^non\s*:/i.test(t)) continue;
      if (/^(d[ée]but|fin)$/i.test(t)) { push(makeShape('term', 0, 0, 140, 50, t, { fill: /^fin/i.test(t) ? '#ffcdd2' : '#c8e6c9', stroke: /^fin/i.test(t) ? '#c62828' : '#2e7d32' }), pendingLabel); pendingLabel = ''; continue; }
      if (/\?\s*$/.test(t)) {
        const [w, h] = sizeFor(t, 15, false, 170, 240, 90); const d = makeShape('diamond', 0, 0, w + 30, h + 30, t, { fill: '#fff3c4', stroke: '#ef6c00', fs: 15 }); push(d, pendingLabel); pendingLabel = 'Oui';
        const nx = lines[i + 1] && /^non\s*:\s*(.*)$/i.exec(lines[i + 1]);
        if (nx) { const [bw, bh] = sizeFor(nx[1], 15, false, 160, 220, 60); const b = makeShape('round', X + W + 90, d.y + d.h / 2 - bh / 2, bw, bh, nx[1], { fill: '#ffcdd2', stroke: '#c62828', fs: 15 }); added.push(b, makeLink({ id: d.id }, { id: b.id }, { route: 'elbow', o: 'h', text: 'Non', st: { stroke: '#c62828', sw: 2 } })); }
        continue;
      }
      const isDoc = /^(doc|document)\s*:/i.test(t); const tx = t.replace(/^(doc|document)\s*:\s*/i, '');
      const [w, h] = sizeFor(tx, 15, false, 180, 240, 60);
      push(makeShape(isDoc ? 'doc' : 'rect', 0, 0, w, h + (isDoc ? 14 : 0), tx, { fill: isDoc ? '#e1f5fe' : '#ffffff', stroke: '#1565c0', fs: 15 }), pendingLabel); pendingLabel = '';
    }
    if (!/^fin$/i.test(lines[lines.length - 1] || '')) push(makeShape('term', 0, 0, 140, 50, 'Fin', { fill: '#ffcdd2', stroke: '#c62828' }), pendingLabel);
    return finishGen(added, [], null, origin);
  }
  function finishGen(added, rootIds, mode, origin) {
    mutate(() => {
      doc.els.push(...added); if (mode) doc.layout = mode;
      let ox = 0;
      for (const r of rootIds) { const s = byId(r); s.x = ox; s.y = 0; layoutTree(r, mode); const b = bounds(added.filter((e) => e.t === 'shape' && rootOf(e.id) === r)); const shift = ox - b.x; added.filter((e) => e.t === 'shape' && rootOf(e.id) === r).forEach((e) => { e.x += shift; }); ox += b.x2 - b.x + 80; }
      const b = bounds(added); const dx = (origin ? origin.x : 0) - b.x, dy = (origin ? origin.y : 0) - b.y;
      added.filter((e) => e.t === 'shape').forEach((e) => { e.x = Math.round(e.x + dx); e.y = Math.round(e.y + dy); });
    });
    sel = new Set(added.filter((e) => e.t === 'shape').map((e) => e.id)); render(); props(); fitView();
  }
  const EX_ORG = 'Maire\n  Premier adjoint\n  Secrétaire général\n    Service des affaires financières | Chef de service\n      Régie des recettes\n    Service de l\'état civil\n    Service technique\n    Service des affaires sociales';
  const EX_MIND = 'Budget 2027\n  Recettes\n    Taxes de marché\n    Patentes et licences\n    Taxe de résidence\n  Dépenses\n    Personnel\n    Entretien\n    Investissements\n  Calendrier\n    Préparation (juillet)\n    Vote (novembre)\n  Acteurs\n    Maire\n    Conseil municipal\n    Receveur municipal';
  const EX_FLOW = 'Réception du titre de recette\nVérification des pièces justificatives\nPièces conformes ?\nnon: Rejet et retour à l\'ordonnateur\nPrise en charge en comptabilité\ndoc: Avis de recouvrement au redevable\nEncaissement et quittance';
  const placeOrigin = () => { const b = bounds(); return b ? { x: b.x, y: b.y2 + 80 } : { x: 0, y: 0 }; };
  async function genDialog(kind) {
    const T = { org: ['Organigramme', 'Une ligne par poste ; décalez de deux espaces (ou une tabulation) pour placer un poste sous le précédent. « Fonction | Nom » écrit le nom sur une deuxième ligne.', EX_ORG],
      mind: ['Carte mentale', 'Première ligne : le sujet central. Décalez les idées de deux espaces pour les placer sous la précédente.', EX_MIND],
      flow: ['Logigramme', 'Une étape par ligne. Une question qui finit par « ? » devient un losange ; la ligne suivante « non: … » donne la branche « Non ». « doc: … » dessine un document.', EX_FLOW] }[kind];
    const txt = await modal({ title: T[0] + ' à partir d\'une liste', wide: true, body: `<p class="hint">${T[1]}</p><textarea id="gx" rows="12" style="width:100%;font-family:monospace;font-size:14px" spellcheck="false"></textarea><p class="hint">Astuce : ensuite, sélectionnez un élément et appuyez sur Tab (enfant) ou Entrée (frère) pour compléter.</p>`, onOpen: (b) => { b.querySelector('#gx').value = T[2]; b.querySelector('#gx').addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); } }); }, buttons: [{ label: 'Annuler', value: null }, { label: 'Créer', primary: true, value: (b) => b.querySelector('#gx').value }] });
    if (!txt || !txt.trim()) return;
    const origin = placeOrigin();
    if (kind === 'flow') buildFlow(txt, origin);
    else { const roots = parseOutline(txt); if (!roots.length) return; kind === 'org' ? buildOrg(roots, origin) : buildMind(roots, origin); }
  }

  /* ================= Panneau des propriétés ================= */
  const P = $('#props');
  function swatches(list, cur, key, none) { return (none ? `<button class="sw none${cur === 'none' ? ' on' : ''}" data-set="${key}" data-v="none" title="Aucun"></button>` : '') + list.map((c) => `<button class="sw${String(cur).toLowerCase() === c ? ' on' : ''}" style="background:${c}" data-set="${key}" data-v="${c}" title="${c}"></button>`).join('') + `<input type="color" data-set="${key}" value="${/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000'}" style="width:26px;height:24px;padding:0;border:0" title="Autre couleur">`; }
  function props() {
    if (tool === 'pen' || tool === 'hl') {
      const st = penSt[tool]; P.hidden = false;
      P.innerHTML = `<h4>${tool === 'pen' ? 'Crayon' : 'Surligneur'}</h4><div class="row">${swatches(tool === 'pen' ? STROKES : ['#ffeb3b', '#a5d6a7', '#90caf9', '#f48fb1', '#ffcc80'], st.stroke, 'pen.stroke')}</div><div class="row">Épaisseur <select data-set="pen.sw">${(tool === 'pen' ? [1, 2, 3, 5, 8, 12] : [10, 18, 26]).map((v) => `<option ${st.sw === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
      return;
    }
    const els = selEls(); if (!els.length || editing) { P.hidden = true; return; }
    P.hidden = false;
    const f = els[0]; const sh = els.filter((e) => e.t === 'shape'), ln = els.filter((e) => e.t === 'link'), ik = els.filter((e) => e.t === 'ink');
    let h = '';
    if (sh.length) {
      const s = sh[0].st;
      h += `<h4>Forme${sh.length > 1 ? `s (${sh.length})` : ''}</h4>`;
      if (sh.length === 1) h += `<div class="row"><button data-p="edit">✎ Texte</button><button data-p="child" title="Tab">＋ Enfant</button><button data-p="sibling" title="Entrée">＋ Frère</button></div>`;
      h += `<div class="row"><select data-set="kind">${Object.entries(KINDS).map(([k, n]) => `<option value="${k}" ${sh[0].kind === k ? 'selected' : ''}>${n}</option>`).join('')}${sh[0].kind === 'image' ? '<option value="image" selected>Image</option>' : ''}</select></div>`;
      h += `<div>Fond</div><div class="row">${swatches(FILLS, s.fill, 'fill', true)}</div><div>Contour</div><div class="row">${swatches(STROKES, s.stroke, 'stroke', true)}</div>`;
      h += `<div class="row">Épaisseur <select data-set="sw">${[1, 1.5, 2, 3, 4, 6].map((v) => `<option ${+s.sw === v ? 'selected' : ''}>${v}</option>`).join('')}</select><select data-set="dash"><option value="">Plein</option><option value="dash" ${s.dash === 'dash' ? 'selected' : ''}>Tirets</option><option value="dot" ${s.dash === 'dot' ? 'selected' : ''}>Pointillés</option></select></div>`;
      h += `<div>Texte</div><div class="row">${swatches(TEXTS, s.color, 'color')}</div><div class="row"><select data-set="fs">${[10, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48].map((v) => `<option ${+s.fs === v ? 'selected' : ''}>${v}</option>`).join('')}</select><button data-set="bold" class="${s.bold ? 'on' : ''}"><b>G</b></button><button data-set="italic" class="${s.italic ? 'on' : ''}"><i>I</i></button><button data-set="align" data-v="left" class="${s.align === 'left' ? 'on' : ''}">⇤</button><button data-set="align" data-v="center" class="${!s.align || s.align === 'center' ? 'on' : ''}">↔</button><button data-set="align" data-v="right" class="${s.align === 'right' ? 'on' : ''}">⇥</button></div>`;
    }
    if (ln.length) {
      const l = ln[0];
      h += `<h4>Connecteur${ln.length > 1 ? `s (${ln.length})` : ''}</h4>`;
      if (ln.length === 1) h += `<div class="row"><button data-p="edit">✎ Étiquette</button><button data-p="reverse">⇄ Inverser</button></div>`;
      h += `<div class="row">${[['straight', 'Droit'], ['elbow', 'Coudé'], ['curve', 'Courbe']].map(([v, n]) => `<button data-set="route" data-v="${v}" class="${l.route === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
      h += `<div class="row">${[['none', '—'], ['end', '→'], ['start', '←'], ['both', '↔']].map(([v, n]) => `<button data-set="arrow" data-v="${v}" class="${l.arrow === v ? 'on' : ''}" title="Flèches">${n}</button>`).join('')}</div>`;
      h += `<div class="row">${swatches(STROKES, l.st.stroke, 'lstroke')}</div><div class="row">Épaisseur <select data-set="lsw">${[1, 1.5, 2, 3, 4, 6].map((v) => `<option ${+l.st.sw === v ? 'selected' : ''}>${v}</option>`).join('')}</select><select data-set="ldash"><option value="">Plein</option><option value="dash" ${l.st.dash === 'dash' ? 'selected' : ''}>Tirets</option><option value="dot" ${l.st.dash === 'dot' ? 'selected' : ''}>Pointillés</option></select></div>`;
    }
    if (ik.length) h += `<h4>Dessin</h4><div class="row">${swatches(STROKES, ik[0].st.stroke, 'istroke')}</div><div class="row">Épaisseur <select data-set="isw">${[1, 2, 3, 5, 8, 12, 18].map((v) => `<option ${+ik[0].st.sw === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
    h += `<div class="row"><button data-p="duplicate" title="Ctrl+D">⧉ Dupliquer</button><button data-p="front" title="Premier plan">⬆</button><button data-p="back" title="Arrière-plan">⬇</button><button data-p="del" title="Supprimer">🗑</button></div>`;
    P.innerHTML = h; void f;
  }
  function setProp(key, v) {
    if (key === 'pen.stroke') { penSt[tool].stroke = v; props(); return; }
    if (key === 'pen.sw') { penSt[tool].sw = +v; props(); return; }
    mutate(() => {
      for (const e of selEls()) {
        if (e.t === 'shape') {
          if (key === 'kind') { e.kind = v; if (v === 'text') Object.assign(e.st, { fill: 'none', stroke: 'none' }); if (v === 'note') Object.assign(e.st, { fill: '#fff59d', stroke: '#e0c200', sw: 1 }); }
          else if (key === 'bold' || key === 'italic') e.st[key] = !e.st[key];
          else if (key === 'sw' || key === 'fs') e.st[key] = +v;
          else if (['fill', 'stroke', 'color', 'dash', 'align'].includes(key)) e.st[key] = v;
        } else if (e.t === 'link') {
          if (key === 'route') { e.route = v; if (v === 'straight') delete e.o; }
          else if (key === 'arrow') e.arrow = v; else if (key === 'lstroke') e.st.stroke = v; else if (key === 'lsw') e.st.sw = +v; else if (key === 'ldash') e.st.dash = v;
        } else if (e.t === 'ink') { if (key === 'istroke') e.st.stroke = v; if (key === 'isw') e.st.sw = +v; }
      }
    });
  }
  P.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.set) setProp(b.dataset.set, b.dataset.v);
    else if (b.dataset.p) act(b.dataset.p);
  });
  P.addEventListener('change', (e) => { const t = e.target; if (t.dataset.set) setProp(t.dataset.set, t.value); });

  /* ================= Actions d'édition ================= */
  let clip = null;
  function copy() { const els = selEls(); if (!els.length) return; const ids = new Set(els.map((e) => e.id)); clip = clone([...els, ...links().filter((l) => !ids.has(l.id) && ids.has(l.a.id) && ids.has(l.b.id))]); Studio.store('schema-clip', clip); toast(`${els.length} élément${els.length > 1 ? 's' : ''} copié${els.length > 1 ? 's' : ''}`); }
  function paste(src, off = 30) {
    const items = clone(src || clip || Studio.store('schema-clip') || []); if (!items.length) return toast('Rien à coller');
    const map = {}; items.forEach((e) => { map[e.id] = uid(); });
    for (const e of items) {
      e.id = map[e.id];
      if (e.t === 'shape') { e.x += off; e.y += off; }
      if (e.t === 'ink') e.pts = e.pts.map((p) => [p[0] + off, p[1] + off]);
      if (e.t === 'link') for (const k of ['a', 'b']) { if (e[k].id) e[k] = map[e[k].id] ? { id: map[e[k].id] } : { x: 0, y: 0 }; else e[k] = { x: e[k].x + off, y: e[k].y + off }; }
    }
    mutate(() => doc.els.push(...items)); sel = new Set(items.map((e) => e.id)); render(); props();
  }
  function del() {
    const ids = new Set(selEls().map((e) => e.id)); if (!ids.size) return;
    mutate(() => {
      // un connecteur dont une forme disparaît est supprimé aussi
      doc.els = doc.els.filter((e) => !ids.has(e.id) && !(e.t === 'link' && ((e.a.id && ids.has(e.a.id)) || (e.b.id && ids.has(e.b.id)))));
      sel = new Set();
    });
  }
  function order(front) { mutate(() => { const s = doc.els.filter((e) => sel.has(e.id)), o = doc.els.filter((e) => !sel.has(e.id)); doc.els = front ? [...o, ...s] : [...s, ...o]; }); }
  function align(how) {
    const s = selEls().filter((e) => e.t === 'shape'); if (s.length < 2) return toast('Sélectionnez au moins deux formes');
    mutate(() => {
      const b = bounds(s);
      if (how === 'distH' || how === 'distV') {
        const H = how === 'distH'; s.sort((a, c) => (H ? a.x - c.x : a.y - c.y)); const tot = s.reduce((a, e) => a + (H ? e.w : e.h), 0); const gap = ((H ? b.x2 - b.x : b.y2 - b.y) - tot) / (s.length - 1); let p = H ? b.x : b.y;
        s.forEach((e) => { if (H) { e.x = Math.round(p); p += e.w + gap; } else { e.y = Math.round(p); p += e.h + gap; } }); return;
      }
      if (how === 'sameSize') { s.forEach((e) => { e.w = s[0].w; e.h = s[0].h; }); return; }
      s.forEach((e) => { if (how === 'alignL') e.x = b.x; if (how === 'alignR') e.x = b.x2 - e.w; if (how === 'alignC') e.x = Math.round((b.x + b.x2) / 2 - e.w / 2); if (how === 'alignT') e.y = b.y; if (how === 'alignB') e.y = b.y2 - e.h; if (how === 'alignM') e.y = Math.round((b.y + b.y2) / 2 - e.h / 2); });
    });
  }
  async function addImage(files) {
    files = files || (await pickFiles('image/*', true)); if (!files.length) return;
    const r = svgRect(); const c = toWorld(r.left + r.width / 2, r.top + r.height / 2); const added = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      let src = await Studio.readAsDataURL(f); const img = await Studio.loadImage(src);
      if (Math.max(img.naturalWidth, img.naturalHeight) > 1600 && !/svg/.test(f.type)) { const k = 1600 / Math.max(img.naturalWidth, img.naturalHeight); const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); src = cv.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88); }
      const k = Math.min(1, 360 / Math.max(img.naturalWidth || 300, img.naturalHeight || 200)); const w = Math.round((img.naturalWidth || 300) * k), h = Math.round((img.naturalHeight || 200) * k);
      const s = makeShape('image', Math.round(c.x - w / 2 + added.length * 20), Math.round(c.y - h / 2 + added.length * 20), w, h, '', { fill: 'none', stroke: 'none' }); s.src = src; added.push(s);
    }
    if (!added.length) return;
    mutate(() => doc.els.push(...added)); sel = new Set(added.map((e) => e.id)); setTool('select'); render(); props();
  }

  /* ================= Fichiers et exports ================= */
  function exportSVG(d = doc, { pad = 24, bg = '#ffffff' } = {}) {
    const saved = doc; doc = d; // les fonctions de dessin lisent « doc »
    try {
      const b = bounds(d.els) || { x: 0, y: 0, x2: 200, y2: 100 }; const W = Math.ceil(b.x2 - b.x + pad * 2), H = Math.ceil(b.y2 - b.y + pad * 2);
      const body = d.els.map(elSVG).join('').replace(/ data-id="[^"]*"/g, '').replace(/ pointer-events="[^"]*"/g, '').replace(/<path d="[^"]*" fill="none" stroke="transparent" stroke-width="16"\/>/g, '');
      return { svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="${(b.x - pad).toFixed(1)} ${(b.y - pad).toFixed(1)} ${W} ${H}">${bg ? `<rect x="${(b.x - pad).toFixed(1)}" y="${(b.y - pad).toFixed(1)}" width="${W}" height="${H}" fill="${bg}"/>` : ''}${body}</svg>`, W, H };
    } finally { doc = saved; }
  }
  async function toCanvas(scale = 2) {
    const { svg: s, W, H } = exportSVG(); const k = Math.min(scale, 8000 / Math.max(W, H));
    const img = await Studio.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s));
    const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); return c;
  }
  const fileBase = () => (doc.title || 'Schéma').replace(/[\\/:*?"<>|]+/g, '_');
  const needEls = () => { if (!doc.els.length) { toast('Le schéma est vide'); return false; } return true; };
  async function exportPNG() { if (!needEls()) return; const c = await toCanvas(2); c.toBlob((b) => download(b, fileBase() + '.png'), 'image/png'); }
  function exportSVGFile() { if (!needEls()) return; download(new Blob([exportSVG().svg], { type: 'image/svg+xml' }), fileBase() + '.svg'); }
  function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('bibliothèque introuvable : ' + src)); document.head.appendChild(s); }); }
  async function exportPDF() {
    if (!needEls()) return;
    await loadScript('lib/jspdf.umd.min.js'); const { jsPDF } = window.jspdf;
    const c = await toCanvas(2.5); const land = c.width >= c.height;
    const pdf = new jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const PW = land ? 297 : 210, PH = land ? 210 : 297, M = 12; const k = Math.min((PW - 2 * M) / c.width, (PH - 2 * M - 8) / c.height);
    pdf.setFontSize(11); pdf.text(String(doc.title || '').replace(/[^\x00-\xff€]/g, ''), M, M);
    pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', (PW - c.width * k) / 2, M + 6, c.width * k, c.height * k);
    download(pdf.output('blob'), fileBase() + '.pdf');
  }
  async function toTexte() { if (!needEls()) return; const c = await toCanvas(2); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); await save(); await Studio.openIn('texte', [new File([blob], fileBase() + '.png', { type: 'image/png' })]); }
  function saveFile() { download(new Blob([JSON.stringify({ app: 'schema-joe', version: 1, ...doc })], { type: 'application/json' }), fileBase() + '.joeschema'); }
  async function openFiles(files) {
    files = files || (await pickFiles('.joeschema,.json,image/*', true)); if (!files.length) return;
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    for (const f of files.filter((x) => !x.type.startsWith('image/'))) {
      try { const d = JSON.parse(await f.text()); if (d.app !== 'schema-joe' || !Array.isArray(d.els)) throw new Error('fichier non reconnu'); delete d.app; await save(); loadDoc({ ...d, id: uid(), title: d.title || baseName(f.name) }, true); toast('Schéma ouvert'); }
      catch (e) { toast(`${f.name} : ${e.message}`, 6000); }
    }
    if (imgs.length) addImage(imgs);
  }
  async function newDialog() {
    const v = await modal({ title: 'Nouveau schéma', wide: true, body: `<div class="tpl">
      <button data-v="blank"><span>⬜</span>Schéma vide</button><button data-v="org"><span>🏛</span>Organigramme</button><button data-v="mind"><span>🧠</span>Carte mentale</button>
      <button data-v="flow"><span>🔀</span>Logigramme (procédure)</button><button data-v="board"><span>✏️</span>Tableau blanc</button></div>`,
    onOpen: (b) => b.querySelectorAll('[data-v]').forEach((x) => { x.onclick = () => { b.dataset.pick = x.dataset.v; b.closest('.modal').querySelector('footer .primary').click(); }; }),
    buttons: [{ label: 'Annuler', value: null }, { label: 'Créer', primary: true, value: (b) => b.dataset.pick || 'blank' }] });
    if (!v) return;
    await save();
    const titles = { blank: 'Schéma', org: 'Organigramme', mind: 'Carte mentale', flow: 'Logigramme', board: 'Tableau blanc' };
    loadDoc(newDoc(titles[v]), false); fitView();
    if (v === 'org') buildOrg(parseOutline(EX_ORG), { x: 0, y: 0 });
    if (v === 'mind') buildMind(parseOutline(EX_MIND), { x: 0, y: 0 });
    if (v === 'flow') buildFlow(EX_FLOW, { x: 0, y: 0 });
    if (v === 'board') { doc.snap = false; applyView(); setTool('pen'); }
    if (v !== 'board') setTool('select');
    if (v === 'org' || v === 'mind' || v === 'flow') { sel = new Set(); render(); props(); hint('Exemple modifiable : touchez deux fois un élément pour changer son texte, Tab pour ajouter un élément', 6000); }
    undoStack.length = 0;
  }
  async function library() {
    await save();
    const docs = (await idb.all('docs')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const thumb = (d) => { try { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(exportSVG(d, { pad: 10 }).svg); } catch (e) { return ''; } };
    const body = document.createElement('div');
    body.innerHTML = `<div class="lib">${docs.map((d) => `<div class="it" data-id="${d.id}"><img src="${thumb(d)}" alt=""><b>${esc(d.title)}</b><small>${new Date(d.updated || Date.now()).toLocaleDateString('fr-FR')}<span><button data-a="dup" title="Dupliquer">⧉</button><button data-a="del" title="Supprimer">🗑</button></span></small></div>`).join('') || '<p class="hint">Aucun schéma enregistré.</p>'}</div>`;
    let pick = null;
    const p = modal({ title: 'Mes schémas', wide: true, body, buttons: [{ label: 'Fermer', value: null }, { label: '＋ Nouveau', primary: true, value: 'new' }] });
    body.addEventListener('click', async (e) => {
      const it = e.target.closest('.it'); if (!it) return; const d = docs.find((x) => x.id === it.dataset.id); const a = e.target.closest('[data-a]');
      if (a && a.dataset.a === 'del') { if (!(await confirmBox(`Supprimer « ${esc(d.title)} » ?`, 'Supprimer'))) return; await idb.del('docs', d.id); it.remove(); if (d.id === doc.id) loadDoc(newDoc(), false); return; }
      if (a && a.dataset.a === 'dup') { const c = { ...clone(d), id: uid(), title: d.title + ' (copie)', updated: Date.now() }; await idb.set('docs', c.id, c); pick = c; }
      else pick = d;
      document.querySelector('.modal-back footer button').click();
    });
    const r = await p;
    if (pick) { loadDoc(clone(pick), true); }
    else if (r === 'new') newDialog();
  }
  async function rename() { const n = await modal({ title: 'Nom du schéma', body: `<input type="text" id="dn" value="${esc(doc.title)}">`, onOpen: (b) => b.querySelector('#dn').select(), buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => b.querySelector('#dn').value.trim() }] }); if (n) { doc.title = n; dirty(); render(); } }

  /* ================= Actions et clavier ================= */
  const actions = {
    new: newDialog, library, open: () => openFiles(), save: saveFile, png: exportPNG, svg: exportSVGFile, pdf: exportPDF, toTexte, rename,
    undo, redo, copy, paste: () => paste(), duplicate: () => { copy(); paste(); }, del, selectAll: () => { sel = new Set(doc.els.map((e) => e.id)); render(); props(); },
    clearInk: async () => { if (!doc.els.some((e) => e.t === 'ink')) return toast('Aucun dessin à main levée'); if (await confirmBox('Effacer tous les traits à main levée ?', 'Effacer')) mutate(() => { doc.els = doc.els.filter((e) => e.t !== 'ink'); }); },
    genOrg: () => genDialog('org'), genMind: () => genDialog('mind'), genFlow: () => genDialog('flow'),
    child: () => addRelated(false), sibling: () => addRelated(true), image: () => addImage(), moreShapes,
    layoutOrg: () => relayout('org'), layoutMind: () => relayout('mind'), layoutRight: () => relayout('right'),
    alignL: () => align('alignL'), alignC: () => align('alignC'), alignR: () => align('alignR'), alignT: () => align('alignT'), alignM: () => align('alignM'), alignB: () => align('alignB'), distH: () => align('distH'), distV: () => align('distV'), sameSize: () => align('sameSize'),
    front: () => order(true), back: () => order(false),
    snap: () => { doc.snap = !doc.snap; applyView(); dirty(); toast(doc.snap ? 'Grille magnétique activée' : 'Grille magnétique désactivée'); },
    zoomIn: () => zoomAt(doc.view.k * 1.25), zoomOut: () => zoomAt(doc.view.k / 1.25), fit: fitView,
    edit: () => { const e = selEls()[0]; if (e) editText(e); },
    reverse: () => mutate(() => selEls().filter((e) => e.t === 'link').forEach((l) => { [l.a, l.b] = [l.b, l.a]; })),
  };
  function act(n) { const f = actions[n]; if (!f) return console.warn('action inconnue', n); try { const r = f(); if (r && r.catch) r.catch((e) => { console.error(e); toast('Erreur : ' + e.message, 7000); }); } catch (e) { console.error(e); toast('Erreur : ' + e.message, 7000); } }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); act(b.dataset.act); } });
  initMenus();
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back') || e.target.matches('input,textarea,select')) return;
    const ctrl = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
    if (ctrl) {
      const m = { z: 'undo', y: 'redo', c: 'copy', v: 'paste', d: 'duplicate', a: 'selectAll', s: 'save' }[k];
      if (k === 'z' && e.shiftKey) { e.preventDefault(); act('redo'); return; }
      if (m) { e.preventDefault(); act(m); } else if (k === '=' || k === '+') { e.preventDefault(); act('zoomIn'); } else if (k === '-') { e.preventDefault(); act('zoomOut'); } else if (k === '0') { e.preventDefault(); act('fit'); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); return; }
    if (e.key === 'Escape') { sel = new Set(); setTool('select'); render(); props(); return; }
    if (e.key === 'Tab') { e.preventDefault(); addRelated(false); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); if (e.key === 'Enter' && selShape() && parentLink(selShape().id)) addRelated(true); else { const s = selEls()[0]; if (s) editText(s); } return; }
    if (e.key === ' ') { e.preventDefault(); if (!spaceDown) { spaceDown = true; svg.classList.add('pan'); } return; }
    if (e.key.startsWith('Arrow') && sel.size) {
      e.preventDefault(); const d = e.shiftKey ? 10 : 1; const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      mutate(() => selEls().forEach((el) => { if (el.t === 'shape') { el.x += dx; el.y += dy; } if (el.t === 'ink') el.pts = el.pts.map((p) => [p[0] + dx, p[1] + dy]); }));
      return;
    }
    const tl = { v: 'select', h: 'hand', r: 'shape:round', o: 'shape:ellipse', d: 'shape:diamond', t: 'shape:text', n: 'shape:note', l: 'link', p: 'pen', e: 'eraser' }[k];
    if (tl && !e.altKey) setTool(tl);
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; svg.classList.toggle('pan', tool === 'hand'); } });
  document.addEventListener('paste', (e) => {
    if (e.target.matches('input,textarea') || document.querySelector('.modal-back')) return;
    const fs = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => f.type.startsWith('image/'));
    if (fs.length) { e.preventDefault(); addImage(fs); }
  });
  Studio.onDropFiles(work, (fs) => openFiles(fs));
  addEventListener('resize', () => { renderUI(); placeEditor(); });

  /* ================= API (tests, Mes fichiers) et démarrage ================= */
  window.SchemaJoe = { get doc() { return doc; }, set doc(v) { doc = v; }, get sel() { return sel; }, set sel(v) { sel = v; render(); props(); }, act, actions, render, loadDoc, newDoc, makeShape, makeLink, mutate, layoutTree, buildOrg, buildMind, buildFlow, parseOutline, exportSVG, toCanvas, editText, commitEdit, addRelated, setTool, linkGeom, idb, save, fitView, get tool() { return tool; } };
  Studio.onImport('schema', (fs) => openFiles(fs));
  document.addEventListener('DOMContentLoaded', async () => {
    setTool('select');
    let d = null; try { const id = await idb.get('kv', 'current'); d = id && (await idb.get('docs', id)); } catch (e) { console.warn(e); }
    const want = /[#&]doc=([\w-]+)/.exec(location.hash); if (want) { try { d = (await idb.get('docs', want[1])) || d; } catch (e) { /* ignoré */ } history.replaceState(null, '', location.pathname); }
    if (d) { loadDoc(d, false); isDirty = false; clearTimeout(saveT); } else { render(); fitView(); }
    if (!d || !d.els.length) setTimeout(() => hint('Choisissez une forme à gauche, ou Insertion → Organigramme / Carte mentale', 6000), 400);
  });
})();
