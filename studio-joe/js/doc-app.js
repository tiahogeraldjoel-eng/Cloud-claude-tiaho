/* Studio Joe — Texte Joe : traitement de texte.
   Le texte est une zone modifiable unique ; la mise en pages (A4, marges, sauts de page) est calculée
   à l'affichage en repoussant les paragraphes qui débordent sur la page suivante (marges ajoutées
   marquées data-pb, retirées à l'enregistrement). En-têtes, pieds de page, numéros et filigrane sont
   dessinés sur les feuilles derrière le texte. Fichiers, PDF, modèles, publipostage, IA : doc-extra.js. */
(function () {
  const { $, $$, toast, initMenus, modal } = Studio;
  const MM = 96 / 25.4, GAP = 24;
  const SIZES = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* feuille de style du document (éditeur, impression, PDF) */
  const DOC_CSS = `
.doc-body{box-sizing:border-box;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.15;color:#000;overflow-wrap:break-word}
.doc-body p,.doc-body div.p{margin:0 0 8pt}
.doc-body h1,.doc-body h2,.doc-body h3,.doc-body h4{font-family:'Calibri Light',Carlito,'Segoe UI',Arial,sans-serif;color:#1f3864;font-weight:600;margin:14pt 0 6pt;line-height:1.15}
.doc-body h1{font-size:16pt}.doc-body h2{font-size:13pt;color:#2f5496}.doc-body h3{font-size:12pt;color:#1f3864}.doc-body h4{font-size:11pt;font-style:italic}
.doc-body h1.doc-title{font-size:28pt;font-weight:400;color:#000;margin:0 0 4pt;letter-spacing:-.5px}
.doc-body p.doc-subtitle{font-size:14pt;color:#5a5a5a;margin:0 0 12pt}
.doc-body blockquote{margin:8pt 30pt;font-style:italic;color:#404040;border-left:3px solid #2f5496;padding-left:10pt}
.doc-body pre{font-family:'Courier New',monospace;font-size:10pt;background:#f2f2f2;padding:6pt;white-space:pre-wrap;margin:0 0 8pt}
.doc-body ul,.doc-body ol{margin:0 0 8pt;padding-left:24pt}
.doc-body li{margin:0 0 2pt}
.doc-body table{border-collapse:collapse;width:100%;margin:0 0 8pt;table-layout:fixed}
.doc-body td,.doc-body th{border:1px solid #808080;padding:3pt 5pt;vertical-align:top;min-width:20px}
.doc-body th,.doc-body tr.hdr td{background:#d9e2f3;font-weight:700}
.doc-body td>p:last-child,.doc-body th>p:last-child{margin-bottom:0}
.doc-body img{max-width:100%;height:auto}
.doc-body img.fl{float:left;margin:0 10pt 6pt 0}.doc-body img.fr{float:right;margin:0 0 6pt 10pt}.doc-body img.ctr{display:block;margin:0 auto 8pt}
.doc-body hr{border:0;border-top:1px solid #808080;margin:8pt 0}
.doc-body a{color:#0563c1}
.doc-body .pb{display:block;height:0;border:0;margin:0;padding:0;break-after:page;page-break-after:always}
.doc-body .toc{margin:0 0 12pt}
.doc-body .toc .toc-t{font-size:14pt;color:#2f5496;margin:0 0 6pt}
.doc-body .toc .toc-l{display:flex;gap:4px;margin:0 0 3pt}.doc-body .toc .toc-l span:nth-child(2){flex:1;border-bottom:1px dotted #999;margin-bottom:4px}
.doc-body .toc .toc-l.l2{padding-left:16pt}.doc-body .toc .toc-l.l3{padding-left:32pt}
.doc-body .mf{background:#e7eefb;border:1px solid #9fb6e0;border-radius:3px;padding:0 2px;color:#1f3864}
.doc-body .tab{display:inline-block;width:1.27cm}
.doc-body table.nb td,.doc-body table.nb th{border-color:transparent;background:none}`;
  const st = document.createElement('style'); st.textContent = DOC_CSS; document.head.appendChild(st);

  /* ================= Modèle ================= */
  const newDocModel = () => ({ id: uid(), title: 'Document', page: { size: 'A4', orient: 'p', margins: { t: 25, b: 25, l: 25, r: 25 } }, header: '', footer: '', pageNum: { pos: 'bottom-center', fmt: 'Page {n} sur {N}', show: true }, firstDiff: false, watermark: null, html: '<p><br></p>', updated: Date.now() });
  let doc = newDocModel();
  const body = $('#body'), sheetsEl = $('#sheets'), pagesEl = $('#pages'), desk = $('#desk'), zoomer = $('#zoomer');
  let zoom = 1, view = innerWidth < 700 ? 'mobile' : 'page', pageCount = 1;

  function dims() {
    const [w, h] = SIZES[doc.page.size] || SIZES.A4; const land = doc.page.orient === 'l';
    const m = doc.page.margins;
    return { pw: (land ? h : w) * MM, ph: (land ? w : h) * MM, mt: m.t * MM, mb: m.b * MM, ml: m.l * MM, mr: m.r * MM };
  }

  /* ================= Nettoyage du HTML (collage, import) ================= */
  const TAGS = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'SPAN', 'A', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'IMG', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'HR', 'COLGROUP', 'COL', 'CODE']);
  const KEEP = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align', 'font-size', 'font-family', 'line-height', 'margin-left', 'text-indent', 'margin-top', 'margin-bottom', 'width', 'vertical-align'];
  function sanitize(html, { keepClasses = true } = {}) {
    const d = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
    const root = d.getElementById('r');
    root.querySelectorAll('script,style,meta,link,title,xml,o\\:p,head,iframe,object,embed,svg,math,form,input,button,select,textarea').forEach((n) => n.remove());
    const walk = (node, out) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.nodeValue.replace(/\s*\n\s*/g, ' '))); continue; }
        if (n.nodeType !== 1) continue;
        let tag = n.tagName.toUpperCase();
        if (tag === 'FONT') { const sp = document.createElement('span'); if (n.getAttribute('color')) sp.style.color = n.getAttribute('color'); if (n.getAttribute('face')) sp.style.fontFamily = n.getAttribute('face'); walk(n, sp); out.appendChild(sp); continue; }
        if (tag === 'H5' || tag === 'H6') tag = 'H4';
        if (tag === 'STRIKE' || tag === 'DEL') tag = 'S';
        if (!TAGS.has(tag)) { walk(n, out); continue; }
        const e = document.createElement(tag);
        if (tag === 'A') { const h = n.getAttribute('href') || ''; if (/^(https?:|mailto:|tel:|#)/i.test(h)) e.setAttribute('href', h); }
        if (tag === 'IMG') { const s = n.getAttribute('src') || ''; if (!/^(data:image\/|https?:|blob:)/i.test(s)) continue; e.setAttribute('src', s); if (n.getAttribute('width')) e.style.width = /%$/.test(n.getAttribute('width')) ? n.getAttribute('width') : n.getAttribute('width') + 'px'; }
        if ((tag === 'TD' || tag === 'TH') && n.getAttribute('colspan')) e.setAttribute('colspan', n.getAttribute('colspan'));
        if ((tag === 'TD' || tag === 'TH') && n.getAttribute('rowspan')) e.setAttribute('rowspan', n.getAttribute('rowspan'));
        if (tag === 'OL' && n.getAttribute('start')) e.setAttribute('start', n.getAttribute('start'));
        if (keepClasses && n.className && typeof n.className === 'string') { const cls = n.className.split(/\s+/).filter((c) => /^(doc-title|doc-subtitle|pb|toc|toc-t|toc-l|l[123]|mf|tab|fl|fr|ctr|hdr|nb|al-(center|right|justify))$/.test(c)); if (cls.length) e.className = cls.join(' '); }
        if (n.classList && n.classList.contains('mf')) { e.setAttribute('contenteditable', 'false'); e.dataset.f = n.dataset.f || n.textContent.replace(/[«»]/g, ''); }
        if (n.classList && n.classList.contains('toc')) e.setAttribute('contenteditable', 'false');
        const stl = n.getAttribute('style');
        if (stl) { const tmp = document.createElement('span'); tmp.setAttribute('style', stl); for (const p of KEEP) { let v = tmp.style.getPropertyValue(p); if (!v) continue; if (p === 'font-family') v = v.split(',').slice(0, 3).join(','); if ((p === 'margin-top' || p === 'margin-bottom') && !/^(P|H\d|LI|DIV)$/.test(tag)) continue; if (p === 'width' && !/^(IMG|TD|TH|COL|TABLE)$/.test(tag)) continue; e.style.setProperty(p, v); } }
        if (n.getAttribute('align') && /^(left|center|right|justify)$/i.test(n.getAttribute('align'))) e.style.textAlign = n.getAttribute('align').toLowerCase();
        walk(n, e); out.appendChild(e);
      }
    };
    const out = document.createElement('div'); walk(root, out);
    // les classes d'alignement (import Word) deviennent des styles
    out.querySelectorAll('.al-center,.al-right,.al-justify').forEach((n) => { n.style.textAlign = n.className.match(/al-(\w+)/)[1]; n.classList.remove('al-center', 'al-right', 'al-justify'); });
    // texte isolé au premier niveau → paragraphes
    const wrapped = document.createElement('div'); let pBuf = null;
    for (const n of [...out.childNodes]) {
      const inline = n.nodeType === 3 || (n.nodeType === 1 && /^(B|STRONG|I|EM|U|S|SUB|SUP|SPAN|A|IMG|BR|CODE)$/.test(n.tagName));
      if (inline) { if (n.nodeType === 3 && !n.nodeValue.trim() && !pBuf) continue; if (!pBuf) { pBuf = document.createElement('p'); wrapped.appendChild(pBuf); } pBuf.appendChild(n); }
      else { pBuf = null; wrapped.appendChild(n.tagName === 'DIV' && !n.className ? Object.assign(document.createElement('p'), { innerHTML: n.innerHTML, style: n.getAttribute('style') || '' }) : n); }
    }
    wrapped.querySelectorAll('p').forEach((p) => { if (!p.innerHTML.trim()) p.innerHTML = '<br>'; });
    return wrapped.innerHTML || '<p><br></p>';
  }

  /* ================= Mise en pages ================= */
  function clearPushes(root = body) {
    root.querySelectorAll('[data-pb]').forEach((n) => { n.style.paddingTop = n.dataset.pt || ''; if (!n.getAttribute('style')) n.removeAttribute('style'); delete n.dataset.pb; delete n.dataset.pt; });
    root.querySelectorAll('.pb').forEach((n) => { n.style.height = ''; if (!n.getAttribute('style')) n.removeAttribute('style'); });
  }
  function units() {
    const out = [];
    for (const c of body.children) {
      if ((c.tagName === 'UL' || c.tagName === 'OL') && c.children.length) { for (const li of c.children) out.push(li); }
      else out.push(c);
    }
    return out;
  }
  let headingPages = new Map();
  function paginate() {
    if (view !== 'page') { clearPushes(); renderSheets(1); return; }
    const D = dims(); const stride = D.ph + GAP;
    clearPushes();
    body.style.padding = `${D.mt}px ${D.mr}px ${D.mb}px ${D.ml}px`;
    body.style.width = D.pw + 'px'; pagesEl.style.width = D.pw + 'px';
    const base = body.getBoundingClientRect().top;
    const rect = (n) => { const r = n.getBoundingClientRect(); return { top: (r.top - base) / zoom, bottom: (r.bottom - base) / zoom }; };
    let page = 0, pageTop = D.mt, pageBottom = D.ph - D.mb, first = true;
    const contentH = D.ph - D.mt - D.mb;
    headingPages = new Map();
    const push = (n, pad) => { if (pad <= 0) return; if (!n.dataset.pb) { n.dataset.pt = n.style.paddingTop || ''; n.dataset.pb = '1'; } n.style.paddingTop = (parseFloat(n.style.paddingTop) || 0) + pad + 'px'; };
    const next = () => { page++; pageTop = page * stride + D.mt; pageBottom = page * stride + D.ph - D.mb; first = true; };
    for (const u of units()) {
      if (u.classList && u.classList.contains('pb')) { const r = rect(u); const target = (page + 1) * stride + D.mt; u.style.height = Math.max(0, target - r.top) + 'px'; next(); continue; }
      let r = rect(u);
      while (r.top >= pageBottom - 1) next(); // l'élément commence sur une page suivante
      if (r.top < pageTop - 0.5) { push(u, pageTop - r.top); r = rect(u); } // dans l'intervalle entre deux pages
      const h = r.bottom - r.top;
      if (r.bottom > pageBottom + 0.5 && !first && h <= contentH) { push(u, (page + 1) * stride + D.mt - r.top); next(); r = rect(u); }
      if (/^H[1-4]$/.test(u.tagName)) headingPages.set(u, page + 1);
      first = false;
      while (r.bottom > pageBottom + 0.5) { next(); first = false; } // élément plus haut qu'une page
    }
    pageCount = page + 1;
    body.style.minHeight = pageCount * stride - GAP + 'px';
    renderSheets(pageCount);
    updateStatus();
  }
  function hfText(html, n, N) {
    return (html || '').replace(/\{n\}/g, String(n)).replace(/\{N\}/g, String(N)).replace(/\{date\}/g, new Date().toLocaleDateString('fr-FR')).replace(/\{titre\}/g, esc(doc.title));
  }
  function renderSheets(N) {
    sheetsEl.innerHTML = '';
    if (view !== 'page') return;
    const D = dims(); const stride = D.ph + GAP;
    for (let k = 0; k < N; k++) {
      const s = document.createElement('div'); s.className = 'sheet'; s.style.cssText = `top:${k * stride}px;width:${D.pw}px;height:${D.ph}px`;
      const firstSkip = doc.firstDiff && k === 0;
      if (doc.watermark && doc.watermark.text) s.insertAdjacentHTML('beforeend', `<div class="wm"><span style="color:${doc.watermark.color || '#c00000'};opacity:${doc.watermark.opacity ?? 0.15}">${esc(doc.watermark.text)}</span></div>`);
      if (!firstSkip && doc.header) s.insertAdjacentHTML('beforeend', `<div class="hf" style="left:${D.ml}px;right:${D.mr}px;top:${Math.max(8 * MM, D.mt / 2 - 8)}px;max-height:${D.mt - 6}px">${hfText(doc.header, k + 1, N)}</div>`);
      let foot = !firstSkip && doc.footer ? hfText(doc.footer, k + 1, N) : '';
      const pn = doc.pageNum; const showNum = pn && pn.show && !firstSkip;
      if (foot || (showNum && /^bottom/.test(pn.pos))) s.insertAdjacentHTML('beforeend', `<div class="hf" style="left:${D.ml}px;right:${D.mr}px;bottom:${Math.max(8 * MM, D.mb / 2 - 10)}px;display:flex;gap:12px;align-items:flex-end"><div style="flex:1">${foot}</div></div>`);
      if (showNum) {
        const txt = esc(pn.fmt || '{n}').replace(/\{n\}/g, k + 1).replace(/\{N\}/g, N);
        const al = pn.pos.endsWith('left') ? 'left' : pn.pos.endsWith('right') ? 'right' : 'center';
        const y = pn.pos.startsWith('top') ? `top:${Math.max(8 * MM, D.mt / 2 - 8)}px` : `bottom:${Math.max(8 * MM, D.mb / 2 - 10)}px`;
        s.insertAdjacentHTML('beforeend', `<div class="hf" style="left:${D.ml}px;right:${D.mr}px;${y};text-align:${al}">${txt}</div>`);
      }
      sheetsEl.appendChild(s);
    }
  }
  let pagTimer = null;
  function schedulePaginate(ms = 150) { clearTimeout(pagTimer); pagTimer = setTimeout(paginate, body.children.length > 800 ? 600 : ms); }
  const ro = new ResizeObserver(() => schedulePaginate(60)); ro.observe(body);
  body.addEventListener('load', () => schedulePaginate(50), true);

  /* ================= Contenu ================= */
  function getHTML() {
    const c = body.cloneNode(true); clearPushes(c);
    c.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel'));
    c.querySelectorAll('[style=""]').forEach((n) => n.removeAttribute('style'));
    return c.innerHTML;
  }
  function setHTML(html) { body.innerHTML = sanitize(html); if (!body.innerHTML.trim()) body.innerHTML = '<p><br></p>'; afterContentChange(); }

  /* ================= Annuler / rétablir ================= */
  const undoStack = [], redoStack = [];
  let lastSnap = null, snapTimer = null;
  const state = () => JSON.stringify({ ...doc, html: getHTML() });
  function caretPath() { const s = getSelection(); if (!s.rangeCount || !body.contains(s.anchorNode)) return null; const path = []; let n = s.anchorNode; while (n && n !== body) { path.unshift([...n.parentNode.childNodes].indexOf(n)); n = n.parentNode; } return { path, off: s.anchorOffset }; }
  function restoreCaret(c) { if (!c) return; let n = body; for (const i of c.path) { if (!n.childNodes[i]) return; n = n.childNodes[i]; } try { const r = document.createRange(); r.setStart(n, Math.min(c.off, n.nodeType === 3 ? n.length : n.childNodes.length)); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* position perdue */ } }
  function snapshot(force = false) {
    const cur = state();
    if (lastSnap !== null && cur !== lastSnap) { undoStack.push({ s: lastSnap, caret: lastCaret }); if (undoStack.length > 150) undoStack.shift(); redoStack.length = 0; }
    lastSnap = cur; lastCaret = caretPath(); void force;
  }
  let lastCaret = null;
  function scheduleSnap() { clearTimeout(snapTimer); snapTimer = setTimeout(() => snapshot(), 700); }
  function applyState(json, caret) { const o = JSON.parse(json); const html = o.html; delete o.html; doc = { ...o, html }; body.innerHTML = html; lastSnap = json; afterContentChange(false); restoreCaret(caret); }
  function undo() { clearTimeout(snapTimer); snapshot(); const u = undoStack.pop(); if (!u) return toast('Rien à annuler'); redoStack.push({ s: lastSnap, caret: caretPath() }); applyState(u.s, u.caret); }
  function redo() { const r = redoStack.pop(); if (!r) return toast('Rien à rétablir'); undoStack.push({ s: lastSnap, caret: caretPath() }); applyState(r.s, r.caret); }
  // les modifications « d'un coup » (insertion, mise en forme de paragraphes) passent par change()
  function change(fn) { clearTimeout(snapTimer); snapshot(); fn(); afterContentChange(); snapshot(); }

  /* ================= Sauvegarde locale (IndexedDB) ================= */
  const idb = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('texte-joe', 1); r.onupgradeneeded = () => { r.result.createObjectStore('docs'); r.result.createObjectStore('kv'); }; r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
    async op(store, mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction(store, mode); const req = fn(tx.objectStore(store)); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); }); },
    get(store, k) { return this.op(store, 'readonly', (s) => s.get(k)); }, set(store, k, v) { return this.op(store, 'readwrite', (s) => s.put(v, k)); }, del(store, k) { return this.op(store, 'readwrite', (s) => s.delete(k)); },
    all(store) { return this.op(store, 'readonly', (s) => s.getAll()); },
  };
  let saveTimer = null, dirty = false;
  function markDirty() { dirty = true; $('#stSave').textContent = 'Modifications non enregistrées sur l\'appareil…'; clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 1200); }
  async function autosave() {
    try { doc.html = getHTML(); doc.updated = Date.now(); doc.words = countWords(); await idb.set('docs', doc.id, doc); await idb.set('kv', 'current', doc.id); dirty = false; $('#stSave').textContent = 'Enregistré sur l\'appareil'; }
    catch (e) { console.warn(e); $('#stSave').textContent = 'Sauvegarde automatique impossible'; }
  }
  addEventListener('beforeunload', () => { if (dirty) autosave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) autosave(); });
  function loadDoc(d) {
    doc = { ...newDocModel(), ...d, page: { ...newDocModel().page, ...(d.page || {}), margins: { ...newDocModel().page.margins, ...((d.page || {}).margins || {}) } } };
    body.innerHTML = sanitize(doc.html || '<p><br></p>');
    undoStack.length = 0; redoStack.length = 0; lastSnap = null;
    afterContentChange(); snapshot();
    $('#docName').textContent = doc.title;
    desk.scrollTop = 0;
  }

  /* ================= Après modification ================= */
  function afterContentChange(save = true) {
    body.querySelectorAll('.mf, .toc').forEach((n) => n.setAttribute('contenteditable', 'false'));
    if (!body.firstChild) body.innerHTML = '<p><br></p>';
    schedulePaginate(60); updateStatus(); $('#docName').textContent = doc.title;
    if (save) markDirty();
  }
  body.addEventListener('input', () => { scheduleSnap(); afterContentChange(); });

  /* ================= Statut, zoom, affichage ================= */
  function countWords() { const t = body.innerText || ''; const m = t.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-.,]*/gu); return m ? m.length : 0; }
  function currentPage() {
    if (view !== 'page') return 1; const s = getSelection(); if (!s.rangeCount || !body.contains(s.anchorNode)) return 1;
    let r = s.getRangeAt(0).getBoundingClientRect(); if (!r.height) { const n = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement; r = n.getBoundingClientRect(); }
    const y = (r.top - body.getBoundingClientRect().top) / zoom; return Math.min(pageCount, Math.max(1, Math.floor(y / (dims().ph + GAP)) + 1));
  }
  function updateStatus() { const w = countWords(); $('#stWords').textContent = `${w} mot${w > 1 ? 's' : ''}`; $('#stPage').textContent = view === 'page' ? `Page ${currentPage()} sur ${pageCount}` : 'Affichage mobile'; }
  document.addEventListener('selectionchange', () => { if (body.contains(document.activeElement) || document.activeElement === body) { clearTimeout(window.__stT); window.__stT = setTimeout(() => { updateStatus(); updateTools(); }, 80); } });
  function setZoom(z) { zoom = Math.max(0.5, Math.min(2, z)); zoomer.style.zoom = view === 'page' ? zoom : 1; $('#zoom').value = Math.round(zoom * 100); $('#zoomO').textContent = Math.round(zoom * 100) + ' %'; schedulePaginate(30); }
  $('#zoom').oninput = (e) => setZoom(+e.target.value / 100);
  desk.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
  function setView(v) {
    view = v; document.querySelector('.doc-app').classList.toggle('mobile', v === 'mobile');
    $('#viewBtn').textContent = v === 'page' ? '📄' : '📱'; $('#viewBtn').title = v === 'page' ? 'Passer à l\'affichage mobile (texte adapté à l\'écran)' : 'Passer à l\'affichage page (A4)';
    if (v === 'mobile') { body.style.padding = ''; body.style.width = ''; pagesEl.style.width = ''; body.style.minHeight = ''; zoomer.style.zoom = 1; } else { zoomer.style.zoom = zoom; }
    paginate();
  }
  $('#viewBtn').onclick = () => setView(view === 'page' ? 'mobile' : 'page');
  function fitWidth() { if (view !== 'page') return; const w = desk.clientWidth - 32; const k = Math.min(1, w / dims().pw); if (k < 1) setZoom(Math.max(0.5, Math.floor(k * 20) / 20)); }

  /* ================= Mise en forme ================= */
  let savedRange = null;
  document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && body.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); });
  function focusBody() {
    const s = getSelection();
    if (s.rangeCount && body.contains(s.anchorNode)) return true;
    body.focus({ preventScroll: true });
    if (savedRange && body.contains(savedRange.startContainer)) { s.removeAllRanges(); s.addRange(savedRange); return true; }
    const r = document.createRange(); r.selectNodeContents(body); r.collapse(false); s.removeAllRanges(); s.addRange(r); return true;
  }
  function exec(cmd, val = null, css = true) { focusBody(); document.execCommand('styleWithCSS', false, css); document.execCommand(cmd, false, val); afterContentChange(); scheduleSnap(); updateTools(); }
  function selectedBlocks() {
    focusBody(); const s = getSelection(); if (!s.rangeCount) return [];
    const r = s.getRangeAt(0); const blocks = [];
    const blockOf = (n) => { while (n && n !== body) { if (n.nodeType === 1 && /^(P|H[1-4]|LI|BLOCKQUOTE|PRE|DIV|TD|TH)$/.test(n.tagName) && (n.parentNode === body || n.tagName === 'LI' || n.tagName === 'TD' || n.tagName === 'TH' || /^(UL|OL|BLOCKQUOTE|TD|TH)$/.test(n.parentNode.tagName))) return n; n = n.parentNode; } return null; };
    const a = blockOf(r.startContainer), b = blockOf(r.endContainer);
    if (!a) return [];
    const all = [...body.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,pre,div.p,td,th')];
    const ia = all.indexOf(a), ib = all.indexOf(b || a);
    for (let i = Math.max(0, ia); i <= Math.max(ia, ib); i++) blocks.push(all[i]);
    return blocks.filter(Boolean);
  }
  function setStyle(v) {
    change(() => {
      focusBody();
      if (v === 'title' || v === 'subtitle') {
        document.execCommand('formatBlock', false, v === 'title' ? 'h1' : 'p');
        selectedBlocks().forEach((b) => { b.classList.remove('doc-title', 'doc-subtitle'); b.classList.add(v === 'title' ? 'doc-title' : 'doc-subtitle'); });
      } else {
        document.execCommand('formatBlock', false, v);
        selectedBlocks().forEach((b) => { b.classList.remove('doc-title', 'doc-subtitle'); if (!b.className) b.removeAttribute('class'); });
      }
    });
  }
  function setFontSize(pt) {
    focusBody(); const s = getSelection();
    if (s.isCollapsed) { // sans sélection : tout le paragraphe
      change(() => selectedBlocks().forEach((b) => { b.style.fontSize = pt + 'pt'; b.querySelectorAll('[style*="font-size"]').forEach((n) => { n.style.fontSize = ''; }); }));
      return;
    }
    change(() => {
      document.execCommand('styleWithCSS', false, false); document.execCommand('fontSize', false, '7');
      body.querySelectorAll('font[size="7"]').forEach((f) => { const sp = document.createElement('span'); sp.style.fontSize = pt + 'pt'; sp.append(...f.childNodes); f.replaceWith(sp); });
      body.querySelectorAll('span[style*="xxx-large"]').forEach((n) => { n.style.fontSize = pt + 'pt'; });
    });
  }
  function setLineHeight(v) { change(() => selectedBlocks().forEach((b) => { b.style.lineHeight = v || ''; })); }
  function changeCase(mode) {
    focusBody(); const s = getSelection(); if (s.isCollapsed) return toast('Sélectionnez le texte à transformer');
    const t = s.toString();
    const out = mode === 'upper' ? t.toLocaleUpperCase('fr') : mode === 'lower' ? t.toLocaleLowerCase('fr') : t.toLocaleLowerCase('fr').replace(/(^|[\s'’(\-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('fr'));
    exec('insertText', out);
  }
  function clearFormat() { change(() => { focusBody(); document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); selectedBlocks().forEach((b) => { b.removeAttribute('style'); b.removeAttribute('class'); }); }); }
  function list(type) { exec(type === 'ul' ? 'insertUnorderedList' : 'insertOrderedList'); }
  function indent(d) {
    focusBody(); const inList = selectedBlocks().some((b) => b.tagName === 'LI');
    if (inList) { exec(d > 0 ? 'indent' : 'outdent'); return; }
    change(() => selectedBlocks().forEach((b) => { const cur = parseFloat(b.style.marginLeft) || 0; const v = Math.max(0, cur + d * 1.27); b.style.marginLeft = v ? v + 'cm' : ''; }));
  }

  /* ---------- barre d'outils ---------- */
  const dStyle = $('#dStyle'), dFont = $('#dFont'), dSize = $('#dSize'), dLine = $('#dLine'), dColor = $('#dColor'), dHi = $('#dHi');
  $$('.tools button, .topbar .menu > button').forEach((b) => b.addEventListener('mousedown', (e) => { if (!e.target.closest('.clr')) e.preventDefault(); }));
  dStyle.onchange = () => { setStyle(dStyle.value); body.focus(); };
  dFont.onchange = () => { exec('fontName', dFont.value || 'Calibri, Carlito, sans-serif'); };
  dSize.onchange = () => { if (dSize.value) setFontSize(+dSize.value); };
  dLine.onchange = () => { setLineHeight(dLine.value); };
  dColor.oninput = () => { $('#dColorBar').style.background = dColor.value; }; dColor.onchange = () => exec('foreColor', dColor.value);
  dHi.oninput = () => { $('#dHiBar').style.background = dHi.value; }; dHi.onchange = () => exec('hiliteColor', dHi.value);
  dColor.parentElement.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); exec('foreColor', dColor.value); });
  dHi.parentElement.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); exec('hiliteColor', dHi.value); });
  [dColor, dHi].forEach((x) => x.addEventListener('click', (e) => e.stopPropagation()));
  function updateTools() {
    const s = getSelection(); if (!s.rangeCount || !body.contains(s.anchorNode)) return;
    const n = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
    const blk = n.closest('h1,h2,h3,h4,blockquote,pre,p,li');
    dStyle.value = !blk ? 'p' : blk.classList.contains('doc-title') ? 'title' : blk.classList.contains('doc-subtitle') ? 'subtitle' : /^(H[1-3]|BLOCKQUOTE|PRE)$/.test(blk.tagName) ? blk.tagName.toLowerCase() : 'p';
    const cs = getComputedStyle(n); const pt = Math.round((parseFloat(cs.fontSize) * 72) / 96 * 2) / 2;
    if (![...dSize.options].some((o) => o.value === String(pt))) dSize.add(new Option(String(pt))); dSize.value = String(pt);
    const fam = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim().toLowerCase(); const opt = [...dFont.options].find((o) => (o.textContent || '').toLowerCase() === fam); dFont.value = opt ? opt.value : '';
    const qs = (c) => { try { return document.queryCommandState(c); } catch (e) { return false; } };
    $$('[data-act="bold"]').forEach((b) => b.classList.toggle('on', qs('bold'))); $$('[data-act="italic"]').forEach((b) => b.classList.toggle('on', qs('italic'))); $$('[data-act="underline"]').forEach((b) => b.classList.toggle('on', qs('underline')));
  }

  /* ================= Clavier ================= */
  body.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Tab') {
      e.preventDefault();
      const cell = (getSelection().anchorNode || {}).parentElement && getSelection().anchorNode.parentElement.closest && (getSelection().anchorNode.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode.parentElement).closest('td,th');
      if (cell) { moveCell(cell, e.shiftKey ? -1 : 1); return; }
      if (selectedBlocks().some((b) => b.tagName === 'LI')) { exec(e.shiftKey ? 'outdent' : 'indent'); return; }
      if (!e.shiftKey) exec('insertHTML', '<span class="tab">​</span>', false);
      return;
    }
    if (ctrl && e.key === 'Enter') { e.preventDefault(); act('pageBreak'); return; }
    if (ctrl && !e.shiftKey) {
      const map = { l: 'left', e: 'center', r: 'right', j: 'justify', k: 'link', h: 'find', f: 'find', s: 'saveDocx', o: 'open', p: 'print', z: 'undo', y: 'redo' };
      const a = map[e.key.toLowerCase()]; if (a) { e.preventDefault(); act(a); return; }
      if (e.key === '1' || e.key === '2' || e.key === '3') { e.preventDefault(); setStyle('h' + e.key); return; }
      if (e.key === '0') { e.preventDefault(); setStyle('p'); return; }
    }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); act('redo'); return; }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); act('pastePlain'); return; }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace' || e.key === 'Delete') { clearTimeout(snapTimer); snapshot(); }
  });
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back') || e.target === body || body.contains(e.target)) return;
    const ctrl = e.ctrlKey || e.metaKey; if (!ctrl) return;
    const a = { z: 'undo', y: 'redo', s: 'saveDocx', o: 'open', p: 'print' }[e.key.toLowerCase()]; if (a && !e.target.matches('input,textarea')) { e.preventDefault(); act(a); }
  });

  /* ================= Collage ================= */
  body.addEventListener('paste', async (e) => {
    const cd = e.clipboardData; if (!cd) return;
    const imgs = [...cd.files].filter((f) => f.type.startsWith('image/'));
    const html = cd.getData('text/html');
    if (imgs.length && !html) { e.preventDefault(); for (const f of imgs) insertImageFile(f); return; }
    if (pastePlainNext) { pastePlainNext = false; e.preventDefault(); exec('insertText', cd.getData('text/plain')); return; }
    if (html) { e.preventDefault(); clearTimeout(snapTimer); snapshot(); const clean = sanitize(html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '')); document.execCommand('insertHTML', false, clean); afterContentChange(); snapshot(); return; }
  });
  let pastePlainNext = false;

  /* ================= Images ================= */
  async function insertImageFile(f) {
    let url = await Studio.readAsDataURL(f);
    const img = await Studio.loadImage(url);
    const maxW = 1600;
    if (img.naturalWidth > maxW || f.size > 1.2e6) { const k = Math.min(1, maxW / img.naturalWidth); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); url = /png/.test(f.type) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88); }
    const D = dims(); const w = Math.min(img.naturalWidth, D.pw - D.ml - D.mr);
    exec('insertHTML', `<img src="${url}" style="width:${Math.round(w)}px">`, false);
  }
  let selImg = null; const ih = document.createElement('div'); ih.className = 'imghandle'; ih.hidden = true; document.body.appendChild(ih);
  function placeImgHandle() { if (!selImg || !body.contains(selImg)) { ih.hidden = true; selImg = null; return; } const r = selImg.getBoundingClientRect(); ih.hidden = false; ih.style.left = r.right - 8 + 'px'; ih.style.top = r.bottom - 8 + 'px'; }
  body.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') { body.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel')); selImg = e.target; selImg.classList.add('sel'); placeImgHandle(); }
    else if (selImg) { selImg.classList.remove('sel'); selImg = null; ih.hidden = true; }
  });
  desk.addEventListener('scroll', placeImgHandle); addEventListener('resize', placeImgHandle);
  let ihDrag = null;
  ih.addEventListener('pointerdown', (e) => { e.preventDefault(); ih.setPointerCapture(e.pointerId); clearTimeout(snapTimer); snapshot(); ihDrag = { x: e.clientX, w: selImg.getBoundingClientRect().width / zoom }; });
  ih.addEventListener('pointermove', (e) => { if (!ihDrag) return; const D = dims(); const w = Math.max(30, Math.min(D.pw - D.ml - D.mr, ihDrag.w + (e.clientX - ihDrag.x) / zoom)); selImg.style.width = Math.round(w) + 'px'; selImg.style.height = 'auto'; placeImgHandle(); });
  ih.addEventListener('pointerup', () => { if (!ihDrag) return; ihDrag = null; afterContentChange(); snapshot(); });
  const imgStyle = document.createElement('style'); imgStyle.textContent = '.doc-body img.sel{outline:2px solid #2b579a;outline-offset:1px}'; document.head.appendChild(imgStyle);

  /* ================= Tableaux ================= */
  function tableHTML(r, c, header = true) {
    let h = '<table><tbody>';
    for (let i = 0; i < r; i++) h += `<tr${header && i === 0 ? ' class="hdr"' : ''}>` + Array.from({ length: c }, () => '<td><br></td>').join('') + '</tr>';
    return h + '</tbody></table><p><br></p>';
  }
  function moveCell(cell, d) {
    const tbl = cell.closest('table'); const cells = [...tbl.querySelectorAll('td,th')]; let i = cells.indexOf(cell) + d;
    if (i >= cells.length) { tableOp('rowBelow', cells[cells.length - 1]); i = cells.length; }
    const n = [...tbl.querySelectorAll('td,th')][Math.max(0, i)]; if (!n) return;
    const r = document.createRange(); r.selectNodeContents(n); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function tableOp(op, cellArg) {
    const s = getSelection(); const n = cellArg || (s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement));
    const cell = n && n.closest && n.closest('td,th'); if (!cell || !body.contains(cell)) return toast('Placez le curseur dans le tableau');
    const tr = cell.parentElement, tbl = cell.closest('table'); const ci = [...tr.children].indexOf(cell);
    change(() => {
      const newRow = () => { const r = document.createElement('tr'); for (let i = 0; i < tr.children.length; i++) r.insertAdjacentHTML('beforeend', '<td><br></td>'); return r; };
      if (op === 'rowAbove') tr.before(newRow()); if (op === 'rowBelow') tr.after(newRow());
      if (op === 'colLeft' || op === 'colRight') tbl.querySelectorAll('tr').forEach((r) => { const ref = r.children[ci]; const td = document.createElement(ref && ref.tagName === 'TH' ? 'th' : 'td'); td.innerHTML = '<br>'; if (ref) (op === 'colLeft' ? ref.before(td) : ref.after(td)); else r.appendChild(td); });
      if (op === 'delRow') { if (tbl.querySelectorAll('tr').length > 1) tr.remove(); else tbl.remove(); }
      if (op === 'delCol') { if (tr.children.length > 1) tbl.querySelectorAll('tr').forEach((r) => { if (r.children[ci]) r.children[ci].remove(); }); else tbl.remove(); }
      if (op === 'delTable') tbl.remove();
      if (op === 'header') { const first = tbl.querySelector('tr'); first.classList.toggle('hdr'); if (!first.className) first.removeAttribute('class'); }
      if (op === 'noBorders') tbl.classList.toggle('nb');
      if (op === 'shade') { const c = prompt('Couleur de fond de la cellule (ex. #fff2cc), vide pour aucune :', cell.style.backgroundColor || '#fff2cc'); if (c !== null) cell.style.backgroundColor = c; }
    });
  }
  const tblStyle = document.createElement('style'); tblStyle.textContent = '.doc-body table.nb{outline:1px dashed #d0d4dc}'; document.head.appendChild(tblStyle);

  /* ================= Menu contextuel ================= */
  let ctxEl = null;
  function hideCtx() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
  function showCtx(x, y, items) {
    hideCtx(); ctxEl = document.createElement('div'); ctxEl.className = 'ctx';
    items.forEach((it) => { if (it === '-') { ctxEl.appendChild(document.createElement('hr')); return; } const b = document.createElement('button'); b.textContent = it[0]; b.addEventListener('mousedown', (e) => e.preventDefault()); b.onclick = () => { hideCtx(); it[1](); }; ctxEl.appendChild(b); });
    document.body.appendChild(ctxEl); const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px'; ctxEl.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  }
  document.addEventListener('pointerdown', (e) => { if (ctxEl && !ctxEl.contains(e.target)) hideCtx(); });
  body.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('td,th'); const img = e.target.tagName === 'IMG' ? e.target : null;
    if (!cell && !img) return;
    e.preventDefault();
    if (img) { selImg = img; placeImgHandle(); const al = (c) => change(() => { img.classList.remove('fl', 'fr', 'ctr'); if (c) img.classList.add(c); }); showCtx(e.clientX, e.clientY, [['Aligner à gauche (texte autour)', () => al('fl')], ['Centrer', () => al('ctr')], ['Aligner à droite (texte autour)', () => al('fr')], ['Dans le texte', () => al('')], '-', ['Largeur de la page', () => change(() => { img.style.width = '100%'; })], ['Taille d\'origine', () => change(() => { img.style.width = img.naturalWidth + 'px'; })], '-', ['Supprimer l\'image', () => change(() => img.remove())]]); return; }
    const r = document.createRange(); r.selectNodeContents(cell); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r);
    showCtx(e.clientX, e.clientY, [['Insérer une ligne au-dessus', () => tableOp('rowAbove', cell)], ['Insérer une ligne en dessous', () => tableOp('rowBelow', cell)], ['Insérer une colonne à gauche', () => tableOp('colLeft', cell)], ['Insérer une colonne à droite', () => tableOp('colRight', cell)], '-', ['Supprimer la ligne', () => tableOp('delRow', cell)], ['Supprimer la colonne', () => tableOp('delCol', cell)], ['Supprimer le tableau', () => tableOp('delTable', cell)], '-', ['Ligne d\'en-tête (oui / non)', () => tableOp('header', cell)], ['Couleur de fond de la cellule…', () => tableOp('shade', cell)], ['Bordures visibles (oui / non)', () => tableOp('noBorders', cell)]]);
  });

  /* ================= Rechercher / remplacer ================= */
  let findPanel = null;
  function findDialog() {
    if (findPanel) { findPanel.querySelector('#fQ').focus(); return; }
    const p = document.createElement('div'); p.className = 'find-panel'; findPanel = p;
    p.innerHTML = `<div class="row" style="justify-content:space-between"><b>Rechercher et remplacer</b><button class="ghost" id="fX">✕</button></div><input type="text" id="fQ" placeholder="Rechercher"><input type="text" id="fR" placeholder="Remplacer par"><label class="row" style="font-size:12px"><input type="checkbox" id="fC"> Respecter la casse</label><div class="row"><button class="primary" id="fN">Suivant</button><button id="fRep">Remplacer</button><button id="fAll">Tout remplacer</button></div><span class="hint" id="fI"></span>`;
    document.body.appendChild(p);
    const q = p.querySelector('#fQ'), rp = p.querySelector('#fR'), info = p.querySelector('#fI'), cs = p.querySelector('#fC');
    const norm = (s) => (cs.checked ? s : s.toLocaleLowerCase('fr'));
    function matches() { const out = []; if (!q.value) return out; const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT); let n; const needle = norm(q.value); while ((n = w.nextNode())) { const t = norm(n.nodeValue); let i = t.indexOf(needle); while (i >= 0) { out.push({ n, i }); i = t.indexOf(needle, i + needle.length); } } return out; }
    function selectMatch(m) { const r = document.createRange(); r.setStart(m.n, m.i); r.setEnd(m.n, m.i + q.value.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); const rc = r.getBoundingClientRect(); const dr = desk.getBoundingClientRect(); if (rc.top < dr.top + 40 || rc.bottom > dr.bottom - 40) desk.scrollTop += rc.top - dr.top - dr.height / 3; }
    function next() { const L = matches(); if (!L.length) { info.textContent = 'Introuvable'; return; } const s = getSelection(); let k = 0; if (s.rangeCount) { const r = s.getRangeAt(0); k = L.findIndex((m) => { const c = document.createRange(); c.setStart(m.n, m.i); return c.compareBoundaryPoints(Range.START_TO_END, r) > 0 && !(m.n === r.startContainer && m.i === r.startOffset); }); if (k < 0) k = 0; } selectMatch(L[k]); info.textContent = `${k + 1} sur ${L.length}`; }
    function replaceOne() { const s = getSelection(); if (s.rangeCount && norm(s.toString()) === norm(q.value) && body.contains(s.anchorNode)) { exec('insertText', rp.value); } next(); }
    function replaceAll() { const L = matches(); if (!L.length) { info.textContent = 'Introuvable'; return; } change(() => { for (let i = L.length - 1; i >= 0; i--) { const m = L[i]; m.n.nodeValue = m.n.nodeValue.slice(0, m.i) + rp.value + m.n.nodeValue.slice(m.i + q.value.length); } }); info.textContent = `${L.length} remplacement(s)`; }
    p.querySelector('#fN').onclick = next; p.querySelector('#fRep').onclick = replaceOne; p.querySelector('#fAll').onclick = replaceAll;
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } if (e.key === 'Escape') close(); });
    const close = () => { p.remove(); findPanel = null; body.focus(); };
    p.querySelector('#fX').onclick = close;
    const sel = getSelection().toString(); if (sel && sel.length < 60) q.value = sel;
    q.focus(); q.select();
  }

  /* ================= Sommaire ================= */
  function buildToc() {
    const hs = [...body.querySelectorAll('h1:not(.doc-title),h2,h3')].filter((h) => !h.closest('.toc') && h.textContent.trim());
    let html = '<p class="toc-t">Sommaire</p>';
    hs.forEach((h, i) => { h.id = h.id || 'h-' + i + '-' + uid(); const lvl = +h.tagName[1]; html += `<div class="toc-l l${lvl}"><span>${esc(h.textContent.trim())}</span><span></span><span>${headingPages.get(h) || ''}</span></div>`; });
    if (!hs.length) html += '<div class="toc-l"><span>(Ajoutez des titres avec le style « Titre 1 », « Titre 2 »…)</span></div>';
    return html;
  }
  function insertToc() {
    const ex = body.querySelector('.toc'); if (ex) { updateToc(); toast('Sommaire mis à jour'); return; }
    focusBody(); const sel = getSelection(); const n = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const inside = n && n.closest('table, ul, ol'); // pas de sommaire dans un tableau ou une liste : on le place après
    if (inside) { let top = inside; while (top.parentNode !== body) top = top.parentNode; const p = document.createElement('p'); p.innerHTML = '<br>'; top.after(p); const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    exec('insertHTML', `<div class="toc" contenteditable="false">${buildToc()}</div><p><br></p>`, false); setTimeout(updateToc, 300); }
  function updateToc() { paginate(); body.querySelectorAll('.toc').forEach((t) => { t.innerHTML = buildToc(); }); paginate(); }

  /* ================= Dialogues de mise en page ================= */
  async function pageSetup() {
    const p = doc.page;
    const r = await modal({
      title: 'Mise en page',
      body: `<div class="grid2"><div class="field"><label for="psS">Format</label><select id="psS">${Object.keys(SIZES).map((k) => `<option ${p.size === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label for="psO">Orientation</label><select id="psO"><option value="p" ${p.orient === 'p' ? 'selected' : ''}>Portrait</option><option value="l" ${p.orient === 'l' ? 'selected' : ''}>Paysage</option></select></div>
        ${['t', 'b', 'l', 'r'].map((k) => `<div class="field"><label>Marge ${{ t: 'haut', b: 'bas', l: 'gauche', r: 'droite' }[k]} (mm)</label><input type="number" min="5" max="80" data-m="${k}" value="${p.margins[k]}"></div>`).join('')}</div>
        <div class="row"><button type="button" id="psN">Normales (25 mm)</button><button type="button" id="psE">Étroites (12,7 mm)</button><button type="button" id="psL">Larges (30 mm)</button></div>`,
      onOpen: (b) => { const set = (v) => b.querySelectorAll('[data-m]').forEach((x) => { x.value = v; }); b.querySelector('#psN').onclick = () => set(25); b.querySelector('#psE').onclick = () => set(12.7); b.querySelector('#psL').onclick = () => set(30); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => ({ size: b.querySelector('#psS').value, orient: b.querySelector('#psO').value, margins: Object.fromEntries([...b.querySelectorAll('[data-m]')].map((x) => [x.dataset.m, Math.max(5, Math.min(80, +x.value || 25))])) }) }],
    });
    if (r) change(() => { doc.page = r; });
  }
  async function headerFooter() {
    const r = await modal({
      title: 'En-tête, pied de page et numéros de page', wide: true,
      body: `<div class="field"><label>En-tête (en haut de chaque page)</label><div class="mini-ed" id="hfH" contenteditable="true">${doc.header || ''}</div></div>
        <div class="field"><label>Pied de page</label><div class="mini-ed" id="hfF" contenteditable="true">${doc.footer || ''}</div></div>
        <p class="hint" style="margin:0">Codes utilisables : {n} numéro de page, {N} nombre de pages, {date} date du jour, {titre} titre du document.</p>
        <div class="grid2"><div class="field"><label for="hfP">Numéros de page</label><select id="hfP"><option value="">Aucun</option>${[['bottom-center', 'En bas, au centre'], ['bottom-right', 'En bas, à droite'], ['bottom-left', 'En bas, à gauche'], ['top-right', 'En haut, à droite'], ['top-center', 'En haut, au centre']].map(([v, l]) => `<option value="${v}" ${doc.pageNum && doc.pageNum.show && doc.pageNum.pos === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="hfFmt">Format</label><select id="hfFmt">${['Page {n} sur {N}', '{n}', '- {n} -', 'Page {n}', '{n}/{N}'].map((f) => `<option ${doc.pageNum && doc.pageNum.fmt === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div></div>
        <label class="row"><input type="checkbox" id="hfFirst" ${doc.firstDiff ? 'checked' : ''}> Rien sur la première page (page de garde)</label>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => ({ h: sanitize(b.querySelector('#hfH').innerHTML).replace(/^<p><br><\/p>$/, ''), f: sanitize(b.querySelector('#hfF').innerHTML).replace(/^<p><br><\/p>$/, ''), pos: b.querySelector('#hfP').value, fmt: b.querySelector('#hfFmt').value, first: b.querySelector('#hfFirst').checked }) }],
    });
    if (!r) return;
    change(() => { doc.header = r.h; doc.footer = r.f; doc.pageNum = { show: !!r.pos, pos: r.pos || 'bottom-center', fmt: r.fmt }; doc.firstDiff = r.first; });
  }
  // double-clic dans la marge du haut ou du bas : en-tête / pied de page, comme dans Word
  body.addEventListener('dblclick', (e) => {
    if (view !== 'page') return; const D = dims(); const y = (e.clientY - body.getBoundingClientRect().top) / zoom; const stride = D.ph + GAP; const inPage = y % stride;
    if (inPage < D.mt - 4 || (inPage > D.ph - D.mb + 4 && inPage < D.ph)) { const t = e.target; if (t === body || t.dataset.pb) { e.preventDefault(); headerFooter(); } }
  });
  async function paragraphDialog() {
    const b0 = selectedBlocks()[0]; if (!b0) return toast('Placez le curseur dans un paragraphe');
    const cs = getComputedStyle(b0); const pt = (px) => Math.round((parseFloat(px) || 0) * 0.75);
    const r = await modal({
      title: 'Paragraphe',
      body: `<div class="grid2"><div class="field"><label>Interligne</label><select id="paL"><option value="">Simple (1,15)</option>${['1', '1.15', '1.5', '2', '2.5', '3'].map((v) => `<option value="${v}" ${b0.style.lineHeight === v ? 'selected' : ''}>${v.replace('.', ',')}</option>`).join('')}</select></div>
        <div class="field"><label>Alignement</label><select id="paA"><option value="">Gauche</option><option value="center">Centré</option><option value="right">Droite</option><option value="justify">Justifié</option></select></div>
        <div class="field"><label>Espace avant (pt)</label><input type="number" id="paB" min="0" max="72" value="${pt(cs.marginTop)}"></div><div class="field"><label>Espace après (pt)</label><input type="number" id="paAf" min="0" max="72" value="${pt(cs.marginBottom)}"></div>
        <div class="field"><label>Retrait gauche (cm)</label><input type="number" id="paI" min="0" max="10" step="0.25" value="${(parseFloat(b0.style.marginLeft) || 0)}"></div><div class="field"><label>Retrait de 1re ligne (cm)</label><input type="number" id="paF" min="-3" max="5" step="0.25" value="${(parseFloat(b0.style.textIndent) || 0)}"></div></div>`,
      onOpen: (b) => { b.querySelector('#paA').value = cs.textAlign === 'start' ? '' : ['center', 'right', 'justify'].includes(cs.textAlign) ? cs.textAlign : ''; },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => ({ l: b.querySelector('#paL').value, a: b.querySelector('#paA').value, mb: +b.querySelector('#paB').value, ma: +b.querySelector('#paAf').value, i: +b.querySelector('#paI').value, f: +b.querySelector('#paF').value }) }],
    });
    if (!r) return;
    change(() => selectedBlocks().forEach((b) => { b.style.lineHeight = r.l; b.style.textAlign = r.a; b.style.marginTop = r.mb + 'pt'; b.style.marginBottom = r.ma + 'pt'; b.style.marginLeft = r.i ? r.i + 'cm' : ''; b.style.textIndent = r.f ? r.f + 'cm' : ''; }));
  }
  async function watermarkDialog() {
    const w = doc.watermark || {};
    const r = await modal({ title: 'Filigrane', body: `<div class="field"><label for="wmT">Texte</label><select id="wmT"><option value="">Aucun</option>${['BROUILLON', 'CONFIDENTIEL', 'COPIE', 'PROJET', 'ORIGINAL', 'NE PAS DIFFUSER'].map((t) => `<option ${w.text === t ? 'selected' : ''}>${t}</option>`).join('')}<option value="__o">Autre…</option></select></div><input type="text" id="wmO" placeholder="Texte personnalisé" value="${esc(w.text && !['BROUILLON', 'CONFIDENTIEL', 'COPIE', 'PROJET', 'ORIGINAL', 'NE PAS DIFFUSER'].includes(w.text) ? w.text : '')}"><div class="grid2"><div class="field"><label>Couleur</label><input type="color" id="wmC" value="${w.color || '#c00000'}"></div><div class="field"><label>Transparence</label><input type="range" id="wmA" min="0.05" max="0.4" step="0.05" value="${w.opacity || 0.15}"></div></div>`, buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => { const v = b.querySelector('#wmT').value; return { text: v === '__o' ? b.querySelector('#wmO').value.trim() : v || (b.querySelector('#wmO').value.trim()), color: b.querySelector('#wmC').value, opacity: +b.querySelector('#wmA').value }; } }] });
    if (r) change(() => { doc.watermark = r.text ? r : null; });
  }
  const CHARS = '« » “ ” ‘ ’ — – … • · ° № § ¶ © ® ™ € £ $ ¥ ‰ ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ½ ¼ ¾ ² ³ ¹ → ← ↑ ↓ ⇒ ✓ ✗ ☐ ☑ ★ ♦ ● ○ ■ □ ▲ ► É È Ê À Ç Œ œ Æ æ Ù Û Ô Î Ï Ë ç'.split(' ');
  async function charsDialog() {
    focusBody(); const range = savedRange;
    const c = await modal({ title: 'Caractère spécial', body: `<div class="chars">${CHARS.map((ch) => `<button type="button" data-c="${ch}">${ch}</button>`).join('')}</div>`, onOpen: (b) => b.querySelectorAll('[data-c]').forEach((x) => { x.onclick = () => { b.dataset.c = x.dataset.c; b.closest('.modal').querySelector('footer button.primary').click(); }; }), buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => b.dataset.c || null }] });
    if (c) { savedRange = range; exec('insertText', c); }
  }
  async function tableDialog() {
    focusBody(); const range = savedRange;
    const r = await modal({ title: 'Insérer un tableau', body: '<div class="grid2"><div class="field"><label>Lignes</label><input type="number" id="tR" min="1" max="100" value="4"></div><div class="field"><label>Colonnes</label><input type="number" id="tC" min="1" max="15" value="3"></div></div><label class="row"><input type="checkbox" id="tH" checked> Ligne d\'en-tête</label>', buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => ({ r: +b.querySelector('#tR').value, c: +b.querySelector('#tC').value, h: b.querySelector('#tH').checked }) }] });
    if (!r) return;
    savedRange = range; exec('insertHTML', tableHTML(Math.max(1, Math.min(100, r.r)), Math.max(1, Math.min(15, r.c)), r.h).replace('<table>', '<table data-new="1">'), false);
    const t = body.querySelector('table[data-new]'); if (t) { t.removeAttribute('data-new'); const td = t.querySelector('td'); const rg = document.createRange(); rg.selectNodeContents(td); rg.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); }
  }
  async function linkDialog() {
    focusBody(); const range = savedRange; const s = getSelection(); const txt = s.toString();
    const r = await modal({ title: 'Lien', body: `<div class="field"><label>Adresse (https://… ou e-mail)</label><input type="text" id="lU" placeholder="https://"></div><div class="field"><label>Texte affiché</label><input type="text" id="lT" value="${esc(txt)}"></div>`, onOpen: (b) => b.querySelector('#lU').focus(), buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => ({ u: b.querySelector('#lU').value.trim(), t: b.querySelector('#lT').value }) }] });
    if (!r || !r.u) return; let u = r.u; if (/^[^@\s]+@[^@\s]+$/.test(u)) u = 'mailto:' + u; else if (!/^(https?:|mailto:|tel:)/i.test(u)) u = 'https://' + u;
    savedRange = range; exec('insertHTML', `<a href="${esc(u)}">${esc(r.t || r.u)}</a>`, false);
  }
  function wordCount() {
    const t = body.innerText || ''; const words = countWords();
    const paras = [...body.querySelectorAll('p,li,h1,h2,h3,h4')].filter((p) => p.textContent.trim()).length;
    modal({ title: 'Statistiques', body: `<table class="cmp" style="width:100%"><tr><td>Pages</td><td><b>${pageCount}</b></td></tr><tr><td>Mots</td><td><b>${words}</b></td></tr><tr><td>Caractères (espaces compris)</td><td><b>${t.replace(/\n/g, '').length}</b></td></tr><tr><td>Caractères (sans espaces)</td><td><b>${t.replace(/\s/g, '').length}</b></td></tr><tr><td>Paragraphes</td><td><b>${paras}</b></td></tr><tr><td>Temps de lecture</td><td><b>≈ ${Math.max(1, Math.round(words / 200))} min</b></td></tr></table>` });
  }

  /* ================= Actions ================= */
  const actions = {
    undo, redo, find: findDialog, selectAll: () => { focusBody(); document.execCommand('selectAll'); },
    pastePlain: async () => { try { const t = await navigator.clipboard.readText(); exec('insertText', t); } catch (e) { pastePlainNext = true; toast('Appuyez sur Ctrl+V : le texte sera collé sans mise en forme'); } },
    bold: () => exec('bold'), italic: () => exec('italic'), underline: () => exec('underline'), strike: () => exec('strikeThrough'), sup: () => exec('superscript'), sub: () => exec('subscript'),
    left: () => exec('justifyLeft'), center: () => exec('justifyCenter'), right: () => exec('justifyRight'), justify: () => exec('justifyFull'),
    bullets: () => list('ul'), numbers: () => list('ol'), indent: () => indent(1), outdent: () => indent(-1),
    upper: () => changeCase('upper'), lower: () => changeCase('lower'), titleCase: () => changeCase('title'), clearFormat,
    image: async () => { focusBody(); const range = savedRange; const files = await Studio.pickFiles('image/*', true); savedRange = range; for (const f of files) await insertImageFile(f); },
    table: tableDialog, link: linkDialog, chars: charsDialog,
    pageBreak: () => exec('insertHTML', '<div class="pb"></div><p><br></p>', false),
    hr: () => exec('insertHTML', '<hr><p><br></p>', false),
    date: () => exec('insertText', new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })),
    toc: insertToc, headerFooter, watermark: watermarkDialog, pageSetup, paragraph: paragraphDialog, wordCount,
    rename: async () => { const n = await modal({ title: 'Nom du document', body: `<input type="text" id="dn" value="${esc(doc.title)}">`, onOpen: (b) => b.querySelector('#dn').select(), buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => b.querySelector('#dn').value.trim() }] }); if (n) { doc.title = n; markDirty(); $('#docName').textContent = n; } },
  };
  function act(name) {
    hideCtx();
    const fn = actions[name] || (Studio.docExtra && Studio.docExtra.actions[name]);
    if (!fn) return console.warn('action inconnue', name);
    try { const r = fn(); if (r && r.catch) r.catch((e) => { console.error(e); toast('Erreur : ' + e.message, 7000); }); } catch (e) { console.error(e); toast('Erreur : ' + e.message, 7000); }
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); act(b.dataset.act); } });
  initMenus();

  /* ================= API pour doc-extra.js ================= */
  window.TexteJoe = {
    get doc() { return doc; }, set doc(v) { doc = v; }, body, dims, MM, GAP, SIZES, DOC_CSS, esc, uid, sanitize, getHTML, setHTML, loadDoc, newDocModel, change, exec, focusBody,
    selectedBlocks, paginate, clearPushes, hfText, renderSheets, idb, autosave, markDirty, act, actions, showCtx, updateToc, countWords, get pageCount() { return pageCount; }, get view() { return view; }, setView,
    get savedRange() { return savedRange; }, set savedRange(r) { savedRange = r; }, snapshot, markSaved: () => { dirty = false; $('#stSave').textContent = 'Enregistré'; },
  };

  /* ================= Démarrage ================= */
  document.addEventListener('DOMContentLoaded', async () => {
    setView(view);
    try { const id = await idb.get('kv', 'current'); const d = id && (await idb.get('docs', id)); if (d) loadDoc(d); else loadDoc(newDocModel()); } catch (e) { console.warn(e); loadDoc(newDocModel()); }
    $('#stSave').textContent = '';
    fitWidth();
    body.focus({ preventScroll: true });
  });
})();
