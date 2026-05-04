package com.brvm.alerte.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.brvm.alerte.BRVMApplication
import com.brvm.alerte.MainActivity
import com.brvm.alerte.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject

@AndroidEntryPoint
class BRVMFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var notificationService: AlertNotificationService

    private val manager by lazy { getSystemService(NotificationManager::class.java) }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        remoteMessage.notification?.let { notif ->
            val title = notif.title ?: "BRVM Alerte"
            val body = notif.body ?: return
            showRemoteNotification(title, body)
        }
    }

    private fun showRemoteNotification(title: String, body: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, fcmNotifId.getAndIncrement(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, BRVMApplication.CHANNEL_STRONG)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        manager.notify(fcmNotifId.getAndIncrement(), notification)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
    }

    companion object {
        private val fcmNotifId = AtomicInteger(2000)
    }
}
