package com.brvm.intelligence.domain.model

import java.time.LocalDate

/** Point de données historique pour une action BRVM */
data class PricePoint(
    val date: LocalDate,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Long,
    val adjustedClose: Double = close
)

/** Historique complet des prix avec indicateurs calculés */
data class PriceHistory(
    val symbol: String,
    val prices: List<PricePoint>,
    val period: HistoryPeriod
)

enum class HistoryPeriod(val days: Int, val displayName: String) {
    ONE_WEEK(7, "1 semaine"),
    ONE_MONTH(30, "1 mois"),
    THREE_MONTHS(90, "3 mois"),
    SIX_MONTHS(180, "6 mois"),
    ONE_YEAR(365, "1 an"),
    THREE_YEARS(1095, "3 ans"),
    FIVE_YEARS(1825, "5 ans")
}
