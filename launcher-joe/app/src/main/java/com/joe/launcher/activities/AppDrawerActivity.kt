package com.joe.launcher.activities

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.animation.AnimationUtils
import android.view.inputmethod.InputMethodManager
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.joe.launcher.R
import com.joe.launcher.adapters.AppGridAdapter
import com.joe.launcher.databinding.ActivityAppDrawerBinding
import com.joe.launcher.models.AppInfo
import com.joe.launcher.utils.AppLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AppDrawerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAppDrawerBinding
    private lateinit var appGridAdapter: AppGridAdapter
    private var allApps = listOf<AppInfo>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAppDrawerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupRecyclerView()
        setupSearch()
        setupCloseButton()
        loadApps()

        // Animation d'ouverture
        binding.root.startAnimation(AnimationUtils.loadAnimation(this, R.anim.slide_up_fade))
    }

    private fun setupRecyclerView() {
        appGridAdapter = AppGridAdapter(
            onAppClick = { appInfo -> launchApp(appInfo) },
            onAppLongClick = { appInfo -> showAppOptions(appInfo) }
        )

        binding.rvApps.apply {
            layoutManager = GridLayoutManager(this@AppDrawerActivity, 4)
            adapter = appGridAdapter
            setHasFixedSize(true)
        }
    }

    private fun setupSearch() {
        binding.etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                filterApps(s.toString())
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        binding.ivClearSearch.setOnClickListener {
            binding.etSearch.setText("")
            hideKeyboard()
        }
    }

    private fun setupCloseButton() {
        binding.btnClose.setOnClickListener { finish() }
        binding.overlayDim.setOnClickListener { finish() }
    }

    private fun loadApps() {
        binding.progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            allApps = withContext(Dispatchers.IO) {
                AppLoader.getAllInstalledApps(this@AppDrawerActivity)
                    .sortedBy { it.label.toString().lowercase() }
            }

            withContext(Dispatchers.Main) {
                binding.progressBar.visibility = View.GONE
                appGridAdapter.submitList(allApps)
                binding.tvAppCount.text = getString(R.string.app_count, allApps.size)
            }
        }
    }

    private fun filterApps(query: String) {
        val filtered = if (query.isEmpty()) {
            allApps
        } else {
            allApps.filter {
                it.label.toString().contains(query, ignoreCase = true)
            }
        }
        appGridAdapter.submitList(filtered)
        binding.ivClearSearch.visibility = if (query.isEmpty()) View.GONE else View.VISIBLE
        binding.tvAppCount.text = getString(R.string.app_count, filtered.size)
    }

    private fun launchApp(appInfo: AppInfo) {
        val launchIntent = packageManager.getLaunchIntentForPackage(appInfo.packageName)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(launchIntent)
            overridePendingTransition(R.anim.scale_in_center, R.anim.fade_out)
        }
    }

    private fun showAppOptions(appInfo: AppInfo) {
        val dialog = AppOptionsDialog.newInstance(appInfo)
        dialog.show(supportFragmentManager, "app_options")
    }

    private fun hideKeyboard() {
        val imm = getSystemService(InputMethodManager::class.java)
        imm.hideSoftInputFromWindow(binding.etSearch.windowToken, 0)
    }

    override fun onBackPressed() {
        finish()
        overridePendingTransition(R.anim.stay, R.anim.slide_down)
    }
}
