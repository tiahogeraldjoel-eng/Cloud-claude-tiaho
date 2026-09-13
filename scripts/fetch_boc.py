#!/usr/bin/env python3
"""
Télécharge le Bulletin Officiel de la Cote (BOC) depuis bfin.brvm.org.

Source primaire : https://bfin.brvm.org/boc/boc_jour.aspx
  → contient le lien de téléchargement du BOC du jour courant.
  → les PDFs sont à : https://bfin.brvm.org/boc/BOC_JOUR/BOC_YYYYMMDD.pdf

Usage:
    python3 fetch_boc.py [YYYY-MM-DD]

Retourne sur stdout :
    SUCCESS:/path/to/pdf
    SKIP:raison
    FAIL:raison

Exit code : 0 = succès ou skip normal, 1 = erreur téléchargement.
"""

import sys
import os
import re
import datetime
import time

try:
    import urllib.request
    import urllib.error
    import urllib.parse
except ImportError:
    print("FAIL:urllib manquant")
    sys.exit(1)

# ─── Configuration ────────────────────────────────────────────────────────────

BASE_URL   = "https://bfin.brvm.org"
PAGE_URL   = f"{BASE_URL}/boc/boc_jour.aspx"
TIMEOUT    = 30      # secondes par requête
MIN_SIZE   = 20_000  # taille minimale d'un PDF valide

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def is_trading_day(date: datetime.date) -> bool:
    """Lundi–vendredi (jours fériés non gérés — le script échoue proprement si absent)."""
    return date.weekday() < 5


def already_processed(date: datetime.date, reports_dir: str) -> bool:
    """Vérifie si un rapport BOC_REVU pour cette date existe déjà dans reports/."""
    if not os.path.isdir(reports_dir):
        return False
    date_iso = date.isoformat()
    return any(
        f.endswith("-BOC_REVU.md") and date_iso in f
        for f in os.listdir(reports_dir)
    )


def fetch_url(url: str, binary: bool = False):
    """Effectue une requête GET, retourne le contenu ou lève une exception."""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read()


def scrape_pdf_link(date: datetime.date) -> str | None:
    """
    Récupère la page boc_jour.aspx et en extrait le lien de téléchargement PDF.
    Retourne l'URL complète du PDF ou None si non trouvée.
    """
    try:
        print(f"  Scraping de la page du jour : {PAGE_URL}", flush=True)
        html = fetch_url(PAGE_URL).decode("utf-8", errors="replace")

        # Chercher des liens vers des PDFs du BOC
        # Patterns observés : BOC_JOUR/BOC_YYYYMMDD.pdf, boc_YYYYMMDD.pdf, etc.
        patterns = [
            r'href=["\']([^"\']*BOC[_/][^"\']*\.pdf)["\']',
            r'href=["\']([^"\']*boc[_/][^"\']*\.pdf)["\']',
            r'"([^"]*BOC_JOUR[^"]*\.pdf)"',
        ]
        for pat in patterns:
            for match in re.finditer(pat, html, re.IGNORECASE):
                href = match.group(1)
                if not href.startswith("http"):
                    href = BASE_URL.rstrip("/") + "/" + href.lstrip("/")
                print(f"  Lien trouvé dans la page : {href}")
                return href

        # Si pas de lien explicite, chercher le numéro du BOC et la date dans la page
        # pour construire l'URL directe
        print("  Aucun lien PDF trouvé dans la page — construction URL directe")
        return None

    except urllib.error.URLError as e:
        reason = str(e.reason) if hasattr(e, "reason") else str(e)
        if any(x in reason for x in ("403", "407", "blocked", "Forbidden")):
            print(
                f"FAIL:bfin.brvm.org est bloqué par la politique réseau de l'environnement. "
                f"Ajouter bfin.brvm.org dans les domaines autorisés de l'environnement Claude Code."
            )
            sys.exit(1)
        print(f"  Impossible d'accéder à la page : {reason}")
        return None
    except Exception as e:
        print(f"  Erreur lors du scraping : {e}")
        return None


def direct_urls(date: datetime.date) -> list:
    """
    Construit la liste des URLs directes à tester (sans passer par la page HTML).
    Ordre : source confirmée bfin.brvm.org en premier.
    """
    ds = date.strftime("%Y%m%d")
    return [
        # Source principale confirmée par l'utilisateur
        f"{BASE_URL}/boc/BOC_JOUR/BOC_{ds}.pdf",
        # Variante majuscules/minuscules
        f"{BASE_URL}/boc/boc_jour/boc_{ds}.pdf",
        # Site principal brvm.org (fallback)
        f"https://www.brvm.org/sites/default/files/boc_{ds}_1.pdf",
        f"https://www.brvm.org/sites/default/files/boc_{ds}.pdf",
        f"https://www.brvm.org/sites/default/files/boc_{ds}_2.pdf",
    ]


def download_pdf(url: str, output_path: str) -> bool:
    """
    Télécharge l'URL vers output_path.
    Retourne True si le fichier est un PDF valide, False sinon.
    """
    try:
        data = fetch_url(url, binary=True)
        if len(data) < MIN_SIZE:
            print(f"  Fichier trop petit ({len(data)} octets) — pas un BOC valide")
            return False
        if not data.startswith(b"%PDF"):
            print(f"  En-tête PDF manquant — réponse inattendue ({data[:80]!r})")
            return False
        with open(output_path, "wb") as f:
            f.write(data)
        print(f"SUCCESS:{output_path} ({len(data):,} octets)")
        return True
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} — {url}")
    except urllib.error.URLError as e:
        reason = str(e.reason) if hasattr(e, "reason") else str(e)
        if any(x in reason for x in ("403", "407", "blocked", "Forbidden")):
            print(
                f"FAIL:bfin.brvm.org est bloqué par la politique réseau. "
                f"Ajouter bfin.brvm.org dans les domaines autorisés de l'environnement."
            )
            sys.exit(1)
        print(f"  URLError — {reason}")
    except Exception as e:
        print(f"  Erreur — {e}")
    return False


# ─── Point d'entrée principal ─────────────────────────────────────────────────

def fetch_boc(date: datetime.date = None, output_dir: str = "/tmp") -> str | None:
    """
    Télécharge le BOC pour la date donnée.
    Retourne le chemin local du PDF si succès, None sinon.
    """
    if date is None:
        date = datetime.date.today()

    if not is_trading_day(date):
        print(f"SKIP:Jour non ouvré ({date.strftime('%A %d/%m/%Y')})")
        return None

    output_path = os.path.join(output_dir, f"BOC_{date.strftime('%Y%m%d')}_1.pdf")

    # Déjà téléchargé dans cette session ?
    if os.path.exists(output_path) and os.path.getsize(output_path) > MIN_SIZE:
        print(f"SUCCESS:{output_path} (déjà présent en cache)")
        return output_path

    # 1. Essayer de scraper la page du jour pour trouver le lien exact
    scraped_url = scrape_pdf_link(date)
    if scraped_url:
        if download_pdf(scraped_url, output_path):
            return output_path
        time.sleep(1)

    # 2. Essayer les URLs directes connues
    for url in direct_urls(date):
        print(f"  Tentative directe : {url}", flush=True)
        if download_pdf(url, output_path):
            return output_path
        time.sleep(1)

    print(
        f"FAIL:BOC du {date.isoformat()} introuvable sur toutes les URLs connues. "
        f"Marché fermé (jour férié), publication retardée, ou domaine toujours bloqué."
    )
    return None


if __name__ == "__main__":
    # Argument optionnel : date au format YYYY-MM-DD
    target_date = datetime.date.today()
    if len(sys.argv) > 1:
        try:
            target_date = datetime.date.fromisoformat(sys.argv[1])
        except ValueError:
            print(f"FAIL:Format de date invalide '{sys.argv[1]}' — utiliser YYYY-MM-DD")
            sys.exit(1)

    # Vérifier si le rapport existe déjà dans reports/
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    reports_dir = os.path.join(repo_root, "reports")

    if already_processed(target_date, reports_dir):
        print(f"SKIP:BOC du {target_date.isoformat()} déjà traité (rapport dans reports/)")
        sys.exit(0)

    result = fetch_boc(date=target_date, output_dir="/tmp")
    sys.exit(0 if result else 1)
