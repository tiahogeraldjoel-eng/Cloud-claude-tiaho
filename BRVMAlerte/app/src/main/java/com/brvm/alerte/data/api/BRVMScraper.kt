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
        private const val STOCKS_URL = "$BASE_URL/en/stocks/0"
        private const val HISTORY_URL = "$BASE_URL/en/cours/0/"
    }

    fun scrapeAllStocks(): List<StockDto> {
        return try {
            val html = fetch(STOCKS_URL)
            val doc = Jsoup.parse(html)
            val rows = doc.select("table.table tbody tr")

            rows.mapNotNull { row ->
                val cells = row.select("td")
                if (cells.size < 6) return@mapNotNull null
                val ticker = cells[1].text().trim()
                val name = cells[2].text().trim()
                val closeText = cells[3].text().replace(",", ".").replace("\\s".toRegex(), "")
                val changeText = cells[4].text().replace(",", ".").replace("%", "").trim()
                val volumeText = cells[5].text().replace("\\s".toRegex(), "").replace(",", "")
                val close = closeText.toDoubleOrNull() ?: return@mapNotNull null
                val changePct = changeText.toDoubleOrNull() ?: 0.0
                val prevClose = if (changePct != 0.0) close / (1 + changePct / 100) else close

                StockDto(
                    ticker = ticker,
                    name = name,
                    sector = null,
                    country = null,
                    closingPrice = close,
                    previousClosingPrice = prevClose,
                    openingPrice = null,
                    highest = null,
                    lowest = null,
                    volume = volumeText.toLongOrNull(),
                    marketCap = null,
                    per = null,
                    dividendYield = null,
                    eps = null,
                    bookValue = null,
                    priceToBook = null,
                    roe = null,
                    lastTradeDate = null
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun scrapeHistory(ticker: String): List<PriceHistoryDto> {
        return try {
            val html = fetch("$HISTORY_URL$ticker")
            val doc = Jsoup.parse(html)
            val rows = doc.select("table.table tbody tr")

            rows.mapNotNull { row ->
                val cells = row.select("td")
                if (cells.size < 5) return@mapNotNull null
                val date = cells[0].text().trim()
                val close = cells[1].text().replace(",", ".").replace("\\s".toRegex(), "").toDoubleOrNull()
                    ?: return@mapNotNull null
                val volume = cells[4].text().replace("\\s".toRegex(), "").replace(",", "").toLongOrNull()

                PriceHistoryDto(
                    date = date,
                    open = close,
                    high = close * 1.01,
                    low = close * 0.99,
                    close = close,
                    volume = volume
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun fetch(url: String): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0")
            .header("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8")
            .build()
        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
            return response.body?.string() ?: ""
        }
    }
}
