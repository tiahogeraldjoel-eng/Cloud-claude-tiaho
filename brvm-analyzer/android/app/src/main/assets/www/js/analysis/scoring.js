/**
 * Système de Scoring Global BRVM
 * Combine analyse fondamentale + technique + psychologique
 * Produit orientation Achat / Conservation / Vente par profil investisseur
 */
const ScoringEngine = (() => {

  // Poids par profil investisseur
  const PROFILE_WEIGHTS = {
    conservative:  { fundamental: 0.50, technical: 0.25, psychological: 0.25 },
    balanced:      { fundamental: 0.35, technical: 0.38, psychological: 0.27 },
    growth:        { fundamental: 0.25, technical: 0.48, psychological: 0.27 },
    speculative:   { fundamental: 0.15, technical: 0.55, psychological: 0.30 }
  };

  // Seuils de décision par profil
  const DECISION_THRESHOLDS = {
    conservative:  { buy: 72, hold_high: 71, hold_low: 52, sell: 51 },
    balanced:      { buy: 68, hold_high: 67, hold_low: 48, sell: 47 },
    growth:        { buy: 65, hold_high: 64, hold_low: 44, sell: 43 },
    speculative:   { buy: 60, hold_high: 59, hold_low: 38, sell: 37 }
  };

  const PROFILE_LABELS = {
    conservative: '🛡️ Prudent',
    balanced:     '⚖️ Équilibré',
    growth:       '🚀 Croissance',
    speculative:  '⚡ Spéculatif'
  };

  // ─── Score global ──────────────────────────────────────────────────────────
  function computeGlobalScore(fundamentalScore, technicalScore, psychologicalScore, profile) {
    const w = PROFILE_WEIGHTS[profile] || PROFILE_WEIGHTS.balanced;
    return Math.round(
      fundamentalScore  * w.fundamental +
      technicalScore    * w.technical   +
      psychologicalScore * w.psychological
    );
  }

  // ─── Décision d'investissement ─────────────────────────────────────────────
  function getDecision(globalScore, profile) {
    const t = DECISION_THRESHOLDS[profile] || DECISION_THRESHOLDS.balanced;
    if (globalScore >= t.buy) return {
      action: 'ACHAT', label: '🟢 ACHAT', color: '#00A651',
      confidence: Math.min(100, Math.round((globalScore - t.buy) / (100 - t.buy) * 100) + 65),
      cssClass: 'verdict-buy'
    };
    if (globalScore >= t.sell) return {
      action: 'CONSERVATION', label: '🟡 CONSERVATION', color: '#F4A261',
      confidence: Math.round(50 + (globalScore - (t.sell + t.hold_high)/2) / 10 * 5),
      cssClass: 'verdict-hold'
    };
    return {
      action: 'VENTE', label: '🔴 VENTE', color: '#E63946',
      confidence: Math.min(100, Math.round((t.sell - globalScore) / t.sell * 100) + 55),
      cssClass: 'verdict-sell'
    };
  }

  // ─── Calcul objectifs de prix ──────────────────────────────────────────────
  function computeTargets(stock, fundamentalResult, technicalResult) {
    const price = stock.price;
    const dcfTarget  = fundamentalResult.dcf?.intrinsicValue || price;
    const techUpper  = technicalResult.resistance || price * 1.08;
    const techLower  = technicalResult.support    || price * 0.92;
    const divAdjustedTarget = price * (1 + (stock.dividendPerShare || 0) / price);

    // Objectif consensus
    const bullTarget  = Math.round(Math.max(dcfTarget, techUpper, price * 1.10));
    const bearTarget  = Math.round(Math.min(techLower, price * 0.90));
    const midTarget   = Math.round((bullTarget + price) / 2);
    const stopLoss    = Math.round(techLower * 0.97);

    return { bullTarget, bearTarget, midTarget, stopLoss, dcfTarget: Math.round(dcfTarget) };
  }

  // ─── Raisons détaillées ───────────────────────────────────────────────────
  function buildReasons(stock, fundResult, techResult, psychResult, decision) {
    const reasons = [];
    const { action } = decision;

    // Fondamentaux
    if (fundResult.ratios.yld >= 5) reasons.push({ icon: '✅', text: `Dividende attractif ${fundResult.ratios.yld.toFixed(1)}%` });
    if (fundResult.ratios.per < 10) reasons.push({ icon: '✅', text: `PER faible ${fundResult.ratios.per.toFixed(1)}x` });
    if (fundResult.dcf?.upside > 20) reasons.push({ icon: '✅', text: `Potentiel DCF +${fundResult.dcf.upside}%` });
    if (fundResult.ratios.roe >= 0.15) reasons.push({ icon: '✅', text: `ROE élevé ${(fundResult.ratios.roe*100).toFixed(1)}%` });
    if (fundResult.ratios.per > 20)   reasons.push({ icon: '🔴', text: `PER élevé ${fundResult.ratios.per.toFixed(1)}x` });
    if (fundResult.dcf?.upside < -15) reasons.push({ icon: '🔴', text: `Surévalué DCF ${fundResult.dcf.upside}%` });

    // Technique
    if (techResult.rsi < 35)  reasons.push({ icon: '✅', text: `RSI survendu ${techResult.rsi?.toFixed(0)} — rebond probable` });
    if (techResult.rsi > 70)  reasons.push({ icon: '🔴', text: `RSI suracheté ${techResult.rsi?.toFixed(0)} — risque de correction` });
    if (techResult.trend === 'haussier') reasons.push({ icon: '✅', text: 'Tendance technique haussière confirmée' });
    if (techResult.trend === 'baissier') reasons.push({ icon: '🔴', text: 'Tendance technique baissière' });

    // Psychologique
    const divEvent = psychResult.events?.find(e => e.type === 'dividende');
    if (divEvent)  reasons.push({ icon: '💰', text: divEvent.title });
    if (psychResult.liquidity?.avgVol < 200) reasons.push({ icon: '⚠️', text: 'Faible liquidité — risque exécution' });
    if (psychResult.countryRisk?.riskScore < 4.5) reasons.push({ icon: '⚠️', text: `Risque géopolitique ${psychResult.countryRisk?.description}` });
    if (psychResult.marketSentiment?.sentimentScore > 65) reasons.push({ icon: '📈', text: 'Sentiment marché favorable' });

    return reasons.slice(0, 8); // Max 8 raisons
  }

  // ─── Résumé exécutif par profil ────────────────────────────────────────────
  function buildExecutiveSummary(stock, scores, decisions) {
    const lines = [];
    lines.push(`**${stock.ticker} — ${stock.name}**`);
    lines.push(`Secteur: ${stock.sector} · Pays: ${stock.country} · Prix: ${stock.price?.toLocaleString('fr-FR')} FCFA`);
    lines.push('');
    lines.push('**Orientations par profil:**');
    Object.entries(decisions).forEach(([profile, d]) => {
      lines.push(`${PROFILE_LABELS[profile]}: ${d.label} (score ${scores[profile]})`);
    });
    return lines.join('\n');
  }

  // ─── Analyse complète d'un titre ──────────────────────────────────────────
  function analyzeStock(stock, settings) {
    const profile = (settings && settings.profile) || 'balanced';

    // Exécuter les 3 analyses
    const fundResult  = FundamentalAnalysis.analyze(stock);
    const techResult  = TechnicalAnalysis.analyze(stock, settings);
    const psychResult = PsychologicalAnalysis.analyze(stock);

    // Scores par profil
    const scores    = {};
    const decisions = {};
    Object.keys(PROFILE_WEIGHTS).forEach(p => {
      scores[p]    = computeGlobalScore(fundResult.score, techResult.score, psychResult.score, p);
      decisions[p] = getDecision(scores[p], p);
    });

    const globalScore = scores[profile];
    const decision    = decisions[profile];
    const targets     = computeTargets(stock, fundResult, techResult);
    const reasons     = buildReasons(stock, fundResult, techResult, psychResult, decision);
    const summary     = buildExecutiveSummary(stock, scores, decisions);

    return {
      stock, profile,
      scores, decisions,
      globalScore, decision,
      targets, reasons, summary,
      fundamental: fundResult,
      technical:   techResult,
      psychological: psychResult
    };
  }

  // ─── Recommandations quotidiennes ─────────────────────────────────────────
  function getDailyRecommendations(profile, settings) {
    const allResults = [];

    BRVM_STOCKS.forEach(stock => {
      try {
        const r = analyzeStock(stock, { ...settings, profile });
        allResults.push(r);
      } catch (e) { /* Stock sans données suffisantes */ }
    });

    const buys  = allResults.filter(r => r.decision.action === 'ACHAT')
                            .sort((a, b) => b.globalScore - a.globalScore);
    const holds = allResults.filter(r => r.decision.action === 'CONSERVATION')
                            .sort((a, b) => b.globalScore - a.globalScore);
    const sells = allResults.filter(r => r.decision.action === 'VENTE')
                            .sort((a, b) => a.globalScore - b.globalScore);

    // Top picks par profil (max 5 achats, 5 conserver, 3 ventes)
    return {
      buys:  buys.slice(0, 5),
      holds: holds.slice(0, 5),
      sells: sells.slice(0, 3),
      profile,
      date: new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }),
      sentiment: PsychologicalAnalysis.computeMarketSentiment(),
      allResults
    };
  }

  // ─── Screener filtré ────────────────────────────────────────────────────────
  function screenStocks(filters, settings) {
    const profile = settings?.profile || 'balanced';
    return BRVM_STOCKS
      .filter(stock => {
        if (filters.sector && filters.sector !== '' && stock.sector !== filters.sector) return false;
        if (filters.country && filters.country !== '' && stock.country !== filters.country) return false;
        return true;
      })
      .map(stock => {
        try {
          const r = analyzeStock(stock, { ...settings, profile });
          return r;
        } catch { return null; }
      })
      .filter(r => r !== null)
      .filter(r => {
        if (filters.minScore && r.globalScore < parseInt(filters.minScore)) return false;
        if (filters.signal && r.decision.action !== filters.signal) return false;
        if (filters.minDividend) {
          const yld = (stock => (stock.dividendPerShare / stock.price) * 100)(r.stock);
          if (yld < parseFloat(filters.minDividend)) return false;
        }
        if (filters.maxPER) {
          const per = r.stock.price / (r.stock.eps || 1);
          if (per > parseFloat(filters.maxPER)) return false;
        }
        return true;
      })
      .sort((a, b) => b.globalScore - a.globalScore);
  }

  // ─── Commentary quotidien du marché ────────────────────────────────────────
  function generateMarketCommentary(recommendations) {
    const { buys, holds, sells, sentiment } = recommendations;
    const today = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
    const dayOfWeek = new Date().getDay();

    let commentary = `<p><strong>Le ${today}</strong>, le marché BRVM affiche un sentiment ${sentiment.label.toLowerCase()} `;
    commentary += `avec <strong>${sentiment.gainers} valeurs en hausse</strong> et ${sentiment.losers} en baisse.</p>`;

    if (buys.length > 0) {
      commentary += `<p>Nos systèmes identifient <strong>${buys.length} opportunité(s) d'achat</strong> pour le profil sélectionné. `;
      if (buys[0]) {
        commentary += `${buys[0].stock.ticker} se distingue avec un score global de ${buys[0].globalScore}/100 `;
        commentary += `porté par ${buys[0].reasons[0]?.text || 'des fondamentaux solides'}.`;
      }
      commentary += `</p>`;
    }

    // Contexte macro
    commentary += `<p>Sur le plan macroéconomique, la parité fixe CFA/EUR reste un <strong>facteur de stabilité</strong> `;
    commentary += `pour les investisseurs. La croissance PIB UEMOA est attendue à <strong>${(MACRO_CONTEXT.gdpGrowthUEMOA*100).toFixed(1)}%</strong>, `;
    commentary += `soutenant les résultats des sociétés cotées.</p>`;

    // Rappel BRVM
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      commentary += `<p>⏰ <strong>Rappel:</strong> La séance BRVM est ouverte de 09h00 à 15h30 heure d'Abidjan. `;
      commentary += `Les ordres passés après 15h30 seront exécutés à la prochaine séance.</p>`;
    } else {
      commentary += `<p>📅 Le marché est fermé ce week-end. La prochaine séance reprend lundi matin.</p>`;
    }

    return commentary;
  }

  return {
    analyzeStock, getDailyRecommendations, screenStocks,
    computeGlobalScore, getDecision, generateMarketCommentary,
    PROFILE_WEIGHTS, PROFILE_LABELS
  };
})();
