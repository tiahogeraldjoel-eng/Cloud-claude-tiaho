package com.brvm.alerte.data.db.dao

import androidx.room.*
import com.brvm.alerte.data.db.entity.PriceHistoryEntity
import com.brvm.alerte.data.db.entity.StockEntity
import com.brvm.alerte.data.db.entity.TechnicalIndicatorsEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface StockDao {

    @Query("SELECT * FROM stocks ORDER BY name ASC")
    fun observeAllStocks(): Flow<List<StockEntity>>

    @Query("SELECT * FROM stocks WHERE ticker = :ticker")
    fun observeStock(ticker: String): Flow<StockEntity?>

    @Query("SELECT * FROM stocks WHERE isWatchlisted = 1 ORDER BY name ASC")
    fun observeWatchlist(): Flow<List<StockEntity>>

    @Query("SELECT * FROM stocks ORDER BY name ASC")
    suspend fun getAllStocks(): List<StockEntity>

    @Query("SELECT * FROM stocks WHERE ticker = :ticker")
    suspend fun getStock(ticker: String): StockEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStocks(stocks: List<StockEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStock(stock: StockEntity)

    @Query("UPDATE stocks SET isWatchlisted = :watchlisted WHERE ticker = :ticker")
    suspend fun updateWatchlistStatus(ticker: String, watchlisted: Boolean)

    @Query("UPDATE stocks SET averageVolume20d = :avg WHERE ticker = :ticker")
    suspend fun updateAverageVolume(ticker: String, avg: Long)

    @Query("DELETE FROM price_history WHERE ticker = :ticker AND date < :beforeDate")
    suspend fun pruneOldHistory(ticker: String, beforeDate: Long)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPriceHistory(history: List<PriceHistoryEntity>)

    @Query("SELECT * FROM price_history WHERE ticker = :ticker ORDER BY date DESC LIMIT :limit")
    suspend fun getPriceHistory(ticker: String, limit: Int = 200): List<PriceHistoryEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTechnicalIndicators(indicators: TechnicalIndicatorsEntity)

    @Query("SELECT * FROM technical_indicators WHERE ticker = :ticker")
    suspend fun getTechnicalIndicators(ticker: String): TechnicalIndicatorsEntity?

    @Query("SELECT * FROM technical_indicators")
    fun observeAllIndicators(): Flow<List<TechnicalIndicatorsEntity>>
}
