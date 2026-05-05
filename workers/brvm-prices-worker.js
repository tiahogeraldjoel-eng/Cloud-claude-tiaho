/**
 * Cloudflare Worker — BRVM Stock Price API
 * Utilise l'API JSON SikaFinance pour chaque ticker (47 appels parallèles)
 * Temps de réponse sur Cloudflare : ~3-5s
 */

const TICKERS = [
  "ABJC","BICB","BICC","BNBC","BOAB","BOABF","BOAC","BOAM","BOAN","BOAS",
  "CABC","CBIBF","CFAC","CIEC","ECOC","ETIT","FTSC","LNBB","NEIC","NSBC",
  "NTLC","ONTBF","ORAC","ORGT","PALC","PRSC","SAFC","SCRC","SDCC","SDSC",
  "SEMC","SGBC","SHEC","SIBC","SICC","SIVC","SLBC","SMBC","SNTS","SOGC",
  "SPHC","STAC","STBC","TTLC","TTLS","UNLC","UNXC"
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function isoDate(daysAgo = 0) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().split("T")[0];
}

async function fetchTicker(ticker) {
  try {
    const resp = await fetch("https://www.sikafinance.com/api/general/GetHistos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
        "Origin": "https://www.sikafinance.com",
        "Referer": "https://www.sikafinance.com/marches/historiques/" + ticker,
        "Accept": "application/json, text/plain, */*",
      },
      body: JSON.stringify({
        ticker: ticker,
        datedeb: isoDate(10),
        datefin: isoDate(0),
        xperiod: 0,
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    // Trier par date décroissante
    data.sort((a, b) => {
      const da = a.Date || a.date || "";
      const db = b.Date || b.date || "";
      return db.localeCompare(da);
    });

    const last = data[0];
    const prev = data[1] || last;

    const close = last.Cloture || last.close || last.Prix || 0;
    const prevClose = prev.Cloture || prev.close || prev.Prix || close;

    if (close <= 0) return null;

    const changePct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;

    return {
      ticker: ticker,
      closing_price: close,
      previous_closing_price: Math.round(prevClose * 100) / 100,
      volume: last.Volume || last.volume || 0,
      change_pct: Math.round(changePct * 100) / 100,
    };
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    try {
      // 47 appels en parallèle — Cloudflare gère sans problème
      const results = await Promise.allSettled(TICKERS.map(fetchTicker));

      const stocks = results
        .filter(r => r.status === "fulfilled" && r.value !== null)
        .map(r => r.value)
        .sort((a, b) => a.ticker.localeCompare(b.ticker));

      return new Response(
        JSON.stringify({
          last_updated: new Date().toISOString(),
          source: "cloudflare-worker",
          count: stocks.length,
          stocks: stocks,
        }),
        {
          headers: {
            ...CORS,
            "Cache-Control": "public, max-age=900",
          },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: String(err), count: 0, stocks: [] }),
        { status: 500, headers: CORS }
      );
    }
  },
};
