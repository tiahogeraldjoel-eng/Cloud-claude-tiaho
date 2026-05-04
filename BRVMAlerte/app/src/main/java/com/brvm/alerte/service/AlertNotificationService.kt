package com.brvm.alerte.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.brvm.alerte.BRVMApplication
import com.brvm.alerte.MainActivity
import com.brvm.alerte.R
import com.brvm.alerte.domain.model.Alert
import com.brvm.alerte.domain.model.AlertPriority
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AlertNotificationService @Inject constructor(
    private val context: Context
) {
    private val manager = context.getSystemService(NotificationManager::class.java)
    private var notifId = 1000

    fun showAlert(alert: Alert) {
        val channel = when (alert.priority) {
            AlertPriority.URGENT -> BRVMApplication.CHANNEL_URGENT
            AlertPriority.STRONG -> BRVMApplication.CHANNEL_STRONG
            else -> BRVMApplication.CHANNEL_INFO
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("alert_id", alert.id)
        }
        val pendingIntent = PendingIntent.getActivity(
            context, alert.id.toInt(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(alert.title)
            .setContentText(buildShortText(alert))
            .setStyle(NotificationCompat.BigTextStyle().bigText(buildShortText(alert)))
            .setPriority(
                if (alert.priority == AlertPriority.URGENT)
                    NotificationCompat.PRIORITY_MAX
                else NotificationCompat.PRIORITY_HIGH
            )
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(notifId++, notification)
    }

    fun showBatchSummary(count: Int, topTicker: String) {
        if (count <= 1) return
        val notification = NotificationCompat.Builder(context, BRVMApplication.CHANNEL_STRONG)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("$count nouvelles opportunités BRVM")
            .setContentText("Meilleur signal: $topTicker — consultez vos alertes")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        manager.notify(notifId++, notification)
    }

    private fun buildShortText(alert: Alert): String {
        val rec = when (alert.recommendation.name) {
            "STRONG_BUY" -> "ACHAT FORT"
            "BUY" -> "ACHAT"
            "HOLD" -> "CONSERVER"
            "SELL" -> "VENTE"
            else -> "VENTE FORTE"
        }
        return "${alert.stockName} | ${String.format("%.0f", alert.currentPrice)} FCFA | $rec | Score ${alert.score}/100"
    }
}
