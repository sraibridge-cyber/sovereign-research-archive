package com.sraibridge.sovereign.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.sraibridge.sovereign.data.dao.SearchDao
import com.sraibridge.sovereign.data.dao.SemanticDao
import com.sraibridge.sovereign.data.entity.CorpusMetaEntity
import com.sraibridge.sovereign.data.entity.DocStatsEntity
import com.sraibridge.sovereign.data.entity.DocumentEntity
import com.sraibridge.sovereign.data.entity.SourceEntity

@Database(
    entities = [
        DocumentEntity::class,
        SourceEntity::class,
        CorpusMetaEntity::class,
        DocStatsEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class ArchiveDatabase : RoomDatabase() {
    abstract fun searchDao(): SearchDao
    abstract fun semanticDao(): SemanticDao

    companion object {
        @Volatile
        private var INSTANCE: ArchiveDatabase? = null

        fun getInstance(context: Context): ArchiveDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): ArchiveDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                ArchiveDatabase::class.java,
                "sovereign_archive.db"
            )
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
