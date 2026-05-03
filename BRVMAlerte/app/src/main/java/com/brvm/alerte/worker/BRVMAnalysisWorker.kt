package com.brvm.alerte.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.brvm.alerte.data.preferences.UserPreferencesRepository
import com.brvm.alerte.domain.model.AlertChannel
import com.brvm.alerte.domain.repository.AlertRepository
import com.brvm.alerte.domain.repository.StockRepository
import com.brvm.alerte.domain.usecase.ComputeTechnicalIndicatorsUseCase
import com.brvm.alerte.domain.usecase.DetectAlertsUseCase
import com.brvm.alerte.service.AlertNotificationService
import com.brvm.alerte.service.EmailService
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.first
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

@HiltWorker
class BRVMAnalysisWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted workerParams: WorkerParameters,
    private val stockRepo: StockRepository,
    private val alertRepo: AlertRepository,
    private val computeIndicators: ComputeTechnicalIndicatorsUseCase,
    private val detectAlerts: DetectAlertsUseCase,
    private val notificationService: AlertNotificationService,
    private val emailService: EmailService,
    private val prefsRepo: UserPreferencesRepository
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val prefs = prefsRepo.preferences.first()

            // 1. Rafraîchir les données de marché (API → scraper → seed)
            stockRepo.refreshAllStocks()

            val stocks = stockRepo.observeAllStocks().first()
            val newAlerts = mutableListOf<com.brvm.alerte.domain.model.Alert>()

            // 2. Analyser chaque titre
            for (stock in stocks) {
                try {
                    stockRepo.refreshPriceHistory(stock.ticker)
                    val history = stockRepo.getPriceHistory(stock.ticker, 200)

                    val indicators = if (history.size >= 26) {
                        computeIndicators.compute(stock.ticker, history).also { indic ->
                            if (indic != null) stockRepo.saveTechnicalIndicators(indic)
                        }
                    } else null

                    val alerts = detectAlerts.detect(stock, indicators)
                        .filter { it.score >= prefs.minScore }

                    for (alert in alerts) {
                        val id = alertRepo.saveAlert(alert)
                        newAlerts.add(alert.copy(id = id))
                    }
                } catch (e: Exception) {
                    // Continuer avec le prochain titre
                }
            }

            // 3. Notifications push
            if (newAlerts.isNotEmpty() && prefs.pushEnabled) {
                if (newAlerts.size == 1) {
                    notificationService.showAlert(newAlerts.first())
                } else {
                    val best = newAlerts.maxByOrNull { it.score }
                    if (best != null) {
                        notificationService.showAlert(best)
                        notificationService.showBatchSummary(newAlerts.size, best.ticker)
                    }
                }
            }

            // 4. Email automatique — rapport quotidien si alertes URGENT/FORT
            if (prefs.emailEnabled && newAlerts.isNotEmpty()) {
                val urgentAlerts = newAlerts.filter {
                    it.priority.name in listOf("URGENT", "STRONG")
                }
                if (urgentAlerts.isNotEmpty()) {
                    val date = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRANCE)
                        .format(Date())
                    emailService.sendBatchReport(urgentAlerts, date)
                }
            }

            // 5. Mettre à jour les canaux envoyés
            for (alert in newAlerts) {
                val sent = mutableSetOf<AlertChannel>()
                if (prefs.pushEnabled) sent.add(AlertChannel.PUSH)
                if (prefs.emailEnabled) sent.add(AlertChannel.EMAIL)
                if (sent.isNotEmpty()) alertRepo.updateSentChannels(alert.id, sent)
            }

            // 6. Nettoyage
            alertRepo.cleanOldAlerts(30)

            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val WORK_NAME = "brvm_analysis_worker"

        fun periodicRequest(): PeriodicWorkRequest =
            PeriodicWorkRequestBuilder<BRVMAnalysisWorker>(1, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build()

        fun oneTimeRequest(): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<BRVMAnalysisWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
    }
}
