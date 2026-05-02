package com.brvm.alerte.domain.model

import java.time.Instant

data class Alert(
    val id: Long = 0,
    val ticker: String,
    val stockName: String,
    val type: AlertType,
    val priority: AlertPriority,
    val title: String,
    val message: String,
    val recommendation: Recommendation,
    val score: Int,
    val targetPrice: Double?,
    val currentPrice: Double,
    val createdAt: Long = Instant.now().epochSecond,
    val isRead: Boolean = false,
    val sentChannels: Set<AlertChannel> = emptySet()
)

enum class AlertType {
    VOLUME_ANOMALY,
    TECHNICAL_BREAKOUT,
    FUNDAMENTAL_OPPORTUNITY,
    PRE_EARNINGS_SIGNAL,
    DIVIDEND_APPROACHING,
    SMART_MONEY_FLOW,
    EARNINGS_SURPRISE_POSITIVE,
    EARNINGS_SURPRISE_NEGATIVE,
    SUPPORT_BOUNCE,
    RESISTANCE_BREAK
}

enum class AlertPriority(val label: String, val emoji: String) {
    URGENT("URGENT", "🔴"),
    STRONG("FORT", "🟠"),
    MODERATE("MODÉRÉ", "🟡"),
    INFO("INFO", "🔵")
}

enum class Recommendation {
    STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
}

enum class AlertChannel {
    WHATSAPP, SMS, EMAIL, PUSH
}
