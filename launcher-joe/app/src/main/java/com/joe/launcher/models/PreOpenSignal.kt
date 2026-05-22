package com.joe.launcher.models

import com.google.gson.annotations.SerializedName

/**
 * Résultat de l'analyse pré-ouverture pour un titre BRVM.
 * Mappé directement depuis le payload JSON du scanner Python ou recalculé
 * localement par [com.joe.launcher.services.PreOpenScannerWorker].
 */
data class PreOpenSignal(
    @SerializedName("ticker")            val ticker:           String,
    @SerializedName("name")              val name:             String,
    @SerializedName("theo_open_price")   val theoOpenPrice:    Double,
    @SerializedName("ref_price")         val refPrice:         Double,
    @SerializedName("mpr")               val mpr:              Double,
    @SerializedName("obi")               val obi:              Double,
    @SerializedName("spread_pct")        val spreadPct:        Double,
    @SerializedName("best_bid_volume")   val bestBidVolume:    Int,
    @SerializedName("total_bid_volume")  val totalBidVolume:   Int,
    @SerializedName("total_ask_volume")  val totalAskVolume:   Int,
    @SerializedName("avg_daily_volume")  val avgDailyVolume:   Int,
    @SerializedName("iceberg_detected")  val icebergDetected:  Boolean,
    @SerializedName("alert_reasons")     val alertReasons:     List<String>,
    @SerializedName("confidence")        val confidence:       String,
    @SerializedName("action_message")    val actionMessage:    String,
    @SerializedName("timestamp_gmt")     val timestampGmt:     String,
    @SerializedName("data_quality")      val dataQuality:      String = "LIVE",
) {
    val priceChange: Double get() = theoOpenPrice - refPrice
    val priceChangePct: Double get() = if (refPrice > 0) (priceChange / refPrice) * 100 else 0.0
    val isHighConfidence: Boolean get() = confidence == "HIGH"
    val isMediumConfidence: Boolean get() = confidence == "MEDIUM"
}

/** Niveaux d'un carnet d'ordres (bid ou ask). */
data class OrderLevel(
    val price:  Double,
    val volume: Int,
) {
    val value: Double get() = price * volume
}

/** Carnet d'ordres brut pour un titre. */
data class OrderBook(
    val ticker:       String,
    val bids:         List<OrderLevel>,
    val asks:         List<OrderLevel>,
    val isSynthetic:  Boolean = false,
) {
    val bestBid: OrderLevel? get() = bids.firstOrNull()
    val bestAsk: OrderLevel? get() = asks.firstOrNull()

    val spread: Double? get() = if (bestBid != null && bestAsk != null)
        bestAsk!!.price - bestBid!!.price else null

    val spreadPct: Double? get() {
        val s = spread ?: return null
        val mid = ((bestBid?.price ?: 0.0) + (bestAsk?.price ?: 0.0)) / 2
        return if (mid > 0) (s / mid) * 100 else null
    }

    val totalBidVolume: Int get() = bids.sumOf { it.volume }
    val totalAskVolume: Int get() = asks.sumOf { it.volume }
}
