#!/usr/bin/env python3
"""
Scrape BRVM stock prices from sikafinance.com and brvm.org.
Runs server-side (GitHub Actions) to bypass Android IP restrictions.
Output: data/brvm_stocks.json
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

KNOWN_TICKERS = {
    "BICB", "BICC", "BOAB", "BOABF", "BOAC", "BOAM", "BOAN", "BOAS",
    "CBIBF", "ECOC", "ETIT", "NSBC", "ORGT", "SGBC", "SIBC",
    "ONTBF", "ORAC", "SNTS",
    "CIEC", "SHEC", "TTLC", "TTLS",
    "NTLC", "PALC", "SAFC", "SCRC", "SICC", "SLBC", "SOGC", "SPHC", "STBC",
    "CFAC", "PRSC", "SDSC", "UNLC",
    "CABC", "FTSC", "SEMC", "SIVC", "SMBC", "UNXC",
    "ABJC", "LNBB", "NEIC", "SDCC",
    "BNBC", "STAC",
}

SIKA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.sikafinance.com/",
    "DNT": "1",
    "Connection": "keep-alive",
}

BRVM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
}


def parse_number(text: str) -> float | None:
    cleaned = text.strip().replace(" ", "").replace("\xa0", "").replace(" ", "")
    cleaned = cleaned.replace(",", ".").replace("%", "")
    # Remove thousands separators (dots before 3 digits)
    import re
    cleaned = re.sub(r"\.(?=\d{3}(?:[^\d]|$))", "", cleaned)
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_price_from_row(cells):
    """Find closing price (first numeric value > 1 FCFA) in a row."""
    for i, cell in enumerate(cells):
        v = parse_number(cell.get_text())
        if v is not None and 1.0 < v < 10_000_000.0:
            return v, i
    return None, -1


def extract_change_pct(cells, price_idx: int) -> float:
    """Find variation % in cells after price column."""
    for i in range(price_idx + 1, min(len(cells), price_idx + 5)):
        txt = cells[i].get_text().strip().replace("%", "")
        v = parse_number(txt)
        if v is not None and -99.0 <= v <= 99.0:
            return v
    return 0.0


def extract_volume(cells) -> int:
    """Find volume in last cells (integer > 0)."""
    for cell in reversed(cells):
        txt = cell.get_text().strip().replace(" ", "").replace("\xa0", "").replace(" ", "")
        txt = txt.replace(".", "").replace(",", "")
        try:
            v = int(txt)
            if 0 < v < 100_000_000:
                return v
        except ValueError:
            pass
    return 0


def parse_table(html: str, ticker_col: int = 0, min_price_col: int = 1) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("table tbody tr") or soup.select("table tr")
    results = []

    for row in rows:
        cells = row.select("td")
        if len(cells) < 3:
            continue
        raw_ticker = cells[ticker_col].get_text().strip().upper()
        import re
        ticker = re.sub(r"[^A-Z]", "", raw_ticker)
        if len(ticker) < 2 or len(ticker) > 10 or ticker not in KNOWN_TICKERS:
            continue

        # Find price starting from min_price_col
        price = None
        price_idx = -1
        for i in range(min_price_col, min(len(cells), min_price_col + 6)):
            v = parse_number(cells[i].get_text())
            if v is not None and 1.0 < v < 10_000_000.0:
                price = v
                price_idx = i
                break
        if price is None:
            continue

        change_pct = extract_change_pct(cells, price_idx)
        prev = round(price / (1.0 + change_pct / 100.0), 2) if change_pct != 0 else price
        volume = extract_volume(cells)

        results.append({
            "ticker": ticker,
            "closing_price": price,
            "previous_closing_price": prev,
            "volume": volume,
            "change_pct": round(change_pct, 4),
        })

    return results


def fetch_sikafinance() -> list[dict]:
    url = "https://www.sikafinance.com/marches/aaz"
    try:
        resp = requests.get(url, headers=SIKA_HEADERS, timeout=30)
        resp.raise_for_status()
        stocks = parse_table(resp.text, ticker_col=0, min_price_col=1)
        stocks = [s for s in stocks if s["ticker"] in KNOWN_TICKERS]
        print(f"[SikaFinance] {len(stocks)} titres BRVM trouvés")
        return stocks
    except Exception as e:
        print(f"[SikaFinance] Erreur: {e}", file=sys.stderr)
        return []


def fetch_brvm() -> list[dict]:
    urls = [
        "https://www.brvm.org/fr/cours-des-actions/0/all",
        "https://www.brvm.org/fr/cours-des-actions/0",
        "https://www.brvm.org/en/cours-des-actions/0/all",
    ]
    for url in urls:
        try:
            resp = requests.get(url, headers=BRVM_HEADERS, timeout=30)
            resp.raise_for_status()
            if len(resp.text) < 500:
                continue
            stocks = parse_table(resp.text, ticker_col=0, min_price_col=2)
            stocks = [s for s in stocks if s["ticker"] in KNOWN_TICKERS]
            if len(stocks) >= 5:
                print(f"[brvm.org] {len(stocks)} titres trouvés — {url}")
                return stocks
        except Exception as e:
            print(f"[brvm.org] Erreur ({url}): {e}", file=sys.stderr)
        time.sleep(1)
    return []


def fetch_sika_api(ticker: str) -> dict | None:
    """Fallback: SikaFinance JSON API for a single ticker."""
    from datetime import date, timedelta
    today = date.today()
    start = today - timedelta(days=5)
    body = {"ticker": ticker, "datedeb": str(start), "datefin": str(today), "xperiod": 0}
    headers = {**SIKA_HEADERS, "Content-Type": "application/json", "Origin": "https://www.sikafinance.com"}
    try:
        resp = requests.post(
            "https://www.sikafinance.com/api/general/GetHistos",
            json=body, headers=headers, timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list) or len(data) == 0:
            return None
        last = sorted(data, key=lambda x: x.get("Date", ""), reverse=True)[0]
        close = last.get("Cloture") or last.get("close")
        if not close or close <= 0:
            return None
        open_ = last.get("Ouverture") or last.get("open") or close
        vol = last.get("Volume") or last.get("volume") or 0
        return {
            "ticker": ticker,
            "closing_price": float(close),
            "previous_closing_price": float(open_),
            "volume": int(vol),
            "change_pct": 0.0,
        }
    except Exception:
        return None


def main():
    print("=== Fetch BRVM Stock Data ===")

    # Phase 1: SikaFinance bulk page
    sika = fetch_sikafinance()

    # Phase 2: brvm.org bulk page
    brvm = fetch_brvm()

    # Merge: brvm.org takes priority (more data), sika fills gaps
    by_ticker: dict[str, dict] = {}
    for s in sika:
        by_ticker[s["ticker"]] = s
    for s in brvm:
        by_ticker[s["ticker"]] = s  # brvm.org overrides

    # Phase 3: for missing tickers, try SikaFinance JSON API
    missing = KNOWN_TICKERS - set(by_ticker.keys())
    if missing:
        print(f"[API] Fetching {len(missing)} tickers individually…")
        for ticker in sorted(missing):
            result = fetch_sika_api(ticker)
            if result:
                by_ticker[ticker] = result
                print(f"  {ticker}: {result['closing_price']}")
            time.sleep(0.3)

    stocks = sorted(by_ticker.values(), key=lambda x: x["ticker"])
    found = len(stocks)
    total = len(KNOWN_TICKERS)
    print(f"\nRésultat: {found}/{total} titres récupérés")

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "github-actions",
        "count": found,
        "stocks": stocks,
    }

    os.makedirs("data", exist_ok=True)
    with open("data/brvm_stocks.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Saved → data/brvm_stocks.json")

    if found < 10:
        print("AVERTISSEMENT: moins de 10 titres récupérés", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
