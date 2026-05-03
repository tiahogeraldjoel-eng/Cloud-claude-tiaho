package com.brvm.alerte.domain.usecase

import com.brvm.alerte.domain.model.*
import javax.inject.Inject

class DetectAlertsUseCase @Inject constructor(
    private val scoreStock: ScoreStockUseCase
) {

    fun detect(stock: Stock, indicators: TechnicalIndicators?): List<Alert> {
        val alerts = mutableListOf<Alert>()
        val result = scoreStock.score(stock, indicators)

        // Ne générer une alerte que si le score est suffisant
        if (result.totalScore >= 50) {
            val message = scoreStock.buildAlertMessage(stock, result)
            alerts.add(
                Alert(
                    ticker = stock.ticker,
                    stockName = stock.name,
                    type = determineType(stock, indicators, result),
                    priority = result.priority,
                    title = "${result.priority.emoji} ${stock.ticker} — Score ${result.totalScore}/100",
                    message = message,
                    recommendation = result.recommendation,
                    score = result.totalScore,
                    targetPrice = result.targetPrice,
                    currentPrice = stock.lastPrice
                )
            )
        }

        // Alerte spéciale anomalie volume même avec score modéré
        if (stock.isVolumeAnomaly && result.totalScore < 50) {
            alerts.add(
                Alert(
                    ticker = stock.ticker,
                    stockName = stock.name,
                    type = AlertType.VOLUME_ANOMALY,
                    priority = AlertPriority.STRONG,
                    title = "🔍 Anomalie volume — ${stock.ticker}",
                    message = buildVolumeAnomalyMessage(stock),
                    recommendation = Recommendation.HOLD,
                    score = result.totalScore,
                    targetPrice = null,
                    currentPrice = stock.lastPrice
                )
            )
        }

        return alerts
    }

    private fun determineType(
        stock: Stock,
        indicators: TechnicalIndicators?,
        result: ScoreStockUseCase.ScoringResult
    ): AlertType {
        if (stock.isVolumeAnomaly) return AlertType.SMART_MONEY_FLOW
        if (indicators?.isGoldenCross == true) return AlertType.TECHNICAL_BREAKOUT
        if (indicators?.isOversold == true) return AlertType.SUPPORT_BOUNCE
        if ((stock.dividendYield ?: 0.0) >= 4.0) return AlertType.DIVIDEND_APPROACHING
        return AlertType.FUNDAMENTAL_OPPORTUNITY
    }

    private fun buildVolumeAnomalyMessage(stock: Stock): String {
        return buildString {
            append("🔍 *ANOMALIE VOLUME DÉTECTÉE*\n")
            append("━━━━━━━━━━━━━━━━━━━━━\n")
            append("📈 ${stock.ticker} — ${stock.name}\n")
            append("💰 Prix: ${String.format("%.0f", stock.lastPrice)} FCFA\n")
            append("📊 Volume: ${String.format("%.1f", stock.volumeRatio)}x la moyenne 20j\n")
            append("⚠️ Activité inhabituelle — surveiller de près\n")
            append("\n_BRVM Alerte — Détection automatique_")
        }
    }
}
