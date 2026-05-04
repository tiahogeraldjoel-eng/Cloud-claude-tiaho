package com.brvm.alerte.data.api

import com.brvm.alerte.data.api.dto.PriceHistoryDto
import com.brvm.alerte.data.api.dto.StockDto
import com.google.gson.JsonArray
import com.google.gson.JsonParser
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.jsoup.Jsoup
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BRVMScraper @Inject constructor(
    private val okHttpClient: OkHttpClient
) {
    companion object {
        private const val BRVM_BASE = "https://www.brvm.org"
        private const val SIKA_BASE = "https://www.sikafinance.com"

        private val BRVM_STOCKS_URLS = listOf(
            "$BRVM_BASE/fr/cours-actions/0",
            "$BRVM_BASE/en/stocks/0"
        )
        private val BRVM_HISTORY_URLS = listOf(
            "$BRVM_BASE/fr/cours/0/",
            "$BRVM_BASE/en/cours/0/"
        )
        private const val SIKA_ALL_STOCKS_URL = "$SIKA_BASE/marches/aaz"
        private const val SIKA_HISTORY_API = "$SIKA_BASE/api/general/GetHistos"

        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }

    fun scrapeAllStocks(): List<StockDto> {
        // 1. Try brvm.org (Chrome mobile headers — works from Android residential IPs)
        for (url in BRVM_STOCKS_URLS) {
            try {
                val html = fetchChrome(url)
                if (html.length < 500) continue
                val result = parseBrvmStocksTable(html)
                if (result.isNotEmpty()) return result
            } catch (_: Exception) { continue }
        }

        // 2. Fallback: sikafinance AàZ page (Firefox desktop + same-origin headers)
        try {
            val html = fetchSikaPage(SIKA_ALL_STOCKS_URL)
            if (html.length >= 500) {
                val result = parseSikaAllStocksTable(html)
                if (result.isNotEmpty()) return result
            }
        } catch (_: Exception) {}

        return emptyList()
    }

    fun scrapeHistory(ticker: String): List<PriceHistoryDto> {
        // 1. SikaFinance JSON API (most reliable)
        try {
            val result = fetchSikaHistoryApi(ticker)
            if (result.isNotEmpty()) return result
        } catch (_: Exception) {}

        // 2. brvm.org HTML fallback
        for (baseUrl in BRVM_HISTORY_URLS) {
            try {
                val html = fetchChrome("$baseUrl$ticker")
                if (html.length < 200) continue
                val result = parseBrvmHistoryTable(html)
                if (result.isNotEmpty()) return result
            } catch (_: Exception) { continue }
        }

        return emptyList()
    }

    private fun fetchSikaHistoryApi(ticker: String): List<PriceHistoryDto> {
        val today = LocalDate.now()
        val body = """{"ticker":"$ticker","datedeb":"${today.minusYears(1)}","datefin":"$today","xperiod":0}"""
            .toRequestBody(JSON_MEDIA_TYPE)

        val request = Request.Builder()
            .url(SIKA_HISTORY_API)
            .post(body)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0")
            .header("Accept", "application/json, text/plain, */*")
            .header("Accept-Language", "fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3")
            .header("Content-Type", "application/json")
            .header("Origin", SIKA_BASE)
            .header("Referer", "$SIKA_BASE/marches/historiques/$ticker")
            .header("Sec-Fetch-Dest", "empty")
            .header("Sec-Fetch-Mode", "cors")
            .header("Sec-Fetch-Site", "same-origin")
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
                val obj = el.asJsonObject
                val date = (obj.get("Date") ?: obj.get("date"))?.asString ?: continue
                if (date.isEmpty()) continue
                val close = (obj.get("Cloture") ?: obj.get("close"))?.asDouble?.takeIf { it > 0 } ?: continue
                val open = (obj.get("Ouverture") ?: obj.get("open"))?.asDouble?.takeIf { it > 0 } ?: close
                val high = (obj.get("PluHaut") ?: obj.get("high"))?.asDouble?.takeIf { it > 0 } ?: close * 1.01
                val low = (obj.get("PluBas") ?: obj.get("low"))?.asDouble?.takeIf { it > 0 } ?: close * 0.99
                val volume = (obj.get("Volume") ?: obj.get("volume"))?.asLong ?: 0L
                result.add(PriceHistoryDto(date = date, open = open, high = high, low = low, close = close, volume = volume))
            }
        } catch (_: Exception) {}
        return result
    }

    private fun parseBrvmStocksTable(html: String): List<StockDto> {
        val doc = Jsoup.parse(html)
        val rows = doc.select("table.table tbody tr")
            .ifEmpty { doc.select("table tbody tr") }
            .ifEmpty { doc.select("tr") }

        return rows.mapNotNull { row ->
            val cells = row.select("td")
            if (cells.size < 4) return@mapNotNull null
            val tickerIdx = if (cells.size >= 6) 1 else 0
            val nameIdx = tickerIdx + 1
            val closeIdx = nameIdx + 1
            val changeIdx = closeIdx + 1
            val volumeIdx = if (cells.size > changeIdx + 1) changeIdx + 1 else changeIdx

            val ticker = cells[tickerIdx].text().trim()
            if (ticker.isEmpty() || ticker.length > 10) return@mapNotNull null
            val name = cells.getOrNull(nameIdx)?.text()?.trim() ?: ticker
            val closeText = cells[closeIdx].text().replace(",", ".").replace("\\s+".toRegex(), "").replace(" ", "")
            val changeText = cells.getOrNull(changeIdx)?.text()?.replace(",", ".")?.replace("%", "")?.trim() ?: "0"
            val volumeText = cells.getOrNull(volumeIdx)?.text()?.replace("\\s+".toRegex(), "")?.replace(",", "") ?: "0"
            val close = closeText.toDoubleOrNull() ?: return@mapNotNull null
            if (close <= 0) return@mapNotNull null
            val changePct = changeText.toDoubleOrNull() ?: 0.0
            val prevClose = if (changePct != 0.0) close / (1 + changePct / 100) else close

            StockDto(
                ticker = ticker, name = name, sector = null, country = null,
                closingPrice = close, previousClosingPrice = prevClose,
                openingPrice = null, highest = null, lowest = null,
                volume = volumeText.toLongOrNull(),
                marketCap = null, per = null, dividendYield = null,
                eps = null, bookValue = null, priceToBook = null, roe = null, lastTradeDate = null
            )
        }
    }

    private fun parseSikaAllStocksTable(html: String): List<StockDto> {
        val doc = Jsoup.parse(html)
        // Sikafinance AàZ table: ticker | name | last | change% | volume | ...
        val rows = doc.select("table tbody tr").ifEmpty { doc.select("tr") }
        return rows.mapNotNull { row ->
            val cells = row.select("td")
            if (cells.size < 3) return@mapNotNull null
            val ticker = cells[0].text().trim().uppercase()
            if (ticker.isEmpty() || ticker.length > 10 || !ticker[0].isLetter()) return@mapNotNull null
            val closeText = cells.getOrNull(2)?.text()?.replace(",", ".")?.replace("\\s+".toRegex(), "")?.replace(" ", "")
                ?: return@mapNotNull null
            val close = closeText.toDoubleOrNull() ?: return@mapNotNull null
            if (close <= 0) return@mapNotNull null
            val name = cells.getOrNull(1)?.text()?.trim() ?: ticker
            val changeText = cells.getOrNull(3)?.text()?.replace(",", ".")?.replace("%", "")?.trim() ?: "0"
            val changePct = changeText.toDoubleOrNull() ?: 0.0
            val prevClose = if (changePct != 0.0) close / (1 + changePct / 100) else close
            val volumeText = cells.getOrNull(4)?.text()?.replace("\\s+".toRegex(), "")?.replace(",", "") ?: "0"
            StockDto(
                ticker = ticker, name = name, sector = null, country = null,
                closingPrice = close, previousClosingPrice = prevClose,
                openingPrice = null, highest = null, lowest = null,
                volume = volumeText.toLongOrNull(),
                marketCap = null, per = null, dividendYield = null,
                eps = null, bookValue = null, priceToBook = null, roe = null, lastTradeDate = null
            )
        }
    }

    private fun parseBrvmHistoryTable(html: String): List<PriceHistoryDto> {
        val doc = Jsoup.parse(html)
        val rows = doc.select("table.table tbody tr").ifEmpty { doc.select("table tbody tr") }
        return rows.mapNotNull { row ->
            val cells = row.select("td")
            if (cells.size < 3) return@mapNotNull null
            val date = cells[0].text().trim()
            val close = cells[1].text().replace(",", ".").replace("\\s+".toRegex(), "").toDoubleOrNull()
                ?: return@mapNotNull null
            val volume = cells.getOrNull(4)?.text()?.replace("\\s+".toRegex(), "")?.replace(",", "")?.toLongOrNull()
            PriceHistoryDto(date = date, open = close, high = close * 1.01, low = close * 0.99, close = close, volume = volume)
        }
    }

    // Chrome mobile headers — mimics Android browser for brvm.org
    private fun fetchChrome(url: String): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36")
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
            .header("Accept-Language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
            .header("Accept-Encoding", "gzip, deflate, br")
            .header("Connection", "keep-alive")
            .header("Upgrade-Insecure-Requests", "1")
            .header("Sec-Fetch-Dest", "document")
            .header("Sec-Fetch-Mode", "navigate")
            .header("Sec-Fetch-Site", "none")
            .header("Cache-Control", "max-age=0")
            .build()
        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
            return response.body?.string() ?: ""
        }
    }

    // Firefox desktop headers with same-origin Referer — bypasses sikafinance anti-scraping
    private fun fetchSikaPage(url: String): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0")
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
            .header("Accept-Language", "fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3")
            .header("Accept-Encoding", "gzip, deflate, br")
            .header("Connection", "keep-alive")
            .header("Referer", "$SIKA_BASE/")
            .header("Upgrade-Insecure-Requests", "1")
            .header("Sec-Fetch-Dest", "document")
            .header("Sec-Fetch-Mode", "navigate")
            .header("Sec-Fetch-Site", "same-origin")
            .header("Cache-Control", "max-age=0")
            .build()
        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
            return response.body?.string() ?: ""
        }
    }
}
