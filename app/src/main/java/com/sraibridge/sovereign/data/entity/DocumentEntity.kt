package com.sraibridge.sovereign.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "documents")
data class DocumentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val source_path: String,
    val content_text: String,
    val content_plain: String,
    val sha3_512: String,
    val file_type: String,
    val ingested_at: Long,
    val word_count: Int
)
