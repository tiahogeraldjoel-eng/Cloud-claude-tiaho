package com.tiaho.coffrefort.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [DocumentEntity::class], version = 2, exportSchema = false)
abstract class VaultDatabase : RoomDatabase() {

    abstract fun documentDao(): DocumentDao

    companion object {
        @Volatile private var instance: VaultDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE documents ADD COLUMN encryptedPathBack TEXT")
            }
        }

        fun getInstance(context: Context): VaultDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    VaultDatabase::class.java,
                    "vault.db"
                ).addMigrations(MIGRATION_1_2).build().also { instance = it }
            }
    }
}
