package com.brvm.alerte.domain.model

data class Stock(
    val ticker: String,
    val name: String,
    val sector: String,
    val country: String,
    val lastPrice: Double,
    val previousClose: Double,
    val openPrice: Double,
    val highPrice: Double,
    val lowPrice: Double,
    val volume: Long,
    val averageVolume20d: Long,
    val marketCap: Double,
    val peRatio: Double?,
    val dividendYield: Double?,
    val eps: Double?,
    val bookValue: Double?,
    val priceToBook: Double?,
    val roe: Double?,
    val debtToEquity: Double?,
    val revenueGrowth: Double?,
    val netIncomeGrowth: Double?,
    val lastUpdated: Long,
    val priceHistory: List<PricePoint> = emptyList()
) {
    val changePercent: Double
        get() = if (previousClose > 0)
            ((lastPrice - previousClose) / previousClose) * 100 else 0.0

    val changeAbsolute: Double
        get() = lastPrice - previousClose

    val volumeRatio: Double
        get() = if (averageVolume20d > 0) volume.toDouble() / averageVolume20d else 0.0

    val isVolumeAnomaly: Boolean
        get() = volumeRatio >= 2.0
}

data class PricePoint(
    val date: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Long
)
