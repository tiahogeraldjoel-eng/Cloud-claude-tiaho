package com.joe.launcher.activities

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.tabs.TabLayout
import com.joe.launcher.R
import com.joe.launcher.adapters.BRVMAdapter
import com.joe.launcher.databinding.ActivityBrvmBinding
import com.joe.launcher.models.BRVMStock
import com.joe.launcher.utils.BRVMDataFetcher
import kotlinx.coroutines.launch

class BRVMActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBrvmBinding
    private lateinit var brvmAdapter: BRVMAdapter
    private var allStocks = listOf<BRVMStock>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBrvmBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupTabs()
        setupRecyclerView()
        loadData()
    }

    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.btnRefresh.setOnClickListener {
            loadData(forceRefresh = true)
        }
    }

    private fun setupTabs() {
        val tabs = listOf(
            getString(R.string.brvm_tab_all),
            getString(R.string.brvm_tab_top),
            getString(R.string.brvm_tab_bottom),
            getString(R.string.brvm_tab_favorites)
        )
        tabs.forEach { binding.tabLayout.addTab(binding.tabLayout.newTab().setText(it)) }

        binding.tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                filterStocks(tab.position)
            }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })
    }

    private fun setupRecyclerView() {
        brvmAdapter = BRVMAdapter { stock ->
            showStockDetail(stock)
        }
        binding.rvStocks.apply {
            layoutManager = LinearLayoutManager(this@BRVMActivity)
            adapter = brvmAdapter
        }
    }

    private fun loadData(forceRefresh: Boolean = false) {
        binding.progressBar.visibility = View.VISIBLE
        binding.layoutError.visibility = View.GONE

        lifecycleScope.launch {
            try {
                allStocks = BRVMDataFetcher.fetchStocks(this@BRVMActivity, forceRefresh)
                binding.progressBar.visibility = View.GONE
                updateMarketSummary()
                filterStocks(binding.tabLayout.selectedTabPosition)
                binding.tvLastUpdate.text = getString(R.string.last_update, BRVMDataFetcher.getLastUpdateTime())
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.layoutError.visibility = View.VISIBLE
                binding.tvError.text = getString(R.string.brvm_error, e.message ?: "Erreur réseau")
            }
        }
    }

    private fun updateMarketSummary() {
        if (allStocks.isEmpty()) return

        val gainers = allStocks.count { it.changePercent > 0 }
        val losers = allStocks.count { it.changePercent < 0 }
        val unchanged = allStocks.count { it.changePercent == 0.0 }

        binding.tvMarketSummary.text = getString(R.string.market_summary, gainers, losers, unchanged)

        val compositeIndex = allStocks.sumOf { it.price * it.volume } / allStocks.sumOf { it.volume }.coerceAtLeast(1.0)
        binding.tvCompositeIndex.text = String.format("%.2f FCFA", compositeIndex)

        val avgChange = allStocks.map { it.changePercent }.average()
        binding.tvMarketTrend.text = String.format("%+.2f%%", avgChange)
        binding.tvMarketTrend.setTextColor(
            getColor(if (avgChange >= 0) R.color.brvm_up else R.color.brvm_down)
        )
    }

    private fun filterStocks(tabIndex: Int) {
        val filtered = when (tabIndex) {
            0 -> allStocks.sortedBy { it.symbol }
            1 -> allStocks.sortedByDescending { it.changePercent }.take(10)
            2 -> allStocks.sortedBy { it.changePercent }.take(10)
            3 -> allStocks.filter { it.isFavorite }
            else -> allStocks
        }
        brvmAdapter.submitList(filtered)
        binding.tvStockCount.text = getString(R.string.stock_count, filtered.size)
    }

    private fun showStockDetail(stock: BRVMStock) {
        val dialog = StockDetailDialog.newInstance(stock)
        dialog.show(supportFragmentManager, "stock_detail")
    }
}
