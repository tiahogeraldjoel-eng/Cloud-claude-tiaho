package com.joe.launcher.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.joe.launcher.R
import com.joe.launcher.models.ChatMessage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ChatAdapter : ListAdapter<ChatMessage, RecyclerView.ViewHolder>(MSG_DIFF) {

    companion object {
        private const val TYPE_USER = 0
        private const val TYPE_BOT = 1
        private const val TYPE_SYSTEM = 2

        val MSG_DIFF = object : DiffUtil.ItemCallback<ChatMessage>() {
            override fun areItemsTheSame(old: ChatMessage, new: ChatMessage) =
                old.timestamp == new.timestamp
            override fun areContentsTheSame(old: ChatMessage, new: ChatMessage) =
                old == new
        }
    }

    override fun getItemViewType(position: Int): Int {
        val msg = getItem(position)
        return when {
            msg.isSystem -> TYPE_SYSTEM
            msg.isUser -> TYPE_USER
            else -> TYPE_BOT
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            TYPE_USER -> UserMessageVH(inflater.inflate(R.layout.item_chat_user, parent, false))
            TYPE_SYSTEM -> SystemMessageVH(inflater.inflate(R.layout.item_chat_system, parent, false))
            else -> BotMessageVH(inflater.inflate(R.layout.item_chat_bot, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val msg = getItem(position)
        when (holder) {
            is UserMessageVH -> holder.bind(msg)
            is BotMessageVH -> holder.bind(msg)
            is SystemMessageVH -> holder.bind(msg)
        }
    }

    inner class UserMessageVH(view: View) : RecyclerView.ViewHolder(view) {
        private val tvText: TextView = view.findViewById(R.id.tv_message)
        private val tvTime: TextView = view.findViewById(R.id.tv_time)

        fun bind(msg: ChatMessage) {
            tvText.text = msg.text
            tvTime.text = formatTime(msg.timestamp)
        }
    }

    inner class BotMessageVH(view: View) : RecyclerView.ViewHolder(view) {
        private val tvText: TextView = view.findViewById(R.id.tv_message)
        private val tvTime: TextView = view.findViewById(R.id.tv_time)

        fun bind(msg: ChatMessage) {
            tvText.text = msg.text
            tvTime.text = formatTime(msg.timestamp)
        }
    }

    inner class SystemMessageVH(view: View) : RecyclerView.ViewHolder(view) {
        private val tvText: TextView = view.findViewById(R.id.tv_system_message)

        fun bind(msg: ChatMessage) {
            tvText.text = msg.text
        }
    }

    private fun formatTime(timestamp: Long): String {
        return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timestamp))
    }
}
