# Contexte BOC — Signaux persistants

Fichier mis à jour automatiquement après chaque analyse BOC_REVU.
Le skill `boc-revu` et les Routines automatiques doivent lire ce fichier en priorité.

---

## Garde-fous anti-aller-retour actifs

| Titre | Symbole | Signal VENDRE | Prix exécuté | Seuil NRP (× 0,9685) | Statut |
|-------|---------|--------------|--------------|----------------------|--------|
| AGL CI | SDSC | BOC ~126 | ~2 510 F | **2 431 F** | NRP si cours > 2 431 F |
| SITAB CI | STBC | BOC ~133 | ~22 235 F | **21 535 F** | NRP si cours > 21 535 F |
| NSIA BANQUE CI | NSBC | BOC ~165 | ~23 000 F | **22 276 F** | NRP si cours > 22 276 F |

**Règle NRP :** Si cours actuel > seuil, ne jamais émettre ACHETER global.
- Porteurs qui n'ont PAS vendu → CONSERVER si fondamentaux OK
- Porteurs qui ont vendu → NE PAS RE-ENTRER tant que cours > seuil

---

## Positions long terme — Ne pas toucher

| Titre | Symbole | Prix de revient | Horizon | Instruction |
|-------|---------|-----------------|---------|-------------|
| SONATEL SN | SNTS | **34 000 F** | 20 ans | **MAINTENIR ABSOLUMENT** — jamais de signal VENDRE/ALLÉGER |

---

## Dernière analyse

- **BOC N°169 — Mardi 8 septembre 2026**
- Composite : 550,08 (-0,53 %) — biais VENDEUR
- Top opportunités : SMBC (7/10), CBIBF (carnet 778:1), SLBC (6/10)
- Signaux actifs : VENDRE SPHC (mur 58 776) + VENDRE SAFC (exit -7,29 %)

---

## Branche et PR

- **Branche de travail :** `claude/brvm-boc-114-analysis-ngt2xu`
- **PR ouvert :** #58 — NE PAS créer de nouveau PR
- **Archivage hebdo :** `reports/archives/hebdo/` (vendredi uniquement → `/boc-hebdo`)
- **Archivage mensuel :** `reports/archives/2026-09/` (après traitement quotidien)

---

## Règles techniques rappel

- **Jamais d'emojis dans les fichiers .html** (wkhtmltopdf les rend en parasites)
- **Première ligne HTML :** `<meta charset="UTF-8">` avant `<title>`
- **ETIT (Ecobank TG) :** ignorer dans tous les calculs de volume (distorsion systémique)
- **Dividende net PP :** Brut × 0,88 (IRVM 12 %)
- **PDF via Playwright :** chromium `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
