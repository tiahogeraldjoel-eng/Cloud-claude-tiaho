package com.brvm.alerte.presentation.calendar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.alerte.domain.model.EarningsEvent
import com.brvm.alerte.domain.repository.AlertRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import javax.inject.Inject

data class CalendarUiState(val upcomingEvents: List<EarningsEvent> = emptyList())

@HiltViewModel
class CalendarViewModel @Inject constructor(
    alertRepo: AlertRepository
) : ViewModel() {

    val state: StateFlow<CalendarUiState> = alertRepo
        .observeUpcomingEvents(System.currentTimeMillis() / 1000)
        .map { CalendarUiState(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), CalendarUiState())
}
