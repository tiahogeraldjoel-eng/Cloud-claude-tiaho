package com.joe.launcher.activities

import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.joe.launcher.BuildConfig
import com.joe.launcher.R
import com.joe.launcher.adapters.ChatAdapter
import com.joe.launcher.databinding.ActivityClaudeBinding
import com.joe.launcher.models.ChatMessage
import com.joe.launcher.utils.ClaudeApiClient
import com.joe.launcher.utils.PrefsManager
import kotlinx.coroutines.launch

class ClaudeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityClaudeBinding
    private lateinit var chatAdapter: ChatAdapter
    private val messages = mutableListOf<ChatMessage>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityClaudeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupChat()
        setupInput()
        loadChatHistory()
    }

    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.btnClearChat.setOnClickListener {
            messages.clear()
            chatAdapter.notifyDataSetChanged()
            PrefsManager.clearChatHistory()
        }
        binding.btnApiKey.setOnClickListener {
            showApiKeyDialog()
        }
    }

    private fun setupChat() {
        chatAdapter = ChatAdapter()
        binding.rvMessages.apply {
            layoutManager = LinearLayoutManager(this@ClaudeActivity).apply {
                stackFromEnd = true
            }
            adapter = chatAdapter
        }

        // Message de bienvenue
        val apiKey = PrefsManager.getClaudeApiKey()
        if (apiKey.isEmpty()) {
            addSystemMessage(getString(R.string.claude_welcome_no_key))
        } else {
            addSystemMessage(getString(R.string.claude_welcome))
        }
    }

    private fun setupInput() {
        binding.btnSend.setOnClickListener {
            val text = binding.etMessage.text.toString().trim()
            if (text.isNotEmpty()) {
                sendMessage(text)
                binding.etMessage.setText("")
            }
        }

        binding.btnMic.setOnClickListener {
            // Voice input (future enhancement)
        }
    }

    private fun sendMessage(text: String) {
        val userMsg = ChatMessage(text = text, isUser = true)
        messages.add(userMsg)
        chatAdapter.submitList(messages.toList())
        scrollToBottom()

        val apiKey = PrefsManager.getClaudeApiKey().ifEmpty {
            BuildConfig.CLAUDE_API_KEY
        }

        if (apiKey.isEmpty()) {
            addBotMessage(getString(R.string.claude_no_api_key))
            showApiKeyDialog()
            return
        }

        // Afficher l'indicateur de frappe
        binding.layoutTyping.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val response = ClaudeApiClient.sendMessage(
                    apiKey = apiKey,
                    messages = messages.filter { it.isUser || it.isBot },
                    systemPrompt = buildSystemPrompt()
                )
                binding.layoutTyping.visibility = View.GONE
                addBotMessage(response)
                saveChatHistory()
            } catch (e: Exception) {
                binding.layoutTyping.visibility = View.GONE
                addBotMessage(getString(R.string.claude_error, e.message ?: "Erreur inconnue"))
            }
        }
    }

    private fun buildSystemPrompt(): String {
        return """Tu es Joe, un assistant IA intégré dans le launcher Android Launcher Joe.
Tu aides l'utilisateur avec :
- Questions générales et assistance quotidienne
- Analyse des marchés boursiers BRVM (Bourse Régionale des Valeurs Mobilières d'Afrique de l'Ouest)
- Conseils financiers basés sur les données BRVM
- Rappels et organisation personnelle
- Navigation dans le launcher

Tu réponds en français par défaut, mais tu t'adaptes à la langue de l'utilisateur.
Sois concis, utile et professionnel."""
    }

    private fun addSystemMessage(text: String) {
        messages.add(ChatMessage(text = text, isUser = false, isSystem = true))
        chatAdapter.submitList(messages.toList())
        scrollToBottom()
    }

    private fun addBotMessage(text: String) {
        val botMsg = ChatMessage(text = text, isUser = false, isBot = true)
        messages.add(botMsg)
        chatAdapter.submitList(messages.toList())
        scrollToBottom()
    }

    private fun scrollToBottom() {
        if (messages.isNotEmpty()) {
            binding.rvMessages.smoothScrollToPosition(messages.size - 1)
        }
    }

    private fun loadChatHistory() {
        val history = PrefsManager.getChatHistory()
        if (history.isNotEmpty()) {
            messages.addAll(history)
            chatAdapter.submitList(messages.toList())
            scrollToBottom()
        }
    }

    private fun saveChatHistory() {
        val recent = messages.takeLast(50)
        PrefsManager.saveChatHistory(recent)
    }

    private fun showApiKeyDialog() {
        val dialog = ApiKeyDialog()
        dialog.show(supportFragmentManager, "api_key")
    }
}
