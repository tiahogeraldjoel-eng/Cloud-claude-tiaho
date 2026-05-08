#!/usr/bin/env node
/**
 * Fetch BRVM stock prices — stratégie multi-sources :
 *  1. Twelve Data API (si clé configurée et BRVM couverte)
 *  2. fluxbourse.com via Playwright (contournement anti-bot par navigateur réel)
 *  3. zonebourse.com via Playwright
 *  4. brvm.org via Playwright + interception XHR
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

const TWELVE_DATA_SYMBOLS = [...KNOWN_TICKERS];

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

function parseHtmlTable(html) {
  const stocks = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let rowM;
  while ((rowM = rowRe.exec(html)) !== null) {
    const cells = [];
    const cRe = new RegExp(cellRe.source, 'gi');
    let cM;
    while ((cM = cRe.exec(rowM[1])) !== null) {
      cells.push(cM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
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
      const v = parseInt(cells[i].replace(/\D/g, ''), 10);
      if (!isNaN(v) && v > 0 && v < 100_000_000) { volume = v; break; }
    }
    const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
    stocks.push({ ticker, closing_price: price, previous_closing_price: prev,
                  volume, change_pct: Math.round(changePct * 10000) / 10000 });
  }
  return stocks;
}

// Helpers Playwright partagés
async function launchBrowser() {
  return chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    headless: true,
  });
}

async function newStealthContext(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  // Masquer les indicateurs d'automatisation
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return context;
}

// Extraction depuis DOM Playwright
async function extractTableFromPage(page) {
  return page.evaluate((knownTickers) => {
    const result = [];
    const rows = document.querySelectorAll('table tbody tr, table tr');
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
        const v = parseInt(cells[i].replace(/\D/g, ''), 10);
        if (!isNaN(v) && v > 0 && v < 100000000) { volume = v; break; }
      }
      const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
      result.push({ ticker: raw, closing_price: price, previous_closing_price: prev,
                    volume, change_pct: Math.round(changePct * 10000) / 10000 });
    });
    return result;
  }, Array.from(knownTickers));
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
  if (!apiKey) { console.log('[TwelveData] Clé non configurée'); return null; }
  try {
    console.log('[TwelveData] Test couverture BRVM (SNTS)...');
    const testResp = await fetch(
      `https://api.twelvedata.com/quote?symbol=SNTS&exchange=BRVM&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!testResp.ok) { console.log(`[TwelveData] HTTP ${testResp.status}`); return null; }
    const testData = await testResp.json();
    if (testData.status === 'error') {
      console.log(`[TwelveData] Non couverte: ${testData.message}`);
      return null;
    }
    const testPrice = parseFloat(testData.close || testData.previous_close || 0);
    if (testPrice <= 1) { console.log('[TwelveData] Prix SNTS invalide'); return null; }
    console.log(`[TwelveData] BRVM couverte! SNTS=${testPrice}. Fetch complet...`);

    const stocks = [];
    const sntsStock = buildStockFromTD('SNTS', testData);
    if (sntsStock) stocks.push(sntsStock);
    const remaining = TWELVE_DATA_SYMBOLS.filter(s => s !== 'SNTS');
    for (let i = 0; i < remaining.length; i += 8) {
      const batch = remaining.slice(i, i + 8);
      const resp = await fetch(
        `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(batch.join(','))}&exchange=BRVM&apikey=${apiKey}`,
        { signal: AbortSignal.timeout(15000) }
      );
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
    if (stocks.length >= 5) { console.log(`[TwelveData] ${stocks.length} titres`); return stocks; }
  } catch (e) { console.error('[TwelveData] Erreur:', e.message); }
  return null;
}

// ── Source 2 : fluxbourse.com via Playwright ─────────────────────────────────

async function tryFluxBourse() {
  console.log('[fluxbourse] Lancement Playwright + interception API...');
  const browser = await launchBrowser();
  try {
    const context = await newStealthContext(browser);
    const page = await context.newPage();

    // Intercepter TOUTES les réponses pour trouver l'API de données
    const apiHits = [];
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const ct = response.headers()['content-type'] || '';
        // Filtrer les ressources statiques sans intérêt
        if (/\.(css|js|png|jpg|svg|ico|woff|woff2|ttf)(\?|$)/i.test(url)) return;
        const body = await response.text();
        if (body.length < 30) return;
        // Chercher du JSON avec des données financières
        if (ct.includes('json') || url.includes('api') || url.includes('cours') || url.includes('quote') || url.includes('stock')) {
          try {
            const data = JSON.parse(body);
            const flat = Array.isArray(data) ? data : Object.values(data).find(v => Array.isArray(v)) || [];
            const hits = flat.filter(row => {
              const t = String(row.symbol || row.ticker || row.code || row.valeur || row.libelle || '').toUpperCase().replace(/[^A-Z]/g, '');
              return KNOWN_TICKERS.has(t);
            });
            if (hits.length >= 3) {
              console.log(`[fluxbourse XHR] API trouvée: ${url} → ${hits.length} tickers BRVM`);
              apiHits.push({ url, data });
            }
          } catch {}
        }
        // Chercher du HTML avec des tickers BRVM
        if (ct.includes('html') && ['SNTS','SGBC','ETIT','ECOC'].some(t => body.includes(t))) {
          const stocks = parseHtmlTable(body);
          if (stocks.length >= 5) {
            console.log(`[fluxbourse HTML fragment] ${stocks.length} titres depuis ${url}`);
            apiHits.push({ url, htmlStocks: stocks });
          }
        }
      } catch {}
    });

    // Charger la page d'accueil et naviguer vers BRVM
    const entryUrls = [
      'https://fluxbourse.com/',
      'https://fluxbourse.com/brvm/',
      'https://fluxbourse.com/cotations/',
      'https://fluxbourse.com/marche/brvm/',
    ];

    for (const url of entryUrls) {
      try {
        console.log(`[fluxbourse] Navigation: ${url}`);
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
        const status = resp ? resp.status() : 0;
        console.log(`[fluxbourse] Status: ${status}`);
        if (status >= 400) continue;

        // Attendre du contenu dynamique
        await page.waitForTimeout(3000);

        // Vérifier si des données BRVM sont apparues via XHR
        if (apiHits.length > 0) {
          const hit = apiHits[0];
          if (hit.htmlStocks) {
            await browser.close();
            return hit.htmlStocks;
          }
          // Extraire depuis JSON capturé
          const flat = Array.isArray(hit.data) ? hit.data :
            Object.values(hit.data).find(v => Array.isArray(v)) || [];
          const stocks = [];
          for (const row of flat) {
            const ticker = String(row.symbol || row.ticker || row.code || row.valeur || row.libelle || '').toUpperCase().replace(/[^A-Z]/g, '');
            if (!KNOWN_TICKERS.has(ticker)) continue;
            const price = parseNum(String(row.last || row.cours || row.close || row.prix || row.dernier || 0));
            if (!price || price <= 1) continue;
            const changePct = parseNum(String(row.var || row.variation || row.change || row.pct || 0)) || 0;
            const volume = parseInt(String(row.volume || row.vol || 0).replace(/\D/g, ''), 10) || 0;
            const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
            stocks.push({ ticker, closing_price: price, previous_closing_price: prev,
                          volume, change_pct: Math.round(changePct * 10000) / 10000 });
          }
          if (stocks.length >= 5) {
            console.log(`[fluxbourse] ${stocks.length} titres via API interceptée`);
            await browser.close();
            return stocks;
          }
        }

        // Chercher des tickers BRVM dans le DOM rendu
        const pageText = await page.evaluate(() => document.body.innerText || '');
        const hasData = ['SNTS','SGBC','ETIT','ECOC','BOAB'].some(t => pageText.includes(t));
        console.log(`[fluxbourse] Tickers BRVM dans DOM: ${hasData}`);

        if (hasData) {
          // Essayer d'extraire du tableau DOM
          const stocks = await extractTableFromPage(page);
          if (stocks.length >= 5) {
            console.log(`[fluxbourse] ${stocks.length} titres depuis DOM`);
            await browser.close();
            return stocks;
          }

          // Afficher un extrait du contenu pour debug
          const snippet = pageText.substring(0, 500).replace(/\n+/g, ' ');
          console.log(`[fluxbourse] Extrait page: ${snippet}`);
        }

        // Chercher des liens vers BRVM et cliquer dessus
        const brvmLink = await page.$('a[href*="brvm"], a[href*="BRVM"], a:text-matches("BRVM", "i")').catch(() => null);
        if (brvmLink) {
          console.log('[fluxbourse] Lien BRVM trouvé, navigation...');
          await brvmLink.click();
          await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(2000);
          const stocks = await extractTableFromPage(page);
          if (stocks.length >= 5) {
            console.log(`[fluxbourse] ${stocks.length} titres après navigation`);
            await browser.close();
            return stocks;
          }
        }
      } catch (e) {
        console.log(`[fluxbourse] Erreur ${url}: ${e.message}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return null;
}

// ── Source 3 : API brvm.org mise en cache ────────────────────────────────────

async function tryCachedApi() {
  try {
    const apiUrl = fs.readFileSync(API_CACHE_FILE, 'utf8').trim();
    if (!apiUrl) return null;
    console.log(`[API cache] Tentative: ${apiUrl}`);
    const resp = await fetch(apiUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const rows = Array.isArray(data) ? data : (data.data || data.stocks || data.cours || []);
    const stocks = [];
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const ticker = String(row.symbol || row.ticker || row.code || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (!KNOWN_TICKERS.has(ticker)) continue;
      const price = parseNum(String(row.last || row.cours || row.closing_price || row.close || 0));
      if (!price || price <= 1) continue;
      const changePct = parseNum(String(row.var || row.variation || row.change_pct || 0)) || 0;
      const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
      stocks.push({ ticker, closing_price: price, previous_closing_price: prev,
                    volume: parseInt(String(row.volume || 0).replace(/\D/g, ''), 10) || 0,
                    change_pct: Math.round(changePct * 10000) / 10000 });
    }
    if (stocks.length >= 5) { console.log(`[API cache] ${stocks.length} titres`); return stocks; }
  } catch {}
  return null;
}

// ── Source 4 : zonebourse.com via Playwright ─────────────────────────────────

async function tryZoneBourse() {
  console.log('[zonebourse] Lancement Playwright...');
  const browser = await launchBrowser();
  try {
    const context = await newStealthContext(browser);
    const page = await context.newPage();
    const urls = [
      'https://www.zonebourse.com/cours/actions/?place=XBRV',
      'https://www.zonebourse.com/bourse/actions/BRVM/',
    ];
    for (const url of urls) {
      try {
        console.log(`[zonebourse] Chargement: ${url}`);
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        if (!resp || resp.status() >= 400) continue;
        await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});
        const stocks = await extractTableFromPage(page);
        if (stocks.length >= 5) {
          console.log(`[zonebourse] ${stocks.length} titres`);
          await browser.close();
          return stocks;
        }
      } catch (e) { console.log(`[zonebourse] Erreur: ${e.message}`); }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return null;
}

// ── Source 5 : brvm.org via Playwright + interception XHR ───────────────────

async function tryBRVMOrg() {
  console.log('[brvm.org] Lancement Playwright + interception XHR...');
  const browser = await launchBrowser();
  try {
    const context = await newStealthContext(browser);
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
        const rows = Array.isArray(data) ? data : (data.data || data.stocks || data.cours || []);
        if (!Array.isArray(rows) || rows.length < 3) return;
        const tickers = rows.filter(r => KNOWN_TICKERS.has(String(r.symbol || r.ticker || r.code || '').toUpperCase())).length;
        if (tickers >= 3) {
          console.log(`[XHR intercept] API: ${url} → ${tickers} tickers`);
          capturedApiData.push({ url, data });
          fs.mkdirSync(path.dirname(API_CACHE_FILE), { recursive: true });
          fs.writeFileSync(API_CACHE_FILE, url);
        }
      } catch {}
    });

    for (const url of ['https://www.brvm.org/fr/cours-des-actions/0/all', 'https://www.brvm.org/fr/cours-des-actions/0']) {
      try {
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        if (!resp || resp.status() >= 400) { console.log(`[brvm.org] HTTP ${resp ? resp.status() : 'null'}`); continue; }
        if (capturedApiData.length > 0) break;
        await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});
        const stocks = await extractTableFromPage(page);
        if (stocks.length >= 5) {
          console.log(`[brvm.org] ${stocks.length} titres`);
          await browser.close();
          return stocks;
        }
      } catch (e) { console.log(`[brvm.org] Erreur: ${e.message}`); }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Fetch BRVM multi-sources ===');
  const byTicker = loadExisting();
  console.log(`[baseline] ${Object.keys(byTicker).length} titres en cache`);

  let stocks = null;
  let source = 'cache';

  if (!stocks) { stocks = await tryTwelveData();  if (stocks) source = 'twelvedata-api'; }
  if (!stocks) { stocks = await tryFluxBourse();  if (stocks) source = 'fluxbourse.com'; }
  if (!stocks) { stocks = await tryCachedApi();   if (stocks) source = 'brvm-api-cached'; }
  if (!stocks) { stocks = await tryZoneBourse();  if (stocks) source = 'zonebourse.com'; }
  if (!stocks) { stocks = await tryBRVMOrg();     if (stocks) source = 'brvm.org'; }

  if (stocks && stocks.length >= 5) {
    for (const s of stocks) byTicker[s.ticker] = s;
    console.log(`[OK] ${stocks.length} cours mis à jour (source: ${source})`);
  } else {
    console.warn('[WARN] Aucune source n\'a retourné de cours, conservation du cache');
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

process.on('unhandledRejection', (reason) => {
  console.error('[WARN] Unhandled rejection (non-fatal):', reason);
});

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
