/* BRVM Tracker Joe — vues marché, fiche titre, alertes, outils. */
(function () {
  const V = BT.views;
  const e = BT.esc;

  const histVals = (t, n) => Object.entries(BT.state.history[t] || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-(n || 30)).map((x) => x[1]);

  /* ================= Marché ================= */
  V.marche = function (root) {
    const st = BT.state;
    const f = st.ui && st.ui.mkt || { sort: 't' };
    const held = new Set(BT.summary('all').open.map((p) => p.t));
    const all = BT.stocks();
    const q = (f.q || '').toLowerCase();
    let list = all.filter((s) => (!f.sector || s.s === f.sector) && (!f.country || s.c === f.country) && (!f.watch || st.watchlist.includes(s.t)) && (!f.held || held.has(s.t)) && (!q || s.t.toLowerCase().includes(q) || s.n.toLowerCase().includes(q)));
    const sorters = { t: (a, b) => a.t.localeCompare(b.t), change: (a, b) => b.change - a.change, yield: (a, b) => b.yield - a.yield, price: (a, b) => b.price - a.price, volume: (a, b) => b.volume - a.volume };
    list.sort(sorters[f.sort] || sorters.t);
    const live = all.filter((s) => s.live && s.change != null);
    const up = live.filter((s) => s.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);
    const down = live.filter((s) => s.change < 0).sort((a, b) => a.change - b.change).slice(0, 5);
    const nUp = live.filter((s) => s.change > 0).length, nDown = live.filter((s) => s.change < 0).length;
    const sectors = [...new Set(all.map((s) => s.s))].sort();
    const secStats = sectors.map((sec) => { const xs = live.filter((s) => s.s === sec); return { sec, n: xs.length, avg: xs.length ? xs.reduce((a, s) => a + s.change, 0) / xs.length : 0 }; }).filter((x) => x.n);
    root.innerHTML = `
      <div class="page-head"><h1>Marché BRVM <small class="muted">${all.length} valeurs</small></h1>
        <div class="row-gap"><button class="btn" id="paste">✎ Saisir des cours</button><button class="btn primary" id="refresh">⟳ Actualiser</button></div></div>
      <p class="muted small">${BT.marketStatus().label} · ${live.length ? `${live.length} cours en ligne mis à jour ${BT.ago(st.lastFetch)} · ${nUp} en hausse, ${nDown} en baisse` : 'Cours de référence indicatifs : actualisez ou saisissez les cours du jour.'}</p>
      ${live.length ? `<section class="grid3 movers">
        <div class="card"><h2>Plus fortes hausses</h2><table class="tbl compact">${up.length ? '' : '<tr><td class="muted">Aucune hausse</td></tr>'}${up.map((s) => `<tr data-go="${s.t}"><td><b>${s.t}</b></td><td class="num">${BT.fmt(s.price)}</td><td class="num pos">${BT.pct(s.change)}</td></tr>`).join('')}</table></div>
        <div class="card"><h2>Plus fortes baisses</h2><table class="tbl compact">${down.length ? '' : '<tr><td class="muted">Aucune baisse</td></tr>'}${down.map((s) => `<tr data-go="${s.t}"><td><b>${s.t}</b></td><td class="num">${BT.fmt(s.price)}</td><td class="num neg">${BT.pct(s.change)}</td></tr>`).join('')}</table></div>
        <div class="card"><h2>Secteurs (moyenne du jour)</h2><table class="tbl compact">${secStats.map((x) => `<tr><td>${e(x.sec)}</td><td class="num ${BT.cls(x.avg)}">${BT.pct(x.avg)}</td></tr>`).join('')}</table></div>
      </section>` : ''}
      <div class="card filters">
        <input type="search" id="m-q" placeholder="Rechercher un titre…" value="${e(f.q || '')}">
        <select id="m-sector"><option value="">Tous secteurs</option>${sectors.map((s) => `<option ${f.sector === s ? 'selected' : ''}>${e(s)}</option>`).join('')}</select>
        <select id="m-country"><option value="">Tous pays</option>${Object.entries(BT.COUNTRIES).map(([k, v]) => `<option value="${k}" ${f.country === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select id="m-sort">${[['t', 'Code'], ['change', 'Variation'], ['yield', 'Rendement'], ['price', 'Cours'], ['volume', 'Volume']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>Tri : ${l}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="m-watch" ${f.watch ? 'checked' : ''}> ★ Favoris</label>
        <label class="check"><input type="checkbox" id="m-held" ${f.held ? 'checked' : ''}> Détenus</label>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl market">
        <thead><tr><th></th><th>Titre</th><th class="hide-m">Secteur</th><th class="hide-m">Pays</th><th class="num">Cours</th><th class="num">Var.</th><th class="num hide-m">Volume</th><th class="num">Div. brut</th><th class="num">Rdt</th><th class="hide-m">Tendance</th></tr></thead>
        <tbody>${list.map((s) => `<tr data-go="${s.t}" class="${held.has(s.t) ? 'held' : ''}">
          <td><button class="star ${st.watchlist.includes(s.t) ? 'on' : ''}" data-star="${s.t}" aria-label="Favori">★</button></td>
          <td><b>${s.t}</b>${held.has(s.t) ? ' <span class="tag t-depot">détenu</span>' : ''}<small class="muted block">${e(s.n)}</small></td>
          <td class="hide-m small">${e(s.s)}</td><td class="hide-m">${s.c}</td>
          <td class="num"><b>${BT.fmt(s.price)}</b>${s.live ? '' : '<sup title="' + e(s.source) + '">*</sup>'}</td>
          <td class="num ${BT.cls(s.change)}">${s.source === 'référence' ? '—' : BT.pct(s.change)}</td><td class="num hide-m">${s.volume ? BT.fmt(s.volume) : '—'}</td>
          <td class="num">${s.d ? BT.fmt(s.d) : '—'}</td><td class="num">${s.yield ? BT.pct(s.yield).replace('+', '') : '—'}</td>
          <td class="hide-m">${BT.sparkline(histVals(s.t))}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">* cours de référence ou saisi à la main. Rendement = dernier dividende brut / cours. Les dividendes de référence sont indicatifs : vérifiez-les et corrigez-les dans la fiche du titre.</p></div>`;
    const setF = (k, v) => { st.ui = Object.assign(st.ui || {}, { mkt: Object.assign({}, f, { [k]: v }) }); BT.save(); BT.render(); };
    BT.$('#m-q').oninput = (ev) => { clearTimeout(V._mq); V._mq = setTimeout(() => { setF('q', ev.target.value); const i = BT.$('#m-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    BT.$('#m-sector').onchange = (ev) => setF('sector', ev.target.value);
    BT.$('#m-country').onchange = (ev) => setF('country', ev.target.value);
    BT.$('#m-sort').onchange = (ev) => setF('sort', ev.target.value);
    BT.$('#m-watch').onchange = (ev) => setF('watch', ev.target.checked);
    BT.$('#m-held').onchange = (ev) => setF('held', ev.target.checked);
    BT.$('#refresh').onclick = async () => { await BT.refreshPrices(); BT.render(); };
    BT.$('#paste').onclick = pasteForm;
    BT.$$('[data-star]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); toggleWatch(b.dataset.star); BT.render(); });
    BT.$$('[data-go]', root).forEach((r) => r.addEventListener('click', (ev) => { if (ev.target.closest('button')) return; location.hash = '#/titre/' + r.dataset.go; }));
  };

  function toggleWatch(t) {
    const w = BT.state.watchlist;
    const i = w.indexOf(t);
    if (i >= 0) w.splice(i, 1); else w.push(t);
    BT.save();
  }

  function pasteForm() {
    BT.modal('Saisir ou coller des cours', `<form class="form" id="pf">
      <p class="small muted">Une valeur par ligne : <code>CODE cours [cours de la veille]</code>. Vous pouvez coller directement un extrait du Bulletin Officiel de la Cote (BOC) ou d'un site de cotation : les codes reconnus sont repérés automatiquement.</p>
      <textarea name="txt" rows="10" placeholder="SNTS 25 500 25 000&#10;ORAC 15 100&#10;SGBC 28 300"></textarea>
      <label>Date des cours<input type="date" name="date" value="${BT.today()}"></label>
      <div class="row-end"><button class="btn primary">Enregistrer</button></div></form>`, (b) => {
      const f = b.querySelector('#pf');
      f.onsubmit = (ev) => { ev.preventDefault(); const n = BT.parsePastedPrices(f.txt.value, f.date.value); BT.toast(n ? `${n} cours enregistrés.` : 'Aucun code BRVM reconnu.', n ? 'ok' : 'err'); if (n) { BT.closeModal(); BT.render(); } };
    });
  }

  /* ================= Fiche titre ================= */
  V.titre = function (root, args) {
    const st = BT.state;
    const t = BT.normTicker(args[0]);
    const s = BT.stock(t);
    if (!s) { root.innerHTML = `<div class="card"><p>Titre « ${e(t)} » inconnu.</p><a href="#/marche" class="link">← Marché</a></div>`; return; }
    const sm = BT.summary(st.currentPid);
    const p = sm.positions.find((x) => x.t === t);
    const txs = BT.txFor(st.currentPid).filter((x) => x.ticker === t);
    const hist = Object.entries(st.history[t] || {}).sort((a, b) => a[0].localeCompare(b[0]));
    const alerts = st.alerts.filter((a) => a.ticker === t);
    const lo = s.prev * (1 - BT.MAX_DAILY_MOVE / 100), hi = s.prev * (1 + BT.MAX_DAILY_MOVE / 100);
    const hv = hist.map((h) => h[1]);
    root.innerHTML = `
      <a href="#/marche" class="link">← Marché</a>
      <div class="page-head stock-head">
        <div><h1>${t} <button class="star big ${st.watchlist.includes(t) ? 'on' : ''}" id="star">★</button></h1><div class="muted">${e(s.n)} · ${e(s.s)} · ${BT.COUNTRIES[s.c] || s.c}</div></div>
        <div class="price-big"><b>${BT.fmt(s.price)} F</b><span class="${BT.cls(s.change)}">${BT.pct(s.change)}</span><small class="muted">${s.live ? 'mis à jour ' + BT.ago(s.ts) : s.source === 'manuel' ? 'saisi à la main' : 'cours de référence'}</small></div>
      </div>
      <div class="row-gap wrap"><button class="btn primary" id="buy">Acheter</button>${p && p.qty ? '<button class="btn" id="sell">Vendre</button>' : ''}<button class="btn" id="div">Dividende reçu</button><button class="btn" id="alert">🔔 Alerte</button><button class="btn" id="edit">✎ Modifier</button></div>
      <section class="kpis small">
        <div class="kpi"><span>Limites du jour (±${String(BT.MAX_DAILY_MOVE).replace('.', ',')} %)</span><b>${BT.fmt(lo)} – ${BT.fmt(hi)}</b></div>
        <div class="kpi"><span>Dividende brut / net</span><b>${BT.fmt(s.d)} / ${BT.fmt(s.netD, 1)} F</b><small>rendement ${BT.pct(s.yield).replace('+', '')}</small></div>
        <div class="kpi"><span>Plus haut / bas relevés</span><b>${hv.length ? BT.fmt(Math.max(...hv)) + ' / ' + BT.fmt(Math.min(...hv)) : '—'}</b><small>${hv.length} relevé(s)</small></div>
        ${s.volume ? `<div class="kpi"><span>Volume du jour</span><b>${BT.fmt(s.volume)}</b><small>${BT.money(s.volume * s.price)}</small></div>` : ''}
      </section>
      ${p && (p.qty || p.realized || p.dividends) ? `<section class="kpis small">
        <div class="kpi"><span>Ma position</span><b>${BT.fmt(p.qty)} titres</b><small>PRU ${BT.fmt(p.pru)} F</small></div>
        <div class="kpi"><span>Valeur</span><b>${BT.money(p.value)}</b><small>${p.weight.toFixed(1).replace('.', ',')} % du portefeuille</small></div>
        <div class="kpi"><span>+/- value latente</span><b class="${BT.cls(p.latent)}">${BT.signed(p.latent)}</b><small class="${BT.cls(p.latent)}">${BT.pct(p.latentPct)}</small></div>
        <div class="kpi"><span>Résultat total</span><b class="${BT.cls(p.totalGain)}">${BT.signed(p.totalGain)}</b><small>réalisé ${BT.signed(p.realized)} · dividendes ${BT.money(p.dividends)}</small></div>
        <div class="kpi"><span>Point mort à la revente</span><b>${p.qty ? BT.fmt(breakEven(p)) + ' F' : '—'}</b><small>frais de vente inclus</small></div>
      </section>` : ''}
      <div class="card"><h2>Historique des cours relevés</h2><div id="ch-stock"></div>
        <p class="muted small">Points : <span class="pos">●</span> achats, <span class="neg">●</span> ventes. L'historique se construit à chaque actualisation ; vous pouvez aussi saisir des cours passés.</p>
        <details><summary>Ajouter / corriger un cours passé</summary><form class="row-gap wrap" id="hf"><input type="date" name="d" value="${BT.today()}" required><input name="p" inputmode="decimal" placeholder="Cours" required><button class="btn">Ajouter</button></form></details>
      </div>
      ${alerts.length ? `<div class="card"><h2>Alertes</h2>${alertsList(alerts)}</div>` : ''}
      <div class="card"><h2>Mes opérations sur ${t}</h2>${txs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th class="num">Qté</th><th class="num">Cours</th><th class="num">Trésorerie</th></tr></thead><tbody>${txs.slice().reverse().map((x) => `<tr data-id="${x.id}"><td>${BT.dateLong(x.date)}</td><td><span class="tag t-${x.type}">${BT.TX_TYPES[x.type].label.split(' /')[0]}</span></td><td class="num">${x.qty ? BT.fmt(x.qty) : ''}</td><td class="num">${x.price ? BT.fmt(x.price, 2) : ''}</td><td class="num ${BT.cls(BT.txCash(x))}">${BT.signed(BT.txCash(x))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune opération.</p>'}</div>`;
    const markers = txs.filter((x) => x.type === 'achat' || x.type === 'vente').map((x) => ({ x: x.date, y: +x.price, color: x.type === 'achat' ? 'var(--pos)' : 'var(--neg)' }));
    const pts = hist.map(([d, v]) => ({ x: d, y: v }));
    for (const m of markers) if (!pts.some((q) => q.x === m.x)) pts.push({ x: m.x, y: m.y });
    const series = [{ name: 'Cours', color: 'var(--accent)', area: true, points: pts, markers }];
    if (p && p.qty) series.push({ name: 'PRU', color: 'var(--warn)', dash: '4 4', width: 1.5, points: pts.map((q) => ({ x: q.x, y: p.pru })) });
    BT.lineChart(BT.$('#ch-stock'), series, { height: 260 });
    BT.$('#star').onclick = () => { toggleWatch(t); BT.render(); };
    BT.$('#buy').onclick = () => BT.txForm(null, { type: 'achat', ticker: t, price: s.price });
    if (BT.$('#sell')) BT.$('#sell').onclick = () => BT.txForm(null, { type: 'vente', ticker: t, qty: p.qty, price: s.price });
    BT.$('#div').onclick = () => BT.txForm(null, { type: 'dividende', ticker: t, qty: p ? p.qty : '', price: Math.round(s.netD * 100) / 100 || '', amount: p && p.qty ? Math.round(p.qty * s.netD) : '' });
    BT.$('#alert').onclick = () => BT.alertForm({ ticker: t, kind: 'above', value: Math.round(s.price * 1.05) });
    BT.$('#edit').onclick = () => stockEdit(s);
    BT.$('#hf').onsubmit = (ev) => { ev.preventDefault(); const f = ev.target; const v = BT.parseNum(f.p.value); if (!(v > 0)) return; (st.history[t] = st.history[t] || {})[f.d.value] = v; if (f.d.value === BT.today()) BT.recordPrice(t, v, { source: 'manuel' }); BT.save(); BT.render(); };
    BT.$$('tr[data-id]', root).forEach((r) => r.onclick = () => BT.txForm(st.transactions.find((x) => x.id === r.dataset.id)));
    bindAlerts(root);
  };

  function breakEven(p) {
    const pf = BT.state.portfolios.find((x) => x.id === BT.state.currentPid) || BT.state.portfolios[0];
    const rate = (pf && pf.feeRate != null ? +pf.feeRate : 1.2) / 100;
    return Math.ceil(p.pru / (1 - rate));
  }

  function stockEdit(s) {
    const st = BT.state;
    BT.modal('Modifier ' + s.t, `<form class="form" id="sf">
      <label>Nom<input name="n" value="${e(s.n)}"></label>
      <div class="grid2"><label>Secteur<input name="s" value="${e(s.s)}" list="secs"><datalist id="secs">${BT.SECTORS.map((x) => `<option>${e(x)}</option>`).join('')}</datalist></label>
      <label>Pays<select name="c">${Object.entries(BT.COUNTRIES).map(([k, v]) => `<option value="${k}" ${k === s.c ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="grid2"><label>Dernier dividende brut / action (F)<input name="d" inputmode="decimal" value="${s.d || 0}"></label>
      <label>Cours actuel (saisie manuelle)<input name="price" inputmode="decimal" value="${s.price}"></label></div>
      <div class="row-end"><button type="button" class="btn" id="sreset">Revenir aux valeurs de référence</button><button class="btn primary">Enregistrer</button></div></form>`, (b) => {
      const f = b.querySelector('#sf');
      b.querySelector('#sreset').onclick = () => { delete st.stockEdits[s.t]; BT.save(); BT.closeModal(); BT.render(); };
      f.onsubmit = (ev) => {
        ev.preventDefault();
        st.stockEdits[s.t] = { n: f.n.value.trim() || s.t, s: f.s.value.trim() || 'Autre', c: f.c.value, d: BT.parseNum(f.d.value) };
        const np = BT.parseNum(f.price.value);
        if (np > 0 && np !== s.price) BT.recordPrice(s.t, np, { prev: s.prev, change: s.prev ? (np / s.prev - 1) * 100 : 0, source: 'manuel' });
        BT.save(); BT.closeModal(); BT.render();
      };
    });
  }

  /* ================= Alertes ================= */
  function alertsList(list) {
    const stocks = Object.fromEntries(BT.stocks().map((s) => [s.t, s]));
    return `<ul class="alerts">${list.map((a) => `<li class="${a.active ? '' : 'off'}"><div><b>${a.ticker}</b> ${BT.ALERT_KINDS[a.kind]} <b>${BT.fmt(+a.value, 2)}</b>${a.repeat ? ' <span class="tag">chaque jour</span>' : ''}
      <div class="small muted">Actuel : ${stocks[a.ticker] ? BT.fmt(stocks[a.ticker].price) + ' F (' + BT.pct(stocks[a.ticker].change) + ')' : '—'}${a.triggeredAt ? ' · déclenchée ' + BT.ago(a.triggeredAt) : ''}${a.note ? ' · ' + e(a.note) : ''}</div></div>
      <div class="row-gap"><button class="mini" data-al-toggle="${a.id}">${a.active ? 'Pause' : 'Réactiver'}</button><button class="mini" data-al-edit="${a.id}">✎</button></div></li>`).join('')}</ul>`;
  }
  function bindAlerts(root) {
    BT.$$('[data-al-toggle]', root).forEach((b) => b.onclick = () => { const a = BT.state.alerts.find((x) => x.id === b.dataset.alToggle); a.active = !a.active; BT.save(); BT.render(); });
    BT.$$('[data-al-edit]', root).forEach((b) => b.onclick = () => BT.alertForm(BT.state.alerts.find((x) => x.id === b.dataset.alEdit)));
  }

  BT.alertForm = function (a) {
    const st = BT.state;
    const isNew = !st.alerts.some((x) => x.id === (a && a.id));
    a = Object.assign({ id: BT.uid(), ticker: '', kind: 'above', value: '', active: true, repeat: false, note: '' }, a || {});
    BT.modal(isNew ? 'Nouvelle alerte' : 'Modifier l\'alerte', `<form class="form" id="af">
      <label>Titre<select name="ticker">${BT.stockOptions(a.ticker, BT.summary('all').open.map((p) => p.t))}</select></label>
      <div class="grid2"><label>Condition<select name="kind">${Object.entries(BT.ALERT_KINDS).map(([k, v]) => `<option value="${k}" ${k === a.kind ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Seuil<input name="value" inputmode="decimal" value="${a.value}" required></label></div>
      <label>Note<input name="note" value="${e(a.note || '')}" placeholder="ex. renforcer sous ce prix"></label>
      <label class="check"><input type="checkbox" name="repeat" ${a.repeat ? 'checked' : ''}> Répéter (au plus une fois par jour)</label>
      <div class="row-end">${isNew ? '' : '<button type="button" class="btn danger" id="adel">Supprimer</button><span class="grow"></span>'}<button class="btn primary">Enregistrer</button></div></form>`, (b) => {
      const f = b.querySelector('#af');
      if (b.querySelector('#adel')) b.querySelector('#adel').onclick = () => { st.alerts = st.alerts.filter((x) => x.id !== a.id); BT.save(); BT.closeModal(); BT.render(); };
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const n = Object.assign(a, { ticker: f.ticker.value, kind: f.kind.value, value: BT.parseNum(f.value.value), note: f.note.value.trim(), repeat: f.repeat.checked, active: true, triggeredAt: null, lastDay: null });
        if (isNew) st.alerts.push(n);
        BT.save(); BT.closeModal(); BT.checkAlerts(); BT.render();
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      };
    });
  };

  V.alertes = function (root) {
    const st = BT.state;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    root.innerHTML = `
      <div class="page-head"><h1>Alertes</h1><button class="btn primary" id="add">+ Alerte</button></div>
      <div class="card"><p class="small">Les alertes sont vérifiées à chaque actualisation des cours (automatique toutes les 15 min pendant la séance quand l'application est ouverte). ${perm === 'granted' ? '✅ Notifications du navigateur activées.' : perm === 'unsupported' ? 'Notifications non disponibles sur ce navigateur.' : '<button class="link" id="perm">Activer les notifications du navigateur</button>'}</p>
      <p class="small muted">Pour des alertes même application fermée, votre Worker <code>brvm-prices</code> envoie déjà des signaux Telegram de pré-ouverture.</p></div>
      <div class="card">${st.alerts.length ? alertsList(st.alerts) : '<p class="muted">Aucune alerte. Exemples : SNTS cours ≤ 24 000 pour renforcer, ORAC plus-value ≥ 20 % pour prendre des bénéfices, baisse du jour ≥ 5 %.</p>'}</div>
      ${st.watchlist.length ? `<div class="card"><h2>Favoris</h2><div class="chips">${st.watchlist.map((t) => { const s = BT.stock(t); return s ? `<a class="chip" href="#/titre/${t}"><b>${t}</b> ${BT.fmt(s.price)} <span class="${BT.cls(s.change)}">${BT.pct(s.change)}</span></a>` : ''; }).join('')}</div></div>` : ''}`;
    BT.$('#add').onclick = () => BT.alertForm();
    if (BT.$('#perm')) BT.$('#perm').onclick = async () => { await Notification.requestPermission(); BT.render(); };
    bindAlerts(root);
  };

  /* ================= Outils ================= */
  V.outils = function (root) {
    const st = BT.state;
    const sm = BT.summary(st.currentPid);
    const pf = st.portfolios.find((x) => x.id === st.currentPid) || st.portfolios[0];
    root.innerHTML = `
      <div class="page-head"><h1>Outils & simulateurs</h1></div>
      <section class="grid-main">
        <div class="card"><h2>Calculateur d'ordre</h2>
          <form class="form" id="oc">
            <label>Titre<select name="t">${BT.stockOptions('SNTS', sm.open.map((p) => p.t))}</select></label>
            <div class="grid2"><label>Budget (F)<input name="budget" inputmode="decimal" value="100000"></label><label>Cours limite<input name="price" inputmode="decimal"></label></div>
            <label>Frais globaux (% TTC)<input name="rate" inputmode="decimal" value="${pf.feeRate ?? 1.2}"></label>
          </form><div id="oc-out" class="result"></div></div>
        <div class="card span2"><h2>Simulateur d'investissement régulier</h2>
          <form class="form grid3" id="sim">
            <label>Capital de départ<input name="c0" inputmode="decimal" value="${Math.round(sm.hasDeposits ? sm.total : sm.mv) || 500000}"></label>
            <label>Versement mensuel<input name="m" inputmode="decimal" value="${st.goals.monthly || 50000}"></label>
            <label>Durée (années)<input name="y" inputmode="decimal" value="10"></label>
            <label>Hausse des cours / an (%)<input name="g" inputmode="decimal" value="5"></label>
            <label>Rendement dividende (%)<input name="d" inputmode="decimal" value="${sm.mv ? (sm.income / sm.mv * 100).toFixed(1) : 7}"></label>
            <label class="check"><input type="checkbox" name="re" checked> Réinvestir les dividendes</label>
          </form><div id="sim-ch"></div><div id="sim-out" class="result"></div></div>
        <div class="card"><h2>Objectif de patrimoine</h2>
          <form class="form" id="goal"><label>Montant visé (F)<input id="goal-target" inputmode="text" autocomplete="off" value="${st.goals.target ? BT.fmt(st.goals.target) : ''}" placeholder="ex. 25 000 000 ou 25 millions"></label><label>Versement mensuel prévu (F)<input id="goal-monthly" inputmode="text" autocomplete="off" value="${st.goals.monthly ? BT.fmt(st.goals.monthly) : ''}"></label><button class="btn primary">Enregistrer</button></form>
          <h2 style="margin-top:18px">Revenu passif visé</h2>
          <form class="form" id="pi"><label>Dividendes nets voulus par mois (F)<input name="m" inputmode="decimal" value="100000"></label><label>Rendement net moyen (%)<input name="y" inputmode="decimal" value="7"></label></form><div id="pi-out" class="result"></div></div>
        <div class="card span3"><h2>Rééquilibrage</h2>
          <p class="small muted">Indiquez un poids cible pour chaque titre et la somme à investir : l'outil propose les achats qui rapprochent le portefeuille de vos cibles (sans vendre).</p>
          <div class="row-gap wrap"><label class="inline">Somme à investir (F) <input id="rb-cash" inputmode="decimal" value="${Math.max(0, Math.round(sm.cash)) || 200000}"></label><button class="btn" id="rb-eq">Cibles égales</button></div>
          <div id="rb"></div></div>
      </section>`;
    // calculateur d'ordre
    const oc = BT.$('#oc');
    const ocRun = () => {
      const s = BT.stock(oc.t.value);
      if (!oc.price.value || oc._t !== oc.t.value) { oc.price.value = s.price; oc._t = oc.t.value; }
      const price = BT.parseNum(oc.price.value), budget = BT.parseNum(oc.budget.value), rate = BT.parseNum(oc.rate.value) / 100;
      const qty = price > 0 ? Math.floor(budget / (price * (1 + rate))) : 0;
      const gross = qty * price, fees = Math.round(gross * rate);
      const pru = qty ? (gross + fees) / qty : 0;
      BT.$('#oc-out').innerHTML = qty ? `<div class="bd-row"><span>Titres achetables</span><b>${BT.fmt(qty)}</b></div><div class="bd-row"><span>Montant brut</span><span>${BT.fmt(gross)} F</span></div><div class="bd-row"><span>Frais estimés</span><span>${BT.fmt(fees)} F</span></div><div class="bd-row total"><span>Coût total</span><b>${BT.fmt(gross + fees)} F</b></div><div class="bd-row"><span>Prix de revient unitaire</span><span>${BT.fmt(pru, 2)} F</span></div><div class="bd-row"><span>Revente à l'équilibre</span><b>${BT.fmt(Math.ceil(pru / (1 - rate)))} F</b></div><div class="bd-row"><span>Soit une hausse nécessaire de</span><span>${BT.pct((pru / (1 - rate) / price - 1) * 100)}</span></div><div class="bd-row muted"><span>Limites du jour</span><span>${BT.fmt(s.prev * 0.925)} – ${BT.fmt(s.prev * 1.075)} F</span></div><div class="bd-row muted"><span>Reliquat</span><span>${BT.fmt(budget - gross - fees)} F</span></div>` : '<p class="muted">Budget insuffisant pour un titre.</p>';
    };
    oc.addEventListener('input', ocRun); oc.t.addEventListener('change', ocRun); ocRun();
    // simulateur
    const sim = BT.$('#sim');
    const simRun = () => {
      const c0 = BT.parseNum(sim.c0.value), m = BT.parseNum(sim.m.value), y = Math.min(50, BT.parseNum(sim.y.value)), g = BT.parseNum(sim.g.value) / 100, d = BT.parseNum(sim.d.value) / 100;
      let v = c0, inv = c0, divs = 0;
      const pts = [], ptsInv = [];
      const start = new Date();
      for (let i = 0; i <= y * 12; i++) {
        if (i) { v = v * Math.pow(1 + g, 1 / 12) + m; inv += m; const dm = v * d / 12; divs += dm; if (sim.re.checked) v += dm; }
        if (i % 3 === 0 || i === y * 12) { const dt = new Date(start); dt.setMonth(dt.getMonth() + i); const x = dt.toISOString().slice(0, 10); pts.push({ x, y: v }); ptsInv.push({ x, y: inv }); }
      }
      BT.lineChart(BT.$('#sim-ch'), [{ name: 'Valeur simulée', color: 'var(--accent)', area: true, points: pts }, { name: 'Versements cumulés', color: 'var(--muted)', dash: '5 4', points: ptsInv }], { height: 220 });
      BT.$('#sim-out').innerHTML = `<div class="grid3"><div class="bd-row"><span>Valeur finale</span><b>${BT.money(v)}</b></div><div class="bd-row"><span>Total versé</span><span>${BT.money(inv)}</span></div><div class="bd-row"><span>Gain</span><b class="pos">${BT.signed(v - inv)}</b></div><div class="bd-row"><span>Dividendes cumulés</span><span>${BT.money(divs)}</span></div><div class="bd-row"><span>Dividendes / an à la fin</span><b>${BT.money(v * d)}</b></div><div class="bd-row"><span>Multiplicateur</span><span>× ${(v / Math.max(1, inv)).toFixed(2).replace('.', ',')}</span></div></div><p class="muted small">Projection théorique à rendement constant : les marchés ne progressent pas de façon régulière.</p>`;
    };
    sim.addEventListener('input', simRun); simRun();
    const saveGoal = (notify) => {
      const target = BT.parseAmount(BT.$('#goal-target').value), monthly = BT.parseAmount(BT.$('#goal-monthly').value);
      if (!(target > 0)) { if (notify) BT.toast('Indiquez un montant visé, par exemple 25 000 000.', 'err'); return; }
      st.goals = { target, monthly }; BT.save(true);
      if (notify) BT.toast(`Objectif enregistré : ${BT.fmt(target)} F.`, 'ok');
    };
    BT.$('#goal-target').onchange = BT.$('#goal-monthly').onchange = () => saveGoal(false);
    BT.$('#goal').onsubmit = (ev) => { ev.preventDefault(); saveGoal(true); };
    const pi = BT.$('#pi');
    const piRun = () => { const m = BT.parseNum(pi.m.value), y = BT.parseNum(pi.y.value) / 100; const need = y ? m * 12 / y : 0; const cur = sm.hasDeposits ? sm.total : sm.mv; BT.$('#pi-out').innerHTML = `<div class="bd-row"><span>Capital nécessaire</span><b>${BT.money(need)}</b></div><div class="bd-row"><span>Revenu actuel estimé / mois</span><span>${BT.money(sm.income / 12)}</span></div><div class="bd-row"><span>Progression</span><span>${need ? (Math.min(100, cur / need * 100)).toFixed(0) : 0} %</span></div>`; };
    pi.addEventListener('input', piRun); piRun();
    // rééquilibrage
    const rbRun = () => {
      const cash = BT.parseNum(BT.$('#rb-cash').value);
      const tickers = [...new Set(sm.open.map((p) => p.t).concat(Object.keys(st.targets).filter((t) => st.targets[t] > 0)))];
      const total = sm.mv + cash;
      const rows = tickers.map((t) => { const p = sm.open.find((x) => x.t === t); const s = BT.stock(t); return { t, s, value: p ? p.value : 0, target: +st.targets[t] || 0 }; });
      const sumT = rows.reduce((a, r) => a + r.target, 0);
      let left = cash;
      const rate = (pf.feeRate ?? 1.2) / 100;
      for (const r of rows) r.gap = sumT ? total * r.target / sumT - r.value : 0;
      const need = rows.filter((r) => r.gap > 0).reduce((a, r) => a + r.gap, 0);
      for (const r of rows.sort((a, b) => b.gap - a.gap)) {
        const alloc = r.gap > 0 && need ? Math.min(r.gap, cash * r.gap / need) : 0;
        r.qty = r.s && r.s.price ? Math.floor(Math.min(alloc, left) / (r.s.price * (1 + rate))) : 0;
        left -= r.qty * r.s.price * (1 + rate);
      }
      BT.$('#rb').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Titre</th><th class="num">Poids actuel</th><th class="num">Cible (%)</th><th class="num">Écart</th><th class="num">À acheter</th><th class="num">Montant</th></tr></thead><tbody>${rows.sort((a, b) => a.t.localeCompare(b.t)).map((r) => `<tr><td><b>${r.t}</b></td><td class="num">${total ? (r.value / sm.mv * 100 || 0).toFixed(1).replace('.', ',') : 0} %</td><td class="num"><input class="tgt" data-t="${r.t}" inputmode="decimal" value="${r.target || ''}" size="4"></td><td class="num ${BT.cls(r.gap)}">${sumT ? BT.signed(r.gap) : '—'}</td><td class="num"><b>${r.qty || ''}</b></td><td class="num">${r.qty ? BT.money(r.qty * r.s.price * (1 + rate)) : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="row-gap wrap"><label class="inline">Ajouter un titre <select id="rb-add"><option value="">—</option>${BT.stocks().filter((s) => !tickers.includes(s.t)).map((s) => `<option>${s.t}</option>`).join('')}</select></label><span class="muted small">Total des cibles : ${BT.fmt(sumT, 1)} % · reliquat ${BT.money(left)}</span></div>`;
      BT.$$('.tgt').forEach((i) => i.onchange = () => { st.targets[i.dataset.t] = BT.parseNum(i.value); BT.save(); rbRun(); });
      BT.$('#rb-add').onchange = (ev) => { if (ev.target.value) { st.targets[ev.target.value] = 5; BT.save(); rbRun(); } };
    };
    BT.$('#rb-cash').oninput = rbRun;
    BT.$('#rb-eq').onclick = () => { const ts = sm.open.map((p) => p.t); for (const t of ts) st.targets[t] = +(100 / ts.length).toFixed(2); BT.save(); rbRun(); };
    rbRun();
  };
})();
