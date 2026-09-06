"""
BRVM Analytics — Backend FastAPI
Routes: /api/stocks, /api/market, /api/recommendation, /api/sentiment
Planificateur APScheduler : mise à jour toutes les heures en semaine.
"""
import logging, os, smtplib, socket, statistics, threading, time
from datetime import datetime, timezone, timedelta, date as _date
from pathlib import Path
from typing import Dict, List, Optional

from email.message import EmailMessage
from io import BytesIO

import requests

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database as db
import scraper
import indicators as ind
import recommender as rec
import portfolio as ptf

try:
    import pdf_report as pdf_gen
    _PDF_AVAILABLE = True
except BaseException:
    pdf_gen = None
    _PDF_AVAILABLE = False
    logging.getLogger(__name__).warning("pdf_report indisponible (dépendance manquante) — export PDF désactivé")

# ─── Fiscalité dividendes BRVM ────────────────────────────────────────────────
# Taux effectifs de retenue sur dividendes par pays UEMOA
# (IRVM + contributions obligatoires, calibré sur données de marché réelles)
# Source utilisateur : TTLC CI gross=196 FCFA → net=139.77 FCFA → taux ≈ 28.7%
_COUNTRY_NET_DIV_FACTOR: Dict[str, float] = {
    "Côte d'Ivoire": 0.713,   # IRVM 15% + prélèvements CI ≈ 28.7% effectif
    "Sénégal":       0.850,   # IRVM 10% + contributions ≈ 15%
    "Burkina Faso":  0.875,   # IRVM 12.5%
    "Mali":          0.850,   # IRVM 15%
    "Bénin":         0.850,   # IRVM 15%
    "Niger":         0.850,   # IRVM 15%
    "Togo":          0.850,   # IRVM 15%
    "Guinée-Bissau": 0.850,   # IRVM 15%
}
_DEFAULT_NET_DIV_FACTOR = 0.85

def _net_div_factor(country: Optional[str]) -> float:
    """Retourne le facteur net dividende selon le pays d'émission."""
    if not country:
        return _DEFAULT_NET_DIV_FACTOR
    return _COUNTRY_NET_DIV_FACTOR.get(country, _DEFAULT_NET_DIV_FACTOR)

def _apply_net_dividend(fund: Optional[Dict], country: Optional[str]) -> Optional[Dict]:
    """
    Enrichit un dict de fondamentaux avec les rendements et dividendes nets.

    Notion de dividende annoncé BRVM :
    ─────────────────────────────────
    Un dividende est dit "annoncé" quand la société le décide en AGO pour l'exercice
    fiscal écoulé (typiquement avril–juin N pour l'exercice N-1).
    Exemple courant : dividende de l'exercice 2025 annoncé à l'AGO d'avril 2026.

    Il devient "officiel" quand il est publié au Bulletin Officiel de la Cote (BOC) BRVM.

    RÈGLE D'ANCIENNETÉ :
    • div_exercice_year >= current_year - 1  → statut valide ('annoncé' ou 'officiel')
    • div_exercice_year < current_year - 1   → dividende d'un exercice antérieur déjà payé ;
                                               on réinitialise le statut à 'historique'
    • div_exercice_year absent (None)        → données existantes pré-pipeline ; on conserve
                                               le statut mais on signale l'exercice inconnu
    """
    if not fund:
        return fund
    f = dict(fund)
    factor = _net_div_factor(country)
    gross_yield = f.get("dividend_yield")
    gross_dps   = f.get("dividend_per_share")
    f["net_dividend_factor"]    = round(factor, 4)
    f["dividend_yield_gross"]   = gross_yield
    f["dividend_yield_net"]     = round(gross_yield * factor, 2) if gross_yield is not None else None
    f["dividend_per_share_net"] = round(gross_dps  * factor, 2) if gross_dps  is not None else None
    f["irvm_rate_pct"]          = round((1 - factor) * 100, 1)

    # ── Pipeline dividende : exercice fiscal et statut ────────────────────────
    current_year     = datetime.now().year          # 2026
    recent_exercice  = current_year - 1             # 2025 = dernier exercice clos
    exercice_year    = f.get("div_exercice_year")   # None si ancien enregistrement
    raw_status       = f.get("div_status") or "aucun"

    # Règle d'ancienneté : un dividende déjà payé (exercice < N-1) ne doit pas
    # apparaître comme "annoncé" dans le pipeline courant
    if exercice_year is not None and exercice_year < recent_exercice and raw_status != "manuel":
        # Dividende d'un exercice antérieur (ex. 2024 ou avant) — déjà distribué
        effective_status = "historique"
    elif raw_status in ("annoncé", "officiel", "manuel", "sans_dividende"):
        # Si la date de mise en paiement est passée → basculer en 'payé'
        # Le montant reste utilisable comme estimateur du prochain dividende (Gordon-Shapiro, PCD)
        # mais l'affichage doit informer que ce dividende ne sera pas encaissable par un acheteur aujourd'hui
        payment_date = f.get("div_payment_date")
        if (raw_status == "officiel" and payment_date
                and payment_date <= _date.today().isoformat()):
            effective_status = "payé"
        else:
            effective_status = raw_status
    else:
        effective_status = "aucun"

    f["div_status"]        = effective_status
    f["div_exercice_year"] = exercice_year
    f["div_payment_date"]  = f.get("div_payment_date")

    # Libellé humain de l'exercice
    if exercice_year:
        f["div_exercice_label"] = f"Exercice {exercice_year}"
    elif effective_status in ("annoncé", "officiel"):
        f["div_exercice_label"] = f"Exercice {recent_exercice} (estimé)"
    else:
        f["div_exercice_label"] = None

    return f

# ─── Dividendes 2025 — données définitives (source : sikafinance.com) ─────────
#
# Source : https://www.sikafinance.com/marches/dividendes  (consulté avril 2026)
# Exercice fiscal : 2025 (dividendes décidés aux AGOs de 2026)
# Montants : NET (après retenue IRVM/prélèvement fiscal UEMOA)
# Statuts  :
#   'officiel' = date de mise en paiement confirmée (publiée au BOC ou annoncée)
#   'annoncé'  = dividende voté en AGO mais date de paiement non encore fixée
#
# Règle de conversion NET → BRUT (pour stockage DB) :
#   GROSS_DPS = NET_DPS / country_factor
#   GROSS_YIELD = NET_YIELD_PCT / country_factor
# où country_factor = _COUNTRY_NET_DIV_FACTOR[country]
# ──────────────────────────────────────────────────────────────────────────────
_DIVIDENDS_2025: list = [
    # ── Avec date de paiement confirmée → 'officiel' ─────────────────────────
    # symbol    net_dps   net_yield  payment_date   country        factor
    ("BOABF",   397.00,   7.05,      "2026-04-22",  "Burkina Faso",  0.875),
    ("BOAC",    594.50,   6.91,      "2026-05-04",  "Côte d'Ivoire", 0.713),
    ("SNTS",   1740.00,   6.11,      "2026-05-22",  "Sénégal",       0.850),
    ("BOAS",    450.00,   6.62,      "2026-05-28",  "Sénégal",       0.850),
    ("BOAM",    305.04,   6.49,      "2026-06-01",  "Mali",          0.850),
    ("ONTBF",   145.32,   5.34,      "2026-06-12",  "Burkina Faso",  0.875),
    # ── Annoncés (AGO 2026), date de paiement non encore fixée → 'annoncé' ───
    # symbol    net_dps   net_yield  payment_date   country        factor
    ("ECOC",    781.00,   4.81,      None,          "Côte d'Ivoire", 0.713),
    ("SGBC",   2293.28,   6.95,      None,          "Côte d'Ivoire", 0.713),
    ("BOAB",    585.00,   7.33,      None,          "Bénin",         0.850),
    ("ETIT",      0.93,   3.58,      None,          "Togo",          0.850),
    ("CBIBF",   900.00,   5.36,      None,          "Burkina Faso",  0.875),
    ("TTLC",    139.77,   5.00,      None,          "Côte d'Ivoire", 0.713),
    ("PALC",    441.76,   5.45,      None,          "Côte d'Ivoire", 0.713),
    ("SPHC",    430.32,   5.89,      None,          "Côte d'Ivoire", 0.713),
    ("ORAC",    704.00,   4.79,      None,          "Côte d'Ivoire", 0.713),
    # Note : SICC = SICABLE Côte d'Ivoire — pas CABC (confusion dans le scrape sikafinance)
    ("SICC",    152.02,   4.00,      None,          "Côte d'Ivoire", 0.713),
]


def seed_dividends_2025() -> None:
    """
    Charge définitivement les dividendes 2025 (annoncés aux AGOs de 2026) dans la DB.

    Toutes les valeurs proviennent de sikafinance.com/marches/dividendes (avril 2026).
    Les montants sikafinance sont en NET → on stocke le BRUT (= NET / factor) car
    _apply_net_dividend() recalcule le NET à la volée depuis le BRUT.

    Cette fonction utilise force_upsert_dividend() qui ÉCRASE les colonnes dividende
    sans COALESCE — elle prime donc sur les données d'un précédent scraper.
    """
    exercice_year = 2026 - 1  # 2025 : exercice fiscal dont les dividendes sont distribués

    seeded = []
    skipped = []

    for sym, net_dps, net_yield_pct, payment_date, country, factor in _DIVIDENDS_2025:
        # Vérifier que le titre existe en DB (seed stocks) avant d'insérer les fondamentaux
        stock = db.get_stock(sym)
        if not stock:
            skipped.append(sym)
            logger.warning(f"seed_dividends_2025: titre {sym} non trouvé en DB — ignoré")
            continue

        # GROSS DPS = NET DPS / factor  (DB stocke le brut, _apply_net_dividend() calcule le net)
        gross_dps = round(net_dps / factor, 2)

        # GROSS YIELD : priorité au prix DB courant ; fallback = yield sikafinance / factor
        latest = db.get_latest_price(sym)
        if latest and latest.get("close") and latest["close"] > 0:
            gross_yield = round(gross_dps / latest["close"] * 100, 2)
        else:
            gross_yield = round(net_yield_pct / factor, 2)

        # Statut selon disponibilité de la date de paiement
        div_status = "officiel" if payment_date else "annoncé"

        db.force_upsert_dividend({
            "symbol":              sym,
            "dividend_per_share":  gross_dps,
            "dividend_yield":      gross_yield,
            "div_status":          div_status,
            "div_payment_date":    payment_date,
            "div_exercice_year":   exercice_year,
        })
        # Sauvegarder dans l'historique des dividendes (table dividend_history)
        net_yield_pct_val = round(net_yield_pct, 2)
        db.save_dividend_history({
            "symbol":       sym,
            "year":         exercice_year,
            "dps_gross":    gross_dps,
            "dps_net":      round(net_dps, 2),
            "yield_gross":  gross_yield,
            "yield_net":    net_yield_pct_val,
            "payment_date": payment_date,
            "status":       div_status,
        })
        seeded.append(sym)
        logger.info(
            f"  DIV 2025 [{div_status:8s}] {sym:6s} : "
            f"NET={net_dps:8.2f} FCFA  BRUT={gross_dps:8.2f} FCFA  "
            f"Rdt brut={gross_yield:.2f}%  Rdt net={net_yield_pct:.2f}%  "
            f"Paiement={payment_date or 'à fixer'}"
        )

    logger.info(
        f"seed_dividends_2025 terminé : {len(seeded)} titres chargés"
        + (f", {len(skipped)} ignorés ({', '.join(skipped)})" if skipped else "")
    )


# Valeurs comptables 2024 estimées via ROE sectoriel × EPS ou rapports annuels publiés.
# Sources : rapports annuels BRVM, sikafinance.com, SGI Africa, exercice 2023/2024.
_BOOK_VALUES_2024: list[tuple[str, float]] = [
    # (symbol, book_value_FCFA_par_action)
    # ── Banques / Finance ──────────────────────────────────────────────────────
    ("SGBC", 21_700),   # Société Générale BCI — capitaux propres ~120 Mrd / 5,5M actions
    ("CBIBF", 11_400),  # Coris Bank International BF
    ("BICC", 15_700),   # Banque Internationale pour le Commerce CI (BIC)
    ("BOAC", 6_700),    # Bank Of Africa CI
    ("BOAB", 4_840),    # Bank Of Africa Bénin
    ("BOABF", 4_380),   # Bank Of Africa Burkina Faso
    ("BOAM", 4_040),    # Bank Of Africa Mali
    ("BOAS", 6_080),    # Bank Of Africa Sénégal
    ("CABC", 2_430),    # Crédit Agricole Burkina (ex-BACB)
    ("SIBC", 4_630),    # SIB — Société Ivoirienne de Banque
    ("LNBB", 2_990),    # La Nationale de Banque Bénin
    ("BICB", 8_200),    # BIC Bénin
    ("BNBC", 3_100),    # Banque Nationale de Bénin
    # ── Télécoms ──────────────────────────────────────────────────────────────
    ("SNTS", 16_540),   # Sonatel (Orange Sénégal) — capitaux propres ~190 Mrd / 11,5M
    ("ORAC", 7_430),    # Orange CI
    ("ONTBF", 1_430),   # Onatel Burkina
    # ── Agriculture / Agro ────────────────────────────────────────────────────
    ("PALC", 10_040),   # PALM CI — palmier
    ("SOGC", 6_070),    # SOGB — caoutchouc
    # ── Industrie ─────────────────────────────────────────────────────────────
    ("SMBC", 9_300),    # SMB CI (savonnerie)
    ("STBC", 13_430),   # SITAB — tabac
    ("NTLC", 5_480),    # FILTISAC — matériaux
    # ── Distribution ──────────────────────────────────────────────────────────
    ("TTLC", 1_440),    # TOTAL CI
    ("TTLS", 2_190),    # TOTAL Sénégal
]


def seed_book_values_2024() -> None:
    """
    Charge les valeurs comptables (book_value) 2024 pour les titres majeurs de la BRVM.
    Utilise update_book_value() qui ÉCRASE la valeur existante (pas de COALESCE).
    Appelé au démarrage, avant _refresh_sika_fundamentals() qui tentera de les affiner.
    """
    seeded, skipped = [], []
    for sym, bv in _BOOK_VALUES_2024:
        stock = db.get_stock(sym)
        if not stock:
            skipped.append(sym)
            continue
        db.update_book_value(sym, bv)
        seeded.append(sym)
    logger.info(
        f"seed_book_values_2024 terminé : {len(seeded)} titres"
        + (f", {len(skipped)} ignorés ({', '.join(skipped)})" if skipped else "")
    )


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="BRVM Analytics",
    description="Aide à la décision — Analyse fondamentale, technique et psychologie du marché BRVM",
    version="2.0.0",
    docs_url="/docs",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

STATIC_DIR = Path(__file__).parent / "static"

_state = {
    "last_refresh": None,
    "is_refreshing": False,
    "refresh_count": 0,
    "history_loaded": False,
    "history_loading": False,
    "last_news_refresh": None,
    "last_news_count": None,
}

# Cache in-memory pour la série BRVM Composite (TTL 1 heure)
# Évite une requête DB sur chaque appel à /recommendation
_brvm_cache: Dict = {"data": None, "ts": None}


def _get_brvm_series() -> List:
    now = datetime.now(timezone.utc)
    if (_brvm_cache["data"] is None
            or _brvm_cache["ts"] is None
            or (now - _brvm_cache["ts"]).total_seconds() > 3600):
        _brvm_cache["data"] = db.get_brvm_composite_series(400)
        _brvm_cache["ts"]   = now
    return _brvm_cache["data"]

_sentiment_cache: Dict = {"data": None, "ts": 0.0}
_SENTIMENT_TTL = 5 * 60  # secondes — re-calcul toutes les 5 min max

_screener_cache: Dict = {"data": None, "ts": 0.0}
_SCREENER_TTL = 15 * 60  # secondes — re-calcul toutes les 15 min max


def _last_brvm_trading_day() -> str:
    """Retourne la date du dernier jour de bourse BRVM (lun-ven).
    Si la séance en cours n'est pas terminée (avant 15h00 UTC = clôture Abidjan),
    renvoie le jour précédent ouvré — évite de marquer comme périmé des données
    qui seraient correctes pour la dernière clôture.
    """
    now = datetime.now(timezone.utc)
    d   = now.date()
    # Séance non terminée : revenir au jour précédent
    if now.hour < 15:
        d -= timedelta(days=1)
    # Remonter jusqu'au dernier jour ouvré (lundi=0 … vendredi=4)
    while d.weekday() > 4:
        d -= timedelta(days=1)
    return d.isoformat()


# ─── STARTUP ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    logger.info("Initialisation DB...")
    db.init_db()
    # Charger les dividendes 2025 depuis sikafinance (données définitives, exercice 2025)
    logger.info("Chargement dividendes 2025 (sikafinance)...")
    seed_dividends_2025()
    # Valeurs comptables 2024 — données de base avant scraping sikafinance
    logger.info("Chargement valeurs comptables 2024...")
    seed_book_values_2024()
    # Charger cours du jour immédiatement
    t1 = threading.Thread(target=_refresh_data, daemon=True)
    t1.start()
    # Charger l'historique de tous les titres (10 ans), puis snapshot immédiat des recos
    t2 = threading.Thread(target=_load_history_then_snapshot, daemon=True)
    t2.start()
    _start_scheduler()


# ─── SCHEDULER ────────────────────────────────────────────────────────────────

def _load_history_then_snapshot():
    """Charge l'historique complet, scrape les fondamentaux sikafinance, seed l'historique
    des recommandations si vide, puis déclenche un snapshot immédiat.
    Appelé une seule fois au démarrage en background."""
    _load_all_history()
    _refresh_sika_fundamentals()
    _seed_recommendation_history_if_empty(days=90)
    _snapshot_all_recommendations()


def _refresh_sika_fundamentals():
    """Scrape sikafinance.com pour enrichir book_value, eps et net_income de chaque titre.
    Exécuté une fois au démarrage (après _load_all_history) et quotidiennement à 7h00 UTC.
    Politesse : 1 s entre chaque requête pour éviter de surcharger le serveur."""
    stocks = db.get_all_stocks()
    updated = 0
    for s in stocks:
        sym = s["symbol"]
        try:
            data = scraper.scrape_sika_company_data(sym)
            bv = data.get("book_value")
            eps = data.get("eps")
            ni  = data.get("net_income")
            if bv and bv > 0:
                db.update_book_value(sym, bv, eps=eps, net_income=ni)
                updated += 1
            time.sleep(1)
        except Exception as e:
            logger.warning(f"sika fundamentals {sym}: {e}")
    logger.info(f"Fondamentaux sikafinance: {updated}/{len(stocks)} titres mis à jour")
    # Invalider le cache screener pour refléter les nouvelles valeurs comptables
    _screener_stocks_cache["data"] = None


def _seed_recommendation_history_if_empty(days: int = 90) -> None:
    """Calcule et persiste l'historique des recommandations sur les N derniers jours ouvrés.
    Exécuté uniquement si la table recommendation_history a moins de 100 entrées (= base vide
    après redéploiement Render). Permet d'obtenir un track-record immédiat sans attendre
    que le cron 16h00 accumule progressivement les données."""
    total = db.count_recommendation_history_rows()
    if total > 100:
        logger.info(f"Historique recos déjà présent ({total} entrées) — seeding ignoré")
        return

    logger.info(f"Seeding historique des recommandations sur {days} jours ouvrés...")
    stocks      = db.get_all_stocks()
    sentiment   = _get_sentiment_data()
    brvm_series = _get_brvm_series()

    # Générer la liste des dates de trading passées (lun-ven)
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    past_dates: List[str] = []
    d = today - timedelta(days=1)
    while len(past_dates) < days:
        if d.weekday() < 5:
            past_dates.append(d.isoformat())
        d -= timedelta(days=1)
    past_dates.sort()  # ordre chronologique

    saved = 0
    for stock in stocks:
        sym = stock["symbol"]
        try:
            all_prices = db.get_prices(sym, 1000)
            if not all_prices:
                continue
            fund    = db.get_fundamental(sym)
            country = stock.get("country")

            for target_date in past_dates:
                slice_prices = [p for p in all_prices if p.get("date", "") <= target_date]
                if len(slice_prices) < 30:
                    continue
                latest  = slice_prices[-1]
                derived = ind.compute_derived_fundamental(slice_prices)
                hw_closes = [p["close"] for p in slice_prices[-252:] if p.get("close")]
                hw = {"high52w": max(hw_closes), "low52w": min(hw_closes)} if hw_closes else {}

                fund_net = _apply_net_dividend(fund, country)
                if fund_net and latest.get("close") and fund_net.get("book_value"):
                    bv = fund_net["book_value"]
                    if bv and bv > 0:
                        fund_net["pbr"] = round(latest["close"] / bv, 2)

                result = rec.compute_recommendation(
                    prices=slice_prices,
                    fundamentals=fund_net,
                    derived=derived,
                    hw=hw,
                    sentiment=sentiment,
                    latest=latest,
                    symbol=sym,
                    brvm_series=brvm_series,
                )
                db.save_recommendation_history(sym, target_date, result)
                saved += 1
        except Exception as e:
            logger.warning(f"Seed reco history {sym}: {e}")

    logger.info(f"Seeding historique recommandations : {saved} entrées créées pour {len(stocks)} titres")


def _snapshot_all_recommendations():
    """Calcule et persiste la recommandation du jour pour tous les titres (16h00 UTC).
    Construit l'historique de conviction — un enregistrement par titre par jour ouvré."""
    today = datetime.now(timezone.utc).date().isoformat()
    stocks = db.get_all_stocks()
    saved = 0
    sentiment = _get_sentiment_data()
    brvm_series = _get_brvm_series()
    for stock in stocks:
        sym = stock["symbol"]
        try:
            prices  = db.get_prices(sym, 730)
            if not prices:
                continue
            fund     = db.get_fundamental(sym)
            derived  = ind.compute_derived_fundamental(prices)
            hw       = db.get_52w_highlow(sym)
            latest   = db.get_latest_price(sym)
            country  = stock.get("country")
            fund_net = _apply_net_dividend(fund, country)
            if fund_net and latest and latest.get("close") and fund_net.get("book_value"):
                bv = fund_net["book_value"]
                if bv and bv > 0:
                    fund_net["pbr"] = round(latest["close"] / bv, 2)
            result = rec.compute_recommendation(
                prices=prices,
                fundamentals=fund_net,
                derived=derived,
                hw=hw,
                sentiment=sentiment,
                latest=latest,
                symbol=sym,
                brvm_series=brvm_series,
            )
            db.save_recommendation_history(sym, today, result)
            saved += 1
        except Exception as e:
            logger.warning(f"Snapshot reco {sym}: {e}")
    logger.info(f"Snapshot recommandations {today} : {saved}/{len(stocks)} titres enregistrés")
    # Invalider le cache screener pour que le prochain appel reflète les nouvelles recos
    _screener_stocks_cache["data"] = None


def _start_scheduler():
    """
    Calendrier de rafraîchissement BRVM (Abidjan = UTC+0, pas de DST) :

    Horaires officiels BRVM :
      - 08h30       : pré-séance
      - 09h00-09h45 : pré-ouverture (saisie des ordres)
      - 09h45       : fixing d'ouverture + début négociation continue
      - 09h45-15h00 : séance de négociation continue
      - 15h00       : clôture officielle

    Stratégie :
      • Toutes les 20 min de 8h30 à 15h30 → couvre pré-marché, séance et post-clôture
      • Trigger dédié à 09h50 (post-fixing ouverture) → capte les premiers prix
      • Trigger dédié à 15h10 (post-clôture) → capte les EOD officiels
      • Actualités toutes les 2h en semaine
    """
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        sch = BackgroundScheduler(timezone="UTC")

        # misfire_grace_time : si le service Render était en sommeil et rate un trigger,
        # ne pas le relancer si le délai dépasse la grace period.
        # coalesce=True : si plusieurs tirs ont été manqués, n'en effectuer qu'un seul.
        GRACE = 600   # 10 min — ignorer les tirs manqués depuis plus de 10 min

        # Rafraîchissement toutes les 20 min, 8h30 → 15h30 (lun-ven)
        sch.add_job(_refresh_data, CronTrigger(
            day_of_week="mon-fri",
            hour="8-15",
            minute="0,20,40"),
            id="every20min",
            misfire_grace_time=GRACE, coalesce=True)

        # Trigger post-fixing ouverture (09h50 UTC) — premiers prix officiels
        sch.add_job(_refresh_data, CronTrigger(
            day_of_week="mon-fri", hour="9", minute="50"),
            id="post_opening_fixing",
            misfire_grace_time=GRACE, coalesce=True)

        # Trigger post-clôture (15h10 UTC = 15h10 Abidjan) — EOD définitifs après clôture 15h00
        sch.add_job(_refresh_data, CronTrigger(
            day_of_week="mon-fri", hour="15", minute="10"),
            id="post_close",
            misfire_grace_time=GRACE, coalesce=True)

        # Actualités toutes les 2h
        sch.add_job(_refresh_news, CronTrigger(
            day_of_week="mon-fri", hour="*/2", minute="15"),
            id="news",
            misfire_grace_time=GRACE, coalesce=True)

        # Snapshot recommandations (16h00 UTC) — un enregistrement par titre par jour
        sch.add_job(_snapshot_all_recommendations, CronTrigger(
            day_of_week="mon-fri", hour="16", minute="0"),
            id="reco_snapshot",
            misfire_grace_time=GRACE, coalesce=True)

        # Rafraîchissement fondamentaux sikafinance (7h00 UTC, lun-ven) — book_value / EPS annuels
        sch.add_job(_refresh_sika_fundamentals, CronTrigger(
            day_of_week="mon-fri", hour="7", minute="0"),
            id="sika_fundamentals",
            misfire_grace_time=GRACE, coalesce=True)

        sch.start()
        logger.info("Planificateur démarré — rafraîchissement toutes les 20 min + triggers 09h50/15h10/16h00")
    except Exception as e:
        logger.warning(f"Planificateur non démarré: {e}")


# ─── COLLECTE DES DONNÉES ─────────────────────────────────────────────────────

def _refresh_data():
    if _state["is_refreshing"]:
        return
    _state["is_refreshing"] = True
    try:
        is_trading_day = datetime.now(timezone.utc).weekday() < 5  # 0=lundi … 4=vendredi
        result = scraper.fetch_all()
        stocks = result.get("stocks") or []
        saved_count = len(stocks)
        if not is_trading_day:
            # Marché fermé le week-end : les sources (afx, brvm.org...) ré-affichent
            # les cours de vendredi sous la date du jour — on les enregistre sous la
            # vraie date de clôture de vendredi (mise à jour de cette ligne), pour que
            # le site affiche les cours de vendredi soir pendant tout le week-end,
            # sans créer de fausse ligne "samedi/dimanche".
            last_session = _last_brvm_trading_day()
            for s in stocks:
                s["date"] = last_session
            if result.get("market"):
                result["market"]["date"] = last_session
            logger.info(f"Week-end : cours enregistrés sous la date de clôture {last_session}")
        _save_stocks(stocks)
        if result.get("market"):
            m = result["market"]
            for k in ["brvm_10", "total_value", "advances", "declines",
                       "unchanged", "total_volume"]:
                m.setdefault(k, None)
            db.upsert_market_data(m)
        news = result.get("news") or []
        if news:
            db.save_news(news)
        _state["last_news_refresh"] = datetime.now(timezone.utc).isoformat()
        _state["last_news_count"]   = len(news)
        _state["last_refresh"]  = datetime.now(timezone.utc).isoformat()
        _state["refresh_count"] += 1
        # Invalider le cache sentiment après chaque refresh
        _sentiment_cache["data"] = None
        logger.info(f"Données rafraîchies (#{_state['refresh_count']}) — {saved_count} cours reçus")
        _check_price_alerts()

        # Si le scraper n'a rien renvoyé un jour ouvré (marché fermé, source indispo)
        # et que les données en DB sont périmées (> 7 jours), lancer un rattrapage historique
        if saved_count == 0 and is_trading_day and not _state["history_loading"]:
            cutoff = _last_brvm_trading_day()
            rows = db.get_latest_prices_all()
            stale_symbols = [
                r["symbol"] for r in rows
                if not r.get("date") or r["date"] < cutoff
            ]
            if stale_symbols:
                logger.warning(f"{len(stale_symbols)} titres périmés détectés — rattrapage historique lancé")
                t = threading.Thread(target=_load_all_history, daemon=True)
                t.start()
    except Exception as e:
        logger.error(f"Erreur refresh: {e}")
    finally:
        _state["is_refreshing"] = False


def _save_stocks(stocks_raw: list):
    if not stocks_raw:
        return
    conn = db.get_connection()
    clean = []
    try:
        for s in stocks_raw:
            sym = (s.get("symbol") or "").upper()
            if not sym or not s.get("close"):
                continue
            conn.execute(
                "INSERT OR IGNORE INTO stocks (symbol,name) VALUES (?,?)",
                (sym, s.get("name",""))
            )
            if s.get("name"):
                conn.execute(
                    "UPDATE stocks SET name=? WHERE symbol=? AND (name='' OR name IS NULL OR name=symbol)",
                    (s["name"], sym)
                )
            clean.append({
                "symbol": sym, "date": s.get("date",""),
                "open":   s.get("open"),  "high": s.get("high"),
                "low":    s.get("low"),   "close": s["close"],
                "volume": s.get("volume"), "market_cap": s.get("market_cap"),
                "variation_pct": s.get("variation_pct"),
                "reference_price": s.get("reference_price"),
            })
        conn.commit()
    finally:
        conn.close()
    db.upsert_prices_bulk(clean)
    logger.info(f"{len(clean)} cours sauvegardés")


def _load_all_history():
    """Charge l'historique de tous les titres depuis l'API chart kwayisi.

    Recharge aussi les titres dont les données sont périmées (> 7 jours),
    ce qui couvre les redémarrages après mise en veille prolongée du service.
    """
    if _state["history_loading"]:
        return
    _state["history_loading"] = True
    try:
        stocks = db.get_all_stocks()
        # Périmé = pas de données couvrant le dernier jour ouvré BRVM
        freshness_cutoff = _last_brvm_trading_day()
        stale, fresh, new = 0, 0, 0
        logger.info(f"Chargement historique pour {len(stocks)} titres (seuil fraîcheur : {freshness_cutoff})...")
        for i, stock in enumerate(stocks):
            sym = stock["symbol"]
            count = db.count_prices(sym)
            if count >= 100:
                latest = db.get_latest_price(sym)
                latest_date = latest.get("date") if latest else None
                if latest_date and latest_date >= freshness_cutoff:
                    fresh += 1
                    continue  # données récentes, pas besoin de recharger
                stale += 1
                logger.info(f"  {sym}: données périmées ({latest_date}) — rechargement")
            else:
                new += 1
            try:
                history = scraper.fetch_history_for_symbol(sym)
                if history:
                    clean = [h for h in history if h.get("close")]
                    db.upsert_prices_bulk(clean)
                    logger.info(f"  [{i+1}/{len(stocks)}] {sym}: {len(clean)} points chargés")
                time.sleep(0.5)  # politesse envers le serveur
            except Exception as e:
                logger.warning(f"  Historique {sym}: {e}")

        _state["history_loaded"] = True
        logger.info(f"Historique OK — {fresh} titres frais, {stale} périmés rechargés, {new} nouveaux")
    except Exception as e:
        logger.error(f"Erreur chargement historique: {e}")
    finally:
        _state["history_loading"] = False


def _refresh_news():
    """
    Rafraîchit les actualités BRVM depuis 4 sources :
      sikafinance.com · richbourse.com · lejecos.com · sika.finance
    """
    try:
        news = scraper.scrape_news()
        if news:
            db.save_news(news)
            logger.info(f"Actualités sauvegardées : {len(news)} articles")
        _state["last_news_refresh"] = datetime.now(timezone.utc).isoformat()
        _state["last_news_count"]   = len(news)
    except Exception as e:
        logger.error(f"Erreur news: {e}")


# ─── FICHIERS STATIQUES ───────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def index():
    f = STATIC_DIR / "index.html"
    if not f.exists():
        return JSONResponse({"error": "Frontend introuvable"}, 404)
    # Injecter un hash du fichier app.js dans la balise script pour forcer le rechargement
    import hashlib
    js_file = STATIC_DIR / "app.js"
    js_hash = hashlib.md5(js_file.read_bytes()).hexdigest()[:8] if js_file.exists() else "0"
    html = f.read_text(encoding="utf-8").replace(
        'src="/static/app.js"', f'src="/static/app.js?v={js_hash}"'
    ).replace(
        'href="/static/style.css"', f'href="/static/style.css?v={js_hash}"'
    )
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ─── STATUS ───────────────────────────────────────────────────────────────────

@app.get("/api/status")
def api_status():
    latest_news = db.get_news(1)
    return {
        "status":           "ok",
        "last_refresh":     _state["last_refresh"],
        "is_refreshing":    _state["is_refreshing"],
        "refresh_count":    _state["refresh_count"],
        "history_loaded":   _state["history_loaded"],
        "history_loading":  _state["history_loading"],
        "last_news_refresh": _state["last_news_refresh"],
        "last_news_count":   _state["last_news_count"],
        "latest_news_date":  latest_news[0]["published"] if latest_news else None,
        "server_time":      datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/refresh")
async def api_refresh(bg: BackgroundTasks):
    if _state["is_refreshing"]:
        return {"message": "Déjà en cours", "started": False}
    bg.add_task(_refresh_data)
    return {"message": "Rafraîchissement lancé", "started": True}


# ─── STOCKS ───────────────────────────────────────────────────────────────────

@app.get("/api/stocks")
def api_stocks():
    rows = db.get_latest_prices_all()
    return {"stocks": rows, "count": len(rows)}


@app.get("/api/stocks/{symbol}")
def api_stock_detail(symbol: str):
    sym   = symbol.upper()
    stock = db.get_stock(sym)
    if not stock:
        raise HTTPException(404, f"Titre '{sym}' introuvable")
    return {
        "stock":       stock,
        "latest":      db.get_latest_price(sym),
        "high_low_52w":db.get_52w_highlow(sym),
        "fundamentals":db.get_fundamental(sym),
        "notes":       db.get_notes(sym),
        "price_count": db.count_prices(sym),
    }


@app.get("/api/stocks/{symbol}/prices")
def api_prices(symbol: str, days: int = 730):
    sym    = symbol.upper()
    prices = db.get_prices(sym, days)
    if not prices:
        raise HTTPException(404, f"Aucune donnée pour '{sym}'")
    return {"symbol": sym, "prices": prices, "count": len(prices)}


@app.get("/api/stocks/{symbol}/technical")
def api_technical(symbol: str, days: int = 730):
    sym    = symbol.upper()
    prices = db.get_prices(sym, days)
    if not prices:
        raise HTTPException(404, f"Aucune donnée pour '{sym}'")
    if len(prices) < 5:
        raise HTTPException(422, f"Données insuffisantes ({len(prices)} jours disponibles, min. 5)")

    tech    = ind.compute_technical(prices)
    sr      = ind.find_support_resistance(prices)
    derived = ind.compute_derived_fundamental(prices)
    return {"symbol": sym, "count": len(prices), "technical": tech,
            "support_resistance": sr, "derived": derived}


@app.get("/api/stocks/{symbol}/fundamental")
def api_fundamental(symbol: str):
    sym  = symbol.upper()
    stock = db.get_stock(sym)
    if not stock:
        raise HTTPException(404, f"Titre '{sym}' introuvable")
    prices  = db.get_prices(sym, 730)
    fund    = db.get_fundamental(sym)
    hw      = db.get_52w_highlow(sym)
    derived = ind.compute_derived_fundamental(prices) if prices else {}
    latest  = db.get_latest_price(sym)
    country  = stock.get("country") if stock else None
    fund_net = _apply_net_dividend(fund, country)
    # Injecter le PBR si book_value disponible (per-share)
    if fund_net and latest and latest.get("close") and fund_net.get("book_value"):
        bv = fund_net["book_value"]
        if bv and bv > 0:
            fund_net["pbr"] = round(latest["close"] / bv, 2)
    # Filtrer les rendements impossibles (DPS > 60% du cours = erreur AFX)
    if latest and latest.get("close") and fund_net and fund_net.get("dividend_per_share_gross"):
        if fund_net["dividend_per_share_gross"] > latest["close"] * 0.6:
            fund_net = {**fund_net, "dividend_yield_net": None, "dividend_yield_gross": None,
                        "dividend_per_share_net": None, "_dps_error": True}
    return {
        "symbol": sym, "stock": stock,
        "fundamentals": fund_net,
        "high_low_52w": hw,
        "derived": derived, "latest": latest,
        "notes": db.get_notes(sym),
    }


# ─── RECOMMANDATION ───────────────────────────────────────────────────────────

@app.get("/api/stocks/{symbol}/recommendation")
def api_recommendation(symbol: str, profil: str = "mixte"):
    """
    Calcule et retourne la recommandation ACHAT/VENTE/NEUTRE complète.
    Combine analyse technique + fondamentale + psychologie du marché.
    Paramètre optionnel : profil = rentier | croissance | trader | mixte
    """
    sym = symbol.upper()
    if not db.get_stock(sym):
        raise HTTPException(404, f"Titre '{sym}' introuvable")

    profil = profil.lower() if profil in ("rentier","croissance","trader","mixte") else "mixte"

    prices  = db.get_prices(sym, 730)
    fund    = db.get_fundamental(sym)
    derived = ind.compute_derived_fundamental(prices) if prices else {}
    hw      = db.get_52w_highlow(sym)
    latest  = db.get_latest_price(sym)

    stock_info = db.get_stock(sym)
    country    = stock_info.get("country") if stock_info else None
    fund_net   = _apply_net_dividend(fund, country)
    # Injecter le PBR si book_value disponible (per-share)
    if fund_net and latest and latest.get("close") and fund_net.get("book_value"):
        bv = fund_net["book_value"]
        if bv and bv > 0:
            fund_net["pbr"] = round(latest["close"] / bv, 2)
    sentiment  = _get_sentiment_data()

    brvm_series = _get_brvm_series()
    result = rec.compute_recommendation(
        prices=prices or [],
        fundamentals=fund_net,
        derived=derived,
        hw=hw,
        sentiment=sentiment,
        latest=latest,
        symbol=sym,
        profil=profil,
        brvm_series=brvm_series,
    )
    result["symbol"]   = sym
    result["computed"] = datetime.now(timezone.utc).isoformat()

    # Persister dans l'historique uniquement pour le profil canonique "mixte"
    # (évite que des requêtes profil=rentier/trader n'écrasent le snapshot du jour)
    if profil == "mixte":
        today = datetime.now(timezone.utc).date().isoformat()
        try:
            db.save_recommendation_history(sym, today, result)
        except Exception as e:
            logger.warning(f"Impossible de sauvegarder l'historique reco {sym}: {e}")

    return result


@app.get("/api/stocks/{symbol}/dividend-history")
def api_dividend_history(symbol: str):
    """Retourne l'historique des dividendes versés par exercice fiscal."""
    sym = symbol.upper()
    if not db.get_stock(sym):
        raise HTTPException(404, f"Titre '{sym}' introuvable")
    history = db.get_dividend_history(sym, 10)
    return {"symbol": sym, "history": history, "count": len(history)}


@app.get("/api/stocks/{symbol}/recommendation/history")
def api_recommendation_history(symbol: str, days: int = 90):
    """Retourne l'historique des recommandations sur les N derniers jours."""
    sym = symbol.upper()
    if not db.get_stock(sym):
        raise HTTPException(404, f"Titre '{sym}' introuvable")
    history = db.get_recommendation_history(sym, days)
    return {"symbol": sym, "history": history, "count": len(history)}


@app.get("/api/stocks/{symbol}/track-record")
def api_track_record(symbol: str):
    """Taux de réussite des recommandations passées.
    Pour chaque signal ACHAT/VENTE, vérifie si le cours évolue dans la bonne direction
    30 jours calendaires après le signal."""
    from datetime import timedelta as _td
    sym     = symbol.upper()
    history = db.get_recommendation_history(sym, 365)
    prices  = db.get_prices(sym, 730)
    if not history or not prices:
        return {"symbol": sym, "signals": [], "hit_rate_achat_30d": None,
                "hit_rate_vente_30d": None, "total_signals": 0}

    price_by_date: Dict[str, float] = {
        p["date"]: p["close"] for p in prices if p.get("close")
    }
    price_dates = sorted(price_by_date)

    def _price_after(from_date: str, days: int = 30) -> Optional[float]:
        target = (_date.fromisoformat(from_date) + _td(days=days)).isoformat()
        later  = [d for d in price_dates if d >= target]
        return price_by_date[later[0]] if later else None

    # Signaux haussiers : ACHAT + ACCUMULER → on attend une hausse
    # Signaux baissiers : VENTE + ALLÉGER → on attend une baisse
    BULLISH = {"ACHAT", "ACCUMULER"}
    BEARISH = {"VENTE", "ALLÉGER"}

    signals = []
    for row in history:
        reco = row.get("recommendation")
        if reco not in BULLISH and reco not in BEARISH:
            continue
        sig_date  = row.get("date")
        sig_price = price_by_date.get(sig_date)
        if not sig_price:
            continue
        p30 = _price_after(sig_date, 30)
        if p30 is None:
            continue
        ret30 = round((p30 / sig_price - 1) * 100, 2)
        is_bullish = reco in BULLISH
        correct = (is_bullish and ret30 > 0) or (not is_bullish and ret30 < 0)
        signals.append({
            "date":           sig_date,
            "recommendation": reco,
            "direction":      "haussier" if is_bullish else "baissier",
            "score":          row.get("score"),
            "price_signal":   sig_price,
            "price_30d":      p30,
            "return_30d":     ret30,
            "correct":        correct,
        })

    bullish_s = [s for s in signals if s["direction"] == "haussier"]
    bearish_s = [s for s in signals if s["direction"] == "baissier"]
    hr_b = round(sum(1 for s in bullish_s if s["correct"]) / len(bullish_s) * 100, 1) if bullish_s else None
    hr_v = round(sum(1 for s in bearish_s if s["correct"]) / len(bearish_s) * 100, 1) if bearish_s else None

    return {
        "symbol":               sym,
        "signals":              signals[-30:],
        "hit_rate_haussier_30d": hr_b,
        "hit_rate_baissier_30d": hr_v,
        "total_haussier":       len(bullish_s),
        "total_baissier":       len(bearish_s),
        "total_signals":        len(signals),
    }


def _get_sentiment_data() -> Optional[Dict]:
    """Calcule le sentiment global du marché avec cache TTL de 5 minutes."""
    now = time.time()
    if _sentiment_cache["data"] and (now - _sentiment_cache["ts"]) < _SENTIMENT_TTL:
        return _sentiment_cache["data"]
    try:
        market_hist = db.get_market_history(60)
        all_stocks  = db.get_all_stocks()
        all_prices  = {}
        all_fundamentals = {}
        for s in all_stocks:
            sym = s["symbol"]
            p = db.get_prices(sym, 60)
            if p:
                all_prices[sym] = p
            f = db.get_fundamental(sym)
            if f:
                all_fundamentals[sym] = f
        result = ind.compute_sentiment(all_prices, market_hist, all_fundamentals)
        _sentiment_cache["data"] = result
        _sentiment_cache["ts"]   = now
        return result
    except Exception:
        return None


# ─── MARCHÉ ───────────────────────────────────────────────────────────────────

@app.get("/api/market/summary")
def api_market_summary():
    latest_market = db.get_latest_market()
    all_stocks    = db.get_latest_prices_all()
    market_hist   = db.get_market_history(90)

    with_var = [s for s in all_stocks if s.get("variation_pct") is not None]
    with_vol = [s for s in all_stocks if (s.get("volume") or 0) > 0]

    # Calculer hausses/baisses depuis les cours en temps réel (plus fiable que la DB marché)
    computed_adv = sum(1 for s in with_var if (s.get("variation_pct") or 0) > 0)
    computed_dec = sum(1 for s in with_var if (s.get("variation_pct") or 0) < 0)

    # Enrichir le résumé marché avec les données calculées si absentes
    market_out = dict(latest_market) if latest_market else {}
    if not market_out.get("advances"):
        market_out["advances"] = computed_adv
    if not market_out.get("declines"):
        market_out["declines"] = computed_dec
    # Alias brvm_30 pour la cohérence label UI — brvm_10 est le nom legacy DB
    market_out["brvm_30"] = market_out.get("brvm_10")

    return {
        "market":      market_out,
        "top_gains":   sorted(with_var, key=lambda x: x["variation_pct"], reverse=True)[:5],
        "top_losses":  sorted(with_var, key=lambda x: x["variation_pct"])[:5],
        "top_volume":  sorted(with_vol, key=lambda x: x["volume"], reverse=True)[:5],
        "total_cap":   sum(s.get("market_cap") or 0 for s in all_stocks),
        "total_volume":sum(s.get("volume") or 0 for s in all_stocks),
        "stocks_count":len(all_stocks),
        "history":     market_hist[-30:],
        "stocks":      all_stocks,
    }


@app.get("/api/market/sentiment")
def api_sentiment():
    sentiment = _get_sentiment_data() or {}
    sentiment["news"] = db.get_news(10)
    # Garantir que la clé "history" existe pour renderBreadthHistory() côté JS
    if "history" not in sentiment:
        sentiment["history"] = db.get_market_history(30)
    return sentiment


@app.get("/api/market/indices")
def api_indices(days: int = 90):
    return {"history": db.get_market_history(days)}


@app.get("/api/market/movers")
def api_movers():
    stocks = db.get_latest_prices_all()
    with_var = [s for s in stocks if s.get("variation_pct") is not None]
    with_vol = [s for s in stocks if (s.get("volume") or 0) > 0]
    return {
        "gainers": sorted(with_var, key=lambda x: x["variation_pct"], reverse=True)[:10],
        "losers":  sorted(with_var, key=lambda x: x["variation_pct"])[:10],
        "volume":  sorted(with_vol, key=lambda x: x["volume"], reverse=True)[:10],
    }


# ─── SYNTHÈSE DES TENDANCES (cycle de marché par titre) ──────────────────────

@app.get("/api/market/screener")
def api_screener():
    """Classe chaque titre dans une phase de cycle (démarrage/hausse/sommet/baisse),
    avec un vocabulaire accessible aux investisseurs non-experts."""
    now = time.time()
    if _screener_cache["data"] is not None and (now - _screener_cache["ts"]) < _SCREENER_TTL:
        return _screener_cache["data"]

    by_phase: Dict[str, List[Dict]] = {"demarrage": [], "hausse": [], "sommet": [], "baisse": [], "indecis": []}
    for s in db.get_all_stocks():
        sym = s["symbol"]
        prices = db.get_prices(sym, 300)
        phase_info = ind.compute_cycle_phase(prices)
        latest = db.get_latest_price(sym)
        by_phase[phase_info["phase"]].append({
            "symbol":        sym,
            "name":          s.get("name", ""),
            "sector":        s.get("sector", ""),
            "close":         latest.get("close") if latest else None,
            "variation_pct": latest.get("variation_pct") if latest else None,
            "confidence":    phase_info["confidence"],
            "label":         phase_info["label"],
            "description":   phase_info["description"],
        })

    for phase in by_phase:
        by_phase[phase].sort(key=lambda x: x["confidence"], reverse=True)

    result = {"phases": by_phase, "updated_at": datetime.now(timezone.utc).isoformat()}
    _screener_cache["data"] = result
    _screener_cache["ts"]   = now
    return result


_screener_stocks_cache: Dict = {"data": None, "ts": 0.0}
_SCREENER_STOCKS_TTL = 20 * 60  # 20 minutes


@app.get("/api/screener/stocks")
def api_screener_stocks():
    """
    Screener multi-critères : retourne tous les titres avec fondamentaux + dernière reco.
    Résultats mis en cache 20 min pour éviter 47 requêtes DB à chaque ouverture du screener.
    """
    now = time.time()
    if _screener_stocks_cache["data"] is not None and (now - _screener_stocks_cache["ts"]) < _SCREENER_STOCKS_TTL:
        return _screener_stocks_cache["data"]

    stocks = db.get_all_stocks()
    rows   = []
    for s in stocks:
        sym    = s["symbol"]
        latest = db.get_latest_price(sym)
        fund   = db.get_fundamental(sym)
        fund_n = _apply_net_dividend(fund, s.get("country"))
        # PBR
        if fund_n and latest and latest.get("close") and fund_n.get("book_value"):
            bv = fund_n["book_value"]
            if bv and bv > 0:
                fund_n["pbr"] = round(latest["close"] / bv, 2)
        # Filtrer les rendements impossibles (DPS > 60% du cours = erreur AFX)
        if latest and latest.get("close") and fund_n and fund_n.get("dividend_per_share_gross"):
            if fund_n["dividend_per_share_gross"] > latest["close"] * 0.6:
                fund_n = {**fund_n, "dividend_yield_net": None, "dividend_yield_gross": None,
                          "dividend_per_share_net": None, "_dps_error": True}
        # Liquidité approximative depuis les prix récents
        prices_30d = db.get_prices(sym, 30)
        vols = [p.get("volume") or 0 for p in prices_30d if p.get("volume")]
        avg_vol_30d = round(sum(vols) / len(vols)) if vols else 0
        liq_level = (
            "Élevée" if avg_vol_30d > 10000
            else "Modérée" if avg_vol_30d > 2000
            else "Faible" if avg_vol_30d > 500
            else "Très faible"
        )
        # Dernière recommandation (historique)
        reco_hist = db.get_recommendation_history(sym, 3)
        last_reco = reco_hist[-1] if reco_hist else None
        rows.append({
            "symbol":      sym,
            "name":        s.get("name", ""),
            "sector":      s.get("sector", ""),
            "country":     s.get("country", ""),
            "close":       latest.get("close") if latest else None,
            "variation_pct": latest.get("variation_pct") if latest else None,
            "market_cap":  latest.get("market_cap") if latest else None,
            "per":         fund_n.get("per") if fund_n else None,
            "eps":         fund_n.get("eps") if fund_n else None,
            "book_value":  fund_n.get("book_value") if fund_n else None,
            "pbr":         fund_n.get("pbr") if fund_n else None,
            "div_yield_gross": fund_n.get("dividend_yield_gross") if fund_n else None,
            "div_yield_net":   fund_n.get("dividend_yield_net") if fund_n else None,
            "dps_net":     fund_n.get("dividend_per_share_net") if fund_n else None,
            "div_status":  fund_n.get("div_status") if fund_n else None,
            "liq_level":   liq_level,
            "avg_vol_30d": avg_vol_30d,
            "recommendation": last_reco.get("recommendation") if last_reco else None,
            "score":       last_reco.get("score") if last_reco else None,
            "score_tech":  last_reco.get("score_technique") if last_reco else None,
            "score_fund":  last_reco.get("score_fondamentale") if last_reco else None,
            "reco_date":   last_reco.get("date") if last_reco else None,
        })

    result = {"stocks": rows, "count": len(rows), "updated_at": datetime.now(timezone.utc).isoformat()}
    _screener_stocks_cache["data"] = result
    _screener_stocks_cache["ts"]   = now
    return result


# ─── DIVIDENDES (endpoint dédié) ─────────────────────────────────────────────

@app.get("/api/market/dividends")
def api_dividends():
    """Classement des titres par rendement dividende NET (après retenue fiscale UEMOA)."""
    stocks  = db.get_all_stocks()
    results = []
    for s in stocks:
        f = db.get_fundamental(s["symbol"])
        l = db.get_latest_price(s["symbol"])
        if f and (f.get("dividend_yield") or f.get("dividend_per_share")):
            fn = _apply_net_dividend(f, s.get("country"))
            # Filtrer les rendements impossibles (DPS > 60% du cours = erreur AFX)
            if l and l.get("close") and fn.get("dividend_per_share_gross"):
                if fn["dividend_per_share_gross"] > l["close"] * 0.6:
                    fn = {**fn, "dividend_yield_net": None, "dividend_yield_gross": None,
                          "dividend_per_share_net": None, "_dps_error": True}
            results.append({
                "symbol":               s["symbol"],
                "name":                 s.get("name",""),
                "sector":               s.get("sector",""),
                "country":              s.get("country",""),
                "close":                l.get("close") if l else None,
                # Rendements brut et net
                "dividend_yield":       fn.get("dividend_yield_net"),    # NET par défaut
                "dividend_yield_gross": fn.get("dividend_yield_gross"),  # Brut pour info
                "dividend_per_share":   fn.get("dividend_per_share_net"),
                "dividend_per_share_gross": f.get("dividend_per_share"),
                "irvm_rate_pct":        fn.get("irvm_rate_pct"),
                "per":                  f.get("per"),
                "eps":                  f.get("eps"),
                # Pipeline dividende — exercice fiscal + statut
                # 'annoncé' : dividende FY(N-1) voté en AGO N, en attente de publication BOC
                # 'officiel': dividende FY(N-1) publié au Bulletin Officiel de la Cote BRVM
                # 'historique': exercice antérieur, dividende déjà distribué (non affiché en pipeline)
                # 'aucun'    : pas de dividende annoncé pour l'exercice courant
                "div_status":           fn.get("div_status", "aucun"),
                "div_exercice_year":    fn.get("div_exercice_year"),
                "div_exercice_label":   fn.get("div_exercice_label"),
                "div_payment_date":     fn.get("div_payment_date"),
            })
    results.sort(key=lambda x: x.get("dividend_yield") or 0, reverse=True)
    return {"dividends": results, "count": len(results)}


# ─── ACTUALITÉS ───────────────────────────────────────────────────────────────

@app.post("/api/stocks/{symbol}/dividend-manual")
def api_dividend_manual(symbol: str, body: dict):
    """
    Saisie manuelle d'un dividende net pour un titre.
    Calcule automatiquement : brut, rendement, PER si BNPA disponible.
    Source = 'MANUEL' — prioritaire sur AFX.
    """
    symbol = symbol.upper()
    stock  = db.get_stock(symbol)
    if not stock:
        return JSONResponse({"error": f"Titre {symbol} introuvable"}, 404)

    net_dps_raw   = body.get("net_dps")
    net_dps       = float(net_dps_raw) if net_dps_raw is not None else None
    exercice_year = int(body.get("exercice_year", datetime.now().year - 1))

    if net_dps is None or net_dps < 0:
        return JSONResponse({"error": "Dividende net doit être >= 0 (0 = pas de dividende)"}, 400)

    no_dividend = (net_dps == 0)
    country = stock.get("country") or ""
    factor  = _net_div_factor(country)
    gross_dps   = 0.0 if no_dividend else round(net_dps / factor, 2)
    gross_yield = 0.0 if no_dividend else None

    # Rendement calculé sur le cours actuel
    latest = db.get_latest_price(symbol)
    price  = latest.get("close") if latest else None
    if not no_dividend and price and price > 0:
        gross_yield = round(gross_dps / price * 100, 4)
    net_yield = round(gross_yield * factor, 4) if gross_yield else (0.0 if no_dividend else None)

    # PER : si BNPA déjà en DB on le conserve, sinon on essaie de le déduire
    fund = db.get_fundamental(symbol) or {}
    per  = fund.get("per")
    bnpa = fund.get("earnings_per_share")
    if price and bnpa and bnpa > 0:
        per = round(price / bnpa, 2)

    db.force_upsert_dividend({
        "symbol":             symbol,
        "dividend_per_share": gross_dps,
        "dividend_yield":     gross_yield,
        "div_status":         "sans_dividende" if no_dividend else "manuel",
        "div_exercice_year":  exercice_year,
        "div_payment_date":   None,
    })

    return {
        "symbol":          symbol,
        "net_dps":         net_dps,
        "gross_dps":       gross_dps,
        "net_yield_pct":   net_yield,
        "gross_yield_pct": gross_yield,
        "no_dividend":     no_dividend,
        "irvm_factor":     factor,
        "irvm_pct":        round((1 - factor) * 100, 1),
        "per":             per,
        "bnpa":            bnpa,
        "price":           price,
        "exercice_year":   exercice_year,
        "country":         country,
        "source":          "MANUEL",
    }


@app.delete("/api/stocks/{symbol}/dividend-manual")
def api_dividend_manual_delete(symbol: str):
    """Supprime le dividende saisi manuellement (remet à zéro les champs dividende)."""
    symbol = symbol.upper()
    db.force_upsert_dividend({
        "symbol":             symbol,
        "dividend_per_share": None,
        "dividend_yield":     None,
        "div_status":         "aucun",
        "div_exercice_year":  None,
        "div_payment_date":   None,
    })
    return {"ok": True, "symbol": symbol}


@app.post("/api/stocks/{symbol}/price-manual")
def api_price_manual(symbol: str, body: dict):
    """
    Correction manuelle du cours de clôture d'un titre — utile quand la source
    scrapée (afx) est périmée sur un titre peu liquide.
    Source = 'MANUEL' — prioritaire sur AFX pour cette date jusqu'à suppression.
    """
    symbol = symbol.upper()
    stock  = db.get_stock(symbol)
    if not stock:
        return JSONResponse({"error": f"Titre {symbol} introuvable"}, 404)

    close_raw = body.get("close")
    if close_raw is None:
        return JSONResponse({"error": "close requis"}, 400)
    try:
        close = float(close_raw)
    except (TypeError, ValueError):
        return JSONResponse({"error": "close invalide"}, 400)
    if close <= 0:
        return JSONResponse({"error": "close doit être > 0"}, 400)

    target_date = body.get("date") or _last_brvm_trading_day()

    latest = db.get_latest_price(symbol)
    prev_close = latest["close"] if latest and latest.get("date", "") < target_date else None
    if prev_close is None:
        history = [p for p in db.get_prices(symbol, 30) if p["date"] < target_date]
        prev_close = history[-1]["close"] if history else None

    variation_pct = round((close / prev_close - 1) * 100, 2) if prev_close else 0.0

    db.set_manual_price({
        "symbol": symbol, "date": target_date,
        "open": None, "high": None, "low": None, "close": close,
        "volume": None, "market_cap": None,
        "variation_pct": variation_pct, "reference_price": prev_close,
    })
    _sentiment_cache["data"] = None
    _screener_cache["data"] = None
    _screener_stocks_cache["data"] = None
    return {"symbol": symbol, "date": target_date, "close": close,
            "variation_pct": variation_pct, "source": "MANUEL"}


@app.delete("/api/stocks/{symbol}/price-manual")
def api_price_manual_delete(symbol: str, date: Optional[str] = None):
    """Supprime une correction manuelle — le cours scrapé reprend le dessus au prochain refresh."""
    symbol = symbol.upper()
    target_date = date or _last_brvm_trading_day()
    db.delete_manual_price(symbol, target_date)
    _sentiment_cache["data"] = None
    _screener_cache["data"] = None
    _screener_stocks_cache["data"] = None
    return {"ok": True, "symbol": symbol, "date": target_date}


@app.get("/api/news")
def api_news(limit: int = 20, source: Optional[str] = None):
    """
    Retourne les dernières actualités BRVM/UEMOA.
    Sources : sikafinance.com · richbourse.com · lejecos.com · sika.finance
    Paramètre optionnel `source` pour filtrer par source (ex: sikafinance.com).
    """
    news = db.get_news(limit)
    if source:
        news = [n for n in news if (n.get("source") or "").lower() == source.lower()]

    # Regrouper par source pour les méta-infos côté client
    sources_seen = list(dict.fromkeys(n.get("source","") for n in news if n.get("source")))
    return {
        "news":    news,
        "count":   len(news),
        "sources": sources_seen,
    }


# ─── NOTES ────────────────────────────────────────────────────────────────────

class NoteRequest(BaseModel):
    signal: Optional[str] = "NEUTRE"
    note: str

@app.post("/api/stocks/{symbol}/notes")
def api_save_note(symbol: str, req: NoteRequest):
    db.save_note(symbol.upper(), req.signal, req.note)
    return {"message": "Note sauvegardée"}

@app.get("/api/stocks/{symbol}/notes")
def api_get_notes(symbol: str):
    return {"notes": db.get_notes(symbol.upper())}


# ─── FONDAMENTAUX MANUELS ─────────────────────────────────────────────────────

class FundRequest(BaseModel):
    per:                Optional[float] = None
    dividend_yield:     Optional[float] = None
    dividend_per_share: Optional[float] = None
    book_value:         Optional[float] = None
    revenue:            Optional[float] = None
    net_income:         Optional[float] = None
    eps:                Optional[float] = None

@app.put("/api/stocks/{symbol}/fundamental")
def api_update_fundamental(symbol: str, req: FundRequest):
    data = {k: v for k, v in req.dict().items() if v is not None}
    data["symbol"] = symbol.upper()
    db.upsert_fundamental(data)
    return {"message": "Fondamentaux mis à jour"}


# ─── CHARGEMENT HISTORIQUE + FONDAMENTAUX ─────────────────────────────────────

@app.post("/api/stocks/{symbol}/fetch-history")
async def api_fetch_history(symbol: str, bg: BackgroundTasks):
    sym = symbol.upper()

    def _load():
        logger.info(f"Chargement historique {sym}...")
        hist = scraper.fetch_history_for_symbol(sym)
        if hist:
            clean = [h for h in hist if h.get("close")]
            db.upsert_prices_bulk(clean)
            logger.info(f"{sym}: {len(clean)} points sauvegardés")

        # Charger aussi les fondamentaux
        fund_data = scraper.fetch_fundamentals_for_symbol(sym)
        if fund_data:
            # Fusionner avec les données déjà en DB
            existing = db.get_fundamental(sym) or {}
            merged = {**existing, **{k: v for k, v in fund_data.items() if v is not None}}
            merged["symbol"] = sym
            # Mapper les champs AFX → DB
            if fund_data.get("dividend_yield") and not merged.get("dividend_yield"):
                merged["dividend_yield"] = fund_data["dividend_yield"]
            if fund_data.get("eps") and not merged.get("eps"):
                merged["eps"] = fund_data["eps"]
            if fund_data.get("per") and not merged.get("per"):
                merged["per"] = fund_data["per"]
            try:
                db.upsert_fundamental(merged)
                logger.info(f"{sym}: fondamentaux sauvegardés (P/E={fund_data.get('per')}, Div={fund_data.get('dividend_yield')}%)")
            except Exception as e:
                logger.warning(f"Fondamentaux {sym}: {e}")

    bg.add_task(_load)
    return {"message": f"Chargement de {sym} lancé (historique + fondamentaux)"}


@app.post("/api/load-all-history")
async def api_load_all_history(bg: BackgroundTasks):
    """Recharge l'historique de tous les titres."""
    bg.add_task(_load_all_history)
    return {"message": "Chargement global lancé"}


# ─── EXPORT PDF ───────────────────────────────────────────────────────────────

@app.get("/api/stocks/{symbol}/export/pdf")
def export_stock_pdf(symbol: str):
    """Génère et télécharge le rapport PDF d'analyse du titre."""
    if not _PDF_AVAILABLE:
        raise HTTPException(status_code=503, detail="Export PDF indisponible (dépendance fpdf2/cryptography manquante)")
    symbol = symbol.upper()

    # Récupérer toutes les données
    stocks = db.get_all_stocks()
    stock_info = next(
        (s for s in stocks if s["symbol"] == symbol),
        {"symbol": symbol, "name": symbol, "sector": "N/D", "country": "N/D"},
    )

    prices = db.get_prices(symbol, 365)
    if not prices:
        raise HTTPException(status_code=404, detail=f"Aucune donnée pour {symbol}")

    latest       = prices[-1] if prices else {}
    fundamentals = db.get_fundamental(symbol)
    hw           = db.get_52w_highlow(symbol)
    country      = stock_info.get("country")
    fund_net     = _apply_net_dividend(fundamentals, country)

    # Données dérivées complètes (performances, volatilité, 52-sem…)
    derived = ind.compute_derived_fundamental(prices) if len(prices) >= 2 else {}

    sentiment   = _get_sentiment_data()
    brvm_series = _get_brvm_series()
    reco = rec.compute_recommendation(prices, fund_net, derived, hw or {}, sentiment, latest,
                                      symbol=symbol, brvm_series=brvm_series)

    # Générer le PDF
    pdf_bytes = pdf_gen.generate_stock_report(
        symbol=symbol,
        stock_info=dict(stock_info),
        latest_price=dict(latest),
        reco=reco,
    )

    filename = f"BRVM_{symbol}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )


# ─── PORTEFEUILLE — Parseurs CSV / Excel / PDF ───────────────────────────────

import csv as _csv
import io as _io

def _parse_portfolio_csv(content: bytes, filename: str) -> Dict:
    """Parse un fichier CSV/TSV contenant un portefeuille BRVM.
    Cherche des colonnes Symbole, Quantité, Prix d'achat.
    """
    holdings: list = []
    errors:   list = []
    try:
        text = content.decode("utf-8-sig", errors="replace")
        # Détecter le délimiteur
        sample = text[:2048]
        dialect = _csv.Sniffer().sniff(sample, delimiters=";,\t")
        reader  = _csv.DictReader(_io.StringIO(text), dialect=dialect)

        def _norm(s: str) -> str:
            return (s or "").lower().strip().replace(" ", "_").replace("é","e") \
                            .replace("è","e").replace("ê","e").replace("à","a") \
                            .replace("â","a").replace("ù","u").replace("'","'")

        SYM_KEYS   = ["symbol","symbole","ticker","titre","valeur","code","libelle"]
        QTY_KEYS   = ["quantite","qty","nombre","qte","quantity","nb_titres","nombre_titres"]
        PRICE_KEYS = ["prix_achat","prix","price","cours","pa","purchase_price","buy_price","pru","prix_revient"]

        raw_headers = reader.fieldnames or []
        norm_map    = {_norm(h): h for h in raw_headers}  # normalised → original

        sym_col   = next((norm_map[k] for k in SYM_KEYS   if k in norm_map), None)
        qty_col   = next((norm_map[k] for k in QTY_KEYS   if k in norm_map), None)
        price_col = next((norm_map[k] for k in PRICE_KEYS if k in norm_map), None)

        if not sym_col:
            errors.append("Colonne 'Symbole' introuvable. Colonnes détectées : " + ", ".join(raw_headers[:8]))
            return {"holdings": [], "errors": errors, "metadata": {}}

        def _float(v):
            try:   return float(str(v).replace("\xa0","").replace(" ","").replace(",","."))
            except: return None

        for row in reader:
            sym = str(row.get(sym_col, "")).upper().strip()
            if not sym or len(sym) < 2:
                continue
            qty   = _float(row.get(qty_col))   if qty_col   else None
            price = _float(row.get(price_col)) if price_col else None
            holdings.append({
                "symbol": sym, "name": sym,
                "quantity":  qty,   "buy_price": price,
                "buy_value": (qty * price) if qty and price else None,
                "current_price": None, "market_value": None,
                "pnl": None,          "pnl_pct": None,
            })
    except Exception as e:
        errors.append(f"Erreur lecture CSV : {e}")

    return {"holdings": holdings, "errors": errors,
            "metadata": {"filename": filename, "format": "CSV", "rows": len(holdings)}}


def _parse_portfolio_excel(content: bytes, filename: str) -> Dict:
    """Parse un fichier Excel (.xlsx/.xls/.ods) contenant un portefeuille BRVM."""
    holdings: list = []
    errors:   list = []
    try:
        import openpyxl
        wb = openpyxl.load_workbook(_io.BytesIO(content), data_only=True)
        ws = wb.active
        all_rows = [list(row) for row in ws.iter_rows(values_only=True) if any(c is not None for c in row)]

        if not all_rows:
            return {"holdings": [], "errors": ["Feuille Excel vide"], "metadata": {}}

        def _norm(s) -> str:
            s = str(s or "").lower().strip()
            for old, new in [(" ","_"),("é","e"),("è","e"),("ê","e"),("à","a"),("â","a"),("'","'")]:
                s = s.replace(old, new)
            return s

        SYM_KEYS   = ["symbol","symbole","ticker","titre","valeur","code","libelle"]
        QTY_KEYS   = ["quantite","qty","nombre","qte","quantity","nb_titres","nombre_titres"]
        PRICE_KEYS = ["prix_achat","prix","price","cours","pa","purchase_price","buy_price","pru"]

        # Détecter la ligne d'entête (chercher dans les 6 premières lignes)
        hdr_idx = 0
        hdr_row = all_rows[0]
        for i, row in enumerate(all_rows[:6]):
            norms = [_norm(c) for c in row]
            if any(k in norms for k in SYM_KEYS):
                hdr_idx = i
                hdr_row = row
                break

        norm_map = {_norm(c): j for j, c in enumerate(hdr_row) if c is not None}

        sym_idx   = next((norm_map[k] for k in SYM_KEYS   if k in norm_map), None)
        qty_idx   = next((norm_map[k] for k in QTY_KEYS   if k in norm_map), None)
        price_idx = next((norm_map[k] for k in PRICE_KEYS if k in norm_map), None)

        if sym_idx is None:
            errors.append("Colonne 'Symbole' introuvable. En-têtes détectés : " + str([str(c) for c in hdr_row[:8]]))
            return {"holdings": [], "errors": errors, "metadata": {}}

        def _float(v):
            try:   return float(str(v).replace("\xa0","").replace(" ","").replace(",","."))
            except: return None

        for row in all_rows[hdr_idx + 1:]:
            if not row or sym_idx >= len(row):
                continue
            sym = str(row[sym_idx] or "").upper().strip()
            if not sym or len(sym) < 2:
                continue
            qty   = _float(row[qty_idx])   if qty_idx   is not None and qty_idx   < len(row) else None
            price = _float(row[price_idx]) if price_idx is not None and price_idx < len(row) else None
            holdings.append({
                "symbol": sym, "name": sym,
                "quantity":  qty,   "buy_price": price,
                "buy_value": (qty * price) if qty and price else None,
                "current_price": None, "market_value": None,
                "pnl": None,          "pnl_pct": None,
            })
    except ImportError:
        errors.append("Module openpyxl non disponible — installez-le : pip install openpyxl")
    except Exception as e:
        errors.append(f"Erreur lecture Excel : {e}")

    return {"holdings": holdings, "errors": errors,
            "metadata": {"filename": filename, "format": "Excel", "rows": len(holdings)}}


# ─── PORTEFEUILLE — Import Universel (PDF / CSV / Excel / Image) ──────────────

@app.post("/api/portfolio/analyze")
async def analyze_portfolio_file(file: UploadFile = File(...), profil: str = "mixte"):
    """
    Accepte un relevé de portefeuille BRVM dans n'importe quel format :
      • PDF  (pdfplumber — SGBCI, BRM, Coris Bourse, NSIA Finance…)
      • CSV / TSV  (colonnes Symbole, Quantité, Prix d'achat)
      • Excel (.xlsx / .xls)  (même colonnes)
    Retourne les recommandations par position + résumé portefeuille.
    """
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(413, "Fichier trop volumineux (max 20 Mo)")

    filename = file.filename or "upload"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    # ── Sélectionner le bon parseur ────────────────────────────────────────
    if ext in ("csv", "tsv", "txt"):
        parsed = _parse_portfolio_csv(content, filename)
    elif ext in ("xlsx", "xls", "ods"):
        parsed = _parse_portfolio_excel(content, filename)
    else:
        # Défaut : PDF (pdfplumber) ; si ça échoue on tente CSV
        parsed = ptf.parse_portfolio_pdf(content)
        if not parsed.get("holdings"):
            csv_try = _parse_portfolio_csv(content, filename)
            if csv_try.get("holdings"):
                parsed = csv_try

    parse_errors = parsed.get("errors", [])

    if not parsed["holdings"]:
        raw_preview = parsed.get("raw_text", "")[:800]
        tips = (
            "Formats acceptés : PDF (relevé courtier), CSV, Excel (.xlsx). "
            "Pour les PDF : vérifiez que le texte est extractible (non scanné). "
            "Pour CSV/Excel : assurez-vous d'avoir une colonne 'Symbole' ou 'Ticker' "
            "avec les codes BRVM (ex: SNTS, SGBC, TTLC…). "
            "Courtiers supportés : SGBCI, BRM, Coris Bourse, NSIA Finance, BNI Finances."
        )
        return JSONResponse({
            "success":        False,
            "error":          "Aucune position BRVM reconnue dans ce fichier.",
            "tips":           tips,
            "raw_preview":    raw_preview,
            "parsing_errors": parse_errors,
        })

    # ── Analyser les positions ─────────────────────────────────────────────
    result = ptf.analyze_portfolio(parsed["holdings"], db, ind, rec, profil=profil, sentiment=_get_sentiment_data())
    result["metadata"]       = parsed.get("metadata", {})
    result["parsing_errors"] = parse_errors
    result["filename"]       = filename

    return result


@app.post("/api/portfolio/analyze-manual")
def analyze_portfolio_manual(body: dict):
    """
    Analyse un portefeuille saisi manuellement.
    Attend { holdings: [{symbol, quantity, buy_price}, ...] }
    """
    holdings = body.get("holdings", [])
    if not holdings:
        raise HTTPException(400, "Aucune position fournie")

    # Valider et normaliser
    clean = []
    for h in holdings:
        sym = str(h.get("symbol", "")).upper().strip()
        if not sym:
            continue
        clean.append({
            "symbol":    sym,
            "name":      sym,
            "quantity":  h.get("quantity"),
            "buy_price": h.get("buy_price"),
            "buy_value": None,
            "current_price": None,
            "market_value":  None,
            "pnl":     None,
            "pnl_pct": None,
        })

    if not clean:
        raise HTTPException(400, "Aucun symbole valide fourni")

    profil = body.get("profil", "mixte")
    result = ptf.analyze_portfolio(clean, db, ind, rec, profil=profil, sentiment=_get_sentiment_data())
    result.setdefault("metadata", {})          # cohérence avec la route PDF
    result.setdefault("parsing_errors", [])
    return result


# ─── DIVIDENDES BOC — Mise à jour depuis le Bulletin Officiel ────────────────

@app.post("/api/admin/refresh-boc-dividends")
def refresh_boc_dividends():
    """
    Scrape le BOC BRVM et met à jour automatiquement les DNPA dans la base.
    Le DNPA (Dividende Net Par Action) = dividende avant retenue IRVM investisseur.
    """
    boc_entries = scraper.fetch_boc_dividends()
    if not boc_entries:
        return {"success": False, "error": "Aucun dividende trouvé dans le BOC", "updated": []}

    updated = []
    errors  = []
    for entry in boc_entries:
        sym  = entry["symbol"]
        dnpa = entry["dnpa"]
        yield_boc = entry.get("net_yield")  # Rdt Net BOC = DNPA/cours (avant IRVM)
        try:
            # Exercice fiscal = année courante - 1 (dividende FY N-1 publié en N)
            exercice_year = entry.get("exercice") or (datetime.now().year - 1)

            fund = db.get_fundamental(sym) or {"symbol": sym}
            fund_upd = dict(fund)
            fund_upd["symbol"]              = sym
            fund_upd["dividend_per_share"]  = dnpa
            fund_upd["div_status"]          = "officiel"   # BOC = publication officielle BRVM
            fund_upd["div_exercice_year"]   = exercice_year
            if entry.get("div_date"):
                fund_upd["div_payment_date"] = entry["div_date"]
            if yield_boc:
                fund_upd["dividend_yield"]  = yield_boc
            db.upsert_fundamental(fund_upd)
            updated.append({
                "symbol":       sym,
                "dnpa":         dnpa,
                "net_yield":    yield_boc,
                "div_date":     entry.get("div_date"),
                "exercice_year": exercice_year,
            })
            logger.info(f"BOC update {sym}: DNPA={dnpa} FCFA exercice={exercice_year}, "
                        f"Rdt={yield_boc}% — statut=officiel")
        except Exception as e:
            errors.append(f"{sym}: {e}")

    # Invalider cache sentiment
    _sentiment_cache["data"] = None

    return {"success": True, "updated": updated, "errors": errors, "count": len(updated)}


@app.post("/api/admin/update-dividends")
def update_dividends_from_boc(body: dict):
    """
    Met à jour les dividendes annoncés depuis le BOC BRVM.
    Attend : { updates: [{symbol, dividend_per_share_net, country}] }
    Le montant est le dividende NET annoncé (après IRVM).
    On calcule le brut et met à jour la DB.
    """
    updates = body.get("updates", [])
    if not updates:
        raise HTTPException(400, "Aucune mise à jour fournie")

    updated = []
    errors  = []

    for u in updates:
        sym    = str(u.get("symbol", "")).upper().strip()
        net_dps = u.get("dividend_per_share_net")  # montant NET annoncé
        country = u.get("country")

        if not sym or net_dps is None:
            errors.append(f"Données incomplètes pour {sym}")
            continue

        try:
            factor = _net_div_factor(country)
            gross_dps = round(net_dps / factor, 2)

            # Récupérer le prix actuel pour calculer le yield
            latest = db.get_latest_price(sym)
            curr_price = latest.get("close") if latest else None
            gross_yield = round(gross_dps / curr_price * 100, 2) if curr_price and curr_price > 0 else None

            # Exercice fiscal = année courante - 1 (AGO N déclare le dividende FY N-1)
            exercice_year = u.get("exercice_year") or (datetime.now().year - 1)

            # Lire les fondamentaux existants
            fund = db.get_fundamental(sym) or {"symbol": sym}
            fund_upd = dict(fund)
            fund_upd["symbol"]             = sym
            fund_upd["dividend_per_share"] = gross_dps
            fund_upd["div_status"]         = "annoncé"    # annoncé en AGO / communiqué société
            fund_upd["div_exercice_year"]  = exercice_year
            if gross_yield:
                fund_upd["dividend_yield"] = gross_yield

            db.upsert_fundamental(fund_upd)
            updated.append({
                "symbol":           sym,
                "net_dps":          net_dps,
                "gross_dps":        gross_dps,
                "gross_yield":      gross_yield,
                "factor":           factor,
                "irvm_pct":         round((1 - factor) * 100, 1),
            })
            logger.info(f"Dividende mis à jour {sym}: net={net_dps} FCFA → brut={gross_dps} FCFA, yield={gross_yield}%")

        except Exception as e:
            errors.append(f"{sym}: {e}")
            logger.error(f"Erreur mise à jour dividende {sym}: {e}")

    # Invalider le cache sentiment
    _sentiment_cache["data"] = None

    return {
        "success": len(updated) > 0,
        "updated": updated,
        "errors":  errors,
        "count":   len(updated),
    }


@app.post("/api/admin/refresh-dividends-all-sources")
def refresh_dividends_all_sources(background_tasks: BackgroundTasks,
                                   year: Optional[int] = None):
    """
    Scanne toutes les sources de dividendes BRVM pour l'année `year` :
      1. BOC BRVM (scan de tous les bulletins de l'année)
      2. Comptes rendus AGM publiés sur brvm.org
    Met à jour automatiquement la base de données avec les DNPA trouvés.
    """
    from datetime import date as _date
    if year is None:
        year = _date.today().year

    def _run():
        try:
            result = scraper.fetch_all_dividend_sources(year)
            merged = result.get("merged", [])
            updated_inner = []
            errors_inner  = []

            for entry in merged:
                sym  = entry.get("symbol", "").upper().strip()
                dnpa = entry.get("dnpa")
                if not sym or not dnpa:
                    continue
                try:
                    stock = db.get_stock(sym)
                    if not stock:
                        logger.debug(f"Dividende {sym}: titre non trouvé en DB — ignoré")
                        continue

                    fund = db.get_fundamental(sym) or {"symbol": sym}
                    fund_upd = dict(fund)
                    fund_upd["symbol"]             = sym
                    fund_upd["dividend_per_share"] = dnpa  # DNPA = brut avant IRVM investisseur

                    # Exercice fiscal : dividende FY(N-1) annoncé/publié en FY(N)
                    # Le scan porte sur `year`, donc l'exercice = year - 1
                    # Ex : scan 2026 → exercice 2025 (dividendes votés aux AGO 2026)
                    src = entry.get("source", "")
                    exc_year = entry.get("exercice") or (year - 1)
                    fund_upd["div_status"]        = "officiel" if "boc" in src.lower() else "annoncé"
                    fund_upd["div_exercice_year"] = exc_year
                    if entry.get("div_date"):
                        fund_upd["div_payment_date"] = entry["div_date"]

                    # Calculer le yield si prix disponible
                    latest = db.get_latest_price(sym)
                    if latest and latest.get("close") and latest["close"] > 0:
                        fund_upd["dividend_yield"] = round(dnpa / latest["close"] * 100, 2)

                    db.upsert_fundamental(fund_upd)
                    updated_inner.append({
                        "symbol":   sym,
                        "dnpa":     dnpa,
                        "source":   entry.get("source", "unknown"),
                        "exercice": entry.get("exercice"),
                        "div_date": entry.get("div_date"),
                    })
                    logger.info(f"Dividende {sym}: DNPA={dnpa} FCFA "
                                f"(source={entry.get('source')}, exercice={entry.get('exercice')})")
                except Exception as e:
                    errors_inner.append(f"{sym}: {e}")

            # Invalider le cache
            _sentiment_cache["data"] = None
            logger.info(f"refresh_dividends_all_sources {year}: "
                        f"{len(updated_inner)} mis à jour, {len(errors_inner)} erreurs")
        except Exception as e:
            logger.error(f"refresh_dividends_all_sources background error: {e}", exc_info=True)

    background_tasks.add_task(_run)
    return {
        "success": True,
        "message": f"Scan dividendes {year} lancé en arrière-plan (BOC + AGM). "
                   f"Rafraîchissez la page dans 1-2 minutes.",
        "year": year,
    }


@app.post("/api/admin/seed-dividends-2025")
def api_seed_dividends_2025():
    """
    Re-charge manuellement les dividendes 2025 (source : sikafinance.com).
    Utile après un redémarrage ou pour forcer la remise à jour des données
    si elles ont été écrasées par un scraper.
    Les 16 dividendes de l'exercice 2025 sont hardcodés depuis le tableau
    officiel sikafinance (NET → converti en BRUT pour la DB).
    """
    seed_dividends_2025()
    # Invalider le cache sentiment après mise à jour des dividendes
    _sentiment_cache["data"] = None
    return {
        "success": True,
        "message": f"Dividendes 2025 rechargés ({len(_DIVIDENDS_2025)} titres).",
        "tickers": [d[0] for d in _DIVIDENDS_2025],
        "exercice": 2025,
        "source":   "sikafinance.com/marches/dividendes",
    }


@app.get("/api/admin/dividends-sources-preview")
def preview_dividends_sources(year: Optional[int] = None):
    """
    Prévisualise les dividendes trouvés dans toutes les sources
    sans modifier la base de données.
    """
    from datetime import date as _date
    if year is None:
        year = _date.today().year

    result = scraper.fetch_all_dividend_sources(year)
    return {
        "year":   result["year"],
        "counts": result["counts"],
        "merged": result["merged"],
        "boc":    result["boc"][:20],
        "agm":    result["agm"][:20],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ─── PORTFOLIO POSITIONS (prix de revient) ────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/portfolio/positions")
def api_get_positions():
    positions = db.get_portfolio_positions()
    # Pre-load prices and stock meta in one query each to avoid O(N) DB calls
    prices_map = {r["symbol"]: r for r in db.get_latest_prices_all()}
    enriched   = []
    for pos in positions:
        sym     = pos["symbol"]
        pr      = prices_map.get(sym) or {}
        current = pr.get("close")
        cost    = pos["entry_price"] * pos["quantity"]
        value   = current * pos["quantity"] if current else None
        pnl     = value - cost if value is not None else None
        pnl_pct = pnl / cost * 100 if cost and pnl is not None else None
        # Dividende annuel estimé
        fund    = db.get_fundamental(sym) or {}
        country = pos.get("country") or pr.get("country")
        f_net   = _apply_net_dividend(fund, country) or {}
        dps_net = f_net.get("dividend_per_share_net") or f_net.get("dividend_per_share") or 0
        annual_div = dps_net * pos["quantity"] if dps_net else 0
        yield_on_cost = (dps_net / pos["entry_price"] * 100) if dps_net and pos["entry_price"] else None
        enriched.append({**pos,
            "current_price": current,
            "market_value": round(value) if value else None,
            "cost_basis": round(cost),
            "pnl": round(pnl) if pnl is not None else None,
            "pnl_pct": round(pnl_pct, 2) if pnl_pct is not None else None,
            "annual_div_net": round(annual_div) if annual_div else 0,
            "yield_on_cost": round(yield_on_cost, 2) if yield_on_cost else None,
        })
    total_cost  = sum(p["cost_basis"] for p in enriched)
    total_value = sum(p["market_value"] or p["cost_basis"] for p in enriched)
    total_pnl   = total_value - total_cost
    total_div   = sum(p["annual_div_net"] for p in enriched)
    return {
        "positions": enriched,
        "summary": {
            "total_cost": round(total_cost),
            "total_value": round(total_value),
            "total_pnl": round(total_pnl),
            "total_pnl_pct": round(total_pnl / total_cost * 100, 2) if total_cost else 0,
            "annual_div_net": round(total_div),
            "portfolio_yield": round(total_div / total_value * 100, 2) if total_value else 0,
        }
    }

@app.post("/api/portfolio/positions")
def api_add_position(body: dict):
    sym = (body.get("symbol") or "").upper()
    if not sym or not db.get_stock(sym):
        return JSONResponse({"error": f"Titre '{sym}' introuvable"}, 400)
    qty   = float(body.get("quantity") or 0)
    price = float(body.get("entry_price") or 0)
    if qty <= 0 or price <= 0:
        return JSONResponse({"error": "Quantité et prix d'entrée requis (> 0)"}, 400)
    pid = db.add_portfolio_position({
        "symbol": sym, "quantity": qty, "entry_price": price,
        "entry_date": body.get("entry_date"), "broker": body.get("broker"),
        "notes": body.get("notes"),
    })
    return {"id": pid, "message": "Position ajoutée"}

@app.put("/api/portfolio/positions/{pid}")
def api_update_position(pid: int, body: dict):
    qty   = float(body.get("quantity") or 0)
    price = float(body.get("entry_price") or 0)
    if qty <= 0 or price <= 0:
        return JSONResponse({"error": "Quantité et prix requis"}, 400)
    db.update_portfolio_position(pid, {
        "quantity": qty, "entry_price": price,
        "entry_date": body.get("entry_date"), "broker": body.get("broker"),
        "notes": body.get("notes"),
    })
    return {"message": "Position mise à jour"}

@app.delete("/api/portfolio/positions/{pid}")
def api_delete_position(pid: int):
    db.delete_portfolio_position(pid)
    return {"message": "Position supprimée"}


# ═══════════════════════════════════════════════════════════════════════════════
# ─── ALERTES DE PRIX ──────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/alerts")
def api_get_alerts():
    return {"alerts": db.get_price_alerts()}

@app.post("/api/alerts")
def api_add_alert(body: dict):
    sym = (body.get("symbol") or "").upper()
    if not sym or not db.get_stock(sym):
        return JSONResponse({"error": f"Titre '{sym}' introuvable"}, 400)
    price = float(body.get("target_price") or 0)
    if price <= 0:
        return JSONResponse({"error": "Prix cible requis (> 0)"}, 400)
    direction = body.get("direction", "below")
    if direction not in ("above", "below"):
        return JSONResponse({"error": "direction: 'above' ou 'below'"}, 400)
    aid = db.add_price_alert({
        "symbol": sym, "target_price": price,
        "direction": direction, "label": body.get("label"),
        "email": body.get("email"),
    })
    return {"id": aid, "message": "Alerte créée"}

@app.delete("/api/alerts/{alert_id}")
def api_delete_alert(alert_id: int):
    db.delete_price_alert(alert_id)
    return {"message": "Alerte supprimée"}


def _notify_telegram(text: str) -> None:
    """Envoie un message via le bot Telegram déjà utilisé par le scanner pré-ouverture
    (mêmes secrets TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID, configurés sur Render)."""
    token   = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        logger.warning("Notification alerte non envoyée (Telegram) : TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID absents")
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10,
        )
    except Exception as e:
        logger.warning(f"Erreur envoi Telegram: {e}")


def _notify_email(subject: str, body: str) -> None:
    """Envoie un email via SMTP Gmail — canal de secours en plus de Telegram.
    Nécessite un mot de passe d'application Gmail (pas le mot de passe du compte) :
    https://myaccount.google.com/apppasswords"""
    user = (os.environ.get("GMAIL_USER") or "").strip()
    # Gmail affiche le mot de passe d'application avec des espaces (lisibilité) ;
    # l'API SMTP attend les 16 caractères sans espace.
    pwd  = (os.environ.get("GMAIL_APP_PASSWORD") or "").replace(" ", "")
    to   = (os.environ.get("EMAIL_TO") or user).strip()
    if not user or not pwd or not to:
        logger.warning("Notification alerte non envoyée (email) : GMAIL_USER/GMAIL_APP_PASSWORD absents")
        return
    # Render ne route pas l'IPv6 sortant ; smtp.gmail.com publie une adresse AAAA
    # que la résolution DNS standard préfère, d'où "[Errno 101] Network is
    # unreachable". On force temporairement la résolution en IPv4.
    orig_getaddrinfo = socket.getaddrinfo
    def _ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
        return orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"]    = user
        msg["To"]      = to
        msg.set_content(body)
        socket.getaddrinfo = _ipv4_only
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
            smtp.login(user, pwd)
            smtp.send_message(msg)
    except Exception as e:
        logger.warning(f"Erreur envoi email: {e}")
    finally:
        socket.getaddrinfo = orig_getaddrinfo


def _check_price_alerts():
    """Vérifie les alertes actives après chaque refresh de cours."""
    try:
        alerts = db.get_price_alerts(active_only=True)
        if not alerts:
            return
        triggered = []
        for alert in alerts:
            latest = db.get_latest_price(alert["symbol"])
            if not latest or not latest.get("close"):
                continue
            price = latest["close"]
            hit = (alert["direction"] == "above" and price >= alert["target_price"]) or \
                  (alert["direction"] == "below" and price <= alert["target_price"])
            if hit:
                db.trigger_price_alert(alert["id"])
                triggered.append(alert)
                sens = "≥" if alert["direction"] == "above" else "≤"
                logger.info(
                    f"ALERTE {alert['symbol']} : cours {price} FCFA {sens} cible {alert['target_price']} FCFA"
                )
                _notify_telegram(
                    f"🔔 *Alerte BRVM Analytics*\n"
                    f"*{alert['symbol']}* a atteint {price:,.0f} FCFA "
                    f"({sens} cible {alert['target_price']:,.0f} FCFA)"
                )
                _notify_email(
                    f"🔔 Alerte BRVM — {alert['symbol']}",
                    f"{alert['symbol']} a atteint {price:,.0f} FCFA "
                    f"({sens} cible {alert['target_price']:,.0f} FCFA)."
                )
        if triggered:
            _sentiment_cache["data"] = None
    except Exception as e:
        logger.warning(f"Erreur vérification alertes: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# ─── CALENDRIER AGO / ÉVÉNEMENTS ─────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/calendar/events")
def api_get_events(upcoming: bool = False):
    return {"events": db.get_ago_events(upcoming_only=upcoming)}

@app.post("/api/calendar/events")
def api_add_event(body: dict):
    if not body.get("event_type") or not body.get("event_date"):
        return JSONResponse({"error": "event_type et event_date requis"}, 400)
    eid = db.add_ago_event(body)
    return {"id": eid, "message": "Événement ajouté"}

@app.delete("/api/calendar/events/{event_id}")
def api_delete_event(event_id: int):
    db.delete_ago_event(event_id)
    return {"message": "Événement supprimé"}
