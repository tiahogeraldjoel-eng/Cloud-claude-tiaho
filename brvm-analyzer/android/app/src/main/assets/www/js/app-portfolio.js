// ─── BRVM Analyser — Portefeuille ───────────────────────────────
const BRVMPortfolio = (() => {
  const KEY = 'brvm_portfolio';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function save(positions) {
    localStorage.setItem(KEY, JSON.stringify(positions));
  }

  function addPosition(ticker, qty, price, date) {
    const positions = load();
    positions.push({ ticker, qty, price, date, id: Date.now() });
    save(positions);
  }

  function removePosition(id) {
    const positions = load().filter(p => p.id !== id);
    save(positions);
  }

  function render(stocks) {
    const positions = load();
    const container = document.getElementById('portfolioPositions');
    const summaryEl = document.getElementById('portfolioSummary');

    if (positions.length === 0) {
      summaryEl.innerHTML = `<div style="text-align:center;color:#556B82;padding:8px">
        <div style="font-size:32px">💼</div>
        <div style="margin-top:8px">Portefeuille vide</div>
        <div style="font-size:11px;margin-top:4px">Appuyez sur ➕ pour ajouter une position</div>
      </div>`;
      container.innerHTML = '';
      BRVMCharts.drawPortfolioChart('portfolioChart', []);
      return;
    }

    let totalCost = 0, totalValue = 0;
    const rows = positions.map(p => {
      const stock = stocks[p.ticker];
      const currentPrice = stock?.close || p.price;
      const cost  = p.price * p.qty;
      const value = currentPrice * p.qty;
      const pnl   = value - cost;
      const pnlPct = (pnl / cost * 100);
      totalCost  += cost;
      totalValue += value;
      const c = pnl >= 0 ? 'green' : 'red';
      const verdict = stock ? BRVMScoring.verdict(stock, localStorage.getItem('investor_profile')||'balanced', {}) : null;
      return { p, stock, cost, value, pnl, pnlPct, c, verdict };
    });

    const totalPnl    = totalValue - totalCost;
    const totalPnlPct = totalPnl / totalCost * 100;
    const tc = totalPnl >= 0 ? '#00A651' : '#E63946';

    summaryEl.innerHTML = `
      <div class="ps-label">Valeur totale du portefeuille</div>
      <div class="ps-total">${(totalValue).toLocaleString('fr-FR')} FCFA</div>
      <div class="ps-stats">
        <div><div class="ps-stat-label">Investi</div><div class="ps-stat-value">${(totalCost/1e6).toFixed(1)}M</div></div>
        <div><div class="ps-stat-label">P&L</div><div class="ps-stat-value" style="color:${tc}">${totalPnl>=0?'+':''}${(totalPnl/1e3).toFixed(0)}K</div></div>
        <div><div class="ps-stat-label">Perf.</div><div class="ps-stat-value" style="color:${tc}">${totalPnl>=0?'+':''}${totalPnlPct.toFixed(2)}%</div></div>
        <div><div class="ps-stat-label">Titres</div><div class="ps-stat-value">${positions.length}</div></div>
      </div>`;

    container.innerHTML = rows.map(({ p, stock, value, pnl, pnlPct, c, verdict }) => {
      const vLabel = verdict ? {BUY:'🟢 Acheter',HOLD:'🟡 Conserver',SELL:'🔴 Vendre'}[verdict.action] : '';
      return `<div class="position-card" onclick="BRVMApp.analyzeStock('${p.ticker}')">
        <div class="position-header">
          <div>
            <span class="position-ticker">${p.ticker}</span>
            <span style="font-size:11px;color:#8BA7C0;margin-left:6px">${stock?.name||''}</span>
          </div>
          <div class="position-pnl ${c}">${pnl>=0?'+':''}${pnl.toLocaleString('fr-FR')} (${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}%)</div>
        </div>
        <div class="position-detail">
          <span>${p.qty} titres @ ${p.price.toLocaleString('fr-FR')} FCFA</span>
          <span>Val: ${value.toLocaleString('fr-FR')} FCFA</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px">
          <span style="color:#F4A261">${vLabel}</span>
          <button onclick="event.stopPropagation();BRVMPortfolio.removePosition(${p.id});BRVMPortfolio.render(window._stocksRef||{})"
            style="background:none;border:none;color:#E63946;cursor:pointer;font-size:12px">✕ Retirer</button>
        </div>
      </div>`;
    }).join('');

    const chartData = rows.map(r => ({ label: r.p.ticker, value: r.value }));
    BRVMCharts.drawPortfolioChart('portfolioChart', chartData);
    window._stocksRef = stocks;
  }

  return { load, addPosition, removePosition, render };
})();
