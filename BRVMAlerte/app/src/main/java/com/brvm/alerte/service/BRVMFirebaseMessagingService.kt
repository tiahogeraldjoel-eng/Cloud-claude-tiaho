package com.brvm.alerte.service

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class BRVMFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var notificationService: AlertNotificationService

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        remoteMessage.notification?.let { notif ->
            val title = notif.title ?: "BRVM Alerte"
            val body = notif.body ?: return
            showRemoteNotification(title, body)
        }
    }

    private fun showRemoteNotification(title: String, body: String) {
        android.app.NotificationManager::class.java.let { }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Envoyer le token au backend si besoin
    }
}
