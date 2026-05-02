package com.brvm.alerte.presentation.alerts

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.brvm.alerte.domain.model.Alert
import com.brvm.alerte.domain.model.AlertPriority
import com.brvm.alerte.domain.model.Recommendation
import com.brvm.alerte.presentation.theme.*
import com.brvm.alerte.util.ShareHelper
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlertsScreen(
    navController: NavController,
    viewModel: AlertsViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Alertes", fontWeight = FontWeight.Bold)
                        if (state.unreadCount > 0) {
                            Spacer(Modifier.width(8.dp))
                            Badge { Text("${state.unreadCount}") }
                        }
                    }
                },
                actions = {
                    if (state.unreadCount > 0) {
                        TextButton(onClick = { viewModel.markAllAsRead() }) {
                            Text("Tout lire", color = BRVMGreen)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        if (state.alerts.isEmpty()) {
            Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.NotificationsNone, null, Modifier.size(64.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    Text("Aucune alerte", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Le scanner détectera automatiquement les opportunités",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(state.alerts, key = { it.id }) { alert ->
                    AlertCard(
                        alert = alert,
                        onRead = { viewModel.markAsRead(alert.id) },
                        onShareWhatsApp = {
                            ShareHelper.shareToWhatsApp(context, alert.message)
                            viewModel.markAsRead(alert.id)
                        },
                        onShareSMS = {
                            ShareHelper.shareToSMS(context, alert.message)
                            viewModel.markAsRead(alert.id)
                        },
                        onShareEmail = {
                            ShareHelper.shareToEmail(context, alert.title, alert.message)
                            viewModel.markAsRead(alert.id)
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AlertCard(
    alert: Alert,
    onRead: () -> Unit,
    onShareWhatsApp: () -> Unit,
    onShareSMS: () -> Unit,
    onShareEmail: () -> Unit
) {
    val priorityColor = when (alert.priority) {
        AlertPriority.URGENT -> BRVMRed
        AlertPriority.STRONG -> BRVMGold
        AlertPriority.MODERATE -> Color(0xFF4FC3F7)
        AlertPriority.INFO -> Color(0xFF8B949E)
    }
    val recColor = when (alert.recommendation) {
        Recommendation.STRONG_BUY, Recommendation.BUY -> BRVMGreenLight
        Recommendation.STRONG_SELL, Recommendation.SELL -> BRVMRedLight
        Recommendation.HOLD -> Color(0xFFFFB74D)
    }
    val recLabel = when (alert.recommendation) {
        Recommendation.STRONG_BUY -> "ACHAT FORT"
        Recommendation.BUY -> "ACHAT"
        Recommendation.HOLD -> "CONSERVER"
        Recommendation.SELL -> "VENTE"
        Recommendation.STRONG_SELL -> "VENTE FORTE"
    }

    var expanded by remember { mutableStateOf(false) }
    val dateStr = remember(alert.createdAt) {
        SimpleDateFormat("dd/MM HH:mm", Locale.FRANCE).format(Date(alert.createdAt * 1000))
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                expanded = !expanded
                if (!alert.isRead) onRead()
            },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (!alert.isRead)
                MaterialTheme.colorScheme.surfaceVariant
            else MaterialTheme.colorScheme.surface
        ),
        border = if (!alert.isRead) BorderStroke(1.dp, priorityColor.copy(0.5f)) else null
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            alert.title,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = if (!alert.isRead) FontWeight.ExtraBold else FontWeight.Normal,
                            maxLines = 1,
                            color = if (!alert.isRead) MaterialTheme.colorScheme.onSurface
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(dateStr, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(8.dp))
                        Surface(shape = RoundedCornerShape(4.dp), color = recColor.copy(0.15f)) {
                            Text(
                                recLabel,
                                Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = recColor,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "${String.format("%.0f", alert.currentPrice)} F",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        "${alert.score}/100",
                        style = MaterialTheme.typography.labelSmall,
                        color = priorityColor
                    )
                }
            }

            if (expanded) {
                Spacer(Modifier.height(10.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                Spacer(Modifier.height(8.dp))
                Text(
                    alert.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (alert.targetPrice != null) {
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Flag, null, Modifier.size(14.dp), tint = BRVMGold)
                        Spacer(Modifier.width(4.dp))
                        Text(
                            "Objectif: ${String.format("%.0f", alert.targetPrice)} FCFA",
                            style = MaterialTheme.typography.labelMedium,
                            color = BRVMGold,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                ShareRow(onShareWhatsApp, onShareSMS, onShareEmail)
            }
        }
    }
}

@Composable
private fun ShareRow(onWhatsApp: () -> Unit, onSMS: () -> Unit, onEmail: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ShareButton("WhatsApp", BRVMGreen, Icons.Filled.Send, onWhatsApp)
        ShareButton("SMS", Color(0xFF1976D2), Icons.Filled.Sms, onSMS)
        ShareButton("Email", BRVMGold, Icons.Filled.Email, onEmail)
    }
}

@Composable
private fun ShareButton(
    label: String,
    color: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
        border = BorderStroke(1.dp, color),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color)
    ) {
        Icon(icon, null, Modifier.size(14.dp))
        Spacer(Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}
