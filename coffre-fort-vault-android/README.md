# Coffre-Fort Vault — Application Android

Portage natif Android (Kotlin) du Coffre-Fort Administratif Hors-Ligne :
archivage chiffré de documents, OCR embarqué, recherche, et appairage P2P
local par QR code — le tout sans connexion Internet.

Pourquoi un portage natif plutôt qu'une simple recompilation de la version
Python (`coffre-fort-vault/`) : cette dernière utilise Tkinter/customtkinter,
qui ne peut pas s'exécuter sur Android. Cette application réimplémente les
mêmes fonctionnalités avec les briques natives Android correspondantes.

## Fonctionnalités

- **Verrouillage de l'application** : empreinte digitale, visage, ou code/schéma
  de l'appareil en secours, requis à chaque ouverture ou retour au premier plan
- **Import de documents** depuis la galerie, avec catégorisation manuelle
- **OCR embarqué** (ML Kit Text Recognition, modèle inclus dans l'APK —
  fonctionne sans réseau) et détection automatique d'une date d'échéance
- **Chiffrement AES-256/GCM** de chaque document via une clé générée et
  conservée dans l'Android Keystore (la clé ne quitte jamais le composant
  sécurisé de l'appareil, contrairement à un fichier de clé sur disque)
- **Recherche** sur titre, catégorie et texte OCR (base SQLite locale, Room)
- **Partage P2P local** : QR code contenant l'IP locale pour un appairage
  sur le même réseau Wi-Fi/Hotspot, sans serveur externe

## Prérequis

- Android Studio Hedgehog (2023.1.1) ou supérieur
- Android SDK API 26 minimum, API 34 cible
- JDK 17

## Compiler l'APK

### Via Android Studio (recommandé)

1. Ouvrir ce dossier (`coffre-fort-vault-android/`) dans Android Studio
2. `Build > Build Bundle(s)/APK(s) > Build APK(s)`
3. L'APK se trouve dans `app/build/outputs/apk/debug/`

### Via ligne de commande

```bash
export ANDROID_HOME=/path/to/android/sdk
./build.sh debug     # APK debug (installation directe)
./build.sh release   # APK release
./build.sh studio    # Ouvre Android Studio
```

### Via GitHub Actions

Le workflow `.github/workflows/build-coffre-fort-vault-android.yml` compile
automatiquement un APK debug à chaque modification de
`coffre-fort-vault-android/`, ou manuellement depuis l'onglet **Actions**
du dépôt (bouton *Run workflow*). L'APK est disponible en téléchargement
dans les *artifacts* du run correspondant.

## Stockage des données

Les documents chiffrés et la base SQLite sont stockés dans l'espace privé
de l'application (`context.filesDir`), inaccessible aux autres apps sans
root — aucune permission de stockage n'est requise.

## Limites connues

- Le partage P2P affiche un QR code d'appairage et démarre un serveur
  d'écoute local, mais ne réalise pas encore un transfert de fichier
  complet (parité avec la version Python d'origine, qui avait la même
  limite).
- L'OCR ML Kit reconnaît les scripts latins ; les documents dans d'autres
  écritures ne seront pas indexés par leur texte.
- Si l'appareil n'a aucun verrouillage d'écran configuré (pas de code, pas
  de biométrie), l'application ne peut pas imposer de verrou et démarre
  directement, avec un avertissement affiché à l'utilisateur.
