package com.joe.launcher.activities

import android.app.Dialog
import android.content.Intent
import android.os.Bundle
import androidx.fragment.app.DialogFragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.joe.launcher.R

class HomeOptionsDialog : DialogFragment() {
    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        return MaterialAlertDialogBuilder(requireContext())
            .setTitle("Options de l'écran d'accueil")
            .setItems(arrayOf("Changer le fond d'écran", "Paramètres du launcher")) { _, which ->
                when (which) {
                    0 -> {
                        val intent = Intent(Intent.ACTION_SET_WALLPAPER)
                        startActivity(Intent.createChooser(intent, "Choisir un fond d'écran"))
                    }
                    1 -> startActivity(Intent(requireContext(), SettingsActivity::class.java))
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .create()
    }
}
