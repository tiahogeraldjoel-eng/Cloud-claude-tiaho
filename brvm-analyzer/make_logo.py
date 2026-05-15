"""
Génère logo.png — logo stylé BRVM Analyzer pour l'onglet RAPPORT.
Usage: python3 make_logo.py
"""
from PIL import Image, ImageDraw, ImageFont
import math, os

# ── Dimensions canvas (haute résolution pour netteté dans Excel) ──────────────
W, H = 520, 160
SCALE = 2          # anti-aliasing : on dessine 2× puis on réduit
WW, HH = W * SCALE, H * SCALE

img = Image.new("RGBA", (WW, HH), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# ── Couleurs (thème du fichier Excel) ────────────────────────────────────────
NAVY    = (13,  27,  42)       # #0D1B2A
BLUE    = (30,  58,  95)       # #1E3A5F
ORANGE  = (217, 119,  6)       # #D97706
WHITE   = (255, 255, 255)
LORANGE = (255, 251, 235)

# ── Fond : rectangle arrondi navy ────────────────────────────────────────────
RADIUS = 40 * SCALE
draw.rounded_rectangle([0, 0, WW - 1, HH - 1], radius=RADIUS,
                        fill=NAVY)

# ── Bande accent orange en bas ────────────────────────────────────────────────
BAR_H = 14 * SCALE
draw.rounded_rectangle([0, HH - BAR_H, WW - 1, HH - 1], radius=0,
                        fill=ORANGE)
# carrés pour effacer les coins supérieurs de la bande (la bande n'est pas arrondie en haut)
draw.rectangle([0, HH - BAR_H, RADIUS, HH - 1], fill=ORANGE)
draw.rectangle([WW - RADIUS, HH - BAR_H, WW - 1, HH - 1], fill=ORANGE)

# ── Pictogramme graphique boursier (candlestick stylisé) ─────────────────────
CX, CY = 68 * SCALE, 80 * SCALE
candles = [
    # (x_centre, y_bas_body, y_haut_body, y_bas_wick, y_haut_wick, couleur)
    (CX - 32*SCALE, 90*SCALE, 60*SCALE,  96*SCALE, 52*SCALE, (239, 68, 68)),    # rouge
    (CX,            96*SCALE, 72*SCALE,  103*SCALE, 64*SCALE, (239, 68, 68)),    # rouge
    (CX + 32*SCALE, 88*SCALE, 48*SCALE,  95*SCALE, 40*SCALE, (52, 211, 153)),   # vert
]
for cx, yb, yt, yw_lo, yw_hi, color in candles:
    bw = 9 * SCALE
    # mèche
    draw.line([(cx, yw_lo), (cx, yw_hi)], fill=color, width=3 * SCALE)
    # corps
    draw.rectangle([cx - bw, yt, cx + bw, yb], fill=color)

# ── Ligne de tendance haussière ───────────────────────────────────────────────
trend_pts = [
    (CX - 48*SCALE, 100*SCALE),
    (CX - 10*SCALE,  78*SCALE),
    (CX + 20*SCALE,  60*SCALE),
    (CX + 48*SCALE,  44*SCALE),
]
draw.line(trend_pts, fill=ORANGE, width=4 * SCALE)
# flèche au bout
ax, ay = trend_pts[-1]
draw.polygon([
    (ax, ay - 8*SCALE),
    (ax + 12*SCALE, ay + 4*SCALE),
    (ax - 4*SCALE, ay + 4*SCALE),
], fill=ORANGE)

# ── Polices ───────────────────────────────────────────────────────────────────
FONT_DIR = "/usr/share/fonts/truetype/liberation"
try:
    font_bold   = ImageFont.truetype(f"{FONT_DIR}/LiberationSans-Bold.ttf",   50 * SCALE)
    font_light  = ImageFont.truetype(f"{FONT_DIR}/LiberationSans-Regular.ttf", 22 * SCALE)
    font_tag    = ImageFont.truetype(f"{FONT_DIR}/LiberationSans-Regular.ttf", 16 * SCALE)
except Exception:
    font_bold = font_light = font_tag = ImageFont.load_default()

# ── Texte "BRVM" ──────────────────────────────────────────────────────────────
TEXT_X = 148 * SCALE
draw.text((TEXT_X, 22 * SCALE), "BRVM", font=font_bold, fill=WHITE)

# Soulignement orange sous "BRVM"
bb = draw.textbbox((TEXT_X, 22 * SCALE), "BRVM", font=font_bold)
draw.rectangle([bb[0], bb[3] + 4*SCALE, bb[2], bb[3] + 10*SCALE], fill=ORANGE)

# ── Sous-texte "ANALYZER" ─────────────────────────────────────────────────────
draw.text((TEXT_X + 4*SCALE, 86 * SCALE), "ANALYZER", font=font_light, fill=LORANGE)

# ── Tag "Bourse Régionale des Valeurs Mobilières" ────────────────────────────
draw.text((TEXT_X + 4*SCALE, 118 * SCALE), "Analyse Fondamentale & Technique", font=font_tag, fill=(150, 180, 210))

# ── Réduction ×2 → taille finale (anti-aliasing Lanczos) ─────────────────────
img_final = img.resize((W, H), Image.LANCZOS)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")
img_final.save(out, "PNG")
print(f"Logo généré : {out}  ({W}×{H} px)")
