package com.brvm.intelligence.presentation.screens.onboarding

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.brvm.intelligence.presentation.theme.*
import kotlinx.coroutines.launch

private data class OnboardingPage(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val backgroundColor: Color
)

private val PAGES = listOf(
    OnboardingPage(
        title = "Bienvenue sur BRVM Intelligence",
        description = "Votre assistant analyste IA spécialisé dans la Bourse Régionale des Valeurs Mobilières — le marché financier des 8 pays de l'UEMOA.",
        icon = Icons.Default.TrendingUp,
        backgroundColor = BRVMGreen
    ),
    OnboardingPage(
        title = "Analyse Technique Avancée",
        description = "RSI, MACD, Bollinger Bands, figures chartistes et prédictions IA (LSTM) pour anticiper les mouvements du marché avec un score de confiance.",
        icon = Icons.Default.Analytics,
        backgroundColor = BRVMBlue
    ),
    OnboardingPage(
        title = "Psychologie de Marché BRVM",
        description = "Indice Fear & Greed adapté à la BRVM, détection des comportements moutonniers et alertes de manipulation sur les titres peu liquides.",
        icon = Icons.Default.Psychology,
        backgroundColor = BRVMGold
    ),
    OnboardingPage(
        title = "Gérez Votre Portefeuille",
        description = "Suivez vos positions en FCFA, calculez votre performance vs l'indice BRVM Composite, et recevez des recommandations d'allocation personnalisées.",
        icon = Icons.Default.AccountBalance,
        backgroundColor = BRVMGreen
    )
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OnboardingScreen(onComplete: () -> Unit) {
    val pagerState = rememberPagerState { PAGES.size }
    val coroutineScope = rememberCoroutineScope()

    Box(modifier = Modifier.fillMaxSize()) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { page ->
            OnboardingPage(page = PAGES[page])
        }

        // Indicateurs de page
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 120.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            repeat(PAGES.size) { index ->
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(
                            if (pagerState.currentPage == index) BRVMGreen
                            else BRVMGreen.copy(alpha = 0.3f)
                        )
                        .size(if (pagerState.currentPage == index) 24.dp else 8.dp, 8.dp)
                )
            }
        }

        // Boutons de navigation
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 32.dp)
                .navigationBarsPadding(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (pagerState.currentPage < PAGES.size - 1) {
                TextButton(onClick = onComplete) {
                    Text("Passer", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Button(
                    onClick = {
                        coroutineScope.launch {
                            pagerState.animateScrollToPage(pagerState.currentPage + 1)
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = BRVMGreen)
                ) {
                    Text("Suivant")
                    Spacer(Modifier.width(4.dp))
                    Icon(Icons.Default.ArrowForward, null, modifier = Modifier.size(16.dp))
                }
            } else {
                Spacer(Modifier.weight(1f))
                Button(
                    onClick = onComplete,
                    modifier = Modifier.fillMaxWidth(0.8f),
                    colors = ButtonDefaults.buttonColors(containerColor = BRVMGreen),
                    contentPadding = PaddingValues(vertical = 14.dp)
                ) {
                    Icon(Icons.Default.RocketLaunch, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Commencer", fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun OnboardingPage(page: OnboardingPage) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            color = page.backgroundColor.copy(alpha = 0.15f),
            shape = RoundedCornerShape(32.dp),
            modifier = Modifier.size(140.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = page.icon,
                    contentDescription = null,
                    tint = page.backgroundColor,
                    modifier = Modifier.size(72.dp)
                )
            }
        }

        Spacer(Modifier.height(48.dp))

        Text(
            page.title,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground
        )

        Spacer(Modifier.height(16.dp))

        Text(
            page.description,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            lineHeight = MaterialTheme.typography.bodyLarge.lineHeight
        )

        Spacer(Modifier.height(24.dp))

        // Badge disclaimer
        Surface(
            color = BRVMGold.copy(alpha = 0.1f),
            shape = RoundedCornerShape(12.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.Shield,
                    contentDescription = null,
                    tint = BRVMGold,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    "Informations à titre indicatif — Non conseil réglementé AMF-UMOA",
                    style = MaterialTheme.typography.labelSmall,
                    color = BRVMGold
                )
            }
        }
    }
}
