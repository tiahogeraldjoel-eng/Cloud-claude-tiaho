package com.brvm.alerte.data.repository

import android.util.Log
import com.brvm.alerte.data.api.BRVMApiService
import com.brvm.alerte.data.api.BRVMScraper
import com.brvm.alerte.data.api.GithubStockService
import com.brvm.alerte.data.api.WorkerStockService
import com.brvm.alerte.data.db.dao.StockDao
import com.brvm.alerte.data.db.entity.PriceHistoryEntity
import com.brvm.alerte.data.db.entity.StockEntity
import com.brvm.alerte.data.db.entity.TechnicalIndicatorsEntity
import com.brvm.alerte.data.seed.BRVMSeedData
import com.brvm.alerte.domain.model.PricePoint
import com.brvm.alerte.domain.model.Stock
import com.brvm.alerte.domain.model.TechnicalIndicators
import com.brvm.alerte.domain.repository.StockRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "StockRepo"

@Singleton
class StockRepositoryImpl @Inject constructor(
    private val api: BRVMApiService,
    private val scraper: BRVMScraper,
    private val workerService: WorkerStockService,
    private val githubService: GithubStockService,
    private val stockDao: StockDao
) : StockRepository {

    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    override fun observeAllStocks(): Flow<List<Stock>> =
        stockDao.observeAllStocks().map { entities -> entities.map { it.toDomain() } }

    override fun observeWatchlist(): Flow<List<Stock>> =
        stockDao.observeWatchlist().map { entities -> entities.map { it.toDomain() } }

    override fun observeStock(ticker: String): Flow<Stock?> =
        stockDao.observeStock(ticker).map { it?.toDomain() }

    /**
     * Stratégie en 5 phases — s'arrête dès qu'une phase réussit.
     *
     * Phase 0 : Cloudflare Worker (API dédiée, scraping serveur, toujours dispo)
     * Phase 1 : GitHub Actions JSON (fallback si Worker non encore déployé)
     * Phase 2 : brvm.org + SikaFinance bulk en PARALLÈLE
     * Phase 3 : SikaFinance par lots de 5 (rate-limit friendly)
     * Phase 4 : seed data garantie en dernier recours
     */
    override suspend fun refreshAllStocks() = withContext(Dispatchers.IO) {
        ensureSeedData()

        // ── Phase 0 : Cloudflare Worker ───────────────────────────────────────
        val workerStocks = tryWorkerRefresh()
        if (workerStocks.size >= 10) {
            Log.d(TAG, "Phase 0 OK — ${workerStocks.size} titres depuis Cloudflare Worker")
            stockDao.insertStocks(mergeWithSeed(workerStocks))
            return@withContext
        }
        Log.w(TAG, "Phase 0 KO (${workerStocks.size}), tentative GitHub JSON")

        // ── Phase 1 : GitHub Actions JSON ────────────────────────────────────
        val githubStocks = tryGithubRefresh()
        if (githubStocks.size >= 10) {
            Log.d(TAG, "Phase 1 OK — ${githubStocks.size} titres depuis GitHub")
            stockDao.insertStocks(mergeWithSeed(githubStocks))
            return@withContext
        }
        Log.w(TAG, "Phase 1 KO (${githubStocks.size}), tentative scraping direct")

        // ── Phase 1 : bulk en parallèle ──────────────────────────────────────
        val (brvmStocks, sikaStocks) = coroutineScope {
            val brvm = async { tryBrvmBulkRefresh() }
            val sika = async { trySikaBulkRefresh() }
            brvm.await() to sika.await()
        }

        val phase1 = (brvmStocks + sikaStocks).distinctBy { it.ticker }
        if (phase1.size >= 10) {
            Log.d(TAG, "Phase 1 OK — ${phase1.size} titres")
            stockDao.insertStocks(mergeWithSeed(phase1))
            return@withContext
        }
        Log.w(TAG, "Phase 1 partielle (${phase1.size}), tentative phase 2")

        // ── Phase 2 : SikaFinance par lots de 5 ──────────────────────────────
        val chunkedStocks = tryChunkedSikaRefresh()
        if (chunkedStocks.size >= 10) {
            Log.d(TAG, "Phase 2 OK — ${chunkedStocks.size} titres")
            stockDao.insertStocks(mergeWithSeed(chunkedStocks))
            return@withContext
        }

        // ── Phase 3 : les données partielles sont quand même sauvegardées ────
        val best = (phase1 + chunkedStocks).distinctBy { it.ticker }
        if (best.isNotEmpty()) {
            Log.w(TAG, "Résultat partiel — ${best.size} titres mis à jour")
            stockDao.insertStocks(mergeWithSeed(best))
        } else {
            Log.e(TAG, "Toutes les sources ont échoué — seed data conservé")
        }
    }

    // ── Phase 0 : Cloudflare Worker ───────────────────────────────────────────

    private suspend fun tryWorkerRefresh(): List<StockEntity> {
        return try {
            val response = workerService.getLatestStocks()
            Log.d(TAG, "Cloudflare Worker: ${response.count} titres — ${response.lastUpdated}")
            response.stocks.mapNotNull { entry ->
                val close = entry.closingPrice?.takeIf { it > 0 } ?: return@mapNotNull null
                val seed = BRVMSeedData.stocks.find { it.ticker == entry.ticker }
                StockEntity(
                    ticker = entry.ticker,
                    name = seed?.name ?: entry.ticker,
                    sector = seed?.sector ?: "Divers",
                    country = seed?.country ?: "CI",
                    lastPrice = close,
                    previousClose = entry.previousClosingPrice?.takeIf { it > 0 } ?: close,
                    openPrice = seed?.openPrice ?: close,
                    highPrice = seed?.highPrice ?: close,
                    lowPrice = seed?.lowPrice ?: close,
                    volume = entry.volume ?: seed?.volume ?: 0L,
                    averageVolume20d = seed?.averageVolume20d ?: 0L,
                    marketCap = seed?.marketCap ?: 0.0,
                    peRatio = seed?.peRatio, dividendYield = seed?.dividendYield,
                    eps = seed?.eps, bookValue = seed?.bookValue,
                    priceToBook = seed?.priceToBook, roe = seed?.roe,
                    debtToEquity = null, revenueGrowth = null, netIncomeGrowth = null,
                    lastUpdated = System.currentTimeMillis(),
                    isWatchlisted = seed?.isWatchlisted ?: false
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Cloudflare Worker KO: ${e.message}")
            emptyList()
        }
    }

    // ── Phase 1 : GitHub Actions JSON ────────────────────────────────────────

    private suspend fun tryGithubRefresh(): List<StockEntity> {
        return try {
            val response = githubService.getLatestStocks()
            Log.d(TAG, "GitHub JSON: ${response.count} titres — source=${response.source} mis à jour ${response.lastUpdated}")
            response.stocks.mapNotNull { entry ->
                val close = entry.closingPrice?.takeIf { it > 0 } ?: return@mapNotNull null
                val seed = BRVMSeedData.stocks.find { it.ticker == entry.ticker }
                StockEntity(
                    ticker = entry.ticker,
                    name = seed?.name ?: entry.ticker,
                    sector = seed?.sector ?: "Divers",
                    country = seed?.country ?: "CI",
                    lastPrice = close,
                    previousClose = entry.previousClosingPrice?.takeIf { it > 0 } ?: close,
                    openPrice = seed?.openPrice ?: close,
                    highPrice = seed?.highPrice ?: close,
                    lowPrice = seed?.lowPrice ?: close,
                    volume = entry.volume ?: seed?.volume ?: 0L,
                    averageVolume20d = seed?.averageVolume20d ?: 0L,
                    marketCap = seed?.marketCap ?: 0.0,
                    peRatio = seed?.peRatio,
                    dividendYield = seed?.dividendYield,
                    eps = seed?.eps,
                    bookValue = seed?.bookValue,
                    priceToBook = seed?.priceToBook,
                    roe = seed?.roe,
                    debtToEquity = null, revenueGrowth = null, netIncomeGrowth = null,
                    lastUpdated = System.currentTimeMillis(),
                    isWatchlisted = seed?.isWatchlisted ?: false
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "GitHub JSON KO: ${e.message}")
            emptyList()
        }
    }

    // ── Phase 1a : brvm.org (direct + proxies CORS) ──────────────────────────

    private fun tryBrvmBulkRefresh(): List<StockEntity> {
        return try {
            val dtos = scraper.scrapeAllStocks()
            Log.d(TAG, "brvm.org → ${dtos.size} titres")
            dtos.map { dto ->
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
                    lastUpdated = System.currentTimeMillis(),
                    isWatchlisted = seed?.isWatchlisted ?: false
                )
            }.filter { it.lastPrice > 0 }
        } catch (e: Exception) {
            Log.e(TAG, "brvm.org bulk échoué: ${e.message}")
            emptyList()
        }
    }

    // ── Phase 1b : SikaFinance page AàZ (une seule requête) ──────────────────

    private fun trySikaBulkRefresh(): List<StockEntity> {
        return try {
            val dtos = scraper.scrapeSikaBulk()
            Log.d(TAG, "SikaFinance bulk → ${dtos.size} titres")
            dtos.map { dto ->
                val seed = BRVMSeedData.stocks.find { it.ticker == dto.ticker }
                StockEntity(
                    ticker = dto.ticker,
                    name = dto.name.ifEmpty { seed?.name ?: dto.ticker },
                    sector = seed?.sector ?: "Divers",
                    country = seed?.country ?: "CI",
                    lastPrice = dto.closingPrice ?: seed?.lastPrice ?: 0.0,
                    previousClose = dto.previousClosingPrice ?: seed?.previousClose ?: 0.0,
                    openPrice = seed?.openPrice ?: 0.0,
                    highPrice = seed?.highPrice ?: 0.0,
                    lowPrice = seed?.lowPrice ?: 0.0,
                    volume = dto.volume ?: seed?.volume ?: 0L,
                    averageVolume20d = seed?.averageVolume20d ?: 0L,
                    marketCap = seed?.marketCap ?: 0.0,
                    peRatio = seed?.peRatio,
                    dividendYield = dto.dividendYield ?: seed?.dividendYield,
                    eps = seed?.eps, bookValue = seed?.bookValue,
                    priceToBook = seed?.priceToBook, roe = seed?.roe,
                    debtToEquity = null, revenueGrowth = null, netIncomeGrowth = null,
                    lastUpdated = System.currentTimeMillis(),
                    isWatchlisted = seed?.isWatchlisted ?: false
                )
            }.filter { it.lastPrice > 0 }
        } catch (e: Exception) {
            Log.e(TAG, "SikaFinance bulk échoué: ${e.message}")
            emptyList()
        }
    }

    // ── Phase 2 : SikaFinance par lots de 5 (rate-limit friendly) ────────────

    private suspend fun tryChunkedSikaRefresh(): List<StockEntity> = coroutineScope {
        val results = mutableListOf<StockEntity>()
        val chunks = BRVMSeedData.stocks.chunked(5)

        for ((index, chunk) in chunks.withIndex()) {
            val chunkResults = chunk.map { seed ->
                async {
                    try {
                        val dto = scraper.scrapeCurrentPrice(seed.ticker) ?: return@async null
                        seed.copy(
                            lastPrice = dto.closingPrice ?: seed.lastPrice,
                            previousClose = dto.previousClosingPrice ?: seed.previousClose,
                            openPrice = dto.openingPrice ?: seed.openPrice,
                            highPrice = dto.highest ?: seed.highPrice,
                            lowPrice = dto.lowest ?: seed.lowPrice,
                            volume = dto.volume ?: seed.volume,
                            lastUpdated = System.currentTimeMillis()
                        ).takeIf { (dto.closingPrice ?: 0.0) > 0 }
                    } catch (_: Exception) { null }
                }
            }.mapNotNull { it.await() }

            results.addAll(chunkResults)
            Log.d(TAG, "Lot ${index + 1}/${chunks.size}: ${chunkResults.size}/${chunk.size} OK")

            // 300ms entre chaque lot pour éviter le rate-limiting
            if (index < chunks.size - 1) delay(300)
        }
        Log.d(TAG, "Phase 2 total: ${results.size} titres")
        results
    }

    private fun mergeWithSeed(scraped: List<StockEntity>): List<StockEntity> {
        val scrapedTickers = scraped.map { it.ticker }.toSet()
        return scraped + BRVMSeedData.stocks.filter { it.ticker !in scrapedTickers }
    }

    private suspend fun ensureSeedData() {
        if (stockDao.getAllStocks().isEmpty()) stockDao.insertStocks(BRVMSeedData.stocks)
    }

    override suspend fun refreshPriceHistory(ticker: String) = withContext(Dispatchers.IO) {
        try {
            val endDate = LocalDate.now().format(dateFormatter)
            val startDate = LocalDate.now().minusYears(1).format(dateFormatter)
            val apiHistory = try {
                api.getPriceHistory(ticker, startDate, endDate).data.mapNotNull { dto ->
                    if (dto.close == null) return@mapNotNull null
                    PriceHistoryEntity(ticker = ticker, date = parseDate(dto.date),
                        open = dto.open ?: dto.close, high = dto.high ?: dto.close,
                        low = dto.low ?: dto.close, close = dto.close, volume = dto.volume ?: 0L)
                }
            } catch (_: Exception) { emptyList() }

            if (apiHistory.isNotEmpty()) {
                stockDao.insertPriceHistory(apiHistory)
            } else {
                val scraperHistory = try {
                    scraper.scrapeHistory(ticker).mapNotNull { dto ->
                        if (dto.close == null) return@mapNotNull null
                        PriceHistoryEntity(ticker = ticker, date = parseDate(dto.date),
                            open = dto.open ?: dto.close, high = dto.high ?: dto.close,
                            low = dto.low ?: dto.close, close = dto.close, volume = dto.volume ?: 0L)
                    }
                } catch (_: Exception) { emptyList() }

                if (scraperHistory.isNotEmpty()) {
                    stockDao.insertPriceHistory(scraperHistory)
                } else {
                    val existing = stockDao.getPriceHistory(ticker, 1)
                    if (existing.isEmpty()) {
                        val stock = stockDao.getStock(ticker) ?: BRVMSeedData.stocks.find { it.ticker == ticker }
                        if (stock != null) stockDao.insertPriceHistory(BRVMSeedData.generateHistory(ticker, stock.lastPrice))
                    }
                }
            }

            val recentHistory = stockDao.getPriceHistory(ticker, 20)
            if (recentHistory.isNotEmpty()) {
                stockDao.updateAverageVolume(ticker, recentHistory.map { it.volume }.average().toLong())
            }
            stockDao.pruneOldHistory(ticker, System.currentTimeMillis() - (400L * 24 * 3600 * 1000))
        } catch (_: Exception) {}
    }

    override suspend fun getPriceHistory(ticker: String, limit: Int): List<PricePoint> =
        stockDao.getPriceHistory(ticker, limit).map { PricePoint(it.date, it.open, it.high, it.low, it.close, it.volume) }

    override suspend fun saveTechnicalIndicators(indicators: TechnicalIndicators) =
        stockDao.insertTechnicalIndicators(indicators.toEntity())

    override suspend fun getTechnicalIndicators(ticker: String): TechnicalIndicators? =
        stockDao.getTechnicalIndicators(ticker)?.toDomain()

    override suspend fun updateWatchlistStatus(ticker: String, watchlisted: Boolean) =
        stockDao.updateWatchlistStatus(ticker, watchlisted)

    private fun parseDate(dateStr: String): Long {
        return try {
            LocalDate.parse(dateStr, dateFormatter).toEpochDay() * 86400L
        } catch (_: Exception) {
            try {
                val parts = dateStr.split("/")
                if (parts.size == 3) LocalDate.of(parts[2].toInt(), parts[1].toInt(), parts[0].toInt()).toEpochDay() * 86400L
                else System.currentTimeMillis() / 1000
            } catch (_: Exception) { System.currentTimeMillis() / 1000 }
        }
    }

    private fun StockEntity.toDomain() = Stock(
        ticker = ticker, name = name, sector = sector, country = country,
        lastPrice = lastPrice, previousClose = previousClose, openPrice = openPrice,
        highPrice = highPrice, lowPrice = lowPrice, volume = volume,
        averageVolume20d = averageVolume20d, marketCap = marketCap, peRatio = peRatio,
        dividendYield = dividendYield, eps = eps, bookValue = bookValue,
        priceToBook = priceToBook, roe = roe, debtToEquity = debtToEquity,
        revenueGrowth = revenueGrowth, netIncomeGrowth = netIncomeGrowth,
        lastUpdated = lastUpdated, isWatchlisted = isWatchlisted
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
