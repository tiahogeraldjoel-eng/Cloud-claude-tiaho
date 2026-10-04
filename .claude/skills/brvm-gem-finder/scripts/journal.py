#!/usr/bin/env python3
"""
Journal de prédictions de l'oracle BRVM.

Chaque scan enregistre ses pépites (date, cours, niveau du Composite, verdict…) dans
`data/journal_predictions.csv`. L'évaluation compare ensuite, à 1 semaine / 1 mois /
3 mois / 6 mois de séances, la performance de chaque prédiction à celle du BRVM
Composite, à partir des BOC archivés. Les dividendes ne sont pas comptés.

Usage :
    python journal.py --boc-dir ../boc                       # bilan du journal
    python journal.py --boc-dir ../boc --journal ../data/backtest.csv
"""
from __future__ import annotations

import argparse
import csv
import glob
import os
import re
from typing import Optional

from boc_parser import parse_actions, parse_composite, pdf_to_text

HORIZONS = {"1 sem": 5, "1 mois": 20, "3 mois": 60, "6 mois": 120}
HORIZON_CALIBRATION = "1 mois"
MIN_CALIBRATION = 10      # prédictions mûres nécessaires avant d'afficher un taux de réussite
COLS = ["date", "ticker", "verdict", "rang", "score", "cours", "composite", "objectif",
        "seuil_sortie", "rendement_pct", "source"]
FAMILLES = {"PÉPITE (ACHAT PRÉCOCE)": "PÉPITE", "PÉPITE SPÉCULATIVE (position réduite)": "PÉPITE SPÉCULATIVE",
            "ACHAT": "ACHAT"}


def boc_date(path: str) -> str:
    d = re.search(r"(\d{8})", os.path.basename(path)).group(1)
    return f"{d[:4]}-{d[4:6]}-{d[6:]}"


def load_series(boc_dir: str) -> tuple:
    """(dates triées, {date: {ticker: cours}}, {date: niveau Composite}) depuis les BOC."""
    prices, composite = {}, {}
    for path in glob.glob(os.path.join(boc_dir, "*.pdf")):
        d, text = boc_date(path), pdf_to_text(path)
        prices[d] = {t: r["price"] for t, r in parse_actions(text).items() if r["price"]}
        composite[d] = parse_composite(text)
    return sorted(prices), prices, composite


def read(path: str) -> list:
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def record(path: str, entries: list) -> int:
    """Ajoute les prédictions absentes du journal (clé : date + titre + source)."""
    rows = read(path)
    deja = {(r["date"], r["ticker"], r["source"]) for r in rows}
    nouvelles = [e for e in entries if (e["date"], e["ticker"], e["source"]) not in deja]
    if nouvelles:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore")
            w.writeheader()
            w.writerows(sorted(rows + nouvelles, key=lambda r: (r["date"], int(r["rang"]))))
    return len(nouvelles)


def evaluate(rows: list, dates: list, prices: dict, composite: dict) -> list:
    """Ajoute à chaque prédiction sa performance et son excès sur le Composite par horizon."""
    out = []
    for r in rows:
        if r["date"] not in dates:
            continue
        i, res = dates.index(r["date"]), dict(r)
        p0, c0 = float(r["cours"]), composite[r["date"]]
        for nom, h in HORIZONS.items():
            if i + h >= len(dates):
                continue
            d = dates[i + h]
            p1, c1 = prices[d].get(r["ticker"]), composite[d]
            if p1 and c0 and c1:
                perf = (p1 / p0 - 1) * 100
                res[f"perf {nom}"] = round(perf, 2)
                res[f"excès {nom}"] = round(perf - (c1 / c0 - 1) * 100, 2)
        out.append(res)
    return out


def calibration(evaluated: list, horizon: Optional[str] = None) -> dict:
    """Par famille de verdict : nombre de prédictions mûres, % battant le Composite, excès moyen."""
    horizon = horizon or HORIZON_CALIBRATION
    stats = {}
    for r in evaluated:
        x = r.get(f"excès {horizon}")
        if x is None:
            continue
        s = stats.setdefault(FAMILLES.get(r["verdict"], r["verdict"]), [])
        s.append(x)
    return {k: {"n": len(v), "reussite_pct": round(100 * sum(x > 0 for x in v) / len(v)),
                "exces_moyen": round(sum(v) / len(v), 2)} for k, v in stats.items()}


def bilan(evaluated: list) -> str:
    lignes = [f"Prédictions enregistrées : {len(evaluated)}"]
    for nom in HORIZONS:
        cal = calibration(evaluated, nom)
        if not cal:
            lignes.append(f"  {nom:<7}: aucune prédiction encore mûre")
            continue
        for fam, c in cal.items():
            lignes.append(f"  {nom:<7}: {fam:<19} n={c['n']:<3} battent le Composite : "
                          f"{c['reussite_pct']} % | excès moyen {c['exces_moyen']:+.2f} pts")
    return "\n".join(lignes)


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser(description="Bilan du journal de prédictions")
    p.add_argument("--journal", default=os.path.join(here, "..", "data", "journal_predictions.csv"))
    p.add_argument("--boc-dir", default=os.path.join(here, "..", "boc"))
    p.add_argument("--detail", action="store_true", help="affiche chaque prédiction évaluée")
    args = p.parse_args()

    dates, prices, composite = load_series(args.boc_dir)
    ev = evaluate(read(args.journal), dates, prices, composite)
    print(bilan(ev))
    if args.detail:
        for r in ev:
            perfs = " ".join(f"{h}:{r[f'excès {h}']:+.1f}" for h in HORIZONS if f"excès {h}" in r)
            print(f"{r['date']} {r['ticker']:<6} {r['verdict']:<38} {perfs or 'pas encore mûre'}")


if __name__ == "__main__":
    main()
