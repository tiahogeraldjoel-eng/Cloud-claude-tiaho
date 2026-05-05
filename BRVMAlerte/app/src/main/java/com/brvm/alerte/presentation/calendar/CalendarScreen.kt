package com.brvm.alerte.presentation.calendar

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.brvm.alerte.domain.model.EarningsEvent
import com.brvm.alerte.presentation.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(
    navController: NavController,
    viewModel: CalendarViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Calendrier BRVM", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (state.upcomingEvents.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Filled.CalendarToday, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(12.dp))
                            Text("Aucun événement à venir", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            } else {
                item {
                    Text(
                        "Événements à venir — ${state.upcomingEvents.size}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                items(state.upcomingEvents, key = { it.id }) { event ->
                    EarningsEventCard(event)
                }
            }
        }
    }
}

@Composable
private fun EarningsEventCard(event: EarningsEvent) {
    val (typeColor, typeIcon, typeLabel) = when (event.eventType) {
        EarningsEvent.EventType.ANNUAL_RESULTS -> Triple(BRVMGreen, Icons.Filled.BarChart, "Résultats Annuels")
        EarningsEvent.EventType.SEMI_ANNUAL_RESULTS -> Triple(BRVMGreenLight, Icons.Filled.ShowChart, "Résultats S1")
        EarningsEvent.EventType.DIVIDEND_ANNOUNCEMENT -> Triple(BRVMGold, Icons.Filled.Payments, "Dividende")
        EarningsEvent.EventType.AGO -> Triple(Color(0xFF4FC3F7), Icons.Filled.Groups, "AGO")
        EarningsEvent.EventType.AGE -> Triple(Color(0xFF9C27B0), Icons.Filled.GroupWork, "AGE")
        EarningsEvent.EventType.BOARD_MEETING -> Triple(Color(0xFF607D8B), Icons.Filled.MeetingRoom, "Conseil d'Admin")
        else -> Triple(MaterialTheme.colorScheme.primary, Icons.Filled.Event, "Événement")
    }

    val daysUntil = ((event.eventDate - System.currentTimeMillis() / 1000) / 86400).toInt()
    val urgencyColor = when {
        daysUntil <= 3 -> BRVMRed
        daysUntil <= 7 -> BRVMGold
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = typeColor.copy(alpha = 0.15f),
                modifier = Modifier.size(48.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(typeIcon, null, tint = typeColor, modifier = Modifier.size(24.dp))
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(event.ticker, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
                Text(event.stockName, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(shape = RoundedCornerShape(4.dp), color = typeColor.copy(0.1f)) {
                        Text(
                            typeLabel,
                            Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = typeColor
                        )
                    }
                    Spacer(Modifier.width(6.dp))
                    if (event.dividendAmount != null) {
                        Text(
                            "÷ ${String.format("%.0f", event.dividendAmount)} FCFA",
                            style = MaterialTheme.typography.labelSmall,
                            color = BRVMGold
                        )
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    SimpleDateFormat("dd/MM/yy", Locale.FRANCE).format(Date(event.eventDate * 1000)),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    when {
                        daysUntil <= 0 -> "Aujourd'hui"
                        daysUntil == 1 -> "Demain"
                        else -> "J-$daysUntil"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = urgencyColor,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
