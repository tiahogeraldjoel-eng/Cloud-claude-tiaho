package com.joe.launcher.activities

import android.os.Bundle
import androidx.fragment.app.DialogFragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.joe.launcher.models.BirthdayContact

class BirthdayDetailDialog : DialogFragment() {

    companion object {
        fun newInstance(contact: BirthdayContact): BirthdayDetailDialog {
            return BirthdayDetailDialog().apply {
                arguments = Bundle().apply {
                    putString("name", contact.name)
                    putInt("day", contact.birthdayDay)
                    putInt("month", contact.birthdayMonth)
                    putInt("year", contact.birthdayYear ?: -1)
                    putInt("days_until", contact.daysUntilBirthday)
                    putInt("age", contact.age ?: -1)
                }
            }
        }
    }

    override fun onCreateDialog(savedInstanceState: Bundle?) =
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("🎂 ${arguments?.getString("name")}")
            .setMessage(buildMessage())
            .setPositiveButton(android.R.string.ok, null)
            .create()

    private fun buildMessage(): String {
        val args = arguments ?: return ""
        val day = args.getInt("day")
        val month = args.getInt("month")
        val year = args.getInt("year").let { if (it == -1) null else it }
        val daysUntil = args.getInt("days_until")
        val age = args.getInt("age").let { if (it == -1) null else it }
        val months = arrayOf("Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
            "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre")

        return buildString {
            append("Date: $day ${months.getOrElse(month - 1) { "" }}")
            year?.let { append(" $it") }
            appendLine()
            age?.let { appendLine("Âge: $it ans") }
            when (daysUntil) {
                0 -> appendLine("🎉 C'est son anniversaire AUJOURD'HUI!")
                1 -> appendLine("Demain c'est son anniversaire!")
                else -> appendLine("Dans $daysUntil jours")
            }
        }.trim()
    }
}
