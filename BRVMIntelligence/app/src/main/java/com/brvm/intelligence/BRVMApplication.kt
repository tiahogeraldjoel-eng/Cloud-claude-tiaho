package com.brvm.intelligence

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import androidx.work.WorkManager
import com.brvm.intelligence.data.worker.MarketSyncWorker
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject

@HiltAndroidApp
class BRVMApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()

        setupTimber()
        setupNotificationChannels()
        scheduleMarketSync()
    }

    private fun setupTimber() {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            Timber.plant(object : Timber.Tree() {
                override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
                    // En production : envoyer à Firebase Crashlytics
                }
            })
        }
    }

    private fun setupNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            // Canal alertes prix
            NotificationChannel(
                "brvm_alerts",
                "Alertes BRVM",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alertes sur les cours des actions BRVM"
                enableLights(true)
                enableVibration(true)
            }.also { manager.createNotificationChannel(it) }

            // Canal synchronisation marché
            NotificationChannel(
                "brvm_sync",
                "Synchronisation BRVM",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mise à jour des données de marché en arrière-plan"
            }.also { manager.createNotificationChannel(it) }

            // Canal recommandations
            NotificationChannel(
                "brvm_recommendations",
                "Recommandations IA",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Nouvelles recommandations de l'assistant IA BRVM"
            }.also { manager.createNotificationChannel(it) }
        }
    }

    private fun scheduleMarketSync() {
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            MarketSyncWorker.WORK_NAME,
            androidx.work.ExistingPeriodicWorkPolicy.KEEP,
            MarketSyncWorker.buildPeriodicRequest()
        )
        Timber.d("Synchronisation périodique BRVM programmée (toutes les 30 min)")
    }
}
