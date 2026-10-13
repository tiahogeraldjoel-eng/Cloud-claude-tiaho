/* BRVM Tracker Joe — moteur de calcul : positions, PRU, plus-values, trésorerie, XIRR, historique. */
(function () {
  const num = (v) => (v === '' || v == null || isNaN(+v) ? 0 : +v);

  // Montant en trésorerie d'une opération (positif = entrée d'argent sur le compte espèces)
  BT.txCash = function (t) {
    const q = num(t.qty), p = num(t.price), f = num(t.fees), a = num(t.amount);
    switch (t.type) {
      case 'achat': return -(q * p + f);
      case 'vente': return q * p - f;
      case 'dividende': return a || q * p;
      case 'depot': case 'interet': return a;
      case 'retrait': case 'frais': return -Math.abs(a);
      default: return 0;
    }
  };

  function emptyPos(t) { return { t, qty: 0, cost: 0, realized: 0, dividends: 0, fees: 0, invested: 0, first: null, trades: 0 }; }

  // Rejoue les opérations dans l'ordre et renvoie l'état du portefeuille
  BT.replay = function (txs, until) {
    const r = { pos: {}, cash: 0, deposits: 0, withdrawals: 0, realized: 0, dividends: 0, interest: 0, otherFees: 0, tradeFees: 0, warnings: [] };
    for (const t of txs) {
      if (until && t.date > until) break;
      const cash = BT.txCash(t);
      r.cash += cash;
      if (t.type === 'depot') r.deposits += cash;
      else if (t.type === 'retrait') r.withdrawals -= cash;
      else if (t.type === 'interet') r.interest += cash;
      else if (t.type === 'frais') r.otherFees -= cash;
      if (!BT.TX_TYPES[t.type] || !BT.TX_TYPES[t.type].stock) continue;
      const p = r.pos[t.ticker] = r.pos[t.ticker] || emptyPos(t.ticker);
      const q = num(t.qty);
      if (t.type === 'achat') {
        p.qty += q; p.cost += -cash; p.invested += -cash; p.fees += num(t.fees); r.tradeFees += num(t.fees);
        p.first = p.first || t.date; p.trades++;
      } else if (t.type === 'vente') {
        if (q > p.qty + 1e-9 && !until) r.warnings.push(`${t.date} : vente de ${q} ${t.ticker} alors que vous n'en détenez que ${p.qty}.`);
        const sold = Math.min(q, p.qty);
        const pru = p.qty > 0 ? p.cost / p.qty : 0;
        const costOut = pru * sold;
        const gain = cash - costOut;
        p.realized += gain; r.realized += gain;
        p.qty -= sold; p.cost -= costOut; p.fees += num(t.fees); r.tradeFees += num(t.fees); p.trades++;
        if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
      } else if (t.type === 'dividende') {
        p.dividends += cash; r.dividends += cash;
      } else if (t.type === 'split' && q > 0) {
        p.qty *= q; // coût total inchangé → PRU divisé
      }
    }
    for (const p of Object.values(r.pos)) p.pru = p.qty > 0 ? p.cost / p.qty : 0;
    if (!until && r.cash < -1) r.warnings.push(`Trésorerie négative (${BT.fmt(r.cash)} F) : enregistrez vos dépôts pour que la trésorerie et le rendement soient exacts.`);
    return r;
  };

  // Synthèse au cours actuel
  BT.summary = function (pid) {
    const txs = BT.txFor(pid);
    const r = BT.replay(txs);
    const stocks = Object.fromEntries(BT.stocks().map((s) => [s.t, s]));
    const positions = [];
    let mv = 0, dayChange = 0;
    for (const p of Object.values(r.pos)) {
      const s = stocks[p.t] || { t: p.t, n: p.t, price: p.pru, prev: p.pru, s: 'Autre', c: 'CI', d: 0, netD: 0 };
      p.stock = s;
      p.price = s.price;
      p.value = p.qty * s.price;
      p.latent = p.value - p.cost;
      p.latentPct = p.cost ? p.latent / p.cost * 100 : 0;
      p.totalGain = p.latent + p.realized + p.dividends;
      p.day = p.qty * (s.price - (s.prev || s.price));
      p.yoc = p.cost ? p.qty * (s.netD || 0) / p.cost * 100 : 0;
      p.income = p.qty * (s.netD || 0);
      mv += p.value; dayChange += p.day;
      positions.push(p);
    }
    for (const p of positions) p.weight = mv ? p.value / mv * 100 : 0;
    const open = positions.filter((p) => p.qty > 0).sort((a, b) => b.value - a.value);
    const closed = positions.filter((p) => p.qty === 0);
    const netContrib = r.deposits - r.withdrawals;
    const latent = open.reduce((a, p) => a + p.latent, 0);
    const costOpen = open.reduce((a, p) => a + p.cost, 0);
    const total = mv + r.cash;
    const gain = latent + r.realized + r.dividends + r.interest - r.otherFees;
    const hasDeposits = r.deposits > 0;
    // Base de calcul du rendement : apports nets si des dépôts sont saisis, sinon capital investi en actions
    const base = hasDeposits ? netContrib : txs.filter((t) => t.type === 'achat').reduce((a, t) => a - BT.txCash(t), 0);
    const flows = BT.flows(txs, hasDeposits);
    const xirr = flows.length ? BT.xirr(flows.concat([{ date: BT.today(), amount: hasDeposits ? total : mv }])) : null;
    return {
      txs, r, positions, open, closed, mv, cash: r.cash, total, netContrib, latent, costOpen, gain,
      gainPct: base > 0 ? gain / base * 100 : 0, base, hasDeposits,
      dayChange, dayPct: mv - dayChange ? dayChange / (mv - dayChange) * 100 : 0,
      income: open.reduce((a, p) => a + p.income, 0), xirr,
    };
  };

  // Flux externes de l'investisseur (négatif = argent apporté)
  BT.flows = function (txs, hasDeposits) {
    const out = [];
    for (const t of txs) {
      const c = BT.txCash(t);
      if (hasDeposits) {
        if (t.type === 'depot' || t.type === 'retrait') out.push({ date: t.date, amount: -c });
      } else if (t.type === 'achat' || t.type === 'vente' || t.type === 'dividende' || t.type === 'frais' || t.type === 'interet') {
        out.push({ date: t.date, amount: c });
      }
    }
    return out;
  };

  // Taux de rendement interne annualisé (XIRR) en %
  BT.xirr = function (flows) {
    if (flows.length < 2) return null;
    const t0 = new Date(flows[0].date).getTime();
    const yrs = flows.map((f) => (new Date(f.date).getTime() - t0) / 31557600000);
    if (yrs[yrs.length - 1] < 1 / 365) return null;
    const hasNeg = flows.some((f) => f.amount < 0), hasPos = flows.some((f) => f.amount > 0);
    if (!hasNeg || !hasPos) return null;
    const npv = (r) => flows.reduce((a, f, i) => a + f.amount / Math.pow(1 + r, yrs[i]), 0);
    let lo = -0.9999, hi = 10;
    let flo = npv(lo), fhi = npv(hi);
    if (flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = npv(mid);
      if (Math.abs(fm) < 1e-6) { lo = hi = mid; break; }
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    const r = (lo + hi) / 2;
    // sur moins d'un an, l'annualisation exagère : on renvoie quand même mais l'UI le signale
    return r * 100;
  };

  // Cours d'un titre à une date : dernier relevé connu, sinon dernier cours d'opération, sinon cours actuel
  function priceLookup(txs) {
    const st = BT.state;
    const series = {};
    const get = (t) => {
      if (series[t]) return series[t];
      const pts = Object.entries(st.history[t] || {});
      for (const x of txs) if (x.ticker === t && (x.type === 'achat' || x.type === 'vente') && num(x.price) > 0) pts.push([x.date, num(x.price)]);
      pts.sort((a, b) => a[0].localeCompare(b[0]));
      return (series[t] = pts);
    };
    const cur = Object.fromEntries(BT.stocks().map((s) => [s.t, s.price]));
    return function (t, date) {
      const pts = get(t);
      let lo = 0, hi = pts.length - 1, best = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= date) { best = m; lo = m + 1; } else hi = m - 1; }
      if (best >= 0) return pts[best][1];
      return pts.length ? pts[0][1] : cur[t] || 0;
    };
  }

  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  // Évolution de la valeur du portefeuille et des apports nets
  BT.valueHistory = function (pid, maxPoints) {
    const txs = BT.txFor(pid);
    if (!txs.length) return [];
    maxPoints = maxPoints || 240;
    const start = txs[0].date, end = BT.today();
    const span = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000));
    const step = Math.max(1, Math.ceil(span / maxPoints));
    const dates = new Set();
    for (let d = start; d <= end; d = addDays(d, step)) dates.add(d);
    dates.add(end);
    for (const t of txs) dates.add(t.date);
    const sorted = [...dates].sort();
    const px = priceLookup(txs);
    const hasDeposits = txs.some((t) => t.type === 'depot');
    const out = [];
    for (const d of sorted) {
      const r = BT.replay(txs, d);
      let mv = 0;
      for (const p of Object.values(r.pos)) if (p.qty > 0) mv += p.qty * (d === end ? (BT.stock(p.t) || {}).price || px(p.t, d) : px(p.t, d));
      const contrib = hasDeposits ? r.deposits - r.withdrawals : Object.values(r.pos).reduce((a, p) => a + p.cost, 0);
      out.push({ date: d, value: hasDeposits ? mv + r.cash : mv, stocks: mv, cash: r.cash, contrib });
    }
    return out;
  };

  // Dividendes reçus par année
  BT.dividendsByYear = function (pid) {
    const out = {};
    for (const t of BT.txFor(pid)) if (t.type === 'dividende') {
      const y = t.date.slice(0, 4);
      (out[y] = out[y] || { total: 0, items: {} }).total += BT.txCash(t);
      out[y].items[t.ticker] = (out[y].items[t.ticker] || 0) + BT.txCash(t);
    }
    return out;
  };

  // Frais d'une transaction selon le taux global du portefeuille (commission SGI + redevances, TTC)
  BT.estimateFees = function (gross, pid) {
    const p = BT.state.portfolios.find((x) => x.id === pid);
    const rate = p && p.feeRate != null ? +p.feeRate : 1.2;
    return Math.round(gross * rate / 100);
  };
})();
