package com.brvm.intelligence.presentation.screens.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.usecase.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val isLoading: Boolean = true,
    val marketSummary: MarketSummary? = null,
    val fearGreedIndex: Int = 50,
    val fearGreedLabel: FearGreedLevel = FearGreedLevel.NEUTRAL,
    val upcomingEvents: List<MarketEvent> = emptyList(),
    val error: String? = null,
    val lastRefreshTime: String = ""
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val getMarketSummaryUseCase: GetMarketSummaryUseCase,
    private val getMarketSentimentUseCase: GetMarketSentimentUseCase,
    private val refreshMarketDataUseCase: RefreshMarketDataUseCase,
    private val stockRepository: com.brvm.intelligence.domain.repository.StockRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboardData()
        observeMarketSummary()
    }

    private fun observeMarketSummary() {
        getMarketSummaryUseCase()
            .onEach { summary ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        marketSummary = summary,
                        error = null
                    )
                }
            }
            .catch { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
            .launchIn(viewModelScope)
    }

    private fun loadDashboardData() {
        viewModelScope.launch {
            // Charger le sentiment de marché
            try {
                val sentiment = getMarketSentimentUseCase()
                _uiState.update {
                    it.copy(
                        fearGreedIndex = sentiment.fearGreedIndex,
                        fearGreedLabel = sentiment.fearGreedLabel
                    )
                }
            } catch (e: Exception) { /* Silencieux */ }

            // Charger les événements à venir
            try {
                val events = stockRepository.getUpcomingEvents()
                _uiState.update { it.copy(upcomingEvents = events) }
            } catch (e: Exception) { /* Silencieux */ }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            refreshMarketDataUseCase().onFailure { e ->
                _uiState.update { it.copy(
                    isLoading = false,
                    error = "Erreur de synchronisation : ${e.message}"
                )}
            }
        }
    }
}
