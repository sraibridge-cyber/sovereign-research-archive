# Sovereign Research Archive

A local-first, vendorless, cloudless research intelligence system. Built from the SR-AIbridge framework with permanence, truth, and offline sovereignty as first principles.

## Philosophy

This project exists because your research should be yours. No server farms. No cloud dependencies. No telemetry. No internet permissions at runtime. The archive lives on your device, searchable without phoning home.

## Core Capabilities

- **Full-Text Search** — SQLite FTS5 with BM25 ranking over the ingested corpus
- **Semantic Search** — TF-IDF ranking over per-document term frequencies
- **Offline-First** — Zero internet permissions in the Android manifest, checked on the built APK by `build_apk.sh`
- **Corpus Ingestion** — `tools/ingest.py` turns plaintext, Markdown, HTML, JSON, PDF and DOCX into the database the APK ships; files that fail are recorded with the reason, not dropped
- **Sealed Archive** — every document gets a SHA3-512 seal chained to the previous one; `--verify` recomputes all of them and the build refuses to package an archive that fails
- **Timeline Navigation** — planned, not built yet

## Project Structure

```
sovereign-research-archive/
├── app/                          # Android app (offline, no INTERNET permission)
│   └── src/main/java/com/sraibridge/sovereign/
│       ├── data/                 # Room entities + DAOs mirroring archive.db, ArchiveRepository
│       ├── ghost/                # GhostKernelAdapter (runs ghost_kernel.js with Rhino)
│       ├── ui/screens/           # Search, DocumentDetail
│       └── viewmodel/            # SearchViewModel
├── app-crawler/                  # Drive crawler companion app (has network; separate APK)
├── src/                          # GHOST kernel (Node), research_index.js, tests
├── tools/                        # ingest.py, its tests, requirements.txt
├── docs/                         # ARCHITECTURE.md, audit reports
├── build_apk.sh                  # test -> verify -> package -> zero-network check
└── build.gradle.kts              # Root build config (no Gradle wrapper yet; uses gradle on PATH)
```

## Getting Started

### Prerequisites
- JDK 17 and Gradle 8.x on PATH (the repo has no `gradlew` yet), Android SDK 34
- Node.js 18+ (kernel tests)
- Python 3.11+ (ingestion; `sqlite3` with FTS5 ships with Python)

### Ingest your research

1. Export your Google Drive research to a local directory
2. Build and check the archive:

```bash
pip install -r tools/requirements.txt          # PDF and DOCX support
python3 tools/ingest.py --dir /path/to/research --db archive.db
python3 tools/ingest.py --verify --db archive.db
```

Failed files are listed in the `ingest_failures` table. Search from the command line with `--search "query"` (FTS5) or `--tfidf "query"`.

### Build the APK

```bash
bash build_apk.sh
```

This runs the kernel and ingest checks, verifies `archive.db` if present, copies the kernel and archive into the app assets, builds both APKs with `gradle assembleRelease`, and fails if the archive app requests any network permission. Unsigned APKs land in `app/build/outputs/apk/release/`. Sign with your own key for distribution.

### Tests

```bash
npm test        # kernel tests, SHA3-512 fallback check, ingest tests
```

## Architecture

- **Host** — `tools/ingest.py` builds `archive.db` (documents, FTS5, term frequencies, seal chain).
- **Device** — Room opens the bundled `archive.db`; Jetpack Compose UI with Material 3; GHOST kernel runs in-process under Rhino.

See `docs/ARCHITECTURE.md` for the schema and seal model, and `docs/AUDIT-2026-11-18.md` for the latest audit.

## License

MIT — see LICENSE for full text.

---

*Built for permanence. No shortcuts. No duct tape.*
