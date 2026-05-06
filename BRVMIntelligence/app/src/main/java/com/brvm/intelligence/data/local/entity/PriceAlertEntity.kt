package com.brvm.intelligence.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.brvm.intelligence.domain.model.AlertType
import com.brvm.intelligence.domain.model.PriceAlert

@Entity(tableName = "price_alerts")
data class PriceAlertEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val symbol: String,
    val alertType: String,          // AlertType.name()
    val targetPrice: Double,
    val isActive: Boolean = true,
    val notifyAbove: Boolean = true,
    val createdAt: Long = System.currentTimeMillis()
)

fun PriceAlertEntity.toDomain() = PriceAlert(
    id = id,
    symbol = symbol,
    alertType = AlertType.valueOf(alertType),
    targetPrice = targetPrice,
    isActive = isActive,
    notifyAbove = notifyAbove
)

fun PriceAlert.toEntity() = PriceAlertEntity(
    id = id,
    symbol = symbol,
    alertType = alertType.name,
    targetPrice = targetPrice,
    isActive = isActive,
    notifyAbove = notifyAbove
)
