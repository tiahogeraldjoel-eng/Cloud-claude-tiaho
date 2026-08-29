package com.tiaho.coffrefort.util

object DateExtractor {
    private val PATTERN = Regex("""\b(0[1-9]|[12][0-9]|3[01])[/.-](0[1-9]|1[012])[/.-](20\d\d)\b""")

    /** Repère une date d'échéance (jj/mm/aaaa) dans le texte OCR, sinon "Non définie". */
    fun extract(text: String): String {
        val match = PATTERN.find(text) ?: return "Non définie"
        val (day, month, year) = match.destructured
        return "$year-$month-$day"
    }
}
