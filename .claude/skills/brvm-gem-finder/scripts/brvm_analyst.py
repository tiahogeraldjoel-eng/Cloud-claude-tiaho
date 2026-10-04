#!/usr/bin/env python3
"""
BRVM Analyst Skill — scoring des pépites BRVM selon la matrice à 4 piliers
de brvm-gem-finder, avec avis optionnel d'un LLM local (Ollama / Gemma).

Les métriques et le verdict sont calculés de façon déterministe en Python ;
le LLM ne fait que commenter la stratégie à partir de ces chiffres.

Usage CLI :
    python brvm_analyst.py STBC --price 21995 --dividend 1707 --eps 2031
    python brvm_analyst.py BBGC --price 8950 --dividend 0 --ipo-price 6750 \
        --sessions-since-ipo 7 --no-llm
    python brvm_analyst.py STBC --price 21995 --dividend 1707 --json
    python brvm_analyst.py --screen ../data/cote_brvm.csv --index-perf-ytd 58.6 --top 3
"""
from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict, dataclass, field
from typing import Optional

# Seuils de la matrice brvm-gem-finder (SKILL.md)
PER_CIBLE = 12.0          # PER < 10x–12x
# Calibré sur 252 BOC (oct. 2025 – oct. 2026) : seul le PER relatif a battu le Composite de façon
# stable (≈ +12 pts à 3 mois pour le quintile le moins cher, dans chaque semestre).
PER_QUINTILE_PEPITE = 20.0  # PER parmi les 20 % les moins chers de la cote du jour
PER_QUINTILE_BON = 40.0
PER_CHER = 15.0           # au-delà : titre déjà réévalué
PBV_DECOTE = 1.0          # P/BV < 1 : décote sur fonds propres
ROE_CIBLE = 0.15          # ROE > 15 %
RENDEMENT_CIBLE = 7.0     # rendement net > 7 %
RENDEMENT_FAIBLE = 5.0
FOMO_HAUSSE_IPO = 25.0    # +25 % depuis l'introduction...
FOMO_SEANCES = 30         # ...en moins de 30 séances
# Pilier 5 — détection précoce (entrer avant les institutionnels)
RETARD_RELATIF = -20.0    # perf. depuis janvier ≥ 20 pts sous le BRVM Composite
DEJA_DECOUVERTE = 30.0    # perf. ≥ 30 pts au-dessus du Composite : déjà découverte
PEG_CIBLE = 1.0           # PER / croissance du bénéfice (%) < 1
ACCUMULATION_VOLUME = 2.0 # volume récent ≥ 2x la moyenne 20 séances...
ACCUMULATION_PRIX = 3.0   # ...avec un cours qui bouge de moins de 3 %
CARNET_DESEQUILIBRE = 3.0 # quantité achat / vente à la meilleure limite ≥ 3 (ou ≤ 1/3)


@dataclass
class TickerInput:
    ticker: str
    price: float                          # cours actuel (FCFA)
    dividend: Optional[float]             # dividende net par action (FCFA), None si inconnu
    eps: Optional[float] = None           # bénéfice net par action (FCFA)
    book_value: Optional[float] = None    # fonds propres par action (FCFA)
    roe: Optional[float] = None           # ROE en fraction (0.18 = 18 %)
    sector_per: Optional[float] = None    # PER moyen du secteur
    pru: Optional[float] = None           # prix de revient unitaire du porteur
    ipo_price: Optional[float] = None     # prix d'introduction (post-IPO)
    sessions_since_ipo: Optional[int] = None
    pre_detachment_price: Optional[float] = None  # cours veille de détachement
    eps_growth: Optional[float] = None    # croissance du bénéfice en fraction (0.25 = +25 %)
    perf_ytd_pct: Optional[float] = None  # performance du titre depuis le 1er janvier (%)
    index_perf_ytd_pct: Optional[float] = None  # performance du BRVM Composite (%)
    volume_ratio: Optional[float] = None  # volume récent / volume moyen 20 séances
    price_change_pct: Optional[float] = None  # variation du cours sur la même période (%)
    bid_qty: Optional[float] = None       # quantité résiduelle à l'achat (meilleure limite)
    ask_qty: Optional[float] = None       # quantité résiduelle à la vente (meilleure limite)
    per_percentile: Optional[float] = None  # rang du PER dans la cote du jour (0 = le moins cher)
    dividend_suspended: bool = False      # dividende suspendu (redressement en cours)
    risk_notes: str = ""                  # risques spécifiques (solvabilité, pays, dilution…)
    news_context: str = ""


@dataclass
class Analysis:
    ticker: str
    metrics: dict
    pillars: dict
    flags: list = field(default_factory=list)
    score: int = 0
    verdict: str = "CONSERVATION (WATCHLIST)"
    llm_comment: Optional[str] = None
    eps_growth: Optional[float] = None
    dividend_suspended: bool = False


def _ratio(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den is None or den <= 0:
        return None
    return num / den


def compute_metrics(t: TickerInput) -> dict:
    if t.price <= 0:
        raise ValueError(f"{t.ticker} : le cours doit être strictement positif")
    roe = t.roe if t.roe is not None else _ratio(t.eps, t.book_value)
    m = {
        "rendement_pct": round(t.dividend / t.price * 100, 2) if t.dividend is not None else None,
        "per": _ratio(t.price, t.eps),
        "pbv": _ratio(t.price, t.book_value),
        "roe_pct": round(roe * 100, 1) if roe is not None else None,
        "payout_pct": _ratio(t.dividend * 100, t.eps) if t.dividend is not None else None,
        "plus_value_pru_pct": None,
        "hausse_depuis_ipo_pct": None,
        "gap_detachement_restant_pct": None,
        "peg": None,
        "ecart_vs_composite_pts": None,
    }
    if t.pru:
        m["plus_value_pru_pct"] = (t.price / t.pru - 1) * 100
    if t.ipo_price:
        m["hausse_depuis_ipo_pct"] = (t.price / t.ipo_price - 1) * 100
    if t.pre_detachment_price:
        m["gap_detachement_restant_pct"] = max(0.0, (t.pre_detachment_price / t.price - 1) * 100)
    if m["per"] is not None and t.eps_growth is not None and t.eps_growth > 0:
        m["peg"] = m["per"] / (t.eps_growth * 100)
    if t.perf_ytd_pct is not None and t.index_perf_ytd_pct is not None:
        m["ecart_vs_composite_pts"] = t.perf_ytd_pct - t.index_perf_ytd_pct
    return {k: (round(v, 2) if isinstance(v, float) else v) for k, v in m.items()}


def score_pillars(t: TickerInput, m: dict) -> Analysis:
    """Note chaque pilier : +1 favorable, 0 neutre / inconnu, -1 défavorable."""
    pillars, flags = {}, []

    # 1. Valorisation
    per, pbv = m["per"], m["pbv"]
    per_cible = min(PER_CIBLE, t.sector_per) if t.sector_per else PER_CIBLE
    pct = t.per_percentile
    if per is None:
        pillars["valorisation"] = 0
        flags.append("PER inconnu : fournir --eps")
    elif pct is not None and pct <= PER_QUINTILE_PEPITE:
        pillars["valorisation"] = 2
        flags.append(f"PER {per}x parmi les {PER_QUINTILE_PEPITE:.0f} % les moins chers de la cote "
                     "(signal le plus robuste du backtest)")
    elif per <= per_cible or (pct is not None and pct <= PER_QUINTILE_BON) \
            or (pbv is not None and pbv < PBV_DECOTE):
        pillars["valorisation"] = 1
    elif per > PER_CHER:
        pillars["valorisation"] = -1
        flags.append(f"PER {per}x > {PER_CHER}x : réévaluation déjà faite")
    else:
        pillars["valorisation"] = 0

    # 2. Rentabilité & dividende
    rdt, roe = m["rendement_pct"], m["roe_pct"]
    note = 0
    croissance = (t.eps_growth or 0) > 0
    if rdt is None:
        flags.append("Dividende inconnu : fournir --dividend")
    elif rdt >= RENDEMENT_CIBLE:
        note += 1
    elif rdt < RENDEMENT_FAIBLE and not (t.dividend_suspended and croissance):
        note -= 1
    if roe is not None:
        note += 1 if roe >= ROE_CIBLE * 100 else 0
    else:
        flags.append("ROE inconnu : fournir --roe ou --book-value")
    if m["payout_pct"] is not None and m["payout_pct"] > 100:
        note -= 1
        flags.append("Distribution > 100 % du bénéfice : dividende non soutenable")
    pillars["rentabilite"] = max(-1, min(1, note))

    # 3. Microstructure / anti-FOMO (le carnet d'ordres reste à lire à part)
    hausse_ipo = m["hausse_depuis_ipo_pct"]
    if (hausse_ipo is not None and hausse_ipo >= FOMO_HAUSSE_IPO
            and (t.sessions_since_ipo or 0) <= FOMO_SEANCES):
        pillars["microstructure"] = -1
        flags.append(f"Anti-FOMO : +{hausse_ipo:.0f} % en {t.sessions_since_ipo} séances "
                     "depuis l'IPO, risque de dégonflement")
    elif t.bid_qty and t.ask_qty:
        ratio = t.bid_qty / t.ask_qty
        m["ratio_achat_vente"] = round(ratio, 2)
        pillars["microstructure"] = 0   # informatif : aucun pouvoir prédictif mesuré au backtest
        if ratio >= CARNET_DESEQUILIBRE:
            flags.append(f"Carnet : {t.bid_qty:.0f} titres à l'achat pour {t.ask_qty:.0f} à la vente "
                         "(demande dominante, offre rare)")
        elif ratio <= 1 / CARNET_DESEQUILIBRE:
            flags.append(f"Carnet : {t.ask_qty:.0f} titres à la vente pour {t.bid_qty:.0f} à l'achat "
                         "(offre abondante, entrer par tranches sous le cours)")
        flags.append("Carnet = meilleure limite à la clôture seulement : confirmer avec 5 limites Coris Bourse")
    else:
        pillars["microstructure"] = 0
        flags.append("Carnet d'ordres non analysé : joindre une capture Coris Bourse")

    # 4. Catalyseurs & timing
    gap = m["gap_detachement_restant_pct"]
    pillars["catalyseurs"] = 1 if gap and gap >= 3 and pillars["rentabilite"] >= 0 else 0
    if t.dividend_suspended and (t.eps_growth or 0) > 0:
        pillars["catalyseurs"] = 1
        flags.append("Dividende suspendu malgré des bénéfices en hausse : reprise = catalyseur, "
                     "mais les fonds de rendement restent à l'écart")
    if t.eps_growth is not None and t.eps_growth < 0:
        flags.append(f"Bénéfice en baisse ({t.eps_growth * 100:+.0f} %) : risque de piège à valeur")

    # 5. Détection précoce : le marché n'a pas encore intégré l'histoire
    signaux, note = [], 0
    ecart, peg = m["ecart_vs_composite_pts"], m["peg"]
    # Retard / avance sur le Composite : affichés seulement. Au backtest, les retardataires n'ont pas
    # battu le marché (et l'ont nettement sous-performé d'avril à octobre 2026).
    if ecart is not None and ecart <= RETARD_RELATIF:
        flags.append(f"Retard de {ecart:.0f} pts sur le Composite (informatif, non compté)")
    if ecart is not None and ecart >= DEJA_DECOUVERTE:
        flags.append(f"Déjà très remontée : {ecart:+.0f} pts au-dessus du Composite (informatif)")
    if peg is not None and peg < PEG_CIBLE:
        note += 1
        signaux.append(f"PEG {peg} < 1 (croissance non payée)")
    if (t.volume_ratio is not None and t.volume_ratio >= ACCUMULATION_VOLUME
            and t.price_change_pct is not None and abs(t.price_change_pct) < ACCUMULATION_PRIX):
        note += 1
        signaux.append(f"volume x{t.volume_ratio} sans mouvement de cours (accumulation discrète)")
    pillars["detection_precoce"] = max(-1, min(1, note))
    if signaux:
        flags.append("Signaux précoces : " + " ; ".join(signaux))
    if t.risk_notes:
        flags.append(f"Risque spécifique : {t.risk_notes}")

    a = Analysis(ticker=t.ticker, metrics=m, pillars=pillars, flags=flags,
                 score=sum(pillars.values()), eps_growth=t.eps_growth,
                 dividend_suspended=t.dividend_suspended)
    a.verdict = _verdict(a, m)
    return a


def _verdict(a: Analysis, m: dict) -> str:
    p = a.pillars
    if p["microstructure"] < 0 and (m["hausse_depuis_ipo_pct"] or 0) >= FOMO_HAUSSE_IPO:
        return "PRISE DE BÉNÉFICES" if m["plus_value_pru_pct"] else "ÉVITER (bulle post-IPO)"
    if p["valorisation"] < 0 and (m["rendement_pct"] or 0) < RENDEMENT_FAIBLE:
        return "PRISE DE BÉNÉFICES" if (m["plus_value_pru_pct"] or 0) > 0 else "CONSERVATION (WATCHLIST)"
    bpa_en_baisse = (a.eps_growth or 0) < 0
    if (p["valorisation"] >= 2 and p["rentabilite"] >= 0 and a.score >= 2 and not bpa_en_baisse):
        return ("PÉPITE SPÉCULATIVE (position réduite)" if a.dividend_suspended
                else "PÉPITE (ACHAT PRÉCOCE)")
    if p["valorisation"] > 0 and p["rentabilite"] > 0 and a.score >= 2:
        return "ACHAT"
    return "CONSERVATION (WATCHLIST)"


class BRVMAnalystSkill:
    """Analyste BRVM : scoring déterministe + commentaire LLM local optionnel."""

    def __init__(self, model_name: str = "gemma4:4b", use_llm: bool = True):
        self.model = model_name
        self.use_llm = use_llm
        self.system_instruction = (
            "Tu es l'expert IA de la plateforme locale BRVM, spécialiste de l'analyse "
            "fondamentale et technique. Les métriques et le verdict fournis sont calculés "
            "par un moteur déterministe : ne les recalcule pas et ne les contredis pas sans "
            "raison chiffrée. Explique en français, en 5 à 8 lignes, la stratégie d'entrée "
            "ou de sortie (tranches, niveaux de cours, risques) en t'appuyant sur la matrice "
            "à 5 piliers : valorisation, rentabilité, microstructure, catalyseurs, détection précoce."
        )

    def analyze(self, t: TickerInput) -> Analysis:
        a = score_pillars(t, compute_metrics(t))
        if self.use_llm:
            a.llm_comment = self._ask_llm(t, a)
        return a

    def analyze_ticker(self, ticker, price, dividend, news_context="", **kwargs) -> Analysis:
        """Signature compatible avec la version d'origine, enrichie des métriques."""
        return self.analyze(TickerInput(ticker=ticker, price=price, dividend=dividend,
                                        news_context=news_context, **kwargs))

    def _ask_llm(self, t: TickerInput, a: Analysis) -> Optional[str]:
        try:
            import ollama
        except ImportError:
            return "(LLM indisponible : installer la bibliothèque avec `pip install ollama`)"
        prompt = (
            f"Titre : {t.ticker} | Cours : {t.price:.0f} FCFA | Dividende net : {t.dividend if t.dividend is not None else 'n.d.'} FCFA\n"
            f"Métriques : {json.dumps(a.metrics, ensure_ascii=False)}\n"
            f"Piliers (+1/0/-1) : {json.dumps(a.pillars, ensure_ascii=False)} | Score : {a.score}\n"
            f"Alertes : {'; '.join(a.flags) or 'aucune'}\n"
            f"Verdict du moteur : {a.verdict}\n"
            f"Contexte : {t.news_context or 'non fourni'}\n\n"
            "Question : quelle stratégie adopter ?"
        )
        try:
            resp = ollama.chat(model=self.model, messages=[
                {"role": "system", "content": self.system_instruction},
                {"role": "user", "content": prompt},
            ])
        except Exception as e:  # serveur Ollama absent ou modèle non téléchargé
            return f"(LLM indisponible : {e})"
        return resp["message"]["content"]


def format_report(a: Analysis) -> str:
    m = a.metrics
    fmt = lambda v, s="": "n.d." if v is None else f"{v}{s}"
    lines = [
        f"=== {a.ticker} ===",
        f"Rendement net : {fmt(m['rendement_pct'], ' %')} | PER : {fmt(m['per'], 'x')} | "
        f"P/BV : {fmt(m['pbv'], 'x')} | ROE : {fmt(m['roe_pct'], ' %')} | "
        f"Payout : {fmt(m['payout_pct'], ' %')}",
        f"PEG : {fmt(m['peg'])} | Écart vs Composite : {fmt(m['ecart_vs_composite_pts'], ' pts')}",
        "Piliers : " + ", ".join(f"{k} {v:+d}" for k, v in a.pillars.items()) + f" | score {a.score:+d}",
    ]
    if m["plus_value_pru_pct"] is not None:
        lines.append(f"Plus-value vs PRU : {m['plus_value_pru_pct']:+.1f} %")
    lines += [f"⚠ {f}" for f in a.flags]
    if a.verdict == "ACHAT" and (a.eps_growth or 0) < 0:
        lines.append("Note : achat de rendement/valeur, pas une pépite tant que le bénéfice recule")
    lines.append(f"VERDICT : {a.verdict}")
    if a.llm_comment:
        lines += ["", "Avis LLM :", a.llm_comment]
    return "\n".join(lines)


# Colonnes CSV acceptées par --screen (les autres sont ignorées)
_FLOAT_FIELDS = ("price", "dividend", "eps", "book_value", "roe", "sector_per", "pru",
                 "ipo_price", "pre_detachment_price", "eps_growth", "perf_ytd_pct",
                 "index_perf_ytd_pct", "volume_ratio", "price_change_pct", "bid_qty", "ask_qty")


def row_to_input(row: dict, index_perf_ytd_pct: Optional[float] = None) -> Optional[TickerInput]:
    """Convertit une ligne de la cote (CSV ou lecteur de BOC) en TickerInput ; None si inexploitable."""
    get = lambda k: "" if row.get(k) is None else str(row.get(k)).strip()
    if not get("ticker") or not get("price") or get("suspendu").lower() == "oui":
        return None  # cotation suspendue : pas d'entrée possible
    kw = {k: float(get(k)) for k in _FLOAT_FIELDS if get(k)}
    if index_perf_ytd_pct is not None and "index_perf_ytd_pct" not in kw:
        kw["index_perf_ytd_pct"] = index_perf_ytd_pct
    kw.setdefault("dividend", None)
    if get("sessions_since_ipo"):
        kw["sessions_since_ipo"] = int(float(get("sessions_since_ipo")))
    kw["dividend_suspended"] = get("dividend_suspended").lower() in ("1", "true", "oui")
    kw["risk_notes"] = get("risk_notes")
    return TickerInput(ticker=get("ticker"), **kw)


def load_universe(path: str, index_perf_ytd_pct: Optional[float] = None) -> list:
    """Lit un CSV de la cote (une ligne par titre) et renvoie des TickerInput."""
    with open(path, newline="", encoding="utf-8") as f:
        return [t for row in csv.DictReader(f) if (t := row_to_input(row, index_perf_ytd_pct))]


_VERDICT_RANG = {"PÉPITE (ACHAT PRÉCOCE)": 0, "PÉPITE SPÉCULATIVE (position réduite)": 1, "ACHAT": 1, "CONSERVATION (WATCHLIST)": 2,
                 "PRISE DE BÉNÉFICES": 3, "ÉVITER (bulle post-IPO)": 4}


def screen(inputs: list, top: int = 3) -> list:
    """Classe toute la cote : verdict d'abord, puis score, puis PEG le plus bas."""
    pers = sorted(t.price / t.eps for t in inputs if t.eps and t.eps > 0)
    for t in inputs:
        if t.eps and t.eps > 0 and pers and t.per_percentile is None:
            per = t.price / t.eps
            t.per_percentile = 100 * sum(x < per for x in pers) / len(pers)
    res = [score_pillars(t, compute_metrics(t)) for t in inputs]
    res.sort(key=lambda a: (_VERDICT_RANG.get(a.verdict, 9), -a.score,
                            a.metrics["peg"] if a.metrics["peg"] is not None else 99))
    return res


def format_screen(res: list, top: int) -> str:
    head = f"{'Rang':<5}{'Titre':<7}{'Score':>6}{'PER':>7}{'PEG':>6}{'Rdt %':>7}{'Écart':>7}  Verdict"
    lines = [head, "-" * len(head)]
    for i, a in enumerate(res, 1):
        m = a.metrics
        f = lambda v: "-" if v is None else f"{v:.1f}" if isinstance(v, float) else str(v)
        lines.append(f"{i:<5}{a.ticker:<7}{a.score:>+6d}{f(m['per']):>7}{f(m['peg']):>6}"
                     f"{f(m['rendement_pct']):>7}{f(m['ecart_vs_composite_pts']):>7}  {a.verdict}")
    lines += ["", f"=== Détail des {min(top, len(res))} premiers ==="]
    lines += [format_report(a) + "\n" for a in res[:top]]
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(description="Scoring brvm-gem-finder d'un titre ou de toute la cote BRVM")
    p.add_argument("ticker", nargs="?", help="titre à analyser (omis avec --screen)")
    p.add_argument("--screen", metavar="CSV", help="classe tous les titres d'un CSV de la cote")
    p.add_argument("--top", type=int, default=3, help="nombre de pépites détaillées (défaut 3)")
    p.add_argument("--price", type=float)
    p.add_argument("--dividend", type=float, default=0.0, help="dividende net par action")
    p.add_argument("--eps", type=float)
    p.add_argument("--eps-growth", type=float, help="fraction, ex. 0.25")
    p.add_argument("--book-value", type=float)
    p.add_argument("--roe", type=float, help="fraction, ex. 0.18")
    p.add_argument("--sector-per", type=float)
    p.add_argument("--pru", type=float)
    p.add_argument("--ipo-price", type=float)
    p.add_argument("--sessions-since-ipo", type=int)
    p.add_argument("--pre-detachment-price", type=float)
    p.add_argument("--perf-ytd", type=float, help="perf. du titre depuis janvier (%%)")
    p.add_argument("--index-perf-ytd", type=float, help="perf. du BRVM Composite depuis janvier (%%)")
    p.add_argument("--volume-ratio", type=float, help="volume récent / moyenne 20 séances")
    p.add_argument("--price-change", type=float, help="variation du cours sur la même période (%%)")
    p.add_argument("--dividend-suspended", action="store_true")
    p.add_argument("--risk", default="", help="risques spécifiques")
    p.add_argument("--news", default="")
    p.add_argument("--model", default="gemma4:4b")
    p.add_argument("--no-llm", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if args.screen:
        res = screen(load_universe(args.screen, args.index_perf_ytd), args.top)
        if args.json:
            print(json.dumps([asdict(a) for a in res], ensure_ascii=False, indent=2))
        else:
            print(format_screen(res, args.top))
        return
    if not args.ticker or args.price is None:
        p.error("indiquer un titre et --price, ou utiliser --screen <csv>")

    t = TickerInput(
        ticker=args.ticker, price=args.price, dividend=args.dividend, eps=args.eps,
        book_value=args.book_value, roe=args.roe, sector_per=args.sector_per, pru=args.pru,
        ipo_price=args.ipo_price, sessions_since_ipo=args.sessions_since_ipo,
        pre_detachment_price=args.pre_detachment_price, eps_growth=args.eps_growth,
        perf_ytd_pct=args.perf_ytd, index_perf_ytd_pct=args.index_perf_ytd,
        volume_ratio=args.volume_ratio, price_change_pct=args.price_change,
        dividend_suspended=args.dividend_suspended, risk_notes=args.risk, news_context=args.news,
    )
    a = BRVMAnalystSkill(model_name=args.model, use_llm=not args.no_llm).analyze(t)
    print(json.dumps(asdict(a), ensure_ascii=False, indent=2) if args.json else format_report(a))


if __name__ == "__main__":
    main()
