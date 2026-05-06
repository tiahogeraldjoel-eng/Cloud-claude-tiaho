/**
 * Cloudflare Worker — BRVM Prices API
 *
 * Sert les cours des actions BRVM depuis data/brvm_stocks.json,
 * mis à jour automatiquement par GitHub Actions (fetch-brvm-data.yml).
 *
 * Routes :
 *   GET /             → { meta, stocks[] }  (tous les titres)
 *   GET /stocks       → idem
 *   GET /stocks/:sym  → cours d'un titre (ex: /stocks/SGBC)
 *   GET /health       → { status, last_updated, count }
 */

import stockData from '../data/brvm_stocks.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const JSON_HEADERS = {
  ...CORS,
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

export default {
  async fetch(request) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    // GET /health
    if (path === '/health') {
      return jsonResponse({
        status: 'ok',
        last_updated: stockData.last_updated ?? null,
        count: stockData.stocks?.length ?? 0,
        source: stockData.source ?? 'github-actions',
      });
    }

    // GET / ou /stocks  → liste complète
    if (path === '/' || path === '/stocks') {
      return jsonResponse(stockData);
    }

    // GET /stocks/:ticker
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
