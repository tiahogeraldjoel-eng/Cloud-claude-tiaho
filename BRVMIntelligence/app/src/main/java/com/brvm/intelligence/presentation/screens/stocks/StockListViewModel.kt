package com.brvm.intelligence.presentation.screens.stocks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.intelligence.domain.model.BRVMSector
import com.brvm.intelligence.domain.model.Stock
import com.brvm.intelligence.domain.usecase.GetStocksUseCase
import com.brvm.intelligence.domain.usecase.RefreshMarketDataUseCase
import com.brvm.intelligence.domain.usecase.SearchStocksUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class StockListUiState(
    val stocks: List<Stock> = emptyList(),
    val isLoading: Boolean = true,
    val searchQuery: String = "",
    val selectedSector: BRVMSector? = null,
    val sortOrder: StockSortOrder = StockSortOrder.MARKET_CAP,
    val error: String? = null
)

enum class StockSortOrder(val displayName: String) {
    MARKET_CAP("Capitalisation"),
    CHANGE_PERCENT("Variation %"),
    VOLUME("Volume"),
    ALPHABETICAL("Alphabétique")
}

@OptIn(FlowPreview::class)
@HiltViewModel
class StockListViewModel @Inject constructor(
    private val getStocksUseCase: GetStocksUseCase,
    private val searchStocksUseCase: SearchStocksUseCase,
    private val refreshMarketDataUseCase: RefreshMarketDataUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(StockListUiState())
    val uiState: StateFlow<StockListUiState> = _uiState.asStateFlow()

    private val searchQuery = MutableStateFlow("")
    private val selectedSector = MutableStateFlow<BRVMSector?>(null)

    init {
        observeStocks()
        refresh()
    }

    private fun observeStocks() {
        combine(searchQuery.debounce(300), selectedSector) { query, sector ->
            Pair(query, sector)
        }.flatMapLatest { (query, sector) ->
            when {
                query.isNotBlank() -> searchStocksUseCase(query)
                sector != null -> getStocksUseCase(sector)
                else -> getStocksUseCase()
            }
        }
        .map { stocks -> sortStocks(stocks, _uiState.value.sortOrder) }
        .onEach { stocks ->
            _uiState.update { it.copy(isLoading = false, stocks = stocks, error = null) }
        }
        .catch { e ->
            _uiState.update { it.copy(isLoading = false, error = e.message) }
        }
        .launchIn(viewModelScope)
    }

    fun onSearchQueryChange(query: String) {
        searchQuery.value = query
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun onSectorSelected(sector: BRVMSector?) {
        selectedSector.value = sector
        _uiState.update { it.copy(selectedSector = sector) }
    }

    fun onSortOrderChange(order: StockSortOrder) {
        _uiState.update { state ->
            state.copy(
                sortOrder = order,
                stocks = sortStocks(state.stocks, order)
            )
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            refreshMarketDataUseCase()
        }
    }

    private fun sortStocks(stocks: List<Stock>, order: StockSortOrder): List<Stock> {
        return when (order) {
            StockSortOrder.MARKET_CAP -> stocks.sortedByDescending { it.marketCap }
            StockSortOrder.CHANGE_PERCENT -> stocks.sortedByDescending { it.changePercent }
            StockSortOrder.VOLUME -> stocks.sortedByDescending { it.volume }
            StockSortOrder.ALPHABETICAL -> stocks.sortedBy { it.name }
        }
    }
}
