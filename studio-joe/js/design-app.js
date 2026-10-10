/* Design Joe — éditeur vectoriel (formes, plume, crayon, texte, images, groupes, dégradés,
   alignement, repères magnétiques, modèles, export PNG/JPG/SVG/PDF). */
(function () {
  const { $, $$, toast, download, pickFiles, baseName, initMenus, modal, store, onDropFiles, loadImage, readAsDataURL, clamp } = Studio;
  const NS = 'http://www.w3.org/2000/svg';
  const board = $('#board');

  /* ---------------- État ---------------- */
  let state = link({ name: 'sans-titre', w: 1080, h: 1080, bg: '#ffffff', objects: [] });
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
  function restoreJSON(j) { state = link(JSON.parse(j)); idSeq = maxId(); selIds = selIds.filter((id) => byId(id)); render(); renderSide(); renderPages(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); restoreJSON(undoStack.pop()); updateHist(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restoreJSON(redoStack.pop()); updateHist(); }
  function updateHist() { $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length; }
  const allObjects = (list) => list.flatMap((o) => (o.type === 'group' ? [o, ...allObjects(o.children)] : [o]));
  const maxId = () => 1 + Math.max(0, ...state.pages.flatMap((pg) => allObjects(pg.objects)).map((o) => o.id));

  /* Document multipage : state.pages[] ; state.objects et state.bg désignent la page courante. */
  function link(s) {
    if (!s.pages) { s.pages = [{ bg: s.bg ?? '#ffffff', objects: s.objects || [] }]; delete s.objects; delete s.bg; }
    s.cur = Math.min(Math.max(0, s.cur || 0), s.pages.length - 1);
    if (!s.brand) s.brand = store('designjoe-brand') || { colors: ['#1b1f2a', '#d9861c', '#0f766e', '#ffffff'], heading: 'Segoe UI', body: 'Segoe UI' };
    Object.defineProperty(s, 'objects', { get() { return this.pages[this.cur].objects; }, set(v) { this.pages[this.cur].objects = v; }, enumerable: false, configurable: true });
    Object.defineProperty(s, 'bg', { get() { return this.pages[this.cur].bg; }, set(v) { this.pages[this.cur].bg = v; }, enumerable: false, configurable: true });
    return s;
  }

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
    if (o.curve) {
      const one = lines.join(' ');
      o.tw = mctx.measureText(one).width + ls * Math.max(0, [...one].length - 1);
      const g = curveGeom(o); const cx = o.x + o.w / 2;
      o.w = Math.max(4, g.chord + o.fontSize * 0.6); o.x = cx - o.w / 2;
      o.h = o.fontSize * 1.15 + g.sag;
    }
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
        const tattrs = `font-family="${esc(o.fontFamily)}, sans-serif" font-size="${o.fontSize}" font-weight="${o.fontWeight || 400}"${o.italic ? ' font-style="italic"' : ''}${o.letterSpacing ? ` letter-spacing="${o.letterSpacing}"` : ''}${o.underline ? ' text-decoration="underline"' : ''}`;
        let glow = '';
        if (o.glow) { defs.push(`<filter id="gl${o.id}" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur in="SourceGraphic" stdDeviation="${o.fontSize / 9}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`); glow = ` filter="url(#gl${o.id})"`; }
        if (o.bgColor) { const pd = o.fontSize * 0.18; inner += `<rect x="${b.x - pd * 1.5}" y="${b.y - pd}" width="${b.w + pd * 3}" height="${b.h + pd * 2}" rx="${pd * 1.5}" fill="${o.bgColor}"/>`; }
        if (o.curve && o.tw) {
          const g = curveGeom(o), base = o.y + o.fontSize * 0.86;
          const y1 = o.curve > 0 ? base + g.sag : base, x0 = c.x - g.chord / 2, x1 = c.x + g.chord / 2;
          defs.push(`<path id="cv${o.id}" d="M${x0} ${y1} A${g.R} ${g.R} 0 0 ${o.curve > 0 ? 1 : 0} ${x1} ${y1}"/>`);
          inner += `<text ${tattrs} ${common}${glow}><textPath href="#cv${o.id}" startOffset="50%" text-anchor="middle">${esc(lines.join(' '))}</textPath></text>`;
          break;
        }
        inner += `<text${glow} x="${tx}" y="${o.y + o.fontSize * 0.86}" font-family="${esc(o.fontFamily)}, sans-serif" font-size="${o.fontSize}" font-weight="${o.fontWeight || 400}"${o.italic ? ' font-style="italic"' : ''}${o.letterSpacing ? ` letter-spacing="${o.letterSpacing}"` : ''}${o.underline ? ' text-decoration="underline"' : ''} text-anchor="${anchor}" ${common} xml:space="preserve">${lines.map((l, i) => `<tspan x="${tx}" dy="${i ? o.fontSize * (o.lineHeight || 1.2) : 0}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
        break;
      }
      case 'image': inner = imageSvg(o, defs, st); break;
      case 'icon': inner = iconSvg(o, fill); break;
      case 'qr': inner = qrSvg(o); break;
      case 'chart': inner = chartSvg(o); break;
      case 'table': inner = tableSvg(o); break;
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
  function docSvg(forExport, pageIdx = state.cur) {
    const defs = []; const pg = state.pages[pageIdx];
    const body = pg.objects.map((o) => objSvg(o, defs, forExport)).join('');
    const bg = pg.bg && pg.bg !== 'transparent' ? `<rect width="${state.w}" height="${state.h}" fill="${pg.bg}"/>` : '';
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
    schedulePages();
    $('#status').textContent = `${state.w} × ${state.h} px · page ${state.cur + 1}/${state.pages.length} · ${state.objects.length} objet${state.objects.length > 1 ? 's' : ''}`;
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

  /* ---------------- Éléments façon Canva : icônes, cadres, graphiques, tableaux, QR ---------------- */
  // icônes au trait (grille 24 × 24)
  const ICONS = {
    maison: 'M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5', telephone: 'M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2z',
    email: 'M3 5h18v14H3zM3 6l9 7 9-7', lieu: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    agenda: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4', horloge: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    personne: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', groupe: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 13.5a7 7 0 0 1 4 6.5',
    etoile: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z', coeur: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
    valider: 'm4 12 5 5L20 6', fermer: 'M5 5l14 14M19 5 5 19', ajouter: 'M12 4v16M4 12h16', fleche: 'M4 12h15M13 6l6 6-6 6',
    recherche: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5', appareil: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    musique: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', cloche: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
    panier: 'M3 4h2l3 11h11l2-8H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', cadeau: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9S10 3 7.5 4.5 9 9 12 9zM12 9s2-6 4.5-4.5S15 9 12 9z',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', cadenas: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5', alerte: 'M12 3 2 20h20zM12 10v4M12 17v.5',
    pouce: 'M7 11v10H3V11zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 21H7', message: 'M4 4h16v12H9l-5 4z',
    mallette: 'M3 7h18v13H3zM8 7V4h8v3M3 13h18', livre: 'M4 4h7a2 2 0 0 1 1 2v14a3 3 0 0 0-3-2H4zM20 4h-7a2 2 0 0 0-1 2v14a3 3 0 0 1 3-2h5z',
    medaille: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 22l5-3 5 3-1.5-8', camion: 'M2 6h12v10H2zM14 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    soleil: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    feuille: 'M5 19C4 10 10 4 20 4c0 10-6 16-15 15zM5 19 13 11', argent: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
    graphique: 'M4 20V10M10 20V4M16 20v-7M22 20H2', ecole: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5', sante: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01', imprimante: 'M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6z',
  };
  // formes pleines (grille 24 × 24)
  const SHAPES = {
    'Bulle': 'M3 4h18v12H10l-5 5v-5H3z', 'Bulle ronde': 'M12 3c5 0 9 3.4 9 7.5S17 18 12 18c-1 0-2 0-3-.4L4 20l1.6-4A7 7 0 0 1 3 10.5C3 6.4 7 3 12 3z',
    'Cœur': 'M12 21C5 16 2 12.5 2 8.5A5 5 0 0 1 12 6a5 5 0 0 1 10 2.5C22 12.5 19 16 12 21z', 'Flèche': 'M2 9h12V4l8 8-8 8v-5H2z',
    'Flèche double': 'M1 12l6-6v4h10V6l6 6-6 6v-4H7v4z', 'Chevron': 'M2 4h13l7 8-7 8H2l7-8z', 'Croix': 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z',
    'Badge': 'm12 1 2.6 2.4 3.5-.4.8 3.4 3.1 1.7-1.4 3.2 1.4 3.2-3.1 1.7-.8 3.4-3.5-.4L12 23l-2.6-2.4-3.5.4-.8-3.4-3.1-1.7 1.4-3.2-1.4-3.2 3.1-1.7.8-3.4 3.5.4z',
    'Nuage': 'M7 19a5 5 0 0 1-.9-9.9A6.5 6.5 0 0 1 18.5 8 5.5 5.5 0 0 1 18 19z', 'Goutte': 'M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z',
    'Ruban': 'M1 6h22l-4 6 4 6H1l4-6z', 'Éclair': 'M13 1 4 14h7l-1 9 9-13h-7z', 'Lune': 'M20 15A9 9 0 1 1 10 3a7 7 0 0 0 10 12z',
    'Bouclier': 'M12 2 3 5v7c0 5.5 4 9 9 10 5-1 9-4.5 9-10V5z', 'Arche': 'M3 22V11a9 9 0 0 1 18 0v11z', 'Vague': 'M0 10c4-4 8 4 12 0s8-4 12 0v12H0z',
  };
  const EMOJIS = ['😀', '😍', '🎉', '🎂', '🎁', '❤️', '👍', '🙏', '🔥', '⭐', '✅', '📌', '📞', '📍', '📅', '💡', '🏆', '🎓', '💼', '🌍', '🌞', '🌺', '⚽', '🎵', '📢', '💰', '🚀', '👏', '🇧🇫', '☕'];
  const MASKS = { none: 'Aucun', circle: 'Cercle', rounded: 'Arrondi', hexagon: 'Hexagone', star: 'Étoile', heart: 'Cœur', triangle: 'Triangle', arch: 'Arche' };

  function maskShape(o) {
    const { x, y, w, h } = o; const fake = (type, extra) => polyPoints({ type, x, y, w, h, ...extra });
    switch (o.mask) {
      case 'circle': return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
      case 'rounded': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.15}"/>`;
      case 'hexagon': return `<polygon points="${fake('polygon', { sides: 6 })}"/>`;
      case 'triangle': return `<polygon points="${fake('polygon', { sides: 3 })}"/>`;
      case 'star': return `<polygon points="${fake('star', { points: 5, inner: 0.5 })}"/>`;
      case 'heart': return `<path transform="translate(${x} ${y}) scale(${w / 24} ${h / 24})" d="${SHAPES['Cœur']}"/>`;
      case 'arch': return `<path transform="translate(${x} ${y}) scale(${w / 24} ${h / 24})" d="M0 24V11.5a12 12 0 0 1 24 0V24z"/>`;
      default: return o.radius ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.radius}"/>` : '';
    }
  }
  const FILTER_PRESETS = {
    'Original': { fBright: 100, fContrast: 100, fSat: 100, fBlur: 0, fTemp: 0 },
    'Vif': { fBright: 105, fContrast: 115, fSat: 145, fBlur: 0, fTemp: 0 },
    'Noir & blanc': { fBright: 100, fContrast: 120, fSat: 0, fBlur: 0, fTemp: 0 },
    'Chaud': { fBright: 103, fContrast: 105, fSat: 110, fBlur: 0, fTemp: 45 },
    'Froid': { fBright: 100, fContrast: 105, fSat: 95, fBlur: 0, fTemp: -45 },
    'Vintage': { fBright: 105, fContrast: 85, fSat: 60, fBlur: 0, fTemp: 35 },
    'Doux': { fBright: 108, fContrast: 90, fSat: 90, fBlur: 1.5, fTemp: 10 },
    'Dramatique': { fBright: 92, fContrast: 140, fSat: 80, fBlur: 0, fTemp: -10 },
  };
  function imageFilter(o, defs) {
    const b = (o.fBright ?? 100) / 100, c = (o.fContrast ?? 100) / 100, sat = (o.fSat ?? 100) / 100, blur = o.fBlur || 0, t = (o.fTemp || 0) / 100 * 0.12;
    if (b === 1 && c === 1 && sat === 1 && !blur && !t) return '';
    const slope = b * c, icpt = b * (0.5 - 0.5 * c);
    defs.push(`<filter id="if${o.id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
      <feColorMatrix type="saturate" values="${sat}"/>
      <feComponentTransfer><feFuncR type="linear" slope="${slope}" intercept="${icpt + t}"/><feFuncG type="linear" slope="${slope}" intercept="${icpt}"/><feFuncB type="linear" slope="${slope}" intercept="${icpt - t}"/></feComponentTransfer>
      ${blur ? `<feGaussianBlur stdDeviation="${blur * Math.max(o.w, o.h) / 400}"/>` : ''}</filter>`);
    return ` filter="url(#if${o.id})"`;
  }
  function imageSvg(o, defs, st) {
    let clip = '';
    const shape = maskShape(o);
    if (shape) { defs.push(`<clipPath id="clip${o.id}">${shape}</clipPath>`); clip = ` clip-path="url(#clip${o.id})"`; }
    let s = '';
    if (!o.href) {
      const fs = Math.max(10, Math.min(o.w, o.h) / 9);
      s = `<g${clip}><rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#dfe3ec"/><text x="${o.x + o.w / 2}" y="${o.y + o.h / 2}" font-family="Segoe UI, sans-serif" font-size="${fs}" fill="#6b7386" text-anchor="middle" dominant-baseline="middle">＋ Photo</text></g>`;
    } else {
      s = `<g${clip}><image href="${o.href}" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" preserveAspectRatio="${o.fit === 'cover' ? 'xMidYMid slice' : 'none'}"${imageFilter(o, defs)}/></g>`;
    }
    if (o.stroke && o.sw) s += shape ? shape.replace(/\/>$/, ` fill="none"${st}/>`).replace(/^<(\w+)/, '<$1') : `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="none"${st}/>`;
    return s;
  }

  function iconSvg(o, fill) {
    const d = o.shape ? SHAPES[o.shape] : ICONS[o.icon];
    if (!d) return '';
    const paint = o.shape ? `fill="${fill}"${o.stroke && o.sw ? ` stroke="${o.stroke}" stroke-width="${o.sw}" vector-effect="non-scaling-stroke" stroke-linejoin="round"` : ''}`
      : `fill="none" stroke="${o.fill && o.fill !== 'none' ? o.fill : '#1b1f2a'}" stroke-width="${o.iconW || 2}" stroke-linecap="round" stroke-linejoin="round"`;
    return `<svg x="${o.x}" y="${o.y}" width="${Math.max(1, o.w)}" height="${Math.max(1, o.h)}" viewBox="0 0 24 24" preserveAspectRatio="none" overflow="visible"><path d="${d}" ${paint}/></svg>`;
  }

  const qrCache = new Map();
  function qrMatrix(text) {
    if (qrCache.has(text)) return qrCache.get(text);
    let m = null;
    try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      const q = qrcode(0, 'M'); q.addData(text || ' '); q.make();
      const n = q.getModuleCount(); m = { n, d: '' };
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) m.d += `M${c} ${r}h1v1h-1z`;
    } catch (e) { m = null; }
    qrCache.set(text, m); return m;
  }
  function qrSvg(o) {
    const m = qrMatrix(o.data || '');
    if (!m) return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#fdd"/><text x="${o.x + 8}" y="${o.y + 24}" font-size="16" fill="#900">Texte trop long</text>`;
    const q = 2; // zone de silence
    return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.bgQR || '#ffffff'}"/><svg x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" viewBox="${-q} ${-q} ${m.n + 2 * q} ${m.n + 2 * q}" shape-rendering="crispEdges"><path d="${m.d}" fill="${o.fill && o.fill !== 'none' ? o.fill : '#000000'}"/></svg>`;
  }

  function parseRows(text) {
    return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\t|;/).map((c) => c.trim()));
  }
  const fmtNum = (v) => (Math.round(v * 100) / 100).toLocaleString('fr-FR');
  function chartSvg(o) {
    const rows = parseRows(o.data).map(([l, v]) => [l, parseFloat(String(v || '0').replace(/\s/g, '').replace(',', '.')) || 0]);
    if (!rows.length) return '';
    // couleurs de la marque, les plus foncées en dernier pour garder des barres lisibles
    const lum = (c) => { const n = parseInt(c.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    const brandCols = state.brand.colors.filter((c) => lum(c) < 0.95).sort((a, b) => (lum(a) < 0.18) - (lum(b) < 0.18));
    const pal = (o.colors && o.colors.length ? o.colors : brandCols).concat(['#d9861c', '#1a3d8f', '#0f766e', '#c23b3b', '#7b3fa0', '#f2c94c']);
    const tc = o.textColor || '#1b1f2a', ff = 'font-family="Segoe UI, Arial, sans-serif"';
    const { x, y, w, h } = o; const fs = Math.max(9, Math.min(w, h) / 18);
    let s = '';
    const max = Math.max(...rows.map((r) => r[1]), 0) || 1;
    if (o.kind === 'pie' || o.kind === 'donut') {
      const total = rows.reduce((a, r) => a + Math.max(0, r[1]), 0) || 1;
      const legendW = w * 0.38, R = Math.min((w - legendW) * 0.46, h * 0.46), cx = x + (w - legendW) / 2, cy = y + h / 2;
      let a0 = -Math.PI / 2;
      rows.forEach(([l, v], i) => {
        const a1 = a0 + Math.max(0, v) / total * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
        const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
        s += rows.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${pal[i]}"/>` : `<path d="M${cx} ${cy}L${p0}A${R} ${R} 0 ${large} 1 ${p1}Z" fill="${pal[i % pal.length]}" stroke="#fff" stroke-width="${R / 60}"/>`;
        const ly = y + h / 2 - rows.length * fs * 0.8 + i * fs * 1.6;
        s += `<rect x="${x + w - legendW + fs * 0.5}" y="${ly}" width="${fs}" height="${fs}" rx="${fs / 4}" fill="${pal[i % pal.length]}"/><text x="${x + w - legendW + fs * 2}" y="${ly + fs * 0.85}" font-size="${fs}" fill="${tc}" ${ff}>${esc(l)} — ${Math.round(v / total * 100)} %</text>`;
        a0 = a1;
      });
      if (o.kind === 'donut') s += `<circle cx="${cx}" cy="${cy}" r="${R * 0.55}" fill="${o.holeColor || '#ffffff'}"/>`;
      return s;
    }
    if (o.kind === 'bar') { // barres horizontales
      const lw = w * 0.28, bh = h / rows.length;
      rows.forEach(([l, v], i) => {
        const bw = Math.max(0, v) / max * (w - lw - fs * 4);
        s += `<text x="${x + lw - fs * 0.5}" y="${y + i * bh + bh / 2}" font-size="${fs}" fill="${tc}" text-anchor="end" dominant-baseline="middle" ${ff}>${esc(l)}</text>`;
        s += `<rect x="${x + lw}" y="${y + i * bh + bh * 0.18}" width="${bw}" height="${bh * 0.64}" rx="${bh * 0.08}" fill="${pal[o.multi ? i % pal.length : 0]}"/>`;
        s += `<text x="${x + lw + bw + fs * 0.4}" y="${y + i * bh + bh / 2}" font-size="${fs * 0.9}" fill="${tc}" dominant-baseline="middle" ${ff}>${fmtNum(v)}</text>`;
      });
      return s;
    }
    // colonnes ou courbe
    const top = y + fs * 1.8, bottom = y + h - fs * 2, ph = bottom - top, cw = w / rows.length;
    s += `<line x1="${x}" y1="${bottom}" x2="${x + w}" y2="${bottom}" stroke="${tc}" stroke-opacity=".35" stroke-width="${fs / 10}"/>`;
    for (let g = 1; g <= 3; g++) s += `<line x1="${x}" y1="${bottom - ph * g / 3}" x2="${x + w}" y2="${bottom - ph * g / 3}" stroke="${tc}" stroke-opacity=".1" stroke-width="${fs / 12}"/>`;
    const pts = rows.map(([, v], i) => [x + cw * (i + 0.5), bottom - Math.max(0, v) / max * ph]);
    if (o.kind === 'line') {
      s += `<path d="M${pts[0]} L${pts.join(' L')} L${x + cw * (rows.length - 0.5)} ${bottom} L${x + cw * 0.5} ${bottom}Z" fill="${pal[0]}" fill-opacity=".15"/>`;
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${pal[0]}" stroke-width="${fs / 4}" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((p) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="${fs / 3}" fill="#fff" stroke="${pal[0]}" stroke-width="${fs / 6}"/>`; });
    } else rows.forEach(([, v], i) => { s += `<rect x="${x + cw * i + cw * 0.18}" y="${pts[i][1]}" width="${cw * 0.64}" height="${bottom - pts[i][1]}" rx="${cw * 0.06}" fill="${pal[o.multi ? i % pal.length : 0]}"/>`; });
    rows.forEach(([l, v], i) => {
      s += `<text x="${pts[i][0]}" y="${bottom + fs * 1.3}" font-size="${fs}" fill="${tc}" text-anchor="middle" ${ff}>${esc(l)}</text>`;
      s += `<text x="${pts[i][0]}" y="${pts[i][1] - fs * 0.5}" font-size="${fs * 0.9}" fill="${tc}" text-anchor="middle" font-weight="600" ${ff}>${fmtNum(v)}</text>`;
    });
    return s;
  }
  function tableSvg(o) {
    const rows = parseRows(o.data); if (!rows.length) return '';
    const nc = Math.max(...rows.map((r) => r.length)), rh = o.h / rows.length, cw = o.w / nc;
    const fs = o.cellFont || Math.max(8, Math.min(rh * 0.42, cw / 7)), lc = o.stroke || '#c9ced8', ff = 'font-family="Segoe UI, Arial, sans-serif"';
    let s = `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.fill && o.fill !== 'none' ? o.fill : '#ffffff'}"/>`;
    rows.forEach((r, i) => {
      const head = i === 0 && o.header !== false;
      if (head) s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${rh}" fill="${o.headColor || '#1a3d8f'}"/>`;
      else if (o.zebra && i % 2 === 0) s += `<rect x="${o.x}" y="${o.y + i * rh}" width="${o.w}" height="${rh}" fill="${o.headColor || '#1a3d8f'}" fill-opacity=".08"/>`;
      for (let c = 0; c < nc; c++) {
        const v = r[c] ?? ''; const isNum = /^-?[\d\s.,]+%?$/.test(v) && v !== '';
        s += `<text x="${isNum && !head ? o.x + (c + 1) * cw - fs * 0.6 : o.x + c * cw + fs * 0.6}" y="${o.y + i * rh + rh / 2}" font-size="${fs}" dominant-baseline="middle"${isNum && !head ? ' text-anchor="end"' : ''} fill="${head ? '#ffffff' : (o.textColor || '#1b1f2a')}"${head ? ' font-weight="700"' : ''} ${ff}>${esc(v)}</text>`;
      }
    });
    for (let i = 1; i < rows.length; i++) s += `<line x1="${o.x}" y1="${o.y + i * rh}" x2="${o.x + o.w}" y2="${o.y + i * rh}" stroke="${lc}" stroke-width="${Math.max(1, fs / 14)}"/>`;
    for (let c = 1; c < nc; c++) s += `<line x1="${o.x + c * cw}" y1="${o.y}" x2="${o.x + c * cw}" y2="${o.y + o.h}" stroke="${lc}" stroke-width="${Math.max(1, fs / 14)}"/>`;
    s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="none" stroke="${lc}" stroke-width="${Math.max(1, fs / 10)}"/>`;
    return s;
  }
  // texte courbé : arc de cercle dont l'amplitude dépend de o.curve (-100 à 100)
  function curveGeom(o) {
    const t = Math.abs(o.curve) / 100 * Math.PI, R = o.tw / t;
    return { t, R, chord: 2 * R * Math.sin(t / 2), sag: R * (1 - Math.cos(t / 2)) };
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
    rail.insertAdjacentHTML('beforeend', `<div class="sep"></div>
      <button class="tool" id="libBtn" title="Éléments : formes, icônes, cadres, graphiques, QR (K)" aria-label="Éléments"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="m6.5 14 4 7h-8zM14 14h7v7h-7z"/></svg></button>
      <button class="tool" id="tplBtn" title="Modèles" aria-label="Modèles"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg></button>`);
    $('#libBtn').onclick = libraryDialog; $('#tplBtn').onclick = templatesDialog;
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
        <div class="row"><button data-act="templates">Modèles…</button><button data-act="library">Éléments…</button><button data-act="magicResize">Redimensionner…</button></div></div>
        <div class="section"><h3>Kit de marque</h3>
        <div class="row">${state.brand.colors.map((c, i) => `<button data-brand-del="${i}" title="Retirer ${c}" style="width:26px;height:26px;padding:0;background:${c}" aria-label="Retirer la couleur ${c}"></button>`).join('')}
          <input type="color" id="brandNew" value="#7b3fa0" aria-label="Nouvelle couleur de marque"><button id="brandAdd">+ Couleur</button></div>
        <div class="grid2">${field('Police des titres', `<select id="brandHead">${FONTS.map((f) => `<option ${state.brand.heading === f ? 'selected' : ''}>${f}</option>`).join('')}</select>`, 'brandHead')}${field('Police du texte', `<select id="brandBody">${FONTS.map((f) => `<option ${state.brand.body === f ? 'selected' : ''}>${f}</option>`).join('')}</select>`, 'brandBody')}</div>
        <p class="hint">Vos couleurs apparaissent en premier dans les nuanciers, les graphiques et les styles de texte.</p></div>`;
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
      if (sel.length === 1 && !['group', 'image', 'qr', 'chart', 'table'].includes(o.type) && !(o.type === 'icon' && o.icon)) h += fillStrokeSection(o);
      if (sel.length === 1 && o.type === 'image') h += imageSection(o);
      if (sel.length === 1 && o.type === 'icon' && o.icon) h += `<div class="section"><h3>Icône</h3><div class="row"><label for="pIconC">Couleur</label><input type="color" id="pIconC" value="${o.fill && o.fill !== 'none' ? o.fill : '#1b1f2a'}">${field('Épaisseur du trait', num('pIconW', o.iconW || 2, 0.25, 0.25, 6), 'pIconW')}</div>${swatchRow()}</div>`;
      if (sel.length === 1 && o.type === 'qr') h += `<div class="section"><h3>QR code</h3>${field('Contenu (lien, numéro, texte)', `<textarea id="pQr">${esc(o.data || '')}</textarea>`, 'pQr')}<div class="row"><label for="pQrD">Motif</label><input type="color" id="pQrD" value="${o.fill || '#000000'}"><label for="pQrL">Fond</label><input type="color" id="pQrL" value="${o.bgQR || '#ffffff'}"></div><p class="hint">Gardez un bon contraste (motif foncé sur fond clair) pour que les téléphones le lisent.</p></div>`;
      if (sel.length === 1 && o.type === 'chart') h += `<div class="section"><h3>Graphique</h3>${field('Type', `<select id="pChK">${[['column', 'Colonnes'], ['bar', 'Barres'], ['line', 'Courbe'], ['pie', 'Secteurs'], ['donut', 'Anneau']].map(([v, l]) => `<option value="${v}" ${o.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'pChK')}
        ${field('Données (une ligne par élément : libellé;valeur)', `<textarea id="pChD" rows="6">${esc(o.data || '')}</textarea>`, 'pChD')}
        <div class="row"><label><input type="checkbox" id="pChM" ${o.multi ? 'checked' : ''}> Une couleur par élément</label><label for="pChT">Texte</label><input type="color" id="pChT" value="${o.textColor || '#1b1f2a'}"></div>
        <div class="row"><label for="pChC">Couleur principale</label><input type="color" id="pChC" value="${(o.colors && o.colors[0]) || '#d9861c'}"><button id="pChReset">Couleurs de la marque</button></div></div>`;
      if (sel.length === 1 && o.type === 'table') h += `<div class="section"><h3>Tableau</h3>${field('Cellules (colonnes séparées par « ; », une ligne par rangée)', `<textarea id="pTbD" rows="6">${esc(o.data || '')}</textarea>`, 'pTbD')}
        <div class="row"><label><input type="checkbox" id="pTbH" ${o.header !== false ? 'checked' : ''}> En-tête</label><label><input type="checkbox" id="pTbZ" ${o.zebra ? 'checked' : ''}> Lignes alternées</label></div>
        <div class="row"><label for="pTbHC">En-tête</label><input type="color" id="pTbHC" value="${o.headColor || '#1a3d8f'}"><label for="pTbTC">Texte</label><input type="color" id="pTbTC" value="${o.textColor || '#1b1f2a'}"><label for="pTbLC">Lignes</label><input type="color" id="pTbLC" value="${o.stroke || '#c9ced8'}"></div>
        ${field('Taille du texte (0 = auto)', num('pTbF', o.cellFont || 0, 1, 0), 'pTbF')}</div>`;
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
  const typeName = (o) => ({ rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygone', star: 'Étoile', line: 'Ligne', path: 'Tracé', text: 'Texte', image: o.href ? 'Image' : 'Cadre photo', group: 'Groupe', icon: o.shape || `Icône ${o.icon}`, qr: 'QR code', chart: 'Graphique', table: 'Tableau' }[o.type]);
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
      ${swatchRow()}</div>`;
  }
  function swatchRow() {
    const cols = [...new Set([...state.brand.colors, '#1b1f2a', '#ffffff', '#d9861c', '#c23b3b', '#2f8a57', '#1a3d8f', '#7b3fa0', '#f2c94c', '#0f766e', '#ef7d57'].map((c) => c.toLowerCase()))];
    return `<div class="row" id="swatches">${cols.map((c, i) => `<button data-sw="${c}" title="${c}${i < state.brand.colors.length ? ' (marque)' : ''}" style="width:22px;height:22px;padding:0;background:${c}${i < state.brand.colors.length ? ';outline:2px solid var(--accent);outline-offset:1px' : ''}" aria-label="Couleur ${c}"></button>`).join('')}</div>`;
  }
  function imageSection(o) {
    const sl = (id, label, v, min, max, step = 1) => `<div class="slider"><label for="${id}">${label}</label><output>${v}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></div>`;
    return `<div class="section"><h3>Image</h3>
      <div class="grid2">${field('Forme du cadre', `<select id="pMask">${Object.entries(MASKS).map(([k, l]) => `<option value="${k}" ${(o.mask || 'none') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'pMask')}
      ${field('Remplissage', `<select id="pFit"><option value="cover" ${o.fit === 'cover' ? 'selected' : ''}>Rogner pour remplir</option><option value="stretch" ${o.fit !== 'cover' ? 'selected' : ''}>Étirer</option></select>`, 'pFit')}</div>
      <div class="row"><button id="replImg">${o.href ? 'Remplacer' : 'Choisir'} la photo…</button>${o.href ? '<button id="rmBg">Supprimer le fond</button>' : ''}</div>
      <div class="grid2">${field('Bordure', num('pSw', o.sw || 0, 1, 0), 'pSw')}<div class="field"><label for="pStroke">Couleur bordure</label><input type="color" id="pStroke" value="${o.stroke || '#000000'}"></div></div></div>
      ${o.href ? `<div class="section"><h3>Filtres photo</h3><div class="row">${Object.keys(FILTER_PRESETS).map((k) => `<button data-preset="${k}" style="padding:3px 8px;font-size:12px">${k}</button>`).join('')}</div>
      ${sl('pFB', 'Luminosité', o.fBright ?? 100, 20, 200)}${sl('pFC', 'Contraste', o.fContrast ?? 100, 20, 200)}${sl('pFS', 'Saturation', o.fSat ?? 100, 0, 250)}${sl('pFT', 'Température', o.fTemp || 0, -100, 100)}${sl('pFBl', 'Flou', o.fBlur || 0, 0, 20, 0.5)}</div>` : ''}`;
  }
  function textSection(o) {
    return `<div class="section"><h3>Texte</h3>
      <textarea id="pText" aria-label="Contenu du texte">${esc(o.text)}</textarea>
      ${field('Police', `<select id="pFont">${FONTS.map((f) => `<option ${o.fontFamily === f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select>`, 'pFont')}
      <div class="grid2">${field('Taille', num('pFs', o.fontSize, 1, 2), 'pFs')}${field('Graisse', `<select id="pFw">${[[300, 'Fin'], [400, 'Normal'], [600, 'Demi-gras'], [700, 'Gras'], [900, 'Noir']].map(([v, l]) => `<option value="${v}" ${+o.fontWeight === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'pFw')}</div>
      <div class="grid2">${field('Interligne', num('pLh', o.lineHeight || 1.2, 0.05, 0.5, 4), 'pLh')}${field('Espacement', num('pLs', o.letterSpacing || 0, 0.5, -20, 100), 'pLs')}</div>
      <div class="row"><select id="pAlign" style="width:auto"><option value="left">Gauche</option><option value="center" ${o.align === 'center' ? 'selected' : ''}>Centre</option><option value="right" ${o.align === 'right' ? 'selected' : ''}>Droite</option></select>
      <label><input type="checkbox" id="pItalic" ${o.italic ? 'checked' : ''}> Italique</label><label><input type="checkbox" id="pUnder" ${o.underline ? 'checked' : ''}> Souligné</label></div>
      <div class="row"><button id="pUpper">MAJUSCULES</button><button id="pLower">minuscules</button><button id="pBrandFont">Police de la marque</button></div></div>
      <div class="section"><h3>Effets de texte</h3>
      <div class="slider"><label for="pCurve">Courbure</label><output>${o.curve || 0}</output><input type="range" id="pCurve" min="-100" max="100" value="${o.curve || 0}"></div>
      <div class="row"><label><input type="checkbox" id="pGlow" ${o.glow ? 'checked' : ''}> Néon (lueur)</label><label><input type="checkbox" id="pBgOn" ${o.bgColor ? 'checked' : ''}> Surlignage</label><input type="color" id="pBgC" value="${o.bgColor || '#f2c94c'}" aria-label="Couleur du surlignage"></div>
      <div class="row"><label for="pOutC">Contour</label><input type="color" id="pOutC" value="${o.stroke || '#000000'}">${field('Épaisseur', num('pOutW', o.sw || 0, 0.5, 0), 'pOutW')}</div>
      <div class="row">${Object.keys(TEXT_STYLES).map((k) => `<button data-tstyle="${k}" style="padding:3px 8px;font-size:12px">${k}</button>`).join('')}</div></div>`;
  }
  const TEXT_STYLES = {
    'Ombre douce': (o) => Object.assign(o, { shadow: true, shadowBlur: o.fontSize / 10, shadowX: o.fontSize / 20, shadowY: o.fontSize / 14, shadowOpacity: 0.35, glow: false }),
    'Néon': (o) => Object.assign(o, { glow: true, fill: '#ff4fd8', shadow: false, bgColor: '' }),
    'Contour': (o) => Object.assign(o, { stroke: o.fill, sw: Math.max(1, o.fontSize / 25), fill: 'none', fillType: 'solid' }),
    'Étiquette': (o) => Object.assign(o, { bgColor: state.brand.colors[1] || '#f2c94c', fill: '#1b1f2a', glow: false }),
    'Aucun': (o) => Object.assign(o, { shadow: false, glow: false, bgColor: '', sw: 0, curve: 0, fill: o.fill === 'none' ? (o.stroke || '#1b1f2a') : o.fill }),
  };
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
    const ri = $('#replImg'); if (ri) ri.onclick = async () => { const [f] = await pickFiles('image/*', false); if (!f) return; pushUndo(); o.href = await shrinkImage(f); if (!o.fit) o.fit = 'cover'; render(); renderSide(); };
    const rb = $('#rmBg'); if (rb) rb.onclick = async () => { pushUndo(); o.href = await removeBackground(o.href); render(); toast('Fond supprimé (couleur des bords)'); };
    on('pMask', 'change', (t) => { o.mask = t.value; if (t.value !== 'none' && !o.fit) o.fit = 'cover'; }, true);
    on('pFit', 'change', (t) => { o.fit = t.value; });
    [['pFB', 'fBright'], ['pFC', 'fContrast'], ['pFS', 'fSat'], ['pFT', 'fTemp'], ['pFBl', 'fBlur']].forEach(([id, k]) => on(id, 'input', (t) => { o[k] = +t.value; t.previousElementSibling.textContent = t.value; }));
    $$('[data-preset]', side).forEach((b) => b.addEventListener('click', edit(() => Object.assign(o, FILTER_PRESETS[b.dataset.preset]), true)));
    // icônes, QR, graphiques, tableaux
    on('pIconC', 'input', (t) => { o.fill = t.value; }); on('pIconW', 'input', (t) => { o.iconW = Math.max(0.25, +t.value); });
    on('pQr', 'input', (t) => { o.data = t.value; }); on('pQrD', 'input', (t) => { o.fill = t.value; }); on('pQrL', 'input', (t) => { o.bgQR = t.value; });
    on('pChK', 'change', (t) => { o.kind = t.value; }); on('pChD', 'input', (t) => { o.data = t.value; }); on('pChM', 'change', (t) => { o.multi = t.checked; });
    on('pChT', 'input', (t) => { o.textColor = t.value; }); on('pChC', 'input', (t) => { o.colors = [t.value, ...(o.colors || []).slice(1)]; });
    const cr = $('#pChReset'); if (cr) cr.onclick = edit(() => { delete o.colors; }, true);
    on('pTbD', 'input', (t) => { o.data = t.value; }); on('pTbH', 'change', (t) => { o.header = t.checked; }); on('pTbZ', 'change', (t) => { o.zebra = t.checked; });
    on('pTbHC', 'input', (t) => { o.headColor = t.value; }); on('pTbTC', 'input', (t) => { o.textColor = t.value; }); on('pTbLC', 'input', (t) => { o.stroke = t.value; }); on('pTbF', 'input', (t) => { o.cellFont = +t.value || 0; });
    // effets de texte
    on('pCurve', 'input', (t) => { o.curve = +t.value; t.previousElementSibling.textContent = t.value; measureText(o); });
    on('pGlow', 'change', (t) => { o.glow = t.checked; });
    on('pBgOn', 'change', (t) => { o.bgColor = t.checked ? $('#pBgC').value : ''; });
    on('pBgC', 'input', (t) => { o.bgColor = t.value; $('#pBgOn').checked = true; });
    on('pOutC', 'input', (t) => { o.stroke = t.value; if (!o.sw) { o.sw = Math.max(1, o.fontSize / 25); $('#pOutW').value = Math.round(o.sw * 10) / 10; } });
    on('pOutW', 'input', (t) => { o.sw = Math.max(0, +t.value); });
    const caseBtn = (id, fn) => { const b = $('#' + id); if (b) b.onclick = edit(() => { o.text = fn(o.text); measureText(o); }, true); };
    caseBtn('pUpper', (t) => t.toLocaleUpperCase('fr-FR')); caseBtn('pLower', (t) => t.toLocaleLowerCase('fr-FR'));
    const bf = $('#pBrandFont'); if (bf) bf.onclick = edit(() => { o.fontFamily = o.fontSize >= 40 ? state.brand.heading : state.brand.body; measureText(o); }, true);
    $$('[data-tstyle]', side).forEach((b) => b.addEventListener('click', edit(() => { TEXT_STYLES[b.dataset.tstyle](o); measureText(o); }, true)));
    // kit de marque
    const saveBrand = () => store('designjoe-brand', state.brand);
    const ba = $('#brandAdd'); if (ba) ba.onclick = () => { const c = $('#brandNew').value; if (!state.brand.colors.includes(c)) state.brand.colors.push(c); saveBrand(); renderSide(); };
    $$('[data-brand-del]', side).forEach((b) => b.addEventListener('click', () => { state.brand.colors.splice(+b.dataset.brandDel, 1); saveBrand(); renderSide(); render(); }));
    const bh = $('#brandHead'); if (bh) bh.onchange = () => { state.brand.heading = bh.value; saveBrand(); };
    const bb = $('#brandBody'); if (bb) bb.onchange = () => { state.brand.body = bb.value; saveBrand(); };
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
  function exportSvgString(pageIdx = state.cur) {
    const { defs, body } = docSvg(true, pageIdx);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${state.w}" height="${state.h}" viewBox="0 0 ${state.w} ${state.h}"><defs>${defs}</defs>${body}</svg>`;
  }
  async function rasterize(scale, bgWhite, pageIdx = state.cur) {
    const svg = exportSvgString(pageIdx);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const im = await loadImage(url);
      const c = document.createElement('canvas'); c.width = Math.round(state.w * scale); c.height = Math.round(state.h * scale);
      const x = c.getContext('2d'); if (bgWhite) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(im, 0, 0, c.width, c.height); return c;
    } finally { URL.revokeObjectURL(url); }
  }
  async function askScale(title, extra = '', pagesChoice = false) {
    const multi = pagesChoice && state.pages.length > 1;
    return modal({
      title, body: `<div class="field"><label for="xs">Résolution</label><select id="xs"><option value="1">1× (${state.w} × ${state.h})</option><option value="2" selected>2× (${state.w * 2} × ${state.h * 2})</option><option value="3">3×</option><option value="0.5">0,5×</option></select></div>
        ${multi ? `<div class="field"><label for="xp">Pages</label><select id="xp"><option value="all">Toutes les pages (${state.pages.length})</option><option value="cur">Page courante seulement (${state.cur + 1})</option></select></div>` : ''}${extra}`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Exporter', primary: true, value: (b) => ({ s: +b.querySelector('#xs').value, all: multi && b.querySelector('#xp').value === 'all' }) }],
    });
  }
  async function exportRaster(type) {
    const r = await askScale(type === 'image/png' ? 'Exporter en PNG' : 'Exporter en JPG', '', true); if (!r) return;
    const ext = type === 'image/png' ? 'png' : 'jpg';
    const idx = r.all ? state.pages.map((_, i) => i) : [state.cur];
    const blobs = [];
    for (const i of idx) { const c = await rasterize(r.s, type === 'image/jpeg', i); blobs.push(await new Promise((res) => c.toBlob(res, type, 0.92))); }
    if (blobs.length === 1) download(blobs[0], `${fname()}${state.pages.length > 1 ? `-p${state.cur + 1}` : ''}.${ext}`);
    else { const zip = new JSZip(); blobs.forEach((b, i) => zip.file(`${fname()}-p${i + 1}.${ext}`, b)); download(await zip.generateAsync({ type: 'blob' }), `${fname()}.zip`); }
    toast(blobs.length > 1 ? `${blobs.length} images exportées` : 'Image exportée');
  }
  async function exportPdf() {
    const r = await askScale('Exporter en PDF', '<p class="hint">Chaque page devient une page du PDF, en haute résolution.</p>', true); if (!r) return;
    const d = await PDFLib.PDFDocument.create();
    const W = state.w * 0.75, H = state.h * 0.75;
    const idx = r.all ? state.pages.map((_, i) => i) : [state.cur];
    for (const i of idx) {
      const c = await rasterize(Math.max(r.s, 2), true, i);
      const img = await d.embedJpg(await (await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95))).arrayBuffer());
      d.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
    }
    d.setTitle(state.name); d.setCreator('Design Joe');
    download(new Blob([await d.save()], { type: 'application/pdf' }), `${fname()}.pdf`); toast(`PDF exporté (${idx.length} page${idx.length > 1 ? 's' : ''})`);
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
      T('qr', { x: 120, y: 1460, w: 200, h: 200, data: 'https://exemple.bf', fill: '#000000', bgQR: '#ffffff', sw: 0 }),
      TXT('Plus d\'infos', 340, 1545, 30, '#3a4152', 400),
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
    { id: 'deck', name: 'Présentation 16:9', sub: '4 diapositives — mode Présenter', w: 1920, h: 1080, build: (w, h) => ({ pages: [
      { bg: '#1b1f2a', objects: [
        T('rect', { x: 0, y: h - 24, w, h: 24, fill: '#d9861c', sw: 0 }),
        TXT('Rapport d\'activité', 140, 360, 120, '#ffffff', 800),
        TXT('Exercice 2026 · Présenté par votre nom', 146, 540, 48, '#f6d58e', 400),
      ] },
      { bg: '#ffffff', objects: [
        TXT('Ordre du jour', 140, 110, 88, '#1b1f2a', 800), T('rect', { x: 140, y: 240, w: 160, h: 12, fill: '#d9861c', sw: 0 }),
        TXT('1. Contexte\n2. Résultats de l\'année\n3. Difficultés rencontrées\n4. Perspectives', 140, 340, 60, '#3a4152', 400, { lineHeight: 1.7 }),
        T('icon', { icon: 'graphique', x: 1300, y: 330, w: 420, h: 420, fill: '#0f766e', iconW: 1.4, sw: 0 }),
      ] },
      { bg: '#ffffff', objects: [
        TXT('Recettes par trimestre', 140, 110, 80, '#1b1f2a', 800),
        T('chart', { kind: 'column', x: 140, y: 280, w: 1000, h: 640, fill: 'none', sw: 0, data: 'T1;12,5\nT2;18,2\nT3;15,9\nT4;24,1' }),
        TXT('Hausse de 93 % entre\nle 1er et le 4e trimestre', 1260, 420, 52, '#3a4152', 400, { lineHeight: 1.4 }),
      ] },
      { bg: '#d9861c', objects: [
        TXT('Merci', w / 2, 380, 180, '#1b1f2a', 900, { align: 'center', cx: w / 2 }),
        TXT('Questions et échanges', w / 2, 620, 56, '#1b1f2a', 400, { align: 'center', cx: w / 2 }),
      ] },
    ] }) },
    { id: 'invite', name: 'Invitation', sub: 'A5 portrait (150 ppp)', w: 874, h: 1240, build: (w, h) => [
      T('rect', { x: 40, y: 40, w: w - 80, h: h - 80, fill: 'none', stroke: '#b8892b', sw: 4, radius: 8 }),
      T('icon', { shape: 'Ruban', x: w / 2 - 260, y: 120, w: 520, h: 110, fill: '#b8892b', sw: 0 }),
      TXT('INVITATION', w / 2, 150, 54, '#ffffff', 800, { align: 'center', cx: w / 2, letterSpacing: 6 }),
      TXT('Vous êtes cordialement invité(e)\nà la cérémonie de', w / 2, 330, 36, '#3a4152', 400, { align: 'center', cx: w / 2, lineHeight: 1.5, italic: true }),
      TXT('Mariage', w / 2, 470, 120, '#b8892b', 400, { align: 'center', cx: w / 2, fontFamily: 'Brush Script MT' }),
      TXT('Samedi 20 décembre 2026 à 10 h\nMairie de Ouagadougou', w / 2, 700, 38, '#1b1f2a', 600, { align: 'center', cx: w / 2, lineHeight: 1.5 }),
      T('icon', { icon: 'coeur', x: w / 2 - 40, y: 900, w: 80, h: 80, fill: '#b8892b', iconW: 1.6, sw: 0 }),
      TXT('Réponse souhaitée avant le 1er décembre', w / 2, 1060, 28, '#6b7386', 400, { align: 'center', cx: w / 2 }),
    ] },
    { id: 'certif', name: 'Attestation / certificat', sub: 'A4 paysage (150 ppp)', w: 1754, h: 1240, build: (w, h) => [
      T('rect', { x: 50, y: 50, w: w - 100, h: h - 100, fill: 'none', stroke: '#1a3d8f', sw: 10 }),
      T('rect', { x: 80, y: 80, w: w - 160, h: h - 160, fill: 'none', stroke: '#b8892b', sw: 3 }),
      TXT('ATTESTATION', w / 2, 170, 110, '#1a3d8f', 900, { align: 'center', cx: w / 2, letterSpacing: 10 }),
      TXT('de participation', w / 2, 320, 44, '#b8892b', 400, { align: 'center', cx: w / 2, italic: true }),
      TXT('Décernée à', w / 2, 450, 38, '#3a4152', 400, { align: 'center', cx: w / 2 }),
      TXT('Prénom NOM', w / 2, 530, 96, '#1b1f2a', 700, { align: 'center', cx: w / 2, fontFamily: 'Georgia' }),
      TXT('pour sa participation à la formation sur la gestion budgétaire\ndes collectivités territoriales, du 6 au 10 octobre 2026.', w / 2, 700, 36, '#3a4152', 400, { align: 'center', cx: w / 2, lineHeight: 1.5 }),
      T('icon', { shape: 'Badge', x: 160, y: 900, w: 200, h: 200, fill: '#b8892b', sw: 0 }),
      T('icon', { icon: 'medaille', x: 205, y: 945, w: 110, h: 110, fill: '#ffffff', iconW: 1.6, sw: 0 }),
      T('line', { pts: [[1150, 1010], [1550, 1010]], stroke: '#1b1f2a', sw: 2, fill: 'none' }),
      TXT('Le Directeur', 1350, 1030, 32, '#3a4152', 600, { align: 'center', cx: 1350 }),
    ] },
    { id: 'cv', name: 'CV', sub: 'A4 portrait (150 ppp)', w: 1240, h: 1754, build: (w, h) => [
      T('rect', { x: 0, y: 0, w: 420, h, fill: '#1a3d8f', sw: 0, name: 'Colonne' }),
      T('image', { href: '', x: 90, y: 90, w: 240, h: 240, mask: 'circle', fit: 'cover', sw: 6, stroke: '#ffffff', fill: 'none' }),
      TXT('CONTACT', 60, 400, 30, '#f2c94c', 800, { letterSpacing: 3 }),
      TXT('+226 00 00 00 00\nvotre.adresse@exemple.bf\nOuagadougou', 60, 450, 24, '#ffffff', 400, { lineHeight: 1.6 }),
      TXT('COMPÉTENCES', 60, 640, 30, '#f2c94c', 800, { letterSpacing: 3 }),
      TXT('Comptabilité publique\nBudget des collectivités\nExcel avancé\nMarchés publics', 60, 690, 24, '#ffffff', 400, { lineHeight: 1.7 }),
      TXT('Prénom NOM', 490, 110, 76, '#1b1f2a', 800),
      TXT('Intitulé du poste', 494, 210, 36, '#1a3d8f', 600),
      TXT('PROFIL', 494, 330, 30, '#1a3d8f', 800, { letterSpacing: 3 }),
      TXT('Quelques lignes pour présenter votre parcours,\nvos points forts et ce que vous recherchez.', 494, 380, 26, '#3a4152', 400, { lineHeight: 1.6 }),
      TXT('EXPÉRIENCE', 494, 540, 30, '#1a3d8f', 800, { letterSpacing: 3 }),
      TXT('2020 – aujourd\'hui · Poste actuel\nEmployeur, ville\n\n2015 – 2020 · Poste précédent\nEmployeur, ville', 494, 590, 26, '#3a4152', 400, { lineHeight: 1.6 }),
      TXT('FORMATION', 494, 920, 30, '#1a3d8f', 800, { letterSpacing: 3 }),
      TXT('Diplôme — Établissement, année', 494, 970, 26, '#3a4152', 400),
    ] },
    { id: 'collage', name: 'Collage photos', sub: '1080 × 1080 — 4 cadres', w: 1080, h: 1080, build: (w, h) => [
      ...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => T('image', { href: '', x: 20 + i * 530, y: 20 + j * 530, w: 510, h: 510, fit: 'cover', mask: 'rounded', sw: 0, fill: 'none' })),
      T('ellipse', { x: 390, y: 390, w: 300, h: 300, fill: '#ffffff', sw: 0, shadow: true }),
      TXT('Nos\nsouvenirs', 540, 470, 56, '#1b1f2a', 800, { align: 'center', cx: 540, lineHeight: 1 }),
    ] },
  ];
  function templatePages(t) {
    const r = t.build(t.w, t.h);
    return Array.isArray(r) ? [{ bg: t.bg || '#ffffff', objects: r }] : r.pages.map((pg) => ({ bg: pg.bg || t.bg || '#ffffff', objects: pg.objects }));
  }
  function applyTemplate(t) {
    pushUndo();
    idSeq = 1;
    const brand = state.brand;
    state = link({ name: t.name, w: t.w, h: t.h, pages: templatePages(t), brand });
    selIds = []; fit(); renderSide(); renderPages();
  }
  function templateThumb(t, n) {
    const saved = state; const savedId = idSeq;
    state = link({ w: t.w, h: t.h, pages: templatePages(t).slice(0, 1), brand: saved.brand });
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
    pushUndo(); state = link({ name: 'sans-titre', w: Math.max(1, res[0]), h: Math.max(1, res[1]), bg: '#ffffff', objects: [], brand: state.brand }); selIds = []; fit(); renderSide(); renderPages();
  }

  /* ---------------- Images : réduction et suppression du fond ---------------- */
  async function shrinkImage(f, maxSide = 2400) {
    const href = await readAsDataURL(f);
    if (/svg/.test(f.type)) return href;
    const im = await loadImage(href);
    if (Math.max(im.naturalWidth, im.naturalHeight) <= maxSide) return href;
    const s = maxSide / Math.max(im.naturalWidth, im.naturalHeight); const c = document.createElement('canvas');
    c.width = im.naturalWidth * s; c.height = im.naturalHeight * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL(/png|webp|gif/.test(f.type) ? 'image/png' : 'image/jpeg', 0.9);
  }
  // efface la zone de couleur unie qui touche les bords (fond de studio, mur, papier)
  async function removeBackground(href, tol = 38) {
    const im = await loadImage(href); const W = im.naturalWidth, H = im.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    const img = x.getImageData(0, 0, W, H), d = img.data, ref = [0, 0, 0];
    [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].forEach(([a, b]) => { const i = (b * W + a) * 4; for (let k = 0; k < 3; k++) ref[k] += d[i + k] / 4; });
    const dist = (i) => Math.max(Math.abs(d[i] - ref[0]), Math.abs(d[i + 1] - ref[1]), Math.abs(d[i + 2] - ref[2]));
    const mask = new Uint8Array(W * H), q = [];
    const push = (a, b) => { const k = b * W + a; if (!mask[k] && dist(k * 4) <= tol) { mask[k] = 1; q.push(k); } };
    for (let a = 0; a < W; a++) { push(a, 0); push(a, H - 1); }
    for (let b = 0; b < H; b++) { push(0, b); push(W - 1, b); }
    while (q.length) { const k = q.pop(), a = k % W, b = (k / W) | 0; if (a) push(a - 1, b); if (a < W - 1) push(a + 1, b); if (b) push(a, b - 1); if (b < H - 1) push(a, b + 1); }
    for (let k = 0; k < W * H; k++) {
      if (mask[k]) { d[k * 4 + 3] = 0; continue; }
      const a = k % W, b = (k / W) | 0;
      if ((a && mask[k - 1]) || (a < W - 1 && mask[k + 1]) || (b && mask[k - W]) || (b < H - 1 && mask[k + W])) d[k * 4 + 3] = Math.min(d[k * 4 + 3], clamp((dist(k * 4) - tol) / tol * 255 + 128, 0, 255));
    }
    x.putImageData(img, 0, 0); return c.toDataURL('image/png');
  }

  /* ---------------- Bibliothèque d'éléments ---------------- */
  function placeCentered(o, wFrac = 0.3) {
    const r = o.h / o.w || 1; o.w = state.w * wFrac; o.h = o.w * r;
    if (o.h > state.h * 0.8) { o.h = state.h * 0.6; o.w = o.h / r; }
    o.x = (state.w - o.w) / 2; o.y = (state.h - o.h) / 2; return o;
  }
  function textPreset(kind) {
    const H = state.brand.heading, B = state.brand.body, base = Math.min(state.w, state.h);
    const p = {
      'Titre': { text: 'Ajouter un titre', fontSize: base / 9, fontWeight: 800, fontFamily: H },
      'Sous-titre': { text: 'Ajouter un sous-titre', fontSize: base / 16, fontWeight: 600, fontFamily: H },
      'Texte': { text: 'Ajouter un paragraphe de texte', fontSize: base / 28, fontWeight: 400, fontFamily: B },
      'Citation': { text: '« Une citation qui inspire »', fontSize: base / 18, fontWeight: 400, italic: true, fontFamily: 'Georgia' },
      'Texte courbé': { text: 'TEXTE EN ARC', fontSize: base / 14, fontWeight: 800, fontFamily: H, curve: 45, letterSpacing: 4 },
      'Néon': { text: 'Néon', fontSize: base / 7, fontWeight: 700, fontFamily: H, glow: true, fill: '#ff4fd8' },
      'Étiquette': { text: 'PROMO −20 %', fontSize: base / 14, fontWeight: 800, fontFamily: H, bgColor: state.brand.colors[1] || '#f2c94c' },
      'Contour': { text: 'CONTOUR', fontSize: base / 8, fontWeight: 900, fontFamily: 'Arial Black', fill: 'none', stroke: '#1b1f2a', sw: base / 300 },
    }[kind];
    const o = newText(0, 0, p.text); Object.assign(o, { fill: '#1b1f2a' }, p); measureText(o);
    o.x = (state.w - o.w) / 2; o.y = (state.h - o.h) / 2; return o;
  }
  const FRAME_LAYOUTS = {
    'Grille 2': [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]], 'Grille 3': [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    'Grille 4': [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]], 'Bandeau 3': [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]],
  };
  function addLayout(name) {
    const gap = Math.min(state.w, state.h) * 0.015;
    const objs = FRAME_LAYOUTS[name].map(([fx, fy, fw, fh]) => baseObj('image', { href: '', x: fx * state.w + gap, y: fy * state.h + gap, w: fw * state.w - 2 * gap, h: fh * state.h - 2 * gap, fit: 'cover', mask: 'none', sw: 0, fill: 'none' }));
    pushUndo(); state.objects.push(...objs); selIds = objs.map((o) => o.id); render(); renderSide();
    toast('Glissez vos photos sur les cadres, ou sélectionnez un cadre puis « Choisir la photo »');
  }
  async function libraryDialog() {
    const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '14px';
    const ico = (d, fill) => `<svg viewBox="0 0 24 24" width="34" height="34" style="overflow:visible"><path d="${d}" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'}/></svg>`;
    const sect = (title, items) => `<div class="field"><label>${title}</label><div class="row" style="gap:6px">${items}</div></div>`;
    const it = (key, inner, title) => `<button data-lib="${key}" title="${title}" aria-label="${title}" style="min-width:52px;height:52px;justify-content:center">${inner}</button>`;
    body.innerHTML = [
      sect('Textes', Object.keys({ 'Titre': 1, 'Sous-titre': 1, 'Texte': 1, 'Citation': 1, 'Texte courbé': 1, 'Néon': 1, 'Étiquette': 1, 'Contour': 1 }).map((k) => it(`text:${k}`, k, k)).join('')),
      sect('Formes', [['rect', '<svg viewBox="0 0 24 24" width="34" height="34"><rect x="3" y="5" width="18" height="14" fill="currentColor"/></svg>', 'Rectangle'], ['ellipse', '<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>', 'Cercle'], ['line', '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 12h18" stroke="currentColor" stroke-width="2"/></svg>', 'Ligne']].map(([k, s, t]) => it(`basic:${k}`, s, t)).join('') + Object.entries(SHAPES).map(([k, d]) => it(`shape:${k}`, ico(d, true), k)).join('')),
      sect('Icônes', Object.entries(ICONS).map(([k, d]) => it(`icon:${k}`, ico(d), k)).join('')),
      sect('Autocollants', EMOJIS.map((e) => it(`emoji:${e}`, `<span style="font-size:26px">${e}</span>`, e)).join('')),
      sect('Cadres photo', Object.entries(MASKS).filter(([k]) => k !== 'none').map(([k, l]) => it(`frame:${k}`, l, `Cadre ${l}`)).join('') + Object.keys(FRAME_LAYOUTS).map((k) => it(`layout:${k}`, k, k)).join('')),
      sect('Données', [['chart:column', 'Colonnes'], ['chart:bar', 'Barres'], ['chart:line', 'Courbe'], ['chart:pie', 'Secteurs'], ['chart:donut', 'Anneau'], ['table', 'Tableau'], ['qr', 'QR code']].map(([k, l]) => it(k, l, l)).join('')),
    ].join('');
    let pick = null, closeBtn;
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-lib]'); if (b) { pick = b.dataset.lib; closeBtn.click(); } });
    await modal({ title: 'Éléments', wide: true, body, buttons: [{ label: 'Fermer', value: null }], onOpen: (b) => { closeBtn = b.closest('.modal').querySelector('header button'); } });
    if (pick) addLibraryItem(pick);
  }
  function addLibraryItem(key) {
    const [kind, arg] = key.split(/:(.*)/s);
    const col = state.brand.colors.find((c) => !['#ffffff', '#fff'].includes(c.toLowerCase())) || '#d9861c';
    let o;
    if (kind === 'text') o = textPreset(arg);
    else if (kind === 'basic') {
      if (arg === 'line') o = baseObj('line', { pts: [[state.w * 0.3, state.h / 2], [state.w * 0.7, state.h / 2]], fill: 'none', stroke: '#1b1f2a', sw: Math.max(2, state.w / 300) });
      else o = placeCentered(baseObj(arg, { x: 0, y: 0, w: 100, h: arg === 'rect' ? 70 : 100, fill: col, sw: 0, radius: 0 }), 0.3);
    }
    else if (kind === 'shape') o = placeCentered(baseObj('icon', { shape: arg, x: 0, y: 0, w: 100, h: 100, fill: col, sw: 0 }), 0.3);
    else if (kind === 'icon') o = placeCentered(baseObj('icon', { icon: arg, x: 0, y: 0, w: 100, h: 100, fill: '#1b1f2a', iconW: 2, sw: 0 }), 0.15);
    else if (kind === 'emoji') { o = newText(0, 0, arg); o.fontSize = Math.min(state.w, state.h) / 6; o.fontFamily = 'Segoe UI Emoji'; o.fontWeight = 400; measureText(o); o.x = (state.w - o.w) / 2; o.y = (state.h - o.h) / 2; }
    else if (kind === 'frame') o = placeCentered(baseObj('image', { href: '', x: 0, y: 0, w: 100, h: 100, mask: arg, fit: 'cover', sw: 0, fill: 'none' }), 0.4);
    else if (kind === 'layout') return addLayout(arg);
    else if (kind === 'chart') o = placeCentered(baseObj('chart', { kind: arg, x: 0, y: 0, w: 160, h: 110, sw: 0, fill: 'none', data: 'Janvier;120\nFévrier;180\nMars;150\nAvril;240', multi: arg === 'pie' || arg === 'donut' }), 0.6);
    else if (kind === 'table') o = placeCentered(baseObj('table', { x: 0, y: 0, w: 160, h: 80, sw: 0, fill: '#ffffff', stroke: '#c9ced8', data: 'Désignation;Quantité;Montant\nArticle A;2;15 000\nArticle B;1;8 500\nTotal;3;23 500', zebra: true }), 0.7);
    else if (kind === 'qr') o = placeCentered(baseObj('qr', { x: 0, y: 0, w: 100, h: 100, fill: '#000000', bgQR: '#ffffff', sw: 0, data: 'https://exemple.bf' }), 0.25);
    if (!o) return;
    pushUndo(); addObject(o);
    if (o.type === 'text') focusText(o);
  }

  /* ---------------- Pages ---------------- */
  let pagesTimer = 0;
  function schedulePages() { clearTimeout(pagesTimer); pagesTimer = setTimeout(renderPages, 400); }
  function renderPages() {
    const bar = $('#pagebar'); if (!bar) return;
    const thumbW = 96, th = Math.round(thumbW * state.h / state.w);
    bar.innerHTML = state.pages.map((pg, i) => {
      const { defs, body } = docSvg(true, i);
      const pre = (s) => s.replace(/id="([a-z]+\d+)"/g, `id="pg${i}$1"`).replace(/url\(#([a-z]+\d+)\)/g, `url(#pg${i}$1)`).replace(/href="#([a-z]+\d+)"/g, `href="#pg${i}$1"`);
      return `<button class="pthumb${i === state.cur ? ' active' : ''}" data-page="${i}" title="Page ${i + 1}" aria-label="Page ${i + 1}"><svg viewBox="0 0 ${state.w} ${state.h}" width="${thumbW}" height="${Math.min(th, 120)}" preserveAspectRatio="xMidYMid meet"><defs>${pre(defs)}</defs>${pre(body)}</svg><span>${i + 1}</span></button>`;
    }).join('') + `<div class="pactions"><button data-act="addPage" title="Ajouter une page">+ Page</button><button data-act="dupPage" title="Dupliquer la page">Dupliquer</button>
      <button data-act="pageLeft" title="Déplacer la page avant" aria-label="Déplacer la page avant">◀</button><button data-act="pageRight" title="Déplacer la page après" aria-label="Déplacer la page après">▶</button>
      <button data-act="delPage" class="danger" title="Supprimer la page">Suppr.</button></div>`;
    bar.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => gotoPage(+b.dataset.page)));
    bar.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  }
  function gotoPage(i) { state.cur = clamp(i, 0, state.pages.length - 1); selIds = []; nodeEdit = null; render(); renderSide(); renderPages(); }
  function pageAction(a) {
    const i = state.cur;
    pushUndo();
    if (a === 'addPage') { state.pages.splice(i + 1, 0, { bg: '#ffffff', objects: [] }); gotoPage(i + 1); }
    else if (a === 'dupPage') { const copy = JSON.parse(JSON.stringify(state.pages[i])); const reid = (x) => { x.id = uid(); if (x.children) x.children.forEach(reid); }; copy.objects.forEach(reid); state.pages.splice(i + 1, 0, copy); gotoPage(i + 1); }
    else if (a === 'delPage') { if (state.pages.length < 2) { undoStack.pop(); updateHist(); return toast('Un document garde au moins une page.'); } state.pages.splice(i, 1); gotoPage(Math.min(i, state.pages.length - 1)); }
    else if (a === 'pageLeft' && i > 0) { [state.pages[i - 1], state.pages[i]] = [state.pages[i], state.pages[i - 1]]; gotoPage(i - 1); }
    else if (a === 'pageRight' && i < state.pages.length - 1) { [state.pages[i + 1], state.pages[i]] = [state.pages[i], state.pages[i + 1]]; gotoPage(i + 1); }
    else { undoStack.pop(); updateHist(); }
  }

  /* ---------------- Mode présentation ---------------- */
  function present() {
    let i = state.cur;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:300;background:#000;display:grid;place-items:center;cursor:none';
    const show = () => {
      const { defs, body } = docSvg(true, i);
      ov.innerHTML = `<svg viewBox="0 0 ${state.w} ${state.h}" style="width:100vw;height:100vh" preserveAspectRatio="xMidYMid meet"><defs>${defs}</defs>${body}</svg>
        <div style="position:fixed;bottom:12px;right:16px;color:#fff;opacity:.6;font:13px system-ui">${i + 1} / ${state.pages.length} · Échap pour quitter</div>`;
    };
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
    const key = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
      else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) { i = Math.min(state.pages.length - 1, i + 1); show(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { i = Math.max(0, i - 1); show(); }
      e.preventDefault();
    };
    ov.addEventListener('click', (e) => { if (e.clientX < innerWidth / 3) i = Math.max(0, i - 1); else if (i === state.pages.length - 1) return close(); else i++; show(); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(ov); show();
    if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
  }

  /* ---------------- Redimensionnement magique ---------------- */
  const FORMATS = [
    ['Publication carrée', 1080, 1080], ['Instagram portrait 4:5', 1080, 1350], ['Story / statut', 1080, 1920], ['Facebook couverture', 1640, 624],
    ['Présentation 16:9', 1920, 1080], ['Affiche A4 portrait', 1240, 1754], ['A4 paysage', 1754, 1240], ['Carte de visite', 1004, 650],
    ['Flyer A5', 874, 1240], ['Miniature YouTube', 1280, 720], ['Bannière web', 1200, 628],
  ];
  async function magicResizeDialog() {
    const res = await modal({
      title: 'Redimensionner le design',
      body: `<div class="field"><label for="mrF">Nouveau format</label><select id="mrF">${FORMATS.map(([l, w, h], i) => `<option value="${i}">${l} — ${w} × ${h}</option>`).join('')}<option value="c">Personnalisé</option></select></div>
        <div class="grid2"><div class="field"><label for="mrW">Largeur</label><input type="number" id="mrW" value="${FORMATS[0][1]}"></div><div class="field"><label for="mrH">Hauteur</label><input type="number" id="mrH" value="${FORMATS[0][2]}"></div></div>
        <label class="row"><input type="checkbox" id="mrCopy" checked> Garder l'original : télécharger d'abord une copie du projet actuel</label>
        <p class="hint">Toutes les pages sont adaptées : les fonds pleine page s'étirent, les autres éléments sont mis à l'échelle et recentrés. Ajustez ensuite si besoin.</p>`,
      onOpen: (b) => { const f = b.querySelector('#mrF'); f.onchange = () => { if (f.value !== 'c') { b.querySelector('#mrW').value = FORMATS[f.value][1]; b.querySelector('#mrH').value = FORMATS[f.value][2]; } }; },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Redimensionner', primary: true, value: (b) => ({ w: +b.querySelector('#mrW').value, h: +b.querySelector('#mrH').value, copy: b.querySelector('#mrCopy').checked, name: b.querySelector('#mrF').selectedOptions[0].text.split(' — ')[0] }) }],
    });
    if (!res || res.w < 1 || res.h < 1) return;
    if (res.copy) act('saveProject');
    pushUndo();
    const W = state.w, H = state.h, s = Math.min(res.w / W, res.h / H), ox = (res.w - W * s) / 2, oy = (res.h - H * s) / 2;
    const cur = state.cur;
    state.pages.forEach((pg, i) => {
      state.cur = i;
      pg.objects.forEach((o) => {
        const b = getBox(o);
        const full = b.x <= 2 && b.y <= 2 && b.w >= W - 4 && b.h >= H - 4;
        if (full && !o.rot) setBox(o, { x: b.x * res.w / W, y: b.y * res.h / H, w: b.w * res.w / W, h: b.h * res.h / H });
        else setBox(o, { x: ox + b.x * s, y: oy + b.y * s, w: b.w * s, h: b.h * s });
      });
    });
    state.cur = cur; state.w = res.w; state.h = res.h; state.name = `${state.name} — ${res.name}`;
    selIds = []; fit(); renderSide(); renderPages(); toast(`Design adapté en ${res.w} × ${res.h}`);
  }

  /* ---------------- Déposer une photo sur un cadre ---------------- */
  board.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault(); });
  board.addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const g = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]');
    const o = g && byId(+g.dataset.id);
    if (o && o.type === 'image') {
      e.preventDefault(); e.stopPropagation();
      pushUndo(); o.href = await shrinkImage(files[0]); if (!o.fit) o.fit = 'cover';
      selIds = [o.id]; render(); renderSide(); toast('Photo placée dans le cadre');
    }
  });

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
        case 'library': return libraryDialog();
        case 'present': return present();
        case 'magicResize': return magicResizeDialog();
        case 'addPage': case 'dupPage': case 'delPage': case 'pageLeft': case 'pageRight': return pageAction(a);
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
          pushUndo(); delete data.app; delete data.v; state = link(data); idSeq = maxId(); selIds = []; fit(); renderSide(); renderPages(); return;
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
    if (k === 'k') { libraryDialog(); return; }
    if (e.key === 'F5') { e.preventDefault(); present(); return; }
    const t = TOOLS.find((x) => x[2] === k); if (t) setTool(t[0]);
  });
  document.addEventListener('paste', async (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); await addImageFromFile(item.getAsFile()); }
  });
  onDropFiles($('#stage'), async (files) => {
    for (const f of files) {
      if (/\.joedesign$/i.test(f.name)) { const data = JSON.parse(await f.text()); pushUndo(); delete data.app; delete data.v; state = link(data); idSeq = maxId(); fit(); renderSide(); renderPages(); }
      else if (f.type.startsWith('image/')) await addImageFromFile(f);
    }
  });
  window.addEventListener('resize', () => render());

  buildRail(); initMenus();
  applyTemplate(TEMPLATES[0]); undoStack.length = 0; updateHist(); renderPages();
  setTool('select');
  requestAnimationFrame(fit);

  window.DesignJoe = { get state() { return state; }, act, addLibraryItem, gotoPage, setTool, exportSvgString, rasterize, TEMPLATES, applyTemplate, get selIds() { return selIds; } };
})();
