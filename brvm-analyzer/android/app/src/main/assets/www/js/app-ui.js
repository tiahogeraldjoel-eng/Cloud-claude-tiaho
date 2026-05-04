// ─── BRVM Analyser — Rendu UI ────────────────────────────────────
const BRVMUI = (() => {
  const fmt = (n, d=0) => n == null || isNaN(n) ? '--' : Number(n).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const sign = n => n >= 0 ? '+' : '';
  const cls  = n => n >= 0 ? 'green' : 'red';

  // ── Dashboard ────────────────────────────────────────────────
  function renderDashboard(stocks) {
    renderIndices();
    renderMarketSummary(stocks);
    renderMovers(stocks);
    renderStocksTable(stocks);
    updateLastUpdate();
  }

  function renderIndices() {
    const I = BRVM_INDICES;
    setText('brvmComposite', fmt(I.composite.value, 2));
    setText('brvm10',        fmt(I.brvm10.value,    2));
    setText('brvmPrestige',  fmt(I.prestige.value,  2));
    setColoredText('brvmCompositeChange', `${sign(I.composite.change)}${I.composite.change.toFixed(2)}%`, I.composite.change);
    setColoredText('brvm10Change',        `${sign(I.brvm10.change)}${I.brvm10.change.toFixed(2)}%`,       I.brvm10.change);
    setColoredText('brvmPrestigeChange',  `${sign(I.prestige.change)}${I.prestige.change.toFixed(2)}%`,   I.prestige.change);
  }

  function renderMarketSummary(stocks) {
    const list = Object.values(stocks);
    const up   = list.filter(s => s.changePct > 0).length;
    const down = list.filter(s => s.changePct < 0).length;
    const flat = list.length - up - down;
    const vol  = list.reduce((s, x) => s + (x.volumeVal || 0), 0) / 1e6;
    setText('summaryUp',     up);
    setText('summaryFlat',   flat);
    setText('summaryDown',   down);
    setText('summaryVolume', fmt(vol, 1));
  }

  function renderMovers(stocks) {
    const list = Object.values(stocks).filter(s => s.volume > 0);
    const gainers = [...list].sort((a,b) => b.changePct - a.changePct).slice(0,8);
    const losers  = [...list].sort((a,b) => a.changePct - b.changePct).slice(0,8);
    document.getElementById('topGainers').innerHTML = gainers.map(s => moverCard(s)).join('');
    document.getElementById('topLosers').innerHTML  = losers.map(s => moverCard(s)).join('');
  }

  function moverCard(s) {
    const c = cls(s.changePct);
    return `<div class="mover-card" onclick="BRVMApp.analyzeStock('${s.ticker}')">
      <div class="mover-ticker">${s.ticker}</div>
      <div class="mover-name">${s.name}</div>
      <div class="mover-price">${fmt(s.close)}</div>
      <div class="mover-change ${c}">${sign(s.changePct)}${s.changePct.toFixed(2)}%</div>
    </div>`;
  }

  function renderStocksTable(stocks) {
    const rows = Object.values(stocks)
      .sort((a,b) => a.ticker.localeCompare(b.ticker))
      .map(s => stockRow(s)).join('');
    document.getElementById('stocksTable').innerHTML = rows;
  }

  function stockRow(s) {
    const score = BRVMScoring.quickScore(s);
    const c = cls(s.changePct);
    return `<div class="stock-row" onclick="BRVMApp.analyzeStock('${s.ticker}')">
      <span class="stock-ticker">${s.ticker}</span>
      <span class="stock-name">${s.name}</span>
      <span class="stock-price">${fmt(s.close)}</span>
      <span class="stock-change ${c}">${sign(s.changePct)}${s.changePct.toFixed(2)}%</span>
      <span class="stock-score" style="background:${scoreColor(score)}">${score}</span>
    </div>`;
  }

  // ── En-tête titre ─────────────────────────────────────────────
  function renderStockHeader(s) {
    const c = cls(s.changePct);
    document.getElementById('stockHeader').innerHTML = `
      <div class="sh-ticker">${s.ticker}</div>
      <div class="sh-name">${s.name} · ${s.sector} · ${s.country}</div>
      <div class="sh-price ${c}">${fmt(s.close)} FCFA</div>
      <div class="sh-change ${c}">${sign(s.changePct)}${s.changePct?.toFixed(2)}% (${sign(s.change)}${fmt(s.change)})</div>
      <div class="sh-meta">
        <span>H: ${fmt(s.high)}</span><span>B: ${fmt(s.low)}</span>
        <span>Vol: ${fmt(s.volume)}</span><span>Val: ${fmt((s.volumeVal||0)/1e6,1)}M</span>
      </div>`;
  }

  // ── Score overview ────────────────────────────────────────────
  function renderScoreOverview(s, profile) {
    const f = BRVMFundamental.score(s);
    const t = BRVMTechnical.score(s);
    const p = BRVMPsychological.score(s);
    const g = BRVMScoring.globalScore(s, profile);
    document.getElementById('scoreOverview').innerHTML = `
      <div class="score-item">
        <div class="score-label">Fondamental</div>
        <div class="score-circle" style="border-color:${scoreColor(f)};color:${scoreColor(f)}">${f}</div>
      </div>
      <div class="score-item">
        <div class="score-label">Technique</div>
        <div class="score-circle" style="border-color:${scoreColor(t)};color:${scoreColor(t)}">${t}</div>
      </div>
      <div class="score-item">
        <div class="score-label">Psychologique</div>
        <div class="score-circle" style="border-color:${scoreColor(p)};color:${scoreColor(p)}">${p}</div>
      </div>
      <div class="score-item">
        <div class="score-label">Global</div>
        <div class="score-circle" style="border-color:${scoreColor(g)};color:${scoreColor(g)};border-width:4px;font-size:20px">${g}</div>
      </div>`;
  }

  // ── Analyse Fondamentale ──────────────────────────────────────
  function renderFundamental(s) {
    const analysis = BRVMFundamental.analyze(s);
    let html = '';
    for (const m of analysis.metrics) {
      html += `<div class="metric-row">
        <div>
          <div class="metric-label">${m.label}</div>
          ${m.bar != null ? `<div class="metric-bar-container"><div class="metric-bar" style="width:${Math.min(m.bar,100)}%;background:${scoreColor(m.bar)}"></div></div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="metric-value">${m.value}</div>
          <div class="metric-signal ${m.signal}">${m.signalText}</div>
        </div>
      </div>`;
    }
    html += `<div style="margin-top:12px;padding:10px;background:#0D1B2A;border-radius:8px;font-size:12px;color:#8BA7C0">${analysis.commentary}</div>`;
    document.getElementById('fundamentalContent').innerHTML = html;
  }

  // ── Analyse Technique ─────────────────────────────────────────
  function renderTechnical(s) {
    const analysis = BRVMTechnical.analyze(s);
    let html = '';
    for (const m of analysis.metrics) {
      html += `<div class="metric-row">
        <div class="metric-label">${m.label}</div>
        <div style="text-align:right">
          <div class="metric-value">${m.value}</div>
          <div class="metric-signal ${m.signal}">${m.signalText}</div>
        </div>
      </div>`;
    }
    html += `<div style="margin-top:12px;padding:10px;background:#0D1B2A;border-radius:8px;font-size:12px;color:#8BA7C0">${analysis.commentary}</div>`;
    document.getElementById('technicalContent').innerHTML = html;
  }

  // ── Analyse Psychologique ─────────────────────────────────────
  function renderPsychological(s) {
    const analysis = BRVMPsychological.analyze(s);
    let html = '';
    for (const e of analysis.events) {
      html += `<div class="psych-event">
        <div class="psych-event-icon">${e.icon}</div>
        <div class="psych-event-body">
          <div class="psych-event-title">${e.title}</div>
          <div class="psych-event-desc">${e.desc}</div>
        </div>
        <div class="psych-event-impact ${cls(e.impact)}" style="font-size:13px;font-weight:800">
          ${sign(e.impact)}${e.impact > 0 ? '+' : ''}${e.impactText}
        </div>
      </div>`;
    }
    html += `<div style="margin-top:12px;padding:10px;background:#0D1B2A;border-radius:8px;font-size:12px;color:#8BA7C0">${analysis.commentary}</div>`;
    document.getElementById('psychologicalContent').innerHTML = html;
  }

  // ── Verdict ───────────────────────────────────────────────────
  function renderVerdict(s, profile, settings) {
    const verdict = BRVMScoring.verdict(s, profile, settings);
    const cls2 = { BUY:'verdict-buy', HOLD:'verdict-hold', SELL:'verdict-sell' }[verdict.action];
    const icon = { BUY:'🟢', HOLD:'🟡', SELL:'🔴' }[verdict.action];
    const label = { BUY:'ACHETER', HOLD:'CONSERVER', SELL:'VENDRE' }[verdict.action];
    const profileLabel = { conservative:'Prudent', balanced:'Équilibré', growth:'Croissance', speculative:'Spéculatif' }[profile];
    let html = `<div class="verdict-card ${cls2}">
      <div class="verdict-icon">${icon}</div>
      <div class="verdict-action" style="color:${verdict.action==='BUY'?'#00A651':verdict.action==='SELL'?'#E63946':'#F4A261'}">${label}</div>
      <div class="verdict-profile">Profil ${profileLabel} · Confiance ${verdict.confidence}%</div>
      <div class="verdict-confidence">${verdict.summary}</div>
      <div class="verdict-reasons">${verdict.reasons.map(r=>`<div class="verdict-reason"><span>${r.icon}</span><span>${r.text}</span></div>`).join('')}</div>
      <div class="verdict-targets">
        <div class="target-item"><div class="target-label">Objectif</div><div class="target-value" style="color:#00A651">${fmt(verdict.targetPrice)} FCFA</div></div>
        <div class="target-item"><div class="target-label">Stop-loss</div><div class="target-value" style="color:#E63946">${fmt(verdict.stopLoss)} FCFA</div></div>
        <div class="target-item"><div class="target-label">Potentiel</div><div class="target-value">${sign(verdict.upside)}${verdict.upside?.toFixed(1)}%</div></div>
      </div>
    </div>`;

    // Profils alternatifs
    const profiles = ['conservative','balanced','growth','speculative'];
    html += `<div class="card"><div class="settings-title">Verdicts par profil</div>`;
    for (const p of profiles) {
      const v = BRVMScoring.verdict(s, p, settings);
      const lbl = { conservative:'🛡️ Prudent', balanced:'⚖️ Équilibré', growth:'🚀 Croissance', speculative:'⚡ Spéculatif' }[p];
      const c2 = {BUY:'green',HOLD:'gold',SELL:'red'}[v.action];
      const a2 = {BUY:'ACHETER',HOLD:'CONSERVER',SELL:'VENDRE'}[v.action];
      html += `<div class="metric-row"><span>${lbl}</span><span class="${c2}" style="font-weight:700">${a2} (${v.confidence}%)</span></div>`;
    }
    html += `</div>`;
    document.getElementById('verdictContent').innerHTML = html;
  }

  // ── Recommandations ───────────────────────────────────────────
  function renderRecommendations(stocks, profile) {
    const date = new Date().toLocaleDateString('fr-FR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    setText('recoDate', date);

    const settings = JSON.parse(localStorage.getItem('brvm_settings')||'{}');
    const all = Object.values(stocks).map(s => ({
      ...s, verdict: BRVMScoring.verdict(s, profile, settings)
    })).sort((a,b) => b.verdict.confidence - a.verdict.confidence);

    const buys  = all.filter(s => s.verdict.action === 'BUY').slice(0,5);
    const holds = all.filter(s => s.verdict.action === 'HOLD').slice(0,4);
    const sells = all.filter(s => s.verdict.action === 'SELL').slice(0,4);

    document.getElementById('buyRecommendations').innerHTML  = buys.map(recoCard).join('') || '<p style="color:#556B82;padding:12px">Aucun achat recommandé aujourd\'hui</p>';
    document.getElementById('holdRecommendations').innerHTML = holds.map(recoCard).join('');
    document.getElementById('sellRecommendations').innerHTML = sells.map(recoCard).join('');

    renderSentiment(stocks);
    renderCommentary(stocks, profile, buys, sells);
    document.getElementById('recoDate').textContent = date;
  }

  function recoCard(s) {
    return `<div class="reco-card" onclick="BRVMApp.analyzeStock('${s.ticker}')">
      <div class="reco-signal">${{BUY:'🟢',HOLD:'🟡',SELL:'🔴'}[s.verdict.action]}</div>
      <div class="reco-body">
        <div class="reco-ticker">${s.ticker} <span style="font-size:12px;color:#8BA7C0">— ${s.name}</span></div>
        <div class="reco-reason">${s.verdict.summary}</div>
        <div class="reco-meta">
          <span class="reco-badge reco-score">Score ${BRVMScoring.globalScore(s,s.verdict.profile||'balanced')}/100</span>
          ${s.yield ? `<span class="reco-badge reco-yield">Rdmt ${s.yield?.toFixed(1)}%</span>` : ''}
          ${s.per   ? `<span class="reco-badge reco-per">PER ${s.per?.toFixed(1)}</span>` : ''}
          <span style="font-size:11px;color:#8BA7C0">Conf. ${s.verdict.confidence}%</span>
        </div>
      </div>
    </div>`;
  }

  function renderSentiment(stocks) {
    const list = Object.values(stocks);
    const up = list.filter(s=>s.changePct>0).length;
    const ratio = up / list.length;
    const pct = Math.round(ratio * 100);
    const label = pct >= 60 ? 'Haussier 📈' : pct <= 40 ? 'Baissier 📉' : 'Neutre ➡️';
    const color = pct >= 60 ? '#00A651' : pct <= 40 ? '#E63946' : '#F4A261';
    document.getElementById('sentimentCard').innerHTML = `
      <div><div class="sentiment-label">Sentiment du marché</div><div class="sentiment-value" style="color:${color}">${label}</div></div>
      <div style="text-align:right;font-size:24px;font-weight:800;color:${color}">${pct}%</div>
      <div class="sentiment-gauge" style="margin-top:8px">
        <div class="sentiment-indicator" style="left:${pct}%"></div>
      </div>`;
  }

  function renderCommentary(stocks, profile, buys, sells) {
    const list = Object.values(stocks);
    const avgChg = list.reduce((s,x)=>s+x.changePct,0)/list.length;
    const topSector = list.sort((a,b)=>b.changePct-a.changePct)[0];
    const date = new Date().toLocaleDateString('fr-FR');
    document.getElementById('marketCommentary').innerHTML = `
      <p>En date du <strong>${date}</strong>, le marché BRVM affiche une performance moyenne de
      <strong style="color:${avgChg>=0?'#00A651':'#E63946'}">${avgChg>=0?'+':''}${avgChg.toFixed(2)}%</strong>.</p>
      <p>Le titre <strong>${topSector?.ticker}</strong> (${topSector?.sector}) se distingue avec
      <strong>${sign(topSector?.changePct)}${topSector?.changePct?.toFixed(2)}%</strong>.</p>
      <p>${buys.length} titre(s) identifié(s) à l'achat pour le profil <strong>${profile}</strong>.
      ${sells.length > 0 ? sells.length + ' titre(s) à alléger.' : 'Aucune vente urgente signalée.'}</p>
      <p style="color:#F4A261">⚠️ Ces recommandations sont fournies à titre informatif uniquement. Elles ne constituent pas un conseil en investissement.</p>`;
  }

  // ── Screener ──────────────────────────────────────────────────
  function renderScreener(stocks) {
    const sector   = document.getElementById('filterSector')?.value || '';
    const country  = document.getElementById('filterCountry')?.value || '';
    const minScore = parseInt(document.getElementById('filterScore')?.value || '0');
    const signal   = document.getElementById('filterSignal')?.value || '';
    const minDiv   = parseFloat(document.getElementById('filterDividend')?.value || '0');
    const maxPER   = parseFloat(document.getElementById('filterPER')?.value || '999');
    const profile  = localStorage.getItem('investor_profile') || 'balanced';

    const results = Object.values(stocks).filter(s => {
      const score = BRVMScoring.globalScore(s, profile);
      const v     = BRVMScoring.verdict(s, profile, {});
      if (sector  && s.sector  !== sector)  return false;
      if (country && s.country !== country) return false;
      if (score   < minScore)               return false;
      if (signal  && v.action !== signal)   return false;
      if (minDiv  && (s.yield || 0) < minDiv) return false;
      if (s.per   && s.per > maxPER)        return false;
      return true;
    }).sort((a,b) => BRVMScoring.globalScore(b,profile) - BRVMScoring.globalScore(a,profile));

    const container = document.getElementById('screenerResults');
    container.innerHTML = `<div class="screener-count">${results.length} titre(s) trouvé(s)</div>` +
      results.map(s => {
        const score = BRVMScoring.globalScore(s,profile);
        const v = BRVMScoring.verdict(s,profile,{});
        const c = cls(s.changePct);
        return `<div class="stock-row" onclick="BRVMApp.analyzeStock('${s.ticker}')">
          <span class="stock-ticker">${s.ticker}</span>
          <div style="flex:1">
            <div style="font-size:11px;color:#8BA7C0">${s.name}</div>
            <div style="font-size:10px;color:#556B82">${s.sector} · ${s.country}</div>
          </div>
          <div style="text-align:right">
            <div class="stock-price">${fmt(s.close)}</div>
            <div class="stock-change ${c}">${sign(s.changePct)}${s.changePct.toFixed(2)}%</div>
          </div>
          <span class="stock-score" style="background:${scoreColor(score)}">${score}</span>
        </div>`;
      }).join('');
  }

  // ── Settings ──────────────────────────────────────────────────
  function renderSettings(profile, settings) {
    const profiles = {
      conservative:{ label:'🛡️ Prudent', weights:'40% Fond / 40% Tech / 20% Psy', risk:'Faible', horizon:'Long terme', focus:'Dividendes stables, PER faible' },
      balanced:    { label:'⚖️ Équilibré', weights:'35% Fond / 40% Tech / 25% Psy', risk:'Modéré', horizon:'Moyen terme', focus:'Croissance régulière' },
      growth:      { label:'🚀 Croissance', weights:'25% Fond / 45% Tech / 30% Psy', risk:'Élevé', horizon:'Moyen terme', focus:'Appréciation du capital' },
      speculative: { label:'⚡ Spéculatif', weights:'15% Fond / 50% Tech / 35% Psy', risk:'Très élevé', horizon:'Court terme', focus:'Momentum et timing' }
    };
    const p = profiles[profile];
    document.getElementById('profileDetail').innerHTML = `
      <div class="profile-item"><span>Profil actif</span><strong>${p.label}</strong></div>
      <div class="profile-item"><span>Pondération</span><span style="font-size:11px">${p.weights}</span></div>
      <div class="profile-item"><span>Risque</span><span>${p.risk}</span></div>
      <div class="profile-item"><span>Horizon</span><span>${p.horizon}</span></div>
      <div class="profile-item"><span>Focus</span><span style="font-size:11px">${p.focus}</span></div>`;
    document.getElementById('cacheSize').textContent = (JSON.stringify(localStorage).length / 1024).toFixed(1) + ' Ko';
    document.getElementById('lastUpdateSetting').textContent = new Date().toLocaleString('fr-FR');
  }

  // ── Helpers ───────────────────────────────────────────────────
  function setText(id, txt) { const e = document.getElementById(id); if (e) e.textContent = txt; }
  function setColoredText(id, txt, val) {
    const e = document.getElementById(id); if (!e) return;
    e.textContent = txt; e.className = 'index-change ' + (val >= 0 ? 'green' : 'red');
  }
  function scoreColor(s) { return s >= 65 ? '#00A651' : s >= 45 ? '#F4A261' : '#E63946'; }
  function updateLastUpdate() {
    const e = document.getElementById('lastUpdate');
    if (e) e.textContent = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
  }

  return { renderDashboard, renderStockHeader, renderScoreOverview, renderFundamental,
           renderTechnical, renderPsychological, renderVerdict, renderRecommendations,
           renderScreener, renderSettings };
})();
