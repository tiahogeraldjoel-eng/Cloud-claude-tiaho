package com.brvm.intelligence.domain.repository

import com.brvm.intelligence.domain.model.*
import kotlinx.coroutines.flow.Flow

interface StockRepository {

    /** Flux en temps réel de toutes les actions cotées */
    fun getAllStocks(): Flow<List<Stock>>

    /** Détail d'une action par symbole */
    suspend fun getStockBySymbol(symbol: String): Stock?

    /** Recherche d'actions par nom ou symbole */
    fun searchStocks(query: String): Flow<List<Stock>>

    /** Actions filtrées par secteur */
    fun getStocksBySector(sector: BRVMSector): Flow<List<Stock>>

    /** Historique des prix pour une action */
    suspend fun getPriceHistory(symbol: String, period: HistoryPeriod): PriceHistory

    /** Synchronisation forcée depuis brvm.org */
    suspend fun refreshMarketData(): Result<Unit>

    /** Résumé global du marché (indices, top gainers/losers) */
    fun getMarketSummary(): Flow<MarketSummary>

    /** Calendrier des événements BRVM */
    suspend fun getUpcomingEvents(): List<MarketEvent>

    /** Watchlist personnelle */
    fun getWatchlist(): Flow<List<Stock>>

    suspend fun addToWatchlist(symbol: String)

    suspend fun removeFromWatchlist(symbol: String)

    /** Alertes sur cours */
    fun getPriceAlerts(): Flow<List<PriceAlert>>

    suspend fun addPriceAlert(alert: PriceAlert)

    suspend fun deletePriceAlert(alertId: Long)
}
