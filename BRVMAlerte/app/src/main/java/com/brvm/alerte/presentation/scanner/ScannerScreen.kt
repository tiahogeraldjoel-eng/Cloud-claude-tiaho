package com.brvm.alerte.presentation.scanner

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.brvm.alerte.domain.model.AlertPriority
import com.brvm.alerte.presentation.navigation.navigateToChart
import com.brvm.alerte.presentation.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScannerScreen(
    navController: NavController,
    viewModel: ScannerViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var searchActive by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("Scanner BRVM", fontWeight = FontWeight.Bold) },
                    actions = {
                        IconButton(onClick = { viewModel.refresh() }) {
                            Icon(Icons.Filled.Refresh, "Actualiser")
                        }
                        IconButton(onClick = { searchActive = !searchActive }) {
                            Icon(if (searchActive) Icons.Filled.Close else Icons.Filled.Search, "Rechercher")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
                )
                if (searchActive) {
                    SearchBar(state.searchQuery) { viewModel.setSearchQuery(it) }
                }
                FilterChips(state.filter) { viewModel.setFilter(it) }
            }
        }
    ) { padding ->
        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = BRVMGreen)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    Text(
                        "${state.items.size} titre(s)",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                }
                items(state.items, key = { it.stock.ticker }) { item ->
                    ScannerItemCard(
                        item = item,
                        onToggleWatchlist = { viewModel.toggleWatchlist(item.stock.ticker) },
                        onOpenChart = { navigateToChart(navController, item.stock.ticker) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchBar(query: String, onQueryChange: (String) -> Unit) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        placeholder = { Text("Rechercher un titre (ex: SGBCI, ONTBF…)") },
        leadingIcon = { Icon(Icons.Filled.Search, null) },
        trailingIcon = if (query.isNotEmpty()) ({
            IconButton(onClick = { onQueryChange("") }) { Icon(Icons.Filled.Clear, null) }
        }) else null,
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = BRVMGreen,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline
        )
    )
}

@Composable
private fun FilterChips(current: ScannerFilter, onSelect: (ScannerFilter) -> Unit) {
    val filters = listOf(
        ScannerFilter.ALL to "Tous",
        ScannerFilter.HIGH_SCORE to "Score >65",
        ScannerFilter.VOLUME_ANOMALY to "Vol. Anormal",
        ScannerFilter.DIVIDEND to "Dividende",
        ScannerFilter.OVERSOLD to "Survendu",
        ScannerFilter.WATCHLIST to "Ma Liste"
    )
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(filters) { (filter, label) ->
            FilterChip(
                selected = current == filter,
                onClick = { onSelect(filter) },
                label = { Text(label, style = MaterialTheme.typography.labelMedium) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = BRVMGreen,
                    selectedLabelColor = Color.White
                )
            )
        }
    }
}

@Composable
private fun ScannerItemCard(item: ScannerItem, onToggleWatchlist: () -> Unit, onOpenChart: () -> Unit) {
    val stock = item.stock
    val result = item.result
    val priorityColor = when (result.priority) {
        AlertPriority.URGENT -> BRVMRed
        AlertPriority.STRONG -> BRVMGold
        AlertPriority.MODERATE -> Color(0xFF4FC3F7)
        AlertPriority.INFO -> Color(0xFF8B949E)
    }
    val changeColor = if (stock.changePercent >= 0) BRVMGreenLight else BRVMRedLight

    Card(
        modifier = Modifier.fillMaxWidth().clickable { onOpenChart() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stock.ticker, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
                        Spacer(Modifier.width(6.dp))
                        if (stock.isVolumeAnomaly) {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = BRVMGold.copy(0.2f)
                            ) {
                                Text(
                                    "VOL ${String.format("%.1f", stock.volumeRatio)}x",
                                    Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = BRVMGold,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                    Text(
                        stock.name,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "${String.format("%.0f", stock.lastPrice)} F",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "${String.format("%+.2f", stock.changePercent)}%",
                        style = MaterialTheme.typography.labelLarge,
                        color = changeColor,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ScoreBar(result.totalScore, priorityColor)
                Spacer(Modifier.weight(1f))
                Text(
                    "Score ${result.totalScore}/100",
                    style = MaterialTheme.typography.labelMedium,
                    color = priorityColor,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(Modifier.width(8.dp))
                IconButton(onClick = onToggleWatchlist, modifier = Modifier.size(24.dp)) {
                    Icon(
                        if (item.isWatchlisted) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                        null,
                        tint = if (item.isWatchlisted) BRVMGold else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            result.signals.firstOrNull()?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, style = MaterialTheme.typography.labelSmall, color = priorityColor, maxLines = 1)
            }
        }
    }
}

@Composable
private fun ScoreBar(score: Int, color: Color) {
    Box(
        Modifier
            .width(120.dp)
            .height(6.dp)
            .background(MaterialTheme.colorScheme.outline, RoundedCornerShape(3.dp))
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(score / 100f)
                .background(color, RoundedCornerShape(3.dp))
        )
    }
}
