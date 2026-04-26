/**
 * Moteur d'Analyse Fondamentale BRVM
 * Calcule PER, PBR, rendement, DCF, score fondamental 0-100
 */
const FundamentalAnalysis = (() => {

  // ─── Calcul des ratios de base ─────────────────────────────────────────────
  function computeRatios(stock) {
    const price = stock.price;
    const eps   = stock.eps || 1;
    const bvps  = stock.bookValue || price;
    const dps   = stock.dividendPerShare || 0;
    const rev   = stock.revenue || 1;
    const ni    = stock.netIncome || 1;

    const per    = price / eps;
    const pbr    = price / bvps;
    const yld    = (dps / price) * 100;
    const psales = price / (rev / estimateShares(stock));
    const roe    = stock.roe || (ni / (bvps * estimateShares(stock)));
    const roa    = stock.roa || 0;
    const d_e    = stock.debtEquity || 0;
    const cr     = stock.currentRatio || 1;
    const fcf    = stock.freeCashFlow || 0;
    const revGr  = stock.revenueGrowth || 0;
    const niGr   = stock.netIncomeGrowth || 0;

    return { per, pbr, yld, psales, roe, roa, d_e, cr, fcf, revGr, niGr, price, eps, dps, bvps };
  }

  function estimateShares(stock) {
    // Estimation nbre d'actions via capitalisation implicite
    if (stock.shares) return stock.shares;
    return Math.round((stock.netIncome || 1000) / (stock.eps || 1));
  }

  // ─── Valeur intrinsèque par DCF simplifié ─────────────────────────────────
  function dcfValuation(stock) {
    const fcf0   = stock.freeCashFlow || stock.netIncome * 0.7 || 1000;
    const g1     = Math.min(stock.revenueGrowth || 0.08, 0.20);  // Croissance phase 1 (5 ans)
    const g2     = 0.05;                                           // Croissance terminale UEMOA
    const wacc   = MACRO_CONTEXT.riskFreeRate + MACRO_CONTEXT.marketRiskPremium * 0.9;
    const shares = estimateShares(stock);

    let pv = 0;
    let fcf = fcf0;
    for (let i = 1; i <= 5; i++) {
      fcf *= (1 + g1);
      pv  += fcf / Math.pow(1 + wacc, i);
    }
    // Valeur terminale
    const terminalValue = (fcf * (1 + g2)) / (wacc - g2);
    pv += terminalValue / Math.pow(1 + wacc, 5);

    const intrinsicValue = (pv / shares) * 1000; // En FCFA (en milliers)
    const upside = ((intrinsicValue - stock.price) / stock.price) * 100;
    return { intrinsicValue: Math.round(intrinsicValue), upside: Math.round(upside * 10) / 10 };
  }

  // ─── Score PER (0-25 points) ───────────────────────────────────────────────
  function scorePER(per, sectorAvgPER) {
    if (per <= 0 || isNaN(per)) return { score: 0, signal: 'DÉFICIT', comment: 'Résultat négatif' };
    const relative = per / sectorAvgPER;
    let score, signal, comment;
    if (per < 5)          { score = 22; signal = '✅ Très bon marché'; comment = `PER ${per.toFixed(1)}x — décote majeure`; }
    else if (per < 8)     { score = 20; signal = '✅ Bon marché';      comment = `PER ${per.toFixed(1)}x — sous valorisé`; }
    else if (per < 12)    { score = 16; signal = '🟡 Juste prix';      comment = `PER ${per.toFixed(1)}x — valorisation raisonnable`; }
    else if (per < 18)    { score = 10; signal = '🟠 Légèrement cher'; comment = `PER ${per.toFixed(1)}x — prime de marché`; }
    else if (per < 25)    { score = 5;  signal = '🔴 Cher';            comment = `PER ${per.toFixed(1)}x — surévalué`; }
    else                  { score = 2;  signal = '🔴 Très cher';       comment = `PER ${per.toFixed(1)}x — valorisation excessive`; }
    const vsector = relative < 0.9 ? ' (décoté vs secteur)' : relative > 1.1 ? ' (premium vs secteur)' : '';
    return { score, signal, comment: comment + vsector, per };
  }

  // ─── Score Dividende (0-25 points) ────────────────────────────────────────
  function scoreDividend(yld, dps, dividendHistory) {
    let score = 0; let growth = false; let consistent = false;

    // Croissance dividende régulière ?
    if (dividendHistory && dividendHistory.length >= 3) {
      const diffs = dividendHistory.slice(1).map((d, i) => d >= dividendHistory[i]);
      consistent = diffs.filter(Boolean).length >= diffs.length * 0.75;
      const lastGrowth = dividendHistory.length >= 2
        ? (dividendHistory[dividendHistory.length - 1] / dividendHistory[dividendHistory.length - 2] - 1) : 0;
      growth = lastGrowth > 0;
    }

    // Rendement: benchmarked par rapport à OAT UEMOA (~5.5%)
    if      (yld >= 10)  score = 25;
    else if (yld >= 8)   score = 22;
    else if (yld >= 6)   score = 18;
    else if (yld >= 4)   score = 14;
    else if (yld >= 2)   score = 8;
    else if (yld >= 0.5) score = 4;
    else                 score = 0;

    if (consistent) score = Math.min(25, score + 3);
    if (growth)     score = Math.min(25, score + 2);

    const signal  = yld >= 6 ? '✅ Excellent rendement' :
                    yld >= 4 ? '🟡 Bon rendement' :
                    yld >= 2 ? '🟠 Faible rendement' : '🔴 Pas de dividende';
    const comment = `Rendement ${yld.toFixed(1)}% — ${consistent ? 'dividende régulier' : 'historique irrégulier'}`;
    return { score, signal, comment, yld, consistent, growth };
  }

  // ─── Score Croissance (0-20 points) ───────────────────────────────────────
  function scoreGrowth(revGr, niGr) {
    const avgGr = (revGr + niGr) / 2;
    let score;
    if      (avgGr >= 0.20) score = 20;
    else if (avgGr >= 0.15) score = 18;
    else if (avgGr >= 0.10) score = 14;
    else if (avgGr >= 0.05) score = 10;
    else if (avgGr >= 0)    score = 5;
    else                    score = 0;

    const signal  = avgGr >= 0.15 ? '✅ Forte croissance' :
                    avgGr >= 0.08 ? '🟡 Croissance correcte' :
                    avgGr >= 0    ? '🟠 Croissance faible' : '🔴 Décroissance';
    return { score, signal,
      comment: `CA +${(revGr*100).toFixed(0)}% / Résultat +${(niGr*100).toFixed(0)}%`,
      revGr, niGr };
  }

  // ─── Score Qualité (ROE, ROA, Bilan) (0-20 points) ────────────────────────
  function scoreQuality(roe, roa, d_e, cr, fcf) {
    let score = 0;

    // ROE (0-8 pts)
    if      (roe >= 0.20) score += 8;
    else if (roe >= 0.15) score += 6;
    else if (roe >= 0.10) score += 4;
    else if (roe >= 0.05) score += 2;

    // Bilan — D/E (0-6 pts)
    if      (d_e <= 0.3)  score += 6;
    else if (d_e <= 0.6)  score += 4;
    else if (d_e <= 1.0)  score += 2;
    else if (d_e <= 1.5)  score += 1;

    // Liquidité (0-3 pts)
    if      (cr >= 2.0) score += 3;
    else if (cr >= 1.5) score += 2;
    else if (cr >= 1.0) score += 1;

    // FCF positif (0-3 pts)
    if (fcf > 0) score += 3;

    score = Math.min(20, score);
    const signal = score >= 16 ? '✅ Excellent bilan' :
                   score >= 12 ? '🟡 Bilan sain' :
                   score >= 7  ? '🟠 Bilan moyen' : '🔴 Bilan fragile';
    return { score, signal,
      comment: `ROE ${(roe*100).toFixed(1)}% · D/E ${d_e.toFixed(2)} · Ratio liquidité ${cr.toFixed(2)}`,
      roe, roa, d_e, cr, fcf };
  }

  // ─── Score Valeur relative (PBR + DCF) (0-10 points) ─────────────────────
  function scoreValue(pbr, upsidePct) {
    let score = 0;
    if      (pbr < 0.8)  score += 5;
    else if (pbr < 1.2)  score += 4;
    else if (pbr < 2.0)  score += 2;
    else if (pbr < 3.0)  score += 1;

    if      (upsidePct > 50) score += 5;
    else if (upsidePct > 25) score += 4;
    else if (upsidePct > 10) score += 3;
    else if (upsidePct > 0)  score += 1;
    else if (upsidePct < -20) score -= 1;

    return { score: Math.max(0, Math.min(10, score)),
      signal: upsidePct > 20 ? '✅ Décotée DCF' : upsidePct > 0 ? '🟡 Légère décote' : '🔴 Surévaluée',
      comment: `PBR ${pbr.toFixed(2)}x · Potentiel DCF ${upsidePct > 0 ? '+' : ''}${upsidePct}%` };
  }

  // ─── Analyse complète ──────────────────────────────────────────────────────
  function analyze(stock) {
    const ratios   = computeRatios(stock);
    const sector   = SECTOR_AVERAGES[stock.sector] || SECTOR_AVERAGES['Banque'];
    const dcf      = dcfValuation(stock);

    const perScore  = scorePER(ratios.per, sector.avgPER);
    const divScore  = scoreDividend(ratios.yld, ratios.dps, stock.dividendHistory);
    const grwScore  = scoreGrowth(ratios.revGr, ratios.niGr);
    const qualScore = scoreQuality(ratios.roe, ratios.roa, ratios.d_e, ratios.cr, ratios.fcf);
    const valScore  = scoreValue(ratios.pbr, dcf.upside);

    const totalScore = perScore.score + divScore.score + grwScore.score + qualScore.score + valScore.score;
    const normalizedScore = Math.min(100, Math.round(totalScore));

    const grade = normalizedScore >= 80 ? 'A+' :
                  normalizedScore >= 70 ? 'A'  :
                  normalizedScore >= 60 ? 'B+' :
                  normalizedScore >= 50 ? 'B'  :
                  normalizedScore >= 40 ? 'C'  : 'D';

    return {
      score: normalizedScore, grade,
      ratios, dcf,
      components: { perScore, divScore, grwScore, qualScore, valScore },
      metrics: [
        { label: 'PER',                  value: ratios.per.toFixed(1)+'x',        signal: perScore.signal,  detail: perScore.comment },
        { label: 'Rendement dividende',  value: ratios.yld.toFixed(1)+'%',        signal: divScore.signal,  detail: divScore.comment },
        { label: 'ROE',                  value: (ratios.roe*100).toFixed(1)+'%',  signal: qualScore.signal, detail: qualScore.comment },
        { label: 'Croissance CA',        value: '+'+(ratios.revGr*100).toFixed(0)+'%', signal: grwScore.signal, detail: grwScore.comment },
        { label: 'Croissance résultat',  value: '+'+(ratios.niGr*100).toFixed(0)+'%', signal: grwScore.signal, detail: '' },
        { label: 'PBR',                  value: ratios.pbr.toFixed(2)+'x',        signal: valScore.signal,  detail: valScore.comment },
        { label: 'Valeur DCF estimée',   value: formatFCFA(dcf.intrinsicValue),   signal: dcf.upside > 0 ? '✅ Décotée' : '🔴 Surévaluée', detail: `Potentiel ${dcf.upside > 0 ? '+' : ''}${dcf.upside}%` },
        { label: 'Dette / Fonds propres',value: ratios.d_e.toFixed(2)+'x',        signal: ratios.d_e < 0.7 ? '✅ Faible' : ratios.d_e < 1.2 ? '🟡 Modéré' : '🔴 Élevé', detail: '' },
        { label: 'Ratio de liquidité',   value: ratios.cr.toFixed(2),             signal: ratios.cr >= 1.5 ? '✅ Bon' : '🟠 Attention', detail: '' },
        { label: 'Free Cash Flow',       value: formatFCFA(ratios.fcf),           signal: ratios.fcf > 0 ? '✅ Positif' : '🔴 Négatif', detail: '' }
      ],
      summary: buildFundamentalSummary(stock, normalizedScore, ratios, dcf)
    };
  }

  function buildFundamentalSummary(stock, score, ratios, dcf) {
    const strengths = [], weaknesses = [];
    if (ratios.yld >= 5)    strengths.push(`Rendement attractif ${ratios.yld.toFixed(1)}%`);
    if (ratios.per < 10)    strengths.push(`Valorisation faible PER ${ratios.per.toFixed(1)}x`);
    if (ratios.roe >= 0.15) strengths.push(`Rentabilité élevée ROE ${(ratios.roe*100).toFixed(1)}%`);
    if (ratios.revGr >= 0.10) strengths.push(`Croissance CA soutenue +${(ratios.revGr*100).toFixed(0)}%`);
    if (dcf.upside > 20)    strengths.push(`Décote DCF significative +${dcf.upside}%`);
    if (ratios.d_e < 0.5)   strengths.push('Bilan très peu endetté');

    if (ratios.yld < 2)     weaknesses.push('Faible rendement dividende');
    if (ratios.per > 18)    weaknesses.push('Valorisation élevée');
    if (ratios.d_e > 1.0)   weaknesses.push('Endettement significatif');
    if (ratios.revGr < 0)   weaknesses.push('Croissance en repli');
    if (dcf.upside < -15)   weaknesses.push('Surévaluation DCF');

    return { strengths, weaknesses };
  }

  function formatFCFA(val) {
    if (!val) return 'N/A';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + ' Mrd FCFA';
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + ' M FCFA';
    return val.toLocaleString('fr-FR') + ' FCFA';
  }

  return { analyze, computeRatios, dcfValuation, formatFCFA };
})();
