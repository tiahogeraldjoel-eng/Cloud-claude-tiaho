package com.brvm.alerte.domain.usecase

import com.brvm.alerte.domain.model.*
import javax.inject.Inject

/**
 * Moteur de scoring BRVM — note chaque titre sur 100.
 *
 * Pondération:
 *  - Technique  : 45 pts  (RSI, MACD, Bollinger, volume, ADX, Stochastic)
 *  - Fondamental: 35 pts  (PER, dividende, PBR, ROE, croissance BPA)
 *  - Flux       : 20 pts  (OBV, MFI, anomalie volume)
 *
 * Psychologie BRVM : les investisseurs-salariés réagissent fortement
 * aux dividendes et au rendement; le PER est secondaire. Pondération ajustée.
 */
class ScoreStockUseCase @Inject constructor() {

    data class ScoringResult(
        val ticker: String,
        val totalScore: Int,
        val technicalScore: Int,
        val fundamentalScore: Int,
        val flowScore: Int,
        val recommendation: Recommendation,
        val priority: AlertPriority,
        val signals: List<String>,
        val targetPrice: Double?
    )

    fun score(stock: Stock, indicators: TechnicalIndicators?): ScoringResult {
        val signals = mutableListOf<String>()
        var technicalScore = 0
        var fundamentalScore = 0
        var flowScore = 0

        // --- TECHNIQUE (45 pts) ---
        // RSI (0-15)
        technicalScore += when {
            indicators == null -> 7
            indicators.rsi14 in 30.0..45.0 -> { signals.add("RSI en zone d'accumulation (${indicators.rsi14.toInt()})"); 15 }
            indicators.rsi14 in 45.0..55.0 -> 10
            indicators.rsi14 in 20.0..30.0 -> { signals.add("RSI survendu — rebond potentiel (${indicators.rsi14.toInt()})"); 13 }
            indicators.rsi14 > 70 -> { signals.add("RSI suracheté — prudence"); 3 }
            else -> 5
        }

        // MACD (0-10)
        if (indicators != null) {
            when {
                indicators.isBullishMACD && indicators.macdHistogram > 0 -> {
                    signals.add("MACD haussier avec momentum positif")
                    technicalScore += 10
                }
                indicators.isBullishMACD -> { signals.add("Croisement MACD haussier"); technicalScore += 7 }
                indicators.macdHistogram < 0 -> technicalScore += 2
                else -> technicalScore += 4
            }
        } else technicalScore += 5

        // Bollinger (0-8)
        if (indicators != null) {
            val position = (stock.lastPrice - indicators.bollingerLower) /
                    (indicators.bollingerUpper - indicators.bollingerLower).coerceAtLeast(0.001)
            technicalScore += when {
                position < 0.2 -> { signals.add("Prix proche de la bande de Bollinger inférieure"); 8 }
                position < 0.4 -> 6
                position > 0.8 -> 2
                else -> 4
            }
        } else technicalScore += 4

        // SMA Trend (0-7)
        if (indicators != null) {
            when {
                indicators.isGoldenCross && stock.lastPrice > indicators.sma50 -> {
                    signals.add("Golden Cross — tendance haussière confirmée")
                    technicalScore += 7
                }
                stock.lastPrice > indicators.sma20 -> { signals.add("Prix au-dessus de la SMA20"); technicalScore += 5 }
                indicators.isDeathCross -> technicalScore += 1
                else -> technicalScore += 3
            }
        } else technicalScore += 3

        // ADX + Stochastic (0-5)
        if (indicators != null) {
            if (indicators.isTrendStrong && indicators.isBullishStochastic) {
                signals.add("Tendance forte avec Stochastique haussier")
                technicalScore += 5
            } else if (indicators.isTrendStrong) technicalScore += 3
            else technicalScore += 2
        } else technicalScore += 2

        // --- FONDAMENTAL (35 pts — pondéré BRVM) ---
        // Rendement dividende (0-12) — clé pour l'investisseur salarié BRVM
        val dividendYield = stock.dividendYield ?: 0.0
        fundamentalScore += when {
            dividendYield >= 6.0 -> { signals.add("Rendement dividende exceptionnel (${String.format("%.1f", dividendYield)}%)"); 12 }
            dividendYield >= 4.0 -> { signals.add("Bon rendement dividende (${String.format("%.1f", dividendYield)}%)"); 9 }
            dividendYield >= 2.0 -> 6
            dividendYield > 0 -> 3
            else -> 0
        }

        // PER (0-9)
        val per = stock.peRatio
        fundamentalScore += when {
            per == null -> 5
            per in 5.0..12.0 -> { signals.add("PER attractif (${String.format("%.1f", per)}x)"); 9 }
            per in 12.0..18.0 -> 6
            per in 18.0..25.0 -> 3
            per > 25.0 -> 1
            per < 0 -> 0
            else -> 4
        }

        // Price-to-Book (0-7)
        val pb = stock.priceToBook
        fundamentalScore += when {
            pb == null -> 4
            pb < 1.0 -> { signals.add("Titre décoté (PBR=${String.format("%.2f", pb)})"); 7 }
            pb < 1.5 -> 5
            pb < 3.0 -> 3
            else -> 1
        }

        // ROE (0-7)
        val roe = stock.roe
        fundamentalScore += when {
            roe == null -> 4
            roe >= 20.0 -> { signals.add("ROE élevé (${String.format("%.1f", roe)}%)"); 7 }
            roe >= 12.0 -> 5
            roe >= 6.0 -> 3
            else -> 1
        }

        // --- FLUX SMART MONEY (20 pts) ---
        // Anomalie volume (0-10)
        val volRatio = stock.volumeRatio
        flowScore += when {
            volRatio >= 3.0 -> { signals.add("Volume EXPLOSIF — ${String.format("%.1f", volRatio)}x la moyenne (argent intelligent?)"); 10 }
            volRatio >= 2.0 -> { signals.add("Volume anormal (${String.format("%.1f", volRatio)}x la moyenne)"); 7 }
            volRatio >= 1.5 -> 4
            else -> 2
        }

        // MFI — Money Flow Index (0-6)
        if (indicators != null) {
            flowScore += when {
                indicators.moneyFlowIndex in 40.0..60.0 -> { signals.add("Flux monétaire équilibré"); 4 }
                indicators.moneyFlowIndex < 25.0 -> { signals.add("MFI survendu — accumulation probable"); 6 }
                indicators.moneyFlowIndex > 80.0 -> 1
                else -> 3
            }
        } else flowScore += 3

        // OBV tendance (0-4)
        if (indicators != null && indicators.obv > 0) {
            signals.add("OBV positif — accumulation en cours")
            flowScore += 4
        } else flowScore += 2

        val total = (technicalScore + fundamentalScore + flowScore).coerceIn(0, 100)
        val recommendation = when {
            total >= 80 -> Recommendation.STRONG_BUY
            total >= 65 -> Recommendation.BUY
            total >= 45 -> Recommendation.HOLD
            total >= 30 -> Recommendation.SELL
            else -> Recommendation.STRONG_SELL
        }
        val priority = when {
            total >= 80 && stock.isVolumeAnomaly -> AlertPriority.URGENT
            total >= 75 -> AlertPriority.URGENT
            total >= 65 -> AlertPriority.STRONG
            total >= 50 -> AlertPriority.MODERATE
            else -> AlertPriority.INFO
        }

        // Calcul du prix cible (ATR-based) — +8% à +20% selon score
        val targetMultiplier = 1.0 + (total / 100.0) * 0.20
        val targetPrice = if (stock.lastPrice > 0) stock.lastPrice * targetMultiplier else null

        return ScoringResult(
            ticker = stock.ticker,
            totalScore = total,
            technicalScore = technicalScore.coerceIn(0, 45),
            fundamentalScore = fundamentalScore.coerceIn(0, 35),
            flowScore = flowScore.coerceIn(0, 20),
            recommendation = recommendation,
            priority = priority,
            signals = signals,
            targetPrice = targetPrice
        )
    }

    fun buildAlertMessage(stock: Stock, result: ScoringResult): String {
        val change = String.format("%+.2f%%", stock.changePercent)
        val rec = when (result.recommendation) {
            Recommendation.STRONG_BUY -> "ACHAT FORT"
            Recommendation.BUY -> "ACHAT"
            Recommendation.HOLD -> "CONSERVER"
            Recommendation.SELL -> "VENTE"
            Recommendation.STRONG_SELL -> "VENTE FORTE"
        }
        return buildString {
            append("${result.priority.emoji} *${result.priority.label}* — ${stock.ticker}\n")
            append("━━━━━━━━━━━━━━━━━━━━━\n")
            append("🏢 ${stock.name}\n")
            append("💰 Prix: ${String.format("%.0f", stock.lastPrice)} FCFA ($change)\n")
            append("📊 Score: ${result.totalScore}/100 | 🎯 $rec\n")
            if (result.targetPrice != null)
                append("🚀 Objectif: ${String.format("%.0f", result.targetPrice)} FCFA\n")
            append("━━━━━━━━━━━━━━━━━━━━━\n")
            append("📌 Signaux détectés:\n")
            result.signals.take(4).forEach { append("  • $it\n") }
            append("\n_BRVM Alerte — Analyse algorithmique_")
        }
    }
}
