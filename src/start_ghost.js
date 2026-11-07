#!/usr/bin/env node
/**
 * start_ghost.js — GHOST v9.1.0 Startup Script
 *
 * Sovereign Research Archive — Complex System Sanity Labs
 *
 * Entry point for on-device execution via Termux Node.js or bundled JS engine.
 * Starts the kernel engine (port 7767) and face interface (port 7766).
 *
 * Usage:
 *   node start_ghost.js              # Start both kernel and face
 *   node start_ghost.js --kernel     # Start kernel only
 *   node start_ghost.js --face       # Start face only (kernel must be running)
 *
 * Termux installation:
 *   pkg install nodejs
 *   node start_ghost.js
 */

'use strict';

var args = process.argv.slice(2);
var kernelOnly = args.indexOf('--kernel') !== -1;
var faceOnly = args.indexOf('--face') !== -1;

var ghostKernel = null;
var ghostFace = null;

try {
  ghostKernel = require('./ghost_kernel.js');
} catch (e) {
  console.error('FATAL: Cannot load ghost_kernel.js: ' + e.message);
  process.exit(1);
}

try {
  ghostFace = require('./ghost_face.js');
} catch (e) {
  console.error('FATAL: Cannot load ghost_face.js: ' + e.message);
  process.exit(1);
}

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  GHOST v9.1.0 — Sovereign Research Archive                    ║');
console.log('║  Complex System Sanity Labs                                  ║');
console.log('║  Zero vendor. Zero cloud. On-device.                         ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');

var kernel = null;
var face = null;

if (!faceOnly) {
  console.log('[START] Launching kernel engine (port 7767)...');
  kernel = ghostKernel.createKernel();
  kernel.start();
  console.log('');
}

if (!kernelOnly) {
  console.log('[START] Launching face interface (port 7766)...');
  face = ghostFace.createFace({ kernel: kernel });
  face.start();
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════════');
if (kernel) {
  console.log('  Kernel Engine:  port 7767 (TCP, line-delimited JSON)');
}
if (face) {
  console.log('  Face Interface: port 7766 (TCP, line-delimited JSON)');
  console.log('  HTTP Dashboard: http://127.0.0.1:7767/dashboard');
}
console.log('');
console.log('  Endpoints:');
console.log('    { "action": "ping" }');
console.log('    { "action": "status" }');
console.log('    { "action": "ingest", "payload": { "event": { "content": "..." } } }');
console.log('    { "action": "query", "payload": { "limit": 10 } }');
console.log('    { "action": "coefficient" }');
console.log('    { "action": "observe" }');
console.log('    { "action": "laws" }');
console.log('    { "action": "verify" }');
console.log('');
console.log('  Press Ctrl+C to shut down.');
console.log('═══════════════════════════════════════════════════════════════');

// Graceful shutdown
function shutdown() {
  console.log('\n[SHUTDOWN] Graceful shutdown initiated...');
  if (face) face.stop();
  if (kernel) kernel.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
