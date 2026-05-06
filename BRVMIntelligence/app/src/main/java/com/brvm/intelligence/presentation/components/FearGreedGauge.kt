package com.brvm.intelligence.presentation.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.brvm.intelligence.presentation.theme.*
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Jauge semi-circulaire pour l'indice Fear & Greed BRVM.
 * 0 = Peur Extrême (rouge) → 100 = Avidité Extrême (vert).
 */
@Composable
fun FearGreedGauge(
    value: Int,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(120.dp),
        contentAlignment = Alignment.Center
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(100.dp)
        ) {
            val canvasWidth = size.width
            val canvasHeight = size.height
            val radius = minOf(canvasWidth / 2, canvasHeight) * 0.85f
            val cx = canvasWidth / 2
            val cy = canvasHeight * 0.95f
            val strokeWidth = 20f
            val startAngle = 180f
            val sweepTotal = 180f

            // Arc de fond (gris)
            drawArc(
                color = Color.Gray.copy(alpha = 0.2f),
                startAngle = startAngle,
                sweepAngle = sweepTotal,
                useCenter = false,
                topLeft = Offset(cx - radius, cy - radius),
                size = Size(radius * 2, radius * 2),
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
            )

            // Arc coloré par zones (rouge → orange → jaune → vert)
            val zones = listOf(
                Pair(BRVMRed, 36f),
                Pair(BRVMOrange, 36f),
                Pair(BRVMGold, 36f),
                Pair(BRVMGreenLight, 36f),
                Pair(BRVMGreen, 36f)
            )
            var currentAngle = startAngle
            zones.forEach { (color, sweep) ->
                drawArc(
                    color = color.copy(alpha = 0.4f),
                    startAngle = currentAngle,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = Offset(cx - radius, cy - radius),
                    size = Size(radius * 2, radius * 2),
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Butt)
                )
                currentAngle += sweep
            }

            // Aiguille indicatrice
            val needleAngle = startAngle + (value / 100f) * sweepTotal
            val needleAngleRad = needleAngle * PI / 180
            val needleLength = radius * 0.75f
            val needleX = cx + needleLength * cos(needleAngleRad).toFloat()
            val needleY = cy + needleLength * sin(needleAngleRad).toFloat()

            val needleColor = when {
                value <= 20 -> BRVMRed
                value <= 40 -> BRVMOrange
                value <= 60 -> BRVMGold
                value <= 80 -> BRVMGreenLight
                else -> BRVMGreen
            }

            drawLine(
                color = needleColor,
                start = Offset(cx, cy),
                end = Offset(needleX, needleY),
                strokeWidth = 4f,
                cap = StrokeCap.Round
            )

            // Centre de l'aiguille
            drawCircle(
                color = needleColor,
                radius = 10f,
                center = Offset(cx, cy)
            )
            drawCircle(
                color = Color.White,
                radius = 6f,
                center = Offset(cx, cy)
            )
        }

        // Valeur numérique centrée
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 4.dp)
        ) {
            Text(
                text = value.toString(),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.ExtraBold,
                color = when {
                    value <= 20 -> BRVMRed
                    value <= 40 -> BRVMOrange
                    value <= 60 -> BRVMGold
                    value <= 80 -> BRVMGreenLight
                    else -> BRVMGreen
                }
            )
        }
    }
}
