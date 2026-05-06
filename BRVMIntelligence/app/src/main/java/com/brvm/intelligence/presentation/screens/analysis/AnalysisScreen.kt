package com.brvm.intelligence.presentation.screens.analysis

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
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.usecase.*
import com.brvm.intelligence.presentation.theme.*
import com.brvm.intelligence.utils.NumberFormatter
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

// ViewModel inline pour l'écran d'analyse
data class AnalysisUiState(
    val symbol: String = "",
    val technicalAnalysis: TechnicalAnalysis? = null,
    val prediction: StockPrediction? = null,
    val backtest: BacktestResult? = null,
    val isLoading: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class AnalysisViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val getTechnicalAnalysisUseCase: GetTechnicalAnalysisUseCase,
    private val getPredictionUseCase: GetPredictionUseCase,
    private val backtestUseCase: com.brvm.intelligence.domain.usecase.GetTradeRecommendationUseCase
) : ViewModel() {
    val symbol: String = checkNotNull(savedStateHandle["symbol"])

    private val _uiState = MutableStateFlow(AnalysisUiState(symbol = symbol))
    val uiState: StateFlow<AnalysisUiState> = _uiState.asStateFlow()

    init { loadAnalysis() }

    fun loadAnalysis() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val analysis = getTechnicalAnalysisUseCase(symbol)
                val prediction = getPredictionUseCase(symbol)
                _uiState.update {
                    it.copy(technicalAnalysis = analysis, prediction = prediction, isLoading = false)
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalysisScreen(
    symbol: String,
    onBack: () -> Unit,
    viewModel: AnalysisViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Analyse IA — $symbol") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Retour")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::loadAnalysis) {
                        Icon(Icons.Default.Refresh, "Actualiser")
                    }
                }
            )
        }
    ) { paddingValues ->
        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize().padding(paddingValues), Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = BRVMGreen)
                    Spacer(Modifier.height(16.dp))
                    Text("Analyse en cours...", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(paddingValues),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            // Signal global
            uiState.technicalAnalysis?.let { analysis ->
                item { GlobalSignalCard(analysis = analysis) }
                item { RSICard(rsi = analysis.rsi) }
                item { MACDCard(macd = analysis.macd) }
                item { BollingerCard(bb = analysis.bollingerBands) }
                item { MovingAveragesCard(mas = analysis.movingAverages) }
                item { SupportResistanceCard(sr = analysis.supportResistance, currentPrice = analysis.bollingerBands.currentPrice) }
                if (analysis.chartPatterns.isNotEmpty()) {
                    item { PatternsSection(patterns = analysis.chartPatterns) }
                }
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Explication Détaillée", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            Text(analysis.signalExplanation, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            // Prédictions IA
            uiState.prediction?.let { prediction ->
                item { PredictionCard(prediction = prediction) }
            }

            // Disclaimer obligatoire
            item {
                Text(
                    "⚠️ Ces analyses sont générées automatiquement à titre indicatif. Elles ne constituent pas un conseil financier réglementé AMF-UMOA. La performance passée ne garantit pas les résultats futurs.",
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun GlobalSignalCard(analysis: TechnicalAnalysis) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = Color(analysis.overallSignal.color).copy(alpha = 0.15f)),
        elevation = CardDefaults.cardElevation(4.dp)
    ) {
        Row(
            modifier = Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Signal Global", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    analysis.overallSignal.displayName,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(analysis.overallSignal.color)
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Confiance", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "${analysis.signalConfidence}%",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color(analysis.overallSignal.color)
                )
                LinearProgressIndicator(
                    progress = { analysis.signalConfidence / 100f },
                    modifier = Modifier.width(80.dp),
                    color = Color(analysis.overallSignal.color),
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
            }
        }
    }
}

@Composable
private fun RSICard(rsi: RSIData) {
    IndicatorCard(title = "RSI (${rsi.period} jours)") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                String.format("%.1f", rsi.value),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = when (rsi.signal) {
                    RSIData.RSISignal.OVERSOLD -> BRVMGreen
                    RSIData.RSISignal.OVERBOUGHT -> BRVMRed
                    RSIData.RSISignal.NEUTRAL -> MaterialTheme.colorScheme.onSurface
                }
            )
            Spacer(Modifier.width(16.dp))
            Column {
                Text(
                    when (rsi.signal) {
                        RSIData.RSISignal.OVERSOLD -> "Survendu — Potentiel haussier"
                        RSIData.RSISignal.OVERBOUGHT -> "Suracheté — Risque de correction"
                        RSIData.RSISignal.NEUTRAL -> "Zone neutre"
                    },
                    style = MaterialTheme.typography.bodyMedium
                )
                Text("Zone neutre : 30–70", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LinearProgressIndicator(
            progress = { rsi.value.toFloat() / 100 },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            color = when {
                rsi.value < 30 -> BRVMGreen
                rsi.value > 70 -> BRVMRed
                else -> BRVMGold
            },
            trackColor = MaterialTheme.colorScheme.surfaceVariant
        )
    }
}

@Composable
private fun MACDCard(macd: MACDData) {
    IndicatorCard(title = "MACD (12,26,9)") {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            MACDStat("MACD", String.format("%.2f", macd.macdLine))
            MACDStat("Signal", String.format("%.2f", macd.signalLine))
            MACDStat("Histogramme", String.format("%.2f", macd.histogram),
                color = if (macd.histogram >= 0) BRVMGreen else BRVMRed)
        }
        Spacer(Modifier.height(8.dp))
        Surface(
            color = when (macd.signal) {
                MACDData.MACDSignal.BULLISH_CROSSOVER, MACDData.MACDSignal.BULLISH -> BRVMGreen.copy(alpha = 0.15f)
                MACDData.MACDSignal.BEARISH_CROSSOVER, MACDData.MACDSignal.BEARISH -> BRVMRed.copy(alpha = 0.15f)
                else -> MaterialTheme.colorScheme.surfaceVariant
            },
            shape = RoundedCornerShape(8.dp)
        ) {
            Text(
                when (macd.signal) {
                    MACDData.MACDSignal.BULLISH_CROSSOVER -> "🟢 Croisement haussier — Signal d'achat fort"
                    MACDData.MACDSignal.BEARISH_CROSSOVER -> "🔴 Croisement baissier — Signal de vente"
                    MACDData.MACDSignal.BULLISH -> "🟡 Momentum positif"
                    MACDData.MACDSignal.BEARISH -> "🟡 Momentum négatif"
                    MACDData.MACDSignal.NEUTRAL -> "⚪ Neutre"
                },
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun MACDStat(label: String, value: String, color: Color = MaterialTheme.colorScheme.onSurface) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = color)
    }
}

@Composable
private fun BollingerCard(bb: BollingerBandsData) {
    IndicatorCard(title = "Bollinger Bands (20,2)") {
        Column {
            IndicatorRow("Bande Supérieure", NumberFormatter.formatPrice(bb.upperBand))
            IndicatorRow("Bande Médiane (MA20)", NumberFormatter.formatPrice(bb.middleBand))
            IndicatorRow("Prix Actuel", NumberFormatter.formatPrice(bb.currentPrice),
                highlight = true,
                color = BRVMGreen)
            IndicatorRow("Bande Inférieure", NumberFormatter.formatPrice(bb.lowerBand))
            IndicatorRow("Largeur de Bande", "${String.format("%.1f", bb.bandWidth)}% (volatilité)")
        }
    }
}

@Composable
private fun MovingAveragesCard(mas: MovingAveragesData) {
    IndicatorCard(title = "Moyennes Mobiles") {
        IndicatorRow("MA 20 jours", NumberFormatter.formatPrice(mas.ma20),
            color = if (mas.currentPrice > mas.ma20) BRVMGreen else BRVMRed)
        IndicatorRow("MA 50 jours", NumberFormatter.formatPrice(mas.ma50),
            color = if (mas.currentPrice > mas.ma50) BRVMGreen else BRVMRed)
        IndicatorRow("MA 200 jours", NumberFormatter.formatPrice(mas.ma200),
            color = if (mas.currentPrice > mas.ma200) BRVMGreen else BRVMRed)
        Spacer(Modifier.height(8.dp))
        Surface(
            color = BRVMGreen.copy(alpha = 0.1f),
            shape = RoundedCornerShape(8.dp)
        ) {
            Text(
                "Tendance : ${mas.trend.displayName}",
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = BRVMGreen
            )
        }
    }
}

@Composable
private fun SupportResistanceCard(sr: SupportResistanceData, currentPrice: Double) {
    IndicatorCard(title = "Supports & Résistances") {
        if (sr.resistanceLevels.isNotEmpty()) {
            Text("Résistances (plafonds)", style = MaterialTheme.typography.labelMedium, color = BRVMRed)
            sr.resistanceLevels.forEach { level ->
                Text("  ${NumberFormatter.formatPrice(level)}", style = MaterialTheme.typography.bodySmall, color = BRVMRed)
            }
        }
        Spacer(Modifier.height(4.dp))
        Text("Prix actuel : ${NumberFormatter.formatPrice(currentPrice)}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        if (sr.supportLevels.isNotEmpty()) {
            Text("Supports (planchers)", style = MaterialTheme.typography.labelMedium, color = BRVMGreen)
            sr.supportLevels.forEach { level ->
                Text("  ${NumberFormatter.formatPrice(level)}", style = MaterialTheme.typography.bodySmall, color = BRVMGreen)
            }
        }
    }
}

@Composable
private fun PatternsSection(patterns: List<ChartPattern>) {
    IndicatorCard(title = "Figures Chartistes Détectées") {
        patterns.forEach { pattern ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    if (pattern.implication == PatternImplication.BULLISH) Icons.Default.TrendingUp else Icons.Default.TrendingDown,
                    contentDescription = null,
                    tint = if (pattern.implication == PatternImplication.BULLISH) BRVMGreen else BRVMRed,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(pattern.type.displayName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    Text("${pattern.confidence}% de confiance", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun PredictionCard(prediction: StockPrediction) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = BRVMBlue.copy(alpha = 0.08f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Psychology, null, tint = BRVMBlue)
                Spacer(Modifier.width(8.dp))
                Text("Prédictions IA (${prediction.modelVersion})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                prediction.classification.displayName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = BRVMBlue
            )
            Text(
                prediction.classification.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Text("Prévisions journalières :", style = MaterialTheme.typography.labelMedium)
            prediction.predictions.take(5).forEach { day ->
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                    Text("J+${prediction.predictions.indexOf(day) + 1}", modifier = Modifier.width(32.dp), style = MaterialTheme.typography.bodySmall)
                    Text(
                        "${NumberFormatter.formatPrice(day.predictedPrice)} (${if (day.expectedChangePercent >= 0) "+" else ""}${String.format("%.2f", day.expectedChangePercent)}%)",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (day.expectedChangePercent >= 0) BRVMGreen else BRVMRed
                    )
                }
            }
            if (prediction.backtestAccuracy > 0) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Précision historique du modèle : ${String.format("%.1f", prediction.backtestAccuracy)}%",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun IndicatorCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun IndicatorRow(
    label: String,
    value: String,
    highlight: Boolean = false,
    color: Color = MaterialTheme.colorScheme.onSurface
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = if (highlight) color else MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = if (highlight) FontWeight.Bold else FontWeight.Normal, color = color)
    }
}
