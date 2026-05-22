"""
Configuration centralisée — BRVM Pre-Opening Scanner
=====================================================
Modifier ce fichier avant déploiement :
  - NOTIFICATION_BACKEND : "telegram" | "fcm" | "webhook"
  - Renseigner les tokens dans les variables d'environnement (jamais en clair ici)
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List

# ─── Valeurs cibles (les plus liquides BRVM) ──────────────────────────────────
# avg_daily_volume : volume moyen journalier historique en titres
# ref_price        : dernier cours de référence connu en FCFA
TICKERS: Dict[str, dict] = {
    "SNTS": {"name": "Sonatel",              "avg_daily_volume": 890,   "ref_price": 15500},
    "CBBF": {"name": "Coris Bank BF",        "avg_daily_volume": 520,   "ref_price": 8750},
    "STBC": {"name": "Société Générale BF",  "avg_daily_volume": 340,   "ref_price": 5300},
    "ONAT": {"name": "Onatel BF",            "avg_daily_volume": 310,   "ref_price": 4950},
    "TTLC": {"name": "Total CI",             "avg_daily_volume": 3400,  "ref_price": 1875},
    "ETIT": {"name": "Ecobank Transnational","avg_daily_volume": 48000, "ref_price": 22},
    "SGBC": {"name": "SGB CI",               "avg_daily_volume": 290,   "ref_price": 18200},
    "ORAC": {"name": "Orange CI",            "avg_daily_volume": 5400,  "ref_price": 14750},
}

# ─── Seuils d'alerte ──────────────────────────────────────────────────────────
MPR_ALERT_THRESHOLD   = 2.5    # Market Pressure Ratio → signal haussier fort
OBI_ALERT_THRESHOLD   = 0.85   # Order Book Imbalance  → quasi-monopole acheteur
ICEBERG_MULTIPLIER    = 3.0    # volume_best_bid > N × avg_daily = ordre iceberg
SPREAD_TIGHT_MAX_PCT  = 0.5    # spread ≤ 0.5% = spread serré (contexte OBI)

# ─── Fenêtre horaire (GMT) ────────────────────────────────────────────────────
TRIGGER_HOUR_GMT   = 9
TRIGGER_MINUTE_GMT = 35
RETRY_MINUTE_GMT   = 38   # Une seule réévaluation, puis abandon

# ─── Profondeur du carnet d'ordres ───────────────────────────────────────────
ORDER_BOOK_DEPTH = 5  # Meilleures limites à aspirer (bid + ask)

# ─── Sources de données (priorité décroissante) ───────────────────────────────
BRVM_SOURCES: List[str] = [
    "https://www.brvm.org/fr/negociation/carnet-des-ordres/{ticker}",
    "https://www.brvm.org/fr/cours-des-actions/0/{ticker}",
    "https://sikafinance.com/marches/carnet/{ticker}",
]

# Timeout réseau par requête (secondes)
REQUEST_TIMEOUT = 12

# ─── User-Agents réalistes (rotation anti-blocage) ───────────────────────────
USER_AGENTS: List[str] = [
    # Chrome 124 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Firefox 125 Linux
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Safari 17 macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    # Edge 124 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    # Chrome 123 Android
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
    # Firefox 124 macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0",
    # Opera 109
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0",
    # Chrome 124 Ubuntu
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

# ─── Notification backend ─────────────────────────────────────────────────────
# Valeurs : "telegram" | "fcm" | "webhook" | "all"
NOTIFICATION_BACKEND: str = os.getenv("BRVM_NOTIF_BACKEND", "telegram")

# Telegram — renseigner via variables d'environnement (jamais en dur)
TELEGRAM_BOT_TOKEN: str = os.getenv("BRVM_TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID:   str = os.getenv("BRVM_TELEGRAM_CHAT_ID", "")

# Firebase Cloud Messaging (server key legacy ou v1 OAuth2)
FCM_SERVER_KEY:     str = os.getenv("BRVM_FCM_SERVER_KEY", "")
FCM_DEVICE_TOKEN:   str = os.getenv("BRVM_FCM_DEVICE_TOKEN", "")

# Webhook générique (POST JSON)
GENERIC_WEBHOOK_URL: str = os.getenv("BRVM_WEBHOOK_URL", "")

# ─── Journalisation ───────────────────────────────────────────────────────────
LOG_FILE = os.path.join(os.path.dirname(__file__), "brvm_scanner.log")
LOG_LEVEL = "INFO"  # DEBUG | INFO | WARNING | ERROR
