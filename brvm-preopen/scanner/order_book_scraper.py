"""
order_book_scraper.py — Aspiration du carnet d'ordres BRVM
===========================================================
Stratégie :
  1. Tenter chaque source de BRVM_SOURCES dans l'ordre.
  2. Parser les tables HTML bid/ask (3 à 5 niveaux).
  3. En cas d'échec total, retourner None (pas de fallback silencieux).

Pas de boucle — appelé une seule fois par le script principal.
"""

from __future__ import annotations

import hashlib
import logging
import random
import re
import time
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

from config import (
    BRVM_SOURCES,
    ORDER_BOOK_DEPTH,
    REQUEST_TIMEOUT,
    USER_AGENTS,
)

logger = logging.getLogger(__name__)


# ─── Structures de données ────────────────────────────────────────────────────

@dataclass
class OrderLevel:
    """Un niveau du carnet : prix + volume."""
    price:  float
    volume: int

    @property
    def value(self) -> float:
        return self.price * self.volume


@dataclass
class OrderBook:
    """Snapshot complet du carnet pour un titre."""
    ticker:     str
    timestamp:  float
    bids:       List[OrderLevel] = field(default_factory=list)  # acheteurs, meilleur en tête
    asks:       List[OrderLevel] = field(default_factory=list)  # vendeurs, meilleur en tête
    source_url: str = ""
    is_synthetic: bool = False  # True si données simulées

    @property
    def best_bid(self) -> Optional[OrderLevel]:
        return self.bids[0] if self.bids else None

    @property
    def best_ask(self) -> Optional[OrderLevel]:
        return self.asks[0] if self.asks else None

    @property
    def spread(self) -> Optional[float]:
        if self.best_bid and self.best_ask:
            return self.best_ask.price - self.best_bid.price
        return None

    @property
    def spread_pct(self) -> Optional[float]:
        if self.best_bid and self.best_ask and self.best_bid.price > 0:
            mid = (self.best_bid.price + self.best_ask.price) / 2
            return (self.spread / mid) * 100
        return None

    @property
    def total_bid_volume(self) -> int:
        return sum(l.volume for l in self.bids)

    @property
    def total_ask_volume(self) -> int:
        return sum(l.volume for l in self.asks)


# ─── Construction des headers HTTP réalistes ─────────────────────────────────

def _build_headers(ticker: str) -> dict:
    """Headers imitant un navigateur standard pour éviter les filtres WAF."""
    ua = random.choice(USER_AGENTS)
    # Accept-Language cohérent avec Afrique de l'Ouest francophone
    return {
        "User-Agent":      ua,
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.4,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection":      "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest":  "document",
        "Sec-Fetch-Mode":  "navigate",
        "Sec-Fetch-Site":  "none",
        "DNT":             "1",
        # Referer neutre plausible
        "Referer":         "https://www.brvm.org/fr/cours-des-actions/0/all",
    }


# ─── Parser HTML générique ────────────────────────────────────────────────────

def _parse_order_book_html(html: str, ticker: str) -> Optional[OrderBook]:
    """
    Parse les tableaux HTML du carnet d'ordres BRVM.
    Cherche des tables avec colonnes Prix/Quantité côté Achat et Vente.
    Retourne None si le parsing est non concluant (< 1 niveau de chaque côté).
    """
    soup = BeautifulSoup(html, "html.parser")
    bids: List[OrderLevel] = []
    asks: List[OrderLevel] = []

    # ── Stratégie 1 : classes CSS spécifiques BRVM ───────────────────────────
    # La BRVM utilise typiquement des classes "achat"/"acheteur" et "vente"/"vendeur"
    bid_selectors = ["table.acheteur", "table.achat", "table[id*='bid']", "table[id*='achat']"]
    ask_selectors = ["table.vendeur",  "table.vente",  "table[id*='ask']",  "table[id*='vente']"]

    for sel in bid_selectors:
        table = soup.select_one(sel)
        if table:
            bids = _extract_levels_from_table(table, ORDER_BOOK_DEPTH)
            if bids:
                break

    for sel in ask_selectors:
        table = soup.select_one(sel)
        if table:
            asks = _extract_levels_from_table(table, ORDER_BOOK_DEPTH)
            if asks:
                break

    # ── Stratégie 2 : repérer toutes les tables, identifier bid/ask ──────────
    if not bids and not asks:
        tables = soup.find_all("table")
        candidate_tables = []
        for t in tables:
            rows = t.find_all("tr")
            if len(rows) >= 2:
                candidate_tables.append(t)

        # Heuristique : chercher headers contenant "achat"/"acheteur" ou "vente"/"vendeur"
        for table in candidate_tables:
            headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
            header_text = " ".join(headers)
            if any(k in header_text for k in ("achat", "acheteur", "buy", "bid")):
                bids = _extract_levels_from_table(table, ORDER_BOOK_DEPTH)
            elif any(k in header_text for k in ("vente", "vendeur", "sell", "ask")):
                asks = _extract_levels_from_table(table, ORDER_BOOK_DEPTH)

    # ── Stratégie 3 : pattern prix/quantité dans le texte brut ───────────────
    if not bids and not asks:
        bids, asks = _extract_levels_from_text(html, ORDER_BOOK_DEPTH)

    if not bids or not asks:
        logger.debug("[%s] Parser HTML : carnet incomplet — bids=%d asks=%d",
                     ticker, len(bids), len(asks))
        return None

    return OrderBook(
        ticker=ticker,
        timestamp=time.time(),
        bids=bids[:ORDER_BOOK_DEPTH],
        asks=asks[:ORDER_BOOK_DEPTH],
    )


def _extract_levels_from_table(table, depth: int) -> List[OrderLevel]:
    """Extrait les niveaux prix/volume d'une table HTML."""
    levels: List[OrderLevel] = []
    for row in table.find_all("tr")[1:depth + 2]:  # ignorer header
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        nums = []
        for cell in cells:
            raw = re.sub(r"[^\d,.\s]", "", cell.get_text(strip=True))
            raw = raw.replace(",", ".").replace(" ", "")
            try:
                nums.append(float(raw))
            except ValueError:
                pass
        # Chercher deux nombres : prix (> 1, float) et volume (entier-like)
        floats = [n for n in nums if n > 0]
        if len(floats) >= 2:
            price  = floats[0]
            volume = int(floats[1])
            if price > 0 and volume > 0:
                levels.append(OrderLevel(price=price, volume=volume))
    return levels


def _extract_levels_from_text(html: str, depth: int) -> Tuple[List[OrderLevel], List[OrderLevel]]:
    """
    Fallback : cherche des patterns "prix quantité" dans le texte HTML brut.
    Retourne (bids, asks) vides si rien de concluant.
    """
    bids, asks = [], []
    # Pattern : nombre > 100 suivi d'un entier — indicatif d'un carnet FCFA
    pattern = re.compile(r"(\d[\d\s]{2,10})\s*(?:FCFA|XOF|F CFA)?\s*[\|;,\t]\s*(\d+)")
    for i, m in enumerate(pattern.finditer(html)):
        try:
            price  = float(m.group(1).replace(" ", ""))
            volume = int(m.group(2))
            if price > 10 and volume > 0:
                level = OrderLevel(price=price, volume=volume)
                if i % 2 == 0:
                    bids.append(level)
                else:
                    asks.append(level)
        except ValueError:
            pass
    return bids[:depth], asks[:depth]


# ─── Requête HTTP avec retry interne ─────────────────────────────────────────

def _fetch_url(url: str, ticker: str) -> Optional[str]:
    """
    Effectue une requête GET unique.
    Retourne le HTML ou None (pas de retry — géré par l'appelant).
    """
    headers = _build_headers(ticker)
    try:
        session = requests.Session()
        session.headers.update(headers)
        # Délai humain aléatoire (1–3 s) pour ne pas déclencher les rate-limiters
        time.sleep(random.uniform(1.0, 3.0))
        resp = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        logger.info("[%s] HTTP %d — %s", ticker, resp.status_code, url)
        return resp.text
    except requests.exceptions.HTTPError as e:
        logger.warning("[%s] HTTP Error %s — %s", ticker, e.response.status_code if e.response else "?", url)
    except requests.exceptions.ConnectionError:
        logger.warning("[%s] Connexion impossible — %s", ticker, url)
    except requests.exceptions.Timeout:
        logger.warning("[%s] Timeout (%ds) — %s", ticker, REQUEST_TIMEOUT, url)
    except Exception as e:
        logger.warning("[%s] Erreur inattendue : %s", ticker, str(e))
    return None


# ─── Point d'entrée public ────────────────────────────────────────────────────

def fetch_order_book(ticker: str) -> Optional[OrderBook]:
    """
    Tente d'aspirer le carnet d'ordres pour `ticker` en parcourant
    BRVM_SOURCES dans l'ordre. Retourne None si toutes les sources échouent.
    """
    for source_template in BRVM_SOURCES:
        url = source_template.format(ticker=ticker.lower())
        logger.debug("[%s] Tentative source : %s", ticker, url)

        html = _fetch_url(url, ticker)
        if html is None:
            continue

        book = _parse_order_book_html(html, ticker)
        if book is not None:
            book.source_url = url
            logger.info("[%s] Carnet récupéré depuis %s | bids=%d asks=%d",
                        ticker, url, len(book.bids), len(book.asks))
            return book

        logger.debug("[%s] HTML obtenu mais parsing insuffisant — tentative source suivante", ticker)

    logger.error("[%s] Toutes les sources ont échoué. Carnet indisponible.", ticker)
    return None
