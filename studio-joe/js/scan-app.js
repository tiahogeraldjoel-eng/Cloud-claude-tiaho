/* Studio Joe — Scan Joe : scanner de documents avec l'appareil photo.
   Détection automatique des bords (seuil d'Otsu, plus grande zone claire, enveloppe convexe, quadrilatère
   d'aire maximale), redressement par homographie, filtres « document » (correction de l'éclairage),
   gris, noir et blanc, PDF avec texte reconnu (OCR hors ligne), partage. Tout reste sur l'appareil. */
(function () {
  const { $, toast, download, pickFiles, modal, confirmBox } = Studio;
  const MAX_SRC = 3200, MAX_OUT = 2200;
  let pages = []; // { id, src: Blob, quad: [[x,y]×4], rot, filter, out: Blob, ow, oh }
  const uid = () => Math.random().toString(36).slice(2, 10);
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); }); return loaded[src]; }

  /* ================= Stockage (IndexedDB) ================= */
  const idb = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('scan-joe', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
    async get(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); },
    async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };
  const save = () => idb.set('pages', pages).catch((e) => console.warn(e));

  /* ================= Images ================= */
  async function bitmapOf(blob) { try { return await createImageBitmap(blob); } catch (e) { const img = await Studio.loadImage(URL.createObjectURL(blob)); return img; } }
  async function normalizeSource(blob) { // orientation EXIF appliquée, taille limitée
    const bm = await bitmapOf(blob); const w = bm.width, h = bm.height; const k = Math.min(1, MAX_SRC / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    return { canvas: c, blob: await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)) };
  }
  async function canvasFromBlob(blob) { const bm = await bitmapOf(blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); return c; }

  /* ================= Détection des bords ================= */
  function detectQuad(src) {
    const W0 = src.width, H0 = src.height; const k = Math.min(1, 400 / Math.max(W0, H0));
    const w = Math.max(8, Math.round(W0 * k)), h = Math.max(8, Math.round(H0 * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
    x.filter = 'blur(2px)'; x.drawImage(src, 0, 0, w, h); x.filter = 'none';
    const d = x.getImageData(0, 0, w, h).data; const g = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
    // seuil d'Otsu
    const hist = new Array(256).fill(0); for (const v of g) hist[v]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 128; const N = w * h;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = t; } }
    // plus grande zone claire connexe
    const lab = new Int32Array(N).fill(-1); let bestLab = -1, bestSize = 0; const stack = [];
    for (let i = 0; i < N; i++) {
      if (g[i] <= thr || lab[i] !== -1) continue;
      let size = 0; stack.push(i); lab[i] = i;
      while (stack.length) { const p = stack.pop(); size++; const px = p % w, py = (p / w) | 0; const nb = [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, py > 0 ? p - w : -1, py < h - 1 ? p + w : -1]; for (const q of nb) if (q >= 0 && lab[q] === -1 && g[q] > thr) { lab[q] = i; stack.push(q); } }
      if (size > bestSize) { bestSize = size; bestLab = i; }
    }
    if (bestSize < N * 0.12 || bestSize > N * 0.985) return null;
    // points de bord de la zone → enveloppe convexe
    const pts = [];
    for (let yy = 0; yy < h; yy++) { let first = -1, last = -1; for (let xx = 0; xx < w; xx++) if (lab[yy * w + xx] === bestLab) { if (first < 0) first = xx; last = xx; } if (first >= 0) { pts.push([first, yy], [last, yy]); } }
    const hull = convexHull(pts); if (hull.length < 4) return null;
    let poly = hull; let eps = 1; while (poly.length > 12 && eps < 50) { poly = rdpClosed(hull, eps); eps *= 1.5; }
    // quadrilatère d'aire maximale parmi les sommets
    let bestQ = null, bestA = 0; const n = poly.length;
    for (let a = 0; a < n; a++) for (let b2 = a + 1; b2 < n; b2++) for (let cc = b2 + 1; cc < n; cc++) for (let dd = cc + 1; dd < n; dd++) { const q = [poly[a], poly[b2], poly[cc], poly[dd]]; const A = Math.abs(area(q)); if (A > bestA) { bestA = A; bestQ = q; } }
    if (!bestQ || bestA < N * 0.1) return null;
    return orderQuad(bestQ.map(([px, py]) => [px / k, py / k]));
  }
  function convexHull(p) { p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } up.pop(); lo.pop(); return lo.concat(up); }
  function rdp(pts, eps) { if (pts.length < 3) return pts; const [a, b] = [pts[0], pts[pts.length - 1]]; let dmax = 0, idx = 0; for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], a, b); if (d > dmax) { dmax = d; idx = i; } } if (dmax > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps)); return [a, b]; }
  function rdpClosed(pts, eps) { const r = rdp(pts.concat([pts[0]]), eps); r.pop(); return r; }
  function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  const area = (q) => { let s = 0; for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length]; s += x1 * y2 - x2 * y1; } return s / 2; };
  function orderQuad(q) { // haut-gauche, haut-droite, bas-droite, bas-gauche
    const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
    const s = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    let start = 0, m = Infinity; s.forEach((p, i) => { if (p[0] + p[1] < m) { m = p[0] + p[1]; start = i; } });
    return [0, 1, 2, 3].map((i) => s[(start + i) % 4]);
  }
  const fullQuad = (w, h, inset = 0) => [[w * inset, h * inset], [w * (1 - inset), h * inset], [w * (1 - inset), h * (1 - inset)], [w * inset, h * (1 - inset)]];

  /* ================= Redressement (homographie) ================= */
  function homography(src, dst) { // dst → src
    const A = [], B = [];
    for (let i = 0; i < 4; i++) { const [u, v] = dst[i], [x, y] = src[i]; A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); B.push(x); A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); B.push(y); }
    const n = 8; for (let i = 0; i < n; i++) { let mx = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[mx][i])) mx = r; [A[i], A[mx]] = [A[mx], A[i]]; [B[i], B[mx]] = [B[mx], B[i]]; for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; B[r] -= f * B[i]; } }
    const h = new Array(8); for (let i = n - 1; i >= 0; i--) { let s = B[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * h[c]; h[i] = s / A[i][i]; }
    return h;
  }
  function warp(src, quad, maxOut = MAX_OUT) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let W = Math.max(d(quad[0], quad[1]), d(quad[3], quad[2])), H = Math.max(d(quad[0], quad[3]), d(quad[1], quad[2]));
    const k = Math.min(1.25, maxOut / Math.max(W, H)); W = Math.max(10, Math.round(W * k)); H = Math.max(10, Math.round(H * k));
    const h = homography(quad, [[0, 0], [W, 0], [W, H], [0, H]]);
    const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height); const S = sd.data, sw = src.width, sh = src.height;
    const out = document.createElement('canvas'); out.width = W; out.height = H; const od = out.getContext('2d').createImageData(W, H); const O = od.data;
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const den = h[6] * u + h[7] * v + 1; const x = (h[0] * u + h[1] * v + h[2]) / den, y = (h[3] * u + h[4] * v + h[5]) / den;
      const x0 = Math.floor(x), y0 = Math.floor(y); const o = (v * W + u) * 4;
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) { O[o] = O[o + 1] = O[o + 2] = 255; O[o + 3] = 255; continue; }
      const fx = x - x0, fy = y - y0; const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let ch = 0; ch < 3; ch++) O[o + ch] = (S[i00 + ch] * (1 - fx) + S[i10 + ch] * fx) * (1 - fy) + (S[i01 + ch] * (1 - fx) + S[i11 + ch] * fx) * fy;
      O[o + 3] = 255;
    }
    out.getContext('2d').putImageData(od, 0, 0);
    return out;
  }

  /* ================= Filtres ================= */
  function applyFilter(c, filter) {
    const W = c.width, H = c.height; const x = c.getContext('2d', { willReadFrequently: true });
    const id = x.getImageData(0, 0, W, H); const p = id.data;
    if (filter === 'color') { // niveaux automatiques
      const hist = new Array(256).fill(0); for (let i = 0; i < p.length; i += 16) hist[(p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29) >> 8]++;
      const tot = hist.reduce((a, b) => a + b, 0); let lo = 0, hi = 255, acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > tot * 0.01) { lo = i; break; } } acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > tot * 0.01) { hi = i; break; } }
      const sc = 255 / Math.max(20, hi - lo); for (let i = 0; i < p.length; i += 4) for (let ch = 0; ch < 3; ch++) p[i + ch] = Math.max(0, Math.min(255, (p[i + ch] - lo) * sc));
      x.putImageData(id, 0, 0); return c;
    }
    // fond estimé par un flou très fort (réduction puis agrandissement) : corrige ombres et éclairage
    const sw = Math.max(4, Math.round(W / 28)), shh = Math.max(4, Math.round(H / 28));
    const sm = document.createElement('canvas'); sm.width = sw; sm.height = shh; const sx = sm.getContext('2d', { willReadFrequently: true }); sx.imageSmoothingQuality = 'high'; sx.drawImage(c, 0, 0, sw, shh);
    // le fond est le plus clair : dilatation (maximum local) pour ignorer le texte
    const sd = sx.getImageData(0, 0, sw, shh); const s = sd.data; const cp = new Uint8ClampedArray(s);
    for (let yy = 0; yy < shh; yy++) for (let xx = 0; xx < sw; xx++) { const o = (yy * sw + xx) * 4; for (let ch = 0; ch < 3; ch++) { let m = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = Math.min(sw - 1, Math.max(0, xx + dx)), Y = Math.min(shh - 1, Math.max(0, yy + dy)); m = Math.max(m, cp[(Y * sw + X) * 4 + ch]); } s[o + ch] = m; } }
    sx.putImageData(sd, 0, 0);
    const bg = document.createElement('canvas'); bg.width = W; bg.height = H; const bx = bg.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingQuality = 'high'; bx.filter = 'blur(2px)'; bx.drawImage(sm, 0, 0, W, H);
    const B = bx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < p.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) { let v = (p[i + ch] / Math.max(40, B[i + ch])) * 255; v = (v - 45) * 1.22; p[i + ch] = v < 0 ? 0 : v > 255 ? 255 : v; }
      if (filter === 'gray' || filter === 'bw') { let L = (p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29) >> 8; if (filter === 'bw') L = L > 168 ? 255 : L < 120 ? 0 : (L - 120) * 5.3; p[i] = p[i + 1] = p[i + 2] = L; }
    }
    x.putImageData(id, 0, 0); return c;
  }
  function rotateCanvas(c, rot) {
    if (!rot) return c; const r = ((rot % 360) + 360) % 360; const o = document.createElement('canvas');
    o.width = r % 180 ? c.height : c.width; o.height = r % 180 ? c.width : c.height; const x = o.getContext('2d');
    x.translate(o.width / 2, o.height / 2); x.rotate((r * Math.PI) / 180); x.drawImage(c, -c.width / 2, -c.height / 2); return o;
  }
  async function processPage(pg, srcCanvas) {
    const src = srcCanvas || (await canvasFromBlob(pg.src));
    let c = warp(src, pg.quad); c = applyFilter(c, pg.filter); c = rotateCanvas(c, pg.rot);
    pg.out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88)); pg.ow = c.width; pg.oh = c.height;
    return c;
  }

  /* ================= Ajout de pages ================= */
  async function addBlobs(blobs, quads) {
    const ov = progress('Préparation des pages…');
    try {
      for (let i = 0; i < blobs.length; i++) {
        ov.set(i / blobs.length, `Page ${i + 1} / ${blobs.length}`);
        await new Promise((r) => setTimeout(r, 30));
        const { canvas, blob } = await normalizeSource(blobs[i]);
        let quad = quads && quads[i] ? quads[i].map(([x, y]) => [x * (canvas.width / quads[i].W), y * (canvas.height / quads[i].H)]) : detectQuad(canvas);
        const auto = !!quad; if (!quad) quad = fullQuad(canvas.width, canvas.height);
        const pg = { id: uid(), src: blob, quad, rot: 0, filter: 'doc', auto };
        await processPage(pg, canvas); pages.push(pg);
      }
    } finally { ov.close(); }
    render(); save();
    const last = pages[pages.length - 1];
    if (last && !last.auto) toast('Bords non détectés : touchez la page pour ajuster les coins', 5000);
  }
  function progress(title) {
    const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = `<div class="modal" style="width:min(420px,100%)"><header>${title}</header><div class="body"><div class="prog"><div></div></div><span class="hint"></span></div></div>`;
    document.body.appendChild(back);
    return { set: (u, t) => { back.querySelector('.prog > div').style.width = Math.round(u * 100) + '%'; if (t) back.querySelector('.hint').textContent = t; }, close: () => back.remove() };
  }

  /* ================= Liste des pages ================= */
  const urls = new Map();
  function thumbUrl(pg) { const old = urls.get(pg.id); if (old && old.blob === pg.out) return old.url; if (old) URL.revokeObjectURL(old.url); const url = URL.createObjectURL(pg.out); urls.set(pg.id, { blob: pg.out, url }); return url; }
  function render() {
    const g = $('#pages'); g.innerHTML = '';
    $('#empty').hidden = pages.length > 0;
    pages.forEach((pg, i) => {
      const d = document.createElement('div'); d.className = 'pg';
      d.innerHTML = `<img alt="Page ${i + 1}" src="${thumbUrl(pg)}"><div class="meta"><b>${i + 1}</b><span class="tools"><button data-m="-1" title="Avancer">◀</button><button data-m="1" title="Reculer">▶</button><button data-del title="Supprimer">✕</button></span></div>`;
      d.onclick = (e) => { const b = e.target.closest('button'); if (b) { e.stopPropagation(); if (b.dataset.del !== undefined) { pages.splice(i, 1); render(); save(); } else { const j = i + +b.dataset.m; if (j >= 0 && j < pages.length) { [pages[i], pages[j]] = [pages[j], pages[i]]; render(); save(); } } return; } editPage(i); };
      g.appendChild(d);
    });
  }

  /* ================= Éditeur d'une page ================= */
  async function editPage(i) {
    const pg = pages[i]; const src = await canvasFromBlob(pg.src);
    const st = { quad: pg.quad.map((p) => p.slice()), rot: pg.rot, filter: pg.filter };
    const ed = document.createElement('div'); ed.className = 'ed';
    ed.innerHTML = `<div class="bar"><b>Page ${i + 1}</b><span class="hint">Faites glisser les coins sur les bords du document</span><span style="flex:1"></span><button data-a="auto">Détection auto</button><button data-a="full">Page entière</button><button data-a="l">↺</button><button data-a="r">↻</button></div>
      <div class="area"><canvas></canvas></div>
      <div class="bar"><span>Rendu :</span>${[['doc', 'Document'], ['color', 'Couleur'], ['gray', 'Gris'], ['bw', 'Noir et blanc']].map(([k, l]) => `<button data-f="${k}" class="${st.filter === k ? 'on' : ''}">${l}</button>`).join('')}<span style="flex:1"></span><button data-a="del">Supprimer</button><button data-a="cancel">Annuler</button><button data-a="ok" style="background:#0b8a8a;border-color:#0b8a8a">✓ Valider</button></div>`;
    document.body.appendChild(ed);
    const area = ed.querySelector('.area'), cv = ed.querySelector('canvas'), ctx = cv.getContext('2d');
    let k = 1, ox = 0, oy = 0, dragI = -1, dragPt = null;
    const dpr = window.devicePixelRatio || 1;
    function layout() { const aw = area.clientWidth, ah = area.clientHeight; k = Math.min((aw - 40) / src.width, (ah - 40) / src.height); ox = (aw - src.width * k) / 2; oy = (ah - src.height * k) / 2; cv.width = aw * dpr; cv.height = ah * dpr; cv.style.width = aw + 'px'; cv.style.height = ah + 'px'; draw(); }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(src, ox, oy, src.width * k, src.height * k);
      const q = st.quad.map(([x, y]) => [ox + x * k, oy + y * k]);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.rect(ox, oy, src.width * k, src.height * k); q.forEach((p, j) => (j ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill('evenodd');
      ctx.strokeStyle = '#2ee6c8'; ctx.lineWidth = 2.5; ctx.beginPath(); q.forEach((p, j) => (j ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.stroke();
      q.forEach(([x, y]) => { ctx.fillStyle = 'rgba(46,230,200,.35)'; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill(); ctx.fillStyle = '#2ee6c8'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); });
      if (dragI >= 0 && dragPt) { // loupe
        const [sx, sy] = st.quad[dragI]; const R = 60, Z = 3; const lx = dragPt[0] < area.clientWidth / 2 ? area.clientWidth - R - 12 : R + 12, ly = R + 12;
        ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.clip(); ctx.fillStyle = '#000'; ctx.fillRect(lx - R, ly - R, 2 * R, 2 * R);
        ctx.drawImage(src, sx - R / (k * Z), sy - R / (k * Z), (2 * R) / (k * Z), (2 * R) / (k * Z), lx - R, ly - R, 2 * R, 2 * R);
        ctx.strokeStyle = '#2ee6c8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lx - 10, ly); ctx.lineTo(lx + 10, ly); ctx.moveTo(lx, ly - 10); ctx.lineTo(lx, ly + 10); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.stroke();
      }
    }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => { const p = pos(e); let best = -1, bd = 40; st.quad.forEach(([x, y], j) => { const dd = Math.hypot(ox + x * k - p[0], oy + y * k - p[1]); if (dd < bd) { bd = dd; best = j; } }); if (best >= 0) { dragI = best; dragPt = p; cv.setPointerCapture(e.pointerId); draw(); } });
    cv.addEventListener('pointermove', (e) => { if (dragI < 0) return; const p = pos(e); dragPt = p; st.quad[dragI] = [Math.max(0, Math.min(src.width, (p[0] - ox) / k)), Math.max(0, Math.min(src.height, (p[1] - oy) / k))]; draw(); });
    const up = () => { dragI = -1; dragPt = null; draw(); }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const ro = new ResizeObserver(layout); ro.observe(area);
    return new Promise((resolve) => {
      ed.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.f) { st.filter = b.dataset.f; ed.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); return; }
        const a = b.dataset.a;
        if (a === 'auto') { const q = detectQuad(src); if (q) { st.quad = q; draw(); } else toast('Bords non détectés : ajustez les coins à la main'); }
        if (a === 'full') { st.quad = fullQuad(src.width, src.height); draw(); }
        if (a === 'l' || a === 'r') { st.rot = (st.rot + (a === 'r' ? 90 : 270)) % 360; toast(`Rotation : ${st.rot}°`); }
        if (a === 'del') { if (await confirmBox('Supprimer cette page ?', 'Supprimer')) { pages.splice(i, 1); close(); render(); save(); } }
        if (a === 'cancel') close();
        if (a === 'ok') { b.disabled = true; b.textContent = 'Traitement…'; await new Promise((r) => setTimeout(r, 30)); Object.assign(pg, st); await processPage(pg, src); close(); render(); save(); }
      });
      function close() { ro.disconnect(); ed.remove(); resolve(); }
    });
  }

  /* ================= Caméra avec détection en direct ================= */
  async function camera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Caméra indisponible : utilisez « Prendre une photo »');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }); }
    catch (e) { return toast('Accès à la caméra refusé ou impossible : utilisez « Prendre une photo »', 6000); }
    const cam = document.createElement('div'); cam.className = 'cam';
    cam.innerHTML = '<div class="view"><video playsinline muted autoplay></video><canvas></canvas><div class="info">Cadrez le document — les bords s\'affichent en vert</div></div><div class="ctl"><button data-c="done">Terminé (<span>0</span>)</button><button class="shoot" data-c="shoot" aria-label="Capturer"></button><button data-c="torch">🔦</button></div>';
    document.body.appendChild(cam);
    const video = cam.querySelector('video'), ov = cam.querySelector('canvas'), ox = ov.getContext('2d'); video.srcObject = stream;
    let quad = null, timer = null, shots = 0, stable = 0, lastQ = null;
    const small = document.createElement('canvas');
    function tick() {
      if (!video.videoWidth) return;
      const vw = video.videoWidth, vh = video.videoHeight; const k = Math.min(1, 640 / Math.max(vw, vh)); small.width = Math.round(vw * k); small.height = Math.round(vh * k); small.getContext('2d').drawImage(video, 0, 0, small.width, small.height);
      const q = detectQuad(small); quad = q ? q.map(([x, y]) => [x / k, y / k]) : null;
      if (quad && lastQ && quad.every((p, i) => Math.hypot(p[0] - lastQ[i][0], p[1] - lastQ[i][1]) < vw * 0.015)) stable++; else stable = 0; lastQ = quad;
      const r = ov.getBoundingClientRect(); ov.width = r.width; ov.height = r.height; const s = Math.min(r.width / vw, r.height / vh); const dx = (r.width - vw * s) / 2, dy = (r.height - vh * s) / 2;
      ox.clearRect(0, 0, ov.width, ov.height);
      if (quad) { ox.strokeStyle = stable > 2 ? '#2ee6c8' : '#f0d050'; ox.lineWidth = 4; ox.fillStyle = 'rgba(46,230,200,.15)'; ox.beginPath(); quad.forEach(([x, y], i) => (i ? ox.lineTo(dx + x * s, dy + y * s) : ox.moveTo(dx + x * s, dy + y * s))); ox.closePath(); ox.fill(); ox.stroke(); }
      cam.querySelector('.info').textContent = quad ? (stable > 2 ? 'Document détecté : appuyez pour capturer' : 'Ne bougez plus…') : 'Cadrez le document sur un fond sombre';
    }
    timer = setInterval(tick, 350);
    const captured = [], quads = [];
    let torch = false;
    function stop() { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); cam.remove(); }
    await new Promise((resolve) => {
      cam.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        if (b.dataset.c === 'shoot') {
          const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0);
          captured.push(await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95))); quads.push(quad ? Object.assign(quad.map((p) => p.slice()), { W: c.width, H: c.height }) : null);
          shots++; cam.querySelector('[data-c="done"] span').textContent = shots; cam.querySelector('.view').animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 250 });
        }
        if (b.dataset.c === 'torch') { const tr = stream.getVideoTracks()[0]; torch = !torch; try { await tr.applyConstraints({ advanced: [{ torch }] }); } catch (err) { toast('Lampe non disponible sur cet appareil'); } }
        if (b.dataset.c === 'done') { stop(); resolve(); }
      });
    });
    if (captured.length) await addBlobs(captured, quads);
  }

  /* ================= PDF, texte, partage ================= */
  async function pageCanvas(pg) { return canvasFromBlob(pg.out); }
  async function buildPdf({ ocr, lang, fit }) {
    await loadScript('lib/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf; let doc = null; const ov = progress(ocr ? 'PDF avec texte reconnu…' : 'Création du PDF…');
    try {
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i]; ov.set(i / pages.length, `Page ${i + 1} / ${pages.length}`);
        const land = pg.ow > pg.oh;
        const [PW, PH] = fit === 'a4' ? (land ? [297, 210] : [210, 297]) : [pg.ow / 8, pg.oh / 8];
        if (!doc) doc = new jsPDF({ orientation: PW > PH ? 'landscape' : 'portrait', unit: 'mm', format: [PW, PH] }); else doc.addPage([PW, PH], PW > PH ? 'landscape' : 'portrait');
        const k = Math.min(PW / pg.ow, PH / pg.oh); const w = pg.ow * k, h = pg.oh * k, x0 = (PW - w) / 2, y0 = (PH - h) / 2;
        const url = await Studio.readAsDataURL(pg.out); doc.addImage(url, 'JPEG', x0, y0, w, h);
        if (ocr) {
          const c = await pageCanvas(pg); const r = await Studio.ocr.recognize(c, lang);
          doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
          for (const wd of r.words) {
            const t = wd.text.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[^\x20-\xff€]/g, '');
            if (!t.trim() || wd.conf < 20) continue;
            const hmm = wd.h * k; const pt = Math.max(2, (hmm / 0.3528) * 0.9); doc.setFontSize(pt);
            const tw = doc.getTextWidth(t) || 1; const sc = (wd.w * k) / tw;
            doc.text(t, x0 + wd.x * k, y0 + (wd.y + wd.h * 0.82) * k, { renderingMode: 'invisible', horizontalScale: Math.max(0.2, Math.min(5, sc)) });
          }
        }
      }
    } finally { ov.close(); }
    return doc.output('blob');
  }
  const fileName = () => `Scan ${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')} ${new Date().toTimeString().slice(0, 5).replace(':', 'h')}`;
  async function pdfDialog(share = false) {
    if (!pages.length) return toast('Scannez d\'abord une page');
    const r = await modal({
      title: share ? 'Partager en PDF' : 'Créer le PDF',
      body: `<div class="field"><label for="pfN">Nom du fichier</label><input type="text" id="pfN" value="${fileName()}"></div>
        <div class="field"><label for="pfF">Format des pages</label><select id="pfF"><option value="a4">A4</option><option value="img">Taille de la photo</option></select></div>
        <label class="row"><input type="checkbox" id="pfO" checked> Reconnaître le texte (PDF consultable et copiable, hors ligne)</label>
        <div class="field"><label for="pfL">Langue du texte</label><select id="pfL">${Studio.ocr.langOptions ? Studio.ocr.langOptions(Studio.ocr.savedLang()) : '<option value="fra">Français</option>'}</select></div>`,
      buttons: [{ label: 'Annuler', value: null }, { label: share ? 'Partager' : 'Créer', primary: true, value: (b) => ({ name: b.querySelector('#pfN').value.trim() || fileName(), fit: b.querySelector('#pfF').value, ocr: b.querySelector('#pfO').checked, lang: b.querySelector('#pfL').value }) }],
    });
    if (!r) return;
    if (r.ocr) Studio.ocr.saveLang(r.lang);
    try {
      const blob = await buildPdf(r); const name = r.name.replace(/[\\/:*?"<>|]+/g, '_') + '.pdf';
      if (share) {
        const file = new File([blob], name, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: r.name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
        toast('Partage impossible sur cet appareil : le PDF est téléchargé', 5000);
      }
      download(blob, name); toast('PDF créé');
    } catch (e) { console.error(e); toast('Erreur : ' + e.message, 7000); }
  }
  async function extractText() {
    if (!pages.length) return toast('Scannez d\'abord une page');
    const lang = Studio.ocr.savedLang(); const ov = progress('Reconnaissance du texte…'); const parts = [];
    try { for (let i = 0; i < pages.length; i++) { ov.set(i / pages.length, `Page ${i + 1} / ${pages.length}`); const r = await Studio.ocr.recognize(await pageCanvas(pages[i]), lang); parts.push(r.text); } } catch (e) { ov.close(); return toast('Reconnaissance impossible : ' + e.message, 7000); }
    ov.close();
    const text = parts.join('\n\n');
    const r = await modal({ title: 'Texte reconnu', wide: true, body: `<textarea id="ocrT" style="min-height:50vh;font:14px/1.5 var(--font-ui)">${text.replace(/</g, '&lt;')}</textarea><p class="hint">Relisez les chiffres et les noms propres.</p>`, buttons: [{ label: 'Fermer', value: null }, { label: 'Copier', value: 'copy' }, { label: '.txt', value: 'txt' }, { label: 'Ouvrir dans Texte Joe', primary: true, value: 'doc' }] });
    const val = document.getElementById('ocrT') ? document.getElementById('ocrT').value : text;
    if (r === 'copy') { try { await navigator.clipboard.writeText(text); toast('Texte copié'); } catch (e) { toast('Copie impossible'); } }
    if (r === 'txt') download(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName() + '.txt');
    if (r === 'doc') await openInTexteJoe(text); void val;
  }
  async function openInTexteJoe(text) {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    const id = Math.random().toString(36).slice(2, 10);
    await new Promise((res, rej) => { const r = indexedDB.open('texte-joe', 1); r.onupgradeneeded = () => { r.result.createObjectStore('docs'); r.result.createObjectStore('kv'); }; r.onsuccess = () => { const db = r.result; const tx = db.transaction(['docs', 'kv'], 'readwrite'); tx.objectStore('docs').put({ id, title: fileName(), html, updated: Date.now() }, id); tx.objectStore('kv').put(id, 'current'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    location.href = 'texte.html';
  }
  async function exportImages() {
    if (!pages.length) return toast('Scannez d\'abord une page');
    const zip = new window.JSZip(); pages.forEach((pg, i) => zip.file(`page-${String(i + 1).padStart(2, '0')}.jpg`, pg.out));
    download(await zip.generateAsync({ type: 'blob' }), fileName() + '.zip');
  }

  /* ================= Boutons ================= */
  $('#photoBtn').onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment'; inp.onchange = () => { if (inp.files.length) addBlobs([...inp.files]); }; inp.click(); };
  $('#camBtn').onclick = camera;
  $('#importBtn').onclick = async () => { const files = await pickFiles('image/*', true); if (files.length) addBlobs(files); };
  $('#pdfBtn').onclick = () => pdfDialog(false);
  $('#shareBtn').onclick = () => pdfDialog(true);
  $('#textBtn').onclick = extractText;
  $('#imgBtn').onclick = exportImages;
  $('#clearBtn').onclick = async () => { if (!pages.length) return; if (await confirmBox(`Effacer les ${pages.length} page(s) scannée(s) ?`, 'Tout effacer')) { pages = []; render(); save(); } };
  Studio.onDropFiles(document.body, (files) => { const imgs = files.filter((f) => f.type.startsWith('image/')); if (imgs.length) addBlobs(imgs); });
  Studio.onImport('scan', (fs) => { const imgs = fs.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name)); if (imgs.length) addBlobs(imgs); });

  window.ScanJoe = { get pages() { return pages; }, addBlobs, detectQuad, warp, applyFilter, buildPdf, render };
  document.addEventListener('DOMContentLoaded', async () => { try { const p = await idb.get('pages'); if (Array.isArray(p)) pages = p.filter((x) => x && x.out); } catch (e) { console.warn(e); } render(); });
})();
