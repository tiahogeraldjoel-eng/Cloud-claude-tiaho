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
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from typing import Optional

# Seuils de la matrice brvm-gem-finder (SKILL.md)
PER_CIBLE = 12.0          # PER < 10x–12x
PER_CHER = 15.0           # au-delà : titre déjà réévalué
PBV_DECOTE = 1.0          # P/BV < 1 : décote sur fonds propres
ROE_CIBLE = 0.15          # ROE > 15 %
RENDEMENT_CIBLE = 7.0     # rendement net > 7 %
RENDEMENT_FAIBLE = 5.0
FOMO_HAUSSE_IPO = 25.0    # +25 % depuis l'introduction...
FOMO_SEANCES = 30         # ...en moins de 30 séances


@dataclass
class TickerInput:
    ticker: str
    price: float                          # cours actuel (FCFA)
    dividend: float                       # dividende net par action (FCFA)
    eps: Optional[float] = None           # bénéfice net par action (FCFA)
    book_value: Optional[float] = None    # fonds propres par action (FCFA)
    roe: Optional[float] = None           # ROE en fraction (0.18 = 18 %)
    sector_per: Optional[float] = None    # PER moyen du secteur
    pru: Optional[float] = None           # prix de revient unitaire du porteur
    ipo_price: Optional[float] = None     # prix d'introduction (post-IPO)
    sessions_since_ipo: Optional[int] = None
    pre_detachment_price: Optional[float] = None  # cours veille de détachement
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


def _ratio(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den is None or den <= 0:
        return None
    return num / den


def compute_metrics(t: TickerInput) -> dict:
    if t.price <= 0:
        raise ValueError(f"{t.ticker} : le cours doit être strictement positif")
    roe = t.roe if t.roe is not None else _ratio(t.eps, t.book_value)
    m = {
        "rendement_pct": round(t.dividend / t.price * 100, 2),
        "per": _ratio(t.price, t.eps),
        "pbv": _ratio(t.price, t.book_value),
        "roe_pct": round(roe * 100, 1) if roe is not None else None,
        "payout_pct": _ratio(t.dividend * 100, t.eps),
        "plus_value_pru_pct": None,
        "hausse_depuis_ipo_pct": None,
        "gap_detachement_restant_pct": None,
    }
    if t.pru:
        m["plus_value_pru_pct"] = (t.price / t.pru - 1) * 100
    if t.ipo_price:
        m["hausse_depuis_ipo_pct"] = (t.price / t.ipo_price - 1) * 100
    if t.pre_detachment_price:
        m["gap_detachement_restant_pct"] = max(0.0, (t.pre_detachment_price / t.price - 1) * 100)
    return {k: (round(v, 2) if isinstance(v, float) else v) for k, v in m.items()}


def score_pillars(t: TickerInput, m: dict) -> Analysis:
    """Note chaque pilier : +1 favorable, 0 neutre / inconnu, -1 défavorable."""
    pillars, flags = {}, []

    # 1. Valorisation
    per, pbv = m["per"], m["pbv"]
    per_cible = min(PER_CIBLE, t.sector_per) if t.sector_per else PER_CIBLE
    if per is None:
        pillars["valorisation"] = 0
        flags.append("PER inconnu : fournir --eps")
    elif per <= per_cible or (pbv is not None and pbv < PBV_DECOTE):
        pillars["valorisation"] = 1
    elif per > PER_CHER:
        pillars["valorisation"] = -1
        flags.append(f"PER {per}x > {PER_CHER}x : réévaluation déjà faite")
    else:
        pillars["valorisation"] = 0

    # 2. Rentabilité & dividende
    rdt, roe = m["rendement_pct"], m["roe_pct"]
    note = 0
    if rdt >= RENDEMENT_CIBLE:
        note += 1
    elif rdt < RENDEMENT_FAIBLE:
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
    else:
        pillars["microstructure"] = 0
        flags.append("Carnet d'ordres non analysé : joindre une capture Coris Bourse")

    # 4. Catalyseurs & timing
    gap = m["gap_detachement_restant_pct"]
    pillars["catalyseurs"] = 1 if gap and gap >= 3 and pillars["rentabilite"] >= 0 else 0

    a = Analysis(ticker=t.ticker, metrics=m, pillars=pillars, flags=flags,
                 score=sum(pillars.values()))
    a.verdict = _verdict(a, m)
    return a


def _verdict(a: Analysis, m: dict) -> str:
    p = a.pillars
    if p["microstructure"] < 0:
        return "PRISE DE BÉNÉFICES" if m["plus_value_pru_pct"] else "ÉVITER (bulle post-IPO)"
    if p["valorisation"] < 0 and m["rendement_pct"] < RENDEMENT_FAIBLE:
        return "PRISE DE BÉNÉFICES" if (m["plus_value_pru_pct"] or 0) > 0 else "CONSERVATION (WATCHLIST)"
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
            "à 4 piliers : valorisation, rentabilité, microstructure, catalyseurs."
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
            f"Titre : {t.ticker} | Cours : {t.price:.0f} FCFA | Dividende net : {t.dividend:.0f} FCFA\n"
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
        "Piliers : " + ", ".join(f"{k} {v:+d}" for k, v in a.pillars.items()) + f" | score {a.score:+d}",
    ]
    if m["plus_value_pru_pct"] is not None:
        lines.append(f"Plus-value vs PRU : {m['plus_value_pru_pct']:+.1f} %")
    lines += [f"⚠ {f}" for f in a.flags]
    lines.append(f"VERDICT : {a.verdict}")
    if a.llm_comment:
        lines += ["", "Avis LLM :", a.llm_comment]
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(description="Scoring brvm-gem-finder d'un titre BRVM")
    p.add_argument("ticker")
    p.add_argument("--price", type=float, required=True)
    p.add_argument("--dividend", type=float, required=True, help="dividende net par action")
    p.add_argument("--eps", type=float)
    p.add_argument("--book-value", type=float)
    p.add_argument("--roe", type=float, help="fraction, ex. 0.18")
    p.add_argument("--sector-per", type=float)
    p.add_argument("--pru", type=float)
    p.add_argument("--ipo-price", type=float)
    p.add_argument("--sessions-since-ipo", type=int)
    p.add_argument("--pre-detachment-price", type=float)
    p.add_argument("--news", default="")
    p.add_argument("--model", default="gemma4:4b")
    p.add_argument("--no-llm", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    t = TickerInput(
        ticker=args.ticker, price=args.price, dividend=args.dividend, eps=args.eps,
        book_value=args.book_value, roe=args.roe, sector_per=args.sector_per, pru=args.pru,
        ipo_price=args.ipo_price, sessions_since_ipo=args.sessions_since_ipo,
        pre_detachment_price=args.pre_detachment_price, news_context=args.news,
    )
    a = BRVMAnalystSkill(model_name=args.model, use_llm=not args.no_llm).analyze(t)
    print(json.dumps(asdict(a), ensure_ascii=False, indent=2) if args.json else format_report(a))


if __name__ == "__main__":
    main()
