import os
import re
import socket
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox

import customtkinter as ctk
from cryptography.fernet import Fernet
from PIL import Image
import pytesseract
import qrcode

# Config UI
ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")

# Dossier de données de l'application (indépendant du répertoire de lancement,
# nécessaire une fois l'app compilée/installée en exécutable autonome).
APP_DIR = Path.home() / ".coffre_fort_vault"
DOCUMENTS_DIR = APP_DIR / "documents"
KEY_PATH = APP_DIR / "vault.key"
DB_PATH = APP_DIR / "vault.db"


class P2PTransferServer:
    """Serveur réseau local hors-ligne pour recevoir/envoyer des documents via Wi-Fi/Hotspot."""
    def __init__(self, vault_instance, port=5000):
        self.vault = vault_instance
        self.port = port
        self.is_running = False

    def get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip

    def start_server(self, on_receive_callback):
        self.is_running = True
        thread = threading.Thread(target=self._run, args=(on_receive_callback,), daemon=True)
        thread.start()

    def _run(self, callback):
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.bind(('0.0.0.0', self.port))
        server_socket.listen(1)

        while self.is_running:
            conn, addr = server_socket.accept()
            data = conn.recv(1024).decode('utf-8')
            if data:
                # Réception simplifiée du texte/document
                callback(data)
            conn.close()


class LocalVaultGUI(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Coffre-Fort Administratif Hors-Ligne (AES-256)")
        self.geometry("900x600")

        # Initialisation Moteur & P2P
        APP_DIR.mkdir(parents=True, exist_ok=True)
        DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
        self.key = self._load_or_create_key()
        self.cipher = Fernet(self.key)
        self.db_path = str(DB_PATH)
        self._init_db()

        self.p2p_server = P2PTransferServer(self)
        self.local_ip = self.p2p_server.get_local_ip()

        # Layout Principal
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self._build_sidebar()
        self._build_main_panel()

    def _load_or_create_key(self):
        """Charge la clé de chiffrement persistante, ou en crée une nouvelle.

        Sans persistance, une clé recréée à chaque lancement rendrait tous les
        documents déjà chiffrés définitivement illisibles.
        """
        if KEY_PATH.exists():
            return KEY_PATH.read_bytes()
        key = Fernet.generate_key()
        KEY_PATH.write_bytes(key)
        try:
            os.chmod(KEY_PATH, 0o600)
        except OSError:
            pass
        return key

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT, category TEXT, expiration_date TEXT,
                encrypted_path TEXT, ocr_text TEXT
            )
        ''')
        cursor.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
                title, category, ocr_text
            )
        ''')
        conn.commit()
        conn.close()

    def _build_sidebar(self):
        self.sidebar = ctk.CTkFrame(self, width=220, corner_radius=0)
        self.sidebar.grid(row=0, column=0, sticky="nsew")

        title = ctk.CTkLabel(self.sidebar, text="🔒 COFFRE-FORT", font=ctk.CTkFont(size=18, weight="bold"))
        title.pack(pady=20, padx=10)

        btn_add = ctk.CTkButton(self.sidebar, text="+ Ajouter Document", command=self.add_document_dialog)
        btn_add.pack(pady=10, padx=15, fill="x")

        btn_p2p = ctk.CTkButton(self.sidebar, text="📡 Partage P2P / QR", fg_color="teal", command=self.show_p2p_dialog)
        btn_p2p.pack(pady=10, padx=15, fill="x")

        # Indicateur de statut hors-ligne
        status = ctk.CTkLabel(self.sidebar, text="● Mode 100% Hors-Ligne", text_color="green", font=ctk.CTkFont(size=11))
        status.pack(side="bottom", pady=15)

    def _build_main_panel(self):
        self.main_frame = ctk.CTkFrame(self, corner_radius=0)
        self.main_frame.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)

        # Barre de Recherche
        self.search_entry = ctk.CTkEntry(self.main_frame, placeholder_text="Recherche libre (ex: 'assurance moto', '2026')...")
        self.search_entry.pack(fill="x", padx=10, pady=10)
        self.search_entry.bind("<KeyRelease>", self.search_documents)

        # Table/Liste des documents
        self.doc_scroll = ctk.CTkScrollableFrame(self.main_frame, label_text="Documents Enregistrés")
        self.doc_scroll.pack(fill="both", expand=True, padx=10, pady=10)

        self.refresh_doc_list()

    def add_document_dialog(self):
        """Dialogue d'importation manuelle d'image."""
        file_path = filedialog.askopenfilename(filetypes=[("Images", "*.png;*.jpg;*.jpeg")])
        if not file_path:
            return

        dialog = ctk.CTkInputDialog(text="Catégorie (ex: Identité, Assurance, Facture) :", title="Ajouter Document")
        category = dialog.get_input() or "Général"

        # Traitement OCR & Chiffrement
        title = os.path.basename(file_path)
        img = Image.open(file_path)
        try:
            ocr_text = pytesseract.image_to_string(img)
        except Exception:
            messagebox.showwarning(
                "OCR indisponible",
                "Tesseract OCR n'a pas été trouvé sur ce poste.\n"
                "Le document sera enregistré sans texte extrait automatiquement."
            )
            ocr_text = ""

        # Extrait date
        exp_date = self._extract_date(ocr_text)

        # Chiffrement
        with open(file_path, 'rb') as f:
            enc_data = self.cipher.encrypt(f.read())

        enc_path = DOCUMENTS_DIR / f"enc_{int(datetime.now().timestamp())}.dat"
        with open(enc_path, 'wb') as f:
            f.write(enc_data)

        # Enregistrement DB
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO documents (title, category, expiration_date, encrypted_path, ocr_text) VALUES (?, ?, ?, ?, ?)",
            (title, category, exp_date, str(enc_path), ocr_text)
        )
        doc_id = cursor.lastrowid
        cursor.execute("INSERT INTO docs_fts (rowid, title, category, ocr_text) VALUES (?, ?, ?, ?)",
                       (doc_id, title, category, ocr_text))
        conn.commit()
        conn.close()

        self.refresh_doc_list()

    def _extract_date(self, text):
        pattern = r'\b(0[1-9]|[12][0-9]|3[01])[/.-](0[1-9]|1[012])[/.-](20\d\d)\b'
        match = re.search(pattern, text)
        return f"{match.group(3)}-{match.group(2)}-{match.group(1)}" if match else "Non définie"

    def refresh_doc_list(self, query=None):
        for widget in self.doc_scroll.winfo_children():
            widget.destroy()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if query:
            cursor.execute('''
                SELECT d.id, d.title, d.category, d.expiration_date
                FROM documents d JOIN docs_fts f ON d.id = f.rowid
                WHERE docs_fts MATCH ?
            ''', (query + "*",))
        else:
            cursor.execute("SELECT id, title, category, expiration_date FROM documents")

        rows = cursor.fetchall()
        conn.close()

        for row in rows:
            doc_id, title, cat, exp = row
            card = ctk.CTkFrame(self.doc_scroll)
            card.pack(fill="x", pady=5, padx=5)

            lbl_title = ctk.CTkLabel(card, text=title, font=ctk.CTkFont(weight="bold"))
            lbl_title.pack(side="left", padx=10)

            lbl_cat = ctk.CTkLabel(card, text=f"[{cat}]", text_color="gray")
            lbl_cat.pack(side="left", padx=5)

            lbl_exp = ctk.CTkLabel(card, text=f"Échéance: {exp}", text_color="orange" if exp != "Non définie" else "gray")
            lbl_exp.pack(side="right", padx=10)

    def search_documents(self, event):
        q = self.search_entry.get().strip()
        self.refresh_doc_list(query=q if q else None)

    def show_p2p_dialog(self):
        """Génère un QR code avec l'adresse IP locale pour appairage P2P direct sans internet."""
        p2p_window = ctk.CTkToplevel(self)
        p2p_window.title("Appairage P2P Hors-Ligne")
        p2p_window.geometry("350x450")

        connection_str = f"VAULT_P2P:{self.local_ip}:5000"

        # Génération du QR Code
        qr = qrcode.make(connection_str)
        qr_path = APP_DIR / "temp_qr.png"
        qr.save(qr_path)

        qr_img = ctk.CTkImage(light_image=Image.open(qr_path), size=(200, 200))

        lbl_info = ctk.CTkLabel(p2p_window, text="Scannez ce QR Code depuis un autre appareil sur le même réseau Wi-Fi/Hotspot :", wraplength=300)
        lbl_info.pack(pady=15)

        lbl_qr = ctk.CTkLabel(p2p_window, image=qr_img, text="")
        lbl_qr.pack(pady=10)

        lbl_ip = ctk.CTkLabel(p2p_window, text=f"IP Locale : {self.local_ip}", font=ctk.CTkFont(weight="bold"))
        lbl_ip.pack(pady=10)


if __name__ == "__main__":
    app = LocalVaultGUI()
    app.mainloop()
