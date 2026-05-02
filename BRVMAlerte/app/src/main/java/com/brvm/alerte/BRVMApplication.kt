package com.brvm.alerte

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class BRVMApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)

        val urgentChannel = NotificationChannel(
            CHANNEL_URGENT,
            "Alertes Urgentes BRVM",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Opportunités critiques détectées — action immédiate recommandée"
            enableVibration(true)
            enableLights(true)
        }

        val strongChannel = NotificationChannel(
            CHANNEL_STRONG,
            "Signaux Forts BRVM",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Titres à fort potentiel détectés"
        }

        val infoChannel = NotificationChannel(
            CHANNEL_INFO,
            "Informations Marché",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Actualités et mises à jour du marché BRVM"
        }

        manager.createNotificationChannels(listOf(urgentChannel, strongChannel, infoChannel))
    }

    companion object {
        const val CHANNEL_URGENT = "brvm_urgent_channel"
        const val CHANNEL_STRONG = "brvm_strong_channel"
        const val CHANNEL_INFO = "brvm_info_channel"
    }
}
