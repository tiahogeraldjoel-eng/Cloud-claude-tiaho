package com.brvm.alerte.presentation.dashboard

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.brvm.alerte.domain.model.Alert
import com.brvm.alerte.domain.model.AlertPriority
import com.brvm.alerte.domain.model.MarketSentiment
import com.brvm.alerte.domain.model.Stock
import com.brvm.alerte.domain.usecase.ScoreStockUseCase
import com.brvm.alerte.presentation.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    navController: NavController,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { viewModel.refresh() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("BRVM", fontWeight = FontWeight.ExtraBold, color = BRVMGreen)
                        Text(" Alerte", fontWeight = FontWeight.Light)
                    }
                },
                actions = {
                    if (state.unreadCount > 0) {
                        BadgedBox(badge = { Badge { Text("${state.unreadCount}") } }) {
                            Icon(Icons.Filled.Notifications, "Alertes")
                        }
                        Spacer(Modifier.width(8.dp))
                    }
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Filled.Refresh, "Actualiser")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        if (state.isLoading && state.topOpportunities.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = BRVMGreen)
                    Spacer(Modifier.height(16.dp))
                    Text("Analyse du marché BRVM en cours…", style = MaterialTheme.typography.bodyMedium)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                state.sentiment?.let { sentiment ->
                    item { SentimentCard(sentiment) }
                }

                if (state.topOpportunities.isNotEmpty()) {
                    item {
                        SectionHeader(
                            title = "Top Opportunités",
                            subtitle = "${state.topOpportunities.size} titre(s) détecté(s)",
                            icon = Icons.Filled.TrendingUp
                        )
                    }
                    items(state.topOpportunities, key = { it.first.ticker }) { (stock, result) ->
                        OpportunityCard(stock, result)
                    }
                }

                if (state.recentAlerts.isNotEmpty()) {
                    item {
                        SectionHeader(
                            title = "Alertes Récentes",
                            subtitle = "${state.unreadCount} non lue(s)",
                            icon = Icons.Filled.NotificationsActive
                        )
                    }
                    items(state.recentAlerts, key = { it.id }) { alert ->
                        AlertSummaryCard(alert)
                    }
                }

                if (state.topOpportunities.isEmpty() && !state.isLoading) {
                    item {
                        EmptyStateCard(
                            message = "Aucune opportunité significative détectée.",
                            subtitle = "Le scanner surveille ${0} titres en temps réel."
                        )
                    }
                }

                state.error?.let { error ->
                    item { ErrorCard(error) }
                }
            }
        }
    }
}

@Composable
private fun SentimentCard(sentiment: MarketSentiment) {
    val (gradientStart, gradientEnd) = when (sentiment.label) {
        MarketSentiment.SentimentLabel.EXTREME_FEAR -> BRVMRed to Color(0xFF7B0000)
        MarketSentiment.SentimentLabel.FEAR -> BRVMRedLight to Color(0xFFB71C1C)
        MarketSentiment.SentimentLabel.NEUTRAL -> Color(0xFF455A64) to Color(0xFF263238)
        MarketSentiment.SentimentLabel.GREED -> BRVMGreenLight to Color(0xFF1B5E20)
        MarketSentiment.SentimentLabel.EXTREME_GREED -> BRVMGold to Color(0xFFE65100)
    }
    val sentimentLabel = when (sentiment.label) {
        MarketSentiment.SentimentLabel.EXTREME_FEAR -> "Peur Extrême"
        MarketSentiment.SentimentLabel.FEAR -> "Peur"
        MarketSentiment.SentimentLabel.NEUTRAL -> "Neutre"
        MarketSentiment.SentimentLabel.GREED -> "Avidité"
        MarketSentiment.SentimentLabel.EXTREME_GREED -> "Avidité Extrême"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.horizontalGradient(listOf(gradientStart, gradientEnd)))
                .padding(16.dp)
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Psychologie du Marché",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        "${sentiment.fearGreedIndex}/100",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                }
                Text(
                    sentimentLabel.uppercase(),
                    style = MaterialTheme.typography.labelLarge,
                    color = Color.White.copy(alpha = 0.9f),
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(12.dp))
                LinearProgressIndicator(
                    progress = { sentiment.fearGreedIndex / 100f },
                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(CircleShape),
                    color = Color.White,
                    trackColor = Color.White.copy(alpha = 0.3f)
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    SentimentStat("↑ Hausse", "${sentiment.advancingStocks}", BRVMGreenLight)
                    SentimentStat("→ Stable", "${sentiment.unchangedStocks}", Color.White)
                    SentimentStat("↓ Baisse", "${sentiment.decliningStocks}", BRVMRedLight)
                }
            }
        }
    }
}

@Composable
private fun SentimentStat(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(0.7f))
    }
}

@Composable
private fun OpportunityCard(
    stock: Stock,
    result: ScoreStockUseCase.ScoringResult
) {
    val priorityColor = when (result.priority) {
        AlertPriority.URGENT -> BRVMRed
        AlertPriority.STRONG -> BRVMGold
        AlertPriority.MODERATE -> Color(0xFF4FC3F7)
        AlertPriority.INFO -> Color(0xFF8B949E)
    }
    val changeColor = if (stock.changePercent >= 0) BRVMGreenLight else BRVMRedLight

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(1.dp, priorityColor.copy(alpha = 0.6f))
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(priorityColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "${result.totalScore}",
                    style = MaterialTheme.typography.titleLarge,
                    color = priorityColor,
                    fontWeight = FontWeight.ExtraBold
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stock.ticker, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(8.dp))
                    PriorityBadge(result.priority, priorityColor)
                }
                Text(
                    stock.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
                result.signals.firstOrNull()?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = priorityColor, maxLines = 1)
                }
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${String.format("%.0f", stock.lastPrice)} F",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    "${String.format("%+.2f", stock.changePercent)}%",
                    style = MaterialTheme.typography.labelLarge,
                    color = changeColor,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun PriorityBadge(priority: AlertPriority, color: Color) {
    Surface(
        shape = RoundedCornerShape(4.dp),
        color = color.copy(alpha = 0.2f)
    ) {
        Text(
            "${priority.emoji} ${priority.label}",
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun AlertSummaryCard(alert: Alert) {
    val priorityColor = when (alert.priority) {
        AlertPriority.URGENT -> BRVMRed
        AlertPriority.STRONG -> BRVMGold
        AlertPriority.MODERATE -> Color(0xFF4FC3F7)
        AlertPriority.INFO -> Color(0xFF8B949E)
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(8.dp).clip(CircleShape).background(priorityColor)
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(alert.title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(
                    "${String.format("%.0f", alert.currentPrice)} FCFA",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                "Score ${alert.score}",
                style = MaterialTheme.typography.labelSmall,
                color = priorityColor
            )
        }
    }
}

@Composable
private fun SectionHeader(title: String, subtitle: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
        Icon(icon, contentDescription = null, tint = BRVMGreen, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun EmptyStateCard(message: String, subtitle: String) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.SearchOff, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Text(message, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ErrorCard(error: String) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = BRVMRed.copy(alpha = 0.15f)),
        border = BorderStroke(1.dp, BRVMRed.copy(alpha = 0.4f))
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Warning, null, tint = BRVMRed, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(error, style = MaterialTheme.typography.bodyMedium, color = BRVMRed)
        }
    }
}
