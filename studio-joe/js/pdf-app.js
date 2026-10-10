/* PDF Joe — éditeur PDF local (fusion, réorganisation, annotation, signature, formulaires,
   filigrane, numérotation, division, compression, conversion). Basé sur pdf.js + pdf-lib. */
(function () {
  const { $, toast, download, pickFiles, baseName, initMenus, modal, confirmBox, store, onDropFiles, loadImage, readAsDataURL } = Studio;
  const { PDFDocument, StandardFonts, rgb, degrees, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

  const THUMB_W = 180;
  const sources = new Map(); // id -> {id, name, bytes, pjs, fields:[], values:{}}
  let pages = [];            // [{uid, src, index, rot, baseRot, w, h, overlays, thumb}]
  let selected = new Set();
  let lastClicked = null;
  let uidSeq = 1, srcSeq = 1;
  const undoStack = [], redoStack = [];

  /* ---------------- Historique ---------------- */
  const cloneState = () => pages.map((p) => ({ ...p, overlays: p.overlays.map((o) => ({ ...o })) }));
  function pushUndo() { undoStack.push(cloneState()); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; updateButtons(); }
  function undo() { if (!undoStack.length) return; redoStack.push(cloneState()); pages = undoStack.pop(); afterRestore(); }
  function redo() { if (!redoStack.length) return; undoStack.push(cloneState()); pages = redoStack.pop(); afterRestore(); }
  function afterRestore() {
    const ids = new Set(pages.map((p) => p.uid));
    selected = new Set([...selected].filter((u) => ids.has(u)));
    pages.forEach((p) => { p.thumb = null; });
    render(); pages.forEach(refreshThumb);
  }

  /* ---------------- Chargement ---------------- */
  async function addFiles(files) {
    if (!files.length) return;
    pushUndo();
    let added = 0;
    for (const f of files) {
      try {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) added += await addPdf(new Uint8Array(await f.arrayBuffer()), f.name);
        else if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)) added += await addPdf(await imageToPdf(f), f.name);
        else toast(`Format non pris en charge : ${f.name}`);
      } catch (e) {
        console.error(e); toast(`Impossible d'ouvrir ${f.name} : ${e.message || e}`, 5000);
      }
    }
    if ($('#outName').value === 'document' && files[0]) $('#outName').value = baseName(files[0].name);
    if (added) toast(`${added} page${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}`);
    render();
  }

  async function openPjs(bytes, name) {
    let password;
    for (;;) {
      try {
        return await pdfjsLib.getDocument({ data: bytes.slice(), password }).promise;
      } catch (e) {
        if (e && e.name === 'PasswordException') {
          password = await modal({
            title: `Mot de passe requis : ${name}`,
            body: '<div class="field"><label for="pw">Mot de passe du PDF</label><input type="text" id="pw" autocomplete="off"></div>',
            buttons: [{ label: 'Annuler', value: null }, { label: 'Déverrouiller', primary: true, value: (b) => b.querySelector('#pw').value }],
          });
          if (password == null) throw new Error('mot de passe non fourni');
        } else throw e;
      }
    }
  }

  async function addPdf(bytes, name) {
    let pjs = await openPjs(bytes, name);
    // pdf-lib ne sait pas déchiffrer : un PDF chiffré est converti en images pour rester éditable.
    let encrypted = false;
    try { await PDFDocument.load(bytes); } catch (e) { if (/encrypt/i.test(e.message)) encrypted = true; else throw e; }
    if (encrypted) {
      toast('PDF protégé : converti en pages images pour pouvoir le modifier.', 5000);
      bytes = await rasterize(pjs, 150, 0.85);
      pjs = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    }
    const id = srcSeq++;
    const src = { id, name, bytes, pjs, fields: [], values: {} };
    sources.set(id, src);
    await detectFields(src);
    for (let i = 0; i < pjs.numPages; i++) {
      const pg = await pjs.getPage(i + 1);
      const vp = pg.getViewport({ scale: 1 });
      const p = { uid: uidSeq++, src: id, index: i, rot: 0, baseRot: vp.rotation, w: vp.width, h: vp.height, overlays: [], thumb: null };
      pages.push(p);
    }
    render();
    pages.filter((p) => p.src === id).forEach(refreshThumb);
    return pjs.numPages;
  }

  function pageFormat() {
    const v = $('#imgPage').value;
    if (v === 'a4') return [595.28, 841.89];
    if (v === 'letter') return [612, 792];
    return null;
  }

  async function imageToPdf(file) {
    const doc = await PDFDocument.create();
    const url = await readAsDataURL(file);
    let img;
    if (/image\/jpe?g/.test(file.type)) img = await doc.embedJpg(await file.arrayBuffer());
    else if (file.type === 'image/png') img = await doc.embedPng(await file.arrayBuffer());
    else {
      const el = await loadImage(url);
      const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight;
      c.getContext('2d').drawImage(el, 0, 0);
      img = await doc.embedPng(await (await fetch(c.toDataURL('image/png'))).arrayBuffer());
    }
    const fmt = pageFormat();
    if (!fmt) {
      const pg = doc.addPage([img.width * 0.75, img.height * 0.75]);
      pg.drawImage(img, { x: 0, y: 0, width: img.width * 0.75, height: img.height * 0.75 });
    } else {
      let [W, H] = fmt;
      if (img.width > img.height) [W, H] = [H, W]; // paysage pour les images larges
      const m = 28.35, s = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height);
      const w = img.width * s, h = img.height * s;
      doc.addPage([W, H]).drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
    }
    return new Uint8Array(await doc.save());
  }

  async function addBlank() {
    const doc = await PDFDocument.create(); doc.addPage([595.28, 841.89]);
    pushUndo();
    const before = new Set(pages.map((p) => p.uid));
    await addPdf(new Uint8Array(await doc.save()), 'Page blanche');
    // place la page blanche après la sélection si elle existe
    const newP = pages.filter((p) => !before.has(p.uid));
    if (selected.size) {
      pages = pages.filter((p) => before.has(p.uid));
      const lastIdx = Math.max(...pages.map((p, i) => (selected.has(p.uid) ? i : -1)));
      pages.splice(lastIdx + 1, 0, ...newP);
      render();
    }
  }

  async function detectFields(src) {
    try {
      const doc = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
      const fields = doc.getForm().getFields();
      src.fields = fields.map((f) => {
        const d = { name: f.getName() };
        if (f instanceof PDFTextField) { d.kind = 'text'; d.value = f.getText() || ''; }
        else if (f instanceof PDFCheckBox) { d.kind = 'check'; d.value = f.isChecked(); }
        else if (f instanceof PDFDropdown || f instanceof PDFOptionList) { d.kind = 'select'; d.options = f.getOptions(); d.value = (f.getSelected() || [])[0] || ''; }
        else if (f instanceof PDFRadioGroup) { d.kind = 'select'; d.options = f.getOptions(); d.value = f.getSelected() || ''; }
        else d.kind = 'other';
        return d;
      }).filter((d) => d.kind !== 'other');
      src.fields.forEach((d) => { src.values[d.name] = d.value; });
    } catch (e) { src.fields = []; }
    renderForm();
  }

  function renderForm() {
    const box = $('#formFields'); box.innerHTML = '';
    let any = false;
    for (const src of sources.values()) {
      if (!src.fields.length || !pages.some((p) => p.src === src.id)) continue;
      any = true;
      const h = document.createElement('div'); h.className = 'badge'; h.textContent = src.name; box.appendChild(h);
      src.fields.forEach((d, i) => {
        const id = `ff_${src.id}_${i}`;
        const wrap = document.createElement('div'); wrap.className = d.kind === 'check' ? 'row' : 'field';
        let input;
        if (d.kind === 'text') { input = document.createElement('input'); input.type = 'text'; input.value = src.values[d.name]; input.oninput = () => { src.values[d.name] = input.value; }; }
        else if (d.kind === 'check') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!src.values[d.name]; input.onchange = () => { src.values[d.name] = input.checked; }; }
        else { input = document.createElement('select'); ['', ...d.options].forEach((o) => { const op = document.createElement('option'); op.value = o; op.textContent = o || '—'; input.appendChild(op); }); input.value = src.values[d.name]; input.onchange = () => { src.values[d.name] = input.value; }; }
        input.id = id;
        const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = d.name;
        if (d.kind === 'check') wrap.append(input, lab); else wrap.append(lab, input);
        box.appendChild(wrap);
      });
    }
    $('#formSection').hidden = !any;
  }

  /* ---------------- Vignettes ---------------- */
  async function renderPageCanvas(p, scale, withOverlays = true) {
    const src = sources.get(p.src);
    const pg = await src.pjs.getPage(p.index + 1);
    const vp = pg.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    if (withOverlays) { ctx.save(); ctx.scale(scale, scale); drawOverlays(ctx, p.overlays, null, {}); ctx.restore(); }
    return c;
  }
  function rotateCanvas(c, deg) {
    deg = ((deg % 360) + 360) % 360;
    if (!deg) return c;
    const r = document.createElement('canvas');
    const swap = deg % 180 !== 0;
    r.width = swap ? c.height : c.width; r.height = swap ? c.width : c.height;
    const ctx = r.getContext('2d');
    ctx.translate(r.width / 2, r.height / 2); ctx.rotate(deg * Math.PI / 180); ctx.drawImage(c, -c.width / 2, -c.height / 2);
    return r;
  }
  const thumbQueue = []; let thumbBusy = false;
  function refreshThumb(p) { p.thumb = null; thumbQueue.push(p); pumpThumbs(); }
  async function pumpThumbs() {
    if (thumbBusy) return; thumbBusy = true;
    while (thumbQueue.length) {
      const p = thumbQueue.shift();
      if (!pages.includes(p) && !pages.some((q) => q.uid === p.uid)) continue;
      try {
        const scale = THUMB_W / Math.max(p.w, p.h) * 1.3;
        const base = await renderPageCanvas(p, scale);
        pages.filter((q) => q.src === p.src && q.index === p.index).forEach((q) => {
          if (JSON.stringify(q.overlays) === JSON.stringify(p.overlays)) q.thumb = base;
        });
        p.thumb = base;
        updateThumbEls();
      } catch (e) { console.error(e); }
    }
    thumbBusy = false;
  }
  function updateThumbEls() {
    pages.forEach((p) => {
      const el = document.querySelector(`.pg[data-uid="${p.uid}"] .thumb`);
      if (!el || !p.thumb) return;
      const key = `${p.rot}|${p.thumb.width}|${p.overlays.length}`;
      if (el.dataset.key === key && el.firstChild && el.firstChild._src === p.thumb) return;
      const c = rotateCanvas(p.thumb, p.rot); c._src = p.thumb;
      el.innerHTML = ''; el.appendChild(c); el.dataset.key = key;
    });
  }

  /* ---------------- Rendu de la grille ---------------- */
  function render() {
    const grid = $('#pages');
    $('#empty').hidden = pages.length > 0; grid.hidden = pages.length === 0;
    const existing = new Map([...grid.children].map((el) => [+el.dataset.uid, el]));
    const frag = document.createDocumentFragment();
    pages.forEach((p, i) => {
      let el = existing.get(p.uid);
      if (!el) el = makePageEl(p);
      el.classList.toggle('sel', selected.has(p.uid));
      el.querySelector('.num').textContent = i + 1;
      const flags = el.querySelector('.flags'); flags.innerHTML = '';
      if (p.overlays.length) flags.insertAdjacentHTML('beforeend', `<span title="Annotations">✎ ${p.overlays.length}</span>`);
      if (p.rot) flags.insertAdjacentHTML('beforeend', `<span>${p.rot}°</span>`);
      frag.appendChild(el);
    });
    grid.innerHTML = ''; grid.appendChild(frag);
    updateThumbEls();
    $('#countLbl').textContent = `${pages.length} page${pages.length > 1 ? 's' : ''}${selected.size ? ` · ${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}` : ''}`;
    renderForm();
    updateButtons();
  }

  function makePageEl(p) {
    const el = document.createElement('div');
    el.className = 'pg'; el.dataset.uid = p.uid; el.draggable = true; el.tabIndex = 0;
    const src = sources.get(p.src);
    el.innerHTML = `<div class="thumb"></div><div class="meta"><b class="num"></b><span class="src" title="${escapeHtml(src.name)} — p. ${p.index + 1}">${escapeHtml(src.name)} · p.${p.index + 1}</span></div><div class="flags"></div>`;
    el.addEventListener('click', (e) => clickPage(p.uid, e));
    el.addEventListener('dblclick', () => editPage(p.uid));
    el.addEventListener('dragstart', (e) => {
      if (!selected.has(p.uid)) { selected = new Set([p.uid]); render(); }
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-page', String(p.uid));
      document.querySelectorAll('.pg.sel').forEach((x) => x.classList.add('dragging'));
    });
    el.addEventListener('dragend', () => document.querySelectorAll('.pg').forEach((x) => x.classList.remove('dragging', 'drop-before')));
    el.addEventListener('dragover', (e) => {
      if (!Array.from(e.dataTransfer.types).includes('text/x-page')) return;
      e.preventDefault(); document.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before')); el.classList.add('drop-before');
    });
    el.addEventListener('drop', (e) => {
      if (!Array.from(e.dataTransfer.types).includes('text/x-page')) return;
      e.preventDefault(); e.stopPropagation(); moveSelectionBefore(p.uid);
    });
    return el;
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function clickPage(uid, e) {
    if (e.shiftKey && lastClicked != null) {
      const a = pages.findIndex((p) => p.uid === lastClicked), b = pages.findIndex((p) => p.uid === uid);
      const [s, t] = a < b ? [a, b] : [b, a];
      for (let i = s; i <= t; i++) selected.add(pages[i].uid);
    } else if (e.ctrlKey || e.metaKey) {
      selected.has(uid) ? selected.delete(uid) : selected.add(uid);
    } else if (selected.size === 1 && selected.has(uid)) {
      selected.clear();
    } else selected = new Set([uid]);
    lastClicked = uid; render();
  }

  function moveSelectionBefore(targetUid) {
    if (selected.has(targetUid)) return;
    pushUndo();
    const moving = pages.filter((p) => selected.has(p.uid));
    const rest = pages.filter((p) => !selected.has(p.uid));
    const idx = targetUid == null ? rest.length : rest.findIndex((p) => p.uid === targetUid);
    rest.splice(idx, 0, ...moving); pages = rest; render();
  }
  $('#pages').addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('text/x-page')) e.preventDefault(); });
  $('#pages').addEventListener('drop', (e) => {
    if (!Array.from(e.dataTransfer.types).includes('text/x-page')) return;
    e.preventDefault(); moveSelectionBefore(null);
  });

  function targets() { return selected.size ? pages.filter((p) => selected.has(p.uid)) : []; }
  function needSel() { if (!selected.size) { toast('Sélectionnez d\'abord une ou plusieurs pages.'); return false; } return true; }

  function rotateSel(d) {
    if (!needSel()) return; pushUndo();
    targets().forEach((p) => { p.rot = (((p.rot + d) % 360) + 360) % 360; });
    render();
  }
  function moveSel(dir) {
    if (!needSel()) return; pushUndo();
    if (dir < 0) {
      for (let i = 1; i < pages.length; i++) if (selected.has(pages[i].uid) && !selected.has(pages[i - 1].uid)) [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]];
    } else {
      for (let i = pages.length - 2; i >= 0; i--) if (selected.has(pages[i].uid) && !selected.has(pages[i + 1].uid)) [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]];
    }
    render();
  }
  function dupSel() {
    if (!needSel()) return; pushUndo();
    const out = [];
    pages.forEach((p) => { out.push(p); if (selected.has(p.uid)) out.push({ ...p, uid: uidSeq++, overlays: p.overlays.map((o) => ({ ...o })) }); });
    pages = out; render();
  }
  async function delSel() {
    if (!needSel()) return;
    pushUndo();
    const n = selected.size;
    pages = pages.filter((p) => !selected.has(p.uid)); selected.clear(); render();
    toast(`${n} page${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''} — Ctrl+Z pour annuler`);
  }

  function updateButtons() {
    $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length;
    const none = !pages.length;
    ['#saveAllBtn', '#saveSelBtn', '#splitBtn', '#toImagesBtn', '#toTextBtn', '#compressBtn', '#flattenBtn'].forEach((s) => { $(s).disabled = none; });
  }

  /* ---------------- Géométrie : espace visuel (haut-gauche) -> espace PDF ---------------- */
  function boxOf(pg) {
    try { const b = pg.getCropBox(); return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }; }
    catch (e) { const s = pg.getSize(); return { x0: 0, y0: 0, x1: s.width, y1: s.height }; }
  }
  function toPdf(R, b, u, v) {
    switch (((R % 360) + 360) % 360) {
      case 90: return [b.x0 + v, b.y0 + u];
      case 180: return [b.x1 - u, b.y0 + v];
      case 270: return [b.x1 - v, b.y1 - u];
      default: return [b.x0 + u, b.y1 - v];
    }
  }
  function visualSize(R, b) { const W = b.x1 - b.x0, H = b.y1 - b.y0; return R % 180 ? [H, W] : [W, H]; }

  const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

  const FONT_MAP = { helv: StandardFonts.Helvetica, helvB: StandardFonts.HelveticaBold, times: StandardFonts.TimesRoman, timesB: StandardFonts.TimesRomanBold, courier: StandardFonts.Courier };
  const CSS_FONT = { helv: 'Helvetica, Arial, sans-serif', helvB: 'bold Helvetica, Arial, sans-serif', times: '"Times New Roman", Times, serif', timesB: 'bold "Times New Roman", Times, serif', courier: '"Courier New", Courier, monospace' };
  function cssFont(o) { const f = CSS_FONT[o.font || 'helv']; return f.startsWith('bold') ? `bold ${o.size}px ${f.slice(5)}` : `${o.size}px ${f}`; }

  // remplace les caractères que les polices standard PDF (WinAnsi) ne savent pas coder
  function sanitize(font, text) {
    const map = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', ' ': ' ', ' ': ' ', '✓': 'v', '✔': 'v' };
    let out = '';
    for (const ch of text) {
      const c = map[ch] ?? ch;
      try { font.widthOfTextAtSize(c, 10); out += c; } catch (e) { out += '?'; }
    }
    return out;
  }

  /* ---------------- Construction du PDF final ---------------- */
  function exportOptions() {
    return {
      wm: $('#wmOn').checked && $('#wmText').value.trim() ? { text: $('#wmText').value, size: +$('#wmSize').value, opacity: +$('#wmOpacity').value / 100, angle: +$('#wmAngle').value, color: $('#wmColor').value } : null,
      num: $('#numOn').checked ? { fmt: $('#numFmt').value, pos: $('#numPos').value, start: +$('#numStart').value || 0, size: +$('#numSize').value || 10, skip: +$('#numSkip').value || 0 } : null,
      hf: $('#hfOn').checked ? { header: $('#hdrText').value, footer: $('#ftrText').value } : null,
      title: $('#metaTitle').value.trim(), author: $('#metaAuthor').value.trim(),
    };
  }

  async function buildPdf(list, opts = exportOptions()) {
    const out = await PDFDocument.create();
    const libDocs = new Map();
    for (const p of list) {
      if (libDocs.has(p.src)) continue;
      const src = sources.get(p.src);
      const d = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
      if (src.fields.length) {
        const form = d.getForm();
        for (const f of src.fields) {
          try {
            const field = form.getField(f.name); const v = src.values[f.name];
            if (f.kind === 'text') field.setText(String(v || ''));
            else if (f.kind === 'check') (v ? field.check() : field.uncheck());
            else if (v) field.select(v);
          } catch (e) { console.warn('champ', f.name, e); }
        }
        try { form.flatten(); } catch (e) { console.warn('flatten', e); }
      }
      libDocs.set(p.src, d);
    }
    const fonts = {};
    const font = async (k) => (fonts[k] ||= await out.embedFont(FONT_MAP[k] || StandardFonts.Helvetica));
    const images = new Map();
    const image = async (url) => {
      if (!images.has(url)) {
        const bytes = await (await fetch(url)).arrayBuffer();
        images.set(url, /^data:image\/jpe?g/.test(url) ? await out.embedJpg(bytes) : await out.embedPng(bytes));
      }
      return images.get(url);
    };
    const total = list.length;
    const today = new Date().toLocaleDateString('fr-FR');

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const [pg] = await out.copyPages(libDocs.get(p.src), [p.index]);
      out.addPage(pg);
      const b = boxOf(pg);
      const R0 = p.baseRot;
      // annotations (exprimées dans l'espace visuel de la rotation d'origine)
      for (const o of p.overlays) await drawOverlayPdf(pg, b, R0, o, font, image);
      const R = (R0 + p.rot) % 360;
      pg.setRotation(degrees(R));
      const [VW, VH] = visualSize(R, b);
      if (opts.wm) {
        const f = await font('helvB'); const t = sanitize(f, opts.wm.text);
        const size = opts.wm.size, tw = f.widthOfTextAtSize(t, size);
        const ang = (opts.wm.angle + R) * Math.PI / 180;
        const [cx, cy] = toPdf(R, b, VW / 2, VH / 2);
        const x = cx - (tw / 2) * Math.cos(ang) + (size * 0.35) * Math.sin(ang);
        const y = cy - (tw / 2) * Math.sin(ang) - (size * 0.35) * Math.cos(ang);
        pg.drawText(t, { x, y, size, font: f, color: hexToRgb(opts.wm.color), opacity: opts.wm.opacity, rotate: degrees(opts.wm.angle + R) });
      }
      const putText = async (txt, pos, size) => {
        const f = await font('helv'); const t = sanitize(f, txt); const tw = f.widthOfTextAtSize(t, size);
        const m = 24;
        const u = pos[1] === 'l' ? m : pos[1] === 'r' ? VW - m - tw : (VW - tw) / 2;
        const v = pos[0] === 't' ? m + size * 0.8 : VH - m + size * 0.2;
        const [x, y] = toPdf(R, b, u, v);
        pg.drawText(t, { x, y, size, font: f, color: rgb(0.2, 0.2, 0.2), rotate: degrees(R) });
      };
      if (opts.num && i >= opts.num.skip) {
        const n = i - opts.num.skip + opts.num.start;
        const tot = total - opts.num.skip + opts.num.start - 1;
        await putText(opts.num.fmt.replace(/\{n\}/g, n).replace(/\{total\}/g, tot), opts.num.pos, opts.num.size);
      }
      if (opts.hf) {
        const sub = (s) => s.replace(/\{date\}/g, today).replace(/\{n\}/g, i + 1).replace(/\{total\}/g, total);
        if (opts.hf.header.trim()) await putText(sub(opts.hf.header), opts.num && opts.num.pos === 'tc' ? 'tl' : 'tc', 9);
        if (opts.hf.footer.trim()) await putText(sub(opts.hf.footer), opts.num && opts.num.pos === 'bc' ? 'bl' : 'bc', 9);
      }
    }
    if (opts.title) out.setTitle(opts.title);
    if (opts.author) out.setAuthor(opts.author);
    out.setProducer('PDF Joe'); out.setCreator('Studio Joe');
    return out.save();
  }

  async function drawOverlayPdf(pg, b, R, o, font, image) {
    const col = hexToRgb(o.color || '#000000');
    const op = o.opacity ?? 1;
    const rect = () => {
      const [ax, ay] = toPdf(R, b, o.x, o.y), [bx, by] = toPdf(R, b, o.x + o.w, o.y + o.h);
      return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
    };
    const line = (u1, v1, u2, v2, th) => pg.drawLine({ start: pt(u1, v1), end: pt(u2, v2), thickness: th, color: col, opacity: op });
    const pt = (u, v) => { const [x, y] = toPdf(R, b, u, v); return { x, y }; };
    switch (o.type) {
      case 'text': case 'date': {
        const f = await font(o.font || 'helv'); const lh = o.size * 1.2;
        o.text.split('\n').forEach((ln, i) => {
          const [x, y] = toPdf(R, b, o.x, o.y + o.size * 0.85 + i * lh);
          pg.drawText(sanitize(f, ln), { x, y, size: o.size, font: f, color: col, opacity: op, rotate: degrees(R) });
        });
        break;
      }
      case 'rect': pg.drawRectangle({ ...rect(), borderColor: col, borderWidth: o.stroke || 2, borderOpacity: op }); break;
      case 'fill': pg.drawRectangle({ ...rect(), color: col, opacity: op }); break;
      case 'highlight': pg.drawRectangle({ ...rect(), color: col, opacity: 0.35 }); break;
      case 'whiteout': pg.drawRectangle({ ...rect(), color: rgb(1, 1, 1), opacity: 1 }); break;
      case 'line': line(o.x, o.y, o.x + o.w, o.y + o.h, o.stroke || 2); break;
      case 'check': line(o.x + o.w * 0.1, o.y + o.h * 0.55, o.x + o.w * 0.4, o.y + o.h * 0.85, Math.max(1.5, o.w / 8)); line(o.x + o.w * 0.4, o.y + o.h * 0.85, o.x + o.w * 0.92, o.y + o.h * 0.15, Math.max(1.5, o.w / 8)); break;
      case 'cross': line(o.x, o.y, o.x + o.w, o.y + o.h, Math.max(1.5, o.w / 8)); line(o.x + o.w, o.y, o.x, o.y + o.h, Math.max(1.5, o.w / 8)); break;
      case 'image': {
        const img = await image(o.src); const [x, y] = toPdf(R, b, o.x, o.y + o.h);
        pg.drawImage(img, { x, y, width: o.w, height: o.h, rotate: degrees(R), opacity: op });
        break;
      }
    }
  }

  /* ---------------- Exports ---------------- */
  async function busy(label, fn) {
    toast(label + '…', 60000);
    document.body.style.cursor = 'progress';
    try { return await fn(); }
    catch (e) { console.error(e); toast('Erreur : ' + (e.message || e), 6000); }
    finally { document.body.style.cursor = ''; }
  }
  const outName = () => ($('#outName').value.trim() || 'document').replace(/[\\/:*?"<>|]/g, '_');

  async function saveAll() {
    if (!pages.length) return;
    await busy('Création du PDF', async () => {
      const bytes = await buildPdf(pages);
      download(new Blob([bytes], { type: 'application/pdf' }), outName() + '.pdf');
      toast(`PDF enregistré (${fmtSize(bytes.length)})`);
    });
  }
  async function saveSel() {
    if (!needSel()) return;
    await busy('Création du PDF', async () => {
      const bytes = await buildPdf(targets());
      download(new Blob([bytes], { type: 'application/pdf' }), outName() + '-extrait.pdf');
      toast(`PDF enregistré (${fmtSize(bytes.length)})`);
    });
  }
  const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';

  function parseRanges(str, max) {
    const groups = [];
    for (const part of str.split(/[;,]/)) {
      const s = part.trim(); if (!s) continue;
      const m = s.match(/^(\d+)\s*(?:-\s*(\d+|fin))?$/i);
      if (!m) throw new Error(`plage invalide « ${s} »`);
      const a = +m[1], bb = m[2] ? (/fin/i.test(m[2]) ? max : +m[2]) : a;
      if (a < 1 || bb > max || a > bb) throw new Error(`plage hors limites « ${s} » (1 à ${max})`);
      groups.push(Array.from({ length: bb - a + 1 }, (_, k) => a - 1 + k));
    }
    return groups;
  }

  async function split() {
    if (!pages.length) return;
    const res = await modal({
      title: 'Diviser le document',
      body: `<div class="field"><label for="spMode">Méthode</label>
        <select id="spMode"><option value="each">Une page par fichier</option><option value="every">Toutes les N pages</option><option value="ranges">Plages personnalisées</option></select></div>
        <div class="field"><label for="spN">N (pour « toutes les N pages »)</label><input type="number" id="spN" value="2" min="1"></div>
        <div class="field"><label for="spRanges">Plages (ex. 1-3, 4-7, 8-fin)</label><input type="text" id="spRanges" placeholder="1-3, 4-7, 8-fin"></div>
        <p class="hint">${pages.length} pages. Les fichiers sont regroupés dans une archive ZIP.</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Diviser', primary: true, value: (b) => ({ mode: b.querySelector('#spMode').value, n: +b.querySelector('#spN').value, ranges: b.querySelector('#spRanges').value }) }],
    });
    if (!res) return;
    await busy('Division', async () => {
      let groups;
      const N = pages.length;
      if (res.mode === 'each') groups = pages.map((_, i) => [i]);
      else if (res.mode === 'every') { const n = Math.max(1, res.n | 0); groups = []; for (let i = 0; i < N; i += n) groups.push(Array.from({ length: Math.min(n, N - i) }, (_, k) => i + k)); }
      else groups = parseRanges(res.ranges, N);
      if (!groups.length) throw new Error('aucune plage');
      const full = await PDFDocument.load(await buildPdf(pages));
      const zip = new JSZip();
      for (const g of groups) {
        const d = await PDFDocument.create();
        (await d.copyPages(full, g)).forEach((pg) => d.addPage(pg));
        const label = g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`;
        zip.file(`${outName()}_${label}.pdf`, await d.save());
      }
      download(await zip.generateAsync({ type: 'blob' }), `${outName()}_divise.zip`);
      toast(`${groups.length} fichiers créés`);
    });
  }

  async function rasterize(pjs, dpi, quality, onlyIdx) {
    const out = await PDFDocument.create();
    const n = pjs.numPages;
    for (let i = 1; i <= n; i++) {
      if (onlyIdx && !onlyIdx.includes(i - 1)) continue;
      const pg = await pjs.getPage(i);
      const vp1 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: dpi / 72 });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
      const img = await out.embedJpg(await blob.arrayBuffer());
      out.addPage([vp1.width, vp1.height]).drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    }
    return new Uint8Array(await out.save());
  }

  async function compress(flatten = false) {
    if (!pages.length) return;
    const res = await modal({
      title: flatten ? 'Aplatir en images' : 'Compresser le PDF',
      body: `<div class="field"><label for="cmpLevel">Niveau</label>
        <select id="cmpLevel">
          <option value="72|0.5">Forte (72 ppp) — écran, e-mail</option>
          <option value="110|0.65" selected>Équilibrée (110 ppp)</option>
          <option value="150|0.75">Légère (150 ppp) — impression correcte</option>
          <option value="200|0.85">Qualité (200 ppp)</option>
        </select></div>
        <p class="hint">${flatten ? 'Chaque page devient une image : le texte ne peut plus être copié ni modifié.' : 'Idéal pour les documents scannés. Les pages sont transformées en images JPEG ; le texte ne sera plus sélectionnable.'}</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: flatten ? 'Aplatir' : 'Compresser', primary: true, value: (b) => b.querySelector('#cmpLevel').value }],
    });
    if (!res) return;
    const [dpi, q] = res.split('|').map(Number);
    await busy(flatten ? 'Aplatissement' : 'Compression', async () => {
      const orig = await buildPdf(pages);
      const pjs = await pdfjsLib.getDocument({ data: orig.slice() }).promise;
      const bytes = await rasterize(pjs, dpi, q);
      download(new Blob([bytes], { type: 'application/pdf' }), outName() + (flatten ? '-image.pdf' : '-compresse.pdf'));
      const gain = Math.round((1 - bytes.length / orig.length) * 100);
      toast(`${fmtSize(orig.length)} → ${fmtSize(bytes.length)}${gain > 0 ? ` (−${gain} %)` : ''}`, 5000);
    });
  }

  async function toImages() {
    if (!pages.length) return;
    const res = await modal({
      title: 'Convertir en images',
      body: `<div class="grid2"><div class="field"><label for="imFmt">Format</label><select id="imFmt"><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></div>
        <div class="field"><label for="imDpi">Résolution</label><select id="imDpi"><option value="96">96 ppp (écran)</option><option value="150" selected>150 ppp</option><option value="300">300 ppp (impression)</option></select></div></div>
        <label class="row"><input type="checkbox" id="imSel" ${selected.size ? 'checked' : 'disabled'}> Seulement les pages sélectionnées</label>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Convertir', primary: true, value: (b) => ({ fmt: b.querySelector('#imFmt').value, dpi: +b.querySelector('#imDpi').value, sel: b.querySelector('#imSel').checked }) }],
    });
    if (!res) return;
    await busy('Conversion', async () => {
      const bytes = await buildPdf(pages);
      const pjs = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const idx = res.sel ? pages.map((p, i) => (selected.has(p.uid) ? i : -1)).filter((i) => i >= 0) : pages.map((_, i) => i);
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[res.fmt];
      const blobs = [];
      for (const i of idx) {
        const pg = await pjs.getPage(i + 1); const vp = pg.getViewport({ scale: res.dpi / 72 });
        const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        blobs.push([`${outName()}_p${i + 1}.${ext}`, await new Promise((r) => c.toBlob(r, res.fmt, 0.92))]);
      }
      if (blobs.length === 1) download(blobs[0][1], blobs[0][0]);
      else { const zip = new JSZip(); blobs.forEach(([n, b]) => zip.file(n, b)); download(await zip.generateAsync({ type: 'blob' }), `${outName()}_images.zip`); }
      toast(`${blobs.length} image${blobs.length > 1 ? 's' : ''} créée${blobs.length > 1 ? 's' : ''}`);
    });
  }

  async function toText() {
    if (!pages.length) return;
    let text = '';
    await busy('Extraction du texte', async () => {
      const bytes = await buildPdf(pages, { wm: null, num: null, hf: null });
      const pjs = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      for (let i = 1; i <= pjs.numPages; i++) {
        const tc = await (await pjs.getPage(i)).getTextContent();
        let s = ''; tc.items.forEach((it) => { s += it.str + (it.hasEOL ? '\n' : ''); });
        text += `--- Page ${i} ---\n${s.trim()}\n\n`;
      }
      toast('Texte extrait', 1500);
    });
    if (!text) return;
    const empty = !text.replace(/--- Page \d+ ---/g, '').trim();
    const v = await modal({
      title: 'Texte extrait', wide: true,
      body: `${empty ? '<p class="hint">Aucun texte trouvé : ce document est probablement scanné (images).</p>' : ''}<textarea class="textout" id="txtOut" aria-label="Texte extrait"></textarea>`,
      onOpen: (b) => { b.querySelector('#txtOut').value = text; },
      buttons: [{ label: 'Copier', value: 'copy' }, { label: 'Télécharger .txt', primary: true, value: 'dl' }],
    });
    if (v === 'dl') download(new Blob([text], { type: 'text/plain;charset=utf-8' }), outName() + '.txt');
    if (v === 'copy') navigator.clipboard.writeText(text).then(() => toast('Texte copié'), () => toast('Copie refusée par le navigateur'));
  }

  /* ---------------- Dessin des annotations (éditeur + vignettes) ---------------- */
  function drawOverlays(ctx, list, sel, imgs) {
    for (const o of list) {
      ctx.save();
      ctx.globalAlpha = o.opacity ?? 1;
      ctx.strokeStyle = ctx.fillStyle = o.color || '#000';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      switch (o.type) {
        case 'text': case 'date':
          ctx.font = cssFont(o); ctx.textBaseline = 'alphabetic';
          o.text.split('\n').forEach((ln, i) => ctx.fillText(ln, o.x, o.y + o.size * 0.85 + i * o.size * 1.2));
          break;
        case 'rect': ctx.lineWidth = o.stroke || 2; ctx.strokeRect(o.x, o.y, o.w, o.h); break;
        case 'fill': ctx.fillRect(o.x, o.y, o.w, o.h); break;
        case 'highlight': ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(o.x, o.y, o.w, o.h); break;
        case 'whiteout': ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillRect(o.x, o.y, o.w, o.h); break;
        case 'line': ctx.lineWidth = o.stroke || 2; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.stroke(); break;
        case 'check': ctx.lineWidth = Math.max(1.5, o.w / 8); ctx.beginPath(); ctx.moveTo(o.x + o.w * 0.1, o.y + o.h * 0.55); ctx.lineTo(o.x + o.w * 0.4, o.y + o.h * 0.85); ctx.lineTo(o.x + o.w * 0.92, o.y + o.h * 0.15); ctx.stroke(); break;
        case 'cross': ctx.lineWidth = Math.max(1.5, o.w / 8); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.moveTo(o.x + o.w, o.y); ctx.lineTo(o.x, o.y + o.h); ctx.stroke(); break;
        case 'image': {
          let im = imgs[o.src];
          if (!im) { im = new Image(); im.src = o.src; imgs[o.src] = im; }
          if (im.complete) ctx.drawImage(im, o.x, o.y, o.w, o.h);
          break;
        }
      }
      ctx.restore();
    }
  }

  function measureText(o) {
    const c = measureText.c ||= document.createElement('canvas').getContext('2d');
    c.font = cssFont(o);
    const lines = o.text.split('\n');
    o.w = Math.max(10, ...lines.map((l) => c.measureText(l).width));
    o.h = o.size * 1.2 * lines.length;
  }

  /* ---------------- Éditeur de page ---------------- */
  async function editPage(uid) {
    if (uid == null) { if (!needSel()) return; uid = [...selected][0]; }
    const p = pages.find((q) => q.uid === uid); if (!p) return;
    let objs = p.overlays.map((o) => ({ ...o }));
    let tool = 'select', sel = null, scale = 1, drag = null;
    const imgs = {};
    const prefs = store('pdfjoe-prefs') || { color: '#1a3d8f', size: 14, font: 'helv' };

    const body = document.createElement('div');
    body.className = 'ed';
    const T = (id, title, svg) => `<button class="tool" data-tool="${id}" title="${title}"><svg viewBox="0 0 24 24">${svg}</svg></button>`;
    body.innerHTML = `
      <div class="tools">
        ${T('select', 'Sélection / déplacer (V)', '<path d="m5 3 14 8-6 2-3 6z"/>')}
        ${T('text', 'Texte (T)', '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>')}
        ${T('sign', 'Signature', '<path d="M3 17c3-6 5-9 7-9s-2 9 1 9 3-5 5-5 1 4 5 4"/><path d="M3 21h18"/>')}
        ${T('image', 'Image / tampon', '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 7"/>')}
        ${T('date', 'Date du jour', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>')}
        ${T('check', 'Coche ✓', '<path d="m5 12 4 4 10-10"/>')}
        ${T('cross', 'Croix ✗', '<path d="M6 6l12 12M18 6 6 18"/>')}
        ${T('highlight', 'Surligner', '<path d="m9 15-3 3h5l1-1M9 15l7-7 3 3-7 7z"/>')}
        ${T('rect', 'Cadre', '<rect x="4" y="6" width="16" height="12"/>')}
        ${T('fill', 'Rectangle plein (caviarder)', '<rect x="4" y="6" width="16" height="12" fill="currentColor"/>')}
        ${T('whiteout', 'Effaceur blanc (masquer)', '<path d="M7 20h10M5 14l7-9 7 9-4 4H9z"/>')}
        ${T('line', 'Trait', '<path d="M4 20 20 4"/>')}
      </div>
      <div class="area"><div class="paper"><canvas class="pc"></canvas><canvas class="oc" style="touch-action:none"></canvas></div></div>
      <div class="props">
        <div class="section">
          <h3>Style</h3>
          <div class="row"><input type="color" id="edColor" value="${prefs.color}" aria-label="Couleur"><div class="field" style="flex:1"><label for="edFont">Police</label>
            <select id="edFont"><option value="helv">Helvetica</option><option value="helvB">Helvetica gras</option><option value="times">Times</option><option value="timesB">Times gras</option><option value="courier">Courier</option></select></div></div>
          <div class="grid2">
            <div class="field"><label for="edSize">Taille texte</label><input type="number" id="edSize" min="4" max="200" value="${prefs.size}"></div>
            <div class="field"><label for="edOpacity">Opacité %</label><input type="number" id="edOpacity" min="5" max="100" value="100"></div>
          </div>
          <div class="field"><label for="edText">Texte de l'élément</label><textarea id="edText" placeholder="Saisissez votre texte"></textarea></div>
        </div>
        <div class="section">
          <h3>Élément sélectionné</h3>
          <div class="row"><button id="edDup">Dupliquer</button><button id="edFront">Premier plan</button><button id="edDel" class="danger">Supprimer</button></div>
          <p class="hint" id="edInfo">Aucun élément sélectionné.</p>
        </div>
        <div class="section">
          <h3>Affichage</h3>
          <div class="row"><button id="edZo">−</button><span class="badge" id="edZoom">100 %</span><button id="edZi">+</button><button id="edFit">Ajuster</button></div>
          <p class="hint">Glissez pour dessiner un cadre, un surlignage ou un masque. Coin bas-droit d'un élément : redimensionner. Suppr : effacer l'élément.${p.rot ? ' La page est affichée sans la rotation ajoutée ; vos annotations tourneront avec elle.' : ''}</p>
        </div>
      </div>`;

    const pc = body.querySelector('.pc'), oc = body.querySelector('.oc'), paper = body.querySelector('.paper'), area = body.querySelector('.area');
    const ctx = oc.getContext('2d');
    const q = (s) => body.querySelector(s);
    q('#edFont').value = prefs.font;

    let renderTask = 0;
    async function drawPage() {
      const my = ++renderTask;
      const dpr = window.devicePixelRatio || 1;
      const c = await renderPageCanvas(p, scale * dpr, false);
      if (my !== renderTask) return;
      [pc, oc].forEach((cv) => { cv.width = c.width; cv.height = c.height; cv.style.width = p.w * scale + 'px'; cv.style.height = p.h * scale + 'px'; });
      paper.style.width = p.w * scale + 'px'; paper.style.height = p.h * scale + 'px';
      pc.getContext('2d').drawImage(c, 0, 0);
      q('#edZoom').textContent = Math.round(scale * 100) + ' %';
      draw();
    }
    function draw() {
      const dpr = oc.width / (p.w * scale);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, oc.width, oc.height);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      drawOverlays(ctx, objs, sel, imgs);
      if (drag && drag.mode === 'new' && drag.preview) drawOverlays(ctx, [drag.preview], null, imgs);
      if (sel) {
        ctx.save(); ctx.strokeStyle = '#d9861c'; ctx.lineWidth = 1 / scale; ctx.setLineDash([4 / scale, 3 / scale]);
        const bx = normBox(sel); ctx.strokeRect(bx.x - 2, bx.y - 2, bx.w + 4, bx.h + 4); ctx.setLineDash([]);
        ctx.fillStyle = '#d9861c'; const hs = 8 / scale; ctx.fillRect(bx.x + bx.w + 2 - hs / 2, bx.y + bx.h + 2 - hs / 2, hs, hs);
        ctx.restore();
      }
    }
    Object.values(imgs).forEach((im) => { im.onload = draw; });
    const normBox = (o) => ({ x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) });
    function hit(x, y) {
      for (let i = objs.length - 1; i >= 0; i--) {
        const bx = normBox(objs[i]); const m = 4 / scale;
        if (x >= bx.x - m && x <= bx.x + bx.w + m && y >= bx.y - m && y <= bx.y + bx.h + m) return objs[i];
      }
      return null;
    }
    function onHandle(o, x, y) { const bx = normBox(o); const hs = 12 / scale; return Math.abs(x - (bx.x + bx.w + 2)) < hs && Math.abs(y - (bx.y + bx.h + 2)) < hs; }
    const pos = (e) => { const r = oc.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };

    function setTool(t) { tool = t; body.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t)); oc.style.cursor = t === 'select' ? 'default' : 'crosshair'; }
    function select(o) {
      sel = o;
      q('#edInfo').textContent = o ? `${labelOf(o.type)} · ${Math.round(Math.abs(o.w))} × ${Math.round(Math.abs(o.h))} pt` : 'Aucun élément sélectionné.';
      if (o) {
        if (o.color) q('#edColor').value = o.color;
        q('#edOpacity').value = Math.round((o.opacity ?? 1) * 100);
        if (o.type === 'text' || o.type === 'date') { q('#edText').value = o.text; q('#edSize').value = o.size; q('#edFont').value = o.font || 'helv'; }
      }
      draw();
    }
    const labelOf = (t) => ({ text: 'Texte', date: 'Date', image: 'Image', rect: 'Cadre', fill: 'Rectangle plein', highlight: 'Surlignage', whiteout: 'Masque blanc', line: 'Trait', check: 'Coche', cross: 'Croix' }[t] || t);
    const style = () => ({ color: q('#edColor').value, opacity: (+q('#edOpacity').value || 100) / 100 });

    async function addImage(src, x, y, maxW = 180) {
      const im = await loadImage(src); imgs[src] = im;
      const s = Math.min(1, maxW / im.naturalWidth, 120 / im.naturalHeight * (maxW / 180));
      const w = im.naturalWidth * s, h = im.naturalHeight * s;
      const o = { type: 'image', src, x: x ?? (p.w - w) / 2, y: y ?? (p.h - h) / 2, w, h, opacity: 1 };
      objs.push(o); setTool('select'); select(o);
    }

    oc.addEventListener('pointerdown', async (e) => {
      oc.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      if (tool === 'select') {
        if (sel && onHandle(sel, x, y)) { drag = { mode: 'resize', o: sel, x, y, ow: sel.w, oh: sel.h, os: sel.size, ratio: sel.w / sel.h }; return; }
        const o = hit(x, y); select(o);
        if (o) drag = { mode: 'move', o, dx: x - o.x, dy: y - o.y };
        return;
      }
      if (tool === 'text' || tool === 'date') {
        const txt = tool === 'date' ? new Date().toLocaleDateString('fr-FR') : (q('#edText').value.trim() && !sel ? q('#edText').value : 'Texte');
        const o = { type: tool, text: txt, x, y: y - (+q('#edSize').value) * 0.6, size: +q('#edSize').value || 14, font: q('#edFont').value, ...style() };
        measureText(o); objs.push(o); setTool('select'); select(o);
        if (tool === 'text') { q('#edText').focus(); q('#edText').select(); }
        return;
      }
      if (tool === 'check' || tool === 'cross') {
        const s = +q('#edSize').value || 14;
        const o = { type: tool, x: x - s / 2, y: y - s / 2, w: s, h: s, ...style() };
        objs.push(o); select(o); return;
      }
      if (tool === 'sign') { const src = await signatureDialog(); if (src) addImage(src, x - 90, y - 30); return; }
      if (tool === 'image') {
        const [f] = await pickFiles('image/*', false); if (!f) return;
        const im = await loadImage(await readAsDataURL(f));
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0);
        const isJpg = /jpe?g/.test(f.type);
        addImage(c.toDataURL(isJpg ? 'image/jpeg' : 'image/png', 0.9), x, y, 220);
        return;
      }
      drag = { mode: 'new', x, y, preview: { type: tool, x, y, w: 0, h: 0, stroke: 2, ...style() } };
    });
    oc.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e);
      if (!drag) { if (tool === 'select') oc.style.cursor = sel && onHandle(sel, x, y) ? 'nwse-resize' : hit(x, y) ? 'move' : 'default'; return; }
      if (drag.mode === 'move') { drag.o.x = x - drag.dx; drag.o.y = y - drag.dy; }
      else if (drag.mode === 'resize') {
        const o = drag.o;
        if (o.type === 'text' || o.type === 'date') { o.size = Math.max(4, drag.os * (drag.ow + (x - drag.x)) / drag.ow); measureText(o); q('#edSize').value = Math.round(o.size); }
        else if (o.type === 'image' || o.type === 'check' || o.type === 'cross') { o.w = Math.max(6, drag.ow + (x - drag.x)); o.h = o.w / drag.ratio; }
        else { o.w = drag.ow + (x - drag.x); o.h = drag.oh + (y - drag.y); }
      } else if (drag.mode === 'new') {
        drag.preview.w = x - drag.x; drag.preview.h = y - drag.y;
        if (e.shiftKey && drag.preview.type === 'line') { if (Math.abs(drag.preview.w) > Math.abs(drag.preview.h)) drag.preview.h = 0; else drag.preview.w = 0; }
      }
      draw();
    });
    oc.addEventListener('pointerup', () => {
      if (drag && drag.mode === 'new') {
        const o = drag.preview;
        if (Math.abs(o.w) > 3 || Math.abs(o.h) > 3) {
          if (o.type !== 'line') { const b = normBox(o); Object.assign(o, b); }
          objs.push(o); select(o);
        }
      }
      if (drag && drag.mode === 'resize' && drag.o.type !== 'line') { const b = normBox(drag.o); Object.assign(drag.o, b); }
      drag = null; draw();
    });

    const applyStyle = () => {
      if (!sel) return;
      Object.assign(sel, style());
      if (sel.type === 'text' || sel.type === 'date') { sel.size = +q('#edSize').value || sel.size; sel.font = q('#edFont').value; measureText(sel); }
      if (sel.type === 'check' || sel.type === 'cross') { sel.w = sel.h = +q('#edSize').value || sel.w; }
      draw();
    };
    ['#edColor', '#edOpacity', '#edSize', '#edFont'].forEach((s) => q(s).addEventListener('input', () => {
      applyStyle(); store('pdfjoe-prefs', { color: q('#edColor').value, size: +q('#edSize').value, font: q('#edFont').value });
    }));
    q('#edText').addEventListener('input', () => { if (sel && (sel.type === 'text' || sel.type === 'date')) { sel.text = q('#edText').value || ' '; measureText(sel); draw(); } });
    q('#edDel').onclick = () => { if (sel) { objs = objs.filter((o) => o !== sel); select(null); } };
    q('#edDup').onclick = () => { if (sel) { const o = { ...sel, x: sel.x + 12, y: sel.y + 12 }; objs.push(o); select(o); } };
    q('#edFront').onclick = () => { if (sel) { objs = objs.filter((o) => o !== sel).concat(sel); draw(); } };
    body.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    const fit = () => { scale = Math.min(2.5, Math.max(0.3, (area.clientWidth - 32) / p.w)); drawPage(); };
    q('#edZi').onclick = () => { scale = Math.min(4, scale * 1.25); drawPage(); };
    q('#edZo').onclick = () => { scale = Math.max(0.25, scale / 1.25); drawPage(); };
    q('#edFit').onclick = fit;
    const keyH = (e) => {
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); objs = objs.filter((o) => o !== sel); select(null); }
      const k = { v: 'select', t: 'text' }[e.key.toLowerCase()]; if (k && !e.ctrlKey && !e.metaKey) setTool(k);
      if (sel && e.key.startsWith('Arrow')) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; if (e.key === 'ArrowLeft') sel.x -= d; if (e.key === 'ArrowRight') sel.x += d; if (e.key === 'ArrowUp') sel.y -= d; if (e.key === 'ArrowDown') sel.y += d; draw(); }
    };
    document.addEventListener('keydown', keyH, true);
    setTool('select');

    const pIdx = pages.indexOf(p) + 1;
    const result = modal({
      title: `Annoter et signer — page ${pIdx}`, wide: true, body,
      buttons: [{ label: 'Annuler', value: false }, { label: 'Appliquer', primary: true, value: true }],
      onOpen: (b) => { b.parentElement.classList.add('editor'); requestAnimationFrame(fit); },
    });
    const ok = await result;
    document.removeEventListener('keydown', keyH, true);
    if (ok) {
      pushUndo();
      p.overlays = objs.filter((o) => !(o.type === 'text' && !o.text.trim()));
      render(); refreshThumb(p);
    }
  }

  /* ---------------- Signature ---------------- */
  async function signatureDialog() {
    const saved = store('pdfjoe-signatures') || [];
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="row"><button data-m="draw" class="primary">Dessiner</button><button data-m="type">Écrire</button><button data-m="upload">Importer une image</button></div>
      <div data-p="draw" style="display:grid; gap:8px">
        <canvas class="sigpad" width="900" height="300" aria-label="Zone de signature"></canvas>
        <div class="row"><input type="color" id="sgColor" value="#0b2a7a" aria-label="Couleur de l'encre"><label for="sgWidth">Épaisseur</label><input type="range" id="sgWidth" min="1" max="8" value="3" style="width:120px"><button id="sgClear">Effacer</button></div>
      </div>
      <div data-p="type" hidden style="display:grid; gap:8px">
        <div class="field"><label for="sgName">Votre nom</label><input type="text" id="sgName" placeholder="Prénom Nom"></div>
        <canvas class="sigpad" id="sgTyped" width="900" height="300" aria-label="Aperçu"></canvas>
      </div>
      <div data-p="upload" hidden><p class="hint">Choisissez une photo de votre signature sur papier blanc : le fond blanc sera rendu transparent.</p><button id="sgUp">Choisir une image…</button><canvas class="sigpad" id="sgUpC" width="900" height="300" hidden></canvas></div>
      ${saved.length ? '<div class="field"><label>Signatures enregistrées (cliquez pour utiliser)</label><div class="sig-list"></div></div>' : ''}
      <label class="row"><input type="checkbox" id="sgSave" checked> Mémoriser cette signature sur cet appareil</label>`;
    let mode = 'draw', chosen = null;
    const pad = body.querySelector('[data-p="draw"] canvas'), pctx = pad.getContext('2d');
    let drawing = false, last = null, dirty = false;
    const pp = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    pad.addEventListener('pointerdown', (e) => { drawing = true; last = pp(e); pad.setPointerCapture(e.pointerId); });
    pad.addEventListener('pointermove', (e) => {
      if (!drawing) return; const pt = pp(e);
      pctx.strokeStyle = body.querySelector('#sgColor').value; pctx.lineWidth = +body.querySelector('#sgWidth').value * 2.2 * (e.pressure && e.pointerType === 'pen' ? 0.5 + e.pressure : 1);
      pctx.lineCap = pctx.lineJoin = 'round'; pctx.beginPath(); pctx.moveTo(...last); pctx.lineTo(...pt); pctx.stroke(); last = pt; dirty = true;
    });
    pad.addEventListener('pointerup', () => { drawing = false; });
    body.querySelector('#sgClear').onclick = () => { pctx.clearRect(0, 0, pad.width, pad.height); dirty = false; };
    const typed = body.querySelector('#sgTyped'), tctx = typed.getContext('2d');
    const drawTyped = () => {
      tctx.clearRect(0, 0, typed.width, typed.height);
      tctx.fillStyle = body.querySelector('#sgColor').value;
      tctx.font = 'italic 110px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'; tctx.textBaseline = 'middle';
      tctx.fillText(body.querySelector('#sgName').value, 30, 150, 840);
    };
    body.querySelector('#sgName').addEventListener('input', drawTyped);
    const upC = body.querySelector('#sgUpC');
    body.querySelector('#sgUp').onclick = async () => {
      const [f] = await pickFiles('image/*', false); if (!f) return;
      const im = await loadImage(await readAsDataURL(f));
      const s = Math.min(1, 1600 / im.naturalWidth); upC.width = im.naturalWidth * s; upC.height = im.naturalHeight * s;
      const c = upC.getContext('2d'); c.drawImage(im, 0, 0, upC.width, upC.height);
      const d = c.getImageData(0, 0, upC.width, upC.height), a = d.data;
      for (let i = 0; i < a.length; i += 4) { const l = (a[i] + a[i + 1] + a[i + 2]) / 3; a[i + 3] = l > 200 ? 0 : l > 150 ? Math.round((200 - l) * 5.1) : 255; }
      c.putImageData(d, 0, 0); upC.hidden = false;
    };
    body.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
      mode = b.dataset.m;
      body.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('primary', x === b));
      body.querySelectorAll('[data-p]').forEach((x) => { x.hidden = x.dataset.p !== mode; });
    });
    const list = body.querySelector('.sig-list');
    let closeFn;
    if (list) saved.forEach((src, i) => {
      const b = document.createElement('button'); b.innerHTML = `<img src="${src}" alt="Signature ${i + 1}">`; b.title = 'Utiliser';
      b.onclick = () => { chosen = src; closeFn && closeFn(); };
      list.appendChild(b);
    });
    const res = await modal({
      title: 'Signature', body,
      onOpen: (b) => { closeFn = () => b.closest('.modal').querySelector('footer .primary').click(); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: () => 'ok' }],
    });
    if (!res) return null;
    if (chosen) return chosen;
    const srcC = mode === 'draw' ? (dirty ? pad : null) : mode === 'type' ? (body.querySelector('#sgName').value.trim() ? typed : null) : (upC.hidden ? null : upC);
    if (!srcC) { toast('Signature vide.'); return null; }
    const url = trimCanvas(srcC).toDataURL('image/png');
    if (body.querySelector('#sgSave').checked) store('pdfjoe-signatures', [url, ...saved.filter((s) => s !== url)].slice(0, 6));
    return url;
  }
  function trimCanvas(c) {
    const ctx = c.getContext('2d'); const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return c;
    const pad = 6, out = document.createElement('canvas');
    out.width = x1 - x0 + 1 + pad * 2; out.height = y1 - y0 + 1 + pad * 2;
    out.getContext('2d').drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  /* ---------------- Liaisons UI ---------------- */
  const open = async () => addFiles(await pickFiles('application/pdf,image/*'));
  $('#openBtn').onclick = open; $('#openBtn2').onclick = open;
  $('#blankBtn').onclick = addBlank;
  $('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
  $('#selAllBtn').onclick = () => { selected = selected.size === pages.length ? new Set() : new Set(pages.map((p) => p.uid)); render(); };
  $('#rotLBtn').onclick = () => rotateSel(-90); $('#rotRBtn').onclick = () => rotateSel(90);
  $('#moveLBtn').onclick = () => moveSel(-1); $('#moveRBtn').onclick = () => moveSel(1);
  $('#dupBtn').onclick = dupSel; $('#delBtn').onclick = delSel; $('#editBtn').onclick = () => editPage();
  $('#saveAllBtn').onclick = saveAll; $('#saveSelBtn').onclick = saveSel; $('#splitBtn').onclick = split;
  $('#toImagesBtn').onclick = toImages; $('#toTextBtn').onclick = toText;
  $('#compressBtn').onclick = () => compress(false); $('#flattenBtn').onclick = () => compress(true);
  [['wmSize', ''], ['wmOpacity', ' %'], ['wmAngle', '°']].forEach(([id, unit]) => {
    const i = $('#' + id), o = $('#' + id + 'O'); i.addEventListener('input', () => { o.textContent = i.value + unit; });
  });
  onDropFiles($('#drop'), addFiles);
  onDropFiles($('#stage'), addFiles);
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back')) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selected = new Set(pages.map((p) => p.uid)); render(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (selected.size) { e.preventDefault(); delSel(); } }
    else if (e.key === 'Escape') { selected.clear(); render(); }
  });
  initMenus();
  updateButtons();

  // point d'accès pour les tests automatisés
  window.PDFJoe = { addFiles, buildPdf, get pages() { return pages; }, sources, editPage, toPdf };
})();
