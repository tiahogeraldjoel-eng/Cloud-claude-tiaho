#!/usr/bin/env python3
"""
Fetch BRVM stock prices — bypasses SikaFinance Cloudflare WAF via cloudscraper.
Runs on GitHub Actions (Azure IPs, not blocked by financial sites).
Output: data/brvm_stocks.json (committed back to main branch)
"""

import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone

import cloudscraper
import requests
from bs4 import BeautifulSoup

KNOWN_TICKERS = {
    "ABJC", "BICB", "BICC", "BNBC", "BOAB", "BOABF", "BOAC", "BOAM", "BOAN", "BOAS",
    "CABC", "CBIBF", "CFAC", "CIEC", "ECOC", "ETIT", "FTSC", "LNBB", "NEIC", "NSBC",
    "NTLC", "ONTBF", "ORAC", "ORGT", "PALC", "PRSC", "SAFC", "SCRC", "SDCC", "SDSC",
    "SEMC", "SGBC", "SHEC", "SIBC", "SICC", "SIVC", "SLBC", "SMBC", "SNTS", "SOGC",
    "SPHC", "STAC", "STBC", "TTLC", "TTLS", "UNLC", "UNXC",
}

BRVM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Connection": "keep-alive",
}

OUTPUT_FILE = "data/brvm_stocks.json"


# ── Parsing helpers ───────────────────────────────────────────────────────────

def parse_number(text: str) -> float | None:
    s = text.strip().replace("\xa0", "").replace(" ", "").replace(" ", "")
    s = s.replace("%", "").replace(",", ".")
    # Remove thousands separator dot (e.g. "5.650" → "5650")
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

        # Price: first numeric > 1 in columns 1-6
        price, price_idx = None, -1
        for i in range(1, min(len(cells), 7)):
            v = parse_number(cells[i].get_text())
            if v is not None and 1.0 < v < 10_000_000.0:
                price, price_idx = v, i
                break
        if price is None:
            continue

        # Change %: first value in [-99, 99] after price
        change_pct = 0.0
        for i in range(price_idx + 1, min(len(cells), price_idx + 5)):
            v = parse_number(cells[i].get_text())
            if v is not None and -99.0 <= v <= 99.0:
                change_pct = v
                break

        # Previous close
        prev = round(price / (1.0 + change_pct / 100.0), 2) if change_pct != 0 else price

        # Volume: last integer > 0
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


def parse_brvm_table(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    rows = soup.select("table tbody tr") or soup.select("table tr")
    results = []
    for row in rows:
        cells = row.select("td")
        if len(cells) < 4:
            continue
        raw = cells[0].get_text(strip=True).upper()
        ticker = re.sub(r"[^A-Z]", "", raw)
        if ticker not in KNOWN_TICKERS:
            continue

        # brvm.org: col 0=ticker, 1=company, 2+=price
        price, price_idx = None, -1
        for i in range(2, min(len(cells), 8)):
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

def make_cloudscraper():
    return cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False},
        delay=5,
    )


def fetch_sikafinance_bulk(scraper) -> list[dict]:
    """Bulk SikaFinance page — 1 request for all tickers. Uses cloudscraper to bypass WAF."""
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
    """SikaFinance JSON API for a single ticker. Uses cloudscraper to bypass WAF."""
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


def fetch_brvm_org() -> list[dict]:
    """brvm.org bulk page — plain requests (Microsoft IPs not blocked by brvm.org)."""
    urls = [
        "https://www.brvm.org/fr/cours-des-actions/0/all",
        "https://www.brvm.org/fr/cours-des-actions/0",
    ]
    for url in urls:
        try:
            resp = requests.get(url, headers=BRVM_HEADERS, timeout=30)
            resp.raise_for_status()
            if len(resp.text) < 1000:
                continue
            stocks = parse_brvm_table(resp.text)
            stocks = [s for s in stocks if s["ticker"] in KNOWN_TICKERS]
            if len(stocks) >= 5:
                print(f"[brvm.org] {len(stocks)} titres trouvés")
                return stocks
        except Exception as e:
            print(f"[brvm.org] Erreur ({url}): {e}", file=sys.stderr)
        time.sleep(1)
    print("[brvm.org] Aucun résultat", file=sys.stderr)
    return []


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
    print("=== Fetch BRVM Stock Data (cloudscraper) ===")

    # Baseline: existing data (never lose prices we already have)
    by_ticker = load_existing()
    print(f"[baseline] {len(by_ticker)} titres en cache")

    scraper = make_cloudscraper()

    # Phase 1: SikaFinance bulk via cloudscraper
    sika_bulk = fetch_sikafinance_bulk(scraper)
    for s in sika_bulk:
        by_ticker[s["ticker"]] = s

    # Phase 2: brvm.org (overrides SikaFinance where available — official source)
    brvm = fetch_brvm_org()
    for s in brvm:
        by_ticker[s["ticker"]] = s

    # Phase 3: SikaFinance JSON API for remaining missing tickers
    missing = KNOWN_TICKERS - set(by_ticker.keys())
    if missing:
        print(f"[API] {len(missing)} tickers manquants → SikaFinance API individuelle")
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

    # Sources breakdown
    new_from_sika = len(sika_bulk)
    new_from_brvm = len(brvm)
    print(f"  SikaFinance bulk : {new_from_sika}")
    print(f"  brvm.org         : {new_from_brvm}")

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
