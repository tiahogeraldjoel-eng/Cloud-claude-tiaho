/* Photo Joe — éditeur d'images à calques (pinceaux, sélection, tampon, retouches, filtres, export). */
(function () {
  const { $, $$, toast, download, pickFiles, baseName, initMenus, modal, store, onDropFiles, loadImage, readAsDataURL, clamp } = Studio;

  /* ---------------- État ---------------- */
  let doc = null;           // {w, h, name, layers:[], active}
  let sel = null;           // sélection rectangulaire {x,y,w,h} en coordonnées document
  let zoom = 1;
  let tool = 'brush';
  const undoStack = [], redoStack = [];
  const opts = Object.assign({
    size: 24, hardness: 80, opacity: 100, tolerance: 32, contiguous: true, shapeMode: 'fill', strokeW: 6,
    gradType: 'linear', gradToTransparent: false, cropRatio: 'free', font: 'Segoe UI', textSize: 64,
  }, store('photojoe-opts') || {});
  let layerSeq = 1;

  const view = $('#view'), vctx = view.getContext('2d');
  const ui = $('#ui'), uctx = ui.getContext('2d');

  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });
  function copyCanvas(c) { const n = mkCanvas(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; }
  function newLayer(name, w = doc.w, h = doc.h, x = 0, y = 0) {
    return { id: layerSeq++, name: name || `Calque ${layerSeq - 1}`, canvas: mkCanvas(w, h), x, y, opacity: 1, blend: 'source-over', visible: true };
  }
  const active = () => doc.layers[doc.active];

  /* ---------------- Historique ---------------- */
  function snapshot() {
    return { w: doc.w, h: doc.h, active: doc.active, sel: sel && { ...sel }, layers: doc.layers.map((l) => ({ ...l, canvas: copyCanvas(l.canvas) })) };
  }
  function restore(s) { doc.w = s.w; doc.h = s.h; doc.active = s.active; sel = s.sel; doc.layers = s.layers.map((l) => ({ ...l, canvas: copyCanvas(l.canvas) })); sizeView(); refreshAll(); }
  function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 30) undoStack.shift(); redoStack.length = 0; updateHistBtns(); }
  function undo() { cancelAdjust(); if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); updateHistBtns(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); updateHistBtns(); }
  function updateHistBtns() { $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length; }

  /* ---------------- Document ---------------- */
  function createDoc(w, h, name = 'sans-titre', fill = '#ffffff') {
    doc = { w, h, name, layers: [], active: 0 };
    layerSeq = 1;
    const bg = newLayer('Arrière-plan');
    if (fill) { const c = bg.canvas.getContext('2d'); c.fillStyle = fill; c.fillRect(0, 0, w, h); }
    doc.layers.push(bg);
    sel = null; undoStack.length = redoStack.length = 0; updateHistBtns();
    sizeView(); fit(); refreshAll();
  }
  async function openImageFile(file) {
    const img = await loadImage(await readAsDataURL(file));
    createDoc(img.naturalWidth, img.naturalHeight, baseName(file.name), null);
    active().canvas.getContext('2d').drawImage(img, 0, 0);
    refreshAll(); toast(`${file.name} — ${img.naturalWidth} × ${img.naturalHeight} px`);
  }
  async function importLayer(file) {
    const img = await loadImage(await readAsDataURL(file));
    pushUndo();
    let w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(1, doc.w / w, doc.h / h); w *= s; h *= s;
    const L = newLayer(baseName(file.name), w, h, (doc.w - w) / 2, (doc.h - h) / 2);
    L.canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    doc.layers.splice(doc.active + 1, 0, L); doc.active++;
    refreshAll(); setTool('move');
  }

  /* ---------------- Rendu ---------------- */
  function sizeView() {
    view.width = doc.w; view.height = doc.h;
    applyZoom();
  }
  function applyZoom() {
    const W = doc.w * zoom, H = doc.h * zoom;
    view.style.width = W + 'px'; view.style.height = H + 'px';
    const dpr = window.devicePixelRatio || 1;
    ui.width = Math.round(W * dpr); ui.height = Math.round(H * dpr); ui.style.width = W + 'px'; ui.style.height = H + 'px';
    view.style.imageRendering = zoom >= 3 ? 'pixelated' : 'auto';
    $('#zoomLbl').textContent = Math.round(zoom * 100) + ' %';
    drawUI();
  }
  function fit() {
    const st = $('#stage');
    const aw = Math.max(100, st.clientWidth - 80), ah = Math.max(100, st.clientHeight - 80);
    zoom = Math.min(1, aw / doc.w, ah / doc.h);
    applyZoom();
  }
  let override = null; // {layer, canvas} : rendu provisoire d'un calque pendant un tracé
  function composite(ctx, w = doc.w, h = doc.h) {
    ctx.clearRect(0, 0, w, h);
    for (const L of doc.layers) {
      if (!L.visible) continue;
      ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = L.blend;
      ctx.drawImage(override && override.layer === L ? override.canvas : L.canvas, L.x, L.y);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  let raf = 0;
  function redraw() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; composite(vctx); drawUI(); }); }
  function flatCanvas() { const c = mkCanvas(doc.w, doc.h); composite(c.getContext('2d')); return c; }

  let uiShape = null; // forme provisoire (sélection, recadrage, dégradé, forme)
  let antsOffset = 0;
  function drawUI() {
    const dpr = window.devicePixelRatio || 1, s = zoom * dpr;
    uctx.setTransform(1, 0, 0, 1, 0, 0); uctx.clearRect(0, 0, ui.width, ui.height);
    uctx.setTransform(s, 0, 0, s, 0, 0);
    const dash = (r) => {
      uctx.lineWidth = 1 / zoom;
      uctx.strokeStyle = '#000'; uctx.setLineDash([5 / zoom, 5 / zoom]); uctx.lineDashOffset = -antsOffset / zoom; uctx.strokeRect(r.x, r.y, r.w, r.h);
      uctx.strokeStyle = '#fff'; uctx.lineDashOffset = (-antsOffset + 5) / zoom; uctx.strokeRect(r.x, r.y, r.w, r.h); uctx.setLineDash([]);
    };
    if (sel) dash(sel);
    if (uiShape && uiShape.kind === 'crop') {
      const r = uiShape.r;
      uctx.fillStyle = 'rgba(0,0,0,.5)';
      uctx.fillRect(0, 0, doc.w, r.y); uctx.fillRect(0, r.y + r.h, doc.w, doc.h - r.y - r.h);
      uctx.fillRect(0, r.y, r.x, r.h); uctx.fillRect(r.x + r.w, r.y, doc.w - r.x - r.w, r.h);
      uctx.strokeStyle = '#fff'; uctx.lineWidth = 1 / zoom; uctx.strokeRect(r.x, r.y, r.w, r.h);
      uctx.globalAlpha = .5; uctx.beginPath();
      for (let i = 1; i < 3; i++) { uctx.moveTo(r.x + r.w * i / 3, r.y); uctx.lineTo(r.x + r.w * i / 3, r.y + r.h); uctx.moveTo(r.x, r.y + r.h * i / 3); uctx.lineTo(r.x + r.w, r.y + r.h * i / 3); }
      uctx.stroke(); uctx.globalAlpha = 1;
    }
    if (uiShape && uiShape.kind === 'sel') dash(uiShape.r);
    if (uiShape && uiShape.kind === 'grad') {
      uctx.strokeStyle = '#fff'; uctx.lineWidth = 2 / zoom; uctx.beginPath(); uctx.moveTo(uiShape.x1, uiShape.y1); uctx.lineTo(uiShape.x2, uiShape.y2); uctx.stroke();
      uctx.strokeStyle = '#000'; uctx.lineWidth = 1 / zoom; uctx.stroke();
    }
    if (tool === 'clone' && cloneSrc) {
      uctx.strokeStyle = '#fff'; uctx.lineWidth = 1.5 / zoom; uctx.beginPath(); const r = 8 / zoom;
      uctx.moveTo(cloneSrc.x - r, cloneSrc.y); uctx.lineTo(cloneSrc.x + r, cloneSrc.y); uctx.moveTo(cloneSrc.x, cloneSrc.y - r); uctx.lineTo(cloneSrc.x, cloneSrc.y + r); uctx.stroke();
    }
    if (cursorPos && ['brush', 'eraser', 'clone', 'blurBrush'].includes(tool)) {
      uctx.strokeStyle = 'rgba(255,255,255,.9)'; uctx.lineWidth = 1 / zoom;
      uctx.beginPath(); uctx.arc(cursorPos.x, cursorPos.y, opts.size / 2, 0, Math.PI * 2); uctx.stroke();
      uctx.strokeStyle = 'rgba(0,0,0,.6)'; uctx.beginPath(); uctx.arc(cursorPos.x, cursorPos.y, opts.size / 2 + 1 / zoom, 0, Math.PI * 2); uctx.stroke();
    }
    if (tool === 'move' && doc) {
      const L = active(); uctx.strokeStyle = 'rgba(217,134,28,.9)'; uctx.lineWidth = 1 / zoom; uctx.setLineDash([4 / zoom, 3 / zoom]);
      uctx.strokeRect(L.x, L.y, L.canvas.width, L.canvas.height); uctx.setLineDash([]);
    }
  }
  setInterval(() => { if (sel || (uiShape && uiShape.kind === 'sel')) { antsOffset = (antsOffset + 1) % 10; drawUI(); } }, 120);

  function refreshAll() { composite(vctx); drawUI(); renderLayers(); updateStatus(); scheduleHist(); }
  function updateStatus() { $('#status').textContent = `${doc.w} × ${doc.h} px${sel ? ` · sél. ${Math.round(sel.w)} × ${Math.round(sel.h)}` : ''}`; }

  /* ---------------- Calques (panneau) ---------------- */
  function renderLayers() {
    const box = $('#layers'); box.innerHTML = '';
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const L = doc.layers[i];
      const row = document.createElement('div'); row.className = 'layer' + (i === doc.active ? ' active' : '');
      const eye = document.createElement('button'); eye.className = 'eye' + (L.visible ? '' : ' off'); eye.textContent = '👁'; eye.title = L.visible ? 'Masquer' : 'Afficher';
      eye.setAttribute('aria-label', eye.title);
      eye.onclick = (e) => { e.stopPropagation(); L.visible = !L.visible; refreshAll(); };
      const th = mkCanvas(88, 64); const tc = th.getContext('2d');
      const s = Math.min(88 / doc.w, 64 / doc.h); tc.translate((88 - doc.w * s) / 2, (64 - doc.h * s) / 2); tc.scale(s, s);
      tc.fillStyle = '#ddd'; tc.fillRect(0, 0, doc.w, doc.h); tc.drawImage(L.canvas, L.x, L.y);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = L.name; nm.title = 'Double-clic pour renommer';
      row.append(eye, th, nm);
      row.onclick = () => { doc.active = i; cancelAdjust(); renderLayers(); drawUI(); };
      nm.ondblclick = async () => {
        const v = await modal({ title: 'Renommer le calque', body: `<input type="text" id="ln" value="${L.name.replace(/"/g, '&quot;')}" aria-label="Nom">`, buttons: [{ label: 'Annuler', value: null }, { label: 'Renommer', primary: true, value: (b) => b.querySelector('#ln').value }] });
        if (v) { L.name = v; renderLayers(); }
      };
      box.appendChild(row);
    }
    const L = active();
    $('#lOpacity').value = Math.round(L.opacity * 100); $('#lOpacityO').textContent = Math.round(L.opacity * 100) + ' %';
    $('#lBlend').value = L.blend;
  }
  let opacityUndoArmed = false;
  $('#lOpacity').addEventListener('input', (e) => {
    if (!opacityUndoArmed) { pushUndo(); opacityUndoArmed = true; }
    active().opacity = e.target.value / 100; $('#lOpacityO').textContent = e.target.value + ' %'; redraw();
  });
  $('#lOpacity').addEventListener('change', () => { opacityUndoArmed = false; renderLayers(); });
  $('#lBlend').addEventListener('change', (e) => { pushUndo(); active().blend = e.target.value; refreshAll(); });

  /* ---------------- Outils ---------------- */
  const TOOLS = [
    ['move', 'Déplacer le calque (V)', 'v', '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'],
    ['marquee', 'Sélection rectangulaire (M)', 'm', '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/>'],
    ['crop', 'Recadrage (C)', 'c', '<path d="M6 2v16h16M2 6h16v16"/>'],
    ['sep'],
    ['brush', 'Pinceau (B)', 'b', '<path d="M18 3 9 12l3 3 9-9zM9 12c-3 0-4 2-4 4s-1 3-3 4c4 1 9 0 10-5"/>'],
    ['eraser', 'Gomme (E)', 'e', '<path d="M7 20h11M4 15l9-11 7 7-9 9H8z"/>'],
    ['clone', 'Tampon de duplication (S) — Alt+clic pour la source', 's', '<path d="M8 13h8l1 4H7zM10 13V9a2 2 0 1 1 4 0v4M5 21h14"/>'],
    ['blurBrush', 'Flou localisé (R)', 'r', '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>'],
    ['bucket', 'Pot de peinture (G)', 'g', '<path d="m5 11 7-7 8 8-7 7zM5 11l-1 4M20 15c0 2 1 3 1 4a1 1 0 0 1-2 0c0-1 1-2 1-4z"/>'],
    ['magicEraser', 'Gomme magique — efface une zone de couleur (W)', 'w', '<path d="M4 20 15 9M15 9l2-2M18 3v3M21 6h-3M20 10l-1-1M12 4l1 1"/>'],
    ['gradient', 'Dégradé (D)', 'd', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14" opacity=".5"/>'],
    ['sep'],
    ['text', 'Texte (T)', 't', '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'],
    ['shape', 'Formes (U)', 'u', '<rect x="3" y="10" width="10" height="10"/><circle cx="16" cy="8" r="5"/>'],
    ['eyedropper', 'Pipette (I)', 'i', '<path d="m19 5-2-2-4 4-1-1-2 2 1 1-7 7v3h3l7-7 1 1 2-2-1-1z"/>'],
    ['hand', 'Main — se déplacer (H)', 'h', '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5a1.5 1.5 0 0 1 3 0v8M17 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-4l-2-4a1.5 1.5 0 0 1 3-1l1 2"/>'],
  ];
  function buildRail() {
    const rail = $('#rail');
    TOOLS.forEach(([id, title, , svg]) => {
      if (id === 'sep') { rail.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
      const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = id; b.title = title; b.setAttribute('aria-label', title);
      b.innerHTML = `<svg viewBox="0 0 24 24">${svg}</svg>`; b.onclick = () => setTool(id); rail.appendChild(b);
    });
    rail.insertAdjacentHTML('beforeend', `<div class="sep"></div><div class="colors" title="Premier plan / arrière-plan (X pour inverser)">
      <input type="color" id="fg" value="${store('photojoe-fg') || '#1b1f2a'}" aria-label="Couleur de premier plan">
      <input type="color" id="bg" value="#ffffff" aria-label="Couleur d'arrière-plan"></div>
      <button class="tool" id="swapBtn" title="Inverser les couleurs (X)" style="font-size:14px">⇄</button>`);
    $('#swapBtn').onclick = swapColors;
    $('#fg').addEventListener('input', () => store('photojoe-fg', $('#fg').value));
  }
  function swapColors() { const a = $('#fg').value; $('#fg').value = $('#bg').value; $('#bg').value = a; }

  function setTool(t) {
    if (uiShape && uiShape.kind === 'crop' && t !== 'crop') uiShape = null;
    tool = t;
    $$('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    view.style.cursor = { hand: 'grab', move: 'move', eyedropper: 'crosshair', text: 'text' }[t] || (['brush', 'eraser', 'clone', 'blurBrush'].includes(t) ? 'none' : 'crosshair');
    renderOptbar(); drawUI();
  }

  function optSlider(key, label, min, max, unit = '') {
    return `<label>${label} <input type="range" data-opt="${key}" min="${min}" max="${max}" value="${opts[key]}"> <span class="badge" data-optv="${key}">${opts[key]}${unit}</span></label>`;
  }
  function renderOptbar() {
    const names = Object.fromEntries(TOOLS.filter((t) => t[1]).map((t) => [t[0], t[1].replace(/ \(.*$| —.*$/, '')]));
    let h = `<span class="tname">${names[tool] || ''}</span>`;
    if (['brush', 'eraser', 'clone', 'blurBrush'].includes(tool)) h += optSlider('size', 'Taille', 1, 400, ' px') + optSlider('hardness', 'Dureté', 0, 100, ' %') + optSlider('opacity', 'Opacité', 1, 100, ' %');
    if (tool === 'clone') h += `<span class="hint">${cloneSrc ? 'Source définie.' : 'Alt+clic (ou bouton) pour définir la source.'}</span><button id="cloneSet">Définir la source au prochain clic</button>`;
    if (tool === 'bucket' || tool === 'magicEraser') h += optSlider('tolerance', 'Tolérance', 0, 255) + `<label><input type="checkbox" data-opt="contiguous" ${opts.contiguous ? 'checked' : ''}> Pixels contigus</label>` + (tool === 'bucket' ? optSlider('opacity', 'Opacité', 1, 100, ' %') : '');
    if (tool === 'magicEraser') h += '<button data-act="removeBg">Supprimer l\'arrière-plan auto</button>';
    if (tool === 'shape') h += `<label>Forme <select data-opt="shapeKind"><option value="rect">Rectangle</option><option value="round">Rect. arrondi</option><option value="ellipse">Ellipse</option><option value="line">Ligne</option><option value="arrow">Flèche</option></select></label>
      <label>Style <select data-opt="shapeMode"><option value="fill">Plein</option><option value="stroke">Contour</option><option value="both">Plein + contour (arrière-plan)</option></select></label>` + optSlider('strokeW', 'Épaisseur', 1, 80, ' px');
    if (tool === 'gradient') h += `<label>Type <select data-opt="gradType"><option value="linear">Linéaire</option><option value="radial">Radial</option></select></label><label><input type="checkbox" data-opt="gradToTransparent" ${opts.gradToTransparent ? 'checked' : ''}> Vers transparent</label>` + optSlider('opacity', 'Opacité', 1, 100, ' %');
    if (tool === 'crop') h += `<label>Proportions <select data-opt="cropRatio"><option value="free">Libre</option><option value="1">1:1 carré</option><option value="1.5">3:2</option><option value="1.3333">4:3</option><option value="1.7778">16:9</option><option value="0.8">4:5 (Instagram)</option><option value="0.7071">A4 portrait</option><option value="1.4142">A4 paysage</option><option value="0.7778">Photo d'identité 35×45</option></select></label><button class="primary" id="cropApply">Recadrer (Entrée)</button><button id="cropCancel">Annuler</button>`;
    if (tool === 'marquee') h += '<span class="hint">Glissez pour sélectionner. Maj : carré. Les outils de peinture et les filtres se limitent à la sélection.</span><button data-act="deselect">Désélectionner</button><button data-act="layerFromSel">Vers nouveau calque</button>';
    if (tool === 'move') h += '<span class="hint">Glissez pour déplacer le calque actif. Flèches : 1 px, Maj+flèches : 10 px.</span><button data-act="layerScale">Échelle / rotation…</button><button data-act="centerLayer">Centrer</button>';
    if (tool === 'text') h += '<span class="hint">Cliquez dans l\'image pour placer un texte (nouveau calque).</span>';
    if (tool === 'eyedropper') h += '<span class="hint">Cliquez pour prélever une couleur. Alt+clic : couleur d\'arrière-plan.</span>';
    if (tool === 'hand') h += '<span class="hint">Glissez pour vous déplacer. Ctrl+molette : zoom.</span>';
    $('#optbar').innerHTML = h;
    $$('#optbar [data-opt]').forEach((el) => {
      const k = el.dataset.opt;
      if (el.tagName === 'SELECT') el.value = opts[k] ?? el.value;
      el.addEventListener('input', () => {
        opts[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
        const o = $(`#optbar [data-optv="${k}"]`); if (o) o.textContent = el.value + (o.textContent.match(/[^\d.-]+$/) || [''])[0];
        store('photojoe-opts', opts); drawUI();
      });
    });
    if (opts.shapeKind === undefined) opts.shapeKind = 'rect';
    $$('#optbar [data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
    const cs = $('#cloneSet'); if (cs) cs.onclick = () => { cloneSetNext = true; toast('Cliquez sur la zone à copier'); };
    const ca = $('#cropApply'); if (ca) ca.onclick = applyCrop;
    const cc = $('#cropCancel'); if (cc) cc.onclick = () => { uiShape = null; drawUI(); };
  }

  /* ---------------- Interaction ---------------- */
  let cursorPos = null, stroke = null, cloneSrc = null, cloneSetNext = false, cloneOffset = null;
  const docPt = (e) => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const fg = () => $('#fg').value, bg = () => $('#bg').value;

  function clipSel(ctx, L) { if (sel) { ctx.beginPath(); ctx.rect(sel.x - L.x, sel.y - L.y, sel.w, sel.h); ctx.clip(); } }

  view.addEventListener('pointerdown', async (e) => {
    if (!doc) return;
    if (e.button === 1 || tool === 'hand' || spaceDown) { startPan(e); return; }
    view.setPointerCapture(e.pointerId);
    const p = docPt(e), L = active();
    if (!L.visible && ['brush', 'eraser', 'bucket', 'clone', 'gradient', 'magicEraser', 'blurBrush'].includes(tool)) { toast('Le calque actif est masqué.'); return; }
    switch (tool) {
      case 'brush': case 'eraser': case 'clone': case 'blurBrush': {
        if (tool === 'clone' && (e.altKey || cloneSetNext)) { cloneSrc = p; cloneSetNext = false; cloneOffset = null; renderOptbar(); drawUI(); return; }
        if (tool === 'clone' && !cloneSrc) { toast('Définissez d\'abord la source : Alt+clic.'); return; }
        pushUndo();
        const sc = mkCanvas(L.canvas.width, L.canvas.height);
        stroke = { L, canvas: sc, ctx: sc.getContext('2d'), last: { x: p.x - L.x, y: p.y - L.y }, tmp: mkCanvas(L.canvas.width, L.canvas.height) };
        if (tool === 'clone') { stroke.snap = copyCanvas(L.canvas); cloneOffset = { x: cloneSrc.x - p.x, y: cloneSrc.y - p.y }; }
        if (tool === 'blurBrush') { stroke.snap = blurredCopy(L.canvas, Math.max(2, opts.size / 8)); }
        paintTo(stroke.last, stroke.last, e.pressure);
        updateStrokePreview();
        break;
      }
      case 'bucket': case 'magicEraser': {
        pushUndo(); floodFill(L, Math.floor(p.x - L.x), Math.floor(p.y - L.y), tool === 'magicEraser'); refreshAll(); break;
      }
      case 'eyedropper': {
        const c = flatCanvas().getContext('2d').getImageData(clamp(Math.floor(p.x), 0, doc.w - 1), clamp(Math.floor(p.y), 0, doc.h - 1), 1, 1).data;
        const hex = '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        $(e.altKey ? '#bg' : '#fg').value = hex; toast(`Couleur ${hex}`); break;
      }
      case 'marquee': case 'crop': case 'shape': case 'gradient':
        stroke = { start: p };
        if (tool === 'gradient') uiShape = { kind: 'grad', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
        break;
      case 'move': pushUndo(); stroke = { start: p, ox: L.x, oy: L.y }; break;
      case 'text': textDialog(p); break;
    }
  });
  view.addEventListener('pointermove', (e) => {
    if (!doc) return;
    if (panning) { doPan(e); return; }
    const p = docPt(e); cursorPos = p;
    if (!stroke) { drawUI(); return; }
    const L = active();
    switch (tool) {
      case 'brush': case 'eraser': case 'clone': case 'blurBrush': {
        const pts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const ev of pts) { const q = docPt(ev); const lp = { x: q.x - L.x, y: q.y - L.y }; paintTo(stroke.last, lp, ev.pressure); stroke.last = lp; }
        updateStrokePreview(); break;
      }
      case 'marquee': uiShape = { kind: 'sel', r: rectFrom(stroke.start, p, e.shiftKey ? 1 : null) }; drawUI(); break;
      case 'crop': uiShape = { kind: 'crop', r: rectFrom(stroke.start, p, opts.cropRatio === 'free' ? (e.shiftKey ? 1 : null) : +opts.cropRatio) }; drawUI(); break;
      case 'gradient': uiShape.x2 = p.x; uiShape.y2 = p.y; drawUI(); break;
      case 'shape': {
        const ov = mkCanvas(L.canvas.width, L.canvas.height); const c = ov.getContext('2d');
        c.drawImage(L.canvas, 0, 0); c.translate(-L.x, -L.y); drawShape(c, stroke.start, p, e.shiftKey);
        override = { layer: L, canvas: ov }; redraw(); break;
      }
      case 'move': L.x = Math.round(stroke.ox + p.x - stroke.start.x); L.y = Math.round(stroke.oy + p.y - stroke.start.y); redraw(); break;
    }
  });
  const endStroke = (e) => {
    if (panning) { panning = null; view.style.cursor = tool === 'hand' ? 'grab' : view.style.cursor; return; }
    if (!stroke) return;
    const L = active(); const p = docPt(e);
    switch (tool) {
      case 'brush': case 'eraser': case 'clone': case 'blurBrush': {
        const c = L.canvas.getContext('2d'); c.save(); clipSel(c, L); mergeStroke(c); c.restore();
        override = null; break;
      }
      case 'marquee': { const r = rectFrom(stroke.start, p, e.shiftKey ? 1 : null); sel = r.w > 1 && r.h > 1 ? clampRect(r) : null; uiShape = null; break; }
      case 'crop': break; // en attente de validation
      case 'gradient': pushUndo(); applyGradient(L, uiShape); uiShape = null; break;
      case 'shape': {
        override = null;
        if (Math.hypot(p.x - stroke.start.x, p.y - stroke.start.y) > 2) {
          pushUndo();
          const c = L.canvas.getContext('2d'); c.save(); c.translate(-L.x, -L.y); drawShape(c, stroke.start, p, e.shiftKey); c.restore();
        }
        break;
      }
    }
    stroke = null; refreshAll();
  };
  view.addEventListener('pointerup', endStroke);
  view.addEventListener('pointercancel', endStroke);
  view.addEventListener('pointerleave', () => { cursorPos = null; drawUI(); });

  function rectFrom(a, b, ratio) {
    let w = b.x - a.x, h = b.y - a.y;
    if (ratio) { const aw = Math.abs(w), ah = Math.abs(h); if (aw / ah > ratio) w = Math.sign(w || 1) * ah * ratio; else h = Math.sign(h || 1) * aw / ratio; }
    return { x: Math.round(Math.min(a.x, a.x + w)), y: Math.round(Math.min(a.y, a.y + h)), w: Math.round(Math.abs(w)), h: Math.round(Math.abs(h)) };
  }
  function clampRect(r) { const x = clamp(r.x, 0, doc.w), y = clamp(r.y, 0, doc.h); return { x, y, w: clamp(r.x + r.w, 0, doc.w) - x, h: clamp(r.y + r.h, 0, doc.h) - y }; }

  function paintTo(a, b, pressure) {
    const c = stroke.ctx; const pr = pressure && pressure !== 0.5 ? 0.3 + pressure : 1;
    const size = Math.max(1, opts.size * pr);
    if (tool === 'clone' || tool === 'blurBrush') {
      const d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(d / Math.max(1, size / 6)));
      for (let i = 0; i <= steps; i++) {
        const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
        c.save(); c.beginPath(); c.arc(x, y, size / 2, 0, Math.PI * 2); c.clip();
        if (tool === 'clone') c.drawImage(stroke.snap, -cloneOffset.x, -cloneOffset.y);
        else c.drawImage(stroke.snap, 0, 0);
        c.restore();
      }
      return;
    }
    c.strokeStyle = c.fillStyle = tool === 'eraser' ? '#000' : fg();
    c.lineWidth = size; c.lineCap = c.lineJoin = 'round';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x + 0.01, b.y); c.stroke();
  }
  function mergeStroke(c) {
    c.globalAlpha = opts.opacity / 100;
    const blur = (1 - opts.hardness / 100) * opts.size / 4;
    if (blur > 0.3) c.filter = `blur(${blur}px)`;
    c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    c.drawImage(stroke.canvas, 0, 0);
    c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  function updateStrokePreview() {
    const t = stroke.tmp, c = t.getContext('2d');
    c.save(); c.clearRect(0, 0, t.width, t.height); c.drawImage(stroke.L.canvas, 0, 0); clipSel(c, stroke.L); mergeStroke(c); c.restore();
    override = { layer: stroke.L, canvas: t }; redraw();
  }
  function blurredCopy(src, r) {
    const c = mkCanvas(src.width, src.height); const x = ctx2d(c);
    if ('filter' in x) { x.filter = `blur(${r}px)`; x.drawImage(src, 0, 0); x.filter = 'none'; return c; }
    x.drawImage(src, 0, 0); // navigateurs sans ctx.filter : flou calculé
    const img = x.getImageData(0, 0, c.width, c.height); boxBlur(img, r / 1.7); x.putImageData(img, 0, 0);
    return c;
  }
  function drawShape(c, a, b, shift) {
    const kind = opts.shapeKind || 'rect';
    let w = b.x - a.x, h = b.y - a.y;
    if (shift && kind !== 'line' && kind !== 'arrow') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    c.save(); clipSelDoc(c);
    c.fillStyle = fg(); c.strokeStyle = opts.shapeMode === 'both' ? bg() : fg(); c.lineWidth = opts.strokeW; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    const x = Math.min(a.x, a.x + w), y = Math.min(a.y, a.y + h), W = Math.abs(w), H = Math.abs(h);
    if (kind === 'rect') c.rect(x, y, W, H);
    else if (kind === 'round') { const r = Math.min(W, H) * 0.18; c.roundRect ? c.roundRect(x, y, W, H, r) : c.rect(x, y, W, H); }
    else if (kind === 'ellipse') c.ellipse(x + W / 2, y + H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
    else {
      let ex = a.x + w, ey = a.y + h;
      if (shift) { const ang = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(w, h); ex = a.x + Math.cos(ang) * d; ey = a.y + Math.sin(ang) * d; }
      c.moveTo(a.x, a.y); c.lineTo(ex, ey); c.stroke();
      if (kind === 'arrow') {
        const ang = Math.atan2(ey - a.y, ex - a.x), hl = Math.max(12, opts.strokeW * 3.5);
        c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - hl * Math.cos(ang - 0.45), ey - hl * Math.sin(ang - 0.45)); c.lineTo(ex - hl * Math.cos(ang + 0.45), ey - hl * Math.sin(ang + 0.45)); c.closePath(); c.fillStyle = c.strokeStyle; c.fill();
      }
      c.restore(); return;
    }
    if (opts.shapeMode !== 'stroke') c.fill();
    if (opts.shapeMode !== 'fill') c.stroke();
    c.restore();
  }
  function clipSelDoc(c) { if (sel) { c.beginPath(); c.rect(sel.x, sel.y, sel.w, sel.h); c.clip(); } }

  function applyGradient(L, g) {
    const c = L.canvas.getContext('2d');
    c.save(); c.translate(-L.x, -L.y); clipSelDoc(c);
    const len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) || 1;
    const grad = opts.gradType === 'radial' ? c.createRadialGradient(g.x1, g.y1, 0, g.x1, g.y1, len) : c.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
    const [r, gg, b] = hexRgb(fg());
    grad.addColorStop(0, fg()); grad.addColorStop(1, opts.gradToTransparent ? `rgba(${r},${gg},${b},0)` : bg());
    c.globalAlpha = opts.opacity / 100; c.fillStyle = grad;
    if (sel) c.fillRect(sel.x, sel.y, sel.w, sel.h); else c.fillRect(L.x, L.y, L.canvas.width, L.canvas.height);
    c.restore();
  }

  function floodFill(L, sx, sy, erase) {
    const W = L.canvas.width, H = L.canvas.height;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
    const c = ctx2d(L.canvas); const img = c.getImageData(0, 0, W, H), d = img.data;
    const i0 = (sy * W + sx) * 4; const t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
    const tol = opts.tolerance;
    const match = (i) => Math.abs(d[i] - t[0]) <= tol && Math.abs(d[i + 1] - t[1]) <= tol && Math.abs(d[i + 2] - t[2]) <= tol && Math.abs(d[i + 3] - t[3]) <= tol;
    const mask = new Uint8Array(W * H);
    const inSel = (x, y) => !sel || (x + L.x >= sel.x && x + L.x < sel.x + sel.w && y + L.y >= sel.y && y + L.y < sel.y + sel.h);
    if (opts.contiguous) {
      const stack = [sx, sy];
      while (stack.length) {
        const y = stack.pop(), x0 = stack.pop();
        let x = x0; while (x >= 0 && !mask[y * W + x] && match((y * W + x) * 4)) x--;
        x++; let up = false, dn = false;
        while (x < W && !mask[y * W + x] && match((y * W + x) * 4)) {
          mask[y * W + x] = 1;
          if (y > 0) { const m = !mask[(y - 1) * W + x] && match(((y - 1) * W + x) * 4); if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false; }
          if (y < H - 1) { const m = !mask[(y + 1) * W + x] && match(((y + 1) * W + x) * 4); if (m && !dn) { stack.push(x, y + 1); dn = true; } else if (!m) dn = false; }
          x++;
        }
      }
    } else for (let i = 0; i < W * H; i++) if (match(i * 4)) mask[i] = 1;
    const [r, g, b] = hexRgb(fg()); const a = opts.opacity / 100;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x; if (!mask[k] || !inSel(x, y)) continue; const i = k * 4;
      if (erase) d[i + 3] = 0;
      else { d[i] = d[i] * (1 - a) + r * a; d[i + 1] = d[i + 1] * (1 - a) + g * a; d[i + 2] = d[i + 2] * (1 - a) + b * a; d[i + 3] = Math.max(d[i + 3], 255 * a); }
    }
    c.putImageData(img, 0, 0);
  }

  function removeBackground() {
    const L = active(); pushUndo();
    const W = L.canvas.width, H = L.canvas.height, c = ctx2d(L.canvas);
    const img = c.getImageData(0, 0, W, H), d = img.data;
    const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
    const ref = [0, 0, 0]; corners.forEach(([x, y]) => { const i = (y * W + x) * 4; ref[0] += d[i] / 4; ref[1] += d[i + 1] / 4; ref[2] += d[i + 2] / 4; });
    const tol = Math.max(20, opts.tolerance);
    const dist = (i) => Math.max(Math.abs(d[i] - ref[0]), Math.abs(d[i + 1] - ref[1]), Math.abs(d[i + 2] - ref[2]));
    const mask = new Uint8Array(W * H); const q = [];
    const push = (x, y) => { const k = y * W + x; if (!mask[k] && dist(k * 4) <= tol) { mask[k] = 1; q.push(k); } };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    while (q.length) {
      const k = q.pop(), x = k % W, y = (k / W) | 0;
      if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1);
    }
    for (let k = 0; k < W * H; k++) {
      const i = k * 4;
      if (mask[k]) d[i + 3] = 0;
      else { // adoucit les bords proches de la couleur de fond
        const x = k % W, y = (k / W) | 0;
        const edge = (x > 0 && mask[k - 1]) || (x < W - 1 && mask[k + 1]) || (y > 0 && mask[k - W]) || (y < H - 1 && mask[k + W]);
        if (edge) d[i + 3] = Math.min(d[i + 3], clamp((dist(i) - tol) / tol * 255 + 128, 0, 255));
      }
    }
    c.putImageData(img, 0, 0); refreshAll(); toast('Arrière-plan supprimé — ajustez la tolérance si besoin');
  }

  /* panoramique */
  let panning = null, spaceDown = false;
  function startPan(e) { const st = $('#stage'); panning = { x: e.clientX, y: e.clientY, sl: st.scrollLeft, st: st.scrollTop }; view.style.cursor = 'grabbing'; view.setPointerCapture(e.pointerId); }
  function doPan(e) { const st = $('#stage'); st.scrollLeft = panning.sl - (e.clientX - panning.x); st.scrollTop = panning.st - (e.clientY - panning.y); }
  $('#stage').addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return; e.preventDefault();
    zoom = clamp(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.05, 32); applyZoom();
  }, { passive: false });

  /* ---------------- Texte ---------------- */
  async function textDialog(p) {
    const fonts = ['Segoe UI', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Brush Script MT'];
    const res = await modal({
      title: 'Ajouter un texte',
      body: `<div class="field"><label for="tx">Texte</label><textarea id="tx">Votre texte</textarea></div>
        <div class="grid2"><div class="field"><label for="tf">Police</label><select id="tf">${fonts.map((f) => `<option${f === opts.font ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="field"><label for="ts">Taille (px)</label><input type="number" id="ts" value="${opts.textSize}" min="4" max="1000"></div></div>
        <div class="row"><label><input type="checkbox" id="tb" checked> Gras</label><label><input type="checkbox" id="ti"> Italique</label>
        <label><input type="checkbox" id="tsh"> Ombre portée</label><label><input type="checkbox" id="tol"> Contour (couleur d'arrière-plan)</label></div>
        <div class="field"><label for="ta">Alignement</label><select id="ta"><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></div>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Ajouter', primary: true, value: (b) => ({ t: b.querySelector('#tx').value, f: b.querySelector('#tf').value, s: +b.querySelector('#ts').value, b: b.querySelector('#tb').checked, i: b.querySelector('#ti').checked, sh: b.querySelector('#tsh').checked, ol: b.querySelector('#tol').checked, a: b.querySelector('#ta').value }) }],
    });
    if (!res || !res.t.trim()) return;
    opts.font = res.f; opts.textSize = res.s; store('photojoe-opts', opts);
    pushUndo();
    const L = newLayer('Texte : ' + res.t.slice(0, 20));
    const c = L.canvas.getContext('2d');
    c.font = `${res.i ? 'italic ' : ''}${res.b ? 'bold ' : ''}${res.s}px "${res.f}", sans-serif`;
    c.textAlign = res.a; c.textBaseline = 'top'; c.fillStyle = fg();
    if (res.sh) { c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = res.s / 8; c.shadowOffsetX = c.shadowOffsetY = res.s / 16; }
    res.t.split('\n').forEach((ln, i) => {
      const y = p.y + i * res.s * 1.2;
      if (res.ol) { c.save(); c.shadowColor = 'transparent'; c.strokeStyle = bg(); c.lineWidth = Math.max(2, res.s / 10); c.lineJoin = 'round'; c.strokeText(ln, p.x, y); c.restore(); }
      c.fillText(ln, p.x, y);
    });
    doc.layers.splice(doc.active + 1, 0, L); doc.active++;
    refreshAll();
  }

  /* ---------------- Opérations image / calques ---------------- */
  function transformDoc(kind) {
    pushUndo();
    const W = doc.w, H = doc.h;
    doc.layers.forEach((L) => {
      const s = L.canvas, w = s.width, h = s.height;
      const swap = kind === 'cw' || kind === 'ccw';
      const n = mkCanvas(swap ? h : w, swap ? w : h), c = n.getContext('2d');
      c.translate(n.width / 2, n.height / 2);
      if (kind === 'cw') c.rotate(Math.PI / 2); else if (kind === 'ccw') c.rotate(-Math.PI / 2); else if (kind === '180') c.rotate(Math.PI);
      else if (kind === 'h') c.scale(-1, 1); else if (kind === 'v') c.scale(1, -1);
      c.drawImage(s, -w / 2, -h / 2);
      const { x, y } = L;
      if (kind === 'cw') { L.x = H - y - h; L.y = x; }
      else if (kind === 'ccw') { L.x = y; L.y = W - x - w; }
      else if (kind === '180') { L.x = W - x - w; L.y = H - y - h; }
      else if (kind === 'h') L.x = W - x - w;
      else if (kind === 'v') L.y = H - y - h;
      L.canvas = n;
    });
    if (kind === 'cw' || kind === 'ccw') { doc.w = H; doc.h = W; }
    sel = null; sizeView(); fit(); refreshAll();
  }
  function flipLayer(axis) {
    pushUndo(); const L = active(); const n = mkCanvas(L.canvas.width, L.canvas.height), c = n.getContext('2d');
    c.translate(axis === 'h' ? n.width : 0, axis === 'v' ? n.height : 0); c.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1); c.drawImage(L.canvas, 0, 0);
    L.canvas = n; refreshAll();
  }
  function cropTo(r) {
    r = clampRect(r); if (r.w < 1 || r.h < 1) return;
    pushUndo();
    doc.layers.forEach((L) => { L.x -= r.x; L.y -= r.y; });
    doc.w = r.w; doc.h = r.h; sel = null; uiShape = null;
    sizeView(); fit(); refreshAll();
  }
  function applyCrop() { if (uiShape && uiShape.kind === 'crop') cropTo(uiShape.r); else toast('Tracez d\'abord le cadre de recadrage.'); }

  async function resizeDialog() {
    const res = await modal({
      title: 'Taille de l\'image',
      body: `<div class="grid2"><div class="field"><label for="rw">Largeur (px)</label><input type="number" id="rw" value="${doc.w}" min="1"></div>
        <div class="field"><label for="rh">Hauteur (px)</label><input type="number" id="rh" value="${doc.h}" min="1"></div></div>
        <div class="row"><label><input type="checkbox" id="rk" checked> Conserver les proportions</label>
        <label for="rp">ou pourcentage</label><input type="number" id="rp" value="100" min="1" max="1000" style="width:80px"></div>
        <p class="hint">Astuce : 1920 px de large suffit pour un écran, 3508 px pour un A4 à 300 ppp.</p>`,
      onOpen: (b) => {
        const w = b.querySelector('#rw'), h = b.querySelector('#rh'), k = b.querySelector('#rk'), pc = b.querySelector('#rp');
        w.oninput = () => { if (k.checked) h.value = Math.round(w.value * doc.h / doc.w); };
        h.oninput = () => { if (k.checked) w.value = Math.round(h.value * doc.w / doc.h); };
        pc.oninput = () => { w.value = Math.round(doc.w * pc.value / 100); h.value = Math.round(doc.h * pc.value / 100); };
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Redimensionner', primary: true, value: (b) => [+b.querySelector('#rw').value, +b.querySelector('#rh').value] }],
    });
    if (!res || res[0] < 1 || res[1] < 1) return;
    pushUndo();
    const sx = res[0] / doc.w, sy = res[1] / doc.h;
    doc.layers.forEach((L) => {
      const n = mkCanvas(L.canvas.width * sx, L.canvas.height * sy), c = n.getContext('2d');
      c.imageSmoothingQuality = 'high'; c.drawImage(L.canvas, 0, 0, n.width, n.height);
      L.canvas = n; L.x = Math.round(L.x * sx); L.y = Math.round(L.y * sy);
    });
    doc.w = res[0]; doc.h = res[1]; sel = null; sizeView(); fit(); refreshAll();
  }
  async function canvasSizeDialog() {
    const res = await modal({
      title: 'Taille de la zone de travail',
      body: `<div class="grid2"><div class="field"><label for="cw">Largeur (px)</label><input type="number" id="cw" value="${doc.w}" min="1"></div>
        <div class="field"><label for="ch">Hauteur (px)</label><input type="number" id="ch" value="${doc.h}" min="1"></div></div>
        <div class="field"><label for="ca">Ancrage</label><select id="ca"><option value="c">Centre</option><option value="tl">Haut gauche</option><option value="t">Haut</option><option value="b">Bas</option></select></div>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => [+b.querySelector('#cw').value, +b.querySelector('#ch').value, b.querySelector('#ca').value] }],
    });
    if (!res) return;
    pushUndo();
    const [w, h, a] = res;
    const dx = a === 'tl' ? 0 : (w - doc.w) / 2, dy = a === 'tl' || a === 't' ? 0 : a === 'b' ? h - doc.h : (h - doc.h) / 2;
    doc.layers.forEach((L) => { L.x = Math.round(L.x + dx); L.y = Math.round(L.y + dy); });
    doc.w = w; doc.h = h; sizeView(); fit(); refreshAll();
  }
  async function layerScaleDialog() {
    const L = active();
    const res = await modal({
      title: 'Échelle et rotation du calque',
      body: `<div class="grid2"><div class="field"><label for="ls">Échelle (%)</label><input type="number" id="ls" value="100" min="1" max="2000"></div>
        <div class="field"><label for="lr">Rotation (°)</label><input type="number" id="lr" value="0" min="-360" max="360"></div></div>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => [+b.querySelector('#ls').value / 100, +b.querySelector('#lr').value] }],
    });
    if (!res) return;
    pushUndo();
    const [s, deg] = res, rad = deg * Math.PI / 180;
    const w = L.canvas.width * s, h = L.canvas.height * s;
    const nw = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)), nh = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
    const n = mkCanvas(nw, nh), c = n.getContext('2d'); c.imageSmoothingQuality = 'high';
    c.translate(nw / 2, nh / 2); c.rotate(rad); c.drawImage(L.canvas, -w / 2, -h / 2, w, h);
    const cx = L.x + L.canvas.width / 2, cy = L.y + L.canvas.height / 2;
    L.canvas = n; L.x = Math.round(cx - nw / 2); L.y = Math.round(cy - nh / 2);
    refreshAll();
  }
  function mergeDown() {
    if (doc.active === 0) { toast('Aucun calque en dessous.'); return; }
    pushUndo();
    const top = active(), below = doc.layers[doc.active - 1];
    // le calque inférieur est étendu à la taille du document pour ne rien perdre
    const n = mkCanvas(doc.w, doc.h), c = n.getContext('2d');
    c.globalAlpha = below.opacity; c.globalCompositeOperation = below.blend; c.drawImage(below.canvas, below.x, below.y);
    c.globalAlpha = top.opacity; c.globalCompositeOperation = top.blend; if (top.visible) c.drawImage(top.canvas, top.x, top.y);
    Object.assign(below, { canvas: n, x: 0, y: 0, opacity: 1, blend: 'source-over' });
    doc.layers.splice(doc.active, 1); doc.active--; refreshAll();
  }
  function flatten() { pushUndo(); const c = flatCanvas(); const L = newLayer('Arrière-plan'); L.canvas = c; doc.layers = [L]; doc.active = 0; refreshAll(); }

  /* ---------------- Réglages (aperçu en direct) ---------------- */
  const ADJ = [
    ['exposure', 'Exposition', -100, 100], ['brightness', 'Luminosité', -100, 100], ['contrast', 'Contraste', -100, 100],
    ['highlights', 'Hautes lumières', -100, 100], ['shadows', 'Ombres', -100, 100],
    ['temperature', 'Température', -100, 100], ['tint', 'Teinte vert/magenta', -100, 100],
    ['vibrance', 'Vibrance', -100, 100], ['saturation', 'Saturation', -100, 100], ['hue', 'Teinte (°)', -180, 180],
  ];
  const adj = Object.fromEntries(ADJ.map(([k]) => [k, 0]));
  let adjBase = null; // {L, data}
  function buildAdjust() {
    $('#adjusts').innerHTML = ADJ.map(([k, l, mn, mx]) => `<div class="slider"><label for="adj_${k}">${l}</label><output id="adj_${k}O">0</output><input type="range" id="adj_${k}" min="${mn}" max="${mx}" value="0"></div>`).join('');
    ADJ.forEach(([k]) => {
      const i = $('#adj_' + k);
      i.addEventListener('input', () => { adj[k] = +i.value; $('#adj_' + k + 'O').textContent = i.value; previewAdjust(); });
      i.addEventListener('dblclick', () => { i.value = 0; adj[k] = 0; $('#adj_' + k + 'O').textContent = '0'; previewAdjust(); });
    });
    $('#adjApply').onclick = applyAdjust; $('#adjReset').onclick = cancelAdjust;
  }
  let adjRaf = 0;
  function previewAdjust() {
    const L = active();
    if (!adjBase || adjBase.L !== L) { cancelAdjust(true); adjBase = { L, data: ctx2d(L.canvas).getImageData(0, 0, L.canvas.width, L.canvas.height), undo: snapshot() }; }
    if (adjRaf) return;
    adjRaf = requestAnimationFrame(() => {
      adjRaf = 0;
      const src = adjBase.data, out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
      adjustPixels(out.data, adj, L);
      ctx2d(L.canvas).putImageData(out, 0, 0); redraw(); scheduleHist();
    });
  }
  function adjustPixels(d, a, L) {
    const ex = Math.pow(2, a.exposure / 50), br = a.brightness * 1.28, cv = a.contrast * 2.55, cf = (259 * (cv + 255)) / (255 * (259 - cv));
    const tp = a.temperature * 0.35, tn = a.tint * 0.3, sat = 1 + a.saturation / 100, vib = a.vibrance / 100;
    const sh = a.shadows / 100, hl = a.highlights / 100;
    const h = a.hue * Math.PI / 180, cosA = Math.cos(h), sinA = Math.sin(h);
    const m = [ // matrice de rotation de teinte (identique au filtre CSS hue-rotate)
      0.213 + cosA * 0.787 - sinA * 0.213, 0.715 - cosA * 0.715 - sinA * 0.715, 0.072 - cosA * 0.072 + sinA * 0.928,
      0.213 - cosA * 0.213 + sinA * 0.143, 0.715 + cosA * 0.285 + sinA * 0.140, 0.072 - cosA * 0.072 - sinA * 0.283,
      0.213 - cosA * 0.213 - sinA * 0.787, 0.715 - cosA * 0.715 + sinA * 0.715, 0.072 + cosA * 0.928 + sinA * 0.072];
    const doHue = a.hue !== 0;
    const lim = selLimits(L);
    const W = L ? L.canvas.width : 0;
    for (let i = 0; i < d.length; i += 4) {
      if (lim) { const k = i / 4, x = k % W, y = (k / W) | 0; if (x < lim.x0 || x >= lim.x1 || y < lim.y0 || y >= lim.y1) continue; }
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (ex !== 1) { r *= ex; g *= ex; b *= ex; }
      if (br) { r += br; g += br; b += br; }
      if (cv) { r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128; }
      if (sh || hl) {
        const l = clamp((0.299 * r + 0.587 * g + 0.114 * b) / 255, 0, 1);
        const delta = (sh * (1 - l) * (1 - l) + hl * l * l) * 110;
        r += delta; g += delta; b += delta;
      }
      if (tp) { r += tp; b -= tp; }
      if (tn) g -= tn;
      if (doHue) { const R = r, G = g, B = b; r = m[0] * R + m[1] * G + m[2] * B; g = m[3] * R + m[4] * G + m[5] * B; b = m[6] * R + m[7] * G + m[8] * B; }
      if (sat !== 1 || vib) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        let s = sat;
        if (vib) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const cur = mx > 0 ? (mx - mn) / mx : 0; s *= 1 + vib * (1 - cur); }
        r = gray + (r - gray) * s; g = gray + (g - gray) * s; b = gray + (b - gray) * s;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }
  function selLimits(L) { if (!sel || !L) return null; return { x0: sel.x - L.x, y0: sel.y - L.y, x1: sel.x - L.x + sel.w, y1: sel.y - L.y + sel.h }; }
  function resetSliders() { ADJ.forEach(([k]) => { adj[k] = 0; const i = $('#adj_' + k); if (i) { i.value = 0; $('#adj_' + k + 'O').textContent = '0'; } }); }
  function applyAdjust() {
    if (!adjBase) { toast('Bougez d\'abord un curseur.'); return; }
    undoStack.push(adjBase.undo); redoStack.length = 0; updateHistBtns();
    adjBase = null; resetSliders(); refreshAll(); toast('Réglages appliqués');
  }
  function cancelAdjust(keepSliders) {
    if (adjBase) { ctx2d(adjBase.L.canvas).putImageData(adjBase.data, 0, 0); adjBase = null; if (doc) refreshAll(); }
    if (!keepSliders) resetSliders();
  }

  /* ---------------- Filtres ---------------- */
  function filterLayer(fn) {
    cancelAdjust();
    const L = active(); pushUndo();
    const c = ctx2d(L.canvas); const img = c.getImageData(0, 0, L.canvas.width, L.canvas.height);
    const before = sel ? new Uint8ClampedArray(img.data) : null;
    fn(img, L);
    if (before) { // ne garder l'effet que dans la sélection
      const lim = selLimits(L), W = img.width;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < W; x++) {
        if (x >= lim.x0 && x < lim.x1 && y >= lim.y0 && y < lim.y1) continue;
        const i = (y * W + x) * 4; img.data[i] = before[i]; img.data[i + 1] = before[i + 1]; img.data[i + 2] = before[i + 2]; img.data[i + 3] = before[i + 3];
      }
    }
    c.putImageData(img, 0, 0); refreshAll();
  }
  const perPixel = (f) => (img) => { const d = img.data; for (let i = 0; i < d.length; i += 4) f(d, i); };
  function convolve(img, k, div = 1, bias = 0) {
    const { width: W, height: H, data: s } = img; const o = new Uint8ClampedArray(s.length); const n = Math.sqrt(k.length) | 0, h = n >> 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = 0; ky < n; ky++) for (let kx = 0; kx < n; kx++) {
        const yy = clamp(y + ky - h, 0, H - 1), xx = clamp(x + kx - h, 0, W - 1), i = (yy * W + xx) * 4, w = k[ky * n + kx];
        r += s[i] * w; g += s[i + 1] * w; b += s[i + 2] * w;
      }
      const i = (y * W + x) * 4; o[i] = r / div + bias; o[i + 1] = g / div + bias; o[i + 2] = b / div + bias; o[i + 3] = s[i + 3];
    }
    img.data.set(o);
  }
  function boxBlur(img, r) {
    r = Math.max(1, Math.round(r));
    const { width: W, height: H } = img; const d = img.data; const t = new Float32Array(d.length);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < H; y++) { // horizontal
        for (let ch = 0; ch < 4; ch++) {
          let acc = 0; for (let x = -r; x <= r; x++) acc += d[(y * W + clamp(x, 0, W - 1)) * 4 + ch];
          for (let x = 0; x < W; x++) {
            t[(y * W + x) * 4 + ch] = acc / (2 * r + 1);
            acc += d[(y * W + clamp(x + r + 1, 0, W - 1)) * 4 + ch] - d[(y * W + clamp(x - r, 0, W - 1)) * 4 + ch];
          }
        }
      }
      for (let x = 0; x < W; x++) { // vertical
        for (let ch = 0; ch < 4; ch++) {
          let acc = 0; for (let y = -r; y <= r; y++) acc += t[(clamp(y, 0, H - 1) * W + x) * 4 + ch];
          for (let y = 0; y < H; y++) {
            d[(y * W + x) * 4 + ch] = acc / (2 * r + 1);
            acc += t[(clamp(y + r + 1, 0, H - 1) * W + x) * 4 + ch] - t[(clamp(y - r, 0, H - 1) * W + x) * 4 + ch];
          }
        }
      }
    }
  }
  function autoLevels(img) {
    const d = img.data, n = d.length / 4; const lo = [], hi = [];
    for (let ch = 0; ch < 3; ch++) {
      const hist = new Uint32Array(256); for (let i = ch; i < d.length; i += 4) hist[d[i]]++;
      let acc = 0, a = 0, b = 255; while (a < 255 && (acc += hist[a]) < n * 0.005) a++;
      acc = 0; while (b > 0 && (acc += hist[b]) < n * 0.005) b--;
      lo[ch] = a; hi[ch] = Math.max(a + 1, b);
    }
    for (let i = 0; i < d.length; i += 4) for (let ch = 0; ch < 3; ch++) d[i + ch] = (d[i + ch] - lo[ch]) * 255 / (hi[ch] - lo[ch]);
  }
  async function askNumber(title, label, value, min, max) {
    return modal({ title, body: `<div class="field"><label for="nv">${label}</label><input type="number" id="nv" value="${value}" min="${min}" max="${max}"></div>`, buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => clamp(+b.querySelector('#nv').value, min, max) }] });
  }
  const FILTERS = [
    ['Auto-amélioration', () => filterLayer(autoLevels)],
    ['Noir et blanc', () => filterLayer(perPixel((d, i) => { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = l; }))],
    ['Sépia', () => filterLayer(perPixel((d, i) => { const r = d[i], g = d[i + 1], b = d[i + 2]; d[i] = r * 0.393 + g * 0.769 + b * 0.189; d[i + 1] = r * 0.349 + g * 0.686 + b * 0.168; d[i + 2] = r * 0.272 + g * 0.534 + b * 0.131; }))],
    ['Négatif', () => filterLayer(perPixel((d, i) => { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }))],
    ['Flou…', async () => { const r = await askNumber('Flou gaussien', 'Rayon (px)', 4, 1, 100); if (r) filterLayer((img) => boxBlur(img, r / 1.7)); }],
    ['Netteté', () => filterLayer((img) => convolve(img, [0, -1, 0, -1, 5, -1, 0, -1, 0]))],
    ['Netteté forte', () => filterLayer((img) => convolve(img, [-1, -1, -1, -1, 9, -1, -1, -1, -1]))],
    ['Contours', () => filterLayer((img) => convolve(img, [-1, -1, -1, -1, 8, -1, -1, -1, -1]))],
    ['Relief', () => filterLayer((img) => convolve(img, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 0))],
    ['Pixeliser…', async () => {
      const s = await askNumber('Pixeliser', 'Taille des blocs (px)', 12, 2, 200); if (!s) return;
      filterLayer((img) => { const { width: W, height: H, data: d } = img; for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) { const i0 = (y * W + x) * 4; for (let yy = y; yy < Math.min(H, y + s); yy++) for (let xx = x; xx < Math.min(W, x + s); xx++) { const i = (yy * W + xx) * 4; d[i] = d[i0]; d[i + 1] = d[i0 + 1]; d[i + 2] = d[i0 + 2]; d[i + 3] = d[i0 + 3]; } } });
    }],
    ['Bruit / grain', () => filterLayer(perPixel((d, i) => { const n = (Math.random() - 0.5) * 40; d[i] += n; d[i + 1] += n; d[i + 2] += n; }))],
    ['Vignette', () => filterLayer((img, L) => { const { width: W, height: H, data: d } = img; const cx = doc.w / 2 - L.x, cy = doc.h / 2 - L.y, R = Math.hypot(doc.w, doc.h) / 2; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const f = 1 - 0.75 * Math.pow(Math.hypot(x - cx, y - cy) / R, 2.2); const i = (y * W + x) * 4; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; } })],
    ['Postériser…', async () => { const n = await askNumber('Postériser', 'Niveaux par canal', 4, 2, 64); if (!n) return; const st = 255 / (n - 1); filterLayer(perPixel((d, i) => { for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / st) * st; })); }],
    ['Seuil (scan N&B)…', async () => { const t = await askNumber('Seuil', 'Seuil (0-255)', 140, 1, 254); if (!t) return; filterLayer(perPixel((d, i) => { const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) > t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; })); }],
    ['Document scanné', () => filterLayer((img) => { autoLevels(img); const d = img.data; for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; const v = l > 170 ? 255 : clamp((l - 40) * 1.6, 0, 255); d[i] = d[i + 1] = d[i + 2] = v; } })],
    ['Supprimer le fond', removeBackground],
  ];
  function buildFilters() {
    const box = $('#filters');
    FILTERS.forEach(([l, f]) => { const b = document.createElement('button'); b.textContent = l; b.onclick = f; box.appendChild(b); });
  }

  /* ---------------- Histogramme ---------------- */
  let histTimer = 0;
  function scheduleHist() { clearTimeout(histTimer); histTimer = setTimeout(drawHist, 250); }
  function drawHist() {
    if (!doc) return;
    const s = Math.min(1, 400 / Math.max(doc.w, doc.h)); const c = mkCanvas(doc.w * s, doc.h * s); const x = c.getContext('2d');
    x.scale(s, s); composite(x);
    const d = x.getImageData(0, 0, c.width, c.height).data; const hs = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; hs[0][d[i]]++; hs[1][d[i + 1]]++; hs[2][d[i + 2]]++; }
    const hc = $('#hist'), h = hc.getContext('2d'); h.clearRect(0, 0, hc.width, hc.height);
    const mx = Math.max(1, ...hs.flatMap((a) => Array.from(a.slice(2, 254))));
    h.globalCompositeOperation = getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'screen' : 'multiply';
    ['rgba(220,60,60,.7)', 'rgba(60,170,80,.7)', 'rgba(60,100,220,.7)'].forEach((col, ch) => {
      h.fillStyle = col; h.beginPath(); h.moveTo(0, hc.height);
      for (let v = 0; v < 256; v++) h.lineTo(v * 2, hc.height - Math.min(1, hs[ch][v] / mx) * hc.height);
      h.lineTo(512, hc.height); h.closePath(); h.fill();
    });
    h.globalCompositeOperation = 'source-over';
  }

  /* ---------------- OCR ---------------- */
  async function ocrImage() {
    cancelAdjust(true);
    let src = flatCanvas();
    if (sel) { const c = mkCanvas(sel.w, sel.h); c.getContext('2d').drawImage(src, -sel.x, -sel.y); src = c; }
    // agrandit les petites images : Tesseract lit mieux des caractères d'au moins 20 px
    if (Math.max(src.width, src.height) < 1800) { const k = 1800 / Math.max(src.width, src.height); const c = mkCanvas(src.width * k, src.height * k); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); src = c; }
    else { const c = mkCanvas(src.width, src.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0); src = c; }
    toast('Reconnaissance du texte en cours…', 60000);
    let r;
    try { r = await Studio.ocr.recognize(src); } catch (e) { toast('OCR impossible : ' + (e.message || e), 6000); return; }
    toast(`${r.words.length} mots reconnus`, 2000);
    const v = await modal({
      title: 'Texte reconnu' + (sel ? ' (sélection)' : ''), wide: true,
      body: '<textarea id="ocrOut" style="width:100%;min-height:50vh;font:13px/1.5 var(--font-mono)" aria-label="Texte reconnu"></textarea><p class="hint" style="margin:0">Astuce : sélectionnez d\'abord une zone (M) pour ne lire qu\'une partie. Vérifiez les chiffres importants.</p>',
      onOpen: (b) => { b.querySelector('#ocrOut').value = r.text; },
      buttons: [{ label: 'Copier', value: 'copy' }, { label: 'Télécharger .txt', primary: true, value: 'txt' }],
    });
    if (v === 'copy') navigator.clipboard.writeText(r.text).then(() => toast('Texte copié'), () => toast('Copie refusée par le navigateur'));
    if (v === 'txt') download(new Blob([r.text], { type: 'text/plain;charset=utf-8' }), `${doc.name}-ocr.txt`);
  }

  /* ---------------- Export / projet ---------------- */
  async function exportDialog() {
    const res = await modal({
      title: 'Exporter l\'image',
      body: `<div class="field"><label for="en">Nom du fichier</label><input type="text" id="en" value="${doc.name}"></div>
        <div class="grid2"><div class="field"><label for="ef">Format</label><select id="ef"><option value="image/png">PNG (transparence)</option><option value="image/jpeg">JPG (photo)</option><option value="image/webp">WebP (léger)</option></select></div>
        <div class="field"><label for="eq">Qualité JPG/WebP</label><input type="number" id="eq" value="90" min="10" max="100"></div></div>
        <div class="field"><label for="es">Échelle</label><select id="es"><option value="1">100 % (${doc.w} × ${doc.h})</option><option value="0.5">50 %</option><option value="0.25">25 %</option><option value="2">200 %</option></select></div>
        <label class="row"><input type="checkbox" id="esel" ${sel ? '' : 'disabled'}> Exporter seulement la sélection</label>
        <p class="hint" id="esz"></p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Exporter', primary: true, value: (b) => ({ n: b.querySelector('#en').value || 'image', f: b.querySelector('#ef').value, q: +b.querySelector('#eq').value / 100, s: +b.querySelector('#es').value, sel: b.querySelector('#esel').checked }) }],
    });
    if (!res) return;
    cancelAdjust(true);
    let src = flatCanvas();
    if (res.sel && sel) { const c = mkCanvas(sel.w, sel.h); c.getContext('2d').drawImage(src, -sel.x, -sel.y); src = c; }
    const out = mkCanvas(src.width * res.s, src.height * res.s); const c = out.getContext('2d');
    if (res.f === 'image/jpeg') { c.fillStyle = '#fff'; c.fillRect(0, 0, out.width, out.height); }
    c.imageSmoothingQuality = 'high'; c.drawImage(src, 0, 0, out.width, out.height);
    const blob = await new Promise((r) => out.toBlob(r, res.f, res.q));
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[res.f];
    download(blob, `${res.n}.${ext}`); toast(`Exporté : ${res.n}.${ext} (${Math.round(blob.size / 1024)} Ko)`);
  }
  function saveProject() {
    cancelAdjust(true);
    const data = { app: 'photo-joe', v: 1, w: doc.w, h: doc.h, name: doc.name, active: doc.active, layers: doc.layers.map((l) => ({ name: l.name, x: l.x, y: l.y, opacity: l.opacity, blend: l.blend, visible: l.visible, src: l.canvas.toDataURL('image/png') })) };
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${doc.name}.joeimg`); toast('Projet enregistré');
  }
  async function openProject(file) {
    const data = JSON.parse(await file.text());
    if (data.app !== 'photo-joe') throw new Error('fichier de projet invalide');
    createDoc(data.w, data.h, data.name, null); doc.layers = [];
    for (const l of data.layers) {
      const im = await loadImage(l.src); const L = newLayer(l.name, im.naturalWidth, im.naturalHeight, l.x, l.y);
      L.canvas.getContext('2d').drawImage(im, 0, 0); Object.assign(L, { opacity: l.opacity, blend: l.blend, visible: l.visible }); doc.layers.push(L);
    }
    doc.active = Math.min(data.active || 0, doc.layers.length - 1); refreshAll();
  }

  async function newDialog() {
    const presets = [['1920x1080', 'Full HD 1920 × 1080'], ['1080x1080', 'Publication carrée 1080 × 1080'], ['1080x1350', 'Instagram portrait 1080 × 1350'], ['1080x1920', 'Story 1080 × 1920'], ['2480x3508', 'A4 300 ppp'], ['1200x628', 'Bannière Facebook / lien'], ['800x600', '800 × 600']];
    const res = await modal({
      title: 'Nouveau document',
      body: `<div class="field"><label for="np">Préréglage</label><select id="np">${presets.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}<option value="custom">Personnalisé</option></select></div>
        <div class="grid2"><div class="field"><label for="nw">Largeur</label><input type="number" id="nw" value="1920" min="1" max="12000"></div><div class="field"><label for="nh">Hauteur</label><input type="number" id="nh" value="1080" min="1" max="12000"></div></div>
        <div class="field"><label for="nb">Fond</label><select id="nb"><option value="#ffffff">Blanc</option><option value="">Transparent</option><option value="fg">Couleur de premier plan</option><option value="#000000">Noir</option></select></div>`,
      onOpen: (b) => { b.querySelector('#np').onchange = (e) => { if (e.target.value !== 'custom') { const [w, h] = e.target.value.split('x'); b.querySelector('#nw').value = w; b.querySelector('#nh').value = h; } }; },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Créer', primary: true, value: (b) => [+b.querySelector('#nw').value, +b.querySelector('#nh').value, b.querySelector('#nb').value] }],
    });
    if (!res) return;
    createDoc(clamp(res[0], 1, 12000), clamp(res[1], 1, 12000), 'sans-titre', res[2] === 'fg' ? fg() : res[2] || null);
  }

  /* ---------------- Actions ---------------- */
  async function act(a) {
    try {
      switch (a) {
        case 'new': return newDialog();
        case 'open': { const [f] = await pickFiles('image/*,.joeimg', false); if (!f) return; return /\.joeimg$/i.test(f.name) ? openProject(f) : openImageFile(f); }
        case 'importLayer': { const fs = await pickFiles('image/*'); for (const f of fs) await importLayer(f); return; }
        case 'export': return exportDialog();
        case 'saveProject': return saveProject();
        case 'openProject': { const [f] = await pickFiles('.joeimg,application/json', false); if (f) await openProject(f); return; }
        case 'undo': return undo();
        case 'redo': return redo();
        case 'resize': return resizeDialog();
        case 'canvasSize': return canvasSizeDialog();
        case 'cropSel': return sel ? cropTo(sel) : toast('Faites d\'abord une sélection (M).');
        case 'rotCW': return transformDoc('cw');
        case 'rotCCW': return transformDoc('ccw');
        case 'rot180': return transformDoc('180');
        case 'flipH': return transformDoc('h');
        case 'flipV': return transformDoc('v');
        case 'flatten': return flatten();
        case 'newLayer': { pushUndo(); doc.layers.splice(doc.active + 1, 0, newLayer()); doc.active++; return refreshAll(); }
        case 'dupLayer': { pushUndo(); const L = active(); doc.layers.splice(doc.active + 1, 0, { ...L, id: layerSeq++, name: L.name + ' copie', canvas: copyCanvas(L.canvas) }); doc.active++; return refreshAll(); }
        case 'delLayer': { if (doc.layers.length < 2) return toast('Il faut garder au moins un calque.'); pushUndo(); doc.layers.splice(doc.active, 1); doc.active = Math.max(0, doc.active - 1); return refreshAll(); }
        case 'layerUp': { if (doc.active >= doc.layers.length - 1) return; pushUndo(); const i = doc.active; [doc.layers[i], doc.layers[i + 1]] = [doc.layers[i + 1], doc.layers[i]]; doc.active++; return refreshAll(); }
        case 'layerDown': { if (doc.active <= 0) return; pushUndo(); const i = doc.active; [doc.layers[i], doc.layers[i - 1]] = [doc.layers[i - 1], doc.layers[i]]; doc.active--; return refreshAll(); }
        case 'mergeDown': return mergeDown();
        case 'layerFlipH': return flipLayer('h');
        case 'layerFlipV': return flipLayer('v');
        case 'layerScale': return layerScaleDialog();
        case 'centerLayer': { pushUndo(); const L = active(); L.x = Math.round((doc.w - L.canvas.width) / 2); L.y = Math.round((doc.h - L.canvas.height) / 2); return refreshAll(); }
        case 'layerFromSel': {
          if (!sel) return toast('Faites d\'abord une sélection (M).');
          pushUndo(); const L = active(); const n = newLayer(L.name + ' (extrait)', sel.w, sel.h, sel.x, sel.y);
          n.canvas.getContext('2d').drawImage(L.canvas, L.x - sel.x, L.y - sel.y);
          doc.layers.splice(doc.active + 1, 0, n); doc.active++; return refreshAll();
        }
        case 'selAll': sel = { x: 0, y: 0, w: doc.w, h: doc.h }; return refreshAll();
        case 'deselect': sel = null; return refreshAll();
        case 'selClear': { if (!sel) return; pushUndo(); const L = active(); L.canvas.getContext('2d').clearRect(sel.x - L.x, sel.y - L.y, sel.w, sel.h); return refreshAll(); }
        case 'selFill': { if (!sel) return toast('Faites d\'abord une sélection (M).'); pushUndo(); const L = active(); const c = L.canvas.getContext('2d'); c.fillStyle = fg(); c.fillRect(sel.x - L.x, sel.y - L.y, sel.w, sel.h); return refreshAll(); }
        case 'removeBg': return removeBackground();
        case 'ocr': return ocrImage();
        case 'zoomIn': zoom = Math.min(32, zoom * 1.25); return applyZoom();
        case 'zoomOut': zoom = Math.max(0.05, zoom / 1.25); return applyZoom();
        case 'fit': return fit();
      }
    } catch (e) { console.error(e); toast('Erreur : ' + (e.message || e), 5000); }
  }
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === ' ') { spaceDown = true; view.style.cursor = 'grab'; e.preventDefault(); return; }
    if (mod) {
      const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: 'export', o: 'open', n: e.shiftKey ? 'newLayer' : 'new', j: 'dupLayer', e: 'mergeDown', a: 'selAll', d: 'deselect', 0: 'fit', '=': 'zoomIn', '+': 'zoomIn', '-': 'zoomOut' };
      if (map[k]) { e.preventDefault(); act(map[k]); } return;
    }
    if (e.key === 'Enter' && tool === 'crop') { applyCrop(); return; }
    if (e.key === 'Escape') { uiShape = null; sel = null; refreshAll(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act('selClear'); return; }
    if (tool === 'move' && e.key.startsWith('Arrow')) {
      e.preventDefault(); const d = e.shiftKey ? 10 : 1, L = active();
      if (!e.repeat) pushUndo();
      if (e.key === 'ArrowLeft') L.x -= d; if (e.key === 'ArrowRight') L.x += d; if (e.key === 'ArrowUp') L.y -= d; if (e.key === 'ArrowDown') L.y += d;
      return refreshAll();
    }
    if (k === 'x') return swapColors();
    if (k === '[') { opts.size = Math.max(1, Math.round(opts.size / 1.2)); renderOptbar(); return drawUI(); }
    if (k === ']') { opts.size = Math.min(400, Math.round(opts.size * 1.2) + 1); renderOptbar(); return drawUI(); }
    const t = TOOLS.find((x) => x[2] === k); if (t) setTool(t[0]);
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; setTool(tool); } });

  // coller une image depuis le presse-papiers
  document.addEventListener('paste', async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); await importLayer(item.getAsFile()); toast('Image collée dans un nouveau calque'); }
  });
  onDropFiles($('#stage'), async (files) => {
    for (const f of files) {
      if (/\.joeimg$/i.test(f.name)) await openProject(f);
      else if (f.type.startsWith('image/')) await (doc.isSample ? openImageFile(f) : importLayer(f));
      doc.isSample = false;
    }
  });
  window.addEventListener('resize', () => { if (doc) applyZoom(); });

  /* ---------------- Démarrage avec une image d'exemple ---------------- */
  function sampleDoc() {
    createDoc(1200, 800, 'exemple', null);
    const c = active().canvas.getContext('2d');
    const sky = c.createLinearGradient(0, 0, 0, 560); sky.addColorStop(0, '#2b3f73'); sky.addColorStop(0.55, '#d9861c'); sky.addColorStop(1, '#f6d58e');
    c.fillStyle = sky; c.fillRect(0, 0, 1200, 800);
    c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(820, 430, 90, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a3b22'; c.beginPath(); c.moveTo(0, 560);
    for (let x = 0; x <= 1200; x += 40) c.lineTo(x, 540 + Math.sin(x / 90) * 18);
    c.lineTo(1200, 800); c.lineTo(0, 800); c.fill();
    c.fillStyle = '#2d1c10'; // baobab
    c.fillRect(300, 380, 46, 190);
    c.beginPath(); c.ellipse(323, 370, 120, 34, 0, 0, Math.PI * 2); c.fill();
    [[-110, -30], [-60, -60], [0, -75], [70, -55], [115, -25]].forEach(([dx, dy]) => { c.beginPath(); c.ellipse(323 + dx, 360 + dy, 36, 18, dx / 200, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 28px "Segoe UI", sans-serif'; c.fillText('Image d\'exemple — ouvrez votre photo (Ctrl+O) ou déposez-la ici', 40, 60);
    active().name = 'Exemple'; doc.isSample = true;
    undoStack.length = 0; updateHistBtns(); refreshAll();
  }

  buildRail(); buildAdjust(); buildFilters(); initMenus();
  if (opts.shapeKind === undefined) opts.shapeKind = 'rect';
  sampleDoc(); setTool('brush');
  requestAnimationFrame(fit);

  window.PhotoJoe = { get doc() { return doc; }, act, setTool, adjustPixels, filterLayer, FILTERS, createDoc, get sel() { return sel; }, set sel(v) { sel = v; } };
})();
