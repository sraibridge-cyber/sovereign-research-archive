package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity

@Entity(
    tableName = "postings",
    primaryKeys = ["source_id", "term_id"]
)
data class PostingEntity(
    @ColumnInfo(name = "source_id")
    val sourceId: String,
    @ColumnInfo(name = "term_id")
    val termId: Long,
    @ColumnInfo(name = "tf")
    val termFrequency: Double,
    @ColumnInfo(name = "tfidf")
    val tfidf: Double
)