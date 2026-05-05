/**
 * Cloudflare Worker — BRVM Stock Price API
 *
 * Déployement : cloudflare.com → Workers & Pages → Create Worker → coller ce code → Deploy
 * URL résultante : https://brvm-prices.<votre-compte>.workers.dev
 *
 * Gratuit : 100 000 requêtes/jour, sans carte bancaire
 */

const TICKERS = [
  "ABJC","BICB","BICC","BNBC","BOAB","BOABF","BOAC","BOAM","BOAN","BOAS",
  "CABC","CBIBF","CFAC","CIEC","ECOC","ETIT","FTSC","LNBB","NEIC","NSBC",
  "NTLC","ONTBF","ORAC","ORGT","PALC","PRSC","SAFC","SCRC","SDCC","SDSC",
  "SEMC","SGBC","SHEC","SIBC","SICC","SIVC","SLBC","SMBC","SNTS","SOGC",
  "SPHC","STAC","STBC","TTLC","TTLS","UNLC","UNXC"
];

const SIKA_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "Origin": "https://www.sikafinance.com",
  "Referer": "https://www.sikafinance.com/marches/historiques/ETIT",
};

function today() {
  return new Date().toISOString().split("T")[0];
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

async function fetchOneTicker(ticker) {
  const body = JSON.stringify({
    ticker,
    datedeb: daysAgo(7),
    datefin: today(),
    xperiod: 0,
  });

  const res = await fetch("https://www.sikafinance.com/api/general/GetHistos", {
    method: "POST",
    headers: { ...SIKA_HEADERS, Referer: `https://www.sikafinance.com/marches/historiques/${ticker}` },
    body,
  });

  if (!res.ok) return null;

  let data;
  try { data = await res.json(); } catch { return null; }

  if (!Array.isArray(data) || data.length === 0) return null;

  // Plus récente en premier
  data.sort((a, b) => (b.Date || "").localeCompare(a.Date || ""));
  const last = data[0];

  const close = last.Cloture ?? last.close ?? last.Prix;
  if (!close || close <= 0) return null;

  const open = last.Ouverture ?? last.open ?? close;
  const prev = data[1]?.Cloture ?? data[1]?.close ?? close;
  const changePct = prev > 0 ? ((close - prev) / prev) * 100 : 0;

  return {
    ticker,
    closing_price: close,
    previous_closing_price: prev,
    volume: last.Volume ?? last.volume ?? 0,
    change_pct: Math.round(changePct * 100) / 100,
  };
}

async function fetchAllTickers() {
  const results = [];
  // Lots de 10 en parallèle pour respecter le rate-limit SikaFinance
  for (let i = 0; i < TICKERS.length; i += 10) {
    const batch = TICKERS.slice(i, i + 10);
    const settled = await Promise.allSettled(batch.map(fetchOneTicker));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value !== null) {
        results.push(r.value);
      }
    }
    // Pause 200ms entre les lots
    if (i + 10 < TICKERS.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return results;
}

export default {
  async fetch(request) {
    // CORS — autorise l'app Android (et n'importe quel client)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const stocks = await fetchAllTickers();

      const payload = JSON.stringify({
        last_updated: new Date().toISOString(),
        source: "cloudflare-worker",
        count: stocks.length,
        stocks: stocks.sort((a, b) => a.ticker.localeCompare(b.ticker)),
      });

      return new Response(payload, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=1800", // cache 30 min côté client
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
