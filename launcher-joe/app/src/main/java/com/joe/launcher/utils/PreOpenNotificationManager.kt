package com.joe.launcher.utils

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import androidx.core.app.NotificationCompat
import com.joe.launcher.activities.BRVMActivity
import com.joe.launcher.models.PreOpenSignal

object PreOpenNotificationManager {

    private const val CHANNEL_ID   = "brvm_preopen_flash"
    private const val CHANNEL_NAME = "BRVM Flash Pré-Ouverture"
    private const val NOTIF_ID_BASE = 9000

    fun createChannel(context: Context) {
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description         = "Alertes de pression de marché avant le fixing BRVM 9h45"
            enableLights(true)
            lightColor          = Color.RED
            enableVibration(true)
            vibrationPattern    = longArrayOf(0, 300, 200, 300)
            setBypassDnd(true)
        }
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }

    fun showFlashAlert(context: Context, signal: PreOpenSignal) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val tapIntent = PendingIntent.getActivity(
            context,
            signal.ticker.hashCode(),
            Intent(context, BRVMActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("HIGHLIGHT_TICKER", signal.ticker)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val confidenceEmoji = when (signal.confidence) {
            "HIGH"   -> "🔴"
            "MEDIUM" -> "🟠"
            else     -> "🟡"
        }
        val title = "$confidenceEmoji FLASH BRVM — ${signal.ticker}"
        val bigText = buildString {
            appendLine("📈 MPR : ${String.format("%.2f", signal.mpr)}  (seuil > 2.5)")
            appendLine("⚖️ OBI : ${String.format("%.3f", signal.obi)}  (seuil > 0.85)")
            appendLine("💰 Prix théorique ouverture : ${String.format("%,.0f", signal.theoOpenPrice)} FCFA")
            appendLine("🛒 Volume acheteur total : ${signal.totalBidVolume} titres")
            if (signal.icebergDetected)
                appendLine("🐋 Ordre iceberg détecté sur meilleur bid (${signal.bestBidVolume} titres)")
            appendLine()
            appendLine("⚡ Position recommandée avant 9h45 GMT")
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(
                "MPR=${String.format("%.2f", signal.mpr)} | " +
                "OBI=${String.format("%.3f", signal.obi)} | " +
                "${String.format("%,.0f", signal.theoOpenPrice)} FCFA"
            )
            .setStyle(NotificationCompat.BigTextStyle().bigText(bigText))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(tapIntent)
            .setAutoCancel(true)
            .setColor(Color.RED)
            .setColorized(true)
            .build()

        nm.notify(NOTIF_ID_BASE + signal.ticker.hashCode(), notification)
    }

    fun showNoDataWarning(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("BRVM Scanner — Données indisponibles")
            .setContentText("Carnet d'ordres inaccessible à 9h35 et 9h38. Retry demain.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        nm.notify(NOTIF_ID_BASE - 1, notification)
    }
}
