/* Studio Joe — Tableur Joe : grille, saisie, sélection, clavier, presse-papiers, mise en forme, feuilles.
   Le classeur est gardé en mémoire (cellules dans des Map indexées par r × 16384 + c) et sauvegardé
   automatiquement sur l'appareil. Les fonctions de fichiers, graphiques et dialogues sont dans sheet-extra.js. */
(function () {
  const { $, $$, toast, initMenus, modal, confirmBox, store } = Studio;
  const F = Studio.formula;
  const MAXC = F.MAXC, MAXR = F.MAXR;
  const K = (r, c) => r * MAXC + c, KR = (k) => Math.floor(k / MAXC), KC = (k) => k % MAXC;
  const DEF_W = 96, DEF_H = 22, HW = 46, HH = 22, DEF_FS = 11;
  const FONT = 'Calibri, Carlito, "Segoe UI", Roboto, Arial, sans-serif';
  const GREEN = '#1f7a46';

  /* ================= Modèle ================= */
  function newSheet(name) { return { name, cells: new Map(), colW: {}, rowH: {}, merges: [], freeze: { r: 0, c: 0 }, hiddenRows: {}, cf: [], charts: [], filter: null, maxR: 0, maxC: 0 }; }
  let wb = { name: 'Classeur', sheets: [newSheet('Feuil1')], active: 0 };
  const sh = () => wb.sheets[wb.active];
  let sel = { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 };
  let zoom = 1, dirtyFlag = false;

  const getCell = (s, r, c) => wb.sheets[s].cells.get(K(r, c));
  const cur = (r, c) => sh().cells.get(K(r, c));
  function bump(S, r, c) { if (r + 1 > S.maxR) S.maxR = r + 1; if (c + 1 > S.maxC) S.maxC = c + 1; }
  function cleanCell(cell) {
    if (!cell) return null;
    const out = {};
    if (cell.f != null && cell.f !== '') out.f = cell.f; else if (cell.v !== null && cell.v !== undefined && cell.v !== '') out.v = cell.v;
    if (cell.s) { const s = {}; for (const [k, v] of Object.entries(cell.s)) if (v !== undefined && v !== null && v !== false && v !== '') s[k] = v; if (Object.keys(s).length) out.s = s; }
    return out.f === undefined && out.v === undefined && !out.s ? null : out;
  }
  function setCellIn(s, r, c, cell) {
    const S = wb.sheets[s], k = K(r, c);
    recordCell(s, k, S.cells.get(k));
    const cl = cleanCell(cell);
    if (cl) { S.cells.set(k, cl); bump(S, r, c); } else S.cells.delete(k);
    dirtyFlag = true;
  }
  const setCell = (r, c, cell) => setCellIn(wb.active, r, c, cell);

  /* ================= Annuler / rétablir ================= */
  let tx = null; const undoStack = [], redoStack = [];
  function begin(label) { if (tx) { tx.depth++; return; } tx = { label, depth: 1, cells: new Map(), meta: new Map(), wb: null, sel: { ...sel }, active: wb.active }; }
  function recordCell(s, k, old) { if (!tx) return; let m = tx.cells.get(s); if (!m) tx.cells.set(s, (m = new Map())); if (!m.has(k)) m.set(k, old); }
  const META = ['name', 'colW', 'rowH', 'merges', 'freeze', 'hiddenRows', 'cf', 'charts', 'filter'];
  const metaSnap = (S) => structuredClone(Object.fromEntries(META.map((k) => [k, S[k]])));
  function touchMeta(s = wb.active) { if (tx && !tx.wb && !tx.meta.has(s)) tx.meta.set(s, metaSnap(wb.sheets[s])); geomDirty = true; dirtyFlag = true; }
  const cloneSheet = (S) => ({ ...structuredClone(Object.fromEntries(META.map((k) => [k, S[k]]))), cells: new Map(S.cells), maxR: S.maxR, maxC: S.maxC });
  const snapWb = () => ({ sheets: wb.sheets.map(cloneSheet), active: wb.active });
  function touchAll() { if (tx && !tx.wb) tx.wb = snapWb(); geomDirty = true; dirtyFlag = true; }
  function commit() {
    if (!tx) return; if (--tx.depth > 0) return;
    const t = tx; tx = null;
    if (t.cells.size || t.meta.size || t.wb) { undoStack.push(t); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
    afterChange();
  }
  function applyTx(t) {
    const inv = { label: t.label, depth: 0, cells: new Map(), meta: new Map(), wb: null, sel: { ...sel }, active: wb.active };
    if (t.wb) { inv.wb = snapWb(); wb.sheets = t.wb.sheets.map(cloneSheet); }
    for (const [s, m] of t.meta) { if (!wb.sheets[s]) continue; inv.meta.set(s, metaSnap(wb.sheets[s])); Object.assign(wb.sheets[s], structuredClone(m)); }
    for (const [s, m] of t.cells) {
      const S = wb.sheets[s]; if (!S) continue; const im = new Map();
      for (const [k, old] of m) { im.set(k, S.cells.get(k)); if (old) { S.cells.set(k, old); bump(S, KR(k), KC(k)); } else S.cells.delete(k); }
      inv.cells.set(s, im);
    }
    wb.active = Math.min(t.active, wb.sheets.length - 1); sel = { ...t.sel };
    return inv;
  }
  function undo() { cancelEdit(); const t = undoStack.pop(); if (!t) return toast('Rien à annuler'); redoStack.push(applyTx(t)); geomDirty = true; dirtyFlag = true; afterChange(); renderTabs(); }
  function redo() { cancelEdit(); const t = redoStack.pop(); if (!t) return toast('Rien à rétablir'); undoStack.push(applyTx(t)); geomDirty = true; dirtyFlag = true; afterChange(); renderTabs(); }

  /* ================= Calcul ================= */
  const eng = F.createEngine({
    sheetIndex: (n) => wb.sheets.findIndex((s) => s.name.toLowerCase() === String(n).toLowerCase()),
    getCell: (s, r, c) => (wb.sheets[s] ? wb.sheets[s].cells.get(K(r, c)) : undefined),
    used: (s) => ({ rows: wb.sheets[s] ? wb.sheets[s].maxR : 0, cols: wb.sheets[s] ? wb.sheets[s].maxC : 0 }),
    formulas: () => { const out = []; wb.sheets.forEach((S, s) => { const ks = []; for (const [k, cl] of S.cells) if (cl.f != null) ks.push(k); ks.sort((a, b) => a - b).forEach((k) => out.push([s, KR(k), KC(k)])); }); return out; },
  });
  const val = (r, c, s = wb.active) => eng.value(s, r, c);
  function recalc() { try { eng.recalc(); } catch (e) { console.error(e); } }
  let saveTimer = null;
  function afterChange() {
    recalc(); geomDirty = true; render(); updateUI();
    clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 800);
  }

  /* ================= Géométrie ================= */
  class Axis {
    constructor(def) { this.def = def; this.keys = []; this.pre = [0]; this.map = {}; this.hid = {}; }
    build(map, hid) {
      this.map = map || {}; this.hid = hid || {};
      const ks = new Set([...Object.keys(this.map), ...Object.keys(this.hid)].map(Number));
      this.keys = [...ks].sort((a, b) => a - b);
      this.pre = [0]; for (const k of this.keys) this.pre.push(this.pre[this.pre.length - 1] + this.size(k) - this.def);
    }
    size(i) { return this.hid[i] ? 0 : this.map[i] !== undefined ? this.map[i] : this.def; }
    pos(i) { let lo = 0, hi = this.keys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (this.keys[m] < i) lo = m + 1; else hi = m; } return i * this.def + this.pre[lo]; }
    at(p) { if (p <= 0) return 0; let lo = 0, hi = MAXR - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.pos(m) <= p) lo = m; else hi = m - 1; } return lo; }
  }
  const RA = new Axis(DEF_H), CA = new Axis(DEF_W);
  let geomDirty = true, mergeIdx = new Map();
  function geom() {
    if (!geomDirty) return; geomDirty = false;
    const S = sh(); RA.build(S.rowH, S.hiddenRows); CA.build(S.colW, null);
    mergeIdx = new Map();
    S.merges.forEach((m) => { for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) mergeIdx.set(K(r, c), m); });
  }
  const mergeAt = (r, c) => mergeIdx.get(K(r, c));

  /* ================= Rendu ================= */
  const scroller = $('#scroller'), spacer = $('#spacer'), cv = $('#cv'), ctx = cv.getContext('2d');
  const ed = $('#cellEd'), fx = $('#fx'), nameBox = $('#nameBox'), handle = $('#selHandle');
  let TH = {};
  function readTheme() {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    TH = dark
      ? { dark, bg: '#1d2027', grid: '#363b47', text: '#e7e9ef', hdr: '#262b36', hdrText: '#9aa2b5', hdrSel: '#264a36', hdrSelText: '#8fe0b0', sel: '#3fbf7a', selFill: 'rgba(63,191,122,.16)', line: '#4a5162' }
      : { dark, bg: '#ffffff', grid: '#e1e3e8', text: '#111111', hdr: '#f3f4f7', hdrText: '#5d6578', hdrSel: '#d3ecdc', hdrSelText: GREEN, sel: GREEN, selFill: 'rgba(31,122,70,.12)', line: '#c9ccd4' };
    render();
  }
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);

  let rafPending = false, extR = 120, extC = 30;
  function render() { if (!rafPending) { rafPending = true; requestAnimationFrame(draw); } }
  const view = () => ({ vw: scroller.clientWidth / zoom, vh: scroller.clientHeight / zoom, sx: scroller.scrollLeft / zoom, sy: scroller.scrollTop / zoom });
  const FR = () => sh().freeze.r, FC = () => sh().freeze.c;
  // coordonnées écran (non zoomées) d'une ligne / colonne, selon la zone figée
  const Yf = (r, frozen, sy) => HH + RA.pos(r) - (frozen ? 0 : sy);
  const Xf = (c, frozen, sx) => HW + CA.pos(c) - (frozen ? 0 : sx);
  function screenRect(r1, c1, r2, c2) {
    const { sx, sy } = view();
    const fy = r1 < FR(), fx2 = c1 < FC();
    return { x: Xf(c1, fx2, sx), y: Yf(r1, fy, sy), w: CA.pos(c2 + 1) - CA.pos(c1), h: RA.pos(r2 + 1) - RA.pos(r1) };
  }

  function updateExtent() {
    const S = sh(); const { vw, vh, sx, sy } = view();
    extR = Math.max(extR, S.maxR + 60, RA.at(sy + vh) + 40); extC = Math.max(extC, S.maxC + 8, CA.at(sx + vw) + 6);
    extR = Math.min(extR, MAXR); extC = Math.min(extC, MAXC);
    const W = Math.ceil((HW + CA.pos(extC)) * zoom), H = Math.ceil((HH + RA.pos(extR)) * zoom);
    if (spacer.style.width !== W + 'px') spacer.style.width = W + 'px';
    if (spacer.style.height !== H + 'px') spacer.style.height = H + 'px';
  }

  const fontOf = (s) => `${s && s.i ? 'italic ' : ''}${s && s.b ? 'bold ' : ''}${((s && s.fs) || DEF_FS) * 4 / 3}px ${(s && s.ff) || FONT}`;
  let frameCache = null;
  function draw() {
    rafPending = false; geom(); updateExtent();
    const dpr = window.devicePixelRatio || 1;
    const Wp = scroller.clientWidth, Hp = scroller.clientHeight;
    if (cv.width !== Math.round(Wp * dpr) || cv.height !== Math.round(Hp * dpr)) { cv.width = Math.round(Wp * dpr); cv.height = Math.round(Hp * dpr); cv.style.width = Wp + 'px'; cv.style.height = Hp + 'px'; }
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
    const { vw, vh, sx, sy } = view();
    ctx.fillStyle = TH.bg; ctx.fillRect(0, 0, vw, vh);
    frameCache = { cf: new Map() };
    const fr = FR(), fc = FC();
    const fh = RA.pos(fr), fw = CA.pos(fc);
    const rS = Math.max(fr, RA.at(fh + sy)), rE = Math.min(extR - 1, RA.at(sy + vh - HH));
    const cS = Math.max(fc, CA.at(fw + sx)), cE = Math.min(extC - 1, CA.at(sx + vw - HW));
    // zones : défilante, puis figées par-dessus
    drawRegion(rS, rE, cS, cE, false, false, HW + fw, HH + fh, vw, vh);
    if (fc) drawRegion(rS, rE, 0, fc - 1, true, false, HW, HH + fh, HW + fw, vh);
    if (fr) drawRegion(0, fr - 1, cS, cE, false, true, HW + fw, HH, vw, HH + fh);
    if (fr && fc) drawRegion(0, fr - 1, 0, fc - 1, true, true, HW, HH, HW + fw, HH + fh);
    drawHeaders(rS, rE, cS, cE, vw, vh, sx, sy);
    if (fr) { ctx.strokeStyle = TH.dark ? '#8a93a6' : '#9aa0ad'; ctx.lineWidth = 1.5 / zoom; ctx.beginPath(); ctx.moveTo(0, HH + fh); ctx.lineTo(vw, HH + fh); ctx.stroke(); }
    if (fc) { ctx.strokeStyle = TH.dark ? '#8a93a6' : '#9aa0ad'; ctx.lineWidth = 1.5 / zoom; ctx.beginPath(); ctx.moveTo(HW + fw, 0); ctx.lineTo(HW + fw, vh); ctx.stroke(); }
    placeOverlays();
  }

  function drawRegion(r0, r1, c0, c1, fxz, fyz, clipX1, clipY1, clipX2, clipY2) {
    if (r1 < r0 || c1 < c0 || clipX2 <= clipX1 || clipY2 <= clipY1) return;
    const S = sh(); const { sx, sy } = view();
    const X = (c) => Xf(c, fxz, sx), Y = (r) => Yf(r, fyz, sy);
    ctx.save(); ctx.beginPath(); ctx.rect(clipX1, clipY1, clipX2 - clipX1, clipY2 - clipY1); ctx.clip();
    const lw = 1 / zoom;
    // quadrillage
    ctx.strokeStyle = TH.grid; ctx.lineWidth = lw; ctx.beginPath();
    const yTop = Y(r0), yBot = Y(r1 + 1), xL = X(c0), xR = X(c1 + 1);
    for (let c = c0; c <= c1 + 1; c++) { const x = Math.round(X(c) * zoom) / zoom + lw / 2; ctx.moveTo(x, yTop); ctx.lineTo(x, yBot); }
    for (let r = r0; r <= r1 + 1; r++) { if (r <= r1 && RA.size(r) === 0) continue; const y = Math.round(Y(r) * zoom) / zoom + lw / 2; ctx.moveTo(xL, y); ctx.lineTo(xR, y); }
    ctx.stroke();
    const items = [];
    for (let r = r0; r <= r1; r++) {
      const h = RA.size(r); if (!h) continue;
      for (let c = c0; c <= c1; c++) {
        const cell = S.cells.get(K(r, c));
        const cfs = S.cf.length ? cfStyle(r, c) : null;
        if (!cell && !cfs) continue;
        if (mergeIdx.size && mergeAt(r, c)) continue;
        items.push({ r, c, cell, cfs, x: X(c), y: Y(r), w: CA.size(c), h });
      }
    }
    // cellules fusionnées visibles
    S.merges.forEach((m) => {
      if (m.r2 < r0 || m.r1 > r1 || m.c2 < c0 || m.c1 > c1) return;
      const cell = S.cells.get(K(m.r1, m.c1)); const cfs = S.cf.length ? cfStyle(m.r1, m.c1) : null;
      const x = X(m.c1), y = Y(m.r1), w = CA.pos(m.c2 + 1) - CA.pos(m.c1), h = RA.pos(m.r2 + 1) - RA.pos(m.r1);
      ctx.fillStyle = TH.bg; ctx.fillRect(x + lw, y + lw, w - lw, h - lw);
      items.push({ r: m.r1, c: m.c1, cell, cfs, x, y, w, h, merged: true });
    });
    // fonds
    for (const it of items) {
      const bg = (it.cfs && it.cfs.bg) || (it.cell && it.cell.s && it.cell.s.bg);
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(it.x, it.y, it.w + lw, it.h + lw); }
      if (it.cfs && it.cfs.bar) { const b = it.cfs.bar; ctx.fillStyle = b.color; ctx.globalAlpha = 0.55; ctx.fillRect(it.x + 2, it.y + 3, Math.max(0, (it.w - 4) * b.frac), it.h - 6); ctx.globalAlpha = 1; }
    }
    // textes
    for (const it of items) if (it.cell) drawText(it, c1, X, S);
    // bordures
    for (const it of items) if (it.cell && it.cell.s && it.cell.s.bd) drawBorders(it, it.cell.s.bd);
    // boutons de filtre
    if (S.filter && S.filter.r >= r0 && S.filter.r <= r1) {
      for (let c = Math.max(S.filter.c1, c0); c <= Math.min(S.filter.c2, c1); c++) {
        const x = X(c + 1) - 17, y = Y(S.filter.r) + (RA.size(S.filter.r) - 16) / 2; const on = S.filter.crit && S.filter.crit[c];
        ctx.fillStyle = on ? GREEN : TH.hdr; ctx.strokeStyle = TH.line; ctx.lineWidth = lw; ctx.fillRect(x, y, 15, 16); ctx.strokeRect(x, y, 15, 16);
        ctx.fillStyle = on ? '#fff' : TH.hdrText; ctx.beginPath(); ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 11, y + 6); ctx.lineTo(x + 7.5, y + 11); ctx.fill();
      }
    }
    // graphiques (zone défilante seulement)
    if (!fxz && !fyz && Studio.sheetCharts) Studio.sheetCharts.draw(ctx, (x) => HW + x - sx, (y) => HH + y - sy);
    drawSelection(X, Y);
    ctx.restore();
  }

  function drawText(it, cMax, X, S) {
    const cell = it.cell, s = cell.s || {};
    let v = cell.f != null ? val(it.r, it.c) : cell.v;
    if (v === null || v === undefined || v === '') return;
    const fm = F.format(v, s.fmt);
    let text = fm.text; if (!text) return;
    const fs = (s.fs || DEF_FS) * 4 / 3;
    ctx.font = fontOf(s);
    const bgc = (it.cfs && it.cfs.bg) || s.bg;
    const color = (it.cfs && it.cfs.fc) || fm.color || s.fc || (bgc ? (lum(bgc) > 0.45 ? '#111' : '#f2f2f2') : TH.text);
    let align = s.ha || fm.align || (typeof v === 'number' ? 'right' : typeof v === 'boolean' || F.isErr(v) ? 'center' : 'left');
    if (it.cfs && it.cfs.b) ctx.font = 'bold ' + ctx.font;
    const pad = 3, w = it.w, h = it.h;
    let tw = ctx.measureText(text).width;
    let clipW = w;
    if (!s.wrap && tw > w - 2 * pad) {
      if (typeof v === 'number' && !s.wrap) { text = '#'.repeat(Math.max(1, Math.floor((w - 2 * pad) / ctx.measureText('#').width))); tw = ctx.measureText(text).width; }
      else if (align === 'left' && !it.merged) { // débordement sur les cellules vides à droite
        let c = it.c + 1, extra = 0;
        while (c <= cMax + 20 && tw > clipW + extra - 2 * pad) { const n = S.cells.get(K(it.r, c)); if ((n && (n.f != null || (n.v !== undefined && n.v !== null && n.v !== ''))) || mergeAt(it.r, c)) break; extra += CA.size(c); c++; }
        clipW += extra;
      }
    }
    ctx.save(); ctx.beginPath(); ctx.rect(it.x + 1 / zoom, it.y, clipW - 1 / zoom, h); ctx.clip();
    ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
    const lines = s.wrap ? wrapLines(text, w - 2 * pad) : [text];
    const lh = fs * 1.2, total = lines.length * lh;
    const va = s.va || 'bottom';
    let y0 = va === 'top' ? it.y + pad + fs : va === 'middle' ? it.y + (h - total) / 2 + fs * 0.95 : it.y + h - pad - total + fs * 0.95;
    if (lines.length === 1 && va === 'bottom') y0 = it.y + h - Math.max(pad, (h - fs) / 2 > 6 ? pad + 1 : (h - fs) / 2) - fs * 0.22;
    lines.forEach((ln, i) => {
      const lw = ctx.measureText(ln).width; const y = y0 + i * lh;
      const x = align === 'right' ? it.x + w - pad - lw : align === 'center' ? it.x + (w - lw) / 2 : it.x + pad + (s.ind || 0) * 9;
      ctx.fillText(ln, x, y);
      if (s.u || s.st) { ctx.fillRect(x, s.u ? y + 1.5 : y - fs * 0.32, lw, Math.max(1, fs / 14)); }
    });
    ctx.restore();
  }
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  function wrapLines(text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const t = line + word;
        if (ctx.measureText(t).width > maxW && line.trim()) { out.push(line.trimEnd()); line = word.trimStart(); } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  function drawBorders(it, bd) {
    const lw = 1 / zoom;
    const side = (b, x1, y1, x2, y2, nx, ny) => {
      if (!b) return; const w = (b.w || 1) * lw; ctx.strokeStyle = b.c || '#000'; ctx.lineWidth = w; ctx.beginPath();
      if (b.st === 'double') { ctx.lineWidth = lw; ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.moveTo(x1 + nx * 2 * lw, y1 + ny * 2 * lw); ctx.lineTo(x2 + nx * 2 * lw, y2 + ny * 2 * lw); }
      else { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
      ctx.stroke();
    };
    const { x, y, w, h } = it;
    side(bd.t, x, y + lw / 2, x + w + lw, y + lw / 2, 0, 1);
    side(bd.b, x, y + h + lw / 2, x + w + lw, y + h + lw / 2, 0, -1);
    side(bd.l, x + lw / 2, y, x + lw / 2, y + h + lw, 1, 0);
    side(bd.r, x + w + lw / 2, y, x + w + lw / 2, y + h + lw, -1, 0);
  }

  function drawSelection(X, Y) {
    const lw = 1 / zoom;
    // plage copiée (pointillés)
    if (clip && clip.s === wb.active && !clip.done) {
      ctx.save(); ctx.setLineDash([4 * lw, 3 * lw]); ctx.strokeStyle = GREEN; ctx.lineWidth = 2 * lw;
      ctx.strokeRect(X(clip.c1) + lw, Y(clip.r1) + lw, CA.pos(clip.c2 + 1) - CA.pos(clip.c1) - lw, RA.pos(clip.r2 + 1) - RA.pos(clip.r1) - lw); ctx.restore();
    }
    // références de la formule en cours de saisie
    if (editing && refMarks.length) {
      refMarks.forEach((m, i) => {
        const col = REF_COLORS[i % REF_COLORS.length];
        ctx.strokeStyle = col; ctx.lineWidth = 2 * lw; ctx.fillStyle = col + '22';
        const x = X(m.c1), y = Y(m.r1), w = CA.pos(m.c2 + 1) - CA.pos(m.c1), h = RA.pos(m.r2 + 1) - RA.pos(m.r1);
        ctx.fillRect(x, y, w, h); ctx.strokeRect(x + lw, y + lw, w - lw, h - lw);
      });
    }
    const g = selRect(); const S = sh();
    const r2 = Math.min(g.r2, Math.max(extR, S.maxR)), c2 = Math.min(g.c2, Math.max(extC, S.maxC));
    const x = X(g.c1), y = Y(g.r1), w = CA.pos(c2 + 1) - CA.pos(g.c1), h = RA.pos(r2 + 1) - RA.pos(g.r1);
    if (g.r1 !== g.r2 || g.c1 !== g.c2) {
      const m = mergeAt(sel.ar, sel.ac) || { r1: sel.ar, c1: sel.ac, r2: sel.ar, c2: sel.ac };
      const ax = X(m.c1), ay = Y(m.r1), aw = CA.pos(m.c2 + 1) - CA.pos(m.c1), ah = RA.pos(m.r2 + 1) - RA.pos(m.r1);
      // la cellule active reste claire
      ctx.fillStyle = TH.selFill; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.rect(ax, ay, aw, ah); ctx.fill('evenodd');
      ctx.strokeStyle = TH.sel; ctx.lineWidth = lw; ctx.strokeRect(ax + lw, ay + lw, aw - 2 * lw, ah - 2 * lw);
    }
    ctx.strokeStyle = TH.sel; ctx.lineWidth = 2 * lw; ctx.strokeRect(x + lw, y + lw, w - lw, h - lw);
    if (fillPreview) { const f = fillPreview; ctx.save(); ctx.setLineDash([3 * lw, 3 * lw]); ctx.strokeStyle = '#666'; ctx.lineWidth = lw * 1.5; ctx.strokeRect(X(f.c1) + lw, Y(f.r1) + lw, CA.pos(f.c2 + 1) - CA.pos(f.c1) - lw, RA.pos(f.r2 + 1) - RA.pos(f.r1) - lw); ctx.restore(); }
  }
  const REF_COLORS = ['#1f6fd1', '#c0392b', '#7b3fa0', '#1f7a46', '#d9861c', '#0b8a8a'];

  function drawHeaders(rS, rE, cS, cE, vw, vh, sx, sy) {
    const fr = FR(), fc = FC(); const g = selRect(); const lw = 1 / zoom;
    ctx.font = `${12}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    // en-têtes de colonnes
    ctx.fillStyle = TH.hdr; ctx.fillRect(0, 0, vw, HH);
    const fullCol = g.r1 === 0 && g.r2 >= MAXR - 1, fullRow = g.c1 === 0 && g.c2 >= MAXC - 1;
    const cols = []; for (let c = 0; c < fc; c++) cols.push([c, true]); for (let c = cS; c <= cE; c++) cols.push([c, false]);
    ctx.save(); ctx.beginPath(); ctx.rect(HW, 0, vw - HW, HH); ctx.clip();
    for (const [c, frz] of cols) {
      const x = Xf(c, frz, sx), w = CA.size(c); if (!frz && x + w < HW + CA.pos(fc)) continue;
      const on = c >= g.c1 && c <= g.c2;
      if (on) { ctx.fillStyle = fullCol ? TH.sel : TH.hdrSel; ctx.fillRect(x, 0, w, HH); }
      ctx.fillStyle = on ? (fullCol ? '#fff' : TH.hdrSelText) : TH.hdrText; ctx.font = `${on ? 'bold ' : ''}12px ${FONT}`;
      ctx.fillText(F.colName(c), x + w / 2, HH / 2 + 1);
      ctx.strokeStyle = TH.line; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x + w + lw / 2, 0); ctx.lineTo(x + w + lw / 2, HH); ctx.stroke();
      if (on && !fullCol) { ctx.fillStyle = TH.sel; ctx.fillRect(x, HH - 2 * lw, w, 2 * lw); }
    }
    ctx.restore();
    // en-têtes de lignes
    ctx.fillStyle = TH.hdr; ctx.fillRect(0, HH, HW, vh - HH);
    const rows = []; for (let r = 0; r < fr; r++) rows.push([r, true]); for (let r = rS; r <= rE; r++) rows.push([r, false]);
    ctx.save(); ctx.beginPath(); ctx.rect(0, HH, HW, vh - HH); ctx.clip();
    for (const [r, frz] of rows) {
      const h = RA.size(r); if (!h) continue; const y = Yf(r, frz, sy); if (!frz && y + h < HH + RA.pos(fr)) continue;
      const on = r >= g.r1 && r <= g.r2;
      if (on) { ctx.fillStyle = fullRow ? TH.sel : TH.hdrSel; ctx.fillRect(0, y, HW, h); }
      ctx.fillStyle = on ? (fullRow ? '#fff' : TH.hdrSelText) : TH.hdrText; ctx.font = `${on ? 'bold ' : ''}12px ${FONT}`;
      ctx.fillText(String(r + 1), HW / 2, y + h / 2 + 1);
      ctx.strokeStyle = TH.line; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(0, y + h + lw / 2); ctx.lineTo(HW, y + h + lw / 2); ctx.stroke();
      if (on && !fullRow) { ctx.fillStyle = TH.sel; ctx.fillRect(HW - 2 * lw, y, 2 * lw, h); }
      if (sh().hiddenRows[r + 1]) { ctx.fillStyle = GREEN; ctx.fillRect(0, y + h - 2 * lw, HW, 2 * lw); }
    }
    ctx.restore();
    ctx.textAlign = 'left';
    // coin + séparateurs
    ctx.fillStyle = TH.hdr; ctx.fillRect(0, 0, HW, HH);
    ctx.fillStyle = TH.hdrText; ctx.beginPath(); ctx.moveTo(HW - 4, 4); ctx.lineTo(HW - 4, HH - 4); ctx.lineTo(HW - HH + 4, HH - 4); ctx.fill();
    ctx.strokeStyle = TH.line; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(0, HH + lw / 2); ctx.lineTo(vw, HH + lw / 2); ctx.moveTo(HW + lw / 2, 0); ctx.lineTo(HW + lw / 2, vh); ctx.stroke();
  }

  /* ---------- Mise en forme conditionnelle ---------- */
  function cfStyle(r, c) {
    const S = sh(); let out = null;
    for (let i = 0; i < S.cf.length; i++) {
      const rule = S.cf[i], g = rule.range;
      if (r < g.r1 || r > g.r2 || c < g.c1 || c > g.c2) continue;
      const v = val(r, c);
      const res = Studio.sheetCF ? Studio.sheetCF.test(rule, v, i, frameCache) : null;
      if (res) out = { ...(out || {}), ...res };
    }
    return out;
  }

  /* ================= Superpositions (éditeur, poignée) ================= */
  function placeOverlays() {
    const g = selRect();
    const r2 = Math.min(g.r2, extR - 1), c2 = Math.min(g.c2, extC - 1);
    const { sx, sy, vw, vh } = view();
    const x = Xf(c2 + 1, c2 < FC(), sx), y = Yf(r2 + 1, r2 < FR(), sy);
    const visible = x > HW && y > HH && x < vw && y < vh && !editing;
    handle.hidden = !visible;
    if (visible) { handle.style.left = (x * zoom - 5) + 'px'; handle.style.top = (y * zoom - 5) + 'px'; }
    if (editing) positionEditor();
  }
  function positionEditor() {
    const m = mergeAt(editing.r, editing.c) || { r1: editing.r, c1: editing.c, r2: editing.r, c2: editing.c };
    const rc = screenRect(m.r1, m.c1, m.r2, m.c2);
    const s = (cur(editing.r, editing.c) || {}).s || {};
    ed.style.font = `${s.b ? 'bold ' : ''}${s.i ? 'italic ' : ''}${((s.fs || DEF_FS) * 4 / 3) * zoom}px ${FONT}`;
    ed.style.left = Math.max(0, rc.x * zoom - 1) + 'px'; ed.style.top = Math.max(0, rc.y * zoom - 1) + 'px';
    ed.style.minWidth = (rc.w * zoom + 3) + 'px'; ed.style.height = 'auto';
    ed.style.width = Math.min(scroller.clientWidth - rc.x * zoom - 4, Math.max(rc.w * zoom + 3, measureEd() + 24)) + 'px';
    ed.style.height = Math.max(rc.h * zoom + 3, ed.scrollHeight + 2) + 'px';
  }
  let measureCtx = null;
  function measureEd() { measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = ed.style.font; return Math.max(...ed.value.split('\n').map((l) => measureCtx.measureText(l).width)); }

  /* ================= Sélection ================= */
  function selRect() { return { r1: Math.min(sel.r1, sel.r2), r2: Math.max(sel.r1, sel.r2), c1: Math.min(sel.c1, sel.c2), c2: Math.max(sel.c1, sel.c2) }; }
  function expandMerges(g) { // la sélection englobe entièrement les cellules fusionnées touchées
    let changed = true; const S = sh();
    while (changed) { changed = false; for (const m of S.merges) { if (m.r2 < g.r1 || m.r1 > g.r2 || m.c2 < g.c1 || m.c1 > g.c2) continue; if (m.r1 < g.r1) { g.r1 = m.r1; changed = true; } if (m.r2 > g.r2) { g.r2 = m.r2; changed = true; } if (m.c1 < g.c1) { g.c1 = m.c1; changed = true; } if (m.c2 > g.c2) { g.c2 = m.c2; changed = true; } } }
    return g;
  }
  function select(r, c, extend = false) {
    r = Math.max(0, Math.min(MAXR - 1, r)); c = Math.max(0, Math.min(MAXC - 1, c));
    if (extend) {
      const a = { r1: sel.ar, c1: sel.ac, r2: r, c2: c };
      const g = expandMerges({ r1: Math.min(a.r1, a.r2), r2: Math.max(a.r1, a.r2), c1: Math.min(a.c1, a.c2), c2: Math.max(a.c1, a.c2) });
      sel = { ...g, ar: sel.ar, ac: sel.ac };
    } else {
      const m = mergeAt(r, c);
      sel = m ? { r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2, ar: m.r1, ac: m.c1 } : { r1: r, c1: c, r2: r, c2: c, ar: r, ac: c };
    }
    if (clip && clip.done) clip = null;
    updateUI(); render();
  }
  function selectRange(g, ar = g.r1, ac = g.c1) { sel = { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2, ar, ac }; updateUI(); render(); }
  function scrollToCell(r, c) {
    geom(); const { vw, vh, sx, sy } = view();
    if (r >= FR()) { const top = RA.pos(r), bot = RA.pos(r + 1), viewTop = sy + RA.pos(FR()), viewBot = sy + vh - HH; if (top < viewTop) scroller.scrollTop = (top - RA.pos(FR())) * zoom; else if (bot > viewBot) scroller.scrollTop = (bot - (vh - HH)) * zoom + 2; }
    if (c >= FC()) { const l = CA.pos(c), rr = CA.pos(c + 1), viewL = sx + CA.pos(FC()), viewR = sx + vw - HW; if (l < viewL) scroller.scrollLeft = (l - CA.pos(FC())) * zoom; else if (rr > viewR) scroller.scrollLeft = (rr - (vw - HW)) * zoom + 2; }
    render();
  }
  // bord de la zone de données (Ctrl + flèche)
  function edge(r, c, dr, dc) {
    const S = sh(); const has = (rr, cc) => { const x = S.cells.get(K(rr, cc)); return !!x && (x.f != null || (x.v !== undefined && x.v !== null && x.v !== '')); };
    const limR = Math.max(S.maxR, 1) - 1, limC = Math.max(S.maxC, 1) - 1;
    let rr = r, cc = c;
    const step = () => { rr += dr; cc += dc; return rr >= 0 && cc >= 0 && rr < MAXR && cc < MAXC; };
    const nextHas = () => { const a = rr + dr, b = cc + dc; return a >= 0 && b >= 0 && has(a, b); };
    if (has(rr, cc) && nextHas()) { while (nextHas()) step(); return [rr, cc]; }
    while (step()) { if (has(rr, cc)) return [rr, cc]; if ((dr > 0 && rr > limR) || (dc > 0 && cc > limC)) return [dr > 0 ? Math.max(r, limR) : rr - dr, dc > 0 ? Math.max(c, limC) : cc - dc]; }
    return [Math.max(0, rr - dr), Math.max(0, cc - dc)];
  }
  function moveActive(dr, dc, extend, jump) {
    if (extend) {
      // le coin qui bouge est celui opposé à la cellule active
      let r = sel.r1 === sel.ar ? sel.r2 : sel.r1, c = sel.c1 === sel.ac ? sel.c2 : sel.c1;
      if (jump) [r, c] = edge(r, c, dr, dc); else { r += dr; c += dc; while (RA.size(r) === 0 && r > 0 && r < MAXR - 1) r += dr || 1; }
      select(r, c, true); scrollToCell(Math.max(0, r), Math.max(0, c)); return;
    }
    let r = sel.ar, c = sel.ac;
    const m = mergeAt(r, c); if (m) { if (dr > 0) r = m.r2; if (dc > 0) c = m.c2; }
    if (jump) [r, c] = edge(r, c, dr, dc); else { r += dr; c += dc; while (r > 0 && r < MAXR - 1 && RA.size(r) === 0) r += dr || 1; }
    select(r, c); scrollToCell(sel.ar, sel.ac);
  }

  /* ================= Édition ================= */
  let editing = null, refMarks = [], pointRef = null;
  function editText(cell) {
    if (!cell) return '';
    if (cell.f != null) return '=' + F.localize(cell.f);
    const v = cell.v; if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    if (typeof v === 'number') {
      const fmt = (cell.s && cell.s.fmt) || '';
      if (F.isDateFormat(fmt)) { const hasT = /h|s/i.test(fmt.replace(/"[^"]*"/g, '')); const hasD = /[dy]/i.test(fmt.replace(/"[^"]*"/g, '')); return F.format(v, (hasD ? 'dd/mm/yyyy' : '') + (hasD && hasT ? ' ' : '') + (hasT ? 'hh:mm:ss' : '')).text.replace(/:00$/, (m) => (hasD ? '' : m)); }
      if (/%/.test(fmt)) return F.generalNumber(+(v * 100).toPrecision(12)) + '%';
      return F.generalNumber(v);
    }
    const s = String(v);
    return F.parseInput(s).v !== s || s.startsWith('=') ? "'" + s : s;
  }
  function startEdit(initial, mode = 'edit', from = 'cell') {
    if (editing) return;
    const m = mergeAt(sel.ar, sel.ac); const r = m ? m.r1 : sel.ar, c = m ? m.c1 : sel.ac;
    const cell = cur(r, c);
    editing = { r, c, mode, from, orig: editText(cell), s: wb.active };
    const text = initial !== undefined ? initial : editing.orig;
    ed.value = text; fx.value = text;
    ed.hidden = false; positionEditor();
    if (from === 'cell') { ed.focus(); ed.setSelectionRange(text.length, text.length); }
    updateRefMarks(); render(); handle.hidden = true;
  }
  function editorValue() { return editing && editing.from === 'fx' ? fx.value : ed.value; }
  function commitEdit(dr = 0, dc = 0) {
    if (!editing) return true;
    const text = editorValue(); const e0 = editing; const { r, c, s } = e0;
    let parsed;
    try { parsed = F.parseInput(text); if (parsed.f !== undefined) F.parse(parsed.f); }
    catch (e) { toast('Formule incorrecte : ' + e.message, 4500); (editing.from === 'fx' ? fx : ed).focus(); return false; }
    closeEditor();
    if (wb.active !== s) { wb.active = s; geomDirty = true; renderTabs(); }
    const old = cur(r, c) || {};
    const st = { ...(old.s || {}) };
    if (parsed.fmt && (!st.fmt || st.fmt === 'General')) st.fmt = parsed.fmt;
    if (parsed.f !== undefined && !st.fmt) { const g = guessFormulaFormat(parsed.f); if (g) st.fmt = g; }
    if (text.includes('\n') && !st.wrap) st.wrap = true;
    if (text !== e0.orig) { begin('saisie'); setCell(r, c, { v: parsed.v, f: parsed.f, s: st }); recalc(); widenForNumbers({ r1: r, r2: r, c1: c, c2: c }); if (st.wrap || st.fs) growRows({ r1: r, r2: r, c1: c, c2: c }); commit(); }
    else render();
    if (dr || dc) moveActive(dr, dc, false, false); else { updateUI(); render(); }
    scroller.focus({ preventScroll: true });
    return true;
  }
  function closeEditor() { editing = null; refMarks = []; pointRef = null; ed.hidden = true; hideSuggest(); }
  function cancelEdit() { if (!editing) return; closeEditor(); updateUI(); render(); scroller.focus({ preventScroll: true }); }
  // format proposé pour une formule (somme de montants FCFA, date…)
  function guessFormulaFormat(f) {
    if (/^(TODAY|NOW|DATE|EDATE|EOMONTH|WORKDAY)\(/i.test(f)) return /^NOW/i.test(f) ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';
    const t = F.tokenize(f, 'en').find((x) => x.type === 'ref' && !x.ref.sheet);
    if (t) { const c = cur(t.ref.a.r, t.ref.a.c); const fm = c && c.s && c.s.fmt; if (fm && fm !== 'General' && !F.isDateFormat(fm) && !/%/.test(fm)) return fm; }
    return null;
  }
  function updateRefMarks() {
    refMarks = [];
    const text = editorValue();
    if (!editing || text[0] !== '=') return;
    try {
      F.tokenize(text.slice(1), 'fr').forEach((t) => {
        if (t.type !== 'ref') return;
        if (t.ref.sheet && t.ref.sheet.toLowerCase() !== sh().name.toLowerCase()) return;
        const b = t.ref.b || t.ref.a; refMarks.push({ r1: Math.min(t.ref.a.r, b.r), c1: Math.min(t.ref.a.c, b.c), r2: Math.min(Math.max(t.ref.a.r, b.r), extR), c2: Math.min(Math.max(t.ref.a.c, b.c), extC) });
      });
    } catch (e) { /* formule incomplète */ }
  }
  // peut-on insérer une référence à la position du curseur ?
  function canPoint() {
    if (!editing) return false; const el = editing.from === 'fx' ? fx : ed; const t = el.value;
    if (t[0] !== '=') return false; const pos = el.selectionStart;
    if (pointRef && pointRef.end === pos) return true;
    const before = t.slice(0, pos).replace(/\s+$/, '');
    return /[=(;,+\-*/^&<>:]$/.test(before);
  }
  function insertRef(text) {
    const el = editing.from === 'fx' ? fx : ed;
    let st = el.selectionStart, en = el.selectionEnd;
    if (pointRef && pointRef.end === st) st = pointRef.start;
    const sheetPrefix = editing.s !== wb.active ? quoteSheet(sh().name) + '!' : '';
    const ins = sheetPrefix + text;
    el.value = el.value.slice(0, st) + ins + el.value.slice(en);
    pointRef = { start: st, end: st + ins.length };
    el.setSelectionRange(pointRef.end, pointRef.end);
    (el === ed ? fx : ed).value = el.value;
    updateRefMarks(); if (editing.s === wb.active) positionEditor(); render();
  }
  const quoteSheet = (n) => (/^[A-Za-z_À-ÿ][\wÀ-ÿ.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);

  /* ---------- suggestions de fonctions ---------- */
  const sug = document.createElement('div'); sug.className = 'suggest'; sug.hidden = true; document.body.appendChild(sug);
  let sugItems = [], sugIdx = 0;
  function hideSuggest() { sug.hidden = true; sugItems = []; }
  function updateSuggest() {
    const el = editing && (editing.from === 'fx' ? fx : ed); if (!el) return hideSuggest();
    const t = el.value, pos = el.selectionStart;
    if (t[0] !== '=') return hideSuggest();
    const before = t.slice(0, pos);
    const m = /(?:^=|[=(;,+\-*/^&<> ])([A-Za-zÀ-ÿ][\wÀ-ÿ.]*)$/.exec(before);
    let html = '';
    sugItems = [];
    if (m && !/"[^"]*$/.test(before.replace(/"[^"]*"/g, ''))) {
      sugItems = F.suggest(m[1]).map((n) => ({ name: n, start: pos - m[1].length }));
      if (sugItems.length === 1 && sugItems[0].name === m[1].toUpperCase()) sugItems = [];
      sugIdx = Math.min(sugIdx, Math.max(0, sugItems.length - 1));
      html = sugItems.map((it, i) => { const h = F.help(it.name); return `<div data-i="${i}" class="${i === sugIdx ? 'on' : ''}"><b>${it.name}</b>${h ? ` <span class="hint">— ${esc(h.desc)}</span>` : ''}</div>`; }).join('');
    }
    if (!html) { // syntaxe de la fonction en cours
      let depth = 0, fn = null;
      for (let i = before.length - 1; i >= 0; i--) { const ch = before[i]; if (ch === ')') depth++; else if (ch === '(') { if (depth === 0) { const mm = /([A-Za-zÀ-ÿ][\wÀ-ÿ.]*)$/.exec(before.slice(0, i)); fn = mm && mm[1]; break; } depth--; } }
      const h = fn && F.help(fn);
      if (h) { const argN = (before.slice(before.lastIndexOf(fn + '(') + fn.length + 1).replace(/"[^"]*"/g, '').replace(/\([^()]*\)/g, '').match(/;/g) || []).length; const parts = h.args.split('; '); html = `<div class="sig"><b>${h.name}</b>(${parts.map((p, i) => (i === argN ? `<b><u>${esc(p)}</u></b>` : esc(p))).join('; ')})<br><span class="hint">${esc(h.desc)}</span></div>`; }
    }
    if (!html) return hideSuggest();
    sug.innerHTML = html; sug.hidden = false;
    const r = el.getBoundingClientRect();
    sug.style.left = Math.min(r.left, innerWidth - 280) + 'px'; sug.style.top = (r.bottom + 4) + 'px';
  }
  sug.addEventListener('pointerdown', (e) => { e.preventDefault(); const d = e.target.closest('[data-i]'); if (d) acceptSuggest(+d.dataset.i); });
  function acceptSuggest(i = sugIdx) {
    const it = sugItems[i]; if (!it) return false;
    const el = editing.from === 'fx' ? fx : ed; const pos = el.selectionStart;
    let after = el.value.slice(pos); const add = after.startsWith('(') ? '' : '(';
    el.value = el.value.slice(0, it.start) + it.name + add + after;
    const np = it.start + it.name.length + 1; el.setSelectionRange(np, np);
    (el === ed ? fx : ed).value = el.value; hideSuggest(); updateSuggest(); positionEditor(); return true;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function editorKey(e, el) {
    if (!sug.hidden && sugItems.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sugIdx = (sugIdx + 1) % sugItems.length; updateSuggest(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sugIdx = (sugIdx - 1 + sugItems.length) % sugItems.length; updateSuggest(); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.altKey)) { e.preventDefault(); acceptSuggest(); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); if (!sug.hidden) hideSuggest(); else cancelEdit(); return; }
    if (e.key === 'Enter' && (e.altKey || (e.ctrlKey && el === ed))) { e.preventDefault(); const p = el.selectionStart; el.value = el.value.slice(0, p) + '\n' + el.value.slice(el.selectionEnd); el.setSelectionRange(p + 1, p + 1); syncEdit(el); return; }
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.shiftKey ? -1 : 1, 0); return; }
    if (e.key === 'Tab') { e.preventDefault(); commitEdit(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'F2') { e.preventDefault(); editing.mode = editing.mode === 'enter' ? 'edit' : 'enter'; return; }
    if (e.key === 'F4') { e.preventDefault(); toggleAbsolute(el); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key] && editing.mode === 'enter' && el === ed) {
      e.preventDefault();
      const [dr, dc] = arrows[e.key];
      if (canPoint()) { // mode pointage : la flèche choisit une cellule pour la formule
        const p = pointRef && pointRef.cell ? pointRef.cell : { r: editing.r, c: editing.c };
        const r = Math.max(0, p.r + dr), c = Math.max(0, p.c + dc);
        insertRef(F.addr(r, c)); pointRef.cell = { r, c }; scrollToCell(r, c); return;
      }
      commitEdit(dr, dc);
    }
  }
  function toggleAbsolute(el) { // F4 : A1 → $A$1 → A$1 → $A1
    const t = el.value, pos = el.selectionStart;
    const re = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g; let m;
    while ((m = re.exec(t))) {
      if (pos >= m.index && pos <= m.index + m[0].length) {
        const state = (m[1] ? 2 : 0) + (m[3] ? 1 : 0); const next = { 0: 3, 3: 1, 1: 2, 2: 0 }[state];
        const rep = (next & 2 ? '$' : '') + m[2] + (next & 1 ? '$' : '') + m[4];
        el.value = t.slice(0, m.index) + rep + t.slice(m.index + m[0].length);
        el.setSelectionRange(m.index + rep.length, m.index + rep.length); syncEdit(el); return;
      }
    }
  }
  function syncEdit(el) { (el === ed ? fx : ed).value = el.value; pointRef = pointRef && pointRef.end === el.selectionStart ? pointRef : null; updateRefMarks(); if (editing && editing.s === wb.active) positionEditor(); updateSuggest(); render(); }
  ed.addEventListener('input', () => syncEdit(ed));
  ed.addEventListener('keydown', (e) => editorKey(e, ed));
  ed.addEventListener('click', () => { pointRef = null; updateSuggest(); });
  ed.addEventListener('blur', () => setTimeout(() => { if (editing && document.activeElement !== ed && document.activeElement !== fx && editing.from === 'cell' && !pointerDown) commitEdit(); }, 120));
  fx.addEventListener('focus', () => { if (!editing) { startEdit(undefined, 'edit', 'fx'); } else editing.from = 'fx'; });
  fx.addEventListener('input', () => { if (!editing) startEdit(fx.value, 'edit', 'fx'); syncEdit(fx); });
  fx.addEventListener('keydown', (e) => { if (editing) editorKey(e, fx); });
  fx.addEventListener('click', () => { pointRef = null; updateSuggest(); });
  fx.addEventListener('blur', () => setTimeout(() => { if (editing && editing.from === 'fx' && document.activeElement !== fx && document.activeElement !== ed && !pointerDown) commitEdit(); }, 150));

  /* ================= Pointeur ================= */
  let pointerDown = false, drag = null, fillPreview = null, lastTap = { t: 0, r: -1, c: -1 };
  function localXY(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; }
  function hit(x, y) {
    const { sx, sy } = view(); const fr = FR(), fc = FC();
    const c = x < HW ? -1 : (x - HW < CA.pos(fc) ? CA.at(x - HW) : CA.at(x - HW + sx));
    const r = y < HH ? -1 : (y - HH < RA.pos(fr) ? RA.at(y - HH) : RA.at(y - HH + sy));
    return { r, c };
  }
  function colBorderAt(x) { const { sx } = view(); const { c } = hit(x, HH + 1); if (c < 0) return -1; const frz = c < FC(); const xr = Xf(c + 1, frz, sx), xl = Xf(c, frz, sx); if (Math.abs(x - xr) < 5) return c; if (Math.abs(x - xl) < 5 && c > 0) return c - 1; return -1; }
  function rowBorderAt(y) { const { sy } = view(); const { r } = hit(HW + 1, y); if (r < 0) return -1; const frz = r < FR(); const yb = Yf(r + 1, frz, sy), yt = Yf(r, frz, sy); if (Math.abs(y - yb) < 4) return r; if (Math.abs(y - yt) < 4 && r > 0) return r - 1; return -1; }

  cv.addEventListener('pointerdown', (e) => {
    hideCtx();
    const { x, y } = localXY(e); const touch = e.pointerType === 'touch';
    pointerDown = true;
    if (touch) { drag = { type: 'tap', x0: e.clientX, y0: e.clientY, x, y }; return; }
    if (e.button !== 0) { pointerDown = false; const h = hit(x, y); if (h.r >= 0 && h.c >= 0) { const g = selRect(); if (!(h.r >= g.r1 && h.r <= g.r2 && h.c >= g.c1 && h.c <= g.c2)) select(h.r, h.c); } return; }
    // graphique ?
    if (Studio.sheetCharts && y > HH && x > HW) { const res = Studio.sheetCharts.pointerDown(x, y, e); if (res) { pointerDown = false; return; } }
    const h = hit(x, y);
    // redimensionnement
    if (y < HH && x > HW) { const cb = colBorderAt(x); if (cb >= 0) { if (e.detail === 2) { autofitCols(cb, cb); pointerDown = false; return; } drag = { type: 'colw', c: cb, x0: x, w0: CA.size(cb) }; cv.setPointerCapture(e.pointerId); return; } }
    if (x < HW && y > HH) { const rb = rowBorderAt(y); if (rb >= 0) { drag = { type: 'rowh', r: rb, y0: y, h0: RA.size(rb) }; cv.setPointerCapture(e.pointerId); return; } }
    if (editing && canPoint() && h.r >= 0 && h.c >= 0) { e.preventDefault(); insertRef(F.addr(h.r, h.c)); pointRef.cell = { r: h.r, c: h.c }; drag = { type: 'point', r0: h.r, c0: h.c }; cv.setPointerCapture(e.pointerId); return; }
    if (editing && !commitEdit()) { pointerDown = false; return; }
    if (y < HH && x < HW) { selectRange({ r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }); pointerDown = false; return; }
    if (y < HH) { if (e.shiftKey) selectRange({ r1: 0, r2: MAXR - 1, c1: Math.min(sel.ac, h.c), c2: Math.max(sel.ac, h.c) }, 0, sel.ac); else selectRange({ r1: 0, r2: MAXR - 1, c1: h.c, c2: h.c }, Math.max(0, FR()), h.c); drag = { type: 'cols', c0: e.shiftKey ? sel.ac : h.c }; cv.setPointerCapture(e.pointerId); return; }
    if (x < HW) { if (e.shiftKey) selectRange({ c1: 0, c2: MAXC - 1, r1: Math.min(sel.ar, h.r), r2: Math.max(sel.ar, h.r) }, sel.ar, 0); else selectRange({ c1: 0, c2: MAXC - 1, r1: h.r, r2: h.r }, h.r, 0); drag = { type: 'rows', r0: e.shiftKey ? sel.ar : h.r }; cv.setPointerCapture(e.pointerId); return; }
    // bouton de filtre
    const S = sh();
    if (S.filter && h.r === S.filter.r && h.c >= S.filter.c1 && h.c <= S.filter.c2) { const { sx } = view(); const xr = Xf(h.c + 1, h.c < FC(), sx); if (x > xr - 18) { pointerDown = false; Studio.sheetExtra && Studio.sheetExtra.filterMenu(h.c); return; } }
    if (e.detail === 2 && h.r === sel.ar && h.c === sel.ac) { startEdit(undefined, 'edit'); pointerDown = false; return; }
    select(h.r, h.c, e.shiftKey);
    drag = { type: 'sel' }; cv.setPointerCapture(e.pointerId);
    scroller.focus({ preventScroll: true });
  });
  cv.addEventListener('pointermove', (e) => {
    const { x, y } = localXY(e);
    if (!drag) {
      if (e.pointerType === 'mouse') { let cur = ''; if (y < HH && x > HW && colBorderAt(x) >= 0) cur = 'col-resize'; else if (x < HW && y > HH && rowBorderAt(y) >= 0) cur = 'row-resize'; else if (Studio.sheetCharts) cur = Studio.sheetCharts.cursor(x, y) || ''; cv.style.cursor = cur || (y < HH || x < HW ? 'default' : 'cell'); }
      return;
    }
    if (drag.type === 'tap') { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 10) drag = null; return; }
    autoScroll(x, y);
    const h = hit(Math.max(HW + 1, x), Math.max(HH + 1, y));
    if (drag.type === 'sel') { if (h.r >= 0 && h.c >= 0 && (h.r !== sel.r2 || h.c !== sel.c2)) select(h.r, h.c, true); }
    else if (drag.type === 'point') { const g = { r1: Math.min(drag.r0, h.r), r2: Math.max(drag.r0, h.r), c1: Math.min(drag.c0, h.c), c2: Math.max(drag.c0, h.c) }; insertRef(F.rangeName(g)); }
    else if (drag.type === 'cols') selectRange({ r1: 0, r2: MAXR - 1, c1: Math.min(drag.c0, h.c), c2: Math.max(drag.c0, h.c) }, sel.ar, drag.c0);
    else if (drag.type === 'rows') selectRange({ c1: 0, c2: MAXC - 1, r1: Math.min(drag.r0, h.r), r2: Math.max(drag.r0, h.r) }, drag.r0, sel.ac);
    else if (drag.type === 'colw') { const w = Math.max(4, Math.round(drag.w0 + x - drag.x0)); sh().colW[drag.c] = w; geomDirty = true; render(); }
    else if (drag.type === 'rowh') { const hh = Math.max(4, Math.round(drag.h0 + y - drag.y0)); sh().rowH[drag.r] = hh; geomDirty = true; render(); }
  });
  function endPointer(e, cancel) {
    pointerDown = false;
    const d = drag; drag = null; stopAutoScroll();
    if (!d) return;
    if (d.type === 'tap' && !cancel) {
      const h = hit(d.x, d.y);
      if (Studio.sheetCharts && Studio.sheetCharts.pointerDown(d.x, d.y, e, true)) return;
      if (editing && canPoint() && h.r >= 0 && h.c >= 0) { insertRef(F.addr(h.r, h.c)); return; }
      if (editing && !commitEdit()) return;
      if (h.r < 0 && h.c < 0) selectRange({ r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 });
      else if (h.r < 0) selectRange({ r1: 0, r2: MAXR - 1, c1: h.c, c2: h.c }, 0, h.c);
      else if (h.c < 0) selectRange({ c1: 0, c2: MAXC - 1, r1: h.r, r2: h.r }, h.r, 0);
      else {
        const S = sh();
        if (S.filter && h.r === S.filter.r && h.c >= S.filter.c1 && h.c <= S.filter.c2) { const { sx } = view(); if (d.x > Xf(h.c + 1, h.c < FC(), sx) - 22) { Studio.sheetExtra && Studio.sheetExtra.filterMenu(h.c); return; } }
        const now = Date.now();
        const same = h.r === sel.ar && h.c === sel.ac && sel.r1 === sel.r2 && sel.c1 === sel.c2;
        if (same && now - lastTap.t < 3000) startEdit(undefined, 'edit'); else select(h.r, h.c);
        lastTap = { t: now, r: h.r, c: h.c };
      }
      return;
    }
    if (d.type === 'colw' || d.type === 'rowh') {
      const S = sh(); const key = d.type === 'colw' ? 'colW' : 'rowH', idx = d.type === 'colw' ? d.c : d.r, now = S[key][idx];
      // applique à toutes les colonnes / lignes sélectionnées
      S[key][idx] = d.type === 'colw' ? d.w0 : d.h0;
      begin('taille'); touchMeta();
      const g = selRect(); const multi = d.type === 'colw' ? g.r1 === 0 && g.r2 >= MAXR - 1 && idx >= g.c1 && idx <= g.c2 : g.c1 === 0 && g.c2 >= MAXC - 1 && idx >= g.r1 && idx <= g.r2;
      if (multi) { const [a, b] = d.type === 'colw' ? [g.c1, g.c2] : [g.r1, g.r2]; for (let i = a; i <= b; i++) S[key][i] = now; } else S[key][idx] = now;
      commit();
    }
    if (d.type === 'sel') updateUI();
  }
  cv.addEventListener('pointerup', (e) => endPointer(e, false));
  cv.addEventListener('pointercancel', (e) => endPointer(e, true));
  cv.addEventListener('dblclick', (e) => { const { x, y } = localXY(e); if (Studio.sheetCharts && Studio.sheetCharts.dblclick(x, y)) return; });
  let asTimer = null, asDelta = [0, 0];
  function autoScroll(x, y) {
    const { vw, vh } = view();
    asDelta = [x > vw - 10 ? 30 : x < HW ? -30 : 0, y > vh - 10 ? 30 : y < HH ? -30 : 0];
    if ((asDelta[0] || asDelta[1]) && !asTimer) asTimer = setInterval(() => { scroller.scrollLeft += asDelta[0]; scroller.scrollTop += asDelta[1]; }, 50);
    if (!asDelta[0] && !asDelta[1]) stopAutoScroll();
  }
  function stopAutoScroll() { clearInterval(asTimer); asTimer = null; }

  /* poignée : recopie à la souris, extension de la sélection au doigt */
  let hDrag = null;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId);
    hDrag = { mode: e.pointerType === 'touch' ? 'extend' : 'fill', src: selRect(), ctrl: e.ctrlKey || e.altKey };
  });
  handle.addEventListener('pointermove', (e) => {
    if (!hDrag) return; const { x, y } = localXY(e); autoScroll(x, y);
    const h = hit(Math.max(HW + 1, x), Math.max(HH + 1, y)); if (h.r < 0 || h.c < 0) return;
    if (hDrag.mode === 'extend') { select(h.r, h.c, true); return; }
    const s = hDrag.src; let g;
    const dr = h.r > s.r2 ? h.r - s.r2 : h.r < s.r1 ? h.r - s.r1 : 0, dc = h.c > s.c2 ? h.c - s.c2 : h.c < s.c1 ? h.c - s.c1 : 0;
    if (Math.abs(dr) >= Math.abs(dc) && dr) g = dr > 0 ? { r1: s.r1, r2: h.r, c1: s.c1, c2: s.c2 } : { r1: h.r, r2: s.r2, c1: s.c1, c2: s.c2 };
    else if (dc) g = dc > 0 ? { r1: s.r1, r2: s.r2, c1: s.c1, c2: h.c } : { r1: s.r1, r2: s.r2, c1: h.c, c2: s.c2 };
    fillPreview = g || null; render();
  });
  const endHandle = () => {
    stopAutoScroll(); const d = hDrag; hDrag = null; if (!d) return;
    if (d.mode === 'fill' && fillPreview) { const g = fillPreview; fillPreview = null; fillRange(d.src, g, d.ctrl); selectRange(g, sel.ar, sel.ac); }
    fillPreview = null; render();
  };
  handle.addEventListener('pointerup', endHandle); handle.addEventListener('pointercancel', endHandle);
  handle.addEventListener('dblclick', () => { // double-clic : recopie jusqu'au bas des données voisines
    const s = selRect(); const S = sh(); let r = s.r2;
    const col = s.c1 > 0 ? s.c1 - 1 : s.c2 + 1; const has = (rr, cc) => { const x = S.cells.get(K(rr, cc)); return x && (x.f != null || x.v != null); };
    while (r + 1 < S.maxR && has(r + 1, col)) r++;
    if (r > s.r2) { const g = { ...s, r2: r }; fillRange(s, g, false); selectRange(g, sel.ar, sel.ac); }
  });

  scroller.addEventListener('scroll', () => { render(); if (!sug.hidden) updateSuggest(); });
  scroller.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
  new ResizeObserver(() => render()).observe(scroller);

  /* ================= Recopie et séries ================= */
  const LISTS = [
    ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
    ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
    ['t1', 't2', 't3', 't4'], ['trimestre 1', 'trimestre 2', 'trimestre 3', 'trimestre 4'],
  ];
  function caseLike(src, word) { return src === src.toUpperCase() ? word.toUpperCase() : src[0] === src[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word; }
  /* recopie de src vers dst (dst contient src, dans une seule direction) */
  function fillRange(src, dst, increment = false) {
    const S = sh();
    const vertical = dst.r1 !== src.r1 || dst.r2 !== src.r2;
    begin('recopie');
    const lines = vertical ? [src.c1, src.c2] : [src.r1, src.r2];
    for (let L = lines[0]; L <= lines[1]; L++) {
      const n = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
      const srcPos = (i) => (vertical ? [src.r1 + i, L] : [L, src.c1 + i]);
      const cells = Array.from({ length: n }, (_, i) => { const [r, c] = srcPos(i); return S.cells.get(K(r, c)); });
      const vals = cells.map((cl) => (cl && cl.f == null ? cl.v : undefined));
      // tendance numérique
      let step = null;
      const allNum = vals.every((v) => typeof v === 'number');
      if (allNum && n >= 2) step = (vals[n - 1] - vals[0]) / (n - 1);
      else if (allNum && n === 1 && (increment || (cells[0].s && F.isDateFormat(cells[0].s.fmt)))) step = 1;
      const targets = [];
      if (vertical) { if (dst.r2 > src.r2) for (let r = src.r2 + 1; r <= dst.r2; r++) targets.push([r, L, r - src.r2, 1]); else for (let r = src.r1 - 1; r >= dst.r1; r--) targets.push([r, L, src.r1 - r, -1]); }
      else { if (dst.c2 > src.c2) for (let c = src.c2 + 1; c <= dst.c2; c++) targets.push([L, c, c - src.c2, 1]); else for (let c = src.c1 - 1; c >= dst.c1; c--) targets.push([L, c, src.c1 - c, -1]); }
      for (const [r, c, k, dir] of targets) {
        const idx = dir > 0 ? (k - 1) % n : n - 1 - ((k - 1) % n);
        const scell = cells[idx]; const [sr, sc] = srcPos(idx);
        if (!scell) { setCell(r, c, null); continue; }
        const out = { s: scell.s };
        if (scell.f != null) out.f = F.shiftFormula(scell.f, r - sr, c - sc);
        else if (step !== null) out.v = dir > 0 ? vals[n - 1] + step * k : vals[0] - step * k;
        else if (typeof scell.v === 'string') {
          const v = scell.v; const lo = v.toLowerCase(); const list = LISTS.find((l) => l.includes(lo.replace(/\.$/, '')));
          const m = /^(.*?)(\d+)(\D*)$/.exec(v);
          if (list) { const i0 = list.indexOf(lo.replace(/\.$/, '')); const lastIdx = list.indexOf(String(vals[dir > 0 ? n - 1 : 0]).toLowerCase().replace(/\.$/, '')); const base = n === 1 || lastIdx < 0 ? i0 : lastIdx; out.v = caseLike(v, list[((base + dir * (n === 1 ? k : k)) % list.length + list.length) % list.length]); if (n > 1 && lastIdx >= 0) out.v = caseLike(v, list[((lastIdx + dir * k) % list.length + list.length) % list.length]); }
          else if (m && (n === 1 || vals.every((x) => typeof x === 'string' && /\d+\D*$/.test(x)))) { const lastV = String(vals[dir > 0 ? n - 1 : 0]); const mm = /^(.*?)(\d+)(\D*)$/.exec(lastV) || m; const num = +mm[2] + dir * k; out.v = mm[1] + String(Math.max(0, num)).padStart(mm[2].length, '0') + mm[3]; }
          else out.v = v;
        } else out.v = scell.v;
        setCell(r, c, out);
      }
    }
    commit();
  }
  function fillDown() { const g = selRect(); const src = g.r1 === g.r2 ? { ...g, r1: Math.max(0, g.r1 - 1), r2: Math.max(0, g.r1 - 1) } : { ...g, r2: g.r1 }; if (src.r1 === g.r1 && g.r1 === g.r2) return; copyBlock(src, g); }
  function fillRight() { const g = selRect(); const src = g.c1 === g.c2 ? { ...g, c1: Math.max(0, g.c1 - 1), c2: Math.max(0, g.c1 - 1) } : { ...g, c2: g.c1 }; if (src.c1 === g.c1 && g.c1 === g.c2) return; copyBlock(src, g); }
  function copyBlock(src, dst) { // copie (formules décalées) en répétant src sur dst
    const S = sh(); begin('recopie');
    const H = src.r2 - src.r1 + 1, W = src.c2 - src.c1 + 1;
    const g = boundSel(dst);
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      if (r >= src.r1 && r <= src.r2 && c >= src.c1 && c <= src.c2) continue;
      const sr = src.r1 + ((r - src.r1) % H + H) % H, sc = src.c1 + ((c - src.c1) % W + W) % W;
      const cl = S.cells.get(K(sr, sc));
      setCell(r, c, cl ? { ...cl, f: cl.f != null ? F.shiftFormula(cl.f, r - sr, c - sc) : undefined } : null);
    }
    commit();
  }
  // limite une sélection de lignes/colonnes entières à la zone utilisée
  function boundSel(g) { const S = sh(); return { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(S.maxR - 1, g.r1)), c2: Math.min(g.c2, Math.max(S.maxC - 1, g.c1)) }; }

  /* ================= Presse-papiers ================= */
  let clip = null;
  function selectionTSV(g, values) {
    const S = sh(); const rows = [];
    for (let r = g.r1; r <= g.r2; r++) {
      if (RA.size(r) === 0) continue;
      const row = []; for (let c = g.c1; c <= g.c2; c++) { const cl = S.cells.get(K(r, c)); if (!cl) { row.push(''); continue; } const v = val(r, c); let t = F.format(v, cl.s && cl.s.fmt).text; if (values === 'raw' && typeof v === 'number' && !F.isDateFormat(cl.s && cl.s.fmt)) t = F.generalNumber(v); row.push(/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t); }
      rows.push(row.join('\t'));
    }
    return rows.join('\n').replace(/ /g, ' ');
  }
  function selectionHTML(g) {
    const S = sh(); let h = '<table>';
    for (let r = g.r1; r <= g.r2; r++) { if (RA.size(r) === 0) continue; h += '<tr>'; for (let c = g.c1; c <= g.c2; c++) { const cl = S.cells.get(K(r, c)); const s = (cl && cl.s) || {}; const t = cl ? F.format(val(r, c), s.fmt).text : ''; const st = [s.b && 'font-weight:bold', s.i && 'font-style:italic', s.fc && 'color:' + s.fc, s.bg && 'background:' + s.bg, s.ha && 'text-align:' + s.ha].filter(Boolean).join(';'); h += `<td${st ? ` style="${st}"` : ''}>${esc(t)}</td>`; } h += '</tr>'; }
    return h + '</table>';
  }
  function doCopy(cut = false) {
    const g = boundSel(selRect()); const S = sh();
    const cells = []; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const cl = S.cells.get(K(r, c)); if (cl) cells.push([r - g.r1, c - g.c1, cl]); }
    clip = { s: wb.active, ...g, cells, cut, text: selectionTSV(g, 'raw'), done: false };
    render();
    return clip;
  }
  function pasteInternal(cp, mode = 'all') {
    const g = selRect(); const H = cp.r2 - cp.r1 + 1, W = cp.c2 - cp.c1 + 1;
    const tile = ((g.r2 - g.r1 + 1) % H === 0 && (g.c2 - g.c1 + 1) % W === 0 && (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > H * W && g.r2 < MAXR - 1 && g.c2 < MAXC - 1);
    const reps = tile ? [(g.r2 - g.r1 + 1) / H, (g.c2 - g.c1 + 1) / W] : [1, 1];
    begin('coller');
    const srcSheet = wb.sheets[cp.s];
    if (cp.cut && cp.s !== undefined) { for (const [dr, dc] of cp.cells) { srcSheet && setCellIn(cp.s, cp.r1 + dr, cp.c1 + dc, null); } }
    for (let i = 0; i < reps[0]; i++) for (let j = 0; j < reps[1]; j++) {
      const r0 = g.r1 + i * H, c0 = g.c1 + j * W;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const old = cur(r0 + r, c0 + c); if (old && mode === 'all') setCell(r0 + r, c0 + c, null); }
      for (const [dr, dc, cl] of cp.cells) {
        const r = r0 + dr, c = c0 + dc; if (r >= MAXR || c >= MAXC) continue;
        if (mode === 'values') { const v = cp.values ? cp.values.get(dr * MAXC + dc) : cl.v; const old = cur(r, c) || {}; setCell(r, c, { v: F.isErr(v) ? null : v, s: { ...(old.s || {}), ...(cl.s && cl.s.fmt ? { fmt: cl.s.fmt } : {}) } }); continue; }
        if (mode === 'formats') { const old = cur(r, c) || {}; setCell(r, c, { ...old, s: cl.s }); continue; }
        setCell(r, c, { ...cl, f: cl.f != null ? (cp.cut ? cl.f : F.shiftFormula(cl.f, r - (cp.r1 + dr), c - (cp.c1 + dc))) : undefined });
      }
    }
    commit();
    selectRange({ r1: g.r1, c1: g.c1, r2: g.r1 + H * reps[0] - 1, c2: g.c1 + W * reps[1] - 1 }, g.r1, g.c1);
    if (cp.cut) clip = null;
  }
  function parseTSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = text.replace(/\r\n?/g, '\n'); if (text.endsWith('\n')) text = text.slice(0, -1);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"' && cell === '') { q = true; continue; }
      if (ch === '\t') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    row.push(cell); rows.push(row); return rows;
  }
  function pasteText(text) {
    if (clip && !clip.done && text.replace(/\s+/g, ' ').trim() === clip.text.replace(/\s+/g, ' ').trim()) return pasteInternal(clip);
    const rows = parseTSV(text); const g = selRect();
    begin('coller');
    rows.forEach((row, i) => row.forEach((t, j) => { const p = F.parseInput(t); const old = cur(g.r1 + i, g.c1 + j) || {}; const st = { ...(old.s || {}) }; if (p.fmt && !st.fmt) st.fmt = p.fmt; setCell(g.r1 + i, g.c1 + j, { v: p.v, f: p.f, s: st }); }));
    commit();
    selectRange({ r1: g.r1, c1: g.c1, r2: g.r1 + rows.length - 1, c2: g.c1 + Math.max(...rows.map((r) => r.length)) - 1 }, g.r1, g.c1);
  }
  const inField = () => { const a = document.activeElement; return a && (a === ed || a === fx || a === nameBox || (a.matches && a.matches('input, textarea, select, [contenteditable]'))) && a !== scroller; };
  document.addEventListener('copy', (e) => { if (inField() || document.querySelector('.modal-back')) return; e.preventDefault(); const cp = doCopy(false); e.clipboardData.setData('text/plain', cp.text); e.clipboardData.setData('text/html', selectionHTML(cp)); toast('Copié'); });
  document.addEventListener('cut', (e) => { if (inField() || document.querySelector('.modal-back')) return; e.preventDefault(); const cp = doCopy(true); e.clipboardData.setData('text/plain', cp.text); });
  document.addEventListener('paste', (e) => { if (inField() || document.querySelector('.modal-back')) return; e.preventDefault(); const t = e.clipboardData.getData('text/plain'); if (t) pasteText(t); else if (clip) pasteInternal(clip); });
  async function menuCopy(cut) { const cp = doCopy(cut); try { await navigator.clipboard.writeText(cp.text); } catch (e) { /* presse-papiers du système indisponible : copie interne */ } toast(cut ? 'Coupé — choisissez la destination puis Coller' : 'Copié'); }
  async function menuPaste(mode = 'all') {
    if (mode !== 'all') { if (!clip) return toast('Copiez d\'abord des cellules'); if (mode === 'values') { const S = wb.sheets[clip.s]; clip.values = new Map(); clip.cells.forEach(([dr, dc]) => clip.values.set(dr * MAXC + dc, eng.value(clip.s, clip.r1 + dr, clip.c1 + dc))); void S; } return pasteInternal(clip, mode); }
    try { const t = await navigator.clipboard.readText(); if (t) return pasteText(t); } catch (e) { /* lecture refusée */ }
    if (clip) pasteInternal(clip); else toast('Utilisez Ctrl+V pour coller depuis une autre application');
  }

  /* ================= Mise en forme ================= */
  function eachSelCell(fn) { const g = boundSel(selRect()); for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { if (mergeAt(r, c) && (mergeAt(r, c).r1 !== r || mergeAt(r, c).c1 !== c)) continue; fn(r, c); } }
  function styleSel(patch, label = 'format') {
    begin(label);
    eachSelCell((r, c) => { const cl = cur(r, c) || {}; const p = typeof patch === 'function' ? patch(cl.s || {}, r, c) : patch; setCell(r, c, { ...cl, s: { ...(cl.s || {}), ...p } }); });
    recalc(); const bg = boundSel(selRect()); widenForNumbers(bg); growRows(bg);
    commit();
  }
  /* agrandit les lignes dont le texte (grande police, retour à la ligne) dépasse */
  function growRows(g) {
    const S = sh(); if (g.r2 - g.r1 > 3000) return;
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    for (let r = g.r1; r <= g.r2; r++) {
      let need = 0;
      for (let c = g.c1; c <= Math.min(g.c2, g.c1 + 100); c++) {
        const cl = S.cells.get(K(r, c)); if (!cl || !cl.s || mergeAt(r, c)) continue; const st = cl.s; const fs = (st.fs || DEF_FS) * 4 / 3;
        let lines = 1;
        if (st.wrap) { const t = F.format(cl.f != null ? val(r, c) : cl.v, st.fmt).text; if (!t) continue; measureCtx.font = fontOf(st); const w = CA.size(c) - 6; lines = 0; for (const para of String(t).split('\n')) { let line = '', n = 1; for (const word of para.split(/(\s+)/)) { const tt = line + word; if (measureCtx.measureText(tt).width > w && line.trim()) { n++; line = word.trimStart(); } else line = tt; } lines += n; } }
        need = Math.max(need, Math.ceil(lines * fs * 1.2 + 7));
      }
      if (need > (S.rowH[r] !== undefined ? S.rowH[r] : DEF_H)) { touchMeta(); S.rowH[r] = Math.min(400, need); }
    }
  }
  /* élargit les colonnes jamais redimensionnées pour que les nombres ne s'affichent pas en ### */
  function widenForNumbers(g) {
    const S = sh(); if (g.c2 - g.c1 > 60) return;
    for (let c = g.c1; c <= g.c2; c++) {
      if (S.colW[c] !== undefined) continue;
      let need = 0;
      for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 2000); r++) { const cl = S.cells.get(K(r, c)); if (!cl || mergeAt(r, c)) continue; const v = cl.f != null ? val(r, c) : cl.v; if (typeof v !== 'number' || (cl.s && cl.s.wrap)) continue; measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = fontOf(cl.s); need = Math.max(need, measureCtx.measureText(F.format(v, cl.s && cl.s.fmt).text).width + 10); }
      if (need > DEF_W) { touchMeta(); S.colW[c] = Math.min(400, Math.ceil(need)); }
    }
  }
  const activeStyle = () => { const m = mergeAt(sel.ar, sel.ac); const cl = m ? cur(m.r1, m.c1) : cur(sel.ar, sel.ac); return (cl && cl.s) || {}; };
  function toggleStyle(key) { const on = !activeStyle()[key]; styleSel({ [key]: on || undefined }); }
  function setBorders(kind) {
    const g = boundSel(selRect()); const thin = { w: 1, c: '#000000' }, thick = { w: 2, c: '#000000' };
    begin('bordures');
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const cl = cur(r, c) || {}; const bd = { ...((cl.s && cl.s.bd) || {}) };
      if (kind === 'none') { delete bd.t; delete bd.b; delete bd.l; delete bd.r; }
      if (kind === 'all') { bd.t = bd.b = bd.l = bd.r = thin; }
      if (kind === 'outer' || kind === 'thick') { const b = kind === 'thick' ? thick : thin; if (r === g.r1) bd.t = b; if (r === g.r2) bd.b = b; if (c === g.c1) bd.l = b; if (c === g.c2) bd.r = b; }
      if (kind === 'bottom' && r === g.r2) bd.b = thin;
      if (kind === 'double' && r === g.r2) bd.b = { w: 1, c: '#000000', st: 'double' };
      setCell(r, c, { ...cl, s: { ...(cl.s || {}), bd: Object.keys(bd).length ? bd : undefined } });
    }
    commit();
  }
  function changeDecimals(d) {
    styleSel((s, r, c) => {
      let f = s.fmt && s.fmt !== 'General' ? s.fmt : null;
      if (!f) { const v = val(r, c); if (typeof v !== 'number') return {}; const dec = (F.generalNumber(v).split(',')[1] || '').length; f = '0' + (dec ? '.' + '0'.repeat(dec) : ''); }
      if (F.isDateFormat(f)) return {};
      const secs = f.split(';').map((sec) => sec.replace(/(0|#)(\.0*)?(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)/, (m, a, dec) => { const n = Math.max(0, (dec ? dec.length - 1 : 0) + d); return a + (n ? '.' + '0'.repeat(n) : ''); }));
      return { fmt: secs.join(';') };
    }, 'décimales');
  }
  function toggleMerge() {
    const g = selRect(); const S = sh();
    const existing = S.merges.filter((m) => !(m.r2 < g.r1 || m.r1 > g.r2 || m.c2 < g.c1 || m.c1 > g.c2));
    begin('fusion'); touchMeta();
    if (existing.length) { S.merges = S.merges.filter((m) => !existing.includes(m)); commit(); return; }
    if (g.r1 === g.r2 && g.c1 === g.c2) { commit(); return; }
    const bg = boundSel(g);
    if (bg.r2 - bg.r1 > 500 || bg.c2 - bg.c1 > 200) { commit(); return toast('Sélection trop grande pour fusionner'); }
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { if (r === g.r1 && c === g.c1) continue; if (cur(r, c)) setCell(r, c, cur(r, c).s ? { s: cur(r, c).s } : null); }
    S.merges.push({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 });
    const cl = cur(g.r1, g.c1) || {}; setCell(g.r1, g.c1, { ...cl, s: { ...(cl.s || {}), ha: 'center', va: (cl.s && cl.s.va) || 'middle' } });
    commit(); select(g.r1, g.c1);
  }
  function clearSel(what) {
    begin('effacer');
    const g = boundSel(selRect());
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const cl = cur(r, c); if (!cl) continue;
      if (what === 'contents') setCell(r, c, cl.s ? { s: cl.s } : null);
      else if (what === 'formats') setCell(r, c, { v: cl.v, f: cl.f });
      else setCell(r, c, null);
    }
    if (what !== 'contents') { const S = sh(); const before = S.cf.length; const left = S.cf.filter((x) => !(x.range.r1 >= g.r1 && x.range.r2 <= g.r2 && x.range.c1 >= g.c1 && x.range.c2 <= g.c2)); if (left.length !== before) { touchMeta(); S.cf = left; } }
    commit();
  }
  function autosum() {
    const g = selRect(); const S = sh();
    const isNum = (r, c) => typeof val(r, c) === 'number';
    if (g.r1 !== g.r2 || g.c1 !== g.c2) { // sélection : total sous chaque colonne
      begin('somme'); const r = g.r2 + 1;
      for (let c = g.c1; c <= g.c2; c++) setCell(r, c, { f: `SUM(${F.addr(g.r1, c)}:${F.addr(g.r2, c)})`, s: { ...((cur(g.r2, c) || {}).s || {}), b: true } });
      commit(); return;
    }
    let r = g.r1 - 1; const c = g.c1;
    if (r >= 0 && isNum(r, c)) { let top = r; while (top > 0 && isNum(top - 1, c)) top--; startEdit(`=SOMME(${F.addr(top, c)}:${F.addr(r, c)})`, 'edit'); return; }
    let cc = c - 1; if (cc >= 0 && isNum(g.r1, cc)) { let left = cc; while (left > 0 && isNum(g.r1, left - 1)) left--; startEdit(`=SOMME(${F.addr(g.r1, left)}:${F.addr(g.r1, cc)})`, 'edit'); return; }
    void S; startEdit('=SOMME()', 'edit'); ed.setSelectionRange(7, 7);
  }

  /* ================= Lignes, colonnes ================= */
  function structural(axis, at, count, label) {
    begin(label); touchAll();
    const target = sh().name;
    wb.sheets.forEach((S) => {
      const own = S.name;
      if (S === sh()) {
        const cells = new Map(); let maxR = 0, maxC = 0;
        for (const [k, cl] of S.cells) {
          let r = KR(k), c = KC(k); const p = axis === 'row' ? r : c;
          if (count < 0 && p >= at && p < at - count) continue;
          if (p >= at) { if (axis === 'row') r += count; else c += count; }
          if (r < 0 || c < 0 || r >= MAXR || c >= MAXC) continue;
          cells.set(K(r, c), cl); maxR = Math.max(maxR, r + 1); maxC = Math.max(maxC, c + 1);
        }
        S.cells = cells; S.maxR = maxR; S.maxC = maxC;
        const key = axis === 'row' ? 'rowH' : 'colW'; const nm = {};
        for (const [i, v] of Object.entries(S[key])) { const n = +i; if (count < 0 && n >= at && n < at - count) continue; nm[n >= at ? n + count : n] = v; } S[key] = nm;
        if (axis === 'row') { const nh = {}; for (const i of Object.keys(S.hiddenRows)) { const n = +i; if (count < 0 && n >= at && n < at - count) continue; nh[n >= at ? n + count : n] = true; } S.hiddenRows = nh; }
        const adjRange = (g) => {
          const lo = axis === 'row' ? 'r1' : 'c1', hi = axis === 'row' ? 'r2' : 'c2'; const out = { ...g };
          if (count > 0) { if (out[lo] >= at) out[lo] += count; if (out[hi] >= at) out[hi] += count; return out; }
          const n = -count, end = at + n - 1;
          if (out[lo] >= at && out[hi] <= end) return null;
          out[lo] = out[lo] > end ? out[lo] - n : out[lo] >= at ? at : out[lo]; out[hi] = out[hi] > end ? out[hi] - n : out[hi] >= at ? at - 1 : out[hi];
          return out[hi] < out[lo] ? null : out;
        };
        S.merges = S.merges.map(adjRange).filter((m) => m && (m.r1 !== m.r2 || m.c1 !== m.c2));
        S.cf = S.cf.map((x) => ({ ...x, range: adjRange(x.range) })).filter((x) => x.range);
        if (S.filter) { const fg = adjRange({ r1: S.filter.r, r2: S.filter.r, c1: S.filter.c1, c2: S.filter.c2 }); S.filter = fg ? { ...S.filter, r: fg.r1, c1: fg.c1, c2: fg.c2, crit: axis === 'col' ? {} : S.filter.crit } : null; }
      }
      // formules de toutes les feuilles
      for (const [k, cl] of S.cells) if (cl.f != null) { const nf = F.adjustForStructure(cl.f, own, target, axis, at, count); if (nf !== cl.f) S.cells.set(k, { ...cl, f: nf }); }
      S.charts.forEach((ch) => { if (ch.range) ch.range = F.adjustForStructure(ch.range, own, target, axis, at, count); });
    });
    commit();
  }
  function insertRows(below) { const g = selRect(); const n = Math.min(g.r2 - g.r1 + 1, 1000); structural('row', below ? g.r2 + 1 : g.r1, n, 'insérer des lignes'); if (!below) selectRange({ ...g, r1: g.r1, r2: g.r1 + n - 1 }, g.r1, sel.ac); }
  function insertCols(right) { const g = selRect(); const n = Math.min(g.c2 - g.c1 + 1, 200); structural('col', right ? g.c2 + 1 : g.c1, n, 'insérer des colonnes'); }
  function deleteRows() { const g = selRect(); const S = sh(); const r2 = Math.min(g.r2, Math.max(S.maxR, g.r1)); structural('row', g.r1, -(r2 - g.r1 + 1), 'supprimer des lignes'); select(g.r1, sel.ac); }
  function deleteCols() { const g = selRect(); const S = sh(); const c2 = Math.min(g.c2, Math.max(S.maxC, g.c1)); structural('col', g.c1, -(c2 - g.c1 + 1), 'supprimer des colonnes'); select(sel.ar, g.c1); }
  function autofitCols(c1, c2) {
    const S = sh(); begin('largeur'); touchMeta();
    for (let c = c1; c <= c2; c++) {
      let w = 30;
      for (let r = 0; r < S.maxR; r++) { const cl = S.cells.get(K(r, c)); if (!cl || mergeAt(r, c)) continue; ctx.font = fontOf(cl.s); const t = F.format(cl.f != null ? val(r, c) : cl.v, cl.s && cl.s.fmt).text; if (!t) continue; const lines = cl.s && cl.s.wrap ? String(t).split('\n') : [t]; for (const ln of lines) w = Math.max(w, ctx.measureText(ln).width + 10 + (S.filter && S.filter.r === r ? 18 : 0)); }
      S.colW[c] = Math.min(600, Math.ceil(w));
    }
    commit();
  }

  /* ================= Feuilles ================= */
  const tabsEl = $('#tabs');
  function renderTabs() {
    tabsEl.innerHTML = '';
    wb.sheets.forEach((S, i) => {
      const b = document.createElement('button'); b.textContent = S.name; b.className = i === wb.active ? 'on' : '';
      if (S.tab) b.style.borderBottom = `3px solid ${S.tab}`;
      b.onclick = () => switchSheet(i);
      b.ondblclick = () => renameSheet(i);
      b.oncontextmenu = (e) => { e.preventDefault(); showCtx(e.clientX, e.clientY, sheetMenu(i)); };
      tabsEl.appendChild(b);
    });
  }
  function switchSheet(i) {
    if (i === wb.active || !wb.sheets[i]) return;
    if (editing && !(editorValue()[0] === '=' && canPoint())) { if (!commitEdit()) return; }
    const S = sh(); S._sel = { ...sel }; S._scroll = [scroller.scrollLeft, scroller.scrollTop];
    wb.active = i; geomDirty = true; extR = 120; extC = 30;
    const N = sh(); sel = N._sel ? { ...N._sel } : { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 };
    renderTabs(); render();
    requestAnimationFrame(() => { geom(); updateExtent(); const sc = N._scroll || [0, 0]; scroller.scrollLeft = sc[0]; scroller.scrollTop = sc[1]; render(); });
    updateUI();
  }
  function uniqueName(base) { let n = base, i = 2; while (wb.sheets.some((s) => s.name.toLowerCase() === n.toLowerCase())) n = `${base} (${i++})`; return n; }
  function addSheet() { begin('nouvelle feuille'); touchAll(); let i = wb.sheets.length + 1; while (wb.sheets.some((s) => s.name === 'Feuil' + i)) i++; wb.sheets.push(newSheet('Feuil' + i)); commit(); switchSheet(wb.sheets.length - 1); }
  async function renameSheet(i) {
    const S = wb.sheets[i];
    const res = await modal({ title: 'Renommer la feuille', body: `<div class="field"><label for="snm">Nom</label><input type="text" id="snm" maxlength="31" value="${esc(S.name)}"></div>`, onOpen: (b) => { const x = b.querySelector('#snm'); x.focus(); x.select(); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Renommer', primary: true, value: (b) => b.querySelector('#snm').value.trim() }] });
    if (!res || res === S.name) return;
    if (/[\\/?*[\]:]/.test(res)) return toast('Caractères interdits dans un nom de feuille : \\ / ? * [ ] :');
    if (wb.sheets.some((s, j) => j !== i && s.name.toLowerCase() === res.toLowerCase())) return toast('Une feuille porte déjà ce nom');
    begin('renommer'); touchAll();
    const old = S.name; S.name = res;
    wb.sheets.forEach((X) => { for (const [k, cl] of X.cells) if (cl.f != null) { const nf = F.renameSheetInFormula(cl.f, old, res); if (nf !== cl.f) X.cells.set(k, { ...cl, f: nf }); } X.charts.forEach((ch) => { if (ch.range) ch.range = F.renameSheetInFormula(ch.range, old, res); }); });
    commit(); renderTabs();
  }
  async function deleteSheet(i) {
    if (wb.sheets.length < 2) return toast('Un classeur garde au moins une feuille');
    if (wb.sheets[i].cells.size && !(await confirmBox(`Supprimer la feuille « ${wb.sheets[i].name} » et son contenu ?`))) return;
    begin('supprimer la feuille'); touchAll(); wb.sheets.splice(i, 1); wb.active = Math.min(wb.active >= i ? Math.max(0, wb.active - 1) : wb.active, wb.sheets.length - 1); sel = { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 }; commit(); renderTabs();
  }
  function duplicateSheet(i) { begin('dupliquer'); touchAll(); const S = cloneSheet(wb.sheets[i]); S.name = uniqueName(wb.sheets[i].name); wb.sheets.splice(i + 1, 0, S); commit(); switchSheet(i + 1); }
  function moveSheet(i, d) { const j = i + d; if (j < 0 || j >= wb.sheets.length) return; begin('déplacer'); touchAll(); const [S] = wb.sheets.splice(i, 1); wb.sheets.splice(j, 0, S); wb.active = j; commit(); renderTabs(); }
  function sheetMenu(i) {
    return [['Renommer…', () => renameSheet(i)], ['Dupliquer', () => duplicateSheet(i)], ['Déplacer à gauche', () => moveSheet(i, -1)], ['Déplacer à droite', () => moveSheet(i, 1)],
      ['Couleur de l\'onglet…', async () => { const c = await modal({ title: 'Couleur de l\'onglet', body: '<input type="color" id="tc" value="#1f7a46">', buttons: [{ label: 'Aucune', value: '' }, { label: 'Appliquer', primary: true, value: (b) => b.querySelector('#tc').value }] }); if (c === null) return; begin('couleur'); touchMeta(i); wb.sheets[i].tab = c || undefined; commit(); renderTabs(); }],
      '-', ['Supprimer la feuille', () => deleteSheet(i)]];
  }
  $('#addSheet').onclick = addSheet;

  /* ================= Menu contextuel ================= */
  let ctxEl = null;
  function hideCtx() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
  function showCtx(x, y, items) {
    hideCtx(); ctxEl = document.createElement('div'); ctxEl.className = 'ctx';
    items.forEach((it) => { if (it === '-') { ctxEl.appendChild(document.createElement('hr')); return; } const b = document.createElement('button'); b.innerHTML = it[0]; b.onclick = () => { hideCtx(); it[1](); }; ctxEl.appendChild(b); });
    document.body.appendChild(ctxEl);
    const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px'; ctxEl.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  }
  document.addEventListener('pointerdown', (e) => { if (ctxEl && !ctxEl.contains(e.target)) hideCtx(); });
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault(); if (editing) commitEdit();
    const { x, y } = localXY(e); const h = hit(x, y);
    if (Studio.sheetCharts && Studio.sheetCharts.contextMenu(x, y, e.clientX, e.clientY, showCtx)) return;
    if (h.r >= 0 && h.c >= 0) { const g = selRect(); if (!(h.r >= g.r1 && h.r <= g.r2 && h.c >= g.c1 && h.c <= g.c2)) select(h.r, h.c); }
    const items = [['Couper <kbd>Ctrl+X</kbd>', () => menuCopy(true)], ['Copier <kbd>Ctrl+C</kbd>', () => menuCopy(false)], ['Coller <kbd>Ctrl+V</kbd>', () => menuPaste()], ['Coller les valeurs', () => menuPaste('values')], ['Coller la mise en forme', () => menuPaste('formats')], '-'];
    if (y < HH) items.push(['Insérer des colonnes à gauche', () => insertCols(false)], ['Supprimer les colonnes', deleteCols], ['Largeur de colonne…', () => act('colWidth')], ['Ajuster au contenu', () => act('autofit')]);
    else if (x < HW) items.push(['Insérer des lignes au-dessus', () => insertRows(false)], ['Supprimer les lignes', deleteRows], ['Hauteur de ligne…', () => act('rowHeight')]);
    else items.push(['Insérer une ligne au-dessus', () => insertRows(false)], ['Insérer une colonne à gauche', () => insertCols(false)], ['Supprimer les lignes', deleteRows], ['Supprimer les colonnes', deleteCols]);
    items.push('-', ['Effacer le contenu', () => clearSel('contents')], ['Format de cellule… <kbd>Ctrl+1</kbd>', () => act('formatCells')], ['Recopier vers le bas', fillDown], ['Recopier vers la droite', fillRight], ['Trier de A à Z', () => act('sortAsc')], ['Filtrer', () => act('filter')]);
    showCtx(e.clientX, e.clientY, items);
  });

  /* ================= Clavier ================= */
  scroller.addEventListener('keydown', gridKey);
  function gridKey(e) {
    if (editing) return;
    const ctrl = e.ctrlKey || e.metaKey; const k = e.key;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[k]) { e.preventDefault(); moveActive(...arrows[k], e.shiftKey, ctrl); return; }
    if (k === 'Enter') { e.preventDefault(); moveInSelection(e.shiftKey ? -1 : 1, 0); return; }
    if (k === 'Tab') { e.preventDefault(); moveInSelection(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); if (ctrl) { switchSheet(wb.active + (k === 'PageDown' ? 1 : -1)); return; } const n = Math.max(1, Math.floor(view().vh / DEF_H) - 2); moveActive(k === 'PageDown' ? n : -n, 0, e.shiftKey, false); return; }
    if (k === 'Home') { e.preventDefault(); if (ctrl) { select(0, 0); scrollToCell(0, 0); } else { select(sel.ar, 0, e.shiftKey); scrollToCell(sel.ar, 0); } return; }
    if (k === 'End' && ctrl) { e.preventDefault(); const S = sh(); select(Math.max(0, S.maxR - 1), Math.max(0, S.maxC - 1), e.shiftKey); scrollToCell(Math.max(0, S.maxR - 1), Math.max(0, S.maxC - 1)); return; }
    if (k === 'F2') { e.preventDefault(); startEdit(undefined, 'edit'); return; }
    if (k === 'F9') { e.preventDefault(); recalc(); render(); toast('Recalculé'); return; }
    if (k === 'F3' && e.shiftKey) { e.preventDefault(); act('insFn'); return; }
    if (k === 'Delete') { e.preventDefault(); clearSel('contents'); return; }
    if (k === 'Backspace') { e.preventDefault(); begin('effacer'); const cl = cur(sel.ar, sel.ac); setCell(sel.ar, sel.ac, cl && cl.s ? { s: cl.s } : null); commit(); startEdit('', 'enter'); return; }
    if (k === 'Escape') { if (clip) { clip = null; render(); } return; }
    if (e.altKey && (k === '=' || k === '+')) { e.preventDefault(); autosum(); return; }
    if (ctrl) {
      const lk = k.toLowerCase();
      const map = { z: 'undo', y: 'redo', b: 'bold', i: 'italic', u: 'underline', a: 'selectAll', d: 'fillDown', r: 'fillRight', f: 'find', h: 'find', g: 'goto', s: 'saveXlsx', o: 'open', 1: 'formatCells', '&': 'formatCells', ';': 'today', ',': 'today' };
      if (e.shiftKey && lk === 'z') { e.preventDefault(); return act('redo'); }
      if (k === ' ') { e.preventDefault(); selectRange({ r1: 0, r2: MAXR - 1, c1: selRect().c1, c2: selRect().c2 }, sel.ar, sel.ac); return; }
      if (map[lk]) { e.preventDefault(); act(map[lk]); return; }
      return;
    }
    if (e.shiftKey && k === ' ') { e.preventDefault(); selectRange({ c1: 0, c2: MAXC - 1, r1: selRect().r1, r2: selRect().r2 }, sel.ar, sel.ac); return; }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); startEdit(k, 'enter'); return; }
  }
  function moveInSelection(dr, dc) {
    const g = selRect();
    if (g.r1 === g.r2 && g.c1 === g.c2) { moveActive(dr, dc, false, false); return; }
    let r = sel.ar + dr, c = sel.ac + dc;
    if (dr) { if (r > g.r2) { r = g.r1; c++; } if (r < g.r1) { r = g.r2; c--; } if (c > g.c2) c = g.c1; if (c < g.c1) c = g.c2; }
    if (dc) { if (c > g.c2) { c = g.c1; r++; } if (c < g.c1) { c = g.c2; r--; } if (r > g.r2) r = g.r1; if (r < g.r1) r = g.r2; }
    sel.ar = r; sel.ac = c; updateUI(); render(); scrollToCell(r, c);
  }
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back') || e.defaultPrevented) return;
    if (e.target === scroller || e.target === ed || e.target === fx) return;
    if (inField() || (e.target !== document.body && !e.target.closest('#gridwrap'))) return;
    // focus ailleurs (page, barre d'outils) : le clavier va à la grille
    scroller.focus({ preventScroll: true }); gridKey(e);
  });
  // après la fermeture d'une fenêtre, la grille reprend le focus
  new MutationObserver(() => { if (!document.querySelector('.modal-back') && !editing && (document.activeElement === document.body || !document.activeElement)) scroller.focus({ preventScroll: true }); }).observe(document.body, { childList: true });

  /* ================= Barre de formule, zone de nom, statut ================= */
  nameBox.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    const t = nameBox.value.trim(); let s = wb.active, rest = t;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(t);
    if (m) { s = wb.sheets.findIndex((x) => x.name.toLowerCase() === (m[1] || m[2]).toLowerCase()); rest = m[3]; }
    const g = F.parseRange(rest);
    if (!g || s < 0) { toast('Adresse inconnue (exemple : B12 ou A1:D20)'); return; }
    if (s !== wb.active) switchSheet(s);
    selectRange(g, g.r1, g.c1); scrollToCell(g.r1, g.c1); scroller.focus();
  });
  nameBox.addEventListener('focus', () => nameBox.select());
  const statusEl = $('#status');
  function updateUI() {
    const g = selRect();
    const full = (g.r1 === 0 && g.r2 >= MAXR - 1) || (g.c1 === 0 && g.c2 >= MAXC - 1);
    if (document.activeElement !== nameBox) nameBox.value = g.r1 === g.r2 && g.c1 === g.c2 || (mergeAt(g.r1, g.c1) && mergeAt(g.r1, g.c1) === mergeAt(g.r2, g.c2)) ? F.addr(sel.ar, sel.ac) : full ? F.addr(sel.ar, sel.ac) : F.rangeName(g);
    if (!editing) { const m = mergeAt(sel.ar, sel.ac); fx.value = editText(m ? cur(m.r1, m.c1) : cur(sel.ar, sel.ac)); }
    // statistiques de la sélection
    if (g.r1 !== g.r2 || g.c1 !== g.c2) {
      const b = boundSel(g); let sum = 0, n = 0, cnt = 0, mn = Infinity, mx = -Infinity; let cells = 0;
      outer: for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { if (++cells > 200000) break outer; const cl = cur(r, c); if (!cl) continue; const v = val(r, c); if (v !== null && v !== '') cnt++; if (typeof v === 'number') { sum += v; n++; mn = Math.min(mn, v); mx = Math.max(mx, v); } }
      const fmtN = (x) => F.format(+x.toPrecision(12), Math.abs(x) >= 1000 ? '#,##0.##' : 'General').text.replace(/,$/, '');
      statusEl.textContent = n ? `Somme : ${fmtN(sum)}   Moyenne : ${fmtN(sum / n)}   Nb : ${cnt}   Min : ${fmtN(mn)}   Max : ${fmtN(mx)}` : cnt ? `Nb : ${cnt}` : '';
    } else statusEl.textContent = '';
    // état de la barre d'outils
    const s = activeStyle();
    $('#tbBold').classList.toggle('on', !!s.b); $('#tbItalic').classList.toggle('on', !!s.i); $('#tbUnder').classList.toggle('on', !!s.u);
    $('#tbL').classList.toggle('on', s.ha === 'left'); $('#tbC').classList.toggle('on', s.ha === 'center'); $('#tbR').classList.toggle('on', s.ha === 'right'); $('#tbWrap').classList.toggle('on', !!s.wrap);
    $('#tbFilter').classList.toggle('on', !!sh().filter);
    const fsSel = $('#fontSize'); const fsv = String(s.fs || DEF_FS); if (![...fsSel.options].some((o) => o.value === fsv)) fsSel.add(new Option(fsv)); fsSel.value = fsv;
    const nf = $('#numFmt'); const fmt = s.fmt || 'General'; if (![...nf.options].some((o) => o.value === fmt)) { const o = new Option('Personnalisé : ' + fmt, fmt); o.dataset.custom = '1'; [...nf.options].filter((x) => x.dataset.custom).forEach((x) => x.remove()); nf.add(o, nf.options[nf.options.length - 1]); } nf.value = fmt;
    $('#docName').textContent = wb.name + (dirtyFlag ? ' •' : '');
  }

  /* ================= Barre d'outils ================= */
  const nf = $('#numFmt');
  F.NUM_FORMATS.forEach(([code, label]) => nf.add(new Option(label, code)));
  nf.add(new Option('Autre format…', '__custom'));
  nf.onchange = () => { if (nf.value === '__custom') { act('formatCells'); updateUI(); return; } styleSel({ fmt: nf.value === 'General' ? undefined : nf.value }, 'format de nombre'); scroller.focus(); };
  $('#fontSize').onchange = (e) => { styleSel({ fs: +e.target.value === DEF_FS ? undefined : +e.target.value }); scroller.focus(); };
  const fcPick = $('#fcPick'), bgPick = $('#bgPick');
  fcPick.oninput = () => { $('#fcBar').style.background = fcPick.value; }; fcPick.onchange = () => styleSel({ fc: fcPick.value });
  bgPick.oninput = () => { $('#bgBar').style.background = bgPick.value; }; bgPick.onchange = () => styleSel({ bg: bgPick.value });
  // un clic sur le bouton applique la dernière couleur (comme Excel) ; la palette s'ouvre par la flèche du navigateur
  fcPick.parentElement.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); styleSel({ fc: fcPick.value }); });
  bgPick.parentElement.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); styleSel({ bg: bgPick.value }); });
  fcPick.addEventListener('click', (e) => e.stopPropagation()); bgPick.addEventListener('click', (e) => e.stopPropagation());

  function setZoom(z) { const old = zoom; zoom = Math.max(0.5, Math.min(2, Math.round(z * 10) / 10)); if (old === zoom) return; const k = zoom / old; scroller.scrollLeft *= k; scroller.scrollTop *= k; $('#zoom').value = Math.round(zoom * 100); $('#zoomO').textContent = Math.round(zoom * 100) + ' %'; render(); }
  $('#zoom').oninput = (e) => setZoom(+e.target.value / 100);

  /* ================= Actions ================= */
  const actions = {
    undo, redo,
    copy: () => menuCopy(false), cut: () => menuCopy(true), paste: () => menuPaste(), pasteValues: () => menuPaste('values'),
    fillDown, fillRight,
    clearContents: () => clearSel('contents'), clearFormats: () => clearSel('formats'), clearAll: () => clearSel('all'),
    selectAll: () => selectRange({ r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }, sel.ar, sel.ac),
    insRowAbove: () => insertRows(false), insRowBelow: () => insertRows(true), insColLeft: () => insertCols(false), insColRight: () => insertCols(true),
    delRows: deleteRows, delCols: deleteCols, autosum, newSheet: addSheet,
    today: () => { begin('date'); const cl = cur(sel.ar, sel.ac) || {}; setCell(sel.ar, sel.ac, { v: F.todaySerial(), s: { ...(cl.s || {}), fmt: (cl.s && cl.s.fmt && F.isDateFormat(cl.s.fmt)) ? cl.s.fmt : 'dd/mm/yyyy' } }); commit(); },
    bold: () => toggleStyle('b'), italic: () => toggleStyle('i'), underline: () => toggleStyle('u'),
    alignL: () => styleSel({ ha: activeStyle().ha === 'left' ? undefined : 'left' }), alignC: () => styleSel({ ha: activeStyle().ha === 'center' ? undefined : 'center' }), alignR: () => styleSel({ ha: activeStyle().ha === 'right' ? undefined : 'right' }),
    wrap: () => toggleStyle('wrap'), merge: toggleMerge, noFill: () => styleSel({ bg: undefined }),
    bdAll: () => setBorders('all'), bdOuter: () => setBorders('outer'), bdThick: () => setBorders('thick'), bdBottom: () => setBorders('bottom'), bdDoubleBottom: () => setBorders('double'), bdNone: () => setBorders('none'),
    fmtMoney: () => styleSel({ fmt: '#,##0" FCFA"' }), fmtPct: () => styleSel({ fmt: '0%' }), fmtThousands: () => styleSel({ fmt: '#,##0' }),
    decMore: () => changeDecimals(1), decLess: () => changeDecimals(-1),
    freeze: () => { begin('figer'); touchMeta(); sh().freeze = { r: sel.ar, c: sel.ac }; commit(); scroller.scrollTop = 0; scroller.scrollLeft = 0; },
    freezeRow: () => { begin('figer'); touchMeta(); sh().freeze = { r: 1, c: 0 }; commit(); },
    unfreeze: () => { begin('libérer'); touchMeta(); sh().freeze = { r: 0, c: 0 }; commit(); },
    autofit: () => { const g = selRect(); autofitCols(g.c1, Math.min(g.c2, Math.max(sh().maxC - 1, g.c1))); },
    recalc: () => { recalc(); render(); toast('Recalculé'); },
    goto: () => { nameBox.focus(); nameBox.select(); },
  };
  function act(name) {
    hideCtx();
    if (editing && !['undo', 'redo'].includes(name) && !commitEdit()) return;
    const fn = actions[name] || (Studio.sheetExtra && Studio.sheetExtra.actions[name]);
    if (fn) { try { const r = fn(); if (r && r.catch) r.catch((e) => { console.error(e); toast('Erreur : ' + e.message, 6000); }); } catch (e) { console.error(e); toast('Erreur : ' + e.message, 6000); } }
    else console.warn('action inconnue', name);
    if (!document.querySelector('.modal-back') && !editing) scroller.focus({ preventScroll: true });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); act(b.dataset.act); } });
  $('#fxBtn').onclick = () => act('insFn');
  $('#helpBtn').onclick = () => act('help');
  initMenus();
  // les boutons de la barre d'outils ne prennent pas le focus (la grille garde le clavier)
  $$('.tools button, .topbar .menu > button').forEach((b) => b.addEventListener('mousedown', (e) => { if (!e.target.closest('.clr')) e.preventDefault(); }));

  /* ================= Sauvegarde automatique, (dé)sérialisation ================= */
  function serialize() {
    return {
      app: 'tableur-joe', v: 1, name: wb.name, active: wb.active,
      sheets: wb.sheets.map((S) => ({ name: S.name, tab: S.tab, colW: S.colW, rowH: S.rowH, merges: S.merges, freeze: S.freeze, hiddenRows: S.hiddenRows, cf: S.cf, charts: S.charts, filter: S.filter, cells: [...S.cells].map(([k, cl]) => [KR(k), KC(k), cl.v === undefined ? null : cl.v, cl.f === undefined ? null : cl.f, cl.s || null]) })),
    };
  }
  function deserialize(o) {
    if (!o || !Array.isArray(o.sheets) || !o.sheets.length) throw new Error('fichier de classeur invalide');
    const sheets = o.sheets.map((x) => {
      const S = newSheet(String(x.name || 'Feuille')); Object.assign(S, { tab: x.tab, colW: x.colW || {}, rowH: x.rowH || {}, merges: x.merges || [], freeze: x.freeze || { r: 0, c: 0 }, hiddenRows: x.hiddenRows || {}, cf: x.cf || [], charts: x.charts || [], filter: x.filter || null });
      for (const [r, c, v, f, s] of x.cells || []) { const cl = cleanCell({ v, f, s }); if (cl) { S.cells.set(K(r, c), cl); bump(S, r, c); } }
      return S;
    });
    return { name: o.name || 'Classeur', sheets, active: Math.min(o.active || 0, sheets.length - 1) };
  }
  function loadWorkbook(w, { keepUndo = false } = {}) {
    cancelEdit(); wb = w; sel = { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 }; clip = null;
    if (!keepUndo) { undoStack.length = 0; redoStack.length = 0; }
    geomDirty = true; extR = 120; extC = 30; scroller.scrollTop = 0; scroller.scrollLeft = 0;
    recalc(); renderTabs(); render(); updateUI();
  }
  let warnedQuota = false;
  function autosave() {
    try { localStorage.setItem('tableur-autosave', JSON.stringify(serialize())); }
    catch (e) { if (!warnedQuota) { warnedQuota = true; toast('Classeur trop volumineux pour la sauvegarde automatique : pensez à l\'enregistrer (.xlsx ou .joetab)', 7000); } }
  }
  window.addEventListener('beforeunload', autosave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });

  /* ================= Aide ================= */
  actions.help = () => modal({
    title: 'Tableur Joe — raccourcis', wide: true,
    body: `<div class="fmt-grid"><div>
      <p><b>Saisie</b><br>Tapez directement dans une cellule ; <kbd>Entrée</kbd> valide et descend, <kbd>Tab</kbd> va à droite, <kbd>Échap</kbd> annule.
      <br><kbd>F2</kbd> ou double-clic : modifier. <kbd>Alt+Entrée</kbd> : retour à la ligne dans la cellule.
      <br>Formules en français : <code>=SOMME(B2:B10)</code>, <code>=SI(C2>0;"Oui";"Non")</code>, <code>=RECHERCHEV(A2;Tarifs!A:B;2;FAUX)</code>.
      Séparateur « ; », virgule décimale. Pendant la saisie d'une formule, cliquez sur des cellules pour les insérer ; <kbd>F4</kbd> bascule les $.</p>
      <p><b>Montants en lettres</b> : <code>=ENLETTRES(D20;"francs CFA")</code>.</p>
      <p><b>Sur téléphone</b> : touchez une cellule pour la choisir, touchez-la à nouveau pour écrire. Le rond vert sert à étendre la sélection. Appui long : menu.</p>
      </div><div>
      <p><kbd>Ctrl+C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> copier, couper, coller (aussi depuis Excel)<br><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> annuler, rétablir
      <br><kbd>Ctrl+D</kbd> / <kbd>Ctrl+R</kbd> recopier vers le bas / la droite ; glissez le petit carré vert pour une série (1, 2, 3… ; janvier, février…)
      <br><kbd>Ctrl+flèche</kbd> bord des données, <kbd>Maj</kbd> pour étendre
      <br><kbd>Ctrl+B</kbd> <kbd>Ctrl+I</kbd> <kbd>Ctrl+U</kbd> gras, italique, souligné ; <kbd>Ctrl+1</kbd> format de cellule
      <br><kbd>Alt+=</kbd> somme automatique ; <kbd>Ctrl+;</kbd> date du jour
      <br><kbd>Ctrl+F</kbd> rechercher, <kbd>Ctrl+G</kbd> atteindre ; <kbd>Ctrl+S</kbd> enregistrer en .xlsx
      <br><kbd>Ctrl+Espace</kbd> / <kbd>Maj+Espace</kbd> colonne / ligne entière ; <kbd>Ctrl+Page suiv.</kbd> feuille suivante
      <br><kbd>Ctrl+molette</kbd> zoom</p>
      <p>Le classeur est sauvegardé automatiquement sur cet appareil. Enregistrez-le en .xlsx pour l'ouvrir dans Excel.</p></div></div>`,
  });

  /* ================= API pour sheet-extra.js ================= */
  const T = {
    get wb() { return wb; }, set wb(v) { wb = v; }, sh, get sel() { return sel; }, selRect, boundSel, select, selectRange, scrollToCell,
    K, KR, KC, getCell, cur, setCell, setCellIn, val, eng, begin, commit, touchMeta, touchAll, recalc, render, updateUI, renderTabs,
    newSheet, serialize, deserialize, loadWorkbook, autosave, switchSheet, addSheet, uniqueName, cleanCell, structural,
    styleSel, activeStyle, startEdit, commitEdit, cancelEdit, get editing() { return editing; }, editText, insertRows, autofitCols,
    actions, act, showCtx, hideCtx, esc, view, screenRect, hit, zoom: () => zoom, CA, RA, geom, HW, HH, DEF_W, DEF_H, DEF_FS, FONT, GREEN, mergeAt, fontOf,
    markDirty: (v = true) => { dirtyFlag = v; updateUI(); }, get dirty() { return dirtyFlag; }, scroller, cv, edgeOf: edge, quoteSheet, theme: () => TH,
  };
  window.TableurJoe = T;

  /* ================= Démarrage ================= */
  readTheme();
  document.addEventListener('DOMContentLoaded', () => {
    let restored = false;
    try { const o = JSON.parse(localStorage.getItem('tableur-autosave') || 'null'); if (o && o.app === 'tableur-joe') { loadWorkbook(deserialize(o)); restored = true; dirtyFlag = false; } } catch (e) { console.warn('sauvegarde illisible', e); }
    if (!restored) loadWorkbook(wb);
    if (Studio.speech && Studio.speech.attachMic) Studio.speech.attachMic(fx);
    scroller.focus({ preventScroll: true });
    updateUI();
  });
})();
