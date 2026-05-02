package com.brvm.alerte.data.db.dao

import androidx.room.*
import com.brvm.alerte.data.db.entity.AlertEntity
import com.brvm.alerte.data.db.entity.EarningsEventEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AlertDao {

    @Query("SELECT * FROM alerts ORDER BY createdAt DESC")
    fun observeAllAlerts(): Flow<List<AlertEntity>>

    @Query("SELECT * FROM alerts WHERE isRead = 0 ORDER BY createdAt DESC")
    fun observeUnreadAlerts(): Flow<List<AlertEntity>>

    @Query("SELECT * FROM alerts WHERE priority = 'URGENT' ORDER BY createdAt DESC")
    fun observeUrgentAlerts(): Flow<List<AlertEntity>>

    @Query("SELECT * FROM alerts WHERE ticker = :ticker ORDER BY createdAt DESC")
    fun observeAlertsForStock(ticker: String): Flow<List<AlertEntity>>

    @Query("SELECT COUNT(*) FROM alerts WHERE isRead = 0")
    fun observeUnreadCount(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAlert(alert: AlertEntity): Long

    @Query("UPDATE alerts SET isRead = 1 WHERE id = :id")
    suspend fun markAsRead(id: Long)

    @Query("UPDATE alerts SET isRead = 1")
    suspend fun markAllAsRead()

    @Query("DELETE FROM alerts WHERE createdAt < :beforeEpoch")
    suspend fun deleteOldAlerts(beforeEpoch: Long)

    @Query("UPDATE alerts SET sentChannels = :channels WHERE id = :id")
    suspend fun updateSentChannels(id: Long, channels: String)

    @Query("SELECT * FROM earnings_events WHERE eventDate >= :fromDate ORDER BY eventDate ASC")
    fun observeUpcomingEvents(fromDate: Long): Flow<List<EarningsEventEntity>>

    @Query("SELECT * FROM earnings_events WHERE ticker = :ticker ORDER BY eventDate DESC")
    fun observeEventsForStock(ticker: String): Flow<List<EarningsEventEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEarningsEvents(events: List<EarningsEventEntity>)

    @Query("SELECT * FROM earnings_events WHERE eventDate BETWEEN :from AND :to ORDER BY eventDate ASC")
    suspend fun getEventsInRange(from: Long, to: Long): List<EarningsEventEntity>
}
