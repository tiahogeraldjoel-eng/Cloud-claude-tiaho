package com.brvm.alerte.presentation.chart

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.brvm.alerte.domain.model.PricePoint
import com.brvm.alerte.domain.model.TechnicalIndicators
import com.brvm.alerte.presentation.theme.*
import kotlin.math.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PriceChartScreen(
    ticker: String,
    navController: NavController,
    viewModel: ChartViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(ticker, fontWeight = FontWeight.ExtraBold)
                        state.stock?.let {
                            Text(
                                it.name,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadChart() }) {
                        Icon(Icons.Filled.Refresh, "Actualiser")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Prix et variation
            state.stock?.let { stock ->
                PriceSummaryRow(stock.lastPrice, stock.changePercent, stock.changeAbsolute)
            }

            // Contrôles période + type
            ChartControls(
                period = state.period,
                chartType = state.chartType,
                showSMA = state.showSMA,
                showBollinger = state.showBollinger,
                onPeriod = viewModel::setPeriod,
                onChartType = viewModel::setChartType,
                onToggleSMA = viewModel::toggleSMA,
                onToggleBollinger = viewModel::toggleBollinger
            )

            // Graphique principal
            if (state.isLoading) {
                Box(Modifier.fillMaxWidth().height(320.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = BRVMGreen)
                }
            } else if (state.priceHistory.isNotEmpty()) {
                PriceChart(
                    prices = state.priceHistory,
                    chartType = state.chartType,
                    indicators = state.indicators,
                    showSMA = state.showSMA,
                    showBollinger = state.showBollinger,
                    modifier = Modifier.fillMaxWidth().height(320.dp).padding(horizontal = 8.dp)
                )

                // Histogramme volume
                VolumeChart(
                    prices = state.priceHistory,
                    modifier = Modifier.fillMaxWidth().height(80.dp).padding(horizontal = 8.dp)
                )
            }

            // Indicateurs techniques
            state.indicators?.let { ind ->
                TechnicalPanel(ind, Modifier.padding(horizontal = 16.dp))
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun PriceSummaryRow(price: Double, changePct: Double, changeAbs: Double) {
    val color = if (changePct >= 0) BRVMGreenLight else BRVMRedLight
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        Text(
            "${String.format("%.0f", price)} FCFA",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.ExtraBold
        )
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                "${String.format("%+.2f", changePct)}%",
                style = MaterialTheme.typography.titleMedium,
                color = color,
                fontWeight = FontWeight.Bold
            )
            Text(
                "${String.format("%+.0f", changeAbs)} F",
                style = MaterialTheme.typography.labelSmall,
                color = color
            )
        }
    }
}

@Composable
private fun ChartControls(
    period: ChartPeriod,
    chartType: ChartType,
    showSMA: Boolean,
    showBollinger: Boolean,
    onPeriod: (ChartPeriod) -> Unit,
    onChartType: (ChartType) -> Unit,
    onToggleSMA: () -> Unit,
    onToggleBollinger: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Période
        Row(
            modifier = Modifier.padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            ChartPeriod.entries.forEach { p ->
                FilterChip(
                    selected = period == p,
                    onClick = { onPeriod(p) },
                    label = { Text(p.label, style = MaterialTheme.typography.labelMedium) },
                    modifier = Modifier.weight(1f),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = BRVMGreen,
                        selectedLabelColor = Color.White
                    )
                )
            }
        }
        // Type de graphique + overlays
        Row(
            modifier = Modifier.padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FilterChip(
                selected = chartType == ChartType.CANDLESTICK,
                onClick = { onChartType(if (chartType == ChartType.CANDLESTICK) ChartType.LINE else ChartType.CANDLESTICK) },
                label = { Text("Chandeliers", style = MaterialTheme.typography.labelSmall) },
                leadingIcon = { Icon(Icons.Filled.CandlestickChart, null, Modifier.size(14.dp)) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = BRVMGold,
                    selectedLabelColor = Color.Black
                )
            )
            FilterChip(
                selected = showSMA,
                onClick = onToggleSMA,
                label = { Text("SMA 20/50", style = MaterialTheme.typography.labelSmall) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Color(0xFF4FC3F7).copy(0.3f),
                    selectedLabelColor = Color(0xFF4FC3F7)
                )
            )
            FilterChip(
                selected = showBollinger,
                onClick = onToggleBollinger,
                label = { Text("Bollinger", style = MaterialTheme.typography.labelSmall) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Color(0xFFAB47BC).copy(0.3f),
                    selectedLabelColor = Color(0xFFAB47BC)
                )
            )
        }
    }
}

@Composable
private fun PriceChart(
    prices: List<PricePoint>,
    chartType: ChartType,
    indicators: TechnicalIndicators?,
    showSMA: Boolean,
    showBollinger: Boolean,
    modifier: Modifier = Modifier
) {
    if (prices.isEmpty()) return

    val textMeasurer = rememberTextMeasurer()

    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val padLeft = 8f
        val padRight = 56f
        val padTop = 12f
        val padBottom = 24f
        val chartW = w - padLeft - padRight
        val chartH = h - padTop - padBottom

        val allLows = prices.map { it.low }
        val allHighs = prices.map { it.high }

        // Élargir la plage si Bollinger est activé
        val minPrice = if (showBollinger && indicators != null)
            minOf(allLows.min(), indicators.bollingerLower)
        else allLows.min()
        val maxPrice = if (showBollinger && indicators != null)
            maxOf(allHighs.max(), indicators.bollingerUpper)
        else allHighs.max()

        val priceRange = (maxPrice - minPrice).coerceAtLeast(1.0)

        fun xOf(i: Int) = padLeft + (i.toFloat() / (prices.size - 1).coerceAtLeast(1)) * chartW
        fun yOf(p: Double) = padTop + chartH - ((p - minPrice) / priceRange * chartH).toFloat()

        // Grille horizontale
        val gridLines = 4
        for (i in 0..gridLines) {
            val y = padTop + (chartH / gridLines) * i
            drawLine(Color(0xFF30363D), Offset(padLeft, y), Offset(padLeft + chartW, y), 0.5f)
            val price = maxPrice - (priceRange / gridLines) * i
            val label = textMeasurer.measure(
                "${price.toInt()}",
                TextStyle(fontSize = 8.sp, color = Color(0xFF8B949E))
            )
            drawText(label, topLeft = Offset(padLeft + chartW + 4f, y - label.size.height / 2))
        }

        // Bollinger Bands
        if (showBollinger && indicators != null && prices.size > 20) {
            val bollingerPath = Path()
            val bollingerFill = Path()
            bollingerFill.moveTo(xOf(0), yOf(indicators.bollingerUpper))
            bollingerPath.moveTo(xOf(0), yOf(indicators.bollingerUpper))
            // Simplifié: afficher les valeurs actuelles comme lignes horizontales
            val upperY = yOf(indicators.bollingerUpper)
            val middleY = yOf(indicators.bollingerMiddle)
            val lowerY = yOf(indicators.bollingerLower)
            drawLine(Color(0xFFAB47BC).copy(0.8f), Offset(padLeft, upperY), Offset(padLeft + chartW, upperY), 1f)
            drawLine(Color(0xFFAB47BC).copy(0.5f), Offset(padLeft, middleY), Offset(padLeft + chartW, middleY), 1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 4f)))
            drawLine(Color(0xFFAB47BC).copy(0.8f), Offset(padLeft, lowerY), Offset(padLeft + chartW, lowerY), 1f)
        }

        // SMA lines
        if (showSMA && indicators != null) {
            val sma20Y = yOf(indicators.sma20)
            val sma50Y = yOf(indicators.sma50)
            drawLine(Color(0xFF4FC3F7).copy(0.9f), Offset(padLeft, sma20Y), Offset(padLeft + chartW, sma20Y), 1.5f)
            drawLine(Color(0xFFFF8F00).copy(0.9f), Offset(padLeft, sma50Y), Offset(padLeft + chartW, sma50Y), 1.5f)
        }

        // Courbe ou chandeliers
        if (chartType == ChartType.LINE) {
            val linePath = Path()
            val fillPath = Path()
            prices.forEachIndexed { i, p ->
                val x = xOf(i)
                val y = yOf(p.close)
                if (i == 0) {
                    linePath.moveTo(x, y)
                    fillPath.moveTo(x, padTop + chartH)
                    fillPath.lineTo(x, y)
                } else {
                    linePath.lineTo(x, y)
                    fillPath.lineTo(x, y)
                }
            }
            fillPath.lineTo(xOf(prices.size - 1), padTop + chartH)
            fillPath.close()

            drawPath(fillPath, Brush.verticalGradient(
                listOf(BRVMGreen.copy(0.25f), Color.Transparent),
                startY = padTop, endY = padTop + chartH
            ))
            drawPath(linePath, BRVMGreen, style = Stroke(width = 2f))
        } else {
            val candleW = (chartW / prices.size * 0.6f).coerceAtLeast(1.5f)
            prices.forEachIndexed { i, p ->
                val x = xOf(i)
                val isUp = p.close >= p.open
                val color = if (isUp) BRVMGreenLight else BRVMRedLight
                val bodyTop = yOf(maxOf(p.open, p.close))
                val bodyBottom = yOf(minOf(p.open, p.close))
                val highY = yOf(p.high)
                val lowY = yOf(p.low)

                drawLine(color, Offset(x, highY), Offset(x, lowY), 1f)
                val bodyH = (bodyBottom - bodyTop).coerceAtLeast(1.5f)
                drawRect(color, Offset(x - candleW / 2, bodyTop), Size(candleW, bodyH))
            }
        }

        // Axe X — dates
        val step = maxOf(1, prices.size / 5)
        for (i in prices.indices step step) {
            val x = xOf(i)
            val dateSec = prices[i].date
            val label = textMeasurer.measure(
                formatDateShort(dateSec),
                TextStyle(fontSize = 8.sp, color = Color(0xFF8B949E))
            )
            drawText(label, topLeft = Offset(x - label.size.width / 2, padTop + chartH + 4f))
        }
    }
}

@Composable
private fun VolumeChart(prices: List<PricePoint>, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        if (prices.isEmpty()) return@Canvas
        val w = size.width
        val h = size.height
        val padLeft = 8f

        val maxVol = prices.maxOf { it.volume }.toFloat().coerceAtLeast(1f)
        val barW = (w / prices.size * 0.7f).coerceAtLeast(1f)

        prices.forEachIndexed { i, p ->
            val x = padLeft + (i.toFloat() / (prices.size - 1).coerceAtLeast(1)) * (w - padLeft)
            val barH = (p.volume / maxVol * h * 0.9f)
            val color = if (p.close >= p.open) BRVMGreenLight.copy(0.5f) else BRVMRedLight.copy(0.5f)
            drawRect(color, Offset(x - barW / 2, h - barH), Size(barW, barH))
        }
    }
}

@Composable
private fun TechnicalPanel(ind: TechnicalIndicators, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Indicateurs techniques", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                IndValue("RSI(14)", "${String.format("%.1f", ind.rsi14)}",
                    when {
                        ind.rsi14 < 30 -> BRVMGreenLight
                        ind.rsi14 > 70 -> BRVMRedLight
                        else -> MaterialTheme.colorScheme.onSurface
                    })
                IndValue("MACD", "${String.format("%+.2f", ind.macdLine)}",
                    if (ind.isBullishMACD) BRVMGreenLight else BRVMRedLight)
                IndValue("ADX(14)", "${String.format("%.1f", ind.adx14)}",
                    if (ind.isTrendStrong) BRVMGold else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                IndValue("MFI(14)", "${String.format("%.1f", ind.moneyFlowIndex)}",
                    when {
                        ind.moneyFlowIndex < 25 -> BRVMGreenLight
                        ind.moneyFlowIndex > 80 -> BRVMRedLight
                        else -> MaterialTheme.colorScheme.onSurface
                    })
                IndValue("Stoch.K", "${String.format("%.1f", ind.stochasticK)}",
                    if (ind.isBullishStochastic) BRVMGreenLight else MaterialTheme.colorScheme.onSurfaceVariant)
                IndValue("ATR(14)", "${String.format("%.0f", ind.atr14)} F",
                    MaterialTheme.colorScheme.onSurface)
            }
            // Signal bar
            val bullishSignals = listOf(ind.isBullishMACD, ind.isOversold, ind.isGoldenCross, ind.isBullishStochastic, ind.isTrendStrong).count { it }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Signal global: ", style = MaterialTheme.typography.labelMedium)
                val signalColor = when {
                    bullishSignals >= 4 -> BRVMGreenLight
                    bullishSignals >= 2 -> BRVMGold
                    else -> BRVMRedLight
                }
                val signalLabel = when {
                    bullishSignals >= 4 -> "TRÈS HAUSSIER"
                    bullishSignals >= 3 -> "HAUSSIER"
                    bullishSignals >= 2 -> "NEUTRE"
                    bullishSignals >= 1 -> "BAISSIER"
                    else -> "TRÈS BAISSIER"
                }
                Text(signalLabel, style = MaterialTheme.typography.labelMedium, color = signalColor, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun IndValue(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.labelLarge, color = color, fontWeight = FontWeight.Bold)
    }
}

private fun formatDateShort(epochSeconds: Long): String {
    val ms = epochSeconds * 1000L
    val cal = java.util.Calendar.getInstance().apply { timeInMillis = ms }
    return "${cal.get(java.util.Calendar.DAY_OF_MONTH)}/${cal.get(java.util.Calendar.MONTH) + 1}"
}
