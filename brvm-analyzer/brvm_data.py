"""
BRVM live data module — quotes + price history + technical indicators
Sources: openapi.brvm.org (REST) → brvm.org (scrape) → local cache
History: SikaFinance GetHistos API
"""
import json, re, warnings
import urllib.request
from datetime import date, timedelta
from pathlib import Path
import requests
from bs4 import BeautifulSoup
import pandas as pd
import streamlit as st

warnings.filterwarnings("ignore", message="Unverified HTTPS request")

KNOWN_TICKERS = sorted([
    "ABJC","BICB","BICC","BNBC","BOAB","BOABF","BOAC","BOAM","BOAN","BOAS",
    "CABC","CBIBF","CFAC","CIEC","ECOC","ETIT","FTSC","LNBB","NEIC","NSBC",
    "NTLC","ONTBF","ORAC","ORGT","PALC","PRSC","SAFC","SCRC","SDCC","SDSC",
    "SEMC","SGBC","SHEC","SIBC","SICC","SIVC","SLBC","SMBC","SNTS","SOGC",
    "SPHC","STAC","STBC","TTLC","TTLS","UNLC","UNXC",
])

_CACHE_FILE = Path(__file__).parent.parent / "data" / "brvm_stocks.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

def _parse_number(text):
    s = str(text).strip().replace("\xa0","").replace(" ","").replace(",",".").replace("%","")
    s = re.sub(r"\.(?=\d{3}(?:[^\d]|$))", "", s)
    try: return float(s)
    except: return None


@st.cache_data(ttl=300, show_spinner=False)
def fetch_all_quotes():
    """Fetch all BRVM quotes. Returns dict {ticker: {closing_price, change_pct, volume}}"""
    # Try 1: openapi.brvm.org REST API
    try:
        req = urllib.request.Request(
            "https://openapi.brvm.org/api/stocks/",
            headers={"Accept": "application/json", "User-Agent": HEADERS["User-Agent"]}
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        items = data.get("data", data) if isinstance(data, dict) else data
        if isinstance(items, list) and len(items) >= 10:
            result = {}
            for item in items:
                t = str(item.get("ticker","")).upper().strip()
                if t not in KNOWN_TICKERS: continue
                price = item.get("closing_price") or item.get("last_price") or item.get("price")
                if not price or float(price) <= 0: continue
                prev = item.get("previous_closing_price") or price
                chg = round((float(price)-float(prev))/float(prev)*100, 2) if float(prev)>0 else 0
                result[t] = {"ticker": t, "closing_price": float(price),
                             "previous_closing_price": float(prev),
                             "volume": int(item.get("volume") or 0), "change_pct": chg}
            if len(result) >= 10:
                return result
    except: pass

    # Try 2: brvm.org HTML scrape
    try:
        sess = requests.Session()
        sess.headers.update(HEADERS)
        resp = sess.get("https://www.brvm.org/fr/cours-actions/0", timeout=20, verify=False)
        if resp.status_code == 200 and len(resp.text) > 500:
            soup = BeautifulSoup(resp.text, "lxml")
            table = None
            for t in soup.find_all("table"):
                if "clôture" in t.get_text().lower() or "cloture" in t.get_text().lower():
                    table = t; break
            if table is None:
                tables = soup.find_all("table")
                table = next((t for t in tables if len(t.select("tr")) >= 5), None)
            if table:
                result = {}
                for row in table.select("tbody tr") or table.select("tr"):
                    cells = row.select("td")
                    if len(cells) < 4: continue
                    ticker = re.sub(r"[^A-Z]","", cells[0].get_text(strip=True).upper())
                    if ticker not in KNOWN_TICKERS: continue
                    price = None
                    if len(cells) > 5: price = _parse_number(cells[5].get_text())
                    if not price or price <= 0:
                        for i in range(2, min(len(cells),8)):
                            v = _parse_number(cells[i].get_text())
                            if v and 1 < v < 10_000_000: price = v; break
                    if not price: continue
                    prev = _parse_number(cells[3].get_text()) if len(cells) > 3 else price
                    prev = prev if prev and prev > 0 else price
                    chg = round((price - prev)/prev*100, 2) if prev > 0 else 0
                    vol = 0
                    try:
                        t2 = cells[2].get_text(strip=True).replace(" ","").replace("\xa0","").replace(".","").replace(",","")
                        vol = int(t2) if t2.isdigit() else 0
                    except: pass
                    result[ticker] = {"ticker": ticker, "closing_price": price,
                                      "previous_closing_price": round(prev,2),
                                      "volume": vol, "change_pct": chg}
                if len(result) >= 10:
                    return result
    except: pass

    # Fallback: local cache file
    if _CACHE_FILE.exists():
        try:
            with open(_CACHE_FILE, encoding="utf-8") as f:
                data = json.load(f)
            return {s["ticker"]: s for s in data.get("stocks", [])}
        except: pass

    return {}


def get_quote(ticker):
    """Get single ticker quote."""
    return fetch_all_quotes().get(ticker.upper())


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_history(ticker, days=365):
    """
    Fetch price history from SikaFinance GetHistos API.
    Returns DataFrame with columns: date, close, volume (sorted asc) or None.
    """
    today = date.today()
    start = today - timedelta(days=days)
    body = {
        "ticker": ticker.upper(),
        "datedeb": str(start),
        "datefin": str(today),
        "xperiod": 0,
    }
    headers_sika = {
        "Content-Type": "application/json",
        "User-Agent": HEADERS["User-Agent"],
        "Origin": "https://www.sikafinance.com",
        "Referer": f"https://www.sikafinance.com/marches/historiques/{ticker}",
        "Accept": "application/json",
    }
    try:
        resp = requests.post(
            "https://www.sikafinance.com/api/general/GetHistos",
            json=body, headers=headers_sika, timeout=20,
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) >= 5:
                rows = []
                for item in data:
                    d_raw = item.get("Date","") or item.get("date","")
                    try: d = pd.to_datetime(d_raw).date()
                    except: continue
                    close = item.get("Cloture") or item.get("close") or item.get("Prix")
                    vol   = item.get("Volume")  or item.get("volume") or 0
                    if close and float(close) > 0:
                        rows.append({"date": d, "close": float(close), "volume": int(vol or 0)})
                if len(rows) >= 5:
                    df = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
                    df["date"] = pd.to_datetime(df["date"])
                    return df
    except: pass
    return None


def compute_technicals(df):
    """Add MA20, Bollinger, RSI(14), MACD(12,26,9) columns to df. Returns df."""
    if df is None or len(df) < 20:
        return df
    prices = df["close"]
    # MA20
    df = df.copy()
    df["MA20"] = prices.rolling(20).mean()
    # Bollinger
    df["BB_mid"] = prices.rolling(20).mean()
    df["BB_std"] = prices.rolling(20).std()
    df["BB_upper"] = df["BB_mid"] + 2 * df["BB_std"]
    df["BB_lower"] = df["BB_mid"] - 2 * df["BB_std"]
    # RSI(14)
    delta = prices.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta).clip(lower=0).rolling(14).mean()
    rs = gain / loss.replace(0, float("nan"))
    df["RSI"] = 100 - 100 / (1 + rs)
    # MACD
    ema12 = prices.ewm(span=12, adjust=False).mean()
    ema26 = prices.ewm(span=26, adjust=False).mean()
    df["MACD"] = ema12 - ema26
    df["MACD_signal"] = df["MACD"].ewm(span=9, adjust=False).mean()
    df["MACD_hist"] = df["MACD"] - df["MACD_signal"]
    return df


def auto_b1_score(df):
    """
    Compute B1 score (-5 to +5) and individual signals from last row of df.
    Returns (score:int, signals:dict{name: bool}, values:dict{name: str})
    """
    if df is None or len(df) < 26:
        return None, {}, {}
    last = df.iloc[-1]
    import numpy as np
    score = 0
    signals = {}
    values = {}
    # 1. MA20
    if not pd.isna(last.get("MA20", float("nan"))):
        bull = last["close"] > last["MA20"]
        signals["MM20"] = bull
        values["MM20"] = f"{last['close']:.0f} vs MA {last['MA20']:.0f}"
        score += 1 if bull else -1
    # 2. Bollinger
    if not pd.isna(last.get("BB_mid", float("nan"))):
        bull = last["close"] > last["BB_mid"]
        signals["Bollinger"] = bull
        values["Bollinger"] = f"Prix {last['close']:.0f} / Mid {last['BB_mid']:.0f}"
        score += 1 if bull else -1
    # 3. MACD
    if not pd.isna(last.get("MACD", float("nan"))):
        bull = last["MACD"] > last["MACD_signal"]
        signals["MACD"] = bull
        values["MACD"] = f"MACD {last['MACD']:.2f} / Signal {last['MACD_signal']:.2f}"
        score += 1 if bull else -1
    # 4. RSI
    if not pd.isna(last.get("RSI", float("nan"))):
        rsi = last["RSI"]
        bull = 35 < rsi < 70
        signals["RSI"] = bull
        values["RSI"] = f"RSI {rsi:.1f}"
        score += 1 if bull else -1
    # 5. Volume
    if len(df) >= 20 and df["volume"].sum() > 0:
        avg_vol = df["volume"].rolling(20).mean().iloc[-1]
        bull = last["volume"] > avg_vol * 0.9 if avg_vol > 0 else False
        signals["Volume"] = bull
        values["Volume"] = f"{int(last['volume']):,} vs moy {int(avg_vol):,}"
        score += 1 if bull else -1
    return score, signals, values
