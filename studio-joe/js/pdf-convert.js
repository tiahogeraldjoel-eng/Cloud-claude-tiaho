/* Studio Joe — conversion PDF → Word / Excel.
   Lit la mise en page d'un PDF (lignes, paragraphes, titres, listes, tableaux), reconnaît le texte des pages
   scannées (OCR), puis écrit un .docx, un .xlsx ou du HTML pour Texte Joe. Tout se fait dans le navigateur. */
(function () {
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); });
    return loaded[src];
  }
  async function ensurePdfjs() {
    if (!window.pdfjsLib) await loadScript('lib/pdf.min.js');
    if (!window.pdfjsWorker) await loadScript('lib/pdf.worker.min.js'); // comme PDF Joe : fonctionne aussi en file://
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  }
  async function ensureOcr() { if (!(window.Studio && Studio.ocr)) await loadScript('js/ocr.js'); }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

  const COLGAP = 1.5;      // écart (en hauteurs de police) qui sépare deux colonnes sur une ligne
  const BULLET = /^([•▪●◦■□➢►▶✓✔·\-–—*+]|«(?!.*»))\s+/;

  /* ================= 1. Fragments de texte d'une page ================= */
  async function textItems(pg, vp) {
    const tc = await pg.getTextContent();
    let rules = [];
    try { const ol = await pg.getOperatorList(); rules = extractRules(ol, vp); } catch (e) { console.warn('tracés illisibles', e); }
    const fonts = {};
    const fontOf = (id) => {
      if (fonts[id]) return fonts[id];
      let real = ''; try { if (pg.commonObjs.has(id)) real = pg.commonObjs.get(id).name || ''; } catch (e) { /* ignore */ }
      const s = real + ' ' + ((tc.styles[id] || {}).fontFamily || '');
      return (fonts[id] = { b: /bold|black|heavy|semibold|demi|[-,]bd\b/i.test(s), i: /italic|oblique|[-,]it\b/i.test(s), serif: /serif|times|garamond|georgia|cambria|bookman|roman|minion|palatino|century/i.test(s) && !/sans/i.test(s) });
    };
    const items = [];
    for (const it of tc.items) {
      const str = it.str; if (!str || !str.trim()) continue;
      const m = window.pdfjsLib.Util.transform(vp.transform, it.transform);
      if (Math.abs(m[1]) > Math.abs(m[0]) * 0.2 || m[0] <= 0) continue; // texte vertical ou retourné (tampons en marge)
      const size = Math.hypot(m[2], m[3]); if (size < 2) continue;
      const W = it.width > 0 ? it.width * vp.scale : size * 0.5 * str.length; const L = str.length; const f = fontOf(it.fontName);
      // les longues suites d'espaces séparent des colonnes à l'intérieur d'un même fragment
      const push = (a, b) => { const t = str.slice(a, b); const lead = t.length - t.trimStart().length; const tt = t.trim(); if (tt) items.push({ str: tt, x: m[4] + (W * (a + lead)) / L, w: (W * tt.length) / L, base: m[5], size, b: f.b, i: f.i, serif: f.serif }); };
      const re = /\s{3,}|\t/g; let last = 0, mm;
      while ((mm = re.exec(str))) { push(last, mm.index); last = mm.index + mm[0].length; }
      push(last, L);
    }
    return { items, rules };
  }

  /* Traits horizontaux et verticaux dessinés sur la page (bordures de tableaux), en coordonnées de la vue */
  function extractRules(ol, vp) {
    const OPS = window.pdfjsLib.OPS, U = window.pdfjsLib.Util;
    const PAINT = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
    const STROKE = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let pending = []; const out = [];
    const pageArea = vp.width * vp.height;
    const pt = (m, x, y) => U.applyTransform(U.applyTransform([x, y], m), vp.transform);
    const addLine = (a, b) => {
      const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
      if (dx < 1.5 && dy > 4) out.push({ v: true, x: (a[0] + b[0]) / 2, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
      else if (dy < 1.5 && dx > 4) out.push({ v: false, y: (a[1] + b[1]) / 2, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) });
    };
    const flush = (stroked) => {
      for (const p of pending) {
        if (p.line) { addLine(pt(p.m, p.line[0], p.line[1]), pt(p.m, p.line[2], p.line[3])); continue; }
        const [x, y, w, h] = p.rect; const c = [pt(p.m, x, y), pt(p.m, x + w, y), pt(p.m, x + w, y + h), pt(p.m, x, y + h)];
        const X0 = Math.min(...c.map((q) => q[0])), X1 = Math.max(...c.map((q) => q[0])), Y0 = Math.min(...c.map((q) => q[1])), Y1 = Math.max(...c.map((q) => q[1]));
        if (X1 - X0 < 3 && Y1 - Y0 > 4) out.push({ v: true, x: (X0 + X1) / 2, y0: Y0, y1: Y1 });
        else if (Y1 - Y0 < 3 && X1 - X0 > 4) out.push({ v: false, y: (Y0 + Y1) / 2, x0: X0, x1: X1 });
        else if ((stroked || (X1 - X0) * (Y1 - Y0) < pageArea * 0.3) && X1 - X0 > 4 && Y1 - Y0 > 4) { // cadre ou fond de cellule
          out.push({ v: false, y: Y0, x0: X0, x1: X1 }, { v: false, y: Y1, x0: X0, x1: X1 }, { v: true, x: X0, y0: Y0, y1: Y1 }, { v: true, x: X1, y0: Y0, y1: Y1 });
        }
      }
      pending = [];
    };
    const fns = ol.fnArray, args = ol.argsArray;
    for (let i = 0; i < fns.length && out.length < 4000; i++) {
      const fn = fns[i], a = args[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = U.transform(ctm, a);
      else if (fn === OPS.constructPath) {
        const ops = a[0], co = a[1]; let k = 0, cx = 0, cy = 0, sx = 0, sy = 0;
        for (const op of ops) {
          if (op === OPS.rectangle) { pending.push({ rect: co.slice(k, k + 4), m: ctm }); cx = sx = co[k]; cy = sy = co[k + 1]; k += 4; }
          else if (op === OPS.moveTo) { cx = sx = co[k++]; cy = sy = co[k++]; }
          else if (op === OPS.lineTo) { const x = co[k++], y = co[k++]; pending.push({ line: [cx, cy, x, y], m: ctm }); cx = x; cy = y; }
          else if (op === OPS.curveTo) { k += 6; cx = co[k - 2]; cy = co[k - 1]; }
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) { k += 4; cx = co[k - 2]; cy = co[k - 1]; }
          else if (op === OPS.closePath) { if (cx !== sx || cy !== sy) pending.push({ line: [cx, cy, sx, sy], m: ctm }); cx = sx; cy = sy; }
        }
      } else if (PAINT.has(fn)) flush(STROKE.has(fn));
      else if (fn === OPS.endPath) pending = [];
    }
    return out;
  }

  /* Grilles de tableaux : ensembles de traits qui se touchent, avec au moins 3 traits dans un sens */
  function findGrids(rules, pw, ph) {
    const n = rules.length; if (n < 4 || n > 3000) return [];
    const par = rules.map((_, i) => i); const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    const T = 2.5;
    const touch = (a, b) => {
      if (a.v === b.v) return a.v ? Math.abs(a.x - b.x) < T && a.y0 <= b.y1 + T && b.y0 <= a.y1 + T : Math.abs(a.y - b.y) < T && a.x0 <= b.x1 + T && b.x0 <= a.x1 + T;
      const V = a.v ? a : b, H = a.v ? b : a;
      return V.x >= H.x0 - T && V.x <= H.x1 + T && H.y >= V.y0 - T && H.y <= V.y1 + T;
    };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (touch(rules[i], rules[j])) par[find(i)] = find(j);
    const comps = {};
    rules.forEach((r, i) => { (comps[find(i)] = comps[find(i)] || []).push(r); });
    const uniq = (vals) => { const s = [...vals].sort((a, b) => a - b); const o = []; s.forEach((v) => { if (!o.length || v - o[o.length - 1] > 2.5) o.push(v); }); return o; };
    const grids = [];
    for (const rs of Object.values(comps)) {
      const V = rs.filter((r) => r.v), H = rs.filter((r) => !r.v);
      const xs = uniq(V.map((r) => r.x)), ys = uniq(H.map((r) => r.y));
      if (xs.length < 2 || ys.length < 2 || (xs.length < 3 && ys.length < 3)) continue;
      const x0 = Math.min(...rs.map((r) => (r.v ? r.x : r.x0))), x1 = Math.max(...rs.map((r) => (r.v ? r.x : r.x1)));
      const y0 = Math.min(...rs.map((r) => (r.v ? r.y0 : r.y))), y1 = Math.max(...rs.map((r) => (r.v ? r.y1 : r.y)));
      if ((x1 - x0) * (y1 - y0) > pw * ph * 0.75) continue; // cadre de page
      grids.push({ x0, x1, y0, y1, xs, ys, V, H });
    }
    return grids;
  }
  async function ocrItems(pg, vp, lang) {
    await ensureOcr();
    const k = Math.min(300 / 72, 3500 / Math.max(vp.width, vp.height));
    const v2 = pg.getViewport({ scale: k * vp.scale, rotation: vp.rotation });
    const c = document.createElement('canvas'); c.width = Math.round(v2.width); c.height = Math.round(v2.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: x, viewport: v2 }).promise;
    const r = await Studio.ocr.recognize(c, lang);
    const rules = imageRules(c, k);
    const vr = rules.filter((q) => q.v);
    const byLine = {};
    r.words.filter((w) => w.conf > 25).forEach((w) => {
      // traits de tableau lus comme des caractères : | [ ] ou ponctuation collée à une bordure
      let t = w.text.replace(/^[|[\]{}¦]+|[|[\]{}¦]+$/g, '');
      const x0 = w.x / k, x1 = (w.x + w.w) / k, h = w.h / k, ym = (w.y + w.h / 2) / k;
      const near = (x) => vr.some((q) => Math.abs(q.x - x) < h * 0.7 && q.y0 <= ym && q.y1 >= ym);
      if (near(x1)) t = t.replace(/[),.;:!|]+$/, (m) => (m === ')' && t.includes('(') ? m : ''));
      if (near(x0)) t = t.replace(/^[(|!]+/, (m) => (m === '(' && t.includes(')') ? m : ''));
      if (!t) return;
      (byLine[w.line] = byLine[w.line] || []).push({ ...w, text: t });
    });
    const items = [];
    const pct = (a, q) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(s2.length * q))]; };
    // taille de police estimée par ligne (lignes en capitales : hauteur des capitales ≈ 0,72 em),
    // puis ramenée à la taille courante quand l'écart est faible : les mesures OCR sont approximatives
    const lns = Object.values(byLine).map((ws) => { const caps = !/[a-zà-ÿ]/.test(ws.map((w) => w.text).join('')); return { ws, size: (pct(ws.map((w) => w.h), 0.85) * (caps ? 1.35 : 1.15)) / k, base: median(ws.map((w) => w.y + w.h)) / k }; });
    const M = median(lns.map((l) => l.size));
    for (const l of lns) {
      const size = l.size > M * 0.72 && l.size < M * 1.25 ? M : l.size;
      l.ws.forEach((w) => items.push({ str: w.text, x: w.x / k, w: w.w / k, base: l.base, size, b: false, i: false, serif: false }));
    }
    c.width = c.height = 0;
    return { items, rules };
  }

  /* Traits de tableau dans une image scannée : longues suites de pixels sombres, horizontales et verticales */
  function imageRules(c, k) {
    const W = c.width, H = c.height; let d;
    try { d = c.getContext('2d').getImageData(0, 0, W, H).data; } catch (e) { return []; }
    const dark = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < dark.length; i++, j += 4) dark[i] = d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11 < 175 ? 1 : 0;
    const out = [];
    const scan = (horiz) => {
      const nA = horiz ? H : W, nB = horiz ? W : H; const minLen = horiz ? Math.max(60, W * 0.05) : Math.max(60, H * 0.025);
      const runs = [];
      for (let a = 0; a < nA; a++) {
        let start = -1, last = -1;
        for (let b = 0; b <= nB; b++) {
          const on = b < nB && dark[horiz ? a * W + b : b * W + a];
          if (on) { if (start < 0) start = b; last = b; }
          else if (start >= 0 && b - last > 5) { if (last - start >= minLen) runs.push({ a, b0: start, b1: last }); start = -1; }
        }
      }
      // suites voisines (épaisseur du trait) regroupées
      const lines = [];
      for (const r of runs) {
        const L = lines.find((l) => r.a - l.a1 <= 1 && Math.min(l.b1, r.b1) - Math.max(l.b0, r.b0) > (r.b1 - r.b0) * 0.5);
        if (L) { L.a1 = r.a; L.b0 = Math.min(L.b0, r.b0); L.b1 = Math.max(L.b1, r.b1); } else lines.push({ a0: r.a, a1: r.a, b0: r.b0, b1: r.b1 });
      }
      const maxT = Math.max(6, (horiz ? H : W) * 0.003);
      for (const l of lines) {
        if (l.a1 - l.a0 > maxT) continue; // aplat sombre (photo, cachet), pas un trait
        const m = (l.a0 + l.a1) / 2 / k;
        if (horiz) out.push({ v: false, y: m, x0: l.b0 / k, x1: l.b1 / k }); else out.push({ v: true, x: m, y0: l.b0 / k, y1: l.b1 / k });
      }
    };
    scan(true); scan(false);
    return out.length > 3000 ? [] : out;
  }

  /* ================= 2. Lignes et segments ================= */
  function buildLines(items, vrules = []) {
    items.sort((a, b) => a.base - b.base || a.x - b.x);
    const lines = [];
    for (const it of items) {
      let line = null;
      for (let k = lines.length - 1; k >= 0 && k >= lines.length - 3; k--) { const L = lines[k]; if (Math.abs(L.base - it.base) <= 0.4 * Math.min(Math.max(L.size, it.size), 1.6 * Math.min(L.size, it.size))) { line = L; break; } }
      if (line) { line.items.push(it); if (it.str.length > 1) line.size = Math.max(line.size, it.size); } else lines.push({ base: it.base, size: it.size, items: [it] });
    }
    for (const L of lines) {
      L.items.sort((a, b) => a.x - b.x);
      const segs = []; let seg = null, prev = null;
      for (const it of L.items) {
        if (prev && it.str === prev.str && Math.abs(it.x - prev.x) < L.size * 0.3) continue; // texte doublé (faux gras)
        const gap = prev ? it.x - (prev.x + prev.w) : 0;
        const ruled = prev && vrules.some((r) => r.x > prev.x + prev.w - 1.5 && r.x < it.x + 1.5 && r.y0 - 2 <= L.base - L.size * 0.4 && r.y1 + 2 >= L.base - L.size * 0.4);
        if (!seg || gap > L.size * COLGAP || ruled) { seg = { x0: it.x, x1: it.x + it.w, runs: [], size: it.size }; segs.push(seg); }
        else if (gap > it.size * 0.12) addRun(seg, ' ', prev);
        addRun(seg, it.str, it);
        seg.x1 = Math.max(seg.x1, it.x + it.w); seg.size = Math.max(seg.size, it.size); prev = it;
      }
      segs.forEach((s) => { s.text = s.runs.map((r) => r.t).join('').trim(); const n = s.text.replace(/\s/g, '').length || 1; s.b = s.runs.filter((r) => r.b).reduce((a, r) => a + r.t.replace(/\s/g, '').length, 0) / n > 0.8; });
      L.segs = segs.filter((s) => s.text);
      L.x0 = L.segs.length ? L.segs[0].x0 : 0; L.x1 = L.segs.length ? L.segs[L.segs.length - 1].x1 : 0;
      L.text = L.segs.map((s) => s.text).join(' ');
      L.b = L.segs.every((s) => s.b);
    }
    return lines.filter((L) => L.segs.length);
  }
  function addRun(seg, t, it) {
    const last = seg.runs[seg.runs.length - 1];
    if (last && last.b === it.b && last.i === it.i && Math.abs(last.size - it.size) < 0.6) last.t += t;
    else seg.runs.push({ t, b: it.b, i: it.i, size: it.size, serif: it.serif });
  }

  /* ================= 3. Blocs : paragraphes, listes, tableaux ================= */
  function overlap(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0); }

  function makeTable(run, size) {
    const rows = run.filter((r) => !r.cont);
    const maxN = Math.max(...rows.map((r) => r.segs.length));
    // colonnes : intervalles des lignes les plus remplies, fusionnés lorsqu'ils se chevauchent
    let bands = [];
    const addBand = (s) => { bands.push({ x0: s.x0, x1: s.x1 }); bands.sort((a, b) => a.x0 - b.x0); };
    rows.filter((r) => r.segs.length === maxN).forEach((r) => r.segs.forEach((s) => {
      const hit = bands.filter((b) => overlap(b.x0, b.x1, s.x0, s.x1) > -size * 0.3);
      if (hit.length === 1) { hit[0].x0 = Math.min(hit[0].x0, s.x0); hit[0].x1 = Math.max(hit[0].x1, s.x1); } else if (!hit.length) addBand(s);
    }));
    if (bands.length < maxN) { bands = rows.find((r) => r.segs.length === maxN).segs.map((s) => ({ x0: s.x0, x1: s.x1 })); }
    // segments des autres lignes : ils élargissent la colonne qu'ils touchent, ou en créent une
    run.forEach((r) => r.segs.forEach((s) => {
      const hit = bands.filter((b) => overlap(b.x0, b.x1, s.x0, s.x1) > 0);
      if (hit.length === 1) { hit[0].x0 = Math.min(hit[0].x0, s.x0); hit[0].x1 = Math.max(hit[0].x1, s.x1); }
      else if (!hit.length && !r.cont) addBand(s);
    }));
    // deux colonnes devenues jointives après élargissement : fusion
    for (let i = 1; i < bands.length; i++) if (bands[i].x0 < bands[i - 1].x1 - size * 0.2 && !rows.some((r) => r.segs.filter((s) => overlap(s.x0, s.x1, bands[i - 1].x0, bands[i].x1) > 0).length >= 2)) { bands[i - 1].x1 = Math.max(bands[i - 1].x1, bands[i].x1); bands.splice(i--, 1); }
    const nc = bands.length;
    const colOf = (s) => {
      let best = -1, bo = -Infinity;
      bands.forEach((b, j) => { const o = overlap(b.x0, b.x1, s.x0, s.x1); const d = o > 0 ? o : -Math.min(Math.abs(s.x0 - b.x1), Math.abs(b.x0 - s.x1)); if (d > bo) { bo = d; best = j; } });
      let span = 1; while (best + span < nc && overlap(bands[best + span].x0, bands[best + span].x1, s.x0, s.x1) > size * 0.5) span++;
      return { c: best, span };
    };
    const grid = [];
    for (const r of run) {
      if (r.cont && grid.length) {
        const row = grid[grid.length - 1];
        r.segs.forEach((s) => { const { c } = colOf(s); const cell = row[c] || (row[c] = { runs: [], x0: s.x0, x1: s.x1 }); const wrapped = cell.x1 >= bands[c].x1 - size * 2; if (cell.runs.length) cell.runs.push({ t: wrapped ? ' ' : '\n', b: false, i: false, size: s.size }); cell.runs.push(...s.runs); cell.x1 = Math.max(cell.x1, s.x1); });
        continue;
      }
      const row = new Array(nc).fill(null);
      r.segs.forEach((s) => {
        const { c, span } = colOf(s);
        if (row[c]) { row[c].runs.push({ t: ' ', b: false, i: false, size: s.size }, ...s.runs); row[c].x1 = s.x1; return; }
        row[c] = { runs: [...s.runs], x0: s.x0, x1: s.x1, span };
        for (let k = 1; k < span; k++) row[c + k] = { skip: true };
      });
      grid.push(row);
    }
    grid.forEach((row) => row.forEach((cell, j) => {
      if (!cell || cell.skip) return;
      cell.text = cell.runs.map((x) => x.t).join('').replace(/[ \t]+/g, ' ').trim();
      const n = cell.text.replace(/\s/g, '').length || 1;
      cell.b = cell.runs.filter((x) => x.b).reduce((a, x) => a + x.t.replace(/\s/g, '').length, 0) / n > 0.8;
      const b = bands[j]; const bR = bands[j + (cell.span || 1) - 1].x1;
      cell.num = parseValue(cell.text);
      cell.align = cell.x1 > bR - size * 0.6 && cell.x0 > b.x0 + size * 0.8 ? 'right' : Math.abs((cell.x0 + cell.x1) / 2 - (b.x0 + bR) / 2) < size * 0.5 && cell.x0 > b.x0 + size ? 'center' : 'left';
    }));
    grid.forEach((row) => row.forEach((c) => { if (c && !c.skip && c.num && typeof c.num.v === 'number') c.align = 'right'; }));
    const numericCols = bands.filter((_, j) => { const cells = grid.slice(1).map((r) => r[j]).filter((c) => c && !c.skip && c.text); return cells.length && cells.filter((c) => c.num && typeof c.num.v === 'number').length / cells.length >= 0.5; }).length;
    const bordered = grid.length >= 2 && (numericCols > 0 || (grid.length >= 3 && nc >= 3));
    const x0 = bands[0].x0, x1 = bands[nc - 1].x1;
    const widths = bands.map((b, j) => (j < nc - 1 ? bands[j + 1].x0 - b.x0 : b.x1 - b.x0 + size));
    return { type: 'table', cols: bands.map((b) => ({ x0: b.x0, x1: b.x1 })), rows: grid, widths, x0, x1, bordered, header: bordered && grid[0].every((c) => !c || c.skip || !c.num || typeof c.num.v !== 'number') && grid.length > 2, base: run[run.length - 1].base, top: run[0].base - run[0].size * 1.1 };
  }

  // tableau à bordures : colonnes et rangées données par les traits du PDF, cellules fusionnées comprises
  function gridTable(run, g, size) {
    const xs = g.xs, ys = g.ys; const nc = xs.length - 1, nr = ys.length - 1;
    const colAt = (x) => { for (let j = 0; j < nc; j++) if (x < xs[j + 1]) return j; return nc - 1; };
    const rowAt = (y) => { for (let r = 0; r < nr; r++) if (y < ys[r + 1]) return r; return nr - 1; };
    // trait vertical présent à la frontière j (entre colonnes j-1 et j) pour la rangée r ?
    const vAt = (j, r) => { const ym = (ys[r] + ys[r + 1]) / 2; return g.V.some((v) => Math.abs(v.x - xs[j]) < 2.5 && v.y0 <= ym && v.y1 >= ym); };
    const colOfSeg = (s) => colAt((s.x0 + Math.min(s.x1, s.x0 + 40)) / 2);
    // rangées de la grille ; une rangée qui contient plusieurs lignes remplies sur plusieurs colonnes est
    // découpée ligne par ligne (tableau sans traits horizontaux entre les lignes)
    const byRow = Array.from({ length: nr }, () => []);
    run.forEach((ln) => byRow[rowAt(ln.base - ln.size * 0.35)].push(ln));
    const slots = [];
    byRow.forEach((lns, r) => {
      const multi = (ln) => new Set(ln.segs.map(colOfSeg)).size >= 2;
      if (lns.filter(multi).length >= 3) { let cur = null; lns.forEach((ln) => { if (!cur || multi(ln)) { cur = { r, lines: [] }; slots.push(cur); } cur.lines.push(ln); }); }
      else if (lns.length || ys[r + 1] - ys[r] >= size * 0.6) slots.push({ r, lines: lns });
    });
    const numLike = (t) => /^[\d\s.,%()+-]+$/.test(t.trim());
    const grid = slots.map(({ r, lines: lns }) => {
      const cells = new Array(nc).fill(null);
      for (const ln of lns) for (const s of ln.segs) {
        const c = colOfSeg(s);
        const cell = cells[c] || (cells[c] = { runs: [], x0: s.x0, x1: s.x1, lastBase: null });
        if (cell.runs.length) {
          const same = Math.abs(cell.lastBase - ln.base) < ln.size * 0.4; const wrapped = cell.x1 >= xs[c + 1] - size * 3;
          // deux montants l'un sous l'autre ne doivent jamais se coller en un seul nombre
          const nums = !same && numLike(cell.runs.map((x) => x.t).join('')) && numLike(s.text);
          cell.runs.push({ t: same || (wrapped && !nums) ? ' ' : '\n', b: false, i: false, size: s.size });
        }
        cell.runs.push(...s.runs.map((x) => ({ ...x }))); cell.x0 = Math.min(cell.x0, s.x0); cell.x1 = Math.max(cell.x1, s.x1); cell.lastBase = ln.base;
      }
      const row = new Array(nc).fill(null);
      for (let j = 0; j < nc; j++) {
        let span = 1; while (j + span < nc && !vAt(j + span, r)) span++;
        const parts = []; for (let k = j; k < j + span; k++) if (cells[k]) parts.push(cells[k]);
        const cell = parts.length ? parts.reduce((a, b) => ({ runs: [...a.runs, { t: ' ', b: false, i: false, size }, ...b.runs], x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1) })) : { runs: [], x0: xs[j], x1: xs[j] };
        cell.span = span; row[j] = cell; for (let k = 1; k < span; k++) row[j + k] = { skip: true };
        j += span - 1;
      }
      return row;
    });
    grid.forEach((row) => row.forEach((cell, j) => {
      if (!cell || cell.skip) return;
      cell.text = cell.runs.map((x) => x.t).join('').replace(/[ \t]+/g, ' ').trim();
      const n = cell.text.replace(/\s/g, '').length || 1;
      cell.b = cell.runs.filter((x) => x.b).reduce((a, x) => a + x.t.replace(/\s/g, '').length, 0) / n > 0.8;
      cell.num = parseValue(cell.text);
      const l = xs[j], rr = xs[j + (cell.span || 1)];
      cell.align = !cell.text ? 'left' : cell.x1 > rr - size * 1.2 && cell.x0 > l + size * 1.2 ? 'right' : Math.abs((cell.x0 + cell.x1) / 2 - (l + rr) / 2) < size * 0.6 && cell.x0 > l + size ? 'center' : 'left';
    }));
    grid.forEach((row) => row.forEach((c) => { if (c && !c.skip && c.num && typeof c.num.v === 'number') c.align = 'right'; }));
    const widths = xs.slice(1).map((x, j) => x - xs[j]);
    const head = grid[0] || [];
    return { type: 'table', cols: xs.slice(1).map((x, j) => ({ x0: xs[j], x1: x })), rows: grid, widths, x0: xs[0], x1: xs[nc], bordered: true, header: grid.length > 2 && head.every((c) => !c || c.skip || !c.num || typeof c.num.v !== 'number') && head.some((c) => c && c.b), base: g.y1, top: g.y0, grid: true };
  }

  function pageBlocks(lines, geo, body, grids = []) {
    const { L, R } = geo; const width = Math.max(1, R - L);
    const isRow = (ln) => ln.segs.length >= 2;
    // ligne située dans une grille de tableau tracée
    const gridOf = (ln) => grids.findIndex((g) => { const cx = (ln.segs[0].x0 + ln.segs[0].x1) / 2, cy = ln.base - ln.size * 0.35; return cx > g.x0 && cx < g.x1 && cy > g.y0 && cy < g.y1; });
    lines.forEach((ln) => { ln.grid = gridOf(ln); });
    const full = (ln) => ln.x0 <= L + ln.size * 2 && ln.x1 >= R - ln.size * 2;
    const blocks = []; let para = null;
    const close = () => { if (para) { blocks.push(finishPara(para, geo)); para = null; } };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (ln.grid >= 0) {
        const run = [ln]; let j = i + 1;
        while (j < lines.length && lines[j].grid === ln.grid) run.push(lines[j++]);
        close();
        const t = gridTable(run, grids[ln.grid], body); t.size = body;
        blocks.push(t); i = j - 1; continue;
      }
      if (isRow(ln)) {
        // suite de lignes à plusieurs colonnes : tableau (les lignes d'une seule colonne prises entre deux
        // lignes du tableau sont la suite d'une cellule)
        const run = [ln]; let j = i + 1;
        while (j < lines.length) {
          const nx = lines[j], pv = run[run.length - 1]; const dy = nx.base - pv.base;
          if (dy > Math.max(pv.size, nx.size) * 3.2) break;
          if (isRow(nx)) { run.push(nx); j++; continue; }
          const after = lines[j + 1];
          if (dy <= nx.size * 1.7 && after && isRow(after) && after.base - nx.base <= after.size * 3.2 && !full(nx)) { nx.cont = true; run.push(nx); j++; continue; }
          break;
        }
        // en-tête à deux colonnes (ministère / devise) : lignes courtes juste avant ou après, d'un seul côté
        const split0 = ln.segs[0].x1 + ln.size, split1 = ln.segs[1].x0 - ln.size;
        const oneSide = (x) => x.segs.length === 1 && x.grid < 0 && (x.x1 < split1 || x.x0 > split0) && !full(x);
        while (para && para.lines.length) {
          const pl = para.lines[para.lines.length - 1];
          if (!(oneSide(pl) && run[0].base - pl.base <= Math.max(pl.size, run[0].size) * 1.5)) break;
          para.lines.pop(); pl.cont = true; run.unshift(pl);
        }
        if (para && !para.lines.length) para = null;
        while (j < lines.length && oneSide(lines[j]) && lines[j].base - run[run.length - 1].base <= lines[j].size * 1.5) { lines[j].cont = true; run.push(lines[j++]); }
        close();
        const t = makeTable(run, body); t.size = body;
        blocks.push(t); i = j - 1; continue;
      }
      const bullet = BULLET.test(ln.text);
      if (para) {
        const last = para.lines[para.lines.length - 1]; const dy = ln.base - last.base;
        const join = dy > 0 && dy <= Math.max(last.size, ln.size) * 1.75 && Math.abs(ln.size - last.size) <= last.size * 0.15 && !bullet && last.b === ln.b
          && last.x1 >= R - Math.max(ln.size * 4, width * 0.12) && ln.x0 >= para.lines[0].x0 - ln.size * 2
          && (para.lines.length === 1 || Math.abs(ln.x0 - last.x0) < ln.size * 1.5);
        if (join) { para.lines.push(ln); continue; }
      }
      close();
      para = { lines: [ln], bullet };
    }
    close();
    // espace vertical réel entre blocs (en pt), pour reproduire les blancs du document
    let prevEnd = null;
    blocks.forEach((b) => { b.space = prevEnd == null ? 0 : Math.max(0, b.top - prevEnd - b.size * 0.3); prevEnd = b.base; });
    return blocks;
  }

  function finishPara(p, geo) {
    const { L, R } = geo; const width = Math.max(1, R - L); const mid = (L + R) / 2;
    const lines = p.lines; const first = lines[0]; const size = median(lines.map((l) => l.size));
    let align = 'left';
    if (lines.every((l) => Math.abs((l.x0 + l.x1) / 2 - mid) < Math.max(width * 0.04, l.size)) && first.x0 > L + width * 0.06) align = 'center';
    else if (lines.every((l) => l.x1 >= R - l.size * 1.2) && first.x0 > mid) align = 'right';
    else if (lines.length >= 2 && lines.slice(0, -1).every((l) => l.x1 >= R - l.size * 1.2)) align = 'justify';
    const restX = lines.length > 1 ? lines[1].x0 : first.x0;
    const indent = align === 'left' || align === 'justify' ? Math.max(0, restX - L) : 0;
    const firstIndent = align === 'left' || align === 'justify' ? first.x0 - restX : 0;
    // texte : lignes jointes, coupures de mots en fin de ligne recollées
    const runs = [];
    lines.forEach((l, k) => {
      const lr = []; l.segs.forEach((s, j) => { if (j) lr.push({ t: ' ', b: s.b, i: false, size: s.size }); lr.push(...s.runs.map((r) => ({ ...r }))); });
      if (k) {
        const prev = runs[runs.length - 1];
        if (prev && /[a-zà-ÿ]-$/i.test(prev.t) && /^[a-zà-ÿ]/.test((lr[0] || {}).t || '')) prev.t = prev.t.slice(0, -1);
        else runs.push({ t: ' ', b: lr[0] ? lr[0].b : false, i: false, size });
      }
      runs.push(...lr);
    });
    if (p.bullet && runs.length) runs[0].t = runs[0].t.replace(BULLET, '');
    // fusion des fragments de même style
    const merged = [];
    runs.forEach((r) => { const m = merged[merged.length - 1]; if (m && m.b === r.b && m.i === r.i && Math.abs(m.size - r.size) < 0.6) m.t += r.t; else merged.push(r); });
    merged.forEach((r) => { r.t = r.t.replace(/[ \t]{2,}/g, ' '); });
    if (merged.length) { merged[0].t = merged[0].t.replace(/^\s+/, ''); merged[merged.length - 1].t = merged[merged.length - 1].t.replace(/\s+$/, ''); }
    const text = merged.map((r) => r.t).join('');
    return { type: p.bullet ? 'li' : 'p', runs: merged.filter((r) => r.t), text, size, b: lines.every((l) => l.b), align, indent, firstIndent, top: first.base - first.size, base: lines[lines.length - 1].base, nLines: lines.length };
  }

  /* ================= 4. Analyse complète ================= */
  /* pjs : document pdf.js ; opts : { pages: [numéros 1..n], ocr: bool, lang, onProgress(i, n, info) } */
  async function analyze(pjs, opts = {}) {
    await ensurePdfjs();
    const nums = opts.pages && opts.pages.length ? opts.pages : Array.from({ length: pjs.numPages }, (_, i) => i + 1);
    const out = [];
    for (let k = 0; k < nums.length; k++) {
      const pg = await pjs.getPage(nums[k]);
      const vp = pg.getViewport({ scale: 1, rotation: (pg.rotate + (opts.rotations ? opts.rotations[k] || 0 : 0)) % 360 });
      if (opts.onProgress) opts.onProgress(k, nums.length, 'lecture');
      let got = await textItems(pg, vp); let ocr = false;
      if (got.items.reduce((a, it) => a + it.str.length, 0) < 8 && opts.ocr) {
        if (opts.onProgress) opts.onProgress(k, nums.length, 'ocr');
        got = await ocrItems(pg, vp, opts.lang || 'fra'); ocr = true;
      }
      const grids = findGrids(got.rules, vp.width, vp.height);
      out.push({ num: nums[k], w: vp.width, h: vp.height, lines: buildLines(got.items, grids.flatMap((g) => g.V)), grids, ocr, empty: !got.items.length });
      pg.cleanup();
    }
    // taille du corps de texte (la plus fréquente, pondérée par le nombre de caractères) et famille de police
    const hist = {}; let serif = 0, sans = 0;
    out.forEach((p) => p.lines.forEach((l) => l.segs.forEach((s) => s.runs.forEach((r) => { const n = r.t.replace(/\s/g, '').length; const key = Math.round(r.size * 2) / 2; hist[key] = (hist[key] || 0) + n; if (r.serif) serif += n; else sans += n; }))));
    const body = +(Object.entries(hist).sort((a, b) => b[1] - a[1])[0] || [11])[0] || 11;
    removeRepeated(out);
    for (const p of out) {
      const long = p.lines.filter((l) => l.text.length >= 15);
      const src = long.length >= 3 ? long : p.lines;
      const L = src.length ? Math.min(...src.map((l) => l.x0)) : p.w * 0.1; const R = src.length ? Math.max(...src.map((l) => l.x1)) : p.w * 0.9;
      p.geo = { L, R, top: p.lines.length ? p.lines[0].base - p.lines[0].size : p.h * 0.1 };
      p.blocks = pageBlocks(p.lines, p.geo, body, p.grids);
      p.blocks.forEach((b) => {
        if (b.type === 'table') return;
        if (b.size >= body * 1.7 && b.nLines <= 3) b.heading = 1; else if (b.size >= body * 1.3 && b.nLines <= 3) b.heading = 2;
      });
    }
    const first = out[0] || { w: 595.28, h: 841.89, geo: { L: 72, R: 523, top: 72 } };
    const margins = { l: clamp(Math.min(...out.map((p) => p.geo.L)), 28, 110), r: clamp(Math.min(...out.map((p) => p.w - p.geo.R)), 28, 110), t: clamp(Math.min(...out.map((p) => p.geo.top)), 28, 100), b: 50 };
    return { pages: out, body, serif: serif > sans, pageW: first.w, pageH: first.h, margins };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, isFinite(v) ? v : a));

  // en-têtes et pieds de page répétés (numéros de page…) : retirés de la conversion
  function removeRepeated(pages) {
    if (pages.length < 2) return;
    const count = {};
    const key = (l) => l.text.replace(/\d+/g, '#').toLowerCase() + '|' + Math.round(l.base / 6);
    const band = (l, p) => l.base < p.h * 0.16 || l.base > p.h * 0.9;
    pages.forEach((p) => { const seen = new Set(); p.lines.forEach((l) => { if (band(l, p)) { const k = key(l); if (!seen.has(k)) { seen.add(k); count[k] = (count[k] || 0) + 1; } } }); });
    const lim = Math.max(2, Math.ceil(pages.length * 0.5));
    const pageNo = (l, p) => l.base > p.h * 0.85 && /^(page\s*)?[-–]?\s*\d+\s*([-–]|\/\s*\d+|sur\s*\d+)?\s*$/i.test(l.text);
    const kept = new Set(); // une ligne répétée (titre, en-tête) est gardée sur la première page où elle paraît
    pages.forEach((p) => { p.lines = p.lines.filter((l) => { if (pageNo(l, p)) return false; if (!band(l, p) || count[key(l)] < lim || l.segs.length > 1) return true; const k = key(l); if (kept.has(k)) return false; kept.add(k); return true; }); });
  }

  /* ================= Valeurs (nombres français, dates, pourcentages) ================= */
  function parseValue(s) {
    let t = String(s).trim().replace(/[  ]/g, ' ');
    if (!t || t.length > 30) return null;
    let d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(t);
    if (d) { const y = d[3].length === 2 ? 2000 + +d[3] : +d[3]; const dt = Date.UTC(y, +d[2] - 1, +d[1]); if (+d[2] >= 1 && +d[2] <= 12 && +d[1] >= 1 && +d[1] <= 31) return { v: new Date(dt), fmt: 'dd/mm/yyyy' }; }
    let cur = '';
    const cm = /^(.*?\d)\s*(F\s?CFA|FCFA|XOF|F|€|EUR|\$|USD)\.?$/i.exec(t); if (cm) { t = cm[1]; cur = cm[2]; }
    const pct = /%$/.test(t); if (pct) t = t.slice(0, -1).trim();
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
    if (/^[-−–]\s?\d/.test(t)) { neg = true; t = t.replace(/^[-−–]\s?/, ''); } else if (/^\+\d/.test(t)) t = t.slice(1);
    if (/^0\d/.test(t)) return null; // codes, numéros de compte : gardés en texte
    let v; const grouped = /^\d{1,3}([ .,]\d{3})+/.test(t);
    if (/^\d{1,3}([ .]\d{3})+(,\d+)?$/.test(t)) v = parseFloat(t.replace(/[ .]/g, '').replace(',', '.'));
    else if (/^\d{1,3}(,\d{3}){2,}(\.\d+)?$/.test(t) || /^\d{1,3}(,\d{3})+\.\d+$/.test(t)) v = parseFloat(t.replace(/,/g, ''));
    else if (/^\d+(,\d+)?$/.test(t)) v = parseFloat(t.replace(',', '.'));
    else if (/^\d+\.\d+$/.test(t)) v = parseFloat(t);
    else return null;
    if (!isFinite(v)) return null;
    if (/^\d{9,}$/.test(t) && !cur) return null; // numéros de téléphone, d'identifiant
    const nd = Math.min(4, ((/[.,](\d+)$/.exec(t.replace(/[ .](\d{3})(?=[ .,]|$)/g, '$1')) || [, ''])[1]).length);
    if (neg) v = -v; if (pct) v = Math.round((v / 100) * 1e10) / 1e10;
    const dp = nd ? '.' + '0'.repeat(nd) : '';
    return { v, fmt: pct ? '0' + dp + '%' : cur ? '#,##0' + dp + ' "' + (/€|EUR/i.test(cur) ? '€' : /\$|USD/i.test(cur) ? '$' : 'F CFA') + '"' : grouped ? '#,##0' + dp : null };
  }

  /* ================= 5a. HTML pour Texte Joe ================= */
  function runsHtml(runs, body) {
    return runs.map((r) => {
      let h = esc(r.t).replace(/\n/g, '<br>');
      if (Math.abs(r.size - body) >= 0.6) h = `<span style="font-size:${Math.round(r.size * 2) / 2}pt">${h}</span>`;
      if (r.i) h = `<i>${h}</i>`; if (r.b) h = `<b>${h}</b>`;
      return h;
    }).join('') || '<br>';
  }
  function toHtml(model, { pageBreaks = true } = {}) {
    const { body } = model; const out = [];
    const font = model.serif ? "font-family:'Times New Roman',Times,serif;" : '';
    const contentW = model.pageW - model.margins.l - model.margins.r;
    model.pages.forEach((p, pi) => {
      if (pi && pageBreaks) out.push('<div class="pb"></div>');
      if (p.empty || !p.blocks.length) { out.push(`<p style="color:#888"><i>[Page ${p.num} : aucun texte${p.ocr ? ' reconnu' : ' — page scannée : activez la reconnaissance du texte (OCR)'}]</i></p>`); return; }
      let list = false;
      p.blocks.forEach((b) => {
        if (b.type !== 'li' && list) { out.push('</ul>'); list = false; }
        const mt = Math.round(Math.min(b.space || 0, 48));
        if (b.type === 'table') {
          const ws = b.widths.map((w) => w + 8); // marge intérieure des cellules de Texte Joe
          const total = ws.reduce((a, w) => a + w, 0);
          const pct = Math.min(100, Math.round((total / contentW) * 100));
          let h = `<table${b.bordered ? '' : ' class="nb"'} style="width:${Math.max(30, pct)}%${mt ? `;margin-top:${mt}pt` : ''}"><tbody>`;
          b.rows.forEach((row, ri) => {
            h += `<tr${b.header && ri === 0 ? ' class="hdr"' : ''}>`;
            row.forEach((c, j) => {
              if (c && c.skip) return;
              const st = []; if (ri === 0) st.push(`width:${Math.round((ws.slice(j, j + ((c && c.span) || 1)).reduce((a, x) => a + x, 0) / total) * 1000) / 10}%`);
              if (c && c.align !== 'left') st.push(`text-align:${c.align}`); if (font) st.push(font.replace(/;$/, ''));
              h += `<td${c && c.span > 1 ? ` colspan="${c.span}"` : ''}${st.length ? ` style="${st.join(';')}"` : ''}>${c ? runsHtml(c.runs, body) : '<br>'}</td>`;
            });
            h += '</tr>';
          });
          out.push(h + '</tbody></table>'); return;
        }
        const st = [];
        if (mt) st.push(`margin-top:${mt}pt`);
        st.push('margin-bottom:0');
        if (b.align !== 'left') st.push(`text-align:${b.align}`);
        if (b.type === 'p' && b.indent > 4) st.push(`margin-left:${Math.round(b.indent)}pt`);
        if (b.type === 'p' && Math.abs(b.firstIndent) > 4) st.push(`text-indent:${Math.round(b.firstIndent)}pt`);
        const inner = runsHtml(b.runs, body);
        if (b.type === 'li') { if (!list) { out.push('<ul>'); list = true; } out.push(`<li style="${font}">${inner}</li>`); return; }
        if (b.heading) { out.push(`<h${b.heading} style="${st.join(';')};color:#000;${font}font-size:${Math.round(b.size * 2) / 2}pt;font-weight:${b.b ? 700 : 400}">${runsHtml(b.runs.map((r) => ({ ...r, size: body, b: false })), body)}</h${b.heading}>`); return; }
        out.push(`<p style="${font}${st.join(';')}">${inner}</p>`);
      });
      if (list) out.push('</ul>');
    });
    return out.join('');
  }
  // document pour Texte Joe (mêmes champs que Texte Joe : page en mm)
  function toTexteDoc(model, title, opts = {}) {
    const mm = (pt) => Math.round((pt / 72) * 25.4);
    const land = model.pageW > model.pageH;
    const [a, b] = land ? [model.pageH, model.pageW] : [model.pageW, model.pageH];
    const size = Math.abs(a - 595) < 15 && Math.abs(b - 842) < 15 ? 'A4' : Math.abs(a - 420) < 15 && Math.abs(b - 595) < 15 ? 'A5' : Math.abs(a - 612) < 15 && Math.abs(b - 1008) < 15 ? 'Legal' : Math.abs(a - 612) < 15 ? 'Letter' : 'A4';
    return {
      id: Math.random().toString(36).slice(2, 10), title, html: toHtml(model, opts), updated: Date.now(),
      page: { size, orient: land ? 'l' : 'p', margins: { t: mm(model.margins.t), b: mm(model.margins.b), l: mm(model.margins.l), r: mm(model.margins.r) } },
      header: '', footer: '', pageNum: { pos: 'bottom-center', fmt: 'Page {n} sur {N}', show: false }, firstDiff: false, watermark: null,
    };
  }
  async function openInTexte(model, title, opts = {}) {
    const d = toTexteDoc(model, title, opts);
    await new Promise((res, rej) => { const r = indexedDB.open('texte-joe', 1); r.onupgradeneeded = () => { r.result.createObjectStore('docs'); r.result.createObjectStore('kv'); }; r.onsuccess = () => { const db = r.result; const tx = db.transaction(['docs', 'kv'], 'readwrite'); tx.objectStore('docs').put(d, d.id); tx.objectStore('kv').put(d.id, 'current'); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    location.href = 'texte.html';
  }

  /* ================= 5b. Fichier Word (.docx) ================= */
  async function toDocx(model, { title = 'Document', pageBreaks = true } = {}) {
    await loadScript('lib/docx.min.js');
    const D = window.docx; const { body } = model;
    const TW = 20; // twips par point
    const contentTw = Math.round((model.pageW - model.margins.l - model.margins.r) * TW);
    const font = model.serif ? 'Times New Roman' : 'Calibri';
    const runsOf = (runs, over = {}) => {
      const out = [];
      runs.forEach((r) => {
        const o = { bold: over.b != null ? over.b : r.b || undefined, italics: r.i || undefined };
        const sz = over.size || r.size; if (Math.abs(sz - body) >= 0.6) o.size = Math.round(sz * 2);
        r.t.split('\n').forEach((part, k) => { if (k) out.push(new D.TextRun({ break: 1 })); if (part) out.push(new D.TextRun({ text: part, ...o })); });
      });
      return out;
    };
    const ALIGN = { left: D.AlignmentType.LEFT, center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED };
    const children = [];
    let breakNext = false;
    model.pages.forEach((p, pi) => {
      if (pi && pageBreaks) breakNext = true;
      const blocks = p.empty || !p.blocks.length ? [{ type: 'p', runs: [{ t: `[Page ${p.num} : aucun texte${p.ocr ? ' reconnu' : ' — page scannée : activez la reconnaissance du texte (OCR)'}]`, i: true, size: body }], align: 'left', indent: 0, firstIndent: 0, space: 0 }] : p.blocks;
      blocks.forEach((b) => {
        const before = Math.round(Math.min(b.space || 0, 48) * TW);
        if (b.type === 'table') {
          if (breakNext) { children.push(new D.Paragraph({ pageBreakBefore: true, spacing: { after: 0 }, children: [] })); breakNext = false; }
          else if (before > 120) children.push(new D.Paragraph({ spacing: { after: 0, line: Math.max(240, before), lineRule: D.LineRuleType ? D.LineRuleType.EXACT : undefined }, children: [] }));
          const total = b.widths.reduce((a, w) => a + w, 0); const tw = Math.min(contentTw, Math.round((b.x1 - b.x0 + body) * TW));
          const colW = b.widths.map((w) => Math.round((w / total) * tw));
          const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }; const line = { style: D.BorderStyle.SINGLE, size: 4, color: '808080' };
          const bd = b.bordered ? line : none;
          const rows = b.rows.map((row, ri) => new D.TableRow({
            tableHeader: b.header && ri === 0,
            children: row.map((c, j) => {
              if (c && c.skip) return null;
              const span = (c && c.span) || 1; const w = colW.slice(j, j + span).reduce((a, x) => a + x, 0);
              return new D.TableCell({
                width: { size: w, type: D.WidthType.DXA }, columnSpan: span > 1 ? span : undefined,
                shading: b.header && ri === 0 ? { type: D.ShadingType.CLEAR, fill: 'D9E2F3', color: 'auto' } : undefined,
                margins: { top: 30, bottom: 30, left: 80, right: 80 },
                borders: { top: bd, bottom: bd, left: bd, right: bd },
                children: [new D.Paragraph({ alignment: ALIGN[(c && c.align) || 'left'], spacing: { after: 0 }, children: c ? runsOf(c.runs, b.header && ri === 0 ? { b: true } : {}) : [] })],
              });
            }).filter(Boolean),
          }));
          children.push(new D.Table({ rows, width: { size: tw, type: D.WidthType.DXA }, columnWidths: colW, layout: D.TableLayoutType.FIXED, borders: b.bordered ? undefined : { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none } }));
          return;
        }
        const o = { alignment: ALIGN[b.align] || ALIGN.left, spacing: { before, after: 0 }, children: b.heading ? runsOf(b.runs, { size: b.size }) : runsOf(b.runs) };
        if (breakNext) { o.pageBreakBefore = true; o.spacing.before = 0; breakNext = false; }
        if (b.type === 'li') o.numbering = { reference: 'bul', level: 0 };
        else {
          const ind = {}; if (b.indent > 4) ind.left = Math.round(b.indent * TW);
          if (b.firstIndent > 4) ind.firstLine = Math.round(b.firstIndent * TW); else if (b.firstIndent < -4) ind.hanging = Math.round(-b.firstIndent * TW);
          if (Object.keys(ind).length) o.indent = ind;
        }
        if (b.heading) o.heading = b.heading === 1 ? D.HeadingLevel.HEADING_1 : D.HeadingLevel.HEADING_2;
        children.push(new D.Paragraph(o));
      });
    });
    const headStyle = (id, name) => ({ id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { color: '000000', font }, paragraph: { spacing: { before: 0, after: 0 }, keepNext: true } });
    const doc = new D.Document({
      creator: 'Studio Joe', title,
      styles: { default: { document: { run: { font, size: Math.round(body * 2) }, paragraph: { spacing: { after: 0, line: 252 } } } }, paragraphStyles: [headStyle('Heading1', 'Heading 1'), headStyle('Heading2', 'Heading 2')] },
      numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
      sections: [{ properties: { page: { size: { width: Math.round(model.pageW * TW), height: Math.round(model.pageH * TW), orientation: model.pageW > model.pageH ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT }, margin: { top: Math.round(model.margins.t * TW), bottom: Math.round(model.margins.b * TW), left: Math.round(model.margins.l * TW), right: Math.round(model.margins.r * TW) } } }, children: children.length ? children : [new D.Paragraph('')] }],
    });
    return D.Packer.toBlob(doc);
  }

  /* ================= 5c. Classeur Excel (.xlsx) ================= */
  async function toXlsx(model, { sheetPerPage = false, tablesOnly = false } = {}) {
    await loadScript('lib/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook(); wb.creator = 'Studio Joe'; wb.created = new Date();
    const thin = { style: 'thin', color: { argb: 'FF808080' } };
    let ws = null, r = 0; const widths = {};
    const newSheet = (name) => { ws = wb.addWorksheet(name.slice(0, 31)); r = 0; };
    const fit = (c, txt) => { const k = ws.name + '|' + c; widths[k] = Math.max(widths[k] || 8, Math.min(60, String(txt).length * 1.1 + 2)); };
    const clean = (t) => t.replace(/\.{4,}|_{4,}|…{2,}/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (!sheetPerPage) newSheet('PDF');
    let anyTable = false, lastTable = null;
    model.pages.forEach((p) => {
      if (sheetPerPage) { newSheet('Page ' + p.num); lastTable = null; }
      p.blocks.forEach((b) => {
        if (b.type === 'table') {
          anyTable = true;
          const hk = b.rows[0].map((c) => (c && !c.skip ? c.text : '')).join('|');
          // tableau qui continue sur la page suivante : mêmes colonnes → à la suite, sans répéter l'en-tête
          let map = b.cols.map((_, j) => j), cont = false, sameHead = false;
          if (!sheetPerPage && lastTable && lastTable.r === r) {
            sameHead = lastTable.hk === hk;
            const m = b.cols.map((c) => { let best = -1, bo = 0; lastTable.cols.forEach((q, k) => { const o = Math.min(c.x1, q.x1) - Math.max(c.x0, q.x0); if (o > bo) { bo = o; best = k; } }); return best; });
            if (m.every((k) => k >= 0) && new Set(m).size === m.length) { cont = true; map = m; }
          }
          if (!cont && r && (tablesOnly || b.space > b.size || lastTable)) r++;
          b.rows.forEach((row, ri) => {
            if (cont && sameHead && ri === 0) return;
            r++;
            row.forEach((c, j0) => {
              const j = map[j0];
              if (!c || c.skip) { if (b.bordered && !c) ws.getCell(r, j + 1).border = { top: thin, bottom: thin, left: thin, right: thin }; return; }
              const cell = ws.getCell(r, j + 1); const t = clean(c.text);
              const val = parseValue(t);
              if (val && !(b.header && ri === 0)) { cell.value = val.v; if (val.fmt) cell.numFmt = val.fmt; fit(j + 1, t); }
              else { cell.value = t; fit(j + 1, t.split('\n').reduce((a, x) => (x.length > a.length ? x : a), '')); if (t.includes('\n')) cell.alignment = { wrapText: true, vertical: 'top' }; }
              if (c.b || (b.header && ri === 0)) cell.font = { bold: true };
              if (b.header && ri === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
              if (c.align === 'center' && !(cell.alignment && cell.alignment.wrapText)) cell.alignment = { horizontal: 'center' };
              if (b.bordered) cell.border = { top: thin, bottom: thin, left: thin, right: thin };
              if (c.span > 1) { try { ws.mergeCells(r, j + 1, r, j + c.span); } catch (e) { /* ignore */ } }
            });
          });
          lastTable = cont ? { ...lastTable, r } : { hk, cols: b.cols, r };
          return;
        }
        if (tablesOnly) return;
        lastTable = null; r++;
        const cell = ws.getCell(r, 1); const t = clean(b.text);
        const val = b.text.length < 30 ? parseValue(t) : null;
        if (val) { cell.value = val.v; if (val.fmt) cell.numFmt = val.fmt; } else cell.value = (b.type === 'li' ? '• ' : '') + t;
        if (b.b || b.heading) cell.font = { bold: true, size: b.heading ? Math.min(16, Math.round(b.size)) : undefined };
      });
    });
    if (!anyTable && tablesOnly) { newSheet('PDF'); ws.getCell(1, 1).value = 'Aucun tableau trouvé dans ce PDF.'; }
    for (const [k, w] of Object.entries(widths)) { const [name, c] = k.split('|'); const s = wb.getWorksheet(name); if (s) s.getColumn(+c).width = Math.max(8, Math.round(w)); }
    wb.eachSheet((s) => { if (!widths[s.name + '|1']) s.getColumn(1).width = Math.max(s.getColumn(1).width || 10, 12); });
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ================= Passage de fichier d'une application à l'autre ================= */
  const handoff = {
    db() { return new Promise((res, rej) => { const r = indexedDB.open('studio-handoff', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async put(key, name, blob) { const db = await this.db(); await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ name, blob }, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close(); },
    async take(key) { const db = await this.db(); const v = await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); const st = tx.objectStore('files'); const g = st.get(key); g.onsuccess = () => { st.delete(key); }; tx.oncomplete = () => res(g.result); tx.onerror = () => rej(tx.error); }); db.close(); return v || null; },
  };

  /* lecture directe d'un fichier PDF (Texte Joe, Tableur Joe) */
  async function analyzeFile(file, opts = {}) {
    await ensurePdfjs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let pjs;
    try { pjs = await window.pdfjsLib.getDocument({ data: bytes }).promise; }
    catch (e) {
      if (e && e.name === 'PasswordException') {
        const pw = window.prompt('Ce PDF est protégé. Mot de passe :'); if (!pw) throw new Error('mot de passe requis');
        pjs = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password: pw }).promise;
      } else throw e;
    }
    // pages scannées : OCR proposé automatiquement
    let needOcr = false;
    for (let i = 1; i <= Math.min(pjs.numPages, 3); i++) { const tc = await (await pjs.getPage(i)).getTextContent(); if (tc.items.reduce((a, it) => a + (it.str || '').trim().length, 0) < 8) needOcr = true; }
    const model = await analyze(pjs, { ocr: opts.ocr != null ? opts.ocr : needOcr, lang: opts.lang || (window.Studio && Studio.ocr ? Studio.ocr.savedLang() : 'fra'), onProgress: opts.onProgress });
    model.scanned = needOcr; pjs.destroy();
    return model;
  }

  window.Studio = window.Studio || {};
  window.Studio.pdfConvert = { analyze, analyzeFile, toHtml, toTexteDoc, openInTexte, toDocx, toXlsx, parseValue, handoff, ensurePdfjs };
})();
