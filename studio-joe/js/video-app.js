/* Video Joe — montage vidéo multipiste (type Premiere Pro) : timeline, découpe, trim, titres,
   transitions, images clés, étalonnage, audio, export MP4/WebM. Tout se passe dans le navigateur. */
(function () {
  const { $, $$, toast, download, pickFiles, baseName, initMenus, modal, store, onDropFiles, loadImage, clamp } = Studio;

  /* ---------------- État ---------------- */
  const TRACKS = [
    { id: 'V3', kind: 'visual', label: 'V3' }, { id: 'V2', kind: 'visual', label: 'V2' }, { id: 'V1', kind: 'visual', label: 'V1' },
    { id: 'A1', kind: 'audio', label: 'A1' }, { id: 'A2', kind: 'audio', label: 'A2' },
  ];
  let project = { w: 1920, h: 1080, fps: 30, bg: '#000000', clips: [], muted: {}, hidden: {} };
  const media = new Map(); // id -> {id, name, kind, url, duration, w, h, thumb, strip, peaks, file}
  let selId = null, tool = 'select', time = 0, playing = false, loop = false;
  let pps = 60; // pixels par seconde dans la timeline
  let idSeq = 1, mediaSeq = 1;
  const undoStack = [], redoStack = [];
  const cv = $('#preview'), ctx = cv.getContext('2d');

  const fps = () => project.fps;
  const selClip = () => project.clips.find((c) => c.id === selId);
  const total = () => Math.max(1, ...project.clips.map((c) => c.start + c.dur));
  const trackKind = (t) => TRACKS.find((x) => x.id === t).kind;
  const isVisual = (c) => c.type !== 'audio';
  function tc(t) {
    const f = fps(), fr = Math.round(t * f), s = Math.floor(fr / f);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, fr % f].map((v) => String(v).padStart(2, '0')).join(':');
  }
  const snapT = (t) => Math.round(t * fps()) / fps();

  /* ---------------- Historique ---------------- */
  const snap = () => JSON.stringify(project);
  function pushUndo() { undoStack.push(snap()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; updHist(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); project = JSON.parse(undoStack.pop()); afterRestore(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); project = JSON.parse(redoStack.pop()); afterRestore(); }
  function afterRestore() { if (!selClip()) selId = null; applySeq(); renderTimeline(); renderFx(); drawFrame(); updHist(); }
  function updHist() { $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length; }

  /* ---------------- Médias ---------------- */
  async function importFiles(files) {
    let n = 0;
    for (const f of files) {
      try {
        const kind = f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(f.name) ? 'video'
          : f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(f.name) ? 'audio'
            : f.type.startsWith('image/') ? 'image' : null;
        if (!kind) { toast(`Format non pris en charge : ${f.name}`); continue; }
        const m = { id: 'm' + mediaSeq++, name: f.name, kind, url: URL.createObjectURL(f), file: f };
        await probe(m);
        media.set(m.id, m); n++;
        relinkClips(m);
      } catch (e) { console.error(e); toast(`Impossible de lire ${f.name} : ${e.message || e}`, 5000); }
    }
    renderMedia(); renderTimeline(); drawFrame();
    if (n) toast(`${n} média${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}`);
  }
  function probe(m) {
    if (m.kind === 'image') return loadImage(m.url).then((im) => { m.w = im.naturalWidth; m.h = im.naturalHeight; m.duration = Infinity; m.thumb = m.url; m.img = im; });
    if (m.kind === 'audio') {
      return new Promise((res, rej) => {
        const a = document.createElement('audio'); a.preload = 'metadata'; a.src = m.url;
        a.onloadedmetadata = async () => { m.duration = a.duration; await computePeaks(m); res(); };
        a.onerror = () => rej(new Error('fichier audio illisible'));
      });
    }
    return new Promise((res, rej) => {
      const v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.playsInline = true; v.src = m.url;
      v.onloadedmetadata = () => { m.duration = v.duration; m.w = v.videoWidth; m.h = v.videoHeight; v.currentTime = Math.min(1, v.duration / 3); };
      v.onseeked = async () => {
        const c = document.createElement('canvas'); c.height = 72; c.width = Math.round(72 * m.w / m.h) || 128;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); m.thumb = c.toDataURL('image/jpeg', 0.7);
        computePeaks(m).finally(res);
      };
      v.onerror = () => rej(new Error('vidéo illisible par ce navigateur (essayez MP4 H.264 ou WebM)'));
    });
  }
  // forme d'onde affichée dans les clips audio
  async function computePeaks(m) {
    try {
      if (m.file.size > 400 * 1024 * 1024) return;
      const ac = new OfflineAudioContext(1, 8000, 8000);
      const buf = await ac.decodeAudioData(await m.file.arrayBuffer());
      const d = buf.getChannelData(0), n = Math.min(4000, Math.ceil(buf.duration * 50)), step = d.length / n, peaks = new Float32Array(n);
      for (let i = 0; i < n; i++) { let mx = 0; for (let j = Math.floor(i * step); j < (i + 1) * step && j < d.length; j += 4) mx = Math.max(mx, Math.abs(d[j])); peaks[i] = mx; }
      m.peaks = peaks;
    } catch (e) { /* pas de piste audio */ }
  }
  function waveImage(m, clip, width) {
    if (!m.peaks) return '';
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.min(4000, Math.round(width))); c.height = 40;
    const x = c.getContext('2d'); x.fillStyle = 'rgba(255,255,255,.75)';
    const n = m.peaks.length, perSec = n / m.duration;
    for (let i = 0; i < c.width; i++) {
      const srcT = clip.in + (i / c.width) * clip.dur * clip.speed; const p = m.peaks[Math.floor(srcT * perSec)] || 0;
      const h = Math.max(1, p * 38); x.fillRect(i, 20 - h / 2, 1, h);
    }
    return c.toDataURL();
  }
  function renderMedia() {
    const box = $('#mediaList'); box.innerHTML = '';
    for (const m of media.values()) {
      const el = document.createElement('div'); el.className = 'media'; el.draggable = true; el.title = 'Glissez sur la timeline ou double-cliquez';
      const icon = m.kind === 'audio' ? '♪' : '';
      el.innerHTML = `<div class="th" style="${m.thumb ? `background-image:url(${m.thumb})` : `background:#23784f`}">${icon}</div><div style="min-width:0"><div class="nm">${escapeHtml(m.name)}</div><div class="meta">${m.kind === 'image' ? `image ${m.w}×${m.h}` : `${tc(m.duration)}${m.w ? ` · ${m.w}×${m.h}` : ''}`}</div></div>`;
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-media', m.id); e.dataTransfer.effectAllowed = 'copy'; });
      el.addEventListener('dblclick', () => addMediaClip(m, null, time));
      box.appendChild(el);
    }
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function defaultProps() {
    return { x: 0, y: 0, scale: 100, rot: 0, opacity: 100, fit: 'contain', volume: 100, fadeIn: 0, fadeOut: 0, aFadeIn: 0, aFadeOut: 0,
      bright: 100, contrast: 100, sat: 100, blur: 0, gray: 0, sepia: 0, hue: 0, kenburns: 'none', trans: 'none', transDur: 1 };
  }
  function addMediaClip(m, track, start) {
    pushUndo();
    const t = track || (m.kind === 'audio' ? freeTrack('audio', start) : freeTrack('visual', start));
    const dur = m.kind === 'image' ? 5 : m.duration;
    const c = { id: idSeq++, type: m.kind, media: m.id, name: m.name, track: t, start: snapT(Math.max(0, start)), dur, in: 0, speed: 1, props: defaultProps(), kf: {} };
    project.clips.push(c); selId = c.id;
    renderTimeline(); renderFx(); drawFrame();
    return c;
  }
  // première piste du bon type libre à cet instant (sinon la piste principale)
  function freeTrack(kind, t) {
    const ids = kind === 'audio' ? ['A1', 'A2'] : ['V1', 'V2', 'V3'];
    return ids.find((id) => !project.clips.some((c) => c.track === id && t < c.start + c.dur && t >= c.start - 0.001)) || ids[0];
  }
  function relinkClips(m) { project.clips.forEach((c) => { if (c.mediaName === m.name && !media.has(c.media)) { c.media = m.id; delete c.mediaName; } }); }

  /* ---------------- Titres ---------------- */
  const TITLE_PRESETS = {
    center: { name: 'Titre', text: 'Votre titre', size: 120, weight: 800, color: '#ffffff', box: '', pos: 'center', anim: 'zoom', dur: 4 },
    lower: { name: 'Bandeau bas', text: 'Prénom NOM\nFonction', size: 54, weight: 700, color: '#ffffff', box: '#d9861c', pos: 'lowerleft', anim: 'slide', dur: 5 },
    subtitle: { name: 'Sous-titre', text: 'Texte du sous-titre', size: 48, weight: 600, color: '#ffffff', box: 'rgba(0,0,0,.6)', pos: 'bottom', anim: 'fade', dur: 3 },
    credits: { name: 'Générique', text: 'Réalisation\nVotre nom\n\nMerci d\'avoir regardé', size: 64, weight: 600, color: '#ffffff', box: '', pos: 'center', anim: 'scroll', dur: 8 },
    card: { name: 'Carton', text: 'CHAPITRE 1', size: 110, weight: 900, color: '#1b1f2a', box: '#f2c94c', boxFull: true, pos: 'center', anim: 'typewriter', dur: 4 },
  };
  function addTitle(kind) {
    const p = TITLE_PRESETS[kind]; pushUndo();
    const start = snapT(time);
    const track = ['V3', 'V2'].find((id) => !project.clips.some((c) => c.track === id && start < c.start + c.dur && start + p.dur > c.start)) || 'V3';
    const c = { id: idSeq++, type: 'text', name: p.name, track, start, dur: p.dur, in: 0, speed: 1, props: { ...defaultProps(), text: p.text, font: 'Segoe UI', size: p.size, weight: p.weight, color: p.color, box: p.box, boxFull: !!p.boxFull, pos: p.pos, anim: p.anim, align: p.pos === 'lowerleft' ? 'left' : 'center', stroke: '', shadow: true }, kf: {} };
    project.clips.push(c); selId = c.id; renderTimeline(); renderFx(); drawFrame();
  }

  /* ---------------- Images clés ---------------- */
  const KF_PROPS = ['x', 'y', 'scale', 'rot', 'opacity', 'volume'];
  const ease = (u) => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  function propAt(c, k, t) { // t : temps relatif au début du clip
    const list = c.kf && c.kf[k];
    if (!list || !list.length) return c.props[k];
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      if (t <= list[i][0]) { const [t0, v0] = list[i - 1], [t1, v1] = list[i]; return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0 || 1)); }
    }
    return list[list.length - 1][1];
  }
  function setKf(c, k, t, v) {
    c.kf[k] = c.kf[k] || [];
    const l = c.kf[k], i = l.findIndex((e) => Math.abs(e[0] - t) < 0.5 / fps());
    if (i >= 0) l[i][1] = v; else { l.push([t, v]); l.sort((a, b) => a[0] - b[0]); }
  }

  /* ---------------- Éléments média par clip ---------------- */
  const els = new Map(); // clip.id -> {el, gain}
  let ac = null, recDest = null;
  function ensureAudio() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    recDest = ac.createMediaStreamDestination();
    for (const e of els.values()) connectEl(e);
  }
  function connectEl(e) {
    if (!ac || e.gain) return;
    try {
      const src = ac.createMediaElementSource(e.el); e.gain = ac.createGain();
      src.connect(e.gain); e.gain.connect(ac.destination); e.gain.connect(recDest); e.el.muted = false;
    } catch (err) { console.warn(err); }
  }
  function elFor(c) {
    let e = els.get(c.id); const m = media.get(c.media);
    if (!m) return null;
    if (e && e.media !== m.id) { e.el.pause(); e.el.removeAttribute('src'); els.delete(c.id); e = null; }
    if (!e) {
      const el = document.createElement(c.type === 'audio' ? 'audio' : 'video');
      el.src = m.url; el.preload = 'auto'; el.playsInline = true; el.muted = !ac; el.crossOrigin = 'anonymous';
      e = { el, media: m.id }; els.set(c.id, e); connectEl(e);
    }
    return e;
  }
  function cleanupEls() { const ids = new Set(project.clips.map((c) => c.id)); for (const [id, e] of els) if (!ids.has(id)) { e.el.pause(); els.delete(id); } }

  /* ---------------- Transitions ---------------- */
  // le clip précédent sur la même piste, collé à celui-ci, reste visible pendant la transition
  function prevAdjacent(c) {
    return project.clips.find((p) => p !== c && p.track === c.track && Math.abs(p.start + p.dur - c.start) < 0.02);
  }
  function tailOf(p) { // durée supplémentaire de p imposée par la transition du clip suivant
    const n = project.clips.find((c) => c !== p && c.track === p.track && Math.abs(p.start + p.dur - c.start) < 0.02 && c.props.trans !== 'none');
    return n ? Math.min(n.props.transDur, n.dur) : 0;
  }
  function activeAt(c, t) { return t >= c.start && t < c.start + c.dur + tailOf(c); }

  /* ---------------- Rendu d'une image ---------------- */
  function fadeFactor(c, t, fin, fout) {
    const r = t - c.start; let f = 1;
    if (fin > 0 && r < fin) f *= r / fin;
    if (fout > 0 && r > c.dur - fout) f *= Math.max(0, (c.dur - r) / fout);
    return clamp(f, 0, 1);
  }
  function filterOf(p) {
    const parts = [];
    if (p.bright !== 100) parts.push(`brightness(${p.bright}%)`);
    if (p.contrast !== 100) parts.push(`contrast(${p.contrast}%)`);
    if (p.sat !== 100) parts.push(`saturate(${p.sat}%)`);
    if (p.hue) parts.push(`hue-rotate(${p.hue}deg)`);
    if (p.gray) parts.push(`grayscale(${p.gray}%)`);
    if (p.sepia) parts.push(`sepia(${p.sepia}%)`);
    if (p.blur) parts.push(`blur(${p.blur}px)`);
    return parts.join(' ') || 'none';
  }
  function drawFrame(t = time, c2d = ctx) {
    const W = project.w, H = project.h;
    c2d.save(); c2d.globalAlpha = 1; c2d.filter = 'none';
    c2d.fillStyle = project.bg; c2d.fillRect(0, 0, W, H);
    for (const tr of ['V1', 'V2', 'V3']) {
      if (project.hidden[tr]) continue;
      const list = project.clips.filter((c) => c.track === tr && isVisual(c) && activeAt(c, t)).sort((a, b) => a.start - b.start);
      for (const c of list) drawClip(c2d, c, t);
    }
    c2d.restore();
  }
  function drawClip(c2d, c, t) {
    const W = project.w, H = project.h, p = c.props, rel = t - c.start;
    let alpha = propAt(c, 'opacity', rel) / 100 * fadeFactor(c, t, p.fadeIn, p.fadeOut);
    let sx = 1, dx = 0, dy = 0, clipRect = null;
    // transition d'entrée
    if (p.trans !== 'none' && rel < p.transDur) {
      const u = clamp(rel / p.transDur, 0, 1), e = ease(u);
      if (p.trans === 'dissolve') alpha *= e;
      else if (p.trans === 'black') { if (u < 0.5) alpha = 0; else alpha *= (u - 0.5) * 2; }
      else if (p.trans === 'slideL') dx = (1 - e) * W;
      else if (p.trans === 'slideU') dy = (1 - e) * H;
      else if (p.trans === 'zoom') { sx = 0.6 + 0.4 * e; alpha *= e; }
      else if (p.trans === 'wipe') clipRect = [0, 0, W * e, H];
      else if (p.trans === 'circle') clipRect = ['circle', Math.hypot(W, H) / 2 * e];
    }
    // le clip précédent s'efface pendant un fondu au noir
    const nxt = project.clips.find((n) => n !== c && n.track === c.track && Math.abs(c.start + c.dur - n.start) < 0.02 && n.props.trans === 'black');
    if (nxt && t >= c.start + c.dur) { const u = (t - c.start - c.dur) / nxt.props.transDur; alpha *= Math.max(0, 1 - u * 2); }
    if (alpha <= 0.001) return;
    c2d.save();
    c2d.globalAlpha = alpha; c2d.filter = filterOf(p);
    if (clipRect) { c2d.beginPath(); if (clipRect[0] === 'circle') c2d.arc(W / 2, H / 2, clipRect[1], 0, Math.PI * 2); else c2d.rect(...clipRect); c2d.clip(); }
    const x = propAt(c, 'x', rel), y = propAt(c, 'y', rel), sc = propAt(c, 'scale', rel) / 100, rot = propAt(c, 'rot', rel);
    c2d.translate(W / 2 + x + dx, H / 2 + y + dy); c2d.rotate(rot * Math.PI / 180); c2d.scale(sc * sx, sc * sx);
    if (c.type === 'text') drawText(c2d, c, rel);
    else {
      const m = media.get(c.media);
      let src = null, mw = 0, mh = 0;
      if (!m) { c2d.fillStyle = '#5a1d1d'; c2d.fillRect(-W / 4, -H / 8, W / 2, H / 4); c2d.fillStyle = '#fff'; c2d.font = `${H / 24}px sans-serif`; c2d.textAlign = 'center'; c2d.fillText(`Média manquant : ${c.mediaName || c.name}`, 0, 0); c2d.restore(); return; }
      if (c.type === 'image') { src = m.img; mw = m.w; mh = m.h; }
      else { const e = elFor(c); if (e && e.el.readyState >= 2) { src = e.el; mw = e.el.videoWidth; mh = e.el.videoHeight; } }
      if (src && mw) {
        let k = p.fit === 'cover' ? Math.max(W / mw, H / mh) : p.fit === 'stretch' ? 1 : Math.min(W / mw, H / mh);
        let kw = k, kh = k;
        if (p.fit === 'stretch') { kw = W / mw; kh = H / mh; }
        if (p.kenburns !== 'none') {
          const u = clamp(rel / c.dur, 0, 1), z = p.kenburns === 'in' ? 1 + 0.18 * u : p.kenburns === 'out' ? 1.18 - 0.18 * u : 1.12;
          kw *= z; kh *= z;
          if (p.kenburns === 'pan') c2d.translate((0.5 - u) * W * 0.1, 0);
        }
        c2d.drawImage(src, -mw * kw / 2, -mh * kh / 2, mw * kw, mh * kh);
      }
    }
    c2d.restore();
  }
  function textBlock(c2d, p) {
    c2d.font = `${p.italic ? 'italic ' : ''}${p.weight} ${p.size}px "${p.font}", sans-serif`;
    const lines = String(p.text).split('\n'); const lh = p.size * 1.2;
    const w = Math.max(...lines.map((l) => c2d.measureText(l).width)); return { lines, lh, w, h: lh * lines.length };
  }
  function drawText(c2d, c, rel) {
    const p = c.props, W = project.w, H = project.h;
    const { lines, lh, w, h } = textBlock(c2d, p);
    const pad = p.size * 0.35;
    // position de base selon le préréglage
    let bx = -w / 2, by = -h / 2;
    if (p.pos === 'bottom') by = H / 2 - h - H * 0.08;
    if (p.pos === 'top') by = -H / 2 + H * 0.08;
    if (p.pos === 'lowerleft') { bx = -W / 2 + W * 0.06; by = H / 2 - h - H * 0.12; }
    // animation d'apparition (0,6 s) et de sortie (0,4 s)
    const ain = clamp(rel / 0.6, 0, 1), aout = clamp((c.dur - rel) / 0.4, 0, 1), e = ease(ain);
    let txt = lines, oy = 0, s = 1, a = Math.min(1, aout);
    switch (p.anim) {
      case 'fade': a *= e; break;
      case 'slide': c2d.translate(-(1 - e) * (w + pad * 4), 0); a *= e; break;
      case 'rise': oy = (1 - e) * p.size; a *= e; break;
      case 'zoom': s = 0.7 + 0.3 * e; a *= e; break;
      case 'typewriter': { const n = Math.floor(clamp(rel / Math.max(0.5, Math.min(2, c.dur * 0.5)), 0, 1) * lines.join('\n').length); txt = lines.join('\n').slice(0, n).split('\n'); break; }
      case 'scroll': oy = H / 2 + h / 2 - (rel / c.dur) * (H + h) - by - h / 2 + (-h / 2 - by); a = 1; break;
    }
    c2d.globalAlpha *= a; c2d.translate(0, oy); c2d.scale(s, s);
    if (p.box) {
      c2d.fillStyle = p.box;
      if (p.boxFull) c2d.fillRect(-W, -H, W * 2, H * 2);
      else { c2d.beginPath(); (c2d.roundRect ? c2d.roundRect(bx - pad, by - pad * 0.6, w + pad * 2, h + pad * 1.2, pad * 0.4) : c2d.rect(bx - pad, by - pad * 0.6, w + pad * 2, h + pad * 1.2)); c2d.fill(); }
    }
    c2d.textBaseline = 'top'; c2d.fillStyle = p.color;
    const ax = p.align === 'left' ? bx : p.align === 'right' ? bx + w : bx + w / 2;
    c2d.textAlign = p.align || 'center';
    if (p.shadow && !p.box) { c2d.shadowColor = 'rgba(0,0,0,.6)'; c2d.shadowBlur = p.size / 6; c2d.shadowOffsetY = p.size / 20; }
    txt.forEach((l, i) => {
      if (p.stroke) { c2d.lineWidth = p.size / 12; c2d.strokeStyle = p.stroke; c2d.lineJoin = 'round'; c2d.strokeText(l, ax, by + i * lh); }
      c2d.fillText(l, ax, by + i * lh);
    });
  }

  /* ---------------- Lecture ---------------- */
  let lastTs = 0, raf = 0, exporting = null;
  function syncMedia(t, isPlaying) {
    for (const c of project.clips) {
      if (c.type !== 'video' && c.type !== 'audio') continue;
      const m = media.get(c.media); if (!m) continue;
      const e = elFor(c); const el = e.el;
      const muted = project.muted[c.track] || (isVisual(c) && project.hidden[c.track]);
      if (activeAt(c, t)) {
        const rel = t - c.start, want = clamp(c.in + rel * c.speed, 0, m.duration - 0.01);
        if (e.gain) {
          let v = propAt(c, 'volume', rel) / 100 * fadeFactor(c, t, c.props.aFadeIn, c.props.aFadeOut);
          if (rel > c.dur) v *= Math.max(0, 1 - (rel - c.dur) / Math.max(0.01, tailOf(c)));
          const prev = c.props.trans !== 'none' ? prevAdjacent(c) : null; if (prev && rel < c.props.transDur) v *= ease(rel / c.props.transDur);
          e.gain.gain.value = muted ? 0 : v;
        }
        el.playbackRate = clamp(c.speed, 0.0625, 16);
        if (isPlaying) {
          if (el.paused) { el.currentTime = want; el.play().catch(() => {}); }
          else if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - want) > 0.5 / fps()) el.currentTime = want;
        }
      } else {
        if (!el.paused) el.pause();
        // préchargement juste avant l'entrée du clip
        if (t < c.start && c.start - t < 1.5 && Math.abs(el.currentTime - c.in) > 0.05) el.currentTime = c.in;
      }
    }
  }
  function play() {
    if (playing) return pause();
    ensureAudio(); if (ac.state === 'suspended') ac.resume();
    if (time >= total() - 0.01) time = 0;
    playing = true; $('#playBtn').textContent = '❚❚'; lastTs = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function pause() { playing = false; $('#playBtn').textContent = '▶'; cancelAnimationFrame(raf); syncMedia(time, false); drawFrame(); updatePlayhead(); }
  function tick(ts) {
    const dt = (ts - lastTs) / 1000; lastTs = ts;
    time += dt;
    const end = total();
    if (time >= end) {
      if (exporting) { exporting.finish(); return; }
      if (loop) time = 0; else { time = end; pause(); return; }
    }
    syncMedia(time, true); drawFrame(); updatePlayhead();
    if (exporting) exporting.progress(time / end);
    raf = requestAnimationFrame(tick);
  }
  function seek(t) {
    time = clamp(snapT(t), 0, total());
    syncMedia(time, playing); drawFrame(); updatePlayhead(); renderFxValues();
  }
  // redessine dès qu'une vidéo a fini de se positionner
  setInterval(() => { if (!playing) drawFrame(); }, 250);

  /* ---------------- Timeline ---------------- */
  function renderTimeline() {
    cleanupEls();
    const heads = $('#heads'), inner = $('#lanesInner');
    const width = Math.max($('#lanes').clientWidth, (total() + 10) * pps);
    inner.style.width = width + 'px';
    heads.innerHTML = '<div class="head ruler-h"></div>' + TRACKS.map((t) => `<div class="head ${t.kind === 'audio' ? 'audio' : ''}"><span>${t.label}</span>${t.kind === 'audio'
      ? `<button data-mute="${t.id}" title="Couper le son de la piste" aria-label="Couper ${t.id}">${project.muted[t.id] ? '🔇' : '🔊'}</button>`
      : `<button data-hide="${t.id}" title="Masquer la piste" aria-label="Masquer ${t.id}">${project.hidden[t.id] ? '◌' : '👁'}</button>`}</div>`).join('');
    // règle graduée
    let ruler = '<div class="ruler" id="ruler">';
    const step = pps > 120 ? 1 : pps > 50 ? 2 : pps > 25 ? 5 : 10;
    for (let s = 0; s * pps < width; s += step) ruler += `<div class="tick" style="left:${s * pps}px">${tc(s).slice(3, 8)}</div>`;
    if (pps > 40) for (let s = 0; s * pps < width; s += step / 2) if (s % step) ruler += `<div class="tick minor" style="left:${s * pps}px"></div>`;
    ruler += '</div>';
    let lanes = '';
    for (const t of TRACKS) {
      lanes += `<div class="track ${t.kind === 'audio' ? 'audio' : ''}" data-track="${t.id}">`;
      for (const c of project.clips.filter((x) => x.track === t.id)) {
        const m = media.get(c.media), w = Math.max(4, c.dur * pps);
        let bg = '';
        if (c.type === 'audio' && m) bg = `background-image:url(${waveImage(m, c, w)});background-size:100% 100%`;
        else if (m && m.thumb && c.type !== 'audio') bg = `background-image:url(${m.thumb})`;
        const fx = [c.speed !== 1 ? `${c.speed}×` : '', Object.keys(c.kf || {}).some((k) => c.kf[k].length) ? '◆' : '', filterOf(c.props) !== 'none' ? 'Couleur' : '', c.props.kenburns !== 'none' ? 'Ken Burns' : ''].filter(Boolean).join(' · ');
        lanes += `<div class="clip ${c.type}${c.id === selId ? ' sel' : ''}" data-clip="${c.id}" style="left:${c.start * pps}px;width:${w}px" title="${escapeHtml(c.name)} — ${tc(c.dur)}">
          <div class="bgimg" style="${bg}"></div>${c.props.trans !== 'none' ? `<div class="trans" style="width:${Math.min(w, c.props.transDur * pps)}px"></div>` : ''}
          <div class="lbl">${c.type === 'text' ? 'T  ' + escapeHtml(String(c.props.text).split('\n')[0]) : escapeHtml(c.name)}${!m && c.type !== 'text' ? ' (média manquant)' : ''}</div>
          <div class="fx">${fx}</div><div class="h l" data-edge="l"></div><div class="h r" data-edge="r"></div></div>`;
      }
      lanes += '</div>';
    }
    inner.innerHTML = ruler + lanes + '<div class="playhead" id="playhead"></div>';
    $$('[data-mute]').forEach((b) => b.onclick = () => { project.muted[b.dataset.mute] = !project.muted[b.dataset.mute]; renderTimeline(); syncMedia(time, playing); });
    $$('[data-hide]').forEach((b) => b.onclick = () => { project.hidden[b.dataset.hide] = !project.hidden[b.dataset.hide]; renderTimeline(); drawFrame(); });
    updatePlayhead();
    $('#tcDur').textContent = tc(total());
  }
  function updatePlayhead() {
    const ph = $('#playhead'); if (ph) ph.style.left = time * pps + 'px';
    $('#tcNow').textContent = tc(time);
    if (playing) { const lanes = $('#lanes'), x = time * pps; if (x > lanes.scrollLeft + lanes.clientWidth - 40) lanes.scrollLeft = x - 80; }
  }

  // interactions timeline
  let drag = null;
  const lanesEl = $('#lanes');
  function timeAtX(clientX) { const r = $('#lanesInner').getBoundingClientRect(); return Math.max(0, (clientX - r.left) / pps); }
  function snapCandidates(exclude) {
    const s = [0, time];
    project.clips.forEach((c) => { if (c.id !== exclude) s.push(c.start, c.start + c.dur); });
    return s;
  }
  function doSnap(t, exclude) {
    if (!$('#snapOn').checked) return t;
    const th = 8 / pps; let best = null;
    for (const s of snapCandidates(exclude)) if (Math.abs(s - t) < th && (best == null || Math.abs(s - t) < Math.abs(best - t))) best = s;
    showSnap(best);
    return best ?? t;
  }
  function showSnap(t) { let l = $('#snapline'); if (t == null) { if (l) l.remove(); return; } if (!l) { l = document.createElement('div'); l.id = 'snapline'; l.className = 'snapline'; $('#lanesInner').appendChild(l); } l.style.left = t * pps + 'px'; }

  lanesEl.addEventListener('pointerdown', (e) => {
    const clipEl = e.target.closest('[data-clip]');
    if (e.target.closest('#ruler') || !clipEl) {
      if (!clipEl) { selId = null; renderTimeline(); renderFx(); }
      seek(timeAtX(e.clientX)); drag = { mode: 'scrub' }; lanesEl.setPointerCapture(e.pointerId); return;
    }
    const c = project.clips.find((x) => x.id === +clipEl.dataset.clip);
    if (tool === 'razor') { splitClip(c, snapT(timeAtX(e.clientX))); return; }
    selId = c.id; renderFx();
    $$('.clip.sel').forEach((x) => x.classList.remove('sel')); clipEl.classList.add('sel');
    pushUndo();
    const edge = e.target.dataset.edge;
    drag = { mode: edge ? 'trim' + edge : 'move', c, x0: e.clientX, start: c.start, dur: c.dur, in: c.in, moved: false };
    lanesEl.setPointerCapture(e.pointerId);
  });
  lanesEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.mode === 'scrub') { seek(timeAtX(e.clientX)); return; }
    const c = drag.c, d = (e.clientX - drag.x0) / pps, m = media.get(c.media);
    if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true;
    if (!drag.moved) return;
    if (drag.mode === 'move') {
      let ns = Math.max(0, drag.start + d);
      const sEnd = doSnap(ns + c.dur, c.id); const sStart = doSnap(ns, c.id);
      if (sStart !== ns) ns = sStart; else if (sEnd !== ns + c.dur) ns = sEnd - c.dur;
      c.start = snapT(Math.max(0, ns));
      const tr = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-track]');
      if (tr && trackKind(tr.dataset.track) === (c.type === 'audio' ? 'audio' : 'visual')) c.track = tr.dataset.track;
    } else if (drag.mode === 'trimr') {
      const maxDur = m && c.type !== 'image' ? (m.duration - c.in) / c.speed : Infinity;
      const end = doSnap(drag.start + drag.dur + d, c.id);
      c.dur = snapT(clamp(end - c.start, 1 / fps(), maxDur));
    } else if (drag.mode === 'triml') {
      let ns = doSnap(drag.start + d, c.id);
      const minStart = c.type === 'image' || c.type === 'text' ? -Infinity : drag.start - drag.in / c.speed;
      ns = clamp(ns, Math.max(0, minStart), drag.start + drag.dur - 1 / fps());
      const delta = ns - drag.start;
      c.start = snapT(ns); c.dur = drag.dur - delta; if (c.type !== 'image' && c.type !== 'text') c.in = Math.max(0, drag.in + delta * c.speed);
    }
    renderTimeline(); drawFrame();
  });
  lanesEl.addEventListener('pointerup', () => {
    if (drag && drag.mode !== 'scrub' && !drag.moved) { undoStack.pop(); updHist(); }
    if (drag && drag.moved) { renderFx(); syncMedia(time, playing); }
    drag = null; showSnap(null);
  });
  // dépôt d'un média depuis le panneau Projet
  lanesEl.addEventListener('dragover', (e) => {
    if (!Array.from(e.dataTransfer.types).some((t) => t === 'text/x-media' || t === 'Files')) return;
    e.preventDefault(); $$('.track.over').forEach((x) => x.classList.remove('over'));
    e.target.closest('[data-track]')?.classList.add('over');
  });
  lanesEl.addEventListener('dragleave', () => $$('.track.over').forEach((x) => x.classList.remove('over')));
  lanesEl.addEventListener('drop', async (e) => {
    e.preventDefault(); $$('.track.over').forEach((x) => x.classList.remove('over'));
    const tr = e.target.closest('[data-track]')?.dataset.track; const t = doSnap(timeAtX(e.clientX)); showSnap(null);
    let ids = [];
    const mid = e.dataTransfer.getData('text/x-media');
    if (mid) ids = [mid];
    else if (e.dataTransfer.files.length) { const before = new Set(media.keys()); await importFiles(Array.from(e.dataTransfer.files)); ids = [...media.keys()].filter((k) => !before.has(k)); }
    let at = t;
    for (const id of ids) {
      const m = media.get(id); if (!m) continue;
      const ok = tr && trackKind(tr) === (m.kind === 'audio' ? 'audio' : 'visual');
      const c = addMediaClip(m, ok ? tr : null, at); at = c.start + c.dur;
    }
  });
  $('#lanes').addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return; e.preventDefault();
    setZoom(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX);
  }, { passive: false });
  function setZoom(v, anchorX) {
    const lanes = $('#lanes'); const r = lanes.getBoundingClientRect();
    const ax = anchorX != null ? anchorX - r.left : lanes.clientWidth / 2; const tAt = (lanes.scrollLeft + ax) / pps;
    pps = clamp(v, 5, 400); $('#tlZoom').value = Math.min(300, pps);
    renderTimeline(); lanes.scrollLeft = tAt * pps - ax;
  }
  $('#tlZoom').addEventListener('input', (e) => setZoom(+e.target.value));

  /* ---------------- Opérations sur les clips ---------------- */
  function splitClip(c, t) {
    if (!c || t <= c.start + 1 / fps() || t >= c.start + c.dur - 1 / fps()) { toast('Placez la tête de lecture à l\'intérieur d\'un clip.'); return; }
    pushUndo();
    const cut = t - c.start;
    const b = JSON.parse(JSON.stringify(c)); b.id = idSeq++;
    b.start = t; b.dur = c.dur - cut; if (c.type !== 'image' && c.type !== 'text') b.in = c.in + cut * c.speed;
    b.props.trans = 'none'; b.props.fadeIn = 0; b.props.aFadeIn = 0;
    // les images clés suivent leur moitié
    for (const k of Object.keys(c.kf || {})) { b.kf[k] = c.kf[k].filter((e) => e[0] >= cut).map(([kt, v]) => [kt - cut, v]); c.kf[k] = c.kf[k].filter((e) => e[0] < cut); }
    c.dur = cut; c.props.fadeOut = 0; c.props.aFadeOut = 0;
    project.clips.push(b); selId = b.id; renderTimeline(); renderFx(); drawFrame();
  }
  function splitAtPlayhead() {
    const c = selClip() && activeAt(selClip(), time) && time < selClip().start + selClip().dur ? selClip() : project.clips.filter((x) => time > x.start && time < x.start + x.dur).sort((a, b) => b.track.localeCompare(a.track))[0];
    splitClip(c, time);
  }
  function deleteClip(ripple) {
    const c = selClip(); if (!c) return;
    pushUndo();
    project.clips = project.clips.filter((x) => x !== c);
    if (ripple) project.clips.forEach((x) => { if (x.track === c.track && x.start >= c.start + c.dur - 0.001) x.start = snapT(x.start - c.dur); });
    selId = null; renderTimeline(); renderFx(); drawFrame();
  }
  function detachAudio() {
    const c = selClip(); if (!c || c.type !== 'video') return toast('Sélectionnez un clip vidéo.');
    pushUndo();
    const a = { ...JSON.parse(JSON.stringify(c)), id: idSeq++, type: 'audio', track: freeTrack('audio', c.start), name: c.name + ' (audio)' };
    a.props.volume = c.props.volume; c.props.volume = 0;
    project.clips.push(a); renderTimeline(); renderFx(); toast('Audio détaché sur ' + a.track + ' : vous pouvez le déplacer ou le couper séparément');
  }

  /* ---------------- Panneau Options d'effet ---------------- */
  const sl = (key, label, min, max, step = 1, kf = false, unit = '') => `<div class="slider"><label for="fx_${key}">${label}${kf ? ` <button class="kfb" data-kf="${key}" title="Ajouter / retirer une image clé à la tête de lecture" aria-label="Image clé ${label}" style="padding:0 4px;font-size:11px">◇</button>` : ''}</label><output id="fx_${key}O"></output><input type="range" id="fx_${key}" data-p="${key}" min="${min}" max="${max}" step="${step}" data-unit="${unit}"></div>`;
  function renderFx() {
    const box = $('#fxPanel'); const c = selClip();
    if (!c) {
      box.innerHTML = `<div class="section"><h3>Options d'effet</h3><p class="hint">Sélectionnez un clip dans la timeline pour régler sa position, son échelle, sa vitesse, sa couleur, son son, ses transitions et ses images clés.</p></div>
        <div class="section"><h3>Raccourcis</h3><p class="hint">Espace : lecture · ← → : image par image (Maj : 1 s) · S : couper · Suppr : supprimer · Maj+Suppr : supprimer et combler · V / C : sélection / cutter · Ctrl+molette : zoom timeline · Ctrl+M : exporter</p></div>`;
      return;
    }
    const p = c.props; const vis = isVisual(c), hasAudio = c.type === 'video' || c.type === 'audio';
    let h = `<div class="section"><h3>${escapeHtml(c.type === 'text' ? 'Titre' : c.name)}</h3>
      <div class="grid2"><div class="field"><label for="fx_start">Début (s)</label><input type="number" id="fx_start" step="0.1" min="0" value="${c.start.toFixed(2)}"></div>
      <div class="field"><label for="fx_dur">Durée (s)</label><input type="number" id="fx_dur" step="0.1" min="0.05" value="${c.dur.toFixed(2)}"></div></div>
      ${c.type === 'video' || c.type === 'audio' ? `<div class="field"><label for="fx_speed">Vitesse</label><select id="fx_speed">${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((v) => `<option value="${v}" ${c.speed === v ? 'selected' : ''}>${v}×${v < 1 ? ' (ralenti)' : v > 1 ? ' (accéléré)' : ''}</option>`).join('')}</select></div>` : ''}</div>`;
    if (c.type === 'text') h += `<div class="section"><h3>Texte</h3><textarea id="fx_text" aria-label="Texte du titre">${escapeHtml(p.text)}</textarea>
      <div class="grid2"><div class="field"><label for="fx_font">Police</label><select id="fx_font">${['Segoe UI', 'Arial', 'Georgia', 'Impact', 'Verdana', 'Trebuchet MS', 'Courier New', 'Brush Script MT', 'Arial Black'].map((f) => `<option ${p.font === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      <div class="field"><label for="fx_size">Taille</label><input type="number" id="fx_size" value="${p.size}" min="8" max="600"></div></div>
      <div class="row"><label for="fx_color">Couleur</label><input type="color" id="fx_color" value="${p.color}"><label><input type="checkbox" id="fx_boxOn" ${p.box ? 'checked' : ''}> Fond</label><input type="color" id="fx_boxC" value="${/^#/.test(p.box) ? p.box : '#000000'}"><label><input type="checkbox" id="fx_boxFull" ${p.boxFull ? 'checked' : ''}> Plein écran</label></div>
      <div class="row"><label><input type="checkbox" id="fx_shadow" ${p.shadow ? 'checked' : ''}> Ombre</label><label><input type="checkbox" id="fx_strokeOn" ${p.stroke ? 'checked' : ''}> Contour</label><input type="color" id="fx_strokeC" value="${p.stroke || '#000000'}"><label><input type="checkbox" id="fx_italic" ${p.italic ? 'checked' : ''}> Italique</label></div>
      <div class="grid2"><div class="field"><label for="fx_pos">Position</label><select id="fx_pos">${[['center', 'Centre'], ['top', 'Haut'], ['bottom', 'Bas'], ['lowerleft', 'Bas gauche']].map(([v, l]) => `<option value="${v}" ${p.pos === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="fx_anim">Animation</label><select id="fx_anim">${[['none', 'Aucune'], ['fade', 'Fondu'], ['slide', 'Glissement'], ['rise', 'Montée'], ['zoom', 'Zoom'], ['typewriter', 'Machine à écrire'], ['scroll', 'Défilement (générique)']].map(([v, l]) => `<option value="${v}" ${p.anim === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><label for="fx_align">Alignement</label><select id="fx_align">${[['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']].map(([v, l]) => `<option value="${v}" ${p.align === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`;
    if (vis) h += `<div class="section"><h3>Trajectoire <span class="badge">◆ images clés</span></h3>
      ${sl('x', 'Position X', -project.w, project.w, 1, true, ' px')}${sl('y', 'Position Y', -project.h, project.h, 1, true, ' px')}
      ${sl('scale', 'Échelle', 5, 400, 1, true, ' %')}${sl('rot', 'Rotation', -360, 360, 1, true, '°')}${sl('opacity', 'Opacité', 0, 100, 1, true, ' %')}
      ${c.type !== 'text' ? `<div class="grid2"><div class="field"><label for="fx_fit">Cadrage</label><select id="fx_fit"><option value="contain" ${p.fit === 'contain' ? 'selected' : ''}>Ajuster (bandes)</option><option value="cover" ${p.fit === 'cover' ? 'selected' : ''}>Remplir (rogner)</option><option value="stretch" ${p.fit === 'stretch' ? 'selected' : ''}>Étirer</option></select></div>
      <div class="field"><label for="fx_kb">Effet Ken Burns</label><select id="fx_kb">${[['none', 'Aucun'], ['in', 'Zoom avant'], ['out', 'Zoom arrière'], ['pan', 'Panoramique']].map(([v, l]) => `<option value="${v}" ${p.kenburns === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>` : ''}
      <div class="row"><button id="kfClear">Effacer les images clés</button><button id="kfPrev" title="Image clé précédente">◆◀</button><button id="kfNext" title="Image clé suivante">▶◆</button></div></div>
      <div class="section"><h3>Transition d'entrée</h3><div class="grid2"><div class="field"><label for="fx_trans">Type</label><select id="fx_trans">${[['none', 'Aucune (cut)'], ['dissolve', 'Fondu enchaîné'], ['black', 'Fondu au noir'], ['slideL', 'Glissement'], ['slideU', 'Poussée vers le haut'], ['zoom', 'Zoom'], ['wipe', 'Volet'], ['circle', 'Iris (cercle)']].map(([v, l]) => `<option value="${v}" ${p.trans === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="fx_transDur">Durée (s)</label><input type="number" id="fx_transDur" step="0.1" min="0.1" max="5" value="${p.transDur}"></div></div>
      <p class="hint">Avec le clip qui précède sur la même piste (collé bord à bord), la transition se fait entre les deux plans.</p>
      ${sl('fadeIn', 'Fondu d\'ouverture', 0, 5, 0.1, false, ' s')}${sl('fadeOut', 'Fondu de fermeture', 0, 5, 0.1, false, ' s')}</div>`;
    if (c.type === 'video' || c.type === 'image') h += `<div class="section"><h3>Couleur (Lumetri)</h3>
      <div class="row">${Object.keys(LOOKS).map((k) => `<button data-look="${k}" style="padding:3px 8px;font-size:12px">${k}</button>`).join('')}</div>
      ${sl('bright', 'Luminosité', 0, 200, 1, false, ' %')}${sl('contrast', 'Contraste', 0, 200, 1, false, ' %')}${sl('sat', 'Saturation', 0, 300, 1, false, ' %')}${sl('hue', 'Teinte', -180, 180, 1, false, '°')}${sl('gray', 'Noir et blanc', 0, 100, 1, false, ' %')}${sl('sepia', 'Sépia', 0, 100, 1, false, ' %')}${sl('blur', 'Flou', 0, 30, 0.5, false, ' px')}</div>`;
    if (hasAudio) h += `<div class="section"><h3>Audio</h3>${sl('volume', 'Volume', 0, 300, 1, true, ' %')}${sl('aFadeIn', 'Fondu audio d\'entrée', 0, 10, 0.1, false, ' s')}${sl('aFadeOut', 'Fondu audio de sortie', 0, 10, 0.1, false, ' s')}
      ${c.type === 'video' ? '<button data-act="detach">Détacher l\'audio sur une piste séparée</button>' : ''}</div>`;
    h += `<div class="section"><div class="row"><button data-act="split">✂ Couper ici</button><button data-act="duplicate">Dupliquer</button><button data-act="delete" class="danger">Supprimer</button></div></div>`;
    box.innerHTML = h;
    bindFx(c); renderFxValues();
  }
  const LOOKS = {
    'Neutre': { bright: 100, contrast: 100, sat: 100, hue: 0, gray: 0, sepia: 0, blur: 0 },
    'Cinéma': { bright: 95, contrast: 125, sat: 85, hue: -8, gray: 0, sepia: 10, blur: 0 },
    'Chaud': { bright: 104, contrast: 105, sat: 115, hue: -10, gray: 0, sepia: 22, blur: 0 },
    'Froid': { bright: 100, contrast: 108, sat: 90, hue: 12, gray: 0, sepia: 0, blur: 0 },
    'Vif': { bright: 104, contrast: 115, sat: 150, hue: 0, gray: 0, sepia: 0, blur: 0 },
    'Noir et blanc': { bright: 100, contrast: 125, sat: 100, hue: 0, gray: 100, sepia: 0, blur: 0 },
    'Vintage': { bright: 106, contrast: 85, sat: 70, hue: -5, gray: 0, sepia: 45, blur: 0 },
  };
  function renderFxValues() {
    const c = selClip(); if (!c) return;
    const rel = clamp(time - c.start, 0, c.dur);
    $$('#fxPanel [data-p]').forEach((inp) => {
      const k = inp.dataset.p; const v = KF_PROPS.includes(k) ? propAt(c, k, rel) : c.props[k];
      if (document.activeElement !== inp) inp.value = v;
      $('#fx_' + k + 'O').textContent = (Math.round(v * 10) / 10).toLocaleString('fr-FR') + (inp.dataset.unit || '');
      const kb = $(`[data-kf="${k}"]`);
      if (kb) { const on = (c.kf[k] || []).some((e) => Math.abs(e[0] - rel) < 0.5 / fps()); kb.textContent = on ? '◆' : '◇'; kb.style.color = (c.kf[k] || []).length ? 'var(--accent)' : ''; }
    });
  }
  function bindFx(c) {
    let armed = false;
    const arm = () => { if (!armed) { pushUndo(); armed = true; setTimeout(() => { armed = false; }, 700); } };
    const refresh = (tl) => { drawFrame(); renderFxValues(); if (tl) renderTimeline(); };
    $$('#fxPanel [data-p]').forEach((inp) => inp.addEventListener('input', () => {
      arm(); const k = inp.dataset.p, v = +inp.value, rel = clamp(time - c.start, 0, c.dur);
      if (KF_PROPS.includes(k) && (c.kf[k] || []).length) setKf(c, k, rel, v); else c.props[k] = v;
      refresh(false); syncMedia(time, playing);
    }));
    $$('#fxPanel [data-kf]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); arm(); const k = b.dataset.kf, rel = clamp(time - c.start, 0, c.dur);
      c.kf[k] = c.kf[k] || [];
      const i = c.kf[k].findIndex((x) => Math.abs(x[0] - rel) < 0.5 / fps());
      if (i >= 0) c.kf[k].splice(i, 1); else setKf(c, k, rel, propAt(c, k, rel));
      refresh(true);
    }));
    const on = (id, ev, fn, tl) => { const el = $('#' + id); if (el) el.addEventListener(ev, () => { arm(); fn(el); refresh(tl); }); };
    on('fx_start', 'change', (el) => { c.start = snapT(Math.max(0, +el.value)); }, true);
    on('fx_dur', 'change', (el) => { const m = media.get(c.media); const max = m && c.type !== 'image' && c.type !== 'text' ? (m.duration - c.in) / c.speed : 36000; c.dur = snapT(clamp(+el.value, 1 / fps(), max)); }, true);
    on('fx_speed', 'change', (el) => { const ns = +el.value; const m = media.get(c.media); c.dur = c.dur * c.speed / ns; if (m) c.dur = Math.min(c.dur, (m.duration - c.in) / ns); c.speed = ns; }, true);
    on('fx_text', 'input', (el) => { c.props.text = el.value; }, true);
    on('fx_font', 'change', (el) => { c.props.font = el.value; });
    on('fx_size', 'input', (el) => { c.props.size = +el.value; });
    on('fx_color', 'input', (el) => { c.props.color = el.value; });
    on('fx_boxOn', 'change', (el) => { c.props.box = el.checked ? $('#fx_boxC').value : ''; });
    on('fx_boxC', 'input', (el) => { c.props.box = el.value; $('#fx_boxOn').checked = true; });
    on('fx_boxFull', 'change', (el) => { c.props.boxFull = el.checked; });
    on('fx_shadow', 'change', (el) => { c.props.shadow = el.checked; });
    on('fx_strokeOn', 'change', (el) => { c.props.stroke = el.checked ? $('#fx_strokeC').value : ''; });
    on('fx_strokeC', 'input', (el) => { c.props.stroke = el.value; $('#fx_strokeOn').checked = true; });
    on('fx_italic', 'change', (el) => { c.props.italic = el.checked; });
    on('fx_pos', 'change', (el) => { c.props.pos = el.value; if (el.value === 'lowerleft') c.props.align = 'left'; });
    on('fx_anim', 'change', (el) => { c.props.anim = el.value; });
    on('fx_align', 'change', (el) => { c.props.align = el.value; });
    on('fx_fit', 'change', (el) => { c.props.fit = el.value; });
    on('fx_kb', 'change', (el) => { c.props.kenburns = el.value; }, true);
    on('fx_trans', 'change', (el) => { c.props.trans = el.value; }, true);
    on('fx_transDur', 'change', (el) => { c.props.transDur = clamp(+el.value, 0.1, 5); }, true);
    $$('#fxPanel [data-look]').forEach((b) => b.addEventListener('click', () => { arm(); Object.assign(c.props, LOOKS[b.dataset.look]); refresh(true); }));
    const kc = $('#kfClear'); if (kc) kc.onclick = () => { arm(); c.kf = {}; refresh(true); };
    const jump = (dir) => { const ts = [...new Set(Object.values(c.kf).flat().map((e) => c.start + e[0]))].sort((a, b) => a - b); const t = dir > 0 ? ts.find((x) => x > time + 1e-3) : ts.reverse().find((x) => x < time - 1e-3); if (t != null) seek(t); };
    const kp = $('#kfPrev'); if (kp) kp.onclick = () => jump(-1);
    const kn = $('#kfNext'); if (kn) kn.onclick = () => jump(1);
    $$('#fxPanel [data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  }

  /* ---------------- Export ---------------- */
  function pickMime() {
    const cands = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return cands.filter((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  }
  async function exportDialog() {
    if (!project.clips.length) return toast('La timeline est vide.');
    const mimes = pickMime();
    if (!mimes.length || !cv.captureStream) return toast('Ce navigateur ne sait pas enregistrer de vidéo. Utilisez Chrome, Edge ou Firefox récent.', 6000);
    const hasMp4 = mimes.some((m) => m.startsWith('video/mp4'));
    const res = await modal({
      title: 'Exporter la vidéo',
      body: `<div class="field"><label for="exN">Nom du fichier</label><input type="text" id="exN" value="mon-montage"></div>
        <div class="grid2"><div class="field"><label for="exF">Format</label><select id="exF">${hasMp4 ? '<option value="mp4">MP4 (WhatsApp, YouTube, téléphones)</option>' : ''}<option value="webm">WebM</option></select></div>
        <div class="field"><label for="exQ">Qualité</label><select id="exQ"><option value="4">Standard (4 Mb/s)</option><option value="8" selected>Haute (8 Mb/s)</option><option value="16">Très haute (16 Mb/s)</option><option value="2">Légère (2 Mb/s)</option></select></div></div>
        <p class="hint">Format ${project.w} × ${project.h}, ${project.fps} images/s, durée ${tc(total())}. L'export se fait en temps réel : gardez cet onglet affiché jusqu'à la fin.${hasMp4 ? '' : ' Ce navigateur n\'enregistre qu\'en WebM (lisible par VLC, YouTube, Chrome).'}</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Exporter', primary: true, value: (b) => ({ n: b.querySelector('#exN').value || 'video', f: b.querySelector('#exF').value, q: +b.querySelector('#exQ').value }) }],
    });
    if (!res) return;
    runExport(res, mimes.find((m) => m.startsWith('video/' + res.f)) || mimes[0]);
  }
  function runExport(opt, mime) {
    if (playing) pause();
    ensureAudio(); if (ac.state === 'suspended') ac.resume();
    const stream = new MediaStream([...cv.captureStream(project.fps).getVideoTracks(), ...recDest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opt.q * 1e6, audioBitsPerSecond: 192000 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const ov = document.createElement('div'); ov.className = 'export-ov';
    ov.innerHTML = `<div class="box"><strong>Export en cours…</strong><div class="bar"><div id="exBar"></div></div><span class="hint" id="exTxt">0 %</span><button id="exCancel">Annuler</button></div>`;
    document.body.appendChild(ov);
    let cancelled = false;
    ov.querySelector('#exCancel').onclick = () => { cancelled = true; exporting.finish(); };
    rec.onstop = () => {
      ov.remove();
      if (cancelled) { toast('Export annulé'); return; }
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      download(blob, `${opt.n}.${ext}`); toast(`Vidéo exportée (${(blob.size / 1048576).toFixed(1).replace('.', ',')} Mo)`, 5000);
    };
    exporting = {
      progress: (u) => { const pc = Math.min(100, Math.round(u * 100)); $('#exBar').style.width = pc + '%'; $('#exTxt').textContent = `${pc} % — ${tc(time)} / ${tc(total())}`; },
      finish: () => { exporting = null; playing = false; cancelAnimationFrame(raf); $('#playBtn').textContent = '▶'; syncMedia(time, false); setTimeout(() => rec.state !== 'inactive' && rec.stop(), 250); },
    };
    // pré-positionne tous les médias au début puis lance l'enregistrement
    time = 0; syncMedia(0, false); drawFrame();
    setTimeout(() => { rec.start(250); playing = true; lastTs = performance.now(); raf = requestAnimationFrame(tick); }, 600);
  }
  function snapshot() { cv.toBlob((b) => { download(b, `image-${tc(time).replace(/:/g, '-')}.png`); toast('Image exportée'); }, 'image/png'); }

  /* ---------------- Projet ---------------- */
  function applySeq() {
    cv.width = project.w; cv.height = project.h;
    $('#seqFmt').value = `${project.w}x${project.h}`; $('#seqFps').value = project.fps; $('#seqBg').value = project.bg;
    $('#fmtBadge').textContent = `${project.w}×${project.h} · ${project.fps} i/s`;
  }
  $('#seqFmt').addEventListener('change', (e) => { pushUndo(); const [w, h] = e.target.value.split('x').map(Number); project.w = w; project.h = h; applySeq(); drawFrame(); renderFx(); });
  $('#seqFps').addEventListener('change', (e) => { pushUndo(); project.fps = +e.target.value; applySeq(); renderTimeline(); });
  $('#seqBg').addEventListener('input', (e) => { project.bg = e.target.value; drawFrame(); });
  function saveProject() {
    const data = { app: 'video-joe', v: 1, ...JSON.parse(snap()) };
    data.clips.forEach((c) => { const m = media.get(c.media); if (m) c.mediaName = m.name; });
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'montage.joevideo');
    toast('Projet enregistré (les médias restent sur votre appareil)');
  }
  async function openProject(f) {
    const data = JSON.parse(await f.text()); if (data.app !== 'video-joe') throw new Error('fichier de projet invalide');
    pushUndo(); delete data.app; delete data.v;
    project = data; idSeq = 1 + Math.max(0, ...project.clips.map((c) => c.id));
    // relie les médias déjà importés portant le même nom
    project.clips.forEach((c) => { const m = [...media.values()].find((x) => x.name === c.mediaName); c.media = m ? m.id : null; });
    const missing = [...new Set(project.clips.filter((c) => c.type !== 'text' && !media.has(c.media)).map((c) => c.mediaName))];
    applySeq(); renderTimeline(); renderFx(); drawFrame();
    if (missing.length) {
      const ok = await modal({ title: 'Médias à relier', body: `<p style="margin:0">Le projet utilise ${missing.length} fichier(s) à sélectionner de nouveau :</p><ul>${missing.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`, buttons: [{ label: 'Plus tard', value: false }, { label: 'Sélectionner les fichiers', primary: true, value: true }] });
      if (ok) importFiles(await pickFiles('video/*,audio/*,image/*'));
    }
  }
  async function newProject() {
    const ok = await Studio.confirmBox('Vider la timeline et commencer un nouveau montage ? Les médias importés restent disponibles.', 'Nouveau projet');
    if (!ok) return;
    pushUndo(); project.clips = []; selId = null; time = 0; renderTimeline(); renderFx(); drawFrame();
  }

  /* ---------------- Traduction des titres (IA Claude, en ligne) ---------------- */
  async function translateTitles() {
    const titles = project.clips.filter((c) => c.type === 'text' && String(c.props.text).trim());
    if (!titles.length) return toast('Aucun titre dans la timeline.');
    const res = await modal({
      title: 'Traduire les titres et sous-titres',
      body: `<div class="field"><label for="trTo">Traduire vers</label><select id="trTo">${Studio.translate.options()}</select></div>
        <div class="field"><label for="trWhere">Où</label><select id="trWhere"><option value="replace">Remplacer les textes</option><option value="track">Garder l'original et ajouter la traduction sur une autre piste (sous-titres bilingues)</option></select></div>
        <p class="hint" style="margin:0">${titles.length} titre${titles.length > 1 ? 's' : ''} à traduire.</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Traduire', primary: true, value: (b) => ({ to: b.querySelector('#trTo').value, where: b.querySelector('#trWhere').value }) }],
    });
    if (!res) return;
    Studio.translate.saveTarget(res.to);
    const key = await Studio.translate.ensureKey('le texte des titres'); if (!key) return;
    toast('Traduction en cours…', 60000);
    let tr;
    try { tr = await Studio.translate.translateTexts(key, titles.map((c) => c.props.text), res.to, { context: 'Ce sont des titres et sous-titres de vidéo : garde des phrases courtes et les retours à la ligne.' }); }
    catch (e) { toast('Traduction impossible : ' + (e.message || e), 6000); return; }
    pushUndo();
    titles.forEach((c, i) => {
      if (res.where === 'replace') { c.props.text = tr[i]; return; }
      const d = JSON.parse(JSON.stringify(c)); d.id = idSeq++; d.props.text = tr[i]; d.name = `${c.name} (${res.to})`;
      d.track = c.track === 'V3' ? 'V2' : 'V3'; d.props.pos = 'bottom'; d.props.size = Math.round(c.props.size * 0.8); d.props.y = (d.props.y || 0) + 20;
      project.clips.push(d);
    });
    renderTimeline(); renderFx(); drawFrame(); toast(`${titles.length} titre${titles.length > 1 ? 's' : ''} traduit${titles.length > 1 ? 's' : ''}`);
  }

  /* ---------------- Actions et raccourcis ---------------- */
  async function act(a) {
    try {
      switch (a) {
        case 'import': return importFiles(await pickFiles('video/*,audio/*,image/*'));
        case 'newProject': return newProject();
        case 'saveProject': return saveProject();
        case 'openProject': { const [f] = await pickFiles('.joevideo,application/json', false); if (f) await openProject(f); return; }
        case 'export': return exportDialog();
        case 'snapshot': return snapshot();
        case 'undo': return undo();
        case 'redo': return redo();
        case 'split': return splitAtPlayhead();
        case 'delete': return deleteClip(false);
        case 'ripple': return deleteClip(true);
        case 'detach': return detachAudio();
        case 'translateTitles': return translateTitles();
        case 'duplicate': { const c = selClip(); if (!c) return; pushUndo(); const d = JSON.parse(JSON.stringify(c)); d.id = idSeq++; d.start = snapT(c.start + c.dur); project.clips.push(d); selId = d.id; renderTimeline(); renderFx(); return; }
        case 'play': return play();
        case 'toStart': return seek(0);
        case 'toEnd': return seek(total());
        case 'frameBack': return seek(time - 1 / fps());
        case 'frameFwd': return seek(time + 1 / fps());
        case 'loop': loop = !loop; $('#loopBtn').classList.toggle('primary', loop); return;
        case 'fitTl': return setZoom(($('#lanes').clientWidth - 40) / total());
      }
    } catch (e) { console.error(e); toast('Erreur : ' + (e.message || e), 5000); }
  }
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  $$('[data-title]').forEach((b) => b.addEventListener('click', () => addTitle(b.dataset.title)));
  $$('.tl-bar [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  function setTool(t) { tool = t; $$('.tl-bar [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t)); $('#lanes').style.cursor = t === 'razor' ? 'crosshair' : ''; }
  document.addEventListener('keydown', (e) => {
    if (exporting || document.querySelector('.modal-back') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod) {
      const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: 'saveProject', m: 'export', i: 'import', d: 'duplicate', k: 'split' };
      if (map[k]) { e.preventDefault(); act(map[k]); } return;
    }
    if (e.key === ' ') { e.preventDefault(); play(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(time - (e.shiftKey ? 1 : 1 / fps())); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(time + (e.shiftKey ? 1 : 1 / fps())); }
    else if (e.key === 'Home') seek(0);
    else if (e.key === 'End') seek(total());
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteClip(e.shiftKey); }
    else if (k === 's') splitAtPlayhead();
    else if (k === 'v') setTool('select');
    else if (k === 'c') setTool('razor');
    else if (k === 'l') act('loop');
  });
  onDropFiles($('#drop'), importFiles);
  window.addEventListener('resize', () => renderTimeline());
  initMenus();

  // projet d'exemple : deux titres pour montrer la timeline
  project.clips.push({ id: idSeq++, type: 'text', name: 'Titre', track: 'V2', start: 0, dur: 4, in: 0, speed: 1, props: { ...defaultProps(), text: 'Votre film commence ici', font: 'Segoe UI', size: 110, weight: 800, color: '#ffffff', box: '', pos: 'center', anim: 'zoom', align: 'center', shadow: true }, kf: {} });
  project.clips.push({ id: idSeq++, type: 'text', name: 'Bandeau bas', track: 'V3', start: 1.5, dur: 4, in: 0, speed: 1, props: { ...defaultProps(), text: 'Importez vos vidéos à gauche\npuis glissez-les ici', font: 'Segoe UI', size: 46, weight: 700, color: '#ffffff', box: '#d9861c', pos: 'lowerleft', anim: 'slide', align: 'left', shadow: true }, kf: {} });
  applySeq(); renderTimeline(); renderFx(); drawFrame(); updHist();

  window.VideoJoe = { get project() { return project; }, importFiles, act, seek, drawFrame, addTitle, splitClip, get time() { return time; }, media, pickMime };
})();
