/**
 * Générateur de Rapports PDF BRVM
 * Génère des rapports PDF complets sans dépendance externe (pur Canvas + jsPDF-like)
 * Utilise une implémentation légère de génération PDF en base64
 */
const PDFGenerator = (() => {

  // ─── Encodage PDF pur JavaScript ────────────────────────────────────────────
  // Implémentation minimaliste d'un générateur PDF (RFC 3200)
  class MiniPDF {
    constructor() {
      this.objects = [];
      this.pages   = [];
      this.fonts   = { Helvetica: 1, 'Helvetica-Bold': 2 };
      this.currentPage = null;
      this.width  = 595;  // A4
      this.height = 842;
      this.margin = 40;
      this.lineHeight = 14;
      this.currentY = 0;
      this.pageContent = [];
    }

    addObject(content) {
      this.objects.push(content);
      return this.objects.length;
    }

    addPage() {
      this.pageContent.push([]);
      this.currentPage = this.pageContent.length - 1;
      this.currentY = this.height - this.margin;
      this.pages.push([]);
      return this;
    }

    setFont(name, size) {
      this._font = name;
      this._size = size;
      this._emit(`BT\n/F${this.fonts[name] || 1} ${size} Tf`);
      return this;
    }

    setColor(r, g, b) {
      this._emit(`${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)} rg`);
      return this;
    }

    setStrokeColor(r, g, b) {
      this._emit(`${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)} RG`);
      return this;
    }

    text(str, x, y, opts = {}) {
      const safeStr = (str || '').toString()
        .replace(/[^\x20-\x7EÀ-ɏ]/g, '?')
        .replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      this._emit(`${x} ${y} Td\n(${safeStr}) Tj\nET\nBT\n/F${this.fonts[this._font]||1} ${this._size||10} Tf`);
      return this;
    }

    line(x1, y1, x2, y2) {
      this._emit(`ET\n${x1} ${y1} m\n${x2} ${y2} l\nS\nBT\n/F${this.fonts[this._font]||1} ${this._size||10} Tf`);
      return this;
    }

    rect(x, y, w, h, fill = false) {
      this._emit(`ET\n${x} ${y} ${w} ${h} re\n${fill ? 'f' : 'S'}\nBT\n/F${this.fonts[this._font]||1} ${this._size||10} Tf`);
      return this;
    }

    _emit(cmd) {
      if (this.currentPage === null) this.addPage();
      this.pageContent[this.currentPage].push(cmd);
    }

    // ── Helpers de haut niveau ──
    title(text, y) {
      this.setFont('Helvetica-Bold', 18).setColor(27, 79, 114);
      this.text(text, this.margin, y);
      this.setFont('Helvetica', 10).setColor(0, 0, 0);
    }

    h2(text, y) {
      this.setFont('Helvetica-Bold', 13).setColor(0, 166, 81);
      this.text(text, this.margin, y);
      this.setFont('Helvetica', 10).setColor(0, 0, 0);
    }

    h3(text, y) {
      this.setFont('Helvetica-Bold', 11).setColor(27, 79, 114);
      this.text(text, this.margin, y);
      this.setFont('Helvetica', 10).setColor(0, 0, 0);
    }

    body(text, x, y) {
      this.setFont('Helvetica', 9.5).setColor(50, 50, 50);
      this.text(text, x, y);
    }

    separator(y) {
      this.setStrokeColor(200, 200, 200);
      this.line(this.margin, y, this.width - this.margin, y);
      this.setStrokeColor(0, 0, 0);
    }

    generate() {
      const lines = ['%PDF-1.4'];
      const offsets = [];

      // Font resources
      const fontDict = Object.entries(this.fonts).map(([name, id]) =>
        `/F${id} << /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`
      ).join('\n');

      this.pages.forEach((_, pi) => {
        const content = (this.pageContent[pi] || []).join('\n');
        const stream = `BT\n/F1 10 Tf\nET\n` + content;

        // Content stream
        offsets.push(lines.join('\n').length + 1);
        const streamObj = `${this.objects.length + pi * 2 + 1} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`;
        lines.push(streamObj);

        // Page object
        offsets.push(lines.join('\n').length + 1);
        const pageObj = `${this.objects.length + pi * 2 + 2} 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Contents ${this.objects.length + pi * 2 + 1} 0 R /Resources << /Font << ${Object.entries(this.fonts).map(([n,id])=>`/F${id} ${this.objects.length + pi * 2 + 1} 0 R`).join(' ')  } >> >> >>\nendobj`;
        lines.push(pageObj);
      });

      // Catalog, Pages
      lines.unshift(`1 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj`);
      lines.unshift(`2 0 obj\n<< /Type /Info /Title (Rapport BRVM) /Producer (BRVM Analyser 1.0) >>\nendobj`);
      const pageRefs = this.pages.map((_, i) => `${this.objects.length + i * 2 + 2} 0 R`).join(' ');
      lines.unshift(`3 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${this.pages.length} >>\nendobj`);

      const xrefOffset = lines.join('\n').length + 1;
      const xref = `xref\n0 ${lines.length + 1}\n0000000000 65535 f \n` +
        offsets.map(o => o.toString().padStart(10, '0') + ' 00000 n ').join('\n');
      lines.push(xref);
      lines.push(`trailer\n<< /Size ${lines.length} /Root 1 0 R /Info 2 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

      return lines.join('\n');
    }
  }

  // ─── Génération rapport d'analyse d'un titre ────────────────────────────────
  function generateStockReport(analysisResult) {
    const { stock, fundamental, technical, psychological,
            globalScore, decision, targets, reasons, scores, decisions } = analysisResult;

    // Utiliser Canvas pour convertir en image puis en PDF
    // Pour les appareils Android, on génère un HTML qui sera converti
    return generateHTMLReport(analysisResult);
  }

  // ─── Rapport HTML → PDF via Print ──────────────────────────────────────────
  function generateHTMLReport(analysisResult) {
    const { stock, fundamental, technical, psychological,
            globalScore, decision, targets, reasons, scores, decisions } = analysisResult;
    const date = new Date().toLocaleDateString('fr-FR', {
      weekday:'long', day:'numeric', month:'long', year:'numeric'
    });
    const fund = fundamental;
    const tech = technical;
    const psych = psychological;

    const scoreColor = s => s >= 65 ? '#00A651' : s >= 45 ? '#F4A261' : '#E63946';
    const actionColor = a => a === 'ACHAT' ? '#00A651' : a === 'VENTE' ? '#E63946' : '#F4A261';
    const pct = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
    const fcfa = n => (n || 0).toLocaleString('fr-FR') + ' FCFA';

    const change = stock.priceYesterday ? ((stock.price - stock.priceYesterday) / stock.priceYesterday * 100) : 0;

    const profileRows = Object.entries(decisions).map(([p, d]) => `
      <tr>
        <td>${ScoringEngine.PROFILE_LABELS[p]}</td>
        <td style="color:${actionColor(d.action)};font-weight:700">${d.label}</td>
        <td style="color:${scoreColor(scores[p])};font-weight:700">${scores[p]}/100</td>
        <td>${d.confidence}%</td>
      </tr>`).join('');

    const metricsF = fund.metrics.map(m => `
      <tr><td>${m.label}</td><td style="font-weight:600">${m.value}</td>
      <td>${m.signal}</td><td style="color:#666;font-size:11px">${m.detail || ''}</td></tr>`).join('');

    const metricsT = tech.metrics.slice(0, 8).map(m => `
      <tr><td>${m.label}</td><td style="font-weight:600">${m.value}</td>
      <td>${m.signal}</td><td style="color:#666;font-size:11px">${m.detail || ''}</td></tr>`).join('');

    const metricsP = psych.metrics.map(m => `
      <tr><td>${m.label}</td><td style="font-weight:600">${m.value}</td>
      <td>${m.signal}</td><td style="color:#666;font-size:11px">${m.detail || ''}</td></tr>`).join('');

    const reasonsHTML = reasons.map(r => `<li>${r.icon} ${r.text}</li>`).join('');
    const eventsHTML  = (psych.events || []).map(e =>
      `<li>${e.icon} <strong>${e.title}</strong>: ${e.desc} — <em>${e.impact}</em></li>`).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; padding: 20px; }
  .header { background: #0D1B2A; color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
  .header h1 { font-size: 22px; color: #F4A261; margin-bottom: 4px; }
  .header .subtitle { color: #8BA7C0; font-size: 12px; }
  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .section-title { font-size: 14px; font-weight: 700; color: #1B4F72; border-bottom: 2px solid #00A651; padding-bottom: 6px; margin-bottom: 12px; }
  .stock-info { display: flex; justify-content: space-between; background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
  .stock-price { font-size: 28px; font-weight: 900; }
  .stock-change { font-size: 14px; font-weight: 700; }
  .verdict-box { text-align: center; padding: 20px; border-radius: 8px; border: 2px solid; margin-bottom: 15px; }
  .scores-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 15px; }
  .score-card { text-align: center; padding: 12px; background: #f8f9fa; border-radius: 8px; }
  .score-val { font-size: 24px; font-weight: 900; }
  .score-lbl { font-size: 10px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #1B4F72; color: white; padding: 7px 8px; text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .targets-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .target-card { text-align: center; padding: 10px; background: #f8f9fa; border-radius: 6px; }
  .target-val { font-size: 16px; font-weight: 700; }
  .target-lbl { font-size: 10px; color: #666; }
  ul { padding-left: 18px; }
  li { margin-bottom: 5px; line-height: 1.5; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #999; text-align: center; }
  .page-break { page-break-before: always; }
  @media print {
    body { padding: 0; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>📊 BRVM ANALYSER — Rapport d'Analyse</h1>
  <div class="subtitle">Analyse Fondamentale · Technique · Psychologique | ${date}</div>
</div>

<!-- TITRE ET PRIX -->
<div class="section">
  <div class="stock-info">
    <div>
      <div style="font-size:20px;font-weight:900;color:#F4A261">${stock.ticker}</div>
      <div style="color:#555;margin-top:3px">${stock.name}</div>
      <div style="color:#777;font-size:11px">${stock.sector} · ${stock.country}</div>
    </div>
    <div style="text-align:right">
      <div class="stock-price">${(stock.price||0).toLocaleString('fr-FR')} FCFA</div>
      <div class="stock-change" style="color:${change>=0?'#00A651':'#E63946'}">${pct(change)}</div>
      <div style="font-size:10px;color:#777">Plus haut 52s: ${(stock.price52wHigh||'-').toLocaleString('fr-FR')} · Plus bas: ${(stock.price52wLow||'-').toLocaleString('fr-FR')}</div>
    </div>
  </div>
</div>

<!-- SCORES GLOBAUX -->
<div class="section">
  <div class="section-title">SCORES D'ANALYSE</div>
  <div class="scores-grid">
    <div class="score-card">
      <div class="score-val" style="color:${scoreColor(fund.score)}">${fund.score}/100</div>
      <div class="score-lbl">Score Fondamental</div>
    </div>
    <div class="score-card">
      <div class="score-val" style="color:${scoreColor(tech.score)}">${tech.score}/100</div>
      <div class="score-lbl">Score Technique</div>
    </div>
    <div class="score-card">
      <div class="score-val" style="color:${scoreColor(psych.score)}">${psych.score}/100</div>
      <div class="score-lbl">Score Psychologique</div>
    </div>
  </div>
</div>

<!-- VERDICT PAR PROFIL -->
<div class="section">
  <div class="section-title">ORIENTATION PAR PROFIL INVESTISSEUR</div>
  <table>
    <tr><th>Profil</th><th>Orientation</th><th>Score</th><th>Confiance</th></tr>
    ${profileRows}
  </table>
</div>

<!-- OBJECTIFS DE PRIX -->
<div class="section">
  <div class="section-title">OBJECTIFS DE PRIX</div>
  <div class="targets-grid">
    <div class="target-card">
      <div class="target-val" style="color:#00A651">${(targets.bullTarget||0).toLocaleString('fr-FR')}</div>
      <div class="target-lbl">Objectif haussier</div>
    </div>
    <div class="target-card">
      <div class="target-val" style="color:#1B4F72">${(targets.dcfTarget||0).toLocaleString('fr-FR')}</div>
      <div class="target-lbl">Valeur DCF</div>
    </div>
    <div class="target-card">
      <div class="target-val" style="color:#F4A261">${(targets.midTarget||0).toLocaleString('fr-FR')}</div>
      <div class="target-lbl">Objectif médian</div>
    </div>
    <div class="target-card">
      <div class="target-val" style="color:#E63946">${(targets.stopLoss||0).toLocaleString('fr-FR')}</div>
      <div class="target-lbl">Stop-loss suggéré</div>
    </div>
  </div>
</div>

<!-- RAISONS -->
<div class="section">
  <div class="section-title">PRINCIPAUX FACTEURS</div>
  <ul>${reasonsHTML}</ul>
</div>

<!-- PAGE 2: ANALYSE FONDAMENTALE -->
<div class="page-break"></div>
<div class="section">
  <div class="section-title">ANALYSE FONDAMENTALE (Score: ${fund.score}/100 — Note: ${fund.grade})</div>
  <table>
    <tr><th>Indicateur</th><th>Valeur</th><th>Signal</th><th>Commentaire</th></tr>
    ${metricsF}
  </table>
</div>

<!-- ANALYSE TECHNIQUE -->
<div class="section">
  <div class="section-title">ANALYSE TECHNIQUE (Score: ${tech.score}/100 — ${tech.techLabel||''})</div>
  <table>
    <tr><th>Indicateur</th><th>Valeur</th><th>Signal</th><th>Commentaire</th></tr>
    ${metricsT}
  </table>
</div>

<!-- ANALYSE PSYCHOLOGIQUE -->
<div class="section">
  <div class="section-title">ANALYSE PSYCHOLOGIQUE & COMPORTEMENTALE (Score: ${psych.score}/100)</div>
  <table>
    <tr><th>Facteur</th><th>État</th><th>Signal</th><th>Commentaire</th></tr>
    ${metricsP}
  </table>
  ${eventsHTML ? `<br><strong>Événements à surveiller:</strong><ul>${eventsHTML}</ul>` : ''}
</div>

<!-- DISCLAIMER -->
<div class="footer">
  <strong>AVERTISSEMENT:</strong> Ce rapport est produit par BRVM Analyser à des fins d'information uniquement.
  Il ne constitue pas un conseil en investissement. Les performances passées ne préjugent pas des performances futures.
  Investir en bourse comporte des risques de perte en capital. Consultez un conseiller financier agréé.
  <br>Généré le ${date} · BRVM Analyser v1.0 · © 2025
</div>

</body>
</html>`;

    return html;
  }

  // ─── Export via AndroidBridge ou impression ─────────────────────────────────
  async function downloadReport(analysisResult, type = 'stock') {
    const html = type === 'recommendations'
      ? generateRecoReport(analysisResult)
      : generateHTMLReport(analysisResult);

    const filename = `BRVM_${type === 'recommendations' ? 'Recommandations' : analysisResult.stock?.ticker}_${new Date().toISOString().slice(0,10)}.html`;

    // Méthode 1: Téléchargement direct via blob
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch {}

    // Méthode 2: Nouvelle fenêtre pour impression
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 800);
      return true;
    }

    // Méthode 3: AndroidBridge base64
    if (typeof AndroidBridge !== 'undefined') {
      try {
        const b64 = btoa(unescape(encodeURIComponent(html)));
        AndroidBridge.savePdfToStorage(b64, filename.replace('.html', '.html'));
        return true;
      } catch {}
    }
    return false;
  }

  // ─── Rapport recommandations quotidiennes ───────────────────────────────────
  function generateRecoReport(recoData) {
    const { buys, holds, sells, date, sentiment, profile } = recoData;
    const date2 = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const profileLabel = ScoringEngine.PROFILE_LABELS[profile] || profile;

    const stockRow = (r, type) => {
      const color = type==='BUY'?'#00A651':type==='SELL'?'#E63946':'#F4A261';
      const yld = ((r.stock.dividendPerShare||0)/(r.stock.price||1)*100).toFixed(1);
      const per = ((r.stock.price||0)/(r.stock.eps||1)).toFixed(1);
      return `<tr>
        <td style="font-weight:700;color:#F4A261">${r.stock.ticker}</td>
        <td>${r.stock.name}</td>
        <td style="color:${color};font-weight:700">${r.decision.label}</td>
        <td style="font-weight:700">${r.globalScore}/100</td>
        <td>${(r.stock.price||0).toLocaleString('fr-FR')}</td>
        <td>${yld}%</td>
        <td>${per}x</td>
        <td style="font-size:10px">${r.reasons[0]?.text||''}</td>
      </tr>`;
    };

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:12px;padding:20px;color:#1a1a1a}
  .header{background:#0D1B2A;color:white;padding:20px;border-radius:8px;margin-bottom:20px}
  .header h1{font-size:20px;color:#F4A261}
  .section-title{font-size:14px;font-weight:700;color:#1B4F72;border-bottom:2px solid #00A651;padding-bottom:6px;margin:16px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#1B4F72;color:white;padding:7px 8px;text-align:left}
  td{padding:6px 8px;border-bottom:1px solid #eee}
  tr:nth-child(even) td{background:#f9f9f9}
  .sentiment{padding:12px;border-radius:8px;background:#f0f8f4;margin-bottom:15px;border-left:4px solid #00A651}
  .footer{margin-top:20px;padding-top:10px;border-top:1px solid #ddd;font-size:10px;color:#999;text-align:center}
</style></head><body>
<div class="header">
  <h1>⭐ BRVM ANALYSER — Recommandations Quotidiennes</h1>
  <div style="color:#8BA7C0;font-size:12px">${date2} · Profil: ${profileLabel}</div>
</div>
<div class="sentiment">
  <strong>Sentiment du marché:</strong> ${sentiment.label} — ${sentiment.description}
</div>
${buys.length > 0 ? `
<div class="section-title">🟢 ACHATS RECOMMANDÉS (${buys.length})</div>
<table><tr><th>Ticker</th><th>Nom</th><th>Signal</th><th>Score</th><th>Prix</th><th>Rdt</th><th>PER</th><th>Raison principale</th></tr>
${buys.map(r => stockRow(r, 'BUY')).join('')}</table>` : ''}
${holds.length > 0 ? `
<div class="section-title">🟡 À CONSERVER (${holds.length})</div>
<table><tr><th>Ticker</th><th>Nom</th><th>Signal</th><th>Score</th><th>Prix</th><th>Rdt</th><th>PER</th><th>Raison principale</th></tr>
${holds.map(r => stockRow(r, 'HOLD')).join('')}</table>` : ''}
${sells.length > 0 ? `
<div class="section-title">🔴 À ALLÉGER (${sells.length})</div>
<table><tr><th>Ticker</th><th>Nom</th><th>Signal</th><th>Score</th><th>Prix</th><th>Rdt</th><th>PER</th><th>Raison principale</th></tr>
${sells.map(r => stockRow(r, 'SELL')).join('')}</table>` : ''}
<div class="footer">
  Avertissement: Ce rapport est fourni à titre informatif uniquement. Ne constitue pas un conseil en investissement. · BRVM Analyser v1.0
</div>
</body></html>`;
  }

  return { generateStockReport, downloadReport, generateRecoReport };
})();
