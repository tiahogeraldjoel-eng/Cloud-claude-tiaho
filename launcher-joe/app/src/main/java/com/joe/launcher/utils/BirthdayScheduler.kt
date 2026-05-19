package com.joe.launcher.utils

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.joe.launcher.models.BirthdayContact
import com.joe.launcher.receivers.BirthdayReceiver
import java.util.Calendar

object BirthdayScheduler {

    fun scheduleAll(context: Context, contacts: List<BirthdayContact>) {
        if (!PrefsManager.isBirthdayNotifEnabled()) return
        contacts.forEach { scheduleReminder(context, it) }
    }

    fun scheduleReminder(context: Context, contact: BirthdayContact) {
        if (!PrefsManager.isBirthdayNotifEnabled()) return

        val alarmManager = context.getSystemService(AlarmManager::class.java)

        val triggerAt = Calendar.getInstance().apply {
            set(Calendar.MONTH, contact.birthdayMonth - 1)
            set(Calendar.DAY_OF_MONTH, contact.birthdayDay)
            set(Calendar.HOUR_OF_DAY, 8)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)

            if (before(Calendar.getInstance())) {
                add(Calendar.YEAR, 1)
            }
        }

        val intent = Intent(context, BirthdayReceiver::class.java).apply {
            putExtra("contact_name", contact.name)
            putExtra("contact_id", contact.id)
            putExtra("contact_age", contact.age ?: -1)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            contact.id.toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        try {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAt.timeInMillis,
                pendingIntent
            )
        } catch (e: SecurityException) {
            // AlarmManager exact permission not granted
        }
    }
}
