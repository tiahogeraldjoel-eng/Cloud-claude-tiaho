package com.brvm.intelligence.data.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.brvm.intelligence.data.local.dao.PriceAlertDao
import com.brvm.intelligence.data.local.dao.StockDao
import com.brvm.intelligence.domain.repository.StockRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.first
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * Worker de synchronisation périodique des données BRVM.
 * Programmé toutes les 30 minutes pendant les heures d'ouverture du marché.
 * Vérifie également les alertes sur cours.
 */
@HiltWorker
class MarketSyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted workerParams: WorkerParameters,
    private val stockRepository: StockRepository,
    private val stockDao: StockDao,
    private val alertDao: PriceAlertDao
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        Timber.d("MarketSyncWorker: démarrage de la synchronisation BRVM")
        return try {
            // Synchronisation des cours
            val syncResult = stockRepository.refreshMarketData()
            syncResult.onSuccess {
                Timber.i("MarketSyncWorker: données BRVM mises à jour avec succès")
                checkPriceAlerts()
            }.onFailure { e ->
                Timber.w("MarketSyncWorker: échec de synchronisation — ${e.message}")
                return Result.retry()
            }
            Result.success()
        } catch (e: Exception) {
            Timber.e(e, "MarketSyncWorker: erreur inattendue")
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    private suspend fun checkPriceAlerts() {
        try {
            val activeAlerts = alertDao.getAllActiveAlerts().first()
            activeAlerts.forEach { alert ->
                val stock = stockDao.getStockBySymbol(alert.symbol) ?: return@forEach
                val triggered = when {
                    alert.notifyAbove && stock.currentPrice >= alert.targetPrice -> true
                    !alert.notifyAbove && stock.currentPrice <= alert.targetPrice -> true
                    else -> false
                }
                if (triggered) {
                    sendAlertNotification(alert.symbol, stock.currentPrice, alert.targetPrice)
                    alertDao.deactivateAlert(alert.id)
                }
            }
        } catch (e: Exception) {
            Timber.w("Erreur vérification alertes: ${e.message}")
        }
    }

    private fun sendAlertNotification(symbol: String, currentPrice: Double, targetPrice: Double) {
        Timber.i("ALERTE PRIX: $symbol atteint ${currentPrice} FCFA (cible: ${targetPrice} FCFA)")
        // La notification push réelle est gérée par le service Firebase
    }

    companion object {
        const val WORK_NAME = "MarketSyncWorker"

        fun buildPeriodicRequest(): PeriodicWorkRequest {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            return PeriodicWorkRequestBuilder<MarketSyncWorker>(
                repeatInterval = 30,
                repeatIntervalTimeUnit = TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .build()
        }

        fun buildOneTimeRequest(): OneTimeWorkRequest {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            return OneTimeWorkRequestBuilder<MarketSyncWorker>()
                .setConstraints(constraints)
                .build()
        }
    }
}
