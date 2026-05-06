package com.brvm.intelligence.data.local.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import com.brvm.intelligence.data.local.dao.PortfolioDao
import com.brvm.intelligence.data.local.dao.PriceAlertDao
import com.brvm.intelligence.data.local.dao.PriceHistoryDao
import com.brvm.intelligence.data.local.dao.StockDao
import com.brvm.intelligence.data.local.entity.PortfolioPositionEntity
import com.brvm.intelligence.data.local.entity.PriceAlertEntity
import com.brvm.intelligence.data.local.entity.PriceHistoryEntity
import com.brvm.intelligence.data.local.entity.StockEntity

@Database(
    entities = [
        StockEntity::class,
        PriceHistoryEntity::class,
        PortfolioPositionEntity::class,
        PriceAlertEntity::class
    ],
    version = 1,
    exportSchema = true
)
@TypeConverters(BRVMTypeConverters::class)
abstract class BRVMDatabase : RoomDatabase() {
    abstract fun stockDao(): StockDao
    abstract fun priceHistoryDao(): PriceHistoryDao
    abstract fun portfolioDao(): PortfolioDao
    abstract fun priceAlertDao(): PriceAlertDao

    companion object {
        const val DATABASE_NAME = "brvm_intelligence.db"
    }
}

class BRVMTypeConverters {
    @TypeConverter
    fun fromStringList(value: String?): List<String> =
        value?.split(",")?.filter { it.isNotBlank() } ?: emptyList()

    @TypeConverter
    fun toStringList(list: List<String>): String = list.joinToString(",")
}
