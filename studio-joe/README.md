# Studio Joe

Suite d'outils de création pour usage personnel, inspirée d'Adobe, qui fonctionne
entièrement dans le navigateur (ordinateur ou téléphone), **sans internet** et
**sans envoyer aucun fichier** sur un serveur — à une exception près, choisie par
l'utilisateur : la lecture de l'écriture manuscrite par l'IA Claude (voir plus bas).

| Application | Équivalent Adobe | Fichier |
|---|---|---|
| **PDF Joe** | Acrobat | `pdf.html` |
| **Photo Joe** | Photoshop / Lightroom | `photo.html` |
| **Design Joe** | Illustrator / Canva / Express | `design.html` |
| **Video Joe** | Premiere Pro | `video.html` |

## Utilisation

1. Copier le dossier `studio-joe` (ordinateur, clé USB, téléphone).
2. Ouvrir `index.html` dans Chrome, Edge ou Firefox.

Aucune installation : les bibliothèques sont incluses dans `lib/`.

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
- Export MP4 (ou WebM selon le navigateur) avec le son, capture d'image PNG,
  projet `.joevideo` (les médias sont reliés à la réouverture)

## Limites connues
- L'OCR hors ligne reconnaît le texte imprimé en français et en anglais ; l'écriture
  manuscrite passe par l'option en ligne (internet et clé API Anthropic payante).
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
- [tesseract.js-core](https://github.com/naptha/tesseract.js-core) 5.1.1 et données `fra` et `eng` (tessdata best_int) — Apache 2.0
