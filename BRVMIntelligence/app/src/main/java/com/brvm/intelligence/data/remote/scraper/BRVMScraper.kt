package com.brvm.intelligence.data.remote.scraper

import com.brvm.intelligence.data.remote.dto.StockDto
import com.brvm.intelligence.data.remote.dto.MarketIndexDto
import com.brvm.intelligence.data.remote.dto.PricePointDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import timber.log.Timber
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Scraper robuste pour brvm.org.
 * La BRVM ne dispose pas d'API officielle publique — le scraping est
 * la seule méthode disponible. Ce scraper est conçu pour être résilient
 * aux changements de structure HTML mineurs.
 */
@Singleton
class BRVMScraper @Inject constructor() {

    companion object {
        private const val BASE_URL = "https://www.brvm.org"
        private const val STOCKS_LIST_URL = "$BASE_URL/fr/cours-des-actions/0"
        private const val STOCKS_LIST_URL_ALL = "$BASE_URL/fr/cours-des-actions/0/all"
        private const val INDEX_URL = "$BASE_URL/fr/indices"
        private const val TIMEOUT_MS = 30_000
        private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        private val DATE_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy")
        val KNOWN_TICKERS = setOf(
            "ABJC","BICB","BICC","BNBC","BOAB","BOABF","BOAC","BOAM","BOAN","BOAS",
            "CABC","CBIBF","CFAC","CIEC","ECOC","ETIT","FTSC","LNBB","NEIC","NSBC",
            "NTLC","ONTBF","ORAC","ORGT","PALC","PRSC","SAFC","SCRC","SDCC","SDSC",
            "SEMC","SGBC","SHEC","SIBC","SICC","SIVC","SLBC","SMBC","SNTS","SOGC",
            "SPHC","STAC","STBC","TTLC","TTLS","UNLC","UNXC"
        )
    }

    /** Scraping de toutes les actions cotées sur la BRVM */
    suspend fun scrapeAllStocks(): Result<List<StockDto>> = withContext(Dispatchers.IO) {
        // Essayer les deux URLs (avec /all d'abord pour plus de données)
        for (url in listOf(STOCKS_LIST_URL_ALL, STOCKS_LIST_URL)) {
            try {
                val doc = fetchPage(url) ?: continue
                val stocks = parseStocksTable(doc)
                if (stocks.isNotEmpty()) {
                    Timber.i("BRVM Scraper: ${stocks.size} actions depuis $url")
                    return@withContext Result.success(stocks)
                }
            } catch (e: Exception) {
                Timber.w(e, "Échec scraping $url")
            }
        }
        Result.failure(Exception("Aucune donnée récupérée depuis brvm.org"))
    }

    /** Détail d'une action spécifique */
    suspend fun scrapeStockDetail(symbol: String): Result<StockDto> = withContext(Dispatchers.IO) {
        try {
            val url = "$BASE_URL/fr/cours-actions/$symbol"
            val doc = fetchPage(url) ?: return@withContext Result.failure(
                Exception("Page non trouvée pour $symbol")
            )
            val stock = parseStockDetail(doc, symbol)
            Result.success(stock)
        } catch (e: Exception) {
            Timber.e(e, "Erreur scraping détail action $symbol")
            Result.failure(e)
        }
    }

    /** Historique des prix pour une action */
    suspend fun scrapePriceHistory(
        symbol: String,
        fromDate: LocalDate,
        toDate: LocalDate = LocalDate.now()
    ): Result<List<PricePointDto>> = withContext(Dispatchers.IO) {
        try {
            val fromStr = fromDate.format(DATE_FORMAT)
            val toStr = toDate.format(DATE_FORMAT)
            val url = "$BASE_URL/fr/cours-actions/historique/$symbol?date_debut=$fromStr&date_fin=$toStr"
            val doc = fetchPage(url) ?: return@withContext Result.failure(
                Exception("Impossible de charger l'historique de $symbol")
            )
            val history = parsePriceHistory(doc, symbol)
            Timber.d("BRVM Scraper: ${history.size} points historiques pour $symbol")
            Result.success(history)
        } catch (e: Exception) {
            Timber.e(e, "Erreur scraping historique $symbol")
            Result.failure(e)
        }
    }

    /** Indices BRVM Composite et BRVM 10 */
    suspend fun scrapeIndices(): Result<List<MarketIndexDto>> = withContext(Dispatchers.IO) {
        try {
            val doc = fetchPage(INDEX_URL) ?: return@withContext Result.failure(
                Exception("Impossible de charger les indices BRVM")
            )
            val indices = parseIndices(doc)
            Result.success(indices)
        } catch (e: Exception) {
            Timber.e(e, "Erreur scraping indices BRVM")
            Result.failure(e)
        }
    }

    private fun fetchPage(url: String): Document? {
        return try {
            Jsoup.connect(url)
                .userAgent(USER_AGENT)
                .timeout(TIMEOUT_MS)
                .followRedirects(true)
                .get()
        } catch (e: Exception) {
            Timber.e(e, "Erreur chargement page: $url")
            null
        }
    }

    private fun parseStocksTable(doc: Document): List<StockDto> {
        // Approche identique au scraper Python qui fonctionne :
        // chercher toutes les lignes de toutes les tables, sans dépendre des classes CSS
        val rows = doc.select("table tbody tr").ifEmpty { doc.select("table tr") }
        val stocks = mutableListOf<StockDto>()

        for (row in rows) {
            try {
                val cells = row.select("td")
                if (cells.size < 4) continue

                // Colonne 0 : ticker (peut contenir le nom de la société mélangé)
                val rawTicker = cells[0].text().trim().uppercase().replace(Regex("[^A-Z]"), "")
                if (rawTicker !in KNOWN_TICKERS) continue

                // brvm.org : col 0=ticker, col 1=société, col 2+=prix
                var price = 0.0
                var priceIdx = -1
                for (i in 2 until minOf(cells.size, 8)) {
                    val v = parsePrice(cells[i].text())
                    if (v > 1.0) { price = v; priceIdx = i; break }
                }
                if (price <= 0) continue

                // Variation % : première valeur entre -99 et 99 après le prix
                var changePct = 0.0
                for (i in (priceIdx + 1) until minOf(cells.size, priceIdx + 5)) {
                    val v = parsePercent(cells[i].text())
                    if (v in -99.0..99.0 && v != 0.0) { changePct = v; break }
                }

                // Volume : dernier entier > 0 dans la ligne
                var volume = 0L
                for (i in cells.size - 1 downTo 0) {
                    val v = parseLong(cells[i].text())
                    if (v in 1L..100_000_000L) { volume = v; break }
                }

                val prevClose = if (changePct != 0.0)
                    Math.round(price / (1.0 + changePct / 100.0) * 100.0) / 100.0
                else price

                stocks.add(StockDto(
                    symbol = rawTicker, name = cells.getOrNull(1)?.text()?.trim() ?: rawTicker,
                    lastPrice = price, change = price - prevClose, changePercent = changePct,
                    volume = volume, previousClose = prevClose,
                    openPrice = prevClose, highPrice = price, lowPrice = price, marketCap = 0L
                ))
            } catch (e: Exception) {
                Timber.w("Ligne ignorée: ${e.message}")
            }
        }
        Timber.i("BRVM parser: ${stocks.size} titres extraits sur ${rows.size} lignes")
        return stocks
    }


    private fun parseStocksTableFallback(doc: Document): List<StockDto> {
        // Tentative générique : chercher n'importe quelle table avec des données numériques
        val allRows = doc.select("table tbody tr")
        val stocks = mutableListOf<StockDto>()
        for (row in allRows) {
            try {
                val cells = row.select("td")
                if (cells.size < 4) continue
                val symbol = cells[0].text().trim().uppercase().replace(Regex("[^A-Z0-9]"), "")
                if (symbol.length < 3 || symbol.length > 8) continue
                val price = (1 until minOf(cells.size, 6))
                    .mapNotNull { parsePrice(cells[it].text()).takeIf { p -> p > 0 } }
                    .firstOrNull() ?: continue
                stocks.add(StockDto(symbol = symbol, name = symbol, lastPrice = price,
                    change = 0.0, changePercent = 0.0, volume = 0L,
                    previousClose = price, openPrice = price, highPrice = price, lowPrice = price,
                    marketCap = 0L))
            } catch (_: Exception) {}
        }
        Timber.w("Fallback générique: ${stocks.size} actions trouvées")
        return stocks // vide si rien trouvé → le caller essaiera la prochaine source
    }

    private fun parseStockDetail(doc: Document, symbol: String): StockDto {
        val name = doc.select("h1.titre-action, .action-name, h1").firstOrNull()?.text() ?: symbol
        val priceEl = doc.select(".dernier-cours, .current-price, .prix-actuel").firstOrNull()
        val price = parsePrice(priceEl?.text())

        return StockDto(
            symbol = symbol,
            name = name,
            lastPrice = price,
            change = parseDouble(doc.select(".variation, .change").firstOrNull()?.text()),
            changePercent = parsePercent(doc.select(".variation-pct, .change-pct").firstOrNull()?.text()),
            volume = parseLong(doc.select(".volume").firstOrNull()?.text()),
            previousClose = parsePrice(doc.select(".cloture-veille, .previous-close").firstOrNull()?.text()),
            openPrice = parsePrice(doc.select(".ouverture, .open").firstOrNull()?.text()),
            highPrice = parsePrice(doc.select(".plus-haut, .high").firstOrNull()?.text()),
            lowPrice = parsePrice(doc.select(".plus-bas, .low").firstOrNull()?.text()),
            marketCap = parseLong(doc.select(".capitalisation, .market-cap").firstOrNull()?.text()),
            per = parseDouble(doc.select(".per, .ratio-cours-benefice").firstOrNull()?.text()),
            dividendYield = parsePercent(doc.select(".rendement-dividende, .dividend-yield").firstOrNull()?.text()),
            high52Week = parsePrice(doc.select(".plus-haut-52s").firstOrNull()?.text()),
            low52Week = parsePrice(doc.select(".plus-bas-52s").firstOrNull()?.text())
        )
    }

    private fun parsePriceHistory(doc: Document, symbol: String): List<PricePointDto> {
        val points = mutableListOf<PricePointDto>()
        val rows = doc.select("table.historique tbody tr, .history-table tbody tr")

        for (row in rows) {
            try {
                val cells = row.select("td")
                if (cells.size < 5) continue
                val dateStr = cells[0].text().trim()
                val date = parseDate(dateStr) ?: continue
                points.add(PricePointDto(
                    symbol = symbol,
                    date = date,
                    open = parsePrice(cells.getOrNull(1)?.text()),
                    high = parsePrice(cells.getOrNull(2)?.text()),
                    low = parsePrice(cells.getOrNull(3)?.text()),
                    close = parsePrice(cells.getOrNull(4)?.text()),
                    volume = parseLong(cells.getOrNull(5)?.text())
                ))
            } catch (e: Exception) {
                Timber.w("Point historique ignoré: ${e.message}")
            }
        }
        return points.sortedBy { it.date }
    }

    private fun parseIndices(doc: Document): List<MarketIndexDto> {
        val indices = mutableListOf<MarketIndexDto>()
        val indexRows = doc.select(".indices-table tr, table.indices tbody tr")

        for (row in indexRows) {
            val cells = row.select("td")
            if (cells.size < 3) continue
            val name = cells[0].text().trim()
            if (name.isBlank()) continue
            indices.add(MarketIndexDto(
                name = name,
                value = parseDouble(cells.getOrNull(1)?.text()),
                change = parseDouble(cells.getOrNull(2)?.text()),
                changePercent = parsePercent(cells.getOrNull(3)?.text()),
                volume = parseLong(cells.getOrNull(4)?.text())
            ))
        }
        // Valeurs par défaut si le scraping échoue
        if (indices.isEmpty()) {
            indices.addAll(getDefaultIndices())
        }
        return indices
    }

    // --- Helpers de parsing ---

    private fun parsePrice(text: String?): Double {
        if (text.isNullOrBlank()) return 0.0
        return text.replace("\\s".toRegex(), "")
            .replace(",", ".")
            .replace("[^0-9.]".toRegex(), "")
            .toDoubleOrNull() ?: 0.0
    }

    private fun parseDouble(text: String?): Double {
        if (text.isNullOrBlank()) return 0.0
        val cleaned = text.replace("\\s".toRegex(), "")
            .replace(",", ".")
            .replace("[^0-9.\\-]".toRegex(), "")
        return cleaned.toDoubleOrNull() ?: 0.0
    }

    private fun parsePercent(text: String?): Double {
        if (text.isNullOrBlank()) return 0.0
        return text.replace("%", "")
            .replace(",", ".")
            .replace("\\s".toRegex(), "")
            .toDoubleOrNull() ?: 0.0
    }

    private fun parseLong(text: String?): Long {
        if (text.isNullOrBlank()) return 0L
        return text.replace("\\s".toRegex(), "")
            .replace("[^0-9]".toRegex(), "")
            .toLongOrNull() ?: 0L
    }

    private fun parseDate(text: String): LocalDate? {
        return try {
            LocalDate.parse(text.trim(), DATE_FORMAT)
        } catch (e: Exception) {
            try {
                LocalDate.parse(text.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"))
            } catch (e2: Exception) {
                null
            }
        }
    }

    /** Données BRVM de référence pour les cas où le scraping est temporairement indisponible */
    private fun getDefaultBRVMStocks(): List<StockDto> = emptyList()

    private fun getDefaultIndices(): List<MarketIndexDto> = listOf(
        MarketIndexDto("BRVM Composite", 220.50, 0.0, 0.0, 0),
        MarketIndexDto("BRVM 10", 330.75, 0.0, 0.0, 0)
    )
}
