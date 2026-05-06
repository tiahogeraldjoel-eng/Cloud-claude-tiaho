package com.brvm.intelligence.data.repository

import com.brvm.intelligence.data.local.dao.PortfolioDao
import com.brvm.intelligence.data.local.entity.toDomain
import com.brvm.intelligence.data.local.entity.toEntity
import com.brvm.intelligence.domain.model.*
import com.brvm.intelligence.domain.repository.PortfolioRepository
import com.brvm.intelligence.security.PortfolioEncryption
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PortfolioRepositoryImpl @Inject constructor(
    private val portfolioDao: PortfolioDao,
    private val encryption: PortfolioEncryption
) : PortfolioRepository {

    override fun getAllPositions(): Flow<List<PortfolioPosition>> =
        portfolioDao.getAllPositions().map { entities -> entities.map { it.toDomain() } }

    override fun getPortfolio(): Flow<Portfolio> =
        portfolioDao.getAllPositions().map { entities ->
            val positions = entities.map { it.toDomain() }
            buildPortfolio(positions)
        }

    override suspend fun addPosition(position: PortfolioPosition) {
        portfolioDao.insertPosition(position.toEntity())
        Timber.d("Position ajoutée: ${position.symbol} x${position.quantity}")
    }

    override suspend fun updatePosition(position: PortfolioPosition) {
        portfolioDao.updatePosition(position.toEntity())
    }

    override suspend fun deletePosition(positionId: Long) {
        portfolioDao.deletePosition(positionId)
    }

    override suspend fun getPositionBySymbol(symbol: String): PortfolioPosition? =
        portfolioDao.getPositionBySymbol(symbol)?.toDomain()

    override suspend fun getInvestorProfile(): InvestorProfile? =
        encryption.loadInvestorProfile()

    override suspend fun saveInvestorProfile(profile: InvestorProfile) {
        encryption.saveInvestorProfile(profile)
    }

    override fun getTransactionHistory(): Flow<List<PortfolioPosition>> =
        portfolioDao.getAllPositions().map { entities -> entities.map { it.toDomain() } }

    private fun buildPortfolio(positions: List<PortfolioPosition>): Portfolio {
        val totalValue = positions.sumOf { it.currentValue }
        val totalCost = positions.sumOf { it.purchaseCost }
        val totalGain = totalValue - totalCost
        val totalGainPercent = if (totalCost > 0) (totalGain / totalCost) * 100 else 0.0

        // Allocation sectorielle
        val sectorAllocation = mutableMapOf<BRVMSector, Double>()
        BRVMSector.values().forEach { sector ->
            val sectorValue = positions.filter { it.sector == sector }.sumOf { it.currentValue }
            if (sectorValue > 0 && totalValue > 0) {
                sectorAllocation[sector] = (sectorValue / totalValue) * 100
            }
        }

        val metrics = calculatePortfolioMetrics(positions, totalValue, totalCost)
        val benchmarkComparison = BenchmarkComparison(
            portfolioReturn = totalGainPercent,
            brvmCompositeReturn = 0.0,       // À remplir avec données BRVM réelles
            alpha = totalGainPercent,
            period = "Depuis création"
        )

        return Portfolio(
            positions = positions,
            totalValue = totalValue,
            totalCost = totalCost,
            totalGain = totalGain,
            totalGainPercent = totalGainPercent,
            sectorAllocation = sectorAllocation,
            metrics = metrics,
            benchmarkComparison = benchmarkComparison
        )
    }

    private fun calculatePortfolioMetrics(
        positions: List<PortfolioPosition>,
        totalValue: Double,
        totalCost: Double
    ): PortfolioMetrics {
        if (positions.isEmpty()) {
            return PortfolioMetrics(0.0, 0.0, 0.0, 0.0, 0.0, 0)
        }

        val returns = positions.map { it.percentGain / 100 }
        val avgReturn = returns.average()

        // Volatilité simplifiée (écart-type des rendements)
        val variance = returns.map { (it - avgReturn) * (it - avgReturn) }.average()
        val volatility = Math.sqrt(variance) * 100

        // Sharpe Ratio (taux sans risque ≈ taux BCEAO 3.5%)
        val riskFreeRate = 0.035
        val sharpeRatio = if (volatility > 0) (avgReturn - riskFreeRate / 12) / (volatility / 100) else 0.0

        // VaR 95% (approximation paramétrique)
        val var95 = totalValue * volatility / 100 * 1.645

        // Score de diversification (basé sur le nombre de secteurs)
        val sectors = positions.map { it.sector }.distinct().size
        val maxConcentration = positions.maxOfOrNull { it.currentValue / totalValue * 100 } ?: 100.0
        val diversificationScore = minOf(100, (sectors * 15) + (if (maxConcentration < 30) 25 else 0))

        return PortfolioMetrics(
            sharpeRatio = sharpeRatio,
            beta = 1.0,             // Beta vs BRVM Composite (à calculer avec données historiques)
            var95 = var95,
            volatility = volatility,
            maxDrawdown = 0.0,      // À calculer avec l'historique du portefeuille
            diversificationScore = diversificationScore
        )
    }
}
