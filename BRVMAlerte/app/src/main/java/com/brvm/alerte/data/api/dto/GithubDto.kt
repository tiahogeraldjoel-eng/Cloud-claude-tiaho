package com.brvm.alerte.data.api.dto

import com.google.gson.annotations.SerializedName

data class GithubStockResponse(
    @SerializedName("last_updated") val lastUpdated: String,
    @SerializedName("source")       val source: String,
    @SerializedName("count")        val count: Int,
    @SerializedName("stocks")       val stocks: List<GithubStockEntry>
)

data class GithubStockEntry(
    @SerializedName("ticker")                val ticker: String,
    @SerializedName("closing_price")         val closingPrice: Double?,
    @SerializedName("previous_closing_price") val previousClosingPrice: Double?,
    @SerializedName("volume")               val volume: Long?,
    @SerializedName("change_pct")           val changePct: Double?
)
