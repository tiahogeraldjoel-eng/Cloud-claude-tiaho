# BRVM Intelligence 📈

**Assistant Analyste Financier IA spécialisé BRVM (Bourse Régionale des Valeurs Mobilières)**

> Application Android native pour les investisseurs opérant sur les marchés financiers des 8 pays de l'UEMOA (Côte d'Ivoire, Sénégal, Burkina Faso, Togo, Mali, Bénin, Guinée-Bissau, Niger).

---

## 📱 Fonctionnalités

### Module Données BRVM
- Scraping en temps réel de brvm.org (pas d'API officielle disponible)
- Historique des prix sur 5 ans par action
- Données fondamentales : PER, dividendes, capitalisation boursière
- Indices BRVM Composite et BRVM 10
- Synchronisation automatique toutes les 30 minutes via WorkManager

### Module Analyse Technique
- **Indicateurs** : RSI, MACD, Bollinger Bands, MA20/MA50/MA200
- **Figures chartistes** : Épaule-Tête-Épaule, Double Top/Bottom, Triangles
- **Supports & Résistances** auto-calculés par clustering de pivots
- Score de confiance 0–100% avec explication en français

### Module Psychologie de Marché
- Indice **Fear & Greed** adapté aux spécificités BRVM
- Détection du comportement des institutionnels (smart money)
- Analyse saisonnalité (dividendes janv-mars, résultats semestriels)
- Impact macroéconomique UEMOA : taux BCEAO, CFA, corrélation CAC40
- Alertes de manipulation sur titres peu liquides

### Module IA Prédictive
- Modèle **LSTM** (TensorFlow Lite) embarqué pour prédictions J+1 à J+5
- Algorithme statistique en fallback (régression pondérée multi-momentum)
- Score de probabilité avec intervalle de confiance 95%
- **Backtesting** automatique des prédictions sur l'historique
- Facteurs spécifiques BRVM : saisonnalité, matières premières, volumes

### Module Portefeuille
- Saisie des positions en **FCFA** (titre, quantité, prix d'achat)
- Performance globale et par ligne (%, gain absolu)
- Métriques de risque : **Sharpe Ratio**, Beta, **VaR 95%**
- Allocation sectorielle avec score de diversification
- Comparaison vs indice BRVM Composite
- Chiffrement **AES-256** via Android Keystore

### Module Recommandations
- Signal global : **Achat Fort / Achat / Neutre / Vente / Vente Forte**
- Plan de trade complet : entrée, stop-loss, objectifs (×3), taille de position
- Valorisation **DCF** + comparables sectoriels
- Explication en français accessible

### Module Chat IA
- Interface conversationnelle en langage naturel
- Réponses contextualisées à la BRVM et l'UEMOA
- Questions suggérées intelligentes
- Historique de conversation

---

## 🏗️ Architecture

```
app/
├── BRVMApplication.kt              # Application Hilt + WorkManager + notifications
├── di/                             # Injection de dépendances (Hilt)
│   ├── AppModule.kt
│   ├── DatabaseModule.kt
│   ├── NetworkModule.kt
│   └── RepositoryModule.kt
├── domain/                         # Couche métier pure (indépendante Android)
│   ├── model/                      # Entités du domaine
│   │   ├── Stock.kt
│   │   ├── PriceHistory.kt
│   │   ├── TechnicalAnalysis.kt
│   │   ├── MarketSentiment.kt
│   │   ├── Prediction.kt
│   │   ├── Portfolio.kt
│   │   └── MarketIndex.kt
│   ├── repository/                 # Interfaces des repositories
│   │   ├── StockRepository.kt
│   │   ├── PortfolioRepository.kt
│   │   └── AnalysisRepository.kt
│   └── usecase/                    # Use Cases (logique applicative)
│       ├── GetMarketSummaryUseCase.kt
│       ├── GetStocksUseCase.kt
│       ├── PortfolioUseCases.kt
│       └── AnalysisUseCases.kt
├── data/                           # Couche données
│   ├── local/
│   │   ├── database/BRVMDatabase.kt
│   │   ├── dao/                    # Room DAOs
│   │   └── entity/                 # Entités Room
│   ├── remote/
│   │   ├── scraper/BRVMScraper.kt  # Scraping brvm.org (Jsoup)
│   │   └── dto/                    # Data Transfer Objects
│   ├── ml/
│   │   ├── TechnicalIndicatorCalculator.kt  # RSI, MACD, BB, MA
│   │   ├── MarketSentimentAnalyzer.kt       # Fear & Greed BRVM
│   │   └── BRVMPredictor.kt                # LSTM + Statistique
│   ├── repository/                 # Implémentations
│   ├── worker/MarketSyncWorker.kt  # Sync périodique (WorkManager)
│   └── service/                    # Firebase Messaging
├── presentation/
│   ├── theme/                      # Material Design 3 (couleurs africaines)
│   ├── navigation/NavGraph.kt
│   ├── screens/
│   │   ├── onboarding/             # 4 pages d'introduction
│   │   ├── dashboard/              # Tableau de bord (indices, Fear&Greed)
│   │   ├── stocks/                 # Liste et détail des actions
│   │   ├── portfolio/              # Gestion portefeuille
│   │   ├── analysis/               # Analyse technique complète
│   │   └── chat/                   # Assistant IA conversationnel
│   └── components/                 # Composants réutilisables
│       ├── StockListItem.kt
│       ├── MarketIndexCard.kt
│       ├── PriceChart.kt           # Graphiques Canvas natifs
│       ├── FearGreedGauge.kt       # Jauge semi-circulaire
│       └── TechnicalSignalCard.kt
├── security/
│   └── PortfolioEncryption.kt      # AES-256 via Android Keystore
└── utils/
    ├── NumberFormatter.kt           # Format FCFA/UEMOA
    └── DateUtils.kt
```

### Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Language | Kotlin |
| Architecture | MVVM + Clean Architecture + Repository Pattern |
| UI | Jetpack Compose + Material Design 3 |
| Base de données | Room (SQLite) |
| Réseau/Scraping | OkHttp + Jsoup |
| ML embarqué | TensorFlow Lite (LSTM) |
| Synchronisation | WorkManager |
| Injection dépendances | Hilt |
| Navigation | Navigation Compose |
| Notifications | Firebase Cloud Messaging |
| Sécurité | EncryptedSharedPreferences (AES-256-GCM) |
| Préférences | DataStore |

---

## 🚀 Installation & Déploiement

### Prérequis
- Android Studio Hedgehog (2023.1.1) ou supérieur
- JDK 17
- Android SDK API 26+ (Android 8.0)
- Compte Firebase (pour les notifications push)

### Étapes de configuration

#### 1. Cloner le projet
```bash
git clone https://github.com/votre-org/BRVMIntelligence.git
cd BRVMIntelligence
```

#### 2. Configurer Firebase
```bash
# Créer un projet Firebase sur https://console.firebase.google.com
# Télécharger google-services.json et placer dans app/
cp google-services.json app/
```

#### 3. Placer le modèle TFLite (optionnel)
```bash
# Si vous avez entraîné un modèle LSTM BRVM :
cp brvm_lstm_model.tflite app/src/main/assets/
# Sans le modèle, l'app utilise l'algorithme statistique en fallback
```

#### 4. Build et exécution
```bash
./gradlew assembleDebug
# ou via Android Studio : Run > Run 'app'
```

#### 5. Build release
```bash
# Configurer la keystore dans local.properties :
# KEYSTORE_PATH=path/to/keystore.jks
# KEYSTORE_PASSWORD=xxx
# KEY_ALIAS=xxx
# KEY_PASSWORD=xxx

./gradlew assembleRelease
```

---

## ⚠️ Avertissements Importants

### Réglementaire
> **Cette application fournit des informations à titre indicatif uniquement. Elle ne constitue pas un conseil en investissement réglementé au sens de la réglementation AMF-UMOA. Consultez un conseiller financier agréé avant toute décision d'investissement.**

### Risques spécifiques BRVM
- **Faible liquidité** : de nombreux titres sont peu échangés, rendant la revente difficile
- **Spread achat/vente** : les écarts peuvent être importants sur les petites capitalisations
- **Risque de manipulation** : la faible liquidité expose aux manipulations de cours
- **Données** : les données sont scrapées (non officielles) et peuvent présenter des retards ou erreurs
- **Modèle IA** : les prédictions sont basées sur des données historiques et ne garantissent pas les performances futures

### Scraping brvm.org
Le scraping est nécessaire car la BRVM ne dispose pas d'API publique. Le scraper est conçu pour être robuste aux changements mineurs de structure HTML. En cas de changement majeur du site, la mise à jour du scraper (`BRVMScraper.kt`) sera nécessaire.

---

## 🔧 Entraînement du modèle LSTM (optionnel)

Pour entraîner le modèle LSTM sur vos propres données BRVM :

```python
# requirements: tensorflow, pandas, numpy, scikit-learn

import tensorflow as tf
import pandas as pd
import numpy as np

# 1. Charger l'historique BRVM (5 ans)
df = pd.read_csv('brvm_historical_data.csv')

# 2. Préparer les séquences (fenêtre de 20 jours)
WINDOW = 20
X, y = [], []
for i in range(WINDOW, len(df)):
    X.append(df['close'].values[i-WINDOW:i])
    y.append(df['close'].values[i])
X, y = np.array(X), np.array(y)

# 3. Architecture LSTM
model = tf.keras.Sequential([
    tf.keras.layers.LSTM(50, return_sequences=True, input_shape=(WINDOW, 1)),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.LSTM(50, return_sequences=False),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(5)  # Prédiction J+1 à J+5
])
model.compile(optimizer='adam', loss='mse', metrics=['mae'])
model.fit(X.reshape(-1, WINDOW, 1), y, epochs=50, validation_split=0.2)

# 4. Convertir en TFLite
converter = tf.lite.TFLiteConverter.from_keras_model(model)
tflite_model = converter.convert()
with open('brvm_lstm_model.tflite', 'wb') as f:
    f.write(tflite_model)
```

---

## 📊 Actions BRVM Supportées

L'application supporte toutes les actions cotées sur la BRVM, notamment :

| Symbole | Société | Pays | Secteur |
|---------|---------|------|---------|
| SONR-CI | Sonatel CI | Côte d'Ivoire | Services Publics |
| SGBCI | Société Générale Banques CI | Côte d'Ivoire | Finance |
| ETIT | Ecobank Transnational | Multi-pays | Finance |
| ONTBF | ONatel Burkina Faso | Burkina Faso | Services Publics |
| PALC | Palm CI | Côte d'Ivoire | Agriculture |
| SIVC | Sifca CI | Côte d'Ivoire | Agriculture |
| BOABF | Bank of Africa BF | Burkina Faso | Finance |
| SNTS | Sonatel Sénégal | Sénégal | Services Publics |
| ... | 45+ autres titres | UEMOA | Divers |

---

## 🗓️ Calendrier du Marché BRVM

| Période | Événement |
|---------|-----------|
| Janvier–Mars | Saison des dividendes (détachements) |
| Avril–Mai | Publications résultats annuels + AG |
| Juin–Août | Ralentissement estival (faibles volumes) |
| Septembre–Octobre | Avant-résultats semestriels |
| Novembre–Décembre | Rééquilibrage fin d'année |

**Horaires de cotation** : Lundi–Vendredi, 09h00–15h30 (GMT+0, heure d'Abidjan)

---

## 📄 Licence

```
Copyright (c) 2025 BRVM Intelligence

Ce logiciel est fourni à titre éducatif et informatif uniquement.
Toute utilisation commerciale requiert une autorisation explicite.
Les analyses générées ne constituent pas un conseil financier réglementé.
```

---

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/amelioration-scraper`)
3. Commit (`git commit -m 'Amélioration scraper BRVM'`)
4. Push (`git push origin feature/amelioration-scraper`)
5. Ouvrir une Pull Request

---

*BRVM Intelligence — Votre fenêtre sur les marchés financiers de l'Afrique de l'Ouest 🌍*
