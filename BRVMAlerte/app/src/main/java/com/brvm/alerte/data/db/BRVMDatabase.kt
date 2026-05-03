package com.brvm.alerte.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import com.brvm.alerte.data.db.dao.AlertDao
import com.brvm.alerte.data.db.dao.StockDao
import com.brvm.alerte.data.db.entity.*

@Database(
    entities = [
        StockEntity::class,
        PriceHistoryEntity::class,
        TechnicalIndicatorsEntity::class,
        AlertEntity::class,
        EarningsEventEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class BRVMDatabase : RoomDatabase() {
    abstract fun stockDao(): StockDao
    abstract fun alertDao(): AlertDao
}
