/**
 * Moteur de graphiques BRVM — Canvas natif (sans dépendance externe)
 */
const BRVMCharts = (() => {

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return { r, g, b };
  }

  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }

  // ─── Graphique de prix avec MA et Bollinger ────────────────────────────────
  function drawPriceChart(canvasId, chartData, stock) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx    = canvas.getContext('2d');
    const dpr    = window.devicePixelRatio || 1;
    const W      = canvas.offsetWidth  || 340;
    const H      = canvas.offsetHeight || 200;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const { prices, ma20, ma50, bbUpper, bbLower, volumes } = chartData;
    if (!prices || prices.length < 2) return;

    const PAD = { top: 12, right: 12, bottom: 36, left: 52 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    // Calcul min/max
    const allPrices = [...prices, ...ma20.filter(v=>v), ...bbUpper.filter(v=>v), ...bbLower.filter(v=>v)];
    const minP = Math.min(...allPrices) * 0.995;
    const maxP = Math.max(...allPrices) * 1.005;
    const n    = prices.length;

    const xOf  = i => PAD.left + (i / (n - 1)) * chartW;
    const yOf  = p => PAD.top + chartH - ((p - minP) / (maxP - minP)) * chartH;

    // Fond
    ctx.fillStyle = '#1A2B3C';
    ctx.fillRect(0, 0, W, H);

    // Grille
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      const price = maxP - ((maxP - minP) / 4) * i;
      ctx.fillStyle = 'rgba(139,167,192,0.8)';
      ctx.font = `${9 * dpr / dpr}px -apple-system,sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(price).toLocaleString('fr-FR'), PAD.left - 4, y + 3);
    }

    // Zones Bollinger
    if (bbUpper[0] && bbLower[0]) {
      ctx.fillStyle = 'rgba(46,134,171,0.08)';
      ctx.beginPath();
      prices.forEach((_, i) => {
        if (bbUpper[i]) {
          i === 0 ? ctx.moveTo(xOf(i), yOf(bbUpper[i])) : ctx.lineTo(xOf(i), yOf(bbUpper[i]));
        }
      });
      for (let i = prices.length - 1; i >= 0; i--) {
        if (bbLower[i]) ctx.lineTo(xOf(i), yOf(bbLower[i]));
      }
      ctx.closePath(); ctx.fill();

      // Lignes Bollinger
      drawLine(ctx, prices.map((_, i) => bbUpper[i] ? {x: xOf(i), y: yOf(bbUpper[i])} : null).filter(Boolean), '#2E86AB', 1, [3,3]);
      drawLine(ctx, prices.map((_, i) => bbLower[i] ? {x: xOf(i), y: yOf(bbLower[i])} : null).filter(Boolean), '#2E86AB', 1, [3,3]);
    }

    // MA50
    const ma50pts = prices.map((_, i) => ma50[i] ? {x: xOf(i), y: yOf(ma50[i])} : null).filter(Boolean);
    drawLine(ctx, ma50pts, '#F4A261', 1.5);

    // MA20
    const ma20pts = prices.map((_, i) => ma20[i] ? {x: xOf(i), y: yOf(ma20[i])} : null).filter(Boolean);
    drawLine(ctx, ma20pts, '#00C896', 1.5);

    // Ligne de prix — couleur selon tendance
    const lastPrice = prices[n-1];
    const firstPrice = prices[0];
    const bullish = lastPrice >= firstPrice;
    const priceColor = bullish ? '#00A651' : '#E63946';

    // Gradient fill sous la courbe
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
    grad.addColorStop(0, rgba(priceColor, 0.25));
    grad.addColorStop(1, rgba(priceColor, 0.02));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(prices[0]));
    prices.forEach((p, i) => ctx.lineTo(xOf(i), yOf(p)));
    ctx.lineTo(xOf(n-1), PAD.top + chartH);
    ctx.lineTo(xOf(0), PAD.top + chartH);
    ctx.closePath(); ctx.fill();

    // Ligne prix
    ctx.strokeStyle = priceColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    prices.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(0), yOf(p)) : ctx.lineTo(xOf(i), yOf(p)));
    ctx.stroke();

    // Volumes (mini barres en bas)
    if (volumes && volumes.length > 0) {
      const maxVol = Math.max(...volumes);
      const volH   = 18;
      volumes.forEach((v, i) => {
        const barH = (v / maxVol) * volH;
        const barW = Math.max(1, chartW / n - 1);
        ctx.fillStyle = rgba(priceColor, 0.3);
        ctx.fillRect(xOf(i) - barW/2, PAD.top + chartH + 4, barW, barH);
      });
    }

    // Prix courant callout
    const lastX = xOf(n-1);
    const lastY = yOf(lastPrice);
    ctx.fillStyle = priceColor;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Légende
    ctx.font = '9px -apple-system,sans-serif';
    ctx.textAlign = 'left';
    const legend = [{color:'#00C896',label:'MA20'},{color:'#F4A261',label:'MA50'},{color:'#2E86AB',label:'Bollinger'}];
    legend.forEach((l, i) => {
      ctx.fillStyle = l.color;
      ctx.fillRect(PAD.left + i * 70, H - 12, 10, 6);
      ctx.fillStyle = 'rgba(139,167,192,0.8)';
      ctx.fillText(l.label, PAD.left + i * 70 + 13, H - 7);
    });
  }

  function drawLine(ctx, points, color, width, dash = []) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  }

  // ─── Graphique RSI ─────────────────────────────────────────────────────────
  function drawRSIChart(canvasId, rsiData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !rsiData) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 340;
    const H = 70;
    canvas.width  = W; canvas.height = H;

    ctx.fillStyle = '#1A2B3C';
    ctx.fillRect(0, 0, W, H);

    const valid = rsiData.filter(v => v !== null);
    if (valid.length < 2) return;

    const PAD  = { left: 36, right: 8, top: 6, bottom: 16 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;
    const n = rsiData.length;
    const xOf = i => PAD.left + (i / (n-1)) * chartW;
    const yOf = v => PAD.top + chartH - ((v - 0) / 100) * chartH;

    // Zones 30/70
    ctx.fillStyle = 'rgba(0,166,81,0.07)';
    ctx.fillRect(PAD.left, yOf(70), chartW, yOf(30) - yOf(70));
    ctx.strokeStyle = 'rgba(0,166,81,0.3)'; ctx.lineWidth = 1;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(70)); ctx.lineTo(W - PAD.right, yOf(70)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(30)); ctx.lineTo(W - PAD.right, yOf(30)); ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = 'rgba(139,167,192,0.7)';
    ctx.font = '8px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('70', PAD.left - 2, yOf(70) + 3);
    ctx.fillText('30', PAD.left - 2, yOf(30) + 3);

    // Courbe RSI
    const pts = rsiData.map((v, i) => v !== null ? { x: xOf(i), y: yOf(v) } : null).filter(Boolean);
    if (pts.length > 1) {
      const lastRSI = valid[valid.length - 1];
      const color = lastRSI < 30 ? '#00A651' : lastRSI > 70 ? '#E63946' : '#2E86AB';
      drawLine(ctx, pts, color, 1.5);

      // Label RSI courant
      ctx.fillStyle = color;
      ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`RSI ${lastRSI.toFixed(0)}`, PAD.left + 2, PAD.top + 10);
    }
  }

  // ─── Graphique portefeuille donut ──────────────────────────────────────────
  function drawPortfolioDonut(canvasId, positions) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !positions || positions.length === 0) return;
    const ctx = canvas.getContext('2d');
    const size = Math.min(canvas.offsetWidth, 200);
    canvas.width  = canvas.offsetWidth || 340;
    canvas.height = 160;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#1A2B3C';
    ctx.fillRect(0, 0, W, H);

    const COLORS = ['#00A651','#F4A261','#2E86AB','#E63946','#6C63FF','#FF6B6B','#4ECDC4','#45B7D1'];
    const total  = positions.reduce((s, p) => s + (p.currentValue || 0), 0);
    if (total === 0) return;

    const cx = 80; const cy = H / 2; const R = 60; const r = 38;
    let startAngle = -Math.PI / 2;

    positions.forEach((pos, i) => {
      const fraction = (pos.currentValue || 0) / total;
      const endAngle = startAngle + fraction * Math.PI * 2;
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath(); ctx.fill();
      startAngle = endAngle;
    });

    // Trou intérieur
    ctx.fillStyle = '#1A2B3C';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Portefeuille', cx, cy - 3);
    ctx.fillStyle = '#8BA7C0';
    ctx.font = '9px sans-serif';
    ctx.fillText(total.toLocaleString('fr-FR') + ' F', cx, cy + 12);

    // Légende
    positions.slice(0, 6).forEach((pos, i) => {
      const y = 24 + i * 22;
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fillRect(170, y - 8, 10, 10);
      ctx.fillStyle = '#F4A261'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(pos.ticker, 185, y);
      ctx.fillStyle = '#8BA7C0'; ctx.font = '9px sans-serif';
      const pct = ((pos.currentValue || 0) / total * 100).toFixed(1);
      ctx.fillText(`${pct}%`, 215, y);
    });
  }

  // ─── Graphique performance portefeuille ────────────────────────────────────
  function drawPerformanceChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 340;
    const H = canvas.offsetHeight || 160;
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = '#1A2B3C';
    ctx.fillRect(0, 0, W, H);

    const PAD = { top: 10, right: 10, bottom: 30, left: 50 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const minV = Math.min(...data) * 0.99;
    const maxV = Math.max(...data) * 1.01;
    const n = data.length;
    const xOf = i => PAD.left + (i / (n-1)) * chartW;
    const yOf = v => PAD.top + chartH - ((v - minV) / (maxV - minV)) * chartH;

    // Grille
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = PAD.top + (chartH / 3) * i;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      const val = maxV - ((maxV - minV) / 3) * i;
      ctx.fillStyle = 'rgba(139,167,192,0.7)';
      ctx.font = '8px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText((val/1000).toFixed(0)+'K', PAD.left - 2, y + 3);
    }

    const bullish = data[n-1] >= data[0];
    const color = bullish ? '#00A651' : '#E63946';

    // Fill gradient
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
    grad.addColorStop(0, rgba(color, 0.3)); grad.addColorStop(1, rgba(color, 0.02));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(data[0]));
    data.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
    ctx.lineTo(xOf(n-1), PAD.top + chartH); ctx.lineTo(xOf(0), PAD.top + chartH);
    ctx.closePath(); ctx.fill();

    // Ligne
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(0), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
    ctx.stroke();
  }

  return { drawPriceChart, drawRSIChart, drawPortfolioDonut, drawPerformanceChart };
})();
