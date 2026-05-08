#!/usr/bin/env node
/**
 * Fetch BRVM stock prices — stratégie multi-sources :
 *  1. Twelve Data API (couvre la BRVM officiellement, gratuit 800 req/jour)
 *  2. zonebourse.com (site financier français, couvre BRVM, serveur-rendu)
 *  3. boursorama.com (portail financier majeur, cotations BRVM)
 *  4. Playwright brvm.org + interception XHR (découverte API interne)
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

// Twelve Data utilise le préfixe d'exchange BRVM
const TWELVE_DATA_SYMBOLS = [
  'ABJC','BICB','BICC','BNBC','BOAB','BOABF','BOAC','BOAM','BOAN','BOAS',
  'CABC','CBIBF','CFAC','CIEC','ECOC','ETIT','FTSC','LNBB','NEIC','NSBC',
  'NTLC','ONTBF','ORAC','ORGT','PALC','PRSC','SAFC','SCRC','SDCC','SDSC',
  'SEMC','SGBC','SHEC','SIBC','SICC','SIVC','SLBC','SMBC','SNTS','SOGC',
  'SPHC','STAC','STBC','TTLC','TTLS','UNLC','UNXC',
];

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

// ── Source 1 : Twelve Data API ───────────────────────────────────────────────

function buildStockFromTD(ticker, item) {
  const price = parseFloat(item.close || item.previous_close || 0);
  if (price <= 1) return null;
  const changePct = parseFloat(item.percent_change || 0);
  const volume = parseInt(item.volume || 0, 10);
  const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
  return { ticker, closing_price: price, previous_closing_price: prev,
           volume, change_pct: Math.round(changePct * 10000) / 10000 };
}

async function tryTwelveData() {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.log('[TwelveData] Clé API non configurée');
    return null;
  }

  try {
    // Test rapide sur 1 symbole pour vérifier la couverture BRVM avant de tout fetch
    console.log('[TwelveData] Test couverture BRVM avec SNTS...');
    const testUrl = `https://api.twelvedata.com/quote?symbol=SNTS&exchange=BRVM&apikey=${apiKey}`;
    const testResp = await fetch(testUrl, { signal: AbortSignal.timeout(10000) });
    if (!testResp.ok) { console.log(`[TwelveData] HTTP ${testResp.status}`); return null; }
    const testData = await testResp.json();
    if (testData.status === 'error') {
      console.log(`[TwelveData] BRVM non couverte ou clé invalide: ${testData.message}`);
      return null;
    }
    const testPrice = parseFloat(testData.close || testData.previous_close || 0);
    if (testPrice <= 1) { console.log('[TwelveData] Prix SNTS invalide'); return null; }
    console.log(`[TwelveData] BRVM couverte ✓ SNTS=${testPrice}. Récupération complète...`);

    // BRVM couverte — fetch de tous les symboles par batch de 8
    // Plan gratuit: 55 req/min → 2s entre batches suffit
    const stocks = [];
    const sntsStock = buildStockFromTD('SNTS', testData);
    if (sntsStock) stocks.push(sntsStock);

    const remaining = TWELVE_DATA_SYMBOLS.filter(s => s !== 'SNTS');
    for (let i = 0; i < remaining.length; i += 8) {
      const batch = remaining.slice(i, i + 8);
      const symbols = batch.join(',');
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&exchange=BRVM&apikey=${apiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const items = batch.length === 1 ? { [batch[0]]: data } : data;
      for (const [key, item] of Object.entries(items)) {
        if (!item || item.status === 'error') continue;
        const ticker = key.toUpperCase().replace(/[^A-Z]/g, '');
        if (!KNOWN_TICKERS.has(ticker)) continue;
        const stock = buildStockFromTD(ticker, item);
        if (stock) stocks.push(stock);
      }
      if (i + 8 < remaining.length) await new Promise(r => setTimeout(r, 2000));
    }

    if (stocks.length >= 5) {
      console.log(`[TwelveData] ${stocks.length} titres récupérés`);
      return stocks;
    }
    console.log(`[TwelveData] Seulement ${stocks.length} titres valides`);
  } catch (e) {
    console.error('[TwelveData] Erreur:', e.message);
  }
  return null;
}

// ── Source 2 : API brvm.org mise en cache ────────────────────────────────────

async function tryCachedApi() {
  try {
    const apiUrl = fs.readFileSync(API_CACHE_FILE, 'utf8').trim();
    if (!apiUrl) return null;
    console.log(`[API cache] Tentative: ${apiUrl}`);
    const resp = await fetch(apiUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const stocks = extractFromBRVMJson(data);
    if (stocks.length >= 5) {
      console.log(`[API cache] ${stocks.length} titres`);
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

// ── Source 3 : zonebourse.com ────────────────────────────────────────────────

async function tryZoneBourse() {
  // zonebourse.com couvre la BRVM (exchange code XBRV)
  const urls = [
    'https://www.zonebourse.com/cours/actions/?place=XBRV',
    'https://www.zonebourse.com/bourse/actions/BRVM/',
    'https://www.zonebourse.com/bourse/actions/cotations/BRVM-XBRV/',
  ];
  for (const url of urls) {
    try {
      console.log(`[zonebourse] Tentative: ${url}`);
      const resp = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) });
      if (!resp.ok) { console.log(`[zonebourse] HTTP ${resp.status}`); continue; }
      const html = await resp.text();
      if (html.length < 500) continue;
      const stocks = parseHtmlTable(html);
      if (stocks.length >= 5) {
        console.log(`[zonebourse] ${stocks.length} titres`);
        return stocks;
      }
      console.log(`[zonebourse] ${stocks.length} titres extraits (trop peu)`);
    } catch (e) {
      console.log(`[zonebourse] Erreur: ${e.message}`);
    }
  }
  return null;
}

// ── Source 4 : boursorama.com ────────────────────────────────────────────────

async function tryBoursorama() {
  const urls = [
    'https://www.boursorama.com/bourse/actions/cotations/BRVM/',
    'https://www.boursorama.com/bourse/actions/cotations/?market=2cBRVM',
  ];
  for (const url of urls) {
    try {
      console.log(`[boursorama] Tentative: ${url}`);
      const resp = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20000) });
      if (!resp.ok) { console.log(`[boursorama] HTTP ${resp.status}`); continue; }
      const html = await resp.text();
      if (html.length < 500) continue;
      const stocks = parseHtmlTable(html);
      if (stocks.length >= 5) {
        console.log(`[boursorama] ${stocks.length} titres`);
        return stocks;
      }
    } catch (e) {
      console.log(`[boursorama] Erreur: ${e.message}`);
    }
  }
  return null;
}

// ── Source 5 : Playwright brvm.org + interception XHR ───────────────────────

async function tryPlaywrightWithInterception() {
  console.log('[Playwright] Lancement Chromium + interception XHR...');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    userAgent: FETCH_HEADERS['User-Agent'],
    locale: 'fr-FR',
    extraHTTPHeaders: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
  });
  const page = await context.newPage();

  const capturedApiData = [];
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json') && !url.includes('json') && !url.includes('api') && !url.includes('cours')) return;
      const body = await response.text();
      if (body.length < 50 || !body.includes('[')) return;
      const data = JSON.parse(body);
      const stocks = extractFromBRVMJson(data);
      if (stocks.length >= 3) {
        console.log(`[XHR intercept] API trouvée: ${url} → ${stocks.length} titres`);
        capturedApiData.push({ url, stocks });
        fs.mkdirSync(path.dirname(API_CACHE_FILE), { recursive: true });
        fs.writeFileSync(API_CACHE_FILE, url);
      }
    } catch {} // évite les unhandled rejections qui crashent Node.js
  });

  let stocks = [];
  for (const url of ['https://www.brvm.org/fr/cours-des-actions/0/all', 'https://www.brvm.org/fr/cours-des-actions/0']) {
    try {
      console.log(`[Playwright] Chargement: ${url}`);
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      if (response && response.status() >= 400) {
        console.log(`[Playwright] HTTP ${response.status()} — brvm.org bloque cette IP`);
        continue;
      }

      if (capturedApiData.length > 0) {
        stocks = capturedApiData[0].stocks;
        break;
      }

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

  // 1. Twelve Data API (si clé dispo)
  if (!stocks) { stocks = await tryTwelveData(); if (stocks) source = 'twelvedata-api'; }

  // 2. API brvm.org mise en cache
  if (!stocks) { stocks = await tryCachedApi(); if (stocks) source = 'brvm-api-cached'; }

  // 3. zonebourse.com
  if (!stocks) { stocks = await tryZoneBourse(); if (stocks) source = 'zonebourse.com'; }

  // 4. boursorama.com
  if (!stocks) { stocks = await tryBoursorama(); if (stocks) source = 'boursorama.com'; }

  // 5. Playwright brvm.org + interception XHR
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

// Filet de sécurité : ne pas crasher sur des promesses non gérées
process.on('unhandledRejection', (reason) => {
  console.error('[WARN] Unhandled rejection (non-fatal):', reason);
});

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
# Twelve Data API — clé configurée via secret TWELVE_DATA_API_KEY
