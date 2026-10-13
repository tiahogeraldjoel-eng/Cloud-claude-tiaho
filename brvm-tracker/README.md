# BRVM Tracker Joe

Suivi personnel de portefeuille BRVM, inspiré de [brvmtracker.com](https://brvmtracker.com) et enrichi.
Application web sans serveur : ouvrez `index.html` (ou la version publiée) sur ordinateur ou téléphone.
Les données restent **dans votre navigateur** ; pensez à exporter une sauvegarde régulièrement.

## Ce que fait brvmtracker.com… et que l'on retrouve ici
| Fonction | Ici |
|---|---|
| Plus-value **nette** (frais inclus), dividendes encaissés | PRU frais inclus (coût moyen pondéré), plus-values latentes et réalisées, dividendes nets |
| Trésorerie séparée des actions | Dépôts, retraits, frais, intérêts → solde espèces chez la SGI |
| Valeur totale, gain total, rendement annualisé, apports vs plus-values | Tableau de bord + rendement annualisé **XIRR** + décomposition du gain |
| Import du relevé SGI | Import **PDF** (y compris protégé par mot de passe), `.xlsx`, `.csv` ou tableau collé, correspondance des colonnes automatique, détection du type d'opération par le libellé, doublons écartés |
| Exports Excel / PDF | Classeur Excel (synthèse, positions, opérations, dividendes), CSV, rapport imprimable en PDF |
| Sous-portefeuilles, dividendes par sous-portefeuille | Portefeuilles imbriqués, un parent agrège ses enfants |
| 3 portefeuilles en gratuit | Illimité |

## Améliorations
- **État de portefeuille SGI** (PDF, ex. Coris Bourse) : les positions sont reprises au coût moyen de la SGI avec les cours du relevé et la trésorerie ; un relevé plus récent met le portefeuille à jour (achats, ventes et trésorerie ajustés automatiquement).
- **Marché complet** (47 valeurs) : cours, variation, volume, dividende, rendement, tendance, favoris, filtres secteur/pays, plus fortes hausses/baisses, moyenne par secteur.
- **Fiche titre** : historique des cours avec vos achats/ventes et votre PRU, limites de variation du jour (±7,5 %), point mort à la revente.
- **Alertes** de cours, de variation, de plus/moins-value ou de rendement, avec notifications du navigateur.
- **Dividendes** : projection du revenu annuel net d'IRVM (taux par pays modifiables), rendement sur coût, calendrier des annonces (détachement / paiement) et enregistrement de l'encaissement en un clic.
- **Outils** : calculateur d'ordre (quantité, frais, prix de revient, revente à l'équilibre), simulateur d'investissement mensuel avec réinvestissement, objectif de patrimoine, revenu passif visé, **rééquilibrage** vers des poids cibles.
- **Cours** : récupérés depuis le Worker Cloudflare `brvm-prices` du dépôt (URL modifiable), ou collés à la main depuis le BOC (`SNTS 25 500 25 000`). Chaque relevé alimente l'historique.
- Mode discret (montants masqués), thème clair/sombre, installable et utilisable hors connexion (PWA).

## Utilisation
1. Ajoutez vos **dépôts** puis vos **achats / ventes / dividendes** (bouton « + Opération »), ou importez le relevé de votre SGI (Import / Export).
2. Actualisez les cours (⟳) — automatique à l'ouverture et toutes les 15 min pendant la séance.
3. Réglez le **taux de frais** de votre SGI dans Paramètres → Portefeuilles (1,2 % TTC par défaut).

Le bouton « Essayer avec un exemple » crée un portefeuille fictif pour découvrir l'outil.

## Notes
- Les cours et dividendes du référentiel (`js/data.js`) sont **indicatifs** : ils sont remplacés par les cours actualisés et chaque dividende se corrige dans la fiche du titre.
- Relevés PDF : seuls les PDF contenant du texte sont lus ; un PDF scanné (image) doit d'abord passer par un outil de reconnaissance de texte (OCR), ou être remplacé par l'export Excel/CSV de la SGI.
- Les taux d'IRVM par défaut sont à vérifier auprès de votre SGI.
- Outil de suivi personnel : il ne constitue pas un conseil en investissement.

## Fichiers
`index.html` · `css/app.css` · `js/data.js` (référentiel) · `js/store.js` (données locales) · `js/calc.js` (calculs) ·
`js/charts.js` (graphiques SVG) · `js/io.js` (import/export) · `js/prices.js` (cours, alertes) · `js/app.js` (interface) ·
`js/views-*.js` (pages) · `lib/jszip.min.js` (lecture/écriture Excel) · `lib/pdf*.js` (lecture des relevés PDF) · `sw.js` (hors connexion).
