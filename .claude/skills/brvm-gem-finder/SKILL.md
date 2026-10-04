---
name: brvm-gem-finder
description: Détection et analyse rigoureuse des opportunités et pépites sous-évaluées sur la BRVM en combinant valorisation fondamentale, lecture OCR des carnets d'ordres Coris Bourse et gestion des catalyseurs.
---

# BRVM Gem Finder

Cette compétence permet d'analyser en profondeur les titres de la Bourse Régionale des Valeurs Mobilières (BRVM) pour détecter des pépites sous-évaluées et optimiser le Taux de Rendement Global (Dividendes + Plus-values).

## Quand utiliser cette compétence

Activer cette compétence dès que l'utilisateur :
- Demande une analyse de titre ou une sélection d'opportunités sur la BRVM.
- Partage une capture d'écran d'un carnet d'ordres ou d'un relevé d'actions SGI (Coris Bourse, etc.).
- Interroge sur la stratégie d'allocation mensuelle ou la détection de vagues spéculatives / risques de dégonflement post-IPO.

## Matrice d'Analyse (4 Piliers)

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

## Modèle de Restitution / Recommandation
Pour chaque analyse, présenter :
1. **Synthèse des métriques fondamentales** (PER, ROE, Rendement Dividende, PRU).
2. **Décryptage de la microstructure du carnet d'ordres**.
3. **Verdict d'action clair** : ACHAT / CONSERVATION (WATCHLIST) / PRISE DE BÉNÉFICES.

## Moteur de scoring local (`scripts/brvm_analyst.py`)

Avant de rendre un verdict, calculer les métriques avec le script plutôt qu'à la main :

```bash
python .claude/skills/brvm-gem-finder/scripts/brvm_analyst.py STBC \
  --price 21995 --dividend 1707 --eps 2031 --roe 0.30 --pre-detachment-price 23500
```

- **Entrées** : `--price` et `--dividend` (net) obligatoires ; `--eps`, `--book-value`, `--roe`, `--sector-per` affinent la valorisation ; `--pru` le calcul de plus-value ; `--ipo-price` + `--sessions-since-ipo` déclenchent le filtre anti-FOMO ; `--pre-detachment-price` mesure le gap post-détachement restant à combler.
- **Sorties** : rendement, PER, P/BV, ROE, taux de distribution, note de chaque pilier (+1 / 0 / -1), alertes et verdict (ACHAT / CONSERVATION (WATCHLIST) / PRISE DE BÉNÉFICES / ÉVITER). `--json` pour un résultat exploitable par programme.
- **LLM local optionnel** : si `ollama` est installé (`pip install ollama`) et le modèle disponible (par défaut `gemma4:4b`, modifiable avec `--model`), le script ajoute un commentaire de stratégie. Le LLM commente les chiffres du moteur, il ne les recalcule pas. `--no-llm` pour s'en passer.
- Le pilier microstructure reste neutre tant qu'aucun carnet d'ordres n'a été lu : compléter l'analyse avec une capture Coris Bourse.
- Utilisable aussi en bibliothèque : `BRVMAnalystSkill().analyze_ticker("SITAB", 21000, 1874, eps=2031)`.
