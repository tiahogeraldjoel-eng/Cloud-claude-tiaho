package com.brvm.alerte.data.db.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "stocks")
data class StockEntity(
    @PrimaryKey val ticker: String,
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
    val isWatchlisted: Boolean = false
)

@Entity(tableName = "price_history")
data class PriceHistoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val ticker: String,
    val date: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Long
)

@Entity(tableName = "technical_indicators")
data class TechnicalIndicatorsEntity(
    @PrimaryKey val ticker: String,
    val rsi14: Double,
    val macdLine: Double,
    val macdSignal: Double,
    val macdHistogram: Double,
    val bollingerUpper: Double,
    val bollingerMiddle: Double,
    val bollingerLower: Double,
    val sma20: Double,
    val sma50: Double,
    val sma200: Double,
    val ema12: Double,
    val ema26: Double,
    val atr14: Double,
    val stochasticK: Double,
    val stochasticD: Double,
    val adx14: Double,
    val obv: Double,
    val moneyFlowIndex: Double,
    val computedAt: Long
)
