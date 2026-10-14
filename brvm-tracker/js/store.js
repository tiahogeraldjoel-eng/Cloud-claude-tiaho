/* BRVM Tracker Joe — état de l'application, sauvegardé dans le navigateur (localStorage). */
(function () {
  const KEY = 'brvm-tracker-joe-v1';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);

  function blank() {
    const pid = uid();
    return {
      version: 1,
      portfolios: [{ id: pid, name: 'Mon portefeuille', parentId: null, sgi: '', feeRate: 1.2, createdAt: today() }],
      currentPid: 'all',
      transactions: [],
      prices: {},        // TICKER → { price, prev, change, volume, ts, source }
      history: {},       // TICKER → { 'AAAA-MM-JJ': cours }
      stockEdits: {},    // TICKER → { d, n, s, c } corrections de l'utilisateur
      customStocks: [],  // titres ajoutés à la main (nouvelles cotations)
      watchlist: [],
      alerts: [],
      dividendCal: [],   // { id, ticker, dpa (brut), exDate, payDate, note }
      targets: {},       // TICKER → poids cible (%)
      goals: { target: 10000000, monthly: 50000 },
      settings: {
        workerUrl: 'https://brvm-prices.tiahogeraldjoel.workers.dev/stocks',
        autoRefresh: true,
        theme: 'auto',
        irvm: Object.assign({}, BT.IRVM_DEFAULT),
        hideAmounts: false,
      },
      lastFetch: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const b = blank();
        for (const k of Object.keys(b)) if (s[k] === undefined) s[k] = b[k];
        s.settings = Object.assign(b.settings, s.settings);
        s.settings.irvm = Object.assign({}, BT.IRVM_DEFAULT, s.settings.irvm);
        if (!s.portfolios.length) s.portfolios = b.portfolios;
        return s;
      }
    } catch (e) { console.warn('Lecture impossible, nouvel état', e); }
    return blank();
  }

  BT.uid = uid;
  BT.today = today;
  BT.state = load();

  let saveTimer = null;
  BT.save = function (now) {
    clearTimeout(saveTimer);
    const write = () => {
      try { localStorage.setItem(KEY, JSON.stringify(BT.state)); }
      catch (e) { BT.toast && BT.toast('Espace de stockage plein : exportez une sauvegarde puis purgez l\'historique des cours.', 'err'); }
    };
    if (now) write(); else saveTimer = setTimeout(write, 150);
  };

  BT.reset = function () { BT.state = blank(); BT.save(true); };

  BT.replaceState = function (s) {
    if (!s || !Array.isArray(s.portfolios) || !Array.isArray(s.transactions)) throw new Error('Fichier de sauvegarde invalide');
    localStorage.setItem(KEY, JSON.stringify(s));
    BT.state = load();
  };

  /* ---- Référentiel des titres (référence + corrections + cours en ligne) ---- */
  BT.stocks = function () {
    const st = BT.state;
    const refSet = new Set(BT.STOCKS_REF.map((r) => r.t));
    const list = BT.STOCKS_REF.map((r) => Object.assign({}, r)).concat(st.customStocks.filter((r) => !refSet.has(r.t)).map((r) => Object.assign({}, r)));
    const known = new Set(list.map((r) => r.t));
    // titres reçus de la source en ligne mais absents du référentiel
    for (const t of Object.keys(st.prices)) if (!known.has(t) && st.prices[t].name) list.push({ t, n: st.prices[t].name, s: 'Autre', c: 'CI', p: st.prices[t].price, d: 0 });
    for (const r of list) {
      Object.assign(r, st.stockEdits[r.t] || {});
      const q = st.prices[r.t];
      r.price = q ? q.price : r.p;
      r.prev = q && q.prev ? q.prev : r.price;
      r.change = q && q.change != null ? q.change : (r.prev ? (r.price / r.prev - 1) * 100 : 0);
      r.volume = q ? q.volume || 0 : 0;
      r.live = !!(q && q.source && q.source !== 'manuel' && q.source !== 'simulated');
      r.source = q ? q.source : 'référence';
      r.ts = q ? q.ts : null;
      r.yield = r.price ? (r.d || 0) / r.price * 100 : 0;
      r.netD = (r.d || 0) * (1 - (st.settings.irvm[r.c] || 0) / 100);
    }
    return list.sort((a, b) => a.t.localeCompare(b.t));
  };

  BT.stock = function (t) { return BT.stocks().find((s) => s.t === t); };

  BT.normTicker = function (raw) {
    if (!raw) return '';
    const t = String(raw).trim().toUpperCase().replace(/\s+/g, '');
    if (BT.TICKER_ALIASES[t]) return BT.TICKER_ALIASES[t];
    return t;
  };

  /* ---- Portefeuilles : un portefeuille parent agrège ses sous-portefeuilles ---- */
  BT.portfolioIds = function (pid) {
    const st = BT.state;
    if (!pid || pid === 'all') return st.portfolios.map((p) => p.id);
    const out = [pid];
    for (let i = 0; i < out.length; i++) for (const p of st.portfolios) if (p.parentId === out[i]) out.push(p.id);
    return out;
  };

  BT.txFor = function (pid) {
    const ids = new Set(BT.portfolioIds(pid || BT.state.currentPid));
    return BT.state.transactions.filter((t) => ids.has(t.pid)).sort((a, b) => a.date.localeCompare(b.date) || (a.seq || 0) - (b.seq || 0));
  };

  BT.portfolioName = function (pid) {
    if (pid === 'all') return 'Tous les portefeuilles';
    const p = BT.state.portfolios.find((x) => x.id === pid);
    return p ? p.name : '?';
  };

  BT.recordPrice = function (t, price, extra) {
    if (!(price > 0)) return;
    const st = BT.state;
    const old = st.prices[t];
    st.prices[t] = Object.assign({ prev: old ? old.prev : null, ts: Date.now() }, extra || {}, { price });
    const d = (extra && extra.date) || today();
    (st.history[t] = st.history[t] || {})[d] = price;
  };
})();
