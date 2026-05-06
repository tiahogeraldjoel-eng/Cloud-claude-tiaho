package com.brvm.intelligence.data.local.dao

import androidx.room.*
import com.brvm.intelligence.data.local.entity.PriceHistoryEntity

@Dao
interface PriceHistoryDao {

    @Query("""
        SELECT * FROM price_history
        WHERE symbol = :symbol AND dateEpoch >= :fromEpochDay
        ORDER BY dateEpoch ASC
    """)
    suspend fun getPriceHistory(symbol: String, fromEpochDay: Long): List<PriceHistoryEntity>

    @Query("""
        SELECT * FROM price_history
        WHERE symbol = :symbol
        ORDER BY dateEpoch DESC
        LIMIT :limit
    """)
    suspend fun getLatestPrices(symbol: String, limit: Int): List<PriceHistoryEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPricePoints(prices: List<PriceHistoryEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPricePoint(price: PriceHistoryEntity)

    @Query("DELETE FROM price_history WHERE symbol = :symbol AND dateEpoch < :beforeEpochDay")
    suspend fun deleteOldHistory(symbol: String, beforeEpochDay: Long)

    @Query("SELECT COUNT(*) FROM price_history WHERE symbol = :symbol")
    suspend fun getHistoryCount(symbol: String): Int

    @Query("SELECT MAX(dateEpoch) FROM price_history WHERE symbol = :symbol")
    suspend fun getLatestDateEpoch(symbol: String): Long?

    @Query("SELECT MIN(close) FROM price_history WHERE symbol = :symbol AND dateEpoch >= :fromEpochDay")
    suspend fun getMinClose(symbol: String, fromEpochDay: Long): Double?

    @Query("SELECT MAX(close) FROM price_history WHERE symbol = :symbol AND dateEpoch >= :fromEpochDay")
    suspend fun getMaxClose(symbol: String, fromEpochDay: Long): Double?
}
