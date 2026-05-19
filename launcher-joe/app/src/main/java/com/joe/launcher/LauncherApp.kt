package com.joe.launcher

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.joe.launcher.utils.PrefsManager

class LauncherApp : Application() {

    companion object {
        lateinit var instance: LauncherApp
            private set

        const val CHANNEL_BIRTHDAY = "channel_birthday"
        const val CHANNEL_BRVM = "channel_brvm"
        const val CHANNEL_CLAUDE = "channel_claude"
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        PrefsManager.init(this)
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            manager.createNotificationChannel(NotificationChannel(
                CHANNEL_BIRTHDAY,
                getString(R.string.channel_birthday_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.channel_birthday_desc)
            })

            manager.createNotificationChannel(NotificationChannel(
                CHANNEL_BRVM,
                getString(R.string.channel_brvm_name),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = getString(R.string.channel_brvm_desc)
            })

            manager.createNotificationChannel(NotificationChannel(
                CHANNEL_CLAUDE,
                getString(R.string.channel_claude_name),
                NotificationManager.IMPORTANCE_LOW
            ))
        }
    }
}
