"""
Moteur de recommandations BRVM Analytics
=========================================
Produit une recommandation ACHAT / ACCUMULER / NEUTRE / ALLÉGER / VENTE
avec un score de conviction (0-100) et des justifications détaillées.

Axes d'analyse :
  1. Analyse Technique   (40%) — tendance, momentum, oscillateurs
  2. Analyse Fondamentale(35%) — valorisation, dividende (fort poids BRVM)
  3. Psychologie marché  (25%) — sentiment, breadth
  + Analyse SEKIDE BRVM — système à points propriétaire (couche d'ajustement)
      • Prix Médian 1 an / 2 ans
      • PER actualisé (BNPA × (1 + croissance RN))
      • Prix Cible aux Dividendes (PCD = DP / rendement_cible × 100) ± 5 %
      • Rendements cibles BRVM : 6,5 % refuge | 8 % standard | 10 % plantation-tabac
"""

from typing import List, Dict, Optional
import math
import indicators as ind


# ─── MÉTHODOLOGIE SEKIDE ─────────────────────────────────────────────────────
#
# Source : Formation SEKIDE BRVM (dossier FORMATION SEKIDE — études BOA CI,
#          SGBCI, SITAB, CORIS, BBNC/BNBC, AGL, AIR LIQUIDE, UNIWAX)
#
# Système de scoring à 6 points :
#   • Indicateurs techniques (MM20/Bollinger/MACD/RSI) → 1 point
#   • Prix Médian (PM 1 an et 2 ans)                  → 1 point
#   • PER actualisé (vs norme BRVM 9–11)               → 1 point
#   • Prix Cible aux Dividendes (PCD ±5 %)             → 3 points
#
# Interprétation :
#   ≥4 pts survente  → ACHAT (par paliers 25–50 %)
#   Majorité neutre  → NEUTRE (acheter ou vendre par paliers)
#   ≥4 pts surachat  → VENTE (par paliers)
#
# Rendements cibles (REFERENCES_PRIXCIBLE.docx + etudes_actions.xlsx) :
#   6,5 % — Titres refuge : banques ivoiriennes, sociétés sénégalaises,
#            CIE (CIEC), SODECI (SDCC), Coris (CBIBF), LNB (LNBB),
#            ORANGE CI (ORAC), Sonatel (SNTS), AGL, BICC, + profil croissance
#            BERNABE CI (BNBC) : confirmé dans etudes_actions.xlsx feuille ETUDE
#   10 %  — PALMCI (PALC), SAPH/SOGB (SLBC/SPHC), SITAB (STBC), caoutchoucs
#    8 %  — Tous les autres titres cotés
#
# Critère Graham complémentaire (utilisé dans les études SONATEL, CORIS, BERNABE) :
#   PBR × PER < 22  → action « bonne à payer » selon Benjamin Graham
#   PBR × PER > 22  → valorisation tendue, prudence
#   (NB : PBR = Capitalisation boursière / Fonds propres ; non stocké en DB actuellement)
#
# PCD = modèle Gordon-Shapiro simplifié (g=0) :
#   PCD = DP / rendement_cible  ≡  P0 = D1 / (r - g) avec g = 0
#   Version enrichie : P0 = D1 / (r - g) avec g = taux croissance dividendes estimé
#   → Sert de prix théorique d'équilibre fondé sur le revenu (dividende)

_RENDEMENT_6P5_PCT: set = {
    # Banques Côte d'Ivoire
    "SGBC", "BOAC", "BOAN", "BOAB", "BOABF", "BOAM", "BOAS",
    "NSBC", "SIBC", "BICC", "BICB", "ECOC", "CABC", "SAFC", "ETIT",
    # CIE, SODECI
    "CIEC", "SDCC",
    # Coris Bank BF
    "CBIBF",
    # LNB (La Nationale des Banques BF)
    "LNBB",
    # Orange CI
    "ORAC",
    # Sonatel (Sénégal)
    "SNTS",
    # Oragroup Togo, NEI-CEDA CI
    "ORGT", "NEIC",
    # ONATEL BF (opérateur télécom)
    "ONTBF",
    # Bernabé CI — profil croissance, confirmé etudes_actions.xlsx (ETUDE)
    "BNBC",
}

_RENDEMENT_10_PCT: set = {
    "PALC",   # PALMCI — plantations palmiers
    "SLBC",   # SAPH — plantations hévéas
    "SPHC",   # SOGB — caoutchoucs
    "SCRC",   # SCRC — caoutchoucs
    "PRSC",   # PRSC — plantation
    "STBC",   # SITAB — tabac CI
}


def _get_rendement_cible(symbol: str) -> float:
    """Retourne le rendement cible SEKIDE pour le calcul du PCD."""
    if symbol in _RENDEMENT_6P5_PCT:
        return 0.065
    if symbol in _RENDEMENT_10_PCT:
        return 0.10
    return 0.08


def _compute_prix_median(prices: List[Dict], days: int = 252) -> Optional[float]:
    """
    Prix Médian SEKIDE = (Plus haut + Plus bas) / 2 sur la période.
    Utilise les champs 'high' et 'low' si disponibles, sinon 'close'.
    """
    subset = prices[-days:] if len(prices) >= days else prices
    if not subset:
        return None
    highs = [p.get("high") or p.get("close") for p in subset if p.get("high") or p.get("close")]
    lows  = [p.get("low")  or p.get("close") for p in subset if p.get("low")  or p.get("close")]
    if not highs or not lows:
        return None
    return (max(highs) + min(lows)) / 2


def _per_zone_sekide(per_val: float) -> str:
    """Retourne la zone SEKIDE pour un PER donné."""
    if per_val <= 0:        return "neutre"   # négatif ou nul → pas de signal clair
    if per_val < 9:         return "survente"  # sous-évalué → acheter
    if per_val <= 11:       return "neutre"
    return "surachat"                          # sur-évalué → vendre


def score_sekide_brvm(
    prices:       List[Dict],
    latest_price: Optional[float],
    fundamentals: Optional[Dict],
    symbol:       str = "",
    growth_rate:  Optional[float] = None,   # croissance RN dernière période (ex : 0.1171)
) -> Dict:
    """
    Calcule le score SEKIDE BRVM (0–6 points).

    Retourne un dict avec :
      points_survente   : nb de points en zone survente  (→ signal achat)
      points_neutre     : nb de points en zone neutre
      points_surachat   : nb de points en zone surachat  (→ signal vente)
      total_survente    : score pondéré survente (max 6)
      zone_dominante    : "survente" | "neutre" | "surachat"
      signal            : "ACHAT" | "NEUTRE" | "VENTE"
      prix_median_1an   : PM 1 an
      prix_median_2ans  : PM 2 ans
      pcd               : Prix Cible aux Dividendes
      pcd_low           : PCD × 0.95
      pcd_high          : PCD × 1.05
      rendement_cible   : rendement utilisé (0.065 / 0.08 / 0.10)
      details           : liste des critères avec leur zone
    """
    details  = []
    pts_s    = 0   # survente
    pts_n    = 0   # neutre
    pts_a    = 0   # surachat (= "surachat" en français)

    closes   = [p["close"] for p in prices if p.get("close") is not None]
    n        = len(closes)
    last_p   = latest_price or (closes[-1] if closes else None)
    fund     = fundamentals or {}
    gr       = growth_rate or 0.0   # taux de croissance RN (0 si inconnu)

    # ── 1. Indicateurs techniques (MM20 / Bollinger / MACD / RSI) — 1 pt ──────
    # Règle SEKIDE : majorité des 4 indicateurs détermine la zone
    tech_votes = []
    if n >= 14:
        rsi_vals = ind.rsi(closes, 14)
        rsi_v    = next((v for v in reversed(rsi_vals) if v is not None), None)
        if rsi_v is not None:
            if rsi_v < 40:   tech_votes.append("survente")
            elif rsi_v > 60: tech_votes.append("surachat")
            else:             tech_votes.append("neutre")

    if n >= 20:
        sma20 = next((v for v in reversed(ind.sma(closes, 20)) if v is not None), None)
        if sma20 and last_p:
            if   last_p < sma20 * 0.98: tech_votes.append("survente")
            elif last_p > sma20 * 1.02: tech_votes.append("surachat")
            else:                        tech_votes.append("neutre")
        bb  = ind.bollinger_bands(closes)
        low_bb  = next((v for v in reversed(bb["lower"]) if v is not None), None)
        high_bb = next((v for v in reversed(bb["upper"]) if v is not None), None)
        if last_p and low_bb and high_bb:
            if   last_p <= low_bb  * 1.01: tech_votes.append("survente")
            elif last_p >= high_bb * 0.99: tech_votes.append("surachat")
            else:                           tech_votes.append("neutre")

    if n >= 35:
        mc      = ind.macd(closes)
        m_val   = next((v for v in reversed(mc["macd"])   if v is not None), None)
        s_val   = next((v for v in reversed(mc["signal"]) if v is not None), None)
        if m_val is not None and s_val is not None:
            if   m_val < s_val: tech_votes.append("survente")
            elif m_val > s_val: tech_votes.append("surachat")
            else:                tech_votes.append("neutre")

    if tech_votes:
        cnt_s = tech_votes.count("survente")
        cnt_a = tech_votes.count("surachat")
        cnt_n = tech_votes.count("neutre")
        if cnt_s >= cnt_a and cnt_s >= cnt_n:
            zone_tech = "survente"; pts_s += 1
        elif cnt_a > cnt_s and cnt_a >= cnt_n:
            zone_tech = "surachat"; pts_a += 1
        else:
            zone_tech = "neutre";   pts_n += 1
        details.append({
            "critere": "Indicateurs techniques (MM20/Bollinger/MACD/RSI)",
            "zone":    zone_tech,
            "poids":   1,
            "detail":  f"Survente:{cnt_s} Neutre:{cnt_n} Surachat:{cnt_a} sur {len(tech_votes)} indicateurs",
        })
    else:
        pts_n += 1
        details.append({"critere": "Indicateurs techniques", "zone": "neutre", "poids": 1,
                         "detail": "Données insuffisantes"})

    # ── 2. Prix Médian (PM) — 1 pt ────────────────────────────────────────────
    pm_1an  = _compute_prix_median(prices, 252)
    pm_2ans = _compute_prix_median(prices, 504)
    if last_p and pm_1an:
        # Comparaison au PM le plus récent (PM 1 an prioritaire)
        pm_ref = pm_1an
        if   last_p < pm_ref * 0.98: zone_pm = "survente";  pts_s += 1
        elif last_p > pm_ref * 1.02: zone_pm = "surachat";  pts_a += 1
        else:                         zone_pm = "neutre";    pts_n += 1
        pm2_txt = f" | PM 2 ans : {pm_2ans:,.0f} FCFA" if pm_2ans else ""
        details.append({
            "critere": "Prix Médian 1 an (SEKIDE)",
            "zone":    zone_pm,
            "poids":   1,
            "detail":  f"PM 1 an : {pm_1an:,.0f} FCFA{pm2_txt} | Cours : {last_p:,.0f} FCFA",
        })
    else:
        pts_n += 1
        details.append({"critere": "Prix Médian", "zone": "neutre", "poids": 1,
                         "detail": "Données insuffisantes pour calculer le PM"})

    # ── 3. PER actualisé (BNPA × (1 + croissance RN)) — 1 pt ─────────────────
    pcd_val = pcd_low = pcd_high = None
    per_act = None
    bnpa    = fund.get("bnpa") or fund.get("eps")
    per_db  = fund.get("per")

    if last_p and bnpa and bnpa > 0:
        bnpa_act = bnpa * (1 + gr)
        per_act  = last_p / bnpa_act
    elif last_p and per_db and per_db > 0:
        # Actualiser le PER stocké avec le taux de croissance
        per_act = per_db / (1 + gr) if gr > 0 else per_db

    if per_act is not None:
        zone_per = _per_zone_sekide(per_act)
        if zone_per == "survente":   pts_s += 1
        elif zone_per == "surachat": pts_a += 1
        else:                        pts_n += 1
        gr_txt = f" (×{1+gr:.2f} = BNPA actualisé)" if gr != 0 else ""
        # Critère Graham complémentaire : PBR × PER < 22
        pbr = fund.get("pbr")
        graham_txt = ""
        if pbr and pbr > 0:
            graham_rv = pbr * per_act
            graham_ok = graham_rv < 22
            graham_txt = (
                f" | Graham PBR×PER : {pbr:.2f}×{per_act:.1f}={graham_rv:.1f}"
                f" {'< 22 ✓' if graham_ok else '> 22 ⚠ surévaluation Graham'}"
            )
        details.append({
            "critere": "PER actualisé SEKIDE",
            "zone":    zone_per,
            "poids":   1,
            "detail":  f"PER actualisé : {per_act:.2f}x{gr_txt} | Zone normale BRVM : 9–11{graham_txt}",
        })
    else:
        pts_n += 1
        details.append({"critere": "PER actualisé", "zone": "neutre", "poids": 1,
                         "detail": "BNPA non disponible"})

    # ── 4. Prix Cible aux Dividendes (PCD ± 5 %) — 3 pts ─────────────────────
    # SEKIDE utilise le dividende NET (après IRVM) pour le PCD
    # Priorité : dividend_per_share_net (enrichi par app.py) > brut × 0.85 (IRVM UEMOA standard)
    dps_net  = fund.get("dividend_per_share_net")
    dps_brut = fund.get("dividend_per_share") or fund.get("dps")
    irvm_fac = 1 - (fund.get("irvm_rate_pct", 15.0) / 100)   # 0.85 par défaut (15% UEMOA)
    dps      = dps_net if dps_net else (round(dps_brut * irvm_fac, 2) if dps_brut else None)
    rdt_cib  = _get_rendement_cible(symbol)

    if last_p and dps and dps > 0:
        dp      = dps * (1 + gr)         # Dividende Prévisionnel
        # PCD = modèle Gordon-Shapiro avec g=0 : P0 = D1 / r
        # (= P0 = D1 / (r-g) du fichier etudes_actions.xlsx avec g=0 par défaut)
        pcd_val = dp / rdt_cib
        pcd_low = pcd_val * 0.95
        pcd_high= pcd_val * 1.05

        if   last_p < pcd_low:   zone_pcd = "survente";  pts_s += 3
        elif last_p > pcd_high:  zone_pcd = "surachat";  pts_a += 3
        else:                     zone_pcd = "neutre";    pts_n += 3

        dp_txt  = f"{dp:,.0f}" if gr != 0 else f"{dps:,.0f}"
        # Gordon-Shapiro enrichi : si un taux de croissance dividende (gdiv) est connu
        gdiv = fund.get("div_growth_rate") or 0.0   # taux croissance dividende estimé
        gs_txt = ""
        if gdiv > 0 and rdt_cib > gdiv:
            gs_price = dp / (rdt_cib - gdiv)
            gs_txt = f" | Gordon-Shapiro (g={gdiv*100:.1f}%) : {gs_price:,.0f} FCFA"
        details.append({
            "critere": f"Prix Cible Dividendes (PCD ±5% — rendement cible {rdt_cib*100:.1f}%)",
            "zone":    zone_pcd,
            "poids":   3,
            "detail": (
                f"DP = {dp_txt} FCFA | PCD = {pcd_val:,.0f} FCFA "
                f"| Zone [{pcd_low:,.0f} – {pcd_high:,.0f}] | Cours : {last_p:,.0f} FCFA{gs_txt}"
            ),
        })
    else:
        pts_n += 3
        details.append({"critere": "Prix Cible Dividendes (PCD)", "zone": "neutre", "poids": 3,
                         "detail": "DPS non disponible — PCD non calculable"})

    # ── Signal final ──────────────────────────────────────────────────────────
    total = pts_s + pts_n + pts_a   # = 6

    if pts_s >= 4:
        signal        = "ACHAT"
        zone_dominante = "survente"
    elif pts_a >= 4:
        signal         = "VENTE"
        zone_dominante = "surachat"
    elif pts_s > pts_a:
        signal         = "ACCUMULER"
        zone_dominante = "survente"
    elif pts_a > pts_s:
        signal         = "ALLÉGER"
        zone_dominante = "surachat"
    else:
        signal         = "NEUTRE"
        zone_dominante = "neutre"

    # Recommandation opérationnelle (langage SEKIDE)
    if signal in ("ACHAT", "ACCUMULER"):
        conseil = "Acheter par paliers de 25 à 50 %"
    elif signal in ("VENTE", "ALLÉGER"):
        conseil = "Vendre par paliers de 25 à 50 %"
    else:
        conseil = "Acheter ou vendre par paliers de 25 à 50 %"

    return {
        "signal":           signal,
        "conseil":          conseil,
        "zone_dominante":   zone_dominante,
        "points_survente":  pts_s,
        "points_neutre":    pts_n,
        "points_surachat":  pts_a,
        "score_6":          pts_s,   # sur 6 — plus c'est élevé, plus c'est haussier
        "prix_median_1an":  round(pm_1an,  0) if pm_1an  else None,
        "prix_median_2ans": round(pm_2ans, 0) if pm_2ans else None,
        "per_actualise":    round(per_act, 2) if per_act else None,
        "pcd":              round(pcd_val, 0) if pcd_val else None,
        "pcd_low":          round(pcd_low, 0) if pcd_low else None,
        "pcd_high":         round(pcd_high, 0) if pcd_high else None,
        "rendement_cible":  rdt_cib,
        "growth_rate_used": gr,
        "details":          details,
    }


# ─── Labels et couleurs ──────────────────────────────────────────────────────

RECO_CONFIG = {
    "ACHAT":    {"color": "#16a34a", "bg": "#052e16", "border": "#166534", "icon": "↑↑", "score_min": 70},
    "ACCUMULER":{"color": "#4ade80", "bg": "#052e16", "border": "#15803d", "icon": "↑",  "score_min": 58},
    "NEUTRE":   {"color": "#eab308", "bg": "#1c1917", "border": "#713f12", "icon": "→",  "score_min": 42},
    "ALLÉGER":  {"color": "#f97316", "bg": "#431407", "border": "#9a3412", "icon": "↓",  "score_min": 28},
    "VENTE":    {"color": "#ef4444", "bg": "#450a0a", "border": "#991b1b", "icon": "↓↓", "score_min":  0},
}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _safe(val, default=None):
    return val if val is not None else default

def _closes(prices: List[Dict]) -> List[float]:
    return [p["close"] for p in prices if p.get("close") is not None]

def _last(series: List[Optional[float]]) -> Optional[float]:
    for v in reversed(series):
        if v is not None:
            return v
    return None

def _score_to_label(score: float) -> str:
    for label, cfg in RECO_CONFIG.items():
        if score >= cfg["score_min"]:
            return label
    return "VENTE"


# ─── ANALYSE TECHNIQUE (score 0–100) ─────────────────────────────────────────

def score_technique(prices: List[Dict]) -> Dict:
    """
    Retourne un dict avec :
      score      : 0-100
      details    : liste de signaux avec poids
      summary    : texte explicatif
    """
    closes = _closes(prices)
    n      = len(closes)
    if n < 14:
        return {"score": 50, "details": [], "summary": "Données insuffisantes (< 14 jours)",
                "data_points": n}

    details = []
    total_weight = 0
    weighted_sum = 0

    def add(label: str, score: float, weight: float, detail: str):
        nonlocal total_weight, weighted_sum
        total_weight  += weight
        weighted_sum  += score * weight
        details.append({"label": label, "score": round(score), "weight": weight, "detail": detail})

    last_close = closes[-1]

    # ── 1. RSI ──────────────────────────────────────────────────────────────
    rsi_vals = ind.rsi(closes, 14)
    rsi_val  = _last(rsi_vals)
    if rsi_val is not None:
        if rsi_val < 25:   rsi_score, rsi_txt = 90, f"RSI={rsi_val:.1f} — Survente extrême (ACHAT fort)"
        elif rsi_val < 35: rsi_score, rsi_txt = 75, f"RSI={rsi_val:.1f} — Zone de survente (signal d'achat)"
        elif rsi_val < 45: rsi_score, rsi_txt = 60, f"RSI={rsi_val:.1f} — Légèrement survendu"
        elif rsi_val < 55: rsi_score, rsi_txt = 50, f"RSI={rsi_val:.1f} — Zone neutre"
        elif rsi_val < 65: rsi_score, rsi_txt = 40, f"RSI={rsi_val:.1f} — Légèrement suracheté"
        elif rsi_val < 75: rsi_score, rsi_txt = 25, f"RSI={rsi_val:.1f} — Zone de surachat (signal de vente)"
        else:               rsi_score, rsi_txt = 10, f"RSI={rsi_val:.1f} — Surachat extrême (VENTE fort)"
        add("RSI (14)", rsi_score, 20, rsi_txt)

    # ── 2. MACD ──────────────────────────────────────────────────────────────
    if n >= 35:
        mc = ind.macd(closes)
        last_macd = _last(mc["macd"])
        last_sig  = _last(mc["signal"])
        last_hist = _last(mc["histogram"])

        if last_macd is not None and last_sig is not None:
            # Croisement
            prev_macd = None
            prev_sig  = None
            for v in reversed(mc["macd"][:-1]):
                if v is not None and prev_macd is None:
                    prev_macd = v
                    break
            for v in reversed(mc["signal"][:-1]):
                if v is not None and prev_sig is None:
                    prev_sig = v
                    break

            if prev_macd is not None and prev_sig is not None:
                cross_up   = prev_macd <= prev_sig and last_macd > last_sig
                cross_down = prev_macd >= prev_sig and last_macd < last_sig

                if cross_up:
                    macd_score, macd_txt = 80, "Croisement MACD haussier (signal d'achat)"
                elif cross_down:
                    macd_score, macd_txt = 20, "Croisement MACD baissier (signal de vente)"
                elif last_macd > last_sig and last_hist > 0:
                    macd_score, macd_txt = 65, f"MACD au-dessus de la signal ({last_macd:.1f} > {last_sig:.1f})"
                elif last_macd < last_sig:
                    macd_score, macd_txt = 35, f"MACD en-dessous de la signal ({last_macd:.1f} < {last_sig:.1f})"
                else:
                    macd_score, macd_txt = 50, "MACD neutre"

                add("MACD (12,26,9)", macd_score, 15, macd_txt)

    # ── 3. Moyennes mobiles — tendance ────────────────────────────────────────
    if n >= 20:
        sma20 = _last(ind.sma(closes, 20))
        if sma20 and last_close > sma20 * 1.03:
            add("MA20", 70, 10, f"Prix ({last_close:,.0f}) au-dessus MA20 ({sma20:,.0f}) — tendance haussière CT")
        elif sma20 and last_close < sma20 * 0.97:
            add("MA20", 30, 10, f"Prix ({last_close:,.0f}) en-dessous MA20 ({sma20:,.0f}) — tendance baissière CT")
        else:
            add("MA20", 50, 10, f"Prix proche MA20 ({sma20:,.0f} FCFA) — tendance neutre")

    if n >= 50:
        sma50 = _last(ind.sma(closes, 50))
        if sma50 and last_close > sma50 * 1.02:
            add("MA50", 68, 10, f"Prix au-dessus MA50 ({sma50:,.0f}) — tendance moyen terme haussière")
        elif sma50 and last_close < sma50 * 0.98:
            add("MA50", 32, 10, f"Prix en-dessous MA50 ({sma50:,.0f}) — tendance moyen terme baissière")
        else:
            add("MA50", 50, 10, f"Prix autour MA50 ({sma50:,.0f} FCFA)")

    if n >= 200:
        sma200 = _last(ind.sma(closes, 200))
        if sma200 and last_close > sma200 * 1.05:
            add("MA200", 75, 10, f"Prix au-dessus MA200 ({sma200:,.0f}) — tendance long terme haussière ✓")
        elif sma200 and last_close < sma200 * 0.95:
            add("MA200", 25, 10, f"Prix en-dessous MA200 ({sma200:,.0f}) — tendance long terme baissière ✗")
        else:
            add("MA200", 50, 10, f"Prix autour MA200 ({sma200:,.0f} FCFA)")

    # ── 4. Bandes de Bollinger ────────────────────────────────────────────────
    if n >= 20:
        bb    = ind.bollinger_bands(closes)
        upper = _last(bb["upper"])
        lower = _last(bb["lower"])
        mid   = _last(bb["middle"])
        if upper and lower and mid:
            band_width = (upper - lower) / mid * 100
            if last_close <= lower * 1.01:
                add("Bollinger", 78, 10, f"Prix sur bande inférieure ({lower:,.0f}) — rebond probable")
            elif last_close >= upper * 0.99:
                add("Bollinger", 22, 10, f"Prix sur bande supérieure ({upper:,.0f}) — résistance")
            else:
                pos = (last_close - lower) / (upper - lower) * 100
                add("Bollinger", 50, 10, f"Prix dans les bandes ({pos:.0f}% du range)")

    # ── 5. Momentum (variation sur 14 jours) ──────────────────────────────────
    if n >= 15:
        mom = (closes[-1] / closes[-15] - 1) * 100
        if   mom >  8: add("Momentum", 78, 5, f"Momentum fort +{mom:.1f}% sur 14j")
        elif mom >  3: add("Momentum", 65, 5, f"Momentum positif +{mom:.1f}% sur 14j")
        elif mom > -3: add("Momentum", 50, 5, f"Momentum neutre {mom:+.1f}% sur 14j")
        elif mom > -8: add("Momentum", 35, 5, f"Momentum négatif {mom:+.1f}% sur 14j")
        else:          add("Momentum", 22, 5, f"Momentum faible {mom:+.1f}% sur 14j")

    # ── 6. Golden/Death Cross ─────────────────────────────────────────────────
    if n >= 51:
        sma20_series = ind.sma(closes, 20)
        sma50_series = ind.sma(closes, 50)
        s20c = _last(sma20_series)
        s50c = _last(sma50_series)
        s20p = _last(sma20_series[:-1])
        s50p = _last(sma50_series[:-1])
        if s20c and s50c and s20p and s50p:
            if s20p <= s50p and s20c > s50c:
                add("Croisement MA", 85, 10, "Golden Cross MA20/MA50 — signal haussier puissant ⭐")
            elif s20p >= s50p and s20c < s50c:
                add("Croisement MA", 15, 10, "Death Cross MA20/MA50 — signal baissier puissant ⚠")

    # ── Score final ───────────────────────────────────────────────────────────
    score = weighted_sum / total_weight if total_weight > 0 else 50

    # Texte résumé
    if score >= 70:
        summary = f"Configuration technique très favorable. Les indicateurs convergent vers une position haussière."
    elif score >= 58:
        summary = f"Configuration technique plutôt positive. Plusieurs indicateurs en zone d'achat."
    elif score >= 42:
        summary = f"Configuration technique neutre. Attente d'un signal directionnel clair."
    elif score >= 28:
        summary = f"Configuration technique dégradée. Prudence recommandée."
    else:
        summary = f"Configuration technique défavorable. Les indicateurs pointent vers une pression vendeuse."

    return {
        "score":       round(score, 1),
        "details":     details,
        "summary":     summary,
        "data_points": n,
        "rsi_value":   round(rsi_val, 1) if rsi_val else None,
    }


# ─── ANALYSE FONDAMENTALE (score 0–100) ──────────────────────────────────────

def score_fondamentale(
    latest_price:  Optional[float],
    fundamentals:  Optional[Dict],
    derived:       Optional[Dict],
    hw:            Optional[Dict],
) -> Dict:
    """
    Axes :
      - Dividende        (poids très élevé pour la BRVM — 30%)
      - Valorisation P/E (25%)
      - Performance LT   (25%)
      - Position 52 sem  (20%)
    """
    details = []
    total_weight = 0
    weighted_sum = 0

    def add(label: str, score: float, weight: float, detail: str):
        nonlocal total_weight, weighted_sum
        total_weight  += weight
        weighted_sum  += score * weight
        details.append({"label": label, "score": round(score), "weight": weight, "detail": detail})

    # ── 1. DIVIDENDE NET ANNONCÉ (30%) — critère #1 pour les investisseurs BRVM
    # Utilise le rendement NET (après retenue fiscale UEMOA) car c'est le revenu
    # réellement perçu qui guide les décisions d'investissement sur la BRVM.
    div_score = 50
    div_detail = "Dividende non disponible"
    if fundamentals:
        # Priorité au rendement net calculé (si enrichi par app.py), sinon gross × 0.85
        dy_net   = fundamentals.get("dividend_yield_net")
        dy_gross = fundamentals.get("dividend_yield_gross") or fundamentals.get("dividend_yield")
        dps_net  = fundamentals.get("dividend_per_share_net")
        dps_gross= fundamentals.get("dividend_per_share")
        irvm_pct = fundamentals.get("irvm_rate_pct", 15.0)

        # Calculer dy_net si non disponible (fallback 15% UEMOA)
        if dy_net is None and dy_gross is not None:
            dy_net  = dy_gross * 0.85
        if dps_net is None and dps_gross is not None:
            dps_net = dps_gross * 0.85

        dy = dy_net  # score basé sur le NET

        if dy is not None and dy > 0:
            gross_str = f" (brut : {dy_gross:.1f}%)" if dy_gross and dy_gross != dy else ""
            if   dy >= 6.5:div_score, div_detail = 95, f"Rendement net exceptionnel : {dy:.1f}%{gross_str} ⭐⭐⭐"
            elif dy >= 5.0:div_score, div_detail = 85, f"Rendement net très attractif : {dy:.1f}%{gross_str} ⭐⭐"
            elif dy >= 3.5:div_score, div_detail = 72, f"Rendement net attractif : {dy:.1f}%{gross_str} ⭐"
            elif dy >= 2.0:div_score, div_detail = 58, f"Rendement net correct : {dy:.1f}%{gross_str}"
            elif dy >= 0.5:div_score, div_detail = 45, f"Rendement net faible : {dy:.1f}%{gross_str}"
            else:          div_score, div_detail = 35, f"Rendement net très faible : {dy:.1f}%{gross_str}"
            if dps_net:
                div_detail += f" · {dps_net:,.0f} FCFA net/action"
        elif dy_gross == 0 or dps_gross == 0:
            div_score  = 20
            div_detail = "Aucun dividende annoncé — non recommandé pour les investisseurs revenus BRVM"
        else:
            div_score  = 40
            div_detail = "Dividende annoncé : données non encore disponibles"

    add("Dividende net", div_score, 30, div_detail)

    # ── 2. VALORISATION — P/E (25%) ───────────────────────────────────────────
    per_score  = 50
    per_detail = "P/E non disponible"
    if fundamentals and fundamentals.get("per"):
        per = fundamentals["per"]
        # Contexte BRVM : P/E moyen ~8-12x
        if   per <= 0:   per_score, per_detail = 30, f"P/E négatif ({per:.1f}x) — pertes"
        elif per < 5:    per_score, per_detail = 82, f"P/E très bas ({per:.1f}x) — titre fortement sous-valorisé ⭐"
        elif per < 8:    per_score, per_detail = 72, f"P/E bas ({per:.1f}x) — valorisation attractive vs BRVM"
        elif per < 12:   per_score, per_detail = 60, f"P/E raisonnable ({per:.1f}x) — dans la norme BRVM"
        elif per < 18:   per_score, per_detail = 45, f"P/E élevé ({per:.1f}x) — valorisation tendue"
        elif per < 25:   per_score, per_detail = 32, f"P/E très élevé ({per:.1f}x) — survalorisation probable"
        else:             per_score, per_detail = 18, f"P/E excessif ({per:.1f}x) — risque de correction"

    add("Valorisation P/E", per_score, 25, per_detail)

    # ── 3. PERFORMANCE LONG TERME (25%) ──────────────────────────────────────
    if derived:
        perf_1y = derived.get("perf_1y")
        perf_6m = derived.get("perf_6m")
        perf    = perf_1y if perf_1y is not None else perf_6m
        if perf is not None:
            if   perf > 30:  lt_score, lt_detail = 85, f"Performance 1 an : +{perf:.1f}% — excellente"
            elif perf > 15:  lt_score, lt_detail = 70, f"Performance 1 an : +{perf:.1f}% — bonne"
            elif perf > 5:   lt_score, lt_detail = 58, f"Performance 1 an : +{perf:.1f}% — positive"
            elif perf > -5:  lt_score, lt_detail = 50, f"Performance 1 an : {perf:+.1f}% — stable"
            elif perf > -15: lt_score, lt_detail = 35, f"Performance 1 an : {perf:+.1f}% — négative"
            elif perf > -30: lt_score, lt_detail = 22, f"Performance 1 an : {perf:+.1f}% — mauvaise"
            else:             lt_score, lt_detail = 10, f"Performance 1 an : {perf:+.1f}% — très mauvaise"
            add("Performance LT", lt_score, 25, lt_detail)
        else:
            add("Performance LT", 50, 25, "Données historiques insuffisantes")
    else:
        add("Performance LT", 50, 25, "Données historiques insuffisantes")

    # ── 4. POSITION DANS LE RANGE 52 SEMAINES (20%) ───────────────────────────
    if hw and latest_price and hw.get("high_52w") and hw.get("low_52w"):
        h52, l52 = hw["high_52w"], hw["low_52w"]
        if h52 > l52:
            pos = (latest_price - l52) / (h52 - l52) * 100
            if   pos < 15: pos_score, pos_detail = 82, f"Près du plus bas 52 sem ({pos:.0f}%) — opportunité d'achat"
            elif pos < 35: pos_score, pos_detail = 68, f"Dans le bas du range 52 sem ({pos:.0f}%)"
            elif pos < 65: pos_score, pos_detail = 50, f"Au milieu du range 52 sem ({pos:.0f}%)"
            elif pos < 85: pos_score, pos_detail = 35, f"Dans le haut du range 52 sem ({pos:.0f}%)"
            else:           pos_score, pos_detail = 20, f"Près du plus haut 52 sem ({pos:.0f}%) — risque de résistance"
            add("Range 52 semaines", pos_score, 20,
                pos_detail + f" | Bas: {l52:,.0f} / Haut: {h52:,.0f} FCFA")
    else:
        add("Range 52 semaines", 50, 20, "Données 52 semaines insuffisantes")

    # ── Score final ───────────────────────────────────────────────────────────
    score = weighted_sum / total_weight if total_weight > 0 else 50

    # Résumé avec focus dividende NET
    f0   = fundamentals or {}
    dy   = f0.get("dividend_yield_net") or (f0.get("dividend_yield", 0) or 0) * 0.85 if f0.get("dividend_yield") else None
    dy_g = f0.get("dividend_yield_gross") or f0.get("dividend_yield")
    dps  = f0.get("dividend_per_share_net") or f0.get("dividend_per_share")
    per  = f0.get("per")

    div_txt = ""
    if dy and dy > 0:
        gross_note = f" (brut {dy_g:.1f}%)" if dy_g and abs(dy_g - dy) > 0.1 else ""
        div_txt = f" Rendement net dividende : {dy:.1f}%{gross_note} — {'très attractif' if dy >= 5 else 'attractif' if dy >= 3.5 else 'modeste'}."
    elif dy_g == 0:
        div_txt = " Attention : aucun dividende annoncé."

    if score >= 70:
        summary = f"Fondamentaux solides.{div_txt} Le titre présente une valorisation attractive."
    elif score >= 58:
        summary = f"Fondamentaux corrects.{div_txt}"
    elif score >= 42:
        summary = f"Fondamentaux mitigés.{div_txt} Vigilance recommandée."
    else:
        summary = f"Fondamentaux préoccupants.{div_txt} Risques identifiés."

    return {
        "score":           round(score, 1),
        "details":         details,
        "summary":         summary,
        "dividend_yield":  dy,
        "dividend_per_share": dps,
        "per":             per,
    }


# ─── SCORE PSYCHOLOGIE (0–100) ────────────────────────────────────────────────

def score_psychologie(
    sentiment:     Optional[Dict],
    variation_pct: Optional[float],
    fundamentals:  Optional[Dict] = None,
) -> Dict:
    """
    Intègre 3 axes comportementaux BRVM :

    1. Sentiment global du marché  (45%) — Fear & Greed index BRVM
    2. Attractivité dividende BRVM (35%) — Le dividende est le 1er signal
       comportemental sur la BRVM : rendement élevé = euphorie et accumulation,
       absence de dividende = désinvestissement même avec bons fondamentaux
    3. Dynamique récente du titre  (20%) — Variation cours du jour
    """
    details = []
    total_weight = 0
    weighted_sum = 0

    def add(label: str, score: float, weight: float, detail: str):
        nonlocal total_weight, weighted_sum
        total_weight  += weight
        weighted_sum  += score * weight
        details.append({"label": label, "score": round(score), "weight": weight, "detail": detail})

    # ── 1. Sentiment global (45%) ─────────────────────────────────────────────
    sent_score = (sentiment.get("score") or 50) if sentiment else 50
    sent_label = (sentiment.get("label") or "Neutre") if sentiment else "Neutre"
    add("Sentiment global", sent_score, 45,
        f"Indice Peur & Avidité BRVM : {sent_score:.0f}/100 — {sent_label}")

    # ── 2. DIVIDENDE ANNONCÉ BRVM (35%) ───────────────────────────────────────
    # Comportement BRVM : les investisseurs réagissent aux dividendes ANNONCÉS
    # (à venir), pas aux dividendes déjà perçus. Utilise le rendement NET.
    f0  = fundamentals or {}
    dy  = f0.get("dividend_yield_net") or ((f0.get("dividend_yield") or 0) * 0.85 if f0.get("dividend_yield") else None)
    dy_g= f0.get("dividend_yield_gross") or f0.get("dividend_yield")
    dps = f0.get("dividend_per_share_net") or f0.get("dividend_per_share")

    # Seuils basés sur rendement NET — ce que l'investisseur perçoit vraiment
    if dy is None:
        div_psych_score = 48
        div_psych_txt   = "Dividende annoncé : données non disponibles — attentisme prudent"
    elif dy_g == 0:
        div_psych_score = 12
        div_psych_txt   = "⚠️ Aucun dividende annoncé — désinvestissement BRVM (même avec bons fondamentaux)"
    elif dy < 0.8:
        div_psych_score = 25
        div_psych_txt   = f"Dividende annoncé symbolique (net {dy:.1f}%) — très peu attractif"
    elif dy < 1.7:
        div_psych_score = 38
        div_psych_txt   = f"Faible dividende annoncé (net {dy:.1f}%) — rotation sortante possible"
    elif dy < 2.5:
        div_psych_score = 52
        div_psych_txt   = f"Dividende annoncé correct (net {dy:.1f}%) — intérêt modéré des investisseurs BRVM"
    elif dy < 3.5:
        div_psych_score = 62
        div_psych_txt   = f"Bon dividende annoncé (net {dy:.1f}%) — attractif pour les investisseurs revenus"
    elif dy < 5.0:
        div_psych_score = 78
        div_psych_txt   = f"Très bon dividende annoncé (net {dy:.1f}%) ⭐ — accumulation progressive"
    elif dy < 6.5:
        div_psych_score = 88
        div_psych_txt   = f"Dividende annoncé exceptionnel (net {dy:.1f}%) ⭐⭐ — fort engouement, flux entrants"
    else:
        div_psych_score = 95
        div_psych_txt   = f"Dividende hors-norme annoncé (net {dy:.1f}%) ⭐⭐⭐ — euphorie BRVM, file d'acheteurs"

    gross_note = f" · brut {dy_g:.1f}%" if dy_g and dy and abs(dy_g - dy) > 0.1 else ""
    if dps and dy and dy > 0:
        div_psych_txt += f"{gross_note} · {dps:,.0f} FCFA net/action"

    add("Dividende Annoncé BRVM", div_psych_score, 35, div_psych_txt)

    # ── 3. Dynamique récente du titre (20%) ───────────────────────────────────
    if variation_pct is not None:
        if   variation_pct > 5:   dyn_score, dyn_txt = 80, f"Forte hausse du jour : +{variation_pct:.2f}% — momentum acheteur"
        elif variation_pct > 2:   dyn_score, dyn_txt = 68, f"Hausse du jour : +{variation_pct:.2f}%"
        elif variation_pct > 0:   dyn_score, dyn_txt = 57, f"Légère hausse : +{variation_pct:.2f}%"
        elif variation_pct > -2:  dyn_score, dyn_txt = 43, f"Légère baisse : {variation_pct:.2f}%"
        elif variation_pct > -5:  dyn_score, dyn_txt = 32, f"Baisse du jour : {variation_pct:.2f}% — pression vendeuse"
        else:                      dyn_score, dyn_txt = 18, f"Forte baisse du jour : {variation_pct:.2f}% — vendeurs dominants"
        add("Dynamique du titre", dyn_score, 20, dyn_txt)

    score = weighted_sum / total_weight if total_weight > 0 else 50

    # ── Résumé contextuel ─────────────────────────────────────────────────────
    label = (sentiment.get("label", "Neutre") if sentiment else "Neutre")

    if dy_g == 0:
        psych_note = " Titre sans dividende annoncé : les investisseurs BRVM préfèrent les valeurs de rendement."
    elif dy and dy >= 5.0:
        psych_note = f" Dividende annoncé net {dy:.1f}% (brut {dy_g:.1f}%) — euphorie et forte demande attendue."
    elif dy and dy >= 3.5:
        psych_note = f" Dividende annoncé net {dy:.1f}% (brut {dy_g:.1f}%) — attractif pour les investisseurs revenus."
    elif dy and dy >= 1.7:
        psych_note = f" Dividende annoncé net {dy:.1f}% — correct mais insuffisant pour créer de l'engouement."
    else:
        psych_note = ""

    summary = (
        f"Sentiment marché : « {label} » ({sent_score:.0f}/100).{psych_note}"
    )

    return {"score": round(score, 1), "details": details, "summary": summary}


# ─── RECOMMANDATION GLOBALE ────────────────────────────────────────────────────

def compute_recommendation(
    prices:        List[Dict],
    fundamentals:  Optional[Dict],
    derived:       Optional[Dict],
    hw:            Optional[Dict],
    sentiment:     Optional[Dict],
    latest:        Optional[Dict],
    symbol:        str = "",
) -> Dict:
    """
    Calcule la recommandation finale en combinant 4 axes :
      Technique 40% | Fondamentale 35% | Psychologie 25%
      + couche d'ajustement SEKIDE BRVM (±8 pts sur le composite)

    Retourne un dict complet prêt à envoyer au frontend.
    """
    latest_price = latest.get("close") if latest else None
    var_pct      = latest.get("variation_pct") if latest else None

    # ── Scores par axe ────────────────────────────────────────────────────────
    tech_result  = score_technique(prices)
    fund_result  = score_fondamentale(latest_price, fundamentals, derived, hw)
    # Passer les fondamentaux du titre à la psychologie :
    # le dividende est un signal comportemental direct sur la BRVM
    psych_result = score_psychologie(sentiment, var_pct, fundamentals)

    # ── Couche SEKIDE (ajustement ±8 pts) ────────────────────────────────────
    sekide_result = score_sekide_brvm(
        prices=prices,
        latest_price=latest_price,
        fundamentals=fundamentals,
        symbol=symbol,
        growth_rate=None,  # sera enrichi ultérieurement avec les taux de croissance réels
    )

    tech_score  = tech_result["score"]
    fund_score  = fund_result["score"]
    psych_score = psych_result["score"]

    # ── Score composite pondéré ───────────────────────────────────────────────
    # Technique 40% | Fondamentale 35% | Psychologie 25%
    # Si peu de données techniques → augmenter le poids fondamental
    if tech_result["data_points"] < 30:
        composite = tech_score * 0.20 + fund_score * 0.55 + psych_score * 0.25
    else:
        composite = tech_score * 0.40 + fund_score * 0.35 + psych_score * 0.25

    # ── Ajustement SEKIDE ─────────────────────────────────────────────────────
    # L'écart (survente - surachat) est normalisé sur 6 pts → ±8 pts sur le composite
    # ACHAT pur (6-0)  → +8 | VENTE pure (0-6) → -8 | équilibre → 0
    pts_s  = sekide_result["points_survente"]
    pts_a  = sekide_result["points_surachat"]
    sekide_delta = round((pts_s - pts_a) / 6.0 * 8.0, 1)
    composite    = max(0.0, min(100.0, composite + sekide_delta))

    composite = round(composite, 1)
    label     = _score_to_label(composite)
    cfg       = RECO_CONFIG[label]

    # ── Facteurs déterminants ─────────────────────────────────────────────────
    key_factors = []

    # Dividende (toujours mis en avant pour la BRVM)
    dy  = fund_result.get("dividend_yield")
    dps = fund_result.get("dividend_per_share")
    per = fund_result.get("per")

    if dy and dy > 0:
        emoji = "💰" if dy >= 6 else "✅" if dy >= 3 else "ℹ️"
        key_factors.append({
            "type": "dividende",
            "text": f"{emoji} Dividende : {dy:.1f}% de rendement ({dps:,.0f} FCFA/action)" if dps else f"{emoji} Rendement dividende : {dy:.1f}%",
            "positive": dy >= 3,
        })
    elif dy == 0:
        key_factors.append({
            "type": "dividende",
            "text": "⚠️ Aucun dividende versé",
            "positive": False,
        })

    if per and per > 0:
        emoji = "📉" if per < 8 else "📊" if per < 15 else "📈"
        key_factors.append({
            "type": "valorisation",
            "text": f"{emoji} P/E : {per:.1f}x ({'sous-évalué' if per < 8 else 'normal' if per < 15 else 'sur-évalué'})",
            "positive": per < 12,
        })

    if tech_result["rsi_value"]:
        rsi_v = tech_result["rsi_value"]
        if rsi_v < 35:
            key_factors.append({"type": "technique", "text": f"📉 RSI survendu : {rsi_v} (signal d'achat)", "positive": True})
        elif rsi_v > 65:
            key_factors.append({"type": "technique", "text": f"📈 RSI suracheté : {rsi_v} (signal de vente)", "positive": False})

    if sentiment:
        s_label = sentiment.get("label","Neutre")
        s_score = sentiment.get("score", 50)
        key_factors.append({
            "type": "sentiment",
            "text": f"🧠 Sentiment marché : {s_label} ({s_score:.0f}/100)",
            "positive": s_score > 50,
        })

    # Facteur SEKIDE — affiché si signal fort (ACHAT ou VENTE)
    sk_signal = sekide_result["signal"]
    if sk_signal in ("ACHAT", "ACCUMULER"):
        key_factors.append({
            "type": "sekide",
            "text": f"📊 SEKIDE : {sk_signal} — {pts_s}/6 pts survente (PCD/PER/PM/Technique)",
            "positive": True,
        })
    elif sk_signal in ("VENTE", "ALLÉGER"):
        key_factors.append({
            "type": "sekide",
            "text": f"📊 SEKIDE : {sk_signal} — {pts_a}/6 pts surachat (PCD/PER/PM/Technique)",
            "positive": False,
        })

    # ── Horizon & risque ──────────────────────────────────────────────────────
    horizon = "Court terme (1-3 mois)"
    if tech_result["data_points"] >= 200 and fund_score >= 60:
        horizon = "Court à moyen terme (1-6 mois)"
    if fund_score >= 70 and dy and dy >= 4:
        horizon = "Moyen à long terme (6-18 mois) — convient aux investisseurs revenus"

    volatility = derived.get("volatility") if derived else None
    if volatility:
        if   volatility < 15: risk_level = "Faible"
        elif volatility < 30: risk_level = "Modéré"
        elif volatility < 50: risk_level = "Élevé"
        else:                  risk_level = "Très élevé"
    else:
        risk_level = "N/D"

    # ── Résumé global ─────────────────────────────────────────────────────────
    action_map = {
        "ACHAT":    "Tous les indicateurs sont alignés positivement. Opportunité d'achat identifiée.",
        "ACCUMULER":"Les fondamentaux et le momentum sont favorables. Accumulation progressive recommandée.",
        "NEUTRE":   "Signaux mixtes. Attendre une confirmation directionnelle avant d'agir.",
        "ALLÉGER":  "Dégradation des indicateurs. Réduction progressive de la position conseillée.",
        "VENTE":    "Pression vendeuse dominante sur tous les axes. Sortie de position recommandée.",
    }

    # Score SEKIDE converti en 0-100 pour l'affichage dans les axes
    # pts_s / 6 * 100 → score "haussier" ; pts_a / 6 * 100 → score "baissier"
    # On affiche un score centré : 50 + (pts_s - pts_a) / 6 * 50
    sekide_display_score = round(50 + (pts_s - pts_a) / 6 * 50, 1)

    return {
        "recommendation": label,
        "score":          composite,
        "color":          cfg["color"],
        "bg":             cfg["bg"],
        "border":         cfg["border"],
        "icon":           cfg["icon"],
        "summary":        action_map[label],
        "horizon":        horizon,
        "risk_level":     risk_level,
        "key_factors":    key_factors,
        "axes": {
            "technique": {
                "score":   tech_score,
                "label":   _score_to_label(tech_score),
                "summary": tech_result["summary"],
                "details": tech_result["details"],
                "weight":  "40%",
            },
            "fondamentale": {
                "score":   fund_score,
                "label":   _score_to_label(fund_score),
                "summary": fund_result["summary"],
                "details": fund_result["details"],
                "weight":  "35%",
            },
            "psychologie": {
                "score":   psych_score,
                "label":   _score_to_label(psych_score),
                "summary": psych_result["summary"],
                "details": psych_result["details"],
                "weight":  "25%",
            },
            "sekide": {
                "score":         sekide_display_score,
                "label":         _score_to_label(sekide_display_score),
                "signal":        sekide_result["signal"],
                "conseil":       sekide_result["conseil"],
                "summary": (
                    f"{sekide_result['signal']} — "
                    f"{pts_s} pts survente / {pts_a} pts surachat / {sekide_result['points_neutre']} pts neutre"
                    f" | Ajustement composite : {sekide_delta:+.1f} pts"
                ),
                "details":       sekide_result["details"],
                "weight":        "ajustement ±8 pts",
                "prix_median_1an":  sekide_result["prix_median_1an"],
                "prix_median_2ans": sekide_result["prix_median_2ans"],
                "per_actualise":    sekide_result["per_actualise"],
                "pcd":              sekide_result["pcd"],
                "pcd_low":          sekide_result["pcd_low"],
                "pcd_high":         sekide_result["pcd_high"],
                "rendement_cible":  sekide_result["rendement_cible"],
                "points_survente":  pts_s,
                "points_surachat":  pts_a,
                "points_neutre":    sekide_result["points_neutre"],
            },
        },
        "sekide":      sekide_result,
        "data_points": tech_result["data_points"],
    }
