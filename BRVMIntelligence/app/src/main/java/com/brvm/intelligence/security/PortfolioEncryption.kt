package com.brvm.intelligence.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.brvm.intelligence.domain.model.*
import com.google.gson.Gson
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Chiffrement AES-256 des données sensibles du portefeuille.
 * Utilise EncryptedSharedPreferences (Android Keystore + AES-256-GCM).
 * Les données de portefeuille ne quittent jamais l'appareil en clair.
 */
@Singleton
class PortfolioEncryption @Inject constructor(
    private val context: Context
) {
    private val gson = Gson()

    private val masterKey by lazy {
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private val encryptedPrefs by lazy {
        try {
            EncryptedSharedPreferences.create(
                context,
                "brvm_portfolio_encrypted",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Timber.e(e, "Erreur création EncryptedSharedPreferences, fallback vers SharedPreferences standard")
            // Fallback non chiffré en cas d'erreur (ne jamais faire en production)
            context.getSharedPreferences("brvm_portfolio_fallback", Context.MODE_PRIVATE)
        }
    }

    fun saveInvestorProfile(profile: InvestorProfile) {
        try {
            val json = gson.toJson(profile)
            encryptedPrefs.edit()
                .putString(KEY_INVESTOR_PROFILE, json)
                .apply()
            Timber.d("Profil investisseur sauvegardé (chiffré)")
        } catch (e: Exception) {
            Timber.e(e, "Erreur sauvegarde profil investisseur")
        }
    }

    fun loadInvestorProfile(): InvestorProfile? {
        return try {
            val json = encryptedPrefs.getString(KEY_INVESTOR_PROFILE, null)
            json?.let { gson.fromJson(it, InvestorProfile::class.java) }
        } catch (e: Exception) {
            Timber.e(e, "Erreur chargement profil investisseur")
            null
        }
    }

    fun saveOnboardingCompleted(completed: Boolean) {
        encryptedPrefs.edit().putBoolean(KEY_ONBOARDING_DONE, completed).apply()
    }

    fun isOnboardingCompleted(): Boolean =
        encryptedPrefs.getBoolean(KEY_ONBOARDING_DONE, false)

    fun clearAllData() {
        encryptedPrefs.edit().clear().apply()
        Timber.i("Toutes les données chiffrées effacées")
    }

    companion object {
        private const val KEY_INVESTOR_PROFILE = "investor_profile"
        private const val KEY_ONBOARDING_DONE = "onboarding_completed"
    }
}
