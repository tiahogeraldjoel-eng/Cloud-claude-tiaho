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
    python oracle.py --no-fetch --backtest [--sans-fondamentaux]   # rejoue l'historique
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import fetch_boc
import journal
from boc_parser import compute_history, merge_enrich, parse_boc
from brvm_analyst import format_report, row_to_input, screen

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
PEPITES = ("PÉPITE (ACHAT PRÉCOCE)", "PÉPITE SPÉCULATIVE (position réduite)", "ACHAT")
SEUIL_SORTIE = 0.90          # revoir la position sous -10 % du cours d'entrée
OBJECTIF_MAX = 1.5           # objectif plafonné à +50 %


def build_rows(boc_path: str, history: list, enrich: Optional[str]) -> list:
    rows = parse_boc(boc_path, journal.boc_date(boc_path))
    hist = compute_history(history + [boc_path]) if history else {}
    for r in rows:
        r.update(hist.get(r["ticker"], {}))
    return merge_enrich(rows, enrich) if enrich and os.path.exists(enrich) else rows


def pick(rows: list, top: int = 3) -> list:
    """(analyse, ligne de la cote) des 1 à `top` pépites, dans l'ordre du classement."""
    by = {r["ticker"]: r for r in rows}
    res = screen([t for r in rows if (t := row_to_input(r))])
    return [(a, by[a.ticker]) for a in res if a.verdict in PEPITES][:top]


def panier(rows: list) -> list:
    """Tout le quintile de PER le moins cher de la cote (hors suspendus et bulles post-IPO).
    Backtest 2025-2026 : ce panier à poids égaux a battu la cote (≈ +12,5 pts vs Composite à 3 mois
    dans chaque semestre), mais grâce à quelques grands gagnants : il faut le détenir en entier."""
    by = {r["ticker"]: r for r in rows}
    res = screen([t for r in rows if (t := row_to_input(r))])
    # Un PER calculé sur un bénéfice annuel qui s'est depuis effondré (≥ 50 % connu) n'est pas « bas ».
    return [(a, by[a.ticker]) for a in res
            if a.pillars.get("valorisation", 0) >= 2 and not a.verdict.startswith("ÉVITER")
            and not (a.eps_growth is not None and a.eps_growth <= -0.5)]


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


def report(date: str, composite, picks: list, cal: dict, bilan: str, basket: list = ()) -> str:
    out = [f"🔮 ORACLE BRVM — séance du {date} (Composite {composite})", ""]
    if basket:
        out += [f"🧺 PANIER DE L'ORACLE ({len(basket)} titres à poids égaux) — la stratégie qui a battu la cote au backtest :"]
        for a, row in sorted(basket, key=lambda x: x[0].metrics["per"] or 99):
            rdt = a.metrics["rendement_pct"]
            out.append(f"   {a.ticker:<6} {row['name'][:26]:<26} {fmt(row['price']):>8} FCFA | PER {a.metrics['per']}x"
                       f" | rdt {'n.d.' if rdt is None else f'{rdt} %'} | {a.verdict}")
        out += ["   Détenir le panier entier et le revoir chaque mois : la moitié des titres fera moins bien que le "
                "marché, la performance vient de quelques grands gagnants qu'on ne sait pas désigner à l'avance.", ""]
    if not picks:
        out.append("Aucune pépite aujourd'hui : aucun titre ne passe tous les filtres. Rester en liquidités "
                   "ou conserver les positions existantes est une réponse valable.")
    if picks:
        out.append("🎯 Pépites individuelles (pari concentré : environ une chance sur deux de battre le marché "
                   "titre par titre au backtest) :")
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


def backtest(bocs: list, enrich: Optional[str], horizons=(5, 20, 60)) -> str:
    """Rejoue l'oracle séance par séance et compare ses pépites, à chaque horizon (en séances),
    au BRVM Composite et à la moyenne de tous les titres cotés (choix « au hasard »)."""
    path_bt = os.path.join(ROOT, "data", "backtest.csv")
    dates, prices, comp = journal.load_series(os.path.dirname(bocs[0]))
    entries, univers = [], {h: [] for h in horizons}
    for i in range(1, len(bocs) - min(horizons)):
        rows = build_rows(bocs[i], bocs[:i][-20:], enrich)
        for rang, (a, row) in enumerate(pick(rows), 1):
            entries.append(entry(a, row, rang, "backtest"))
        for rang, (a, row) in enumerate(panier(rows), 1):
            entries.append(dict(entry(a, row, rang, "backtest-panier"), verdict="PANIER"))
        d = journal.boc_date(bocs[i])
        for h in horizons:   # référence : tous les titres, à poids égal
            if i + h < len(dates) and comp[d] and comp[dates[i + h]]:
                c = (comp[dates[i + h]] / comp[d] - 1) * 100
                for t in prices[d]:
                    x = journal.total_return(prices, d, dates[i + h], t)
                    if x is not None:
                        univers[h].append(x - c)
    if os.path.exists(path_bt):
        os.remove(path_bt)
    journal.record(path_bt, entries)
    ev = journal.evaluate(journal.read(path_bt), dates, prices, comp)
    noms = {v: k for k, v in journal.HORIZONS.items()}
    lignes = [f"Backtest sur {len(bocs)} BOC ({dates[0]} → {dates[-1]}) — "
              f"{'avec' if enrich else 'SANS'} data/fondamentaux.csv ; {len(ev)} pépites désignées.", ""]
    for h in horizons:
        nom = noms.get(h)
        if not nom:
            continue
        ref = univers[h]
        lignes.append(f"Horizon {nom} ({h} séances) — référence tous titres : "
                      + (f"{100 * sum(x > 0 for x in ref) / len(ref):.0f} % battent le Composite, "
                         f"excès moyen {sum(ref) / len(ref):+.2f} pts (n={len(ref)})" if ref else "n.d."))
        for fam, c in journal.calibration(ev, nom).items():
            lignes.append(f"   oracle {fam:<19} n={c['n']:<4} battent le Composite : {c['reussite_pct']} % | "
                          f"excès moyen {c['exces_moyen']:+.2f} pts")
    lignes += ["", "Dividendes détachés inclus. " + ("⚠ Biais : fondamentaux connus aujourd'hui appliqués au passé."
                                          if enrich else "Sans biais d'anticipation : seules les données du BOC de chaque date.")]
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
    p.add_argument("--backtest", action="store_true", help="rejoue l'historique (1 semaine, 1 mois, 3 mois)")
    p.add_argument("--sans-fondamentaux", action="store_true",
                   help="backtest sans data/fondamentaux.csv (aucun biais d'anticipation)")
    args = p.parse_args()

    if not args.no_fetch:
        # ~9 mois de séances : historique d'accumulation + évaluation du journal à 6 mois.
        # Site BRVM d'abord, archive git en repli ; les BOC déjà présents ne sont pas retéléchargés.
        today = dt.date.today()
        jours = [(today - dt.timedelta(n)).strftime("%Y%m%d") for n in range(270)
                 if (today - dt.timedelta(n)).weekday() < 5]
        archive = set(fetch_boc.archive_list())
        with ThreadPoolExecutor(6) as ex:
            list(ex.map(lambda d: fetch_boc.fetch(d, args.boc_dir, archive=d in archive), jours))
    bocs = sorted(glob.glob(os.path.join(args.boc_dir, "*.pdf")), key=journal.boc_date)
    if not bocs:
        raise SystemExit("Aucun BOC disponible : lancer fetch_boc.py ou fournir un PDF dans boc/.")
    if args.backtest:
        print(backtest(bocs, None if args.sans_fondamentaux else args.enrich))
        return

    rows = build_rows(bocs[-1], bocs[:-1][-20:], args.enrich)
    picks, basket = pick(rows, args.top), panier(rows)
    if not args.no_journal:
        journal.record(args.journal, [entry(a, r, i, "oracle") for i, (a, r) in enumerate(picks, 1)]
                       + [dict(entry(a, r, i, "oracle-panier"), verdict="PANIER") for i, (a, r) in enumerate(basket, 1)])
    dates, prices, comp = journal.load_series(args.boc_dir)
    ev = journal.evaluate(journal.read(args.journal), dates, prices, comp)
    print(report(journal.boc_date(bocs[-1]), rows[0].get("composite") if rows else None,
                 picks, journal.calibration(ev), journal.bilan(ev), basket))


if __name__ == "__main__":
    main()
