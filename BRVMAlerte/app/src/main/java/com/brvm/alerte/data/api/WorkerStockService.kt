package com.brvm.alerte.data.api

import com.brvm.alerte.data.api.dto.GithubStockResponse
import retrofit2.http.GET

interface WorkerStockService {

    /**
     * Cloudflare Worker — source principale des cours BRVM.
     * Scrape SikaFinance côté serveur, renvoie JSON identique au format GitHub.
     * URL : https://brvm-prices.<compte>.workers.dev/
     */
    @GET(".")
    suspend fun getLatestStocks(): GithubStockResponse
}
