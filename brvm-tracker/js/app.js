/* BRVM Tracker Joe — interface : formats, mise en page, navigation, fenêtres, formulaire d'opération. */
(function () {
  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  const hidden = () => BT.state.settings.hideAmounts;

  BT.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  BT.fmt = (n, dec) => (n == null || isNaN(n) ? '—' : (dec ? nf2 : nf0).format(n));
  BT.money = (n) => (hidden() ? '••••• F' : BT.fmt(n) + ' F');
  BT.signed = (n) => (hidden() ? '••••• F' : (n > 0 ? '+' : '') + BT.fmt(n) + ' F');
  BT.pct = (n, dec) => (n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(dec ?? 2).replace('.', ',') + ' %');
  BT.cls = (n) => (n > 0.0001 ? 'pos' : n < -0.0001 ? 'neg' : '');
  BT.short = (n) => {
    if (hidden()) return '•••';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' Md';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
    if (a >= 1e3) return Math.round(n / 1e3) + ' k';
    return BT.fmt(n);
  };
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  BT.dateShort = (d) => { const [y, m, j] = d.split('-'); return `${+j} ${MOIS[+m - 1]} ${y.slice(2)}`; };
  BT.dateLong = (d) => { if (!d) return ''; const [y, m, j] = d.split('-'); return `${+j} ${MOIS[+m - 1]} ${y}`; };
  BT.ago = (ts) => {
    if (!ts) return 'jamais';
    const s = (Date.now() - ts) / 1000;
    if (s < 90) return 'à l\'instant';
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return `le ${BT.dateLong(new Date(ts).toISOString().slice(0, 10))}`;
  };
  BT.validDate = (v, max) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && v >= '1998-01-01' && v <= (max || BT.today());
  BT.$ = (sel, root) => (root || document).querySelector(sel);
  BT.$$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  /* ---------- Notifications à l'écran ---------- */
  BT.toast = function (msg, kind, ms) {
    let box = BT.$('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    t.onclick = () => t.remove();
    box.appendChild(t);
    setTimeout(() => t.remove(), ms || 4000);
  };

  /* ---------- Fenêtre modale ---------- */
  BT.modal = function (title, html, onMount) {
    BT.closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><header><h3>${BT.esc(title)}</h3><button class="icon-btn" data-close aria-label="Fermer">✕</button></header><div class="modal-body">${html}</div></div>`;
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) BT.closeModal(); });
    wrap.querySelector('[data-close]').onclick = BT.closeModal;
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    if (onMount) onMount(wrap.querySelector('.modal-body'));
    const f = wrap.querySelector('input:not([type=hidden]),select,textarea');
    if (f && window.innerWidth > 700) f.focus();
    return wrap;
  };
  BT.closeModal = function () { BT.$$('.modal-back').forEach((m) => m.remove()); document.body.classList.remove('no-scroll'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') BT.closeModal(); });

  BT.confirm = function (msg, onYes, yesLabel) {
    BT.modal('Confirmation', `<p>${BT.esc(msg)}</p><div class="row-end"><button class="btn" data-close2>Annuler</button><button class="btn danger" data-yes>${BT.esc(yesLabel || 'Supprimer')}</button></div>`, (b) => {
      b.querySelector('[data-close2]').onclick = BT.closeModal;
      b.querySelector('[data-yes]').onclick = () => { BT.closeModal(); onYes(); };
    });
  };

  /* ---------- Navigation ---------- */
  BT.views = {};
  const NAV = [
    ['', '◧', 'Tableau de bord'], ['positions', '▤', 'Positions'], ['operations', '⇄', 'Opérations'],
    ['dividendes', '❖', 'Dividendes'], ['marche', '↗', 'Marché'], ['alertes', '🔔', 'Alertes'],
    ['outils', '⚙', 'Outils & simulateurs'], ['import', '⇪', 'Import / Export'], ['rapport', '⎙', 'Rapport PDF'], ['parametres', '☰', 'Paramètres'],
  ];
  const MOBILE_NAV = ['', 'positions', 'operations', 'marche', 'plus'];

  function shell() {
    const app = BT.$('#app');
    app.innerHTML = `
      <aside class="side">
        <div class="brand"><img src="icons/icon.svg" alt="" width="30" height="30"><div><b>BRVM Tracker</b><small>Joe · usage personnel</small></div></div>
        <nav>${NAV.map(([r, i, l]) => `<a href="#/${r}" data-r="${r}"><span class="ni">${i}</span>${l}</a>`).join('')}</nav>
        <div class="side-foot" id="side-market"></div>
      </aside>
      <div class="main">
        <header class="top">
          <select id="pf-select" aria-label="Portefeuille"></select>
          <div class="top-status" id="top-status"></div>
          <div class="top-actions">
            <button class="icon-btn" id="btn-refresh" title="Actualiser les cours">⟳</button>
            <button class="icon-btn" id="btn-hide" title="Masquer / afficher les montants">◉</button>
            <button class="icon-btn" id="btn-theme" title="Thème clair / sombre">◐</button>
            <button class="btn primary" id="btn-add">+<span class="lbl"> Opération</span></button>
          </div>
        </header>
        <main id="view"></main>
      </div>
      <nav class="bottom">${MOBILE_NAV.map((r) => r === 'plus' ? '<a href="#" id="nav-more"><span class="ni">⋯</span>Plus</a>' : `<a href="#/${r}" data-r="${r}"><span class="ni">${NAV.find((n) => n[0] === r)[1]}</span>${NAV.find((n) => n[0] === r)[2].split(' ')[0]}</a>`).join('')}</nav>`;
    BT.$('#btn-add').onclick = () => BT.txForm();
    BT.$('#btn-refresh').onclick = async (e) => { e.currentTarget.classList.add('spin'); await BT.refreshPrices(); e.currentTarget.classList.remove('spin'); BT.render(); };
    BT.$('#btn-hide').onclick = () => { BT.state.settings.hideAmounts = !BT.state.settings.hideAmounts; BT.save(); BT.render(); };
    BT.$('#btn-theme').onclick = () => {
      const s = BT.state.settings;
      const dark = document.documentElement.dataset.theme === 'dark';
      s.theme = dark ? 'light' : 'dark'; BT.save(); BT.applyTheme();
      BT.render();
    };
    BT.$('#pf-select').onchange = (e) => { BT.state.currentPid = e.target.value; BT.save(); BT.render(); };
    BT.$('#nav-more').onclick = (e) => {
      e.preventDefault();
      BT.modal('Menu', `<div class="more-grid">${NAV.filter(([r]) => !MOBILE_NAV.includes(r)).map(([r, i, l]) => `<a href="#/${r}" class="more-item"><span>${i}</span>${l}</a>`).join('')}</div>`, (b) => BT.$$('a', b).forEach((a) => a.addEventListener('click', BT.closeModal)));
    };
  }

  BT.applyTheme = function () {
    const t = BT.state.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };

  function topBar() {
    const st = BT.state;
    const sel = BT.$('#pf-select');
    const roots = st.portfolios.filter((p) => !p.parentId || !st.portfolios.some((x) => x.id === p.parentId));
    const opts = ['<option value="all">Tous les portefeuilles</option>'];
    const walk = (p, depth) => {
      opts.push(`<option value="${p.id}">${'  '.repeat(depth)}${depth ? '↳ ' : ''}${BT.esc(p.name)}</option>`);
      st.portfolios.filter((c) => c.parentId === p.id).forEach((c) => walk(c, depth + 1));
    };
    roots.forEach((p) => walk(p, 0));
    sel.innerHTML = opts.join('');
    if (st.currentPid !== 'all' && !st.portfolios.some((p) => p.id === st.currentPid)) st.currentPid = 'all';
    sel.value = st.currentPid;
    const ms = BT.marketStatus();
    const anyLive = BT.stocks().some((s) => s.live);
    const lastTs = Math.max(st.lastFetch || 0, ...Object.values(st.prices).map((q) => q.ts || 0));
    BT.$('#top-status').innerHTML = `<span class="dot ${ms.open ? 'on' : ms.pre ? 'pre' : ''}"></span>${ms.label}<span class="muted"> · cours ${anyLive ? 'mis à jour ' + BT.ago(lastTs || null) : 'de référence (à actualiser)'}</span>`;
    BT.$('#side-market').innerHTML = `<div class="muted small">${ms.label}</div>`;
    BT.$('#btn-hide').classList.toggle('active', !!st.settings.hideAmounts);
    BT.$('#btn-theme').textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾';
  }

  BT.route = function () {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, ...args] = h.split('/');
    return { name: name || '', args: args.map(decodeURIComponent) };
  };

  BT.render = function () {
    topBar();
    const { name, args } = BT.route();
    BT.$$('nav a[data-r]').forEach((a) => a.classList.toggle('active', a.dataset.r === (name === 'titre' ? 'marche' : name)));
    const view = BT.views[name] || BT.views[''];
    const root = BT.$('#view');
    root.className = 'view-' + (name || 'dashboard');
    try { view(root, args); } catch (e) { console.error(e); root.innerHTML = `<div class="card"><h2>Erreur d'affichage</h2><pre>${BT.esc(e.stack || e.message)}</pre></div>`; }
  };

  /* ---------- Sélecteur de titre ---------- */
  BT.stockOptions = function (selected, held) {
    const stocks = BT.stocks();
    const heldSet = new Set(held || []);
    const fmt = (s) => `<option value="${s.t}" ${s.t === selected ? 'selected' : ''}>${s.t} — ${BT.esc(s.n)}</option>`;
    const a = stocks.filter((s) => heldSet.has(s.t)), b = stocks.filter((s) => !heldSet.has(s.t));
    return (a.length ? `<optgroup label="En portefeuille">${a.map(fmt).join('')}</optgroup><optgroup label="Autres valeurs">` : '') + b.map(fmt).join('') + (a.length ? '</optgroup>' : '');
  };

  BT.pfOptions = function (selected) {
    return BT.state.portfolios.map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${BT.esc(p.name)}</option>`).join('');
  };

  /* ---------- Formulaire d'opération (ajout / modification) ---------- */
  BT.txForm = function (existing, preset) {
    const st = BT.state;
    const tx = existing ? Object.assign({}, existing) : Object.assign({
      id: BT.uid(), pid: st.currentPid !== 'all' ? st.currentPid : st.portfolios[0].id,
      date: BT.today(), type: 'achat', ticker: '', qty: '', price: '', fees: '', amount: '', note: '',
    }, preset || {});
    const held = BT.summary('all').open.map((p) => p.t);
    const html = `
      <form class="form" id="txf">
        <div class="seg" id="tx-types">${Object.entries(BT.TX_TYPES).map(([k, v]) => `<button type="button" data-t="${k}" class="${k === tx.type ? 'on' : ''}">${v.label.split(' /')[0]}</button>`).join('')}</div>
        <div class="grid2">
          <label>Portefeuille<select name="pid">${BT.pfOptions(tx.pid)}</select></label>
          <label>Date<input type="date" name="date" value="${tx.date}" required></label>
        </div>
        <label data-f="ticker">Titre<select name="ticker">${BT.stockOptions(tx.ticker, held)}</select></label>
        <div class="grid3">
          <label data-f="qty"><span data-qlabel>Quantité</span><input name="qty" inputmode="decimal" value="${tx.qty ?? ''}" autocomplete="off"></label>
          <label data-f="price"><span data-plabel>Cours</span><input name="price" inputmode="decimal" value="${tx.price ?? ''}" autocomplete="off"></label>
          <label data-f="fees"><span class="label-row">Frais <button type="button" class="link small" id="fee-auto" title="Calculer avec le taux du portefeuille">calcul auto</button></span><input name="fees" inputmode="decimal" value="${tx.fees ?? ''}" autocomplete="off"></label>
        </div>
        <label data-f="amount"><span data-alabel>Montant</span><input name="amount" inputmode="decimal" value="${tx.amount ?? ''}" autocomplete="off"></label>
        <label data-f="fund" class="check"><input type="checkbox" name="fund"> Enregistrer aussi un dépôt du même montant (achat financé par un versement)</label>
        <label>Note<input name="note" value="${BT.esc(tx.note || '')}" maxlength="200" placeholder="facultatif"></label>
        <div class="tx-preview" id="tx-prev"></div>
        <div class="row-end">
          ${existing ? '<button type="button" class="btn danger" id="tx-del">Supprimer</button><span class="grow"></span>' : ''}
          <button type="button" class="btn" data-cancel>Annuler</button>
          <button class="btn primary">${existing ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </form>`;
    BT.modal(existing ? 'Modifier l\'opération' : 'Nouvelle opération', html, (body) => {
      const f = body.querySelector('#txf');
      let feesTouched = existing ? true : !!(preset && preset.fees);
      const read = () => ({
        ...tx, pid: f.pid.value, date: f.date.value, ticker: f.ticker.value,
        qty: BT.parseNum(f.qty.value) || '', price: BT.parseNum(f.price.value) || '', fees: BT.parseNum(f.fees.value) || '', amount: BT.parseNum(f.amount.value) || '', note: f.note.value.trim(),
      });
      const sync = () => {
        const def = BT.TX_TYPES[tx.type];
        const show = (k, on) => { const el = body.querySelector(`[data-f="${k}"]`); if (el) el.hidden = !on; };
        const trade = tx.type === 'achat' || tx.type === 'vente';
        show('ticker', def.stock); show('qty', def.stock); show('price', trade || tx.type === 'dividende');
        show('fees', trade); show('amount', !def.stock || tx.type === 'dividende'); show('fund', tx.type === 'achat' && !existing);
        body.querySelector('[data-qlabel]').textContent = tx.type === 'split' ? 'Ratio (1 ancienne → N nouvelles)' : tx.type === 'dividende' ? 'Titres détenus (facultatif)' : 'Quantité';
        body.querySelector('[data-plabel]').textContent = tx.type === 'dividende' ? 'Dividende net / action' : 'Cours d\'exécution';
        body.querySelector('[data-alabel]').textContent = tx.type === 'dividende' ? 'Montant net encaissé (sinon titres × dividende)' : 'Montant';
        const cur = read();
        if (trade && !feesTouched && cur.qty && cur.price) f.fees.value = BT.estimateFees(cur.qty * cur.price, cur.pid) || '';
        const t2 = read();
        const prev = body.querySelector('#tx-prev');
        const cash = BT.txCash(t2);
        let extra = '';
        const s = def.stock && BT.stock(t2.ticker);
        if (s && trade) {
          const lim = `Limites du jour (±${String(BT.MAX_DAILY_MOVE).replace('.', ',')} %) : ${BT.fmt(s.prev * (1 - BT.MAX_DAILY_MOVE / 100))} – ${BT.fmt(s.prev * (1 + BT.MAX_DAILY_MOVE / 100))} F`;
          extra += `<div class="muted small">Dernier cours ${BT.fmt(s.price)} F (${BT.pct(s.change)}) · ${lim}</div>`;
          if (t2.price && Math.abs(t2.price / s.price - 1) > 0.3) extra += '<div class="warn small">⚠ Cours très éloigné du dernier cours connu : vérifiez la saisie.</div>';
        }
        if (s && tx.type === 'vente') {
          const others = BT.state.transactions.filter((x) => x.id !== tx.id && x.pid === t2.pid);
          const r = BT.replay(others.sort((a, b) => a.date.localeCompare(b.date)), t2.date);
          const p = r.pos[t2.ticker];
          if (p && p.qty) {
            const gain = t2.qty && t2.price ? cash - p.pru * Math.min(t2.qty, p.qty) : null;
            extra += `<div class="small">Détenus à cette date : <b>${BT.fmt(p.qty)}</b> à PRU ${BT.fmt(p.pru)} F${gain != null ? ` · plus-value estimée <b class="${BT.cls(gain)}">${BT.signed(gain)}</b>` : ''}</div>`;
          } else extra += '<div class="warn small">⚠ Aucun titre détenu dans ce portefeuille à cette date.</div>';
        }
        if (tx.type === 'dividende' && s) extra += `<div class="muted small">Dividende brut de référence : ${BT.fmt(s.d)} F → net après IRVM ${BT.state.settings.irvm[s.c]} % : ${BT.fmt(s.netD, 1)} F</div>`;
        const pb = BT.txProblem(t2);
        prev.innerHTML = `<div>Mouvement de trésorerie : <b class="${BT.cls(cash)}">${BT.signed(cash)}</b></div>${extra}${pb ? `<div class="muted small">À compléter : ${pb.toLowerCase()}</div>` : ''}`;
      };
      body.querySelectorAll('#tx-types button').forEach((b) => b.onclick = () => {
        tx.type = b.dataset.t;
        body.querySelectorAll('#tx-types button').forEach((x) => x.classList.toggle('on', x === b));
        if (tx.type === 'dividende' && !f.price.value) { const s = BT.stock(f.ticker.value); if (s) f.price.value = Math.round(s.netD * 100) / 100 || ''; }
        if (tx.type === 'vente' && !existing) {
          const open = BT.summary(f.pid.value).open;
          if (open.length && !open.some((x) => x.t === f.ticker.value)) f.ticker.value = open[0].t;
          const p = open.find((x) => x.t === f.ticker.value);
          if (p) { f.qty.value = p.qty; f.price.value = p.price; }
        }
        if (tx.type === 'dividende' && !f.qty.value) { const p = BT.summary(f.pid.value).open.find((x) => x.t === f.ticker.value); if (p) f.qty.value = p.qty; }
        sync();
      });
      f.fees.addEventListener('input', () => { feesTouched = true; });
      body.querySelector('#fee-auto').onclick = () => { feesTouched = false; f.fees.value = ''; sync(); };
      f.ticker.addEventListener('change', () => {
        const s = BT.stock(f.ticker.value);
        if (s && (tx.type === 'achat' || tx.type === 'vente') && !existing) f.price.value = s.price;
        if (s && tx.type === 'dividende') f.price.value = Math.round(s.netD * 100) / 100 || '';
        if (tx.type === 'vente' && !existing) { const p = BT.summary(f.pid.value).open.find((x) => x.t === f.ticker.value); if (p) f.qty.value = p.qty; }
        sync();
      });
      if (!existing && !f.price.value && (tx.type === 'achat' || tx.type === 'vente')) { const s = BT.stock(f.ticker.value); if (s) f.price.value = s.price; }
      f.addEventListener('input', sync);
      body.querySelector('[data-cancel]').onclick = BT.closeModal;
      const del = body.querySelector('#tx-del');
      if (del) del.onclick = () => BT.confirm('Supprimer cette opération ?', () => {
        st.transactions = st.transactions.filter((x) => x.id !== tx.id); BT.save(); BT.render(); BT.toast('Opération supprimée.');
      });
      f.onsubmit = (e) => {
        e.preventDefault();
        const t = read();
        const def = BT.TX_TYPES[t.type];
        if (!def.stock) { t.ticker = ''; t.qty = ''; t.price = ''; }
        if (t.type !== 'achat' && t.type !== 'vente') t.fees = '';
        if (def.stock && t.type !== 'dividende') t.amount = '';
        if (t.type === 'split') t.price = '';
        const pb = BT.txProblem(t);
        if (pb) { BT.toast(pb, 'err'); return; }
        t.amount = t.amount === '' ? '' : Math.abs(t.amount);
        const i = st.transactions.findIndex((x) => x.id === t.id);
        t.seq = t.seq || Date.now();
        if (i >= 0) st.transactions[i] = t; else st.transactions.push(t);
        if (f.fund && f.fund.checked && t.type === 'achat') st.transactions.push({ id: BT.uid(), pid: t.pid, date: t.date, type: 'depot', amount: -BT.txCash(t), note: 'Financement achat ' + t.ticker, seq: t.seq - 1 });
        if ((t.type === 'achat' || t.type === 'vente') && t.price) (st.history[t.ticker] = st.history[t.ticker] || {})[t.date] = st.history[t.ticker][t.date] || t.price;
        BT.save(); BT.closeModal(); BT.render();
        BT.toast(existing ? 'Opération modifiée.' : 'Opération ajoutée.', 'ok');
      };
      sync();
    });
  };

  /* ---------- Démarrage ---------- */
  BT.start = function () {
    BT.applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { BT.applyTheme(); BT.render(); });
    shell();
    window.addEventListener('hashchange', () => { BT.render(); window.scrollTo(0, 0); });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(BT.render, 200); });
    BT.render();
    const st = BT.state;
    // actualisation automatique : au démarrage si les cours datent de plus de 30 min, puis toutes les 15 min en séance
    const auto = async () => {
      if (!st.settings.autoRefresh || !navigator.onLine) return;
      if (st.lastFetch && Date.now() - st.lastFetch < 30 * 60000 && !BT.marketStatus().open) return;
      if (await BT.refreshPrices(true)) BT.render();
    };
    auto();
    setInterval(() => { if (BT.marketStatus().open) auto(); }, 15 * 60000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  };
})();
