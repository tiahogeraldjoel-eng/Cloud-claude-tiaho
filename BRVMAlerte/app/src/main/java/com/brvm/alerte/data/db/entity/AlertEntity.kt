package com.brvm.alerte.data.db.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "alerts")
data class AlertEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val ticker: String,
    val stockName: String,
    val type: String,
    val priority: String,
    val title: String,
    val message: String,
    val recommendation: String,
    val score: Int,
    val targetPrice: Double?,
    val currentPrice: Double,
    val createdAt: Long,
    val isRead: Boolean = false,
    val sentChannels: String = ""
)

@Entity(tableName = "earnings_events")
data class EarningsEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val ticker: String,
    val stockName: String,
    val eventType: String,
    val eventDate: Long,
    val fiscalPeriod: String,
    val estimatedEPS: Double?,
    val actualEPS: Double?,
    val estimatedRevenue: Double?,
    val actualRevenue: Double?,
    val dividendAmount: Double?,
    val exDividendDate: Long?,
    val paymentDate: Long?,
    val description: String
)
