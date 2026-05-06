package com.brvm.intelligence.presentation.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = BRVMGreen,
    onPrimary = SurfaceLight,
    primaryContainer = BRVMGreenDark,
    onPrimaryContainer = BRVMGreenLight,
    secondary = BRVMGold,
    onSecondary = SurfaceDark,
    secondaryContainer = Color(0xFF3A2D00),
    onSecondaryContainer = BRVMGoldLight,
    tertiary = BRVMBlue,
    error = BRVMRed,
    background = SurfaceDark,
    onBackground = TextPrimaryDark,
    surface = SurfaceDarkElevated,
    onSurface = TextPrimaryDark,
    surfaceVariant = SurfaceCardDark,
    onSurfaceVariant = TextSecondaryDark,
    outline = Color(0xFF404040)
)

private val LightColorScheme = lightColorScheme(
    primary = BRVMGreen,
    onPrimary = SurfaceLight,
    primaryContainer = BRVMGreenLight,
    onPrimaryContainer = BRVMGreenDark,
    secondary = BRVMGold,
    onSecondary = TextPrimaryLight,
    secondaryContainer = Color(0xFFFFF3CD),
    onSecondaryContainer = Color(0xFF5C3D00),
    tertiary = BRVMBlue,
    error = BRVMRed,
    background = SurfaceLight,
    onBackground = TextPrimaryLight,
    surface = SurfaceCardLight,
    onSurface = TextPrimaryLight,
    surfaceVariant = Color(0xFFF3F4F6),
    onSurfaceVariant = TextSecondaryLight,
    outline = Color(0xFFE5E7EB)
)

@Composable
fun BRVMIntelligenceTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = BRVMTypography,
        content = content
    )
}
