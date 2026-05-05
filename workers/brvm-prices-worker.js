/**
 * Cloudflare Worker — BRVM Stock Price API
 * Stratégie : 1 requête bulk SikaFinance → parse HTML → JSON
 * Temps de réponse : ~2-3s (vs 15s avec 47 appels individuels)
 */

const KNOWN_TICKERS = new Set([
  "ABJC","BICB","BICC","BNBC","BOAB","BOABF","BOAC","BOAM","BOAN","BOAS",
  "CABC","CBIBF","CFAC","CIEC","ECOC","ETIT","FTSC","LNBB","NEIC","NSBC",
  "NTLC","ONTBF","ORAC","ORGT","PALC","PRSC","SAFC","SCRC","SDCC","SDSC",
  "SEMC","SGBC","SHEC","SIBC","SICC","SIVC","SLBC","SMBC","SNTS","SOGC",
  "SPHC","STAC","STBC","TTLC","TTLS","UNLC","UNXC"
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

// ── Bulk page SikaFinance (1 requête = tous les titres BRVM) ────────────────

async function fetchBulkSika() {
  const res = await fetch("https://www.sikafinance.com/marches/aaz", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr,fr-FR;q=0.8",
      "Referer": "https://www.sikafinance.com/",
    },
  });
  if (!res.ok) throw new Error(`SikaFinance bulk HTTP ${res.status}`);
  return res.text();
}

// ── Parse HTML avec HTMLRewriter ────────────────────────────────────────────

function parseSikaHtml(html) {
  const stocks = [];
  // Extraire les lignes de tableau avec regex (plus léger que HTMLRewriter pour ce cas)
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripRe = /<[^>]+>/g;

  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    const cellRegex = new RegExp(cellRe.source, "gi");
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(stripRe, "").replace(/\s+/g, " ").trim());
    }
    if (cells.length < 3) continue;

    // Ticker : première cellule, lettres uniquement
    const ticker = cells[0].replace(/[^A-Za-z]/g, "").toUpperCase();
    if (!KNOWN_TICKERS.has(ticker)) continue;

    // Prix : première valeur numérique > 1
    let price = null, priceIdx = -1;
    for (let i = 1; i < cells.length; i++) {
      const v = parseFloat(cells[i].replace(/\s/g, "").replace(",", ".").replace(/%/g, ""));
      if (!isNaN(v) && v > 1 && v < 10_000_000) { price = v; priceIdx = i; break; }
    }
    if (price === null) continue;

    // Variation %
    let changePct = 0;
    for (let i = priceIdx + 1; i < Math.min(cells.length, priceIdx + 4); i++) {
      const v = parseFloat(cells[i].replace(/\s/g, "").replace(",", ".").replace(/%/g, ""));
      if (!isNaN(v) && v >= -99 && v <= 99) { changePct = v; break; }
    }

    // Clôture veille
    const prev = changePct !== 0 ? price / (1 + changePct / 100) : price;

    // Volume : dernier entier > 0
    let volume = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      const v = parseInt(cells[i].replace(/[\s.,]/g, ""), 10);
      if (!isNaN(v) && v > 0 && v < 100_000_000) { volume = v; break; }
    }

    stocks.push({
      ticker,
      closing_price: price,
      previous_closing_price: Math.round(prev * 100) / 100,
      volume,
      change_pct: Math.round(changePct * 10000) / 10000,
    });
  }
  return stocks;
}

// ── Fallback : API JSON SikaFinance pour les tickers manquants ──────────────

async function fetchOneTicker(ticker) {
  const today = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  try {
    const res = await fetch("https://www.sikafinance.com/api/general/GetHistos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
        "Origin": "https://www.sikafinance.com",
        "Referer": `https://www.sikafinance.com/marches/historiques/${ticker}`,
      },
      body: JSON.stringify({ ticker, datedeb: start, datefin: today, xperiod: 0 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    data.sort((a, b) => (b.Date || "").localeCompare(a.Date || ""));
    const last = data[0];
    const close = last.Cloture ?? last.close ?? last.Prix;
    if (!close || close <= 0) return null;
    const prev = data[1]?.Cloture ?? data[1]?.close ?? close;
    const changePct = prev > 0 ? ((close - prev) / prev) * 100 : 0;
    return {
      ticker,
      closing_price: close,
      previous_closing_price: Math.round(prev * 100) / 100,
      volume: last.Volume ?? last.volume ?? 0,
      change_pct: Math.round(changePct * 10000) / 10000,
    };
  } catch { return null; }
}

// ── Handler principal ────────────────────────────────────────────────────────

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    try {
      // Phase 1 : bulk HTML (1 requête)
      const html = await fetchBulkSika();
      const bulk = parseSikaHtml(html);
      const found = new Map(bulk.map(s => [s.ticker, s]));

      // Phase 2 : API JSON pour les tickers manquants (en parallèle)
      const missing = [...KNOWN_TICKERS].filter(t => !found.has(t));
      if (missing.length > 0) {
        const fallbacks = await Promise.allSettled(missing.map(fetchOneTicker));
        for (const r of fallbacks) {
          if (r.status === "fulfilled" && r.value) found.set(r.value.ticker, r.value);
        }
      }

      const stocks = [...found.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));

      return new Response(
        JSON.stringify({
          last_updated: new Date().toISOString(),
          source: "cloudflare-worker",
          count: stocks.length,
          stocks,
        }),
        { headers: { ...CORS, "Cache-Control": "public, max-age=900" } }
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { ...CORS },
      });
    }
  },
};
