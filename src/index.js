/**
 * Cloudflare Worker — BRVM Prices API
 *
 * Priority chain:
 *   1. brvm.org direct scrape (Cloudflare IPs bypass WAF of CF-protected sites)
 *   2. SikaFinance direct scrape (same reason)
 *   3. GitHub raw JSON (updated by GitHub Actions every 30 min)
 *
 * Routes:
 *   GET /          → { meta, stocks[] }
 *   GET /stocks    → idem
 *   GET /stocks/:sym → single ticker
 *   GET /health    → { status, last_updated, count, source }
 */

const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/tiahogeraldjoel-eng/Cloud-claude-tiaho/main/data/brvm_stocks.json';

const CACHE_TTL_SECONDS = 1500; // 25 min

const KNOWN_TICKERS = new Set([
  'ABJC','BICB','BICC','BNBC','BOAB','BOABF','BOAC','BOAM','BOAN','BOAS',
  'CABC','CBIBF','CFAC','CIEC','ECOC','ETIT','FTSC','LNBB','NEIC','NSBC',
  'NTLC','ONTBF','ORAC','ORGT','PALC','PRSC','SAFC','SCRC','SDCC','SDSC',
  'SEMC','SGBC','SHEC','SIBC','SICC','SIVC','SLBC','SMBC','SNTS','SOGC',
  'SPHC','STAC','STBC','TTLC','TTLS','UNLC','UNXC',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const JSON_HEADERS = {
  ...CORS,
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`,
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

// ── HTML parsing helpers ──────────────────────────────────────────────────────

function parseNum(s) {
  s = s.replace(/\s+/g, '').replace('%', '').replace(',', '.');
  s = s.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

function parseBRVMTable(html) {
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

    // brvm.org: col 0=ticker, 1=company, 2+=price
    let price = null, priceIdx = -1;
    for (let i = 2; i < Math.min(cells.length, 8); i++) {
      const v = parseNum(cells[i]);
      if (v !== null && v > 1 && v < 10_000_000) { price = v; priceIdx = i; break; }
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
    stocks.push({ ticker, closing_price: price, previous_closing_price: prev, volume, change_pct: Math.round(changePct * 10000) / 10000 });
  }
  return stocks;
}

function parseSikaTable(html) {
  const stocks = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let rowM;
  while ((rowM = rowRe.exec(html)) !== null) {
    const cells = [];
    const cRe = new RegExp(cellRe.source, 'gi');
    let cM;
    while ((cM = cRe.exec(rowM[1])) !== null) cells.push(stripTags(cM[1]));
    if (cells.length < 3) continue;

    const ticker = cells[0].toUpperCase().replace(/[^A-Z]/g, '');
    if (!KNOWN_TICKERS.has(ticker)) continue;

    let price = null, priceIdx = -1;
    for (let i = 1; i < Math.min(cells.length, 7); i++) {
      const v = parseNum(cells[i]);
      if (v !== null && v > 1 && v < 10_000_000) { price = v; priceIdx = i; break; }
    }
    if (price === null) continue;

    let changePct = 0;
    for (let i = priceIdx + 1; i < Math.min(cells.length, priceIdx + 5); i++) {
      const v = parseNum(cells[i]);
      if (v !== null && v >= -99 && v <= 99) { changePct = v; break; }
    }

    const prev = changePct !== 0 ? Math.round(price / (1 + changePct / 100) * 100) / 100 : price;
    stocks.push({ ticker, closing_price: price, previous_closing_price: prev, volume: 0, change_pct: Math.round(changePct * 10000) / 10000 });
  }
  return stocks;
}

// ── Data sources ──────────────────────────────────────────────────────────────

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

async function fetchBRVMorg() {
  const urls = [
    'https://www.brvm.org/fr/cours-des-actions/0/all',
    'https://www.brvm.org/fr/cours-des-actions/0',
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers: SCRAPE_HEADERS, cf: { cacheTtl: 0 } });
      if (!resp.ok) continue;
      const html = await resp.text();
      if (html.length < 1000) continue;
      const stocks = parseBRVMTable(html);
      if (stocks.length >= 5) {
        console.log(`[brvm.org] ${stocks.length} titres`);
        return { stocks, last_updated: new Date().toISOString(), source: 'brvm.org-live', count: stocks.length };
      }
    } catch (e) {
      console.error('[brvm.org] Erreur:', e.message);
    }
  }
  return null;
}

async function fetchSikaFinance() {
  try {
    const resp = await fetch('https://www.sikafinance.com/marches/aaz', {
      headers: SCRAPE_HEADERS,
      cf: { cacheTtl: 0 },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    if (html.length < 1000) return null;
    const stocks = parseSikaTable(html);
    if (stocks.length >= 5) {
      console.log(`[sikafinance] ${stocks.length} titres`);
      return { stocks, last_updated: new Date().toISOString(), source: 'sikafinance-live', count: stocks.length };
    }
  } catch (e) {
    console.error('[sikafinance] Erreur:', e.message);
  }
  return null;
}

async function fetchGithubRaw() {
  try {
    const resp = await fetch(GITHUB_RAW_URL, {
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.error('[github] Erreur:', e.message);
    return null;
  }
}

// ── Main cache logic ──────────────────────────────────────────────────────────

async function getStockData(ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://brvm-edge-cache/stocks-v2');

  const cached = await cache.match(cacheKey);
  if (cached) return await cached.json();

  // Priority 1: live scrape brvm.org
  let data = await fetchBRVMorg();

  // Priority 2: live scrape sikafinance
  if (!data) data = await fetchSikaFinance();

  // Priority 3: GitHub raw (updated by GitHub Actions)
  if (!data) data = await fetchGithubRaw();

  if (!data) return { last_updated: null, source: 'error', count: 0, stocks: [] };

  ctx.waitUntil(
    cache.put(cacheKey, new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_TTL_SECONDS}` },
    }))
  );

  return data;
}

// ── Request handler ───────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD') return jsonResponse({ error: 'Method not allowed' }, 405);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    const stockData = await getStockData(ctx);

    if (path === '/health') {
      return jsonResponse({
        status: 'ok',
        last_updated: stockData.last_updated ?? null,
        count: stockData.stocks?.length ?? 0,
        source: stockData.source ?? 'unknown',
        cache_ttl: CACHE_TTL_SECONDS,
      });
    }

    if (path === '/' || path === '/stocks') return jsonResponse(stockData);

    const tickerMatch = path.match(/^\/stocks\/([A-Za-z0-9]+)$/);
    if (tickerMatch) {
      const sym = tickerMatch[1].toUpperCase();
      const stock = (stockData.stocks ?? []).find(s => s.ticker?.toUpperCase() === sym);
      if (!stock) return jsonResponse({ error: `Ticker "${sym}" introuvable` }, 404);
      return jsonResponse(stock);
    }

    return jsonResponse({ error: 'Route inconnue', path }, 404);
  },
};
