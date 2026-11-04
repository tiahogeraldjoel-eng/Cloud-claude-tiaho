package com.tiaho.coffrefort.lock

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

private const val ALLOWED_AUTHENTICATORS = BIOMETRIC_WEAK or DEVICE_CREDENTIAL

/**
 * Verrouille l'accès au coffre-fort derrière l'empreinte/visage de l'appareil,
 * avec le code/schéma de verrouillage de l'appareil en secours.
 */
object VaultLock {

    /** true si l'appareil a un moyen d'authentification configuré (biométrie ou code). */
    fun isAvailable(activity: FragmentActivity): Boolean =
        BiometricManager.from(activity).canAuthenticate(ALLOWED_AUTHENTICATORS) ==
            BiometricManager.BIOMETRIC_SUCCESS

    fun authenticate(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onFailure: () -> Unit
    ) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Coffre-Fort verrouillé")
            .setSubtitle("Authentifiez-vous pour accéder à vos documents")
            .setAllowedAuthenticators(ALLOWED_AUTHENTICATORS)
            .build()

        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onFailure()
                }

                override fun onAuthenticationFailed() {
                    // Tentative refusée (empreinte non reconnue) : la boîte de dialogue reste
                    // ouverte pour un nouvel essai, rien à faire ici.
                }
            }
        )
        prompt.authenticate(promptInfo)
    }
}
