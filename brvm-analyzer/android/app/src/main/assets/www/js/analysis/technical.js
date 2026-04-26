/**
 * Moteur d'Analyse Technique BRVM
 * MA, RSI, MACD, Bollinger, Support/Résistance, Volume, Tendance
 */
const TechnicalAnalysis = (() => {

  // ─── Indicateurs de base ───────────────────────────────────────────────────
  function sma(prices, period) {
    const result = new Array(prices.length).fill(null);
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      result[i] = slice.reduce((a, b) => a + b, 0) / period;
    }
    return result;
  }

  function ema(prices, period) {
    const k = 2 / (period + 1);
    const result = new Array(prices.length).fill(null);
    let initialized = false;
    for (let i = 0; i < prices.length; i++) {
      if (!initialized) {
        if (i === period - 1) {
          result[i] = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
          initialized = true;
        }
      } else {
        result[i] = prices[i] * k + result[i - 1] * (1 - k);
      }
    }
    return result;
  }

  function rsi(prices, period = 14) {
    const result = new Array(prices.length).fill(null);
    if (prices.length < period + 1) return result;
    const changes = prices.slice(1).map((p, i) => p - prices[i]);
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period; avgLoss /= period;
    for (let i = period; i < prices.length; i++) {
      const change = changes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs  = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result[i] = Math.round((100 - 100 / (1 + rs)) * 10) / 10;
    }
    return result;
  }

  function macd(prices, fast = 12, slow = 26, signal = 9) {
    const emaFast   = ema(prices, fast);
    const emaSlow   = ema(prices, slow);
    const macdLine  = prices.map((_, i) =>
      emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null);
    const validMacd = macdLine.filter(v => v !== null);
    const signalLine = ema(validMacd, signal);
    // Réaligner
    const offset = macdLine.findIndex(v => v !== null);
    const fullSignal = new Array(prices.length).fill(null);
    signalLine.forEach((v, i) => { if (v !== null) fullSignal[offset + i] = v; });
    const histogram = macdLine.map((v, i) =>
      v !== null && fullSignal[i] !== null ? v - fullSignal[i] : null);
    return { macdLine, signalLine: fullSignal, histogram };
  }

  function bollingerBands(prices, period = 20, stdMultiplier = 2) {
    const mid    = sma(prices, period);
    const upper  = new Array(prices.length).fill(null);
    const lower  = new Array(prices.length).fill(null);
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean  = mid[i];
      const std   = Math.sqrt(slice.reduce((s, p) => s + (p - mean) ** 2, 0) / period);
      upper[i]    = Math.round((mean + stdMultiplier * std) * 100) / 100;
      lower[i]    = Math.round((mean - stdMultiplier * std) * 100) / 100;
    }
    return { upper, mid, lower };
  }

  // ─── Support & Résistance ──────────────────────────────────────────────────
  function findSupportResistance(prices, lookback = 30) {
    const recent = prices.slice(-lookback);
    const high = Math.max(...recent);
    const low  = Math.min(...recent);
    const resistance = Math.round(high * 1.005);
    const support    = Math.round(low  * 0.995);
    const mid        = Math.round((high + low) / 2);
    return { support, resistance, mid };
  }

  // ─── Analyse du volume ─────────────────────────────────────────────────────
  function analyzeVolume(volumes, prices) {
    const n = Math.min(20, volumes.length);
    const recentVols = volumes.slice(-n);
    const avgVol     = recentVols.reduce((a, b) => a + b, 0) / n;
    const lastVol    = volumes[volumes.length - 1] || 0;
    const ratio      = avgVol > 0 ? lastVol / avgVol : 1;

    // OBV (On Balance Volume)
    let obv = 0;
    const obvSeries = [0];
    for (let i = 1; i < Math.min(prices.length, volumes.length); i++) {
      if (prices[i] > prices[i - 1])      obv += volumes[i];
      else if (prices[i] < prices[i - 1]) obv -= volumes[i];
      obvSeries.push(obv);
    }
    const obvTrend = obvSeries.length > 5
      ? (obvSeries[obvSeries.length - 1] > obvSeries[obvSeries.length - 5] ? 'haussier' : 'baissier')
      : 'neutre';

    return { avgVol, lastVol, ratio, obvTrend,
      signal: ratio > 1.5 ? '✅ Volume élevé — confirmation' :
              ratio > 0.8 ? '🟡 Volume normal' : '🟠 Volume faible — signal douteux',
      comment: `Volume actuel ${ratio.toFixed(1)}x la moyenne · OBV ${obvTrend}` };
  }

  // ─── Détection tendance ────────────────────────────────────────────────────
  function detectTrend(prices) {
    const n = prices.length;
    if (n < 5) return { trend: 'neutre', strength: 0 };
    const ma20val = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, n);
    const ma50val = prices.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, n);
    const ma200val= prices.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, n);
    const current = prices[n - 1];

    let bullPoints = 0;
    if (current > ma20val)  bullPoints++;
    if (current > ma50val)  bullPoints++;
    if (current > ma200val) bullPoints++;
    if (ma20val > ma50val)  bullPoints++;
    if (ma50val > ma200val) bullPoints++;

    const trend = bullPoints >= 4 ? 'haussier' :
                  bullPoints <= 1 ? 'baissier' : 'neutre';
    const strength = Math.round((bullPoints / 5) * 100);
    return { trend, strength, bullPoints, ma20: ma20val, ma50: ma50val, ma200: ma200val };
  }

  // ─── Patterns chandelier (BRVM: séances peu fréquentes) ───────────────────
  function detectPatterns(prices) {
    const n = prices.length;
    const patterns = [];
    if (n < 5) return patterns;

    const [p1, p2, p3, p4, p5] = prices.slice(-5);
    const last3Avg = (p3 + p4 + p5) / 3;
    const prev3Avg = (p1 + p2 + p3) / 3;

    // Tendance haussière 3 séances
    if (p3 < p4 && p4 < p5) patterns.push({ name: '3 Séances haussières', bull: true });
    if (p3 > p4 && p4 > p5) patterns.push({ name: '3 Séances baissières', bull: false });

    // Rebond depuis support
    const support = findSupportResistance(prices.slice(-30));
    const distToSupport = Math.abs(p5 - support.support) / support.support;
    if (distToSupport < 0.03 && p5 > p4) patterns.push({ name: 'Rebond sur support', bull: true });
    if (Math.abs(p5 - support.resistance) / support.resistance < 0.02) patterns.push({ name: 'Proche résistance', bull: false });

    // Momentum 5j vs 20j
    if (last3Avg > prev3Avg * 1.02) patterns.push({ name: 'Momentum positif court terme', bull: true });
    if (last3Avg < prev3Avg * 0.98) patterns.push({ name: 'Momentum négatif court terme', bull: false });

    return patterns;
  }

  // ─── Scoring technique (0-100) ─────────────────────────────────────────────
  function scoreComponents(rsiVal, macdData, bbData, volData, trendData, prices, settings) {
    const rsiOverbought = (settings && settings.rsiOverbought) || 70;
    const rsiOversold   = (settings && settings.rsiOversold)   || 30;
    let score = 50; // Neutre par défaut
    const signals = [];

    // RSI (0-25 pts)
    if (rsiVal !== null) {
      if (rsiVal < rsiOversold) {
        score += 20; signals.push({ label: `RSI ${rsiVal}`, type: 'bull', msg: 'Zone de survente — opportunité achat' });
      } else if (rsiVal > rsiOverbought) {
        score -= 20; signals.push({ label: `RSI ${rsiVal}`, type: 'bear', msg: 'Zone de surachat — pression vendeuse' });
      } else if (rsiVal < 45) {
        score += 5; signals.push({ label: `RSI ${rsiVal}`, type: 'neutral', msg: 'RSI neutre-bas' });
      } else if (rsiVal > 55) {
        score -= 5; signals.push({ label: `RSI ${rsiVal}`, type: 'neutral', msg: 'RSI neutre-haut' });
      }
    }

    // MACD (0-20 pts)
    const n = prices.length;
    const lastMacd = macdData.macdLine[n - 1];
    const lastSignal = macdData.signalLine[n - 1];
    const lastHist   = macdData.histogram[n - 1];
    const prevHist   = macdData.histogram[n - 2];
    if (lastMacd !== null && lastSignal !== null) {
      if (lastMacd > lastSignal && prevHist !== null && lastHist > prevHist) {
        score += 18; signals.push({ label: 'MACD', type: 'bull', msg: 'MACD > Signal et accélère — signal haussier' });
      } else if (lastMacd > lastSignal) {
        score += 10; signals.push({ label: 'MACD', type: 'bull', msg: 'MACD au-dessus du signal' });
      } else if (lastMacd < lastSignal) {
        score -= 12; signals.push({ label: 'MACD', type: 'bear', msg: 'MACD sous le signal — pression baissière' });
      }
    }

    // Bollinger (0-15 pts)
    const lastPrice = prices[n - 1];
    const bbUpper = bbData.upper[n - 1];
    const bbLower = bbData.lower[n - 1];
    const bbMid   = bbData.mid[n - 1];
    if (bbUpper && bbLower) {
      const bbWidth = (bbUpper - bbLower) / bbMid;
      if (lastPrice <= bbLower * 1.01) {
        score += 15; signals.push({ label: 'Bollinger', type: 'bull', msg: 'Prix sur bande inférieure — survente' });
      } else if (lastPrice >= bbUpper * 0.99) {
        score -= 15; signals.push({ label: 'Bollinger', type: 'bear', msg: 'Prix sur bande supérieure — surachat' });
      }
      if (bbWidth < 0.03) signals.push({ label: 'Bollinger', type: 'neutral', msg: 'Bandes resserrées — breakout imminent' });
    }

    // Tendance (0-20 pts)
    if (trendData.trend === 'haussier') {
      score += 15; signals.push({ label: 'Tendance', type: 'bull', msg: `Tendance haussière (${trendData.bullPoints}/5 MA alignées)` });
    } else if (trendData.trend === 'baissier') {
      score -= 15; signals.push({ label: 'Tendance', type: 'bear', msg: `Tendance baissière (${trendData.bullPoints}/5 MA alignées)` });
    }

    // Volume (0-10 pts)
    if (volData.ratio > 1.5 && trendData.trend === 'haussier') {
      score += 10; signals.push({ label: 'Volume', type: 'bull', msg: 'Volume en hausse confirme la tendance' });
    } else if (volData.ratio < 0.5) {
      score -= 5;  signals.push({ label: 'Volume', type: 'bear', msg: 'Volume faible — signal peu fiable (BRVM illiquide)' });
    }

    return { score: Math.max(0, Math.min(100, Math.round(score))), signals };
  }

  // ─── Analyse complète ──────────────────────────────────────────────────────
  function analyze(stock, settings) {
    const prices  = stock.history || [];
    const volumes = stock.volumes || [];

    if (prices.length < 20) {
      return { score: 50, trend: 'neutre', rsi: null, signals: [],
        metrics: [{ label: 'Données', value: 'Insuffisantes', signal: '⚠️', detail: 'Moins de 20 séances disponibles' }] };
    }

    const ma20arr    = sma(prices, 20);
    const ma50arr    = sma(prices, 50);
    const ma200arr   = sma(prices, prices.length >= 200 ? 200 : Math.floor(prices.length / 2));
    const rsiArr     = rsi(prices, 14);
    const macdData   = macd(prices);
    const bbData     = bollingerBands(prices, 20);
    const volData    = analyzeVolume(volumes, prices);
    const trendData  = detectTrend(prices);
    const srData     = findSupportResistance(prices);
    const patterns   = detectPatterns(prices);

    const n = prices.length;
    const currentPrice = prices[n - 1];
    const currentRSI   = rsiArr[n - 1];
    const ma20val      = ma20arr[n - 1];
    const ma50val      = ma50arr[n - 1] || ma20val;
    const ma200val     = ma200arr[n - 1] || ma50val;

    const { score, signals } = scoreComponents(currentRSI, macdData, bbData, volData, trendData, prices, settings);

    // Construire label signal global
    const techSignal = score >= 65 ? 'ACHAT' : score <= 35 ? 'VENTE' : 'NEUTRE';
    const techLabel  = score >= 65 ? '✅ Signal haussier' : score <= 35 ? '🔴 Signal baissier' : '🟡 Signal neutre';

    const metrics = [
      { label: 'Tendance',         value: trendData.trend.toUpperCase(),         signal: trendData.trend==='haussier'?'✅ Haussier':'🔴 Baissier', detail: `${trendData.bullPoints}/5 MA alignées` },
      { label: 'RSI (14)',          value: currentRSI ? currentRSI.toFixed(1) : '--',
        signal: currentRSI < 30 ? '✅ Survendu' : currentRSI > 70 ? '🔴 Suracheté' : '🟡 Neutre',
        detail: currentRSI < 30 ? 'Zone d\'achat' : currentRSI > 70 ? 'Zone de vente' : 'Zone neutre' },
      { label: 'MACD',              value: macdData.macdLine[n-1]?.toFixed(0) || '--',
        signal: macdData.macdLine[n-1] > macdData.signalLine[n-1] ? '✅ Positif' : '🔴 Négatif',
        detail: 'vs. signal' },
      { label: 'MA20',              value: ma20val?.toFixed(0) || '--', signal: currentPrice > ma20val ? '✅ Prix > MA20' : '🔴 Prix < MA20', detail: '' },
      { label: 'MA50',              value: ma50val?.toFixed(0) || '--', signal: currentPrice > ma50val ? '✅ Prix > MA50' : '🔴 Prix < MA50', detail: '' },
      { label: 'MA200 / long terme',value: ma200val?.toFixed(0) || '--', signal: currentPrice > ma200val ? '✅ Tendance LT haussière' : '🔴 Tendance LT baissière', detail: '' },
      { label: 'Boll. sup.',        value: bbData.upper[n-1]?.toFixed(0) || '--', signal: '🟡', detail: 'Résistance dynamique' },
      { label: 'Boll. inf.',        value: bbData.lower[n-1]?.toFixed(0) || '--', signal: '🟡', detail: 'Support dynamique' },
      { label: 'Support',           value: srData.support.toLocaleString('fr-FR'),    signal: '✅', detail: 'Niveau clé à surveiller' },
      { label: 'Résistance',        value: srData.resistance.toLocaleString('fr-FR'), signal: '🔴', detail: 'Objectif / plafond' },
      { label: 'Volume',            value: volData.ratio.toFixed(1)+'x moy.',         signal: volData.signal, detail: volData.comment }
    ];

    patterns.forEach(p => {
      metrics.push({ label: 'Pattern', value: p.name, signal: p.bull ? '✅' : '🔴', detail: '' });
    });

    return {
      score, techSignal, techLabel,
      trend: trendData.trend, rsi: currentRSI,
      ma20: ma20val, ma50: ma50val, ma200: ma200val,
      support: srData.support, resistance: srData.resistance,
      signals, metrics, patterns,
      chartData: {
        prices: prices.slice(-60),
        ma20:   ma20arr.slice(-60),
        ma50:   ma50arr.slice(-60),
        bbUpper: bbData.upper.slice(-60),
        bbLower: bbData.lower.slice(-60),
        volumes: volumes.slice(-60),
        rsiSeries: rsiArr.slice(-60),
        macdLine: macdData.macdLine.slice(-60),
        macdSignal: macdData.signalLine.slice(-60),
        macdHist: macdData.histogram.slice(-60)
      }
    };
  }

  return { analyze, sma, ema, rsi, macd, bollingerBands, findSupportResistance };
})();
