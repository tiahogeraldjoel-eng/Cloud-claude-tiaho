package com.brvm.intelligence.presentation.screens.stocks

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import com.brvm.intelligence.presentation.components.PriceChart
import com.brvm.intelligence.presentation.components.TechnicalSignalCard
import com.brvm.intelligence.presentation.theme.*
import com.brvm.intelligence.utils.NumberFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockDetailScreen(
    symbol: String,
    onBack: () -> Unit,
    onAnalyzeClick: () -> Unit,
    viewModel: StockDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(symbol) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Retour")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::toggleWatchlist) {
                        Icon(
                            if (uiState.isInWatchlist) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                            contentDescription = "Watchlist",
                            tint = if (uiState.isInWatchlist) BRVMGreen else MaterialTheme.colorScheme.onSurface
                        )
                    }
                    IconButton(onClick = {}) {
                        Icon(Icons.Default.NotificationAdd, "Créer alerte")
                    }
                }
            )
        }
    ) { paddingValues ->
        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize().padding(paddingValues), Alignment.Center) {
                CircularProgressIndicator(color = BRVMGreen)
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            // Prix et variation
            item {
                uiState.stock?.let { stock ->
                    StockPriceHeader(stock = stock)
                    // Avertissement liquidité si nécessaire
                    if (stock.liquidityLevel == LiquidityLevel.LOW ||
                        stock.liquidityLevel == LiquidityLevel.VERY_LOW) {
                        LiquidityWarning(level = stock.liquidityLevel)
                    }
                }
            }

            // Graphique des prix
            item {
                PriceChartSection(
                    priceHistory = uiState.priceHistory,
                    selectedPeriod = uiState.selectedPeriod,
                    onPeriodSelected = viewModel::onPeriodSelected
                )
            }

            // Statistiques fondamentales
            item {
                uiState.stock?.let { stock ->
                    FundamentalsSection(stock = stock)
                }
            }

            // Bouton Analyse IA
            item {
                Button(
                    onClick = {
                        viewModel.loadAnalysis()
                        onAnalyzeClick()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BRVMGreen)
                ) {
                    Icon(Icons.Default.Analytics, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Analyse Technique + IA")
                }
            }

            // Recommandation si disponible
            uiState.recommendation?.let { rec ->
                item {
                    RecommendationCard(recommendation = rec)
                }
            }

            // Disclaimer
            item {
                DisclaimerCard()
            }
        }
    }
}

@Composable
private fun StockPriceHeader(stock: Stock) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        elevation = CardDefaults.cardElevation(4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stock.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                "${stock.sector.displayName} • ${stock.country.displayName}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Text(
                    NumberFormatter.formatPrice(stock.currentPrice),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold
                )
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "${if (stock.change >= 0) "+" else ""}${NumberFormatter.formatPrice(stock.change)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (stock.change >= 0) BRVMGreen else BRVMRed,
                        fontWeight = FontWeight.Medium
                    )
                    Surface(
                        color = (if (stock.changePercent >= 0) BRVMGreen else BRVMRed).copy(alpha = 0.15f),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            "${if (stock.changePercent >= 0) "+" else ""}${String.format("%.2f", stock.changePercent)}%",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (stock.changePercent >= 0) BRVMGreen else BRVMRed,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LiquidityWarning(level: LiquidityLevel) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = BRVMRed.copy(alpha = 0.1f))
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = BRVMRed, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                level.warningMessage ?: "",
                style = MaterialTheme.typography.bodySmall,
                color = BRVMRed
            )
        }
    }
}

@Composable
private fun PriceChartSection(
    priceHistory: PriceHistory?,
    selectedPeriod: HistoryPeriod,
    onPeriodSelected: (HistoryPeriod) -> Unit
) {
    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        // Sélecteur de période
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            val periods = listOf(
                HistoryPeriod.ONE_WEEK,
                HistoryPeriod.ONE_MONTH,
                HistoryPeriod.THREE_MONTHS,
                HistoryPeriod.ONE_YEAR
            )
            periods.forEachIndexed { index, period ->
                SegmentedButton(
                    selected = selectedPeriod == period,
                    onClick = { onPeriodSelected(period) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = periods.size),
                    label = { Text(period.displayName.take(4)) }
                )
            }
        }
        Spacer(Modifier.height(8.dp))

        if (priceHistory != null && priceHistory.prices.isNotEmpty()) {
            PriceChart(
                priceHistory = priceHistory,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = BRVMGreen, modifier = Modifier.size(32.dp))
            }
        }
    }
}

@Composable
private fun FundamentalsSection(stock: Stock) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Données Fondamentales",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                FundamentalItem("Volume", NumberFormatter.formatVolume(stock.volume), Modifier.weight(1f))
                FundamentalItem("Cap. Boursière", NumberFormatter.formatMarketCap(stock.marketCap), Modifier.weight(1f))
            }
            Row(modifier = Modifier.fillMaxWidth()) {
                FundamentalItem("PER", stock.per?.let { String.format("%.1f", it) } ?: "N/D", Modifier.weight(1f))
                FundamentalItem("Rendement Div.", stock.dividendYield?.let { "${String.format("%.2f", it)}%" } ?: "N/D", Modifier.weight(1f))
            }
            Row(modifier = Modifier.fillMaxWidth()) {
                FundamentalItem("+ haut 52s", NumberFormatter.formatPrice(stock.high52Week), Modifier.weight(1f))
                FundamentalItem("+ bas 52s", NumberFormatter.formatPrice(stock.low52Week), Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun FundamentalItem(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(vertical = 4.dp)) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun RecommendationCard(recommendation: TradeRecommendation) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = when (recommendation.signal) {
                TradingSignal.STRONG_BUY, TradingSignal.BUY -> BRVMGreen.copy(alpha = 0.1f)
                TradingSignal.STRONG_SELL, TradingSignal.SELL -> BRVMRed.copy(alpha = 0.1f)
                else -> MaterialTheme.colorScheme.surfaceVariant
            }
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Recommandation IA", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    color = Color(recommendation.signal.color),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        recommendation.signal.displayName,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    "R/R: ${String.format("%.1f", recommendation.riskRewardRatio)}x",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                FundamentalItem("Stop-loss", NumberFormatter.formatPrice(recommendation.stopLoss), Modifier.weight(1f))
                FundamentalItem("Objectif", NumberFormatter.formatPrice(recommendation.priceTarget), Modifier.weight(1f))
                FundamentalItem("Taille pos.", "${String.format("%.1f", recommendation.positionSizePercent)}%", Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Text(
                recommendation.timeHorizon,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun DisclaimerCard() {
    Text(
        "⚠️ Information à titre indicatif uniquement. Ne constitue pas un conseil en investissement réglementé. " +
        "La BRVM présente une faible liquidité structurelle. Investir comporte des risques de perte en capital.",
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}
