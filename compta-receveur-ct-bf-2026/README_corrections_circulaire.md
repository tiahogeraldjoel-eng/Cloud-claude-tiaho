# Corrections Base Access - Circulaire N° 2026000631

**Référence :** Circulaire MEF/SG/DGTCP/DELF n° 2026000631  
**Objet :** Concordance comptes administratifs et comptes de gestion  
**Application :** Comptabilité du Receveur Municipal - CT-BF 2026

---

## Fichiers produits

| Fichier | Description |
|---|---|
| `recreate_compta_access_v2.sql` | Script de recréation complet avec corrections intégrées |
| `patch_compte_122_circulaire_2026000631.sql` | Patch SQL à appliquer sur une base existante |
| `plan_comptable_full.csv` | Plan comptable UEMOA/CT-BF (~1006 comptes) |
| `README_structure.md` | Documentation de l'architecture des 88 tables |

---

## Correction principale : Compte 122 "Résultat de fonctionnement affecté"

### Problème identifié dans la version initiale

Le compte 122 était déclaré avec `Passif=0`, `Etat_Passif=0` et `Bal_Entree=0`,
ce qui l'excluait :
- du bilan Passif (invisible dans l'état CG Passif)
- de la balance d'entrée (le solde reporté de N-1 ne pouvait pas être saisi)
- des opérations d'ordre budgétaires (non accessible en saisie)

### Corrections apportées (table par table)

#### 1. `Plan_Comptable` — Compte 122

| Champ | Avant | Après | Motif |
|---|---|---|---|
| `Passif` | 0 | **1** | Compte de passif (ressources propres) |
| `Etat_Passif` | 0 | **1** | Visible dans le bilan Passif du CG |
| `Bal_Entree` | 0 | **1** | Solde reporté de l'exercice N-1 |

Les champs `Recette_Budgetaire=1` et `Depense_Budgetaire=1` étaient déjà corrects
(le 122 fonctionne en recette investissement ET en dépense fonctionnement via les
opérations d'ordre).

#### 2. `CG_Passif` — Structure bilan

Insertion du compte 122 sous la rubrique **REPORT À NOUVEAU (classe 12)**,
après le compte 121 "Résultat ordinaire reporté".

#### 3. `Gest_CpteTiers` — Droits d'opérations

| Flag | Valeur | Signification |
|---|---|---|
| `AutreEncCredit` | True | **Crédit du 122** : constatation affectation résultat |
| `AutreDecDebit` | True | **Débit du 122** : virement vers section investissement |

#### 4. `Operation` — Nouvelle opération N°20

> *Affectation résultat de fonctionnement (compte 122)*

#### 5. `TypeOperation` — Nouveau type N°18

> *Affectation résultat de fonctionnement au compte 122*

#### 6. `Pec_Recettes` / `Pec_Recettes2` — Matrices PEC

Ligne ajoutée pour `Cpte_Pec = '122'` avec `CpeTiers = True` :
le compte 122 est accessible comme destination dans la prise en charge
des recettes d'investissement (opérations d'ordre budgétaires).

#### 7. `CG_Fonctionnement` — Dépense d'ordre

Insertion du chapitre `042` / paragraphe `122` : "Virement à la section
d'investissement" (contrepartie de la recette d'investissement).

#### 8. `Tble_Saisie` — Modèles d'écritures

| N° | Débit | Crédit | Objet |
|---|---|---|---|
| Phase 1 | **121** | **122** | Solde du résultat ordinaire reporté vers résultat affecté (D/121 → C/122) |
| Phase 2 | **122** | 111 | Virement résultat affecté → ressources investissement |

---

## Schéma des écritures comptables du compte 122

```
PHASE 1 – Affectation du résultat ordinaire reporté (Circulaire 2026000631)
════════════════════════════════════════════════════════════════════════════
  Débit  121  "Résultat ordinaire reporté"           XXXXX F CFA
  Crédit 122  "Résultat de fonctionnement affecté"   XXXXX F CFA
  Journal : JOD
  Type : Affectation résultat de fonctionnement (Id=18)
  Opération : Affectation résultat compte 122 (N°=20)
  → Le 121 est soldé (débité) ; le 122 reçoit l'affectation (crédité)

PHASE 2 – Virement vers section d'investissement
═════════════════════════════════════════════════
  Débit  122  "Résultat de fonctionnement affecté"   XXXXX F CFA
  Crédit 111  "Excédent de fonctionnement capitalisé" XXXXX F CFA
    (ou 10x selon nature de l'affectation budgétaire)
  Journal : JOD
  Type : Opération d'ordre budgétaire
```

## Concordance Compte Administratif ↔ Compte de Gestion

| Document | Enregistrement |
|---|---|
| **Compte administratif** (Ordonnateur) | Recette section Investissement au compte 122 |
| **Compte de gestion** (Receveur) | Phase 1 : **D/121 → C/122** puis Phase 2 : D/122 → C/111 |

Cette concordance est requise par la circulaire n° 2026000631 pour assurer
l'équilibre entre les états produits par l'ordonnateur et ceux du receveur.

---

## Application du patch sur base existante

Pour appliquer les corrections sur une base Access existante, ouvrir
l'éditeur de requêtes Access et exécuter les instructions du fichier
`patch_compte_122_circulaire_2026000631.sql` section par section.

**Ordre d'exécution recommandé :**
1. Section 1 (UPDATE Plan_Comptable)
2. Section 2 (INSERT CG_Passif)
3. Section 3 (INSERT Operation)
4. Section 4 (INSERT TypeOperation)
5. Section 5 (INSERT Gest_CpteTiers)
6. Section 6 (INSERT Pec_Recettes / Pec_Recettes2)
7. Section 7 (INSERT Tble_Saisie)
8. Section 8 (INSERT VerifBudget)
9. Section 9 (INSERT CG_Fonctionnement)
