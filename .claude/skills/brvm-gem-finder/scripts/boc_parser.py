#!/usr/bin/env python3
"""
Lecteur du Bulletin Officiel de la Cote (BOC) de la BRVM.

Extrait du PDF quotidien, pour chaque action cotée : cours de référence, variation
depuis janvier, dernier dividende net, rendement, PER publié par la BRVM et les
meilleures limites du carnet d'ordres (quantités résiduelles achat / vente).
Produit un CSV directement exploitable par `brvm_analyst.py --screen`.

Nécessite `pdftotext` (paquet poppler-utils).

Usage :
    python boc_parser.py BOC_20261002.pdf -o ../data/cote_brvm.csv \
        --enrich ../data/fondamentaux.csv
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import subprocess
from typing import Optional

_PCT = re.compile(r"^-?\d+(?:,\d+)?%$")
_DATE = re.compile(r"^\d{1,2}-[^\s-]+-\d{2}$")
_ACTION = re.compile(r"^\s*([A-Z]{3,6})\s{2,}(.+?)\s{2,}((?:\d|SP\b).*%.*)$")
_QTE = r"\d{1,3}(?: \d{3})*"   # quantité : espace simple comme séparateur de milliers
_CARNET = re.compile(
    rf"^([A-Z]{{3,6}})\s{{2,}}(.+?)\s{{2,}}({_QTE})?\s*([\d,]+)?\s*/\s*([\d,]+)?\s+({_QTE})?\s{{2,}}({_QTE})\s*$")
_INDICE = re.compile(r"BRVM COMPOSITE.*?Variation annuelle\s+(-?\d+,\d+) %", re.S)
_NIVEAU = re.compile(r"BRVM COMPOSITE\s+(\d[\d ]*,\d+)")
_SECT_CODE = re.compile(r"^\s*(TEL|FIN|CD|CB|IND|ENE|SPU)\b")
_SECTEURS = {"TEL": "TELECOMMUNICATIONS", "FIN": "SERVICES FINANCIERS",
             "CD": "CONSOMMATION DISCRETIONNAIRE", "CB": "CONSOMMATION DE BASE",
             "IND": "INDUSTRIELS", "ENE": "ENERGIE", "SPU": "SERVICES PUBLICS"}

FIELDS = ["ticker", "name", "price", "dividend", "eps", "per_boc", "rendement_boc_pct",
          "perf_ytd_pct", "index_perf_ytd_pct", "bid_qty", "ask_qty", "volume", "suspendu",
          "dividende_annee", "secteur", "per_secteur", "bid", "ask", "composite", "date_cours"]


def _num(tok: Optional[str]) -> Optional[float]:
    if tok is None or tok in ("", "SP", "-"):
        return None
    tok = tok.replace("%", "").replace(" ", "")
    if tok.startswith(","):
        tok = "0" + tok
    try:
        return float(tok.replace(",", "."))
    except ValueError:
        return None


def _join_thousands(s: str) -> str:
    """'21 970     1 378' -> '21970     1378' (un seul espace = séparateur de milliers)."""
    prev = None
    while prev != s:
        prev, s = s, re.sub(r"(?<=\d) (?=\d{3}(?!\d))", "", s)
    return s


_CACHE: dict = {}


def pdf_to_text(path: str) -> str:
    path = os.path.abspath(path)
    if path not in _CACHE:
        _CACHE[path] = subprocess.run(["pdftotext", "-layout", path, "-"], check=True,
                                      capture_output=True, text=True).stdout
    return _CACHE[path]


def parse_composite(text: str) -> Optional[float]:
    """Niveau du BRVM Composite à la clôture."""
    m = _NIVEAU.search(text)
    return _num(m.group(1)) if m else None


def parse_secteurs(text: str) -> dict:
    """PER moyen publié pour chaque indice sectoriel (code -> PER)."""
    out = {}
    for code, nom in _SECTEURS.items():
        m = re.search(rf"BRVM - {nom}\b.*?(\d+,\d+)\s*$", text, re.M)
        if m:
            out[code] = _num(m.group(1))
    return out


def parse_actions(text: str) -> dict:
    rows = {}
    lines = text.splitlines()
    for n, line in enumerate(lines):
        m = _ACTION.match(line)
        if not m:
            continue
        ticker, name, rest = m.group(1), m.group(2).strip(), m.group(3)
        toks = _join_thousands(rest).replace(" %", "%").split()
        pcts = [i for i, t in enumerate(toks) if _PCT.match(t)]
        if not pcts:
            continue
        i_var = pcts[0]
        i_ytd = pcts[1] if len(pcts) > 1 else None
        i_rdt = pcts[2] if len(pcts) > 2 else None
        i_date = next((i for i, t in enumerate(toks) if _DATE.match(t)), None)
        if i_ytd is not None:
            i_ref = i_ytd - 1
        else:  # titre nouvellement coté : pas de variation annuelle publiée
            i_ref = i_var + 3 if len(toks) > i_var + 3 else 2
        ref = toks[i_ref]
        # Le PER est la dernière colonne, quand elle existe, après toutes les autres
        apres = max(i for i in (i_ref, i_ytd, i_date, i_rdt) if i is not None)
        last = len(toks) - 1
        per = _num(toks[last]) if last > apres and not _PCT.match(toks[last]) else None
        price = _num(ref)
        div = _num(toks[i_date - 1]) if i_date else None
        annee_div = 2000 + int(toks[i_date][-2:]) if i_date else None
        rows[ticker] = {
            "ticker": ticker, "name": name, "price": price, "dividend": div,
            "per_boc": per, "eps": round(price / per, 2) if price and per else None,
            "rendement_boc_pct": _num(toks[i_rdt]) if i_rdt else None,
            "perf_ytd_pct": _num(toks[i_ytd]) if i_ytd is not None else None,
            "volume": _num(toks[i_var + 1]) if toks[1] != "SP" and len(toks) > i_var + 1 else 0,
            "suspendu": "oui" if toks[1] == "SP" else "",
            "dividende_annee": annee_div,
            "secteur": next((mm.group(1) for l in lines[n + 1:n + 3] if (mm := _SECT_CODE.match(l))), ""),
        }
    return rows


def parse_carnet(text: str) -> dict:
    out = {}
    for line in text.splitlines():
        m = _CARNET.match(line)
        if m and "/" in line:
            out[m.group(1)] = {"bid_qty": _num(m.group(3)), "ask_qty": _num(m.group(6)),
                               "bid": _num((m.group(4) or "").replace(",", "")),
                               "ask": _num((m.group(5) or "").replace(",", ""))}
    return out


def parse_boc(path: str, date: str = "") -> list:
    text = pdf_to_text(path)
    m = _INDICE.search(text)
    idx = _num(m.group(1)) if m else None
    actions, carnet = parse_actions(text), parse_carnet(text)
    secteurs, niveau = parse_secteurs(text), parse_composite(text)
    annee = int(date[:4]) if date[:4].isdigit() else None
    rows = []
    for t, r in actions.items():
        r.update(carnet.get(t, {}))
        # Un dividende payé avant l'exercice précédent n'est plus un rendement actuel
        if annee and r["dividende_annee"] and r["dividende_annee"] < annee - 1:
            r["dividend"] = 0.0
            r["rendement_boc_pct"] = 0.0
        r["index_perf_ytd_pct"] = idx
        r["per_secteur"] = secteurs.get(r["secteur"])
        r["composite"] = niveau
        r["date_cours"] = date
        rows.append(r)
    return rows


def compute_history(paths: list, window: int = 5) -> dict:
    """Signaux d'accumulation à partir de plusieurs BOC (triés par date) :
    volume moyen des `window` dernières séances / volume moyen des séances précédentes,
    et variation du cours sur ces mêmes séances."""
    series = {}
    for path in sorted(paths):
        for t, r in parse_actions(pdf_to_text(path)).items():
            series.setdefault(t, []).append((r["price"], r["volume"] or 0.0))
    out = {}
    for t, pts in series.items():
        if len(pts) <= window:
            continue
        recent, avant = pts[-window:], pts[:-window][-15:]
        vol_avant = sum(v for _, v in avant) / len(avant)
        vol_recent = sum(v for _, v in recent) / window
        p0, p1 = pts[-window - 1][0], pts[-1][0]
        out[t] = {
            "volume_ratio": round(vol_recent / vol_avant, 2) if vol_avant else None,
            "price_change_pct": round((p1 / p0 - 1) * 100, 2) if p0 and p1 else None,
            "seances_historique": len(pts),
        }
    return out


def merge_enrich(rows: list, enrich_path: str) -> list:
    """Ajoute les colonnes d'un CSV manuel (eps_growth, dividend_suspended, risk_notes…)."""
    with open(enrich_path, newline="", encoding="utf-8") as f:
        extra = {r["ticker"].strip(): r for r in csv.DictReader(f) if r.get("ticker")}
    for r in rows:
        for k, v in extra.get(r["ticker"], {}).items():
            if k != "ticker" and v.strip() and (r.get(k) in (None, "") or k not in FIELDS):
                r[k] = v.strip()
    return rows


def main() -> None:
    p = argparse.ArgumentParser(description="Convertit un BOC BRVM (PDF) en CSV de la cote")
    p.add_argument("pdf")
    p.add_argument("-o", "--output", required=True)
    p.add_argument("--enrich", help="CSV manuel de fondamentaux à fusionner (clé : ticker)")
    p.add_argument("--date", default="", help="date de la séance (AAAA-MM-JJ)")
    p.add_argument("--history", help="dossier de BOC antérieurs (signaux d'accumulation sur 5 séances)")
    args = p.parse_args()

    date = args.date or (re.search(r"(\d{8})", args.pdf) or [None, ""])[1]
    if len(date) == 8:
        date = f"{date[:4]}-{date[4:6]}-{date[6:]}"
    rows = parse_boc(args.pdf, date)
    if args.history:
        import glob
        paths = sorted({os.path.abspath(x) for x in glob.glob(os.path.join(args.history, "*.pdf")) + [args.pdf]},
                       key=lambda x: re.search(r"(\d{8})", os.path.basename(x)).group(1))
        hist = compute_history(paths)
        for r in rows:
            r.update(hist.get(r["ticker"], {}))
    if args.enrich:
        rows = merge_enrich(rows, args.enrich)
    cols = FIELDS + sorted({k for r in rows for k in r} - set(FIELDS))
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["ticker"]))
    print(f"{len(rows)} actions écrites dans {args.output} "
          f"(Composite depuis janvier : {rows[0]['index_perf_ytd_pct'] if rows else 'n.d.'} %)")


if __name__ == "__main__":
    main()
