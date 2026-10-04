#!/usr/bin/env python3
"""
L'oracle BRVM : une commande, une réponse à « quelle est la pépite du moment ? ».

1. récupère les BOC (site BRVM, sinon archive git) ;
2. lit la cote du jour + l'historique + data/fondamentaux.csv ;
3. classe les 48 titres avec la matrice à 5 piliers ;
4. désigne 1 à 3 pépites avec zone d'entrée, objectif, seuil de sortie ;
5. les inscrit au journal de prédictions et affiche son propre bilan.

La conviction n'est exprimée en pourcentage qu'une fois calibrée sur au moins
10 prédictions mûres du journal (horizon 1 mois) ; avant, elle reste qualitative.

Usage :
    python oracle.py                 # séance la plus récente
    python oracle.py --no-fetch      # sans téléchargement (BOC déjà dans boc/)
    python oracle.py --backtest 5    # rejoue l'oracle sur l'historique, horizon 5 séances
"""
from __future__ import annotations

import argparse
import glob
import os

import fetch_boc
import journal
from boc_parser import compute_history, merge_enrich, parse_boc
from brvm_analyst import format_report, row_to_input, screen

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
PEPITES = ("PÉPITE (ACHAT PRÉCOCE)", "PÉPITE SPÉCULATIVE (position réduite)", "ACHAT")
SEUIL_SORTIE = 0.90          # revoir la position sous -10 % du cours d'entrée
OBJECTIF_MAX = 1.5           # objectif plafonné à +50 %


def build_rows(boc_path: str, history: list, enrich: str) -> list:
    rows = parse_boc(boc_path, journal.boc_date(boc_path))
    hist = compute_history(history + [boc_path]) if history else {}
    for r in rows:
        r.update(hist.get(r["ticker"], {}))
    return merge_enrich(rows, enrich) if os.path.exists(enrich) else rows


def pick(rows: list, top: int = 3) -> list:
    """(analyse, ligne de la cote) des 1 à `top` pépites, dans l'ordre du classement."""
    by = {r["ticker"]: r for r in rows}
    res = screen([t for r in rows if (t := row_to_input(r))])
    return [(a, by[a.ticker]) for a in res if a.verdict in PEPITES][:top]


def plan(a, row: dict) -> dict:
    prix, eps, per_s = row["price"], row.get("eps"), row.get("per_secteur")
    objectif = None
    if eps and per_s and eps * per_s > prix:
        objectif = round(min(eps * per_s, prix * OBJECTIF_MAX), -1)
    rdt = a.metrics["rendement_pct"] or 0.0
    return {
        "entree": (row.get("bid") or prix, row.get("ask") or prix),
        "objectif": objectif,
        "potentiel_pct": round((objectif / prix - 1) * 100 + rdt, 1) if objectif else None,
        "seuil_sortie": round(prix * SEUIL_SORTIE, -1),
        "rendement_pct": rdt,
    }


def conviction(a, cal: dict) -> str:
    fam = journal.FAMILLES.get(a.verdict, a.verdict)
    c = cal.get(fam)
    if c and c["n"] >= journal.MIN_CALIBRATION:
        return (f"{c['reussite_pct']} % de ses pépites « {fam} » ont battu le Composite à 1 mois "
                f"(n={c['n']}, excès moyen {c['exces_moyen']:+.1f} pts)")
    qual = "forte" if a.score >= 4 else "moyenne" if a.score >= 2 else "faible"
    n = c["n"] if c else 0
    return f"{qual} (score {a.score:+d}) ; non calibrée : {n}/{journal.MIN_CALIBRATION} prédictions mûres au journal"


def fmt(x) -> str:
    return "n.d." if x is None else f"{x:,.0f}".replace(",", " ")


def report(date: str, composite, picks: list, cal: dict, bilan: str) -> str:
    out = [f"🔮 ORACLE BRVM — séance du {date} (Composite {composite})", ""]
    if not picks:
        out.append("Aucune pépite aujourd'hui : aucun titre ne passe tous les filtres. Rester en liquidités "
                   "ou conserver les positions existantes est une réponse valable.")
    for i, (a, row) in enumerate(picks, 1):
        pl = plan(a, row)
        titre = "LA PÉPITE DU MOMENT" if i == 1 else f"Pépite n°{i}"
        pot = "n.d." if pl["potentiel_pct"] is None else f"{pl['potentiel_pct']:+.1f} %"
        out += [
            f"{'💎' if i == 1 else '•'} {titre} : {a.ticker} — {row['name']} — {fmt(row['price'])} FCFA",
            f"   Verdict : {a.verdict} | Conviction : {conviction(a, cal)}",
            f"   Entrée : ordres limités entre {fmt(pl['entree'][0])} et {fmt(pl['entree'][1])} FCFA, en 2–3 tranches",
            f"   Objectif : {fmt(pl['objectif'])} FCFA (PER du secteur) | potentiel total {pot} "
            f"dividende inclus | Seuil de sortie : {fmt(pl['seuil_sortie'])} FCFA",
            "   " + format_report(a).replace("\n", "\n   "),
            "",
        ]
    out += ["📒 Bilan de l'oracle (journal de prédictions) :", bilan, "",
            "Les filtres trient, ils ne garantissent rien : vérifier le rapport officiel et le carnet "
            "complet avant d'acheter. Pas un conseil en investissement personnalisé."]
    return "\n".join(out)


def backtest(bocs: list, enrich: str, horizon: int, window: int = 5) -> str:
    """Rejoue l'oracle séance par séance et mesure les pépites `horizon` séances plus tard."""
    path_bt = os.path.join(ROOT, "data", "backtest.csv")
    entries = []
    for i in range(1, len(bocs) - horizon):  # l'accumulation n'est calculée que si l'historique suffit
        rows = build_rows(bocs[i], bocs[:i], enrich)
        for rang, (a, row) in enumerate(pick(rows), 1):
            entries.append(entry(a, row, rang, "backtest"))
    if os.path.exists(path_bt):
        os.remove(path_bt)
    journal.record(path_bt, entries)
    dates, prices, comp = journal.load_series(os.path.dirname(bocs[0]))
    ev = journal.evaluate(journal.read(path_bt), dates, prices, comp)
    lignes = [f"Backtest sur {len(bocs)} BOC ({dates[0]} → {dates[-1]}), horizon {horizon} séances :",
              f"{len(ev)} pépites rejouées sur {len(bocs) - horizon - 1} séances."]
    for r in ev:
        lignes.append(f"  {r['date']} {r['ticker']:<6} {r['verdict']:<38} "
                      f"perf {r.get('perf 1 sem', 'n.d.')} % | excès vs Composite {r.get('excès 1 sem', 'n.d.')} pts")
    lignes += ["", journal.bilan(ev),
               "⚠ Biais : data/fondamentaux.csv contient des informations connues aujourd'hui, pas à chaque date "
               "rejouée ; historique trop court pour conclure."]
    return "\n".join(lignes)


def entry(a, row: dict, rang: int, source: str) -> dict:
    pl = plan(a, row)
    return {"date": row["date_cours"], "ticker": a.ticker, "verdict": a.verdict, "rang": rang,
            "score": a.score, "cours": row["price"], "composite": row.get("composite"),
            "objectif": pl["objectif"] or "", "seuil_sortie": pl["seuil_sortie"],
            "rendement_pct": pl["rendement_pct"], "source": source}


def main() -> None:
    p = argparse.ArgumentParser(description="Oracle BRVM : la pépite du moment")
    p.add_argument("--boc-dir", default=os.path.join(ROOT, "boc"))
    p.add_argument("--enrich", default=os.path.join(ROOT, "data", "fondamentaux.csv"))
    p.add_argument("--journal", default=os.path.join(ROOT, "data", "journal_predictions.csv"))
    p.add_argument("--top", type=int, default=3)
    p.add_argument("--no-fetch", action="store_true")
    p.add_argument("--no-journal", action="store_true", help="ne pas inscrire les prédictions")
    p.add_argument("--backtest", type=int, metavar="HORIZON", help="rejoue l'historique (horizon en séances)")
    args = p.parse_args()

    if not args.no_fetch:
        for d in fetch_boc.archive_list()[-130:]:   # ~6 mois de séances pour évaluer le journal
            fetch_boc.fetch(d, args.boc_dir)
    bocs = sorted(glob.glob(os.path.join(args.boc_dir, "*.pdf")), key=journal.boc_date)
    if not bocs:
        raise SystemExit("Aucun BOC disponible : lancer fetch_boc.py ou fournir un PDF dans boc/.")
    if args.backtest:
        print(backtest(bocs, args.enrich, args.backtest))
        return

    rows = build_rows(bocs[-1], bocs[:-1][-20:], args.enrich)
    picks = pick(rows, args.top)
    if not args.no_journal:
        journal.record(args.journal, [entry(a, r, i, "oracle") for i, (a, r) in enumerate(picks, 1)])
    dates, prices, comp = journal.load_series(args.boc_dir)
    ev = journal.evaluate(journal.read(args.journal), dates, prices, comp)
    print(report(journal.boc_date(bocs[-1]), rows[0].get("composite") if rows else None,
                 picks, journal.calibration(ev), journal.bilan(ev)))


if __name__ == "__main__":
    main()
