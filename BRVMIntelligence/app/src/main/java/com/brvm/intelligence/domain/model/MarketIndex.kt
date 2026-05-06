package com.brvm.intelligence.domain.model

import java.time.LocalDateTime

/** Indices boursiers BRVM */
data class MarketIndex(
    val name: String,                   // "BRVM Composite" ou "BRVM 10"
    val value: Double,
    val change: Double,
    val changePercent: Double,
    val totalVolume: Long,              // Volume total journalier
    val totalMarketCap: Long,           // Capitalisation totale en FCFA
    val numberOfTransactions: Int,
    val lastUpdate: LocalDateTime
)

/** Résumé du marché pour le dashboard */
data class MarketSummary(
    val brvmComposite: MarketIndex,
    val brvmTen: MarketIndex,
    val topGainers: List<Stock>,        // 5 meilleures hausses
    val topLosers: List<Stock>,         // 5 plus fortes baisses
    val mostActive: List<Stock>,        // 5 titres les plus actifs
    val marketStatus: MarketStatus,
    val lastUpdate: LocalDateTime
)

enum class MarketStatus(val displayName: String) {
    PRE_OPENING("Pré-ouverture"),
    OPEN("Ouvert"),
    CLOSING("Clôture en cours"),
    CLOSED("Fermé"),
    SUSPENDED("Suspendu")
}

/** Données pour le chat IA */
data class ChatMessage(
    val id: Long = 0,
    val content: String,
    val role: MessageRole,
    val timestamp: Long = System.currentTimeMillis(),
    val relatedSymbols: List<String> = emptyList()
)

enum class MessageRole { USER, ASSISTANT }

/** Configuration des alertes personnalisables */
data class PriceAlert(
    val id: Long = 0,
    val symbol: String,
    val alertType: AlertType,
    val targetPrice: Double,
    val isActive: Boolean = true,
    val notifyAbove: Boolean = true
)

enum class AlertType(val displayName: String) {
    PRICE_TARGET("Prix cible atteint"),
    PERCENT_CHANGE("Variation en pourcentage"),
    RSI_THRESHOLD("Seuil RSI"),
    VOLUME_SPIKE("Pic de volume"),
    TECHNICAL_SIGNAL("Signal technique")
}
