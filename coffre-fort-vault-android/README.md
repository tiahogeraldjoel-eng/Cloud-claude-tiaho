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
- **Import de documents** par scanner intégré (détection des bords, recadrage
  et amélioration automatiques via ML Kit) ou depuis la galerie/un gestionnaire
  de fichiers (images ou PDF — la première page d'un PDF est convertie en
  image), avec catégorisation manuelle et **verso optionnel** — pensé aussi
  pour scanner sur le vif des cartes physiques (carte bancaire, carte
  d'identité, permis de conduire…)
- **Modification et suppression** d'un document existant (appui sur la carte
  puis « Modifier » ou « Supprimer »)
- **OCR embarqué** (ML Kit Text Recognition, modèle inclus dans l'APK —
  fonctionne sans réseau) et détection automatique d'une date d'échéance :
  une date associée à un mot-clé d'expiration est priorisée, sinon les dates
  de naissance/délivrance sont écartées et la date la plus tardive est retenue
- **Chiffrement AES-256/GCM** de chaque document via une clé générée et
  conservée dans l'Android Keystore (la clé ne quitte jamais le composant
  sécurisé de l'appareil, contrairement à un fichier de clé sur disque)
- **Recherche** sur titre, catégorie et texte OCR (base SQLite locale, Room)
- **Notifications d'échéance** : une vérification quotidienne en arrière-plan
  (WorkManager) alerte quand un document expire dans les 30 jours ou est déjà
  expiré, même si l'application n'est pas ouverte
- **Partage P2P local** : QR code d'appairage, puis envoi réel d'un document
  vers l'IP d'un autre appareil sur le même réseau Wi-Fi/Hotspot (appui long
  sur une carte de document → « Envoyer »), sans serveur externe
- **Sauvegarde/restauration chiffrées** (menu ⋮ de la barre du haut) : export
  de tous les documents dans un fichier `.zip` protégé par un mot de passe
  que vous choisissez, importable sur ce téléphone ou un autre

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

## Pourquoi la sauvegarde n'utilise pas la clé de l'Android Keystore

Les documents sont chiffrés au quotidien avec une clé qui vit dans l'Android
Keystore — par conception, cette clé n'est **jamais extractible** de
l'appareil, pas même par l'application elle-même : c'est ce qui la rend sûre,
mais aussi impossible à réutiliser pour restaurer les documents ailleurs.
La sauvegarde chiffre donc chaque document séparément avec une clé dérivée
du mot de passe que vous choisissez (PBKDF2 + AES-256/GCM) ; à l'import, les
documents sont ré-encodés avec la clé Keystore de l'appareil qui importe.
**Sans ce mot de passe, la sauvegarde est irrécupérable** — il n'est stocké
nulle part par l'application.

## Limites connues

- Le protocole P2P (envoi et réception) transite en clair sur le réseau
  local, sans authentification du pair — à n'utiliser que sur un Wi-Fi/
  Hotspot de confiance, jamais sur un réseau public.
- Les documents reçus par P2P ne bénéficient pas de la capture verso (une
  seule face transmise par envoi).
- L'OCR ML Kit reconnaît les scripts latins ; les documents dans d'autres
  écritures ne seront pas indexés par leur texte.
- Si l'appareil n'a aucun verrouillage d'écran configuré (pas de code, pas
  de biométrie), l'application ne peut pas imposer de verrou et démarre
  directement, avec un avertissement affiché à l'utilisateur.
- La vérification quotidienne des échéances dépend de WorkManager, donc du
  planificateur du système (Doze/optimisation de batterie) : l'heure exacte
  d'exécution n'est pas garantie à la minute près.
- Le scanner de document (ML Kit, via Google Play Services) nécessite Google
  Play Services sur l'appareil ; sur un appareil sans Play Services, utilisez
  l'option « Depuis la galerie ».
