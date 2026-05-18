"""
BRVM Analytics — Lanceur double-clic
=====================================
Double-cliquer sur ce fichier (ou sur le raccourci bureau) pour :
  1. Demarrer le serveur BRVM Analytics (si pas deja actif)
  2. Afficher un splash screen "L'Etoile du Taureau d'Or"
  3. Ouvrir le navigateur sur http://localhost:8000

Aucune fenetre console — fonctionne silencieusement.
"""
import tkinter as tk
import threading
import subprocess
import webbrowser
import socket
import time
import os
import sys
import math

# ─── Chemins ──────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_ICO = os.path.join(BASE_DIR, "static", "logo.ico")

# python.exe (pas pythonw) pour demarrer uvicorn
_exe = sys.executable
PYTHON_EXE = _exe.replace("pythonw.exe", "python.exe").replace("pythonw", "python")
if not os.path.exists(PYTHON_EXE):
    PYTHON_EXE = _exe  # fallback

# ─── Constantes visuelles ─────────────────────────────────────────────────────
W, H      = 480, 300
BG        = "#060d1a"
BG2       = "#0d1b2e"
GOLD      = "#f59e0b"
GOLD_LT   = "#fde68a"
GOLD_DK   = "#d97706"
GREEN     = "#22c55e"
RED_C     = "#ef4444"
WHITE     = "#f1f5f9"
SLATE     = "#94a3b8"
SLATE_DK  = "#475569"
INDIGO    = "#818cf8"

# ─── Utilitaires couleur ──────────────────────────────────────────────────────

def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def lerp_hex(c1, c2, t):
    r1, g1, b1 = hex2rgb(c1)
    r2, g2, b2 = hex2rgb(c2)
    return "#{:02x}{:02x}{:02x}".format(
        int(r1+(r2-r1)*t), int(g1+(g2-g1)*t), int(b1+(b2-b1)*t))


def is_server_running(port=8000):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.4)
        res = s.connect_ex(("127.0.0.1", port))
        s.close()
        return res == 0
    except Exception:
        return False

# ─── Fenetre principale ───────────────────────────────────────────────────────
root = tk.Tk()
root.overrideredirect(True)   # sans barre de titre
root.attributes("-topmost", True)
try:
    root.attributes("-alpha", 0.97)
except Exception:
    pass

sw = root.winfo_screenwidth()
sh = root.winfo_screenheight()
root.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")
root.configure(bg=BG)

# Tenter de charger l'icone
try:
    if os.path.exists(LOGO_ICO):
        root.iconbitmap(LOGO_ICO)
except Exception:
    pass

# ─── Canvas principal ─────────────────────────────────────────────────────────
cv = tk.Canvas(root, width=W, height=H, bg=BG,
               highlightthickness=0, relief="flat")
cv.pack(fill="both", expand=True)

# ─── Fond dégradé simulé (lignes horizontales) ────────────────────────────────
for y in range(H):
    t = y / H
    c = lerp_hex(BG2, BG, t)
    cv.create_line(0, y, W, y, fill=c)

# ─── Bordure or ───────────────────────────────────────────────────────────────
# Bord extérieur or
cv.create_rectangle(0, 0, W-1, H-1, outline=GOLD_DK, width=2)
cv.create_rectangle(2, 2, W-3, H-3, outline=GOLD, width=1)
# Barre or en haut
cv.create_rectangle(2, 2, W-3, 6, fill=GOLD, outline="")

# ─── Mini logo canvas (partie gauche) ────────────────────────────────────────
LX, LY = 22, 28        # coin haut-gauche de la zone logo
LS = 125               # taille zone logo

def draw_mini_logo():
    """Dessine le logo 'Etoile du Taureau d'Or' sur le canvas tkinter."""
    # Cercle fond
    cv.create_oval(LX, LY, LX+LS, LY+LS,
                   fill="#0a0f20", outline=GOLD_DK, width=3)
    # Anneau or (simulé par 2 cercles)
    cv.create_oval(LX+2, LY+2, LX+LS-2, LY+LS-2,
                   fill="", outline=GOLD, width=2)
    cv.create_oval(LX+5, LY+5, LX+LS-5, LY+LS-5,
                   fill="", outline="#92400e", width=1)

    # Zone graphique
    GX1 = LX + 12
    GX2 = LX + LS - 10
    GY_B = LY + LS - 20   # bas des bougies
    GY_T = LY + 28         # haut possible

    n   = 6
    bw  = int((GX2 - GX1) / n * 0.58)
    gap = (GX2 - GX1 - bw*n) // (n+1)

    heights = [0.22, 0.36, 0.28, 0.52, 0.68, 0.85]
    colors  = [GREEN, GREEN, RED_C, GREEN, GREEN, GOLD]
    chart_h = GY_B - GY_T
    tops    = []

    for i, (h, c) in enumerate(zip(heights, colors)):
        bx = GX1 + gap*(i+1) + bw*i
        bar_h = int(chart_h * h)
        y_top = GY_B - bar_h
        # Mèche
        wt = y_top - max(2, int(bar_h*0.10))
        cv.create_line(bx+bw//2, wt, bx+bw//2, y_top, fill=c, width=1)
        cv.create_line(bx+bw//2, GY_B, bx+bw//2, GY_B+3, fill=c, width=1)
        # Corps bougie
        cv.create_rectangle(bx, y_top, bx+bw, GY_B,
                             fill=c, outline="", width=0)
        tops.append((bx+bw//2, wt))

    # Ligne de tendance or
    for i in range(len(tops)-1):
        cv.create_line(tops[i][0], tops[i][1], tops[i+1][0], tops[i+1][1],
                       fill=GOLD, width=2, smooth=True)

    # Points sur la ligne
    for j, (px, py) in enumerate(tops):
        r = 3 if j < len(tops)-1 else 4
        cv.create_oval(px-r, py-r, px+r, py+r, fill=GOLD_LT, outline="")

    # Étoile au sommet
    scx, scy = tops[-1][0], tops[-1][1] - 12
    R_out, R_in = 9, 4
    star_pts = []
    for k in range(10):
        ang = math.radians(-90 + k*36)
        r   = R_out if k%2==0 else R_in
        star_pts += [scx + r*math.cos(ang), scy + r*math.sin(ang)]
    # Halo
    cv.create_oval(scx-14, scy-14, scx+14, scy+14,
                   fill="#2a1800", outline="")
    cv.create_oval(scx-10, scy-10, scx+10, scy+10,
                   fill="#3d2200", outline="")
    # Étoile
    cv.create_polygon(star_pts, fill=GOLD_LT, outline=GOLD, width=1)
    # Centre étoile
    cv.create_oval(scx-3, scy-3, scx+3, scy+3, fill=WHITE, outline="")

    # Texte BRVM dans le cercle (bas)
    cv.create_text(LX+LS//2, LY+LS-10,
                   text="BRVM",
                   fill=GOLD_LT,
                   font=("Arial Black", 9, "bold"))


draw_mini_logo()

# ─── Textes à droite ──────────────────────────────────────────────────────────
TX = LX + LS + 22   # x de départ du texte

# Titre principal
cv.create_text(TX, 38, text="BRVM Analytics",
               fill=WHITE, font=("Arial", 20, "bold"), anchor="w")

# Sous-titre or
cv.create_text(TX, 65, text="L'Étoile du Taureau d'Or",
               fill=GOLD, font=("Arial", 11, "italic"), anchor="w")

# Séparateur fin
cv.create_line(TX, 80, W-20, 80, fill=GOLD_DK, width=1)

# Description
cv.create_text(TX, 96,
               text="Analyse Technique  •  Fondamentale",
               fill=SLATE, font=("Arial", 9), anchor="w")
cv.create_text(TX, 114,
               text="Psychologie du Marché  •  Dividendes",
               fill=SLATE, font=("Arial", 9), anchor="w")

# ─── Barre de progression ─────────────────────────────────────────────────────
PB_X1, PB_Y1 = 22, 190
PB_X2, PB_Y2 = W-22, 208

# Fond de la barre
cv.create_rectangle(PB_X1, PB_Y1, PB_X2, PB_Y2,
                    fill="#111827", outline=GOLD_DK, width=1)

# Barre de progression (on la fait bouger)
pb_fill = cv.create_rectangle(PB_X1+1, PB_Y1+1, PB_X1+1, PB_Y2-1,
                               fill=GOLD_DK, outline="")

# Reflet brillant sur la barre (sera mis à jour)
pb_shine = cv.create_rectangle(PB_X1+1, PB_Y1+1, PB_X1+1, PB_Y1+4,
                                fill=GOLD_LT, outline="")

# Texte de statut
status_id = cv.create_text(W//2, 222,
                            text="Initialisation...",
                            fill=SLATE, font=("Arial", 9))

# Texte progression %
pct_id = cv.create_text(W-28, 222,
                         text="0%",
                         fill=SLATE_DK, font=("Arial", 8))

# Version / copyright
cv.create_text(W//2, 270,
               text="BRVM Analytics v2.0   •   © 2025   •   http://localhost:8000",
               fill=SLATE_DK, font=("Arial", 7))

# Bouton fermer (×) discret
close_btn = cv.create_text(W-12, 14, text="✕",
                            fill=SLATE_DK, font=("Arial", 10))
cv.tag_bind(close_btn, "<Button-1>", lambda e: root.destroy())
cv.tag_bind(close_btn, "<Enter>",    lambda e: cv.itemconfigure(close_btn, fill=WHITE))
cv.tag_bind(close_btn, "<Leave>",    lambda e: cv.itemconfigure(close_btn, fill=SLATE_DK))

# ─── Mise à jour de la barre ──────────────────────────────────────────────────
_current_pct = [0]

def set_progress(pct: float, msg: str):
    _current_pct[0] = pct
    bar_w = int((PB_X2 - PB_X1 - 2) * pct / 100)
    x_end = PB_X1 + 1 + bar_w

    # Dégradé or sur la barre
    t = pct / 100
    fill_c = lerp_hex(GOLD_DK, GOLD, t)
    cv.coords(pb_fill, PB_X1+1, PB_Y1+1, x_end, PB_Y2-1)
    cv.itemconfigure(pb_fill, fill=fill_c)
    cv.coords(pb_shine, PB_X1+1, PB_Y1+1, x_end, PB_Y1+4)

    cv.itemconfigure(status_id, text=msg)
    cv.itemconfigure(pct_id, text=f"{int(pct)}%")
    try:
        root.update_idletasks()
    except Exception:
        pass

# ─── Animation de la barre (shimmer) ─────────────────────────────────────────
_shimmer_running = [True]

def animate_shimmer():
    """Fait scintiller le reflet de la barre pendant le chargement."""
    _tick = [0]
    def _step():
        if not _shimmer_running[0]:
            return
        pct = _current_pct[0]
        if pct > 0 and pct < 100:
            bar_w = int((PB_X2 - PB_X1 - 2) * pct / 100)
            x_end = PB_X1 + 1 + bar_w
            t = (_tick[0] % 40) / 40
            shine_x1 = PB_X1 + 1 + int(bar_w * t * 0.8)
            shine_x2 = min(x_end, shine_x1 + max(10, bar_w//6))
            cv.coords(pb_shine, shine_x1, PB_Y1+1, shine_x2, PB_Y1+4)
        _tick[0] += 1
        try:
            root.after(50, _step)
        except Exception:
            pass
    _step()

root.after(200, animate_shimmer)

# ─── Logique de lancement ─────────────────────────────────────────────────────
def launch():
    try:
        set_progress(5, "Vérification du serveur...")
        time.sleep(0.3)

        if is_server_running(8000):
            # Serveur déjà actif
            set_progress(75, "Serveur actif — connexion en cours...")
            time.sleep(0.6)
            set_progress(90, "Ouverture de l'interface de trading...")
            time.sleep(0.4)
        else:
            # Démarrer le serveur
            set_progress(12, "Démarrage du serveur BRVM Analytics...")
            time.sleep(0.2)

            try:
                flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                subprocess.Popen(
                    [PYTHON_EXE, "-m", "uvicorn", "app:app",
                     "--host", "0.0.0.0", "--port", "8000"],
                    cwd=BASE_DIR,
                    creationflags=flags,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception as e:
                set_progress(0, f"Erreur démarrage : {e}")
                time.sleep(3)
                return

            # Attente jusqu'à 20 secondes max
            messages = [
                "Chargement des cours BRVM...",
                "Analyse des fondamentaux...",
                "Calcul des indicateurs techniques...",
                "Préparation du marché...",
                "Chargement de l'historique 10 ans...",
                "Calcul des dividendes...",
                "Presque prêt...",
            ]
            for step in range(60):
                time.sleep(0.32)
                pct = 12 + int(step * 1.28)
                msg = messages[min(step // 9, len(messages)-1)]
                set_progress(pct, msg)
                if is_server_running(8000):
                    break

        # Finalisation
        set_progress(95, "Ouverture de l'interface...")
        time.sleep(0.3)
        webbrowser.open("http://localhost:8000")
        set_progress(100, "✓ Bienvenue sur BRVM Analytics !")
        time.sleep(1.5)

    except Exception:
        pass
    finally:
        _shimmer_running[0] = False
        try:
            root.after(0, root.destroy)
        except Exception:
            pass


threading.Thread(target=launch, daemon=True).start()
root.mainloop()
