/* Studio Joe — Présentation Joe : modèle, rendu des diapositives, éditeur (sélection, déplacement,
   redimensionnement, rotation, texte riche), miniatures, propriétés, annuler/rétablir, sauvegarde.
   Une diapositive fait 1280 × 720 unités (16:9) ou 960 × 720 (4:3) ; 1 point = 4/3 d'unité, comme PowerPoint à 96 ppp.
   Thèmes, diaporama, fichiers et IA : slides-extra.js. */
(function () {
  const { $, $$, toast, initMenus, modal, confirmBox } = Studio;
  const PT = 4 / 3;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ================= Thèmes ================= */
  const SANS = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const THEMES = {
    clair: { name: 'Clair', bg: '#ffffff', title: '#1b1f2a', text: '#3a4150', acc: ['#c4501b', '#1f6fd1', '#2f8a57', '#d9861c', '#7b3fa0', '#0b8a8a'], tFont: SANS, bFont: SANS, deco: (W, H) => [{ x: 0, y: 0, w: W, h: 10, fill: 'acc0' }] },
    faso: { name: 'Faso', bg: '#fffaf2', title: '#7a2e0e', text: '#3b2a1e', acc: ['#c8102e', '#009a44', '#e3a21a', '#1f6fd1', '#7a2e0e', '#5d6578'], tFont: SANS, bFont: SANS, deco: (W, H) => [{ x: 0, y: H - 16, w: W, h: 8, fill: '#c8102e' }, { x: 0, y: H - 8, w: W, h: 8, fill: '#009a44' }, { x: W - 70, y: H - 40, w: 18, h: 18, fill: '#fcd116', star: true }] },
    marine: { name: 'Marine', bg: 'linear-gradient(135deg, #0f2742 0%, #1c4f80 100%)', bgSolid: '#163a60', title: '#ffffff', text: '#e3edf7', acc: ['#ffb547', '#5ec2ff', '#7be0a6', '#ff7a7a', '#c39bff', '#ffd966'], tFont: SANS, bFont: SANS, deco: (W, H) => [{ x: 60, y: H - 50, w: 120, h: 6, fill: 'acc0', r: 3 }] },
    ardoise: { name: 'Ardoise', bg: '#1f2329', title: '#f5f5f5', text: '#d6d9de', acc: ['#f0a23a', '#5ec2ff', '#7be0a6', '#ff7a7a', '#c39bff', '#ffd966'], tFont: SANS, bFont: SANS, deco: (W, H) => [{ x: 0, y: 0, w: 14, h: H, fill: 'acc0' }] },
    verdure: { name: 'Verdure', bg: '#f3f8f4', title: '#145c33', text: '#23372b', acc: ['#2f8a57', '#8fbf3f', '#d9861c', '#1f6fd1', '#0b8a8a', '#7a5c2e'], tFont: SANS, bFont: SANS, deco: (W, H) => [{ x: W - 220, y: -120, w: 340, h: 340, fill: 'rgba(47,138,87,.12)', r: 170 }, { x: -80, y: H - 140, w: 220, h: 220, fill: 'rgba(143,191,63,.15)', r: 110 }] },
    elegant: { name: 'Élégant', bg: '#fbf8f3', title: '#3a2e2a', text: '#4a403a', acc: ['#b08d57', '#6b4f3a', '#8a9a5b', '#5b7a99', '#a0522d', '#777777'], tFont: "Georgia, 'Times New Roman', serif", bFont: "Georgia, 'Times New Roman', serif", deco: (W, H) => [{ x: 60, y: 40, w: W - 120, h: 1.5, fill: 'acc0' }, { x: 60, y: H - 42, w: W - 120, h: 1.5, fill: 'acc0' }] },
    vif: { name: 'Vif', bg: 'linear-gradient(120deg, #ff6a3d 0%, #ffb347 100%)', bgSolid: '#ff8c42', title: '#ffffff', text: '#ffffff', acc: ['#1b1f2a', '#ffffff', '#3d2c8d', '#0b8a8a', '#ffe066', '#7b3fa0'], tFont: "'Trebuchet MS', " + SANS, bFont: SANS, deco: () => [] },
    sobre: { name: 'Sobre', bg: '#ffffff', title: '#000000', text: '#222222', acc: ['#000000', '#555555', '#999999', '#c4501b', '#1f6fd1', '#2f8a57'], tFont: 'Arial, Helvetica, sans-serif', bFont: 'Arial, Helvetica, sans-serif', deco: () => [] },
  };
  const theme = () => THEMES[deck.theme] || THEMES.clair;
  const accColor = (c, th = theme()) => (typeof c === 'string' && /^acc(\d)$/.test(c) ? th.acc[+c.slice(3)] : c);

  /* ================= Dispositions ================= */
  const PH = { title: 'Cliquez pour ajouter un titre', subtitle: 'Cliquez pour ajouter un sous-titre', body: 'Cliquez pour ajouter du texte', text: 'Votre texte' };
  const LAYOUTS = {
    title: { name: 'Titre', make: (W, H) => [txt('title', .08 * W, .27 * H, .84 * W, .25 * H, 54, { align: 'center', valign: 'bottom' }), txt('subtitle', .08 * W, .55 * H, .84 * W, .15 * H, 24, { align: 'center', valign: 'top' })] },
    content: { name: 'Titre et contenu', make: (W, H) => [txt('title', .06 * W, .05 * H, .88 * W, .16 * H, 40, { valign: 'bottom' }), txt('body', .06 * W, .25 * H, .88 * W, .66 * H, 24)] },
    two: { name: 'Deux contenus', make: (W, H) => [txt('title', .06 * W, .05 * H, .88 * W, .16 * H, 40, { valign: 'bottom' }), txt('body', .06 * W, .25 * H, .43 * W, .66 * H, 22), txt('body', .51 * W, .25 * H, .43 * W, .66 * H, 22)] },
    comparison: { name: 'Comparaison', make: (W, H) => [txt('title', .06 * W, .05 * H, .88 * W, .16 * H, 40, { valign: 'bottom' }), txt('subtitle', .06 * W, .24 * H, .43 * W, .09 * H, 24, { bold: true, color: 'acc0' }), txt('body', .06 * W, .34 * H, .43 * W, .58 * H, 20), txt('subtitle', .51 * W, .24 * H, .43 * W, .09 * H, 24, { bold: true, color: 'acc0' }), txt('body', .51 * W, .34 * H, .43 * W, .58 * H, 20)] },
    section: { name: 'Titre de section', make: (W, H) => [txt('title', .08 * W, .36 * H, .84 * W, .2 * H, 48, { valign: 'bottom' }), txt('subtitle', .08 * W, .58 * H, .84 * W, .12 * H, 22, { valign: 'top' })] },
    titleOnly: { name: 'Titre seul', make: (W, H) => [txt('title', .06 * W, .05 * H, .88 * W, .16 * H, 40, { valign: 'bottom' })] },
    imageText: { name: 'Image et texte', make: (W, H) => [txt('title', .06 * W, .05 * H, .88 * W, .16 * H, 40, { valign: 'bottom' }), txt('body', .06 * W, .25 * H, .42 * W, .66 * H, 22), { id: uid(), type: 'image', role: 'picture', x: .52 * W, y: .25 * H, w: .42 * W, h: .66 * H, rot: 0, src: null, style: { fit: 'cover' } }] },
    blank: { name: 'Vide', make: () => [] },
  };
  function txt(role, x, y, w, h, size, style = {}) {
    return { id: uid(), type: 'text', role, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rot: 0, text: role === 'body' ? '<ul><li></li></ul>' : '', style: { size, ...style } };
  }

  /* ================= Formes ================= */
  const SHAPES = {
    rect: { name: 'Rectangle' }, round: { name: 'Rectangle arrondi' }, ellipse: { name: 'Ellipse', svg: '<ellipse cx="50" cy="50" rx="50" ry="50"/>' },
    triangle: { name: 'Triangle', d: 'M50 0 L100 100 L0 100 Z' }, diamond: { name: 'Losange', d: 'M50 0 L100 50 L50 100 L0 50 Z' },
    arrow: { name: 'Flèche droite', d: 'M0 30 L62 30 L62 4 L100 50 L62 96 L62 70 L0 70 Z' }, arrowL: { name: 'Flèche gauche', d: 'M100 30 L38 30 L38 4 L0 50 L38 96 L38 70 L100 70 Z' },
    chevron: { name: 'Chevron', d: 'M0 0 L75 0 L100 50 L75 100 L0 100 L25 50 Z' }, pentagon: { name: 'Étiquette', d: 'M0 0 L80 0 L100 50 L80 100 L0 100 Z' },
    star: { name: 'Étoile', d: starPath() }, callout: { name: 'Bulle', d: 'M0 0 H100 V72 H42 L20 100 L26 72 H0 Z' }, hexagon: { name: 'Hexagone', d: 'M25 0 L75 0 L100 50 L75 100 L25 100 L0 50 Z' },
    line: { name: 'Trait', line: true }, lineArrow: { name: 'Flèche (trait)', line: true },
  };
  function starPolygon() { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 19 : 50; p.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(52 + r * Math.sin(a)).toFixed(1)}%`); } return p.join(','); }
  function starPath() { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 19 : 50; d += (i ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(1) + ' ' + (52 + r * Math.sin(a)).toFixed(1) + ' '; } return d + 'Z'; }

  /* ================= Modèle ================= */
  function newDeck(themeId = 'clair', ratio = '16:9') {
    const d = { title: 'Présentation', theme: themeId, size: ratio === '4:3' ? { w: 960, h: 720 } : { w: 1280, h: 720 }, media: {}, slides: [] };
    return d;
  }
  function newSlide(layout = 'content', d = deck) { return { id: uid(), layout, bg: null, transition: { type: 'fade', dur: 0.5 }, notes: '', hidden: false, els: LAYOUTS[layout].make(d.size.w, d.size.h) }; }
  let deck = newDeck(); deck.slides.push(newSlide('title'));
  let cur = 0, sel = [], editingId = null;
  const W = () => deck.size.w, H = () => deck.size.h;
  const slide = () => deck.slides[cur];
  const elById = (id, s = slide()) => s.els.find((e) => e.id === id);
  const selEls = () => sel.map((id) => elById(id)).filter(Boolean);

  /* ================= Texte riche : nettoyage ================= */
  const ALLOWED = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'UL', 'OL', 'LI', 'SUB', 'SUP', 'A']);
  const STYLES = ['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'text-decoration-line'];
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const walk = (node, out) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;
        let tag = n.tagName;
        if (tag === 'FONT') { const sp = document.createElement('span'); if (n.getAttribute('color')) sp.style.color = n.getAttribute('color'); if (n.getAttribute('face')) sp.style.fontFamily = n.getAttribute('face'); walk(n, sp); out.appendChild(sp); continue; }
        if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4') tag = 'P';
        if (!ALLOWED.has(tag)) { walk(n, out); continue; }
        const e = document.createElement(tag === 'A' ? 'SPAN' : tag);
        const st = n.getAttribute('style');
        if (st) { const tmp = document.createElement('span'); tmp.setAttribute('style', st); for (const p of STYLES) { const v = tmp.style.getPropertyValue(p); if (v) e.style.setProperty(p, v); } }
        walk(n, e); out.appendChild(e);
      }
    };
    const out = document.createElement('div'); walk(doc.body.firstChild, out);
    return out.innerHTML.replace(/<span>([^<]*)<\/span>/g, '$1');
  }
  const plainText = (html) => { const d = document.createElement('div'); d.innerHTML = (html || '').replace(/<\/(p|div|li)>/g, '\n</$1>').replace(/<br\s*\/?>/g, '\n'); return d.textContent.replace(/\n{2,}/g, '\n').trim(); };
  const isEmptyText = (html) => !plainText(html);
  function stripInline(html, prop) {
    const d = document.createElement('div'); d.innerHTML = html || '';
    d.querySelectorAll('*').forEach((n) => {
      if (prop === 'bold' && (n.tagName === 'B' || n.tagName === 'STRONG')) n.replaceWith(...n.childNodes);
      if (prop === 'italic' && (n.tagName === 'I' || n.tagName === 'EM')) n.replaceWith(...n.childNodes);
      if (prop === 'underline' && n.tagName === 'U') n.replaceWith(...n.childNodes);
      if (n.style) { const map = { bold: 'font-weight', italic: 'font-style', underline: 'text-decoration', color: 'color', size: 'font-size', font: 'font-family', align: 'text-align' }; if (map[prop]) { n.style.removeProperty(map[prop]); if (prop === 'underline') n.style.removeProperty('text-decoration-line'); } }
    });
    return d.innerHTML;
  }

  /* ================= Rendu ================= */
  const SLIDE_CSS = `
.sj-slide{position:relative;overflow:hidden;box-sizing:border-box;-webkit-font-smoothing:antialiased}
.sj-slide *{box-sizing:border-box}
.sj-el{position:absolute}
.sj-deco{position:absolute;pointer-events:none}
.sj-tx{position:absolute;inset:0;display:flex;flex-direction:column;padding:8px 14px;overflow:visible;overflow-wrap:break-word;line-height:1.18;outline:none;white-space:pre-wrap}
.sj-tx>*{flex:none}
.sj-tx p,.sj-tx div{margin:0 0 .18em}
.sj-tx ul,.sj-tx ol{margin:0 0 .15em;padding-left:1.15em}
.sj-tx li{margin:0 0 .3em;padding-left:.15em}
.sj-tx ul ul,.sj-tx ol ol,.sj-tx ul ol,.sj-tx ol ul{font-size:.86em;margin-top:.25em}
.sj-tx ul li::marker{color:var(--sj-acc)}
.sj-tx ol li::marker{color:var(--sj-acc);font-weight:700}
.sj-tx.ph::before{content:attr(data-ph);color:#9aa0ad;position:absolute;pointer-events:none;font-weight:400}
.sj-tx.ph.c::before{left:0;right:0;text-align:center}
.sj-img{width:100%;height:100%;display:block}
.sj-imgph{position:absolute;inset:0;border:2px dashed #9aa0ad;display:grid;place-items:center;color:#7a8190;font:600 20px ${SANS};background:rgba(150,150,150,.08);text-align:center;padding:10px}
.sj-shape{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.sj-table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}
.sj-table td{border:1px solid rgba(0,0,0,.18);padding:6px 10px;vertical-align:middle;overflow:hidden;overflow-wrap:break-word;outline:none}
.sj-chart{position:absolute;inset:0;width:100%;height:100%}`;
  const st = document.createElement('style'); st.textContent = SLIDE_CSS; document.head.appendChild(st);

  const bgCss = (s, th, d = deck) => {
    const b = s.bg || d.bg;
    if (b && b.image && d.media[b.image]) return `center/cover no-repeat url("${d.media[b.image]}")`;
    if (b && b.color) return b.color;
    return th.bg;
  };
  function renderSlide(s, opts = {}) {
    const d = opts.deck || deck; const th = THEMES[d.theme] || THEMES.clair; const Wd = d.size.w, Hd = d.size.h;
    const root = document.createElement('div'); root.className = 'sj-slide';
    root.style.cssText = `width:${Wd}px;height:${Hd}px;background:${bgCss(s, th, d)};--sj-acc:${th.acc[0]};font-family:${th.bFont};color:${th.text}`;
    if (!(s.bg && s.bg.noDeco)) for (const dc of th.deco(Wd, Hd)) {
      const e = document.createElement('div'); e.className = 'sj-deco';
      e.style.cssText = `left:${dc.x}px;top:${dc.y}px;width:${dc.w}px;height:${dc.h}px;background:${accColor(dc.fill, th)};${dc.r ? `border-radius:${dc.r}px;` : ''}${dc.star ? `clip-path:polygon(${starPolygon()});` : ''}`;
      root.appendChild(e);
    }
    s.els.forEach((el) => { const n = renderEl(el, th, opts, d); if (n) root.appendChild(n); });
    return root;
  }
  function textStyle(el, th) {
    const s = el.style || {}; const role = el.role;
    const font = s.font || (role === 'title' ? th.tFont : th.bFont);
    const color = accColor(s.color, th) || (role === 'title' ? th.title : el.type === 'shape' ? '#ffffff' : th.text);
    const bold = s.bold !== undefined ? s.bold : role === 'title';
    const align = s.align || (el.type === 'shape' ? 'center' : 'left');
    const valign = s.valign || (el.type === 'shape' ? 'middle' : 'top');
    return `font-family:${font};font-size:${(s.size || 18) * PT}px;color:${color};font-weight:${bold ? 700 : 400};font-style:${s.italic ? 'italic' : 'normal'};text-decoration:${s.underline ? 'underline' : 'none'};text-align:${align};justify-content:${valign === 'middle' ? 'center' : valign === 'bottom' ? 'flex-end' : 'flex-start'};line-height:${s.lineH || 1.18}`;
  }
  function renderEl(el, th, opts, d) {
    const isEdit = !!opts.edit;
    const s = el.style || {};
    if (el.type === 'image' && !el.src && !isEdit) return null;
    if (el.type === 'text' && !isEdit && isEmptyText(el.text) && !el.field) return null;
    const box = document.createElement('div'); box.className = 'sj-el'; box.dataset.id = el.id;
    box.style.cssText = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;${el.rot ? `transform:rotate(${el.rot}deg);` : ''}${s.opacity !== undefined && s.opacity < 1 ? `opacity:${s.opacity};` : ''}`;
    const fill = accColor(s.fill, th), stroke = accColor(s.stroke, th);
    const shadow = s.shadow ? 'drop-shadow(0 4px 8px rgba(0,0,0,.3))' : '';
    if (el.type === 'shape' || el.type === 'text') {
      const sh = el.type === 'shape' ? SHAPES[s.shape] || SHAPES.rect : SHAPES.rect;
      if (sh.line) {
        const svg = `<svg class="sj-shape" viewBox="0 0 ${Math.max(1, el.w)} ${Math.max(1, el.h)}" preserveAspectRatio="none"><defs><marker id="ah${el.id}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="${stroke || th.text}"/></marker></defs><line x1="0" y1="${el.h / 2}" x2="${el.w}" y2="${el.h / 2}" stroke="${stroke || th.text}" stroke-width="${s.strokeW || 3}" ${s.shape === 'lineArrow' ? `marker-end="url(#ah${el.id})"` : ''}/></svg>`;
        box.innerHTML = svg; return box;
      }
      if (sh.d || sh.svg) {
        const inner = sh.svg || `<path d="${sh.d}"/>`;
        box.insertAdjacentHTML('beforeend', `<svg class="sj-shape" viewBox="0 0 100 100" preserveAspectRatio="none" style="${shadow ? `filter:${shadow}` : ''}"><g fill="${fill || 'none'}" stroke="${stroke || 'none'}" stroke-width="${s.strokeW || 2}" vector-effect="non-scaling-stroke">${inner.replace('/>', ' vector-effect="non-scaling-stroke"/>')}</g></svg>`);
      } else {
        if (fill) box.style.background = fill;
        if (stroke) box.style.border = `${s.strokeW || 2}px solid ${stroke}`;
        const r = s.shape === 'round' ? (s.radius !== undefined ? s.radius : Math.min(el.w, el.h) * 0.18) : s.radius || 0;
        if (r) box.style.borderRadius = r + 'px';
        if (s.shadow) box.style.boxShadow = '0 6px 16px rgba(0,0,0,.28)';
      }
      const tx = document.createElement('div'); tx.className = 'sj-tx'; tx.style.cssText = textStyle(el, th);
      if (s.pad !== undefined) tx.style.padding = s.pad + 'px';
      if (el.field === 'num') tx.textContent = String((opts.index ?? 0) + 1);
      else if (el.field === 'date') tx.textContent = new Date().toLocaleDateString('fr-FR');
      else tx.innerHTML = el.text || '';
      if (isEdit && isEmptyText(el.text) && !el.field) { tx.classList.add('ph'); if ((s.align || (el.type === 'shape' ? 'center' : 'left')) === 'center') tx.classList.add('c'); tx.dataset.ph = el.type === 'shape' ? '' : PH[el.role] || PH.text; }
      box.appendChild(tx);
      return box;
    }
    if (el.type === 'image') {
      if (el.src && d.media[el.src]) {
        const img = document.createElement('img'); img.className = 'sj-img'; img.src = d.media[el.src]; img.alt = ''; img.draggable = false;
        img.style.objectFit = s.fit || 'contain'; if (s.radius) img.style.borderRadius = s.radius + 'px'; if (shadow) img.style.filter = shadow;
        if (s.stroke) img.style.border = `${s.strokeW || 2}px solid ${accColor(s.stroke, th)}`;
        box.appendChild(img);
      } else box.innerHTML = '<div class="sj-imgph">🖼 Touchez deux fois pour ajouter une image</div>';
      return box;
    }
    if (el.type === 'table') {
      const t = el.table; const hdr = accColor(t.hdr || 'acc0', th);
      let h = `<table class="sj-table" style="font-size:${(s.size || 16) * PT}px;font-family:${s.font || th.bFont};color:${accColor(s.color, th) || th.text}">`;
      const cw = t.colW || t.rows[0].map(() => 1); const tot = cw.reduce((a, b) => a + b, 0);
      h += '<colgroup>' + cw.map((w) => `<col style="width:${(w / tot) * 100}%">`).join('') + '</colgroup>';
      t.rows.forEach((row, i) => {
        const head = t.header && i === 0; const band = t.band && !head && (i % 2 === (t.header ? 0 : 1));
        h += `<tr style="height:${100 / t.rows.length}%">` + row.map((c, j) => `<td data-r="${i}" data-c="${j}" style="${head ? `background:${hdr};color:#fff;font-weight:700;` : band ? `background:${hexA(hdr, 0.12)};` : t.fill ? `background:${t.fill};` : ''}text-align:${(t.align && t.align[j]) || (head ? 'center' : 'left')}">${c || ''}</td>`).join('') + '</tr>';
      });
      box.innerHTML = h + '</table>';
      return box;
    }
    if (el.type === 'chart') { box.innerHTML = chartSVG(el, th); return box; }
    return box;
  }
  function hexA(hex, a) { const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  /* graphique en SVG (coordonnées de l'élément) */
  function chartSVG(el, th) {
    const c = el.chart; const w = el.w, h = el.h; const X = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const col = (i) => (c.colors && c.colors[i]) || th.acc[i % th.acc.length];
    const fg = accColor((el.style || {}).color, th) || th.text; const fs = ((el.style || {}).size || 14) * PT;
    let o = `<svg class="sj-chart" viewBox="0 0 ${w} ${h}" font-family="${X(th.bFont)}" fill="${fg}">`;
    let top = 8; if (c.title) { o += `<text x="${w / 2}" y="${fs * 1.3}" text-anchor="middle" font-size="${fs * 1.2}" font-weight="bold">${X(c.title)}</text>`; top = fs * 1.9; }
    const pie = c.type === 'pie' || c.type === 'donut';
    const leg = c.legend !== false && (pie || c.series.length > 1);
    const items = pie ? c.labels : c.series.map((s) => s.name);
    const legH = leg ? fs * 1.6 : 0; const bottom = h - legH - 4;
    if (leg) { let x = 10; const y = h - fs * 0.6; items.forEach((t, i) => { o += `<rect x="${x}" y="${y - fs * 0.75}" width="${fs * 0.75}" height="${fs * 0.75}" fill="${col(i)}"/><text x="${x + fs}" y="${y}" font-size="${fs * 0.85}">${X(t)}</text>`; x += fs * 1.4 + String(t).length * fs * 0.5; }); }
    if (pie) {
      const vals = (c.series[0] || { values: [] }).values.map((v) => Math.max(0, +v || 0)); const tot = vals.reduce((a, b) => a + b, 0) || 1;
      const cx = w / 2, cy = (top + bottom) / 2, R = Math.max(10, Math.min(w / 2 - 10, (bottom - top) / 2 - 4)); let a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        const a1 = a0 + (v / tot) * Math.PI * 2; const p = (a, r) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
        if (v > 0) o += vals.filter((x) => x > 0).length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${col(i)}"/>` : `<path d="M${cx},${cy} L${p(a0, R)} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1, R)} Z" fill="${col(i)}" stroke="#fff" stroke-width="2"/>`;
        const am = (a0 + a1) / 2; if (v / tot > 0.05) o += `<text x="${(cx + R * (c.type === 'donut' ? 0.78 : 0.62) * Math.cos(am)).toFixed(1)}" y="${(cy + R * (c.type === 'donut' ? 0.78 : 0.62) * Math.sin(am) + fs * 0.35).toFixed(1)}" text-anchor="middle" font-size="${fs * 0.9}" font-weight="bold" fill="#fff">${Math.round((v / tot) * 100)} %</text>`;
        a0 = a1;
      });
      if (c.type === 'donut') o += `<circle cx="${cx}" cy="${cy}" r="${R * 0.55}" fill="${th.bgSolid || (th.bg.startsWith('#') ? th.bg : '#fff')}"/>`;
      return o + '</svg>';
    }
    const all = c.series.flatMap((s) => s.values.map(Number)).filter((v) => isFinite(v));
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all); if (lo === hi) hi = lo + 1;
    const step0 = (hi - lo) / 5, mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const fmtN = (v) => { const a = Math.abs(v); if (a >= 1e9) return +(v / 1e9).toPrecision(3) + ' Md'; if (a >= 1e6) return +(v / 1e6).toPrecision(3) + ' M'; if (a >= 1e4) return +(v / 1e3).toPrecision(3) + ' k'; return String(+v.toPrecision(6)).replace('.', ','); };
    const horiz = c.type === 'bar'; const n = c.labels.length;
    const L = horiz ? Math.min(w * 0.35, 10 + fs * 0.55 * Math.max(3, ...c.labels.map((l) => String(l).length))) : fs * 0.6 * Math.max(...[lo, hi].map((v) => fmtN(v).length)) + 14;
    const R2 = w - 10, T = top + 6, B = bottom - (horiz ? fs * 1.4 : fs * 1.6);
    const grid = (c.gridColor) || hexA(fg.startsWith('#') ? fg : '#888888', 0.18);
    if (horiz) {
      const sx = (v) => L + ((v - lo) / (hi - lo)) * (R2 - L);
      for (let v = lo; v <= hi + step / 2; v += step) o += `<line x1="${sx(v)}" y1="${T}" x2="${sx(v)}" y2="${B}" stroke="${grid}"/><text x="${sx(v)}" y="${B + fs * 1.1}" text-anchor="middle" font-size="${fs * 0.8}">${fmtN(v)}</text>`;
      const band = (B - T) / Math.max(1, n), bw = (band * 0.7) / c.series.length;
      c.labels.forEach((lab, i) => { o += `<text x="${L - 8}" y="${T + band * (i + 0.5) + fs * 0.3}" text-anchor="end" font-size="${fs * 0.85}">${X(lab)}</text>`; c.series.forEach((s, j) => { const v = +s.values[i]; if (!isFinite(v)) return; const x0 = sx(Math.max(0, lo)), x1 = sx(v); o += `<rect x="${Math.min(x0, x1)}" y="${T + band * i + band * 0.15 + bw * j}" width="${Math.abs(x1 - x0)}" height="${bw}" fill="${col(j)}" rx="2"/>`; }); });
      return o + '</svg>';
    }
    const sy = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
    for (let v = lo; v <= hi + step / 2; v += step) o += `<line x1="${L}" y1="${sy(v)}" x2="${R2}" y2="${sy(v)}" stroke="${grid}"/><text x="${L - 8}" y="${sy(v) + fs * 0.3}" text-anchor="end" font-size="${fs * 0.8}">${fmtN(v)}</text>`;
    const band = (R2 - L) / Math.max(1, n);
    c.labels.forEach((lab, i) => { o += `<text x="${L + band * (i + 0.5)}" y="${B + fs * 1.2}" text-anchor="middle" font-size="${fs * 0.85}">${X(lab)}</text>`; });
    if (c.type === 'col') { const bw = (band * 0.7) / c.series.length; c.series.forEach((s, j) => s.values.forEach((v, i) => { v = +v; if (!isFinite(v)) return; const y0 = sy(Math.max(0, lo)), y1 = sy(v); o += `<rect x="${L + band * i + band * 0.15 + bw * j}" y="${Math.min(y0, y1)}" width="${Math.max(1, bw - 2)}" height="${Math.abs(y1 - y0)}" fill="${col(j)}" rx="2"/>`; if (c.values) o += `<text x="${L + band * i + band * 0.15 + bw * (j + 0.5)}" y="${Math.min(y0, y1) - 4}" text-anchor="middle" font-size="${fs * 0.75}">${fmtN(v)}</text>`; })); }
    else c.series.forEach((s, j) => { const pts = s.values.map((v, i) => [L + band * (i + 0.5), sy(+v || 0)]); if (c.type === 'area') o += `<polygon points="${pts[0][0]},${sy(Math.max(0, lo))} ${pts.map((p) => p.join(',')).join(' ')} ${pts[pts.length - 1][0]},${sy(Math.max(0, lo))}" fill="${col(j)}" fill-opacity=".3"/>`; o += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${col(j)}" stroke-width="${fs * 0.22}" stroke-linejoin="round"/>` + pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${fs * 0.28}" fill="${col(j)}"/>`).join(''); });
    o += `<line x1="${L}" y1="${sy(Math.max(0, lo))}" x2="${R2}" y2="${sy(Math.max(0, lo))}" stroke="${hexA(fg.startsWith('#') ? fg : '#888888', 0.5)}"/>`;
    return o + '</svg>';
  }

  /* ================= Annuler / rétablir ================= */
  const undoStack = [], redoStack = [];
  const snap = () => JSON.stringify({ ...deck, media: undefined, _cur: cur });
  function restore(json) { const o = JSON.parse(json); const media = deck.media; cur = Math.min(o._cur || 0, o.slides.length - 1); delete o._cur; deck = { ...o, media }; sel = []; editingId = null; renderAll(); }
  function change(fn, { keepSel = true } = {}) {
    const before = snap(); fn(); const after = snap();
    if (before !== after) { undoStack.push(before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; dirty(); }
    if (!keepSel) sel = [];
    renderAll();
  }
  function pushUndo(before) { if (before !== snap()) { undoStack.push(before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; dirty(); } }
  function undo() { endTextEdit(); const s = undoStack.pop(); if (!s) return toast('Rien à annuler'); redoStack.push(snap()); restore(s); dirty(); }
  function redo() { endTextEdit(); const s = redoStack.pop(); if (!s) return toast('Rien à rétablir'); undoStack.push(snap()); restore(s); dirty(); }

  /* ================= Sauvegarde automatique (IndexedDB) ================= */
  const idb = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('presentation-joe', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
    async get(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); },
    async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };
  let saveTimer = null, isDirty = false;
  function dirty() { isDirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 900); $('#docName').textContent = deck.title + ' •'; }
  function usedMedia() { const used = new Set(); deck.slides.forEach((s) => { if (s.bg && s.bg.image) used.add(s.bg.image); s.els.forEach((e) => { if (e.src) used.add(e.src); }); }); if (deck.bg && deck.bg.image) used.add(deck.bg.image); return used; }
  function serialize() { const used = usedMedia(); const media = {}; for (const k of used) if (deck.media[k]) media[k] = deck.media[k]; return { app: 'presentation-joe', v: 1, ...deck, media }; }
  async function autosave() { try { await idb.set('deck', JSON.stringify(serialize())); } catch (e) { console.warn('sauvegarde automatique impossible', e); } }
  function loadDeck(d, { keepUndo = false } = {}) {
    endTextEdit();
    if (!d || !Array.isArray(d.slides) || !d.slides.length) throw new Error('présentation invalide');
    deck = { title: d.title || 'Présentation', theme: THEMES[d.theme] ? d.theme : 'clair', size: d.size && d.size.w ? d.size : { w: 1280, h: 720 }, media: d.media || {}, bg: d.bg || null, slides: d.slides };
    deck.slides.forEach((s) => { s.id = s.id || uid(); s.els = s.els || []; s.els.forEach((e) => { e.id = e.id || uid(); e.style = e.style || {}; e.rot = e.rot || 0; }); s.transition = s.transition || { type: 'none', dur: 0.5 }; });
    cur = 0; sel = []; if (!keepUndo) { undoStack.length = 0; redoStack.length = 0; }
    renderAll(true);
  }
  function addMedia(dataUrl) { for (const [k, v] of Object.entries(deck.media)) if (v === dataUrl) return k; const id = 'm' + uid(); deck.media[id] = dataUrl; return id; }

  /* ================= Scène ================= */
  const stage = $('#stage'), sorter = $('#sorter'), propsEl = $('#props'), notesEl = $('#notes');
  const frame = document.createElement('div'); frame.className = 'frame'; stage.appendChild(frame);
  const overlay = document.createElement('div'); overlay.className = 'overlay'; stage.appendChild(overlay);
  let scale = 1, slideDom = null;
  function layoutStage() {
    const pad = innerWidth < 600 ? 10 : 28;
    const aw = stage.clientWidth - pad * 2, ah = stage.clientHeight - pad * 2;
    scale = Math.max(0.05, Math.min(aw / W(), ah / H()));
    const fw = W() * scale, fh = H() * scale;
    const left = (stage.clientWidth - fw) / 2, top = (stage.clientHeight - fh) / 2;
    Object.assign(frame.style, { left: left + 'px', top: top + 'px', width: fw + 'px', height: fh + 'px' });
    Object.assign(overlay.style, { left: left + 'px', top: top + 'px', width: W() + 'px', height: H() + 'px', transform: `scale(${scale})` });
    if (slideDom) slideDom.style.transform = `scale(${scale})`;
  }
  function renderStage() {
    if (editingId) return; // le texte en cours de saisie garde son curseur
    slideDom = renderSlide(slide(), { edit: true, index: cur });
    frame.replaceChildren(slideDom); layoutStage(); renderOverlay();
  }
  new ResizeObserver(() => { layoutStage(); renderOverlay(); }).observe(stage);

  function renderOverlay(guides = [], marquee = null) {
    overlay.innerHTML = '';
    const hs = 12 / scale;
    const els = selEls();
    els.forEach((el) => {
      const b = document.createElement('div'); b.className = 'selbox' + (editingId === el.id ? ' editing' : '');
      b.style.cssText = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;transform:rotate(${el.rot || 0}deg);border-width:${1.5 / scale}px`;
      if (els.length === 1 && editingId !== el.id) {
        const dirs = SHAPES[(el.style || {}).shape] && SHAPES[el.style.shape].line ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        dirs.forEach((d) => { const h = document.createElement('div'); h.className = 'hdl'; h.dataset.h = d; const px = d.includes('w') ? 0 : d.includes('e') ? 1 : 0.5, py = d.includes('n') ? 0 : d.includes('s') ? 1 : 0.5; h.style.cssText = `width:${hs}px;height:${hs}px;left:${px * el.w - hs / 2}px;top:${py * el.h - hs / 2}px;border-width:${1.5 / scale}px;cursor:${d}-resize`; b.appendChild(h); });
        const r = document.createElement('div'); r.className = 'hdl rot'; r.dataset.h = 'rot'; r.title = 'Faire pivoter'; r.style.cssText = `width:${hs}px;height:${hs}px;left:${el.w / 2 - hs / 2}px;top:${-hs * 2.4}px;cursor:grab`; b.appendChild(r);
      }
      overlay.appendChild(b);
    });
    guides.forEach((g) => { const d = document.createElement('div'); d.className = 'guide'; d.style.cssText = g.v ? `left:${g.p}px;top:0;width:${1 / scale}px;height:${H()}px` : `top:${g.p}px;left:0;height:${1 / scale}px;width:${W()}px`; overlay.appendChild(d); });
    if (marquee) { const m = document.createElement('div'); m.className = 'marquee'; m.style.cssText = `left:${marquee.x}px;top:${marquee.y}px;width:${marquee.w}px;height:${marquee.h}px`; overlay.appendChild(m); }
  }

  /* ---------- pointeur sur la scène ---------- */
  const toSlide = (e) => { const r = frame.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; };
  let drag = null, lastDown = { t: 0, id: null };
  stage.addEventListener('pointerdown', (e) => {
    hideCtx();
    const txEdit = e.target.closest('[contenteditable="true"]');
    if (txEdit) return; // saisie de texte : comportement natif
    if (e.button === 2) return;
    const p = toSlide(e);
    const hdl = e.target.closest('.hdl');
    if (hdl && sel.length === 1) { e.preventDefault(); startHandle(e, hdl.dataset.h, p); return; }
    if (editingId) endEdits();
    const elNode = e.target.closest('.sj-el');
    if (elNode) {
      const id = elNode.dataset.id; const el = elById(id);
      e.preventDefault(); stage.focus({ preventScroll: true });
      const already = sel.includes(id);
      if (e.shiftKey || e.ctrlKey || e.metaKey) { sel = already ? sel.filter((x) => x !== id) : [...sel, id]; renderOverlay(); renderProps(); updateTools(); return; }
      if (!already) { sel = [id]; renderOverlay(); renderProps(); updateTools(); }
      const now = Date.now(); const second = (already && sel.length === 1) || (lastDown.id === id && now - lastDown.t < 450);
      lastDown = { t: now, id };
      drag = { type: 'move', start: p, before: snap(), orig: selEls().map((x) => ({ id: x.id, x: x.x, y: x.y })), moved: false, second, el, cx: e.clientX, cy: e.clientY };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    // vide : désélection et sélection par cadre
    sel = []; renderOverlay(); renderProps(); updateTools(); stage.focus({ preventScroll: true });
    drag = { type: 'marquee', start: p };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toSlide(e);
    if (drag.type === 'move') {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 4) return;
      drag.moved = true;
      let ox = dx, oy = dy; const guides = [];
      // magnétisme : bords et centres de la diapositive et des autres objets
      const bb = bbox(drag.orig.map((o) => { const el = elById(o.id); return { x: o.x + dx, y: o.y + dy, w: el.w, h: el.h }; }));
      if (!e.altKey) {
        const tol = 6 / scale; const others = slide().els.filter((x) => !sel.includes(x.id));
        const xs = [0, W() / 2, W(), ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])], ys = [0, H() / 2, H(), ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
        const bx = [bb.x, bb.x + bb.w / 2, bb.x + bb.w], by = [bb.y, bb.y + bb.h / 2, bb.y + bb.h];
        let best = null; for (const a of bx) for (const g of xs) if (Math.abs(a - g) < tol && (!best || Math.abs(a - g) < Math.abs(best.d))) best = { d: g - a, g }; if (best) { ox += best.d; guides.push({ v: true, p: best.g }); }
        best = null; for (const a of by) for (const g of ys) if (Math.abs(a - g) < tol && (!best || Math.abs(a - g) < Math.abs(best.d))) best = { d: g - a, g }; if (best) { oy += best.d; guides.push({ v: false, p: best.g }); }
      }
      drag.orig.forEach((o) => { const el = elById(o.id); el.x = Math.round(o.x + ox); el.y = Math.round(o.y + oy); });
      moveDomEls(); renderOverlay(guides);
    } else if (drag.type === 'marquee') {
      const m = { x: Math.min(p.x, drag.start.x), y: Math.min(p.y, drag.start.y), w: Math.abs(p.x - drag.start.x), h: Math.abs(p.y - drag.start.y) };
      drag.m = m; sel = slide().els.filter((el) => el.x < m.x + m.w && el.x + el.w > m.x && el.y < m.y + m.h && el.y + el.h > m.y).map((el) => el.id);
      renderOverlay([], m);
    } else if (drag.type === 'resize' || drag.type === 'rotate') handleMove(e, p);
  });
  function endDrag(e) {
    const d = drag; drag = null; if (!d) return;
    if (d.type === 'move') {
      if (d.moved) { pushUndo(d.before); renderAll(); }
      else if (d.second && (d.el.type === 'text' || d.el.type === 'shape')) startTextEdit(d.el.id, e.clientX, e.clientY);
      else if (d.second && d.el.type === 'table') startTableEdit(d.el.id, e);
      else if (d.second && d.el.type === 'image' && !d.el.src) act('addImage');
      else if (d.second && d.el.type === 'chart') act('editChart');
    } else if (d.type === 'marquee') { renderOverlay(); renderProps(); updateTools(); }
    else { pushUndo(d.before); renderAll(); }
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', (e) => {
    const n = e.target.closest('.sj-el'); if (!n || e.target.closest('[contenteditable="true"]')) return;
    const el = elById(n.dataset.id); if (!el) return;
    if (el.type === 'text' || el.type === 'shape') startTextEdit(el.id, e.clientX, e.clientY);
    else if (el.type === 'table') startTableEdit(el.id, e);
    else if (el.type === 'image') act('addImage');
    else if (el.type === 'chart') act('editChart');
  });
  function moveDomEls() { selEls().forEach((el) => { const n = slideDom.querySelector(`[data-id="${el.id}"]`); if (n) { n.style.left = el.x + 'px'; n.style.top = el.y + 'px'; n.style.width = el.w + 'px'; n.style.height = el.h + 'px'; n.style.transform = el.rot ? `rotate(${el.rot}deg)` : ''; } }); }
  function bbox(list) { const x1 = Math.min(...list.map((e) => e.x)), y1 = Math.min(...list.map((e) => e.y)), x2 = Math.max(...list.map((e) => e.x + e.w)), y2 = Math.max(...list.map((e) => e.y + e.h)); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }

  function startHandle(e, h, p) {
    const el = selEls()[0];
    stage.setPointerCapture(e.pointerId);
    drag = { type: h === 'rot' ? 'rotate' : 'resize', h, el, before: snap(), o: { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot || 0 }, start: p };
  }
  function handleMove(e, p) {
    const { el, o } = drag;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (drag.type === 'rotate') {
      let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) a = Math.round(a / 15) * 15; else for (const s of [0, 90, 180, 270, 360, -90]) if (Math.abs(a - s) < 4) a = s;
      el.rot = Math.round(((a % 360) + 360) % 360); if (el.rot > 180) el.rot -= 360;
      moveDomEls(); renderOverlay(); return;
    }
    const rad = ((o.rot || 0) * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const gx = p.x - drag.start.x, gy = p.y - drag.start.y;
    const lx = gx * cos + gy * sin, ly = -gx * sin + gy * cos;
    const dx = drag.h.includes('e') ? 1 : drag.h.includes('w') ? -1 : 0, dy = drag.h.includes('s') ? 1 : drag.h.includes('n') ? -1 : 0;
    let nw = Math.max(12, o.w + dx * lx), nh = Math.max(12, o.h + dy * ly);
    const keep = (e.shiftKey || (el.type === 'image' && el.src)) && dx && dy;
    if (keep) { const k = Math.max(nw / o.w, nh / o.h); nw = o.w * k; nh = o.h * k; }
    const shx = (dx * (nw - o.w)) / 2, shy = (dy * (nh - o.h)) / 2;
    const ncx = cx + shx * cos - shy * sin, ncy = cy + shx * sin + shy * cos;
    el.w = Math.round(nw); el.h = Math.round(nh); el.x = Math.round(ncx - nw / 2); el.y = Math.round(ncy - nh / 2);
    moveDomEls();
    if (el.type === 'chart' || (SHAPES[(el.style || {}).shape] || {}).line) { const n = slideDom.querySelector(`[data-id="${el.id}"]`); if (n) n.replaceWith(renderEl(el, theme(), { edit: true, index: cur }, deck)); }
    renderOverlay();
  }

  /* ---------- texte ---------- */
  let editBefore = null;
  function startTextEdit(id, clientX, clientY) {
    const el = elById(id); if (!el || el.field) return;
    editBefore = snap();
    sel = [id]; editingId = null; renderStage();
    editingId = id;
    const node = slideDom.querySelector(`[data-id="${id}"] .sj-tx`); if (!node) { editingId = null; return; }
    node.contentEditable = 'true'; node.spellcheck = true;
    node.classList.remove('ph');
    if (isEmptyText(el.text)) node.innerHTML = el.role === 'body' ? '<ul><li><br></li></ul>' : '<p><br></p>';
    node.focus();
    try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ancien navigateur */ }
    let range = null;
    if (clientX !== undefined && document.caretRangeFromPoint && !isEmptyText(el.text)) range = document.caretRangeFromPoint(clientX, clientY);
    const s = getSelection(); s.removeAllRanges();
    if (range && node.contains(range.startContainer)) s.addRange(range);
    else { const r = document.createRange(); r.selectNodeContents(node); if (isEmptyText(el.text)) { const last = node.querySelector('li, p') || node; r.selectNodeContents(last); r.collapse(true); } else r.collapse(false); s.addRange(r); }
    node.addEventListener('keydown', textKey);
    renderOverlay(); renderProps(); updateTools();
  }
  function textKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); endTextEdit(); stage.focus(); return; }
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); return; }
  }
  function endTextEdit() {
    if (!editingId) return;
    const id = editingId; editingId = null;
    const node = slideDom && slideDom.querySelector(`[data-id="${id}"] .sj-tx`);
    const el = elById(id);
    if (node && el) { node.removeEventListener('keydown', textKey); let html = sanitize(node.innerHTML); if (isEmptyText(html)) html = ''; if (html !== (el.text || '')) el.text = html; }
    if (editBefore) { pushUndo(editBefore); editBefore = null; }
    renderAll();
  }
  /* ---------- tableau ---------- */
  function startTableEdit(id, e) {
    const el = elById(id); editBefore = snap(); editingId = id; sel = [id];
    const tbl = slideDom.querySelector(`[data-id="${id}"] table`); if (!tbl) { editingId = null; return; }
    tbl.querySelectorAll('td').forEach((td) => { td.contentEditable = 'true'; });
    const td = e && document.elementFromPoint(e.clientX, e.clientY); const cell = td && td.closest('td');
    (cell || tbl.querySelector('td')).focus();
    tbl.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); endTableEdit(); } if (ev.key === 'Tab') { ev.preventDefault(); const tds = [...tbl.querySelectorAll('td')]; const i = tds.indexOf(document.activeElement); const n = tds[(i + (ev.shiftKey ? -1 : 1) + tds.length) % tds.length]; n.focus(); const r = document.createRange(); r.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(r); } });
    tbl.addEventListener('focusout', () => setTimeout(() => { if (editingId === id && !tbl.contains(document.activeElement)) endTableEdit(); }, 50));
    renderOverlay(); void el;
  }
  function endTableEdit() {
    if (!editingId) return; const id = editingId; const el = elById(id); const tbl = slideDom.querySelector(`[data-id="${id}"] table`);
    editingId = null;
    if (el && tbl) tbl.querySelectorAll('td').forEach((td) => { el.table.rows[+td.dataset.r][+td.dataset.c] = sanitize(td.innerHTML).replace(/^<br>$/, ''); });
    if (editBefore) { pushUndo(editBefore); editBefore = null; }
    renderAll();
  }
  const endEdits = () => { if (!editingId) return; const el = elById(editingId); if (el && el.type === 'table') endTableEdit(); else endTextEdit(); };
  document.addEventListener('pointerdown', (e) => { if (editingId && !e.target.closest('.sj-el[data-id="' + editingId + '"], .tools, .topbar, .props, .modal-back, .ctx')) endEdits(); }, true);

  /* ================= Miniatures ================= */
  let thumbW = 150, dragSlide = null;
  function renderSorter() {
    thumbW = innerWidth <= 900 ? 110 : Math.max(80, sorter.clientWidth - 46);
    sorter.innerHTML = '';
    deck.slides.forEach((s, i) => {
      const t = document.createElement('div'); t.className = 'thumb' + (i === cur ? ' on' : '') + (s.hidden ? ' hid' : ''); t.dataset.i = i;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1 + (s.hidden ? '⊘' : '');
      const box = document.createElement('div'); box.className = 'box'; box.style.width = thumbW + 'px'; box.style.height = (thumbW * H()) / W() + 'px';
      const dom = renderSlide(s, { index: i }); dom.style.transform = `scale(${thumbW / W()})`; box.appendChild(dom);
      t.append(n, box); sorter.appendChild(t);
    });
    const add = document.createElement('button'); add.className = 'addslide'; add.textContent = '＋ Nouvelle diapositive'; add.onclick = () => act('newSlide'); sorter.appendChild(add);
    const on = sorter.querySelector('.thumb.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function updateThumb(i = cur) {
    const t = sorter.querySelector(`.thumb[data-i="${i}"] .box`); if (!t) return renderSorter();
    const dom = renderSlide(deck.slides[i], { index: i }); dom.style.transform = `scale(${thumbW / W()})`; t.replaceChildren(dom);
  }
  sorter.addEventListener('click', (e) => { const t = e.target.closest('.thumb'); if (t && !dragSlide) go(+t.dataset.i); });
  sorter.addEventListener('contextmenu', (e) => { const t = e.target.closest('.thumb'); if (!t) return; e.preventDefault(); go(+t.dataset.i); showCtx(e.clientX, e.clientY, slideMenu(+t.dataset.i)); });
  sorter.addEventListener('pointerdown', (e) => { const t = e.target.closest('.thumb'); if (!t || e.pointerType !== 'mouse' || e.button !== 0) return; dragSlide = { i: +t.dataset.i, y0: e.clientY, active: false }; });
  addEventListener('pointermove', (e) => {
    if (!dragSlide) return;
    if (!dragSlide.active && Math.abs(e.clientY - dragSlide.y0) < 8) return; dragSlide.active = true;
    const thumbs = [...sorter.querySelectorAll('.thumb')]; thumbs.forEach((t) => t.classList.remove('drop-before'));
    let to = thumbs.findIndex((t) => { const r = t.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }); if (to < 0) to = thumbs.length;
    dragSlide.to = to; if (thumbs[to]) thumbs[to].classList.add('drop-before');
  });
  addEventListener('pointerup', () => {
    const d = dragSlide; if (!d) return; setTimeout(() => { dragSlide = null; }, 0);
    if (!d.active || d.to === undefined) return;
    let to = d.to; if (to > d.i) to--; if (to === d.i) { renderSorter(); return; }
    change(() => { const [s] = deck.slides.splice(d.i, 1); deck.slides.splice(to, 0, s); cur = to; });
  });
  function slideMenu(i) {
    return [['Nouvelle diapositive', () => act('newSlide')], ['Dupliquer', () => act('dupSlide')], [deck.slides[i].hidden ? 'Afficher la diapositive' : 'Masquer la diapositive', () => change(() => { deck.slides[i].hidden = !deck.slides[i].hidden; })],
      ['Monter', () => moveSlide(i, -1)], ['Descendre', () => moveSlide(i, 1)], '-', ['Supprimer la diapositive', () => deleteSlide(i)]];
  }
  function moveSlide(i, d) { const j = i + d; if (j < 0 || j >= deck.slides.length) return; change(() => { const [s] = deck.slides.splice(i, 1); deck.slides.splice(j, 0, s); cur = j; }); }
  function deleteSlide(i = cur) { if (deck.slides.length < 2) return toast('Une présentation garde au moins une diapositive'); change(() => { deck.slides.splice(i, 1); cur = Math.min(cur, deck.slides.length - 1); sel = []; }); }
  function go(i) { if (i < 0 || i >= deck.slides.length) return; endEdits(); if (i === cur) return; cur = i; sel = []; renderAll(); }

  /* ================= Propriétés ================= */
  function renderProps() {
    const els = selEls(); const th = theme();
    let h = '';
    if (!els.length) {
      const s = slide();
      h += `<div class="section"><h3>Diapositive ${cur + 1}</h3>
        <div class="field"><label>Disposition</label><div class="btns"><button data-x="layout">${esc((LAYOUTS[s.layout] || { name: 'Personnalisée' }).name)} ▾</button></div></div>
        <div class="field"><label for="pBg">Arrière-plan</label><div class="row"><select id="pBg"><option value="theme">Celui du thème</option><option value="color" ${s.bg && s.bg.color ? 'selected' : ''}>Couleur</option><option value="image" ${s.bg && s.bg.image ? 'selected' : ''}>Image…</option></select><input type="color" id="pBgC" value="${toHex(s.bg && s.bg.color) || '#ffffff'}" ${s.bg && s.bg.color ? '' : 'hidden'}></div></div>
        <label class="row"><input type="checkbox" id="pNoDeco" ${s.bg && s.bg.noDeco ? 'checked' : ''}> Masquer les décorations du thème</label>
        <div class="grid2"><div class="field"><label for="pTr">Transition</label><select id="pTr">${[['none', 'Aucune'], ['fade', 'Fondu'], ['push', 'Poussée'], ['cover', 'Couvrir'], ['zoom', 'Zoom'], ['flip', 'Retournement']].map(([v, l]) => `<option value="${v}" ${(s.transition || {}).type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="pTrD">Durée (s)</label><input type="number" id="pTrD" min="0.1" max="3" step="0.1" value="${(s.transition || {}).dur || 0.5}"></div></div>
        <label class="row"><input type="checkbox" id="pHide" ${s.hidden ? 'checked' : ''}> Masquer pendant le diaporama</label>
      </div>
      <div class="section"><h3>Thème</h3><div class="themes">${Object.entries(THEMES).map(([k, t]) => `<button data-theme="${k}" class="${deck.theme === k ? 'on' : ''}" style="background:${t.bg}"><i style="position:absolute;left:8px;top:8px;width:40px;height:5px;background:${t.acc[0]}"></i><span style="color:${t.title};font-family:${t.tFont}">${t.name}</span></button>`).join('')}</div></div>`;
    } else {
      const el = els[0]; const s = el.style || {}; const one = els.length === 1;
      if (one) h += `<div class="section"><h3>Position et taille</h3><div class="grid2">${[['x', 'X'], ['y', 'Y'], ['w', 'Largeur'], ['h', 'Hauteur']].map(([k, l]) => `<div class="field"><label>${l}</label><input type="number" data-k="${k}" value="${Math.round(el[k])}"></div>`).join('')}<div class="field"><label>Rotation (°)</label><input type="number" data-k="rot" value="${el.rot || 0}"></div><div class="field"><label>Opacité (%)</label><input type="number" min="0" max="100" data-k="style.opacity%" value="${Math.round((s.opacity ?? 1) * 100)}"></div></div></div>`;
      if (els.some((x) => x.type === 'shape' || x.type === 'text')) {
        const isShape = el.type === 'shape';
        h += `<div class="section"><h3>${isShape ? 'Forme' : 'Zone de texte'}</h3>
          ${isShape ? `<div class="field"><label>Forme</label><select data-k="style.shape">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}" ${s.shape === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>` : ''}
          <div class="grid2"><div class="field"><label>Remplissage</label><div class="row"><input type="color" data-k="style.fill" value="${toHex(accColor(s.fill, th)) || '#ffffff'}"><button data-x="noFill" title="Sans remplissage">⌀</button></div></div>
          <div class="field"><label>Contour</label><div class="row"><input type="color" data-k="style.stroke" value="${toHex(accColor(s.stroke, th)) || '#000000'}"><button data-x="noStroke" title="Sans contour">⌀</button></div></div>
          <div class="field"><label>Épaisseur du contour</label><input type="number" min="0" max="30" data-k="style.strokeW" value="${s.strokeW || 2}"></div>
          <div class="field"><label>Arrondi des coins</label><input type="number" min="0" max="400" data-k="style.radius" value="${s.radius || 0}"></div></div>
          <div class="btns">${th.acc.map((c, i) => `<button data-fill="acc${i}" title="Couleur ${i + 1} du thème" style="background:${c};width:26px;height:22px;min-width:0"></button>`).join('')}</div>
          <label class="row"><input type="checkbox" data-k="style.shadow" ${s.shadow ? 'checked' : ''}> Ombre</label>
          <div class="grid2"><div class="field"><label>Alignement vertical</label><select data-k="style.valign"><option value="">Auto</option><option value="top" ${s.valign === 'top' ? 'selected' : ''}>Haut</option><option value="middle" ${s.valign === 'middle' ? 'selected' : ''}>Milieu</option><option value="bottom" ${s.valign === 'bottom' ? 'selected' : ''}>Bas</option></select></div>
          <div class="field"><label>Interligne</label><select data-k="style.lineH">${[['', 'Normal'], ['1', '1'], ['1.3', '1,3'], ['1.5', '1,5'], ['2', '2']].map(([v, l]) => `<option value="${v}" ${String(s.lineH || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>`;
      }
      if (el.type === 'image' && one) h += `<div class="section"><h3>Image</h3><div class="btns"><button data-x="replaceImg">Remplacer…</button><button data-x="resetImg">Taille d'origine</button><button data-x="imgBg">Mettre en arrière-plan</button></div>
        <div class="grid2"><div class="field"><label>Ajustement</label><select data-k="style.fit"><option value="contain" ${s.fit !== 'cover' ? 'selected' : ''}>Contenir</option><option value="cover" ${s.fit === 'cover' ? 'selected' : ''}>Remplir (rogner)</option></select></div><div class="field"><label>Coins arrondis</label><input type="number" min="0" max="400" data-k="style.radius" value="${s.radius || 0}"></div></div>
        <label class="row"><input type="checkbox" data-k="style.shadow" ${s.shadow ? 'checked' : ''}> Ombre</label></div>`;
      if (el.type === 'table' && one) h += `<div class="section"><h3>Tableau</h3><div class="btns"><button data-x="rowAdd">+ Ligne</button><button data-x="rowDel">− Ligne</button><button data-x="colAdd">+ Colonne</button><button data-x="colDel">− Colonne</button></div>
        <label class="row"><input type="checkbox" data-k="table.header" ${el.table.header ? 'checked' : ''}> Ligne d'en-tête</label><label class="row"><input type="checkbox" data-k="table.band" ${el.table.band ? 'checked' : ''}> Lignes alternées</label>
        <div class="grid2"><div class="field"><label>Couleur</label><input type="color" data-k="table.hdr" value="${toHex(accColor(el.table.hdr || 'acc0', th))}"></div><div class="field"><label>Taille du texte</label><input type="number" min="6" max="60" data-k="style.size" value="${s.size || 16}"></div></div><p class="hint">Double-cliquez sur le tableau pour écrire ; Tab passe à la cellule suivante.</p></div>`;
      if (el.type === 'chart' && one) h += `<div class="section"><h3>Graphique</h3><div class="field"><label>Type</label><select data-k="chart.type">${[['col', 'Colonnes'], ['bar', 'Barres'], ['line', 'Courbes'], ['area', 'Aires'], ['pie', 'Secteurs'], ['donut', 'Anneau']].map(([v, l]) => `<option value="${v}" ${el.chart.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Titre</label><input type="text" data-k="chart.title" value="${esc(el.chart.title || '')}"></div><label class="row"><input type="checkbox" data-k="chart.legend" ${el.chart.legend !== false ? 'checked' : ''}> Légende</label><label class="row"><input type="checkbox" data-k="chart.values" ${el.chart.values ? 'checked' : ''}> Valeurs sur les colonnes</label>
        <div class="btns"><button data-x="editChart">Modifier les données…</button></div></div>`;
      h += `<div class="section"><h3>Animation (diaporama)</h3><div class="grid2"><div class="field"><label>Effet d'entrée</label><select data-k="anim.type">${[['', 'Aucun'], ['appear', 'Apparition'], ['fade', 'Fondu'], ['up', 'Entrée par le bas'], ['left', 'Entrée par la gauche'], ['zoom', 'Zoom'], ['wipe', 'Balayage']].map(([v, l]) => `<option value="${v}" ${((el.anim || {}).type || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Démarrage</label><select data-k="anim.start"><option value="click" ${((el.anim || {}).start || 'click') === 'click' ? 'selected' : ''}>Au clic</option><option value="with" ${(el.anim || {}).start === 'with' ? 'selected' : ''}>Avec le précédent</option><option value="after" ${(el.anim || {}).start === 'after' ? 'selected' : ''}>Après le précédent</option></select></div></div>
        ${el.type === 'text' ? `<label class="row"><input type="checkbox" data-k="anim.byPara" ${(el.anim || {}).byPara ? 'checked' : ''}> Paragraphe par paragraphe</label>` : ''}</div>`;
      h += `<div class="section"><h3>Organiser</h3><div class="btns"><button data-x="front">Premier plan</button><button data-x="back">Arrière-plan</button><button data-x="duplicate">Dupliquer</button><button data-x="delete">Supprimer</button></div>
        <div class="btns">${[['L', '⇤ Gauche'], ['C', '↔ Centre'], ['R', '⇥ Droite'], ['T', '⤒ Haut'], ['M', '↕ Milieu'], ['B', '⤓ Bas']].map(([k, l]) => `<button data-align="${k}">${l}</button>`).join('')}${els.length > 2 ? '<button data-align="DH">Répartir horiz.</button><button data-align="DV">Répartir vert.</button>' : ''}</div><p class="hint">${els.length > 1 ? 'Alignement entre les objets sélectionnés.' : 'Alignement sur la diapositive.'}</p></div>`;
    }
    propsEl.innerHTML = h;
  }
  const toHex = (c) => { if (!c) return ''; if (/^#[0-9a-f]{6}$/i.test(c)) return c; const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : '#ffffff'; };
  function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; } if (v === '' || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v; }
  propsEl.addEventListener('change', (e) => {
    const t = e.target; const s = slide();
    if (t.id === 'pBg') { if (t.value === 'image') { act('bgImage'); return; } change(() => { s.bg = t.value === 'theme' ? (s.bg && s.bg.noDeco ? { noDeco: true } : null) : { ...(s.bg || {}), color: $('#pBgC').value, image: undefined }; }); return; }
    if (t.id === 'pBgC') { change(() => { s.bg = { ...(s.bg || {}), color: t.value, image: undefined }; }); return; }
    if (t.id === 'pNoDeco') { change(() => { s.bg = { ...(s.bg || {}), noDeco: t.checked || undefined }; }); return; }
    if (t.id === 'pTr' || t.id === 'pTrD') { change(() => { s.transition = { type: $('#pTr').value, dur: +$('#pTrD').value || 0.5 }; }); return; }
    if (t.id === 'pHide') { change(() => { s.hidden = t.checked; }); return; }
    const k = t.dataset.k; if (!k) return;
    let v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value;
    change(() => selEls().forEach((el) => {
      if (k === 'style.opacity%') { el.style.opacity = Math.max(0, Math.min(100, v)) / 100; return; }
      if (k === 'chart.legend' || k === 'chart.values') { el.chart[k.split('.')[1]] = v; return; }
      if (k.startsWith('chart.') && !el.chart) return; if (k.startsWith('table.') && !el.table) return;
      if (k === 'style.lineH') v = t.value ? +t.value : '';
      if (k === 'anim.type' && !v) { delete el.anim; return; }
      setPath(el, k, v === false ? '' : v);
    }));
  });
  propsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.theme) { change(() => { deck.theme = b.dataset.theme; }); return; }
    if (b.dataset.fill) { change(() => selEls().forEach((el) => { el.style.fill = b.dataset.fill; })); return; }
    if (b.dataset.align) { alignSel(b.dataset.align); return; }
    if (b.dataset.x) act(b.dataset.x);
  });
  function alignSel(k) {
    const els = selEls(); if (!els.length) return;
    const ref = els.length > 1 ? bbox(els) : { x: 0, y: 0, w: W(), h: H() };
    change(() => {
      if (k === 'DH' || k === 'DV') { const key = k === 'DH' ? 'x' : 'y', sz = k === 'DH' ? 'w' : 'h'; const sorted = [...els].sort((a, b) => a[key] - b[key]); const total = sorted.reduce((a, e) => a + e[sz], 0); const gap = (ref[sz] - total) / (sorted.length - 1); let p = ref[key]; sorted.forEach((e) => { e[key] = Math.round(p); p += e[sz] + gap; }); return; }
      els.forEach((el) => { if (k === 'L') el.x = ref.x; if (k === 'C') el.x = Math.round(ref.x + (ref.w - el.w) / 2); if (k === 'R') el.x = ref.x + ref.w - el.w; if (k === 'T') el.y = ref.y; if (k === 'M') el.y = Math.round(ref.y + (ref.h - el.h) / 2); if (k === 'B') el.y = ref.y + ref.h - el.h; });
    });
  }

  /* ================= Barre d'outils texte ================= */
  const tFont = $('#tFont'), tSize = $('#tSize'), tColor = $('#tColor'), tHi = $('#tHi');
  $$('.tools button, .topbar .menu > button').forEach((b) => b.addEventListener('mousedown', (e) => { if (!e.target.closest('.clr')) e.preventDefault(); }));
  function editingNode() { return editingId && slideDom ? slideDom.querySelector(`[data-id="${editingId}"] [contenteditable="true"]`) : null; }
  // la sélection du texte est mémorisée : les listes déroulantes de la barre d'outils prennent le focus
  let savedRange = null;
  document.addEventListener('selectionchange', () => { const n = editingNode(); const s = getSelection(); if (n && s.rangeCount && n.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); });
  function hasTextSel() {
    const n = editingNode(); if (!n) return false; const s = getSelection();
    if (s.rangeCount && n.contains(s.anchorNode)) return true;
    if (savedRange && n.contains(savedRange.startContainer)) { const host = savedRange.startContainer.nodeType === 1 ? savedRange.startContainer.closest('[contenteditable="true"]') : savedRange.startContainer.parentElement.closest('[contenteditable="true"]'); (host || n).focus({ preventScroll: true }); s.removeAllRanges(); s.addRange(savedRange); return true; }
    return false;
  }
  function textCmd(cmd, val, elProp, elVal) {
    if (hasTextSel()) { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); return; }
    const els = selEls().filter((x) => x.type === 'text' || x.type === 'shape' || x.type === 'table' || x.type === 'chart'); if (!els.length) return toast('Sélectionnez une zone de texte');
    change(() => els.forEach((el) => { const v = typeof elVal === 'function' ? elVal(el) : elVal; setPath(el, 'style.' + elProp, v); if (el.text) el.text = stripInline(el.text, elProp); }));
  }
  function applyFontSize(pt) {
    if (hasTextSel() && !getSelection().isCollapsed) {
      document.execCommand('styleWithCSS', false, false); document.execCommand('fontSize', false, '7');
      editingNode().querySelectorAll('font[size="7"]').forEach((f) => { const sp = document.createElement('span'); sp.style.fontSize = pt * PT + 'px'; sp.append(...f.childNodes); f.replaceWith(sp); });
      editingNode().querySelectorAll('[style*="xxx-large"]').forEach((n) => { n.style.fontSize = pt * PT + 'px'; });
      return;
    }
    if (editingId) endEdits();
    textCmd(null, null, 'size', pt);
  }
  function listCmd(type) {
    if (hasTextSel()) { document.execCommand(type === 'ul' ? 'insertUnorderedList' : 'insertOrderedList'); return; }
    const els = selEls().filter((x) => x.type === 'text' || x.type === 'shape'); if (!els.length) return;
    change(() => els.forEach((el) => {
      const d = document.createElement('div'); d.innerHTML = el.text || ''; const inList = d.querySelector(type) && !d.querySelector(type === 'ul' ? 'ol' : 'ul');
      const lines = plainText(el.text).split('\n').filter((l) => l.trim());
      el.text = inList ? lines.map((l) => `<p>${esc(l)}</p>`).join('') : `<${type}>${(lines.length ? lines : ['']).map((l) => `<li>${esc(l)}</li>`).join('')}</${type}>`;
    }));
  }
  tFont.onchange = () => { if (hasTextSel()) document.execCommand('fontName', false, tFont.value || theme().bFont); else textCmd(null, null, 'font', tFont.value || ''); };
  tSize.onchange = () => { if (tSize.value) applyFontSize(+tSize.value); };
  tColor.oninput = () => { $('#tColorBar').style.background = tColor.value; };
  tColor.onchange = () => { textCmd('foreColor', tColor.value, 'color', tColor.value); };
  tHi.oninput = () => { $('#tHiBar').style.background = tHi.value; };
  tHi.onchange = () => { if (hasTextSel()) { document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, tHi.value); } else toast('Sélectionnez du texte à surligner'); };
  tColor.parentElement.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); textCmd('foreColor', tColor.value, 'color', tColor.value); });
  tHi.parentElement.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); if (hasTextSel()) { document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, tHi.value); } });
  [tColor, tHi].forEach((x) => x.addEventListener('click', (e) => e.stopPropagation()));
  function updateTools() {
    const el = selEls()[0]; const s = (el && el.style) || {};
    tFont.value = s.font || ''; tSize.value = s.size ? String(s.size) : '';
    if (s.size && ![...tSize.options].some((o) => o.value === String(s.size))) { tSize.add(new Option(String(s.size))); tSize.value = String(s.size); }
  }

  /* ================= Insertion d'objets ================= */
  function addEl(el, { edit = false } = {}) {
    el.id = el.id || uid(); el.rot = el.rot || 0; el.style = el.style || {};
    change(() => { slide().els.push(el); sel = [el.id]; });
    if (edit) startTextEdit(el.id);
    return el;
  }
  function addTextBox() {
    const el = { type: 'text', role: 'text', x: Math.round(W() / 2 - 260), y: Math.round(H() / 2 - 40), w: 520, h: 80, text: '', style: { size: 24 } };
    addEl(el, { edit: true });
  }
  function addShape(kind) {
    const sh = SHAPES[kind]; const line = sh && sh.line;
    const el = { type: 'shape', role: 'shape', x: Math.round(W() / 2 - 150), y: Math.round(H() / 2 - (line ? 15 : 90)), w: 300, h: line ? 30 : 180, text: '', style: line ? { shape: kind, stroke: 'acc0', strokeW: 4 } : { shape: kind, fill: 'acc0', size: 20 } };
    if (kind === 'ellipse' || kind === 'star' || kind === 'hexagon') { el.w = 200; el.h = 200; el.x = Math.round(W() / 2 - 100); el.y = Math.round(H() / 2 - 100); }
    addEl(el);
  }
  async function readImage(file, maxSide = 2000) {
    const url = await Studio.readAsDataURL(file);
    if (/svg|gif/.test(file.type)) return url;
    const img = await Studio.loadImage(url);
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (k >= 1 && file.size < 1.5e6) return url;
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    const png = /png|webp/.test(file.type) ? c.toDataURL('image/png') : null;
    return png && png.length < 2.5e6 ? png : c.toDataURL('image/jpeg', 0.88);
  }
  async function addImages(files, target) {
    for (const f of files) {
      if (!/^image\//.test(f.type)) continue;
      const url = await readImage(f); const id = addMedia(url); const img = await Studio.loadImage(url);
      const ph = target || selEls().find((e) => e.type === 'image' && !e.src);
      if (ph) { change(() => { ph.src = id; if (ph.style.fit !== 'cover') { const k = Math.min(ph.w / img.naturalWidth, ph.h / img.naturalHeight); const nw = img.naturalWidth * k, nh = img.naturalHeight * k; ph.x += Math.round((ph.w - nw) / 2); ph.y += Math.round((ph.h - nh) / 2); ph.w = Math.round(nw); ph.h = Math.round(nh); } }); target = null; continue; }
      const k = Math.min(1, (W() * 0.6) / img.naturalWidth, (H() * 0.6) / img.naturalHeight);
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      addEl({ type: 'image', x: Math.round((W() - w) / 2), y: Math.round((H() - h) / 2), w, h, src: id, style: { fit: 'contain' } });
    }
  }

  /* ================= Presse-papiers ================= */
  let clip = null;
  function copySel(cut) {
    const els = selEls(); if (!els.length) return false;
    clip = { els: JSON.parse(JSON.stringify(els)), slide: slide().id, n: 0 };
    if (cut) change(() => { slide().els = slide().els.filter((e) => !sel.includes(e.id)); sel = []; });
    return true;
  }
  function pasteClip() {
    if (!clip) return; clip.n++;
    const off = clip.slide === slide().id ? 20 * clip.n : 0;
    change(() => { const ids = []; clip.els.forEach((e) => { const n = JSON.parse(JSON.stringify(e)); n.id = uid(); n.x += off; n.y += off; slide().els.push(n); ids.push(n.id); }); sel = ids; });
  }
  document.addEventListener('copy', (e) => { if (editingId || inField()) return; if (copySel(false)) { e.preventDefault(); e.clipboardData.setData('text/plain', selEls().map((x) => plainText(x.text || '')).join('\n') || ' '); clip.text = e.clipboardData.getData('text/plain'); } });
  document.addEventListener('cut', (e) => { if (editingId || inField()) return; const t = selEls().map((x) => plainText(x.text || '')).join('\n') || ' '; if (copySel(true)) { e.preventDefault(); e.clipboardData.setData('text/plain', t); clip.text = t; } });
  document.addEventListener('paste', async (e) => {
    if (editingId) { // collage dans un texte : texte brut seulement
      const t = e.clipboardData.getData('text/plain'); if (t) { e.preventDefault(); document.execCommand('insertText', false, t); } return;
    }
    if (inField() || document.querySelector('.modal-back')) return;
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addImages(files); return; }
    const t = e.clipboardData.getData('text/plain');
    if (clip && (t === clip.text || !t)) { e.preventDefault(); pasteClip(); return; }
    if (t) { e.preventDefault(); const lines = t.split(/\r?\n/).filter((l) => l.trim()); addEl({ type: 'text', role: 'text', x: 80, y: 120, w: W() - 160, h: Math.min(H() - 160, 40 + lines.length * 36), text: lines.map((l) => `<p>${esc(l)}</p>`).join(''), style: { size: 20 } }); }
  });
  const inField = () => { const a = document.activeElement; return a && a.matches && a.matches('input, textarea, select, [contenteditable="true"]'); };

  /* ================= Clavier ================= */
  function key(e) {
    if (document.querySelector('.modal-back') || document.querySelector('.show, .presenter')) return;
    if (editingId || inField()) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); act('savePptx'); }
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey, k = e.key;
    if (k === 'F5') { e.preventDefault(); act(e.shiftKey ? 'showHere' : 'showStart'); return; }
    if (ctrl) {
      const map = { z: 'undo', y: 'redo', d: 'duplicate', a: 'selectAll', m: 'newSlide', s: 'savePptx', o: 'open', b: 'tBold', i: 'tItalic', u: 'tUnder' };
      const a = map[k.toLowerCase()]; if (a) { e.preventDefault(); if (e.shiftKey && k.toLowerCase() === 'z') act('redo'); else act(a); }
      return;
    }
    const els = selEls();
    if ((k === 'Delete' || k === 'Backspace') && els.length) { e.preventDefault(); act('delete'); return; }
    if (k.startsWith('Arrow') && els.length) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0; change(() => els.forEach((el) => { el.x += dx; el.y += dy; })); return; }
    if (!els.length && (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown')) { e.preventDefault(); go(cur + 1); return; }
    if (!els.length && (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp')) { e.preventDefault(); go(cur - 1); return; }
    if (k === 'PageDown') { e.preventDefault(); go(cur + 1); return; } if (k === 'PageUp') { e.preventDefault(); go(cur - 1); return; }
    if (k === 'Escape') { sel = []; renderOverlay(); renderProps(); return; }
    if (k === 'Tab' && slide().els.length) { e.preventDefault(); const ids = slide().els.map((x) => x.id); const i = ids.indexOf(sel[0]); sel = [ids[(i + (e.shiftKey ? -1 : 1) + ids.length) % ids.length]]; renderOverlay(); renderProps(); return; }
    if ((k === 'Enter' || k === 'F2') && els.length === 1 && (els[0].type === 'text' || els[0].type === 'shape')) { e.preventDefault(); startTextEdit(els[0].id); return; }
    // une lettre tapée sur une zone sélectionnée remplace son texte, comme dans PowerPoint
    if (k.length === 1 && !e.altKey && els.length === 1 && (els[0].type === 'text' || els[0].type === 'shape')) {
      e.preventDefault(); const el = els[0]; const before = snap(); el.text = el.role === 'body' ? `<ul><li>${esc(k)}</li></ul>` : `<p>${esc(k)}</p>`; startTextEdit(el.id); editBefore = before;
      const n = editingNode(); const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
    }
  }
  document.addEventListener('keydown', key);

  /* ================= Menu contextuel ================= */
  let ctxEl = null;
  function hideCtx() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
  function showCtx(x, y, items) {
    hideCtx(); ctxEl = document.createElement('div'); ctxEl.className = 'ctx';
    items.forEach((it) => { if (it === '-') { ctxEl.appendChild(document.createElement('hr')); return; } const b = document.createElement('button'); b.textContent = it[0]; b.onclick = () => { hideCtx(); it[1](); }; ctxEl.appendChild(b); });
    document.body.appendChild(ctxEl); const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px'; ctxEl.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  }
  document.addEventListener('pointerdown', (e) => { if (ctxEl && !ctxEl.contains(e.target)) hideCtx(); });
  stage.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[contenteditable="true"]')) return;
    e.preventDefault(); const n = e.target.closest('.sj-el');
    if (n && !sel.includes(n.dataset.id)) { sel = [n.dataset.id]; renderOverlay(); renderProps(); }
    const items = sel.length ? [['Couper', () => { copySel(true); }], ['Copier', () => { copySel(false); toast('Copié'); }], ['Coller', pasteClip], ['Dupliquer', () => act('duplicate')], '-', ['Premier plan', () => act('front')], ['Arrière-plan', () => act('back')], '-', ['Supprimer', () => act('delete')]]
      : [['Coller', pasteClip], ['Nouvelle zone de texte', addTextBox], ['Disposition…', () => act('layout')], ['Arrière-plan…', () => act('bgImage')], ['Nouvelle diapositive', () => act('newSlide')]];
    showCtx(e.clientX, e.clientY, items);
  });

  /* ================= Actions ================= */
  const actions = {
    undo, redo,
    copy: () => { if (copySel(false)) toast('Copié'); }, cut: () => copySel(true), paste: pasteClip,
    duplicate: () => { if (!sel.length) return act('dupSlide'); copySel(false); clip.n = 0; pasteClip(); },
    delete: () => { if (!sel.length) return deleteSlide(); change(() => { slide().els = slide().els.filter((e) => !sel.includes(e.id)); sel = []; }); },
    selectAll: () => { sel = slide().els.map((e) => e.id); renderOverlay(); renderProps(); },
    dupSlide: () => change(() => { const c = JSON.parse(JSON.stringify(slide())); c.id = uid(); c.els.forEach((e) => { e.id = uid(); }); deck.slides.splice(cur + 1, 0, c); cur++; sel = []; }),
    addText: addTextBox, addImage: async () => { const files = await Studio.pickFiles('image/*', true); if (files.length) addImages(files); },
    front: () => change(() => { const s = slide(); const m = s.els.filter((e) => sel.includes(e.id)); s.els = s.els.filter((e) => !sel.includes(e.id)).concat(m); }),
    back: () => change(() => { const s = slide(); const m = s.els.filter((e) => sel.includes(e.id)); s.els = m.concat(s.els.filter((e) => !sel.includes(e.id))); }),
    noFill: () => change(() => selEls().forEach((el) => { el.style.fill = ''; delete el.style.fill; })), noStroke: () => change(() => selEls().forEach((el) => { delete el.style.stroke; })),
    tBold: () => textCmd('bold', null, 'bold', (el) => !(el.style.bold !== undefined ? el.style.bold : el.role === 'title')),
    tItalic: () => textCmd('italic', null, 'italic', (el) => !el.style.italic), tUnder: () => textCmd('underline', null, 'underline', (el) => !el.style.underline),
    tLeft: () => textCmd('justifyLeft', null, 'align', 'left'), tCenter: () => textCmd('justifyCenter', null, 'align', 'center'), tRight: () => textCmd('justifyRight', null, 'align', 'right'),
    tBullets: () => listCmd('ul'), tNumbers: () => listCmd('ol'),
    tIndent: () => { if (hasTextSel()) document.execCommand('indent'); }, tOutdent: () => { if (hasTextSel()) document.execCommand('outdent'); },
    replaceImg: async () => { const el = selEls()[0]; const [f] = await Studio.pickFiles('image/*', false); if (f) { const url = await readImage(f); change(() => { el.src = addMedia(url); }); } },
    resetImg: async () => { const el = selEls()[0]; if (!el.src) return; const img = await Studio.loadImage(deck.media[el.src]); const k = Math.min(1, (W() * 0.9) / img.naturalWidth, (H() * 0.9) / img.naturalHeight); change(() => { el.w = Math.round(img.naturalWidth * k); el.h = Math.round(img.naturalHeight * k); el.x = Math.round((W() - el.w) / 2); el.y = Math.round((H() - el.h) / 2); el.rot = 0; }); },
    imgBg: () => { const el = selEls()[0]; if (!el.src) return; change(() => { slide().bg = { ...(slide().bg || {}), image: el.src, color: undefined }; slide().els = slide().els.filter((e) => e !== el); sel = []; }); },
    rowAdd: () => change(() => { const t = selEls()[0].table; t.rows.push(t.rows[0].map(() => '')); selEls()[0].h += 40; }),
    rowDel: () => change(() => { const el = selEls()[0]; if (el.table.rows.length > 1) { el.table.rows.pop(); el.h = Math.max(40, el.h - 40); } }),
    colAdd: () => change(() => { const t = selEls()[0].table; t.rows.forEach((r) => r.push('')); if (t.colW) t.colW.push(1); }),
    colDel: () => change(() => { const t = selEls()[0].table; if (t.rows[0].length > 1) { t.rows.forEach((r) => r.pop()); if (t.colW) t.colW.pop(); } }),
    bgImage: async () => { const [f] = await Studio.pickFiles('image/*', false); if (!f) return; const url = await readImage(f, 2400); change(() => { slide().bg = { ...(slide().bg || {}), image: addMedia(url), color: undefined }; }); },
    addDate: () => addEl({ type: 'text', role: 'text', x: W() - 340, y: H() - 60, w: 300, h: 44, text: `<p>${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>`, style: { size: 14, align: 'right' } }),
    slideNumbers: () => {
      const has = deck.slides.some((s) => s.els.some((e) => e.field === 'num'));
      change(() => deck.slides.forEach((s, i) => { s.els = s.els.filter((e) => e.field !== 'num'); if (!has && !(i === 0 && s.layout === 'title')) s.els.push({ id: uid(), type: 'text', role: 'text', field: 'num', x: W() - 110, y: H() - 52, w: 80, h: 36, rot: 0, text: '', style: { size: 12, align: 'right', color: '' } }); }));
      toast(has ? 'Numéros retirés' : 'Numéros ajoutés (sauf sur la diapositive de titre)');
    },
    rename: async () => { const n = await modal({ title: 'Nom de la présentation', body: `<input type="text" id="dn" value="${esc(deck.title)}">`, onOpen: (b) => b.querySelector('#dn').select(), buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => b.querySelector('#dn').value.trim() }] }); if (n) { deck.title = n; dirty(); } },
  };
  function act(name) {
    hideCtx();
    if (editingId && !/^t[A-Z]|undo|redo/.test(name)) endEdits();
    const fn = actions[name] || (Studio.slidesExtra && Studio.slidesExtra.actions[name]);
    if (!fn) return console.warn('action inconnue', name);
    try { const r = fn(); if (r && r.catch) r.catch((e) => { console.error(e); toast('Erreur : ' + e.message, 7000); }); } catch (e) { console.error(e); toast('Erreur : ' + e.message, 7000); }
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); act(b.dataset.act); } });
  initMenus();

  /* ================= Notes ================= */
  let notesBefore = null;
  notesEl.addEventListener('focus', () => { notesBefore = snap(); });
  notesEl.addEventListener('input', () => { slide().notes = notesEl.value; dirty(); });
  notesEl.addEventListener('blur', () => { if (notesBefore) { pushUndo(notesBefore); notesBefore = null; } });

  /* ================= Rendu global ================= */
  function renderAll(full) {
    if (cur >= deck.slides.length) cur = deck.slides.length - 1;
    sel = sel.filter((id) => elById(id));
    renderStage();
    if (full || sorter.children.length !== deck.slides.length + 1) renderSorter(); else { sorter.querySelectorAll('.thumb').forEach((t, i) => { t.classList.toggle('on', i === cur); t.classList.toggle('hid', !!deck.slides[i].hidden); t.querySelector('.n').textContent = i + 1 + (deck.slides[i].hidden ? '⊘' : ''); }); updateThumbs(); }
    renderProps(); updateTools();
    if (document.activeElement !== notesEl) notesEl.value = slide().notes || '';
    $('#slideInfo').textContent = `Diapositive ${cur + 1} sur ${deck.slides.length}`;
    $('#docName').textContent = deck.title + (isDirty ? ' •' : '');
    const on = sorter.querySelector('.thumb.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  // miniatures : on ne redessine que celles qui ont changé
  const thumbCache = new Map();
  function updateThumbs() {
    deck.slides.forEach((s, i) => { const key = JSON.stringify(s) + deck.theme + i; if (thumbCache.get(s.id) !== key) { thumbCache.set(s.id, key); updateThumb(i); } });
  }
  addEventListener('resize', () => { clearTimeout(window.__rsT); window.__rsT = setTimeout(() => renderSorter(), 200); });

  /* ================= API pour slides-extra.js ================= */
  window.PresJoe = {
    get deck() { return deck; }, get cur() { return cur; }, set cur(v) { cur = v; }, get sel() { return sel; }, set sel(v) { sel = v; },
    THEMES, LAYOUTS, SHAPES, SLIDE_CSS, PT, uid, esc, txt, newDeck, newSlide, renderSlide, renderEl, chartSVG, accColor, theme, bgCss, textStyle,
    slide, selEls, elById, change, snap, pushUndo, renderAll, addEl, addShape, addImages, addMedia, readImage, loadDeck, serialize, autosave, idb, go, act, actions,
    sanitize, plainText, isEmptyText, endEdits, showCtx, hideCtx, markSaved: () => { isDirty = false; renderAll(); }, get dirty() { return isDirty; }, W, H, stage,
  };

  /* ================= Démarrage ================= */
  document.addEventListener('DOMContentLoaded', async () => {
    try { const s = await idb.get('deck'); if (s) { loadDeck(JSON.parse(s)); isDirty = false; } else renderAll(true); } catch (e) { console.warn(e); renderAll(true); }
    if (Studio.speech && Studio.speech.attachMic) Studio.speech.attachMic(notesEl);
    renderAll(true);
  });
})();
