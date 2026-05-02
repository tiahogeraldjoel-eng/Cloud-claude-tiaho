package com.brvm.alerte.presentation.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.alerte.data.preferences.UserPreferences
import com.brvm.alerte.data.preferences.UserPreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val prefsRepo: UserPreferencesRepository
) : ViewModel() {

    val prefs = prefsRepo.preferences.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        UserPreferences()
    )

    fun setWhatsappEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setWhatsappEnabled(v) }
    fun setSmsEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setSmsEnabled(v) }
    fun setEmailEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setEmailEnabled(v) }
    fun setPushEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setPushEnabled(v) }
    fun setMinScore(v: Int) = viewModelScope.launch { prefsRepo.setMinScore(v) }
    fun setVolumeThreshold(v: Float) = viewModelScope.launch { prefsRepo.setVolumeThreshold(v) }
    fun setAutoScanEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setAutoScanEnabled(v) }
    fun setPreEarningsEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setPreEarningsEnabled(v) }
    fun setDividendAlertEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setDividendAlertEnabled(v) }
}
