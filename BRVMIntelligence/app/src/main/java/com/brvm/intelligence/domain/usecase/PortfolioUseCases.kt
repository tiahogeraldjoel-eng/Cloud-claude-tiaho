package com.brvm.intelligence.domain.usecase

import com.brvm.intelligence.domain.model.InvestorProfile
import com.brvm.intelligence.domain.model.Portfolio
import com.brvm.intelligence.domain.model.PortfolioPosition
import com.brvm.intelligence.domain.repository.PortfolioRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class GetPortfolioUseCase @Inject constructor(
    private val portfolioRepository: PortfolioRepository
) {
    operator fun invoke(): Flow<Portfolio> = portfolioRepository.getPortfolio()
}

class AddPortfolioPositionUseCase @Inject constructor(
    private val portfolioRepository: PortfolioRepository
) {
    suspend operator fun invoke(position: PortfolioPosition) =
        portfolioRepository.addPosition(position)
}

class UpdatePortfolioPositionUseCase @Inject constructor(
    private val portfolioRepository: PortfolioRepository
) {
    suspend operator fun invoke(position: PortfolioPosition) =
        portfolioRepository.updatePosition(position)
}

class DeletePortfolioPositionUseCase @Inject constructor(
    private val portfolioRepository: PortfolioRepository
) {
    suspend operator fun invoke(positionId: Long) =
        portfolioRepository.deletePosition(positionId)
}

class GetInvestorProfileUseCase @Inject constructor(
    private val portfolioRepository: PortfolioRepository
) {
    suspend operator fun invoke(): InvestorProfile? =
        portfolioRepository.getInvestorProfile()
}

class SaveInvestorProfileUseCase @Inject constructor(
    private val portfolioRepository: PortfolioRepository
) {
    suspend operator fun invoke(profile: InvestorProfile) =
        portfolioRepository.saveInvestorProfile(profile)
}
