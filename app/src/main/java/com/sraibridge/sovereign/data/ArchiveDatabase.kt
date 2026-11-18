package com.sraibridge.sovereign.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.sraibridge.sovereign.data.dao.DocumentDao
import com.sraibridge.sovereign.data.dao.SemanticDao
import com.sraibridge.sovereign.data.entity.CorpusStatsEntity
import com.sraibridge.sovereign.data.entity.DocumentEntity
import com.sraibridge.sovereign.data.entity.MerkleSealEntity
import com.sraibridge.sovereign.data.entity.TermFrequencyEntity
import java.io.IOException

/**
 * Room view of archive.db, the index that src/research_index.js builds and build_apk.sh
 * copies into app/src/main/assets. The entities mirror that Node schema; the FTS5 table
 * `documents_fts` is not an entity (Room cannot model FTS5) and is queried through
 * DocumentDao.rawDocuments.
 */
@Database(
    entities = [
        DocumentEntity::class,
        TermFrequencyEntity::class,
        CorpusStatsEntity::class,
        MerkleSealEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class ArchiveDatabase : RoomDatabase() {
    abstract fun documentDao(): DocumentDao
    abstract fun semanticDao(): SemanticDao

    companion object {
        private const val DATABASE_NAME = "sovereign_archive.db"
        private const val BUNDLED_ARCHIVE_ASSET = "archive.db"

        @Volatile
        private var INSTANCE: ArchiveDatabase? = null

        fun getInstance(context: Context): ArchiveDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): ArchiveDatabase {
            val builder = Room.databaseBuilder(
                context.applicationContext,
                ArchiveDatabase::class.java,
                DATABASE_NAME
            )
            // Ship the prebuilt index when the build included one; otherwise start empty.
            if (hasBundledArchive(context)) {
                builder.createFromAsset(BUNDLED_ARCHIVE_ASSET)
            }
            return builder
                .fallbackToDestructiveMigration()
                .build()
        }

        private fun hasBundledArchive(context: Context): Boolean {
            return try {
                context.assets.open(BUNDLED_ARCHIVE_ASSET).close()
                true
            } catch (_: IOException) {
                false
            }
        }
    }
}
