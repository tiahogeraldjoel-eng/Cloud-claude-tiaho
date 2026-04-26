# BRVM Analyser — Application Android

Application Android d'analyse complète des titres cotés à la **Bourse Régionale des Valeurs Mobilières (BRVM)**.

## Fonctionnalités

### Analyse des titres
- **Fondamentale** : PER, PBR, rendement dividende, ROE, DCF, score 0-100
- **Technique** : MA20/50/200, RSI, MACD, Bollinger Bands, volumes, support/résistance
- **Psychologique** : Réaction aux dividendes, saisons, liquidité, sentiment marché, risque pays

### Recommandations
- Verdict **ACHAT / CONSERVATION / VENTE** selon 4 profils investisseurs
- Recommandations quotidiennes automatiques
- Niveau de confiance en pourcentage

### Profils investisseurs
| Profil | Pondération | Risque |
|--------|------------|--------|
| 🛡️ Prudent | 40% Fond + 40% Tech + 20% Psy | Faible |
| ⚖️ Équilibré | 35% Fond + 40% Tech + 25% Psy | Modéré |
| 🚀 Croissance | 25% Fond + 45% Tech + 30% Psy | Élevé |
| ⚡ Spéculatif | 15% Fond + 50% Tech + 35% Psy | Très élevé |

### Autres fonctionnalités
- **Screener** : filtrage multi-critères (secteur, pays, score, dividende, PER)
- **Portefeuille** : suivi P&L en temps réel
- **Rapports PDF** téléchargeables
- **Mise à jour automatique** toutes les 4h (pendant les heures de marché)
- **39 titres** couverts sur tous les marchés BRVM

## Architecture technique (100% autonome — zéro API externe)

```
Niveau 1 : Cache local IndexedDB (instantané)
Niveau 2 : Proxies CORS → scraping brvm.org (si réseau)
Niveau 3 : Android WebView Bridge (données natives)
Niveau 4 : Données intégrées + simulation (toujours disponible)
```

## Compilation APK

### Prérequis
- Android Studio Hedgehog (2023.1.1) ou supérieur
- Android SDK API 21 minimum, API 34 cible
- Java 8+

### Via Android Studio (recommandé)
1. Ouvrir le dossier `android/` dans Android Studio
2. `Build > Build Bundle(s)/APK(s) > Build APK(s)`
3. L'APK se trouve dans `android/app/build/outputs/apk/debug/`

### Via ligne de commande
```bash
chmod +x build.sh
./build.sh debug     # APK debug (installation directe)
./build.sh release   # APK release (signé)
./build.sh studio    # Ouvre Android Studio
```

## Structure du projet

```
brvm-analyzer/
├── android/                    # Projet Android
│   ├── app/src/main/
│   │   ├── assets/www/        # Application web embarquée
│   │   │   ├── index.html
│   │   │   ├── css/style.css
│   │   │   └── js/
│   │   │       ├── data/       brvm-stocks.js, fetcher.js
│   │   │       ├── analysis/   fundamental.js, technical.js,
│   │   │       │               psychological.js, scoring.js
│   │   │       ├── reports/    pdf-generator.js
│   │   │       ├── ui/         charts.js
│   │   │       ├── app-core.js
│   │   │       ├── app-ui.js
│   │   │       ├── app-portfolio.js
│   │   │       └── app.js
│   │   └── java/com/brvm/analyzer/
│   │       ├── MainActivity.java
│   │       ├── UpdateService.java
│   │       ├── UpdateWorker.java
│   │       ├── BootReceiver.java
│   │       └── SplashActivity.java
└── build.sh                   # Script de compilation
```

## Données couvertes (39 titres)

Banque, Agriculture, Télécom, Pétrole & Gaz, Industrie, Distribution, Assurance, Transport, Agroalimentaire, Immobilier, Textile

Pays : Côte d'Ivoire, Sénégal, Burkina Faso, Mali, Niger, Bénin, Togo

---
*BRVM Analyser v1.0.0 — À titre informatif uniquement, ne constitue pas un conseil en investissement.*
