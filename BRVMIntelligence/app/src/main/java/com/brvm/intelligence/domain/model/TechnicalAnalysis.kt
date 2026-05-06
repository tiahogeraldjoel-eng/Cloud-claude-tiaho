package com.brvm.intelligence.domain.model

/** Résultats complets de l'analyse technique pour une action */
data class TechnicalAnalysis(
    val symbol: String,
    val rsi: RSIData,
    val macd: MACDData,
    val bollingerBands: BollingerBandsData,
    val movingAverages: MovingAveragesData,
    val supportResistance: SupportResistanceData,
    val chartPatterns: List<ChartPattern>,
    val overallSignal: TradingSignal,
    val signalConfidence: Int,          // Score de confiance 0-100%
    val signalExplanation: String       // Explication en français
)

data class RSIData(
    val value: Double,                  // 0-100
    val signal: RSISignal,
    val period: Int = 14
) {
    enum class RSISignal { OVERSOLD, NEUTRAL, OVERBOUGHT }
}

data class MACDData(
    val macdLine: Double,
    val signalLine: Double,
    val histogram: Double,
    val signal: MACDSignal
) {
    enum class MACDSignal { BULLISH_CROSSOVER, BEARISH_CROSSOVER, BULLISH, BEARISH, NEUTRAL }
}

data class BollingerBandsData(
    val upperBand: Double,
    val middleBand: Double,             // Moyenne mobile 20 jours
    val lowerBand: Double,
    val currentPrice: Double,
    val bandWidth: Double,              // Indicateur de volatilité
    val signal: BBSignal
) {
    enum class BBSignal { NEAR_UPPER, NEAR_LOWER, SQUEEZE, EXPANSION, NEUTRAL }
}

data class MovingAveragesData(
    val ma20: Double,
    val ma50: Double,
    val ma200: Double,
    val currentPrice: Double,
    val trend: TrendDirection
)

data class SupportResistanceData(
    val supportLevels: List<Double>,     // Niveaux de support (prix plancher)
    val resistanceLevels: List<Double>,  // Niveaux de résistance (prix plafond)
    val nearestSupport: Double,
    val nearestResistance: Double
)

data class ChartPattern(
    val type: PatternType,
    val confidence: Int,                // 0-100
    val description: String,
    val implication: PatternImplication,
    val priceTarget: Double?
)

enum class PatternType(val displayName: String) {
    HEAD_AND_SHOULDERS("Épaule-Tête-Épaule"),
    INVERSE_HEAD_AND_SHOULDERS("Épaule-Tête-Épaule Inversé"),
    DOUBLE_TOP("Double Sommet"),
    DOUBLE_BOTTOM("Double Creux"),
    ASCENDING_TRIANGLE("Triangle Ascendant"),
    DESCENDING_TRIANGLE("Triangle Descendant"),
    SYMMETRICAL_TRIANGLE("Triangle Symétrique"),
    BULLISH_FLAG("Drapeau Haussier"),
    BEARISH_FLAG("Drapeau Baissier"),
    CUP_AND_HANDLE("Tasse avec Anse")
}

enum class PatternImplication { BULLISH, BEARISH, NEUTRAL }

enum class TrendDirection(val displayName: String) {
    STRONG_UPTREND("Tendance haussière forte"),
    UPTREND("Tendance haussière"),
    SIDEWAYS("Consolidation"),
    DOWNTREND("Tendance baissière"),
    STRONG_DOWNTREND("Tendance baissière forte")
}

enum class TradingSignal(val displayName: String, val color: Long) {
    STRONG_BUY("Achat Fort", 0xFF1B8A5A),
    BUY("Achat", 0xFF4CAF87),
    NEUTRAL("Neutre", 0xFF9E9E9E),
    SELL("Vente", 0xFFFF7043),
    STRONG_SELL("Vente Forte", 0xFFE53935)
}
