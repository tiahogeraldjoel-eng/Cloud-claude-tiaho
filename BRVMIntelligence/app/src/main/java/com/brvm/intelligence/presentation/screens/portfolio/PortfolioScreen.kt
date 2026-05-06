package com.brvm.intelligence.presentation.screens.portfolio

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.presentation.theme.*
import com.brvm.intelligence.utils.NumberFormatter
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortfolioScreen(
    onStockClick: (String) -> Unit,
    viewModel: PortfolioViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Mon Portefeuille", fontWeight = FontWeight.Bold) })
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = viewModel::toggleAddDialog,
                containerColor = BRVMGreen
            ) {
                Icon(Icons.Default.Add, contentDescription = "Ajouter position", tint = Color.White)
            }
        }
    ) { paddingValues ->
        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize().padding(paddingValues), Alignment.Center) {
                CircularProgressIndicator(color = BRVMGreen)
            }
            return@Scaffold
        }

        val portfolio = uiState.portfolio
        if (portfolio == null || portfolio.positions.isEmpty()) {
            EmptyPortfolioState(
                modifier = Modifier.padding(paddingValues),
                onAddClick = viewModel::toggleAddDialog
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
                contentPadding = PaddingValues(bottom = 80.dp)
            ) {
                item { PortfolioSummaryCard(portfolio = portfolio) }
                item { SectorAllocationCard(portfolio = portfolio) }
                item { PortfolioMetricsCard(metrics = portfolio.metrics) }
                item {
                    Text(
                        "Mes Positions (${portfolio.positions.size})",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
                items(portfolio.positions, key = { it.id }) { position ->
                    PositionCard(
                        position = position,
                        onClick = { onStockClick(position.symbol) },
                        onDelete = { viewModel.deletePosition(position.id) }
                    )
                }
                uiState.analysis?.let { analysis ->
                    if (analysis.riskWarnings.isNotEmpty()) {
                        item { RiskWarningsCard(warnings = analysis.riskWarnings) }
                    }
                }
            }
        }

        if (uiState.showAddDialog) {
            AddPositionDialog(
                onDismiss = viewModel::toggleAddDialog,
                onConfirm = { symbol, name, qty, price, date, sector ->
                    viewModel.addPosition(symbol, name, qty, price, date, sector)
                }
            )
        }
    }
}

@Composable
private fun PortfolioSummaryCard(portfolio: Portfolio) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = BRVMGreen),
        elevation = CardDefaults.cardElevation(6.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Valeur Totale", style = MaterialTheme.typography.labelLarge, color = Color.White.copy(alpha = 0.8f))
            Text(
                NumberFormatter.formatPrice(portfolio.totalValue),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Text("FCFA", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.7f))
            Spacer(Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                PortfolioStatItem(
                    label = "Gain/Perte",
                    value = "${if (portfolio.totalGain >= 0) "+" else ""}${NumberFormatter.formatPrice(portfolio.totalGain)}",
                    color = if (portfolio.totalGain >= 0) BRVMGoldLight else BRVMRedLight
                )
                PortfolioStatItem(
                    label = "Performance",
                    value = "${if (portfolio.totalGainPercent >= 0) "+" else ""}${String.format("%.2f", portfolio.totalGainPercent)}%",
                    color = if (portfolio.totalGainPercent >= 0) BRVMGoldLight else BRVMRedLight
                )
                PortfolioStatItem(
                    label = "Positions",
                    value = "${portfolio.positions.size}",
                    color = Color.White
                )
            }
        }
    }
}

@Composable
private fun PortfolioStatItem(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
    }
}

@Composable
private fun PortfolioMetricsCard(metrics: PortfolioMetrics) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Métriques de Risque", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                MetricItem("Sharpe Ratio", String.format("%.2f", metrics.sharpeRatio), Modifier.weight(1f))
                MetricItem("Beta", String.format("%.2f", metrics.beta), Modifier.weight(1f))
                MetricItem("VaR 95%", NumberFormatter.formatPrice(metrics.var95), Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Diversification : ", style = MaterialTheme.typography.bodySmall)
                LinearProgressIndicator(
                    progress = { metrics.diversificationScore / 100f },
                    modifier = Modifier.weight(1f).height(8.dp),
                    color = when {
                        metrics.diversificationScore >= 70 -> BRVMGreen
                        metrics.diversificationScore >= 40 -> BRVMGold
                        else -> BRVMRed
                    },
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
                Spacer(Modifier.width(8.dp))
                Text("${metrics.diversificationScore}/100", style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun MetricItem(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SectorAllocationCard(portfolio: Portfolio) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Allocation Sectorielle", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            portfolio.sectorAllocation.forEach { (sector, percent) ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        sector.displayName,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.width(100.dp)
                    )
                    LinearProgressIndicator(
                        progress = { (percent / 100).toFloat() },
                        modifier = Modifier.weight(1f).height(6.dp),
                        color = BRVMGreen,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "${String.format("%.1f", percent)}%",
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.width(40.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun PositionCard(
    position: PortfolioPosition,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    var showDeleteDialog by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(position.symbol, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(position.stockName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "${position.quantity} titres × ${NumberFormatter.formatPrice(position.purchasePrice)}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    NumberFormatter.formatPrice(position.currentValue),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "${if (position.percentGain >= 0) "+" else ""}${String.format("%.2f", position.percentGain)}%",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (position.isProfit) BRVMGreen else BRVMRed,
                    fontWeight = FontWeight.Medium
                )
            }
            IconButton(onClick = { showDeleteDialog = true }) {
                Icon(Icons.Default.Delete, contentDescription = "Supprimer", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Supprimer la position") },
            text = { Text("Supprimer ${position.symbol} (${position.quantity} titres) ?") },
            confirmButton = {
                TextButton(onClick = { onDelete(); showDeleteDialog = false }) {
                    Text("Supprimer", color = BRVMRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Annuler") }
            }
        )
    }
}

@Composable
private fun RiskWarningsCard(warnings: List<String>) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = BRVMGold.copy(alpha = 0.1f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Warning, null, tint = BRVMGold, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Alertes Risque", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            warnings.forEach { warning ->
                Text(warning, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 2.dp))
            }
        }
    }
}

@Composable
private fun EmptyPortfolioState(modifier: Modifier = Modifier, onAddClick: () -> Unit) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            Icon(
                Icons.Default.AccountBalance,
                contentDescription = null,
                modifier = Modifier.size(80.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
            )
            Spacer(Modifier.height(16.dp))
            Text(
                "Votre portefeuille est vide",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                "Ajoutez vos premières positions BRVM pour suivre votre investissement.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp)
            )
            Spacer(Modifier.height(24.dp))
            Button(onClick = onAddClick, colors = ButtonDefaults.buttonColors(containerColor = BRVMGreen)) {
                Icon(Icons.Default.Add, null)
                Spacer(Modifier.width(8.dp))
                Text("Ajouter une position")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddPositionDialog(
    onDismiss: () -> Unit,
    onConfirm: (String, String, Int, Double, LocalDate, BRVMSector) -> Unit
) {
    var symbol by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var selectedSector by remember { mutableStateOf(BRVMSector.FINANCE) }
    var sectorExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ajouter une Position") },
        text = {
            Column {
                OutlinedTextField(
                    value = symbol,
                    onValueChange = { symbol = it.uppercase() },
                    label = { Text("Symbole (ex: SONR-CI)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nom de l'action") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { quantity = it.filter { c -> c.isDigit() } },
                        label = { Text("Quantité") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = price,
                        onValueChange = { price = it },
                        label = { Text("Prix (FCFA)") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }
                Spacer(Modifier.height(8.dp))
                ExposedDropdownMenuBox(
                    expanded = sectorExpanded,
                    onExpandedChange = { sectorExpanded = it }
                ) {
                    OutlinedTextField(
                        value = selectedSector.displayName,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Secteur") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = sectorExpanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = sectorExpanded,
                        onDismissRequest = { sectorExpanded = false }
                    ) {
                        BRVMSector.values().forEach { sector ->
                            DropdownMenuItem(
                                text = { Text(sector.displayName) },
                                onClick = { selectedSector = sector; sectorExpanded = false }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val qty = quantity.toIntOrNull() ?: return@Button
                    val p = price.toDoubleOrNull() ?: return@Button
                    if (symbol.isNotBlank() && qty > 0 && p > 0) {
                        onConfirm(symbol, name.ifBlank { symbol }, qty, p, LocalDate.now(), selectedSector)
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = BRVMGreen)
            ) {
                Text("Ajouter")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Annuler") }
        }
    )
}
