package com.brvm.intelligence.presentation.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.brvm.intelligence.domain.model.PriceHistory
import com.brvm.intelligence.presentation.theme.*

/**
 * Graphique en chandelier simplifié pour l'historique des prix.
 * Utilise Canvas Compose natif pour la compatibilité maximale.
 * Pour une version plus riche, utiliser Vico Chart Library.
 */
@Composable
fun PriceChart(
    priceHistory: PriceHistory,
    modifier: Modifier = Modifier
) {
    val prices = priceHistory.prices
    if (prices.isEmpty()) return

    val isPositive = prices.last().close >= prices.first().close
    val lineColor = if (isPositive) BRVMGreen else BRVMRed
    val fillColor = if (isPositive) ChartFill else BRVMRed.copy(alpha = 0.1f)
    val gridColor = ChartGrid

    val closes = prices.map { it.close }
    val minPrice = closes.min()
    val maxPrice = closes.max()
    val priceRange = (maxPrice - minPrice).coerceAtLeast(0.01)

    Canvas(modifier = modifier.padding(8.dp)) {
        val width = size.width
        val height = size.height
        val stepX = if (prices.size > 1) width / (prices.size - 1) else width

        // Grille horizontale (4 lignes)
        for (i in 0..3) {
            val y = height * i / 3
            drawLine(
                color = gridColor,
                start = Offset(0f, y),
                end = Offset(width, y),
                strokeWidth = 1f
            )
        }

        // Calcul des points
        val points = prices.mapIndexed { index, point ->
            val x = index * stepX
            val y = height - ((point.close - minPrice) / priceRange * height).toFloat()
            Offset(x, y.coerceIn(0f, height))
        }

        if (points.size < 2) return@Canvas

        // Zone de remplissage sous la courbe
        val fillPath = Path().apply {
            moveTo(points.first().x, height)
            points.forEach { lineTo(it.x, it.y) }
            lineTo(points.last().x, height)
            close()
        }
        drawPath(
            path = fillPath,
            brush = Brush.verticalGradient(
                colors = listOf(fillColor, Color.Transparent),
                startY = 0f,
                endY = height
            )
        )

        // Ligne de prix
        val linePath = Path().apply {
            moveTo(points.first().x, points.first().y)
            for (i in 1 until points.size) {
                // Courbe de Bézier pour lisser la ligne
                val prevX = points[i - 1].x
                val currX = points[i].x
                val midX = (prevX + currX) / 2
                cubicTo(midX, points[i - 1].y, midX, points[i].y, currX, points[i].y)
            }
        }
        drawPath(
            path = linePath,
            color = lineColor,
            style = Stroke(width = 2.5f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        )

        // Point final (prix actuel)
        drawCircle(
            color = lineColor,
            radius = 5f,
            center = points.last()
        )
        drawCircle(
            color = Color.White,
            radius = 3f,
            center = points.last()
        )
    }
}

/**
 * Graphique en chandeliers japonais (candlestick)
 */
@Composable
fun CandlestickChart(
    priceHistory: PriceHistory,
    modifier: Modifier = Modifier
) {
    val prices = priceHistory.prices
    if (prices.isEmpty()) return

    val highs = prices.map { it.high }
    val lows = prices.map { it.low }
    val minPrice = lows.min()
    val maxPrice = highs.max()
    val priceRange = (maxPrice - minPrice).coerceAtLeast(0.01)

    Canvas(modifier = modifier.padding(8.dp)) {
        val width = size.width
        val height = size.height
        val candleWidth = (width / prices.size * 0.6f).coerceAtLeast(4f)
        val stepX = width / prices.size

        prices.forEachIndexed { index, candle ->
            val x = index * stepX + stepX / 2
            val openY = height - ((candle.open - minPrice) / priceRange * height).toFloat()
            val closeY = height - ((candle.close - minPrice) / priceRange * height).toFloat()
            val highY = height - ((candle.high - minPrice) / priceRange * height).toFloat()
            val lowY = height - ((candle.low - minPrice) / priceRange * height).toFloat()

            val isBullish = candle.close >= candle.open
            val candleColor = if (isBullish) BRVMGreen else BRVMRed

            // Mèche (ombre)
            drawLine(
                color = candleColor,
                start = Offset(x, highY.coerceIn(0f, height)),
                end = Offset(x, lowY.coerceIn(0f, height)),
                strokeWidth = 1.5f
            )

            // Corps de la bougie
            val bodyTop = minOf(openY, closeY).coerceIn(0f, height)
            val bodyBottom = maxOf(openY, closeY).coerceIn(0f, height)
            val bodyHeight = (bodyBottom - bodyTop).coerceAtLeast(2f)

            drawRect(
                color = candleColor,
                topLeft = Offset(x - candleWidth / 2, bodyTop),
                size = androidx.compose.ui.geometry.Size(candleWidth, bodyHeight)
            )
        }
    }
}
