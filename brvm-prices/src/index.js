/**
 * BRVM Pre-Open Signal Alert — Cloudflare Worker
 * Cron : 35 9 * * 1-5  (9h35 GMT, lun-ven)
 *
 * GARANTIE : envoie TOUJOURS un message Telegram au cron
 *   🟡/🟠/🔴  Signal détecté     → alerte + position sizing
 *   ✅          Marché calme       → confirmation scan OK
 *   ⚠️          Sources down       → données indisponibles
 *   🔴          Erreur inattendue  → stack trace Telegram
 *
 * Sources données (dans l'ordre) :
 *   1. BRVM.org direct  — accessible depuis l'edge Cloudflare (Afrique)
 *   2. Yahoo Finance    — fallback global
 */

// ─── Paramètres ───────────────────────────────────────────────────────────────

const BUDGET_FCFA      = 75_000;
const BUDGET_RESERVE   = 0.20;      // 20% toujours gardé en réserve
const MPR_THRESHOLD    = 2.5;       // Market Pressure Ratio
const OBI_THRESHOLD    = 0.85;      // Order Book Imbalance approx.
const VOL_SPIKE_FACTOR = 3.0;       // seuil Iceberg (×volume moyen)

// ─── URLs BRVM.org ────────────────────────────────────────────────────────────

const BRVM_URLS = [
  'https://www.brvm.org/fr/cours-actions/0/all',
  'https://www.brvm.org/fr/cours-actions/0',
  'https://brvm.org/fr/cours-actions/0',
  'https://www.brvm.org/fr/cours-des-actions/0/all',
  'https://www.brvm.org/fr/cours-des-actions/0',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Yahoo Finance ticker map ─────────────────────────────────────────────────

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
const YAHOO_REV = Object.fromEntries(Object.entries(YAHOO_MAP).map(([b,y]) => [y,b]));

// ─── Référentiel BRVM (volumes moyens + prix de référence) ───────────────────

const KNOWN_STOCKS = {
  ABJC:  { name: 'Servair CI',                   avgVol: 551,   refPrice: 3250   },
  BICC:  { name: 'BICICI CI (BNP Paribas)',       avgVol: 180,   refPrice: 5500   },
  BNBC:  { name: 'Bernabé CI',                    avgVol: 4650,  refPrice: 1700   },
  BOAB:  { name: 'Bank of Africa Bénin',          avgVol: 980,   refPrice: 5250   },
  BOABF: { name: 'Bank of Africa Burkina Faso',   avgVol: 180,   refPrice: 5200   },
  BOACI: { name: "Bank of Africa Côte d'Ivoire",  avgVol: 2800,  refPrice: 6450   },
  BOAM:  { name: 'Bank of Africa Mali',           avgVol: 95,    refPrice: 4900   },
  BOAN:  { name: 'Bank of Africa Niger',          avgVol: 380,   refPrice: 3800   },
  BOAS:  { name: 'Bank of Africa Sénégal',        avgVol: 750,   refPrice: 4900   },
  CABC:  { name: 'SICABLE CI',                    avgVol: 820,   refPrice: 2850   },
  CBBF:  { name: 'Coris Bank International BF',   avgVol: 580,   refPrice: 8750   },
  CFAC:  { name: 'CFAO Motors CI',                avgVol: 580,   refPrice: 4800   },
  ECOC:  { name: "Ecobank Côte d'Ivoire",         avgVol: 650,   refPrice: 10500  },
  ETIT:  { name: 'Ecobank Transnational (ETI)',   avgVol: 98000, refPrice: 18     },
  LACI:  { name: 'Air Liquide CI',                avgVol: 240,   refPrice: 6500   },
  NEIC:  { name: 'NEI-CEDA CI',                   avgVol: 800,   refPrice: 620    },
  NSBC:  { name: 'NSIA Banque CI',                avgVol: 950,   refPrice: 7200   },
  NTLC:  { name: 'Nestlé CI',                     avgVol: 660,   refPrice: 13000  },
  ONAT:  { name: 'Onatel BF',                     avgVol: 310,   refPrice: 4950   },
  ORAC:  { name: "Orange Côte d'Ivoire",          avgVol: 5400,  refPrice: 14750  },
  ORGT:  { name: 'Oragroup',                      avgVol: 980,   refPrice: 2650   },
  PALC:  { name: 'PALM-CI',                       avgVol: 2200,  refPrice: 7800   },
  PRSC:  { name: 'Tractafric Motor CI',           avgVol: 104,   refPrice: 4100   },
  SAFC:  { name: 'SAFCA',                         avgVol: 516,   refPrice: 3750   },
  SAPH:  { name: 'SAPH CI',                       avgVol: 850,   refPrice: 5100   },
  SCRC:  { name: 'Sucrivoire CI',                 avgVol: 560,   refPrice: 680    },
  SDCC:  { name: 'SODE CI',                       avgVol: 95,    refPrice: 2900   },
  SEMC:  { name: 'Crown Siem CI',                 avgVol: 3800,  refPrice: 680    },
  SGBC:  { name: 'Société Générale CI',           avgVol: 720,   refPrice: 12500  },
  SHEC:  { name: 'Vivo Energie CI',               avgVol: 1612,  refPrice: 1915   },
  SIAC:  { name: 'SIFCA CI',                      avgVol: 1500,  refPrice: 4200   },
  SIBC:  { name: 'SIB CI',                        avgVol: 1400,  refPrice: 5800   },
  SICC:  { name: 'SICOR CI',                      avgVol: 220,   refPrice: 3800   },
  SIPH:  { name: "SIPH CI Plantations d'Hévéas", avgVol: 290,   refPrice: 8900   },
  SLBC:  { name: 'Solibra CI',                    avgVol: 30,    refPrice: 120000 },
  SMBC:  { name: 'SMB CI',                        avgVol: 120,   refPrice: 15000  },
  SNTS:  { name: 'Sonatel (Orange Sénégal)',      avgVol: 3800,  refPrice: 15800  },
  SOGB:  { name: 'SOGB CI',                       avgVol: 520,   refPrice: 3650   },
  SPHC:  { name: 'SAPH CI (pref.)',               avgVol: 85,    refPrice: 4200   },
  STAC:  { name: 'SETAO CI',                      avgVol: 1670,  refPrice: 3100   },
  STBC:  { name: 'SITAB CI',                      avgVol: 497,   refPrice: 21000  },
  SVOC:  { name: 'SVO CI',                        avgVol: 680,   refPrice: 2200   },
  TPCI:  { name: 'Tropical Partners CI',          avgVol: 60,    refPrice: 1100   },
  TTLC:  { name: 'TotalEnergies CI',              avgVol: 2800,  refPrice: 2150   },
  TTLS:  { name: 'TotalEnergies Sénégal',         avgVol: 1200,  refPrice: 2100   },
  UNLC:  { name: 'Unilever CI',                   avgVol: 1100,  refPrice: 5600   },
  UNXC:  { name: 'Unacoopec-CI',                  avgVol: 260,   refPrice: 2800   },
};

// ─── CORS (endpoint HTTP) ─────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT DEFAULT — fetch (HTTP) + scheduled (CRON)
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const { pathname } = new URL(request.url);
    if (pathname === '/health') return json({ status: 'ok', timestamp: Date.now() });
    if (pathname === '/' || pathname === '/stocks') {
      const { stocks, source } = await fetchLiveStocks();
      return json({ stocks, count: stocks.length, source, timestamp: Date.now() });
    }
    return json({ error: 'Not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    console.log('CRON 9h35 déclenché :', new Date().toISOString());
    ctx.waitUntil(runPreOpenScan(env));
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SCAN PRÉ-OUVERTURE  —  GARANTIT un message Telegram dans tous les cas
// ═══════════════════════════════════════════════════════════════════════════════

async function runPreOpenScan(env) {
  // Sécurité : try/catch global → même une erreur JS envoie un Telegram
  try {
    const day = new Date().getUTCDay();
    if (day === 0 || day === 6) { console.log('Weekend — scan ignoré.'); return; }

    const { stocks, source } = await fetchLiveStocks();

    // ── Cas 1 : sources indisponibles ──────────────────────────────────────
    if (!stocks.length) {
      console.warn('Toutes sources inaccessibles.');
      await tg(env, [
        '⚠️ *BRVM Pré-Ouverture — Sources Indisponibles*',
        '━━━━━━━━━━━━━━━━━━━━━',
        '🌐 BRVM.org et Yahoo Finance inaccessibles ce matin.',
        '',
        '_Aucun signal — données live introuvables._',
        '_Réessai automatique demain à 9h35 GMT._',
      ].join('\n'));
      return;
    }

    // ── Cas 2 : données OK → analyse des signaux ───────────────────────────
    const signals = stocks.map(s => analyzeSignal(s)).filter(s => s.alert);
    console.log(`${stocks.length} valeurs depuis "${source}" — ${signals.length} signal(s).`);

    // ── Cas 3 : marché calme ───────────────────────────────────────────────
    if (!signals.length) {
      const heure = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', hour: '2-digit', minute: '2-digit' });
      await tg(env, [
        '✅ *BRVM Pré-Ouverture — Scan Effectué*',
        '━━━━━━━━━━━━━━━━━━━━━',
        `📊 *${stocks.length}* valeurs analysées · Source : ${source}`,
        `🕐 ${heure} GMT`,
        '',
        '_Aucun signal MPR/OBI/Iceberg détecté._',
        "_Marché calme — pas d'ordre à passer._",
      ].join('\n'));
      return;
    }

    // ── Cas 4 : signaux détectés ───────────────────────────────────────────
    for (const sig of signals) await sendSignalTelegram(env, sig, source);

  } catch (err) {
    // ── Cas 5 : erreur inattendue → toujours notifier ─────────────────────
    console.error('runPreOpenScan erreur:', err);
    await tg(env, `🔴 *BRVM Worker — Erreur*\n\`${err.message}\`\n_Vérifier les logs Cloudflare._`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FETCH DONNÉES BRVM
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchLiveStocks() {
  // 1. BRVM.org — accessible depuis Cloudflare edge (présence africaine)
  for (const url of BRVM_URLS) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'fr-FR,fr;q=0.9', 'Referer': 'https://www.google.com/' },
        cf: { timeout: 15000 },
      });
      if (r.ok) {
        const stocks = parseBRVM(await r.text());
        if (stocks) { console.log(`BRVM.org OK (${url}): ${stocks.length} titres`); return { stocks, source: 'brvm.org' }; }
      }
    } catch (e) { console.warn(`BRVM.org ${url}:`, e.message); }
  }

  // 2. Yahoo Finance — fallback global
  try {
    const stocks = await fetchYahoo();
    if (stocks) { console.log(`Yahoo Finance OK: ${stocks.length} titres`); return { stocks, source: 'yahoo-finance' }; }
  } catch (e) { console.warn('Yahoo Finance:', e.message); }

  return { stocks: [], source: 'unavailable' };
}

async function fetchYahoo() {
  const tickers = Object.values(YAHOO_MAP).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers}&fields=symbol,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketVolume`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const quotes = (await r.json())?.quoteResponse?.result;
  if (!quotes || quotes.length < 5) return null;
  return quotes.map(q => {
    const sym = YAHOO_REV[q.symbol]; if (!sym) return null;
    const meta = KNOWN_STOCKS[sym] || {};
    const price = Math.round(q.regularMarketPrice || 0);
    const prev  = Math.round(q.regularMarketPreviousClose || price);
    if (!price) return null;
    return { symbol: sym, name: meta.name || sym, price, previousPrice: prev,
             changePercent: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
             volume: q.regularMarketVolume || 0 };
  }).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PARSER HTML BRVM.org
// ═══════════════════════════════════════════════════════════════════════════════

function parseBRVM(raw) {
  const html   = raw.replace(/&nbsp;/gi,' ').replace(/&#160;/g,' ').replace(/&thinsp;/gi,' ').replace(/ /g,' ');
  const stocks = [];

  // Cherche la table contenant les cours (header: symbole + variation ou cloture)
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tm, target = '';
  while ((tm = tableRe.exec(html)) !== null) {
    const hdr = (/<tr[^>]*>([\s\S]*?)<\/tr>/i.exec(tm[1])||['',''])[1].replace(/<[^>]+>/g,' ').toLowerCase();
    if ((hdr.includes('cl') && hdr.includes('ture')) || (hdr.includes('symbole') && hdr.includes('variation'))) {
      target = tm[1]; break;
    }
  }

  const src   = target || html;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row, first = !!target;
  while ((row = rowRe.exec(src)) !== null) {
    if (first) { first = false; continue; }
    const cells = [];
    const cm = /<td[^>]*>([\s\S]*?)<\/td>/gi; let c;
    while ((c = cm.exec(row[1])) !== null) cells.push(c[1].replace(/<[^>]+>/g,'').trim());
    if (cells.length < 5) continue;
    const sym = cells[0].toUpperCase().replace(/[\s ]/g,'');
    if (!/^[A-Z]{2,8}$/.test(sym) || !KNOWN_STOCKS[sym]) continue;
    const vol   = parseFloat(cells[2]?.replace(/[\s ]/g,'').replace(',','.')) || 0;
    const ref   = parseFloat(cells[3]?.replace(/[\s ]/g,'').replace(',','.'));
    const open  = parseFloat(cells[4]?.replace(/[\s ]/g,'').replace(',','.'));
    const close = parseFloat(cells[5]?.replace(/[\s ]/g,'').replace(',','.'));
    const chg   = parseFloat(cells[6]?.replace('%','').replace(/[\s ]/g,'').replace(',','.')) || 0;
    const price = close || open || ref;
    if (!price || price <= 0) continue;
    stocks.push({
      symbol: sym,
      name: cells[1] || KNOWN_STOCKS[sym].name || sym,
      price: Math.round(price),
      previousPrice: Math.round(ref || price),
      changePercent: Math.round(chg * 100) / 100,
      volume: Math.round(vol),
    });
  }
  return stocks.length >= 5 ? stocks : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ANALYSE DES SIGNAUX
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeSignal(stock) {
  const meta     = KNOWN_STOCKS[stock.symbol] || { avgVol: 300, refPrice: stock.price };
  const volRatio = meta.avgVol > 0 ? stock.volume / meta.avgVol : 1;
  const momentum = stock.changePercent / 7.5;   // normalisé: +7.5% = 1.0
  const mpr      = Math.max(0, volRatio * (1 + Math.max(0, momentum)));
  const obi      = Math.min(1, Math.max(-1, momentum * volRatio * 0.5));
  const iceberg  = stock.volume > meta.avgVol * VOL_SPIKE_FACTOR;

  const reasons = [];
  // MPR uniquement si prix stable ou en hausse (évite faux signaux sur panique vendeuse)
  if (mpr > MPR_THRESHOLD && stock.changePercent >= 0)
    reasons.push(`MPR ${mpr.toFixed(2)} > ${MPR_THRESHOLD} (vol ${stock.volume.toLocaleString()} = ${volRatio.toFixed(1)}× moy)`);
  if (obi >= OBI_THRESHOLD)
    reasons.push(`OBI ${obi.toFixed(3)} — pression acheteuse forte`);
  if (iceberg && reasons.length > 0)
    reasons.push(`Iceberg : ${stock.volume.toLocaleString()} titres = ${volRatio.toFixed(1)}× vol. moyen`);

  const confidence = reasons.length >= 3 ? 'HIGH' : reasons.length === 2 ? 'MEDIUM' : reasons.length === 1 ? 'LOW' : 'NONE';
  return { ...stock, meta, mpr, obi, iceberg, reasons, confidence, alert: reasons.length > 0 };
}

function calcPosition(price) {
  const n    = Math.floor(BUDGET_FCFA * (1 - BUDGET_RESERVE) / price);
  if (!n) return null;
  const cost = n * price;
  return {
    n, cost,
    reserve:   BUDGET_FCFA - cost,
    target:    Math.round(price * 1.04),
    targetMax: Math.round(price * 1.075),
    stop:      Math.round(price * 0.97),
    gain:      Math.round(cost * 0.04),
    gainMax:   Math.round(cost * 0.075),
    loss:      Math.round(cost * 0.03),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MESSAGES TELEGRAM
// ═══════════════════════════════════════════════════════════════════════════════

async function sendSignalTelegram(env, sig, source) {
  const emoji = sig.confidence === 'HIGH' ? '🔴' : sig.confidence === 'MEDIUM' ? '🟠' : '🟡';
  const pos   = calcPosition(sig.price);

  const posBlock = pos
    ? [
        '──────────────────────',
        `💼 *RECOMMANDATION — budget ${BUDGET_FCFA.toLocaleString()} FCFA*`,
        `📌 Acheter *${pos.n} titre${pos.n > 1 ? 's' : ''}* ${sig.symbol} @ ${sig.price.toLocaleString()} FCFA`,
        `💸 Coût : *${pos.cost.toLocaleString()} FCFA*  ·  Réserve : ${pos.reserve.toLocaleString()} FCFA`,
        '──────────────────────',
        `🎯 Objectif +4% → ${pos.target.toLocaleString()} FCFA  *(+${pos.gain.toLocaleString()} F)*`,
        `🚀 Max BRVM +7.5% → ${pos.targetMax.toLocaleString()} FCFA  *(+${pos.gainMax.toLocaleString()} F)*`,
        `🛑 Stop-loss -3% → ${pos.stop.toLocaleString()} FCFA  *(max -${pos.loss.toLocaleString()} F)*`,
      ].join('\n')
    : `⚠️ _Titre trop cher pour le budget (${sig.price.toLocaleString()} FCFA/titre)_`;

  const text = [
    `${emoji} *FLASH BRVM — Pré-Ouverture*`,
    '━━━━━━━━━━━━━━━━━━━━━',
    `📌 *${sig.symbol}* — ${sig.name}`,
    `⏰ Fixing dans ~10 min`,
    `💰 Cours : *${sig.price.toLocaleString()} FCFA*`,
    `📊 Variation : ${sig.changePercent >= 0 ? '+' : ''}${sig.changePercent.toFixed(2)}%`,
    `🛒 Volume : ${sig.volume.toLocaleString()} titres${sig.iceberg ? '  🐋 *Iceberg*' : ''}`,
    '──────────────────────',
    `📈 MPR : *${sig.mpr.toFixed(2)}*  _(seuil > ${MPR_THRESHOLD})_`,
    `⚖️ OBI : *${sig.obi.toFixed(3)}*  _(seuil > ${OBI_THRESHOLD})_`,
    `*Signaux :*\n${sig.reasons.map(r => `  • ${r}`).join('\n')}`,
    posBlock,
    '──────────────────────',
    '⚡ *Passe l\'ordre avant 9h45 GMT*',
    `_Confiance : ${sig.confidence}${source !== 'brvm.org' ? ' · Source : ' + source : ''}_`,
  ].join('\n');

  await tg(env, text);
}

// Envoi Telegram bas niveau — utilisé par tous les cas
async function tg(env, text) {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) { console.error('Secrets Telegram manquants (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).'); return; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const d = await r.json();
    if (d.ok) console.log('Telegram OK');
    else      console.error('Telegram erreur:', d.description, '| text:', text.slice(0, 120));
  } catch (e) {
    console.error('Telegram exception:', e.message);
  }
}
