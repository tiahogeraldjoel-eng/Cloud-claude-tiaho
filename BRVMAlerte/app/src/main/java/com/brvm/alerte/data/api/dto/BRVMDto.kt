package com.brvm.alerte.data.api.dto

import com.google.gson.annotations.SerializedName

data class StockListResponse(
    @SerializedName("data") val data: List<StockDto>
)

data class StockDto(
    @SerializedName("ticker") val ticker: String,
    @SerializedName("name") val name: String,
    @SerializedName("sector") val sector: String?,
    @SerializedName("country") val country: String?,
    @SerializedName("closing_price") val closingPrice: Double?,
    @SerializedName("previous_closing_price") val previousClosingPrice: Double?,
    @SerializedName("opening_price") val openingPrice: Double?,
    @SerializedName("highest") val highest: Double?,
    @SerializedName("lowest") val lowest: Double?,
    @SerializedName("volume") val volume: Long?,
    @SerializedName("market_cap") val marketCap: Double?,
    @SerializedName("per") val per: Double?,
    @SerializedName("dividend_yield") val dividendYield: Double?,
    @SerializedName("eps") val eps: Double?,
    @SerializedName("book_value") val bookValue: Double?,
    @SerializedName("price_to_book") val priceToBook: Double?,
    @SerializedName("roe") val roe: Double?,
    @SerializedName("last_trade_date") val lastTradeDate: String?
)

data class PriceHistoryResponse(
    @SerializedName("ticker") val ticker: String,
    @SerializedName("data") val data: List<PriceHistoryDto>
)

data class PriceHistoryDto(
    @SerializedName("date") val date: String,
    @SerializedName("open") val open: Double?,
    @SerializedName("high") val high: Double?,
    @SerializedName("low") val low: Double?,
    @SerializedName("close") val close: Double?,
    @SerializedName("volume") val volume: Long?
)

data class MarketSummaryDto(
    @SerializedName("brvm_composite_index") val compositeIndex: Double?,
    @SerializedName("brvm10_index") val brvm10Index: Double?,
    @SerializedName("total_volume") val totalVolume: Long?,
    @SerializedName("total_value") val totalValue: Double?,
    @SerializedName("advancing") val advancing: Int?,
    @SerializedName("declining") val declining: Int?,
    @SerializedName("unchanged") val unchanged: Int?,
    @SerializedName("date") val date: String?
)
