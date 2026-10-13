/* BRVM Tracker Joe — cours : récupération en ligne, saisie collée, alertes. */
(function () {
  // Récupère les cours depuis la source configurée (Worker brvm-prices ou toute URL JSON compatible)
  BT.refreshPrices = async function (silent) {
    const st = BT.state;
    const url = st.settings.workerUrl;
    if (!url) { if (!silent) BT.toast('Aucune source de cours configurée (Paramètres).', 'err'); return false; }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.stocks || data.data || [];
      const real = list.filter((s) => s && s.source !== 'simulated');
      if (!real.length) {
        if (!silent) BT.toast(list.length ? 'La source a renvoyé des cours simulés (BRVM injoignable) : cours non mis à jour.' : 'Réponse vide de la source de cours.', 'err');
        return false;
      }
      let n = 0;
      for (const s of real) {
        const t = BT.normTicker(s.symbol || s.ticker || s.code);
        const price = +(s.price ?? s.close ?? s.cours);
        if (!t || !(price > 0)) continue;
        const prev = +(s.previousPrice ?? s.prev ?? s.reference) || (s.changePercent != null ? price / (1 + s.changePercent / 100) : null);
        BT.recordPrice(t, price, {
          prev, change: s.changePercent != null ? +s.changePercent : prev ? (price / prev - 1) * 100 : 0,
          volume: +(s.volume || 0), source: s.source || 'brvm', name: s.name, ts: s.timestamp || Date.now(),
        });
        n++;
      }
      st.lastFetch = Date.now();
      BT.save();
      BT.checkAlerts();
      if (!silent) BT.toast(`${n} cours mis à jour.`, 'ok');
      return true;
    } catch (e) {
      if (!silent) BT.toast('Cours non récupérés (' + (e.name === 'AbortError' ? 'délai dépassé' : e.message) + '). Vous pouvez les coller à la main dans Marché.', 'err');
      return false;
    }
  };

  // Saisie libre : une valeur par ligne, ex. « SNTS 25 000 » ou « SNTS;25000;24500 » (cours ; cours veille)
  BT.parsePastedPrices = function (text, date) {
    const known = new Set(BT.stocks().map((s) => s.t));
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      const tokens = line.toUpperCase().split(/[\s;,\t|]+/);
      const ti = tokens.findIndex((x) => known.has(BT.normTicker(x)));
      if (ti < 0) continue;
      const rest = line.toUpperCase().split(new RegExp('\\b' + tokens[ti] + '\\b'))[1] || '';
      const nums = (rest.match(/\d{4,}(?:[.,]\d+)?|\d{1,3}(?:[   .]\d{3})*(?:,\d+)?/g) || []).map(BT.parseNum).filter((v) => v > 0);
      if (!nums.length) continue;
      out.push({ t: BT.normTicker(tokens[ti]), price: nums[0], prev: nums[1] && Math.abs(nums[1] / nums[0] - 1) < 0.2 ? nums[1] : null });
    }
    for (const r of out) BT.recordPrice(r.t, r.price, { prev: r.prev, change: r.prev ? (r.price / r.prev - 1) * 100 : 0, source: 'manuel', date });
    if (out.length) { BT.save(); BT.checkAlerts(); }
    return out.length;
  };

  /* ---- Alertes de cours ---- */
  BT.ALERT_KINDS = {
    above: 'Cours ≥', below: 'Cours ≤', up: 'Hausse du jour ≥ (%)', down: 'Baisse du jour ≥ (%)',
    gain: 'Plus-value latente ≥ (%)', loss: 'Moins-value latente ≥ (%)', yield: 'Rendement dividende ≥ (%)',
  };

  BT.checkAlerts = function () {
    const st = BT.state;
    const stocks = Object.fromEntries(BT.stocks().map((s) => [s.t, s]));
    const pos = Object.fromEntries(BT.summary('all').open.map((p) => [p.t, p]));
    const fired = [];
    for (const a of st.alerts) {
      if (!a.active || (a.repeat && a.lastDay === BT.today())) continue;
      const s = stocks[a.ticker];
      if (!s) continue;
      const v = +a.value, p = pos[a.ticker];
      const hit = {
        above: s.price >= v, below: s.price <= v, up: s.change >= v, down: s.change <= -v,
        gain: p && p.latentPct >= v, loss: p && p.latentPct <= -v, yield: s.yield >= v,
      }[a.kind];
      if (hit) {
        a.lastDay = BT.today();
        a.triggeredAt = Date.now();
        if (!a.repeat) a.active = false;
        fired.push(a);
      }
    }
    if (!fired.length) return;
    BT.save();
    for (const a of fired) {
      const s = stocks[a.ticker];
      const msg = `${a.ticker} — ${BT.ALERT_KINDS[a.kind]} ${BT.fmt(+a.value)} atteint (cours ${BT.fmt(s.price)} F, ${BT.pct(s.change)})`;
      BT.toast('🔔 ' + msg, 'warn', 8000);
      try {
        if ('Notification' in window && Notification.permission === 'granted') new Notification('BRVM Tracker Joe', { body: msg, icon: 'icons/icon.svg' });
      } catch (e) { /* notification indisponible */ }
    }
  };
})();
