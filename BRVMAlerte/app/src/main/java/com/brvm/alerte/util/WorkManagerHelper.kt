package com.brvm.alerte.util

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.WorkManager
import com.brvm.alerte.worker.BRVMAnalysisWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WorkManagerHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val workManager = WorkManager.getInstance(context)

    fun schedulePeriodicAnalysis() {
        workManager.enqueueUniquePeriodicWork(
            BRVMAnalysisWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            BRVMAnalysisWorker.periodicRequest()
        )
    }

    fun runImmediateAnalysis() {
        workManager.enqueue(BRVMAnalysisWorker.oneTimeRequest())
    }

    fun cancelAll() {
        workManager.cancelAllWork()
    }
}
