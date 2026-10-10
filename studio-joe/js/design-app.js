/* Design Joe — éditeur vectoriel (formes, plume, crayon, texte, images, groupes, dégradés,
   alignement, repères magnétiques, modèles, export PNG/JPG/SVG/PDF). */
(function () {
  const { $, $$, toast, download, pickFiles, baseName, initMenus, modal, store, onDropFiles, loadImage, readAsDataURL, clamp } = Studio;
  const NS = 'http://www.w3.org/2000/svg';
  const board = $('#board');

  /* ---------------- État ---------------- */
  let state = { name: 'sans-titre', w: 1080, h: 1080, bg: '#ffffff', objects: [] };
  let selIds = [];
  let tool = 'select';
  let zoom = 1;
  let idSeq = 1;
  let clipboard = null;
  let snapOn = store('designjoe-snap') ?? true;
  const undoStack = [], redoStack = [];
  const defaults = Object.assign({ fill: '#d9861c', stroke: '#1b1f2a', sw: 0, font: 'Segoe UI', fontSize: 64 }, store('designjoe-defaults') || {});

  const uid = () => idSeq++;
  const byId = (id) => state.objects.find((o) => o.id === id);
  const selected = () => selIds.map(byId).filter(Boolean);
  const isPathy = (o) => o.type === 'path' || o.type === 'line';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- Historique ---------------- */
  const snap = () => JSON.stringify(state);
  function pushUndo() { undoStack.push(snap()); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; updateHist(); }
  function restoreJSON(j) { state = JSON.parse(j); idSeq = 1 + Math.max(0, ...allObjects(state.objects).map((o) => o.id)); selIds = selIds.filter((id) => byId(id)); render(); renderSide(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); restoreJSON(undoStack.pop()); updateHist(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restoreJSON(redoStack.pop()); updateHist(); }
  function updateHist() { $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length; }
  const allObjects = (list) => list.flatMap((o) => (o.type === 'group' ? [o, ...allObjects(o.children)] : [o]));

  /* ---------------- Géométrie ---------------- */
  function getBox(o) {
    if (isPathy(o)) {
      const xs = o.pts.map((p) => p[0]), ys = o.pts.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    if (o.type === 'group') return unionBox(o.children.map(getBox));
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  }
  function unionBox(bs) {
    if (!bs.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
  }
  function setBox(o, nb) {
    const b = getBox(o);
    const sx = b.w ? nb.w / b.w : 1, sy = b.h ? nb.h / b.h : 1;
    const map = (x, y) => [nb.x + (x - b.x) * sx, nb.y + (y - b.y) * sy];
    if (isPathy(o)) { o.pts = o.pts.map(([x, y]) => map(x, y)); return; }
    if (o.type === 'group') {
      o.children.forEach((c) => {
        const cb = getBox(c); const [x, y] = map(cb.x, cb.y);
        setBox(c, { x, y, w: cb.w * sx, h: cb.h * sy });
      });
      return;
    }
    if (o.type === 'text' && b.w) { o.fontSize = Math.max(2, o.fontSize * (nb.w / b.w)); measureText(o); o.x = nb.x; o.y = nb.y; return; }
    Object.assign(o, nb);
  }
  const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const rotPt = (p, c, deg) => { const a = deg * Math.PI / 180, dx = p.x - c.x, dy = p.y - c.y; return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) }; };

  const mctx = document.createElement('canvas').getContext('2d');
  function measureText(o) {
    mctx.font = `${o.italic ? 'italic ' : ''}${o.fontWeight || 400} ${o.fontSize}px "${o.fontFamily}", sans-serif`;
    const lines = String(o.text).split('\n');
    const ls = (o.letterSpacing || 0);
    o.w = Math.max(4, ...lines.map((l) => mctx.measureText(l).width + ls * Math.max(0, [...l].length - 1)));
    o.h = o.fontSize * ((o.lineHeight || 1.2) * (lines.length - 1) + 1.15);
  }

  /* ---------------- Rendu SVG ---------------- */
  function smoothPath(pts, closed) {
    if (pts.length < 3) return 'M' + pts.map((p) => p.join(' ')).join(' L');
    const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
    let d = `M${P[1][0]} ${P[1][1]}`;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 1; i <= n; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d + (closed ? ' Z' : '');
  }
  function polyPoints(o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = o.w / 2, ry = o.h / 2, pts = [];
    const n = o.type === 'star' ? (o.points || 5) * 2 : (o.sides || 6);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      const r = o.type === 'star' && i % 2 ? (o.inner || 0.45) : 1;
      pts.push(`${(cx + Math.cos(a) * rx * r).toFixed(2)},${(cy + Math.sin(a) * ry * r).toFixed(2)}`);
    }
    return pts.join(' ');
  }
  function paintAttr(o, key, defs) {
    const v = o[key];
    if (!v || v === 'none') return 'none';
    if (key === 'fill' && o.fill2 && o.fillType === 'gradient') {
      const gid = `grad${o.id}`;
      if (o.gradKind === 'radial') defs.push(`<radialGradient id="${gid}"><stop offset="0" stop-color="${v}"/><stop offset="1" stop-color="${o.fill2}"/></radialGradient>`);
      else defs.push(`<linearGradient id="${gid}" gradientTransform="rotate(${o.gradAngle || 0} .5 .5)"><stop offset="0" stop-color="${v}"/><stop offset="1" stop-color="${o.fill2}"/></linearGradient>`);
      return `url(#${gid})`;
    }
    return v;
  }
  function objSvg(o, defs, forExport) {
    if (o.hidden) return '';
    const b = getBox(o), c = center(b);
    let tf = '';
    if (o.rot) tf += `rotate(${o.rot} ${c.x} ${c.y}) `;
    if (o.flipX || o.flipY) tf += `translate(${c.x} ${c.y}) scale(${o.flipX ? -1 : 1} ${o.flipY ? -1 : 1}) translate(${-c.x} ${-c.y})`;
    let filter = '';
    if (o.shadow) {
      defs.push(`<filter id="sh${o.id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${o.shadowX ?? 6}" dy="${o.shadowY ?? 8}" stdDeviation="${o.shadowBlur ?? 8}" flood-color="${o.shadowColor || '#000'}" flood-opacity="${o.shadowOpacity ?? 0.35}"/></filter>`);
      filter = ` filter="url(#sh${o.id})"`;
    }
    const fill = paintAttr(o, 'fill', defs);
    const st = o.stroke && o.sw ? ` stroke="${o.stroke}" stroke-width="${o.sw}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"` : '';
    const common = `fill="${fill}"${st}`;
    let inner = '';
    switch (o.type) {
      case 'rect': inner = `<rect x="${o.x}" y="${o.y}" width="${Math.max(0, o.w)}" height="${Math.max(0, o.h)}" rx="${o.radius || 0}" ${common}/>`; break;
      case 'ellipse': inner = `<ellipse cx="${c.x}" cy="${c.y}" rx="${Math.max(0, o.w / 2)}" ry="${Math.max(0, o.h / 2)}" ${common}/>`; break;
      case 'polygon': case 'star': inner = `<polygon points="${polyPoints(o)}" ${common}/>`; break;
      case 'line': case 'path': {
        const d = o.smooth ? smoothPath(o.pts, o.closed) : 'M' + o.pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L') + (o.closed ? ' Z' : '');
        const markers = o.type === 'line' && o.arrow ? arrowHead(o) : '';
        inner = `<path d="${d}" ${o.closed ? common : `fill="none" stroke="${o.stroke || '#000'}" stroke-width="${o.sw || 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} stroke-linecap="round" stroke-linejoin="round"`}/>${markers}`;
        if (!forExport) inner += `<path d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(12, (o.sw || 2) + 8) / zoom}" pointer-events="stroke"/>`;
        break;
      }
      case 'text': {
        const anchor = { left: 'start', center: 'middle', right: 'end' }[o.align || 'left'];
        const tx = o.align === 'center' ? c.x : o.align === 'right' ? b.x + b.w : b.x;
        const lines = String(o.text).split('\n');
        inner = `<text x="${tx}" y="${o.y + o.fontSize * 0.86}" font-family="${esc(o.fontFamily)}, sans-serif" font-size="${o.fontSize}" font-weight="${o.fontWeight || 400}"${o.italic ? ' font-style="italic"' : ''}${o.letterSpacing ? ` letter-spacing="${o.letterSpacing}"` : ''}${o.underline ? ' text-decoration="underline"' : ''} text-anchor="${anchor}" ${common} xml:space="preserve">${lines.map((l, i) => `<tspan x="${tx}" dy="${i ? o.fontSize * (o.lineHeight || 1.2) : 0}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
        break;
      }
      case 'image': inner = `<image href="${o.href}" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" preserveAspectRatio="none"${o.radius ? ` clip-path="url(#clip${o.id})"` : ''}/>`;
        if (o.radius) defs.push(`<clipPath id="clip${o.id}"><rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.radius}"/></clipPath>`);
        if (o.stroke && o.sw) inner += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.radius || 0}" fill="none"${st}/>`;
        break;
      case 'group': inner = o.children.map((ch) => objSvg(ch, defs, forExport)).join(''); break;
    }
    const hit = !forExport && !isPathy(o) ? `<rect x="${b.x}" y="${b.y}" width="${Math.max(1, b.w)}" height="${Math.max(1, b.h)}" fill="transparent" pointer-events="all"/>` : '';
    return `<g${forExport ? '' : ` data-id="${o.id}"`}${tf ? ` transform="${tf.trim()}"` : ''}${o.opacity != null && o.opacity < 1 ? ` opacity="${o.opacity}"` : ''}${o.blend && o.blend !== 'normal' ? ` style="mix-blend-mode:${o.blend}"` : ''}${filter}>${hit}${inner}</g>`;
  }
  function arrowHead(o) {
    const [a, b] = [o.pts[o.pts.length - 2], o.pts[o.pts.length - 1]];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), l = Math.max(10, (o.sw || 2) * 4);
    const p1 = [b[0] - l * Math.cos(ang - 0.45), b[1] - l * Math.sin(ang - 0.45)], p2 = [b[0] - l * Math.cos(ang + 0.45), b[1] - l * Math.sin(ang + 0.45)];
    return `<polygon points="${b.join(',')} ${p1.join(',')} ${p2.join(',')}" fill="${o.stroke || '#000'}"/>`;
  }
  function docSvg(forExport) {
    const defs = [];
    const body = state.objects.map((o) => objSvg(o, defs, forExport)).join('');
    const bg = state.bg && state.bg !== 'transparent' ? `<rect width="${state.w}" height="${state.h}" fill="${state.bg}"/>` : '';
    return { defs: defs.join(''), body: bg + body };
  }

  let guides = [];   // repères magnétiques actifs
  let marquee = null;
  let draft = null;  // forme en cours de création
  let nodeEdit = null; // id du tracé en édition de points
  function render() {
    const { defs, body } = docSvg(false);
    board.setAttribute('viewBox', `0 0 ${state.w} ${state.h}`);
    board.setAttribute('width', state.w * zoom); board.setAttribute('height', state.h * zoom);
    board.style.background = state.bg === 'transparent' ? '' : state.bg;
    board.classList.toggle('checker', state.bg === 'transparent');
    let ui = '';
    const k = 1 / zoom;
    if (draft) { const dd = []; ui += objSvg(draft, dd, true).replace('<g', `<g opacity=".85"`); ui = `<defs>${dd.join('')}</defs>` + ui; }
    if (draft && draft.type === 'path' && draft.penPreview) ui += `<line x1="${draft.pts[draft.pts.length - 1][0]}" y1="${draft.pts[draft.pts.length - 1][1]}" x2="${draft.penPreview[0]}" y2="${draft.penPreview[1]}" stroke="#d9861c" stroke-width="${k}" stroke-dasharray="${4 * k}"/>`;
    const sel = selected();
    if (sel.length === 1 && sel[0].id !== nodeEdit) ui += handlesSvg(getBox(sel[0]), sel[0].rot || 0, k);
    else if (sel.length > 1) { sel.forEach((o) => { const b = getBox(o); ui += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#d9861c" stroke-width="${k}" stroke-dasharray="${3 * k}" transform="rotate(${o.rot || 0} ${center(b).x} ${center(b).y})"/>`; }); ui += handlesSvg(unionBox(sel.map(getBox)), 0, k); }
    if (nodeEdit) { const o = byId(nodeEdit); if (o) o.pts.forEach((p, i) => { ui += `<rect data-node="${i}" x="${p[0] - 5 * k}" y="${p[1] - 5 * k}" width="${10 * k}" height="${10 * k}" fill="#fff" stroke="#d9861c" stroke-width="${1.5 * k}" style="cursor:move"/>`; }); }
    guides.forEach((g) => { ui += g.v != null ? `<line x1="${g.v}" y1="-10000" x2="${g.v}" y2="10000" stroke="#e0368c" stroke-width="${k}"/>` : `<line x1="-10000" y1="${g.h}" x2="10000" y2="${g.h}" stroke="#e0368c" stroke-width="${k}"/>`; });
    if (marquee) ui += `<rect x="${marquee.x}" y="${marquee.y}" width="${marquee.w}" height="${marquee.h}" fill="rgba(217,134,28,.1)" stroke="#d9861c" stroke-width="${k}"/>`;
    board.innerHTML = `<defs>${defs}</defs>${body}<g id="ui">${ui}</g>`;
    $('#zoomLbl').textContent = Math.round(zoom * 100) + ' %';
    $('#status').textContent = `${state.w} × ${state.h} px · ${state.objects.length} objet${state.objects.length > 1 ? 's' : ''}`;
  }
  function handlesSvg(b, rot, k) {
    const c = center(b), hs = 9 * k;
    let s = `<g transform="rotate(${rot} ${c.x} ${c.y})"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#d9861c" stroke-width="${1.5 * k}"/>`;
    s += `<line x1="${c.x}" y1="${b.y}" x2="${c.x}" y2="${b.y - 28 * k}" stroke="#d9861c" stroke-width="${k}"/><circle data-handle="rot" cx="${c.x}" cy="${b.y - 28 * k}" r="${6 * k}" fill="#fff" stroke="#d9861c" stroke-width="${1.5 * k}" style="cursor:grab"/>`;
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      if ((b.w < 20 / zoom && dx === 0) || (b.h < 20 / zoom && dy === 0)) continue;
      const cur = dx === 0 ? 'ns' : dy === 0 ? 'ew' : dx === dy ? 'nwse' : 'nesw';
      s += `<rect data-handle="${dx},${dy}" x="${c.x + dx * b.w / 2 - hs / 2}" y="${c.y + dy * b.h / 2 - hs / 2}" width="${hs}" height="${hs}" fill="#fff" stroke="#d9861c" stroke-width="${1.5 * k}" style="cursor:${cur}-resize"/>`;
    }
    return s + '</g>';
  }

  /* ---------------- Création d'objets ---------------- */
  function baseObj(type, extra) {
    return Object.assign({ id: uid(), type, rot: 0, opacity: 1, fill: defaults.fill, stroke: defaults.stroke, sw: defaults.sw }, extra);
  }
  function addObject(o, select = true) { state.objects.push(o); if (select) selIds = [o.id]; render(); renderSide(); return o; }
  function newText(x, y, text = 'Votre texte') {
    const o = baseObj('text', { text, x, y, fontFamily: defaults.font, fontSize: defaults.fontSize, fontWeight: 700, align: 'left', lineHeight: 1.2, letterSpacing: 0, fill: '#1b1f2a', sw: 0 });
    measureText(o); return o;
  }
  async function addImageFromFile(f, at) {
    let href = await readAsDataURL(f);
    const im = await loadImage(href);
    let w = im.naturalWidth || 400, h = im.naturalHeight || 300;
    // les très grandes photos sont réduites pour garder un projet léger
    const maxSide = 2400;
    if (Math.max(w, h) > maxSide && !/svg/.test(f.type)) {
      const s = maxSide / Math.max(w, h); const c = document.createElement('canvas'); c.width = w * s; c.height = h * s;
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); href = c.toDataURL(/png/.test(f.type) ? 'image/png' : 'image/jpeg', 0.9);
    }
    const s = Math.min(1, state.w * 0.6 / w, state.h * 0.6 / h); w *= s; h *= s;
    pushUndo();
    return addObject(baseObj('image', { href, x: at ? at.x - w / 2 : (state.w - w) / 2, y: at ? at.y - h / 2 : (state.h - h) / 2, w, h, sw: 0, fill: 'none', name: baseName(f.name) }));
  }

  /* ---------------- Interaction ---------------- */
  const TOOLS = [
    ['select', 'Sélection (V)', 'v', '<path d="m5 3 14 8-6 2-3 6z"/>'],
    ['node', 'Édition des points (A)', 'a', '<path d="m5 3 14 8-6 2-3 6z" fill="currentColor"/>'],
    ['sep'],
    ['rect', 'Rectangle (R)', 'r', '<rect x="4" y="6" width="16" height="12" rx="1"/>'],
    ['ellipse', 'Ellipse (E)', 'e', '<ellipse cx="12" cy="12" rx="8" ry="6"/>'],
    ['polygon', 'Polygone (Y)', 'y', '<path d="m12 3 8 6-3 10H7L4 9z"/>'],
    ['star', 'Étoile (S)', 's', '<path d="m12 3 2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6L3.4 9.3l6-.8z"/>'],
    ['line', 'Ligne / flèche (L)', 'l', '<path d="M4 20 20 4M20 4h-6M20 4v6"/>'],
    ['pen', 'Plume — clics successifs, Entrée pour finir (P)', 'p', '<path d="m12 2 7 9-4 9H9l-4-9zM12 2v8"/><circle cx="12" cy="12" r="1.5"/>'],
    ['pencil', 'Crayon — dessin libre (N)', 'n', '<path d="M4 20h4L19 9l-4-4L4 16z"/>'],
    ['text', 'Texte (T)', 't', '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'],
    ['image', 'Image (I)', 'i', '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 7"/>'],
  ];
  function buildRail() {
    const rail = $('#rail');
    TOOLS.forEach(([id, title, , svg]) => {
      if (id === 'sep') { rail.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
      const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = id; b.title = title; b.setAttribute('aria-label', title);
      b.innerHTML = `<svg viewBox="0 0 24 24">${svg}</svg>`; b.onclick = () => setTool(id); rail.appendChild(b);
    });
  }
  function setTool(t) {
    if (draft && draft.type === 'path' && tool === 'pen') finishPen();
    tool = t;
    if (t === 'node') { const o = selected()[0]; nodeEdit = o && isPathy(o) ? o.id : null; if (!nodeEdit) toast('Sélectionnez d\'abord un tracé, une ligne ou un dessin.'); }
    else nodeEdit = null;
    $$('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    board.style.cursor = t === 'select' || t === 'node' ? 'default' : t === 'text' ? 'text' : 'crosshair';
    if (t === 'image') { pickFiles('image/*').then(async (fs) => { for (const f of fs) await addImageFromFile(f); setTool('select'); }); }
    render();
  }

  const pt = (e) => { const r = board.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  let drag = null;

  board.addEventListener('pointerdown', (e) => {
    const p = pt(e);
    board.setPointerCapture(e.pointerId);
    const handle = e.target.closest('[data-handle]');
    const node = e.target.closest('[data-node]');
    if (node && nodeEdit) { pushUndo(); drag = { mode: 'node', o: byId(nodeEdit), i: +node.dataset.node }; return; }
    if (tool === 'select' || tool === 'node') {
      if (handle) { startHandle(handle.dataset.handle, p, e); return; }
      const g = e.target.closest('[data-id]');
      const o = g && byId(+g.dataset.id);
      if (o && !o.locked) {
        if (e.shiftKey) selIds = selIds.includes(o.id) ? selIds.filter((x) => x !== o.id) : [...selIds, o.id];
        else if (!selIds.includes(o.id)) selIds = [o.id];
        if (tool === 'node') { nodeEdit = isPathy(o) ? o.id : null; }
        render(); renderSide();
        if (e.altKey) { pushUndo(); const copies = selected().map((s) => cloneObj(s)); state.objects.push(...copies); selIds = copies.map((c) => c.id); }
        else pushUndo();
        drag = { mode: 'move', start: p, orig: selected().map((s) => ({ o: s, b: getBox(s) })), moved: false };
        return;
      }
      if (!e.shiftKey) selIds = [];
      drag = { mode: 'marquee', start: p }; render(); renderSide(); return;
    }
    if (tool === 'text') { pushUndo(); const o = addObject(newText(p.x, p.y - defaults.fontSize / 2)); setTool('select'); focusText(o); return; }
    if (tool === 'pen') {
      if (!draft) draft = baseObj('path', { pts: [[p.x, p.y]], closed: false, smooth: false, fill: 'none', stroke: defaults.stroke, sw: Math.max(2, defaults.sw) });
      else {
        const f = draft.pts[0];
        if (draft.pts.length > 2 && Math.hypot(p.x - f[0], p.y - f[1]) < 10 / zoom) { draft.closed = true; draft.fill = defaults.fill; finishPen(); return; }
        draft.pts.push([p.x, p.y]);
      }
      render(); return;
    }
    if (tool === 'pencil') { draft = baseObj('path', { pts: [[p.x, p.y]], smooth: true, closed: false, fill: 'none', stroke: defaults.stroke, sw: Math.max(3, defaults.sw) }); drag = { mode: 'pencil' }; return; }
    // formes : rectangle, ellipse, polygone, étoile, ligne
    if (tool === 'line') draft = baseObj('line', { pts: [[p.x, p.y], [p.x, p.y]], fill: 'none', stroke: defaults.stroke, sw: Math.max(3, defaults.sw), arrow: false });
    else draft = baseObj(tool, { x: p.x, y: p.y, w: 0, h: 0, radius: 0, sides: 6, points: 5, inner: 0.45 });
    drag = { mode: 'create', start: p };
  });

  board.addEventListener('pointermove', (e) => {
    const p = pt(e);
    if (tool === 'pen' && draft && !drag) { draft.penPreview = [p.x, p.y]; render(); return; }
    if (!drag) return;
    switch (drag.mode) {
      case 'move': {
        let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (!drag.moved && Math.hypot(dx, dy) * zoom < 2) return;
        drag.moved = true;
        const ub = unionBox(drag.orig.map((x) => x.b));
        [dx, dy] = snapMove({ x: ub.x + dx, y: ub.y + dy, w: ub.w, h: ub.h }, dx, dy);
        drag.orig.forEach(({ o, b }) => setBox(o, { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }));
        render(); break;
      }
      case 'resize': doResize(p, e.shiftKey); break;
      case 'rotate': {
        const c = drag.c; let a = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90;
        if (e.shiftKey) a = Math.round(a / 15) * 15;
        drag.o.rot = Math.round(((a % 360) + 360) % 360 * 10) / 10; render(); updateGeomFields(); break;
      }
      case 'marquee': marquee = { x: Math.min(drag.start.x, p.x), y: Math.min(drag.start.y, p.y), w: Math.abs(p.x - drag.start.x), h: Math.abs(p.y - drag.start.y) }; render(); break;
      case 'pencil': { const l = draft.pts[draft.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 2 / zoom) draft.pts.push([p.x, p.y]); render(); break; }
      case 'node': { drag.o.pts[drag.i] = [p.x, p.y]; render(); break; }
      case 'create': {
        const s = drag.start;
        if (draft.type === 'line') {
          let ex = p.x, ey = p.y;
          if (e.shiftKey) { const a = Math.round(Math.atan2(ey - s.y, ex - s.x) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(ex - s.x, ey - s.y); ex = s.x + Math.cos(a) * d; ey = s.y + Math.sin(a) * d; }
          draft.pts[1] = [ex, ey];
        } else {
          let w = p.x - s.x, h = p.y - s.y;
          if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
          if (e.altKey) Object.assign(draft, { x: s.x - Math.abs(w), y: s.y - Math.abs(h), w: Math.abs(w) * 2, h: Math.abs(h) * 2 });
          else Object.assign(draft, { x: Math.min(s.x, s.x + w), y: Math.min(s.y, s.y + h), w: Math.abs(w), h: Math.abs(h) });
        }
        render(); break;
      }
    }
  });

  board.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null; guides = [];
    if (d.mode === 'move' && !d.moved) undoStack.pop(), updateHist();
    if (d.mode === 'marquee' && marquee) {
      const m = marquee; marquee = null;
      const inside = state.objects.filter((o) => { if (o.locked || o.hidden) return false; const b = getBox(o); return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h; });
      selIds = [...new Set([...selIds, ...inside.map((o) => o.id)])];
    }
    if (d.mode === 'create') {
      const b = getBox(draft);
      if (b.w > 2 || b.h > 2) { pushUndo(); state.objects.push(draft); selIds = [draft.id]; }
      draft = null; setTool('select');
    }
    if (d.mode === 'pencil') {
      if (draft.pts.length > 2) { draft.pts = simplify(draft.pts, 1.5 / zoom); pushUndo(); state.objects.push(draft); selIds = [draft.id]; }
      draft = null;
    }
    render(); renderSide();
  });
  board.addEventListener('dblclick', (e) => {
    if (tool === 'pen') { finishPen(); return; }
    const g = e.target.closest('[data-id]'); const o = g && byId(+g.dataset.id);
    if (!o) return;
    if (o.type === 'text') focusText(o);
    else if (isPathy(o)) { selIds = [o.id]; setTool('node'); }
    else if (o.type === 'group') { toast('Groupe : Ctrl+Maj+G pour dissocier'); }
  });
  function finishPen() {
    if (!draft) return;
    delete draft.penPreview;
    if (draft.pts.length > 1) { pushUndo(); state.objects.push(draft); selIds = [draft.id]; }
    draft = null; render(); renderSide();
  }

  function startHandle(h, p) {
    const sel = selected(); if (!sel.length) return;
    pushUndo();
    if (h === 'rot') { if (sel.length !== 1) { undoStack.pop(); return; } const b = getBox(sel[0]); drag = { mode: 'rotate', o: sel[0], c: center(b) }; return; }
    const [dx, dy] = h.split(',').map(Number);
    const single = sel.length === 1;
    const b = single ? getBox(sel[0]) : unionBox(sel.map(getBox));
    const rot = single ? sel[0].rot || 0 : 0;
    const c = center(b);
    const F = rotPt({ x: c.x - dx * b.w / 2, y: c.y - dy * b.h / 2 }, c, rot);
    drag = { mode: 'resize', dx, dy, b, rot, F, sel, orig: sel.map((o) => ({ o, b: getBox(o) })), ratio: b.w / (b.h || 1), keep: single && ['image', 'text', 'group'].includes(sel[0].type) || !single };
  }
  function doResize(p, shift) {
    const { dx, dy, b, rot, F } = drag;
    const L = rotPt(p, F, -rot); const lx = L.x - F.x, ly = L.y - F.y;
    let w = dx ? Math.max(1, dx * lx) : b.w, h = dy ? Math.max(1, dy * ly) : b.h;
    const keep = drag.keep !== shift; // Maj inverse le comportement
    if (keep && b.h) {
      if (dx && dy) { if (w / h > drag.ratio) h = w / drag.ratio; else w = h * drag.ratio; }
      else if (dx) h = w / drag.ratio; else w = h * drag.ratio;
    }
    const cLocal = { x: F.x + (dx ? dx * w / 2 : 0), y: F.y + (dy ? dy * h / 2 : 0) };
    const cw = rotPt(cLocal, F, rot);
    const nb = { x: cw.x - w / 2, y: cw.y - h / 2, w, h };
    if (drag.sel.length === 1) setBox(drag.sel[0], nb);
    else {
      const sx = nb.w / (b.w || 1), sy = nb.h / (b.h || 1);
      drag.orig.forEach(({ o, b: ob }) => { setBox(o, { x: nb.x + (ob.x - b.x) * sx, y: nb.y + (ob.y - b.y) * sy, w: ob.w * sx, h: ob.h * sy }); });
    }
    render(); updateGeomFields();
  }

  // repères magnétiques : bords et centres de la page et des autres objets
  function snapMove(nb, dx, dy) {
    guides = [];
    if (!snapOn) return [dx, dy];
    const th = 6 / zoom;
    const others = state.objects.filter((o) => !selIds.includes(o.id) && !o.hidden).map(getBox);
    const xs = [0, state.w / 2, state.w, ...others.flatMap((b) => [b.x, b.x + b.w / 2, b.x + b.w])];
    const ys = [0, state.h / 2, state.h, ...others.flatMap((b) => [b.y, b.y + b.h / 2, b.y + b.h])];
    const mine = (v, s) => [v, v + s / 2, v + s];
    let bx = null, by = null;
    for (const m of mine(nb.x, nb.w)) for (const t of xs) if (Math.abs(m - t) < th && (!bx || Math.abs(m - t) < Math.abs(bx.d))) bx = { d: t - m, t };
    for (const m of mine(nb.y, nb.h)) for (const t of ys) if (Math.abs(m - t) < th && (!by || Math.abs(m - t) < Math.abs(by.d))) by = { d: t - m, t };
    if (bx) { dx += bx.d; guides.push({ v: bx.t }); }
    if (by) { dy += by.d; guides.push({ h: by.t }); }
    return [dx, dy];
  }

  function simplify(pts, eps) { // Ramer–Douglas–Peucker
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    let dmax = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]; const num = Math.abs((b[1] - a[1]) * p[0] - (b[0] - a[0]) * p[1] + b[0] * a[1] - b[1] * a[0]); const den = Math.hypot(b[1] - a[1], b[0] - a[0]) || 1;
      const d = num / den; if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps) return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
    return [a, b];
  }

  function cloneObj(o, offset = 0) {
    const c = JSON.parse(JSON.stringify(o));
    const reid = (x) => { x.id = uid(); if (x.children) x.children.forEach(reid); };
    reid(c);
    if (offset) { const b = getBox(c); setBox(c, { ...b, x: b.x + offset, y: b.y + offset }); }
    return c;
  }

  /* ---------------- Panneau latéral ---------------- */
  const FONTS = ['Segoe UI', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Garamond', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'Impact', 'Arial Black', 'Comic Sans MS', 'Brush Script MT', 'Palatino Linotype'];
  function field(label, html, id) { return `<div class="field"><label for="${id}">${label}</label>${html}</div>`; }
  function num(id, v, step = 1, min = '', max = '') { return `<input type="number" id="${id}" value="${Math.round(v * 100) / 100}" step="${step}" min="${min}" max="${max}">`; }

  function renderSide() {
    const side = $('#side'); const sel = selected();
    let h = '';
    if (!sel.length) {
      h += `<div class="section"><h3>Document</h3>
        <div class="field"><label for="docName">Nom</label><input type="text" id="docName" value="${esc(state.name)}"></div>
        <div class="grid2">${field('Largeur (px)', num('docW', state.w, 1, 1), 'docW')}${field('Hauteur (px)', num('docH', state.h, 1, 1), 'docH')}</div>
        <div class="row"><label for="docBg">Fond</label><input type="color" id="docBg" value="${state.bg === 'transparent' ? '#ffffff' : state.bg}"><label><input type="checkbox" id="docTr" ${state.bg === 'transparent' ? 'checked' : ''}> Transparent</label></div>
        <label class="row"><input type="checkbox" id="snapOn" ${snapOn ? 'checked' : ''}> Repères magnétiques</label>
        <button data-act="templates">Choisir un modèle…</button></div>`;
    } else {
      const o = sel[0]; const b = sel.length === 1 ? getBox(o) : unionBox(sel.map(getBox));
      h += `<div class="section"><h3>${sel.length > 1 ? `${sel.length} objets` : typeName(o)}</h3>
        <div class="grid2">${field('X', num('gX', b.x), 'gX')}${field('Y', num('gY', b.y), 'gY')}${field('L', num('gW', b.w, 1, 1), 'gW')}${field('H', num('gH', b.h, 1, 1), 'gH')}</div>
        ${sel.length === 1 ? `<div class="grid2">${field('Rotation (°)', num('gR', o.rot || 0, 1, -360, 360), 'gR')}${field('Opacité (%)', num('gO', (o.opacity ?? 1) * 100, 5, 0, 100), 'gO')}</div>` : ''}
        <div class="row align-row" aria-label="Aligner">
          ${alignBtn('left', 'Aligner à gauche', '<path d="M4 3v18M8 7h12v4H8zM8 14h7v4H8z"/>')}${alignBtn('hcenter', 'Centrer horizontalement', '<path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/>')}${alignBtn('right', 'Aligner à droite', '<path d="M20 3v18M4 7h12v4H4zM9 14h7v4H9z"/>')}
          ${alignBtn('top', 'Aligner en haut', '<path d="M3 4h18M7 8v12h4V8zM14 8v7h4V8z"/>')}${alignBtn('vcenter', 'Centrer verticalement', '<path d="M3 12h18M7 6v12h4V6zM14 8v8h4V8z"/>')}${alignBtn('bottom', 'Aligner en bas', '<path d="M3 20h18M7 4v12h4V4zM14 9v7h4V9z"/>')}
          ${sel.length > 2 ? alignBtn('distH', 'Répartir horizontalement', '<path d="M4 4v16M20 4v16M10 8h4v8h-4z"/>') + alignBtn('distV', 'Répartir verticalement', '<path d="M4 4h16M4 20h16M8 10h8v4H8z"/>') : ''}
        </div><p class="hint">${sel.length === 1 ? 'Alignement par rapport à la page.' : 'Alignement par rapport à la sélection.'}</p></div>`;
      if (sel.length === 1 && o.type !== 'group' && o.type !== 'image') h += fillStrokeSection(o);
      if (sel.length === 1 && o.type === 'image') h += `<div class="section"><h3>Image</h3><div class="grid2">${field('Arrondi', num('pRadius', o.radius || 0, 1, 0), 'pRadius')}${field('Bordure', num('pSw', o.sw || 0, 1, 0), 'pSw')}</div><div class="row"><label for="pStroke">Couleur bordure</label><input type="color" id="pStroke" value="${o.stroke || '#000000'}"></div><button id="replImg">Remplacer l'image…</button></div>`;
      if (sel.length === 1 && o.type === 'text') h += textSection(o);
      if (sel.length === 1 && o.type === 'rect') h += `<div class="section"><h3>Rectangle</h3>${field('Arrondi des coins', num('pRadius', o.radius || 0, 1, 0), 'pRadius')}</div>`;
      if (sel.length === 1 && o.type === 'polygon') h += `<div class="section"><h3>Polygone</h3>${field('Nombre de côtés', num('pSides', o.sides || 6, 1, 3, 40), 'pSides')}</div>`;
      if (sel.length === 1 && o.type === 'star') h += `<div class="section"><h3>Étoile</h3><div class="grid2">${field('Branches', num('pPoints', o.points || 5, 1, 3, 40), 'pPoints')}${field('Creux (%)', num('pInner', (o.inner || 0.45) * 100, 5, 5, 95), 'pInner')}</div></div>`;
      if (sel.length === 1 && isPathy(o)) h += `<div class="section"><h3>Tracé</h3><label class="row"><input type="checkbox" id="pSmooth" ${o.smooth ? 'checked' : ''}> Lisser (courbes)</label><label class="row"><input type="checkbox" id="pClosed" ${o.closed ? 'checked' : ''}> Fermer le tracé</label>${o.type === 'line' ? `<label class="row"><input type="checkbox" id="pArrow" ${o.arrow ? 'checked' : ''}> Pointe de flèche</label>` : ''}<button id="editNodes">Modifier les points</button></div>`;
      if (sel.length === 1) h += `<div class="section"><h3>Effets</h3><label class="row"><input type="checkbox" id="pShadow" ${o.shadow ? 'checked' : ''}> Ombre portée</label>
        ${o.shadow ? `<div class="grid3">${field('Flou', num('pShB', o.shadowBlur ?? 8, 1, 0), 'pShB')}${field('Déc. X', num('pShX', o.shadowX ?? 6), 'pShX')}${field('Déc. Y', num('pShY', o.shadowY ?? 8), 'pShY')}</div><div class="row"><input type="color" id="pShC" value="${o.shadowColor || '#000000'}" aria-label="Couleur de l'ombre">${field('Opacité %', num('pShO', (o.shadowOpacity ?? 0.35) * 100, 5, 0, 100), 'pShO')}</div>` : ''}
        ${field('Mode de fusion', `<select id="pBlend">${['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference'].map((m) => `<option ${o.blend === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`, 'pBlend')}</div>`;
      h += `<div class="section"><h3>Disposition</h3><div class="icon-row row"><button data-act="front">Premier plan</button><button data-act="back">Arrière-plan</button><button data-act="duplicate">Dupliquer</button>${sel.length > 1 ? '<button data-act="group">Grouper</button>' : ''}${o.type === 'group' ? '<button data-act="ungroup">Dissocier</button>' : ''}<button data-act="flipH">Miroir H</button><button data-act="flipV">Miroir V</button><button data-act="delete" class="danger">Supprimer</button></div></div>`;
    }
    h += `<div class="section"><h3>Calques</h3><div class="objlist">${[...state.objects].reverse().map((o) => `<button data-pick="${o.id}" class="${selIds.includes(o.id) ? 'active' : ''}"><span data-vis="${o.id}" title="Afficher/masquer">${o.hidden ? '◌' : '●'}</span> <span data-lock="${o.id}" title="Verrouiller">${o.locked ? '🔒' : '·'}</span> ${esc(o.name || labelOf(o))}</button>`).join('') || '<p class="hint">Aucun objet. Choisissez un outil à gauche ou un modèle.</p>'}</div></div>`;
    h += `<div class="section"><h3>Raccourcis</h3><p class="hint">Maj : proportions / angles · Alt+glisser : dupliquer · Flèches : déplacer · Ctrl+D : dupliquer · Ctrl+G : grouper · Double-clic : modifier le texte ou les points</p></div>`;
    side.innerHTML = h;
    bindSide();
  }
  const typeName = (o) => ({ rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygone', star: 'Étoile', line: 'Ligne', path: 'Tracé', text: 'Texte', image: 'Image', group: 'Groupe' }[o.type]);
  const labelOf = (o) => (o.type === 'text' ? `« ${String(o.text).slice(0, 24)} »` : typeName(o));
  const alignBtn = (a, t, svg) => `<button data-align="${a}" title="${t}" aria-label="${t}"><svg viewBox="0 0 24 24">${svg}</svg></button>`;
  function fillStrokeSection(o) {
    const noFill = !o.fill || o.fill === 'none';
    return `<div class="section"><h3>Remplissage et contour</h3>
      ${!isPathy(o) || o.closed ? `<div class="row"><select id="pFillType" style="width:auto"><option value="solid">Uni</option><option value="gradient" ${o.fillType === 'gradient' ? 'selected' : ''}>Dégradé</option><option value="none" ${noFill ? 'selected' : ''}>Aucun</option></select>
      <input type="color" id="pFill" value="${noFill ? '#ffffff' : o.fill}" aria-label="Couleur de remplissage">
      ${o.fillType === 'gradient' && !noFill ? `<input type="color" id="pFill2" value="${o.fill2 || '#ffffff'}" aria-label="Seconde couleur"><select id="pGradKind" style="width:auto"><option value="linear">Linéaire</option><option value="radial" ${o.gradKind === 'radial' ? 'selected' : ''}>Radial</option></select>` : ''}</div>
      ${o.fillType === 'gradient' && !noFill && o.gradKind !== 'radial' ? field('Angle du dégradé', num('pGradA', o.gradAngle || 0, 15, -360, 360), 'pGradA') : ''}` : ''}
      <div class="row"><label for="pStroke">Contour</label><input type="color" id="pStroke" value="${o.stroke || '#000000'}">${field('Épaisseur', num('pSw', o.sw || 0, 1, 0), 'pSw')}</div>
      ${field('Pointillés', `<select id="pDash"><option value="">Plein</option><option value="8 6" ${o.dash === '8 6' ? 'selected' : ''}>Tirets</option><option value="2 6" ${o.dash === '2 6' ? 'selected' : ''}>Points</option><option value="16 8 2 8" ${o.dash === '16 8 2 8' ? 'selected' : ''}>Mixte</option></select>`, 'pDash')}
      <div class="row" id="swatches">${['#1b1f2a', '#ffffff', '#d9861c', '#c23b3b', '#2f8a57', '#1a3d8f', '#7b3fa0', '#f2c94c', '#0f766e', '#ef7d57'].map((c) => `<button data-sw="${c}" title="${c}" style="width:22px;height:22px;padding:0;background:${c}" aria-label="Couleur ${c}"></button>`).join('')}</div></div>`;
  }
  function textSection(o) {
    return `<div class="section"><h3>Texte</h3>
      <textarea id="pText" aria-label="Contenu du texte">${esc(o.text)}</textarea>
      ${field('Police', `<select id="pFont">${FONTS.map((f) => `<option ${o.fontFamily === f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select>`, 'pFont')}
      <div class="grid2">${field('Taille', num('pFs', o.fontSize, 1, 2), 'pFs')}${field('Graisse', `<select id="pFw">${[[300, 'Fin'], [400, 'Normal'], [600, 'Demi-gras'], [700, 'Gras'], [900, 'Noir']].map(([v, l]) => `<option value="${v}" ${+o.fontWeight === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'pFw')}</div>
      <div class="grid2">${field('Interligne', num('pLh', o.lineHeight || 1.2, 0.05, 0.5, 4), 'pLh')}${field('Espacement', num('pLs', o.letterSpacing || 0, 0.5, -20, 100), 'pLs')}</div>
      <div class="row"><select id="pAlign" style="width:auto"><option value="left">Gauche</option><option value="center" ${o.align === 'center' ? 'selected' : ''}>Centre</option><option value="right" ${o.align === 'right' ? 'selected' : ''}>Droite</option></select>
      <label><input type="checkbox" id="pItalic" ${o.italic ? 'checked' : ''}> Italique</label><label><input type="checkbox" id="pUnder" ${o.underline ? 'checked' : ''}> Souligné</label></div></div>`;
  }
  function updateGeomFields() {
    const sel = selected(); if (!sel.length || !$('#gX')) return;
    const b = sel.length === 1 ? getBox(sel[0]) : unionBox(sel.map(getBox));
    [['gX', b.x], ['gY', b.y], ['gW', b.w], ['gH', b.h]].forEach(([id, v]) => { if (document.activeElement.id !== id) $('#' + id).value = Math.round(v * 100) / 100; });
    if ($('#gR') && document.activeElement.id !== 'gR') $('#gR').value = sel[0].rot || 0;
  }

  function bindSide() {
    const side = $('#side');
    let armed = false;
    const edit = (fn, rerenderSide) => (e) => {
      if (!armed) { pushUndo(); armed = true; setTimeout(() => { armed = false; }, 800); }
      fn(e.target); render(); if (rerenderSide) renderSide();
    };
    const on = (id, ev, fn, rs) => { const el = $('#' + id); if (el) el.addEventListener(ev, edit(fn, rs)); };
    const sel = selected(), o = sel[0];
    // document
    on('docName', 'input', (t) => { state.name = t.value; });
    on('docW', 'change', (t) => { state.w = Math.max(1, +t.value); fit(); });
    on('docH', 'change', (t) => { state.h = Math.max(1, +t.value); fit(); });
    on('docBg', 'input', (t) => { state.bg = t.value; $('#docTr').checked = false; });
    on('docTr', 'change', (t) => { state.bg = t.checked ? 'transparent' : $('#docBg').value; });
    const sn = $('#snapOn'); if (sn) sn.onchange = () => { snapOn = sn.checked; store('designjoe-snap', snapOn); };
    // géométrie
    const geo = (k) => (t) => {
      const b = sel.length === 1 ? getBox(o) : unionBox(sel.map(getBox)); const nb = { ...b, [k]: +t.value };
      if (sel.length === 1) setBox(o, nb); else { const dx = nb.x - b.x, dy = nb.y - b.y; sel.forEach((s) => { const sb = getBox(s); setBox(s, { ...sb, x: sb.x + dx, y: sb.y + dy }); }); }
    };
    on('gX', 'change', geo('x')); on('gY', 'change', geo('y')); on('gW', 'change', geo('w')); on('gH', 'change', geo('h'));
    on('gR', 'input', (t) => { o.rot = +t.value; });
    on('gO', 'input', (t) => { o.opacity = clamp(+t.value / 100, 0, 1); });
    // remplissage / contour
    on('pFillType', 'change', (t) => { if (t.value === 'none') o.fill = 'none'; else { if (!o.fill || o.fill === 'none') o.fill = $('#pFill').value; o.fillType = t.value; if (t.value === 'gradient' && !o.fill2) o.fill2 = '#ffffff'; } }, true);
    on('pFill', 'input', (t) => { o.fill = t.value; if ($('#pFillType').value === 'none') { $('#pFillType').value = 'solid'; o.fillType = 'solid'; } defaults.fill = t.value; store('designjoe-defaults', defaults); });
    on('pFill2', 'input', (t) => { o.fill2 = t.value; });
    on('pGradKind', 'change', (t) => { o.gradKind = t.value; }, true);
    on('pGradA', 'input', (t) => { o.gradAngle = +t.value; });
    on('pStroke', 'input', (t) => { o.stroke = t.value; if (!o.sw) { o.sw = 2; if ($('#pSw')) $('#pSw').value = 2; } defaults.stroke = t.value; store('designjoe-defaults', defaults); });
    on('pSw', 'input', (t) => { o.sw = Math.max(0, +t.value); });
    on('pDash', 'change', (t) => { o.dash = t.value; });
    $$('[data-sw]', side).forEach((b) => b.addEventListener('click', edit(() => { if (isPathy(o) && !o.closed) o.stroke = b.dataset.sw; else { o.fill = b.dataset.sw; o.fillType = 'solid'; } }, true)));
    // formes
    on('pRadius', 'input', (t) => { o.radius = Math.max(0, +t.value); });
    on('pSides', 'input', (t) => { o.sides = clamp(+t.value, 3, 40); });
    on('pPoints', 'input', (t) => { o.points = clamp(+t.value, 3, 40); });
    on('pInner', 'input', (t) => { o.inner = clamp(+t.value / 100, 0.05, 0.95); });
    on('pSmooth', 'change', (t) => { o.smooth = t.checked; });
    on('pClosed', 'change', (t) => { o.closed = t.checked; if (t.checked && (!o.fill || o.fill === 'none')) o.fill = defaults.fill; }, true);
    on('pArrow', 'change', (t) => { o.arrow = t.checked; });
    const en = $('#editNodes'); if (en) en.onclick = () => setTool('node');
    // texte
    const tx = (fn) => (t) => { fn(t); measureText(o); };
    on('pText', 'input', tx((t) => { o.text = t.value; }));
    on('pFont', 'change', tx((t) => { o.fontFamily = t.value; defaults.font = t.value; store('designjoe-defaults', defaults); }));
    on('pFs', 'input', tx((t) => { o.fontSize = Math.max(2, +t.value); }));
    on('pFw', 'change', tx((t) => { o.fontWeight = +t.value; }));
    on('pLh', 'input', tx((t) => { o.lineHeight = +t.value; }));
    on('pLs', 'input', tx((t) => { o.letterSpacing = +t.value; }));
    on('pAlign', 'change', (t) => { o.align = t.value; });
    on('pItalic', 'change', tx((t) => { o.italic = t.checked; }));
    on('pUnder', 'change', (t) => { o.underline = t.checked; });
    // effets
    on('pShadow', 'change', (t) => { o.shadow = t.checked; }, true);
    on('pShB', 'input', (t) => { o.shadowBlur = +t.value; }); on('pShX', 'input', (t) => { o.shadowX = +t.value; }); on('pShY', 'input', (t) => { o.shadowY = +t.value; });
    on('pShC', 'input', (t) => { o.shadowColor = t.value; }); on('pShO', 'input', (t) => { o.shadowOpacity = clamp(+t.value / 100, 0, 1); });
    on('pBlend', 'change', (t) => { o.blend = t.value; });
    const ri = $('#replImg'); if (ri) ri.onclick = async () => { const [f] = await pickFiles('image/*', false); if (!f) return; pushUndo(); o.href = await readAsDataURL(f); render(); };
    // alignement
    $$('[data-align]', side).forEach((b) => b.addEventListener('click', () => align(b.dataset.align)));
    // calques
    $$('[data-pick]', side).forEach((b) => b.addEventListener('click', (e) => {
      const id = +b.dataset.pick, ob = byId(id);
      if (e.target.dataset.vis) { pushUndo(); ob.hidden = !ob.hidden; }
      else if (e.target.dataset.lock) { pushUndo(); ob.locked = !ob.locked; if (ob.locked) selIds = selIds.filter((x) => x !== id); }
      else if (!ob.locked) selIds = e.shiftKey ? [...new Set([...selIds, id])] : [id];
      render(); renderSide();
    }));
    $$('[data-act]', side).forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  }
  function focusText(o) {
    selIds = [o.id]; render(); renderSide();
    // après le clic, sinon le navigateur redonne le focus à la page
    setTimeout(() => { const t = $('#pText'); if (t) { t.focus(); t.select(); } }, 0);
  }

  function align(kind) {
    const sel = selected(); if (!sel.length) return;
    pushUndo();
    const ref = sel.length === 1 ? { x: 0, y: 0, w: state.w, h: state.h } : unionBox(sel.map(getBox));
    if (kind === 'distH' || kind === 'distV') {
      const k = kind === 'distH' ? 'x' : 'y', s = kind === 'distH' ? 'w' : 'h';
      const items = sel.map((o) => ({ o, b: getBox(o) })).sort((a, b) => a.b[k] - b.b[k]);
      const total = items.reduce((a, i) => a + i.b[s], 0), gap = (ref[s] - total) / (items.length - 1);
      let pos = ref[k]; items.forEach((i) => { setBox(i.o, { ...i.b, [k]: pos }); pos += i.b[s] + gap; });
    } else sel.forEach((o) => {
      const b = getBox(o), nb = { ...b };
      if (kind === 'left') nb.x = ref.x; if (kind === 'right') nb.x = ref.x + ref.w - b.w; if (kind === 'hcenter') nb.x = ref.x + (ref.w - b.w) / 2;
      if (kind === 'top') nb.y = ref.y; if (kind === 'bottom') nb.y = ref.y + ref.h - b.h; if (kind === 'vcenter') nb.y = ref.y + (ref.h - b.h) / 2;
      setBox(o, nb);
    });
    render(); updateGeomFields();
  }

  /* ---------------- Export ---------------- */
  function exportSvgString() {
    const { defs, body } = docSvg(true);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${state.w}" height="${state.h}" viewBox="0 0 ${state.w} ${state.h}"><defs>${defs}</defs>${body}</svg>`;
  }
  async function rasterize(scale, bgWhite) {
    const svg = exportSvgString();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const im = await loadImage(url);
      const c = document.createElement('canvas'); c.width = Math.round(state.w * scale); c.height = Math.round(state.h * scale);
      const x = c.getContext('2d'); if (bgWhite) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(im, 0, 0, c.width, c.height); return c;
    } finally { URL.revokeObjectURL(url); }
  }
  async function askScale(title, extra = '') {
    return modal({
      title, body: `<div class="field"><label for="xs">Résolution</label><select id="xs"><option value="1">1× (${state.w} × ${state.h})</option><option value="2" selected>2× (${state.w * 2} × ${state.h * 2})</option><option value="3">3×</option><option value="0.5">0,5×</option></select></div>${extra}`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Exporter', primary: true, value: (b) => +b.querySelector('#xs').value }],
    });
  }
  async function exportRaster(type) {
    const s = await askScale(type === 'image/png' ? 'Exporter en PNG' : 'Exporter en JPG'); if (!s) return;
    const c = await rasterize(s, type === 'image/jpeg');
    const blob = await new Promise((r) => c.toBlob(r, type, 0.92));
    download(blob, `${fname()}.${type === 'image/png' ? 'png' : 'jpg'}`); toast('Image exportée');
  }
  async function exportPdf() {
    const s = await askScale('Exporter en PDF', '<p class="hint">Le PDF contient l\'image haute résolution de votre création, au format de la page.</p>'); if (!s) return;
    const c = await rasterize(Math.max(s, 2), true);
    const d = await PDFLib.PDFDocument.create();
    const img = await d.embedJpg(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95))).arrayBuffer());
    const W = state.w * 0.75, H = state.h * 0.75;
    d.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
    d.setTitle(state.name); d.setCreator('Design Joe');
    download(new Blob([await d.save()], { type: 'application/pdf' }), `${fname()}.pdf`); toast('PDF exporté');
  }
  const fname = () => (state.name || 'design').replace(/[\\/:*?"<>|]/g, '_');

  /* ---------------- Modèles ---------------- */
  const T = (type, props) => baseObj(type, props);
  const TXT = (text, x, y, size, color, weight = 700, extra = {}) => { const o = newText(x, y, text); Object.assign(o, { fontSize: size, fill: color, fontWeight: weight }, extra); measureText(o); if (extra.align === 'center' && extra.cx != null) o.x = extra.cx - o.w / 2; return o; };
  const TEMPLATES = [
    { id: 'blank-square', name: 'Publication carrée', sub: '1080 × 1080 — réseaux sociaux', w: 1080, h: 1080, build: (w, h) => [
      T('rect', { x: 0, y: 0, w, h, fill: '#1a3d8f', fill2: '#0f766e', fillType: 'gradient', gradAngle: 45, sw: 0, name: 'Fond' }),
      T('ellipse', { x: 640, y: -160, w: 620, h: 620, fill: '#f2c94c', opacity: 0.9, sw: 0 }),
      TXT('GRANDE\nANNONCE', 80, 380, 130, '#ffffff', 900, { lineHeight: 1 }),
      TXT('Samedi 15 novembre · 9 h · Salle polyvalente', 84, 680, 40, '#f2c94c', 600),
      T('rect', { x: 84, y: 800, w: 380, h: 96, radius: 48, fill: '#ffffff', sw: 0 }),
      TXT('Inscrivez-vous', 130, 822, 40, '#1a3d8f', 700),
    ] },
    { id: 'card', name: 'Carte de visite', sub: '85 × 55 mm (300 ppp)', w: 1004, h: 650, build: (w, h) => [
      T('rect', { x: 0, y: 0, w: 300, h, fill: '#1b1f2a', sw: 0, name: 'Bande' }),
      T('star', { x: 90, y: 245, w: 120, h: 120, fill: '#d9861c', sw: 0, points: 8, inner: 0.55 }),
      TXT('Votre Nom', 360, 170, 72, '#1b1f2a', 800),
      TXT('Fonction · Service', 362, 265, 36, '#d9861c', 600),
      T('line', { pts: [[362, 340], [900, 340]], stroke: '#d5d9e2', sw: 3, fill: 'none' }),
      TXT('+226 00 00 00 00\nvotre.adresse@exemple.bf\nOuagadougou, Burkina Faso', 362, 380, 30, '#3a4152', 400, { lineHeight: 1.5 }),
    ] },
    { id: 'flyer', name: 'Affiche / avis A4', sub: 'A4 portrait (150 ppp)', w: 1240, h: 1754, build: (w, h) => [
      T('rect', { x: 0, y: 0, w, h: 420, fill: '#c23b3b', sw: 0, name: 'Bandeau' }),
      TXT('AVIS À LA POPULATION', w / 2, 150, 92, '#ffffff', 900, { align: 'center', cx: w / 2 }),
      TXT('Titre principal de votre annonce', w / 2, 290, 48, '#ffe8e8', 400, { align: 'center', cx: w / 2 }),
      TXT('Écrivez ici le message principal.\nPrécisez la date, le lieu et les personnes concernées.\nAjoutez les pièces à fournir ou les contacts utiles.', 120, 560, 44, '#1b1f2a', 400, { lineHeight: 1.6 }),
      T('rect', { x: 120, y: 1040, w: w - 240, h: 360, radius: 24, fill: '#f5f6f9', stroke: '#c23b3b', sw: 4, dash: '16 8 2 8' }),
      TXT('Date limite : ../../....\nLieu : ...........................\nContact : ......................', 180, 1100, 46, '#1b1f2a', 600, { lineHeight: 1.6 }),
      TXT('Le responsable', w - 520, 1530, 40, '#1b1f2a', 700),
    ] },
    { id: 'story', name: 'Story / statut', sub: '1080 × 1920 — WhatsApp, Instagram', w: 1080, h: 1920, build: (w, h) => [
      T('rect', { x: 0, y: 0, w, h, fill: '#f2c94c', fill2: '#ef7d57', fillType: 'gradient', gradAngle: 90, sw: 0, name: 'Fond' }),
      T('ellipse', { x: 140, y: 360, w: 800, h: 800, fill: '#ffffff', opacity: 0.25, sw: 0 }),
      TXT('Bonne\nfête !', w / 2, 560, 200, '#1b1f2a', 900, { align: 'center', cx: w / 2, lineHeight: 1 }),
      TXT('Avec toute notre affection', w / 2, 1300, 56, '#1b1f2a', 400, { align: 'center', cx: w / 2, italic: true }),
    ] },
    { id: 'logo', name: 'Logo', sub: '1000 × 1000, fond transparent', w: 1000, h: 1000, bg: 'transparent', build: () => [
      T('polygon', { x: 250, y: 160, w: 500, h: 500, sides: 6, fill: '#0f766e', sw: 0, rot: 30 }),
      T('star', { x: 380, y: 290, w: 240, h: 240, points: 5, fill: '#f2c94c', sw: 0 }),
      TXT('MARQUE', 500, 720, 110, '#1b1f2a', 900, { align: 'center', cx: 500, letterSpacing: 12 }),
    ] },
    { id: 'banner', name: 'Bannière / couverture', sub: '1640 × 624 — Facebook', w: 1640, h: 624, build: (w, h) => [
      T('rect', { x: 0, y: 0, w, h, fill: '#1b1f2a', sw: 0, name: 'Fond' }),
      T('path', { pts: [[900, 0], [1640, 0], [1640, 624], [700, 624]], closed: true, fill: '#d9861c', sw: 0 }),
      TXT('Votre slogan ici', 100, 210, 96, '#ffffff', 800),
      TXT('Sous-titre ou site web', 104, 350, 44, '#f6d58e', 400),
    ] },
    { id: 'blank-a4', name: 'Page A4 vierge', sub: '2480 × 3508 (300 ppp)', w: 2480, h: 3508, build: () => [] },
    { id: 'blank-hd', name: 'Présentation 16:9', sub: '1920 × 1080', w: 1920, h: 1080, build: (w, h) => [
      TXT('Titre de la diapositive', 140, 120, 96, '#1b1f2a', 800),
      T('rect', { x: 140, y: 270, w: 160, h: 12, fill: '#d9861c', sw: 0 }),
      TXT('• Premier point important\n• Deuxième point\n• Troisième point', 140, 380, 56, '#3a4152', 400, { lineHeight: 1.6 }),
    ] },
  ];
  function applyTemplate(t) {
    pushUndo();
    idSeq = 1;
    state = { name: t.name, w: t.w, h: t.h, bg: t.bg || '#ffffff', objects: [] };
    state.objects = t.build(t.w, t.h);
    selIds = []; fit(); renderSide();
  }
  function templateThumb(t, n) {
    const saved = state; const savedId = idSeq;
    state = { w: t.w, h: t.h, bg: t.bg || '#ffffff', objects: t.build(t.w, t.h) };
    const { defs, body } = docSvg(true);
    state = saved; idSeq = savedId;
    const pre = (s) => s.replace(/id="([a-z]+\d+)"/g, `id="tpl${n}$1"`).replace(/url\(#([a-z]+\d+)\)/g, `url(#tpl${n}$1)`);
    return `<svg viewBox="0 0 ${t.w} ${t.h}" preserveAspectRatio="xMidYMid meet"><defs>${pre(defs)}</defs>${pre(body)}</svg>`;
  }
  async function templatesDialog() {
    const body = document.createElement('div'); body.className = 'templates';
    let chosen = null, closeBtn;
    TEMPLATES.forEach((t, n) => {
      const b = document.createElement('button');
      b.innerHTML = `${templateThumb(t, n)}<strong>${t.name}</strong><small>${t.sub}</small>`;
      b.onclick = () => { chosen = t; closeBtn.click(); };
      body.appendChild(b);
    });
    await modal({ title: 'Choisir un modèle', wide: true, body, buttons: [{ label: 'Annuler', value: null }], onOpen: (b) => { closeBtn = b.closest('.modal').querySelector('header button'); } });
    if (chosen) applyTemplate(chosen);
  }

  async function newDocDialog() {
    const res = await modal({
      title: 'Nouveau format',
      body: `<div class="grid2"><div class="field"><label for="nw">Largeur (px)</label><input type="number" id="nw" value="1080" min="1"></div><div class="field"><label for="nh">Hauteur (px)</label><input type="number" id="nh" value="1080" min="1"></div></div>
        <p class="hint">Repères : 1 mm ≈ 11,8 px à 300 ppp. A4 = 2480 × 3508 px à 300 ppp.</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Créer', primary: true, value: (b) => [+b.querySelector('#nw').value, +b.querySelector('#nh').value] }],
    });
    if (!res) return;
    pushUndo(); state = { name: 'sans-titre', w: Math.max(1, res[0]), h: Math.max(1, res[1]), bg: '#ffffff', objects: [] }; selIds = []; fit(); renderSide();
  }

  /* ---------------- Actions ---------------- */
  function zorder(kind) {
    const sel = new Set(selIds); if (!sel.size) return; pushUndo();
    const a = state.objects;
    if (kind === 'front') state.objects = [...a.filter((o) => !sel.has(o.id)), ...a.filter((o) => sel.has(o.id))];
    else if (kind === 'back') state.objects = [...a.filter((o) => sel.has(o.id)), ...a.filter((o) => !sel.has(o.id))];
    else if (kind === 'forward') { for (let i = a.length - 2; i >= 0; i--) if (sel.has(a[i].id) && !sel.has(a[i + 1].id)) [a[i], a[i + 1]] = [a[i + 1], a[i]]; }
    else for (let i = 1; i < a.length; i++) if (sel.has(a[i].id) && !sel.has(a[i - 1].id)) [a[i], a[i - 1]] = [a[i - 1], a[i]];
    render(); renderSide();
  }
  async function act(a) {
    try {
      const sel = selected();
      switch (a) {
        case 'templates': return templatesDialog();
        case 'newDoc': return newDocDialog();
        case 'undo': return undo();
        case 'redo': return redo();
        case 'delete': if (!sel.length) return; pushUndo(); state.objects = state.objects.filter((o) => !selIds.includes(o.id)); selIds = []; break;
        case 'duplicate': { if (!sel.length) return; pushUndo(); const c = sel.map((o) => cloneObj(o, 20)); state.objects.push(...c); selIds = c.map((o) => o.id); break; }
        case 'copy': if (sel.length) { clipboard = JSON.stringify(sel); toast(`${sel.length} objet${sel.length > 1 ? 's' : ''} copié${sel.length > 1 ? 's' : ''}`); } return;
        case 'paste': { if (!clipboard) return; pushUndo(); const c = JSON.parse(clipboard).map((o) => cloneObj(o, 20)); state.objects.push(...c); selIds = c.map((o) => o.id); clipboard = JSON.stringify(c); break; }
        case 'selectAll': selIds = state.objects.filter((o) => !o.locked && !o.hidden).map((o) => o.id); break;
        case 'group': {
          if (sel.length < 2) return toast('Sélectionnez au moins deux objets (Maj+clic).');
          pushUndo(); const ids = new Set(selIds);
          const children = state.objects.filter((o) => ids.has(o.id));
          const idx = state.objects.findIndex((o) => ids.has(o.id));
          const g = baseObj('group', { children, fill: 'none', sw: 0 });
          state.objects = state.objects.filter((o) => !ids.has(o.id)); state.objects.splice(idx, 0, g); selIds = [g.id]; break;
        }
        case 'ungroup': {
          const g = sel.find((o) => o.type === 'group'); if (!g) return;
          pushUndo(); const idx = state.objects.indexOf(g);
          if (g.rot) toast('La rotation du groupe a été retirée lors de la dissociation.');
          state.objects.splice(idx, 1, ...g.children); selIds = g.children.map((c) => c.id); break;
        }
        case 'front': case 'back': case 'forward': case 'backward': return zorder(a);
        case 'flipH': case 'flipV': if (!sel.length) return; pushUndo(); sel.forEach((o) => { const k = a === 'flipH' ? 'flipX' : 'flipY'; o[k] = !o[k]; }); break;
        case 'lock': if (!sel.length) return; pushUndo(); sel.forEach((o) => { o.locked = !o.locked; }); selIds = []; break;
        case 'exportPNG': return exportRaster('image/png');
        case 'exportJPG': return exportRaster('image/jpeg');
        case 'exportSVG': download(new Blob([exportSvgString()], { type: 'image/svg+xml' }), `${fname()}.svg`); return toast('SVG exporté');
        case 'exportPDF': return exportPdf();
        case 'saveProject': download(new Blob([JSON.stringify({ app: 'design-joe', v: 1, ...state })], { type: 'application/json' }), `${fname()}.joedesign`); return toast('Projet enregistré');
        case 'openProject': {
          const [f] = await pickFiles('.joedesign,.svg,application/json,image/svg+xml', false); if (!f) return;
          if (/\.svg$/i.test(f.name)) { await addImageFromFile(f); return; }
          const data = JSON.parse(await f.text()); if (data.app !== 'design-joe') throw new Error('fichier de projet invalide');
          pushUndo(); delete data.app; delete data.v; state = data; idSeq = 1 + Math.max(0, ...allObjects(state.objects).map((o) => o.id)); selIds = []; fit(); renderSide(); return;
        }
        case 'zoomIn': zoom = Math.min(16, zoom * 1.25); break;
        case 'zoomOut': zoom = Math.max(0.05, zoom / 1.25); break;
        case 'fit': return fit();
      }
      render(); renderSide();
    } catch (e) { console.error(e); toast('Erreur : ' + (e.message || e), 5000); }
  }
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));

  function fit() {
    const st = $('#stage');
    zoom = Math.min(1.5, (st.clientWidth - 80) / state.w, (st.clientHeight - 80) / state.h);
    zoom = Math.max(0.05, zoom); render();
  }
  $('#stage').addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom = clamp(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.05, 16); render(); }, { passive: false });
  $('#stage').addEventListener('pointerdown', (e) => { if (e.target.id === 'stage' && tool === 'select') { selIds = []; render(); renderSide(); } });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod) {
      const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', c: 'copy', v: 'paste', d: 'duplicate', a: 'selectAll', g: e.shiftKey ? 'ungroup' : 'group', s: 'exportPNG', 0: 'fit', '=': 'zoomIn', '+': 'zoomIn', '-': 'zoomOut', ']': e.shiftKey ? 'front' : 'forward', '[': e.shiftKey ? 'back' : 'backward', '}': 'front', '{': 'back' };
      if (map[k]) { e.preventDefault(); act(map[k]); } return;
    }
    if (e.key === 'Enter' && tool === 'pen') { finishPen(); return; }
    if (e.key === 'Escape') { if (draft) { if (tool === 'pen') finishPen(); draft = null; } selIds = []; nodeEdit = null; setTool('select'); renderSide(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act('delete'); return; }
    if (e.key.startsWith('Arrow') && selIds.length) {
      e.preventDefault(); if (!e.repeat) pushUndo(); const d = e.shiftKey ? 10 : 1;
      selected().forEach((o) => { const b = getBox(o); setBox(o, { ...b, x: b.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0), y: b.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0) }); });
      render(); updateGeomFields(); return;
    }
    const t = TOOLS.find((x) => x[2] === k); if (t) setTool(t[0]);
  });
  document.addEventListener('paste', async (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); await addImageFromFile(item.getAsFile()); }
  });
  onDropFiles($('#stage'), async (files) => {
    for (const f of files) {
      if (/\.joedesign$/i.test(f.name)) { const data = JSON.parse(await f.text()); pushUndo(); delete data.app; delete data.v; state = data; idSeq = 1 + Math.max(0, ...allObjects(state.objects).map((o) => o.id)); fit(); renderSide(); }
      else if (f.type.startsWith('image/')) await addImageFromFile(f);
    }
  });
  window.addEventListener('resize', () => render());

  buildRail(); initMenus();
  applyTemplate(TEMPLATES[0]); undoStack.length = 0; updateHist();
  setTool('select');
  requestAnimationFrame(fit);

  window.DesignJoe = { get state() { return state; }, act, setTool, exportSvgString, rasterize, TEMPLATES, applyTemplate, get selIds() { return selIds; } };
})();
