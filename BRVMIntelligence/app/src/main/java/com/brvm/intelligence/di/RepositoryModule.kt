package com.brvm.intelligence.di

import com.brvm.intelligence.data.repository.AnalysisRepositoryImpl
import com.brvm.intelligence.data.repository.PortfolioRepositoryImpl
import com.brvm.intelligence.data.repository.StockRepositoryImpl
import com.brvm.intelligence.domain.repository.AnalysisRepository
import com.brvm.intelligence.domain.repository.PortfolioRepository
import com.brvm.intelligence.domain.repository.StockRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindStockRepository(
        impl: StockRepositoryImpl
    ): StockRepository

    @Binds
    @Singleton
    abstract fun bindPortfolioRepository(
        impl: PortfolioRepositoryImpl
    ): PortfolioRepository

    @Binds
    @Singleton
    abstract fun bindAnalysisRepository(
        impl: AnalysisRepositoryImpl
    ): AnalysisRepository
}
