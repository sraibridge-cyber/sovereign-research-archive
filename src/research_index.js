/**
 * research_index.js — Sovereign Research Archive Corpus Index
 * Complex System Sanity Labs
 *
 * Navigation and ingestion engine for the full research corpus
 * (2,000+ files across Google Drive and GitHub).
 *
 * Maps every top-level research folder, subfolder, and file naming
 * convention so Ghost and other agents can navigate the corpus
 * without scanning the drive each time.
 *
 * Rule: Nothing is ever deleted. All information is preserved.
 */

'use strict';

// ---------------------------------------------------------------------------
// TOP-LEVEL FOLDER MAP — 14 project folders
// ---------------------------------------------------------------------------

const FOLDER_MAP = {
  // ---- Active Research Frameworks ----
  'Coherence-Calculus': {
    description: 'Core mathematical framework — 16 discovered invariants, proofs, benchmarks, export drafts, and arXiv/Nature submission materials. Most active research folder.',
    subfolders: {
      'papers/':     { description: 'Formal paper drafts, write-ups, and formatted documents (61 files)' },
      'exports/':    { description: 'Export-ready versions — PDFs, formatted outputs, submission-ready files (72 files)' },
      'benchmarks/': { description: 'Benchmark data, test results, validation runs, measurement datasets (22 files)' }
    }
  },
  'AI-Research-Threads': {
    description: 'Nonlinear research notes, threads, and pattern dumps that feed into formal frameworks. The idea capture layer.'
  },
  'Frameworks': {
    description: 'CSST (Constitutional Substrate Stability Theory) and other cross-cutting theoretical frameworks. Related to Coherence Calculus but distinct.'
  },
  'Resonance-Archive': {
    description: 'The 10-month Resonance research journey — mathematical invariants, early drafts, Nature journal submission attempt. Historical but foundational.'
  },

  // ---- Harmony Labs (Hardware & Software Design) ----
  'Harmony-Labs': {
    description: 'Parent folder for all Harmony Labs product work — 20+ hardware designs, 60+ software designs/attempts, safety kits, and compliance documentation.',
    subfolders: {
      'Ghost/':     { description: 'Ghost AI agent — all versions and builds. Most active Harmony sub-project.' },
      'Ghost/v6/':  { description: 'Ghost version 6 files' },
      'Ghost/v7/':  { description: 'Ghost version 7 files — largest versioned batch' },
      'Ghost/v8/':  { description: 'Ghost version 8 files' },
      'Ghost/v9/':  { description: 'Ghost version 9 files — most recent versioned work' },
      'Ghost/':     { description: '~25 unversioned Ghost files — docs, benchmarks, handoff notes, package configs with no clear version tag' }
    }
  },

  // ---- Bridge / Agent Infrastructure ----
  'Bridge-A2A': {
    description: 'Agent-to-Agent communication protocols and research. Architecture for how AI agents talk to each other.',
    subfolders: {
      'Protocols/': { description: 'Formal protocol specs and definitions' },
      'Research/':  { description: 'Supporting research, background, and explorations' }
    }
  },
  'Bridge-Infra-Early': {
    description: 'Early-stage bridge infrastructure work — predecessor to Bridge-A2A. Historical reference.'
  },
  'SR-AIbridge-Origin': {
    description: 'The original SR AI Bridge origin files — earliest bridge architecture work.'
  },

  // ---- Other Active Projects ----
  'Grimoire-Oracle': {
    description: 'Grimoire / Oracle system designs — AI personality, knowledge retrieval, or oracle-style agent work'
  },
  'Praetor': {
    description: 'Praetor system — governance, safety, or oversight-layer AI work'
  },
  'Sovereign-Vault': {
    description: 'Sovereign AI research — autonomy, self-governance, and related design work'
  },
  'MRCL-Coding-AI': {
    description: 'MRCL (Multi-Role Coding Layer) — AI-assisted coding system design'
  },
  'Index-Kernel': {
    description: 'Core indexing and kernel-level infrastructure research'
  },
  'DLC-Modules': {
    description: 'DLC (Downloadable Content / Dynamic Logic Component) module designs'
  }
};

// ---------------------------------------------------------------------------
// FILE NAMING CONVENTIONS
// ---------------------------------------------------------------------------

const NAMING_PATTERNS = {
  'GHOST_*':       { meaning: 'Ghost AI agent file (caps = formal/canonical)' },
  'ghost_*':       { meaning: 'Ghost file (lowercase = working/draft)' },
  'CC_*':          { meaning: 'Coherence Calculus document' },
  'cc_*':          { meaning: 'Coherence Calculus document' },
  'CSST_*':        { meaning: 'Constitutional Substrate Stability Theory doc' },
  'v6/v7/v8/v9':   { meaning: 'Ghost version number' },
  '*_ARXIV_*':     { meaning: 'Prepared or attempted arXiv submission' },
  '*_DRAFT*':      { meaning: 'Work in progress, not finalized' },
  '*_HANDOFF*':    { meaning: 'Documentation intended for continuity / transition' },
  '*_benchmark*':  { meaning: 'Measurement or evaluation data' },
  '*_package.json':{ meaning: 'Software package configuration' }
};

// ---------------------------------------------------------------------------
// NAVIGATION HELPERS
// ---------------------------------------------------------------------------

function findFolder(name) {
  if (FOLDER_MAP[name]) return FOLDER_MAP[name];
  // Fuzzy match
  const lower = name.toLowerCase();
  for (const key of Object.keys(FOLDER_MAP)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return FOLDER_MAP[key];
    }
  }
  return null;
}

function navigate(query) {
  const q = query.toLowerCase();

  if (q.includes('coherence') || q.includes('calculus') || q.includes('invariant')) {
    return {
      folder: 'Coherence-Calculus',
      path: 'Coherence-Calculus/papers/',
      note: 'Start with /papers/ for drafts, /exports/ for formatted outputs'
    };
  }
  if (q.includes('ghost') || q.includes('harmony')) {
    return {
      folder: 'Harmony-Labs/Ghost',
      path: 'Harmony-Labs/Ghost/v9/',
      note: 'v9 is newest; v7 has the largest historical batch'
    };
  }
  if (q.includes('resonance') || q.includes('foundational') || q.includes('origin')) {
    return {
      folder: 'Resonance-Archive',
      path: 'Resonance-Archive/',
      note: 'Origin work — 10-month research journey'
    };
  }
  if (q.includes('bridge') || q.includes('a2a') || q.includes('agent')) {
    return {
      folder: 'Bridge-A2A',
      path: 'Bridge-A2A/Protocols/',
      note: 'Current agent communication protocols'
    };
  }
  if (q.includes('csst') || q.includes('safety') || q.includes('governance') || q.includes('framework')) {
    return {
      folder: 'Frameworks',
      path: 'Frameworks/',
      note: 'CSST and cross-cutting theoretical frameworks'
    };
  }
  if (q.includes('sovereign') || q.includes('autonomy') || q.includes('vault')) {
    return {
      folder: 'Sovereign-Vault',
      path: 'Sovereign-Vault/',
      note: 'Sovereign AI / self-governance research'
    };
  }
  if (q.includes('praetor') || q.includes('oversight')) {
    return {
      folder: 'Praetor',
      path: 'Praetor/',
      note: 'Governance and oversight-layer AI work'
    };
  }
  if (q.includes('oracle') || q.includes('grimoire') || q.includes('personality')) {
    return {
      folder: 'Grimoire-Oracle',
      path: 'Grimoire-Oracle/',
      note: 'AI personality and oracle-style agent designs'
    };
  }

  return null;
}

function classifyFile(filename) {
  const results = [];
  for (const [pattern, info] of Object.entries(NAMING_PATTERNS)) {
    const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
    if (regex.test(filename)) {
      results.push({ pattern, meaning: info.meaning });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// INGESTION STATE TRACKER
// ---------------------------------------------------------------------------

let ingestionState = {
  phase: 'initial',          // initial | scanning | indexing | complete
  totalFiles: 0,
  indexedFiles: 0,
  scannedFolders: [],
  errors: [],
  startedAt: null,
  completedAt: null
};

function startIngestion() {
  ingestionState.phase = 'scanning';
  ingestionState.startedAt = Date.now();
  ingestionState.totalFiles = 0;
  ingestionState.indexedFiles = 0;
  ingestionState.errors = [];
  ingestionState.scannedFolders = Object.keys(FOLDER_MAP);
  return ingestionState;
}

function recordBatch(count, folder) {
  ingestionState.indexedFiles += count;
  ingestionState.totalFiles += count;
}

function completeIngestion() {
  ingestionState.phase = 'complete';
  ingestionState.completedAt = Date.now();
  return ingestionState;
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  FOLDER_MAP,
  NAMING_PATTERNS,
  findFolder,
  navigate,
  classifyFile,
  ingestionState,
  startIngestion,
  recordBatch,
  completeIngestion
};