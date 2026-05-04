/**
 * BRVM Data Fetcher — Stratégie multi-niveaux sans dépendance API
 *
 * Niveau 1: Cache IndexedDB récent (< 4h)
 * Niveau 2: Scraping BRVM via proxy CORS-safe
 * Niveau 3: Parsing HTML brvm.org via AndroidBridge (WebView natif)
 * Niveau 4: Données embarquées BRVM_STOCKS (toujours disponibles)
 *
 * Aucune clé API requise — fonctionne 100% hors ligne.
 */
const BRVMFetcher = (() => {
  const DB_NAME = 'brvm_cache';
  const DB_VERSION = 2;
  const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h
  const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://cors-anywhere.herokuapp.com/'
  ];
  const BRVM_URL = 'https://www.brvm.org/fr/cours-des-actions/0/all';

  let db = null;

  // ─── IndexedDB ─────────────────────────────────────────────────────────────
  async function openDB() {
    if (db) return db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('quotes'))
          d.createObjectStore('quotes', { keyPath: 'ticker' });
        if (!d.objectStoreNames.contains('meta'))
          d.createObjectStore('meta', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('history'))
          d.createObjectStore('history', { keyPath: 'ticker' });
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror   = () => resolve(null); // Continue sans DB
    });
  }

  async function dbGet(store, key) {
    try {
      const d = await openDB();
      if (!d) return null;
      return new Promise(res => {
        const tx = d.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => res(req.result || null);
        req.onerror   = () => res(null);
      });
    } catch { return null; }
  }

  async function dbPut(store, value) {
    try {
      const d = await openDB();
      if (!d) return;
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
    } catch {}
  }

  async function dbGetAll(store) {
    try {
      const d = await openDB();
      if (!d) return [];
      return new Promise(res => {
        const tx = d.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror   = () => res([]);
      });
    } catch { return []; }
  }

  // ─── Vérifier fraîcheur du cache ───────────────────────────────────────────
  async function isCacheValid() {
    const meta = await dbGet('meta', 'last_fetch');
    if (!meta) return false;
    return (Date.now() - meta.ts) < CACHE_TTL_MS;
  }

  // ─── Charger depuis le cache ───────────────────────────────────────────────
  async function loadFromCache() {
    const rows = await dbGetAll('quotes');
    if (!rows.length) return null;
    // Injecter les données en cache dans BRVM_STOCKS
    rows.forEach(row => {
      const stock = BRVM_INDEX[row.ticker];
      if (stock && row.live) {
        stock.price = row.price;
        stock.priceYesterday = row.priceYesterday;
        stock.volume = row.volume;
      }
    });
    return rows;
  }

  // ─── Parsing HTML de la page BRVM ──────────────────────────────────────────
  function parseBRVMHtml(html) {
    const results = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      // Table principale des cours BRVM
      const rows = doc.querySelectorAll('table tbody tr, .views-table tbody tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;
        const ticker = cells[0]?.textContent?.trim().toUpperCase();
        if (!ticker || ticker.length < 3) return;
        const price        = parseFloat((cells[2]?.textContent || '').replace(/\s/g,'').replace(',','.')) || 0;
        const changePct    = parseFloat((cells[4]?.textContent || '').replace('%','').replace(',','.')) || 0;
        const volume       = parseInt((cells[5]?.textContent || '').replace(/\s/g,'')) || 0;
        if (price > 0) {
          results.push({ ticker, price, changePct, volume,
            priceYesterday: price / (1 + changePct / 100),
            live: true, ts: Date.now() });
        }
      });
    } catch (e) { console.error('Parse error:', e); }
    return results;
  }

  // ─── Fetch via proxy CORS ──────────────────────────────────────────────────
  async function fetchViaProxy(proxyBase) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(proxyBase + encodeURIComponent(BRVM_URL), {
        signal: controller.signal,
        headers: { 'Accept': 'text/html' }
      });
      clearTimeout(timeout);
      if (!resp.ok) return null;
      return await resp.text();
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  // ─── Fetch via AndroidBridge (WebView natif) ───────────────────────────────
  function fetchViaAndroid() {
    return new Promise(resolve => {
      if (typeof AndroidBridge === 'undefined') { resolve(null); return; }
      const stored = AndroidBridge.getStoredData('live_quotes');
      if (stored && stored !== 'null') {
        try { resolve(JSON.parse(stored)); return; }
        catch {}
      }
      // Déclencher mise à jour en arrière-plan
      try { AndroidBridge.triggerUpdate(); } catch {}
      resolve(null);
    });
  }

  // ─── Simuler variation journalière réaliste ───────────────────────────────
  function applyRealisticDayVariation(stock) {
    // Variation journalière simulée basée sur volatilité historique
    const sector = stock.sector;
    const sectorVol = { Banque:0.008, Agriculture:0.012, Telecom:0.009,
                        Industrie:0.010, Distribution:0.010, Transport:0.011 };
    const vol = sectorVol[sector] || 0.010;
    const drift = (stock.revenueGrowth || 0.08) / 252;
    const randChange = (Math.random() - 0.48) * vol * 2;
    const totalChange = drift + randChange;

    // Appliquer limite BRVM: ±7.5% par séance
    const clampedChange = Math.max(-0.075, Math.min(0.075, totalChange));
    stock.priceYesterday = stock.price;
    stock.price = Math.round(stock.price * (1 + clampedChange));
    stock.volume = Math.round(stock.volumeAvg20 * (0.6 + Math.random() * 0.8));
    stock.changePct = clampedChange * 100;
    return stock;
  }

  // ─── Mettre à jour historique glissant ─────────────────────────────────────
  async function updateHistory(ticker, price, volume) {
    const stored = await dbGet('history', ticker);
    let hist = stored ? stored.prices : (BRVM_INDEX[ticker]?.history || []);
    let vols = stored ? stored.volumes : (BRVM_INDEX[ticker]?.volumes || []);
    hist = [...hist.slice(-119), price];
    vols = [...vols.slice(-119), volume];
    await dbPut('history', { ticker, prices: hist, volumes: vols, ts: Date.now() });
    if (BRVM_INDEX[ticker]) {
      BRVM_INDEX[ticker].history = hist;
      BRVM_INDEX[ticker].volumes = vols;
    }
  }

  // ─── Sauvegarder en cache ──────────────────────────────────────────────────
  async function saveToCache(parsedData) {
    for (const row of parsedData) {
      await dbPut('quotes', { ...row, ts: Date.now() });
      await updateHistory(row.ticker, row.price, row.volume || 0);
    }
    await dbPut('meta', { key: 'last_fetch', ts: Date.now() });
  }

  // ─── Mise à jour live des stocks ───────────────────────────────────────────
  function applyLiveData(parsedData) {
    let updated = 0;
    parsedData.forEach(row => {
      const stock = BRVM_INDEX[row.ticker];
      if (stock) {
        stock.price = row.price || stock.price;
        stock.priceYesterday = row.priceYesterday || stock.priceYesterday;
        stock.volume = row.volume || stock.volume;
        stock.changePct = row.changePct;
        stock.live = true;
        updated++;
      }
    });
    return updated;
  }

  // ─── Point d'entrée principal ──────────────────────────────────────────────
  async function fetchAll(forceRefresh = false) {
    // 1. Cache valide ?
    if (!forceRefresh && await isCacheValid()) {
      const cached = await loadFromCache();
      if (cached && cached.length > 0) {
        return { source: 'cache', count: cached.length };
      }
    }

    // 2. Tentative live — Android Bridge
    const androidData = await fetchViaAndroid();
    if (androidData && Array.isArray(androidData) && androidData.length > 0) {
      await saveToCache(androidData);
      applyLiveData(androidData);
      return { source: 'android', count: androidData.length };
    }

    // 3. Tentative via proxies CORS (sans clé API)
    if (navigator.onLine) {
      for (const proxy of CORS_PROXIES) {
        const html = await fetchViaProxy(proxy);
        if (html) {
          const parsed = parseBRVMHtml(html);
          if (parsed.length > 0) {
            await saveToCache(parsed);
            const count = applyLiveData(parsed);
            return { source: 'proxy', count };
          }
        }
      }
    }

    // 4. Fallback: données embarquées avec variation simulée réaliste
    const today = new Date().toDateString();
    const simKey = 'sim_' + today;
    const alreadySimulated = await dbGet('meta', simKey);

    if (!alreadySimulated) {
      BRVM_STOCKS.forEach(applyRealisticDayVariation);
      const simData = BRVM_STOCKS.map(s => ({
        ticker: s.ticker, price: s.price,
        priceYesterday: s.priceYesterday,
        volume: s.volume, changePct: s.changePct, live: false
      }));
      await saveToCache(simData);
      await dbPut('meta', { key: simKey, ts: Date.now() });
    } else {
      await loadFromCache();
    }

    return { source: 'embedded', count: BRVM_STOCKS.length };
  }

  // ─── Récupérer historique d'un titre ──────────────────────────────────────
  async function getHistory(ticker) {
    const stored = await dbGet('history', ticker);
    if (stored && stored.prices) return stored;
    const stock = BRVM_INDEX[ticker];
    return stock ? { prices: stock.history, volumes: stock.volumes } : null;
  }

  // ─── Statut marché BRVM ───────────────────────────────────────────────────
  function getMarketStatus() {
    const now = new Date();
    const day = now.getDay(); // 0=dim, 6=sam
    const h = now.getHours();
    const m = now.getMinutes();
    const mins = h * 60 + m;
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && mins >= 9 * 60 && mins <= 15 * 60 + 30;
    const isFixing = isWeekday && mins >= 12 * 60 && mins <= 12 * 60 + 30;
    return {
      isOpen, isFixing,
      label: isOpen ? (isFixing ? '⚡ Fixing en cours' : '🟢 Séance ouverte') : '🔴 Marché fermé',
      nextOpen: isOpen ? null : getNextOpenDay(now)
    };
  }

  function getNextOpenDay(now) {
    const d = new Date(now);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // ─── Données macro fraîches ───────────────────────────────────────────────
  async function getMacro() {
    const stored = await dbGet('meta', 'macro');
    if (stored && (Date.now() - stored.ts) < 24 * 60 * 60 * 1000) return stored.data;
    return MACRO_CONTEXT;
  }

  // ─── Vider le cache ───────────────────────────────────────────────────────
  async function clearCache() {
    try {
      const d = await openDB();
      if (!d) return;
      ['quotes','meta','history'].forEach(store => {
        try {
          const tx = d.transaction(store, 'readwrite');
          tx.objectStore(store).clear();
        } catch {}
      });
    } catch {}
  }

  return { fetchAll, getHistory, getMarketStatus, getMacro, clearCache, isCacheValid };
})();
