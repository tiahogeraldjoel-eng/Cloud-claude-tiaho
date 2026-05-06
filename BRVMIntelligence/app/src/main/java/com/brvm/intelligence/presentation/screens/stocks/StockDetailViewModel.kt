package com.brvm.intelligence.presentation.screens.stocks

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.repository.StockRepository
import com.brvm.intelligence.domain.usecase.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class StockDetailUiState(
    val stock: Stock? = null,
    val priceHistory: PriceHistory? = null,
    val selectedPeriod: HistoryPeriod = HistoryPeriod.ONE_MONTH,
    val technicalAnalysis: TechnicalAnalysis? = null,
    val prediction: StockPrediction? = null,
    val recommendation: TradeRecommendation? = null,
    val isInWatchlist: Boolean = false,
    val isLoading: Boolean = true,
    val isAnalysisLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class StockDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val getStockDetailUseCase: GetStockDetailUseCase,
    private val getPriceHistoryUseCase: GetPriceHistoryUseCase,
    private val getTechnicalAnalysisUseCase: GetTechnicalAnalysisUseCase,
    private val getPredictionUseCase: GetPredictionUseCase,
    private val getTradeRecommendationUseCase: GetTradeRecommendationUseCase,
    private val stockRepository: StockRepository
) : ViewModel() {

    val symbol: String = checkNotNull(savedStateHandle["symbol"])

    private val _uiState = MutableStateFlow(StockDetailUiState())
    val uiState: StateFlow<StockDetailUiState> = _uiState.asStateFlow()

    init {
        loadStockData()
    }

    private fun loadStockData() {
        viewModelScope.launch {
            // Chargement du stock
            val stock = getStockDetailUseCase(symbol)
            _uiState.update { it.copy(stock = stock, isLoading = false) }

            // Historique des prix
            loadPriceHistory(_uiState.value.selectedPeriod)

            // Vérifier si dans watchlist
            stockRepository.getWatchlist()
                .map { watchlist -> watchlist.any { it.symbol == symbol } }
                .collect { inWatchlist ->
                    _uiState.update { it.copy(isInWatchlist = inWatchlist) }
                }
        }
    }

    fun onPeriodSelected(period: HistoryPeriod) {
        _uiState.update { it.copy(selectedPeriod = period) }
        loadPriceHistory(period)
    }

    private fun loadPriceHistory(period: HistoryPeriod) {
        viewModelScope.launch {
            try {
                val history = getPriceHistoryUseCase(symbol, period)
                _uiState.update { it.copy(priceHistory = history) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = "Erreur chargement historique: ${e.message}") }
            }
        }
    }

    fun loadAnalysis() {
        if (_uiState.value.technicalAnalysis != null) return
        viewModelScope.launch {
            _uiState.update { it.copy(isAnalysisLoading = true) }
            try {
                val analysis = getTechnicalAnalysisUseCase(symbol)
                val prediction = getPredictionUseCase(symbol)
                val recommendation = getTradeRecommendationUseCase(symbol)
                _uiState.update {
                    it.copy(
                        technicalAnalysis = analysis,
                        prediction = prediction,
                        recommendation = recommendation,
                        isAnalysisLoading = false
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isAnalysisLoading = false, error = e.message) }
            }
        }
    }

    fun toggleWatchlist() {
        viewModelScope.launch {
            if (_uiState.value.isInWatchlist) {
                stockRepository.removeFromWatchlist(symbol)
            } else {
                stockRepository.addToWatchlist(symbol)
            }
        }
    }
}
