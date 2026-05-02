package com.brvm.alerte.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

data class UserPreferences(
    val whatsappEnabled: Boolean = true,
    val smsEnabled: Boolean = false,
    val emailEnabled: Boolean = false,
    val pushEnabled: Boolean = true,
    val minScore: Int = 60,
    val volumeThreshold: Float = 2.0f,
    val autoScanEnabled: Boolean = true,
    val preEarningsEnabled: Boolean = true,
    val dividendAlertEnabled: Boolean = true,
    val emailAddress: String = ""
)

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "brvm_prefs")

@Singleton
class UserPreferencesRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val WHATSAPP = booleanPreferencesKey("whatsapp_enabled")
        val SMS = booleanPreferencesKey("sms_enabled")
        val EMAIL = booleanPreferencesKey("email_enabled")
        val PUSH = booleanPreferencesKey("push_enabled")
        val MIN_SCORE = intPreferencesKey("min_score")
        val VOLUME_THRESHOLD = floatPreferencesKey("volume_threshold")
        val AUTO_SCAN = booleanPreferencesKey("auto_scan_enabled")
        val PRE_EARNINGS = booleanPreferencesKey("pre_earnings_enabled")
        val DIVIDEND_ALERT = booleanPreferencesKey("dividend_alert_enabled")
        val EMAIL_ADDRESS = stringPreferencesKey("email_address")
    }

    val preferences: Flow<UserPreferences> = context.dataStore.data
        .catch { emit(emptyPreferences()) }
        .map { p ->
            UserPreferences(
                whatsappEnabled = p[Keys.WHATSAPP] ?: true,
                smsEnabled = p[Keys.SMS] ?: false,
                emailEnabled = p[Keys.EMAIL] ?: false,
                pushEnabled = p[Keys.PUSH] ?: true,
                minScore = p[Keys.MIN_SCORE] ?: 60,
                volumeThreshold = p[Keys.VOLUME_THRESHOLD] ?: 2.0f,
                autoScanEnabled = p[Keys.AUTO_SCAN] ?: true,
                preEarningsEnabled = p[Keys.PRE_EARNINGS] ?: true,
                dividendAlertEnabled = p[Keys.DIVIDEND_ALERT] ?: true,
                emailAddress = p[Keys.EMAIL_ADDRESS] ?: ""
            )
        }

    suspend fun setWhatsappEnabled(v: Boolean) = context.dataStore.edit { it[Keys.WHATSAPP] = v }
    suspend fun setSmsEnabled(v: Boolean) = context.dataStore.edit { it[Keys.SMS] = v }
    suspend fun setEmailEnabled(v: Boolean) = context.dataStore.edit { it[Keys.EMAIL] = v }
    suspend fun setPushEnabled(v: Boolean) = context.dataStore.edit { it[Keys.PUSH] = v }
    suspend fun setMinScore(v: Int) = context.dataStore.edit { it[Keys.MIN_SCORE] = v }
    suspend fun setVolumeThreshold(v: Float) = context.dataStore.edit { it[Keys.VOLUME_THRESHOLD] = v }
    suspend fun setAutoScanEnabled(v: Boolean) = context.dataStore.edit { it[Keys.AUTO_SCAN] = v }
    suspend fun setPreEarningsEnabled(v: Boolean) = context.dataStore.edit { it[Keys.PRE_EARNINGS] = v }
    suspend fun setDividendAlertEnabled(v: Boolean) = context.dataStore.edit { it[Keys.DIVIDEND_ALERT] = v }
}
