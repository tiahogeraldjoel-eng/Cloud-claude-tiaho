/* Studio Joe — Tableur Joe : fichiers (xlsx, csv, joetab, PDF), graphiques, mise en forme conditionnelle,
   tri, filtre, recherche, dialogues, modèles et assistant IA. S'appuie sur window.TableurJoe (sheet-app.js). */
(function () {
  const { $, toast, download, pickFiles, baseName, modal, confirmBox, onDropFiles } = Studio;
  const F = Studio.formula;
  const T = window.TableurJoe;
  const esc = T.esc;
  const PALETTE = ['#1f7a46', '#d9861c', '#1f6fd1', '#c0392b', '#7b3fa0', '#0b8a8a', '#8a6d1f', '#5d6578', '#e05d9a', '#4f9d2d'];

  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); });
    return loaded[src];
  }
  const fmtNum = (v) => F.format(v, Math.abs(v) >= 1000 ? '#,##0.##' : 'General').text.replace(/,$/, '');
  const cellText = (s, r, c) => { const S = T.wb.sheets[s]; const cl = S.cells.get(T.K(r, c)); if (!cl) return ''; return F.format(T.eng.value(s, r, c), cl.s && cl.s.fmt).text; };

  /* zone de données autour de la cellule active (comme Ctrl+A dans Excel) */
  function currentRegion() {
    const g = T.selRect();
    if (g.r1 !== g.r2 || g.c1 !== g.c2) return T.boundSel(g);
    const S = T.sh(); const has = (r, c) => { if (r < 0 || c < 0) return false; const x = S.cells.get(T.K(r, c)); return !!x && (x.f != null || (x.v !== undefined && x.v !== null && x.v !== '')); };
    let r1 = g.r1, r2 = g.r1, c1 = g.c1, c2 = g.c1, grown = true;
    while (grown) {
      grown = false;
      const rowHas = (r) => { for (let c = c1 - 1; c <= c2 + 1; c++) if (has(r, c)) return true; return false; };
      const colHas = (c) => { for (let r = r1 - 1; r <= r2 + 1; r++) if (has(r, c)) return true; return false; };
      if (r1 > 0 && rowHas(r1 - 1)) { r1--; grown = true; }
      if (rowHas(r2 + 1)) { r2++; grown = true; }
      if (c1 > 0 && colHas(c1 - 1)) { c1--; grown = true; }
      if (colHas(c2 + 1)) { c2++; grown = true; }
    }
    return { r1, c1, r2, c2 };
  }
  function looksLikeHeader(g) {
    if (g.r2 <= g.r1) return false;
    let text = 0, numBelow = 0;
    for (let c = g.c1; c <= g.c2; c++) { const v = T.val(g.r1, c); if (typeof v === 'string') text++; const w = T.val(g.r1 + 1, c); if (typeof w === 'number') numBelow++; }
    return text === g.c2 - g.c1 + 1 || (text > 0 && numBelow > 0);
  }
  const colLabel = (g, c, header) => (header && typeof T.val(g.r1, c) === 'string' && T.val(g.r1, c) ? `${T.val(g.r1, c)} (${F.colName(c)})` : `Colonne ${F.colName(c)}`);

  /* ================= Mise en forme conditionnelle ================= */
  function rangeStats(rule, i, fc) {
    let st = fc && fc.cf.get(i); if (st) return st;
    const g = rule.range; const S = T.sh(); const vals = []; const counts = new Map();
    const r2 = Math.min(g.r2, S.maxR - 1), c2 = Math.min(g.c2, S.maxC - 1); let n = 0;
    for (let r = g.r1; r <= r2; r++) for (let c = g.c1; c <= c2; c++) { if (++n > 60000) break; const v = T.val(r, c); if (typeof v === 'number') vals.push(v); if (v !== null && v !== '') { const k = typeof v === 'string' ? 's' + v.toLowerCase() : String(v); counts.set(k, (counts.get(k) || 0) + 1); } }
    const sorted = [...vals].sort((a, b) => b - a);
    st = { min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 0, counts, sorted, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
    if (fc) fc.cf.set(i, st); return st;
  }
  const mix = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  function cfTest(rule, v, i, fc) {
    const st = rule.style || {};
    const num = typeof v === 'number' ? v : null;
    switch (rule.type) {
      case 'gt': return num !== null && num > rule.a ? st : null;
      case 'lt': return num !== null && num < rule.a ? st : null;
      case 'ge': return num !== null && num >= rule.a ? st : null;
      case 'le': return num !== null && num <= rule.a ? st : null;
      case 'between': return num !== null && num >= Math.min(rule.a, rule.b) && num <= Math.max(rule.a, rule.b) ? st : null;
      case 'eq': return v !== null && (typeof rule.a === 'number' ? num === rule.a : String(v).toLowerCase() === String(rule.a).toLowerCase()) ? st : null;
      case 'neg': return num !== null && num < 0 ? st : null;
      case 'contains': return v !== null && String(typeof v === 'number' ? F.generalNumber(v) : v).toLowerCase().includes(String(rule.a).toLowerCase()) ? st : null;
      case 'blank': return v === null || v === '' ? st : null;
      case 'dup': { if (v === null || v === '') return null; const k = typeof v === 'string' ? 's' + v.toLowerCase() : String(v); return rangeStats(rule, i, fc).counts.get(k) > 1 ? st : null; }
      case 'top': { if (num === null) return null; const s = rangeStats(rule, i, fc); const n = Math.max(1, rule.a || 10); return s.sorted.length && num >= s.sorted[Math.min(n, s.sorted.length) - 1] ? st : null; }
      case 'aboveAvg': { if (num === null) return null; return num > rangeStats(rule, i, fc).avg ? st : null; }
      case 'bar': { if (num === null) return null; const s = rangeStats(rule, i, fc); const lo = Math.min(0, s.min), hi = s.max; return { bar: { color: rule.color || '#1f6fd1', frac: hi > lo ? (num - lo) / (hi - lo) : 1 } }; }
      case 'scale': { if (num === null) return null; const s = rangeStats(rule, i, fc); const t = s.max > s.min ? (num - s.min) / (s.max - s.min) : 0.5; return { bg: rule.mid ? (t < 0.5 ? mix(rule.c1, rule.mid, t * 2) : mix(rule.mid, rule.c2, (t - 0.5) * 2)) : mix(rule.c1, rule.c2, t) }; }
    }
    return null;
  }
  Studio.sheetCF = { test: cfTest };
  const CF_STYLES = { red: { bg: '#ffc7ce', fc: '#9c0006' }, green: { bg: '#c6efce', fc: '#006100' }, yellow: { bg: '#ffeb9c', fc: '#9c5700' }, redText: { fc: '#c00000', b: true }, blue: { bg: '#ddebf7', fc: '#1f4e79' } };
  async function condFormatDialog() {
    const g = T.boundSel(T.selRect());
    const S = T.sh();
    const existing = S.cf.map((x, i) => [x, i]).filter(([x]) => !(x.range.r2 < g.r1 || x.range.r1 > g.r2 || x.range.c2 < g.c1 || x.range.c1 > g.c2));
    const res = await modal({
      title: 'Mise en forme conditionnelle — ' + F.rangeName(g),
      body: `<div class="grid2">
        <div class="field"><label for="cfT">Règle</label><select id="cfT">
          <option value="gt">Valeur supérieure à</option><option value="lt">Valeur inférieure à</option><option value="between">Valeur comprise entre</option>
          <option value="eq">Égale à</option><option value="neg">Nombres négatifs</option><option value="contains">Texte contenant</option>
          <option value="dup">Valeurs en double</option><option value="top">Les N plus grandes valeurs</option><option value="aboveAvg">Au-dessus de la moyenne</option><option value="blank">Cellules vides</option>
          <option value="bar">Barres de données</option><option value="scale">Échelle de couleurs</option></select></div>
        <div class="field"><label for="cfS">Mise en forme</label><select id="cfS">
          <option value="red">Rouge clair, texte rouge foncé</option><option value="green">Vert clair, texte vert foncé</option><option value="yellow">Jaune, texte brun</option>
          <option value="blue">Bleu clair</option><option value="redText">Texte rouge gras</option></select></div>
        <div class="field" id="cfAw"><label for="cfA">Valeur</label><input type="text" id="cfA" placeholder="ex. 100000"></div>
        <div class="field" id="cfBw"><label for="cfB">et</label><input type="text" id="cfB"></div>
        <div class="field" id="cfCw" hidden><label for="cfC">Couleurs</label><select id="cfC"><option value="gyr">Vert → jaune → rouge</option><option value="ryg">Rouge → jaune → vert</option><option value="wg">Blanc → vert</option><option value="wb">Blanc → bleu</option></select></div>
      </div>
      ${existing.length ? `<div><b style="font-size:13px">Règles qui touchent la sélection</b><div class="flist">${existing.map(([x, i]) => `<label><input type="checkbox" data-del="${i}"> Supprimer : ${esc(cfLabel(x))} sur ${F.rangeName(x.range)}</label>`).join('')}</div></div>` : ''}`,
      onOpen: (b) => {
        const upd = () => { const t = b.querySelector('#cfT').value; b.querySelector('#cfAw').hidden = !['gt', 'lt', 'between', 'eq', 'contains', 'top'].includes(t); b.querySelector('#cfBw').hidden = t !== 'between'; b.querySelector('#cfS').parentElement.hidden = ['bar', 'scale'].includes(t); b.querySelector('#cfCw').hidden = t !== 'scale'; if (t === 'bar') { b.querySelector('#cfCw').hidden = true; } };
        b.querySelector('#cfT').onchange = upd; upd();
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => ({ t: b.querySelector('#cfT').value, s: b.querySelector('#cfS').value, a: b.querySelector('#cfA').value, b: b.querySelector('#cfB').value, c: b.querySelector('#cfC').value, del: [...b.querySelectorAll('[data-del]:checked')].map((x) => +x.dataset.del) }) }],
    });
    if (!res) return;
    const parse = (x) => { const p = F.parseInput(x); return typeof p.v === 'number' ? p.v : x; };
    T.begin('mise en forme conditionnelle'); T.touchMeta();
    if (res.del.length) S.cf = S.cf.filter((_, i) => !res.del.includes(i));
    const rule = { range: g, type: res.t, a: parse(res.a), b: parse(res.b), style: CF_STYLES[res.s] };
    if (['gt', 'lt', 'between'].includes(res.t) && typeof rule.a !== 'number') { T.commit(); return toast('Indiquez un nombre'); }
    if (res.t === 'scale') Object.assign(rule, { gyr: { c1: '#63be7b', mid: '#ffeb84', c2: '#f8696b' }, ryg: { c1: '#f8696b', mid: '#ffeb84', c2: '#63be7b' }, wg: { c1: '#ffffff', c2: '#63be7b' }, wb: { c1: '#ffffff', c2: '#5a8ac6' } }[res.c]);
    if (res.t === 'bar') rule.color = '#5a8ac6';
    S.cf.push(rule);
    T.commit();
  }
  function cfLabel(x) { return { gt: '> ' + x.a, lt: '< ' + x.a, between: `entre ${x.a} et ${x.b}`, eq: '= ' + x.a, neg: 'négatifs', contains: 'contient « ' + x.a + ' »', dup: 'doublons', top: x.a + ' plus grandes', aboveAvg: 'au-dessus de la moyenne', blank: 'vides', bar: 'barres de données', scale: 'échelle de couleurs' }[x.type] || x.type; }
  function clearCF() { const g = T.selRect(); const S = T.sh(); const left = S.cf.filter((x) => x.range.r2 < g.r1 || x.range.r1 > g.r2 || x.range.c2 < g.c1 || x.range.c1 > g.c2); if (left.length === S.cf.length) return toast('Aucune règle sur la sélection'); T.begin('effacer règles'); T.touchMeta(); S.cf = left; T.commit(); }

  /* ================= Graphiques ================= */
  const chartImgs = new Map(); let selChart = null; let cDrag = null;
  function chartData(ch) {
    let s = T.wb.active, rest = ch.range;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(ch.range || '');
    if (m) { s = T.wb.sheets.findIndex((x) => x.name.toLowerCase() === (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]).toLowerCase()); rest = m[3]; }
    const g = F.parseRange((rest || '').replace(/\$/g, '')); if (!g || s < 0) return null;
    const S = T.wb.sheets[s]; g.r2 = Math.min(g.r2, Math.max(S.maxR - 1, g.r1)); g.c2 = Math.min(g.c2, Math.max(S.maxC - 1, g.c1));
    const V = (r, c) => T.eng.value(s, r, c);
    const R = g.r2 - g.r1 + 1, C = g.c2 - g.c1 + 1;
    const grid = Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => V(g.r1 + i, g.c1 + j)));
    const isLbl = (v) => typeof v === 'string' || v === null;
    const hasHeadRow = grid[0].slice(C > 1 ? 1 : 0).some((v) => typeof v === 'string') && R > 1;
    const firstFmt = (S.cells.get(T.K(g.r1 + (hasHeadRow ? 1 : 0), g.c1)) || {}).s;
    const hasHeadCol = C > 1 && (grid.slice(hasHeadRow ? 1 : 0).some((row) => typeof row[0] === 'string') || !!(firstFmt && F.isDateFormat(firstFmt.fmt)) || grid.slice(hasHeadRow ? 1 : 0).every((row) => isLbl(row[0])));
    const body = grid.slice(hasHeadRow ? 1 : 0).map((row) => row.slice(hasHeadCol ? 1 : 0));
    const rowLabels = grid.slice(hasHeadRow ? 1 : 0).map((row, i) => (hasHeadCol ? fmtLbl(row[0], s, g.r1 + (hasHeadRow ? 1 : 0) + i, g.c1) : String(i + 1)));
    const colLabels = (hasHeadRow ? grid[0].slice(hasHeadCol ? 1 : 0) : body[0] ? body[0].map((_, j) => F.colName(g.c1 + (hasHeadCol ? 1 : 0) + j)) : []).map((v, j) => (v === null ? 'Série ' + (j + 1) : fmtLbl(v, s, g.r1, g.c1 + (hasHeadCol ? 1 : 0) + j)));
    const byCols = ch.series === 'rows' ? false : ch.series === 'cols' ? true : body.length >= (body[0] || []).length;
    const num = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? +v : null);
    if (byCols) return { cats: rowLabels, series: colLabels.map((name, j) => ({ name, values: body.map((row) => num(row[j])) })) };
    return { cats: colLabels, series: rowLabels.map((name, i) => ({ name, values: body[i].map(num) })) };
  }
  function fmtLbl(v, s, r, c) { if (v === null) return ''; const cl = T.wb.sheets[s].cells.get(T.K(r, c)); return F.format(v, cl && cl.s && cl.s.fmt).text; }
  function niceTicks(lo, hi, n = 5) {
    if (lo === hi) { hi = lo + 1; lo = Math.min(0, lo); }
    const span = hi - lo, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0))); const f = step0 / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step; const out = []; for (let x = a; x <= b + step / 2; x += step) out.push(+x.toPrecision(12));
    return out;
  }
  const shortNum = (v) => { const a = Math.abs(v); if (a >= 1e9) return F.generalNumber(+(v / 1e9).toPrecision(3)) + ' Md'; if (a >= 1e6) return F.generalNumber(+(v / 1e6).toPrecision(3)) + ' M'; if (a >= 1e4) return F.generalNumber(+(v / 1e3).toPrecision(3)) + ' k'; return F.generalNumber(+v.toPrecision(6)); };
  function chartSVG(ch, W = ch.w, H = ch.h) {
    const d = chartData(ch); const X = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Calibri, Carlito, Segoe UI, Arial, sans-serif"><rect width="${W}" height="${H}" fill="#fff" stroke="#c9ccd4"/>`;
    if (!d || !d.series.length) return o + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="#888">Plage de données vide</text></svg>`;
    let top = 12; if (ch.title) { o += `<text x="${W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="bold" fill="#222">${X(ch.title)}</text>`; top = 36; }
    const pie = ch.type === 'pie' || ch.type === 'donut';
    const legendItems = pie ? d.cats : d.series.map((s) => s.name);
    const showLegend = ch.legend !== false && (pie || d.series.length > 1);
    let legendH = 0;
    if (showLegend) { const rows = Math.ceil(legendItems.length / Math.max(1, Math.floor(W / 130))); legendH = rows * 18 + 6; }
    const bottom = H - legendH - 6;
    if (showLegend) { const per = Math.max(1, Math.floor(W / 130)); legendItems.forEach((t, i) => { const x = 10 + (i % per) * 130, y = H - legendH + Math.floor(i / per) * 18 + 6; o += `<rect x="${x}" y="${y}" width="10" height="10" fill="${PALETTE[i % PALETTE.length]}"/><text x="${x + 14}" y="${y + 9}" font-size="11" fill="#333">${X(String(t).slice(0, 18))}</text>`; }); }
    if (pie) {
      const vals = d.series[0].values.map((v) => Math.max(0, v || 0)); const tot = vals.reduce((a, b) => a + b, 0) || 1;
      const cx = W / 2, cy = (top + bottom) / 2, R = Math.max(10, Math.min(W / 2 - 20, (bottom - top) / 2 - 6)); let a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        const a1 = a0 + (v / tot) * Math.PI * 2; const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a, r) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
        if (v > 0) {
          if (vals.filter((x) => x > 0).length === 1) o += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${PALETTE[i % PALETTE.length]}"/>`;
          else o += `<path d="M${cx},${cy} L${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} Z" fill="${PALETTE[i % PALETTE.length]}" stroke="#fff" stroke-width="1.5"/>`;
          const am = (a0 + a1) / 2; if (v / tot > 0.04) o += `<text x="${(cx + R * 0.68 * Math.cos(am)).toFixed(1)}" y="${(cy + R * 0.68 * Math.sin(am) + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">${Math.round((v / tot) * 100)} %</text>`;
        }
        a0 = a1;
      });
      if (ch.type === 'donut') o += `<circle cx="${cx}" cy="${cy}" r="${R * 0.5}" fill="#fff"/>`;
      return o + '</svg>';
    }
    const all = d.series.flatMap((s) => s.values).filter((v) => v !== null);
    const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const ticks = niceTicks(lo, hi); const tmin = ticks[0], tmax = ticks[ticks.length - 1];
    const horiz = ch.type === 'bar';
    const labW = horiz ? Math.min(140, 8 + 6.5 * Math.max(...d.cats.map((c) => String(c).length), 3)) : Math.max(...ticks.map((t) => shortNum(t).length)) * 6.5 + 12;
    const L = labW, Rm = W - 14, Tp = top + 4, Bt = bottom - (horiz ? 18 : 22);
    const n = d.cats.length;
    if (horiz) {
      const sx = (v) => L + ((v - tmin) / (tmax - tmin)) * (Rm - L);
      ticks.forEach((t) => { const x = sx(t); o += `<line x1="${x}" y1="${Tp}" x2="${x}" y2="${Bt}" stroke="#e3e5ea"/><text x="${x}" y="${Bt + 14}" text-anchor="middle" font-size="10" fill="#555">${shortNum(t)}</text>`; });
      const band = (Bt - Tp) / Math.max(1, n), bw = (band * 0.75) / d.series.length;
      d.cats.forEach((c, i) => { o += `<text x="${L - 6}" y="${Tp + band * (i + 0.5) + 4}" text-anchor="end" font-size="10" fill="#333">${X(String(c).slice(0, 22))}</text>`; d.series.forEach((s, j) => { const v = s.values[i]; if (v === null) return; const x0 = sx(Math.max(0, tmin)), x1 = sx(v); o += `<rect x="${Math.min(x0, x1)}" y="${Tp + band * i + band * 0.125 + bw * j}" width="${Math.abs(x1 - x0)}" height="${bw}" fill="${PALETTE[j % PALETTE.length]}"/>`; }); });
      o += `<line x1="${sx(Math.max(0, tmin))}" y1="${Tp}" x2="${sx(Math.max(0, tmin))}" y2="${Bt}" stroke="#888"/>`;
      return o + '</svg>';
    }
    const sy = (v) => Bt - ((v - tmin) / (tmax - tmin)) * (Bt - Tp);
    ticks.forEach((t) => { const y = sy(t); o += `<line x1="${L}" y1="${y}" x2="${Rm}" y2="${y}" stroke="#e3e5ea"/><text x="${L - 6}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="#555">${shortNum(t)}</text>`; });
    const band = (Rm - L) / Math.max(1, n); const every = Math.max(1, Math.ceil((n * 46) / (Rm - L)));
    d.cats.forEach((c, i) => { if (i % every) return; o += `<text x="${L + band * (i + 0.5)}" y="${Bt + 14}" text-anchor="middle" font-size="10" fill="#333">${X(String(c).slice(0, 12))}</text>`; });
    if (ch.type === 'col') {
      const bw = (band * 0.75) / d.series.length;
      d.series.forEach((s, j) => s.values.forEach((v, i) => { if (v === null) return; const y0 = sy(Math.max(0, tmin)), y1 = sy(v); o += `<rect x="${L + band * i + band * 0.125 + bw * j}" y="${Math.min(y0, y1)}" width="${Math.max(1, bw - 1)}" height="${Math.abs(y1 - y0)}" fill="${PALETTE[j % PALETTE.length]}"/>`; }));
    } else {
      d.series.forEach((s, j) => {
        const pts = s.values.map((v, i) => (v === null ? null : [L + band * (i + 0.5), sy(v)]));
        const segs = pts.filter(Boolean).map((p) => p.map((x) => x.toFixed(1)).join(','));
        if (ch.type === 'area' && segs.length) o += `<polygon points="${pts.filter(Boolean)[0][0].toFixed(1)},${sy(Math.max(0, tmin))} ${segs.join(' ')} ${pts.filter(Boolean).slice(-1)[0][0].toFixed(1)},${sy(Math.max(0, tmin))}" fill="${PALETTE[j % PALETTE.length]}" fill-opacity=".3"/>`;
        o += `<polyline points="${segs.join(' ')}" fill="none" stroke="${PALETTE[j % PALETTE.length]}" stroke-width="2.2"/>`;
        if (n <= 40) pts.forEach((p) => { if (p) o += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${PALETTE[j % PALETTE.length]}"/>`; });
      });
    }
    o += `<line x1="${L}" y1="${sy(Math.max(0, tmin))}" x2="${Rm}" y2="${sy(Math.max(0, tmin))}" stroke="#888"/>`;
    return o + '</svg>';
  }
  function chartImage(ch) {
    const svg = chartSVG(ch);
    let e = chartImgs.get(ch.id);
    if (e && e.svg === svg) return e.ok ? e.img : null;
    const img = new Image(); e = { svg, img, ok: false }; chartImgs.set(ch.id, e);
    img.onload = () => { e.ok = true; T.render(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return null;
  }
  function chartAt(x, y) { // coordonnées écran non zoomées
    const { sx, sy } = T.view(); const S = T.sh();
    for (let i = S.charts.length - 1; i >= 0; i--) { const ch = S.charts[i]; const X = T.HW + ch.x - sx, Y = T.HH + ch.y - sy; if (x >= X && x <= X + ch.w && y >= Y && y <= Y + ch.h) return { ch, corner: x > X + ch.w - 14 && y > Y + ch.h - 14 }; }
    return null;
  }
  Studio.sheetCharts = {
    draw(ctx, X, Y) {
      const S = T.sh(); const z = T.zoom();
      for (const ch of S.charts) {
        const img = chartImage(ch); const x = X(ch.x), y = Y(ch.y);
        ctx.fillStyle = '#fff'; ctx.fillRect(x, y, ch.w, ch.h);
        if (img) ctx.drawImage(img, x, y, ch.w, ch.h);
        if (selChart === ch.id) { ctx.strokeStyle = T.GREEN; ctx.lineWidth = 2 / z; ctx.strokeRect(x, y, ch.w, ch.h); ctx.fillStyle = T.GREEN; ctx.fillRect(x + ch.w - 9, y + ch.h - 9, 9, 9); }
      }
    },
    pointerDown(x, y, e, isTap) {
      const h = chartAt(x, y);
      if (!h) { if (selChart) { selChart = null; T.render(); } return false; }
      if (T.editing) T.commitEdit();
      selChart = h.ch.id; T.render();
      if (isTap) return true;
      if (e.detail === 2) { chartDialog(h.ch); return true; }
      const S = T.sh(); const start = { x: e.clientX, y: e.clientY, ch: h.ch, x0: h.ch.x, y0: h.ch.y, w0: h.ch.w, h0: h.ch.h, mode: h.corner ? 'resize' : 'move', sheet: S };
      cDrag = start;
      const mv = (ev) => { const z = T.zoom(); const dx = (ev.clientX - start.x) / z, dy = (ev.clientY - start.y) / z; if (start.mode === 'move') { h.ch.x = Math.max(0, start.x0 + dx); h.ch.y = Math.max(0, start.y0 + dy); } else { h.ch.w = Math.max(160, start.w0 + dx); h.ch.h = Math.max(110, start.h0 + dy); } T.render(); };
      const up = () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up); cDrag = null;
        const now = { x: h.ch.x, y: h.ch.y, w: h.ch.w, h: h.ch.h };
        if (now.x === start.x0 && now.y === start.y0 && now.w === start.w0 && now.h === start.h0) return;
        Object.assign(h.ch, { x: start.x0, y: start.y0, w: start.w0, h: start.h0 });
        T.begin('graphique'); T.touchMeta(); const c2 = T.sh().charts.find((c) => c.id === h.ch.id); Object.assign(c2, now); T.commit();
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
      return true;
    },
    cursor(x, y) { const h = chartAt(x, y); return h ? (h.corner ? 'nwse-resize' : 'move') : ''; },
    dblclick(x, y) { const h = chartAt(x, y); if (h) { chartDialog(h.ch); return true; } return false; },
    contextMenu(x, y, cx, cy, show) {
      const h = chartAt(x, y); if (!h) return false; selChart = h.ch.id; T.render();
      show(cx, cy, [['Modifier le graphique…', () => chartDialog(h.ch)], ['Enregistrer en image (PNG)', () => exportChartPng(h.ch)], '-', ['Supprimer le graphique', () => deleteChart(h.ch.id)]]);
      return true;
    },
  };
  function deleteChart(id) { T.begin('supprimer graphique'); T.touchMeta(); const S = T.sh(); S.charts = S.charts.filter((c) => c.id !== id); selChart = null; T.commit(); }
  T.scroller.addEventListener('keydown', (e) => { if (selChart && (e.key === 'Delete' || e.key === 'Backspace') && !T.editing) { e.preventDefault(); e.stopImmediatePropagation(); deleteChart(selChart); } else if (selChart && e.key === 'Escape') { selChart = null; T.render(); } }, true);
  async function exportChartPng(ch) {
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(chartSVG(ch, ch.w * 2, ch.h * 2).replace(/viewBox="[^"]*"/, `viewBox="0 0 ${ch.w} ${ch.h}"`));
    await img.decode(); const c = document.createElement('canvas'); c.width = ch.w * 2; c.height = ch.h * 2; c.getContext('2d').drawImage(img, 0, 0);
    c.toBlob((b) => download(b, (ch.title || 'graphique') + '.png'), 'image/png');
  }
  async function chartDialog(existing) {
    let range = existing ? existing.range : null;
    if (!range) { const g = currentRegion(); range = F.rangeName(g); }
    const ch0 = existing ? { ...existing } : { id: 'c' + Date.now().toString(36), type: 'col', range, title: '', legend: true, series: 'auto', w: 480, h: 300 };
    const res = await modal({
      title: existing ? 'Modifier le graphique' : 'Insérer un graphique', wide: true,
      body: `<div class="fmt-grid"><div style="display:grid;gap:10px;align-content:start">
        <div class="field"><label for="chT">Type</label><select id="chT"><option value="col">Colonnes</option><option value="bar">Barres horizontales</option><option value="line">Courbes</option><option value="area">Aires</option><option value="pie">Secteurs (camembert)</option><option value="donut">Anneau</option></select></div>
        <div class="field"><label for="chR">Données (plage, ex. A1:C12 ou Feuil2!A1:B8)</label><input type="text" id="chR" value="${esc(F.localize(ch0.range))}"></div>
        <div class="field"><label for="chTi">Titre</label><input type="text" id="chTi" value="${esc(ch0.title || '')}"></div>
        <div class="field"><label for="chS">Séries</label><select id="chS"><option value="auto">Automatique</option><option value="cols">Une série par colonne</option><option value="rows">Une série par ligne</option></select></div>
        <label class="row"><input type="checkbox" id="chL" ${ch0.legend !== false ? 'checked' : ''}> Légende</label>
        <p class="hint">Le graphique se met à jour quand les données changent. Glissez-le pour le déplacer, coin en bas à droite pour le redimensionner.</p>
      </div><div id="chP" style="overflow:auto"></div></div>`,
      onOpen: (b) => {
        b.querySelector('#chT').value = ch0.type; b.querySelector('#chS').value = ch0.series || 'auto';
        const prev = () => { const c = read(b); b.querySelector('#chP').innerHTML = chartSVG({ ...c, w: 440, h: 280 }, 440, 280); };
        b.querySelectorAll('input,select').forEach((x) => x.addEventListener('input', prev)); prev();
      },
      buttons: [{ label: 'Annuler', value: null }, ...(existing ? [{ label: 'Supprimer', value: 'del' }] : []), { label: existing ? 'Enregistrer' : 'Insérer', primary: true, value: (b) => read(b) }],
    });
    function read(b) { let r = b.querySelector('#chR').value.trim(); try { r = F.canonicalize(r); } catch (e) { /* plage brute */ } return { ...ch0, type: b.querySelector('#chT').value, range: r, title: b.querySelector('#chTi').value.trim(), series: b.querySelector('#chS').value, legend: b.querySelector('#chL').checked }; }
    if (!res) return;
    if (res === 'del') return deleteChart(existing.id);
    T.begin('graphique'); T.touchMeta(); const S = T.sh();
    if (existing) { const i = S.charts.findIndex((c) => c.id === existing.id); S.charts[i] = res; }
    else {
      T.geom(); const g = T.selRect(); const { sx, sy, vw } = T.view();
      let x = T.CA.pos(Math.min(g.c2, S.maxC) + 1) + 16, y = T.RA.pos(g.r1);
      if (x + res.w > sx + vw - T.HW) x = Math.max(sx + 10, sx + vw - T.HW - res.w - 10);
      if (y < sy) y = sy + 10;
      res.x = x; res.y = y; S.charts.push(res); selChart = res.id;
    }
    T.commit();
  }

  /* ================= Format de cellule ================= */
  async function formatCellsDialog() {
    const s = T.activeStyle(); const v = T.val(T.sel.ar, T.sel.ac);
    const sample = typeof v === 'number' ? v : 1234.5;
    const res = await modal({
      title: 'Format de cellule', wide: true,
      body: `<div class="fmt-grid">
        <div style="display:grid;gap:8px;align-content:start">
          <b style="font-size:13px">Nombre</b>
          <div class="field"><label for="fcList">Catégorie</label><select id="fcList">${F.NUM_FORMATS.map(([c, l]) => `<option value="${esc(c)}">${esc(l)}</option>`).join('')}<option value="__c">Personnalisé</option></select></div>
          <div class="field"><label for="fcCode">Code de format (ex. # ##0,00 "FCFA" ; jj/mm/aaaa)</label><input type="text" id="fcCode" value="${esc(s.fmt || 'General')}"></div>
          <div class="fmt-preview" id="fcPrev"></div>
          <b style="font-size:13px">Alignement</b>
          <div class="grid2"><div class="field"><label for="fcHa">Horizontal</label><select id="fcHa"><option value="">Standard</option><option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option></select></div>
          <div class="field"><label for="fcVa">Vertical</label><select id="fcVa"><option value="">Bas</option><option value="middle">Centré</option><option value="top">Haut</option></select></div></div>
          <div class="grid2"><label class="row"><input type="checkbox" id="fcWrap" ${s.wrap ? 'checked' : ''}> Renvoyer à la ligne</label><div class="field"><label for="fcInd">Retrait</label><input type="number" id="fcInd" min="0" max="15" value="${s.ind || 0}"></div></div>
        </div>
        <div style="display:grid;gap:8px;align-content:start">
          <b style="font-size:13px">Police</b>
          <div class="row"><label class="row"><input type="checkbox" id="fcB" ${s.b ? 'checked' : ''}> Gras</label><label class="row"><input type="checkbox" id="fcI" ${s.i ? 'checked' : ''}> Italique</label><label class="row"><input type="checkbox" id="fcU" ${s.u ? 'checked' : ''}> Souligné</label><label class="row"><input type="checkbox" id="fcSt" ${s.st ? 'checked' : ''}> Barré</label></div>
          <div class="grid2"><div class="field"><label for="fcFs">Taille</label><input type="number" id="fcFs" min="6" max="72" value="${s.fs || T.DEF_FS}"></div>
          <div class="field"><label for="fcFf">Police</label><select id="fcFf"><option value="">Calibri (standard)</option><option value="Arial, Helvetica, sans-serif">Arial</option><option value="'Times New Roman', Times, serif">Times New Roman</option><option value="'Courier New', monospace">Courier New</option><option value="Georgia, serif">Georgia</option><option value="Verdana, sans-serif">Verdana</option></select></div></div>
          <div class="grid2"><div class="field"><label for="fcFc">Couleur du texte</label><input type="color" id="fcFc" value="${s.fc || '#000000'}"></div><div class="field"><label for="fcBg">Remplissage</label><div class="row"><input type="color" id="fcBg" value="${s.bg || '#ffffff'}"><label class="row"><input type="checkbox" id="fcNoBg" ${s.bg ? '' : 'checked'}> Aucun</label></div></div></div>
          <b style="font-size:13px">Bordures</b>
          <div class="row"><select id="fcBd"><option value="">Inchangées</option><option value="none">Aucune</option><option value="all">Toutes</option><option value="outer">Contour</option><option value="thick">Contour épais</option><option value="bottom">Bas</option><option value="double">Double en bas</option></select></div>
          <label class="row"><input type="checkbox" id="fcLock" ${s.prot ? 'checked' : ''}> Marquer comme cellule de saisie (fond jaune pâle)</label>
        </div></div>`,
      onOpen: (b) => {
        const code = b.querySelector('#fcCode'), list = b.querySelector('#fcList');
        list.value = F.NUM_FORMATS.some(([c]) => c === code.value) ? code.value : '__c';
        b.querySelector('#fcHa').value = s.ha || ''; b.querySelector('#fcVa').value = s.va === 'bottom' ? '' : s.va || ''; b.querySelector('#fcFf').value = s.ff || '';
        const prev = () => { b.querySelector('#fcPrev').textContent = F.format(sample, toExcelCode(code.value)).text || '—'; };
        list.onchange = () => { if (list.value !== '__c') code.value = list.value; prev(); };
        code.oninput = () => { list.value = '__c'; prev(); }; prev();
        b.querySelector('#fcBg').oninput = () => { b.querySelector('#fcNoBg').checked = false; };
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => ({
        fmt: toExcelCode(b.querySelector('#fcCode').value), ha: b.querySelector('#fcHa').value || undefined, va: b.querySelector('#fcVa').value || undefined, wrap: b.querySelector('#fcWrap').checked || undefined,
        ind: +b.querySelector('#fcInd').value || undefined, b: b.querySelector('#fcB').checked || undefined, i: b.querySelector('#fcI').checked || undefined, u: b.querySelector('#fcU').checked || undefined,
        st: b.querySelector('#fcSt').checked || undefined, fs: +b.querySelector('#fcFs').value === T.DEF_FS ? undefined : +b.querySelector('#fcFs').value || undefined, ff: b.querySelector('#fcFf').value || undefined,
        fc: b.querySelector('#fcFc').value === '#000000' ? undefined : b.querySelector('#fcFc').value, bg: b.querySelector('#fcNoBg').checked ? undefined : b.querySelector('#fcBg').value,
        bd: b.querySelector('#fcBd').value, prot: b.querySelector('#fcLock').checked || undefined,
      }) }],
    });
    if (!res) return;
    const bd = res.bd; delete res.bd;
    if (res.fmt === 'General') res.fmt = undefined;
    if (res.prot && !res.bg) res.bg = '#fff9db';
    T.begin('format'); T.styleSel(res); if (bd) T.act({ none: 'bdNone', all: 'bdAll', outer: 'bdOuter', thick: 'bdThick', bottom: 'bdBottom', double: 'bdDoubleBottom' }[bd]); T.commit();
  }
  // code saisi « à la française » (# ##0,00 ; jj/mm/aaaa) → code Excel (#,##0.00 ; dd/mm/yyyy)
  function toExcelCode(c) {
    c = (c || '').trim(); if (!c) return 'General';
    if (/^(standard|général|general)$/i.test(c)) return 'General';
    let out = '', q = false;
    for (let i = 0; i < c.length; i++) {
      const ch = c[i];
      if (ch === '"') { q = !q; out += ch; continue; }
      if (q) { out += ch; continue; }
      if (ch === ',' && /[0#]/.test(c[i - 1] || '') && /[0#]/.test(c[i + 1] || '')) { out += '.'; continue; }
      if ((ch === ' ' || ch === ' ' || ch === ' ') && /[0#]/.test(c[i - 1] || '') && /[0#]/.test(c[i + 1] || '') && /^[#0]{3}/.test(c.slice(i + 1))) { out += ','; continue; }
      out += ch;
    }
    return F.frFormatCode(out);
  }

  /* ================= Tri, filtre, doublons ================= */
  function sortRows(g, keys) { // keys : [{c, desc}]
    const S = T.sh(); const rows = [];
    for (let r = g.r1; r <= g.r2; r++) { const cells = []; for (let c = g.c1; c <= g.c2; c++) cells.push(S.cells.get(T.K(r, c))); rows.push({ r, cells, keys: keys.map((k) => T.val(r, k.c)) }); }
    const cmp = (a, b) => {
      for (let i = 0; i < keys.length; i++) {
        const x = a.keys[i], y = b.keys[i]; const ex = x === null || x === '', ey = y === null || y === '';
        if (ex || ey) { if (ex && ey) continue; return ex ? 1 : -1; } // vides toujours en bas
        const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
        let d = rank(x) - rank(y);
        if (!d) d = typeof x === 'string' ? x.localeCompare(y, 'fr', { sensitivity: 'base', numeric: true }) : x < y ? -1 : x > y ? 1 : 0;
        if (d) return keys[i].desc ? -d : d;
      }
      return a.r - b.r;
    };
    rows.sort(cmp);
    T.begin('trier');
    rows.forEach((row, i) => { const r = g.r1 + i; row.cells.forEach((cl, j) => { const c = g.c1 + j; T.setCell(r, c, cl ? { ...cl, f: cl.f != null ? F.shiftFormula(cl.f, r - row.r, 0) : undefined } : null); }); });
    T.commit();
  }
  function quickSort(desc) {
    let g = currentRegion(); const header = looksLikeHeader(g);
    const data = header ? { ...g, r1: g.r1 + 1 } : g; if (data.r2 <= data.r1) return toast('Rien à trier');
    sortRows(data, [{ c: Math.min(Math.max(T.sel.ac, g.c1), g.c2), desc }]);
    T.selectRange(g, T.sel.ar, T.sel.ac);
    toast(`Trié ${desc ? 'de Z à A' : 'de A à Z'} sur ${colLabel(g, T.sel.ac, header)}`);
  }
  async function sortDialog() {
    const g = currentRegion(); const header0 = looksLikeHeader(g);
    const opts = (h) => { const o = []; for (let c = g.c1; c <= g.c2; c++) o.push(`<option value="${c}">${esc(colLabel(g, c, h))}</option>`); return o.join(''); };
    const res = await modal({
      title: 'Trier ' + F.rangeName(g),
      body: `<label class="row"><input type="checkbox" id="soH" ${header0 ? 'checked' : ''}> La première ligne contient les titres</label>
        <div class="grid2"><div class="field"><label for="so1">Trier par</label><select id="so1">${opts(header0)}</select></div><div class="field"><label for="so1d">Ordre</label><select id="so1d"><option value="0">Croissant (A → Z, 1 → 9)</option><option value="1">Décroissant</option></select></div>
        <div class="field"><label for="so2">Puis par</label><select id="so2"><option value="">—</option>${opts(header0)}</select></div><div class="field"><label for="so2d">Ordre</label><select id="so2d"><option value="0">Croissant</option><option value="1">Décroissant</option></select></div></div>`,
      onOpen: (b) => { b.querySelector('#so1').value = String(Math.min(Math.max(T.sel.ac, g.c1), g.c2)); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Trier', primary: true, value: (b) => ({ h: b.querySelector('#soH').checked, k: [[b.querySelector('#so1').value, b.querySelector('#so1d').value], [b.querySelector('#so2').value, b.querySelector('#so2d').value]] }) }],
    });
    if (!res) return;
    const keys = res.k.filter(([c]) => c !== '').map(([c, d]) => ({ c: +c, desc: d === '1' }));
    sortRows(res.h ? { ...g, r1: g.r1 + 1 } : g, keys); T.selectRange(g);
  }
  function filterEnd(f) { const S = T.sh(); return Math.max(f.r, S.maxR - 1); }
  function applyFilter() {
    const S = T.sh(); const f = S.filter; S.hiddenRows = {};
    if (!f) return;
    const crit = Object.entries(f.crit || {}).filter(([, v]) => v && v.length);
    if (!crit.length) return;
    const end = filterEnd(f);
    for (let r = f.r + 1; r <= end; r++) for (const [c, hidden] of crit) { const t = cellText(T.wb.active, r, +c) || '(Vides)'; if (hidden.includes(t)) { S.hiddenRows[r] = true; break; } }
  }
  function toggleFilter() {
    const S = T.sh();
    T.begin('filtre'); T.touchMeta();
    if (S.filter) { S.filter = null; S.hiddenRows = {}; T.commit(); toast('Filtre retiré'); return; }
    const g = currentRegion();
    S.filter = { r: g.r1, c1: g.c1, c2: g.c2, crit: {} };
    T.commit(); toast('Filtre activé : touchez les flèches des titres de colonnes');
  }
  async function filterMenu(c) {
    const S = T.sh(); const f = S.filter; if (!f) return;
    const end = filterEnd(f); const counts = new Map();
    for (let r = f.r + 1; r <= end; r++) { const t = cellText(T.wb.active, r, c) || '(Vides)'; counts.set(t, (counts.get(t) || 0) + 1); }
    const hidden = new Set((f.crit && f.crit[c]) || []);
    const items = [...counts.keys()].sort((a, b) => (a === '(Vides)') - (b === '(Vides)') || a.localeCompare(b, 'fr', { numeric: true }));
    const res = await modal({
      title: 'Filtrer — ' + (cellText(T.wb.active, f.r, c) || 'colonne ' + F.colName(c)),
      body: `<div class="row"><button type="button" id="fiAZ">Trier A → Z</button><button type="button" id="fiZA">Trier Z → A</button></div>
        <input type="text" id="fiQ" placeholder="Rechercher…">
        <label class="row"><input type="checkbox" id="fiAll"> (Tout sélectionner)</label>
        <div class="flist" id="fiL">${items.map((t, i) => `<label data-t="${esc(t.toLowerCase())}"><input type="checkbox" data-i="${i}" ${hidden.has(t) ? '' : 'checked'}> ${esc(t)} <span class="hint">(${counts.get(t)})</span></label>`).join('')}</div>`,
      onOpen: (b) => {
        const boxes = [...b.querySelectorAll('[data-i]')]; const all = b.querySelector('#fiAll');
        const sync = () => { all.checked = boxes.every((x) => x.checked); }; sync();
        boxes.forEach((x) => x.onchange = sync);
        all.onchange = () => boxes.forEach((x) => { if (!x.parentElement.hidden) x.checked = all.checked; });
        b.querySelector('#fiQ').oninput = (e) => { const q = e.target.value.toLowerCase(); b.querySelectorAll('[data-t]').forEach((l) => { l.hidden = q && !l.dataset.t.includes(q); }); };
        b.querySelector('#fiAZ').onclick = () => { b.closest('.modal').querySelector('footer button').click(); setTimeout(() => sortFilterCol(c, false)); };
        b.querySelector('#fiZA').onclick = () => { b.closest('.modal').querySelector('footer button').click(); setTimeout(() => sortFilterCol(c, true)); };
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Effacer ce filtre', value: 'clear' }, { label: 'OK', primary: true, value: (b) => [...b.querySelectorAll('[data-i]')].filter((x) => !x.checked).map((x) => items[+x.dataset.i]) }],
    });
    if (res === null) return;
    T.begin('filtre'); T.touchMeta();
    f.crit = f.crit || {};
    if (res === 'clear' || !res.length) delete f.crit[c]; else f.crit[c] = res;
    applyFilter(); T.commit();
  }
  function sortFilterCol(c, desc) { const f = T.sh().filter; if (!f) return; sortRows({ r1: f.r + 1, r2: filterEnd(f), c1: f.c1, c2: f.c2 }, [{ c, desc }]); T.begin('filtre'); T.touchMeta(); applyFilter(); T.commit(); }
  function clearFilter() { const S = T.sh(); if (!S.filter && !Object.keys(S.hiddenRows).length) return; T.begin('filtre'); T.touchMeta(); if (S.filter) S.filter.crit = {}; S.hiddenRows = {}; T.commit(); }
  async function dedupeDialog() {
    const g = currentRegion(); const h0 = looksLikeHeader(g);
    const cols = []; for (let c = g.c1; c <= g.c2; c++) cols.push(c);
    const res = await modal({
      title: 'Supprimer les doublons — ' + F.rangeName(g),
      body: `<label class="row"><input type="checkbox" id="ddH" ${h0 ? 'checked' : ''}> La première ligne contient les titres</label><p class="hint">Colonnes à comparer :</p>
        <div class="flist">${cols.map((c) => `<label><input type="checkbox" data-c="${c}" checked> ${esc(colLabel(g, c, h0))}</label>`).join('')}</div>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Supprimer les doublons', primary: true, value: (b) => ({ h: b.querySelector('#ddH').checked, cols: [...b.querySelectorAll('[data-c]:checked')].map((x) => +x.dataset.c) }) }],
    });
    if (!res || !res.cols.length) return;
    const S = T.sh(); const r1 = res.h ? g.r1 + 1 : g.r1; const seen = new Set(); const keep = [];
    for (let r = r1; r <= g.r2; r++) { const key = res.cols.map((c) => { const v = T.val(r, c); return typeof v === 'string' ? 's' + v.toLowerCase().trim() : String(v); }).join('\u0001'); if (seen.has(key)) continue; seen.add(key); keep.push(r); }
    const removed = g.r2 - r1 + 1 - keep.length; if (!removed) return toast('Aucun doublon trouvé');
    const rows = keep.map((r) => ({ r, cells: Array.from({ length: g.c2 - g.c1 + 1 }, (_, j) => S.cells.get(T.K(r, g.c1 + j))) }));
    T.begin('doublons');
    for (let i = 0; i < g.r2 - r1 + 1; i++) { const row = rows[i]; for (let j = 0; j <= g.c2 - g.c1; j++) { const cl = row ? row.cells[j] : null; T.setCell(r1 + i, g.c1 + j, cl ? { ...cl, f: cl.f != null ? F.shiftFormula(cl.f, r1 + i - row.r, 0) : undefined } : null); } }
    T.commit(); toast(`${removed} ligne(s) en double supprimée(s), ${keep.length} conservée(s)`);
  }
  async function splitTextDialog() {
    const g = T.boundSel(T.selRect()); if (g.c1 !== g.c2) return toast('Sélectionnez une seule colonne');
    const res = await modal({
      title: 'Convertir le texte en colonnes',
      body: `<div class="field"><label for="spD">Séparateur</label><select id="spD"><option value=";">Point-virgule ;</option><option value=",">Virgule ,</option><option value="\t">Tabulation</option><option value=" ">Espace</option><option value="-">Tiret -</option><option value="/">Barre oblique /</option><option value="__o">Autre…</option></select></div><input type="text" id="spO" maxlength="3" placeholder="Autre séparateur" hidden>
        <p class="hint">Les morceaux sont écrits dans les colonnes à droite, qui seront remplacées.</p>`,
      onOpen: (b) => { b.querySelector('#spD').onchange = (e) => { b.querySelector('#spO').hidden = e.target.value !== '__o'; }; },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Convertir', primary: true, value: (b) => (b.querySelector('#spD').value === '__o' ? b.querySelector('#spO').value : b.querySelector('#spD').value) }],
    });
    if (!res) return;
    T.begin('texte en colonnes');
    for (let r = g.r1; r <= g.r2; r++) { const v = T.val(r, g.c1); if (typeof v !== 'string' || !v.includes(res)) continue; v.split(res).forEach((part, j) => { const p = F.parseInput(part.trim()); const old = T.cur(r, g.c1 + j) || {}; T.setCell(r, g.c1 + j, { v: p.v, f: p.f, s: { ...(old.s || {}), ...(p.fmt ? { fmt: p.fmt } : {}) } }); }); }
    T.commit();
  }
  async function fillSeriesDialog() {
    const g = T.selRect(); const v0 = T.val(T.sel.ar, T.sel.ac);
    const res = await modal({
      title: 'Remplir une série',
      body: `<div class="grid2"><div class="field"><label for="srA">Valeur de départ</label><input type="text" id="srA" value="${typeof v0 === 'number' ? esc(F.generalNumber(v0)) : '1'}"></div><div class="field"><label for="srS">Pas</label><input type="text" id="srS" value="1"></div>
        <div class="field"><label for="srE">Dernière valeur (facultatif)</label><input type="text" id="srE"></div><div class="field"><label for="srDir">Sens</label><select id="srDir"><option value="col">Vers le bas</option><option value="row">Vers la droite</option></select></div>
        <div class="field"><label for="srT">Type</label><select id="srT"><option value="lin">Nombres</option><option value="day">Dates : jours</option><option value="wd">Dates : jours ouvrés</option><option value="month">Dates : mois</option><option value="year">Dates : années</option></select></div></div>
        <p class="hint">Sans dernière valeur, la série remplit la sélection (ou 10 cellules). Pour des dates, saisissez par ex. 01/01/2026.</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Remplir', primary: true, value: (b) => ({ a: F.parseInput(b.querySelector('#srA').value), s: F.parseNumberText(b.querySelector('#srS').value) || 1, e: F.parseInput(b.querySelector('#srE').value), dir: b.querySelector('#srDir').value, t: b.querySelector('#srT').value }) }],
    });
    if (!res || typeof res.a.v !== 'number') return res && toast('Valeur de départ invalide');
    const isDate = res.t !== 'lin'; const end = typeof res.e.v === 'number' ? res.e.v : null;
    let n = res.dir === 'col' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1; if (n <= 1 && end === null) n = 10;
    T.begin('série');
    let v = res.a.v;
    for (let i = 0; i < (end !== null ? 100000 : n); i++) {
      if (end !== null && (res.s > 0 ? v > end + 1e-9 : v < end - 1e-9)) break;
      const r = res.dir === 'col' ? g.r1 + i : g.r1, c = res.dir === 'col' ? g.c1 : g.c1 + i;
      const old = T.cur(r, c) || {}; T.setCell(r, c, { v, s: { ...(old.s || {}), ...(isDate ? { fmt: (old.s && old.s.fmt && F.isDateFormat(old.s.fmt)) ? old.s.fmt : 'dd/mm/yyyy' } : {}) } });
      if (res.t === 'lin' || res.t === 'day') v += res.s;
      else if (res.t === 'wd') { let k = Math.abs(res.s); while (k > 0) { v += Math.sign(res.s); const w = F.fromSerial(v).getUTCDay(); if (w !== 0 && w !== 6) k--; } }
      else { const d = F.fromSerial(res.a.v); const m = res.t === 'month' ? (i + 1) * res.s : (i + 1) * res.s * 12; const y = d.getUTCFullYear(), mo = d.getUTCMonth() + m; const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); v = F.serial(y, mo + 1, Math.min(d.getUTCDate(), last)); }
    }
    T.commit();
  }

  /* ================= Rechercher / remplacer ================= */
  let findPanel = null;
  function findDialog() {
    if (findPanel) { findPanel.querySelector('#fdQ').focus(); return; }
    const p = document.createElement('div'); findPanel = p;
    p.style.cssText = 'position:fixed;right:12px;top:110px;z-index:90;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);padding:10px;display:grid;gap:8px;width:min(340px,calc(100vw - 24px))';
    p.innerHTML = `<div class="row" style="justify-content:space-between"><b>Rechercher et remplacer</b><button class="ghost" id="fdX" aria-label="Fermer">✕</button></div>
      <input type="text" id="fdQ" placeholder="Rechercher"><input type="text" id="fdR" placeholder="Remplacer par">
      <div class="row" style="font-size:12px"><label class="row"><input type="checkbox" id="fdCase"> Respecter la casse</label><label class="row"><input type="checkbox" id="fdWhole"> Cellule entière</label><label class="row"><input type="checkbox" id="fdAll"> Toutes les feuilles</label></div>
      <div class="row"><button id="fdN" class="primary">Suivant</button><button id="fdRep">Remplacer</button><button id="fdRepAll">Tout remplacer</button></div><span class="hint" id="fdInfo"></span>`;
    document.body.appendChild(p);
    const q = p.querySelector('#fdQ'), rp = p.querySelector('#fdR'), info = p.querySelector('#fdInfo');
    const opts = () => ({ cs: p.querySelector('#fdCase').checked, whole: p.querySelector('#fdWhole').checked, all: p.querySelector('#fdAll').checked });
    const textOf = (cl, s, r, c) => (cl.f != null ? '=' + F.localize(cl.f) : cellText(s, r, c));
    const matches = (t, o) => { const a = o.cs ? t : t.toLowerCase(), b = o.cs ? q.value : q.value.toLowerCase(); return o.whole ? a === b : a.includes(b); };
    function list(o) {
      const out = []; const sheets = o.all ? T.wb.sheets.map((_, i) => i) : [T.wb.active];
      for (const s of sheets) { const S = T.wb.sheets[s]; const keys = [...S.cells.keys()].sort((a, b) => a - b); for (const k of keys) { const r = T.KR(k), c = T.KC(k); const cl = S.cells.get(k); const t = textOf(cl, s, r, c); if (t && matches(t, o)) out.push({ s, r, c }); } }
      return out;
    }
    function next() {
      if (!q.value) return; const o = opts(); const L = list(o); if (!L.length) { info.textContent = 'Introuvable'; return; }
      const cur = { s: T.wb.active, r: T.sel.ar, c: T.sel.ac }; const pos = (x) => x.s * 1e12 + x.r * F.MAXC + x.c;
      const n = L.find((x) => pos(x) > pos(cur)) || L[0];
      if (n.s !== T.wb.active) T.switchSheet(n.s);
      T.select(n.r, n.c); T.scrollToCell(n.r, n.c); info.textContent = `${L.findIndex((x) => x === n) + 1} sur ${L.length}`;
    }
    function replaceIn(cl, o) {
      const src = cl.f != null ? '=' + F.localize(cl.f) : typeof cl.v === 'string' ? cl.v : cl.v == null ? '' : F.generalNumber(cl.v);
      const re = new RegExp(q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.cs ? 'g' : 'gi');
      const out = o.whole ? rp.value : src.replace(re, () => rp.value);
      const p2 = F.parseInput(out); return { ...cl, v: p2.v, f: p2.f };
    }
    function replaceOne() { const o = opts(); const cl = T.cur(T.sel.ar, T.sel.ac); if (cl && matches(textOf(cl, T.wb.active, T.sel.ar, T.sel.ac), o)) { T.begin('remplacer'); T.setCell(T.sel.ar, T.sel.ac, replaceIn(cl, o)); T.commit(); } next(); }
    function replaceAll() { const o = opts(); const L = list(o); if (!L.length) { info.textContent = 'Introuvable'; return; } T.begin('remplacer'); L.forEach(({ s, r, c }) => T.setCellIn(s, r, c, replaceIn(T.wb.sheets[s].cells.get(T.K(r, c)), o))); T.commit(); info.textContent = `${L.length} remplacement(s)`; }
    p.querySelector('#fdN').onclick = next; p.querySelector('#fdRep').onclick = replaceOne; p.querySelector('#fdRepAll').onclick = replaceAll;
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } if (e.key === 'Escape') close(); });
    const close = () => { p.remove(); findPanel = null; T.scroller.focus(); };
    p.querySelector('#fdX').onclick = close;
    const v = T.val(T.sel.ar, T.sel.ac); if (typeof v === 'string' && v.length < 40) q.value = v;
    q.focus(); q.select();
  }

  /* ================= Insérer une fonction ================= */
  async function insertFunctionDialog() {
    const list = F.functionList();
    const res = await modal({
      title: 'Insérer une fonction', wide: true,
      body: `<input type="text" id="ifQ" placeholder="Rechercher (ex. somme, date, recherche, arrondi)…"><div class="fnlist" id="ifL"></div><div class="fmt-preview" id="ifD" style="font-family:var(--font-ui)">Choisissez une fonction.</div>`,
      onOpen: (b) => {
        let chosen = null;
        const draw = (q) => { const L = list.filter((f) => !q || (f.name + ' ' + f.desc).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)); b.querySelector('#ifL').innerHTML = L.map((f) => `<button type="button" data-n="${f.name}"><b>${f.name}</b>&nbsp;<span class="hint">${esc(f.desc)}</span></button>`).join(''); };
        draw('');
        b.querySelector('#ifQ').oninput = (e) => draw(e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
        b.querySelector('#ifL').onclick = (e) => { const bt = e.target.closest('[data-n]'); if (!bt) return; b.querySelectorAll('[data-n]').forEach((x) => x.classList.toggle('on', x === bt)); chosen = list.find((f) => f.name === bt.dataset.n); b.querySelector('#ifD').innerHTML = `<b>${chosen.name}</b>(${esc(chosen.args)})<br>${esc(chosen.desc)}`; b.dataset.chosen = chosen.name; };
        b.querySelector('#ifL').ondblclick = () => b.closest('.modal').querySelector('footer button.primary').click();
        setTimeout(() => b.querySelector('#ifQ').focus(), 30);
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: (b) => b.dataset.chosen || null }],
    });
    if (!res) return;
    if (T.editing) return;
    T.startEdit('=' + res + '(', 'edit');
  }

  /* ================= Fichiers ================= */
  function fileBase() { return (T.wb.name || 'Classeur').replace(/[\\/:*?"<>|]+/g, '_'); }
  async function newWorkbook() {
    if (T.dirty && T.wb.sheets.some((S) => S.cells.size) && !(await confirmBox('Créer un nouveau classeur ? Le classeur actuel n\'est pas enregistré dans un fichier (il reste dans l\'historique d\'annulation jusqu\'à fermeture).', 'Nouveau'))) return;
    T.loadWorkbook({ name: 'Classeur', sheets: [T.newSheet('Feuil1')], active: 0 }); T.markDirty(false); T.autosave();
  }
  async function openDialog() { const [f] = await pickFiles('.xlsx,.xlsm,.pdf,application/pdf,.csv,.tsv,.txt,.joetab,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv', false); if (f) openFile(f); }
  async function openFile(f) {
    const name = f.name.toLowerCase();
    try {
      let w;
      if (/\.(xlsx|xlsm)$/.test(name)) w = await readXlsx(f);
      else if (/\.(joetab|json)$/.test(name)) w = T.deserialize(JSON.parse(await f.text()));
      else if (/\.(csv|tsv|txt)$/.test(name)) w = await readCsv(f);
      else if (/\.pdf$/.test(name)) {
        toast('Lecture des tableaux du PDF…', 60000);
        const m = await Studio.pdfConvert.analyzeFile(f, { onProgress: (i, k, what) => toast(`Lecture du PDF : page ${i + 1} sur ${k}${what === 'ocr' ? ' (reconnaissance du texte)' : ''}…`, 60000) });
        w = await readXlsx(new File([await Studio.pdfConvert.toXlsx(m)], 'pdf.xlsx'));
      }
      else if (/\.xls$/.test(name)) throw new Error('l\'ancien format .xls n\'est pas pris en charge : dans Excel, enregistrez le fichier en .xlsx');
      else if (/\.ods$/.test(name)) throw new Error('format .ods : enregistrez-le en .xlsx depuis LibreOffice');
      else throw new Error('format non reconnu');
      w.name = baseName(f.name);
      T.loadWorkbook(w); T.markDirty(false); T.autosave();
      toast(`« ${f.name} » ouvert (${w.sheets.length} feuille${w.sheets.length > 1 ? 's' : ''})`);
    } catch (e) { console.error(e); toast('Ouverture impossible : ' + e.message, 7000); }
  }
  onDropFiles($('#gridwrap'), (files) => files[0] && openFile(files[0]));
  // fichier envoyé par une autre application (PDF Joe, Formulaires Joe, Mes fichiers)
  Studio.onImport('tableur', (fs) => openFile(fs[0]));

  async function readCsv(f) {
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    text = text.replace(/^﻿/, '');
    const head = text.split('\n').slice(0, 5).join('\n');
    const count = (ch) => (head.match(new RegExp(ch === '\t' ? '\\t' : '\\' + ch, 'g')) || []).length;
    const sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
    const S = T.newSheet(baseName(f.name).slice(0, 31) || 'Feuil1');
    let r = 0, c = 0, cell = '', q = false, quoted = false;
    const push = () => { if (cell !== '' || quoted) { const p = quoted ? { v: cell } : F.parseInput(cell); const cl = T.cleanCell({ v: p.v, f: p.f, s: p.fmt ? { fmt: p.fmt } : null }); if (cl) { S.cells.set(T.K(r, c), cl); S.maxR = Math.max(S.maxR, r + 1); S.maxC = Math.max(S.maxC, c + 1); } } cell = ''; quoted = false; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"' && cell === '') { q = true; quoted = true; continue; }
      if (ch === sep) { push(); c++; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; push(); r++; c = 0; } else cell += ch;
    }
    push();
    for (let j = 0; j < S.maxC; j++) { let w = 64; for (let i = 0; i < Math.min(S.maxR, 200); i++) { const cl = S.cells.get(T.K(i, j)); if (cl && cl.v != null) w = Math.max(w, F.format(cl.v, cl.s && cl.s.fmt).text.length * 7.5 + 12); } S.colW[j] = Math.min(320, Math.round(w)); }
    return { name: baseName(f.name), sheets: [S], active: 0 };
  }

  const argb = (c) => (c ? 'FF' + c.replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6) : undefined);
  const fromArgb = (o) => { if (!o) return undefined; if (o.argb && /^[0-9A-F]{8}$/i.test(o.argb)) return '#' + o.argb.slice(2).toLowerCase(); if (o.theme !== undefined) return THEME_COLORS[o.theme] ? shade(THEME_COLORS[o.theme], o.tint || 0) : undefined; if (o.indexed !== undefined) return INDEXED[o.indexed]; return undefined; };
  const THEME_COLORS = ['#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];
  const INDEXED = { 8: '#000000', 9: '#ffffff', 10: '#ff0000', 11: '#00ff00', 12: '#0000ff', 13: '#ffff00', 22: '#c0c0c0', 64: undefined };
  function shade(hex, t) { if (!t) return hex; const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((v) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t))); return '#' + n.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join(''); }
  const BORDER_W = { thin: 1, hair: 1, dotted: 1, dashed: 1, medium: 2, mediumDashed: 2, thick: 3, double: 1 };
  const EPOCH = Date.UTC(1899, 11, 30);

  async function readXlsx(f) {
    await loadScript('lib/exceljs.min.js');
    const xw = new window.ExcelJS.Workbook();
    await xw.xlsx.load(await f.arrayBuffer());
    const sheets = [];
    xw.eachSheet((ws) => {
      if (ws.state === 'veryHidden') return;
      const S = T.newSheet(ws.name);
      ws.eachRow({ includeEmpty: false }, (row, rn) => {
        if (row.height && Math.abs(row.height - 15) > 0.5) S.rowH[rn - 1] = Math.round(row.height * 4 / 3);
        if (row.hidden) S.hiddenRows[rn - 1] = true;
        row.eachCell({ includeEmpty: false }, (cell, cn) => {
          const r = rn - 1, c = cn - 1; const out = {};
          let v = cell.value;
          if (v && typeof v === 'object' && !(v instanceof Date)) {
            if (v.formula || v.sharedFormula) { let fml = cell.formula || v.formula; if (fml) out.f = fml.replace(/^=/, ''); else v = v.result; }
            else if (v.richText) v = v.richText.map((x) => x.text).join('');
            else if (v.text !== undefined) v = typeof v.text === 'object' && v.text.richText ? v.text.richText.map((x) => x.text).join('') : v.text;
            else if (v.error) v = null;
            else if ('result' in v) v = v.result;
          }
          if (out.f === undefined) {
            if (v instanceof Date) v = (v.getTime() - EPOCH) / 86400000;
            if (v !== null && v !== undefined && typeof v === 'object') v = null;
            out.v = v;
          }
          const st = {}; const fo = cell.font || {};
          if (fo.bold) st.b = true; if (fo.italic) st.i = true; if (fo.underline) st.u = true; if (fo.strike) st.st = true;
          if (fo.size && Math.abs(fo.size - 11) > 0.1) st.fs = fo.size;
          const fcol = fromArgb(fo.color); if (fcol && fcol !== '#000000') st.fc = fcol;
          if (fo.name && !/calibri|aptos/i.test(fo.name)) st.ff = `'${fo.name}', Arial, sans-serif`;
          const fi = cell.fill; if (fi && fi.type === 'pattern' && fi.pattern && fi.pattern !== 'none') { const bg = fromArgb(fi.fgColor) || fromArgb(fi.bgColor); if (bg && bg !== '#ffffff') st.bg = bg; }
          const al = cell.alignment || {};
          if (['left', 'center', 'right'].includes(al.horizontal)) st.ha = al.horizontal; if (al.horizontal === 'centerContinuous') st.ha = 'center';
          if (al.vertical === 'middle' || al.vertical === 'top') st.va = al.vertical; if (al.wrapText) st.wrap = true; if (al.indent) st.ind = al.indent;
          if (cell.numFmt && cell.numFmt !== 'General') st.fmt = cell.numFmt;
          const bd = cell.border; if (bd) { const b = {}; for (const [k, kk] of [['top', 't'], ['bottom', 'b'], ['left', 'l'], ['right', 'r']]) if (bd[k] && bd[k].style) b[kk] = { w: BORDER_W[bd[k].style] || 1, c: fromArgb(bd[k].color) || '#000000', ...(bd[k].style === 'double' ? { st: 'double' } : {}) }; if (Object.keys(b).length) st.bd = b; }
          if (Object.keys(st).length) out.s = st;
          const cl = T.cleanCell(out); if (cl) { S.cells.set(T.K(r, c), cl); S.maxR = Math.max(S.maxR, r + 1); S.maxC = Math.max(S.maxC, c + 1); }
        });
      });
      (ws.columns || []).forEach((col, i) => { if (col && col.width && Math.abs(col.width - 9.140625) > 0.2) S.colW[i] = Math.round(col.width * 7 + 5); if (col && col.hidden) S.colW[i] = 0; });
      const merges = (ws.model && ws.model.merges) || [];
      merges.forEach((m) => { const g = F.parseRange(m); if (g) S.merges.push(g); });
      const v = (ws.views || [])[0]; if (v && v.state === 'frozen') S.freeze = { r: v.ySplit || 0, c: v.xSplit || 0 };
      if (ws.autoFilter) { const g = F.parseRange(typeof ws.autoFilter === 'string' ? ws.autoFilter : `${ws.autoFilter.from}:${ws.autoFilter.to}`); if (g) S.filter = { r: g.r1, c1: g.c1, c2: g.c2, crit: {} }; }
      // le format « Standard » français est enregistré en anglais ; les colonnes masquées gardent 0
      for (const k of Object.keys(S.colW)) if (S.colW[k] === 0) S.colW[k] = 2;
      sheets.push(S);
    });
    if (!sheets.length) throw new Error('aucune feuille lisible');
    return { name: baseName(f.name), sheets, active: 0 };
  }

  async function saveXlsx() {
    await loadScript('lib/exceljs.min.js');
    T.recalc();
    const xw = new window.ExcelJS.Workbook(); xw.creator = 'Tableur Joe'; xw.created = new Date();
    T.wb.sheets.forEach((S, s) => {
      const ws = xw.addWorksheet(S.name.slice(0, 31), { views: [S.freeze.r || S.freeze.c ? { state: 'frozen', xSplit: S.freeze.c, ySplit: S.freeze.r } : {}], properties: S.tab ? { tabColor: { argb: argb(S.tab) } } : {} });
      for (const [c, w] of Object.entries(S.colW)) ws.getColumn(+c + 1).width = Math.max(0.5, (w - 5) / 7);
      for (const [r, h] of Object.entries(S.rowH)) ws.getRow(+r + 1).height = h * 0.75;
      for (const r of Object.keys(S.hiddenRows)) ws.getRow(+r + 1).hidden = true;
      for (const [k, cl] of S.cells) {
        const r = T.KR(k), c = T.KC(k); const cell = ws.getCell(r + 1, c + 1);
        if (cl.f != null) {
          let res = T.eng.value(s, r, c);
          // fonctions propres à Tableur Joe (ENLETTRES…) : Excel ne les connaît pas, on enregistre le résultat
          if (/\b(NUMBERTEXT|COUNTUNIQUE)\(/i.test(cl.f)) cell.value = F.isErr(res) ? null : res;
          else { if (F.isErr(res)) res = { error: res.code === '#CIRC!' ? '#REF!' : res.code }; cell.value = { formula: cl.f, result: res === null ? undefined : res }; }
        }
        else if (cl.v !== undefined) cell.value = cl.v;
        const st = cl.s; if (!st) continue;
        const font = {}; if (st.b) font.bold = true; if (st.i) font.italic = true; if (st.u) font.underline = true; if (st.st) font.strike = true; if (st.fs) font.size = st.fs; if (st.fc) font.color = { argb: argb(st.fc) };
        if (st.ff) font.name = st.ff.split(',')[0].replace(/['"]/g, '').trim();
        if (Object.keys(font).length) cell.font = { name: font.name || 'Calibri', size: font.size || 11, ...font };
        if (st.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.bg) } };
        const al = {}; if (st.ha) al.horizontal = st.ha; if (st.va) al.vertical = st.va; if (st.wrap) al.wrapText = true; if (st.ind) al.indent = st.ind; if (Object.keys(al).length) cell.alignment = al;
        if (st.fmt) cell.numFmt = st.fmt;
        if (st.bd) { const b = {}; for (const [kk, k2] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) { const x = st.bd[kk]; if (x) b[k2] = { style: x.st === 'double' ? 'double' : x.w >= 3 ? 'thick' : x.w === 2 ? 'medium' : 'thin', color: { argb: argb(x.c || '#000000') } }; } cell.border = b; }
      }
      S.merges.forEach((m) => { try { ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1); } catch (e) { /* fusion chevauchante ignorée */ } });
      if (S.filter) ws.autoFilter = { from: F.addr(S.filter.r, S.filter.c1), to: F.addr(S.filter.r, S.filter.c2) };
      S.cf.forEach((x) => {
        const ref = F.rangeName(x.range); const style = { font: x.style && x.style.fc ? { color: { argb: argb(x.style.fc) }, bold: !!x.style.b } : undefined, fill: x.style && x.style.bg ? { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(x.style.bg) } } : undefined };
        const num = (v) => (typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`);
        let rule = null;
        if (['gt', 'lt', 'ge', 'le', 'eq', 'between', 'neg'].includes(x.type)) rule = { type: 'cellIs', operator: { gt: 'greaterThan', lt: 'lessThan', ge: 'greaterThanOrEqual', le: 'lessThanOrEqual', eq: 'equal', between: 'between', neg: 'lessThan' }[x.type], formulae: x.type === 'between' ? [num(x.a), num(x.b)] : [x.type === 'neg' ? '0' : num(x.a)], style };
        else if (x.type === 'contains') rule = { type: 'containsText', operator: 'containsText', text: String(x.a), style };
        else if (x.type === 'dup') rule = { type: 'duplicateValues', style };
        else if (x.type === 'top') rule = { type: 'top10', rank: x.a || 10, style };
        else if (x.type === 'aboveAvg') rule = { type: 'aboveAverage', style };
        else if (x.type === 'bar') rule = { type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: argb(x.color || '#5a8ac6') } };
        else if (x.type === 'scale') rule = { type: 'colorScale', cfvo: x.mid ? [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }] : [{ type: 'min' }, { type: 'max' }], color: (x.mid ? [x.c1, x.mid, x.c2] : [x.c1, x.c2]).map((cc) => ({ argb: argb(cc) })) };
        if (rule) { rule.priority = 1; try { ws.addConditionalFormatting({ ref, rules: [rule] }); } catch (e) { console.warn('règle ignorée', e); } }
      });
    });
    const buf = await xw.xlsx.writeBuffer();
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase() + '.xlsx');
    if (T.wb.sheets.some((S) => S.charts.length)) toast('Enregistré. Les graphiques ne sont pas conservés dans le .xlsx : utilisez .joetab pour les garder.', 7000);
    else toast('Classeur enregistré en .xlsx');
    T.markDirty(false);
  }
  function saveCsv() {
    const S = T.sh(); const s = T.wb.active; const rows = [];
    for (let r = 0; r < S.maxR; r++) {
      const row = [];
      for (let c = 0; c < S.maxC; c++) {
        const cl = S.cells.get(T.K(r, c)); if (!cl) { row.push(''); continue; }
        const v = T.eng.value(s, r, c); let t;
        if (typeof v === 'number') t = cl.s && cl.s.fmt && F.isDateFormat(cl.s.fmt) ? F.format(v, cl.s.fmt).text : F.generalNumber(v);
        else t = F.format(v, null).text;
        row.push(/[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);
      }
      rows.push(row.join(';'));
    }
    download(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${fileBase()} - ${S.name}.csv`);
    toast('Feuille enregistrée en CSV (séparateur « ; », ouvrable dans Excel)');
  }
  function saveJoe() { download(new Blob([JSON.stringify(T.serialize())], { type: 'application/json' }), fileBase() + '.joetab'); T.markDirty(false); toast('Classeur enregistré (.joetab)'); }
  async function renameWorkbook() {
    const n = await modal({ title: 'Nom du classeur', body: `<input type="text" id="wbn" value="${esc(T.wb.name)}">`, onOpen: (b) => b.querySelector('#wbn').select(), buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => b.querySelector('#wbn').value.trim() }] });
    if (n) { T.wb.name = n; T.markDirty(); T.autosave(); }
  }

  /* ================= PDF ================= */
  async function pdfDialog() {
    const g = T.selRect(); const multi = g.r1 !== g.r2 || g.c1 !== g.c2;
    const res = await modal({
      title: 'Exporter en PDF / imprimer',
      body: `<div class="grid2"><div class="field"><label for="pdW">Contenu</label><select id="pdW"><option value="sheet">Feuille active</option>${multi ? '<option value="sel" selected>Sélection</option>' : ''}<option value="all">Toutes les feuilles</option></select></div>
        <div class="field"><label for="pdO">Orientation</label><select id="pdO"><option value="p">Portrait</option><option value="l">Paysage</option></select></div></div>
        <label class="row"><input type="checkbox" id="pdFit" checked> Ajuster toutes les colonnes à la largeur de la page</label>
        <label class="row"><input type="checkbox" id="pdGrid"> Imprimer le quadrillage</label>
        <label class="row"><input type="checkbox" id="pdHead" checked> Répéter la première ligne en haut de chaque page</label>
        <div class="field"><label for="pdT">Titre en haut de page (facultatif)</label><input type="text" id="pdT" value=""></div>
        <p class="hint">Le PDF peut ensuite être imprimé depuis la visionneuse de l'appareil.</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Créer le PDF', primary: true, value: (b) => ({ what: b.querySelector('#pdW').value, o: b.querySelector('#pdO').value, fit: b.querySelector('#pdFit').checked, grid: b.querySelector('#pdGrid').checked, head: b.querySelector('#pdHead').checked, title: b.querySelector('#pdT').value.trim() }) }],
    });
    if (!res) return;
    await loadScript('lib/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: res.o === 'l' ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 30;
    const sheets = res.what === 'all' ? T.wb.sheets.map((_, i) => i) : [T.wb.active];
    let first = true, pageNo = 0;
    const clean = (t) => String(t).replace(/[  ]/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[−‐‑]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[^\x00-\xff€]/g, '?');
    for (const s of sheets) {
      const S = T.wb.sheets[s]; if (!S.maxR && !S.charts.length) continue;
      let g2 = res.what === 'sel' ? T.boundSel(g) : { r1: 0, c1: 0, r2: S.maxR - 1, c2: S.maxC - 1 };
      if (g2.r2 < g2.r1 || g2.c2 < g2.c1) continue;
      const colW = (c) => (S.colW[c] !== undefined ? S.colW[c] : T.DEF_W) * 0.75, rowH = (r) => (S.hiddenRows[r] ? 0 : (S.rowH[r] !== undefined ? S.rowH[r] : T.DEF_H)) * 0.75;
      let totalW = 0; for (let c = g2.c1; c <= g2.c2; c++) totalW += colW(c);
      const availW = PW - 2 * M; const k = res.fit ? Math.min(1, availW / totalW) : 1;
      // tranches de colonnes (si pas d'ajustement)
      const colChunks = []; let cs = g2.c1, acc = 0;
      for (let c = g2.c1; c <= g2.c2; c++) { if (acc + colW(c) * k > availW && c > cs) { colChunks.push([cs, c - 1]); cs = c; acc = 0; } acc += colW(c) * k; }
      colChunks.push([cs, g2.c2]);
      const top0 = M + (res.title ? 22 : 0) + 12;
      for (const [ca, cb] of colChunks) {
        let r = g2.r1;
        while (r <= g2.r2) {
          if (!first) doc.addPage(); first = false; pageNo++;
          if (res.title) { doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0); doc.text(clean(res.title), M, M + 10); }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120); doc.text(clean(`${T.wb.name} — ${S.name}`), M, PH - 14); doc.text(`Page ${pageNo}`, PW - M, PH - 14, { align: 'right' });
          let y = top0;
          const drawRow = (rr) => {
            const h = rowH(rr) * k; if (!h) return;
            let x = M;
            for (let c = ca; c <= cb; c++) {
              const w = colW(c) * k; const m = mergeOf(S, rr, c);
              if (m && (m.r1 !== rr || m.c1 !== c)) { x += w; continue; }
              let ww = w, hh = h; if (m) { ww = 0; for (let cc = m.c1; cc <= Math.min(m.c2, cb); cc++) ww += colW(cc) * k; hh = 0; for (let r3 = m.r1; r3 <= m.r2; r3++) hh += rowH(r3) * k; }
              const cl = S.cells.get(T.K(rr, c)); const st = (cl && cl.s) || {};
              const cfx = S.cf.length ? cfFor(S, s, rr, c) : null;
              const bg = (cfx && cfx.bg) || st.bg;
              if (bg) { doc.setFillColor(bg); doc.rect(x, y, ww, hh, 'F'); }
              if (res.grid) { doc.setDrawColor(210); doc.setLineWidth(0.3); doc.rect(x, y, ww, hh); }
              if (cl) {
                const v = T.eng.value(s, rr, c); const fm = F.format(v, st.fmt); let t = clean(fm.text);
                if (t) {
                  const fs = (st.fs || 11) * k * 0.95; doc.setFontSize(fs); doc.setFont(st.ff && /times|georgia/i.test(st.ff) ? 'times' : st.ff && /courier/i.test(st.ff) ? 'courier' : 'helvetica', st.b || (cfx && cfx.b) ? (st.i ? 'bolditalic' : 'bold') : st.i ? 'italic' : 'normal');
                  doc.setTextColor((cfx && cfx.fc) || fm.color || st.fc || '#000000');
                  const al = st.ha || fm.align || (typeof v === 'number' ? 'right' : 'left');
                  const lines = st.wrap ? doc.splitTextToSize(t, ww - 4) : [t];
                  if (!st.wrap && typeof v === 'number' && doc.getTextWidth(t) > ww - 3) lines[0] = '#'.repeat(Math.max(1, Math.floor((ww - 3) / doc.getTextWidth('#'))));
                  const lh = fs * 1.15; const va = st.va || 'bottom';
                  let ty = va === 'top' ? y + fs + 1 : va === 'middle' ? y + (hh - lines.length * lh) / 2 + fs * 0.85 : y + hh - 2.5 - (lines.length - 1) * lh;
                  lines.forEach((ln, i) => { const tx = al === 'right' ? x + ww - 2 : al === 'center' ? x + ww / 2 : x + 2 + (st.ind || 0) * 6 * k; doc.text(ln, tx, ty + i * lh, { align: al === 'right' ? 'right' : al === 'center' ? 'center' : 'left', maxWidth: st.wrap ? ww - 4 : undefined }); });
                }
                if (st.bd) { const side = (b, x1, y1, x2, y2) => { if (!b) return; doc.setDrawColor(b.c || '#000000'); doc.setLineWidth((b.w || 1) * 0.6); doc.line(x1, y1, x2, y2); if (b.st === 'double') { doc.setLineWidth(0.4); doc.line(x1, y1 + 1.6, x2, y2 + 1.6); } }; side(st.bd.t, x, y, x + ww, y); side(st.bd.b, x, y + hh, x + ww, y + hh); side(st.bd.l, x, y, x, y + hh); side(st.bd.r, x + ww, y, x + ww, y + hh); }
              }
              x += w;
            }
            y += h;
          };
          if (res.head && r > g2.r1) drawRow(g2.r1);
          let any = false;
          while (r <= g2.r2 && (y + rowH(r) * k <= PH - M - 12 || !any)) { drawRow(r); any = true; r++; }
        }
      }
      // graphiques de la feuille : une page chacun
      for (const ch of res.what === 'sel' ? [] : S.charts) {
        doc.addPage(); pageNo++;
        const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(chartSVG(ch, ch.w * 2, ch.h * 2).replace(/viewBox="[^"]*"/, `viewBox="0 0 ${ch.w} ${ch.h}"`));
        await img.decode(); const c = document.createElement('canvas'); c.width = ch.w * 2; c.height = ch.h * 2; c.getContext('2d').drawImage(img, 0, 0);
        const wPt = Math.min(PW - 2 * M, ch.w), hPt = wPt * ch.h / ch.w; doc.addImage(c.toDataURL('image/png'), 'PNG', M, M + 10, wPt, hPt);
      }
    }
    if (first) return toast('Rien à exporter : la feuille est vide');
    download(doc.output('blob'), fileBase() + '.pdf'); toast('PDF créé');
  }
  function mergeOf(S, r, c) { for (const m of S.merges) if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m; return null; }
  function cfFor(S, s, r, c) { if (s !== T.wb.active) return null; let out = null; S.cf.forEach((rule, i) => { const g = rule.range; if (r < g.r1 || r > g.r2 || c < g.c1 || c > g.c2) return; const x = cfTest(rule, T.eng.value(s, r, c), i, null); if (x && !x.bar) out = { ...(out || {}), ...x }; }); return out; }

  /* ================= Largeur / hauteur ================= */
  async function colWidthDialog() {
    const g = T.selRect(); const S = T.sh(); const w = S.colW[T.sel.ac] !== undefined ? S.colW[T.sel.ac] : T.DEF_W;
    const v = await modal({ title: 'Largeur de colonne', body: `<div class="field"><label for="cw">Largeur (en caractères, comme Excel)</label><input type="number" id="cw" min="0.5" max="255" step="0.5" value="${Math.round(((w - 5) / 7) * 10) / 10}"></div>`, onOpen: (b) => b.querySelector('#cw').select(), buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => +b.querySelector('#cw').value }] });
    if (!v) return; T.begin('largeur'); T.touchMeta(); const c2 = Math.min(g.c2, Math.max(S.maxC + 20, g.c1)); for (let c = g.c1; c <= c2; c++) S.colW[c] = Math.round(v * 7 + 5); T.commit();
  }
  async function rowHeightDialog() {
    const g = T.selRect(); const S = T.sh(); const h = S.rowH[T.sel.ar] !== undefined ? S.rowH[T.sel.ar] : T.DEF_H;
    const v = await modal({ title: 'Hauteur de ligne', body: `<div class="field"><label for="rh">Hauteur (en points, comme Excel)</label><input type="number" id="rh" min="3" max="409" step="0.75" value="${Math.round(h * 0.75 * 100) / 100}"></div>`, onOpen: (b) => b.querySelector('#rh').select(), buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => +b.querySelector('#rh').value }] });
    if (!v) return; T.begin('hauteur'); T.touchMeta(); const r2 = Math.min(g.r2, Math.max(S.maxR + 50, g.r1)); for (let r = g.r1; r <= r2; r++) S.rowH[r] = Math.round(v * 4 / 3); T.commit();
  }

  /* ================= Modèles ================= */
  // cellule : texte saisi (comme au clavier) ou [texte, style]
  function buildSheet(name, rows, { colW = {}, merges = [], freeze, cf = [], charts = [], filter = null, rowH = {} } = {}) {
    const S = T.newSheet(name); Object.assign(S, { colW, rowH, merges: merges.map((m) => F.parseRange(m)), freeze: freeze || { r: 0, c: 0 }, cf, charts, filter });
    rows.forEach((row, r) => (row || []).forEach((spec, c) => {
      if (spec === null || spec === undefined || spec === '') return;
      const [text, st] = Array.isArray(spec) ? spec : [spec, null];
      const p = text === null || text === undefined ? { v: null } : F.parseInput(String(text)); const s = { ...(p.fmt ? { fmt: p.fmt } : {}), ...(st || {}) };
      const cl = T.cleanCell({ v: p.v, f: p.f, s }); if (cl) { S.cells.set(T.K(r, c), cl); S.maxR = Math.max(S.maxR, r + 1); S.maxC = Math.max(S.maxC, c + 1); }
    }));
    // hauteur des lignes selon la taille du texte
    for (const [k, cl] of S.cells) { const r = T.KR(k); if (cl.s && cl.s.fs > 12 && S.rowH[r] === undefined) S.rowH[r] = Math.round(cl.s.fs * 4 / 3 * 1.35 + 6); }
    return S;
  }
  const H = { b: true, bg: '#1f7a46', fc: '#ffffff', ha: 'center', va: 'middle', bd: { b: { w: 1, c: '#145c33' } } };
  const MONEY = '#,##0" FCFA"', NUM = '#,##0';
  const IN = { bg: '#fff9db' };
  const TEMPLATES = {
    facture: { title: 'Facture', desc: 'Lignes, total HT, TVA 18 %, TTC et montant en lettres', build() {
      const rows = [
        [['FACTURE', { b: true, fs: 20, fc: '#1f7a46' }], null, null, ['N° 2026-001', { ha: 'right', b: true }]],
        [null, null, null, ['=AUJOURDHUI()', { ha: 'right', fmt: 'dd/mm/yyyy' }]],
        [['Émetteur', { b: true }], null, ['Client', { b: true }]],
        [['Votre entreprise', IN], null, ['Nom du client', IN]],
        [['Adresse, ville', IN], null, ['Adresse, ville', IN]],
        [['IFU / RCCM', IN], null, ['IFU du client', IN]],
        [],
        [['Désignation', H], ['Quantité', H], ['Prix unitaire', H], ['Montant', H]],
      ];
      for (let i = 0; i < 8; i++) { const r = 9 + i; rows.push([[i === 0 ? 'Prestation de conseil' : i === 1 ? 'Fournitures' : '', IN], [i === 0 ? '2' : i === 1 ? '10' : '', { ...IN, ha: 'center' }], [i === 0 ? '150000' : i === 1 ? '2500' : '', { ...IN, fmt: NUM }], [`=SI(B${r}="";"";B${r}*C${r})`, { fmt: NUM }]]); }
      rows.push([], [null, null, ['Total HT', { b: true, ha: 'right' }], ['=SOMME(D9:D16)', { fmt: MONEY, b: true }]],
        [null, ['Taux TVA', { ha: 'right' }], ['18%', { ...IN, ha: 'right' }], ['=ARRONDI(D18*C19;0)', { fmt: MONEY }]],
        [null, null, ['Total TTC', { b: true, ha: 'right', bg: '#d3ecdc' }], ['=D18+D19', { fmt: MONEY, b: true, bg: '#d3ecdc', bd: { t: { w: 1, c: '#000' }, b: { w: 1, c: '#000', st: 'double' } } }]],
        [], [['Arrêtée la présente facture à la somme de :', { i: true }]], [['=ENLETTRES(D20;"francs CFA")', { b: true, wrap: true }]], [], [['Signature et cachet', { ha: 'right' }], null, null, null]);
      const S = buildSheet('Facture', rows, { colW: { 0: 300, 1: 80, 2: 120, 3: 140 }, merges: ['A23:D23'], rowH: { 0: 36, 22: 36 } });
      for (let r = 8; r <= 15; r++) for (let c = 0; c < 4; c++) { const cl = S.cells.get(T.K(r, c)) || {}; S.cells.set(T.K(r, c), { ...cl, s: { ...(cl.s || {}), bd: { b: { w: 1, c: '#c9ccd4' } } } }); }
      S.maxR = Math.max(S.maxR, 16); return [S];
    } },
    budget: { title: 'Budget prévisionnel / réalisé', desc: 'Prévu, réalisé, écart, taux d\'exécution, alertes en rouge', build() {
      const cats = [['Recettes fiscales', 25000000, 23100000], ['Recettes domaniales', 8000000, 8650000], ['Dotations et subventions', 40000000, 40000000], ['Autres recettes', 3000000, 1250000]];
      const deps = [['Personnel', 30000000, 29400000], ['Fonctionnement des services', 12000000, 13250000], ['Entretien et réparations', 6000000, 4100000], ['Transferts et subventions', 9000000, 8700000], ['Investissements', 15000000, 9800000]];
      const SUB = { b: true, bg: '#eef0f4' }, SUBR = { b: true, bg: '#eef0f4', ha: 'right', fc: '#5d6578' };
      const rows = [[['Exécution du budget 2026', { b: true, fs: 16 }]], [], [['Rubrique', H], ['Prévu', H], ['Réalisé', H], ['Écart', H], ['Taux d\'exécution', H]], [['RECETTES', SUB], ['Prévu', SUBR], ['Réalisé', SUBR], [null, SUB], [null, SUB]]];
      const line = (r, [n, p, x]) => [n, [String(p), { ...IN, fmt: NUM }], [String(x), { ...IN, fmt: NUM }], [`=C${r}-B${r}`, { fmt: '#,##0;[Red]-#,##0' }], [`=SIERREUR(C${r}/B${r};0)`, { fmt: '0.0%' }]];
      cats.forEach((c, i) => rows.push(line(5 + i, c)));
      const rt = 5 + cats.length; rows.push([['Total recettes', { b: true }], [`=SOMME(B5:B${rt - 1})`, { b: true, fmt: NUM, bd: { t: { w: 1 } } }], [`=SOMME(C5:C${rt - 1})`, { b: true, fmt: NUM, bd: { t: { w: 1 } } }], [`=C${rt}-B${rt}`, { b: true, fmt: '#,##0;[Red]-#,##0' }], [`=SIERREUR(C${rt}/B${rt};0)`, { b: true, fmt: '0.0%' }]]);
      rows.push([], [['DÉPENSES', SUB], ['Prévu', SUBR], ['Réalisé', SUBR], [null, SUB], [null, SUB]]);
      const d0 = rt + 3; deps.forEach((c, i) => rows.push(line(d0 + i, c)));
      const dt = d0 + deps.length; rows.push([['Total dépenses', { b: true }], [`=SOMME(B${d0}:B${dt - 1})`, { b: true, fmt: NUM, bd: { t: { w: 1 } } }], [`=SOMME(C${d0}:C${dt - 1})`, { b: true, fmt: NUM, bd: { t: { w: 1 } } }], [`=C${dt}-B${dt}`, { b: true, fmt: '#,##0;[Red]-#,##0' }], [`=SIERREUR(C${dt}/B${dt};0)`, { b: true, fmt: '0.0%' }]]);
      rows.push([], [['Solde (recettes − dépenses)', { b: true }], [`=B${rt}-B${dt}`, { b: true, fmt: '#,##0;[Red]-#,##0' }], [`=C${rt}-C${dt}`, { b: true, fmt: '#,##0;[Red]-#,##0' }]]);
      const cf = [{ range: { r1: 4, c1: 4, r2: dt - 1, c2: 4 }, type: 'bar', color: '#5a8ac6' }, { range: { r1: d0 - 1, c1: 3, r2: dt - 2, c2: 3 }, type: 'gt', a: 0, style: CF_STYLES.red }];
      const charts = [{ id: 'cb1', type: 'bar', range: `A${d0 - 1}:C${dt - 1}`, title: 'Dépenses : prévu et réalisé', legend: true, series: 'cols', x: 790, y: 40, w: 460, h: 300 }];
      return [buildSheet('Budget', rows, { colW: { 0: 230, 1: 120, 2: 120, 3: 120, 4: 120 }, freeze: { r: 3, c: 1 }, cf, charts })];
    } },
    caisse: { title: 'Journal de caisse', desc: 'Recettes, dépenses et solde cumulé, filtrable', build() {
      const rows = [[['Journal de caisse', { b: true, fs: 16 }]], [['Solde d\'ouverture', { b: true }], null, null, ['500000', { ...IN, fmt: NUM }]], [],
        [['Date', H], ['N° pièce', H], ['Libellé', H], ['Recettes', H], ['Dépenses', H], ['Solde', H]]];
      const ops = [['02/01/2026', 'R001', 'Versement taxe de marché', 125000, ''], ['03/01/2026', 'D001', 'Achat fournitures', '', 45000], ['05/01/2026', 'D002', 'Carburant', '', 30000], ['08/01/2026', 'R002', 'Droits de place', 60000, '']];
      for (let i = 0; i < 40; i++) { const r = 5 + i; const o = ops[i] || ['', '', '', '', '']; rows.push([[o[0], { ...IN, fmt: 'dd/mm/yyyy' }], [o[1], IN], [o[2], IN], [String(o[3]), { ...IN, fmt: NUM }], [String(o[4]), { ...IN, fmt: NUM }], [`=SI(ET(D${r}="";E${r}="");"";$D$2+SOMME($D$5:D${r})-SOMME($E$5:E${r}))`, { fmt: '#,##0;[Red]-#,##0' }]]); }
      rows.push([], [['Totaux', { b: true }], null, null, ['=SOMME(D5:D44)', { b: true, fmt: NUM }], ['=SOMME(E5:E44)', { b: true, fmt: NUM }], ['=D2+D46-E46', { b: true, fmt: '#,##0;[Red]-#,##0', bd: { b: { w: 1, st: 'double', c: '#000' } } }]]);
      return [buildSheet('Caisse', rows, { colW: { 0: 90, 1: 80, 2: 260, 3: 110, 4: 110, 5: 120 }, freeze: { r: 4, c: 0 }, filter: { r: 3, c1: 0, c2: 5, crit: {} } })];
    } },
    emprunt: { title: 'Tableau d\'amortissement', desc: 'Emprunt : mensualité (VPM), intérêts, capital, restant dû', build() {
      const rows = [[['Tableau d\'amortissement d\'un emprunt', { b: true, fs: 16 }]], [], [['Capital emprunté'], ['10000000', { ...IN, fmt: NUM }]], [['Taux annuel'], ['9%', { ...IN, fmt: '0.00%' }]], [['Durée (mois)'], ['36', IN]], [['Première échéance'], ['31/01/2026', { ...IN, fmt: 'dd/mm/yyyy' }]],
        [['Mensualité', { b: true }], ['=VPM(B4/12;B5;-B3)', { b: true, fmt: MONEY, bg: '#d3ecdc' }]], [['Coût total du crédit'], ['=B7*B5-B3', { fmt: MONEY }]], [],
        [['N°', H], ['Échéance', H], ['Mensualité', H], ['Intérêts', H], ['Capital', H], ['Restant dû', H]]];
      for (let i = 1; i <= 120; i++) { const r = 10 + i; rows.push([[`=SI(${i}>$B$5;"";${i})`, { ha: 'center' }], [`=SI(A${r}="";"";MOIS.DECALER($B$6;A${r}-1))`, { fmt: 'dd/mm/yyyy' }], [`=SI(A${r}="";"";$B$7)`, { fmt: NUM }], [`=SI(A${r}="";"";${i === 1 ? '$B$3' : `F${r - 1}`}*$B$4/12)`, { fmt: NUM }], [`=SI(A${r}="";"";C${r}-D${r})`, { fmt: NUM }], [`=SI(A${r}="";"";${i === 1 ? '$B$3' : `F${r - 1}`}-E${r})`, { fmt: NUM }]]); }
      return [buildSheet('Emprunt', rows, { colW: { 0: 160, 1: 130, 2: 120, 3: 110, 4: 110, 5: 130 }, freeze: { r: 10, c: 0 } })];
    } },
    depenses: { title: 'Suivi des dépenses', desc: 'Saisie des dépenses, synthèse par catégorie et graphique', build() {
      const cats = ['Alimentation', 'Transport', 'Logement', 'Santé', 'Éducation', 'Communication', 'Loisirs', 'Divers'];
      const rows = [[['Date', H], ['Catégorie', H], ['Libellé', H], ['Montant', H], ['Mode de paiement', H]]];
      const sample = [['02/10/2026', 'Alimentation', 'Marché', 15000, 'Espèces'], ['03/10/2026', 'Transport', 'Carburant moto', 6000, 'Espèces'], ['05/10/2026', 'Communication', 'Forfait internet', 10000, 'Mobile money'], ['06/10/2026', 'Santé', 'Pharmacie', 7500, 'Espèces'], ['08/10/2026', 'Alimentation', 'Supermarché', 22500, 'Carte']];
      for (let i = 0; i < 60; i++) { const o = sample[i] || ['', '', '', '', '']; rows.push([[o[0], { ...IN, fmt: 'dd/mm/yyyy' }], [o[1], IN], [o[2], IN], [String(o[3]), { ...IN, fmt: NUM }], [o[4], IN]]); }
      const D = buildSheet('Dépenses', rows, { colW: { 0: 90, 1: 140, 2: 220, 3: 110, 4: 140 }, freeze: { r: 1, c: 0 }, filter: { r: 0, c1: 0, c2: 4, crit: {} } });
      const srows = [[['Synthèse par catégorie', { b: true, fs: 16 }]], [], [['Catégorie', H], ['Total', H], ['Part', H]]];
      cats.forEach((c, i) => srows.push([c, [`=SOMME.SI(Dépenses!B:B;A${4 + i};Dépenses!D:D)`, { fmt: NUM }], [`=SIERREUR(B${4 + i}/$B$${4 + cats.length};0)`, { fmt: '0%' }]]));
      srows.push([['Total', { b: true }], [`=SOMME(B4:B${3 + cats.length})`, { b: true, fmt: MONEY, bd: { t: { w: 1 } } }], ['', {}]]);
      srows.push([], [['Ce mois-ci', { b: true }], ['=SOMME.SI.ENS(Dépenses!D:D;Dépenses!A:A;">="&FIN.MOIS(AUJOURDHUI();-1)+1;Dépenses!A:A;"<="&FIN.MOIS(AUJOURDHUI();0))', { fmt: MONEY }]]);
      const charts = [{ id: 'cd1', type: 'donut', range: `A3:B${3 + cats.length}`, title: 'Répartition des dépenses', legend: true, series: 'cols', x: 380, y: 40, w: 420, h: 300 }];
      const Sy = buildSheet('Synthèse', srows, { colW: { 0: 160, 1: 130, 2: 80 }, charts, cf: [{ range: { r1: 3, c1: 2, r2: 2 + cats.length, c2: 2 }, type: 'bar', color: '#d9861c' }] });
      return [D, Sy];
    } },
  };
  async function templatesDialog() {
    const res = await modal({
      title: 'Nouveau à partir d\'un modèle', wide: true,
      body: `<div class="tpl-grid">${Object.entries(TEMPLATES).map(([k, t]) => `<button type="button" data-t="${k}"><b>${esc(t.title)}</b><span>${esc(t.desc)}</span></button>`).join('')}</div><p class="hint">Les cellules jaune pâle sont à remplir ; les autres se calculent.</p>`,
      onOpen: (b) => b.querySelectorAll('[data-t]').forEach((x) => { x.onclick = () => { b.dataset.t = x.dataset.t; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
      buttons: [{ label: 'Annuler', value: null }, { label: 'Ouvrir', primary: true, value: (b) => b.dataset.t || null }],
    });
    if (!res) return;
    if (T.dirty && T.wb.sheets.some((S) => S.cells.size) && !(await confirmBox('Remplacer le classeur actuel par ce modèle ? (Pensez à l\'enregistrer avant si besoin.)', 'Ouvrir le modèle'))) return;
    const t = TEMPLATES[res]; const sheets = t.build();
    T.loadWorkbook({ name: t.title, sheets, active: 0 }); T.markDirty(true); T.autosave();
  }

  /* ================= Assistant IA ================= */
  function sheetContext() {
    const S = T.sh(); const lines = []; const R = Math.min(S.maxR, 25), C = Math.min(S.maxC, 14);
    for (let r = 0; r < R; r++) { const parts = []; for (let c = 0; c < C; c++) { const cl = S.cells.get(T.K(r, c)); if (!cl) continue; const t = cl.f != null ? '=' + F.localize(cl.f) + ' → ' + cellText(T.wb.active, r, c) : cellText(T.wb.active, r, c); parts.push(`${F.addr(r, c)}: ${t.slice(0, 60)}`); } if (parts.length) lines.push(parts.join(' | ')); }
    return `Feuille « ${S.name} » (${S.maxR} lignes utilisées, ${S.maxC} colonnes). Autres feuilles : ${T.wb.sheets.filter((x) => x !== S).map((x) => x.name).join(', ') || 'aucune'}.\nDébut du contenu :\n${lines.join('\n') || '(vide)'}`;
  }
  async function aiFormula() {
    const target = F.addr(T.sel.ar, T.sel.ac);
    const q = await modal({ title: 'Écrire une formule avec l\'IA', body: `<div class="field"><label for="aiQ">Que voulez-vous calculer dans ${target} ?</label><textarea id="aiQ" placeholder="ex. le total des montants de la colonne D quand la catégorie en B est « Transport »"></textarea></div><p class="hint">L'IA voit le début de la feuille (titres et premières lignes) pour proposer la formule.</p>`, onOpen: (b) => { b.querySelector('#aiQ').focus(); Studio.speech && Studio.speech.attachMic(b.querySelector('#aiQ')); }, buttons: [{ label: 'Annuler', value: null }, { label: 'Proposer une formule', primary: true, value: (b) => b.querySelector('#aiQ').value.trim() }] });
    if (!q) return;
    const key = await Studio.ai.ensureKey({ title: 'Assistant formules : IA Claude', purpose: 'votre demande et le début de la feuille (titres et premières lignes)' }); if (!key) return;
    await loadScript('lib/anthropic-sdk.js');
    toast('Claude réfléchit…', 20000);
    try {
      const out = await Studio.ai.callJson(key, {
        system: 'Tu es un expert Excel francophone. Tu écris des formules Excel en VERSION FRANÇAISE (noms de fonctions français comme SOMME, SI, RECHERCHEV, SOMME.SI.ENS, NB.SI, ARRONDI, SIERREUR ; séparateur d\'arguments « ; » ; virgule décimale). N\'utilise pas de formules matricielles avec accolades ni de fonctions à résultat débordant (FILTRE, TRIER, UNIQUE). Pour un montant en lettres, la fonction ENLETTRES(nombre;"devise") existe. Réponds en français.',
        content: `Contexte :\n${sheetContext()}\n\nCellule de destination : ${target}\nDemande : ${q}`,
        schema: { type: 'object', additionalProperties: false, required: ['formula', 'explanation'], properties: { formula: { type: 'string', description: 'formule commençant par =' }, explanation: { type: 'string', description: 'explication courte en français' } } },
      });
      let f = String(out.formula || '').trim(); if (!f.startsWith('=')) f = '=' + f;
      try { F.parse(F.canonicalize(f.slice(1))); } catch (e) { throw new Error('formule proposée incorrecte : ' + f); }
      const ok = await modal({ title: 'Formule proposée', body: `<div class="fmt-preview">${esc(f)}</div><p>${esc(out.explanation || '')}</p>`, buttons: [{ label: 'Annuler', value: false }, { label: `Insérer dans ${target}`, primary: true, value: true }] });
      if (ok) { T.begin('formule IA'); const cl = T.cur(T.sel.ar, T.sel.ac) || {}; T.setCell(T.sel.ar, T.sel.ac, { ...cl, v: undefined, f: F.canonicalize(f.slice(1)) }); T.commit(); }
    } catch (e) { toast('Assistant indisponible : ' + e.message, 7000); }
  }
  async function aiExplain() {
    const cl = T.cur(T.sel.ar, T.sel.ac); if (!cl || cl.f == null) return toast('La cellule active ne contient pas de formule');
    const key = await Studio.ai.ensureKey({ title: 'Expliquer une formule : IA Claude', purpose: 'la formule et le début de la feuille' }); if (!key) return;
    await loadScript('lib/anthropic-sdk.js'); toast('Claude réfléchit…', 20000);
    try {
      const out = await Studio.ai.callJson(key, { system: 'Tu expliques des formules Excel en français simple, pour un comptable, en 3 à 6 phrases, sans jargon inutile.', content: `Contexte :\n${sheetContext()}\n\nFormule en ${F.addr(T.sel.ar, T.sel.ac)} : =${F.localize(cl.f)}\nRésultat actuel : ${cellText(T.wb.active, T.sel.ar, T.sel.ac)}`, schema: { type: 'object', additionalProperties: false, required: ['explanation'], properties: { explanation: { type: 'string' } } } });
      modal({ title: 'Explication de la formule', body: `<div class="fmt-preview">=${esc(F.localize(cl.f))}</div><p style="white-space:pre-wrap">${esc(out.explanation)}</p>` });
    } catch (e) { toast('Assistant indisponible : ' + e.message, 7000); }
  }

  Studio.sheetExtra = {
    filterMenu,
    actions: {
      new: newWorkbook, open: openDialog, saveXlsx, saveCsv, saveJoe, pdf: pdfDialog, rename: renameWorkbook, templates: templatesDialog,
      formatCells: formatCellsDialog, condFormat: condFormatDialog, clearCF, chart: () => chartDialog(null),
      sortAsc: () => quickSort(false), sortDesc: () => quickSort(true), sort: sortDialog, filter: toggleFilter, clearFilter, dedupe: dedupeDialog, splitText: splitTextDialog, fillSeries: fillSeriesDialog,
      find: findDialog, insFn: insertFunctionDialog, colWidth: colWidthDialog, rowHeight: rowHeightDialog, aiFormula, aiExplain,
    },
    openFile, chartSVG, readXlsx, TEMPLATES,
  };
})();
