package com.brvm.alerte.domain.model

data class TechnicalIndicators(
    val ticker: String, val rsi14: Double, val macdLine: Double, val macdSignal: Double,
    val macdHistogram: Double, val bollingerUpper: Double, val bollingerMiddle: Double,
    val bollingerLower: Double, val sma20: Double, val sma50: Double, val sma200: Double,
    val ema12: Double, val ema26: Double, val atr14: Double,
    val stochasticK: Double, val stochasticD: Double, val adx14: Double,
    val obv: Double, val moneyFlowIndex: Double
) {
    val isBullishMACD: Boolean get() = macdLine > macdSignal
    val isOversold: Boolean get() = rsi14 < 30
    val isOverbought: Boolean get() = rsi14 > 70
    val isBelowBollingerLower: Boolean get() = false
    val isGoldenCross: Boolean get() = sma50 > sma200
    val isDeathCross: Boolean get() = sma50 < sma200
    val isTrendStrong: Boolean get() = adx14 > 25
    val isBullishStochastic: Boolean get() = stochasticK > stochasticD && stochasticK < 80
}

data class MarketSentiment(
    val fearGreedIndex: Int, val label: SentimentLabel,
    val advancingStocks: Int, val decliningStocks: Int, val unchangedStocks: Int,
    val totalVolume: Long, val marketBreadth: Double, val updatedAt: Long
) {
    enum class SentimentLabel { EXTREME_FEAR, FEAR, NEUTRAL, GREED, EXTREME_GREED }
}
