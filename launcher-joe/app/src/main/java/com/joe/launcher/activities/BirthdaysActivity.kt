package com.joe.launcher.activities

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.tabs.TabLayout
import com.joe.launcher.R
import com.joe.launcher.adapters.BirthdayAdapter
import com.joe.launcher.databinding.ActivityBirthdaysBinding
import com.joe.launcher.models.BirthdayContact
import com.joe.launcher.utils.BirthdayLoader
import com.joe.launcher.utils.BirthdayScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar

class BirthdaysActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBirthdaysBinding
    private lateinit var birthdayAdapter: BirthdayAdapter
    private var allBirthdays = listOf<BirthdayContact>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBirthdaysBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupTabs()
        setupRecyclerView()
        checkPermissionAndLoad()
    }

    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.btnAddBirthday.setOnClickListener {
            showAddBirthdayDialog()
        }
    }

    private fun setupTabs() {
        val tabs = listOf(
            getString(R.string.birthday_tab_today),
            getString(R.string.birthday_tab_week),
            getString(R.string.birthday_tab_month),
            getString(R.string.birthday_tab_all)
        )
        tabs.forEach { binding.tabLayout.addTab(binding.tabLayout.newTab().setText(it)) }

        binding.tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                filterBirthdays(tab.position)
            }
            override fun onTabUnselected(tab: TabLayout.Tab?) {}
            override fun onTabReselected(tab: TabLayout.Tab?) {}
        })
    }

    private fun setupRecyclerView() {
        birthdayAdapter = BirthdayAdapter { contact ->
            showContactOptions(contact)
        }
        binding.rvBirthdays.apply {
            layoutManager = LinearLayoutManager(this@BirthdaysActivity)
            adapter = birthdayAdapter
        }
    }

    private fun checkPermissionAndLoad() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS)
            == PackageManager.PERMISSION_GRANTED) {
            loadBirthdays()
        } else {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.READ_CONTACTS),
                PERMISSION_REQUEST_CONTACTS
            )
        }
    }

    private fun loadBirthdays() {
        binding.progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            allBirthdays = withContext(Dispatchers.IO) {
                BirthdayLoader.loadFromContacts(this@BirthdaysActivity)
            }

            withContext(Dispatchers.Main) {
                binding.progressBar.visibility = View.GONE

                if (allBirthdays.isEmpty()) {
                    binding.layoutEmpty.visibility = View.VISIBLE
                } else {
                    binding.layoutEmpty.visibility = View.GONE
                    BirthdayScheduler.scheduleAll(this@BirthdaysActivity, allBirthdays)
                    updateTodaySummary()
                    filterBirthdays(0)
                }
            }
        }
    }

    private fun updateTodaySummary() {
        val today = allBirthdays.filter { it.daysUntilBirthday == 0 }
        val thisWeek = allBirthdays.filter { it.daysUntilBirthday in 1..7 }

        binding.tvTodayCount.text = getString(R.string.birthdays_today_count, today.size)
        binding.tvWeekCount.text = getString(R.string.birthdays_week_count, thisWeek.size)

        if (today.isNotEmpty()) {
            binding.cardTodayAlert.visibility = View.VISIBLE
            val names = today.take(3).joinToString(", ") { it.name }
            val extra = if (today.size > 3) " +${today.size - 3}" else ""
            binding.tvTodayNames.text = "$names$extra"
        } else {
            binding.cardTodayAlert.visibility = View.GONE
        }
    }

    private fun filterBirthdays(tabIndex: Int) {
        val today = Calendar.getInstance()

        val filtered = when (tabIndex) {
            0 -> allBirthdays.filter { it.daysUntilBirthday == 0 }
            1 -> allBirthdays.filter { it.daysUntilBirthday in 0..7 }
            2 -> allBirthdays.filter { it.daysUntilBirthday in 0..30 }
            3 -> allBirthdays.sortedBy { it.daysUntilBirthday }
            else -> allBirthdays
        }

        birthdayAdapter.submitList(filtered)
        binding.tvCount.text = getString(R.string.birthday_count, filtered.size)

        if (filtered.isEmpty() && tabIndex < 3) {
            binding.tvEmptyFilter.visibility = View.VISIBLE
            binding.rvBirthdays.visibility = View.GONE
        } else {
            binding.tvEmptyFilter.visibility = View.GONE
            binding.rvBirthdays.visibility = View.VISIBLE
        }
    }

    private fun showContactOptions(contact: BirthdayContact) {
        val dialog = BirthdayDetailDialog.newInstance(contact)
        dialog.show(supportFragmentManager, "birthday_detail")
    }

    private fun showAddBirthdayDialog() {
        val dialog = AddBirthdayDialog()
        dialog.setOnBirthdayAddedListener { contact ->
            allBirthdays = allBirthdays + contact
            filterBirthdays(binding.tabLayout.selectedTabPosition)
            BirthdayScheduler.scheduleReminder(this, contact)
        }
        dialog.show(supportFragmentManager, "add_birthday")
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CONTACTS &&
            grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            loadBirthdays()
        } else {
            binding.layoutPermission.visibility = View.VISIBLE
            binding.progressBar.visibility = View.GONE
        }
    }

    companion object {
        private const val PERMISSION_REQUEST_CONTACTS = 200
    }
}
