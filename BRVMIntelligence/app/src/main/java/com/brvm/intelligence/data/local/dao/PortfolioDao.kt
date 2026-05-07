package com.brvm.intelligence.data.local.dao

import androidx.room.*
import com.brvm.intelligence.data.local.entity.PortfolioPositionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PortfolioDao {

    @Query("SELECT * FROM portfolio_positions ORDER BY lastUpdated DESC")
    fun getAllPositions(): Flow<List<PortfolioPositionEntity>>

    @Query("SELECT * FROM portfolio_positions WHERE symbol = :symbol LIMIT 1")
    suspend fun getPositionBySymbol(symbol: String): PortfolioPositionEntity?

    @Query("SELECT * FROM portfolio_positions WHERE id = :id LIMIT 1")
    suspend fun getPositionById(id: Long): PortfolioPositionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPosition(position: PortfolioPositionEntity): Long

    @Update
    suspend fun updatePosition(position: PortfolioPositionEntity)

    @Query("DELETE FROM portfolio_positions WHERE id = :id")
    suspend fun deletePosition(id: Long)

    @Query("UPDATE portfolio_positions SET currentPrice = :price, lastUpdated = :timestamp WHERE symbol = :symbol")
    suspend fun updateCurrentPrice(symbol: String, price: Double, timestamp: Long = System.currentTimeMillis())

    @Query("SELECT SUM(currentPrice * quantity) FROM portfolio_positions")
    fun getTotalValue(): Flow<Double?>

    @Query("SELECT SUM(purchasePrice * quantity) FROM portfolio_positions")
    suspend fun getTotalCost(): Double?

    @Query("SELECT COUNT(*) FROM portfolio_positions")
    suspend fun getPositionCount(): Int
}
