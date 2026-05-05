package com.brvm.alerte.domain.usecase

import com.brvm.alerte.domain.model.MarketSentiment
import com.brvm.alerte.domain.model.Stock
import javax.inject.Inject

class ComputeMarketSentimentUseCase @Inject constructor() {

    fun compute(stocks: List<Stock>): MarketSentiment {
        if (stocks.isEmpty()) return defaultSentiment()

        val advancing = stocks.count { it.changePercent > 0 }
        val declining = stocks.count { it.changePercent < 0 }
        val unchanged = stocks.count { it.changePercent == 0.0 }
        val totalVolume = stocks.sumOf { it.volume }

        val breadth = if (advancing + declining > 0)
            (advancing.toDouble() - declining) / (advancing + declining) else 0.0

        // Fear & Greed composite (0-100)
        val breadthContrib = ((breadth + 1) / 2) * 30  // 0-30

        val avgChange = stocks.map { it.changePercent }.average()
        val momentumContrib = (((avgChange + 5) / 10).coerceIn(0.0, 1.0)) * 30  // 0-30

        val volumeAnomaly = stocks.count { it.isVolumeAnomaly }
        val volumeContrib = (volumeAnomaly.toDouble() / stocks.size.coerceAtLeast(1)) * 20  // 0-20

        val gainers5pct = stocks.count { it.changePercent >= 5.0 }
        val losers5pct = stocks.count { it.changePercent <= -5.0 }
        val extremeContrib = ((gainers5pct - losers5pct).toDouble() /
                stocks.size.coerceAtLeast(1) + 0.5).coerceIn(0.0, 1.0) * 20  // 0-20

        val index = (breadthContrib + momentumContrib + volumeContrib + extremeContrib)
            .coerceIn(0.0, 100.0).toInt()

        val label = when {
            index <= 20 -> MarketSentiment.SentimentLabel.EXTREME_FEAR
            index <= 40 -> MarketSentiment.SentimentLabel.FEAR
            index <= 60 -> MarketSentiment.SentimentLabel.NEUTRAL
            index <= 80 -> MarketSentiment.SentimentLabel.GREED
            else -> MarketSentiment.SentimentLabel.EXTREME_GREED
        }

        return MarketSentiment(
            fearGreedIndex = index,
            label = label,
            advancingStocks = advancing,
            decliningStocks = declining,
            unchangedStocks = unchanged,
            totalVolume = totalVolume,
            marketBreadth = breadth,
            updatedAt = System.currentTimeMillis()
        )
    }

    private fun defaultSentiment() = MarketSentiment(
        fearGreedIndex = 50,
        label = MarketSentiment.SentimentLabel.NEUTRAL,
        advancingStocks = 0,
        decliningStocks = 0,
        unchangedStocks = 0,
        totalVolume = 0L,
        marketBreadth = 0.0,
        updatedAt = System.currentTimeMillis()
    )
}
