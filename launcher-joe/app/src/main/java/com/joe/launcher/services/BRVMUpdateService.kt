package com.joe.launcher.services

import android.app.Service
import android.content.Intent
import android.os.IBinder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.joe.launcher.utils.BRVMDataFetcher
import com.joe.launcher.utils.PrefsManager

class BRVMUpdateService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        scope.launch {
            while (true) {
                try {
                    BRVMDataFetcher.fetchStocks(this@BRVMUpdateService, forceRefresh = true)
                } catch (e: Exception) { /* ignore */ }
                val interval = PrefsManager.getBrvmRefreshInterval()
                delay(interval * 60 * 1000L)
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
