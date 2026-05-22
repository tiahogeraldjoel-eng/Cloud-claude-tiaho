package com.joe.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.joe.launcher.services.BRVMUpdateWorker
import com.joe.launcher.services.PreOpenScannerWorker
import com.joe.launcher.utils.PrefsManager
import java.util.concurrent.TimeUnit

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {

            PrefsManager.init(context)

            if (PrefsManager.isBrvmAutoRefresh()) {
                val interval = PrefsManager.getBrvmRefreshInterval().toLong()
                val workRequest = PeriodicWorkRequestBuilder<BRVMUpdateWorker>(
                    interval, TimeUnit.MINUTES
                ).build()

                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    "brvm_update",
                    ExistingPeriodicWorkPolicy.KEEP,
                    workRequest
                )
            }

            // Planifier le scanner pré-ouverture à 9h35 GMT chaque jour de cotation
            PreOpenScannerWorker.scheduleDailyAt935(context)
        }
    }
}
