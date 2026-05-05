package com.brvm.alerte

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.brvm.alerte.presentation.navigation.BRVMNavGraph
import com.brvm.alerte.presentation.theme.BRVMTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BRVMTheme {
                var authenticated by remember { mutableStateOf(false) }
                var biometricAvailable by remember { mutableStateOf(false) }

                LaunchedEffect(Unit) {
                    val bm = BiometricManager.from(this@MainActivity)
                    biometricAvailable = bm.canAuthenticate(
                        BiometricManager.Authenticators.BIOMETRIC_WEAK or
                                BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    ) == BiometricManager.BIOMETRIC_SUCCESS
                    if (!biometricAvailable) authenticated = true
                    else showBiometricPrompt { authenticated = true }
                }

                if (authenticated) {
                    BRVMNavGraph()
                }
            }
        }
    }

    private fun showBiometricPrompt(onSuccess: () -> Unit) {
        val executor = ContextCompat.getMainExecutor(this)
        val prompt = BiometricPrompt(
            this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                        errorCode == BiometricPrompt.ERROR_USER_CANCELED
                    ) finish()
                }
            }
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("BRVM Alerte")
            .setSubtitle("Identifiez-vous pour accéder à vos alertes")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK or
                        BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()
        prompt.authenticate(info)
    }
}
