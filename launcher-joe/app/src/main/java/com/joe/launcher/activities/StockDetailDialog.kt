package com.joe.launcher.activities

import android.os.Bundle
import androidx.fragment.app.DialogFragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.joe.launcher.models.BRVMStock

class StockDetailDialog : DialogFragment() {

    companion object {
        fun newInstance(stock: BRVMStock): StockDetailDialog {
            return StockDetailDialog().apply {
                arguments = Bundle().apply {
                    putString("symbol", stock.symbol)
                    putString("name", stock.name)
                    putDouble("price", stock.price)
                    putDouble("change", stock.change)
                    putDouble("changePercent", stock.changePercent)
                    putDouble("volume", stock.volume)
                    putString("country", stock.country)
                    putString("sector", stock.sector)
                }
            }
        }
    }

    override fun onCreateDialog(savedInstanceState: Bundle?) =
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("${arguments?.getString("symbol")} - ${arguments?.getString("name")}")
            .setMessage(buildMessage())
            .setPositiveButton(android.R.string.ok, null)
            .create()

    private fun buildMessage(): String {
        val args = arguments ?: return ""
        val price = args.getDouble("price")
        val change = args.getDouble("change")
        val changePct = args.getDouble("changePercent")
        val volume = args.getDouble("volume")
        val country = args.getString("country", "")
        val sector = args.getString("sector", "")

        return """
Prix actuel: ${String.format("%.0f FCFA", price)}
Variation: ${String.format("%+.0f FCFA (%+.2f%%)", change, changePct)}
Volume: ${String.format("%.0f", volume)}
Pays: $country
Secteur: $sector
        """.trimIndent()
    }
}
