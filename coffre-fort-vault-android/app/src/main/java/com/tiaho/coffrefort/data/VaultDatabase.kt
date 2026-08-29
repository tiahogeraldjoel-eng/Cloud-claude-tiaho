package com.tiaho.coffrefort.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [DocumentEntity::class], version = 1, exportSchema = false)
abstract class VaultDatabase : RoomDatabase() {

    abstract fun documentDao(): DocumentDao

    companion object {
        @Volatile private var instance: VaultDatabase? = null

        fun getInstance(context: Context): VaultDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    VaultDatabase::class.java,
                    "vault.db"
                ).build().also { instance = it }
            }
    }
}
