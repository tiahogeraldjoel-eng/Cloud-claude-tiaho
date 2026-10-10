/* Studio Joe — Présentation Joe : dialogues d'insertion, thèmes, diaporama et mode présentateur,
   fichiers (.pptx en lecture et écriture, .joeslides, PDF, PNG), modèles, plan → diapositives, IA. */
(function () {
  const { $, toast, download, pickFiles, baseName, modal, confirmBox, onDropFiles } = Studio;
  const P = window.PresJoe;
  const esc = P.esc, uid = P.uid;
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); });
    return loaded[src];
  }
  const fileBase = () => (P.deck.title || 'Présentation').replace(/[\\/:*?"<>|]+/g, '_');

  /* ================= Dispositions et nouvelles diapositives ================= */
  function layoutPreview(key) {
    const els = P.LAYOUTS[key].make(160, 90);
    return `<div class="lp">${els.map((e) => `<i style="left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.role === 'title' ? Math.min(e.h, 10) : e.h}px;${e.role === 'title' ? 'background:#8a909c' : ''}"></i>`).join('')}</div>`;
  }
  async function pickLayout(title) {
    return modal({
      title, wide: true,
      body: `<div class="layout-grid">${Object.entries(P.LAYOUTS).map(([k, l]) => `<button type="button" data-l="${k}">${layoutPreview(k)}<span>${l.name}</span></button>`).join('')}</div>`,
      onOpen: (b) => b.querySelectorAll('[data-l]').forEach((x) => { x.onclick = () => { b.dataset.l = x.dataset.l; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
      buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => b.dataset.l || null }],
    });
  }
  async function newSlideDialog() {
    const k = await pickLayout('Nouvelle diapositive'); if (!k) return;
    P.change(() => { const s = P.newSlide(k); const prev = P.slide(); if (prev && prev.transition) s.transition = { ...prev.transition }; P.deck.slides.splice(P.cur + 1, 0, s); P.cur = P.cur + 1; P.sel = []; });
  }
  async function layoutDialog() {
    const k = await pickLayout('Disposition de la diapositive'); if (!k) return;
    // le texte des zones existantes est repris dans la nouvelle disposition
    P.change(() => {
      const s = P.slide(); const fresh = P.LAYOUTS[k].make(P.W(), P.H());
      const old = s.els.filter((e) => e.role === 'title' || e.role === 'subtitle' || e.role === 'body' || e.role === 'picture');
      const used = new Set();
      fresh.forEach((n) => { const o = old.find((e) => !used.has(e) && e.role === n.role); if (o) { used.add(o); if (o.type === 'text') n.text = o.text; if (o.type === 'image') n.src = o.src; } });
      s.els = s.els.filter((e) => !old.includes(e) || (!used.has(e) && !P.isEmptyText(e.text) && e.type === 'text')).concat(fresh);
      s.layout = k;
    });
  }

  /* ================= Formes, tableaux, graphiques, icônes ================= */
  async function shapesDialog() {
    const th = P.theme();
    const k = await modal({
      title: 'Insérer une forme', wide: true,
      body: `<div class="layout-grid">${Object.entries(P.SHAPES).map(([k2, s]) => { const el = { id: 'p' + k2, type: 'shape', x: 0, y: 0, w: 120, h: s.line ? 20 : 70, rot: 0, text: '', style: s.line ? { shape: k2, stroke: 'acc0', strokeW: 4 } : { shape: k2, fill: 'acc0' } }; const n = P.renderEl(el, th, {}, P.deck); n.style.position = 'relative'; n.style.left = n.style.top = '0'; n.style.margin = '6px auto'; return `<button type="button" data-s="${k2}">${n.outerHTML}<span>${s.name}</span></button>`; }).join('')}</div>`,
      onOpen: (b) => b.querySelectorAll('[data-s]').forEach((x) => { x.onclick = () => { b.dataset.s = x.dataset.s; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
      buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => b.dataset.s || null }],
    });
    if (k) P.addShape(k);
  }
  async function tableDialog() {
    const r = await modal({ title: 'Insérer un tableau', body: '<div class="grid2"><div class="field"><label for="tbR">Lignes</label><input type="number" id="tbR" min="1" max="30" value="4"></div><div class="field"><label for="tbC">Colonnes</label><input type="number" id="tbC" min="1" max="12" value="3"></div></div><label class="row"><input type="checkbox" id="tbH" checked> Ligne d\'en-tête</label>', buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => ({ r: +b.querySelector('#tbR').value, c: +b.querySelector('#tbC').value, h: b.querySelector('#tbH').checked }) }] });
    if (!r) return;
    const rows = Array.from({ length: Math.max(1, Math.min(30, r.r)) }, (_, i) => Array.from({ length: Math.max(1, Math.min(12, r.c)) }, (_, j) => (i === 0 && r.h ? `Titre ${j + 1}` : '')));
    const w = Math.min(P.W() - 120, 220 * rows[0].length), h = Math.min(P.H() - 200, 48 * rows.length);
    P.addEl({ type: 'table', x: Math.round((P.W() - w) / 2), y: Math.round(P.H() * 0.28), w, h, table: { rows, header: r.h, band: true, hdr: 'acc0' }, style: { size: 16 } });
  }
  const chartToTSV = (c) => [['Catégorie', ...c.series.map((s) => s.name)].join('\t'), ...c.labels.map((l, i) => [l, ...c.series.map((s) => String(s.values[i] ?? '').replace('.', ','))].join('\t'))].join('\n');
  function tsvToChart(t) {
    const rows = t.replace(/\s+$/, '').split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(/\t|;/));
    if (rows.length < 2 || rows[0].length < 2) throw new Error('il faut une ligne de titres et au moins une ligne de données');
    const names = rows[0].slice(1).map((n, i) => n.trim() || `Série ${i + 1}`);
    const labels = rows.slice(1).map((r) => r[0].trim());
    const series = names.map((name, j) => ({ name, values: rows.slice(1).map((r) => { const v = parseFloat(String(r[j + 1] || '').replace(/[\s  ]/g, '').replace(',', '.')); return isFinite(v) ? v : 0; }) }));
    return { labels, series };
  }
  async function chartDialog(existing) {
    const c0 = existing ? existing.chart : { type: 'col', title: '', legend: true, labels: ['T1', 'T2', 'T3', 'T4'], series: [{ name: 'Recettes', values: [120, 150, 135, 180] }, { name: 'Dépenses', values: [100, 110, 140, 150] }] };
    const r = await modal({
      title: existing ? 'Données du graphique' : 'Insérer un graphique', wide: true,
      body: `<div class="grid2"><div class="field"><label for="chT">Type</label><select id="chT">${[['col', 'Colonnes'], ['bar', 'Barres'], ['line', 'Courbes'], ['area', 'Aires'], ['pie', 'Secteurs'], ['donut', 'Anneau']].map(([v, l]) => `<option value="${v}" ${c0.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label for="chTi">Titre</label><input type="text" id="chTi" value="${esc(c0.title || '')}"></div></div>
        <div class="field"><label for="chD">Données : première ligne = noms des séries, première colonne = catégories (séparées par des tabulations ; vous pouvez coller depuis Tableur Joe ou Excel)</label><textarea id="chD" class="chart-data">${esc(chartToTSV(c0))}</textarea></div>`,
      buttons: [{ label: 'Annuler', value: null }, { label: existing ? 'Appliquer' : 'Insérer', primary: true, validate: (b) => { try { tsvToChart(b.querySelector('#chD').value); return true; } catch (e) { toast(e.message); return false; } }, value: (b) => ({ ...c0, type: b.querySelector('#chT').value, title: b.querySelector('#chTi').value.trim(), ...tsvToChart(b.querySelector('#chD').value) }) }],
    });
    if (!r) return;
    if (existing) P.change(() => { existing.chart = r; });
    else { const w = Math.min(P.W() - 160, 760), h = Math.min(P.H() - 220, 440); P.addEl({ type: 'chart', x: Math.round((P.W() - w) / 2), y: Math.round(P.H() * 0.25), w, h, chart: r, style: { size: 14 } }); }
  }
  const ICONS = '✅ ❌ ⚠️ ⭐ 💡 📌 📊 📈 📉 💰 💵 🏦 🧾 📄 📁 📅 ⏰ 🗓️ 📞 ✉️ 🏠 🏢 🏫 🏥 🚗 🚚 ✈️ 🌍 🌱 💧 ⚡ 🔧 🛠️ 🔒 🔑 👥 👤 🤝 🎯 🏆 🎓 📚 ✏️ 🖊️ 💬 ❓ ❗ ➡️ ⬆️ ⬇️ ✔️ ➕ ➖ 🔍 🧮 🇧🇫 🌾 🐄 ☀️ 🙏 👏 🎉'.split(' ');
  async function iconDialog() {
    const k = await modal({ title: 'Insérer une icône', body: `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px">${ICONS.map((i) => `<button type="button" data-i="${i}" style="font-size:24px;justify-content:center">${i}</button>`).join('')}</div>`, onOpen: (b) => b.querySelectorAll('[data-i]').forEach((x) => { x.onclick = () => { b.dataset.i = x.dataset.i; b.closest('.modal').querySelector('footer button.primary').click(); }; }), buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => b.dataset.i || null }] });
    if (k) P.addEl({ type: 'text', role: 'text', x: Math.round(P.W() / 2 - 60), y: Math.round(P.H() / 2 - 60), w: 120, h: 120, text: `<p>${k}</p>`, style: { size: 66, align: 'center', valign: 'middle' } });
  }

  /* ================= Thème, arrière-plan, format ================= */
  async function themesDialog() {
    const k = await modal({
      title: 'Thème de la présentation', wide: true,
      body: `<div class="layout-grid">${Object.entries(P.THEMES).map(([k2, t]) => { const s = { els: [P.txt('title', 80, 230, 1120, 160, 60, { align: 'center', valign: 'bottom' }), P.txt('subtitle', 80, 400, 1120, 90, 28, { align: 'center' })] }; s.els[0].text = esc(t.name); s.els[1].text = 'Titre et sous-titre'; const d = P.renderSlide(s, { deck: { ...P.deck, theme: k2, size: { w: 1280, h: 720 } } }); d.style.transform = 'scale(0.125)'; d.style.transformOrigin = '0 0'; return `<button type="button" data-t="${k2}" class="${P.deck.theme === k2 ? 'on' : ''}"><div style="width:160px;height:90px;overflow:hidden;position:relative">${d.outerHTML}</div><span>${t.name}</span></button>`; }).join('')}</div>`,
      onOpen: (b) => b.querySelectorAll('[data-t]').forEach((x) => { x.onclick = () => { b.dataset.t = x.dataset.t; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => b.dataset.t || null }],
    });
    if (k) P.change(() => { P.deck.theme = k; });
  }
  async function bgAllDialog() {
    const r = await modal({ title: 'Arrière-plan de toutes les diapositives', body: '<div class="field"><label for="bgM">Choix</label><select id="bgM"><option value="theme">Celui du thème</option><option value="color">Couleur unie</option><option value="image">Image…</option></select></div><input type="color" id="bgC" value="#ffffff">', buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => ({ m: b.querySelector('#bgM').value, c: b.querySelector('#bgC').value }) }] });
    if (!r) return;
    let img = null; if (r.m === 'image') { const [f] = await pickFiles('image/*', false); if (!f) return; img = P.addMedia(await P.readImage(f, 2400)); }
    P.change(() => { P.deck.bg = r.m === 'theme' ? null : r.m === 'color' ? { color: r.c } : { image: img }; P.deck.slides.forEach((s) => { if (s.bg) { delete s.bg.color; delete s.bg.image; if (!Object.keys(s.bg).length) s.bg = null; } }); });
  }
  async function sizeDialog() {
    const cur43 = P.deck.size.w === 960;
    const r = await modal({ title: 'Format des diapositives', body: `<label class="row"><input type="radio" name="sz" value="16:9" ${cur43 ? '' : 'checked'}> Écran large 16:9 (recommandé)</label><label class="row"><input type="radio" name="sz" value="4:3" ${cur43 ? 'checked' : ''}> Standard 4:3 (anciens vidéoprojecteurs)</label>`, buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => b.querySelector('[name=sz]:checked').value }] });
    if (!r || (r === '4:3') === cur43) return;
    const nw = r === '4:3' ? 960 : 1280, k = nw / P.deck.size.w;
    P.change(() => {
      P.deck.slides.forEach((s) => s.els.forEach((e) => {
        if (e.type === 'image' || e.type === 'chart') { const h0 = e.h; e.x = Math.round(e.x * k); e.w = Math.round(e.w * k); e.h = Math.round(e.h * k); e.y = Math.round(e.y + (h0 - e.h) / 2); }
        else { e.x = Math.round(e.x * k); e.w = Math.round(e.w * k); }
      }));
      P.deck.size = { w: nw, h: 720 };
    });
  }
  function transAll() { const t = P.slide().transition || { type: 'fade', dur: 0.5 }; P.change(() => P.deck.slides.forEach((s) => { s.transition = { ...t }; })); toast('Transition appliquée à toutes les diapositives'); }

  /* ================= Diaporama ================= */
  const ANIM_MS = 500;
  function stepsOf(s, dom) {
    const steps = [];
    s.els.forEach((el) => {
      if (!el.anim || !el.anim.type) return;
      const box = dom.querySelector(`[data-id="${el.id}"]`); if (!box) return;
      let units = [{ node: box, el }];
      if (el.anim.byPara && (el.type === 'text' || el.type === 'shape')) { const tx = box.querySelector('.sj-tx'); const paras = tx ? [...tx.children].flatMap((c) => (c.tagName === 'UL' || c.tagName === 'OL' ? [...c.children] : [c])) : []; if (paras.length) units = paras.map((n) => ({ node: n, el, para: true })); }
      units.forEach((u, i) => { const start = i === 0 ? el.anim.start || 'click' : 'click'; if (start === 'click' || !steps.length) steps.push([{ ...u, delay: 0 }]); else { const g = steps[steps.length - 1]; g.push({ ...u, delay: start === 'after' ? (g[g.length - 1].delay || 0) + ANIM_MS : g[g.length - 1].delay || 0 }); } });
    });
    return steps;
  }
  function animIn(u, type, win = window) {
    const n = u.node; n.style.visibility = 'visible';
    const rot = !u.para && u.el.rot ? `rotate(${u.el.rot}deg) ` : '';
    const frames = { fade: [{ opacity: 0 }, { opacity: 1 }], up: [{ opacity: 0, transform: rot + 'translateY(80px)' }, { opacity: 1, transform: rot + 'translateY(0)' }], left: [{ opacity: 0, transform: rot + 'translateX(-160px)' }, { opacity: 1, transform: rot + 'translateX(0)' }], zoom: [{ opacity: 0, transform: rot + 'scale(.3)' }, { opacity: 1, transform: rot + 'scale(1)' }], wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }] }[type];
    if (frames && n.animate) n.animate(frames, { duration: ANIM_MS, delay: u.delay || 0, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    void win;
  }
  /* vue d'une diapositive dans un conteneur (écran du diaporama, fenêtre du public, aperçus du présentateur) */
  class View {
    constructor(box, doc = document) { this.box = box; this.doc = doc; this.dom = null; this.steps = []; }
    fit() { const W = P.W(), H = P.H(); const r = this.box.parentElement.getBoundingClientRect ? this.box.parentElement : this.box; const aw = r.clientWidth, ah = r.clientHeight; const k = Math.min(aw / W, ah / H); this.box.style.width = W * k + 'px'; this.box.style.height = H * k + 'px'; this.k = k; if (this.dom) this.dom.style.transform = `scale(${k})`; return k; }
    render(i, step, transition) {
      const s = P.deck.slides[i]; if (!s) { this.box.replaceChildren(); this.dom = null; return; }
      const dom = P.renderSlide(s, { index: i }); dom.style.position = 'absolute'; dom.style.left = dom.style.top = '0'; dom.style.transformOrigin = '0 0';
      const node = this.doc === document ? dom : this.doc.importNode(dom, true);
      this.steps = stepsOf(s, node);
      this.steps.forEach((g, gi) => { if (gi >= step) g.forEach((u) => { u.node.style.visibility = 'hidden'; }); });
      const old = this.dom; this.dom = node; this.fit(); this.box.appendChild(node);
      const t = transition && s.transition && s.transition.type !== 'none' ? s.transition : null;
      const dur = t ? (t.dur || 0.5) * 1000 : 0;
      if (t && node.animate) {
        const k = this.k; const sc = `scale(${k})`;
        const fr = { fade: [[{ opacity: 0 }, { opacity: 1 }]], push: [[{ transform: `translateX(100%) ${sc}` }, { transform: `translateX(0) ${sc}` }], [{ transform: `translateX(0) ${sc}` }, { transform: `translateX(-100%) ${sc}` }]], cover: [[{ transform: `translateX(100%) ${sc}` }, { transform: `translateX(0) ${sc}` }]], zoom: [[{ opacity: 0, transform: `scale(${k * 0.6})` }, { opacity: 1, transform: sc }]], flip: [[{ transform: `perspective(2000px) rotateY(-90deg) ${sc}`, opacity: 0 }, { transform: `perspective(2000px) rotateY(0) ${sc}`, opacity: 1 }]] }[t.type];
        if (fr) { const a = node.animate(fr[0], { duration: dur, easing: 'ease-in-out' }); if (old && fr[1]) old.animate(fr[1], { duration: dur, easing: 'ease-in-out', fill: 'forwards' }); a.onfinish = () => { if (old && old.parentNode) old.remove(); }; }
        else if (old) old.remove();
        setTimeout(() => { if (old && old.parentNode) old.remove(); }, dur + 50);
      } else if (old) old.remove();
    }
    reveal(step) { const g = this.steps[step]; if (!g) return; g.forEach((u) => animIn(u, u.el.anim.type)); }
  }

  let showState = null;
  function visibleOrder(start) { const L = P.deck.slides.map((s, i) => i).filter((i) => !P.deck.slides[i].hidden || i === start); return L; }
  function startShow(from, presenter = false) {
    P.endEdits();
    const order = visibleOrder(from); let pos = Math.max(0, order.indexOf(from));
    const root = document.createElement('div'); root.className = 'show'; root.tabIndex = 0;
    root.innerHTML = '<div class="stagebox"></div><div class="black"></div><div class="bar"></div><div class="hud"><button data-s="prev">◀</button><span class="badge" style="background:rgba(0,0,0,.55);color:#fff;border:0;padding:6px 8px" data-s="num"></span><button data-s="next">▶</button><button data-s="pen" title="Pointeur laser">🔴</button><button data-s="end">✕ Quitter</button></div>';
    const box = root.querySelector('.stagebox');
    let audience = null, presenterUI = null;
    const views = [];
    if (presenter) {
      // fenêtre du public (à placer sur le vidéoprojecteur), ici : écran du présentateur
      audience = window.open('', 'presJoeAudience', 'popup,width=1280,height=760');
      presenterUI = buildPresenter();
      if (audience) {
        const d = audience.document; d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(P.deck.title)} — diaporama</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}body{display:grid;place-items:center}.stagebox{position:relative;overflow:hidden}.stagebox>.sj-slide{transform-origin:0 0;position:absolute;left:0;top:0}${P.SLIDE_CSS}</style></head><body><div class="stagebox"></div><p id="hint" style="position:fixed;bottom:8px;left:0;right:0;text-align:center;color:#999;font:14px sans-serif">Placez cette fenêtre sur le vidéoprojecteur puis double-cliquez pour le plein écran.</p></body></html>`); d.close();
        d.body.addEventListener('dblclick', () => { d.documentElement.requestFullscreen && d.documentElement.requestFullscreen().catch(() => {}); const h = d.getElementById('hint'); if (h) h.remove(); });
        const av = new View(d.querySelector('.stagebox'), d); views.push(av);
        audience.addEventListener('resize', () => av.fit());
        audience.addEventListener('keydown', (e) => keyHandler(e));
      } else toast('La fenêtre du public a été bloquée : le mode présentateur s\'affiche sur cet écran seulement.', 6000);
      document.body.appendChild(presenterUI.root);
    } else {
      document.body.appendChild(root);
      views.push(new View(box));
      try { root.requestFullscreen && root.requestFullscreen().catch(() => {}); } catch (e) { /* plein écran refusé */ }
      root.focus();
    }
    let step = 0, black = false;
    function update(transition) {
      const i = order[pos];
      views.forEach((v) => v.render(i, step, transition));
      root.querySelector('[data-s="num"]').textContent = `${pos + 1} / ${order.length}`;
      root.querySelector('.bar').style.width = ((pos + 1) / order.length) * 100 + '%';
      if (presenterUI) presenterUI.update(i, step, pos, order);
    }
    function next() {
      const v = views[0] || presenterUI.curView;
      if (step < v.steps.length) { views.forEach((x) => x.reveal(step)); step++; if (presenterUI) presenterUI.update(order[pos], step, pos, order, true); return; }
      if (pos < order.length - 1) { pos++; step = 0; update(true); } else end();
    }
    // retour : la diapositive précédente s'affiche entièrement construite
    function prev() { if (pos > 0) { pos--; step = 1e9; update(false); step = (views[0] || presenterUI.curView).steps.length; } }
    function goto(p) { pos = Math.max(0, Math.min(order.length - 1, p)); step = 0; update(true); }
    function end() {
      document.removeEventListener('keydown', keyHandler, true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      root.remove(); if (presenterUI) presenterUI.root.remove(); if (audience && !audience.closed) audience.close();
      showState = null; P.go(order[pos]); P.stage.focus();
    }
    let numBuf = '';
    function keyHandler(e) {
      const k = e.key;
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n', 'N'].includes(k)) { e.preventDefault(); if (k === 'Enter' && numBuf) { goto(+numBuf - 1); numBuf = ''; return; } if (black) { toggleBlack(); return; } next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) { e.preventDefault(); prev(); }
      else if (k === 'Home') { e.preventDefault(); goto(0); } else if (k === 'End') { e.preventDefault(); goto(order.length - 1); }
      else if (k === 'Escape') { e.preventDefault(); end(); }
      else if (k === 'b' || k === 'B' || k === '.') { e.preventDefault(); toggleBlack(); }
      else if (/^\d$/.test(k)) numBuf += k;
      e.stopPropagation();
    }
    function toggleBlack() { black = !black; root.querySelector('.black').style.display = black ? 'block' : 'none'; if (presenterUI) presenterUI.setBlack(black); views.forEach((v) => { if (v.doc !== document) v.box.style.visibility = black ? 'hidden' : 'visible'; }); }
    document.addEventListener('keydown', keyHandler, true);
    // souris et toucher
    let sx = null, laser = false, hudT = null;
    root.addEventListener('pointerdown', (e) => { if (e.target.closest('.hud')) return; sx = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    root.addEventListener('pointerup', (e) => {
      if (e.target.closest('.hud') || !sx) return; const dx = e.clientX - sx.x, dy = e.clientY - sx.y; sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) next(); else prev(); return; }
      if (laser) return; if (e.button === 2) prev(); else next();
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('pointermove', (e) => { root.classList.add('cursor'); clearTimeout(hudT); hudT = setTimeout(() => root.classList.remove('cursor'), 2500); if (laser) { let dot = root.querySelector('.laser'); if (!dot) { dot = document.createElement('div'); dot.className = 'laser'; dot.style.cssText = 'position:absolute;width:14px;height:14px;border-radius:50%;background:#ff2a2a;box-shadow:0 0 12px 4px rgba(255,0,0,.6);pointer-events:none;transform:translate(-50%,-50%)'; root.appendChild(dot); } dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; } });
    const hudActs = { prev, next, end, pen: () => { laser = !laser; const d = root.querySelector('.laser'); if (!laser && d) d.remove(); } };
    root.querySelector('.hud').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b || !hudActs[b.dataset.s]) return; e.stopPropagation(); hudActs[b.dataset.s](); });
    addEventListener('resize', () => views.forEach((v) => v.fit()));
    showState = { next, prev, end, goto };

    function buildPresenter() {
      const r = document.createElement('div'); r.className = 'presenter'; r.tabIndex = 0;
      r.innerHTML = `<div class="row" style="justify-content:space-between;grid-column:1/-1"><b style="font-size:18px">${esc(P.deck.title)}</b><span class="clock" data-p="timer">00:00</span><span class="hint" data-p="clock" style="color:#aaa;font-size:16px"></span><div class="row"><button data-p="pause">⏸ Minuteur</button><button data-p="reset">↺</button><button data-p="end">✕ Terminer</button></div></div>
        <div style="display:grid;grid-template-rows:1fr auto;gap:8px;min-height:0"><div class="cur" data-p="cur" style="min-height:42vh;display:grid;place-items:center"><div class="stagebox" style="position:relative;overflow:hidden"></div></div><div class="row" style="justify-content:center"><button data-p="prev" style="font-size:20px;padding:10px 22px">◀ Précédent</button><span data-p="num" style="font-size:18px;min-width:90px;text-align:center"></span><button data-p="next" style="font-size:20px;padding:10px 22px">Suivant ▶</button><button data-p="black">⬛ Écran noir</button></div></div>
        <div style="display:grid;grid-template-rows:auto auto 1fr;gap:8px;min-height:0"><span style="color:#aaa">Diapositive suivante</span><div class="next" data-p="next1" style="aspect-ratio:${P.W()}/${P.H()};display:grid;place-items:center"><div class="stagebox" style="position:relative;overflow:hidden"></div></div>
        <div style="display:grid;grid-template-rows:auto 1fr;gap:4px;min-height:0"><div class="row" style="justify-content:space-between"><span style="color:#aaa">Notes</span><span><button data-p="nm">A−</button> <button data-p="np">A+</button></span></div><div class="pn" data-p="notes"></div></div></div>`;
      const curView = new View(r.querySelector('[data-p="cur"] .stagebox')); const nextView = new View(r.querySelector('[data-p="next1"] .stagebox'));
      let paused = false, elapsed = 0, last = Date.now(), fs = 20;
      const tick = setInterval(() => { if (!r.isConnected) return clearInterval(tick); const now = Date.now(); if (!paused) elapsed += now - last; last = now; const s = Math.floor(elapsed / 1000); r.querySelector('[data-p="timer"]').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; r.querySelector('[data-p="clock"]').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }, 500);
      r.addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b) return; const a = b.dataset.p; if (a === 'next') next(); if (a === 'prev') prev(); if (a === 'end') end(); if (a === 'black') toggleBlack(); if (a === 'pause') { paused = !paused; b.textContent = paused ? '▶ Minuteur' : '⏸ Minuteur'; } if (a === 'reset') elapsed = 0; if (a === 'nm' || a === 'np') { fs = Math.max(12, Math.min(40, fs + (a === 'np' ? 2 : -2))); r.querySelector('[data-p="notes"]').style.fontSize = fs + 'px'; } });
      return {
        root: r, curView,
        update(i, st, p, ord, onlyStep) {
          if (!onlyStep) curView.render(i, st, false); else curView.reveal(st - 1);
          const ni = ord[p + 1]; if (curView.steps.length > st) nextView.render(i, st + 1, false); else nextView.render(ni, 0, false);
          r.querySelector('[data-p="notes"]').textContent = P.deck.slides[i].notes || '(pas de notes pour cette diapositive)';
          r.querySelector('[data-p="num"]').textContent = `${p + 1} / ${ord.length}`;
          requestAnimationFrame(() => { curView.fit(); nextView.fit(); });
        },
        setBlack(b) { r.querySelector('[data-p="black"]').classList.toggle('primary', b); },
      };
    }
    update(false);
    if (presenter) { addEventListener('resize', () => { presenterUI.curView.fit(); }); }
  }

  /* ================= Export PPTX ================= */
  const hex = (c) => { if (!c) return undefined; if (/^#[0-9a-f]{6}$/i.test(c)) return c.slice(1).toUpperCase(); if (/^#[0-9a-f]{3}$/i.test(c)) return c.slice(1).split('').map((x) => x + x).join('').toUpperCase(); const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase() : undefined; };
  const firstFont = (f) => (f || '').split(',')[0].replace(/['"]/g, '').trim() || 'Calibri';
  const IN = (px) => px / 96;
  const PTS = (px) => (px * 72) / 96;
  /* texte riche (HTML) → paragraphes et morceaux mis en forme */
  function htmlToParas(html, base) {
    const d = document.createElement('div'); d.innerHTML = html || '';
    const paras = []; let curP = null;
    const startPara = (opts) => { curP = { runs: [], opts }; paras.push(curP); };
    const walk = (n, fmt, list) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (!curP) startPara({ list: null }); if (c.nodeValue) curP.runs.push({ text: c.nodeValue, fmt }); continue; }
        if (c.nodeType !== 1) continue;
        const t = c.tagName; const f = { ...fmt }; const st = c.style || {};
        if (t === 'B' || t === 'STRONG' || /bold|[6-9]00/.test(st.fontWeight || '')) f.bold = true;
        if (st.fontWeight === 'normal' || st.fontWeight === '400') f.bold = false;
        if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') f.italic = true;
        if (t === 'U' || /underline/.test(st.textDecoration || st.textDecorationLine || '')) f.underline = true;
        if (t === 'S' || /line-through/.test(st.textDecoration || '')) f.strike = true;
        if (st.color) f.color = st.color; if (st.backgroundColor) f.hi = st.backgroundColor;
        if (st.fontSize && /px/.test(st.fontSize)) f.size = parseFloat(st.fontSize) * 0.75; else if (st.fontSize && /em/.test(st.fontSize)) f.size = (fmt.size || base.size) * parseFloat(st.fontSize);
        if (st.fontFamily) f.font = st.fontFamily;
        if (t === 'UL' || t === 'OL') { walk(c, f, { type: t, level: list ? list.level + 1 : 0 }); curP = null; continue; }
        if (t === 'LI' || t === 'P' || t === 'DIV') { startPara({ list: t === 'LI' ? list : null, align: st.textAlign || null }); walk(c, f, list); curP = null; continue; }
        if (t === 'BR') { if (!curP) startPara({ list }); curP.runs.push({ text: '\n', fmt: f, br: true }); continue; }
        walk(c, f, list);
      }
    };
    walk(d, {}, null);
    return paras.length ? paras : [{ runs: [], opts: {} }];
  }
  function textObjs(el, th) {
    const s = el.style || {}; const role = el.role;
    const base = { size: s.size || 18, font: s.font || (role === 'title' ? th.tFont : th.bFont), color: P.accColor(s.color, th) || (role === 'title' ? th.title : el.type === 'shape' ? '#ffffff' : th.text), bold: s.bold !== undefined ? s.bold : role === 'title', italic: !!s.italic, underline: !!s.underline };
    let html = el.text || ''; if (el.field === 'date') html = new Date().toLocaleDateString('fr-FR');
    const paras = htmlToParas(html, base); const out = [];
    paras.forEach((p, pi) => {
      const runs = p.runs.length ? p.runs : [{ text: '', fmt: {} }];
      runs.forEach((r, ri) => {
        const f = { ...base, ...r.fmt };
        const o = { fontFace: firstFont(f.font), fontSize: Math.round(f.size * 2) / 2, color: hex(P.accColor(f.color, th)), bold: !!f.bold, italic: !!f.italic };
        if (f.underline) o.underline = { style: 'sng' }; if (f.strike) o.strike = 'sngStrike'; if (f.hi) o.highlight = hex(f.hi);
        if (ri === 0) {
          o.align = p.opts.align || s.align || (el.type === 'shape' ? 'center' : 'left');
          if (p.opts.list) { o.bullet = p.opts.list.type === 'OL' ? { type: 'number' } : { code: '2022' }; o.indentLevel = p.opts.list.level; } else o.bullet = false;
          if (s.lineH) o.lineSpacingMultiple = s.lineH;
          o.paraSpaceAfter = p.opts.list ? 6 : 3;
        }
        if (r.br) { o.breakLine = true; out.push({ text: '', options: o }); return; }
        if (ri === runs.length - 1 && pi < paras.length - 1) o.breakLine = true;
        out.push({ text: r.text, options: o });
      });
    });
    return out;
  }
  const PPT_SHAPE = { rect: 'rect', round: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', arrow: 'rightArrow', arrowL: 'leftArrow', chevron: 'chevron', pentagon: 'homePlate', star: 'star5', callout: 'wedgeRectCallout', hexagon: 'hexagon' };
  async function rasterBackground(s, i) { const copy = { ...s, els: [] }; const c = await slideCanvas(copy, i, 1); return c.toDataURL('image/png'); }
  async function savePptx() {
    P.endEdits();
    await loadScript('lib/pptxgen.min.js');
    const pptx = new window.PptxGenJS(); const th = P.theme(); const d = P.deck;
    pptx.layout = d.size.w === 960 ? 'LAYOUT_4x3' : 'LAYOUT_WIDE'; pptx.title = d.title; pptx.author = 'Présentation Joe'; pptx.company = '';
    for (let i = 0; i < d.slides.length; i++) {
      const s = d.slides[i]; const sl = pptx.addSlide();
      if (s.hidden) sl.hidden = true;
      const b = s.bg || d.bg;
      const gradient = !(b && (b.color || b.image)) && /gradient/.test(th.bg);
      if (b && b.image && d.media[b.image]) sl.background = { data: d.media[b.image].replace(/^data:/, '') };
      else if (b && b.color && /^#/.test(b.color)) sl.background = { color: hex(b.color) };
      else if (gradient) sl.background = { data: (await rasterBackground(s, i)).replace(/^data:/, '') };
      else sl.background = { color: hex(th.bg) || 'FFFFFF' };
      if (!gradient && !(s.bg && s.bg.noDeco)) th.deco(d.size.w, d.size.h).forEach((dc) => { const col = P.accColor(dc.fill, th); const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(col); sl.addShape(dc.star ? 'star5' : dc.r && dc.r * 2 >= Math.min(dc.w, dc.h) ? 'ellipse' : dc.r ? 'roundRect' : 'rect', { x: IN(dc.x), y: IN(dc.y), w: IN(dc.w), h: IN(dc.h), fill: { color: m ? [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase() : hex(col), transparency: m ? Math.round((1 - +m[4]) * 100) : 0 }, line: { type: 'none' } }); });
      for (const el of s.els) {
        const st = el.style || {}; const pos = { x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h) }; if (el.rot) pos.rotate = el.rot;
        const fill = P.accColor(st.fill, th), stroke = P.accColor(st.stroke, th);
        const common = { ...pos, valign: st.valign || (el.type === 'shape' ? 'middle' : 'top'), margin: 6, fit: 'none' };
        if (st.opacity !== undefined && st.opacity < 1 && fill) common.fill = { color: hex(fill), transparency: Math.round((1 - st.opacity) * 100) };
        if (el.field === 'num') { sl.slideNumber = { x: pos.x, y: pos.y, w: pos.w, h: pos.h, fontSize: st.size || 12, color: hex(P.accColor(st.color, th) || th.text), align: 'right' }; continue; }
        if (el.type === 'text' || el.type === 'shape') {
          const sh = el.type === 'shape' ? st.shape || 'rect' : 'rect';
          if (sh === 'line' || sh === 'lineArrow') { sl.addShape('line', { ...pos, h: 0, y: IN(el.y + el.h / 2), line: { color: hex(stroke || th.text), width: PTS(st.strokeW || 3), endArrowType: sh === 'lineArrow' ? 'triangle' : undefined } }); continue; }
          const opts = { ...common };
          if (el.type === 'shape' || fill || stroke) {
            opts.shape = PPT_SHAPE[sh] || 'rect';
            if (fill && !opts.fill) opts.fill = { color: hex(fill) };
            if (stroke) opts.line = { color: hex(stroke), width: PTS(st.strokeW || 2) };
            if (opts.shape === 'roundRect' || (sh === 'rect' && st.radius)) { opts.shape = 'roundRect'; opts.rectRadius = Math.min(0.5, (st.radius !== undefined ? st.radius : Math.min(el.w, el.h) * 0.18) / Math.min(el.w, el.h)); }
            if (st.shadow) opts.shadow = { type: 'outer', blur: 6, offset: 3, angle: 90, color: '000000', opacity: 0.3 };
          }
          if (el.type === 'text' && P.isEmptyText(el.text) && !el.field && !fill && !stroke) continue;
          sl.addText(textObjs(el, th), opts);
        } else if (el.type === 'image' && el.src && d.media[el.src]) {
          const data = d.media[el.src];
          const img = await Studio.loadImage(data); const io = { data: data.replace(/^data:/, ''), ...pos };
          if (st.fit === 'cover') io.sizing = { type: 'cover', w: pos.w, h: pos.h };
          else { const k = Math.min(el.w / img.naturalWidth, el.h / img.naturalHeight); const w = img.naturalWidth * k, h = img.naturalHeight * k; io.x = IN(el.x + (el.w - w) / 2); io.y = IN(el.y + (el.h - h) / 2); io.w = IN(w); io.h = IN(h); }
          if (st.opacity !== undefined && st.opacity < 1) io.transparency = Math.round((1 - st.opacity) * 100);
          sl.addImage(io);
        } else if (el.type === 'table') {
          const t = el.table; const hdr = P.accColor(t.hdr || 'acc0', th);
          const rows = t.rows.map((row, i2) => row.map((c, j) => { const head = t.header && i2 === 0; const band = t.band && !head && i2 % 2 === (t.header ? 0 : 1); const o = { align: (t.align && t.align[j]) || (head ? 'center' : 'left'), valign: 'middle' }; if (head) Object.assign(o, { bold: true, color: 'FFFFFF', fill: { color: hex(hdr) } }); else if (band) o.fill = { color: hex(hdr), transparency: 88 }; return { text: P.plainText(c), options: o }; }));
          const cw = t.colW || t.rows[0].map(() => 1); const tot = cw.reduce((a, b2) => a + b2, 0);
          sl.addTable(rows, { ...pos, colW: cw.map((w) => (w / tot) * pos.w), fontSize: st.size || 16, fontFace: firstFont(st.font || th.bFont), color: hex(P.accColor(st.color, th) || th.text), border: { type: 'solid', pt: 0.75, color: 'BFBFBF' }, rowH: pos.h / t.rows.length, margin: 4 });
        } else if (el.type === 'chart') {
          const c = el.chart; const map = { col: 'bar', bar: 'bar', line: 'line', area: 'area', pie: 'pie', donut: 'doughnut' };
          const data = (c.type === 'pie' || c.type === 'donut' ? c.series.slice(0, 1) : c.series).map((sr) => ({ name: sr.name, labels: c.labels, values: sr.values.map((v) => +v || 0) }));
          const fg = hex(P.accColor(st.color, th) || th.text);
          sl.addChart(map[c.type] || 'bar', data, { ...pos, barDir: c.type === 'bar' ? 'bar' : 'col', barGrouping: 'clustered', showLegend: c.legend !== false && (c.type === 'pie' || c.type === 'donut' || c.series.length > 1), legendPos: 'b', showTitle: !!c.title, title: c.title || undefined, titleColor: fg, chartColors: th.acc.map(hex), showValue: !!c.values, showPercent: c.type === 'pie' || c.type === 'donut', catAxisLabelColor: fg, valAxisLabelColor: fg, legendColor: fg, legendFontSize: (st.size || 14) * 0.85, catAxisLabelFontSize: (st.size || 14) * 0.85, valAxisLabelFontSize: (st.size || 14) * 0.8, dataLabelColor: c.type === 'pie' || c.type === 'donut' ? 'FFFFFF' : fg, holeSize: 55 });
        }
      }
      if (s.notes) sl.addNotes(s.notes);
    }
    const blob = await pptx.write({ outputType: 'blob' });
    download(blob, fileBase() + '.pptx'); P.markSaved();
    toast('Présentation enregistrée en .pptx (les animations ne sont pas exportées)', 5000);
  }

  /* ================= Rendu en image (PDF, PNG, arrière-plans) ================= */
  async function slideCanvas(s, i, k = 1) {
    const W = P.W(), H = P.H();
    const dom = P.renderSlide(s, { index: i });
    const html = new XMLSerializer().serializeToString(dom);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * k}" height="${H * k}"><foreignObject x="0" y="0" width="${W}" height="${H}" transform="scale(${k})"><div xmlns="http://www.w3.org/1999/xhtml"><style>${P.SLIDE_CSS.replace(/</g, '\\3c ')}</style>${html}</div></foreignObject></svg>`;
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  async function pdfDialog() {
    P.endEdits();
    const r = await modal({
      title: 'Exporter en PDF / imprimer',
      body: `<div class="field"><label for="pdL">Mise en page</label><select id="pdL"><option value="slides">Diapositives (une par page)</option><option value="notes">Pages de commentaires (diapositive + notes, A4)</option><option value="h2">Documents : 2 diapositives par page A4</option><option value="h3">Documents : 3 par page, avec lignes pour notes</option><option value="h6">Documents : 6 par page A4</option></select></div>
        <label class="row"><input type="checkbox" id="pdH"> Inclure les diapositives masquées</label><div class="field"><label for="pdQ">Qualité</label><select id="pdQ"><option value="1.5">Normale</option><option value="2.2">Haute (fichier plus lourd)</option></select></div>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Créer le PDF', primary: true, value: (b) => ({ l: b.querySelector('#pdL').value, h: b.querySelector('#pdH').checked, q: +b.querySelector('#pdQ').value }) }],
    });
    if (!r) return;
    await loadScript('lib/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const list = P.deck.slides.map((s, i) => i).filter((i) => r.h || !P.deck.slides[i].hidden);
    const W = P.W(), H = P.H();
    toast('Création du PDF…', 30000);
    let doc;
    const imgOf = async (i) => (await slideCanvas(P.deck.slides[i], i, r.q)).toDataURL('image/jpeg', 0.9);
    if (r.l === 'slides') {
      doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [W * 0.75, H * 0.75] });
      for (let n = 0; n < list.length; n++) { if (n) doc.addPage([W * 0.75, H * 0.75], 'landscape'); doc.addImage(await imgOf(list[n]), 'JPEG', 0, 0, W * 0.75, H * 0.75); }
    } else {
      doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }); const PW = 595.28, PH = 841.89, M = 40;
      const clean = (t) => String(t).replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[^\x00-\xff€]/g, '');
      const per = r.l === 'notes' ? 1 : r.l === 'h2' ? 2 : r.l === 'h3' ? 3 : 6;
      for (let n = 0; n < list.length; n++) {
        const k = n % per; if (n && !k) doc.addPage();
        const i = list[n]; const img = await imgOf(i);
        if (r.l === 'notes') {
          const w = PW - 2 * M, h = (w * H) / W; doc.addImage(img, 'JPEG', M, M, w, h); doc.setDrawColor(180); doc.rect(M, M, w, h);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(30); doc.text(doc.splitTextToSize(clean(P.deck.slides[i].notes || ''), w), M, M + h + 30);
        } else if (per === 3) {
          const w = (PW - 2 * M) * 0.48, h = (w * H) / W; const y = M + k * ((PH - 2 * M) / 3); doc.addImage(img, 'JPEG', M, y, w, h); doc.setDrawColor(180); doc.rect(M, y, w, h);
          doc.setDrawColor(200); for (let l = 0; l < 6; l++) doc.line(M + w + 20, y + 14 + l * (h / 6), PW - M, y + 14 + l * (h / 6));
        } else {
          const cols = per === 6 ? 2 : 1, rows = per / cols; const cw = (PW - 2 * M - (cols - 1) * 20) / cols, ch = (PH - 2 * M - (rows - 1) * 20) / rows;
          const w = Math.min(cw, (ch * W) / H), h = (w * H) / W; const cx = k % cols, cy = Math.floor(k / cols);
          const x = M + cx * (cw + 20) + (cw - w) / 2, y = M + cy * (ch + 20) + (ch - h) / 2; doc.addImage(img, 'JPEG', x, y, w, h); doc.setDrawColor(180); doc.rect(x, y, w, h);
        }
        doc.setFontSize(9); doc.setTextColor(120); if (!k || r.l === 'notes') doc.text(clean(`${P.deck.title} — page ${Math.floor(n / per) + 1}`), M, PH - 18);
      }
    }
    download(doc.output('blob'), fileBase() + '.pdf'); toast('PDF créé');
  }
  async function exportImages() {
    P.endEdits(); toast('Création des images…', 30000);
    const zip = new window.JSZip();
    for (let i = 0; i < P.deck.slides.length; i++) { const c = await slideCanvas(P.deck.slides[i], i, 1.5); const b64 = c.toDataURL('image/png').split(',')[1]; zip.file(`diapositive-${String(i + 1).padStart(2, '0')}.png`, b64, { base64: true }); }
    download(await zip.generateAsync({ type: 'blob' }), fileBase() + ' - images.zip'); toast('Images exportées');
  }
  function saveJoe() { P.endEdits(); download(new Blob([JSON.stringify(P.serialize())], { type: 'application/json' }), fileBase() + '.joeslides'); P.markSaved(); toast('Présentation enregistrée (.joeslides)'); }

  /* ================= Ouverture ================= */
  async function openDialog() { const [f] = await pickFiles('.pptx,.joeslides,.json,application/vnd.openxmlformats-officedocument.presentationml.presentation', false); if (f) openFile(f); }
  async function openFile(f) {
    const n = f.name.toLowerCase();
    try {
      if (P.dirty && P.deck.slides.some((s) => s.els.some((e) => !P.isEmptyText(e.text) || e.src)) && !(await confirmBox('Remplacer la présentation en cours ? (Elle n\'est pas enregistrée dans un fichier.)', 'Ouvrir'))) return;
      let d;
      if (n.endsWith('.pptx')) { toast('Lecture du fichier PowerPoint…', 20000); d = await readPptx(f); }
      else if (n.endsWith('.joeslides') || n.endsWith('.json')) d = JSON.parse(await f.text());
      else if (n.endsWith('.ppt')) throw new Error('l\'ancien format .ppt n\'est pas pris en charge : enregistrez-le en .pptx depuis PowerPoint');
      else throw new Error('format non reconnu');
      d.title = baseName(f.name);
      P.loadDeck(d); P.markSaved(); P.autosave();
      toast(`« ${f.name} » ouvert : ${d.slides.length} diapositive${d.slides.length > 1 ? 's' : ''}`);
    } catch (e) { console.error(e); toast('Ouverture impossible : ' + e.message, 8000); }
  }
  Studio.onImport('presentation', (fs) => { const f = fs.find((x) => /\.(pptx|joeslides|json)$/i.test(x.name)); if (f) openFile(f); else P.addImages(fs); });
  onDropFiles(P.stage, (files) => { const f = files[0]; if (!f) return; if (/\.(pptx|joeslides)$/i.test(f.name)) openFile(f); else P.addImages(files); });

  /* ---------- lecteur PPTX (texte, formes, images, tableaux, graphiques, notes) ---------- */
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main', PNS = 'http://schemas.openxmlformats.org/presentationml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', CNS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const kids = (n, ns, name) => (n ? [...n.children].filter((c) => c.localName === name && (!ns || c.namespaceURI === ns)) : []);
  const kid = (n, ns, name) => kids(n, ns, name)[0] || null;
  const desc = (n, ns, name) => (n ? [...n.getElementsByTagNameNS(ns, name)] : []);
  const path = (n, ...names) => { let c = n; for (const nm of names) { c = c && [...c.children].find((x) => x.localName === nm); } return c || null; };
  async function readPptx(file) {
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const xml = async (p) => { const f = zip.file(p); if (!f) return null; return new DOMParser().parseFromString(await f.async('string'), 'application/xml'); };
    const rels = async (p) => { const dir = p.slice(0, p.lastIndexOf('/')); const r = await xml(`${dir}/_rels/${p.slice(p.lastIndexOf('/') + 1)}.rels`); const m = {}; if (r) [...r.documentElement.children].forEach((x) => { const t = x.getAttribute('Target'); m[x.getAttribute('Id')] = { target: x.getAttribute('TargetMode') === 'External' ? t : resolve(dir, t), type: x.getAttribute('Type') }; }); return m; };
    const resolve = (dir, t) => { if (t.startsWith('/')) return t.slice(1); const parts = dir.split('/'); for (const seg of t.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); } return parts.join('/'); };
    const pres = await xml('ppt/presentation.xml'); if (!pres) throw new Error('ce fichier n\'est pas une présentation PowerPoint');
    const presRels = await rels('ppt/presentation.xml');
    const sz = desc(pres, PNS, 'sldSz')[0]; const cx = +(sz && sz.getAttribute('cx')) || 12192000, cy = +(sz && sz.getAttribute('cy')) || 6858000;
    const ratio = cx / cy; const Wd = Math.abs(ratio - 4 / 3) < 0.05 ? 960 : 1280; const Hd = Math.round(Wd / ratio);
    const k = Wd / cx; // EMU → unités
    // thème : couleurs et polices
    const themeRel = Object.values(presRels).find((r) => /theme$/.test(r.type));
    const themeX = themeRel ? await xml(themeRel.target) : null;
    const scheme = {}; let majorFont = 'Calibri', minorFont = 'Calibri';
    if (themeX) {
      const cs = desc(themeX, A, 'clrScheme')[0]; if (cs) [...cs.children].forEach((c) => { const v = c.firstElementChild; if (v) scheme[c.localName] = ('#' + (v.localName === 'sysClr' ? v.getAttribute('lastClr') || (v.getAttribute('val') === 'window' ? 'FFFFFF' : '000000') : v.getAttribute('val') || '000000')).toLowerCase(); });
      const mj = desc(themeX, A, 'majorFont')[0], mn = desc(themeX, A, 'minorFont')[0];
      if (mj && kid(mj, A, 'latin')) majorFont = kid(mj, A, 'latin').getAttribute('typeface'); if (mn && kid(mn, A, 'latin')) minorFont = kid(mn, A, 'latin').getAttribute('typeface');
    }
    const clrMap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    const color = (n) => {
      if (!n) return null; const c = n.firstElementChild || n; let v = null;
      if (c.localName === 'srgbClr') v = '#' + c.getAttribute('val'); else if (c.localName === 'schemeClr') v = scheme[clrMap[c.getAttribute('val')] || c.getAttribute('val')] || null; else if (c.localName === 'sysClr') v = '#' + (c.getAttribute('lastClr') || '000000'); else if (c.localName === 'prstClr') v = { black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#00ff00' }[c.getAttribute('val')] || null;
      if (!v) return null;
      const lm = kid(c, A, 'lumMod'), lo = kid(c, A, 'lumOff'), sh = kid(c, A, 'shade'), ti = kid(c, A, 'tint');
      if (lm || lo || sh || ti) { let [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); const f = (x) => Math.max(0, Math.min(255, Math.round(x))); if (lm) { const m = +lm.getAttribute('val') / 1e5; [r, g, b] = [r * m, g * m, b * m]; } if (lo) { const o = (+lo.getAttribute('val') / 1e5) * 255; [r, g, b] = [r + o, g + o, b + o]; } if (sh) { const m = +sh.getAttribute('val') / 1e5; [r, g, b] = [r * m, g * m, b * m]; } if (ti) { const m = +ti.getAttribute('val') / 1e5; [r, g, b] = [r + (255 - r) * (1 - m), g + (255 - g) * (1 - m), b + (255 - b) * (1 - m)]; } v = '#' + [r, g, b].map((x) => f(x).toString(16).padStart(2, '0')).join(''); }
      return v;
    };
    const fillOf = (spPr) => { if (!spPr) return undefined; if (kid(spPr, A, 'noFill')) return null; const sf = kid(spPr, A, 'solidFill'); if (sf) return color(sf); const gf = kid(spPr, A, 'gradFill'); if (gf) { const gs = desc(gf, A, 'gs')[0]; return gs ? color(gs) : undefined; } return undefined; };
    const media = {};
    const mediaUrl = async (target) => { if (media[target]) return media[target]; const f = zip.file(target); if (!f) return null; const ext = target.split('.').pop().toLowerCase(); const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' }[ext]; if (!mime) return null; const b64 = await f.async('base64'); media[target] = `data:${mime};base64,${b64}`; return media[target]; };
    const deckMedia = {}; const addM = (url) => { for (const [kk, v] of Object.entries(deckMedia)) if (v === url) return kk; const id = 'm' + uid(); deckMedia[id] = url; return id; };
    // placeholders hérités (disposition puis masque)
    const phInfo = async (p) => { const x = await xml(p); const out = []; if (!x) return { list: out, x }; desc(x, PNS, 'sp').forEach((sp) => { const ph = desc(sp, PNS, 'ph')[0]; if (!ph) return; const xf = path(sp, 'spPr', 'xfrm'); out.push({ type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx'), xfrm: xf, sp }); }); return { list: out, x }; };
    const masterCache = {}, layoutCache = {};
    const bodySizes = { title: 44, body: [28, 24, 20, 18, 18] };
    const findPh = (list, type, idx) => list.find((p) => idx != null && p.idx === idx) || list.find((p) => p.type === type) || (type === 'ctrTitle' && list.find((p) => p.type === 'title')) || (type === 'subTitle' && list.find((p) => p.type === 'body'));
    const presOrder = desc(pres, PNS, 'sldId').map((n) => presRels[n.getAttributeNS(R, 'id')]).filter(Boolean).map((r) => r.target);
    const slides = [];
    for (const sp of presOrder) {
      const sx = await xml(sp); if (!sx) continue; const srels = await rels(sp);
      const layoutPath = (Object.values(srels).find((r) => /slideLayout$/.test(r.type)) || {}).target;
      if (layoutPath && !layoutCache[layoutPath]) { layoutCache[layoutPath] = await phInfo(layoutPath); const lr = await rels(layoutPath); const mp = (Object.values(lr).find((r) => /slideMaster$/.test(r.type)) || {}).target; layoutCache[layoutPath].master = mp; if (mp && !masterCache[mp]) { masterCache[mp] = await phInfo(mp); masterCache[mp].rels = await rels(mp); const mx = masterCache[mp].x; const ts = mx && desc(mx, PNS, 'titleStyle')[0]; const tsz = ts && desc(ts, A, 'defRPr')[0]; if (tsz && tsz.getAttribute('sz')) bodySizes.title = +tsz.getAttribute('sz') / 100; const bs = mx && desc(mx, PNS, 'bodyStyle')[0]; if (bs) bodySizes.body = [1, 2, 3, 4, 5].map((l, i) => { const lv = kid(bs, A, `lvl${l}pPr`); const dr = lv && kid(lv, A, 'defRPr'); return dr && dr.getAttribute('sz') ? +dr.getAttribute('sz') / 100 : bodySizes.body[i]; }); } }
      const lay = layoutPath ? layoutCache[layoutPath] : { list: [] }; const mas = lay.master ? masterCache[lay.master] : { list: [] };
      const s = { id: uid(), layout: 'blank', bg: null, transition: { type: 'none', dur: 0.5 }, notes: '', hidden: sx.documentElement.getAttribute('show') === '0', els: [] };
      // arrière-plan
      const bgOf = async (x, relmap) => { const bg = x && desc(x, PNS, 'bg')[0]; if (!bg) return null; const bgPr = kid(bg, PNS, 'bgPr'); if (bgPr) { const blip = desc(bgPr, A, 'blip')[0]; if (blip) { const r = relmap[blip.getAttributeNS(R, 'embed')]; const u = r && (await mediaUrl(r.target)); if (u) return { image: addM(u) }; } const f = fillOf(bgPr); if (f) return { color: f }; } const ref = kid(bg, PNS, 'bgRef'); if (ref) { const c = color(ref); if (c) return { color: c }; } return null; };
      s.bg = (await bgOf(sx, srels)) || (lay.x && (await bgOf(lay.x, await rels(layoutPath)))) || (mas.x && (await bgOf(mas.x, mas.rels))) || { color: '#ffffff' };
      s.bg.noDeco = true;
      const walkTree = async (tree, tf) => {
        for (const n of [...tree.children]) {
          const ln = n.localName;
          if (ln === 'grpSp') {
            const gx = path(n, 'grpSpPr', 'xfrm'); if (!gx) { await walkTree(n, tf); continue; }
            const off = kid(gx, A, 'off'), ext = kid(gx, A, 'ext'), choff = kid(gx, A, 'chOff'), chext = kid(gx, A, 'chExt');
            const sxk = chext && +chext.getAttribute('cx') ? +ext.getAttribute('cx') / +chext.getAttribute('cx') : 1, syk = chext && +chext.getAttribute('cy') ? +ext.getAttribute('cy') / +chext.getAttribute('cy') : 1;
            const ntf = (x, y, w, h) => tf(+off.getAttribute('x') + (x - +(choff ? choff.getAttribute('x') : 0)) * sxk, +off.getAttribute('y') + (y - +(choff ? choff.getAttribute('y') : 0)) * syk, w * sxk, h * syk);
            await walkTree(n, ntf); continue;
          }
          if (!['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(ln)) continue;
          const ph = desc(n, PNS, 'ph')[0]; const phType = ph ? ph.getAttribute('type') || 'body' : null; const phIdx = ph ? ph.getAttribute('idx') : null;
          let xf = ln === 'graphicFrame' ? kid(n, PNS, 'xfrm') : path(n, 'spPr', 'xfrm');
          let inherited = null;
          if (ph) inherited = findPh(lay.list, phType, phIdx) || findPh(mas.list, phType, phIdx);
          if ((!xf || !kid(xf, A, 'off')) && inherited) xf = inherited.xfrm || (findPh(mas.list, phType, phIdx) || {}).xfrm;
          if (!xf || !kid(xf, A, 'off')) continue;
          if (['dt', 'ftr', 'sldNum'].includes(phType)) { if (phType !== 'sldNum') continue; }
          const off = kid(xf, A, 'off'), ext = kid(xf, A, 'ext');
          const [X, Y, Wx, Hx] = tf(+off.getAttribute('x'), +off.getAttribute('y'), +ext.getAttribute('cx'), +ext.getAttribute('cy'));
          const base = { id: uid(), x: Math.round(X * k), y: Math.round(Y * k), w: Math.max(4, Math.round(Wx * k)), h: Math.max(4, Math.round(Hx * k)), rot: Math.round((+xf.getAttribute('rot') || 0) / 60000), style: {} };
          if (xf.getAttribute('flipH') === '1' || xf.getAttribute('flipV') === '1') { /* miroir ignoré */ }
          if (phType === 'sldNum') { s.els.push({ ...base, type: 'text', role: 'text', field: 'num', text: '', style: { size: 12, align: 'right' } }); continue; }
          if (ln === 'pic') {
            const blip = desc(n, A, 'blip')[0]; const r = blip && srels[blip.getAttributeNS(R, 'embed')]; const u = r && (await mediaUrl(r.target));
            if (u) s.els.push({ ...base, type: 'image', src: addM(u), style: { fit: 'cover' } });
            continue;
          }
          if (ln === 'graphicFrame') {
            const tbl = desc(n, A, 'tbl')[0];
            if (tbl) { const rows = desc(tbl, A, 'tr').map((tr) => kids(tr, A, 'tc').map((tc) => desc(tc, A, 'p').map((p) => desc(p, A, 't').map((t) => t.textContent).join('')).join('<br>'))); const gc = desc(tbl, A, 'gridCol').map((g) => +g.getAttribute('w') || 1); const tp = kid(tbl, A, 'tblPr'); const sz1 = desc(tbl, A, 'rPr').map((r2) => +r2.getAttribute('sz')).find((v) => v) || 1800; if (rows.length) s.els.push({ ...base, type: 'table', table: { rows, colW: gc, header: !!(tp && tp.getAttribute('firstRow') === '1'), band: !!(tp && tp.getAttribute('bandRow') === '1'), hdr: 'acc0' }, style: { size: sz1 / 100 } }); continue; }
            const ch = desc(n, CNS, 'chart')[0];
            if (ch) { const r = srels[ch.getAttributeNS(R, 'id')]; const cx2 = r && (await xml(r.target)); if (cx2) { const c = readChart(cx2); if (c) s.els.push({ ...base, type: 'chart', chart: c, style: { size: 14 } }); } }
            continue;
          }
          // forme ou zone de texte
          const spPr = kid(n, PNS, 'spPr'); const geom = spPr && kid(spPr, A, 'prstGeom'); const prst = geom ? geom.getAttribute('prst') : 'rect';
          const shapeMap = { rect: 'rect', roundRect: 'round', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', rightArrow: 'arrow', leftArrow: 'arrowL', chevron: 'chevron', homePlate: 'pentagon', star5: 'star', wedgeRectCallout: 'callout', hexagon: 'hexagon', line: 'line', straightConnector1: 'line' };
          let fill = fillOf(spPr); if (fill === undefined && inherited) fill = fillOf(kid(inherited.sp, PNS, 'spPr')); if (fill === undefined) { const sr = path(n, 'style', 'fillRef'); if (sr && +sr.getAttribute('idx') > 0) fill = color(sr); }
          const lnN = spPr && kid(spPr, A, 'ln'); let stroke = lnN && !kid(lnN, A, 'noFill') ? color(kid(lnN, A, 'solidFill')) : null; if (!stroke && !(lnN && kid(lnN, A, 'noFill'))) { const lr = path(n, 'style', 'lnRef'); if (lr && +lr.getAttribute('idx') > 0 && ln !== 'cxnSp' && prst !== 'rect') stroke = color(lr); }
          const strokeW = lnN && lnN.getAttribute('w') ? Math.max(1, Math.round((+lnN.getAttribute('w') / 12700) * (4 / 3))) : 2;
          const txBody = kid(n, PNS, 'txBody');
          const role = phType ? (phType === 'title' || phType === 'ctrTitle' ? 'title' : phType === 'subTitle' ? 'subtitle' : 'body') : 'text';
          if (ln === 'cxnSp' || prst === 'line' || prst === 'straightConnector1') { const tail = lnN && kid(lnN, A, 'tailEnd'); s.els.push({ ...base, h: Math.max(base.h, 10), type: 'shape', role: 'shape', text: '', style: { shape: tail && tail.getAttribute('type') && tail.getAttribute('type') !== 'none' ? 'lineArrow' : 'line', stroke: stroke || '#000000', strokeW } }); continue; }
          const isShape = !!(fill || stroke) && !ph;
          const el = { ...base, type: isShape ? 'shape' : 'text', role: isShape ? 'shape' : role, text: '', style: {} };
          if (fill) el.style.fill = fill; if (stroke) { el.style.stroke = stroke; el.style.strokeW = strokeW; }
          if (isShape || prst !== 'rect') el.style.shape = shapeMap[prst] || 'rect';
          if (el.type === 'text' && el.style.shape) { el.type = 'shape'; }
          if (txBody) {
            const bp = kid(txBody, A, 'bodyPr'); const anchor = bp && bp.getAttribute('anchor'); el.style.valign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';
            if (!anchor && role === 'title') el.style.valign = phType === 'ctrTitle' ? 'bottom' : 'middle';
            const na = bp && kid(bp, A, 'normAutofit'); const scaleF = na && na.getAttribute('fontScale') ? +na.getAttribute('fontScale') / 1e5 : 1;
            const defSize = role === 'title' ? bodySizes.title : role === 'subtitle' ? Math.min(bodySizes.body[0], 24) : role === 'body' ? bodySizes.body[0] : 18;
            el.style.size = Math.round(defSize * scaleF);
            el.style.font = role === 'title' ? `'${majorFont}', ${P.THEMES.clair.tFont}` : `'${minorFont}', ${P.THEMES.clair.bFont}`;
            const fr = path(n, 'style', 'fontRef'); el.style.color = el.type === 'shape' ? (fr && color(fr)) || '#ffffff' : scheme.dk1 || '#000000';
            if (role === 'title') el.style.bold = false;
            el.text = parasToHtml(kids(txBody, A, 'p'), { body: role === 'body', sizes: bodySizes.body, scaleF, color, defSize, isTitle: role === 'title' });
            const algn = kids(txBody, A, 'p').map((p) => { const pp = kid(p, A, 'pPr'); return pp && pp.getAttribute('algn'); }).find(Boolean);
            if (algn) el.style.align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : 'left';
            else if (phType === 'ctrTitle' || phType === 'subTitle') el.style.align = 'center';
          }
          if (el.type === 'text' && P.isEmptyText(el.text)) continue;
          s.els.push(el);
        }
      };
      const tree = desc(sx, PNS, 'spTree')[0];
      if (tree) await walkTree(tree, (x, y, w, h) => [x, y, w, h]);
      // notes
      const nr = Object.values(srels).find((r) => /notesSlide$/.test(r.type));
      if (nr) { const nx = await xml(nr.target); if (nx) { const body = desc(nx, PNS, 'sp').find((sp2) => { const ph = desc(sp2, PNS, 'ph')[0]; return ph && (ph.getAttribute('type') || 'body') === 'body'; }); if (body) s.notes = desc(body, A, 'p').map((p) => desc(p, A, 't').map((t) => t.textContent).join('')).join('\n').trim(); } }
      slides.push(s);
    }
    if (!slides.length) throw new Error('aucune diapositive trouvée');
    return { title: baseName(file.name), theme: 'clair', size: { w: Wd, h: Hd }, media: deckMedia, slides };

    function parasToHtml(ps, o) {
      let html = '', open = [];
      const closeTo = (lvl) => { while (open.length > lvl) html += `</${open.pop()}>`; };
      for (const p of ps) {
        const pPr = kid(p, A, 'pPr'); const lvl = pPr && pPr.getAttribute('lvl') ? +pPr.getAttribute('lvl') : 0;
        const buNone = pPr && kid(pPr, A, 'buNone'), buChar = pPr && kid(pPr, A, 'buChar'), buNum = pPr && kid(pPr, A, 'buAutoNum');
        const bullet = buNone ? null : buNum ? 'ol' : buChar ? 'ul' : o.body ? 'ul' : null;
        let inner = '';
        for (const r of [...p.children]) {
          if (r.localName === 'br') { inner += '<br>'; continue; }
          if (r.localName !== 'r' && r.localName !== 'fld') continue;
          const t = kid(r, A, 't'); if (!t) continue; const rPr = kid(r, A, 'rPr'); let st = '';
          let txt = esc(t.textContent);
          if (rPr) {
            const sz = rPr.getAttribute('sz'); if (sz) st += `font-size:${((+sz / 100) * o.scaleF * 4) / 3}px;`;
            else if (lvl > 0 && o.body) st += `font-size:${((o.sizes[Math.min(lvl, 4)] || o.defSize) * o.scaleF * 4) / 3}px;`;
            const c = color(kid(rPr, A, 'solidFill')); if (c) st += `color:${c};`;
            const lat = kid(rPr, A, 'latin'); if (lat && lat.getAttribute('typeface') && !/^\+/.test(lat.getAttribute('typeface'))) st += `font-family:'${lat.getAttribute('typeface')}';`;
            if (rPr.getAttribute('b') === '1') txt = `<b>${txt}</b>`; if (rPr.getAttribute('i') === '1') txt = `<i>${txt}</i>`; if (rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none') txt = `<u>${txt}</u>`;
          }
          inner += st ? `<span style="${st}">${txt}</span>` : txt;
        }
        const algn = pPr && pPr.getAttribute('algn'); const pst = algn ? ` style="text-align:${algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : 'left'}"` : '';
        if (bullet && inner) { const depth = lvl + 1; closeTo(depth); while (open.length < depth) { html += `<${bullet}>`; open.push(bullet); } html += `<li${pst}>${inner}</li>`; }
        else { closeTo(0); html += `<p${pst}>${inner || '<br>'}</p>`; }
      }
      closeTo(0);
      return html.replace(/(<p><br><\/p>)+$/, '');
    }
    function readChart(cx2) {
      const plot = desc(cx2, CNS, 'plotArea')[0]; if (!plot) return null;
      const types = { barChart: 'col', bar3DChart: 'col', lineChart: 'line', line3DChart: 'line', areaChart: 'area', pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'donut' };
      const node = [...plot.children].find((c) => types[c.localName]); if (!node) return null;
      let type = types[node.localName]; const bd = kid(node, CNS, 'barDir'); if (bd && bd.getAttribute('val') === 'bar') type = 'bar';
      const sers = kids(node, CNS, 'ser'); let labels = [];
      const series = sers.map((s2, i) => {
        const name = desc(kid(s2, CNS, 'tx'), CNS, 'v').map((v) => v.textContent)[0] || `Série ${i + 1}`;
        const cat = kid(s2, CNS, 'cat'); if (cat && !labels.length) labels = desc(cat, CNS, 'pt').sort((a, b) => +a.getAttribute('idx') - +b.getAttribute('idx')).map((p) => (kid(p, CNS, 'v') || {}).textContent || '');
        const vals = desc(kid(s2, CNS, 'val'), CNS, 'pt'); const arr = []; vals.forEach((p) => { arr[+p.getAttribute('idx')] = parseFloat((kid(p, CNS, 'v') || {}).textContent) || 0; });
        return { name, values: arr.map((v) => v || 0) };
      });
      if (!labels.length && series[0]) labels = series[0].values.map((_, i) => String(i + 1));
      const t = desc(cx2, CNS, 'title')[0]; const title = t ? desc(t, A, 't').map((x) => x.textContent).join('') : '';
      return { type, title, legend: !!desc(cx2, CNS, 'legend')[0], labels, series };
    }
  }

  /* ================= Modèles et plan ================= */
  function buildDeck(themeId, title, specs) {
    const d = P.newDeck(themeId); d.title = title; const Wd = d.size.w, Hd = d.size.h;
    specs.forEach((sp) => {
      const s = P.newSlide(sp.layout || 'content', d); s.notes = sp.notes || '';
      const byRole = (role, n = 0) => s.els.filter((e) => e.role === role)[n];
      const list = (items, ordered) => (items && items.length ? `<${ordered ? 'ol' : 'ul'}>${items.map((b) => (Array.isArray(b) ? `<li>${esc(b[0])}<ul>${b.slice(1).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></li>` : `<li>${esc(b)}</li>`)).join('')}</${ordered ? 'ol' : 'ul'}>` : '');
      if (byRole('title')) byRole('title').text = sp.title ? esc(sp.title) : '';
      if (sp.sub !== undefined && byRole('subtitle')) byRole('subtitle').text = esc(sp.sub);
      if (sp.sub2 !== undefined && byRole('subtitle', 1)) byRole('subtitle', 1).text = esc(sp.sub2);
      if (byRole('body')) byRole('body').text = list(sp.bullets, sp.ordered);
      if (byRole('body', 1)) byRole('body', 1).text = list(sp.bullets2);
      if (sp.chart || sp.table) {
        const body = byRole('body'); const box = body ? { x: body.x, y: body.y, w: body.w, h: body.h } : { x: Wd * 0.08, y: Hd * 0.25, w: Wd * 0.84, h: Hd * 0.66 };
        if (body && !sp.bullets) s.els = s.els.filter((e) => e !== body);
        if (sp.chart) s.els.push({ id: uid(), type: 'chart', ...box, rot: 0, chart: { legend: true, ...sp.chart }, style: { size: 14 }, ...(body && sp.bullets ? { x: Wd * 0.52, w: Wd * 0.42 } : {}) });
        if (sp.table) s.els.push({ id: uid(), type: 'table', x: box.x, y: box.y, w: box.w, h: Math.min(box.h, 52 * sp.table.length), rot: 0, table: { rows: sp.table, header: true, band: true, hdr: 'acc0' }, style: { size: 16 } });
      }
      if (sp.anim) s.els.filter((e) => e.role === 'body').forEach((e) => { e.anim = { type: 'up', start: 'click', byPara: true }; });
      d.slides.push(s);
    });
    return d;
  }
  const TEMPLATES = {
    rapport: { title: 'Rapport d\'activité', desc: 'Bilan annuel : réalisations, chiffres clés, difficultés, perspectives', theme: 'faso', specs: [
      { layout: 'title', title: 'Rapport d\'activité 2026', sub: 'Présenté par … — date' },
      { title: 'Sommaire', bullets: ['Contexte et objectifs', 'Principales réalisations', 'Chiffres clés', 'Difficultés rencontrées', 'Perspectives'], ordered: true },
      { title: 'Contexte et objectifs', bullets: ['Rappel des missions', 'Objectifs fixés pour l\'année', 'Moyens disponibles'] },
      { layout: 'two', title: 'Principales réalisations', bullets: ['Réalisation 1', 'Réalisation 2', 'Réalisation 3'], bullets2: ['Réalisation 4', 'Réalisation 5'] },
      { layout: 'titleOnly', title: 'Chiffres clés', chart: { type: 'col', title: 'Recettes et dépenses (millions FCFA)', labels: ['T1', 'T2', 'T3', 'T4'], series: [{ name: 'Recettes', values: [42, 55, 48, 61] }, { name: 'Dépenses', values: [38, 47, 50, 52] }] } },
      { title: 'Difficultés rencontrées', bullets: ['Difficulté 1 et ses causes', 'Difficulté 2', 'Mesures prises'] },
      { title: 'Perspectives', bullets: ['Priorités de l\'année prochaine', 'Besoins identifiés', 'Calendrier'] },
      { layout: 'section', title: 'Merci de votre attention', sub: 'Questions et échanges' },
    ] },
    reunion: { title: 'Réunion — ordre du jour', desc: 'Ordre du jour, points, décisions et suivi des actions', theme: 'clair', specs: [
      { layout: 'title', title: 'Réunion du conseil', sub: 'Date — lieu' },
      { title: 'Ordre du jour', bullets: ['Adoption du procès-verbal de la dernière réunion', 'Point financier', 'Projets en cours', 'Questions diverses'], ordered: true },
      { layout: 'section', title: '1. Procès-verbal', sub: 'Adoption' },
      { title: '2. Point financier', bullets: ['Situation de trésorerie', 'Exécution du budget', 'Restes à recouvrer'] },
      { title: '3. Projets en cours', bullets: ['Projet A : état d\'avancement', 'Projet B : difficultés', 'Projet C : démarrage'] },
      { layout: 'titleOnly', title: 'Décisions et actions', table: [['Action', 'Responsable', 'Échéance'], ['', '', ''], ['', '', ''], ['', '', '']] },
      { layout: 'section', title: 'Questions diverses' },
    ] },
    budget: { title: 'Présentation du budget', desc: 'Synthèse, recettes, dépenses, investissements', theme: 'marine', specs: [
      { layout: 'title', title: 'Budget primitif 2027', sub: 'Présentation au conseil' },
      { title: 'Synthèse', bullets: ['Total recettes : … FCFA', 'Total dépenses : … FCFA', 'Équilibre du budget', 'Principales évolutions par rapport à 2026'] },
      { layout: 'titleOnly', title: 'Structure des recettes', chart: { type: 'donut', title: '', labels: ['Fiscalité', 'Domaine', 'Transferts', 'Autres'], series: [{ name: 'Recettes', values: [35, 15, 42, 8] }] } },
      { layout: 'titleOnly', title: 'Dépenses par nature', chart: { type: 'bar', title: '', labels: ['Personnel', 'Fonctionnement', 'Entretien', 'Transferts', 'Investissement'], series: [{ name: 'Montant (M FCFA)', values: [30, 12, 6, 9, 25] }] } },
      { layout: 'titleOnly', title: 'Programme d\'investissement', table: [['Projet', 'Montant (FCFA)', 'Financement'], ['Construction d\'école', '45 000 000', 'FPDCT'], ['Forage', '12 000 000', 'Budget propre'], ['Voirie', '30 000 000', 'Partenaires']] },
      { title: 'Conclusion', bullets: ['Budget équilibré et prudent', 'Priorité aux services de base', 'Suivi trimestriel de l\'exécution'] },
    ] },
    formation: { title: 'Formation', desc: 'Objectifs, programme, modules, quiz et questions', theme: 'verdure', specs: [
      { layout: 'title', title: 'Titre de la formation', sub: 'Formateur — date' },
      { title: 'Objectifs de la formation', bullets: ['À la fin de la séance, vous saurez…', 'Objectif 2', 'Objectif 3'], anim: true },
      { title: 'Programme', bullets: ['Module 1 — …', 'Module 2 — …', 'Pause', 'Module 3 — …', 'Évaluation'], ordered: true },
      { layout: 'section', title: 'Module 1', sub: 'Les bases' },
      { title: 'Notion clé', bullets: [['Définition', 'Exemple concret'], 'Erreurs fréquentes', 'Bonnes pratiques'], anim: true },
      { layout: 'comparison', title: 'À faire / à éviter', sub: 'À faire', sub2: 'À éviter', bullets: ['Bonne pratique 1', 'Bonne pratique 2'], bullets2: ['Erreur 1', 'Erreur 2'] },
      { title: 'Quiz', bullets: ['Question 1 ?', 'Question 2 ?', 'Question 3 ?'], ordered: true },
      { layout: 'section', title: 'Questions ?', sub: 'Merci de votre participation' },
    ] },
    projet: { title: 'Présentation de projet', desc: 'Problème, solution, calendrier, budget, équipe', theme: 'elegant', specs: [
      { layout: 'title', title: 'Nom du projet', sub: 'Porteur du projet — date' },
      { title: 'Le problème', bullets: ['Situation actuelle', 'Personnes concernées', 'Conséquences'] },
      { title: 'Notre solution', bullets: ['Description', 'Avantages', 'Résultats attendus'] },
      { layout: 'titleOnly', title: 'Calendrier', table: [['Étape', 'Début', 'Fin'], ['Étude', 'janvier', 'février'], ['Réalisation', 'mars', 'août'], ['Réception', 'septembre', 'septembre']] },
      { layout: 'titleOnly', title: 'Budget', chart: { type: 'pie', title: 'Répartition du coût', labels: ['Travaux', 'Équipement', 'Formation', 'Imprévus'], series: [{ name: 'Coût', values: [60, 25, 10, 5] }] } },
      { title: 'L\'équipe', bullets: ['Responsable du projet', 'Partenaires techniques', 'Partenaires financiers'] },
      { layout: 'section', title: 'Merci', sub: 'Contact : …' },
    ] },
  };
  async function templatesDialog() {
    const r = await modal({
      title: 'Nouvelle présentation à partir d\'un modèle', wide: true,
      body: `<div class="layout-grid">${Object.entries(TEMPLATES).map(([k, t]) => { const d = buildDeck(t.theme, t.title, t.specs.slice(0, 1)); const dom = P.renderSlide(d.slides[0], { deck: d, index: 0 }); dom.style.transform = `scale(${160 / d.size.w})`; dom.style.transformOrigin = '0 0'; return `<button type="button" data-t="${k}"><div style="width:160px;height:90px;overflow:hidden">${dom.outerHTML}</div><b>${esc(t.title)}</b><span class="hint">${esc(t.desc)}</span></button>`; }).join('')}</div>`,
      onOpen: (b) => b.querySelectorAll('[data-t]').forEach((x) => { x.onclick = () => { b.dataset.t = x.dataset.t; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
      buttons: [{ label: 'Annuler', value: null }, { label: 'Ouvrir', primary: true, value: (b) => b.dataset.t || null }],
    });
    if (!r) return;
    if (!(await confirmReplace())) return;
    const t = TEMPLATES[r]; P.loadDeck(buildDeck(t.theme, t.title, t.specs)); P.autosave();
  }
  async function confirmReplace() { return !(P.dirty && P.deck.slides.some((s) => s.els.some((e) => !P.isEmptyText(e.text) || e.src))) || confirmBox('Remplacer la présentation en cours ? Enregistrez-la avant si besoin.', 'Remplacer'); }
  async function newDeck() { if (!(await confirmReplace())) return; const d = P.newDeck(P.deck.theme); d.slides.push(P.newSlide('title', d)); P.loadDeck(d); P.autosave(); }
  function outlineToSpecs(text) {
    const lines = text.replace(/\t/g, '  ').split(/\r?\n/);
    const specs = []; let curS = null;
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const indent = raw.match(/^ */)[0].length; const t = raw.trim();
      const bullet = /^([-*•–]|\d+[.)])\s+/.test(t) || indent >= 2;
      const clean = t.replace(/^([-*•–]|\d+[.)])\s+/, '').replace(/^#+\s*/, '');
      if (!bullet || !curS) { curS = { title: clean, bullets: [], section: /^##\s/.test(t) }; specs.push(curS); continue; }
      const lvl = indent >= 4 || (indent >= 2 && /^([-*•–])/.test(t) && curS.bullets.length && raw.match(/^ */)[0].length > 0) ? 1 : 0;
      if (lvl && curS.bullets.length) { const last = curS.bullets[curS.bullets.length - 1]; if (Array.isArray(last)) last.push(clean); else curS.bullets[curS.bullets.length - 1] = [last, clean]; } else curS.bullets.push(clean);
    }
    return specs.map((s, i) => {
      if (i === 0) return { layout: 'title', title: s.title, sub: s.bullets.map((b) => (Array.isArray(b) ? b[0] : b)).join(' — ') };
      if (s.section || !s.bullets.length) return { layout: 'section', title: s.title, sub: s.bullets.map((b) => (Array.isArray(b) ? b[0] : b)).join(' — ') };
      if (s.bullets.length > 7) { const h = Math.ceil(s.bullets.length / 2); return { layout: 'two', title: s.title, bullets: s.bullets.slice(0, h), bullets2: s.bullets.slice(h) }; }
      return { title: s.title, bullets: s.bullets };
    });
  }
  async function outlineDialog() {
    const r = await modal({
      title: 'Créer une présentation à partir d\'un plan', wide: true,
      body: `<p class="hint" style="margin:0">Une ligne = un titre de diapositive ; les lignes commençant par « - » (ou en retrait) deviennent des puces. La première ligne fait la diapositive de titre ; « ## » crée une diapositive de section.</p>
        <textarea id="olT" style="min-height:260px;font:14px var(--font-mono)">Rapport de la commission des finances
- Session ordinaire de mars 2026
Ordre du jour
- Situation de trésorerie
- Exécution du budget
- Recommandations
## Situation de trésorerie
Exécution du budget
- Recettes : 85 % des prévisions
- Dépenses : 78 % des prévisions
  - fonctionnement : 92 %
  - investissement : 61 %
Recommandations
- Renforcer le recouvrement
- Accélérer les marchés d'investissement</textarea>
        <div class="field"><label for="olTh">Thème</label><select id="olTh">${Object.entries(P.THEMES).map(([k, t]) => `<option value="${k}" ${P.deck.theme === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>`,
      onOpen: (b) => { Studio.speech && Studio.speech.attachMic(b.querySelector('#olT')); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Créer les diapositives', primary: true, value: (b) => ({ t: b.querySelector('#olT').value, th: b.querySelector('#olTh').value }) }],
    });
    if (!r || !r.t.trim()) return;
    if (!(await confirmReplace())) return;
    const specs = outlineToSpecs(r.t);
    P.loadDeck(buildDeck(r.th, specs[0] ? specs[0].title : 'Présentation', specs)); P.autosave();
    toast(`${specs.length} diapositives créées`);
  }

  /* ================= IA ================= */
  async function aiDeck() {
    const r = await modal({
      title: 'Créer une présentation avec l\'IA', wide: true,
      body: `<div class="field"><label for="aiS">Sujet, plan ou texte à transformer en diapositives</label><textarea id="aiS" style="min-height:160px" placeholder="ex. Présentation du rapport de gestion 2026 de la commune, pour le conseil municipal…"></textarea></div>
        <div class="grid2"><div class="field"><label for="aiN">Nombre de diapositives</label><input type="number" id="aiN" min="3" max="25" value="8"></div>
        <div class="field"><label for="aiA">Public et ton</label><select id="aiA"><option>Conseil municipal / élus, ton officiel</option><option>Collègues, ton professionnel</option><option>Formation, ton pédagogique</option><option>Partenaires financiers, ton convaincant</option><option>Grand public, ton simple</option></select></div>
        <div class="field"><label for="aiTh">Thème</label><select id="aiTh">${Object.entries(P.THEMES).map(([k, t]) => `<option value="${k}" ${P.deck.theme === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
        <label class="row" style="align-self:end"><input type="checkbox" id="aiNo" checked> Rédiger les notes de l'orateur</label></div>`,
      onOpen: (b) => { b.querySelector('#aiS').focus(); Studio.speech && Studio.speech.attachMic(b.querySelector('#aiS')); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Créer', primary: true, value: (b) => ({ s: b.querySelector('#aiS').value.trim(), n: +b.querySelector('#aiN').value || 8, a: b.querySelector('#aiA').value, th: b.querySelector('#aiTh').value, notes: b.querySelector('#aiNo').checked }) }],
    });
    if (!r || !r.s) return;
    const key = await Studio.ai.ensureKey({ title: 'Créer une présentation : IA Claude', purpose: 'votre sujet ou votre texte' }); if (!key) return;
    await loadScript('lib/anthropic-sdk.js'); toast('Claude prépare la présentation…', 60000);
    const schema = { type: 'object', additionalProperties: false, required: ['title', 'subtitle', 'slides'], properties: {
      title: { type: 'string' }, subtitle: { type: 'string' },
      slides: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['layout', 'title', 'bullets', 'bullets2', 'notes', 'chart'], properties: {
        layout: { type: 'string', enum: ['content', 'two', 'section', 'titleOnly'] }, title: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } }, bullets2: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' },
        chart: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['type', 'title', 'labels', 'series'], properties: { type: { type: 'string', enum: ['col', 'bar', 'line', 'pie'] }, title: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } }, series: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'values'], properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } } } } } }] },
      } } },
    } };
    try {
      const out = await Studio.ai.callJson(key, {
        system: 'Tu conçois des présentations claires en français pour un public d\'Afrique de l\'Ouest francophone (administration, collectivités, entreprises). Chaque diapositive a un titre court et au plus 6 puces de moins de 12 mots. Utilise "two" pour comparer, "section" pour séparer les grandes parties (sans puces), "titleOnly" avec un graphique uniquement si le texte fournit des chiffres réels (n\'invente jamais de chiffres : sinon chart = null). Ne mets pas de diapositive de titre ni de remerciement dans "slides" (elles sont ajoutées automatiquement). Les notes de l\'orateur font 2 à 4 phrases.',
        content: `Sujet ou texte :\n${r.s}\n\nNombre de diapositives de contenu : environ ${Math.max(1, r.n - 2)}. Public et ton : ${r.a}. ${r.notes ? 'Rédige les notes de l\'orateur.' : 'Notes : chaîne vide.'}`,
        schema,
      });
      const specs = [{ layout: 'title', title: out.title, sub: out.subtitle }, ...out.slides.map((s) => ({ layout: s.chart && s.layout !== 'two' ? 'titleOnly' : s.layout, title: s.title, bullets: s.layout === 'section' ? undefined : s.bullets, bullets2: s.bullets2, sub: s.layout === 'section' ? s.bullets.join(' — ') : undefined, notes: s.notes, chart: s.chart || undefined })), { layout: 'section', title: 'Merci de votre attention', sub: 'Questions et échanges' }];
      if (!(await confirmReplace())) return;
      P.loadDeck(buildDeck(r.th, out.title, specs)); P.autosave(); toast(`Présentation créée : ${specs.length} diapositives. Relisez-la avant de la présenter.`, 6000);
    } catch (e) { toast('IA indisponible : ' + e.message, 8000); }
  }
  async function aiNotes() {
    const key = await Studio.ai.ensureKey({ title: 'Notes de l\'orateur : IA Claude', purpose: 'le texte de vos diapositives' }); if (!key) return;
    await loadScript('lib/anthropic-sdk.js'); toast('Claude rédige les notes…', 60000);
    const content = P.deck.slides.map((s, i) => `Diapositive ${i + 1} :\n${s.els.map((e) => P.plainText(e.text || '') || (e.chart ? `[graphique ${e.chart.title || ''} : ${e.chart.labels.join(', ')}]` : '') || (e.table ? '[tableau] ' + e.table.rows.map((r) => r.map(P.plainText).join(' | ')).join(' / ') : '')).filter(Boolean).join('\n')}${s.notes ? `\nNotes actuelles : ${s.notes}` : ''}`).join('\n\n');
    try {
      const out = await Studio.ai.callJson(key, { system: 'Tu rédiges des notes d\'orateur en français, naturelles à dire à voix haute : 2 à 5 phrases par diapositive, qui expliquent et relient les idées sans répéter mot pour mot les puces. Garde les notes existantes si elles sont bonnes, en les complétant.', content, schema: { type: 'object', additionalProperties: false, required: ['notes'], properties: { notes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['slide', 'text'], properties: { slide: { type: 'integer' }, text: { type: 'string' } } } } } } });
      P.change(() => out.notes.forEach((n) => { const s = P.deck.slides[n.slide - 1]; if (s) s.notes = n.text; }));
      toast('Notes ajoutées : elles s\'affichent sous chaque diapositive et en mode présentateur', 6000);
    } catch (e) { toast('IA indisponible : ' + e.message, 8000); }
  }

  Studio.slidesExtra = {
    actions: {
      newSlide: newSlideDialog, layout: layoutDialog, shapes: shapesDialog, addTable: tableDialog, addChart: () => chartDialog(null), editChart: () => { const el = P.selEls()[0]; if (el && el.type === 'chart') chartDialog(el); },
      addIcon: iconDialog, themes: themesDialog, bgAll: bgAllDialog, size: sizeDialog, transAll,
      showStart: () => startShow(P.deck.slides.findIndex((s) => !s.hidden) >= 0 ? P.deck.slides.findIndex((s) => !s.hidden) : 0), showHere: () => startShow(P.cur), presenter: () => startShow(P.cur, true),
      savePptx, saveJoe, pdf: pdfDialog, images: exportImages, open: openDialog, new: newDeck, templates: templatesDialog, outline: outlineDialog, aiDeck, aiNotes,
    },
    readPptx, slideCanvas, TEMPLATES, buildDeck, outlineToSpecs, htmlToParas, get show() { return showState; },
  };
})();
