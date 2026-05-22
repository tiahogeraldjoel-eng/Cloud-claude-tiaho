"""
signal_engine.py — Moteur de scoring pré-ouverture BRVM
========================================================
Calcule pour chaque carnet :
  - MPR  : Market Pressure Ratio
  - OBI  : Order Book Imbalance
  - ICEBERG : détection d'ordre anormalement large
  - Décision d'alerte (booléen + justification textuelle)
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import List, Optional

from config import (
    ICEBERG_MULTIPLIER,
    MPR_ALERT_THRESHOLD,
    OBI_ALERT_THRESHOLD,
    SPREAD_TIGHT_MAX_PCT,
    TICKERS,
)
from order_book_scraper import OrderBook

logger = logging.getLogger(__name__)


# ─── Résultat d'analyse ───────────────────────────────────────────────────────

@dataclass
class SignalResult:
    """Résultat complet de l'analyse pour un titre."""
    ticker:            str
    name:              str
    ref_price:         float

    # Indicateurs calculés
    mpr:               float = 0.0   # Market Pressure Ratio
    obi:               float = 0.0   # Order Book Imbalance [-1, 1]
    spread_pct:        float = 0.0   # Spread en %
    best_bid_price:    float = 0.0
    best_ask_price:    float = 0.0
    total_bid_volume:  int   = 0
    total_ask_volume:  int   = 0
    best_bid_volume:   int   = 0
    avg_daily_volume:  int   = 0
    iceberg_detected:  bool  = False
    iceberg_ratio:     float = 0.0   # best_bid_vol / avg_daily_vol

    # Décision finale
    alert:             bool  = False
    alert_reasons:     List[str] = field(default_factory=list)
    theo_open_price:   float = 0.0   # Prix théorique d'ouverture estimé
    confidence:        str   = "LOW" # LOW | MEDIUM | HIGH

    # Métadonnées
    timestamp:         float = field(default_factory=time.time)
    source_url:        str   = ""
    data_quality:      str   = "LIVE"  # LIVE | SYNTHETIC

    def to_alert_payload(self) -> dict:
        """Payload JSON prêt à envoyer (FCM / Telegram / webhook)."""
        reasons_text = " | ".join(self.alert_reasons)
        return {
            "event":              "FLASH_BRVM_PREOPEN",
            "ticker":             self.ticker,
            "name":               self.name,
            "theo_open_price":    round(self.theo_open_price, 2),
            "ref_price":          self.ref_price,
            "buy_volume_anomaly": self.total_bid_volume,
            "best_bid_volume":    self.best_bid_volume,
            "avg_daily_volume":   self.avg_daily_volume,
            "iceberg_detected":   self.iceberg_detected,
            "mpr":                round(self.mpr, 3),
            "obi":                round(self.obi, 3),
            "spread_pct":         round(self.spread_pct, 3),
            "confidence":         self.confidence,
            "alert_reasons":      self.alert_reasons,
            "action_message": (
                "⚡ Pression Acheteuse Critique : Risque de réservation à la hausse. "
                f"Position recommandée avant 9h45 GMT. [{reasons_text}]"
            ),
            "timestamp_gmt":      time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.timestamp)),
            "source_url":         self.source_url,
            "data_quality":       self.data_quality,
        }


# ─── Calcul des indicateurs ───────────────────────────────────────────────────

def _compute_mpr(book: OrderBook) -> float:
    """
    Market Pressure Ratio = Σ(volumes achat) / Σ(volumes vente)
    Retourne 0.0 si le dénominateur est nul (pas de vendeurs — marché suspendu possible).
    """
    if book.total_ask_volume == 0:
        logger.debug("[%s] MPR : aucun volume vendeur — retourne 0", book.ticker)
        return 0.0
    return book.total_bid_volume / book.total_ask_volume


def _compute_obi(book: OrderBook) -> float:
    """
    Order Book Imbalance = (V_best_bid - V_best_ask) / (V_best_bid + V_best_ask)
    Résultat ∈ [-1, 1] : +1 = totalement acheteur, -1 = totalement vendeur.
    """
    if book.best_bid is None or book.best_ask is None:
        return 0.0
    vb = book.best_bid.volume
    va = book.best_ask.volume
    denom = vb + va
    if denom == 0:
        return 0.0
    return (vb - va) / denom


def _compute_iceberg(book: OrderBook, avg_daily_volume: int) -> tuple[bool, float]:
    """
    Détecte un potentiel ordre iceberg sur la meilleure limite acheteuse.
    Critère : volume_best_bid > ICEBERG_MULTIPLIER × avg_daily_volume.
    Retourne (détecté: bool, ratio: float).
    """
    if book.best_bid is None or avg_daily_volume == 0:
        return False, 0.0
    ratio = book.best_bid.volume / avg_daily_volume
    return ratio > ICEBERG_MULTIPLIER, ratio


def _estimate_theo_open(book: OrderBook, ref_price: float, mpr: float) -> float:
    """
    Estimation du prix théorique d'ouverture (fixing 9h45).
    Formule simplifiée : pondération entre mid-market et pression directionnelle.
    Dans le modèle de fixing BRVM, le prix d'équilibre tend vers le cours
    maximisant les échanges, ici approximé par le mid-market ajusté.
    """
    if book.best_bid is None or book.best_ask is None:
        return ref_price
    mid = (book.best_bid.price + book.best_ask.price) / 2
    # Correction directionnelle bornée à ±5% (limite BRVM)
    pressure_adj = min(0.05, max(-0.05, (mpr - 1.0) * 0.01))
    return round(mid * (1 + pressure_adj), 2)


def _assess_confidence(mpr: float, obi: float, iceberg: bool, spread_pct: float) -> str:
    score = 0
    if mpr > MPR_ALERT_THRESHOLD * 1.5:
        score += 2
    elif mpr > MPR_ALERT_THRESHOLD:
        score += 1
    if obi > OBI_ALERT_THRESHOLD:
        score += 2
    elif obi > 0.6:
        score += 1
    if iceberg:
        score += 1
    if spread_pct < SPREAD_TIGHT_MAX_PCT:
        score += 1
    if score >= 5:
        return "HIGH"
    if score >= 3:
        return "MEDIUM"
    return "LOW"


# ─── Point d'entrée public ────────────────────────────────────────────────────

def analyze(book: OrderBook) -> SignalResult:
    """
    Analyse complète d'un carnet d'ordres.
    Retourne un SignalResult avec les indicateurs calculés et la décision d'alerte.
    """
    meta = TICKERS.get(book.ticker, {})
    avg_daily  = meta.get("avg_daily_volume", 1000)
    ref_price  = meta.get("ref_price", 0.0)

    mpr            = _compute_mpr(book)
    obi            = _compute_obi(book)
    iceberg, ratio = _compute_iceberg(book, avg_daily)
    spread_pct     = book.spread_pct or 0.0
    theo_open      = _estimate_theo_open(book, ref_price, mpr)

    # ── Logique d'alerte ─────────────────────────────────────────────────────
    alert         = False
    alert_reasons = []

    if mpr > MPR_ALERT_THRESHOLD:
        alert = True
        alert_reasons.append(
            f"MPR={mpr:.2f} > seuil {MPR_ALERT_THRESHOLD} "
            f"(acheteurs {book.total_bid_volume} titres vs vendeurs {book.total_ask_volume})"
        )

    if obi >= OBI_ALERT_THRESHOLD and spread_pct <= SPREAD_TIGHT_MAX_PCT:
        alert = True
        alert_reasons.append(
            f"OBI={obi:.3f} ≈ 1 avec spread serré {spread_pct:.2f}% "
            f"(carnet quasi-monopole acheteur)"
        )

    if iceberg:
        # L'iceberg seul n'est pas suffisant pour déclencher l'alerte
        # mais l'ajoute comme motif additionnel si une autre condition est vraie
        if alert:
            alert_reasons.append(
                f"ICEBERG détecté : volume best-bid={book.best_bid.volume} titres "
                f"= {ratio:.1f}× le volume journalier moyen ({avg_daily})"
            )

    confidence = _assess_confidence(mpr, obi, iceberg, spread_pct) if alert else "LOW"

    result = SignalResult(
        ticker           = book.ticker,
        name             = meta.get("name", book.ticker),
        ref_price        = ref_price,
        mpr              = mpr,
        obi              = obi,
        spread_pct       = spread_pct,
        best_bid_price   = book.best_bid.price   if book.best_bid  else 0.0,
        best_ask_price   = book.best_ask.price   if book.best_ask  else 0.0,
        total_bid_volume = book.total_bid_volume,
        total_ask_volume = book.total_ask_volume,
        best_bid_volume  = book.best_bid.volume  if book.best_bid  else 0,
        avg_daily_volume = avg_daily,
        iceberg_detected = iceberg,
        iceberg_ratio    = ratio,
        alert            = alert,
        alert_reasons    = alert_reasons,
        theo_open_price  = theo_open,
        confidence       = confidence,
        timestamp        = book.timestamp,
        source_url       = book.source_url,
        data_quality     = "SYNTHETIC" if book.is_synthetic else "LIVE",
    )

    logger.info(
        "[%s] MPR=%.2f OBI=%.3f Spread=%.2f%% Iceberg=%s → ALERTE=%s (%s)",
        book.ticker, mpr, obi, spread_pct, iceberg, alert, confidence
    )
    return result
