package com.brvm.alerte.domain.usecase

import com.brvm.alerte.domain.model.PricePoint
import com.brvm.alerte.domain.model.TechnicalIndicators
import javax.inject.Inject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class ComputeTechnicalIndicatorsUseCase @Inject constructor() {

    fun compute(ticker: String, prices: List<PricePoint>): TechnicalIndicators? {
        if (prices.size < 26) return null
        val closes = prices.map { it.close }
        val highs = prices.map { it.high }
        val lows = prices.map { it.low }
        val volumes = prices.map { it.volume.toDouble() }

        return TechnicalIndicators(
            ticker = ticker,
            rsi14 = computeRSI(closes, 14),
            macdLine = computeEMA(closes, 12) - computeEMA(closes, 26),
            macdSignal = run {
                val macdValues = closes.indices.drop(25).map { i ->
                    computeEMA(closes.take(i + 1), 12) - computeEMA(closes.take(i + 1), 26)
                }
                if (macdValues.size >= 9) computeEMA(macdValues, 9) else 0.0
            },
            macdHistogram = run {
                val line = computeEMA(closes, 12) - computeEMA(closes, 26)
                val macdValues = closes.indices.drop(25).map { i ->
                    computeEMA(closes.take(i + 1), 12) - computeEMA(closes.take(i + 1), 26)
                }
                val signal = if (macdValues.size >= 9) computeEMA(macdValues, 9) else 0.0
                line - signal
            },
            bollingerUpper = computeSMA(closes, 20) + 2 * computeStdDev(closes, 20),
            bollingerMiddle = computeSMA(closes, 20),
            bollingerLower = computeSMA(closes, 20) - 2 * computeStdDev(closes, 20),
            sma20 = computeSMA(closes, 20),
            sma50 = if (closes.size >= 50) computeSMA(closes, 50) else computeSMA(closes, closes.size),
            sma200 = if (closes.size >= 200) computeSMA(closes, 200) else computeSMA(closes, closes.size),
            ema12 = computeEMA(closes, 12),
            ema26 = computeEMA(closes, 26),
            atr14 = computeATR(highs, lows, closes, 14),
            stochasticK = computeStochasticK(highs, lows, closes, 14),
            stochasticD = computeStochasticD(highs, lows, closes, 14),
            adx14 = computeADX(highs, lows, closes, 14),
            obv = computeOBV(closes, volumes),
            moneyFlowIndex = computeMFI(highs, lows, closes, volumes, 14)
        )
    }

    private fun computeRSI(closes: List<Double>, period: Int): Double {
        if (closes.size <= period) return 50.0
        val changes = closes.zipWithNext { a, b -> b - a }
        val recent = changes.takeLast(period)
        val avgGain = recent.filter { it > 0 }.sum() / period
        val avgLoss = recent.filter { it < 0 }.map { abs(it) }.sum() / period
        if (avgLoss == 0.0) return 100.0
        val rs = avgGain / avgLoss
        return 100.0 - (100.0 / (1 + rs))
    }

    private fun computeEMA(values: List<Double>, period: Int): Double {
        if (values.isEmpty()) return 0.0
        val k = 2.0 / (period + 1)
        var ema = values.take(period).average()
        for (i in period until values.size) {
            ema = values[i] * k + ema * (1 - k)
        }
        return ema
    }

    private fun computeSMA(values: List<Double>, period: Int): Double =
        values.takeLast(period).average()

    private fun computeStdDev(values: List<Double>, period: Int): Double {
        val recent = values.takeLast(period)
        val mean = recent.average()
        return Math.sqrt(recent.map { (it - mean) * (it - mean) }.average())
    }

    private fun computeATR(highs: List<Double>, lows: List<Double>, closes: List<Double>, period: Int): Double {
        val trs = (1 until minOf(highs.size, period + 1)).map { i ->
            maxOf(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        }
        return if (trs.isEmpty()) 0.0 else trs.average()
    }

    private fun computeStochasticK(highs: List<Double>, lows: List<Double>, closes: List<Double>, period: Int): Double {
        val recent = closes.indices.takeLast(period)
        if (recent.isEmpty()) return 50.0
        val highestHigh = recent.maxOf { highs[it] }
        val lowestLow = recent.minOf { lows[it] }
        val currentClose = closes.last()
        return if (highestHigh == lowestLow) 50.0
        else ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100
    }

    private fun computeStochasticD(highs: List<Double>, lows: List<Double>, closes: List<Double>, period: Int): Double {
        val kValues = (0..2).map { offset ->
            val slice = closes.dropLast(offset)
            val highSlice = highs.dropLast(offset)
            val lowSlice = lows.dropLast(offset)
            computeStochasticK(highSlice, lowSlice, slice, period)
        }
        return kValues.average()
    }

    private fun computeADX(highs: List<Double>, lows: List<Double>, closes: List<Double>, period: Int): Double {
        if (closes.size < period + 1) return 20.0
        val dmPlus = (1 until closes.size).map { i ->
            val upMove = highs[i] - highs[i - 1]
            val downMove = lows[i - 1] - lows[i]
            if (upMove > downMove && upMove > 0) upMove else 0.0
        }
        val dmMinus = (1 until closes.size).map { i ->
            val upMove = highs[i] - highs[i - 1]
            val downMove = lows[i - 1] - lows[i]
            if (downMove > upMove && downMove > 0) downMove else 0.0
        }
        val trs = (1 until closes.size).map { i ->
            maxOf(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        }
        val smoothTR = trs.takeLast(period).sum()
        val smoothDMPlus = dmPlus.takeLast(period).sum()
        val smoothDMMinus = dmMinus.takeLast(period).sum()
        if (smoothTR == 0.0) return 20.0
        val diPlus = (smoothDMPlus / smoothTR) * 100
        val diMinus = (smoothDMMinus / smoothTR) * 100
        if (diPlus + diMinus == 0.0) return 20.0
        return (abs(diPlus - diMinus) / (diPlus + diMinus)) * 100
    }

    private fun computeOBV(closes: List<Double>, volumes: List<Double>): Double {
        var obv = 0.0
        for (i in 1 until closes.size) {
            obv += when {
                closes[i] > closes[i - 1] -> volumes[i]
                closes[i] < closes[i - 1] -> -volumes[i]
                else -> 0.0
            }
        }
        return obv
    }

    private fun computeMFI(
        highs: List<Double>, lows: List<Double>,
        closes: List<Double>, volumes: List<Double>, period: Int
    ): Double {
        if (closes.size <= period) return 50.0
        val typicalPrices = closes.indices.map { (highs[it] + lows[it] + closes[it]) / 3 }
        val moneyFlows = typicalPrices.indices.map { typicalPrices[it] * volumes[it] }
        val positiveFlow = (1 until period).sumOf {
            if (typicalPrices[it] > typicalPrices[it - 1]) moneyFlows[it] else 0.0
        }
        val negativeFlow = (1 until period).sumOf {
            if (typicalPrices[it] < typicalPrices[it - 1]) moneyFlows[it] else 0.0
        }
        if (negativeFlow == 0.0) return 100.0
        val mfr = positiveFlow / negativeFlow
        return 100.0 - (100.0 / (1 + mfr))
    }
}
