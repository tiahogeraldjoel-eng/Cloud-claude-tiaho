package com.brvm.alerte.data.api

import com.brvm.alerte.data.api.dto.GithubStockResponse
import retrofit2.http.GET

interface GithubStockService {

    /**
     * Fetch BRVM stock prices published by the GitHub Actions scraper.
     * URL resolves to:
     * https://raw.githubusercontent.com/tiahogeraldjoel-eng/Cloud-claude-tiaho/main/data/brvm_stocks.json
     */
    @GET("tiahogeraldjoel-eng/Cloud-claude-tiaho/main/data/brvm_stocks.json")
    suspend fun getLatestStocks(): GithubStockResponse
}
