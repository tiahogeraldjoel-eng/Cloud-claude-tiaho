package com.brvm.intelligence.presentation.screens.chat

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brvm.intelligence.domain.model.ChatMessage
import com.brvm.intelligence.domain.model.MessageRole
import com.brvm.intelligence.presentation.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onBack: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    // Auto-scroll vers le bas lors de nouveaux messages
    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            color = BRVMGreen,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.size(32.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Psychology,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("Assistant BRVM", fontWeight = FontWeight.Bold)
                            Text(
                                "Analyste IA spécialisé UEMOA",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Retour")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::clearConversation) {
                        Icon(Icons.Default.DeleteSweep, "Effacer la conversation")
                    }
                }
            )
        },
        bottomBar = {
            ChatInputBar(
                inputText = uiState.inputText,
                isLoading = uiState.isLoading,
                onInputChange = viewModel::onInputChange,
                onSend = { viewModel.sendMessage() }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (uiState.messages.isEmpty()) {
                ChatWelcomeState(
                    suggestions = uiState.suggestedQuestions,
                    onSuggestionClick = { viewModel.sendMessage(it) },
                    modifier = Modifier.weight(1f)
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(uiState.messages, key = { it.id }) { message ->
                        ChatBubble(message = message)
                    }
                    if (uiState.isLoading) {
                        item { TypingIndicator() }
                    }
                }

                // Questions suggérées contextuelles
                if (uiState.suggestedQuestions.isNotEmpty() && !uiState.isLoading) {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(uiState.suggestedQuestions) { suggestion ->
                            SuggestionChip(
                                onClick = { viewModel.sendMessage(suggestion) },
                                label = { Text(suggestion, style = MaterialTheme.typography.bodySmall) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(message: ChatMessage) {
    val isUser = message.role == MessageRole.USER
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        if (!isUser) {
            Surface(
                color = BRVMGreen,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.size(32.dp).align(Alignment.Bottom)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Default.Psychology,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
        }

        Surface(
            color = if (isUser) BRVMGreen else MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isUser) 16.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 16.dp
            ),
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Text(
                text = message.content,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = if (isUser) Color.White else MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@Composable
private fun TypingIndicator() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            color = BRVMGreen,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.size(32.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Psychology, null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
        }
        Spacer(Modifier.width(8.dp))
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 16.dp, bottomStart = 4.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(12.dp),
                    strokeWidth = 2.dp,
                    color = BRVMGreen
                )
                Text(
                    "Analyse en cours...",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun ChatWelcomeState(
    suggestions: List<String>,
    onSuggestionClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            color = BRVMGreen.copy(alpha = 0.1f),
            shape = RoundedCornerShape(24.dp),
            modifier = Modifier.size(80.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Default.Psychology,
                    contentDescription = null,
                    tint = BRVMGreen,
                    modifier = Modifier.size(48.dp)
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Assistant BRVM Intelligence",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = BRVMGreen
        )
        Text(
            "Posez vos questions sur les marchés financiers UEMOA, les actions cotées, ou demandez une analyse.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, bottom = 24.dp)
        )
        Text(
            "Questions suggérées :",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.height(8.dp))
        suggestions.forEach { suggestion ->
            OutlinedButton(
                onClick = { onSuggestionClick(suggestion) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                border = BorderStroke(1.dp, BRVMGreen.copy(alpha = 0.5f))
            ) {
                Text(suggestion, style = MaterialTheme.typography.bodySmall)
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "⚠️ Informations à titre indicatif uniquement",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun ChatInputBar(
    inputText: String,
    isLoading: Boolean,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit
) {
    Surface(
        tonalElevation = 4.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .navigationBarsPadding(),
            verticalAlignment = Alignment.Bottom
        ) {
            OutlinedTextField(
                value = inputText,
                onValueChange = onInputChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Posez votre question...") },
                maxLines = 4,
                shape = RoundedCornerShape(24.dp),
                enabled = !isLoading
            )
            Spacer(Modifier.width(8.dp))
            FloatingActionButton(
                onClick = onSend,
                containerColor = if (inputText.isNotBlank() && !isLoading) BRVMGreen
                                 else MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.size(48.dp),
                elevation = FloatingActionButtonDefaults.elevation(0.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = BRVMGreen
                    )
                } else {
                    Icon(
                        Icons.Default.Send,
                        contentDescription = "Envoyer",
                        tint = if (inputText.isNotBlank()) Color.White
                               else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
