package com.sraibridge.crawler.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "ingested_documents")
data class IngestedDocumentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val drive_file_id: String,
    val title: String,
    val mime_type: String,
    val file_extension: String,
    val content_plain: String,
    val sha3_512: String,
    val ingested_at: Long,
    val word_count: Int
)
