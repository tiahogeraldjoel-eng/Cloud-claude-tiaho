package com.tiaho.coffrefort

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.tiaho.coffrefort.notifications.ExpirationCheckWorker
import java.util.concurrent.TimeUnit

class VaultApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        scheduleExpirationCheck()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            ExpirationCheckWorker.CHANNEL_ID,
            "Échéances de documents",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Alerte quand un document approche de sa date d'expiration"
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun scheduleExpirationCheck() {
        val request = PeriodicWorkRequestBuilder<ExpirationCheckWorker>(1, TimeUnit.DAYS).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            ExpirationCheckWorker.UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }
}
