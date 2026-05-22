package com.joe.launcher.services

import android.content.Context
import androidx.work.*
import com.google.gson.Gson
import com.joe.launcher.models.OrderBook
import com.joe.launcher.models.OrderLevel
import com.joe.launcher.models.PreOpenSignal
import com.joe.launcher.utils.PreOpenNotificationManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import java.util.Calendar
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/**
 * WorkManager worker planifié à 9h35 GMT chaque jour de cotation (lundi-vendredi).
 * Aspire le carnet d'ordres des valeurs liquides BRVM, calcule MPR/OBI/Iceberg,
 * et push une notification flash si un signal d'alerte est détecté.
 *
 * Une seule exécution par jour — pas de boucle, pas de polling.
 * Retry unique à 9h38 géré par [scheduleWithRetry].
 */
class PreOpenScannerWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    companion object {
        const val WORK_TAG_PRIMARY = "brvm_preopen_primary"
        const val WORK_TAG_RETRY   = "brvm_preopen_retry"

        // Tickers cibles + volumes journaliers moyens de référence
        private val TICKERS = mapOf(
            "SNTS" to TickerMeta("Sonatel",               avgDailyVol = 890,   refPrice = 15500.0),
            "CBBF" to TickerMeta("Coris Bank BF",         avgDailyVol = 520,   refPrice = 8750.0),
            "STBC" to TickerMeta("Société Générale BF",   avgDailyVol = 340,   refPrice = 5300.0),
            "ONAT" to TickerMeta("Onatel BF",             avgDailyVol = 310,   refPrice = 4950.0),
            "TTLC" to TickerMeta("Total CI",              avgDailyVol = 3400,  refPrice = 1875.0),
            "ETIT" to TickerMeta("Ecobank Transnational", avgDailyVol = 48000, refPrice = 22.0),
            "SGBC" to TickerMeta("SGB CI",                avgDailyVol = 290,   refPrice = 18200.0),
            "ORAC" to TickerMeta("Orange CI",             avgDailyVol = 5400,  refPrice = 14750.0),
        )

        private const val MPR_THRESHOLD      = 2.5
        private const val OBI_THRESHOLD      = 0.85
        private const val SPREAD_TIGHT_MAX   = 0.5   // %
        private const val ICEBERG_MULTIPLIER = 3.0
        private const val BOOK_DEPTH         = 5
        private const val NET_TIMEOUT_SEC    = 12L

        private val USER_AGENTS = listOf(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
        )

        /**
         * Planifie le worker pour la prochaine occurrence de 9h35 GMT.
         * À appeler depuis [com.joe.launcher.receivers.BootReceiver] et au démarrage de l'app.
         */
        fun scheduleDailyAt935(context: Context) {
            val delay = minutesUntilNextGmt(hour = 9, minute = 35)
            val request = OneTimeWorkRequestBuilder<PreOpenScannerWorker>()
                .setInitialDelay(delay, TimeUnit.MINUTES)
                .addTag(WORK_TAG_PRIMARY)
                .setInputData(workDataOf("is_retry" to false))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_TAG_PRIMARY, ExistingWorkPolicy.REPLACE, request)
        }

        /** Planifie le retry à 9h38 GMT (appelé uniquement si la tentative principale échoue). */
        private fun scheduleRetryAt938(context: Context) {
            val delay = minutesUntilNextGmt(hour = 9, minute = 38)
            val request = OneTimeWorkRequestBuilder<PreOpenScannerWorker>()
                .setInitialDelay(delay, TimeUnit.MINUTES)
                .addTag(WORK_TAG_RETRY)
                .setInputData(workDataOf("is_retry" to true))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_TAG_RETRY, ExistingWorkPolicy.KEEP, request)
        }

        private fun minutesUntilNextGmt(hour: Int, minute: Int): Long {
            val gmt     = TimeZone.getTimeZone("GMT")
            val now     = Calendar.getInstance(gmt)
            val target  = Calendar.getInstance(gmt).apply {
                set(Calendar.HOUR_OF_DAY, hour)
                set(Calendar.MINUTE, minute)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            if (target.timeInMillis <= now.timeInMillis) target.add(Calendar.DAY_OF_YEAR, 1)
            return ((target.timeInMillis - now.timeInMillis) / 60_000).coerceAtLeast(1)
        }
    }

    private data class TickerMeta(val name: String, val avgDailyVol: Int, val refPrice: Double)

    private val http = OkHttpClient.Builder()
        .connectTimeout(NET_TIMEOUT_SEC, TimeUnit.SECONDS)
        .readTimeout(NET_TIMEOUT_SEC, TimeUnit.SECONDS)
        .build()

    // ── Entrée principale ──────────────────────────────────────────────────

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val isRetry = inputData.getBoolean("is_retry", false)

        if (!isTradingDay()) return@withContext Result.success()

        PreOpenNotificationManager.createChannel(applicationContext)

        val books = collectOrderBooks()
        val successCount = books.values.count { it != null }

        // Aucune donnée et c'est la tentative principale → planifier retry 9h38
        if (successCount == 0 && !isRetry) {
            scheduleRetryAt938(applicationContext)
            return@withContext Result.success()
        }

        // Aucune donnée au retry → warning et abandon
        if (successCount == 0) {
            PreOpenNotificationManager.showNoDataWarning(applicationContext)
            rescheduleForTomorrow()
            return@withContext Result.success()
        }

        // Analyser et dispatcher
        val signals = books.entries
            .mapNotNull { (ticker, book) -> book?.let { analyzeBook(ticker, it) } }

        val alerts = signals.filter { it.alertReasons.isNotEmpty() }
        alerts.forEach { signal ->
            PreOpenNotificationManager.showFlashAlert(applicationContext, signal)
        }

        rescheduleForTomorrow()
        Result.success()
    }

    // ── Collecte des carnets d'ordres ─────────────────────────────────────

    private suspend fun collectOrderBooks(): Map<String, OrderBook?> {
        val result = mutableMapOf<String, OrderBook?>()
        for (ticker in TICKERS.keys) {
            result[ticker] = fetchOrderBook(ticker)
            // Micro-pause humaine entre requêtes
            kotlinx.coroutines.delay((800L..2000L).random())
        }
        return result
    }

    private fun fetchOrderBook(ticker: String): OrderBook? {
        val sources = listOf(
            "https://www.brvm.org/fr/negociation/carnet-des-ordres/${ticker.lowercase()}",
            "https://www.brvm.org/fr/cours-des-actions/0/${ticker.lowercase()}",
        )
        for (url in sources) {
            try {
                val request = Request.Builder()
                    .url(url)
                    .header("User-Agent",      USER_AGENTS.random())
                    .header("Accept",          "text/html,application/xhtml+xml,*/*;q=0.8")
                    .header("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.3")
                    .header("Referer",         "https://www.brvm.org/fr/cours-des-actions/0/all")
                    .build()

                http.newCall(request).execute().use { resp ->
                    if (!resp.isSuccessful) return@use
                    val html = resp.body?.string() ?: return@use
                    val book = parseOrderBook(html, ticker)
                    if (book != null) return book
                }
            } catch (_: Exception) { /* source inaccessible, tenter suivante */ }
        }
        return null
    }

    private fun parseOrderBook(html: String, ticker: String): OrderBook? {
        val doc   = Jsoup.parse(html)
        val bids  = mutableListOf<OrderLevel>()
        val asks  = mutableListOf<OrderLevel>()

        // Chercher tables avec headers "achat"/"acheteur" ou "vente"/"vendeur"
        doc.select("table").forEach { table ->
            val headerText = table.select("th").joinToString(" ") { it.text().lowercase() }
            val levels     = extractLevelsFromTable(table)
            when {
                headerText.contains("achat") || headerText.contains("bid") -> bids.addAll(levels)
                headerText.contains("vente") || headerText.contains("ask") -> asks.addAll(levels)
            }
        }

        if (bids.isEmpty() || asks.isEmpty()) return null
        return OrderBook(
            ticker = ticker,
            bids   = bids.take(BOOK_DEPTH),
            asks   = asks.take(BOOK_DEPTH),
        )
    }

    private fun extractLevelsFromTable(table: org.jsoup.nodes.Element): List<OrderLevel> {
        val levels = mutableListOf<OrderLevel>()
        table.select("tr").drop(1).take(BOOK_DEPTH).forEach { row ->
            val nums = row.select("td")
                .mapNotNull { cell ->
                    cell.text().replace("[^\\d,.]".toRegex(), "")
                        .replace(",", ".")
                        .toDoubleOrNull()
                        ?.takeIf { it > 0 }
                }
            if (nums.size >= 2) {
                levels.add(OrderLevel(price = nums[0], volume = nums[1].toInt()))
            }
        }
        return levels
    }

    // ── Moteur de scoring ─────────────────────────────────────────────────

    private fun analyzeBook(ticker: String, book: OrderBook): PreOpenSignal {
        val meta = TICKERS[ticker] ?: TickerMeta(ticker, 1000, 0.0)

        val mpr = if (book.totalAskVolume > 0)
            book.totalBidVolume.toDouble() / book.totalAskVolume else 0.0

        val obi = book.bestBid?.let { bid ->
            book.bestAsk?.let { ask ->
                val denom = bid.volume + ask.volume
                if (denom > 0) (bid.volume - ask.volume).toDouble() / denom else 0.0
            }
        } ?: 0.0

        val spreadPct    = book.spreadPct ?: Double.MAX_VALUE
        val bestBidVol   = book.bestBid?.volume ?: 0
        val icebergRatio = if (meta.avgDailyVol > 0) bestBidVol.toDouble() / meta.avgDailyVol else 0.0
        val iceberg      = icebergRatio > ICEBERG_MULTIPLIER

        val reasons = buildList {
            if (mpr > MPR_THRESHOLD)
                add("MPR=${String.format("%.2f", mpr)} > seuil $MPR_THRESHOLD " +
                    "(acheteurs ${book.totalBidVolume} titres vs vendeurs ${book.totalAskVolume})")
            if (obi >= OBI_THRESHOLD && spreadPct <= SPREAD_TIGHT_MAX)
                add("OBI=${String.format("%.3f", obi)} ≈ 1 avec spread serré " +
                    "${String.format("%.2f", spreadPct)}%")
            if (iceberg && isNotEmpty())
                add("ICEBERG : ${bestBidVol} titres = ${String.format("%.1f", icebergRatio)}× vol. journalier moyen")
        }

        val confidence = when {
            reasons.size >= 3 || (mpr > MPR_THRESHOLD * 1.5 && obi > OBI_THRESHOLD) -> "HIGH"
            reasons.size >= 2 || mpr > MPR_THRESHOLD                                -> "MEDIUM"
            else                                                                     -> "LOW"
        }

        val theoOpen = run {
            val mid = ((book.bestBid?.price ?: meta.refPrice) + (book.bestAsk?.price ?: meta.refPrice)) / 2
            val adj = minOf(0.05, maxOf(-0.05, (mpr - 1.0) * 0.01))
            mid * (1 + adj)
        }

        return PreOpenSignal(
            ticker          = ticker,
            name            = meta.name,
            theoOpenPrice   = theoOpen,
            refPrice        = meta.refPrice,
            mpr             = mpr,
            obi             = obi,
            spreadPct       = spreadPct.takeIf { it < Double.MAX_VALUE } ?: 0.0,
            bestBidVolume   = bestBidVol,
            totalBidVolume  = book.totalBidVolume,
            totalAskVolume  = book.totalAskVolume,
            avgDailyVolume  = meta.avgDailyVol,
            icebergDetected = iceberg,
            alertReasons    = reasons,
            confidence      = confidence,
            actionMessage   = if (reasons.isNotEmpty())
                "⚡ Pression Acheteuse Critique : Risque de réservation à la hausse. " +
                "Position recommandée avant 9h45 GMT."
            else "",
            timestampGmt    = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",
                java.util.Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("GMT")
                }.format(java.util.Date()),
            dataQuality     = if (book.isSynthetic) "SYNTHETIC" else "LIVE",
        )
    }

    // ── Utilitaires ───────────────────────────────────────────────────────

    private fun isTradingDay(): Boolean {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("GMT"))
        val day = cal.get(Calendar.DAY_OF_WEEK)
        return day != Calendar.SATURDAY && day != Calendar.SUNDAY
    }

    private fun rescheduleForTomorrow() {
        scheduleDailyAt935(applicationContext)
    }

    private fun ClosedRange<Long>.random(): Long =
        (start + (Math.random() * (endInclusive - start + 1)).toLong())
}
