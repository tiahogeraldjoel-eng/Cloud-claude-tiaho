package com.brvm.alerte.presentation.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brvm.alerte.presentation.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Paramètres", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item { SectionTitle("Canaux d'alerte") }
            item {
                SettingsCard {
                    ToggleSetting("WhatsApp", "Partage direct via WhatsApp", Icons.Filled.Send, BRVMGreen, prefs.whatsappEnabled) {
                        viewModel.setWhatsappEnabled(it)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 48.dp))
                    ToggleSetting("SMS", "Alertes par SMS", Icons.Filled.Sms, Color(0xFF1976D2), prefs.smsEnabled) {
                        viewModel.setSmsEnabled(it)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 48.dp))
                    ToggleSetting("Email", "Alertes par email", Icons.Filled.Email, BRVMGold, prefs.emailEnabled) {
                        viewModel.setEmailEnabled(it)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 48.dp))
                    ToggleSetting("Push", "Notifications push", Icons.Filled.Notifications, Color(0xFF9C27B0), prefs.pushEnabled) {
                        viewModel.setPushEnabled(it)
                    }
                }
            }

            item { SectionTitle("Seuils de détection") }
            item {
                SettingsCard {
                    SliderSetting(
                        label = "Score minimum",
                        value = prefs.minScore.toFloat(),
                        range = 30f..90f,
                        steps = 11,
                        displayValue = "${prefs.minScore}/100",
                        color = BRVMGreen
                    ) { viewModel.setMinScore(it.toInt()) }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    SliderSetting(
                        label = "Volume anormal (×moyenne)",
                        value = prefs.volumeThreshold,
                        range = 1.5f..5f,
                        steps = 6,
                        displayValue = "${String.format("%.1f", prefs.volumeThreshold)}x",
                        color = BRVMGold
                    ) { viewModel.setVolumeThreshold(it) }
                }
            }

            item { SectionTitle("Analyse") }
            item {
                SettingsCard {
                    ToggleSetting("Analyse automatique", "Scan toutes les heures en session", Icons.Filled.AutoMode, BRVMGreen, prefs.autoScanEnabled) {
                        viewModel.setAutoScanEnabled(it)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 48.dp))
                    ToggleSetting("Signaux pré-résultats", "Alerte J-5 avant les publications", Icons.Filled.Upcoming, BRVMGold, prefs.preEarningsEnabled) {
                        viewModel.setPreEarningsEnabled(it)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 48.dp))
                    ToggleSetting("Dividendes ex-date", "Alerte avant l'ex-date dividende", Icons.Filled.Payments, BRVMGreenLight, prefs.dividendAlertEnabled) {
                        viewModel.setDividendAlertEnabled(it)
                    }
                }
            }

            item { SectionTitle("Données") }
            item {
                SettingsCard {
                    InfoRow(Icons.Filled.Storage, "Conserver l'historique", "30 jours")
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 48.dp))
                    InfoRow(Icons.Filled.Info, "Version", "1.0.0")
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 48.dp))
                    InfoRow(Icons.Filled.DataObject, "Source données", "BRVM Open API")
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        title.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = BRVMGreen,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
    )
}

@Composable
private fun SettingsCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.fillMaxWidth(), content = content)
    }
}

@Composable
private fun ToggleSetting(
    label: String,
    subtitle: String,
    icon: ImageVector,
    iconColor: Color,
    checked: Boolean,
    onToggle: (Boolean) -> Unit
) {
    Row(
        Modifier.fillMaxWidth().padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = iconColor, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(
            checked = checked,
            onCheckedChange = onToggle,
            colors = SwitchDefaults.colors(checkedThumbColor = iconColor, checkedTrackColor = iconColor.copy(0.4f))
        )
    }
}

@Composable
private fun SliderSetting(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    steps: Int,
    displayValue: String,
    color: Color,
    onValueChange: (Float) -> Unit
) {
    Column(Modifier.padding(12.dp)) {
        Row {
            Text(label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            Text(displayValue, style = MaterialTheme.typography.labelLarge, color = color, fontWeight = FontWeight.Bold)
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            valueRange = range,
            steps = steps,
            colors = SliderDefaults.colors(thumbColor = color, activeTrackColor = color)
        )
    }
}

@Composable
private fun InfoRow(icon: ImageVector, label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
