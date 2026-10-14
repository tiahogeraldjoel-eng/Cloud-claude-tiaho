/* BRVM Tracker Joe — vues du portefeuille : tableau de bord, positions, opérations, dividendes. */
(function () {
  const V = BT.views;
  const e = BT.esc;

  function kpi(label, value, sub, cls, hint) {
    return `<div class="kpi"${hint ? ` title="${e(hint)}"` : ''}><span>${label}</span><b class="${cls || ''}">${value}</b>${sub ? `<small class="${cls || ''}">${sub}</small>` : ''}</div>`;
  }

  function emptyState() {
    return `<div class="card hero">
      <h1>Bienvenue dans votre suivi BRVM</h1>
      <p>Suivez la vraie rentabilité de votre portefeuille BRVM : plus-values nettes de frais, dividendes encaissés, trésorerie séparée des actions, rendement annualisé. Vos données restent dans ce navigateur.</p>
      <div class="hero-actions">
        <button class="btn primary" id="e-add">+ Ajouter ma première opération</button>
        <a class="btn" href="#/import">⇪ Importer mon relevé SGI</a>
        <button class="btn" id="e-demo">Essayer avec un exemple</button>
      </div>
      <ol class="steps"><li><b>Déposez</b> l'argent versé à votre SGI (opération « Dépôt »).</li><li><b>Saisissez</b> vos achats, ventes et dividendes — ou importez le relevé Excel/CSV de votre SGI.</li><li><b>Actualisez</b> les cours (⟳) : le tableau de bord calcule tout.</li></ol>
    </div>`;
  }

  /* ================= Tableau de bord ================= */
  V[''] = function (root) {
    const st = BT.state;
    const sm = BT.summary(st.currentPid);
    if (!sm.txs.length) {
      root.innerHTML = emptyState();
      BT.$('#e-add').onclick = () => BT.txForm();
      BT.$('#e-demo').onclick = () => { BT.loadDemo(); BT.render(); };
      return;
    }
    const period = st.ui && st.ui.period || 'all';
    const xirrNote = sm.txs.length && (Date.now() - new Date(sm.txs[0].date)) < 365 * 86400000 ? ' (moins d\'un an : indicatif)' : '';
    const goal = st.goals.target || 0;
    const prog = goal ? Math.min(100, sm.total / goal * 100) : 0;
    const best = sm.open.slice().sort((a, b) => b.latentPct - a.latentPct);
    const movers = sm.open.filter((p) => p.stock.change).slice().sort((a, b) => Math.abs(b.stock.change) - Math.abs(a.stock.change)).slice(0, 5);
    const parts = [
      ['Plus-values latentes', sm.latent], ['Plus-values réalisées', sm.r.realized], ['Dividendes nets', sm.r.dividends],
      ['Intérêts', sm.r.interest], ['Autres frais', -sm.r.otherFees],
    ].filter((x) => Math.abs(x[1]) > 0.5);
    root.innerHTML = `
      ${sm.r.warnings.length ? `<div class="card warn-box">${sm.r.warnings.slice(0, 4).map((w) => `<div>⚠ ${e(w)}</div>`).join('')}</div>` : ''}
      <section class="kpis">
        ${kpi('Valeur totale', BT.money(sm.hasDeposits ? sm.total : sm.mv), sm.hasDeposits ? `Actions ${BT.short(sm.mv)} · Trésorerie ${BT.short(sm.cash)}` : 'Valeur des actions', '', 'Actions au dernier cours + trésorerie disponible chez la SGI')}
        ${kpi('Gain total', BT.signed(sm.gain), BT.pct(sm.gainPct) + (sm.hasDeposits ? ' des apports' : ' du capital investi'), BT.cls(sm.gain), 'Plus-values latentes et réalisées + dividendes + intérêts − frais')}
        ${kpi('Rendement annualisé', sm.xirr == null ? '—' : BT.pct(sm.xirr), 'XIRR' + xirrNote, BT.cls(sm.xirr || 0), 'Taux de rendement interne tenant compte des dates de chaque versement')}
        ${kpi('Variation du jour', BT.signed(sm.dayChange), BT.pct(sm.dayPct), BT.cls(sm.dayChange))}
        ${kpi(sm.hasDeposits ? 'Apports nets' : 'Capital investi', BT.money(sm.hasDeposits ? sm.netContrib : sm.base), sm.hasDeposits ? 'Dépôts − retraits' : 'Somme des achats', '')}
        ${kpi('Dividendes / an (estimés)', BT.money(sm.income), sm.mv ? 'Rendement ' + BT.pct(sm.income / sm.mv * 100).replace('+', '') : '', '', 'Nombre de titres × dernier dividende net d\'IRVM')}
      </section>
      <section class="grid-main">
        <div class="card span2">
          <div class="card-head"><h2>Évolution du portefeuille</h2>
            <div class="seg small" id="period">${[['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1A'], ['ytd', 'Cette année'], ['all', 'Tout']].map(([k, l]) => `<button data-p="${k}" class="${k === period ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <div id="ch-value"></div>
          <p class="muted small">La courbe utilise les cours relevés à chaque actualisation et les cours de vos opérations ; elle s'affine au fil des jours.</p>
        </div>
        <div class="card">
          <div class="card-head"><h2>Répartition</h2><div class="seg small" id="alloc">${[['t', 'Titres'], ['s', 'Secteurs'], ['c', 'Pays'], ['k', 'Classes']].map(([k, l], i) => `<button data-a="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <div id="ch-alloc"></div>
        </div>
        <div class="card">
          <h2>D'où vient le gain ?</h2>
          <div class="breakdown">${parts.map(([l, v]) => `<div class="bd-row"><span>${l}</span><b class="${BT.cls(v)}">${BT.signed(v)}</b></div>`).join('')}
            <div class="bd-row total"><span>Gain total</span><b class="${BT.cls(sm.gain)}">${BT.signed(sm.gain)}</b></div>
            <div class="bd-row muted"><span>dont frais de courtage payés</span><span>${BT.money(sm.r.tradeFees)}</span></div></div>
        </div>
        <div class="card">
          <h2>Objectif de patrimoine</h2>
          <div class="goal"><div class="goal-bar"><i style="width:${prog}%"></i></div><div class="row-between"><b>${BT.money(sm.hasDeposits ? sm.total : sm.mv)}</b><span class="muted">sur ${BT.money(goal)} · ${prog.toFixed(0)} %</span></div></div>
          <p class="muted small">${goalText(sm, goal)}</p>
          <a href="#/outils" class="link">Modifier l'objectif →</a>
        </div>
        <div class="card">
          <h2>Mouvements du jour</h2>
          ${movers.length ? `<table class="tbl compact">${movers.map((p) => `<tr data-go="${p.t}"><td><b>${p.t}</b></td><td class="num ${BT.cls(p.stock.change)}">${BT.pct(p.stock.change)}</td><td class="num ${BT.cls(p.day)}">${BT.signed(p.day)}</td></tr>`).join('')}</table>` : '<p class="muted">Aucune variation (actualisez les cours).</p>'}
        </div>
        <div class="card span2">
          <div class="card-head"><h2>Positions principales</h2><a class="link" href="#/positions">Tout voir →</a></div>
          ${positionsTable(sm.open.slice(0, 8), sm, true)}
        </div>
        <div class="card">
          <h2>Meilleures / moins bonnes</h2>
          <table class="tbl compact">${best.slice(0, 3).concat(best.length > 3 ? best.slice(-Math.min(3, best.length - 3)) : []).map((p) => `<tr data-go="${p.t}"><td><b>${p.t}</b></td><td class="num ${BT.cls(p.latent)}">${BT.pct(p.latentPct)}</td><td class="num ${BT.cls(p.latent)}">${BT.signed(p.latent)}</td></tr>`).join('')}</table>
        </div>
      </section>`;
    drawValue(period);
    drawAlloc('t', sm);
    BT.$$('#period button').forEach((b) => b.onclick = () => { st.ui = Object.assign(st.ui || {}, { period: b.dataset.p }); BT.save(); BT.$$('#period button').forEach((x) => x.classList.toggle('on', x === b)); drawValue(b.dataset.p); });
    BT.$$('#alloc button').forEach((b) => b.onclick = () => { BT.$$('#alloc button').forEach((x) => x.classList.toggle('on', x === b)); drawAlloc(b.dataset.a, sm); });
    bindGo(root);
  };

  function goalText(sm, goal) {
    const cur = sm.hasDeposits ? sm.total : sm.mv;
    const m = BT.state.goals.monthly || 0;
    if (!goal || cur >= goal) return cur >= goal && goal ? '🎉 Objectif atteint !' : '';
    const r = Math.max(0, (sm.xirr != null ? Math.min(sm.xirr, 20) : 8)) / 100 / 12;
    let v = cur, n = 0;
    while (v < goal && n < 600) { v = v * (1 + r) + m; n++; }
    return n >= 600 ? 'Augmentez vos versements mensuels pour atteindre l\'objectif.' : `À ${BT.money(m)}/mois et ${(r * 1200).toFixed(1).replace('.', ',')} %/an, objectif atteint dans environ ${n >= 24 ? (n / 12).toFixed(1).replace('.', ',') + ' ans' : n + ' mois'}.`;
  }

  function drawValue(period) {
    const host = BT.$('#ch-value');
    if (!host) return;
    let pts = BT.valueHistory(BT.state.currentPid);
    const now = new Date();
    const from = { '1m': 30, '3m': 91, '6m': 182, '1y': 365 }[period];
    if (from) { const d = new Date(now - from * 86400000).toISOString().slice(0, 10); pts = pts.filter((p) => p.date >= d); }
    if (period === 'ytd') pts = pts.filter((p) => p.date >= now.getFullYear() + '-01-01');
    BT.lineChart(host, [
      { name: 'Valeur', color: 'var(--accent)', area: true, points: pts.map((p) => ({ x: p.date, y: p.value })) },
      { name: BT.txFor(BT.state.currentPid).some((t) => t.type === 'depot') ? 'Apports nets' : 'Capital investi', color: 'var(--muted)', dash: '5 4', width: 1.5, points: pts.map((p) => ({ x: p.date, y: p.contrib })) },
    ], { height: 270 });
  }

  function drawAlloc(kind, sm) {
    const host = BT.$('#ch-alloc');
    const groups = {};
    const key = { t: (p) => p.t, s: (p) => p.stock.s, c: (p) => BT.COUNTRIES[p.stock.c] || p.stock.c, k: () => 'Actions' }[kind];
    for (const p of sm.open) groups[key(p)] = (groups[key(p)] || 0) + p.value;
    if (kind === 'k' && sm.cash > 0) groups['Trésorerie'] = sm.cash;
    const total = Object.values(groups).reduce((a, b) => a + b, 0);
    BT.donut(host, Object.entries(groups).map(([label, value]) => ({ label, value })), { center: BT.short(total), centerSub: Object.keys(groups).length + (kind === 't' ? ' titres' : '') });
  }

  function bindGo(root) {
    BT.$$('[data-go]', root).forEach((r) => r.addEventListener('click', (ev) => { if (ev.target.closest('button,a,input')) return; location.hash = '#/titre/' + r.dataset.go; }));
  }

  function positionsTable(list, sm, compact) {
    if (!list.length) return '<p class="muted">Aucune position ouverte.</p>';
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Titre</th><th class="num">Qté</th><th class="num">PRU</th><th class="num">Cours</th><th class="num">Var. j</th><th class="num">Valeur</th><th class="num">+/- value latente</th>${compact ? '' : '<th class="num">Réalisé</th><th class="num">Dividendes</th><th class="num">Rdt / coût</th>'}<th class="num">Poids</th>${compact ? '' : '<th></th>'}</tr></thead>
      <tbody>${list.map((p) => `<tr data-go="${p.t}">
        <td><b>${p.t}</b><small class="muted block">${e(p.stock.n)}</small></td>
        <td class="num">${BT.fmt(p.qty)}</td><td class="num">${BT.fmt(p.pru)}</td><td class="num">${BT.fmt(p.price)}${p.stock.live ? '' : '<sup title="Cours de référence ou saisi à la main">*</sup>'}</td>
        <td class="num ${BT.cls(p.stock.change)}">${BT.pct(p.stock.change)}</td>
        <td class="num"><b>${BT.money(p.value)}</b></td>
        <td class="num ${BT.cls(p.latent)}">${BT.signed(p.latent)}<small class="block">${BT.pct(p.latentPct)}</small></td>
        ${compact ? '' : `<td class="num ${BT.cls(p.realized)}">${p.realized ? BT.signed(p.realized) : '—'}</td><td class="num">${p.dividends ? BT.money(p.dividends) : '—'}</td><td class="num">${p.yoc ? BT.pct(p.yoc).replace('+', '') : '—'}</td>`}
        <td class="num"><div class="wbar"><i style="width:${Math.min(100, p.weight)}%"></i></div>${p.weight.toFixed(1).replace('.', ',')} %</td>
        ${compact ? '' : `<td class="actions"><button class="mini" data-buy="${p.t}" title="Acheter">+</button><button class="mini" data-sell="${p.t}" title="Vendre">−</button></td>`}
      </tr>`).join('')}</tbody>
      ${compact ? '' : `<tfoot><tr><td>Total</td><td></td><td></td><td></td><td class="num ${BT.cls(sm.dayChange)}">${BT.pct(sm.dayPct)}</td><td class="num"><b>${BT.money(sm.mv)}</b></td><td class="num ${BT.cls(sm.latent)}">${BT.signed(sm.latent)}<small class="block">${BT.pct(sm.costOpen ? sm.latent / sm.costOpen * 100 : 0)}</small></td><td class="num ${BT.cls(sm.r.realized)}">${BT.signed(sm.r.realized)}</td><td class="num">${BT.money(sm.r.dividends)}</td><td class="num">${sm.costOpen ? BT.pct(sm.income / sm.costOpen * 100).replace('+', '') : ''}</td><td class="num">100 %</td><td></td></tr></tfoot>`}
    </table></div>`;
  }

  /* ================= Positions ================= */
  V.positions = function (root) {
    const st = BT.state;
    const sm = BT.summary(st.currentPid);
    const sortKey = (st.ui && st.ui.posSort) || 'value';
    const sorters = { value: (a, b) => b.value - a.value, latentPct: (a, b) => b.latentPct - a.latentPct, t: (a, b) => a.t.localeCompare(b.t), change: (a, b) => b.stock.change - a.stock.change, yoc: (a, b) => b.yoc - a.yoc };
    const list = sm.open.slice().sort(sorters[sortKey]);
    root.innerHTML = `
      <div class="page-head"><h1>Positions <small class="muted">${e(BT.portfolioName(st.currentPid))}</small></h1>
        <div class="row-gap"><label class="inline">Trier par <select id="ps">${[['value', 'Valeur'], ['latentPct', '+/- value %'], ['change', 'Variation du jour'], ['yoc', 'Rendement sur coût'], ['t', 'Code']].map(([k, l]) => `<option value="${k}" ${k === sortKey ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <button class="btn" id="xl">⇩ Excel</button></div></div>
      <section class="kpis small">
        ${kpi('Valeur des actions', BT.money(sm.mv))}${kpi('Coût d\'acquisition', BT.money(sm.costOpen), 'frais d\'achat inclus')}
        ${kpi('+/- value latente', BT.signed(sm.latent), BT.pct(sm.costOpen ? sm.latent / sm.costOpen * 100 : 0), BT.cls(sm.latent))}
        ${kpi('Trésorerie', BT.money(sm.cash), '', BT.cls(sm.cash < 0 ? -1 : 0))}
      </section>
      <div class="card">${positionsTable(list, sm, false)}<p class="muted small">PRU = prix de revient unitaire, frais d'achat inclus (méthode du coût moyen pondéré). * cours de référence ou saisi : actualisez pour le cours du jour.</p></div>
      ${sm.closed.length ? `<div class="card"><h2>Positions soldées</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Titre</th><th class="num">Plus-value réalisée</th><th class="num">Dividendes reçus</th><th class="num">Résultat total</th></tr></thead><tbody>${sm.closed.map((p) => `<tr data-go="${p.t}"><td><b>${p.t}</b> <small class="muted">${e(p.stock.n)}</small></td><td class="num ${BT.cls(p.realized)}">${BT.signed(p.realized)}</td><td class="num">${BT.money(p.dividends)}</td><td class="num ${BT.cls(p.realized + p.dividends)}"><b>${BT.signed(p.realized + p.dividends)}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    BT.$('#ps').onchange = (ev) => { st.ui = Object.assign(st.ui || {}, { posSort: ev.target.value }); BT.save(); BT.render(); };
    BT.$('#xl').onclick = () => BT.exportExcel(st.currentPid);
    BT.$$('[data-buy]').forEach((b) => b.onclick = () => BT.txForm(null, { type: 'achat', ticker: b.dataset.buy }));
    BT.$$('[data-sell]').forEach((b) => b.onclick = () => { const p = sm.open.find((x) => x.t === b.dataset.sell); BT.txForm(null, { type: 'vente', ticker: b.dataset.sell, qty: p ? p.qty : '', price: p ? p.price : '' }); });
    bindGo(root);
  };

  /* ================= Opérations ================= */
  V.operations = function (root) {
    const st = BT.state;
    const f = st.ui && st.ui.opFilter || {};
    const all = BT.txFor(st.currentPid).slice().reverse();
    const years = [...new Set(all.map((t) => t.date.slice(0, 4)))];
    const tickers = [...new Set(all.map((t) => t.ticker).filter(Boolean))].sort();
    const q = (f.q || '').toLowerCase();
    const list = all.filter((t) => (!f.type || t.type === f.type) && (!f.ticker || t.ticker === f.ticker) && (!f.year || t.date.startsWith(f.year)) && (!q || (t.note || '').toLowerCase().includes(q) || (t.ticker || '').toLowerCase().includes(q)));
    const sum = (type) => list.filter((t) => t.type === type).reduce((a, t) => a + BT.txCash(t), 0);
    root.innerHTML = `
      <div class="page-head"><h1>Opérations <small class="muted">${list.length} / ${all.length}</small></h1>
        <div class="row-gap"><button class="btn" id="csv">⇩ CSV</button><button class="btn primary" id="add">+ Opération</button></div></div>
      <div class="card filters">
        <select id="f-type"><option value="">Tous types</option>${Object.entries(BT.TX_TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <select id="f-ticker"><option value="">Tous titres</option>${tickers.map((t) => `<option ${f.ticker === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select id="f-year"><option value="">Toutes années</option>${years.map((y) => `<option ${f.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <input id="f-q" type="search" placeholder="Rechercher dans les notes…" value="${e(f.q || '')}">
        ${f.type || f.ticker || f.year || f.q ? '<button class="link" id="f-clear">Effacer les filtres</button>' : ''}
      </div>
      <section class="kpis small">
        ${kpi('Achats', BT.money(-sum('achat')))}${kpi('Ventes', BT.money(sum('vente')))}${kpi('Dividendes', BT.money(sum('dividende')))}${kpi('Dépôts − retraits', BT.signed(sum('depot') + sum('retrait')))}
      </section>
      <div class="card">${list.length ? `<div class="tbl-wrap"><table class="tbl ops">
        <thead><tr><th><input type="checkbox" id="sel-all" aria-label="Tout sélectionner"></th><th>Date</th><th>Type</th><th>Titre</th><th class="num">Qté</th><th class="num">Cours</th><th class="num">Frais</th><th class="num">Trésorerie</th><th>Note</th>${st.currentPid === 'all' && st.portfolios.length > 1 ? '<th>Portefeuille</th>' : ''}</tr></thead>
        <tbody>${list.slice(0, st.ui && st.ui.opMore ? 5000 : 300).map((t) => `<tr data-id="${t.id}">
          <td><input type="checkbox" class="sel" value="${t.id}"></td><td class="nowrap">${BT.dateLong(t.date)}</td>
          <td><span class="tag t-${t.type}">${BT.TX_TYPES[t.type].label.split(' /')[0]}</span></td><td><b>${t.ticker || ''}</b></td>
          <td class="num">${t.qty ? BT.fmt(t.qty) : ''}</td><td class="num">${t.price ? BT.fmt(t.price, 2) : ''}</td><td class="num">${t.fees ? BT.fmt(t.fees) : ''}</td>
          <td class="num ${BT.cls(BT.txCash(t))}">${BT.signed(BT.txCash(t))}</td><td class="note">${e(t.note || '')}</td>
          ${st.currentPid === 'all' && st.portfolios.length > 1 ? `<td class="muted">${e(BT.portfolioName(t.pid))}</td>` : ''}</tr>`).join('')}</tbody></table></div>
        ${list.length > 300 && !(st.ui && st.ui.opMore) ? '<button class="btn" id="more">Afficher toutes les opérations</button>' : ''}
        <div class="bulk" id="bulk" hidden><span id="bulk-n"></span><select id="bulk-pf"><option value="">Déplacer vers…</option>${BT.pfOptions('')}</select><span class="bulk-date"><input type="date" id="bulk-date" max="${BT.today()}" aria-label="Nouvelle date"><button class="btn" id="bulk-date-go">Changer la date</button></span><button class="btn danger" id="bulk-del">Supprimer</button></div>`
        : '<p class="muted">Aucune opération. Ajoutez-en une ou importez votre relevé SGI.</p>'}</div>`;
    const setF = (k, v) => { st.ui = Object.assign(st.ui || {}, { opFilter: Object.assign({}, f, { [k]: v }) }); BT.save(); BT.render(); };
    BT.$('#f-type').onchange = (ev) => setF('type', ev.target.value);
    BT.$('#f-ticker').onchange = (ev) => setF('ticker', ev.target.value);
    BT.$('#f-year').onchange = (ev) => setF('year', ev.target.value);
    BT.$('#f-q').onchange = (ev) => setF('q', ev.target.value);
    if (BT.$('#f-clear')) BT.$('#f-clear').onclick = () => { st.ui.opFilter = {}; BT.save(); BT.render(); };
    if (BT.$('#more')) BT.$('#more').onclick = () => { st.ui.opMore = true; BT.render(); };
    BT.$('#add').onclick = () => BT.txForm();
    BT.$('#csv').onclick = () => BT.download(`brvm-operations-${BT.today()}.csv`, BT.toCSV(BT.txRows(list.slice().reverse())), 'text/csv');
    BT.$$('tr[data-id]').forEach((r) => r.addEventListener('click', (ev) => {
      if (ev.target.closest('input')) return;
      BT.txForm(st.transactions.find((t) => t.id === r.dataset.id));
    }));
    const bulk = () => {
      const ids = BT.$$('.sel:checked').map((c) => c.value);
      const b = BT.$('#bulk'); if (!b) return ids;
      b.hidden = !ids.length; BT.$('#bulk-n').textContent = ids.length + ' sélectionnée(s)';
      return ids;
    };
    BT.$$('.sel').forEach((c) => c.onchange = bulk);
    if (BT.$('#sel-all')) BT.$('#sel-all').onchange = (ev) => { BT.$$('.sel').forEach((c) => { c.checked = ev.target.checked; }); bulk(); };
    if (BT.$('#bulk-del')) BT.$('#bulk-del').onclick = () => { const ids = new Set(bulk()); BT.confirm(`Supprimer ${ids.size} opération(s) ?`, () => { st.transactions = st.transactions.filter((t) => !ids.has(t.id)); BT.save(); BT.render(); }); };
    if (BT.$('#bulk-date-go')) BT.$('#bulk-date-go').onclick = () => {
      const ids = new Set(bulk()), d = BT.$('#bulk-date').value;
      if (!BT.validDate(d)) return BT.toast('Choisissez une date complète entre 1998 et aujourd\'hui.', 'err');
      st.transactions.forEach((t) => { if (ids.has(t.id)) t.date = d; });
      BT.save(); BT.render(); BT.toast(`${ids.size} opération(s) datée(s) du ${BT.dateLong(d)}.`, 'ok');
    };
    if (BT.$('#bulk-pf')) BT.$('#bulk-pf').onchange = (ev) => { const ids = new Set(bulk()); if (!ev.target.value) return; st.transactions.forEach((t) => { if (ids.has(t.id)) t.pid = ev.target.value; }); BT.save(); BT.render(); BT.toast(ids.size + ' opération(s) déplacée(s).', 'ok'); };
  };

  /* ================= Dividendes ================= */
  V.dividendes = function (root) {
    const st = BT.state;
    const sm = BT.summary(st.currentPid);
    const by = BT.dividendsByYear(st.currentPid);
    const years = Object.keys(by).sort();
    const y = String(new Date().getFullYear());
    const cal = st.dividendCal.slice().sort((a, b) => (a.payDate || a.exDate || '').localeCompare(b.payDate || b.exDate || ''));
    const upcoming = cal.filter((c) => (c.payDate || c.exDate || '9999') >= BT.today());
    const held = Object.fromEntries(sm.open.map((p) => [p.t, p]));
    root.innerHTML = `
      <div class="page-head"><h1>Dividendes</h1><button class="btn primary" id="add-cal">+ Annonce de dividende</button></div>
      <section class="kpis">
        ${kpi('Reçus en ' + y, BT.money(by[y] ? by[y].total : 0))}
        ${kpi('Total reçus', BT.money(sm.r.dividends), years.length ? 'depuis ' + years[0] : '')}
        ${kpi('Revenu annuel estimé', BT.money(sm.income), 'net d\'IRVM, positions actuelles')}
        ${kpi('Rendement sur coût', sm.costOpen ? BT.pct(sm.income / sm.costOpen * 100).replace('+', '') : '—', 'revenu estimé / prix de revient')}
        ${kpi('Rendement au cours', sm.mv ? BT.pct(sm.income / sm.mv * 100).replace('+', '') : '—')}
      </section>
      <section class="grid-main">
        <div class="card span2"><h2>Dividendes encaissés par année</h2><div id="ch-div"></div></div>
        <div class="card"><h2>Prochains versements</h2>
          ${upcoming.length ? `<ul class="cal">${upcoming.map((c) => calItem(c, held)).join('')}</ul>` : '<p class="muted">Aucune annonce enregistrée. Ajoutez les dividendes annoncés (AG, date de détachement, date de paiement) pour les voir ici.</p>'}
        </div>
        <div class="card span3"><h2>Projection par position</h2><div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Titre</th><th class="num">Qté</th><th class="num">Dividende brut</th><th class="num">IRVM</th><th class="num">Net / action</th><th class="num">Revenu net</th><th class="num">Rdt au cours</th><th class="num">Rdt sur PRU</th><th class="num">Déjà reçus</th></tr></thead>
          <tbody>${sm.open.slice().sort((a, b) => b.income - a.income).map((p) => `<tr data-go="${p.t}"><td><b>${p.t}</b> <small class="muted">${e(p.stock.n)}</small></td><td class="num">${BT.fmt(p.qty)}</td><td class="num">${BT.fmt(p.stock.d)}</td><td class="num">${st.settings.irvm[p.stock.c] ?? 0} %</td><td class="num">${BT.fmt(p.stock.netD, 1)}</td><td class="num"><b>${BT.money(p.income)}</b></td><td class="num">${BT.pct(p.stock.yield).replace('+', '')}</td><td class="num">${BT.pct(p.yoc).replace('+', '')}</td><td class="num">${BT.money(p.dividends)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td></td><td></td><td></td><td></td><td class="num"><b>${BT.money(sm.income)}</b></td><td></td><td></td><td class="num">${BT.money(sm.r.dividends)}</td></tr></tfoot></table></div>
          <p class="muted small">Dividendes bruts de référence modifiables dans la fiche de chaque titre (Marché → titre → « Modifier »). Taux d'IRVM par pays modifiables dans Paramètres.</p></div>
        ${cal.length ? `<div class="card span3"><h2>Toutes les annonces</h2><ul class="cal">${cal.map((c) => calItem(c, held)).join('')}</ul></div>` : ''}
      </section>`;
    BT.barChart(BT.$('#ch-div'), years.map((yy) => ({ label: yy, value: by[yy].total })), { values: true, color: 'var(--pos)' });
    BT.$('#add-cal').onclick = () => calForm();
    BT.$$('[data-cal-edit]').forEach((b) => b.onclick = () => calForm(st.dividendCal.find((c) => c.id === b.dataset.calEdit)));
    BT.$$('[data-cal-book]').forEach((b) => b.onclick = () => {
      const c = st.dividendCal.find((x) => x.id === b.dataset.calBook);
      const s = BT.stock(c.ticker);
      const r = BT.replay(BT.txFor(st.currentPid), c.exDate ? prevDay(c.exDate) : undefined);
      const q = r.pos[c.ticker] ? r.pos[c.ticker].qty : 0;
      const net = c.dpa * (1 - (st.settings.irvm[s ? s.c : 'CI'] || 0) / 100);
      BT.txForm(null, { type: 'dividende', ticker: c.ticker, date: c.payDate || BT.today(), qty: q || '', price: Math.round(net * 100) / 100, amount: q ? Math.round(q * net) : '', note: 'Dividende ' + (c.year || '') });
    });
    bindGo(root);
  };

  const prevDay = (d) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

  function calItem(c, held) {
    const s = BT.stock(c.ticker) || { n: c.ticker, c: 'CI' };
    const net = c.dpa * (1 - (BT.state.settings.irvm[s.c] || 0) / 100);
    const p = held[c.ticker];
    return `<li><div><b>${c.ticker}</b> <small class="muted">${e(s.n)}</small><div class="small">Brut ${BT.fmt(c.dpa)} F → net ${BT.fmt(net, 1)} F${c.exDate ? ` · détachement ${BT.dateLong(c.exDate)}` : ''}${c.payDate ? ` · paiement ${BT.dateLong(c.payDate)}` : ''}</div>${p ? `<div class="small pos">Vous recevrez ≈ ${BT.money(p.qty * net)} (${BT.fmt(p.qty)} titres)</div>` : ''}</div>
      <div class="row-gap">${p ? `<button class="mini" data-cal-book="${c.id}" title="Enregistrer l'encaissement">✓ Encaissé</button>` : ''}<button class="mini" data-cal-edit="${c.id}">✎</button></div></li>`;
  }

  function calForm(c) {
    const st = BT.state;
    c = c || { id: BT.uid(), ticker: '', dpa: '', exDate: '', payDate: '', year: String(new Date().getFullYear() - 1) };
    BT.modal(c.dpa ? 'Modifier l\'annonce' : 'Annonce de dividende', `<form class="form" id="cf">
      <label>Titre<select name="ticker">${BT.stockOptions(c.ticker, BT.summary('all').open.map((p) => p.t))}</select></label>
      <div class="grid2"><label>Dividende brut / action (F)<input name="dpa" inputmode="decimal" value="${c.dpa}" required></label><label>Exercice<input name="year" value="${e(c.year || '')}"></label></div>
      <div class="grid2"><label>Date de détachement<input type="date" name="exDate" value="${c.exDate || ''}"></label><label>Date de paiement<input type="date" name="payDate" value="${c.payDate || ''}"></label></div>
      <label class="check"><input type="checkbox" name="upd" checked> Mettre à jour le dividende de référence du titre</label>
      <div class="row-end">${st.dividendCal.some((x) => x.id === c.id) ? '<button type="button" class="btn danger" id="cdel">Supprimer</button><span class="grow"></span>' : ''}<button class="btn primary">Enregistrer</button></div></form>`, (b) => {
      const f = b.querySelector('#cf');
      if (b.querySelector('#cdel')) b.querySelector('#cdel').onclick = () => { st.dividendCal = st.dividendCal.filter((x) => x.id !== c.id); BT.save(); BT.closeModal(); BT.render(); };
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const n = { id: c.id, ticker: f.ticker.value, dpa: BT.parseNum(f.dpa.value), year: f.year.value, exDate: f.exDate.value, payDate: f.payDate.value };
        if (!(n.dpa > 0)) return BT.toast('Montant invalide', 'err');
        const i = st.dividendCal.findIndex((x) => x.id === c.id);
        if (i >= 0) st.dividendCal[i] = n; else st.dividendCal.push(n);
        if (f.upd.checked) st.stockEdits[n.ticker] = Object.assign(st.stockEdits[n.ticker] || {}, { d: n.dpa });
        BT.save(); BT.closeModal(); BT.render();
      };
    });
  }

  /* ================= Données d'exemple ================= */
  BT.loadDemo = function () {
    const st = BT.state;
    const pid = BT.uid();
    st.portfolios.push({ id: pid, name: 'Exemple (à supprimer)', parentId: null, sgi: 'SGI exemple', feeRate: 1.2, createdAt: BT.today() });
    st.currentPid = pid;
    const d = (m) => { const x = new Date(); x.setMonth(x.getMonth() - m); return x.toISOString().slice(0, 10); };
    const add = (o) => st.transactions.push(Object.assign({ id: BT.uid(), pid, seq: st.transactions.length }, o));
    const ref = (t) => BT.STOCKS_REF.find((s) => s.t === t).p;
    const buy = (m, t, q, k) => { const p = Math.round(ref(t) * k / 5) * 5; add({ date: d(m), type: 'achat', ticker: t, qty: q, price: p, fees: BT.estimateFees(q * p, pid) }); };
    add({ date: d(20), type: 'depot', amount: 1500000, note: 'Versement initial' });
    buy(20, 'SNTS', 30, 0.82); buy(19, 'ORAC', 25, 0.88); buy(18, 'SGBC', 10, 0.8);
    add({ date: d(14), type: 'depot', amount: 600000, note: 'Versement' });
    buy(14, 'TTLC', 100, 0.9); buy(13, 'SIBC', 40, 0.85); buy(12, 'PALC', 30, 1.1);
    add({ date: d(15), type: 'dividende', ticker: 'SNTS', qty: 30, price: 1620, amount: 30 * 1620, note: 'Dividende' });
    add({ date: d(14), type: 'dividende', ticker: 'ORAC', qty: 25, price: 810, amount: 25 * 810, note: 'Dividende' });
    add({ date: d(8), type: 'vente', ticker: 'PALC', qty: 30, price: Math.round(ref('PALC') * 0.95), fees: BT.estimateFees(30 * ref('PALC') * 0.95, pid) });
    add({ date: d(6), type: 'depot', amount: 300000, note: 'Versement' });
    buy(6, 'BOAC', 40, 0.93);
    add({ date: d(3), type: 'dividende', ticker: 'SGBC', qty: 10, price: 1530, amount: 15300, note: 'Dividende' });
    add({ date: d(2), type: 'frais', amount: 6000, note: 'Droits de garde annuels' });
    buy(1, 'SNTS', 10, 0.98);
    BT.save();
    BT.toast('Portefeuille d\'exemple créé : supprimez-le dans Paramètres quand vous voulez.', 'ok', 6000);
  };
})();
