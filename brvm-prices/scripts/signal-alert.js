#!/usr/bin/env node
/**
 * BRVM Pre-Open Signal Alert — script Node.js pour GitHub Actions
 * Pas de CORS en Node.js → scraping brvm.org direct, sans proxy, sans Cloudflare.
 * Cron : 9h35 UTC lun-ven (voir .github/workflows/brvm-signal-alert.yml)
 */

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
  ABJC: { name:'Bernabé CI',                           avgVol:380,   refPrice:2100   },
  BICC: { name:'BICICI CI (BNP Paribas)',              avgVol:180,   refPrice:5500   },
  BNBC: { name:'Brasseries du Bénin',                  avgVol:95,    refPrice:3800   },
  BOAB: { name:'Bank of Africa Bénin',                 avgVol:980,   refPrice:5250   },
  BOABF:{ name:'Bank of Africa Burkina Faso',          avgVol:180,   refPrice:5200   },
  BOACI:{ name:"Bank of Africa Côte d'Ivoire",         avgVol:2800,  refPrice:6450   },
  BOAM: { name:'Bank of Africa Mali',                  avgVol:95,    refPrice:4900   },
  BOAN: { name:'Bank of Africa Niger',                 avgVol:380,   refPrice:3800   },
  BOAS: { name:'Bank of Africa Sénégal',               avgVol:750,   refPrice:4900   },
  CABC: { name:'SICABLE CI — Câbles Électriques',      avgVol:820,   refPrice:2850   },
  CBBF: { name:'Coris Bank International BF',          avgVol:580,   refPrice:8750   },
  CFAC: { name:'CFAO Motors CI',                       avgVol:580,   refPrice:4800   },
  ECOC: { name:"Ecobank Côte d'Ivoire",                avgVol:650,   refPrice:10500  },
  ETIT: { name:'Ecobank Transnational Inc. (ETI)',     avgVol:98000, refPrice:18     },
  LACI: { name:'Air Liquide CI',                       avgVol:240,   refPrice:6500   },
  NEIC: { name:'NEI-CEDA CI',                          avgVol:800,   refPrice:620    },
  NSBC: { name:'NSIA Banque CI',                       avgVol:950,   refPrice:7200   },
  NTLC: { name:'Filtisac CI',                          avgVol:720,   refPrice:1850   },
  ONAT: { name:'Onatel — Télécoms Burkina Faso',       avgVol:310,   refPrice:4950   },
  ORAC: { name:"Orange Côte d'Ivoire",                 avgVol:5400,  refPrice:14750  },
  ORGT: { name:'Orange CI',                            avgVol:5200,  refPrice:11500  },
  PALC: { name:'PALM-CI — Palmier à Huile',            avgVol:2200,  refPrice:7800   },
  PRSC: { name:'Prestige Assurances CI',               avgVol:450,   refPrice:3200   },
  SAFC: { name:"SAPH CI — Plantations d'Hévéas",      avgVol:850,   refPrice:5100   },
  SAPH: { name:'SAPH CI — Hévéaculture',               avgVol:850,   refPrice:5100   },
  SCRC: { name:'Sucrivoire CI',                        avgVol:560,   refPrice:680    },
  SDCC: { name:'SODE CI',                              avgVol:95,    refPrice:2900   },
  SEMC: { name:'Crown Siem CI — Emballages',           avgVol:3800,  refPrice:680    },
  SGBC: { name:"Société Générale CI",                  avgVol:720,   refPrice:12500  },
  SHEC: { name:"Société d'Hévéiculture CI",            avgVol:75,    refPrice:4100   },
  SIAC: { name:'SIFCA CI — Agro-industrie',            avgVol:1500,  refPrice:4200   },
  SIBC: { name:'SIB CI — Société Ivoirienne de Banque',avgVol:1400, refPrice:5800   },
  SICC: { name:'SICOR CI — Industrie du Coton',        avgVol:220,   refPrice:3800   },
  SIPH: { name:"SIPH CI — Plantations d'Hévéas",      avgVol:290,   refPrice:8900   },
  SLBC: { name:'Solibra CI — Brasserie (Castel)',      avgVol:30,    refPrice:120000 },
  SMBC: { name:'SMB CI — Manufacture de Bois',         avgVol:120,   refPrice:15000  },
  SNTS: { name:'Sonatel (Orange Sénégal)',             avgVol:3800,  refPrice:15800  },
  SOGB: { name:'SOGB CI — Caoutchoucs Grand-Béréby',  avgVol:520,   refPrice:3650   },
  SPHC: { name:'SAPH CI — Actions Prioritaires',       avgVol:85,    refPrice:4200   },
  STAC: { name:'SITAB CI (British American Tobacco)',  avgVol:340,   refPrice:21000  },
  STBC: { name:'SGB-BF — Société Générale Burkina',   avgVol:340,   refPrice:5300   },
  SVOC: { name:'SVO CI — Savonnerie',                  avgVol:680,   refPrice:2200   },
  TPCI: { name:'Tropical Partners CI',                 avgVol:60,    refPrice:1100   },
  TTLC: { name:'TotalEnergies Marketing CI',           avgVol:2800,  refPrice:2150   },
  TTLS: { name:'TotalEnergies Marketing Sénégal',      avgVol:1200,  refPrice:2100   },
  UNLC: { name:'Unilever CI',                          avgVol:1100,  refPrice:5600   },
  UNXC: { name:'Unacoopec-CI',                         avgVol:260,   refPrice:2800   },
};

const MPR_THRESHOLD    = 2.5;
const OBI_THRESHOLD    = 0.85;
const VOL_SPIKE_FACTOR = 3.0;
const BUDGET_RESERVE   = 0.20;
const FETCH_TIMEOUT_MS = 15000;

// ─── Fetch avec timeout ───────────────────────────────────────────────────────

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ─── Cascade de sources ───────────────────────────────────────────────────────

async function fetchLiveStocks() {
  // 1. BRVM.org direct — pas de CORS en Node.js, scraping natif
  for (const url of BRVM_URLS) {
    try {
      const resp = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Referer': 'https://www.google.com/',
        },
      });
      if (resp.ok) {
        const stocks = parseBRVMHtml(await resp.text());
        if (stocks) { console.log(`Source: brvm-direct (${url})`); return { stocks, source: 'brvm-direct' }; }
      }
    } catch (e) { console.warn(`brvm-direct ${url}: ${e.message}`); }
  }

  // 2. Yahoo Finance — JSON temps réel
  try {
    const stocks = await fetchYahooFinance();
    if (stocks) { console.log('Source: yahoo-finance'); return { stocks, source: 'yahoo-finance' }; }
  } catch (e) { console.warn('Yahoo Finance:', e.message); }

  // 3. Sika Finance
  try {
    const resp = await fetchWithTimeout('https://sika.finance/bourse/brvm/cours', {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
    });
    if (resp.ok) {
      const stocks = parseSikaHtml(await resp.text());
      if (stocks) { console.log('Source: sika-finance'); return { stocks, source: 'sika-finance' }; }
    }
  } catch (e) { console.warn('Sika Finance:', e.message); }

  return { stocks: [], source: 'unavailable' };
}

async function fetchYahooFinance() {
  const tickers = Object.values(YAHOO_MAP).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers}` +
              `&fields=symbol,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketVolume`;
  const resp = await fetchWithTimeout(url, {
    headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Yahoo HTTP ${resp.status}`);
  const data   = await resp.json();
  const quotes = data?.quoteResponse?.result;
  if (!quotes || quotes.length < 5) return null;
  return quotes.map(q => {
    const sym = YAHOO_REVERSE[q.symbol];
    if (!sym) return null;
    const price = Math.round(q.regularMarketPrice || 0);
    const prev  = Math.round(q.regularMarketPreviousClose || price);
    const chg   = Math.round((q.regularMarketChangePercent || 0) * 100) / 100;
    if (price <= 0) return null;
    return { symbol: sym, name: KNOWN_STOCKS[sym]?.name || sym, price, previousPrice: prev,
             change: price - prev, changePercent: chg, volume: q.regularMarketVolume || 0 };
  }).filter(Boolean);
}

// ─── Parsers HTML ─────────────────────────────────────────────────────────────

function parseBRVMHtml(html) {
  const stocks = [];
  const rowRe  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const strip  = /<[^>]+>/g;
  let row;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = [];
    const cm = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cm.exec(row[1])) !== null) cells.push(cell[1].replace(strip, '').trim());
    if (cells.length < 5) continue;
    const symbol    = cells[0].toUpperCase().replace(/\s/g, '');
    const price     = parseFloat(cells[2].replace(/\s/g, '').replace(',', '.'));
    const changePct = parseFloat(cells[4].replace('%','').replace(/\s/g,'').replace(',','.')) || 0;
    if (symbol.length >= 2 && symbol.length <= 6 && price > 0) {
      const prev = price / (1 + changePct / 100);
      stocks.push({ symbol, name: KNOWN_STOCKS[symbol]?.name || symbol,
        price: Math.round(price), previousPrice: Math.round(prev),
        change: Math.round(price - prev), changePercent: Math.round(changePct * 100) / 100,
        volume: parseInt(cells[5]?.replace(/\s/g,'') || '0') || 0 });
    }
  }
  return stocks.length >= 5 ? stocks : null;
}

function parseSikaHtml(html) {
  const stocks = [];
  const rowRe  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const strip  = /<[^>]+>/g;
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

// ─── Analyse signal ───────────────────────────────────────────────────────────

function analyzeSignal(stock) {
  const meta     = KNOWN_STOCKS[stock.symbol] || { avgVol: 300, refPrice: stock.price };
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

  const confidence = reasons.length >= 3 ? 'HIGH' : reasons.length >= 2 ? 'MEDIUM' : reasons.length >= 1 ? 'LOW' : 'NONE';
  return { ...stock, meta, mpr, obi, iceberg, reasons, confidence, alert: reasons.length > 0 };
}

function calcPosition(price) {
  const n = Math.floor(BUDGET_FCFA * (1 - BUDGET_RESERVE) / price);
  if (n === 0) return null;
  const cout = n * price;
  return { n, cout, reserve: BUDGET_FCFA - cout,
    gainCible: Math.round(cout * 0.04), gainMax: Math.round(cout * 0.075),
    pertMax: Math.round(cout * 0.03),
    prixCible: Math.round(price * 1.04), prixStopLoss: Math.round(price * 0.97) };
}

// ─── Envoi Telegram ───────────────────────────────────────────────────────────

async function sendTelegram(signal, source) {
  const emoji    = signal.confidence === 'HIGH' ? '🔴' : signal.confidence === 'MEDIUM' ? '🟠' : '🟡';
  const reasons  = signal.reasons.map(r => `  • ${r}`).join('\n');
  const iceLine  = signal.iceberg
    ? `\n🐋 *Iceberg* : ${signal.volume} titres = ${(signal.volume/signal.meta.avgVol).toFixed(1)}× vol. moyen` : '';
  const srcTag   = source !== 'brvm-direct' ? `\n_📡 Source : ${source}_` : '';
  const pos      = calcPosition(signal.price);
  const posBlock = pos
    ? [`──────────────────────`,
       `💼 *RECOMMANDATION (budget ${BUDGET_FCFA.toLocaleString('fr-FR')} F)*`,
       `📌 *Acheter* : ${pos.n} titre${pos.n > 1 ? 's' : ''} ${signal.symbol}`,
       `💸 *Coût total* : ${pos.cout.toLocaleString('fr-FR')} FCFA`,
       `🏦 *Réserve* : ${pos.reserve.toLocaleString('fr-FR')} FCFA`,
       `──────────────────────`,
       `🎯 *Objectif* : ${pos.prixCible.toLocaleString('fr-FR')} FCFA (+4%) → *+${pos.gainCible.toLocaleString('fr-FR')} F*`,
       `🚀 *Max BRVM* : ${Math.round(signal.price*1.075).toLocaleString('fr-FR')} FCFA (+7.5%) → *+${pos.gainMax.toLocaleString('fr-FR')} F*`,
       `🛑 *Stop loss* : ${pos.prixStopLoss.toLocaleString('fr-FR')} FCFA (-3%) → max -${pos.pertMax.toLocaleString('fr-FR')} F`,
      ].join('\n')
    : `\n⚠️ _Titre trop cher pour le budget (${signal.price.toLocaleString('fr-FR')} FCFA/titre)_`;

  const text = [
    `${emoji} *FLASH BRVM — Pré-Ouverture*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📌 *${signal.symbol}* — ${signal.name}`,
    `⏰ *9h35 GMT* — Fixing dans 10 min`,
    `💰 *Cours* : ${signal.price.toLocaleString('fr-FR')} FCFA`,
    `📊 *Variation* : ${signal.changePercent > 0 ? '+' : ''}${signal.changePercent.toFixed(2)}%`,
    `🛒 *Volume* : ${signal.volume.toLocaleString('fr-FR')} titres${iceLine}`,
    `──────────────────────`,
    `📈 *MPR* : ${signal.mpr.toFixed(2)}  _(seuil > 2.5)_`,
    `⚖️ *OBI* : ${signal.obi.toFixed(3)}  _(seuil > 0.85)_`,
    `──────────────────────`,
    `*Signaux :*\n${reasons}`,
    posBlock,
    `──────────────────────`,
    `⚡ *Passe l'ordre avant 9h45 GMT*`,
    `_Confiance : ${signal.confidence} | ⚠️ Pas un conseil financier certifié_${srcTag}`,
  ].join('\n');

  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
  const data = await resp.json();
  if (data.ok) console.log(`[${signal.symbol}] Telegram OK`);
  else         console.error(`[${signal.symbol}] Telegram erreur: ${data.description}`);
}

async function sendTelegramUnavailable() {
  const text = [
    '⚠️ *BRVM Pré-Ouverture — Sources Indisponibles*',
    '━━━━━━━━━━━━━━━━━━━━━',
    '🌐 BRVM.org, Yahoo Finance et Sika Finance sont inaccessibles ce matin.',
    '',
    '_Aucun signal généré — données live introuvables._',
    '_Réessai automatique demain à 9h35 GMT._',
  ].join('\n');
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Erreur : TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID doivent être définis.');
    process.exit(1);
  }

  console.log(`BRVM Pre-Open Scanner — ${new Date().toISOString()}`);
  console.log(`Budget : ${BUDGET_FCFA.toLocaleString('fr-FR')} FCFA`);

  const { stocks, source } = await fetchLiveStocks();

  if (!stocks.length) {
    console.warn('Toutes les sources inaccessibles.');
    await sendTelegramUnavailable();
    return;
  }

  console.log(`${stocks.length} valeurs chargées depuis "${source}".`);

  const alerts = stocks.map(analyzeSignal).filter(s => s.alert);

  if (!alerts.length) {
    console.log('Marché calme — aucune alerte envoyée.');
    return;
  }

  console.log(`${alerts.length} alerte(s) détectée(s) — envoi Telegram...`);
  for (const alert of alerts) await sendTelegram(alert, source);
  console.log('Terminé.');
}

main().catch(e => { console.error(e); process.exit(1); });
