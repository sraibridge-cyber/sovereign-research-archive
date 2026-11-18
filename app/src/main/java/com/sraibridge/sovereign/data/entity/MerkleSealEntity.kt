package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/** Mirrors the `merkle_seals` table from src/research_index.js. */
@Entity(tableName = "merkle_seals")
data class MerkleSealEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long? = null,
    val version: Int,
    @ColumnInfo(name = "seal_hash")
    val sealHash: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    val description: String?
)
