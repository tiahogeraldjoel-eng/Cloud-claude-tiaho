package com.tiaho.coffrefort.ui

import android.graphics.Color
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.tiaho.coffrefort.R
import com.tiaho.coffrefort.data.DocumentEntity
import com.tiaho.coffrefort.databinding.ItemDocumentBinding

class DocumentAdapter(
    private val onItemClick: (DocumentEntity) -> Unit,
    private val onItemLongClick: (DocumentEntity) -> Unit
) : RecyclerView.Adapter<DocumentAdapter.ViewHolder>() {

    private var documents: List<DocumentEntity> = emptyList()

    fun submitList(newDocuments: List<DocumentEntity>) {
        documents = newDocuments
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemDocumentBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding, onItemClick, onItemLongClick)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(documents[position])
    }

    override fun getItemCount(): Int = documents.size

    class ViewHolder(
        private val binding: ItemDocumentBinding,
        private val onItemClick: (DocumentEntity) -> Unit,
        private val onItemLongClick: (DocumentEntity) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(document: DocumentEntity) {
            binding.title.text = document.title

            binding.category.text = document.category
            binding.category.setBackgroundResource(R.drawable.bg_chip_neutral)
            binding.category.setTextColor(Color.parseColor("#37474F"))

            val hasExpiration = document.expirationDate != "Non définie"
            binding.expiration.text = "Échéance : ${document.expirationDate}"
            binding.expiration.setBackgroundResource(
                if (hasExpiration) R.drawable.bg_chip_expiration else R.drawable.bg_chip_neutral
            )
            binding.expiration.setTextColor(
                if (hasExpiration) Color.WHITE else Color.parseColor("#37474F")
            )

            binding.root.setOnClickListener { onItemClick(document) }
            binding.root.setOnLongClickListener {
                onItemLongClick(document)
                true
            }
        }
    }
}
