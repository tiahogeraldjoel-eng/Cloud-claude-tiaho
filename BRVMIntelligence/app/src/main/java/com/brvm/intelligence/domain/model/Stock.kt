package com.brvm.intelligence.domain.model

import java.time.LocalDateTime

/**
 * Modèle de domaine représentant une action cotée sur la BRVM.
 * Toutes les valeurs monétaires sont en FCFA (Franc CFA UEMOA).
 */
data class Stock(
    val symbol: String,           // Ex: "SONR-CI", "SGBCI", "ONTBF"
    val name: String,             // Dénomination complète
    val sector: BRVMSector,
    val country: BRVMCountry,
    val currentPrice: Double,     // Prix en FCFA
    val previousClose: Double,
    val change: Double,           // Variation absolue
    val changePercent: Double,    // Variation en %
    val volume: Long,             // Nombre de titres échangés
    val marketCap: Long,          // Capitalisation en FCFA
    val per: Double?,             // Price-to-Earnings Ratio
    val dividendYield: Double?,   // Rendement du dividende en %
    val high52Week: Double,       // Plus haut 52 semaines
    val low52Week: Double,        // Plus bas 52 semaines
    val openPrice: Double,
    val highPrice: Double,
    val lowPrice: Double,
    val lastUpdate: LocalDateTime,
    val isActive: Boolean = true,
    val liquidityLevel: LiquidityLevel = LiquidityLevel.MEDIUM
)

enum class BRVMSector(val displayName: String) {
    FINANCE("Finance"),
    INDUSTRIE("Industrie"),
    DISTRIBUTION("Distribution"),
    AGRICULTURE("Agriculture"),
    TRANSPORT("Transport"),
    SERVICES_PUBLICS("Services Publics"),
    AUTRES("Autres")
}

enum class BRVMCountry(val displayName: String, val code: String) {
    COTE_IVOIRE("Côte d'Ivoire", "CI"),
    SENEGAL("Sénégal", "SN"),
    BURKINA_FASO("Burkina Faso", "BF"),
    TOGO("Togo", "TG"),
    MALI("Mali", "ML"),
    BENIN("Bénin", "BJ"),
    GUINEE_BISSAU("Guinée-Bissau", "GW"),
    NIGER("Niger", "NE")
}

enum class LiquidityLevel(val displayName: String, val warningMessage: String?) {
    HIGH("Liquidité élevée", null),
    MEDIUM("Liquidité normale", null),
    LOW("Faible liquidité", "Ce titre présente une faible liquidité. La revente peut être difficile."),
    VERY_LOW("Très faible liquidité", "ATTENTION : Titre très peu liquide. Risque de blocage de position important.")
}
