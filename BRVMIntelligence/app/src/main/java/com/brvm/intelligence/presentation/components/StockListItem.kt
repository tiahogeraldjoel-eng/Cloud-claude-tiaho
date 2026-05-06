package com.brvm.intelligence.presentation.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.brvm.intelligence.domain.model.LiquidityLevel
import com.brvm.intelligence.domain.model.Stock
import com.brvm.intelligence.presentation.theme.*
import com.brvm.intelligence.utils.NumberFormatter

@Composable
fun StockListItem(
    stock: Stock,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 3.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Indicateur de couleur sectoriel
            Surface(
                color = getSectorColor(stock.sector.name).copy(alpha = 0.15f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.size(44.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        stock.symbol.take(2),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = getSectorColor(stock.sector.name)
                    )
                }
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stock.symbol,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    if (stock.liquidityLevel == LiquidityLevel.VERY_LOW) {
                        Spacer(Modifier.width(4.dp))
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = "Faible liquidité",
                            tint = BRVMRed,
                            modifier = Modifier.size(12.dp)
                        )
                    }
                }
                Text(
                    stock.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
                Text(
                    "${stock.sector.displayName} • ${stock.country.code}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    NumberFormatter.formatPrice(stock.currentPrice),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold
                )
                Surface(
                    color = (if (stock.changePercent >= 0) BRVMGreen else BRVMRed).copy(alpha = 0.15f),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        "${if (stock.changePercent >= 0) "+" else ""}${String.format("%.2f", stock.changePercent)}%",
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (stock.changePercent >= 0) BRVMGreen else BRVMRed
                    )
                }
                Text(
                    "Vol: ${NumberFormatter.formatVolume(stock.volume)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }
    }
}

private fun getSectorColor(sectorName: String): Color = when (sectorName) {
    "FINANCE" -> BRVMBlue
    "AGRICULTURE" -> BRVMGreen
    "INDUSTRIE" -> BRVMOrange
    "DISTRIBUTION" -> BRVMGold
    "TRANSPORT" -> Color(0xFF7B1FA2)
    "SERVICES_PUBLICS" -> Color(0xFF0097A7)
    else -> Color(0xFF607D8B)
}
