"""
alert_dispatcher.py — Envoi des alertes FLASH BRVM
====================================================
Supporte trois backends (configurable via NOTIFICATION_BACKEND) :
  - "telegram"  → Telegram Bot API
  - "fcm"       → Firebase Cloud Messaging (Legacy HTTP v1)
  - "webhook"   → POST JSON générique
  - "all"       → Les trois en parallèle

Aucun envoi si aucune alerte n'est déclenchée.
"""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List

import requests

from config import (
    FCM_DEVICE_TOKEN,
    FCM_SERVER_KEY,
    GENERIC_WEBHOOK_URL,
    NOTIFICATION_BACKEND,
    REQUEST_TIMEOUT,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    USER_AGENTS,
)
from signal_engine import SignalResult

logger = logging.getLogger(__name__)

# Emojis de confidence pour le message Telegram
_CONFIDENCE_EMOJI = {"HIGH": "🔴", "MEDIUM": "🟠", "LOW": "🟡"}


# ─── Formatage Telegram ───────────────────────────────────────────────────────

def _format_telegram_message(signal: SignalResult) -> str:
    emoji = _CONFIDENCE_EMOJI.get(signal.confidence, "⚪")
    reasons = "\n".join(f"  • {r}" for r in signal.alert_reasons)
    iceberg_line = (
        f"\n🐋 *Ordre iceberg détecté* : {signal.best_bid_volume} titres "
        f"({signal.iceberg_ratio:.1f}× volume journalier)"
        if signal.iceberg_detected else ""
    )
    return (
        f"{emoji} *FLASH BRVM — Pré-Ouverture*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📌 *Titre* : {signal.ticker} ({signal.name})\n"
        f"⏰ *Heure* : {time.strftime('%H:%M GMT', time.gmtime(signal.timestamp))}\n"
        f"💰 *Prix théorique ouverture* : {signal.theo_open_price:,.0f} FCFA\n"
        f"📊 *Référence veille* : {signal.ref_price:,.0f} FCFA\n"
        f"──────────────────────\n"
        f"📈 *MPR* : {signal.mpr:.2f}  (seuil > 2.5)\n"
        f"⚖️ *OBI* : {signal.obi:.3f}  (seuil > 0.85)\n"
        f"↔️ *Spread* : {signal.spread_pct:.2f}%\n"
        f"🛒 *Vol. achat total* : {signal.total_bid_volume} titres\n"
        f"🛒 *Meilleur bid* : {signal.best_bid_price:,.0f} FCFA × {signal.best_bid_volume}\n"
        f"📉 *Vol. vente total* : {signal.total_ask_volume} titres"
        f"{iceberg_line}\n"
        f"──────────────────────\n"
        f"⚡ *Signal* : Pression Acheteuse Critique\n"
        f"🎯 *Action* : Position recommandée avant 9h45 GMT\n"
        f"──────────────────────\n"
        f"*Motifs* :\n{reasons}\n"
        f"──────────────────────\n"
        f"_Confiance : {signal.confidence} | Source : {'LIVE' if signal.data_quality == 'LIVE' else '⚠️ SYNTHÉTIQUE'}_"
    )


# ─── Backends d'envoi ─────────────────────────────────────────────────────────

def _send_telegram(signal: SignalResult) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.error("Telegram : BRVM_TELEGRAM_TOKEN ou BRVM_TELEGRAM_CHAT_ID non défini.")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id":    TELEGRAM_CHAT_ID,
        "text":       _format_telegram_message(signal),
        "parse_mode": "Markdown",
    }
    try:
        resp = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if data.get("ok"):
            logger.info("[%s] Alerte Telegram envoyée (message_id=%s)",
                        signal.ticker, data.get("result", {}).get("message_id"))
            return True
        logger.error("[%s] Telegram API error : %s", signal.ticker, data.get("description"))
        return False
    except Exception as e:
        logger.error("[%s] Telegram send error : %s", signal.ticker, str(e))
        return False


def _send_fcm(signal: SignalResult) -> bool:
    if not FCM_SERVER_KEY or not FCM_DEVICE_TOKEN:
        logger.error("FCM : BRVM_FCM_SERVER_KEY ou BRVM_FCM_DEVICE_TOKEN non défini.")
        return False

    payload_data = signal.to_alert_payload()
    fcm_body = {
        "to": FCM_DEVICE_TOKEN,
        "priority": "high",
        "notification": {
            "title": f"⚡ FLASH BRVM — {signal.ticker}",
            "body": (
                f"MPR={signal.mpr:.2f} | OBI={signal.obi:.3f} | "
                f"Ouverture théorique : {signal.theo_open_price:,.0f} FCFA"
            ),
            "sound": "default",
        },
        "data": {k: str(v) for k, v in payload_data.items()},
    }
    headers = {
        "Authorization": f"key={FCM_SERVER_KEY}",
        "Content-Type":  "application/json",
    }
    try:
        resp = requests.post(
            "https://fcm.googleapis.com/fcm/send",
            headers=headers,
            json=fcm_body,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        result = resp.json()
        if result.get("success") == 1:
            logger.info("[%s] Alerte FCM envoyée", signal.ticker)
            return True
        logger.error("[%s] FCM error : %s", signal.ticker, result.get("results"))
        return False
    except Exception as e:
        logger.error("[%s] FCM send error : %s", signal.ticker, str(e))
        return False


def _send_webhook(signal: SignalResult) -> bool:
    if not GENERIC_WEBHOOK_URL:
        logger.error("Webhook : BRVM_WEBHOOK_URL non défini.")
        return False

    payload = signal.to_alert_payload()
    headers = {
        "Content-Type": "application/json",
        "User-Agent":   "BRVM-Scanner/1.0",
    }
    try:
        resp = requests.post(
            GENERIC_WEBHOOK_URL,
            headers=headers,
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        logger.info("[%s] Alerte webhook envoyée → HTTP %d", signal.ticker, resp.status_code)
        return True
    except Exception as e:
        logger.error("[%s] Webhook send error : %s", signal.ticker, str(e))
        return False


# ─── Dispatching ─────────────────────────────────────────────────────────────

_BACKEND_MAP = {
    "telegram": _send_telegram,
    "fcm":      _send_fcm,
    "webhook":  _send_webhook,
}


def dispatch(signals: List[SignalResult]) -> None:
    """
    Envoie les alertes pour tous les signaux déclenchés.
    Pas d'envoi si aucun signal n'est en alerte.
    """
    triggered = [s for s in signals if s.alert]
    if not triggered:
        logger.info("Dispatch : aucun signal d'alerte — rien à envoyer.")
        return

    logger.info("Dispatch : %d alerte(s) à envoyer via backend=%s",
                len(triggered), NOTIFICATION_BACKEND)

    # Déterminer les backends actifs
    if NOTIFICATION_BACKEND == "all":
        active_backends = list(_BACKEND_MAP.values())
    else:
        fn = _BACKEND_MAP.get(NOTIFICATION_BACKEND)
        active_backends = [fn] if fn else []

    if not active_backends:
        logger.error("Dispatch : backend '%s' inconnu. Alertes non envoyées.", NOTIFICATION_BACKEND)
        return

    # Envoi parallèle pour ne pas bloquer
    with ThreadPoolExecutor(max_workers=min(len(triggered) * len(active_backends), 8)) as executor:
        futures = {
            executor.submit(backend_fn, signal): (signal.ticker, backend_fn.__name__)
            for signal in triggered
            for backend_fn in active_backends
        }
        for future in as_completed(futures):
            ticker, fn_name = futures[future]
            try:
                success = future.result()
                if not success:
                    logger.warning("[%s] Envoi via %s : ÉCHEC", ticker, fn_name)
            except Exception as e:
                logger.error("[%s] Erreur dispatch %s : %s", ticker, fn_name, str(e))
