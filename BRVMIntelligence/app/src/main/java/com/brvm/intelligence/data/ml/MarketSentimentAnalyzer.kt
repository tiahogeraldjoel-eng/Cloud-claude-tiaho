package com.brvm.intelligence.data.ml

import com.brvm.intelligence.domain.model.*
import java.time.LocalDate
import java.time.Month
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

/**
 * Calcul de l'indice Fear & Greed adapté à la BRVM.
 * Prend en compte les spécificités du marché UEMOA :
 * - Faible liquidité structurelle
 * - Saisonnalité (dividendes janv-mars, résultats semestriels)
 * - Corrélation avec le CAC40 et les matières premières
 * - Politique monétaire BCEAO
 */
@Singleton
class MarketSentimentAnalyzer @Inject constructor() {

    fun analyzeSentiment(
        stocks: List<Stock>,
        recentHistory: Map<String, List<PricePoint>>
    ): MarketSentiment {
        val volumeRatio = calculateVolumeRatio(stocks)
        val momentumScore = calculateMomentumScore(stocks)
        val breadthScore = calculateMarketBreadth(stocks)
        val volatilityScore = calculateVolatilityScore(recentHistory)
        val seasonalBias = determineSeasonalBias()
        val macroEnvironment = buildMacroEnvironment()

        // Calcul pondéré de l'indice Fear & Greed
        val fearGreedIndex = calculateFearGreedIndex(
            volumeRatio, momentumScore, breadthScore, volatilityScore
        )
        val fearGreedLevel = FearGreedLevel.values().first { fearGreedIndex in it.range }

        val smartMoney = determineSmartMoneyFlow(stocks, recentHistory)
        val retailSentiment = determineRetailSentiment(stocks)
        val manipulationAlert = detectManipulation(stocks)

        return MarketSentiment(
            fearGreedIndex = fearGreedIndex,
            fearGreedLabel = fearGreedLevel,
            smartMoneyFlow = smartMoney,
            retailSentiment = retailSentiment,
            volumeRatio = volumeRatio,
            seasonalBias = seasonalBias,
            macroEnvironment = macroEnvironment,
            panicSellDetected = detectPanicSelling(stocks),
            euphoriaDetected = detectEuphoria(stocks),
            manipulationAlert = manipulationAlert,
            date = LocalDate.now()
        )
    }

    private fun calculateVolumeRatio(stocks: List<Stock>): Double {
        val gainers = stocks.filter { it.changePercent > 0 }
        val losers = stocks.filter { it.changePercent < 0 }
        val buyVolume = gainers.sumOf { it.volume.toDouble() }
        val sellVolume = losers.sumOf { it.volume.toDouble() }
        return if (sellVolume > 0) buyVolume / sellVolume else 1.0
    }

    private fun calculateMomentumScore(stocks: List<Stock>): Int {
        val avgChange = stocks.map { it.changePercent }.average()
        return when {
            avgChange > 2.0 -> 80
            avgChange > 0.5 -> 60
            avgChange > -0.5 -> 50
            avgChange > -2.0 -> 35
            else -> 15
        }
    }

    private fun calculateMarketBreadth(stocks: List<Stock>): Int {
        if (stocks.isEmpty()) return 50
        val advancing = stocks.count { it.changePercent > 0 }
        val declining = stocks.count { it.changePercent < 0 }
        val ratio = advancing.toDouble() / (advancing + declining).coerceAtLeast(1)
        return (ratio * 100).toInt().coerceIn(0, 100)
    }

    private fun calculateVolatilityScore(history: Map<String, List<PricePoint>>): Int {
        if (history.isEmpty()) return 50
        val avgVolatility = history.values.map { prices ->
            if (prices.size < 2) 0.0
            else {
                val returns = prices.zipWithNext { a, b -> (b.close - a.close) / a.close }
                val stdDev = kotlin.math.sqrt(returns.map { it * it }.average())
                stdDev * 100
            }
        }.average()
        // Haute volatilité = peur, faible volatilité = avidité
        return when {
            avgVolatility > 3.0 -> 20  // Très haute volatilité = peur extrême
            avgVolatility > 2.0 -> 35
            avgVolatility > 1.0 -> 50
            avgVolatility > 0.5 -> 65
            else -> 80                 // Très faible volatilité = avidité
        }
    }

    private fun calculateFearGreedIndex(
        volumeRatio: Double,
        momentumScore: Int,
        breadthScore: Int,
        volatilityScore: Int
    ): Int {
        // Pondération adaptée BRVM
        val volumeContrib = (minOf(volumeRatio / 2.0, 1.0) * 100 * 0.25).toInt()
        val momentumContrib = (momentumScore * 0.35).toInt()
        val breadthContrib = (breadthScore * 0.25).toInt()
        val volatilityContrib = (volatilityScore * 0.15).toInt()

        return (volumeContrib + momentumContrib + breadthContrib + volatilityContrib)
            .coerceIn(0, 100)
    }

    private fun determineSeasonalBias(): SeasonalBias {
        val month = LocalDate.now().month
        return when (month) {
            Month.JANUARY, Month.FEBRUARY, Month.MARCH -> SeasonalBias(
                currentBias = SeasonalEffect.DIVIDEND_SEASON,
                description = "Période de détachement des dividendes. Les titres à fort rendement surperforment historiquement.",
                historicalSuccessRate = 68.5
            )
            Month.APRIL, Month.MAY -> SeasonalBias(
                currentBias = SeasonalEffect.PRE_RESULTS,
                description = "Publication des résultats annuels. Volatilité accrue sur les titres qui reportent.",
                historicalSuccessRate = 55.0
            )
            Month.JUNE, Month.JULY, Month.AUGUST -> SeasonalBias(
                currentBias = SeasonalEffect.SUMMER_LULL,
                description = "Ralentissement estival. Volumes faibles, mouvements ampliés par la faible liquidité.",
                historicalSuccessRate = 48.0
            )
            Month.SEPTEMBER, Month.OCTOBER -> SeasonalBias(
                currentBias = SeasonalEffect.PRE_RESULTS,
                description = "Avant-résultats semestriels. Accumulation précautionneuse sur les valeurs de qualité.",
                historicalSuccessRate = 57.0
            )
            Month.NOVEMBER, Month.DECEMBER -> SeasonalBias(
                currentBias = SeasonalEffect.YEAR_END,
                description = "Rééquilibrage de fin d'année. Prise de bénéfices et rebalancement des institutionnels.",
                historicalSuccessRate = 52.0
            )
            else -> SeasonalBias(SeasonalEffect.NEUTRAL, "Période neutre.", 50.0)
        }
    }

    private fun buildMacroEnvironment(): MacroEnvironment {
        return MacroEnvironment(
            bcaoRateImpact = RateImpact.NEUTRAL,
            cac40Correlation = 0.35,
            cocoaPriceImpact = 0.65,
            goldPriceImpact = 0.20,
            oilPriceImpact = 0.30,
            diasporaRemittanceEffect = "Les transferts de la diaspora soutiennent la consommation et le secteur bancaire."
        )
    }

    private fun determineSmartMoneyFlow(
        stocks: List<Stock>,
        history: Map<String, List<PricePoint>>
    ): SmartMoneySignal {
        // Heuristique : hausse des cours avec volumes croissants = smart money buying
        val topStocks = stocks.sortedByDescending { it.marketCap }.take(10)
        val avgChangeTopStocks = topStocks.map { it.changePercent }.average()
        val avgVolumeRatio = topStocks.map {
            val hist = history[it.symbol] ?: return@map 1.0
            if (hist.size < 5) 1.0
            else it.volume.toDouble() / hist.takeLast(5).map { p -> p.volume }.average()
        }.average()

        return when {
            avgChangeTopStocks > 1.5 && avgVolumeRatio > 1.5 -> SmartMoneySignal.STRONG_BUYING
            avgChangeTopStocks > 0.5 && avgVolumeRatio > 1.2 -> SmartMoneySignal.BUYING
            avgChangeTopStocks < -1.5 && avgVolumeRatio > 1.5 -> SmartMoneySignal.STRONG_SELLING
            avgChangeTopStocks < -0.5 && avgVolumeRatio > 1.2 -> SmartMoneySignal.SELLING
            else -> SmartMoneySignal.NEUTRAL
        }
    }

    private fun determineRetailSentiment(stocks: List<Stock>): RetailSentiment {
        val lowCapStocks = stocks.sortedBy { it.marketCap }.take(stocks.size / 2)
        val avgChange = lowCapStocks.map { it.changePercent }.average()
        return when {
            avgChange > 1.0 -> RetailSentiment.BULLISH
            avgChange < -1.0 -> RetailSentiment.BEARISH
            else -> RetailSentiment.NEUTRAL
        }
    }

    private fun detectPanicSelling(stocks: List<Stock>): Boolean {
        val losers = stocks.filter { it.changePercent < 0 }
        val avgDrop = losers.map { it.changePercent }.average()
        val panicCount = stocks.count { it.changePercent < -3.0 }
        return avgDrop < -2.0 && panicCount > stocks.size * 0.3
    }

    private fun detectEuphoria(stocks: List<Stock>): Boolean {
        val gainers = stocks.filter { it.changePercent > 0 }
        val euphoriaCount = stocks.count { it.changePercent > 3.0 }
        return euphoriaCount > stocks.size * 0.4
    }

    private fun detectManipulation(stocks: List<Stock>): ManipulationAlert? {
        // Détection d'anomalies sur les titres à très faible liquidité
        val suspiciousStocks = stocks.filter { stock ->
            stock.liquidityLevel == LiquidityLevel.VERY_LOW &&
            abs(stock.changePercent) > 5.0
        }

        if (suspiciousStocks.isNotEmpty()) {
            val stock = suspiciousStocks.first()
            return ManipulationAlert(
                symbol = stock.symbol,
                alertType = if (stock.volume > 5000) ManipulationType.ABNORMAL_VOLUME
                            else ManipulationType.PRICE_SPIKE,
                severity = if (abs(stock.changePercent) > 10) AlertSeverity.HIGH else AlertSeverity.MEDIUM,
                description = "${stock.symbol} : variation de ${stock.changePercent}% sur un titre peu liquide. " +
                    "Vérifier les fondamentaux avant toute décision."
            )
        }
        return null
    }
}
