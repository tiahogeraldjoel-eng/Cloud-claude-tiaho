package com.brvm.intelligence.di

import android.content.Context
import androidx.room.Room
import com.brvm.intelligence.data.local.dao.PortfolioDao
import com.brvm.intelligence.data.local.dao.PriceAlertDao
import com.brvm.intelligence.data.local.dao.PriceHistoryDao
import com.brvm.intelligence.data.local.dao.StockDao
import com.brvm.intelligence.data.local.database.BRVMDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideBRVMDatabase(@ApplicationContext context: Context): BRVMDatabase {
        return Room.databaseBuilder(
            context,
            BRVMDatabase::class.java,
            BRVMDatabase.DATABASE_NAME
        )
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideStockDao(database: BRVMDatabase): StockDao = database.stockDao()

    @Provides
    fun providePriceHistoryDao(database: BRVMDatabase): PriceHistoryDao = database.priceHistoryDao()

    @Provides
    fun providePortfolioDao(database: BRVMDatabase): PortfolioDao = database.portfolioDao()

    @Provides
    fun providePriceAlertDao(database: BRVMDatabase): PriceAlertDao = database.priceAlertDao()
}
