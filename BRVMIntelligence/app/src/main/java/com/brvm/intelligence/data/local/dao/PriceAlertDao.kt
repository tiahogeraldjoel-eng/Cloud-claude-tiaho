package com.brvm.intelligence.data.local.dao

import androidx.room.*
import com.brvm.intelligence.data.local.entity.PriceAlertEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PriceAlertDao {

    @Query("SELECT * FROM price_alerts WHERE isActive = 1 ORDER BY createdAt DESC")
    fun getAllActiveAlerts(): Flow<List<PriceAlertEntity>>

    @Query("SELECT * FROM price_alerts WHERE symbol = :symbol AND isActive = 1")
    suspend fun getAlertsForSymbol(symbol: String): List<PriceAlertEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAlert(alert: PriceAlertEntity): Long

    @Query("DELETE FROM price_alerts WHERE id = :alertId")
    suspend fun deleteAlert(alertId: Long)

    @Query("UPDATE price_alerts SET isActive = 0 WHERE id = :id")
    suspend fun deactivateAlert(id: Long)

    @Query("SELECT COUNT(*) FROM price_alerts WHERE isActive = 1")
    suspend fun countActiveAlerts(): Int
}
