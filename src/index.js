/**
 * Cloudflare Worker — BRVM Prices API
 *
 * Fetches stock data dynamically from GitHub raw content (updated by GitHub
 * Actions every 30 min during BRVM trading hours). Edge-cached for 25 min so
 * the Worker always serves fresh prices without needing redeployment.
 *
 * Routes :
 *   GET /             → { meta, stocks[] }
 *   GET /stocks       → idem
 *   GET /stocks/:sym  → cours d'un titre (ex: /stocks/SGBC)
 *   GET /health       → { status, last_updated, count }
 */

const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/tiahogeraldjoel-eng/Cloud-claude-tiaho/main/data/brvm_stocks.json';

const CACHE_TTL_SECONDS = 1500; // 25 min

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
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

async function getStockData(ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://brvm-edge-cache/stocks-v1');

  const cached = await cache.match(cacheKey);
  if (cached) {
    return await cached.json();
  }

  let data;
  try {
    const resp = await fetch(GITHUB_RAW_URL, {
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) throw new Error(`GitHub raw: HTTP ${resp.status}`);
    data = await resp.json();
  } catch (err) {
    console.error('Failed to fetch from GitHub:', err.message);
    return { last_updated: null, source: 'error', count: 0, stocks: [] };
  }

  ctx.waitUntil(
    cache.put(
      cacheKey,
      new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${CACHE_TTL_SECONDS}`,
        },
      })
    )
  );

  return data;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

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

    if (path === '/' || path === '/stocks') {
      return jsonResponse(stockData);
    }

    const tickerMatch = path.match(/^\/stocks\/([A-Za-z0-9]+)$/);
    if (tickerMatch) {
      const sym = tickerMatch[1].toUpperCase();
      const stock = (stockData.stocks ?? []).find(
        (s) => s.ticker?.toUpperCase() === sym
      );
      if (!stock) {
        return jsonResponse({ error: `Ticker "${sym}" introuvable` }, 404);
      }
      return jsonResponse(stock);
    }

    return jsonResponse({ error: 'Route inconnue', path }, 404);
  },
};
