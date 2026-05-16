"""
BRVM Analyzer — Application web Streamlit
Lance avec : streamlit run app.py
"""
import streamlit as st
import json, os, sys, io, tempfile, shutil
from datetime import date, datetime
from pathlib import Path
import plotly.express as px
import plotly.graph_objects as go
from brvm_data import fetch_all_quotes, get_quote, fetch_history, compute_technicals, auto_b1_score, KNOWN_TICKERS

# ── Config page ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="BRVM Analyzer",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Couleurs thème ────────────────────────────────────────────────────────────
NAVY   = "#0D1B2A"
ORANGE = "#D97706"
GREEN  = "#059669"

st.markdown(f"""
<style>
[data-testid="stSidebar"] {{ background: {NAVY}; }}
[data-testid="stSidebar"] * {{ color: white !important; }}
h1, h2, h3 {{ color: {NAVY}; }}
.stButton>button {{ background:{ORANGE}; color:white; border:none; border-radius:6px;
                    font-weight:bold; padding:0.5rem 1.5rem; }}
.stButton>button:hover {{ background:#B45309; color:white; }}
.metric-card {{ background:#F1F5F9; border-radius:8px; padding:1rem;
                border-left:4px solid {ORANGE}; margin-bottom:0.5rem; }}
.section-header {{ background:{NAVY}; color:white; padding:0.5rem 1rem;
                   border-radius:6px; font-weight:bold; margin:1rem 0 0.5rem; }}
.ok-badge {{ background:#ECFDF5; color:#059669; padding:2px 8px;
             border-radius:4px; font-size:0.85em; font-weight:bold; }}
.ko-badge {{ background:#FEF2F2; color:#DC2626; padding:2px 8px;
             border-radius:4px; font-size:0.85em; font-weight:bold; }}
.verdict-badge {{ padding:1rem 2rem; border-radius:12px; font-size:1.5rem;
                  font-weight:bold; text-align:center; display:inline-block; }}
.saved-indicator {{ background:#ECFDF5; color:#059669; padding:4px 10px;
                    border-radius:6px; font-size:0.8em; font-weight:bold;
                    border:1px solid #059669; }}
.report-header {{ background:{NAVY}; color:white; padding:1.5rem 2rem;
                  border-radius:10px; margin-bottom:1.5rem; }}
.report-section {{ background:#F8FAFC; border-radius:8px; padding:1rem 1.5rem;
                   border:1px solid #E2E8F0; margin-bottom:1rem; }}
@media print {{
    [data-testid="stSidebar"] {{ display: none !important; }}
    [data-testid="stHeader"] {{ display: none !important; }}
    [data-testid="stToolbar"] {{ display: none !important; }}
    .stButton {{ display: none !important; }}
    section[data-testid="stSidebarContent"] {{ display: none !important; }}
    .block-container {{ padding: 0 !important; max-width: 100% !important; }}
}}
</style>
""", unsafe_allow_html=True)

# ── Chemins ────────────────────────────────────────────────────────────────────
ANALYZER_DIR = Path(__file__).parent
sys.path.insert(0, str(ANALYZER_DIR))
ANALYSES_DIR = ANALYZER_DIR / "analyses"
ANALYSES_DIR.mkdir(exist_ok=True)

ANNEES = ["N-4", "N-3", "N-2", "N-1", "N"]
SECTEURS = ["Banque", "Assurance", "Industrie", "Agroalimentaire",
            "Telecom", "Distribution", "Energie", "Immobilier", "Autre"]


# ════════════════════════════════════════════════════════════════════════════
#  SESSION STATE — stocke les données saisies
# ════════════════════════════════════════════════════════════════════════════
def init_state():
    defaults = {
        # Identité
        "nom": "", "ticker": "", "secteur": "", "date_analyse": str(date.today().strftime("%d/%m/%Y")),
        # CA (M FCFA) — 5 ans
        "ca": [None]*5,
        # RN (M FCFA) — 5 ans
        "rn": [None]*5,
        # Valorisation
        "prix": None, "bnpa": None, "capitaux_propres": None,
        "valeur_comptable": None, "nb_titres": None,
        # Dividendes NET (5 ans)
        "dividendes": [None]*5,
        # Bilan
        "dette_lt": None, "dette_ct": None, "ebit": None,
        "charges_fin": None, "actifs_cour": None, "passifs_cour": None,
        # FCF
        "amortissements": None, "capex": None, "var_bfr": None,
        # Psychologie
        "prix_avant": None, "prix_apres": None,
        # Taux sans risque
        "taux_sr": 6.5,
        # Technique B1
        "score_b1": None,
        # Stop-loss
        "prix_achat": None, "stop_loss": None, "take_profit": None,
        # Portefeuille
        "portef": [
            {"ticker": "", "secteur": "", "nb": None, "px_achat": None,
             "px_actuel": None, "div": None, "note": None}
            for _ in range(25)
        ],
        # Auto-save indicator
        "_last_saved": None,
        # Override flags for auto-calculated fields
        "override_bnpa": False, "override_bfr": False,
        "override_sl": False, "override_tp": False,
        # Technical sub-criteria checkboxes
        "tech_mm20": False, "tech_boll": False, "tech_macd": False,
        "tech_rsi": False, "tech_vol": False,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

init_state()


# ════════════════════════════════════════════════════════════════════════════
#  FONCTIONS UTILITAIRES
# ════════════════════════════════════════════════════════════════════════════

def state_to_dict():
    """Exporte le session_state pertinent en dict sérialisable."""
    KEYS = [
        "nom", "ticker", "secteur", "date_analyse",
        "ca", "rn",
        "prix", "bnpa", "capitaux_propres", "valeur_comptable", "nb_titres",
        "dividendes",
        "dette_lt", "dette_ct", "ebit", "charges_fin", "actifs_cour", "passifs_cour",
        "amortissements", "capex", "var_bfr",
        "prix_avant", "prix_apres", "taux_sr",
        "score_b1", "prix_achat", "stop_loss", "take_profit",
        "portef",
    ]
    return {k: st.session_state.get(k) for k in KEYS}


def dict_to_state(d: dict):
    """Charge un dict sauvegardé dans le session_state."""
    KEYS = [
        "nom", "ticker", "secteur", "date_analyse",
        "ca", "rn",
        "prix", "bnpa", "capitaux_propres", "valeur_comptable", "nb_titres",
        "dividendes",
        "dette_lt", "dette_ct", "ebit", "charges_fin", "actifs_cour", "passifs_cour",
        "amortissements", "capex", "var_bfr",
        "prix_avant", "prix_apres", "taux_sr",
        "score_b1", "prix_achat", "stop_loss", "take_profit",
        "portef",
    ]
    for k in KEYS:
        if k in d:
            st.session_state[k] = d[k]


def source_helper(page_num):
    """Affiche un expander 'Où trouver ces données' avec liens directs par ticker."""
    tk = st.session_state.ticker.upper() if st.session_state.ticker else ""
    tk_low = tk.lower()
    rb  = f"https://www.richbourse.com/cours/{tk}" if tk else "https://www.richbourse.com"
    sf  = f"https://www.sikafinance.com/marches/cotation/{tk}" if tk else "https://www.sikafinance.com"
    sfh = f"https://www.sikafinance.com/marches/historiques/{tk}" if tk else "https://www.sikafinance.com"
    brv = f"https://www.brvm.org/fr/cours-action/{tk_low}/0/" if tk else "https://www.brvm.org"

    guides = {
        2: {
            "titre": "CA & Résultat Net (5 ans)",
            "liens": [
                (rb,  "Richbourse — Compte de résultat", "Section « Résultats » → tableau CA / RN sur 5 ans"),
                (sf,  "SikaFinance — Fiche cotation",    "Onglet « Financier » → CA et Résultat net"),
            ],
            "astuce": "Cherchez 'Chiffre d'affaires' et 'Résultat net' dans le tableau des 5 dernières années. Saisir en **millions FCFA**.",
        },
        3: {
            "titre": "Valorisation (Prix, BNPA, Capitaux propres)",
            "liens": [
                (rb,  "Richbourse — Ratios",     "Section « Ratios » → BNPA, PER, PBR, capitaux propres"),
                (sf,  "SikaFinance — Cotation",  "Onglet « Données » → Nombre de titres, Capitalisation"),
                (brv, "BRVM.org — Fiche",        "Prix actuel, nombre de titres en circulation"),
            ],
            "astuce": "**BNPA** = Bénéfice Net Par Action (calculé auto si vous avez RN + Nb titres). **Capitaux propres** = dans le bilan sous 'Fonds propres'.",
        },
        4: {
            "titre": "Dividendes (5 ans)",
            "liens": [
                (rb,  "Richbourse — Dividendes", "Section « Dividendes » → historique des versements"),
                (sfh, "SikaFinance — Historique", "Onglet « Dividendes »"),
                (brv, "BRVM.org — Dividendes",   "Fiche société → dividendes déclarés"),
            ],
            "astuce": "Saisir le dividende **NET** (après 15% de retenue à la source). Dividende brut × 0.85 = dividende net.",
        },
        5: {
            "titre": "Bilan & FCF",
            "liens": [
                (rb,  "Richbourse — Bilan",         "Section « Bilan » → dettes, actifs, capitaux propres"),
                (sf,  "SikaFinance — Financier",     "Tableau de flux de trésorerie → amortissements, CAPEX"),
            ],
            "astuce": "**Amortissements** et **CAPEX** se trouvent dans le 'Tableau des flux de trésorerie' du rapport annuel (téléchargeable sur le site de la société ou BRVM.org).",
        },
    }

    if page_num not in guides:
        return
    g = guides[page_num]
    with st.expander(f"🔗 Où trouver ces données{' pour ' + tk if tk else ''} ?", expanded=False):
        st.markdown(f"**{g['titre']}**")
        st.info(f"💡 {g['astuce']}")
        st.markdown("**Liens directs :**")
        cols = st.columns(len(g["liens"]))
        for col, (url, label, desc) in zip(cols, g["liens"]):
            col.markdown(f"[🔗 {label}]({url})")
            col.caption(desc)


def save_analysis():
    """Sauvegarde l'analyse courante en JSON."""
    ticker = st.session_state.ticker
    if not ticker:
        return False
    today_str = date.today().strftime("%Y%m%d")
    filename = ANALYSES_DIR / f"{ticker.upper()}_{today_str}.json"
    data = state_to_dict()
    data["_saved_at"] = datetime.now().isoformat()
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    st.session_state._last_saved = datetime.now().strftime("%H:%M:%S")
    return True


def list_analyses():
    """Retourne la liste des fichiers d'analyses sauvegardés."""
    files = sorted(ANALYSES_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
    result = []
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
            result.append({
                "path": f,
                "filename": f.name,
                "nom": d.get("nom", ""),
                "ticker": d.get("ticker", ""),
                "secteur": d.get("secteur", ""),
                "saved_at": d.get("_saved_at", ""),
                "data": d,
            })
        except Exception:
            pass
    return result


def compute_scores():
    """Calcule le scorecard complet /45 et retourne (scores_fond, scores_tech, details)."""
    ss = st.session_state
    scores_fond = {}
    scores_tech = {}

    ca = ss.ca or [None]*5
    rn = ss.rn or [None]*5
    divs = ss.dividendes or [None]*5
    p = ss.prix or 0
    bnpa = ss.bnpa or 0
    cp = ss.capitaux_propres or 0
    nb = ss.nb_titres or 0

    # ── Fondamental /30 ──────────────────────────────────────────────────────

    # 1. Croissance CA N/N-4
    if ca[0] and ca[4] and ca[0] != 0:
        g_ca = (ca[4] - ca[0]) / abs(ca[0]) * 100
        s = 3 if g_ca >= 15 else 2 if g_ca >= 5 else 1 if g_ca >= 0 else 0
        scores_fond["Croissance CA (N/N-4)"] = (f"{g_ca:.1f}%", s)
    else:
        scores_fond["Croissance CA (N/N-4)"] = ("N/A", 0)

    # 2. Croissance RN N/N-4
    if rn[0] and rn[4] and rn[0] != 0:
        g_rn = (rn[4] - rn[0]) / abs(rn[0]) * 100
        s = 3 if g_rn >= 15 else 2 if g_rn >= 5 else 1 if g_rn >= 0 else 0
        scores_fond["Croissance RN (N/N-4)"] = (f"{g_rn:.1f}%", s)
    else:
        scores_fond["Croissance RN (N/N-4)"] = ("N/A", 0)

    # 3. Marge nette année N
    if ca[4] and rn[4] and ca[4] != 0:
        marge = rn[4] / ca[4] * 100
        s = 3 if marge >= 10 else 2 if marge >= 5 else 1 if marge >= 2 else 0
        scores_fond["Marge nette (année N)"] = (f"{marge:.1f}%", s)
    else:
        scores_fond["Marge nette (année N)"] = ("N/A", 0)

    # 4. PER
    if p > 0 and bnpa > 0:
        per = p / bnpa
        s = 3 if per < 9 else 2 if per <= 15 else 1 if per <= 20 else 0
        scores_fond["PER"] = (f"{per:.1f}x", s)
    else:
        scores_fond["PER"] = ("N/A", 0)

    # 5. PBR
    if p > 0 and cp > 0 and nb > 0:
        pbr = (p * nb) / cp
        s = 3 if pbr < 1 else 1 if pbr < 2 else 0
        scores_fond["PBR"] = (f"{pbr:.2f}x", s)
    else:
        scores_fond["PBR"] = ("N/A", 0)

    # 6. ROE
    if rn[4] and cp > 0:
        roe = rn[4] * 1e6 / cp * 100
        s = 3 if roe >= 15 else 2 if roe >= 10 else 1 if roe >= 5 else 0
        scores_fond["ROE"] = (f"{roe:.1f}%", s)
    else:
        scores_fond["ROE"] = ("N/A", 0)

    # 7. Rendement dividende
    if divs[4] and p > 0:
        rdt = divs[4] / p * 100
        s = 3 if rdt >= 6 else 2 if rdt >= 3 else 1 if rdt >= 1 else 0
        scores_fond["Rendement dividende"] = (f"{rdt:.2f}%", s)
    else:
        scores_fond["Rendement dividende"] = ("N/A", 0)

    # 8. Tendance dividende CAGR
    valid_divs = [d for d in divs if d and d > 0]
    if len(valid_divs) >= 2 and valid_divs[0] > 0:
        n_years = max(len(valid_divs) - 1, 1)
        cagr = (valid_divs[-1] / valid_divs[0]) ** (1 / n_years) - 1
        s = 3 if cagr >= 0.10 else 2 if cagr >= 0.02 else 1 if cagr >= 0 else 0
        scores_fond["Tendance dividende (CAGR)"] = (f"{cagr*100:.1f}%/an", s)
    else:
        scores_fond["Tendance dividende (CAGR)"] = ("N/A", 0)

    # 9. Réaction marché post-résultats
    pa = ss.prix_avant or 0
    pp = ss.prix_apres or 0
    if pa > 0 and pp > 0:
        react = (pp - pa) / pa * 100
        s = 3 if react >= 5 else 2 if react >= 0 else 1 if react >= -5 else 0
        scores_fond["Réaction marché post-résultats"] = (f"{react:+.1f}%", s)
    else:
        scores_fond["Réaction marché post-résultats"] = ("N/A", 0)

    # 10. FCF Yield
    rn_n = (rn[4] or 0) * 1e6
    amort = ss.amortissements or 0
    capex = ss.capex or 0
    var_bfr = ss.var_bfr or 0
    fcf = rn_n + amort - capex - var_bfr
    vmc = p * nb if p > 0 and nb > 0 else 0
    if vmc > 0 and rn_n:
        fcf_yield = fcf / vmc * 100
        s = 3 if fcf_yield >= 8 else 2 if fcf_yield >= 4 else 1 if fcf_yield >= 0 else 0
        scores_fond["FCF Yield"] = (f"{fcf_yield:.1f}%", s)
    else:
        scores_fond["FCF Yield"] = ("N/A", 0)

    # ── Technique /15 ────────────────────────────────────────────────────────

    # 1. Score B1
    b1 = ss.score_b1
    if b1 is not None:
        s = 3 if b1 >= 4 else 2 if b1 >= 1 else 1 if b1 == 0 else 0
        scores_tech["Score technique B1"] = (f"{b1:+d}/5", s)
    else:
        scores_tech["Score technique B1"] = ("N/A", 0)

    # 2. Prime de risque vs OAT
    taux_sr = ss.taux_sr or 6.5
    if divs[4] and p > 0:
        rdt_div = divs[4] / p * 100
        prime = rdt_div - taux_sr
        s = 3 if prime >= 3 else 2 if prime >= 1 else 1 if prime >= 0 else 0
        scores_tech["Prime de risque vs OAT"] = (f"{prime:+.1f}%", s)
    else:
        scores_tech["Prime de risque vs OAT"] = ("N/A", 0)

    # 3. FCF Coverage
    div_n = divs[4]
    if div_n and nb > 0 and rn_n:
        divs_tot = div_n / 0.85 * nb
        coverage = fcf / divs_tot if divs_tot > 0 else 0
        s = 3 if coverage >= 2 else 2 if coverage >= 1 else 1 if coverage >= 0.5 else 0
        scores_tech["FCF Coverage"] = (f"{coverage:.1f}x", s)
    else:
        scores_tech["FCF Coverage"] = ("N/A", 0)

    # 4. Risk/Reward ratio
    px_achat = ss.prix_achat or 0
    sl = ss.stop_loss or 0
    tp = ss.take_profit or 0
    if px_achat > 0 and sl > 0 and tp > 0:
        gain = tp - px_achat
        perte = px_achat - sl
        rr = gain / perte if perte > 0 else 0
        s = 3 if rr >= 3 else 2 if rr >= 2 else 1 if rr >= 1 else 0
        scores_tech["Risk/Reward ratio"] = (f"{rr:.1f}x", s)
    else:
        scores_tech["Risk/Reward ratio"] = ("N/A", 0)

    # 5. Stop-loss valide
    if px_achat > 0 and sl > 0 and tp > 0 and sl < px_achat < tp:
        scores_tech["Stop-loss valide"] = ("Configuré ✓", 3)
    else:
        scores_tech["Stop-loss valide"] = ("Non configuré", 0)

    total_fond = sum(s for _, s in scores_fond.values())
    total_tech = sum(s for _, s in scores_tech.values())
    total = total_fond + total_tech

    # Verdict
    if total >= 33:
        verdict = ("ACHETER", "🟢", "#059669", "#ECFDF5")
    elif total >= 27:
        verdict = ("SURVEILLER", "🟡", "#B45309", "#FFFBEB")
    elif total >= 18:
        verdict = ("CONSERVER", "🟠", "#EA580C", "#FFF7ED")
    else:
        verdict = ("ÉVITER", "🔴", "#DC2626", "#FEF2F2")

    extras = {
        "fcf": fcf,
        "fcf_yield": fcf / vmc * 100 if vmc > 0 and rn_n else None,
        "vmc": vmc,
        "rn_n": rn_n,
        "amort": amort,
        "capex": capex,
        "var_bfr": var_bfr,
    }
    if divs[4] and p > 0:
        extras["rdt_div"] = divs[4] / p * 100
        extras["prime"] = extras["rdt_div"] - (ss.taux_sr or 6.5)

    return scores_fond, scores_tech, total_fond, total_tech, total, verdict, extras


def completeness_checks():
    ss = st.session_state
    return [
        bool(ss.nom),
        bool(ss.ticker),
        bool(ss.secteur),
        all(v is not None for v in ss.ca),
        all(v is not None for v in ss.rn),
        ss.prix is not None and ss.prix > 0,
        ss.bnpa is not None and ss.bnpa > 0,
        ss.capitaux_propres is not None and ss.capitaux_propres > 0,
        ss.nb_titres is not None and ss.nb_titres > 0,
        any(v is not None for v in ss.dividendes),
        ss.dette_lt is not None,
        ss.actifs_cour is not None,
        ss.amortissements is not None,
        ss.prix_avant is not None and ss.prix_avant > 0,
        ss.score_b1 is not None,
    ]


# ════════════════════════════════════════════════════════════════════════════
#  AUTO-SAVE (si ticker renseigné)
# ════════════════════════════════════════════════════════════════════════════
if st.session_state.ticker:
    save_analysis()


# ════════════════════════════════════════════════════════════════════════════
#  SIDEBAR — Navigation
# ════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("## 📈 BRVM Analyzer")
    st.markdown("---")
    page = st.radio("Navigation", [
        "🏠 Accueil",
        "📂 Mes analyses",
        "1️⃣  Identité société",
        "2️⃣  Résultats 5 ans",
        "3️⃣  Valorisation",
        "4️⃣  Dividendes",
        "5️⃣  Bilan & FCF",
        "6️⃣  Technique & Risque",
        "📊 Scorecard /45",
        "💼 Portefeuille",
        "📄 Rapport",
        "📥 Générer Excel",
    ], label_visibility="collapsed")
    st.markdown("---")

    # Indicateur de complétude
    checks = completeness_checks()
    done = sum(checks)
    total_c = len(checks)
    pct = done / total_c
    st.markdown("**Complétude**")
    st.progress(pct, text=f"{done}/{total_c} étapes")
    if done == total_c:
        st.success("✅ Analyse complète !")
    elif done >= 9:
        st.warning(f"🟡 {total_c - done} étapes restantes")
    else:
        st.error(f"🔴 {total_c - done} étapes manquantes")

    # Indicateur sauvegarde
    if st.session_state._last_saved:
        st.markdown(
            f"<div class='saved-indicator'>💾 Sauvegardé {st.session_state._last_saved}</div>",
            unsafe_allow_html=True)

    if st.session_state.nom:
        st.markdown("---")
        st.markdown(f"**En cours :** {st.session_state.nom}")
        st.markdown(f"`{st.session_state.ticker}` — {st.session_state.secteur}")


# ════════════════════════════════════════════════════════════════════════════
#  PAGE — ACCUEIL
# ════════════════════════════════════════════════════════════════════════════
if page == "🏠 Accueil":
    col1, col2 = st.columns([2, 1])
    with col1:
        st.title("📈 BRVM Analyzer")
        st.subheader("Outil d'analyse boursière — Bourse Régionale des Valeurs Mobilières")
        st.markdown("""
        **Remplissez les données en 6 étapes → générez votre fiche d'analyse Excel complète.**

        | Page | Contenu |
        |------|---------|
        | **📂 Mes analyses** | Sauvegardes, comparaison côte-à-côte |
        | **1–6 Saisie** | Données fondamentales, bilan, technique |
        | **📊 Scorecard /45** | Score complet avec radar chart et verdict |
        | **💼 Portefeuille** | Suivi de positions avec charts P&L |
        | **📄 Rapport** | Fiche de synthèse imprimable dans le navigateur |
        | **📥 Générer Excel** | Export complet toutes feuilles |
        """)

        st.markdown("---")
        analyses = list_analyses()
        if analyses:
            st.markdown(f"**{len(analyses)} analyse(s) sauvegardée(s)** — dernière : `{analyses[0]['ticker']}` le {analyses[0]['saved_at'][:10] if analyses[0]['saved_at'] else '—'}")

    with col2:
        logo_path = ANALYZER_DIR / "logo.png"
        if logo_path.exists():
            st.image(str(logo_path), width=260)
        st.info("**Démarrer →** Utilisez le menu à gauche")
        if st.session_state.nom:
            st.success(f"**En cours :** {st.session_state.nom} ({st.session_state.ticker})")


# ════════════════════════════════════════════════════════════════════════════
#  PAGE — MES ANALYSES
# ════════════════════════════════════════════════════════════════════════════
elif page == "📂 Mes analyses":
    st.title("📂 Mes analyses sauvegardées")

    analyses = list_analyses()

    if not analyses:
        st.info("Aucune analyse sauvegardée pour le moment. Renseignez un ticker pour démarrer l'auto-save.")
        st.stop()

    # ── Liste des analyses ────────────────────────────────────────────────
    st.markdown(f"**{len(analyses)} analyse(s) trouvée(s)**")

    col_a, col_b = st.columns([3, 1])
    with col_a:
        for a in analyses:
            saved = a["saved_at"][:16].replace("T", " ") if a["saved_at"] else "—"
            with st.expander(f"**{a['ticker']}** — {a['nom']} ({a['secteur']}) — {saved}"):
                cc1, cc2, cc3 = st.columns(3)
                with cc1:
                    if st.button(f"📂 Charger", key=f"load_{a['filename']}"):
                        dict_to_state(a["data"])
                        st.success(f"Analyse {a['ticker']} chargée !")
                        st.rerun()
                with cc2:
                    if st.button(f"🗑️ Supprimer", key=f"del_{a['filename']}"):
                        try:
                            a["path"].unlink()
                            st.success("Supprimé.")
                            st.rerun()
                        except Exception as ex:
                            st.error(f"Erreur: {ex}")
                with cc3:
                    # Download JSON
                    raw = json.dumps(a["data"], ensure_ascii=False, indent=2)
                    st.download_button(
                        "⬇️ JSON",
                        data=raw,
                        file_name=a["filename"],
                        mime="application/json",
                        key=f"dl_{a['filename']}")

                d = a["data"]
                m1, m2, m3, m4 = st.columns(4)
                prix = d.get("prix") or 0
                bnpa = d.get("bnpa") or 0
                if prix > 0 and bnpa > 0:
                    m1.metric("PER", f"{prix/bnpa:.1f}x")
                cp = d.get("capitaux_propres") or 0
                nb = d.get("nb_titres") or 0
                if cp > 0 and nb > 0 and prix > 0:
                    m2.metric("PBR", f"{prix*nb/cp:.2f}x")
                divs = d.get("dividendes") or [None]*5
                if divs[4] and prix > 0:
                    m3.metric("Rdt Div", f"{divs[4]/prix*100:.1f}%")
                rn = d.get("rn") or [None]*5
                if rn[4] and cp > 0:
                    m4.metric("ROE", f"{rn[4]*1e6/cp*100:.1f}%")

    # ── Comparaison côte-à-côte ─────────────────────────────────────────
    st.markdown("---")
    st.markdown("### 🔄 Comparer deux analyses")
    tickers_list = [a["ticker"] for a in analyses]
    c1, c2 = st.columns(2)
    with c1:
        sel_a = st.selectbox("Analyse A", tickers_list, key="cmp_a")
    with c2:
        sel_b = st.selectbox("Analyse B", tickers_list,
                             index=min(1, len(tickers_list)-1), key="cmp_b")

    da = next((a["data"] for a in analyses if a["ticker"] == sel_a), None)
    db = next((a["data"] for a in analyses if a["ticker"] == sel_b), None)

    if da and db and sel_a != sel_b:
        COMPARE_METRICS = [
            ("Prix (FCFA)", lambda d: d.get("prix")),
            ("PER", lambda d: round(d.get("prix",0)/d.get("bnpa",1), 1) if d.get("bnpa") else None),
            ("PBR", lambda d: round(d.get("prix",0)*d.get("nb_titres",0)/d.get("capitaux_propres",1), 2)
             if d.get("capitaux_propres") else None),
            ("ROE (%)", lambda d: round((d.get("rn") or [None]*5)[4]*1e6/d.get("capitaux_propres",1)*100, 1)
             if (d.get("rn") or [None]*5)[4] and d.get("capitaux_propres") else None),
            ("Rdt Div (%)", lambda d: round((d.get("dividendes") or [None]*5)[4]/d.get("prix",1)*100, 2)
             if (d.get("dividendes") or [None]*5)[4] and d.get("prix") else None),
            ("CA N (M FCFA)", lambda d: (d.get("ca") or [None]*5)[4]),
            ("RN N (M FCFA)", lambda d: (d.get("rn") or [None]*5)[4]),
        ]

        hdr_cols = st.columns([3, 2, 2])
        hdr_cols[0].markdown("**Critère**")
        hdr_cols[1].markdown(f"**{sel_a}**")
        hdr_cols[2].markdown(f"**{sel_b}**")
        st.markdown("---")

        for label, fn in COMPARE_METRICS:
            va = fn(da)
            vb = fn(db)
            cols = st.columns([3, 2, 2])
            cols[0].markdown(label)
            cols[1].markdown(f"`{va}`" if va is not None else "—")
            cols[2].markdown(f"`{vb}`" if vb is not None else "—")

    # Score history timeline
    all_analyses = list_analyses()
    if len(all_analyses) >= 2:
        st.markdown("---")
        st.markdown("### 📈 Évolution des scores dans le temps")
        import pandas as pd
        history_rows = []
        for a in all_analyses:
            d = a["data"]
            saved = a["saved_at"]
            if not saved:
                continue
            ticker = d.get("ticker", "?")
            try:
                dt = pd.to_datetime(saved[:10])
            except Exception:
                continue
            rn = d.get("rn") or [None]*5
            prix = d.get("prix") or 0
            bnpa = d.get("bnpa") or 0
            cp = d.get("capitaux_propres") or 0
            nb = d.get("nb_titres") or 0
            divs = d.get("dividendes") or [None]*5
            per = prix/bnpa if prix > 0 and bnpa > 0 else 0
            roe = (rn[4] or 0)*1e6/cp*100 if cp > 0 else 0
            rdt = (divs[4] or 0)/prix*100 if prix > 0 else 0
            est_score = min(30, int((roe>10)*3 + (per>0 and per<15)*3 + (rdt>3)*3 + ((rn[4] or 0)>0)*3))
            history_rows.append({"Date": dt, "Ticker": ticker, "Score estimé": est_score})
        if len(history_rows) >= 2:
            df_hist_score = pd.DataFrame(history_rows).sort_values("Date")
            fig_score_hist = px.line(
                df_hist_score, x="Date", y="Score estimé", color="Ticker",
                title="Évolution des scores sauvegardés",
                markers=True, color_discrete_sequence=[NAVY, ORANGE, GREEN, "#8B5CF6"])
            fig_score_hist.add_hline(y=33, line_dash="dash", line_color=GREEN, annotation_text="Acheter ≥33")
            fig_score_hist.add_hline(y=27, line_dash="dash", line_color=ORANGE, annotation_text="Surveiller ≥27")
            fig_score_hist.update_layout(plot_bgcolor="white", paper_bgcolor="white", height=300)
            st.plotly_chart(fig_score_hist, use_container_width=True)


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 1 — IDENTITE
# ════════════════════════════════════════════════════════════════════════════
elif page == "1️⃣  Identité société":
    st.title("1 — Identité de la société")
    col1, col2 = st.columns(2)
    with col1:
        st.session_state.nom = st.text_input(
            "Nom complet de la société *",
            value=st.session_state.nom,
            placeholder="ex: Société Africaine de Plantations d'Hévéas")

        # Ticker with BRVM autocomplete
        all_tickers = [""] + KNOWN_TICKERS
        ticker_idx = all_tickers.index(st.session_state.ticker) if st.session_state.ticker in all_tickers else 0
        st.session_state.ticker = st.selectbox(
            "Ticker BRVM *",
            all_tickers,
            index=ticker_idx,
            help="Sélectionnez parmi les 47 titres BRVM cotés"
        )
        # Allow free-text entry for tickers not in list
        if not st.session_state.ticker:
            custom = st.text_input("Ou saisissez un ticker manuellement", placeholder="ex: SAPH")
            if custom:
                st.session_state.ticker = custom.upper().strip()

        st.session_state.secteur = st.selectbox(
            "Secteur d'activité *",
            [""] + SECTEURS,
            index=([""] + SECTEURS).index(st.session_state.secteur)
            if st.session_state.secteur in SECTEURS else 0)
    with col2:
        st.session_state.date_analyse = st.text_input(
            "Date d'analyse",
            value=st.session_state.date_analyse,
            placeholder="ex: 15/05/2026")
        st.markdown("#### Sources recommandées")
        tk = st.session_state.ticker.upper() if st.session_state.ticker else ""
        tk_low = tk.lower()
        if tk:
            st.markdown(f"""
**Liens directs pour `{tk}` :**
- 📊 [Richbourse — Bilan & Résultats](https://www.richbourse.com/cours/{tk}) → CA, RN, BNPA, dividendes 5 ans
- 📈 [SikaFinance — Cotation](https://www.sikafinance.com/marches/cotation/{tk}) → Prix, ratios, historique
- 🌐 [BRVM.org — Fiche société](https://www.brvm.org/fr/cours-action/{tk_low}/0/) → Capitalisation, dividendes déclarés
- 📰 [SikaFinance — Actualités](https://www.sikafinance.com/marches/actualites/{tk}) → Résultats publiés
            """)
        else:
            st.markdown("""
- 📊 [richbourse.com](https://www.richbourse.com) — bilans, ratios
- 📈 [sikafinance.com](https://www.sikafinance.com) — cotations, historique
- 🌐 [brvm.org](https://www.brvm.org) — cours officiels
            """)

    # Live BRVM data fetch
    if st.session_state.ticker and st.session_state.ticker.upper() in KNOWN_TICKERS:
        col_fetch1, col_fetch2 = st.columns([1, 2])
        with col_fetch1:
            if st.button("🔄 Charger prix BRVM", use_container_width=True):
                with st.spinner("Connexion BRVM..."):
                    q = get_quote(st.session_state.ticker.upper())
                    if q:
                        st.session_state.prix = q["closing_price"]
                        st.success(f"✅ Prix chargé : **{q['closing_price']:,.0f} FCFA**")
                        if q["change_pct"] != 0:
                            delta_color = "🟢" if q["change_pct"] > 0 else "🔴"
                            st.info(f"{delta_color} Variation : **{q['change_pct']:+.2f}%** | Volume : {q['volume']:,} titres")
                    else:
                        st.warning("Données non disponibles pour ce ticker. Saisissez le prix manuellement.")
        with col_fetch2:
            q = get_quote(st.session_state.ticker.upper())
            if q:
                delta_color = "green" if q["change_pct"] >= 0 else "red"
                st.markdown(
                    f"<div style='background:#F0FDF4; border:1px solid #86EFAC; border-radius:8px; padding:0.5rem 1rem; margin-top:0.3rem;'>"
                    f"<b style='color:#166534;'>📡 Cours BRVM en direct</b> — "
                    f"<b style='font-size:1.1rem;'>{q['closing_price']:,.0f} FCFA</b> "
                    f"<span style='color:{delta_color}; font-weight:bold;'>{q['change_pct']:+.2f}%</span>"
                    f"</div>", unsafe_allow_html=True)

    if st.session_state.ticker:
        save_analysis()
        st.success("💾 Analyse sauvegardée automatiquement")


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 2 — RESULTATS 5 ANS
# ════════════════════════════════════════════════════════════════════════════
elif page == "2️⃣  Résultats 5 ans":
    st.title("2 — Résultats sur 5 ans")
    source_helper(2)
    st.info("Saisir en **millions FCFA**.")

    st.markdown("**Chiffre d'Affaires (M FCFA)**")
    cols = st.columns(5)
    for i, annee in enumerate(ANNEES):
        with cols[i]:
            st.markdown(f"**{annee}**")
            ca_val = st.number_input(f"CA {annee}", key=f"ca_{i}",
                                      value=float(st.session_state.ca[i]) if st.session_state.ca[i] is not None else 0.0,
                                      step=100.0, format="%.1f", label_visibility="collapsed")
            st.session_state.ca[i] = ca_val if ca_val != 0.0 else None

    st.markdown("**Résultat Net (M FCFA)**")
    cols2 = st.columns(5)
    for i, annee in enumerate(ANNEES):
        with cols2[i]:
            rn_val = st.number_input(f"RN {annee}", key=f"rn_{i}",
                                      value=float(st.session_state.rn[i]) if st.session_state.rn[i] is not None else 0.0,
                                      step=10.0, format="%.1f", label_visibility="collapsed")
            st.session_state.rn[i] = rn_val if rn_val != 0.0 else None

    # Preview marges
    st.markdown("---")
    st.markdown("**Marges nettes calculées (%)**")
    cols3 = st.columns(5)
    for i, annee in enumerate(ANNEES):
        with cols3[i]:
            ca = st.session_state.ca[i]
            rn = st.session_state.rn[i]
            if ca and rn and ca != 0:
                marge = rn / ca * 100
                color = "green" if marge >= 5 else ("orange" if marge >= 2 else "red")
                st.markdown(f"<span style='color:{color};font-weight:bold'>{marge:.1f}%</span>", unsafe_allow_html=True)
            else:
                st.markdown("—")

    # ── Charts ────────────────────────────────────────────────────────────
    ca_data = st.session_state.ca
    rn_data = st.session_state.rn
    has_ca = any(v for v in ca_data if v)
    has_rn = any(v for v in rn_data if v)

    if has_ca or has_rn:
        st.markdown("---")
        st.markdown("### 📊 Graphiques")

        ch1, ch2 = st.columns(2)

        # Grouped bar chart CA + RN
        with ch1:
            rows = []
            for i, annee in enumerate(ANNEES):
                if ca_data[i]:
                    rows.append({"Année": annee, "Valeur (M FCFA)": ca_data[i], "Indicateur": "CA"})
                if rn_data[i]:
                    rows.append({"Année": annee, "Valeur (M FCFA)": rn_data[i], "Indicateur": "RN"})
            if rows:
                import pandas as pd
                df_bar = pd.DataFrame(rows)
                fig_bar = px.bar(
                    df_bar, x="Année", y="Valeur (M FCFA)", color="Indicateur",
                    barmode="group", title="CA & RN par année (M FCFA)",
                    color_discrete_map={"CA": NAVY, "RN": ORANGE})
                fig_bar.update_layout(
                    plot_bgcolor="white", paper_bgcolor="white",
                    font=dict(color=NAVY), legend_title_text="",
                    title_font_color=NAVY)
                st.plotly_chart(fig_bar, use_container_width=True)

        # Line chart marge nette
        with ch2:
            marge_rows = []
            for i, annee in enumerate(ANNEES):
                ca_v = ca_data[i]
                rn_v = rn_data[i]
                if ca_v and rn_v and ca_v != 0:
                    marge_rows.append({"Année": annee, "Marge nette (%)": rn_v / ca_v * 100})
            if marge_rows:
                import pandas as pd
                df_marge = pd.DataFrame(marge_rows)
                fig_marge = px.line(
                    df_marge, x="Année", y="Marge nette (%)",
                    title="Évolution marge nette (%)",
                    markers=True,
                    color_discrete_sequence=[ORANGE])
                fig_marge.update_traces(line_width=3, marker_size=8)
                fig_marge.add_hline(y=5, line_dash="dash", line_color=GREEN,
                                     annotation_text="Seuil 5%", annotation_position="right")
                fig_marge.update_layout(
                    plot_bgcolor="white", paper_bgcolor="white",
                    font=dict(color=NAVY), title_font_color=NAVY)
                st.plotly_chart(fig_marge, use_container_width=True)

    if st.session_state.ticker:
        save_analysis()


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 3 — VALORISATION
# ════════════════════════════════════════════════════════════════════════════
elif page == "3️⃣  Valorisation":
    st.title("3 — Données de valorisation")
    source_helper(3)
    col1, col2 = st.columns(2)
    with col1:
        st.session_state.prix = st.number_input("Prix actuel (FCFA) *", min_value=0.0, step=10.0,
                                                  value=float(st.session_state.prix or 0))
        # Calculate auto BNPA from RN(N) and nb_titres
        rn_n = st.session_state.rn[4]
        nb_for_bnpa = st.session_state.nb_titres or 0
        bnpa_auto = round(rn_n * 1e6 / nb_for_bnpa, 1) if rn_n and nb_for_bnpa > 0 else None

        if bnpa_auto is not None:
            override_bnpa = st.checkbox("✏️ Saisir BNPA manuellement", key="override_bnpa",
                                         value=st.session_state.get("override_bnpa", False))
            if not override_bnpa:
                st.session_state.bnpa = bnpa_auto
                st.metric("BNPA 🔒 Auto-calculé", f"{bnpa_auto:.1f} FCFA")
                st.caption("= RN(N) × 1 000 000 ÷ Nb titres")
            else:
                st.session_state.bnpa = st.number_input("BNPA (FCFA) *", step=1.0,
                                                          value=float(st.session_state.bnpa or bnpa_auto or 0))
        else:
            st.session_state.bnpa = st.number_input("BNPA — Bénéfice Net Par Action (FCFA) *",
                                                      step=1.0, value=float(st.session_state.bnpa or 0))
            st.caption("⚠️ Saisissez Résultats 5 ans + Nb titres pour calcul auto")
        st.session_state.capitaux_propres = st.number_input("Capitaux propres (FCFA) *",
                                                              step=1_000_000.0,
                                                              value=float(st.session_state.capitaux_propres or 0))
    with col2:
        st.session_state.nb_titres = st.number_input("Nombre de titres en circulation *",
                                                       step=1000.0,
                                                       value=float(st.session_state.nb_titres or 0))
        nb_cur = st.session_state.nb_titres or 0
        cp_cur = st.session_state.capitaux_propres or 0
        vc_auto = round(cp_cur / nb_cur, 1) if nb_cur > 0 and cp_cur > 0 else None
        if vc_auto is not None:
            st.metric("Valeur comptable/action 🔒 Auto", f"{vc_auto:.1f} FCFA")
            st.caption("= Capitaux propres ÷ Nb titres")
            st.session_state.valeur_comptable = vc_auto
        else:
            st.session_state.valeur_comptable = st.number_input("Valeur comptable par action (FCFA)",
                                                                  step=10.0,
                                                                  value=float(st.session_state.valeur_comptable or 0))
        st.session_state.taux_sr = st.number_input("Taux sans risque UEMOA — OAT 5 ans (%)",
                                                     value=float(st.session_state.taux_sr),
                                                     step=0.1, format="%.1f")

    # Ratios calculés live
    p = st.session_state.prix or 0
    bnpa = st.session_state.bnpa or 0
    cp = st.session_state.capitaux_propres or 0
    nb = st.session_state.nb_titres or 0
    nb_cur = nb
    cp_cur = cp
    vc_auto = round(cp_cur / nb_cur, 1) if nb_cur > 0 and cp_cur > 0 else None

    if p > 0 and bnpa > 0:
        per = p / bnpa
        st.markdown("---")
        c1, c2, c3, c4 = st.columns(4)
        with c1:
            st.metric("PER", f"{per:.1f}x")
        with c2:
            vmc = p * nb if nb > 0 else 0
            st.metric("Capitalisation (VMC)", f"{vmc/1e9:.1f} Mds FCFA" if vmc > 1e9 else f"{vmc/1e6:.0f} M FCFA")
        with c3:
            if cp > 0 and nb > 0:
                pbr = (p * nb) / cp
                st.metric("PBR", f"{pbr:.2f}x")
        with c4:
            rn_n = st.session_state.rn[4]
            if rn_n and cp > 0:
                roe = rn_n * 1e6 / cp * 100
                st.metric("ROE", f"{roe:.1f}%")

    # Additional auto metrics row
    if cp_cur > 0 and nb_cur > 0 and p > 0:
        st.markdown("---")
        st.markdown("**📐 Ratios complémentaires auto-calculés**")
        ar1, ar2, ar3 = st.columns(3)
        vmc = p * nb_cur
        ar1.metric("Capitalisation boursière", f"{vmc/1e9:.2f} Mds FCFA" if vmc >= 1e9 else f"{vmc/1e6:.1f} M FCFA")
        if bnpa > 0:
            ar2.metric("Décote/Surcote vs VC", f"{((p - vc_auto)/vc_auto*100):+.1f}%" if vc_auto else "—")
        rn_n_v = st.session_state.rn[4]
        if rn_n_v and p > 0 and nb_cur > 0:
            per_val = p / (rn_n_v * 1e6 / nb_cur)
            ar3.metric("PER auto", f"{per_val:.1f}x", delta="Sous-évalué" if per_val < 12 else ("Cher" if per_val > 20 else "Correct"))

    if st.session_state.ticker:
        save_analysis()


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 4 — DIVIDENDES
# ════════════════════════════════════════════════════════════════════════════
elif page == "4️⃣  Dividendes":
    st.title("4 — Dividendes")
    source_helper(4)
    st.info("Dividende **NET** reçu (après prélèvement 15% à la source)")
    cols = st.columns(5)
    for i, annee in enumerate(ANNEES):
        with cols[i]:
            v = st.number_input(f"Div. NET {annee} (FCFA)",
                                 key=f"div_{i}", step=1.0, format="%.2f",
                                 value=float(st.session_state.dividendes[i] or 0))
            st.session_state.dividendes[i] = v if v > 0 else None

    # Rendement calculé
    p = st.session_state.prix
    if p and p > 0:
        st.markdown("---")
        st.markdown("**Rendements dividende (Div / Prix actuel)**")
        cols2 = st.columns(5)
        for i, annee in enumerate(ANNEES):
            with cols2[i]:
                d = st.session_state.dividendes[i]
                if d:
                    rdt = d / p * 100
                    c = "green" if rdt >= 3 else ("orange" if rdt >= 1 else "red")
                    st.markdown(f"<span style='color:{c};font-weight:bold'>{rdt:.2f}%</span>", unsafe_allow_html=True)
                else:
                    st.markdown("—")

    # Tendance
    divs = st.session_state.dividendes
    valid_divs = [d for d in divs if d and d > 0]
    if len(valid_divs) >= 2:
        trend = (valid_divs[-1] - valid_divs[0]) / abs(valid_divs[0]) * 100
        if trend > 5:
            st.success(f"📈 Dividende croissant sur la période (+{trend:.1f}%)")
        elif trend > -5:
            st.warning(f"➡️ Dividende stable sur la période ({trend:+.1f}%)")
        else:
            st.error(f"📉 Dividende en baisse sur la période ({trend:.1f}%)")

    # ── Chart dividendes ─────────────────────────────────────────────────
    div_vals = [(ANNEES[i], divs[i]) for i in range(5) if divs[i]]
    if div_vals:
        st.markdown("---")
        st.markdown("### 📊 Évolution des dividendes")
        import pandas as pd

        df_div = pd.DataFrame(div_vals, columns=["Année", "Dividende NET (FCFA)"])

        # Calcul CAGR
        cagr_str = ""
        if len(valid_divs) >= 2 and valid_divs[0] > 0:
            n_years = len(valid_divs) - 1
            cagr = (valid_divs[-1] / valid_divs[0]) ** (1 / n_years) - 1
            cagr_str = f"  |  CAGR : {cagr*100:+.1f}%/an"

        fig_div = px.bar(
            df_div, x="Année", y="Dividende NET (FCFA)",
            title=f"Dividendes sur 5 ans (FCFA NET){cagr_str}",
            color="Dividende NET (FCFA)",
            color_continuous_scale=[[0, "#FEF3C7"], [1, ORANGE]])
        fig_div.update_traces(showlegend=False)
        fig_div.update_coloraxes(showscale=False)
        fig_div.update_layout(
            plot_bgcolor="white", paper_bgcolor="white",
            font=dict(color=NAVY), title_font_color=NAVY)

        if len(valid_divs) >= 2 and valid_divs[0] > 0:
            n_years = len(valid_divs) - 1
            cagr = (valid_divs[-1] / valid_divs[0]) ** (1 / n_years) - 1
            fig_div.add_annotation(
                x=div_vals[-1][0], y=div_vals[-1][1],
                text=f"CAGR {cagr*100:+.1f}%/an",
                showarrow=True, arrowhead=2,
                font=dict(color=GREEN, size=12, family="Arial Black"),
                bgcolor="white", bordercolor=GREEN)

        st.plotly_chart(fig_div, use_container_width=True)

    if st.session_state.ticker:
        save_analysis()


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 5 — BILAN & FCF
# ════════════════════════════════════════════════════════════════════════════
elif page == "5️⃣  Bilan & FCF":
    st.title("5 — Bilan & Free Cash Flow")
    source_helper(5)
    st.info("Source : Tableau des flux de trésorerie du rapport annuel")

    st.markdown("#### Analyse du Bilan")
    c1, c2 = st.columns(2)
    with c1:
        st.session_state.dette_lt = st.number_input("Dette long terme (FCFA)", step=1e6,
            value=float(st.session_state.dette_lt or 0))
        st.session_state.dette_ct = st.number_input("Dette court terme (FCFA)", step=1e6,
            value=float(st.session_state.dette_ct or 0))
        st.session_state.ebit = st.number_input("EBIT (M FCFA) — Résultat avant intérêts/impôts", step=1.0,
            value=float(st.session_state.ebit or 0))
        st.session_state.charges_fin = st.number_input("Charges financières nettes (FCFA)", step=1e5,
            value=float(st.session_state.charges_fin or 0))
    with c2:
        st.session_state.actifs_cour = st.number_input("Actifs courants (FCFA)", step=1e6,
            value=float(st.session_state.actifs_cour or 0))
        st.session_state.passifs_cour = st.number_input("Passifs courants (FCFA)", step=1e6,
            value=float(st.session_state.passifs_cour or 0))

    # ── Auto-calculated bilan metrics ─────────────────────────────────────────
    ac = st.session_state.actifs_cour or 0
    pc = st.session_state.passifs_cour or 0
    dlt = st.session_state.dette_lt or 0
    dct = st.session_state.dette_ct or 0
    ebit_v = st.session_state.ebit or 0
    cf_v = st.session_state.charges_fin or 0
    prix_v = st.session_state.prix or 0
    nb_v = st.session_state.nb_titres or 0

    if ac > 0 or dlt > 0:
        st.markdown("---")
        st.markdown("**🔒 Indicateurs calculés automatiquement**")
        bc1, bc2, bc3, bc4 = st.columns(4)

        bfr = ac - pc
        bc1.metric("BFR", f"{bfr/1e6:.1f} M FCFA", delta="Positif" if bfr > 0 else "Négatif")

        dette_nette = dlt + dct - ac
        bc2.metric("Dette nette", f"{dette_nette/1e6:.1f} M FCFA",
                   delta="⚠️ Endetté" if dette_nette > 0 else "✅ Trésorerie nette positive")

        if cf_v > 0 and ebit_v > 0:
            couv_int = ebit_v / (cf_v / 1e6)
            bc3.metric("Couverture intérêts", f"{couv_int:.1f}x",
                       delta="✅ Solide" if couv_int >= 3 else ("🟡 Limite" if couv_int >= 1.5 else "🔴 Risqué"))

        vmc_v = prix_v * nb_v if prix_v and nb_v else 0
        if vmc_v > 0 and (dlt + dct) > 0:
            leverage = (dlt + dct) / vmc_v
            bc4.metric("Levier (Dette/VMC)", f"{leverage:.2f}x",
                       delta="✅ Faible" if leverage < 0.3 else ("🟡 Modéré" if leverage < 0.6 else "🔴 Élevé"))

    st.markdown("#### Free Cash Flow (3 chiffres)")
    c3, c4, c5 = st.columns(3)
    with c3:
        st.session_state.amortissements = st.number_input("(+) Amortissements & dépréciations (FCFA)",
            step=1e6, value=float(st.session_state.amortissements or 0))
    with c4:
        st.session_state.capex = st.number_input("(-) CAPEX — Investissements nets (FCFA)",
            step=1e6, value=float(st.session_state.capex or 0))
    with c5:
        # Auto ΔBFR: if we have BFR computable, suggest it, but let user override
        bfr_cur = (st.session_state.actifs_cour or 0) - (st.session_state.passifs_cour or 0)
        override_bfr = st.checkbox("✏️ Saisir ΔBFR manuellement", key="override_bfr",
                                     value=st.session_state.get("override_bfr", False))
        if not override_bfr and bfr_cur != 0:
            # Use 5% of BFR as default ΔBFR (conservative estimate)
            var_bfr_auto = round(bfr_cur * 0.05)  # 5% variation by default
            st.metric("ΔBFR 🔒 Estimation auto (5% du BFR)", f"{var_bfr_auto/1e6:.1f} M FCFA")
            st.caption("Décochez pour saisir manuellement depuis le rapport annuel")
            st.session_state.var_bfr = var_bfr_auto
        else:
            st.session_state.var_bfr = st.number_input("Variation BFR (FCFA)",
                step=1e5, value=float(st.session_state.var_bfr or 0),
                help="Positif = augmentation BFR = consomme du cash. Source : tableau flux trésorerie.")

    # FCF calculé live
    rn_n = (st.session_state.rn[4] or 0) * 1e6
    amort = st.session_state.amortissements or 0
    capex = st.session_state.capex or 0
    var_bfr = st.session_state.var_bfr or 0
    fcf = rn_n + amort - capex - var_bfr

    if rn_n:
        st.markdown("---")
        ca, cb, cc = st.columns(3)
        with ca:
            st.metric("Free Cash Flow", f"{fcf/1e6:.1f} M FCFA",
                      delta="Positif ✓" if fcf > 0 else "Négatif ⚠️")
        with cb:
            vmc = (st.session_state.prix or 0) * (st.session_state.nb_titres or 0)
            if vmc > 0:
                fcf_yield = fcf / vmc * 100
                st.metric("FCF Yield", f"{fcf_yield:.1f}%")
        with cc:
            div_n = st.session_state.dividendes[4]
            nb = st.session_state.nb_titres or 0
            if div_n and nb > 0:
                divs_tot = div_n / 0.85 * nb
                if divs_tot > 0:
                    coverage = fcf / divs_tot
                    label = "✅ Soutenable" if coverage >= 1 else "⚠️ Risque"
                    st.metric("FCF Coverage", f"{coverage:.1f}x", delta=label)

        # ── Waterfall chart FCF ────────────────────────────────────────
        st.markdown("---")
        st.markdown("### 📊 Décomposition du FCF (Waterfall)")

        wf_labels = ["RN", "+ Amortissements", "- CAPEX", "- ΔBFR", "FCF"]
        wf_values = [rn_n/1e6, amort/1e6, -capex/1e6, -var_bfr/1e6, fcf/1e6]
        wf_measure = ["relative", "relative", "relative", "relative", "total"]
        wf_colors = [
            GREEN if rn_n >= 0 else "#DC2626",
            GREEN if amort >= 0 else "#DC2626",
            "#DC2626" if capex >= 0 else GREEN,
            "#DC2626" if var_bfr >= 0 else GREEN,
            GREEN if fcf >= 0 else "#DC2626",
        ]

        fig_wf = go.Figure(go.Waterfall(
            name="FCF",
            orientation="v",
            measure=wf_measure,
            x=wf_labels,
            y=wf_values,
            connector={"line": {"color": "rgb(63, 63, 63)"}},
            increasing={"marker": {"color": GREEN}},
            decreasing={"marker": {"color": "#DC2626"}},
            totals={"marker": {"color": NAVY}},
            text=[f"{v:+.1f}" for v in wf_values],
            textposition="outside",
        ))
        fig_wf.update_layout(
            title="Décomposition du Free Cash Flow (M FCFA)",
            plot_bgcolor="white", paper_bgcolor="white",
            font=dict(color=NAVY), title_font_color=NAVY,
            showlegend=False,
            yaxis_title="M FCFA",
        )
        st.plotly_chart(fig_wf, use_container_width=True)

    if st.session_state.ticker:
        save_analysis()


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 6 — TECHNIQUE & RISQUE
# ════════════════════════════════════════════════════════════════════════════
elif page == "6️⃣  Technique & Risque":
    st.title("6 — Analyse Technique & Gestion du Risque")

    # ── Live technical chart ─────────────────────────────────────────────────
    if st.session_state.ticker:
        st.markdown("### 📡 Graphique technique — Données BRVM en direct")
        with st.spinner(f"Chargement historique {st.session_state.ticker}..."):
            df_hist = fetch_history(st.session_state.ticker)

        if df_hist is not None and len(df_hist) >= 20:
            df_tech = compute_technicals(df_hist)
            b1_auto, b1_signals, b1_values = auto_b1_score(df_tech)

            # Chart 1: Price + MA20 + Bollinger
            fig_price = go.Figure()
            fig_price.add_trace(go.Scatter(
                x=df_tech["date"], y=df_tech["close"],
                name="Prix", line=dict(color=NAVY, width=2)))
            fig_price.add_trace(go.Scatter(
                x=df_tech["date"], y=df_tech["MA20"],
                name="MA20", line=dict(color=ORANGE, width=1.5, dash="dash")))
            fig_price.add_trace(go.Scatter(
                x=df_tech["date"], y=df_tech["BB_upper"],
                name="BB Upper", line=dict(color="#94A3B8", width=1, dash="dot"),
                showlegend=True))
            fig_price.add_trace(go.Scatter(
                x=df_tech["date"], y=df_tech["BB_lower"],
                name="BB Lower", line=dict(color="#94A3B8", width=1, dash="dot"),
                fill="tonexty", fillcolor="rgba(148,163,184,0.1)", showlegend=False))
            fig_price.update_layout(
                title=f"{st.session_state.ticker} — Prix & Indicateurs",
                plot_bgcolor="white", paper_bgcolor="white",
                font=dict(color=NAVY), legend=dict(orientation="h"),
                height=350, margin=dict(t=40, b=20))
            st.plotly_chart(fig_price, use_container_width=True)

            # Chart 2: RSI + MACD in two sub-columns
            ch_rsi, ch_macd = st.columns(2)
            with ch_rsi:
                fig_rsi = go.Figure()
                fig_rsi.add_trace(go.Scatter(
                    x=df_tech["date"], y=df_tech["RSI"],
                    name="RSI(14)", line=dict(color=ORANGE, width=2)))
                fig_rsi.add_hline(y=70, line_color="red", line_dash="dash",
                                   annotation_text="Surachat 70")
                fig_rsi.add_hline(y=30, line_color=GREEN, line_dash="dash",
                                   annotation_text="Survente 30")
                fig_rsi.update_layout(
                    title="RSI (14)", height=250, plot_bgcolor="white",
                    paper_bgcolor="white", font=dict(color=NAVY),
                    margin=dict(t=40, b=20), yaxis=dict(range=[0,100]))
                st.plotly_chart(fig_rsi, use_container_width=True)

            with ch_macd:
                fig_macd = go.Figure()
                fig_macd.add_trace(go.Scatter(
                    x=df_tech["date"], y=df_tech["MACD"],
                    name="MACD", line=dict(color=NAVY, width=2)))
                fig_macd.add_trace(go.Scatter(
                    x=df_tech["date"], y=df_tech["MACD_signal"],
                    name="Signal", line=dict(color=ORANGE, width=1.5, dash="dash")))
                fig_macd.add_trace(go.Bar(
                    x=df_tech["date"], y=df_tech["MACD_hist"],
                    name="Histogramme",
                    marker_color=[GREEN if v >= 0 else "#DC2626" for v in df_tech["MACD_hist"].fillna(0)]))
                fig_macd.update_layout(
                    title="MACD (12,26,9)", height=250, plot_bgcolor="white",
                    paper_bgcolor="white", font=dict(color=NAVY),
                    margin=dict(t=40, b=20))
                st.plotly_chart(fig_macd, use_container_width=True)

            # Auto-fill B1 score — store in separate keys to avoid widget conflict
            if b1_auto is not None:
                st.markdown("---")
                st.success(f"✅ Score B1 calculé automatiquement depuis les indicateurs : **{b1_auto:+d}/5**")
                # Store auto signals in _auto_ prefixed keys (NOT widget keys)
                signal_map = {"MM20": "tech_mm20", "Bollinger": "tech_boll",
                              "MACD": "tech_macd", "RSI": "tech_rsi", "Volume": "tech_vol"}
                for name, key in signal_map.items():
                    if name in b1_signals:
                        st.session_state[f"_auto_{key}"] = b1_signals[name]
                st.session_state["_auto_score_b1"] = b1_auto
                # Show signal table
                st.markdown("**Détail des signaux auto-calculés :**")
                for name, bull in b1_signals.items():
                    icon = "✅" if bull else "🔴"
                    val = b1_values.get(name, "")
                    st.markdown(f"{icon} **{name}** — {val} — {'Haussier' if bull else 'Baissier'}")
        else:
            st.info(f"Historique non disponible pour {st.session_state.ticker}. Utilisez les cases à cocher ci-dessous.")
        st.markdown("---")

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### Score technique B1 — 5 critères (-5 à +5)")
        st.caption("Cochez si le signal est HAUSSIER, décochez si BAISSIER")

        # If auto signals computed from live data, use them as checkbox defaults
        _auto_available = st.session_state.get("_auto_score_b1") is not None
        if _auto_available:
            st.caption("✅ Cases pré-remplies depuis les indicateurs techniques en direct — modifiables")

        tech_criteria = [
            ("mm20", "📈 MM20 — Prix au-dessus de la moyenne mobile 20 jours"),
            ("boll",  "📊 Bandes de Bollinger — Prix dans la moitié haute"),
            ("macd",  "🔀 MACD — Signal haussier (MACD > Signal)"),
            ("rsi",   "💹 RSI — Zone neutre/haussière (30–70, tendance montante)"),
            ("vol",   "📦 Volume — Volumes en hausse sur les jours de hausse"),
        ]
        tc1, tc2 = st.columns(2)
        score_b1_manual = 0
        for j, (key, label) in enumerate(tech_criteria):
            col = tc1 if j < 3 else tc2
            # Default: auto signal if available, else stored manual value
            default = st.session_state.get(f"_auto_{f'tech_{key}'}", st.session_state.get(f"tech_{key}", False))
            val = col.checkbox(label, key=f"tech_{key}", value=bool(default))
            score_b1_manual += 1 if val else -1

        # Final score: manual (checkboxes always win — they reflect user's last state)
        score_b1_auto = score_b1_manual
        st.session_state.score_b1 = score_b1_auto
        color_b1 = GREEN if score_b1_auto >= 3 else (ORANGE if score_b1_auto >= 0 else "#DC2626")
        st.markdown(f"**Score B1 calculé : <span style='color:{color_b1};font-size:1.3em'>{score_b1_auto:+d}/5</span>**",
                    unsafe_allow_html=True)
        if score_b1_auto >= 3:
            st.success("✅ Signal technique fort")
        elif score_b1_auto >= 0:
            st.info("🟡 Signal neutre")
        else:
            st.warning("🔴 Signal technique faible")

        st.markdown("#### Psychologie du marché")
        st.session_state.prix_avant = st.number_input("Prix avant résultats J-1 (FCFA)",
            step=10.0, value=float(st.session_state.prix_avant or 0))
        st.session_state.prix_apres = st.number_input("Prix après résultats J+5 (FCFA)",
            step=10.0, value=float(st.session_state.prix_apres or 0))
        if st.session_state.prix_avant and st.session_state.prix_apres and st.session_state.prix_avant > 0:
            reaction = (st.session_state.prix_apres - st.session_state.prix_avant) / st.session_state.prix_avant * 100
            if reaction >= 5:
                st.success(f"📈 Accueil très favorable (+{reaction:.1f}%)")
            elif reaction >= 0:
                st.info(f"➡️ Accueil positif (+{reaction:.1f}%)")
            elif reaction >= -5:
                st.warning(f"📉 Réaction mitigée ({reaction:.1f}%)")
            else:
                st.error(f"🔴 Punition marché ({reaction:.1f}%)")
    with c2:
        st.markdown("#### Stop-Loss & Take Profit")
        prix_ref = st.session_state.prix or 0
        # Prix achat defaults to prix actuel
        pa_default = float(st.session_state.prix_achat or prix_ref or 0)
        st.session_state.prix_achat = st.number_input("Prix d'achat envisagé (FCFA)",
            step=10.0, value=pa_default)

        pa = st.session_state.prix_achat or 0

        # Auto stop-loss = -15%
        sl_auto = round(pa * 0.85 / 10) * 10 if pa > 0 else 0
        override_sl = st.checkbox("✏️ Modifier Stop-Loss", key="override_sl",
                                   value=st.session_state.get("override_sl", False))
        if pa > 0 and not override_sl:
            st.session_state.stop_loss = sl_auto
            st.metric("Stop-Loss 🔒 Auto (-15%)", f"{sl_auto:,.0f} FCFA")
            st.caption(f"= Prix achat × 0.85 — Perte max : {(sl_auto - pa):+,.0f} FCFA")
        else:
            st.session_state.stop_loss = st.number_input("Stop-Loss (FCFA)", step=10.0,
                value=float(st.session_state.stop_loss or sl_auto or 0))

        # Auto take-profit = +30% (for ~2x RR with -15% stop)
        tp_auto = round(pa * 1.30 / 10) * 10 if pa > 0 else 0
        override_tp = st.checkbox("✏️ Modifier Take-Profit", key="override_tp",
                                   value=st.session_state.get("override_tp", False))
        if pa > 0 and not override_tp:
            st.session_state.take_profit = tp_auto
            st.metric("Take-Profit 🔒 Auto (+30%)", f"{tp_auto:,.0f} FCFA")
            st.caption(f"= Prix achat × 1.30 — Gain potentiel : {(tp_auto - pa):+,.0f} FCFA → Risk/Reward ≈ 2x")
        else:
            st.session_state.take_profit = st.number_input("Take Profit (FCFA)", step=10.0,
                value=float(st.session_state.take_profit or tp_auto or 0))

        pa = st.session_state.prix_achat or 0
        sl = st.session_state.stop_loss or 0
        tp = st.session_state.take_profit or 0
        if pa > 0 and sl > 0 and tp > 0:
            gain = tp - pa
            perte = pa - sl
            rr = gain / perte if perte > 0 else 0
            color = "green" if rr >= 2 else ("orange" if rr >= 1 else "red")
            st.markdown(f"**Risk/Reward : <span style='color:{color}'>{rr:.1f}x</span>**",
                        unsafe_allow_html=True)
            if rr >= 2:
                st.success("✅ Bon ratio Risk/Reward (≥ 2x)")
            elif rr >= 1:
                st.warning("🟡 Ratio acceptable (1-2x)")
            else:
                st.error("🔴 Risque trop élevé (< 1x)")

    if st.session_state.ticker:
        save_analysis()


# ════════════════════════════════════════════════════════════════════════════
#  PAGE — SCORECARD /45
# ════════════════════════════════════════════════════════════════════════════
elif page == "📊 Scorecard /45":
    st.title("📊 Scorecard /45 — Analyse complète")

    if not st.session_state.nom:
        st.warning("Commencez par remplir l'étape 1 (Identité société)")
        st.stop()

    st.subheader(f"{st.session_state.nom} ({st.session_state.ticker}) — {st.session_state.secteur}")

    scores_fond, scores_tech, total_fond, total_tech, total, verdict, extras = compute_scores()

    # ── Tableau Fondamental ───────────────────────────────────────────────
    col_table, col_summary = st.columns([3, 2])

    with col_table:
        st.markdown("### 🏛️ Fondamental /30")
        for crit, (val, score) in scores_fond.items():
            stars = "⭐" * score + "☆" * (3 - score)
            color = GREEN if score == 3 else (ORANGE if score >= 1 else "#DC2626")
            st.markdown(
                f"<div class='metric-card'>"
                f"<b>{crit}</b> &nbsp; <code>{val}</code> &nbsp; "
                f"<span style='color:{color}'>{stars} {score}/3</span>"
                f"</div>",
                unsafe_allow_html=True)

        st.markdown("### ⚡ Technique /15")
        for crit, (val, score) in scores_tech.items():
            stars = "⭐" * score + "☆" * (3 - score)
            color = GREEN if score == 3 else (ORANGE if score >= 1 else "#DC2626")
            st.markdown(
                f"<div class='metric-card'>"
                f"<b>{crit}</b> &nbsp; <code>{val}</code> &nbsp; "
                f"<span style='color:{color}'>{stars} {score}/3</span>"
                f"</div>",
                unsafe_allow_html=True)

    with col_summary:
        # Score boxes
        pct_f = total_fond / 30
        pct_t = total_tech / 15
        color_f = GREEN if pct_f >= 0.7 else (ORANGE if pct_f >= 0.5 else "#DC2626")
        color_t = GREEN if pct_t >= 0.7 else (ORANGE if pct_t >= 0.5 else "#DC2626")
        color_tot = verdict[2]

        st.markdown(f"""
        <div style='display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem;'>
            <div style='flex:1; text-align:center; background:{NAVY}; border-radius:12px;
                        padding:1.2rem; color:white; min-width:100px;'>
                <div style='font-size:2.5rem; font-weight:bold; color:{color_f}'>{total_fond}</div>
                <div style='font-size:0.9rem; margin-top:0.3rem'>Fondamental<br>/30</div>
            </div>
            <div style='flex:1; text-align:center; background:{NAVY}; border-radius:12px;
                        padding:1.2rem; color:white; min-width:100px;'>
                <div style='font-size:2.5rem; font-weight:bold; color:{color_t}'>{total_tech}</div>
                <div style='font-size:0.9rem; margin-top:0.3rem'>Technique<br>/15</div>
            </div>
            <div style='flex:1; text-align:center; background:{NAVY}; border-radius:12px;
                        padding:1.2rem; color:white; min-width:100px;'>
                <div style='font-size:2.5rem; font-weight:bold; color:{color_tot}'>{total}</div>
                <div style='font-size:0.9rem; margin-top:0.3rem'>TOTAL<br>/45</div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        # Verdict badge
        v_label, v_emoji, v_color, v_bg = verdict
        st.markdown(f"""
        <div style='background:{v_bg}; border:3px solid {v_color}; border-radius:16px;
                    padding:1.5rem; text-align:center; margin-bottom:1.5rem;'>
            <div style='font-size:2rem'>{v_emoji}</div>
            <div style='font-size:1.8rem; font-weight:bold; color:{v_color}'>{v_label}</div>
            <div style='color:#6B7280; font-size:0.85rem; margin-top:0.3rem'>Score total : {total}/45</div>
        </div>
        """, unsafe_allow_html=True)

        # Barre de progression
        st.progress(total / 45, text=f"Score global : {total}/45 ({total/45*100:.0f}%)")
        st.markdown("**Grille de lecture :**")
        st.markdown("🟢 ≥33 ACHETER | 🟡 ≥27 SURVEILLER | 🟠 ≥18 CONSERVER | 🔴 <18 ÉVITER")

    # ── Radar chart ───────────────────────────────────────────────────────
    st.markdown("---")
    st.markdown("### 🕸️ Radar chart — Score Fondamental /30")

    fond_labels = list(scores_fond.keys())
    fond_scores = [s for _, s in scores_fond.values()]
    fond_max = [3] * len(fond_labels)

    # Radar chart
    fig_radar = go.Figure()
    fig_radar.add_trace(go.Scatterpolar(
        r=fond_scores + [fond_scores[0]],
        theta=fond_labels + [fond_labels[0]],
        fill="toself",
        fillcolor=f"rgba(13,27,42,0.2)",
        line=dict(color=NAVY, width=2),
        name="Score obtenu",
        marker=dict(color=NAVY, size=8),
    ))
    fig_radar.add_trace(go.Scatterpolar(
        r=fond_max + [fond_max[0]],
        theta=fond_labels + [fond_labels[0]],
        fill="toself",
        fillcolor=f"rgba(215,119,6,0.05)",
        line=dict(color=ORANGE, width=1, dash="dot"),
        name="Maximum (3)",
        marker=dict(color=ORANGE, size=4),
    ))
    fig_radar.update_layout(
        polar=dict(
            radialaxis=dict(visible=True, range=[0, 3], tickvals=[0, 1, 2, 3]),
            angularaxis=dict(direction="clockwise"),
        ),
        showlegend=True,
        title=f"Scorecard fondamental — {total_fond}/30",
        paper_bgcolor="white",
        font=dict(color=NAVY),
        title_font_color=NAVY,
    )
    st.plotly_chart(fig_radar, use_container_width=True)

    # ── Gauge total ───────────────────────────────────────────────────────
    st.markdown("### 🎯 Jauge globale /45")
    fig_gauge = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=total,
        delta={"reference": 27, "increasing": {"color": GREEN}},
        title={"text": f"Score total /45 — {v_label}", "font": {"color": NAVY}},
        gauge={
            "axis": {"range": [0, 45], "tickcolor": NAVY},
            "bar": {"color": v_color},
            "steps": [
                {"range": [0, 18], "color": "#FEE2E2"},
                {"range": [18, 27], "color": "#FEF9C3"},
                {"range": [27, 33], "color": "#FEF3C7"},
                {"range": [33, 45], "color": "#DCFCE7"},
            ],
            "threshold": {
                "line": {"color": NAVY, "width": 4},
                "thickness": 0.75,
                "value": 33,
            },
        },
        number={"suffix": "/45", "font": {"color": NAVY}},
    ))
    fig_gauge.update_layout(paper_bgcolor="white", font=dict(color=NAVY))
    st.plotly_chart(fig_gauge, use_container_width=True)

    if st.session_state.ticker:
        save_analysis()


# ════════════════════════════════════════════════════════════════════════════
#  PAGE — PORTEFEUILLE
# ════════════════════════════════════════════════════════════════════════════
elif page == "💼 Portefeuille":
    st.title("💼 Portefeuille — Suivi de positions")
    st.info("Saisissez vos positions. Les calculs se font automatiquement. "
            "Ces données alimenteront la feuille **PORTEFEUILLE** du fichier Excel généré.")

    NB = 25
    FRAIS = 0.014  # 1,4% frais BRVM

    if "portef" not in st.session_state:
        st.session_state.portef = [
            {"ticker": "", "secteur": "", "nb": None, "px_achat": None,
             "px_actuel": None, "div": None, "note": None}
            for _ in range(NB)
        ]

    positions = st.session_state.portef

    # En-têtes
    hcols = st.columns([2, 2, 1, 1.2, 1.2, 1, 1, 1.5, 1.5, 1.8, 1.8])
    for h, c in zip(["Ticker", "Secteur", "Nb titres", "Px achat", "Px actuel",
                      "Div/titre", "Note /45", "Val. achat", "Val. actuelle",
                      "P&L total", "P&L %"], hcols):
        c.markdown(f"**{h}**")
    st.markdown("---")

    tot_achat = tot_actuel = tot_pl = 0.0
    pl_data = []
    secteur_data = {}

    for i, pos in enumerate(positions):
        cols = st.columns([2, 2, 1, 1.2, 1.2, 1, 1, 1.5, 1.5, 1.8, 1.8])
        pos["ticker"]    = cols[0].text_input("", value=pos["ticker"], key=f"pt_{i}",
                                               placeholder="SAPH", label_visibility="collapsed")
        pos["secteur"]   = cols[1].selectbox("", [""] + SECTEURS,
                                              index=([""] + SECTEURS).index(pos["secteur"])
                                              if pos["secteur"] in SECTEURS else 0,
                                              key=f"ps_{i}", label_visibility="collapsed")
        pos["nb"]        = cols[2].number_input("", min_value=0, value=int(pos["nb"] or 0),
                                                 step=1, key=f"pn_{i}", label_visibility="collapsed")
        pos["px_achat"]  = cols[3].number_input("", min_value=0.0, value=float(pos["px_achat"] or 0.0),
                                                  step=10.0, key=f"pa_{i}", label_visibility="collapsed")
        pos["px_actuel"] = cols[4].number_input("", min_value=0.0, value=float(pos["px_actuel"] or 0.0),
                                                  step=10.0, key=f"pac_{i}", label_visibility="collapsed")
        pos["div"]       = cols[5].number_input("", min_value=0.0, value=float(pos["div"] or 0.0),
                                                  step=1.0, key=f"pd_{i}", label_visibility="collapsed")
        pos["note"]      = cols[6].number_input("", min_value=0, max_value=45,
                                                  value=int(pos["note"] or 0),
                                                  step=1, key=f"pno_{i}", label_visibility="collapsed")

        if pos["ticker"] and pos["nb"] and pos["px_achat"]:
            val_achat  = pos["nb"] * pos["px_achat"] * (1 + FRAIS)
            val_actuel = pos["nb"] * (pos["px_actuel"] or 0)
            div_total  = pos["nb"] * (pos["div"] or 0)
            pl         = val_actuel - val_achat + div_total
            pl_pct     = pl / val_achat * 100 if val_achat else 0

            cols[7].markdown(f"`{val_achat:,.0f}`")
            cols[8].markdown(f"`{val_actuel:,.0f}`")
            color = "green" if pl >= 0 else "red"
            cols[9].markdown(f":{color}[`{pl:+,.0f}`]")
            cols[10].markdown(f":{color}[`{pl_pct:+.1f}%`]")

            tot_achat  += val_achat
            tot_actuel += val_actuel
            tot_pl     += pl

            pl_data.append({"Ticker": pos["ticker"], "P&L (FCFA)": pl, "P&L %": pl_pct})

            # Allocation sectorielle
            sect = pos["secteur"] or "Autre"
            secteur_data[sect] = secteur_data.get(sect, 0) + val_actuel
        else:
            for c in cols[7:]:
                c.markdown("—")

    st.markdown("---")

    # Totaux
    if tot_achat > 0:
        pl_tot_pct = tot_pl / tot_achat * 100
        col_t = st.columns([2, 2, 4, 1.5, 1.5, 1.8, 1.8])
        col_t[0].markdown("**TOTAL**")
        col_t[3].markdown(f"**`{tot_achat:,.0f}`**")
        col_t[4].markdown(f"**`{tot_actuel:,.0f}`**")
        color_t = "green" if tot_pl >= 0 else "red"
        col_t[5].markdown(f":{color_t}[**`{tot_pl:+,.0f}`**]")
        col_t[6].markdown(f":{color_t}[**`{pl_tot_pct:+.1f}%`**]")

        st.markdown("---")
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Valeur investie", f"{tot_achat:,.0f} FCFA")
        m2.metric("Valeur actuelle", f"{tot_actuel:,.0f} FCFA",
                  delta=f"{tot_actuel - tot_achat:+,.0f}")
        m3.metric("P&L total", f"{tot_pl:+,.0f} FCFA")
        m4.metric("Rendement", f"{pl_tot_pct:+.2f}%")

        # ── Charts ────────────────────────────────────────────────────────
        st.markdown("---")
        st.markdown("### 📊 Visualisations portefeuille")
        ch1, ch2 = st.columns(2)

        # Pie chart allocation sectorielle
        with ch1:
            if secteur_data:
                import pandas as pd
                df_sect = pd.DataFrame(list(secteur_data.items()), columns=["Secteur", "Valeur"])
                fig_pie = px.pie(
                    df_sect, names="Secteur", values="Valeur",
                    title="Allocation sectorielle (valeur actuelle)",
                    color_discrete_sequence=px.colors.qualitative.Set2)
                fig_pie.update_traces(textposition="inside", textinfo="percent+label")
                fig_pie.update_layout(
                    paper_bgcolor="white", font=dict(color=NAVY),
                    title_font_color=NAVY, showlegend=True)
                st.plotly_chart(fig_pie, use_container_width=True)

        # Horizontal bar chart P&L par position
        with ch2:
            if pl_data:
                import pandas as pd
                df_pl = pd.DataFrame(pl_data).sort_values("P&L %", ascending=True)
                colors = [GREEN if v >= 0 else "#DC2626" for v in df_pl["P&L %"]]
                fig_pl = go.Figure(go.Bar(
                    y=df_pl["Ticker"],
                    x=df_pl["P&L %"],
                    orientation="h",
                    marker_color=colors,
                    text=[f"{v:+.1f}%" for v in df_pl["P&L %"]],
                    textposition="outside",
                ))
                fig_pl.add_vline(x=0, line_color=NAVY, line_width=2)
                fig_pl.update_layout(
                    title="P&L par position (%)",
                    plot_bgcolor="white", paper_bgcolor="white",
                    font=dict(color=NAVY), title_font_color=NAVY,
                    xaxis_title="P&L %",
                    yaxis_title="",
                    showlegend=False,
                )
                st.plotly_chart(fig_pl, use_container_width=True)

    else:
        st.warning("Saisissez au moins une position (Ticker + Nb titres + Prix achat).")


# ════════════════════════════════════════════════════════════════════════════
#  PAGE — RAPPORT
# ════════════════════════════════════════════════════════════════════════════
elif page == "📄 Rapport":
    st.title("📄 Rapport d'analyse — Aperçu navigateur")

    if not st.session_state.nom:
        st.warning("Commencez par remplir l'étape 1 (Identité société)")
        st.stop()

    scores_fond, scores_tech, total_fond, total_tech, total, verdict, extras = compute_scores()
    v_label, v_emoji, v_color, v_bg = verdict

    ss = st.session_state
    p = ss.prix or 0
    bnpa = ss.bnpa or 0
    cp = ss.capitaux_propres or 0
    nb = ss.nb_titres or 0
    divs = ss.dividendes or [None]*5

    per_str = f"{p/bnpa:.1f}x" if p > 0 and bnpa > 0 else "N/A"
    pbr_str = f"{p*nb/cp:.2f}x" if p > 0 and nb > 0 and cp > 0 else "N/A"
    roe_str = f"{(ss.rn or [None]*5)[4]*1e6/cp*100:.1f}%" if (ss.rn or [None]*5)[4] and cp > 0 else "N/A"
    rdt_str = f"{divs[4]/p*100:.2f}%" if divs[4] and p > 0 else "N/A"
    fcf_yield_str = f"{extras['fcf_yield']:.1f}%" if extras.get("fcf_yield") is not None else "N/A"
    prime_str = f"{extras['prime']:+.1f}%" if extras.get("prime") is not None else "N/A"
    fcf_m = extras["fcf"] / 1e6 if extras.get("fcf") else 0

    # Recommandation contrarian
    contrarian_html = ""
    if total < 27 and divs[4] and p > 0:
        rdt_div = divs[4] / p * 100
        if rdt_div >= 5:
            contrarian_html = f"""
            <div style='background:#EFF6FF; border:2px solid #3B82F6; border-radius:10px;
                        padding:1rem 1.5rem; margin:1rem 0;'>
                <b style='color:#1D4ED8;'>💡 Signal Contrarian détecté</b><br>
                Score global faible ({total}/45) mais rendement dividende élevé ({rdt_str}).
                Opportunité d'accumulation à considérer si les fondamentaux s'améliorent.
            </div>
            """

    logo_html = ""
    logo_path = ANALYZER_DIR / "logo.png"
    if logo_path.exists():
        import base64
        with open(logo_path, "rb") as f_logo:
            logo_b64 = base64.b64encode(f_logo.read()).decode()
        logo_html = f"<img src='data:image/png;base64,{logo_b64}' style='height:60px; margin-right:1.5rem;'/>"

    # Score bars
    def score_bar(score, max_score, color):
        pct = int(score / max_score * 100)
        return f"""<div style='background:#E5E7EB; border-radius:4px; height:12px; margin-top:4px;'>
                   <div style='background:{color}; width:{pct}%; height:100%; border-radius:4px;'></div></div>"""

    fund_bar = score_bar(total_fond, 30, GREEN if total_fond/30 >= 0.7 else (ORANGE if total_fond/30 >= 0.5 else "#DC2626"))
    tech_bar = score_bar(total_tech, 15, GREEN if total_tech/15 >= 0.7 else (ORANGE if total_tech/15 >= 0.5 else "#DC2626"))
    tot_bar = score_bar(total, 45, v_color)

    # Tableau des critères fondamentaux
    crit_rows = ""
    for crit, (val, score) in scores_fond.items():
        stars = "⭐" * score + "☆" * (3 - score)
        c = GREEN if score == 3 else (ORANGE if score >= 1 else "#DC2626")
        crit_rows += f"""
        <tr>
            <td style='padding:6px 12px; border-bottom:1px solid #E5E7EB;'>{crit}</td>
            <td style='padding:6px 12px; border-bottom:1px solid #E5E7EB; font-family:monospace;'>{val}</td>
            <td style='padding:6px 12px; border-bottom:1px solid #E5E7EB; color:{c}; font-weight:bold;'>{stars} {score}/3</td>
        </tr>"""
    for crit, (val, score) in scores_tech.items():
        stars = "⭐" * score + "☆" * (3 - score)
        c = GREEN if score == 3 else (ORANGE if score >= 1 else "#DC2626")
        crit_rows += f"""
        <tr style='background:#F9FAFB;'>
            <td style='padding:6px 12px; border-bottom:1px solid #E5E7EB;'>{crit}</td>
            <td style='padding:6px 12px; border-bottom:1px solid #E5E7EB; font-family:monospace;'>{val}</td>
            <td style='padding:6px 12px; border-bottom:1px solid #E5E7EB; color:{c}; font-weight:bold;'>{stars} {score}/3</td>
        </tr>"""

    report_html = f"""
    <div style='font-family: Arial, sans-serif; max-width: 860px; margin: auto;
                color: #1F2937; line-height: 1.6;'>

        <!-- Header -->
        <div style='background:{NAVY}; color:white; padding:1.5rem 2rem;
                    border-radius:10px; margin-bottom:1.5rem;
                    display:flex; align-items:center;'>
            {logo_html}
            <div>
                <h1 style='color:white; margin:0; font-size:1.8rem;'>
                    {ss.nom}
                </h1>
                <div style='color:#94A3B8; margin-top:4px;'>
                    Ticker : <b style='color:{ORANGE}'>{ss.ticker}</b> &nbsp;|&nbsp;
                    Secteur : {ss.secteur} &nbsp;|&nbsp;
                    Date : {ss.date_analyse}
                </div>
            </div>
        </div>

        <!-- Métriques clés -->
        <div style='background:#F8FAFC; border-radius:8px; padding:1rem 1.5rem;
                    border:1px solid #E2E8F0; margin-bottom:1rem;'>
            <h3 style='color:{NAVY}; margin-top:0;'>Métriques clés</h3>
            <table style='width:100%; border-collapse:collapse;'>
            <tr>
                <td style='padding:8px 16px; text-align:center; background:white;
                           border-radius:8px; margin:4px;'>
                    <div style='font-size:1.6rem; font-weight:bold; color:{NAVY}'>{per_str}</div>
                    <div style='color:#6B7280; font-size:0.85rem;'>PER</div>
                </td>
                <td style='padding:8px 16px; text-align:center; background:white;
                           border-radius:8px; margin:4px;'>
                    <div style='font-size:1.6rem; font-weight:bold; color:{NAVY}'>{pbr_str}</div>
                    <div style='color:#6B7280; font-size:0.85rem;'>PBR</div>
                </td>
                <td style='padding:8px 16px; text-align:center; background:white;
                           border-radius:8px; margin:4px;'>
                    <div style='font-size:1.6rem; font-weight:bold; color:{NAVY}'>{roe_str}</div>
                    <div style='color:#6B7280; font-size:0.85rem;'>ROE</div>
                </td>
                <td style='padding:8px 16px; text-align:center; background:white;
                           border-radius:8px; margin:4px;'>
                    <div style='font-size:1.6rem; font-weight:bold; color:{NAVY}'>{rdt_str}</div>
                    <div style='color:#6B7280; font-size:0.85rem;'>Rdt Dividende</div>
                </td>
                <td style='padding:8px 16px; text-align:center; background:white;
                           border-radius:8px; margin:4px;'>
                    <div style='font-size:1.6rem; font-weight:bold; color:{NAVY}'>{fcf_yield_str}</div>
                    <div style='color:#6B7280; font-size:0.85rem;'>FCF Yield</div>
                </td>
            </tr>
            </table>
        </div>

        <!-- Score -->
        <div style='background:#F8FAFC; border-radius:8px; padding:1rem 1.5rem;
                    border:1px solid #E2E8F0; margin-bottom:1rem;'>
            <h3 style='color:{NAVY}; margin-top:0;'>Scorecard</h3>
            <div style='display:flex; gap:2rem; align-items:center; flex-wrap:wrap;'>
                <div style='flex:1; min-width:120px;'>
                    <div style='color:#6B7280; font-size:0.85rem;'>Fondamental</div>
                    <div style='font-size:1.5rem; font-weight:bold; color:{NAVY}'>{total_fond}/30</div>
                    {fund_bar}
                </div>
                <div style='flex:1; min-width:120px;'>
                    <div style='color:#6B7280; font-size:0.85rem;'>Technique</div>
                    <div style='font-size:1.5rem; font-weight:bold; color:{NAVY}'>{total_tech}/15</div>
                    {tech_bar}
                </div>
                <div style='flex:2; min-width:160px;'>
                    <div style='color:#6B7280; font-size:0.85rem;'>TOTAL</div>
                    <div style='font-size:2rem; font-weight:bold; color:{v_color}'>{total}/45</div>
                    {tot_bar}
                </div>
                <div style='background:{v_bg}; border:2px solid {v_color}; border-radius:10px;
                            padding:0.8rem 1.5rem; text-align:center; min-width:130px;'>
                    <div style='font-size:1.5rem;'>{v_emoji}</div>
                    <div style='font-size:1.3rem; font-weight:bold; color:{v_color}'>{v_label}</div>
                </div>
            </div>
        </div>

        <!-- Analyse FCF & Prime de risque -->
        <div style='background:#F8FAFC; border-radius:8px; padding:1rem 1.5rem;
                    border:1px solid #E2E8F0; margin-bottom:1rem;'>
            <h3 style='color:{NAVY}; margin-top:0;'>Analyse FCF & Prime de risque</h3>
            <p>
                <b>Free Cash Flow :</b> {fcf_m:.1f} M FCFA &nbsp;|&nbsp;
                <b>FCF Yield :</b> {fcf_yield_str} &nbsp;|&nbsp;
                <b>Prime de risque vs OAT :</b> {prime_str}
            </p>
        </div>

        {contrarian_html}

        <!-- Tableau des critères -->
        <div style='background:#F8FAFC; border-radius:8px; padding:1rem 1.5rem;
                    border:1px solid #E2E8F0; margin-bottom:1rem;'>
            <h3 style='color:{NAVY}; margin-top:0;'>Détail des critères</h3>
            <table style='width:100%; border-collapse:collapse; font-size:0.92rem;'>
                <thead>
                    <tr style='background:{NAVY}; color:white;'>
                        <th style='padding:8px 12px; text-align:left;'>Critère</th>
                        <th style='padding:8px 12px; text-align:left;'>Valeur</th>
                        <th style='padding:8px 12px; text-align:left;'>Score</th>
                    </tr>
                </thead>
                <tbody>
                    {crit_rows}
                </tbody>
            </table>
        </div>

        <!-- Signature -->
        <div style='border-top:2px solid {ORANGE}; padding-top:1rem; margin-top:1.5rem;
                    color:#6B7280; font-size:0.82rem; text-align:center;'>
            Analyse réalisée avec <b style='color:{NAVY}'>BRVM Analyzer</b> —
            {ss.date_analyse} &nbsp;|&nbsp;
            Les informations contenues dans ce rapport sont fournies à titre indicatif uniquement.
            Elles ne constituent pas un conseil en investissement.
        </div>
    </div>
    """

    import streamlit.components.v1 as components
    # Wrap in full HTML document so styles apply correctly
    full_html = f"""<!DOCTYPE html>
<html><head><meta charset='utf-8'>
<style>
  body {{ font-family: Arial, sans-serif; margin: 0; padding: 16px;
         background: white; color: #1F2937; line-height: 1.6; }}
  * {{ box-sizing: border-box; }}
</style>
</head><body>{report_html}</body></html>"""
    components.html(full_html, height=1800, scrolling=True)

    st.markdown("---")
    st.info("💡 **Imprimer le rapport** : Utilisez Ctrl+P (ou Cmd+P sur Mac) dans votre navigateur. "
            "Sélectionnez 'Enregistrer en PDF' pour un export propre.")

    if st.session_state.ticker:
        save_analysis()


# ════════════════════════════════════════════════════════════════════════════
#  PAGE — GENERER EXCEL
# ════════════════════════════════════════════════════════════════════════════
elif page == "📥 Générer Excel":
    st.title("📥 Générer le fichier Excel")

    if not st.session_state.nom:
        st.error("Remplissez au minimum l'étape 1 (nom + ticker + secteur) avant de générer.")
        st.stop()

    st.info(f"**Société :** {st.session_state.nom} ({st.session_state.ticker})")

    # Résumé des données saisies
    with st.expander("📋 Récapitulatif des données", expanded=False):
        st.json({
            "Identité": {"Nom": st.session_state.nom, "Ticker": st.session_state.ticker,
                         "Secteur": st.session_state.secteur, "Date": st.session_state.date_analyse},
            "CA (M FCFA)": dict(zip(ANNEES, st.session_state.ca)),
            "RN (M FCFA)": dict(zip(ANNEES, st.session_state.rn)),
            "Prix": st.session_state.prix, "BNPA": st.session_state.bnpa,
            "FCF": {"Amort": st.session_state.amortissements,
                    "CAPEX": st.session_state.capex, "ΔBFR": st.session_state.var_bfr},
        })

    if st.button("🚀 Générer le fichier Excel complet", use_container_width=True):
        with st.spinner("Génération en cours..."):
            try:
                tmpdir = tempfile.mkdtemp()
                out_path = os.path.join(tmpdir, "etudes_actions_v2.xlsx")
                logo_src = ANALYZER_DIR / "logo.png"
                logo_dst = os.path.join(tmpdir, "logo.png")
                if logo_src.exists():
                    shutil.copy(str(logo_src), logo_dst)

                import importlib.util
                spec = importlib.util.spec_from_file_location(
                    "build_excel", str(ANALYZER_DIR / "build_excel.py"))
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)

                original_out = mod.OUT
                mod.OUT = out_path
                mod.LOGO_PATH = logo_dst
                mod.make_wb()

                with open(out_path, "rb") as f:
                    excel_bytes = f.read()

                ticker = st.session_state.ticker or "BRVM"
                filename = f"Analyse_{ticker}_{date.today().strftime('%Y%m%d')}.xlsx"

                st.success("✅ Fichier Excel généré avec succès !")
                st.download_button(
                    label="⬇️ Télécharger le fichier Excel",
                    data=excel_bytes,
                    file_name=filename,
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True)

                shutil.rmtree(tmpdir, ignore_errors=True)

                st.info("""
                **Prochaines étapes dans Excel :**
                1. Ouvrez l'onglet **GUIDE** → vérifiez le statut de chaque étape
                2. Les cellules **oranges** sont les seules à modifier
                3. Remplissez les données manquantes directement dans ETUDE / PROFIL
                4. La fiche **RAPPORT** se met à jour automatiquement
                """)
            except Exception as e:
                st.error(f"Erreur lors de la génération : {e}")
                st.exception(e)
