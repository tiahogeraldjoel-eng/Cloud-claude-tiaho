package com.brvm.intelligence.data.repository

import com.brvm.intelligence.data.local.dao.PriceHistoryDao
import com.brvm.intelligence.data.local.dao.StockDao
import com.brvm.intelligence.data.local.entity.toDomain
import com.brvm.intelligence.data.ml.BRVMPredictor
import com.brvm.intelligence.data.ml.FundamentalAnalyzer
import com.brvm.intelligence.data.ml.MarketSentimentAnalyzer
import com.brvm.intelligence.data.ml.TechnicalIndicatorCalculator
import com.brvm.intelligence.data.ml.ValuationSignal
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.repository.AnalysisRepository
import com.brvm.intelligence.domain.repository.PortfolioAnalysis
import com.brvm.intelligence.domain.repository.RebalancingAction
import com.brvm.intelligence.domain.repository.RebalancingSuggestion
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

@Singleton
class AnalysisRepositoryImpl @Inject constructor(
    private val stockDao: StockDao,
    private val priceHistoryDao: PriceHistoryDao,
    private val technicalCalculator: TechnicalIndicatorCalculator,
    private val sentimentAnalyzer: MarketSentimentAnalyzer,
    private val predictor: BRVMPredictor,
    private val fundamentalAnalyzer: FundamentalAnalyzer,
) : AnalysisRepository {

    override suspend fun getTechnicalAnalysis(symbol: String): TechnicalAnalysis {
        val fromEpoch = LocalDate.now().minusDays(365).toEpochDay()
        val priceEntities = priceHistoryDao.getPriceHistory(symbol, fromEpoch)
        val pricePoints = priceEntities.map { it.toDomain() }
        val priceHistory = PriceHistory(symbol, pricePoints, HistoryPeriod.ONE_YEAR)
        return technicalCalculator.analyze(symbol, priceHistory)
    }

    override suspend fun getMarketSentiment(): MarketSentiment {
        val stocks = stockDao.getAllStocks().let { flow ->
            var result = emptyList<Stock>()
            // Récupération synchrone pour l'analyse de sentiment
            val entities = stockDao.getTopGainers(50)  // Utiliser les 50 premières comme proxy
            entities.map { it.toDomain() }
        }
        return sentimentAnalyzer.analyzeSentiment(stocks, emptyMap())
    }

    override suspend fun getPrediction(symbol: String): StockPrediction {
        val fromEpoch = LocalDate.now().minusDays(365).toEpochDay()
        val priceEntities = priceHistoryDao.getPriceHistory(symbol, fromEpoch)
        val pricePoints = priceEntities.map { it.toDomain() }
        val priceHistory = PriceHistory(symbol, pricePoints, HistoryPeriod.ONE_YEAR)
        return predictor.predict(symbol, priceHistory)
    }

    override suspend fun getTradeRecommendation(symbol: String): TradeRecommendation {
        val stock = stockDao.getStockBySymbol(symbol)?.toDomain()
            ?: throw Exception("Action $symbol non trouvée")
        val technicalAnalysis = getTechnicalAnalysis(symbol)
        val prediction = getPrediction(symbol)

        val currentPrice = stock.currentPrice
        val signal = technicalAnalysis.overallSignal

        // Analyse fondamentale — valorisation et ajustement de confiance
        val fundamental = fundamentalAnalyzer.analyze(stock)

        // Ajuster le signal si fondamentaux contredisent le technique
        val adjustedSignal = adjustSignalWithFundamentals(signal, fundamental.valuationSignal)

        // Calcul des niveaux de trade
        val stopLoss = when (adjustedSignal) {
            TradingSignal.STRONG_BUY, TradingSignal.BUY ->
                technicalAnalysis.supportResistance.nearestSupport * 0.98
            else -> currentPrice * 0.93
        }

        // Prix cibles : utilise la juste valeur fondamentale si disponible
        val fundamentalTarget = fundamental.estimatedFairValue
        val takeProfits = when (adjustedSignal) {
            TradingSignal.STRONG_BUY -> listOf(
                currentPrice * 1.05,
                currentPrice * 1.10,
                fundamentalTarget ?: technicalAnalysis.supportResistance.nearestResistance
            )
            TradingSignal.BUY -> listOf(
                currentPrice * 1.04,
                fundamentalTarget ?: technicalAnalysis.supportResistance.nearestResistance
            )
            else -> listOf(fundamentalTarget ?: currentPrice)
        }

        val riskReward = if (currentPrice - stopLoss > 0) {
            (takeProfits.first() - currentPrice) / (currentPrice - stopLoss)
        } else 0.0

        // Position sizing basé sur le risque (règle des 2%) + ajustement liquidité
        val riskPercent = (currentPrice - stopLoss) / currentPrice * 100
        val basePositionSize = if (riskPercent > 0) minOf(2.0 / riskPercent * 100, 20.0) else 5.0
        val liquidityMultiplier = when (stock.liquidityLevel) {
            LiquidityLevel.VERY_LOW -> 0.5
            LiquidityLevel.LOW      -> 0.7
            else                    -> 1.0
        }
        val positionSize = basePositionSize * liquidityMultiplier * fundamental.confidenceAdjustment

        // Valorisation : juste valeur fondamentale ou null si données absentes
        val dcfValue = fundamental.estimatedFairValue
        // Comparaison sectorielle = juste valeur ± 5% selon la méthode
        val sectorComparable = dcfValue?.let { fv ->
            when (fundamental.valuationSignal) {
                ValuationSignal.UNDERVALUED -> fv * 1.05
                ValuationSignal.OVERVALUED  -> fv * 0.95
                else                        -> fv
            }
        }

        val rationale = buildTradeRationale(adjustedSignal, technicalAnalysis, prediction, stock, fundamental)

        return TradeRecommendation(
            symbol = symbol,
            signal = adjustedSignal,
            entryPrice = currentPrice,
            stopLoss = stopLoss,
            takeProfitLevels = takeProfits,
            riskRewardRatio = riskReward,
            positionSizePercent = positionSize,
            timeHorizon = determineTimeHorizon(adjustedSignal, prediction),
            rationale = rationale,
            dcfValuation = dcfValue,
            sectorComparableValuation = sectorComparable,
            priceTarget = takeProfits.last()
        )
    }

    override suspend fun getBacktestResults(symbol: String): BacktestResult {
        val fromEpoch = LocalDate.now().minusDays(365).toEpochDay()
        val priceEntities = priceHistoryDao.getPriceHistory(symbol, fromEpoch)
        val closes = priceEntities.map { it.close }

        if (closes.size < 30) {
            return BacktestResult(symbol, "1 an", 0, 0, 0.0, 0.0, 0.0)
        }

        // Simulation de backtesting glissant
        var correct = 0
        val totalPredictions = closes.size - 20
        var totalError = 0.0

        for (i in 20 until closes.size) {
            val historicCloses = closes.take(i)
            val rsi = technicalCalculator.calculateRSI(historicCloses)
            val predicted = if (rsi.signal == RSIData.RSISignal.OVERSOLD) "RISE" else "OTHER"
            val actual = if (closes[i] > closes[i - 1]) "RISE" else "OTHER"
            if (predicted == actual) correct++
            totalError += abs(closes[i] - closes[i - 1]) / closes[i - 1] * 100
        }

        val accuracy = correct.toDouble() / totalPredictions * 100
        return BacktestResult(
            symbol = symbol,
            period = "1 an",
            totalPredictions = totalPredictions,
            correctPredictions = correct,
            accuracy = accuracy,
            averageError = totalError / totalPredictions,
            sharpeRatio = calculateSharpeRatio(closes)
        )
    }

    override suspend fun askAI(question: String, context: List<ChatMessage>): String {
        // Intégration avec un LLM via API (Claude/GPT) pour le chat IA
        // En mode offline, réponse heuristique basée sur les mots-clés
        return generateHeuristicResponse(question, context)
    }

    override suspend fun analyzePortfolio(portfolio: Portfolio): PortfolioAnalysis {
        val suggestions = mutableListOf<RebalancingSuggestion>()
        val overweighted = mutableListOf<BRVMSector>()
        val underweighted = mutableListOf<BRVMSector>()
        val warnings = mutableListOf<String>()

        // Allocation cible (équilibrée par défaut)
        val targetAllocations = mapOf(
            BRVMSector.FINANCE to 35.0,
            BRVMSector.AGRICULTURE to 20.0,
            BRVMSector.INDUSTRIE to 15.0,
            BRVMSector.DISTRIBUTION to 15.0,
            BRVMSector.SERVICES_PUBLICS to 10.0,
            BRVMSector.TRANSPORT to 5.0
        )

        portfolio.sectorAllocation.forEach { (sector, allocation) ->
            val target = targetAllocations[sector] ?: 5.0
            when {
                allocation > target * 1.5 -> {
                    overweighted.add(sector)
                    val overweightedPositions = portfolio.positions.filter { it.sector == sector }
                    overweightedPositions.firstOrNull()?.let { position ->
                        suggestions.add(RebalancingSuggestion(
                            action = RebalancingAction.REDUCE,
                            symbol = position.symbol,
                            currentAllocation = allocation,
                            targetAllocation = target,
                            rationale = "Secteur ${sector.displayName} surpondéré (${String.format("%.1f", allocation)}% vs cible ${target}%)"
                        ))
                    }
                }
                allocation < target * 0.5 -> underweighted.add(sector)
            }
        }

        // Alertes de risque spécifiques BRVM
        portfolio.positions.forEach { position ->
            if (position.currentValue / portfolio.totalValue > 0.3) {
                warnings.add("⚠️ ${position.symbol} représente plus de 30% de votre portefeuille. Risque de concentration élevé.")
            }
            if (position.sector == BRVMSector.FINANCE && position.currentValue / portfolio.totalValue > 0.5) {
                warnings.add("⚠️ Exposition excessive au secteur financier (>${(position.currentValue / portfolio.totalValue * 100).toInt()}%). Diversifiez vers l'agriculture et les télécoms.")
            }
        }

        if (portfolio.metrics.var95 > portfolio.totalValue * 0.15) {
            warnings.add("⚠️ VaR 95% élevée : risque de perte potentielle de ${String.format("%.0f", portfolio.metrics.var95)} FCFA sur 1 mois.")
        }

        val report = generateMonthlyReport(portfolio, suggestions, warnings)

        return PortfolioAnalysis(
            rebalancingSuggestions = suggestions,
            overweightedSectors = overweighted,
            underweightedSectors = underweighted,
            riskWarnings = warnings,
            monthlyReport = report
        )
    }

    private fun generateHeuristicResponse(question: String, context: List<ChatMessage>): String {
        val q = question.lowercase()
        return when {
            q.contains("acheter") || q.contains("achat") ->
                "Pour décider d'un achat sur la BRVM, analysez : (1) l'analyse technique (RSI < 30 = survendu), " +
                "(2) la valorisation fondamentale (PER vs secteur), (3) la liquidité du titre (préférez les valeurs actives). " +
                "⚠️ La BRVM a une faible liquidité globale. Consultez toujours un conseiller financier agréé AMF-UMOA."
            q.contains("vendre") || q.contains("vente") ->
                "Les signaux de vente sur la BRVM : RSI > 70 (suracheté), croisement MACD baissier, rupture d'un niveau de support. " +
                "Attention : sur les titres peu liquides, la vente peut prendre plusieurs séances."
            q.contains("brvm") && q.contains("indice") ->
                "Le BRVM Composite suit toutes les actions cotées, pondérées par la capitalisation. " +
                "Le BRVM 10 suit les 10 plus grandes capitalisations. Ils sont calculés quotidiennement par la BRVM à Abidjan."
            q.contains("risque") ->
                "La BRVM présente des risques spécifiques : faible liquidité (difficultés de revente), " +
                "concentration sectorielle (finance/agriculture), risque de change (CFA), et impact des matières premières. " +
                "Diversifiez votre portefeuille sur plusieurs secteurs et pays de l'UEMOA."
            q.contains("dividende") ->
                "Les dividendes BRVM sont généralement distribués en janvier-mars après les AG de fin d'année. " +
                "Les entreprises à fort dividende incluent Sonatel, SGBCI et les grandes capitalisations. " +
                "Vérifiez le calendrier dans la section Événements."
            else ->
                "Je suis votre assistant BRVM Intelligence. Je peux vous aider avec : " +
                "l'analyse technique des actions, l'interprétation des indicateurs, " +
                "la composition de votre portefeuille, et les spécificités du marché UEMOA. " +
                "Posez-moi une question spécifique sur une action ou le marché !\n\n" +
                "⚠️ Ces informations sont à titre indicatif uniquement et ne constituent pas un conseil financier réglementé."
        }
    }

    private fun buildTradeRationale(
        signal: TradingSignal,
        analysis: TechnicalAnalysis,
        prediction: StockPrediction,
        stock: Stock,
        fundamental: com.brvm.intelligence.data.ml.FundamentalAssessment,
    ): String {
        val adjustedConfidence = (analysis.signalConfidence * fundamental.confidenceAdjustment).toInt()
        val sb = StringBuilder()
        sb.appendLine("## Raisonnement de l'analyse")
        sb.appendLine()
        sb.appendLine("**Signal global : ${signal.displayName}** (confiance ajustée ${adjustedConfidence}%)")
        sb.appendLine()

        // ── Analyse technique ────────────────────────────────────────────────
        sb.appendLine("**Analyse technique :**")
        sb.appendLine("• RSI ${String.format("%.1f", analysis.rsi.value)} : ${analysis.rsi.signal.name}")
        sb.appendLine("• MACD : ${analysis.macd.signal.name}")
        sb.appendLine("• Tendance MA : ${analysis.movingAverages.trend.displayName}")
        sb.appendLine("• Bollinger : ${analysis.bollingerBands.signal.name}")
        sb.appendLine()

        // ── Prédiction IA ────────────────────────────────────────────────────
        sb.appendLine("**Prédiction IA :**")
        sb.appendLine("• ${prediction.classification.displayName} " +
                "(probabilité ${String.format("%.0f", prediction.classificationProbability * 100)}%)")
        sb.appendLine()

        // ── Valorisation fondamentale ────────────────────────────────────────
        sb.appendLine("**Valorisation fondamentale :** ${fundamental.valuationSignal.emoji} ${fundamental.valuationSignal.displayName}")
        if (fundamental.estimatedFairValue != null) {
            val premium = (stock.currentPrice - fundamental.estimatedFairValue) /
                    fundamental.estimatedFairValue * 100
            val premiumStr = if (premium >= 0) "+${String.format("%.1f", premium)}%" else "${String.format("%.1f", premium)}%"
            sb.appendLine("• Juste valeur estimée : ${String.format("%,.0f", fundamental.estimatedFairValue)} FCFA " +
                    "(cours actuel : $premiumStr vs juste valeur)")
            sb.appendLine("• Méthode : ${fundamental.valuationMethod}")
        }
        fundamental.perAnalysis?.let { sb.appendLine("• PER : $it") }
        fundamental.dividendAnalysis?.let { sb.appendLine("• Dividende : $it") }

        // Position dans le range 52 semaines
        val rangePos = String.format("%.0f", fundamental.positionIn52WeekRange * 100)
        val rangeLabel = when {
            fundamental.positionIn52WeekRange <= 0.25 -> "proche du bas 52s (potentiellement survendu)"
            fundamental.positionIn52WeekRange >= 0.75 -> "proche du haut 52s (potentiellement suracheté)"
            else                                      -> "dans la zone médiane 52s"
        }
        sb.appendLine("• Range 52 semaines : $rangePos% ($rangeLabel)")
        sb.appendLine("  [bas: ${String.format("%,.0f", stock.low52Week)} — haut: ${String.format("%,.0f", stock.high52Week)} FCFA]")
        sb.appendLine()

        // ── Alertes ──────────────────────────────────────────────────────────
        fundamental.dataQualityWarning?.let {
            sb.appendLine(it)
            sb.appendLine()
        }
        if (stock.liquidityLevel == LiquidityLevel.LOW || stock.liquidityLevel == LiquidityLevel.VERY_LOW) {
            sb.appendLine("⚠️ **ALERTE LIQUIDITÉ** : ${stock.liquidityLevel.warningMessage}")
            sb.appendLine()
        }
        sb.appendLine("*Information à titre indicatif uniquement. Non conseil financier réglementé AMF-UMOA.*")
        return sb.toString()
    }

    /** Modère le signal technique quand les fondamentaux sont opposés. */
    private fun adjustSignalWithFundamentals(
        technicalSignal: TradingSignal,
        valuationSignal: ValuationSignal,
    ): TradingSignal {
        return when {
            // Technique haussier + fondamentaux sur-évalués → rabaisser d'un cran
            technicalSignal == TradingSignal.STRONG_BUY &&
                    valuationSignal == ValuationSignal.OVERVALUED -> TradingSignal.BUY

            // Technique baissier + fondamentaux sous-évalués → rabaisser d'un cran
            technicalSignal == TradingSignal.STRONG_SELL &&
                    valuationSignal == ValuationSignal.UNDERVALUED -> TradingSignal.SELL

            // Données inconnues : garder le signal technique sans modification
            else -> technicalSignal
        }
    }

    private fun determineTimeHorizon(signal: TradingSignal, prediction: StockPrediction): String {
        return when (signal) {
            TradingSignal.STRONG_BUY -> "Court à moyen terme (1-3 mois)"
            TradingSignal.BUY -> "Moyen terme (2-6 mois)"
            TradingSignal.NEUTRAL -> "Attendre un signal plus clair"
            TradingSignal.SELL, TradingSignal.STRONG_SELL -> "Sortie recommandée à court terme"
        }
    }

    private fun generateMonthlyReport(
        portfolio: Portfolio,
        suggestions: List<RebalancingSuggestion>,
        warnings: List<String>
    ): String {
        val date = LocalDate.now()
        return """
            # Rapport Mensuel BRVM Intelligence - ${date.month.name} ${date.year}

            ## Performance du Portefeuille
            - **Valeur totale** : ${String.format("%,.0f", portfolio.totalValue)} FCFA
            - **Performance** : ${String.format("%+.2f", portfolio.totalGainPercent)}%
            - **Gain/Perte net** : ${String.format("%+,.0f", portfolio.totalGain)} FCFA

            ## Métriques de Risque
            - **Ratio de Sharpe** : ${String.format("%.2f", portfolio.metrics.sharpeRatio)}
            - **VaR 95%** : ${String.format("%,.0f", portfolio.metrics.var95)} FCFA
            - **Score de diversification** : ${portfolio.metrics.diversificationScore}/100

            ## Recommandations
            ${if (suggestions.isEmpty()) "Votre portefeuille est bien équilibré."
              else suggestions.joinToString("\n") { "• ${it.rationale}" }}

            ## Alertes
            ${if (warnings.isEmpty()) "Aucune alerte majeure."
              else warnings.joinToString("\n") { it }}

            ---
            *Rapport généré automatiquement par BRVM Intelligence. Information à titre indicatif, non conseil réglementé.*
        """.trimIndent()
    }

    private fun calculateSharpeRatio(closes: List<Double>): Double {
        if (closes.size < 2) return 0.0
        val returns = closes.zipWithNext { a, b -> (b - a) / a }
        val avgReturn = returns.average()
        val stdReturn = sqrt(returns.map { (it - avgReturn) * (it - avgReturn) }.average())
        val riskFreeDaily = 0.035 / 252  // BCEAO rate approximation
        return if (stdReturn > 0) (avgReturn - riskFreeDaily) / stdReturn * sqrt(252.0) else 0.0
    }

    private fun sqrt(value: Double) = kotlin.math.sqrt(value)
}
