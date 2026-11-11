package com.sraibridge.sovereign.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "doc_stats")
data class DocStatsEntity(
    @PrimaryKey val doc_id: Long,
    val word_count: Int,
    val unique_terms: Int,
    val max_freq: Int
)
