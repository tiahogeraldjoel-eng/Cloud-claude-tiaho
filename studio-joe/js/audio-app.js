/* Studio Joe — Audio Joe : éditeur de son (équivalent Audition / Audacity).
   Forme d'onde avec zoom, sélection, couper / copier / coller, effets (volume, normalisation, fondus,
   réduction du bruit, raccourcir les silences, égaliseur, compresseur, vitesse sans changer la voix),
   enregistrement au micro avec sauvegarde de secours, export MP3 et WAV, partage, transcription.
   Tout se fait dans le navigateur ; rien n'est envoyé. */
(function () {
  const { $, $$, toast, download, pickFiles, modal, confirmBox, baseName, initMenus } = Studio;
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); });
    return loaded[src];
  }

  /* ================= État ================= */
  let A = null;          // { sr, ch: [Float32Array…] } — le son en cours
  let name = 'Enregistrement';
  let sel = null;        // { a, b } en échantillons, a < b
  let cursor = 0;        // position du curseur (échantillon)
  let clip = null;       // presse-papiers interne { sr, ch }
  let noiseProfile = null;
  const undoStack = [], redoStack = [];
  const UNDO_BUDGET = 320e6; // octets gardés pour l'annulation
  const view = { start: 0, spp: 1000 }; // premier échantillon visible, échantillons par pixel (CSS)
  let peaks = null;      // [{ min, max } par canal] par blocs de 256

  const len = () => (A ? A.ch[0].length : 0);
  const dur = () => (A ? len() / A.sr : 0);
  const nch = () => (A ? A.ch.length : 0);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  function fmtT(sec, cs = true) {
    sec = Math.max(0, sec); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    const ss = cs ? s.toFixed(2).padStart(5, '0') : pad(Math.floor(s));
    return (h ? `${h}:${pad(m)}` : `${m}`) + ':' + ss;
  }
  function parseT(t) {
    t = String(t).trim().replace(',', '.'); if (!t) return NaN;
    const p = t.split(':').map(Number); if (p.some((x) => !isFinite(x))) return NaN;
    return p.reduce((a, x) => a * 60 + x, 0);
  }
  const range = () => (sel ? [sel.a, sel.b] : [0, len()]);

  /* ================= Annuler / rétablir ================= */
  const snap = () => ({ ch: A ? A.ch : null, sr: A ? A.sr : 0, sel: sel && { ...sel }, cursor });
  function pushUndo() {
    undoStack.push(snap()); redoStack.length = 0;
    // budget mémoire : les plus anciennes étapes sont oubliées (les longs enregistrements pèsent lourd)
    const seen = new Set(A ? A.ch : []); let total = 0;
    for (let i = undoStack.length - 1; i >= 0; i--) {
      for (const c of undoStack[i].ch || []) if (!seen.has(c)) { seen.add(c); total += c.byteLength; }
      if (total > UNDO_BUDGET || undoStack.length - i > 60) { undoStack.splice(0, i + (total > UNDO_BUDGET ? 1 : 0)); break; }
    }
  }
  function restore(s) { A = s.ch ? { sr: s.sr, ch: s.ch } : null; sel = s.sel; cursor = Math.min(s.cursor, len()); changed(false); }
  function undo() { if (!undoStack.length) return; stop(); redoStack.push(snap()); restore(undoStack.pop()); toast('Annulé', 900); }
  function redo() { if (!redoStack.length) return; stop(); undoStack.push(snap()); restore(redoStack.pop()); toast('Rétabli', 900); }

  // modification : nouvelles copies des canaux (les anciennes restent dans l'historique)
  function edit(fn) { stop(); pushUndo(); fn(); changed(true); }
  function changed(save = true) {
    if (A && !len()) { A = null; }
    if (sel && (sel.b - sel.a < 2 || !A)) sel = null;
    if (sel) { sel.a = Math.max(0, Math.min(sel.a, len())); sel.b = Math.max(0, Math.min(sel.b, len())); }
    cursor = Math.max(0, Math.min(cursor, len()));
    computePeaks(); clampView(); render(); updateUI();
    if (save) autosave();
  }
  function concat(parts) { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; }
  function splice(a, b, insert /* [Float32Array par canal] ou null */) {
    A = { sr: A.sr, ch: A.ch.map((c, i) => concat([c.subarray(0, a), insert ? insert[Math.min(i, insert.length - 1)] : new Float32Array(0), c.subarray(b)])) };
  }
  function sliceCh(a, b) { return A.ch.map((c) => c.slice(a, b)); }
  // applique fn(canal, a, b) sur une copie de chaque canal
  function mapRange(fn) { const [a, b] = range(); A = { sr: A.sr, ch: A.ch.map((c, i) => { const o = c.slice(); fn(o, a, b, i); return o; }) }; }

  /* ================= Pics pour l'affichage ================= */
  const BLK = 256;
  function computePeaks() {
    if (!A) { peaks = null; return; }
    peaks = A.ch.map((c) => {
      const n = Math.ceil(c.length / BLK); const mn = new Float32Array(n), mx = new Float32Array(n);
      for (let k = 0; k < n; k++) { let lo = 1, hi = -1; const e = Math.min(c.length, (k + 1) * BLK); for (let i = k * BLK; i < e; i++) { const v = c[i]; if (v < lo) lo = v; if (v > hi) hi = v; } mn[k] = lo; mx[k] = hi; }
      return { mn, mx };
    });
  }

  /* ================= Affichage ================= */
  const waveC = $('#wave'), overC = $('#overview');
  let W = 0, H = 0, dpr = 1;
  function sizeCanvases() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    for (const c of [waveC, overC]) { const r = c.getBoundingClientRect(); c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr)); }
    const r = waveC.getBoundingClientRect(); W = r.width; H = r.height;
  }
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function colors() { const dark = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'; return { bg: dark ? '#15161a' : '#ffffff', wave: dark ? '#b58ad6' : '#7b3fa0', waveSel: dark ? '#e3cdf5' : '#4a1d68', sel: dark ? 'rgba(181,138,214,.22)' : 'rgba(123,63,160,.16)', grid: dark ? '#2a2c33' : '#e9e9ef', text: dark ? '#9ea3ad' : '#6b7080', cursor: css('--accent') || '#d9861c', play: '#2e7d32', mid: dark ? '#3a3d46' : '#d8d8e2' }; }
  function clampView() {
    if (!A) return;
    const minSpp = 1 / 16, maxSpp = Math.max(minSpp, len() / Math.max(50, W));
    view.spp = Math.max(minSpp, Math.min(maxSpp, view.spp));
    view.start = Math.max(0, Math.min(view.start, Math.max(0, len() - W * view.spp)));
    const zr = $('#zoomRange'); const t = Math.log(maxSpp / view.spp) / Math.log(Math.max(1.0001, maxSpp / minSpp)); zr.value = Math.round(t * 1000);
  }
  const xOf = (s) => (s - view.start) / view.spp;
  const sOf = (x) => Math.round(view.start + x * view.spp);
  function fit() { view.spp = len() / Math.max(50, W); view.start = 0; clampView(); }

  function drawWave(ctx, x0, w, h, top, s0, spp, c, col, colSel) {
    // c : index du canal ; dessine entre top et top+h
    const mid = top + h / 2, amp = h / 2 - 2;
    const P = peaks[c], data = A.ch[c];
    ctx.lineWidth = 1;
    if (spp < 1.5) { // très zoomé : on relie les échantillons
      ctx.strokeStyle = col; ctx.beginPath();
      const first = Math.max(0, Math.floor(s0)), last = Math.min(data.length - 1, Math.ceil(s0 + w * spp) + 1);
      for (let i = first; i <= last; i++) { const x = (i - s0) / spp, y = mid - data[i] * amp; if (i === first) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      if (spp < 0.25) { ctx.fillStyle = col; for (let i = first; i <= last; i++) { ctx.fillRect((i - s0) / spp - 1.5, mid - data[i] * amp - 1.5, 3, 3); } }
      return;
    }
    for (let px = 0; px < w; px++) {
      const a = s0 + px * spp, b = a + spp; if (b <= 0) continue; if (a >= data.length) break;
      let lo = 1, hi = -1;
      if (spp >= BLK) { const ka = Math.max(0, Math.floor(a / BLK)), kb = Math.min(P.mn.length, Math.ceil(b / BLK)); for (let k = ka; k < kb; k++) { if (P.mn[k] < lo) lo = P.mn[k]; if (P.mx[k] > hi) hi = P.mx[k]; } }
      else { const ia = Math.max(0, Math.floor(a)), ib = Math.min(data.length, Math.ceil(b)); for (let i = ia; i < ib; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (hi < lo) continue;
      const inSel = sel && a < sel.b && b > sel.a;
      ctx.fillStyle = inSel ? colSel : col;
      const y1 = mid - hi * amp, y2 = mid - lo * amp;
      ctx.fillRect(x0 + px, y1, 1, Math.max(1, y2 - y1));
    }
  }
  const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  let playPos = null;
  function render() {
    const C = colors();
    const ctx = waveC.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const oc = overC.getContext('2d'); const oW = overC.width / dpr, oH = overC.height / dpr; oc.setTransform(dpr, 0, 0, dpr, 0, 0);
    oc.fillStyle = C.bg; oc.fillRect(0, 0, oW, oH);
    $('#empty').hidden = !!A;
    if (!A) return;
    const RUL = 20; const n = nch(); const ch = (H - RUL) / n;
    // sélection
    if (sel) { const xa = Math.max(0, xOf(sel.a)), xb = Math.min(W, xOf(sel.b)); if (xb > 0 && xa < W) { ctx.fillStyle = C.sel; ctx.fillRect(xa, RUL, Math.max(1, xb - xa), H - RUL); } }
    // règle des temps
    const secPerPx = view.spp / A.sr; const step = STEPS.find((s) => s / secPerPx >= 90) || 7200;
    ctx.fillStyle = C.text; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'top';
    const t0 = view.start / A.sr, t1 = t0 + W * secPerPx;
    for (let t = Math.floor(t0 / step) * step; t <= t1; t += step) {
      const x = (t * A.sr - view.start) / view.spp; if (x < -50) continue;
      ctx.fillStyle = C.grid; ctx.fillRect(Math.round(x), RUL, 1, H - RUL);
      ctx.fillStyle = C.text; ctx.fillRect(Math.round(x), 12, 1, 8);
      ctx.fillText(step < 1 ? fmtT(t) : fmtT(t, false), x + 3, 2);
    }
    ctx.fillStyle = C.grid; ctx.fillRect(0, RUL - 1, W, 1);
    for (let c = 0; c < n; c++) {
      const top = RUL + c * ch;
      ctx.fillStyle = C.mid; ctx.fillRect(0, Math.round(top + ch / 2), W, 1);
      if (c) { ctx.fillStyle = C.grid; ctx.fillRect(0, Math.round(top), W, 1); }
      drawWave(ctx, 0, W, ch, top, view.start, view.spp, c, C.wave, C.waveSel);
    }
    // curseur et tête de lecture
    const xc = xOf(cursor); if (xc >= 0 && xc <= W) { ctx.fillStyle = C.cursor; ctx.fillRect(Math.round(xc) - 1, RUL, 2, H - RUL); ctx.beginPath(); ctx.moveTo(xc - 6, RUL); ctx.lineTo(xc + 6, RUL); ctx.lineTo(xc, RUL + 8); ctx.fill(); }
    if (playPos != null) { const xp = xOf(playPos); if (xp >= 0 && xp <= W) { ctx.fillStyle = C.play; ctx.fillRect(Math.round(xp) - 1, 0, 2, H); } }
    // vue d'ensemble
    const ospp = len() / oW;
    if (sel) { oc.fillStyle = C.sel; oc.fillRect(sel.a / ospp, 0, Math.max(1, (sel.b - sel.a) / ospp), oH); }
    for (let c = 0; c < n; c++) drawWave(oc, 0, oW, oH / n, (c * oH) / n, 0, ospp, c, C.wave, C.waveSel);
    oc.strokeStyle = C.cursor; oc.lineWidth = 2; oc.strokeRect(view.start / ospp + 1, 1, Math.max(4, (W * view.spp) / ospp - 2), oH - 2);
    if (playPos != null) { oc.fillStyle = C.play; oc.fillRect(playPos / ospp, 0, 2, oH); }
  }
  let rafPending = false;
  const renderSoon = () => { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; render(); }); };

  function updateUI() {
    $('#posLbl').textContent = A ? fmtT((playPos != null ? playPos : cursor) / A.sr) : '0:00.00';
    $('#selLbl').textContent = A && sel ? `${fmtT(sel.a / A.sr)} → ${fmtT(sel.b / A.sr)}  (${fmtT((sel.b - sel.a) / A.sr)})` : '—';
    $('#infoLbl').textContent = A ? `${fmtT(dur(), false)} · ${A.sr / 1000} kHz · ${nch() === 1 ? 'mono' : 'stéréo'}${clip ? ` · presse-papiers ${fmtT(clip.ch[0].length / clip.sr)}` : ''}` : 'Aucun son';
    $('#fileName').textContent = A ? name : '';
    $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length;
    $('#playBtn').textContent = playing ? '⏸' : '▶';
    $('#loopBtn').classList.toggle('on', loop);
    document.title = A ? `${name} — Audio Joe` : 'Audio Joe';
  }

  /* ================= Souris et doigts sur la forme d'onde ================= */
  const pointers = new Map(); let drag = null, pinch = null;
  waveC.addEventListener('pointerdown', (e) => {
    if (!A) return;
    waveC.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2) { // pincer pour zoomer
      const [p, q] = [...pointers.values()]; drag = null;
      pinch = { d: Math.abs(p.x - q.x) || 1, spp: view.spp, center: sOf((p.x + q.x) / 2), cx: (p.x + q.x) / 2 };
      return;
    }
    const x = e.offsetX; const tol = e.pointerType === 'touch' ? 18 : 6;
    if (sel && Math.abs(x - xOf(sel.a)) < tol) drag = { mode: 'edge', fixed: sel.b, x0: x };
    else if (sel && Math.abs(x - xOf(sel.b)) < tol) drag = { mode: 'edge', fixed: sel.a, x0: x };
    else if (e.offsetY < 20) drag = { mode: 'seek', x0: x };
    else drag = { mode: 'new', fixed: Math.max(0, Math.min(len(), sOf(x))), x0: x, moved: false };
  });
  waveC.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) { if (A) { const x = e.offsetX; waveC.style.cursor = sel && (Math.abs(x - xOf(sel.a)) < 6 || Math.abs(x - xOf(sel.b)) < 6) ? 'ew-resize' : 'text'; } return; }
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pointers.size === 2) {
      const [p, q] = [...pointers.values()]; const d = Math.abs(p.x - q.x) || 1; const cx = (p.x + q.x) / 2;
      view.spp = pinch.spp * (pinch.d / d); clampView(); view.start = pinch.center - cx * view.spp; clampView(); renderSoon(); return;
    }
    if (!drag) return;
    const s = Math.max(0, Math.min(len(), sOf(e.offsetX)));
    if (drag.mode === 'seek') { cursor = s; if (playing) playFrom(cursor); updateUI(); renderSoon(); return; }
    if (Math.abs(e.offsetX - drag.x0) > 3) drag.moved = true;
    if (drag.mode === 'edge' || drag.moved) { sel = { a: Math.min(drag.fixed, s), b: Math.max(drag.fixed, s) }; if (sel.b - sel.a < 1) sel = null; }
    autoScroll(e.offsetX); updateUI(); renderSoon();
  });
  function autoScroll(x) { if (x > W - 20) view.start += view.spp * 12; else if (x < 20) view.start -= view.spp * 12; clampView(); }
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (!drag) return;
    if (drag.mode === 'new' && !drag.moved) { sel = null; cursor = drag.fixed; if (playing) playFrom(cursor); }
    else if (sel) cursor = sel.a;
    drag = null; updateUI(); render();
  };
  waveC.addEventListener('pointerup', endPointer); waveC.addEventListener('pointercancel', endPointer);
  waveC.addEventListener('wheel', (e) => {
    if (!A) return; e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoomAt(e.offsetX, e.deltaY < 0 ? 1.25 : 0.8); return; }
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; view.start += d * view.spp; clampView(); renderSoon();
  }, { passive: false });
  waveC.addEventListener('dblclick', (e) => { // double-clic : sélectionne le passage entre deux silences
    if (!A) return; const s = sOf(e.offsetX); const r = phraseAround(s); if (r) { sel = r; cursor = r.a; updateUI(); render(); }
  });
  // vue d'ensemble : toucher ou glisser pour se déplacer
  let overDrag = false;
  const overMove = (e) => { if (!A) return; const oW = overC.width / dpr; const s = (e.offsetX / oW) * len(); view.start = s - (W * view.spp) / 2; clampView(); renderSoon(); };
  overC.addEventListener('pointerdown', (e) => { overDrag = true; overC.setPointerCapture(e.pointerId); overMove(e); });
  overC.addEventListener('pointermove', (e) => { if (overDrag) overMove(e); });
  overC.addEventListener('pointerup', () => { overDrag = false; });
  $('#zoomRange').addEventListener('input', (e) => {
    if (!A) return; const minSpp = 1 / 16, maxSpp = Math.max(minSpp, len() / Math.max(50, W));
    const center = view.start + (W * view.spp) / 2; view.spp = maxSpp / Math.pow(maxSpp / minSpp, e.target.value / 1000); view.start = center - (W * view.spp) / 2; clampView(); renderSoon();
  });
  function zoomAt(x, f) { const s = view.start + x * view.spp; view.spp /= f; clampView(); view.start = s - x * view.spp; clampView(); renderSoon(); }
  function zoomSel() { if (!sel) return toast('Sélectionnez d\'abord un passage'); const w = sel.b - sel.a; view.spp = (w * 1.1) / W; clampView(); view.start = sel.a - w * 0.05; clampView(); render(); }
  // passage entre deux silences autour d'un échantillon (double-clic)
  function phraseAround(s) {
    const win = Math.round(A.sr * 0.02); const thr = 0.02; const m = A.ch[0];
    const loud = (i) => { let e = 0; const a = Math.max(0, i - win), b = Math.min(len(), i + win); for (let k = a; k < b; k += 4) e = Math.max(e, Math.abs(m[k])); return e > thr; };
    let a = s, b = s; const lim = A.sr * 30; let quiet = 0;
    while (a > 0 && s - a < lim) { a -= win; if (!loud(a)) { if (++quiet > 15) break; } else quiet = 0; }
    quiet = 0; while (b < len() && b - s < lim) { b += win; if (!loud(b)) { if (++quiet > 15) break; } else quiet = 0; }
    a = Math.max(0, a); b = Math.min(len(), b); return b - a > win * 4 ? { a, b } : null;
  }

  /* ================= Lecture ================= */
  let actx = null, playing = false, loop = false, play = null;
  function audioCtx() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; }
  function bufferOf(a, b) { const ctx = audioCtx(); const buf = ctx.createBuffer(nch(), Math.max(1, b - a), A.sr); for (let c = 0; c < nch(); c++) buf.copyToChannel(A.ch[c].subarray(a, b), c); return buf; }
  function playFrom(from, to = len(), opts = {}) {
    stop(true); if (!A) return;
    from = Math.max(0, Math.min(from, len())); if (to - from < 10) { from = 0; }
    const ctx = audioCtx(); const CH = A.sr * 10; // par blocs de 10 s : supporte les très longs fichiers
    const lp = opts.loop && to - from < A.sr * 120;
    const p = { from, to, t0: ctx.currentTime + 0.05, nodes: [], next: from, loop: lp, timer: null };
    play = p; playing = true;
    if (lp) { const s = ctx.createBufferSource(); s.buffer = bufferOf(from, to); s.loop = true; s.connect(ctx.destination); s.start(p.t0); p.nodes.push(s); }
    else {
      const feed = () => {
        while (p.next < p.to && p.t0 + (p.next - p.from) / A.sr < ctx.currentTime + 4) {
          const e = Math.min(p.to, p.next + CH); const s = ctx.createBufferSource(); s.buffer = bufferOf(p.next, e); s.connect(ctx.destination);
          const at = p.t0 + (p.next - p.from) / A.sr; s.start(at); s._end = at + (e - p.next) / A.sr; p.nodes.push(s); p.next = e;
        }
        p.nodes = p.nodes.filter((s) => { if (s.buffer && ctx.currentTime > s._end) { try { s.disconnect(); } catch (e) { /* ignore */ } return false; } return true; });
      };
      feed(); p.timer = setInterval(feed, 500);
    }
    const tick = () => {
      if (play !== p) return;
      let pos = from + (ctx.currentTime - p.t0) * A.sr;
      if (p.loop) pos = from + ((pos - from) % (to - from + 1));
      if (pos >= to && !p.loop) { stop(); return; }
      playPos = Math.max(from, pos);
      // la vue suit la lecture
      if (xOf(playPos) > W - 30 || xOf(playPos) < 0) { view.start = playPos - W * view.spp * 0.1; clampView(); }
      updateUI(); render(); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick); updateUI();
  }
  function stop(silent) {
    if (play) { clearInterval(play.timer); play.nodes.forEach((s) => { try { s.stop(); s.disconnect(); } catch (e) { /* ignore */ } }); }
    play = null; playing = false; playPos = null;
    if (!silent) { updateUI(); render(); }
  }
  function togglePlay() {
    if (!A) return;
    if (playing) { const pos = playPos; stop(); if (pos != null && !sel) cursor = Math.round(pos); updateUI(); render(); return; }
    if (sel) playFrom(sel.a, sel.b, { loop }); else playFrom(cursor);
  }

  /* ================= Ouverture des fichiers ================= */
  async function mediaDuration(file) {
    return new Promise((res) => { const u = URL.createObjectURL(file); const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio'); el.preload = 'metadata'; el.onloadedmetadata = () => { const d = el.duration; URL.revokeObjectURL(u); res(isFinite(d) ? d : 0); }; el.onerror = () => { URL.revokeObjectURL(u); res(0); }; el.src = u; setTimeout(() => res(0), 4000); });
  }
  async function decodeFile(file, rate) {
    const d = rate ? 0 : await mediaDuration(file);
    // longs enregistrements : fréquence réduite pour tenir en mémoire sur un téléphone
    const sr = rate || (d > 3600 ? 16000 : d > 1200 ? 22050 : 44100);
    const buf = await file.arrayBuffer();
    let audio;
    try { audio = await new OfflineAudioContext(1, 1, sr).decodeAudioData(buf); }
    catch (e) { throw new Error('son illisible : format non pris en charge par le navigateur, ou fichier sans piste audio'); }
    let ch = []; for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) ch.push(audio.getChannelData(c).slice());
    // stéréo identique (ou très long fichier) : un seul canal
    if (ch.length === 2 && (d > 1200 || sameChannels(ch[0], ch[1]))) { const m = new Float32Array(ch[0].length); for (let i = 0; i < m.length; i++) m[i] = (ch[0][i] + ch[1][i]) / 2; ch = [m]; }
    return { sr: audio.sampleRate, ch };
  }
  function sameChannels(a, b) { let d = 0, e = 0; for (let i = 0; i < a.length; i += 97) { d += Math.abs(a[i] - b[i]); e += Math.abs(a[i]); } return d <= e * 0.02; }
  function resampleCh(src, from, to) {
    if (from === to) return src;
    const n = Math.round((src[0].length * to) / from); const r = from / to;
    return src.map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * r, k = Math.floor(x), f = x - k; o[i] = (c[k] || 0) * (1 - f) + (c[k + 1] || c[k] || 0) * f; } return o; });
  }
  // canaux d'un autre son mis au format du son ouvert (fréquence, nombre de canaux)
  function conform(other) {
    let ch = resampleCh(other.ch, other.sr, A.sr);
    if (ch.length < nch()) ch = [ch[0], ch[0]];
    else if (ch.length > nch()) { const m = new Float32Array(ch[0].length); for (let i = 0; i < m.length; i++) m[i] = (ch[0][i] + ch[1][i]) / 2; ch = [m]; }
    return ch;
  }
  async function openFile(f, mode) {
    stop();
    try {
      toast('Lecture du son…', 60000);
      const d = await decodeFile(f);
      if (mode === 'insert' && A) {
        edit(() => { const ins = conform(d); const at = sel ? sel.a : cursor; splice(at, sel ? sel.b : at, ins); sel = { a: at, b: at + ins[0].length }; cursor = at; });
        toast(`« ${f.name} » inséré`);
      } else {
        if (A) pushUndo(); A = d; name = baseName(f.name); sel = null; cursor = 0; computePeaks(); fit(); changed(true);
        toast(`« ${f.name} » ouvert : ${fmtT(dur(), false)}`);
      }
    } catch (e) { console.error(e); toast('Ouverture impossible : ' + e.message, 7000); }
  }
  async function openDialog() {
    const [f] = await pickFiles('audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.webm,.flac,.amr,.3gp,.mp4,.mov', false); if (!f) return;
    let mode = 'open';
    if (A) { mode = await modal({ title: 'Ouvrir « ' + f.name + ' »', body: '<p>Un son est déjà ouvert.</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer au curseur', value: 'insert' }, { label: 'Remplacer', primary: true, value: 'open' }] }); if (!mode) return; }
    openFile(f, mode);
  }
  Studio.onDropFiles($('#stage'), (files) => files[0] && openFile(files[0], A ? 'insert' : 'open'));
  Studio.onImport('audio', (fs) => openFile(fs[0], 'open'));

  /* ================= Édition ================= */
  const needSel = () => { if (!sel) { toast('Sélectionnez d\'abord un passage (glisser sur la forme d\'onde)'); return false; } return true; };
  function copy() { if (!A || !needSel()) return; clip = { sr: A.sr, ch: sliceCh(sel.a, sel.b) }; toast(`Copié : ${fmtT((sel.b - sel.a) / A.sr)}`, 1200); updateUI(); }
  function cut() { if (!A || !needSel()) return; clip = { sr: A.sr, ch: sliceCh(sel.a, sel.b) }; const a = sel.a; edit(() => { splice(sel.a, sel.b, null); sel = null; cursor = a; }); toast('Coupé', 900); }
  function del() { if (!A || !needSel()) return; const a = sel.a; edit(() => { splice(sel.a, sel.b, null); sel = null; cursor = a; }); }
  function trim() { if (!A || !needSel()) return; edit(() => { A = { sr: A.sr, ch: sliceCh(sel.a, sel.b) }; sel = null; cursor = 0; }); fit(); render(); toast('Seule la sélection est gardée'); }
  function paste() {
    if (!clip) return toast('Le presse-papiers est vide : copiez ou coupez d\'abord un passage');
    if (!A) { edit(() => { A = { sr: clip.sr, ch: clip.ch.map((c) => c.slice()) }; cursor = 0; }); fit(); render(); return; }
    const ins = conform(clip); const at = sel ? sel.a : cursor;
    edit(() => { splice(at, sel ? sel.b : at, ins); sel = { a: at, b: at + ins[0].length }; cursor = at; });
  }
  function dup() { if (!A || !needSel()) return; const ins = sliceCh(sel.a, sel.b); const at = sel.b; edit(() => { splice(at, at, ins); sel = { a: at, b: at + ins[0].length }; }); }
  async function insertSilence() {
    const v = await modal({ title: 'Insérer un silence', body: '<div class="field"><label for="silD">Durée (secondes)</label><input id="silD" type="number" min="0.1" max="600" step="0.1" value="1"></div>', buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => +b.querySelector('#silD').value }] });
    if (!v || v <= 0) return;
    if (!A) { A = { sr: 44100, ch: [new Float32Array(0)] }; }
    const n = Math.round(v * A.sr); const at = sel ? sel.a : cursor;
    edit(() => { splice(at, sel ? sel.b : at, A.ch.map(() => new Float32Array(n))); sel = { a: at, b: at + n }; });
  }
  async function selRange() {
    if (!A) return;
    const [a, b] = sel ? [sel.a, sel.b] : [cursor, len()];
    const v = await modal({ title: 'Sélectionner un passage', body: `<div class="row"><div class="field" style="flex:1"><label for="sA">Début (min:s)</label><input id="sA" value="${fmtT(a / A.sr)}"></div><div class="field" style="flex:1"><label for="sB">Fin (min:s)</label><input id="sB" value="${fmtT(b / A.sr)}"></div></div><p class="hint">Exemples : 1:30 ou 90 ou 1:02:15.5. Durée totale : ${fmtT(dur())}.</p>`, buttons: [{ label: 'Annuler', value: null }, { label: 'Sélectionner', primary: true, value: (bx) => [parseT(bx.querySelector('#sA').value), parseT(bx.querySelector('#sB').value)] }] });
    if (!v || !isFinite(v[0]) || !isFinite(v[1])) return;
    const sa = Math.max(0, Math.min(len(), Math.round(Math.min(v[0], v[1]) * A.sr))), sb = Math.max(0, Math.min(len(), Math.round(Math.max(v[0], v[1]) * A.sr)));
    sel = sb - sa > 1 ? { a: sa, b: sb } : null; cursor = sa; zoomSel(); updateUI();
  }

  /* ================= Effets ================= */
  const scope = () => (sel ? 'la sélection' : 'tout le son');
  function peakOf(a, b) { let p = 0; for (const c of A.ch) for (let i = a; i < b; i++) { const v = Math.abs(c[i]); if (v > p) p = v; } return p; }
  function applyGain(db) { const g = Math.pow(10, db / 20); edit(() => mapRange((c, a, b) => { for (let i = a; i < b; i++) c[i] = Math.max(-1, Math.min(1, c[i] * g)); })); }
  async function gainDialog() {
    if (!A) return;
    const [a, b] = range(); const pk = peakOf(a, b); const maxUp = pk > 0 ? -20 * Math.log10(pk) : 0;
    const v = await modal({ title: 'Volume de ' + scope(), body: `<div class="fxgrid"><label for="gDb">Gain</label><input id="gDb" type="range" min="-30" max="30" step="0.5" value="${Math.min(30, Math.max(0, Math.round(maxUp * 2) / 2))}"><output id="gOut"></output></div><p class="hint">Niveau maximal actuel : ${pk ? (20 * Math.log10(pk)).toFixed(1) : '−∞'} dB. Au-delà de +${maxUp.toFixed(1)} dB, les crêtes sont écrêtées (son saturé).</p>`, onOpen: (bx) => { const r = bx.querySelector('#gDb'), o = bx.querySelector('#gOut'); const u = () => { o.textContent = (r.value > 0 ? '+' : '') + r.value + ' dB'; o.style.color = +r.value > maxUp + 0.01 ? '#c62828' : ''; }; r.oninput = u; u(); }, buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (bx) => +bx.querySelector('#gDb').value }] });
    if (v == null || !v) return; applyGain(v); toast(`Volume ${v > 0 ? '+' : ''}${v} dB`);
  }
  function normalize(target = -1) {
    if (!A) return; const [a, b] = range(); const pk = peakOf(a, b); if (!pk) return toast('Passage silencieux');
    const g = Math.pow(10, target / 20) / pk; edit(() => mapRange((c, x, y) => { for (let i = x; i < y; i++) c[i] *= g; }));
    toast(`Normalisé à ${target} dB (${g >= 1 ? '+' : ''}${(20 * Math.log10(g)).toFixed(1)} dB)`);
  }
  function fade(dir) {
    if (!A) return; let [a, b] = range();
    if (!sel) { const n = Math.min(len(), Math.round(A.sr * 3)); if (dir > 0) b = n; else a = len() - n; }
    edit(() => mapRange((c) => { const n = b - a; for (let i = 0; i < n; i++) { const t = i / n; const g = dir > 0 ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2); c[a + i] *= g * g; } }));
    toast(dir > 0 ? `Fondu en ouverture${sel ? '' : ' (3 premières secondes)'}` : `Fondu en fermeture${sel ? '' : ' (3 dernières secondes)'}`);
  }
  function mute() { if (!A || !needSel()) return; edit(() => mapRange((c, a, b) => c.fill(0, a, b))); }
  function reverse() { if (!A) return; edit(() => mapRange((c, a, b) => { c.subarray(a, b).reverse(); })); }
  function mono() {
    if (!A) return; if (nch() === 1) return toast('Le son est déjà en mono');
    edit(() => { const [l, r] = A.ch; const m = new Float32Array(l.length); for (let i = 0; i < m.length; i++) m[i] = (l[i] + r[i]) / 2; A = { sr: A.sr, ch: [m] }; });
    toast('Converti en mono (fichier deux fois plus léger)');
  }
  // traitements du navigateur (filtres, compresseur) appliqués hors temps réel sur la plage
  async function renderGraph(build, label) {
    if (!A) return; const [a, b] = range(); const n = b - a; if (n < 2) return;
    toast(label + '…', 30000);
    const ctx = new OfflineAudioContext(nch(), n, A.sr); const buf = ctx.createBuffer(nch(), n, A.sr);
    for (let c = 0; c < nch(); c++) buf.copyToChannel(A.ch[c].subarray(a, b), c);
    const src = ctx.createBufferSource(); src.buffer = buf; const out = build(ctx, src); out.connect(ctx.destination); src.start();
    const res = await ctx.startRendering();
    edit(() => { A = { sr: A.sr, ch: A.ch.map((c, i) => { const o = c.slice(); const r = res.getChannelData(i); for (let k = 0; k < n; k++) o[a + k] = Math.max(-1, Math.min(1, r[k])); return o; }) }; });
    toast(label + ' : appliqué', 1500);
  }
  const biquad = (ctx, type, f, gain = 0, q = 0.707) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.gain.value = gain; x.Q.value = q; return x; };
  const chain = (src, ...nodes) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } return n; };
  const voice = () => renderGraph((ctx, src) => chain(src, biquad(ctx, 'highpass', 85), biquad(ctx, 'lowshelf', 220, -2), biquad(ctx, 'peaking', 3000, 4, 1), biquad(ctx, 'highshelf', 9000, -1)), 'Voix plus claire');
  const highpass = () => renderGraph((ctx, src) => chain(src, biquad(ctx, 'highpass', 110, 0, 0.9), biquad(ctx, 'highpass', 110, 0, 0.6)), 'Basses coupées');
  async function eqDialog() {
    if (!A) return;
    const v = await modal({ title: 'Graves et aigus — ' + scope(), body: `<div class="fxgrid"><label for="eqL">Graves</label><input id="eqL" type="range" min="-15" max="15" step="1" value="0"><output id="eqLo">0 dB</output><label for="eqM">Médiums (voix)</label><input id="eqM" type="range" min="-15" max="15" step="1" value="0"><output id="eqMo">0 dB</output><label for="eqH">Aigus</label><input id="eqH" type="range" min="-15" max="15" step="1" value="0"><output id="eqHo">0 dB</output></div><p class="hint">Astuce : « Écouter » applique le réglage en direct pendant la lecture.</p>`,
      onOpen: (bx) => { for (const k of ['L', 'M', 'H']) { const r = bx.querySelector('#eq' + k), o = bx.querySelector(`#eq${k}o`); r.oninput = () => { o.textContent = (r.value > 0 ? '+' : '') + r.value + ' dB'; }; } },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (bx) => ['L', 'M', 'H'].map((k) => +bx.querySelector('#eq' + k).value) }] });
    if (!v || v.every((x) => !x)) return;
    renderGraph((ctx, src) => chain(src, biquad(ctx, 'lowshelf', 250, v[0]), biquad(ctx, 'peaking', 1500, v[1], 0.8), biquad(ctx, 'highshelf', 5000, v[2])), 'Égaliseur');
  }
  async function compressDialog() {
    if (!A) return;
    const v = await modal({ title: 'Niveau régulier — ' + scope(), body: `<p>Rapproche les passages faibles et forts : utile quand certaines personnes parlent loin du micro.</p><div class="field"><label for="cmpS">Intensité</label><select id="cmpS"><option value="light">Légère</option><option value="med" selected>Moyenne (réunion, interview)</option><option value="strong">Forte (voix très inégales)</option></select></div>`, buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (bx) => bx.querySelector('#cmpS').value }] });
    if (!v) return;
    const P = { light: [-18, 2.5], med: [-26, 4], strong: [-34, 8] }[v];
    await renderGraph((ctx, src) => { const c = ctx.createDynamicsCompressor(); c.threshold.value = P[0]; c.ratio.value = P[1]; c.knee.value = 8; c.attack.value = 0.005; c.release.value = 0.2; return chain(src, c); }, 'Compresseur');
    normalize(-1);
  }

  /* --- FFT (radix 2) pour la réduction du bruit --- */
  function makeFFT(N) {
    const lv = Math.log2(N); const rev = new Uint32Array(N); for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < lv; b++) r |= ((i >> b) & 1) << (lv - 1 - b); rev[i] = r; }
    const cos = new Float32Array(N / 2), sin = new Float32Array(N / 2); for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / N); sin[i] = Math.sin((2 * Math.PI * i) / N); }
    return function fft(re, im, inv) {
      for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= N; size <<= 1) {
        const half = size >> 1, step = N / size;
        for (let i = 0; i < N; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = cos[k], wi = inv ? sin[k] : -sin[k]; const a = i + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
      if (inv) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
    };
  }
  const NF = 2048, HOP = 512;
  const fft = makeFFT(NF);
  const win = new Float32Array(NF).map((_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NF)));
  function spectrumFrames(x, a, b, cb) { // cb(re, im, frameStart)
    const re = new Float32Array(NF), im = new Float32Array(NF);
    for (let s = a - NF + HOP; s < b; s += HOP) { for (let i = 0; i < NF; i++) { const k = s + i; re[i] = k >= a && k < b ? x[k] * win[i] : 0; im[i] = 0; } fft(re, im, false); cb(re, im, s); }
  }
  function noiseFrom(x, a, b, quietest) {
    const H2 = NF / 2 + 1; const frames = [];
    spectrumFrames(x, a, b, (re, im) => { const m = new Float32Array(H2); let e = 0; for (let k = 0; k < H2; k++) { m[k] = Math.hypot(re[k], im[k]); e += m[k]; } frames.push({ m, e }); });
    let use = frames;
    if (quietest) { use = [...frames].sort((p, q) => p.e - q.e).slice(0, Math.max(4, Math.round(frames.length * 0.1))); }
    const prof = new Float32Array(H2); use.forEach((f) => { for (let k = 0; k < H2; k++) prof[k] += f.m[k] / use.length; });
    return prof;
  }
  function takeNoiseProfile() {
    if (!A || !needSel()) return; if (sel.b - sel.a < A.sr * 0.2) return toast('Sélectionnez au moins 0,2 s de bruit seul (sans voix)');
    noiseProfile = { sr: A.sr, prof: noiseFrom(A.ch[0], sel.a, sel.b, false) };
    toast('Profil de bruit enregistré : sélectionnez maintenant le passage à nettoyer (ou rien pour tout), puis « Réduire le bruit de fond »', 6000);
  }
  async function denoiseDialog() {
    if (!A) return;
    const v = await modal({ title: 'Réduire le bruit de fond — ' + scope(), body: `<p>${noiseProfile && noiseProfile.sr === A.sr ? 'Le profil de bruit que vous avez choisi sera utilisé.' : 'Le bruit est mesuré automatiquement sur les passages les plus calmes. Pour un meilleur résultat : sélectionnez une seconde de bruit seul, puis Effets → « Prendre la sélection comme profil de bruit ».'}</p><div class="fxgrid"><label for="dnR">Réduction</label><input id="dnR" type="range" min="6" max="30" step="1" value="14"><output id="dnRo">14 dB</output><label for="dnS">Sensibilité</label><input id="dnS" type="range" min="1" max="3" step="0.1" value="1.6"><output id="dnSo">1.6</output></div><p class="hint">Trop fort, la voix peut prendre un son « métallique » : préférez 10 à 15 dB.</p>`,
      onOpen: (bx) => { const r = bx.querySelector('#dnR'), s = bx.querySelector('#dnS'); r.oninput = () => { bx.querySelector('#dnRo').textContent = r.value + ' dB'; }; s.oninput = () => { bx.querySelector('#dnSo').textContent = s.value; }; },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Nettoyer', primary: true, value: (bx) => ({ red: +bx.querySelector('#dnR').value, sens: +bx.querySelector('#dnS').value }) }] });
    if (!v) return;
    await withProgress('Réduction du bruit', async (setP) => {
      const [a, b] = range();
      const prof = noiseProfile && noiseProfile.sr === A.sr ? noiseProfile.prof : noiseFrom(A.ch[0], 0, len(), true);
      const floor = Math.pow(10, -v.red / 20); const H2 = NF / 2 + 1;
      const out = [];
      for (let c = 0; c < nch(); c++) {
        const x = A.ch[c]; const y = x.slice(); for (let i = a; i < b; i++) y[i] = 0;
        let prevG = new Float32Array(H2).fill(1); let count = 0; const total = (b - a) / HOP;
        const re = new Float32Array(NF), im = new Float32Array(NF), g = new Float32Array(H2);
        for (let s = a - NF + HOP; s < b; s += HOP) {
          for (let i = 0; i < NF; i++) { const k = s + i; re[i] = k >= a && k < b ? x[k] * win[i] : 0; im[i] = 0; }
          fft(re, im, false);
          for (let k = 0; k < H2; k++) { const m = Math.hypot(re[k], im[k]) + 1e-9; let gk = 1 - (v.sens * prof[k]) / m; gk = Math.max(floor, gk); g[k] = gk; }
          // lissage en fréquence et dans le temps (évite les « gazouillis »)
          for (let k = 0; k < H2; k++) { const gs = (g[Math.max(0, k - 1)] + g[k] * 2 + g[Math.min(H2 - 1, k + 1)]) / 4; const gt = gs > prevG[k] ? gs : prevG[k] * 0.6 + gs * 0.4; prevG[k] = gt; }
          for (let k = 0; k < H2; k++) { re[k] *= prevG[k]; im[k] *= prevG[k]; if (k && k < NF / 2) { re[NF - k] *= prevG[k]; im[NF - k] *= prevG[k]; } }
          fft(re, im, true);
          for (let i = 0; i < NF; i++) { const k = s + i; if (k >= a && k < b) y[k] += (re[i] * win[i]) / 2; }
          if (++count % 400 === 0) { setP((c + count / total) / nch(), `Canal ${c + 1} : ${Math.round((count / total) * 100)} %`); await new Promise((r) => setTimeout(r, 0)); }
        }
        // jonction douce avec le son d'origine aux bords de la sélection
        const xf = Math.min(Math.round(A.sr * 0.01), (b - a) >> 2);
        for (let i = 0; i < xf; i++) { const t = i / xf; y[a + i] = y[a + i] * t + x[a + i] * (1 - t); y[b - 1 - i] = y[b - 1 - i] * t + x[b - 1 - i] * (1 - t); }
        out.push(y);
      }
      edit(() => { A = { sr: A.sr, ch: out }; });
    });
    toast('Bruit de fond réduit — écoutez, et annulez (Ctrl+Z) si la voix est abîmée', 5000);
  }
  async function desilenceDialog() {
    if (!A) return;
    const v = await modal({ title: 'Raccourcir les silences — ' + scope(), body: `<p>Les blancs plus longs que la durée choisie sont raccourcis : idéal pour une réunion ou un message vocal.</p><div class="fxgrid"><label for="dsMin">Silence de plus de</label><input id="dsMin" type="range" min="0.3" max="5" step="0.1" value="1"><output id="dsMino">1.0 s</output><label for="dsKeep">Garder</label><input id="dsKeep" type="range" min="0.1" max="1.5" step="0.05" value="0.4"><output id="dsKeepo">0.40 s</output><label for="dsThr">Seuil</label><input id="dsThr" type="range" min="15" max="45" step="1" value="30"><output id="dsThro">−30 dB</output></div><p class="hint">Seuil : niveau sous la voix en dessous duquel on considère qu'il y a silence.</p>`,
      onOpen: (bx) => { [['dsMin', ' s', 1], ['dsKeep', ' s', 2], ['dsThr', ' dB', 0]].forEach(([k, u, d]) => { const r = bx.querySelector('#' + k); r.oninput = () => { bx.querySelector(`#${k}o`).textContent = (k === 'dsThr' ? '−' : '') + (+r.value).toFixed(d) + u; }; }); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Raccourcir', primary: true, value: (bx) => ({ min: +bx.querySelector('#dsMin').value, keep: +bx.querySelector('#dsKeep').value, thr: +bx.querySelector('#dsThr').value }) }] });
    if (!v) return;
    const [a, b] = range(); const fr = Math.round(A.sr * 0.01); const nf = Math.floor((b - a) / fr);
    const rms = new Float32Array(nf);
    const raw = new Float32Array(nf);
    for (let f = 0; f < nf; f++) { let e = 0; for (const c of A.ch) for (let i = a + f * fr; i < a + (f + 1) * fr; i += 2) e += c[i] * c[i]; raw[f] = e / ((fr / 2) * nch()); }
    for (let f = 0; f < nf; f++) { let e = 0, k = 0; for (let j = Math.max(0, f - 3); j <= Math.min(nf - 1, f + 3); j++) { e += raw[j]; k++; } rms[f] = Math.sqrt(e / k); } // lissé sur 70 ms
    // seuil : sous le niveau de la voix, mais nettement au-dessus du bruit de fond des passages calmes
    const sorted = [...rms].sort((p, q) => q - p); const loud = sorted[Math.floor(nf * 0.1)] || 0; const floor = sorted[Math.floor(nf * 0.9)] || 0;
    const thr = Math.min(loud * Math.pow(10, -12 / 20), Math.max(loud * Math.pow(10, -v.thr / 20), floor * 3));
    const cuts = []; let s0 = -1;
    for (let f = 0; f <= nf; f++) { const q = f < nf && rms[f] < thr; if (q && s0 < 0) s0 = f; if (!q && s0 >= 0) { if ((f - s0) * 0.01 >= v.min) { const keepF = Math.round(v.keep * 100); const ca = a + (s0 + keepF / 2) * fr, cb = a + (f - keepF / 2) * fr; if (cb - ca > fr) cuts.push([Math.round(ca), Math.round(cb)]); } s0 = -1; } }
    if (!cuts.length) return toast('Aucun silence assez long trouvé');
    const removed = cuts.reduce((x, [p, q]) => x + q - p, 0);
    edit(() => {
      const xf = Math.round(A.sr * 0.008);
      A = { sr: A.sr, ch: A.ch.map((c) => { const parts = []; let pos = 0; for (const [p, q] of cuts) { const seg = c.slice(pos, p); for (let i = 0; i < Math.min(xf, seg.length); i++) seg[seg.length - 1 - i] *= i / xf; parts.push(seg); pos = q; } parts.push(c.slice(pos)); for (let k = 1; k < parts.length; k++) { const s = parts[k]; for (let i = 0; i < Math.min(xf, s.length); i++) s[i] *= i / xf; } return concat(parts); }) };
      if (sel) sel = { a: sel.a, b: sel.b - removed };
    });
    toast(`${cuts.length} silence${cuts.length > 1 ? 's' : ''} raccourci${cuts.length > 1 ? 's' : ''} : ${fmtT(removed / A.sr, false)} gagnées`, 5000);
  }
  /* --- vitesse sans changer la hauteur de la voix (WSOLA) --- */
  async function stretch(chs, rate, sr, setP) {
    const N = Math.round(sr * 0.04) & ~1, Hs = N >> 1, Ha = Hs * rate, tol = Math.round(sr * 0.012);
    const L = chs[0].length; const outLen = Math.floor(L / rate) + N; const outs = chs.map(() => new Float32Array(outLen));
    const w = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    const mono = chs.length > 1 ? chs[0].map((v, i) => (v + chs[1][i]) / 2) : chs[0];
    let prev = 0; const frames = Math.floor((L - N - tol) / Ha);
    for (let k = 0; k < frames; k++) {
      const nom = Math.round(k * Ha); let best = 0;
      if (k) { // segment qui ressemble le plus à la suite naturelle du précédent
        const ref = prev + Hs; let bc = -Infinity;
        for (let d = -tol; d <= tol; d += 2) { const p = nom + d; if (p < 0 || p + N > L) continue; let c = 0; for (let i = 0; i < N; i += 4) c += mono[p + i] * mono[ref + i]; if (c > bc) { bc = c; best = d; } }
      }
      const p = Math.max(0, Math.min(L - N, nom + best)); const o = k * Hs;
      for (let c = 0; c < chs.length; c++) { const x = chs[c], y = outs[c]; for (let i = 0; i < N; i++) y[o + i] += x[p + i] * w[i]; }
      prev = p;
      if (k % 2000 === 0) { setP(k / frames, `${Math.round((k / frames) * 100)} %`); await new Promise((r) => setTimeout(r, 0)); }
    }
    const n = Math.min(outLen, Math.floor(frames * Hs + N / 2)); return outs.map((y) => y.subarray(0, n).slice());
  }
  async function speedDialog() {
    if (!A) return;
    const v = await modal({ title: 'Vitesse — ' + scope(), body: `<div class="fxgrid"><label for="spR">Vitesse</label><input id="spR" type="range" min="0.5" max="2" step="0.05" value="1.25"><output id="spRo">×1.25</output></div><p class="hint">La hauteur de la voix est conservée. ×1,25 à ×1,5 pour écouter plus vite un long enregistrement ; ×0,75 pour mieux comprendre.</p>`, onOpen: (bx) => { const r = bx.querySelector('#spR'); r.oninput = () => { bx.querySelector('#spRo').textContent = '×' + (+r.value).toFixed(2); }; }, buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (bx) => +bx.querySelector('#spR').value }] });
    if (!v || v === 1) return;
    await withProgress('Changement de vitesse', async (setP) => {
      const [a, b] = range(); const res = await stretch(A.ch.map((c) => c.subarray(a, b)), v, A.sr, setP);
      edit(() => { splice(a, b, res); if (sel) sel = { a, b: a + res[0].length }; });
    });
    toast(`Vitesse ×${v.toFixed(2)} : nouvelle durée ${fmtT(dur(), false)}`);
  }

  async function withProgress(title, fn) {
    const ov = document.createElement('div'); ov.className = 'modal-back';
    ov.innerHTML = `<div class="modal" style="width:min(420px,100%)"><header>${title}…</header><div class="body"><div class="prog"><div id="wpBar"></div></div><span class="hint" id="wpTxt">Préparation…</span></div></div>`;
    document.body.appendChild(ov);
    const setP = (u, t) => { ov.querySelector('#wpBar').style.width = Math.round(u * 100) + '%'; if (t) ov.querySelector('#wpTxt').textContent = t; };
    try { stop(); return await fn(setP); } catch (e) { console.error(e); toast(title + ' impossible : ' + (e.message || e), 7000); } finally { ov.remove(); }
  }

  /* ================= Enregistrement au micro ================= */
  let recording = null;
  async function record() {
    if (recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Le micro n\'est pas accessible dans ce navigateur (ouvrez la page en https ou depuis l\'application installée)', 7000);
    stop();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { return toast('Micro refusé : autorisez-le dans les réglages du navigateur', 7000); }
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
    const chunks = []; const ctx = audioCtx(); const an = ctx.createAnalyser(); an.fftSize = 2048; const srcN = ctx.createMediaStreamSource(stream); srcN.connect(an);
    let wake = null; try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* écran : réglage du téléphone */ }
    await idb.set('rec', { mime: mr.mimeType, chunks: [], started: Date.now() }).catch(() => {});
    const ov = document.createElement('div'); ov.className = 'modal-back';
    ov.innerHTML = `<div class="modal" style="width:min(460px,100%)"><header>Enregistrement</header><div class="body"><div class="recbox" id="rb"><div><span class="dot"></span><span id="rState">Enregistrement en cours</span></div><div class="clock" id="rClock">0:00</div><div class="meter"><div id="rMeter"></div></div><span class="hint" id="rDb"></span><p class="hint">${A ? `Le son sera ${sel ? 'mis à la place de la sélection' : 'inséré au curseur (' + fmtT(cursor / A.sr) + ')'}.` : 'Un nouveau son sera créé.'} L'écran reste allumé ; l'enregistrement est sauvegardé au fur et à mesure.</p></div></div><footer><button id="rCancel" class="danger">Abandonner</button><button id="rPause">⏸ Pause</button><button id="rStop" class="primary">⏹ Arrêter</button></footer></div>`;
    document.body.appendChild(ov);
    const t0 = Date.now(); let pausedMs = 0, pausedAt = 0;
    const data = new Float32Array(an.fftSize);
    recording = { mr, stream };
    const tick = () => {
      if (!recording) return;
      an.getFloatTimeDomainData(data); let pk = 0; for (const v of data) pk = Math.max(pk, Math.abs(v));
      const db = pk > 0 ? 20 * Math.log10(pk) : -90; ov.querySelector('#rMeter').style.width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) + '%';
      ov.querySelector('#rDb').textContent = db < -50 ? 'Très faible : rapprochez le micro' : db > -1 ? 'Trop fort : éloignez le micro' : '';
      const el = (pausedAt ? pausedAt : Date.now()) - t0 - pausedMs; ov.querySelector('#rClock').textContent = fmtT(el / 1000, false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    mr.ondataavailable = (e) => { if (e.data && e.data.size) { chunks.push(e.data); idb.get('rec').then((r) => { if (r) { r.chunks.push(e.data); return idb.set('rec', r); } }).catch(() => {}); } };
    mr.start(5000);
    const finish = (keep) => new Promise((res) => {
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); try { srcN.disconnect(); } catch (e) { /* ignore */ }
        if (wake) wake.release().catch(() => {});
        recording = null; ov.remove();
        if (keep) await useRecording(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
        await idb.del('rec').catch(() => {});
        res();
      };
      mr.stop();
    });
    ov.querySelector('#rStop').onclick = () => finish(true);
    ov.querySelector('#rCancel').onclick = async () => { if (await confirmBox('Abandonner cet enregistrement ?', 'Abandonner')) finish(false); };
    ov.querySelector('#rPause').onclick = (e) => {
      if (mr.state === 'recording') { mr.pause(); pausedAt = Date.now(); e.target.textContent = '⏺ Reprendre'; ov.querySelector('#rState').textContent = 'En pause'; ov.querySelector('#rb').classList.add('paused'); }
      else { mr.resume(); pausedMs += Date.now() - pausedAt; pausedAt = 0; e.target.textContent = '⏸ Pause'; ov.querySelector('#rState').textContent = 'Enregistrement en cours'; ov.querySelector('#rb').classList.remove('paused'); }
    };
  }
  async function useRecording(blob) {
    try {
      toast('Préparation de l\'enregistrement…', 30000);
      const d = await decodeFile(new File([blob], 'enregistrement.webm', { type: blob.type }), A ? A.sr : 44100);
      if (A) { const ins = conform(d); const at = sel ? sel.a : cursor; edit(() => { splice(at, sel ? sel.b : at, ins); sel = { a: at, b: at + ins[0].length }; cursor = at + ins[0].length; }); }
      else { edit(() => { A = d; name = 'Enregistrement ' + new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(/[/:]/g, '-'); cursor = 0; sel = null; }); fit(); render(); }
      toast(`Enregistrement ajouté : ${fmtT(d.ch[0].length / d.sr, false)}`);
    } catch (e) { console.error(e); toast('Enregistrement illisible : ' + e.message, 7000); download(blob, 'enregistrement.webm'); }
  }

  /* ================= Export : WAV, MP3, partage ================= */
  function toInt16(x) { const o = new Int16Array(x.length); for (let i = 0; i < x.length; i++) { const v = Math.max(-1, Math.min(1, x[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; }
  function wavBlob(chs, sr) {
    const n = chs[0].length, c = chs.length; const buf = new ArrayBuffer(44 + n * c * 2); const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * c * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, c, true); v.setUint32(24, sr, true); v.setUint32(28, sr * c * 2, true); v.setUint16(32, c * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * c * 2, true);
    let o = 44; for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) { const s = Math.max(-1, Math.min(1, chs[k][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Blob([buf], { type: 'audio/wav' });
  }
  async function resampleOffline(chs, from, to) {
    if (from === to) return chs;
    const n = Math.ceil((chs[0].length * to) / from);
    const ctx = new OfflineAudioContext(chs.length, n, to); const buf = ctx.createBuffer(chs.length, chs[0].length, from);
    chs.forEach((c, i) => buf.copyToChannel(c, i)); const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start();
    const r = await ctx.startRendering(); return chs.map((_, i) => r.getChannelData(i));
  }
  async function mp3Blob(chs, sr, kbps, setP) {
    await loadScript('lib/lame.min.js');
    const L = window.lamejs; const enc = new L.Mp3Encoder(chs.length, sr, kbps);
    const ints = chs.map(toInt16); const BL = 1152 * 16; const out = [];
    for (let i = 0; i < ints[0].length; i += BL) {
      const l = ints[0].subarray(i, i + BL); const buf = chs.length > 1 ? enc.encodeBuffer(l, ints[1].subarray(i, i + BL)) : enc.encodeBuffer(l);
      if (buf.length) out.push(new Uint8Array(buf));
      if ((i / BL) % 40 === 0) { setP(i / ints[0].length, `Encodage MP3 : ${Math.round((i / ints[0].length) * 100)} %`); await new Promise((r) => setTimeout(r, 0)); }
    }
    const end = enc.flush(); if (end.length) out.push(new Uint8Array(end));
    return new Blob(out, { type: 'audio/mpeg' });
  }
  const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
  async function exportDialog(opt = {}) {
    if (!A) return toast('Rien à exporter : ouvrez ou enregistrez un son');
    const share = !!opt.share; const canShare = !!(navigator.canShare && navigator.share);
    const v = await modal({ title: share ? 'Partager le son' : 'Exporter le son',
      body: `<div class="field"><label for="exN">Nom du fichier</label><input id="exN" value="${name.replace(/"/g, '&quot;')}"></div>
        <div class="field"><label for="exF">Format</label><select id="exF"><option value="mp3v">MP3 voix — petit fichier, idéal WhatsApp et e-mail (mono, 64 kbit/s)</option><option value="mp3" selected>MP3 standard (128 kbit/s)</option><option value="mp3h">MP3 haute qualité (192 kbit/s)</option><option value="wav">WAV sans perte (gros fichier)</option></select></div>
        ${sel ? `<label class="row"><input type="checkbox" id="exSel" ${opt.sel ? 'checked' : ''}> Seulement la sélection (${fmtT((sel.b - sel.a) / A.sr)})</label>` : ''}
        <p class="hint" id="exSize"></p>`,
      onOpen: (bx) => { const u = () => { const f = bx.querySelector('#exF').value; const s = bx.querySelector('#exSel') && bx.querySelector('#exSel').checked ? (sel.b - sel.a) / A.sr : dur(); const kb = { mp3v: 64, mp3: 128, mp3h: 192 }[f]; const bytes = kb ? (s * kb * 1000) / 8 : s * A.sr * nch() * 2; bx.querySelector('#exSize').textContent = `Taille estimée : ${bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' Mo' : Math.round(bytes / 1024) + ' Ko'}`; }; bx.querySelectorAll('select,input').forEach((e) => { e.onchange = u; }); u(); },
      buttons: [{ label: 'Annuler', value: null }, { label: share ? (canShare ? 'Partager' : 'Télécharger') : 'Exporter', primary: true, value: (bx) => ({ n: bx.querySelector('#exN').value.trim() || 'son', f: bx.querySelector('#exF').value, sel: !!(bx.querySelector('#exSel') && bx.querySelector('#exSel').checked) }) }] });
    if (!v) return;
    let blob = null;
    await withProgress('Export', async (setP) => {
      let chs = v.sel ? sliceCh(sel.a, sel.b) : A.ch; let sr = A.sr;
      if (v.f === 'wav') { setP(0.5, 'Écriture du WAV…'); blob = wavBlob(chs, sr); return; }
      if (v.f === 'mp3v') { if (chs.length > 1) { const m = new Float32Array(chs[0].length); for (let i = 0; i < m.length; i++) m[i] = (chs[0][i] + chs[1][i]) / 2; chs = [m]; } if (sr > 24000) { setP(0.02, 'Préparation…'); chs = await resampleOffline(chs, sr, 24000); sr = 24000; } }
      if (!MP3_RATES.includes(sr)) { const to = MP3_RATES.find((r) => r >= sr) || 48000; chs = await resampleOffline(chs, sr, to); sr = to; }
      blob = await mp3Blob(chs, sr, { mp3v: 64, mp3: 128, mp3h: 192 }[v.f], setP);
    });
    if (!blob) return;
    const fname = v.n.replace(/[\\/:*?"<>|]+/g, '_') + (v.f === 'wav' ? '.wav' : '.mp3');
    if (share && canShare) {
      const file = new File([blob], fname, { type: blob.type });
      if (navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: v.n }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    }
    download(blob, fname); toast(`« ${fname} » : ${(blob.size / 1048576).toFixed(1)} Mo`);
  }

  /* ================= Transcription ================= */
  async function transcribeDialog() {
    if (!A) return;
    if (!window.HFTransformers) await loadScript('lib/transformers.js');
    if (!(Studio.transcribe)) await loadScript('js/transcribe.js');
    const T = Studio.transcribe;
    const v = await modal({ title: 'Transcrire en texte — ' + scope(), body: `<div class="field"><label for="trM">Modèle</label><select id="trM">${T.modelOptions()}</select></div><div class="field"><label for="trL">Langue parlée</label><select id="trL">${T.langOptions()}</select></div><p class="hint">Le modèle est téléchargé une seule fois, puis tout se fait sur l'appareil (le son n'est jamais envoyé). Comptez environ la durée du son, ou plus sur un téléphone.</p>`, onOpen: (bx) => { bx.querySelector('#trL').value = 'french'; }, buttons: [{ label: 'Annuler', value: null }, { label: 'Transcrire', primary: true, value: (bx) => ({ m: bx.querySelector('#trM').value, l: bx.querySelector('#trL').value }) }] });
    if (!v) return;
    const [a, b] = range(); const off = a / A.sr; let segs = null;
    await withProgress('Transcription', async (setP) => {
      setP(0.01, 'Préparation du son…');
      let chs = A.ch.map((c) => c.subarray(a, b));
      if (chs.length > 1) { const m = new Float32Array(chs[0].length); for (let i = 0; i < m.length; i++) m[i] = (chs[0][i] + chs[1][i]) / 2; chs = [m]; }
      const s16 = (await resampleOffline(chs, A.sr, 16000))[0];
      segs = await T.transcribe(s16, { model: v.m, language: v.l, onProgress: (u, t) => setP(u, t) });
    });
    if (!segs) return;
    if (!segs.length) return toast('Aucune parole reconnue');
    segs = segs.map((s) => ({ ...s, start: s.start + off, end: s.end + off }));
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const r = await modal({ title: 'Transcription', wide: true, body: `<p class="hint">Touchez une phrase pour l'écouter.</p><div class="seg-list">${segs.map((s, i) => `<div class="s" data-i="${i}"><span>${fmtT(s.start, false)}</span><span>${esc(s.text)}</span></div>`).join('')}</div>`,
      onOpen: (bx) => bx.querySelectorAll('.s').forEach((el) => { el.onclick = () => { const s = segs[+el.dataset.i]; playFrom(Math.round(s.start * A.sr), Math.round(s.end * A.sr)); }; }),
      buttons: [{ label: 'Fermer', value: null }, { label: 'Copier', value: 'copy' }, { label: '.txt', value: 'txt' }, { label: 'Sous-titres .srt', value: 'srt' }, { label: 'Ouvrir dans Texte Joe', primary: true, value: 'doc' }] });
    stop();
    const txt = T.toTXT(segs, false);
    if (r === 'copy') navigator.clipboard.writeText(txt).then(() => toast('Texte copié'), () => toast('Copie refusée par le navigateur'));
    if (r === 'txt') download(new Blob([T.toTXT(segs, true)], { type: 'text/plain;charset=utf-8' }), name + '.txt');
    if (r === 'srt') download(new Blob([T.toSRT(segs)], { type: 'text/plain;charset=utf-8' }), name + '.srt');
    if (r === 'doc') {
      const html = `<h1>${esc(name)}</h1>` + segs.map((s) => `<p><span style="color:#888888">[${fmtT(s.start, false)}]</span> ${esc(s.text)}</p>`).join('');
      const id = Math.random().toString(36).slice(2, 10);
      await new Promise((res, rej) => { const q = indexedDB.open('texte-joe', 1); q.onupgradeneeded = () => { q.result.createObjectStore('docs'); q.result.createObjectStore('kv'); }; q.onsuccess = () => { const db = q.result; const tx = db.transaction(['docs', 'kv'], 'readwrite'); tx.objectStore('docs').put({ id, title: 'Transcription — ' + name, html, updated: Date.now() }, id); tx.objectStore('kv').put(id, 'current'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }; q.onerror = () => rej(q.error); });
      location.href = 'texte.html';
    }
  }

  /* ================= Sauvegarde sur l'appareil ================= */
  const idb = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('audio-joe', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
    async get(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); },
    async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async del(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };
  let saveTimer = null;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        if (!A) { await idb.del('doc'); return; }
        // 16 bits suffisent et divisent la place par deux
        await idb.set('doc', { name, sr: A.sr, ch: A.ch.map(toInt16), cursor, updated: Date.now() });
      } catch (e) { console.warn('sauvegarde impossible', e); toast('Son trop long pour la sauvegarde automatique : pensez à exporter', 5000); }
    }, 1500);
  }
  async function restoreSaved() {
    try {
      const rec = await idb.get('rec');
      if (rec && rec.chunks && rec.chunks.length) {
        const ok = await confirmBox(`Un enregistrement interrompu a été retrouvé (commencé le ${new Date(rec.started).toLocaleString('fr-FR')}). Le récupérer ?`, 'Récupérer');
        if (ok) { await restoreDoc(); await useRecording(new Blob(rec.chunks, { type: rec.mime || 'audio/webm' })); }
        await idb.del('rec'); if (ok) return;
      }
      await restoreDoc();
    } catch (e) { console.warn(e); }
  }
  async function restoreDoc() {
    const d = await idb.get('doc'); if (!d || !d.ch) return;
    A = { sr: d.sr, ch: d.ch.map((c) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] / 32768; return o; }) };
    name = d.name || 'Son'; cursor = d.cursor || 0; computePeaks(); fit(); render(); updateUI();
  }

  /* ================= Commandes ================= */
  const ACTIONS = {
    new: async () => { if (A && !(await confirmBox('Fermer le son actuel ? (Il reste annulable avec Ctrl+Z.)', 'Nouveau'))) return; edit(() => { A = null; sel = null; cursor = 0; name = 'Enregistrement'; }); },
    open: openDialog, record, export: () => exportDialog(), share: () => exportDialog({ share: true }), exportSel: () => { if (needSel()) exportDialog({ sel: true }); },
    undo, redo, cut, copy, paste, del, trim, dup, silenceIns: insertSilence,
    selAll: () => { if (!A) return; sel = { a: 0, b: len() }; updateUI(); render(); }, selNone: () => { sel = null; updateUI(); render(); }, selRange,
    gain: gainDialog, normalize: () => normalize(-1), compress: compressDialog, fadeIn: () => fade(1), fadeOut: () => fade(-1),
    denoise: denoiseDialog, noiseProfile: takeNoiseProfile, desilence: desilenceDialog, voice, eq: eqDialog, highpass, speed: speedDialog, mute, reverse, mono,
    transcribe: transcribeDialog,
    play: togglePlay, stop: () => { stop(); }, home: () => { cursor = 0; view.start = 0; if (playing) playFrom(0); updateUI(); render(); },
    loop: () => { loop = !loop; updateUI(); if (playing && sel) playFrom(sel.a, sel.b, { loop }); },
    zoomIn: () => { const x = xOf(playPos != null ? playPos : cursor); zoomAt(x >= 0 && x <= W ? x : W / 2, 2); }, zoomOut: () => zoomAt(W / 2, 0.5), zoomSel, zoomFit: () => { fit(); render(); },
    help: () => modal({ title: 'Audio Joe — aide', wide: true, body: `<p><b>Sélectionner</b> : glisser sur la forme d'onde (au doigt ou à la souris) ; tirer les bords pour ajuster ; double-clic : une phrase entière. <b>Placer le curseur</b> : toucher sans glisser. <b>Zoom</b> : pincer à deux doigts, Ctrl + molette, ou les boutons ＋ －.</p><p>Les effets s'appliquent à la sélection, ou à tout le son s'il n'y a pas de sélection.</p><table class="cmp" style="width:100%"><tr><td>Espace</td><td>Lecture / pause</td></tr><tr><td>R</td><td>Enregistrer avec le micro</td></tr><tr><td>Ctrl+Z / Ctrl+Y</td><td>Annuler / rétablir</td></tr><tr><td>Ctrl+X / C / V</td><td>Couper / copier / coller</td></tr><tr><td>Suppr</td><td>Supprimer la sélection</td></tr><tr><td>Ctrl+T</td><td>Garder seulement la sélection</td></tr><tr><td>Ctrl+A / Échap</td><td>Tout sélectionner / désélectionner</td></tr><tr><td>+ / −</td><td>Zoom</td></tr><tr><td>Début / Fin</td><td>Aller au début / à la fin</td></tr><tr><td>← / →</td><td>Reculer / avancer de 5 s</td></tr></table>` }),
  };
  function act(a) { const f = ACTIONS[a]; if (f) Promise.resolve(f()).catch((e) => { console.error(e); toast('Erreur : ' + (e.message || e), 6000); }); }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) act(b.dataset.act); });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,select,.modal')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    const map = mod ? { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', x: 'cut', c: 'copy', v: 'paste', a: 'selAll', t: 'trim', d: 'dup', s: 'export', o: 'open' } : { ' ': 'play', delete: 'del', backspace: 'del', escape: 'selNone', r: 'record', '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', home: 'home' };
    if (map[k]) { e.preventDefault(); act(map[k]); return; }
    if (!mod && A && (k === 'arrowleft' || k === 'arrowright' || k === 'end')) {
      e.preventDefault(); cursor = k === 'end' ? len() : Math.max(0, Math.min(len(), cursor + (k === 'arrowleft' ? -5 : 5) * A.sr)); if (xOf(cursor) < 0 || xOf(cursor) > W) { view.start = cursor - (W * view.spp) / 2; clampView(); }
      if (playing) playFrom(cursor); updateUI(); render();
    }
  });

  /* ================= Démarrage ================= */
  initMenus();
  const ro = new ResizeObserver(() => { const keep = A && view.spp >= len() / Math.max(50, W) - 1e-9; sizeCanvases(); if (keep) fit(); else clampView(); render(); });
  ro.observe($('#stage'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  sizeCanvases(); render(); updateUI();
  restoreSaved();

  window.AudioJoe = { get A() { return A; }, set A(v) { A = v; computePeaks(); fit(); render(); updateUI(); }, get sel() { return sel; }, set sel(v) { sel = v; updateUI(); render(); }, get cursor() { return cursor; }, act, openFile, wavBlob, mp3Blob, stretch, len, dur };
})();
