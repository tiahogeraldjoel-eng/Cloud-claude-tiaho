package com.brvm.intelligence.presentation.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.brvm.intelligence.domain.model.TradingSignal

@Composable
fun TechnicalSignalCard(
    signal: TradingSignal,
    confidence: Int,
    explanation: String,
    modifier: Modifier = Modifier
) {
    val signalColor = Color(signal.color)

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = signalColor.copy(alpha = 0.1f)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = signalColor,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        signal.displayName,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "Confiance",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "$confidence%",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = signalColor
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { confidence / 100f },
                modifier = Modifier.fillMaxWidth(),
                color = signalColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            Text(
                explanation,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
