package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "doc_stats")
data class DocStatsEntity(
    @PrimaryKey
    @ColumnInfo(name = "source_id")
    val sourceId: String,
    @ColumnInfo(name = "term_count")
    val termCount: Int,
    @ColumnInfo(name = "norm_sq")
    val normSq: Double
)