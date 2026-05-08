#!/usr/bin/env python3
"""
Fetch BRVM stock prices.
Priority: brvm.org (official) → openapi.brvm.org → SikaFinance cloudscraper
Output: data/brvm_stocks.json (committed back to main branch)
"""

import json
import os
import re
import sys
import time
import urllib.request
import warnings
from datetime import date, datetime, timedelta, timezone

import cloudscraper
import requests
from bs4 import BeautifulSoup

# Suppress SSL verify=False warnings
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

KNOWN_TICKERS = {
    "ABJC", "BICB", "BICC", "BNBC", "BOAB", "BOABF", "BOAC", "BOAM", "BOAN", "BOAS",
    "CABC", "CBIBF", "CFAC", "CIEC", "ECOC", "ETIT", "FTSC", "LNBB", "NEIC", "NSBC",
    "NTLC", "ONTBF", "ORAC", "ORGT", "PALC", "PRSC", "SAFC", "SCRC", "SDCC", "SDSC",
    "SEMC", "SGBC", "SHEC", "SIBC", "SICC", "SIVC", "SLBC", "SMBC", "SNTS", "SOGC",
    "SPHC", "STAC", "STBC", "TTLC", "TTLS", "UNLC", "UNXC",
}

OUTPUT_FILE = "data/brvm_stocks.json"

# Isolated session for brvm.org — never share with other sources to avoid cookie pollution
_BRVM_SESSION = requests.Session()
_BRVM_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
})


# ── Parsing helpers ───────────────────────────────────────────────────────────

def parse_number(text: str) -> float | None:
    s = text.strip().replace("\xa0", "").replace(" ", "").replace(" ", "")
    s = s.replace("%", "").replace(",", ".")
    s = re.sub(r"\.(?=\d{3}(?:[^\d]|$))", "", s)
    try:
        return float(s)
    except ValueError:
        return None


def parse_sika_table(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    rows = soup.select("table tbody tr") or soup.select("table tr")
    results = []
    for row in rows:
        cells = row.select("td")
        if len(cells) < 3:
            continue
        raw = cells[0].get_text(strip=True).upper()
        ticker = re.sub(r"[^A-Z]", "", raw)
        if ticker not in KNOWN_TICKERS:
            continue

        price, price_idx = None, -1
        for i in range(1, min(len(cells), 7)):
            v = parse_number(cells[i].get_text())
            if v is not None and 1.0 < v < 10_000_000.0:
                price, price_idx = v, i
                break
        if price is None:
            continue

        change_pct = 0.0
        for i in range(price_idx + 1, min(len(cells), price_idx + 5)):
            v = parse_number(cells[i].get_text())
            if v is not None and -99.0 <= v <= 99.0:
                change_pct = v
                break

        prev = round(price / (1.0 + change_pct / 100.0), 2) if change_pct != 0 else price

        volume = 0
        for cell in reversed(cells):
            t = cell.get_text(strip=True).replace(" ", "").replace("\xa0", "").replace(".", "").replace(",", "")
            try:
                v = int(t)
                if 0 < v < 100_000_000:
                    volume = v
                    break
            except ValueError:
                pass

        results.append({
            "ticker": ticker,
            "closing_price": price,
            "previous_closing_price": prev,
            "volume": volume,
            "change_pct": round(change_pct, 4),
        })
    return results


# ── Data sources ──────────────────────────────────────────────────────────────

def fetch_brvm_org_official() -> list[dict]:
    """brvm.org official closing prices — replicates TutoCom's scrape_brvm_org().
    URL /fr/cours-actions/0 (NOT /cours-des-actions/) with verify=False.
    Table columns: [0]=Symbole, [1]=Nom, [2]=Volume, [3]=Cours veille, [4]=Ouverture, [5]=Clôture
    """
    url = "https://www.brvm.org/fr/cours-actions/0"
    try:
        resp = _BRVM_SESSION.get(url, timeout=25, verify=False)
        resp.raise_for_status()
        if len(resp.text) < 500:
            print("[brvm.org] Réponse trop courte", file=sys.stderr)
            return []

        soup = BeautifulSoup(resp.text, "lxml")

        # Find the table that contains a "clôture" header (official closing price table)
        target_table = None
        for table in soup.find_all("table"):
            headers_text = table.get_text().lower()
            if "clôture" in headers_text or "cloture" in headers_text:
                target_table = table
                break

        if target_table is None:
            # Fallback: try any table with enough rows
            tables = soup.find_all("table")
            for t in tables:
                rows = t.select("tbody tr") or t.select("tr")
                if len(rows) >= 5:
                    target_table = t
                    break

        if target_table is None:
            print("[brvm.org] Aucune table trouvée", file=sys.stderr)
            return []

        rows = target_table.select("tbody tr") or target_table.select("tr")
        results = []
        for row in rows:
            cells = row.select("td")
            if len(cells) < 4:
                continue

            raw = cells[0].get_text(strip=True).upper()
            ticker = re.sub(r"[^A-Z]", "", raw)
            if ticker not in KNOWN_TICKERS:
                continue

            # Extract closing price from cell[5] (Cours Clôture) if available
            closing_price = None
            if len(cells) > 5:
                closing_price = parse_number(cells[5].get_text())
            # Fallback: scan cells 2-7 for a valid price
            if closing_price is None or closing_price <= 0:
                for i in range(2, min(len(cells), 8)):
                    v = parse_number(cells[i].get_text())
                    if v is not None and 1.0 < v < 10_000_000.0:
                        closing_price = v
                        break
            if closing_price is None or closing_price <= 0:
                continue

            # Previous close from cell[3] (Cours veille/référence)
            prev_close = None
            if len(cells) > 3:
                prev_close = parse_number(cells[3].get_text())
            if prev_close is None or prev_close <= 0:
                prev_close = closing_price

            # Volume from cell[2]
            volume = 0
            if len(cells) > 2:
                t = cells[2].get_text(strip=True).replace(" ", "").replace("\xa0", "").replace(".", "").replace(",", "")
                try:
                    v = int(t)
                    if 0 < v < 100_000_000:
                        volume = v
                except ValueError:
                    pass

            change_pct = 0.0
            if prev_close > 0:
                change_pct = round((closing_price - prev_close) / prev_close * 100, 4)

            results.append({
                "ticker": ticker,
                "closing_price": closing_price,
                "previous_closing_price": round(prev_close, 2),
                "volume": volume,
                "change_pct": change_pct,
            })

        print(f"[brvm.org official] {len(results)} titres")
        return results

    except Exception as e:
        print(f"[brvm.org official] Erreur: {e}", file=sys.stderr)
        return []


def fetch_openapi_brvm() -> list[dict]:
    """API REST officielle BRVM — openapi.brvm.org/api/stocks/"""
    url = "https://openapi.brvm.org/api/stocks/"
    try:
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        items = data.get("data", data) if isinstance(data, dict) else data
        if not isinstance(items, list):
            print("[openapi.brvm.org] Format inattendu")
            return []
        stocks = []
        for item in items:
            ticker = str(item.get("ticker", "")).upper().strip()
            if ticker not in KNOWN_TICKERS:
                continue
            price = item.get("closing_price") or item.get("last_price") or item.get("price")
            if not price or float(price) <= 0:
                continue
            prev = item.get("previous_closing_price") or price
            volume = int(item.get("volume") or 0)
            change_pct = 0.0
            if prev and float(prev) > 0:
                change_pct = round((float(price) - float(prev)) / float(prev) * 100, 4)
            stocks.append({
                "ticker": ticker,
                "closing_price": float(price),
                "previous_closing_price": float(prev),
                "volume": volume,
                "change_pct": change_pct,
            })
        print(f"[openapi.brvm.org] {len(stocks)} titres")
        return stocks
    except Exception as e:
        print(f"[openapi.brvm.org] Erreur: {e}", file=sys.stderr)
    return []


def make_cloudscraper():
    return cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False},
        delay=5,
    )


def fetch_sikafinance_bulk(scraper) -> list[dict]:
    """Bulk SikaFinance page — 1 request for all tickers via cloudscraper."""
    url = "https://www.sikafinance.com/marches/aaz"
    try:
        resp = scraper.get(url, timeout=35)
        resp.raise_for_status()
        stocks = parse_sika_table(resp.text)
        stocks = [s for s in stocks if s["ticker"] in KNOWN_TICKERS]
        print(f"[SikaFinance bulk] {len(stocks)} titres trouvés")
        return stocks
    except Exception as e:
        print(f"[SikaFinance bulk] Erreur: {e}", file=sys.stderr)
        return []


def fetch_sikafinance_api(scraper, ticker: str) -> dict | None:
    """SikaFinance JSON API for a single ticker."""
    today = date.today()
    start = today - timedelta(days=7)
    body = {
        "ticker": ticker,
        "datedeb": str(start),
        "datefin": str(today),
        "xperiod": 0,
    }
    headers = {
        "Content-Type": "application/json",
        "Origin": "https://www.sikafinance.com",
        "Referer": f"https://www.sikafinance.com/marches/historiques/{ticker}",
    }
    try:
        resp = scraper.post(
            "https://www.sikafinance.com/api/general/GetHistos",
            json=body, headers=headers, timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list) or len(data) == 0:
            return None
        data.sort(key=lambda x: x.get("Date", ""), reverse=True)
        last = data[0]
        close = last.get("Cloture") or last.get("close") or last.get("Prix")
        if not close or float(close) <= 0:
            return None
        prev_close = data[1].get("Cloture") or data[1].get("close") if len(data) > 1 else close
        prev_close = prev_close or close
        change_pct = ((float(close) - float(prev_close)) / float(prev_close) * 100) if float(prev_close) > 0 else 0.0
        return {
            "ticker": ticker,
            "closing_price": float(close),
            "previous_closing_price": round(float(prev_close), 2),
            "volume": int(last.get("Volume") or last.get("volume") or 0),
            "change_pct": round(change_pct, 4),
        }
    except Exception:
        return None


def load_existing() -> dict[str, dict]:
    """Load existing JSON as fallback baseline."""
    if not os.path.exists(OUTPUT_FILE):
        return {}
    try:
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return {s["ticker"]: s for s in data.get("stocks", [])}
    except Exception:
        return {}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== Fetch BRVM Stock Data ===")

    # Baseline: existing data (never lose prices we already have)
    by_ticker = load_existing()
    print(f"[baseline] {len(by_ticker)} titres en cache")

    n_brvm_official = 0
    n_openapi = 0
    n_sika_bulk = 0

    # Phase 1: brvm.org official closing prices — most authoritative source
    # Uses /fr/cours-actions/0 with verify=False (replicates TutoCom scraper.py)
    brvm_official = fetch_brvm_org_official()
    for s in brvm_official:
        by_ticker[s["ticker"]] = s
    n_brvm_official = len(brvm_official)

    # Phase 2: openapi.brvm.org — official REST API (may be inaccessible from CI)
    if n_brvm_official < 40:
        openapi_stocks = fetch_openapi_brvm()
        for s in openapi_stocks:
            if s["ticker"] not in by_ticker:
                by_ticker[s["ticker"]] = s
        n_openapi = len(openapi_stocks)

    # Phase 3+: SikaFinance via cloudscraper for remaining gaps
    if len(by_ticker) < 40:
        scraper = make_cloudscraper()

        sika_bulk = fetch_sikafinance_bulk(scraper)
        for s in sika_bulk:
            if s["ticker"] not in by_ticker:
                by_ticker[s["ticker"]] = s
        n_sika_bulk = len(sika_bulk)

        # Phase 4: SikaFinance JSON API for still-missing tickers
        missing = KNOWN_TICKERS - set(by_ticker.keys())
        if missing:
            print(f"[API] {len(missing)} tickers manquants → SikaFinance API")
            for ticker in sorted(missing):
                result = fetch_sikafinance_api(scraper, ticker)
                if result:
                    by_ticker[ticker] = result
                    print(f"  {ticker}: {result['closing_price']} F")
                time.sleep(0.5)

    stocks = sorted(by_ticker.values(), key=lambda x: x["ticker"])
    found = len(stocks)
    total = len(KNOWN_TICKERS)
    print(f"\nRésultat final: {found}/{total} titres")
    print(f"  brvm.org official: {n_brvm_official}")
    print(f"  openapi.brvm.org : {n_openapi}")
    print(f"  SikaFinance bulk : {n_sika_bulk}")

    if n_brvm_official >= 40:
        source_label = "brvm.org-official"
    elif n_openapi >= 40:
        source_label = "openapi.brvm.org"
    else:
        source_label = "github-actions-cloudscraper"

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "github-actions-cloudscraper",
        "count": found,
        "stocks": stocks,
    }

    os.makedirs("data", exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nSauvegardé → {OUTPUT_FILE}")

    if found < 10:
        print(f"AVERTISSEMENT: seulement {found} titres (< 10), vérifier les sources", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
