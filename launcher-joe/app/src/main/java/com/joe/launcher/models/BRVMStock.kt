package com.joe.launcher.models

data class BRVMStock(
    val symbol: String,
    val name: String,
    val price: Double,
    val previousPrice: Double,
    val change: Double,
    val changePercent: Double,
    val volume: Double,
    val marketCap: Double = 0.0,
    val high52w: Double = 0.0,
    val low52w: Double = 0.0,
    val country: String = "",
    val sector: String = "",
    var isFavorite: Boolean = false,
    val lastUpdated: Long = System.currentTimeMillis()
) {
    val isUp: Boolean get() = change > 0
    val isDown: Boolean get() = change < 0
}
