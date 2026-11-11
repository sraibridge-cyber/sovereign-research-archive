package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "merkle_seals")
data class MerkleSealEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    @ColumnInfo(name = "seal_hash")
    val sealHash: String,
    @ColumnInfo(name = "previous_seal")
    val previousSeal: String?,
    @ColumnInfo(name = "sealed_at")
    val sealedAt: String,
    @ColumnInfo(name = "description")
    val description: String?
)