"""
Indicateurs techniques et analyse de la psychologie du marché.
Tous les calculs sont effectués sur des listes Python (pas de dépendance pandas).
"""
from typing import List, Dict, Optional, Tuple
import math
from datetime import datetime, timezone


# ─── Utilités ────────────────────────────────────────────────────────────────

def _closes(prices: List[Dict]) -> List[float]:
    return [p["close"] for p in prices if p.get("close") is not None]


def _enough(data: List, n: int, name: str) -> bool:
    if len(data) < n:
        return False
    return True


# ─── Moyennes ────────────────────────────────────────────────────────────────

def sma(values: List[float], period: int) -> List[Optional[float]]:
    result = [None] * len(values)
    for i in range(period - 1, len(values)):
        result[i] = sum(values[i - period + 1:i + 1]) / period
    return result


def ema(values: List[float], period: int) -> List[Optional[float]]:
    if len(values) < period:
        return [None] * len(values)
    result: List[Optional[float]] = [None] * len(values)
    k = 2.0 / (period + 1)
    # Première valeur = SMA
    first = sum(values[:period]) / period
    result[period - 1] = first
    for i in range(period, len(values)):
        result[i] = values[i] * k + result[i - 1] * (1 - k)  # type: ignore
    return result


# ─── RSI ─────────────────────────────────────────────────────────────────────

def rsi(values: List[float], period: int = 14) -> List[Optional[float]]:
    """RSI de Wilder."""
    if len(values) < period + 1:
        return [None] * len(values)

    result: List[Optional[float]] = [None] * len(values)
    gains, losses = [], []

    for i in range(1, len(values)):
        diff = values[i] - values[i - 1]
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(values)):
        if avg_loss == 0:
            result[i] = 50.0 if avg_gain == 0 else 100.0
        else:
            rs = avg_gain / avg_loss
            result[i] = 100.0 - (100.0 / (1.0 + rs))

        if i < len(gains):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    return result


# ─── MACD ────────────────────────────────────────────────────────────────────

def macd(
    values: List[float],
    fast: int = 12,
    slow: int = 26,
    signal_period: int = 9,
) -> Dict[str, List[Optional[float]]]:
    """Retourne macd_line, signal_line, histogram."""
    ema_fast = ema(values, fast)
    ema_slow = ema(values, slow)
    n = len(values)

    macd_line: List[Optional[float]] = [
        (ema_fast[i] - ema_slow[i])  # type: ignore
        if ema_fast[i] is not None and ema_slow[i] is not None else None
        for i in range(n)
    ]

    # Signal line : EMA calculée uniquement sur les valeurs MACD valides
    # (évite la distorsion causée par le remplissage à 0 des premières périodes)
    first_valid = next((i for i, v in enumerate(macd_line) if v is not None), None)
    signal_line: List[Optional[float]] = [None] * n
    if first_valid is not None:
        valid_macd_vals = [v for v in macd_line[first_valid:] if v is not None]
        valid_signals = ema(valid_macd_vals, signal_period)
        j = 0
        for i in range(first_valid, n):
            if macd_line[i] is not None and j < len(valid_signals):
                signal_line[i] = valid_signals[j]
                j += 1

    histogram: List[Optional[float]] = [
        macd_line[i] - signal_line[i]  # type: ignore
        if macd_line[i] is not None and signal_line[i] is not None else None
        for i in range(n)
    ]

    return {"macd": macd_line, "signal": signal_line, "histogram": histogram}


# ─── Bandes de Bollinger ──────────────────────────────────────────────────────

def bollinger_bands(
    values: List[float], period: int = 20, nb_std: float = 2.0
) -> Dict[str, List[Optional[float]]]:
    n = len(values)
    middle = sma(values, period)
    upper: List[Optional[float]] = [None] * n
    lower: List[Optional[float]] = [None] * n

    for i in range(period - 1, n):
        window = values[i - period + 1:i + 1]
        mean = middle[i]
        if mean is None:
            continue
        variance = sum((x - mean) ** 2 for x in window) / period
        std = math.sqrt(variance)
        upper[i] = mean + nb_std * std
        lower[i] = mean - nb_std * std

    return {"upper": upper, "middle": middle, "lower": lower}


# ─── Stochastique ────────────────────────────────────────────────────────────

def stochastic(
    prices: List[Dict], k_period: int = 14, d_period: int = 3
) -> Dict[str, List[Optional[float]]]:
    n = len(prices)
    k_values: List[Optional[float]] = [None] * n

    for i in range(k_period - 1, n):
        window = prices[i - k_period + 1:i + 1]
        highs  = [p.get("high") or p["close"] for p in window]
        lows   = [p.get("low")  or p["close"] for p in window]
        close  = prices[i]["close"]
        hh, ll = max(highs), min(lows)
        if hh == ll:
            k_values[i] = 50.0
        else:
            k_values[i] = (close - ll) / (hh - ll) * 100

    # D = SMA(K, 3) — calculé uniquement sur les valeurs K valides
    first_k = next((i for i, v in enumerate(k_values) if v is not None), None)
    d_values: List[Optional[float]] = [None] * n
    if first_k is not None:
        valid_k = [v for v in k_values[first_k:] if v is not None]
        d_sma = sma(valid_k, d_period)
        j = 0
        for i in range(first_k, n):
            if k_values[i] is not None and j < len(d_sma):
                d_values[i] = d_sma[j]
                j += 1

    return {"k": k_values, "d": d_values}


# ─── Indicateurs de volume ───────────────────────────────────────────────────

def obv(prices: List[Dict]) -> List[float]:
    """On-Balance Volume."""
    result = [0.0]
    for i in range(1, len(prices)):
        prev_close = prices[i - 1]["close"]
        curr_close = prices[i]["close"]
        vol = prices[i].get("volume") or 0.0
        if curr_close > prev_close:
            result.append(result[-1] + vol)
        elif curr_close < prev_close:
            result.append(result[-1] - vol)
        else:
            result.append(result[-1])
    return result


# ─── Analyse technique complète ───────────────────────────────────────────────

def compute_technical(prices: List[Dict]) -> Dict:
    """
    Calcule tous les indicateurs techniques pour un titre donné.
    prices : liste de dicts avec {date, open, high, low, close, volume} triés par date ASC.
    """
    closes_list = _closes(prices)
    n = len(closes_list)
    dates = [p["date"] for p in prices]

    def series(values: List[Optional[float]]) -> List[Dict]:
        return [{"date": dates[i], "value": values[i]} for i in range(len(values))]

    result: Dict = {
        "count": n,
        "sma20":  [],
        "sma50":  [],
        "sma200": [],
        "ema20":  [],
        "bollinger": {"upper": [], "middle": [], "lower": []},
        "rsi14":  [],
        "macd":   {"macd": [], "signal": [], "histogram": []},
        "stoch":  {"k": [], "d": []},
        "obv":    [],
        "signals": [],
    }

    if n < 5:
        return result

    result["sma20"]  = series(sma(closes_list, 20))
    result["sma50"]  = series(sma(closes_list, 50))
    result["sma200"] = series(sma(closes_list, 200))
    result["ema20"]  = series(ema(closes_list, 20))

    bb = bollinger_bands(closes_list)
    result["bollinger"] = {
        "upper":  series(bb["upper"]),
        "middle": series(bb["middle"]),
        "lower":  series(bb["lower"]),
    }

    rsi14 = rsi(closes_list)
    result["rsi14"] = series(rsi14)

    mc = macd(closes_list)
    result["macd"] = {
        "macd":      series(mc["macd"]),
        "signal":    series(mc["signal"]),
        "histogram": series(mc["histogram"]),
    }

    st = stochastic(prices)
    result["stoch"] = {
        "k": series(st["k"]),
        "d": series(st["d"]),
    }

    obv_vals = obv(prices)
    result["obv"] = [{"date": dates[i], "value": obv_vals[i]}
                     for i in range(len(prices))]

    # ─── Génération des signaux ───────────────────────────────────────────────
    signals = []
    last_close = closes_list[-1]

    # Signal RSI
    last_rsi = next((v for v in reversed(rsi14) if v is not None), None)
    if last_rsi is not None:
        if last_rsi < 30:
            signals.append({"type": "RSI", "direction": "ACHAT", "detail": f"RSI={last_rsi:.1f} — Survente (< 30)", "strength": "fort"})
        elif last_rsi > 70:
            signals.append({"type": "RSI", "direction": "VENTE", "detail": f"RSI={last_rsi:.1f} — Surachat (> 70)", "strength": "fort"})
        elif last_rsi > 60:
            signals.append({"type": "RSI", "direction": "NEUTRE", "detail": f"RSI={last_rsi:.1f} — Zone d'avertissement", "strength": "faible"})

    # Signal SMA 20/50 croisement
    sma20_vals = sma(closes_list, 20)
    sma50_vals = sma(closes_list, 50)
    if n >= 51:
        s20_curr = sma20_vals[-1]
        s50_curr = sma50_vals[-1]
        s20_prev = sma20_vals[-2]
        s50_prev = sma50_vals[-2]
        if s20_curr and s50_curr and s20_prev and s50_prev:
            if s20_prev <= s50_prev and s20_curr > s50_curr:
                signals.append({"type": "Croisement MA", "direction": "ACHAT",
                                 "detail": "Golden Cross MA20 > MA50", "strength": "fort"})
            elif s20_prev >= s50_prev and s20_curr < s50_curr:
                signals.append({"type": "Croisement MA", "direction": "VENTE",
                                 "detail": "Death Cross MA20 < MA50", "strength": "fort"})

    # Signal MACD
    macd_vals = mc["macd"]
    sig_vals  = mc["signal"]
    if n >= 2:
        last_mc   = next((v for v in reversed(macd_vals) if v is not None), None)
        last_sig  = next((v for v in reversed(sig_vals) if v is not None), None)
        prev_mc   = None
        prev_sig  = None
        for i in range(len(macd_vals) - 2, -1, -1):
            if macd_vals[i] is not None and prev_mc is None:
                prev_mc = macd_vals[i]
            if sig_vals[i] is not None and prev_sig is None:
                prev_sig = sig_vals[i]
            if prev_mc is not None and prev_sig is not None:
                break
        if all(v is not None for v in [last_mc, last_sig, prev_mc, prev_sig]):
            if prev_mc <= prev_sig and last_mc > last_sig:  # type: ignore
                signals.append({"type": "MACD", "direction": "ACHAT",
                                 "detail": "Croisement MACD haussier", "strength": "moyen"})
            elif prev_mc >= prev_sig and last_mc < last_sig:  # type: ignore
                signals.append({"type": "MACD", "direction": "VENTE",
                                 "detail": "Croisement MACD baissier", "strength": "moyen"})

    # Signal Bollinger
    bb_upper = bb["upper"]
    bb_lower = bb["lower"]
    last_upper = next((v for v in reversed(bb_upper) if v is not None), None)
    last_lower = next((v for v in reversed(bb_lower) if v is not None), None)
    if last_upper and last_lower:
        if last_close >= last_upper:
            signals.append({"type": "Bollinger", "direction": "VENTE",
                             "detail": "Prix sur la bande supérieure", "strength": "moyen"})
        elif last_close <= last_lower:
            signals.append({"type": "Bollinger", "direction": "ACHAT",
                             "detail": "Prix sur la bande inférieure", "strength": "moyen"})

    # Prix vs SMA200 (tendance long terme)
    sma200_last = next((v for v in reversed(sma(closes_list, 200)) if v is not None), None)
    if sma200_last:
        if last_close > sma200_last * 1.02:
            signals.append({"type": "Tendance LT", "direction": "HAUSSIÈRE",
                             "detail": f"Prix au-dessus de MA200 ({sma200_last:.0f})", "strength": "fort"})
        elif last_close < sma200_last * 0.98:
            signals.append({"type": "Tendance LT", "direction": "BAISSIÈRE",
                             "detail": f"Prix en-dessous de MA200 ({sma200_last:.0f})", "strength": "fort"})

    result["signals"]  = signals
    result["candle_patterns"] = detect_candlestick_patterns(prices)
    return result


# ─── Bougies Japonaises — Détection de figures ───────────────────────────────

def detect_candlestick_patterns(prices: List[Dict]) -> List[Dict]:
    """
    Détecte les figures de chandeliers japonais.

    Adapté à la BRVM (marché au fixing) :
    ─ L'OHLC est reconstitué synthétiquement (open[i] = close[i-1]).
    ─ Les figures à mèches (Doji spéciaux, Marteau, Étoile Filante…) ne sont
      signalées que si de vraies mèches existent (données intraday réelles).
    ─ Les figures multi-bougies (Avalement, Étoile du Matin, 3 Soldats…)
      restent entièrement valides sur données au fixing.

    Figures détectées :
    ─ 1 bougie : Doji, Indécision (mini-corps), Impulsion Haussière/Baissière
                 + avec vraies mèches : Doji Libellule, Doji Pierre Tombale,
                   Marteau, Pendu, Étoile Filante, Marteau Inversé, Toupie
    ─ 2 bougies : Avalement ↑/↓, Harami ↑/↓, Ligne Percée, Nuage Noir
    ─ 3 bougies : Étoile du Matin, Étoile du Soir, 3 Soldats Blancs, 3 Corbeaux Noirs
    """
    # Filtrer les bougies avec OHLC valide
    data = [
        p for p in prices
        if p.get("open") is not None and p.get("high") is not None
        and p.get("low") is not None and p.get("close") is not None
        and p["high"] >= p["low"]   # >= pour accepter aussi high=low (Doji plat)
    ]
    data = data[-60:]
    n = len(data)
    if n < 3:
        return []

    # ─── Détecter si les données ont de vraies mèches (données intraday) ──────
    # Sur la BRVM (fixing), high=max(open,close) et low=min(open,close) toujours.
    # Si au moins 10% des bougies ont une vraie mèche, on active les patterns mèche.
    real_wick_count = sum(
        1 for p in data
        if p["high"] > max(p["open"], p["close"]) + 0.1
        or p["low"]  < min(p["open"], p["close"]) - 0.1
    )
    HAS_REAL_WICKS = real_wick_count > len(data) * 0.10

    # ─── helpers ─────────────────────────────────────────────────────────────
    def _body(p: Dict) -> float:
        return abs(p["close"] - p["open"])

    def _rng(p: Dict) -> float:
        return p["high"] - p["low"]

    def _upper(p: Dict) -> float:
        return p["high"] - max(p["open"], p["close"])

    def _lower(p: Dict) -> float:
        return min(p["open"], p["close"]) - p["low"]

    def _bp(p: Dict) -> float:
        r = _rng(p)
        return _body(p) / r if r > 0 else 0.0

    def _mid(p: Dict) -> float:
        return (p["open"] + p["close"]) / 2.0

    def _bull(p: Dict) -> bool:
        return p["close"] > p["open"]

    def _bear(p: Dict) -> bool:
        return p["close"] < p["open"]

    def _var(p: Dict) -> float:
        """Variation % de la bougie (open→close)."""
        if p["open"] and p["open"] != 0:
            return (p["close"] - p["open"]) / p["open"] * 100
        return 0.0

    patterns: List[Dict] = []

    for i in range(2, n):
        c = data[i]       # bougie actuelle
        b = data[i - 1]   # bougie j-1
        a = data[i - 2]   # bougie j-2

        bc  = _body(c);  rc  = _rng(c);  uc  = _upper(c);  lc  = _lower(c);  bpc = _bp(c)
        bb_ = _body(b);  rb  = _rng(b);  bpb = _bp(b)
        ba  = _body(a)
        var_c = c.get("variation_pct") or _var(c)
        found: List[Dict] = []

        # ═══ FIGURES À 1 BOUGIE ══════════════════════════════════════════════

        if HAS_REAL_WICKS:
            # ── Figures nécessitant de vraies mèches (données intraday) ──────

            if bpc < 0.08 and rc > 0 and lc > rc * 0.6 and uc < rc * 0.1:
                found.append({
                    "type": "Doji Libellule", "signal": "ACHAT", "strength": "fort",
                    "emoji": "🔵",
                    "description": (
                        "Corps quasi-nul, longue mèche basse. Les vendeurs ont poussé "
                        "bas mais les acheteurs ont tout repris. Signal haussier fort."
                    ),
                })
            elif bpc < 0.08 and rc > 0 and uc > rc * 0.6 and lc < rc * 0.1:
                found.append({
                    "type": "Doji Pierre Tombale", "signal": "VENTE", "strength": "fort",
                    "emoji": "🔴",
                    "description": (
                        "Corps quasi-nul, longue mèche haute. Tentative haussière "
                        "totalement repoussée. Signal baissier fort en sommet."
                    ),
                })
            elif bpc < 0.10 and rc > 0:
                found.append({
                    "type": "Doji", "signal": "NEUTRE", "strength": "moyen",
                    "emoji": "⚪",
                    "description": (
                        "Corps minuscule : parfait équilibre acheteurs/vendeurs. "
                        "Indécision — précurseur de retournement à surveiller."
                    ),
                })
            elif rc > 0 and bc > 0 and lc >= 2.0 * bc and uc <= bc * 0.5 and bpc < 0.40:
                found.append({
                    "type": "Marteau" if _bull(c) else "Pendu",
                    "signal": "ACHAT" if _bull(c) else "VENTE",
                    "strength": "fort" if _bull(c) else "moyen",
                    "emoji": "🔨" if _bull(c) else "⚠️",
                    "description": (
                        "Longue mèche basse, corps haussier. Pression vendeuse repoussée — "
                        "signal haussier en bas de tendance."
                        if _bull(c) else
                        "Longue mèche basse, corps baissier en sommet. Retournement possible."
                    ),
                })
            elif rc > 0 and bc > 0 and uc >= 2.0 * bc and lc <= bc * 0.5 and bpc < 0.40:
                found.append({
                    "type": "Étoile Filante" if _bear(c) else "Marteau Inversé",
                    "signal": "VENTE" if _bear(c) else "ACHAT",
                    "strength": "fort" if _bear(c) else "moyen",
                    "emoji": "💫" if _bear(c) else "🔼",
                    "description": (
                        "Longue mèche haute, corps baissier. Tentative haussière rejetée."
                        if _bear(c) else
                        "Longue mèche haute, corps haussier. Tentative de reprise — confirmer."
                    ),
                })
            elif 0.10 <= bpc <= 0.40 and rc > 0 and uc > rc * 0.2 and lc > rc * 0.2:
                found.append({
                    "type": "Toupie", "signal": "NEUTRE", "strength": "faible",
                    "emoji": "🌀",
                    "description": "Corps modeste, mèches des deux côtés — lutte équilibrée, attendre confirmation.",
                })

        else:
            # ── Mode fixing BRVM : figures basées sur l'amplitude du mouvement ─
            # On ne signale que les mouvements significatifs, pas les simples Marubozu
            abs_var = abs(var_c) if var_c is not None else 0.0

            if rc == 0:  # Prix inchangé = équivalent Doji
                found.append({
                    "type": "Doji (cours inchangé)", "signal": "NEUTRE", "strength": "moyen",
                    "emoji": "⚪",
                    "description": (
                        "Prix identique à la veille. Absence totale de mouvement — "
                        "indécision ou manque de liquidité sur ce titre."
                    ),
                })
            elif _bull(c) and abs_var >= 5.0:
                found.append({
                    "type": "Hausse Forte", "signal": "ACHAT", "strength": "fort",
                    "emoji": "🚀",
                    "description": (
                        f"Gain de {var_c:.1f}% sur la séance. Forte impulsion acheteur "
                        f"proche de la limite BRVM (+7,5%). Momentum exceptionnel."
                    ),
                })
            elif _bear(c) and abs_var >= 5.0:
                found.append({
                    "type": "Baisse Forte", "signal": "VENTE", "strength": "fort",
                    "emoji": "💥",
                    "description": (
                        f"Perte de {var_c:.1f}% sur la séance. Forte pression vendeuse "
                        f"proche de la limite BRVM (-7,5%). Signal de faiblesse marquée."
                    ),
                })
            elif _bull(c) and 2.5 <= abs_var < 5.0:
                found.append({
                    "type": "Hausse Significative", "signal": "ACHAT", "strength": "moyen",
                    "emoji": "📈",
                    "description": (
                        f"Gain de +{var_c:.1f}% — mouvement haussier notable. "
                        "Demande active sur ce titre."
                    ),
                })
            elif _bear(c) and 2.5 <= abs_var < 5.0:
                found.append({
                    "type": "Baisse Significative", "signal": "VENTE", "strength": "moyen",
                    "emoji": "📉",
                    "description": (
                        f"Recul de {var_c:.1f}% — mouvement baissier notable. "
                        "Pression vendeuse active sur ce titre."
                    ),
                })
            # Mouvements < 2.5% : pas de signal unitaire (bruit de marché au fixing)

        # ═══ FIGURES À 2 BOUGIES (valides sur toutes données, même fixing) ═══

        # Avalement Haussier — le corps vert englobe le corps rouge
        if (_bear(b) and _bull(c) and bc > bb_ * 0.5 and bb_ > 0 and
                c["open"] <= b["close"] and c["close"] >= b["open"]):
            found.append({
                "type": "Avalement Haussier", "signal": "ACHAT", "strength": "fort",
                "emoji": "🟢",
                "description": (
                    "La bougie verte englobe la bougie rouge précédente. "
                    "Les acheteurs reprennent totalement le contrôle. "
                    "Signal de retournement haussier très fiable sur la BRVM."
                ),
            })

        # Avalement Baissier — le corps rouge englobe le corps vert
        elif (_bull(b) and _bear(c) and bc > bb_ * 0.5 and bb_ > 0 and
              c["open"] >= b["close"] and c["close"] <= b["open"]):
            found.append({
                "type": "Avalement Baissier", "signal": "VENTE", "strength": "fort",
                "emoji": "🔴",
                "description": (
                    "La bougie rouge englobe la bougie verte précédente. "
                    "Les vendeurs reprennent totalement le contrôle. "
                    "Signal de retournement baissier très fiable sur la BRVM."
                ),
            })

        # Harami Haussier — petite bougie verte dans grande bougie rouge
        elif (_bear(b) and _bull(c) and bb_ > 0 and bc < bb_ * 0.50 and
              c["open"] > b["close"] and c["close"] < b["open"]):
            found.append({
                "type": "Harami Haussier", "signal": "ACHAT", "strength": "moyen",
                "emoji": "🟡",
                "description": (
                    "Petite bougie verte contenue dans la grande bougie rouge. "
                    "Essoufflement vendeur — potentiel retournement haussier à confirmer."
                ),
            })

        # Harami Baissier — petite bougie rouge dans grande bougie verte
        elif (_bull(b) and _bear(c) and bb_ > 0 and bc < bb_ * 0.50 and
              c["open"] < b["close"] and c["close"] > b["open"]):
            found.append({
                "type": "Harami Baissier", "signal": "VENTE", "strength": "moyen",
                "emoji": "🟠",
                "description": (
                    "Petite bougie rouge contenue dans la grande bougie verte. "
                    "Essoufflement acheteur — potentiel retournement baissier à confirmer."
                ),
            })

        # Ligne Percée — ouverture gap bas, clôture au-dessus du milieu rouge
        elif (_bear(b) and _bull(c) and bb_ > 0 and
              c["open"] < b["low"] and
              c["close"] > _mid(b) and c["close"] < b["open"]):
            found.append({
                "type": "Ligne Percée", "signal": "ACHAT", "strength": "moyen",
                "emoji": "⚡",
                "description": (
                    "Gap baissier à l'ouverture puis reprise franche au-dessus du milieu "
                    "de la bougie rouge. Reprise acheteur significative."
                ),
            })

        # Nuage Noir — ouverture gap haut, clôture sous le milieu vert
        elif (_bull(b) and _bear(c) and bb_ > 0 and
              c["open"] > b["high"] and
              c["close"] < _mid(b) and c["close"] > b["open"]):
            found.append({
                "type": "Nuage Noir", "signal": "VENTE", "strength": "moyen",
                "emoji": "🌧️",
                "description": (
                    "Gap haussier à l'ouverture puis chute sous le milieu de la bougie verte. "
                    "Pression vendeuse croissante."
                ),
            })

        # ═══ FIGURES À 3 BOUGIES (valides sur données fixing) ════════════════

        # Étoile du Matin — retournement haussier majeur
        if (_bear(a) and ba > 0 and
                _body(b) < ba * 0.40 and
                _bull(c) and
                c["close"] > _mid(a)):
            found.append({
                "type": "Étoile du Matin", "signal": "ACHAT", "strength": "fort",
                "emoji": "🌅",
                "description": (
                    "Baisse → Hésitation → Forte reprise au-dessus du milieu de la "
                    "première bougie. L'une des figures haussières les plus fiables."
                ),
            })

        # Étoile du Soir — retournement baissier majeur
        if (_bull(a) and ba > 0 and
                _body(b) < ba * 0.40 and
                _bear(c) and
                c["close"] < _mid(a)):
            found.append({
                "type": "Étoile du Soir", "signal": "VENTE", "strength": "fort",
                "emoji": "🌆",
                "description": (
                    "Hausse → Hésitation → Forte chute sous le milieu de la "
                    "première bougie. L'une des figures baissières les plus fiables."
                ),
            })

        # 3 Soldats Blancs — trois hausses puissantes consécutives
        if (_bull(c) and _bull(b) and _bull(a) and
                c["close"] > b["close"] > a["close"] and
                c["open"]  > b["open"]  > a["open"]):
            found.append({
                "type": "3 Soldats Blancs", "signal": "ACHAT", "strength": "fort",
                "emoji": "⚔️",
                "description": (
                    "Trois hausses successives, chacune clôturant plus haut. "
                    "Tendance haussière puissante confirmée sur 3 séances consécutives."
                ),
            })

        # 3 Corbeaux Noirs — trois baisses puissantes consécutives
        if (_bear(c) and _bear(b) and _bear(a) and
                c["close"] < b["close"] < a["close"] and
                c["open"]  < b["open"]  < a["open"]):
            found.append({
                "type": "3 Corbeaux Noirs", "signal": "VENTE", "strength": "fort",
                "emoji": "🦅",
                "description": (
                    "Trois baisses successives, chacune clôturant plus bas. "
                    "Tendance baissière puissante confirmée sur 3 séances consécutives."
                ),
            })

        for pat in found:
            patterns.append({"date": c["date"], **pat})

    # ── Dédupliquer les figures identiques consécutives (ex: plusieurs Marubozu) ─
    deduped: List[Dict] = []
    seen_recent: List[str] = []
    for pat in patterns:
        key = pat["type"]
        # Garder uniquement si le même type n'a pas déjà paru dans les 3 derniers patterns
        if key not in seen_recent[-3:]:
            deduped.append(pat)
        seen_recent.append(key)

    # Retourner les 12 dernières figures, les plus récentes en premier
    return list(reversed(deduped[-12:]))


# ─── Psychologie du marché / Sentiment ───────────────────────────────────────

def compute_sentiment(
    all_prices: Dict[str, List[Dict]],
    market_history: List[Dict],
    all_fundamentals: Optional[Dict[str, Dict]] = None,
) -> Dict:
    """
    Calcule un indice de sentiment (style Fear & Greed) pour la BRVM.

    Composantes et poids — BRVM-spécifique :
    1. Momentum du marché      (15%) — Rendement BRVM Composite sur 30 jours
    2. Force RSI               (15%) — RSI moyen de tous les titres
    3. Ratio Hausse/Baisse     (20%) — % de titres en hausse
    4. Volume relatif          (10%) — Volume du jour / moy. 20j
    5. Force des prix          (15%) — % de titres au-dessus de leur MA20
    6. Attractivité Dividendes (25%) — BRVM-spécifique : dividende élevé = euphorie,
                                        dividende absent = peur même avec bons fondamentaux

    Retourne un dict avec score (0–100), label, et détail de chaque composante.
    """
    components = {}

    # 1. Momentum du marché
    momentum_score = 50.0
    if len(market_history) >= 30:
        try:
            curr_idx = market_history[-1].get("brvm_composite")
            past_idx = market_history[-30].get("brvm_composite") or market_history[0].get("brvm_composite")
            if curr_idx and past_idx and past_idx > 0:
                pct = (curr_idx / past_idx - 1) * 100
                # Normalise: -10% → 0, +10% → 100
                momentum_score = max(0.0, min(100.0, (pct + 10) * 5))
        except Exception:
            pass
    components["momentum"] = {
        "label": "Momentum du Marché",
        "score": round(momentum_score, 1),
        "detail": "Rendement de l'indice BRVM Composite sur 30 jours",
    }

    # 2. Force RSI — moyenne des RSI actuels de tous les titres
    rsi_scores = []
    for symbol, prices in all_prices.items():
        if len(prices) < 16:
            continue
        closes_list = _closes(prices)
        rsi_vals = rsi(closes_list)
        last_rsi = next((v for v in reversed(rsi_vals) if v is not None), None)
        if last_rsi is not None:
            rsi_scores.append(last_rsi)

    rsi_score = sum(rsi_scores) / len(rsi_scores) if rsi_scores else 50.0
    components["rsi"] = {
        "label": "Force RSI",
        "score": round(rsi_score, 1),
        "detail": f"RSI moyen sur {len(rsi_scores)} titres",
    }

    # 3. Ratio Hausse/Baisse
    ad_score = 50.0
    if market_history:
        latest = market_history[-1]
        adv = latest.get("advances", 0) or 0
        dec = latest.get("declines", 0) or 0
        total = adv + dec + (latest.get("unchanged", 0) or 0)
        if total > 0:
            ad_score = (adv / total) * 100
    components["advance_decline"] = {
        "label": "Ratio Hausse/Baisse",
        "score": round(ad_score, 1),
        "detail": "Pourcentage de titres en hausse lors de la dernière séance",
    }

    # 4. Volume relatif
    volume_score = 50.0
    if len(market_history) >= 20:
        try:
            vols = [d.get("total_volume") or 0 for d in market_history]
            curr_vol = vols[-1]
            avg_vol = sum(vols[-21:-1]) / 20 if sum(vols[-21:-1]) > 0 else 0
            if avg_vol > 0:
                ratio = curr_vol / avg_vol
                volume_score = min(100.0, ratio * 50)
        except Exception:
            pass
    components["volume"] = {
        "label": "Volume Relatif",
        "score": round(volume_score, 1),
        "detail": "Volume du jour vs moyenne des 20 derniers jours",
    }

    # 5. Force des prix — % de titres au-dessus de leur MA20
    above_ma20 = 0
    total_checked = 0
    for symbol, prices in all_prices.items():
        if len(prices) < 22:
            continue
        closes_list = _closes(prices)
        sma20_vals = sma(closes_list, 20)
        last_sma20 = next((v for v in reversed(sma20_vals) if v is not None), None)
        if last_sma20 is None:
            continue
        total_checked += 1
        if closes_list[-1] > last_sma20:
            above_ma20 += 1

    price_strength_score = (above_ma20 / total_checked * 100) if total_checked > 0 else 50.0
    components["price_strength"] = {
        "label": "Force des Prix",
        "score": round(price_strength_score, 1),
        "detail": f"{above_ma20}/{total_checked} titres au-dessus de leur MA20",
    }

    # ─── 6. ATTRACTIVITÉ DIVIDENDES ANNONCÉS BRVM ────────────────────────────
    # IMPORTANT : Sur la BRVM, les investisseurs réagissent aux dividendes
    # ANNONCÉS (à venir / en cours d'exercice), pas aux dividendes déjà perçus.
    # La logique comportementale :
    #   - Annonce d'un dividende élevé  → rush d'achat, euphorie, accumulation
    #   - Annonce sans dividende / div réduit → ventes massives de désinvestissement
    #   - Incertitude (données absentes)     → attentisme prudent
    #
    # Les rendements utilisés ici sont les rendements NETS (après retenue fiscale)
    # car c'est le revenu réellement perçu qui conditionne le comportement.
    dividend_score = 50.0
    dividend_detail = "Données dividendes annoncés insuffisantes"

    if all_fundamentals:
        yields_net = []
        n_no_div  = 0  # titres sans dividende annoncé
        n_low_div = 0  # rendement net < 1.5%
        n_mid_div = 0  # rendement net 1.5–3%
        n_hi_div  = 0  # rendement net 3–5%
        n_vhi_div = 0  # rendement net > 5% — euphorie BRVM
        n_unknown = 0  # données non disponibles

        for sym, f in all_fundamentals.items():
            if not f:
                n_unknown += 1
                continue
            dy_gross = f.get("dividend_yield")
            if dy_gross is None:
                n_unknown += 1
                continue
            # Appliquer le facteur net par défaut UEMOA (85% = retenue 15%)
            # Le facteur précis par pays est appliqué dans app.py pour l'affichage
            dy_net = dy_gross * 0.85  # approximation moyenne UEMOA pour le sentiment
            if dy_gross == 0:
                n_no_div += 1
            elif dy_net < 1.5:
                n_low_div += 1
                yields_net.append(dy_net)
            elif dy_net < 3.0:
                n_mid_div += 1
                yields_net.append(dy_net)
            elif dy_net < 5.0:
                n_hi_div += 1
                yields_net.append(dy_net)
            else:
                n_vhi_div += 1
                yields_net.append(dy_net)

        n_with_data = n_no_div + n_low_div + n_mid_div + n_hi_div + n_vhi_div
        if n_with_data >= 3:
            avg_yield_net = sum(yields_net) / len(yields_net) if yields_net else 0.0
            n_paying      = n_low_div + n_mid_div + n_hi_div + n_vhi_div

            # Score de base sur rendement NET annoncé
            # BRVM benchmark NET : ~2.5–3.5% = neutre, >4% = avidité, <1.5% = peur
            if avg_yield_net >= 5.0:
                base = 92   # Euphorie : dividendes annoncés très élevés → rush d'achat
            elif avg_yield_net >= 4.0:
                base = 82   # Forte avidité — annonces attractives
            elif avg_yield_net >= 3.0:
                base = 68   # Bonne attractivité des annonces
            elif avg_yield_net >= 2.0:
                base = 55   # Attractivité correcte
            elif avg_yield_net >= 1.0:
                base = 40   # Peu attractif
            else:
                base = 22   # Dividendes annoncés très faibles = désinvestissement

            # Pénalité si beaucoup de titres n'ont pas annoncé de dividende
            pct_no_div = n_no_div / n_with_data * 100
            penalty    = min(18, pct_no_div * 0.35)  # jusqu'à -18pts

            # Bonus pour les annonces de dividendes exceptionnels (>5% net)
            bonus_vhi  = min(10, n_vhi_div * 3)       # +3 pts par titre >5% net

            dividend_score = max(0.0, min(100.0, base - penalty + bonus_vhi))

            stars = "⭐⭐⭐" if avg_yield_net >= 5 else "⭐⭐" if avg_yield_net >= 3 else "⭐" if avg_yield_net >= 1.5 else ""
            dividend_detail = (
                f"Rendement net annoncé moyen : {avg_yield_net:.1f}% {stars} | "
                f"{n_paying}/{n_with_data} titres ont annoncé un dividende | "
                f"{n_vhi_div} titre(s) >5% net (signal euphorie)"
            )

    components["dividend_brvm"] = {
        "label": "Dividendes Annoncés BRVM",
        "score": round(dividend_score, 1),
        "detail": dividend_detail,
    }

    # ─── Score composite — pondérations BRVM-spécifiques ─────────────────────
    # Le dividende pèse 25% car il est le 1er déterminant comportemental des
    # investisseurs BRVM (versus les marchés développés où il pèse moins)
    composite = (
        momentum_score       * 0.15 +
        rsi_score            * 0.15 +
        ad_score             * 0.20 +
        volume_score         * 0.10 +
        price_strength_score * 0.15 +
        dividend_score       * 0.25
    )
    composite = round(composite, 1)

    if composite <= 25:
        label   = "Peur Extrême"
        color   = "#ef4444"
        emoji   = "😱"
    elif composite <= 45:
        label   = "Peur"
        color   = "#f97316"
        emoji   = "😨"
    elif composite <= 55:
        label   = "Neutre"
        color   = "#eab308"
        emoji   = "😐"
    elif composite <= 75:
        label   = "Avidité"
        color   = "#84cc16"
        emoji   = "😊"
    else:
        label   = "Avidité Extrême"
        color   = "#22c55e"
        emoji   = "🤑"

    # Historique des 30 derniers scores (simulé depuis market_history si disponible)
    history_scores = []
    for md in market_history[-30:]:
        adv = md.get("advances", 0) or 0
        dec = md.get("declines", 0) or 0
        tot = adv + dec + (md.get("unchanged", 0) or 0)
        s   = (adv / tot * 100) if tot > 0 else 50.0
        history_scores.append({"date": md["date"], "score": round(s, 1)})

    return {
        "score":      composite,
        "label":      label,
        "color":      color,
        "emoji":      emoji,
        "components": components,
        "history":    history_scores,
    }


# ─── Support & Résistance ────────────────────────────────────────────────────

def find_support_resistance(prices: List[Dict], window: int = 5) -> Dict:
    """
    Identifie les niveaux de support et résistance via les pivots locaux.
    """
    closes_list = _closes(prices)
    n = len(closes_list)
    if n < window * 2 + 1:
        return {"supports": [], "resistances": []}

    supports     = []
    resistances  = []

    for i in range(window, n - window):
        segment = closes_list[i - window:i + window + 1]
        c = closes_list[i]
        if c == min(segment):
            supports.append({"level": round(c, 2), "date": prices[i]["date"], "touches": 1})
        if c == max(segment):
            resistances.append({"level": round(c, 2), "date": prices[i]["date"], "touches": 1})

    # Ne garder que les 5 niveaux les plus récents
    return {
        "supports":    supports[-5:],
        "resistances": resistances[-5:],
    }


# ─── Résumé fondamental dérivé du cours ──────────────────────────────────────

def compute_derived_fundamental(prices: List[Dict]) -> Dict:
    """
    Calcule des métriques fondamentales dérivables depuis les prix :
    rendement total, volatilité, performance sur différentes périodes.
    """
    closes_list = _closes(prices)
    n = len(closes_list)
    if n < 2:
        return {}

    last = closes_list[-1]

    def perf(days: int) -> Optional[float]:
        if n < days + 1:
            return None
        ref = closes_list[-days - 1]
        if ref == 0:
            return None
        return round((last / ref - 1) * 100, 2)

    # Volatilité annualisée (std des rendements quotidiens * sqrt(252))
    if n >= 22:
        returns = [(closes_list[i] / closes_list[i-1] - 1) for i in range(1, min(n, 253))]
        if returns:
            mean_r = sum(returns) / len(returns)
            variance = sum((r - mean_r) ** 2 for r in returns) / len(returns)
            volatility = math.sqrt(variance) * math.sqrt(252) * 100
        else:
            volatility = None
    else:
        volatility = None

    return {
        "perf_1d":    perf(1),
        "perf_5d":    perf(5),
        "perf_1m":    perf(21),
        "perf_3m":    perf(63),
        "perf_6m":    perf(126),
        "perf_1y":    perf(252),
        "volatility": round(volatility, 2) if volatility else None,
        "high_52w":   round(max(closes_list[-252:]) if n >= 252 else max(closes_list), 2),
        "low_52w":    round(min(closes_list[-252:]) if n >= 252 else min(closes_list), 2),
        "count_days": n,
    }


# ─── Score de liquidité ──────────────────────────────────────────────────────

def compute_liquidity_score(prices: List[Dict]) -> Dict:
    """
    Classifie la liquidité d'un titre BRVM d'après le volume moyen quotidien
    sur les 30 dernières séances.

    Seuils calibrés BRVM (marché peu liquide globalement) :
      Élevée     : vol. moy. >= 10 000 titres/j  → titre phare (Sonatel, BOA, etc.)
      Modérée    : vol. moy. >= 2 000             → liquidité acceptable
      Faible     : vol. moy. >= 300               → rotation lente, prix d'impact élevé
      Très faible: vol. moy. <  300               → risque exécution fort
    """
    if not prices:
        return {"level": "N/D", "score": 0, "avg_vol_30d": None}
    recent = prices[-min(30, len(prices)):]
    vols   = [p.get("volume") or 0 for p in recent]
    avg    = round(sum(vols) / len(vols)) if vols else 0
    if avg >= 10_000:
        level, score = "Élevée", 90
    elif avg >= 2_000:
        level, score = "Modérée", 60
    elif avg >= 300:
        level, score = "Faible", 30
    else:
        level, score = "Très faible", 10
    return {"level": level, "score": score, "avg_vol_30d": avg}


# ─── Saisonnalité mensuelle ───────────────────────────────────────────────────

_MONTH_LABELS = ["Janv.", "Févr.", "Mars", "Avril", "Mai", "Juin",
                 "Juill.", "Août", "Sept.", "Oct.", "Nov.", "Déc."]


def compute_seasonality(prices: List[Dict]) -> Dict:
    """
    Saisonnalité statistique multi-fenêtre sur historique long (>2 ans idéalement).

    Retourne :
      months        : stats mensuelles (1-12) avec score de confiance pondéré
      quarters      : stats trimestrielles Q1-Q4
      annual_returns: rendement total de chaque année calendaire disponible
      next_3m       : prévision saisonnière sur les 3 prochains mois
      coverage_years: nombre d'années couvertes par l'historique
      best_month    : mois historiquement le plus haussier (confiance >= 40)
      worst_month   : mois historiquement le plus baissier (confiance >= 40)
    """
    if not prices:
        return {"months": [], "quarters": [], "annual_returns": {}, "next_3m": [],
                "coverage_years": 0, "best_month": None, "worst_month": None}

    # ── 1. Agrégation : dernier cours de chaque (année, mois) ────────────────
    monthly_close: Dict[Tuple[int, int], float] = {}
    for p in prices:
        d = p.get("date")
        c = p.get("close")
        if not d or c is None:
            continue
        y, m = int(d[:4]), int(d[5:7])
        monthly_close[(y, m)] = c

    keys = sorted(monthly_close.keys())
    if len(keys) < 2:
        return {"months": [], "quarters": [], "annual_returns": {}, "next_3m": [],
                "coverage_years": 0, "best_month": None, "worst_month": None}

    years_covered = keys[-1][0] - keys[0][0] + 1

    # ── 2. Rendements mensuels consécutifs ───────────────────────────────────
    returns_by_month: Dict[int, List[float]] = {m: [] for m in range(1, 13)}
    for i in range(1, len(keys)):
        y_prev, m_prev = keys[i - 1]
        y_cur, m_cur   = keys[i]
        expected = (y_prev, m_prev + 1) if m_prev < 12 else (y_prev + 1, 1)
        if (y_cur, m_cur) != expected:
            continue
        prev_c = monthly_close[(y_prev, m_prev)]
        cur_c  = monthly_close[(y_cur, m_cur)]
        if prev_c:
            returns_by_month[m_cur].append(round((cur_c / prev_c - 1) * 100, 4))

    # ── 3. Stats mensuelles avec score de confiance ───────────────────────────
    # Confiance = (qualité signal) × (couverture temporelle)
    #   signal_strength = |pct_positive - 50| / 50   → [0, 1]
    #   coverage_weight = min(1, n / 10)              → sature à 10 ans
    #   sharpe_monthly  = avg / std                   → ratio risque/rendement
    def _month_stats(m: int) -> Dict:
        rets = returns_by_month[m]
        n = len(rets)
        if n == 0:
            return {"month": m, "label": _MONTH_LABELS[m-1], "n": 0,
                    "pct_positive": None, "avg_return": None, "std_return": None,
                    "best": None, "worst": None, "reliable": False,
                    "confidence": 0, "sharpe": None, "direction": "neutre"}
        n_pos = sum(1 for r in rets if r > 0)
        pct_pos = round(n_pos / n * 100, 1)
        avg = round(sum(rets) / n, 3)
        std = round(math.sqrt(sum((r - avg)**2 for r in rets) / (n - 1)), 3) if n > 1 else None
        sharpe = round(avg / std, 2) if std and std > 0 else None

        signal_strength = abs(pct_pos - 50) / 50
        coverage_weight = min(1.0, n / 10)
        confidence = round(signal_strength * coverage_weight * 100, 1)

        # "reliable" : confiance >= 40 (seuil calibré pour BRVM avec 7-10 ans)
        reliable = confidence >= 40
        direction = "haussier" if pct_pos >= 60 else "baissier" if pct_pos <= 40 else "neutre"
        return {
            "month":        m,
            "label":        _MONTH_LABELS[m-1],
            "n":            n,
            "pct_positive": pct_pos,
            "avg_return":   avg,
            "std_return":   std,
            "best":         round(max(rets), 2),
            "worst":        round(min(rets), 2),
            "reliable":     reliable,
            "confidence":   confidence,
            "sharpe":       sharpe,
            "direction":    direction,
        }

    months = [_month_stats(m) for m in range(1, 13)]

    # ── 4. Saisonnalité trimestrielle ─────────────────────────────────────────
    QUARTERS = [(1, [1,2,3]), (2, [4,5,6]), (3, [7,8,9]), (4, [10,11,12])]
    quarters = []
    for q_num, q_months in QUARTERS:
        # Rendement de chaque trimestre sur chaque année disponible
        years_range = range(keys[0][0], keys[-1][0] + 1)
        q_returns = []
        for yr in years_range:
            start_m = q_months[0]
            end_m   = q_months[-1]
            # Cours fin du trimestre précédent
            prev_m  = (yr - 1, 12) if start_m == 1 else (yr, start_m - 1)
            end_key = (yr, end_m)
            if prev_m in monthly_close and end_key in monthly_close:
                p0 = monthly_close[prev_m]
                p1 = monthly_close[end_key]
                if p0:
                    q_returns.append(round((p1 / p0 - 1) * 100, 3))

        n = len(q_returns)
        if n == 0:
            quarters.append({"quarter": q_num, "label": f"T{q_num}", "n": 0,
                              "avg_return": None, "pct_positive": None, "confidence": 0})
            continue
        n_pos = sum(1 for r in q_returns if r > 0)
        pct_pos = round(n_pos / n * 100, 1)
        avg = round(sum(q_returns) / n, 2)
        signal_strength = abs(pct_pos - 50) / 50
        coverage_weight = min(1.0, n / 8)
        confidence = round(signal_strength * coverage_weight * 100, 1)
        quarters.append({
            "quarter":      q_num,
            "label":        f"T{q_num}",
            "n":            n,
            "avg_return":   avg,
            "pct_positive": pct_pos,
            "best":         round(max(q_returns), 2),
            "worst":        round(min(q_returns), 2),
            "confidence":   confidence,
            "direction":    "haussier" if pct_pos >= 60 else "baissier" if pct_pos <= 40 else "neutre",
        })

    # ── 5. Rendements annuels ─────────────────────────────────────────────────
    annual_returns: Dict[int, float] = {}
    partial_years: list = []   # années calculées Jan→Déc (pas Déc(n-1)→Déc(n))
    all_years = set(y for (y, _) in monthly_close.keys())
    for yr in sorted(all_years):
        # Cours fin décembre de l'année précédente → fin décembre de cette année
        prev_dec = monthly_close.get((yr - 1, 12))
        this_dec = monthly_close.get((yr, 12))
        # Fallback : cours de janvier si décembre indisponible (mesure partielle)
        if prev_dec is None:
            this_jan = monthly_close.get((yr, 1))
            if this_jan and this_dec:
                annual_returns[yr] = round((this_dec / this_jan - 1) * 100, 2)
                partial_years.append(yr)
        elif this_dec:
            annual_returns[yr] = round((this_dec / prev_dec - 1) * 100, 2)

    # ── 6. Prévision 3 mois à venir ──────────────────────────────────────────
    # Ancré sur le mois calendaire UTC, pas sur le dernier mois en base
    # (évite un décalage si les prix sont légèrement en retard)
    today_m = datetime.now(timezone.utc).month
    next_3m = []
    for offset in range(1, 4):
        nm = ((today_m - 1 + offset) % 12) + 1
        ms = months[nm - 1]
        next_3m.append({
            "offset":       offset,
            "month":        nm,
            "label":        _MONTH_LABELS[nm - 1],
            "avg_return":   ms["avg_return"],
            "pct_positive": ms["pct_positive"],
            "confidence":   ms["confidence"],
            "direction":    ms["direction"],
            "n":            ms["n"],
        })

    # ── 7. Meilleur / pire mois (confiance >= 40) ────────────────────────────
    reliable_months = [m for m in months if m["confidence"] >= 40]
    best_month  = max(reliable_months, key=lambda m: m["avg_return"] if m["avg_return"] is not None else -999) if reliable_months else None
    worst_month = min(reliable_months, key=lambda m: m["avg_return"] if m["avg_return"] is not None else  999) if reliable_months else None

    return {
        "months":         months,
        "quarters":       quarters,
        "annual_returns": annual_returns,
        "partial_years":  partial_years,
        "next_3m":        next_3m,
        "coverage_years": years_covered,
        "best_month":     best_month,
        "worst_month":    worst_month,
    }


# ─── Phase de cycle (screener marché) ─────────────────────────────────────────

def _last_value(series: List[Optional[float]]) -> Optional[float]:
    for v in reversed(series):
        if v is not None:
            return v
    return None


def compute_cycle_phase(prices: List[Dict]) -> Dict:
    """
    Classe un titre dans l'une des 4 phases typiques d'un cycle de marché,
    à partir de ses moyennes mobiles (MM50/MM200), MACD et RSI — calculé
    localement à partir de l'historique déjà en base (façon "Synthèse des
    tendances" Sikafinance).

    Phases (vocabulaire grand public) :
      "demarrage" : repli qui se termine, possible redémarrage — à surveiller
      "hausse"    : tendance haussière confirmée
      "sommet"    : forte hausse déjà jouée — risque de repli
      "baisse"    : tendance baissière confirmée
      "indecis"   : pas de tendance nette

    Retourne {"phase", "confidence" (0-100), "label", "description"}.
    """
    closes = _closes(prices)
    n = len(closes)
    if n < 60:
        return {
            "phase": "indecis", "confidence": 0.0,
            "label": "↔️ Données insuffisantes",
            "description": "Historique trop court pour évaluer la tendance.",
        }

    sma50_last  = _last_value(sma(closes, min(50, n // 2)))
    sma200_last = _last_value(sma(closes, min(200, n - 1)))
    macd_data   = macd(closes)
    macd_last   = _last_value(macd_data["macd"])
    sig_last    = _last_value(macd_data["signal"])
    hist_last   = _last_value(macd_data["histogram"])
    rsi_last    = _last_value(rsi(closes, 14))

    hist_vals = [h for h in macd_data["histogram"] if h is not None]
    hist_prev = hist_vals[-6] if len(hist_vals) >= 6 else None

    price = closes[-1]

    if None in (sma50_last, sma200_last, macd_last, sig_last, hist_last, rsi_last):
        return {
            "phase": "indecis", "confidence": 0.0,
            "label": "↔️ Données insuffisantes",
            "description": "Historique trop court pour évaluer la tendance.",
        }

    scores: Dict[str, float] = {}

    # Hausse confirmée : prix et structure des moyennes orientés haut
    s = 0.0
    if price > sma50_last:           s += 25
    if sma50_last > sma200_last:     s += 25
    if macd_last > sig_last:         s += 20
    if hist_last > 0:                s += 15
    if 45 <= rsi_last <= 70:         s += 15
    scores["hausse"] = s

    # Baisse confirmée : symétrique
    s = 0.0
    if price < sma50_last:           s += 25
    if sma50_last < sma200_last:     s += 25
    if macd_last < sig_last:         s += 20
    if hist_last < 0:                s += 15
    if 30 <= rsi_last <= 55:         s += 15
    scores["baisse"] = s

    # Démarrage : sortie de creux, momentum qui repart juste
    s = 0.0
    if price > sma50_last and sma50_last <= sma200_last: s += 25
    if macd_last > sig_last and hist_last > 0:           s += 30
    if 35 <= rsi_last <= 55:                             s += 25
    if n >= 21 and price > closes[-21]:                  s += 20
    scores["demarrage"] = s

    # Sommet : forte hausse déjà jouée, momentum qui s'essouffle
    s = 0.0
    if price > sma50_last > sma200_last:                                    s += 20
    if rsi_last > 65:                                                       s += 30
    if hist_prev is not None and 0 < hist_last < hist_prev:                 s += 30
    if sma200_last and price > sma200_last * 1.10:                          s += 20
    scores["sommet"] = s

    best_phase = max(scores, key=scores.get)
    best_score = scores[best_phase]
    if best_score < 35:
        best_phase = "indecis"

    info = {
        "demarrage": ("🌱 Possible redémarrage",
                       "Le titre semble sortir d'une période de baisse et reprend un peu "
                       "de hauteur — à surveiller de près, le potentiel n'a pas encore "
                       "été exploité."),
        "hausse":    ("📈 Tendance haussière confirmée",
                       "Le titre est en hausse régulière, au-dessus de ses moyennes de "
                       "référence — la tendance est installée."),
        "sommet":    ("⚠️ Forte hausse déjà jouée",
                       "Le titre a beaucoup monté et montre des signes d'essoufflement — "
                       "une pause ou un repli est possible, la prudence est de mise."),
        "baisse":    ("📉 Tendance baissière confirmée",
                       "Le titre est en baisse régulière, sous ses moyennes de référence."),
        "indecis":   ("↔️ Sans tendance nette",
                       "Le titre évolue sans direction claire pour le moment — ni "
                       "occasion ni signal d'alerte évident."),
    }
    label, description = info[best_phase]

    return {
        "phase":       best_phase,
        "confidence":  round(best_score, 1),
        "label":       label,
        "description": description,
    }
