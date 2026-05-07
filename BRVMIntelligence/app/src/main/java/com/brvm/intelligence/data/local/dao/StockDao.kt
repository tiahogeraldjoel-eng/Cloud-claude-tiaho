package com.brvm.intelligence.data.local.dao

import androidx.room.*
import com.brvm.intelligence.data.local.entity.StockEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface StockDao {

    @Query("SELECT * FROM stocks WHERE isActive = 1 ORDER BY marketCap DESC")
    fun getAllStocks(): Flow<List<StockEntity>>

    @Query("SELECT COUNT(*) FROM stocks")
    suspend fun countStocks(): Int

    @Query("SELECT * FROM stocks WHERE symbol = :symbol LIMIT 1")
    suspend fun getStockBySymbol(symbol: String): StockEntity?

    @Query("""
        SELECT * FROM stocks
        WHERE (symbol LIKE '%' || :query || '%' OR name LIKE '%' || :query || '%')
        AND isActive = 1
        ORDER BY volume DESC
    """)
    fun searchStocks(query: String): Flow<List<StockEntity>>

    @Query("SELECT * FROM stocks WHERE sector = :sector AND isActive = 1 ORDER BY changePercent DESC")
    fun getStocksBySector(sector: String): Flow<List<StockEntity>>

    @Query("SELECT * FROM stocks WHERE isInWatchlist = 1 ORDER BY symbol ASC")
    fun getWatchlist(): Flow<List<StockEntity>>

    @Query("SELECT * FROM stocks ORDER BY changePercent DESC LIMIT :limit")
    suspend fun getTopGainers(limit: Int = 5): List<StockEntity>

    @Query("SELECT * FROM stocks ORDER BY changePercent ASC LIMIT :limit")
    suspend fun getTopLosers(limit: Int = 5): List<StockEntity>

    @Query("SELECT * FROM stocks ORDER BY volume DESC LIMIT :limit")
    suspend fun getMostActive(limit: Int = 5): List<StockEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStock(stock: StockEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStocks(stocks: List<StockEntity>)

    @Update
    suspend fun updateStock(stock: StockEntity)

    @Query("UPDATE stocks SET isInWatchlist = 1 WHERE symbol = :symbol")
    suspend fun addToWatchlist(symbol: String)

    @Query("UPDATE stocks SET isInWatchlist = 0 WHERE symbol = :symbol")
    suspend fun removeFromWatchlist(symbol: String)

    @Query("UPDATE stocks SET currentPrice = :price, change = :change, changePercent = :changePercent, volume = :volume, lastUpdateEpoch = :epoch WHERE symbol = :symbol")
    suspend fun updatePrice(
        symbol: String,
        price: Double,
        change: Double,
        changePercent: Double,
        volume: Long,
        epoch: Long
    )

    @Query("SELECT COUNT(*) FROM stocks")
    suspend fun getStockCount(): Int

    @Query("SELECT SUM(marketCap) FROM stocks WHERE isActive = 1")
    suspend fun getTotalMarketCap(): Long?

    @Query("SELECT SUM(volume) FROM stocks WHERE isActive = 1")
    suspend fun getTotalVolume(): Long?

    @Query("SELECT MAX(lastUpdateEpoch) FROM stocks")
    suspend fun getLastUpdateEpoch(): Long?
}
