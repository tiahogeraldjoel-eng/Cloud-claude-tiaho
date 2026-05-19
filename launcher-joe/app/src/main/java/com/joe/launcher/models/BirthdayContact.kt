package com.joe.launcher.models

data class BirthdayContact(
    val id: Long,
    val name: String,
    val birthdayDay: Int,
    val birthdayMonth: Int,
    val birthdayYear: Int?,
    val photoUri: String? = null,
    val phoneNumber: String? = null,
    val daysUntilBirthday: Int = 0,
    val isFromContacts: Boolean = true
) {
    val age: Int?
        get() = birthdayYear?.let {
            val current = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
            current - it - if (daysUntilBirthday > 0) 1 else 0
        }

    val birthdayString: String
        get() {
            val months = arrayOf("Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
                "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc")
            return "$birthdayDay ${months.getOrElse(birthdayMonth - 1) { "" }}" +
                    (birthdayYear?.let { " $it" } ?: "")
        }
}
