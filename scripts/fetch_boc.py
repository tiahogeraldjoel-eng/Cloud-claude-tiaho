#!/usr/bin/env python3
"""
Télécharge le Bulletin Officiel de la Cote (BOC) depuis le site BRVM.

Usage:
    python3 fetch_boc.py [YYYY-MM-DD]

Sans argument, tente de télécharger le BOC d'aujourd'hui.
Retourne SUCCESS:/path/to/pdf ou SKIP:raison ou FAIL:raison sur stdout.
Exit code 0 = succès, 1 = échec/absent.
"""

import sys
import os
import datetime
import time

try:
    import urllib.request
    import urllib.error
except ImportError:
    print("FAIL:urllib manquant")
    sys.exit(1)


# Délai max par tentative (secondes)
TIMEOUT = 30

# Dossier de sortie par défaut
DEFAULT_OUTPUT_DIR = "/tmp"


def is_trading_day(date: datetime.date) -> bool:
    """Lundi–vendredi uniquement (jours fériés UEMOA non gérés ici)."""
    return date.weekday() < 5  # 0=lundi … 4=vendredi


def build_urls(date: datetime.date) -> list:
    """
    Construit la liste des URLs à tester pour un BOC donné.
    Priorité : format le plus récent (suffix _1) en premier.
    """
    ds = date.strftime("%Y%m%d")
    return [
        # Format principal site brvm.org (lowercase, suffix _1)
        f"https://www.brvm.org/sites/default/files/boc_{ds}_1.pdf",
        # Variante sans suffix
        f"https://www.brvm.org/sites/default/files/boc_{ds}.pdf",
        # Variante suffix _2 (rare – révision post-clôture)
        f"https://www.brvm.org/sites/default/files/boc_{ds}_2.pdf",
        # Ancien portail bfin.brvm.org
        f"https://bfin.brvm.org/boc/BOC_JOUR/BOC_{ds}.pdf",
    ]


def fetch_boc(date: datetime.date = None, output_dir: str = None) -> str | None:
    """
    Télécharge le BOC pour la date donnée.

    Retourne le chemin local du PDF si succès, None sinon.
    """
    if date is None:
        date = datetime.date.today()

    if output_dir is None:
        output_dir = DEFAULT_OUTPUT_DIR

    if not is_trading_day(date):
        print(f"SKIP:Jour non ouvré ({date.strftime('%A %d/%m/%Y')})")
        return None

    output_path = os.path.join(output_dir, f"BOC_{date.strftime('%Y%m%d')}_1.pdf")

    # Si déjà téléchargé dans cette session
    if os.path.exists(output_path) and os.path.getsize(output_path) > 10_000:
        print(f"SUCCESS:{output_path} (déjà présent)")
        return output_path

    for url in build_urls(date):
        try:
            print(f"  Tentative : {url}", flush=True)
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; BOC-fetcher/1.0)"},
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                data = response.read()

            # Validation minimale : PDF réel (header %PDF) et taille > 20 Ko
            if len(data) < 20_000 or not data.startswith(b"%PDF"):
                print(f"  Fichier invalide ({len(data)} octets)")
                continue

            with open(output_path, "wb") as f:
                f.write(data)

            print(f"SUCCESS:{output_path} ({len(data):,} octets)")
            return output_path

        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code} — {url}")
        except urllib.error.URLError as e:
            reason = str(e.reason)
            if "403" in reason or "407" in reason or "blocked" in reason.lower():
                print(f"FAIL:Accès bloqué par le proxy réseau ({reason}). "
                      "Débloquer brvm.org dans la politique réseau de l'environnement.")
                sys.exit(1)
            print(f"  URLError — {reason}")
        except OSError as e:
            print(f"  OSError — {e}")

        # Petite pause entre tentatives
        time.sleep(1)

    print(f"FAIL:BOC du {date.isoformat()} absent sur toutes les URLs connues "
          "(marché fermé ou publication retardée)")
    return None


def already_processed(date: datetime.date, reports_dir: str) -> bool:
    """Vérifie si un rapport BOC_REVU pour cette date existe déjà."""
    date_iso = date.isoformat()
    for fname in os.listdir(reports_dir):
        if fname.endswith("-BOC_REVU.md") and date_iso in fname:
            return True
    return False


if __name__ == "__main__":
    target_date = datetime.date.today()
    if len(sys.argv) > 1:
        try:
            target_date = datetime.date.fromisoformat(sys.argv[1])
        except ValueError:
            print(f"FAIL:Format de date invalide '{sys.argv[1]}' — utiliser YYYY-MM-DD")
            sys.exit(1)

    # Vérifier si déjà traité
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    reports_dir = os.path.join(repo_root, "reports")

    if os.path.isdir(reports_dir) and already_processed(target_date, reports_dir):
        print(f"SKIP:BOC du {target_date.isoformat()} déjà traité dans reports/")
        sys.exit(0)

    result = fetch_boc(date=target_date, output_dir="/tmp")
    if result:
        sys.exit(0)
    else:
        sys.exit(1)
