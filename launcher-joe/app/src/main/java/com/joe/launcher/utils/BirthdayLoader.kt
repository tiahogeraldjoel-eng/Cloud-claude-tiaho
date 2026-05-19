package com.joe.launcher.utils

import android.content.Context
import android.provider.ContactsContract
import com.joe.launcher.models.BirthdayContact
import java.util.Calendar

object BirthdayLoader {

    fun loadFromContacts(context: Context): List<BirthdayContact> {
        val birthdays = mutableListOf<BirthdayContact>()
        val today = Calendar.getInstance()

        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Event.CONTACT_ID,
            ContactsContract.CommonDataKinds.Event.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Event.START_DATE,
            ContactsContract.CommonDataKinds.Event.PHOTO_URI
        )

        val selection = "${ContactsContract.CommonDataKinds.Event.TYPE} = ?"
        val args = arrayOf(ContactsContract.CommonDataKinds.Event.TYPE_BIRTHDAY.toString())

        val cursor = context.contentResolver.query(
            ContactsContract.Data.CONTENT_URI,
            projection,
            selection,
            args,
            ContactsContract.CommonDataKinds.Event.DISPLAY_NAME + " ASC"
        ) ?: return emptyList()

        cursor.use {
            val idIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Event.CONTACT_ID)
            val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Event.DISPLAY_NAME)
            val dateIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Event.START_DATE)
            val photoIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Event.PHOTO_URI)

            while (it.moveToNext()) {
                val id = it.getLong(idIdx)
                val name = it.getString(nameIdx) ?: continue
                val dateStr = it.getString(dateIdx) ?: continue
                val photoUri = if (photoIdx >= 0) it.getString(photoIdx) else null

                parseBirthdayDate(dateStr)?.let { (day, month, year) ->
                    val daysUntil = calculateDaysUntil(today, day, month)
                    birthdays.add(BirthdayContact(
                        id = id,
                        name = name,
                        birthdayDay = day,
                        birthdayMonth = month,
                        birthdayYear = year,
                        photoUri = photoUri,
                        daysUntilBirthday = daysUntil,
                        isFromContacts = true
                    ))
                }
            }
        }

        return birthdays.sortedBy { it.daysUntilBirthday }
    }

    private fun parseBirthdayDate(dateStr: String): Triple<Int, Int, Int?>? {
        // Formats: YYYY-MM-DD ou --MM-DD
        return try {
            when {
                dateStr.startsWith("--") -> {
                    val parts = dateStr.removePrefix("--").split("-")
                    Triple(parts[1].toInt(), parts[0].toInt(), null)
                }
                dateStr.contains("-") -> {
                    val parts = dateStr.split("-")
                    if (parts.size == 3) {
                        Triple(parts[2].toInt(), parts[1].toInt(), parts[0].toIntOrNull())
                    } else null
                }
                else -> null
            }
        } catch (e: Exception) { null }
    }

    private fun calculateDaysUntil(today: Calendar, day: Int, month: Int): Int {
        val next = Calendar.getInstance().apply {
            set(Calendar.MONTH, month - 1)
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
        }

        val todayDay = today.get(Calendar.DAY_OF_MONTH)
        val todayMonth = today.get(Calendar.MONTH) + 1

        if (next.before(today) && !(day == todayDay && month == todayMonth)) {
            next.add(Calendar.YEAR, 1)
        }

        val diff = next.timeInMillis - today.timeInMillis
        return (diff / (1000 * 60 * 60 * 24)).toInt().coerceAtLeast(0)
    }
}
