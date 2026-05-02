package com.brvm.alerte.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.alerte.domain.model.Alert
import com.brvm.alerte.domain.model.MarketSentiment
import com.brvm.alerte.domain.model.Stock
import com.brvm.alerte.domain.repository.AlertRepository
import com.brvm.alerte.domain.repository.StockRepository
import com.brvm.alerte.domain.usecase.ComputeMarketSentimentUseCase
import com.brvm.alerte.domain.usecase.ScoreStockUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val isLoading: Boolean = true,
    val topOpportunities: List<Pair<Stock, ScoreStockUseCase.ScoringResult>> = emptyList(),
    val recentAlerts: List<Alert> = emptyList(),
    val sentiment: MarketSentiment? = null,
    val unreadCount: Int = 0,
    val error: String? = null
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val stockRepo: StockRepository,
    private val alertRepo: AlertRepository,
    private val scoreStock: ScoreStockUseCase,
    private val computeSentiment: ComputeMarketSentimentUseCase
) : ViewModel() {

    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()

    init {
        observeData()
    }

    private fun observeData() {
        viewModelScope.launch {
            combine(
                stockRepo.observeAllStocks(),
                alertRepo.observeUnreadAlerts(),
                alertRepo.observeUnreadCount()
            ) { stocks, unreadAlerts, unreadCount ->
                val sentiment = computeSentiment.compute(stocks)
                val opportunities = stocks
                    .map { stock ->
                        val indicators = stockRepo.getTechnicalIndicators(stock.ticker)
                        stock to scoreStock.score(stock, indicators)
                    }
                    .filter { (_, result) -> result.totalScore >= 55 }
                    .sortedByDescending { (_, result) -> result.totalScore }
                    .take(10)

                DashboardUiState(
                    isLoading = false,
                    topOpportunities = opportunities,
                    recentAlerts = unreadAlerts.take(5),
                    sentiment = sentiment,
                    unreadCount = unreadCount,
                    error = null
                )
            }.catch { e ->
                _state.update { it.copy(isLoading = false, error = e.message) }
            }.collect { newState ->
                _state.value = newState
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                stockRepo.refreshAllStocks()
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = "Erreur de connexion: ${e.message}") }
            }
        }
    }
}
