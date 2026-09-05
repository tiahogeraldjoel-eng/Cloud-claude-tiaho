---
name: boc-hebdo
description: Automatically invoked by boc-revu after every Friday BOC. Also triggers on /boc-hebdo or when the user asks for a weekly BRVM summary. Compiles all 5 daily BOC_REVU reports of the week into a single synthesis covering: top 5 weekly performers, top 5 BUY recommendations, top 5 SELL/REDUCE recommendations, stocks to AVOID, structural signals, catalyst agenda, and an action plan. Never fabricates data — reads the 5 BOC_REVU .md files before writing.
---

# BOC_HEBDO — Synthèse Hebdomadaire BRVM

## Rôle

Tu es un analyste financier expert BRVM. Ce skill produit la synthèse hebdomadaire du marché à partir des 5 rapports BOC_REVU quotidiens de la semaine. Style synthétique, orienté décision, avec une hiérarchisation claire des opportunités (ACHETER), des positions à alléger ou solder (ALLÉGER / VENDRE) et des risques à éviter pour la semaine suivante.

## Déclenchement

- **Automatique** : invoqué par le skill `boc-revu` dès qu'un BOC de vendredi est traité.
- **Manuel** : `/boc-hebdo` ou demande explicite de synthèse hebdomadaire.

## Garde-fous obligatoires

1. **Ne jamais inventer de chiffres.** Toutes les données (cours, variations, carnets, scores, volumes) doivent provenir des fichiers `.md` des BOC de la semaine, situés dans `reports/archives/2026-MM/` ou `reports/`.
2. **Lire les 5 fichiers avant de rédiger.** Utiliser `Read` ou `Bash grep` pour extraire les données brutes de chaque BOC hebdomadaire avant de calculer les performances et les scores moyens.
3. **Semaine incomplète :** si moins de 5 BOC sont disponibles (jours fériés, clôture anticipée), préciser le nombre de séances analysées et adapter le titre (`W<num> — X séances`).

## Source des données

Les fichiers BOC quotidiens se trouvent dans :
- `reports/archives/2026-MM/BOC-<num>-<date>-BOC_REVU.md` (archivés)
- `reports/BOC-<num>-<date>-BOC_REVU.md` (semaine en cours, avant archivage)

Pour identifier les 5 BOC de la semaine :
```bash
ls reports/archives/2026-07/ | grep "BOC_REVU.md" | tail -5
# ou pour la semaine en cours :
ls reports/*.md
```

Extraire pour chaque BOC :
- Niveau Composite + variation
- Bilan H/B (hausses/baisses) + biais
- Tableau Étape 4 (scores /10 + recommandations)
- Carnet résiduel vendredi (Étape 6 du dernier BOC)
- Conclusion stratégique (Étape 7 : Top 3 + ACHETER/ÉVITER)

## Calculs à effectuer

**Performance hebdomadaire d'un titre :**
`Perf = (cours_vendredi - cours_lundi) / cours_lundi × 100`

Utiliser le cours du lundi (BOC du lundi, Étape 4) et le cours du vendredi (BOC du vendredi, Étape 4).

**Score moyen hebdomadaire d'un titre :**
`Score_moy = Somme des scores /10 sur les séances où le titre apparaît / Nombre de séances`

**Classement Top 5 performeurs :** trier par `Perf` décroissant, en excluant les titres à PER > 50 (bulles) et les microcaps sans liquidité.

**Classement Top 5 ACHETER semaine suivante :** croiser 3 critères :
1. Score moyen hebdo élevé (> 6/10)
2. Carnet résiduel vendredi favorable (côté acheteur ou mur vendeur en absorption)
3. Catalyseur identifié la semaine suivante (AG, ex-div, publication)

**Classement Top 5 VENDRE / ALLÉGER semaine suivante :** croiser 3 critères :
1. Titre présent en recommandation ÉVITER ou VENDRE sur ≥ 3 séances de la semaine
2. Carnet vendeur dominant vendredi (ratio vendeur > 3:1 ou mur > 3 000 titres non résolu)
3. Au moins un déclencheur parmi : catalyseur épuisé, ex-div imminent, Profit Warning, PER en dérive, retournement de carnet persistant
- Distinguer **VENDRE** (porteurs = sortie totale) vs **ALLÉGER** (réduire la position, conserver le solde)
- Exclure les bulles permanentes (UNLC, BNBC) déjà dans ÉVITER — ne pas les compter deux fois

## Structure du rapport BOC_HEBDO (8 sections obligatoires)

### Section 1 — Bilan indices de la semaine
Tableau : Séance | BOC N° | Composite | Var. jour | Biais (H/B)
Calculer la performance hebdomadaire du Composite (lundi → vendredi).
Commenter la divergence éventuelle entre indices et breadth (si indices haussiers mais majorité de titres en baisse).

### Section 2 — Top 5 actions les plus performantes
Tableau avec médailles #1 à #5 : Titre | Symbole | Cours lundi | Cours vendredi | Perf. hebdo | Commentaire
- Inclure une note sur les performances concentrées sur 1 seule séance (distinguer momentum durable vs. spike ponctuel).
- Mentionner STBC séparément si son score moyen est le plus élevé malgré un cours stable/baissier (cas de valeur vs. prix).

### Section 3 — Top 5 recommandations ACHETER (semaine suivante)
Pour chaque titre (#1 à #5) : bloc détaillé avec score moyen, PER, Rdt, signal carnet vendredi, catalyseur, cours cible d'entrée.
Classer par ordre de conviction décroissante.

### Section 4 — Top 5 recommandations VENDRE / ALLÉGER (semaine suivante)
Pour les porteurs de ces titres uniquement. Tableau : Titre | Symbole | Action | Cours vendredi | Justification | Risque si on reste.
- **VENDRE** (badge rouge foncé `#8b0000`) : sortie totale recommandée.
- **ALLÉGER** (badge orange brûlé `#e36209`) : réduire la position de 50 %, conserver le solde.
Inclure systématiquement : les titres à carnet vendeur persistant, les post-catalyseurs épuisés, et les ex-div imminents.
Ne pas dupliquer les bulles permanentes (UNLC, BNBC) déjà listées dans ÉVITER.

### Section 5 — Actions à ÉVITER (semaine suivante)
Tableau : Titre | Symbole | Raison | Risque chiffré
Inclure systématiquement :
- Les ex-dividendes de la semaine suivante (drop mécanique inévitable)
- Les titres à carnet vendeur massif non résolu (vendredi)
- Les bulles permanentes (PER > 200 : UNLC, BNBC, etc.)
- Les titres en phase post-catalyseur (après AG, ex-div, résultats déjà intégrés)

### Section 6 — Signal structurel de la semaine
Identifier le signal transversal le plus important détecté sur plusieurs séances :
- Rotation obligataire (achats répétés d'une même émission)
- Distorsion volumétrique ETIT (si > 60 % du volume brut plusieurs jours)
- Série de retournements de carnet sur un même titre
- Méga-transaction isolée vs. flux régulier
Quantifier le signal (montants, ratios, nombre de jours consécutifs).

### Section 7 — Agenda catalyseurs (semaine suivante)
Tableau : Date | Titre | Événement | Impact anticipé (badge ACHETER/ATTENDRE/ÉVITER)
Sources : détachements de dividendes, AG déjà annoncées dans les BOC de la semaine, publications IFRS signalées.

### Section 8 — Plan d'action
Tableau de bord synthétique : Action | Titre | Cours cible | Timing
Actions possibles : **ACHETER** / **ALLÉGER** / **VENDRE** / **SURVEILLER** / **ATTENDRE** / **ÉVITER**
Inclure une ligne par titre actionnable de la semaine suivante, triée par urgence décroissante.

## Livrables

Trois fichiers dans `reports/archives/hebdo/` :

**Nommage :** `SEMAINE-W<num_iso>-<date_lundi>_<date_vendredi>-BOC_HEBDO.<ext>`
Exemple : `SEMAINE-W29-2026-07-13_17-BOC_HEBDO.md`

1. `.md` — rapport complet en Markdown (8 sections, tableaux).
2. `.html` — mise en couleur (voir gabarit ci-dessous).
3. `.pdf` — généré via `cd reports/archives/hebdo && wkhtmltopdf --enable-local-file-access <fichier>.html <fichier>.pdf`.

Envoyer le PDF à l'utilisateur avec l'outil d'envoi de fichier.

## Gabarit HTML — Éléments spécifiques BOC_HEBDO

En plus du CSS standard (identique à BOC_REVU), ajouter :

```css
/* KPI row en haut du rapport */
.kpi-row { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
.kpi { background: #eef3fb; border: 1px solid #cdd9ea; border-radius: 6px;
       padding: 12px 18px; text-align: center; min-width: 120px; flex: 1; }
.kpi .val { font-size: 1.6em; font-weight: 800; color: #0b3d91; }
.kpi .val.pos { color: #1a7f37; }
.kpi .val.neg { color: #cf222e; }
.kpi .lbl { font-size: 11px; color: #57606a; text-transform: uppercase; letter-spacing: .04em; }

/* Blocs stock détaillés */
.stock-acheter { border-left: 4px solid #1a7f37; background: #f0faf3;
                 padding: 12px 16px; margin: 10px 0; border-radius: 0 4px 4px 0; }
.stock-eviter  { border-left: 4px solid #cf222e; background: #fdecea;
                 padding: 12px 16px; margin: 10px 0; border-radius: 0 4px 4px 0; }

/* Médailles */
.medal-gold   { background: #ffd700; color: #333; padding: 1px 8px; border-radius: 3px; font-weight: 700; }
.medal-silver { background: #c0c0c0; color: #333; padding: 1px 8px; border-radius: 3px; font-weight: 700; }
.medal-bronze { background: #cd7f32; color: #fff; padding: 1px 8px; border-radius: 3px; font-weight: 700; }
.medal-4, .medal-5 { background: #57606a; color: #fff; padding: 1px 8px; border-radius: 3px; font-weight: 700; }

/* Badges biais de séance */
.biais-hausse { background: #1a7f37; color: #fff; padding: 1px 9px; border-radius: 3px; font-size: 12px; font-weight: 700; display: inline-block; }
.biais-vente  { background: #cf222e; color: #fff; padding: 1px 9px; border-radius: 3px; font-size: 12px; font-weight: 700; display: inline-block; }
.biais-neutre { background: #57606a; color: #fff; padding: 1px 9px; border-radius: 3px; font-size: 12px; font-weight: 700; display: inline-block; }
.biais-mixte  { background: #bf8700; color: #fff; padding: 1px 9px; border-radius: 3px; font-size: 12px; font-weight: 700; display: inline-block; }

/* Badge SURVEILLER (bleu marine) */
.surveiller { background: #0b3d91; color: #fff; padding: 2px 10px; border-radius: 4px;
              font-weight: 700; font-size: 12px; display: inline-block; }

/* Badges VENDRE et ALLÉGER */
.vendre   { background: #8b0000; color: #fff; padding: 2px 10px; border-radius: 4px;
            font-weight: 700; font-size: 12px; display: inline-block; }
.alleger  { background: #e36209; color: #fff; padding: 2px 10px; border-radius: 4px;
            font-weight: 700; font-size: 12px; display: inline-block; }

/* Bloc stock VENDRE / ALLÉGER */
.stock-vendre  { border-left: 4px solid #8b0000; background: #fff0f0;
                 padding: 12px 16px; margin: 10px 0; border-radius: 0 4px 4px 0; }
.stock-alleger { border-left: 4px solid #e36209; background: #fff5ec;
                 padding: 12px 16px; margin: 10px 0; border-radius: 0 4px 4px 0; }

/* Signal structurel */
.signal-rot { background: #f0f4ff; border: 2px solid #0b3d91; border-radius: 6px; padding: 12px 16px; margin: 12px 0; }
```

**KPI row obligatoire en tête de rapport** (5 tuiles) :
- Composite semaine (variation lundi→vendredi)
- YTD clôture vendredi
- Niveau Composite vendredi
- Nombre de sessions positives / 5
- Taux de prédiction carnets de la semaine

## Règles d'encodage HTML (identiques à BOC_REVU)

- **Première ligne** : `<meta charset="UTF-8">` avant `<title>`
- **Aucun emoji** dans le HTML :

| Emoji interdit | Remplacement |
|---|---|
| ✅ | `<span style="color:#1a7f37;font-weight:800;">&#10003;</span>` |
| ❌ | `<span style="color:#cf222e;font-weight:800;">&#10007;</span>` |
| ⚠ | `<span style="color:#bf8700;font-weight:800;">[!]</span>` |
| 📅 | Supprimer |
| 🥇 🥈 🥉 | `.medal-gold #1` / `.medal-silver #2` / `.medal-bronze #3` |

- Entités HTML dans les cellules : `&` → `&amp;` | `>` → `&gt;` | `<` → `&lt;`
- Caractères autorisés sans remplacement : `→ ← ≥ ≤ – — × ° ✓ ✗` et accentués latins.

## Archivage et commit

Après génération des 3 fichiers :

```bash
git add reports/archives/hebdo/SEMAINE-W<num>-*
git commit -m "feat(boc-hebdo): synthèse hebdomadaire W<num> — <date_lundi> au <date_vendredi>"
git push -u origin <branche>
```
