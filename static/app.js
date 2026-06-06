/* ═══════════════════════════════════════════════════════════
   BRVM Analytics v2 — Frontend
   ══════════════════════════════════════════════════════════ */
'use strict';

const STATE = {
  stocks: [], currentTab: 'dashboard',
  techSymbol: null, fundSymbol: null,
  techDays: 365, sortField: 'symbol', sortAsc: true,
  sectorFilter: '', searchFilter: '',
  chartMain: null, chartRsi: null, chartMacd: null,
  noteSymbol: null,
  ptfLastResult: null, ptfLastFilename: null,
};

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt   = (n, d=0) => n==null ? '—' : Number(n).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtP  = (n) => n==null ? '—' : (n>0?'+':'')+fmt(n,2)+'%';
const fmtB  = (n) => { if(n==null)return '—'; if(n>=1e12)return fmt(n/1e12,2)+' Bn FCFA'; if(n>=1e9)return fmt(n/1e9,1)+' Md'; if(n>=1e6)return fmt(n/1e6,1)+' M'; if(n>=1e3)return fmt(n/1e3,0)+' K'; return fmt(n); };
const vClass= (v) => v==null?'text-slate-400':v>0?'text-green-400':v<0?'text-red-400':'text-slate-400';
const vColor= (v) => v==null?'#94a3b8':v>0?'#22c55e':v<0?'#ef4444':'#94a3b8';

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ─── Toast notification ────────────────────────────────────────────────────────
function toast(msg, ms=3500) {
  const el = document.getElementById('toast');
  if(!el) return;
  document.getElementById('toast-msg').textContent = msg;
  el.classList.remove('hidden');  // lever display:none (Tailwind)
  el.classList.add('show');       // afficher (style.css)
  setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hidden');   // remettre état initial propre
  }, ms);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  updateMarketClock();
  setInterval(updateMarketClock, 30000);
  await loadStockList();
  await loadDashboard();
  pollStatus();
  setInterval(pollStatus, 60000);
  setInterval(() => { if(STATE.currentTab==='dashboard') loadDashboard(); }, 5*60000);
});

// ─── Navigation ──────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('hidden',c.id!==`tab-${name}`));
  STATE.currentTab=name;
  window.scrollTo({top:0, behavior:'smooth'});
  if(name==='psychology') loadSentiment();
  if(name==='portfolio') {
    // Pré-remplir le sélecteur de titres dans la saisie manuelle si vide
    const list = document.getElementById('manual-holdings-list');
    if(list && !list.children.length && STATE.stocks.length) {
      // Rien à charger automatiquement — l'utilisateur initie l'action
    }
    // Réinitialiser le message d'erreur d'upload si l'onglet est revisité
    const statusEl = document.getElementById('ptf-upload-status');
    if(statusEl) statusEl.classList.add('hidden');
  }
}

// ─── HORLOGE MARCHÉ (BRVM = UTC+0 / GMT, séance 09h00-15h30) ─────────────────

// Jours fériés BRVM — format "MM-DD" pour dates fixes, objets pour dates mobiles
const BRVM_HOLIDAYS_FIXED = new Set([
  '01-01', // Jour de l'An
  '05-01', // Fête du Travail
  '08-07', // Fête nationale CI
  '08-15', // Assomption
  '11-01', // Toussaint
  '11-15', // Journée nationale de la paix (CI)
  '12-25', // Noël
]);

// Dates mobiles 2025-2027 (Pâques, Ascension, Pentecôte, fêtes islamiques approximatives)
const BRVM_HOLIDAYS_MOVEABLE = new Set([
  // 2025
  '2025-04-18', // Vendredi Saint
  '2025-04-21', // Lundi de Pâques
  '2025-05-29', // Ascension
  '2025-06-09', // Lundi de Pentecôte
  '2025-03-30', // Eid al-Fitr (approx)
  '2025-06-06', // Eid al-Adha (approx)
  '2025-09-04', // Mouloud (approx)
  // 2026
  '2026-04-03', // Vendredi Saint
  '2026-04-06', // Lundi de Pâques
  '2026-05-14', // Ascension
  '2026-05-25', // Lundi de Pentecôte
  '2026-03-20', // Eid al-Fitr (approx)
  '2026-05-27', // Eid al-Adha (approx)
  '2026-08-25', // Mouloud (approx)
  // 2027
  '2027-03-26', // Vendredi Saint
  '2027-03-29', // Lundi de Pâques
  '2027-05-06', // Ascension
  '2027-05-17', // Lundi de Pentecôte
]);

function isBrvmHoliday(utcDate) {
  const mm = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utcDate.getUTCDate()).padStart(2, '0');
  const yyyy = utcDate.getUTCFullYear();
  return BRVM_HOLIDAYS_FIXED.has(`${mm}-${dd}`) ||
         BRVM_HOLIDAYS_MOVEABLE.has(`${yyyy}-${mm}-${dd}`);
}

function updateMarketClock() {
  const now  = new Date();
  // Abidjan = UTC+0 (GMT), aucun changement d'heure
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const day  = now.getUTCDay(); // 0=dim … 6=sam
  const timeF = String(utcH).padStart(2,'0') + ':' + String(utcM).padStart(2,'0');

  const isWeekday  = day >= 1 && day <= 5;
  const isHoliday  = isBrvmHoliday(now);
  const totalMin    = utcH * 60 + utcM;
  const preOpenMin  = 8  * 60 + 30;  // 08h30 pré-séance
  const openMin     = 9  * 60;        // 09h00 pré-ouverture
  const fixingMin   = 9  * 60 + 45;  // 09h45 fixing d'ouverture + négo continue
  const closeMin    = 15 * 60;        // 15h00 clôture officielle BRVM

  let statusTxt, statusCls, statusTitle;
  if (!isWeekday || isHoliday) {
    statusTxt   = '● FERMÉ';
    statusCls   = 'bg-slate-700 text-slate-400';
    statusTitle = isHoliday ? 'Marché fermé (jour férié)' : 'Marché fermé (week-end)';
  } else if (totalMin >= preOpenMin && totalMin < openMin) {
    statusTxt   = '● PRÉ-SÉANCE';
    statusCls   = 'bg-yellow-900 text-yellow-400';
    statusTitle = 'Pré-séance — Pré-ouverture à 09h00 (heure Abidjan)';
  } else if (totalMin >= openMin && totalMin < fixingMin) {
    statusTxt   = '● PRÉ-OUVERTURE';
    statusCls   = 'bg-orange-900 text-orange-400';
    statusTitle = 'Pré-ouverture — Saisie des ordres jusqu\'au fixing 09h45';
  } else if (totalMin >= fixingMin && totalMin < closeMin) {
    statusTxt   = '● OUVERT';
    statusCls   = 'bg-green-900 text-green-400';
    statusTitle = 'Séance en cours — Clôture officielle à 15h00 (heure Abidjan)';
  } else {
    statusTxt   = '● FERMÉ';
    statusCls   = 'bg-slate-700 text-slate-400';
    statusTitle = 'Marché fermé — Prochaine séance 09h00 (heure Abidjan)';
  }

  const el = document.getElementById('hdr-session');
  if (el) {
    el.textContent = statusTxt;
    el.className   = `font-semibold text-xs px-2 py-0.5 rounded-full ${statusCls}`;
    el.title       = statusTitle;
  }

  // Heure Abidjan dans le header
  const timeEl = document.getElementById('abidjan-time');
  if (timeEl) timeEl.textContent = timeF;
}

// ─── Chargement liste des stocks ─────────────────────────────────────────────
async function loadStockList() {
  const d = await api('/api/stocks');
  STATE.stocks = d.stocks || [];
  const opts = STATE.stocks.map(s=>`<option value="${s.symbol}">${s.symbol} — ${s.name||''}</option>`).join('');
  ['tech-stock-select','fund-stock-select'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML=`<option value="">— Sélectionner un titre —</option>${opts}`;
  });
  // Secteurs
  const sectors=[...new Set(STATE.stocks.map(s=>s.sector).filter(Boolean))].sort();
  const sel=document.getElementById('filter-sector');
  if(sel) sel.innerHTML=`<option value="">Tous secteurs</option>`+sectors.map(s=>`<option value="${s}">${s}</option>`).join('');
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [d, statusD] = await Promise.all([
      api('/api/market/summary'),
      api('/api/status').catch(()=>null),
    ]);
    renderKpis(d);
    renderMovers(d);
    renderStocksTable(d.stocks||STATE.stocks);
    api('/api/news?limit=30').then(n => {
      _newsCache = n.news || [];
      filterNewsBySource(_newsFilterSrc);  // applique le filtre actif
    }).catch(()=>{});
    if(statusD?.last_refresh) updateLastRefresh(statusD.last_refresh);
  } catch(e) { console.error(e); }
}

function renderKpis(d) {
  const m = d.market||{};
  setText('mc-composite',     m.brvm_composite ? fmt(m.brvm_composite,2) : '—');
  const brvm30val = m.brvm_30 ?? m.brvm_10;  // brvm_30 = alias API, brvm_10 = legacy DB
  setText('mc-brvm10',        brvm30val        ? fmt(brvm30val,2)         : '—');
  setText('hdr-composite',    m.brvm_composite ? fmt(m.brvm_composite,2)  : '—');
  setText('hdr-brvm10',       brvm30val        ? fmt(brvm30val,2)         : '—');
  // Sous-libellés descriptifs
  setText('mc-composite-var', 'Indice Régional BRVM');
  setText('mc-brvm10-var',    'BRVM-30 (Top Capitalisations)');
  const adv=m.advances||0, dec=m.declines||0;
  const advEl=document.getElementById('mc-adv');
  const decEl=document.getElementById('mc-dec');
  if(advEl){advEl.textContent=`↑ ${adv}`;advEl.className='metric-value text-green-400';}
  if(decEl){decEl.textContent=`↓ ${dec}`;decEl.className='metric-var text-red-400';}
  setText('mc-vol', fmtB(d.total_volume));
}

function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}

function renderMovers(d) {
  const mkRow = (s,positive) => `
    <div class="mover-row" onclick="quickView('${s.symbol}')">
      <div class="flex gap-2 items-center min-w-0">
        <span class="font-bold text-indigo-300 text-xs w-14 shrink-0">${s.symbol}</span>
        <span class="text-slate-400 text-xs truncate hidden sm:block">${(s.name||'').substring(0,20)}</span>
      </div>
      <div class="text-right shrink-0">
        <span class="text-xs font-semibold">${fmt(s.close,0)}</span>
        <span class="text-xs font-bold ml-1 ${vClass(s.variation_pct)}">${fmtP(s.variation_pct)}</span>
      </div>
    </div>`;
  setHTML('top-gains',  (d.top_gains||[]).map(s=>mkRow(s,true)).join('') || '<p class="text-xs text-slate-500 text-center py-3">Aucune donnée</p>');
  setHTML('top-losses', (d.top_losses||[]).map(s=>mkRow(s,false)).join('') || '<p class="text-xs text-slate-500 text-center py-3">Aucune donnée</p>');
}

function setHTML(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}

// ─── Cache news ───────────────────────────────────────────────────────────────
let _newsCache = [];   // toutes les news (chargées une fois)
let _newsFilterSrc = 'all';  // filtre actif dans le tableau de bord

// Couleurs & icônes par source
const NEWS_SRC_META = {
  'sikafinance.com': { color:'text-blue-300',  bg:'bg-blue-900/30 border-blue-700/40',  dot:'🔵', label:'SikaFinance' },
  'richbourse.com':  { color:'text-purple-300',bg:'bg-purple-900/25 border-purple-700/40',dot:'🟣', label:'RichBourse'  },
  'lejecos.com':     { color:'text-green-300', bg:'bg-green-900/25 border-green-700/40', dot:'🟢', label:'LeJecos'      },
  'sika.finance':    { color:'text-cyan-300',  bg:'bg-cyan-900/25 border-cyan-700/40',   dot:'🔷', label:'Sika.Finance' },
};
function _newsSrcMeta(src) {
  return NEWS_SRC_META[src] || { color:'text-slate-400', bg:'bg-slate-800/50 border-slate-700', dot:'⚪', label: src||'Autre' };
}

function renderNews(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">Aucune actualité disponible</p>';
    return;
  }
  el.innerHTML = items.slice(0, 20).map(n => {
    const meta = _newsSrcMeta(n.source);
    const isDiv = /dividende|ago|résultat|exercice|bpa|bnpa/i.test(n.title);
    return `
      <a href="${n.url||'#'}" target="_blank" rel="noopener"
         class="flex items-start gap-2 py-2 border-b border-slate-700/50 last:border-0
                hover:bg-slate-800/40 rounded px-1 -mx-1 transition-colors group">
        <span class="text-base leading-none mt-0.5 flex-shrink-0" title="${meta.label}">${meta.dot}</span>
        <div class="min-w-0 flex-1">
          <span class="text-xs leading-snug ${isDiv?'text-yellow-200 font-medium':'text-slate-300'} group-hover:text-indigo-300 transition-colors">
            ${isDiv?'💰 ':''}${n.title}
          </span>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-xs ${meta.color} font-medium">${meta.label}</span>
            ${n.published ? `<span class="text-xs text-slate-600">${n.published}</span>` : ''}
          </div>
        </div>
      </a>`;
  }).join('');
}

// Filtre news par source (tableau de bord)
function filterNewsBySource(src) {
  _newsFilterSrc = src;
  // Mettre à jour les boutons
  document.querySelectorAll('.news-src-btn').forEach(b => {
    const isActive = b.dataset.src === src;
    b.classList.toggle('active', isActive);
    b.classList.toggle('text-slate-300', isActive);
    b.classList.toggle('border-slate-600', isActive);
    b.classList.toggle('text-slate-500', !isActive);
    b.classList.toggle('border-slate-700', !isActive);
  });
  const filtered = src === 'all' ? _newsCache : _newsCache.filter(n => n.source === src);
  renderNews('news-list', filtered);
}

// ─── TABLE DES STOCKS ─────────────────────────────────────────────────────────
function renderStocksTable(stocks) {
  const filtered = stocks.filter(s=>{
    const q = STATE.searchFilter.toLowerCase();
    return (!q || s.symbol.toLowerCase().includes(q) || (s.name||'').toLowerCase().includes(q))
        && (!STATE.sectorFilter || s.sector===STATE.sectorFilter);
  });
  const sorted = [...filtered].sort((a,b)=>{
    let va=a[STATE.sortField], vb=b[STATE.sortField];
    if(va==null) va=STATE.sortAsc?Infinity:-Infinity;
    if(vb==null) vb=STATE.sortAsc?Infinity:-Infinity;
    if(typeof va==='string') return STATE.sortAsc?va.localeCompare(vb):vb.localeCompare(va);
    return STATE.sortAsc?va-vb:vb-va;
  });

  setHTML('stocks-table-body', sorted.length
    ? sorted.map(s=>`
      <tr class="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer transition-colors" onclick="quickView('${s.symbol}')">
        <td class="px-4 py-2.5 font-bold text-indigo-300 text-xs">${s.symbol}</td>
        <td class="px-4 py-2.5 text-slate-200 text-xs max-w-[160px] truncate">${s.name||'—'}</td>
        <td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-xs">${s.sector||'—'}</span></td>
        <td class="px-4 py-2.5 text-right font-semibold text-sm">${s.close!=null?fmt(s.close,0)+' F':'—'}</td>
        <td class="px-4 py-2.5 text-right font-bold text-sm ${vClass(s.variation_pct)}">${fmtP(s.variation_pct)}</td>
        <td class="px-4 py-2.5 text-right text-slate-300 text-xs">${fmtB(s.volume)}</td>
        <td class="px-4 py-2.5 text-right text-slate-300 text-xs">${fmtB(s.market_cap)}</td>
        <td class="px-4 py-2.5 text-center">
          <div class="flex items-center justify-center gap-1">
            <button onclick="event.stopPropagation();openTech('${s.symbol}')" title="Analyse Technique"
              class="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors text-xs">📈</button>
            <button onclick="event.stopPropagation();openFund('${s.symbol}')" title="Analyse Fondamentale"
              class="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors text-xs">📊</button>
            <button onclick="event.stopPropagation();openNoteModal('${s.symbol}')" title="Ajouter une note"
              class="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors text-xs">📝</button>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="text-center py-10 text-slate-500">Aucun titre trouvé</td></tr>');
}

function sortTable(f){if(STATE.sortField===f)STATE.sortAsc=!STATE.sortAsc;else{STATE.sortField=f;STATE.sortAsc=true;}renderStocksTable(STATE.stocks);}
function filterTable(v){STATE.searchFilter=v;renderStocksTable(STATE.stocks);}
function filterBySector(v){STATE.sectorFilter=v;renderStocksTable(STATE.stocks);}

function quickView(sym) { openTech(sym); }

function openTech(sym) {
  switchTab('technical');
  const sel=document.getElementById('tech-stock-select');
  if(sel){sel.value=sym;loadTechnical(sym);}
}
function openFund(sym) {
  switchTab('fundamental');
  const sel=document.getElementById('fund-stock-select');
  if(sel){sel.value=sym;loadFundamental(sym);}
}

// ─── ANALYSE TECHNIQUE ────────────────────────────────────────────────────────
async function loadTechnical(symbol) {
  if(!symbol) return;
  STATE.techSymbol = symbol;
  setText('chart-title', symbol);
  setText('chart-subtitle','');
  setHTML('signals-list','');
  document.getElementById('signals-container')?.classList.add('hidden');

  try {
    // Lancer chargement historique si nécessaire
    const status = await api(`/api/stocks/${symbol}`);
    if((status.price_count||0) < 30) {
      toast(`Chargement de l'historique de ${symbol}...`, 6000);
      await fetch(`/api/stocks/${symbol}/fetch-history`, {method:'POST'});
      await new Promise(r=>setTimeout(r,4000));
    }

    const [pricesD, techD, recoD, fundD] = await Promise.all([
      api(`/api/stocks/${symbol}/prices?days=${STATE.techDays}`),
      api(`/api/stocks/${symbol}/technical?days=${STATE.techDays}`),
      api(`/api/stocks/${symbol}/recommendation?profil=${getProfilFor(symbol)}`).catch(()=>null),
      api(`/api/stocks/${symbol}/fundamental`).catch(()=>null),
    ]);

    const prices   = pricesD.prices || [];
    const patterns = techD.technical?.candle_patterns || [];
    setText('chart-subtitle', `${prices.length} séances — Dernière: ${prices.at(-1)?.date||''}`);

    // Graphique
    renderCandleChart(prices, patterns);
    renderRsiChart(techD.technical);
    renderMacdChart(techD.technical);
    renderSignals(techD.technical?.signals||[]);
    renderCandlePatterns(patterns);

    // Infos prix
    const last = prices.at(-1);
    if(last) {
      const pi = document.getElementById('chart-price-info');
      if(pi) pi.classList.remove('hidden');
      setText('cp-close', fmt(last.close,0)+' FCFA');
      const cpv=document.getElementById('cp-var');
      if(cpv){cpv.textContent=fmtP(last.variation_pct);cpv.className=`ml-2 text-sm font-bold ${vClass(last.variation_pct)}`;}
    }

    // Bloc dividende uniforme (même format que l'onglet Fondamentale)
    if(fundD) renderTechDividendBlock(fundD);

    // Contexte saison dividendes 2025 pour ce titre
    api('/api/market/dividends').then(divD => {
      renderTechDiv2025Context(symbol, fundD, divD.dividends||[]);
    }).catch(()=>{});

    // Recommandation
    if(recoD) renderRecommendationBox('tech-reco-box', {...recoD, symbol});

    // Afficher le bouton d'export PDF
    document.getElementById('pdf-export-section')?.classList.remove('hidden');

  } catch(e) {
    console.error('Technical error:', e);
    toast(`Erreur: ${e.message}`);
    setHTML('chart-main','<div class="flex items-center justify-center h-full text-slate-500 text-sm">'+e.message+'</div>');
  }
}

// ─── GRAPHIQUES ───────────────────────────────────────────────────────────────
function chartOpts(w, h) {
  return {
    width: w, height: h,
    layout: {background:{color:'#1e293b'}, textColor:'#94a3b8'},
    grid: {vertLines:{color:'#1e293b'}, horzLines:{color:'#273449'}},
    crosshair: {mode: LightweightCharts.CrosshairMode.Normal},
    timeScale: {borderColor:'#334155', timeVisible:true, secondsVisible:false},
    rightPriceScale: {borderColor:'#334155'},
    handleScroll:true, handleScale:true,
  };
}

function sma(vals, p) {
  const r=new Array(vals.length).fill(null);
  for(let i=p-1;i<vals.length;i++) r[i]=vals.slice(i-p+1,i+1).reduce((a,v)=>a+(v??0),0)/p;
  return r;
}

function renderCandleChart(prices, patterns=[]) {
  const el=document.getElementById('chart-main');
  if(!el) return;
  el.innerHTML='';
  if(!prices.length){el.innerHTML='<div class="flex items-center justify-center h-full text-slate-400 text-sm">Aucune donnée disponible</div>';return;}

  const chart = LightweightCharts.createChart(el, chartOpts(el.clientWidth, el.clientHeight || 380));
  STATE.chartMain = chart;

  const hasOHLC = prices.some(p=>p.open!=null&&p.high!=null&&p.low!=null);
  const showCandle = document.getElementById('show-candle')?.checked !== false;

  let main;
  if(showCandle && hasOHLC) {
    main = chart.addCandlestickSeries({
      upColor:'#22c55e',downColor:'#ef4444',
      borderUpColor:'#22c55e',borderDownColor:'#ef4444',
      wickUpColor:'#22c55e',wickDownColor:'#ef4444',
    });
    main.setData(prices.filter(p=>p.close).map(p=>({
      time:p.date, open:p.open||p.close, high:p.high||p.close,
      low:p.low||p.close, close:p.close,
    })));
  } else if(showCandle) {
    main = chart.addAreaSeries({
      lineColor:'#818cf8', topColor:'rgba(129,140,248,0.3)',
      bottomColor:'rgba(129,140,248,0.02)', lineWidth:2,
    });
    main.setData(prices.filter(p=>p.close).map(p=>({time:p.date,value:p.close})));
  } else {
    // Mode épuré : ligne fine fermée uniquement, sans corps ni mèches
    main = chart.addLineSeries({
      color:'rgba(148,163,184,0.4)', lineWidth:1,
      priceLineVisible:false, lastValueVisible:true,
      crosshairMarkerVisible:true,
    });
    main.setData(prices.filter(p=>p.close).map(p=>({time:p.date,value:p.close})));
  }

  // ─── Marqueurs de figures (uniquement quand les bougies sont visibles) ──────
  if(showCandle && patterns && patterns.length && hasOHLC) {
    const SIG_COLOR = { ACHAT:'#22c55e', VENTE:'#ef4444', NEUTRE:'#eab308' };
    const markers = patterns
      .filter(pat => prices.some(p=>p.date===pat.date))
      .map(pat => ({
        time:     pat.date,
        position: pat.signal==='ACHAT' ? 'belowBar' : pat.signal==='VENTE' ? 'aboveBar' : 'inBar',
        color:    SIG_COLOR[pat.signal] || '#eab308',
        shape:    pat.signal==='ACHAT' ? 'arrowUp' : pat.signal==='VENTE' ? 'arrowDown' : 'circle',
        text:     pat.emoji ? `${pat.emoji} ${pat.type}` : pat.type,
        size:     1.5,
      }))
      // LightweightCharts exige les marqueurs triés par date croissante + unicité
      .sort((a,b)=>a.time.localeCompare(b.time));
    if(markers.length) main.setMarkers(markers);
  }

  const closes = prices.map(p=>p.close);
  const addLine=(data,color,title)=>{
    const s=chart.addLineSeries({color,lineWidth:1,priceLineVisible:false,lastValueVisible:true,title});
    s.setData(data.map((v,i)=>v!=null?{time:prices[i].date,value:v}:null).filter(Boolean));
  };

  if(document.getElementById('show-ma')?.checked) {
    if(prices.length>=20)  addLine(sma(closes,20), '#f59e0b','MA20');
    if(prices.length>=50)  addLine(sma(closes,50), '#06b6d4','MA50');
    if(prices.length>=200) addLine(sma(closes,200),'#a855f7','MA200');
  }

  if(document.getElementById('show-bb')?.checked && prices.length>=20) {
    const s20=sma(closes,20);
    const upper=[],lower=[];
    for(let i=19;i<closes.length;i++){
      const win=closes.slice(i-19,i+1), m=s20[i];
      const std=Math.sqrt(win.reduce((a,v)=>a+(v-m)**2,0)/20);
      upper.push({time:prices[i].date,value:m+2*std});
      lower.push({time:prices[i].date,value:m-2*std});
    }
    const bbLine=(data,c)=>{const s=chart.addLineSeries({color:c,lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false});s.setData(data);};
    bbLine(upper,'rgba(99,102,241,0.5)');
    bbLine(lower,'rgba(99,102,241,0.5)');
  }

  if(document.getElementById('show-vol')?.checked && prices.some(p=>p.volume>0)) {
    const vs=chart.addHistogramSeries({priceScaleId:'vol',priceFormat:{type:'volume'}});
    chart.priceScale('vol').applyOptions({scaleMargins:{top:0.82,bottom:0}});
    vs.setData(prices.filter(p=>p.volume).map(p=>({
      time:p.date, value:p.volume,
      color:(p.variation_pct>=0)?'rgba(34,197,94,0.4)':'rgba(239,68,68,0.4)',
    })));
  }

  chart.timeScale().fitContent();
}

function renderRsiChart(technical) {
  const el=document.getElementById('chart-rsi');
  if(!el) return;
  el.innerHTML='';
  const chart=LightweightCharts.createChart(el,chartOpts(el.clientWidth, el.clientHeight || 120));
  STATE.chartRsi=chart;
  const data=(technical?.rsi14||[]).filter(d=>d.value!=null);
  if(!data.length) return;
  const s=chart.addLineSeries({color:'#f59e0b',lineWidth:2,priceLineVisible:false});
  s.setData(data.map(d=>({time:d.date,value:d.value})));
  s.createPriceLine({price:70,color:'#ef4444',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'70'});
  s.createPriceLine({price:30,color:'#22c55e',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'30'});
  s.createPriceLine({price:50,color:'#475569',lineWidth:1,lineStyle:3,axisLabelVisible:false,title:''});
  chart.priceScale('right').applyOptions({minimum:0,maximum:100});
  chart.timeScale().fitContent();
}

function renderMacdChart(technical) {
  const el=document.getElementById('chart-macd');
  if(!el) return;
  el.innerHTML='';
  const chart=LightweightCharts.createChart(el,chartOpts(el.clientWidth, el.clientHeight || 120));
  STATE.chartMacd=chart;
  const md=(technical?.macd?.macd||[]).filter(d=>d.value!=null);
  const sg=(technical?.macd?.signal||[]).filter(d=>d.value!=null);
  const hi=(technical?.macd?.histogram||[]).filter(d=>d.value!=null);
  if(!md.length) return;
  const hs=chart.addHistogramSeries({priceLineVisible:false,lastValueVisible:false});
  hs.setData(hi.map(d=>({time:d.date,value:d.value,color:d.value>=0?'rgba(34,197,94,0.6)':'rgba(239,68,68,0.6)'})));
  const ml=chart.addLineSeries({color:'#818cf8',lineWidth:2,priceLineVisible:false,title:'MACD'});
  ml.setData(md.map(d=>({time:d.date,value:d.value})));
  const sl=chart.addLineSeries({color:'#f97316',lineWidth:1,priceLineVisible:false,title:'Signal'});
  sl.setData(sg.map(d=>({time:d.date,value:d.value})));
  chart.timeScale().fitContent();
}

function renderSignals(signals) {
  const c=document.getElementById('signals-container');
  const l=document.getElementById('signals-list');
  if(!c||!l) return;
  if(!signals.length){c.classList.add('hidden');return;}
  c.classList.remove('hidden');
  const colorMap={ACHAT:'signal-ACHAT',VENTE:'signal-VENTE',HAUSSIÈRE:'signal-HAUSSIÈRE',BAISSIÈRE:'signal-BAISSIÈRE',NEUTRE:'signal-NEUTRE'};
  l.innerHTML=signals.map(s=>`
    <div class="flex items-center gap-2 flex-wrap">
      <span class="signal-badge ${colorMap[s.direction]||'signal-NEUTRE'}">${s.type}: ${s.direction}</span>
      <span class="text-xs text-slate-400">${s.detail}</span>
    </div>`).join('');
}

// ─── BOUGIES JAPONAISES ───────────────────────────────────────────────────────
function renderCandlePatterns(patterns) {
  const panel = document.getElementById('candle-patterns-panel');
  if (!panel) return;

  if (!patterns || !patterns.length) {
    panel.innerHTML = `
      <p class="text-xs text-slate-500 text-center py-4 italic">
        Aucune figure détectée sur la période affichée — données OHLC insuffisantes ou marché sans signal clair.
      </p>`;
    return;
  }

  const SIG_BG = {
    ACHAT:  'bg-green-900/30 border-green-700/40',
    VENTE:  'bg-red-900/25 border-red-700/40',
    NEUTRE: 'bg-yellow-900/20 border-yellow-700/30',
  };
  const SIG_TXT = {
    ACHAT:  'text-green-300',
    VENTE:  'text-red-300',
    NEUTRE: 'text-yellow-300',
  };
  const STR_COLOR = {
    fort:   '#22c55e',
    moyen:  '#eab308',
    faible: '#94a3b8',
  };
  const STR_LABEL = {
    fort:   'Signal Fort',
    moyen:  'Signal Modéré',
    faible: 'Signal Faible',
  };

  // Résumé global en tête de panneau
  const bullCount = patterns.filter(p=>p.signal==='ACHAT').length;
  const bearCount = patterns.filter(p=>p.signal==='VENTE').length;
  const neutCount = patterns.filter(p=>p.signal==='NEUTRE').length;
  const dominance = bullCount > bearCount ? 'Dominance Haussière' : bearCount > bullCount ? 'Dominance Baissière' : 'Équilibre';
  const dominanceColor = bullCount > bearCount ? '#22c55e' : bearCount > bullCount ? '#ef4444' : '#eab308';
  const dominanceIcon  = bullCount > bearCount ? '📈' : bearCount > bullCount ? '📉' : '⚖️';

  const summary = `
    <div class="flex items-center gap-4 mb-4 p-3 bg-slate-900/60 rounded-xl border border-slate-700">
      <div class="text-2xl">${dominanceIcon}</div>
      <div class="flex-1">
        <div class="text-sm font-bold" style="color:${dominanceColor}">${dominance}</div>
        <div class="text-xs text-slate-400 mt-0.5">${patterns.length} figure${patterns.length>1?'s':''} détectée${patterns.length>1?'s':''} sur les 60 dernières séances</div>
      </div>
      <div class="flex gap-3 text-xs text-right">
        <div><span class="text-green-400 font-bold">${bullCount}</span><div class="text-slate-500">Haussière${bullCount>1?'s':''}</div></div>
        <div><span class="text-red-400 font-bold">${bearCount}</span><div class="text-slate-500">Baissière${bearCount>1?'s':''}</div></div>
        ${neutCount ? `<div><span class="text-yellow-400 font-bold">${neutCount}</span><div class="text-slate-500">Neutre${neutCount>1?'s':''}</div></div>` : ''}
      </div>
    </div>`;

  // Grille de figures
  const cards = patterns.map(pat => {
    const bg  = SIG_BG[pat.signal]  || SIG_BG.NEUTRE;
    const txt = SIG_TXT[pat.signal] || SIG_TXT.NEUTRE;
    const sc  = STR_COLOR[pat.strength] || '#94a3b8';
    const sl  = STR_LABEL[pat.strength] || '';
    return `
      <div class="candle-pattern-card rounded-xl border p-3.5 ${bg}">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <span class="text-xl leading-none">${pat.emoji || '🕯️'}</span>
            <div>
              <div class="text-sm font-bold ${txt}">${pat.type}</div>
              <div class="text-xs text-slate-500 mt-0.5">${pat.date}</div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="signal-badge signal-${pat.signal} text-xs">${pat.signal}</span>
            <div class="text-xs mt-1 font-medium" style="color:${sc}">● ${sl}</div>
          </div>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed">${pat.description}</p>
      </div>`;
  }).join('');

  panel.innerHTML = summary + `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div>`;
}

function setPeriod(d) {
  STATE.techDays=d;
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.toggle('active',+b.dataset.days===d));
  if(STATE.techSymbol) loadTechnical(STATE.techSymbol);
}
function toggleIndicators(){if(STATE.techSymbol) loadTechnical(STATE.techSymbol);}

async function fetchHistory() {
  const sym=STATE.techSymbol;
  if(!sym){toast('Sélectionnez un titre');return;}
  toast(`Chargement historique de ${sym}...`,6000);
  await fetch(`/api/stocks/${sym}/fetch-history`,{method:'POST'});
  setTimeout(()=>loadTechnical(sym),5000);
}

// ─── BLOC DIVIDENDE TECHNIQUE (uniforme avec onglet Fondamentale) ─────────────
function renderTechDividendBlock(fundData) {
  const el = document.getElementById('tech-div-block');
  if (!el || !fundData) return;

  const f    = fundData.fundamentals || {};
  const stock= fundData.stock        || {};

  const dyNet   = f.dividend_yield_net;
  const dyGross = f.dividend_yield_gross ?? f.dividend_yield;
  const dpsNet  = f.dividend_per_share_net;
  const dpsGross= f.dividend_per_share;
  const irvm    = f.irvm_rate_pct ?? 15;
  const hasDiv  = (dyNet ?? dyGross ?? 0) > 0;

  // Badge de statut dividende
  const divStatus   = f.div_status || 'aucun';
  const exerciceLabel = f.div_exercice_label || null;
  // Ne montrer le badge que pour le pipeline courant (annoncé/officiel = exercice récent)
  const isPipeline = divStatus === 'officiel' || divStatus === 'annoncé';
  const statusBadge = divStatus === 'officiel'
    ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-900/60 text-green-300 border border-green-700/50 ml-2">✓ OFFICIEL BOC</span>`
    : divStatus === 'annoncé'
    ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/60 text-yellow-300 border border-yellow-700/50 ml-2">⏳ ANNONCÉ AGO</span>`
    : '';

  const exerciceBadge = exerciceLabel
    ? `<span class="text-slate-500 text-xs ml-2">${exerciceLabel}</span>` : '';
  const payDate = f.div_payment_date
    ? `<span class="text-slate-500 text-xs ml-1">· Mise en paiement : ${f.div_payment_date}</span>` : '';

  el.innerHTML = `
    <div class="bg-card rounded-xl border border-border p-4">
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <span class="text-sm font-semibold text-slate-300">💰 Dividende</span>
        ${statusBadge}${exerciceBadge}${payDate}
        ${!isPipeline && hasDiv ? '<span class="text-xs text-slate-600 ml-1">(données historiques)</span>' : ''}
      </div>
      <div class="rounded-xl p-4 ${hasDiv&&isPipeline?'bg-green-900/20 border border-green-700/40':hasDiv?'bg-slate-800/50 border border-slate-700':'bg-red-900/10 border border-red-700/20'}">
        <div class="flex items-center gap-3 flex-wrap">
          <div class="text-2xl">${hasDiv&&isPipeline?'💰':hasDiv?'📜':'⚠️'}</div>
          <div class="flex-1">
            <div class="font-bold text-sm ${hasDiv&&isPipeline?'text-green-300':hasDiv?'text-slate-400':'text-red-400'}">
              ${isPipeline&&hasDiv
                ? `Dividende ${divStatus==='officiel'?'Officiel':'Annoncé'} — Net : <span class="text-xl">${fmt(dyNet??dyGross,2)}%</span>`
                : hasDiv
                ? `Rendement historique — Net : <span class="text-lg">${fmt(dyNet??dyGross,2)}%</span> <span class="text-xs font-normal text-slate-500">(exercice antérieur)</span>`
                : 'Aucun dividende annoncé pour cet exercice'}
            </div>
            ${hasDiv ? `
              <div class="flex flex-wrap gap-4 mt-1.5 text-xs">
                <div class="text-slate-300">
                  <span class="text-slate-500">Net (après IRVM ${irvm}%)</span><br>
                  <span class="font-bold text-green-300 text-base">${dpsNet!=null?fmt(dpsNet,0)+' FCFA/action':dyNet!=null?fmt(dyNet,2)+'%':'—'}</span>
                </div>
                <div class="text-slate-400 border-l border-slate-700 pl-4">
                  <span class="text-slate-500">Brut (avant retenue)</span><br>
                  <span class="text-slate-300">${dpsGross?fmt(dpsGross,0)+' FCFA':dyGross?fmt(dyGross,2)+'%':'—'}</span>
                </div>
                <div class="text-slate-400 border-l border-slate-700 pl-4">
                  <span class="text-slate-500">Attractivité</span><br>
                  <span class="${(dyNet??0)>=5?'text-green-400':(dyNet??0)>=3.5?'text-lime-400':'text-yellow-400'}">
                    ${(dyNet??dyGross??0)>=5?'Exceptionnel ⭐⭐⭐':(dyNet??dyGross??0)>=3.5?'Attractif ⭐⭐':(dyNet??dyGross??0)>=2?'Correct ⭐':'Modeste'}
                  </span>
                </div>
                ${f.per ? `<div class="text-slate-400 border-l border-slate-700 pl-4">
                  <span class="text-slate-500">P/E</span><br>
                  <span class="text-slate-200 font-bold">${fmt(f.per,1)}x</span>
                </div>` : ''}
              </div>
            ` : `<div class="text-xs text-red-400/70 mt-1">Non recommandé pour les investisseurs en quête de revenus BRVM</div>`}
          </div>
        </div>
      </div>
    </div>`;
}

// ─── CONTEXTE SAISON 2025 — onglet Technique ─────────────────────────────────
// Montre où se positionne le titre courant dans le classement dividendes 2025,
// et affiche les 5 meilleurs du pipeline pour référence rapide.
function renderTechDiv2025Context(symbol, fundD, divArr) {
  const el = document.getElementById('tech-div-2025-ctx');
  if (!el) return;

  const currentYear  = new Date().getFullYear();  // 2026
  const recentExerc  = currentYear - 1;           // 2025

  // Filtrer uniquement le pipeline courant
  const pipeline = (divArr||[]).filter(d => {
    const ds = d.div_status||'aucun';
    if(ds !== 'annoncé' && ds !== 'officiel') return false;
    const ey = d.div_exercice_year;
    return ey && ey >= recentExerc;
  }).sort((a,b)=>(b.dividend_yield||0)-(a.dividend_yield||0));

  if(!pipeline.length) { el.innerHTML=''; return; }

  // Trouver ce titre dans le pipeline
  const thisDivEntry  = pipeline.find(d => d.symbol === symbol);
  const thisRank      = thisDivEntry ? pipeline.indexOf(thisDivEntry)+1 : null;
  const nbOfficiels   = pipeline.filter(d=>d.div_status==='officiel').length;
  const nbAnnonces    = pipeline.filter(d=>d.div_status==='annoncé').length;

  // Bannière : est-ce que ce titre est dans le pipeline ?
  const rankBanner = thisRank
    ? `<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/40 mb-3">
         <span class="text-base">🏆</span>
         <div class="text-xs">
           <span class="text-emerald-300 font-bold">${symbol}</span>
           <span class="text-slate-300"> est </span>
           <span class="text-emerald-300 font-bold">#${thisRank}</span>
           <span class="text-slate-300"> du classement dividendes NET exercice ${recentExerc}</span>
           <span class="text-slate-500 ml-1">(${thisDivEntry.div_status==='officiel'?'✓ officiel BOC':'⏳ annoncé AGO'})</span>
         </div>
       </div>`
    : `<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 mb-3">
         <span class="text-base">📋</span>
         <span class="text-xs text-slate-400">${symbol} — aucun dividende exercice ${recentExerc} dans le pipeline</span>
       </div>`;

  // Top 5 pour contexte
  const top5 = pipeline.slice(0,5).map((d,i) => {
    const isThis = d.symbol === symbol;
    const ds     = d.div_status;
    const badge  = ds==='officiel'
      ? `<span class="text-xs font-bold text-green-300">✓</span>`
      : `<span class="text-xs text-yellow-400">⏳</span>`;
    return `<div class="flex items-center gap-2 py-1.5 border-b border-slate-700/40 last:border-0 ${isThis?'bg-emerald-900/20 -mx-3 px-3 rounded':''}">
      <span class="text-xs text-slate-600 w-4">#${i+1}</span>
      <button onclick="loadTechnical('${d.symbol}')"
        class="font-bold text-xs w-14 text-left ${isThis?'text-emerald-300':'text-indigo-300 hover:text-indigo-200'}">${d.symbol}</button>
      <div class="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div class="h-full rounded-full" style="width:${Math.min(Math.round((d.dividend_yield||0)/10*100),100)}%;background:${(d.dividend_yield||0)>=5?'#22c55e':(d.dividend_yield||0)>=3.5?'#84cc16':'#eab308'}"></div>
      </div>
      <span class="text-xs font-bold ${(d.dividend_yield||0)>=5?'text-green-400':'text-lime-400'} w-14 text-right">${fmt(d.dividend_yield,2)}%</span>
      ${badge}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="bg-card rounded-xl border border-border p-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-base">🗓️</span>
        <span class="text-sm font-semibold text-slate-200">Saison Dividendes <strong class="text-emerald-400">Exercice ${recentExerc}</strong></span>
        <span class="ml-auto text-xs text-slate-500">${nbOfficiels} officiel${nbOfficiels>1?'s':''} · ${nbAnnonces} annoncé${nbAnnonces>1?'s':''} · AGO ${currentYear}</span>
      </div>
      ${rankBanner}
      <div class="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Top 5 rendements NET</div>
      ${top5}
      <button onclick="switchTab('psychology')"
        class="mt-3 w-full text-xs text-center py-1.5 rounded border border-slate-700 text-slate-400 hover:border-emerald-600 hover:text-emerald-400 transition-colors">
        📊 Voir le tableau complet des dividendes 2025 →
      </button>
    </div>`;
}

// ─── CONTEXTE SAISON 2025 — onglet Fondamentale ───────────────────────────────
// Compare le titre courant avec tous les dividendes 2025 du pipeline.
function renderFundDiv2025Context(symbol, divArr) {
  const el = document.getElementById('fund-div-2025-ctx');
  if (!el) return;

  const currentYear = new Date().getFullYear();
  const recentExerc = currentYear - 1;

  const pipeline = (divArr||[]).filter(d => {
    const ds = d.div_status||'aucun';
    if(ds !== 'annoncé' && ds !== 'officiel') return false;
    const ey = d.div_exercice_year;
    return ey && ey >= recentExerc;
  }).sort((a,b)=>(b.dividend_yield||0)-(a.dividend_yield||0));

  if (!pipeline.length) { el.innerHTML=''; return; }

  const thisEntry = pipeline.find(d => d.symbol === symbol);
  const thisRank  = thisEntry ? pipeline.indexOf(thisEntry)+1 : null;

  const rows = pipeline.slice(0,8).map((d,i) => {
    const isThis = d.symbol === symbol;
    const ds     = d.div_status;
    const dsBadge= ds==='officiel'
      ? `<span class="text-xs font-bold px-1.5 py-0.5 rounded bg-green-900/50 text-green-300 border border-green-700/40">✓ BOC</span>`
      : `<span class="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-300 border border-yellow-700/40">⏳ AGO</span>`;
    return `<tr class="${isThis?'bg-emerald-900/25 font-semibold':'hover:bg-slate-800/50'} border-b border-slate-700/40 last:border-0 transition-colors">
      <td class="py-2 pl-3 text-xs text-slate-500">#${i+1}</td>
      <td class="py-2 px-2">
        <button onclick="loadFundamental('${d.symbol}')"
          class="font-bold text-xs ${isThis?'text-emerald-300':'text-indigo-300 hover:text-indigo-200'}">${d.symbol}</button>
      </td>
      <td class="py-2 px-2 text-xs text-slate-400 max-w-[120px] truncate hidden sm:table-cell">${(d.name||'').substring(0,18)}</td>
      <td class="py-2 px-2 text-right">
        <span class="text-sm font-bold ${(d.dividend_yield||0)>=5?'text-green-400':(d.dividend_yield||0)>=3.5?'text-lime-400':'text-yellow-400'}">${fmt(d.dividend_yield,2)}%</span>
        <div class="text-xs text-slate-600">NET</div>
      </td>
      <td class="py-2 px-2 text-right text-xs text-slate-500 hidden sm:table-cell">${d.dividend_per_share!=null?fmt(d.dividend_per_share,0)+' F':'—'}</td>
      <td class="py-2 pr-3 text-right">${dsBadge}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="bg-card rounded-xl border border-border p-5">
      <div class="flex items-center gap-2 mb-4">
        <span class="text-base">🗓️</span>
        <div>
          <h3 class="text-sm font-semibold text-slate-200">Classement Dividendes Exercice <strong class="text-emerald-400">${recentExerc}</strong></h3>
          <p class="text-xs text-slate-400">Source sikafinance.com · AGO ${currentYear} · rendements nets UEMOA${thisRank?` · <strong class="text-emerald-400">${symbol} est #${thisRank}</strong>`:''}</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-slate-500 text-xs uppercase border-b border-slate-700">
              <th class="py-2 pl-3 text-left">#</th>
              <th class="py-2 px-2 text-left">Ticker</th>
              <th class="py-2 px-2 text-left hidden sm:table-cell">Société</th>
              <th class="py-2 px-2 text-right">Rdt NET</th>
              <th class="py-2 px-2 text-right hidden sm:table-cell">DPS NET</th>
              <th class="py-2 pr-3 text-right">Statut</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${pipeline.length > 8 ? `<p class="text-xs text-slate-600 text-center mt-2">+${pipeline.length-8} autres · <button onclick="switchTab('psychology')" class="text-indigo-400 hover:text-indigo-300">Voir tableau complet →</button></p>` : ''}
    </div>`;
}

// ─── TABLEAU SYNTHÈSE DIVIDENDES 2025 — onglet Psychologie ───────────────────
// Affiche tous les 16 dividendes exercice 2025 annoncés en 2026 (source sikafinance).
let _div2025SortKey = 'yield';

function sortDiv2025(key) {
  _div2025SortKey = key;
  document.querySelectorAll('.div2025-sort').forEach(b => {
    const isActive = b.dataset.sort === key;
    b.classList.toggle('active', isActive);
    b.classList.toggle('text-slate-300', isActive);
    b.classList.toggle('border-slate-600', isActive);
    b.classList.toggle('text-slate-500', !isActive);
    b.classList.toggle('border-slate-700', !isActive);
  });
  // Re-render avec le dernier divArr mis en cache
  if (STATE._div2025Cache) renderDividend2025Table(STATE._div2025Cache);
}

function renderDividend2025Table(divArr) {
  const el = document.getElementById('div-2025-table');
  if (!el) return;

  STATE._div2025Cache = divArr;  // cache pour le re-tri

  const currentYear = new Date().getFullYear();
  const recentExerc = currentYear - 1;

  const pipeline = (divArr||[]).filter(d => {
    const ds = d.div_status||'aucun';
    if(ds !== 'annoncé' && ds !== 'officiel') return false;
    const ey = d.div_exercice_year;
    return ey && ey >= recentExerc;
  });

  if (!pipeline.length) {
    el.innerHTML = `<p class="text-xs text-slate-500 italic text-center py-6">
      Aucun dividende exercice ${recentExerc} en base de données.<br>
      <span class="text-slate-600">Relancer le chargement : Admin → Seed dividendes 2025</span>
    </p>`;
    return;
  }

  // Tri selon la clé active
  const sorted = [...pipeline].sort((a,b)=>{
    if(_div2025SortKey === 'dps')    return (b.dividend_per_share||0)-(a.dividend_per_share||0);
    if(_div2025SortKey === 'status') return (a.div_status==='officiel'?0:1)-(b.div_status==='officiel'?0:1);
    return (b.dividend_yield||0)-(a.dividend_yield||0);  // yield (défaut)
  });

  const nbOfficiel = sorted.filter(d=>d.div_status==='officiel').length;
  const nbAnnonce  = sorted.filter(d=>d.div_status==='annoncé').length;
  const avgYield   = sorted.reduce((s,d)=>s+(d.dividend_yield||0),0)/sorted.length;

  // Résumé statistiques
  const summary = `
    <div class="grid grid-cols-3 gap-3 mb-4 text-center">
      <div class="bg-slate-800/50 rounded-lg p-3">
        <div class="text-lg font-bold text-emerald-400">${sorted.length}</div>
        <div class="text-xs text-slate-400">Titres avec<br>dividende ${recentExerc}</div>
      </div>
      <div class="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
        <div class="text-lg font-bold text-green-400">${nbOfficiel}</div>
        <div class="text-xs text-slate-400">✓ Officiels<br>(BOC BRVM)</div>
      </div>
      <div class="bg-yellow-900/15 border border-yellow-700/30 rounded-lg p-3">
        <div class="text-lg font-bold text-yellow-400">${nbAnnonce}</div>
        <div class="text-xs text-slate-400">⏳ Annoncés<br>(AGO ${currentYear})</div>
      </div>
    </div>
    <div class="text-xs text-slate-500 mb-3 text-center">
      Rendement NET moyen : <strong class="text-emerald-400">${fmt(avgYield,2)}%</strong> après IRVM UEMOA
    </div>`;

  const rows = sorted.map((d,i) => {
    const yld     = d.dividend_yield || 0;
    const dpsNet  = d.dividend_per_share;   // API renvoie NET ici (dividend_yield=NET)
    const dpsGross= d.dividend_per_share_gross;
    const ds      = d.div_status;
    const irvm    = d.irvm_rate_pct ?? 15;
    const star    = yld>=6.5?'⭐⭐⭐':yld>=5?'⭐⭐':yld>=3.5?'⭐':'';
    const yldColor= yld>=5?'text-green-400':yld>=3.5?'text-lime-400':'text-yellow-400';
    const dsBadge = ds==='officiel'
      ? `<span class="text-xs font-bold px-1.5 py-0.5 rounded bg-green-900/50 text-green-300 border border-green-700/40">✓ BOC</span>`
      : `<span class="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-300 border border-yellow-700/40">⏳ AGO</span>`;
    const payDate = d.div_payment_date
      ? `<div class="text-xs text-slate-600 mt-0.5">Paiement : ${d.div_payment_date}</div>` : '';
    const psycho  = yld>=6.5?'Euphorie 🤑':yld>=5?'Engouement 😊':yld>=3.5?'Attractif ↑':yld>=2?'Correct':'Neutre';
    return `<tr class="border-b border-slate-700/40 last:border-0 hover:bg-slate-800/50 cursor-pointer transition-colors" onclick="openFund('${d.symbol}')">
      <td class="py-2.5 pl-3 text-xs text-slate-500">#${i+1}</td>
      <td class="py-2.5 px-2">
        <div class="font-bold text-sm text-indigo-300">${d.symbol}</div>
        <div class="text-xs text-slate-500 truncate max-w-[90px]">${(d.country||'').split(' ')[0]}</div>
      </td>
      <td class="py-2.5 px-2 hidden md:table-cell">
        <div class="text-xs text-slate-300 max-w-[130px] truncate">${(d.name||'').substring(0,22)}</div>
        <div class="text-xs text-slate-600">${d.sector||''}</div>
      </td>
      <td class="py-2.5 px-2 text-right">
        <div class="font-black text-base ${yldColor}">${fmt(yld,2)}% ${star}</div>
        <div class="text-xs text-slate-600">NET IRVM ${irvm}%</div>
      </td>
      <td class="py-2.5 px-2 text-right hidden sm:table-cell">
        <div class="text-sm font-bold text-slate-200">${dpsNet!=null?fmt(dpsNet,0)+' F':'—'}</div>
        <div class="text-xs text-slate-600">net/action</div>
        ${dpsGross!=null?`<div class="text-xs text-slate-700">(brut: ${fmt(dpsGross,0)} F)</div>`:''}
      </td>
      <td class="py-2.5 px-2 text-center">${dsBadge}${payDate}</td>
      <td class="py-2.5 pr-3 text-right hidden lg:table-cell">
        <div class="text-xs ${yld>=5?'text-green-400':yld>=3.5?'text-lime-400':'text-slate-400'} font-medium">${psycho}</div>
        ${d.per?`<div class="text-xs text-slate-600">P/E ${fmt(d.per,1)}x</div>`:''}
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = summary + `
    <table class="w-full text-sm min-w-[500px]">
      <thead>
        <tr class="text-slate-500 text-xs uppercase border-b border-slate-700">
          <th class="py-2 pl-3 text-left">#</th>
          <th class="py-2 px-2 text-left">Ticker</th>
          <th class="py-2 px-2 text-left hidden md:table-cell">Société</th>
          <th class="py-2 px-2 text-right">Rdt NET</th>
          <th class="py-2 px-2 text-right hidden sm:table-cell">DPS NET</th>
          <th class="py-2 px-2 text-center">Statut</th>
          <th class="py-2 pr-3 text-right hidden lg:table-cell">Psychologie</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── RECOMMANDATION BOX ───────────────────────────────────────────────────────
function renderRecommendationBox(containerId, reco) {
  const el=document.getElementById(containerId);
  if(!el||!reco) return;

  const axes=reco.axes||{};
  const axeBar=(label,score,weight)=>`
    <div class="flex items-center gap-3 text-xs">
      <span class="text-slate-400 w-28 shrink-0">${label} <span class="text-slate-600">(${weight})</span></span>
      <div class="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all" style="width:${score}%;background:${scoreColor(score)}"></div>
      </div>
      <span class="font-bold w-8 text-right" style="color:${scoreColor(score)}">${score}</span>
    </div>`;

  el.innerHTML=`
    <div class="rounded-xl border p-5 mt-4" style="background:${reco.bg};border-color:${reco.border}">
      <!-- En-tête recommandation -->
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div class="text-4xl font-black" style="color:${reco.color}">${reco.icon}</div>
          <div>
            <div class="text-2xl font-black tracking-wide" style="color:${reco.color}">${reco.recommendation}</div>
            <div class="text-xs text-slate-400 mt-0.5">Score de conviction : ${reco.score}/100</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-400">Horizon</div>
          <div class="text-sm font-medium text-slate-200">${reco.horizon||'—'}</div>
          <div class="text-xs text-slate-500 mt-1">Risque : <span class="text-slate-300">${reco.risk_level||'N/D'}</span></div>
        </div>
      </div>

      <!-- Sélecteur de profil investisseur -->
      <div class="mb-4 p-3 rounded-lg bg-slate-900/40 border border-slate-700/40">
        <div class="text-xs text-slate-500 mb-2">Profil investisseur</div>
        <div class="flex flex-wrap gap-2">
          ${[['rentier','Rentier','💰'],['croissance','Croissance','📈'],['trader','Trader','⚡'],['mixte','Mixte','⚖️']].map(([p,label,icon])=>{
            const active = (reco.profil||'mixte') === p;
            return `<button onclick="setProfilFor('${reco.symbol||''}','${p}');loadFundamental('${reco.symbol||''}')"
              class="text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${active
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}">${icon} ${label}</button>`;
          }).join('')}
        </div>
        <div class="text-xs text-indigo-400 mt-2 font-medium">${reco.profil_label||'Mixte — équilibré'}</div>
      </div>

      <!-- Résumé -->
      <p class="text-sm text-slate-200 mb-4 leading-relaxed">${reco.summary||''}</p>

      <!-- Facteurs clés (dividende en premier) -->
      ${(reco.key_factors||[]).length ? `
      <div class="mb-4 space-y-1.5">
        ${(reco.key_factors||[]).map(f=>`
          <div class="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${f.positive?'bg-green-900/30 text-green-300':'bg-red-900/20 text-red-300'}">
            ${f.text}
          </div>`).join('')}
      </div>` : ''}

      <!-- Scores par axe -->
      <div class="space-y-2">
        ${axeBar('Technique', axes.technique?.score||50, axes.technique?.weight||'40%')}
        ${axeBar('Fondamentale', axes.fondamentale?.score||50, axes.fondamentale?.weight||'35%')}
        ${axeBar('Psychologie', axes.psychologie?.score||50, axes.psychologie?.weight||'25%')}
      </div>

      <!-- Détails par axe -->
      <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        ${['technique','fondamentale','psychologie'].map(ax=>{
          const a=axes[ax];
          if(!a) return '';
          return `<div class="bg-slate-900/50 rounded-lg p-3">
            <div class="font-semibold mb-2 capitalize" style="color:${scoreColor(a.score)}">${ax.charAt(0).toUpperCase()+ax.slice(1)} : ${a.score}/100</div>
            <p class="text-slate-400 mb-2 text-xs leading-snug">${a.summary||''}</p>
            <div class="space-y-1.5">
              ${(a.details||[]).map(d=>`
                <div class="text-xs">
                  <div class="flex justify-between gap-1">
                    <span class="text-slate-400 truncate font-medium">${d.label}</span>
                    <span class="font-bold shrink-0 ml-1" style="color:${scoreColor(d.score)}">${d.score}/100</span>
                  </div>
                  ${d.detail ? `<div class="text-slate-500 text-xs mt-0.5 leading-snug">${d.detail}</div>` : ''}
                </div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="mt-3 text-xs text-slate-600 text-right">Calculé le ${new Date(reco.computed||Date.now()).toLocaleString('fr-FR')}</div>
    </div>`;
}

function scoreColor(s) {
  if(s>=70) return '#22c55e';
  if(s>=55) return '#84cc16';
  if(s>=42) return '#eab308';
  if(s>=28) return '#f97316';
  return '#ef4444';
}

// ─── DIVIDENDE MANUEL ────────────────────────────────────────────────────────
function _syncTechIfActive(symbol) {
  if (STATE.techSymbol !== symbol) return;
  const profil = getProfilFor(symbol);
  Promise.all([
    api(`/api/stocks/${symbol}/fundamental`).catch(()=>null),
    api(`/api/stocks/${symbol}/recommendation?profil=${profil}`).catch(()=>null),
  ]).then(([fundD, recoD]) => {
    if (fundD) renderTechDividendBlock(fundD);
    if (recoD) renderRecommendationBox('tech-reco-box', {...recoD, symbol});
  });
}

async function saveManualDiv(symbol) {
  const rawVal  = document.getElementById('manual-div-net')?.value ?? '';
  const netDps  = rawVal === '' ? null : parseFloat(rawVal);
  const year    = parseInt(document.getElementById('manual-div-year')?.value || '0');
  const resEl   = document.getElementById('manual-div-result');

  if (netDps === null || isNaN(netDps) || netDps < 0) {
    if (resEl) resEl.innerHTML = '<span class="text-red-400">Saisissez un montant valide (0 = pas de dividende)</span>';
    return;
  }
  if (resEl) resEl.textContent = 'Enregistrement...';

  try {
    const r = await fetch(`/api/stocks/${symbol}/dividend-manual`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ net_dps: netDps, exercice_year: year })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erreur serveur');

    if (d.no_dividend) {
      if (resEl) resEl.innerHTML = `
        <div class="bg-slate-800 rounded-lg p-3 mt-2 text-center">
          <span class="text-slate-300 font-semibold">⚠️ Pas de dividende enregistré pour l'exercice ${year}</span>
          <div class="text-slate-500 text-xs mt-1">Rendement : 0% — PER basé sur BNPA uniquement</div>
        </div>
        <div class="text-green-400 mt-2">✓ Enregistré.</div>`;
      toast(`${symbol} — Pas de dividende exercice ${year}`, 3000);
    } else {
      if (resEl) resEl.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <div class="bg-slate-800 rounded-lg p-2 text-center">
            <div class="text-slate-400 text-xs">Net</div>
            <div class="font-bold text-green-300">${fmt(d.net_dps,0)} FCFA</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-2 text-center">
            <div class="text-slate-400 text-xs">Brut (avant IRVM ${d.irvm_pct}%)</div>
            <div class="font-bold text-slate-200">${fmt(d.gross_dps,0)} FCFA</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-2 text-center">
            <div class="text-slate-400 text-xs">Rendement net</div>
            <div class="font-bold text-indigo-300">${d.net_yield_pct!=null?fmt(d.net_yield_pct,2)+'%':'—'}</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-2 text-center">
            <div class="text-slate-400 text-xs">P/E Ratio</div>
            <div class="font-bold text-slate-200">${d.per!=null?fmt(d.per,1)+'x':'—'}</div>
          </div>
        </div>
        <div class="text-green-400 mt-2">✓ Dividende enregistré.</div>`;
      toast(`Dividende ${symbol} enregistré — Net: ${fmt(netDps,0)} FCFA`, 4000);
    }
    setTimeout(() => {
      loadFundamental(symbol);
      _syncTechIfActive(symbol);
    }, 1500);
  } catch(e) {
    if (resEl) resEl.innerHTML = `<span class="text-red-400">Erreur : ${e.message}</span>`;
  }
}

async function deleteManualDiv(symbol) {
  if (!confirm(`Supprimer le dividende manuel de ${symbol} ?`)) return;
  try {
    await fetch(`/api/stocks/${symbol}/dividend-manual`, { method: 'DELETE' });
    toast(`Dividende manuel ${symbol} supprimé`, 3000);
    loadFundamental(symbol);
    _syncTechIfActive(symbol);
  } catch(e) {
    toast('Erreur suppression', 2000);
  }
}

// ─── PROFIL INVESTISSEUR ──────────────────────────────────────────────────────
function getProfilFor(symbol) {
  return localStorage.getItem(`profil_${symbol}`) || 'mixte';
}
function setProfilFor(symbol, profil) {
  localStorage.setItem(`profil_${symbol}`, profil);
}

// ─── ANALYSE FONDAMENTALE ─────────────────────────────────────────────────────
async function loadFundamental(symbol) {
  if(!symbol) return;
  STATE.fundSymbol=symbol;
  setHTML('fundamental-content','<div class="text-center py-16 text-slate-400">Chargement...</div>');

  try {
    const status = await api(`/api/stocks/${symbol}`);
    if(!(status.fundamentals?.dividend_yield) && !(status.fundamentals?.per)) {
      toast(`Chargement des fondamentaux de ${symbol}...`, 5000);
      await fetch(`/api/stocks/${symbol}/fetch-history`,{method:'POST'});
      await new Promise(r=>setTimeout(r,4000));
    }

    const profil = getProfilFor(symbol);
    const [fundD, recoD, divD] = await Promise.all([
      api(`/api/stocks/${symbol}/fundamental`),
      api(`/api/stocks/${symbol}/recommendation?profil=${profil}`).catch(()=>null),
      api('/api/market/dividends').catch(()=>({dividends:[]})),
    ]);

    renderFundamental(fundD, recoD);
    renderFundDiv2025Context(symbol, divD.dividends||[]);
  } catch(e) {
    setHTML('fundamental-content',`<div class="text-center py-10 text-red-400">Erreur: ${e.message}</div>`);
  }
}

function renderFundamental(d, reco) {
  const { stock, latest, fundamentals:f, high_low_52w:hw, derived:dv, notes } = d;
  const price=latest?.close;

  const perf=(v)=>v==null
    ? '<span class="text-slate-600">N/A</span>'
    : `<span class="${v>0?'text-green-400':v<0?'text-red-400':'text-slate-400'} font-bold">${fmtP(v)}</span>`;

  // Bloc dividende — affiche BRUT et NET (après retenue fiscale UEMOA) + statut
  const dyNet   = f?.dividend_yield_net;
  const dyGross = f?.dividend_yield_gross ?? f?.dividend_yield;
  const dpsNet  = f?.dividend_per_share_net;
  const dpsGross= f?.dividend_per_share;
  const irvm    = f?.irvm_rate_pct ?? 15;
  const hasDiv  = (dyNet ?? dyGross ?? 0) > 0;
  // Badge statut pipeline : 'annoncé' (AGO) ou 'officiel' (BOC BRVM)
  // IMPORTANT : seuls les dividendes de l'exercice récent (N-1) sont dans le pipeline
  // Les dividendes historiques (exercices antérieurs déjà payés) s'affichent différemment
  const fDivStatus     = f?.div_status || 'aucun';
  const fExerciceLabel = f?.div_exercice_label || null;
  const fIsPipeline    = fDivStatus === 'officiel' || fDivStatus === 'annoncé';
  const fStatusBadge = fDivStatus==='officiel'
    ? `<span class="ml-2 px-1.5 py-0.5 rounded text-xs font-bold bg-green-900/60 text-green-300 border border-green-700/50">✓ OFFICIEL BOC</span>`
    : fDivStatus==='annoncé'
    ? `<span class="ml-2 px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-900/60 text-yellow-300 border border-yellow-700/50">⏳ ANNONCÉ AGO</span>`
    : '';
  const fExerciceBadge = fExerciceLabel
    ? `<span class="ml-1 text-xs text-slate-500">${fExerciceLabel}</span>` : '';
  const fPayDate = f?.div_payment_date
    ? `<span class="text-slate-500 text-xs ml-1">· Paiement : ${f.div_payment_date}</span>` : '';
  const divBlock = f ? `
    <div class="col-span-2 md:col-span-4 rounded-xl p-4 ${fIsPipeline&&hasDiv?'bg-green-900/20 border border-green-700/40':hasDiv?'bg-slate-800/50 border border-slate-700':'bg-red-900/10 border border-red-700/20'}">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="text-2xl">${fIsPipeline&&hasDiv?'💰':hasDiv?'📜':'⚠️'}</div>
        <div class="flex-1">
          <div class="font-bold text-sm ${fIsPipeline&&hasDiv?'text-green-300':hasDiv?'text-slate-400':'text-red-400'} flex items-center flex-wrap gap-1">
            ${fIsPipeline&&hasDiv
              ? `Dividende ${fDivStatus==='officiel'?'Officiel':'Annoncé'} — Net : <span class="text-xl">${fmt(dyNet??dyGross,2)}%</span>${fStatusBadge}${fExerciceBadge}${fPayDate}`
              : hasDiv
              ? `Rendement — Net : <span class="text-lg">${fmt(dyNet??dyGross,2)}%</span> <span class="text-xs font-normal text-slate-500">(exercice antérieur — déjà distribué)</span>`
              : 'Aucun dividende annoncé pour cet exercice'}
          </div>
          ${hasDiv ? `
            <div class="flex flex-wrap gap-4 mt-1.5 text-xs">
              <div class="text-slate-300">
                <span class="text-slate-500">Net (après IRVM ${irvm}%)</span><br>
                <span class="font-bold text-green-300 text-base">${dpsNet!=null?fmt(dpsNet,0)+' FCFA/action':dyNet!=null?fmt(dyNet,2)+'%':'—'}</span>
              </div>
              <div class="text-slate-400 border-l border-slate-700 pl-4">
                <span class="text-slate-500">Brut (avant retenue)</span><br>
                <span class="text-slate-300">${dpsGross?fmt(dpsGross,0)+' FCFA':dyGross?fmt(dyGross,2)+'%':'—'}</span>
              </div>
              <div class="text-slate-400 border-l border-slate-700 pl-4">
                <span class="text-slate-500">Attractivité</span><br>
                <span class="${(dyNet??0)>=5?'text-green-400':(dyNet??0)>=3.5?'text-lime-400':'text-yellow-400'}">
                  ${(dyNet??dyGross??0)>=5?'Exceptionnel ⭐⭐⭐':(dyNet??dyGross??0)>=3.5?'Attractif ⭐⭐':(dyNet??dyGross??0)>=2?'Correct ⭐':'Modeste'}
                </span>
              </div>
            </div>
          ` : '<div class="text-xs text-red-400/70 mt-1">Non recommandé pour les investisseurs en quête de revenus BRVM</div>'}
        </div>
        ${f.per ? `<div class="ml-auto text-right shrink-0"><div class="text-xs text-slate-400">P/E Ratio</div><div class="font-bold text-lg text-slate-200">${fmt(f.per,1)}x</div></div>` : ''}
      </div>
    </div>` : '';

  // ── Formulaire saisie manuelle dividende ───────────────────────────────────
  const curYear = new Date().getFullYear();
  const manualDivForm = `
    <div class="rounded-xl border border-indigo-700/40 bg-indigo-900/10 p-4 mb-5" id="manual-div-block">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-base">✏️</span>
        <span class="text-sm font-semibold text-indigo-300">Saisie manuelle du dividende</span>
        ${fDivStatus==='manuel' ? `<span class="ml-2 px-1.5 py-0.5 rounded text-xs font-bold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">✓ MANUEL ENREGISTRÉ</span>` : fDivStatus==='sans_dividende' ? `<span class="ml-2 px-1.5 py-0.5 rounded text-xs font-bold bg-slate-700 text-slate-400 border border-slate-600">⚠️ SANS DIVIDENDE</span>` : ''}
      </div>
      <div class="flex flex-wrap gap-3 items-end">
        <div>
          <label class="text-xs text-slate-400 block mb-1">Dividende net (FCFA/action)</label>
          <input id="manual-div-net" type="number" min="0" step="0.01"
            value="${dpsNet ?? ''}"
            placeholder="ex: 250"
            class="w-36 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none">
        </div>
        <div>
          <label class="text-xs text-slate-400 block mb-1">Exercice</label>
          <input id="manual-div-year" type="number" min="2010" max="${curYear}"
            value="${f?.div_exercice_year ?? curYear - 1}"
            class="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none">
        </div>
        <button onclick="saveManualDiv('${stock.symbol}')"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
          Calculer & Enregistrer
        </button>
        ${fDivStatus==='manuel' ? `<button onclick="deleteManualDiv('${stock.symbol}')"
          class="px-3 py-2 bg-slate-700 hover:bg-red-900 text-slate-300 hover:text-red-300 text-sm rounded-lg transition-colors">
          Supprimer
        </button>` : ''}
      </div>
      <div id="manual-div-result" class="mt-3 text-xs text-slate-400"></div>
    </div>`;

  setHTML('fundamental-content',`
    <!-- En-tête -->
    <div class="bg-card rounded-xl border border-border p-5 mb-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-3 mb-1">
            <h2 class="text-xl font-black text-slate-100">${stock.symbol}</h2>
            <span class="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 text-xs rounded-full border border-indigo-700">${stock.sector||'—'}</span>
          </div>
          <p class="text-slate-300 font-medium">${stock.name||'—'}</p>
          <p class="text-xs text-slate-500 mt-1">${stock.country||''} ${stock.isin?'· ISIN: '+stock.isin:''}</p>
        </div>
        <div class="text-right">
          <div class="text-3xl font-black text-slate-100">${fmt(price,0)} <span class="text-base font-normal text-slate-400">FCFA</span></div>
          <div class="text-base font-bold ${vClass(latest?.variation_pct)} mt-1">${fmtP(latest?.variation_pct)}</div>
          <div class="text-xs text-slate-500 mt-1">Au ${latest?.date||'—'}</div>
        </div>
      </div>
    </div>

    <!-- Recommandation -->
    <div id="fund-reco-box"></div>

    <!-- Saisie manuelle dividende -->
    ${manualDivForm}

    <!-- Métriques clés dont dividende en vedette -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 mb-5">
      ${divBlock}
      <div class="fund-metric"><div class="label">Capitalisation</div><div class="value">${fmtB(latest?.market_cap)}</div><div class="sub">FCFA</div></div>
      <div class="fund-metric"><div class="label">Volume</div><div class="value">${fmtB(latest?.volume)}</div><div class="sub">Titres</div></div>
      <div class="fund-metric"><div class="label">Plus haut 52 sem.</div><div class="value text-green-400">${fmt(hw?.high_52w,0)||'—'}</div></div>
      <div class="fund-metric"><div class="label">Plus bas 52 sem.</div><div class="value text-red-400">${fmt(hw?.low_52w,0)||'—'}</div></div>
    </div>

    <!-- Performances -->
    <div class="bg-card rounded-xl border border-border p-5 mb-5">
      <h3 class="font-semibold text-slate-200 mb-4 text-sm">Performances Historiques</h3>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
        ${[['1J',dv?.perf_1d],['5J',dv?.perf_5d],['1M',dv?.perf_1m],['3M',dv?.perf_3m],['6M',dv?.perf_6m],['1A',dv?.perf_1y]].map(([l,v])=>`
          <div class="bg-slate-800/50 rounded-lg p-2">
            <div class="text-xs text-slate-500 mb-1">${l}</div>
            <div class="text-sm font-bold">${perf(v)}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Saisie manuelle fondamentaux -->
    <div class="bg-card rounded-xl border border-border p-5 mb-5">
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-semibold text-slate-200 text-sm">Données Fondamentales</h3>
        <span class="text-xs text-slate-500">Sources: rapports annuels BRVM / AFX</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><label class="block text-xs text-slate-400 mb-1">Rendement Div. (%)</label>
          <input type="number" id="in-div" step="0.01" value="${f?.dividend_yield||''}" placeholder="ex: 5.91"
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"/></div>
        <div><label class="block text-xs text-slate-400 mb-1">Dividende/action (FCFA)</label>
          <input type="number" id="in-dps" step="1" value="${f?.dividend_per_share||''}" placeholder="ex: 1655"
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"/></div>
        <div><label class="block text-xs text-slate-400 mb-1">P/E Ratio</label>
          <input type="number" id="in-per" step="0.1" value="${f?.per||''}" placeholder="ex: 6.77"
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"/></div>
        <div><label class="block text-xs text-slate-400 mb-1">BPA (FCFA)</label>
          <input type="number" id="in-eps" step="1" value="${f?.eps||''}" placeholder="ex: 4136"
          class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"/></div>
      </div>
      <button onclick="saveFund('${stock.symbol}')" class="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors">Sauvegarder</button>
      <button onclick="fetchAndRefreshFund('${stock.symbol}')" class="mt-3 ml-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors">↻ Recharger depuis AFX</button>
    </div>

    <!-- Notes -->
    <div class="bg-card rounded-xl border border-border p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-slate-200 text-sm">Mes Notes & Signaux</h3>
        <button onclick="openNoteModal('${stock.symbol}')" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition-colors">+ Note</button>
      </div>
      <div id="notes-list">
        ${(notes||[]).length ? notes.map(n=>`
          <div class="note-card mb-2">
            <div class="flex items-center gap-2 mb-1">
              <span class="signal-badge signal-${n.signal}">${n.signal}</span>
              <span class="text-slate-500 text-xs">${(n.created_at||'').substring(0,10)}</span>
            </div>
            <p class="text-slate-300 text-xs">${n.note}</p>
          </div>`).join('') : '<p class="text-xs text-slate-500">Aucune note</p>'}
      </div>
    </div>
  `);

  // Injecter la recommandation
  if(reco) renderRecommendationBox('fund-reco-box', {...reco, symbol: d?.symbol || reco.symbol || ''});

  // Afficher le bouton d'export PDF
  document.getElementById('pdf-export-section-fund')?.classList.remove('hidden');
}

async function saveFund(sym) {
  const div=parseFloat(document.getElementById('in-div')?.value);
  const dps=parseFloat(document.getElementById('in-dps')?.value);
  const per=parseFloat(document.getElementById('in-per')?.value);
  const eps=parseFloat(document.getElementById('in-eps')?.value);
  const body={};
  if(!isNaN(div)) body.dividend_yield=div;
  if(!isNaN(per)) body.per=per;
  if(!isNaN(eps)) body.eps=eps;
  if(!isNaN(dps)) body.dividend_per_share=dps;
  await fetch(`/api/stocks/${sym}/fundamental`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  toast('Fondamentaux sauvegardés ✓');
  setTimeout(()=>loadFundamental(sym),500);
}

async function fetchAndRefreshFund(sym) {
  toast(`Rechargement depuis AFX pour ${sym}...`,6000);
  await fetch(`/api/stocks/${sym}/fetch-history`,{method:'POST'});
  await new Promise(r=>setTimeout(r,5000));
  loadFundamental(sym);
}

// ─── PSYCHOLOGIE DU MARCHÉ ────────────────────────────────────────────────────
async function loadSentiment() {
  try {
    const [sentD, divD, newsD] = await Promise.all([
      api('/api/market/sentiment'),
      api('/api/market/dividends').catch(()=>({dividends:[]})),
      api('/api/news?limit=30').catch(()=>({news:[]})),
    ]);
    renderGauge(sentD.score);
    renderEuphoriaNarrative(sentD.score, sentD.components, divD.dividends||[]);
    renderSentimentComponents(sentD.components);
    renderBreadthHistory(sentD.history||[]);
    renderSectorPerf();
    renderGlobalSignal(sentD);
    // Actualités enrichies depuis toutes les sources (sikafinance + richbourse + lejecos)
    const psychNews = newsD.news?.length ? newsD.news : (sentD.news||[]);
    renderNews('psych-news', psychNews);
    renderDividendLeaders(divD.dividends||[]);
    renderDividendCalendar(divD.dividends||[]);
    renderResultsTracker(divD.dividends||[]);
    renderDividend2025Table(divD.dividends||[]);
  } catch(e) { console.error('Sentiment error:', e); }
}

function renderGauge(score) {
  const canvas=document.getElementById('gauge-canvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const w=canvas.width, h=canvas.height, cx=w/2, cy=h-20, r=120;
  ctx.clearRect(0,0,w,h);

  // Arc coloré
  const zones=[
    {from:Math.PI,to:Math.PI*1.2,c:'#7f1d1d'},
    {from:Math.PI*1.2,to:Math.PI*1.4,c:'#ef4444'},
    {from:Math.PI*1.4,to:Math.PI*1.6,c:'#f97316'},
    {from:Math.PI*1.6,to:Math.PI*1.8,c:'#eab308'},
    {from:Math.PI*1.8,to:Math.PI*2.0,c:'#84cc16'},
    {from:Math.PI*2.0,to:Math.PI*2.2,c:'#22c55e'},
  ];
  zones.forEach(z=>{
    ctx.beginPath();ctx.arc(cx,cy,r,z.from,z.to);
    ctx.lineWidth=28;ctx.strokeStyle=z.c;ctx.stroke();
  });

  // Aiguille
  const angle=Math.PI+((score||0)/100)*Math.PI;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);
  ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-r+30,0);
  ctx.lineWidth=3;ctx.strokeStyle='#f1f5f9';ctx.lineCap='round';ctx.stroke();
  ctx.restore();

  // Centre
  ctx.beginPath();ctx.arc(cx,cy,8,0,Math.PI*2);
  ctx.fillStyle='#f1f5f9';ctx.fill();

  // Labels
  ctx.font='10px Inter,sans-serif';ctx.fillStyle='#64748b';ctx.textAlign='center';
  ctx.fillText('0',cx-r-10,cy+4);
  ctx.fillText('50',cx,cy-r-10);
  ctx.fillText('100',cx+r+14,cy+4);

  setText('gauge-score', score!=null?Math.round(score):'—');
}

function renderSentimentComponents(comps) {
  if(!comps) return;
  setHTML('sentiment-components', Object.values(comps).map(c=>{
    const pct=Math.round(c.score||0);
    const col=pct>=60?'#22c55e':pct>=40?'#eab308':'#ef4444';
    const isDivComp = (c.label||'').includes('Dividende');
    // Composante dividende mise en avant avec encadré spécial BRVM
    if(isDivComp) {
      return `<div class="rounded-lg border border-yellow-700/40 bg-yellow-900/15 p-3">
        <div class="flex justify-between text-xs mb-1.5">
          <span class="text-yellow-300 font-semibold flex items-center gap-1.5">
            <span class="text-base">💰</span>${c.label}
            <span class="text-yellow-600 text-xs font-normal">(Clé BRVM — 25%)</span>
          </span>
          <span class="font-black text-base" style="color:${col}">${pct}</span>
        </div>
        <div class="sentiment-bar-track h-2.5">
          <div class="sentiment-bar-fill h-full" style="width:${pct}%;background:linear-gradient(90deg,${col},${pct>=60?'#86efac':pct>=40?'#fde047':'#fca5a5'})"></div>
        </div>
        <div class="text-xs text-yellow-700/80 mt-1.5 leading-snug">${c.detail}</div>
        <div class="text-xs text-slate-500 mt-1 italic">Sur la BRVM, le dividende conditionne directement le comportement des investisseurs</div>
      </div>`;
    }
    return `<div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-slate-300">${c.label}</span>
        <span class="font-bold" style="color:${col}">${pct}</span>
      </div>
      <div class="sentiment-bar-track">
        <div class="sentiment-bar-fill" style="width:${pct}%;background-color:${col}"></div>
      </div>
      <div class="text-xs text-slate-500 mt-0.5">${c.detail}</div>
    </div>`;
  }).join(''));
}

let _breadthChart=null, _sectorChart=null;

function renderBreadthHistory(history) {
  const canvas=document.getElementById('breadth-chart');
  if(!canvas) return;
  if(_breadthChart) _breadthChart.destroy();
  _breadthChart=new Chart(canvas,{
    type:'line',
    data:{labels:history.map(h=>(h.date||'').substring(5)),
          datasets:[{label:'% hausse',data:history.map(h=>h.score||50),
            borderColor:'#818cf8',backgroundColor:'rgba(129,140,248,0.1)',
            fill:true,tension:0.3,pointRadius:0,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#64748b',maxTicksLimit:8},grid:{color:'#1e293b'}},
              y:{ticks:{color:'#64748b'},grid:{color:'#273449'},min:0,max:100}}},
  });
}

async function renderSectorPerf() {
  try {
    const d=await api('/api/stocks');
    const bySec={};
    d.stocks.forEach(s=>{
      if(!s.sector) return;
      if(!bySec[s.sector]) bySec[s.sector]={count:0,up:0};
      bySec[s.sector].count++;
      if((s.variation_pct||0)>0) bySec[s.sector].up++;
    });
    const sectors=Object.keys(bySec);
    const pcts=sectors.map(s=>Math.round(bySec[s].up/bySec[s].count*100));
    const colors=pcts.map(p=>p>=60?'#22c55e':p>=40?'#eab308':'#ef4444');
    const canvas=document.getElementById('sector-chart');
    if(!canvas) return;
    if(_sectorChart) _sectorChart.destroy();
    _sectorChart=new Chart(canvas,{
      type:'bar',
      data:{labels:sectors,datasets:[{data:pcts,backgroundColor:colors,borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{ticks:{color:'#64748b',maxRotation:45,font:{size:9}},grid:{color:'#1e293b'}},
                y:{ticks:{color:'#64748b'},grid:{color:'#273449'},min:0,max:100}}},
    });
  } catch(e){}
}

function renderGlobalSignal(d) {
  const score=d.score||50;
  const labelEl=document.getElementById('gauge-label');
  const emojiEl=document.getElementById('gauge-emoji');
  if(labelEl){labelEl.textContent=d.label||'—';labelEl.style.color=d.color||'#94a3b8';}
  if(emojiEl) emojiEl.textContent=d.emoji||'';

  // Descriptions contextualisées BRVM — le dividende est la clé comportementale
  const descs={
    'Peur Extrême': 'Panique généralisée. Ventes massives, y compris sur les valeurs dividendes. Opportunité rare pour les investisseurs long terme audacieux.',
    'Peur':         'Pessimisme dominant. Les titres sans dividende sont abandonnés. Sélectivité : privilégier les valeurs à fort rendement dividende.',
    'Neutre':       'Marché équilibré. Les valeurs dividendes maintiennent leur attrait. Moment idéal pour étudier les fondamentaux.',
    'Avidité':      'Optimisme croissant. Les titres dividendes sont très demandés. Vigilance sur les valorisations des valeurs sans dividende.',
    'Avidité Extrême': 'Euphorie généralisée, portée par les valeurs à hauts dividendes. Risque de correction. Évaluer les niveaux de résistance.',
  };

  const badge=document.getElementById('signal-badge');
  const desc=document.getElementById('signal-desc');
  const stats=document.getElementById('market-stats');
  if(badge){badge.textContent=d.label||'—';badge.style.color=d.color||'#94a3b8';}
  if(desc) desc.textContent=descs[d.label]||'';
  if(stats) {
    const c=d.components||{};
    // Afficher les composantes avec mise en avant dividende BRVM
    stats.innerHTML=Object.values(c).map(comp=>{
      const isDivComp = comp.label && comp.label.includes('Dividende');
      return `<div class="flex justify-between text-xs py-1.5 border-b border-slate-700 last:border-0 ${isDivComp?'bg-yellow-900/10 -mx-2 px-2 rounded':''}">
        <span class="${isDivComp?'text-yellow-300 font-medium':'text-slate-400'}">${comp.label}${isDivComp?' 🏅':''}</span>
        <span class="font-semibold" style="color:${scoreColor(comp.score)}">${Math.round(comp.score)}/100</span>
      </div>`;
    }).join('');
  }
}

async function renderDividendLeaders(preloaded) {
  try {
    const divArr = preloaded ?? (await api('/api/market/dividends')).dividends;
    const el=document.getElementById('dividend-leaders');
    if(!el) return;
    if(!divArr?.length){el.innerHTML='<p class="text-xs text-slate-500 text-center py-4">Données dividendes non disponibles</p>';return;}
    // Prioriser pipeline courant (ex_year défini) puis compléter avec anciens si nécessaire
    const currentYear = new Date().getFullYear();
    const recentExerc = currentYear - 1;
    const pipeline2025 = divArr.filter(s => s.div_exercice_year && s.div_exercice_year >= recentExerc
                                         && (s.div_status === 'officiel' || s.div_status === 'annoncé'));
    const displayArr = pipeline2025.length >= 6
      ? pipeline2025
      : divArr.filter(s => s.dividend_yield > 0);  // fallback : tous si pas assez de 2025
    el.innerHTML=displayArr.slice(0,8).map(s=>{
      // L'API retourne déjà dividend_yield = NET et dividend_yield_gross = brut
      const yldNet  = s.dividend_yield;          // NET (après IRVM) — valeur principale
      const yldGross= s.dividend_yield_gross;    // Brut avant retenue fiscale
      const dpsNet  = s.dividend_per_share;      // DPS NET
      const dpsGross= s.dividend_per_share_gross;// DPS brut
      const irvm    = s.irvm_rate_pct ?? 15;
      const yld     = yldNet;                    // référence = net

      // Étoiles calibrées sur rendement NET UEMOA
      const star = yld>=6.5?'⭐⭐⭐':yld>=5?'⭐⭐':yld>=3.5?'⭐':'';

      // Comportement investisseur BRVM : réaction aux dividendes ANNONCÉS
      const psychoLabelFull = yld>=6.5?'Euphorie 🤑':yld>=5?'Engouement 😊':yld>=3.5?'Attractif ↑':yld>=2?'Correct':'Neutre';
      const psychoColor     = yld>=5?'text-green-400':yld>=3.5?'text-lime-400':yld>=2?'text-yellow-400':'text-slate-400';

      const bg = yld>=5  ? 'bg-green-900/30 border-green-700/40 hover:bg-green-900/50'
               : yld>=3.5? 'bg-lime-900/20 border-lime-700/30 hover:bg-lime-900/40'
               : yld>=2  ? 'bg-yellow-900/15 border-yellow-700/30 hover:bg-yellow-900/30'
                         : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800';

      // Badge statut pipeline : seulement exercice récent (N-1 annoncé à l'AGO N)
      const ds         = s.div_status || 'aucun';
      const isPipeline = ds === 'officiel' || ds === 'annoncé';
      const exLabel    = s.div_exercice_label || (isPipeline ? `Exercice ${new Date().getFullYear()-1}` : null);
      const statusBadge = ds==='officiel'
        ? `<span class="text-xs font-bold px-1.5 py-0.5 rounded bg-green-900/60 text-green-300 border border-green-700/50">✓ OFFICIEL</span>`
        : ds==='annoncé'
        ? `<span class="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-900/60 text-yellow-300 border border-yellow-700/50">⏳ ANNONCÉ</span>`
        : '';

      // Fond plus terne si données historiques (pas dans le pipeline courant)
      const effectiveBg = !isPipeline
        ? 'bg-slate-800/40 border-slate-700 hover:bg-slate-800'
        : bg;

      return `<div class="rounded-xl border p-3 cursor-pointer transition-all ${effectiveBg}" onclick="openFund('${s.symbol}')">
        <div class="flex items-center justify-between mb-0.5 flex-wrap gap-1">
          <span class="font-bold text-indigo-300 text-sm">${s.symbol}</span>
          ${statusBadge}
        </div>
        ${exLabel?`<div class="text-xs text-slate-600 mb-0.5 italic">${exLabel}</div>`:''}
        <div class="text-slate-400 text-xs mb-1 truncate">${(s.name||'').substring(0,20)}</div>
        <div class="text-xl font-black ${isPipeline?(yld>=3.5?'text-green-400':yld>=2?'text-yellow-400':'text-slate-400'):'text-slate-500'}">${yld!=null?fmt(yld,2)+'%':'—'} ${isPipeline?star:''}</div>
        <div class="flex items-center gap-1 mt-0.5">
          <span class="text-xs font-bold ${isPipeline?'text-emerald-400':'text-slate-600'}">NET</span>
          <span class="text-xs text-slate-600">après IRVM ${irvm}%</span>
        </div>
        ${yldGross!=null?`<div class="text-xs text-slate-600 mt-0.5">Brut : <span class="text-slate-500">${fmt(yldGross,2)}%</span></div>`:''}
        ${dpsNet!=null&&isPipeline?`<div class="text-xs text-slate-300 font-medium">${fmt(dpsNet,0)} FCFA net/action</div>`:''}
        ${dpsGross!=null&&dpsNet!=null&&isPipeline?`<div class="text-xs text-slate-600">(brut : ${fmt(dpsGross,0)} FCFA)</div>`:''}
        <div class="flex justify-between items-center mt-1">
          ${s.per?`<div class="text-xs text-slate-500">P/E ${fmt(s.per,1)}x</div>`:'<div></div>'}
          <span class="text-xs ${isPipeline?psychoColor:'text-slate-600'} font-medium">${isPipeline?psychoLabelFull:'Historique'}</span>
        </div>
      </div>`;
    }).join('');
  } catch(e){}
}

// ─── EUPHORIE : NARRATIVE DYNAMIQUE ──────────────────────────────────────────
function renderEuphoriaNarrative(score, components, divArr) {
  const narEl   = document.getElementById('psych-narrative');
  const badgeEl = document.getElementById('psych-euphoria-badge');
  if(!narEl) return;

  const s           = score ?? 50;
  const currentYear = new Date().getFullYear();   // 2026
  const recentExerc = currentYear - 1;            // 2025

  // Compter dividendes du pipeline courant uniquement (exercice récent)
  // = dividendes de l'exercice 2025 annoncés aux AGO 2026 ou officialisés au BOC
  const pipelineItems = (divArr||[]).filter(d => {
    const ds = d.div_status || 'aucun';
    if(ds !== 'annoncé' && ds !== 'officiel') return false;
    const ey = d.div_exercice_year;
    return ey && ey >= recentExerc;
  });
  const nbOfficiel  = pipelineItems.filter(d => d.div_status === 'officiel').length;
  const nbAnnonce   = pipelineItems.filter(d => d.div_status === 'annoncé').length;
  const hasBonsDivs = pipelineItems.filter(d => (d.dividend_yield||0) >= 4).length;

  // Badge état de marché
  let badgeText='', badgeCls='';
  if(s >= 75)       { badgeText='🤑 EUPHORIE';   badgeCls='bg-green-900/70 text-green-300 border border-green-700'; }
  else if(s >= 58)  { badgeText='😊 AVIDITÉ';    badgeCls='bg-lime-900/70 text-lime-300 border border-lime-700'; }
  else if(s >= 42)  { badgeText='😐 NEUTRE';     badgeCls='bg-yellow-900/70 text-yellow-300 border border-yellow-700'; }
  else if(s >= 25)  { badgeText='😟 PEUR';       badgeCls='bg-orange-900/70 text-orange-300 border border-orange-700'; }
  else              { badgeText='😨 PEUR EXTRÊME';badgeCls='bg-red-900/70 text-red-300 border border-red-700'; }

  if(badgeEl){ badgeEl.textContent=badgeText; badgeEl.className=`px-3 py-1.5 rounded-full text-xs font-bold ${badgeCls}`; badgeEl.classList.remove('hidden'); }

  // Construire le narrative
  // Contexte dividende pour le narrative (exercice récent uniquement)
  let divContext = '';
  if(nbOfficiel>0 || nbAnnonce>0) {
    divContext = `exercice <strong class="text-slate-200">${recentExerc}</strong> : `+
                 (nbOfficiel>0 ? `<strong class="text-green-400">${nbOfficiel} dividende${nbOfficiel>1?'s':''} officialisé${nbOfficiel>1?'s':''} au BOC</strong>` : '')+
                 (nbOfficiel>0 && nbAnnonce>0 ? ' · ' : '')+
                 (nbAnnonce>0 ? `${nbAnnonce} annoncé${nbAnnonce>1?'s':''} en AGO ${currentYear}` : '')+
                 (hasBonsDivs>0 ? ` — <strong class="text-emerald-400">${hasBonsDivs} titre${hasBonsDivs>1?'s':''} ≥ 4% net</strong>` : '');
  } else {
    divContext = `exercice <strong class="text-slate-200">${recentExerc}</strong> : aucun dividende encore annoncé — AGO ${currentYear} attendues (avr–juin)`;
  }

  const narratives = {
    euphorie:  `✅ Les conditions d'euphorie sont réunies — ${divContext}. Les valeurs à haut rendement captent les flux entrants. L'investisseur BRVM est en mode pleine confiance : les annonces de dividendes et les bons résultats créent un momentum haussier auto-entretenu.`,
    avidite:   `📈 Sentiment positif — ${divContext}. Le marché valorise les annonces de dividendes pour l'exercice ${recentExerc}. Les investisseurs se positionnent avant les mises en paiement prévues.`,
    neutre:    `⚖️ Marché en attente de catalyseurs — ${divContext}. Les investisseurs restent sélectifs : les titres avec dividende ${recentExerc} annoncé surperforment ceux sans annonce. Suivre les CR d'assemblées (AGO ${currentYear}).`,
    peur:      `⚠️ Prudence généralisée — ${divContext}. En l'absence de dividendes de l'exercice ${recentExerc} ou de bons résultats, les vendeurs dominent. Surveiller les prochaines annonces en AGO.`,
    extreme:   `🚨 Peur extrême — ${divContext}. Les ventes sont indiscriminées. Les valeurs qui annoncent un dividende ${recentExerc} résistent mieux. Opportunité long terme sur les champions du dividende BRVM.`,
  };

  const key = s>=75?'euphorie':s>=58?'avidite':s>=42?'neutre':s>=25?'peur':'extreme';
  narEl.innerHTML = narratives[key];
}

// ─── CALENDRIER DES DIVIDENDES DU PIPELINE COURANT ───────────────────────────
// N'affiche QUE les dividendes de l'exercice récent (N-1) : annoncés en AGO ou officialisés au BOC.
// Les dividendes des exercices antérieurs (déjà distribués) sont exclus.
function renderDividendCalendar(divArr) {
  const el = document.getElementById('dividend-calendar');
  if(!el) return;

  const currentYear   = new Date().getFullYear();    // 2026
  const recentExerc   = currentYear - 1;             // 2025

  // Filtrer : uniquement annoncé/officiel + exercice récent (ou sans exercice précisé)
  const items = (divArr||[]).filter(d => {
    const ds = d.div_status || 'aucun';
    if(ds !== 'annoncé' && ds !== 'officiel') return false;
    const ey = d.div_exercice_year;
    if(ey && ey < recentExerc) return false;  // dividende d'un exercice antérieur — exclus
    return true;
  });

  if(!items.length) {
    el.innerHTML = `<p class="text-xs text-slate-500 italic text-center py-4">
      Aucun dividende de l'exercice ${recentExerc} annoncé ou officialisé.<br>
      <span class="text-slate-600">Les dividendes sont annoncés lors des AGO (avr–juin ${currentYear})</span><br>
      <span class="text-indigo-400 text-xs cursor-pointer hover:text-indigo-300" onclick="switchTab('portfolio')">↗ Lancer un scan BOC/AGM →</span>
    </p>`;
    return;
  }

  // Trier : officiel en premier, puis annoncé ; par rendement décroissant
  items.sort((a,b) => {
    if(a.div_status !== b.div_status)
      return a.div_status === 'officiel' ? -1 : 1;
    return (b.dividend_yield||0) - (a.dividend_yield||0);
  });

  el.innerHTML = items.slice(0,10).map(d => {
    const ds      = d.div_status || 'aucun';
    const yld     = d.dividend_yield ?? 0;
    const exLabel = d.div_exercice_label || `Exercice ${recentExerc}`;
    const statusCls = ds==='officiel'
      ? 'bg-green-900/30 border-green-700/40 text-green-300'
      : 'bg-yellow-900/25 border-yellow-700/40 text-yellow-300';
    const statusIcon = ds==='officiel' ? '✓ BOC' : '⏳ AGO';
    return `<div class="py-2 border-b border-slate-700/50 last:border-0">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <button onclick="openFund('${d.symbol}')" class="font-bold text-indigo-300 text-xs hover:text-indigo-200 flex-shrink-0">${d.symbol}</button>
          <span class="text-xs text-slate-500 truncate">${(d.name||'').substring(0,16)}</span>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="text-xs font-bold ${yld>=4?'text-green-400':yld>=2.5?'text-lime-400':'text-slate-300'}">${yld>0?fmt(yld,2)+'%':''}</span>
          <span class="text-xs font-bold px-1.5 py-0.5 rounded border ${statusCls}">${statusIcon}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 mt-0.5">
        <span class="text-xs text-slate-600 italic">${exLabel}</span>
        ${d.div_payment_date?`<span class="text-xs text-slate-600">· Paiement : ${d.div_payment_date}</span>`:''}
      </div>
    </div>`;
  }).join('');
}

// ─── RÉSULTATS DES SOCIÉTÉS (BPA) ────────────────────────────────────────────
// Le BPA (Bénéfice Par Action) de l'exercice N-1 est le principal catalyseur :
// quand BPA fort + dividende fort pour le même exercice → euphorie de marché.
function renderResultsTracker(divArr) {
  const el = document.getElementById('results-tracker');
  if(!el) return;

  const recentExerc = new Date().getFullYear() - 1;  // 2025

  // Filtrer les sociétés qui ont un EPS renseigné
  const withEps = (divArr||[]).filter(d => d.eps != null && d.eps > 0)
                               .sort((a,b)=>(b.eps||0)-(a.eps||0));

  if(!withEps.length) {
    el.innerHTML = `<p class="text-xs text-slate-500 italic text-center py-4">
      BPA non disponible — rechargez les fondamentaux depuis l'onglet Fondamentale.<br>
      <span class="text-slate-600">Le BPA de l'exercice ${recentExerc} est le principal catalyseur d'euphorie.</span>
    </p>`;
    return;
  }

  const maxEps = withEps[0].eps || 1;

  el.innerHTML = withEps.slice(0,8).map(d => {
    const eps   = d.eps || 0;
    const pct   = Math.min(Math.round(eps / maxEps * 100), 100);
    const yld   = d.dividend_yield ?? 0;
    const ds    = d.div_status || 'aucun';
    const ey    = d.div_exercice_year;
    // Euphorie = BPA solide + dividende de l'exercice récent annoncé/officiel
    const hasPipelineDiv = (ds === 'annoncé' || ds === 'officiel') && (!ey || ey >= recentExerc);
    const isEuphoria = eps > maxEps * 0.5 && yld >= 3.5 && hasPipelineDiv;
    const barColor   = isEuphoria ? '#22c55e' : eps > maxEps * 0.25 ? '#84cc16' : '#64748b';
    const exLabel    = d.div_exercice_label || (hasPipelineDiv ? `Exercice ${recentExerc}` : '');

    return `<div class="flex items-center gap-2 py-1.5">
      <button onclick="openFund('${d.symbol}')" class="font-bold text-indigo-300 text-xs w-14 text-left hover:text-indigo-200 flex-shrink-0">${d.symbol}</button>
      <div class="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="text-right flex-shrink-0">
        <span class="text-xs font-semibold" style="color:${barColor}">${fmt(eps,0)} FCFA</span>
        ${hasPipelineDiv&&exLabel?`<div class="text-xs text-slate-600 leading-none">${exLabel}</div>`:''}
      </div>
      ${isEuphoria?'<span class="text-xs" title="Euphorie : bon BPA + bon dividende">🤑</span>':'<span class="text-xs invisible">🤑</span>'}
    </div>`;
  }).join('');
}

// ─── MODAL NOTE ───────────────────────────────────────────────────────────────
function openNoteModal(sym) {
  STATE.noteSymbol=sym;
  setText('note-symbol',sym);
  document.getElementById('note-text').value='';
  document.getElementById('note-signal').value='NEUTRE';
  document.getElementById('note-modal').classList.remove('hidden');
}
function closeNoteModal(){document.getElementById('note-modal').classList.add('hidden');}
async function submitNote() {
  const sym=STATE.noteSymbol; if(!sym) return;
  const note=document.getElementById('note-text').value.trim();
  const signal=document.getElementById('note-signal').value;
  if(!note){toast('Veuillez saisir une note');return;}
  await fetch(`/api/stocks/${sym}/notes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signal,note})});
  closeNoteModal(); toast('Note sauvegardée ✓');
  if(STATE.fundSymbol===sym) loadFundamental(sym);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape') closeNoteModal();});

// ─── EXPORT PDF ──────────────────────────────────────────────────────────────
async function exportPDF() {
  const sym = STATE.techSymbol || STATE.fundSymbol;
  if (!sym) { alert("Sélectionnez un titre d'abord"); return; }

  const btn1 = document.getElementById('btn-export-pdf');
  const btn2 = document.getElementById('btn-export-pdf-fund');
  const PDF_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
  </svg> Télécharger le Rapport PDF`;
  const SPIN_ICON = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
  </svg> Génération en cours...`;

  [btn1, btn2].forEach(b => { if(b){ b.disabled=true; b.innerHTML=SPIN_ICON; }});

  try {
    const url = `/api/stocks/${sym}/export/pdf`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erreur ${response.status}: ${await response.text()}`);
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BRVM_${sym}_${new Date().toISOString().slice(0,10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast(`Rapport PDF pour ${sym} téléchargé ✓`);
  } catch(e) {
    alert('Erreur lors de la génération du PDF : ' + e.message);
  } finally {
    [btn1, btn2].forEach(b => { if(b){ b.disabled=false; b.innerHTML=PDF_ICON; }});
  }
}

// ─── REFRESH & STATUS ─────────────────────────────────────────────────────────
async function manualRefresh() {
  document.getElementById('refresh-icon')?.classList.add('spinning');
  document.getElementById('btn-refresh').disabled=true;
  try {
    const r=await fetch('/api/refresh',{method:'POST'});
    const d=await r.json();
    toast(d.message);
    setTimeout(async()=>{
      await loadDashboard();
      document.getElementById('refresh-icon')?.classList.remove('spinning');
      document.getElementById('btn-refresh').disabled=false;
    },5000);
  } catch(e) {
    document.getElementById('refresh-icon')?.classList.remove('spinning');
    document.getElementById('btn-refresh').disabled=false;
    toast('Erreur de connexion');
  }
}

async function pollStatus() {
  try {
    const d=await api('/api/status');
    updateLastRefresh(d.last_refresh);
    // Afficher progression chargement historique
    const progEl=document.getElementById('history-status');
    if(progEl) {
      if(d.history_loading) {
        progEl.textContent='⏳ Chargement historique en cours...';
        progEl.classList.remove('hidden');
      } else if(d.history_loaded) {
        progEl.textContent='✓ Historique 10 ans chargé';
        progEl.classList.remove('hidden');
        setTimeout(()=>progEl.classList.add('hidden'), 5000);
      } else {
        progEl.textContent='';
        progEl.classList.add('hidden');
      }
    }
  } catch(e){}
}

function updateLastRefresh(ts) {
  const el=document.getElementById('last-update');
  if(!el) return;
  if(!ts){el.textContent='—';return;}
  const d=new Date(ts);
  el.textContent=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MON PORTEFEUILLE ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Drag & Drop ──────────────────────────────────────────────────────────────
function ptfDragOver(e) {
  e.preventDefault();
  document.getElementById('ptf-drop-zone').classList.add('border-indigo-400','bg-indigo-950/20');
}
function ptfDragLeave(e) {
  document.getElementById('ptf-drop-zone').classList.remove('border-indigo-400','bg-indigo-950/20');
}
function ptfDrop(e) {
  e.preventDefault();
  ptfDragLeave(e);
  const file = e.dataTransfer.files[0];
  if(file) {
    uploadPortfolioFile(file);
  } else {
    toast('Aucun fichier détecté', 3000);
  }
}
function ptfFileSelected(e) {
  const file = e.target.files[0];
  if(file) uploadPortfolioFile(file);
}

// ─── Upload & Analyse — universel (PDF / CSV / Excel) ─────────────────────────
async function uploadPortfolioFile(file) {
  const statusEl = document.getElementById('ptf-upload-status');
  const spinEl   = document.getElementById('ptf-spinner');
  const txtEl    = document.getElementById('ptf-status-text');
  const resultsEl= document.getElementById('ptf-results');

  statusEl.classList.remove('hidden');
  resultsEl.classList.add('hidden');

  // Détecter le format pour le message d'état
  const ext = file.name.toLowerCase().split('.').pop();
  const fmtLabel = ext==='pdf'?'PDF':ext==='csv'||ext==='tsv'?'CSV':ext.startsWith('xls')||ext==='ods'?'Excel':'fichier';
  txtEl.textContent = `Analyse du ${fmtLabel} "${file.name}" en cours…`;
  txtEl.className   = 'text-sm text-slate-300';
  spinEl.classList.remove('hidden');

  try {
    const form = new FormData();
    form.append('file', file);
    const r = await fetch('/api/portfolio/analyze', { method: 'POST', body: form });
    const d = await r.json();

    spinEl.classList.add('hidden');

    if (!r.ok || d.success === false) {
      const errMsg  = d.error || `Erreur lors de l'analyse du ${fmtLabel}`;
      const tips    = d.tips  || '';
      const preview = d.raw_preview ? d.raw_preview.slice(0,300) : '';
      const parseErr= (d.parsing_errors||[]).join(' · ');

      txtEl.innerHTML =
        `<span class="text-red-400 font-medium">⚠️ ${errMsg}</span>` +
        (tips    ? `<br><span class="text-slate-400 text-xs mt-1 block">${tips}</span>` : '') +
        (parseErr? `<br><span class="text-slate-500 text-xs mt-1 block">Détail : ${parseErr}</span>` : '') +
        (preview ? `<br><details class="mt-2"><summary class="text-xs text-slate-500 cursor-pointer">Aperçu texte brut</summary>`+
                   `<pre class="text-xs text-slate-500 whitespace-pre-wrap mt-1">${preview}</pre></details>` : '');
      txtEl.className = 'text-sm';
      return;
    }

    statusEl.classList.add('hidden');
    if (d.parsing_errors?.length) {
      toast(`⚠️ Import partiel — ${d.parsing_errors.length} avertissement(s)`, 4000);
    }

    // Stocker le résultat pour le téléchargement
    STATE.ptfLastResult   = d;
    STATE.ptfLastFilename = file.name;

    renderPortfolioResults(d, file.name);

  } catch(e) {
    spinEl.classList.add('hidden');
    txtEl.textContent = 'Erreur réseau : ' + e.message;
    txtEl.className = 'text-sm text-red-400';
  }
}

// ─── Saisie Manuelle ──────────────────────────────────────────────────────────
function toggleManualEntry() {
  const z = document.getElementById('manual-entry-zone');
  z.classList.toggle('hidden');
  if(!z.classList.contains('hidden') && !document.querySelector('.manual-row')) {
    addManualRow();
  }
}

function addManualRow() {
  const list = document.getElementById('manual-holdings-list');
  const idx  = list.children.length;
  const opts = STATE.stocks.map(s=>`<option value="${s.symbol}">${s.symbol} — ${s.name||''}</option>`).join('');
  const div  = document.createElement('div');
  div.className = 'manual-row flex gap-2 items-center';
  div.innerHTML = `
    <select class="manual-sym flex-1 bg-slate-800 border border-border rounded px-2 py-1.5 text-xs text-slate-200">
      <option value="">— Titre —</option>${opts}
    </select>
    <input type="number" placeholder="Qté" min="1" class="manual-qty w-20 bg-slate-800 border border-border rounded px-2 py-1.5 text-xs text-slate-200">
    <input type="number" placeholder="Px achat" min="0" class="manual-price w-28 bg-slate-800 border border-border rounded px-2 py-1.5 text-xs text-slate-200">
    <button onclick="this.parentElement.remove()" class="text-slate-500 hover:text-red-400 text-lg leading-none">×</button>
  `;
  list.appendChild(div);
}

async function analyzeManual() {
  const rows = document.querySelectorAll('.manual-row');
  const holdings = [];
  rows.forEach(row => {
    const sym   = row.querySelector('.manual-sym')?.value;
    const qty   = parseFloat(row.querySelector('.manual-qty')?.value);
    const price = parseFloat(row.querySelector('.manual-price')?.value);
    if(sym) holdings.push({ symbol: sym, quantity: qty||null, buy_price: price||null });
  });
  if(!holdings.length){ toast('Ajoutez au moins un titre'); return; }

  const statusEl = document.getElementById('ptf-upload-status');
  const spinEl   = document.getElementById('ptf-spinner');
  const txtEl    = document.getElementById('ptf-status-text');
  statusEl.classList.remove('hidden');
  txtEl.textContent = 'Analyse en cours...';
  txtEl.className   = 'text-sm text-slate-300';
  spinEl.classList.remove('hidden');

  try {
    const r = await fetch('/api/portfolio/analyze-manual', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({holdings})
    });
    const d = await r.json();
    statusEl.classList.add('hidden');
    STATE.ptfLastResult   = d;
    STATE.ptfLastFilename = 'portefeuille_manuel';
    renderPortfolioResults(d, 'Portefeuille Manuel');
  } catch(e) {
    txtEl.textContent='Erreur : '+e.message;
    txtEl.className='text-sm text-red-400';
    spinEl.classList.add('hidden');
  }
}

// ─── Téléchargement rapport portefeuille ─────────────────────────────────────
function downloadPortfolioReport() {
  const d = STATE.ptfLastResult;
  if(!d) { toast('Aucun résultat à télécharger — importez un portefeuille d\'abord'); return; }

  const s        = d.summary || {};
  const holdings = d.holdings || [];
  const now      = new Date().toLocaleString('fr-FR');
  const fname    = STATE.ptfLastFilename || 'portefeuille';
  const slug     = fname.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g,'_');

  let lines = [];
  lines.push('═'.repeat(60));
  lines.push('  BRVM ANALYTICS — RAPPORT DE PORTEFEUILLE');
  lines.push('  L\'Étoile du Taureau d\'Or ✦ Bourse Régionale');
  lines.push('═'.repeat(60));
  lines.push(`  Généré le : ${now}`);
  lines.push(`  Source    : ${fname}`);
  if(d.metadata?.statement_date) lines.push(`  Relevé du : ${d.metadata.statement_date}`);
  lines.push('');

  // ── Résumé ───────────────────────────────────────────────────────────────
  lines.push('─'.repeat(60));
  lines.push('  RÉSUMÉ DU PORTEFEUILLE');
  lines.push('─'.repeat(60));
  lines.push(`  Titres              : ${s.n_stocks||0}`);
  lines.push(`  Secteurs            : ${s.n_sectors||0}`);
  if((s.total_current||0)>0)   lines.push(`  Valeur actuelle     : ${fmtB(s.total_current)}`);
  if((s.total_cost||0)>0)      lines.push(`  Coût d'acquisition  : ${fmtB(s.total_cost)}`);
  if(s.total_pnl!=null)        lines.push(`  Plus-value          : ${(s.total_pnl>=0?'+':'')}${fmtB(s.total_pnl)} (${(s.total_pnl_pct>=0?'+':'')}${fmt(s.total_pnl_pct,2)}%)`);
  if((s.annual_dividend_net||0)>0) {
    lines.push(`  Dividendes nets/an  : ${fmtB(s.annual_dividend_net)}`);
    lines.push(`  Rendement dividende : ${fmt(s.div_yield_portfolio,2)}%`);
  }
  lines.push(`  Signaux : ↑ ACHAT ${s.buy_signals||0}  ↓ VENTE ${s.sell_signals||0}  ◉ NEUTRE ${s.neutral_signals||0}`);
  if(s.diversification?.label) lines.push(`  Diversification     : ${s.diversification.label} (${s.diversification.score||0}/100)`);
  lines.push('');

  // ── Recommandations globales ─────────────────────────────────────────────
  if(d.global_advice?.length) {
    lines.push('─'.repeat(60));
    lines.push('  RECOMMANDATIONS GLOBALES');
    lines.push('─'.repeat(60));
    d.global_advice.forEach(a => lines.push(`  ▸ ${a}`));
    lines.push('');
  }

  // ── Positions ────────────────────────────────────────────────────────────
  lines.push('─'.repeat(60));
  lines.push('  ANALYSE PAR POSITION');
  lines.push('─'.repeat(60));
  holdings.forEach(h => {
    if(!h.found) { lines.push(`  ${h.symbol.padEnd(8)} — Non trouvé en base BRVM`); return; }
    lines.push(`  ${h.symbol.padEnd(8)} ${(h.name||'').substring(0,22).padEnd(23)} ${h.reco_signal||'NEUTRE'}`);
    if(h.current_price) lines.push(`    Prix actuel    : ${fmt(h.current_price,0)} FCFA`);
    if(h.quantity!=null) lines.push(`    Quantité       : ${fmt(h.quantity,0)} titres`);
    if(h.buy_price!=null) lines.push(`    Prix d'achat   : ${fmt(h.buy_price,0)} FCFA`);
    if(h.market_value!=null) lines.push(`    Valeur marché  : ${fmtB(h.market_value)}`);
    if(h.pnl_pct!=null)  lines.push(`    Performance    : ${(h.pnl_pct>=0?'+':'')}${fmt(h.pnl_pct,2)}%`);
    if(h.div_yield_net!=null) lines.push(`    Rdt. dividende : ${fmt(h.div_yield_net,2)}% net${h.div_net_dps!=null?' ('+fmt(h.div_net_dps,0)+' FCFA)':''}`);
    if(h.advice?.summary) lines.push(`    Conseil        : ${h.advice.summary}`);
    lines.push('');
  });

  lines.push('─'.repeat(60));
  lines.push('  Document généré par BRVM Analytics');
  lines.push('  Ce rapport est fourni à titre informatif uniquement.');
  lines.push('  Consultez un conseiller financier avant tout investissement.');
  lines.push('═'.repeat(60));

  const text    = lines.join('\n');
  const blob    = new Blob([text], {type:'text/plain;charset=utf-8'});
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `BRVM_Portefeuille_${slug}_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Rapport téléchargé dans votre dossier Téléchargements ✓');
}

// ─── Rendu des Résultats ──────────────────────────────────────────────────────
function renderPortfolioResults(d, filename) {
  const resultsEl = document.getElementById('ptf-results');
  resultsEl.classList.remove('hidden');
  window.scrollTo({top: resultsEl.offsetTop - 80, behavior:'smooth'});

  const s        = d.summary || {};
  const hasCost  = s.total_cost  > 0;
  const hasPnl   = hasCost && s.total_current > 0;
  const pnlPos   = s.total_pnl >= 0;
  const pnlColor = pnlPos ? 'text-green-400' : 'text-red-400';
  const pnlSign  = pnlPos ? '+' : '';
  const divScore = s.diversification || {};

  // ── Résumé global ──────────────────────────────────────────────────────
  setHTML('ptf-summary-card', `
    <div class="flex items-start justify-between mb-4">
      <div>
        <h3 class="text-base font-semibold text-slate-200">📊 ${filename}</h3>
        <p class="text-xs text-slate-400 mt-0.5">
          ${s.n_stocks||0} titre${(s.n_stocks||0)>1?'s':''}
          · ${s.n_sectors||0} secteur${(s.n_sectors||0)>1?'s':''}
        </p>
        ${d.metadata?.statement_date?`<p class="text-xs text-slate-500">Relevé du ${d.metadata.statement_date}</p>`:''}
      </div>
      <div class="text-right">
        ${hasPnl
          ? `<div class="text-2xl font-black ${pnlColor}">${pnlSign}${fmt(s.total_pnl_pct,2)}%</div>
             <div class="text-xs text-slate-500">Performance globale</div>`
          : `<div class="text-sm text-slate-500">Prix d'achat<br>non renseigné</div>`}
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-lg font-bold text-slate-100">${s.total_current>0 ? fmtB(s.total_current) : '—'}</div>
        <div class="text-xs text-slate-500">Valeur actuelle</div>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-lg font-bold text-slate-100">${hasCost ? fmtB(s.total_cost) : '—'}</div>
        <div class="text-xs text-slate-500">Coût d'achat</div>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-lg font-bold ${hasPnl?pnlColor:'text-slate-500'}">${hasPnl ? pnlSign+fmtB(s.total_pnl) : '—'}</div>
        <div class="text-xs text-slate-500">Plus-value FCFA</div>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-lg font-bold text-emerald-400">${(s.annual_dividend_net||0)>0 ? fmtB(s.annual_dividend_net) : '—'}</div>
        <div class="text-xs text-slate-500">Dividendes nets/an</div>
        ${s.div_yield_portfolio>0 ? `<div class="text-xs text-emerald-400 font-semibold">${fmt(s.div_yield_portfolio,2)}% rend.</div>` : ''}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
      <div class="flex gap-2 text-xs flex-wrap">
        <span class="px-2 py-1 bg-green-900/30 border border-green-700/40 rounded text-green-400 font-semibold">↑ ACHAT : ${s.buy_signals||0}</span>
        <span class="px-2 py-1 bg-red-900/30 border border-red-700/40 rounded text-red-400 font-semibold">↓ VENTE : ${s.sell_signals||0}</span>
        <span class="px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-slate-400 font-semibold">◉ NEUTRE : ${s.neutral_signals||0}</span>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs font-semibold" style="color:${divScore.color||'#94a3b8'}">${divScore.label||'—'}</span>
        <div class="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div class="h-full rounded-full" style="width:${divScore.score||0}%;background:${divScore.color||'#94a3b8'}"></div>
        </div>
        <span class="text-xs text-slate-500">${divScore.score||0}/100</span>
      </div>
    </div>
  `);

  // ── Recommandations globales ─────────────────────────────────────────
  const advEl  = document.getElementById('ptf-global-advice');
  const advList= document.getElementById('ptf-advice-list');
  if(d.global_advice?.length) {
    advList.innerHTML = d.global_advice.map(a =>
      `<li class="text-xs text-slate-300 flex gap-2 leading-relaxed">
         <span class="text-indigo-400 mt-0.5 flex-shrink-0">▸</span><span>${a}</span>
       </li>`
    ).join('');
    advEl.classList.remove('hidden');
  } else {
    advEl.classList.add('hidden');
  }

  // ── Positions ────────────────────────────────────────────────────────
  const holdingsEl = document.getElementById('ptf-holdings-grid');
  holdingsEl.innerHTML = (d.holdings||[]).map(h => renderHoldingCard(h)).join('');

  // ── Répartition sectorielle ─────────────────────────────────────────
  const secEl      = document.getElementById('ptf-sector-alloc');
  const totalMv    = s.total_current || 0;
  const sectors    = d.sector_allocation || {};
  const secEntries = Object.entries(sectors).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const colors     = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#8b5cf6','#10b981','#f97316','#a78bfa'];

  if(secEntries.length === 0) {
    secEl.innerHTML = '<p class="text-xs text-slate-500 italic">Aucune donnée sectorielle disponible</p>';
  } else {
    const totalSec = secEntries.reduce((s,[,v])=>s+v, 0) || 1;
    secEl.innerHTML = secEntries.map(([sec, val], i) => {
      const pct = (val/totalSec*100).toFixed(1);
      return `<div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-slate-300 truncate">${sec}</span>
          <span class="text-slate-400 font-semibold ml-2 flex-shrink-0">${pct}%</span>
        </div>
        <div class="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-1">
          <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${colors[i%colors.length]}"></div>
        </div>
        <div class="text-xs text-slate-600 mb-1">${fmtB(val)}</div>
      </div>`;
    }).join('');
  }

  // ── Dividendes ─────────────────────────────────────────────────────────
  const divEl = document.getElementById('ptf-dividend-summary');
  divEl.innerHTML = `
    <div class="text-xl font-bold text-emerald-400">${fmtB(s.annual_dividend_net)}</div>
    <div class="text-xs text-slate-500">Revenus annuels nets estimés</div>
    ${s.div_yield_portfolio?`<div class="text-sm font-semibold text-emerald-400 mt-1">${fmt(s.div_yield_portfolio,2)}% rendement portefeuille</div>`:''}
    <div class="text-xs text-slate-500 mt-1">${(s.annual_dividend_net||0)>0 ? fmtB(s.annual_dividend_net/12) : '—'} /mois estimé</div>
  `;
}

function renderHoldingCard(h) {
  if(!h.found) {
    return `<div class="bg-slate-800/30 border border-slate-700 rounded-lg p-3 flex items-center gap-3 opacity-60">
      <span class="font-bold text-slate-500">${h.symbol}</span>
      <span class="text-xs text-red-400">Titre non trouvé dans la base BRVM</span>
    </div>`;
  }

  const hasPnl   = h.pnl_pct != null;
  const pnlPos   = hasPnl && h.pnl_pct >= 0;
  const pnlColor = pnlPos ? 'text-green-400' : 'text-red-400';
  const pnlSign  = pnlPos ? '+' : '';
  const sigColor = h.reco_signal==='ACHAT' ? 'text-green-400 bg-green-900/30 border-green-700/40' :
                   h.reco_signal==='VENTE' ? 'text-red-400 bg-red-900/30 border-red-700/40' :
                   'text-slate-400 bg-slate-700/50 border-slate-600';
  const sigIcon  = h.reco_signal==='ACHAT' ? '↑' : h.reco_signal==='VENTE' ? '↓' : '◉';

  const advPrioColor = {
    'buy':         'text-green-400',
    'hold':        'text-blue-400',
    'sell':        'text-red-400',
    'sell_urgent': 'text-red-500 font-bold',
    'watch':       'text-yellow-400',
    'info':        'text-slate-400'
  }[h.advice?.priority||'info'] || 'text-slate-400';

  const trendIcon = h.trend==='Haussière'?'▲':h.trend==='Baissière'?'▼':'▶';
  const trendClr  = h.trend==='Haussière'?'text-green-400':h.trend==='Baissière'?'text-red-400':'text-slate-500';

  return `<div class="bg-card border border-border rounded-lg p-4 hover:border-slate-500 transition-colors">

    <!-- En-tête : symbole + secteur + signal reco -->
    <div class="flex items-start justify-between mb-3">
      <div>
        <div class="flex items-center gap-2 mb-0.5">
          <button onclick="openFund('${h.symbol}')" class="font-bold text-indigo-300 hover:text-indigo-200 text-sm">${h.symbol}</button>
          <span class="text-xs text-slate-500 truncate max-w-[130px]">${(h.name||'').substring(0,20)}</span>
        </div>
        <div class="flex items-center gap-1.5">
          ${h.sector?`<span class="text-xs px-1.5 py-0.5 bg-slate-700/60 rounded text-slate-400">${h.sector}</span>`:''}
          ${h.country?`<span class="text-xs text-slate-600">${h.country}</span>`:''}
          <span class="text-xs ${trendClr}">${trendIcon} ${h.trend||'Neutre'}</span>
        </div>
      </div>
      <span class="text-xs px-2 py-0.5 rounded border font-semibold flex-shrink-0 ${sigColor}">${sigIcon} ${h.reco_signal}</span>
    </div>

    <!-- Grille métriques : Prix / Quantité / Perf -->
    <div class="grid grid-cols-3 gap-2 mb-3">
      <div class="bg-slate-800/40 rounded-lg p-2 text-center">
        <div class="text-sm font-bold text-slate-200">${fmt(h.current_price,0)}</div>
        <div class="text-xs text-slate-500">Prix actuel</div>
      </div>
      <div class="bg-slate-800/40 rounded-lg p-2 text-center">
        <div class="text-sm font-bold text-slate-300">${h.quantity!=null ? fmt(h.quantity,0) : '—'}</div>
        <div class="text-xs text-slate-500">Quantité</div>
      </div>
      <div class="bg-slate-800/40 rounded-lg p-2 text-center">
        <div class="text-sm font-bold ${hasPnl?pnlColor:'text-slate-500'}">${hasPnl ? pnlSign+fmt(h.pnl_pct,2)+'%' : '—'}</div>
        <div class="text-xs text-slate-500">Performance</div>
      </div>
    </div>

    <!-- Ligne achat + valeur marché -->
    <div class="space-y-1 mb-3">
      ${h.buy_price!=null ? `<div class="flex justify-between text-xs text-slate-500">
        <span>Prix d'achat :</span>
        <span class="text-slate-300 font-medium">${fmt(h.buy_price,0)} FCFA</span>
      </div>` : ''}
      ${h.buy_value!=null ? `<div class="flex justify-between text-xs text-slate-500">
        <span>Coût total :</span>
        <span class="text-slate-300 font-medium">${fmtB(h.buy_value)}</span>
      </div>` : ''}
      ${h.market_value!=null ? `<div class="flex justify-between text-xs text-slate-500">
        <span>Valeur marché :</span>
        <span class="text-slate-200 font-semibold">${fmtB(h.market_value)}</span>
      </div>` : ''}
      ${h.pnl!=null ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">Plus-value :</span>
        <span class="${pnlColor} font-semibold">${pnlSign}${fmtB(h.pnl)}</span>
      </div>` : ''}
      ${h.div_yield_net!=null ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">Rend. dividende net :</span>
        <span class="text-emerald-400 font-semibold">${fmt(h.div_yield_net,2)}%${h.div_net_dps!=null?` · ${fmt(h.div_net_dps,0)} FCFA`:''}</span>
      </div>` : ''}
    </div>

    <!-- RSI -->
    ${h.rsi!=null ? `<div class="flex items-center gap-2 mb-2">
      <span class="text-xs text-slate-500 w-6">RSI</span>
      <div class="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div class="h-full rounded-full ${h.rsi>=70?'bg-red-500':h.rsi<=30?'bg-green-500':'bg-blue-400'}"
             style="width:${Math.min(h.rsi,100)}%"></div>
      </div>
      <span class="text-xs w-8 text-right ${h.rsi>=70?'text-red-400':h.rsi<=30?'text-green-400':'text-slate-400'}">${fmt(h.rsi,1)}</span>
    </div>` : ''}

    <!-- Conseil positionnel -->
    <div class="pt-2 border-t border-border/60">
      <p class="text-xs font-medium ${advPrioColor}">▸ ${h.advice?.summary||'Surveiller la position'}</p>
      ${(h.advice?.actions||[]).slice(1).map(a=>`<p class="text-xs text-slate-500 mt-0.5 pl-3">• ${a}</p>`).join('')}
    </div>

  </div>`;
}

// ─── Mise à jour dividendes depuis BOC ────────────────────────────────────────
async function updateDividendsFromBOC(updates) {
  try {
    const r = await fetch('/api/admin/update-dividends', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({updates})
    });
    const d = await r.json();
    if(d.success) {
      toast(`${d.count} dividende(s) mis à jour depuis le BOC ✓`);
    } else {
      toast('Erreur mise à jour dividendes');
    }
    return d;
  } catch(e) {
    toast('Erreur : '+e.message);
  }
}

// ─── Scan multi-sources dividendes (BOC annuel + AGM) ────────────────────────

async function refreshAllDividendSources() {
  const statusEl = document.getElementById('div-refresh-status');
  if(statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = '<span class="animate-pulse">⏳ Scan en cours… (BOC + Assemblées Générales — peut prendre 30-60s)</span>';
  }
  try {
    const r = await fetch('/api/admin/refresh-dividends-all-sources', {method:'POST'});
    const d = await r.json();
    if(d.success) {
      toast('Scan dividendes lancé ✓ — base mise à jour en arrière-plan');
      if(statusEl) {
        statusEl.innerHTML = `✅ ${d.message}`;
        // Recharger les dividendes après 8s
        setTimeout(() => { renderDividendLeaders(); statusEl.classList.add('hidden'); }, 8000);
      }
    } else {
      toast('Erreur lors du scan dividendes');
      if(statusEl) statusEl.innerHTML = '❌ Erreur lors du scan.';
    }
  } catch(e) {
    toast('Erreur réseau : '+e.message);
    if(statusEl) statusEl.innerHTML = '❌ Erreur réseau : '+e.message;
  }
}

async function previewDividendSources() {
  const statusEl = document.getElementById('div-refresh-status');
  if(statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = '<span class="animate-pulse">⏳ Prévisualisation en cours…</span>';
  }
  try {
    const r = await fetch('/api/admin/dividends-sources-preview');
    const d = await r.json();
    const merged = d.merged || [];
    if(!merged.length) {
      if(statusEl) statusEl.innerHTML = '⚠️ Aucun dividende trouvé dans les sources BOC/AGM pour l\'année '+d.year+'.';
      return;
    }
    const rows = merged.slice(0,15).map(m =>
      `<span class="font-mono text-indigo-300">${m.symbol}</span> `+
      `<span class="text-slate-300">${(m.dnpa||'?')} FCFA</span> `+
      `<span class="text-slate-500">(${m.source||'?'}${m.div_date?' · '+m.div_date:''})</span>`
    ).join('<br>');
    if(statusEl) {
      statusEl.innerHTML =
        `<strong class="text-slate-200">Aperçu ${d.year} — ${merged.length} titre(s)</strong>`+
        ` <span class="text-slate-500">(BOC: ${d.counts.boc} · AGM: ${d.counts.agm})</span><br><br>`+
        rows +
        (merged.length>15?`<br><span class="text-slate-500">…et ${merged.length-15} autre(s)</span>`:'');
    }
  } catch(e) {
    toast('Erreur prévisualisation : '+e.message);
    if(statusEl) statusEl.innerHTML = '❌ Erreur : '+e.message;
  }
}
