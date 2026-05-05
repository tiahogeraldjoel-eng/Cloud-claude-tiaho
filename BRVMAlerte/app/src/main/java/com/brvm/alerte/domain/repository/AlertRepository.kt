package com.brvm.alerte.domain.repository

import com.brvm.alerte.domain.model.Alert
import com.brvm.alerte.domain.model.AlertChannel
import com.brvm.alerte.domain.model.EarningsEvent
import kotlinx.coroutines.flow.Flow

interface AlertRepository {
    fun observeAllAlerts(): Flow<List<Alert>>
    fun observeUnreadAlerts(): Flow<List<Alert>>
    fun observeUnreadCount(): Flow<Int>
    fun observeAlertsForStock(ticker: String): Flow<List<Alert>>
    fun observeUpcomingEvents(fromDate: Long): Flow<List<EarningsEvent>>
    fun observeEventsForStock(ticker: String): Flow<List<EarningsEvent>>
    suspend fun saveAlert(alert: Alert): Long
    suspend fun markAsRead(id: Long)
    suspend fun markAllAsRead()
    suspend fun updateSentChannels(id: Long, channels: Set<AlertChannel>)
    suspend fun saveEarningsEvents(events: List<EarningsEvent>)
    suspend fun cleanOldAlerts(daysToKeep: Int)
}
