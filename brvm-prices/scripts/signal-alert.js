#!/usr/bin/env node
// BRVM Pre-Open Signal Alert - GitHub Actions Node.js script

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const BUDGET_FCFA        = parseInt(process.env.BUDGET_FCFA || '75000', 10);

const BRVM_URLS = [
  'https://www.brvm.org/fr/cours-des-actions/0/all',
  'https://www.brvm.org/fr/cours0/0/all',
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
const YAHOO_REVERSE = Object.fromEntries(Object.entries(YAHOO_MAP).map(([b,y]) => [y,b]));

const KNOWN_STOCKS = {
  ABJC: { name:'Bernabe CI',                           avgVol:380,   refPrice:2100   },
  BICC: { name:'BICICI CI (BNP Paribas)',              avgVol:180,   refPrice:5500   },
  BNBC: { name:'Brasseries du Benin',                  avgVol:95,    refPrice:3800   },
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
  NTLC: { name:'Filtisac CI',                          avgVol:720,   refPrice:1850   },
  ONAT: { name:'Onatel Telecoms Burkina Faso',         avgVol:310,   refPrice:4950   },
  ORAC: { name:'Orange Cote Ivoire',                   avgVol:5400,  refPrice:14750  },
  ORGT: { name:'Orange CI',                            avgVol:5200,  refPrice:11500  },
  PALC: { name:'PALM-CI Palmier Huile',                avgVol:2200,  refPrice:7800   },
  PRSC: { name:'Prestige Assurances CI',               avgVol:450,   refPrice:3200   },
  SAFC: { name:'SAPH CI Plantations Heveas',           avgVol:850,   refPrice:5100   },
  SAPH: { name:'SAPH CI Heveas',                       avgVol:850,   refPrice:5100   },
  SCRC: { name:'Sucrivoire CI',                        avgVol:560,   refPrice:680    },
  SDCC: { name:'SODE CI',                              avgVol:95,    refPrice:2900   },
  SEMC: { name:'Crown Siem CI Emballages',             avgVol:3800,  refPrice:680    },
  SGBC: { name:'Societe Generale CI',                  avgVol:720,   refPrice:12500  },
  SHEC: { name:'Societe Hevea CI',                     avgVol:75,    refPrice:4100   },
  SIAC: { name:'SIFCA CI Agro-industrie',              avgVol:1500,  refPrice:4200   },
  SIBC: { name:'SIB CI Societe Ivoirienne Banque',     avgVol:1400,  refPrice:5800   },
  SICC: { name:'SICOR CI Industrie Coton',             avgVol:220,   refPrice:3800   },
  SIPH: { name:'SIPH CI Plantations Heveas',           avgVol:290,   refPrice:8900   },
  SLBC: { name:'Solibra CI Brasserie Castel',          avgVol:30,    refPrice:120000 },
  SMBC: { name:'SMB CI Manufacture Bois',              avgVol:120,   refPrice:15000  },
  SNTS: { name:'Sonatel Orange Senegal',               avgVol:3800,  refPrice:15800  },
  SOGB: { name:'SOGB CI Caoutchoucs',                  avgVol:520,   refPrice:3650   },
  SPHC: { name:'SAPH CI Actions Prioritaires',         avgVol:85,    refPrice:4200   },
  STAC: { name:'SITAB CI British American Tobacco',    avgVol:340,   refPrice:21000  },
  STBC: { name:'SGB-BF Societe Generale Burkina',      avgVol:340,   refPrice:5300   },
  SVOC: { name:'SVO CI Savonnerie',                    avgVol:680,   refPrice:2200   },
  TPCI: { name:'Tropical Partners CI',                 avgVol:60,    refPrice:1100   },
  TTLC: { name:'TotalEnergies Marketing CI',           avgVol:2800,  refPrice:2150   },
  TTLS: { name:'TotalEnergies Marketing Senegal',      avgVol:1200,  refPrice:2100   },
  UNLC: { name:'Unilever CI',                          avgVol:1100,  refPrice:5600   },
  UNXC: { name:'Unacoopec-CI',                         avgVol:260,   refPrice:2800   },
};

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

// CORS proxies pour contourner le blocage géographique depuis GitHub Actions (US)
const BRVM_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

// Headers Chrome complets pour contourner Cloudflare
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

async function fetchLiveStocks() {
  // 1. FluxBourse (source principale demandee par l'utilisateur)
  try {
    const stocks = await fetchFluxBourse();
    if (stocks) { console.log(`Source: fluxbourse (${stocks.length} titres)`); return { stocks, source: 'fluxbourse' }; }
  } catch (e) { console.warn('FluxBourse:', e.message); }

  // 2. BRVM.org direct
  for (const url of BRVM_URLS) {
    try {
      const resp = await fetchWithTimeout(url, { headers: CHROME_HEADERS });
      console.log(`brvm-direct ${url.split('/').pop()}: HTTP ${resp.status}`);
      if (resp.ok) {
        const html = await resp.text();
        console.log(`brvm-direct: ${html.length} bytes, contient ETIT: ${html.includes('ETIT')}`);
        const stocks = parseBRVMHtml(html);
        if (stocks) { console.log(`Source: brvm-direct (${stocks.length} titres)`); return { stocks, source: 'brvm-direct' }; }
        console.warn('brvm-direct: HTML recu mais table non parsee');
      }
    } catch (e) { console.warn(`brvm-direct (${url.split('/').pop()}):`, e.message); }
  }

  // 3. BRVM.org via proxies
  for (const proxy of BRVM_PROXIES) {
    const proxyHost = proxy.split('/')[2];
    try {
      const resp = await fetchWithTimeout(proxy + encodeURIComponent(BRVM_URLS[0]), {
        headers: { 'Accept': 'text/html', 'User-Agent': USER_AGENTS[0] },
      });
      console.log(`proxy ${proxyHost}: HTTP ${resp.status}`);
      if (resp.ok) {
        const html = await resp.text();
        console.log(`proxy ${proxyHost}: ${html.length} bytes, contient ETIT: ${html.includes('ETIT')}`);
        const stocks = parseBRVMHtml(html);
        if (stocks) { console.log(`Source: brvm-proxy (${proxyHost}, ${stocks.length} titres)`); return { stocks, source: 'brvm-proxy' }; }
        console.warn(`proxy ${proxyHost}: HTML recu mais table non parsee`);
      }
    } catch (e) { console.warn(`proxy ${proxyHost}:`, e.message); }
  }

  // 4. Yahoo Finance avec crumb (obligatoire depuis 2024)
  try {
    const stocks = await fetchYahooFinance();
    if (stocks) { console.log(`Source: yahoo-finance (${stocks.length} titres)`); return { stocks, source: 'yahoo-finance' }; }
  } catch (e) { console.warn('Yahoo Finance:', e.message); }

  // 5. Africabourse.net
  try {
    const stocks = await fetchAfricabourse();
    if (stocks) { console.log(`Source: africabourse (${stocks.length} titres)`); return { stocks, source: 'africabourse' }; }
  } catch (e) { console.warn('Africabourse:', e.message); }

  // 6. Sika Finance
  try {
    const resp = await fetchWithTimeout('https://sika.finance/bourse/brvm/cours', {
      headers: { ...CHROME_HEADERS, 'Accept-Language': 'fr-FR,fr;q=0.9' },
    });
    console.log(`sika-finance: HTTP ${resp.status}`);
    if (resp.ok) {
      const html = await resp.text();
      console.log(`sika-finance: ${html.length} bytes`);
      const stocks = parseSikaHtml(html);
      if (stocks) { console.log(`Source: sika-finance (${stocks.length} titres)`); return { stocks, source: 'sika-finance' }; }
      console.warn('sika-finance: HTML recu mais table non parsee');
    }
  } catch (e) { console.warn('Sika Finance:', e.message); }

  return { stocks: [], source: 'unavailable' };
}

async function fetchFluxBourse() {
  // Pages candidates sur fluxbourse.com
  const urls = [
    'https://fluxbourse.com/',
    'https://fluxbourse.com/cours',
    'https://fluxbourse.com/cours-brvm',
    'https://fluxbourse.com/bourse',
    'https://fluxbourse.com/marche',
    'https://fluxbourse.com/cotations',
    'https://fluxbourse.com/actions-brvm',
  ];

  // Tentative directe avec headers Chrome complets
  for (const url of urls) {
    try {
      const resp = await fetchWithTimeout(url, { headers: CHROME_HEADERS });
      const slug = url.replace('https://fluxbourse.com', '') || '/';
      console.log(`fluxbourse${slug}: HTTP ${resp.status}`);
      if (!resp.ok) continue;
      const html = await resp.text();
      const hasData = html.includes('ETIT') || html.includes('SNTS') || html.includes('SGBC') || html.includes('ORAC');
      console.log(`fluxbourse${slug}: ${html.length} bytes, donnees BRVM: ${hasData}`);
      if (hasData) {
        // Essai 1: donnees Next.js (__NEXT_DATA__)
        const stocks = parseNextData(html) || parseBRVMHtml(html) || parseSikaHtml(html);
        if (stocks?.length >= 1) return stocks;
        console.warn(`fluxbourse${slug}: donnees detectees mais non parsees, debut: ${html.substring(0, 400)}`);
      } else {
        // Meme si pas de symbole connu, log le debut pour diagnostic
        console.log(`fluxbourse${slug}: debut HTML: ${html.substring(0, 300)}`);
      }
    } catch (e) { console.warn(`fluxbourse (${url.split('/').pop() || '/'}):`, e.message); }
  }

  // Endpoints API JSON potentiels
  const apiUrls = [
    'https://fluxbourse.com/api/cours',
    'https://fluxbourse.com/api/brvm/cours',
    'https://fluxbourse.com/api/v1/stocks',
    'https://fluxbourse.com/api/stocks',
    'https://fluxbourse.com/api/cotations',
  ];
  for (const url of apiUrls) {
    try {
      const resp = await fetchWithTimeout(url, {
        headers: { ...CHROME_HEADERS, 'Accept': 'application/json, */*', 'Referer': 'https://fluxbourse.com/', 'Origin': 'https://fluxbourse.com' },
      });
      console.log(`fluxbourse-api (${url.split('/').slice(3).join('/')}): HTTP ${resp.status}`);
      if (!resp.ok) continue;
      const text = await resp.text();
      console.log(`fluxbourse-api: ${text.length} bytes, debut: ${text.substring(0, 200)}`);
      const stocks = parseJsonStocks(text);
      if (stocks?.length >= 1) return stocks;
    } catch (e) { console.warn(`fluxbourse-api (${url.split('/').slice(3).join('/')}):`, e.message); }
  }

  // Tentative via proxies CORS
  for (const proxy of BRVM_PROXIES) {
    const proxyHost = proxy.split('/')[2];
    try {
      const resp = await fetchWithTimeout(proxy + encodeURIComponent('https://fluxbourse.com/'), {
        headers: { 'Accept': 'text/html', 'User-Agent': USER_AGENTS[0] },
      });
      console.log(`fluxbourse via ${proxyHost}: HTTP ${resp.status}`);
      if (!resp.ok) continue;
      const html = await resp.text();
      const hasData = html.includes('ETIT') || html.includes('SNTS') || html.includes('SGBC');
      console.log(`fluxbourse via ${proxyHost}: ${html.length} bytes, donnees BRVM: ${hasData}`);
      if (hasData) {
        const stocks = parseNextData(html) || parseBRVMHtml(html);
        if (stocks?.length >= 1) return stocks;
      }
    } catch (e) { console.warn(`fluxbourse via ${proxyHost}:`, e.message); }
  }

  return null;
}

// Extrait les donnees des apps Next.js (champ __NEXT_DATA__ dans le HTML)
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

// Parse un tableau JSON generique en liste de stocks
function parseJsonArray(arr) {
  const stocks = arr.map(item => {
    const symbol = (item.symbol || item.ticker || item.code || item.symbole || '').toUpperCase().replace(/\s/g,'');
    const price = parseFloat(item.price || item.cours || item.lastPrice || item.close || item.dernier || 0);
    if (!symbol || symbol.length < 2 || symbol.length > 6 || price <= 0) return null;
    const chg = parseFloat(item.changePercent || item.variation || item.change_pct || item.var || 0);
    const prev = price / (1 + chg / 100);
    return { symbol, name: KNOWN_STOCKS[symbol]?.name || item.name || item.libelle || symbol,
             price: Math.round(price), previousPrice: Math.round(prev),
             change: Math.round(price - prev), changePercent: Math.round(chg * 100) / 100,
             volume: parseInt(item.volume || item.vol || 0) };
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

  // Obtenir les cookies Yahoo Finance (nécessaire pour le crumb depuis 2024)
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

  // Obtenir le crumb Yahoo Finance
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
    // Fallback sans crumb
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
      console.log(`${label}: ${quotes?.length || 0} tickers retournes`);
      if (!quotes || !quotes.length) {
        console.warn(`${label}: result vide, erreur=${JSON.stringify(data?.quoteResponse?.error)}`);
        continue;
      }
      const stocks = quotes.map(q => {
        const sym = YAHOO_REVERSE[q.symbol];
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

function parseBRVMHtml(html) {
  const stocks = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const strip = /<[^>]+>/g;
  let row;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = [];
    const cm = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cm.exec(row[1])) !== null) cells.push(cell[1].replace(strip, '').trim());
    if (cells.length < 5) continue;
    const symbol = cells[0].toUpperCase().replace(/\s/g, '');
    const price  = parseFloat(cells[2].replace(/[\s ]/g, '').replace(',', '.'));
    const chg    = parseFloat(cells[4].replace('%','').replace(/[\s ]/g,'').replace(',','.')) || 0;
    if (symbol.length >= 2 && symbol.length <= 6 && price > 0 && KNOWN_STOCKS[symbol]) {
      const prev = price / (1 + chg / 100);
      stocks.push({ symbol, name: KNOWN_STOCKS[symbol]?.name || symbol,
        price: Math.round(price), previousPrice: Math.round(prev),
        change: Math.round(price - prev), changePercent: Math.round(chg * 100) / 100,
        volume: parseInt(cells[5]?.replace(/[\s ]/g,'') || '0') || 0 });
    }
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
  const text = `⚠️ *BRVM Pre-Ouverture - Sources Indisponibles*\n━━━━━━━━━━━━━━━━━━━━━\nBRVM.org, Yahoo Finance et Sika Finance sont inaccessibles ce matin.\n\n_Aucun signal genere - donnees live introuvables._\n_Reessai automatique demain a 9h35 GMT._`;
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
  console.log(`BRVM Pre-Open Scanner - ${new Date().toISOString()}`);
  console.log(`Budget: ${BUDGET_FCFA.toLocaleString('fr-FR')} FCFA`);
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
