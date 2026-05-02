package com.brvm.alerte.data.repository

import com.brvm.alerte.data.api.BRVMApiService
import com.brvm.alerte.data.db.dao.StockDao
import com.brvm.alerte.data.db.entity.PriceHistoryEntity
import com.brvm.alerte.data.db.entity.StockEntity
import com.brvm.alerte.data.db.entity.TechnicalIndicatorsEntity
import com.brvm.alerte.domain.model.PricePoint
import com.brvm.alerte.domain.model.Stock
import com.brvm.alerte.domain.model.TechnicalIndicators
import com.brvm.alerte.domain.repository.StockRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StockRepositoryImpl @Inject constructor(
    private val api: BRVMApiService,
    private val stockDao: StockDao
) : StockRepository {

    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    override fun observeAllStocks(): Flow<List<Stock>> =
        stockDao.observeAllStocks().map { entities -> entities.map { it.toDomain() } }

    override fun observeWatchlist(): Flow<List<Stock>> =
        stockDao.observeWatchlist().map { entities -> entities.map { it.toDomain() } }

    override fun observeStock(ticker: String): Flow<Stock?> =
        stockDao.observeStock(ticker).map { it?.toDomain() }

    override suspend fun refreshAllStocks() {
        val response = api.getAllStocks()
        val entities = response.data.map { dto ->
            StockEntity(
                ticker = dto.ticker,
                name = dto.name,
                sector = dto.sector ?: "Divers",
                country = dto.country ?: "Côte d'Ivoire",
                lastPrice = dto.closingPrice ?: 0.0,
                previousClose = dto.previousClosingPrice ?: 0.0,
                openPrice = dto.openingPrice ?: 0.0,
                highPrice = dto.highest ?: 0.0,
                lowPrice = dto.lowest ?: 0.0,
                volume = dto.volume ?: 0L,
                averageVolume20d = 0L,
                marketCap = dto.marketCap ?: 0.0,
                peRatio = dto.per,
                dividendYield = dto.dividendYield,
                eps = dto.eps,
                bookValue = dto.bookValue,
                priceToBook = dto.priceToBook,
                roe = dto.roe,
                debtToEquity = null,
                revenueGrowth = null,
                netIncomeGrowth = null,
                lastUpdated = System.currentTimeMillis()
            )
        }
        stockDao.insertStocks(entities)
    }

    override suspend fun refreshPriceHistory(ticker: String) {
        val endDate = LocalDate.now().format(dateFormatter)
        val startDate = LocalDate.now().minusYears(1).format(dateFormatter)
        val response = api.getPriceHistory(ticker, startDate, endDate)

        val entities = response.data.mapNotNull { dto ->
            if (dto.close == null) return@mapNotNull null
            PriceHistoryEntity(
                ticker = ticker,
                date = parseDate(dto.date),
                open = dto.open ?: dto.close,
                high = dto.high ?: dto.close,
                low = dto.low ?: dto.close,
                close = dto.close,
                volume = dto.volume ?: 0L
            )
        }
        stockDao.insertPriceHistory(entities)

        val recentHistory = stockDao.getPriceHistory(ticker, 20)
        if (recentHistory.isNotEmpty()) {
            val avgVol = recentHistory.map { it.volume }.average().toLong()
            stockDao.updateAverageVolume(ticker, avgVol)
        }

        val cutoff = System.currentTimeMillis() - (400L * 24 * 3600 * 1000)
        stockDao.pruneOldHistory(ticker, cutoff)
    }

    override suspend fun getPriceHistory(ticker: String, limit: Int): List<PricePoint> =
        stockDao.getPriceHistory(ticker, limit).map {
            PricePoint(it.date, it.open, it.high, it.low, it.close, it.volume)
        }

    override suspend fun saveTechnicalIndicators(indicators: TechnicalIndicators) {
        stockDao.insertTechnicalIndicators(indicators.toEntity())
    }

    override suspend fun getTechnicalIndicators(ticker: String): TechnicalIndicators? =
        stockDao.getTechnicalIndicators(ticker)?.toDomain()

    override suspend fun updateWatchlistStatus(ticker: String, watchlisted: Boolean) =
        stockDao.updateWatchlistStatus(ticker, watchlisted)

    private fun parseDate(dateStr: String): Long {
        return try {
            LocalDate.parse(dateStr, dateFormatter).toEpochDay() * 86400L
        } catch (e: Exception) {
            System.currentTimeMillis() / 1000
        }
    }

    private fun StockEntity.toDomain() = Stock(
        ticker = ticker,
        name = name,
        sector = sector,
        country = country,
        lastPrice = lastPrice,
        previousClose = previousClose,
        openPrice = openPrice,
        highPrice = highPrice,
        lowPrice = lowPrice,
        volume = volume,
        averageVolume20d = averageVolume20d,
        marketCap = marketCap,
        peRatio = peRatio,
        dividendYield = dividendYield,
        eps = eps,
        bookValue = bookValue,
        priceToBook = priceToBook,
        roe = roe,
        debtToEquity = debtToEquity,
        revenueGrowth = revenueGrowth,
        netIncomeGrowth = netIncomeGrowth,
        lastUpdated = lastUpdated
    )

    private fun TechnicalIndicatorsEntity.toDomain() = TechnicalIndicators(
        ticker, rsi14, macdLine, macdSignal, macdHistogram,
        bollingerUpper, bollingerMiddle, bollingerLower,
        sma20, sma50, sma200, ema12, ema26, atr14,
        stochasticK, stochasticD, adx14, obv, moneyFlowIndex
    )

    private fun TechnicalIndicators.toEntity() = TechnicalIndicatorsEntity(
        ticker, rsi14, macdLine, macdSignal, macdHistogram,
        bollingerUpper, bollingerMiddle, bollingerLower,
        sma20, sma50, sma200, ema12, ema26, atr14,
        stochasticK, stochasticD, adx14, obv, moneyFlowIndex,
        System.currentTimeMillis()
    )
}
