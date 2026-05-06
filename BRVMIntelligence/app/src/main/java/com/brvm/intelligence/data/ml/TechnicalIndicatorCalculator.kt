package com.brvm.intelligence.data.ml

import com.brvm.intelligence.domain.model.*
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Calcul de tous les indicateurs techniques pour les actions BRVM.
 * Adapté aux spécificités du marché : faible liquidité, volumes irréguliers.
 */
@Singleton
class TechnicalIndicatorCalculator @Inject constructor() {

    /** Analyse technique complète à partir de l'historique des prix */
    fun analyze(symbol: String, priceHistory: PriceHistory): TechnicalAnalysis {
        val prices = priceHistory.prices
        if (prices.size < 20) {
            return buildInsufficientDataAnalysis(symbol)
        }

        val closes = prices.map { it.close }
        val volumes = prices.map { it.volume }

        val rsi = calculateRSI(closes)
        val macd = calculateMACD(closes)
        val bb = calculateBollingerBands(closes)
        val mas = calculateMovingAverages(closes)
        val sr = calculateSupportResistance(prices)
        val patterns = detectChartPatterns(prices)
        val (signal, confidence) = determineOverallSignal(rsi, macd, bb, mas, patterns)
        val explanation = generateExplanation(signal, confidence, rsi, macd, mas, patterns)

        return TechnicalAnalysis(
            symbol = symbol,
            rsi = rsi,
            macd = macd,
            bollingerBands = bb,
            movingAverages = mas,
            supportResistance = sr,
            chartPatterns = patterns,
            overallSignal = signal,
            signalConfidence = confidence,
            signalExplanation = explanation
        )
    }

    // --- RSI (Relative Strength Index) ---

    fun calculateRSI(closes: List<Double>, period: Int = 14): RSIData {
        if (closes.size < period + 1) return RSIData(50.0, RSIData.RSISignal.NEUTRAL, period)

        val changes = closes.zipWithNext { a, b -> b - a }
        val gains = changes.map { if (it > 0) it else 0.0 }
        val losses = changes.map { if (it < 0) abs(it) else 0.0 }

        var avgGain = gains.take(period).average()
        var avgLoss = losses.take(period).average()

        // EMA lissée de Wilder pour les valeurs suivantes
        for (i in period until changes.size) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period
        }

        val rsi = if (avgLoss == 0.0) 100.0 else 100.0 - (100.0 / (1.0 + avgGain / avgLoss))
        val signal = when {
            rsi < 30 -> RSIData.RSISignal.OVERSOLD
            rsi > 70 -> RSIData.RSISignal.OVERBOUGHT
            else -> RSIData.RSISignal.NEUTRAL
        }
        return RSIData(rsi.coerceIn(0.0, 100.0), signal, period)
    }

    // --- MACD ---

    fun calculateMACD(closes: List<Double>, fast: Int = 12, slow: Int = 26, signal: Int = 9): MACDData {
        if (closes.size < slow + signal) {
            return MACDData(0.0, 0.0, 0.0, MACDData.MACDSignal.NEUTRAL)
        }
        val ema12 = calculateEMA(closes, fast)
        val ema26 = calculateEMA(closes, slow)
        val macdLine = ema12 - ema26

        // Signal line = EMA(9) de la ligne MACD
        val macdHistory = closes.indices.drop(slow - 1).map { i ->
            calculateEMA(closes.take(i + 1), fast) - calculateEMA(closes.take(i + 1), slow)
        }
        val signalLine = calculateEMA(macdHistory, signal)
        val histogram = macdLine - signalLine

        val prevMacdHistory = if (macdHistory.size > 1) macdHistory[macdHistory.size - 2] else macdLine
        val prevSignalLine = if (macdHistory.size > 1)
            calculateEMA(macdHistory.dropLast(1), signal) else signalLine

        val macdSignal = when {
            macdLine > signalLine && prevMacdHistory <= prevSignalLine -> MACDData.MACDSignal.BULLISH_CROSSOVER
            macdLine < signalLine && prevMacdHistory >= prevSignalLine -> MACDData.MACDSignal.BEARISH_CROSSOVER
            macdLine > 0 && signalLine > 0 -> MACDData.MACDSignal.BULLISH
            macdLine < 0 && signalLine < 0 -> MACDData.MACDSignal.BEARISH
            else -> MACDData.MACDSignal.NEUTRAL
        }
        return MACDData(macdLine, signalLine, histogram, macdSignal)
    }

    // --- Bollinger Bands ---

    fun calculateBollingerBands(closes: List<Double>, period: Int = 20, multiplier: Double = 2.0): BollingerBandsData {
        if (closes.size < period) {
            val last = closes.lastOrNull() ?: 0.0
            return BollingerBandsData(last, last, last, last, 0.0, BollingerBandsData.BBSignal.NEUTRAL)
        }
        val recentCloses = closes.takeLast(period)
        val sma = recentCloses.average()
        val stdDev = sqrt(recentCloses.map { (it - sma) * (it - sma) }.average())
        val upper = sma + multiplier * stdDev
        val lower = sma - multiplier * stdDev
        val currentPrice = closes.last()
        val bandWidth = if (sma > 0) ((upper - lower) / sma) * 100 else 0.0

        val bbSignal = when {
            currentPrice >= upper * 0.98 -> BollingerBandsData.BBSignal.NEAR_UPPER
            currentPrice <= lower * 1.02 -> BollingerBandsData.BBSignal.NEAR_LOWER
            bandWidth < 5.0 -> BollingerBandsData.BBSignal.SQUEEZE
            bandWidth > 20.0 -> BollingerBandsData.BBSignal.EXPANSION
            else -> BollingerBandsData.BBSignal.NEUTRAL
        }
        return BollingerBandsData(upper, sma, lower, currentPrice, bandWidth, bbSignal)
    }

    // --- Moyennes Mobiles ---

    fun calculateMovingAverages(closes: List<Double>): MovingAveragesData {
        val currentPrice = closes.lastOrNull() ?: 0.0
        val ma20 = if (closes.size >= 20) closes.takeLast(20).average() else currentPrice
        val ma50 = if (closes.size >= 50) closes.takeLast(50).average() else currentPrice
        val ma200 = if (closes.size >= 200) closes.takeLast(200).average() else currentPrice

        val trend = when {
            currentPrice > ma20 && ma20 > ma50 && ma50 > ma200 -> TrendDirection.STRONG_UPTREND
            currentPrice > ma20 && ma20 > ma50 -> TrendDirection.UPTREND
            currentPrice < ma20 && ma20 < ma50 && ma50 < ma200 -> TrendDirection.STRONG_DOWNTREND
            currentPrice < ma20 && ma20 < ma50 -> TrendDirection.DOWNTREND
            else -> TrendDirection.SIDEWAYS
        }
        return MovingAveragesData(ma20, ma50, ma200, currentPrice, trend)
    }

    // --- Supports et Résistances ---

    fun calculateSupportResistance(prices: List<PricePoint>): SupportResistanceData {
        if (prices.isEmpty()) {
            return SupportResistanceData(emptyList(), emptyList(), 0.0, 0.0)
        }
        val closes = prices.map { it.close }
        val currentPrice = closes.last()

        // Détection des pivots locaux (hauts et bas)
        val pivotHighs = mutableListOf<Double>()
        val pivotLows = mutableListOf<Double>()
        val window = 5

        for (i in window until closes.size - window) {
            val slice = closes.subList(i - window, i + window + 1)
            if (closes[i] == slice.max()) pivotHighs.add(closes[i])
            if (closes[i] == slice.min()) pivotLows.add(closes[i])
        }

        // Clustering des niveaux proches
        val resistances = clusterLevels(pivotHighs.filter { it > currentPrice })
            .sortedBy { it }.take(3)
        val supports = clusterLevels(pivotLows.filter { it < currentPrice })
            .sortedByDescending { it }.take(3)

        return SupportResistanceData(
            supportLevels = supports,
            resistanceLevels = resistances,
            nearestSupport = supports.firstOrNull() ?: currentPrice * 0.95,
            nearestResistance = resistances.firstOrNull() ?: currentPrice * 1.05
        )
    }

    // --- Détection de figures chartistes ---

    fun detectChartPatterns(prices: List<PricePoint>): List<ChartPattern> {
        if (prices.size < 30) return emptyList()
        val patterns = mutableListOf<ChartPattern>()
        val closes = prices.map { it.close }

        detectDoubleTop(closes)?.let { patterns.add(it) }
        detectDoubleBottom(closes)?.let { patterns.add(it) }
        detectHeadAndShoulders(closes)?.let { patterns.add(it) }

        return patterns
    }

    private fun detectDoubleTop(closes: List<Double>): ChartPattern? {
        val recent = closes.takeLast(40)
        if (recent.size < 20) return null
        val mid = recent.size / 2
        val firstHalf = recent.take(mid)
        val secondHalf = recent.drop(mid)
        val firstPeak = firstHalf.max()
        val secondPeak = secondHalf.max()
        val tolerance = 0.02  // 2% de tolérance

        if (abs(firstPeak - secondPeak) / firstPeak < tolerance &&
            firstPeak > recent.average() * 1.05) {
            val confidence = (70 - abs(firstPeak - secondPeak) / firstPeak * 1000).coerceIn(40.0, 85.0).toInt()
            return ChartPattern(
                type = PatternType.DOUBLE_TOP,
                confidence = confidence,
                description = "Double Sommet détecté : résistance forte. Risque de retournement baissier.",
                implication = PatternImplication.BEARISH,
                priceTarget = closes.last() - (firstPeak - closes.takeLast(20).min())
            )
        }
        return null
    }

    private fun detectDoubleBottom(closes: List<Double>): ChartPattern? {
        val recent = closes.takeLast(40)
        if (recent.size < 20) return null
        val mid = recent.size / 2
        val firstTrough = recent.take(mid).min()
        val secondTrough = recent.drop(mid).min()
        val tolerance = 0.02

        if (abs(firstTrough - secondTrough) / firstTrough < tolerance &&
            firstTrough < recent.average() * 0.95) {
            val confidence = (70 - abs(firstTrough - secondTrough) / firstTrough * 1000).coerceIn(40.0, 85.0).toInt()
            return ChartPattern(
                type = PatternType.DOUBLE_BOTTOM,
                confidence = confidence,
                description = "Double Creux détecté : support solide. Signal haussier potentiel.",
                implication = PatternImplication.BULLISH,
                priceTarget = closes.last() + (recent.max() - firstTrough)
            )
        }
        return null
    }

    private fun detectHeadAndShoulders(closes: List<Double>): ChartPattern? {
        val recent = closes.takeLast(60)
        if (recent.size < 30) return null

        // Identification simplifiée des 3 pics
        val segment = recent.size / 3
        val leftShoulder = recent.take(segment).max()
        val head = recent.subList(segment, segment * 2).max()
        val rightShoulder = recent.drop(segment * 2).max()

        if (head > leftShoulder * 1.03 &&
            head > rightShoulder * 1.03 &&
            abs(leftShoulder - rightShoulder) / leftShoulder < 0.05) {
            return ChartPattern(
                type = PatternType.HEAD_AND_SHOULDERS,
                confidence = 65,
                description = "Épaule-Tête-Épaule détecté : figure de retournement baissière classique.",
                implication = PatternImplication.BEARISH,
                priceTarget = closes.last() - (head - leftShoulder)
            )
        }
        return null
    }

    // --- Signal global ---

    private fun determineOverallSignal(
        rsi: RSIData,
        macd: MACDData,
        bb: BollingerBandsData,
        mas: MovingAveragesData,
        patterns: List<ChartPattern>
    ): Pair<TradingSignal, Int> {
        var score = 0  // -100 (fort vendeur) à +100 (fort acheteur)
        var totalWeight = 0

        // RSI (poids 25%)
        val rsiScore = when (rsi.signal) {
            RSIData.RSISignal.OVERSOLD -> 30
            RSIData.RSISignal.NEUTRAL -> 0
            RSIData.RSISignal.OVERBOUGHT -> -30
        }
        score += rsiScore * 25 / 100
        totalWeight += 25

        // MACD (poids 30%)
        val macdScore = when (macd.signal) {
            MACDData.MACDSignal.BULLISH_CROSSOVER -> 40
            MACDData.MACDSignal.BULLISH -> 20
            MACDData.MACDSignal.NEUTRAL -> 0
            MACDData.MACDSignal.BEARISH -> -20
            MACDData.MACDSignal.BEARISH_CROSSOVER -> -40
        }
        score += macdScore * 30 / 100
        totalWeight += 30

        // Tendance MM (poids 30%)
        val trendScore = when (mas.trend) {
            TrendDirection.STRONG_UPTREND -> 40
            TrendDirection.UPTREND -> 20
            TrendDirection.SIDEWAYS -> 0
            TrendDirection.DOWNTREND -> -20
            TrendDirection.STRONG_DOWNTREND -> -40
        }
        score += trendScore * 30 / 100
        totalWeight += 30

        // Bollinger Bands (poids 10%)
        val bbScore = when (bb.signal) {
            BollingerBandsData.BBSignal.NEAR_LOWER -> 20
            BollingerBandsData.BBSignal.NEAR_UPPER -> -20
            else -> 0
        }
        score += bbScore * 10 / 100
        totalWeight += 10

        // Figures chartistes (poids 5%)
        val bullishPatterns = patterns.count { it.implication == PatternImplication.BULLISH }
        val bearishPatterns = patterns.count { it.implication == PatternImplication.BEARISH }
        score += (bullishPatterns - bearishPatterns) * 20 * 5 / 100
        totalWeight += 5

        val normalizedScore = if (totalWeight > 0) score * 100 / totalWeight else 0
        val confidence = minOf(95, 40 + abs(normalizedScore) / 2)

        val signal = when {
            normalizedScore >= 30 -> TradingSignal.STRONG_BUY
            normalizedScore >= 10 -> TradingSignal.BUY
            normalizedScore <= -30 -> TradingSignal.STRONG_SELL
            normalizedScore <= -10 -> TradingSignal.SELL
            else -> TradingSignal.NEUTRAL
        }
        return Pair(signal, confidence)
    }

    private fun generateExplanation(
        signal: TradingSignal,
        confidence: Int,
        rsi: RSIData,
        macd: MACDData,
        mas: MovingAveragesData,
        patterns: List<ChartPattern>
    ): String {
        val sb = StringBuilder()
        sb.append("Signal ${signal.displayName} (confiance $confidence%).\n\n")

        when (rsi.signal) {
            RSIData.RSISignal.OVERSOLD -> sb.append("• RSI à ${String.format("%.1f", rsi.value)} : titre survendu, rebond technique possible.\n")
            RSIData.RSISignal.OVERBOUGHT -> sb.append("• RSI à ${String.format("%.1f", rsi.value)} : titre suracheté, risque de correction.\n")
            RSIData.RSISignal.NEUTRAL -> sb.append("• RSI à ${String.format("%.1f", rsi.value)} : zone neutre.\n")
        }

        when (macd.signal) {
            MACDData.MACDSignal.BULLISH_CROSSOVER -> sb.append("• MACD : croisement haussier, signal d'achat fort.\n")
            MACDData.MACDSignal.BEARISH_CROSSOVER -> sb.append("• MACD : croisement baissier, signal de vente.\n")
            MACDData.MACDSignal.BULLISH -> sb.append("• MACD : momentum positif maintenu.\n")
            MACDData.MACDSignal.BEARISH -> sb.append("• MACD : momentum négatif.\n")
            else -> {}
        }

        sb.append("• Tendance : ${mas.trend.displayName}.\n")

        patterns.forEach { pattern ->
            sb.append("• Figure : ${pattern.type.displayName} (confiance ${pattern.confidence}%).\n")
        }

        sb.append("\n⚠️ Information à titre indicatif uniquement. Non conseil financier réglementé.")
        return sb.toString()
    }

    // --- Utilitaires ---

    private fun calculateEMA(values: List<Double>, period: Int): Double {
        if (values.isEmpty()) return 0.0
        if (values.size < period) return values.average()
        val k = 2.0 / (period + 1)
        var ema = values.take(period).average()
        for (i in period until values.size) {
            ema = values[i] * k + ema * (1 - k)
        }
        return ema
    }

    private fun clusterLevels(levels: List<Double>, threshold: Double = 0.02): List<Double> {
        if (levels.isEmpty()) return emptyList()
        val sorted = levels.sorted()
        val clusters = mutableListOf<MutableList<Double>>()
        var currentCluster = mutableListOf(sorted[0])

        for (i in 1 until sorted.size) {
            if ((sorted[i] - sorted[i - 1]) / sorted[i - 1] <= threshold) {
                currentCluster.add(sorted[i])
            } else {
                clusters.add(currentCluster)
                currentCluster = mutableListOf(sorted[i])
            }
        }
        clusters.add(currentCluster)
        return clusters.map { it.average() }
    }

    private fun buildInsufficientDataAnalysis(symbol: String) = TechnicalAnalysis(
        symbol = symbol,
        rsi = RSIData(50.0, RSIData.RSISignal.NEUTRAL),
        macd = MACDData(0.0, 0.0, 0.0, MACDData.MACDSignal.NEUTRAL),
        bollingerBands = BollingerBandsData(0.0, 0.0, 0.0, 0.0, 0.0, BollingerBandsData.BBSignal.NEUTRAL),
        movingAverages = MovingAveragesData(0.0, 0.0, 0.0, 0.0, TrendDirection.SIDEWAYS),
        supportResistance = SupportResistanceData(emptyList(), emptyList(), 0.0, 0.0),
        chartPatterns = emptyList(),
        overallSignal = TradingSignal.NEUTRAL,
        signalConfidence = 0,
        signalExplanation = "Données historiques insuffisantes pour générer une analyse technique fiable. Minimum 20 séances requis."
    )
}
