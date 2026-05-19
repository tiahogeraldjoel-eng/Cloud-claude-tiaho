package com.joe.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AppChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Notifier les activités actives du changement d'apps
        val updateIntent = Intent("com.joe.launcher.APP_LIST_CHANGED")
        context.sendBroadcast(updateIntent)
    }
}
