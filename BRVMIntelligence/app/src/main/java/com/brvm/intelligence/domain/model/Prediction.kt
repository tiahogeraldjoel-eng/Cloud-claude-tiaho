package com.brvm.intelligence.domain.model

import java.time.LocalDate

/** Prédictions IA (LSTM + Random Forest) pour une action BRVM */
data class StockPrediction(
    val symbol: String,
    val generatedAt: LocalDate,
    val predictions: List<DayPrediction>,   // J+1 à J+5
    val classification: PredictionClass,
    val classificationProbability: Double,  // 0.0 à 1.0
    val confidenceInterval: ConfidenceInterval,
    val keyFactors: List<PredictionFactor>,
    val backtestAccuracy: Double,           // Précision historique du modèle (%)
    val modelVersion: String = "LSTM-v1.0"
)

data class DayPrediction(
    val targetDate: LocalDate,
    val predictedPrice: Double,             // Prix prédit en FCFA
    val lowerBound: Double,                 // Borne inférieure IC 95%
    val upperBound: Double,                 // Borne supérieure IC 95%
    val expectedChangePercent: Double
)

data class ConfidenceInterval(
    val level: Double = 0.95,              // Niveau de confiance (95%)
    val lowerBound: Double,
    val upperBound: Double
)

enum class PredictionClass(val displayName: String, val description: String) {
    STRONG_RISE("Hausse Forte", "Probabilité élevée de hausse significative (>3%)"),
    RISE("Hausse", "Probabilité de hausse modérée (1-3%)"),
    NEUTRAL("Neutre", "Mouvement latéral probable (±1%)"),
    DECLINE("Baisse", "Probabilité de baisse modérée (-1 à -3%)"),
    STRONG_DECLINE("Baisse Forte", "Probabilité élevée de baisse significative (<-3%)")
}

data class PredictionFactor(
    val name: String,
    val impact: FactorImpact,
    val weight: Double,                    // Poids dans le modèle (0-1)
    val description: String
)

enum class FactorImpact { VERY_POSITIVE, POSITIVE, NEUTRAL, NEGATIVE, VERY_NEGATIVE }

/** Résultat de backtesting du modèle sur l'historique */
data class BacktestResult(
    val symbol: String,
    val period: String,
    val totalPredictions: Int,
    val correctPredictions: Int,
    val accuracy: Double,
    val averageError: Double,              // Erreur absolue moyenne en %
    val sharpeRatio: Double
)

/** Recommandation de trade complète */
data class TradeRecommendation(
    val symbol: String,
    val signal: TradingSignal,
    val entryPrice: Double,               // Prix d'entrée suggéré (FCFA)
    val stopLoss: Double,                 // Stop-loss (FCFA)
    val takeProfitLevels: List<Double>,   // Objectifs de prix (1er, 2ème, 3ème)
    val riskRewardRatio: Double,
    val positionSizePercent: Double,      // % recommandé du portefeuille
    val timeHorizon: String,
    val rationale: String,                // Explication en français
    val dcfValuation: Double?,            // Valorisation DCF (FCFA)
    val sectorComparableValuation: Double?,
    val priceTarget: Double               // Prix cible sur 12 mois
)
