package com.joe.launcher.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.joe.launcher.R
import com.joe.launcher.models.BRVMStock

class BRVMAdapter(
    private val onStockClick: (BRVMStock) -> Unit
) : ListAdapter<BRVMStock, BRVMAdapter.StockViewHolder>(STOCK_DIFF) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StockViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_brvm_stock, parent, false)
        return StockViewHolder(view)
    }

    override fun onBindViewHolder(holder: StockViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class StockViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvSymbol: TextView = itemView.findViewById(R.id.tv_symbol)
        private val tvName: TextView = itemView.findViewById(R.id.tv_name)
        private val tvPrice: TextView = itemView.findViewById(R.id.tv_price)
        private val tvChange: TextView = itemView.findViewById(R.id.tv_change)
        private val tvVolume: TextView = itemView.findViewById(R.id.tv_volume)
        private val tvCountry: TextView = itemView.findViewById(R.id.tv_country)
        private val ivTrend: ImageView = itemView.findViewById(R.id.iv_trend)
        private val ivFavorite: ImageView = itemView.findViewById(R.id.iv_favorite)

        fun bind(stock: BRVMStock) {
            tvSymbol.text = stock.symbol
            tvName.text = stock.name
            tvPrice.text = String.format("%.0f FCFA", stock.price)
            tvVolume.text = String.format("Vol: %.0f", stock.volume)
            tvCountry.text = stock.country

            val changeText = String.format("%+.2f%%", stock.changePercent)
            tvChange.text = changeText

            val ctx = itemView.context
            if (stock.isUp) {
                tvChange.setTextColor(ctx.getColor(R.color.brvm_up))
                ivTrend.setImageResource(R.drawable.ic_trend_up)
                tvChange.setBackgroundResource(R.drawable.bg_change_up)
            } else if (stock.isDown) {
                tvChange.setTextColor(ctx.getColor(R.color.brvm_down))
                ivTrend.setImageResource(R.drawable.ic_trend_down)
                tvChange.setBackgroundResource(R.drawable.bg_change_down)
            } else {
                tvChange.setTextColor(ctx.getColor(R.color.text_secondary))
                ivTrend.setImageResource(R.drawable.ic_trend_flat)
                tvChange.background = null
            }

            ivFavorite.setImageResource(
                if (stock.isFavorite) R.drawable.ic_star_filled else R.drawable.ic_star_outline
            )

            ivFavorite.setOnClickListener {
                stock.isFavorite = !stock.isFavorite
                ivFavorite.setImageResource(
                    if (stock.isFavorite) R.drawable.ic_star_filled else R.drawable.ic_star_outline
                )
                val favorites = com.joe.launcher.utils.PrefsManager.getBRVMFavorites().toMutableSet()
                if (stock.isFavorite) favorites.add(stock.symbol) else favorites.remove(stock.symbol)
                com.joe.launcher.utils.PrefsManager.setBRVMFavorites(favorites)
            }

            itemView.setOnClickListener { onStockClick(stock) }
        }
    }

    companion object {
        val STOCK_DIFF = object : DiffUtil.ItemCallback<BRVMStock>() {
            override fun areItemsTheSame(old: BRVMStock, new: BRVMStock) =
                old.symbol == new.symbol
            override fun areContentsTheSame(old: BRVMStock, new: BRVMStock) =
                old == new
        }
    }
}
