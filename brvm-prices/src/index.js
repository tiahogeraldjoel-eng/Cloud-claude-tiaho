/**
 * BRVM Signal Alert — Cloudflare Worker
 *
 * Crons :
 *   15 10 * * 1-5  → Post-Fixing  : signaux MPR/OBI/Iceberg + position sizing adaptatif
 *   30 13 * * 1-5  → Mid-Session  : surveillance stops portefeuille
 *   30 15 * * 1-5  → Clôture      : bilan du jour + performances portefeuille
 *   45 15 * * 5    → Hebdo        : digest vendredi + recap semaine
 *
 * Améliorations v2 :
 *   1. Position sizing adaptatif (HIGH 80% / MEDIUM 50% / LOW 25%)
 *   2. Seuils MPR/OBI ajustés à la liquidité du titre
 *   3. Validation croisée sectorielle (bancaire, agri, telecom…)
 *   4. Contexte portefeuille dans chaque alerte signal
 *   5. Calendrier dividendes — avertit si ex-date dans les 5 jours
 *   6. Alerte mid-session (13h30) — stop-loss atteint ?
 *   7. Bilan de clôture (15h30) — top movers + P&L portefeuille
 *   8. Digest hebdomadaire (vendredi 15h45)
 */

// ─── Paramètres globaux ───────────────────────────────────────────────────────

const WORKER_URL       = 'https://brvm-prices.tiahogeraldjoel.workers.dev';
const BUDGET_FCFA      = 75_000;
const VOL_SPIKE_FACTOR = 3.0;       // seuil Iceberg (×volume moyen)
const WARN_STOP_PCT    = 0.01;      // alerter si prix ≤ stopLoss + 1%

// Seuils par liquidité — getThresholds() les utilise
const THRESH = {
  H: { mpr: 2.5, obi: 0.85 },  // avgVol ≥ 5 000  (ETIT, ORAC…)
  M: { mpr: 2.0, obi: 0.75 },  // avgVol 500–4 999 (SIBC, BOACI…)
  L: { mpr: 3.5, obi: 0.90 },  // avgVol < 500     (SLBC, SMBC…)
};

// ─── Portefeuille utilisateur ─────────────────────────────────────────────────
// Mettre à jour après chaque achat / vente

const USER_PORTFOLIO = [
  { symbol: 'SAFC',  qty:    5, avgCost:  3_745 },
  { symbol: 'STBC',  qty:   23, avgCost: 21_115 },
  { symbol: 'SOGB',  qty:   78, avgCost:  8_020 },
  { symbol: 'SMBC',  qty:   50, avgCost: 11_817 },
  { symbol: 'NTLC',  qty:   20, avgCost: 11_048 },
  { symbol: 'UNXC',  qty:  100, avgCost:  1_957 },
  { symbol: 'SIVC',  qty:   61, avgCost:  2_757 },
  { symbol: 'BOAB',  qty:   40, avgCost:  5_648 },
  { symbol: 'TTLC',  qty:  117, avgCost:  2_834 },
  { symbol: 'BOAN',  qty:   30, avgCost:  2_677 },
  { symbol: 'ETIT',  qty: 4000, avgCost:     16 },
  { symbol: 'SDSC',  qty:  250, avgCost:  1_575 },
  { symbol: 'BOACI', qty:  115, avgCost:  7_488 },
  { symbol: 'BOABF', qty:   67, avgCost:  4_737 },
  { symbol: 'BOAS',  qty:   20, avgCost:  7_447 },
  { symbol: 'BOAM',  qty:   30, avgCost:  4_834 },
  { symbol: 'SIBC',  qty:   78, avgCost:  6_337 },
  { symbol: 'CBBF',  qty:   30, avgCost: 10_211 },
  { symbol: 'NSBC',  qty:   77, avgCost:  8_301 },
  { symbol: 'ECOC',  qty:   32, avgCost: 14_127 },
  { symbol: 'BICB',  qty:   50, avgCost:  5_182 },
];

// ─── Calendrier dividendes BRVM 2026 ─────────────────────────────────────────
// Avertit si un signal se déclenche dans les 5 jours avant l'ex-date.
// ⚠️  Dates approximatives — vérifier sur brvm.org ou auprès du broker.

const DIVIDEND_CALENDAR = [
  { symbol: 'NTLC',  exDate: '2026-06-15', amount:  390 },
  { symbol: 'ORAC',  exDate: '2026-07-10', amount:  775 },
  { symbol: 'SGBC',  exDate: '2026-07-01', amount:  900 },
  { symbol: 'SNTS',  exDate: '2026-07-20', amount: 1200 },
  { symbol: 'ETIT',  exDate: '2026-06-20', amount:    2 },
  { symbol: 'BOABF', exDate: '2026-07-15', amount:  320 },
  { symbol: 'SAPH',  exDate: '2026-07-08', amount:  450 },
  { symbol: 'SIPH',  exDate: '2026-08-01', amount:  380 },
  { symbol: 'SOGB',  exDate: '2026-07-25', amount:  530 },
  { symbol: 'SLBC',  exDate: '2026-08-15', amount: 6000 },
  { symbol: 'SMBC',  exDate: '2026-08-10', amount:  800 },
  { symbol: 'BOACI', exDate: '2026-07-12', amount:  480 },
  { symbol: 'ECOC',  exDate: '2026-07-05', amount:  900 },
  { symbol: 'NSBC',  exDate: '2026-07-18', amount:  650 },
  { symbol: 'SIBC',  exDate: '2026-07-22', amount:  450 },
];

// ─── Secteurs BRVM ────────────────────────────────────────────────────────────
// Détecte quand 3+ titres du même secteur signalent en même temps (= macro)

const SECTORS = {
  BANK: ['BOAB','BOABF','BOACI','BOAM','BOAN','BOAS','CBBF','ECOC','NSBC','SIBC','SGBC','BICC'],
  AGRI: ['PALC','SAPH','SIPH','SOGB','SIAC','SCRC'],
  TELE: ['ORAC','SNTS'],
  ENER: ['TTLC','TTLS','SHEC'],
  INDU: ['NTLC','UNXC','CFAC','CABC','SEMC','STBC','STAC','BNBC'],
  TRAN: ['SDSC','ETIT'],
};

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
  ABJC:'ABJC.CI',  BICC:'BICC.CI',  BICB:'BICB.BJ',  BNBC:'BNBC.BJ',  BOAB:'BOAB.BJ',
  BOABF:'BOABF.BF',BOACI:'BOACI.CI',BOAM:'BOAM.ML',   BOAN:'BOAN.NE',
  BOAS:'BOAS.SN',  CABC:'CABC.CI',  CBBF:'CBBF.BF',   CFAC:'CFAC.CI',
  ECOC:'ECOC.CI',  ETIT:'ETIT.TG',  NEIC:'NEIC.CI',
  NSBC:'NSBC.CI',  NTLC:'NTLC.CI',  ONAT:'ONAT.BF',   ORAC:'ORAC.CI',
  ORGT:'ORGT.CI',  PALC:'PALC.CI',  PRSC:'PRSC.CI',   SAFC:'SAFC.CI',
  SAPH:'SAPH.CI',  SCRC:'SCRC.CI',  SDSC:'SDSC.CI',   SEMC:'SEMC.CI',
  SGBC:'SGBC.CI',  SHEC:'SHEC.CI',  SIAC:'SIAC.CI',   SIBC:'SIBC.CI',
  SICC:'SICC.CI',  SIPH:'SIPH.CI',  SIVC:'SIVC.CI',   SLBC:'SLBC.CI',   SMBC:'SMBC.CI',
  SNTS:'SNTS.SN',  SOGB:'SOGB.CI',  SPHC:'SPHC.CI',   STAC:'STAC.CI',
  STBC:'STBC.BF',  SVOC:'SVOC.CI',  TPCI:'TPCI.CI',   TTLC:'TTLC.CI',
  TTLS:'TTLS.SN',  UNLC:'UNLC.CI',  UNXC:'UNXC.CI',
};
const YAHOO_REV = Object.fromEntries(Object.entries(YAHOO_MAP).map(([b,y]) => [y,b]));

// ─── Référentiel BRVM ─────────────────────────────────────────────────────────
// liq : H = haute liquidité (≥5000), M = moyenne (500-4999), L = faible (<500)

const KNOWN_STOCKS = {
  ABJC:  { name: 'Servair CI',                   avgVol:   551, refPrice:  3250,  liq:'M' },
  BICC:  { name: 'BICICI CI (BNP Paribas)',       avgVol:   180, refPrice:  5500,  liq:'L' },
  BICB:  { name: 'BIIC Bénin',                           avgVol:   200, refPrice:  5_590,  liq:'L' },
  BNBC:  { name: 'Bernabé CI',                    avgVol:  4650, refPrice:  1700,  liq:'M' },
  BOAB:  { name: 'Bank of Africa Bénin',          avgVol:   980, refPrice:  8_745,  liq:'M' },
  BOABF: { name: 'Bank of Africa Burkina Faso',   avgVol:   180, refPrice:  5_595,  liq:'L' },
  BOACI: { name: "Bank of Africa Côte d'Ivoire",  avgVol:  2800, refPrice:  8_890,  liq:'M' },
  BOAM:  { name: 'Bank of Africa Mali',           avgVol:    95, refPrice:  4_630,  liq:'L' },
  BOAN:  { name: 'Bank of Africa Niger',          avgVol:   380, refPrice:  3_740,  liq:'L' },
  BOAS:  { name: 'Bank of Africa Sénégal',        avgVol:   750, refPrice:  7_400,  liq:'M' },
  CABC:  { name: 'SICABLE CI',                    avgVol:   820, refPrice:  2850,  liq:'M' },
  CBBF:  { name: 'Coris Bank International BF',   avgVol:   580, refPrice: 21_500,  liq:'M' },
  CFAC:  { name: 'CFAO Motors CI',                avgVol:   580, refPrice:  4800,  liq:'M' },
  ECOC:  { name: "Ecobank Côte d'Ivoire",         avgVol:   650, refPrice: 16_800,  liq:'M' },
  ETIT:  { name: 'Ecobank Transnational (ETI)',   avgVol: 98000, refPrice:     33,  liq:'H' },
  NEIC:  { name: 'NEI-CEDA CI',                   avgVol:   800, refPrice:   620,  liq:'M' },
  NSBC:  { name: 'NSIA Banque CI',                avgVol:   950, refPrice: 19_250,  liq:'M' },
  NTLC:  { name: 'Nestlé CI',                     avgVol:   660, refPrice: 14_225,  liq:'M' },
  ONAT:  { name: 'Onatel BF',                     avgVol:   310, refPrice:  4950,  liq:'L' },
  ORAC:  { name: "Orange Côte d'Ivoire",          avgVol:  5400, refPrice: 14750,  liq:'H' },
  ORGT:  { name: 'Oragroup',                      avgVol:   980, refPrice:  2650,  liq:'M' },
  PALC:  { name: 'PALM-CI',                       avgVol:  2200, refPrice:  7800,  liq:'M' },
  PRSC:  { name: 'Tractafric Motor CI',           avgVol:   104, refPrice:  4100,  liq:'L' },
  SAFC:  { name: 'SAFCA',                         avgVol:   516, refPrice:  3_700,  liq:'M' },
  SAPH:  { name: 'SAPH CI',                       avgVol:   850, refPrice:  5100,  liq:'M' },
  SCRC:  { name: 'Sucrivoire CI',                 avgVol:   560, refPrice:   680,  liq:'M' },
  SDSC:  { name: 'AGL CI — Africa Global Logistics (ex-Bolloré)', avgVol: 1200, refPrice:  2_000,  liq:'M' },
  SEMC:  { name: 'Crown Siem CI',                 avgVol:  3800, refPrice:   680,  liq:'M' },
  SGBC:  { name: 'Société Générale CI',           avgVol:   720, refPrice: 12500,  liq:'M' },
  SHEC:  { name: 'Vivo Energie CI',               avgVol:  1612, refPrice:  1915,  liq:'M' },
  SIAC:  { name: 'SIFCA CI',                      avgVol:  1500, refPrice:  4200,  liq:'M' },
  SIBC:  { name: 'SIB CI',                        avgVol:  1400, refPrice:  8_510,  liq:'M' },
  SICC:  { name: 'SICOR CI',                      avgVol:   220, refPrice:  3800,  liq:'L' },
  SIPH:  { name: "SIPH CI Plantations d'Hévéas", avgVol:   290, refPrice:  8900,  liq:'L' },
  SIVC:  { name: "Erium Côte d'Ivoire (ex-Air Liquide CI)", avgVol: 240, refPrice:  2_845,  liq:'L' },
  SLBC:  { name: 'Solibra CI',                    avgVol:    30, refPrice:120000,  liq:'L' },
  SMBC:  { name: 'SMB CI',                        avgVol:   120, refPrice: 15_380,  liq:'L' },
  SNTS:  { name: 'Sonatel (Orange Sénégal)',      avgVol:  3800, refPrice: 15800,  liq:'M' },
  SOGB:  { name: 'SOGB CI',                       avgVol:   520, refPrice:  8_490,  liq:'M' },
  SPHC:  { name: 'SAPH CI (pref.)',               avgVol:    85, refPrice:  4200,  liq:'L' },
  STAC:  { name: 'SETAO CI',                      avgVol:  1670, refPrice:  3100,  liq:'M' },
  STBC:  { name: 'SITAB CI',                      avgVol:   497, refPrice: 21_900,  liq:'M' },
  SVOC:  { name: 'SVO CI',                        avgVol:   680, refPrice:  2200,  liq:'M' },
  TPCI:  { name: 'Tropical Partners CI',          avgVol:    60, refPrice:  1100,  liq:'L' },
  TTLC:  { name: 'TotalEnergies CI',              avgVol:  2800, refPrice:  2_805,  liq:'M' },
  TTLS:  { name: 'TotalEnergies Sénégal',         avgVol:  1200, refPrice:  2100,  liq:'M' },
  UNLC:  { name: 'Unilever CI',                   avgVol:  1100, refPrice:  5600,  liq:'M' },
  UNXC:  { name: "Uniwax Côte d'Ivoire",          avgVol:   260, refPrice:  1_905,  liq:'L' },
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
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === '/health') return json({ status: 'ok', timestamp: Date.now() });
    if (pathname === '/ping') {
      const token  = env.TELEGRAM_BOT_TOKEN;
      const chatId = env.TELEGRAM_CHAT_ID;
      if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN absent de Cloudflare' }, 500);
      if (!chatId) return json({ error: 'TELEGRAM_CHAT_ID absent de Cloudflare', token_ok: true }, 500);
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '🏓 *Bot opérationnel* — les commandes sont actives !', parse_mode: 'Markdown' }),
      }).then(r => r.json());
      return json({ telegram: r, chatId: String(chatId).slice(0, -3) + '***' });
    }
    if (pathname === '/webhook' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (body) ctx.waitUntil(handleTelegramCommand(body, env));
      return new Response('ok');
    }
    // /setup : re-enregistre le webhook Telegram (à visiter dans le navigateur)
    if (pathname === '/setup') {
      const token = env.TELEGRAM_BOT_TOKEN;
      if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN non configuré dans Cloudflare' }, 500);
      const origin     = new URL(request.url).origin;
      const webhookUrl = `${origin}/webhook`;
      const [setRes, infoRes] = await Promise.all([
        fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&allowed_updates=%5B%22message%22%5D`).then(r => r.json()),
        fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then(r => r.json()),
      ]);
      return json({
        setWebhook:  setRes,
        webhookInfo: infoRes,
        webhookUrl,
        hasChatId: !!env.TELEGRAM_CHAT_ID,
      });
    }
    // /run/<job> : déclenche manuellement un cron (diagnostic, ou filet de secours GitHub Actions)
    // ?backup=1 : n'exécute que si le cron Cloudflare ne s'est pas déjà déclenché aujourd'hui
    if (pathname.startsWith('/run/')) {
      const job = pathname.slice('/run/'.length);
      const jobs = {
        'post-fixing': runPostFixing,
        'mid-session': runMidSession,
        'closing':     runClosingBell,
        'weekly-digest': runWeeklyDigest,
      };
      const fn = jobs[job];
      if (!fn) return json({ error: 'Job inconnu', jobs: Object.keys(jobs) }, 404);
      if (url.searchParams.get('backup') === '1' && await cronAlreadyRan(env, job)) {
        return json({ ok: true, job, skipped: true, reason: 'Cron Cloudflare déjà exécuté aujourd\'hui' });
      }
      const started = Date.now();
      await fn(env);
      await markCronRan(env, job);
      return json({ ok: true, job, durationMs: Date.now() - started });
    }
    // /snapshot : capture manuelle d'un instantané de clôture (KV) — utile le
    // premier week-end, avant que runClosingBell() n'en ait posé un automatiquement
    if (pathname === '/snapshot') {
      const { stocks, source } = await fetchLiveStocksRaw();
      if (source !== 'brvm.org' || !stocks.length) {
        return json({ ok: false, error: 'Source non fiable pour un instantané', source, count: stocks.length }, 503);
      }
      await saveStockSnapshot(env, stocks);
      return json({ ok: true, saved: stocks.length, source, date: new Date().toISOString().slice(0, 10) });
    }
    if (pathname === '/portfolio') {
      const portfolio    = await getPortfolio(env);
      const { stocks, source } = await fetchLiveStocks(env);
      const computed     = computePortfolioRows(portfolio, stocks);
      return new Response(renderPortfolioHTML(computed, source), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (pathname === '/portfolio.csv') {
      const portfolio    = await getPortfolio(env);
      const { stocks }   = await fetchLiveStocks(env);
      const computed     = computePortfolioRows(portfolio, stocks);
      const today        = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      return new Response(buildPortfolioCSV(computed), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="BRVM_Portfolio_${today}.csv"`,
        },
      });
    }
    if (pathname === '/' || pathname === '/stocks') {
      const { stocks, source } = await fetchLiveStocks(env);
      return json({ stocks, count: stocks.length, source, timestamp: Date.now() });
    }
    return json({ error: 'Not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    const d = new Date(event.scheduledTime);
    console.log('CRON déclenché :', event.cron, d.toISOString());
    // S'assurer que le webhook Telegram est enregistré à chaque cron
    ctx.waitUntil(ensureWebhook(env));
    // Plan gratuit Cloudflare = 3 crons max → digest vendredi fusionné dans le cron 15h30
    // runAndMark pose un flag KV (cf. cronAlreadyRan) UNIQUEMENT si le job va au bout —
    // le filet de secours GitHub Actions (/run/<job>?backup=1) s'appuie sur ce flag.
    // Dispatch sur l'heure réelle de déclenchement (scheduledTime), pas sur la chaîne
    // event.cron — Cloudflare numérote les jours 1=dimanche...7=samedi (pas 0=dimanche
    // comme le cron Unix standard), ce qui a un temps rendu "1-5" équivalent à
    // dim-jeu au lieu de lun-ven. D'où l'usage de MON-FRI dans wrangler.toml désormais,
    // mais on évite ici toute dépendance à la représentation exacte de la chaîne cron.
    const hm = `${d.getUTCHours()}:${d.getUTCMinutes()}`;
    if (hm === '10:15') ctx.waitUntil(runAndMark(env, 'post-fixing', runPostFixing));
    else if (hm === '13:30') ctx.waitUntil(runAndMark(env, 'mid-session', runMidSession));
    else if (hm === '15:30') {
      ctx.waitUntil(runAndMark(env, 'closing', runClosingBell));
      if (d.getUTCDay() === 5) ctx.waitUntil(runAndMark(env, 'weekly-digest', runWeeklyDigest));
    }
    else console.warn('Cron non reconnu :', event.cron, hm);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CLOUDFLARE KV — Portefeuille dynamique
// ═══════════════════════════════════════════════════════════════════════════════

async function getPortfolio(env) {
  try {
    const data = await env.PORTFOLIO_KV.get('portfolio', { type: 'json' });
    if (data?.positions?.length) return data.positions;
  } catch (e) { console.warn('KV lecture échouée — fallback hardcodé:', e.message); }
  return USER_PORTFOLIO;   // fallback si KV vide ou non configuré
}

async function savePortfolio(env, positions) {
  await env.PORTFOLIO_KV.put('portfolio', JSON.stringify({
    positions,
    lastUpdated: new Date().toISOString(),
  }));
}

// ─── Objectifs de vente (KV) ───────────────────────────────────────────────────
// Snapshot des cibles "Objectif" (reco.sortie, positions CONSERVER) posé à chaque
// clôture, comparé au cours du jour suivant pour détecter qu'il a été franchi.
// Une cible calculée sur le cours du jour même (sortie = price × 1.0x) serait
// toujours au-dessus du cours actuel — donc jamais "atteinte" sans ce décalage.
async function getObjectifs(env) {
  try {
    return await env.PORTFOLIO_KV.get('objectifs', { type: 'json' }) || {};
  } catch (e) { return {}; }
}

async function saveObjectifs(env, objectifs) {
  try {
    await env.PORTFOLIO_KV.put('objectifs', JSON.stringify(objectifs));
  } catch (e) { console.warn('KV saveObjectifs échoué:', e.message); }
}

// ─── Cache cours de clôture (KV) ───────────────────────────────────────────────
// La BRVM est fermée le week-end : fetchLiveStocks(env) restitue alors le dernier
// instantané enregistré à la clôture (vendredi 15h30), au lieu d'interroger
// brvm.org/Yahoo qui peuvent renvoyer des données obsolètes ou hors-sujet hors
// séance. L'instantané est posé par runClosingBell() chaque jour ouvré.
async function saveStockSnapshot(env, stocks) {
  try {
    await env.PORTFOLIO_KV.put('stocks:snapshot', JSON.stringify({
      stocks,
      date: new Date().toISOString().slice(0, 10),
    }));
  } catch (e) { console.warn('KV saveStockSnapshot échoué:', e.message); }
}

async function loadStockSnapshot(env) {
  try {
    return await env.PORTFOLIO_KV.get('stocks:snapshot', { type: 'json' });
  } catch (e) { return null; }
}

// ─── Filet de secours cron (KV) ────────────────────────────────────────────────
// Marque dans le KV qu'un job cron a été exécuté aujourd'hui. Le filet de secours
// GitHub Actions (/run/<job>?backup=1) vérifie ce flag : si le cron Cloudflare a
// déjà tourné jusqu'au bout, le backup ne fait rien (pas de doublon d'alerte).
function todayKey(job) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `cron:${job}:${date}`;
}

async function cronAlreadyRan(env, job) {
  try {
    return !!(await env.PORTFOLIO_KV.get(todayKey(job)));
  } catch (e) { return false; }
}

async function markCronRan(env, job) {
  try {
    await env.PORTFOLIO_KV.put(todayKey(job), '1', { expirationTtl: 86400 * 2 });
  } catch (e) { console.warn('KV markCronRan échoué:', e.message); }
}

async function runAndMark(env, job, fn) {
  await fn(env);
  await markCronRan(env, job);
}

// ─── Recommandation par position ──────────────────────────────────────────────
// Basée sur le P&L : stop-loss adapté à la liquidité du titre — un -3/-4% sur
// une valeur peu échangée ('L', cf. BOAM avgVol ~95) est souvent du bruit, pas
// un signal. Seuils : -3% (liquidité 'H'), -5% ('M'), -8% ('L').
// Multibagger >+80%, position solide entre +15% et +80% (cf. digest hebdo).
// Chaque recommandation inclut un horizon de placement indicatif et des
// niveaux de prix (sortie/stop, renforcement) pour guider la décision.

const STOP_LOSS_BY_LIQ = { H: -3, M: -5, L: -8 };

function getRecommendation(pnlPct, price, avgCost, liq) {
  const f = n => Math.round(n).toLocaleString();
  const stopLoss = STOP_LOSS_BY_LIQ[liq] ?? -3;
  if (pnlPct <= stopLoss) {
    const entree = Math.round(price * 0.97);
    return {
      emoji: '🔴', label: 'VENDRE', className: 'vendre',
      horizon: 'Immédiat',
      sortie: price, entree,
      detail: `Sortir ≈ ${f(price)} F · Stop-loss franchi (${stopLoss}%) · Ré-achat possible sous ${f(entree)} F`,
    };
  }
  if (pnlPct < 0) {
    const stop   = Math.round(avgCost * (1 + stopLoss / 100));
    const entree = Math.round(price * 0.97);
    return {
      emoji: '⚠️', label: 'SURVEILLER', className: 'surveiller',
      horizon: 'Court terme (1-2 sem.)',
      sortie: stop, entree,
      detail: `Stop à ${f(stop)} F (${stopLoss}%) · Renforcer sous ${f(entree)} F`,
    };
  }
  if (pnlPct > 80) {
    const stop = Math.round(price * 0.95);
    return {
      emoji: '💎', label: 'ALLÉGER', className: 'alleger',
      horizon: 'Maintenant',
      sortie: price, stop,
      detail: `Alléger ≈ ${f(price)} F · Stop suiveur à ${f(stop)} F sur le solde`,
    };
  }
  if (pnlPct >= 15) {
    const sortie = Math.round(price * 1.075);
    const stop   = Math.round(price * 0.95);
    return {
      emoji: '🚀', label: 'CONSERVER', className: 'conserver',
      horizon: 'Moyen-long terme (3-6 mois)',
      sortie, stop,
      detail: `Objectif ${f(sortie)} F · Stop suiveur à ${f(stop)} F`,
    };
  }
  const sortie = Math.round(price * 1.04);
  const stop   = Math.round(avgCost * 0.97);
  return {
    emoji: '➡️', label: 'CONSERVER', className: 'conserver',
    horizon: 'Moyen terme (1-3 mois)',
    sortie, stop,
    detail: `Objectif ${f(sortie)} F · Stop à ${f(stop)} F`,
  };
}

// ─── Calcul partagé des positions (Telegram /portfolio, /export, page HTML) ──

function computePortfolioRows(portfolio, stocks) {
  const rows = portfolio.map(pos => {
    const stock  = stocks.find(s => s.symbol === pos.symbol);
    const price  = stock?.price || KNOWN_STOCKS[pos.symbol]?.refPrice || pos.avgCost;
    const pnlPct = (price - pos.avgCost) / pos.avgCost * 100;
    const pnlF   = Math.round((price - pos.avgCost) * pos.qty);
    const valeur = Math.round(price * pos.qty);
    const cout   = Math.round(pos.avgCost * pos.qty);
    return {
      symbol: pos.symbol,
      name: KNOWN_STOCKS[pos.symbol]?.name || pos.symbol,
      qty: pos.qty, avgCost: pos.avgCost, price, pnlPct, pnlF, valeur, cout,
      reco: getRecommendation(pnlPct, price, pos.avgCost, KNOWN_STOCKS[pos.symbol]?.liq),
    };
  });
  rows.sort((a, b) => b.pnlPct - a.pnlPct);
  const totalVal  = rows.reduce((s, r) => s + r.valeur, 0);
  const totalCout = rows.reduce((s, r) => s + r.cout, 0);
  const totalPnl  = totalVal - totalCout;
  const totalPct  = totalCout > 0 ? totalPnl / totalCout * 100 : 0;
  return { rows, totalVal, totalCout, totalPnl, totalPct };
}

function buildPortfolioCSV({ rows, totalVal, totalCout, totalPnl, totalPct }) {
  const header = 'Symbole,Nom,Quantite,Cout Moyen (F),Cours Actuel (F),Valeur (F),P&L (F),P&L (%),Cout Total (F),Recommandation,Horizon,Prix Sortie/Stop (F),Prix Renforcement (F),Detail';
  const lines  = rows.map(r =>
    `${r.symbol},${r.name.replace(/,/g,' ')},${r.qty},${r.avgCost},${r.price},${r.valeur},${r.pnlF},${r.pnlPct.toFixed(1)},${r.cout},${r.reco.label},${r.reco.horizon},${r.reco.sortie ?? r.reco.stop ?? ''},${r.reco.entree ?? ''},${r.reco.detail.replace(/,/g,' ')}`
  );
  lines.push(`TOTAL,,,,,${totalVal},${totalPnl},${totalPct.toFixed(1)},${totalCout},,,,`);
  return [header, ...lines].join('\n');
}

function renderPortfolioHTML({ rows, totalVal, totalCout, totalPnl, totalPct }, source) {
  const fmt  = n => Math.round(n).toLocaleString('fr-FR');
  const sign = n => n >= 0 ? '+' : '';
  const updated = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', dateStyle: 'long', timeStyle: 'short' });
  const sourceNote = source?.startsWith('clôture vendredi')
    ? ` · 🗓 Marché fermé — cours de la ${source}`
    : '';

  const tr = rows.map(r => `
    <tr>
      <td class="sym"><strong>${r.symbol}</strong><br><span class="name">${r.name}</span></td>
      <td class="num">${r.qty}</td>
      <td class="num">${fmt(r.avgCost)}</td>
      <td class="num">${fmt(r.price)}</td>
      <td class="num">${fmt(r.valeur)}</td>
      <td class="num ${r.pnlF >= 0 ? 'pos' : 'neg'}">${sign(r.pnlF)}${fmt(r.pnlF)}</td>
      <td class="num ${r.pnlPct >= 0 ? 'pos' : 'neg'}">${sign(r.pnlPct)}${r.pnlPct.toFixed(1)}%</td>
      <td class="reco"><span class="badge badge-${r.reco.className}">${r.reco.emoji} ${r.reco.label}</span><br><span class="horizon">⏱ ${r.reco.horizon}</span>${r.reco.detail ? `<br><span class="name">${r.reco.detail}</span>` : ''}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Portefeuille BRVM</title>
<style>
  :root { --orange:#E8762C; --navy:#1B2A4A; --green:#1E8E3E; --red:#D93025; --bg:#F5F6F8; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#222; padding:20px; }
  .container { max-width:900px; margin:0 auto; }
  header { background:var(--navy); color:#fff; padding:24px; border-radius:12px 12px 0 0; }
  header h1 { margin:0; font-size:1.6rem; }
  header p { margin:6px 0 0; opacity:.8; font-size:.9rem; }
  .summary { display:flex; flex-wrap:wrap; gap:12px; background:#fff; padding:16px; }
  .card { flex:1; min-width:140px; background:var(--bg); border-radius:10px; padding:14px 16px; text-align:center; }
  .card .label { display:block; font-size:.78rem; color:#666; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
  .card .value { font-size:1.3rem; font-weight:700; }
  .card.pos .value { color:var(--green); }
  .card.neg .value { color:var(--red); }
  table { width:100%; border-collapse:collapse; background:#fff; }
  th, td { padding:10px 12px; text-align:left; border-bottom:1px solid #eee; font-size:.88rem; }
  th { background:var(--orange); color:#fff; font-weight:600; position:sticky; top:0; }
  td.num, th.num { text-align:right; }
  td.name { color:#888; font-size:.78rem; }
  .name { color:#888; font-size:.75rem; }
  .horizon { color:#888; font-size:.72rem; font-style:italic; }
  .pos { color:var(--green); font-weight:600; }
  .neg { color:var(--red); font-weight:600; }
  tbody tr:nth-child(even) { background:#fafafa; }
  .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:.78rem; font-weight:700; white-space:nowrap; }
  .badge-vendre     { background:#FCE8E6; color:var(--red); }
  .badge-surveiller { background:#FEF7E0; color:#B25C00; }
  .badge-conserver  { background:#E6F4EA; color:var(--green); }
  .badge-alleger    { background:#E8EAF6; color:#3949AB; }
  .actions { background:#fff; padding:16px; border-radius:0 0 12px 12px; display:flex; gap:10px; flex-wrap:wrap; }
  .btn { display:inline-block; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600; font-size:.9rem; cursor:pointer; border:none; }
  .btn-fill { background:var(--orange); color:#fff; }
  .btn-outline { background:#fff; color:var(--navy); border:1.5px solid var(--navy); }
  @media print {
    body { background:#fff; padding:0; }
    .actions { display:none; }
    header { border-radius:0; }
  }
  @media (max-width:600px) {
    th, td { padding:8px 6px; font-size:.78rem; }
    header h1 { font-size:1.3rem; }
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>💼 Portefeuille BRVM</h1>
    <p>Mis à jour le ${updated} (heure d'Abidjan) · ${rows.length} positions${sourceNote}</p>
  </header>
  <div class="summary">
    <div class="card"><span class="label">Valeur marchande</span><span class="value">${fmt(totalVal)} F</span></div>
    <div class="card"><span class="label">Coût total</span><span class="value">${fmt(totalCout)} F</span></div>
    <div class="card ${totalPnl >= 0 ? 'pos' : 'neg'}"><span class="label">P&amp;L global</span><span class="value">${sign(totalPnl)}${fmt(totalPnl)} F (${sign(totalPct)}${totalPct.toFixed(1)}%)</span></div>
  </div>
  <table>
    <thead><tr>
      <th>Titre</th><th class="num">Qté</th><th class="num">Coût moy.</th><th class="num">Cours</th>
      <th class="num">Valeur</th><th class="num">P&amp;L (F)</th><th class="num">P&amp;L (%)</th><th>Recommandation</th>
    </tr></thead>
    <tbody>${tr}</tbody>
  </table>
  <div class="actions">
    <a class="btn btn-fill" href="/portfolio.csv" download>⬇️ Télécharger en CSV</a>
    <button class="btn btn-outline" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
  </div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMMANDES TELEGRAM — /buy /sell /portfolio /help
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTelegramCommand(update, env) {
  try {
    const msg = update.message || update.edited_message;
    if (!msg?.text) return;

    // Répondre directement à l'expéditeur — pas de dépendance à TELEGRAM_CHAT_ID
    const replyTo = String(msg.chat.id);
    const reply   = (text) => tg(env, text, replyTo);

    const parts = msg.text.trim().split(/\s+/);
    const cmd   = parts[0].toLowerCase().replace(/\//g, '').split('@')[0];

    if (cmd === 'buy') {
      const symbol = parts[1]?.toUpperCase();
      const qty    = parseInt(parts[2]);
      const price  = parseInt(parts[3]);
      if (!symbol || !qty || !price || isNaN(qty) || isNaN(price)) {
        await reply('❌ Usage : `/buy SYMBOLE QUANTITE PRIX`\nExemple : `/buy SGBC 5 12750`');
        return;
      }
      if (!KNOWN_STOCKS[symbol]) {
        await reply(`❌ Symbole *${symbol}* inconnu. Vérifie le ticker BRVM.`);
        return;
      }
      const portfolio = await getPortfolio(env);
      const existing  = portfolio.find(p => p.symbol === symbol);
      if (existing) {
        const totalQty   = existing.qty + qty;
        const newAvgCost = Math.round((existing.qty * existing.avgCost + qty * price) / totalQty);
        existing.qty     = totalQty;
        existing.avgCost = newAvgCost;
        await savePortfolio(env, portfolio);
        await reply([
          `✅ *Renforcement enregistré — ${symbol}*`,
          `📊 Nouvelle position : *${totalQty} titres* · Coût moyen pondéré : *${newAvgCost.toLocaleString()} F*`,
          `🛑 Nouveau stop-loss : ${Math.round(newAvgCost * 0.97).toLocaleString()} F`,
          `🎯 Objectif : ${Math.round(newAvgCost * 1.04).toLocaleString()} F`,
        ].join('\n'));
      } else {
        portfolio.push({ symbol, qty, avgCost: price });
        await savePortfolio(env, portfolio);
        await reply([
          `✅ *Nouvelle position enregistrée — ${symbol}*`,
          `📌 *${qty} titre${qty > 1 ? 's' : ''}* @ ${price.toLocaleString()} F · Total : ${(qty * price).toLocaleString()} F`,
          `🛑 Stop-loss : ${Math.round(price * 0.97).toLocaleString()} F`,
          `🎯 Objectif : ${Math.round(price * 1.04).toLocaleString()} F`,
          `🚀 Max BRVM : ${Math.round(price * 1.075).toLocaleString()} F`,
        ].join('\n'));
      }

    } else if (cmd === 'sell') {
      const symbol = parts[1]?.toUpperCase();
      const qty    = parseInt(parts[2]);
      if (!symbol || !qty || isNaN(qty)) {
        await reply('❌ Usage : `/sell SYMBOLE QUANTITE`\nExemple : `/sell BOAM 30`');
        return;
      }
      const portfolio = await getPortfolio(env);
      const idx       = portfolio.findIndex(p => p.symbol === symbol);
      if (idx === -1) {
        await reply(`❌ *${symbol}* introuvable dans ton portefeuille.`);
        return;
      }
      const pos = portfolio[idx];
      if (qty >= pos.qty) {
        portfolio.splice(idx, 1);
        await savePortfolio(env, portfolio);
        await reply(`✅ *Position ${symbol} clôturée* — ${pos.qty} titre${pos.qty > 1 ? 's' : ''} retirés du suivi.`);
      } else {
        pos.qty -= qty;
        await savePortfolio(env, portfolio);
        await reply(`✅ *${symbol} réduit* — il reste *${pos.qty} titres* @ coût moy. ${pos.avgCost.toLocaleString()} F.`);
      }

    } else if (cmd === 'portfolio' || cmd === 'p') {
      const portfolio  = await getPortfolio(env);
      const { stocks } = await fetchLiveStocks(env);
      const { rows, totalVal, totalPnl, totalPct } = computePortfolioRows(portfolio, stocks);
      const lines = [`💼 *Portefeuille BRVM* — ${rows.length} positions`, ''];
      for (const r of rows) {
        const sign = r.pnlPct >= 0 ? '+' : '';
        lines.push(`${r.reco.emoji} *${r.symbol}* ${r.qty}× · ${sign}${r.pnlPct.toFixed(1)}% _(${sign}${r.pnlF.toLocaleString()} F)_ — *${r.reco.label}*`);
        lines.push(`   ⏱ ${r.reco.horizon} · ${r.reco.detail}`);
      }
      lines.push('');
      lines.push(`💰 *Total : ${Math.round(totalVal).toLocaleString()} F*`);
      lines.push(`📊 P&L : *${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()} F* (${totalPnl >= 0 ? '+' : ''}${totalPct.toFixed(1)}%)`);
      lines.push('');
      lines.push(`🔗 Vue détaillée : ${WORKER_URL}/portfolio`);
      await reply(lines.join('\n'));

    } else if (cmd === 'export') {
      const portfolio  = await getPortfolio(env);
      const { stocks } = await fetchLiveStocks(env);
      const computed   = computePortfolioRows(portfolio, stocks);
      const { totalPnl, totalPct, rows } = computed;
      const csv    = buildPortfolioCSV(computed);
      const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const cap    = `💼 ${rows.length} positions · P&L ${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()} F (${totalPnl >= 0 ? '+' : ''}${totalPct.toFixed(1)}%)`;
      await sendDocument(env, csv, `BRVM_Portfolio_${today}.csv`, replyTo, cap);

    } else if (cmd === 'help' || cmd === 'aide' || cmd === 'start') {
      await reply([
        '📖 *Commandes disponibles :*',
        '━━━━━━━━━━━━━━━━━━━━━',
        '`/buy SGBC 5 12750` — enregistrer un achat',
        '`/buy SIBC 10 8600` — renforcer (recalcule le coût moyen)',
        '`/sell BOAM 30` — vendre (tout ou partie)',
        '`/portfolio` — voir toutes tes positions avec P&L live',
        '`/export` — recevoir le portefeuille en fichier CSV',
        '',
        `🔗 *Page complète :* ${WORKER_URL}/portfolio`,
        '_(téléchargeable en CSV ou imprimable en PDF)_',
        '',
        '_Les alertes 13h30 et 15h30 surveillent automatiquement_',
        '_tes stops et t\'alertent si un seuil est franchi._',
      ].join('\n'));
    }
  } catch (e) {
    console.error('handleTelegramCommand erreur:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  1. POST-FIXING 10h15 — Signaux MPR/OBI/Iceberg
// ═══════════════════════════════════════════════════════════════════════════════

async function runPostFixing(env) {
  try {
    const day = new Date().getUTCDay();
    if (day === 0 || day === 6) { console.log('Weekend — scan ignoré.'); return; }

    const { stocks, source } = await fetchLiveStocks(env);

    if (!stocks.length) {
      await tg(env, [
        '⚠️ *BRVM Post-Fixing — Sources Indisponibles*',
        '━━━━━━━━━━━━━━━━━━━━━',
        '🌐 BRVM.org et Yahoo Finance inaccessibles.',
        '_Réessai automatique demain à 10h15 GMT._',
      ].join('\n'));
      return;
    }

    const portfolio   = await getPortfolio(env);
    const allAnalyzed = stocks.map(s => analyzeSignal(s));
    const signals     = allAnalyzed.filter(s => s.alert);
    console.log(`${stocks.length} valeurs depuis "${source}" — ${signals.length} signal(s).`);

    // Détection alerte sectorielle
    const sectorAlert = getSectorAlert(signals);

    if (!signals.length) {
      const heure  = nowAbidjan();
      const top3   = allAnalyzed
        .filter(s => s.mpr > 0 || s.volume > 0)
        .sort((a, b) => b.mpr - a.mpr)
        .slice(0, 3);
      const top3Lines = top3.length
        ? top3.map(s => {
            const th = getThresholds(KNOWN_STOCKS[s.symbol]?.avgVol || 300);
            return `  • *${s.symbol}* — ${s.name}\n    MPR ${s.mpr.toFixed(2)} _(seuil ${th.mpr})_ · OBI ${s.obi.toFixed(3)} · Vol ${s.volume.toLocaleString()} · ${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`;
          }).join('\n')
        : '  _Données insuffisantes_';

      await tg(env, [
        '✅ *BRVM — Scan Post-Fixing*',
        '━━━━━━━━━━━━━━━━━━━━━',
        `📊 *${stocks.length}* valeurs · ${source} · ${heure} GMT`,
        '',
        '_Aucun signal au-dessus des seuils._',
        '',
        `📉 *Top 3 pressions du jour :*`,
        top3Lines,
        sectorAlert ? `\n${sectorAlert}` : '',
      ].filter(l => l !== '').join('\n'));
      return;
    }

    // Envoyer les signaux
    if (sectorAlert) await tg(env, sectorAlert);
    for (const sig of signals) await sendSignalTelegram(env, sig, source, portfolio);

  } catch (err) {
    console.error('runPostFixing erreur:', err);
    await tg(env, `🔴 *BRVM Worker — Erreur Post-Fixing*\n\`${err.message}\``);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  2. MID-SESSION 13h30 — Surveillance stops portefeuille
// ═══════════════════════════════════════════════════════════════════════════════

async function runMidSession(env) {
  try {
    const day = new Date().getUTCDay();
    if (day === 0 || day === 6) return;

    const { stocks, source } = await fetchLiveStocks(env);
    if (!stocks.length) {
      await tg(env, '⚠️ *Mid-Session* : données indisponibles — surveillance impossible.');
      return;
    }

    const stopsHit  = [];   // stop-loss franchi
    const stopsWarn = [];   // proche du stop (dans 1%)
    const newSignals = [];  // nouveau signal sur un titre déjà en portefeuille

    const portfolio = await getPortfolio(env);
    for (const pos of portfolio) {
      const stock = stocks.find(s => s.symbol === pos.symbol);
      if (!stock) continue;

      const meta       = KNOWN_STOCKS[pos.symbol];
      const stopPct    = STOP_LOSS_BY_LIQ[meta?.liq] ?? -3;
      const stopLevel  = pos.avgCost * (1 + stopPct / 100);
      const warnLevel  = stopLevel   * (1 + WARN_STOP_PCT);
      const pnlPct     = (stock.price - pos.avgCost) / pos.avgCost * 100;
      const pnlFcfa    = (stock.price - pos.avgCost) * pos.qty;

      if (stock.price <= stopLevel) {
        stopsHit.push({ ...pos, currentPrice: stock.price, pnlPct, pnlFcfa, stopLevel });
      } else if (stock.price <= warnLevel) {
        stopsWarn.push({ ...pos, currentPrice: stock.price, pnlPct, pnlFcfa, stopLevel });
      }

      // Nouveau signal sur titre déjà détenu ?
      if (meta) {
        const sig = analyzeSignal(stock);
        if (sig.alert && sig.confidence !== 'LOW') {
          newSignals.push({ ...sig, pos, pnlPct });
        }
      }
    }

    // Pas d'alerte = ne rien envoyer (évite le spam si tout va bien)
    if (!stopsHit.length && !stopsWarn.length && !newSignals.length) {
      console.log('Mid-session : aucune alerte portefeuille.');
      return;
    }

    const lines = ['🔔 *BRVM — Alerte Mid-Session 13h30*', '━━━━━━━━━━━━━━━━━━━━━'];

    if (stopsHit.length) {
      lines.push('', '🛑 *STOP-LOSS FRANCHI — VENDRE MAINTENANT :*');
      stopsHit.forEach(p => lines.push(
        `  • *${p.symbol}* — cours ${p.currentPrice.toLocaleString()} F` +
        ` (stop ${Math.round(p.stopLevel).toLocaleString()} F)` +
        ` · P&L ${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct.toFixed(1)}%` +
        ` *(${p.pnlFcfa >= 0 ? '+' : ''}${Math.round(p.pnlFcfa).toLocaleString()} F)*`
      ));
    }

    if (stopsWarn.length) {
      lines.push('', '⚠️ *Proche du stop-loss — surveiller :*');
      stopsWarn.forEach(p => lines.push(
        `  • *${p.symbol}* — cours ${p.currentPrice.toLocaleString()} F` +
        ` · Stop : ${Math.round(p.stopLevel).toLocaleString()} F` +
        ` · Écart : ${((p.currentPrice - p.stopLevel) / p.stopLevel * 100).toFixed(1)}%`
      ));
    }

    if (newSignals.length) {
      lines.push('', '📈 *Nouveau signal sur titre détenu :*');
      newSignals.forEach(s => {
        const emoji = s.confidence === 'HIGH' ? '🔴' : '🟠';
        lines.push(
          `  ${emoji} *${s.symbol}* — ${s.name}` +
          ` · Confiance : ${s.confidence}` +
          ` · MPR ${s.mpr.toFixed(2)}` +
          ` · Position actuelle : ${s.pos.qty} titres (${s.pnlPct >= 0 ? '+' : ''}${s.pnlPct.toFixed(1)}%)`
        );
      });
    }

    lines.push('', `_Source : ${source} · ${nowAbidjan()} GMT_`);
    await tg(env, lines.join('\n'));

  } catch (err) {
    console.error('runMidSession erreur:', err);
    await tg(env, `🔴 *BRVM Worker — Erreur Mid-Session*\n\`${err.message}\``);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  3. CLÔTURE 15h30 — Bilan du jour + portefeuille
// ═══════════════════════════════════════════════════════════════════════════════

async function runClosingBell(env) {
  try {
    const day = new Date().getUTCDay();
    if (day === 0 || day === 6) return;

    const { stocks, source } = await fetchLiveStocks(env);
    if (!stocks.length) {
      await tg(env, '⚠️ *Clôture BRVM* : données indisponibles.');
      return;
    }

    // Instantané de clôture — restitué le week-end par fetchLiveStocks()
    await saveStockSnapshot(env, stocks);

    const dated = stocks
      .filter(s => s.changePercent !== 0)
      .sort((a, b) => b.changePercent - a.changePercent);

    const top5  = dated.slice(0, 5);
    const bot5  = dated.slice(-5).reverse();

    // Performances portefeuille
    const portfolio = await getPortfolio(env);
    const positions = portfolio.map(pos => {
      const stock = stocks.find(s => s.symbol === pos.symbol);
      if (!stock) return null;
      const pnlTotal = (stock.price - pos.avgCost) / pos.avgCost * 100;
      return {
        ...pos,
        currentPrice: stock.price,
        chgDay:   stock.changePercent,
        pnlTotal,
        pnlFcfa:  (stock.price - pos.avgCost) * pos.qty,
        reco: getRecommendation(pnlTotal, stock.price, pos.avgCost, KNOWN_STOCKS[pos.symbol]?.liq),
      };
    }).filter(Boolean);

    const totalValeur = positions.reduce((s, p) => s + p.currentPrice * p.qty, 0);
    const totalCout   = positions.reduce((s, p) => s + p.avgCost     * p.qty, 0);
    const totalPnl    = totalValeur - totalCout;
    const totalPct    = totalCout > 0 ? totalPnl / totalCout * 100 : 0;

    const stopsHit    = positions.filter(p => {
      const stopPct = STOP_LOSS_BY_LIQ[KNOWN_STOCKS[p.symbol]?.liq] ?? -3;
      return p.currentPrice <= p.avgCost * (1 + stopPct / 100);
    });

    // Objectifs de vente atteints — voir getObjectifs/saveObjectifs ci-dessus
    const prevObjectifs = await getObjectifs(env);
    const objectifsHit  = [];
    const nextObjectifs = {};
    for (const p of positions) {
      if (p.reco.label === 'CONSERVER') {
        const prev = prevObjectifs[p.symbol];
        if (prev && p.currentPrice >= prev.sortie) objectifsHit.push({ ...p, objectif: prev.sortie });
        nextObjectifs[p.symbol] = { sortie: p.reco.sortie };
      }
    }
    await saveObjectifs(env, nextObjectifs);

    const dayWinners  = positions.filter(p => p.chgDay > 0).sort((a, b) => b.chgDay - a.chgDay).slice(0, 3);
    const dayLosers   = positions.filter(p => p.chgDay < 0).sort((a, b) => a.chgDay - b.chgDay).slice(0, 3);

    const lines = [
      '🔔 *BRVM — Bilan de Clôture*',
      '━━━━━━━━━━━━━━━━━━━━━',
      `📅 ${new Date().toLocaleDateString('fr-FR')} · ${stocks.length} titres · ${source}`,
    ];

    if (top5.length) {
      lines.push('', '📈 *Top 5 hausses du jour :*');
      top5.forEach(s => lines.push(`  • *${s.symbol}* ${s.name.substring(0,18)} : *+${s.changePercent.toFixed(2)}%*`));
    }

    if (bot5.length) {
      lines.push('', '📉 *Top 5 baisses du jour :*');
      bot5.forEach(s => lines.push(`  • *${s.symbol}* ${s.name.substring(0,18)} : *${s.changePercent.toFixed(2)}%*`));
    }

    if (positions.length) {
      lines.push('', `💼 *Ton portefeuille — ${positions.length} lignes :*`);
      lines.push(`💰 Valeur totale : *${Math.round(totalValeur).toLocaleString()} FCFA*`);
      lines.push(`📊 P&L global : *${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()} FCFA* _(${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(1)}%)_`);
    }

    if (dayWinners.length) {
      lines.push('', '✅ *Tes hausses aujourd\'hui :*');
      dayWinners.forEach(p => lines.push(
        `  • *${p.symbol}* : +${p.chgDay.toFixed(2)}% · Total *${p.pnlTotal >= 0 ? '+' : ''}${p.pnlTotal.toFixed(1)}%*`
      ));
    }

    if (dayLosers.length) {
      lines.push('', '🔻 *Tes baisses aujourd\'hui :*');
      dayLosers.forEach(p => lines.push(
        `  • *${p.symbol}* : ${p.chgDay.toFixed(2)}% · Total *${p.pnlTotal >= 0 ? '+' : ''}${p.pnlTotal.toFixed(1)}%*`
      ));
    }

    if (stopsHit.length) {
      lines.push('', '🛑 *STOP-LOSS FRANCHIS — décision requise demain :*');
      stopsHit.forEach(p => lines.push(
        `  • *${p.symbol}* @ ${p.currentPrice.toLocaleString()} F (coût moy. ${p.avgCost.toLocaleString()} F) · *${p.pnlTotal.toFixed(1)}%*`
      ));
    }

    if (objectifsHit.length) {
      lines.push('', '🎯 *OBJECTIF DE VENTE ATTEINT :*');
      objectifsHit.forEach(p => lines.push(
        `  • *${p.symbol}* @ ${p.currentPrice.toLocaleString()} F (objectif ${Math.round(p.objectif).toLocaleString()} F) · *${p.pnlTotal >= 0 ? '+' : ''}${p.pnlTotal.toFixed(1)}%*`
      ));
    }

    await tg(env, lines.join('\n'));

  } catch (err) {
    console.error('runClosingBell erreur:', err);
    await tg(env, `🔴 *BRVM Worker — Erreur Clôture*\n\`${err.message}\``);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  4. DIGEST HEBDOMADAIRE — Vendredi 15h45
// ═══════════════════════════════════════════════════════════════════════════════

async function runWeeklyDigest(env) {
  try {
    const { stocks, source } = await fetchLiveStocks(env);
    if (!stocks.length) {
      await tg(env, '⚠️ *Digest hebdomadaire* : données indisponibles.');
      return;
    }

    const weekPortfolio = await getPortfolio(env);
    const positions = weekPortfolio.map(pos => {
      const stock = stocks.find(s => s.symbol === pos.symbol);
      if (!stock) return null;
      return {
        ...pos,
        currentPrice: stock.price,
        pnlTotal:     (stock.price - pos.avgCost) / pos.avgCost * 100,
        pnlFcfa:      (stock.price - pos.avgCost) * pos.qty,
      };
    }).filter(Boolean);

    const totalValeur  = positions.reduce((s, p) => s + p.currentPrice * p.qty, 0);
    const totalCout    = positions.reduce((s, p) => s + p.avgCost     * p.qty, 0);
    const totalPnl     = totalValeur - totalCout;
    const totalPct     = totalCout > 0 ? totalPnl / totalCout * 100 : 0;

    const multibaggers = positions.filter(p => p.pnlTotal > 80)
      .sort((a, b) => b.pnlTotal - a.pnlTotal);
    const risked       = positions.filter(p => p.pnlTotal < (STOP_LOSS_BY_LIQ[KNOWN_STOCKS[p.symbol]?.liq] ?? -3));
    const solidGains   = positions.filter(p => p.pnlTotal >= 15 && p.pnlTotal <= 80)
      .sort((a, b) => b.pnlTotal - a.pnlTotal).slice(0, 4);

    // Dividendes imminents
    const divWarnings = positions
      .map(p => ({ pos: p, w: getDividendWarning(p.symbol) }))
      .filter(x => x.w !== null);

    const marketMovers = stocks
      .filter(s => Math.abs(s.changePercent) > 2)
      .sort((a, b) => b.changePercent - a.changePercent);

    const weekDate = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    const lines = [
      '📰 *BRVM — Digest Hebdomadaire*',
      '━━━━━━━━━━━━━━━━━━━━━',
      `📅 ${weekDate}`,
      '',
      '💼 *État de ton portefeuille :*',
      `💰 Valeur marchande : *${Math.round(totalValeur).toLocaleString()} FCFA*`,
      `📊 P&L global : *${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()} FCFA* _(${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(1)}%)_`,
      `📈 ${positions.filter(p => p.pnlTotal > 0).length} positions gagnantes · 📉 ${positions.filter(p => p.pnlTotal < 0).length} perdantes`,
    ];

    if (multibaggers.length) {
      lines.push('', '💎 *Multibaggers — sécuriser les gains :*');
      multibaggers.forEach(p => lines.push(
        `  • *${p.symbol}* — ${KNOWN_STOCKS[p.symbol]?.name || p.symbol}` +
        ` : *+${p.pnlTotal.toFixed(1)}%* (+${Math.round(p.pnlFcfa).toLocaleString()} F)` +
        `\n    ⚡ Stop protection recommandé : *${Math.round(p.currentPrice * 0.95).toLocaleString()} F* (−5% du cours actuel)`
      ));
    }

    if (solidGains.length) {
      lines.push('', '🚀 *Positions solides :*');
      solidGains.forEach(p => lines.push(
        `  • *${p.symbol}* : +${p.pnlTotal.toFixed(1)}% (+${Math.round(p.pnlFcfa).toLocaleString()} F)`
      ));
    }

    if (risked.length) {
      lines.push('', '⚠️ *Positions à risque — stop franchi :*');
      risked.forEach(p => lines.push(
        `  • *${p.symbol}* : ${p.pnlTotal.toFixed(1)}% (${Math.round(p.pnlFcfa).toLocaleString()} F)`
      ));
    }

    if (divWarnings.length) {
      lines.push('', '🗓 *Dividendes imminents :*');
      divWarnings.forEach(({ pos, w }) => lines.push(`  • *${pos.symbol}* : ${w}`));
    }

    if (marketMovers.length) {
      lines.push('', '📊 *Mouvements notables du marché :*');
      marketMovers.slice(0, 5).forEach(s => lines.push(
        `  • *${s.symbol}* : ${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`
      ));
    }

    lines.push('', '_Prochain scan lundi 10h15 GMT — bonne semaine_ 🌍');
    await tg(env, lines.join('\n'));

  } catch (err) {
    console.error('runWeeklyDigest erreur:', err);
    await tg(env, `🔴 *BRVM Worker — Erreur Digest*\n\`${err.message}\``);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FETCH DONNÉES BRVM
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchLiveStocks(env) {
  // BRVM fermée le week-end → restituer la clôture de vendredi (KV) plutôt que
  // d'interroger brvm.org/Yahoo (réponses hors-séance peu fiables).
  const day = new Date().getUTCDay();
  if (env && (day === 0 || day === 6)) {
    const snapshot = await loadStockSnapshot(env);
    if (snapshot?.stocks?.length) {
      return { stocks: snapshot.stocks, source: `clôture vendredi ${snapshot.date}` };
    }
  }

  return fetchLiveStocksRaw();
}

async function fetchLiveStocksRaw(retried = false) {
  // Toutes les variantes BRVM.org sont tentées EN PARALLÈLE avec un timeout
  // réel (AbortController — `cf: { timeout }` n'a aucun effet sur fetch()).
  // Avant : 5 tentatives séquentielles pouvant dépasser le budget d'exécution
  // du Cron Trigger Cloudflare et empêcher l'envoi du message Telegram (le
  // cron remontait "Réussite" car scheduled() retournait avant la fin réelle
  // du traitement async).
  const FETCH_TIMEOUT_MS = 5000;
  const fetchAndParse = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'fr-FR,fr;q=0.9', 'Referer': 'https://www.google.com/' },
        signal: controller.signal,
      });
      return r.ok ? parseBRVM(await r.text()) : null;
    } finally {
      clearTimeout(timer);
    }
  };

  const results = await Promise.allSettled(BRVM_URLS.map(fetchAndParse));
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === 'fulfilled' && res.value) {
      console.log(`BRVM.org OK (${BRVM_URLS[i]}): ${res.value.length} titres`);
      return { stocks: res.value, source: 'brvm.org' };
    }
    if (res.status === 'rejected') console.warn(`BRVM.org ${BRVM_URLS[i]}:`, res.reason?.message);
  }

  try {
    const stocks = await fetchYahoo();
    if (stocks) { console.log(`Yahoo Finance OK: ${stocks.length} titres`); return { stocks, source: 'yahoo-finance' }; }
  } catch (e) { console.warn('Yahoo Finance:', e.message); }

  // Panne transitoire observée pile aux horaires de cron (13h30/15h30) — brvm.org
  // répond normalement quelques minutes plus tard. Une seule nouvelle tentative
  // après un court délai avant d'abandonner et d'envoyer "données indisponibles".
  if (!retried) {
    console.warn('BRVM.org + Yahoo indisponibles — nouvelle tentative dans 4s.');
    await new Promise(r => setTimeout(r, 4000));
    return fetchLiveStocksRaw(true);
  }

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
    const sym  = YAHOO_REV[q.symbol]; if (!sym) return null;
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
    const sym = cells[0].toUpperCase().replace(/[\s ]/g,'');
    if (!/^[A-Z]{2,8}$/.test(sym) || !KNOWN_STOCKS[sym]) continue;
    const vol   = parseFloat(cells[2]?.replace(/[\s ]/g,'').replace(',','.')) || 0;
    const ref   = parseFloat(cells[3]?.replace(/[\s ]/g,'').replace(',','.'));
    const open  = parseFloat(cells[4]?.replace(/[\s ]/g,'').replace(',','.'));
    const close = parseFloat(cells[5]?.replace(/[\s ]/g,'').replace(',','.'));
    const chg   = parseFloat(cells[6]?.replace('%','').replace(/[\s ]/g,'').replace(',','.')) || 0;
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
  const meta      = KNOWN_STOCKS[stock.symbol] || { avgVol: 300, refPrice: stock.price, liq: 'M' };
  const { mpr: MPR_THRESH, obi: OBI_THRESH } = getThresholds(meta.avgVol);
  const volRatio  = meta.avgVol > 0 ? stock.volume / meta.avgVol : 1;
  const momentum  = stock.changePercent / 7.5;
  const mpr       = Math.max(0, volRatio * (1 + Math.max(0, momentum)));
  const obi       = Math.min(1, Math.max(-1, momentum * volRatio * 0.5));
  const iceberg   = stock.volume > meta.avgVol * VOL_SPIKE_FACTOR;

  const reasons = [];
  if (mpr > MPR_THRESH && stock.changePercent >= 0)
    reasons.push(`MPR ${mpr.toFixed(2)} > ${MPR_THRESH} (vol ${stock.volume.toLocaleString()} = ${volRatio.toFixed(1)}× moy · liq. ${meta.liq})`);
  if (obi >= OBI_THRESH)
    reasons.push(`OBI ${obi.toFixed(3)} — pression acheteuse forte _(seuil ${OBI_THRESH})_`);
  if (iceberg && reasons.length > 0)
    reasons.push(`Iceberg : ${stock.volume.toLocaleString()} titres = ${volRatio.toFixed(1)}× vol. moyen`);

  const confidence = reasons.length >= 3 ? 'HIGH' : reasons.length === 2 ? 'MEDIUM' : reasons.length === 1 ? 'LOW' : 'NONE';
  return { ...stock, meta, mpr, obi, iceberg, reasons, confidence, alert: reasons.length > 0 };
}

// ─── Thresholds adaptés à la liquidité ───────────────────────────────────────

function getThresholds(avgVol) {
  if (avgVol >= 5000) return THRESH.H;
  if (avgVol >= 500)  return THRESH.M;
  return                     THRESH.L;
}

// ─── Contexte portefeuille ────────────────────────────────────────────────────

function getPortfolioContext(portfolio, symbol) {
  return portfolio.find(p => p.symbol === symbol) || null;
}

// ─── Alerte dividende imminent ────────────────────────────────────────────────

function getDividendWarning(symbol) {
  const entry = DIVIDEND_CALENDAR.find(d => d.symbol === symbol);
  if (!entry) return null;
  const today    = new Date();
  const exDate   = new Date(entry.exDate);
  const daysLeft = Math.round((exDate - today) / 86_400_000);
  if (daysLeft >= 0 && daysLeft <= 5)
    return `⚠️ Ex-dividende *${symbol}* dans *${daysLeft} jour(s)* (${entry.exDate}) — dividende ${entry.amount} F/action. Le cours chute le jour J.`;
  if (daysLeft > 5 && daysLeft <= 14)
    return `🗓 Ex-dividende *${symbol}* dans ${daysLeft} jours (${entry.exDate}) — ${entry.amount} F/action.`;
  return null;
}

// ─── Alerte sectorielle (3+ titres d'un même secteur) ────────────────────────

function getSectorAlert(signals) {
  for (const [name, tickers] of Object.entries(SECTORS)) {
    const hit = signals.filter(s => tickers.includes(s.symbol));
    if (hit.length >= 3) {
      const label = { BANK:'bancaire', AGRI:'agricole', TELE:'télécom', ENER:'énergie', INDU:'industrie', TRAN:'transport' }[name] || name;
      return (
        `⚠️ *Alerte sectorielle — secteur ${label}*\n` +
        `${hit.length} titres signalent simultanément : ${hit.map(s => `*${s.symbol}*`).join(', ')}\n` +
        `_Ce mouvement est probablement dû à une actualité macro/sectorielle plutôt qu'un signal individuel._`
      );
    }
  }
  return null;
}

// ─── Position sizing adaptatif ────────────────────────────────────────────────
// HIGH → 80%  MEDIUM → 50%  LOW → 25% du budget

function calcPosition(price, confidence) {
  const pct       = confidence === 'HIGH' ? 0.80 : confidence === 'MEDIUM' ? 0.50 : 0.25;
  const available = Math.floor(BUDGET_FCFA * pct);
  const n         = Math.floor(available / price);
  if (!n) return null;
  const cost = n * price;
  return {
    n, cost, pct,
    budgetPct: Math.round(pct * 100),
    reserve:   BUDGET_FCFA - cost,
    target:    Math.round(price * 1.04),
    targetMax: Math.round(price * 1.075),
    stop:      Math.round(price * 0.97),
    gain:      Math.round(cost * 0.04),
    gainMax:   Math.round(cost * 0.075),
    loss:      Math.round(cost * 0.03),
  };
}

// ─── Heure Abidjan ────────────────────────────────────────────────────────────

function nowAbidjan() {
  return new Date().toLocaleString('fr-FR', {
    timeZone: 'Africa/Abidjan', hour: '2-digit', minute: '2-digit',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MESSAGES TELEGRAM
// ═══════════════════════════════════════════════════════════════════════════════

async function sendSignalTelegram(env, sig, source, portfolio = []) {
  const emoji = sig.confidence === 'HIGH' ? '🔴' : sig.confidence === 'MEDIUM' ? '🟠' : '🟡';
  const pos   = calcPosition(sig.price, sig.confidence);
  const held  = getPortfolioContext(portfolio, sig.symbol);
  const divW  = getDividendWarning(sig.symbol);

  const posBlock = pos ? [
    '──────────────────────',
    `💼 *POSITION — budget ${BUDGET_FCFA.toLocaleString()} FCFA · ${pos.budgetPct}% engagés (confiance ${sig.confidence})*`,
    `📌 Acheter *${pos.n} titre${pos.n > 1 ? 's' : ''}* ${sig.symbol} @ ${sig.price.toLocaleString()} FCFA`,
    `💸 Coût : *${pos.cost.toLocaleString()} FCFA*  ·  Réserve : ${pos.reserve.toLocaleString()} FCFA`,
    '──────────────────────',
    `🎯 Objectif +4% → ${pos.target.toLocaleString()} FCFA  *(+${pos.gain.toLocaleString()} F)*`,
    `🚀 Max BRVM +7.5% → ${pos.targetMax.toLocaleString()} FCFA  *(+${pos.gainMax.toLocaleString()} F)*`,
    `🛑 Stop-loss −3% → ${pos.stop.toLocaleString()} FCFA  *(max −${pos.loss.toLocaleString()} F)*`,
  ].join('\n') : `⚠️ _Titre trop cher pour le budget (${sig.price.toLocaleString()} FCFA/titre)_`;

  const portfolioBlock = held ? [
    '──────────────────────',
    `📂 *Déjà en portefeuille :* ${held.qty} titres · Coût moy. ${held.avgCost.toLocaleString()} F`,
    `📊 P&L actuel : ${((sig.price - held.avgCost) / held.avgCost * 100) >= 0 ? '+' : ''}${((sig.price - held.avgCost) / held.avgCost * 100).toFixed(1)}%` +
    ` *(${((sig.price - held.avgCost) * held.qty) >= 0 ? '+' : ''}${Math.round((sig.price - held.avgCost) * held.qty).toLocaleString()} F)*`,
    `⚡ _Tu détiens déjà ce titre — renforcement ou diversification ?_`,
  ].join('\n') : '';

  const divBlock = divW ? `\n${divW}` : '';

  const text = [
    `${emoji} *FLASH BRVM — Signal Post-Fixing*`,
    '━━━━━━━━━━━━━━━━━━━━━',
    `📌 *${sig.symbol}* — ${sig.name}`,
    `⏰ Session continue ouverte`,
    `💰 Cours fixing : *${sig.price.toLocaleString()} FCFA*`,
    `📊 Variation : ${sig.changePercent >= 0 ? '+' : ''}${sig.changePercent.toFixed(2)}%`,
    `🛒 Volume : ${sig.volume.toLocaleString()} titres${sig.iceberg ? '  🐋 *Iceberg*' : ''}`,
    '──────────────────────',
    `📈 MPR : *${sig.mpr.toFixed(2)}*`,
    `⚖️ OBI : *${sig.obi.toFixed(3)}*`,
    `*Signaux :*\n${sig.reasons.map(r => `  • ${r}`).join('\n')}`,
    posBlock,
    portfolioBlock,
    divBlock,
    '──────────────────────',
    `⚡ *Passe l'ordre maintenant (continu jusqu'à 15h GMT)*`,
    `_Confiance : ${sig.confidence}${source !== 'brvm.org' ? ' · Source : ' + source : ''}_`,
  ].filter(l => l !== '').join('\n');

  await tg(env, text);
}

async function ensureWebhook(env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then(r => r.json());
    const expectedUrl = `${WORKER_URL}/webhook`;
    if (info.result?.url !== expectedUrl) {
      const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(expectedUrl)}&allowed_updates=%5B%22message%22%5D`).then(r => r.json());
      console.log('Webhook enregistré :', res.ok, expectedUrl);
    }
  } catch (e) { console.error('ensureWebhook erreur:', e.message); }
}

async function sendDocument(env, content, filename, chatId, caption = '') {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) { console.error('sendDocument: secrets manquants.'); return; }
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', new Blob([content], { type: 'text/csv' }), filename);
    if (caption) form.append('caption', caption);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
    const d = await r.json();
    if (!d.ok) console.error('sendDocument erreur:', d.description);
  } catch (e) { console.error('sendDocument exception:', e.message); }
}

async function tg(env, text, chatId = null) {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const target = chatId || env.TELEGRAM_CHAT_ID;
  if (!token || !target) { console.error('Secrets Telegram manquants.'); return; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: target, text, parse_mode: 'Markdown' }),
    });
    const d = await r.json();
    if (d.ok) console.log('Telegram OK →', target);
    else      console.error('Telegram erreur:', d.description, '| text:', text.slice(0, 120));
  } catch (e) {
    console.error('Telegram exception:', e.message);
  }
}
