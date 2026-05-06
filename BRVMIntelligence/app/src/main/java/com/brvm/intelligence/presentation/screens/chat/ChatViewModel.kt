package com.brvm.intelligence.presentation.screens.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brvm.intelligence.domain.model.ChatMessage
import com.brvm.intelligence.domain.model.MessageRole
import com.brvm.intelligence.domain.usecase.AskAIUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val inputText: String = "",
    val isLoading: Boolean = false,
    val suggestedQuestions: List<String> = DEFAULT_SUGGESTIONS
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val askAIUseCase: AskAIUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    fun onInputChange(text: String) {
        _uiState.update { it.copy(inputText = text) }
    }

    fun sendMessage(text: String = _uiState.value.inputText) {
        if (text.isBlank() || _uiState.value.isLoading) return

        val userMessage = ChatMessage(
            id = System.currentTimeMillis(),
            content = text,
            role = MessageRole.USER
        )

        _uiState.update {
            it.copy(
                messages = it.messages + userMessage,
                inputText = "",
                isLoading = true,
                suggestedQuestions = emptyList()
            )
        }

        viewModelScope.launch {
            try {
                val response = askAIUseCase(text, _uiState.value.messages)
                val assistantMessage = ChatMessage(
                    id = System.currentTimeMillis() + 1,
                    content = response,
                    role = MessageRole.ASSISTANT
                )
                _uiState.update {
                    it.copy(
                        messages = it.messages + assistantMessage,
                        isLoading = false,
                        suggestedQuestions = getContextualSuggestions(text)
                    )
                }
            } catch (e: Exception) {
                val errorMessage = ChatMessage(
                    id = System.currentTimeMillis() + 1,
                    content = "Désolé, une erreur est survenue : ${e.message}. Veuillez réessayer.",
                    role = MessageRole.ASSISTANT
                )
                _uiState.update {
                    it.copy(
                        messages = it.messages + errorMessage,
                        isLoading = false
                    )
                }
            }
        }
    }

    fun clearConversation() {
        _uiState.update { it.copy(messages = emptyList(), suggestedQuestions = DEFAULT_SUGGESTIONS) }
    }

    private fun getContextualSuggestions(lastQuestion: String): List<String> {
        val q = lastQuestion.lowercase()
        return when {
            q.contains("acheter") || q.contains("achat") -> listOf(
                "Quel est le stop-loss recommandé ?",
                "Comment dimensionner ma position ?",
                "Quels sont les risques ?"
            )
            q.contains("brvm") || q.contains("marché") -> listOf(
                "Quels secteurs surperforment ?",
                "Quel est l'indice Fear & Greed ?",
                "Quels sont les prochains événements ?"
            )
            else -> DEFAULT_SUGGESTIONS
        }
    }

    companion object {
        val DEFAULT_SUGGESTIONS = listOf(
            "Quelle action acheter sur la BRVM ?",
            "Comment lire le RSI ?",
            "Quels sont les risques de la BRVM ?",
            "Expliquez-moi les dividendes BRVM",
            "Comment diversifier mon portefeuille ?"
        )
    }
}
