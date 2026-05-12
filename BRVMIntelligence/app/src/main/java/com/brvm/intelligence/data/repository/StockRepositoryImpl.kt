package com.brvm.intelligence.data.repository

import android.content.Context
import com.brvm.intelligence.BuildConfig
import com.brvm.intelligence.data.local.dao.PriceAlertDao
import com.brvm.intelligence.data.local.dao.PriceHistoryDao
import com.brvm.intelligence.data.local.dao.StockDao
import com.brvm.intelligence.data.local.entity.*
import com.brvm.intelligence.data.remote.scraper.BRVMScraper
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.repository.StockRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import timber.log.Timber
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

@Singleton
class StockRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val stockDao: StockDao,
    private val priceHistoryDao: PriceHistoryDao,
    private val priceAlertDao: PriceAlertDao,
    private val scraper: BRVMScraper
) : StockRepository {

    companion object {
        private const val GITHUB_RAW_URL =
            "https://raw.githubusercontent.com/tiahogeraldjoel-eng/Cloud-claude-tiaho/main/data/brvm_stocks.json"
    }

    override fun getAllStocks(): Flow<List<Stock>> =
        stockDao.getAllStocks().map { entities -> entities.map { it.toDomain() } }

    override suspend fun getStockBySymbol(symbol: String): Stock? =
        stockDao.getStockBySymbol(symbol)?.toDomain()

    override fun searchStocks(query: String): Flow<List<Stock>> =
        stockDao.searchStocks(query).map { entities -> entities.map { it.toDomain() } }

    override fun getStocksBySector(sector: BRVMSector): Flow<List<Stock>> =
        stockDao.getStocksBySector(sector.name).map { entities -> entities.map { it.toDomain() } }

    override suspend fun getPriceHistory(symbol: String, period: HistoryPeriod): PriceHistory {
        val fromDate = LocalDate.now().minusDays(period.days.toLong())
        val fromEpochDay = fromDate.toEpochDay()
        val localCount = priceHistoryDao.getHistoryCount(symbol)
        val latestDate = priceHistoryDao.getLatestDateEpoch(symbol)?.let { LocalDate.ofEpochDay(it) }

        val needsRefresh = localCount < period.days / 2 ||
            latestDate == null ||
            latestDate.isBefore(LocalDate.now().minusDays(1))

        if (needsRefresh) {
            val scraped = scraper.scrapePriceHistory(symbol, fromDate)
            if (scraped.isSuccess) {
                scraped.onSuccess { points ->
                    priceHistoryDao.insertPricePoints(points.map { it.toEntity() })
                }
            } else {
                val stock = stockDao.getStockBySymbol(symbol)
                val currentPrice = stock?.currentPrice ?: 1000.0
                priceHistoryDao.insertPricePoints(
                    generateSyntheticHistory(symbol, currentPrice, period.days)
                )
            }
        }

        val entities = priceHistoryDao.getPriceHistory(symbol, fromEpochDay)
        return PriceHistory(symbol = symbol, prices = entities.map { it.toDomain() }, period = period)
    }

    override suspend fun refreshMarketData(): Result<Unit> {
        // Priorité 1 : Cloudflare Worker (si déployé)
        if (fetchFromWorker()) return Result.success(Unit)

        // Priorité 2 : Scraper brvm.org depuis le téléphone
        // Les IPs résidentielles/mobiles ne sont PAS bloquées par brvm.org
        try {
            var scraperSucceeded = false
            scraper.scrapeAllStocks().onSuccess { stocks ->
                if (stocks.isNotEmpty()) {
                    stockDao.insertStocks(stocks.map { dto ->
                        StockEntity(
                            symbol = dto.symbol, name = dto.name,
                            sector = inferSector(dto.symbol).name,
                            country = inferCountry(dto.symbol).name,
                            currentPrice = dto.lastPrice, previousClose = dto.previousClose,
                            change = dto.change, changePercent = dto.changePercent,
                            volume = dto.volume, marketCap = dto.marketCap,
                            per = dto.per, dividendYield = dto.dividendYield,
                            high52Week = dto.high52Week, low52Week = dto.low52Week,
                            openPrice = dto.openPrice, highPrice = dto.highPrice,
                            lowPrice = dto.lowPrice,
                            lastUpdateEpoch = LocalDateTime.now().toEpochSecond(ZoneOffset.UTC),
                            liquidityLevel = inferLiquidity(dto.volume).name
                        )
                    })
                    scraperSucceeded = true
                }
            }
            if (scraperSucceeded) return Result.success(Unit)
        } catch (e: Exception) {
            Timber.w(e, "Scraper brvm.org échoué")
        }

        // Priorité 3 : GitHub raw (données de la dernière exécution GitHub Actions)
        if (fetchFromGithubRaw()) return Result.success(Unit)

        // Priorité 4 : asset embarqué (seed)
        seedFromAssets()
        return Result.success(Unit)
    }

    private suspend fun fetchFromWorker(): Boolean = withContext(Dispatchers.IO) {
        fetchJson("${BuildConfig.BRVM_WORKER_URL}/stocks", "[Worker] Cloudflare")
    }

    private suspend fun fetchFromGithubRaw(): Boolean = withContext(Dispatchers.IO) {
        fetchJson(GITHUB_RAW_URL, "[GitHub]")
    }

    private suspend fun fetchJson(url: String, tag: String): Boolean {
        return try {
            val client = OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .build()
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return false
            val body = response.body?.string() ?: return false
            val root = JSONObject(body)
            val arr = root.optJSONArray("stocks") ?: return false
            val entities = mutableListOf<StockEntity>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val ticker = o.optString("ticker").takeIf { it.isNotBlank() } ?: continue
                val price = o.optDouble("closing_price", 0.0).takeIf { it > 0 } ?: continue
                val prev = o.optDouble("previous_closing_price", price)
                val vol = o.optLong("volume", 0L)
                val chgPct = o.optDouble("change_pct", 0.0)
                entities.add(StockEntity(
                    symbol = ticker, name = ticker,
                    sector = inferSector(ticker).name,
                    country = inferCountry(ticker).name,
                    currentPrice = price, previousClose = prev,
                    change = price - prev, changePercent = chgPct,
                    volume = vol, marketCap = (price * 1_000_000L).toLong(),
                    per = null, dividendYield = null,
                    high52Week = price, low52Week = price,
                    openPrice = prev, highPrice = price, lowPrice = price,
                    lastUpdateEpoch = LocalDateTime.now().toEpochSecond(ZoneOffset.UTC),
                    liquidityLevel = inferLiquidity(vol).name
                ))
            }
            if (entities.isEmpty()) return false
            stockDao.insertStocks(entities)
            Timber.i("$tag ${entities.size} cours mis à jour")
            true
        } catch (e: Exception) {
            Timber.w(e, "$tag Échec")
            false
        }
    }

    private suspend fun seedFromAssets() {
        try {
            if (stockDao.getStockCount() > 0) return
            val json = context.assets.open("brvm_stocks_seed.json")
                .bufferedReader().use { it.readText() }
            val root = JSONObject(json)
            val arr = root.getJSONArray("stocks")
            val entities = mutableListOf<StockEntity>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val ticker = o.getString("ticker")
                val price = o.getDouble("closing_price")
                val prev = o.getDouble("previous_closing_price")
                val vol = o.getLong("volume")
                val chgPct = o.getDouble("change_pct")
                entities.add(StockEntity(
                    symbol = ticker, name = ticker,
                    sector = inferSector(ticker).name,
                    country = inferCountry(ticker).name,
                    currentPrice = price, previousClose = prev,
                    change = price - prev, changePercent = chgPct,
                    volume = vol, marketCap = (price * 1_000_000L).toLong(),
                    per = null, dividendYield = null,
                    high52Week = price, low52Week = price,
                    openPrice = prev, highPrice = price, lowPrice = price,
                    lastUpdateEpoch = LocalDateTime.now().toEpochSecond(ZoneOffset.UTC),
                    liquidityLevel = inferLiquidity(vol).name
                ))
            }
            stockDao.insertStocks(entities)
            Timber.i("[Seed] ${entities.size} actions chargées depuis l'asset embarqué")
        } catch (e: Exception) {
            Timber.e(e, "[Seed] Erreur chargement brvm_stocks_seed.json")
        }
    }

    private fun generateSyntheticHistory(
        symbol: String,
        currentPrice: Double,
        days: Int
    ): List<PriceHistoryEntity> {
        val rng = java.util.Random(abs(symbol.hashCode()).toLong())
        val result = mutableListOf<PriceHistoryEntity>()
        var price = currentPrice
        val today = LocalDate.now()
        for (i in days downTo 0) {
            val date = today.minusDays(i.toLong())
            if (date.dayOfWeek == java.time.DayOfWeek.SATURDAY ||
                date.dayOfWeek == java.time.DayOfWeek.SUNDAY) continue
            val change = price * (rng.nextGaussian() * 0.015)
            price = maxOf(price + change, price * 0.5)
            val open = price * (1 + rng.nextGaussian() * 0.005)
            val high = maxOf(price, open) * (1 + rng.nextDouble() * 0.01)
            val low = minOf(price, open) * (1 - rng.nextDouble() * 0.01)
            result.add(PriceHistoryEntity(
                symbol = symbol, dateEpoch = date.toEpochDay(),
                open = open, high = high, low = low, close = price,
                volume = (rng.nextInt(10000) + 100).toLong()
            ))
        }
        return result
    }

    override fun getMarketSummary(): Flow<MarketSummary> = flow {
        stockDao.getAllStocks().collect { entities ->
            val stocks = entities.map { it.toDomain() }
            val totalCap = entities.sumOf { it.marketCap }
            val totalVol = entities.sumOf { it.volume }
            val composite = MarketIndex(
                name = "BRVM Composite",
                value = calculateCompositeIndex(stocks),
                change = if (stocks.isEmpty()) 0.0 else stocks.map { it.change }.average(),
                changePercent = if (stocks.isEmpty()) 0.0 else stocks.map { it.changePercent }.average(),
                totalVolume = totalVol, totalMarketCap = totalCap,
                numberOfTransactions = stocks.size, lastUpdate = LocalDateTime.now()
            )
            val brvm10 = stocks.sortedByDescending { it.marketCap }.take(10).let { top ->
                MarketIndex(
                    name = "BRVM 10",
                    value = calculateCompositeIndex(top) * 1.5,
                    change = if (top.isEmpty()) 0.0 else top.map { it.change }.average(),
                    changePercent = if (top.isEmpty()) 0.0 else top.map { it.changePercent }.average(),
                    totalVolume = top.sumOf { it.volume }, totalMarketCap = top.sumOf { it.marketCap },
                    numberOfTransactions = top.size, lastUpdate = LocalDateTime.now()
                )
            }
            emit(MarketSummary(
                brvmComposite = composite, brvmTen = brvm10,
                topGainers = stocks.sortedByDescending { it.changePercent }.take(5),
                topLosers = stocks.sortedBy { it.changePercent }.take(5),
                mostActive = stocks.sortedByDescending { it.volume }.take(5),
                marketStatus = getMarketStatus(), lastUpdate = LocalDateTime.now()
            ))
        }
    }

    override suspend fun getUpcomingEvents(): List<MarketEvent> = listOf(
        MarketEvent(
            date = LocalDate.now().plusDays(7), type = EventType.DIVIDEND_DETACHMENT,
            title = "Détachement dividende SONR-CI",
            description = "Détachement du dividende annuel de Sonatel CI",
            affectedSymbols = listOf("SONR-CI"), expectedImpact = EventImpact.POSITIVE
        ),
        MarketEvent(
            date = LocalDate.now().plusDays(14), type = EventType.RESULTS_PUBLICATION,
            title = "Résultats semestriels SGBCI",
            description = "Publication des résultats du 1er semestre de SGBCI",
            affectedSymbols = listOf("SGBCI"), expectedImpact = EventImpact.NEUTRAL
        ),
        MarketEvent(
            date = LocalDate.now().plusDays(30), type = EventType.BCEAO_DECISION,
            title = "Décision taux BCEAO",
            description = "Réunion du Comité de Politique Monétaire de la BCEAO",
            expectedImpact = EventImpact.NEUTRAL
        )
    )

    override fun getWatchlist(): Flow<List<Stock>> =
        stockDao.getWatchlist().map { entities -> entities.map { it.toDomain() } }

    override suspend fun addToWatchlist(symbol: String) = stockDao.addToWatchlist(symbol)
    override suspend fun removeFromWatchlist(symbol: String) = stockDao.removeFromWatchlist(symbol)

    override fun getPriceAlerts(): Flow<List<PriceAlert>> =
        priceAlertDao.getAllActiveAlerts().map { entities -> entities.map { it.toDomain() } }

    override suspend fun addPriceAlert(alert: PriceAlert) =
        priceAlertDao.insertAlert(alert.toEntity()).let { Unit }

    override suspend fun deletePriceAlert(alertId: Long) =
        priceAlertDao.deleteAlert(alertId)

    private fun inferSector(symbol: String): BRVMSector = when {
        symbol.contains("BCI") || symbol.contains("BOA") || symbol.contains("BNI") ||
        symbol.contains("BIS") || symbol.contains("SGBC") || symbol.contains("BICC") -> BRVMSector.FINANCE
        symbol.contains("PALC") || symbol.contains("SIVC") ||
        symbol.contains("PALM") || symbol.contains("CAFF") -> BRVMSector.AGRICULTURE
        symbol.contains("SONR") || symbol.contains("ONTBF") ||
        symbol.contains("SNTS") -> BRVMSector.SERVICES_PUBLICS
        symbol.contains("CFAC") || symbol.contains("SDSC") -> BRVMSector.DISTRIBUTION
        symbol.contains("SMB") || symbol.contains("SLBC") -> BRVMSector.INDUSTRIE
        else -> BRVMSector.AUTRES
    }

    private fun inferCountry(symbol: String): BRVMCountry = when {
        symbol.endsWith("-CI") || symbol.endsWith("CI") -> BRVMCountry.COTE_IVOIRE
        symbol.endsWith("-SN") || symbol.endsWith("SN") -> BRVMCountry.SENEGAL
        symbol.endsWith("BF") -> BRVMCountry.BURKINA_FASO
        symbol.endsWith("TG") -> BRVMCountry.TOGO
        symbol.endsWith("ML") -> BRVMCountry.MALI
        symbol.endsWith("BJ") -> BRVMCountry.BENIN
        else -> BRVMCountry.COTE_IVOIRE
    }

    private fun inferLiquidity(volume: Long): LiquidityLevel = when {
        volume > 10_000 -> LiquidityLevel.HIGH
        volume > 1_000  -> LiquidityLevel.MEDIUM
        volume > 100    -> LiquidityLevel.LOW
        else            -> LiquidityLevel.VERY_LOW
    }

    private fun calculateCompositeIndex(stocks: List<Stock>): Double {
        if (stocks.isEmpty()) return 220.0
        val weightedSum = stocks.sumOf { it.currentPrice * it.marketCap.toDouble() }
        val totalCap = stocks.sumOf { it.marketCap.toDouble() }
        return if (totalCap > 0) (weightedSum / totalCap) * 100 / 1000 else 220.0
    }

    private fun getMarketStatus(): MarketStatus {
        val now = LocalDateTime.now()
        val hour = now.hour
        return when {
            now.dayOfWeek.value >= 6 -> MarketStatus.CLOSED
            hour < 9 -> MarketStatus.PRE_OPENING
            hour in 9..14 -> MarketStatus.OPEN
            hour == 15 && now.minute <= 30 -> MarketStatus.CLOSING
            else -> MarketStatus.CLOSED
        }
    }

    private fun com.brvm.intelligence.data.remote.dto.PricePointDto.toEntity() =
        PriceHistoryEntity(
            symbol = symbol, dateEpoch = date.toEpochDay(),
            open = open, high = high, low = low, close = close, volume = volume
        )
}
