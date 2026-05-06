package com.brvm.intelligence.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.brvm.intelligence.domain.model.BRVMSector
import com.brvm.intelligence.domain.model.PortfolioPosition
import java.time.LocalDate

/** Entité Room chiffrée (AES-256 via EncryptedSharedPreferences ou SQLCipher) */
@Entity(tableName = "portfolio_positions")
data class PortfolioPositionEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val symbol: String,
    val stockName: String,
    val quantity: Int,
    val purchasePrice: Double,           // FCFA
    val purchaseDateEpoch: Long,         // LocalDate.toEpochDay()
    val currentPrice: Double,            // Mis à jour lors du refresh
    val sector: String,                  // BRVMSector.name()
    val notes: String = "",
    val lastUpdated: Long = System.currentTimeMillis()
)

fun PortfolioPositionEntity.toDomain(): PortfolioPosition = PortfolioPosition(
    id = id,
    symbol = symbol,
    stockName = stockName,
    quantity = quantity,
    purchasePrice = purchasePrice,
    purchaseDate = LocalDate.ofEpochDay(purchaseDateEpoch),
    currentPrice = currentPrice,
    sector = BRVMSector.valueOf(sector),
    notes = notes
)

fun PortfolioPosition.toEntity(): PortfolioPositionEntity = PortfolioPositionEntity(
    id = id,
    symbol = symbol,
    stockName = stockName,
    quantity = quantity,
    purchasePrice = purchasePrice,
    purchaseDateEpoch = purchaseDate.toEpochDay(),
    currentPrice = currentPrice,
    sector = sector.name,
    notes = notes
)
