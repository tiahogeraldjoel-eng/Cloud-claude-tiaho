package com.brvm.alerte.presentation.chart

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.alerte.domain.model.PricePoint
import com.brvm.alerte.domain.model.Stock
import com.brvm.alerte.domain.model.TechnicalIndicators
import com.brvm.alerte.domain.repository.StockRepository
import com.brvm.alerte.domain.usecase.ComputeTechnicalIndicatorsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class ChartPeriod(val label: String, val days: Int) {
    W1("1S", 7), M1("1M", 30), M3("3M", 90), M6("6M", 180), Y1("1A", 365)
}

enum class ChartType { LINE, CANDLESTICK }

data class ChartUiState(
    val stock: Stock? = null,
    val priceHistory: List<PricePoint> = emptyList(),
    val indicators: TechnicalIndicators? = null,
    val period: ChartPeriod = ChartPeriod.M3,
    val chartType: ChartType = ChartType.CANDLESTICK,
    val showSMA: Boolean = true,
    val showBollinger: Boolean = false,
    val isLoading: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class ChartViewModel @Inject constructor(
    private val stockRepo: StockRepository,
    private val computeIndicators: ComputeTechnicalIndicatorsUseCase,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val ticker: String = savedStateHandle.get<String>("ticker") ?: ""

    private val _state = MutableStateFlow(ChartUiState())
    val state: StateFlow<ChartUiState> = _state.asStateFlow()

    init {
        observeStock()
        loadChart()
    }

    private fun observeStock() {
        viewModelScope.launch {
            stockRepo.observeStock(ticker).collect { stock ->
                _state.update { it.copy(stock = stock) }
            }
        }
    }

    fun loadChart() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            try {
                stockRepo.refreshPriceHistory(ticker)
                val history = stockRepo.getPriceHistory(ticker, 365)
                val indicators = computeIndicators.compute(ticker, history)
                if (indicators != null) stockRepo.saveTechnicalIndicators(indicators)

                val periodHistory = history.takeLast(_state.value.period.days)
                _state.update { it.copy(priceHistory = periodHistory, indicators = indicators, isLoading = false) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun setPeriod(period: ChartPeriod) {
        viewModelScope.launch {
            val allHistory = stockRepo.getPriceHistory(ticker, 365)
            _state.update { it.copy(period = period, priceHistory = allHistory.takeLast(period.days)) }
        }
    }

    fun setChartType(type: ChartType) = _state.update { it.copy(chartType = type) }
    fun toggleSMA() = _state.update { it.copy(showSMA = !it.showSMA) }
    fun toggleBollinger() = _state.update { it.copy(showBollinger = !it.showBollinger) }
}
