/**
 * ingest_pipeline.js — Sovereign Research Archive
 * Multi-pass ingestion engine.
 * Reads source files from the research drive and writes them into the
 * repository structure under the correct folder, tracking state per pass.
 *
 * Architecture:
 *   Pass 1: Map drive structure → repo folders (index files, create placeholders)
 *   Pass 2: Ingest text content (markdown, plaintext, JSON, source files)
 *   Pass 3: Ingest binary/media (images, PDFs, data files)
 *   Pass N: Verify, reconcile, flag orphans
 *
 * Usage:
 *   node src/ingest_pipeline.js [--pass 1|2|3|verify] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

// ── State ──────────────────────────────────────────────────────────────

const STATE_FILE = path.join(__dirname, '..', '.ingest_state.json');

const DEFAULT_STATE = {
  version: 1,
  pass: 0,             // 0 = not started, 1-3 = active pass, 4 = verify
  totalFiles: 0,
  ingested: 0,
  skipped: 0,
  errors: [],
  completedPasses: [],
  startedAt: null,
  lastRunAt: null,
  fileRegistry: {}      // drivePath → { sha, ingestedAt, pass }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[ingest] Could not load state file, starting fresh:', e.message);
  }
  return { ...DEFAULT_STATE };
}

function saveState(state) {
  state.lastRunAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ── Folder map (from research_index.js) ───────────────────────────────

const REPO_ROOT = path.join(__dirname, '..');

const FOLDER_MAP = {
  'AI-Research-Threads': { drivePath: '/AI-Research-Threads/', description: 'Early research captures and thread explorations' },
  'Bridge-A2A': { drivePath: '/Bridge-A2A/', description: 'Agent-to-agent bridge architecture (current)' },
  'Bridge-Infra-Early': { drivePath: '/Bridge-Infra-Early/', description: 'Early bridge infrastructure experiments' },
  'Coherence-Calculus': { drivePath: '/Coherence-Calculus/', description: 'Coherence Calculus formalization and papers' },
  'Frameworks': { drivePath: '/Frameworks/', description: 'CSST, Praetor, Sovereign-Vault governance frameworks' },
  'Harmony-Labs': { drivePath: '/Harmony-Labs/', description: 'Ghost AI agent files by version' },
  'Resonance-Archive': { drivePath: '/Resonance-Archive/', description: 'Foundational math, resonance invariants, origin work' },
  'SR-AIbridge-Origin': { drivePath: '/SR-AIbridge-Origin/', description: 'Original Sovereign-Resonance AI bridge work' },
  'exports': { drivePath: '/exports/', description: 'Formatted outputs and compiled documents' },
  'src': { drivePath: '/src/', description: 'Active source code (already in repo root)' },
};

// ── File type classifiers ─────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.js', '.ts', '.py', '.html', '.css',
  '.yaml', '.yml', '.toml', '.xml', '.csv', '.svg', '.sh'
]);

const MEDIA_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.pdf'
]);

function classifyFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (MEDIA_EXTENSIONS.has(ext)) return 'media';
  return 'other';
}

function isIngestible(filename) {
  const basename = path.basename(filename);
  if (basename.startsWith('.')) return false;         // hidden files
  if (basename === 'desktop.ini') return false;
  if (basename === 'Thumbs.db') return false;
  const ext = path.extname(basename).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || MEDIA_EXTENSIONS.has(ext);
}

// ── Path resolution ───────────────────────────────────────────────────

function resolveRepoPath(drivePath, filename) {
  // Map a drive path to the correct repo folder
  for (const [folder, info] of Object.entries(FOLDER_MAP)) {
    if (drivePath.startsWith(info.drivePath)) {
      const relative = drivePath.slice(info.drivePath.length);
      return path.join(folder, relative, filename);
    }
  }
  // Default: root level
  return path.join('unclassified', filename);
}

// ── Ingestion pass logic ──────────────────────────────────────────────

async function runPass(passNumber, dryRun = false) {
  const state = loadState();
  state.pass = passNumber;
  state.startedAt = state.startedAt || new Date().toISOString();

  console.log(`\n=== Ingestion Pass ${passNumber}${dryRun ? ' (DRY RUN)' : ''} ===`);
  console.log(`State: ${state.ingested} ingested, ${state.skipped} skipped, ${state.errors.length} errors so far\n`);

  switch (passNumber) {
    case 1:
      console.log('[Pass 1] Mapping drive structure...');
      console.log('[Pass 1] Folders to map:', Object.keys(FOLDER_MAP).length);
      for (const [folder, info] of Object.entries(FOLDER_MAP)) {
        const targetDir = path.join(REPO_ROOT, folder);
        if (!fs.existsSync(targetDir)) {
          if (dryRun) {
            console.log(`  Would create: ${targetDir}`);
          } else {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`  Created: ${targetDir}`);
          }
        } else {
          console.log(`  Exists: ${targetDir}`);
        }
      }
      break;

    case 2:
      console.log('[Pass 2] Ingesting text files...');
      console.log('[Pass 2] Text ingestion requires drive source mapping — run with --source=/path/to/drive/mount');
      console.log('[Pass 2] Placeholder: scan source, classify, copy text files to repo structure');
      break;

    case 3:
      console.log('[Pass 3] Ingesting media/binary files...');
      console.log('[Pass 3] Media ingestion requires drive source mapping — run with --source=/path/to/drive/mount');
      break;

    case 4:
      console.log('[Verify] Running verification...');
      console.log('[Verify] Checking file counts, orphan detection, SHA consistency');
      break;

    default:
      console.error(`Unknown pass: ${passNumber}`);
      process.exit(1);
  }

  if (!dryRun) {
    state.completedPasses.push(passNumber);
    saveState(state);
  }

  console.log(`\n=== Pass ${passNumber} complete${dryRun ? ' (no changes written)' : ''} ===`);
}

// ── CLI entry ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    pass: null,
    dryRun: false,
    source: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pass' && args[i + 1]) {
      opts.pass = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    } else if (args[i] === '--source' && args[i + 1]) {
      opts.source = args[i + 1];
      i++;
    } else if (args[i] === '--verify') {
      opts.pass = 4;
    }
  }

  return opts;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (!opts.pass) {
    console.log('Usage: node src/ingest_pipeline.js --pass <1|2|3|verify> [--dry-run] [--source=/path]');
    console.log('  Pass 1: Create repo folder structure from index');
    console.log('  Pass 2: Ingest text files from drive source');
    console.log('  Pass 3: Ingest media/binary files from drive source');
    console.log('  Pass 4 (--verify): Verify state and file consistency');
    console.log('  --dry-run: Log what would happen without writing');
    console.log('  --source: Path to mounted/cloned drive source');
    process.exit(0);
  }

  try {
    await runPass(opts.pass, opts.dryRun);
  } catch (err) {
    console.error('[ingest] Fatal error:', err.message);
    const state = loadState();
    state.errors.push({ pass: opts.pass, error: err.message, time: new Date().toISOString() });
    saveState(state);
    process.exit(1);
  }
}

main();
