package com.brvm.intelligence.domain.usecase

import com.brvm.intelligence.domain.model.MarketSummary
import com.brvm.intelligence.domain.repository.StockRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class GetMarketSummaryUseCase @Inject constructor(
    private val stockRepository: StockRepository
) {
    operator fun invoke(): Flow<MarketSummary> =
        stockRepository.getMarketSummary()
}
