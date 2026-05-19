package com.joe.launcher.activities

import android.app.Dialog
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.DialogFragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.joe.launcher.R
import com.joe.launcher.utils.PrefsManager

class ApiKeyDialog : DialogFragment() {

    private var onKeySetListener: ((String) -> Unit)? = null

    fun setOnKeySetListener(listener: (String) -> Unit) {
        onKeySetListener = listener
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val ctx = requireContext()
        val container = FrameLayout(ctx).apply { setPadding(48, 16, 48, 0) }
        val etKey = EditText(ctx).apply {
            hint = "sk-ant-..."
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setText(PrefsManager.getClaudeApiKey())
        }
        container.addView(etKey)

        return MaterialAlertDialogBuilder(ctx)
            .setTitle("Clé API Claude")
            .setMessage("Obtenez votre clé sur console.anthropic.com")
            .setView(container)
            .setPositiveButton("Sauvegarder") { _, _ ->
                val key = etKey.text.toString().trim()
                if (key.isNotEmpty()) {
                    PrefsManager.setClaudeApiKey(key)
                    onKeySetListener?.invoke(key)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .create()
    }
}
