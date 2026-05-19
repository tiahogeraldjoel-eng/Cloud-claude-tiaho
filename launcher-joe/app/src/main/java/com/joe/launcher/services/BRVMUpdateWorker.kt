package com.joe.launcher.services

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.joe.launcher.utils.BRVMDataFetcher
import com.joe.launcher.utils.PrefsManager

class BRVMUpdateWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            PrefsManager.init(applicationContext)
            BRVMDataFetcher.fetchStocks(applicationContext, forceRefresh = true)
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
