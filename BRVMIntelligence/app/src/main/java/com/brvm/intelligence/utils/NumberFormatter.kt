package com.brvm.intelligence.utils

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

/**
 * Formatage des nombres pour les marchés financiers africains.
 * Utilise le format français (espace comme séparateur de milliers, virgule décimale)
 * conformément aux standards de l'UEMOA/BCEAO.
 */
object NumberFormatter {

    private val frenchLocale = Locale.FRENCH
    private val symbols = DecimalFormatSymbols(frenchLocale)

    /** Prix en FCFA : "15 600 FCFA" */
    fun formatPrice(value: Double): String {
        if (value == 0.0) return "—"
        return when {
            value >= 1_000_000 -> "${DecimalFormat("#,##0.00", symbols).format(value)} FCFA"
            value >= 1_000 -> "${DecimalFormat("#,##0", symbols).format(value)} FCFA"
            value >= 100 -> "${DecimalFormat("#,##0.0", symbols).format(value)} FCFA"
            else -> "${DecimalFormat("#,##0.00", symbols).format(value)} FCFA"
        }
    }

    /** Prix sans unité (pour graphiques) */
    fun formatPriceShort(value: Double): String {
        return when {
            value >= 1_000_000 -> "${DecimalFormat("#.##", symbols).format(value / 1_000_000)}M"
            value >= 1_000 -> DecimalFormat("#,##0", symbols).format(value)
            else -> DecimalFormat("#,##0.##", symbols).format(value)
        }
    }

    /** Capitalisation boursière : "2,3 Mds FCFA" */
    fun formatMarketCap(value: Long): String {
        return when {
            value == 0L -> "—"
            value >= 1_000_000_000_000 -> "${String.format("%.1f", value / 1_000_000_000_000.0)} Billion FCFA"
            value >= 1_000_000_000 -> "${String.format("%.1f", value / 1_000_000_000.0)} Mds FCFA"
            value >= 1_000_000 -> "${String.format("%.0f", value / 1_000_000.0)} M FCFA"
            else -> "$value FCFA"
        }
    }

    /** Volume échangé : "12 450 titres" */
    fun formatVolume(value: Long): String {
        return when {
            value == 0L -> "0"
            value >= 1_000_000 -> "${String.format("%.1f", value / 1_000_000.0)}M"
            value >= 1_000 -> "${String.format("%.0f", value / 1_000.0)}k"
            else -> value.toString()
        }
    }

    /** Variation en pourcentage avec signe */
    fun formatPercent(value: Double, withSign: Boolean = true): String {
        val sign = if (withSign && value >= 0) "+" else ""
        return "$sign${String.format("%.2f", value)}%"
    }

    /** Ratio de Sharpe et métriques de risque */
    fun formatRatio(value: Double): String {
        return String.format("%.2f", value)
    }

    /** Formatage compact pour les cartes de résumé */
    fun formatCompact(value: Double): String {
        return when {
            value >= 1_000_000_000 -> "${String.format("%.1f", value / 1_000_000_000)}Md"
            value >= 1_000_000 -> "${String.format("%.1f", value / 1_000_000)}M"
            value >= 1_000 -> "${String.format("%.1f", value / 1_000)}k"
            else -> String.format("%.0f", value)
        }
    }
}
