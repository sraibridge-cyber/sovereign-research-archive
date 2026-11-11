package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "documents")
data class DocumentEntity(
    @PrimaryKey
    val id: Long,
    @ColumnInfo(name = "source_id")
    val sourceId: String,
    val title: String,
    @ColumnInfo(name = "content_plain")
    val contentPlain: String,
    @ColumnInfo(name = "sha3_512")
    val sha3512: String,
    @ColumnInfo(name = "source_path")
    val sourcePath: String?,
    @ColumnInfo(name = "file_type")
    val fileType: String?,
    @ColumnInfo(name = "ingested_at")
    val ingestedAt: String?
)