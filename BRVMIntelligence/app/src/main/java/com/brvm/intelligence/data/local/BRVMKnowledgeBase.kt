package com.brvm.intelligence.data.local

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Base de données fondamentales statique pour les 47 titres BRVM.
 * Sources : rapports annuels publiés, AMF-UMOA, SikaFinance, brvm.org (2022-2024).
 * Les PER et rendements sont des estimations — ils évoluent chaque exercice.
 */
@Singleton
class BRVMKnowledgeBase @Inject constructor() {

    fun getProfile(symbol: String): CompanyProfile? = profiles[symbol]

    fun getEstimatedPer(symbol: String): Double? = profiles[symbol]?.estimatedPer

    fun getEstimatedDividendYield(symbol: String): Double? = profiles[symbol]?.estimatedDividendYield

    fun getAllProfiles(): Map<String, CompanyProfile> = profiles

    private val profiles: Map<String, CompanyProfile> = mapOf(

        // ── Finance ──────────────────────────────────────────────────────────
        "ABJC" to CompanyProfile(
            symbol = "ABJC", fullName = "Servair Abidjan",
            sector = "Services", country = "Côte d'Ivoire",
            activity = "Restauration aérienne et services au sol à l'aéroport Félix Houphouët-Boigny",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Titre très peu liquide. Fortement lié au trafic aérien."
        ),
        "BICB" to CompanyProfile(
            symbol = "BICB", fullName = "Banque Internationale pour le Commerce et l'Industrie du Burkina",
            sector = "Finance", country = "Burkina Faso",
            activity = "Banque commerciale, crédits aux entreprises et particuliers",
            estimatedPer = 9.0, estimatedDividendYield = 4.0, perAsOf = "2023"
        ),
        "BICC" to CompanyProfile(
            symbol = "BICC", fullName = "Banque Internationale pour le Commerce et l'Industrie de Côte d'Ivoire",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Banque commerciale, filiale du groupe BNP Paribas",
            estimatedPer = 8.5, estimatedDividendYield = 4.5, perAsOf = "2023"
        ),
        "BNBC" to CompanyProfile(
            symbol = "BNBC", fullName = "Banque Nationale de Bénin",
            sector = "Finance", country = "Bénin",
            activity = "Banque commerciale, financement de l'économie béninoise",
            estimatedPer = 10.0, estimatedDividendYield = 4.0, perAsOf = "2022"
        ),
        "BOAB" to CompanyProfile(
            symbol = "BOAB", fullName = "Bank of Africa Bénin",
            sector = "Finance", country = "Bénin",
            activity = "Banque commerciale, groupe Bank of Africa (BMCE Bank)",
            estimatedPer = 8.0, estimatedDividendYield = 5.0, perAsOf = "2023"
        ),
        "BOABF" to CompanyProfile(
            symbol = "BOABF", fullName = "Bank of Africa Burkina Faso",
            sector = "Finance", country = "Burkina Faso",
            activity = "Banque commerciale, groupe Bank of Africa",
            estimatedPer = 8.5, estimatedDividendYield = 4.5, perAsOf = "2023"
        ),
        "BOAC" to CompanyProfile(
            symbol = "BOAC", fullName = "Bank of Africa Côte d'Ivoire",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Banque commerciale, groupe Bank of Africa",
            estimatedPer = 7.5, estimatedDividendYield = 3.5, perAsOf = "2023"
        ),
        "BOAM" to CompanyProfile(
            symbol = "BOAM", fullName = "Bank of Africa Mali",
            sector = "Finance", country = "Mali",
            activity = "Banque commerciale, groupe Bank of Africa",
            estimatedPer = 8.0, estimatedDividendYield = 4.0, perAsOf = "2022"
        ),
        "BOAN" to CompanyProfile(
            symbol = "BOAN", fullName = "Bank of Africa Niger",
            sector = "Finance", country = "Niger",
            activity = "Banque commerciale, groupe Bank of Africa",
            estimatedPer = 9.0, estimatedDividendYield = 4.5, perAsOf = "2022"
        ),
        "BOAS" to CompanyProfile(
            symbol = "BOAS", fullName = "Bank of Africa Sénégal",
            sector = "Finance", country = "Sénégal",
            activity = "Banque commerciale, groupe Bank of Africa",
            estimatedPer = 8.5, estimatedDividendYield = 4.0, perAsOf = "2023"
        ),
        "CABC" to CompanyProfile(
            symbol = "CABC", fullName = "Caisse d'Épargne et de Crédit du Bénin",
            sector = "Finance", country = "Bénin",
            activity = "Institution financière de microfinance et épargne",
            estimatedPer = 10.0, estimatedDividendYield = 3.5, perAsOf = "2022"
        ),
        "CBIBF" to CompanyProfile(
            symbol = "CBIBF", fullName = "Caisse de Bénin pour l'Industrie et le Bâtiment",
            sector = "Finance", country = "Burkina Faso",
            activity = "Institution financière spécialisée dans le financement de l'industrie et la construction",
            estimatedPer = 11.0, estimatedDividendYield = 3.0, perAsOf = "2022"
        ),
        "ETIT" to CompanyProfile(
            symbol = "ETIT", fullName = "Ecobank Transnational Incorporated",
            sector = "Finance", country = "Togo",
            activity = "Holding bancaire panafricaine présente dans 35 pays africains",
            estimatedPer = 7.0, estimatedDividendYield = 2.5, perAsOf = "2023",
            notes = "Titre le plus liquide de la BRVM. Grande capitalisation panafricaine."
        ),
        "FTSC" to CompanyProfile(
            symbol = "FTSC", fullName = "Filature, Tissage, Couture",
            sector = "Industrie", country = "Côte d'Ivoire",
            activity = "Industrie textile, fabrication et commercialisation de textiles",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Titre très peu liquide."
        ),
        "LNBB" to CompanyProfile(
            symbol = "LNBB", fullName = "La Nigérienne de Banque",
            sector = "Finance", country = "Niger",
            activity = "Banque commerciale au Niger",
            estimatedPer = 10.0, estimatedDividendYield = 4.0, perAsOf = "2022"
        ),
        "NEIC" to CompanyProfile(
            symbol = "NEIC", fullName = "NEI-CEDA",
            sector = "Distribution", country = "Côte d'Ivoire",
            activity = "Librairie et vente de matériel scolaire, bureau en Côte d'Ivoire",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Très faible liquidité."
        ),
        "NSBC" to CompanyProfile(
            symbol = "NSBC", fullName = "NSIA Banque Côte d'Ivoire",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Banque commerciale, groupe NSIA (assurance et finance)",
            estimatedPer = 9.0, estimatedDividendYield = 4.0, perAsOf = "2023"
        ),
        "NTLC" to CompanyProfile(
            symbol = "NTLC", fullName = "NSIA Technologies",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Assurance et services financiers numériques, groupe NSIA",
            estimatedPer = 10.0, estimatedDividendYield = 3.5, perAsOf = "2022"
        ),
        "ONTBF" to CompanyProfile(
            symbol = "ONTBF", fullName = "Office National des Télécommunications du Burkina Faso",
            sector = "Télécommunications", country = "Burkina Faso",
            activity = "Opérateur télécom historique du Burkina (Orange BF), fixe et mobile",
            estimatedPer = 11.0, estimatedDividendYield = 5.5, perAsOf = "2023",
            notes = "Bon rendement dividende, partiellement détenu par l'État burkinabè."
        ),
        "ORAC" to CompanyProfile(
            symbol = "ORAC", fullName = "Orange Côte d'Ivoire",
            sector = "Télécommunications", country = "Côte d'Ivoire",
            activity = "Opérateur télécom leader en Côte d'Ivoire (mobile, data, money)",
            estimatedPer = 12.0, estimatedDividendYield = 5.0, perAsOf = "2023",
            notes = "Filiale d'Orange SA, forte croissance Mobile Money."
        ),
        "ORGT" to CompanyProfile(
            symbol = "ORGT", fullName = "Orange Togo",
            sector = "Télécommunications", country = "Togo",
            activity = "Opérateur télécom au Togo, filiale Orange SA",
            estimatedPer = 11.5, estimatedDividendYield = 4.5, perAsOf = "2022"
        ),
        "PALC" to CompanyProfile(
            symbol = "PALC", fullName = "PalmCI",
            sector = "Agriculture", country = "Côte d'Ivoire",
            activity = "Plantation et transformation d'huile de palme, filiale SIFCA",
            estimatedPer = 11.0, estimatedDividendYield = 4.0, perAsOf = "2023",
            notes = "Corrélé au cours mondial de l'huile de palme."
        ),
        "PRSC" to CompanyProfile(
            symbol = "PRSC", fullName = "Prestige Assurances",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Compagnie d'assurance vie et dommages",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Titre peu liquide."
        ),
        "SAFC" to CompanyProfile(
            symbol = "SAFC", fullName = "SAFCA (Société Africaine de Cacao)",
            sector = "Agriculture", country = "Côte d'Ivoire",
            activity = "Transformation et négoce de cacao, filière cacao ivoirienne",
            estimatedPer = 12.0, estimatedDividendYield = 3.0, perAsOf = "2023",
            notes = "Exposé au cours mondial du cacao."
        ),
        "SCRC" to CompanyProfile(
            symbol = "SCRC", fullName = "Sucrivoire",
            sector = "Agriculture", country = "Côte d'Ivoire",
            activity = "Production et transformation de sucre de canne en Côte d'Ivoire",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Résultats très variables selon la récolte."
        ),
        "SDCC" to CompanyProfile(
            symbol = "SDCC", fullName = "Société de Distribution de l'Eau de Côte d'Ivoire (SODECI)",
            sector = "Services Publics", country = "Côte d'Ivoire",
            activity = "Distribution d'eau potable en Côte d'Ivoire, concessionnaire d'État",
            estimatedPer = 9.0, estimatedDividendYield = 5.5, perAsOf = "2023",
            notes = "Revenu réglementé, dividende stable. Filiale ERANOVE."
        ),
        "SDSC" to CompanyProfile(
            symbol = "SDSC", fullName = "SODE (Société de Distribution d'Eau du Sénégal)",
            sector = "Services Publics", country = "Sénégal",
            activity = "Distribution d'eau potable au Sénégal",
            estimatedPer = 9.5, estimatedDividendYield = 5.0, perAsOf = "2022"
        ),
        "SEMC" to CompanyProfile(
            symbol = "SEMC", fullName = "Crown Siem Côte d'Ivoire",
            sector = "Industrie", country = "Côte d'Ivoire",
            activity = "Fabrication de couronnes et boîtes métalliques, emballages industriels",
            estimatedPer = 10.0, estimatedDividendYield = 4.0, perAsOf = "2022"
        ),
        "SGBC" to CompanyProfile(
            symbol = "SGBC", fullName = "Société Générale de Banques en Côte d'Ivoire",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Banque commerciale et d'investissement, filiale Société Générale France",
            estimatedPer = 9.0, estimatedDividendYield = 4.5, perAsOf = "2023",
            notes = "Une des plus grandes capitalisations bancaires de la BRVM."
        ),
        "SHEC" to CompanyProfile(
            symbol = "SHEC", fullName = "Société des Huiles de Côte d'Ivoire",
            sector = "Agriculture", country = "Côte d'Ivoire",
            activity = "Production et commercialisation d'huiles végétales",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Titre peu liquide."
        ),
        "SIBC" to CompanyProfile(
            symbol = "SIBC", fullName = "Société Ivoirienne de Banque",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Banque commerciale, filiale Attijariwafa Bank",
            estimatedPer = 8.0, estimatedDividendYield = 4.0, perAsOf = "2023"
        ),
        "SICC" to CompanyProfile(
            symbol = "SICC", fullName = "SICOGI (Société Ivoirienne de Construction et de Gestion Immobilière)",
            sector = "Industrie", country = "Côte d'Ivoire",
            activity = "Promotion immobilière et gestion de patrimoine immobilier",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Titre très peu liquide."
        ),
        "SIVC" to CompanyProfile(
            symbol = "SIVC", fullName = "SIR (Société Ivoirienne de Raffinage)",
            sector = "Industrie", country = "Côte d'Ivoire",
            activity = "Raffinage de pétrole brut, seule raffinerie de Côte d'Ivoire",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "PER très volatil selon le prix du brut et les marges de raffinage."
        ),
        "SLBC" to CompanyProfile(
            symbol = "SLBC", fullName = "Société Laitière du Burkina",
            sector = "Agriculture", country = "Burkina Faso",
            activity = "Production et commercialisation de produits laitiers au Burkina Faso",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Faible liquidité."
        ),
        "SMBC" to CompanyProfile(
            symbol = "SMBC", fullName = "Société Malienne de Boissons et Conserves",
            sector = "Agriculture", country = "Mali",
            activity = "Fabrication de boissons et agroalimentaire au Mali",
            estimatedPer = null, estimatedDividendYield = null,
            notes = "Faible liquidité."
        ),
        "SNTS" to CompanyProfile(
            symbol = "SNTS", fullName = "Sonatel (Société Nationale des Télécommunications du Sénégal)",
            sector = "Télécommunications", country = "Sénégal",
            activity = "Opérateur télécom historique au Sénégal, filiale Orange SA. Mobile, fixe, internet, Orange Money",
            estimatedPer = 14.0, estimatedDividendYield = 6.5, perAsOf = "2023",
            notes = "Titre très liquide, grand dividende, référence de la BRVM. Présent au Sénégal, Mali, Guinée, Sierra Leone, Guinée-Bissau."
        ),
        "SOGC" to CompanyProfile(
            symbol = "SOGC", fullName = "SOGB (Société des Caoutchoucs de Grand-Béréby)",
            sector = "Agriculture", country = "Côte d'Ivoire",
            activity = "Plantation et transformation d'hévéa (caoutchouc naturel)",
            estimatedPer = 9.0, estimatedDividendYield = 5.0, perAsOf = "2023",
            notes = "Corrélé au prix mondial du caoutchouc."
        ),
        "SPHC" to CompanyProfile(
            symbol = "SPHC", fullName = "SIPH (Société Internationale de Plantations d'Hévéas)",
            sector = "Agriculture", country = "Côte d'Ivoire",
            activity = "Holding de plantations d'hévéas en Afrique de l'Ouest (CI, Ghana, Liberia, Nigeria)",
            estimatedPer = 10.0, estimatedDividendYield = 4.0, perAsOf = "2023"
        ),
        "STAC" to CompanyProfile(
            symbol = "STAC", fullName = "SITAB (Société Ivoirienne de Tabacs)",
            sector = "Industrie", country = "Côte d'Ivoire",
            activity = "Fabrication et commercialisation de cigarettes en Côte d'Ivoire, filiale BAT",
            estimatedPer = 11.0, estimatedDividendYield = 5.0, perAsOf = "2023",
            notes = "Bon générateur de cash, dividende régulier."
        ),
        "STBC" to CompanyProfile(
            symbol = "STBC", fullName = "Standard Chartered Bank Côte d'Ivoire",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Banque d'affaires internationale, financement corporate",
            estimatedPer = 10.0, estimatedDividendYield = 3.5, perAsOf = "2022"
        ),
        "TTLC" to CompanyProfile(
            symbol = "TTLC", fullName = "Total Côte d'Ivoire",
            sector = "Distribution", country = "Côte d'Ivoire",
            activity = "Distribution de carburants et lubrifiants, réseau de stations-service, filiale TotalEnergies",
            estimatedPer = 14.0, estimatedDividendYield = 5.0, perAsOf = "2023"
        ),
        "TTLS" to CompanyProfile(
            symbol = "TTLS", fullName = "Total Sénégal",
            sector = "Distribution", country = "Sénégal",
            activity = "Distribution de carburants et lubrifiants au Sénégal, filiale TotalEnergies",
            estimatedPer = 13.0, estimatedDividendYield = 4.5, perAsOf = "2023"
        ),
        "UNLC" to CompanyProfile(
            symbol = "UNLC", fullName = "Unilever Côte d'Ivoire",
            sector = "Distribution", country = "Côte d'Ivoire",
            activity = "Fabrication et vente de produits de grande consommation (Omo, Lipton, Knorr…)",
            estimatedPer = 18.0, estimatedDividendYield = 3.0, perAsOf = "2023",
            notes = "Prime de marque internationale, valorisation élevée vs secteur."
        ),
        "UNXC" to CompanyProfile(
            symbol = "UNXC", fullName = "Unilever Côte d'Ivoire (actions X)",
            sector = "Distribution", country = "Côte d'Ivoire",
            activity = "Certificats d'investissement Unilever CI",
            estimatedPer = 18.0, estimatedDividendYield = 3.0, perAsOf = "2023"
        ),
        "CFAC" to CompanyProfile(
            symbol = "CFAC", fullName = "CFAO Motors Côte d'Ivoire",
            sector = "Distribution", country = "Côte d'Ivoire",
            activity = "Distribution automobile et produits de grande consommation, groupe CFAO",
            estimatedPer = 13.0, estimatedDividendYield = 4.0, perAsOf = "2023"
        ),
        "CIEC" to CompanyProfile(
            symbol = "CIEC", fullName = "CIE (Compagnie Ivoirienne d'Électricité)",
            sector = "Services Publics", country = "Côte d'Ivoire",
            activity = "Distribution d'électricité en Côte d'Ivoire, concessionnaire de l'État",
            estimatedPer = 8.5, estimatedDividendYield = 6.0, perAsOf = "2023",
            notes = "Revenu régulé, dividende historiquement stable. Filiale ERANOVE."
        ),
        "ECOC" to CompanyProfile(
            symbol = "ECOC", fullName = "Ecobank Côte d'Ivoire",
            sector = "Finance", country = "Côte d'Ivoire",
            activity = "Banque commerciale, filiale Ecobank Transnational (ETI)",
            estimatedPer = 8.0, estimatedDividendYield = 3.5, perAsOf = "2023"
        ),
    )
}

data class CompanyProfile(
    val symbol: String,
    val fullName: String,
    val sector: String,
    val country: String,
    val activity: String,
    val estimatedPer: Double?,
    val estimatedDividendYield: Double?,
    val perAsOf: String? = null,
    val marketCapBillionFCFA: Double? = null,
    val notes: String? = null,
)
