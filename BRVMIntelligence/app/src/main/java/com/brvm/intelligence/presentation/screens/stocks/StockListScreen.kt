package com.brvm.intelligence.presentation.screens.stocks

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brvm.intelligence.domain.model.BRVMSector
import com.brvm.intelligence.presentation.components.StockListItem
import com.brvm.intelligence.presentation.theme.BRVMGreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockListScreen(
    onStockClick: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: StockListViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Actions BRVM (${uiState.stocks.size})") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Retour")
                    }
                },
                actions = {
                    var showSortMenu by remember { mutableStateOf(false) }
                    IconButton(onClick = { showSortMenu = true }) {
                        Icon(Icons.Default.Sort, contentDescription = "Trier")
                    }
                    DropdownMenu(
                        expanded = showSortMenu,
                        onDismissRequest = { showSortMenu = false }
                    ) {
                        StockSortOrder.values().forEach { order ->
                            DropdownMenuItem(
                                text = { Text(order.displayName) },
                                onClick = {
                                    viewModel.onSortOrderChange(order)
                                    showSortMenu = false
                                },
                                leadingIcon = {
                                    if (uiState.sortOrder == order) {
                                        Icon(Icons.Default.Check, null, tint = BRVMGreen)
                                    }
                                }
                            )
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Barre de recherche
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::onSearchQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Rechercher une action...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (uiState.searchQuery.isNotEmpty()) {
                        IconButton(onClick = { viewModel.onSearchQueryChange("") }) {
                            Icon(Icons.Default.Clear, contentDescription = "Effacer")
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp)
            )

            // Filtres sectoriels
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    FilterChip(
                        selected = uiState.selectedSector == null,
                        onClick = { viewModel.onSectorSelected(null) },
                        label = { Text("Tous") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = BRVMGreen,
                            selectedLabelColor = androidx.compose.ui.graphics.Color.White
                        )
                    )
                }
                items(BRVMSector.values()) { sector ->
                    FilterChip(
                        selected = uiState.selectedSector == sector,
                        onClick = { viewModel.onSectorSelected(sector) },
                        label = { Text(sector.displayName) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = BRVMGreen,
                            selectedLabelColor = androidx.compose.ui.graphics.Color.White
                        )
                    )
                }
            }

            if (uiState.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = BRVMGreen)
                }
            } else if (uiState.stocks.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "Aucune action trouvée",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 16.dp)
                ) {
                    items(uiState.stocks, key = { it.symbol }) { stock ->
                        StockListItem(
                            stock = stock,
                            onClick = { onStockClick(stock.symbol) }
                        )
                    }
                }
            }
        }
    }
}
