package com.brvm.intelligence.utils

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

object DateUtils {

    private val frenchLocale = Locale.FRENCH
    private val shortDateFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy", frenchLocale)
    private val longDateFormatter = DateTimeFormatter.ofPattern("d MMMM yyyy", frenchLocale)
    private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm", frenchLocale)
    private val dateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", frenchLocale)

    fun formatShort(date: LocalDate): String = date.format(shortDateFormatter)

    fun formatLong(date: LocalDate): String = date.format(longDateFormatter)

    fun formatDateTime(dateTime: LocalDateTime): String = dateTime.format(dateTimeFormatter)

    fun formatTime(dateTime: LocalDateTime): String = dateTime.format(timeFormatter)

    fun isMarketOpen(): Boolean {
        val now = LocalDateTime.now()
        val dayOfWeek = now.dayOfWeek.value  // 1=Lundi, 7=Dimanche
        val hour = now.hour
        val minute = now.minute

        if (dayOfWeek >= 6) return false  // Week-end : fermé
        // BRVM : ouvert 9h00 - 15h30 (heure d'Abidjan, GMT+0)
        val openMinutes = 9 * 60
        val closeMinutes = 15 * 60 + 30
        val currentMinutes = hour * 60 + minute
        return currentMinutes in openMinutes until closeMinutes
    }

    fun daysUntil(date: LocalDate): Long = ChronoUnit.DAYS.between(LocalDate.now(), date)

    fun formatRelative(date: LocalDate): String {
        val days = daysUntil(date)
        return when {
            days == 0L -> "Aujourd'hui"
            days == 1L -> "Demain"
            days < 7L -> "Dans $days jours"
            days < 30L -> "Dans ${days / 7} semaine(s)"
            else -> formatShort(date)
        }
    }
}
