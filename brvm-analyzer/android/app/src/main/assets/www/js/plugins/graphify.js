/**
 * Graphify Plugin — Visualisations avancées pour BRVM Analyser
 * Fournit : chandeliers japonais, profil de volume, oscillateur momentum, radar sectoriel
 */
const BRVMGraphify = (() => {

  // ─── Utilitaires Canvas ──────────────────────────────────────────────────────
  function setupCanvas(canvasId, h) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 340;
    const H = h || canvas.offsetHeight || 220;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1A2B3C';
    ctx.fillRect(0, 0, W, H);
    return { ctx, W, H, dpr };
  }

  function rgba(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function drawGrid(ctx, PAD, W, H, rows, cols) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;
    for (let i = 0; i <= rows; i++) {
      const y = PAD.top + (cH / rows) * i;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    }
    for (let i = 0; i <= cols; i++) {
      const x = PAD.left + (cW / cols) * i;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke();
    }
  }

  // ─── Génération OHLC synthétique à partir de l'historique ────────────────────
  function buildOHLC(history, volumes) {
    if (!history || history.length < 2) return [];
    return history.map((close, i) => {
      const prev = history[i - 1] || close;
      const range = Math.abs(close - prev) * (0.5 + Math.random() * 1.5);
      const open = prev * (1 + (Math.random() - 0.5) * 0.005);
      const high = Math.max(open, close) + range * 0.4 * Math.random();
      const low  = Math.min(open, close) - range * 0.4 * Math.random();
      return { open, high, low, close, volume: volumes ? volumes[i] : 0 };
    });
  }

  // ─── 1. Graphique en Chandeliers Japonais ─────────────────────────────────────
  function drawCandlestick(canvasId, stock) {
    const setup = setupCanvas(canvasId, 240);
    if (!setup) return;
    const { ctx, W, H } = setup;

    const history = stock.history || [];
    const volumes = stock.volumes || [];
    const ohlc = buildOHLC(history.slice(-60), volumes.slice(-60));
    if (ohlc.length < 2) return;

    const PAD = { top: 12, right: 12, bottom: 40, left: 52 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;
    const n = ohlc.length;

    const allPrices = ohlc.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...allPrices) * 0.998;
    const maxP = Math.max(...allPrices) * 1.002;

    const xOf = i => PAD.left + (i + 0.5) * (cW / n);
    const yOf = p => PAD.top + cH - ((p - minP) / (maxP - minP)) * cH;
    const candleW = Math.max(2, cW / n * 0.6);

    drawGrid(ctx, PAD, W, H, 4, 6);

    // Étiquettes axe Y
    ctx.fillStyle = 'rgba(139,167,192,0.8)';
    ctx.font = '9px -apple-system,sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const p = maxP - ((maxP - minP) / 4) * i;
      ctx.fillText(Math.round(p).toLocaleString('fr-FR'), PAD.left - 4, PAD.top + (cH / 4) * i + 4);
    }

    // Volume en arrière-plan
    const maxVol = Math.max(...ohlc.map(c => c.volume || 0));
    if (maxVol > 0) {
      const volH = cH * 0.18;
      ohlc.forEach((c, i) => {
        const bull = c.close >= c.open;
        const bH = ((c.volume || 0) / maxVol) * volH;
        ctx.fillStyle = bull ? rgba('#00A651', 0.25) : rgba('#E63946', 0.25);
        ctx.fillRect(xOf(i) - candleW / 2, PAD.top + cH - bH, candleW, bH);
      });
    }

    // Chandeliers
    ohlc.forEach((c, i) => {
      const bull = c.close >= c.open;
      const color = bull ? '#00A651' : '#E63946';
      const x = xOf(i);
      const yOpen  = yOf(c.open);
      const yClose = yOf(c.close);
      const yHigh  = yOf(c.high);
      const yLow   = yOf(c.low);
      const bodyTop    = Math.min(yOpen, yClose);
      const bodyBottom = Math.max(yOpen, yClose);
      const bodyH = Math.max(1, bodyBottom - bodyTop);

      // Mèche
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, bodyTop);
      ctx.moveTo(x, bodyBottom);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Corps
      ctx.fillStyle = bull ? rgba('#00A651', 0.85) : rgba('#E63946', 0.85);
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH);
    });

    // Étiquettes axe X (dates synthétiques — J-60 à J-1)
    ctx.fillStyle = 'rgba(139,167,192,0.6)';
    ctx.font = '8px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    const labelStep = Math.floor(n / 5);
    for (let i = 0; i < n; i += labelStep) {
      ctx.fillText(`J-${n - i}`, xOf(i), H - PAD.bottom + 12);
    }

    // Titre
    ctx.fillStyle = 'rgba(139,167,192,0.9)';
    ctx.font = 'bold 10px -apple-system,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Chandeliers Japonais — 60 séances', PAD.left, PAD.top - 2);
  }

  // ─── 2. Profil de Volume (Volume Profile) ────────────────────────────────────
  function drawVolumeProfile(canvasId, stock) {
    const setup = setupCanvas(canvasId, 200);
    if (!setup) return;
    const { ctx, W, H } = setup;

    const history = stock.history || [];
    const volumes = stock.volumes || [];
    if (history.length < 10) return;

    const PAD = { top: 20, right: 100, bottom: 30, left: 52 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;

    // Discrétiser les prix en 20 niveaux
    const BINS = 20;
    const minP = Math.min(...history) * 0.998;
    const maxP = Math.max(...history) * 1.002;
    const binSize = (maxP - minP) / BINS;
    const profile = new Array(BINS).fill(0);

    history.forEach((p, i) => {
      const bin = Math.min(BINS - 1, Math.floor((p - minP) / binSize));
      profile[bin] += (volumes[i] || 0);
    });

    const maxBin = Math.max(...profile);
    const currentPrice = stock.close || stock.price || history[history.length - 1];
    const poc = profile.indexOf(maxBin); // Point of Control

    drawGrid(ctx, PAD, W, H, 4, 4);

    // Barres horizontales du profil de volume
    profile.forEach((vol, i) => {
      const barH = (cH / BINS) - 1;
      const y = PAD.top + cH - (i + 1) * (cH / BINS);
      const barW = maxBin > 0 ? (vol / maxBin) * cW * 0.85 : 0;
      const priceLevel = minP + (i + 0.5) * binSize;
      const isPOC = i === poc;
      const isCurrent = Math.abs(priceLevel - currentPrice) < binSize;

      ctx.fillStyle = isPOC
        ? rgba('#F4A261', 0.9)
        : isCurrent
          ? rgba('#2E86AB', 0.8)
          : rgba('#8BA7C0', 0.3);
      ctx.fillRect(PAD.left, y, barW, barH);

      // Étiquette prix
      ctx.fillStyle = isPOC ? '#F4A261' : 'rgba(139,167,192,0.7)';
      ctx.font = `${isPOC ? 'bold ' : ''}8px -apple-system,sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(priceLevel).toLocaleString('fr-FR'), PAD.left - 2, y + barH / 2 + 3);
    });

    // Légende droite
    ctx.font = '9px -apple-system,sans-serif';
    ctx.textAlign = 'left';
    const pocPrice = minP + (poc + 0.5) * binSize;
    const legend = [
      { color: '#F4A261', label: `POC ${Math.round(pocPrice).toLocaleString('fr-FR')} F` },
      { color: '#2E86AB', label: `Prix actuel` },
      { color: '#8BA7C0', label: 'Volume' }
    ];
    legend.forEach((l, i) => {
      ctx.fillStyle = l.color;
      ctx.fillRect(W - PAD.right + 8, PAD.top + i * 22, 10, 8);
      ctx.fillStyle = 'rgba(139,167,192,0.8)';
      ctx.fillText(l.label, W - PAD.right + 22, PAD.top + i * 22 + 7);
    });

    // Titre
    ctx.fillStyle = 'rgba(139,167,192,0.9)';
    ctx.font = 'bold 10px -apple-system,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Profil de Volume', PAD.left, PAD.top - 6);
  }

  // ─── 3. Oscillateur Momentum (Stochastique + MACD histogram) ─────────────────
  function drawMomentum(canvasId, stock) {
    const setup = setupCanvas(canvasId, 180);
    if (!setup) return;
    const { ctx, W, H } = setup;

    const prices = stock.history || [];
    if (prices.length < 26) return;

    const PAD = { top: 24, right: 12, bottom: 30, left: 44 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;
    const n = prices.length;

    // Stochastique %K et %D
    const stochK = new Array(n).fill(null);
    const stochD = new Array(n).fill(null);
    const kPeriod = 14;
    const dPeriod = 3;
    for (let i = kPeriod - 1; i < n; i++) {
      const slice = prices.slice(i - kPeriod + 1, i + 1);
      const lo = Math.min(...slice);
      const hi = Math.max(...slice);
      stochK[i] = hi === lo ? 50 : ((prices[i] - lo) / (hi - lo)) * 100;
    }
    for (let i = kPeriod + dPeriod - 2; i < n; i++) {
      const slice = stochK.slice(i - dPeriod + 1, i + 1).filter(v => v !== null);
      if (slice.length === dPeriod) stochD[i] = slice.reduce((a,b) => a+b, 0) / dPeriod;
    }

    // MACD histogram simplifié
    function ema(arr, period) {
      const k = 2 / (period + 1);
      const res = new Array(arr.length).fill(null);
      let inited = false;
      arr.forEach((v, i) => {
        if (!inited && i >= period - 1) {
          res[i] = arr.slice(i - period + 1, i + 1).reduce((a,b) => a+b,0) / period;
          inited = true;
        } else if (inited) {
          res[i] = v * k + res[i-1] * (1-k);
        }
      });
      return res;
    }
    const ema12 = ema(prices, 12);
    const ema26 = ema(prices, 26);
    const macdLine = prices.map((_, i) =>
      ema12[i] !== null && ema26[i] !== null ? ema12[i] - ema26[i] : null);
    const validMacd = macdLine.filter(v => v !== null);
    const sig = ema(validMacd, 9);
    const offset = macdLine.findIndex(v => v !== null);
    const histogram = macdLine.map((v, i) => {
      if (v === null) return null;
      const si = i - offset;
      return sig[si] !== null ? v - sig[si] : null;
    });

    drawGrid(ctx, PAD, W, H, 4, 6);

    // Section haute : Stochastique (60% de la hauteur)
    const sH = cH * 0.55;
    const xOf = i => PAD.left + (i / (n - 1)) * cW;
    const yStoch = v => PAD.top + sH - (v / 100) * sH;

    // Zones 20/80
    ctx.fillStyle = 'rgba(0,166,81,0.07)';
    ctx.fillRect(PAD.left, yStoch(80), cW, yStoch(20) - yStoch(80));
    [20, 80].forEach(level => {
      ctx.strokeStyle = rgba(level === 80 ? '#E63946' : '#00A651', 0.4);
      ctx.lineWidth = 1; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(PAD.left, yStoch(level)); ctx.lineTo(W - PAD.right, yStoch(level)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(139,167,192,0.6)';
      ctx.font = '7px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(level, PAD.left - 2, yStoch(level) + 3);
    });

    // Courbe %K
    ctx.strokeStyle = '#00C896'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath();
    let first = true;
    stochK.forEach((v, i) => {
      if (v === null) return;
      first ? ctx.moveTo(xOf(i), yStoch(v)) : ctx.lineTo(xOf(i), yStoch(v));
      first = false;
    });
    ctx.stroke();

    // Courbe %D
    ctx.strokeStyle = '#F4A261'; ctx.lineWidth = 1;
    ctx.beginPath(); first = true;
    stochD.forEach((v, i) => {
      if (v === null) return;
      first ? ctx.moveTo(xOf(i), yStoch(v)) : ctx.lineTo(xOf(i), yStoch(v));
      first = false;
    });
    ctx.stroke();

    // Section basse : MACD Histogram (35% de la hauteur)
    const mTop = PAD.top + sH + 8;
    const mH = cH - sH - 8;
    const validH = histogram.filter(v => v !== null);
    if (validH.length > 0) {
      const maxH = Math.max(...validH.map(Math.abs)) || 1;
      const yMid = mTop + mH / 2;
      const yMacd = v => yMid - (v / maxH) * (mH / 2);
      histogram.forEach((v, i) => {
        if (v === null) return;
        const x = xOf(i);
        const barH = Math.abs(yMacd(v) - yMid);
        ctx.fillStyle = v >= 0 ? rgba('#00A651', 0.7) : rgba('#E63946', 0.7);
        ctx.fillRect(x - 1, Math.min(yMid, yMacd(v)), 2, Math.max(1, barH));
      });
      // Ligne zéro
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, yMid); ctx.lineTo(W - PAD.right, yMid); ctx.stroke();
    }

    // Légendes
    ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'left';
    [['#00C896', 'Stoch %K'], ['#F4A261', 'Stoch %D']].forEach(([c, l], i) => {
      ctx.fillStyle = c;
      ctx.fillRect(PAD.left + i * 80, 4, 8, 6);
      ctx.fillStyle = 'rgba(139,167,192,0.8)';
      ctx.fillText(l, PAD.left + i * 80 + 11, 10);
    });
    ctx.fillStyle = '#00A651';
    ctx.fillRect(PAD.left + 160, 4, 8, 6);
    ctx.fillStyle = 'rgba(139,167,192,0.8)';
    ctx.fillText('MACD Histo', PAD.left + 173, 10);
  }

  // ─── 4. Radar — Comparaison des scores par dimension ─────────────────────────
  function drawScoreRadar(canvasId, stock) {
    const setup = setupCanvas(canvasId, 200);
    if (!setup) return;
    const { ctx, W, H } = setup;

    // Scores normalisés 0-100
    const scores = {
      'Fondamental': Math.min(100, Math.max(0, stock.fundamentalScore || 50)),
      'Technique':   Math.min(100, Math.max(0, stock.technicalScore   || 50)),
      'Psychologie': Math.min(100, Math.max(0, stock.psychologicalScore || 50)),
      'Dividende':   Math.min(100, stock.dividendPerShare && stock.price
        ? Math.min(100, (stock.dividendPerShare / stock.price) * 1000) : 30),
      'Liquidité':   Math.min(100, stock.volume && stock.volumeAvg20
        ? Math.min(100, (stock.volume / stock.volumeAvg20) * 50) : 40),
      'Momentum':    Math.min(100, Math.max(0,
        stock.rsi ? (stock.rsi < 50 ? stock.rsi * 1.2 : 100 - (stock.rsi - 50) * 1.2) : 50))
    };

    const labels = Object.keys(scores);
    const values = Object.values(scores);
    const N = labels.length;
    const cx = W / 2;
    const cy = H / 2 + 10;
    const R = Math.min(W, H) * 0.35;
    const angleStep = (Math.PI * 2) / N;

    const toXY = (i, r) => ({
      x: cx + r * Math.cos(i * angleStep - Math.PI / 2),
      y: cy + r * Math.sin(i * angleStep - Math.PI / 2)
    });

    // Toiles d'araignée
    [0.25, 0.5, 0.75, 1.0].forEach(fraction => {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      labels.forEach((_, i) => {
        const pt = toXY(i, R * fraction);
        i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath(); ctx.stroke();
    });

    // Axes
    labels.forEach((_, i) => {
      const pt = toXY(i, R);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(pt.x, pt.y); ctx.stroke();
    });

    // Polygone de données
    ctx.fillStyle = rgba('#2E86AB', 0.2);
    ctx.strokeStyle = '#2E86AB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const pt = toXY(i, R * (v / 100));
      i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Points
    values.forEach((v, i) => {
      const pt = toXY(i, R * (v / 100));
      ctx.fillStyle = '#2E86AB';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
    });

    // Étiquettes
    ctx.font = '9px -apple-system,sans-serif';
    labels.forEach((label, i) => {
      const pt = toXY(i, R + 18);
      const val = values[i];
      const textX = pt.x;
      const textY = pt.y;
      ctx.textAlign = textX < cx - 5 ? 'right' : textX > cx + 5 ? 'left' : 'center';
      ctx.fillStyle = '#F4A261';
      ctx.font = 'bold 9px -apple-system,sans-serif';
      ctx.fillText(label, textX, textY);
      ctx.fillStyle = 'rgba(139,167,192,0.8)';
      ctx.font = '8px -apple-system,sans-serif';
      ctx.fillText(`${Math.round(val)}%`, textX, textY + 11);
    });

    // Titre
    ctx.fillStyle = 'rgba(139,167,192,0.9)';
    ctx.font = 'bold 10px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Radar de Scores', cx, 12);
  }

  // ─── Rendu principal ──────────────────────────────────────────────────────────
  function render(canvasPrefix, stock) {
    if (!stock) return;
    drawCandlestick(canvasPrefix + 'Candle', stock);
    drawVolumeProfile(canvasPrefix + 'VolumeProfile', stock);
    drawMomentum(canvasPrefix + 'Momentum', stock);
    drawScoreRadar(canvasPrefix + 'Radar', stock);
  }

  // ─── HTML du panneau Graphify ─────────────────────────────────────────────────
  function buildPanel() {
    return `
      <div class="graphify-panel">
        <div class="graphify-section">
          <div class="graphify-title">Chandeliers Japonais</div>
          <div class="chart-container"><canvas id="graphifyCandle" height="240"></canvas></div>
        </div>
        <div class="graphify-section">
          <div class="graphify-title">Profil de Volume</div>
          <div class="chart-container"><canvas id="graphifyVolumeProfile" height="200"></canvas></div>
        </div>
        <div class="graphify-section">
          <div class="graphify-title">Oscillateur Momentum (Stoch + MACD)</div>
          <div class="chart-container"><canvas id="graphifyMomentum" height="180"></canvas></div>
        </div>
        <div class="graphify-section">
          <div class="graphify-title">Radar Multi-Dimensions</div>
          <div class="chart-container" style="max-width:300px;margin:0 auto">
            <canvas id="graphifyRadar" height="200"></canvas>
          </div>
        </div>
      </div>
    `;
  }

  return { render, buildPanel };
})();
