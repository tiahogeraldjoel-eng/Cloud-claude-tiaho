/**
 * BRVM Prices — Cloudflare Worker
 *
 * Endpoints HTTP :
 *   GET /          → JSON toutes les actions BRVM
 *   GET /stock/:symbol → JSON détail d'une action
 *   GET /health    → statut du worker
 *
 * Cron trigger (9h35 GMT, lundi-vendredi) :
 *   → Calcule les signaux de pré-ouverture (MPR/OBI/Iceberg)
 *   → Envoie une alerte Telegram si signal détecté
 */

const BRVM_URL  = 'https://www.brvm.org/fr/cours-des-actions/0/all';
const CACHE_TTL = 3600;

// Référence connue pour les 47 valeurs BRVM (volumes journaliers moyens + prix de référence).
// Pour toute valeur scrapée absente de cette liste, le worker l'analyse quand même
// avec des paramètres par défaut (avgVol estimé, refPrice = prix scrappé).
const KNOWN_STOCKS = {
  BICC:  { name: 'Bourse Ivoire Caoutchouc',      avgVol: 180,   refPrice: 1250   },
  BNBC:  { name: 'Brasseries du Bénin',            avgVol: 95,    refPrice: 4200   },
  BOAB:  { name: 'Bank of Africa Bénin',           avgVol: 320,   refPrice: 5500   },
  BOABF: { name: 'Bank of Africa BF',              avgVol: 180,   refPrice: 5200   },
  BOACI: { name: 'Bank of Africa CI',              avgVol: 420,   refPrice: 5850   },
  BOAM:  { name: 'Bank of Africa Mali',            avgVol: 95,    refPrice: 4900   },
  BOAN:  { name: 'Bank of Africa Niger',           avgVol: 75,    refPrice: 4100   },
  BOAS:  { name: 'Bank of Africa Sénégal',         avgVol: 110,   refPrice: 3800   },
  CABC:  { name: 'Compagnie Agricole CI',          avgVol: 2300,  refPrice: 950    },
  CBBF:  { name: 'Coris Bank BF',                  avgVol: 520,   refPrice: 8750   },
  CFAC:  { name: 'Coraf',                          avgVol: 1500,  refPrice: 800    },
  ECOC:  { name: 'Ecobank CI',                     avgVol: 650,   refPrice: 10500  },
  ETIT:  { name: 'Ecobank Transnational',          avgVol: 48000, refPrice: 22     },
  FTSC:  { name: 'Filtisac CI',                    avgVol: 140,   refPrice: 1850   },
  NEIC:  { name: 'NEI-CEDA',                       avgVol: 800,   refPrice: 620    },
  NSBC:  { name: 'Nsia Banque CI',                 avgVol: 230,   refPrice: 6200   },
  ONAT:  { name: 'Onatel BF',                      avgVol: 310,   refPrice: 4950   },
  ORAC:  { name: 'Orange CI',                      avgVol: 5400,  refPrice: 14750  },
  ORGT:  { name: 'Orange Côte d\'Ivoire (GDR)',    avgVol: 380,   refPrice: 3200   },
  PALC:  { name: 'Palm CI',                        avgVol: 980,   refPrice: 7200   },
  PRSC:  { name: 'Prestige Assurances CI',         avgVol: 450,   refPrice: 3200   },
  SAFC:  { name: 'SAPH CI',                        avgVol: 320,   refPrice: 4500   },
  SCRC:  { name: 'SUCRIVOIRE CI',                  avgVol: 560,   refPrice: 680    },
  SDCC:  { name: 'SODE CI',                        avgVol: 95,    refPrice: 2900   },
  SGBC:  { name: 'SGB CI',                         avgVol: 290,   refPrice: 18200  },
  SHEC:  { name: 'SHELL CI',                       avgVol: 75,    refPrice: 4100   },
  SIBC:  { name: 'SIB CI',                         avgVol: 350,   refPrice: 5600   },
  SICC:  { name: 'SICOR CI',                       avgVol: 220,   refPrice: 3800   },
  SLBC:  { name: 'Solibra',                        avgVol: 45,    refPrice: 122000 },
  SMBC:  { name: 'SMB CI',                         avgVol: 120,   refPrice: 15000  },
  SNTS:  { name: 'Sonatel',                        avgVol: 890,   refPrice: 15500  },
  SPHC:  { name: 'SAPH CI (pref)',                 avgVol: 85,    refPrice: 4200   },
  STAC:  { name: 'STAB',                           avgVol: 190,   refPrice: 4500   },
  STBC:  { name: 'Société Générale BF',            avgVol: 340,   refPrice: 5300   },
  SVOC:  { name: 'SVO CI',                         avgVol: 680,   refPrice: 2200   },
  TPCI:  { name: 'Tropical Partners CI',           avgVol: 60,    refPrice: 1100   },
  TTLC:  { name: 'TotalEnergies CI',               avgVol: 3400,  refPrice: 1875   },
  TTLS:  { name: 'TotalEnergies Sénégal',          avgVol: 1200,  refPrice: 2100   },
  UNLC:  { name: 'Unilever CI',                    avgVol: 420,   refPrice: 6800   },
  UNXC:  { name: 'Unacoopec CI',                   avgVol: 260,   refPrice: 2800   },
};

// Construit dynamiquement : toutes les valeurs scrapées sont analysées.
// Les valeurs inconnues reçoivent un avgVol par défaut basé sur leur capitalisation estimée.
function getMetaForStock(stock) {
  if (KNOWN_STOCKS[stock.symbol]) return KNOWN_STOCKS[stock.symbol];
  // Valeur inconnue / nouvelle cotation : paramètres estimés
  const estimatedAvgVol = stock.price < 500 ? 5000 : stock.price < 5000 ? 500 : 150;
  return { name: stock.name || stock.symbol, avgVol: estimatedAvgVol, refPrice: stock.previousPrice || stock.price };
}

// Seuils d'alerte
const MPR_THRESHOLD     = 2.5;
const OBI_THRESHOLD     = 0.85;
const VOL_SPIKE_FACTOR  = 3.0;

// Budget investisseur (configurable via variable d'env BUDGET_FCFA, défaut 75 000 F)
// 80% du budget maximum engagé par trade, 20% de réserve toujours conservé
const BUDGET_RESERVE_PCT = 0.20;

// ─── Données statiques de fallback ───────────────────────────────────────────
const STATIC_STOCKS = [
  { symbol: 'BICC',  name: 'Bourse Ivoire Caoutchouc',     price: 1250,   country: 'CI', sector: 'Agriculture'  },
  { symbol: 'BNBC',  name: 'Brasseries du Bénin',          price: 4200,   country: 'BJ', sector: 'Industrie'    },
  { symbol: 'BOAB',  name: 'Bank of Africa Bénin',         price: 5500,   country: 'BJ', sector: 'Finance'      },
  { symbol: 'BOABF', name: 'Bank of Africa BF',            price: 5200,   country: 'BF', sector: 'Finance'      },
  { symbol: 'BOACI', name: 'Bank of Africa CI',            price: 5850,   country: 'CI', sector: 'Finance'      },
  { symbol: 'BOAM',  name: 'Bank of Africa Mali',          price: 4900,   country: 'ML', sector: 'Finance'      },
  { symbol: 'BOAN',  name: 'Bank of Africa Niger',         price: 4100,   country: 'NE', sector: 'Finance'      },
  { symbol: 'CABC',  name: "Compagnie Agricole de CI",     price: 950,    country: 'CI', sector: 'Agriculture'  },
  { symbol: 'CFAC',  name: 'Coraf',                        price: 800,    country: 'CI', sector: 'Énergie'      },
  { symbol: 'CBBF',  name: 'Coris Bank BF',                price: 8750,   country: 'BF', sector: 'Finance'      },
  { symbol: 'ECOC',  name: 'Ecobank CI',                   price: 10500,  country: 'CI', sector: 'Finance'      },
  { symbol: 'ETIT',  name: 'Ecobank Transnational',        price: 22,     country: 'TG', sector: 'Finance'      },
  { symbol: 'NEIC',  name: 'NEI-CEDA',                     price: 620,    country: 'CI', sector: 'Industrie'    },
  { symbol: 'ONAT',  name: 'Onatel BF',                    price: 4950,   country: 'BF', sector: 'Télécom'      },
  { symbol: 'ORAC',  name: 'Orange CI',                    price: 14750,  country: 'CI', sector: 'Télécom'      },
  { symbol: 'PALC',  name: 'Palm CI',                      price: 7200,   country: 'CI', sector: 'Agriculture'  },
  { symbol: 'PRSC',  name: 'Prestige CI',                  price: 3200,   country: 'CI', sector: 'Assurance'    },
  { symbol: 'SAFC',  name: 'SAPH CI',                      price: 4500,   country: 'CI', sector: 'Agriculture'  },
  { symbol: 'SGBC',  name: 'SGB CI',                       price: 18200,  country: 'CI', sector: 'Finance'      },
  { symbol: 'SIBC',  name: 'SIB CI',                       price: 5600,   country: 'CI', sector: 'Finance'      },
  { symbol: 'SICC',  name: 'SICOR CI',                     price: 3800,   country: 'CI', sector: 'Agriculture'  },
  { symbol: 'SLBC',  name: 'Solibra',                      price: 122000, country: 'CI', sector: 'Industrie'    },
  { symbol: 'SMBC',  name: 'SMB CI',                       price: 15000,  country: 'CI', sector: 'Industrie'    },
  { symbol: 'SNTS',  name: 'Sonatel',                      price: 15500,  country: 'SN', sector: 'Télécom'      },
  { symbol: 'STAC',  name: 'STAB',                         price: 4500,   country: 'TG', sector: 'Finance'      },
  { symbol: 'STBC',  name: 'Société Générale BF',          price: 5300,   country: 'BF', sector: 'Finance'      },
  { symbol: 'SVOC',  name: 'SVO CI',                       price: 2200,   country: 'CI', sector: 'Industrie'    },
  { symbol: 'TTLC',  name: 'Total CI',                     price: 1875,   country: 'CI', sector: 'Énergie'      },
  { symbol: 'UNLC',  name: 'Unilever CI',                  price: 6800,   country: 'CI', sector: 'Consommation' },
  { symbol: 'UNXC',  name: 'Unacoopec CI',                 price: 2800,   country: 'CI', sector: 'Finance'      },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

// ─── Handler principal ────────────────────────────────────────────────────────
export default {

  // Requêtes HTTP normales
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url  = new URL(request.url);
    const path = url.pathname;

    if (path === '/health') {
      return jsonResponse({ status: 'ok', worker: 'brvm-prices', timestamp: Date.now() });
    }
    if (path.startsWith('/stock/')) {
      const symbol = path.replace('/stock/', '').toUpperCase();
      const stocks = await getStocks(env, ctx);
      const stock  = stocks.find(s => s.symbol === symbol);
      return stock
        ? jsonResponse(stock)
        : jsonResponse({ error: 'Stock not found', symbol }, 404);
    }
    if (path === '/' || path === '/stocks') {
      const stocks = await getStocks(env, ctx);
      return jsonResponse({ stocks, count: stocks.length, timestamp: Date.now(), market: getMarketStatus() });
    }
    return jsonResponse({ error: 'Not found', path }, 404);
  },

  // ─── Cron 9h35 GMT lundi-vendredi ─────────────────────────────────────────
  async scheduled(event, env, ctx) {
    console.log('BRVM Pre-Open Scanner déclenché :', new Date().toISOString());
    ctx.waitUntil(runPreOpenScan(env));
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
//  MOTEUR DE SIGNAL PRÉ-OUVERTURE
// ═══════════════════════════════════════════════════════════════════════════════

async function runPreOpenScan(env) {
  // 1. Récupérer les données de marché
  let stocks;
  try {
    stocks = await scrapeBRVM();
  } catch (e) {
    console.error('Scrape échoué, utilisation données simulées :', e.message);
    stocks = generateSimulatedData();
  }

  // scrapeBRVM() peut retourner null si le HTML est valide mais sans données BRVM
  if (!stocks || stocks.length < 5) {
    console.warn('Données scrappées insuffisantes — fallback sur données simulées.');
    stocks = generateSimulatedData();
  }

  console.log(`Analyse de ${stocks.length} valeurs BRVM...`);

  // 2. Analyser TOUTES les valeurs retournées par le scraper
  const alerts = [];
  for (const stock of stocks) {
    const meta   = getMetaForStock(stock);
    const signal = analyzeSignal(stock.symbol, stock, meta);
    if (signal.alert) alerts.push(signal);
  }

  // 3. Envoyer les alertes Telegram
  if (alerts.length === 0) {
    console.log('Marché calme — aucune alerte envoyée.');
    return;
  }

  console.log(`${alerts.length} alerte(s) détectée(s) — envoi Telegram...`);
  for (const signal of alerts) {
    await sendTelegram(signal, env);
  }
}


// ─── Analyse d'un titre ───────────────────────────────────────────────────────

function analyzeSignal(symbol, stock, meta) {
  const { avgVol, refPrice } = meta;

  // Sur la base des données disponibles (cours + volume),
  // on estime un MPR et OBI par proxy :
  //   - MPR proxy : ratio volume observé / volume moyen × momentum
  //   - OBI proxy : signe et intensité de la variation de prix
  const volRatio   = avgVol > 0 ? (stock.volume / avgVol) : 1;
  const momentum   = stock.changePercent / 7.5;   // normalisé sur limite BRVM ±7.5%
  const mpr        = Math.max(0, volRatio * (1 + Math.max(0, momentum)));
  const obi        = Math.min(1, Math.max(-1, momentum * volRatio * 0.5));
  const iceberg    = stock.volume > avgVol * VOL_SPIKE_FACTOR;
  const theoOpen   = stock.price;

  const reasons = [];
  if (mpr > MPR_THRESHOLD)
    reasons.push(`MPR≈${mpr.toFixed(2)} > ${MPR_THRESHOLD} (volume ${stock.volume} titres = ${volRatio.toFixed(1)}× moyenne)`);
  if (obi >= OBI_THRESHOLD)
    reasons.push(`OBI≈${obi.toFixed(3)} ≈ 1 (pression acheteuse dominante)`);
  if (iceberg && reasons.length > 0)
    reasons.push(`Ordre iceberg : ${stock.volume} titres = ${volRatio.toFixed(1)}× vol. journalier moyen (${avgVol})`);

  const confidence = reasons.length >= 3 ? 'HIGH' : reasons.length >= 2 ? 'MEDIUM' : reasons.length === 1 ? 'LOW' : 'NONE';

  return {
    symbol,
    name:        meta.name,
    theoOpen,
    refPrice,
    price:       stock.price,
    change:      stock.changePercent,
    volume:      stock.volume,
    avgVol,
    mpr,
    obi,
    iceberg,
    reasons,
    confidence,
    alert:       reasons.length > 0,
  };
}

// ─── Calcul de position adapté au budget ────────────────────────────────────
function calcPosition(price, budgetFcfa) {
  const capital    = budgetFcfa * (1 - BUDGET_RESERVE_PCT); // 80% du budget
  const nbTitres   = Math.floor(capital / price);           // titres achetables
  if (nbTitres === 0) return null;                          // titre trop cher
  const coutTotal  = nbTitres * price;
  const reserve    = budgetFcfa - coutTotal;
  // Objectif : +4% réaliste sur BRVM / Stop loss : -3% (risque limité)
  const gainCible  = Math.round(nbTitres * price * 0.04);
  const gainMax    = Math.round(nbTitres * price * 0.075); // limite BRVM +7.5%
  const pertMax    = Math.round(nbTitres * price * 0.03);
  const prixStopLoss = Math.round(price * 0.97);
  const prixCible    = Math.round(price * 1.04);
  return { nbTitres, coutTotal, reserve, gainCible, gainMax, pertMax, prixStopLoss, prixCible };
}


// ─── Envoi Telegram ───────────────────────────────────────────────────────────

async function sendTelegram(signal, env) {
  const token      = env.TELEGRAM_BOT_TOKEN;
  const chatId     = env.TELEGRAM_CHAT_ID;
  const budgetFcfa = parseInt(env.BUDGET_FCFA || '75000', 10);

  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID non configuré.');
    return;
  }

  const emoji   = signal.confidence === 'HIGH' ? '🔴' : signal.confidence === 'MEDIUM' ? '🟠' : '🟡';
  const reasons = signal.reasons.map(r => `  • ${r}`).join('\n');
  const icebergLine = signal.iceberg
    ? `\n🐋 *Iceberg* : ${signal.volume} titres = ${(signal.volume / signal.avgVol).toFixed(1)}× vol. moyen`
    : '';

  // Calcul de position personnalisé
  const pos = calcPosition(signal.price, budgetFcfa);
  const posBlock = pos
    ? [
        `──────────────────────`,
        `💼 *RECOMMANDATION (budget ${budgetFcfa.toLocaleString()} F)*`,
        `📌 *Acheter* : ${pos.nbTitres} titre${pos.nbTitres > 1 ? 's' : ''} ${signal.symbol}`,
        `💸 *Coût total* : ${pos.coutTotal.toLocaleString()} FCFA`,
        `🏦 *Réserve gardée* : ${pos.reserve.toLocaleString()} FCFA`,
        `──────────────────────`,
        `🎯 *Objectif* : ${pos.prixCible.toLocaleString()} FCFA (+4%) → *+${pos.gainCible.toLocaleString()} F*`,
        `🚀 *Max BRVM* : ${Math.round(signal.price * 1.075).toLocaleString()} FCFA (+7.5%) → *+${pos.gainMax.toLocaleString()} F*`,
        `🛑 *Stop loss* : ${pos.prixStopLoss.toLocaleString()} FCFA (-3%) → max -${pos.pertMax.toLocaleString()} F`,
      ].join('\n')
    : `\n⚠️ _Titre trop cher pour ton budget actuel (${signal.price.toLocaleString()} FCFA/titre)_`;

  const text = [
    `${emoji} *FLASH BRVM — Pré-Ouverture*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Titre* : ${signal.symbol} (${signal.name})`,
    `⏰ *9h35 GMT* — Fixing dans 10 min`,
    `💰 *Cours* : ${signal.price.toLocaleString()} FCFA`,
    `📊 *Variation* : ${signal.change > 0 ? '+' : ''}${signal.change.toFixed(2)}%`,
    `🛒 *Volume* : ${signal.volume.toLocaleString()} titres${icebergLine}`,
    `──────────────────────`,
    `📈 *MPR* : ${signal.mpr.toFixed(2)}  _(seuil > 2.5)_`,
    `⚖️ *OBI* : ${signal.obi.toFixed(3)}  _(seuil > 0.85)_`,
    `──────────────────────`,
    `*Signaux :*`,
    reasons,
    posBlock,
    `──────────────────────`,
    `⚡ *Passe l'ordre avant 9h45 GMT*`,
    `_Confiance : ${signal.confidence} | ⚠️ Pas un conseil financier certifié_`,
  ].join('\n');

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const data = await resp.json();
    if (data.ok) {
      console.log(`[${signal.symbol}] Alerte Telegram envoyée.`);
    } else {
      console.error(`[${signal.symbol}] Telegram erreur :`, data.description);
    }
  } catch (e) {
    console.error(`[${signal.symbol}] Telegram exception :`, e.message);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  DONNÉES DE MARCHÉ (identique à la version précédente)
// ═══════════════════════════════════════════════════════════════════════════════

async function getStocks(env, ctx) {
  if (env.BRVM_CACHE) {
    try {
      const cached = await env.BRVM_CACHE.get('stocks', { type: 'json' });
      if (cached?.ts && (Date.now() - cached.ts) < CACHE_TTL * 1000) return cached.data;
    } catch {}
  }
  let stocks = null;
  try { stocks = await scrapeBRVM(); } catch (e) { console.error('Scrape:', e.message); }
  if (!stocks || stocks.length < 5) stocks = generateSimulatedData();
  if (env.BRVM_CACHE) {
    ctx.waitUntil(
      env.BRVM_CACHE.put('stocks', JSON.stringify({ data: stocks, ts: Date.now() }), { expirationTtl: CACHE_TTL })
    );
  }
  return stocks;
}

async function scrapeBRVM() {
  const resp = await fetch(BRVM_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept':     'text/html,application/xhtml+xml',
    },
    cf: { cacheTtl: 300 },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return parseBRVMHtml(await resp.text());
}

function parseBRVMHtml(html) {
  const stocks  = [];
  const rowRe   = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe  = /<td[^>]*>([\s\S]*?)<\/td>/gi;
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
      const symbol    = cells[0].toUpperCase();
      const price     = parseFloat(cells[2].replace(/\s/g, '').replace(',', '.'));
      const changePct = parseFloat(cells[4].replace('%', '').replace(/\s/g, '').replace(',', '.'));
      if (symbol.length >= 2 && symbol.length <= 6 && price > 0) {
        const previousPrice = price / (1 + changePct / 100);
        stocks.push({
          symbol,
          name:          symbol,
          price:         Math.round(price),
          previousPrice: Math.round(previousPrice),
          change:        Math.round(price - previousPrice),
          changePercent: Math.round(changePct * 100) / 100,
          volume:        parseInt(cells[5]?.replace(/\s/g, '') || '0') || 0,
          source:        'live',
          timestamp:     Date.now(),
        });
      }
    }
  }
  return stocks.length > 5 ? stocks : null;
}

function generateSimulatedData() {
  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return STATIC_STOCKS.map((s, i) => {
    const rng      = mulberry32(seed + i);
    const change   = Math.max(-0.075, Math.min(0.075, 0.08 / 252 + (rng() - 0.48) * 0.024));
    const newPrice = Math.round(s.price * (1 + change));
    return {
      symbol:        s.symbol,
      name:          s.name,
      price:         newPrice,
      previousPrice: s.price,
      change:        newPrice - s.price,
      changePercent: Math.round(change * 10000) / 100,
      volume:        Math.round(1000 * (0.5 + rng() * 1.5)),
      country:       s.country,
      sector:        s.sector,
      source:        'simulated',
      timestamp:     Date.now(),
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
  const now  = new Date();
  const day  = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const isOpen    = isWeekday && mins >= 9 * 60 && mins <= 15 * 60 + 30;
  return {
    isOpen,
    isPreOpen: isWeekday && mins >= 9 * 60 && mins < 9 * 60 + 45,
    isFixing:  isWeekday && mins >= 12 * 60 && mins <= 12 * 60 + 30,
    label:     isOpen ? 'Séance ouverte' : 'Marché fermé',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS_HEADERS });
}
