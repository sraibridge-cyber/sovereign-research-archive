package com.sraibridge.sovereign.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.sraibridge.sovereign.data.entity.SourceEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SourceDao {
    @Query("SELECT * FROM sources ORDER BY ingested_at DESC")
    fun getAllSources(): Flow<List<SourceEntity>>

    @Query("SELECT * FROM sources WHERE source_id = :sourceId")
    suspend fun getSource(sourceId: String): SourceEntity?

    @Query("SELECT * FROM sources WHERE extraction_status = :status")
    suspend fun getSourcesByStatus(status: String): List<SourceEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSource(source: SourceEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSources(sources: List<SourceEntity>)

    @Query("SELECT COUNT(*) FROM sources")
    suspend fun getSourceCount(): Int

    @Query("SELECT COUNT(*) FROM sources WHERE extraction_status = 'ok'")
    suspend fun getExtractedCount(): Int
}