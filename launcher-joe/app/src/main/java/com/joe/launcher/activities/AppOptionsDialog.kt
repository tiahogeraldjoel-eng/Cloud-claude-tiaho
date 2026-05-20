package com.joe.launcher.activities

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.fragment.app.DialogFragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.joe.launcher.models.AppInfo

class AppOptionsDialog : DialogFragment() {

    companion object {
        private const val ARG_PACKAGE = "package_name"
        private const val ARG_LABEL = "label"

        fun newInstance(appInfo: AppInfo): AppOptionsDialog {
            return AppOptionsDialog().apply {
                arguments = Bundle().apply {
                    putString(ARG_PACKAGE, appInfo.packageName)
                    putString(ARG_LABEL, appInfo.label.toString())
                }
            }
        }
    }

    override fun onCreateDialog(saved: Bundle?) =
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(arguments?.getString(ARG_LABEL) ?: "Application")
            .setItems(arrayOf("Ouvrir", "Infos de l'application", "Désinstaller")) { _, which ->
                val pkg = arguments?.getString(ARG_PACKAGE) ?: return@setItems
                when (which) {
                    0 -> requireContext().packageManager.getLaunchIntentForPackage(pkg)
                            ?.let { requireContext().startActivity(it) }
                    1 -> startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:$pkg")
                    })
                    2 -> startActivity(Intent(Intent.ACTION_DELETE).apply {
                        data = Uri.parse("package:$pkg")
                    })
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .create()
}
