package com.brvm.alerte.data.api

import com.brvm.alerte.data.api.dto.PriceHistoryDto
import com.brvm.alerte.data.api.dto.StockDto
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BRVMScraper @Inject constructor(
    private val okHttpClient: OkHttpClient
) {
    companion object {
        private const val BASE_URL = "https://www.brvm.org"
        // Essaie les deux versions (anglais + français)
        private val STOCKS_URLS = listOf(
            "$BASE_URL/fr/cours-actions/0",
            "$BASE_URL/en/stocks/0"
        )
        private val HISTORY_URLS = listOf(
            "$BASE_URL/fr/cours/0/",
            "$BASE_URL/en/cours/0/"
        )
    }

    fun scrapeAllStocks(): List<StockDto> {
        for (url in STOCKS_URLS) {
            try {
                val html = fetch(url)
                if (html.length < 500) continue  // page vide ou erreur
                val doc = Jsoup.parse(html)

                // Essaie plusieurs sélecteurs selon la version du site
                val rows = doc.select("table.table tbody tr")
                    .ifEmpty { doc.select("table tbody tr") }
                    .ifEmpty { doc.select("tr") }

                val result = rows.mapNotNull { row ->
                    val cells = row.select("td")
                    if (cells.size < 4) return@mapNotNull null
                    // Cherche le ticker (2ème colonne en général, 1ère si pas de N°)
                    val tickerIdx = if (cells.size >= 6) 1 else 0
                    val nameIdx = tickerIdx + 1
                    val closeIdx = nameIdx + 1
                    val changeIdx = closeIdx + 1
                    val volumeIdx = if (cells.size > changeIdx + 1) changeIdx + 1 else changeIdx

                    val ticker = cells[tickerIdx].text().trim()
                    if (ticker.isEmpty() || ticker.length > 10) return@mapNotNull null
                    val name = cells.getOrNull(nameIdx)?.text()?.trim() ?: ticker
                    val closeText = cells[closeIdx].text().replace(",", ".").replace("\\s+".toRegex(), "").replace(" ", "")
                    val changeText = cells.getOrNull(changeIdx)?.text()?.replace(",", ".")?.replace("%", "")?.trim() ?: "0"
                    val volumeText = cells.getOrNull(volumeIdx)?.text()?.replace("\\s+".toRegex(), "")?.replace(",", "") ?: "0"
                    val close = closeText.toDoubleOrNull() ?: return@mapNotNull null
                    if (close <= 0) return@mapNotNull null
                    val changePct = changeText.toDoubleOrNull() ?: 0.0
                    val prevClose = if (changePct != 0.0) close / (1 + changePct / 100) else close

                    StockDto(
                        ticker = ticker, name = name,
                        sector = null, country = null,
                        closingPrice = close, previousClosingPrice = prevClose,
                        openingPrice = null, highest = null, lowest = null,
                        volume = volumeText.toLongOrNull(),
                        marketCap = null, per = null, dividendYield = null,
                        eps = null, bookValue = null, priceToBook = null,
                        roe = null, lastTradeDate = null
                    )
                }
                if (result.isNotEmpty()) return result
            } catch (_: Exception) {
                continue
            }
        }
        return emptyList()
    }

    fun scrapeHistory(ticker: String): List<PriceHistoryDto> {
        for (baseUrl in HISTORY_URLS) {
            try {
                val html = fetch("$baseUrl$ticker")
                if (html.length < 200) continue
                val doc = Jsoup.parse(html)
                val rows = doc.select("table.table tbody tr")
                    .ifEmpty { doc.select("table tbody tr") }

                val result = rows.mapNotNull { row ->
                    val cells = row.select("td")
                    if (cells.size < 3) return@mapNotNull null
                    val date = cells[0].text().trim()
                    val close = cells[1].text().replace(",", ".").replace("\\s+".toRegex(), "").toDoubleOrNull()
                        ?: return@mapNotNull null
                    val volume = cells.getOrNull(4)?.text()?.replace("\\s+".toRegex(), "")?.replace(",", "")?.toLongOrNull()
                    PriceHistoryDto(date = date, open = close, high = close * 1.01, low = close * 0.99, close = close, volume = volume)
                }
                if (result.isNotEmpty()) return result
            } catch (_: Exception) {
                continue
            }
        }
        return emptyList()
    }

    private fun fetch(url: String): String {
        val request = Request.Builder()
            .url(url)
            // Headers Chrome mobile — ressemble à un vrai navigateur sur téléphone
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
}
