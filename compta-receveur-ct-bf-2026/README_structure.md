# Structure de la base Access : Compta_Receveur_CT-BF_2026_NV.accdb

## Vue d'ensemble
- **Type** : Microsoft Access Database (.accdb)
- **Taille** : ~39 Mo
- **Nombre de tables** : 88 tables
- **Exercice** : 2026
- **Contexte** : Comptabilité du Receveur Municipal - Collectivités Territoriales Burkina Faso

## Fichiers extraits

| Fichier | Contenu |
|---|---|
| `recreate_compta_access.sql` | Script SQL complet de recréation (DDL + INSERT données de référence) |
| `plan_comptable_full.csv` | Les ~1006 comptes du Plan Comptable UEMOA/CT-BF |

## Architecture des tables (88 tables en 19 groupes)

### 1. Configuration générale (2 tables)
- **Collectivites** : Identité de la collectivité (nom, exercice, ordonnateur, receveur, région...)
- **ListeCollectivites** : Référentiel des collectivités du réseau

### 2. Nomenclatures de référence (7 tables)
- **MoisEcriture** : 13 périodes (Janvier→Décembre + Décembre JC)
- **Journaux** : JDT, JMDT, JOD, JOD2, JR
- **TypeOperation** : 17 types (PEC, paiement courant/antérieur, encaissement, annulation...)
- **Operation** : 19 types d'opérations comptables
- **SectionBudget** : Fonctionnement / Investissement / NonApplicable
- **OrigineRecettes** : Recettes Propres / Recettes Externes / NonApplicable
- **TypePrevision** : BP / BS / DM avant BS / DM après BS

### 3. Plan Comptable (1 table, ~1006 comptes)
- **Plan_Comptable** : Plan comptable UEMOA adapté CT-BF avec flags booléens (passif, actif, recette budgétaire, dépense budgétaire, acteur Trésor/Impôt/Autres, situation trésorerie, section budget, rang)

### 4. Structure CG - Compte Général (7 tables)
- CG_Actif, CG_Passif, CG_Fonctionnement, CG_Fonct_Synthese
- Z_Nature (7 niveaux de présentation du CG)
- Valeur_CG, Valeur_CG_AD, Valeur_CG_FR, Valeur_CG_PD, Valeur_CG_FD (calculs CG par sous-ensemble)

### 5. Budget / Prévisions (7 tables)
- BudgetPrimitif, BudgetSupplementaire, BudgetSupplementaire2
- DecisionModificative (avec référence décision et budget à modifier)
- Z_Syn_Budget, Z_Syn_Budget2 (synthèse BP/BR1/BR2/DM)
- VerifBudget, DetailsCompte

### 6. Écritures comptables - cœur du système (4 tables)
- **Ecritures** : Journal comptable principal (Num_Ecriture, date, collectivité, mois, opération, bordereau, mandat, titre, imputation, montant, type opération)
- **Mvts_Consolides** : Mouvements consolidés par compte (entrée/gestion débit/crédit, prévisions)
- **Lignes_Consolides** : Détail des lignes par écriture
- **BordDetailMdts** : Détail des mandats par bordereau

### 7. Balance et ouverture (3 tables)
- BalanceEntree, BalanceTransition, Tble_SoldeCloture

### 8. Gestion comptes tiers (3 tables)
- **Gest_CpteTiers** : Matrice booléenne des droits par compte tiers (RAR, RAP, CIP, GAR, PEN, AVA...)
- DetailsCptedispo, PrecisionCpte

### 9. Prises en charge PEC - matrices (5 tables)
- Pec_Depenses, Pec_Recettes, Pec_Recettes2
- Pec_Dep1, Pec_Dep2 (matrices booléennes ~170 colonnes : pour chaque compte budgétaire, quels comptes de tiers peuvent être mouvementés)

### 10. Développement des comptes tiers (7 tables)
- DevelopTiersRec (recettes - RAR), DevelopTiersDep (dépenses - RAP)
- DevelopTiersAva (avances), DevelopTiersCIP, DevelopTiersGar, DevelopTiersPen
- DevelopTrans, DevelopTrans2

### 11. Restes à recouvrer/payer (4 tables)
- Z_RARGlobal, Z_RAPGlobal, ReverveCptetiers, ReverveCptetiers2

### 12. Titres de recettes (6 tables)
- TitreRecettes, TitreRecAnnuel, TitreRecMensuels
- TitreRecMensuelsNouv, TitreRecMensuelsNouv2
- MultiCpteRecette, Z_RecAnticipe, TendancesRec

### 13. Financement comptes spéciaux (4 tables)
- Fin4620 (compte 4620 - cautionnements)
- FinAVA (avances), FinCIP (cautionnements/impôts/pénalités)
- tVerif_Fin4620

### 14. Paiements et reversements (5 tables)
- ModePaiement, PaieApresReverve, PaieApresReverve2
- Table_reverse, SourceRessource, SautMdtListe

### 15. Rapprochement / Trésorerie (6 tables)
- Tresorerie, Tble_Rapprochement, Tble_Rapprochement2
- Tble_PourEtatRapproche, Tble_ConfrontationSolde, Tble_GestSolde

### 16. Arrêté et clôture (5 tables)
- Tble_Arret_Mois, Tble_ChoixMethodeRec, Tble_Date
- Pour_Arret_PasCompta, Pour_Arret_PasTresor

### 17. Saisie (2 tables transitoires)
- Tble_Saisie, Tble_SaisieRecette

### 18. Import externe (1 table)
- Atco_Import (interface avec logiciel ATCO des dépenses)

### 19. Interface ruban Access (1 table système)
- USysRibbons : 2 rubans personnalisés
  - *ComptaRuban* : Masque l'interface standard Access
  - *CpteRub* : Ruban contextuel états (Imprimer / PDF / Fermer / Aide)

## Flux comptable principal

```
Budget (BP/BS/DM) → Ecritures → Mvts_Consolides → Valeur_CG → États
    ↓                   ↓
Pec_Depenses/        DevelopTiers (RAR/RAP/CIP/GAR/PEN/AVA)
Pec_Recettes             ↓
                    Tresorerie → Rapprochement
```

## Nomenclature des journaux
| Code | Signification |
|---|---|
| JDT | Journal de Dépenses sur Titres |
| JMDT | Journal Mandats de Dépenses Titres |
| JOD | Journal des Opérations Diverses |
| JOD2 | Journal des Opérations Diverses 2 |
| JR | Journal de Recettes |
