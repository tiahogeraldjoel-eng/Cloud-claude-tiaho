#!/usr/bin/env python3
"""
Récupère les Bulletins Officiels de la Cote (BOC) de la BRVM.

1. Source officielle : https://bfin.brvm.org/boc/BOC_JOUR/BOC_AAAAMMJJ.pdf
   (puis les variantes historiques sur www.brvm.org).
2. Repli si le site est inaccessible (réseau filtré) : les BOC archivés chaque soir
   par le workflow GitHub Actions `fetch-boc.yml` dans `boc-inbox/` de la branche
   `claude/brvm-boc-114-analysis-ngt2xu`, lus via git.

Usage :
    python fetch_boc.py --date 2026-10-02 -o ../boc        # un BOC
    python fetch_boc.py --last 20 -o ../boc                # les 20 derniers disponibles
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import subprocess
import urllib.request

URLS = (
    "https://bfin.brvm.org/boc/BOC_JOUR/BOC_{ds}.pdf",
    "https://www.brvm.org/sites/default/files/boc_{ds}_2.pdf",
    "https://www.brvm.org/sites/default/files/boc_{ds}_1.pdf",
    "https://www.brvm.org/sites/default/files/boc_{ds}.pdf",
)
ARCHIVE_BRANCH = "claude/brvm-boc-114-analysis-ngt2xu"
ARCHIVE_DIR = "boc-inbox"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def _is_pdf(data: bytes) -> bool:
    return data[:4] == b"%PDF" and len(data) > 20_000


def from_site(ds: str) -> bytes | None:
    for url in URLS:
        try:
            req = urllib.request.Request(url.format(ds=ds), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            if _is_pdf(data):
                return data
        except Exception:
            continue
    return None


def _git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True)


def archive_list() -> list:
    """Dates (AAAAMMJJ) des BOC présents dans l'archive git, triées."""
    _git("fetch", "-q", "origin", ARCHIVE_BRANCH)
    out = _git("ls-tree", "--name-only", f"origin/{ARCHIVE_BRANCH}", f"{ARCHIVE_DIR}/").stdout.decode()
    return sorted({m.group(1) for m in re.finditer(r"BOC_(\d{8})", out)})


def from_archive(ds: str) -> bytes | None:
    for suffix in ("_1", ""):
        r = _git("show", f"origin/{ARCHIVE_BRANCH}:{ARCHIVE_DIR}/BOC_{ds}{suffix}.pdf")
        if r.returncode == 0 and _is_pdf(r.stdout):
            return r.stdout
    return None


def fetch(ds: str, out_dir: str) -> str | None:
    path = os.path.join(out_dir, f"BOC_{ds}.pdf")
    if os.path.exists(path):
        return path
    data, origine = from_site(ds), "site BRVM"
    if data is None:
        data, origine = from_archive(ds), "archive git"
    if data is None:
        return None
    os.makedirs(out_dir, exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print(f"BOC du {ds} : {origine} -> {path}")
    return path


def main() -> None:
    p = argparse.ArgumentParser(description="Télécharge les BOC de la BRVM")
    p.add_argument("--date", help="AAAA-MM-JJ (défaut : dernier BOC disponible)")
    p.add_argument("--last", type=int, help="récupère les N derniers BOC disponibles")
    p.add_argument("-o", "--out", default="boc")
    args = p.parse_args()

    if args.last:
        dates = archive_list()[-args.last:]
        today = dt.date.today().strftime("%Y%m%d")
        if today not in dates and from_site(today):
            dates.append(today)
    elif args.date:
        dates = [args.date.replace("-", "")]
    else:
        dates = archive_list()[-1:]
    ok = [d for d in dates if fetch(d, args.out)]
    manquants = sorted(set(dates) - set(ok))
    print(f"{len(ok)} BOC disponibles dans {args.out}/" + (f" ; introuvables : {manquants}" if manquants else ""))


if __name__ == "__main__":
    main()
