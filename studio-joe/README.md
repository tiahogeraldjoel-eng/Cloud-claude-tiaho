# Studio Joe

Suite d'outils de création pour usage personnel, inspirée d'Adobe, qui fonctionne
entièrement dans le navigateur (ordinateur ou téléphone), **sans internet** et
**sans envoyer aucun fichier** sur un serveur — à une exception près, choisie par
l'utilisateur : la lecture de l'écriture manuscrite et la traduction par l'IA Claude
(voir plus bas).

| Application | Équivalent Adobe | Fichier |
|---|---|---|
| **PDF Joe** | Acrobat | `pdf.html` |
| **Scan Joe** | Adobe Scan | `scan.html` |
| **Texte Joe** | Word | `texte.html` |
| **Agenda Joe** | Outlook / Google Agenda | `agenda.html` |
| **Notes Joe** | OneNote / Keep | `notes.html` |
| **Formulaires Joe** | Google Forms | `formulaires.html` |
| **Base Joe** | Access | `base.html` |
| **Tableur Joe** | Excel | `tableur.html` |
| **Présentation Joe** | PowerPoint | `presentation.html` |
| **Photo Joe** | Photoshop / Lightroom | `photo.html` |
| **Design Joe** | Illustrator / Canva / Express | `design.html` |
| **Audio Joe** | Audition | `audio.html` |
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
- **PDF → Word (.docx)** et **PDF → Excel (.xlsx)** (menu Convertir) : paragraphes,
  titres, listes, alignements et tableaux reconstitués (bordures du PDF lues pour retrouver
  les cellules, cellules fusionnées comprises) ; montants « 12 500 000 », « 79,5 % » et dates
  convertis en vrais nombres dans Excel ; un tableau sur plusieurs pages est mis à la
  suite ; en-têtes et numéros de page répétés retirés ; pages scannées lues par OCR,
  traits des tableaux compris. Résultat téléchargé, ou ouvert directement dans Texte Joe
  ou Tableur Joe
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

### Scan Joe (équivalent Adobe Scan)
- « Prendre une photo » ouvre l'appareil photo du téléphone ; « Caméra avec
  détection » montre le contour du document en direct et enchaîne les pages
- Bords détectés automatiquement, page redressée (correction de perspective) ;
  coins ajustables au doigt avec loupe ; rotation ; recadrage sur toute l'image
- Filtres : Document (fond blanchi, ombres atténuées), Couleur, Gris, Noir et blanc
- PDF multipage (A4 ou taille de l'image) avec texte reconnu par OCR en français
  ou en anglais, invisible mais cherchable et copiable
- Partage direct (WhatsApp, e-mail…) depuis le téléphone ; texte extrait copié,
  enregistré en `.txt` ou ouvert dans Texte Joe ; images en `.zip`
- Les pages restent dans le téléphone jusqu'à « Tout effacer »

### Agenda Joe (équivalent Outlook / Google Agenda)
- Vues jour, semaine, mois et liste ; plusieurs agendas colorés, à afficher ou masquer ;
  petit calendrier, recherche, balayage gauche / droite sur téléphone
- Événements sur une journée ou à heure fixe, lieu, notes ; répétitions : tous les jours,
  du lundi au vendredi, chaque semaine (jours au choix), chaque mois à la même date ou
  « le 2e lundi », chaque année, jusqu'à une date ; modifier ou supprimer un seul jour
  de la série
- Jours fériés du Burkina Faso (fêtes fixes, Pâques, Ascension, Pentecôte ; fêtes
  musulmanes à dates estimées, à confirmer chaque année)
- Tâches : échéance, heure, priorité, répétition, listes ; saisie rapide
  (« Appeler la BDT demain 10h », « Envoyer le compte de gestion vendredi !! ») ;
  les cases à cocher de Notes Joe y apparaissent et peuvent y être cochées
- Rappels : notification tant que l'application est ouverte ou en arrière-plan ;
  rappels manqués signalés à l'ouverture
- Import et export `.ics` (Google Agenda, Outlook, agenda du téléphone), avec les
  répétitions et les rappels

### Notes Joe (équivalent OneNote / Google Keep)
- Carnets (couleur, renommer et supprimer par appui long), étiquettes, couleurs de
  note, notes épinglées, tri par date ou par titre
- Notes riches : titres, gras, surlignage, listes, **listes à cocher** (« [] » puis
  espace, ou Ctrl+L), séparateurs, date et heure, liens cliquables
- Photos (appareil photo ou galerie, réduites automatiquement), **mémos vocaux**
  enregistrés dans la note, dictée, lecture à voix haute
- Vue « Tâches à faire » : toutes les notes ayant des cases non cochées
- Recherche instantanée sans tenir compte des accents, mots surlignés
- Corbeille (vidée après 30 jours) ; export `.txt`, `.md`, impression / PDF,
  ouverture dans Texte Joe, partage ; import de fichiers `.txt` et `.md`
- Sur téléphone : une colonne à la fois (carnets, liste, note) et bouton ＋ flottant

### Formulaires Joe (équivalent Google Forms / Microsoft Forms, sans serveur)
- Questions : texte court ou long, nombre, montant en FCFA, date, choix unique,
  cases à cocher, liste déroulante, oui / non, note de 1 à 5, e-mail, téléphone,
  signature au doigt, titres de partie ; questions obligatoires, aides, contrôles
- Modèles : recensement des contribuables, liste de présence, enquête de
  satisfaction, demande d'intervention, collecte des droits de place
- **Remplir** sur l'appareil (enquête de terrain, guichet) : chaque réponse est gardée
- **Diffuser** : formulaire HTML autonome (un fichier à envoyer par WhatsApp ou
  e-mail, rempli hors ligne ; la réponse revient en fichier `.json` ou en code
  `FJ1.…` à coller), PDF à remplir (champs Acrobat), PDF papier à imprimer
- **Réponses** : import des fichiers, codes et PDF remplis (doublons ignorés),
  statistiques (répartition des choix, total / moyenne des montants), tableau,
  export Excel (totaux, feuille de statistiques) ou CSV, ouverture dans Tableur Joe

### Base Joe (équivalent Microsoft Access)
- **Ouvre les fichiers Access** `.accdb` et `.mdb` (mot de passe accepté) : tables, types
  de champs, données, relations (et intégrité référentielle), requêtes sélection
  enregistrées ; les pièces jointes et objets OLE ne sont pas repris
- Tables : types NuméroAuto, Texte court, Texte long, Nombre, Monétaire, Date/Heure,
  Oui/Non ; clé primaire, champ obligatoire, sans doublons, valeur par défaut
  (`Date()`), listes de choix (valeurs ou table liée)
- Feuille de données modifiable (Entrée / Tab), tri, recherche, filtre par sélection
- Relations 1 → plusieurs avec intégrité référentielle et suppression en cascade
- Requêtes : grille de création comme Access (totaux, tris, critères en français :
  `>1000`, `Comme "B*"`, `Entre 01/01/2026 Et 31/03/2026`, `[Quelle année ?]`) ou
  **SQL d'Access** (`[crochets]`, `"textes"`, `#dates#`, `&`, `Like "*…*"`, `IIf`, `Nz`,
  `Format`, `DateDiff`, `DateAdd`, `Year`, `Left`…), jointures, sous-requêtes, requêtes
  paramétrées, requêtes enregistrées utilisées comme tables, requêtes action
  (`UPDATE`, `DELETE`, `INSERT`) avec confirmation et contrôle de l'intégrité
- Formulaires fiche par fiche avec sous-formulaires (ex. un contribuable et ses
  paiements, avec total) ; états groupés avec sous-totaux, impression et PDF
- **Retour vers Access** : export XML « structure et données » (types, tailles, clés)
  à importer dans Access (Données externes → Fichier XML) ; export Excel (une feuille
  par table), CSV ; requêtes exportées en texte SQL
- Modèles : contribuables et paiements, courrier arrivée / départ, inventaire du
  matériel, contacts ; import d'un classeur Excel ou d'un CSV en tables

### Texte Joe (équivalent Word)
- **Ouvrir un PDF** (même scanné) : il est converti en document modifiable
- Pages A4, A5, Letter ou Legal, portrait ou paysage, marges réglables ; affichage
  « page » comme dans Word, ou « mobile » (texte adapté à l'écran du téléphone)
- Styles (Normal, Titre du document, Titre 1 à 3, Citation…), polices, tailles, gras,
  italique, souligné, barré, exposant, indice, couleurs, surlignage, alignements,
  interligne, espacements, retraits, puces et numéros sur plusieurs niveaux, casse
- Tableaux (lignes, colonnes, en-tête, couleur de cellule, sans bordures), images
  (redimensionner, habillage), sauts de page, liens, lignes, caractères spéciaux
- En-tête et pied de page, numéros de page (« Page 1 sur 5 »), première page
  différente, filigrane (BROUILLON, CONFIDENTIEL…), sommaire avec numéros de page
- Rechercher et remplacer, statistiques, annuler / rétablir, coller depuis Word ou le
  web (mise en forme nettoyée) ou sans mise en forme
- Fichiers : ouvrir et enregistrer en `.docx` (titres, listes, tableaux, images,
  en-têtes, numéros de page, mise en page) ; PDF ; impression ; `.txt`, `.html`,
  `.md` ; « Mes documents » gardés sur l'appareil avec sauvegarde automatique
- Modèles : lettre administrative, note de service, procès-verbal, rapport (page de
  garde et sommaire), attestation, demande, ordre de mission, CV
- Publipostage : lettres en série à partir d'une feuille de Tableur Joe, d'un `.xlsx`
  ou d'un `.csv`, avec filtre (ex. « Statut = Relance »), vers un document, un PDF ou
  un `.docx`
- Dictée au micro, lecture à voix haute ; IA Claude (en ligne) : corriger, reformuler
  (officiel, simple), raccourcir, résumer, rédiger à partir d'une consigne, traduire

### Tableur Joe (équivalent Excel)
- Grille illimitée, plusieurs feuilles (renommer, dupliquer, déplacer, couleur d'onglet),
  zoom, figer les volets, largeur et hauteur réglables, ajustement au contenu
- Formules en français comme dans Excel (SOMME, SI, RECHERCHEV, RECHERCHEX, INDEX/EQUIV,
  SOMME.SI.ENS, NB.SI, SOMMEPROD, ARRONDI, dates, texte, VPM, VAN, TRI…), séparateur « ; »
  et virgule décimale ; les formules en anglais (SUM, IF…) sont aussi acceptées.
  Références entre feuilles, $ absolus (F4), cellules désignées à la souris pendant la saisie,
  aide à la saisie des fonctions et de leurs arguments
- `ENLETTRES(montant;"francs CFA")` : montant en toutes lettres pour les factures et mandats
- Saisie intelligente : « 1 250 000 », « 12 % », « 1 500 FCFA », « 10/10/2026 », « 14:30 »
- Mise en forme : gras, italique, souligné, couleurs, alignements, retour à la ligne,
  fusion, bordures (dont double trait des totaux), formats de nombres (FCFA, %, dates,
  négatifs en rouge, formats personnalisés jj/mm/aaaa ou # ##0,00)
- Mise en forme conditionnelle : seuils, doublons, N plus grandes valeurs, barres de
  données, échelles de couleurs
- Copier-coller avec Excel et Google Sheets, recopie et séries (1, 2, 3… ; janvier,
  février… ; Article 1, Article 2…), Ctrl+D / Ctrl+R, somme automatique
- Tri sur une ou deux colonnes, filtres par valeurs, suppression des doublons,
  conversion du texte en colonnes, rechercher et remplacer
- Graphiques liés aux données : colonnes, barres, courbes, aires, secteurs, anneau
- Modèles : facture (TVA 18 %, montant en lettres), budget prévisionnel / réalisé,
  journal de caisse, tableau d'amortissement d'emprunt, suivi des dépenses
- **Ouvrir un PDF** : ses tableaux deviennent des cellules, montants et dates en nombres
- Fichiers : ouvrir et enregistrer en `.xlsx` (formules, mises en forme, fusions,
  volets figés, filtres, mises en forme conditionnelles), `.csv` (séparateur « ; »),
  `.joetab` (tout, graphiques compris) ; export PDF avec ajustement à la page
- Annuler / rétablir, sauvegarde automatique sur l'appareil
- Assistant IA Claude (en ligne, avec votre clé) : écrire une formule à partir d'une
  phrase, expliquer une formule
- Sur téléphone : toucher une cellule puis la retoucher pour écrire, poignée pour étendre
  la sélection, appui long pour le menu

### Présentation Joe (équivalent PowerPoint)
- Diapositives 16:9 ou 4:3, dispositions (titre, titre et contenu, deux contenus,
  comparaison, section, image et texte…), 8 thèmes (dont « Faso »), arrière-plans
  couleur ou image, masquer une diapositive
- Texte riche : police, taille, gras, italique, souligné, couleur, surlignage,
  alignement, puces et numéros sur plusieurs niveaux (Tab / Maj+Tab), interligne
- Formes (rectangles, flèches, étoile, bulle…), images (glisser-déposer, coller),
  tableaux, graphiques (colonnes, barres, courbes, aires, secteurs, anneau), icônes,
  date, numéros de diapositive
- Déplacer, redimensionner, faire pivoter, guides magnétiques, aligner et répartir,
  premier plan / arrière-plan, copier-coller, annuler / rétablir
- Miniatures réordonnables, notes de l'orateur (avec dictée), sauvegarde automatique
- Diaporama plein écran : transitions (fondu, poussée, couvrir, zoom, retournement),
  animations d'entrée (y compris paragraphe par paragraphe), écran noir (B), aller à une
  diapositive (numéro + Entrée), pointeur laser, balayage au doigt
- Mode présentateur : diapositive en cours et suivante, notes, minuteur, horloge ;
  les diapositives s'affichent dans une seconde fenêtre à placer sur le vidéoprojecteur
- Fichiers : enregistrer en `.pptx` modifiable dans PowerPoint (textes, formes, images,
  tableaux, vrais graphiques, notes) ; ouvrir un `.pptx` (textes et puces, formes,
  images, tableaux, graphiques, notes) ; `.joeslides` ; export PDF (diapositives,
  pages de commentaires, documents 2, 3 ou 6 par page) et images PNG
- Modèles : rapport d'activité, réunion, budget, formation, projet ; création à
  partir d'un plan tapé ou dicté
- IA Claude (en ligne, avec votre clé) : créer une présentation complète à partir d'un
  sujet ou d'un texte, rédiger les notes de l'orateur

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

### Audio Joe (équivalent Audition / Audacity)
- Ouvrir MP3, M4A, WAV, OGG, Opus, FLAC, la piste son d'une vidéo MP4 ; ou enregistrer
  au micro (pause, niveau affiché, écran gardé allumé, sauvegarde au fur et à mesure :
  un enregistrement interrompu est proposé à la récupération)
- Forme d'onde avec vue d'ensemble, zoom (pincer, Ctrl + molette), sélection au doigt,
  double-clic pour une phrase, sélection précise par minutes et secondes
- Couper, copier, coller, supprimer, rogner, dupliquer, insérer un silence ; annuler
  et rétablir
- Effets : volume, normalisation, niveau régulier (compresseur), fondus, réduction du
  bruit de fond (profil automatique ou choisi), raccourcir les silences, voix plus
  claire, graves / médiums / aigus, coupe-bas, vitesse sans changer la voix, muet,
  inverser, mono
- Export MP3 (voix 64 kbit/s, standard 128, haute 192) ou WAV, de tout ou de la
  sélection ; partage direct depuis le téléphone
- Transcription en texte (Whisper, sur l'appareil), phrases cliquables, export
  .txt / .srt ou ouverture dans Texte Joe
- Les longs fichiers (plus de 20 min) sont ouverts en mono à fréquence réduite pour
  tenir en mémoire sur un téléphone

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

## Sauvegarde et transfert entre appareils (`sauvegarde.html`)
- Toutes les données locales (documents de Texte Joe, présentations, notes, formulaires
  et réponses, scans, son en cours d'Audio Joe, classeur de Tableur Joe, réglages) dans
  un seul fichier `.joebak`
- Mot de passe facultatif : chiffrement AES-256-GCM, clé dérivée par PBKDF2 (200 000
  itérations) ; la clé API Claude n'est pas incluse sauf demande explicite
- Partage direct (Partage à proximité, WhatsApp, e-mail, Drive) ou téléchargement
- Restauration sur un autre appareil : choix des applications, **fusionner** (ajoute
  et met à jour) ou **remplacer** ; rappel de la date de la dernière sauvegarde
- Pas de synchronisation automatique en ligne : aucun serveur, vos données ne quittent
  l'appareil que dans le fichier que vous envoyez vous-même

## Limites connues
- Agenda Joe : un navigateur ne peut pas réveiller le téléphone quand l'application est
  fermée ; pour des rappels garantis, exporter en `.ics` vers l'agenda du téléphone. Pas
  d'invitations par e-mail ni de partage d'agenda en ligne.
- Base Joe : ne peut pas enregistrer directement un fichier `.accdb` (aucune bibliothèque
  libre ne le permet dans un navigateur) : le retour vers Access passe par l'export XML,
  après quoi les relations sont à recréer dans Access. Les formulaires, états, macros et
  modules VBA d'un fichier Access ne sont pas lus ; les requêtes analyse croisée
  (TRANSFORM) ne sont pas prises en charge.
- Formulaires Joe : pas de collecte automatique en ligne (aucun serveur) : les réponses
  reviennent par fichier, code ou PDF, à importer. La signature n'est pas reprise depuis un
  PDF rempli.
- Notes Joe : pas de rappels à heure fixe ni de dessin à main levée ; les notes restent sur
  l'appareil où elles ont été écrites (voir la sauvegarde pour les transférer).
- Audio Joe : une seule piste (pas de mixage multipiste : utiliser Video Joe) ; au-delà
  d'environ 2 heures, le téléphone peut manquer de mémoire. La sauvegarde automatique
  peut échouer pour un son très long : exporter le travail.
- Conversion PDF → Word / Excel : les images, logos, cachets et dessins ne sont pas
  repris ; les mises en page en plusieurs colonnes (journaux) peuvent devenir des
  tableaux ; un tableau sans aucun trait ni espacement net entre colonnes peut être lu
  comme du texte. Sur un document scanné, relire les montants : un chiffre mal reconnu
  par l'OCR reste possible.
- Scan Joe : la détection des bords demande un document clair sur un fond plus
  sombre ; sinon, ajuster les coins à la main. L'OCR ne lit pas l'écriture manuscrite
  (utiliser PDF Joe → OCR → Écriture manuscrite, en ligne).
- Texte Joe : pas de suivi des modifications, de commentaires ni de notes de bas de
  page. À l'ouverture d'un `.docx`, les couleurs et polices particulières peuvent être
  simplifiées. Un tableau plus haut qu'une page n'est pas coupé entre deux pages à
  l'écran : utiliser l'impression, qui le coupe. L'ancien format `.doc` doit d'abord
  être réenregistré en `.docx`.
- Présentation Joe : les animations et transitions ne sont pas exportées dans le
  `.pptx`. L'ouverture d'un `.pptx` reprend le contenu, mais pas toujours la mise en
  forme exacte : SmartArt, vidéos et formes spéciales sont ignorés ou simplifiés.
  L'ancien format `.ppt` doit d'abord être réenregistré en `.pptx`. Le mode présentateur
  sur deux écrans demande un ordinateur ; sur téléphone, les notes s'affichent sur le
  même écran.
- Tableur Joe : pas de tableaux croisés dynamiques, de macros ni de formules
  matricielles à résultat débordant (FILTRE, TRIER, UNIQUE). Les graphiques ne sont
  pas enregistrés dans le `.xlsx` (utiliser `.joetab` pour les garder), et
  `ENLETTRES` est enregistrée dans le `.xlsx` sous forme de texte, car Excel ne la
  connaît pas. L'ancien format `.xls` doit d'abord être réenregistré en `.xlsx`.
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
- [docx](https://github.com/dolanmiu/docx) 9.7.1 — MIT
- [Mammoth](https://github.com/mwilliamson/mammoth.js) 1.12.2 — BSD-2-Clause
- [PptxGenJS](https://github.com/gitbrent/PptxGenJS) 4.0.1 — MIT
- [ExcelJS](https://github.com/exceljs/exceljs) 4.4.0 — MIT
- [Formula.js](https://github.com/formulajs/formulajs) 4.6.1 — MIT
- [lamejs](https://github.com/zhuker/lamejs) 1.2.1 (encodage MP3) — LGPL-3.0
- [mdb-reader](https://github.com/andipaetzold/mdb-reader) 3.2.0 (lecture des fichiers Access), empaqueté avec [buffer](https://github.com/feross/buffer) 6.0.3 et ses dépendances — MIT
- [AlaSQL](https://github.com/AlaSQL/alasql) 4.19.0 (moteur SQL) — MIT
- [tesseract.js-core](https://github.com/naptha/tesseract.js-core) 5.1.1 et données `fra` et `eng` (tessdata best_int) — Apache 2.0
