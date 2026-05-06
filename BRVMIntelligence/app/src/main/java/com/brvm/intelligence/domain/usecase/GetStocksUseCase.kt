package com.brvm.intelligence.domain.usecase

import com.brvm.intelligence.domain.model.BRVMSector
import com.brvm.intelligence.domain.model.Stock
import com.brvm.intelligence.domain.repository.StockRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class GetStocksUseCase @Inject constructor(
    private val stockRepository: StockRepository
) {
    operator fun invoke(sector: BRVMSector? = null): Flow<List<Stock>> =
        if (sector != null) stockRepository.getStocksBySector(sector)
        else stockRepository.getAllStocks()
}

class SearchStocksUseCase @Inject constructor(
    private val stockRepository: StockRepository
) {
    operator fun invoke(query: String): Flow<List<Stock>> =
        stockRepository.searchStocks(query)
}

class GetStockDetailUseCase @Inject constructor(
    private val stockRepository: StockRepository
) {
    suspend operator fun invoke(symbol: String): Stock? =
        stockRepository.getStockBySymbol(symbol)
}

class RefreshMarketDataUseCase @Inject constructor(
    private val stockRepository: StockRepository
) {
    suspend operator fun invoke(): Result<Unit> =
        stockRepository.refreshMarketData()
}
