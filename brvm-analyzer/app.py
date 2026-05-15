"""
BRVM Analyzer — Application web Streamlit
Lance avec : streamlit run app.py
"""
import streamlit as st
import json, os, sys, io, tempfile, shutil
from datetime import date
from pathlib import Path

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
</style>
""", unsafe_allow_html=True)

# ── Chemin du générateur Excel ────────────────────────────────────────────────
ANALYZER_DIR = Path(__file__).parent
sys.path.insert(0, str(ANALYZER_DIR))


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
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

init_state()

ANNEES = ["N-4", "N-3", "N-2", "N-1", "N"]
SECTEURS = ["Banque", "Assurance", "Industrie", "Agroalimentaire",
            "Telecom", "Distribution", "Energie", "Immobilier", "Autre"]


# ════════════════════════════════════════════════════════════════════════════
#  SIDEBAR — Navigation
# ════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("## 📈 BRVM Analyzer")
    st.markdown("---")
    page = st.radio("Navigation", [
        "🏠 Accueil",
        "1️⃣  Identité société",
        "2️⃣  Résultats 5 ans",
        "3️⃣  Valorisation",
        "4️⃣  Dividendes",
        "5️⃣  Bilan & FCF",
        "6️⃣  Technique & Risque",
        "📊 Aperçu & Scores",
        "📥 Générer Excel",
    ], label_visibility="collapsed")
    st.markdown("---")

    # Indicateur de complétude
    checks = [
        bool(st.session_state.nom),
        bool(st.session_state.ticker),
        bool(st.session_state.secteur),
        all(v is not None for v in st.session_state.ca),
        all(v is not None for v in st.session_state.rn),
        st.session_state.prix is not None,
        st.session_state.bnpa is not None,
        st.session_state.capitaux_propres is not None,
        st.session_state.nb_titres is not None,
        any(v is not None for v in st.session_state.dividendes),
        st.session_state.dette_lt is not None,
        st.session_state.actifs_cour is not None,
        st.session_state.amortissements is not None,
    ]
    done = sum(checks)
    total = len(checks)
    pct = done / total
    color = GREEN if pct >= 1 else (ORANGE if pct >= 0.6 else "#DC2626")
    st.markdown(f"**Complétude**")
    st.progress(pct, text=f"{done}/{total} étapes")
    if done == total:
        st.success("✅ Analyse complète !")
    elif done >= 9:
        st.warning(f"🟡 {total - done} étapes restantes")
    else:
        st.error(f"🔴 {total - done} étapes manquantes")


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

        | Onglet Excel généré | Contenu |
        |---------------------|---------|
        | **RAPPORT** | Fiche imprimable A4 avec logo, scores, signature |
        | **GUIDE** | Checklist de saisie avec statut auto |
        | **ETUDE** | Analyse complète : fondamental, technique, bilan, FCF |
        | **SYNTHESE** | Scorecard /45 avec verdict ACHETER / SURVEILLER / EVITER |
        | **PROFIL** | Données société, bilan, psychologie du marché |
        | **PORTEFEUILLE** | Suivi de positions avec recommandations |
        | **FORMULE** | Glossaire + sources de données cliquables |
        """)
    with col2:
        logo_path = ANALYZER_DIR / "logo.png"
        if logo_path.exists():
            st.image(str(logo_path), width=260)
        st.info("**Démarrer →** Utilisez le menu à gauche")
        if st.session_state.nom:
            st.success(f"**En cours :** {st.session_state.nom} ({st.session_state.ticker})")


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
        st.session_state.ticker = st.text_input(
            "Ticker BRVM *",
            value=st.session_state.ticker,
            placeholder="ex: SAPH, ETIT, BIDC, SNTS")
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
        st.markdown("""
        - 🌐 [brvm.org](https://www.brvm.org) — cours, profils sociétés
        - 📊 [richbourse.com](https://www.richbourse.com) — bilans, ratios
        - 📰 [sika-finance.com](https://www.sika-finance.com) — actualités
        """)


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 2 — RESULTATS 5 ANS
# ════════════════════════════════════════════════════════════════════════════
elif page == "2️⃣  Résultats 5 ans":
    st.title("2 — Résultats sur 5 ans")
    st.info("Saisir en **millions FCFA**. Source : rapports annuels ou richbourse.com")

    cols = st.columns(5)
    for i, annee in enumerate(ANNEES):
        with cols[i]:
            st.markdown(f"**{annee}**")
            ca_val = st.number_input(f"CA (M FCFA)", key=f"ca_{i}",
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


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 3 — VALORISATION
# ════════════════════════════════════════════════════════════════════════════
elif page == "3️⃣  Valorisation":
    st.title("3 — Données de valorisation")
    col1, col2 = st.columns(2)
    with col1:
        st.session_state.prix = st.number_input("Prix actuel (FCFA) *", min_value=0.0, step=10.0,
                                                  value=float(st.session_state.prix or 0))
        st.session_state.bnpa = st.number_input("BNPA — Bénéfice Net Par Action (FCFA) *",
                                                  step=1.0, value=float(st.session_state.bnpa or 0))
        st.session_state.capitaux_propres = st.number_input("Capitaux propres (FCFA) *",
                                                              step=1_000_000.0,
                                                              value=float(st.session_state.capitaux_propres or 0))
    with col2:
        st.session_state.nb_titres = st.number_input("Nombre de titres en circulation *",
                                                       step=1000.0,
                                                       value=float(st.session_state.nb_titres or 0))
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
    vcp = st.session_state.valeur_comptable or 0

    if p > 0 and bnpa > 0:
        per = p / bnpa
        st.markdown("---")
        c1, c2, c3, c4 = st.columns(4)
        with c1:
            col_color = "green" if 9 <= per <= 15 else ("orange" if per <= 20 else "red")
            st.metric("PER", f"{per:.1f}x", delta=None)
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


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 4 — DIVIDENDES
# ════════════════════════════════════════════════════════════════════════════
elif page == "4️⃣  Dividendes":
    st.title("4 — Dividendes")
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
    divs = [d for d in st.session_state.dividendes if d]
    if len(divs) >= 2:
        trend = (divs[-1] - divs[0]) / abs(divs[0]) * 100 if divs[0] else 0
        if trend > 5:
            st.success(f"📈 Dividende croissant sur la période (+{trend:.1f}%)")
        elif trend > -5:
            st.warning(f"➡️ Dividende stable sur la période ({trend:+.1f}%)")
        else:
            st.error(f"📉 Dividende en baisse sur la période ({trend:.1f}%)")


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 5 — BILAN & FCF
# ════════════════════════════════════════════════════════════════════════════
elif page == "5️⃣  Bilan & FCF":
    st.title("5 — Bilan & Free Cash Flow")
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

    st.markdown("#### Free Cash Flow (3 chiffres)")
    c3, c4, c5 = st.columns(3)
    with c3:
        st.session_state.amortissements = st.number_input("(+) Amortissements & dépréciations (FCFA)",
            step=1e6, value=float(st.session_state.amortissements or 0))
    with c4:
        st.session_state.capex = st.number_input("(-) CAPEX — Investissements nets (FCFA)",
            step=1e6, value=float(st.session_state.capex or 0))
    with c5:
        st.session_state.var_bfr = st.number_input("(-) Variation du BFR (FCFA)",
            step=1e5, value=float(st.session_state.var_bfr or 0))

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
            color = "green" if fcf > 0 else "red"
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


# ════════════════════════════════════════════════════════════════════════════
#  PAGE 6 — TECHNIQUE & RISQUE
# ════════════════════════════════════════════════════════════════════════════
elif page == "6️⃣  Technique & Risque":
    st.title("6 — Analyse Technique & Gestion du Risque")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### Score technique B1 (-5 à +5)")
        st.session_state.score_b1 = st.slider(
            "Score MM20 / Bollinger / MACD / RSI / Volume",
            min_value=-5, max_value=5,
            value=int(st.session_state.score_b1 or 0))
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
        st.session_state.prix_achat = st.number_input("Prix d'achat envisagé (FCFA)",
            step=10.0, value=float(st.session_state.prix_achat or st.session_state.prix or 0))
        st.session_state.stop_loss = st.number_input("Stop-Loss (FCFA)",
            step=10.0, value=float(st.session_state.stop_loss or 0))
        st.session_state.take_profit = st.number_input("Take Profit (FCFA)",
            step=10.0, value=float(st.session_state.take_profit or 0))
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


# ════════════════════════════════════════════════════════════════════════════
#  PAGE — APERCU & SCORES
# ════════════════════════════════════════════════════════════════════════════
elif page == "📊 Aperçu & Scores":
    st.title("📊 Aperçu — Scores estimés")
    if not st.session_state.nom:
        st.warning("Commencez par remplir l'étape 1 (Identité société)")
        st.stop()

    st.subheader(f"{st.session_state.nom} ({st.session_state.ticker}) — {st.session_state.secteur}")

    # ── Calculs scores fondamentaux ───────────────────────────────────────
    scores_fond = {}

    # CA growth N/N-4
    ca = st.session_state.ca
    if ca[0] and ca[4] and ca[0] != 0:
        g_ca = (ca[4] - ca[0]) / abs(ca[0]) * 100
        scores_fond["Croissance CA (N/N-4)"] = (
            f"{g_ca:.1f}%",
            3 if g_ca >= 15 else 2 if g_ca >= 5 else 1 if g_ca >= 0 else 0
        )

    # RN growth
    rn = st.session_state.rn
    if rn[0] and rn[4] and rn[0] != 0:
        g_rn = (rn[4] - rn[0]) / abs(rn[0]) * 100
        scores_fond["Croissance RN (N/N-4)"] = (
            f"{g_rn:.1f}%",
            3 if g_rn >= 15 else 2 if g_rn >= 5 else 1 if g_rn >= 0 else 0
        )

    # Marge nette
    if ca[4] and rn[4] and ca[4] != 0:
        marge = rn[4] / ca[4] * 100
        scores_fond["Marge nette"] = (
            f"{marge:.1f}%",
            3 if marge >= 10 else 2 if marge >= 5 else 1 if marge >= 2 else 0
        )

    # PER
    p = st.session_state.prix or 0
    bnpa = st.session_state.bnpa or 0
    if p > 0 and bnpa > 0:
        per = p / bnpa
        scores_fond["PER"] = (
            f"{per:.1f}x",
            3 if per < 9 else 2 if per <= 15 else 1 if per <= 20 else 0
        )

    # PBR
    cp = st.session_state.capitaux_propres or 0
    nb = st.session_state.nb_titres or 0
    if p > 0 and cp > 0 and nb > 0:
        pbr = (p * nb) / cp
        scores_fond["PBR"] = (
            f"{pbr:.2f}x",
            3 if pbr < 1 else 1 if pbr < 2 else 0
        )

    # ROE
    if rn[4] and cp > 0:
        roe = rn[4] * 1e6 / cp * 100
        scores_fond["ROE"] = (
            f"{roe:.1f}%",
            3 if roe >= 15 else 2 if roe >= 10 else 1 if roe >= 5 else 0
        )

    # Rendement dividende
    divs = st.session_state.dividendes
    if divs[4] and p > 0:
        rdt = divs[4] / p * 100
        scores_fond["Rendement dividende"] = (
            f"{rdt:.2f}%",
            3 if rdt >= 6 else 2 if rdt >= 3 else 1 if rdt >= 1 else 0
        )

    # Tendance dividende
    valid_divs = [d for d in divs if d]
    if len(valid_divs) >= 2 and valid_divs[0] > 0:
        cagr = (valid_divs[-1] / valid_divs[0]) ** (1 / max(len(valid_divs) - 1, 1)) - 1
        scores_fond["Tendance dividende (CAGR)"] = (
            f"{cagr*100:.1f}%/an",
            3 if cagr >= 0.10 else 2 if cagr >= 0.02 else 1 if cagr >= 0 else 0
        )

    # Réaction marché
    pa = st.session_state.prix_avant or 0
    pp = st.session_state.prix_apres or 0
    if pa > 0 and pp > 0:
        react = (pp - pa) / pa * 100
        scores_fond["Réaction marché post-résultats"] = (
            f"{react:+.1f}%",
            3 if react >= 5 else 2 if react >= 0 else 1 if react >= -5 else 0
        )

    total_fond = sum(s for _, s in scores_fond.values())
    max_fond = 30

    # ── Affichage scorecard ───────────────────────────────────────────────
    col1, col2 = st.columns([3, 1])
    with col1:
        st.markdown("#### Scorecard Fondamentale")
        for crit, (val, score) in scores_fond.items():
            stars = "⭐" * score + "☆" * (3 - score)
            color = "green" if score == 3 else "orange" if score >= 1 else "red"
            st.markdown(
                f"<div class='metric-card'>"
                f"<b>{crit}</b> &nbsp; <code>{val}</code> &nbsp; "
                f"<span style='color:{color}'>{stars} {score}/3</span>"
                f"</div>",
                unsafe_allow_html=True)
    with col2:
        pct_f = total_fond / max_fond
        color = GREEN if pct_f >= 0.7 else (ORANGE if pct_f >= 0.5 else "#DC2626")
        st.markdown(f"""
        <div style='text-align:center; padding:1.5rem; background:{NAVY};
                    border-radius:12px; color:white; margin-top:2rem;'>
            <div style='font-size:3rem; font-weight:bold; color:{color}'>{total_fond}</div>
            <div style='font-size:1.2rem'>/ {max_fond}</div>
            <div style='margin-top:0.5rem; font-size:0.9rem'>Score Fondamental</div>
            <div style='margin-top:1rem; font-size:1.1rem; font-weight:bold; color:{color}'>
                {"SOLIDE" if pct_f >= 0.7 else "MOYEN" if pct_f >= 0.5 else "FAIBLE"}
            </div>
        </div>
        """, unsafe_allow_html=True)

        # Prime de risque
        if divs[4] and p > 0:
            rdt_div = divs[4] / p * 100
            prime = rdt_div - st.session_state.taux_sr
            st.markdown("---")
            if prime >= 2:
                st.success(f"Prime de risque : **+{prime:.1f}%** ✅")
            elif prime >= 0:
                st.warning(f"Prime de risque : **+{prime:.1f}%** 🟡")
            else:
                st.error(f"Prime de risque : **{prime:.1f}%** 🔴\nObligations > action")


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

                # Pré-remplissage : on écrit les données dans le fichier Excel généré
                # en injectant les valeurs via un patch temporaire des constantes
                import importlib.util
                spec = importlib.util.spec_from_file_location(
                    "build_excel", str(ANALYZER_DIR / "build_excel.py"))
                mod = importlib.util.load_from_spec(spec)
                spec.loader.exec_module(mod)

                # Génération standard (le fichier sera pré-rempli manuellement)
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
