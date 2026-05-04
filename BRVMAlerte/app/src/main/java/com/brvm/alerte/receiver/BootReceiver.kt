package com.brvm.alerte.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.WorkManager
import com.brvm.alerte.worker.BRVMAnalysisWorker

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                BRVMAnalysisWorker.WORK_NAME,
                androidx.work.ExistingPeriodicWorkPolicy.KEEP,
                BRVMAnalysisWorker.periodicRequest()
            )
        }
    }
}
