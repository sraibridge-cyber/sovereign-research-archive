package com.sraibridge.sovereign.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sources")
data class SourceEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val drive_folder_id: String?,
    val drive_folder_name: String?,
    val file_count: Int,
    val total_size_bytes: Long,
    val ingested_at: Long,
    val sha3_512_merkle_root: String
)
