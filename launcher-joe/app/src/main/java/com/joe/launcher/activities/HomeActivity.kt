package com.joe.launcher.activities

import android.Manifest
import android.app.WallpaperManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.animation.AnimationUtils
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.joe.launcher.R
import com.joe.launcher.adapters.DockAdapter
import com.joe.launcher.databinding.ActivityHomeBinding
import com.joe.launcher.models.AppInfo
import com.joe.launcher.utils.AppLoader
import com.joe.launcher.utils.PrefsManager
import java.util.Calendar
import java.util.Locale
import kotlin.math.abs

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var gestureDetector: GestureDetector
    private lateinit var timeHandler: Handler
    private lateinit var timeRunnable: Runnable
    private lateinit var dockAdapter: DockAdapter

    private val timeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            updateDateTime()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupGestures()
        setupDock()
        setupQuickActions()
        setupWallpaper()
        requestPermissions()
        updateDateTime()
        startClock()
    }

    private fun setupGestures() {
        gestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            private val SWIPE_THRESHOLD = 100
            private val SWIPE_VELOCITY = 100

            override fun onFling(
                e1: MotionEvent?,
                e2: MotionEvent,
                velocityX: Float,
                velocityY: Float
            ): Boolean {
                if (e1 == null) return false
                val diffY = e2.y - e1.y
                val diffX = e2.x - e1.x

                if (abs(diffY) > abs(diffX) &&
                    abs(diffY) > SWIPE_THRESHOLD &&
                    abs(velocityY) > SWIPE_VELOCITY) {
                    if (diffY < 0) openAppDrawer()
                    return true
                }
                return false
            }

            override fun onLongPress(e: MotionEvent) {
                showHomeOptions()
            }
        })

        binding.root.setOnTouchListener { _, event ->
            gestureDetector.onTouchEvent(event)
            false
        }
    }

    private fun setupDock() {
        dockAdapter = DockAdapter(this) { appInfo ->
            launchApp(appInfo)
        }
        binding.rvDock.apply {
            layoutManager = GridLayoutManager(this@HomeActivity, 5)
            adapter = dockAdapter
        }
        loadDockApps()
    }

    private fun loadDockApps() {
        val dockPackages = PrefsManager.getDockApps()
        if (dockPackages.isNotEmpty()) {
            val apps = AppLoader.getAppsFromPackages(this, dockPackages)
            dockAdapter.updateApps(apps)
        } else {
            val defaultApps = AppLoader.getDefaultDockApps(this)
            dockAdapter.updateApps(defaultApps)
        }
    }

    private fun setupQuickActions() {
        binding.btnClaude.setOnClickListener {
            val anim = AnimationUtils.loadAnimation(this, R.anim.scale_in)
            it.startAnimation(anim)
            startActivity(Intent(this, ClaudeActivity::class.java))
        }

        binding.btnBRVM.setOnClickListener {
            val anim = AnimationUtils.loadAnimation(this, R.anim.scale_in)
            it.startAnimation(anim)
            startActivity(Intent(this, BRVMActivity::class.java))
        }

        binding.btnBirthdays.setOnClickListener {
            val anim = AnimationUtils.loadAnimation(this, R.anim.scale_in)
            it.startAnimation(anim)
            startActivity(Intent(this, BirthdaysActivity::class.java))
        }

        binding.btnApps.setOnClickListener {
            openAppDrawer()
        }

        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }

    private fun setupWallpaper() {
        try {
            val wallpaperManager = WallpaperManager.getInstance(this)
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED) {
                binding.ivWallpaper.setImageDrawable(wallpaperManager.drawable)
            }
        } catch (e: Exception) {
            binding.ivWallpaper.setBackgroundResource(R.drawable.default_wallpaper)
        }
    }

    private fun updateDateTime() {
        val cal = Calendar.getInstance()
        val is24h = DateFormat.is24HourFormat(this)

        val hour = if (is24h) cal.get(Calendar.HOUR_OF_DAY) else {
            val h = cal.get(Calendar.HOUR)
            if (h == 0) 12 else h
        }
        val minute = String.format(Locale.getDefault(), "%02d", cal.get(Calendar.MINUTE))
        val amPm = if (!is24h) {
            if (cal.get(Calendar.AM_PM) == Calendar.AM) " AM" else " PM"
        } else ""

        binding.tvTime.text = "$hour:$minute$amPm"

        val dayName = cal.getDisplayName(Calendar.DAY_OF_WEEK, Calendar.LONG, Locale.getDefault()) ?: ""
        val dayNum = cal.get(Calendar.DAY_OF_MONTH)
        val monthName = cal.getDisplayName(Calendar.MONTH, Calendar.LONG, Locale.getDefault()) ?: ""
        val year = cal.get(Calendar.YEAR)

        binding.tvDate.text = "$dayName $dayNum $monthName $year"
    }

    private fun startClock() {
        timeHandler = Handler(Looper.getMainLooper())
        timeRunnable = object : Runnable {
            override fun run() {
                updateDateTime()
                timeHandler.postDelayed(this, 1000)
            }
        }
        timeHandler.post(timeRunnable)
    }

    private fun openAppDrawer() {
        val intent = Intent(this, AppDrawerActivity::class.java)
        startActivity(intent)
        overridePendingTransition(R.anim.slide_up, R.anim.stay)
    }

    private fun launchApp(appInfo: AppInfo) {
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(appInfo.packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
            }
        } catch (e: Exception) {
            // App not available
        }
    }

    private fun showHomeOptions() {
        // Show wallpaper/settings bottom sheet
        val dialog = HomeOptionsDialog()
        dialog.show(supportFragmentManager, "home_options")
    }

    private fun requestPermissions() {
        val permissions = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.READ_CONTACTS)
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (permissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), 100)
        }
    }

    override fun onResume() {
        super.onResume()
        val filter = IntentFilter(Intent.ACTION_TIME_TICK)
        registerReceiver(timeReceiver, filter)
        updateDateTime()
        loadDockApps()
    }

    override fun onPause() {
        super.onPause()
        try { unregisterReceiver(timeReceiver) } catch (e: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::timeHandler.isInitialized) {
            timeHandler.removeCallbacks(timeRunnable)
        }
    }

    override fun onBackPressed() {
        // Launcher intercepte le bouton back
    }
}
