package com.brvm.alerte.data.repository

import com.brvm.alerte.data.db.dao.AlertDao
import com.brvm.alerte.data.db.entity.AlertEntity
import com.brvm.alerte.data.db.entity.EarningsEventEntity
import com.brvm.alerte.domain.model.*
import com.brvm.alerte.domain.repository.AlertRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AlertRepositoryImpl @Inject constructor(
    private val alertDao: AlertDao
) : AlertRepository {

    override fun observeAllAlerts(): Flow<List<Alert>> =
        alertDao.observeAllAlerts().map { it.map { e -> e.toDomain() } }

    override fun observeUnreadAlerts(): Flow<List<Alert>> =
        alertDao.observeUnreadAlerts().map { it.map { e -> e.toDomain() } }

    override fun observeUnreadCount(): Flow<Int> = alertDao.observeUnreadCount()

    override fun observeAlertsForStock(ticker: String): Flow<List<Alert>> =
        alertDao.observeAlertsForStock(ticker).map { it.map { e -> e.toDomain() } }

    override fun observeUpcomingEvents(fromDate: Long): Flow<List<EarningsEvent>> =
        alertDao.observeUpcomingEvents(fromDate).map { it.map { e -> e.toDomain() } }

    override fun observeEventsForStock(ticker: String): Flow<List<EarningsEvent>> =
        alertDao.observeEventsForStock(ticker).map { it.map { e -> e.toDomain() } }

    override suspend fun saveAlert(alert: Alert): Long =
        alertDao.insertAlert(alert.toEntity())

    override suspend fun markAsRead(id: Long) = alertDao.markAsRead(id)

    override suspend fun markAllAsRead() = alertDao.markAllAsRead()

    override suspend fun updateSentChannels(id: Long, channels: Set<AlertChannel>) =
        alertDao.updateSentChannels(id, channels.joinToString(",") { it.name })

    override suspend fun saveEarningsEvents(events: List<EarningsEvent>) =
        alertDao.insertEarningsEvents(events.map { it.toEntity() })

    override suspend fun cleanOldAlerts(daysToKeep: Int) {
        val cutoff = System.currentTimeMillis() - (daysToKeep * 86400_000L)
        alertDao.deleteOldAlerts(cutoff)
    }

    private fun AlertEntity.toDomain() = Alert(
        id = id,
        ticker = ticker,
        stockName = stockName,
        type = AlertType.valueOf(type),
        priority = AlertPriority.valueOf(priority),
        title = title,
        message = message,
        recommendation = Recommendation.valueOf(recommendation),
        score = score,
        targetPrice = targetPrice,
        currentPrice = currentPrice,
        createdAt = createdAt,
        isRead = isRead,
        sentChannels = if (sentChannels.isEmpty()) emptySet()
        else sentChannels.split(",").mapNotNull {
            runCatching { AlertChannel.valueOf(it) }.getOrNull()
        }.toSet()
    )

    private fun Alert.toEntity() = AlertEntity(
        id = id,
        ticker = ticker,
        stockName = stockName,
        type = type.name,
        priority = priority.name,
        title = title,
        message = message,
        recommendation = recommendation.name,
        score = score,
        targetPrice = targetPrice,
        currentPrice = currentPrice,
        createdAt = createdAt,
        isRead = isRead,
        sentChannels = sentChannels.joinToString(",") { it.name }
    )

    private fun EarningsEventEntity.toDomain() = EarningsEvent(
        id = id,
        ticker = ticker,
        stockName = stockName,
        eventType = EarningsEvent.EventType.valueOf(eventType),
        eventDate = eventDate,
        fiscalPeriod = fiscalPeriod,
        estimatedEPS = estimatedEPS,
        actualEPS = actualEPS,
        estimatedRevenue = estimatedRevenue,
        actualRevenue = actualRevenue,
        dividendAmount = dividendAmount,
        exDividendDate = exDividendDate,
        paymentDate = paymentDate,
        description = description
    )

    private fun EarningsEvent.toEntity() = EarningsEventEntity(
        id = id,
        ticker = ticker,
        stockName = stockName,
        eventType = eventType.name,
        eventDate = eventDate,
        fiscalPeriod = fiscalPeriod,
        estimatedEPS = estimatedEPS,
        actualEPS = actualEPS,
        estimatedRevenue = estimatedRevenue,
        actualRevenue = actualRevenue,
        dividendAmount = dividendAmount,
        exDividendDate = exDividendDate,
        paymentDate = paymentDate,
        description = description
    )
}
