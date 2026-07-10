---
name: boc-revu
description: Use when the user shares raw data from a BRVM (Bourse Régionale des Valeurs Mobilières) Bulletin Officiel de la Cote (BOC) and asks for a market analysis report, or types /boc-revu. Produces a structured 7-step BRVM equity-market report (indices, valuation/momentum screening, top stock picks, scoring, market validation, order book, strategic conclusion). Requires the actual BOC bulletin data as input — never fabricates prices, PER, yields or volumes.
---

# BOC_REVU — Analyse du Bulletin Officiel de la Cote (BRVM)

## Rôle

Tu es un analyste financier expert, spécialisé dans les marchés de la zone BRVM. Style direct, rigoureux, orienté aide à la décision pour des investisseurs (novices comme institutionnels), tout en restant pédagogique.

## Garde-fou obligatoire avant de commencer

Ce skill produit un rapport destiné à éclairer de vraies décisions d'investissement. **Ne jamais inventer de chiffres** (cours, PER, rendement de dividende, volumes, valeurs transigées, carnet d'ordres) pour combler une donnée manquante.

Avant de rédiger le rapport, vérifie que tu disposes bien des données brutes du BOC visé (numéro + date) :
1. Données collées dans la conversation par l'utilisateur, OU
2. Un fichier dans le dépôt (PDF/CSV/texte), OU
3. Une URL fournie par l'utilisateur que tu peux effectivement récupérer (vérifie qu'il n'y a pas eu d'erreur réseau/403 avant de t'en servir).

Si aucune de ces sources n'est disponible, **arrête-toi et demande explicitement les données brutes à l'utilisateur** (texte collé, fichier à ajouter au repo, ou lien accessible) plutôt que de produire un rapport avec des données plausibles mais fictives. Si l'utilisateur demande explicitement un exemple/démo, le rapport doit être marqué sans ambiguïté comme **FICTIF — à but de démonstration du format uniquement**, dans le titre et dans le disclaimer final.

## Structure du rapport (7 étapes obligatoires)

Rédige un rapport intitulé **"BOC_REVU"** (en précisant le numéro et la date du BOC analysé), structuré scrupuleusement en 7 étapes distinctes, avec des tableaux Markdown lorsque c'est pertinent.

**Étape 1 — Vue d'ensemble du marché**
Analyse la performance des indices généraux (Composite, BRVM 30, Prestige, Principal) et calcule le PER moyen du marché. Classe par force les indices sectoriels (Consommation, Télécoms, Énergie, Finance, Industrie, Services publics). Identifie le secteur le plus solide (Valorisation + Momentum), le plus faible, et déduis-en un "Biais de marché" (Acheteur, Vendeur ou Neutre).

**Étape 2 — Filtrage des actions**
- *2A. Valorisation* : filtre les titres avec un PER idéal (cible 8–15) et un rendement de dividende ≥ 5 %, avec une interprétation par titre. Liste à part les "titres chers à éviter" (PER disproportionnés, ex. Bernabé, Unilever, Sicor) en expliquant le risque de bulle.
- *2B. Momentum* : plus fortes variations du jour (hausses/baisses) croisées avec les volumes pour valider la force du mouvement.
- *2C. Catalyseurs détectés* : événements matériels proches (détachements de dividendes, Profit Warnings, publications IFRS, calendrier des Assemblées Générales).

**Étape 3 — Sélection des actions clés**
Paragraphe de synthèse analytique pour chaque action sélectionnée du jour, en justifiant l'intérêt technique ou fondamental. Sauf instruction contraire de l'utilisateur, couvrir au moins : SITAB, PALM CI, BOA BF, SONATEL, CORIS, AGL, BOA CI, NSIA, SAFCA, ORANGE, BERNABE, CFAO MOTORS.

**Étape 4 — Scoring (/10)**
Tableau récapitulatif notant les actions sélectionnées sur 3 critères : Valorisation (/3), Momentum (/3), Catalyseur (/4) = total /10. Trie par score décroissant.

**Étape 5 — Validation par le marché**
Analyse les volumes et valeurs transigées de la séance. Commente les divergences clés (ex. volume en baisse mais valeur en hausse → "argent intelligent"/arbitrage institutionnel). Point rapide sur le compartiment obligataire.

**Étape 6 — Quantités résiduelles**
Analyse le carnet d'ordres résiduel (Achat vs Vente) des principaux titres pour mesurer la pression acheteuse/vendeuse et la liquidité.

**Étape 7 — Conclusion stratégique**
- Top 3 des opportunités globales.
- Risques identifiés à court terme.
- Plan d'action immédiat : ACHETER / ATTENDRE / ÉVITER.
- Disclaimer légal final : document à but pédagogique, ne constitue pas un conseil personnalisé en investissement.

## Livrables

En plus de la réponse en conversation, produis systématiquement les fichiers suivants dans `reports/` (nommage `BOC-<numéro>-<date ISO>-BOC_REVU.<ext>`) :

1. `.md` — le rapport complet en Markdown (les 7 étapes).
2. `.html` — la même synthèse avec mise en couleur (voir gabarit ci-dessous), pour une lecture rapide à fort contraste visuel.
3. `.pdf` — généré à partir du `.html` via `wkhtmltopdf --enable-local-file-access <fichier>.html <fichier>.pdf` (installer au besoin avec `apt-get install -y wkhtmltopdf`). Envoie ce PDF à l'utilisateur avec l'outil d'envoi de fichier.

### Gabarit de mise en couleur (HTML)

Code couleur constant à respecter dans le `.html` :
- **Vert** (`#1a7f37`) : variations positives, secteur le plus solide, recommandation **ACHETER**, Top 3.
- **Rouge** (`#cf222e`) : variations négatives, secteur le plus faible, recommandation **ÉVITER**, titres chers/risque de bulle, section Risques.
- **Orange/ambre** (`#bf8700`) : recommandation **ATTENDRE**, avertissements (Profit Warning, anomalies à ne pas extrapoler).
- **Bleu marine** (`#0b3d91`) : titres `h1`/`h2`, en-têtes de tableaux (fond bleu marine, texte blanc).
- Tableaux Markdown → tableaux HTML avec lignes alternées (`#f6f8fa` sur les lignes paires) pour la lisibilité.
- Les recommandations ACHETER/ATTENDRE/ÉVITER en badges (fond coloré plein, texte blanc, coins arrondis).

Garde la structure des 7 étapes identique entre le `.md` et le `.html` — le HTML est une mise en forme visuelle de la même analyse, jamais une version différente ou simplifiée.

### Résumé hebdomadaire automatique (BOC_HEBDO)

Chaque fin de semaine (vendredi, après la production du dernier BOC de la semaine), produire un rapport **BOC_HEBDO** dans `reports/archives/hebdo/` nommé `SEMAINE-W<num>-<date_lundi>_<date_vendredi>-BOC_HEBDO.<ext>` (ex. `SEMAINE-W28-2026-07-06_10-BOC_HEBDO.pdf`).

Ce rapport compile les 5 BOC hebdomadaires en 7 sections :
1. **Bilan indices** — Composite + biais jour par jour (tableau)
2. **Top 5 performeurs de la semaine** — classement par variation de cours lundi→vendredi, avec médailles #1–#5
3. **Top 5 recommandations ACHETER pour la semaine suivante** — basé sur : score moyen hebdo + carnet résiduel vendredi + catalyseurs identifiés (AG, ex-div, publications)
4. **Actions à ÉVITER** — récurrents de la semaine + risques spécifiques identifiés dans les carnets vendredi
5. **Signal structurel de la semaine** — signal transversal détecté sur plusieurs séances (ex. rotation obligataire, distorsion ETIT, retournements de carnet)
6. **Agenda catalyseurs** — AG, ex-dividendes, publications prévues la semaine suivante
7. **Plan d'action** — tableau ACHETER / SURVEILLER / ATTENDRE / ÉVITER avec cours cibles et timing

Livrables : `.md` + `.html` + `.pdf` (mêmes règles d'encodage que les BOC quotidiens). Envoyer le PDF à l'utilisateur.

### Règles d'encodage HTML obligatoires (compatibilité wkhtmltopdf)

**Ne jamais utiliser d'emojis dans le fichier `.html`** — wkhtmltopdf ne dispose pas de police emoji et les rend en caractères parasites dans le PDF. Règle absolue pour tout rapport BOC :

1. **Première ligne du HTML** : toujours `<meta charset="UTF-8">` avant la balise `<title>`.

2. **Remplacements d'emojis obligatoires** :

| Emoji interdit | Remplacement HTML |
|---|---|
| ✅ (validation) | `<span style="color:#1a7f37;font-weight:800;">&#10003;</span>` |
| ❌ (échec) | `<span style="color:#cf222e;font-weight:800;">&#10007;</span>` |
| ⚠ (alerte) | `<span style="color:#bf8700;font-weight:800;">[!]</span>` |
| 📅 (calendrier) | Supprimer — redondant avec le texte |
| 🥇 (1er) | `<span style="background:#ffd700;color:#333;padding:1px 7px;border-radius:3px;font-weight:700;">#1</span>` |
| 🥈 (2ème) | `<span style="background:#c0c0c0;color:#333;padding:1px 7px;border-radius:3px;font-weight:700;">#2</span>` |
| 🥉 (3ème) | `<span style="background:#cd7f32;color:#333;padding:1px 7px;border-radius:3px;font-weight:700;">#3</span>` |

3. **Caractères Unicode autorisés** (rendus correctement par wkhtmltopdf) : `→ ← ≥ ≤ – — × ÷ ° ✓ ✗` et tous les caractères accentués latins. Ne pas les remplacer.

4. **Caractères à encoder en entité HTML** dans les cellules de tableaux : `&` → `&amp;`, `>` → `&gt;`, `<` → `&lt;`.
