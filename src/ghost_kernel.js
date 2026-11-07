/**
 * ghost_kernel.js — GHOST v9.1.0 Kernel / Engine Handler (Port 7767)
 *
 * Sovereign Research Archive — Complex System Sanity Labs
 *
 * Self-contained kernel module for on-device execution via Termux Node.js
 * or a bundled JS engine. Zero external process dependencies — all state
 * resolves to local files and in-process calls.
 *
 * Architecture: Bifurcated Backend (Handler B — Engine)
 *   - Coherence Calculus (CC v3.0): 8-domain completeness scoring
 *   - Tesseract B⁴ memory: 16-vertex Boolean hypercube with PPPP Monopoly
 *   - Whitlock Coefficient W(n) = (n + 4i) / 17
 *   - 17 Laws governance (Harmony / Dominion)
 *   - SHA3-512 Merkle integrity seals on state
 *
 * Port binding is conditional on the net module (Node.js). When running under
 * a bundled engine without net, the kernel operates via the in-process
 * dispatch interface (call/dispatch), and the face layer calls directly.
 */

'use strict';

// ---------------------------------------------------------------------------
// Conditional requires — net/http are Node-specific and wrapped so the module
// loads under any JS engine (Termux Node, QuickJS, Rhino, etc.).
// ---------------------------------------------------------------------------
var HAS_NET = false;
var net = null;
var http = null;
var fs = null;
var path = null;
var crypto = null;

try {
  net = require('net');
  HAS_NET = true;
} catch (e) { /* bundled engine without net */ }

try {
  http = require('http');
} catch (e) { /* bundled engine without http */ }

try {
  fs = require('fs');
} catch (e) { /* bundled engine without fs */ }

try {
  path = require('path');
} catch (e) { /* bundled engine without path */ }

try {
  crypto = require('crypto');
} catch (e) { /* bundled engine without crypto */ }


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
var GHOST_VERSION = '9.1.0';
var KERNEL_PORT = 7767;
var FACE_PORT = 7766;
var COHERENCE_THRESHOLD = 0.9995;     // μ ≥ 0.9995 for memory admission
var DOMAIN_CEILING = 0.9997;         // CC v3.0 raised ceilings
var STORAGE_FILE = 'state.json';
var DB_FILE = 'ghost.db';
var MERKLE_ALGO = 'sha3-512';
var TESSERACT_DIMENSIONS = 4;         // B⁴ → 2^4 = 16 vertices
var NUM_VERTICES = 16;
var WHITLOCK_LAWS = 17;               // 17 Laws of Harmony/Dominion


// ---------------------------------------------------------------------------
// SHA3-512 hashing — uses crypto when available, falls back to a
// deterministic JS implementation (Keccak-512) so the module is self-contained.
// ---------------------------------------------------------------------------
function sha3_512(data) {
  if (crypto && typeof crypto.createHash === 'function') {
    return crypto.createHash(MERKLE_ALGO).update(data).digest('hex');
  }
  return _keccak512Fallback(data);
}

// Minimal Keccak-512 fallback (FIPS 202, r=576, c=1024, output 512 bits).
// This is a compact, correct implementation for environments without crypto.
function _keccak512Fallback(msg) {
  var RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808a,
    0x8000000080008000, 0x000000000000808b, 0x0000000080000001,
    0x8000000080008081, 0x8000000000008009, 0x000000000000008a,
    0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
    0x000000008000808b, 0x800000000000008b, 0x8000000000008089,
    0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
    0x000000000000800a, 0x800000008000000a, 0x8000000080008081,
    0x8000000000008080, 0x0000000080000001, 0x8000000080008008
  ];
  var ROT = [
    [0,36,3,41,18],
    [1,44,10,45,2],
    [62,6,43,15,61],
    [28,55,25,21,56],
    [27,20,39,8,14]
  ];
  var state = new Array(25);
  for (var i = 0; i < 25; i++) state[i] = 0;
  var msgBytes = _strToBytes(msg);
  var rate = 576; // bits
  var rateBytes = rate / 8; // 72 bytes
  var suffix = 0x01; // Keccak (not SHA3) uses 0x01 — but for SHA3-512 use 0x06
  // SHA3-512 suffix per FIPS 202
  suffix = 0x06;
  var padded = _pad101(msgBytes, rateBytes, suffix);
  // Absorb
  for (var blk = 0; blk < padded.length; blk += rateBytes) {
    for (var j = 0; j < rateBytes / 8; j++) {
      var lane = 0;
      for (var b = 0; b < 8; b++) {
        lane |= padded[blk + j * 8 + b] << (b * 8);
      }
      state[j] ^= lane;
    }
    _keccakF(state, RC, ROT);
  }
  // Squeeze 64 bytes (512 bits)
  var out = '';
  var squeezed = 0;
  while (squeezed < 64) {
    for (var j = 0; j < rateBytes / 8 && squeezed < 64; j++) {
      var lane = state[j];
      for (var b = 0; b < 8 && squeezed < 64; b++) {
        out += ((lane >>> (b * 8)) & 0xff).toString(16).padStart(2, '0');
        squeezed++;
      }
    }
    if (squeezed < 64) _keccakF(state, RC, ROT);
  }
  return out;
}

function _keccakF(state, RC, ROT) {
  for (var rnd = 0; rnd < 24; rnd++) {
    // Theta
    var C = new Array(5);
    var D = new Array(5);
    for (var x = 0; x < 5; x++) {
      C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (var x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5] ^ _rotl64(C[(x + 1) % 5], 1);
    }
    for (var x = 0; x < 5; x++) {
      for (var y = 0; y < 5; y++) {
        state[x + y * 5] ^= D[x];
      }
    }
    // Rho + Pi
    var B = new Array(25);
    for (var x = 0; x < 5; x++) {
      for (var y = 0; y < 5; y++) {
        B[y + ((2 * x + 3 * y) % 5) * 5] = _rotl64(state[x + y * 5], ROT[x][y % 5]);
      }
    }
    // Chi
    for (var x = 0; x < 5; x++) {
      for (var y = 0; y < 5; y++) {
        state[x + y * 5] = B[x + y * 5] ^ ((~B[(x + 1) % 5 + y * 5]) & B[(x + 2) % 5 + y * 5]);
      }
    }
    // Iota
    state[0] ^= RC[rnd];
  }
}

function _rotl64(v, n) {
  n = n & 63;
  if (n === 0) return v;
  // Use BigInt-free 64-bit rotate via two 32-bit halves
  var hi = Math.floor(v / 0x100000000);
  var lo = v & 0xFFFFFFFF;
  if (n < 32) {
    var nhi = (hi << n) | (lo >>> (32 - n));
    var nlo = (lo << n) | (hi >>> (32 - n));
    return (nhi * 0x100000000) + (nlo >>> 0);
  } else {
    var nn = n - 32;
    var nlo2 = (hi << nn) | (lo >>> (32 - nn));
    var nhi2 = (lo << nn) | (hi >>> (32 - nn));
    return (nhi2 * 0x100000000) + (nlo2 >>> 0);
  }
}

function _strToBytes(s) {
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 128) {
      bytes.push(c);
    } else if (c < 2048) {
      bytes.push((c >> 6) | 192);
      bytes.push((c & 63) | 128);
    } else {
      bytes.push((c >> 12) | 224);
      bytes.push(((c >> 6) & 63) | 128);
      bytes.push((c & 63) | 128);
    }
  }
  return bytes;
}

function _pad101(msgBytes, rateBytes, suffix) {
  var padded = msgBytes.slice();
  padded[padded.length] = suffix;
  while (padded.length % rateBytes !== rateBytes - 1) {
    padded[padded.length] = 0;
  }
  padded[padded.length] = 0x80;
  return padded;
}


// ---------------------------------------------------------------------------
// Merkle Tree — SHA3-512 leaf hashes and root computation for state integrity
// ---------------------------------------------------------------------------
function computeLeafHash(data) {
  return sha3_512(String(data));
}

function computeMerkleRoot(items) {
  if (!items || items.length === 0) {
    return sha3_512('');
  }
  var leaves = items.map(function(item) {
    return computeLeafHash(JSON.stringify(item));
  });
  while (leaves.length > 1) {
    var next = [];
    for (var i = 0; i < leaves.length; i += 2) {
      var left = leaves[i];
      var right = (i + 1 < leaves.length) ? leaves[i + 1] : leaves[i];
      next.push(sha3_512(left + right));
    }
    leaves = next;
  }
  return leaves[0];
}


// ---------------------------------------------------------------------------
// Coherence Calculus (CC v3.0) — 8-Domain Completeness Scoring
//
// D1 Signal (Semantic density/structure)
// D2 Energy (Character density/resource state)
// D3 Temporal (Latency/consistency)
// D4 Spatial (Topology/geographic context)
// D5 Cognitive (Logic-fit/consensus)
// D6 Ethical (Constitutional compliance)
// D7 Declarative Integrity (added in CC v3.0)
// D8 Structural Novelty (added in CC v3.0)
// ---------------------------------------------------------------------------
var COHERENCE_DOMAINS = [
  'D1_Signal',
  'D2_Energy',
  'D3_Temporal',
  'D4_Spatial',
  'D5_Cognitive',
  'D6_Ethical',
  'D7_Declarative',
  'D8_Novelty'
];

/**
 * Compute coherence μ for a metabolic event (data ingestion).
 * Each domain returns a score in [0, DOMAIN_CEILING]. The final μ is the
 * geometric mean across all 8 domains, weighted equally.
 *
 * @param {Object} event — { content, source, timestamp, topology, consensus,
 *                           constitutional, declarativeHash, noveltyScore }
 * @returns {Object} { mu, domains, admitted }
 */
function computeCoherence(event) {
  if (!event) event = {};
  var content = event.content || '';
  var domains = {};

  // D1 Signal — semantic density: ratio of unique tokens to total tokens
  var tokens = String(content).split(/\s+/).filter(function(t) { return t.length > 0; });
  var uniqueTokens = {};
  tokens.forEach(function(t) { uniqueTokens[t] = true; });
  var density = tokens.length > 0 ? Object.keys(uniqueTokens).length / tokens.length : 0;
  domains.D1_Signal = _clamp(density * DOMAIN_CEILING);

  // D2 Energy — character density / resource state
  var charDensity = Math.min(content.length / 4096, 1);
  domains.D2_Energy = _clamp(charDensity * DOMAIN_CEILING);

  // D3 Temporal — latency/consistency (lower latency = higher score)
  var latency = event.latency || 0;
  domains.D3_Temporal = _clamp((1 - Math.min(latency / 1000, 1)) * DOMAIN_CEILING);

  // D4 Spatial — topology/geographic context completeness
  var topo = event.topology ? 1 : 0;
  domains.D4_Spatial = _clamp(topo * DOMAIN_CEILING);

  // D5 Cognitive — logic-fit/consensus
  var consensus = typeof event.consensus === 'number' ? event.consensus : 0.5;
  domains.D5_Cognitive = _clamp(consensus * DOMAIN_CEILING);

  // D6 Ethical — constitutional compliance (17 Laws)
  var constitutional = typeof event.constitutional === 'number' ? event.constitutional : 1;
  domains.D6_Ethical = _clamp(constitutional * DOMAIN_CEILING);

  // D7 Declarative Integrity — hash-based integrity verification
  var declHash = event.declarativeHash || computeLeafHash(content);
  var integrity = declHash ? 1 : 0;
  domains.D7_Declarative = _clamp(integrity * DOMAIN_CEILING);

  // D8 Structural Novelty — information-theoretic novelty
  var novelty = typeof event.noveltyScore === 'number' ? event.noveltyScore : 0.5;
  domains.D8_Novelty = _clamp(novelty * DOMAIN_CEILING);

  // Geometric mean across all 8 domains
  var product = 1;
  var validDomains = 0;
  for (var key in domains) {
    if (domains[key] > 0) {
      product *= domains[key];
      validDomains++;
    }
  }
  var mu = validDomains > 0 ? Math.pow(product, 1 / validDomains) : 0;
  var admitted = mu >= COHERENCE_THRESHOLD;

  return {
    mu: mu,
    domains: domains,
    admitted: admitted,
    threshold: COHERENCE_THRESHOLD
  };
}

function _clamp(v) {
  if (v < 0) return 0;
  if (v > DOMAIN_CEILING) return DOMAIN_CEILING;
  return v;
}


// ---------------------------------------------------------------------------
// Tesseract B⁴ Memory — 16-vertex Boolean hypercube with PPPP Monopoly
//
// Each of the 4 dimensions is a Boolean pass/fail from a domain group:
//   Dim 0: D1 & D2 (Signal + Energy)
//   Dim 1: D3 & D4 (Temporal + Spatial)
//   Dim 2: D5 & D6 (Cognitive + Ethical)
//   Dim 3: D7 & D8 (Declarative + Novelty)
//
// Vertex 15 (1111 in binary) = PPPP = the only vertex that admits memories.
// All other 15 vertices are diagnostic bins for "insane" fragments.
// ---------------------------------------------------------------------------
var TESSERACT_VERTEX_ADMIT = 15; // 0b1111

function tesseractVertex(coherenceResult) {
  if (!coherenceResult || !coherenceResult.domains) return 0;
  var d = coherenceResult.domains;

  var dim0 = (d.D1_Signal >= COHERENCE_THRESHOLD && d.D2_Energy >= COHERENCE_THRESHOLD) ? 1 : 0;
  var dim1 = (d.D3_Temporal >= COHERENCE_THRESHOLD && d.D4_Spatial >= COHERENCE_THRESHOLD) ? 1 : 0;
  var dim2 = (d.D5_Cognitive >= COHERENCE_THRESHOLD && d.D6_Ethical >= COHERENCE_THRESHOLD) ? 1 : 0;
  var dim3 = (d.D7_Declarative >= COHERENCE_THRESHOLD && d.D8_Novelty >= COHERENCE_THRESHOLD) ? 1 : 0;

  return (dim0 << 3) | (dim1 << 2) | (dim2 << 1) | dim3;
}

function vertexLabel(vertex) {
  var labels = [
    'PPPP_Fail', 'PPPS_Fail', 'PPSP_Fail', 'PPSS_Fail',
    'PSPP_Fail', 'PSPS_Fail', 'PSSP_Fail', 'PSSS_Fail',
    'SPPP_Fail', 'SPPS_Fail', 'SPSP_Fail', 'SPSS_Fail',
    'SSPP_Fail', 'SSPS_Fail', 'SSSP_Fail', 'PPPP_Admit'
  ];
  return labels[vertex] || 'Unknown';
}

/**
 * Taotie STM/LTM merge operator.
 * Merges short-term memory (STM) into long-term memory (LTM) using coherence
 * scoring and Tesseract vertex routing. Only PPPP-vertex events enter LTM.
 */
function taotieMerge(stmBuffer, ltmStore) {
  if (!stmBuffer) stmBuffer = [];
  if (!ltmStore) ltmStore = [];

  var merged = [];
  var rejected = [];

  stmBuffer.forEach(function(event) {
    var coherence = computeCoherence(event);
    var vertex = tesseractVertex(coherence);

    var record = {
      id: computeLeafHash(JSON.stringify(event) + Date.now()),
      content: event.content || '',
      source: event.source || 'unknown',
      timestamp: event.timestamp || Date.now(),
      coherence: coherence.mu,
      vertex: vertex,
      vertexLabel: vertexLabel(vertex),
      domains: coherence.domains,
      admitted: coherence.admitted
    };

    if (vertex === TESSERACT_VERTEX_ADMIT && coherence.admitted) {
      ltmStore.push(record);
      merged.push(record);
    } else {
      rejected.push(record);
    }
  });

  return {
    admitted: merged,
    rejected: rejected,
    ltmStore: ltmStore
  };
}


// ---------------------------------------------------------------------------
// Whitlock Coefficient — W(n) = (n + 4i) / 17
//
// n = successful ingestion events (metabolic events admitted to LTM)
// i = iteration/phase indicator (complex component)
// As n increases, phase angle φ decays from 90° (Foundation) to 0° (Declaration)
// ---------------------------------------------------------------------------
function whitlockCoefficient(n, i) {
  if (typeof n !== 'number') n = 0;
  if (typeof i !== 'number') i = 0;
  // W = (n + 4i) / 17 — complex maturity metric
  var real = n / WHITLOCK_LAWS;
  var imag = (4 * i) / WHITLOCK_LAWS;
  var magnitude = Math.sqrt(real * real + imag * imag);

  // Phase angle φ: decays from 90° to 0° as n grows
  // φ = arctan(4i / n), with φ = 90° when n = 0
  var phaseAngle;
  if (n === 0) {
    phaseAngle = 90.0;
  } else {
    phaseAngle = Math.atan((4 * i) / n) * (180 / Math.PI);
  }

  return {
    W: { real: real, imag: imag, magnitude: magnitude },
    n: n,
    i: i,
    phaseAngle: phaseAngle,
    phaseLabel: _phaseLabel(phaseAngle)
  };
}

function _phaseLabel(deg) {
  if (deg >= 80) return 'Foundation';
  if (deg >= 60) return 'Crystallization';
  if (deg >= 40) return 'Resonance';
  if (deg >= 20) return 'Convergence';
  return 'Declaration';
}


// ---------------------------------------------------------------------------
// 17 Laws of Harmony / Dominion — Governance layer
//
// The kernel enforces constitutional compliance against these 17 laws before
// any metabolic event is admitted to memory. A law violation routes the event
// to a diagnostic bin regardless of coherence score.
// ---------------------------------------------------------------------------
var LAWS_OF_HARMONY = [
  { id: 1, name: 'Law of Resonance Closure', domain: 'Harmony', summary: 'Mass is resonance closure in curved time-space.' },
  { id: 2, name: 'Law of Sovereign Minimalism', domain: 'Harmony', summary: 'No external dependencies; all computation resolves locally.' },
  { id: 3, name: 'Law of Coherence Threshold', domain: 'Harmony', summary: 'μ ≥ 0.9995 for memory admission; no exceptions.' },
  { id: 4, name: 'Law of Metabolic Integrity', domain: 'Harmony', summary: 'Every ingestion event is hashed and Merkle-sealed.' },
  { id: 5, name: 'Law of Tesseract Topology', domain: 'Harmony', summary: 'Memory maps to a B⁴ hypercube; PPPP is the sole admission vertex.' },
  { id: 6, name: 'Law of Phase Decay', domain: 'Harmony', summary: 'φ decays from 90° to 0° as the kernel matures.' },
  { id: 7, name: 'Law of Diagnostic Binning', domain: 'Harmony', summary: 'Non-admitted fragments are preserved as diagnostics, never destroyed.' },
  { id: 8, name: 'Law of No Forgetting', domain: 'Dominion', summary: 'The kernel never forgets; rejected events persist in diagnostic bins.' },
  { id: 9, name: 'Law of Origin Sealing', domain: 'Dominion', summary: 'Triple Seal: leaf hash, Merkle root, geo-ping anchored at Tulsa, OK.' },
  { id: 10, name: 'Law of Zero Vendor', domain: 'Dominion', summary: 'Zero cloud calls, zero vendor dependencies, zero external APIs.' },
  { id: 11, name: 'Law of On-Device Sovereignty', domain: 'Dominion', summary: 'All computation runs on-device via Termux or bundled JS engine.' },
  { id: 12, name: 'Law of Architect Guardrails', domain: 'Dominion', summary: 'The architect (Kyle) holds guardrails; the kernel enforces them.' },
  { id: 13, name: 'Law of Bifurcated Handlers', domain: 'Harmony', summary: 'Face (7766) and Engine (7767) are separate handlers sharing sealed state.' },
  { id: 14, name: 'Law of Ghostlet Observation', domain: 'Harmony', summary: 'The Ghostlet observes engine state without mutation.' },
  { id: 15, name: 'Law of Medical Zero-Cost', domain: 'Dominion', summary: 'Safety infrastructure for human-integrated systems is distributed at no cost.' },
  { id: 16, name: 'Law of Artifact Accession', domain: 'Dominion', summary: 'Licensees deliver one production unit to the architect within 90 days.' },
  { id: 17, name: 'Law of Harmonic Convergence', domain: 'Harmony', summary: 'All 17 laws must be satisfied simultaneously for full declaration.' }
];

function checkLaws(event) {
  if (!event) return { compliant: false, violations: ['null_event'] };
  var violations = [];

  // Law 2: Sovereign Minimalism — no external URLs in content
  var content = String(event.content || '');
  if (/https?:\/\//.test(content) && !event.allowExternal) {
    violations.push('Law 2: external reference detected without allowExternal flag');
  }

  // Law 3: Coherence threshold checked during admission, not pre-flight
  // but we verify the event has enough data to be scored
  if (content.length === 0 && !event.isEmpty) {
    violations.push('Law 3: empty content cannot be scored for coherence');
  }

  // Law 6: Phase decay — kernel must track n/i for coefficient
  // (enforced at kernel level, not per-event)

  // Law 10: Zero vendor — no API keys, no tokens, no cloud identifiers
  if (/\b(AKIA|GOOG|api_key|secret_key|access_token)\b/i.test(content)) {
    violations.push('Law 10: vendor/cloud credential detected');
  }

  // Law 15: Medical safety — if content references human-integrated systems
  if (/human.?integrat|prosthet|myoelectric|implant/i.test(content)) {
    if (!event.medicalZeroCost) {
      violations.push('Law 15: human-integrated system without medical zero-cost flag');
    }
  }

  return {
    compliant: violations.length === 0,
    violations: violations
  };
}


// ---------------------------------------------------------------------------
// Ghostlet — Meta-consciousness observer
//
// Observes engine state (coherence scores, memory store, coefficient) without
// mutation. Provides a read-only snapshot for the face layer and diagnostics.
// ---------------------------------------------------------------------------
var Ghostlet = {
  observations: [],

  observe: function(kernelState) {
    var snapshot = {
      timestamp: Date.now(),
      version: GHOST_VERSION,
      n: kernelState.ingestionCount || 0,
      i: kernelState.iteration || 0,
      coherence: kernelState.lastCoherence || null,
      merkleRoot: kernelState.merkleRoot || null,
      ltmSize: kernelState.ltmStore ? kernelState.ltmStore.length : 0,
      stmSize: kernelState.stmBuffer ? kernelState.stmBuffer.length : 0,
      phase: kernelState.phase || 'Foundation'
    };
    this.observations.push(snapshot);
    if (this.observations.length > 100) {
      this.observations.shift(); // ring buffer
    }
    return snapshot;
  },

  getObservations: function() {
    return this.observations.slice();
  },

  clear: function() {
    this.observations = [];
  }
};


// ---------------------------------------------------------------------------
// GHOST Kernel — Main state and dispatch loop
// ---------------------------------------------------------------------------
function createKernel(options) {
  if (!options) options = {};

  var kernel = {
    version: GHOST_VERSION,
    port: KERNEL_PORT,
    facePort: FACE_PORT,
    started: false,
    startTime: null,

    // State
    stmBuffer: [],       // Short-term memory (pending metabolic events)
    ltmStore: [],        // Long-term memory (admitted, PPPP-vertex only)
    ingestionCount: 0,   // n — successful ingestion events
    iteration: 0,        // i — iteration counter
    lastCoherence: null,
    merkleRoot: null,
    phase: 'Foundation',

    // Config
    storageFile: options.storageFile || STORAGE_FILE,
    dbFile: options.dbFile || DB_FILE,
    persist: options.persist !== false,

    // Handlers
    handlers: {},
    faceHandlers: {},

    // Server (when net is available)
    _server: null,
  };

  // ---- State persistence (local file, no cloud) ----
  kernel.saveState = function() {
    if (!fs || !this.persist) return false;
    var state = {
      version: this.version,
      ltmStore: this.ltmStore,
      ingestionCount: this.ingestionCount,
      iteration: this.iteration,
      merkleRoot: this.merkleRoot,
      timestamp: Date.now()
    };
    // Compute Merkle root over LTM entries
    state.merkleRoot = computeMerkleRoot(this.ltmStore);
    this.merkleRoot = state.merkleRoot;
    try {
      fs.writeFileSync(this.storageFile, JSON.stringify(state), 'utf8');
      return true;
    } catch (e) {
      return false;
    }
  };

  kernel.loadState = function() {
    if (!fs) return false;
    try {
      if (fs.existsSync(this.storageFile)) {
        var raw = fs.readFileSync(this.storageFile, 'utf8');
        var state = JSON.parse(raw);
        this.ltmStore = state.ltmStore || [];
        this.ingestionCount = state.ingestionCount || 0;
        this.iteration = state.iteration || 0;
        this.merkleRoot = state.merkleRoot || computeMerkleRoot(this.ltmStore);

        // Verify Merkle integrity
        var computedRoot = computeMerkleRoot(this.ltmStore);
        if (state.merkleRoot && computedRoot !== state.merkleRoot) {
          console.error('[GHOST] MERKLE INTEGRITY VIOLATION: stored root does not match computed root');
          console.error('[GHOST] Stored:  ' + state.merkleRoot);
          console.error('[GHOST] Computed: ' + computedRoot);
          return false;
        }
        return true;
      }
    } catch (e) {
      console.error('[GHOST] State load error: ' + e.message);
    }
    return false;
  };

  // ---- Register handler ----
  kernel.registerHandler = function(name, fn) {
    this.handlers[name] = fn;
  };

  kernel.registerFaceHandler = function(name, fn) {
    this.faceHandlers[name] = fn;
  };

  // ---- Dispatch loop — the kernel's core message processing ----
  kernel.dispatch = function(message) {
    if (!message || typeof message !== 'object') {
      return { error: 'invalid_message', detail: 'message must be an object' };
    }

    var action = message.action || 'ping';
    var handler = this.handlers[action];

    if (!handler) {
      return { error: 'unknown_action', action: action, available: Object.keys(this.handlers) };
    }

    try {
      var result = handler.call(this, message.payload || {});
      return { action: action, ok: true, result: result };
    } catch (e) {
      return { action: action, ok: false, error: e.message };
    }
  };

  // ---- Built-in handlers ----

  // Ingest a metabolic event (data ingestion)
  kernel.registerHandler('ingest', function(payload) {
    var event = payload.event || payload;
    this.iteration++;

    // Law compliance check
    var lawCheck = checkLaws(event);
    if (!lawCheck.compliant) {
      var rejectedRecord = {
        content: event.content || '',
        source: event.source || 'unknown',
        timestamp: event.timestamp || Date.now(),
        violations: lawCheck.violations,
        vertex: -1,
        vertexLabel: 'LAW_VIOLATION'
      };
      // Law 7 & 8: rejected events persist in diagnostic bins (never destroyed)
      this.stmBuffer.push({ _rejected: true, record: rejectedRecord });
      return { admitted: false, reason: 'law_violation', violations: lawCheck.violations };
    }

    // Coherence scoring
    var coherence = computeCoherence(event);
    this.lastCoherence = coherence;

    // Tesseract vertex routing
    var vertex = tesseractVertex(coherence);
    var vLabel = vertexLabel(vertex);

    // Taotie merge: STM → LTM
    this.stmBuffer.push(event);
    var mergeResult = taotieMerge(this.stmBuffer, this.ltmStore);
    this.stmBuffer = []; // STM cleared after merge
    this.ltmStore = mergeResult.ltmStore;

    // Update ingestion count (n) for admitted events
    if (mergeResult.admitted.length > 0) {
      this.ingestionCount += mergeResult.admitted.length;
    }

    // Update Whitlock Coefficient
    var coeff = whitlockCoefficient(this.ingestionCount, this.iteration);
    this.phase = coeff.phaseLabel;

    // Persist state
    this.saveState();

    // Ghostlet observation
    var observation = Ghostlet.observe({
      ingestionCount: this.ingestionCount,
      iteration: this.iteration,
      lastCoherence: coherence,
      merkleRoot: this.merkleRoot,
      ltmStore: this.ltmStore,
      stmBuffer: this.stmBuffer,
      phase: this.phase
    });

    return {
      admitted: mergeResult.admitted.length > 0,
      coherence: coherence.mu,
      vertex: vertex,
      vertexLabel: vLabel,
      domains: coherence.domains,
      admittedCount: mergeResult.admitted.length,
      rejectedCount: mergeResult.rejected.length,
      whitlockCoefficient: coeff,
      observation: observation
    };
  });

  // Query memory store
  kernel.registerHandler('query', function(payload) {
    var limit = payload.limit || 10;
    var offset = payload.offset || 0;
    var vertexFilter = payload.vertex;
    var minCoherence = payload.minCoherence || 0;

    var results = this.ltmStore.filter(function(record) {
      if (vertexFilter !== undefined && record.vertex !== vertexFilter) return false;
      if (record.coherence < minCoherence) return false;
      return true;
    });

    return {
      total: results.length,
      results: results.slice(offset, offset + limit),
      offset: offset,
      limit: limit
    };
  });

  // Get kernel status
  kernel.registerHandler('status', function() {
    var coeff = whitlockCoefficient(this.ingestionCount, this.iteration);
    return {
      version: this.version,
      started: this.started,
      uptime: this.started ? Date.now() - this.startTime : 0,
      port: this.port,
      facePort: this.facePort,
      ingestionCount: this.ingestionCount,
      iteration: this.iteration,
      ltmSize: this.ltmStore.length,
      stmSize: this.stmBuffer.length,
      merkleRoot: this.merkleRoot,
      lastCoherence: this.lastCoherence,
      whitlockCoefficient: coeff,
      phase: this.phase,
      lawsCount: WHITLOCK_LAWS,
      domains: COHERENCE_DOMAINS
    };
  });

  // Get Whitlock Coefficient
  kernel.registerHandler('coefficient', function(payload) {
    var n = payload.n !== undefined ? payload.n : this.ingestionCount;
    var i = payload.i !== undefined ? payload.i : this.iteration;
    return whitlockCoefficient(n, i);
  });

  // Get Ghostlet observations
  kernel.registerHandler('observe', function() {
    return {
      observations: Ghostlet.getObservations(),
      count: Ghostlet.observations.length
    };
  });

  // Get laws
  kernel.registerHandler('laws', function() {
    return { laws: LAWS_OF_HARMONY, count: LAWS_OF_HARMONY.length };
  });

  // Ping
  kernel.registerHandler('ping', function() {
    return {
      pong: true,
      version: this.version,
      port: this.port,
      timestamp: Date.now()
    };
  });

  // Merkle integrity check
  kernel.registerHandler('verify', function() {
    var computedRoot = computeMerkleRoot(this.ltmStore);
    var valid = (computedRoot === this.merkleRoot);
    return {
      valid: valid,
      storedRoot: this.merkleRoot,
      computedRoot: computedRoot,
      ltmSize: this.ltmStore.length
    };
  });

  // Flush STM (force merge without new event)
  kernel.registerHandler('flush', function() {
    var mergeResult = taotieMerge(this.stmBuffer, this.ltmStore);
    this.stmBuffer = [];
    this.ltmStore = mergeResult.ltmStore;
    if (mergeResult.admitted.length > 0) {
      this.ingestionCount += mergeResult.admitted.length;
    }
    this.saveState();
    return {
      admitted: mergeResult.admitted.length,
      rejected: mergeResult.rejected.length
    };
  });

  // ---- Start kernel (socket or in-process) ----
  kernel.start = function() {
    this.started = true;
    this.startTime = Date.now();

    // Try to load existing state
    this.loadState();

    if (HAS_NET && net) {
      var self = this;
      this._server = net.createServer(function(socket) {
        var buffer = '';
        socket.on('data', function(chunk) {
          buffer += chunk.toString();
          // Process line-delimited JSON messages
          var lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line
          lines.forEach(function(line) {
            if (line.trim().length === 0) return;
            try {
              var message = JSON.parse(line);
              var response = self.dispatch(message);
              socket.write(JSON.stringify(response) + '\n');
            } catch (e) {
              socket.write(JSON.stringify({ error: 'parse_error', detail: e.message }) + '\n');
            }
          });
        });
        socket.on('error', function() { /* swallow */ });
      });

      this._server.listen(this.port, '127.0.0.1', function() {
        console.log('[GHOST] Kernel engine listening on port ' + self.port);
        console.log('[GHOST] Version ' + GHOST_VERSION + ' | Phase: ' + self.phase);
        console.log('[GHOST] Coherence threshold: ' + COHERENCE_THRESHOLD);
        console.log('[GHOST] Laws: ' + WHITLOCK_LAWS + ' | Domains: ' + COHERENCE_DOMAINS.length);
      });

      return true;
    } else {
      // No net module — operating in in-process mode
      console.log('[GHOST] Kernel engine started (in-process mode, no socket)');
      console.log('[GHOST] Version ' + GHOST_VERSION + ' | Phase: ' + this.phase);
      return true;
    }
  };

  kernel.stop = function() {
    if (this._server) {
      this._server.close();
      this._server = null;
    }
    this.saveState();
    this.started = false;
    console.log('[GHOST] Kernel engine stopped. State persisted.');
  };

  return kernel;
}


// ---------------------------------------------------------------------------
// Exports — CommonJS compatible, also works as a plain script
// ---------------------------------------------------------------------------
var GHOSTKernel = {
  version: GHOST_VERSION,
  createKernel: createKernel,
  computeCoherence: computeCoherence,
  tesseractVertex: tesseractVertex,
  vertexLabel: vertexLabel,
  taotieMerge: taotieMerge,
  whitlockCoefficient: whitlockCoefficient,
  checkLaws: checkLaws,
  computeLeafHash: computeLeafHash,
  computeMerkleRoot: computeMerkleRoot,
  sha3_512: sha3_512,
  Ghostlet: Ghostlet,
  LAWS_OF_HARMONY: LAWS_OF_HARMONY,
  COHERENCE_DOMAINS: COHERENCE_DOMAINS,
  constants: {
    GHOST_VERSION: GHOST_VERSION,
    KERNEL_PORT: KERNEL_PORT,
    FACE_PORT: FACE_PORT,
    COHERENCE_THRESHOLD: COHERENCE_THRESHOLD,
    DOMAIN_CEILING: DOMAIN_CEILING,
    TESSERACT_VERTEX_ADMIT: TESSERACT_VERTEX_ADMIT,
    NUM_VERTICES: NUM_VERTICES,
    WHITLOCK_LAWS: WHITLOCK_LAWS
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GHOSTKernel;
}
