# Studio Joe

Suite d'outils de création pour usage personnel, inspirée d'Adobe, qui fonctionne
entièrement dans le navigateur (ordinateur ou téléphone), **sans internet** et
**sans envoyer aucun fichier** sur un serveur.

| Application | Équivalent Adobe | Fichier |
|---|---|---|
| **PDF Joe** | Acrobat | `pdf.html` |
| **Photo Joe** | Photoshop / Lightroom | `photo.html` |
| **Design Joe** | Illustrator / Express | `design.html` |

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
- PDF protégés par mot de passe : déverrouillage puis conversion pour édition
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

### Design Joe
- Rectangle, ellipse, polygone, étoile, ligne/flèche, plume, crayon, texte, image
- Remplissage uni ou dégradé, contour, pointillés, ombre portée, modes de fusion
- Rotation, redimensionnement, groupes, verrouillage, calques, ordre de superposition
- Alignement, répartition, repères magnétiques, édition des points d'un tracé
- Modèles : publication carrée, carte de visite, affiche/avis A4, story,
  logo, bannière, page A4, présentation 16:9
- Export PNG, JPG, SVG, PDF ; projet `.joedesign`

## Limites connues
- Le PDF ne permet pas de modifier le texte d'origine d'un document (on peut le
  masquer avec l'effaceur blanc et réécrire par-dessus).
- Le « rectangle plein » cache visuellement une information ; pour qu'elle ne soit
  plus récupérable, utiliser ensuite **Convertir → Aplatir en images**.
- Pas d'OCR ni de chiffrement par mot de passe à l'enregistrement.

## Bibliothèques incluses
- [pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 — Apache 2.0
- [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 — MIT
- [JSZip](https://github.com/Stuk/jszip) 3.10.1 — MIT
