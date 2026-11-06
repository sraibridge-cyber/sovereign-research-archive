# Sovereign Research Archive

A local-first, vendorless, cloudless research intelligence system. Built from the SR-AIbridge framework with permanence, truth, and offline sovereignty as first principles.

## Philosophy

This project exists because your research should be yours. No server farms. No cloud dependencies. No telemetry. No internet permissions at runtime. The archive lives on your device, searchable without phoning home.

## Core Capabilities

- **Full-Text Search** — SQLite FTS5 across 114M+ characters of research with relevance scoring
- **Semantic Search** — TF-IDF vector embedding with configurable similarity matching
- **Timeline Navigation** — Browse research chronologically from August 2025 forward
- **Offline-First** — Zero internet permissions in the Android manifest. No data ever leaves the device
- **Corpus Ingestion** — Python pipeline processes plaintext, PDF, and structured research exports into the embedded database
- **Permanent Archive** — Designed so every version, every source, every connection is preserved and traceable

## Project Structure

```
sovereign-research-archive/
├── app/                          # Android application
│   ├── src/main/
│   │   ├── java/com/cssl/sovereign/
│   │   │   ├── data/             # Room DB, DAOs, FTS5 search
│   │   │   ├── model/            # Domain models
│   │   │   ├── ui/               # Jetpack Compose screens
│   │   │   │   ├── screens/      # Home, Search, Browse, Timeline, DocumentReader
│   │   │   │   ├── components/   # Reusable UI components
│   │   │   │   └── theme/        # Colors, Typography, Theme
│   │   │   └── viewmodel/        # ResearchViewModel
│   │   ├── res/                  # Android resources
│   │   └── AndroidManifest.xml   # No internet permission
│   └── build.gradle.kts
├── tools/                        # Corpus ingestion pipeline
│   └── ingest.py                 # 22K-line ingestion engine
├── docs/                         # Architecture documentation
├── gradle/                       # Gradle wrapper
└── build.gradle.kts              # Root build config
```

## Getting Started

### Prerequisites
- Android Studio Hedgehog or later
- JDK 17
- Python 3.11+ (for corpus ingestion)

### Build the APK

```bash
./gradlew assembleRelease
```

The unsigned APK will be at `app/build/outputs/apk/release/`. Sign with your own key for distribution.

### Ingest Your Research

1. Export your Google Drive research to a local directory
2. Run the ingestion pipeline:

```bash
cd tools
pip install -r requirements.txt
python ingest.py --input /path/to/research --output ../app/src/main/assets/
```

This builds the SQLite FTS5 database that ships with the APK.

## Architecture

The app follows Clean Architecture with three layers:
- **Data** — Room database with FTS5 indexes, ResearchRepository, SemanticSearchEngine
- **Domain** — ResearchModels defining documents, sources, connections
- **UI** — Jetpack Compose with Material 3, six screens, ViewModel-driven state

See `docs/ARCHITECTURE.md` for full details.

## License

MIT — see LICENSE for full text.

---

*Built for permanence. No shortcuts. No duct tape.*
