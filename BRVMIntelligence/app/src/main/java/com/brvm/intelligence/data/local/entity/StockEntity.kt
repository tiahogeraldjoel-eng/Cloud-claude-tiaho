package com.brvm.intelligence.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.brvm.intelligence.domain.model.*
import java.time.LocalDateTime

@Entity(
    tableName = "stocks",
    indices = [Index(value = ["symbol"], unique = true)]
)
data class StockEntity(
    @PrimaryKey(autoGenerate = false)
    val symbol: String,
    val name: String,
    val sector: String,              // BRVMSector.name()
    val country: String,             // BRVMCountry.name()
    val currentPrice: Double,
    val previousClose: Double,
    val change: Double,
    val changePercent: Double,
    val volume: Long,
    val marketCap: Long,
    val per: Double?,
    val dividendYield: Double?,
    val high52Week: Double,
    val low52Week: Double,
    val openPrice: Double,
    val highPrice: Double,
    val lowPrice: Double,
    val lastUpdateEpoch: Long,       // LocalDateTime -> epochSecond
    val isActive: Boolean = true,
    val liquidityLevel: String,      // LiquidityLevel.name()
    val isInWatchlist: Boolean = false
)

fun StockEntity.toDomain(): Stock = Stock(
    symbol = symbol,
    name = name,
    sector = BRVMSector.valueOf(sector),
    country = BRVMCountry.valueOf(country),
    currentPrice = currentPrice,
    previousClose = previousClose,
    change = change,
    changePercent = changePercent,
    volume = volume,
    marketCap = marketCap,
    per = per,
    dividendYield = dividendYield,
    high52Week = high52Week,
    low52Week = low52Week,
    openPrice = openPrice,
    highPrice = highPrice,
    lowPrice = lowPrice,
    lastUpdate = LocalDateTime.ofEpochSecond(lastUpdateEpoch, 0, java.time.ZoneOffset.UTC),
    isActive = isActive,
    liquidityLevel = LiquidityLevel.valueOf(liquidityLevel)
)

fun Stock.toEntity(): StockEntity = StockEntity(
    symbol = symbol,
    name = name,
    sector = sector.name,
    country = country.name,
    currentPrice = currentPrice,
    previousClose = previousClose,
    change = change,
    changePercent = changePercent,
    volume = volume,
    marketCap = marketCap,
    per = per,
    dividendYield = dividendYield,
    high52Week = high52Week,
    low52Week = low52Week,
    openPrice = openPrice,
    highPrice = highPrice,
    lowPrice = lowPrice,
    lastUpdateEpoch = lastUpdate.toEpochSecond(java.time.ZoneOffset.UTC),
    isActive = isActive,
    liquidityLevel = liquidityLevel.name
)
