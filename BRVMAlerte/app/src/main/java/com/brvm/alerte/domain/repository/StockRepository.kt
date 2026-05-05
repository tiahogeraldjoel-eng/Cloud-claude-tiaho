package com.brvm.alerte.domain.repository

import com.brvm.alerte.domain.model.PricePoint
import com.brvm.alerte.domain.model.Stock
import com.brvm.alerte.domain.model.TechnicalIndicators
import kotlinx.coroutines.flow.Flow

interface StockRepository {
    fun observeAllStocks(): Flow<List<Stock>>
    fun observeWatchlist(): Flow<List<Stock>>
    fun observeStock(ticker: String): Flow<Stock?>
    suspend fun refreshAllStocks()
    suspend fun refreshPriceHistory(ticker: String)
    suspend fun getPriceHistory(ticker: String, limit: Int = 200): List<PricePoint>
    suspend fun saveTechnicalIndicators(indicators: TechnicalIndicators)
    suspend fun getTechnicalIndicators(ticker: String): TechnicalIndicators?
    suspend fun updateWatchlistStatus(ticker: String, watchlisted: Boolean)
}
