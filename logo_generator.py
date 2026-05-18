"""
Generateur de logo BRVM Analytics — "L'Etoile du Taureau d'Or"
===============================================================
Produit :
  static/logo.png    — 512x512 PNG haute resolution
  static/logo.ico    — Icone Windows multi-tailles (16/32/48/64/128/256 px)
  static/favicon.ico — identique logo.ico

Usage : python logo_generator.py
"""
import os, math
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    import subprocess, sys
    print("  Installation de Pillow...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "--quiet"])
    from PIL import Image, ImageDraw, ImageFont, ImageFilter

STATIC = Path(__file__).parent / "static"
STATIC.mkdir(exist_ok=True)

# ─── Palette "Investisseur Gagnant BRVM" ─────────────────────────────────────
NOIR_NUIT   = (6,   13,  26,  255)   # fond le plus sombre
BLEU_NUIT   = (20,  35,  70,  255)   # fond dégradé
OR_VIEL     = (146, 64,  14,  255)   # or foncé
OR_MOYEN    = (217, 119, 6,   255)   # #d97706
OR_CHAUD    = (245, 158, 11,  255)   # #f59e0b
OR_BRILLANT = (251, 191, 36,  255)   # #fbbf24
OR_CLAIR    = (253, 230, 138, 255)   # #fde68a
BLANC       = (255, 255, 255, 255)
VERT        = (34,  197, 94,  230)
VERT_FONCE  = (22,  163, 74,  180)
ROUGE       = (239, 68,  68,  220)
GRIS        = (100, 116, 139, 180)


def lerp(c1, c2, t):
    return tuple(max(0, min(255, int(c1[i] + (c2[i]-c1[i])*t))) for i in range(4))


def star_polygon(cx, cy, r_out, r_in, n=5):
    """Retourne la liste de points d'une étoile à n branches."""
    pts = []
    for i in range(n * 2):
        angle = math.radians(-90 + i * 180 / n)
        r = r_out if i % 2 == 0 else r_in
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts


def radial_gradient_circle(draw, cx, cy, r_max, colors, steps=60):
    """Dessine un dégradé radial par anneau."""
    for i in range(steps, 0, -1):
        t = i / steps
        r = int(r_max * t)
        c = lerp(colors[0], colors[1], 1 - t)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=c, outline=None)


def draw_rounded_rect(draw, x0, y0, x1, y1, r, fill):
    draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill)


def make_logo(SIZE=512):
    S = SIZE
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = cy = S // 2
    R_OUT = int(S * 0.49)   # rayon extérieur anneau or
    R_SEP = int(S * 0.455)  # séparateur sombre
    R_IN  = int(S * 0.435)  # rayon intérieur
    R_CLI = int(S * 0.425)  # clip du contenu

    # ── 1. ANNEAU OR ─────────────────────────────────────────────────────────
    # Ombre portée
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([cx-R_OUT+4, cy-R_OUT+6, cx+R_OUT+4, cy+R_OUT+6],
               fill=(0, 0, 0, 100))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=int(S*0.018)))
    img = Image.alpha_composite(img, shadow)
    draw = ImageDraw.Draw(img)

    # Anneau or principal (dégradé radial simulé en couches)
    gold_steps = 40
    for i in range(gold_steps, 0, -1):
        t = i / gold_steps
        r = int(R_OUT * t)
        # Dégradé or riche
        if t > 0.93:
            c = lerp(OR_CLAIR, OR_BRILLANT, (t-0.93)/0.07)
        elif t > 0.70:
            c = lerp(OR_CHAUD, OR_CLAIR, (t-0.70)/0.23)
        else:
            c = lerp(OR_VIEL, OR_CHAUD, t/0.70)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=c)

    # Filet noir séparateur
    draw.ellipse([cx-R_SEP, cy-R_SEP, cx+R_SEP, cy+R_SEP],
                 fill=(8, 14, 28, 255))

    # Fin filet or intérieur
    draw.ellipse([cx-R_IN, cy-R_IN, cx+R_IN, cy+R_IN],
                 fill=None, outline=OR_CHAUD, width=max(1, int(S*0.006)))

    # ── 2. FOND INTÉRIEUR nuit profonde ──────────────────────────────────────
    # Dégradé radial du fond
    for i in range(100, 0, -1):
        t = i / 100
        r = int(R_CLI * t)
        c = lerp(BLEU_NUIT, NOIR_NUIT, t*0.9)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=c)

    # Reflet de lumière en haut-gauche (ambiance prestige)
    for i in range(30, 0, -1):
        t = i / 30
        rx = int(R_CLI * 0.55 * t)
        ry = int(R_CLI * 0.35 * t)
        alpha = int(20 * (1 - t))
        overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        ox = cx - int(R_CLI * 0.28)
        oy = cy - int(R_CLI * 0.40)
        od.ellipse([ox-rx, oy-ry, ox+rx, oy+ry], fill=(255, 255, 255, alpha))
        img = Image.alpha_composite(img, overlay)
    draw = ImageDraw.Draw(img)

    # ── 3. BOUGIES JAPONAISES ────────────────────────────────────────────────
    CHART_LEFT   = cx - int(R_CLI * 0.76)
    CHART_RIGHT  = cx + int(R_CLI * 0.76)
    CHART_BOTTOM = cy + int(R_CLI * 0.62)
    CHART_TOP    = cy - int(R_CLI * 0.30)
    CHART_H      = CHART_BOTTOM - CHART_TOP

    # 6 bougies : (hauteur_relative, couleur_corps, couleur_mèche)
    CANDLES = [
        (0.22, VERT,         VERT_FONCE),
        (0.36, VERT,         VERT_FONCE),
        (0.28, ROUGE,        (180, 40, 40, 160)),
        (0.52, VERT,         VERT_FONCE),
        (0.68, VERT,         VERT_FONCE),
        (0.85, OR_CHAUD,     OR_MOYEN),   # Bougie or — victoire
    ]
    n_bars  = len(CANDLES)
    total_w = CHART_RIGHT - CHART_LEFT
    bar_w   = int(total_w / n_bars * 0.62)
    spacing = (total_w - bar_w * n_bars) // (n_bars + 1)

    wick_tops = []

    for i, (h, body_c, wick_c) in enumerate(CANDLES):
        bx = CHART_LEFT + spacing * (i+1) + bar_w * i
        bx_mid = bx + bar_w // 2
        bar_h = int(CHART_H * h)
        y_top = CHART_BOTTOM - bar_h
        y_bot = CHART_BOTTOM

        # Mèche haute
        wick_h_top = max(3, int(bar_h * 0.11))
        wy_top = y_top - wick_h_top
        draw.line([(bx_mid, wy_top), (bx_mid, y_top)],
                  fill=wick_c, width=max(2, bar_w // 5))
        # Mèche basse
        wick_h_bot = max(2, int(bar_h * 0.05))
        draw.line([(bx_mid, y_bot), (bx_mid, y_bot + wick_h_bot)],
                  fill=wick_c, width=max(2, bar_w // 5))

        # Corps de la bougie (sécurité : éviter y_top >= y_bot)
        if y_top >= y_bot:
            y_top = y_bot - 1
        draw.rounded_rectangle([bx, y_top, bx+bar_w, y_bot],
                                radius=max(1, bar_w//5), fill=body_c)

        # Reflet brillant sur les bougies vertes et la bougie or
        ref_y0 = y_top + max(1, bar_h//10)
        ref_y1 = y_bot - max(1, bar_h//6)
        if body_c != ROUGE and ref_y0 < ref_y1 and bar_w > 4:
            draw.rounded_rectangle(
                [bx+max(1,bar_w//8), ref_y0,
                 bx+max(2,bar_w//3), ref_y1],
                radius=max(1, bar_w//6),
                fill=(*body_c[:3], 70))

        # Halo lumineux bougie or (la dernière)
        if i == n_bars - 1 and bar_w > 2:
            for glow_r in [bar_w*2, bar_w, max(1,int(bar_w*0.7))]:
                alpha = [18, 35, 55][{bar_w*2: 0, bar_w: 1, max(1,int(bar_w*0.7)): 2}.get(glow_r, 2)]
                glow_img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
                gd = ImageDraw.Draw(glow_img)
                gd.ellipse([bx_mid-glow_r, y_top-glow_r,
                             bx_mid+glow_r, y_bot+glow_r],
                           fill=(*OR_BRILLANT[:3], alpha))
                glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=max(2, glow_r//3)))
                img = Image.alpha_composite(img, glow_img)
            draw = ImageDraw.Draw(img)

        wick_tops.append((bx_mid, wy_top))

    # ── 4. LIGNE DE TENDANCE OR ───────────────────────────────────────────────
    # Halo de la ligne
    for width, alpha in [(12, 20), (7, 40), (4, 70)]:
        for i in range(len(wick_tops)-1):
            draw.line([wick_tops[i], wick_tops[i+1]],
                      fill=(*OR_BRILLANT[:3], alpha),
                      width=max(1, int(S*0.006)*width//4))

    # Ligne principale
    for i in range(len(wick_tops)-1):
        t = i / max(1, len(wick_tops)-2)
        c = lerp(OR_CHAUD, OR_CLAIR, t)
        draw.line([wick_tops[i], wick_tops[i+1]],
                  fill=c, width=max(2, int(S*0.012)))

    # Points sur la ligne
    for j, pt in enumerate(wick_tops):
        t = j / max(1, len(wick_tops)-1)
        c = lerp(OR_CHAUD, OR_CLAIR, t)
        dr = max(3, int(S*0.018)) + (2 if j == len(wick_tops)-1 else 0)
        # Halo
        draw.ellipse([pt[0]-dr-3, pt[1]-dr-3, pt[0]+dr+3, pt[1]+dr+3],
                     fill=(*c[:3], 50))
        draw.ellipse([pt[0]-dr, pt[1]-dr, pt[0]+dr, pt[1]+dr], fill=c)
        if j == len(wick_tops)-1:  # Dernier point = plus gros + blanc au centre
            draw.ellipse([pt[0]-dr+3, pt[1]-dr+3, pt[0]+dr-3, pt[1]+dr-3],
                         fill=BLANC)

    # ── 5. ÉTOILE OR AU SOMMET ────────────────────────────────────────────────
    # Position : au-dessus du dernier point de tendance
    star_cx = wick_tops[-1][0]
    star_cy = wick_tops[-1][1] - int(S * 0.065)
    star_r_out = int(S * 0.068)
    star_r_in  = int(S * 0.028)

    # Halo rayonnant de l'étoile (3 couches)
    for halo_r, halo_a in [(star_r_out*3, 12), (star_r_out*2, 28), (star_r_out*1.4, 50)]:
        halo_img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        hd = ImageDraw.Draw(halo_img)
        hd.ellipse([star_cx-halo_r, star_cy-halo_r,
                    star_cx+halo_r, star_cy+halo_r],
                   fill=(*OR_BRILLANT[:3], halo_a))
        halo_img = halo_img.filter(ImageFilter.GaussianBlur(radius=int(halo_r*0.3)))
        img = Image.alpha_composite(img, halo_img)
    draw = ImageDraw.Draw(img)

    # Corps de l'étoile
    star_pts = star_polygon(star_cx, star_cy, star_r_out, star_r_in)
    # Ombre de l'étoile
    shadow_pts = [(x+3, y+3) for x, y in star_pts]
    draw.polygon(shadow_pts, fill=(0, 0, 0, 80))
    # Étoile principale
    draw.polygon(star_pts, fill=OR_CLAIR)
    # Reflet intérieur de l'étoile
    inner_star = star_polygon(star_cx, star_cy,
                               int(star_r_out*0.55), int(star_r_in*0.55))
    draw.polygon(inner_star, fill=BLANC)
    # Éclat central
    r_ec = max(3, int(S*0.012))
    draw.ellipse([star_cx-r_ec, star_cy-r_ec, star_cx+r_ec, star_cy+r_ec],
                 fill=BLANC)

    # Petites étincelles autour de l'étoile (8 rayons)
    for angle_deg in range(0, 360, 45):
        angle = math.radians(angle_deg)
        spark_r1 = star_r_out * 1.35
        spark_r2 = star_r_out * 1.85
        x1 = int(star_cx + spark_r1 * math.cos(angle))
        y1 = int(star_cy + spark_r1 * math.sin(angle))
        x2 = int(star_cx + spark_r2 * math.cos(angle))
        y2 = int(star_cy + spark_r2 * math.sin(angle))
        draw.line([(x1, y1), (x2, y2)],
                  fill=(*OR_CLAIR[:3], 160), width=max(1, int(S*0.008)))

    # ── 6. TEXTE "BRVM" ──────────────────────────────────────────────────────
    font_size = max(10, int(S * 0.155))
    font_bold = None
    for path in [
        "C:/Windows/Fonts/ariblk.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]:
        try:
            font_bold = ImageFont.truetype(path, font_size)
            break
        except Exception:
            pass
    if not font_bold:
        font_bold = ImageFont.load_default()

    text = "BRVM"
    bb = draw.textbbox((0, 0), text, font=font_bold)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    tx = cx - tw//2 - bb[0]
    ty = cy + int(R_CLI * 0.62) + int(S*0.025) - bb[1]

    # Ombre du texte
    draw.text((tx+max(2,int(S*0.005)), ty+max(2,int(S*0.005))),
              text, fill=(0, 0, 0, 160), font=font_bold)
    # Texte or-blanc dégradé simulé (2 passes)
    draw.text((tx, ty), text, fill=OR_CLAIR, font=font_bold)
    # Reflet blanc sur la moitié haute des lettres
    for dy_off in range(max(1, th//4)):
        alpha = int(180 * (1 - dy_off/(th//4)))
        draw.text((tx, ty+dy_off), text,
                  fill=(255, 255, 255, alpha), font=font_bold)

    # ── 7. FILET OR SÉPARATEUR sous le texte ─────────────────────────────────
    sep_y = ty + th + max(3, int(S*0.012))
    sep_w = int(tw * 0.85)
    draw.line([(cx - sep_w//2, sep_y), (cx + sep_w//2, sep_y)],
              fill=(*OR_CHAUD[:3], 150), width=max(1, int(S*0.005)))

    # ── 8. BRILLANCE DE L'ANNEAU OR (arc supérieur) ──────────────────────────
    # Petit reflet brillant sur la partie haute de l'anneau
    for i in range(8):
        ang = math.radians(-140 + i*20)
        r_ref = R_OUT - int(S*0.015)
        xr = int(cx + r_ref * math.cos(ang))
        yr = int(cy + r_ref * math.sin(ang))
        dr = max(2, int(S*0.012))
        alpha = int(200 * math.sin(math.radians((i+1)*18)))
        draw.ellipse([xr-dr, yr-dr, xr+dr, yr+dr],
                     fill=(*OR_CLAIR[:3], alpha))

    # ── Masque circulaire final (anti-aliasing du bord extérieur) ─────────────
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx-R_OUT, cy-R_OUT, cx+R_OUT, cy+R_OUT], fill=255)
    img.putalpha(mask)

    return img


def generate():
    print("\n  Génération du logo BRVM Analytics...")
    print("  « L'Étoile du Taureau d'Or »\n")

    # PNG 512×512
    logo_512 = make_logo(512)
    png_path = STATIC / "logo.png"
    logo_512.save(png_path, "PNG")
    print(f"  [OK] logo.png       512x512")

    # ICO multi-tailles
    # Pillow ICO : la méthode correcte est de passer la grande image (512px)
    # avec le paramètre sizes= qui effectue le redimensionnement LANCZOS automatiquement.
    # append_images n'est pas supporté pour ICO (uniquement GIF/TIFF).
    sizes_ico = [16, 32, 48, 64, 128, 256]

    # Convertir en RGBA si nécessaire
    src = logo_512 if logo_512.mode == "RGBA" else logo_512.convert("RGBA")

    ico_path = STATIC / "logo.ico"
    src.save(ico_path, format="ICO", sizes=[(s, s) for s in sizes_ico])
    ico_bytes = ico_path.stat().st_size
    print(f"  [OK] logo.ico       {sizes_ico}  ({ico_bytes:,} octets)")

    fav_path = STATIC / "favicon.ico"
    fav_sizes = [16, 32, 48]
    src.save(fav_path, format="ICO", sizes=[(s, s) for s in fav_sizes])
    fav_bytes = fav_path.stat().st_size
    print(f"  [OK] favicon.ico    ({fav_bytes:,} octets)")

    print("\n  Logo genere avec succes !\n")


if __name__ == "__main__":
    generate()
