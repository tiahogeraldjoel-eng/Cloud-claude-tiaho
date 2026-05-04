package com.brvm.alerte.data.api

import com.brvm.alerte.data.api.dto.MarketSummaryDto
import com.brvm.alerte.data.api.dto.PriceHistoryResponse
import com.brvm.alerte.data.api.dto.StockListResponse
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface BRVMApiService {

    @GET("api/stocks/")
    suspend fun getAllStocks(): StockListResponse

    @GET("api/stocks/{ticker}/")
    suspend fun getStock(@Path("ticker") ticker: String): StockListResponse

    @GET("api/stocks/{ticker}/history/")
    suspend fun getPriceHistory(
        @Path("ticker") ticker: String,
        @Query("start_date") startDate: String? = null,
        @Query("end_date") endDate: String? = null,
        @Query("period") period: String = "1y"
    ): PriceHistoryResponse

    @GET("api/market/summary/")
    suspend fun getMarketSummary(): MarketSummaryDto
}
