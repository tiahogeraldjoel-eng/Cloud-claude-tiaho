package com.brvm.intelligence.presentation.screens.portfolio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.repository.AnalysisRepository.PortfolioAnalysis
import com.brvm.intelligence.domain.usecase.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

data class PortfolioUiState(
    val portfolio: Portfolio? = null,
    val analysis: PortfolioAnalysis? = null,
    val isLoading: Boolean = true,
    val showAddDialog: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class PortfolioViewModel @Inject constructor(
    private val getPortfolioUseCase: GetPortfolioUseCase,
    private val addPositionUseCase: AddPortfolioPositionUseCase,
    private val deletePositionUseCase: DeletePortfolioPositionUseCase,
    private val analyzePortfolioUseCase: AnalyzePortfolioUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(PortfolioUiState())
    val uiState: StateFlow<PortfolioUiState> = _uiState.asStateFlow()

    init {
        observePortfolio()
    }

    private fun observePortfolio() {
        getPortfolioUseCase()
            .onEach { portfolio ->
                _uiState.update { it.copy(isLoading = false, portfolio = portfolio) }
                // Analyse automatique si positions > 0
                if (portfolio.positions.isNotEmpty()) {
                    analyzePortfolio(portfolio)
                }
            }
            .catch { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
            .launchIn(viewModelScope)
    }

    fun addPosition(
        symbol: String,
        stockName: String,
        quantity: Int,
        purchasePrice: Double,
        purchaseDate: LocalDate,
        sector: BRVMSector,
        notes: String = ""
    ) {
        viewModelScope.launch {
            addPositionUseCase(
                PortfolioPosition(
                    symbol = symbol.uppercase(),
                    stockName = stockName,
                    quantity = quantity,
                    purchasePrice = purchasePrice,
                    purchaseDate = purchaseDate,
                    currentPrice = purchasePrice,  // Sera mis à jour lors du prochain refresh
                    sector = sector,
                    notes = notes
                )
            )
            _uiState.update { it.copy(showAddDialog = false) }
        }
    }

    fun deletePosition(positionId: Long) {
        viewModelScope.launch {
            deletePositionUseCase(positionId)
        }
    }

    fun toggleAddDialog() {
        _uiState.update { it.copy(showAddDialog = !it.showAddDialog) }
    }

    private fun analyzePortfolio(portfolio: Portfolio) {
        viewModelScope.launch {
            try {
                val analysis = analyzePortfolioUseCase(portfolio)
                _uiState.update { it.copy(analysis = analysis) }
            } catch (e: Exception) { /* Silencieux */ }
        }
    }
}
