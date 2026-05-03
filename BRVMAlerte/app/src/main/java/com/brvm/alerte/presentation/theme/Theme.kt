package com.brvm.alerte.presentation.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Palette BRVM — vert Afrique de l'Ouest, or financier
val BRVMGreen = Color(0xFF00703C)
val BRVMGreenLight = Color(0xFF4CAF50)
val BRVMGold = Color(0xFFF5A623)
val BRVMRed = Color(0xFFD32F2F)
val BRVMRedLight = Color(0xFFEF5350)
val BRVMSurface = Color(0xFF0D1117)
val BRVMSurfaceVariant = Color(0xFF161B22)
val BRVMOutline = Color(0xFF30363D)

private val DarkColorScheme = darkColorScheme(
    primary = BRVMGreen,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF003D1F),
    onPrimaryContainer = Color(0xFF9BE0B3),
    secondary = BRVMGold,
    onSecondary = Color.Black,
    secondaryContainer = Color(0xFF5C3A00),
    onSecondaryContainer = Color(0xFFFFDDB3),
    tertiary = Color(0xFF4FC3F7),
    background = BRVMSurface,
    onBackground = Color(0xFFE6EDF3),
    surface = BRVMSurfaceVariant,
    onSurface = Color(0xFFE6EDF3),
    surfaceVariant = Color(0xFF21262D),
    onSurfaceVariant = Color(0xFF8B949E),
    outline = BRVMOutline,
    error = BRVMRed,
    onError = Color.White
)

@Composable
fun BRVMTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = BRVMTypography,
        content = content
    )
}
