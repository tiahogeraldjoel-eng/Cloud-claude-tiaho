#!/usr/bin/env node
/**
 * Fetch BRVM stock prices — stratégie multi-sources :
 *  1. Intercepter les requêtes XHR/API de brvm.org via Playwright
 *  2. africainvestment.net (HTML server-side rendu)
 *  3. abidjan.net bourse (HTML server-side rendu)
 *  4. Playwright brvm.org (scraping HTML après JS)
 *  5. Cache existant
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'brvm_stocks.json');
const API_CACHE_FILE = path.join(__dirname, '..', 'data', 'brvm_api_url.txt');

const KNOWN_TICKERS = new Set([
  'ABJC','BICB','BICC','BNBC','BOAB','BOABF','BOAC','BOAM','BOAN','BOAS',
  'CABC','CBIBF','CFAC','CIEC','ECOC','ETIT','FTSC','LNBB','NEIC','NSBC',
  'NTLC','ONTBF','ORAC','ORGT','PALC','PRSC','SAFC','SCRC','SDCC','SDSC',
  'SEMC','SGBC','SHEC','SIBC','SICC','SIVC','SLBC','SMBC','SNTS','SOGC',
  'SPHC','STAC','STBC','TTLC','TTLS','UNLC','UNXC',
]);

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

function parseNum(s) {
  if (!s) return null;
  s = String(s).replace(/\s/g, '').replace('%', '').replace(',', '.');
  s = s.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function loadExisting() {
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    const map = {};
    for (const s of (data.stocks || [])) map[s.ticker] = s;
    return map;
  } catch { return {}; }
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseHtmlTable(html) {
  const stocks = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let rowM;
  while ((rowM = rowRe.exec(html)) !== null) {
    const cells = [];
    const cRe = new RegExp(cellRe.source, 'gi');
    let cM;
    while ((cM = cRe.exec(rowM[1])) !== null) cells.push(stripTags(cM[1]));
    if (cells.length < 4) continue;

    const ticker = cells[0].toUpperCase().replace(/[^A-Z]/g, '');
    if (!KNOWN_TICKERS.has(ticker)) continue;

    let price = null, priceIdx = -1;
    for (let i = 1; i < Math.min(cells.length, 8); i++) {
      const v = parseNum(cells[i]);
      if (v !== null && v > 10 && v < 10_000_000) { price = v; priceIdx = i; break; }
    }
    if (price === null) continue;

    let changePct = 0;
    for (let i = priceIdx + 1; i < Math.min(cells.length, priceIdx + 5); i++) {
      const v = parseNum(cells[i]);
      if (v !== null && v >= -99 && v <= 99) { changePct = v; break; }
    }

    let volume = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      const t = cells[i].replace(/\D/g, '');
      const v = parseInt(t, 10);
      if (!isNaN(v) && v > 0 && v < 100_000_000) { volume = v; break; }
    }

    const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
    stocks.push({ ticker, closing_price: price, previous_closing_price: prev,
                  volume, change_pct: Math.round(changePct * 10000) / 10000 });
  }
  return stocks;
}

// ── Source 1 : API brvm.org mise en cache (si découverte précédemment) ─────────

async function tryCachedApi() {
  try {
    const apiUrl = fs.readFileSync(API_CACHE_FILE, 'utf8').trim();
    if (!apiUrl) return null;
    console.log(`[API cache] Tentative: ${apiUrl}`);
    const resp = await fetch(apiUrl, { headers: FETCH_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    const stocks = extractFromBRVMJson(data);
    if (stocks.length >= 5) {
      console.log(`[API cache] ${stocks.length} titres depuis API mise en cache`);
      return stocks;
    }
  } catch {}
  return null;
}

function extractFromBRVMJson(data) {
  const stocks = [];
  const rows = Array.isArray(data) ? data : (data.data || data.stocks || data.cours || data.items || []);
  if (!Array.isArray(rows)) return stocks;
  for (const row of rows) {
    const ticker = String(row.symbol || row.ticker || row.code || row.libelle || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!KNOWN_TICKERS.has(ticker)) continue;
    const price = parseNum(String(row.last || row.cours || row.closing_price || row.prix || row.close || 0));
    if (!price || price <= 1) continue;
    const changePct = parseNum(String(row.var || row.variation || row.change_pct || row.pct || 0)) || 0;
    const volume = parseInt(String(row.volume || row.vol || 0).replace(/\D/g, ''), 10) || 0;
    const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
    stocks.push({ ticker, closing_price: price, previous_closing_price: prev,
                  volume, change_pct: Math.round(changePct * 10000) / 10000 });
  }
  return stocks;
}

// ── Source 2 : africainvestment.net ─────────────────────────────────────────

async function tryAfricaInvestment() {
  const urls = [
    'https://www.africainvestment.net/bourse/brvm/',
    'https://www.africainvestment.net/bourse/brvm/cotations',
    'https://www.africainvestment.net/BRVM/',
  ];
  for (const url of urls) {
    try {
      console.log(`[africainvestment] Tentative: ${url}`);
      const resp = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) });
      if (!resp.ok) continue;
      const html = await resp.text();
      if (html.length < 500) continue;
      const stocks = parseHtmlTable(html);
      if (stocks.length >= 5) {
        console.log(`[africainvestment] ${stocks.length} titres`);
        return stocks;
      }
    } catch (e) {
      console.log(`[africainvestment] Erreur ${url}: ${e.message}`);
    }
  }
  return null;
}

// ── Source 3 : abidjan.net ───────────────────────────────────────────────────

async function tryAbidjanNet() {
  const urls = [
    'https://www.abidjan.net/bourse/',
    'https://www.abidjan.net/bourse/cours.asp',
    'https://www.abidjan.net/bourse/brvm.asp',
  ];
  for (const url of urls) {
    try {
      console.log(`[abidjan.net] Tentative: ${url}`);
      const resp = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) });
      if (!resp.ok) continue;
      const html = await resp.text();
      if (html.length < 500) continue;
      const stocks = parseHtmlTable(html);
      if (stocks.length >= 5) {
        console.log(`[abidjan.net] ${stocks.length} titres`);
        return stocks;
      }
    } catch (e) {
      console.log(`[abidjan.net] Erreur ${url}: ${e.message}`);
    }
  }
  return null;
}

// ── Source 4 : Playwright brvm.org avec interception XHR ────────────────────

async function tryPlaywrightWithInterception() {
  console.log('[Playwright] Lancement Chromium + interception XHR...');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    userAgent: FETCH_HEADERS['User-Agent'],
    locale: 'fr-FR',
    extraHTTPHeaders: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
  });
  const page = await context.newPage();

  // Intercepter toutes les réponses JSON pour trouver l'API interne
  const capturedApiData = [];
  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json') && !url.includes('json') && !url.includes('api') && !url.includes('cours')) return;
    try {
      const body = await response.text();
      if (body.length < 50 || !body.includes('[')) return;
      const data = JSON.parse(body);
      const stocks = extractFromBRVMJson(data);
      if (stocks.length >= 3) {
        console.log(`[XHR intercept] API trouvée: ${url} → ${stocks.length} titres`);
        capturedApiData.push({ url, stocks });
        // Sauvegarder l'URL pour les prochaines exécutions
        fs.mkdirSync(path.dirname(API_CACHE_FILE), { recursive: true });
        fs.writeFileSync(API_CACHE_FILE, url);
      }
    } catch {}
  });

  let stocks = [];
  for (const url of ['https://www.brvm.org/fr/cours-des-actions/0/all', 'https://www.brvm.org/fr/cours-des-actions/0']) {
    try {
      console.log(`[Playwright] Chargement: ${url}`);
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      if (response && response.status() >= 400) {
        console.log(`[Playwright] HTTP ${response.status()} pour ${url}`);
        continue;
      }

      // Utiliser les données interceptées si disponibles
      if (capturedApiData.length > 0) {
        stocks = capturedApiData[0].stocks;
        break;
      }

      // Sinon parser le HTML
      await page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => {});
      stocks = await page.evaluate((knownTickers) => {
        const result = [];
        const rows = document.querySelectorAll('table tbody tr');
        rows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length < 4) return;
          const raw = cells[0].toUpperCase().replace(/[^A-Z]/g, '');
          if (!knownTickers.includes(raw)) return;
          const parseN = (s) => {
            if (!s) return null;
            s = String(s).replace(/\s/g, '').replace('%', '').replace(',', '.');
            s = s.replace(/\.(?=\d{3}(?:\D|$))/g, '');
            const n = parseFloat(s);
            return isNaN(n) ? null : n;
          };
          let price = null, priceIdx = -1;
          for (let i = 1; i < Math.min(cells.length, 8); i++) {
            const v = parseN(cells[i]);
            if (v !== null && v > 10 && v < 10000000) { price = v; priceIdx = i; break; }
          }
          if (!price) return;
          let changePct = 0;
          for (let i = priceIdx + 1; i < Math.min(cells.length, priceIdx + 5); i++) {
            const v = parseN(cells[i]);
            if (v !== null && v >= -99 && v <= 99) { changePct = v; break; }
          }
          let volume = 0;
          for (let i = cells.length - 1; i >= 0; i--) {
            const t = cells[i].replace(/\D/g, '');
            const v = parseInt(t, 10);
            if (!isNaN(v) && v > 0 && v < 100000000) { volume = v; break; }
          }
          const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
          result.push({ ticker: raw, closing_price: price, previous_closing_price: prev,
                        volume, change_pct: Math.round(changePct * 10000) / 10000 });
        });
        return result;
      }, Array.from(KNOWN_TICKERS));

      if (stocks.length >= 5) { console.log(`[Playwright HTML] ${stocks.length} titres`); break; }
    } catch (e) {
      console.error(`[Playwright] Erreur ${url}:`, e.message);
    }
  }

  await browser.close();
  return stocks.length >= 5 ? stocks : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Fetch BRVM multi-sources ===');
  const byTicker = loadExisting();
  console.log(`[baseline] ${Object.keys(byTicker).length} titres en cache`);

  let stocks = null;
  let source = 'cache';

  // 1. API brvm.org mise en cache
  if (!stocks) { stocks = await tryCachedApi(); if (stocks) source = 'brvm-api-cached'; }

  // 2. africainvestment.net
  if (!stocks) { stocks = await tryAfricaInvestment(); if (stocks) source = 'africainvestment.net'; }

  // 3. abidjan.net
  if (!stocks) { stocks = await tryAbidjanNet(); if (stocks) source = 'abidjan.net'; }

  // 4. Playwright brvm.org + interception XHR
  if (!stocks) { stocks = await tryPlaywrightWithInterception(); if (stocks) source = 'playwright-brvm.org'; }

  if (stocks && stocks.length >= 5) {
    for (const s of stocks) byTicker[s.ticker] = s;
    console.log(`[OK] ${stocks.length} cours mis à jour (source: ${source})`);
  } else {
    console.error('[WARN] Aucune source n\'a retourné de cours, conservation du cache');
  }

  const all = Object.values(byTicker).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const output = {
    last_updated: new Date().toISOString(),
    source: stocks && stocks.length >= 5 ? source : 'cache',
    count: all.length,
    stocks: all,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Sauvegardé → ${OUTPUT_FILE} (${all.length} titres, source: ${output.source})`);

  if (all.length < 10) { console.error('ERREUR: moins de 10 titres'); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
