#!/usr/bin/env python3
"""
BRVM Pre-Opening Signal Scanner
================================
Point d'entrée unique — déclenché par cron à 9h35 GMT les jours de cotation.

Déploiement cron (jours ouvrables UEMOA = lundi à vendredi) :
  35 9 * * 1-5  /usr/bin/python3 /opt/brvm_scanner/brvm_preopen_scanner.py

Logique de retry :
  - Tentative principale : 9h35 GMT
  - Si tous les carnets échouent : réévaluation à 9h38 GMT (une seule fois)
  - Après 9h38 : abandon propre, journalisation de l'incident

Le script ne boucle jamais — chaque appel est stateless.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

# ── Imports internes ──────────────────────────────────────────────────────────
from config import (
    LOG_FILE,
    LOG_LEVEL,
    RETRY_MINUTE_GMT,
    TICKERS,
    TRIGGER_HOUR_GMT,
    TRIGGER_MINUTE_GMT,
)
from order_book_scraper import OrderBook, fetch_order_book
from signal_engine import SignalResult, analyze
from alert_dispatcher import dispatch


# ─── Journalisation ───────────────────────────────────────────────────────────

def _setup_logging() -> logging.Logger:
    level = getattr(logging, LOG_LEVEL.upper(), logging.INFO)
    fmt   = "%(asctime)s.%(msecs)03d [%(levelname)s] %(name)s — %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        handlers.append(logging.FileHandler(LOG_FILE, encoding="utf-8"))
    except OSError:
        pass  # Écriture console uniquement si le répertoire est inaccessible

    logging.basicConfig(level=level, format=fmt, datefmt=datefmt, handlers=handlers)
    return logging.getLogger("brvm_scanner")


logger = _setup_logging()


# ─── Vérification de fenêtre horaire ─────────────────────────────────────────

def _is_trading_day() -> bool:
    """Vérifie que nous sommes un jour de cotation BRVM (lundi-vendredi)."""
    day = datetime.now(timezone.utc).weekday()  # 0=Lundi, 6=Dimanche
    return day < 5  # < 5 = lundi à vendredi


def _current_gmt_minute() -> int:
    """Retourne le nombre de minutes depuis minuit GMT."""
    now = datetime.now(timezone.utc)
    return now.hour * 60 + now.minute


def _wait_until_minute(target_hour: int, target_minute: int) -> None:
    """
    Si appelé avant l'heure cible, attend jusqu'à cette heure.
    Permet d'appeler le script un peu tôt (ex : 9h34) et d'attendre 9h35.
    Ne fait rien si l'heure cible est déjà passée.
    """
    now = datetime.now(timezone.utc)
    target_secs = target_hour * 3600 + target_minute * 60
    current_secs = now.hour * 3600 + now.minute * 60 + now.second
    wait = target_secs - current_secs
    if 0 < wait <= 120:  # Attente max 2 minutes (sécurité)
        logger.info("Attente %ds avant le snapshot (cible : %02dh%02d GMT)", wait, target_hour, target_minute)
        time.sleep(wait)


# ─── Coeur de la collecte ─────────────────────────────────────────────────────

def _collect_order_books(tickers: List[str]) -> Dict[str, Optional[OrderBook]]:
    """
    Aspire le carnet d'ordres pour chaque ticker.
    Retourne un dict {ticker: OrderBook | None}.
    """
    books: Dict[str, Optional[OrderBook]] = {}
    for ticker in tickers:
        logger.info("── Collecte carnet : %s ──", ticker)
        books[ticker] = fetch_order_book(ticker)
        # Micro-pause entre valeurs pour éviter les rate-limiters
        time.sleep(0.8)
    return books


def _analyze_books(books: Dict[str, Optional[OrderBook]]) -> Tuple[List[SignalResult], List[str]]:
    """
    Analyse chaque carnet disponible.
    Retourne (liste des résultats analysés, liste des tickers sans données).
    """
    results: List[SignalResult] = []
    missing: List[str] = []

    for ticker, book in books.items():
        if book is None:
            logger.warning("[%s] Carnet indisponible — exclu de l'analyse", ticker)
            missing.append(ticker)
            continue
        result = analyze(book)
        results.append(result)

    return results, missing


# ─── Rapport de session ───────────────────────────────────────────────────────

def _log_session_report(results: List[SignalResult], missing: List[str], attempt: int) -> None:
    """Résumé lisible en fin de run pour le journal de bord."""
    logger.info("═" * 60)
    logger.info("RAPPORT PRÉ-OUVERTURE BRVM — %s GMT | Tentative %d",
                datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"), attempt)
    logger.info("═" * 60)

    alerts = [r for r in results if r.alert]
    calm   = [r for r in results if not r.alert]

    for r in results:
        status = f"⚡ ALERTE ({r.confidence})" if r.alert else "✔ Calme"
        logger.info(
            "  %-6s | MPR=%-5.2f | OBI=%-6.3f | Spread=%-5.2f%% | "
            "BidVol=%-6d | AskVol=%-6d | %s",
            r.ticker, r.mpr, r.obi, r.spread_pct,
            r.total_bid_volume, r.total_ask_volume, status
        )

    if missing:
        logger.warning("  Données manquantes : %s", ", ".join(missing))

    logger.info("─" * 60)
    logger.info("Total analysé : %d | Alertes : %d | Manquants : %d",
                len(results), len(alerts), len(missing))
    logger.info("═" * 60)


# ─── Orchestration principale ─────────────────────────────────────────────────

def run(force_retry: bool = False) -> int:
    """
    Logique principale.
    - force_retry=True : on est à 9h38, c'est la deuxième tentative.
    Retourne le nombre d'alertes envoyées (0 si calme).
    """
    attempt = 2 if force_retry else 1
    logger.info("┌─ BRVM Pre-Opening Scanner démarré — tentative %d/%d ─┐", attempt, 2)

    if not _is_trading_day():
        logger.info("Aujourd'hui n'est pas un jour de cotation BRVM. Fin.")
        return 0

    tickers = list(TICKERS.keys())
    logger.info("Valeurs cibles : %s", ", ".join(tickers))

    books = _collect_order_books(tickers)

    # Vérifier si on a eu assez de données
    successful = sum(1 for b in books.values() if b is not None)
    logger.info("Carnets récupérés : %d/%d", successful, len(tickers))

    if successful == 0 and not force_retry:
        logger.warning("Aucun carnet disponible à 9h35. Tentative de retry à 9h38 programmée.")
        return -1  # Signal au wrapper pour programmer le retry

    results, missing = _analyze_books(books)
    _log_session_report(results, missing, attempt)

    alerts = [r for r in results if r.alert]
    if alerts:
        logger.info("🚨 %d signal(s) d'alerte détecté(s) — dispatch notifications...", len(alerts))
        dispatch(results)
    else:
        logger.info("Marché calme — aucune notification envoyée.")

    logger.info("└─ BRVM Pre-Opening Scanner terminé ─┘")
    return len(alerts)


def main() -> None:
    """
    Point d'entrée cron.
    Gère la fenêtre horaire et la logique de retry 9h35 → 9h38.
    """
    # Si le script est lancé avant 9h35 (ex : 9h34 par marge cron), attendre
    _wait_until_minute(TRIGGER_HOUR_GMT, TRIGGER_MINUTE_GMT)

    logger.info("▶ Snapshot principal 9h35 GMT")
    result = run(force_retry=False)

    if result == -1:
        # Aucune donnée à 9h35 → attendre 9h38 et retenter une seule fois
        now_mins = _current_gmt_minute()
        retry_mins = RETRY_MINUTE_GMT + TRIGGER_HOUR_GMT * 60
        wait_secs = max(0, (retry_mins - now_mins) * 60)

        if wait_secs > 0:
            logger.info("⏳ Attente %ds avant retry 9h38 GMT...", wait_secs)
            time.sleep(wait_secs)

        logger.info("▶ Snapshot retry 9h38 GMT")
        result = run(force_retry=True)

        if result == -1 or result == 0:
            logger.error(
                "❌ Données indisponibles après retry 9h38. "
                "Abandon pour aujourd'hui. Vérifier la connectivité réseau ou les sources BRVM."
            )
            sys.exit(1)

    logger.info("✅ Session pré-ouverture BRVM terminée. %d alerte(s) envoyée(s).",
                max(result, 0))
    sys.exit(0)


if __name__ == "__main__":
    main()
