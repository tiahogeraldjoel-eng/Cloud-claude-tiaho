package com.brvm.intelligence.domain.usecase

import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.repository.AnalysisRepository
import com.brvm.intelligence.domain.repository.AnalysisRepository.PortfolioAnalysis
import javax.inject.Inject

class GetTechnicalAnalysisUseCase @Inject constructor(
    private val analysisRepository: AnalysisRepository
) {
    suspend operator fun invoke(symbol: String): TechnicalAnalysis =
        analysisRepository.getTechnicalAnalysis(symbol)
}

class GetMarketSentimentUseCase @Inject constructor(
    private val analysisRepository: AnalysisRepository
) {
    suspend operator fun invoke(): MarketSentiment =
        analysisRepository.getMarketSentiment()
}

class GetPredictionUseCase @Inject constructor(
    private val analysisRepository: AnalysisRepository
) {
    suspend operator fun invoke(symbol: String): StockPrediction =
        analysisRepository.getPrediction(symbol)
}

class GetTradeRecommendationUseCase @Inject constructor(
    private val analysisRepository: AnalysisRepository
) {
    suspend operator fun invoke(symbol: String): TradeRecommendation =
        analysisRepository.getTradeRecommendation(symbol)
}

class AskAIUseCase @Inject constructor(
    private val analysisRepository: AnalysisRepository
) {
    suspend operator fun invoke(
        question: String,
        conversationHistory: List<ChatMessage>
    ): String = analysisRepository.askAI(question, conversationHistory)
}

class AnalyzePortfolioUseCase @Inject constructor(
    private val analysisRepository: AnalysisRepository
) {
    suspend operator fun invoke(portfolio: Portfolio): PortfolioAnalysis =
        analysisRepository.analyzePortfolio(portfolio)
}

class GetPriceHistoryUseCase @Inject constructor(
    private val stockRepository: com.brvm.intelligence.domain.repository.StockRepository
) {
    suspend operator fun invoke(symbol: String, period: HistoryPeriod): PriceHistory =
        stockRepository.getPriceHistory(symbol, period)
}
