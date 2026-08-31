package com.tiaho.coffrefort.util

object DateExtractor {
    private val DATE_PATTERN = Regex("""\b(0[1-9]|[12][0-9]|3[01])[/.-](0[1-9]|1[012])[/.-](20\d\d)\b""")

    // Fenêtre de texte (en caractères) regardée avant chaque date pour trouver un mot-clé.
    private const val KEYWORD_WINDOW = 40

    private val EXPIRATION_KEYWORDS = listOf(
        "expir", "valable jusqu", "valid until", "date de validité", "fin de validité"
    )
    private val ISSUE_OR_BIRTH_KEYWORDS = listOf(
        "délivr", "delivr", "émis", "emis", "date de naissance", "né le", "née le", "date d'émission"
    )

    /**
     * Repère la date d'échéance (jj/mm/aaaa) dans le texte OCR, sinon "Non définie".
     *
     * Un document (carte d'identité, permis…) contient souvent plusieurs dates : naissance,
     * délivrance, expiration. On priorise une date explicitement associée à un mot-clé
     * d'expiration ; à défaut, on écarte les dates associées à la délivrance/naissance et on
     * retient la plus tardive des dates restantes — sur une pièce d'identité, l'expiration est
     * presque toujours la date la plus éloignée dans le futur (naissance < délivrance < expiration).
     */
    fun extract(text: String): String {
        val matches = DATE_PATTERN.findAll(text).toList()
        if (matches.isEmpty()) return "Non définie"

        val lowerText = text.lowercase()

        val expirationMatch = matches.firstOrNull { match -> hasKeywordBefore(lowerText, match, EXPIRATION_KEYWORDS) }
        if (expirationMatch != null) return formatMatch(expirationMatch)

        val candidates = matches.filterNot { match -> hasKeywordBefore(lowerText, match, ISSUE_OR_BIRTH_KEYWORDS) }
            .ifEmpty { matches }

        return candidates.maxByOrNull { formatMatch(it) }?.let { formatMatch(it) } ?: "Non définie"
    }

    private fun hasKeywordBefore(lowerText: String, match: MatchResult, keywords: List<String>): Boolean {
        val windowStart = maxOf(0, match.range.first - KEYWORD_WINDOW)
        val window = lowerText.substring(windowStart, match.range.first)
        return keywords.any { window.contains(it) }
    }

    private fun formatMatch(match: MatchResult): String {
        val (day, month, year) = match.destructured
        return "$year-$month-$day"
    }
}
