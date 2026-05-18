"""
BRVM Analytics — Générateur de rapport PDF professionnel
Utilise fpdf2 (>=2.7) — format A4, impression lisible.
"""
import re
from datetime import date, datetime
from pathlib import Path

from fpdf import FPDF

# ─── PALETTE COULEURS ─────────────────────────────────────────────────────────
NAVY  = (6,   13,  26)
GOLD  = (245, 158, 11)
GREEN = (22,  163, 74)
RED   = (220, 38,  38)
LIGHT = (241, 245, 249)
SLATE = (71,  85,  105)
WHITE = (255, 255, 255)
GRAY  = (148, 163, 184)

RECO_COLORS = {
    "ACHAT":      (GREEN, (220, 252, 231)),
    "ACCUMULER":  (GREEN, (220, 252, 231)),
    "NEUTRE":     (SLATE, (241, 245, 249)),
    "ALLÉGER":    (RED,   (254, 226, 226)),
    "ALLEGER":    (RED,   (254, 226, 226)),
    "VENTE":      (RED,   (254, 226, 226)),
}

LOGO_PATH = Path(__file__).parent / "static" / "logo.png"

# ─── UTILITAIRES ──────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """Supprime les emojis et caractères non supportés par Helvetica."""
    if not text:
        return ""
    # Supprimer les emojis unicode (plages communes)
    emoji_pattern = re.compile(
        "[\U00010000-\U0010ffff"
        "\U0001F600-\U0001F64F"
        "\U0001F300-\U0001F5FF"
        "\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF"
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+",
        flags=re.UNICODE,
    )
    text = emoji_pattern.sub("", text)
    # Remplacer les tirets spéciaux
    text = text.replace("\u2014", "-").replace("\u2013", "-").replace("\u2022", "*")
    # Supprimer les caractères hors latin-1 restants
    text = text.encode("latin-1", errors="replace").decode("latin-1")
    return text.strip()


def _score_color(score: float):
    """Retourne (r,g,b) selon le score 0-100."""
    if score >= 70:
        return GREEN
    if score >= 55:
        return (132, 204, 22)   # lime
    if score >= 42:
        return (234, 179, 8)    # yellow
    if score >= 28:
        return (249, 115, 22)   # orange
    return RED


def _fmt_fcfa(value) -> str:
    if value is None:
        return "—"
    try:
        v = float(value)
        return f"{v:,.0f}".replace(",", " ") + " FCFA"
    except Exception:
        return str(value)


def _fmt_pct(value) -> str:
    if value is None:
        return "—"
    try:
        v = float(value)
        sign = "+" if v > 0 else ""
        return f"{sign}{v:.2f}%"
    except Exception:
        return str(value)


# ─── CLASSE PDF ───────────────────────────────────────────────────────────────

class BRVMReport(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(15, 15, 15)
        self._report_date = date.today().strftime("%d/%m/%Y")
        self._report_num  = datetime.now().strftime("%Y%m%d%H%M%S")

    # ── helpers de style ──

    def _set_color(self, rgb, target="fill"):
        r, g, b = rgb
        if target == "fill":
            self.set_fill_color(r, g, b)
        elif target == "text":
            self.set_text_color(r, g, b)
        elif target == "draw":
            self.set_draw_color(r, g, b)

    def _heading(self, text, size=11, bold=True, color=NAVY, fill=False, fill_color=LIGHT, ln=True):
        self.set_font("Helvetica", "B" if bold else "", size)
        self._set_color(color, "text")
        if fill:
            self._set_color(fill_color, "fill")
            self.cell(0, 7, _clean(text), fill=True, ln=ln)
        else:
            self.cell(0, 7, _clean(text), ln=ln)
        self._set_color(NAVY, "text")

    def _body(self, text, size=9, color=SLATE):
        self.set_font("Helvetica", "", size)
        self._set_color(color, "text")
        self.multi_cell(0, 5, _clean(text))
        self._set_color(NAVY, "text")

    def _score_bar(self, score: float, x=None, y=None, w=80, h=4):
        """Dessine une barre de score horizontale."""
        if x is None:
            x = self.get_x()
        if y is None:
            y = self.get_y()
        # Fond gris
        self.set_fill_color(226, 232, 240)
        self.rect(x, y, w, h, "F")
        # Barre colorée
        color = _score_color(score)
        self._set_color(color, "fill")
        bar_w = max(1, w * score / 100)
        self.rect(x, y, bar_w, h, "F")
        # Valeur
        self.set_font("Helvetica", "B", 8)
        self._set_color(color, "text")
        self.set_xy(x + w + 2, y - 1)
        self.cell(12, 6, f"{int(score)}/100")
        self._set_color(NAVY, "text")

    # ── EN-TÊTE ──────────────────────────────────────────────────────────────

    def _draw_header(self):
        # Barre de fond foncée
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 210, 28, "F")

        # Logo PNG
        logo = str(LOGO_PATH)
        if LOGO_PATH.exists():
            try:
                self.image(logo, x=12, y=4, w=20, h=20)
            except Exception:
                pass

        # Titre
        self.set_xy(36, 5)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*GOLD)
        self.cell(0, 7, "BRVM Analytics")

        self.set_xy(36, 13)
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(*GRAY)
        self.cell(0, 5, "L'Etoile du Taureau d'Or  -  Bourse Regionale des Valeurs Mobilieres")

        # Date & numéro rapport (coin droit)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GRAY)
        self.set_xy(130, 6)
        self.cell(68, 5, f"Date : {self._report_date}", align="R", ln=True)
        self.set_xy(130, 11)
        self.cell(68, 5, f"Rapport N° {self._report_num}", align="R")

        # Retour position normale
        self.set_text_color(*NAVY)
        self.set_y(32)

    # ── PIED DE PAGE ─────────────────────────────────────────────────────────

    def footer(self):
        self.set_y(-12)
        self.set_draw_color(*GOLD)
        self.set_line_width(0.3)
        self.line(15, self.get_y(), 195, self.get_y())
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*GRAY)
        self.cell(0, 5, "BRVM Analytics v2.0  -  (c) 2025  -  http://localhost:8000  -  L'Etoile du Taureau d'Or", align="C")


# ─── FONCTION PRINCIPALE ──────────────────────────────────────────────────────

def generate_stock_report(
    symbol: str,
    stock_info: dict,
    latest_price: dict,
    reco: dict,
) -> bytes:
    """
    Génère le rapport PDF complet et retourne les bytes du fichier.

    Args:
        symbol      : Symbole boursier (ex. "SNTS")
        stock_info  : {name, sector, country, ...}
        latest_price: {close, variation_pct, reference_price, date}
        reco        : résultat de compute_recommendation()
    Returns:
        bytes du PDF généré
    """
    pdf = BRVMReport()
    pdf.add_page()
    pdf._draw_header()

    # ─── BLOC STOCK ──────────────────────────────────────────────────────────

    close     = latest_price.get("close") or latest_price.get("value")
    var_pct   = latest_price.get("variation_pct")
    ref_price = latest_price.get("reference_price")
    price_date= latest_price.get("date", "—")
    name      = stock_info.get("name", symbol)
    sector    = stock_info.get("sector", "N/D")
    country   = stock_info.get("country", "N/D")

    # Fond titre stock
    pdf.set_fill_color(*LIGHT)
    pdf.rect(15, pdf.get_y(), 180, 30, "F")

    # Symbole grand
    pdf.set_xy(18, pdf.get_y() + 3)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*NAVY)
    pdf.cell(40, 12, _clean(symbol))

    # Nom complet & secteur
    y_block = pdf.get_y()
    pdf.set_xy(60, y_block)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*NAVY)
    pdf.cell(100, 6, _clean(name[:50]))

    pdf.set_xy(60, y_block + 7)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*SLATE)
    pdf.cell(100, 5, f"Secteur : {_clean(sector)}   |   Pays : {_clean(country)}")

    pdf.set_xy(60, y_block + 13)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*SLATE)
    pdf.cell(100, 5, f"Cotation du : {_clean(str(price_date))}")

    # Cours & variation (coin droit du bloc)
    pdf.set_xy(140, y_block)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*NAVY)
    pdf.cell(52, 8, _fmt_fcfa(close), align="R")

    if var_pct is not None:
        var_col = GREEN if float(var_pct) >= 0 else RED
        pdf.set_xy(140, y_block + 9)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*var_col)
        pdf.cell(52, 6, _fmt_pct(var_pct), align="R")

    if ref_price is not None:
        pdf.set_xy(140, y_block + 16)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*GRAY)
        pdf.cell(52, 4, f"Ref : {_fmt_fcfa(ref_price)}", align="R")

    pdf.set_y(y_block + 30)
    pdf.ln(3)

    # ─── RECOMMANDATION GLOBALE ───────────────────────────────────────────────

    reco_label = reco.get("recommendation", "NEUTRE")
    reco_score = float(reco.get("score", 50))
    reco_summary = reco.get("summary", "")
    horizon    = reco.get("horizon", "—")
    risk_level = reco.get("risk_level", "N/D")

    text_col, bg_col = RECO_COLORS.get(reco_label.upper(), RECO_COLORS["NEUTRE"])

    # Fond coloré de la section
    block_y = pdf.get_y()
    pdf.set_fill_color(*bg_col)
    pdf.rect(15, block_y, 180, 44, "F")
    pdf.set_draw_color(*text_col)
    pdf.set_line_width(0.6)
    pdf.rect(15, block_y, 180, 44)
    pdf.set_line_width(0.2)

    # Label recommandation
    pdf.set_xy(18, block_y + 4)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*text_col)
    pdf.cell(60, 10, _clean(reco_label))

    # Score
    pdf.set_xy(18, block_y + 16)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*NAVY)
    pdf.cell(40, 5, f"Score de conviction :")

    pdf.set_xy(18, block_y + 22)
    pdf._score_bar(reco_score, x=18, y=block_y + 22, w=90)

    # Horizon & Risque
    pdf.set_xy(120, block_y + 4)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*SLATE)
    pdf.cell(30, 5, "Horizon :")
    pdf.set_xy(150, block_y + 4)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*NAVY)
    pdf.cell(42, 5, _clean(str(horizon)[:45]))

    pdf.set_xy(120, block_y + 11)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*SLATE)
    pdf.cell(30, 5, "Niveau risque :")
    pdf.set_xy(150, block_y + 11)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*NAVY)
    pdf.cell(42, 5, _clean(str(risk_level)))

    # Résumé
    pdf.set_xy(18, block_y + 30)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(174, 4.5, _clean(str(reco_summary)[:300]))

    pdf.set_y(block_y + 46)
    pdf.ln(3)

    # ─── TROIS COLONNES D'ANALYSE ─────────────────────────────────────────────

    axes = reco.get("axes", {})
    col_w   = 58
    col_gap = 3
    col_h   = 70
    start_x = 15
    start_y = pdf.get_y()

    axis_defs = [
        ("technique",    "Analyse Technique",       "40%"),
        ("fondamentale", "Analyse Fondamentale",     "35%"),
        ("psychologie",  "Psychologie du Marche",    "25%"),
    ]

    for i, (axis_key, axis_title, weight) in enumerate(axis_defs):
        ax = axes.get(axis_key, {})
        score  = float(ax.get("score", 50))
        label  = ax.get("label", "N/D")
        summary= ax.get("summary", "")
        details= ax.get("details", [])

        cx = start_x + i * (col_w + col_gap)
        cy = start_y

        # Fond de colonne
        pdf.set_fill_color(*LIGHT)
        pdf.rect(cx, cy, col_w, col_h, "F")

        # En-tête colonne
        ax_col = _score_color(score)
        pdf.set_fill_color(*ax_col)
        pdf.rect(cx, cy, col_w, 8, "F")
        pdf.set_xy(cx + 2, cy + 1)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*WHITE)
        pdf.cell(col_w - 4, 6, f"{axis_title} ({weight})")

        # Score label
        pdf.set_xy(cx + 2, cy + 10)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*ax_col)
        pdf.cell(col_w - 4, 5, _clean(f"{label} — {int(score)}/100"))

        # Barre de score
        pdf.set_xy(cx + 2, cy + 16)
        pdf._score_bar(score, x=cx + 2, y=cy + 16, w=col_w - 16)

        # Résumé de l'axe
        pdf.set_xy(cx + 2, cy + 24)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_text_color(*SLATE)
        # Limiter à 3 lignes max
        summary_clean = _clean(str(summary)[:180])
        pdf.multi_cell(col_w - 4, 3.8, summary_clean)

        # Détails
        detail_y = cy + 44
        for det in details[:5]:
            if detail_y > cy + col_h - 6:
                break
            det_label = _clean(str(det.get("label", "")))
            det_score = det.get("score", 0)
            det_col   = _score_color(float(det_score))
            pdf.set_xy(cx + 2, detail_y)
            pdf.set_font("Helvetica", "", 6.5)
            pdf.set_text_color(*SLATE)
            pdf.cell(col_w - 16, 4, det_label[:32])
            pdf.set_xy(cx + col_w - 14, detail_y)
            pdf.set_font("Helvetica", "B", 6.5)
            pdf.set_text_color(*det_col)
            pdf.cell(12, 4, str(int(det_score)), align="R")
            detail_y += 4.5

    pdf.set_y(start_y + col_h + 5)

    # ─── FACTEURS CLÉS ────────────────────────────────────────────────────────

    key_factors = reco.get("key_factors", [])
    if key_factors:
        # Vérifier qu'il y a assez de place, sinon nouvelle page
        if pdf.get_y() > 230:
            pdf.add_page()
            pdf._draw_header()

        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(*NAVY)
        pdf.rect(15, pdf.get_y(), 180, 7, "F")
        pdf.set_xy(18, pdf.get_y() + 0.5)
        pdf.set_text_color(*WHITE)
        pdf.cell(174, 6, "Facteurs Cles")
        pdf.set_text_color(*NAVY)
        pdf.ln(8)

        for fk in key_factors:
            positive = fk.get("positive", True)
            text     = _clean(str(fk.get("text", "")))
            symbol_char = "[+]" if positive else "[-]"
            fk_col  = GREEN if positive else RED
            fk_bg   = (220, 252, 231) if positive else (254, 226, 226)

            row_y = pdf.get_y()
            pdf.set_fill_color(*fk_bg)
            pdf.rect(15, row_y, 180, 6.5, "F")
            pdf.set_xy(18, row_y + 1)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(*fk_col)
            pdf.cell(10, 4.5, symbol_char)
            pdf.set_xy(29, row_y + 1)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*SLATE)
            pdf.cell(163, 4.5, text[:90])
            pdf.ln(7)

        pdf.ln(2)

    # ─── AVERTISSEMENT LÉGAL ─────────────────────────────────────────────────

    # Si peu de place, nouvelle page
    if pdf.get_y() > 255:
        pdf.add_page()
        pdf._draw_header()

    pdf.ln(4)
    pdf.set_fill_color(254, 249, 195)       # jaune pâle
    pdf.set_draw_color(234, 179, 8)
    pdf.set_line_width(0.4)
    warn_y = pdf.get_y()
    pdf.rect(15, warn_y, 180, 12, "FD")
    pdf.set_xy(18, warn_y + 2)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(133, 77, 14)         # brun ambre
    pdf.cell(174, 4, "AVERTISSEMENT LEGAL")
    pdf.set_xy(18, warn_y + 7)
    pdf.set_font("Helvetica", "", 6.5)
    pdf.set_text_color(133, 77, 14)
    pdf.multi_cell(
        174, 3.5,
        "Ce rapport est genere automatiquement a titre informatif uniquement et ne constitue pas "
        "un conseil en investissement. Les donnees peuvent etre inexactes ou incompletes. "
        "Toute decision d'investissement reste sous la seule responsabilite de l'investisseur.",
    )
    pdf.set_line_width(0.2)
    pdf.set_draw_color(*NAVY)
    pdf.set_text_color(*NAVY)

    # Retourne les bytes du PDF
    return pdf.output()
