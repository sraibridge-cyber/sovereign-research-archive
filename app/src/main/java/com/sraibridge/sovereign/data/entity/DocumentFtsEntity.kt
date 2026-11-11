package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "documents_fts")
data class DocumentFtsEntity(
    @PrimaryKey
    val rowid: Int,
    val content: String?,
    @ColumnInfo(name = "source_id")
    val sourceId: String?,
    val title: String?,
    @ColumnInfo(name = "timeline_date")
    val timelineDate: String?
)