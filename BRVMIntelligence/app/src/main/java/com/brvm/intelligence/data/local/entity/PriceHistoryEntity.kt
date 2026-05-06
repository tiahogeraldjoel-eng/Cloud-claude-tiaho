package com.brvm.intelligence.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.brvm.intelligence.domain.model.PricePoint
import java.time.LocalDate

@Entity(
    tableName = "price_history",
    indices = [Index(value = ["symbol", "dateEpoch"], unique = true)],
    foreignKeys = [ForeignKey(
        entity = StockEntity::class,
        parentColumns = ["symbol"],
        childColumns = ["symbol"],
        onDelete = ForeignKey.CASCADE
    )]
)
data class PriceHistoryEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val symbol: String,
    val dateEpoch: Long,             // LocalDate -> toEpochDay()
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Long,
    val adjustedClose: Double = close
)

fun PriceHistoryEntity.toDomain(): PricePoint = PricePoint(
    date = LocalDate.ofEpochDay(dateEpoch),
    open = open,
    high = high,
    low = low,
    close = close,
    volume = volume,
    adjustedClose = adjustedClose
)

fun PricePoint.toEntity(symbol: String) = PriceHistoryEntity(
    symbol = symbol,
    dateEpoch = date.toEpochDay(),
    open = open,
    high = high,
    low = low,
    close = close,
    volume = volume,
    adjustedClose = adjustedClose
)
