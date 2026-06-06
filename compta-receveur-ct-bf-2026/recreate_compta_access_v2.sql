-- =============================================================================
-- SCRIPT DE RECREATION DE LA BASE ACCESS : Compta_Receveur_CT-BF_2026_NV.accdb
-- Comptabilité du Receveur - Collectivités Territoriales - Burkina Faso
-- Généré par extraction mdbtools + reconstitution structurelle
-- =============================================================================

-- ============================================================
-- 1. TABLES DE CONFIGURATION GÉNÉRALE
-- ============================================================

CREATE TABLE [Collectivites] (
    [Id_Collectivite]   Long Integer NOT NULL,
    [Collectivite]      Text (255) NOT NULL,
    [Exercice]          Long Integer,
    [IdOrdonnateur]     Text (255),
    [TitreOrdonnateur]  Text (255),
    [IdReceveur]        Text (255),
    [TitreReceveur]     Text (255),
    [Region]            Text (255),
    [Province]          Text (255),
    [PosteCptable]      Text (255),
    [QualiteReceveur]   Text (255),
    [TypeCollectivite]  Text (255),
    [AdressePoste]      Text (255),
    [VillePoste]        Text (255),
    [Id_CF]             Text (255),
    [Titre_CF]          Text (255),
    [Licence]           Text (255),
    [TypeBudget]        Text (255),
    [Budget_Intitule]   Text (255)
);

-- Données initiales Collectivites
INSERT INTO [Collectivites] ([Id_Collectivite],[Collectivite],[Exercice],[IdOrdonnateur],[IdReceveur],[QualiteReceveur],[TypeCollectivite],[Licence])
VALUES (1,'Choisir',2026,'Obligatoire','Obligatoire','Le Receveur Municipal','COMMUNE :','La Patrie ou la Mort, nous Vaincrons');

CREATE TABLE [ListeCollectivites] (
    [N°]                    Long Integer,
    [Nom_Collectivite]      Text (255) NOT NULL,
    [Type]                  Text (255),
    [Region]                Text (255),
    [Province]              Text (255),
    [Poste]                 Text (255),
    [VillePoste]            Text (255),
    [Licence]               Text (255),
    [NouvPoste]             Text (255),
    [Actu_Nom_Collectivite] Text (255),
    [Actu_Region]           Text (255),
    [Actu_Province]         Text (255),
    [Actu_Nouv_Poste]       Text (255)
);

-- ============================================================
-- 2. TABLES DE RÉFÉRENCE (NOMENCLATURES)
-- ============================================================

CREATE TABLE [MoisEcriture] (
    [N°]            Long Integer,
    [Mois_Ecriture] Text (255),
    [Code_Mois]     Long Integer,
    [Mois_Min]      Text (255),
    [Trimestre]     Text (255)
);
INSERT INTO [MoisEcriture] VALUES (1,'JANVIER',1,'Janvier','Trimestre 1');
INSERT INTO [MoisEcriture] VALUES (2,'FEVRIER',2,'Février','Trimestre 1');
INSERT INTO [MoisEcriture] VALUES (3,'MARS',3,'Mars','Trimestre 1');
INSERT INTO [MoisEcriture] VALUES (4,'AVRIL',4,'Avril','Trimestre 2');
INSERT INTO [MoisEcriture] VALUES (5,'MAI',5,'Mai','Trimestre 2');
INSERT INTO [MoisEcriture] VALUES (6,'JUIN',6,'Juin','Trimestre 2');
INSERT INTO [MoisEcriture] VALUES (7,'JUILLET',7,'Juillet','Trimestre 3');
INSERT INTO [MoisEcriture] VALUES (8,'AOÛT',8,'Août','Trimestre 3');
INSERT INTO [MoisEcriture] VALUES (9,'SEPTEMBRE',9,'Septembre','Trimestre 3');
INSERT INTO [MoisEcriture] VALUES (10,'OCTOBRE',10,'Octobre','Trimestre 4');
INSERT INTO [MoisEcriture] VALUES (11,'NOVEMBRE',11,'Novembre','Trimestre 4');
INSERT INTO [MoisEcriture] VALUES (12,'DECEMBRE',12,'Décembre','Trimestre 4');
INSERT INTO [MoisEcriture] VALUES (13,'DECEMBRE JC',13,'Décembre JC','Trimestre 4');

CREATE TABLE [Journaux] (
    [Journal] Text (255) NOT NULL
);
INSERT INTO [Journaux] VALUES ('JDT');    -- Journal de Dépenses sur Titres
INSERT INTO [Journaux] VALUES ('JMDT');   -- Journal Mandats de Dépenses sur Titres
INSERT INTO [Journaux] VALUES ('JOD');    -- Journal des Opérations Diverses
INSERT INTO [Journaux] VALUES ('JOD2');   -- Journal des Opérations Diverses 2
INSERT INTO [Journaux] VALUES ('JR');     -- Journal de Recettes

CREATE TABLE [TypeOperation] (
    [Id_TypeOperation]  Long Integer,
    [Type_Operation]    Text (255)
);
INSERT INTO [TypeOperation] VALUES (1,'Prise en charge titre de paiement');
INSERT INTO [TypeOperation] VALUES (2,'Paiement titre courant');
INSERT INTO [TypeOperation] VALUES (3,'Paiement titre non courant');
INSERT INTO [TypeOperation] VALUES (4,'Recette avant titre');
INSERT INTO [TypeOperation] VALUES (5,'Prise en charge titre recette');
INSERT INTO [TypeOperation] VALUES (6,'Encaissement recette sur titre');
INSERT INTO [TypeOperation] VALUES (7,'Autre encaissement ou régularisation');
INSERT INTO [TypeOperation] VALUES (8,'Autre décaissement ou régularisation');
INSERT INTO [TypeOperation] VALUES (9,'Régularisation dépense');
INSERT INTO [TypeOperation] VALUES (10,'Virement interne');
INSERT INTO [TypeOperation] VALUES (11,'Annulation titre de paiement courant');
INSERT INTO [TypeOperation] VALUES (12,'Annulation titre de recette');
INSERT INTO [TypeOperation] VALUES (13,'Operation d''ordre');
INSERT INTO [TypeOperation] VALUES (14,'Annulation titre de paiement non courant');
INSERT INTO [TypeOperation] VALUES (15,'Régularisation recette');
INSERT INTO [TypeOperation] VALUES (16,'Préalables');
INSERT INTO [TypeOperation] VALUES (17,'Encaissement recette sur titre non courant');
-- AJOUT CIRCULAIRE 2026000631 : type opération affectation résultat compte 122
INSERT INTO [TypeOperation] VALUES (18,'Affectation résultat de fonctionnement au compte 122');

CREATE TABLE [Operation] (
    [Num_Operation]     Long Integer,
    [Type_Operation]    Text (255) NOT NULL
);
INSERT INTO [Operation] VALUES (1,'Recettes avant titres');
INSERT INTO [Operation] VALUES (2,'Depenses mandats courants');
INSERT INTO [Operation] VALUES (3,'Recettes apres titres');
INSERT INTO [Operation] VALUES (4,'Operation ordre budgetaire');
INSERT INTO [Operation] VALUES (5,'Operation ordre non budgetaire');
INSERT INTO [Operation] VALUES (6,'Avance Regisseur');
INSERT INTO [Operation] VALUES (7,'Virement comptes de disponibilite');
INSERT INTO [Operation] VALUES (8,'Rectification mandat Courant');
INSERT INTO [Operation] VALUES (9,'BalanceEntree');
INSERT INTO [Operation] VALUES (10,'BudgetPrimitif');
INSERT INTO [Operation] VALUES (11,'Budget Supplementaire');
INSERT INTO [Operation] VALUES (12,'Decision modificative');
INSERT INTO [Operation] VALUES (13,'Depenses mandats précédents et antérieurs');
INSERT INTO [Operation] VALUES (14,'Divers decaissements');
INSERT INTO [Operation] VALUES (15,'Divers Encaissements');
INSERT INTO [Operation] VALUES (16,'Regularisation du compte 492');
INSERT INTO [Operation] VALUES (17,'Regularisation du compte 580');
INSERT INTO [Operation] VALUES (18,'Regularisation du compte 490');
INSERT INTO [Operation] VALUES (19,'Encaissement titre anterieur');
-- AJOUT CIRCULAIRE 2026000631 : opération d'ordre budgétaire compte 122
INSERT INTO [Operation] VALUES (20,'Affectation résultat de fonctionnement (compte 122)');

CREATE TABLE [SectionBudget] (
    [N°]            Long Integer,
    [Section_Budget] Text (255) NOT NULL
);
INSERT INTO [SectionBudget] VALUES (1,'Investissement');
INSERT INTO [SectionBudget] VALUES (2,'Fonctionnement');
INSERT INTO [SectionBudget] VALUES (3,'NonApplicable');

CREATE TABLE [OrigineRecettes] (
    [N°]                Long Integer,
    [Origine_Recette]   Text (255) NOT NULL
);
INSERT INTO [OrigineRecettes] VALUES (1,'Recettes Externes');
INSERT INTO [OrigineRecettes] VALUES (2,'Recettes Propres');
INSERT INTO [OrigineRecettes] VALUES (3,'NonApplicable');

CREATE TABLE [TypePrevision] (
    [N°]            Long Integer,
    [Type_Prevision] Text (255) NOT NULL
);
INSERT INTO [TypePrevision] VALUES (1,'Budget primitif');
INSERT INTO [TypePrevision] VALUES (2,'Budget supplémentaire');
INSERT INTO [TypePrevision] VALUES (3,'Décision modificative avant Budget supplémentaire');
INSERT INTO [TypePrevision] VALUES (4,'Décision modificative après Budget supplémentaire');

CREATE TABLE [DomaineTransfere] (
    [N°]        Long Integer,
    [Domaine]   Text (255)
);
INSERT INTO [DomaineTransfere] VALUES (1,'RESSOURCES PROPRES');
INSERT INTO [DomaineTransfere] VALUES (2,'DOMAINE DE LA SANTE');
INSERT INTO [DomaineTransfere] VALUES (3,'DOMAINE DU PRESCOLAIRE, DE L''ENSEIGNEMENT PRIMAIRE ET L''ALPHABETISATION');
INSERT INTO [DomaineTransfere] VALUES (4,'DOMAINE DE L''EAU POTABLE ET DE L''ASSAINISSEMENT');
INSERT INTO [DomaineTransfere] VALUES (5,'DOMAINE COMMERCE, INDUSTRIE ET ARTISANAT');
INSERT INTO [DomaineTransfere] VALUES (6,'DOMAINE DE LA JEUNESSE, FORMATION PROFESSIONNELLE ET EMPLOI');
INSERT INTO [DomaineTransfere] VALUES (7,'DOMAINE DE LA CULTURE ET DU TOURISME');
INSERT INTO [DomaineTransfere] VALUES (8,'DOMAINE DES SPORTS ET LOISIRS');
INSERT INTO [DomaineTransfere] VALUES (9,'DOMAINE RESSOURCES ANIMALES ET HALIEUTIQUES');
INSERT INTO [DomaineTransfere] VALUES (10,'DOMAINE DE L''AGRICULTURE ET DES AMENAGEMENTS HYDROAGRICOLES');
INSERT INTO [DomaineTransfere] VALUES (11,'DOMAINE ACTION SOCIALE, SOLIDARITE NATIONALE ET PROMOTION DE LA FEMME');
INSERT INTO [DomaineTransfere] VALUES (12,'DOMAINE DES INFRASTRUCTURES');
INSERT INTO [DomaineTransfere] VALUES (13,'AGENCE NATIONALE D''APPUI AU DEVELOPPEMENT DES COLLECTIVITES TERRITORIALES (EX FPDCT)');
INSERT INTO [DomaineTransfere] VALUES (14,'FONDS MINIER DE DEVELOPPEMENT LOCAL (FMDL)');
INSERT INTO [DomaineTransfere] VALUES (15,'PROJET NATIONAL DE DEVELOPPEMENT RURAL PRODUCTIF (PNDRP)');

CREATE TABLE [Tble_MethodeRecette] (
    [Methode]   Text (255) NOT NULL,
    [Id]        Long Integer
);
INSERT INTO [Tble_MethodeRecette] VALUES ('1) Envoyer des ordres d''encaissement et de déclaration de recettes à l''ordonnateur',1);
INSERT INTO [Tble_MethodeRecette] VALUES ('2) Produire les titres de recettes et les soumettre pour signature',2);
INSERT INTO [Tble_MethodeRecette] VALUES ('3) Aucune',0);

-- ============================================================
-- 3. PLAN COMPTABLE (table pivot centrale - ~1006 comptes)
-- ============================================================

CREATE TABLE [Plan_Comptable] (
    [Compte]                Text (255) NOT NULL,
    [Libelle]               Text (255),
    [Cpte_Ppal]             Boolean NOT NULL DEFAULT False,
    [Etat_Passif]           Boolean NOT NULL DEFAULT False,
    [Etat_Actif]            Boolean NOT NULL DEFAULT False,
    [Passif]                Boolean NOT NULL DEFAULT False,
    [Actif]                 Boolean NOT NULL DEFAULT False,
    [Sens]                  Text (255),           -- 'D' ou 'C'
    [CpteFinEnc]            Boolean NOT NULL DEFAULT False,
    [CpteFinEnc2]           Boolean NOT NULL DEFAULT False,
    [Bal_Entree]            Boolean NOT NULL DEFAULT False,
    [Recette_Budgetaire]    Boolean NOT NULL DEFAULT False,
    [Depense_Budgetaire]    Boolean NOT NULL DEFAULT False,
    [Recette_Fiscale]       Boolean NOT NULL DEFAULT False,
    [Section_Budget]        Text (255),  -- 'Fonctionnement','Investissement','NonApplicable'
    [Origine_Recette]       Text (255),  -- 'Recettes Propres','Recettes Externes','NonApplicable'
    [Section_Budget_Tri]    Text (255),  -- code tri ex: 'F001','I001'
    [Acteur_Tresor]         Boolean NOT NULL DEFAULT False,
    [Acteur_Impot]          Boolean NOT NULL DEFAULT False,
    [Acteur_Autres]         Boolean NOT NULL DEFAULT False,
    [DetailsPlus]           Text (255),
    [DansDetail]            Boolean NOT NULL DEFAULT False,
    [Libelle2]              Text (254),
    [Situation_Tresorerie]  Boolean NOT NULL DEFAULT False,
    [Rang]                  Long Integer
);
-- Note: Les ~1006 comptes du plan comptable UEMOA/CT-BF sont importés
-- depuis le CSV exporté (plan_comptable_full.csv).
-- Corrections circulaire n° 2026000631 intégrées (voir patch_compte_122_circulaire_2026000631.sql).

-- Extrait illustratif des comptes clés (classe 12 - Report à nouveau) :
INSERT INTO [Plan_Comptable] ([Compte],[Libelle],[Passif],[Sens],[Bal_Entree],[Recette_Budgetaire],[Section_Budget],[Origine_Recette],[Section_Budget_Tri],[Acteur_Autres],[Rang])
VALUES ('10','DOTATIONS, SUBVENTIONS, DONS ET LEGS EN CAPITAL',1,'C',1,1,'Investissement','Recettes Externes','I001',1,1);
INSERT INTO [Plan_Comptable] ([Compte],[Libelle],[Cpte_Ppal],[Etat_Passif],[Etat_Actif],[Passif],[Actif],[Sens],[CpteFinEnc],[CpteFinEnc2],[Bal_Entree],[Recette_Budgetaire],[Depense_Budgetaire],[Recette_Fiscale],[Section_Budget],[Origine_Recette],[Section_Budget_Tri],[Acteur_Tresor],[Acteur_Impot],[Acteur_Autres],[DansDetail],[Situation_Tresorerie],[Rang])
VALUES ('12','REPORT A NOUVEAU',0,0,0,1,0,'C',0,0,1,1,1,0,'Investissement','Recettes Externes','I003',0,0,1,0,0,44);
INSERT INTO [Plan_Comptable] ([Compte],[Libelle],[Cpte_Ppal],[Etat_Passif],[Etat_Actif],[Passif],[Actif],[Sens],[CpteFinEnc],[CpteFinEnc2],[Bal_Entree],[Recette_Budgetaire],[Depense_Budgetaire],[Recette_Fiscale],[Section_Budget],[Origine_Recette],[Section_Budget_Tri],[Acteur_Tresor],[Acteur_Impot],[Acteur_Autres],[DansDetail],[Situation_Tresorerie],[Rang])
VALUES ('121','Résultat ordinaire reporté',1,0,0,1,0,'C',0,0,1,0,0,0,'Investissement','Recettes Externes','I003',0,0,1,0,0,45);
-- COMPTE 122 - CORRECTION CIRCULAIRE 2026000631 :
-- Passif=1, Etat_Passif=1, Bal_Entree=1 (auparavant : Passif=0, Etat_Passif=0, Bal_Entree=0)
-- Fonctionnement : AU CRÉDIT (constatation affectation D/131→C/122)
--                  ET AU DÉBIT (virement investissement D/122→C/111)
INSERT INTO [Plan_Comptable] ([Compte],[Libelle],[Cpte_Ppal],[Etat_Passif],[Etat_Actif],[Passif],[Actif],[Sens],[CpteFinEnc],[CpteFinEnc2],[Bal_Entree],[Recette_Budgetaire],[Depense_Budgetaire],[Recette_Fiscale],[Section_Budget],[Origine_Recette],[Section_Budget_Tri],[Acteur_Tresor],[Acteur_Impot],[Acteur_Autres],[DansDetail],[Situation_Tresorerie],[Rang])
VALUES ('122','Résultat de fonctionnement affecté',1,1,0,1,0,'C',0,0,1,1,1,0,'Investissement','Recettes Externes','I003',0,0,1,0,0,46);
INSERT INTO [Plan_Comptable] ([Compte],[Libelle],[Cpte_Ppal],[Etat_Passif],[Etat_Actif],[Passif],[Actif],[Sens],[CpteFinEnc],[CpteFinEnc2],[Bal_Entree],[Recette_Budgetaire],[Depense_Budgetaire],[Recette_Fiscale],[Section_Budget],[Origine_Recette],[Section_Budget_Tri],[Acteur_Tresor],[Acteur_Impot],[Acteur_Autres],[DansDetail],[Situation_Tresorerie],[Rang])
VALUES ('123','Résultat d''investissement reporté',1,0,0,0,0,'C',0,0,0,1,1,0,'Investissement','Recettes Externes','I003',0,0,1,0,0,47);
-- ... (voir plan_comptable_full.csv pour l'intégralité des 1006 comptes)

-- ============================================================
-- 4. STRUCTURE COMPTABLE CG (Compte Général)
-- ============================================================

CREATE TABLE [CG_Actif] (
    [N°]                Long Integer,
    [Titre]             Text (255),
    [Cpte_SousTitre]    Text (255),
    [Sous_Titre]        Text (255),
    [Cpte_Actif]        Text (255),
    [Classification]    Text (255),
    [Classification2]   Text (255)
);

CREATE TABLE [CG_Passif] (
    [N°]                Long Integer,
    [Titre]             Text (255),
    [Cpte_SousTitre]    Text (255),
    [Sous_Titre]        Text (255),
    [Cpte_Passif]       Text (255),
    [Classification]    Text (255),
    [Classification2]   Text (255)
);

CREATE TABLE [CG_Fonctionnement] (
    [N°]            Long Integer,
    [Chap]          Text (255),
    [Chap_Int]      Text (255),
    [Art]           Text (255),
    [Art_Int]       Text (255),
    [Par]           Text (255),
    [Classification] Text (255)
);

CREATE TABLE [CG_Fonct_Synthese] (
    [N°]            Long Integer,
    [Nature]        Text (255),
    [Chapitre]      Text (255),
    [Classification] Text (255)
);

CREATE TABLE [Z_Nature] (
    [N°]        Long Integer,
    [Nature]    Text (255),
    [Niveau]    Long Integer,
    [Intitule]  Text (255)
);
INSERT INTO [Z_Nature] VALUES (1,'Actif',1,'Comptes de Bilan Actif - Détails');
INSERT INTO [Z_Nature] VALUES (2,'Actif',2,'Comptes de Bilan Actif - Synthèse');
INSERT INTO [Z_Nature] VALUES (3,'Passif',3,'Comptes de Passif - Détails');
INSERT INTO [Z_Nature] VALUES (4,'Passif',4,'Comptes de Passif - Synthèse');
INSERT INTO [Z_Nature] VALUES (5,'Fonctionnement Recettes',5,'Section Fonctionnement - Détails : Recettes');
INSERT INTO [Z_Nature] VALUES (6,'Fonctionnement dépenses',6,'Section Fonctionnement - Détails : Dépenses');
INSERT INTO [Z_Nature] VALUES (7,'Fonctionnement Synthèse',7,'Section Fonctionnement - Synthèse');

CREATE TABLE [Valeur_CG] (
    [N°]                    Long Integer,
    [Compte]                Text (255),
    [DebiteurAnterieure]    Currency,
    [CrediteurAnterieure]   Currency,
    [DebiteurCourante]      Currency,
    [CrediteurCourante]     Currency,
    [Previsions]            Currency,
    [Pec]                   Currency,
    [Rec_Pai]               Currency,
    [Nature]                Text (255)
);
-- Variantes du CG par sous-ensemble budgétaire :
CREATE TABLE [Valeur_CG_AD] ( -- Annéee en cours Dépenses
    [N°] Long Integer,[Compte] Text(255),[DebiteurAnterieure] Currency,
    [CrediteurAnterieure] Currency,[DebiteurCourante] Currency,[CrediteurCourante] Currency,
    [Previsions] Currency,[Pec] Currency,[Rec_Pai] Currency,[Nature] Text(255));
CREATE TABLE [Valeur_CG_FR] ( -- Fonctionnement Recettes
    [N°] Long Integer,[Compte] Text(255),[DebiteurAnterieure] Currency,
    [CrediteurAnterieure] Currency,[DebiteurCourante] Currency,[CrediteurCourante] Currency,
    [Previsions] Currency,[Pec] Currency,[Rec_Pai] Currency,[Nature] Text(255));
CREATE TABLE [Valeur_CG_PD] ( -- Passif Dépenses
    [N°] Long Integer,[Compte] Text(255),[DebiteurAnterieure] Currency,
    [CrediteurAnterieure] Currency,[DebiteurCourante] Currency,[CrediteurCourante] Currency,
    [Previsions] Currency,[Pec] Currency,[Rec_Pai] Currency,[Nature] Text(255));
CREATE TABLE [Valeur_CG_FD] ( -- Fonctionnement Dépenses
    [N°] Long Integer,[Compte] Text(255),[DebiteurAnterieure] Currency,
    [CrediteurAnterieure] Currency,[DebiteurCourante] Currency,[CrediteurCourante] Currency,
    [Previsions] Currency,[Pec] Currency,[Rec_Pai] Currency,[Nature] Text(255));

-- ============================================================
-- 5. BUDGET (Prévisions)
-- ============================================================

CREATE TABLE [BudgetPrimitif] (
    [Id_Budget]     Long Integer,
    [Num_Ecriture]  Long Integer,
    [Compte]        Text (255) NOT NULL,
    [Mtt_Recettes]  Currency NOT NULL,
    [Mtt_Depenses]  Currency NOT NULL
);

CREATE TABLE [BudgetSupplementaire] (
    [Id_BS]         Long Integer,
    [Num_Ecriture]  Long Integer,
    [Compte]        Text (255) NOT NULL,
    [Mtt_Recettes]  Currency NOT NULL,
    [Mtt_Depenses]  Currency NOT NULL
);

CREATE TABLE [BudgetSupplementaire2] (
    [Id_BS]         Long Integer,
    [Num_Ecriture]  Long Integer,
    [Compte]        Text (255) NOT NULL,
    [Mtt_Recettes]  Currency NOT NULL,
    [Mtt_Depenses]  Currency NOT NULL
);

CREATE TABLE [DecisionModificative] (
    [Id_DM]         Long Integer,
    [Num_Ecriture]  Long Integer,
    [Ref_Decision]  Text (255) NOT NULL,
    [Compte]        Text (255) NOT NULL,
    [Mtt_Recettes]  Currency NOT NULL,
    [Mtt_Depenses]  Currency NOT NULL,
    [BudgetModifier] Text (255) NOT NULL,
    [Etat]          Text (255)
);

CREATE TABLE [Z_Syn_Budget] (
    [Compte]    Text (5),
    [Nature]    Text (2),
    [BP]        Double,
    [BR1]       Double,
    [BR2]       Double,
    [DM_BP]     Double,
    [DM_BR1]    Double,
    [DM_BR2]    Double
);

CREATE TABLE [Z_Syn_Budget2] (
    [Compte]    Text (5),
    [Num_Op]    Long Integer,
    [Recettes]  Double,
    [Depenses]  Double
);

CREATE TABLE [VerifBudget] (
    [Compte]    Text (255),
    [Recettes]  Currency,
    [Depenses]  Currency,
    [Cible]     Long Integer
);

CREATE TABLE [DetailsCompte] (
    [N°]                    Long Integer,
    [Compte]                Text (255),
    [Libelle]               Text (255),
    [DetailsBudgetPrimitif] Text (255),
    [DetailsBudgetSupp]     Text (255)
);

-- ============================================================
-- 6. ÉCRITURES COMPTABLES (table centrale des transactions)
-- ============================================================

CREATE TABLE [Ecritures] (
    [Num_Ecriture]      Long Integer,      -- Numéro séquentiel unique
    [DateCreation]      DateTime NOT NULL,
    [Id_Collectivite]   Long Integer NOT NULL,
    [Mois_Ecriture]     Long Integer,       -- Réf. MoisEcriture.Code_Mois
    [Num_Operation]     Long Integer,       -- Réf. Operation.Num_Operation
    [Ref_Bord]          Long Integer,       -- Numéro de bordereau
    [Ref_Mdt]           Long Integer,       -- Numéro de mandat
    [Ref_Titre]         Long Integer,       -- Numéro de titre de recette
    [Ref_AutrePiece]    Text (255),
    [Objet]             Text (255),
    [Beneficiaire]      Text (255),
    [Imputation]        Text (255),         -- Compte budgétaire
    [Montant]           Currency,
    [MontantTitre]      Currency,
    [MttMdtPaye]        Currency,
    [Id_TypeOperation]  Long Integer,       -- Réf. TypeOperation
    [Motif_Annulation]  Text (255),
    [Ref_Contrat]       Text (255),
    [Objet2]            Text (254)
);

CREATE TABLE [Mvts_Consolides] (
    [Num_Ecriture]      Long Integer,
    [Num_Operation]     Long Integer,
    [Compte]            Text (255),
    [Mvt_EntreeDebit]   Currency,
    [Mvt_EntreeCredit]  Currency,
    [Mvt_GestionDebit]  Currency,
    [Mvt_GestionCredit] Currency,
    [Mvt_PrevRecettes]  Currency,
    [Mvt_PrevDepenses]  Currency,
    [Mvt_Journal]       Text (255)
);

CREATE TABLE [Lignes_Consolides] (
    [N°LigneConsolide]  Long Integer,
    [Num_Ecriture]      Long Integer,
    [Compte]            Text (255),
    [MontantDebit]      Currency,
    [MontantCredit]     Currency,
    [Journal]           Text (255),
    [AutreInfo]         Text (255)
);

CREATE TABLE [BordDetailMdts] (
    [N°]            Long Integer,
    [Compte]        Text (255),
    [Libelle]       Text (255),
    [Ref_Mdt]       Long Integer,
    [Objet]         Text (255),
    [Montant]       Currency,
    [Mois]          Long Integer,
    [Journal]       Text (10),
    [DateCreation]  DateTime
);

-- ============================================================
-- 7. BALANCE ET OUVERTURE
-- ============================================================

CREATE TABLE [BalanceEntree] (
    [Id_Balance]    Long Integer,
    [Num_Ecriture]  Long Integer,
    [Compte]        Text (255) NOT NULL,
    [SoldeDebit]    Currency NOT NULL,
    [SoldeCredit]   Currency NOT NULL
);

CREATE TABLE [BalanceTransition] (
    [Id_Balance]    Long Integer,
    [Num_Ecriture]  Long Integer,
    [Compte]        Text (255),
    [SoldeDebit]    Currency,
    [SoldeCredit]   Currency,
    [Type]          Text (255)
);

CREATE TABLE [Tble_SoldeCloture] (
    [Compte]        Text (255) NOT NULL,
    [SoldeDebit]    Currency NOT NULL,
    [SoldeCredit]   Currency NOT NULL
);

-- ============================================================
-- 8. GESTION DES COMPTES TIERS
-- ============================================================

CREATE TABLE [Gest_CpteTiers] (
    [N°]                Long Integer,
    [CpteTiers]         Text (255),
    [AutreEncDebit]     Boolean NOT NULL,
    [AutreEncCredit]    Boolean NOT NULL,
    [AutreDecDebit]     Boolean NOT NULL,
    [AutreDecCredit]    Boolean NOT NULL,
    [RAR_Develop]       Boolean NOT NULL,   -- Restes à Recouvrer - développement
    [RAP_Develop]       Boolean NOT NULL,   -- Restes à Payer - développement
    [RAP_Tresorerie]    Boolean NOT NULL,
    [CIP_Develop]       Boolean NOT NULL,   -- Cautionnements, Impôts, Pénalités
    [GAR_Develop]       Boolean NOT NULL,   -- Garanties
    [PEN_Develop]       Boolean NOT NULL,   -- Pénalités
    [AVA_Develop]       Boolean NOT NULL,   -- Avances
    [EncTitreAnteCredit] Boolean NOT NULL,
    [PaiePrecAnte]      Boolean NOT NULL,
    [CpteFinPaiePrec]   Boolean NOT NULL,
    [CpteFinEncPrec]    Boolean NOT NULL
);

CREATE TABLE [DetailsCptedispo] (
    [N°]        Long Integer,
    [Compte]    Text (255),
    [Libelle]   Text (255),
    [Details]   Text (255)
);

CREATE TABLE [PrecisionCpte] (
    [N°]        Long Integer,
    [Cpte]      Text (255),
    [Libelle]   Text (255),
    [Details]   Text (255)
);

-- ============================================================
-- 9. PRISES EN CHARGE (PEC) - Matrices de correspondance comptes
-- ============================================================
-- Ces tables encodent les règles de PEC : pour chaque compte budgétaire (Cpte_Pec),
-- quels comptes de tiers peuvent être mouvementés (valeurs booléennes par colonne-compte)

CREATE TABLE [Pec_Depenses] (
    [N°]        Long Integer,
    [Cpte_Pec]  Text (255),
    [CpeTiers]  Boolean NOT NULL,
    [4010] Boolean NOT NULL,[4020] Boolean NOT NULL,[422] Boolean NOT NULL,
    [4240] Boolean NOT NULL,[4241] Boolean NOT NULL,[4248] Boolean NOT NULL,
    [4310] Boolean NOT NULL,[4311] Boolean NOT NULL,[4320] Boolean NOT NULL,
    [4321] Boolean NOT NULL,[439] Boolean NOT NULL,[4410] Boolean NOT NULL,
    [4411] Boolean NOT NULL,[4412] Boolean NOT NULL,[442] Boolean NOT NULL,
    [4630] Boolean NOT NULL,[4631] Boolean NOT NULL,[4632] Boolean NOT NULL,
    [4633] Boolean NOT NULL,[4660] Boolean NOT NULL
);

CREATE TABLE [Pec_Recettes] (
    [N°]        Long Integer,
    [Cpte_Pec]  Text (255),
    [CpeTiers]  Boolean NOT NULL,
    [4010] Boolean NOT NULL,[4020] Boolean NOT NULL,[4110] Boolean NOT NULL,
    [4120] Boolean NOT NULL,[4130] Boolean NOT NULL,[4140] Boolean NOT NULL,
    [4150] Boolean NOT NULL,[422] Boolean NOT NULL,[4410] Boolean NOT NULL,
    [4411] Boolean NOT NULL,[4412] Boolean NOT NULL,[442] Boolean NOT NULL,
    [4492] Boolean NOT NULL,[4493] Boolean NOT NULL,[4494] Boolean NOT NULL,
    [4495] Boolean NOT NULL,[4496] Boolean NOT NULL,[4510] Boolean NOT NULL,
    [4511] Boolean NOT NULL,[4512] Boolean NOT NULL,[452] Boolean NOT NULL,
    [4580] Boolean NOT NULL,[4581] Boolean NOT NULL,[4582] Boolean NOT NULL,
    [4610] Boolean NOT NULL,[4630] Boolean NOT NULL,[4631] Boolean NOT NULL,
    [4632] Boolean NOT NULL,[4633] Boolean NOT NULL
);

CREATE TABLE [Pec_Recettes2] (  -- Variante Pec_Recettes (même structure)
    [N°] Long Integer,[Cpte_Pec] Text(255),[CpeTiers] Boolean NOT NULL,
    [4010] Boolean NOT NULL,[4020] Boolean NOT NULL,[4110] Boolean NOT NULL,
    [4120] Boolean NOT NULL,[4130] Boolean NOT NULL,[4140] Boolean NOT NULL,
    [4150] Boolean NOT NULL,[422] Boolean NOT NULL,[4410] Boolean NOT NULL,
    [4411] Boolean NOT NULL,[4412] Boolean NOT NULL,[442] Boolean NOT NULL,
    [4492] Boolean NOT NULL,[4493] Boolean NOT NULL,[4494] Boolean NOT NULL,
    [4495] Boolean NOT NULL,[4496] Boolean NOT NULL,[4510] Boolean NOT NULL,
    [4511] Boolean NOT NULL,[4512] Boolean NOT NULL,[452] Boolean NOT NULL,
    [4580] Boolean NOT NULL,[4581] Boolean NOT NULL,[4582] Boolean NOT NULL,
    [4610] Boolean NOT NULL,[4630] Boolean NOT NULL,[4631] Boolean NOT NULL,
    [4632] Boolean NOT NULL,[4633] Boolean NOT NULL
);

-- Pec_Dep1 & Pec_Dep2 : matrices PEC Dépenses - comptes immobilisations (2xx) et charges (6xx)
-- Pec_Dep1 couvre comptes 161→6189 ; Pec_Dep2 couvre comptes 6210→6719
-- (structures larges ~170 colonnes Boolean chacune - voir DDL complet dans mdb-schema)

-- ============================================================
-- 10. DÉVELOPPEMENT DES COMPTES TIERS
-- ============================================================

CREATE TABLE [DevelopTiersRec] (
    [CompteTiers]       Text (255) NOT NULL,
    [Date_Pec]          DateTime NOT NULL,
    [Id_Debiteur]       Text (255) NOT NULL,
    [Nature_Recette]    Text (255) NOT NULL,
    [Num_Titre]         Long Integer NOT NULL,
    [Imputation_Pec]    Text (255) NOT NULL,
    [Annee_Pec]         Text (255) NOT NULL,
    [Montant_Pec]       Long Integer NOT NULL,
    [Cle]               Text (255) NOT NULL    -- Clé de déduplication
);

CREATE TABLE [DevelopTiersDep] (
    [CompteTiers]       Text (255),
    [Date_Pec]          DateTime NOT NULL,
    [Id_Creancier]      Text (255) NOT NULL,
    [Nature_Dep]        Text (255) NOT NULL,
    [Num_Mdt1]          Text (255) NOT NULL,
    [Imputation_Pec]    Text (255) NOT NULL,
    [Annee_Pec]         Long Integer NOT NULL,
    [Montant_Pec]       Long Integer NOT NULL,
    [Cle]               Text (255) NOT NULL
);

CREATE TABLE [DevelopTiersAva] (  -- Avances
    [CompteTiers]       Text (255) NOT NULL,
    [Date_Operation]    DateTime NOT NULL,
    [Id_Debiteur]       Text (255),
    [Nature]            Text (255),
    [Ref_Piece]         Text (255),
    [Montant]           Long Integer NOT NULL
);

CREATE TABLE [DevelopTiersCIP] (  -- Cautionnements/Impôts/Pénalités
    [CompteTiers]               Text (255) NOT NULL,
    [Date_Operation]            DateTime NOT NULL,
    [Id_Creancier_Debiteur]     Text (255),
    [Nature]                    Text (255),
    [Ref_Piece]                 Text (255),
    [Montant]                   Long Integer NOT NULL
);

CREATE TABLE [DevelopTiersGar] (  -- Garanties
    [CompteTiers]   Text (255) NOT NULL,
    [Date_Enc]      DateTime NOT NULL,
    [Id_Creancier]  Text (255),
    [Nature_Depot]  Text (255),
    [Ref_Piece]     Text (255),
    [Montant_Enc]   Long Integer NOT NULL
);

CREATE TABLE [DevelopTiersPen] (  -- Pénalités
    [CompteTiers]   Text (255) NOT NULL,
    [Date_Enc]      DateTime NOT NULL,
    [Id_Creancier]  Text (255),
    [Nature_Depot]  Text (255),
    [Ref_Piece]     Text (255),
    [Montant_Enc]   Long Integer NOT NULL
);

CREATE TABLE [DevelopTrans] (    -- Développement Dépenses transferts
    [N°]            Long Integer,
    [Num_Ecriture]  Long Integer,
    [CpteDebit]     Text (255),
    [RefMdt]        Text (255),
    [Montant_Trans] Currency
);

CREATE TABLE [DevelopTrans2] (   -- Développement Recettes transferts
    [N°]            Long Integer,
    [Num_Ecriture]  Long Integer,
    [CpteCredit]    Text (255),
    [NumTitre]      Text (255),
    [Montant_Trans] Currency
);

-- ============================================================
-- 11. RESTES À RECOUVRER / RESTES À PAYER (RAR/RAP)
-- ============================================================

CREATE TABLE [Z_RARGlobal] (   -- Restes à Recouvrer global
    [CompteTiers]       Text (255) NOT NULL,
    [Date_Pec]          DateTime NOT NULL,
    [Id_Debiteur]       Text (255) NOT NULL,
    [Nature_Recette]    Text (255) NOT NULL,
    [Num_Titre]         Long Integer NOT NULL,
    [Imputation_Pec]    Text (255) NOT NULL,
    [Montant_Pec]       Double NOT NULL
);

CREATE TABLE [Z_RAPGlobal] (   -- Restes à Payer global
    [CompteTiers]   Text (255),
    [Date_Pec]      DateTime NOT NULL,
    [Id_Creancier]  Text (255) NOT NULL,
    [Nature_Dep]    Text (255) NOT NULL,
    [Num_Mdt1]      Text (255) NOT NULL,
    [Imputation]    Text (255) NOT NULL,
    [Montant_RAP]   Double NOT NULL
);

CREATE TABLE [ReverveCptetiers] (  -- Réserves comptes tiers (1)
    [N°]        Long Integer,
    [Compte]    Text (255) NOT NULL,
    [Montant]   Currency NOT NULL
);

CREATE TABLE [ReverveCptetiers2] ( -- Réserves comptes tiers (2)
    [N°]        Long Integer,
    [Compte]    Text (255) NOT NULL,
    [Montant]   Currency NOT NULL
);

-- ============================================================
-- 12. TITRES DE RECETTES
-- ============================================================

CREATE TABLE [TitreRecettes] (
    [N°]                Long Integer,
    [Compte]            Text (255),
    [Libelle]           Text (255),
    [MontantTitre]      Double,
    [MontantRecouvre]   Double,
    [Trimestre]         Text (255),
    [TypeTitre]         Text (255),
    [PourTri]           Text (255)
);

CREATE TABLE [TitreRecAnnuel] (
    [N°]                Long Integer,
    [Compte]            Text (255),
    [Libelle]           Text (255),
    [MontantTitre]      Double,
    [MontantRecouvre]   Double,
    [TypeTitre]         Text (255),
    [PourTri]           Text (255)
);

CREATE TABLE [TitreRecMensuels] (
    [N°]                Long Integer,
    [Compte]            Text (255),
    [Libelle]           Text (255),
    [MontantTitre]      Double,
    [MontantRecouvre]   Double,
    [NumMois]           Text (255),
    [TypeTitre]         Text (255),
    [PourTri]           Text (255),
    [PourTri2]          Text (255)
);

CREATE TABLE [TitreRecMensuelsNouv] (
    [NumTitre]          Long Integer,
    [Compte]            Text (255),
    [MontantTitre]      Double,
    [TypeTitre]         Text (255)
);

CREATE TABLE [TitreRecMensuelsNouv2] (
    [NumTitre]      Long Integer,
    [Compte]        Text (255),
    [MontantTitre]  Double,
    [TypeTitre]     Text (255),
    [Debiteur]      Text (255)
);

CREATE TABLE [MultiCpteRecette] (
    [Compte]    Text (255) NOT NULL,
    [Montant]   Currency NOT NULL
);

CREATE TABLE [Z_RecAnticipe] (
    [Num_Ecriture]  Long Integer,
    [Imput]         Text (10)
);

CREATE TABLE [TendancesRec] (
    [Mois]      Text (255),
    [Num_Mois]  Long Integer,
    [Montant]   Currency,
    [Tresor]    Currency,
    [Impot]     Currency,
    [Autres]    Currency
);

-- ============================================================
-- 13. FINANCEMENT ET COMPTES SPÉCIAUX DE TRÉSORERIE
-- ============================================================

CREATE TABLE [Fin4620] (   -- Compte 4620 - Cautionnements reçus
    [Date_Enc]      DateTime,
    [Id_Creancier]  Text (255),
    [Nature_Depot]  Text (255),
    [Ref_Piece]     Text (255),
    [Montant_Enc]   Currency NOT NULL,
    [Creancier_Dec] Text (255),
    [Nature_Dec]    Text (255),
    [Ref_PjDec]     Text (255),
    [Montant_Dec]   Currency,
    [Num_Enc]       Long Integer,
    [Num_Dec]       Long Integer
);

CREATE TABLE [FinAVA] (    -- Avances
    [Date_Enc]          DateTime,
    [Id_Creancier]      Text (255),
    [Nature_Depot]      Text (255),
    [Ref_Piece]         Text (255),
    [Montant_Enc]       Currency NOT NULL,
    [Creancier_Dec]     Text (255),
    [Nature_Dec]        Text (255),
    [Ref_Mdt_Titre]     Text (255),
    [Ref_PjDec]         Text (255),
    [Montant_Dec]       Currency
);

CREATE TABLE [FinCIP] (    -- Cautionnements, Impôts, Pénalités
    [Date_Enc]      DateTime,
    [Id_Creancier]  Text (255),
    [Nature_Depot]  Text (255),
    [Ref_Piece]     Text (255),
    [Montant_Enc]   Currency NOT NULL,
    [Creancier_Dec] Text (255),
    [Nature_Dec]    Text (255),
    [Ref_Mdt_Titre] Text (255),
    [Ref_PjDec]     Text (255),
    [Montant_Dec]   Currency,
    [Mtt_Regul]     Currency,
    [nEnc]          Long Integer
);

CREATE TABLE [tVerif_Fin4620] (
    [CompteTiers]   Text (255),
    [Date_Enc]      DateTime,
    [Id_Creancier]  Text (255),
    [Nature_Depot]  Text (255),
    [Ref_Piece]     Text (255),
    [Montant_Enc]   Currency NOT NULL,
    [Creancier_Dec] Text (255),
    [Nature_Dec]    Text (255),
    [Ref_PjDec]     Text (255),
    [Montant_Dec]   Currency
);

-- ============================================================
-- 14. PAIEMENTS ET REVERSEMENTS
-- ============================================================

CREATE TABLE [ModePaiement] (
    [N°]                Long Integer,
    [Num_Ecriture]      Long Integer,
    [ModePaiement]      Text (255),
    [MontantPaiement]   Currency,
    [Details]           Text (255)
);

CREATE TABLE [PaieApresReverve] (
    [N°]            Long Integer,
    [Compte]        Text (255) NOT NULL,
    [Montant]       Currency NOT NULL,
    [ModePaiement]  Text (255) NOT NULL,
    [Nature]        Text (255) NOT NULL
);

CREATE TABLE [PaieApresReverve2] (
    [N°]            Long Integer,
    [Compte]        Text (255) NOT NULL,
    [Montant]       Currency NOT NULL,
    [ModePaiement]  Text (255) NOT NULL,
    [Nature]        Text (255) NOT NULL
);

CREATE TABLE [Table_reverse] (
    [Cpte_Reverse]  Text (255) NOT NULL,
    [CpteTiers]     Boolean NOT NULL,
    [6610] Boolean NOT NULL,[6611] Boolean NOT NULL,[6612] Boolean NOT NULL,
    [6613] Boolean NOT NULL,[6630] Boolean NOT NULL,[6631] Boolean NOT NULL,
    [6632] Boolean NOT NULL,[6633] Boolean NOT NULL,[6634] Boolean NOT NULL,
    [6635] Boolean NOT NULL,[6636] Boolean NOT NULL,[6637] Boolean NOT NULL,
    [6639] Boolean NOT NULL,[6640] Boolean NOT NULL,[6641] Boolean NOT NULL,
    [6642] Boolean NOT NULL,[6649] Boolean NOT NULL,[665] Boolean NOT NULL,
    [6660] Boolean NOT NULL,[6661] Boolean NOT NULL,[6662] Boolean NOT NULL,
    [6663] Boolean NOT NULL,[6669] Boolean NOT NULL,[669] Boolean NOT NULL
);

CREATE TABLE [SourceRessource] (
    [N°]                Long Integer,
    [Num_Ecriture]      Long Integer,
    [OrigineRessource]  Text (255),
    [MontantRessource]  Currency,
    [DepenseRessource]  Currency
);

CREATE TABLE [SautMdtListe] (
    [Mandat] Integer  -- Numéros de mandats à sauter dans la liste
);

-- ============================================================
-- 15. RAPPROCHEMENT BANCAIRE / TRÉSORERIE
-- ============================================================

CREATE TABLE [Tresorerie] (
    [N°]            Long Integer,
    [Compte]        Text (255) NOT NULL,
    [SoldeDebut]    Currency,
    [DebitPeriode]  Currency,
    [CreditPeriode] Currency,
    [SoldeFin]      Currency
);

CREATE TABLE [Tble_Rapprochement] (
    [Id_Rap]        Long Integer,
    [NumPeriode]    Long Integer,
    [Periode]       Text (255),
    [Compte]        Text (10),
    [SoldeCompta]   Double,
    [SoldeTresor]   Double
);

CREATE TABLE [Tble_Rapprochement2] (
    [Id]            Long Integer,
    [Id_Rap]        Long Integer,
    [Libelle]       Text (255),
    [DebitCompta]   Double,
    [CreditCompta]  Double,
    [DebitTresor]   Double,
    [CreditTresor]  Double
);

CREATE TABLE [Tble_PourEtatRapproche] (
    [Id]            Long Integer,
    [Libelle]       Text (255),
    [DebitCompta]   Double,
    [CreditCompta]  Double,
    [DebitTresor]   Double,
    [CreditTresor]  Double
);

CREATE TABLE [Tble_ConfrontationSolde] (
    [Compte]        Text (10),
    [Libelle]       Text (255),
    [SoldeCompta]   Double,
    [SoldeTresor]   Double,
    [Ecart]         Double,
    [Explication]   Text (255)
);

CREATE TABLE [Tble_GestSolde] (
    [Cible]     Text (20),
    [Ecart]     Double,
    [Type]      Text (10)
);

-- ============================================================
-- 16. ARRÊTÉ DE COMPTES / CLÔTURE
-- ============================================================

CREATE TABLE [Tble_Arret_Mois] (
    [Id_1]      Long Integer,
    [Periode]   Long Integer
);

CREATE TABLE [Tble_ChoixMethodeRec] (
    [N°]            Long Integer NOT NULL,
    [ChoixMethode]  Long Integer  -- Réf. Tble_MethodeRecette.Id
);

CREATE TABLE [Tble_Date] (
    [C_Date] DateTime
);

CREATE TABLE [Pour_Arret_PasCompta] (
    [Libelle]   Text (255),
    [Debit]     Long Integer,
    [Credit]    Long Integer
);

CREATE TABLE [Pour_Arret_PasTresor] (
    [Libelle]   Text (255),
    [Debit]     Long Integer,
    [Credit]    Long Integer
);

-- ============================================================
-- 17. SAISIE (tables de travail transitoires)
-- ============================================================

CREATE TABLE [Tble_Saisie] (
    [Num_Titre]     Long Integer,
    [Debit]         Text (5) NOT NULL,
    [Credit]        Text (5) NOT NULL,
    [Montant]       Double NOT NULL,
    [Objet]         Text (255),
    [Benef]         Text (50)
);

-- AJOUT CIRCULAIRE 2026000631 : modèles d'écritures opération d'ordre comptes 121/122
-- Phase 1 : Affectation résultat ordinaire reporté → résultat affecté (D/121 → C/122)
--           Conforme circulaire 2026000631 : Débit 121 contre Crédit 122
INSERT INTO [Tble_Saisie] ([Num_Titre],[Debit],[Credit],[Montant],[Objet],[Benef])
VALUES (0,'121','122',0,'Affectation résultat fonctionnement Phase 1 (D/121-C/122)','Opération ordre budgétaire');
-- Phase 2 : Virement résultat affecté vers investissement (Débit 122 / Crédit 111)
INSERT INTO [Tble_Saisie] ([Num_Titre],[Debit],[Credit],[Montant],[Objet],[Benef])
VALUES (0,'122','111',0,'Affectation résultat fonctionnement Phase 2 (D/122-C/111)','Opération ordre budgétaire');

CREATE TABLE [Tble_SaisieRecette] (
    [Debit]         Text (5) NOT NULL,
    [Credit]        Text (5) NOT NULL,
    [Objet]         Text (255) NOT NULL,
    [Redevable]     Text (255) NOT NULL,
    [Montant]       Double NOT NULL
);

-- ============================================================
-- 18. IMPORT ATCO / INTERFACE EXTERNE
-- ============================================================

CREATE TABLE [Atco_Import] (
    [Bordereau]     Long Integer,
    [Mandat]        Long Integer,
    [NatureDepense] Text (255),
    [Beneficiaire]  Text (255),
    [Compte]        Text (255),
    [Fonds_Propres] Currency,
    [Fonds_Externes] Currency,
    [Montant_Total] Currency,
    [Financement]   Text (255)
);

-- ============================================================
-- 19. INTERFACE RUBAN ACCESS (UI)
-- ============================================================

CREATE TABLE [USysRibbons] (
    [ID]            Long Integer,
    [RibbonName]    Text (255),
    [RibbonXml]     Memo
);
-- Ruban 1 : "ComptaRuban" - Masque l'interface standard Access (sécurité UI)
INSERT INTO [USysRibbons] ([ID],[RibbonName],[RibbonXml]) VALUES (2,'ComptaRuban',
'<customUI xmlns="http://schemas.microsoft.com/office/2009/07/customui">
  <commands>
    <command idMso="ApplicationOptionsDialog" enabled="false"/>
    <command idMso="TabHomeAccess " enabled="false"/>
  </commands>
  <ribbon startFromScratch="true"></ribbon>
  <backstage>
    <tab idMso="TabPrint" visible="false"/>
    <button idMso="ApplicationOptionsDialog" visible="false"/>
    <button idMso="FileExit" visible="false"/>
  </backstage>
</customUI>');
-- Ruban 2 : "CpteRub" - Ruban contextuel états avec boutons Imprimer/PDF/Fermer/Aide
INSERT INTO [USysRibbons] ([ID],[RibbonName],[RibbonXml]) VALUES (3,'CpteRub',
'<customUI xmlns="http://schemas.microsoft.com/office/2009/07/customui">
  <ribbon startFromScratch="true">
    <contextualTabs>
      <tabSet idMso="TabSetFormReportExtensibility">
        <tab id="tab1" label="Compta-ct-bf 2026">
          <group id="group1">
            <button label="Imprimer_etat" onAction="MacroImprim" imageMso="FilePrint" id="button1" size="large"/>
            <button label="Version_PDF_etat" imageMso="PublishToPdfOrEdoc" id="button2" onAction="MacroPdf" size="large"/>
            <button id="FermerEtat" label="Fermer_etat" imageMso="PrintPreviewClose" onAction="FermerEtat" size="large"/>
            <button id="button4" label="Aide" imageMso="Help" size="large" onAction="BaseAide"/>
          </group>
        </tab>
      </tabSet>
    </contextualTabs>
  </ribbon>
</customUI>');

