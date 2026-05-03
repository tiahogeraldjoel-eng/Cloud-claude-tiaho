# BRVM Alerte 📊

Application Android de détection algorithmique des titres à fort potentiel sur la **Bourse Régionale des Valeurs Mobilières (BRVM)** d'Afrique de l'Ouest.

## Fonctionnalités

### Moteur de Scoring (0–100)
| Catégorie | Poids | Indicateurs |
|-----------|-------|-------------|
| Technique | 45 pts | RSI(14), MACD, Bollinger, SMA 20/50/200, ADX, Stochastique |
| Fondamental | 35 pts | PER, Rendement dividende, Price-to-Book, ROE |
| Flux Smart Money | 20 pts | Volume anomaly, OBV, Money Flow Index |

> **Psychologie BRVM intégrée** : pondération renforcée sur le rendement dividende et le PBR, car l'investisseur-salarié BRVM priorise le revenu et les décotes.

### Alertes Multi-canal
- **WhatsApp** — partage direct avec mise en forme
- **SMS** — envoi via l'app SMS native ou direct API
- **Email** — client mail natif
- **Push Notification** — Firebase Cloud Messaging

### Niveaux de Priorité
| Priorité | Score | Cas |
|----------|-------|-----|
| 🔴 URGENT | ≥75 + volume anormal | Action immédiate |
| 🟠 FORT | ≥65 | Forte opportunité |
| 🟡 MODÉRÉ | ≥50 | À surveiller |
| 🔵 INFO | <50 | Informatif |

### Calendrier des Événements
- Résultats annuels / semestriels
- Dates ex-dividende et paiement
- AGO / AGE / Conseil d'administration
- Compte à rebours (J-X) avec couleur d'urgence

### Scanner Avancé
- Filtres : Score élevé, Anomalie volume, Dividende, Survendu, Ma liste
- Recherche par ticker ou nom
- Barre de score visuelle par titre

### Sécurité
- Authentification biométrique au démarrage
- Chiffrement Room SQLCipher-ready
- Pas de données sensibles sur serveur tiers

## Architecture

```
Clean Architecture + MVVM
├── data/          API REST, Room DB, DataStore
├── domain/        Use cases, modèles, interfaces
├── presentation/  Jetpack Compose, ViewModels
├── service/       FCM, Notifications
├── worker/        WorkManager (analyse horaire)
└── di/            Hilt injection
```

## Stack Technique

- **Kotlin** 2.0 + Coroutines + Flow
- **Jetpack Compose** + Material Design 3
- **Hilt** (injection de dépendances)
- **Room** (base de données locale)
- **Retrofit** + OkHttp (API BRVM)
- **WorkManager** (analyse périodique)
- **Firebase FCM** (push notifications)
- **DataStore** (préférences)
- **Biometric API** (sécurité)

## Configuration

### 1. Firebase
Remplacez `app/google-services.json` avec votre propre fichier Firebase.

### 2. API BRVM
L'application utilise `https://openapi.brvm.org/` par défaut.
Modifiez `BuildConfig.BRVM_API_BASE_URL` si besoin.

### 3. Compilation
```bash
./gradlew assembleDebug    # Debug APK
./gradlew assembleRelease  # Release APK (signer requis)
```

## Worker de Scan

L'analyse se déclenche :
- **Automatiquement** : toutes les heures (si connecté au réseau)
- **Au démarrage** du téléphone (BootReceiver)
- **Manuellement** via le bouton Actualiser

## Format des Alertes WhatsApp

```
🔴 URGENT — SGBCI
━━━━━━━━━━━━━━━━━━━━━
🏢 Société Générale de Banques en Côte d'Ivoire
💰 Prix: 4250 FCFA (+3.66%)
📊 Score: 82/100 | 🎯 ACHAT FORT
🚀 Objectif: 4590 FCFA
━━━━━━━━━━━━━━━━━━━━━
📌 Signaux détectés:
  • RSI en zone d'accumulation (38)
  • Volume EXPLOSIF — 3.2x la moyenne
  • MACD haussier avec momentum positif
  • Bon rendement dividende (5.2%)

BRVM Alerte — Analyse algorithmique
```

## Titres Couverts

Tous les ~47 titres listés sur la BRVM (Côte d'Ivoire, Sénégal, Burkina Faso, Mali, Togo, Bénin, Guinée-Bissau, Niger).

---
*BRVM Alerte est un outil d'aide à la décision. Il ne constitue pas un conseil en investissement.*
