/* BRVM Tracker Joe — import (relevé SGI CSV / Excel / texte collé) et exports (Excel, CSV, JSON). */
(function () {
  /* ---------- Nombres et dates au format français ---------- */
  BT.parseNum = function (v) {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    let s = String(v).trim().replace(/[\s  ]|F\s?CFA|XOF|FCFA|F$/gi, '');
    if (!s) return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.includes(',') && s.includes('.')) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (s.includes(',')) {
      s = /,\d{3}$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s.replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? 0 : neg ? -n : n;
  };

  const MONTHS = { janv: 1, jan: 1, fevr: 2, fev: 2, feb: 2, mars: 3, mar: 3, avr: 4, apr: 4, mai: 5, may: 5, juin: 6, jun: 6, juil: 7, jul: 7, aout: 8, aug: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n) => String(n).padStart(2, '0');

  BT.parseDate = function (v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+v) * 86400000); // date Excel
      return d.toISOString().slice(0, 10);
    }
    const s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
    m = s.match(/^(\d{1,2})\s*([a-z]+)\.?\s*(\d{2,4})/);
    if (m && MONTHS[m[2].slice(0, 4)] || m && MONTHS[m[2].slice(0, 3)]) {
      const mo = MONTHS[m[2].slice(0, 4)] || MONTHS[m[2].slice(0, 3)];
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${y}-${pad(mo)}-${pad(m[1])}`;
    }
    return '';
  };

  /* ---------- Lecture de fichiers ---------- */
  BT.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/).slice(0, 5).join('\n');
    const delim = [';', '\t', ',', '|'].map((d) => [d, (first.match(new RegExp('\\' + d, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim()));
  };

  // Lecteur .xlsx minimal (première feuille) à l'aide de JSZip
  BT.readXlsx = async function (buf) {
    const zip = await JSZip.loadAsync(buf);
    const xml = async (p) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
    const ss = await xml('xl/sharedStrings.xml');
    const strings = ss ? [...ss.getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : [];
    const wb = await xml('xl/workbook.xml');
    const rels = await xml('xl/_rels/workbook.xml.rels');
    let path = 'xl/worksheets/sheet1.xml';
    try {
      const sheet = wb.getElementsByTagName('sheet')[0];
      const rid = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const rel = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
      if (rel) path = 'xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '');
    } catch (e) { /* chemin par défaut */ }
    const styles = await xml('xl/styles.xml');
    const dateStyles = new Set();
    if (styles) {
      const custom = {};
      for (const nf of styles.getElementsByTagName('numFmt')) custom[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode');
      const xfs = styles.getElementsByTagName('cellXfs')[0];
      if (xfs) [...xfs.getElementsByTagName('xf')].forEach((xf, i) => {
        const id = +xf.getAttribute('numFmtId');
        if ((id >= 14 && id <= 22) || (custom[id] && /[dy]/i.test(custom[id]) && !/\[h\]/i.test(custom[id]))) dateStyles.add(i);
      });
    }
    const doc = await xml(path);
    const rows = [];
    for (const r of doc.getElementsByTagName('row')) {
      const row = [];
      for (const c of r.getElementsByTagName('c')) {
        const ref = c.getAttribute('r') || '';
        let col = 0;
        for (const ch of ref.replace(/\d/g, '')) col = col * 26 + ch.charCodeAt(0) - 64;
        const t = c.getAttribute('t');
        const vEl = c.getElementsByTagName('v')[0];
        let v = vEl ? vEl.textContent : '';
        if (t === 's') v = strings[+v] || '';
        else if (t === 'inlineStr') v = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
        else if (v !== '' && dateStyles.has(+c.getAttribute('s'))) v = BT.parseDate(+v);
        row[(col || row.length + 1) - 1] = v;
      }
      rows.push([...row].map((x) => (x == null ? '' : x)));
    }
    return rows.filter((r) => r.some((c) => String(c).trim()));
  };

  /* ---------- Lecture de relevés PDF (pdf.js, chargé à la demande) ---------- */
  let pdfjsReady = null;
  function loadPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsReady) pdfjsReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; resolve(window.pdfjsLib); };
      s.onerror = () => { pdfjsReady = null; reject(new Error('Lecteur PDF indisponible (vérifiez la connexion au premier usage).')); };
      document.head.appendChild(s);
    });
    return pdfjsReady;
  }

  const isDateCell = (c) => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(String(c).trim());
  const isNumCell = (c) => /^[-+(]?\d[\d\s  .,]*\)?$/.test(String(c).trim());

  // Reconstitue les lignes et colonnes d'un relevé PDF à partir de la position des mots
  BT.readPdf = async function (buf) {
    const pdfjsLib = await loadPdfjs();
    let doc, password;
    for (;;) {
      try { doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)), password }).promise; break; }
      catch (err) {
        if (err && err.name === 'PasswordException') {
          password = window.prompt(err.code === 2 ? 'Mot de passe incorrect. Mot de passe du PDF :' : 'Ce relevé PDF est protégé. Mot de passe :');
          if (password == null) throw new Error('Import annulé : mot de passe non fourni.');
        } else throw new Error('PDF illisible : ' + (err && err.message || err));
      }
    }
    const lines = []; // { cells: [{ x0, x1, t }] }
    let chars = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => {
        const h = Math.abs(it.transform[3]) || Math.abs(it.height) || 8;
        return { x0: it.transform[4], x1: it.transform[4] + (it.width || it.str.length * h * 0.5), y: it.transform[5], h, t: it.str };
      });
      chars += items.reduce((a, it) => a + it.t.trim().length, 0);
      items.sort((a, b) => b.y - a.y || a.x0 - b.x0);
      const pageLines = [];
      for (const it of items) {
        const ln = pageLines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.45));
        if (ln) ln.items.push(it); else pageLines.push({ y: it.y, items: [it] });
      }
      for (const l of pageLines.sort((a, b) => b.y - a.y)) {
        l.items.sort((a, b) => a.x0 - b.x0);
        const cells = [];
        for (const it of l.items) {
          const last = cells[cells.length - 1];
          // mots proches = même cellule (les nombres « 1 000 000 » sont souvent découpés)
          if (last && it.x0 - last.x1 < it.h * 0.45) { last.t += (it.x0 - last.x1 > it.h * 0.15 ? ' ' : '') + it.t; last.x1 = Math.max(last.x1, it.x1); }
          else cells.push({ x0: it.x0, x1: it.x1, t: it.t });
        }
        cells.forEach((c) => { c.t = c.t.replace(/\s+/g, ' ').trim(); });
        lines.push({ cells, page: n, y: l.y, h: Math.max(...l.items.map((it) => it.h)) });
      }
    }
    if (chars < 20) throw new Error('Ce PDF ne contient pas de texte (document scanné ou photo). Exportez le relevé en Excel/CSV depuis l\'espace client de votre SGI, ou passez-le d\'abord dans un outil de reconnaissance de texte (OCR).');
    const plain = lines.map((l) => l.cells.map((c) => c.t));
    const hi = BT.findHeader(plain);
    const header = lines[hi].cells;
    const score = header.filter((c) => Object.values(BT.IMPORT_FIELDS).some((f) => f.re.test(norm(c.t)))).length;
    if (score < 2) return plain; // pas d'en-tête reconnu : cellules brutes, la correspondance se règle à la main
    const headerKey = header.map((c) => norm(c.t)).join('|');
    const centers = header.map((c) => (c.x0 + c.x1) / 2);
    const place = (cell) => {
      let best = -1, ov = 0;
      header.forEach((h, i) => {
        const o = Math.min(cell.x1, h.x1 + 2) - Math.max(cell.x0, h.x0 - 2);
        if (o > ov) { ov = o; best = i; }
      });
      if (best >= 0) return best;
      // pas de chevauchement : colonne dont le centre est le plus proche
      const cx = (cell.x0 + cell.x1) / 2;
      return centers.reduce((bi, c, i) => (Math.abs(c - cx) < Math.abs(centers[bi] - cx) ? i : bi), 0);
    };
    const out = [header.map((c) => c.t)];
    let prevLine = null;
    for (const l of lines.slice(hi + 1)) {
      if (l.cells.map((c) => norm(c.t)).join('|') === headerKey) continue; // en-tête répété sur chaque page
      const row = header.map(() => '');
      for (const c of l.cells) { const i = place(c); row[i] = row[i] ? row[i] + ' ' + c.t : c.t; }
      const prev = out[out.length - 1];
      // libellé sur deux lignes : la suite (juste dessous, sans date ni montant) est rattachée à l'opération précédente
      const close = prevLine && prevLine.page === l.page && prevLine.y - l.y <= Math.max(prevLine.h, l.h) * 1.6;
      if (close && out.length > 1 && !row.some(isDateCell) && prev.some(isDateCell) && l.cells.length <= 2 && !l.cells.some((c) => isNumCell(c.t))) {
        row.forEach((v, i) => { if (v) prev[i] = prev[i] ? prev[i] + ' ' + v : v; });
        prevLine = l;
        continue;
      }
      out.push(row);
      prevLine = l;
    }
    return out;
  };

  BT.readFile = async function (file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return BT.readPdf(await file.arrayBuffer());
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return BT.readXlsx(await file.arrayBuffer());
    if (name.endsWith('.xls')) throw new Error('Format .xls ancien non pris en charge : enregistrez le fichier en .xlsx ou .csv.');
    if (name.endsWith('.json')) throw new Error('Pour restaurer une sauvegarde .json, utilisez Paramètres → Restaurer.');
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    return BT.parseCSV(text);
  };

  /* ---------- Correspondance des colonnes ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  BT.IMPORT_FIELDS = {
    date: { label: 'Date', re: /^date|date (d.)?op|date valeur|jour/ },
    type: { label: 'Type / sens', re: /^(type|sens|nature|operation|op\.?|mouvement)$|type d.op|nature op/ },
    label: { label: 'Libellé', re: /libelle|description|designation|detail|operation|commentaire/ },
    ticker: { label: 'Titre / code', re: /^(titre|valeur|code|symbole|ticker|isin|instrument|action|societe)|code valeur|libelle valeur/ },
    qty: { label: 'Quantité', re: /quantit|qte|nombre|nb\.? ?titres|volume/ },
    price: { label: 'Cours / prix', re: /^(cours|prix)|prix unit|cours exec|cours moyen/ },
    amount: { label: 'Montant net', re: /montant|net|total|valeur nette/ },
    fees: { label: 'Frais / commission', re: /frais|commission|courtage|taxe|tva/ },
    debit: { label: 'Débit', re: /^debit|sortie/ },
    credit: { label: 'Crédit', re: /^credit|entree/ },
  };

  BT.findHeader = function (rows) {
    let best = 0, score = -1;
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const sc = rows[i].filter((c) => Object.values(BT.IMPORT_FIELDS).some((f) => f.re.test(norm(c)))).length;
      if (sc > score) { score = sc; best = i; }
    }
    return best;
  };

  BT.guessMapping = function (header) {
    const map = {};
    const used = new Set();
    const order = ['date', 'debit', 'credit', 'qty', 'price', 'fees', 'ticker', 'type', 'amount', 'label'];
    for (const f of order) {
      const i = header.findIndex((h, j) => !used.has(j) && BT.IMPORT_FIELDS[f].re.test(norm(h)));
      if (i >= 0) { map[f] = i; used.add(i); }
    }
    return map;
  };

  function guessType(text) {
    const s = norm(text);
    if (/fraction|split|division du nominal/.test(s)) return 'split';
    if (/divid|coupon/.test(s)) return 'dividende';
    if (/achat|buy|souscri|acquisition|^a$/.test(s)) return 'achat';
    if (/vente|sell|cession|^v$/.test(s)) return 'vente';
    if (/droits? (de )?garde|frais|commission|tenue de compte|agios|taxe/.test(s)) return 'frais';
    if (/interet/.test(s)) return 'interet';
    if (/retrait|virement emis|remboursement|transfert sortant|decaissement/.test(s)) return 'retrait';
    if (/versement|depot|apport|virement recu|alimentation|approvisionnement|encaissement|transfert entrant/.test(s)) return 'depot';
    return '';
  }

  function findTicker(text, stocks) {
    if (!text) return '';
    const up = String(text).toUpperCase();
    const direct = BT.normTicker(up);
    if (stocks.some((s) => s.t === direct)) return direct;
    for (const tok of up.split(/[^A-Z0-9]+/)) { const t = BT.normTicker(tok); if (t.length >= 3 && stocks.some((s) => s.t === t)) return t; }
    const n = norm(text);
    let best = '', len = 0;
    for (const s of stocks) {
      const sn = norm(s.n);
      if (sn.length > len && n.includes(sn)) { best = s.t; len = sn.length; }
    }
    return best;
  }

  // Convertit les lignes du fichier en opérations, selon la correspondance choisie
  BT.rowsToTx = function (rows, map, pid) {
    const stocks = BT.stocks();
    const out = [];
    const cell = (r, f) => (map[f] != null && map[f] !== '' ? r[map[f]] : '');
    for (const r of rows) {
      const date = BT.parseDate(cell(r, 'date'));
      if (!date) continue;
      const label = [cell(r, 'type'), cell(r, 'label')].filter(Boolean).join(' — ');
      const debit = Math.abs(BT.parseNum(cell(r, 'debit')));
      const credit = Math.abs(BT.parseNum(cell(r, 'credit')));
      const rawAmount = BT.parseNum(cell(r, 'amount'));
      let type = guessType(cell(r, 'type')) || guessType(cell(r, 'label'));
      if (!type && (debit || credit)) type = credit ? 'depot' : 'retrait';
      if (!type && rawAmount) type = rawAmount > 0 ? 'depot' : 'retrait';
      if (!type) continue;
      const ticker = findTicker(cell(r, 'ticker'), stocks) || (BT.TX_TYPES[type].stock ? findTicker(cell(r, 'label'), stocks) : '');
      let qty = Math.abs(BT.parseNum(cell(r, 'qty')));
      let price = Math.abs(BT.parseNum(cell(r, 'price')));
      let fees = Math.abs(BT.parseNum(cell(r, 'fees')));
      const amount = Math.abs(rawAmount) || debit || credit;
      if ((type === 'achat' || type === 'vente') && qty) {
        if (!price && amount) price = Math.round(amount / qty * 100) / 100;
        else if (!fees && amount && price) {
          const diff = type === 'achat' ? amount - qty * price : qty * price - amount;
          if (diff > 0 && diff < qty * price * 0.1) fees = Math.round(diff);
        }
      }
      const tx = { id: BT.uid(), pid, date, type, ticker: BT.TX_TYPES[type].stock ? ticker : '', qty: BT.TX_TYPES[type].stock ? qty : '', price: type === 'achat' || type === 'vente' ? price : '', fees: type === 'achat' || type === 'vente' ? fees : '', amount: '', note: String(label).slice(0, 120) };
      if (type === 'dividende') { tx.amount = amount || qty * price; if (price) tx.price = price; }
      if (['depot', 'retrait', 'frais', 'interet'].includes(type)) tx.amount = amount;
      tx.problem = BT.txProblem(tx);
      out.push(tx);
    }
    return out;
  };

  BT.txProblem = function (t) {
    const def = BT.TX_TYPES[t.type];
    if (!def) return 'Type inconnu';
    if (!t.date) return 'Date manquante';
    if (def.stock && !t.ticker) return 'Titre non reconnu';
    if ((t.type === 'achat' || t.type === 'vente') && !(+t.qty > 0 && +t.price > 0)) return 'Quantité ou cours manquant';
    if (t.type === 'split' && !(+t.qty > 0)) return 'Ratio manquant';
    if (!def.stock && !(+t.amount > 0)) return 'Montant manquant';
    if (t.type === 'dividende' && !(BT.txCash(t) > 0)) return 'Montant manquant';
    return '';
  };

  BT.txKey = (t) => [t.pid, t.date, t.type, t.ticker || '', +t.qty || 0, Math.round(BT.txCash(t))].join('|');

  /* ---------- Exports ---------- */
  BT.download = function (name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  BT.toCSV = function (rows) {
    return '﻿' + rows.map((r) => r.map((c) => {
      const s = typeof c === 'number' ? String(c).replace('.', ',') : String(c ?? '');
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
  };

  const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  // Écrit un classeur .xlsx (sheets: [{ name, rows }]) — ligne 1 en gras, colonnes élargies
  BT.writeXlsx = async function (sheets) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xesc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE8F7"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>');
    sheets.forEach((s, si) => {
      const widths = [];
      const body = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
        widths[ci] = Math.max(widths[ci] || 8, Math.min(50, String(c ?? '').length + 2));
        const ref = colName(ci) + (ri + 1);
        if (typeof c === 'number' && isFinite(c)) return `<c r="${ref}"${ri ? ' s="2"' : ' s="1"'}><v>${c}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${ri ? '' : ' s="1"'}><is><t xml:space="preserve">${xesc(c ?? '')}</t></is></c>`;
      }).join('')}</row>`).join('');
      zip.file(`xl/worksheets/sheet${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>`);
    });
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  BT.txRows = function (txs) {
    const rows = [['Date', 'Portefeuille', 'Type', 'Titre', 'Quantité', 'Cours', 'Frais', 'Montant', 'Mouvement trésorerie', 'Note']];
    for (const t of txs) rows.push([t.date, BT.portfolioName(t.pid), BT.TX_TYPES[t.type].label, t.ticker || '', +t.qty || '', +t.price || '', +t.fees || '', +t.amount || '', Math.round(BT.txCash(t)), t.note || '']);
    return rows;
  };

  BT.exportExcel = async function (pid) {
    const sm = BT.summary(pid);
    const pos = [['Titre', 'Nom', 'Secteur', 'Pays', 'Quantité', 'PRU', 'Cours', 'Valeur', 'Plus-value latente', 'PV latente %', 'PV réalisée', 'Dividendes reçus', 'Poids %']];
    for (const p of sm.positions) pos.push([p.t, p.stock.n, p.stock.s, p.stock.c, p.qty, Math.round(p.pru), p.price, Math.round(p.value), Math.round(p.latent), +p.latentPct.toFixed(2), Math.round(p.realized), Math.round(p.dividends), +p.weight.toFixed(2)]);
    const syn = [['Indicateur', 'Valeur'],
      ['Portefeuille', BT.portfolioName(pid)], ['Date', BT.today()],
      ['Valeur totale', Math.round(sm.total)], ['Actions', Math.round(sm.mv)], ['Trésorerie', Math.round(sm.cash)],
      ['Apports nets', Math.round(sm.netContrib)], ['Gain total', Math.round(sm.gain)], ['Gain total %', +sm.gainPct.toFixed(2)],
      ['Plus-values latentes', Math.round(sm.latent)], ['Plus-values réalisées', Math.round(sm.r.realized)],
      ['Dividendes nets reçus', Math.round(sm.r.dividends)], ['Frais de courtage', Math.round(sm.r.tradeFees)], ['Autres frais', Math.round(sm.r.otherFees)],
      ['Rendement annualisé (XIRR) %', sm.xirr == null ? '' : +sm.xirr.toFixed(2)], ['Revenu de dividendes estimé / an', Math.round(sm.income)]];
    const div = [['Année', 'Titre', 'Montant net']];
    const by = BT.dividendsByYear(pid);
    for (const y of Object.keys(by).sort()) for (const [t, v] of Object.entries(by[y].items)) div.push([y, t, Math.round(v)]);
    const blob = await BT.writeXlsx([{ name: 'Synthèse', rows: syn }, { name: 'Positions', rows: pos }, { name: 'Opérations', rows: BT.txRows(sm.txs) }, { name: 'Dividendes', rows: div }]);
    BT.download(`brvm-portefeuille-${BT.today()}.xlsx`, blob);
  };
})();
