package com.brvm.alerte.di

import android.content.Context
import com.brvm.alerte.util.WorkManagerHelper
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object WorkManagerModule {

    @Provides @Singleton
    fun provideWorkManagerHelper(@ApplicationContext context: Context): WorkManagerHelper =
        WorkManagerHelper(context)
}
