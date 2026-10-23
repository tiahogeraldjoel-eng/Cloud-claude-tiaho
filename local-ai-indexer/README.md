# Local AI Indexer

Application Android 100% locale : OCR (ML Kit), recherche vectorielle
(ObjectBox + index HNSW) et synthèse de réponse par un modèle LLM local
(llama.cpp via JNI). Aucune donnée ne quitte l'appareil.

## Pourquoi il n'y a pas d'APK prêt à l'emploi dans ce dépôt

Compiler cette app nécessite le SDK Android, le NDK et un compilateur C++
pour lier `llama.cpp` (bibliothèque d'inférence en C++, récupérée et
compilée à partir des sources à chaque build). Cet environnement de
développement cloud n'a pas accès à `dl.google.com` (le serveur qui
distribue le SDK/NDK Android), donc une compilation locale ici est
impossible.

À la place, un workflow **GitHub Actions**
(`.github/workflows/build-local-ai-indexer-apk.yml`) compile l'APK sur
l'infrastructure de GitHub (qui a le SDK/NDK Android préinstallés et un
accès réseau complet) à chaque push sur cette branche. L'APK résultant est
publié sur une **Release GitHub** (lien de téléchargement direct, stable
d'un build à l'autre) ainsi que comme artifact de l'exécution du workflow.

## Installer l'APK

1. Allez dans l'onglet **Releases** du dépôt (ou directement sur
   `github.com/<owner>/<repo>/releases/tag/local-ai-indexer-debug`) et
   téléchargez `app-debug.apk` — lien de téléchargement direct, y compris
   depuis un navigateur mobile. Si ce lien pose problème, l'APK reste aussi
   disponible comme artifact `LocalAIIndexer-debug` sur la dernière
   exécution réussie de l'onglet **Actions**.
2. Transférez l'APK sur votre téléphone si nécessaire (câble, Drive, etc.)
   et installez-le (autoriser "sources inconnues" si demandé). C'est un
   build **debug**, signé automatiquement avec la clé de debug —
   installable directement, pas besoin de compte développeur.

Compatibilité : Android 8.0+ (minSdk 26), architecture **arm64-v8a**
uniquement (couvre la quasi-totalité des téléphones récents, notamment
ceux avec 8-16 Go de RAM).

## Ajouter un modèle GGUF (obligatoire pour la génération de réponses)

L'app fonctionne sans modèle (OCR + recherche vectorielle restent actifs),
mais la synthèse de réponse par LLM local nécessite un fichier `.gguf`
posé sur l'appareil, car aucun modèle n'est embarqué dans l'APK (plusieurs
Go, à choisir selon vos besoins).

```bash
adb push mon-modele.gguf /sdcard/Android/data/com.example.localaiindexer/files/model.gguf
```

Avec 12 Go de RAM, un modèle quantifié **Q4_K_M** dans ces gammes tourne
confortablement en CPU sur l'appareil :

| Taille du modèle | Poids GGUF (Q4_K_M) | RAM utilisée à l'exécution |
|---|---|---|
| 3B (ex. Phi-3-mini, Qwen2.5-3B) | ~2 Go | ~3-4 Go |
| 7-8B (ex. Llama-3.1-8B, Mistral-7B) | ~4-5 Go | ~6-7 Go |
| 13B | ~7-8 Go | ~9-10 Go |

Relancez l'app après avoir poussé le fichier (le modèle est chargé au
démarrage). Le statut affiché à l'écran indique si le modèle a été trouvé.

## Limites connues de ce premier build

- Échantillonnage glouton (greedy) uniquement, pas de température/top-p —
  simple à rendre fiable, à améliorer si besoin.
- Chaque recherche recrée un contexte d'inférence (pas de cache de
  conversation entre les requêtes) — plus simple et sans risque de
  dépassement de contexte, au prix d'un rechargement du prompt à chaque
  fois.
- L'"embedding" de `LocalEmbeddingEngine` est un vecteur pseudo-aléatoire
  dérivé du hash du texte (placeholder du code d'origine), pas un vrai
  modèle d'embedding sémantique — la recherche vectorielle ne reflètera
  pas la similarité de sens tant qu'il n'est pas remplacé par un vrai
  modèle (ex. un modèle d'embedding GGUF chargé via la même bibliothèque
  llama.cpp).
- Une seule architecture (arm64-v8a) est buildée pour garder le temps de
  compilation raisonnable.
