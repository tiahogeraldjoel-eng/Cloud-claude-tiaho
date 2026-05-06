package com.brvm.intelligence.data.repository

import android.content.Context
import com.brvm.intelligence.data.local.dao.PriceAlertDao
import com.brvm.intelligence.data.local.dao.PriceHistoryDao
import com.brvm.intelligence.data.local.dao.StockDao
import com.brvm.intelligence.data.local.entity.*
import com.brvm.intelligence.data.remote.scraper.BRVMScraper
import com.brvm.intelligence.data.remote.dto.StockDto
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.repository.StockRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import org.json.JSONObject
import timber.log.Timber
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StockRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val stockDao: StockDao,
    private val priceHistoryDao: PriceHistoryDao,
    private val priceAlertDao: PriceAlertDao,
    private val scraper: BRVMScraper
) : StockRepository {

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

        // Vérifier si on a des données locales suffisantes
        val localCount = priceHistoryDao.getHistoryCount(symbol)
        val latestDate = priceHistoryDao.getLatestDateEpoch(symbol)?.let { LocalDate.ofEpochDay(it) }

        val needsRefresh = localCount < period.days / 2 ||
            latestDate == null ||
            latestDate.isBefore(LocalDate.now().minusDays(1))

        if (needsRefresh) {
            Timber.d("Rafraîchissement historique $symbol depuis la BRVM")
            scraper.scrapePriceHistory(symbol, fromDate).onSuccess { points ->
                val entities = points.map { it.toEntity() }
                priceHistoryDao.insertPricePoints(entities)
            }
        }

        val entities = priceHistoryDao.getPriceHistory(symbol, fromEpochDay)
        return PriceHistory(
            symbol = symbol,
            prices = entities.map { it.toDomain() },
            period = period
        )
    }

    override suspend fun refreshMarketData(): Result<Unit> {
        return try {
            val result = scraper.scrapeAllStocks()
            result.onSuccess { stocks ->
                val entities = stocks.map { dto ->
                    StockEntity(
                        symbol = dto.symbol,
                        name = dto.name,
                        sector = inferSector(dto.symbol).name,
                        country = inferCountry(dto.symbol).name,
                        currentPrice = dto.lastPrice,
                        previousClose = dto.previousClose,
                        change = dto.change,
                        changePercent = dto.changePercent,
                        volume = dto.volume,
                        marketCap = dto.marketCap,
                        per = dto.per,
                        dividendYield = dto.dividendYield,
                        high52Week = dto.high52Week,
                        low52Week = dto.low52Week,
                        openPrice = dto.openPrice,
                        highPrice = dto.highPrice,
                        lowPrice = dto.lowPrice,
                        lastUpdateEpoch = LocalDateTime.now().toEpochSecond(ZoneOffset.UTC),
                        liquidityLevel = inferLiquidity(dto.volume).name
                    )
                }
                stockDao.insertStocks(entities)
                Timber.i("${entities.size} actions mises à jour en base locale")
            }
            if (result.isFailure) {
                Timber.w("Scraper échoué — chargement des données depuis l'asset embarqué")
                seedFromAssets()
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Erreur rafraîchissement — fallback asset")
            seedFromAssets()
            Result.success(Unit)
        }
    }

    private suspend fun seedFromAssets() {
        try {
            val existing = stockDao.countStocks()
            if (existing > 0) return
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
                val chg = price - prev
                entities.add(StockEntity(
                    symbol = ticker,
                    name = ticker,
                    sector = inferSector(ticker).name,
                    country = inferCountry(ticker).name,
                    currentPrice = price,
                    previousClose = prev,
                    change = chg,
                    changePercent = chgPct,
                    volume = vol,
                    marketCap = price * 1_000_000L,
                    per = null,
                    dividendYield = null,
                    high52Week = null,
                    low52Week = null,
                    openPrice = prev,
                    highPrice = price,
                    lowPrice = price,
                    lastUpdateEpoch = LocalDateTime.now().toEpochSecond(ZoneOffset.UTC),
                    liquidityLevel = inferLiquidity(vol).name
                ))
            }
            stockDao.insertStocks(entities)
            Timber.i("${entities.size} actions chargées depuis l'asset embarqué")
        } catch (e: Exception) {
            Timber.e(e, "Erreur chargement asset brvm_stocks_seed.json")
        }
    }

    override fun getMarketSummary(): Flow<MarketSummary> = flow {
        val allStocksFlow = stockDao.getAllStocks()
        allStocksFlow.collect { entities ->
            val stocks = entities.map { it.toDomain() }
            val totalCap = entities.sumOf { it.marketCap }
            val totalVol = entities.sumOf { it.volume }
            val topGainers = stocks.sortedByDescending { it.changePercent }.take(5)
            val topLosers = stocks.sortedBy { it.changePercent }.take(5)
            val mostActive = stocks.sortedByDescending { it.volume }.take(5)

            // Calcul simplifié des indices (basé sur les actions disponibles)
            val composite = MarketIndex(
                name = "BRVM Composite",
                value = calculateCompositeIndex(stocks),
                change = stocks.map { it.change }.average(),
                changePercent = stocks.map { it.changePercent }.average(),
                totalVolume = totalVol,
                totalMarketCap = totalCap,
                numberOfTransactions = stocks.size,
                lastUpdate = LocalDateTime.now()
            )

            val brvm10Stocks = stocks.sortedByDescending { it.marketCap }.take(10)
            val brvm10 = MarketIndex(
                name = "BRVM 10",
                value = calculateCompositeIndex(brvm10Stocks) * 1.5,
                change = brvm10Stocks.map { it.change }.average(),
                changePercent = brvm10Stocks.map { it.changePercent }.average(),
                totalVolume = brvm10Stocks.sumOf { it.volume },
                totalMarketCap = brvm10Stocks.sumOf { it.marketCap },
                numberOfTransactions = brvm10Stocks.size,
                lastUpdate = LocalDateTime.now()
            )

            emit(MarketSummary(
                brvmComposite = composite,
                brvmTen = brvm10,
                topGainers = topGainers,
                topLosers = topLosers,
                mostActive = mostActive,
                marketStatus = getMarketStatus(),
                lastUpdate = LocalDateTime.now()
            ))
        }
    }

    override suspend fun getUpcomingEvents(): List<MarketEvent> {
        // Calendrier des événements BRVM (dividendes, résultats, AG)
        // À enrichir avec des données réelles depuis le site BRVM
        return listOf(
            MarketEvent(
                date = LocalDate.now().plusDays(7),
                type = EventType.DIVIDEND_DETACHMENT,
                title = "Détachement dividende SONR-CI",
                description = "Détachement du dividende annuel de Sonatel CI",
                affectedSymbols = listOf("SONR-CI"),
                expectedImpact = EventImpact.POSITIVE
            ),
            MarketEvent(
                date = LocalDate.now().plusDays(14),
                type = EventType.RESULTS_PUBLICATION,
                title = "Résultats semestriels SGBCI",
                description = "Publication des résultats du 1er semestre de SGBCI",
                affectedSymbols = listOf("SGBCI"),
                expectedImpact = EventImpact.NEUTRAL
            ),
            MarketEvent(
                date = LocalDate.now().plusDays(30),
                type = EventType.BCEAO_DECISION,
                title = "Décision taux BCEAO",
                description = "Réunion du Comité de Politique Monétaire de la BCEAO",
                expectedImpact = EventImpact.NEUTRAL
            )
        )
    }

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

    // --- Fonctions d'inférence ---

    private fun inferSector(symbol: String): BRVMSector {
        return when {
            symbol.contains("BCI") || symbol.contains("BOA") ||
            symbol.contains("BNI") || symbol.contains("BIS") ||
            symbol.contains("SGBCI") || symbol.contains("BICC") -> BRVMSector.FINANCE
            symbol.contains("PALC") || symbol.contains("SIVC") ||
            symbol.contains("PALM") || symbol.contains("CAFF") -> BRVMSector.AGRICULTURE
            symbol.contains("SONR") || symbol.contains("ONTEL") ||
            symbol.contains("ONT") -> BRVMSector.SERVICES_PUBLICS
            symbol.contains("CFAC") || symbol.contains("SDSC") -> BRVMSector.DISTRIBUTION
            symbol.contains("SMB") || symbol.contains("SLBC") -> BRVMSector.INDUSTRIE
            else -> BRVMSector.AUTRES
        }
    }

    private fun inferCountry(symbol: String): BRVMCountry {
        return when {
            symbol.endsWith("-CI") || symbol.endsWith("CI") -> BRVMCountry.COTE_IVOIRE
            symbol.endsWith("-SN") || symbol.endsWith("SN") -> BRVMCountry.SENEGAL
            symbol.endsWith("BF") -> BRVMCountry.BURKINA_FASO
            symbol.endsWith("TG") -> BRVMCountry.TOGO
            symbol.endsWith("ML") -> BRVMCountry.MALI
            symbol.endsWith("BJ") -> BRVMCountry.BENIN
            else -> BRVMCountry.COTE_IVOIRE
        }
    }

    private fun inferLiquidity(volume: Long): LiquidityLevel {
        return when {
            volume > 50_000 -> LiquidityLevel.HIGH
            volume > 10_000 -> LiquidityLevel.MEDIUM
            volume > 1_000 -> LiquidityLevel.LOW
            else -> LiquidityLevel.VERY_LOW
        }
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
        val dayOfWeek = now.dayOfWeek.value
        return when {
            dayOfWeek >= 6 -> MarketStatus.CLOSED
            hour < 9 -> MarketStatus.PRE_OPENING
            hour in 9..14 -> MarketStatus.OPEN
            hour == 15 && now.minute <= 30 -> MarketStatus.CLOSING
            else -> MarketStatus.CLOSED
        }
    }

    private fun com.brvm.intelligence.data.remote.dto.PricePointDto.toEntity() =
        PriceHistoryEntity(
            symbol = symbol,
            dateEpoch = date.toEpochDay(),
            open = open,
            high = high,
            low = low,
            close = close,
            volume = volume
        )
}
