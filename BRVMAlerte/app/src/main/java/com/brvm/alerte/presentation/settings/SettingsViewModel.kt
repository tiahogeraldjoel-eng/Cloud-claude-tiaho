package com.brvm.alerte.presentation.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.alerte.data.preferences.UserPreferences
import com.brvm.alerte.data.preferences.UserPreferencesRepository
import com.brvm.alerte.service.EmailService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val prefsRepo: UserPreferencesRepository,
    private val emailService: EmailService
) : ViewModel() {

    val prefs = prefsRepo.preferences.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        UserPreferences()
    )

    fun setWhatsappEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setWhatsappEnabled(v) }
    fun setSmsEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setSmsEnabled(v) }
    fun setEmailEnabled(v: Boolean) = viewModelScope.launch {
        prefsRepo.setEmailEnabled(v)
        if (v) applyEmailConfig()
    }
    fun setPushEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setPushEnabled(v) }
    fun setMinScore(v: Int) = viewModelScope.launch { prefsRepo.setMinScore(v) }
    fun setVolumeThreshold(v: Float) = viewModelScope.launch { prefsRepo.setVolumeThreshold(v) }
    fun setAutoScanEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setAutoScanEnabled(v) }
    fun setPreEarningsEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setPreEarningsEnabled(v) }
    fun setDividendAlertEnabled(v: Boolean) = viewModelScope.launch { prefsRepo.setDividendAlertEnabled(v) }
    fun setEmailSender(v: String) = viewModelScope.launch { prefsRepo.setEmailSender(v) }
    fun setEmailPassword(v: String) = viewModelScope.launch { prefsRepo.setEmailPassword(v) }
    fun setEmailRecipients(v: String) = viewModelScope.launch { prefsRepo.setEmailRecipients(v) }
    fun setSmtpHost(v: String) = viewModelScope.launch { prefsRepo.setSmtpHost(v) }
    fun setPhoneNumber(v: String) = viewModelScope.launch { prefsRepo.setPhoneNumber(v) }

    private fun applyEmailConfig() {
        val p = prefs.value
        emailService.configure(
            senderEmail = p.emailSender,
            senderPassword = p.emailPassword,
            recipientEmails = p.emailRecipients.split(",", ";").map { it.trim() }.filter { it.isNotEmpty() },
            smtpHost = p.smtpHost,
            smtpPort = p.smtpPort
        )
    }
}
