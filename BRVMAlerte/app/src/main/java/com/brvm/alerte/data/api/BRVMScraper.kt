package com.brvm.alerte.data.api

import android.util.Log
import com.brvm.alerte.data.api.dto.PriceHistoryDto
import com.brvm.alerte.data.api.dto.StockDto
import com.brvm.alerte.data.seed.BRVMSeedData
import com.google.gson.JsonArray
import com.google.gson.JsonParser
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.jsoup.Jsoup
import java.net.URLEncoder
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "BRVMScraper"

@Singleton
class BRVMScraper @Inject constructor(
    private val okHttpClient: OkHttpClient
) {
    companion object {
        private const val BRVM_BASE    = "https://www.brvm.org"
        private const val SIKA_BASE    = "https://www.sikafinance.com"
        private const val SIKA_HIST    = "$SIKA_BASE/api/general/GetHistos"
        private const val SIKA_BULK    = "$SIKA_BASE/marches/aaz"

        // Toutes les variantes d'URL connues de brvm.org — essayées dans l'ordre
        private val BRVM_STOCK_URLS = listOf(
            "$BRVM_BASE/fr/cours-des-actions/0/all",
            "$BRVM_BASE/fr/cours-des-actions/0",
            "$BRVM_BASE/en/cours-des-actions/0/all",
            "$BRVM_BASE/fr/cours-actions/0"
        )

        // Proxies CORS publics — fallback si brvm.org bloque l'IP Android
        private val CORS_PROXIES = listOf(
            "https://api.allorigins.win/raw?url=",
            "https://corsproxy.io/?",
            "https://thingproxy.freeboard.io/fetch/"
        )

        private val BRVM_HISTORY_URLS = listOf(
            "$BRVM_BASE/fr/cours/0/",
            "$BRVM_BASE/en/cours/0/"
        )

        private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

        // Ensemble des tickers BRVM officiels (pour filtrer les résultats bruités)
        private val KNOWN_TICKERS = BRVMSeedData.stocks.map { it.ticker }.toSet()
    }

    // ── API publique ──────────────────────────────────────────────────────────

    /** Source 1a : brvm.org (direct puis via proxies CORS) — 1 requête pour tous. */
    fun scrapeAllStocks(): List<StockDto> {
        // Tentatives directes brvm.org
        for (url in BRVM_STOCK_URLS) {
            try {
                val html = fetchChrome(url)
                if (html.length < 500) continue
                val result = parseBrvmTable(html)
                if (result.size >= 5) {
                    Log.d(TAG, "brvm.org direct OK (${result.size} titres) — $url")
                    return result
                }
            } catch (e: Exception) {
                Log.w(TAG, "brvm.org direct KO ($url): ${e.message}")
            }
        }

        // Fallback via proxies CORS (contourne WAF/CDN)
        val primaryUrl = BRVM_STOCK_URLS.first()
        val encoded    = URLEncoder.encode(primaryUrl, "UTF-8")
        for (proxy in CORS_PROXIES) {
            try {
                val html = fetchChrome("$proxy$encoded")
                if (html.length < 500) continue
                val result = parseBrvmTable(html)
                if (result.size >= 5) {
                    Log.d(TAG, "brvm.org via proxy $proxy OK (${result.size} titres)")
                    return result
                }
            } catch (e: Exception) {
                Log.w(TAG, "Proxy $proxy KO: ${e.message}")
            }
        }

        Log.e(TAG, "scrapeAllStocks: toutes les sources brvm.org ont échoué")
        return emptyList()
    }

    /** Source 1b : SikaFinance page AàZ — 1 requête pour tous les titres BRVM. */
    fun scrapeSikaBulk(): List<StockDto> {
        return try {
            val html = fetchSika(SIKA_BULK)
            if (html.length < 500) return emptyList()
            val all = parseSikaTable(html)
            // Garder uniquement les tickers BRVM officiels
            val result = all.filter { it.ticker in KNOWN_TICKERS }
            Log.d(TAG, "SikaFinance bulk: ${all.size} bruts → ${result.size} BRVM")
            result
        } catch (e: Exception) {
            Log.e(TAG, "scrapeSikaBulk KO: ${e.message}")
            emptyList()
        }
    }

    /**
     * Dernier prix connu d'un seul titre via l'API JSON SikaFinance.
     * Fenêtre de 3 jours — plus rapide, moins de données transférées.
     */
    fun scrapeCurrentPrice(ticker: String): StockDto? {
        return try {
            val today = LocalDate.now()
            val history = fetchSikaHistoryApi(ticker, today.minusDays(3), today)
            val latest = history.maxByOrNull { it.date } ?: return null
            val close = latest.close?.takeIf { it > 0 } ?: return null
            StockDto(
                ticker = ticker, name = ticker,
                sector = null, country = null,
                closingPrice = close,
                previousClosingPrice = latest.open?.takeIf { it > 0 } ?: close,
                openingPrice = latest.open,
                highest = latest.high,
                lowest = latest.low,
                volume = latest.volume,
                marketCap = null, per = null, dividendYield = null,
                eps = null, bookValue = null, priceToBook = null, roe = null, lastTradeDate = null
            )
        } catch (e: Exception) {
            Log.w(TAG, "scrapeCurrentPrice($ticker) KO: ${e.message}")
            null
        }
    }

    fun scrapeHistory(ticker: String): List<PriceHistoryDto> {
        try {
            val result = fetchSikaHistoryApi(ticker)
            if (result.isNotEmpty()) return result
        } catch (_: Exception) {}

        for (base in BRVM_HISTORY_URLS) {
            try {
                val html = fetchChrome("$base$ticker")
                if (html.length < 200) continue
                val result = parseBrvmHistoryTable(html)
                if (result.isNotEmpty()) return result
            } catch (_: Exception) { continue }
        }
        return emptyList()
    }

    // ── Parsers HTML ──────────────────────────────────────────────────────────

    /**
     * Parse robuste du tableau brvm.org.
     *
     * Structure attendue (depuis fetcher.js brvm-analyzer) :
     *   cells[0]=TICKER  cells[1]=NOM  cells[2]=PRIX  cells[3]=PREV
     *   cells[4]=VAR%    cells[5]=VOLUME
     *
     * Mais brvm.org a plusieurs mises en page selon la langue/version.
     * On détecte la bonne colonne de prix en cherchant la 1ère cellule numérique > 1.
     */
    private fun parseBrvmTable(html: String): List<StockDto> {
        val doc  = Jsoup.parse(html)
        val rows = doc.select("table tbody tr, .views-table tbody tr, .view-content tr")
            .ifEmpty { doc.select("tr") }

        return rows.mapNotNull { row ->
            val cells = row.select("td")
            if (cells.size < 3) return@mapNotNull null

            fun clean(idx: Int) = cells.getOrNull(idx)?.text()
                ?.replace("\\s+".toRegex(), "")?.replace(" ", "")
                ?.replace(",", ".")?.trim() ?: ""

            // Ticker : première cellule, lettres uniquement, 2-8 chars
            val raw = cells[0].text().trim().uppercase().replace("[^A-Z]".toRegex(), "")
            val ticker = if (raw.length in 2..10) raw else return@mapNotNull null

            // Nom dans cells[1] si disponible
            val name = cells.getOrNull(1)?.text()?.trim()?.takeIf { it.isNotEmpty() } ?: ticker

            // Prix : chercher la première cellule numérique valide (> 1 FCFA)
            var last = 0.0
            var lastIdx = -1
            for (i in 2 until minOf(cells.size, 8)) {
                val v = clean(i).replace("%", "").toDoubleOrNull() ?: continue
                if (v > 1.0 && v < 10_000_000.0) { last = v; lastIdx = i; break }
            }
            if (last <= 0 || lastIdx < 0) return@mapNotNull null

            // Variation % : cellule après le prix (ou +1, +2)
            val changePct = (lastIdx + 1 until minOf(cells.size, lastIdx + 4))
                .map { clean(it).replace("%", "").toDoubleOrNull() }
                .firstOrNull { it != null && it in -100.0..100.0 } ?: 0.0

            val prev = if (changePct != 0.0) last / (1.0 + changePct / 100.0) else last

            // Volume : dernière cellule entière > 0
            val volume = cells.reversed().mapNotNull {
                it.text().replace("\\s+".toRegex(), "").replace(".", "").replace(",", "").toLongOrNull()
            }.firstOrNull { it > 0 } ?: 0L

            StockDto(
                ticker = ticker, name = name, sector = null, country = null,
                closingPrice = last, previousClosingPrice = prev,
                openingPrice = null, highest = null, lowest = null,
                volume = volume, marketCap = null, per = null, dividendYield = null,
                eps = null, bookValue = null, priceToBook = null, roe = null, lastTradeDate = null
            )
        }
    }

    /**
     * Parse la page AàZ de SikaFinance.
     * Colonnes typiques : Titre | Marché | Cours | Var% | Volume
     */
    private fun parseSikaTable(html: String): List<StockDto> {
        val doc  = Jsoup.parse(html)
        val rows = doc.select("table tbody tr").ifEmpty { doc.select("tr") }

        return rows.mapNotNull { row ->
            val cells = row.select("td")
            if (cells.size < 3) return@mapNotNull null

            fun clean(idx: Int) = cells.getOrNull(idx)?.text()
                ?.replace("\\s+".toRegex(), "")?.replace(" ", "")
                ?.replace(",", ".")?.trim() ?: ""

            val ticker = cells[0].text().trim().uppercase().replace("[^A-Z]".toRegex(), "")
            if (ticker.length !in 2..10) return@mapNotNull null

            // Chercher le prix parmi toutes les cellules (valeur numérique > 1)
            var close = 0.0
            var closeIdx = -1
            for (i in 1 until cells.size) {
                val v = clean(i).replace("%", "").toDoubleOrNull() ?: continue
                if (v > 1.0 && v < 10_000_000.0) { close = v; closeIdx = i; break }
            }
            if (close <= 0) return@mapNotNull null

            val name = cells.getOrNull(1)?.text()?.trim()?.takeIf {
                it.isNotEmpty() && it.any { c -> c.isLetter() }
            } ?: ticker

            val changePct = if (closeIdx >= 0) {
                (closeIdx + 1 until minOf(cells.size, closeIdx + 4))
                    .map { clean(it).replace("%", "").toDoubleOrNull() }
                    .firstOrNull { it != null && it in -100.0..100.0 } ?: 0.0
            } else 0.0

            val prev = if (changePct != 0.0) close / (1.0 + changePct / 100.0) else close

            val volume = cells.reversed().mapNotNull {
                it.text().replace("\\s+".toRegex(), "").replace(".", "").replace(",", "").toLongOrNull()
            }.firstOrNull { it > 0 } ?: 0L

            StockDto(
                ticker = ticker, name = name, sector = null, country = null,
                closingPrice = close, previousClosingPrice = prev,
                openingPrice = null, highest = null, lowest = null,
                volume = volume, marketCap = null, per = null, dividendYield = null,
                eps = null, bookValue = null, priceToBook = null, roe = null, lastTradeDate = null
            )
        }
    }

    private fun parseBrvmHistoryTable(html: String): List<PriceHistoryDto> {
        val doc  = Jsoup.parse(html)
        val rows = doc.select("table.table tbody tr").ifEmpty { doc.select("table tbody tr") }
        return rows.mapNotNull { row ->
            val cells = row.select("td")
            if (cells.size < 3) return@mapNotNull null
            val date  = cells[0].text().trim()
            val close = cells[1].text().replace(",", ".").replace("\\s+".toRegex(), "").toDoubleOrNull()
                ?: return@mapNotNull null
            val vol   = cells.getOrNull(4)?.text()?.replace("\\s+".toRegex(), "")?.replace(",", "")?.toLongOrNull()
            PriceHistoryDto(date = date, open = close, high = close * 1.01, low = close * 0.99, close = close, volume = vol)
        }
    }

    // ── API JSON SikaFinance ─────────────────────────────────────────────────

    private fun fetchSikaHistoryApi(
        ticker: String,
        from: LocalDate = LocalDate.now().minusYears(1),
        to:   LocalDate = LocalDate.now()
    ): List<PriceHistoryDto> {
        val body = """{"ticker":"$ticker","datedeb":"$from","datefin":"$to","xperiod":0}"""
            .toRequestBody(JSON_TYPE)

        val request = Request.Builder()
            .url(SIKA_HIST)
            .post(body)
            .header("User-Agent",      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0")
            .header("Accept",          "application/json, text/plain, */*")
            .header("Accept-Language", "fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3")
            .header("Content-Type",    "application/json")
            .header("Origin",          SIKA_BASE)
            .header("Referer",         "$SIKA_BASE/marches/historiques/$ticker")
            .header("Sec-Fetch-Dest",  "empty")
            .header("Sec-Fetch-Mode",  "cors")
            .header("Sec-Fetch-Site",  "same-origin")
            .build()

        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
            val json = response.body?.string() ?: return emptyList()
            return parseSikaHistoryJson(json)
        }
    }

    private fun parseSikaHistoryJson(json: String): List<PriceHistoryDto> {
        val result = mutableListOf<PriceHistoryDto>()
        try {
            val arr: JsonArray = JsonParser.parseString(json).asJsonArray
            for (el in arr) {
                val obj    = el.asJsonObject
                val date   = (obj.get("Date") ?: obj.get("date"))?.asString ?: continue
                if (date.isEmpty()) continue
                val close  = (obj.get("Cloture")  ?: obj.get("close"))?.asDouble?.takeIf { it > 0 } ?: continue
                val open   = (obj.get("Ouverture") ?: obj.get("open"))?.asDouble?.takeIf { it > 0 } ?: close
                val high   = (obj.get("PluHaut")   ?: obj.get("high"))?.asDouble?.takeIf { it > 0 } ?: close * 1.01
                val low    = (obj.get("PluBas")    ?: obj.get("low"))?.asDouble?.takeIf { it > 0 }  ?: close * 0.99
                val volume = (obj.get("Volume")    ?: obj.get("volume"))?.asLong ?: 0L
                result.add(PriceHistoryDto(date = date, open = open, high = high, low = low, close = close, volume = volume))
            }
        } catch (_: Exception) {}
        return result
    }

    // ── HTTP helpers ─────────────────────────────────────────────────────────

    private fun fetchChrome(url: String): String {
        val req = Request.Builder()
            .url(url)
            .header("User-Agent",               "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36")
            .header("Accept",                   "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
            .header("Accept-Language",          "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
            .header("Accept-Encoding",          "gzip, deflate, br")
            .header("Connection",               "keep-alive")
            .header("Upgrade-Insecure-Requests","1")
            .header("Sec-Fetch-Dest",           "document")
            .header("Sec-Fetch-Mode",           "navigate")
            .header("Sec-Fetch-Site",           "none")
            .header("Cache-Control",            "max-age=0")
            .build()
        okHttpClient.newCall(req).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
            return response.body?.string() ?: ""
        }
    }

    private fun fetchSika(url: String): String {
        val req = Request.Builder()
            .url(url)
            .header("User-Agent",               "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0")
            .header("Accept",                   "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
            .header("Accept-Language",          "fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3")
            .header("Accept-Encoding",          "gzip, deflate, br")
            .header("Connection",               "keep-alive")
            .header("Referer",                  "$SIKA_BASE/")
            .header("Upgrade-Insecure-Requests","1")
            .header("Sec-Fetch-Dest",           "document")
            .header("Sec-Fetch-Mode",           "navigate")
            .header("Sec-Fetch-Site",           "same-origin")
            .header("Cache-Control",            "max-age=0")
            .build()
        okHttpClient.newCall(req).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
            return response.body?.string() ?: ""
        }
    }
}
