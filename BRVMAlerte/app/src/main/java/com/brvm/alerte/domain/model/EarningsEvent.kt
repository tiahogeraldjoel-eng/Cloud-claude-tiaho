package com.brvm.alerte.domain.model

data class EarningsEvent(
    val id: Long = 0,
    val ticker: String,
    val stockName: String,
    val eventType: EventType,
    val eventDate: Long,
    val fiscalPeriod: String,
    val estimatedEPS: Double?,
    val actualEPS: Double?,
    val estimatedRevenue: Double?,
    val actualRevenue: Double?,
    val dividendAmount: Double?,
    val exDividendDate: Long?,
    val paymentDate: Long?,
    val description: String = ""
) {
    val epsSurprise: Double?
        get() = if (estimatedEPS != null && actualEPS != null)
            ((actualEPS - estimatedEPS) / Math.abs(estimatedEPS)) * 100 else null

    val isPositiveSurprise: Boolean
        get() = epsSurprise?.let { it > 5.0 } ?: false

    val isNegativeSurprise: Boolean
        get() = epsSurprise?.let { it < -5.0 } ?: false

    enum class EventType {
        ANNUAL_RESULTS,
        SEMI_ANNUAL_RESULTS,
        QUARTERLY_RESULTS,
        DIVIDEND_ANNOUNCEMENT,
        AGO,
        AGE,
        BOARD_MEETING
    }
}
