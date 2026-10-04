---
name: brvm-gem-finder
description: Détection et analyse rigoureuse des opportunités et pépites sous-évaluées sur la BRVM (titres décotés à fort potentiel, à repérer avant les institutionnels) en combinant valorisation fondamentale, détection précoce, lecture OCR des carnets d'ordres Coris Bourse et gestion des catalyseurs. Utiliser pour « quelle est la pépite du moment », un scan de toute la cote, l'analyse d'un titre ou d'un carnet d'ordres.
---

# BRVM Gem Finder

Cette compétence permet d'analyser en profondeur les titres de la Bourse Régionale des Valeurs Mobilières (BRVM) pour détecter des pépites sous-évaluées et optimiser le Taux de Rendement Global (Dividendes + Plus-values).

## Quand utiliser cette compétence

Activer cette compétence dès que l'utilisateur :
- Demande une analyse de titre ou une sélection d'opportunités sur la BRVM.
- Partage une capture d'écran d'un carnet d'ordres ou d'un relevé d'actions SGI (Coris Bourse, etc.).
- Interroge sur la stratégie d'allocation mensuelle ou la détection de vagues spéculatives / risques de dégonflement post-IPO.
- Demande « la pépite du moment » : appliquer la procédure **Scan de la cote** ci-dessous (1 à 3 titres maximum).

## Matrice d'Analyse (5 Piliers)

### 1. Valorisation & Valeur Intrinsèque (Value Investing)
- **Ratio PER (Price Earnings Ratio)** : Cible prioritaire sous la barre des 10x à 12x (comparé à la moyenne sectorielle).
- **Ratio P/BV (Price-to-Book)** : Évaluation de la décote par rapport à la valeur comptable nette des fonds propres.

### 2. Rentabilité & Génération de Trésorerie
- **Rendement des Fonds Propres (ROE)** : Viser idéalement un ROE > 15 % garantissant une forte capacité de création de valeur.
- **Rendement du Dividende Net (Dividend Yield)** : Cibler des rendements nets > 7 % à 9 % avec un historique de distribution régulier.

### 3. Analyse Microstructurale & Carnet d'Ordres (OCR)
- **Vision & Profondeur du Carnet** : Analyser les blocs acheteurs/vendeurs (quantités et cours limites) pour mesurer la pression sous-jacente.
- **Filtrage Anti-FOMO** : Détecter la disparition des gros blocs d'achat institutionnels pour anticiper la fin des bulles spéculatives et le début des corrections post-IPO.

### 4. Catalyseurs & Timing
- **Opérations sur capital** : Suivi des splits / fractionnements d'actions (ex: Sonatel 1:10) et de leur effet sur la liquidité.
- **Comblement du Gap Post-Détachement** : Cibler les sociétés rentables capables de faire remonter leur cours après la distribution des dividendes.

### 5. Détection Précoce (avant les institutionnels)
Une **pépite** est un titre sous-coté à fort potentiel que le marché n'a pas encore intégré. Signaux recherchés :
- **Retard relatif** : performance depuis janvier ≥ 20 points sous le BRVM Composite alors que les fondamentaux tiennent.
- **Croissance non payée** : PEG (PER / croissance du bénéfice en %) < 1.
- **Accumulation discrète** : volume ≥ 2x la moyenne 20 séances sans mouvement de cours (< 3 %), blocs acheteurs qui se reconstituent au carnet.
- **Raisons de l'absence des institutionnels** : dividende suspendu en phase de redressement, faible flottant ou faible liquidité, risque pays, faible couverture par les SGI. Ces raisons sont aussi les risques : les écrire noir sur blanc.
- **Catalyseur daté à moins de 6 mois** : publication de résultats, reprise du dividende, fractionnement, entrée dans un indice (BRVM 30, compartiment Prestige).

Garde-fous :
- **Déjà découverte** : un titre ≥ 30 points au-dessus du Composite n'est plus une pépite (watchlist ou prise de bénéfices).
- **Piège à valeur** : un titre en retard dont le bénéfice recule n'est pas une pépite ; au mieux un achat de rendement.
- **Pépite spéculative** (dividende suspendu, solvabilité fragile, recapitalisation) : position réduite, au plus 5 % du portefeuille.

## Scan de la cote (« quelle est la pépite du moment ? »)
1. **Récupérer les BOC** (le jour + les séances précédentes pour l'historique) :
   `python scripts/fetch_boc.py --last 20 -o boc`
   Source officielle : `https://bfin.brvm.org/boc/BOC_JOUR/BOC_AAAAMMJJ.pdf`. Si le site est inaccessible (réseau filtré), le script lit l'archive tenue chaque soir par le workflow GitHub Actions `fetch-boc.yml` (`boc-inbox/` de la branche `claude/brvm-boc-114-analysis-ngt2xu`). Le dossier `boc/` n'est pas versionné.
   **Lire le BOC du jour** avec le lecteur intégré, qui extrait pour les 48 titres le cours, la variation depuis janvier, le dernier dividende net, le rendement, le PER publié et la meilleure limite du carnet (quantités achat / vente). Avec `--history`, il calcule aussi sur 5 séances le ratio de volume et la variation de cours (signal d'accumulation) :
   `python scripts/boc_parser.py boc/BOC_AAAAMMJJ.pdf -o data/cote_brvm.csv --enrich data/fondamentaux.csv --history boc`
   Les titres suspendus sont écartés ; un dividende payé avant l'exercice précédent compte pour zéro.
2. **Tenir `data/fondamentaux.csv` à jour** avec ce que le BOC ne donne pas : croissance du dernier résultat publié (`eps_growth`), dividende suspendu, prix d'introduction, risques spécifiques et source. Dater et sourcer chaque chiffre ; ne jamais inventer une valeur manquante : laisser la case vide.
3. **Classer** : `python scripts/brvm_analyst.py --screen data/cote_brvm.csv --top 3` (la performance du Composite est reprise du BOC).
4. **Relire à la main** les 3 premiers : vérifier le dernier résultat trimestriel, les risques spécifiques, la liquidité. Écarter ce qui ne résiste pas.
5. **Restituer 1 à 3 pépites au maximum**, chacune avec son catalyseur, son risque principal, son niveau de conviction et la taille de position conseillée. Dire clairement quand le marché n'offre pas de vraie pépite.

## L'oracle (`scripts/oracle.py`) et le journal de prédictions
Pour « quelle est la pépite du moment ? », lancer d'abord l'oracle, qui enchaîne récupération des BOC, lecture de la cote, classement des 48 titres et plan d'action :
`python scripts/oracle.py` (ou `--no-fetch` si les BOC sont déjà dans `boc/`).
- Il désigne 1 à 3 pépites avec zone d'entrée (meilleures limites du carnet), objectif (BPA x PER du secteur publié au BOC, plafonné à +50 %), potentiel dividende inclus et seuil de sortie (-10 %).
- Il inscrit chaque pépite dans `data/journal_predictions.csv` (date, cours, Composite, verdict, objectif) ; ce fichier est versionné et ne doit jamais être réécrit à la main.
- `python scripts/journal.py --detail` mesure chaque prédiction à 1 semaine, 1 mois, 3 mois et 6 mois de séances contre le BRVM Composite (hors dividendes).
- **Conviction** : qualitative (score) tant que le journal compte moins de 10 prédictions mûres à 1 mois ; ensuite, taux réel de pépites ayant battu le Composite. Toujours restituer cette conviction telle quelle, sans l'embellir.
- `python scripts/oracle.py --no-fetch --backtest` rejoue l'oracle sur tout l'historique de BOC de `boc/` (`data/backtest.csv`) à 1 semaine, 1 mois et 3 mois, en le comparant au Composite et à la moyenne de tous les titres. `--sans-fondamentaux` donne la version sans biais d'anticipation (seules les données du BOC de chaque date) : c'est elle qui fait foi. Pour constituer l'historique : `python scripts/fetch_boc.py --since 2025-10-01 -o boc`.
- Si les résultats du journal montrent qu'un verdict ou un seuil ne bat pas le Composite sur un échantillon suffisant, proposer d'ajuster les seuils de `brvm_analyst.py` en citant les chiffres.

## Modèle de Restitution / Recommandation
Pour chaque analyse, présenter :
1. **Synthèse des métriques fondamentales** (PER, ROE, Rendement Dividende, PRU).
2. **Décryptage de la microstructure du carnet d'ordres**.
3. **Signaux de détection précoce** (retard relatif, PEG, accumulation, catalyseur daté).
4. **Verdict d'action clair** : PÉPITE (ACHAT PRÉCOCE) / PÉPITE SPÉCULATIVE (position réduite) / ACHAT / CONSERVATION (WATCHLIST) / PRISE DE BÉNÉFICES / ÉVITER.
5. **Limites des données** : date de chaque cours, chiffres non vérifiés.

## Moteur de scoring local (`scripts/brvm_analyst.py`)

Avant de rendre un verdict, calculer les métriques avec le script plutôt qu'à la main :

```bash
python .claude/skills/brvm-gem-finder/scripts/brvm_analyst.py STBC \
  --price 21995 --dividend 1707 --eps 2031 --roe 0.30 --pre-detachment-price 23500
```

- **Entrées** : `--price` obligatoire, `--dividend` (net) recommandé ; `--eps-growth`, `--perf-ytd`, `--index-perf-ytd`, `--volume-ratio`, `--price-change`, `--dividend-suspended`, `--risk` alimentent la détection précoce ; `--eps`, `--book-value`, `--roe`, `--sector-per` affinent la valorisation ; `--pru` le calcul de plus-value ; `--ipo-price` + `--sessions-since-ipo` déclenchent le filtre anti-FOMO ; `--pre-detachment-price` mesure le gap post-détachement restant à combler.
- **Sorties** : rendement, PER, P/BV, ROE, taux de distribution, PEG, écart vs Composite, note de chaque pilier (+1 / 0 / -1), alertes et verdict.
- **Lecteur de BOC** : `scripts/boc_parser.py` (nécessite `pdftotext`, paquet poppler-utils) produit le CSV de la cote.
- **Mode scan** : `--screen data/cote_brvm.csv` classe toute la cote (verdict, puis score, puis PEG) et détaille les `--top` premiers. `--json` pour un résultat exploitable par programme.
- **LLM local optionnel** : si `ollama` est installé (`pip install ollama`) et le modèle disponible (par défaut `gemma4:4b`, modifiable avec `--model`), le script ajoute un commentaire de stratégie. Le LLM commente les chiffres du moteur, il ne les recalcule pas. `--no-llm` pour s'en passer.
- Le pilier microstructure reste neutre tant qu'aucun carnet d'ordres n'a été lu : compléter l'analyse avec une capture Coris Bourse.
- Utilisable aussi en bibliothèque : `BRVMAnalystSkill().analyze_ticker("SITAB", 21000, 1874, eps=2031)`.
