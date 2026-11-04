package com.tiaho.coffrefort.util

import java.time.LocalDate

object DateExtractor {

    private data class DateMatch(val startIndex: Int, val iso: String)

    // JJ/MM/AAAA ou JJ/MM/AA, jour et mois sur 1 ou 2 chiffres, séparateurs /.- ou espace.
    private val NUMERIC_PATTERN = Regex("""\b(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4}|\d{2})\b""")

    // AAAA-MM-JJ (format ISO, produit par certains scanners/exports).
    private val ISO_PATTERN = Regex("""\b(\d{4})-(\d{1,2})-(\d{1,2})\b""")

    private val MONTH_NAMES = mapOf(
        "janvier" to 1, "février" to 2, "fevrier" to 2, "mars" to 3, "avril" to 4,
        "mai" to 5, "juin" to 6, "juillet" to 7, "août" to 8, "aout" to 8,
        "septembre" to 9, "octobre" to 10, "novembre" to 11, "décembre" to 12, "decembre" to 12
    )
    private val MONTH_NAME_PATTERN = Regex(
        """\b(\d{1,2})\s+(${MONTH_NAMES.keys.joinToString("|")})\s+(\d{4}|\d{2})\b"""
    )

    // Fenêtre de texte (en caractères) regardée avant chaque date pour trouver un mot-clé.
    private const val KEYWORD_WINDOW = 40

    private val EXPIRATION_KEYWORDS = listOf(
        "expir", "valable jusqu", "valid until", "date de validité", "fin de validité"
    )
    private val ISSUE_OR_BIRTH_KEYWORDS = listOf(
        "délivr", "delivr", "émis", "emis", "date de naissance", "né le", "née le", "date d'émission"
    )

    /**
     * Repère une date d'échéance plausible dans le texte OCR, au format ISO (aaaa-mm-jj),
     * sinon "Non définie". Reste une suggestion : l'utilisateur peut toujours la corriger via
     * le sélecteur de date manuel du dialogue d'ajout/modification, seul moyen fiable de
     * rattraper une erreur de lecture OCR ou un format de date non couvert ici.
     *
     * Un document (carte d'identité, permis…) contient souvent plusieurs dates : naissance,
     * délivrance, expiration. On priorise une date explicitement associée à un mot-clé
     * d'expiration ; à défaut, on écarte les dates associées à la délivrance/naissance et on
     * retient la plus tardive des dates restantes — sur une pièce d'identité, l'expiration est
     * presque toujours la date la plus éloignée dans le futur (naissance < délivrance < expiration).
     */
    fun extract(text: String): String {
        val lowerText = text.lowercase()
        val matches = findAllDates(text, lowerText)
        if (matches.isEmpty()) return "Non définie"

        val expirationMatch = matches.firstOrNull { hasKeywordBefore(lowerText, it.startIndex, EXPIRATION_KEYWORDS) }
        if (expirationMatch != null) return expirationMatch.iso

        val candidates = matches.filterNot { hasKeywordBefore(lowerText, it.startIndex, ISSUE_OR_BIRTH_KEYWORDS) }
            .ifEmpty { matches }

        return candidates.maxByOrNull { it.iso }?.iso ?: "Non définie"
    }

    private fun findAllDates(text: String, lowerText: String): List<DateMatch> {
        val matches = mutableListOf<DateMatch>()

        NUMERIC_PATTERN.findAll(text).forEach { m ->
            val (day, month, year) = m.destructured
            toIso(day, month, year)?.let { matches += DateMatch(m.range.first, it) }
        }
        ISO_PATTERN.findAll(text).forEach { m ->
            val (year, month, day) = m.destructured
            toIso(day, month, year)?.let { matches += DateMatch(m.range.first, it) }
        }
        MONTH_NAME_PATTERN.findAll(lowerText).forEach { m ->
            val (day, monthName, year) = m.destructured
            val month = MONTH_NAMES[monthName] ?: return@forEach
            toIso(day, month.toString(), year)?.let { matches += DateMatch(m.range.first, it) }
        }

        return matches
    }

    private fun toIso(day: String, month: String, year: String): String? {
        val d = day.toIntOrNull() ?: return null
        val mo = month.toIntOrNull() ?: return null
        var y = year.toIntOrNull() ?: return null
        if (year.length == 2) y += if (y < 70) 2000 else 1900
        if (d !in 1..31 || mo !in 1..12) return null
        return try {
            LocalDate.of(y, mo, d).toString()
        } catch (e: Exception) {
            null
        }
    }

    private fun hasKeywordBefore(lowerText: String, startIndex: Int, keywords: List<String>): Boolean {
        val windowStart = maxOf(0, startIndex - KEYWORD_WINDOW)
        val window = lowerText.substring(windowStart, startIndex)
        return keywords.any { window.contains(it) }
    }
}
