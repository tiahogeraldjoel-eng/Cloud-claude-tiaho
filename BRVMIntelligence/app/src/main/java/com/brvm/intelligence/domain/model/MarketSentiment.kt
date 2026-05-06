package com.brvm.intelligence.domain.model

import java.time.LocalDate

/**
 * Indice Fear & Greed adapté à la BRVM.
 * Tient compte des spécificités du marché UEMOA :
 * - Faible liquidité structurelle
 * - Influence du marché parisien (CAC40)
 * - Cycles des matières premières (cacao, coton, or)
 * - Politique monétaire BCEAO / taux CFA
 */
data class MarketSentiment(
    val fearGreedIndex: Int,           // 0 (Peur Extrême) à 100 (Avidité Extrême)
    val fearGreedLabel: FearGreedLevel,
    val smartMoneyFlow: SmartMoneySignal,
    val retailSentiment: RetailSentiment,
    val volumeRatio: Double,           // Ratio volume acheteur/vendeur
    val seasonalBias: SeasonalBias,
    val macroEnvironment: MacroEnvironment,
    val panicSellDetected: Boolean,
    val euphoriaDetected: Boolean,
    val manipulationAlert: ManipulationAlert?,
    val date: LocalDate
)

enum class FearGreedLevel(
    val displayName: String,
    val range: IntRange,
    val description: String
) {
    EXTREME_FEAR("Peur Extrême", 0..20,
        "Les investisseurs paniquent. Opportunité potentielle d'achat à contre-courant."),
    FEAR("Peur", 21..40,
        "Sentiment négatif dominant. Prudence mais surveillance des opportunités."),
    NEUTRAL("Neutre", 41..60,
        "Marché équilibré. Sélection prudente des titres recommandée."),
    GREED("Avidité", 61..80,
        "Optimisme élevé. Attention aux valorisations excessives."),
    EXTREME_GREED("Avidité Extrême", 81..100,
        "Euphorie de marché. Risque de correction important. Sécuriser les gains.")
}

enum class SmartMoneySignal {
    STRONG_BUYING,   // Les institutionnels achètent massivement
    BUYING,
    NEUTRAL,
    SELLING,
    STRONG_SELLING   // Les institutionnels se désengagent
}

enum class RetailSentiment { BULLISH, NEUTRAL, BEARISH }

data class SeasonalBias(
    val currentBias: SeasonalEffect,
    val description: String,
    val historicalSuccessRate: Double  // % historique de succès de cet effet saisonnier
)

enum class SeasonalEffect(val displayName: String) {
    DIVIDEND_SEASON("Saison des dividendes (janv-mars) - Effet haussier"),
    PRE_RESULTS("Avant-résultats semestriels - Volatilité accrue"),
    YEAR_END("Fin d'année - Rééquilibrage des portefeuilles"),
    SUMMER_LULL("Ralentissement estival - Volume faible"),
    NEUTRAL("Période neutre")
}

data class MacroEnvironment(
    val bcaoRateImpact: RateImpact,     // Taux directeur BCEAO
    val cac40Correlation: Double,        // Corrélation avec le CAC40 (0 à 1)
    val cocoaPriceImpact: Double,        // Impact prix cacao sur les agroindustriels
    val goldPriceImpact: Double,         // Impact or (mines cotées)
    val oilPriceImpact: Double,          // Impact pétrole (distribution, transport)
    val diasporaRemittanceEffect: String // Impact des transferts diaspora
)

enum class RateImpact { VERY_RESTRICTIVE, RESTRICTIVE, NEUTRAL, ACCOMMODATIVE, VERY_ACCOMMODATIVE }

data class ManipulationAlert(
    val symbol: String,
    val alertType: ManipulationType,
    val severity: AlertSeverity,
    val description: String
)

enum class ManipulationType {
    ABNORMAL_VOLUME,        // Volume anormalement élevé sans justification
    PRICE_SPIKE,            // Hausse/baisse soudaine sans news
    SPREAD_ANOMALY,         // Écart achat/vente anormal (faible liquidité BRVM)
    CIRCULAR_TRADING        // Transactions circulaires suspectées
}

enum class AlertSeverity { LOW, MEDIUM, HIGH, CRITICAL }
