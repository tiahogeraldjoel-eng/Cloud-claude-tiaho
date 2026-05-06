package com.brvm.intelligence.domain.repository

import com.brvm.intelligence.domain.model.*

interface AnalysisRepository {

    /** Analyse technique complète pour une action */
    suspend fun getTechnicalAnalysis(symbol: String): TechnicalAnalysis

    /** Sentiment de marché global BRVM */
    suspend fun getMarketSentiment(): MarketSentiment

    /** Prédictions IA (LSTM + Random Forest) */
    suspend fun getPrediction(symbol: String): StockPrediction

    /** Recommandation de trade complète */
    suspend fun getTradeRecommendation(symbol: String): TradeRecommendation

    /** Résultat de backtesting du modèle */
    suspend fun getBacktestResults(symbol: String): BacktestResult

    /** Chat avec l'assistant IA */
    suspend fun askAI(question: String, context: List<ChatMessage>): String

    /** Analyse de portefeuille avec suggestions */
    suspend fun analyzePortfolio(portfolio: Portfolio): PortfolioAnalysis
}

data class PortfolioAnalysis(
    val rebalancingSuggestions: List<RebalancingSuggestion>,
    val overweightedSectors: List<BRVMSector>,
    val underweightedSectors: List<BRVMSector>,
    val riskWarnings: List<String>,
    val monthlyReport: String                   // Rapport mensuel texte en français
)

data class RebalancingSuggestion(
    val action: RebalancingAction,
    val symbol: String,
    val currentAllocation: Double,
    val targetAllocation: Double,
    val rationale: String
)

enum class RebalancingAction { BUY_MORE, REDUCE, HOLD, SELL_ALL }
