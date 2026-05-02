package com.brvm.alerte.data.repository

import com.brvm.alerte.data.api.BRVMApiService
import com.brvm.alerte.data.api.BRVMScraper
import com.brvm.alerte.data.db.dao.StockDao
import com.brvm.alerte.data.db.entity.PriceHistoryEntity
import com.brvm.alerte.data.db.entity.StockEntity
import com.brvm.alerte.data.db.entity.TechnicalIndicatorsEntity
import com.brvm.alerte.data.seed.BRVMSeedData
import com.brvm.alerte.domain.model.PricePoint
import com.brvm.alerte.domain.model.Stock
import com.brvm.alerte.domain.model.TechnicalIndicators
import com.brvm.alerte.domain.repository.StockRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StockRepositoryImpl @Inject constructor(
    private val api: BRVMApiService,
    private val scraper: BRVMScraper,
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
        // 1. Essayer l'API officielle
        val apiStocks = tryApiRefresh()

        // 2. Fallback: scraping de brvm.org
        val scraperStocks = if (apiStocks.isEmpty()) tryScraperRefresh() else emptyList()

        val entities = when {
            apiStocks.isNotEmpty() -> apiStocks
            scraperStocks.isNotEmpty() -> mergeWithSeed(scraperStocks)
            else -> null
        }

        if (entities != null) {
            stockDao.insertStocks(entities)
        } else {
            // Fallback final: seed data si la DB est vide
            ensureSeedData()
        }
    }

    private suspend fun tryApiRefresh(): List<StockEntity> {
        return try {
            val response = api.getAllStocks()
            response.data.map { dto ->
                StockEntity(
                    ticker = dto.ticker,
                    name = dto.name,
                    sector = dto.sector ?: sectorFromSeed(dto.ticker),
                    country = dto.country ?: countryFromSeed(dto.ticker),
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
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun tryScraperRefresh(): List<StockEntity> {
        return try {
            scraper.scrapeAllStocks().map { dto ->
                val seed = BRVMSeedData.stocks.find { it.ticker == dto.ticker }
                StockEntity(
                    ticker = dto.ticker,
                    name = dto.name.ifEmpty { seed?.name ?: dto.ticker },
                    sector = seed?.sector ?: "Divers",
                    country = seed?.country ?: "CI",
                    lastPrice = dto.closingPrice ?: seed?.lastPrice ?: 0.0,
                    previousClose = dto.previousClosingPrice ?: seed?.previousClose ?: 0.0,
                    openPrice = dto.openingPrice ?: seed?.openPrice ?: 0.0,
                    highPrice = dto.highest ?: seed?.highPrice ?: 0.0,
                    lowPrice = dto.lowest ?: seed?.lowPrice ?: 0.0,
                    volume = dto.volume ?: seed?.volume ?: 0L,
                    averageVolume20d = seed?.averageVolume20d ?: 0L,
                    marketCap = dto.marketCap ?: seed?.marketCap ?: 0.0,
                    peRatio = dto.per ?: seed?.peRatio,
                    dividendYield = dto.dividendYield ?: seed?.dividendYield,
                    eps = dto.eps ?: seed?.eps,
                    bookValue = dto.bookValue ?: seed?.bookValue,
                    priceToBook = dto.priceToBook ?: seed?.priceToBook,
                    roe = dto.roe ?: seed?.roe,
                    debtToEquity = null, revenueGrowth = null, netIncomeGrowth = null,
                    lastUpdated = System.currentTimeMillis()
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun mergeWithSeed(scraped: List<StockEntity>): List<StockEntity> {
        val scrapedTickers = scraped.map { it.ticker }.toSet()
        val missingFromSeed = BRVMSeedData.stocks.filter { it.ticker !in scrapedTickers }
        return scraped + missingFromSeed
    }

    private suspend fun ensureSeedData() {
        val existing = stockDao.getAllStocks()
        if (existing.isEmpty()) {
            stockDao.insertStocks(BRVMSeedData.stocks)
        }
    }

    override suspend fun refreshPriceHistory(ticker: String) {
        // 1. Essayer l'API officielle
        val apiHistory = tryApiHistory(ticker)

        if (apiHistory.isNotEmpty()) {
            stockDao.insertPriceHistory(apiHistory)
        } else {
            // 2. Scraper
            val scraperHistory = tryScraperHistory(ticker)
            if (scraperHistory.isNotEmpty()) {
                stockDao.insertPriceHistory(scraperHistory)
            } else {
                // 3. Générer un historique GBM réaliste depuis le seed
                val existing = stockDao.getPriceHistory(ticker, 1)
                if (existing.isEmpty()) {
                    val stock = stockDao.getStock(ticker)
                        ?: BRVMSeedData.stocks.find { it.ticker == ticker }
                    if (stock != null) {
                        val generated = BRVMSeedData.generateHistory(ticker, stock.lastPrice)
                        stockDao.insertPriceHistory(generated)
                    }
                }
            }
        }

        // Calculer la moyenne de volume sur 20j
        val recentHistory = stockDao.getPriceHistory(ticker, 20)
        if (recentHistory.isNotEmpty()) {
            val avgVol = recentHistory.map { it.volume }.average().toLong()
            stockDao.updateAverageVolume(ticker, avgVol)
        }

        val cutoff = System.currentTimeMillis() - (400L * 24 * 3600 * 1000)
        stockDao.pruneOldHistory(ticker, cutoff)
    }

    private suspend fun tryApiHistory(ticker: String): List<PriceHistoryEntity> {
        return try {
            val endDate = LocalDate.now().format(dateFormatter)
            val startDate = LocalDate.now().minusYears(1).format(dateFormatter)
            val response = api.getPriceHistory(ticker, startDate, endDate)
            response.data.mapNotNull { dto ->
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
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun tryScraperHistory(ticker: String): List<PriceHistoryEntity> {
        return try {
            scraper.scrapeHistory(ticker).mapNotNull { dto ->
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
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getPriceHistory(ticker: String, limit: Int): List<PricePoint> =
        stockDao.getPriceHistory(ticker, limit).map {
            PricePoint(it.date, it.open, it.high, it.low, it.close, it.volume)
        }

    override suspend fun saveTechnicalIndicators(indicators: TechnicalIndicators) =
        stockDao.insertTechnicalIndicators(indicators.toEntity())

    override suspend fun getTechnicalIndicators(ticker: String): TechnicalIndicators? =
        stockDao.getTechnicalIndicators(ticker)?.toDomain()

    override suspend fun updateWatchlistStatus(ticker: String, watchlisted: Boolean) =
        stockDao.updateWatchlistStatus(ticker, watchlisted)

    private fun sectorFromSeed(ticker: String) =
        BRVMSeedData.stocks.find { it.ticker == ticker }?.sector ?: "Divers"

    private fun countryFromSeed(ticker: String) =
        BRVMSeedData.stocks.find { it.ticker == ticker }?.country ?: "CI"

    private fun parseDate(dateStr: String): Long {
        return try {
            LocalDate.parse(dateStr, dateFormatter).toEpochDay() * 86400L
        } catch (e: Exception) {
            try {
                // Format alternatif dd/MM/yyyy
                val parts = dateStr.split("/")
                if (parts.size == 3) {
                    LocalDate.of(parts[2].toInt(), parts[1].toInt(), parts[0].toInt()).toEpochDay() * 86400L
                } else System.currentTimeMillis() / 1000
            } catch (e2: Exception) {
                System.currentTimeMillis() / 1000
            }
        }
    }

    private fun StockEntity.toDomain() = Stock(
        ticker = ticker, name = name, sector = sector, country = country,
        lastPrice = lastPrice, previousClose = previousClose,
        openPrice = openPrice, highPrice = highPrice, lowPrice = lowPrice,
        volume = volume, averageVolume20d = averageVolume20d,
        marketCap = marketCap, peRatio = peRatio, dividendYield = dividendYield,
        eps = eps, bookValue = bookValue, priceToBook = priceToBook, roe = roe,
        debtToEquity = debtToEquity, revenueGrowth = revenueGrowth,
        netIncomeGrowth = netIncomeGrowth, lastUpdated = lastUpdated
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
