/* BRVM Tracker Joe — vues import / export, rapport imprimable, paramètres. */
(function () {
  const V = BT.views;
  const e = BT.esc;
  let imp = null; // import en cours : { rows, header, start, map, txs }

  /* ================= Import / Export ================= */
  V.import = function (root) {
    const st = BT.state;
    const pid = st.currentPid !== 'all' ? st.currentPid : st.portfolios[0].id;
    root.innerHTML = `
      <div class="page-head"><h1>Import / Export</h1></div>
      <section class="grid-main">
        <div class="card span2"><h2>1. Importer un relevé (SGI : PDF, Excel, CSV)</h2>
          <p class="small muted">Exportez le relevé de compte titres ou l'historique des opérations depuis l'espace client de votre SGI (PDF, Excel .xlsx ou .csv), puis déposez-le ici. Vous pouvez aussi coller un tableau copié depuis Excel ou une page web. Rien n'est envoyé sur internet.</p>
          <div class="drop" id="drop"><input type="file" id="file" accept=".pdf,.csv,.xlsx,.xlsm,.txt,.tsv,application/pdf"><p><b>Déposez un fichier</b> ou cliquez pour choisir</p><small class="muted">.pdf · .xlsx · .csv · .txt</small></div>
          <details><summary>… ou coller un tableau</summary><textarea id="paste" rows="6" placeholder="Date;Opération;Titre;Quantité;Cours;Montant"></textarea><button class="btn" id="paste-go">Analyser</button></details>
          <p class="small"><button class="link" id="tpl">Télécharger le modèle CSV</button> — colonnes : Date, Type, Titre, Quantité, Cours, Frais, Montant, Note.</p>
          <div id="imp-step"></div>
        </div>
        <div class="card"><h2>Exporter</h2>
          <p class="small muted">${e(BT.portfolioName(st.currentPid))}</p>
          <div class="col-gap">
            <button class="btn" id="x-xlsx">⇩ Classeur Excel complet</button>
            <button class="btn" id="x-csv">⇩ Opérations en CSV</button>
            <a class="btn" href="#/rapport">⎙ Rapport PDF imprimable</a>
            <button class="btn" id="x-json">⇩ Sauvegarde complète (.json)</button>
          </div>
          <p class="small muted">La sauvegarde .json contient tout (portefeuilles, opérations, cours relevés, alertes). Restauration dans Paramètres.</p>
        </div>
      </section>`;
    const file = BT.$('#file'), drop = BT.$('#drop');
    const handle = async (f) => {
      if (/\.pdf$/i.test(f.name)) BT.toast('Lecture du relevé PDF…');
      try { start(await BT.readFile(f), pid); } catch (err) { BT.toast(err.message, 'err', 9000); }
    };
    file.onchange = () => { if (file.files[0]) handle(file.files[0]); file.value = ''; };
    drop.ondragover = (ev) => { ev.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (ev) => { ev.preventDefault(); drop.classList.remove('over'); if (ev.dataTransfer.files[0]) handle(ev.dataTransfer.files[0]); };
    BT.$('#paste-go').onclick = () => { const t = BT.$('#paste').value; if (t.trim()) start(BT.parseCSV(t), pid); };
    BT.$('#tpl').onclick = () => BT.download('modele-import-brvm.csv', BT.toCSV([
      ['Date', 'Type', 'Titre', 'Quantité', 'Cours', 'Frais', 'Montant', 'Note'],
      ['02/01/2025', 'Dépôt', '', '', '', '', 500000, 'Versement initial'],
      ['03/01/2025', 'Achat', 'SNTS', 10, 21000, 2520, '', ''],
      ['15/06/2025', 'Dividende', 'SNTS', 10, '', '', 16200, ''],
      ['20/09/2025', 'Vente', 'SNTS', 5, 25000, 1500, '', ''],
      ['31/12/2025', 'Frais', '', '', '', '', 6000, 'Droits de garde'],
    ]), 'text/csv');
    BT.$('#x-xlsx').onclick = () => BT.exportExcel(st.currentPid);
    BT.$('#x-csv').onclick = () => BT.download(`brvm-operations-${BT.today()}.csv`, BT.toCSV(BT.txRows(BT.txFor(st.currentPid))), 'text/csv');
    BT.$('#x-json').onclick = backup;
    if (imp) (imp.snap ? renderSnapshot : renderMapping)();
  };

  function start(rows, pid) {
    if (rows && rows.kind === 'snapshot') {
      const st = BT.state;
      const empty = (id) => !st.transactions.some((t) => t.pid === id);
      const same = st.portfolios.find((p) => p.sgi && rows.sgi && p.sgi.toLowerCase() === rows.sgi.toLowerCase());
      imp = { snap: rows, pid: same ? same.id : empty(pid) ? pid : '__new', entry: rows.date, savePrices: true };
      return renderSnapshot();
    }
    if (!rows.length) return BT.toast('Fichier vide ou illisible.', 'err');
    const h = BT.findHeader(rows);
    imp = { rows, start: h + 1, header: rows[h].map((c, i) => String(c || '').trim() || 'Colonne ' + (i + 1)), map: BT.guessMapping(rows[h]), pid };
    renderMapping();
  }

  function renderMapping() {
    const host = BT.$('#imp-step');
    if (!host || !imp) return;
    const { header, rows, map } = imp;
    const sample = rows.slice(imp.start, imp.start + 4);
    imp.txs = BT.rowsToTx(rows.slice(imp.start), map, imp.pid);
    const existing = new Set(BT.state.transactions.map(BT.txKey));
    imp.txs.forEach((t) => { t.dup = existing.has(BT.txKey(t)); t.skip = !!(t.dup || t.problem); });
    const ok = imp.txs.filter((t) => !t.skip).length;
    host.innerHTML = `
      <h3>2. Correspondance des colonnes</h3>
      <div class="grid-map">${Object.entries(BT.IMPORT_FIELDS).map(([k, f]) => `<label>${f.label}<select data-map="${k}"><option value="">—</option>${header.map((h, i) => `<option value="${i}" ${map[k] === i ? 'selected' : ''}>${e(h)}</option>`).join('')}</select></label>`).join('')}
        <label>Ligne d'en-tête<input type="number" id="hdr" min="1" max="${rows.length}" value="${imp.start}"></label>
        <label>Portefeuille de destination<select id="imp-pf">${BT.pfOptions(imp.pid)}</select></label></div>
      <div class="tbl-wrap"><table class="tbl compact"><thead><tr>${header.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${sample.map((r) => `<tr>${header.map((_, i) => `<td>${e(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <h3>3. Vérification — ${imp.txs.length} opération(s) reconnue(s), ${ok} à importer</h3>
      <p class="small muted">Le type est déduit du libellé (achat, vente, dividende, versement, retrait, droits de garde…). Décochez ce que vous ne voulez pas importer ; les doublons déjà présents sont décochés.</p>
      <div class="tbl-wrap imp-list"><table class="tbl compact"><thead><tr><th></th><th>Date</th><th>Type</th><th>Titre</th><th class="num">Qté</th><th class="num">Cours</th><th class="num">Frais</th><th class="num">Trésorerie</th><th>Libellé</th><th>État</th></tr></thead>
      <tbody>${imp.txs.map((t, i) => `<tr class="${t.skip ? 'muted' : ''}"><td><input type="checkbox" data-i="${i}" ${t.skip ? '' : 'checked'} ${t.problem ? 'disabled' : ''}></td><td class="nowrap">${t.date}</td>
        <td><select data-ty="${i}">${Object.entries(BT.TX_TYPES).map(([k, v]) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${v.label.split(' /')[0]}</option>`).join('')}</select></td>
        <td>${BT.TX_TYPES[t.type].stock ? `<select data-tk="${i}"><option value="">?</option>${BT.stocks().map((s) => `<option ${s.t === t.ticker ? 'selected' : ''}>${s.t}</option>`).join('')}</select>` : ''}</td>
        <td class="num">${t.qty ? BT.fmt(t.qty) : ''}</td><td class="num">${t.price ? BT.fmt(t.price, 2) : ''}</td><td class="num">${t.fees ? BT.fmt(t.fees) : ''}</td>
        <td class="num ${BT.cls(BT.txCash(t))}">${BT.fmt(BT.txCash(t))}</td><td class="small note">${e(t.note)}</td>
        <td class="small">${t.problem ? `<span class="neg">${e(t.problem)}</span>` : t.dup ? '<span class="muted">doublon</span>' : '<span class="pos">ok</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="row-end"><button class="btn" id="imp-cancel">Annuler</button><button class="btn primary" id="imp-go" ${ok ? '' : 'disabled'}>Importer ${ok} opération(s)</button></div>`;
    BT.$$('[data-map]', host).forEach((s) => s.onchange = () => { imp.map[s.dataset.map] = s.value === '' ? undefined : +s.value; renderMapping(); });
    BT.$('#hdr').onchange = (ev) => { const h = Math.max(1, +ev.target.value) - 1; imp.start = h + 1; imp.header = rows[h].map((c, i) => String(c || '').trim() || 'Colonne ' + (i + 1)); imp.map = BT.guessMapping(rows[h]); renderMapping(); };
    BT.$('#imp-pf').onchange = (ev) => { imp.pid = ev.target.value; renderMapping(); };
    // corrections ligne par ligne (conservées tant que la correspondance ne change pas)
    const fix = (i, k, v) => {
      const t = imp.txs[i]; t[k] = v;
      t.problem = BT.txProblem(t); t.skip = !!t.problem;
      const cb = host.querySelector(`[data-i="${i}"]`); cb.disabled = !!t.problem; cb.checked = !t.skip;
      cb.closest('tr').querySelector('td:last-child').innerHTML = t.problem ? `<span class="neg">${e(t.problem)}</span>` : '<span class="pos">ok</span>';
      countOk();
    };
    BT.$$('[data-ty]', host).forEach((s) => s.onchange = () => fix(+s.dataset.ty, 'type', s.value));
    BT.$$('[data-tk]', host).forEach((s) => s.onchange = () => fix(+s.dataset.tk, 'ticker', s.value));
    BT.$$('[data-i]', host).forEach((c) => c.onchange = () => { imp.txs[+c.dataset.i].skip = !c.checked; countOk(); });
    const countOk = () => { const n = imp.txs.filter((t) => !t.skip).length; const b = BT.$('#imp-go'); b.textContent = `Importer ${n} opération(s)`; b.disabled = !n; };
    BT.$('#imp-cancel').onclick = () => { imp = null; BT.render(); };
    BT.$('#imp-go').onclick = () => {
      const list = imp.txs.filter((t) => !t.skip);
      let seq = Date.now();
      for (const t of list) {
        const { dup, skip, problem, ...clean } = t;
        clean.pid = imp.pid; clean.seq = seq++;
        BT.state.transactions.push(clean);
        if ((t.type === 'achat' || t.type === 'vente') && t.price) { const h = BT.state.history[t.ticker] = BT.state.history[t.ticker] || {}; h[t.date] = h[t.date] || t.price; }
      }
      BT.save(); imp = null;
      BT.toast(`${list.length} opération(s) importée(s).`, 'ok');
      location.hash = '#/operations';
    };
  }

  /* ---------- Import d'un état de portefeuille (positions valorisées) ---------- */
  function renderSnapshot() {
    const host = BT.$('#imp-step');
    if (!host || !imp) return;
    const st = BT.state;
    const { snap } = imp;
    const isNew = imp.pid === '__new';
    const fresh = isNew || !st.transactions.some((t) => t.pid === imp.pid);
    const txs = isNew ? BT.snapshotTx(snap, '__tmp', imp.entry) : BT.snapshotTx(snap, imp.pid, imp.entry);
    const sumV = snap.positions.reduce((a, p) => a + p.value, 0);
    const sumC = snap.positions.reduce((a, p) => a + p.cost, 0);
    const sumPV = snap.positions.reduce((a, p) => a + p.pv, 0);
    const okTotal = snap.total == null || Math.abs(sumV + snap.cash - snap.total) < 2;
    const unknown = snap.positions.filter((p) => !p.t || !BT.stock(p.t));
    host.innerHTML = `
      <h3>État de portefeuille ${e(snap.sgi || 'SGI')} au ${BT.dateLong(snap.date)}</h3>
      <p class="small ${okTotal ? 'pos' : 'warn'}">${okTotal ? '✓' : '⚠'} ${snap.positions.length} ligne(s) lue(s) · actions ${BT.fmt(sumV)} F + trésorerie ${BT.fmt(snap.cash)} F = ${BT.fmt(sumV + snap.cash)} F${snap.total != null ? (okTotal ? ' — conforme au total du relevé' : ` — le relevé indique ${BT.fmt(snap.total)} F : vérifiez les lignes`) : ''}</p>
      <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Titre</th><th>Désignation SGI</th><th class="num">Qté</th><th class="num">Coût moyen</th><th class="num">Coût global</th><th class="num">Cours</th><th class="num">Valeur</th><th class="num">+/- value</th></tr></thead>
      <tbody>${snap.positions.map((p, i) => `<tr><td>${BT.stock(p.t) ? `<b>${p.t}</b>` : `<select data-sn="${i}"><option value="">? (nouveau titre ${e(p.t || '')})</option>${BT.stocks().map((x) => `<option>${x.t}</option>`).join('')}</select>`}</td><td class="small">${e(p.name)}</td><td class="num">${BT.fmt(p.qty)}</td><td class="num">${BT.fmt(p.avg)}</td><td class="num">${BT.fmt(p.cost)}</td><td class="num">${BT.fmt(p.price)}</td><td class="num">${BT.fmt(p.value)}</td><td class="num ${BT.cls(p.pv)}">${BT.signed(p.pv).replace(' F', '')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Total actions</td><td class="num">${BT.fmt(sumC)}</td><td></td><td class="num">${BT.fmt(sumV)}</td><td class="num ${BT.cls(sumPV)}">${BT.signed(sumPV).replace(' F', '')}</td></tr></tfoot></table></div>
      ${unknown.length ? `<p class="small warn">⚠ ${unknown.length} titre(s) absent(s) de la liste BRVM de l'application : ils seront ajoutés automatiquement (ou choisissez le bon code ci-dessus).</p>` : ''}
      <div class="grid-map">
        <label>Portefeuille de destination<select id="sn-pf"><option value="__new" ${isNew ? 'selected' : ''}>+ Nouveau portefeuille « ${e(snap.sgi || 'SGI')} »</option>${BT.pfOptions(isNew ? '' : imp.pid)}</select></label>
        ${fresh ? `<label>Date d'entrée des positions<input type="date" id="sn-date" value="${imp.entry}" max="${snap.date}"></label>` : ''}
        <label class="check"><input type="checkbox" id="sn-px" ${imp.savePrices ? 'checked' : ''}> Enregistrer les cours du ${BT.dateLong(snap.date)}</label>
      </div>
      <p class="small muted">${fresh
        ? `Les positions sont reprises au <b>coût moyen de la SGI</b> (frais inclus) : la plus-value affichée sera identique à celle du relevé. L'apport reconstitué correspond au coût des titres + la trésorerie. Indiquez une date d'entrée proche de vos premiers achats pour un rendement annualisé réaliste ; vos prochains relevés serviront à mettre le portefeuille à jour.`
        : `Rapprochement avec le portefeuille existant : seules les différences avec l'état de la SGI sont enregistrées (titres achetés ou vendus depuis, trésorerie).`}</p>
      <h3>Opérations qui seront enregistrées (${txs.length})</h3>
      ${txs.length ? `<div class="tbl-wrap imp-list"><table class="tbl compact"><thead><tr><th>Date</th><th>Type</th><th>Titre</th><th class="num">Qté</th><th class="num">Prix</th><th class="num">Trésorerie</th><th>Note</th></tr></thead><tbody>${txs.map((t) => `<tr><td class="nowrap">${BT.dateLong(t.date)}</td><td><span class="tag t-${t.type}">${BT.TX_TYPES[t.type].label.split(' /')[0]}</span></td><td><b>${t.ticker}</b></td><td class="num">${t.qty ? BT.fmt(t.qty) : ''}</td><td class="num">${t.price ? BT.fmt(t.price, 2) : ''}</td><td class="num ${BT.cls(BT.txCash(t))}">${BT.signed(BT.txCash(t))}</td><td class="small note">${e(t.note)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="pos">✓ Le portefeuille correspond déjà à cet état : aucune opération à ajouter.</p>'}
      <div class="row-end"><button class="btn" id="imp-cancel">Annuler</button><button class="btn primary" id="sn-go">${txs.length ? 'Importer l\'état de portefeuille' : 'Enregistrer les cours seulement'}</button></div>`;
    BT.$('#sn-pf').onchange = (ev) => { imp.pid = ev.target.value; renderSnapshot(); };
    if (BT.$('#sn-date')) BT.$('#sn-date').onchange = (ev) => { imp.entry = ev.target.value || snap.date; renderSnapshot(); };
    BT.$('#sn-px').onchange = (ev) => { imp.savePrices = ev.target.checked; };
    BT.$$('[data-sn]', host).forEach((sel) => sel.onchange = () => { const p = snap.positions[+sel.dataset.sn]; if (sel.value) { p.t = sel.value; renderSnapshot(); } });
    BT.$('#imp-cancel').onclick = () => { imp = null; BT.render(); };
    BT.$('#sn-go').onclick = () => {
      let pid = imp.pid;
      if (pid === '__new') {
        pid = BT.uid();
        st.portfolios.push({ id: pid, name: snap.sgi || 'Portefeuille SGI', parentId: null, sgi: snap.sgi || '', feeRate: 1.2, createdAt: BT.today() });
      }
      const pf = st.portfolios.find((p) => p.id === pid);
      if (pf && !pf.sgi && snap.sgi) pf.sgi = snap.sgi;
      // titres inconnus de l'application : ajoutés au référentiel
      for (const p of snap.positions) {
        if (!p.t) p.t = (p.name.replace(/[^A-Z]/gi, '').slice(0, 4) || 'XXXX').toUpperCase();
        if (!BT.stock(p.t)) st.customStocks.push({ t: p.t, n: p.name, s: 'Autre', c: 'CI', p: p.price, d: 0 });
      }
      const list = BT.snapshotTx(snap, pid, imp.entry);
      let seq = Date.now();
      for (const t of list) { t.pid = pid; t.seq = seq++; st.transactions.push(t); }
      if (imp.savePrices) {
        const end = new Date(snap.date + 'T23:59:59Z').getTime();
        for (const p of snap.positions) {
          if (!(p.price > 0)) continue;
          const cur = st.prices[p.t];
          if (!cur || !cur.ts || cur.ts <= end) BT.recordPrice(p.t, p.price, { source: 'SGI', date: snap.date, ts: end, prev: null, change: 0 });
          else (st.history[p.t] = st.history[p.t] || {})[snap.date] = p.price;
        }
      }
      st.currentPid = pid;
      BT.save(); imp = null;
      BT.toast(list.length ? `État de portefeuille importé : ${list.length} opération(s).` : 'Cours du relevé enregistrés.', 'ok', 6000);
      location.hash = '#/';
    };
  }

  function backup() {
    BT.download(`brvm-tracker-sauvegarde-${BT.today()}.json`, JSON.stringify(BT.state), 'application/json');
    BT.state.lastBackup = Date.now(); BT.save();
  }

  /* ================= Rapport imprimable ================= */
  V.rapport = function (root) {
    const st = BT.state;
    const sm = BT.summary(st.currentPid);
    const by = BT.dividendsByYear(st.currentPid);
    root.innerHTML = `
      <div class="page-head no-print"><h1>Rapport</h1><button class="btn primary" id="print">⎙ Imprimer / Enregistrer en PDF</button></div>
      <article class="report card">
        <header><h1>Rapport de portefeuille BRVM</h1><p>${e(BT.portfolioName(st.currentPid))} · au ${BT.dateLong(BT.today())}</p></header>
        <table class="tbl compact kv">
          <tr><td>Valeur totale</td><td class="num"><b>${BT.money(sm.hasDeposits ? sm.total : sm.mv)}</b></td><td>Actions</td><td class="num">${BT.money(sm.mv)}</td></tr>
          <tr><td>Trésorerie</td><td class="num">${BT.money(sm.cash)}</td><td>${sm.hasDeposits ? 'Apports nets' : 'Capital investi'}</td><td class="num">${BT.money(sm.hasDeposits ? sm.netContrib : sm.base)}</td></tr>
          <tr><td>Gain total</td><td class="num ${BT.cls(sm.gain)}"><b>${BT.signed(sm.gain)} (${BT.pct(sm.gainPct)})</b></td><td>Rendement annualisé</td><td class="num">${sm.xirr == null ? '—' : BT.pct(sm.xirr)}</td></tr>
          <tr><td>Plus-values latentes</td><td class="num">${BT.signed(sm.latent)}</td><td>Plus-values réalisées</td><td class="num">${BT.signed(sm.r.realized)}</td></tr>
          <tr><td>Dividendes nets reçus</td><td class="num">${BT.money(sm.r.dividends)}</td><td>Frais (courtage + autres)</td><td class="num">${BT.money(sm.r.tradeFees + sm.r.otherFees)}</td></tr>
          <tr><td>Revenu de dividendes estimé / an</td><td class="num">${BT.money(sm.income)}</td><td>Nombre de lignes</td><td class="num">${sm.open.length}</td></tr>
        </table>
        <div class="report-charts"><div id="r-val"></div><div id="r-alloc"></div></div>
        <h2>Positions</h2>
        <table class="tbl compact"><thead><tr><th>Titre</th><th class="num">Qté</th><th class="num">PRU</th><th class="num">Cours</th><th class="num">Valeur</th><th class="num">+/- latente</th><th class="num">%</th><th class="num">Poids</th></tr></thead>
        <tbody>${sm.open.map((p) => `<tr><td><b>${p.t}</b> ${e(p.stock.n)}</td><td class="num">${BT.fmt(p.qty)}</td><td class="num">${BT.fmt(p.pru)}</td><td class="num">${BT.fmt(p.price)}</td><td class="num">${BT.fmt(p.value)}</td><td class="num ${BT.cls(p.latent)}">${BT.fmt(p.latent)}</td><td class="num ${BT.cls(p.latent)}">${BT.pct(p.latentPct)}</td><td class="num">${p.weight.toFixed(1).replace('.', ',')} %</td></tr>`).join('')}</tbody></table>
        ${Object.keys(by).length ? `<h2>Dividendes encaissés</h2><table class="tbl compact"><thead><tr><th>Année</th><th>Détail</th><th class="num">Total net</th></tr></thead><tbody>${Object.keys(by).sort().map((y) => `<tr><td>${y}</td><td class="small">${Object.entries(by[y].items).map(([t, v]) => `${t} ${BT.fmt(v)}`).join(' · ')}</td><td class="num"><b>${BT.fmt(by[y].total)}</b></td></tr>`).join('')}</tbody></table>` : ''}
        <h2>20 dernières opérations</h2>
        <table class="tbl compact"><thead><tr><th>Date</th><th>Type</th><th>Titre</th><th class="num">Qté</th><th class="num">Cours</th><th class="num">Trésorerie</th></tr></thead><tbody>${sm.txs.slice(-20).reverse().map((t) => `<tr><td>${BT.dateLong(t.date)}</td><td>${BT.TX_TYPES[t.type].label.split(' /')[0]}</td><td>${t.ticker || ''}</td><td class="num">${t.qty ? BT.fmt(t.qty) : ''}</td><td class="num">${t.price ? BT.fmt(t.price, 2) : ''}</td><td class="num">${BT.fmt(BT.txCash(t))}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">Montants en francs CFA (XOF). Cours : ${BT.stocks().some((s) => s.live) ? 'dernière actualisation ' + BT.ago(st.lastFetch) : 'cours de référence ou saisis'}. Document généré par BRVM Tracker Joe — usage personnel.</p>
      </article>`;
    const pts = BT.valueHistory(st.currentPid, 120);
    BT.lineChart(BT.$('#r-val'), [{ name: 'Valeur', color: 'var(--accent)', area: true, points: pts.map((p) => ({ x: p.date, y: p.value })) }, { name: 'Apports', color: 'var(--muted)', dash: '5 4', points: pts.map((p) => ({ x: p.date, y: p.contrib })) }], { height: 200 });
    BT.donut(BT.$('#r-alloc'), sm.open.map((p) => ({ label: p.t, value: p.value })), { center: BT.short(sm.mv) });
    BT.$('#print').onclick = () => window.print();
  };

  /* ================= Paramètres ================= */
  V.parametres = function (root) {
    const st = BT.state;
    const counts = {};
    for (const t of st.transactions) counts[t.pid] = (counts[t.pid] || 0) + 1;
    const nHist = Object.values(st.history).reduce((a, h) => a + Object.keys(h).length, 0);
    let size = 0; try { size = (localStorage.getItem('brvm-tracker-joe-v1') || '').length; } catch (err) { /* */ }
    root.innerHTML = `
      <div class="page-head"><h1>Paramètres</h1></div>
      <section class="grid-main">
        <div class="card span2"><div class="card-head"><h2>Portefeuilles et sous-portefeuilles</h2><button class="btn primary" id="pf-add">+ Portefeuille</button></div>
          <p class="small muted">Un sous-portefeuille (ex. « Dividendes », « Croissance », « Enfants ») est inclus dans son parent. Le taux de frais sert au calcul automatique des frais (commission SGI + redevances BRVM/DC-BR + taxes).</p>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nom</th><th>Parent</th><th>SGI</th><th class="num">Frais %</th><th class="num">Opérations</th><th></th></tr></thead><tbody>
          ${st.portfolios.map((p) => `<tr><td><b>${e(p.name)}</b></td><td>${p.parentId ? e(BT.portfolioName(p.parentId)) : '—'}</td><td>${e(p.sgi || '')}</td><td class="num">${p.feeRate ?? 1.2}</td><td class="num">${counts[p.id] || 0}</td><td class="actions"><button class="mini" data-pf="${p.id}">✎</button></td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><h2>Affichage</h2>
          <label>Thème<select id="theme">${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => `<option value="${k}" ${st.settings.theme === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" id="hide" ${st.settings.hideAmounts ? 'checked' : ''}> Masquer les montants (mode discret)</label></div>
        <div class="card span2"><h2>Source des cours</h2>
          <p class="small muted">Adresse JSON renvoyant la liste des cours BRVM. Par défaut : votre Worker Cloudflare <code>brvm-prices</code> (format <code>{ stocks: [{ symbol, price, previousPrice, changePercent, volume }] }</code>). Un tableau simple <code>[{ ticker, price }]</code> fonctionne aussi.</p>
          <div class="row-gap wrap"><input id="url" class="grow" value="${e(st.settings.workerUrl)}"><button class="btn" id="url-test">Tester</button></div>
          <label class="check"><input type="checkbox" id="auto" ${st.settings.autoRefresh ? 'checked' : ''}> Actualiser automatiquement (ouverture et toutes les 15 min en séance)</label>
          <p class="small muted">Dernière actualisation : ${BT.ago(st.lastFetch)} · ${nHist} cours historiques enregistrés.</p></div>
        <div class="card"><h2>IRVM par pays (%)</h2><p class="small muted">Impôt retenu à la source sur les dividendes. Valeurs par défaut à vérifier auprès de votre SGI.</p>
          <div class="grid2">${Object.entries(BT.COUNTRIES).map(([k, v]) => `<label>${v}<input data-irvm="${k}" inputmode="decimal" value="${st.settings.irvm[k] ?? ''}"></label>`).join('')}</div></div>
        <div class="card"><h2>Ajouter un titre</h2><p class="small muted">Pour une nouvelle introduction en bourse absente de la liste.</p>
          <form class="form" id="ns"><div class="grid2"><label>Code<input name="t" required maxlength="8"></label><label>Cours<input name="p" inputmode="decimal" required></label></div><label>Nom<input name="n" required></label>
          <div class="grid2"><label>Secteur<select name="s">${BT.SECTORS.map((x) => `<option>${e(x)}</option>`).join('')}</select></label><label>Pays<select name="c">${Object.entries(BT.COUNTRIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div><button class="btn">Ajouter</button></form>
          ${st.customStocks.length ? `<p class="small">Ajoutés : ${st.customStocks.map((s) => `${s.t} <button class="link" data-rm-stock="${s.t}">retirer</button>`).join(' · ')}</p>` : ''}</div>
        <div class="card span2"><h2>Sauvegarde et données</h2>
          <p class="small muted">Vos données sont stockées uniquement dans ce navigateur (${(size / 1024).toFixed(0)} Ko). Exportez régulièrement une sauvegarde, notamment avant de changer de téléphone ou de vider le navigateur.${st.lastBackup ? ' Dernière sauvegarde : ' + BT.ago(st.lastBackup) + '.' : ' Aucune sauvegarde faite.'}</p>
          <div class="row-gap wrap"><button class="btn primary" id="bk">⇩ Sauvegarder (.json)</button><label class="btn">⇪ Restaurer<input type="file" id="rs" accept=".json" hidden></label><button class="btn" id="purge">Alléger l'historique des cours</button><button class="btn" id="demo">Créer un portefeuille d'exemple</button><button class="btn danger" id="reset">Tout effacer</button></div></div>
        <div class="card"><h2>À propos</h2><p class="small">BRVM Tracker Joe — suivi personnel de portefeuille BRVM inspiré de brvmtracker.com, avec en plus : alertes, marché complet, calendrier des dividendes, simulateurs, rééquilibrage, rapport PDF et fonctionnement hors ligne.</p><p class="small muted">Les calculs sont fournis à titre indicatif et ne constituent pas un conseil en investissement.</p></div>
      </section>`;
    BT.$('#pf-add').onclick = () => pfForm();
    BT.$$('[data-pf]').forEach((b) => b.onclick = () => pfForm(st.portfolios.find((p) => p.id === b.dataset.pf)));
    BT.$('#theme').onchange = (ev) => { st.settings.theme = ev.target.value; BT.save(); BT.applyTheme(); BT.render(); };
    BT.$('#hide').onchange = (ev) => { st.settings.hideAmounts = ev.target.checked; BT.save(); BT.render(); };
    BT.$('#url').onchange = (ev) => { st.settings.workerUrl = ev.target.value.trim(); BT.save(); };
    BT.$('#auto').onchange = (ev) => { st.settings.autoRefresh = ev.target.checked; BT.save(); };
    BT.$('#url-test').onclick = async () => { st.settings.workerUrl = BT.$('#url').value.trim(); BT.save(); if (await BT.refreshPrices()) BT.render(); };
    BT.$$('[data-irvm]').forEach((i) => i.onchange = () => { st.settings.irvm[i.dataset.irvm] = BT.parseNum(i.value); BT.save(); });
    BT.$('#ns').onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target, t = f.t.value.trim().toUpperCase();
      if (BT.stocks().some((s) => s.t === t)) return BT.toast('Ce code existe déjà.', 'err');
      st.customStocks.push({ t, n: f.n.value.trim(), s: f.s.value, c: f.c.value, p: BT.parseNum(f.p.value), d: 0 });
      BT.save(); BT.render(); BT.toast(t + ' ajouté.', 'ok');
    };
    BT.$$('[data-rm-stock]').forEach((b) => b.onclick = () => { st.customStocks = st.customStocks.filter((s) => s.t !== b.dataset.rmStock); BT.save(); BT.render(); });
    BT.$('#bk').onclick = () => { backup(); BT.render(); };
    BT.$('#rs').onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        BT.confirm(`Remplacer toutes les données actuelles par la sauvegarde (${(data.transactions || []).length} opérations) ?`, () => { try { BT.replaceState(data); BT.render(); BT.toast('Sauvegarde restaurée.', 'ok'); } catch (err) { BT.toast(err.message, 'err'); } }, 'Restaurer');
      } catch (err) { BT.toast('Fichier illisible : ' + err.message, 'err'); }
    };
    BT.$('#purge').onclick = () => BT.confirm('Conserver un seul cours par semaine pour les relevés de plus de 6 mois (allège le stockage) ?', () => {
      const lim = new Date(Date.now() - 182 * 86400000).toISOString().slice(0, 10);
      let n = 0;
      for (const h of Object.values(st.history)) {
        const seen = new Set();
        for (const d of Object.keys(h).sort().reverse()) {
          if (d >= lim) continue;
          const dt = new Date(d); const wk = dt.getUTCFullYear() + '-' + Math.floor((dt - new Date(dt.getUTCFullYear(), 0, 1)) / 604800000);
          if (seen.has(wk)) { delete h[d]; n++; } else seen.add(wk);
        }
      }
      BT.save(); BT.render(); BT.toast(n + ' relevés supprimés.', 'ok');
    }, 'Alléger');
    BT.$('#demo').onclick = () => { BT.loadDemo(); location.hash = '#/'; };
    BT.$('#reset').onclick = () => BT.confirm('Effacer définitivement toutes vos données (portefeuilles, opérations, alertes) ? Faites une sauvegarde avant.', () => { BT.reset(); BT.render(); }, 'Tout effacer');
  };

  function pfForm(p) {
    const st = BT.state;
    const isNew = !p;
    p = p || { id: BT.uid(), name: '', parentId: null, sgi: '', feeRate: 1.2, createdAt: BT.today() };
    const desc = new Set(BT.portfolioIds(p.id));
    BT.modal(isNew ? 'Nouveau portefeuille' : 'Modifier le portefeuille', `<form class="form" id="pff">
      <label>Nom<input name="name" value="${e(p.name)}" required></label>
      <label>Sous-portefeuille de<select name="parent"><option value="">— (portefeuille principal)</option>${st.portfolios.filter((x) => !desc.has(x.id)).map((x) => `<option value="${x.id}" ${x.id === p.parentId ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></label>
      <div class="grid2"><label>SGI<input name="sgi" value="${e(p.sgi || '')}" placeholder="ex. SGI de votre banque"></label><label>Frais globaux (% TTC)<input name="fee" inputmode="decimal" value="${p.feeRate ?? 1.2}"></label></div>
      <div class="row-end">${isNew || st.portfolios.length < 2 ? '' : '<button type="button" class="btn danger" id="pfdel">Supprimer</button><span class="grow"></span>'}<button class="btn primary">Enregistrer</button></div></form>`, (b) => {
      const f = b.querySelector('#pff');
      if (b.querySelector('#pfdel')) b.querySelector('#pfdel').onclick = () => {
        const n = st.transactions.filter((t) => t.pid === p.id).length;
        BT.confirm(`Supprimer « ${p.name} » et ses ${n} opération(s) ? Ses sous-portefeuilles deviendront principaux.`, () => {
          st.transactions = st.transactions.filter((t) => t.pid !== p.id);
          st.portfolios = st.portfolios.filter((x) => x.id !== p.id);
          st.portfolios.forEach((x) => { if (x.parentId === p.id) x.parentId = null; });
          if (st.currentPid === p.id) st.currentPid = 'all';
          BT.save(); BT.render();
        });
      };
      f.onsubmit = (ev) => {
        ev.preventDefault();
        Object.assign(p, { name: f.name.value.trim(), parentId: f.parent.value || null, sgi: f.sgi.value.trim(), feeRate: BT.parseNum(f.fee.value) });
        if (isNew) st.portfolios.push(p);
        BT.save(); BT.closeModal(); BT.render();
      };
    });
  }
})();
