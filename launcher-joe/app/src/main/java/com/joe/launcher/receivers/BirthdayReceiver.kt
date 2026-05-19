package com.joe.launcher.receivers

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.joe.launcher.LauncherApp
import com.joe.launcher.R
import com.joe.launcher.activities.BirthdaysActivity

class BirthdayReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val name = intent.getStringExtra("contact_name") ?: return
        val age = intent.getIntExtra("contact_age", -1)
        val id = intent.getLongExtra("contact_id", 0)

        val openIntent = Intent(context, BirthdaysActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context, id.toInt(), openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val ageText = if (age > 0) " ($age ans)" else ""
        val notification = NotificationCompat.Builder(context, LauncherApp.CHANNEL_BIRTHDAY)
            .setSmallIcon(R.drawable.ic_birthday)
            .setContentTitle("🎂 Anniversaire aujourd'hui!")
            .setContentText("C'est l'anniversaire de $name$ageText")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("Souhaite un joyeux anniversaire à $name$ageText 🎉"))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        val notifManager = context.getSystemService(NotificationManager::class.java)
        notifManager.notify(id.toInt(), notification)
    }
}
