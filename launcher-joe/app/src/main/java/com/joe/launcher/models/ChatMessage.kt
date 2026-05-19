package com.joe.launcher.models

import java.util.Date

data class ChatMessage(
    val text: String,
    val isUser: Boolean,
    val isBot: Boolean = false,
    val isSystem: Boolean = false,
    val timestamp: Long = System.currentTimeMillis()
)
