package com.brvm.alerte

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.*
import com.brvm.alerte.data.preferences.UserPreferencesRepository
import com.brvm.alerte.service.EmailService
import com.brvm.alerte.worker.BRVMAnalysisWorker
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@HiltAndroidApp
class BRVMApplication : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var prefsRepo: UserPreferencesRepository
    @Inject lateinit var emailService: EmailService

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        schedulePeriodicAnalysis()
        initEmailService()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        listOf(
            NotificationChannel(CHANNEL_URGENT, "Alertes Urgentes BRVM", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Opportunités critiques — action immédiate recommandée"
                enableVibration(true)
                enableLights(true)
            },
            NotificationChannel(CHANNEL_STRONG, "Signaux Forts BRVM", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Titres à fort potentiel détectés"
            },
            NotificationChannel(CHANNEL_INFO, "Informations Marché", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Actualités et mises à jour du marché BRVM"
            }
        ).forEach { manager.createNotificationChannel(it) }
    }

    private fun schedulePeriodicAnalysis() {
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            BRVMAnalysisWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<BRVMAnalysisWorker>(1, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build()
        )
    }

    private fun initEmailService() {
        CoroutineScope(Dispatchers.IO).launch {
            val prefs = prefsRepo.preferences.first()
            if (prefs.emailEnabled && prefs.emailSender.isNotEmpty()) {
                emailService.configure(
                    senderEmail = prefs.emailSender,
                    senderPassword = prefs.emailPassword,
                    recipientEmails = prefs.emailRecipients.split(",", ";")
                        .map { it.trim() }.filter { it.isNotEmpty() },
                    smtpHost = prefs.smtpHost,
                    smtpPort = prefs.smtpPort
                )
            }
        }
    }

    companion object {
        const val CHANNEL_URGENT = "brvm_urgent_channel"
        const val CHANNEL_STRONG = "brvm_strong_channel"
        const val CHANNEL_INFO = "brvm_info_channel"
    }
}
