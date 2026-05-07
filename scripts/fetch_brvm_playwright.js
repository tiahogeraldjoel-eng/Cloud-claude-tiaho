#!/usr/bin/env node
/**
 * Fetch BRVM stock prices using Playwright (headless Chrome).
 * Playwright executes JavaScript so it gets dynamically-loaded prices.
 * Runs on GitHub Actions (ubuntu-latest with Chromium).
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'brvm_stocks.json');

const KNOWN_TICKERS = new Set([
  'ABJC','BICB','BICC','BNBC','BOAB','BOABF','BOAC','BOAM','BOAN','BOAS',
  'CABC','CBIBF','CFAC','CIEC','ECOC','ETIT','FTSC','LNBB','NEIC','NSBC',
  'NTLC','ONTBF','ORAC','ORGT','PALC','PRSC','SAFC','SCRC','SDCC','SDSC',
  'SEMC','SGBC','SHEC','SIBC','SICC','SIVC','SLBC','SMBC','SNTS','SOGC',
  'SPHC','STAC','STBC','TTLC','TTLS','UNLC','UNXC',
]);

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

async function fetchWithPlaywright() {
  console.log('[Playwright] Lancement de Chromium...');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    extraHTTPHeaders: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
  });
  const page = await context.newPage();

  const urls = [
    'https://www.brvm.org/fr/cours-des-actions/0/all',
    'https://www.brvm.org/fr/cours-des-actions/0',
  ];

  let stocks = [];

  for (const url of urls) {
    try {
      console.log(`[Playwright] Chargement: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      // Attendre que la table charge (JS dynamique)
      await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(() => {});

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
            if (v !== null && v > 1 && v < 10000000) { price = v; priceIdx = i; break; }
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

          const prev = changePct !== 0
            ? Math.round(price / (1 + changePct / 100) * 100) / 100
            : price;

          result.push({ ticker: raw, closing_price: price, previous_closing_price: prev,
                        volume, change_pct: Math.round(changePct * 10000) / 10000 });
        });
        return result;
      }, Array.from(KNOWN_TICKERS));

      if (stocks.length >= 5) {
        console.log(`[Playwright] ${stocks.length} titres depuis ${url}`);
        break;
      }
    } catch (e) {
      console.error(`[Playwright] Erreur ${url}:`, e.message);
    }
  }

  await browser.close();
  return stocks;
}

async function main() {
  console.log('=== Fetch BRVM via Playwright ===');
  const byTicker = loadExisting();
  console.log(`[baseline] ${Object.keys(byTicker).length} titres en cache`);

  const stocks = await fetchWithPlaywright();

  if (stocks.length >= 5) {
    for (const s of stocks) byTicker[s.ticker] = s;
    console.log(`[OK] ${stocks.length} cours mis à jour`);
  } else {
    console.error('[WARN] Playwright n\'a récupéré aucun cours, conservation du cache');
  }

  const all = Object.values(byTicker).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const output = {
    last_updated: new Date().toISOString(),
    source: stocks.length >= 5 ? 'playwright-brvm.org' : 'cache',
    count: all.length,
    stocks: all,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Sauvegardé → ${OUTPUT_FILE} (${all.length} titres)`);

  if (all.length < 10) { console.error('ERREUR: moins de 10 titres'); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
