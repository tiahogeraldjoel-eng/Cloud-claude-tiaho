package com.brvm.intelligence.presentation.screens.dashboard

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.presentation.components.MarketIndexCard
import com.brvm.intelligence.presentation.components.StockListItem
import com.brvm.intelligence.presentation.components.FearGreedGauge
import com.brvm.intelligence.presentation.theme.*
import com.brvm.intelligence.utils.NumberFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onStockClick: (String) -> Unit,
    onSeeAllStocks: () -> Unit,
    onChatClick: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            DashboardTopBar(onChatClick = onChatClick)
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onChatClick,
                containerColor = BRVMGreen,
                contentColor = Color.White
            ) {
                Icon(Icons.Default.SmartToy, contentDescription = "Assistant IA")
            }
        }
    ) { paddingValues ->
        if (uiState.isLoading && uiState.marketSummary == null) {
            DashboardLoadingState(modifier = Modifier.padding(paddingValues))
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentPadding = PaddingValues(bottom = 80.dp)
            ) {
                // Bannière avertissement réglementaire
                item {
                    DisclaimerBanner()
                }

                // Indices BRVM
                item {
                    uiState.marketSummary?.let { summary ->
                        IndicesSection(
                            composite = summary.brvmComposite,
                            brvm10 = summary.brvmTen,
                            marketStatus = summary.marketStatus
                        )
                    }
                }

                // Fear & Greed Index
                item {
                    FearGreedSection(
                        index = uiState.fearGreedIndex,
                        level = uiState.fearGreedLabel
                    )
                }

                // Top Gainers
                uiState.marketSummary?.let { summary ->
                    if (summary.topGainers.isNotEmpty()) {
                        item {
                            SectionHeader(title = "Meilleures Hausses", onSeeAll = onSeeAllStocks)
                        }
                        items(summary.topGainers.take(3)) { stock ->
                            StockListItem(
                                stock = stock,
                                onClick = { onStockClick(stock.symbol) }
                            )
                        }
                    }

                    // Top Losers
                    if (summary.topLosers.isNotEmpty()) {
                        item {
                            SectionHeader(title = "Plus Fortes Baisses", onSeeAll = onSeeAllStocks)
                        }
                        items(summary.topLosers.take(3)) { stock ->
                            StockListItem(
                                stock = stock,
                                onClick = { onStockClick(stock.symbol) }
                            )
                        }
                    }
                }

                // Événements à venir
                if (uiState.upcomingEvents.isNotEmpty()) {
                    item {
                        SectionHeader(title = "Événements BRVM", onSeeAll = {})
                    }
                    items(uiState.upcomingEvents.take(3)) { event ->
                        MarketEventItem(event = event)
                    }
                }

                // Erreur si présente
                uiState.error?.let { error ->
                    item {
                        ErrorBanner(message = error, onRetry = viewModel::refresh)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DashboardTopBar(onChatClick: () -> Unit) {
    TopAppBar(
        title = {
            Column {
                Text(
                    "BRVM Intelligence",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = BRVMGreen
                )
                Text(
                    "Tableau de bord",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        actions = {
            IconButton(onClick = onChatClick) {
                Icon(Icons.Default.Psychology, contentDescription = "Assistant IA", tint = BRVMGreen)
            }
            IconButton(onClick = {}) {
                Icon(Icons.Default.Notifications, contentDescription = "Alertes")
            }
        }
    )
}

@Composable
private fun DisclaimerBanner() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = BRVMGold.copy(alpha = 0.15f)
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Info,
                contentDescription = null,
                tint = BRVMGold,
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                "Information à titre indicatif uniquement. Non conseil financier réglementé AMF-UMOA.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
            )
        }
    }
}

@Composable
private fun IndicesSection(
    composite: MarketIndex,
    brvm10: MarketIndex,
    marketStatus: MarketStatus
) {
    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(bottom = 8.dp)
        ) {
            Text(
                "Indices BRVM",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.width(8.dp))
            MarketStatusChip(status = marketStatus)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            MarketIndexCard(index = composite, modifier = Modifier.weight(1f))
            MarketIndexCard(index = brvm10, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun MarketStatusChip(status: MarketStatus) {
    val color = when (status) {
        MarketStatus.OPEN -> BRVMGreen
        MarketStatus.CLOSED -> BRVMRed.copy(alpha = 0.7f)
        MarketStatus.PRE_OPENING -> BRVMGold
        else -> BRVMGold
    }
    Surface(
        color = color.copy(alpha = 0.15f),
        shape = RoundedCornerShape(12.dp)
    ) {
        Text(
            text = status.displayName,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun FearGreedSection(index: Int, level: FearGreedLevel) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "Indice Fear & Greed BRVM",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            FearGreedGauge(value = index)
            Spacer(Modifier.height(8.dp))
            Text(
                level.displayName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = getFearGreedColor(index)
            )
            Spacer(Modifier.height(4.dp))
            Text(
                level.description,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun getFearGreedColor(index: Int): Color = when {
    index <= 20 -> BRVMRed
    index <= 40 -> BRVMOrange
    index <= 60 -> BRVMGold
    index <= 80 -> BRVMGreenLight
    else -> BRVMGreen
}

@Composable
private fun SectionHeader(title: String, onSeeAll: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        TextButton(onClick = onSeeAll) {
            Text("Voir tout", color = BRVMGreen)
        }
    }
}

@Composable
private fun MarketEventItem(event: MarketEvent) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.width(48.dp)
            ) {
                Text(
                    event.date.dayOfMonth.toString(),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = BRVMGreen
                )
                Text(
                    event.date.month.name.take(3),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    event.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    event.type.displayName,
                    style = MaterialTheme.typography.labelMedium,
                    color = BRVMGreen
                )
            }
        }
    }
}

@Composable
private fun ErrorBanner(message: String, onRetry: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        colors = CardDefaults.cardColors(containerColor = BRVMRed.copy(alpha = 0.1f))
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Error, contentDescription = null, tint = BRVMRed)
            Spacer(Modifier.width(8.dp))
            Text(
                message,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodySmall,
                color = BRVMRed
            )
            TextButton(onClick = onRetry) {
                Text("Réessayer", color = BRVMRed)
            }
        }
    }
}

@Composable
private fun DashboardLoadingState(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = BRVMGreen)
            Spacer(Modifier.height(16.dp))
            Text(
                "Chargement des données BRVM...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
