package com.brvm.intelligence.domain.repository

import com.brvm.intelligence.domain.model.*
import kotlinx.coroutines.flow.Flow

interface PortfolioRepository {

    /** Toutes les positions du portefeuille (chiffrées AES-256) */
    fun getAllPositions(): Flow<List<PortfolioPosition>>

    /** Valeur totale du portefeuille avec les cours actuels */
    fun getPortfolio(): Flow<Portfolio>

    suspend fun addPosition(position: PortfolioPosition)

    suspend fun updatePosition(position: PortfolioPosition)

    suspend fun deletePosition(positionId: Long)

    suspend fun getPositionBySymbol(symbol: String): PortfolioPosition?

    /** Profil investisseur sauvegardé */
    suspend fun getInvestorProfile(): InvestorProfile?

    suspend fun saveInvestorProfile(profile: InvestorProfile)

    /** Historique des transactions */
    fun getTransactionHistory(): Flow<List<PortfolioPosition>>
}
