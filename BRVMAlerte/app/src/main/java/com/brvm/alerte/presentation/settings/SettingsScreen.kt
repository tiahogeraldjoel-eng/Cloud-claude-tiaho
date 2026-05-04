package com.brvm.alerte.presentation.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brvm.alerte.presentation.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    var showPasswordField by remember { mutableStateOf(false) }

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
            // ─── CANAUX D'ALERTE ─────────────────────────────────────────────
            item { SectionTitle("Canaux d'alerte") }
            item {
                SettingsCard {
                    ToggleSetting("WhatsApp", "Partage direct via WhatsApp Business", Icons.Filled.Send, BRVMGreen, prefs.whatsappEnabled) { viewModel.setWhatsappEnabled(it) }
                    Divider()
                    ToggleSetting("SMS", "Alertes par SMS (nécessite permission)", Icons.Filled.Sms, Color(0xFF1976D2), prefs.smsEnabled) { viewModel.setSmsEnabled(it) }
                    if (prefs.smsEnabled) {
                        PhoneInput("Numéro de téléphone", prefs.phoneNumber) { viewModel.setPhoneNumber(it) }
                    }
                    Divider()
                    ToggleSetting("Email automatique", "Rapport SMTP sur vos boîtes mail", Icons.Filled.Email, BRVMGold, prefs.emailEnabled) { viewModel.setEmailEnabled(it) }
                    Divider()
                    ToggleSetting("Notifications push", "Firebase Cloud Messaging", Icons.Filled.Notifications, Color(0xFF9C27B0), prefs.pushEnabled) { viewModel.setPushEnabled(it) }
                }
            }

            // ─── CONFIGURATION EMAIL ─────────────────────────────────────────
            if (prefs.emailEnabled) {
                item { SectionTitle("Configuration Email SMTP") }
                item {
                    SettingsCard {
                        TextInput("Email expéditeur (Gmail)", prefs.emailSender, Icons.Filled.AlternateEmail, KeyboardType.Email) { viewModel.setEmailSender(it) }
                        Divider()
                        PasswordInput("Mot de passe app (Gmail App Password)", prefs.emailPassword) { viewModel.setEmailPassword(it) }
                        Divider()
                        TextInput("Destinataires (séparés par virgule)", prefs.emailRecipients, Icons.Filled.People, KeyboardType.Email) { viewModel.setEmailRecipients(it) }
                        Divider()
                        TextInput("Serveur SMTP", prefs.smtpHost.ifEmpty { "smtp.gmail.com" }, Icons.Filled.Dns, KeyboardType.Uri) { viewModel.setSmtpHost(it) }
                        Divider()
                        InfoRow(Icons.Filled.Info, "Comment obtenir un App Password Gmail", "myaccount.google.com → Sécurité → Mots de passe d'application")
                    }
                }
            }

            // ─── SEUILS DE DÉTECTION ─────────────────────────────────────────
            item { SectionTitle("Seuils de détection") }
            item {
                SettingsCard {
                    SliderSetting("Score minimum", prefs.minScore.toFloat(), 30f..90f, 11, "${prefs.minScore}/100", BRVMGreen) { viewModel.setMinScore(it.toInt()) }
                    Divider()
                    SliderSetting("Volume anormal (×moyenne)", prefs.volumeThreshold, 1.5f..5f, 6, "${String.format("%.1f", prefs.volumeThreshold)}x", BRVMGold) { viewModel.setVolumeThreshold(it) }
                }
            }

            // ─── ANALYSE ─────────────────────────────────────────────────────
            item { SectionTitle("Analyse proactive") }
            item {
                SettingsCard {
                    ToggleSetting("Scan automatique", "Analyse toutes les heures en session BRVM (9h–15h)", Icons.Filled.AutoMode, BRVMGreen, prefs.autoScanEnabled) { viewModel.setAutoScanEnabled(it) }
                    Divider()
                    ToggleSetting("Signaux pré-résultats", "Alerte J-5 avant les publications de résultats", Icons.Filled.Upcoming, BRVMGold, prefs.preEarningsEnabled) { viewModel.setPreEarningsEnabled(it) }
                    Divider()
                    ToggleSetting("Ex-date dividende", "Alerte J-3 avant l'ex-date pour se positionner", Icons.Filled.Payments, BRVMGreenLight, prefs.dividendAlertEnabled) { viewModel.setDividendAlertEnabled(it) }
                }
            }

            // ─── DONNÉES ─────────────────────────────────────────────────────
            item { SectionTitle("Données & Sources") }
            item {
                SettingsCard {
                    InfoRow(Icons.Filled.CloudSync, "Source primaire", "openapi.brvm.org")
                    Divider()
                    InfoRow(Icons.Filled.Web, "Source secondaire (scraper)", "brvm.org")
                    Divider()
                    InfoRow(Icons.Filled.Storage, "Source tertiaire (seed)", "47 titres BRVM intégrés")
                    Divider()
                    InfoRow(Icons.Filled.History, "Historique conservé", "365 jours (1 an)")
                    Divider()
                    InfoRow(Icons.Filled.Timer, "Fréquence d'analyse", "Toutes les heures")
                    Divider()
                    InfoRow(Icons.Filled.Info, "Version application", "2.0.0")
                }
            }

            // ─── PSYCHOLOGIE DU MARCHÉ ───────────────────────────────────────
            item { SectionTitle("Contexte BRVM") }
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Psychologie de l'investisseur BRVM", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        listOf(
                            "📊 Les mauvais résultats sont sévèrement punis (−5% à −15%)",
                            "🎯 Les bonnes surprises déclenchent des ruées (+8% à +20%)",
                            "💰 Le dividende est le premier critère de sélection",
                            "📅 Les positions pré-résultats sont très rentables",
                            "🔍 Les anomalies de volume précèdent souvent les annonces",
                            "🏦 L'investisseur-salarié BRVM réagit aux médias locaux"
                        ).forEach {
                            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(title.uppercase(), style = MaterialTheme.typography.labelMedium, color = BRVMGreen, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
}

@Composable
private fun SettingsCard(content: @Composable ColumnScope.() -> Unit) {
    Card(shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(modifier = Modifier.fillMaxWidth(), content = content)
    }
}

@Composable
private fun Divider() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 48.dp))
}

@Composable
private fun ToggleSetting(label: String, subtitle: String, icon: ImageVector, iconColor: Color, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = iconColor, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onToggle, colors = SwitchDefaults.colors(checkedThumbColor = iconColor, checkedTrackColor = iconColor.copy(0.4f)))
    }
}

@Composable
private fun TextInput(label: String, value: String, icon: ImageVector, keyboardType: KeyboardType = KeyboardType.Text, onValueChange: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = BRVMGreen, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label, style = MaterialTheme.typography.labelSmall) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = BRVMGreen)
        )
    }
}

@Composable
private fun PhoneInput(label: String, value: String, onValueChange: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Phone, null, tint = Color(0xFF1976D2), modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label, style = MaterialTheme.typography.labelSmall) },
            placeholder = { Text("+225 0700000000") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Color(0xFF1976D2))
        )
    }
}

@Composable
private fun PasswordInput(label: String, value: String, onValueChange: (String) -> Unit) {
    var visible by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Lock, null, tint = BRVMGold, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label, style = MaterialTheme.typography.labelSmall) },
            singleLine = true,
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { visible = !visible }) {
                    Icon(if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, null)
                }
            },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = BRVMGold)
        )
    }
}

@Composable
private fun SliderSetting(label: String, value: Float, range: ClosedFloatingPointRange<Float>, steps: Int, displayValue: String, color: Color, onValueChange: (Float) -> Unit) {
    Column(Modifier.padding(12.dp)) {
        Row {
            Text(label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            Text(displayValue, style = MaterialTheme.typography.labelLarge, color = color, fontWeight = FontWeight.Bold)
        }
        Slider(value = value, onValueChange = onValueChange, valueRange = range, steps = steps, colors = SliderDefaults.colors(thumbColor = color, activeTrackColor = color))
    }
}

@Composable
private fun InfoRow(icon: ImageVector, label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
