package com.joe.launcher.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.joe.launcher.R
import com.joe.launcher.models.BirthdayContact

class BirthdayAdapter(
    private val onContactClick: (BirthdayContact) -> Unit
) : ListAdapter<BirthdayContact, BirthdayAdapter.BirthdayViewHolder>(BIRTHDAY_DIFF) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): BirthdayViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_birthday, parent, false)
        return BirthdayViewHolder(view)
    }

    override fun onBindViewHolder(holder: BirthdayViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class BirthdayViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ivPhoto: ImageView = itemView.findViewById(R.id.iv_contact_photo)
        private val tvName: TextView = itemView.findViewById(R.id.tv_contact_name)
        private val tvDate: TextView = itemView.findViewById(R.id.tv_birthday_date)
        private val tvDays: TextView = itemView.findViewById(R.id.tv_days_until)
        private val tvAge: TextView = itemView.findViewById(R.id.tv_age)
        private val tvInitials: TextView = itemView.findViewById(R.id.tv_initials)

        fun bind(contact: BirthdayContact) {
            tvName.text = contact.name
            tvDate.text = contact.birthdayString

            if (contact.photoUri != null) {
                ivPhoto.visibility = View.VISIBLE
                tvInitials.visibility = View.GONE
                Glide.with(itemView.context)
                    .load(contact.photoUri)
                    .circleCrop()
                    .placeholder(R.drawable.ic_contact_placeholder)
                    .into(ivPhoto)
            } else {
                ivPhoto.visibility = View.GONE
                tvInitials.visibility = View.VISIBLE
                tvInitials.text = contact.name.take(2).uppercase()
            }

            val ctx = itemView.context
            when (contact.daysUntilBirthday) {
                0 -> {
                    tvDays.text = ctx.getString(R.string.birthday_today)
                    tvDays.setTextColor(ctx.getColor(R.color.birthday_today))
                    itemView.setBackgroundResource(R.drawable.bg_birthday_today)
                }
                1 -> {
                    tvDays.text = ctx.getString(R.string.birthday_tomorrow)
                    tvDays.setTextColor(ctx.getColor(R.color.birthday_soon))
                }
                in 2..7 -> {
                    tvDays.text = ctx.getString(R.string.birthday_days, contact.daysUntilBirthday)
                    tvDays.setTextColor(ctx.getColor(R.color.birthday_week))
                }
                else -> {
                    tvDays.text = ctx.getString(R.string.birthday_days, contact.daysUntilBirthday)
                    tvDays.setTextColor(ctx.getColor(R.color.text_secondary))
                    itemView.background = null
                }
            }

            contact.age?.let {
                tvAge.visibility = View.VISIBLE
                tvAge.text = ctx.getString(R.string.age_years, it)
            } ?: run {
                tvAge.visibility = View.GONE
            }

            itemView.setOnClickListener { onContactClick(contact) }
        }
    }

    companion object {
        val BIRTHDAY_DIFF = object : DiffUtil.ItemCallback<BirthdayContact>() {
            override fun areItemsTheSame(old: BirthdayContact, new: BirthdayContact) =
                old.id == new.id
            override fun areContentsTheSame(old: BirthdayContact, new: BirthdayContact) =
                old == new
        }
    }
}
