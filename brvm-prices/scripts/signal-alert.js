#!/usr/bin/env node
// BRVM Pre-Open Signal Alert - GitHub Actions Node.js script

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const BUDGET_FCFA        = parseInt(process.env.BUDGET_FCFA || '75000', 10);
// URL du Cloudflare Worker déjà déployé (source #0 — Cloudflare edge, pas de geo-blocage)
const BRVM_WORKER_URL    = (process.env.BRVM_WORKER_URL || '').replace(/\/$/, '');

const BRVM_URLS = [
  'https://www.brvm.org/fr/cours-actions/0',
  'https://www.brvm.org/fr/cours-actions/0/all',
  'https://brvm.org/fr/cours-actions/0',
  'https://www.brvm.org/fr/cours-des-actions/0/all',
  'https://www.brvm.org/fr/cours-des-actions/0',
  'https://brvm.org/fr/cours-des-actions/0',
  'https://www.brvm.org/en/cours-actions/0',
  'https://www.brvm.org/en/cours-des-actions/0/all',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

const YAHOO_MAP = {
  ABJC:'ABJC.CI',  BICC:'BICC.CI',  BNBC:'BNBC.BJ',  BOAB:'BOAB.BJ',
  BOABF:'BOABF.BF',BOACI:'BOACI.CI',BOAM:'BOAM.ML',   BOAN:'BOAN.NE',
  BOAS:'BOAS.SN',  CABC:'CABC.CI',  CBBF:'CBBF.BF',   CFAC:'CFAC.CI',
  ECOC:'ECOC.CI',  ETIT:'ETIT.TG',  LACI:'LACI.CI',   NEIC:'NEIC.CI',
  NSBC:'NSBC.CI',  NTLC:'NTLC.CI',  ONAT:'ONAT.BF',   ORAC:'ORAC.CI',
  ORGT:'ORGT.CI',  PALC:'PALC.CI',  PRSC:'PRSC.CI',   SAFC:'SAFC.CI',
  SAPH:'SAPH.CI',  SCRC:'SCRC.CI',  SDCC:'SDCC.CI',   SEMC:'SEMC.CI',
  SGBC:'SGBC.CI',  SHEC:'SHEC.CI',  SIAC:'SIAC.CI',   SIBC:'SIBC.CI',
  SICC:'SICC.CI',  SIPH:'SIPH.CI',  SLBC:'SLBC.CI',   SMBC:'SMBC.CI',
  SNTS:'SNTS.SN',  SOGB:'SOGB.CI',  SPHC:'SPHC.CI',   STAC:'STAC.CI',
  STBC:'STBC.BF',  SVOC:'SVOC.CI',  TPCI:'TPCI.CI',   TTLC:'TTLC.CI',
  TTLS:'TTLS.SN',  UNLC:'UNLC.CI',  UNXC:'UNXC.CI',
};
const YAHOO_REVERSE      = Object.fromEntries(Object.entries(YAHOO_MAP).map(([b,y]) => [y,b]));
// Also map base symbol (without exchange suffix .CI/.SN/etc.) for resilience
const YAHOO_REVERSE_BASE = Object.fromEntries(Object.entries(YAHOO_MAP).map(([b,y]) => [y.split('.')[0],b]));

const KNOWN_STOCKS = {
  ABJC: { name:'Bernabe CI',                           avgVol:380,   refPrice:2100   },
  BICC: { name:'BICICI CI (BNP Paribas)',              avgVol:180,   refPrice:5500   },
  BNBC: { name:'Bernabé CI',                           avgVol:4650,  refPrice:1700   },
  BOAB: { name:'Bank of Africa Benin',                 avgVol:980,   refPrice:5250   },
  BOABF:{ name:'Bank of Africa Burkina Faso',          avgVol:180,   refPrice:5200   },
  BOACI:{ name:'Bank of Africa Cote Ivoire',           avgVol:2800,  refPrice:6450   },
  BOAM: { name:'Bank of Africa Mali',                  avgVol:95,    refPrice:4900   },
  BOAN: { name:'Bank of Africa Niger',                 avgVol:380,   refPrice:3800   },
  BOAS: { name:'Bank of Africa Senegal',               avgVol:750,   refPrice:4900   },
  CABC: { name:'SICABLE CI Cables Electriques',        avgVol:820,   refPrice:2850   },
  CBBF: { name:'Coris Bank International BF',          avgVol:580,   refPrice:8750   },
  CFAC: { name:'CFAO Motors CI',                       avgVol:580,   refPrice:4800   },
  ECOC: { name:'Ecobank Cote Ivoire',                  avgVol:650,   refPrice:10500  },
  ETIT: { name:'Ecobank Transnational Inc. ETI',       avgVol:98000, refPrice:18     },
  LACI: { name:'Air Liquide CI',                       avgVol:240,   refPrice:6500   },
  NEIC: { name:'NEI-CEDA CI',                          avgVol:800,   refPrice:620    },
  NSBC: { name:'NSIA Banque CI',                       avgVol:950,   refPrice:7200   },
  NTLC: { name:'Nestlé CI',                            avgVol:660,   refPrice:13000  },
  ONAT: { name:'Onatel Telecoms Burkina Faso',         avgVol:310,   refPrice:4950   },
  ORAC: { name:'Orange Cote Ivoire',                   avgVol:5400,  refPrice:14750  },
  ORGT: { name:'Oragroup',                             avgVol:980,   refPrice:2650   },
  PALC: { name:'PALM-CI Palmier Huile',                avgVol:2200,  refPrice:7800   },
  PRSC: { name:'Tractafric Motor CI',                  avgVol:104,   refPrice:4100   },
  SAFC: { name:'SAFCA',                                avgVol:516,   refPrice:3750   },
  SAPH: { name:'SAPH CI Heveas',                       avgVol:850,   refPrice:5100   },
  SCRC: { name:'Sucrivoire CI',                        avgVol:560,   refPrice:680    },
  SDCC: { name:'SODE CI',                              avgVol:95,    refPrice:2900   },
  SEMC: { name:'Crown Siem CI Emballages',             avgVol:3800,  refPrice:680    },
  SGBC: { name:'Societe Generale CI',                  avgVol:720,   refPrice:12500  },
  SHEC: { name:'Vivo Energie CI',                      avgVol:1612,  refPrice:1915   },
  SIAC: { name:'SIFCA CI Agro-industrie',              avgVol:1500,  refPrice:4200   },
  SIBC: { name:'SIB CI Societe Ivoirienne Banque',     avgVol:1400,  refPrice:5800   },
  SICC: { name:'SICOR CI Industrie Coton',             avgVol:220,   refPrice:3800   },
  SIPH: { name:'SIPH CI Plantations Heveas',           avgVol:290,   refPrice:8900   },
  SLBC: { name:'Solibra CI Brasserie Castel',          avgVol:30,    refPrice:120000 },
  SMBC: { name:'SMB CI Manufacture Bois',              avgVol:120,   refPrice:15000  },
  SNTS: { name:'Sonatel Orange Senegal',               avgVol:3800,  refPrice:15800  },
  SOGB: { name:'SOGB CI Caoutchoucs',                  avgVol:520,   refPrice:3650   },
  SPHC: { name:'SAPH CI Actions Prioritaires',         avgVol:85,    refPrice:4200   },
  STAC: { name:'SETAO CI',                             avgVol:1670,  refPrice:3100   },
  STBC: { name:'SITAB CI',                             avgVol:497,   refPrice:21000  },
  SVOC: { name:'SVO CI Savonnerie',                    avgVol:680,   refPrice:2200   },
  TPCI: { name:'Tropical Partners CI',                 avgVol:60,    refPrice:1100   },
  TTLC: { name:'TotalEnergies Marketing CI',           avgVol:2800,  refPrice:2150   },
  TTLS: { name:'TotalEnergies Marketing Senegal',      avgVol:1200,  refPrice:2100   },
  UNLC: { name:'Unilever CI',                          avgVol:1100,  refPrice:5600   },
  UNXC: { name:'Unacoopec-CI',                         avgVol:260,   refPrice:2800   },
};

// Decode HTML entities so &nbsp; thousands separators don't break parseFloat
function decodeHtml(s) {
  return s
    .replace(/&nbsp;/gi, ' ').replace(/&#160;/g, ' ')
    .replace(/&thinsp;/gi, ' ').replace(/&#8201;/g, ' ')
    .replace(/ /g, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

const MPR_THRESHOLD    = 2.5;
const OBI_THRESHOLD    = 0.85;
const VOL_SPIKE_FACTOR = 3.0;
const BUDGET_RESERVE   = 0.20;
const FETCH_TIMEOUT_MS = 18000;

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (e) { clearTimeout(timer); throw e; }
}

const BRVM_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

const CHROME_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive',
  'Cache-Control': 'max-age=0',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

// ─── Source #0: Cloudflare Worker déployé ────────────────────────────────────
// Le Worker tourne sur l'edge Cloudflare → pas de géo-blocage → atteint brvm.org directement.
// Les données "simulated" du Worker sont rejetées ici — on veut uniquement des cours réels.

async function fetchCloudflareWorker() {
  const resp = await fetchWithTimeout(`${BRVM_WORKER_URL}/stocks`, {
    headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENTS[0] },
  });
  if (!resp.ok) throw new Error(`Worker HTTP ${resp.status}`);
  const data = await resp.json();
  const arr = data.stocks || data;
  if (!Array.isArray(arr) || arr.length < 5) return null;

  // Rejeter les données simulées — uniquement les cours live
  const live = arr.filter(s => s.source !== 'simulated');
  if (live.length < 5) {
    console.warn(`Worker: donnees simulees (${arr.length - live.length}/${arr.length}) — rejet, sources live introuvables.`);
    return null;
  }
  console.log(`Worker: ${live.length} titres live (${[...new Set(live.map(s => s.source))].join(',')})`);
  return live.map(s => ({
    symbol:        String(s.symbol || '').toUpperCase(),
    name:          s.name || KNOWN_STOCKS[s.symbol]?.name || s.symbol,
    price:         Math.round(parseFloat(s.price) || 0),
    previousPrice: Math.round(parseFloat(s.previousPrice || s.price) || 0),
    change:        Math.round(parseFloat(s.change) || 0),
    changePercent: Math.round((parseFloat(s.changePercent) || 0) * 100) / 100,
    volume:        parseInt(s.volume) || 0,
  })).filter(s => s.symbol && s.price > 0);
}

async function fetchLiveStocks() {
  // Source #0 : Cloudflare Worker (lui-même utilise AFX)
  if (BRVM_WORKER_URL) {
    try {
      const stocks = await fetchCloudflareWorker();
      if (stocks?.length >= 5) { console.log(`Source: cloudflare-worker (${stocks.length} titres)`); return { stocks, source: 'cloudflare-worker' }; }
    } catch (e) { console.warn('Cloudflare Worker:', e.message); }
  }

  // Source #1 : AFX direct — afx.kwayisi.org, pas de geo-blocage, données BRVM fiables
  try {
    const stocks = await fetchAFX();
    if (stocks?.length >= 5) { console.log(`Source: afx (${stocks.length} titres)`); return { stocks, source: 'afx' }; }
  } catch (e) { console.warn('AFX:', e.message); }

  return { stocks: [], source: 'unavailable' };
}

// TradingView Scanner API — JSON public, aucune authentification requise
async function fetchTradingView() {
  const endpoints = [
    'https://scanner.tradingview.com/global/scan',
    'https://scanner.tradingview.com/africa/scan',
  ];
  const body = JSON.stringify({
    filter: [{ left: 'exchange', operation: 'equal', right: 'BRVM' }],
    columns: ['name', 'description', 'close', 'change', 'change_abs', 'volume', 'open'],
    sort: { sortBy: 'name', sortOrder: 'asc' },
    range: [0, 100],
  });
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENTS[0],
    'Accept': 'application/json',
    'Origin': 'https://www.tradingview.com',
    'Referer': 'https://www.tradingview.com/',
  };
  for (const url of endpoints) {
    try {
      const resp = await fetchWithTimeout(url, { method: 'POST', headers, body });
      console.log(`TradingView (${url.split('/')[4]}): HTTP ${resp.status}`);
      if (!resp.ok) { console.warn(`TradingView erreur: ${(await resp.text()).substring(0,150)}`); continue; }
      const data = await resp.json();
      console.log(`TradingView: totalCount=${data.totalCount}, data=${data.data?.length}`);
      if (!data.data?.length) continue;
      const stocks = data.data.map(item => {
        const symbol = item.s?.split(':')[1]?.toUpperCase().replace(/[^A-Z]/g,'');
        if (!symbol || !KNOWN_STOCKS[symbol]) return null;
        const [, , close, changePct, changeAbs, volume] = item.d || [];
        const price = Math.round(parseFloat(close) || 0);
        if (price <= 0) return null;
        return { symbol, name: KNOWN_STOCKS[symbol].name,
          price, previousPrice: Math.round(price - (parseFloat(changeAbs)||0)),
          change: Math.round(parseFloat(changeAbs)||0),
          changePercent: Math.round((parseFloat(changePct)||0)*100)/100,
          volume: Math.round(parseFloat(volume)||0) };
      }).filter(Boolean);
      console.log(`TradingView: ${stocks.length} titres BRVM valides`);
      if (stocks.length >= 2) return stocks;
    } catch (e) { console.warn(`TradingView (${url.split('/')[4]}):`, e.message); }
  }
  return null;
}

// Stooq.com — CSV gratuit, format stable, couverture globale (ETIT.TG, SNTS.SN, etc.)
async function fetchStooq() {
  // Batch: tous les symboles en une requete
  const syms = Object.values(YAHOO_MAP).map(s => s.toLowerCase()).join('+');
  const url = `https://stooq.com/q/l/?s=${syms}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/csv,text/plain' } });
    console.log(`stooq batch: HTTP ${resp.status}`);
    if (!resp.ok) return null;
    const csv = await resp.text();
    const lines = csv.trim().split('\n');
    console.log(`stooq: ${lines.length - 1} lignes CSV`);
    if (lines.length < 3) return null;
    // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
    const stocks = lines.slice(1).map(line => {
      const p = line.split(',');
      if (p.length < 7) return null;
      const yahooSym = p[0].trim().toUpperCase();
      const sym = YAHOO_REVERSE[yahooSym] || YAHOO_REVERSE_BASE[yahooSym] || YAHOO_REVERSE_BASE[yahooSym.split('.')[0]];
      if (!sym) return null;
      const close = parseFloat(p[6]);
      const open  = parseFloat(p[3]);
      if (!close || close <= 0 || close === open && open === 0) return null;
      const changeAbs = close - open;
      const changePct = open > 0 ? (changeAbs / open) * 100 : 0;
      return { symbol: sym, name: KNOWN_STOCKS[sym].name,
        price: Math.round(close), previousPrice: Math.round(open),
        change: Math.round(changeAbs), changePercent: Math.round(changePct*100)/100,
        volume: parseInt(p[7]||'0')||0 };
    }).filter(Boolean);
    console.log(`stooq: ${stocks.length} titres BRVM valides`);
    return stocks.length >= 2 ? stocks : null;
  } catch (e) { console.warn('stooq:', e.message); return null; }
}

async function fetchFluxBourse() {
  const tryParse = (rawHtml, label) => {
    // Decode HTML entities FIRST (&nbsp; -> space, etc.) so prices parse correctly
    const html = decodeHtml(rawHtml);
    // Diagnostic: debut de la page (structure generale)
    console.log(`[${label}] debut: ${html.substring(0, 600).replace(/\s+/g, ' ')}`);
    // Diagnostic: contexte autour du premier symbole BRVM trouve
    const diagSym = ['ETIT','SNTS','SGBC','ORAC'].find(s => html.includes(s));
    if (diagSym) {
      const idx = html.indexOf(diagSym);
      const ctx = html.substring(Math.max(0, idx - 500), idx + 1200).replace(/\s+/g, ' ');
      console.log(`[${label}] ctx(${idx}) autour de ${diagSym}: ${ctx}`);
    }
    return parseNextData(html)
      || parseWindowData(html)
      || parseScriptJson(html)
      || parseHtmlAttributes(html)
      || parseBRVMHtmlFlexible(html)
      || parseFluxBourseText(html)
      || parseFluxBourseAggressive(html);
  };

  // Tentatives: directe + 3 proxies CORS (tous ont montre HTTP 200 dans les logs)
  const sources = [
    { url: 'https://fluxbourse.com/',                                                                  label: 'direct',      headers: CHROME_HEADERS },
    { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://fluxbourse.com/'),      label: 'allorigins',  headers: { 'Accept': 'text/html', 'User-Agent': USER_AGENTS[0] } },
    { url: 'https://corsproxy.io/?' + encodeURIComponent('https://fluxbourse.com/'),                   label: 'corsproxy',   headers: { 'Accept': 'text/html', 'User-Agent': USER_AGENTS[0] } },
    { url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent('https://fluxbourse.com/'), label: 'codetabs',    headers: { 'Accept': 'text/html', 'User-Agent': USER_AGENTS[0] } },
  ];

  for (const src of sources) {
    try {
      const resp = await fetchWithTimeout(src.url, { headers: src.headers });
      console.log(`fluxbourse [${src.label}]: HTTP ${resp.status}`);
      if (!resp.ok) continue;
      const html = await resp.text();
      const hasData = html.includes('ETIT') || html.includes('SNTS') || html.includes('SGBC');
      console.log(`fluxbourse [${src.label}]: ${html.length} bytes, BRVM: ${hasData}`);
      if (!hasData) continue;
      const stocks = tryParse(html, `flux-${src.label}`);
      if (stocks?.length >= 1) return stocks;
      console.warn(`fluxbourse [${src.label}]: donnees presentes mais tous parseurs echoues`);
    } catch (e) { console.warn(`fluxbourse [${src.label}]:`, e.message); }
  }

  return null;
}

// Next.js hydration data (__NEXT_DATA__)
function parseNextData(html) {
  try {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    const nextData = JSON.parse(m[1]);
    const pp = nextData?.props?.pageProps;
    if (!pp) return null;
    const arr = pp.stocks || pp.cours || pp.actions || pp.cotations ||
                pp.data?.stocks || pp.data?.cours || pp.data?.actions || pp.data;
    if (!Array.isArray(arr) || !arr.length) return null;
    console.log(`Next.js data: ${arr.length} elements, cles: ${Object.keys(arr[0] || {}).join(', ')}`);
    return parseJsonArray(arr);
  } catch (e) { console.warn('parseNextData:', e.message); return null; }
}

// Variables JS : window.X={...}, var/const/let X=[...] ou {...}
function parseWindowData(html) {
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const src = m[1];
    if (src.length < 50) continue;
    const patterns = [
      /(?:window\.\w+|self\.\w+)\s*=\s*(\{[\s\S]{30,40000}\})\s*[;,]/,
      /(?:var|let|const)\s+\w+\s*=\s*(\[[\s\S]{30,40000}\])\s*[;,]/,
      /(?:var|let|const)\s+\w+\s*=\s*(\{[\s\S]{30,40000}\})\s*[;,]/,
    ];
    for (const re of patterns) {
      const pm = src.match(re);
      if (!pm) continue;
      try {
        const data = JSON.parse(pm[1]);
        const candidates = Array.isArray(data)
          ? [data]
          : [
              data.stocks, data.cours, data.cotations, data.actions,
              data.quotes, data.data?.stocks, data.data?.cours, data.data,
              ...Object.values(data).filter(Array.isArray),
            ].filter(a => Array.isArray(a) && a.length >= 2);
        for (const arr of candidates) {
          const stocks = parseJsonArray(arr);
          if (stocks?.length >= 2) { console.log(`parseWindowData: ${stocks.length} stocks`); return stocks; }
        }
      } catch (e) {}
    }
  }
  return null;
}

// JSON dans les balises <script> (arrays ET objets)
function parseScriptJson(html) {
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const src = m[1];
    if (src.length < 50) continue;
    const matches = [
      ...(src.match(/\[[\s\S]{50,40000}\]/g) || []),
      ...(src.match(/\{[\s\S]{50,40000}\}/g) || []),
    ];
    for (const jsonStr of matches) {
      try {
        const parsed = JSON.parse(jsonStr);
        const arr = Array.isArray(parsed) ? parsed :
          (parsed.stocks || parsed.cours || parsed.cotations || parsed.actions || parsed.data || []);
        if (Array.isArray(arr) && arr.length >= 3) {
          const stocks = parseJsonArray(arr);
          if (stocks?.length >= 3) { console.log(`parseScriptJson: ${stocks.length} stocks`); return stocks; }
        }
      } catch(e) {}
    }
  }
  return null;
}

// Attributs HTML data-ticker, data-symbol, data-code, etc.
function parseHtmlAttributes(html) {
  const stocks = [];
  const rowRe = /<(?:tr|div|li)[^>]+>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const tag = m[0];
    const symM = tag.match(/data-(?:ticker|symbol|code|sym|action|valeur|libelle)=["']([A-Z0-9.\-]{2,10})["']/i);
    if (!symM) continue;
    let rawSym = symM[1].toUpperCase().replace(/\s/g,'');
    const sym = rawSym.replace(/\.[A-Z]{2}$/, '');
    const meta = KNOWN_STOCKS[sym];
    if (!meta) continue;
    const priceM = tag.match(/data-(?:price|cours|last|close|dernier|prix)=["']([\d.,\s ]+)["']/i);
    if (!priceM) continue;
    const price = parseFloat(priceM[1].replace(/[\s ]/g,'').replace(',','.'));
    if (price <= 0) continue;
    const chgM = tag.match(/data-(?:change|variation|var|evol|pct)=["']([+-]?[\d.,]+)["']/i);
    const chg = chgM ? parseFloat(chgM[1].replace(',','.')) : 0;
    const volM = tag.match(/data-(?:vol|volume)=["'](\d+)["']/i);
    const vol = volM ? parseInt(volM[1]) : 0;
    const prev = price / (1 + chg / 100);
    stocks.push({ symbol: sym, name: meta.name,
      price: Math.round(price), previousPrice: Math.round(prev),
      change: Math.round(price - prev), changePercent: Math.round(chg * 100) / 100, volume: vol });
  }
  if (stocks.length >= 2) { console.log(`parseHtmlAttributes: ${stocks.length} stocks`); return stocks; }
  return null;
}

// Essaie toutes les combinaisons de colonnes [symCol, priceCol, chgCol, volCol]
function parseBRVMHtmlFlexible(html) {
  const combos = [
    [0,2,4,5], [0,2,3,4], [0,1,2,3],
    [0,3,5,6], [0,3,4,5], [1,2,4,5],
    [1,3,4,5], [0,4,5,6], [0,2,5,6],
    [1,3,5,6], [0,1,3,4], [1,4,5,6],
    [1,2,3,4], [2,4,5,6],
  ];
  const rowRe0 = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const strip = /<[^>]+>/g;
  const rows = [];
  let row;
  while ((row = rowRe0.exec(html)) !== null) {
    const cells = [];
    const cm = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cm.exec(row[1])) !== null) cells.push(cell[1].replace(strip,'').trim());
    if (cells.length >= 3) rows.push(cells);
  }
  if (!rows.length) return null;

  for (const [sc, pc, cc, vc] of combos) {
    const stocks = [];
    for (const cells of rows) {
      if (cells.length <= Math.max(sc, pc, cc)) continue;
      const rawSym = cells[sc]?.toUpperCase().replace(/\s/g,'');
      const symbol = rawSym?.replace(/\.[A-Z]{2}$/, '');
      const price  = parseFloat(cells[pc]?.replace(/[\s ]/g,'').replace(',','.'));
      const chg    = parseFloat(cells[cc]?.replace('%','').replace(/[\s ]/g,'').replace(',','.')) || 0;
      if (symbol?.length >= 2 && symbol.length <= 6 && price > 0 && KNOWN_STOCKS[symbol]) {
        const prev = price / (1 + chg / 100);
        stocks.push({ symbol, name: KNOWN_STOCKS[symbol].name,
          price: Math.round(price), previousPrice: Math.round(prev),
          change: Math.round(price - prev), changePercent: Math.round(chg * 100) / 100,
          volume: parseInt(cells[vc]?.replace(/[\s ]/g,'') || '0') || 0 });
      }
    }
    if (stocks.length >= 3) {
      console.log(`parseBRVMHtmlFlexible: ${stocks.length} stocks avec cols [${sc},${pc},${cc},${vc}]`);
      return stocks;
    }
  }
  return null;
}

// Parseur texte pur : supprime tout le HTML, cherche symboles connus + prix proches
function parseFluxBourseText(html) {
  const lines = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map(l => l.trim().replace(/ /g,' ').replace(/\s+/g,' '))
    .filter(Boolean);

  const stocks = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const rawSym = lines[i].toUpperCase().replace(/\s/g,'');
    let sym = rawSym;
    let meta = KNOWN_STOCKS[sym];
    // Handle suffix variants like ETIT.TG -> ETIT
    if (!meta && /\.[A-Z]{2}$/.test(rawSym)) {
      sym = rawSym.replace(/\.[A-Z]{2}$/, '');
      meta = KNOWN_STOCKS[sym];
    }
    if (!meta || seen.has(sym)) continue;

    let price = 0, chg = 0;
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      const tok = lines[j].replace(/[\s ]/g,'').replace(',','.');
      if (!price) {
        const n = parseFloat(tok);
        if (!isNaN(n) && n >= meta.refPrice * 0.1 && n <= meta.refPrice * 8) { price = n; continue; }
      }
      if (!chg && tok.includes('%')) {
        const p = parseFloat(tok.replace('%','').replace('+',''));
        if (!isNaN(p) && Math.abs(p) <= 20) { chg = p; }
      }
      if (KNOWN_STOCKS[lines[j].toUpperCase().replace(/\s/g,'')]) break;
    }
    if (price > 0) {
      seen.add(sym);
      const prev = price / (1 + chg / 100);
      stocks.push({ symbol: sym, name: meta.name, price: Math.round(price),
        previousPrice: Math.round(prev), change: Math.round(price - prev),
        changePercent: Math.round(chg * 100) / 100, volume: 0 });
    }
  }
  if (stocks.length >= 3) { console.log(`parseFluxBourseText: ${stocks.length} stocks`); return stocks; }
  return null;
}

// Parseur agressif : trouve symboles n'importe ou dans le texte (pas seulement sur une ligne seule)
function parseFluxBourseAggressive(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  const stocks = [];
  const seen = new Set();

  for (const [sym, meta] of Object.entries(KNOWN_STOCKS)) {
    if (seen.has(sym)) continue;
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(sym, searchFrom);
      if (idx === -1) break;
      searchFrom = idx + 1;
      // Word boundary: char before and after must not be alphanumeric
      const cBefore = idx > 0 ? text[idx - 1] : ' ';
      const cAfter  = idx + sym.length < text.length ? text[idx + sym.length] : ' ';
      if (/[A-Za-z0-9]/.test(cBefore) || /[A-Za-z0-9]/.test(cAfter)) continue;
      // Scan next 400 chars for a number in valid price range
      const win = text.substring(idx, idx + 400);
      const numRe = /\b(\d[\d ]*(?:[.,]\d+)?)\b/g;
      let nm;
      while ((nm = numRe.exec(win)) !== null) {
        const n = parseFloat(nm[1].replace(/[ ]/g, '').replace(',', '.'));
        if (isNaN(n) || n <= 0) continue;
        if (n >= meta.refPrice * 0.1 && n <= meta.refPrice * 10) {
          const pctM = win.match(/([+\-]?\d+[.,]?\d*)\s*%/);
          const chg = pctM ? parseFloat(pctM[1].replace(',', '.')) : 0;
          const prev = n / (1 + chg / 100);
          seen.add(sym);
          stocks.push({ symbol: sym, name: meta.name, price: Math.round(n),
            previousPrice: Math.round(prev), change: Math.round(n - prev),
            changePercent: Math.round(chg * 100) / 100, volume: 0 });
          break;
        }
      }
      if (seen.has(sym)) break;
    }
  }
  if (stocks.length >= 2) { console.log(`parseFluxBourseAggressive: ${stocks.length} stocks`); return stocks; }
  return null;
}

// Parse un tableau JSON generique en liste de stocks
function parseJsonArray(arr) {
  const stocks = arr.map(item => {
    const rawSym = (item.symbol || item.ticker || item.code || item.symbole || item.SYMBOLE || item.valeur || '');
    const symbol = rawSym.toUpperCase().replace(/\s/g,'').replace(/\.[A-Z]{2}$/,'');
    const price = parseFloat(item.price || item.cours || item.lastPrice || item.close || item.dernier || item.last || item.prix || 0);
    if (!symbol || symbol.length < 2 || symbol.length > 6 || price <= 0) return null;
    const chg = parseFloat(item.changePercent || item.variation || item.change_pct || item.var || item.evol || item.taux || 0);
    const prev = price / (1 + chg / 100);
    return { symbol, name: KNOWN_STOCKS[symbol]?.name || item.name || item.libelle || item.nom || symbol,
             price: Math.round(price), previousPrice: Math.round(prev),
             change: Math.round(price - prev), changePercent: Math.round(chg * 100) / 100,
             volume: parseInt(item.volume || item.vol || item.quantite || 0) };
  }).filter(s => s && KNOWN_STOCKS[s.symbol]);
  return stocks.length >= 1 ? stocks : null;
}

function parseJsonStocks(text) {
  try {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : data.stocks || data.cours || data.actions || data.data || [];
    if (Array.isArray(arr) && arr.length) return parseJsonArray(arr);
  } catch (e) {}
  return null;
}

async function fetchYahooFinance() {
  const tickers = Object.values(YAHOO_MAP).join(',');
  let cookies = '';
  let crumb = '';

  try {
    const r = await fetchWithTimeout('https://fc.yahoo.com/', {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    console.log(`Yahoo fc.yahoo.com: HTTP ${r.status}`);
    const sc = r.headers.get('set-cookie') || '';
    if (sc) {
      cookies = sc.split(',').map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ');
      console.log(`Yahoo cookies: ${cookies.length > 0 ? 'ok' : 'vide'}`);
    }
  } catch (e) { console.warn('Yahoo fc.yahoo.com:', e.message); }

  try {
    const r = await fetchWithTimeout('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': USER_AGENTS[0],
        'Accept': '*/*',
        'Referer': 'https://finance.yahoo.com/',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
    });
    console.log(`Yahoo getcrumb: HTTP ${r.status}`);
    if (r.ok) {
      crumb = (await r.text()).trim();
      console.log(`Yahoo crumb: "${crumb.substring(0, 15)}${crumb.length > 15 ? '...' : ''}"`);
    } else {
      const err = await r.text();
      console.warn(`Yahoo crumb erreur: ${err.substring(0, 100)}`);
    }
  } catch (e) { console.warn('Yahoo getcrumb:', e.message); }

  const crumbSuffix = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
  const headers = {
    'User-Agent': USER_AGENTS[0],
    'Accept': 'application/json, */*;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
    ...(cookies ? { 'Cookie': cookies } : {}),
  };

  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${tickers}${crumbSuffix}&fields=symbol,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketVolume`,
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers}${crumbSuffix}&fields=symbol,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketVolume`,
    `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${tickers}&fields=symbol,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketVolume`,
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers}&fields=symbol,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketVolume`,
  ];

  for (const url of urls) {
    const label = `Yahoo ${url.includes('v8') ? 'v8' : 'v7'}${url.includes('crumb') ? '+crumb' : ''}`;
    try {
      const resp = await fetchWithTimeout(url, { headers });
      console.log(`${label}: HTTP ${resp.status}`);
      if (!resp.ok) {
        const errText = await resp.text();
        console.warn(`${label} erreur: ${errText.substring(0, 150)}`);
        continue;
      }
      const data = await resp.json();
      const quotes = data?.quoteResponse?.result;
      const symList = (quotes||[]).slice(0,8).map(q=>q.symbol).join(', ');
      console.log(`${label}: ${quotes?.length || 0} tickers retournes: ${symList}`);
      if (!quotes || !quotes.length) {
        console.warn(`${label}: result vide, erreur=${JSON.stringify(data?.quoteResponse?.error)}`);
        continue;
      }
      const stocks = quotes.map(q => {
        // Full match (ETIT.TG) then base match (ETIT without suffix)
        const sym = YAHOO_REVERSE[q.symbol]
          || YAHOO_REVERSE_BASE[q.symbol]
          || YAHOO_REVERSE_BASE[q.symbol.split('.')[0]];
        if (!sym) return null;
        const price = Math.round(q.regularMarketPrice || 0);
        const prev  = Math.round(q.regularMarketPreviousClose || price);
        if (price <= 0) return null;
        return {
          symbol: sym, name: KNOWN_STOCKS[sym]?.name || sym,
          price, previousPrice: prev,
          change: price - prev,
          changePercent: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
          volume: q.regularMarketVolume || 0,
        };
      }).filter(Boolean);
      console.log(`${label}: ${stocks.length} titres BRVM valides`);
      if (stocks.length >= 1) return stocks;
    } catch (e) { console.warn(`${label}:`, e.message); }
  }
  return null;
}

async function fetchAfricabourse() {
  const urls = [
    'https://africabourse.net/cours-actions-brvm/',
    'https://www.africabourse.net/cotations/',
    'https://africabourse.net/bourse/cotation/brvm/',
  ];
  for (const url of urls) {
    try {
      const resp = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': USER_AGENTS[0],
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
      });
      console.log(`africabourse (${url.split('/').slice(-2).join('/')}): HTTP ${resp.status}`);
      if (resp.ok) {
        const html = await resp.text();
        const hasData = html.includes('ETIT') || html.includes('SNTS') || html.includes('SGBC');
        console.log(`africabourse: ${html.length} bytes, donnees BRVM: ${hasData}`);
        if (hasData) {
          const stocks = parseBRVMHtml(html);
          if (stocks) return stocks;
          console.warn('africabourse: HTML avec donnees mais table non parsee');
        }
      }
    } catch (e) { console.warn(`africabourse (${url.split('/').slice(-2).join('/')}):`, e.message); }
  }
  return null;
}

function parseBRVMHtml(rawHtml) {
  const html = decodeHtml(rawHtml);
  const stocks = [];
  // Identify the main price table: header contains "cloture"/"variation" or "symbole"
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch, targetHtml = '';
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const firstRow = /<tr[^>]*>([\s\S]*?)<\/tr>/i.exec(tableMatch[1]);
    if (!firstRow) continue;
    const hdr = firstRow[1].replace(/<[^>]+>/g, ' ').toLowerCase();
    if ((hdr.includes('cl') && hdr.includes('ture')) ||
        (hdr.includes('symbole') && hdr.includes('variation'))) {
      targetHtml = tableMatch[1]; break;
    }
  }
  const searchHtml = targetHtml || html;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const strip = /<[^>]+>/g;
  let row, skipHeader = !!targetHtml;
  while ((row = rowRe.exec(searchHtml)) !== null) {
    if (skipHeader) { skipHeader = false; continue; }
    const cells = [];
    const cm = /<td[^>]*>([\s\S]*?)<\/td>/gi; let cell;
    while ((cell = cm.exec(row[1])) !== null) cells.push(cell[1].replace(strip, '').trim());
    if (cells.length < 5) continue;
    const symbol = cells[0].toUpperCase().replace(/[\s\u00a0]/g, '');
    if (!/^[A-Z]{2,8}$/.test(symbol) || !KNOWN_STOCKS[symbol]) continue;
    // BRVM.org confirmed column structure (scraper.py):
    // 0:Symbol 1:Name 2:Volume 3:RefPrice(veille) 4:OpenPrice 5:ClosePrice 6:Variation%
    const vol   = parseFloat(cells[2]?.replace(/[\s\u00a0]/g, '').replace(',', '.')) || 0;
    const ref   = parseFloat(cells[3]?.replace(/[\s\u00a0]/g, '').replace(',', '.'));
    const open  = parseFloat(cells[4]?.replace(/[\s\u00a0]/g, '').replace(',', '.'));
    const close = parseFloat(cells[5]?.replace(/[\s\u00a0]/g, '').replace(',', '.'));
    const chg   = parseFloat(cells[6]?.replace('%', '').replace(/[\s\u00a0]/g, '').replace(',', '.')) || 0;
    const price = close || open || ref;
    if (!price || price <= 0) continue;
    const prev = ref || price;
    stocks.push({ symbol, name: cells[1] || KNOWN_STOCKS[symbol]?.name || symbol,
      price: Math.round(price), previousPrice: Math.round(prev),
      change: Math.round(price - prev), changePercent: Math.round(chg * 100) / 100,
      volume: Math.round(vol) });
  }
  return stocks.length >= 5 ? stocks : null;
}

async function fetchAFX() {
  // afx.kwayisi.org/brvm/ — confirmed working by scraper.py (no geo-blocking)
  const resp = await fetchWithTimeout('https://afx.kwayisi.org/brvm/', {
    headers: {
      'User-Agent': USER_AGENTS[0],
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  });
  if (!resp.ok) throw new Error(`AFX HTTP ${resp.status}`);
  const html = decodeHtml(await resp.text());
  const stocks = parseAFXHtml(html);
  console.log(`AFX: ${stocks?.length ?? 0} titres`);
  return stocks;
}

function parseAFXHtml(html) {
  // Table structure (confirmed by scraper.py):
  // Tables[0]=Indices, [1-2]=Gainers/Losers (%), [3]=Main prices
  // Table[3] columns: Ticker | Name | Volume | Price | ChangePts
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tables = [];
  let tm;
  while ((tm = tableRe.exec(html)) !== null) tables.push(tm[1]);

  const targetTable = tables[3] || tables[tables.length - 1];
  if (!targetTable) return null;

  const stocks = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const strip = /<[^>]+>/g;
  let row, skipHeader = true;
  while ((row = rowRe.exec(targetTable)) !== null) {
    if (skipHeader) { skipHeader = false; continue; }
    const cells = [];
    const cm = /<td[^>]*>([\s\S]*?)<\/td>/gi; let cell;
    while ((cell = cm.exec(row[1])) !== null) cells.push(cell[1].replace(strip, '').trim());
    if (cells.length < 4) continue;
    const symbol = cells[0].toUpperCase().replace(/[\s\u00a0]/g, '');
    if (!/^[A-Z]{2,8}$/.test(symbol) || !KNOWN_STOCKS[symbol]) continue;
    const vol      = parseFloat(cells[2]?.replace(/[\s\u00a0]/g, '').replace(',', '.')) || 0;
    const price    = parseFloat(cells[3]?.replace(/[\s\u00a0]/g, '').replace(',', '.'));
    const changePt = parseFloat(cells[4]?.replace(/[\s\u00a0]/g, '').replace(',', '.')) || 0;
    if (!price || price <= 0) continue;
    const prev = price - changePt;
    const chg  = prev > 0 ? Math.round((changePt / prev) * 10000) / 100 : 0;
    stocks.push({ symbol, name: cells[1] || KNOWN_STOCKS[symbol]?.name || symbol,
      price: Math.round(price), previousPrice: Math.round(prev > 0 ? prev : price),
      change: Math.round(changePt), changePercent: chg, volume: Math.round(vol) });
  }
  return stocks.length >= 5 ? stocks : null;
}


function parseSikaHtml(html) {
  const stocks = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const strip = /<[^>]+>/g;
  let row;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = [];
    const cm = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cm.exec(row[1])) !== null) cells.push(cell[1].replace(strip, '').trim());
    if (cells.length < 4) continue;
    const symbol = cells[0].replace(/\s/g,'').toUpperCase();
    const price  = parseFloat(cells[1].replace(/[\s ]/g,'').replace(',','.'));
    const chg    = parseFloat(cells[2].replace('%','').replace(',','.')) || 0;
    if (symbol.length >= 2 && symbol.length <= 6 && price > 0) {
      stocks.push({ symbol, name: KNOWN_STOCKS[symbol]?.name || symbol,
        price: Math.round(price), previousPrice: Math.round(price / (1 + chg / 100)),
        change: Math.round(price * chg / 100), changePercent: Math.round(chg * 100) / 100,
        volume: parseInt(cells[3]?.replace(/\s/g,'') || '0') || 0 });
    }
  }
  return stocks.length >= 5 ? stocks : null;
}

function analyzeSignal(stock) {
  const meta     = KNOWN_STOCKS[stock.symbol] || { avgVol: 300, refPrice: stock.price };
  const volRatio = meta.avgVol > 0 ? stock.volume / meta.avgVol : 1;
  const momentum = stock.changePercent / 7.5;
  const mpr      = Math.max(0, volRatio * (1 + Math.max(0, momentum)));
  const obi      = Math.min(1, Math.max(-1, momentum * volRatio * 0.5));
  const iceberg  = stock.volume > meta.avgVol * VOL_SPIKE_FACTOR;
  const reasons  = [];
  if (mpr > MPR_THRESHOLD)
    reasons.push(`MPR=${mpr.toFixed(2)} (vol ${stock.volume} = ${volRatio.toFixed(1)}x moy)`);
  if (obi >= OBI_THRESHOLD)
    reasons.push(`OBI=${obi.toFixed(3)} pression acheteuse forte`);
  if (iceberg && reasons.length > 0)
    reasons.push(`Iceberg: ${stock.volume} titres = ${volRatio.toFixed(1)}x vol moyen (${meta.avgVol})`);
  const confidence = reasons.length >= 3 ? 'HIGH' : reasons.length >= 2 ? 'MEDIUM' : reasons.length >= 1 ? 'LOW' : 'NONE';
  return { ...stock, meta, mpr, obi, iceberg, reasons, confidence, alert: reasons.length > 0 };
}

function calcPosition(price) {
  const n = Math.floor(BUDGET_FCFA * (1 - BUDGET_RESERVE) / price);
  if (n === 0) return null;
  const cout = n * price;
  return { n, cout, reserve: BUDGET_FCFA - cout,
    gainCible: Math.round(cout * 0.04), gainMax: Math.round(cout * 0.075), pertMax: Math.round(cout * 0.03),
    prixCible: Math.round(price * 1.04), prixStopLoss: Math.round(price * 0.97) };
}

async function sendTelegram(signal, source) {
  const emoji = signal.confidence === 'HIGH' ? '🔴' : signal.confidence === 'MEDIUM' ? '🟠' : '🟡';
  const reasons = signal.reasons.map(r => `  * ${r}`).join('\n');
  const srcTag = source !== 'brvm-direct' ? `\n_Source: ${source}_` : '';
  const pos = calcPosition(signal.price);
  const posBlock = pos
    ? `----------------------\n💼 RECOMMANDATION (budget ${BUDGET_FCFA.toLocaleString('fr-FR')} F)\n📌 Acheter: ${pos.n} titre(s) ${signal.symbol}\n💸 Cout: ${pos.cout.toLocaleString('fr-FR')} FCFA  |  Reserve: ${pos.reserve.toLocaleString('fr-FR')} FCFA\n🎯 Objectif: ${pos.prixCible.toLocaleString('fr-FR')} FCFA (+4%) -> +${pos.gainCible.toLocaleString('fr-FR')} F\n🚀 Max BRVM: +7.5% -> +${pos.gainMax.toLocaleString('fr-FR')} F\n🛑 Stop loss: ${pos.prixStopLoss.toLocaleString('fr-FR')} FCFA (-3%)`
    : `Titre trop cher pour le budget (${signal.price.toLocaleString('fr-FR')} FCFA/titre)`;
  const text = `${emoji} *FLASH BRVM Pre-Ouverture*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *${signal.symbol}* - ${signal.name}\n` +
    `⏰ *9h35 GMT* - Fixing dans 10 min\n` +
    `💰 *Cours*: ${signal.price.toLocaleString('fr-FR')} FCFA\n` +
    `📊 *Variation*: ${signal.changePercent > 0 ? '+' : ''}${signal.changePercent.toFixed(2)}%\n` +
    `🛒 *Volume*: ${signal.volume.toLocaleString('fr-FR')} titres\n` +
    `----------------------\n` +
    `📈 *MPR*: ${signal.mpr.toFixed(2)} (seuil > 2.5)\n` +
    `⚖️ *OBI*: ${signal.obi.toFixed(3)} (seuil > 0.85)\n` +
    `----------------------\n` +
    `*Signaux:*\n${reasons}\n` +
    `${posBlock}\n` +
    `----------------------\n` +
    `⚡ *Passe l ordre avant 9h45 GMT*\n` +
    `_Confiance: ${signal.confidence}${srcTag}_`;
  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
  const data = await resp.json();
  if (data.ok) console.log(`[${signal.symbol}] Telegram OK`);
  else console.error(`[${signal.symbol}] Telegram erreur: ${data.description}`);
}

async function sendTelegramUnavailable() {
  const text = `⚠️ *BRVM Pre-Ouverture - Sources Indisponibles*\n━━━━━━━━━━━━━━━━━━━━━\nAFX (afx.kwayisi.org) est inaccessible ce matin.\n\n_Aucun signal genere - donnees live introuvables._\n_Reessai automatique demain a 9h35 GMT._`;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
}

async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Erreur: TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID doivent etre definis.');
    process.exit(1);
  }

  // Vérification jour ouvrable — BRVM fermée le weekend
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Dimanche, 6=Samedi
  const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log(`${dayNames[dayOfWeek]} — BRVM fermee. Aucun signal envoye.`);
    return;
  }

  console.log(`BRVM Pre-Open Scanner - ${now.toISOString()} (${dayNames[dayOfWeek]})`);
  console.log(`Budget: ${BUDGET_FCFA.toLocaleString('fr-FR')} FCFA`);
  if (BRVM_WORKER_URL) console.log(`Worker URL: ${BRVM_WORKER_URL}`);

  const { stocks, source } = await fetchLiveStocks();
  if (!stocks.length) {
    console.warn('Toutes les sources inaccessibles.');
    await sendTelegramUnavailable();
    return;
  }
  console.log(`${stocks.length} valeurs chargees depuis "${source}".`);

  const alerts = stocks.map(analyzeSignal).filter(s => s.alert);
  if (!alerts.length) { console.log('Marche calme - aucune alerte envoyee.'); return; }

  console.log(`${alerts.length} alerte(s) - envoi Telegram...`);
  for (const alert of alerts) await sendTelegram(alert, source);
  console.log('Termine.');
}

main().catch(e => { console.error(e); process.exit(1); });
