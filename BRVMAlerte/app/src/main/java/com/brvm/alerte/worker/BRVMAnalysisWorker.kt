package com.brvm.alerte.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.brvm.alerte.data.preferences.UserPreferencesRepository
import com.brvm.alerte.domain.repository.AlertRepository
import com.brvm.alerte.domain.repository.StockRepository
import com.brvm.alerte.domain.usecase.ComputeTechnicalIndicatorsUseCase
import com.brvm.alerte.domain.usecase.DetectAlertsUseCase
import com.brvm.alerte.service.AlertNotificationService
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.first
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
    private val prefsRepo: UserPreferencesRepository
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val prefs = prefsRepo.preferences.first()

            // 1. Rafraîchir les données de marché
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

            // 3. Notifier
            if (newAlerts.isNotEmpty()) {
                if (newAlerts.size == 1) {
                    if (prefs.pushEnabled) notificationService.showAlert(newAlerts.first())
                } else {
                    val best = newAlerts.maxByOrNull { it.score }
                    if (best != null && prefs.pushEnabled) {
                        notificationService.showAlert(best)
                        notificationService.showBatchSummary(newAlerts.size, best.ticker)
                    }
                }
            }

            // 4. Nettoyage
            alertRepo.cleanOldAlerts(30)

            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val WORK_NAME = "brvm_analysis_worker"
        const val WORK_NAME_ONCE = "brvm_analysis_worker_once"

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
