package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "terms")
data class TermEntity(
    @PrimaryKey
    @ColumnInfo(name = "term_id")
    val termId: Long,
    val term: String,
    @ColumnInfo(name = "df")
    val documentFrequency: Int
)