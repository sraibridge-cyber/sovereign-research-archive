package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Mirrors the `merkle_seals` table from tools/ingest.py and src/research_index.js.
 * Each seal covers one document: seal_hash = SHA3-512("SRA-SEAL-1|version|previous seal|doc_sha3|created_at").
 */
@Entity(tableName = "merkle_seals")
data class MerkleSealEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long? = null,
    val version: Int,
    @ColumnInfo(name = "seal_hash")
    val sealHash: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    val description: String?,
    @ColumnInfo(name = "doc_sha3")
    val docSha3: String?
)
