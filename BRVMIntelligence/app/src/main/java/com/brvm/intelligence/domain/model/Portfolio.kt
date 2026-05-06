package com.brvm.intelligence.domain.model

import java.time.LocalDate

/** Position individuelle dans le portefeuille */
data class PortfolioPosition(
    val id: Long = 0,
    val symbol: String,
    val stockName: String,
    val quantity: Int,
    val purchasePrice: Double,         // Prix d'achat en FCFA
    val purchaseDate: LocalDate,
    val currentPrice: Double,
    val sector: BRVMSector,
    val notes: String = ""
) {
    val currentValue: Double get() = currentPrice * quantity
    val purchaseCost: Double get() = purchasePrice * quantity
    val absoluteGain: Double get() = currentValue - purchaseCost
    val percentGain: Double get() = if (purchaseCost > 0) (absoluteGain / purchaseCost) * 100 else 0.0
    val isProfit: Boolean get() = absoluteGain >= 0
}

/** Portefeuille global */
data class Portfolio(
    val positions: List<PortfolioPosition>,
    val totalValue: Double,
    val totalCost: Double,
    val totalGain: Double,
    val totalGainPercent: Double,
    val sectorAllocation: Map<BRVMSector, Double>, // % par secteur
    val metrics: PortfolioMetrics,
    val benchmarkComparison: BenchmarkComparison
)

/** Métriques de risque du portefeuille */
data class PortfolioMetrics(
    val sharpeRatio: Double,            // Ratio de Sharpe
    val beta: Double,                   // Beta vs BRVM Composite
    val var95: Double,                  // Value at Risk 95% (perte max probable)
    val volatility: Double,             // Volatilité annualisée en %
    val maxDrawdown: Double,            // Perte maximale historique en %
    val diversificationScore: Int       // Score diversification 0-100
)

data class BenchmarkComparison(
    val portfolioReturn: Double,
    val brvmCompositeReturn: Double,
    val alpha: Double,                  // Surperformance vs indice
    val period: String
)

/** Profil investisseur */
data class InvestorProfile(
    val riskTolerance: RiskTolerance,
    val investmentHorizon: InvestmentHorizon,
    val availableCapital: Double,       // En FCFA
    val currentPortfolioValue: Double,
    val monthlyInvestmentCapacity: Double,
    val financialGoal: String,
    val questionnaire: ProfileQuestionnaire
)

enum class RiskTolerance(val displayName: String, val description: String, val maxVolatility: Double) {
    PRUDENT("Prudent", "Préservation du capital prioritaire. Faible tolérance aux pertes.", 10.0),
    EQUILIBRE("Équilibré", "Recherche d'un équilibre entre rendement et risque.", 20.0),
    DYNAMIQUE("Dynamique", "Accepte une volatilité élevée pour maximiser les gains.", 35.0)
}

enum class InvestmentHorizon(val displayName: String, val years: Int) {
    SHORT_TERM("Court terme (< 1 an)", 1),
    MEDIUM_TERM("Moyen terme (1-3 ans)", 3),
    LONG_TERM("Long terme (> 3 ans)", 5)
}

data class ProfileQuestionnaire(
    val questionsAnswered: Int,
    val totalScore: Int,
    val completedAt: LocalDate?
)

/** Événement clé BRVM */
data class MarketEvent(
    val date: LocalDate,
    val type: EventType,
    val title: String,
    val description: String,
    val affectedSymbols: List<String> = emptyList(),
    val expectedImpact: EventImpact = EventImpact.NEUTRAL
)

enum class EventType(val displayName: String) {
    DIVIDEND_DETACHMENT("Détachement dividende"),
    RESULTS_PUBLICATION("Publication résultats"),
    GENERAL_ASSEMBLY("Assemblée Générale"),
    CAPITAL_INCREASE("Augmentation de capital"),
    BCEAO_DECISION("Décision BCEAO"),
    MACRO_INDICATOR("Indicateur macro UEMOA"),
    MARKET_SUSPENSION("Suspension de cotation"),
    NEW_LISTING("Introduction en bourse")
}

enum class EventImpact { VERY_POSITIVE, POSITIVE, NEUTRAL, NEGATIVE, VERY_NEGATIVE }
