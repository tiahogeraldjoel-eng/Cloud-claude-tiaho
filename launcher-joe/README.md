# Launcher Joe 🚀

**Launcher Android complet** avec écran d'accueil, grille d'apps, intégration Claude API, module BRVM, anniversaires et thème sombre.

## Fonctionnalités

### 🏠 Écran d'accueil
- Horloge et date dynamiques (mise à jour en temps réel)
- 5 boutons d'accès rapide (Joe AI, BRVM, Anniversaires, Apps, Paramètres)
- Dock personnalisable (3-6 apps)
- Fond d'écran personnalisable
- Geste swipe-up pour ouvrir le tiroir d'apps
- Appui long pour options (fond d'écran / paramètres)

### 📱 Tiroir d'applications
- Grille configurable (3 à 6 colonnes)
- Recherche instantanée
- Animations d'ouverture fluides
- Affichage/masquage des labels

### 🤖 Joe AI (Assistant Claude)
- Chat en temps réel avec Claude API
- Système prompt optimisé pour l'Afrique de l'Ouest
- Historique de conversation persistant
- Analyse des actions BRVM par IA
- Configuration sécurisée de la clé API

### 📈 Module BRVM
- **27 actions BRVM** pré-chargées (CI, BJ, SN, TG, ML, NE, BF)
- Tentative de récupération des données en ligne depuis brvm.org
- Fallback sur données réalistes avec variations journalières simulées
- Filtres: Toutes / Hausses / Baisses / Favoris
- Mise en favoris par action
- Indicateurs visuels: ↑ vert, ↓ rouge
- Résumé de marché (indice composite, tendance)
- Rafraîchissement manuel et automatique configurable

### 🎂 Anniversaires
- Synchronisation automatique depuis les contacts Android
- Vue par: Aujourd'hui / Cette semaine / Ce mois / Tous
- Alertes visuelles pour les anniversaires du jour
- Notifications à 8h le jour J
- Ajout manuel d'anniversaires
- Affichage de l'âge (si année connue)
- Photo du contact ou initiales colorées

### 🌙 Thème sombre
Palette complète:
- Fond: `#0D0D0D` → `#1A1A2E`
- Accent: `#E94560` (rouge-rose)
- Claude: `#7C3AED` (violet)
- BRVM: `#10B981` (vert)
- Anniversaires: `#F59E0B` (ambre)

## Structure du projet

```
launcher-joe/
├── app/
│   ├── src/main/
│   │   ├── java/com/joe/launcher/
│   │   │   ├── activities/      # HomeActivity, AppDrawerActivity, ClaudeActivity, BRVMActivity, BirthdaysActivity, SettingsActivity + Dialogs
│   │   │   ├── adapters/        # AppGridAdapter, DockAdapter, ChatAdapter, BRVMAdapter, BirthdayAdapter
│   │   │   ├── models/          # AppInfo, ChatMessage, BRVMStock, BirthdayContact
│   │   │   ├── receivers/       # BootReceiver, BirthdayReceiver, AppChangeReceiver
│   │   │   ├── services/        # BRVMUpdateWorker, BRVMUpdateService
│   │   │   ├── utils/           # ClaudeApiClient, BRVMDataFetcher, AppLoader, BirthdayLoader, BirthdayScheduler, PrefsManager
│   │   │   ├── widgets/         # ClockWidgetProvider
│   │   │   └── LauncherApp.kt
│   │   └── res/
│   │       ├── layout/          # 15 fichiers XML layout
│   │       ├── drawable/        # 30+ fichiers XML drawables
│   │       ├── anim/            # 9 animations
│   │       ├── values/          # colors, strings, themes
│   │       └── xml/             # network_security_config, clock_widget_info
│   └── build.gradle
├── settings.gradle
├── build.gradle
└── gradle.properties
```

## Configuration

### Clé API Claude
1. Obtenez votre clé sur [console.anthropic.com](https://console.anthropic.com)
2. Dans le launcher → Paramètres → Configurer la clé API
3. Ou dans `app/build.gradle`: `CLAUDE_API_KEY = "sk-ant-..."`

### Compilation
```bash
# Avec clé API en variable d'environnement
./gradlew assembleDebug -PCLAUDE_API_KEY="sk-ant-votre-cle"

# Sans clé (configurable dans l'app)
./gradlew assembleDebug
```

**SDK**: minSdk 26 (Android 8.0) · targetSdk 34 (Android 14)  
**Langage**: Kotlin · **UI**: Material Design 3 · Thème sombre natif
