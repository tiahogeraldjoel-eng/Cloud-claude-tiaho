"""
Génère etudes_actions_v2.xlsx avec xlsxwriter.
Toutes les formules utilisent des adresses de cellules fixes et explicites.
Usage: python3 build_excel.py
"""
import xlsxwriter
from datetime import date

OUT          = "/home/user/Cloud-claude-tiaho/brvm-analyzer/etudes_actions_v2.xlsx"
PROTECT_PWD  = ""   # vide = protection sans mot de passe (contre saisies accidentelles)

# ── Couleurs ─────────────────────────────────────────────────────────────────
NAVY    = "#0D1B2A"   # Deep navy for titles
BLUE    = "#1E3A5F"   # Rich navy for sections
LBLUE   = "#DCE8F5"   # Cool blue-grey for headers
ORANGE  = "#D97706"   # Refined amber for inputs
LORANGE = "#FFFBEB"   # Very light amber bg
LGREEN  = "#ECFDF5"   # Modern mint for calculated
GREY    = "#F1F5F9"   # Slate grey for labels
WHITE   = "#FFFFFF"
DARK    = "#1E293B"   # Deep slate for text
RED     = "#DC2626"   # Clean red for warnings

def make_wb():
    wb = xlsxwriter.Workbook(OUT, {
        'strings_to_numbers': False,
        'strings_to_formulas': False,   # on gère les formules manuellement
        'default_date_format': 'dd/mm/yyyy',
    })

    # ── Formats communs ───────────────────────────────────────────────────────
    def fmt(bold=False, bg=WHITE, fg=DARK, size=11, italic=False,
            align='left', valign='vcenter', border=0,
            num_format=None, wrap=False, locked=False):
        d = dict(bold=bold, font_color=fg, font_size=size,
                 italic=italic, align=align, valign=valign,
                 bg_color=bg, border=border, border_color='#BFBFBF',
                 text_wrap=wrap, locked=locked)
        if num_format:
            d['num_format'] = num_format
        return wb.add_format(d)

    # Titres
    F_TITLE  = fmt(bold=True, bg=NAVY,   fg=WHITE,  size=14, align='center', border=0)
    F_TITLE2 = fmt(bold=True, bg=BLUE,   fg=WHITE,  size=10, align='center', border=0)
    F_WARN   = fmt(italic=True, fg=RED,  size=8,    align='left', border=0)

    # Sections
    F_SEC    = fmt(bold=True, bg=BLUE,   fg=WHITE,  size=11, border=0)

    # Entêtes colonnes
    F_HEAD   = fmt(bold=True, bg=LBLUE,  fg=NAVY,   size=11,  align='center', border=1)

    # Libellés
    F_LBL    = fmt(bg=GREY,   fg=DARK,   size=11,    border=1)
    F_LBL_B  = fmt(bold=True, bg=GREY,   fg=DARK,   size=11,  border=1)

    # Valeurs à saisir (orange) — locked=False : modifiables meme quand la feuille est protegee
    F_INPUT       = fmt(bg=LORANGE, fg=ORANGE, size=10, bold=True,  align='right', border=1, locked=False)
    F_INPUT_S     = fmt(bg=LORANGE, fg=DARK,   size=11,  align='right', border=1, locked=False)
    F_INPUT_C     = fmt(bg=LORANGE, fg=DARK,   size=11,  align='center', border=1, locked=False)

    # Valeurs calculées (vert) — locked=True : formules protegees contre cassures accidentelles
    F_CALC        = fmt(bg=LGREEN,  fg=DARK,   size=11,  align='right', border=1, locked=True)
    F_CALC_B      = fmt(bold=True, bg=LGREEN,  fg=DARK,  size=11, align='right', border=1, locked=True)
    F_CALC_C      = fmt(bg=LGREEN,  fg=DARK,   size=11,  align='center', border=1, locked=True)
    F_CALC_PCT    = fmt(bg=LGREEN,  fg=DARK,   size=11,  align='right', border=1, num_format='0.00', locked=True)
    F_CALC_PCTA   = fmt(bg=LGREEN,  fg=DARK,   size=11,  align='right', border=1, num_format='0.00%', locked=True)
    F_CALC_N      = fmt(bg=LGREEN,  fg=DARK,   size=11,  align='right', border=1, num_format='#,##0', locked=True)
    F_CALC_N2     = fmt(bg=LGREEN,  fg=DARK,   size=11,  align='right', border=1, num_format='#,##0.00', locked=True)

    # Blanc neutre
    F_WHITE       = fmt(bg=WHITE, border=1)
    F_WHITE_R     = fmt(bg=WHITE, fg=DARK, size=11, align='right', border=1)
    F_WHITE_C     = fmt(bg=WHITE, fg=DARK, size=11, align='center', border=1)
    F_WHITE_N     = fmt(bg=WHITE, fg=DARK, size=11, align='right',  border=1, num_format='#,##0')
    F_WHITE_N2    = fmt(bg=WHITE, fg=DARK, size=11, align='right',  border=1, num_format='#,##0.00')
    F_WHITE_PCT   = fmt(bg=WHITE, fg=DARK, size=11, align='right',  border=1, num_format='0.00')

    # Référence (gris)
    F_REF    = fmt(bg=GREY, fg='#606060', size=8, italic=True, align='left', border=1, wrap=True)
    F_NOTE   = fmt(bg=LORANGE, fg=ORANGE, size=8, italic=True, align='left', border=0, wrap=True)
    F_HINT   = fmt(bg=WHITE, fg='#808080', size=8, italic=True, align='left', border=1)

    build_etude(wb, fmt, F_TITLE, F_TITLE2, F_WARN, F_SEC, F_HEAD,
                F_LBL, F_LBL_B, F_INPUT, F_INPUT_S, F_INPUT_C,
                F_CALC, F_CALC_B, F_CALC_C, F_CALC_PCT, F_CALC_PCTA,
                F_CALC_N, F_CALC_N2, F_WHITE, F_WHITE_R, F_WHITE_C,
                F_WHITE_N, F_WHITE_N2, F_WHITE_PCT, F_REF, F_NOTE, F_HINT)

    build_synthese(wb, fmt, F_TITLE, F_TITLE2, F_SEC, F_HEAD,
                   F_LBL, F_LBL_B, F_INPUT_S, F_CALC, F_CALC_B,
                   F_CALC_C, F_WHITE, F_WHITE_C, F_WHITE_N2, F_LORANGE_C := fmt(bg=LORANGE, fg=DARK, size=11, align='center', border=1, locked=False))

    build_profil(wb, fmt, F_TITLE, F_SEC, F_HEAD, F_LBL, F_WHITE, F_HINT)

    build_formule(wb, fmt, F_TITLE, F_SEC, F_HEAD, F_LBL, F_LBL_B, F_WHITE, F_REF, F_CALC_C)

    wb.close()
    print(f"Fichier cree : {OUT}")


# ══════════════════════════════════════════════════════════════════════════════
#  FEUILLE ETUDE — structure a lignes FIXES (pas de r dynamique pour les refs)
# ══════════════════════════════════════════════════════════════════════════════

# Toutes les adresses de cellules importantes sont définies ici comme constantes
# pour éviter les erreurs de référence croisée

# Saisies A4 (Valorisation)
PRIX_CELL  = 'B24'   # Prix actuel
BNPA_CELL  = 'B25'   # BNPA
CPTX_CELL  = 'B26'   # Capitaux propres
VALO_CELL  = 'B27'   # Capitalisation boursiere
NBTI_CELL  = 'B28'   # Nombre de titres

# Résultats A4 — Ratios (col B = calculé)
PER_CELL   = 'B30'
VMC_CELL   = 'B31'
PBR_CELL   = 'B32'
ROE_CELL   = 'B33'
RVC_CELL   = 'B34'

# RN data (ligne de données A2)
RN_DATA_CELL = 'F12'  # RN année N

# DVD total (A5)
DVD_TOTAL_CELL = 'B44'  # total dividendes (row shifted by 1 after A5 restructure)

# B3 PER actualisé
EVOL_RN_CELL  = 'B101'
BNPA_ACT_CELL = 'B102'
PER_ACT_CELL  = 'B103'

# B4 PCD
DVD_N_CELL    = 'B109'
EVOL_PCD_CELL = 'B108'
REND_SEC_CELL = 'B111'
DVD_PREV_CELL = 'B110'
PCD_CELL      = 'B112'
ZONE_BAS_CELL = 'B113'
ZONE_HAU_CELL = 'B114'

# B5 Gordon-Shapiro
D1_CELL  = 'B120'
R_CELL   = 'B121'
G_CELL   = 'B122'
P0_CELL  = 'B123'

# B6 Stop-Loss
PA_CELL   = 'B128'
TP_CELL   = 'B130'
SL_CELL   = 'B129'
PP_CELL   = 'B131'
GP_CELL   = 'B132'
RR_CELL   = 'B133'


def build_etude(wb, fmt, F_TITLE, F_TITLE2, F_WARN, F_SEC, F_HEAD,
                F_LBL, F_LBL_B, F_INPUT, F_INPUT_S, F_INPUT_C,
                F_CALC, F_CALC_B, F_CALC_C, F_CALC_PCT, F_CALC_PCTA,
                F_CALC_N, F_CALC_N2, F_WHITE, F_WHITE_R, F_WHITE_C,
                F_WHITE_N, F_WHITE_N2, F_WHITE_PCT, F_REF, F_NOTE, F_HINT):

    ws = wb.add_worksheet("ETUDE")
    ws.set_tab_color("#0EA5E9")
    ws.freeze_panes(1, 0)

    # Largeurs colonnes (0-indexed)
    ws.set_column(0, 0, 34)   # A
    ws.set_column(1, 1, 13)   # B
    ws.set_column(2, 2, 13)   # C
    ws.set_column(3, 3, 13)   # D
    ws.set_column(4, 4, 22)   # E
    ws.set_column(5, 5, 11)   # F
    ws.set_column(6, 6, 18)   # G
    ws.set_column(7, 7, 13)   # H

    def row(r): return r - 1   # convertit n° ligne Excel (1-based) en index (0-based)
    def col(c): return ord(c) - ord('A')   # 'A'->0, 'B'->1, etc.

    def title(r, text, cols=8, bg="#1F3864", size=13):
        ws.merge_range(row(r), 0, row(r), cols-1, text, F_TITLE)
        ws.set_row(row(r), 26)

    def section(r, text, cols=8):
        ws.merge_range(row(r), 0, row(r), cols-1, text, F_SEC)
        ws.set_row(row(r), 20)

    def heads(r, labels, cols_start=0):
        for i, lbl in enumerate(labels):
            ws.write(row(r), cols_start+i, lbl, F_HEAD)
        ws.set_row(row(r), 15)

    def lbl(r, c, text, bold=False):
        ws.write(row(r), col(c), text, F_LBL_B if bold else F_LBL)

    def inp(r, c, val=None, num_format=None):
        f = F_INPUT if num_format is None else fmt(bg=LORANGE, fg=ORANGE, size=10,
                 bold=True, align='right', border=1, num_format=num_format, locked=False)
        ws.write(row(r), col(c), val, f)

    def inp_s(r, c, val=None, num_format=None):
        f = F_INPUT_S if num_format is None else fmt(bg=LORANGE, fg=DARK, size=11,
                 align='right', border=1, num_format=num_format, locked=False)
        ws.write(row(r), col(c), val, f)

    def calc(r, c, formula, num_format=None):
        f = F_CALC_PCT if num_format=='0.00' else \
            F_CALC_PCTA if num_format=='0.00%' else \
            F_CALC_N if num_format=='#,##0' else \
            F_CALC_N2 if num_format=='#,##0.00' else \
            F_CALC
        ws.write_formula(row(r), col(c), formula, f)

    def calc_c(r, c, formula):
        ws.write_formula(row(r), col(c), formula, F_CALC_C)

    def white(r, c, val=None, num_format=None):
        if val is None:
            ws.write_blank(row(r), col(c), None, F_WHITE_N if num_format=='#,##0' else F_WHITE)
        else:
            ws.write(row(r), col(c), val, F_WHITE_N if num_format=='#,##0' else F_WHITE_R)

    def hint(r, c, text, cols_merge=None):
        if cols_merge:
            ws.merge_range(row(r), col(c), row(r), col(cols_merge), text, F_HINT)
        else:
            ws.write(row(r), col(c), text, F_HINT)

    def blank(r, h=5):
        ws.set_row(row(r), h)

    # ─────────────────────────────────────────────────────────────────────────
    #  LIGNE 1 : Titre principal
    # ─────────────────────────────────────────────────────────────────────────
    ws.merge_range(0, 0, 0, 7, "", F_TITLE)
    ws.write_formula(0, 0,
        '=IF(PROFIL!B3="","FICHE D\'ANALYSE BRVM — [Completer onglet PROFIL]","FICHE D\'ANALYSE BRVM — "&PROFIL!B3&"  ("&PROFIL!B4&")  |  "&PROFIL!B5&"  |  "&IF(ISNUMBER(PROFIL!B6),TEXT(PROFIL!B6,"dd/mm/yyyy"),PROFIL!B6))',
        F_TITLE)
    ws.set_row(0, 26)

    ws.merge_range(1, 0, 1, 7, "", F_TITLE2)
    ws.write_formula(1, 0,
        '=IF(PROFIL!B3="","Completer le PROFIL : nom, ticker, secteur, date","Nom : "&PROFIL!B3&"  |  Ticker : "&PROFIL!B4&"  |  Secteur : "&PROFIL!B5&"  |  Date : "&IF(ISNUMBER(PROFIL!B6),TEXT(PROFIL!B6,"dd/mm/yyyy"),PROFIL!B6))',
        F_TITLE2)

    blank(3)

    # ─────────────────────────────────────────────────────────────────────────
    #  BLOC A — ANALYSE FONDAMENTALE (lignes 4–53)
    # ─────────────────────────────────────────────────────────────────────────
    ws.merge_range(3, 0, 3, 7, "A — ANALYSE FONDAMENTALE", F_TITLE)
    ws.set_row(3, 22)
    blank(5)

    # ── A1 : Chiffre d'affaires / PNB  (lignes 6–9) ─────────────────────────
    section(6, "A1 — CHIFFRE D'AFFAIRES ou PRODUIT NET BANCAIRE (en millions FCFA)")
    heads(7, ["", "N-4", "N-3", "N-2", "N-1", "N (dernier)", "Croissance N/N-4 %", "TCAM 4 ans %"])
    # Ligne 8 : données CA
    lbl(8, 'A', "CA / PNB")
    for c in ['B','C','D','E','F']:
        inp_s(8, c, num_format='#,##0')
    # G8 = Croissance = (F8-B8)/B8*100   ← formule correcte
    calc(8, 'G', '=IF(B8=0,"",((F8-B8)/B8)*100)', '0.00')
    # H8 = TCAM = (F8/B8)^(1/4)-1
    calc(8, 'H', '=IF(OR(B8=0,F8=0),"",(F8/B8)^(1/4)-1)', '0.00%')
    blank(9)

    # ── A2 : Résultat Net  (lignes 10–13) ────────────────────────────────────
    section(10, "A2 — RESULTAT NET (en millions FCFA)")
    heads(11, ["", "N-4", "N-3", "N-2", "N-1", "N (dernier)", "Croissance N/N-4 %", "TCAM 4 ans %"])
    # Ligne 12 : données RN
    lbl(12, 'A', "Resultat Net")
    for c in ['B','C','D','E','F']:
        inp_s(12, c, num_format='#,##0')
    # G12 = Croissance RN = (F12-B12)/|B12|*100
    calc(12, 'G', '=IF(B12=0,"",((F12-B12)/ABS(B12))*100)', '0.00')
    # H12 = TCAM (N/A si base négative)
    calc(12, 'H', '=IF(OR(B12=0,F12/B12<0),"N/A",(F12/B12)^(1/4)-1)', '0.00%')
    blank(13)

    # ── A3 : Marge Nette  (lignes 14–21) ────────────────────────────────────
    section(14, "A3 — MARGE NETTE (RN / CA x 100) — 5 dernieres annees")
    heads(15, ["Annee", "RN (M FCFA)", "CA/PNB (M FCFA)", "Marge %",
               "Interpretation", "Seuil", "Moyenne 5 ans %"])
    # Lignes 16-20 : N-4 … N
    annees = ["N-4", "N-3", "N-2", "N-1", "N"]
    a1_cols = ['B', 'C', 'D', 'E', 'F']   # colonnes CA/PNB dans A1 (ligne 8)
    a2_cols = ['B', 'C', 'D', 'E', 'F']   # colonnes RN dans A2 (ligne 12)
    for i, annee in enumerate(annees):
        r = 16 + i
        lbl(r, 'A', annee)
        ws.write_formula(row(r), col('B'), f'={a2_cols[i]}12', F_CALC_N)   # RN depuis A2
        ws.write_formula(row(r), col('C'), f'={a1_cols[i]}8',  F_CALC_N)   # CA depuis A1
        # D = Marge
        calc(r, 'D', f'=IFERROR(B{r}/C{r}*100,"")', '0.00')
        # E = interpretation auto
        calc_c(r, 'E',
            f'=IFERROR(IF(D{r}>=10,"Tres rentable",'
            f'IF(D{r}>=5,"Rentable",'
            f'IF(D{r}>=2,"Faiblement rentable","Tres faible"))),"-")')
        if i == 0:
            ws.write(row(r), col('F'), "> 5% = bon", F_INPUT_C)
            # G = Moyenne sur 5 ans
            calc(r, 'G', '=IFERROR(AVERAGE(D16:D20),"")', '0.00')
        else:
            ws.write_blank(row(r), col('F'), None, F_WHITE)
            ws.write_blank(row(r), col('G'), None, F_WHITE)
    blank(21)

    # ── A4 : Indicateurs de Valorisation  (lignes 22–35) ─────────────────────
    section(22, "A4 — INDICATEURS DE VALORISATION")
    # Sous-titre
    heads(23, ["Indicateur [formule]", "Valeur calculee", "Zone reference", "Signal", "", "", "", ""])

    # Saisies (lignes 24-28)
    lbl(24, 'A', "Prix actuel de l'action (FCFA)")
    inp(24, 'B', num_format='#,##0')
    hint(24, 'C', "<-- Saisir le prix actuel", 'G')

    lbl(25, 'A', "BNPA — Benefice Net Par Action (FCFA)")
    inp(25, 'B', num_format='#,##0.00')
    hint(25, 'C', "<-- RN / Nb titres (rapport annuel)", 'G')

    lbl(26, 'A', "Capitaux Propres (FCFA)")
    inp(26, 'B', num_format='#,##0')
    hint(26, 'C', "<-- Bilan comptable", 'G')

    lbl(27, 'A', "Capitalisation boursiere (FCFA)")
    inp(27, 'B', num_format='#,##0')
    hint(27, 'C', "<-- Prix x Nb titres", 'G')

    lbl(28, 'A', "Nombre de titres en circulation")
    ws.write_formula(row(28), col('B'), '=IFERROR(PROFIL!B17,"")',
                     fmt(bg=LGREEN, fg=DARK, size=11, align='right', border=1, num_format='#,##0'))
    hint(28, 'C', "<-- Auto depuis PROFIL onglet (Capital & Actionnariat)", 'G')

    blank(29)

    # Ratios calculés (lignes 30-34) — valeur directement en colonne B
    # PER — ligne 30
    lbl(30, 'A', "PER — Price Earning Ratio  [= Prix / BNPA]")
    calc(30, 'B', '=IFERROR(B24/B25,"")', '0.00')
    ws.write(row(30), col('C'), "Zone : 9-15", F_INPUT_C)
    calc_c(30, 'D',
        '=IFERROR(IF(B30>15,"Surevalue",'
        'IF(B30<9,"Sous-evalue","Zone normale (9-15)")),"-")')

    # VMC — ligne 31
    lbl(31, 'A', "VMC — Valeur Mathematique Comptable  [= Capitaux Propres / Nb titres]")
    calc(31, 'B', '=IFERROR(B26/B28,"")', '#,##0.00')
    ws.write(row(31), col('C'), "Prix < VMC = bon", F_INPUT_C)
    calc_c(31, 'D',
        '=IFERROR(IF(B24>B31,"Action surevaluee vs VMC","Action sous-evaluee vs VMC"),"-")')

    # PBR — ligne 32
    lbl(32, 'A', "PBR — Price to Book Ratio  [= Capitalisation / Capitaux Propres]")
    calc(32, 'B', '=IFERROR(B27/B26,"")', '0.00')
    ws.write(row(32), col('C'), "< 1 = decote", F_INPUT_C)
    calc_c(32, 'D',
        '=IFERROR(IF(B32<1,"Decote comptable",'
        'IF(B32<2,"Normal","Prime elevee")),"-")')

    # ROE — ligne 33
    lbl(33, 'A', "ROE — Return on Equity (%)  [= RN / Capitaux Propres x 100]")
    calc(33, 'B', '=IFERROR(F12*1000000/B26*100,"")', '0.00')
    ws.write(row(33), col('C'), "> 10% = bon", F_INPUT_C)
    calc_c(33, 'D',
        '=IFERROR(IF(B33>=15,"Excellent",'
        'IF(B33>=10,"Bon",'
        'IF(B33>=5,"Moyen","Faible"))),"-")')

    # RVC — ligne 34
    lbl(34, 'A', "RVC — PER x PBR (Lynch)  [= PER x PBR]")
    calc(34, 'B', '=IFERROR(B30*B32,"")', '0.00')
    ws.write(row(34), col('C'), "< 22 = decote", F_INPUT_C)
    calc_c(34, 'D',
        '=IFERROR(IF(B34<22,"Decote globale (achat possible)","Surevaluation"),"-")')

    blank(35)

    # Conditional formatting for A4 ratio signals (col D, rows 30-34)
    sig_fmt_g = wb.add_format({'bg_color': '#D1FAE5', 'font_color': '#065F46', 'border': 1, 'align': 'center', 'font_size': 9})
    sig_fmt_r = wb.add_format({'bg_color': '#FEE2E2', 'font_color': '#991B1B', 'border': 1, 'align': 'center', 'font_size': 9})
    sig_fmt_a = wb.add_format({'bg_color': '#FEF3C7', 'font_color': '#92400E', 'border': 1, 'align': 'center', 'font_size': 9})
    for kw in ['Sous-evalue', 'sous-evaluee', 'Decote', 'Excellent', 'Bon', 'SURVENTE']:
        ws.conditional_format('D30:D34', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_g})
    for kw in ['Surevalue', 'surevaluee', 'Prime', 'Faible', 'SURACHAT']:
        ws.conditional_format('D30:D34', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_r})
    for kw in ['Normal', 'Moyen']:
        ws.conditional_format('D30:D34', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_a})

    # ── A5 : Dividendes & Taux de distribution  (lignes 36–44) ──────────────
    section(36, "A5 — DIVIDENDES & TAUX DE DISTRIBUTION")
    heads(37, ["Annee", "Dividende NET recu (FCFA)", "BNPA (FCFA)",
               "Taux distrib. %", "Rendement %", "Progression %"])
    ws.merge_range(row(37)+1, 0, row(37)+1, 5,
        "Dividende NET = montant effectivement recu apres prelevement 15% a la source. "
        "Taux distribution = (Div NET / 0,85) / BNPA x 100  (reconstitution du brut)",
        fmt(bg="#D6E4F7", fg=NAVY, size=10, italic=True, align='left', border=0, wrap=True))
    ws.set_row(row(37)+1, 25)
    # Décalage : les vraies données commencent à la ligne 39 maintenant
    for i, annee in enumerate(["N-4","N-3","N-2","N-1","N"]):
        r = 39 + i
        lbl(r, 'A', annee)
        inp_s(r, 'B', num_format='#,##0.00')  # Dividende NET (saisie)
        inp_s(r, 'C', num_format='#,##0.00')  # BNPA (saisie)
        # D = taux distribution = (Div NET / 0.85) / BNPA * 100
        calc(r, 'D', f'=IFERROR((B{r}/0.85)/C{r}*100,"")', '0.00')
        # E = rendement dividend yield (sur prix actuel B24)
        calc(r, 'E', f'=IFERROR(B{r}/B24*100,"")', '0.00')
        # F = progression vs annee precedente
        if i == 0:
            ws.write_blank(row(r), col('F'), None, F_WHITE)
        else:
            calc(r, 'F', f'=IFERROR((B{r}-B{r-1})/ABS(B{r-1})*100,"")', '0.00')
    # Ligne 44 : totaux
    lbl(44, 'A', "TOTAL / MOYENNE", bold=True)
    ws.write_formula(row(44), col('B'), '=SUM(B39:B43)', F_CALC_N2)
    ws.write_blank(row(44), col('C'), None, F_WHITE)
    ws.write_formula(row(44), col('D'), '=IFERROR(AVERAGE(D39:D43),"")', F_CALC_PCT)
    ws.write_formula(row(44), col('E'), '=IFERROR(AVERAGE(E39:E43),"")', F_CALC_PCT)
    ws.write_blank(row(44), col('F'), None, F_WHITE)
    blank(45)

    # ── A6 : Fonds Propres  (lignes 45–53) ──────────────────────────────────
    section(45, "A6 — FONDS PROPRES (FCFA)")
    heads(46, ["Composante", "Annee N-1", "Annee N", "Variation %"])
    fp_items = ["Capital souscrit", "Reserves", "Report a nouveau",
                "Resultat Net", "Dividendes verses"]
    for i, item in enumerate(fp_items):
        r = 47 + i
        lbl(r, 'A', item)
        inp_s(r, 'B', num_format='#,##0')
        inp_s(r, 'C', num_format='#,##0')
        calc(r, 'D', f'=IFERROR((C{r}-B{r})/ABS(B{r})*100,"")', '0.00')
    # Total ligne 52
    lbl(52, 'A', "TOTAL FONDS PROPRES", bold=True)
    ws.write_formula(row(52), col('B'), '=SUM(B47:B51)', F_CALC_N)
    ws.write_formula(row(52), col('C'), '=SUM(C47:C51)', F_CALC_N)
    ws.write_formula(row(52), col('D'), '=IFERROR((C52-B52)/ABS(B52)*100,"")', F_CALC_PCT)
    blank(53)

    # ── A7 : Notation & Activités récentes  (lignes 54–60) ──────────────────
    section(54, "A7 — NOTATION FINANCIERE & ACTIVITES RECENTES")
    heads(55, ["Indicateur", "Valeur", "Source", "Date rapport"])
    nota_items = [
        ("Notation court terme", "A1", "Agence de notation", ""),
        ("Notation long terme",  "A+", "Agence de notation", ""),
        ("Variation CA/PNB (dernier trimestre)", "", "RichBourse", ""),
        ("Variation Resultat Net (dernier trimestre)", "", "RichBourse", ""),
    ]
    for i, (lbl_txt, val, src, dt) in enumerate(nota_items):
        r = 56 + i
        lbl(r, 'A', lbl_txt)
        ws.write(row(r), col('B'), val or None, F_INPUT_S)
        ws.write(row(r), col('C'), src, F_WHITE_C)
        ws.write(row(r), col('D'), dt or None, F_WHITE_C)
    blank(60)

    # ── A8 : Comparaison Marché vs Épargne  (lignes 61–76) ──────────────────
    section(61, "A8 — COMPARAISON MARCHE BOURSIER VS EPARGNE")
    heads(62, ["Parametre", "Marche Boursier", "Epargne (saisir rendement %)", ""])

    comp_items = [
        ("Montant investi (FCFA)",                    None,  '#,##0'),
        ("Prix d'achat historique (FCFA)",            None,  '#,##0'),
        ("CMP = Prix x 1,014 (frais 1,4%)",          None,  '#,##0.00'),
        ("Nombre de titres acquis",                   None,  '#,##0.00'),
        ("Prix actuel du titre (FCFA)",               None,  '#,##0'),
        ("Prix net apres taxe cession 1,4% (FCFA)",  None,  '#,##0.00'),
        ("Plus-value unitaire (FCFA)",                None,  '#,##0.00'),
        ("Plus-value totale (FCFA)",                  None,  '#,##0'),
        ("Total dividendes recus par titre (FCFA)",   None,  '#,##0.00'),
        ("Rendement dividendes total (FCFA)",         None,  '#,##0'),
        ("RENDEMENT TOTAL (FCFA)",                    None,  '#,##0'),
        ("PERFORMANCE (%)",                           None,  '0.00'),
        ("VERDICT",                                   None,  '@'),
    ]

    COMP_ROWS = {}
    for i, (lbl_txt, _, nf) in enumerate(comp_items):
        r = 63 + i
        lbl(r, 'A', lbl_txt, bold=(lbl_txt.startswith("REND") or lbl_txt.startswith("PERF") or lbl_txt.startswith("VERD")))
        ws.write_blank(row(r), col('B'), None, fmt(bg=LORANGE, fg=DARK, size=11, align='right', border=1, num_format=nf, locked=False))
        ws.write_blank(row(r), col('C'), None, F_WHITE_R)
        ws.write_blank(row(r), col('D'), None, F_WHITE)
        COMP_ROWS[lbl_txt] = r

    # Lignes de référence
    INV_R  = COMP_ROWS["Montant investi (FCFA)"]
    ACH_R  = COMP_ROWS["Prix d'achat historique (FCFA)"]
    CMP_R  = COMP_ROWS["CMP = Prix x 1,014 (frais 1,4%)"]
    TIT_R  = COMP_ROWS["Nombre de titres acquis"]
    PCR_R  = COMP_ROWS["Prix actuel du titre (FCFA)"]
    NET_R  = COMP_ROWS["Prix net apres taxe cession 1,4% (FCFA)"]
    PVU_R  = COMP_ROWS["Plus-value unitaire (FCFA)"]
    PVT_R  = COMP_ROWS["Plus-value totale (FCFA)"]
    DVD_R  = COMP_ROWS["Total dividendes recus par titre (FCFA)"]
    RDT_R  = COMP_ROWS["Rendement dividendes total (FCFA)"]
    TOT_R  = COMP_ROWS["RENDEMENT TOTAL (FCFA)"]
    PER_C  = COMP_ROWS["PERFORMANCE (%)"]
    VER_R  = COMP_ROWS["VERDICT"]

    def set_formula_comp(r, formula, nf):
        ws.write_formula(row(r), col('B'), formula,
                         fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format=nf))

    set_formula_comp(CMP_R, f'=IFERROR(B{ACH_R}*1.014,"")',          '#,##0.00')
    set_formula_comp(TIT_R, f'=IFERROR(B{INV_R}/B{CMP_R},"")',       '#,##0.00')
    set_formula_comp(PCR_R, '=IFERROR(B24,"")',                       '#,##0')
    set_formula_comp(NET_R, f'=IFERROR(B{PCR_R}-(B{PCR_R}*0.014),"")','#,##0.00')
    set_formula_comp(PVU_R, f'=IFERROR(B{NET_R}-B{CMP_R},"")',       '#,##0.00')
    set_formula_comp(PVT_R, f'=IFERROR(B{PVU_R}*B{TIT_R},"")',       '#,##0')
    set_formula_comp(RDT_R, f'=IFERROR(B{DVD_R}*B{TIT_R},"")',       '#,##0')
    set_formula_comp(TOT_R, f'=IFERROR(B{PVT_R}+B{RDT_R},"")',       '#,##0')
    set_formula_comp(PER_C, f'=IFERROR(B{TOT_R}/B{INV_R}*100,"")',   '0.00')
    ws.write_formula(row(VER_R), col('B'),
        f'=IFERROR(IF(B{PER_C}>C{PER_C},"MARCHE BOURSIER","EPARGNE"),"Saisir les donnees")',
        fmt(bg="#E2EFDA", fg="#1F3864", size=10, bold=True, align='center', border=1))
    ws.write(row(VER_R), col('C'),
        "<-- Saisir rendement epargne % ici", F_HINT)

    blank(76)

    # ── A9 : Conclusion Fondamentale  (lignes 77–79) ─────────────────────────
    section(77, "A9 — CONCLUSION ANALYSE FONDAMENTALE (texte libre)")
    ws.merge_range(row(78), 0, row(80), 7, "", fmt(bg=WHITE, border=1, wrap=True, valign='top', locked=False))
    ws.set_row(row(78), 40)
    blank(81)

    # ─────────────────────────────────────────────────────────────────────────
    #  BLOC B — ANALYSE TECHNIQUE (lignes 82–138)
    # ─────────────────────────────────────────────────────────────────────────
    ws.merge_range(row(82)-1, 0, row(82)-1, 7, "B — ANALYSE TECHNIQUE", F_TITLE)
    ws.set_row(row(82)-1, 22)
    blank(83)

    # ── B1 : Indicateurs techniques  (lignes 84–92) ──────────────────────────
    section(84, "B1 — INDICATEURS TECHNIQUES (saisie depuis graphique)")
    heads(85, ["Indicateur", "Signal observe", "Valeur / Niveau", "Score auto", "Reference"])
    tech_items = [
        ("Moyenne Mobile 20 jours (MM20)",
         "Zone de survente : cours EN DESSOUS de la MM20"),
        ("Bandes de Bollinger",
         "Zone de survente : cours touche la bande inferieure"),
        ("MACD",
         "Zone de survente : MACD croise Signal a la hausse"),
        ("RSI (saisir valeur en col C)",
         "< 30 survente | 30-70 neutre | > 70 surachat"),
        ("Volume (tendance recente)",
         "Volume croissant sur baisse = accumulation = survente"),
    ]
    for i, (ind, ref) in enumerate(tech_items):
        r = 86 + i
        lbl(r, 'A', ind)
        ws.write(row(r), col('B'), "<-- Saisir signal", F_HINT)
        ws.write_blank(row(r), col('C'), None, F_WHITE_R)
        # D = score auto : +1 si 'survente', -1 si 'surachat', 0 sinon
        ws.write_formula(row(r), col('D'),
            f'=IFERROR(IF(ISNUMBER(SEARCH("survente",B{r})),1,'
            f'IF(ISNUMBER(SEARCH("surachat",B{r})),-1,0)),0)',
            fmt(bg="#E2EFDA", fg="#404040", size=11, align='center', border=1, num_format='0'))
        ws.write(row(r), col('E'), ref, F_REF)

    # Ligne 91 : Score total
    lbl(91, 'A', "SCORE TECHNIQUE (max +5 / min -5)", bold=True)
    ws.write_blank(row(91), col('B'), None, F_WHITE)
    ws.write_blank(row(91), col('C'), None, F_WHITE)
    ws.write_formula(row(91), col('D'), '=SUM(D86:D90)',
                     fmt(bg="#E2EFDA", fg="#1F3864", size=10, bold=True, align='center', border=1, num_format='0'))
    ws.write_formula(row(91), col('E'),
        '=IFERROR(IF(D91>0,"Zone SURVENTE - Achat possible",'
        'IF(D91<0,"Zone SURACHAT - Vente possible","NEUTRE")),"-")',
        fmt(bg="#E2EFDA", fg="#1F3864", size=11, bold=True, align='center', border=1))
    blank(92)

    # ── B2 : Prix Médians  (lignes 93–97) ────────────────────────────────────
    section(93, "B2 — PRIX MEDIANS (PM)")
    heads(94, ["Horizon", "Plus Haut (FCFA)", "Plus Bas (FCFA)", "Prix Median",
               "Signal (vs prix actuel B24)"])
    pm_items = ["52 semaines (1 an)", "2 ans"]
    for i, horizon in enumerate(pm_items):
        r = 95 + i
        lbl(r, 'A', horizon)
        inp_s(r, 'B', num_format='#,##0')
        inp_s(r, 'C', num_format='#,##0')
        calc(r, 'D', f'=IFERROR((B{r}+C{r})/2,"")', '#,##0.00')
        calc_c(r, 'E',
            f'=IFERROR(IF(B24<D{r},"EN DESSOUS du PM - Survente",'
            f'"AU-DESSUS du PM - Surachat"),"-")')
    blank(97)

    # ── B3 : PER Actualisé  (lignes 98–105) ──────────────────────────────────
    section(98, "B3 — PER ACTUALISE (integre la derniere evolution du RN)")
    heads(99, ["Parametre", "Valeur", "Source / Formule", "Signal"])
    per_act_items = [
        ("Prix actuel (FCFA)",                 f"=B24",          "#,##0",    "Lie a B24"),
        ("BNPA N (FCFA)",                      f"=B25",          "#,##0.00", "Lie a B25"),
        ("Evolution RN dernier trimestre (%)", None,             "0.00",     "RichBourse / Rapport trimestriel"),
        ("BNPA actualise (FCFA)",              None,             "#,##0.00", "= BNPA x (1 + evol%)"),
        ("PER actualise",                      None,             "0.00",     "= Prix / BNPA actualise"),
    ]
    per_act_rows = {}
    for i, (lbl_txt, formula, nf, src) in enumerate(per_act_items):
        r = 100 + i
        lbl(r, 'A', lbl_txt)
        if formula:
            ws.write_formula(row(r), col('B'), formula,
                             fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format=nf))
        else:
            ws.write_blank(row(r), col('B'), None,
                           fmt(bg=LORANGE, fg=DARK, size=11, align='right', border=1, num_format=nf, locked=False))
        ws.write(row(r), col('C'), src, F_WHITE_C)
        ws.write_blank(row(r), col('D'), None, F_WHITE)
        per_act_rows[lbl_txt] = r

    EVOL_R = per_act_rows["Evolution RN dernier trimestre (%)"]
    BACT_R = per_act_rows["BNPA actualise (FCFA)"]
    PACT_R = per_act_rows["PER actualise"]

    # Formules BNPA actualisé et PER actualisé
    ws.write_formula(row(BACT_R), col('B'),
        f'=IFERROR(B25*(1+B{EVOL_R}/100),"")',
        fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='#,##0.00'))
    ws.write_formula(row(PACT_R), col('B'),
        f'=IFERROR(B24/B{BACT_R},"")',
        fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='0.00'))
    # Signal PER actualisé
    ws.write_formula(row(PACT_R), col('D'),
        f'=IFERROR(IF(B{PACT_R}>15,"Surevalue - Surachat",'
        f'IF(B{PACT_R}<9,"Sous-evalue - Survente","Normal (9-15)")),"-")',
        F_CALC_C)
    blank(105)

    # ── B4 : Prix Cible aux Dividendes  (lignes 106–117) ─────────────────────
    section(106, "B4 — PRIX CIBLE AUX DIVIDENDES (PCD)")
    ws.merge_range(row(107), 0, row(107), 7,
        "Note : Le PCD n'est pertinent que si l'entreprise verse des dividendes. "
        "Si dividende = 0, utiliser B5 (Gordon-Shapiro).", F_NOTE)
    ws.set_row(row(107), 25)
    heads(108, ["Parametre", "Valeur", "Formule", "Signal"])

    pcd_items = [
        ("Evolution RN (%)",                    None,  "0.00",     "Meme valeur qu'en B3"),
        ("Dividende brut N (FCFA)",             None,  "#,##0.00", "<-- Saisir le dernier dividende verse"),
        ("Dividende previsionnel (FCFA)",       None,  "#,##0.00", "= Dividende x (1 + evol%)"),
        ("Rendement sectoriel BRVM (%)",        6.5,   "0.00",     "Reference : 5-8% (modifiable)"),
        ("PCD = 100 x DVD_prev / Rendement",   None,  "#,##0.00", "= 100 x Dprev / Rendement%"),
        ("Zone cible basse (-5%)",              None,  "#,##0.00", "= PCD x 0.95"),
        ("Zone cible haute (+5%)",              None,  "#,##0.00", "= PCD x 1.05"),
        ("Signal (prix B24 vs zone cible)",     None,  "@",        "Calcul automatique"),
    ]
    pcd_rows = {}
    for i, (lbl_txt, val, nf, src) in enumerate(pcd_items):
        r = 109 + i
        lbl(r, 'A', lbl_txt)
        if val is not None:
            ws.write(row(r), col('B'), val,
                     fmt(bg=LORANGE, fg=DARK, size=11, align='right', border=1, num_format=nf, locked=False))
        else:
            ws.write_blank(row(r), col('B'), None,
                           fmt(bg=LORANGE, fg=DARK, size=11, align='right', border=1, num_format=nf, locked=False))
        ws.write(row(r), col('C'), src, F_WHITE_C)
        ws.write_blank(row(r), col('D'), None, F_WHITE)
        pcd_rows[lbl_txt] = r

    EVOL_PCD = pcd_rows["Evolution RN (%)"]
    DVD_N    = pcd_rows["Dividende brut N (FCFA)"]
    DVD_PRV  = pcd_rows["Dividende previsionnel (FCFA)"]
    REND_S   = pcd_rows["Rendement sectoriel BRVM (%)"]
    PCD_V    = pcd_rows["PCD = 100 x DVD_prev / Rendement"]
    ZBAS     = pcd_rows["Zone cible basse (-5%)"]
    ZHAU     = pcd_rows["Zone cible haute (+5%)"]
    SIG_PCD  = pcd_rows["Signal (prix B24 vs zone cible)"]

    F_CALC_PCD = fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='#,##0.00')

    ws.write_formula(row(DVD_PRV), col('B'),
        f'=IFERROR(IF(B{DVD_N}=0,"Aucun dividende",B{DVD_N}*(1+B{EVOL_PCD}/100)),"")',
        F_CALC_PCD)
    ws.write_formula(row(PCD_V), col('B'),
        f'=IFERROR(IF(B{DVD_N}=0,"N/A",100*B{DVD_PRV}/B{REND_S}),"")',
        F_CALC_PCD)
    ws.write_formula(row(ZBAS), col('B'),
        f'=IFERROR(IF(ISNUMBER(B{PCD_V}),B{PCD_V}*0.95,"N/A"),"")',
        F_CALC_PCD)
    ws.write_formula(row(ZHAU), col('B'),
        f'=IFERROR(IF(ISNUMBER(B{PCD_V}),B{PCD_V}*1.05,"N/A"),"")',
        F_CALC_PCD)
    ws.write_formula(row(SIG_PCD), col('B'),
        f'=IFERROR(IF(NOT(ISNUMBER(B{PCD_V})),"PCD N/A - pas de dividende",'
        f'IF(B24<B{ZBAS},"EN DESSOUS zone cible - Survente",'
        f'IF(B24>B{ZHAU},"AU-DESSUS zone cible - Surachat","DANS LA ZONE CIBLE"))),"")',
        fmt(bg="#E2EFDA", fg="#1F3864", size=11, bold=True, align='center', border=1))
    blank(117)

    # ── B5 : Gordon-Shapiro  (lignes 118–127) ────────────────────────────────
    section(118, "B5 — MODELE DE GORDON-SHAPIRO   P0 = D1 / (r - g)")
    ws.merge_range(row(119), 0, row(119), 7,
        "D1 = dividende attendu l'an prochain | r = taux exige | g = taux croissance dividendes",
        fmt(bg="#D6E4F7", fg="#1F3864", size=11, italic=True, align='center', border=0))
    heads(120, ["Parametre", "Valeur", "Note", "Signal"])

    gs_items = [
        ("D1 - Dividende attendu (FCFA)",      None, "#,##0.00", "<-- Hypothese ou dernier DVD x (1+g)"),
        ("r - Taux de rentabilite exige (%)",  8.0,  "0.00",     "Cout du capital / rendement cible (ex: 8%)"),
        ("g - Taux de croissance DVD (%)",     2.0,  "0.00",     "Croissance annuelle supposee (ex: 2%)"),
        ("P0 = D1 / (r - g)  [FCFA]",         None, "#,##0.00", "Prix theorique calcule automatiquement"),
        ("Signal prix actuel vs P0",           None, "@",        "Calcul automatique"),
    ]
    gs_rows = {}
    for i, (lbl_txt, val, nf, note) in enumerate(gs_items):
        r = 121 + i
        lbl(r, 'A', lbl_txt)
        if val is not None:
            ws.write(row(r), col('B'), val,
                     fmt(bg=LORANGE, fg=DARK, size=11, align='right', border=1, num_format=nf, locked=False))
        else:
            ws.write_blank(row(r), col('B'), None,
                           fmt(bg=LORANGE, fg=DARK, size=11, align='right', border=1, num_format=nf, locked=False))
        ws.write(row(r), col('C'), note, F_WHITE_C)
        ws.write_blank(row(r), col('D'), None, F_WHITE)
        gs_rows[lbl_txt] = r

    D1_R  = gs_rows["D1 - Dividende attendu (FCFA)"]
    R_R   = gs_rows["r - Taux de rentabilite exige (%)"]
    G_R   = gs_rows["g - Taux de croissance DVD (%)"]
    P0_R  = gs_rows["P0 = D1 / (r - g)  [FCFA]"]
    SG_R  = gs_rows["Signal prix actuel vs P0"]

    ws.write_formula(row(P0_R), col('B'),
        f'=IFERROR(IF(B{D1_R}=0,"Saisir D1",B{D1_R}/((B{R_R}/100)-(B{G_R}/100))),"")',
        fmt(bg="#E2EFDA", fg="#1F3864", size=10, bold=True, align='right', border=1, num_format='#,##0.00'))
    ws.write_formula(row(SG_R), col('B'),
        f'=IFERROR(IF(NOT(ISNUMBER(B{P0_R})),"Saisir D1",'
        f'IF(B24<B{P0_R}*0.95,"Prix SOUS P0 - Opportunite achat",'
        f'IF(B24>B{P0_R}*1.05,"Prix SUR P0 - Surevalue","Dans la zone P0"))),"")',
        fmt(bg="#E2EFDA", fg="#1F3864", size=11, bold=True, align='center', border=1))
    blank(127)

    # ── B6 : Stop-Loss & Risk/Reward  (lignes 128–135) ───────────────────────
    section(128, "B6 — GESTION DU RISQUE : STOP-LOSS & RISK/REWARD")
    heads(129, ["Parametre", "Valeur", "Formule/Note", "Signal"])

    sl_items = [
        ("Prix d'achat vise (FCFA)",             None, "#,##0",    "<-- Saisir prix entree prevue"),
        ("Stop-Loss = Prix x 0,90 (FCFA)",       None, "#,##0.00", "= Prix x 0.90 (perte max 10%)"),
        ("Objectif Take Profit (FCFA)",          None, "#,##0",    "<-- Saisir objectif de prix"),
        ("Perte potentielle / titre (FCFA)",     None, "#,##0.00", "= Prix - Stop"),
        ("Gain potentiel / titre (FCFA)",        None, "#,##0.00", "= Objectif - Prix"),
        ("Ratio Risk / Reward",                  None, "0.00",     "= Gain / Perte  (objectif >= 2)"),
    ]
    sl_rows = {}
    for i, (lbl_txt, _, nf, note) in enumerate(sl_items):
        r = 130 + i
        lbl(r, 'A', lbl_txt)
        ws.write_blank(row(r), col('B'), None,
                       fmt(bg=LORANGE, fg=DARK, size=11, align='right', border=1, num_format=nf, locked=False))
        ws.write(row(r), col('C'), note, F_WHITE_C)
        ws.write_blank(row(r), col('D'), None, F_WHITE)
        sl_rows[lbl_txt] = r

    PA_R  = sl_rows["Prix d'achat vise (FCFA)"]
    SL_R  = sl_rows["Stop-Loss = Prix x 0,90 (FCFA)"]
    TP_R  = sl_rows["Objectif Take Profit (FCFA)"]
    PP_R  = sl_rows["Perte potentielle / titre (FCFA)"]
    GP_R  = sl_rows["Gain potentiel / titre (FCFA)"]
    RR_R  = sl_rows["Ratio Risk / Reward"]

    ws.write_formula(row(SL_R), col('B'), f'=IFERROR(B{PA_R}*0.90,"")',
                     fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='#,##0.00'))
    ws.write_formula(row(PP_R), col('B'), f'=IFERROR(B{PA_R}-B{SL_R},"")',
                     fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='#,##0.00'))
    ws.write_formula(row(GP_R), col('B'), f'=IFERROR(B{TP_R}-B{PA_R},"")',
                     fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='#,##0.00'))
    ws.write_formula(row(RR_R), col('B'), f'=IFERROR(B{GP_R}/B{PP_R},"")',
                     fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='0.00'))
    ws.write_formula(row(RR_R), col('D'),
        f'=IFERROR(IF(B{RR_R}>=2,"Bon (>= 2:1)",IF(B{RR_R}>=1,"Acceptable (1:1)","Mauvais")),"")',
        F_CALC_C)
    blank(136)

    # ── B7 : Conclusion Technique  (lignes 137–140) ────────────────────────
    section(137, "B7 — CONCLUSION ANALYSE TECHNIQUE (texte libre)")
    ws.merge_range(row(138), 0, row(140), 7, "",
                   fmt(bg=WHITE, border=1, wrap=True, valign='top', locked=False))
    ws.set_row(row(138), 40)

    blank(141)
    ws.merge_range(row(142)-1, 0, row(142)-1, 7, "C — ANALYSE CONTRARIAN & OPPORTUNITES DE MARCHE", F_TITLE)
    ws.set_row(row(142)-1, 26)
    blank(143)

    # ── C1 : Normalisation du Résultat Net  (lignes 144–156) ─────────────────
    section(144, "C1 — NORMALISATION DU RESULTAT NET  (recurrent vs exceptionnel)")
    ws.merge_range(row(145), 0, row(145), 7,
        "Saisir les elements exceptionnels (positifs = booste le RN, negatifs = penalise le RN). "
        "Un mauvais RN publie mais un RN recurrent positif = opportunite contrarian.",
        fmt(bg="#D6E4F7", fg=NAVY, size=11, italic=True, align='left', border=0, wrap=True))
    ws.set_row(row(145), 30)
    heads(146, ["Annee", "RN Publie (M FCFA)", "Dont Exceptionnel (M FCFA)", "RN Recurrent (M FCFA)", "Marge Recurrente %"])
    rn_cols_c = ['B','C','D','E','F']
    ca_cols_c = ['B','C','D','E','F']
    for i, annee in enumerate(["N-4","N-3","N-2","N-1","N"]):
        r = 147 + i
        lbl(r, 'A', annee)
        ws.write_formula(row(r), col('B'), f'={rn_cols_c[i]}12', F_CALC_N)
        inp_s(r, 'C', num_format='#,##0')
        calc(r, 'D', f'=IFERROR(B{r}-C{r},"")', '#,##0')
        calc(r, 'E', f'=IFERROR(D{r}/{ca_cols_c[i]}8*100,"")', '0.00')
    blank(152)
    lbl(153, 'A', "BNPA Recurrent N (FCFA)")
    calc(153, 'B', '=IFERROR(D151*1000000/B28,"")', '#,##0.00')
    ws.write(row(153), col('C'), "PER Normalise", F_LBL)
    calc(153, 'D', '=IFERROR(B24/B153,"")', '0.00')
    calc_c(153, 'E', '=IFERROR(IF(D153>15,"PER normalise eleve",IF(D153<9,"Sous-evalue normalise","Normal (9-15)")),"-")')
    lbl(154, 'A', "Signal Normalisation RN")
    calc_c(154, 'B',
        '=IFERROR(IF(C151<0,"Mauvais resultat PONCTUEL — RN recurrent > RN publie — opportunite contrarian potentielle",'
        'IF(C151>0,"Resultat FLATTE par elements exceptionnels — prudence sur la valorisation",'
        '"Pas d\'element exceptionnel detecte — RN publie = RN recurrent")),"-")')
    blank(155)

    # ── C2 : Comparaison Sectorielle BRVM  (lignes 156–165) ──────────────────
    section(156, "C2 — COMPARAISON SECTORIELLE BRVM")
    heads(157, ["Parametre", "Valeur", "Reference marche", "Ecart %", "Signal"])
    lbl(158, 'A', "PER sectoriel moyen BRVM (reference)")
    ws.write_formula(row(158), col('B'),
        '=IFERROR(CHOOSE(MATCH(PROFIL!B5,{"Banque","Assurance","Industrie","Distribution","Telecom","Autre"},0),10,12,13,14,8,12),12)',
        fmt(bg=LGREEN, fg=DARK, size=11, align='right', border=1, num_format='0.00'))
    hint(158, 'C', "<-- Auto depuis PROFIL!B5 | Banque~10, Industrie~13, Distribution~14, Telecom~8", 'G')
    lbl(159, 'A', "Rendement dividende sectoriel BRVM (%)")
    inp(159, 'B', val=5.0, num_format='0.00')
    hint(159, 'C', "<-- Marche BRVM: 4 - 6% en moyenne", 'G')
    blank(160)
    lbl(161, 'A', "PER action vs sectoriel")
    ws.write_formula(row(161), col('B'), '=IFERROR(B30,"")',
                     fmt(bg=LGREEN, fg=DARK, size=11, align='right', border=1, num_format='0.00'))
    ws.write_formula(row(161), col('C'), '=B158', F_WHITE_R)
    calc(161, 'D', '=IFERROR((B30/B158-1)*100,"")', '0.00')
    calc_c(161, 'E',
        '=IFERROR(IF((B30/B158-1)*100<=-20,"Forte decote sectorielle — opportunite",'
        'IF((B30/B158-1)*100<=-5,"Legere decote sectorielle",'
        'IF((B30/B158-1)*100<=15,"Dans la norme sectorielle","Prime elevee vs secteur — prudence"))),"-")')
    lbl(162, 'A', "Rendement div. action vs sectoriel")
    ws.write_formula(row(162), col('B'), '=IFERROR(AVERAGE(E39:E43),"")',
                     fmt(bg=LGREEN, fg=DARK, size=11, align='right', border=1, num_format='0.00'))
    ws.write_formula(row(162), col('C'), '=B159', F_WHITE_R)
    calc(162, 'D', '=IFERROR((AVERAGE(E39:E43)/B159-1)*100,"")', '0.00')
    calc_c(162, 'E',
        '=IFERROR(IF(AVERAGE(E39:E43)>=B159*1.2,"Rendement superieur au marche — attractif",'
        'IF(AVERAGE(E39:E43)>=B159,"Dans la moyenne du marche","Rendement inferieur au marche")),"-")')
    blank(163)

    # ── C3 : Fiabilité du Dividende  (lignes 164–170) ─────────────────────────
    section(164, "C3 — FIABILITE DU DIVIDENDE (5 ANS)")
    heads(165, ["Indicateur", "Valeur", "Interpretation", "Score /3"])
    lbl(166, 'A', "Nb annees avec dividende verse (sur 5)")
    calc(166, 'B', '=COUNTIF(B39:B43,">0")', '0')
    calc_c(166, 'C',
        '=IFERROR(IF(B166=5,"Regulier 5/5 — fiable",'
        'IF(B166>=4,"Quasi-regulier 4/5",'
        'IF(B166>=3,"Irregulier 3/5","Tres irregulier — risque dividende"))),"-")')
    calc(166, 'D', '=IF(B166=5,2,IF(B166>=4,1,0))', '0')
    lbl(167, 'A', "CAGR dividende 5 ans (croissance annuelle)")
    calc(167, 'B', '=IFERROR(IF(OR(B39<=0,B43<=0),"N/A",(B43/B39)^(1/4)-1),"N/A")', '0.00%')
    calc_c(167, 'C',
        '=IFERROR(IF(NOT(ISNUMBER(B167)),"Dividende absent",'
        'IF(B167>0.05,"Forte croissance dividende",'
        'IF(B167>0,"Croissance modeste","Dividende en baisse"))),"-")')
    calc(167, 'D', '=IFERROR(IF(ISNUMBER(B167),IF(B167>0,1,0),0),0)', '0')
    lbl(168, 'A', "SCORE FIABILITE DIVIDENDE", bold=True)
    ws.write_formula(row(168), col('B'), '=IFERROR(D166+D167,0)',
                     fmt(bg=LGREEN, fg=DARK, size=10, bold=True, align='center', border=1, num_format='0'))
    calc_c(168, 'C',
        '=IFERROR(IF(D166+D167>=3,"Dividende tres fiable",'
        'IF(D166+D167>=2,"Dividende assez fiable","Dividende peu fiable — risque")),"-")')
    ws.write(row(168), col('D'), "/3", F_WHITE_C)
    blank(169)

    # ── C4 : Score Contrarian BRVM  (lignes 170–182) ─────────────────────────
    section(170, "C4 — SCORE CONTRARIAN BRVM  (detecteur : fondamentaux OK + titre boude par le marche)")
    heads(171, ["Critere", "Signal", "Detail", "Score"])

    cont_items = []
    # C4.1
    r = 172
    lbl(r, 'A', "PER action < PER sectoriel (action moins chere que le marche)")
    calc_c(r, 'B', f'=IFERROR(IF(B30<B158,"OUI","NON"),"-")')
    calc_c(r, 'C', f'=IFERROR("PER="&ROUND(B30,1)&" vs sectoriel="&B158,"-")')
    calc(r, 'D', f'=IFERROR(IF(B30<B158*0.85,2,IF(B30<B158,1,0)),0)', '0')
    cont_items.append(r)
    # C4.2
    r = 173
    lbl(r, 'A', "Prix actuel < VMC (decote sur valeur comptable)")
    calc_c(r, 'B', f'=IFERROR(IF(B24<B31,"OUI — decote comptable","NON"),"-")')
    calc_c(r, 'C', f'=IFERROR("Prix="&B24&" FCFA  vs VMC="&ROUND(B31,0)&" FCFA","-")')
    calc(r, 'D', f'=IFERROR(IF(B24<B31*0.85,2,IF(B24<B31,1,0)),0)', '0')
    cont_items.append(r)
    # C4.3
    r = 174
    lbl(r, 'A', "ROE >= 10% (rentabilite correcte malgre sentiment negatif)")
    calc_c(r, 'B', f'=IFERROR(IF(B33>=10,"OUI","NON"),"-")')
    calc_c(r, 'C', f'=IFERROR("ROE="&ROUND(B33,1)&"%","-")')
    calc(r, 'D', f'=IFERROR(IF(B33>=15,2,IF(B33>=10,1,0)),0)', '0')
    cont_items.append(r)
    # C4.4
    r = 175
    lbl(r, 'A', "Dividende fiable >= 4 ans sur 5")
    calc_c(r, 'B', f'=IFERROR(IF(B168>=2,"OUI","NON"),"-")')
    ws.write_formula(row(r), col('C'), '=IFERROR(C168,"-")', F_CALC_C)
    calc(r, 'D', f'=IFERROR(MIN(B168,2),0)', '0')
    cont_items.append(r)
    # C4.5
    r = 176
    lbl(r, 'A', "Cours < Prix Median 1 an (survente technique)")
    calc_c(r, 'B', f'=IFERROR(IF(B24<D95,"OUI — survente","NON"),"-")')
    calc_c(r, 'C', f'=IFERROR("Prix="&B24&" FCFA  vs PM1an="&ROUND(D95,0)&" FCFA","-")')
    calc(r, 'D', f'=IFERROR(IF(B24<D95,1,0),0)', '0')
    cont_items.append(r)
    # C4.6
    r = 177
    lbl(r, 'A', "Marge nette moyenne > 5% (profitabilite structurelle)")
    calc_c(r, 'B', f'=IFERROR(IF(G16>=5,"OUI","NON"),"-")')
    calc_c(r, 'C', f'=IFERROR("Marge moy="&ROUND(G16,1)&"%","-")')
    calc(r, 'D', f'=IFERROR(IF(G16>=10,2,IF(G16>=5,1,0)),0)', '0')
    cont_items.append(r)

    # Score total /10
    lbl(178, 'A', "SCORE CONTRARIAN TOTAL (/10)", bold=True)
    ws.write_blank(row(178), col('B'), None, F_WHITE)
    ws.write(row(178), col('C'), "/10", F_WHITE_C)
    ws.write_formula(row(178), col('D'),
        f'=IFERROR(SUM(D{cont_items[0]}:D{cont_items[-1]}),0)',
        fmt(bg=LGREEN, fg=NAVY, size=12, bold=True, align='center', border=2, num_format='0'))

    # Verdict
    F_CONT_STRONG = fmt(bold=True, bg="#064E3B", fg="#ECFDF5", size=12, align='center', border=2)
    F_CONT_WATCH  = fmt(bold=True, bg="#78350F", fg="#FEF3C7", size=12, align='center', border=2)
    F_CONT_NONE   = fmt(bold=True, bg=GREY,     fg=DARK,     size=12, align='center', border=2)
    ws.merge_range(row(179), 0, row(179), 3,
        "VERDICT CONTRARIAN",
        fmt(bold=True, bg=NAVY, fg=WHITE, size=10, align='center', border=1))
    _verdict_fmt = fmt(bold=True, bg="#064E3B", fg="#ECFDF5", size=11, align='center', border=2, wrap=True)
    ws.merge_range(row(179), 4, row(179), 7, "", _verdict_fmt)
    ws.write_formula(row(179), 4,
        '=IFERROR(IF(D178>=7,"FORTE OPPORTUNITE CONTRARIAN — fondamentaux sains, titre boude",'
        'IF(D178>=5,"A SURVEILLER — signaux contrarians partiels",'
        '"PAS DE SIGNAL CONTRARIAN — attendre")),"-")',
        _verdict_fmt)
    ws.set_row(row(179), 30)
    blank(180)

    # ─────────────────────────────────────────────────────────────────────────
    #  BLOC D — DONNEES SOCIETE (depuis PROFIL — lecture seule)  lignes 182–208
    # ─────────────────────────────────────────────────────────────────────────
    blank(181)
    ws.merge_range(row(182), 0, row(182), 7,
        "D — DONNEES SOCIETE  (auto depuis onglet PROFIL — saisir dans PROFIL uniquement)", F_TITLE)
    ws.set_row(row(182), 22)
    blank(183)

    # D1 — Capital & Actionnariat
    section(184, "D1 — CAPITAL & ACTIONNARIAT")
    heads(185, ["Champ", "Valeur (auto depuis PROFIL)", "", "", "", "", "", ""])
    F_D = fmt(bg=LGREEN, fg=DARK, size=11, align='left', border=1)
    F_D_N = fmt(bg=LGREEN, fg=DARK, size=11, align='right', border=1, num_format='#,##0')
    d1 = [
        ("Capital social (FCFA)",          '=IFERROR(PROFIL!B16,"")', F_D_N),
        ("Nombre de titres en circulation", '=IFERROR(PROFIL!B17,"")', F_D_N),
        ("Flottant (%)",                    '=IFERROR(PROFIL!B18,"")', F_D),
        ("Principaux actionnaires",         '=IFERROR(PROFIL!B19,"")', F_D),
    ]
    for i, (lbl_txt, formula, f) in enumerate(d1):
        r = 186 + i
        lbl(r, 'A', lbl_txt)
        ws.write_formula(row(r), col('B'), formula, f)
        for c in ['C','D','E','F','G','H']:
            ws.write_blank(row(r), col(c), None, F_WHITE)
    blank(190)

    # D2 — Liquidité
    section(191, "D2 — LIQUIDITE DU TITRE  (critique sur BRVM)")
    heads(192, ["Champ", "Valeur (auto depuis PROFIL)", "", "", "", "", "", ""])
    d2 = [
        ("Volume moyen journalier (titres)",  '=IFERROR(PROFIL!B22,"")', F_D_N),
        ("Volume moyen journalier (FCFA)",    '=IFERROR(PROFIL!B23,"")', F_D_N),
        ("Frequence de cotation (%)",         '=IFERROR(PROFIL!B24,"")', F_D),
        ("Appreciation liquidite",            '=IFERROR(PROFIL!B25,"")', F_D),
    ]
    for i, (lbl_txt, formula, f) in enumerate(d2):
        r = 193 + i
        lbl(r, 'A', lbl_txt)
        ws.write_formula(row(r), col('B'), formula, f)
        for c in ['C','D','E','F','G','H']:
            ws.write_blank(row(r), col(c), None, F_WHITE)
    blank(197)

    # D3 — Notation & Conformité
    section(198, "D3 — NOTATION & CONFORMITE")
    heads(199, ["Champ", "Valeur (auto depuis PROFIL)", "", "", "", "", "", ""])
    d3 = [
        ("Agence de notation",               '=IFERROR(PROFIL!B28,"")', F_D),
        ("Note court terme",                 '=IFERROR(PROFIL!B29,"")', F_D),
        ("Note long terme",                  '=IFERROR(PROFIL!B30,"")', F_D),
        ("Dividende verse regulierement ?",  '=IFERROR(PROFIL!B31,"")', F_D),
    ]
    for i, (lbl_txt, formula, f) in enumerate(d3):
        r = 200 + i
        lbl(r, 'A', lbl_txt)
        ws.write_formula(row(r), col('B'), formula, f)
        for c in ['C','D','E','F','G','H']:
            ws.write_blank(row(r), col(c), None, F_WHITE)
    blank(204)

    # Conditional formatting for C4 score column
    cf_g = wb.add_format({'bg_color': '#D1FAE5', 'font_color': '#065F46', 'border': 1, 'align': 'center', 'font_size': 9})
    cf_r = wb.add_format({'bg_color': '#FEE2E2', 'font_color': '#991B1B', 'border': 1, 'align': 'center', 'font_size': 9})
    ws.conditional_format('B172:B177', {'type': 'text', 'criteria': 'containing', 'value': 'OUI', 'format': cf_g})
    ws.conditional_format('B172:B177', {'type': 'text', 'criteria': 'containing', 'value': 'NON', 'format': cf_r})

    # Protection : formules verrouillees, cellules orange (saisie) debloquees
    ws.protect(PROTECT_PWD, {
        'select_locked_cells':   True,
        'select_unlocked_cells': True,
        'format_columns':        True,
        'format_rows':           True,
    })


def build_synthese(wb, fmt, F_TITLE, F_TITLE2, F_SEC, F_HEAD,
                   F_LBL, F_LBL_B, F_INPUT_S, F_CALC, F_CALC_B,
                   F_CALC_C, F_WHITE, F_WHITE_C, F_WHITE_N2, F_LORANGE_C):
    ws = wb.add_worksheet("SYNTHESE")
    ws.set_tab_color("#1E3A5F")
    ws.freeze_panes(1, 0)
    ws.set_column(0, 0, 30)
    ws.set_column(1, 1, 16)
    ws.set_column(2, 2, 20)
    ws.set_column(3, 3, 16)
    ws.set_column(4, 4, 20)

    def row(r): return r - 1
    def col(c): return ord(c) - ord('A')

    def title(r, text):
        ws.merge_range(row(r), 0, row(r), 4, text, F_TITLE)
        ws.set_row(row(r), 22)

    def section(r, text, bg="#2F5496"):
        f = fmt(bold=True, bg=bg, fg="#FFFFFF", size=10, border=0)
        ws.merge_range(row(r), 0, row(r), 4, text, f)
        ws.set_row(row(r), 18)

    def heads(r, labels):
        for i, lbl in enumerate(labels):
            ws.write(row(r), i, lbl, F_HEAD)

    def lbl(r, c, text, bold=False):
        ws.write(row(r), col(c), text, F_LBL_B if bold else F_LBL)

    def inp(r, c, val=None):
        ws.write(row(r), col(c), val,
                 fmt(bg=LORANGE, fg=DARK, size=11, align='right', border=1, locked=False))

    def blank_r(r, h=5):
        ws.set_row(row(r), h)

    title(1, "TABLEAU DE BORD — SYNTHESE DE L'ANALYSE")
    ws.merge_range(1, 0, 1, 4, "", F_TITLE2)
    ws.write_formula(1, 0,
        '=IF(PROFIL!B3="","Completer le PROFIL",PROFIL!B3&"  ("&PROFIL!B4&")  |  "&PROFIL!B5&"  |  Prix : "&ETUDE!B24&" FCFA  |  Date : "&IF(ISNUMBER(PROFIL!B6),TEXT(PROFIL!B6,"dd/mm/yyyy"),PROFIL!B6))',
        F_TITLE2)
    ws.set_row(1, 16)
    blank_r(3)

    # Scorecard fondamentale (lignes 4–13)
    section(4, "SCORECARD FONDAMENTALE")
    heads(5, ["Critere", "Valeur (auto depuis ETUDE)", "Zone normale", "Signal (auto)", "Score (0-3)"])
    # (critere, zone, formule_valeur, num_fmt, formule_signal)
    # score_f: 0-3 auto par seuils (max total 24)
    fond_criteria = [
        ("Croissance CA (N/N-4 %)", "> 10%",
         '=IFERROR(ETUDE!G8,"")', '0.00',
         '=IFERROR(IF(ETUDE!G8>=10,"Bon (>=10%)",IF(ETUDE!G8>=0,"Faible (<10%)","Negatif")),"-")',
         '=IFERROR(IF(ETUDE!G8>=15,3,IF(ETUDE!G8>=5,2,IF(ETUDE!G8>=0,1,0))),0)'),
        ("Croissance RN (N/N-4 %)", "> 10%",
         '=IFERROR(ETUDE!G12,"")', '0.00',
         '=IFERROR(IF(ETUDE!G12>=10,"Bon (>=10%)",IF(ETUDE!G12>=0,"Faible (<10%)","Negatif")),"-")',
         '=IFERROR(IF(ETUDE!G12>=15,3,IF(ETUDE!G12>=5,2,IF(ETUDE!G12>=0,1,0))),0)'),
        ("Marge nette moyenne (%)", "> 5%",
         '=IFERROR(ETUDE!G16,"")', '0.00',
         '=IFERROR(IF(ETUDE!G16>=10,"Tres rentable",IF(ETUDE!G16>=5,"Rentable",IF(ETUDE!G16>=2,"Faiblement rentable","Faible"))),"-")',
         '=IFERROR(IF(ETUDE!G16>=10,3,IF(ETUDE!G16>=5,2,IF(ETUDE!G16>=2,1,0))),0)'),
        ("PER", "9 - 15",
         '=IFERROR(ETUDE!B30,"")', '0.00',
         '=IFERROR(ETUDE!D30,"-")',
         '=IFERROR(IF(ETUDE!B30<9,3,IF(ETUDE!B30<=15,2,IF(ETUDE!B30<=20,1,0))),0)'),
        ("PBR", "< 1 ideal",
         '=IFERROR(ETUDE!B32,"")', '0.00',
         '=IFERROR(ETUDE!D32,"-")',
         '=IFERROR(IF(ETUDE!B32<1,3,IF(ETUDE!B32<2,1,0)),0)'),
        ("ROE (%)", "> 10%",
         '=IFERROR(ETUDE!B33,"")', '0.00',
         '=IFERROR(ETUDE!D33,"-")',
         '=IFERROR(IF(ETUDE!B33>=15,3,IF(ETUDE!B33>=10,2,IF(ETUDE!B33>=5,1,0))),0)'),
        ("Rendement dividende (%)", "> 3%",
         '=IFERROR(AVERAGE(ETUDE!E39:ETUDE!E43),"")', '0.00',
         '=IFERROR(IF(AVERAGE(ETUDE!E39:ETUDE!E43)>=3,"Bon (>=3%)","Faible (<3%)"),"-")',
         '=IFERROR(IF(AVERAGE(ETUDE!E39:ETUDE!E43)>=6,3,IF(AVERAGE(ETUDE!E39:ETUDE!E43)>=3,2,IF(AVERAGE(ETUDE!E39:ETUDE!E43)>=1,1,0))),0)'),
        ("RVC (PER x PBR)", "< 22",
         '=IFERROR(ETUDE!B34,"")', '0.00',
         '=IFERROR(ETUDE!D34,"-")',
         '=IFERROR(IF(ETUDE!B34<10,3,IF(ETUDE!B34<22,2,IF(ETUDE!B34<30,1,0))),0)'),
    ]
    F_VAL_AUTO  = fmt(bg="#EBF5FB", fg="#1F3864", size=11, align='right', border=1)
    F_SIG_AUTO  = fmt(bg="#EBF5FB", fg="#404040", size=11, italic=True, align='center', border=1)
    F_SCORE_AUTO = fmt(bg=LGREEN, fg="#1F3864", size=11, bold=True, align='center', border=1,
                       num_format='0', locked=True)
    FOND_SCORE_ROWS = []
    for i, (crit, zone, val_f, num_fmt, sig_f, score_f) in enumerate(fond_criteria):
        r = 6 + i
        lbl(r, 'A', crit)
        ws.write_formula(row(r), col('B'), val_f,
                         fmt(bg="#EBF5FB", fg="#1F3864", size=11, align='right',
                             border=1, num_format=num_fmt))
        ws.write(row(r), col('C'), zone,
                 fmt(bg=LORANGE, fg=DARK, size=11, align='center', border=1, locked=False))
        ws.write_formula(row(r), col('D'), sig_f, F_SIG_AUTO)
        ws.write_formula(row(r), col('E'), score_f, F_SCORE_AUTO)
        FOND_SCORE_ROWS.append(r)

    FOND_TOTAL_R = 14
    lbl(FOND_TOTAL_R, 'A', "SCORE FONDAMENTAL TOTAL (/24)", bold=True)
    for c in ['B','C','D']:
        ws.write_blank(row(FOND_TOTAL_R), col(c), None,
                       fmt(bg="#F2F2F2", border=1))
    ws.write_formula(row(FOND_TOTAL_R), col('E'),
        f'=SUM(E{FOND_SCORE_ROWS[0]}:E{FOND_SCORE_ROWS[-1]})',
        fmt(bg="#E2EFDA", fg="#1F3864", size=11, bold=True, align='center', border=1, num_format='0'))
    blank_r(15)

    # Conditional formatting for signal column D in scorecard fondamentale
    sig_fmt_green = wb.add_format({'bg_color': '#D1FAE5', 'font_color': '#065F46', 'border': 1, 'align': 'center'})
    sig_fmt_red   = wb.add_format({'bg_color': '#FEE2E2', 'font_color': '#991B1B', 'border': 1, 'align': 'center'})
    sig_fmt_amber = wb.add_format({'bg_color': '#FEF3C7', 'font_color': '#92400E', 'border': 1, 'align': 'center'})
    for kw in ['Bon', 'rentable', 'Sous-evalue', 'Decote', 'Opportunite', 'SURVENTE', 'ACHETER']:
        ws.conditional_format('D6:D13', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_green})
        ws.conditional_format('D18:D22', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_green})
    for kw in ['Surevalue', 'SURACHAT', 'Prime', 'Negatif']:
        ws.conditional_format('D6:D13', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_red})
        ws.conditional_format('D18:D22', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_red})
    for kw in ['Normal', 'Faible', 'Moyen', 'NEUTRE']:
        ws.conditional_format('D6:D13', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_amber})
        ws.conditional_format('D18:D22', {'type': 'text', 'criteria': 'containing', 'value': kw, 'format': sig_fmt_amber})

    # Scorecard technique (lignes 16–22)
    section(16, "SCORECARD TECHNIQUE")
    heads(17, ["Critere", "Signal observe", "Zone", "Interpretation", "Score"])
    # (critere, zone, formule_col_B, formule_col_D)
    # score_f: 0-3 auto par seuils (max total 15)
    tech_criteria = [
        ("MM20+Bollinger+MACD+RSI+Volume (score B1)", "-5 a +5",
         '=IFERROR(ETUDE!D91,"")',
         '=IFERROR(ETUDE!E91,"-")',
         '=IFERROR(IF(ETUDE!D91>=4,3,IF(ETUDE!D91>=2,2,IF(ETUDE!D91>=0,1,0))),0)'),
        ("Prix Medians PM1 et PM2 (B2)", "< PM = survente",
         '=IFERROR(ETUDE!E95,"")',
         '=IFERROR(ETUDE!E96,"-")',
         '=IFERROR(IF(AND(ETUDE!B24<ETUDE!D95,ETUDE!B24<ETUDE!D96),3,IF(ETUDE!B24<ETUDE!D95,2,IF(ETUDE!B24<ETUDE!D96,1,0))),0)'),
        ("PER actualise (B3)", "9-15 = normal",
         '=IFERROR(ETUDE!B104,"")',
         '=IFERROR(ETUDE!D104,"-")',
         '=IFERROR(IF(ETUDE!B104<9,3,IF(ETUDE!B104<=15,2,IF(ETUDE!B104<=20,1,0))),0)'),
        ("PCD / Gordon-Shapiro (B4/B5)", "< PCD = survente",
         '=IFERROR(ETUDE!B116,"")',
         '=IFERROR(ETUDE!B125,"-")',
         '=IFERROR(IF(AND(ISNUMBER(SEARCH("DESSOUS",ETUDE!B116)),ISNUMBER(SEARCH("SOUS P0",ETUDE!B125))),3,IF(OR(ISNUMBER(SEARCH("DESSOUS",ETUDE!B116)),ISNUMBER(SEARCH("SOUS P0",ETUDE!B125))),2,IF(OR(ISNUMBER(SEARCH("ZONE CIBLE",ETUDE!B116)),ISNUMBER(SEARCH("zone P0",ETUDE!B125))),1,0))),0)'),
        ("Risk/Reward (B6)", ">= 2 = bon",
         '=IFERROR(ETUDE!B135,"")',
         '=IFERROR(ETUDE!D135,"-")',
         '=IFERROR(IF(ETUDE!B135>=3,3,IF(ETUDE!B135>=2,2,IF(ETUDE!B135>=1,1,0))),0)'),
    ]
    F_VAL_TECH  = fmt(bg="#EBF5FB", fg="#1E3A5F", size=11, align='center', border=1)
    F_SIG_TECH  = fmt(bg="#EBF5FB", fg="#404040", size=11, italic=True, align='center', border=1)
    TECH_SCORE_ROWS = []
    for i, (crit, zone, val_f, sig_f, score_f) in enumerate(tech_criteria):
        r = 18 + i
        lbl(r, 'A', crit)
        ws.write_formula(row(r), col('B'), val_f, F_VAL_TECH)
        ws.write(row(r), col('C'), zone,
                 fmt(bg=LORANGE, fg=DARK, size=11, align='center', border=1, locked=False))
        ws.write_formula(row(r), col('D'), sig_f, F_SIG_TECH)
        ws.write_formula(row(r), col('E'), score_f, F_SCORE_AUTO)
        TECH_SCORE_ROWS.append(r)

    TECH_TOTAL_R = 23
    lbl(TECH_TOTAL_R, 'A', "SCORE TECHNIQUE TOTAL (/15)", bold=True)
    for c in ['B','C','D']:
        ws.write_blank(row(TECH_TOTAL_R), col(c), None,
                       fmt(bg="#F2F2F2", border=1))
    ws.write_formula(row(TECH_TOTAL_R), col('E'),
        f'=SUM(E{TECH_SCORE_ROWS[0]}:E{TECH_SCORE_ROWS[-1]})',
        fmt(bg="#E2EFDA", fg="#1F3864", size=11, bold=True, align='center', border=1, num_format='0'))
    blank_r(24)

    # Verdict global (lignes 25–31)
    section(25, "VERDICT GLOBAL", bg="#1F3864")
    heads(26, ["Composante", "Score", "Max", "% atteint", "Appreciation"])
    ws.write(row(27), 0, "Score Fondamental", F_LBL)
    ws.write_formula(row(27), 1, f'=E{FOND_TOTAL_R}',
                     fmt(bg="#E2EFDA", fg="#404040", size=10, bold=True, align='center', border=1, num_format='0'))
    ws.write(row(27), 2, 24, fmt(bg="#F2F2F2", fg="#404040", size=11, align='center', border=1))
    ws.write_formula(row(27), 3, f'=IFERROR(E{FOND_TOTAL_R}/24*100,"")',
                     fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='0.0'))
    ws.write_formula(row(27), 4,
        f'=IFERROR(IF(E{FOND_TOTAL_R}/24>=0.7,"Solide",IF(E{FOND_TOTAL_R}/24>=0.5,"Moyen","Faible")),"-")',
        fmt(bg="#FFFFFF", fg="#404040", size=11, align='center', border=1))

    ws.write(row(28), 0, "Score Technique", F_LBL)
    ws.write_formula(row(28), 1, f'=E{TECH_TOTAL_R}',
                     fmt(bg="#E2EFDA", fg="#404040", size=10, bold=True, align='center', border=1, num_format='0'))
    ws.write(row(28), 2, 15, fmt(bg="#F2F2F2", fg="#404040", size=11, align='center', border=1))
    ws.write_formula(row(28), 3, f'=IFERROR(E{TECH_TOTAL_R}/15*100,"")',
                     fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='0.0'))
    ws.write_formula(row(28), 4,
        f'=IFERROR(IF(E{TECH_TOTAL_R}/15>=0.7,"Solide",IF(E{TECH_TOTAL_R}/15>=0.5,"Moyen","Faible")),"-")',
        fmt(bg="#FFFFFF", fg="#404040", size=11, align='center', border=1))

    ws.write(row(29), 0, "SCORE TOTAL", F_LBL_B)
    ws.write_formula(row(29), 1, f'=IFERROR(E{FOND_TOTAL_R}+E{TECH_TOTAL_R},"")',
                     fmt(bg="#E2EFDA", fg="#1F3864", size=14, bold=True, align='center', border=1, num_format='0'))
    ws.write(row(29), 2, 39, fmt(bg="#F2F2F2", fg="#404040", size=11, bold=True, align='center', border=1))
    ws.write_formula(row(29), 3, f'=IFERROR(B{29}/39*100,"")',
                     fmt(bg="#E2EFDA", fg="#404040", size=11, align='right', border=1, num_format='0.0'))
    ws.write_formula(row(29), 4,
        f'=IFERROR(IF(B{29}/39>=0.7,"ACHETER",IF(B{29}/39>=0.5,"SURVEILLER","EVITER")),"-")',
        fmt(bg="#E2EFDA", fg="#1F3864", size=12, bold=True, align='center', border=1))
    blank_r(30)

    # Signal Contrarian (lignes 31–34)
    section(31, "C — SIGNAL CONTRARIAN BRVM  (depuis ETUDE C4)")
    heads(32, ["Score /10", "Verdict", "PER Normalise", "PER vs Sectoriel", "Decote VMC"])
    ws.write_formula(row(33), col('A'), '=IFERROR(ETUDE!D178,"")',
                     fmt(bg="#EBF5FB", fg=NAVY, size=14, bold=True, align='center', border=2, num_format='0'))
    ws.write_formula(row(33), col('B'), '=IFERROR(ETUDE!E179,"-")',
                     fmt(bold=True, bg="#EBF5FB", fg=NAVY, size=10, align='center', border=2, wrap=True, locked=False))
    ws.write_formula(row(33), col('C'), '=IFERROR(ETUDE!D153,"")',
                     fmt(bg="#EBF5FB", fg=NAVY, size=10, align='center', border=1, num_format='0.00'))
    ws.write_formula(row(33), col('D'), '=IFERROR(ETUDE!D161,"")',
                     fmt(bg="#EBF5FB", fg=NAVY, size=10, align='center', border=1, num_format='0.00'))
    ws.write_formula(row(33), col('E'), '=IFERROR(IF(ETUDE!B24<ETUDE!B31,"Prix < VMC","Prix > VMC"),"-")',
                     fmt(bg="#EBF5FB", fg=NAVY, size=11, italic=True, align='center', border=1))
    ws.set_row(row(33), 30)
    blank_r(34)

    section(35, "RECOMMANDATION FINALE (texte libre)")
    ws.merge_range(row(36), 0, row(40), 4, "",
                   fmt(bg=WHITE, border=1, wrap=True, valign='top', locked=False))
    ws.set_row(row(36), 50)

    ws.protect(PROTECT_PWD, {
        'select_locked_cells':   True,
        'select_unlocked_cells': True,
        'format_columns':        True,
        'format_rows':           True,
    })


def build_profil(wb, fmt, F_TITLE, F_SEC, F_HEAD, F_LBL, F_WHITE, F_HINT):
    ws = wb.add_worksheet("PROFIL")
    ws.set_tab_color("#6B7280")
    ws.freeze_panes(1, 0)
    ws.set_column(0, 0, 32)
    ws.set_column(1, 1, 28)
    ws.set_column(2, 2, 32)
    ws.set_column(3, 3, 20)

    def row(r): return r - 1
    def col(c): return ord(c) - ord('A')

    ws.merge_range(0, 0, 0, 3, "PROFIL DE LA SOCIETE", F_TITLE)
    ws.set_row(0, 22)

    # ── Cellules clés liées aux autres onglets (lignes 2-7) ──────────────────
    F_KEY_LBL = fmt(bold=True, bg=NAVY, fg=WHITE, size=11, align='left', border=1)
    F_KEY_INP = fmt(bold=True, bg=LORANGE, fg=DARK, size=12, align='left', border=2, locked=False)
    F_KEY_HNT = fmt(italic=True, bg=WHITE, fg='#6B7280', size=10, align='left', border=1)

    ws.merge_range(1, 0, 1, 3,
        "DONNEES CLES — liees automatiquement a ETUDE et SYNTHESE",
        fmt(bold=True, bg=BLUE, fg=WHITE, size=11, border=0))
    ws.set_row(1, 20)

    key_fields = [
        ("Nom de la societe",      "PROFIL!B3 -> titre de ETUDE et SYNTHESE"),
        ("Ticker BRVM",            "ex: BIDC, ETIT, SNTS, ONTBF..."),
        ("Secteur d activite",     "Banque | Assurance | Industrie | Distribution | Telecom | Autre"),
        ("Date d analyse",         "ex: 14/05/2026  (texte libre)"),
    ]
    KEY_ROWS = {}
    F_KEY_INP_DATE = fmt(bold=True, bg=LORANGE, fg=DARK, size=12, align='left', border=2, locked=False, num_format='@')

    for i, (lbl_txt, hint_txt) in enumerate(key_fields):
        r_idx = 2 + i   # 0-based row index
        ws.write(r_idx, 0, lbl_txt, F_KEY_LBL)
        # B6 (i=3) : format texte pur '@' pour bloquer la conversion date->numero serie
        f_inp = F_KEY_INP_DATE if i == 3 else F_KEY_INP
        ws.merge_range(r_idx, 1, r_idx, 2, None, f_inp)
        ws.write(r_idx, 3, hint_txt, F_KEY_HNT)              # hint en D (hors fusion)
        ws.set_row(r_idx, 22)
        KEY_ROWS[lbl_txt] = r_idx + 1   # 1-based Excel row number

    ws.set_row(6, 8)   # small blank gap

    sections = [
        ("IDENTIFICATION COMPLETE", [
            ("Nom complet", ""), ("Ticker BRVM", ""),
            ("Secteur d'activite", ""), ("Pays d'origine", ""),
            ("Date d'introduction en bourse", ""),
        ]),
        ("CAPITAL & ACTIONNARIAT", [
            ("Capital social (FCFA)", ""), ("Nombre de titres", ""),
            ("Flottant (%)", ""), ("Principaux actionnaires", ""),
        ]),
        ("LIQUIDITE DU TITRE (critique sur BRVM)", [
            ("Volume moyen journalier (titres)", "<-- Source : BRVM.org"),
            ("Volume moyen journalier (FCFA)", ""),
            ("Frequence de cotation (%)", "<-- % seances avec transaction"),
            ("Appreciation liquidite", "<-- Forte / Moyenne / Faible"),
        ]),
        ("NOTATION & CONFORMITE", [
            ("Agence de notation", ""), ("Note court terme", ""),
            ("Note long terme", ""), ("Dividende verse regulierement ?", "<-- Oui / Non"),
        ]),
        ("SOURCES D'INFORMATION", [
            ("Rapport annuel", "<-- Lien ou date"),
            ("Site de la societe", ""),
            ("Profil RichBourse", "<-- richbourse.com"),
            ("Profil BRVM", "<-- brvm.org"),
        ]),
    ]

    # Cellules IDENTIFICATION auto-liées aux cellules clés B3/B4/B5
    F_AUTO = fmt(bg=LGREEN, fg=DARK, size=11, align='left', border=1)
    # Champs IDENTIFICATION qui reprennent automatiquement les cellules clés
    ident_auto = {
        "Nom complet":       "=B3",
        "Ticker BRVM":       "=B4",
        "Secteur d'activite": "=B5",
    }

    r = 8   # start after key section + gap
    for sec_title, fields in sections:
        ws.set_row(r-1, 20)
        ws.merge_range(r-1, 0, r-1, 3, sec_title,
                       fmt(bold=True, bg=BLUE, fg=WHITE, size=11, border=0))
        r += 1
        for lbl_txt, placeholder in fields:
            ws.write(r-1, 0, lbl_txt, F_LBL)
            if lbl_txt in ident_auto:
                # Auto-rempli depuis les cellules clés ci-dessus
                ws.write_formula(r-1, 1, ident_auto[lbl_txt], F_AUTO)
                ws.write(r-1, 2, "<-- Auto depuis cellules cles ci-dessus", F_HINT)
                ws.write_blank(r-1, 3, None, fmt(bg=WHITE, border=1, locked=False))
            elif placeholder.startswith("<--"):
                ws.write(r-1, 1, placeholder, F_HINT)
                ws.write_blank(r-1, 2, None, fmt(bg=WHITE, border=1, locked=False))
                ws.write_blank(r-1, 3, None, fmt(bg=WHITE, border=1, locked=False))
            else:
                ws.write(r-1, 1, placeholder or None, fmt(bg=LORANGE, fg=DARK, size=11, align='left', border=1, locked=False))
                ws.write_blank(r-1, 2, None, fmt(bg=WHITE, border=1, locked=False))
                ws.write_blank(r-1, 3, None, fmt(bg=WHITE, border=1, locked=False))
            r += 1
        ws.set_row(r-1, 5)
        r += 1

    ws.protect(PROTECT_PWD, {
        'select_locked_cells':   True,
        'select_unlocked_cells': True,
        'format_columns':        True,
        'format_rows':           True,
    })


def build_formule(wb, fmt, F_TITLE, F_SEC, F_HEAD, F_LBL, F_LBL_B, F_WHITE, F_REF, F_CALC_C):
    ws = wb.add_worksheet("FORMULE")
    ws.set_tab_color("#374151")
    ws.freeze_panes(1, 0)
    ws.set_column(0, 0, 30)
    ws.set_column(1, 1, 34)
    ws.set_column(2, 2, 12)
    ws.set_column(3, 3, 44)

    ws.merge_range(0, 0, 0, 3, "REFERENTIEL DES FORMULES & INDICATEURS BRVM", F_TITLE)
    ws.set_row(0, 22)

    heads_f = fmt(bold=True, bg="#D6E4F7", fg="#1F3864", size=11, align='center', border=1)
    ws.write(1, 0, "Indicateur", heads_f)
    ws.write(1, 1, "Expression mathematique", heads_f)
    ws.write(1, 2, "Unite", heads_f)
    ws.write(1, 3, "Interpretation / Seuils BRVM", heads_f)

    formulas = [
        ("ANALYSE FONDAMENTALE", None, None, None),
        ("Croissance N/N-4", "(N - N-4) / |N-4| x 100", "%",
         "Positif = croissance. Negatif = contraction. Seuil : > 10%/an = excellent"),
        ("TCAM (CAGR)", "(N / N-4)^(1/4) - 1", "%",
         "Taux de Croissance Annuel Moyen sur 4 ans"),
        ("Marge Nette", "RN / CA x 100", "%",
         "< 2% = faible | 2-5% = moyen | > 5% = bon | > 10% = tres bon"),
        ("PER", "Prix / BNPA", "fois",
         "Zone normale BRVM : 9-15. > 15 = surevalue, < 9 = sous-evalue"),
        ("VMC", "Capitaux Propres / Nb titres", "FCFA",
         "Prix < VMC = action decotee (achat potentiellement interessant)"),
        ("PBR", "Capitalisation / Capitaux Propres", "fois",
         "< 1 = decote sur actif net | > 2 = prime significative"),
        ("ROE", "RN / Capitaux Propres x 100", "%",
         "< 5% = faible | 5-10% = moyen | 10-15% = bon | > 15% = excellent"),
        ("RVC (Lynch)", "PER x PBR", "",
         "< 22 = decote globale. Indicateur de sous-valorisation composite"),
        ("Taux de distribution", "DVD / (BNPA x 0.85) x 100", "%",
         "0.85 = prefcompte 15% BRVM. > 100% = distribution > benefice"),
        ("Rendement dividende", "Dividende / Prix x 100", "%",
         "< 2% = faible | 2-5% = bon | > 5% = tres attractif"),
        ("ANALYSE TECHNIQUE", None, None, None),
        ("Prix Median (PM)", "(Plus Haut + Plus Bas) / 2", "FCFA",
         "Prix < PM = zone survente. Calculer sur 1 an ET 2 ans SEPAREMENT"),
        ("RSI", "Calcule sur graphique", "",
         "< 30 = survente | 30-70 = neutre | > 70 = surachat"),
        ("MACD", "Calcule sur graphique", "",
         "MACD > Signal = signal haussier"),
        ("PER actualise", "Prix / (BNPA x (1 + evol RN%))", "fois",
         "Integre la derniere variation du RN. Plus precis que le PER historique"),
        ("PCD", "100 x DVD_prev / Rendement_secteur%", "FCFA",
         "Rendement sectoriel BRVM : 5-8%. Applicable seulement si dividende > 0"),
        ("Gordon-Shapiro", "P0 = D1 / (r - g)", "FCFA",
         "D1 = dividende attendu | r = taux exige | g = croissance dividendes"),
        ("GESTION DU RISQUE", None, None, None),
        ("Stop-Loss (10%)", "Prix d'achat x 0.90", "FCFA",
         "Limite de perte acceptable. Adapter selon profil de risque"),
        ("Risk/Reward", "Gain potentiel / Perte potentielle", "ratio",
         "< 1 = mauvais | 1-2 = acceptable | >= 2 = bon"),
        ("CMP (frais achat)", "Prix x 1.014", "FCFA",
         "Integre la commission d'achat BRVM de 1.4%"),
        ("Taxe de cession", "Prix x 1.4%", "FCFA",
         "Taxe applicable a la vente sur BRVM"),
    ]

    F_SEC_F = fmt(bold=True, bg="#2F5496", fg="#FFFFFF", size=10, border=0)
    F_EXPR  = fmt(bg="#D6E4F7", fg="#1F3864", size=11, align='center', border=1)

    r = 2
    for item in formulas:
        label, expr, unit, interp = item
        if expr is None:
            ws.merge_range(r, 0, r, 3, label, F_SEC_F)
            ws.set_row(r, 18)
        else:
            ws.write(r, 0, label, F_LBL_B)
            ws.write(r, 1, expr, F_EXPR)
            ws.write(r, 2, unit, fmt(bg="#F2F2F2", fg="#404040", size=11, align='center', border=1))
            ws.write(r, 3, interp, fmt(bg="#FFFFFF", fg="#404040", size=11, align='left', border=1, wrap=True))
            ws.set_row(r, 28)
        r += 1

    ws.protect(PROTECT_PWD, {
        'select_locked_cells':   True,
        'select_unlocked_cells': True,
        'format_columns':        True,
        'format_rows':           True,
    })


make_wb()
