package com.brvm.alerte.presentation.scanner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.alerte.domain.model.Stock
import com.brvm.alerte.domain.repository.StockRepository
import com.brvm.alerte.domain.usecase.ScoreStockUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

enum class ScannerFilter {
    ALL, HIGH_SCORE, VOLUME_ANOMALY, OVERSOLD, DIVIDEND, WATCHLIST
}

data class ScannerUiState(
    val isLoading: Boolean = true,
    val items: List<ScannerItem> = emptyList(),
    val filter: ScannerFilter = ScannerFilter.ALL,
    val searchQuery: String = "",
    val error: String? = null
)

data class ScannerItem(
    val stock: Stock,
    val result: ScoreStockUseCase.ScoringResult,
    val isWatchlisted: Boolean
)

@HiltViewModel
class ScannerViewModel @Inject constructor(
    private val stockRepo: StockRepository,
    private val scoreStock: ScoreStockUseCase
) : ViewModel() {

    // Source of truth séparée — jamais écrasée par les filtres
    private val _allItems = MutableStateFlow<List<ScannerItem>>(emptyList())
    private val _state = MutableStateFlow(ScannerUiState())
    val state: StateFlow<ScannerUiState> = _state.asStateFlow()

    init {
        observeStocks()
        refresh()
    }

    private fun observeStocks() {
        viewModelScope.launch {
            stockRepo.observeAllStocks().collect { stocks ->
                val items = stocks.map { stock ->
                    val indicators = stockRepo.getTechnicalIndicators(stock.ticker)
                    ScannerItem(
                        stock = stock,
                        result = scoreStock.score(stock, indicators),
                        isWatchlisted = stock.isWatchlisted
                    )
                }.sortedByDescending { it.result.totalScore }

                _allItems.value = items
                _state.update { state ->
                    state.copy(
                        isLoading = false,
                        items = applyFilter(items, state.filter, state.searchQuery)
                    )
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            try {
                // 90s max — chunked SikaFinance phase 2 can take up to 30s
                withTimeoutOrNull(90_000L) { stockRepo.refreshAllStocks() }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            } finally {
                // Garantit que le spinner s'arrête dans tous les cas
                _state.update { it.copy(isLoading = false) }
            }
        }
    }

    fun setFilter(filter: ScannerFilter) {
        _state.update { state ->
            state.copy(
                filter = filter,
                items = applyFilter(_allItems.value, filter, state.searchQuery)
            )
        }
    }

    fun setSearchQuery(query: String) {
        _state.update { state ->
            state.copy(
                searchQuery = query,
                items = applyFilter(_allItems.value, state.filter, query)
            )
        }
    }

    fun toggleWatchlist(ticker: String) {
        viewModelScope.launch {
            val item = _allItems.value.find { it.stock.ticker == ticker } ?: return@launch
            stockRepo.updateWatchlistStatus(ticker, !item.isWatchlisted)
        }
    }

    private fun applyFilter(
        items: List<ScannerItem>,
        filter: ScannerFilter,
        query: String
    ): List<ScannerItem> {
        val filtered = when (filter) {
            ScannerFilter.ALL -> items
            ScannerFilter.HIGH_SCORE -> items.filter { it.result.totalScore >= 65 }
            ScannerFilter.VOLUME_ANOMALY -> items.filter { it.stock.isVolumeAnomaly }
            ScannerFilter.OVERSOLD -> items.filter { it.result.technicalScore <= 25 }
            ScannerFilter.DIVIDEND -> items.filter { (it.stock.dividendYield ?: 0.0) >= 3.0 }
            ScannerFilter.WATCHLIST -> items.filter { it.isWatchlisted }
        }
        return if (query.isBlank()) filtered
        else filtered.filter {
            it.stock.ticker.contains(query, ignoreCase = true) ||
                    it.stock.name.contains(query, ignoreCase = true)
        }
    }
}
