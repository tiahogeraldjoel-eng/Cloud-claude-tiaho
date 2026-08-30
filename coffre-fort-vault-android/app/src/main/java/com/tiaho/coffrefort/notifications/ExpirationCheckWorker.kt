package com.tiaho.coffrefort.notifications

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.tiaho.coffrefort.MainActivity
import com.tiaho.coffrefort.data.VaultDatabase
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

/**
 * Vérifie une fois par jour les échéances des documents enregistrés et
 * notifie l'utilisateur pour ceux qui expirent bientôt ou sont déjà expirés
 * — même si l'application n'est pas ouverte.
 */
class ExpirationCheckWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        const val CHANNEL_ID = "vault_expiration"
        const val UNIQUE_WORK_NAME = "expiration_check"
        private const val WARNING_WINDOW_DAYS = 30L
    }

    override suspend fun doWork(): Result {
        val documents = VaultDatabase.getInstance(applicationContext).documentDao().getAll()
        val today = LocalDate.now()

        documents.forEach { document ->
            val expirationDate = try {
                LocalDate.parse(document.expirationDate)
            } catch (e: DateTimeParseException) {
                null
            } ?: return@forEach

            val daysUntil = ChronoUnit.DAYS.between(today, expirationDate)
            if (daysUntil <= WARNING_WINDOW_DAYS) {
                notify(document.id, document.title, daysUntil)
            }
        }
        return Result.success()
    }

    private fun notify(documentId: Long, title: String, daysUntil: Long) {
        val hasPermission = ActivityCompat.checkSelfPermission(
            applicationContext, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPermission) return

        val message = when {
            daysUntil < 0 -> "Expiré depuis ${-daysUntil} jour(s)"
            daysUntil == 0L -> "Expire aujourd'hui"
            daysUntil == 1L -> "Expire demain"
            else -> "Expire dans $daysUntil jours"
        }

        val openIntent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            documentId.toInt(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(applicationContext).notify(documentId.toInt(), notification)
    }
}
