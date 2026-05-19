package com.joe.launcher.activities

import android.app.DatePickerDialog
import android.app.Dialog
import android.os.Bundle
import android.view.LayoutInflater
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.fragment.app.DialogFragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.joe.launcher.R
import com.joe.launcher.models.BirthdayContact
import java.util.Calendar

class AddBirthdayDialog : DialogFragment() {

    private var onBirthdayAddedListener: ((BirthdayContact) -> Unit)? = null
    private var selectedDay = 1
    private var selectedMonth = 1
    private var selectedYear: Int? = null

    fun setOnBirthdayAddedListener(listener: (BirthdayContact) -> Unit) {
        onBirthdayAddedListener = listener
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val ctx = requireContext()
        val view = LayoutInflater.from(ctx).inflate(R.layout.dialog_add_birthday, null)

        val etName = view.findViewById<EditText>(R.id.et_name)
        val tvDate = view.findViewById<TextView>(R.id.tv_selected_date)
        val btnPickDate = view.findViewById<Button>(R.id.btn_pick_date)

        btnPickDate.setOnClickListener {
            val cal = Calendar.getInstance()
            DatePickerDialog(ctx, { _, year, month, day ->
                selectedDay = day
                selectedMonth = month + 1
                selectedYear = if (year < 1900) null else year
                tvDate.text = "$day/${month + 1}${if (year >= 1900) "/$year" else ""}"
            }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH))
                .show()
        }

        return MaterialAlertDialogBuilder(ctx)
            .setTitle("Ajouter un anniversaire")
            .setView(view)
            .setPositiveButton("Ajouter") { _, _ ->
                val name = etName.text.toString().trim()
                if (name.isNotEmpty()) {
                    val cal = Calendar.getInstance()
                    val daysUntil = calculateDaysUntil(cal, selectedDay, selectedMonth)
                    val contact = BirthdayContact(
                        id = System.currentTimeMillis(),
                        name = name,
                        birthdayDay = selectedDay,
                        birthdayMonth = selectedMonth,
                        birthdayYear = selectedYear,
                        daysUntilBirthday = daysUntil,
                        isFromContacts = false
                    )
                    onBirthdayAddedListener?.invoke(contact)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .create()
    }

    private fun calculateDaysUntil(today: Calendar, day: Int, month: Int): Int {
        val next = Calendar.getInstance().apply {
            set(Calendar.MONTH, month - 1)
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, 0)
        }
        if (next.before(today)) next.add(Calendar.YEAR, 1)
        return ((next.timeInMillis - today.timeInMillis) / (1000 * 60 * 60 * 24)).toInt().coerceAtLeast(0)
    }
}
