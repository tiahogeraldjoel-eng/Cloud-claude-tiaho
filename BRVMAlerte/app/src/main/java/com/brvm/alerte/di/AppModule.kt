package com.brvm.alerte.di

import android.content.Context
import androidx.room.Room
import com.brvm.alerte.BuildConfig
import com.brvm.alerte.data.api.BRVMApiService
import com.brvm.alerte.data.api.BRVMScraper
import com.brvm.alerte.data.api.GithubStockService
import com.brvm.alerte.data.api.WorkerStockService
import com.brvm.alerte.data.db.BRVMDatabase
import com.brvm.alerte.data.db.dao.AlertDao
import com.brvm.alerte.data.db.dao.StockDao
import com.brvm.alerte.data.repository.AlertRepositoryImpl
import com.brvm.alerte.data.repository.StockRepositoryImpl
import com.brvm.alerte.domain.repository.AlertRepository
import com.brvm.alerte.domain.repository.StockRepository
import com.brvm.alerte.service.AlertNotificationService
import com.brvm.alerte.service.EmailService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Named("default") @Provides @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        }
        return OkHttpClient.Builder()
            .addInterceptor(logging)
            .callTimeout(12, TimeUnit.SECONDS)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()
    }

    // Timeout long dédié au Cloudflare Worker (peut prendre jusqu'à 30s)
    @Named("worker") @Provides @Singleton
    fun provideWorkerOkHttpClient(): OkHttpClient =
        OkHttpClient.Builder()
            .callTimeout(45, TimeUnit.SECONDS)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(40, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()

    @Provides @Singleton
    fun provideBRVMApiService(@Named("default") okHttpClient: OkHttpClient): BRVMApiService =
        Retrofit.Builder()
            .baseUrl(BuildConfig.BRVM_API_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(BRVMApiService::class.java)

    @Provides @Singleton
    fun provideBRVMScraper(@Named("default") okHttpClient: OkHttpClient): BRVMScraper =
        BRVMScraper(okHttpClient)

    @Provides @Singleton
    fun provideWorkerStockService(@Named("worker") workerClient: OkHttpClient): WorkerStockService =
        Retrofit.Builder()
            .baseUrl(BuildConfig.WORKER_BASE_URL)
            .client(workerClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(WorkerStockService::class.java)

    @Provides @Singleton
    fun provideGithubStockService(@Named("default") okHttpClient: OkHttpClient): GithubStockService =
        Retrofit.Builder()
            .baseUrl("https://raw.githubusercontent.com/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(GithubStockService::class.java)

    @Provides @Singleton
    fun provideBRVMDatabase(@ApplicationContext context: Context): BRVMDatabase =
        Room.databaseBuilder(context, BRVMDatabase::class.java, "brvm_alerte.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides @Singleton fun provideStockDao(db: BRVMDatabase): StockDao = db.stockDao()
    @Provides @Singleton fun provideAlertDao(db: BRVMDatabase): AlertDao = db.alertDao()
    @Provides @Singleton fun provideStockRepository(impl: StockRepositoryImpl): StockRepository = impl
    @Provides @Singleton fun provideAlertRepository(impl: AlertRepositoryImpl): AlertRepository = impl

    @Provides @Singleton
    fun provideAlertNotificationService(@ApplicationContext context: Context): AlertNotificationService =
        AlertNotificationService(context)

    @Provides @Singleton
    fun provideEmailService(): EmailService = EmailService()
}
