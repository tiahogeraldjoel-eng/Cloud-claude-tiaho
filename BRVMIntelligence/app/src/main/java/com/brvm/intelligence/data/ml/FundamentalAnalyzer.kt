package com.brvm.intelligence.data.ml

import com.brvm.intelligence.domain.model.BRVMSector
import com.brvm.intelligence.domain.model.Stock
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

/**
 * Valorisation fondamentale adaptée au marché BRVM.
 *
 * Méthodes appliquées par ordre de priorité :
 *  1. PER relatif au secteur  (si stock.per != null)
 *  2. Gordon Growth Model     (si stock.dividendYield != null)
 *  3. Position dans le range 52 semaines (toujours disponible)
 *
 * L'ajustement de confiance (confidenceAdjustment) pénalise les signaux
 * lorsque les données fondamentales sont absentes, évitant ainsi un biais
 * purement technique.
 */
@Singleton
class FundamentalAnalyzer @Inject constructor() {

    // ── Benchmarks sectoriels BRVM (PER moyen observé 2018-2024) ──────────────

    private val sectorPerBenchmarks: Map<BRVMSector, Double> = mapOf(
        BRVMSector.FINANCE          to 10.0,   // Banques UEMOA : SGBC, BICC, BOAM…
        BRVMSector.SERVICES_PUBLICS to  9.0,   // ONTBF, ETIT
        BRVMSector.TRANSPORT        to  8.5,
        BRVMSector.INDUSTRIE        to 11.0,
        BRVMSector.AGRICULTURE      to 12.0,   // Agroalimentaire : PALC, SIVC…
        BRVMSector.DISTRIBUTION     to 13.0,
        BRVMSector.AUTRES           to 11.0,
    )

    // Rendement exigé BRVM = taux BCEAO (~3.5%) + prime de risque (~6.5%)
    private val requiredReturn = 0.10
    // Taux de croissance pérenne estimé (économies UEMOA : 4-6 % nominal)
    private val perpetualGrowthRate = 0.04

    // ── Point d'entrée ────────────────────────────────────────────────────────

    fun analyze(stock: Stock): FundamentalAssessment {
        val perResult      = analyzePer(stock)
        val dividendResult = analyzeDividend(stock)
        val rangePosition  = compute52WeekPosition(stock)

        // Choisir la méthode principale et la valeur intrinsèque
        val (fairValue, method, valuationSignal) = when {
            perResult != null      -> perResult
            dividendResult != null -> dividendResult
            else                   -> Triple(null, "Aucune donnée fondamentale disponible", ValuationSignal.UNKNOWN)
        }

        // Si le signal fondamental est UNKNOWN, vérifier la position 52 semaines
        // comme signal secondaire
        val finalSignal = when {
            valuationSignal != ValuationSignal.UNKNOWN -> valuationSignal
            rangePosition <= 0.20 -> ValuationSignal.UNDERVALUED
            rangePosition >= 0.80 -> ValuationSignal.OVERVALUED
            else                  -> ValuationSignal.UNKNOWN
        }

        val dataQualityWarning = buildDataQualityWarning(stock)
        val confidenceAdj = computeConfidenceAdjustment(stock)

        return FundamentalAssessment(
            valuationSignal          = finalSignal,
            estimatedFairValue       = fairValue,
            valuationMethod          = method,
            perAnalysis              = buildPerAnalysis(stock),
            dividendAnalysis         = buildDividendAnalysis(stock),
            positionIn52WeekRange    = rangePosition,
            earningsYield            = stock.per?.let { if (it > 0) 100.0 / it else null },
            dataQualityWarning       = dataQualityWarning,
            confidenceAdjustment     = confidenceAdj,
        )
    }

    // ── Méthode 1 : PER relatif au secteur ───────────────────────────────────

    private fun analyzePer(stock: Stock): Triple<Double?, String, ValuationSignal>? {
        val per = stock.per ?: return null
        if (per <= 0 || per > 200) return null

        val sectorAvgPer = sectorPerBenchmarks[stock.sector] ?: 11.0
        val currentEps   = stock.currentPrice / per
        val fairValue    = sectorAvgPer * currentEps
        val discount     = (stock.currentPrice - fairValue) / fairValue * 100

        val signal = when {
            discount < -20.0 -> ValuationSignal.UNDERVALUED
            discount >  20.0 -> ValuationSignal.OVERVALUED
            else             -> ValuationSignal.FAIR_VALUE
        }

        val method = "PER relatif secteur (PER stock ${String.format("%.1f", per)}x " +
                "vs moyenne secteur ${String.format("%.1f", sectorAvgPer)}x)"

        return Triple(fairValue, method, signal)
    }

    // ── Méthode 2 : Gordon Growth Model (dividendes) ──────────────────────────

    private fun analyzeDividend(stock: Stock): Triple<Double?, String, ValuationSignal>? {
        val yieldPct = stock.dividendYield ?: return null
        if (yieldPct <= 0.0) return null

        val dividendPerShare = stock.currentPrice * yieldPct / 100.0
        if (dividendPerShare <= 0.0) return null

        // Gordon : P = D1 / (r - g), D1 = D0 * (1 + g)
        val d1        = dividendPerShare * (1.0 + perpetualGrowthRate)
        val fairValue = d1 / (requiredReturn - perpetualGrowthRate)
        val discount  = (stock.currentPrice - fairValue) / fairValue * 100

        val signal = when {
            discount < -20.0 -> ValuationSignal.UNDERVALUED
            discount >  20.0 -> ValuationSignal.OVERVALUED
            else             -> ValuationSignal.FAIR_VALUE
        }

        val method = "Gordon Growth Model (dividende ${String.format("%.1f", yieldPct)}%, " +
                "r=${(requiredReturn * 100).toInt()}%, g=${(perpetualGrowthRate * 100).toInt()}%)"

        return Triple(fairValue, method, signal)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun compute52WeekPosition(stock: Stock): Double {
        val range = stock.high52Week - stock.low52Week
        return if (range > 0.0)
            ((stock.currentPrice - stock.low52Week) / range).coerceIn(0.0, 1.0)
        else 0.5
    }

    private fun buildPerAnalysis(stock: Stock): String? {
        val per = stock.per ?: return null
        if (per <= 0) return null
        val sectorAvg = sectorPerBenchmarks[stock.sector] ?: 11.0
        val earningsYield = 100.0 / per
        val bceaoRate = 3.5
        val premium = String.format("%.1f", earningsYield - bceaoRate)
        val relDiff  = (per - sectorAvg) / sectorAvg * 100
        val qualifier = when {
            relDiff < -20.0 -> "bien inférieur"
            relDiff < -10.0 -> "inférieur"
            relDiff >  20.0 -> "bien supérieur"
            relDiff >  10.0 -> "supérieur"
            else            -> "proche"
        }
        return "PER ${String.format("%.1f", per)}x — $qualifier à la moyenne sectorielle " +
                "(${String.format("%.1f", sectorAvg)}x). Rendement bénéficiaire ${String.format("%.1f", earningsYield)}% " +
                "(prime vs BCEAO : +${premium}%)."
    }

    private fun buildDividendAnalysis(stock: Stock): String? {
        val yieldPct = stock.dividendYield ?: return null
        if (yieldPct <= 0.0) return null
        val bceaoRate = 3.5
        val qualifier = when {
            yieldPct >= 7.0 -> "très attractif"
            yieldPct >= 4.5 -> "attractif"
            yieldPct >= 2.5 -> "modéré"
            else            -> "faible"
        }
        return "Rendement dividende ${String.format("%.1f", yieldPct)}% — $qualifier " +
                "(taux BCEAO 3.5%). Revenu estimé : ${String.format("%,.0f", stock.currentPrice * yieldPct / 100)} FCFA/titre."
    }

    private fun buildDataQualityWarning(stock: Stock): String? {
        val missing = mutableListOf<String>()
        if (stock.per == null)           missing.add("PER")
        if (stock.dividendYield == null) missing.add("rendement dividende")
        if (missing.isEmpty()) return null
        return "⚠️ Données fondamentales manquantes : ${missing.joinToString(", ")}. " +
                "L'analyse repose principalement sur des indicateurs techniques et la position de cours. " +
                "Consultez les rapports annuels (BRVM, AMF-UMOA) pour une valorisation complète."
    }

    private fun computeConfidenceAdjustment(stock: Stock): Double {
        val hasPer      = stock.per != null && stock.per > 0
        val hasDividend = stock.dividendYield != null && stock.dividendYield > 0
        return when {
            hasPer && hasDividend -> 1.00   // Données complètes
            hasPer || hasDividend -> 0.85   // Une seule donnée fondamentale
            else                  -> 0.70   // Aucune donnée fondamentale
        }
    }
}

// ── Modèles ───────────────────────────────────────────────────────────────────

data class FundamentalAssessment(
    val valuationSignal: ValuationSignal,
    val estimatedFairValue: Double?,
    val valuationMethod: String,
    val perAnalysis: String?,
    val dividendAnalysis: String?,
    val positionIn52WeekRange: Double,   // 0 = bas 52s, 1 = haut 52s
    val earningsYield: Double?,          // 1/PER × 100
    val dataQualityWarning: String?,
    val confidenceAdjustment: Double,    // multiplicateur sur la confiance globale
)

enum class ValuationSignal(val displayName: String, val emoji: String) {
    UNDERVALUED("Sous-évalué",           "🟢"),
    FAIR_VALUE ("Juste valeur",          "🟡"),
    OVERVALUED ("Sur-évalué",            "🔴"),
    UNKNOWN    ("Valorisation inconnue", "⚪"),
}
