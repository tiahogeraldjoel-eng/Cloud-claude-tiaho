package com.joe.launcher.utils

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.joe.launcher.models.ChatMessage

object PrefsManager {

    private const val PREFS_NAME = "launcher_joe_prefs"
    private const val KEY_CLAUDE_API_KEY = "claude_api_key"
    private const val KEY_DARK_THEME = "dark_theme"
    private const val KEY_GRID_COLUMNS = "grid_columns"
    private const val KEY_DOCK_ICONS = "dock_icon_count"
    private const val KEY_SHOW_LABELS = "show_app_labels"
    private const val KEY_NOTIF_BADGES = "notif_badges"
    private const val KEY_BRVM_AUTO_REFRESH = "brvm_auto_refresh"
    private const val KEY_BRVM_INTERVAL = "brvm_refresh_interval"
    private const val KEY_BIRTHDAY_NOTIF = "birthday_notif"
    private const val KEY_DOCK_PACKAGES = "dock_packages"
    private const val KEY_CHAT_HISTORY = "chat_history"
    private const val KEY_BRVM_FAVORITES = "brvm_favorites"

    private lateinit var prefs: SharedPreferences
    private val gson = Gson()

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    // Claude API
    fun getClaudeApiKey(): String = prefs.getString(KEY_CLAUDE_API_KEY, "") ?: ""
    fun setClaudeApiKey(key: String) = prefs.edit().putString(KEY_CLAUDE_API_KEY, key).apply()

    // Theme
    fun isDarkTheme(): Boolean = prefs.getBoolean(KEY_DARK_THEME, true)
    fun setDarkTheme(enabled: Boolean) = prefs.edit().putBoolean(KEY_DARK_THEME, enabled).apply()

    // Grid
    fun getGridColumns(): Int = prefs.getInt(KEY_GRID_COLUMNS, 4)
    fun setGridColumns(cols: Int) = prefs.edit().putInt(KEY_GRID_COLUMNS, cols).apply()

    // Dock
    fun getDockIconCount(): Int = prefs.getInt(KEY_DOCK_ICONS, 5)
    fun setDockIconCount(count: Int) = prefs.edit().putInt(KEY_DOCK_ICONS, count).apply()

    fun getDockApps(): List<String> {
        val json = prefs.getString(KEY_DOCK_PACKAGES, "") ?: ""
        if (json.isEmpty()) return emptyList()
        return try {
            val type = object : TypeToken<List<String>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (e: Exception) { emptyList() }
    }

    fun setDockApps(packages: List<String>) {
        prefs.edit().putString(KEY_DOCK_PACKAGES, gson.toJson(packages)).apply()
    }

    // App labels
    fun showAppLabels(): Boolean = prefs.getBoolean(KEY_SHOW_LABELS, true)
    fun setShowAppLabels(show: Boolean) = prefs.edit().putBoolean(KEY_SHOW_LABELS, show).apply()

    // Notification badges
    fun showNotifBadges(): Boolean = prefs.getBoolean(KEY_NOTIF_BADGES, true)
    fun setShowNotifBadges(show: Boolean) = prefs.edit().putBoolean(KEY_NOTIF_BADGES, show).apply()

    // BRVM
    fun isBrvmAutoRefresh(): Boolean = prefs.getBoolean(KEY_BRVM_AUTO_REFRESH, true)
    fun setBrvmAutoRefresh(enabled: Boolean) = prefs.edit().putBoolean(KEY_BRVM_AUTO_REFRESH, enabled).apply()

    fun getBrvmRefreshInterval(): Int = prefs.getInt(KEY_BRVM_INTERVAL, 30)
    fun setBrvmRefreshInterval(minutes: Int) = prefs.edit().putInt(KEY_BRVM_INTERVAL, minutes).apply()

    fun getBRVMFavorites(): Set<String> {
        val json = prefs.getString(KEY_BRVM_FAVORITES, "") ?: ""
        if (json.isEmpty()) return emptySet()
        return try {
            val type = object : TypeToken<Set<String>>() {}.type
            gson.fromJson(json, type) ?: emptySet()
        } catch (e: Exception) { emptySet() }
    }

    fun setBRVMFavorites(favorites: Set<String>) {
        prefs.edit().putString(KEY_BRVM_FAVORITES, gson.toJson(favorites)).apply()
    }

    // Birthdays
    fun isBirthdayNotifEnabled(): Boolean = prefs.getBoolean(KEY_BIRTHDAY_NOTIF, true)
    fun setBirthdayNotifEnabled(enabled: Boolean) = prefs.edit().putBoolean(KEY_BIRTHDAY_NOTIF, enabled).apply()

    // Chat history
    fun getChatHistory(): List<ChatMessage> {
        val json = prefs.getString(KEY_CHAT_HISTORY, "") ?: ""
        if (json.isEmpty()) return emptyList()
        return try {
            val type = object : TypeToken<List<ChatMessage>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (e: Exception) { emptyList() }
    }

    fun saveChatHistory(messages: List<ChatMessage>) {
        prefs.edit().putString(KEY_CHAT_HISTORY, gson.toJson(messages)).apply()
    }

    fun clearChatHistory() {
        prefs.edit().remove(KEY_CHAT_HISTORY).apply()
    }

    fun resetToDefaults() {
        prefs.edit()
            .putBoolean(KEY_DARK_THEME, true)
            .putInt(KEY_GRID_COLUMNS, 4)
            .putInt(KEY_DOCK_ICONS, 5)
            .putBoolean(KEY_SHOW_LABELS, true)
            .putBoolean(KEY_NOTIF_BADGES, true)
            .putBoolean(KEY_BRVM_AUTO_REFRESH, true)
            .putInt(KEY_BRVM_INTERVAL, 30)
            .putBoolean(KEY_BIRTHDAY_NOTIF, true)
            .apply()
    }
}
