package com.brvm.alerte.presentation.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.alerte.domain.model.Alert
import com.brvm.alerte.domain.model.AlertChannel
import com.brvm.alerte.domain.repository.AlertRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AlertsUiState(
    val alerts: List<Alert> = emptyList(),
    val unreadCount: Int = 0,
    val isLoading: Boolean = false
)

@HiltViewModel
class AlertsViewModel @Inject constructor(
    private val alertRepo: AlertRepository
) : ViewModel() {

    val state: StateFlow<AlertsUiState> = combine(
        alertRepo.observeAllAlerts(),
        alertRepo.observeUnreadCount()
    ) { alerts, count ->
        AlertsUiState(alerts = alerts, unreadCount = count)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), AlertsUiState())

    fun markAsRead(id: Long) = viewModelScope.launch { alertRepo.markAsRead(id) }
    fun markAllAsRead() = viewModelScope.launch { alertRepo.markAllAsRead() }
}
