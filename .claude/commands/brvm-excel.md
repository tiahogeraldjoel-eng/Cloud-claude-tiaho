# Compétence : Générateur Excel BRVM

Gère le fichier `brvm-analyzer/build_excel.py` qui génère un fichier Excel d'analyse boursière BRVM multi-onglets.

## Architecture du fichier Excel généré

4 onglets :
- **ETUDE** — Fiche d'analyse complète (prix, ratios, croissance, valorisation, dividendes, contrarian)
- **SYNTHESE** — Tableau de bord scorecard récapitulatif
- **PROFIL** — Données d'entrée : identification société + données fondamentales (capital, liquidité, notation)
- **FORMULE** — Référence des formules et glossaire

## Cellules clés (références absolues)

| Constante       | Cellule | Contenu                    |
|-----------------|---------|----------------------------|
| PRIX_CELL       | B24     | Prix de l'action (FCFA)    |
| BNPA_CELL       | B25     | BNPA                       |
| CPTX_CELL       | B26     | Cours/Actif net            |
| VALO_CELL       | B27     | Valeur comptable           |
| NBTI_CELL       | B28     | Nombre de titres           |
| PER_CELL        | B30     | PER calculé                |
| VMC_CELL        | B31     | Valeur de marché capitalisée|

## Données PROFIL (onglet PROFIL)

| Ligne | Cellule | Contenu                     |
|-------|---------|-----------------------------|
| 3     | B3      | Nom complet de la société   |
| 4     | B4      | Ticker BRVM                 |
| 5     | B5      | Secteur d'activité          |
| 6     | B6      | Date de l'étude (format @)  |
| 16    | B16     | Capital social              |
| 17    | B17     | Nombre de titres            |
| 18    | B18     | Flottant %                  |
| 19    | B19     | Actionnaires principaux     |
| 22-25 | B22:B25 | Données liquidité           |
| 28-31 | B28:B31 | Données notation            |

## Règles techniques importantes

### Format date (B6 PROFIL)
- B6 est formaté avec `num_format='@'` (texte) pour éviter l'affichage en numéro série
- Les formules qui lisent B6 doivent utiliser le pattern :
  ```
  IF(ISNUMBER(PROFIL!B6),TEXT(PROFIL!B6,"dd/mm/yyyy"),PROFIL!B6)
  ```
- Ne jamais utiliser `IFERROR(TEXT(...))` — IFERROR masque silencieusement les erreurs TEXT()

### Cellules fusionnées (PROFIL)
- Fusionner uniquement B:C (`merge_range(r, 1, r, 2)`)
- L'indice hint va en colonne D (hors fusion)
- Ne jamais écrire dans une cellule à l'intérieur d'une plage fusionnée

### Protection
- `fmt()` par défaut : `locked=False`
- Seuls les formats `F_CALC*` ont `locked=True` (cellules à formules)
- Mot de passe de protection : variable `PROTECT_PWD`

### Formules cross-onglets
- ETUDE lit PROFIL : `=PROFIL!B3`, `=PROFIL!B17`, etc.
- SYNTHESE lit ETUDE : `=ETUDE!B24`, `=ETUDE!G8`, etc.
- Toujours utiliser `IF(PROFIL!B3="", fallback, expression)` sans IFERROR

### Génération
```bash
cd /home/user/Cloud-claude-tiaho/brvm-analyzer
python build_excel.py
```
Génère : `etudes_actions_v2_XX.xlsx` (numéro auto-incrémenté)

## Tâches courantes

### Ajouter un nouveau champ dans PROFIL
1. Ajouter dans la liste `key_fields` (section PROFIL dans `build_excel.py`)
2. Mettre à jour la constante de ligne correspondante
3. Ajouter le lien vers ETUDE/SYNTHESE si nécessaire

### Modifier une formule de calcul dans ETUDE
1. Identifier la section (A1-A6, B1-B4, C1-C5, D1-D3)
2. Utiliser le format `F_CALC`, `F_CALC_N`, `F_CALC_PCT`, etc. selon le type
3. Tester avec `python build_excel.py` et vérifier le XML si nécessaire

### Déboguer une formule qui ne s'affiche pas
```bash
cd /home/user/Cloud-claude-tiaho/brvm-analyzer
python build_excel.py
cd /tmp && mkdir -p xl_debug && cp etudes_actions_v2_XX.xlsx xl_debug/ && cd xl_debug
unzip -o etudes_actions_v2_XX.xlsx -d extracted/
grep -n "FORMULE_A_CHERCHER" extracted/xl/worksheets/sheet1.xml
```

### Audit de fiabilité
Vérifier :
1. Toutes les `merge_range` : colonne fin = colonne début + 1 (fusion B:C seulement)
2. Toutes les formules PROFIL!B6 : pattern ISNUMBER/TEXT présent
3. Pas de IFERROR wrappant TEXT()
4. Formats `F_CALC*` avec `locked=True`, tous les autres `locked=False`
5. `calcPr fullCalcOnLoad="1"` présent dans workbook.xml

## Historique des corrections majeures

- **Fusion B:D → B:C** : la fusion sur 3 colonnes (B:D) rendait B3 illisible depuis ETUDE
- **IFERROR → IF** : IFERROR masquait les erreurs TEXT() — remplacé par IF(B3="",fallback,concat)
- **Date en numéro série** : B6 formaté `@` + pattern ISNUMBER/TEXT dans toutes les formules qui le lisent
- **Police 9→11** : taille de police globale mise à jour dans `fmt()`
