"""
Scraping BRVM — afx.kwayisi.org
- Cours du jour : table principale /brvm/
- Historique 10 ans : API chart /chart/brvm/{symbol} (Referer requis)
- Fondamentaux : page individuelle /brvm/{symbol}.html
- Actualités : lejecos.com + sika.finance
"""
import logging, re, time
from datetime import datetime, date
from typing import List, Dict, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    # Cache-busting : force le serveur à renvoyer des données fraîches
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
}

AFX_BASE  = "https://afx.kwayisi.org"
BRVM_BASE = "https://www.brvm.org"
SESSION   = requests.Session()
SESSION.headers.update(BASE_HEADERS)

# Session ISOLÉE pour brvm.org : évite la pollution de la SESSION globale
# (cookies/état AFX qui causent une réponse tronquée de brvm.org)
_BRVM_SESSION = requests.Session()
_BRVM_SESSION.headers.update({
    "User-Agent": BASE_HEADERS["User-Agent"],
    "Accept-Language": BASE_HEADERS["Accept-Language"],
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
})

# Session ISOLÉE pour sikafinance.com
# Cloudflare exige les headers Sec-Fetch-* + sec-ch-ua pour servir le HTML complet.
# Sans eux → réponse chiffrée/challenge (7 KB) au lieu du HTML réel (32 KB).
_SIKA_SESSION = requests.Session()
_SIKA_SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    # NE PAS inclure Accept-Encoding : requests utilise son propre gzip/deflate
    # Si on demande 'br' (Brotli), Cloudflare le sert mais requests ne peut le décoder
    # → 7 KB de données chiffrées au lieu du HTML de 32 KB
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "DNT": "1",
    # Sec-Fetch headers : signalent une navigation top-level (vrai navigateur)
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    # Client hints Chrome 124
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
})


# ─── Utilitaires ─────────────────────────────────────────────────────────────

def _price(s: Optional[str]) -> Optional[float]:
    """'38,395' → 38395.0 | '402.18' → 402.18 | '-45' → -45.0"""
    if not s:
        return None
    s = s.strip().replace("\xa0","").replace(" ","").replace("%","")
    m = re.match(r"^([+-]?\d[\d,]*\.?\d*)", s)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None

def _pct(s: Optional[str]) -> Optional[float]:
    """'+3.21%' → 3.21 | '-7.44%' → -7.44 | '+3.21' → 3.21"""
    if not s:
        return None
    m = re.search(r"([+-]?\d+\.?\d*)\s*%?", s.strip())
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None

def _today() -> str:
    return date.today().isoformat()

def _get(url: str, referer: str = "", retries: int = 3,
         verify: bool = True, timeout: int = 30) -> Optional[BeautifulSoup]:
    headers = {"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}
    if referer:
        headers["Referer"] = referer
    for i in range(retries):
        try:
            r = SESSION.get(url, headers=headers, timeout=timeout, verify=verify)
            r.raise_for_status()
            return BeautifulSoup(r.content, "lxml")
        except Exception as e:
            logger.warning(f"[{i+1}/{retries}] GET {url}: {e}")
            if i < retries - 1:
                time.sleep(2)
    return None

def _get_text(url: str, referer: str = "", verify: bool = True, timeout: int = 30) -> Optional[str]:
    """Retourne le contenu texte brut (pour JS chart API)."""
    headers = {"Accept": "*/*", "Referer": referer or url}
    try:
        r = SESSION.get(url, headers=headers, timeout=timeout, verify=verify)
        r.raise_for_status()
        return r.text
    except Exception as e:
        logger.warning(f"_get_text {url}: {e}")
        return None

def _get_sika(url: str, referer: str = "", retries: int = 3, timeout: int = 25) -> Optional[BeautifulSoup]:
    """
    GET via _SIKA_SESSION (headers neutres, sans Cache-Control agressif).
    Utilisé exclusivement pour sikafinance.com qui rejette/filtre la SESSION AFX globale.
    """
    extra = {}
    if referer:
        extra["Referer"] = referer
    for i in range(retries):
        try:
            r = _SIKA_SESSION.get(url, headers=extra, timeout=timeout, verify=True)
            r.raise_for_status()
            logger.info(f"_get_sika {url}: HTTP {r.status_code}, {len(r.content)} bytes")
            return BeautifulSoup(r.content, "lxml")
        except Exception as e:
            logger.warning(f"[{i+1}/{retries}] _get_sika {url}: {e}")
            if i < retries - 1:
                time.sleep(2)
    return None


# ─── HISTORIQUE 10 ANS (API chart + Referer) ─────────────────────────────────

def scrape_chart_history(symbol: str) -> List[Dict]:
    """
    GET https://afx.kwayisi.org/chart/brvm/{symbol}
    Header Referer: https://afx.kwayisi.org/brvm/{symbol}.html  ← clé du contournement
    Retourne JS contenant : data:[[d("2016-04-18"),25310],[d("2016-04-19"),25205],...]
    """
    sym_lower = symbol.lower()
    url      = f"{AFX_BASE}/chart/brvm/{sym_lower}"
    referer  = f"{AFX_BASE}/brvm/{sym_lower}.html"
    text     = _get_text(url, referer=referer)

    if not text:
        logger.warning(f"chart history inaccessible pour {symbol}")
        return []

    matches = re.findall(r'd\("(\d{4}-\d{2}-\d{2})"\)\s*,\s*(\d+)', text)
    if not matches:
        logger.warning(f"aucun point historique dans le JS pour {symbol}")
        return []

    raw = [{
        "symbol":          symbol.upper(),
        "date":            d,
        "close":           float(p),
        "open":            None,
        "high":            None,
        "low":             None,
        "volume":          None,
        "market_cap":      None,
        "variation_pct":   None,
        "reference_price": None,
    } for d, p in matches]

    # ── Reconstruction OHLC synthétique (BRVM = marché au fixing, 1 prix/jour) ─
    # open[i] = close[i-1]  →  high = max(open, close), low = min(open, close)
    # Les figures seront des Marubozu par nature, mais les patterns multi-bougies
    # (Avalement, Étoile du Matin, 3 Soldats…) restent valides et informatifs.
    for i in range(len(raw)):
        if i == 0:
            raw[i]["open"] = raw[i]["close"]
            raw[i]["high"] = raw[i]["close"]
            raw[i]["low"]  = raw[i]["close"]
        else:
            prev_c = raw[i - 1]["close"]
            curr_c = raw[i]["close"]
            var    = round((curr_c / prev_c - 1) * 100, 2) if prev_c else None
            raw[i]["open"]          = prev_c
            raw[i]["high"]          = max(prev_c, curr_c)
            raw[i]["low"]           = min(prev_c, curr_c)
            raw[i]["variation_pct"] = var
            raw[i]["reference_price"] = prev_c

    history = raw
    logger.info(f"chart {symbol}: {len(history)} pts "
                f"({history[0]['date']} → {history[-1]['date']})")
    return history


# ─── FONDAMENTAUX + INFOS COMPLÈTES (page individuelle AFX) ──────────────────

def scrape_afx_fundamentals(symbol: str) -> Dict:
    """
    Extrait depuis https://afx.kwayisi.org/brvm/{symbol}.html :
      EPS, P/E, Dividende/action, Rendement dividende, Market Cap, Shares
      Performances 1W, 4W, 3M, 6M, 1Y, YTD
      Secteur, industrie
      Concurrents
    """
    sym_lower = symbol.lower()
    url       = f"{AFX_BASE}/brvm/{sym_lower}.html"
    soup      = _get(url, referer=f"{AFX_BASE}/brvm/")
    if not soup:
        return {}

    result: Dict = {
        "symbol": symbol.upper(),
        "eps": None, "per": None,
        "dividend_per_share": None, "dividend_yield": None,
        "shares_outstanding": None, "market_cap_str": None,
        "open_price": None, "day_low": None, "day_high": None,
        "traded_volume": None, "gross_turnover": None,
        "perf_1w": None, "perf_4w": None, "perf_3m": None,
        "perf_6m": None, "perf_1y": None, "perf_ytd": None,
        "sector": None, "industry": None, "name_full": None,
        "competitors": [],
        "last_updated": _today(),
    }

    # ── Nom complet depuis le titre de la page ────────────────────────────────
    title = soup.find("title")
    if title:
        t = title.get_text(strip=True)
        m = re.match(r"^(.+?)\s*\(BRVM:", t)
        if m:
            result["name_full"] = m.group(1).strip()

    # ── Toutes les tables clé/valeur ──────────────────────────────────────────
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
            if len(cells) < 2:
                continue
            label = cells[0].lower()
            val   = cells[1] if len(cells) > 1 else ""

            if "opening"              in label: result["open_price"]        = _price(val)
            elif "day's low"          in label: result["day_low"]           = _price(val)
            elif "day's high"         in label: result["day_high"]          = _price(val)
            elif "traded volume"      in label: result["traded_volume"]     = _price(val)
            elif "gross turnover"     in label: result["gross_turnover"]    = val
            elif "earnings per share" in label: result["eps"]               = _price(val)
            elif "price/earn"         in label: result["per"]               = _price(val)
            elif "dividend per share" in label: result["dividend_per_share"]= _price(val)
            elif "dividend yield"     in label: result["dividend_yield"]    = _pct(val) or _price(val)
            elif "shares outstanding" in label: result["shares_outstanding"]= val
            elif "market capitaliz"   in label: result["market_cap_str"]   = val

    # ── Performances (div data-perf) ─────────────────────────────────────────
    perf_div = soup.find("div", {"data-perf": True})
    if perf_div:
        all_th = [th.get("title","").lower() for th in perf_div.find_all("th")]
        all_td = [td.get_text(strip=True)    for td in perf_div.find_all("td")]
        mapping = {
            "1-week":       "perf_1w",
            "4-week":       "perf_4w",
            "3-month":      "perf_3m",
            "6-month":      "perf_6m",
            "1-year":       "perf_1y",
            "year-to-date": "perf_ytd",
        }
        for i, th in enumerate(all_th):
            for key, field in mapping.items():
                if key in th and i < len(all_td):
                    result[field] = _pct(all_td[i])

    # ── Factsheet : secteur / industrie ──────────────────────────────────────
    fact_div = soup.find("div", {"data-fact": True})
    if fact_div:
        for dt, dd in zip(fact_div.find_all("dt"), fact_div.find_all("dd")):
            lbl = dt.get_text(strip=True).lower()
            val = dd.get_text(strip=True)
            if lbl == "sector":   result["sector"]   = val
            if lbl == "industry": result["industry"] = val

    # ── Concurrents ──────────────────────────────────────────────────────────
    comp_table = soup.find("table", {"data-comp": True})
    if comp_table:
        for row in comp_table.find_all("tr")[1:]:
            cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
            if len(cells) >= 4:
                result["competitors"].append({
                    "symbol": cells[0], "name": cells[1],
                    "market_cap": cells[2],
                    "close": _price(cells[3]),
                    "ytd": _pct(cells[4]) if len(cells) > 4 else None,
                })

    return result


# ─── COURS DU JOUR ────────────────────────────────────────────────────────────

def scrape_afx_cours() -> List[Dict]:
    """Table 3 AFX : Ticker | Name | Volume | Price | Change(pts)"""
    url  = f"{AFX_BASE}/brvm/"
    soup = _get(url)
    if not soup:
        return []

    tables = soup.find_all("table")
    if len(tables) < 4:
        return []

    # % depuis gainers/losers
    pct_map: Dict[str, float] = {}
    for t in tables[1:3]:
        for row in t.find_all("tr")[1:]:
            cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
            if len(cells) >= 3:
                sym = cells[0].upper().strip()
                pct = _pct(cells[2])
                if sym and pct is not None:
                    pct_map[sym] = pct

    stocks, today = [], _today()
    for row in tables[3].find_all("tr")[1:]:
        cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
        if len(cells) < 4:
            continue
        symbol = cells[0].upper().strip()
        if not re.match(r"^[A-Z]{2,8}$", symbol):
            continue
        vol    = _price(cells[2]) if len(cells) > 2 else None
        price  = _price(cells[3]) if len(cells) > 3 else None
        pts    = _price(cells[4]) if len(cells) > 4 else None
        if not price:
            continue
        var_pct = pct_map.get(symbol)
        if var_pct is None and pts and price:
            ref = price - pts
            if ref:
                var_pct = round(pts / ref * 100, 2)
        stocks.append({
            "symbol": symbol, "name": cells[1] if len(cells) > 1 else "",
            "date": today, "close": price, "open": None,
            "high": None, "low": None, "volume": vol, "market_cap": None,
            "variation_pct": var_pct,
            "reference_price": round(price - pts, 2) if pts is not None else None,
        })

    logger.info(f"afx cours: {len(stocks)} titres")
    return stocks


def scrape_afx_indices() -> Dict:
    """
    Extrait les indices BRVM Composite + BRVM 10 depuis afx.kwayisi.org/brvm/.
    La table 0 contient 2 lignes : BRVM Composite (ligne 1) et BRVM 10 (ligne 2).
    """
    url  = f"{AFX_BASE}/brvm/"
    soup = _get(url)
    result = {
        "date": _today(),
        "brvm_composite": None, "brvm_10": None,
        "advances": 0, "declines": 0, "unchanged": 0,
        "total_volume": None, "total_value": None,
    }
    if not soup:
        return result
    tables = soup.find_all("table")
    if not tables:
        return result

    # ── Indices BRVM (table 0) ────────────────────────────────────────────────
    # Ligne 1 : BRVM Composite / Ligne 2 : BRVM 10
    rows0 = tables[0].find_all("tr")
    for row in rows0[1:]:
        cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
        if not cells:
            continue
        # Détecter le type d'indice depuis le libellé (1ère cellule) ou position
        label_raw = cells[0].lower() if cells else ""
        # Chercher la valeur numérique dans les cellules
        for cell_txt in cells:
            m = re.match(r"^([\d]{2,6}(?:\.\d+)?)", cell_txt.replace(",",""))
            if m:
                val = float(m.group(1))
                if "10" in label_raw or "brvm-10" in label_raw or "brvm 10" in label_raw:
                    result["brvm_10"] = val
                elif result["brvm_composite"] is None:
                    result["brvm_composite"] = val
                elif result["brvm_10"] is None and val != result["brvm_composite"]:
                    result["brvm_10"] = val
                break

    # ── Advances / declines (tables 1-2 : gainers/losers) ────────────────────
    for idx, key in enumerate(["advances","declines"]):
        if len(tables) > idx+1:
            h = tables[idx+1].find("tr")
            if h:
                m2 = re.search(r"\((\d+)\)", h.get_text())
                if m2:
                    result[key] = int(m2.group(1))

    # ── Volume total (table des cours, col 2) ─────────────────────────────────
    if len(tables) >= 4:
        total = sum(
            (_price([c.get_text(strip=True) for c in r.find_all("td")][2]) or 0)
            for r in tables[3].find_all("tr")[1:]
            if len(r.find_all("td")) >= 3
        )
        result["total_volume"] = total or None

    logger.info(f"afx indices: Composite={result['brvm_composite']}, BRVM10={result['brvm_10']}")
    return result


# ─── ACTUALITÉS ───────────────────────────────────────────────────────────────

def _news_from_soup(soup: BeautifulSoup, source: str, base_url: str,
                    max_items: int = 12, min_len: int = 18, max_len: int = 300,
                    keywords: Optional[List[str]] = None) -> List[Dict]:
    """
    Extrait les liens d'actualités depuis un objet BeautifulSoup.
    Essaie d'abord les éléments structurés (article / .news / .actu / .post),
    puis replie sur tous les <a> si rien de structuré n'est trouvé.
    """
    today = _today()
    seen: set = set()
    result: List[Dict] = []

    # 1. Chercher dans les conteneurs sémantiques courants
    containers: List = []
    for cls in ["news", "actu", "article", "post", "item", "breve", "story", "actualite"]:
        containers += soup.find_all(["article", "div", "li", "section"],
                                    class_=lambda c, k=cls: c and k in " ".join(c if isinstance(c, list) else [c]))
    anchors = []
    for cont in containers:
        anchors += cont.find_all("a", href=True)
    if not anchors:
        anchors = soup.find_all("a", href=True)

    for a in anchors:
        title = a.get_text(" ", strip=True)
        # Nettoyage : supprimer les espaces multiples et les tabs
        title = " ".join(title.split())
        href  = a.get("href", "").strip()
        if not (min_len <= len(title) <= max_len):
            continue
        if title in seen:
            continue
        # Filtre par mots-clés si demandé
        if keywords and not any(k in title.lower() for k in keywords):
            continue
        seen.add(title)
        # Normaliser l'URL
        if not href.startswith("http"):
            if href.startswith("//"):
                href = "https:" + href
            elif href.startswith("/"):
                href = base_url.rstrip("/") + href
            else:
                href = base_url.rstrip("/") + "/" + href
        # Exclure les ancres, liens JS et fragments inutiles
        if href in ("#", "javascript:void(0)", "") or "javascript:" in href:
            continue
        result.append({"title": title, "url": href, "source": source, "published": today})
        if len(result) >= max_items:
            break
    return result


def _norm_url(href: str, base: str) -> str:
    """Normalise un href relatif en URL absolue."""
    if not href or href.startswith(("javascript:", "#", "mailto:")):
        return ""
    if href.startswith("http"):
        return href
    if href.startswith("//"):
        return "https:" + href
    return base.rstrip("/") + ("" if href.startswith("/") else "/") + href


def _scrape_sikafinance_news() -> List[Dict]:
    """
    Actualités BRVM depuis sikafinance.com — deux pages :
      • /marches/actualites_bourse_brvm  (articles éditoriaux)
      • /marches/communiques_brvm        (communiqués officiels : dividendes, AGO)

    Structure HTML confirmée :
      <li class="news-item">
        <a href="/marches/slug">Titre de l'article</a>    ← on prend UNIQUEMENT ce <a>
        <div class="news-chapeau">Résumé …</div>          ← ignoré (texte trop long)
      </li>
    """
    base    = "https://www.sikafinance.com"
    source  = "sikafinance.com"
    today   = _today()
    result  : List[Dict] = []
    seen    : set = set()

    pages = [
        f"{base}/marches/actualites_bourse_brvm",
        f"{base}/marches/communiques_brvm",
    ]

    for url in pages:
        soup = _get_sika(url, referer=f"{base}/marches/dividendes")
        if not soup:
            logger.warning(f"sikafinance: impossible de joindre {url}")
            continue

        lis = soup.find_all("li", class_="news-item")
        logger.info(f"sikafinance {url}: {len(lis)} li.news-item trouvés")

        for li in lis:
            # Structure : <li class="news-item">
            #   <a class="news-thumb" href="..."><img/></a>   ← vignette (pas de texte)
            #   <div class="news-content">
            #     <a class="news-title" href="...">TITRE</a>  ← titre réel
            #     <time datetime="2026-04-20T10:47:00">...    ← date de publication
            #   </div>
            # </li>

            # Priorité 1 : a.news-title (contenu texte)
            a = li.find("a", class_="news-title", href=True)
            # Priorité 2 : aria-label sur l'<a> vignette
            if not a:
                a_thumb = li.find("a", attrs={"aria-label": True}, href=True)
                if a_thumb:
                    title = " ".join(a_thumb.get("aria-label", "").split())
                    href  = _norm_url(a_thumb["href"], base)
                else:
                    continue
            else:
                title = " ".join(a.get_text(" ", strip=True).split())
                href  = _norm_url(a["href"], base)

            if not href or not (15 <= len(title) <= 300):
                continue
            if title in seen:
                continue

            # Date de publication depuis <time datetime="...">
            time_tag = li.find("time", attrs={"datetime": True})
            pub_date = today
            if time_tag:
                dt_raw = time_tag.get("datetime", "")[:10]   # "2026-04-20"
                if re.match(r"\d{4}-\d{2}-\d{2}", dt_raw):
                    pub_date = dt_raw

            seen.add(title)
            result.append({"title": title, "url": href, "source": source, "published": pub_date})
            if len(result) >= 20:
                break

        # Fallback : div.news-content si li.news-item absent
        if not lis:
            for div in soup.find_all("div", class_="news-content"):
                a = div.find("a", class_="news-title", href=True) or div.find("a", href=True)
                if not a:
                    continue
                title = " ".join(a.get_text(" ", strip=True).split())
                href  = _norm_url(a["href"], base)
                if not href or not (15 <= len(title) <= 300):
                    continue
                if title in seen:
                    continue
                seen.add(title)
                result.append({"title": title, "url": href, "source": source, "published": today})

        if len(result) >= 20:
            break

    logger.info(f"sikafinance news: {len(result)} articles")
    return result[:20]


def _scrape_richbourse_news() -> List[Dict]:
    """
    Actualités BRVM depuis richbourse.com — deux pages :
      • /common/news/index       → articles éditoriaux (div.panel > a[href*=apprendre/article])
      • /common/actualite/index  → publications officielles BOC/AGO/dividendes
                                   (div.panel > a[href*=actualite/details])

    Structure HTML confirmée : les titres d'articles sont des <a> directs
    dans des <div class="panel ..."> (class contient "panel").
    """
    base   = "https://www.richbourse.com"
    source = "richbourse.com"
    today  = _today()
    result : List[Dict] = []
    seen   : set = set()

    pages = [
        # Articles éditoriaux (analyse, résultats, dividendes commentés)
        (f"{base}/common/news/index",      "/common/apprendre/article/"),
        # Publications officielles (avis AGO, paiement dividendes, rapports financiers)
        (f"{base}/common/actualite/index", "/common/actualite/details/"),
    ]

    for url, href_marker in pages:
        soup = _get(url, referer=f"{base}/", timeout=20)
        if not soup:
            logger.warning(f"richbourse: impossible de joindre {url}")
            continue

        # Récupérer tous les <a> dont le href contient le marqueur attendu
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href_marker not in href:
                continue
            title = " ".join(a.get_text(" ", strip=True).split())
            if not (20 <= len(title) <= 200):
                continue
            full_url = _norm_url(href, base)
            if not full_url or title in seen:
                continue
            seen.add(title)
            result.append({"title": title, "url": full_url, "source": source, "published": today})

    # Dédupliquer (les panels sont parfois répétés deux fois dans la page)
    deduped : List[Dict] = []
    dedup_seen : set = set()
    for item in result:
        if item["title"] not in dedup_seen:
            dedup_seen.add(item["title"])
            deduped.append(item)

    logger.info(f"richbourse news: {len(deduped)} articles")
    return deduped[:20]


def scrape_news() -> List[Dict]:
    """
    Agrège les actualités BRVM/UEMOA depuis 4 sources :
      1. sikafinance.com/marches/actualites_bourse_brvm  (source principale — dividendes, AGO)
      2. richbourse.com/common/news/index                (actualités UEMOA)
      3. lejecos.com                                     (économie régionale)
      4. sika.finance                                    (marché BRVM)
    Les actualités dividendes/exercice 2025 sont extraites en priorité.
    """
    today = _today()
    all_news: List[Dict] = []
    seen_titles: set = set()

    # ── Source 1 : sikafinance (priorité — données dividendes 2025) ────────────
    sika_items = _scrape_sikafinance_news()
    for item in sika_items:
        if item["title"] not in seen_titles:
            seen_titles.add(item["title"])
            all_news.append(item)

    # ── Source 2 : richbourse (actualités UEMOA) ───────────────────────────────
    rich_items = _scrape_richbourse_news()
    for item in rich_items:
        if item["title"] not in seen_titles:
            seen_titles.add(item["title"])
            all_news.append(item)

    # ── Sources 3 & 4 : lejecos + sika.finance (avec filtre mots-clés) ─────────
    fallback_sources = [
        ("https://www.lejecos.com/",               "lejecos.com"),
        ("https://www.sika.finance/fr/marche/brvm", "sika.finance"),
    ]
    kw = ["brvm","bourse","action","marché","titre","cotation","cours","invest","uemoa",
          "dividende","ago","résultat","bnpa","bpa","exercice"]
    for url, source in fallback_sources:
        soup = _get(url)
        if not soup:
            continue
        items = _news_from_soup(soup, source, "/".join(url.split("/")[:3]),
                                max_items=8, keywords=kw)
        for item in items:
            if item["title"] not in seen_titles:
                seen_titles.add(item["title"])
                all_news.append(item)
        if len(all_news) >= 30:
            break

    logger.info(f"news total : {len(all_news)} articles ({len(sika_items)} sika + {len(rich_items)} richbourse)")
    return all_news[:30]


# ─── BRVM.ORG — SOURCE OFFICIELLE (session isolée, SSL bypass) ───────────────
#
# Structure table principale (Table[3]) sur brvm.org/fr/cours-actions/0 :
#   Col 0 : Symbole
#   Col 1 : Nom
#   Col 2 : Volume
#   Col 3 : Cours veille / référence (FCFA)   ← prix d'HIER
#   Col 4 : Cours Ouverture (FCFA)
#   Col 5 : Cours Clôture   (FCFA)            ← prix d'AUJOURD'HUI ✓
#   Col 6 : Variation (%)

def scrape_brvm_org() -> List[Dict]:
    """
    Scrape la source officielle BRVM (brvm.org) avec une session HTTP isolée.
    Retourne les cours de clôture du jour (Cours Clôture = cells[5]).
    Utilise _BRVM_SESSION pour éviter la pollution par les cookies AFX.
    """
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    url  = f"{BRVM_BASE}/fr/cours-actions/0"
    hdrs = {
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Referer": "https://www.brvm.org/fr/",
    }

    soup = None
    for attempt in range(3):
        try:
            r = _BRVM_SESSION.get(url, headers=hdrs, timeout=20, verify=False)
            r.raise_for_status()
            if len(r.content) < 5000:
                # Réponse tronquée — réessayer avec une session encore plus propre
                raise ValueError(f"Réponse trop courte : {len(r.content)} octets")
            soup = BeautifulSoup(r.content, "lxml")
            break
        except Exception as e:
            logger.warning(f"brvm.org [tentative {attempt+1}/3] : {e}")
            if attempt < 2:
                time.sleep(1.5)

    if not soup:
        return []

    # Localiser la table principale (contient "Cours Clôture" dans l'en-tête)
    target_table = None
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 3:
            continue
        hdr_text = " ".join(c.get_text(strip=True)
                            for c in rows[0].find_all(["th","td"])).lower()
        if "cl" in hdr_text and "ture" in hdr_text:   # "clôture" même sans accents
            target_table = table
            break
        if "symbole" in hdr_text and "variation" in hdr_text:
            target_table = table
            break

    if not target_table:
        logger.warning("brvm.org : table des cours introuvable")
        return []

    stocks, today = [], _today()
    for row in target_table.find_all("tr")[1:]:
        cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
        if len(cells) < 5:
            continue
        symbol = cells[0].upper().strip()
        if not re.match(r"^[A-Z]{2,8}$", symbol):
            continue

        # Cours Clôture = cells[5] ; si absent ou nul → Cours Ouverture = cells[4]
        close = _price(cells[5]) if len(cells) > 5 else None
        if not close:
            close = _price(cells[4]) if len(cells) > 4 else None
        if not close:
            close = _price(cells[3]) if len(cells) > 3 else None   # ultime fallback
        if not close:
            continue

        open_p = _price(cells[4]) if len(cells) > 4 else None
        ref_p  = _price(cells[3]) if len(cells) > 3 else None
        # BRVM fixing : pas de données intraday → OHLC synthétique
        # open = Cours Ouverture officiel (ou cours de référence/veille)
        # high = max(open, close), low = min(open, close)
        synthetic_open = open_p or ref_p
        if synthetic_open and synthetic_open != close:
            high = max(synthetic_open, close)
            low  = min(synthetic_open, close)
        else:
            high = close
            low  = close

        stocks.append({
            "symbol":          symbol,
            "name":            cells[1] if len(cells) > 1 else "",
            "date":            today,
            "close":           close,
            "open":            synthetic_open or close,
            "high":            high,
            "low":             low,
            "volume":          _price(cells[2]) if len(cells) > 2 else None,
            "market_cap":      None,
            "variation_pct":   _pct(cells[6])   if len(cells) > 6 else None,
            "reference_price": ref_p,
        })

    logger.info(f"brvm.org : {len(stocks)} titres (cours de clôture officiels)")
    return stocks


def scrape_brvm_org_indices() -> Dict:
    """
    Indices et statistiques de marché depuis brvm.org (Top5/Flop5/Activité).
    """
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    url  = f"{BRVM_BASE}/fr/cours-actions/0"
    result = {
        "date": _today(), "brvm_composite": None, "brvm_10": None,
        "advances": 0, "declines": 0, "unchanged": 0,
        "total_volume": None, "total_value": None,
    }
    try:
        r = _BRVM_SESSION.get(url, headers={"Accept": "text/html"}, timeout=20, verify=False)
        r.raise_for_status()
        soup = BeautifulSoup(r.content, "lxml")
        tables = soup.find_all("table")

        # ── Indices BRVM depuis brvm.org ───────────────────────────────────────
        # Le site publie BRVM-C (Composite), BRVM-30 et BRVM-PRES dans un tableau
        # BRVM-30 est le successeur du BRVM-10 (Top 30 capitalisations)
        for row in soup.find_all("tr"):
            cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
            if len(cells) >= 2:
                label = cells[0].upper().replace(" ", "").replace("-", "")
                raw_val = cells[1].replace(",", ".").replace("\xa0", "")
                m = re.match(r"^([\d]+(?:\.\d+)?)", raw_val)
                if m:
                    val = float(m.group(1))
                    if "BRVMC" in label or label in ("BRVMC", "BRVM-C", "BRVM_C"):
                        result["brvm_composite"] = val
                    elif "BRVM30" in label or "BRVM-30" in label:
                        # BRVM-30 = successeur du BRVM-10 (top capitalisations)
                        result["brvm_10"] = val

        # Table[2] : Activités du marché → valeur totale
        if len(tables) >= 3:
            for row in tables[2].find_all("tr")[1:]:
                cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
                if len(cells) >= 2 and "valeur" in cells[0].lower():
                    v = re.sub(r"[^\d]", "", cells[1])
                    if v:
                        result["total_value"] = float(v)

        # Advances / declines depuis les tables Top5 / Flop5
        if len(tables) >= 2:
            for t in tables[:2]:
                h = t.find("tr")
                if h:
                    txt = h.get_text()
                    m2 = re.search(r"\((\d+)\)", txt)
                    if m2:
                        n = int(m2.group(1))
                        if "top" in txt.lower() or "hausse" in txt.lower():
                            result["advances"] = n
                        elif "flop" in txt.lower() or "baisse" in txt.lower():
                            result["declines"] = n

        logger.info(f"brvm.org indices: Composite={result['brvm_composite']}, BRVM30={result['brvm_10']}")
    except Exception as e:
        logger.warning(f"brvm.org indices : {e}")

    return result


# ─── POINT D'ENTRÉE ──────────────────────────────────────────────────────────

def fetch_all() -> Dict:
    """
    Stratégie d'acquisition des cours :
      1. BRVM.org (source officielle) — cours de clôture du jour
      2. AFX.kwayisi.org              — fallback si brvm.org indisponible

    Pour les indices (BRVM Composite, advances/declines) :
      1. AFX.kwayisi.org              — données plus riches
      2. brvm.org                     — fallback
    """
    # ── Cours des actions ────────────────────────────────────────────────────
    stocks = scrape_brvm_org()          # Source officielle en priorité
    if not stocks:
        logger.info("brvm.org indisponible — utilisation AFX en fallback")
        stocks = scrape_afx_cours()

    # ── Indices de marché ────────────────────────────────────────────────────
    market = scrape_afx_indices()       # AFX = Composite BRVM-CI
    # brvm.org fournit BRVM-C + BRVM-30 (successeur BRVM-10) + advances/declines
    brvm_idx = scrape_brvm_org_indices()
    if brvm_idx:
        # Prendre BRVM Composite depuis AFX si dispo, sinon brvm.org
        if not market.get("brvm_composite") and brvm_idx.get("brvm_composite"):
            market["brvm_composite"] = brvm_idx["brvm_composite"]
        # BRVM-30 vient toujours de brvm.org (AFX ne le publie pas)
        if brvm_idx.get("brvm_10"):
            market["brvm_10"] = brvm_idx["brvm_10"]
        # Advances/declines : fusionner les meilleures valeurs
        for key in ("advances", "declines", "unchanged", "total_value"):
            if not market.get(key) and brvm_idx.get(key):
                market[key] = brvm_idx[key]

    news = scrape_news()
    return {"stocks": stocks, "market": market, "news": news, "errors": []}

def fetch_history_for_symbol(symbol: str) -> List[Dict]:
    """10 ans d'historique via API chart avec Referer."""
    return scrape_chart_history(symbol)

def fetch_fundamentals_for_symbol(symbol: str) -> Dict:
    """Fondamentaux complets depuis page individuelle AFX."""
    return scrape_afx_fundamentals(symbol)


# ─── BOC — Bulletin Officiel de la Cote ──────────────────────────────────────

def scrape_boc_dividends() -> List[Dict]:
    """
    Extrait les dividendes nets officiels depuis le BOC BRVM le plus récent.
    URL: https://www.brvm.org/fr/bulletins-officiels-de-la-cote
    Retourne une liste de dicts: {symbol, name, dnpa, net_yield, div_date}

    DNPA = Dividende Net Par Action (valeur "net" selon BRVM,
    c'est-à-dire net d'impôt corporate, mais avant retenue IRVM investisseur).
    """
    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        # ── 1. Trouver le BOC le plus récent ─────────────────────────────────
        index_url = "https://www.brvm.org/fr/bulletins-officiels-de-la-cote"
        r = _BRVM_SESSION.get(index_url, timeout=20, verify=False)
        r.raise_for_status()
        soup = BeautifulSoup(r.content, "lxml")
        boc_urls = [a["href"] for a in soup.find_all("a", href=True)
                    if "/boc_" in a["href"] and ".pdf" in a["href"]]
        if not boc_urls:
            logger.warning("BOC: aucun PDF trouvé sur la page index")
            return []

        latest_boc_url = boc_urls[0]
        logger.info(f"BOC: téléchargement {latest_boc_url}")

        # ── 2. Télécharger et parser le PDF ───────────────────────────────────
        import io
        try:
            import pdfplumber
        except ImportError:
            logger.warning("BOC: pdfplumber non installé")
            return []

        r2 = _BRVM_SESSION.get(latest_boc_url, timeout=60, verify=False)
        r2.raise_for_status()

        dividends: List[Dict] = []

        with pdfplumber.open(io.BytesIO(r2.content)) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                lines = txt.split("\n")
                for line in lines:
                    # Chercher une date de paiement dans la ligne (ancre)
                    date_m = re.search(r"(\d{1,2}-\w{3,4}-\d{2,4})", line)
                    if not date_m:
                        continue
                    div_date = date_m.group(1)

                    # Premier token doit être un symbole BRVM (3-6 majuscules)
                    parts = line.strip().split()
                    if not parts:
                        continue
                    sym = parts[0].upper()
                    if not re.match(r"^[A-Z]{3,7}$", sym):
                        continue

                    # Trouver le montant du DNPA (avant la date)
                    pre_date = line[:date_m.start()]
                    nums = re.findall(r"[\d\xa0\s]+(?:[,\.]\d+)?", pre_date)
                    candidate_amounts = []
                    for n in nums:
                        v = n.replace("\xa0", "").replace(" ", "").replace(",", ".")
                        try:
                            fv = float(v)
                            if 20 <= fv <= 50000:
                                candidate_amounts.append(fv)
                        except ValueError:
                            pass

                    dnpa = candidate_amounts[-1] if candidate_amounts else None
                    if dnpa is None:
                        continue

                    # Trouver le rendement net (après la date)
                    post_date = line[date_m.end():]
                    yield_m = re.search(r"(\d{1,2}[,\.]\d{1,2})\s*%", post_date)
                    net_yield = float(yield_m.group(1).replace(",", ".")) if yield_m else None

                    # Nom (tokens entre symbole et premier nombre)
                    name_parts = []
                    for p in parts[1:]:
                        p_clean = p.replace(",", "").replace(".", "")
                        if p_clean.isdigit():
                            break
                        name_parts.append(p)
                    name = " ".join(name_parts)[:40]

                    dividends.append({
                        "symbol":    sym,
                        "name":      name,
                        "dnpa":      dnpa,          # DNPA = avant IRVM investisseur
                        "net_yield": net_yield,     # Rdt Net BOC (= DNPA / Cours)
                        "div_date":  div_date,
                        "boc_url":   latest_boc_url,
                    })

        # Déduplication (garder la première occurrence par symbole)
        seen: set = set()
        unique = []
        for d in dividends:
            if d["symbol"] not in seen:
                seen.add(d["symbol"])
                unique.append(d)

        logger.info(f"BOC: {len(unique)} titres avec DNPA extraits")
        return unique

    except Exception as e:
        logger.error(f"BOC scraping error: {e}", exc_info=True)
        return []


def fetch_boc_dividends() -> List[Dict]:
    """Point d'entrée public pour l'extraction BOC (dernier BOC uniquement)."""
    return scrape_boc_dividends()


# ─── BOC Annuel — Scan de tous les BOC de l'année courante ───────────────────

def scrape_boc_year_dividends(year: Optional[int] = None) -> List[Dict]:
    """
    Scanne TOUS les BOC BRVM de l'année `year` (défaut = année courante)
    et extrait les avis de paiement de dividendes.

    Sources consultées :
      1. https://bfin.brvm.org/boc/  (liste des BOC journaliers)
      2. https://www.brvm.org/fr/bulletins-officiels-de-la-cote

    Retourne une liste dédupliquée de :
        {symbol, name, dnpa, net_yield, div_date, exercice, boc_url}
    """
    from datetime import date as _date
    import io

    if year is None:
        year = _date.today().year

    try:
        import pdfplumber
    except ImportError:
        logger.warning("BOC annual scan: pdfplumber non installé")
        return []

    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    except ImportError:
        pass

    all_dividends: List[Dict] = []
    boc_urls_checked: set = set()

    # ── Source 1 : bfin.brvm.org/boc/ ────────────────────────────────────────
    _bfin_boc_urls: List[str] = []
    try:
        index_url = "https://bfin.brvm.org/boc/"
        r = _BRVM_SESSION.get(index_url, timeout=20, verify=False)
        if r.ok:
            soup = BeautifulSoup(r.content, "lxml")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if ".pdf" in href.lower() and str(year) in href:
                    full = href if href.startswith("http") else f"https://bfin.brvm.org{href}"
                    _bfin_boc_urls.append(full)
            logger.info(f"BOC bfin: {len(_bfin_boc_urls)} PDF trouvés pour {year}")
    except Exception as e:
        logger.warning(f"BOC bfin source: {e}")

    # ── Source 2 : brvm.org/fr/bulletins-officiels-de-la-cote ────────────────
    _brvm_boc_urls: List[str] = []
    try:
        index_url2 = "https://www.brvm.org/fr/bulletins-officiels-de-la-cote"
        r2 = _BRVM_SESSION.get(index_url2, timeout=20, verify=False)
        if r2.ok:
            soup2 = BeautifulSoup(r2.content, "lxml")
            for a in soup2.find_all("a", href=True):
                href = a["href"]
                if ".pdf" in href.lower() and ("/boc" in href.lower() or "bulletin" in href.lower()):
                    if str(year) in href or str(year)[-2:] in href:
                        full = href if href.startswith("http") else f"https://www.brvm.org{href}"
                        _brvm_boc_urls.append(full)
            logger.info(f"BOC brvm.org: {len(_brvm_boc_urls)} PDF trouvés pour {year}")
    except Exception as e:
        logger.warning(f"BOC brvm.org source: {e}")

    all_urls = list(dict.fromkeys(_bfin_boc_urls + _brvm_boc_urls))  # dédupliquer, garder ordre
    if not all_urls:
        logger.warning(f"BOC {year}: aucun PDF trouvé, tentative avec le BOC le plus récent")
        return scrape_boc_dividends()   # fallback sur le dernier BOC

    logger.info(f"BOC {year}: analyse de {len(all_urls)} PDF(s)")

    for url in all_urls:
        if url in boc_urls_checked:
            continue
        boc_urls_checked.add(url)
        try:
            r_pdf = _BRVM_SESSION.get(url, timeout=45, verify=False)
            if not r_pdf.ok:
                continue
            page_divs = _extract_dividends_from_boc_pdf(r_pdf.content, url)
            all_dividends.extend(page_divs)
        except Exception as e:
            logger.debug(f"BOC PDF {url}: {e}")

    # ── Déduplication : garder le montant le plus récent par symbole ──────────
    # (En cas de rectificatif, le dernier BOC prévaut)
    seen_sym: Dict[str, Dict] = {}
    for d in all_dividends:
        sym = d["symbol"]
        if sym not in seen_sym:
            seen_sym[sym] = d
        else:
            # Conserver si le montant est différent ou plus récent
            if d.get("dnpa") and d["dnpa"] != seen_sym[sym].get("dnpa"):
                logger.info(f"BOC {year}: {sym} — montant mis à jour "
                            f"{seen_sym[sym].get('dnpa')} → {d['dnpa']}")
                seen_sym[sym] = d

    result = list(seen_sym.values())
    logger.info(f"BOC {year}: {len(result)} dividende(s) unique(s) extraits")
    return result


def _extract_dividends_from_boc_pdf(content: bytes, boc_url: str) -> List[Dict]:
    """
    Extrait les avis de paiement de dividendes d'un PDF BOC BRVM.
    Gère deux formats :
      A) Tableau de cotation avec colonne DNPA
      B) Section narrative "AVIS DE PAIEMENT DE DIVIDENDES" (texte libre)
    """
    import io
    try:
        import pdfplumber
    except ImportError:
        return []

    dividends: List[Dict] = []

    # Patterns pour les avis narratifs BOC
    # Exemples :
    # "BOABF BANK OF AFRICA BF 397 15-avr-2026 3,45%"
    # "La société SGBC met en paiement un dividende net de 1 450 F CFA ..."
    _AVIS_PATTERNS = [
        # Format tableau BOC : SYMBOLE Nom Montant Date Rdt%
        re.compile(
            r'^([A-Z]{3,7})\s+'                        # Symbole
            r'(.+?)\s+'                                # Nom
            r'(\d[\d\s\xa0]*(?:[,\.]\d+)?)\s*(?:F|FCFA|CFA)?\s+'  # Montant
            r'(\d{1,2}[-/]\w{2,4}[-/]\d{2,4})'       # Date
            r'(?:\s+([\d,\.]+)\s*%)?',                # Rdt% optionnel
            re.IGNORECASE
        ),
        # Format narratif : "dividende net de X FCFA"
        re.compile(
            r'([A-Z]{3,7})\b.*?'
            r'(?:dividende|DNPA|d\.n\.p\.a)\s+(?:net\s+)?(?:de\s+)?'
            r'([\d\s\xa0]+(?:[,\.]\d+)?)\s*(?:F|FCFA|CFA)',
            re.IGNORECASE | re.DOTALL
        ),
    ]

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            full_text_pages = []
            for page in pdf.pages:
                txt = page.extract_text() or ""
                full_text_pages.append(txt)

                # ── Format A : ligne structurée ──────────────────────────
                for line in txt.split('\n'):
                    line = line.strip()
                    if not line or len(line) < 8:
                        continue

                    # Ancre principale : date dans la ligne
                    date_m = re.search(
                        r'(\d{1,2}[-/](?:\w{2,9}|[\d]{1,2})[-/]\d{2,4})', line
                    )

                    parts = line.split()
                    if not parts:
                        continue
                    sym_candidate = parts[0].upper()
                    if not re.match(r'^[A-Z]{3,7}$', sym_candidate):
                        continue

                    # Chercher des nombres dans la ligne
                    pre_date_text = line[:date_m.start()] if date_m else line
                    nums = []
                    for raw in re.findall(r'[\d][\d\s\xa0]*(?:[,\.]\d+)?', pre_date_text):
                        v = raw.replace('\xa0', '').replace(' ', '').replace(',', '.')
                        try:
                            fv = float(v)
                            if 20 <= fv <= 100_000:
                                nums.append(fv)
                        except ValueError:
                            pass

                    dnpa = nums[-1] if nums else None
                    if dnpa is None:
                        continue

                    div_date = date_m.group(1) if date_m else None

                    # Rendement (après la date)
                    net_yield = None
                    if date_m:
                        post = line[date_m.end():]
                        ym = re.search(r'([\d]+[,\.][\d]+)\s*%', post)
                        if ym:
                            net_yield = float(ym.group(1).replace(',', '.'))

                    # Exercice (souvent mentionné en amont : "exercice 2025")
                    exercice_m = re.search(r'exercice\s+(\d{4})', line, re.IGNORECASE)
                    exercice = int(exercice_m.group(1)) if exercice_m else None

                    # Nom du titre
                    name_parts = []
                    for p in parts[1:]:
                        pc = p.replace(',', '').replace('.', '')
                        if pc.replace(' ', '').isdigit():
                            break
                        name_parts.append(p)
                    name = ' '.join(name_parts)[:50]

                    dividends.append({
                        "symbol":   sym_candidate,
                        "name":     name,
                        "dnpa":     dnpa,
                        "net_yield": net_yield,
                        "div_date": div_date,
                        "exercice": exercice,
                        "boc_url":  boc_url,
                        "source":   "BOC",
                    })

            # ── Format B : section narrative ─────────────────────────────
            full_text = '\n'.join(full_text_pages)
            # Chercher "AVIS DE PAIEMENT" sections
            avis_blocks = re.findall(
                r'(?:AVIS|avis)\s+(?:DE\s+)?(?:PAIEMENT|paiement)[^\n]*\n((?:(?!\n\n).)*)',
                full_text, re.DOTALL
            )
            for block in avis_blocks:
                # Format "SYMBOLE met en paiement X FCFA le DD-MM-YYYY"
                m = re.search(
                    r'\b([A-Z]{3,7})\b.{0,80}'
                    r'(?:dividende|dnpa).{0,40}'
                    r'([\d][\d\s\xa0]*(?:[,\.]\d+)?)\s*(?:F|FCFA|CFA)',
                    block, re.IGNORECASE
                )
                if m:
                    sym = m.group(1).upper()
                    raw_v = m.group(2).replace('\xa0', '').replace(' ', '').replace(',', '.')
                    try:
                        dnpa = float(raw_v)
                    except ValueError:
                        continue
                    if 20 <= dnpa <= 100_000:
                        date_m2 = re.search(
                            r'(\d{1,2}[-/](?:\w{2,9}|\d{1,2})[-/]\d{2,4})', block
                        )
                        dividends.append({
                            "symbol":   sym,
                            "name":     sym,
                            "dnpa":     dnpa,
                            "net_yield": None,
                            "div_date": date_m2.group(1) if date_m2 else None,
                            "exercice": None,
                            "boc_url":  boc_url,
                            "source":   "BOC-narratif",
                        })

    except Exception as e:
        logger.debug(f"_extract_dividends_from_boc_pdf {boc_url}: {e}")

    return dividends


# ─── Comptes Rendus AGM — Dividendes proposés en Assemblée Générale ──────────

def scrape_agm_dividends(year: Optional[int] = None) -> List[Dict]:
    """
    Extrait les dividendes annoncés dans les Comptes Rendus d'Assemblées
    Générales publiés sur le site de la BRVM.
    URL : https://www.brvm.org/fr/assemblee-generale

    Retourne : [{symbol, name, dnpa_proposed, exercice, agm_date, source}]
    """
    from datetime import date as _date
    if year is None:
        year = _date.today().year

    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    except ImportError:
        pass

    dividends: List[Dict] = []

    # Pages AGM sur brvm.org
    agm_urls = [
        "https://www.brvm.org/fr/assemblee-generale",
        f"https://www.brvm.org/fr/assemblee-generale?year={year}",
    ]

    for agm_index in agm_urls:
        try:
            r = _BRVM_SESSION.get(agm_index, timeout=20, verify=False)
            if not r.ok:
                continue
            soup = BeautifulSoup(r.content, "lxml")

            # Chercher les liens vers des PDF d'AGM de l'exercice courant
            pdf_links = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(strip=True).lower()
                if ".pdf" in href.lower() and any(
                    kw in text or kw in href.lower()
                    for kw in ("assemblee", "agm", "ag ", "ordinaire", "extraordinaire",
                               "dividende", str(year), str(year - 1))
                ):
                    full = href if href.startswith("http") else f"https://www.brvm.org{href}"
                    pdf_links.append((full, a.get_text(strip=True)))

            # Aussi chercher dans les titres des articles
            for item in soup.find_all(['h2', 'h3', 'h4', 'li', 'td']):
                item_text = item.get_text(separator=' ', strip=True)
                # Détecter "SYMBOLE ... dividende ... X FCFA"
                m = re.search(
                    r'\b([A-Z]{3,7})\b.{0,100}'
                    r'(?:dividende|dnpa).{0,60}'
                    r'([\d][\d\s]*(?:[,\.]\d+)?)\s*(?:F|FCFA|CFA)',
                    item_text, re.IGNORECASE
                )
                if m:
                    sym = m.group(1).upper()
                    raw_v = m.group(2).replace(' ', '').replace(',', '.')
                    try:
                        dnpa = float(raw_v)
                    except ValueError:
                        continue
                    if 20 <= dnpa <= 100_000:
                        dividends.append({
                            "symbol":        sym,
                            "name":          sym,
                            "dnpa_proposed": dnpa,
                            "exercice":      year - 1,
                            "agm_date":      None,
                            "source":        "AGM-brvm.org",
                        })

            # Parser les PDF AGM
            for pdf_url, pdf_title in pdf_links[:10]:  # limiter à 10 PDF
                try:
                    r_pdf = _BRVM_SESSION.get(pdf_url, timeout=45, verify=False)
                    if not r_pdf.ok:
                        continue
                    agm_divs = _extract_dividends_from_agm_pdf(r_pdf.content, pdf_url, pdf_title)
                    dividends.extend(agm_divs)
                except Exception as e:
                    logger.debug(f"AGM PDF {pdf_url}: {e}")

        except Exception as e:
            logger.warning(f"AGM scraping {agm_index}: {e}")

    # Déduplication par symbole
    seen: Dict[str, Dict] = {}
    for d in dividends:
        sym = d["symbol"]
        if sym not in seen:
            seen[sym] = d
    result = list(seen.values())
    logger.info(f"AGM {year}: {len(result)} dividende(s) proposé(s) extraits")
    return result


def _extract_dividends_from_agm_pdf(content: bytes, url: str, title: str) -> List[Dict]:
    """Parse un CR d'AG pour extraire le dividende voté."""
    import io
    try:
        import pdfplumber
    except ImportError:
        return []

    dividends = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            full_text = '\n'.join(p.extract_text() or '' for p in pdf.pages[:10])

        # Détecter le symbole depuis le titre ou le texte
        sym_m = re.search(r'\b([A-Z]{3,7})\b', title.upper())
        sym_candidates = set()
        if sym_m:
            sym_candidates.add(sym_m.group(1))
        for w in re.findall(r'\b([A-Z]{3,7})\b', full_text[:2000]):
            sym_candidates.add(w)

        # Chercher "dividende de X F" ou "DNPA : X FCFA" dans le texte
        patterns = [
            r'dividende\s+(?:net\s+)?(?:par\s+action\s+)?(?:de\s+)?'
            r'([\d][\d\s\xa0]*(?:[,\.]\d+)?)\s*(?:F|FCFA|CFA|francs?)',
            r'D\.?N\.?P\.?A\.?\s*[=:]\s*([\d][\d\s\xa0]*(?:[,\.]\d+)?)',
            r'(?:distribu|verser?)\s+.{0,30}?'
            r'([\d][\d\s\xa0]*(?:[,\.]\d+)?)\s*(?:F|FCFA|CFA)\s+par\s+action',
        ]
        for pat in patterns:
            for m in re.finditer(pat, full_text, re.IGNORECASE):
                raw_v = m.group(1).replace('\xa0', '').replace(' ', '').replace(',', '.')
                try:
                    dnpa = float(raw_v)
                except ValueError:
                    continue
                if not (20 <= dnpa <= 100_000):
                    continue
                # Associer au symbole le plus probable
                for sym in sym_candidates:
                    # Vérifier que le symbole est dans le contexte proche
                    ctx_start = max(0, m.start() - 500)
                    ctx = full_text[ctx_start:m.end()]
                    if sym in ctx:
                        exercice_m = re.search(r'exercice\s+(\d{4})', ctx, re.IGNORECASE)
                        dividends.append({
                            "symbol":        sym,
                            "name":          sym,
                            "dnpa_proposed": dnpa,
                            "exercice":      int(exercice_m.group(1)) if exercice_m else None,
                            "agm_date":      None,
                            "source":        f"AGM-PDF:{title[:30]}",
                        })
                        break
    except Exception as e:
        logger.debug(f"_extract_dividends_from_agm_pdf {url}: {e}")
    return dividends


# ─── Point d'entrée unifié : toutes sources de dividendes ────────────────────

def fetch_all_dividend_sources(year: Optional[int] = None) -> Dict:
    """
    Consolide les dividendes depuis toutes les sources disponibles :
      1. BOC BRVM de l'année en cours (scan complet)
      2. Comptes rendus AGM publiés sur brvm.org
      3. Calendrier officiel BRVM (via scrape_boc_dividends si dispo)

    Retourne :
      {
        "boc":  [...],   # depuis les BOC journaliers
        "agm":  [...],   # depuis les CR d'AG
        "merged": [...], # fusion dédupliquée (BOC prioritaire sur AGM)
        "year": year,
      }
    """
    from datetime import date as _date
    if year is None:
        year = _date.today().year

    logger.info(f"fetch_all_dividend_sources: démarrage pour {year}")

    boc_divs = []
    agm_divs = []

    # Source 1 : BOC annuel
    try:
        boc_divs = scrape_boc_year_dividends(year)
    except Exception as e:
        logger.error(f"BOC annual: {e}")

    # Source 2 : AGM
    try:
        agm_divs = scrape_agm_dividends(year)
    except Exception as e:
        logger.warning(f"AGM scraping: {e}")

    # Fusion : BOC prioritaire (données officielles > données AGM)
    merged: Dict[str, Dict] = {}
    for d in agm_divs:
        sym = d["symbol"]
        if sym not in merged:
            merged[sym] = {
                "symbol":   sym,
                "name":     d.get("name", sym),
                "dnpa":     d.get("dnpa_proposed"),
                "net_yield": None,
                "div_date": d.get("agm_date"),
                "exercice": d.get("exercice"),
                "source":   d.get("source", "AGM"),
            }
    for d in boc_divs:
        sym = d["symbol"]
        if sym in merged:
            # BOC écrase AGM
            merged[sym].update({
                "dnpa":     d["dnpa"],
                "net_yield": d.get("net_yield"),
                "div_date": d.get("div_date"),
                "exercice": d.get("exercice") or merged[sym].get("exercice"),
                "source":   d.get("source", "BOC"),
            })
        else:
            merged[sym] = d

    result = list(merged.values())
    logger.info(f"fetch_all_dividend_sources {year}: {len(result)} titre(s) avec dividende")
    return {
        "boc":    boc_divs,
        "agm":    agm_divs,
        "merged": result,
        "year":   year,
        "counts": {
            "boc": len(boc_divs),
            "agm": len(agm_divs),
            "merged": len(result),
        },
    }
