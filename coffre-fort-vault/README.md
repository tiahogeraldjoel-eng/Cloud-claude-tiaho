# Coffre-Fort Administratif Hors-Ligne

Application de bureau (Windows / Linux / macOS) pour archiver des documents
administratifs de façon chiffrée et 100 % hors-ligne : import d'image, OCR
automatique, chiffrement AES (Fernet), recherche plein texte, et partage
local par QR code / Wi-Fi (sans passer par Internet).

## Fonctionnalités

- **Import de documents** (PNG/JPG) avec catégorisation manuelle
- **OCR automatique** (Tesseract via `pytesseract`) et détection de date
  d'échéance dans le texte extrait
- **Chiffrement** du fichier original avant stockage sur disque
- **Recherche plein texte** (SQLite FTS5) sur titre, catégorie et texte OCR
- **Partage P2P local** : génère un QR code contenant l'IP locale pour un
  appairage sur le même réseau Wi-Fi/Hotspot, sans serveur externe

## Prérequis

- Python 3.10+
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) installé sur
  le système (l'OCR est désactivé avec un avertissement si absent, le reste
  de l'application continue de fonctionner) :
  - Windows : [installeur officiel](https://github.com/UB-Mannheim/tesseract/wiki)
  - macOS : `brew install tesseract`
  - Linux (Debian/Ubuntu) : `sudo apt-get install tesseract-ocr`

## Lancer en développement

```bash
pip install -r requirements.txt
python vault_app.py
```

## Données de l'application

Au premier lancement, l'application crée un dossier de données dans le
profil utilisateur (`~/.coffre_fort_vault`) contenant :

- `vault.key` — clé de chiffrement Fernet, générée une seule fois puis
  réutilisée à chaque lancement (sans elle, les documents chiffrés
  deviennent illisibles — **ne pas supprimer ni partager ce fichier**)
- `vault.db` — base SQLite (métadonnées + index de recherche)
- `documents/` — fichiers originaux chiffrés (`.dat`)

## Compiler une application installable

### Localement (PyInstaller)

```bash
./build.sh          # exécutable "onefile"
./build.sh onedir    # dossier autonome "onedir"
```

L'exécutable est généré dans `dist/`. PyInstaller ne fait **pas** de
compilation croisée : lancez le script sur le même système d'exploitation
que celui ciblé (Linux → binaire Linux, Windows → `.exe`, macOS → binaire
macOS).

### Via GitHub Actions (recommandé pour un .exe Windows)

Le workflow `.github/workflows/build-vault-app.yml` compile automatiquement
un exécutable Windows (`CoffreFortVault.exe`) et Linux à chaque
modification du dossier `coffre-fort-vault/`, ou manuellement depuis
l'onglet **Actions** du dépôt (bouton *Run workflow*). Les binaires sont
disponibles en téléchargement dans les *artifacts* du run correspondant.

## Note de sécurité

Le chiffrement protège les fichiers stockés sur disque, mais la clé
(`vault.key`) n'est pas elle-même protégée par un mot de passe maître :
toute personne ayant accès à ce fichier peut déchiffrer les documents.
Protégez l'accès au dossier `~/.coffre_fort_vault` (permissions du système
de fichiers, chiffrement de disque) comme vous le feriez pour tout coffre
contenant des documents sensibles.

Le partage P2P est prévu pour un réseau local de confiance uniquement (pas
d'authentification ni de chiffrement du canal réseau) : à n'utiliser que
sur un Wi-Fi/Hotspot personnel.
