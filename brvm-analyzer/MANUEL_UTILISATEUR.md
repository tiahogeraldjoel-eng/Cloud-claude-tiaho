# MANUEL UTILISATEUR — FICHE D'ANALYSE BRVM v2

**Fichier :** `etudes_actions_v2.xlsx`  
**Bourse :** BRVM — Bourse Régionale des Valeurs Mobilières (Afrique de l'Ouest)  
**Objectif :** Analyser un titre coté à la BRVM avant toute décision d'achat

---

## TABLE DES MATIÈRES

1. [Vue d'ensemble](#1-vue-densemble)
2. [Structure du fichier](#2-structure-du-fichier)
3. [Feuille PROFIL — Identifier la société](#3-feuille-profil--identifier-la-société)
4. [Feuille ETUDE — Analyse Fondamentale](#4-feuille-etude--analyse-fondamentale)
5. [Feuille ETUDE — Analyse Technique](#5-feuille-etude--analyse-technique)
6. [Feuille SYNTHESE — Tableau de bord](#6-feuille-synthese--tableau-de-bord)
7. [Feuille FORMULE — Référentiel](#7-feuille-formule--référentiel)
8. [Workflow complet d'une analyse](#8-workflow-complet-dune-analyse)
9. [Interprétation des signaux](#9-interprétation-des-signaux)
10. [Sources d'information recommandées](#10-sources-dinformation-recommandées)
11. [Glossaire](#11-glossaire)

---

## 1. VUE D'ENSEMBLE

La fiche d'analyse est un outil Excel structuré pour évaluer un titre coté à la BRVM selon deux dimensions complémentaires :

| Dimension | Ce qu'elle mesure | Feuille concernée |
|---|---|---|
| **Analyse Fondamentale** | Santé financière de l'entreprise | ETUDE (blocs A1 à A9) |
| **Analyse Technique** | Comportement du cours sur le marché | ETUDE (blocs B1 à B7) |
| **Synthèse** | Score global et verdict d'investissement | SYNTHESE |

> **Principe fondamental :** Une bonne analyse combine les deux dimensions. Un titre fondamentalement solide mais techniquement en surachat n'est pas forcément le bon moment pour acheter. À l'inverse, un signal technique de survente sur un titre fondamentalement faible reste risqué.

---

## 2. STRUCTURE DU FICHIER

Le fichier contient **4 feuilles** :

```
etudes_actions_v2.xlsx
├── ETUDE        → Feuille principale : toutes les analyses (saisie + calculs)
├── SYNTHESE     → Tableau de bord récapitulatif avec verdict automatique
├── PROFIL       → Fiche d'identité de la société analysée
└── FORMULE      → Référentiel des formules et seuils BRVM
```

### Code couleur des cellules

| Couleur | Signification |
|---|---|
| **Orange clair** | Cellule de saisie manuelle — à remplir par l'utilisateur |
| **Vert clair** | Cellule calculée automatiquement — ne pas modifier |
| **Gris clair** | Libellé ou référence — ne pas modifier |
| **Blanc** | Cellule de saisie optionnelle |

> **Règle d'or :** Ne saisir des données que dans les cellules **orange**. Les cellules vertes se calculent automatiquement.

---

## 3. FEUILLE PROFIL — IDENTIFIER LA SOCIÉTÉ

Remplir cette feuille **en premier**, avant toute analyse. Elle sert de référence et permet de retrouver rapidement les informations de base.

### Sections à remplir

#### IDENTIFICATION
| Champ | Exemple | Où trouver |
|---|---|---|
| Nom de la société | BERNABE CI | BRVM.org |
| Ticker BRVM | CBIB | BRVM.org / RichBourse |
| Secteur d'activité | Distribution / Commerce | Rapport annuel |
| Pays d'origine | Côte d'Ivoire | BRVM.org |
| Date d'introduction | 15/12/1998 | BRVM.org |

#### CAPITAL & ACTIONNARIAT
| Champ | Exemple | Où trouver |
|---|---|---|
| Capital social | 1 656 000 000 FCFA | Rapport annuel |
| Nombre de titres | 6 624 000 | BRVM.org |
| Flottant (%) | 30% | Rapport annuel |
| Principaux actionnaires | CFAO 70% | Rapport annuel |

#### LIQUIDITÉ DU TITRE ⚠ IMPORTANT POUR BRVM

La liquidité est un critère **critique** sur la BRVM. De nombreux titres se négocient très peu, ce qui rend difficile l'entrée et la sortie de position.

| Champ | Interprétation |
|---|---|
| Volume moyen journalier (titres) | < 100 titres/jour = très illiquide |
| Volume moyen journalier (FCFA) | < 500 000 FCFA/jour = illiquide |
| Fréquence de cotation (%) | < 50% des séances = risqué |

| Appréciation | Critères |
|---|---|
| **Forte** | > 1 000 titres/jour, > 70% des séances |
| **Moyenne** | 200–1 000 titres/jour, 40–70% des séances |
| **Faible** | < 200 titres/jour ou < 40% des séances |

> **Conseil :** Sur un titre illiquide, il faut prévoir de passer des ordres fractionnés sur plusieurs séances pour ne pas faire monter le prix soi-même.

---

## 4. FEUILLE ETUDE — ANALYSE FONDAMENTALE

### A1 — CHIFFRE D'AFFAIRES ou PRODUIT NET BANCAIRE

**Objectif :** Mesurer la croissance de l'activité sur 5 ans.

**Données à saisir :**
- Colonnes B à F : valeurs du CA ou PNB pour les années N-4, N-3, N-2, N-1, N
- Les unités doivent être **cohérentes** (toujours en millions FCFA, ou toujours en FCFA)

**Résultats automatiques :**

| Indicateur | Formule | Interprétation |
|---|---|---|
| Croissance N/N-4 % | `(N − N-4) / N-4 × 100` | Positif = croissance sur 5 ans |
| TCAM (CAGR) | `(N/N-4)^(1/4) − 1` | Taux annuel moyen de croissance |

**Seuils d'interprétation BRVM :**
- TCAM > 10%/an = excellente croissance
- TCAM 5–10%/an = bonne croissance
- TCAM 0–5%/an = croissance faible
- TCAM négatif = contraction de l'activité ⚠

---

### A2 — RÉSULTAT NET

**Objectif :** Mesurer l'évolution de la profitabilité sur 5 ans.

**Données à saisir :** Idem A1 mais pour le résultat net.

> **Note :** Si le résultat net est négatif sur une ou plusieurs années, la formule TCAM affichera "N/A" (impossible de calculer un taux de croissance sur une base négative). C'est un signal d'alerte.

**Signal d'alerte :** Si le CA croît mais que le RN baisse, cela indique une **compression des marges** — à analyser dans la section A3.

---

### A3 — MARGE NETTE

**Objectif :** Mesurer la rentabilité réelle de chaque franc de chiffre d'affaires.

**Données à saisir :**
- Colonne B : Résultat Net de chaque année (en millions FCFA)
- Colonne C : CA/PNB de chaque année (même unité)

**Résultats automatiques :**

| Résultat | Interprétation |
|---|---|
| Marge ≥ 10% | Très rentable |
| Marge 5–10% | Rentable |
| Marge 2–5% | Faiblement rentable |
| Marge < 2% | Très faible — risqué |

**Moyenne 5 ans** : calculée automatiquement. Comparer à la moyenne sectorielle BRVM.

---

### A4 — INDICATEURS DE VALORISATION

C'est la section la plus importante de l'analyse fondamentale. Elle détermine si le prix actuel est justifié par les fondamentaux.

**Données à saisir (cellules orange) :**

| Cellule | Donnée | Source |
|---|---|---|
| B24 | Prix actuel de l'action (FCFA) | BRVM.org en temps réel |
| B25 | BNPA — Bénéfice Net Par Action | Rapport annuel = RN / Nb titres |
| B26 | Capitaux Propres (FCFA) | Bilan comptable |
| B27 | Capitalisation boursière (FCFA) | = Prix × Nb titres |
| B28 | Nombre de titres | BRVM.org |

**Indicateurs calculés automatiquement :**

#### PER — Price Earning Ratio
```
PER = Prix / BNPA
```
| PER | Signal BRVM |
|---|---|
| < 9 | Sous-évalué — opportunité possible |
| 9 – 15 | Zone normale |
| > 15 | Surévalué — prudence |
| > 50 | Fortement surévalué ou BNPA très faible |

> **Attention :** Un PER très élevé (ex: 1 200) signifie souvent que le BNPA est quasi nul. Ce n'est pas une vraie survalorisation mais plutôt un signe que l'entreprise génère très peu de bénéfice par action.

#### VMC — Valeur Mathématique Comptable
```
VMC = Capitaux Propres / Nombre de titres
```
- **Prix < VMC** : action décotée sous sa valeur comptable → signal favorable
- **Prix > VMC** : le marché paie une prime → vérifier si justifiée par la rentabilité

#### PBR — Price to Book Ratio
```
PBR = Capitalisation / Capitaux Propres
```
| PBR | Signal |
|---|---|
| < 1 | Décote sur actif net (achat potentiellement intéressant) |
| 1 – 2 | Normal |
| > 2 | Prime significative — justifiée seulement par une forte rentabilité |

#### ROE — Return on Equity
```
ROE = Résultat Net / Capitaux Propres × 100
```
| ROE | Signal |
|---|---|
| ≥ 15% | Excellent |
| 10 – 15% | Bon |
| 5 – 10% | Moyen |
| < 5% | Faible |

> **Lien PBR/ROE :** Un PBR élevé est acceptable si le ROE est élevé. La règle de Lynch : `RVC = PER × PBR < 22` indique une décote globale.

---

### A5 — DIVIDENDES & TAUX DE DISTRIBUTION

**Objectif :** Évaluer la politique de distribution et le rendement du dividende.

**Données à saisir :**
- Colonne B : Dividende brut versé chaque année
- Colonne C : BNPA de chaque année

**Indicateurs calculés :**

| Indicateur | Formule | Seuil BRVM |
|---|---|---|
| Taux de distribution | `DVD / (BNPA × 0.85) × 100` | 40–60% = sain |
| Rendement dividende | `DVD / Prix × 100` | > 3% = attractif |

> **Le 0.85 :** correspond au précompte sur dividendes en Côte d'Ivoire (15%). Pour d'autres pays BRVM, le taux peut varier légèrement.

> **Conseil :** Un taux de distribution > 100% signifie que l'entreprise distribue plus qu'elle ne gagne — non soutenable à long terme.

**Absence de dividende :** Ne pas éliminer un titre uniquement parce qu'il ne verse pas de dividende. Certaines entreprises en croissance préfèrent réinvestir leurs bénéfices (ce qui se traduit par une hausse du cours).

---

### A6 — FONDS PROPRES

**Objectif :** Analyser la solidité du bilan et la capacité de l'entreprise à absorber des pertes.

**Données à saisir :** Valeurs N-1 et N pour chaque composante du bilan.

**Composantes :**
- **Capital souscrit** : apport initial des actionnaires
- **Réserves** : bénéfices accumulés non distribués
- **Report à nouveau (RAN)** : résultats reportés d'années précédentes
- **Résultat Net** : bénéfice de l'exercice en cours
- **Dividendes versés** : montant sorti pour rémunérer les actionnaires

**Interprétation :**
- **Réserves + RAN importants** = entreprise qui capitalise sur le long terme → signal très positif
- **Fonds propres en hausse** = l'entreprise s'enrichit
- **Fonds propres en baisse** = elle consomme son patrimoine → signal d'alerte

---

### A7 — NOTATION & ACTIVITÉS RÉCENTES

**Objectif :** Intégrer les informations qualitatives récentes.

**Données à saisir :**
- Notation financière (court et long terme) : se trouve dans les rapports des agences
- Variation CA/PNB du dernier trimestre : source RichBourse ou rapport trimestriel
- Variation RN du dernier trimestre : idem

**Notations typiques :**
| Note | Signification |
|---|---|
| A1 / A+ | Très bonne qualité de crédit |
| A2 / A | Bonne qualité |
| B / BBB | Qualité moyenne |
| C ou moins | Spéculatif / risqué |

---

### A8 — COMPARAISON MARCHÉ BOURSIER VS ÉPARGNE

**Objectif :** Comparer rétrospectivement ce que tu aurais gagné en investissant dans ce titre vs en laissant ton argent en épargne.

**Données à saisir :**
- **Montant investi** : capital hypothétique (ex: 1 000 000 FCFA)
- **Prix d'achat** : cours au moment de l'investissement historique
- **Prix actuel** : cours aujourd'hui
- **Total dividendes par titre** reçus sur la période (colonne C)
- **Rendement épargne** : taux de référence (ex: 5%/an sur 5 ans = 27.6%)

**Résultats automatiques :**
- Plus-value totale, rendement dividendes, rendement total, performance en %
- **Verdict** : Marché Boursier ou Épargne selon lequel a mieux performé

> **Usage :** Cet outil est rétrospectif. Il aide à calibrer les attentes et à justifier (ou non) l'investissement en bourse par rapport à une alternative sans risque.

---

## 5. FEUILLE ETUDE — ANALYSE TECHNIQUE

### B1 — INDICATEURS TECHNIQUES

**Objectif :** Lire le comportement du cours sur un graphique et détecter si on est en zone d'achat ou de vente.

> **Prérequis :** Ouvrir le graphique du titre sur TradingView, RichBourse, ou BRVM.org avant de remplir cette section.

**Pour chaque indicateur, saisir le signal observé :**

#### Moyenne Mobile 20 jours (MM20)
- **Survente** : le cours est EN DESSOUS de la MM20
- **Neutre** : le cours est sur la MM20
- **Surachat** : le cours est AU-DESSUS de la MM20

#### Bandes de Bollinger
- **Survente** : le cours touche ou franchit la bande inférieure
- **Neutre** : le cours est entre les deux bandes
- **Surachat** : le cours touche ou franchit la bande supérieure

#### MACD
- **Survente** : MACD vient de croiser le signal à la hausse (signal haussier)
- **Neutre** : MACD oscille sans direction claire
- **Surachat** : MACD vient de croiser le signal à la baisse (signal baissier)

#### RSI (Relative Strength Index)
| Valeur RSI | Signal |
|---|---|
| < 30 | Zone de survente — signal d'achat potentiel |
| 30 – 70 | Zone neutre |
| > 70 | Zone de surachat — signal de vente potentiel |

> **Saisir la valeur numérique du RSI** dans la colonne C (ex: 28.5).

#### Volume
- **Survente** : volume en hausse accompagnant une baisse du cours (accumulation possible)
- **Neutre** : volume stable
- **Surachat** : volume faible lors de la hausse (hausse peu convaincante)

**Score automatique :**
- Le fichier attribue **+1** pour chaque signal "survente" et **−1** pour chaque signal "surachat"
- Score maximum : +5 (tous en survente) → Achat recommandé
- Score minimum : −5 (tous en surachat) → Vente recommandée

---

### B2 — PRIX MÉDIANS

**Objectif :** Situer le cours actuel par rapport aux moyennes historiques de prix.

**Données à saisir :**
- Plus haut et plus bas sur **52 semaines** (1 an)
- Plus haut et plus bas sur **2 ans**

> Ces données se trouvent sur TradingView ou RichBourse en consultant le graphique hebdomadaire.

**Formule automatique :**
```
Prix Médian = (Plus Haut + Plus Bas) / 2
```

**Interprétation :**
- **Prix actuel < PM** → on achète "en dessous de la moyenne" → zone de survente favorable
- **Prix actuel > PM** → on achète "au-dessus de la moyenne" → zone de surachat

> **Important :** Utiliser des plages DIFFÉRENTES pour PM 1 an et PM 2 ans. Un plus haut sur 1 an ne sera pas forcément le même que sur 2 ans.

---

### B3 — PER ACTUALISÉ

**Objectif :** Affiner le PER calculé en section A4 en intégrant la dernière évolution connue du résultat net.

**Données à saisir :**
- **Évolution RN dernier trimestre (%)** : variation du RN par rapport au même trimestre de l'an dernier

**Formules automatiques :**
```
BNPA actualisé = BNPA × (1 + évolution RN%)
PER actualisé  = Prix / BNPA actualisé
```

**Exemple :**
- BNPA 2024 = 150 FCFA
- Évolution RN T3 = −10%
- BNPA actualisé = 150 × (1 − 0.10) = 135 FCFA
- PER actualisé = 1 500 FCFA / 135 = 11.1 → Zone normale ✓

> **Pourquoi c'est utile :** Le BNPA officiel est celui du dernier exercice annuel. Mais si les résultats trimestriels montrent une forte variation, le PER réel est différent.

---

### B4 — PRIX CIBLE AUX DIVIDENDES (PCD)

**Objectif :** Estimer le prix théorique d'un titre en fonction du dividende qu'il verse.

> **⚠ Cette section n'est pertinente que si l'entreprise verse des dividendes.**  
> Si dividende = 0, passer directement à la section B5 (Gordon-Shapiro).

**Données à saisir :**
- **Évolution RN (%)** : même valeur que B3
- **Dividende brut N** : dernier dividende versé (en FCFA)
- **Rendement sectoriel BRVM** : taux de rendement de référence (défaut : 6.5%)

**Formules automatiques :**
```
Dividende prévisionnel = Dividende × (1 + évolution RN%)
PCD = 100 × Dividende prévisionnel / Rendement sectoriel%
Zone cible basse  = PCD × 0.95  (−5%)
Zone cible haute  = PCD × 1.05  (+5%)
```

**Interprétation :**
- **Prix actuel < Zone cible basse** → survente → signal d'achat
- **Prix actuel dans la zone** → prix juste
- **Prix actuel > Zone cible haute** → surachat → attendre une correction

**Rendement sectoriel BRVM :** Le taux de 6.5% est une référence. Tu peux l'ajuster selon le secteur :
- Banques/Assurances : 5–7%
- Distribution : 6–8%
- Industrie : 7–10%

---

### B5 — MODÈLE DE GORDON-SHAPIRO

**Objectif :** Calculer le prix théorique d'entrée via le modèle d'actualisation des dividendes.

**La formule :**
```
P₀ = D₁ / (r − g)

Où :
- D₁ = dividende attendu l'an prochain (FCFA)
- r  = taux de rentabilité exigé par l'investisseur
- g  = taux de croissance annuel des dividendes (supposé constant)
```

**Données à saisir (cellules orange) :**

| Paramètre | Valeur par défaut | Explication |
|---|---|---|
| D₁ | À saisir | Dernier dividende × (1 + g), ou hypothèse si pas de dividende |
| r | 8% | Ton coût du capital ou rendement minimum exigé |
| g | 2% | Croissance espérée des dividendes chaque année |

**Exemple :**
- D₁ = 650 FCFA
- r = 8% = 0.08
- g = 2% = 0.02
- P₀ = 650 / (0.08 − 0.02) = 650 / 0.06 = **10 833 FCFA**

**Interprétation :**
- **Prix actuel < P₀ × 0.95** → sous-évalué → opportunité d'achat
- **Prix actuel dans ±5% de P₀** → zone de juste valeur
- **Prix actuel > P₀ × 1.05** → surévalué → attendre

> **Conseils de calibrage :**
> - Si tu es un investisseur long terme prudent : r = 10–12%
> - Si tu acceptes plus de risque : r = 7–8%
> - g ne devrait pas dépasser le taux de croissance économique à long terme (2–3% pour la zone UEMOA)

> **Limitation :** Ce modèle suppose une croissance perpétuelle et constante des dividendes. Il est moins pertinent pour les entreprises qui ne versent pas de dividende ou dont les dividendes sont irréguliers.

---

### B6 — GESTION DU RISQUE : STOP-LOSS & RISK/REWARD

**Objectif :** Définir avant l'achat les niveaux de sortie (perte et gain) pour protéger ton capital.

**Données à saisir :**
- **Prix d'achat visé** : le cours auquel tu prévois d'acheter
- **Objectif de prix (Take Profit)** : le cours auquel tu prévois de vendre pour encaisser la plus-value

**Calculs automatiques :**
```
Stop-Loss       = Prix d'achat × 0.90    (perte maximum de 10%)
Perte potentielle = Prix d'achat − Stop-Loss
Gain potentiel    = Objectif − Prix d'achat
Ratio Risk/Reward = Gain potentiel / Perte potentielle
```

**Interprétation du ratio Risk/Reward :**
| Ratio | Signal |
|---|---|
| ≥ 3 | Excellent — risque très bien rémunéré |
| ≥ 2 | Bon — acceptable pour la plupart des investisseurs |
| 1 – 2 | Acceptable — à n'envisager qu'avec conviction |
| < 1 | Mauvais — le risque dépasse le gain potentiel → ne pas investir |

> **Règle pratique :** Ne jamais acheter un titre si le ratio Risk/Reward est inférieur à 2:1.

**Exemple :**
- Prix d'achat visé : 1 200 FCFA
- Stop-Loss : 1 200 × 0.90 = 1 080 FCFA
- Objectif : 1 800 FCFA
- Perte potentielle : 120 FCFA
- Gain potentiel : 600 FCFA
- Ratio : 600 / 120 = **5:1** → Excellent ✓

**Stratégie d'achat par palier (recommandée sur BRVM) :**
Plutôt que d'acheter en une seule fois, fractionner l'achat en 2 ou 3 paliers :
- Palier 1 : 33% du capital prévu à l'entrée
- Palier 2 : 33% si le cours baisse de 5%
- Palier 3 : 34% si le cours baisse de 10% supplémentaire

Cela réduit le coût moyen et le risque d'acheter exactement au plus haut.

---

## 6. FEUILLE SYNTHESE — TABLEAU DE BORD

### Objectif

Agréger tous les résultats de la feuille ETUDE en un **score global** qui donne un verdict d'investissement en un coup d'œil.

### Scorecard Fondamentale (score sur 24)

| Critère | Score max | Signal favorable |
|---|---|---|
| Croissance CA | 3 | CA en hausse sur 5 ans |
| Croissance RN | 3 | RN en hausse sur 5 ans |
| Marge nette moyenne | 3 | > 5% |
| PER | 3 | Entre 9 et 15 |
| PBR | 3 | < 1 idéalement |
| ROE | 3 | > 10% |
| Rendement dividende | 3 | > 3% |
| RVC (PER × PBR) | 3 | < 22 |

**Comment saisir les scores :**
1. Relever la valeur calculée dans la feuille ETUDE
2. Attribuer un score de 0 à 3 selon l'interprétation (0 = mauvais, 3 = excellent)
3. Saisir le signal observé dans la colonne "Signal observé"

### Scorecard Technique (score sur 15)

| Critère | Score max |
|---|---|
| MM20 + Bollinger + MACD + RSI + Volume | 5 |
| Prix Médians | 3 |
| PER actualisé | 3 |
| PCD / Gordon-Shapiro | 3 |
| Risk/Reward | 1 |

### Verdict Global

Le score total (/39) donne automatiquement un verdict :

| Score / 39 | % atteint | Verdict |
|---|---|---|
| ≥ 28 | ≥ 70% | **ACHETER** |
| 20 – 27 | 50 – 70% | **SURVEILLER** — attendre un meilleur point d'entrée |
| < 20 | < 50% | **EVITER** — trop de signaux négatifs |

> **Important :** Le verdict automatique est une aide à la décision, pas une instruction. Ton jugement personnel, ta tolérance au risque et ton horizon d'investissement doivent toujours prévaloir.

---

## 7. FEUILLE FORMULE — RÉFÉRENTIEL

Cette feuille ne se remplit pas — elle sert de **référence** pour comprendre les formules utilisées dans les autres feuilles.

Elle contient pour chaque indicateur :
- L'expression mathématique exacte
- L'unité de mesure
- Les seuils d'interprétation adaptés au contexte BRVM

Consulter cette feuille en cas de doute sur la signification d'un résultat.

---

## 8. WORKFLOW COMPLET D'UNE ANALYSE

Voici l'ordre recommandé pour remplir la fiche :

```
ÉTAPE 1 — Identifier la société (15 min)
    → Feuille PROFIL : compléter toutes les sections
    → Évaluer la liquidité du titre (décision go/no-go)

ÉTAPE 2 — Collecter les données financières (30 min)
    Sources : Rapport annuel + Rapport trimestriel + RichBourse
    → A1 : CA/PNB sur 5 ans
    → A2 : Résultat Net sur 5 ans
    → A3 : Vérifier les données (mêmes sources)
    → A4 : Prix actuel + BNPA + Capitaux Propres + Nb titres
    → A5 : Dividendes sur 5 ans + BNPA annuels
    → A6 : Bilan (capitaux propres N-1 et N)
    → A7 : Notation + dernières variations trimestrielles

ÉTAPE 3 — Analyse comparative épargne (5 min)
    → A8 : Renseigner prix d'achat historique + dividendes + prix actuel

ÉTAPE 4 — Analyse technique (20 min)
    Sources : TradingView / RichBourse (graphique du titre)
    → B1 : Observer MM20, Bollinger, MACD, RSI, Volume
    → B2 : Relever plus hauts et plus bas sur 1 an et 2 ans
    → B3 : Saisir l'évolution RN du dernier trimestre
    → B4 : Renseigner le dernier dividende (si applicable)
    → B5 : Définir tes hypothèses Gordon-Shapiro (D₁, r, g)
    → B6 : Fixer ton prix d'achat visé et ton objectif

ÉTAPE 5 — Synthèse (10 min)
    → Feuille SYNTHESE : attribuer les scores
    → Lire le verdict global
    → Rédiger ta conclusion dans la zone de texte libre

DURÉE TOTALE ESTIMÉE : 1h15 à 1h30
```

---

## 9. INTERPRÉTATION DES SIGNAUX

### Scénarios types

#### Scénario 1 : Titre en survente avec bons fondamentaux → Signal d'achat fort
- Score fondamental ≥ 18/24
- Score technique ≥ 8/15 (majorité en survente)
- Prix < PMM 1 an et 2 ans
- PER dans la zone normale ou sous-évalué
- Risk/Reward ≥ 2
- **→ Acheter par palier (25–50% du capital prévu à chaque palier)**

#### Scénario 2 : Bons fondamentaux mais surachat technique → Attendre
- Score fondamental ≥ 18/24
- Score technique ≤ 3/15 (majorité en surachat)
- Prix > PMM
- **→ Surveiller et attendre une correction pour entrer**

#### Scénario 3 : Fondamentaux faibles mais survente technique → Rebond court terme
- Score fondamental < 14/24
- Score technique ≥ 8/15
- **→ Trade court terme possible avec stop-loss strict, pas un investissement long terme**

#### Scénario 4 : Fondamentaux faibles + surachat → Éviter
- Score fondamental < 14/24
- Score technique ≤ 3/15
- **→ Ne pas investir**

### Signaux de prudence spécifiques BRVM

| Signal | Action recommandée |
|---|---|
| Liquidité faible (< 200 titres/jour) | Réduire la taille de la position |
| RN en baisse depuis 3 ans consécutifs | Attendre un retournement confirmé |
| Taux de distribution > 100% | Vérifier la soutenabilité du dividende |
| Pas de dividende depuis > 3 ans | Analyser le réinvestissement des bénéfices |
| PER > 100 | Vérifier que le BNPA n'est pas quasi-nul |
| PBR > 3 sans ROE élevé | Valeur probablement spéculative |

---

## 10. SOURCES D'INFORMATION RECOMMANDÉES

| Source | URL | Utilité |
|---|---|---|
| **BRVM** (officiel) | brvm.org | Cours en temps réel, historique, fiches sociétés |
| **RichBourse** | richbourse.com | Analyses, bilans, rapports trimestriels |
| **TradingView** | tradingview.com | Graphiques techniques (MM, Bollinger, MACD, RSI) |
| **Rapports annuels** | Site de chaque société | Bilans, comptes de résultat officiels |
| **BCEAO** | bceao.int | Taux directeur, contexte macro UEMOA |

### Où trouver le BNPA
1. Rapport annuel de la société (compte de résultat)
2. BNPA = Résultat Net / Nombre de titres en circulation
3. RichBourse (section "Données financières" du titre)

### Où trouver les données techniques
1. Ouvrir TradingView → Rechercher le ticker (ex: "CBIB" pour BERNABE)
2. Passer en vue hebdomadaire pour le PM 1 an et 2 ans
3. Activer les indicateurs : RSI(14), MACD(12,26,9), Bollinger(20,2)

---

## 11. GLOSSAIRE

| Terme | Définition |
|---|---|
| **BNPA** | Bénéfice Net Par Action = RN / Nombre de titres |
| **Capitalisation boursière** | Prix × Nombre de titres = valeur totale en bourse |
| **CMP** | Coût Moyen Pondéré = prix d'achat + frais de 1.4% |
| **FCFA** | Franc CFA — monnaie de la zone UEMOA |
| **Flottant** | Part des actions librement échangeables sur le marché |
| **Marge nette** | RN / CA × 100 — rentabilité par franc de CA |
| **PBR** | Price to Book Ratio = Prix / Valeur comptable par action |
| **PCD** | Prix Cible aux Dividendes — prix théorique basé sur le rendement |
| **PER** | Price Earning Ratio = Prix / BNPA — multiple de valorisation |
| **PNB** | Produit Net Bancaire — équivalent du CA pour les banques |
| **RAN** | Report À Nouveau — bénéfices reportés des exercices précédents |
| **Risk/Reward** | Ratio gain potentiel / perte potentielle |
| **RN** | Résultat Net — bénéfice final après impôts |
| **ROE** | Return On Equity = RN / Capitaux Propres × 100 |
| **RSI** | Relative Strength Index — indicateur de momentum (0 à 100) |
| **RVC** | Ratio de Valorisation Composite = PER × PBR (Lynch) |
| **Stop-Loss** | Niveau de cours où l'on vend pour limiter une perte |
| **Surachat** | Le cours a fortement monté, risque de correction |
| **Survente** | Le cours a fortement baissé, rebond possible |
| **Take Profit** | Niveau de cours où l'on vend pour encaisser un gain |
| **TCAM / CAGR** | Taux de Croissance Annuel Moyen sur N années |
| **VMC** | Valeur Mathématique Comptable = Capitaux Propres / Nb titres |

---

*Manuel rédigé pour la fiche d'analyse BRVM v2 — Mai 2026*
