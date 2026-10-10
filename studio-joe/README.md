# Studio Joe

Suite d'outils de création pour usage personnel, inspirée d'Adobe, qui fonctionne
entièrement dans le navigateur (ordinateur ou téléphone), **sans internet** et
**sans envoyer aucun fichier** sur un serveur — à une exception près, choisie par
l'utilisateur : la lecture de l'écriture manuscrite et la traduction par l'IA Claude
(voir plus bas).

| Application | Équivalent Adobe | Fichier |
|---|---|---|
| **PDF Joe** | Acrobat | `pdf.html` |
| **Photo Joe** | Photoshop / Lightroom | `photo.html` |
| **Design Joe** | Illustrator / Canva / Express | `design.html` |
| **Video Joe** | Premiere Pro | `video.html` |
| **Dictée Joe** | Dictée / Dragon | `dictee.html` |
| **Voix Joe** | Lecture audio / synthèse vocale | `voix.html` |

## Utilisation

1. Copier le dossier `studio-joe` (ordinateur, clé USB, téléphone).
2. Ouvrir `index.html` dans Chrome, Edge ou Firefox.

Aucune installation : les bibliothèques sont incluses dans `lib/`.

### Installer comme une application (téléphone, ordinateur)
Depuis le site publié (https://tiahogeraldjoel-eng.github.io/Cloud-claude-tiaho/) :
- **Android (Chrome)** : bouton « Installer l'application » de la page d'accueil, ou menu ⋮ →
  « Installer l'application » / « Ajouter à l'écran d'accueil ».
- **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».
- **Ordinateur (Chrome, Edge)** : icône d'installation dans la barre d'adresse.

Une fois installée, l'application s'ouvre en plein écran et fonctionne sans connexion
(toute l'application, environ 17 Mo, est gardée sur l'appareil).

## Fonctions

### PDF Joe
- Ouvrir plusieurs PDF et images, les fusionner en un seul document
- Réordonner (glisser-déposer), pivoter, dupliquer, supprimer, insérer une page blanche
- Annoter et signer : texte, date du jour, coche, croix, surlignage, cadre,
  rectangle plein, effaceur blanc, trait, image/tampon, signature (dessinée,
  écrite ou importée depuis une photo, mémorisée sur l'appareil)
- Remplir les formulaires PDF (champs détectés automatiquement, puis aplatis)
- Filigrane, numérotation des pages, en-tête et pied de page (`{date}`, `{n}`, `{total}`)
- Diviser (une page par fichier, toutes les N pages, plages `1-3, 4-fin`) en ZIP
- Compresser, aplatir en images (anti-copie), PDF → PNG/JPG/WebP, extraire le texte
- **OCR des PDF scannés** (français, anglais ou les deux, hors ligne) : le texte est reconnu puis
  ajouté en couche invisible ; le PDF devient consultable par recherche, copiable,
  et son texte modifiable avec l'outil « Modifier un texte existant »
- **Écriture manuscrite** (option en ligne) : la page est envoyée à l'IA Claude
  (Anthropic, modèle `claude-opus-5-5`) avec la clé API de l'utilisateur, après
  un écran d'accord ; le texte lu est ajouté au PDF comme pour l'OCR. Clé
  mémorisée seulement si l'utilisateur le demande (bouton « Oublier la clé »)
- **Traduction du document** (option en ligne, IA Claude) : 17 langues dont
  français, anglais, arabe, chinois, mooré, dioula, fulfulde ; langue d'origine
  détectée ; pages scannées lues sur l'image ; résultat en nouveau PDF, en pages
  insérées après les originales, ou en texte
- **Modifier un texte existant** du PDF (cliquer sur le mot, le retaper)
- **Caviardage définitif** : le contenu masqué est réellement supprimé du fichier
- PDF protégés : ouverture avec le mot de passe, sans perte de qualité
- **Protection par mot de passe** à l'enregistrement (AES-256) avec droits
  d'impression, de copie et de modification
- Annuler / rétablir illimité, raccourcis clavier

### Photo Joe
- Calques : opacité, 16 modes de fusion, renommer, masquer, fusionner, aplatir
- Outils : déplacement, sélection rectangulaire, recadrage (A4, 1:1, 16:9, 4:5,
  photo d'identité 35×45), pinceau (pression du stylet), gomme, tampon de
  duplication, flou localisé, pot de peinture, gomme magique, dégradé, texte,
  formes (rectangle, arrondi, ellipse, ligne, flèche), pipette, main
- Réglages en direct : exposition, luminosité, contraste, hautes lumières,
  ombres, température, teinte, vibrance, saturation, teinte (°)
- Filtres : auto-amélioration, noir et blanc, sépia, négatif, flou, netteté,
  contours, relief, pixeliser, grain, vignette, postériser, seuil,
  « document scanné », suppression du fond
- Image : redimensionner, taille de la zone de travail, rotation, miroir
- Export PNG / JPG / WebP, projet `.joeimg`, coller une image (Ctrl+V), histogramme
- Extraction du texte d'une photo ou d'une zone sélectionnée (OCR), imprimé ou manuscrit
- Traduction du texte d'une photo ou d'une zone (IA Claude, en ligne)

### Design Joe
- Rectangle, ellipse, polygone, étoile, ligne/flèche, plume, crayon, texte, image
- Remplissage uni ou dégradé, contour, pointillés, ombre portée, modes de fusion
- Rotation, redimensionnement, groupes, verrouillage, calques, ordre de superposition
- Alignement, répartition, repères magnétiques, édition des points d'un tracé
- **Fonctions de type Canva** :
  - documents de plusieurs pages (ajouter, dupliquer, réordonner) et mode
    **Présenter** en plein écran (F5, flèches, Échap)
  - bibliothèque d'éléments (touche K) : styles de texte, formes, 40 icônes,
    autocollants, cadres photo (cercle, cœur, étoile, arche…), grilles de collage
  - cadres photo : glisser une photo sur le cadre pour la placer
  - filtres photo (Vif, Noir & blanc, Chaud, Vintage…) et réglages,
    suppression du fond
  - graphiques (colonnes, barres, courbe, secteurs, anneau), tableaux et
    QR codes, modifiables à tout moment
  - effets de texte : courbé, néon, surlignage, contour, ombre
  - redimensionnement magique vers un autre format (story, A4, bannière…)
  - kit de marque : couleurs et polices réutilisées partout
- **Animations** : entrée (fondu, glisser, pop, rebond, révéler…), boucle,
  sortie, transitions entre pages, « Animer la page » en un clic, aperçu animé
- **Export vidéo MP4 / WebM et GIF animé** des designs animés
- **Plume Bézier** (cliquer-glisser pour les courbes), édition des poignées,
  double-clic sur un point : angle ↔ courbe
- **Pathfinder** : réunir, soustraire, intersection, exclure, vectoriser
- **PDF vectoriel** (texte net et sélectionnable) ou haute résolution
- Modèles : publication carrée, carte de visite, affiche/avis A4 avec QR code,
  story, logo, bannière, page A4, présentation de 4 diapositives, invitation,
  attestation, CV, collage photos
- **Traduire le design** (IA Claude, en ligne) : textes, tableaux et graphiques,
  en copie de page ou sur place, avec ajustement de la taille du texte
- Export PNG, JPG (une page ou toutes en ZIP), SVG, PDF multipage ; projet `.joedesign`

### Video Joe
- Import de vidéos, sons et images ; formes d'onde des pistes audio
- Timeline : 3 pistes vidéo (V1-V3) et 2 pistes audio (A1-A2), zoom, magnétisme,
  pistes masquables ou muettes
- Outils : sélection, cutter, couper à la tête de lecture (S), raccourcir par les
  bords, déplacer entre pistes, dupliquer, supprimer et combler le vide,
  détacher l'audio d'une vidéo
- Titres : centré, bandeau bas, sous-titre, générique déroulant, carton ;
  animations fondu, glissement, montée, zoom, machine à écrire
- Transitions : fondu enchaîné, fondu au noir, glissement, poussée, zoom,
  volet, iris ; fondus d'ouverture et de fermeture
- Images clés sur la position, l'échelle, la rotation, l'opacité et le volume
- Couleur : luminosité, contraste, saturation, teinte, noir et blanc, sépia,
  flou, préréglages (Cinéma, Chaud, Froid, Vintage…)
- Ken Burns sur les photos, vitesse de 0,25× à 4×, volume jusqu'à 300 %
- Formats : 16:9, 9:16 (story), 1:1, 4:5 ; 24/25/30 images/s
- **Transcription et sous-titres automatiques** avec Whisper, exécuté dans le
  navigateur (le son ne quitte pas l'appareil) : sous-titres placés sur la timeline,
  export `.srt`, `.vtt`, `.txt` ; transcription de n'importe quel fichier audio ou
  vidéo ; 15 langues parlées ou détection automatique ; option traduction en anglais.
  Le moteur et le modèle (≈ 80 Mo ou 250 Mo) se téléchargent à la première utilisation
- Traduction des titres et sous-titres (IA Claude, en ligne), en remplacement ou
  en sous-titres bilingues sur une autre piste
- Export MP4 (ou WebM selon le navigateur) avec le son, capture d'image PNG,
  projet `.joevideo` (les médias sont reliés à la réouverture)

### Dictée Joe (reconnaissance vocale au micro)
- Deux moteurs : **Navigateur** (texte instantané pendant que l'on parle, via le
  service vocal de Chrome/Edge, internet nécessaire) ou **Whisper** (privé : le son
  reste sur l'appareil, texte à chaque pause, modèle téléchargé la première fois)
- 11 langues, commandes vocales de ponctuation (« virgule », « point »,
  « point d'interrogation », « à la ligne », « nouveau paragraphe »…), majuscules
  automatiques
- Horodatage des phrases, enregistrement du son en parallèle, indicateur de niveau,
  compteur de mots, brouillon conservé dans le navigateur
- Export `.txt`, sous-titres `.srt`, enregistrement audio, traduction (IA Claude)
- Bouton **🎤 Dicter** dans les champs de texte de PDF Joe (annotations),
  Photo Joe (texte), Design Joe (texte) et Video Joe (titres)

### Voix Joe (synthèse vocale)
- Lecture à voix haute avec les voix installées sur l'appareil : choix de la voix et
  de la langue, vitesse, hauteur, volume, pause, phrase précédente ou suivante,
  phrase en cours surlignée (clic sur une phrase pour reprendre à cet endroit)
- Ouverture d'un fichier texte, de sous-titres ou d'un PDF
- Fichier audio `.wav` créé par une voix neuronale MMS (français, anglais) qui tourne
  dans le navigateur ; modèle téléchargé la première fois
- Aussi : « Lire le document à voix haute » dans PDF Joe, « Relire » dans Dictée Joe,
  « Voix off à partir d'un texte » dans Video Joe (son placé sur une piste audio,
  sous-titres en option)

## Limites connues
- L'OCR hors ligne reconnaît le texte imprimé en français et en anglais ; l'écriture
  manuscrite passe par l'option en ligne (internet et clé API Anthropic payante).
- La dictée « Navigateur » ne fonctionne que dans Chrome et Edge (Firefox : utiliser
  Whisper) ; le micro doit être autorisé pour la page.
- Les voix de lecture dépendent de l'appareil (Windows, Android, macOS en ont en
  français) ; la voix neuronale pour les fichiers audio existe en français et en anglais.
- La transcription a besoin d'internet la première fois (téléchargement du modèle
  depuis Hugging Face) ; ouvert en local (fichier), le navigateur peut le
  retélécharger à chaque session. Relire les noms propres et les chiffres.
- La traduction (en ligne) ne reproduit pas la mise en page des PDF : le texte
  traduit est remis en page sur A4. Pour les langues nationales (mooré, dioula,
  fulfulde…), faire relire par un locuteur avant diffusion.
  Vérifier les montants et numéros importants sur un scan de mauvaise qualité.
- La suppression automatique du fond fonctionne sur un fond uni (mur, papier,
  studio) ; pour un fond chargé, finir à la gomme.
- L'export de Video Joe se fait en temps réel (une vidéo de 3 minutes prend
  3 minutes) ; garder l'onglet affiché pendant l'export.
- Le PDF vectoriel de Design Joe utilise les polices standard (Helvetica,
  Times, Courier) et ignore les ombres et le néon : choisir l'option « image
  haute résolution » pour un rendu identique.
- Le MP4 en H.264 dépend du navigateur (Chrome, Edge, Safari récents) ; sinon
  l'export se fait en WebM, lisible par VLC et YouTube.

## Bibliothèques incluses
- [pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 — Apache 2.0
- [JSZip](https://github.com/Stuk/jszip) 3.10.1 — MIT
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 — MIT
- [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) 2.11.1 (version de pdf-lib avec chiffrement) — MIT
- [jsPDF](https://github.com/parallax/jsPDF) 2.5.2 et [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) 2.2.4 — MIT
- [Paper.js](https://github.com/paperjs/paper.js) 0.12.18 — MIT
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) 5.1.5 — MIT
- [gifenc](https://github.com/mattdesl/gifenc) 1.0.3 — MIT
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) 0.128.0, empaqueté pour le navigateur — MIT
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) 3.8.1, empaqueté pour le navigateur ; modèles Whisper `Xenova/whisper-base` et `Xenova/whisper-small` téléchargés à la demande — Apache 2.0 / MIT
- [tesseract.js-core](https://github.com/naptha/tesseract.js-core) 5.1.1 et données `fra` et `eng` (tessdata best_int) — Apache 2.0
