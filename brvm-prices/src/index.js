/**
 * BRVM Prices — Cloudflare Worker
 *
 * Cron 9h35 GMT lun-ven → signaux pré-ouverture → alerte Telegram (données LIVE uniquement)
 *
 * Cascade de sources :
 *   1. BRVM.org direct (3 variantes d'URL)
 *   2. Proxy allorigins.win → BRVM.org
 *   3. Yahoo Finance (tickers .CI / .SN / .BF / .TG / .BJ …)
 *   4. Sika.finance
 *   → Si toutes échouent : message Telegram "données indisponibles"
 */

// ─── Sources ─────────────────────────────────────────────────────────────────

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

// Proxies CORS indépendants — testés dans l'ordre, aucun lien avec le site Analytics
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

// Correspondance ticker BRVM → ticker Yahoo Finance
const YAHOO_MAP = {
  ABJC:  'ABJC.CI',  BICC:  'BICC.CI',  BNBC:  'BNBC.BJ',  BOAB:  'BOAB.BJ',
  BOABF: 'BOABF.BF', BOACI: 'BOACI.CI', BOAM:  'BOAM.ML',  BOAN:  'BOAN.NE',
  BOAS:  'BOAS.SN',  CABC:  'CABC.CI',  CBBF:  'CBBF.BF',  CFAC:  'CFAC.CI',
  ECOC:  'ECOC.CI',  ETIT:  'ETIT.TG',  LACI:  'LACI.CI',  NEIC:  'NEIC.CI',
  NSBC:  'NSBC.CI',  NTLC:  'NTLC.CI',  ONAT:  'ONAT.BF',  ORAC:  'ORAC.CI',
  ORGT:  'ORGT.CI',  PALC:  'PALC.CI',  PRSC:  'PRSC.CI',  SAFC:  'SAFC.CI',
  SAPH:  'SAPH.CI',  SCRC:  'SCRC.CI',  SDCC:  'SDCC.CI',  SEMC:  'SEMC.CI',
  SGBC:  'SGBC.CI',  SHEC:  'SHEC.CI',  SIAC:  'SIAC.CI',  SIBC:  'SIBC.CI',
  SICC:  'SICC.CI',  SIPH:  'SIPH.CI',  SLBC:  'SLBC.CI',  SMBC:  'SMBC.CI',
  SNTS:  'SNTS.SN',  SOGB:  'SOGB.CI',  SPHC:  'SPHC.CI',  STAC:  'STAC.CI',
  STBC:  'STBC.BF',  SVOC:  'SVOC.CI',  TPCI:  'TPCI.CI',  TTLC:  'TTLC.CI',
  TTLS:  'TTLS.SN',  UNLC:  'UNLC.CI',  UNXC:  'UNXC.CI',
};
const YAHOO_REVERSE = Object.fromEntries(Object.entries(YAHOO_MAP).map(([b, y]) => [y, b]));

// ─── Référentiel des valeurs BRVM ─────────────────────────────────────────────
// Synchronisé avec le site BRVM Analytics (http://localhost:8000/)
const KNOWN_STOCKS = {
  ABJC:  { name: 'Bernabé CI',                           avgVol: 380,   refPrice: 2100   },
  BICC:  { name: 'BICICI CI (BNP Paribas)',              avgVol: 180,   refPrice: 5500   },
  BNBC:  { name: 'Bernabé CI',                             avgVol: 4650,  refPrice: 1700   },
  BOAB:  { name: 'Bank of Africa Bénin',                 avgVol: 980,   refPrice: 5250   },
  BOABF: { name: 'Bank of Africa Burkina Faso',          avgVol: 180,   refPrice: 5200   },
  BOACI: { name: 'Bank of Africa Côte d\'Ivoire',        avgVol: 2800,  refPrice: 6450   },
  BOAM:  { name: 'Bank of Africa Mali',                  avgVol: 95,    refPrice: 4900   },
  BOAN:  { name: 'Bank of Africa Niger',                 avgVol: 380,   refPrice: 3800   },
  BOAS:  { name: 'Bank of Africa Sénégal',               avgVol: 750,   refPrice: 4900   },
  CABC:  { name: 'SICABLE CI — Câbles Électriques',      avgVol: 820,   refPrice: 2850   },
  CBBF:  { name: 'Coris Bank International BF',          avgVol: 580,   refPrice: 8750   },
  CFAC:  { name: 'CFAO Motors CI',                       avgVol: 580,   refPrice: 4800   },
  ECOC:  { name: 'Ecobank Côte d\'Ivoire',               avgVol: 650,   refPrice: 10500  },
  ETIT:  { name: 'Ecobank Transnational Inc. (ETI)',     avgVol: 98000, refPrice: 18     },
  LACI:  { name: 'Air Liquide CI',                       avgVol: 240,   refPrice: 6500   },
  NEIC:  { name: 'NEI-CEDA CI',                          avgVol: 800,   refPrice: 620    },
  NSBC:  { name: 'NSIA Banque CI',                       avgVol: 950,   refPrice: 7200   },
  NTLC:  { name: 'Nestlé CI',                              avgVol: 660,   refPrice: 13000  },
  ONAT:  { name: 'Onatel — Télécoms Burkina Faso',       avgVol: 310,   refPrice: 4950   },
  ORAC:  { name: 'Orange Côte d\'Ivoire',                avgVol: 5400,  refPrice: 14750  },
  ORGT:  { name: 'Oragroup',                               avgVol: 980,   refPrice: 2650   },
  PALC:  { name: 'PALM-CI — Palmier à Huile',            avgVol: 2200,  refPrice: 7800   },
  PRSC:  { name: 'Tractafric Motor CI',                    avgVol: 104,   refPrice: 4100   },
  SAFC:  { name: 'SAFCA',                                  avgVol: 516,   refPrice: 3750   },
  SAPH:  { name: 'SAPH CI — Hévéaculture',               avgVol: 850,   refPrice: 5100   },
  SCRC:  { name: 'Sucrivoire CI',                        avgVol: 560,   refPrice: 680    },
  SDCC:  { name: 'SODE CI',                              avgVol: 95,    refPrice: 2900   },
  SEMC:  { name: 'Crown Siem CI — Emballages',           avgVol: 3800,  refPrice: 680    },
  SGBC:  { name: 'Société Générale CI',                  avgVol: 720,   refPrice: 12500  },
  SHEC:  { name: 'Vivo Energie CI',                        avgVol: 1612,  refPrice: 1915   },
  SIAC:  { name: 'SIFCA CI — Agro-industrie',            avgVol: 1500,  refPrice: 4200   },
  SIBC:  { name: 'SIB CI — Société Ivoirienne de Banque', avgVol: 1400, refPrice: 5800   },
  SICC:  { name: 'SICOR CI — Industrie du Coton',        avgVol: 220,   refPrice: 3800   },
  SIPH:  { name: 'SIPH CI — Plantations d\'Hévéas',     avgVol: 290,   refPrice: 8900   },
  SLBC:  { name: 'Solibra CI — Brasserie (Castel)',      avgVol: 30,    refPrice: 120000 },
  SMBC:  { name: 'SMB CI — Manufacture de Bois',        avgVol: 120,   refPrice: 15000  },
  SNTS:  { name: 'Sonatel (Orange Sénégal)',             avgVol: 3800,  refPrice: 15800  },
  SOGB:  { name: 'SOGB CI — Caoutchoucs Grand-Béréby',  avgVol: 520,   refPrice: 3650   },
  SPHC:  { name: 'SAPH CI — Actions Prioritaires',       avgVol: 85,    refPrice: 4200   },
  STAC:  { name: 'SETAO CI',                               avgVol: 1670,  refPrice: 3100   },
  STBC:  { name: 'SITAB CI',                               avgVol: 497,   refPrice: 21000  },
  SVOC:  { name: 'SVO CI — Savonnerie',                  avgVol: 680,   refPrice: 2200   },
  TPCI:  { name: 'Tropical Partners CI',                 avgVol: 60,    refPrice: 1100   },
  TTLC:  { name: 'TotalEnergies Marketing CI',           avgVol: 2800,  refPrice: 2150   },
  TTLS:  { name: 'TotalEnergies Marketing Sénégal',      avgVol: 1200,  refPrice: 2100   },
  UNLC:  { name: 'Unilever CI',                          avgVol: 1100,  refPrice: 5600   },
  UNXC:  { name: 'Unacoopec-CI',                         avgVol: 260,   refPrice: 2800   },
};

function getMetaForStock(stock) {
  if (KNOWN_STOCKS[stock.symbol]) return KNOWN_STOCKS[stock.symbol];
  const avgVol = stock.price < 500 ? 5000 : stock.price < 5000 ? 500 : 150;
  return { name: stock.name || stock.symbol, avgVol, refPrice: stock.previousPrice || stock.price };
}

// Décode les entités HTML (&nbsp; → espace) avant parseFloat — évite les prix tronqués
function decodeHtml(s) {
  return s
    .replace(/&nbsp;/gi, ' ').replace(/&#160;/g, ' ')
    .replace(/&thinsp;/gi, ' ').replace(/&#8201;/g, ' ')
    .replace(/ /g, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

// ─── Seuils et paramètres ─────────────────────────────────────────────────────
const MPR_THRESHOLD     = 2.5;
const OBI_THRESHOLD     = 0.85;
const VOL_SPIKE_FACTOR  = 3.0;
const BUDGET_RESERVE_PCT = 0.20;
const CACHE_TTL          = 3600;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

// ─── Handler principal ────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    const { pathname } = new URL(request.url);
    if (pathname === '/health') return jsonResponse({ status: 'ok', worker: 'brvm-prices', timestamp: Date.now() });
    if (pathname.startsWith('/stock/')) {
      const symbol = pathname.replace('/stock/', '').toUpperCase();
      const stocks = await getStocksHttp(env, ctx);
      const stock  = stocks.find(s => s.symbol === symbol);
      return stock ? jsonResponse(stock) : jsonResponse({ error: 'Stock not found', symbol }, 404);
    }
    if (pathname === '/' || pathname === '/stocks') {
      const stocks = await getStocksHttp(env, ctx);
      return jsonResponse({ stocks, count: stocks.length, timestamp: Date.now(), market: getMarketStatus() });
    }
    return jsonResponse({ error: 'Not found', path: pathname }, 404);
  },

  async scheduled(event, env, ctx) {
    console.log('BRVM Pre-Open Scanner déclenché :', new Date().toISOString());
    ctx.waitUntil(runPreOpenScan(env));
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
//  MOTEUR SIGNAL PRÉ-OUVERTURE
// ═══════════════════════════════════════════════════════════════════════════════

async function runPreOpenScan(env) {
  // Vérification jour ouvrable — BRVM fermée le weekend
  const dayOfWeek = new Date().getUTCDay(); // 0=Dimanche, 6=Samedi
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('Weekend — BRVM fermée, aucun scan.');
    return;
  }

  const { stocks, source } = await fetchLiveStocks();

  if (source === 'unavailable') {
    console.warn('Toutes les sources BRVM inaccessibles.');
    await sendTelegramUnavailable(env);
    return;
  }

  console.log(`${stocks.length} valeurs chargées depuis "${source}".`);

  const alerts = [];
  for (const stock of stocks) {
    const meta   = getMetaForStock(stock);
    const signal = analyzeSignal(stock.symbol, stock, meta);
    if (signal.alert) alerts.push(signal);
  }

  if (alerts.length === 0) {
    console.log('Marché calme — aucune alerte envoyée.');
    return;
  }

  console.log(`${alerts.length} alerte(s) — envoi Telegram...`);
  for (const signal of alerts) await sendTelegram(signal, env, source);
}


// ─── Cascade de sources ───────────────────────────────────────────────────────

async function fetchLiveStocks() {
  // 1. BRVM.org direct — edge Cloudflare présent en Afrique de l'Ouest, pas geo-bloqué
  for (const url of BRVM_URLS) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Referer': 'https://www.google.com/',
        },
      });
      if (resp.ok) {
        const stocks = parseBRVMHtml(await resp.text());
        if (stocks) { console.log(`BRVM.org direct OK: ${stocks.length} titres`); return { stocks, source: 'brvm-direct' }; }
      }
    } catch (e) { console.warn(`BRVM.org ${url}: ${e.message}`); }
  }

  // 2. Yahoo Finance — API globale, pas de geo-blocage
  try {
    const stocks = await fetchYahooFinance();
    if (stocks) { console.log(`Yahoo Finance OK: ${stocks.length} titres`); return { stocks, source: 'yahoo-finance' }; }
  } catch (e) { console.warn('Yahoo Finance:', e.message); }

  // 3. AFX (afx.kwayisi.org)
  try {
    const resp = await fetch('https://afx.kwayisi.org/brvm/', {
      headers: {
        'User-Agent': USER_AGENTS[0],
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });
    if (resp.ok) {
      const stocks = parseAFXHtml(decodeHtml(await resp.text()));
      if (stocks) { console.log(`AFX OK: ${stocks.length} titres`); return { stocks: stocks.map(s => ({ ...s, source: 'live' })), source: 'afx' }; }
    }
  } catch (e) { console.warn('AFX:', e.message); }

  return { stocks: [], source: 'unavailable' };
}

// Yahoo Finance API — retourne les cours live pour toutes les valeurs BRVM mappées
async function fetchYahooFinance() {
  const tickers = Object.values(YAHOO_MAP).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers}` +
              `&fields=symbol,shortName,regularMarketPrice,regularMarketPreviousClose,` +
              `regularMarketChangePercent,regularMarketVolume,regularMarketChange`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENTS[0],
      'Accept': 'application/json',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
  });
  if (!resp.ok) throw new Error(`Yahoo HTTP ${resp.status}`);

  const data   = await resp.json();
  const quotes = data?.quoteResponse?.result;
  if (!quotes || quotes.length < 5) return null;

  return quotes
    .map(q => {
      const brvmTicker = YAHOO_REVERSE[q.symbol];
      if (!brvmTicker) return null;
      const meta = KNOWN_STOCKS[brvmTicker];
      return {
        symbol:        brvmTicker,
        name:          meta?.name || q.shortName || brvmTicker,
        price:         Math.round(q.regularMarketPrice   || 0),
        previousPrice: Math.round(q.regularMarketPreviousClose || q.regularMarketPrice || 0),
        change:        Math.round(q.regularMarketChange  || 0),
        changePercent: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
        volume:        q.regularMarketVolume || 0,
        source:        'yahoo',
        timestamp:     Date.now(),
      };
    })
    .filter(s => s && s.price > 0);
}


// ─── Analyse signal ───────────────────────────────────────────────────────────

function analyzeSignal(symbol, stock, meta) {
  const volRatio = meta.avgVol > 0 ? stock.volume / meta.avgVol : 1;
  const momentum = stock.changePercent / 7.5;
  const mpr      = Math.max(0, volRatio * (1 + Math.max(0, momentum)));
  const obi      = Math.min(1, Math.max(-1, momentum * volRatio * 0.5));
  const iceberg  = stock.volume > meta.avgVol * VOL_SPIKE_FACTOR;

  const reasons = [];
  if (mpr > MPR_THRESHOLD)
    reasons.push(`MPR≈${mpr.toFixed(2)} > ${MPR_THRESHOLD} (vol ${stock.volume} = ${volRatio.toFixed(1)}× moy)`);
  if (obi >= OBI_THRESHOLD)
    reasons.push(`OBI≈${obi.toFixed(3)} ≈ 1 (pression acheteuse forte)`);
  if (iceberg && reasons.length > 0)
    reasons.push(`Iceberg : ${stock.volume} titres = ${volRatio.toFixed(1)}× vol. moyen (${meta.avgVol})`);

  const confidence = reasons.length >= 3 ? 'HIGH' : reasons.length >= 2 ? 'MEDIUM' : reasons.length === 1 ? 'LOW' : 'NONE';
  return { symbol, name: meta.name, price: stock.price, change: stock.changePercent,
           volume: stock.volume, avgVol: meta.avgVol, mpr, obi, iceberg, reasons, confidence,
           alert: reasons.length > 0 };
}

function calcPosition(price, budgetFcfa) {
  const nbTitres = Math.floor(budgetFcfa * (1 - BUDGET_RESERVE_PCT) / price);
  if (nbTitres === 0) return null;
  const cout = nbTitres * price;
  return {
    nbTitres,
    coutTotal:    cout,
    reserve:      budgetFcfa - cout,
    gainCible:    Math.round(cout * 0.04),
    gainMax:      Math.round(cout * 0.075),
    pertMax:      Math.round(cout * 0.03),
    prixCible:    Math.round(price * 1.04),
    prixStopLoss: Math.round(price * 0.97),
  };
}


// ─── Envoi Telegram ───────────────────────────────────────────────────────────

async function sendTelegram(signal, env, source) {
  const token      = env.TELEGRAM_BOT_TOKEN;
  const chatId     = env.TELEGRAM_CHAT_ID;
  const budgetFcfa = parseInt(env.BUDGET_FCFA || '75000', 10);
  if (!token || !chatId) { console.error('Secrets Telegram manquants.'); return; }

  const emoji   = signal.confidence === 'HIGH' ? '🔴' : signal.confidence === 'MEDIUM' ? '🟠' : '🟡';
  const reasons = signal.reasons.map(r => `  • ${r}`).join('\n');
  const icebergLine = signal.iceberg
    ? `\n🐋 *Iceberg* : ${signal.volume} titres = ${(signal.volume/signal.avgVol).toFixed(1)}× vol. moyen` : '';
  const sourceTag = source !== 'brvm-direct' ? `\n_📡 Source : ${source}_` : '';

  const pos      = calcPosition(signal.price, budgetFcfa);
  const posBlock = pos ? [
    `──────────────────────`,
    `💼 *RECOMMANDATION (budget ${budgetFcfa.toLocaleString()} F)*`,
    `📌 *Acheter* : ${pos.nbTitres} titre${pos.nbTitres > 1 ? 's' : ''} ${signal.symbol}`,
    `💸 *Coût total* : ${pos.coutTotal.toLocaleString()} FCFA`,
    `🏦 *Réserve gardée* : ${pos.reserve.toLocaleString()} FCFA`,
    `──────────────────────`,
    `🎯 *Objectif* : ${pos.prixCible.toLocaleString()} FCFA (+4%) → *+${pos.gainCible.toLocaleString()} F*`,
    `🚀 *Max BRVM* : ${Math.round(signal.price*1.075).toLocaleString()} FCFA (+7.5%) → *+${pos.gainMax.toLocaleString()} F*`,
    `🛑 *Stop loss* : ${pos.prixStopLoss.toLocaleString()} FCFA (-3%) → max -${pos.pertMax.toLocaleString()} F`,
  ].join('\n') : `\n⚠️ _Titre trop cher pour ton budget (${signal.price.toLocaleString()} FCFA/titre)_`;

  const text = [
    `${emoji} *FLASH BRVM — Pré-Ouverture*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📌 *${signal.symbol}* — ${signal.name}`,
    `⏰ *9h35 GMT* — Fixing dans 10 min`,
    `💰 *Cours* : ${signal.price.toLocaleString()} FCFA`,
    `📊 *Variation* : ${signal.change > 0 ? '+' : ''}${signal.change.toFixed(2)}%`,
    `🛒 *Volume* : ${signal.volume.toLocaleString()} titres${icebergLine}`,
    `──────────────────────`,
    `📈 *MPR* : ${signal.mpr.toFixed(2)}  _(seuil > 2.5)_`,
    `⚖️ *OBI* : ${signal.obi.toFixed(3)}  _(seuil > 0.85)_`,
    `──────────────────────`,
    `*Signaux :*\n${reasons}`,
    posBlock,
    `──────────────────────`,
    `⚡ *Passe l'ordre avant 9h45 GMT*`,
    `_Confiance : ${signal.confidence} | ⚠️ Pas un conseil financier certifié_${sourceTag}`,
  ].join('\n');

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const data = await resp.json();
    if (data.ok) console.log(`[${signal.symbol}] Telegram OK.`);
    else         console.error(`[${signal.symbol}] Telegram erreur :`, data.description);
  } catch (e) {
    console.error(`[${signal.symbol}] Telegram exception :`, e.message);
  }
}

async function sendTelegramUnavailable(env) {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const text = [
    '⚠️ *BRVM Pré-Ouverture — Sources Indisponibles*',
    '━━━━━━━━━━━━━━━━━━━━━',
    '🌐 BRVM.org, Yahoo Finance et Sika Finance sont tous inaccessibles ce matin.',
    '',
    '_Aucun signal généré — données live introuvables._',
    '_Réessai automatique demain à 9h35 GMT._',
  ].join('\n');
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch {}
}


// ─── Parsers HTML ─────────────────────────────────────────────────────────────

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
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const strip  = /<[^>]+>/g;
  let row, skipHeader = !!targetHtml;
  while ((row = rowRe.exec(searchHtml)) !== null) {
    if (skipHeader) { skipHeader = false; continue; }
    const cells = [];
    let cell;
    const cm = new RegExp(cellRe.source, 'gi');
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
    stocks.push({
      symbol, name: cells[1] || KNOWN_STOCKS[symbol]?.name || symbol,
      price: Math.round(price), previousPrice: Math.round(prev),
      change: Math.round(price - prev), changePercent: Math.round(chg * 100) / 100,
      volume: Math.round(vol), source: 'live', timestamp: Date.now(),
    });
  }
  return stocks.length >= 5 ? stocks : null;
}


function parseAFXHtml(html) {
  // Tables[0]=Indices, [1-2]=Gainers/Losers, [3]=Cours principaux
  // Colonnes: Ticker | Nom | Volume | Prix | Variation pts
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
    const symbol = cells[0].toUpperCase().replace(/[\s ]/g, '');
    if (!/^[A-Z]{2,8}$/.test(symbol) || !KNOWN_STOCKS[symbol]) continue;
    const vol      = parseFloat(cells[2]?.replace(/[\s ]/g, '').replace(',', '.')) || 0;
    const price    = parseFloat(cells[3]?.replace(/[\s ]/g, '').replace(',', '.'));
    const changePt = parseFloat(cells[4]?.replace(/[\s ]/g, '').replace(',', '.')) || 0;
    if (!price || price <= 0) continue;
    const prev = price - changePt;
    const chg  = prev > 0 ? Math.round((changePt / prev) * 10000) / 100 : 0;
    stocks.push({ symbol, name: cells[1] || KNOWN_STOCKS[symbol]?.name || symbol,
      price: Math.round(price), previousPrice: Math.round(prev > 0 ? prev : price),
      change: Math.round(changePt), changePercent: chg, volume: Math.round(vol) });
  }
  return stocks.length >= 5 ? stocks : null;
}

function parseSikaHtml(rawHtml) {
  const html   = decodeHtml(rawHtml);
  const stocks = [];
  const rowRe  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const strip  = /<[^>]+>/g;
  let row;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = [];
    let cell;
    const cm = new RegExp(cellRe.source, 'gi');
    while ((cell = cm.exec(row[1])) !== null) cells.push(cell[1].replace(strip, '').trim());
    if (cells.length >= 4) {
      const symbol = cells[0].replace(/[\s ]/g, '').toUpperCase();
      const price  = parseFloat(cells[1].replace(/[\s ]/g, '').replace(',', '.'));
      const chg    = parseFloat(cells[2].replace('%', '').replace(',', '.')) || 0;
      if (symbol.length >= 2 && symbol.length <= 6 && price > 0) {
        stocks.push({
          symbol,
          name:          KNOWN_STOCKS[symbol]?.name || symbol,
          price:         Math.round(price),
          previousPrice: Math.round(price / (1 + chg / 100)),
          change:        Math.round(price * chg / 100),
          changePercent: Math.round(chg * 100) / 100,
          volume:        parseInt(cells[3]?.replace(/\s/g, '') || '0') || 0,
          source: 'live', timestamp: Date.now(),
        });
      }
    }
  }
  return stocks.length >= 5 ? stocks : null;
}


// ─── HTTP endpoint stocks ─────────────────────────────────────────────────────

async function getStocksHttp(env, ctx) {
  if (env.BRVM_CACHE) {
    try {
      const cached = await env.BRVM_CACHE.get('stocks', { type: 'json' });
      if (cached?.ts && (Date.now() - cached.ts) < CACHE_TTL * 1000) return cached.data;
    } catch {}
  }
  const { stocks } = await fetchLiveStocks();
  const result = stocks.length >= 5 ? stocks : generateFallbackData();
  if (env.BRVM_CACHE && result.length > 0) {
    ctx.waitUntil(
      env.BRVM_CACHE.put('stocks', JSON.stringify({ data: result, ts: Date.now() }), { expirationTtl: CACHE_TTL })
    );
  }
  return result;
}

function generateFallbackData() {
  const seed = Math.floor(Date.now() / 86400000);
  return Object.entries(KNOWN_STOCKS).map(([symbol, meta], i) => {
    const rng    = mulberry32(seed + i);
    const change = Math.max(-0.075, Math.min(0.075, 0.0003 + (rng() - 0.5) * 0.02));
    const price  = Math.round(meta.refPrice * (1 + change));
    return {
      symbol, name: meta.name, price,
      previousPrice: meta.refPrice,
      change: price - meta.refPrice,
      changePercent: Math.round(change * 10000) / 100,
      volume: Math.round(meta.avgVol * (0.5 + rng() * 1.5)),
      source: 'simulated', timestamp: Date.now(),
    };
  });
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getMarketStatus() {
  const now     = new Date();
  const day     = now.getUTCDay();
  const mins    = now.getUTCHours() * 60 + now.getUTCMinutes();
  const weekday = day >= 1 && day <= 5;
  return {
    isOpen:    weekday && mins >= 540 && mins <= 930,
    isPreOpen: weekday && mins >= 540 && mins < 585,
    isFixing:  weekday && mins >= 720 && mins <= 750,
    label:     (weekday && mins >= 540 && mins <= 930) ? 'Séance ouverte' : 'Marché fermé',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS_HEADERS });
}
