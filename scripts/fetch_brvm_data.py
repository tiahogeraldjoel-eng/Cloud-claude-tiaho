#!/usr/bin/env python3
"""
Scrape BRVM stock prices.
Utilise cloudscraper pour contourner les protections Cloudflare/WAF.
"""

import json, os, sys, time
from datetime import datetime, timezone, date, timedelta

try:
    import cloudscraper
except ImportError:
    os.system("pip install cloudscraper -q")
    import cloudscraper

import requests
from bs4 import BeautifulSoup

KNOWN_TICKERS = {
    "ABJC","BICB","BICC","BNBC","BOAB","BOABF","BOAC","BOAM","BOAN","BOAS",
    "CABC","CBIBF","CFAC","CIEC","ECOC","ETIT","FTSC","LNBB","NEIC","NSBC",
    "NTLC","ONTBF","ORAC","ORGT","PALC","PRSC","SAFC","SCRC","SDCC","SDSC",
    "SEMC","SGBC","SHEC","SIBC","SICC","SIVC","SLBC","SMBC","SNTS","SOGC",
    "SPHC","STAC","STBC","TTLC","TTLS","UNLC","UNXC",
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_float(s):
    try:
        return float(str(s).strip().replace(" ","").replace("\xa0","").replace(",",".").replace("%",""))
    except: return None

def parse_table_rows(html):
    soup = BeautifulSoup(html, "lxml")
    rows = soup.select("table tbody tr") or soup.select("table tr")
    results = []
    for row in rows:
        cells = [c.get_text(" ", strip=True) for c in row.select("td")]
        if len(cells) < 3: continue
        import re
        ticker = re.sub(r"[^A-Z]", "", cells[0].upper())
        if ticker not in KNOWN_TICKERS: continue
        price, pidx = None, -1
        for i in range(1, len(cells)):
            v = parse_float(cells[i])
            if v and 1 < v < 10_000_000: price = v; pidx = i; break
        if not price: continue
        chg = 0.0
        for i in range(pidx+1, min(len(cells), pidx+4)):
            v = parse_float(cells[i])
            if v is not None and -99 < v < 99: chg = v; break
        prev = round(price / (1 + chg/100), 2) if chg else price
        vol = 0
        for c in reversed(cells):
            try:
                v = int(re.sub(r"[\s.,]","",c))
                if 0 < v < 100_000_000: vol = v; break
            except: pass
        results.append({"ticker":ticker,"closing_price":price,
                        "previous_closing_price":prev,"volume":vol,
                        "change_pct":round(chg,4)})
    return results

# ── Source 1 : SikaFinance bulk (cloudscraper contourne Cloudflare) ──────────

def fetch_sika_bulk():
    try:
        scraper = cloudscraper.create_scraper(browser={"browser":"chrome","platform":"windows","mobile":False})
        resp = scraper.get("https://www.sikafinance.com/marches/aaz", timeout=30)
        resp.raise_for_status()
        rows = parse_table_rows(resp.text)
        rows = [r for r in rows if r["ticker"] in KNOWN_TICKERS]
        print(f"[SikaFinance bulk] {len(rows)} titres")
        return rows
    except Exception as e:
        print(f"[SikaFinance bulk] ERREUR: {e}", file=sys.stderr)
        return []

# ── Source 2 : brvm.org ──────────────────────────────────────────────────────

def fetch_brvm_org():
    urls = [
        "https://www.brvm.org/fr/cours-des-actions/0/all",
        "https://www.brvm.org/fr/cours-des-actions/0",
    ]
    headers = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36"}
    for url in urls:
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            if len(resp.text) < 500: continue
            rows = parse_table_rows(resp.text)
            rows = [r for r in rows if r["ticker"] in KNOWN_TICKERS]
            if len(rows) >= 5:
                print(f"[brvm.org] {len(rows)} titres — {url}")
                return rows
        except Exception as e:
            print(f"[brvm.org] ERREUR ({url}): {e}", file=sys.stderr)
        time.sleep(1)
    return []

# ── Source 3 : SikaFinance API JSON par ticker (cloudscraper) ────────────────

def fetch_sika_api_one(scraper, ticker):
    try:
        today = date.today()
        start = today - timedelta(days=10)
        body = {"ticker":ticker,"datedeb":str(start),"datefin":str(today),"xperiod":0}
        headers = {
            "Content-Type":"application/json",
            "Origin":"https://www.sikafinance.com",
            "Referer":f"https://www.sikafinance.com/marches/historiques/{ticker}",
        }
        resp = scraper.post("https://www.sikafinance.com/api/general/GetHistos",
                            json=body, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list) or not data: return None
        data.sort(key=lambda x: x.get("Date",""), reverse=True)
        last = data[0]
        prev = data[1] if len(data) > 1 else last
        close = last.get("Cloture") or last.get("close") or 0
        if close <= 0: return None
        prev_close = prev.get("Cloture") or prev.get("close") or close
        chg = ((close - prev_close) / prev_close * 100) if prev_close else 0
        return {"ticker":ticker,"closing_price":float(close),
                "previous_closing_price":round(float(prev_close),2),
                "volume":int(last.get("Volume") or 0),
                "change_pct":round(chg,4)}
    except: return None

def fetch_sika_api_all(missing):
    if not missing: return []
    print(f"[SikaFinance API] Fetching {len(missing)} tickers...")
    scraper = cloudscraper.create_scraper(browser={"browser":"chrome","platform":"windows"})
    results = []
    for i, ticker in enumerate(sorted(missing)):
        r = fetch_sika_api_one(scraper, ticker)
        if r:
            results.append(r)
            print(f"  {ticker}: {r['closing_price']}")
        if i % 10 == 9: time.sleep(1)  # pause toutes les 10 requetes
    return results

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    # Charger donnees existantes comme fallback
    existing = {}
    if os.path.exists("data/brvm_stocks.json"):
        try:
            with open("data/brvm_stocks.json") as f:
                old = json.load(f)
                existing = {s["ticker"]: s for s in old.get("stocks", [])}
            print(f"[Fallback] {len(existing)} titres existants charges")
        except: pass

    by_ticker = dict(existing)  # partir des donnees existantes

    # Source 1 : SikaFinance bulk
    for s in fetch_sika_bulk(): by_ticker[s["ticker"]] = s
    print(f"Apres SikaFinance bulk: {len(by_ticker)} titres")

    # Source 2 : brvm.org
    for s in fetch_brvm_org(): by_ticker[s["ticker"]] = s
    print(f"Apres brvm.org: {len(by_ticker)} titres")

    # Source 3 : API pour les manquants (excluant fallback existant)
    fresh = {t for t, v in by_ticker.items() if t not in existing or by_ticker[t] != existing.get(t)}
    truly_missing = KNOWN_TICKERS - set(by_ticker.keys())
    if truly_missing:
        for s in fetch_sika_api_all(truly_missing): by_ticker[s["ticker"]] = s

    stocks = sorted(by_ticker.values(), key=lambda x: x["ticker"])
    fresh_count = len([t for t in by_ticker if t not in existing or by_ticker[t] != existing.get(t)])

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "github-actions",
        "count": len(stocks),
        "fresh": fresh_count,
        "stocks": stocks,
    }

    os.makedirs("data", exist_ok=True)
    with open("data/brvm_stocks.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(stocks)} stocks ({fresh_count} mis a jour) -> data/brvm_stocks.json")

if __name__ == "__main__":
    main()
