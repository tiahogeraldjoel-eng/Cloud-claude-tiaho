package com.joe.launcher.utils

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.joe.launcher.models.ChatMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

object ClaudeApiClient {

    private const val BASE_URL = "https://api.anthropic.com/v1/messages"
    private const val MODEL = "claude-sonnet-4-20250514"
    private const val MAX_TOKENS = 2048

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    suspend fun sendMessage(
        apiKey: String,
        messages: List<ChatMessage>,
        systemPrompt: String = ""
    ): String = withContext(Dispatchers.IO) {

        val messagesArray = JsonArray()
        messages.forEach { msg ->
            if (msg.isUser || msg.isBot) {
                val msgObj = JsonObject().apply {
                    addProperty("role", if (msg.isUser) "user" else "assistant")
                    addProperty("content", msg.text)
                }
                messagesArray.add(msgObj)
            }
        }

        val body = JsonObject().apply {
            addProperty("model", MODEL)
            addProperty("max_tokens", MAX_TOKENS)
            if (systemPrompt.isNotEmpty()) {
                addProperty("system", systemPrompt)
            }
            add("messages", messagesArray)
        }

        val request = Request.Builder()
            .url(BASE_URL)
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .addHeader("content-type", "application/json")
            .build()

        val response = client.newCall(request).execute()
        val responseBody = response.body?.string() ?: throw Exception("Réponse vide")

        if (!response.isSuccessful) {
            val errorObj = gson.fromJson(responseBody, JsonObject::class.java)
            val errorMsg = errorObj.getAsJsonObject("error")?.get("message")?.asString
                ?: "Erreur API: ${response.code}"
            throw Exception(errorMsg)
        }

        val jsonResponse = gson.fromJson(responseBody, JsonObject::class.java)
        val content = jsonResponse.getAsJsonArray("content")
            ?.get(0)?.asJsonObject
            ?.get("text")?.asString
            ?: throw Exception("Format de réponse inattendu")

        content
    }

    suspend fun analyzeStock(
        apiKey: String,
        symbol: String,
        stockData: String
    ): String = withContext(Dispatchers.IO) {
        val prompt = """Analyse cette action BRVM pour moi:

Symbole: $symbol
Données: $stockData

Donne une analyse concise avec:
1. Tendance actuelle
2. Points clés à surveiller
3. Recommandation générale (achat/vente/conservation)

Réponds en 3-4 phrases maximum."""

        sendMessage(
            apiKey = apiKey,
            messages = listOf(ChatMessage(text = prompt, isUser = true)),
            systemPrompt = "Tu es un analyste financier spécialisé en marchés africains, particulièrement la BRVM."
        )
    }
}
