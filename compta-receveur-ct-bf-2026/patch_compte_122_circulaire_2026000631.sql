-- =============================================================================
-- PATCH SQL - CORRECTIONS CIRCULAIRE N° 2026000631
-- MEF/SG/DGTCP/DELF - Concordance comptes administratifs et comptes de gestion
-- Objet : Insertion et activation complète du compte 122
--         "Résultat de fonctionnement affecté" dans les opérations comptables
-- Base   : Compta_Receveur_CT-BF_2026_NV.accdb
-- Date   : 2026
-- =============================================================================

-- =============================================================================
-- SECTION 1 : CORRECTION DU PLAN COMPTABLE (table Plan_Comptable)
-- =============================================================================
-- Problème initial : le compte 122 avait Passif=0 et Bal_Entree=0,
-- ce qui l'excluait de la balance d'entrée et du bilan passif.
-- Conformément à la circulaire, le 122 est un compte de Passif (ressources),
-- il doit figurer en Balance d'Entrée ET fonctionner en débit et en crédit
-- dans les opérations d'ordre budgétaires.

UPDATE [Plan_Comptable]
SET
    [Passif]      = True,     -- compte de passif (ressources propres)
    [Etat_Passif] = True,     -- visible dans l'état du bilan Passif
    [Bal_Entree]  = True      -- figure en balance d'entrée (solde reporté N-1)
WHERE [Compte] = '122';

-- =============================================================================
-- SECTION 2 : INTÉGRATION DANS LA STRUCTURE DU COMPTE GÉNÉRAL PASSIF (CG_Passif)
-- =============================================================================
-- Le compte 122 doit apparaître dans le CG Passif sous la rubrique
-- "REPORT À NOUVEAU" (classe 12), après le compte 121.

-- Vérifier d'abord que le compte 122 n'est pas déjà dans CG_Passif,
-- puis l'insérer à la bonne position (entre 121 et 123).
-- N° = position dans le tableau CG Passif (adapter selon numérotation existante)

INSERT INTO [CG_Passif] ([N°],[Titre],[Cpte_SousTitre],[Sous_Titre],[Cpte_Passif],[Classification],[Classification2])
SELECT
    (SELECT MAX([N°]) FROM [CG_Passif] WHERE [Cpte_Passif] = '121') + 1,
    'REPORT À NOUVEAU',
    '12',
    'Report à nouveau',
    '122',
    'Passif',
    'Ressources Propres'
WHERE NOT EXISTS (SELECT 1 FROM [CG_Passif] WHERE [Cpte_Passif] = '122');

-- =============================================================================
-- SECTION 3 : OPÉRATION D'ORDRE BUDGÉTAIRE - AFFECTATION DU RÉSULTAT (Operation)
-- =============================================================================
-- Ajout de l'opération "Affectation résultat fonctionnement" dans la table Operation.
-- Cette opération génère deux écritures comptables complémentaires :
--   PHASE 1 (Constatation) : Débit 131 / Crédit 122
--   PHASE 2 (Virement)     : Débit 122 / Crédit compte de ressources (ex. 111, 10x)

INSERT INTO [Operation] ([Num_Operation],[Type_Operation])
SELECT 20, 'Affectation résultat de fonctionnement (compte 122)'
WHERE NOT EXISTS (
    SELECT 1 FROM [Operation] WHERE [Num_Operation] = 20
);

-- =============================================================================
-- SECTION 4 : TYPE D'OPÉRATION (TypeOperation)
-- =============================================================================
-- Ajout du type d'opération spécifique pour l'affectation du résultat.
-- Ce type est classé parmi les opérations d'ordre budgétaires.

INSERT INTO [TypeOperation] ([Id_TypeOperation],[Type_Operation])
SELECT 18, 'Affectation résultat de fonctionnement au compte 122'
WHERE NOT EXISTS (
    SELECT 1 FROM [TypeOperation] WHERE [Id_TypeOperation] = 18
);

-- =============================================================================
-- SECTION 5 : CONFIGURATION COMPTE TIERS - Gest_CpteTiers
-- =============================================================================
-- Le compte 122 n'est pas un compte tiers au sens strict, mais doit être
-- accessible en débit ET en crédit dans les opérations d'ordre.
-- On active les flags AutreEncCredit (pour la phase crédit = constatation)
-- et AutreDecDebit (pour la phase débit = virement vers ressources).

INSERT INTO [Gest_CpteTiers]
    ([N°],[CpteTiers],
     [AutreEncDebit],[AutreEncCredit],
     [AutreDecDebit],[AutreDecCredit],
     [RAR_Develop],[RAP_Develop],[RAP_Tresorerie],
     [CIP_Develop],[GAR_Develop],[PEN_Develop],[AVA_Develop],
     [EncTitreAnteCredit],[PaiePrecAnte],[CpteFinPaiePrec],[CpteFinEncPrec])
SELECT
    (SELECT COALESCE(MAX([N°]),0) FROM [Gest_CpteTiers]) + 1,
    '122',
    False,  -- AutreEncDebit    : pas d'encaissement débit direct
    True,   -- AutreEncCredit   : CRÉDIT 122 = constatation affectation résultat
    True,   -- AutreDecDebit    : DÉBIT 122  = virement vers ressources investissement
    False,  -- AutreDecCredit   : pas de décaissement crédit direct
    False, False, False,    -- RAR, RAP, RAP_Tresorerie
    False, False, False, False,  -- CIP, GAR, PEN, AVA
    False, False, False, False   -- EncTitreAnte, PaiePrecAnte, CpteFinPaiePrec, CpteFinEncPrec
WHERE NOT EXISTS (SELECT 1 FROM [Gest_CpteTiers] WHERE [CpteTiers] = '122');

-- =============================================================================
-- SECTION 6 : MATRICES PEC RECETTES - Compte 122 en recette investissement
-- =============================================================================
-- Conformément à la circulaire, le compte 122 est une RECETTE de la section
-- Investissement dans le cadre du "virement de la section de fonctionnement
-- à la section d'investissement" (opération d'ordre budgétaire).
-- Il doit donc figurer dans Pec_Recettes comme compte pouvant être crédité
-- lors de la prise en charge d'une recette sur opération d'ordre.

-- Nota : Dans Pec_Recettes, la ligne correspond au compte budgétaire imputable
--        (compte de recette investissement) avec le flag CpeTiers = True.
-- On insère une ligne pour le compte 122 : CpeTiers=True pour permettre
-- la saisie d'une écriture créditant le 122.

INSERT INTO [Pec_Recettes]
    ([N°],[Cpte_Pec],[CpeTiers],
     [4010],[4020],[4110],[4120],[4130],[4140],[4150],[422],
     [4410],[4411],[4412],[442],
     [4492],[4493],[4494],[4495],[4496],
     [4510],[4511],[4512],[452],
     [4580],[4581],[4582],[4610],[4630],[4631],[4632],[4633])
SELECT
    (SELECT COALESCE(MAX([N°]),0) FROM [Pec_Recettes]) + 1,
    '122',
    True,   -- CpeTiers : le 122 est accessible comme compte tiers dans les PEC recettes
    False, False, False, False, False, False, False, False,
    False, False, False, False,
    False, False, False, False, False,
    False, False, False, False,
    False, False, False, False, False, False, False, False
WHERE NOT EXISTS (SELECT 1 FROM [Pec_Recettes] WHERE [Cpte_Pec] = '122');

-- Même chose pour Pec_Recettes2 (variante)
INSERT INTO [Pec_Recettes2]
    ([N°],[Cpte_Pec],[CpeTiers],
     [4010],[4020],[4110],[4120],[4130],[4140],[4150],[422],
     [4410],[4411],[4412],[442],
     [4492],[4493],[4494],[4495],[4496],
     [4510],[4511],[4512],[452],
     [4580],[4581],[4582],[4610],[4630],[4631],[4632],[4633])
SELECT
    (SELECT COALESCE(MAX([N°]),0) FROM [Pec_Recettes2]) + 1,
    '122',
    True,
    False, False, False, False, False, False, False, False,
    False, False, False, False,
    False, False, False, False, False,
    False, False, False, False,
    False, False, False, False, False, False, False, False
WHERE NOT EXISTS (SELECT 1 FROM [Pec_Recettes2] WHERE [Cpte_Pec] = '122');

-- =============================================================================
-- SECTION 7 : MODÈLE D'ÉCRITURES COMPTABLES (Tble_Saisie)
-- =============================================================================
-- Modèles de saisie pour les deux phases de l'opération compte 122.

-- PHASE 1 : Constatation de l'affectation du résultat
--   DÉBIT  : 131 (Résultat de fonctionnement)
--   CRÉDIT : 122 (Résultat de fonctionnement affecté)
INSERT INTO [Tble_Saisie] ([Num_Titre],[Debit],[Credit],[Montant],[Objet],[Benef])
SELECT 0, '131', '122', 0,
    'Affectation résultat fonctionnement - Phase 1 : Constatation (D/131 - C/122)',
    'Opération ordre budgétaire - Circulaire 2026000631'
WHERE NOT EXISTS (
    SELECT 1 FROM [Tble_Saisie]
    WHERE [Debit] = '131' AND [Credit] = '122'
);

-- PHASE 2 : Virement vers ressources d'investissement
--   DÉBIT  : 122 (Résultat de fonctionnement affecté)
--   CRÉDIT : 111 (Excédent de fonctionnement capitalisé) ou compte 10x selon l'affectation
INSERT INTO [Tble_Saisie] ([Num_Titre],[Debit],[Credit],[Montant],[Objet],[Benef])
SELECT 0, '122', '111', 0,
    'Affectation résultat fonctionnement - Phase 2 : Virement investissement (D/122 - C/111)',
    'Opération ordre budgétaire - Circulaire 2026000631'
WHERE NOT EXISTS (
    SELECT 1 FROM [Tble_Saisie]
    WHERE [Debit] = '122' AND [Credit] = '111'
);

-- =============================================================================
-- SECTION 8 : VÉRIFICATION BUDGET - VerifBudget
-- =============================================================================
-- Le compte 122 doit pouvoir recevoir des prévisions budgétaires
-- en recette (section investissement) et en dépense (opération d'ordre
-- fonctionnement). On s'assure qu'il est bien configurable dans VerifBudget.

INSERT INTO [VerifBudget] ([Compte],[Recettes],[Depenses],[Cible])
SELECT '122', 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM [VerifBudget] WHERE [Compte] = '122');

-- =============================================================================
-- SECTION 9 : STRUCTURE CG FONCTIONNEMENT - Opération d'ordre
-- =============================================================================
-- Le compte 122 génère une dépense d'ordre en section fonctionnement
-- (contrepartie de la recette d'investissement).
-- Ajout dans CG_Fonctionnement si la ligne d'opération d'ordre n'existe pas.

INSERT INTO [CG_Fonctionnement] ([N°],[Chap],[Chap_Int],[Art],[Art_Int],[Par],[Classification])
SELECT
    (SELECT COALESCE(MAX([N°]),0) FROM [CG_Fonctionnement]) + 1,
    '042',  -- Chapitre opérations d'ordre (virement de section)
    'Opérations d''ordre à caractère budgétaire',
    '042',
    'Virement à la section d''investissement',
    '122',
    'Fonctionnement Dépenses'
WHERE NOT EXISTS (
    SELECT 1 FROM [CG_Fonctionnement] WHERE [Par] = '122'
);

-- =============================================================================
-- SECTION 10 : BALANCE D'ENTRÉE - BalanceEntree
-- =============================================================================
-- Si un solde reporté existe pour le compte 122 en début d'exercice,
-- la Balance d'entrée doit pouvoir l'accueillir.
-- Cette section assure que le compte 122 est valide dans BalanceEntree.
-- (Les montants réels seront saisis lors de l'ouverture de l'exercice.)

-- Pas d'INSERT automatique de montant ici car le solde dépend de l'exercice.
-- La correction de Bal_Entree=True dans Plan_Comptable (Section 1) suffit
-- pour que le formulaire d'ouverture de balance propose le compte 122.

-- =============================================================================
-- RÉCAPITULATIF DES MODIFICATIONS
-- =============================================================================
/*
  COMPTE 122 - "Résultat de fonctionnement affecté"

  CORRECTIONS APPORTÉES (Circulaire n° 2026000631) :
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │ Table            │ Champ              │ Avant │ Après │ Justification       │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │ Plan_Comptable   │ Passif             │   0   │   1   │ C'est un compte de  │
  │                  │                   │       │       │ passif (ressources)  │
  │ Plan_Comptable   │ Etat_Passif        │   0   │   1   │ Visible au bilan    │
  │ Plan_Comptable   │ Bal_Entree         │   0   │   1   │ Solde reporté de    │
  │                  │                   │       │       │ l'exercice précédent │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │ CG_Passif        │ Ligne 122          │  --   │  ajt  │ Structure bilan     │
  │ Gest_CpteTiers   │ CpteTiers '122'    │  --   │  ajt  │ Débit ET Crédit OK  │
  │ Pec_Recettes     │ Ligne Cpte_Pec=122 │  --   │  ajt  │ Recette investissmt │
  │ Pec_Recettes2    │ Ligne Cpte_Pec=122 │  --   │  ajt  │ Variante recettes   │
  │ Operation        │ N°20 (affectation) │  --   │  ajt  │ Opération d'ordre   │
  │ TypeOperation    │ Id=18 (affectation)│  --   │  ajt  │ Type opér. spécif.  │
  │ Tble_Saisie      │ D/131 → C/122      │  --   │  ajt  │ Phase 1 saisie      │
  │ Tble_Saisie      │ D/122 → C/111      │  --   │  ajt  │ Phase 2 saisie      │
  │ VerifBudget      │ Compte 122         │  --   │  ajt  │ Contrôle budgétaire │
  │ CG_Fonctionnmt   │ Chap 042 / Par 122 │  --   │  ajt  │ Dépense d'ordre     │
  └─────────────────────────────────────────────────────────────────────────────┘

  ÉCRITURES COMPTABLES DU COMPTE 122 (opérations d'ordre budgétaires) :

  Phase 1 – Constatation de l'affectation du résultat de fonctionnement :
    DÉBIT  131  "Résultat de fonctionnement"      XXXXX F CFA
    CRÉDIT 122  "Résultat de fonctionnement affecté"    XXXXX F CFA
    Journal : JOD | Type : Opération d'ordre budgétaire

  Phase 2 – Virement du résultat affecté vers la section d'investissement :
    DÉBIT  122  "Résultat de fonctionnement affecté"    XXXXX F CFA
    CRÉDIT 111  "Excédent de fonctionnement capitalisé" XXXXX F CFA
    (ou compte 10x selon nature de l'affectation)
    Journal : JOD | Type : Opération d'ordre budgétaire

  Concordance compte administratif / compte de gestion :
    - Compte administratif ordonnateur → Recette investissement compte 122
    - Compte de gestion receveur       → Écritures D/131-C/122 puis D/122-C/111
*/
