"""
Génère brvm_icon.png — icône carrée 256×256 pour le raccourci bureau.
"""
from PIL import Image, ImageDraw, ImageFont
import os, math

SIZE   = 256
SCALE  = 2
SS     = SIZE * SCALE

img  = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

NAVY   = (13,  27,  42)
BLUE   = (30,  58,  95)
ORANGE = (217, 119,  6)
WHITE  = (255, 255, 255)

# Fond arrondi
R = 60 * SCALE
draw.rounded_rectangle([0, 0, SS-1, SS-1], radius=R, fill=NAVY)

# Bande orange en bas
BAR = 28 * SCALE
draw.rectangle([0, SS-BAR, SS-1, SS-1], fill=ORANGE)
# coins arrondis en bas
draw.rounded_rectangle([0, SS-BAR*2, SS-1, SS-1], radius=R//2, fill=ORANGE)
draw.rectangle([0, SS-BAR, SS-1, SS-BAR], fill=NAVY)  # masque haut de la bande
draw.rectangle([0, SS-BAR, SS-1, SS-1], fill=ORANGE)

# Candlesticks centrés
candles = [
    (-60, 180, 120,  195, 105, (239, 68,  68)),
    (  0, 200, 140,  210, 128, (239, 68,  68)),
    ( 60, 175, 100,  188,  85, ( 52, 211, 153)),
]
for dx, yb, yt, yw_lo, yw_hi, color in candles:
    cx = (SS//2 + dx*SCALE//1)
    bw = 18 * SCALE
    draw.line([(cx, yw_lo*SCALE//1), (cx, yw_hi*SCALE//1)], fill=color, width=5*SCALE)
    draw.rectangle([cx-bw, yt*SCALE//1, cx+bw, yb*SCALE//1], fill=color)

# Ligne tendance orange
pts = [
    (SS//2 - 80*SCALE//1, 195*SCALE//1),
    (SS//2 - 20*SCALE//1, 160*SCALE//1),
    (SS//2 + 30*SCALE//1, 128*SCALE//1),
    (SS//2 + 80*SCALE//1, 100*SCALE//1),
]
draw.line(pts, fill=ORANGE, width=7*SCALE)
ax, ay = pts[-1]
draw.polygon([(ax, ay-16*SCALE), (ax+20*SCALE, ay+8*SCALE), (ax-8*SCALE, ay+8*SCALE)], fill=ORANGE)

# Texte "BRVM"
FONT_DIR = "/usr/share/fonts/truetype/liberation"
try:
    fb = ImageFont.truetype(f"{FONT_DIR}/LiberationSans-Bold.ttf", 72*SCALE)
    fs = ImageFont.truetype(f"{FONT_DIR}/LiberationSans-Regular.ttf", 30*SCALE)
except Exception:
    fb = fs = ImageFont.load_default()

# "BRVM" en haut centré
bb = draw.textbbox((0, 0), "BRVM", font=fb)
tw = bb[2] - bb[0]
tx = (SS - tw) // 2
draw.text((tx, 18*SCALE), "BRVM", font=fb, fill=WHITE)
# soulignement
bb2 = draw.textbbox((tx, 18*SCALE), "BRVM", font=fb)
draw.rectangle([bb2[0], bb2[3]+4*SCALE, bb2[2], bb2[3]+10*SCALE], fill=ORANGE)

# "analyzer" petit en dessous
bb3 = draw.textbbox((0, 0), "analyzer", font=fs)
tw3 = bb3[2] - bb3[0]
draw.text(((SS-tw3)//2, 110*SCALE), "analyzer", font=fs, fill=(180, 210, 240))

# Réduction finale
out_img = img.resize((SIZE, SIZE), Image.LANCZOS)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "brvm_icon.png")
out_img.save(out, "PNG")
print(f"Icône générée : {out}  ({SIZE}×{SIZE} px)")
