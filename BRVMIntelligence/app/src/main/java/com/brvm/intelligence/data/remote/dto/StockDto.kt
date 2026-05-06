package com.brvm.intelligence.data.remote.dto

import java.time.LocalDate

/** DTO pour les données scrapées depuis brvm.org */
data class StockDto(
    val symbol: String,
    val name: String,
    val lastPrice: Double,
    val change: Double,
    val changePercent: Double,
    val volume: Long,
    val previousClose: Double = 0.0,
    val openPrice: Double = 0.0,
    val highPrice: Double = 0.0,
    val lowPrice: Double = 0.0,
    val marketCap: Long = 0,
    val per: Double? = null,
    val dividendYield: Double? = null,
    val high52Week: Double = 0.0,
    val low52Week: Double = 0.0
)

data class PricePointDto(
    val symbol: String,
    val date: LocalDate,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Long
)

data class MarketIndexDto(
    val name: String,
    val value: Double,
    val change: Double,
    val changePercent: Double,
    val volume: Long,
    val totalMarketCap: Long = 0,
    val numberOfTransactions: Int = 0
)
