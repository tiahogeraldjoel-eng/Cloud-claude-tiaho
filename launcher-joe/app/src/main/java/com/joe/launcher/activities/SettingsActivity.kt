package com.joe.launcher.activities

import android.app.AlertDialog
import android.app.WallpaperManager
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.joe.launcher.R
import com.joe.launcher.databinding.ActivitySettingsBinding
import com.joe.launcher.utils.PrefsManager

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        loadSettings()
        setupListeners()
    }

    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener { finish() }
    }

    private fun loadSettings() {
        // Grid size
        binding.sliderGridColumns.value = PrefsManager.getGridColumns().toFloat()
        binding.tvGridColumns.text = "${PrefsManager.getGridColumns()} colonnes"

        // Dark theme
        binding.switchDarkTheme.isChecked = PrefsManager.isDarkTheme()

        // Dock icons count
        binding.sliderDockIcons.value = PrefsManager.getDockIconCount().toFloat()
        binding.tvDockCount.text = "${PrefsManager.getDockIconCount()} icônes"

        // Show labels
        binding.switchShowLabels.isChecked = PrefsManager.showAppLabels()

        // Notification badges
        binding.switchNotifBadges.isChecked = PrefsManager.showNotifBadges()

        // BRVM auto-refresh
        binding.switchBrvmAutoRefresh.isChecked = PrefsManager.isBrvmAutoRefresh()
        binding.sliderBrvmInterval.value = PrefsManager.getBrvmRefreshInterval().toFloat()

        // Birthday notifications
        binding.switchBirthdayNotif.isChecked = PrefsManager.isBirthdayNotifEnabled()

        // Claude API Key
        val key = PrefsManager.getClaudeApiKey()
        binding.tvApiKeyStatus.text = if (key.isNotEmpty()) {
            "Clé configurée (${key.take(8)}...)"
        } else {
            getString(R.string.no_api_key)
        }
    }

    private fun setupListeners() {
        binding.sliderGridColumns.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                PrefsManager.setGridColumns(value.toInt())
                binding.tvGridColumns.text = "${value.toInt()} colonnes"
            }
        }

        binding.switchDarkTheme.setOnCheckedChangeListener { _, isChecked ->
            PrefsManager.setDarkTheme(isChecked)
            recreate()
        }

        binding.sliderDockIcons.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                PrefsManager.setDockIconCount(value.toInt())
                binding.tvDockCount.text = "${value.toInt()} icônes"
            }
        }

        binding.switchShowLabels.setOnCheckedChangeListener { _, isChecked ->
            PrefsManager.setShowAppLabels(isChecked)
        }

        binding.switchNotifBadges.setOnCheckedChangeListener { _, isChecked ->
            PrefsManager.setShowNotifBadges(isChecked)
        }

        binding.switchBrvmAutoRefresh.setOnCheckedChangeListener { _, isChecked ->
            PrefsManager.setBrvmAutoRefresh(isChecked)
            binding.sliderBrvmInterval.isEnabled = isChecked
        }

        binding.sliderBrvmInterval.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                PrefsManager.setBrvmRefreshInterval(value.toInt())
            }
        }

        binding.switchBirthdayNotif.setOnCheckedChangeListener { _, isChecked ->
            PrefsManager.setBirthdayNotifEnabled(isChecked)
        }

        binding.btnSetApiKey.setOnClickListener {
            val dialog = ApiKeyDialog()
            dialog.setOnKeySetListener { key ->
                PrefsManager.setClaudeApiKey(key)
                binding.tvApiKeyStatus.text = "Clé configurée (${key.take(8)}...)"
                Toast.makeText(this, R.string.api_key_saved, Toast.LENGTH_SHORT).show()
            }
            dialog.show(supportFragmentManager, "api_key")
        }

        binding.btnChangeWallpaper.setOnClickListener {
            val intent = Intent(Intent.ACTION_SET_WALLPAPER)
            startActivity(Intent.createChooser(intent, getString(R.string.choose_wallpaper)))
        }

        binding.btnResetDefaults.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle(R.string.reset_title)
                .setMessage(R.string.reset_message)
                .setPositiveButton(R.string.confirm) { _, _ ->
                    PrefsManager.resetToDefaults()
                    loadSettings()
                    Toast.makeText(this, R.string.reset_done, Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton(R.string.cancel, null)
                .show()
        }

        binding.btnAbout.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle(R.string.about_title)
                .setMessage(getString(R.string.about_message))
                .setPositiveButton(android.R.string.ok, null)
                .show()
        }
    }
}
