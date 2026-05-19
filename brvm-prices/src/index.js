/**
 * BRVM Prices — Cloudflare Worker
 *
 * CORS proxy + JSON API pour les cours de la Bourse Régionale des Valeurs
 * Mobilières (BRVM) d'Afrique de l'Ouest.
 *
 * Endpoints:
 *   GET /          → JSON: toutes les actions BRVM
 *   GET /stock/:symbol → JSON: détail d'une action
 *   GET /health    → JSON: statut du worker
 */

const BRVM_URL = 'https://www.brvm.org/fr/cours-des-actions/0/all';
const CACHE_TTL = 3600; // 1 heure en secondes

// Données statiques de secours (27 actions BRVM)
const STATIC_STOCKS = [
  { symbol: 'BICC', name: 'Bourse Ivoire Caoutchouc', price: 1250, country: 'CI', sector: 'Agriculture' },
  { symbol: 'BNBC', name: 'Brasseries du Bénin', price: 4200, country: 'BJ', sector: 'Industrie' },
  { symbol: 'BOAB', name: 'Bank of Africa Bénin', price: 5500, country: 'BJ', sector: 'Finance' },
  { symbol: 'BOABF', name: 'Bank of Africa BF', price: 5200, country: 'BF', sector: 'Finance' },
  { symbol: 'BOACI', name: 'Bank of Africa CI', price: 5850, country: 'CI', sector: 'Finance' },
  { symbol: 'BOAM', name: 'Bank of Africa Mali', price: 4900, country: 'ML', sector: 'Finance' },
  { symbol: 'BOAN', name: 'Bank of Africa Niger', price: 4100, country: 'NE', sector: 'Finance' },
  { symbol: 'CABC', name: "Compagnie Agricole de Côte d'Ivoire", price: 950, country: 'CI', sector: 'Agriculture' },
  { symbol: 'CFAC', name: 'Coraf', price: 800, country: 'CI', sector: 'Énergie' },
  { symbol: 'ECOC', name: 'Ecobank CI', price: 10500, country: 'CI', sector: 'Finance' },
  { symbol: 'ETIT', name: 'Ecobank Transnational', price: 22, country: 'TG', sector: 'Finance' },
  { symbol: 'NEIC', name: 'NEI-CEDA', price: 620, country: 'CI', sector: 'Industrie' },
  { symbol: 'ORAC', name: 'Orange CI', price: 14500, country: 'CI', sector: 'Télécom' },
  { symbol: 'PALC', name: 'Palm CI', price: 7200, country: 'CI', sector: 'Agriculture' },
  { symbol: 'PRSC', name: 'Prestige CI', price: 3200, country: 'CI', sector: 'Assurance' },
  { symbol: 'SAFC', name: 'SAPH CI', price: 4500, country: 'CI', sector: 'Agriculture' },
  { symbol: 'SGBC', name: 'SGB CI', price: 18000, country: 'CI', sector: 'Finance' },
  { symbol: 'SIBC', name: 'SIB CI', price: 5600, country: 'CI', sector: 'Finance' },
  { symbol: 'SICC', name: 'SICOR CI', price: 3800, country: 'CI', sector: 'Agriculture' },
  { symbol: 'SLBC', name: 'Solibra', price: 122000, country: 'CI', sector: 'Industrie' },
  { symbol: 'SMBC', name: 'SMB CI', price: 15000, country: 'CI', sector: 'Industrie' },
  { symbol: 'SNTS', name: 'Sonatel', price: 15500, country: 'SN', sector: 'Télécom' },
  { symbol: 'STAC', name: 'STAB', price: 4500, country: 'TG', sector: 'Finance' },
  { symbol: 'SVOC', name: 'SVO CI', price: 2200, country: 'CI', sector: 'Industrie' },
  { symbol: 'TTLC', name: 'Total CI', price: 1850, country: 'CI', sector: 'Énergie' },
  { symbol: 'UNLC', name: 'Unilever CI', price: 6800, country: 'CI', sector: 'Consommation' },
  { symbol: 'UNXC', name: 'Unacoopec CI', price: 2800, country: 'CI', sector: 'Finance' },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return jsonResponse({ status: 'ok', worker: 'brvm-prices', timestamp: Date.now() });
    }

    // Single stock
    if (path.startsWith('/stock/')) {
      const symbol = path.replace('/stock/', '').toUpperCase();
      const stocks = await getStocks(env, ctx);
      const stock = stocks.find(s => s.symbol === symbol);
      if (!stock) {
        return jsonResponse({ error: 'Stock not found', symbol }, 404);
      }
      return jsonResponse(stock);
    }

    // All stocks (root)
    if (path === '/' || path === '/stocks') {
      const stocks = await getStocks(env, ctx);
      return jsonResponse({
        stocks,
        count: stocks.length,
        timestamp: Date.now(),
        market: getMarketStatus(),
      });
    }

    return jsonResponse({ error: 'Not found', path }, 404);
  },
};

/**
 * Récupère les cours BRVM avec cache KV optionnel.
 */
async function getStocks(env, ctx) {
  // Essayer le cache KV si disponible
  if (env.BRVM_CACHE) {
    try {
      const cached = await env.BRVM_CACHE.get('stocks', { type: 'json' });
      if (cached && cached.ts && (Date.now() - cached.ts) < CACHE_TTL * 1000) {
        return cached.data;
      }
    } catch {}
  }

  // Tenter le scraping live depuis brvm.org
  let stocks = null;
  try {
    stocks = await scrapeBRVM();
  } catch (e) {
    console.error('BRVM scrape failed:', e.message);
  }

  // Fallback sur données statiques avec variation simulée
  if (!stocks || stocks.length < 5) {
    stocks = generateSimulatedData();
  }

  // Sauvegarder en cache KV (en arrière-plan)
  if (env.BRVM_CACHE) {
    ctx.waitUntil(
      env.BRVM_CACHE.put('stocks', JSON.stringify({ data: stocks, ts: Date.now() }),
        { expirationTtl: CACHE_TTL })
    );
  }

  return stocks;
}

/**
 * Scrape les cours depuis brvm.org
 */
async function scrapeBRVM() {
  const resp = await fetch(BRVM_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BRVMPricesWorker/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    cf: { cacheTtl: 300 },
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const html = await resp.text();
  return parseBRVMHtml(html);
}

/**
 * Parser HTML basique pour les tableaux BRVM
 */
function parseBRVMHtml(html) {
  const stocks = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripRe = /<[^>]+>/g;

  let row;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = [];
    let cell;
    const cellMatcher = new RegExp(cellRe.source, 'gi');
    while ((cell = cellMatcher.exec(row[1])) !== null) {
      cells.push(cell[1].replace(stripRe, '').trim());
    }

    if (cells.length >= 5) {
      const symbol = cells[0].toUpperCase();
      const price = parseFloat(cells[2].replace(/\s/g, '').replace(',', '.'));
      const changePct = parseFloat(
        cells[4].replace('%', '').replace(/\s/g, '').replace(',', '.')
      );

      if (symbol.length >= 2 && symbol.length <= 6 && price > 0) {
        const previousPrice = price / (1 + changePct / 100);
        stocks.push({
          symbol,
          name: symbol,
          price: Math.round(price),
          previousPrice: Math.round(previousPrice),
          change: Math.round(price - previousPrice),
          changePercent: Math.round(changePct * 100) / 100,
          volume: parseInt(cells[5]?.replace(/\s/g, '') || '0') || 0,
          source: 'live',
          timestamp: Date.now(),
        });
      }
    }
  }

  return stocks.length > 5 ? stocks : null;
}

/**
 * Génère des données réalistes avec variation journalière (±7.5% max BRVM)
 */
function generateSimulatedData() {
  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24)); // 1 seed par jour

  return STATIC_STOCKS.map((s, i) => {
    const rng = mulberry32(seed + i);
    const drift = 0.08 / 252;
    const vol = 0.012;
    const raw = drift + (rng() - 0.48) * vol * 2;
    const change = Math.max(-0.075, Math.min(0.075, raw));

    const newPrice = Math.round(s.price * (1 + change));
    const changeFcfa = newPrice - s.price;
    const changePct = Math.round(change * 10000) / 100;

    return {
      symbol: s.symbol,
      name: s.name,
      price: newPrice,
      previousPrice: s.price,
      change: changeFcfa,
      changePercent: changePct,
      volume: Math.round(1000 * (0.5 + rng() * 1.5)),
      country: s.country,
      sector: s.sector,
      source: 'simulated',
      timestamp: Date.now(),
    };
  });
}

/** RNG déterministe (Mulberry32) pour variation reproductible par jour */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Statut du marché BRVM (heures UTC+0 → marché Abidjan UTC+0) */
function getMarketStatus() {
  const now = new Date();
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && mins >= 9 * 60 && mins <= 15 * 60 + 30;
  return {
    isOpen,
    isFixing: isWeekday && mins >= 12 * 60 && mins <= 12 * 60 + 30,
    label: isOpen ? 'Séance ouverte' : 'Marché fermé',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: CORS_HEADERS,
  });
}
