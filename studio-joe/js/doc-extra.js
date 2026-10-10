/* Studio Joe — Texte Joe : fichiers (.docx en lecture et écriture, PDF, impression, .txt, .html, .md,
   .joedoc), bibliothèque locale, modèles, publipostage, dictée, lecture à voix haute, traduction, IA. */
(function () {
  const { toast, download, pickFiles, baseName, modal, confirmBox } = Studio;
  const T = window.TexteJoe; const esc = T.esc;
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); });
    return loaded[src];
  }
  const fileBase = () => (T.doc.title || 'Document').replace(/[\\/:*?"<>|]+/g, '_');
  const TWIP_MM = 56.6929;

  /* ================= Export DOCX ================= */
  const hex = (c) => { if (!c) return undefined; c = String(c).trim(); if (/^#[0-9a-f]{6}$/i.test(c)) return c.slice(1).toUpperCase(); if (/^#[0-9a-f]{3}$/i.test(c)) return c.slice(1).split('').map((x) => x + x).join('').toUpperCase(); const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c); if (m && (m[4] === undefined || +m[4] > 0)) return [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); const named = { black: '000000', white: 'FFFFFF', red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00' }; return named[c.toLowerCase()]; };
  const ptOf = (v) => { if (!v) return null; const n = parseFloat(v); if (!isFinite(n)) return null; if (/pt$/.test(v)) return n; if (/px$/.test(v)) return n * 0.75; if (/em$/.test(v)) return n * 11; if (/cm$/.test(v)) return n * 28.35; return null; };
  const twOf = (v) => { if (!v) return 0; const n = parseFloat(v); if (/cm$/.test(v)) return Math.round(n * 567); if (/pt$/.test(v)) return Math.round(n * 20); if (/px$/.test(v)) return Math.round(n * 15); if (/mm$/.test(v)) return Math.round(n * 56.7); return 0; };
  async function imageBytes(img) {
    let src = img.getAttribute('src') || '';
    let m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.*)$/i.exec(src);
    if (!m) { // autres formats (webp, svg, adresse web) → PNG
      try { const c = document.createElement('canvas'); c.width = img.naturalWidth || 400; c.height = img.naturalHeight || 300; c.getContext('2d').drawImage(img, 0, 0); src = c.toDataURL('image/png'); m = /^data:image\/(png);base64,(.*)$/.exec(src); } catch (e) { return null; }
    }
    const bin = atob(m[2]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return { data: u8, type: m[1].toLowerCase().replace('jpeg', 'jpg') };
  }
  async function buildDocx() {
    await loadScript('lib/docx.min.js');
    const D = window.docx; const doc = T.doc; const dm = T.dims();
    const contentPx = dm.pw - dm.ml - dm.mr; const contentTw = Math.round(contentPx * 15);
    let olInstance = 0;
    const runOpts = (f) => { const o = {}; if (f.b) o.bold = true; if (f.i) o.italics = true; if (f.u) o.underline = {}; if (f.s) o.strike = true; if (f.color) o.color = f.color; if (f.hi) o.shading = { type: D.ShadingType.CLEAR, fill: f.hi, color: 'auto' }; if (f.size) o.size = Math.round(f.size * 2); if (f.font) o.font = f.font; if (f.sup) o.superScript = true; if (f.sub) o.subScript = true; return o; };
    const fmtFrom = (el, f0) => {
      const f = { ...f0 }; const t = el.tagName; const s = el.style;
      if (t === 'B' || t === 'STRONG' || /bold|[6-9]00/.test(s.fontWeight)) f.b = true; if (s.fontWeight === 'normal' || s.fontWeight === '400') f.b = false;
      if (t === 'I' || t === 'EM' || s.fontStyle === 'italic') f.i = true;
      if (t === 'U' || /underline/.test(s.textDecoration + s.textDecorationLine)) f.u = true;
      if (t === 'S' || /line-through/.test(s.textDecoration + s.textDecorationLine)) f.s = true;
      if (t === 'SUP') f.sup = true; if (t === 'SUB') f.sub = true;
      if (t === 'CODE') f.font = 'Courier New';
      if (s.color) f.color = hex(s.color); if (s.backgroundColor) f.hi = hex(s.backgroundColor);
      const pt = ptOf(s.fontSize); if (pt) f.size = pt; if (s.fontFamily) f.font = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      return f;
    };
    async function inlines(node, f, out) {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { const t = n.nodeValue.replace(/\u200b/g, ''); if (t) out.push(new D.TextRun({ text: t, ...runOpts(f) })); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (tag === 'BR') { let nx = n.nextSibling; while (nx && nx.nodeType === 3 && !nx.nodeValue.replace(/\u200b/g, '').trim()) nx = nx.nextSibling; if (!nx) continue; out.push(new D.TextRun({ break: 1 })); continue; } // <br> final d'un bloc : ignoré
        if (n.classList.contains('tab')) { out.push(new D.TextRun({ children: [new D.Tab()] })); continue; }
        if (n.classList.contains('mf')) { out.push(new D.TextRun({ text: `«${n.dataset.f || n.textContent}»`, ...runOpts(f) })); continue; }
        if (tag === 'IMG') { const ib = await imageBytes(n); if (ib) { const w = Math.min(contentPx, parseFloat(n.style.width) || n.naturalWidth || 300); const h = n.naturalWidth ? (w * n.naturalHeight) / n.naturalWidth : w * 0.75; out.push(new D.ImageRun({ type: ib.type, data: ib.data, transformation: { width: Math.round(w), height: Math.round(h) } })); } continue; }
        if (tag === 'A' && n.getAttribute('href')) { const kids = []; await inlines(n, { ...fmtFrom(n, f), color: '0563C1', u: true }, kids); out.push(new D.ExternalHyperlink({ link: n.getAttribute('href'), children: kids.length ? kids : [new D.TextRun({ text: n.getAttribute('href'), style: 'Hyperlink' })] })); continue; }
        if (/^(UL|OL|TABLE|P|DIV|H\d|BLOCKQUOTE|PRE)$/.test(tag)) continue; // blocs imbriqués traités à part
        await inlines(n, fmtFrom(n, f), out);
      }
      return out;
    }
    const paraOpts = (el) => {
      const s = el.style; const o = {};
      const al = s.textAlign || (el.closest && el.closest('[style*="text-align"]') && el.closest('[style*="text-align"]') !== el && el.closest('td,th') ? '' : '');
      const A = { center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED, left: D.AlignmentType.LEFT };
      if (A[al]) o.alignment = A[al];
      const sp = {}; if (s.lineHeight && !isNaN(+s.lineHeight)) sp.line = Math.round(+s.lineHeight * 240); const b = ptOf(s.marginTop), a = ptOf(s.marginBottom); if (b !== null) sp.before = Math.round(b * 20); if (a !== null) sp.after = Math.round(a * 20); if (Object.keys(sp).length) o.spacing = sp;
      const ind = {}; if (s.marginLeft) ind.left = twOf(s.marginLeft); if (s.textIndent) { const v = twOf(s.textIndent); if (v >= 0) ind.firstLine = v; else ind.hanging = -v; } if (Object.keys(ind).length) o.indent = ind;
      return o;
    };
    async function blocks(container, out, ctx = {}) {
      for (const el of container.children) {
        const tag = el.tagName;
        if (el.classList.contains('pb')) { out.push(new D.Paragraph({ children: [new D.PageBreak()] })); continue; }
        if (el.classList.contains('toc')) {
          for (const line of el.children) {
            if (line.classList.contains('toc-t')) { out.push(new D.Paragraph({ children: [new D.TextRun({ text: line.textContent, bold: true, size: 28, color: '2F5496' })], spacing: { after: 120 } })); continue; }
            const sp = line.querySelectorAll('span'); const lvl = line.classList.contains('l3') ? 2 : line.classList.contains('l2') ? 1 : 0;
            out.push(new D.Paragraph({ indent: { left: lvl * 320 }, tabStops: [{ type: D.TabStopType.RIGHT, position: contentTw, leader: 'dot' }], children: [new D.TextRun({ text: sp[0] ? sp[0].textContent : line.textContent }), new D.TextRun({ children: [new D.Tab(), sp[2] ? sp[2].textContent : ''] })] }));
          }
          continue;
        }
        if (tag === 'UL' || tag === 'OL') { const inst = ++olInstance; await listItems(el, out, 0, inst); continue; }
        if (tag === 'TABLE') { out.push(await table(el)); continue; }
        if (tag === 'HR') { out.push(new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: '808080', space: 1 } } })); continue; }
        if (tag === 'BLOCKQUOTE') { const inner = [...el.children].some((c) => /^(P|DIV|UL|OL)$/.test(c.tagName)); if (inner) { await blocks(el, out, { ...ctx, quote: true }); } else out.push(new D.Paragraph({ ...paraOpts(el), indent: { left: 720, right: 720 }, children: await inlines(el, { i: true, color: '404040' }, []) })); continue; }
        if (tag === 'PRE') { const lines = el.textContent.split('\n'); out.push(new D.Paragraph({ shading: { type: D.ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' }, children: lines.flatMap((l, i) => [new D.TextRun({ text: l, font: 'Courier New', size: 20, break: i ? 1 : 0 })]) })); continue; }
        const f0 = ctx.quote ? { i: true, color: '404040' } : {};
        const po = paraOpts(el); if (ctx.quote) po.indent = { left: 720, right: 720 };
        if (/^H[1-4]$/.test(tag)) {
          const title = el.classList.contains('doc-title');
          out.push(new D.Paragraph({ ...po, heading: title ? D.HeadingLevel.TITLE : D.HeadingLevel['HEADING_' + tag[1]], children: await inlines(el, f0, []) }));
          continue;
        }
        if (el.classList.contains('doc-subtitle')) { out.push(new D.Paragraph({ ...po, children: await inlines(el, { size: 14, color: '5A5A5A' }, []) })); continue; }
        if (tag === 'IMG') { out.push(new D.Paragraph({ alignment: el.classList.contains('ctr') ? D.AlignmentType.CENTER : el.classList.contains('fr') ? D.AlignmentType.RIGHT : undefined, children: await inlines({ childNodes: [el] }, {}, []) })); continue; }
        // paragraphe (et contenu inline mêlé de blocs)
        const runs = await inlines(el, f0, []);
        const imgOnly = el.children.length === 1 && el.children[0].tagName === 'IMG' && !el.textContent.trim();
        if (imgOnly && el.children[0].classList.contains('ctr')) po.alignment = D.AlignmentType.CENTER;
        out.push(new D.Paragraph({ ...po, children: runs }));
        const nested = [...el.children].filter((c) => /^(UL|OL|TABLE)$/.test(c.tagName)); for (const n of nested) await blocks({ children: [n] }, out, ctx);
      }
      return out;
    }
    async function listItems(list, out, level, inst) {
      const ordered = list.tagName === 'OL';
      for (const li of list.children) {
        if (li.tagName !== 'LI') { if (/^(UL|OL)$/.test(li.tagName)) await listItems(li, out, level + 1, ordered ? inst : ++olInstance); continue; }
        out.push(new D.Paragraph({ ...paraOpts(li), numbering: { reference: ordered ? 'num' : 'bul', level: Math.min(level, 8), ...(ordered ? { instance: inst } : {}) }, children: await inlines(li, {}, []) }));
        for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') await listItems(sub, out, level + 1, sub.tagName === 'OL' ? ++olInstance : inst);
      }
    }
    async function table(tbl) {
      const rows = [...tbl.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')];
      const ncol = Math.max(...rows.map((r) => [...r.children].reduce((a, c) => a + (+c.getAttribute('colspan') || 1), 0)), 1);
      const nb = tbl.classList.contains('nb');
      const border = nb ? { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' } : { style: D.BorderStyle.SINGLE, size: 4, color: '808080' };
      const trs = [];
      for (const tr of rows) {
        const hdr = tr.classList.contains('hdr') || [...tr.children].every((c) => c.tagName === 'TH');
        const cells = [];
        for (const td of tr.children) {
          const kids = []; const hasBlocks = [...td.children].some((c) => /^(P|DIV|UL|OL|H\d|TABLE)$/.test(c.tagName));
          if (hasBlocks) await blocks(td, kids); else kids.push(new D.Paragraph({ ...paraOpts(td), children: await inlines(td, hdr ? { b: true } : {}, []) }));
          if (!kids.length) kids.push(new D.Paragraph(''));
          const bg = hex(td.style.backgroundColor) || (hdr && !nb ? 'D9E2F3' : undefined);
          cells.push(new D.TableCell({ children: kids, columnSpan: +td.getAttribute('colspan') || undefined, rowSpan: +td.getAttribute('rowspan') || undefined, shading: bg ? { type: D.ShadingType.CLEAR, fill: bg, color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: { top: border, bottom: border, left: border, right: border } }));
        }
        trs.push(new D.TableRow({ children: cells, tableHeader: hdr }));
      }
      return new D.Table({ rows: trs, width: { size: 100, type: D.WidthType.PERCENTAGE }, columnWidths: Array.from({ length: ncol }, () => Math.round(contentTw / ncol)) });
    }
    // en-tête / pied de page : {n} et {N} deviennent des champs
    async function hfParas(html, withNum, pos) {
      const out = [];
      if (html) {
        const div = document.createElement('div'); div.innerHTML = html.replace(/\{date\}/g, new Date().toLocaleDateString('fr-FR')).replace(/\{titre\}/g, esc(doc.title));
        for (const p of (div.children.length ? div.children : [div])) {
          const runs = []; const parts = p.innerHTML.split(/(\{n\}|\{N\})/);
          for (const part of parts) { if (part === '{n}') runs.push(new D.TextRun({ children: [D.PageNumber.CURRENT] })); else if (part === '{N}') runs.push(new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES] })); else if (part) { const tmp = document.createElement('span'); tmp.innerHTML = part; runs.push(...(await inlines(tmp, { size: 10, color: '555555' }, []))); } }
          out.push(new D.Paragraph({ ...paraOpts(p), children: runs }));
        }
      }
      if (withNum) {
        const fmt = doc.pageNum.fmt || '{n}'; const runs = fmt.split(/(\{n\}|\{N\})/).filter(Boolean).map((x) => (x === '{n}' ? new D.TextRun({ children: [D.PageNumber.CURRENT], size: 20 }) : x === '{N}' ? new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], size: 20 }) : new D.TextRun({ text: x, size: 20 })));
        out.push(new D.Paragraph({ alignment: pos.endsWith('left') ? D.AlignmentType.LEFT : pos.endsWith('right') ? D.AlignmentType.RIGHT : D.AlignmentType.CENTER, children: runs }));
      }
      return out;
    }
    if (T.view === 'page') T.paginate();
    const children = await blocks(T.body, []);
    const pn = doc.pageNum || {}; const numTop = pn.show && /^top/.test(pn.pos), numBottom = pn.show && /^bottom/.test(pn.pos);
    const headerKids = await hfParas(doc.header, numTop, pn.pos || ''); const footerKids = await hfParas(doc.footer, numBottom, pn.pos || '');
    const [w, h] = T.SIZES[doc.page.size] || T.SIZES.A4; const land = doc.page.orient === 'l';
    const m = doc.page.margins;
    const bulLevels = Array.from({ length: 9 }, (_, l) => ({ level: l, format: D.LevelFormat.BULLET, text: ['•', '○', '▪'][l % 3], alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + l * 360, hanging: 360 } } } }));
    const numLevels = Array.from({ length: 9 }, (_, l) => ({ level: l, format: [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN][l % 3], text: `%${l + 1}.`, alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + l * 360, hanging: 360 } } } }));
    const docx = new D.Document({
      creator: 'Texte Joe', title: doc.title,
      styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 160, line: 276 } } } } },
      numbering: { config: [{ reference: 'bul', levels: bulLevels }, { reference: 'num', levels: numLevels }] },
      sections: [{
        properties: { titlePage: !!doc.firstDiff, page: { size: { width: Math.round((land ? h : w) * TWIP_MM), height: Math.round((land ? w : h) * TWIP_MM), orientation: land ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT }, margin: { top: Math.round(m.t * TWIP_MM), bottom: Math.round(m.b * TWIP_MM), left: Math.round(m.l * TWIP_MM), right: Math.round(m.r * TWIP_MM), header: 600, footer: 600 } } },
        headers: { default: new D.Header({ children: headerKids.length ? headerKids : [new D.Paragraph('')] }), ...(doc.firstDiff ? { first: new D.Header({ children: [new D.Paragraph('')] }) } : {}) },
        footers: { default: new D.Footer({ children: footerKids.length ? footerKids : [new D.Paragraph('')] }), ...(doc.firstDiff ? { first: new D.Footer({ children: [new D.Paragraph('')] }) } : {}) },
        children: children.length ? children : [new D.Paragraph('')],
      }],
    });
    return D.Packer.toBlob(docx);
  }
  async function saveDocx() {
    const blob = await buildDocx(); download(blob, fileBase() + '.docx'); T.markSaved();
    toast(T.doc.watermark ? 'Document enregistré en .docx (le filigrane n\'est pas repris dans Word)' : 'Document enregistré en .docx', 5000);
  }

  /* ================= Import DOCX et autres formats ================= */
  async function readDocx(file) {
    await loadScript('lib/mammoth.min.js');
    const M = window.mammoth; const buf = await file.arrayBuffer();
    const res = await M.convertToHtml({ arrayBuffer: buf }, {
      styleMap: ["p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Titre'] => h1.doc-title:fresh", "p[style-name='Subtitle'] => p.doc-subtitle:fresh", "p[style-name='Sous-titre'] => p.doc-subtitle:fresh", "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Citation'] => blockquote:fresh", "p[style-name='al-center'] => p.al-center:fresh", "p[style-name='al-right'] => p.al-right:fresh", "p[style-name='al-justify'] => p.al-justify:fresh", 'u => u', 'strike => s'],
      transformDocument: M.transforms.paragraph((p) => (!p.styleName || /^(normal|body text|corps de texte|standard)/i.test(p.styleName)) && p.alignment && p.alignment !== 'left' ? { ...p, styleName: 'al-' + (p.alignment === 'both' ? 'justify' : p.alignment) } : p),
    });
    const d = T.newDocModel(); d.title = baseName(file.name); d.html = res.value || '<p><br></p>';
    // format de page, en-tête et pied de page lus dans le XML
    try {
      const zip = await window.JSZip.loadAsync(buf); const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const x = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
      const sect = [...x.getElementsByTagNameNS(W, 'sectPr')].pop();
      if (sect) {
        const sz = sect.getElementsByTagNameNS(W, 'pgSz')[0], mar = sect.getElementsByTagNameNS(W, 'pgMar')[0];
        if (sz) { const wv = +sz.getAttributeNS(W, 'w') / TWIP_MM, hv = +sz.getAttributeNS(W, 'h') / TWIP_MM; const land = wv > hv; const a = Math.min(wv, hv), b = Math.max(wv, hv); const size = Object.entries(T.SIZES).find(([, s]) => Math.abs(s[0] - a) < 3 && Math.abs(s[1] - b) < 3); d.page.size = size ? size[0] : 'A4'; d.page.orient = land ? 'l' : 'p'; }
        if (mar) d.page.margins = { t: Math.round(+mar.getAttributeNS(W, 'top') / TWIP_MM) || 25, b: Math.round(+mar.getAttributeNS(W, 'bottom') / TWIP_MM) || 25, l: Math.round(+mar.getAttributeNS(W, 'left') / TWIP_MM) || 25, r: Math.round(+mar.getAttributeNS(W, 'right') / TWIP_MM) || 25 };
        d.firstDiff = sect.getElementsByTagNameNS(W, 'titlePg').length > 0;
        const relx = zip.file('word/_rels/document.xml.rels') ? new DOMParser().parseFromString(await zip.file('word/_rels/document.xml.rels').async('string'), 'application/xml') : null;
        const target = (id) => { const r = relx && [...relx.documentElement.children].find((e) => e.getAttribute('Id') === id); return r ? 'word/' + r.getAttribute('Target').replace(/^\//, '') : null; };
        const hf = async (tag) => { const ref = [...sect.getElementsByTagNameNS(W, tag)].find((e) => (e.getAttributeNS(W, 'type') || 'default') === 'default'); const t = ref && target(ref.getAttributeNS(R, 'id')); if (!t || !zip.file(t)) return { html: '', num: false }; const hx = new DOMParser().parseFromString(await zip.file(t).async('string'), 'application/xml'); const num = /PAGE/.test(hx.documentElement.textContent + [...hx.getElementsByTagNameNS(W, 'instrText')].map((n) => n.textContent).join('') + [...hx.getElementsByTagNameNS(W, 'fldSimple')].map((n) => n.getAttributeNS(W, 'instr')).join('')); const paras = [...hx.getElementsByTagNameNS(W, 'p')].map((p) => [...p.getElementsByTagNameNS(W, 't')].map((t2) => t2.textContent).join('')).filter((s) => s.trim()); return { html: paras.map((s) => `<p>${esc(s)}</p>`).join(''), num }; };
        const H = await hf('headerReference'), F = await hf('footerReference');
        d.header = H.html; d.footer = F.html; d.pageNum = { show: H.num || F.num, pos: H.num && !F.num ? 'top-right' : 'bottom-center', fmt: 'Page {n} sur {N}' };
      }
    } catch (e) { console.warn('mise en page non lue', e); }
    return d;
  }
  function mdToHtml(md) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
    const out = []; let list = null;
    for (const line of md.split(/\r?\n/)) {
      const m = /^(#{1,4})\s+(.*)$/.exec(line), b = /^\s*[-*+]\s+(.*)$/.exec(line), n = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (b || n) { const t = b ? 'ul' : 'ol'; if (list !== t) { if (list) out.push(`</${list}>`); out.push(`<${t}>`); list = t; } out.push(`<li>${inline((b || n)[1])}</li>`); continue; }
      if (list) { out.push(`</${list}>`); list = null; }
      if (m) out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); else if (/^>\s?/.test(line)) out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); else if (/^(---|\*\*\*)\s*$/.test(line)) out.push('<hr>'); else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push(`</${list}>`);
    return out.join('');
  }
  async function openDialog() { const [f] = await pickFiles('.docx,.pdf,application/pdf,.txt,.html,.htm,.md,.joedoc,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain', false); if (f) openFile(f); }
  async function openFile(f) {
    const n = f.name.toLowerCase();
    try {
      await T.autosave();
      let d;
      if (n.endsWith('.docx')) { toast('Lecture du document Word…', 15000); d = await readDocx(f); }
      else if (n.endsWith('.pdf')) {
        toast('Conversion du PDF en document modifiable…', 60000);
        const m = await Studio.pdfConvert.analyzeFile(f, { onProgress: (i, k, what) => toast(`Conversion du PDF : page ${i + 1} sur ${k}${what === 'ocr' ? ' (reconnaissance du texte)' : ''}…`, 60000) });
        d = Studio.pdfConvert.toTexteDoc(m, baseName(f.name));
      }
      else if (n.endsWith('.doc')) throw new Error('l\'ancien format .doc n\'est pas pris en charge : enregistrez-le en .docx depuis Word');
      else if (n.endsWith('.odt')) throw new Error('format .odt : enregistrez-le en .docx depuis LibreOffice');
      else if (/\.(joedoc|json)$/.test(n)) { d = JSON.parse(await f.text()); if (d.app !== 'texte-joe') throw new Error('fichier non reconnu'); delete d.app; }
      else if (/\.html?$/.test(n)) { d = T.newDocModel(); d.html = await f.text(); }
      else if (n.endsWith('.md')) { d = T.newDocModel(); d.html = mdToHtml(await f.text()); }
      else { d = T.newDocModel(); d.html = (await f.text()).split(/\r?\n/).map((l) => `<p>${esc(l) || '<br>'}</p>`).join(''); }
      d.id = T.newDocModel().id; d.title = baseName(f.name);
      T.loadDoc(d); T.autosave(); toast(`« ${f.name} » ouvert`);
    } catch (e) { console.error(e); toast('Ouverture impossible : ' + e.message, 8000); }
  }
  Studio.onImport('texte', (fs) => openFile(fs[0]));
  Studio.onDropFiles(document.getElementById('desk'), (files) => { const f = files[0]; if (!f) return; if (/^image\//.test(f.type)) { T.focusBody(); Promise.all(files.map((x) => Studio.readAsDataURL(x))).then((urls) => urls.forEach((u) => T.exec('insertHTML', `<img src="${u}" style="max-width:100%">`, false))); } else openFile(f); });

  /* ================= PDF et impression ================= */
  const SHEET_CSS = '.sheet{position:absolute;left:0;top:0;background:#fff;overflow:hidden}.sheet .hf{position:absolute;color:#555;font:10pt Calibri,Carlito,"Segoe UI",Arial,sans-serif;overflow:hidden}.sheet .wm{position:absolute;inset:0;display:grid;place-items:center}.sheet .wm span{transform:rotate(-40deg);font:700 96px Arial,sans-serif;white-space:nowrap}';
  async function downloadPdf() {
    const wasMobile = T.view !== 'page'; if (wasMobile) T.setView('page'); else T.paginate();
    await new Promise((r) => setTimeout(r, 120));
    await loadScript('lib/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf; const D = T.dims(); const N = T.pageCount; const stride = D.ph + T.GAP;
    const [w, h] = T.SIZES[T.doc.page.size] || T.SIZES.A4; const land = T.doc.page.orient === 'l'; const pw = land ? h : w, ph = land ? w : h;
    const pdf = new jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: [pw, ph] });
    const bodyClone = T.body.cloneNode(true); bodyClone.removeAttribute('contenteditable'); bodyClone.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel'));
    const bodyHtml = new XMLSerializer().serializeToString(bodyClone);
    const sheetsEl = document.getElementById('sheets');
    toast('Création du PDF…', 60000);
    const k = 2;
    for (let i = 0; i < N; i++) {
      const sheet = sheetsEl.children[i] ? sheetsEl.children[i].cloneNode(true) : document.createElement('div'); sheet.style.top = '0';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${D.pw * k}" height="${D.ph * k}"><foreignObject x="0" y="0" width="${D.pw}" height="${D.ph}" transform="scale(${k})"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${D.pw}px;height:${D.ph}px;overflow:hidden;background:#fff"><style>${(T.DOC_CSS + SHEET_CSS).replace(/</g, '\\3c ')}</style>${new XMLSerializer().serializeToString(sheet)}<div style="position:absolute;left:0;top:${-i * stride}px;width:${D.pw}px">${bodyHtml}</div></div></foreignObject></svg>`;
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
      const c = document.createElement('canvas'); c.width = Math.round(D.pw * k); c.height = Math.round(D.ph * k); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      if (i) pdf.addPage([pw, ph], land ? 'landscape' : 'portrait');
      pdf.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pw, ph);
    }
    if (wasMobile) T.setView('mobile');
    download(pdf.output('blob'), fileBase() + '.pdf'); toast('PDF créé (' + N + ' page' + (N > 1 ? 's' : '') + ')');
  }
  function printDoc() {
    const d = T.doc; const [w, h] = T.SIZES[d.page.size] || T.SIZES.A4; const land = d.page.orient === 'l'; const m = d.page.margins;
    const cssStr = (t) => '"' + String(t).replace(/["\\]/g, ' ') + '"';
    const contentExpr = (tpl) => tpl.split(/(\{n\}|\{N\})/).filter(Boolean).map((p) => (p === '{n}' ? 'counter(page)' : p === '{N}' ? 'counter(pages)' : cssStr(p))).join(' ');
    const plain = (html) => { const x = document.createElement('div'); x.innerHTML = T.hfText(html || '', '{n}', '{N}').replace(/<\/p>/g, ' — </p>'); return x.textContent.replace(/\s—\s*$/, '').trim(); };
    const pn = d.pageNum || {}; const boxes = [];
    if (d.header) boxes.push(`@top-center{content:${contentExpr(plain(d.header))};font:9pt Calibri,Arial;color:#555}`);
    if (d.footer) boxes.push(`@bottom-left{content:${contentExpr(plain(d.footer))};font:9pt Calibri,Arial;color:#555}`);
    if (pn.show) { const pos = (pn.pos || 'bottom-center').replace('bottom-', 'bottom-').replace('top-', 'top-'); boxes.push(`@${pos}{content:${contentExpr(pn.fmt || '{n}')};font:10pt Calibri,Arial;color:#555}`); }
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>@page{size:${land ? h : w}mm ${land ? w : h}mm;margin:${m.t}mm ${m.r}mm ${m.b}mm ${m.l}mm;${boxes.join('')}}${d.firstDiff ? '@page:first{@top-center{content:none}@bottom-center{content:none}@bottom-left{content:none}@bottom-right{content:none}@top-right{content:none}}' : ''}html,body{margin:0;background:#fff}${T.DOC_CSS}.doc-body{padding:0!important}.doc-body table,.doc-body img{break-inside:avoid}.doc-body h1,.doc-body h2,.doc-body h3{break-after:avoid}${d.watermark && d.watermark.text ? `.wm{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:-1}.wm span{transform:rotate(-40deg);font:700 96px Arial;color:${d.watermark.color};opacity:${d.watermark.opacity}}` : ''}</style></head><body>${d.watermark && d.watermark.text ? `<div class="wm"><span>${esc(d.watermark.text)}</span></div>` : ''}<div class="doc-body">${T.getHTML()}</div></body></html>`;
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    const fd = f.contentDocument; fd.open(); fd.write(html); fd.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Impression impossible : utilisez « Télécharger en PDF »'); } setTimeout(() => f.remove(), 60000); }, 400);
  }
  function saveTxt() { download(new Blob([T.body.innerText.replace(/\u200b/g, '')], { type: 'text/plain;charset=utf-8' }), fileBase() + '.txt'); }
  function saveHtml() { download(new Blob([`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(T.doc.title)}</title><style>body{max-width:800px;margin:30px auto;padding:0 20px}${T.DOC_CSS}</style></head><body><div class="doc-body">${T.getHTML()}</div></body></html>`], { type: 'text/html' }), fileBase() + '.html'); }
  function saveJoe() { const d = { app: 'texte-joe', ...T.doc, html: T.getHTML() }; download(new Blob([JSON.stringify(d)], { type: 'application/json' }), fileBase() + '.joedoc'); T.markSaved(); toast('Document enregistré (.joedoc)'); }

  /* ================= Bibliothèque locale ================= */
  async function newDoc(html, title) { await T.autosave(); const d = T.newDocModel(); if (html) d.html = html; if (title) d.title = title; T.loadDoc(d); await T.autosave(); return d; }
  async function library() {
    await T.autosave();
    const list = (await T.idb.all('docs')).sort((a, b) => b.updated - a.updated);
    const res = await modal({
      title: 'Mes documents (enregistrés sur cet appareil)', wide: true,
      body: list.length ? `<div class="doclist">${list.map((d) => `<div class="it"><div><b>${esc(d.title)}</b>${d.id === T.doc.id ? ' <span class="badge">ouvert</span>' : ''}<br><span class="hint">Modifié le ${new Date(d.updated).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${d.words || 0} mots</span></div><div class="row"><button type="button" data-o="${d.id}" class="primary">Ouvrir</button><button type="button" data-c="${d.id}">Dupliquer</button><button type="button" data-d="${d.id}" class="danger">Supprimer</button></div></div>`).join('')}</div>` : '<p>Aucun document pour l\'instant.</p>',
      onOpen: (b) => b.addEventListener('click', async (e) => {
        const bt = e.target.closest('button'); if (!bt) return; const id = bt.dataset.o || bt.dataset.c || bt.dataset.d; if (!id) return;
        if (bt.dataset.o) { b.dataset.r = 'o:' + id; b.closest('.modal').querySelector('footer button').click(); }
        if (bt.dataset.c) { const d = await T.idb.get('docs', id); const c = { ...d, id: T.newDocModel().id, title: d.title + ' (copie)', updated: Date.now() }; await T.idb.set('docs', c.id, c); b.dataset.r = 'o:' + c.id; b.closest('.modal').querySelector('footer button').click(); }
        if (bt.dataset.d) { if (id === T.doc.id) { toast('Ouvrez un autre document avant de supprimer celui-ci'); return; } if (await confirmBox('Supprimer définitivement ce document de l\'appareil ?', 'Supprimer')) { await T.idb.del('docs', id); bt.closest('.it').remove(); } }
      }),
      buttons: [{ label: 'Fermer', value: (b) => b.dataset.r || null }],
    });
    if (res && res.startsWith('o:')) { const d = await T.idb.get('docs', res.slice(2)); if (d) { T.loadDoc(d); await T.autosave(); } }
  }

  /* ================= Modèles ================= */
  const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const nbTable = (l, r) => `<table class="nb"><tbody><tr><td style="width:55%">${l}</td><td style="text-align:center">${r}</td></tr></tbody></table>`;
  const TEMPLATES = {
    lettre: { title: 'Lettre administrative', desc: 'En-tête de service, références, objet, formule de politesse', html: () => `${nbTable('<p style="text-align:center"><b>MINISTÈRE DE …</b></p><p style="text-align:center">----------</p><p style="text-align:center">DIRECTION / SERVICE …</p><p style="text-align:center">----------</p><p>N° ______ /…/…/…</p>', '<p><b>BURKINA FASO</b></p><p style="text-align:center">----------</p><p style="text-align:center"><i>[Devise nationale]</i></p>')}<p><br></p><p style="text-align:right">Ouagadougou, le ${today()}</p><p><br></p><p style="margin-left:9cm">Le [Titre de l'expéditeur]</p><p style="margin-left:9cm">à</p><p style="margin-left:9cm">Monsieur / Madame le [Titre du destinataire]</p><p style="margin-left:9cm">[Ville]</p><p><br></p><p><b><u>Objet</u> :</b> [objet de la lettre]</p><p><b><u>Réf.</u> :</b> [références éventuelles]</p><p><br></p><p>Monsieur / Madame le [Titre],</p><p style="text-align:justify">J'ai l'honneur de [exposer l'objet de la lettre]…</p><p style="text-align:justify">[Développement]</p><p style="text-align:justify">Je vous prie d'agréer, Monsieur / Madame le [Titre], l'expression de ma considération distinguée.</p><p><br></p><p style="margin-left:9cm;text-align:center"><b>Le [Titre de l'expéditeur]</b></p><p><br></p><p><br></p><p style="margin-left:9cm;text-align:center"><b><u>[Prénom NOM]</u></b></p><p style="margin-left:9cm;text-align:center"><i>[Distinction honorifique]</i></p>` },
    note: { title: 'Note de service', desc: 'Destinataires, objet, contenu, ampliations', html: () => `${nbTable('<p style="text-align:center"><b>[STRUCTURE]</b></p><p style="text-align:center">----------</p><p>N° ______ /…/…</p>', '<p><b>BURKINA FASO</b></p><p style="text-align:center"><i>[Devise nationale]</i></p>')}<p><br></p><h1 class="doc-title" style="text-align:center">NOTE DE SERVICE</h1><p><br></p><p><b>Destinataires :</b> l'ensemble du personnel de [service]</p><p><b>Objet :</b> [objet]</p><p><br></p><p style="text-align:justify">Il est porté à la connaissance de l'ensemble du personnel que […].</p><p style="text-align:justify">[Dispositions, dates, modalités.]</p><p style="text-align:justify">J'attache du prix au strict respect de la présente note.</p><p><br></p><p style="text-align:right">[Ville], le ${today()}</p><p style="margin-left:9cm;text-align:center"><b>Le [Titre]</b></p><p><br></p><p style="margin-left:9cm;text-align:center"><b><u>[Prénom NOM]</u></b></p><p><br></p><p><b><u>Ampliations</u> :</b></p><ul><li>Archives</li><li>Chrono</li></ul>` },
    pv: { title: 'Procès-verbal de réunion', desc: 'Présents, ordre du jour, déroulement, décisions, signatures', html: () => `<h1 class="doc-title" style="text-align:center">PROCÈS-VERBAL DE RÉUNION</h1><p style="text-align:center">[Nom de l'instance]</p><p><br></p><p>L'an deux mille vingt-six et le [date], s'est tenue à [lieu], de [heure] à [heure], une réunion de [instance] sous la présidence de [Prénom NOM, Titre].</p><h2>Participants</h2><table><tbody><tr class="hdr"><td>N°</td><td>Nom et prénom(s)</td><td>Fonction / structure</td></tr><tr><td>1</td><td></td><td></td></tr><tr><td>2</td><td></td><td></td></tr><tr><td>3</td><td></td><td></td></tr></tbody></table><h2>Ordre du jour</h2><ol><li>[Point 1]</li><li>[Point 2]</li><li>Divers</li></ol><h2>Déroulement</h2><h3>Point 1 : [intitulé]</h3><p style="text-align:justify">[Résumé des échanges.]</p><h3>Point 2 : [intitulé]</h3><p style="text-align:justify">[Résumé des échanges.]</p><h2>Décisions et recommandations</h2><table><tbody><tr class="hdr"><td>Décision / action</td><td>Responsable</td><td>Échéance</td></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table><p>L'ordre du jour étant épuisé, la séance a été levée à [heure].</p><p><br></p>${nbTable('<p style="text-align:center"><b>Le secrétaire de séance</b></p><p><br></p><p><br></p><p style="text-align:center"><b>[Prénom NOM]</b></p>', '<p><b>Le président de séance</b></p><p><br></p><p><br></p><p><b>[Prénom NOM]</b></p>')}` },
    rapport: { title: 'Rapport', desc: 'Page de garde, sommaire, chapitres, conclusion', html: () => `<p><br></p><p><br></p><p><br></p><h1 class="doc-title" style="text-align:center">RAPPORT [TITRE]</h1><p class="doc-subtitle" style="text-align:center">[Sous-titre ou période couverte]</p><p><br></p><p style="text-align:center">Présenté par [Prénom NOM]</p><p style="text-align:center">${today()}</p><div class="pb"></div><div class="toc" contenteditable="false"><p class="toc-t">Sommaire</p></div><div class="pb"></div><h1>Introduction</h1><p style="text-align:justify">[Contexte, objectifs du rapport, méthodologie.]</p><h1>I. Bilan</h1><h2>1.1 Réalisations</h2><p style="text-align:justify">[Texte.]</p><h2>1.2 Difficultés</h2><p style="text-align:justify">[Texte.]</p><h1>II. Analyse</h1><p style="text-align:justify">[Texte.]</p><h1>III. Recommandations</h1><ul><li>[Recommandation 1]</li><li>[Recommandation 2]</li></ul><h1>Conclusion</h1><p style="text-align:justify">[Texte.]</p>`, setup: (d) => { d.pageNum = { show: true, pos: 'bottom-center', fmt: 'Page {n} sur {N}' }; d.firstDiff = true; } },
    attestation: { title: 'Attestation', desc: 'Attestation de travail, de service fait ou de présence', html: () => `${nbTable('<p style="text-align:center"><b>[STRUCTURE]</b></p><p style="text-align:center">----------</p><p>N° ______ /…/…</p>', '<p><b>BURKINA FASO</b></p><p style="text-align:center"><i>[Devise nationale]</i></p>')}<p><br></p><p><br></p><h1 class="doc-title" style="text-align:center"><u>ATTESTATION DE TRAVAIL</u></h1><p><br></p><p style="text-align:justify;line-height:2">Je soussigné(e), [Prénom NOM], [Titre], atteste que Monsieur / Madame [Prénom NOM], matricule [n°], [emploi / grade], est en service à [structure] depuis le [date].</p><p style="text-align:justify;line-height:2">En foi de quoi, la présente attestation lui est délivrée pour servir et valoir ce que de droit.</p><p><br></p><p style="text-align:right">[Ville], le ${today()}</p><p style="margin-left:9cm;text-align:center"><b>Le [Titre]</b></p><p><br></p><p><br></p><p style="margin-left:9cm;text-align:center"><b><u>[Prénom NOM]</u></b></p>` },
    demande: { title: 'Demande', desc: 'Demande de congé, d\'autorisation d\'absence, de stage…', html: () => `<p>[Prénom NOM]</p><p>[Fonction / matricule]</p><p>[Service]</p><p>Tél. : [numéro]</p><p style="text-align:right">[Ville], le ${today()}</p><p><br></p><p style="margin-left:9cm">À Monsieur / Madame le [Titre]</p><p style="margin-left:9cm">[Structure]</p><p><br></p><p><b><u>Objet</u> : Demande de [congé annuel / autorisation d'absence]</b></p><p><br></p><p>Monsieur / Madame le [Titre],</p><p style="text-align:justify">J'ai l'honneur de solliciter de votre haute bienveillance [l'octroi d'un congé annuel de … jours, du … au …] pour [motif].</p><p style="text-align:justify">Dans l'attente d'une suite favorable, je vous prie d'agréer, Monsieur / Madame le [Titre], l'expression de mon profond respect.</p><p><br></p><p style="margin-left:9cm;text-align:center">[Signature]</p><p style="margin-left:9cm;text-align:center"><b>[Prénom NOM]</b></p>` },
    mission: { title: 'Ordre de mission', desc: 'Missionnaire, objet, itinéraire, durée, moyens', html: () => `${nbTable('<p style="text-align:center"><b>[STRUCTURE]</b></p><p>N° ______ /…/…</p>', '<p><b>BURKINA FASO</b></p><p style="text-align:center"><i>[Devise nationale]</i></p>')}<p><br></p><h1 class="doc-title" style="text-align:center">ORDRE DE MISSION</h1><p><br></p><table><tbody><tr><td style="width:35%"><b>Nom et prénom(s)</b></td><td></td></tr><tr><td><b>Matricule / emploi</b></td><td></td></tr><tr><td><b>Objet de la mission</b></td><td></td></tr><tr><td><b>Itinéraire</b></td><td>[Ville de départ] – [destination] – [retour]</td></tr><tr><td><b>Date de départ</b></td><td></td></tr><tr><td><b>Date de retour</b></td><td></td></tr><tr><td><b>Moyen de transport</b></td><td></td></tr><tr><td><b>Imputation budgétaire</b></td><td></td></tr></tbody></table><p><br></p><p style="text-align:right">[Ville], le ${today()}</p><p style="margin-left:9cm;text-align:center"><b>Le [Titre]</b></p><p><br></p><p><br></p><p style="margin-left:9cm;text-align:center"><b><u>[Prénom NOM]</u></b></p><p><br></p><table><tbody><tr class="hdr"><td>Visa à l'arrivée</td><td>Visa au départ</td></tr><tr><td style="height:80px"></td><td></td></tr></tbody></table>` },
    cv: { title: 'Curriculum vitae', desc: 'Profil, expériences, formations, compétences', html: () => `<h1 class="doc-title">[Prénom NOM]</h1><p class="doc-subtitle">[Titre professionnel]</p><p>[Ville] · [Téléphone] · [E-mail]</p><hr><h1>Profil</h1><p style="text-align:justify">[Deux ou trois phrases sur votre parcours et vos atouts.]</p><h1>Expérience professionnelle</h1><h3>[Poste] — [Employeur] ([année] – [année])</h3><ul><li>[Réalisation ou responsabilité]</li><li>[Réalisation ou responsabilité]</li></ul><h3>[Poste] — [Employeur] ([année] – [année])</h3><ul><li>[Réalisation]</li></ul><h1>Formation</h1><ul><li><b>[Diplôme]</b>, [établissement] ([année])</li></ul><h1>Compétences</h1><ul><li>Comptabilité publique, [logiciels]</li><li>Langues : français, [autres]</li></ul>` },
  };
  async function templatesDialog() {
    const r = await modal({
      title: 'Nouveau document à partir d\'un modèle', wide: true,
      body: `<div class="tpl-grid">${Object.entries(TEMPLATES).map(([k, t]) => `<button type="button" data-t="${k}"><b>${esc(t.title)}</b><span>${esc(t.desc)}</span></button>`).join('')}</div><p class="hint">Remplacez les passages entre crochets [ ]. Le document actuel reste dans « Mes documents ».</p>`,
      onOpen: (b) => b.querySelectorAll('[data-t]').forEach((x) => { x.onclick = () => { b.dataset.t = x.dataset.t; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
      buttons: [{ label: 'Annuler', value: null }, { label: 'Créer', primary: true, value: (b) => b.dataset.t || null }],
    });
    if (!r) return;
    const t = TEMPLATES[r]; await T.autosave(); const d = T.newDocModel(); d.title = t.title; d.html = t.html(); if (t.setup) t.setup(d); T.loadDoc(d);
    if (d.html.includes('class="toc"')) setTimeout(() => T.updateToc(), 400);
    await T.autosave();
  }

  /* ================= Publipostage ================= */
  let mergeData = null; // { name, fields: [], rows: [[]] }
  function fromTableurAutosave() {
    try {
      const o = JSON.parse(localStorage.getItem('tableur-autosave') || 'null'); if (!o || !o.sheets) return null;
      return o.sheets.map((S) => {
        const grid = []; for (const [r, c, v, , s] of S.cells || []) { (grid[r] = grid[r] || [])[c] = v === null || v === undefined ? '' : typeof v === 'number' && s && s.fmt && /[dy]/i.test(s.fmt.replace(/"[^"]*"/g, '')) ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v); }
        return { name: S.name, grid: Array.from({ length: grid.length }, (_, i) => grid[i] || []) };
      });
    } catch (e) { return null; }
  }
  function tableFromGrid(name, grid) {
    let h = 0; while (h < grid.length && !(grid[h] || []).some((x) => String(x || '').trim())) h++;
    const fields = (grid[h] || []).map((x, i) => String(x || '').trim() || `Colonne ${i + 1}`);
    const rows = grid.slice(h + 1).filter((r) => r && r.some((x) => String(x || '').trim())).map((r) => fields.map((_, i) => String(r[i] ?? '')));
    return { name, fields, rows };
  }
  async function loadMergeFile(f) {
    const n = f.name.toLowerCase();
    if (n.endsWith('.csv') || n.endsWith('.txt')) {
      let t = await f.text(); t = t.replace(/^\ufeff/, ''); const sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
      const grid = t.split(/\r?\n/).map((l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; });
      return tableFromGrid(f.name, grid);
    }
    await loadScript('lib/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer()); const ws = wb.worksheets[0];
    const grid = []; ws.eachRow({ includeEmpty: true }, (row, rn) => { grid[rn - 1] = []; row.eachCell({ includeEmpty: true }, (cell, cn) => { let v = cell.value; if (v && typeof v === 'object') v = v instanceof Date ? v.toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : v.result !== undefined ? v.result : v.text !== undefined ? v.text : v.richText ? v.richText.map((x) => x.text).join('') : ''; if (typeof v === 'number') v = v.toLocaleString('fr-FR'); grid[rn - 1][cn - 1] = v ?? ''; }); });
    return tableFromGrid(f.name, Array.from({ length: grid.length }, (_, i) => grid[i] || []));
  }
  function insertField(name) { T.exec('insertHTML', `<span class="mf" contenteditable="false" data-f="${esc(name)}">«${esc(name)}»</span>\u200b`, false); }
  async function mergeFieldDialog() {
    T.focusBody(); const range = T.savedRange;
    const fields = mergeData ? mergeData.fields : [];
    const r = await modal({ title: 'Insérer un champ de publipostage', body: fields.length ? `<div class="row" style="flex-wrap:wrap">${fields.map((f) => `<button type="button" data-f="${esc(f)}">«${esc(f)}»</button>`).join('')}</div>` : '<p class="hint">Aucune source de données chargée : tapez le nom du champ (il devra correspondre à un titre de colonne), ou ouvrez d\'abord Outils → Publipostage.</p><input type="text" id="mfN" placeholder="ex. Nom">', onOpen: (b) => b.querySelectorAll('[data-f]').forEach((x) => { x.onclick = () => { b.dataset.f = x.dataset.f; b.closest('.modal').querySelector('footer button.primary').click(); }; }), buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => b.dataset.f || (b.querySelector('#mfN') && b.querySelector('#mfN').value.trim()) || null }] });
    if (r) { T.savedRange = range; insertField(r); }
  }
  async function mailMerge() {
    T.focusBody(); const range = T.savedRange;
    const sheets = fromTableurAutosave();
    const res = await modal({
      title: 'Publipostage : lettres en série', wide: true,
      body: `<p class="hint" style="margin:0">1. Choisissez la liste (une ligne par destinataire, la première ligne contient les titres : Nom, Adresse, Montant…). 2. Insérez les champs dans la lettre. 3. Créez les lettres.</p>
        <div class="row">${sheets ? `<select id="mmS">${sheets.map((s, i) => `<option value="${i}">Tableur Joe : feuille « ${esc(s.name)} »</option>`).join('')}</select><button type="button" id="mmT">Utiliser cette feuille</button>` : ''}<button type="button" id="mmF">Ouvrir un fichier (.xlsx, .csv)…</button></div>
        <div id="mmInfo" class="hint">${mergeData ? `Source : ${esc(mergeData.name)} — ${mergeData.rows.length} ligne(s)` : 'Aucune source chargée.'}</div>
        <div id="mmFields" class="row" style="flex-wrap:wrap"></div>
        <div class="grid2"><div class="field"><label for="mmOut">Résultat</label><select id="mmOut"><option value="doc">Un nouveau document (une lettre par page)</option><option value="pdf">Directement en PDF</option><option value="docx">Directement en Word (.docx)</option></select></div>
        <div class="field"><label for="mmFil">Seulement les lignes où (facultatif)</label><input type="text" id="mmFil" placeholder="ex. Statut = Relance"></div></div>`,
      onOpen: (b) => {
        const show = () => { b.querySelector('#mmInfo').textContent = mergeData ? `Source : ${mergeData.name} — ${mergeData.rows.length} ligne(s)` : 'Aucune source chargée.'; b.querySelector('#mmFields').innerHTML = mergeData ? '<span class="hint">Cliquez pour insérer à la position du curseur :</span>' + mergeData.fields.map((f) => `<button type="button" data-f="${esc(f)}">«${esc(f)}»</button>`).join('') : ''; };
        show();
        if (b.querySelector('#mmT')) b.querySelector('#mmT').onclick = () => { const s = sheets[+b.querySelector('#mmS').value]; mergeData = tableFromGrid('Tableur Joe — ' + s.name, s.grid); show(); };
        b.querySelector('#mmF').onclick = async () => { const [f] = await pickFiles('.xlsx,.csv,.txt', false); if (!f) return; try { mergeData = await loadMergeFile(f); show(); } catch (e) { toast('Lecture impossible : ' + e.message); } };
        b.querySelector('#mmFields').onclick = (e) => { const x = e.target.closest('[data-f]'); if (!x) return; T.savedRange = range; insertField(x.dataset.f); toast(`Champ «${x.dataset.f}» inséré`); };
      },
      buttons: [{ label: 'Fermer', value: null }, { label: 'Créer les lettres', primary: true, value: (b) => ({ out: b.querySelector('#mmOut').value, filter: b.querySelector('#mmFil').value.trim() }) }],
    });
    if (!res) return;
    if (!mergeData || !mergeData.rows.length) return toast('Chargez d\'abord une liste de destinataires');
    const tpl = T.getHTML(); if (!/class="mf"/.test(tpl)) return toast('Insérez d\'abord des champs «…» dans la lettre');
    let rows = mergeData.rows;
    if (res.filter) { const m = /^(.+?)\s*(=|≠|!=|contient)\s*(.*)$/i.exec(res.filter); if (m) { const i = mergeData.fields.findIndex((f) => f.toLowerCase() === m[1].trim().toLowerCase()); if (i >= 0) rows = rows.filter((r) => { const v = String(r[i]).toLowerCase(), w = m[3].trim().toLowerCase(); return m[2] === '=' ? v === w : /contient/i.test(m[2]) ? v.includes(w) : v !== w; }); } }
    if (!rows.length) return toast('Aucune ligne ne correspond au filtre');
    const fill = (row) => { const d = document.createElement('div'); d.innerHTML = tpl; d.querySelectorAll('.mf').forEach((s) => { const i = mergeData.fields.indexOf(s.dataset.f); s.replaceWith(document.createTextNode(i >= 0 ? row[i] : `«${s.dataset.f}»`)); }); return d.innerHTML; };
    const merged = rows.map(fill).join('<div class="pb"></div>');
    const original = { ...T.doc, html: tpl };
    const d = T.newDocModel(); Object.assign(d, { ...original, id: d.id, title: `${T.doc.title} — publipostage (${rows.length})`, html: merged });
    await T.autosave(); T.loadDoc(d);
    if (res.out === 'pdf') await downloadPdf(); else if (res.out === 'docx') await saveDocx();
    await T.autosave();
    toast(`${rows.length} lettre(s) créée(s). Le modèle d'origine est conservé dans « Mes documents ».`, 6000);
  }

  /* ================= Dictée et lecture ================= */
  let dictSession = null;
  async function dictate() {
    const btns = document.querySelectorAll('[data-act="dictate"]');
    if (dictSession) { dictSession.stop(); dictSession = null; btns.forEach((b) => { b.classList.remove('on'); }); toast('Dictée arrêtée'); return; }
    if (!Studio.speech) return toast('Dictée indisponible');
    T.focusBody();
    try {
      btns.forEach((b) => b.classList.add('on'));
      dictSession = await Studio.speech.start(Studio.speech.savedEngine(), {
        lang: Studio.speech.savedLang(),
        onFinal: (text) => { T.focusBody(); const s = getSelection(); const before = s.rangeCount && s.anchorNode.nodeType === 3 ? s.anchorNode.nodeValue.slice(0, s.anchorOffset) : ''; const sep = before && !/\s$/.test(before) && !/^[.,;:?!…]/.test(text) ? ' ' : ''; T.exec('insertText', sep + text); },
        onError: (m) => { toast('Dictée : ' + m, 6000); if (dictSession) dictSession.stop(); dictSession = null; btns.forEach((b) => b.classList.remove('on')); },
      });
      toast('Parlez : le texte s\'écrit à la position du curseur. « virgule », « point », « à la ligne » sont compris.', 5000);
    } catch (e) { dictSession = null; btns.forEach((b) => b.classList.remove('on')); toast('Dictée impossible : ' + (e.message || e), 6000); }
  }
  let readCtl = null;
  async function readAloud() {
    if (readCtl) { readCtl.stop(); readCtl = null; return; }
    if (!Studio.tts || !Studio.tts.available()) return toast('Lecture à voix haute indisponible dans ce navigateur');
    const s = getSelection(); let text = s.rangeCount && T.body.contains(s.anchorNode) && !s.isCollapsed ? s.toString() : '';
    if (!text && s.rangeCount && T.body.contains(s.anchorNode)) { const r = document.createRange(); r.setStart(s.anchorNode, s.anchorOffset); r.setEnd(T.body, T.body.childNodes.length); text = r.toString(); }
    if (!text.trim()) text = T.body.innerText;
    await Studio.tts.loadVoices();
    let pref = {}; try { pref = JSON.parse(localStorage.getItem('voix-prefs') || '{}'); } catch (e) { /* ignore */ }
    readCtl = Studio.tts.speak(text.replace(/\u200b/g, ''), { voiceURI: pref.voice || '', lang: 'fr-FR', rate: +(pref.rate || 1), onEnd: () => { readCtl = null; } });
    toast('Lecture en cours — Outils → Lire à voix haute pour arrêter', 4000);
  }

  /* ================= IA et traduction ================= */
  const blocksForAI = () => { const s = getSelection(); const sel = s.rangeCount && T.body.contains(s.anchorNode) && !s.isCollapsed; const list = sel ? T.selectedBlocks() : [...T.body.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,td,th')].filter((b) => !b.querySelector('p,li,table') && !b.closest('.toc')); return list.filter((b) => b.innerText.trim() && !b.querySelector('img,.mf')); };
  async function aiRewrite(kind) {
    const blocks = blocksForAI(); if (!blocks.length) return toast('Rien à traiter');
    const label = { fix: 'Corriger l\'orthographe et la grammaire', formal: 'Reformuler (plus officiel)', simple: 'Reformuler (plus simple)', short: 'Raccourcir' }[kind];
    const key = await Studio.ai.ensureKey({ title: label + ' : IA Claude', purpose: `le texte de ${blocks.length} paragraphe(s)` }); if (!key) return;
    await loadScript('lib/anthropic-sdk.js');
    const instr = { fix: 'Corrige uniquement l\'orthographe, la grammaire, la ponctuation et les accords, sans changer le style ni le sens. Si un paragraphe est correct, renvoie-le tel quel.', formal: 'Reformule dans un style administratif officiel, courtois et précis (correspondance administrative d\'Afrique de l\'Ouest francophone), sans ajouter d\'informations.', simple: 'Reformule en français simple et clair, phrases courtes, sans perdre d\'information.', short: 'Raccourcis chaque paragraphe d\'environ un tiers en gardant l\'essentiel.' }[kind];
    const texts = blocks.map((b) => b.innerText.trim()); const out = [];
    try {
      for (let i = 0; i < texts.length; i += 50) {
        toast(`Claude travaille… (${Math.min(i + 50, texts.length)} / ${texts.length})`, 60000);
        const part = texts.slice(i, i + 50);
        const r = await Studio.ai.callJson(key, { system: `Tu es un correcteur et rédacteur francophone. ${instr} Renvoie exactement un texte par paragraphe reçu, dans le même ordre. Conserve les crochets [ ] et les nombres.`, content: JSON.stringify(part), schema: { type: 'object', additionalProperties: false, required: ['paragraphs'], properties: { paragraphs: { type: 'array', items: { type: 'string' } } } } });
        if (!r.paragraphs || r.paragraphs.length !== part.length) throw new Error('réponse incomplète, réessayez sur une sélection plus courte');
        out.push(...r.paragraphs);
      }
    } catch (e) { return toast('IA indisponible : ' + e.message, 8000); }
    const changes = texts.map((t, i) => [t, out[i]]).filter(([a, b]) => a !== b);
    if (!changes.length) return toast('Aucune modification proposée');
    const ok = await modal({ title: `${label} — ${changes.length} paragraphe(s) modifié(s)`, wide: true, body: `<div style="max-height:55vh;overflow:auto;display:grid;gap:10px">${changes.slice(0, 40).map(([a, b]) => `<div style="border:1px solid var(--line);border-radius:8px;padding:8px"><div class="hint" style="text-decoration:line-through">${esc(a)}</div><div>${esc(b)}</div></div>`).join('')}</div><p class="hint">La mise en forme à l'intérieur des paragraphes modifiés (gras, couleurs) est retirée.</p>`, buttons: [{ label: 'Annuler', value: false }, { label: 'Appliquer', primary: true, value: true }] });
    if (ok) T.change(() => blocks.forEach((b, i) => { if (out[i] !== texts[i]) b.textContent = out[i]; }));
  }
  async function aiSummary() {
    const text = T.body.innerText.trim(); if (!text) return toast('Le document est vide');
    const key = await Studio.ai.ensureKey({ title: 'Résumer : IA Claude', purpose: 'le texte du document' }); if (!key) return;
    await loadScript('lib/anthropic-sdk.js'); toast('Claude résume…', 60000);
    try {
      const r = await Studio.ai.callJson(key, { system: 'Tu résumes des documents professionnels en français : un paragraphe de synthèse puis les points clés (5 au plus).', content: text.slice(0, 120000), schema: { type: 'object', additionalProperties: false, required: ['summary', 'points'], properties: { summary: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } } });
      const html = `<h2>Résumé</h2><p>${esc(r.summary)}</p><ul>${r.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
      const ins = await modal({ title: 'Résumé du document', body: `<div class="mini-ed">${html}</div>`, buttons: [{ label: 'Fermer', value: false }, { label: 'Insérer au début du document', primary: true, value: true }] });
      if (ins) T.change(() => T.body.insertAdjacentHTML('afterbegin', html));
    } catch (e) { toast('IA indisponible : ' + e.message, 8000); }
  }
  async function aiWrite() {
    T.focusBody(); const range = T.savedRange;
    const q = await modal({ title: 'Rédiger avec l\'IA', body: '<div class="field"><label for="awQ">Que faut-il rédiger ?</label><textarea id="awQ" style="min-height:120px" placeholder="ex. une lettre de relance au contribuable pour une taxe de 150 000 FCFA impayée depuis 3 mois, ton ferme mais courtois"></textarea></div>', onOpen: (b) => { b.querySelector('#awQ').focus(); Studio.speech && Studio.speech.attachMic(b.querySelector('#awQ')); }, buttons: [{ label: 'Annuler', value: null }, { label: 'Rédiger', primary: true, value: (b) => b.querySelector('#awQ').value.trim() }] });
    if (!q) return;
    const key = await Studio.ai.ensureKey({ title: 'Rédiger : IA Claude', purpose: 'votre consigne et le début du document' }); if (!key) return;
    await loadScript('lib/anthropic-sdk.js'); toast('Claude rédige…', 60000);
    try {
      const r = await Studio.ai.callJson(key, { system: 'Tu rédiges des textes professionnels en français (administration, comptabilité publique, collectivités d\'Afrique de l\'Ouest). Utilise des crochets [ ] pour les informations que tu ne connais pas (noms, dates, références). N\'invente pas de faits.', content: `Consigne : ${q}\n\nDébut du document actuel (contexte) :\n${T.body.innerText.slice(0, 3000)}`, schema: { type: 'object', additionalProperties: false, required: ['blocks'], properties: { blocks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'text'], properties: { type: { type: 'string', enum: ['h1', 'h2', 'p', 'bullet', 'number'] }, text: { type: 'string' } } } } } } });
      let html = '', list = null;
      for (const bl of r.blocks) { const lt = bl.type === 'bullet' ? 'ul' : bl.type === 'number' ? 'ol' : null; if (list && list !== lt) { html += `</${list}>`; list = null; } if (lt) { if (!list) { html += `<${lt}>`; list = lt; } html += `<li>${esc(bl.text)}</li>`; } else html += `<${bl.type}>${esc(bl.text)}</${bl.type}>`; }
      if (list) html += `</${list}>`;
      T.savedRange = range; T.exec('insertHTML', html, false); toast('Texte inséré : relisez-le et complétez les [ ]', 5000);
    } catch (e) { toast('IA indisponible : ' + e.message, 8000); }
  }
  async function translateDoc() {
    const tr = Studio.translate; if (!tr) return toast('Traduction indisponible');
    const target = await modal({ title: 'Traduire le document', body: `<div class="field"><label for="trL">Langue</label><select id="trL">${tr.options(tr.savedTarget())}</select></div><p class="hint">Une copie traduite est créée ; l'original reste dans « Mes documents ». La mise en forme à l'intérieur des paragraphes est simplifiée.</p>`, buttons: [{ label: 'Annuler', value: null }, { label: 'Traduire', primary: true, value: (b) => b.querySelector('#trL').value }] });
    if (!target) return; tr.saveTarget(target);
    const key = await tr.ensureKey('le texte du document'); if (!key) return;
    await loadScript('lib/anthropic-sdk.js');
    const html = T.getHTML(); const tmp = document.createElement('div'); tmp.innerHTML = html;
    const blocks = [...tmp.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,td,th')].filter((b) => !b.querySelector('p,li,table') && b.textContent.trim() && !b.closest('.toc'));
    try {
      const out = await tr.translateTexts(key, blocks.map((b) => b.innerText || b.textContent), target, { context: 'document administratif', onProgress: (u) => toast(`Traduction… ${Math.round(u * 100)} %`, 60000) });
      blocks.forEach((b, i) => { if (out[i]) b.textContent = out[i]; });
      await T.autosave(); const d = T.newDocModel(); Object.assign(d, { ...T.doc, id: d.id, title: `${T.doc.title} (${tr.NAME[target] || target})`, html: tmp.innerHTML }); T.loadDoc(d); await T.autosave();
      toast('Copie traduite créée', 5000);
    } catch (e) { toast('Traduction impossible : ' + e.message, 8000); }
  }

  Studio.docExtra = {
    actions: {
      saveDocx, open: openDialog, pdf: downloadPdf, print: printDoc, saveTxt, saveHtml, saveJoe, library, templates: templatesDialog,
      new: () => newDoc(), mailMerge, mergeField: mergeFieldDialog, dictate, readAloud, translate: translateDoc,
      aiFix: () => aiRewrite('fix'), aiFormal: () => aiRewrite('formal'), aiSimple: () => aiRewrite('simple'), aiShort: () => aiRewrite('short'), aiSummary, aiWrite,
    },
    buildDocx, readDocx, TEMPLATES, mdToHtml, openFile,
  };
})();
