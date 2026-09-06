"""Couche base de données SQLite pour BRVM Analytics."""
import sqlite3
import os
from pathlib import Path
from datetime import datetime, date
from typing import List, Dict, Optional, Any

DB_PATH = Path(__file__).parent / "data" / "brvm.db"

# ─── 47 valeurs officiellement cotées à la BRVM (mis à jour avril 2026) ──────
# Sources : brvm.org, afx.kwayisi.org, sikafinance.com
# Changements récents :
#   LNBB (Loterie Nationale Bénin) : introduction 13 déc. 2024
#   BICB (BIIC Bénin) : introduction 28 avr. 2025
#   SVOC (Movis CI, ex-SOVO) : radiation 26 juin 2025
#   TTSN / TTBN / TTBF : jamais cotées à la BRVM
#   SEMC : rebaptisée Eviosys Packaging SIEM (ex-Crown SIEM)
#   SDSC : rebaptisée AGL CI (ex-Bolloré Transport & Logistique)
#   SIVC : rebaptisée Erium CI (ex-Air Liquide CI)
#   SDCC : SODECI (distribution d'eau), pas SODE agricole
#   UNXC : Uniwax CI (textile), UNLC : Unilever CI
#   Symboles corrigés : BOAC (pas BOACI), BOAS (pas BOASN),
#                       NSBC (pas NSIAC), NTLC (pas NSTC),
#                       SLBC (pas SLBA), STBC (pas STAB)
SEED_STOCKS = [
    # ── Télécommunications (3) ───────────────────────────────────────────────
    ("SNTS",  "Sonatel",                                        "Télécommunications",    "Sénégal",       "SN0000000020"),
    ("ORAC",  "Orange Côte d'Ivoire",                          "Télécommunications",    "Côte d'Ivoire", "CI0000000097"),
    ("ONTBF", "ONATEL Burkina Faso",                           "Télécommunications",    "Burkina Faso",  "BF0000000016"),
    # ── Finance / Banques (17) ───────────────────────────────────────────────
    ("BICC",  "BICI Côte d'Ivoire",                            "Finance",               "Côte d'Ivoire", "CI0000000030"),
    ("BICB",  "BIIC Bénin",                                    "Finance",               "Bénin",         "BJ0000000020"),
    ("BOAB",  "Bank Of Africa Bénin",                          "Finance",               "Bénin",         "BJ0000000012"),
    ("BOABF", "Bank Of Africa Burkina Faso",                   "Finance",               "Burkina Faso",  "BF0000000008"),
    ("BOAC",  "Bank Of Africa Côte d'Ivoire",                  "Finance",               "Côte d'Ivoire", "CI0000000055"),
    ("BOAM",  "Bank Of Africa Mali",                           "Finance",               "Mali",          "ML0000000012"),
    ("BOAN",  "Bank Of Africa Niger",                          "Finance",               "Niger",         "NE0000000004"),
    ("BOAS",  "Bank Of Africa Sénégal",                        "Finance",               "Sénégal",       "SN0000000038"),
    ("CABC",  "Compagnie Africaine de Banque CI",              "Finance",               "Côte d'Ivoire", ""),
    ("CBIBF", "Coris Bank International Burkina Faso",         "Finance",               "Burkina Faso",  "BF0000000024"),
    ("ECOC",  "Ecobank Côte d'Ivoire",                         "Finance",               "Côte d'Ivoire", "CI0000000063"),
    ("ETIT",  "Ecobank Transnational Incorporated",            "Finance",               "Togo",          "TG0000000047"),
    ("NSBC",  "NSIA Banque Côte d'Ivoire",                     "Finance",               "Côte d'Ivoire", "CI0000000170"),
    ("ORGT",  "Oragroup Togo",                                 "Finance",               "Togo",          "TG0000000063"),
    ("SAFC",  "SAFCA — Alios Finance Côte d'Ivoire",           "Finance",               "Côte d'Ivoire", "CI0000000186"),
    ("SGBC",  "Société Générale de Banques en Côte d'Ivoire",  "Finance",               "Côte d'Ivoire", "CI0000000071"),
    ("SIBC",  "Société Ivoirienne de Banque",                  "Finance",               "Côte d'Ivoire", "CI0000000188"),
    # ── Distribution Pétrolière (3) ──────────────────────────────────────────
    ("SHEC",  "Vivo Energy Côte d'Ivoire",                     "Distribution Pétrolière","Côte d'Ivoire","CI0000000156"),
    ("TTLC",  "TotalEnergies Marketing Côte d'Ivoire",         "Distribution Pétrolière","Côte d'Ivoire","CI0000000022"),
    ("TTLS",  "TotalEnergies Marketing Sénégal",               "Distribution Pétrolière","Sénégal",      "SN0000000012"),
    # ── Industrie / Agroalimentaire (12) ─────────────────────────────────────
    ("BNBC",  "Bernabé Côte d'Ivoire",                         "Industrie",             "Côte d'Ivoire", "CI0000000196"),
    ("CFAC",  "CFAO Motors Côte d'Ivoire",                     "Industrie",             "Côte d'Ivoire", "CI0000000153"),
    ("FTSC",  "Filtisac Côte d'Ivoire",                        "Industrie",             "Côte d'Ivoire", "CI0000000105"),
    ("NEIC",  "NEI-CEDA Côte d'Ivoire",                        "Industrie",             "Côte d'Ivoire", "CI0000000162"),
    ("NTLC",  "Nestlé Côte d'Ivoire",                          "Industrie",             "Côte d'Ivoire", "CI0000000014"),
    ("SEMC",  "Eviosys Packaging SIEM Côte d'Ivoire",          "Industrie",             "Côte d'Ivoire", "CI0000000113"),
    ("SICC",  "SICABLE Côte d'Ivoire",                         "Industrie",             "Côte d'Ivoire", "CI0000000089"),
    ("SIVC",  "Erium Côte d'Ivoire (ex-Air Liquide CI)",       "Industrie",             "Côte d'Ivoire", "CI0000000121"),
    ("SLBC",  "Solibra Côte d'Ivoire",                         "Industrie",             "Côte d'Ivoire", "CI0000000006"),
    ("SMBC",  "SMB — Sté Multinationale de Bitumes CI",        "Industrie",             "Côte d'Ivoire", "CI0000000148"),
    ("STBC",  "SITAB — Sté Ivoirienne des Tabacs",             "Industrie",             "Côte d'Ivoire", "CI0000000136"),
    ("UNXC",  "Uniwax Côte d'Ivoire",                          "Industrie",             "Côte d'Ivoire", "CI0000000048"),
    # ── Agriculture / Plantations (6) ────────────────────────────────────────
    ("PALC",  "Palm Côte d'Ivoire",                            "Agriculture",           "Côte d'Ivoire", "CI0000000038"),
    ("PRSC",  "Tractafric Motors Côte d'Ivoire",               "Agriculture",           "Côte d'Ivoire", "CI0000000178"),
    ("SCRC",  "Sucrivoire Côte d'Ivoire",                      "Agriculture",           "Côte d'Ivoire", "CI0000000144"),
    ("SOGC",  "SOGB — Sté des Caoutchoucs de Grand-Béréby",    "Agriculture",           "Côte d'Ivoire", "CI0000000079"),
    ("SPHC",  "SAPH — Sté Africaine de Plantations d'Hévéas",  "Agriculture",           "Côte d'Ivoire", "CI0000000087"),
    ("UNLC",  "Unilever Côte d'Ivoire",                        "Agriculture",           "Côte d'Ivoire", "CI0000000160"),
    # ── Énergie / Services Publics (3) ───────────────────────────────────────
    ("CIEC",  "CIE — Compagnie Ivoirienne d'Électricité",      "Énergie",               "Côte d'Ivoire", "CI0000000046"),
    ("SDCC",  "SODECI — Sté de Distribution d'Eau de CI",      "Services Publics",      "Côte d'Ivoire", "CI0000000154"),
    # ── Transport / Logistique (2) ────────────────────────────────────────────
    ("ABJC",  "Servair Abidjan Côte d'Ivoire",                 "Transport",             "Côte d'Ivoire", "CI0000000129"),
    ("SDSC",  "AGL CI — Africa Global Logistics",              "Transport",             "Côte d'Ivoire", "CI0000000145"),
    # ── Services (3) ─────────────────────────────────────────────────────────
    ("LNBB",  "Loterie Nationale du Bénin",                    "Services",              "Bénin",         "BJ0000000016"),
    ("STAC",  "SETAO — Sté d'Études et de Travaux d'AO CI",    "Services",              "Côte d'Ivoire", "CI0000000172"),
]


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS stocks (
            symbol       TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            sector       TEXT,
            country      TEXT,
            isin         TEXT,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS prices (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol          TEXT NOT NULL,
            date            TEXT NOT NULL,
            open            REAL,
            high            REAL,
            low             REAL,
            close           REAL NOT NULL,
            volume          REAL,
            market_cap      REAL,
            variation_pct   REAL,
            reference_price REAL,
            UNIQUE(symbol, date),
            FOREIGN KEY (symbol) REFERENCES stocks(symbol)
        );

        CREATE TABLE IF NOT EXISTS market_data (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            date            TEXT NOT NULL UNIQUE,
            brvm_composite  REAL,
            brvm_10         REAL,
            advances        INTEGER DEFAULT 0,
            declines        INTEGER DEFAULT 0,
            unchanged       INTEGER DEFAULT 0,
            total_volume    REAL,
            total_value     REAL
        );

        CREATE TABLE IF NOT EXISTS fundamentals (
            symbol              TEXT PRIMARY KEY,
            per                 REAL,
            dividend_yield      REAL,
            dividend_per_share  REAL,
            book_value          REAL,
            revenue             REAL,
            net_income          REAL,
            eps                 REAL,
            last_updated        TEXT,
            FOREIGN KEY (symbol) REFERENCES stocks(symbol)
        );

        CREATE TABLE IF NOT EXISTS news (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL UNIQUE,
            url         TEXT,
            source      TEXT,
            published   TEXT,
            fetched_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol      TEXT NOT NULL,
            signal      TEXT,
            note        TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_prices_sym_date  ON prices(symbol, date);
        CREATE INDEX IF NOT EXISTS idx_market_date      ON market_data(date);

        CREATE TABLE IF NOT EXISTS portfolio_positions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol      TEXT NOT NULL,
            quantity    REAL NOT NULL,
            entry_price REAL NOT NULL,
            entry_date  TEXT,
            broker      TEXT,
            notes       TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (symbol) REFERENCES stocks(symbol)
        );

        CREATE TABLE IF NOT EXISTS price_alerts (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol       TEXT NOT NULL,
            target_price REAL NOT NULL,
            direction    TEXT NOT NULL,
            label        TEXT,
            email        TEXT,
            triggered_at TEXT,
            is_active    INTEGER DEFAULT 1,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (symbol) REFERENCES stocks(symbol)
        );

        CREATE TABLE IF NOT EXISTS ago_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol      TEXT,
            event_type  TEXT NOT NULL,
            event_date  TEXT NOT NULL,
            description TEXT,
            source      TEXT DEFAULT 'manuel',
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS recommendation_history (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol              TEXT NOT NULL,
            date                TEXT NOT NULL,
            recommendation      TEXT NOT NULL,
            score               REAL,
            score_technique     REAL,
            score_fondamentale  REAL,
            score_psychologie   REAL,
            score_sekide        REAL,
            created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(symbol, date),
            FOREIGN KEY (symbol) REFERENCES stocks(symbol)
        );

        CREATE TABLE IF NOT EXISTS dividend_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol          TEXT NOT NULL,
            year            INTEGER NOT NULL,
            dps_gross       REAL,
            dps_net         REAL,
            yield_gross     REAL,
            yield_net       REAL,
            payment_date    TEXT,
            status          TEXT DEFAULT 'officiel',
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(symbol, year),
            FOREIGN KEY (symbol) REFERENCES stocks(symbol)
        );

        CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON price_alerts(symbol, is_active);
        CREATE INDEX IF NOT EXISTS idx_ago_date      ON ago_events(event_date);
        CREATE INDEX IF NOT EXISTS idx_reco_hist_sym ON recommendation_history(symbol, date);
        CREATE INDEX IF NOT EXISTS idx_div_hist_sym  ON dividend_history(symbol, year);
    """)
    # ── Migration 1 : ajouter colonne dividend_per_share si absente ──────────
    try:
        c.execute("ALTER TABLE fundamentals ADD COLUMN dividend_per_share REAL")
        conn.commit()
    except Exception:
        pass

    # ── Migration 5 : statut du dividende annoncé / officiel BRVM ────────────
    # 'aucun'    = pas de dividende cette année
    # 'annoncé'  = dividende annoncé en AGO ou par la société (non encore publié au BOC)
    # 'officiel' = dividende officialisé et publié au Bulletin Officiel de la Cote (BOC)
    try:
        c.execute("ALTER TABLE fundamentals ADD COLUMN div_status TEXT DEFAULT 'aucun'")
        conn.commit()
    except Exception:
        pass

    # ── Migration 6 : date de mise en paiement du dividende ──────────────────
    try:
        c.execute("ALTER TABLE fundamentals ADD COLUMN div_payment_date TEXT")
        conn.commit()
    except Exception:
        pass

    # ── Migration 7 : exercice fiscal du dividende ────────────────────────────
    # Exemple : dividende de l'exercice 2025 annoncé lors de l'AGO d'avril 2026
    #   → div_exercice_year = 2025
    # Permet de distinguer les dividendes actuels (exercice récent) des anciens (déjà payés)
    try:
        c.execute("ALTER TABLE fundamentals ADD COLUMN div_exercice_year INTEGER")
        conn.commit()
    except Exception:
        pass

    # ── Migration 2 : corriger les symboles erronés hérités ──────────────────
    # Renommage symboles → symboles officiels BRVM actuels
    _SYMBOL_RENAMES = [
        ("BOACI", "BOAC"),   # Bank Of Africa CI
        ("BOASN", "BOAS"),   # Bank Of Africa Sénégal
        ("NSIAC", "NSBC"),   # NSIA Banque CI
        ("NSTC",  "NTLC"),   # Nestlé CI
        ("SLBA",  "SLBC"),   # Solibra CI
        ("STAB",  "STBC"),   # SITAB CI
    ]
    for old_sym, new_sym in _SYMBOL_RENAMES:
        # Stocks table — OR IGNORE évite la violation de contrainte si le nouveau symbole existe déjà
        c.execute("UPDATE OR IGNORE stocks SET symbol=? WHERE symbol=?", (new_sym, old_sym))
        c.execute("DELETE FROM stocks WHERE symbol=?", (old_sym,))  # nettoyer l'ancien si resté
        # Prices table
        c.execute("UPDATE OR IGNORE prices SET symbol=? WHERE symbol=?", (new_sym, old_sym))
        c.execute("DELETE FROM prices WHERE symbol=?", (old_sym,))
        # Fundamentals table
        c.execute("UPDATE OR IGNORE fundamentals SET symbol=? WHERE symbol=?", (new_sym, old_sym))
        c.execute("DELETE FROM fundamentals WHERE symbol=?", (old_sym,))

    # ── Migration 3 : supprimer les titres non cotés à la BRVM ──────────────
    _NOT_LISTED = ["TTBF", "TTBN", "TTSN", "SVOC", "SOLC", "SONC", "SOBFC",
                   "STLC", "BNKC", "BOASN", "BOACI", "NSIAC", "NSTC",
                   "SLBA", "STAB"]
    for sym in _NOT_LISTED:
        c.execute("DELETE FROM fundamentals WHERE symbol=?", (sym,))
        c.execute("DELETE FROM prices WHERE symbol=?", (sym,))
        c.execute("DELETE FROM stocks WHERE symbol=?", (sym,))

    # ── Migration 4 : corriger secteurs et noms mis à jour ───────────────────
    _STOCK_UPDATES = [
        # symbol, name, sector, country
        ("SDCC",  "SODECI — Sté de Distribution d'Eau de CI",     "Services Publics",      "Côte d'Ivoire"),
        ("SDSC",  "AGL CI — Africa Global Logistics",             "Transport",             "Côte d'Ivoire"),
        ("SEMC",  "Eviosys Packaging SIEM Côte d'Ivoire",         "Industrie",             "Côte d'Ivoire"),
        ("SIVC",  "Erium Côte d'Ivoire (ex-Air Liquide CI)",      "Industrie",             "Côte d'Ivoire"),
        ("SMBC",  "SMB — Sté Multinationale de Bitumes CI",       "Industrie",             "Côte d'Ivoire"),
        ("UNXC",  "Uniwax Côte d'Ivoire",                         "Industrie",             "Côte d'Ivoire"),
        ("UNLC",  "Unilever Côte d'Ivoire",                       "Agriculture",           "Côte d'Ivoire"),
        ("STBC",  "SITAB — Sté Ivoirienne des Tabacs",            "Industrie",             "Côte d'Ivoire"),
        ("SLBC",  "Solibra Côte d'Ivoire",                        "Industrie",             "Côte d'Ivoire"),
        ("NTLC",  "Nestlé Côte d'Ivoire",                         "Industrie",             "Côte d'Ivoire"),
        ("BOAC",  "Bank Of Africa Côte d'Ivoire",                 "Finance",               "Côte d'Ivoire"),
        ("BOAS",  "Bank Of Africa Sénégal",                       "Finance",               "Sénégal"),
        ("NSBC",  "NSIA Banque Côte d'Ivoire",                    "Finance",               "Côte d'Ivoire"),
        ("PRSC",  "Tractafric Motors Côte d'Ivoire",              "Agriculture",           "Côte d'Ivoire"),
        ("SAFC",  "SAFCA — Alios Finance Côte d'Ivoire",          "Finance",               "Côte d'Ivoire"),
        ("SGBC",  "Société Générale de Banques en Côte d'Ivoire", "Finance",               "Côte d'Ivoire"),
        ("SHEC",  "Vivo Energy Côte d'Ivoire",                    "Distribution Pétrolière","Côte d'Ivoire"),
        ("CFAC",  "CFAO Motors Côte d'Ivoire",                    "Industrie",             "Côte d'Ivoire"),
        ("SICC",  "SICABLE Côte d'Ivoire",                        "Industrie",             "Côte d'Ivoire"),
        ("BNBC",  "Bernabé Côte d'Ivoire",                        "Industrie",             "Côte d'Ivoire"),
        ("SCRC",  "Sucrivoire Côte d'Ivoire",                     "Agriculture",           "Côte d'Ivoire"),
        ("STAC",  "SETAO — Sté d'Études et de Travaux d'AO CI",   "Services",              "Côte d'Ivoire"),
        ("ABJC",  "Servair Abidjan Côte d'Ivoire",                "Transport",             "Côte d'Ivoire"),
        # Correctifs pays manquants (INSERT OR IGNORE ne met pas à jour les lignes existantes)
        ("NEIC",  "NEI-CEDA Côte d'Ivoire",                        "Industrie",             "Côte d'Ivoire"),
        ("ORGT",  "Oragroup Togo",                                  "Finance",               "Togo"),
    ]
    for sym, name, sector, country in _STOCK_UPDATES:
        c.execute(
            "UPDATE stocks SET name=?, sector=?, country=? WHERE symbol=?",
            (name, sector, country, sym)
        )

    # ── Migration 8 : supprimer les lignes "samedi/dimanche" en base ─────────
    # La BRVM ne cote pas le week-end : ces lignes proviennent d'un ancien bug
    # où les sources ré-affichaient les cours de vendredi sous la date du jour.
    # strftime('%w', date) : 0 = dimanche, 6 = samedi
    c.execute("DELETE FROM prices WHERE CAST(strftime('%w', date) AS INTEGER) IN (0, 6)")

    # ── Migration 9 : source du cours (AFX vs saisie manuelle de correction) ──
    try:
        c.execute("ALTER TABLE prices ADD COLUMN source TEXT DEFAULT 'AFX'")
        conn.commit()
    except Exception:
        pass

    conn.commit()

    # ── Seed stocks (INSERT OR IGNORE — ne touche pas aux lignes existantes) ─
    c.executemany(
        "INSERT OR IGNORE INTO stocks (symbol, name, sector, country, isin) VALUES (?,?,?,?,?)",
        SEED_STOCKS,
    )
    conn.commit()
    conn.close()


# ─── Stocks ─────────────────────────────────────────────────────────────────

def get_all_stocks() -> List[Dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT symbol, name, sector, country FROM stocks ORDER BY symbol"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_stock(symbol: str) -> Optional[Dict]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM stocks WHERE symbol=?", (symbol.upper(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Prices ─────────────────────────────────────────────────────────────────

def upsert_price(data: Dict) -> None:
    conn = get_connection()
    conn.execute("""
        INSERT INTO prices (symbol,date,open,high,low,close,volume,market_cap,variation_pct,reference_price)
        VALUES (:symbol,:date,:open,:high,:low,:close,:volume,:market_cap,:variation_pct,:reference_price)
        ON CONFLICT(symbol,date) DO UPDATE SET
            open=excluded.open, high=excluded.high, low=excluded.low,
            close=excluded.close, volume=excluded.volume,
            market_cap=excluded.market_cap,
            variation_pct=excluded.variation_pct,
            reference_price=excluded.reference_price
        WHERE prices.source IS NOT 'MANUEL'
    """, data)
    conn.commit()
    conn.close()


def upsert_prices_bulk(rows: List[Dict]) -> None:
    if not rows:
        return
    conn = get_connection()
    conn.executemany("""
        INSERT INTO prices (symbol,date,open,high,low,close,volume,market_cap,variation_pct,reference_price)
        VALUES (:symbol,:date,:open,:high,:low,:close,:volume,:market_cap,:variation_pct,:reference_price)
        ON CONFLICT(symbol,date) DO UPDATE SET
            open=excluded.open, high=excluded.high, low=excluded.low,
            close=excluded.close, volume=excluded.volume,
            market_cap=excluded.market_cap,
            variation_pct=excluded.variation_pct,
            reference_price=excluded.reference_price
        WHERE prices.source IS NOT 'MANUEL'
    """, rows)
    conn.commit()
    conn.close()


def set_manual_price(data: Dict) -> None:
    """Corrige/insère le cours de clôture d'un titre pour une date donnée.
    Source = 'MANUEL' — prioritaire sur les données scrapées (AFX) pour cette date,
    utile quand la source est périmée sur un titre peu liquide."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO prices (symbol,date,open,high,low,close,volume,market_cap,variation_pct,reference_price,source)
        VALUES (:symbol,:date,:open,:high,:low,:close,:volume,:market_cap,:variation_pct,:reference_price,'MANUEL')
        ON CONFLICT(symbol,date) DO UPDATE SET
            close=excluded.close,
            variation_pct=excluded.variation_pct,
            reference_price=excluded.reference_price,
            source='MANUEL'
    """, data)
    conn.commit()
    conn.close()


def delete_manual_price(symbol: str, date: str) -> None:
    """Supprime une correction manuelle — le cours scrapé reprendra le dessus au prochain refresh."""
    conn = get_connection()
    conn.execute("DELETE FROM prices WHERE symbol=? AND date=? AND source='MANUEL'", (symbol.upper(), date))
    conn.commit()
    conn.close()


def get_prices(symbol: str, days: int = 365) -> List[Dict]:
    """Retourne les cours des `days` derniers jours calendaires (filtre par date, pas LIMIT)."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT date,open,high,low,close,volume,market_cap,variation_pct
           FROM prices
           WHERE symbol = ?
             AND date >= date('now', ? || ' days')
           ORDER BY date ASC""",
        (symbol.upper(), f"-{days}"),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_latest_price(symbol: str) -> Optional[Dict]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM prices WHERE symbol=? ORDER BY date DESC LIMIT 1",
        (symbol.upper(),),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_latest_prices_all() -> List[Dict]:
    """Last price for each stock with stock info joined."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT s.symbol, s.name, s.sector, s.country,
               p.date, p.close, p.volume, p.market_cap, p.variation_pct, p.reference_price
        FROM stocks s
        LEFT JOIN prices p ON p.symbol = s.symbol
            AND p.date = (SELECT MAX(date) FROM prices WHERE symbol = s.symbol)
        ORDER BY s.symbol
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Market data ─────────────────────────────────────────────────────────────

def upsert_market_data(data: Dict) -> None:
    conn = get_connection()
    conn.execute("""
        INSERT INTO market_data (date,brvm_composite,brvm_10,advances,declines,unchanged,total_volume,total_value)
        VALUES (:date,:brvm_composite,:brvm_10,:advances,:declines,:unchanged,:total_volume,:total_value)
        ON CONFLICT(date) DO UPDATE SET
            brvm_composite=excluded.brvm_composite, brvm_10=excluded.brvm_10,
            advances=excluded.advances, declines=excluded.declines,
            unchanged=excluded.unchanged, total_volume=excluded.total_volume,
            total_value=excluded.total_value
    """, data)
    conn.commit()
    conn.close()


def get_market_history(days: int = 90) -> List[Dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM market_data ORDER BY date DESC LIMIT ?", (days,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def get_latest_market() -> Optional[Dict]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM market_data ORDER BY date DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_brvm_composite_series(days: int = 400) -> List[Dict]:
    """Retourne la série historique du BRVM Composite (pour calcul Force Relative)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT date, brvm_composite FROM market_data
               WHERE brvm_composite IS NOT NULL
               ORDER BY date ASC
               LIMIT ?""",
            (days,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ─── Fundamentals ────────────────────────────────────────────────────────────

def upsert_fundamental(data: Dict) -> None:
    conn = get_connection()
    data["last_updated"] = datetime.utcnow().isoformat()
    # S'assurer que les clés manquantes sont présentes (None par défaut)
    for col in ("per","dividend_yield","dividend_per_share","book_value","revenue","net_income",
                "eps","div_status","div_payment_date","div_exercice_year"):
        data.setdefault(col, None)
    conn.execute("""
        INSERT INTO fundamentals
            (symbol,per,dividend_yield,dividend_per_share,book_value,revenue,net_income,eps,
             div_status,div_payment_date,div_exercice_year,last_updated)
        VALUES
            (:symbol,:per,:dividend_yield,:dividend_per_share,:book_value,:revenue,:net_income,:eps,
             :div_status,:div_payment_date,:div_exercice_year,:last_updated)
        ON CONFLICT(symbol) DO UPDATE SET
            per=COALESCE(excluded.per, per),
            -- ── Protection données sikafinance (exercice 2025) ─────────────────
            -- Si la DB a déjà un div_exercice_year (= seedé depuis sikafinance)
            -- ET que la mise à jour n'apporte PAS de div_exercice_year (= scraper AFX sans contexte)
            -- → ne JAMAIS écraser les valeurs dividende officielles
            dividend_yield = CASE
                WHEN div_exercice_year IS NOT NULL AND excluded.div_exercice_year IS NULL
                THEN dividend_yield
                ELSE COALESCE(excluded.dividend_yield, dividend_yield)
            END,
            dividend_per_share = CASE
                WHEN div_exercice_year IS NOT NULL AND excluded.div_exercice_year IS NULL
                THEN dividend_per_share
                ELSE COALESCE(excluded.dividend_per_share, dividend_per_share)
            END,
            div_status = CASE
                WHEN div_exercice_year IS NOT NULL AND excluded.div_exercice_year IS NULL
                THEN div_status
                ELSE COALESCE(excluded.div_status, div_status)
            END,
            div_payment_date = CASE
                WHEN div_exercice_year IS NOT NULL AND excluded.div_exercice_year IS NULL
                THEN div_payment_date
                ELSE COALESCE(excluded.div_payment_date, div_payment_date)
            END,
            div_exercice_year = CASE
                WHEN div_exercice_year IS NOT NULL AND excluded.div_exercice_year IS NULL
                THEN div_exercice_year
                ELSE COALESCE(excluded.div_exercice_year, div_exercice_year)
            END,
            -- ── Autres colonnes : comportement COALESCE standard ───────────────
            book_value=COALESCE(excluded.book_value, book_value),
            revenue=COALESCE(excluded.revenue, revenue),
            net_income=COALESCE(excluded.net_income, net_income),
            eps=COALESCE(excluded.eps, eps),
            last_updated=excluded.last_updated
    """, data)
    conn.commit()
    conn.close()


def get_fundamental(symbol: str) -> Optional[Dict]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM fundamentals WHERE symbol=?", (symbol.upper(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def force_upsert_dividend(data: Dict) -> None:
    """
    Mise à jour autoritaire des colonnes dividende d'un titre.
    Contrairement à upsert_fundamental() qui utilise COALESCE (préserve l'existant),
    cette fonction ÉCRASE TOUJOURS les champs dividende — conçue pour le seeding
    des données officielles (ex : tableau sikafinance).
    Les autres colonnes (per, eps, book_value…) ne sont pas touchées.
    """
    conn = get_connection()
    data["last_updated"] = datetime.utcnow().isoformat()
    # Créer la ligne si elle n'existe pas encore (INSERT OR IGNORE)
    conn.execute(
        "INSERT OR IGNORE INTO fundamentals (symbol, last_updated) VALUES (:symbol, :last_updated)",
        {"symbol": data["symbol"], "last_updated": data["last_updated"]},
    )
    # Forcer la mise à jour des colonnes dividende sans COALESCE
    conn.execute("""
        UPDATE fundamentals
        SET dividend_per_share  = :dividend_per_share,
            dividend_yield      = :dividend_yield,
            div_status          = :div_status,
            div_payment_date    = :div_payment_date,
            div_exercice_year   = :div_exercice_year,
            last_updated        = :last_updated
        WHERE symbol = :symbol
    """, data)
    conn.commit()
    conn.close()


# ─── News ────────────────────────────────────────────────────────────────────

def save_news(items: List[Dict]) -> None:
    """
    Insère des articles dans la table news.
    INSERT OR IGNORE garantit la déduplication grâce au UNIQUE sur title.
    En cas de collision (même titre), l'ancienne entrée est conservée.
    """
    if not items:
        return
    conn = get_connection()
    conn.executemany("""
        INSERT OR IGNORE INTO news (title, url, source, published)
        VALUES (:title, :url, :source, :published)
    """, items)
    conn.commit()
    conn.close()


def get_news(limit: int = 15) -> List[Dict]:
    """
    Retourne les N dernières news uniques par titre, ordonnées par date de publication
    (puis par fetched_at pour les articles sans date).
    """
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT title, url, source, published
        FROM news
        GROUP BY title
        ORDER BY MAX(published) DESC, MAX(fetched_at) DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Notes ───────────────────────────────────────────────────────────────────

def save_note(symbol: str, signal: str, note: str) -> None:
    conn = get_connection()
    conn.execute(
        "INSERT INTO notes (symbol,signal,note) VALUES (?,?,?)",
        (symbol.upper(), signal, note),
    )
    conn.commit()
    conn.close()


def get_notes(symbol: str) -> List[Dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT signal,note,created_at FROM notes WHERE symbol=? ORDER BY created_at DESC LIMIT 10",
        (symbol.upper(),),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Analytics helpers ───────────────────────────────────────────────────────

def count_prices(symbol: str) -> int:
    conn = get_connection()
    n = conn.execute(
        "SELECT COUNT(*) FROM prices WHERE symbol=?", (symbol.upper(),)
    ).fetchone()[0]
    conn.close()
    return n


def get_52w_highlow(symbol: str) -> Dict:
    conn = get_connection()
    row = conn.execute("""
        SELECT MAX(close) as high_52w, MIN(close) as low_52w
        FROM prices
        WHERE symbol=?
          AND date >= date('now','-365 days')
    """, (symbol.upper(),)).fetchone()
    conn.close()
    return {"high_52w": row["high_52w"], "low_52w": row["low_52w"]} if row else {}


# ─── Portfolio Positions ──────────────────────────────────────────────────────

def get_portfolio_positions() -> List[Dict]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT p.*, s.name, s.sector, s.country
        FROM portfolio_positions p
        LEFT JOIN stocks s ON s.symbol = p.symbol
        ORDER BY p.symbol, p.created_at
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_portfolio_position(data: Dict) -> int:
    conn = get_connection()
    cur = conn.execute("""
        INSERT INTO portfolio_positions (symbol, quantity, entry_price, entry_date, broker, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (data["symbol"].upper(), data["quantity"], data["entry_price"],
          data.get("entry_date"), data.get("broker"), data.get("notes")))
    conn.commit()
    rid = cur.lastrowid
    conn.close()
    return rid

def update_portfolio_position(pid: int, data: Dict) -> None:
    conn = get_connection()
    conn.execute("""
        UPDATE portfolio_positions
        SET quantity=?, entry_price=?, entry_date=?, broker=?, notes=?
        WHERE id=?
    """, (data["quantity"], data["entry_price"], data.get("entry_date"),
          data.get("broker"), data.get("notes"), pid))
    conn.commit()
    conn.close()

def delete_portfolio_position(pid: int) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM portfolio_positions WHERE id=?", (pid,))
    conn.commit()
    conn.close()


# ─── Price Alerts ─────────────────────────────────────────────────────────────

def get_price_alerts(active_only: bool = False) -> List[Dict]:
    conn = get_connection()
    q = "SELECT * FROM price_alerts"
    if active_only:
        q += " WHERE is_active=1"
    q += " ORDER BY symbol, target_price"
    rows = conn.execute(q).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_price_alert(data: Dict) -> int:
    conn = get_connection()
    cur = conn.execute("""
        INSERT INTO price_alerts (symbol, target_price, direction, label, email)
        VALUES (?, ?, ?, ?, ?)
    """, (data["symbol"].upper(), data["target_price"], data["direction"],
          data.get("label"), data.get("email")))
    conn.commit()
    rid = cur.lastrowid
    conn.close()
    return rid

def delete_price_alert(alert_id: int) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM price_alerts WHERE id=?", (alert_id,))
    conn.commit()
    conn.close()

def trigger_price_alert(alert_id: int) -> None:
    from datetime import datetime, timezone
    conn = get_connection()
    conn.execute("""
        UPDATE price_alerts SET is_active=0, triggered_at=?
        WHERE id=?
    """, (datetime.now(timezone.utc).isoformat(), alert_id))
    conn.commit()
    conn.close()


# ─── AGO / Events Calendar ────────────────────────────────────────────────────

def get_ago_events(upcoming_only: bool = False) -> List[Dict]:
    from datetime import date
    conn = get_connection()
    if upcoming_only:
        rows = conn.execute("""
            SELECT * FROM ago_events
            WHERE event_date >= ?
            ORDER BY event_date
        """, (date.today().isoformat(),)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM ago_events ORDER BY event_date DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_ago_event(data: Dict) -> int:
    conn = get_connection()
    cur = conn.execute("""
        INSERT INTO ago_events (symbol, event_type, event_date, description, source)
        VALUES (?, ?, ?, ?, ?)
    """, (data.get("symbol", "").upper() or None, data["event_type"],
          data["event_date"], data.get("description"), data.get("source", "manuel")))
    conn.commit()
    rid = cur.lastrowid
    conn.close()
    return rid

def delete_ago_event(event_id: int) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM ago_events WHERE id=?", (event_id,))
    conn.commit()
    conn.close()


def save_recommendation_history(symbol: str, date_str: str, reco: Dict) -> None:
    """Enregistre (ou met à jour) la recommandation du jour pour un titre."""
    conn = get_connection()
    try:
        axes = reco.get("axes") or {}
        conn.execute("""
            INSERT INTO recommendation_history
                (symbol, date, recommendation, score, score_technique, score_fondamentale,
                 score_psychologie, score_sekide)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(symbol, date) DO UPDATE SET
                recommendation     = excluded.recommendation,
                score              = excluded.score,
                score_technique    = excluded.score_technique,
                score_fondamentale = excluded.score_fondamentale,
                score_psychologie  = excluded.score_psychologie,
                score_sekide       = excluded.score_sekide,
                created_at         = CURRENT_TIMESTAMP
        """, (
            symbol.upper(),
            date_str,
            reco.get("recommendation"),
            reco.get("score"),
            axes.get("technique",    {}).get("score"),
            axes.get("fondamentale", {}).get("score"),
            axes.get("psychologie",  {}).get("score"),
            axes.get("sekide",       {}).get("score"),
        ))
        conn.commit()
    finally:
        conn.close()


def save_dividend_history(data: Dict) -> None:
    """Sauvegarde ou met à jour une entrée dans l'historique des dividendes."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO dividend_history (symbol, year, dps_gross, dps_net, yield_gross, yield_net, payment_date, status)
        VALUES (:symbol, :year, :dps_gross, :dps_net, :yield_gross, :yield_net, :payment_date, :status)
        ON CONFLICT(symbol, year) DO UPDATE SET
            dps_gross    = excluded.dps_gross,
            dps_net      = excluded.dps_net,
            yield_gross  = excluded.yield_gross,
            yield_net    = excluded.yield_net,
            payment_date = excluded.payment_date,
            status       = excluded.status
    """, data)
    conn.commit()
    conn.close()


def get_dividend_history(symbol: str, years: int = 10) -> List[Dict]:
    """Retourne l'historique des dividendes par exercice fiscal, ordre décroissant."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT year, dps_gross, dps_net, yield_gross, yield_net, payment_date, status
           FROM dividend_history WHERE symbol=? ORDER BY year DESC LIMIT ?""",
        (symbol.upper(), years)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_recommendation_history(symbol: str, days: int = 90) -> List[Dict]:
    """Retourne l'historique des recommandations sur N jours pour un titre."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT date, recommendation, score,
                   score_technique, score_fondamentale, score_psychologie, score_sekide
            FROM recommendation_history
            WHERE symbol = ?
              AND date >= date('now', ? || ' days')
            ORDER BY date ASC
        """, (symbol.upper(), f"-{days}")).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
