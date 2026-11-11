# Sovereign Research Archive — Architecture Specification

**Version:** 1.0  
**Kernel:** GHOST v9.1.0  
**Repository:** sraibridge-cyber/sovereign-research-archive  
**Organisation:** Complex System Sanity Labs  
**Architect:** Kyle Whitlock  

---

## 1. Purpose

The Sovereign Research Archive is a local-first, vendorless, cloudless system that ingests a full research corpus (~2,000 files from Google Drive) into a sealed SQLite database with FTS5 full-text search and TF-IDF vector similarity, then ships a zero-network Android APK that runs the GHOST kernel against that corpus entirely on-device.

No server farms. No cloud calls. No internet permissions. Every source, every version, every connection preserved and traceable through SHA3-512 Merkle seals.

## 2. Design principles

- **Local-first.** All computation, search, and reasoning happens on the device. The corpus is pre-indexed and shipped read-only.
- **Vendorless.** No external API calls, no cloud services, no vendor dependencies at runtime. SQLite is embedded; the kernel is self-contained.
- **Permanence.** Every version, every source, every connection preserved and traceable. SHA3-512 Merkle seals bind provenance to content. The seal chain links each build to its predecessor.
- **Zero-network.** The Android manifest declares no INTERNET permission. The kernel runs in dispatch mode (no port binding). The build verifies integrity before packaging. Three independent enforcement points.
- **No shortcuts.** No placeholder data, no duct tape. Every piece verified. A file that fails extraction is recorded with the failure reason, not omitted.

## 3. System overview

```
┌─────────────────────────────────────────────────────────┐
│                    HOST (ingestion)                       │
│  Google Drive -> tools/ingest.py -> plaintext + provenance  │
│                      (Python)              |               │
              src/research_index.js -> archive.db            │
              (Node.js orchestrator)     (SQLite FTS5)        │
                      │                    + TF-IDF          │
                      ▼                    + Merkle seals    │
              build_apk.sh -> verify -> package              │
└─────────────────────────────────────────┬─────────────────┘
                                          │
┌─────────────────────────────────────────▼─────────────────┐
│                  DEVICE (Android APK)                      │
│  app/ - Room (FTS5), Compose UI, ghost_kernel.js dispatch   │
│  ZERO NETWORK PERMISSIONS - enforced 3x                    │
│  1. Manifest  2. Kernel dispatch mode  3. Build verify     │
└───────────────────────────────────────────────────────────┘
```

## 4. Ingestion pipeline

### 4.1 Stage 1 - Drive enumeration (tools/ingest.py)
Authenticate against Drive (host-side), enumerate ~2,000 files, record provenance: file id, name, MIME, modified time, account, content hash (SHA3-512).

### 4.2 Stage 2 - Plaintext extraction (tools/ingest.py)
PDF -> text-layer extraction. Google Workspace -> export to text. Markdown/text -> direct read. Failed files recorded, not omitted.

### 4.3 Stage 3 - Index construction (src/research_index.js)
Build archive.db with FTS5 + TF-IDF + Merkle seals.

### 4.4 Stage 4 - Seal and package
Seal every source + root, verify, package into APK.

## 5. Database schema (FTS5 + TF-IDF)

### 5.1 sources table
| column | type | meaning |
| --- | --- | --- |
| source_id | TEXT PK | Stable id from content hash |
| drive_file_id | TEXT | Drive file id |
| original_name | TEXT | File name from Drive |
| mime_type | TEXT | MIME as received |
| modified_time | TEXT ISO 8601 | Drive modified time |
| extracted_account | TEXT | Drive account |
| content_hash | TEXT | SHA3-512 of bytes |
| extraction_status | TEXT | ok/empty/failed |
| extraction_note | TEXT | Failure reason |
| ingested_at | TEXT ISO 8601 | When written |
| seal_hash | TEXT | SHA3-512 Merkle seal |

### 5.2 FTS5 documents table
```sql
CREATE VIRTUAL TABLE documents USING fts5(
  content, source_id UNINDEXED, title UNINDEXED,
  timeline_date UNINDEXED, tokenize = 'porter unicode61'
);
```
BM25 ranking: `bm25(documents)`.

### 5.3 TF-IDF tables
doc_stats(source_id, term_count, norm_sq), terms(term_id, term, df), postings(source_id, term_id, tf, tfidf), corpus_meta(key, value).

### 5.4 Query paths
- Keyword: FTS5 MATCH + BM25 -> source_id -> sources for provenance.
- Semantic: TF-IDF cosine similarity -> top-K by cosine.

## 6. GHOST kernel integration

### 6.1 The kernel
ghost_kernel.js (32KB): Coherence Calculus v3.0, Tesseract B4 memory, Whitlock Coefficient, 17 Laws, SHA3-512 Merkle seals.

### 6.2 Zero-net execution
Port binding conditional on net module. Under bundled engine without net, kernel runs via call/dispatch. No sockets. No HTTP.

### 6.3 Kernel-to-index interface
Read-only handle to archive.db. Queries through thin adapter. Kernel never opens network socket.

### 6.4 Integrity verification
npm run verify runs verifyIntegrity(). Build runs this before packaging. Failed verify aborts build.

## 7. Merkle seal model

### 7.1 Seal primitive
SHA3-512.

### 7.2 Per-source seal
seal_hash = SHA3-512(source_id || drive_file_id || original_name || mime_type || modified_time || extracted_account || content_hash)

### 7.3 Merkle tree
Per-source seals are leaves, hashed in pairs to a root. Root in corpus_meta and build manifest.

### 7.4 Version traceability
Build manifest: timestamp, kernel version, root_seal, doc count, prior root_seal. Chain links versions.

### 7.5 Runtime verification
Verify kernel integrity, archive.db root seal, state.json seals at load time. Mismatch = refuse to run.

## 8. Android packaging

### 8.1 What ships
1. Sealed archive.db (read-only). 2. GHOST kernel bundle. 3. Minimal Android shell.

### 8.2 Stack
Jetpack Compose, Room over SQLite, bundled JS engine or Termux, build_apk.sh with verification.

### 8.3 What does not ship
No Drive credentials. No network. No telemetry.

## 9. Zero-network boundary
1. Manifest: no INTERNET permission. 2. Kernel: dispatch mode. 3. Build: verify integrity.

## 10. Repository structure
```
sovereign-research-archive/
├── src/ (ghost_kernel.js, ghost_face.js, start_ghost.js, test_ghost.js, research_index.js)
├── tools/ingest.py
├── app/ (Android APK: Compose, Room, zero-net manifest)
├── app-crawler/ (Drive ingestion companion)
├── docs/ARCHITECTURE.md
├── build_apk.sh, build.gradle.kts, settings.gradle.kts, package.json
```

## 11. Contract summary
- Ingestion: archive.db with schema Section 5, seals Section 7. FTS5 BM25 + TF-IDF cosine.
- Kernel: in-process dispatch, state.json sealed, verify passes.
- APK: Compose + Room, zero-net manifest, build verifies seals.
- Seals: SHA3-512 per-source, Merkle root in manifest.

## 12. Open items
- Bundled JS engine selection (QuickJS-class or WebView/JSContext).
- OCR for scanned PDFs (flagged-with-note for now).
- Exact corpus folder list on Drive (resolved at ingestion time).
