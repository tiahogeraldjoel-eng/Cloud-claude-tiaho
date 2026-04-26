// ─── BRVM Analyser — Noyau central ─────────────────────────────────
const BRVMApp = (() => {
  let _stocks = {};
  let _currentTicker = null;
  let _currentPage = 'dashboard';
  let _prevPage = 'dashboard';
  let _profile = localStorage.getItem('investor_profile') || 'balanced';
  let _settings = JSON.parse(localStorage.getItem('brvm_settings') || '{}');

  const defaultSettings = {
    horizon: 'medium', maxPER: 20, minDividend: 3,
    rsiOverbought: 70, rsiOversold: 30,
    alertReco: true, alertVariation: true, alertOpen: false
  };

  function getSettings() { return { ...defaultSettings, ..._settings }; }

  function saveSetting(key, value) {
    _settings[key] = value;
    localStorage.setItem('brvm_settings', JSON.stringify(_settings));
  }

  // ── Navigation ─────────────────────────────────────────────────
  function navigate(page) {
    if (page === _currentPage && page !== 'analysis') return;
    _prevPage = _currentPage;
    _currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    const navBtn = document.querySelector(`[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');
    if (page === 'recommendations') BRVMUI.renderRecommendations(_stocks, _profile);
    if (page === 'screener') BRVMUI.renderScreener(_stocks);
    if (page === 'portfolio') BRVMPortfolio.render(_stocks);
    if (page === 'settings') BRVMUI.renderSettings(_profile, getSettings());
  }

  function goBack() { navigate(_prevPage); }

  function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabName);
    if (tab) tab.classList.add('active');
    const btn = document.querySelector(`.tab-btn[onclick*="${tabName}"]`);
    if (btn) btn.classList.add('active');
    if (tabName === 'technical' && _currentTicker) {
      BRVMCharts.drawPriceChart('priceChart', _stocks[_currentTicker]);
    }
  }

  // ── Chargement données ──────────────────────────────────────────
  async function init() {
    applySettings();
    showSpinner(true);
    try {
      _stocks = await BRVMFetcher.fetchAll();
      BRVMUI.renderDashboard(_stocks);
      BRVMUI.renderRecommendations(_stocks, _profile);
      populatePortfolioSelect();
      startTicker();
      scheduleAutoRefresh();
    } catch (e) {
      _stocks = Object.keys(BRVM_MARKET_DATA).reduce((acc, t) => {
        acc[t] = { ...BRVM_MARKET_DATA[t], ticker: t,
          name: BRVM_STOCKS[t]?.name || t,
          sector: BRVM_STOCKS[t]?.sector || 'Autre',
          country: BRVM_STOCKS[t]?.country || 'CI' };
        return acc;
      }, {});
      BRVMUI.renderDashboard(_stocks);
    }
    showSpinner(false);
    document.getElementById('lastUpdateSetting').textContent = new Date().toLocaleString('fr-FR');
  }

  async function refreshData() {
    showToast('Actualisation en cours...');
    try {
      _stocks = await BRVMFetcher.fetchAll();
      BRVMUI.renderDashboard(_stocks);
      if (_currentPage === 'recommendations') BRVMUI.renderRecommendations(_stocks, _profile);
      showToast('Données actualisées ✓');
    } catch { showToast('Données en cache utilisées'); }
  }

  function onResume() {
    const status = BRVMFetcher.getMarketStatus();
    updateMarketStatus(status);
  }

  function scheduleAutoRefresh() {
    setInterval(() => {
      const s = BRVMFetcher.getMarketStatus();
      updateMarketStatus(s);
      if (s.isOpen) refreshData();
    }, 15 * 60 * 1000);
  }

  function updateMarketStatus(s) {
    const el = document.getElementById('marketStatus');
    if (!el) return;
    if (s.isOpen) {
      el.textContent = '🟢 Séance en cours';
      el.style.color = '#00A651';
    } else {
      el.textContent = `🔴 Marché fermé${s.nextOpen ? ' — ouvre ' + s.nextOpen : ''}`;
      el.style.color = '#E63946';
    }
  }

  // ── Analyse d'un titre ─────────────────────────────────────────
  function analyzeStock(ticker) {
    _currentTicker = ticker;
    const stock = _stocks[ticker];
    if (!stock) return;
    navigate('analysis');
    document.getElementById('analysisTitle').textContent = ticker;
    BRVMUI.renderStockHeader(stock);
    BRVMUI.renderScoreOverview(stock, _profile);
    BRVMUI.renderFundamental(stock);
    BRVMUI.renderTechnical(stock);
    BRVMUI.renderPsychological(stock);
    BRVMUI.renderVerdict(stock, _profile, getSettings());
    showTab('fundamental');
  }

  // ── Profil investisseur ────────────────────────────────────────
  function setProfile(p) {
    _profile = p;
    localStorage.setItem('investor_profile', p);
    document.querySelectorAll('.profile-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.profile === p);
    });
    BRVMUI.renderRecommendations(_stocks, _profile);
    if (_currentTicker) BRVMUI.renderVerdict(_stocks[_currentTicker], _profile, getSettings());
  }

  // ── Filtres screener ───────────────────────────────────────────
  function filterStocks(q) {
    q = q.toLowerCase();
    document.querySelectorAll('.stock-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? 'flex' : 'none';
    });
  }

  function applyScreener() { BRVMUI.renderScreener(_stocks); }

  // ── Ticker tape ────────────────────────────────────────────────
  function startTicker() {
    const tape = document.getElementById('tickerTape');
    if (!tape) return;
    const items = Object.values(_stocks)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 20)
      .map(s => {
        const cls = s.changePct >= 0 ? 'green' : 'red';
        const sign = s.changePct >= 0 ? '+' : '';
        return `<span class="ticker-item">
          <span class="ticker-symbol">${s.ticker}</span>
          <span class="ticker-price">${fmt(s.close)}</span>
          <span class="ticker-pct ${cls}">${sign}${s.changePct.toFixed(2)}%</span>
        </span>`;
      }).join('');
    tape.innerHTML = items + items;
  }

  // ── PDF ────────────────────────────────────────────────────────
  function generatePDF() {
    if (!_currentTicker) return;
    BRVMReport.generate(_stocks[_currentTicker], _profile, _stocks);
  }

  function generateRecommendationsPDF() {
    BRVMReport.generateRecommendations(_stocks, _profile);
  }

  // ── Cache ──────────────────────────────────────────────────────
  function clearCache() {
    localStorage.removeItem('brvm_quotes_cache');
    showToast('Cache vidé');
  }

  function forceUpdate() { refreshData(); }

  // ── Portfolio helpers ──────────────────────────────────────────
  function showAddPosition() {
    document.getElementById('addPositionModal').style.display = 'flex';
    document.getElementById('addDate').value = new Date().toISOString().split('T')[0];
  }

  function addPosition() {
    const ticker = document.getElementById('addTicker').value;
    const qty    = parseInt(document.getElementById('addQty').value);
    const price  = parseFloat(document.getElementById('addPrice').value);
    const date   = document.getElementById('addDate').value;
    if (!ticker || !qty || !price) { showToast('Veuillez remplir tous les champs'); return; }
    BRVMPortfolio.addPosition(ticker, qty, price, date);
    document.getElementById('addPositionModal').style.display = 'none';
    BRVMPortfolio.render(_stocks);
    showToast('Position ajoutée ✓');
  }

  function populatePortfolioSelect() {
    const sel = document.getElementById('addTicker');
    if (!sel) return;
    sel.innerHTML = '<option value="">Sélectionner un titre...</option>' +
      Object.keys(_stocks).sort().map(t =>
        `<option value="${t}">${t} — ${_stocks[t].name}</option>`
      ).join('');
  }

  // ── Helpers UI ─────────────────────────────────────────────────
  function showSpinner(v) {
    document.getElementById('spinner').style.display = v ? 'flex' : 'none';
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function applySettings() {
    const s = getSettings();
    ['horizon','settingPER','settingDividend','settingRSIHigh','settingRSILow'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = s[id.replace('setting','')] || el.value;
    });
    const alertReco = document.getElementById('alertReco');
    if (alertReco) alertReco.checked = s.alertReco !== false;
  }

  // ── Format ─────────────────────────────────────────────────────
  function fmt(n, dec = 0) {
    if (n == null || isNaN(n)) return '--';
    return n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  window.addEventListener('DOMContentLoaded', init);

  return {
    navigate, goBack, showTab, analyzeStock, setProfile,
    filterStocks, applyScreener, refreshData, onResume,
    generatePDF, generateRecommendationsPDF,
    clearCache, forceUpdate, showAddPosition, addPosition,
    saveSetting, showToast, fmt
  };
})();
