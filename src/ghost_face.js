/**
 * ghost_face.js — GHOST v9.1.0 Face / UI Handler (Port 7766)
 *
 * Sovereign Research Archive — Complex System Sanity Labs
 *
 * Self-contained face/interface layer for on-device execution via Termux
 * Node.js or a bundled JS engine. Zero external process dependencies —
 * all calls resolve to in-process kernel calls or local files.
 *
 * Architecture: Bifurcated Backend (Handler A — Face)
 *   - Serves the Prim persona (UI/Dashboard)
 *   - Proxies commands to the kernel engine (port 7767) via in-process
 *     dispatch or TCP socket when net is available
 *   - Read-only access to kernel state (status, queries, observations)
 *   - No write path to LTM — all writes go through the kernel dispatch loop
 *
 * Port binding is conditional on the net module (Node.js). When running under
 * a bundled engine without net, the face operates via the in-process
 * interface and calls the kernel directly.
 */

'use strict';

// ---------------------------------------------------------------------------
// Conditional requires
// ---------------------------------------------------------------------------
var HAS_NET = false;
var net = null;
var http = null;
var fs = null;
var path = null;

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


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
var FACE_VERSION = '9.1.0';
var FACE_PORT = 7766;
var KERNEL_PORT = 7767;
var KERNEL_HOST = '127.0.0.1';

// AI Personas (from the research corpus)
var PERSONAS = {
  prim: { name: 'Prim', role: 'UI/Dashboard', handler: 'face', description: 'Primary interface persona' },
  zo: { name: 'Zo', role: 'Formalization', handler: 'engine', description: 'Mathematical formalization' },
  kimi: { name: 'Kimi', role: 'Build', handler: 'engine', description: 'Build and integration' },
  surething: { name: 'SureThing AI', role: 'Benchmarks', handler: 'engine', description: 'Performance benchmarks' },
  ghostlet: { name: 'The Ghostlet', role: 'Meta-consciousness', handler: 'observer', description: 'Read-only engine observer' }
};


// ---------------------------------------------------------------------------
// Ghost Face — Interface layer
// ---------------------------------------------------------------------------
function createFace(options) {
  if (!options) options = {};

  var face = {
    version: FACE_VERSION,
    port: FACE_PORT,
    kernelPort: KERNEL_PORT,
    kernelHost: KERNEL_HOST,
    started: false,
    startTime: null,
    kernel: null,          // in-process kernel reference
    _server: null,
    _httpServer: null,

    // If a kernel instance is provided, use in-process calls
    // Otherwise, use TCP socket to communicate with the kernel
    useInProcess: options.kernel ? true : false
  };

  // Set kernel reference for in-process mode
  if (options.kernel) {
    face.kernel = options.kernel;
  }

  // ---- Send message to kernel (in-process or TCP) ----
  face.sendToKernel = function(message, callback) {
    if (face.useInProcess && face.kernel) {
      // In-process: call kernel dispatch directly
      try {
        var response = face.kernel.dispatch(message);
        if (callback) callback(null, response);
        return response;
      } catch (e) {
        var errResponse = { error: 'kernel_error', detail: e.message };
        if (callback) callback(e, errResponse);
        return errResponse;
      }
    } else if (HAS_NET && net) {
      // TCP socket to kernel engine
      _socketCall(face.kernelHost, face.kernelPort, message, callback);
    } else {
      var noNetResponse = { error: 'no_transport', detail: 'Neither in-process kernel nor net module available' };
      if (callback) callback(new Error('no_transport'), noNetResponse);
      return noNetResponse;
    }
  };

  // Synchronous in-process version (for bundled engines without callbacks)
  face.sendToKernelSync = function(message) {
    if (face.useInProcess && face.kernel) {
      return face.kernel.dispatch(message);
    }
    // For TCP, we can't do sync; caller must use callback
    return { error: 'sync_unavailable', detail: 'TCP mode requires callback' };
  };

  // ---- Face API methods ----

  // Get kernel status (read-only)
  face.status = function(callback) {
    return face.sendToKernel({ action: 'status' }, callback);
  };

  // Get memory query results
  face.query = function(params, callback) {
    return face.sendToKernel({ action: 'query', payload: params || {} }, callback);
  };

  // Ingest data through the kernel (the only write path)
  face.ingest = function(event, callback) {
    return face.sendToKernel({ action: 'ingest', payload: { event: event } }, callback);
  };

  // Get Whitlock coefficient
  face.coefficient = function(n, i, callback) {
    return face.sendToKernel({
      action: 'coefficient',
      payload: { n: n, i: i }
    }, callback);
  };

  // Get Ghostlet observations
  face.observe = function(callback) {
    return face.sendToKernel({ action: 'observe' }, callback);
  };

  // Get laws
  face.laws = function(callback) {
    return face.sendToKernel({ action: 'laws' }, callback);
  };

  // Verify Merkle integrity
  face.verify = function(callback) {
    return face.sendToKernel({ action: 'verify' }, callback);
  };

  // Flush STM
  face.flush = function(callback) {
    return face.sendToKernel({ action: 'flush' }, callback);
  };

  // Ping kernel
  face.ping = function(callback) {
    return face.sendToKernel({ action: 'ping' }, callback);
  };

  // ---- Dashboard rendering (text-based, for terminal/Android display) ----
  face.renderDashboard = function(callback) {
    face.status(function(err, status) {
      if (err || !status || status.error) {
        var errDashboard = _renderErrorDashboard(err || status);
        if (callback) callback(null, errDashboard);
        return;
      }

      var result = status.result || status;
      var dashboard = _renderStatusDashboard(result);

      // Also fetch observations
      face.observe(function(oErr, oResult) {
        var obs = oResult && oResult.result ? oResult.result.observations : [];
        var obsSection = _renderObservations(obs);
        var fullDashboard = dashboard + '\n' + obsSection;
        if (callback) callback(null, fullDashboard);
      });
    });
  };

  // ---- Handle HTTP request (when http is available, for browser access) ----
  face._handleHttpRequest = function(req, res) {
    var self = face;
    var url = req.url || '/';

    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Parse path and query
    var pathParts = url.split('?');
    var route = pathParts[0];
    var query = _parseQuery(pathParts[1] || '');

    if (route === '/' || route === '/dashboard') {
      face.renderDashboard(function(err, dashboard) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(_wrapDashboardHTML(dashboard));
      });
      return;
    }

    if (route === '/api/status') {
      face.status(function(err, result) {
        _sendJSON(res, result);
      });
      return;
    }

    if (route === '/api/query') {
      face.query(query, function(err, result) {
        _sendJSON(res, result);
      });
      return;
    }

    if (route === '/api/observe') {
      face.observe(function(err, result) {
        _sendJSON(res, result);
      });
      return;
    }

    if (route === '/api/laws') {
      face.laws(function(err, result) {
        _sendJSON(res, result);
      });
      return;
    }

    if (route === '/api/coefficient') {
      face.coefficient(
        query.n ? parseInt(query.n) : undefined,
        query.i ? parseInt(query.i) : undefined,
        function(err, result) {
          _sendJSON(res, result);
        }
      );
      return;
    }

    if (route === '/api/verify') {
      face.verify(function(err, result) {
        _sendJSON(res, result);
      });
      return;
    }

    if (route === '/api/ingest' && req.method === 'POST') {
      _readBody(req, function(body) {
        try {
          var event = JSON.parse(body);
          face.ingest(event, function(err, result) {
            _sendJSON(res, result);
          });
        } catch (e) {
          _sendJSON(res, { error: 'invalid_json', detail: e.message }, 400);
        }
      });
      return;
    }

    // Personas endpoint
    if (route === '/api/personas') {
      _sendJSON(res, { personas: PERSONAS });
      return;
    }

    // 404
    _sendJSON(res, { error: 'not_found', route: route }, 404);
  };

  // ---- Start the face server ----
  face.start = function() {
    face.started = true;
    face.startTime = Date.now();

    if (HAS_NET && net) {
      // Start TCP socket server for line-delimited JSON protocol
      face._server = net.createServer(function(socket) {
        var buffer = '';
        socket.on('data', function(chunk) {
          buffer += chunk.toString();
          var lines = buffer.split('\n');
          buffer = lines.pop();
          lines.forEach(function(line) {
            if (line.trim().length === 0) return;
            try {
              var message = JSON.parse(line);
              // Route face-level messages or proxy to kernel
              var response = face._handleMessage(message);
              socket.write(JSON.stringify(response) + '\n');
            } catch (e) {
              socket.write(JSON.stringify({ error: 'parse_error', detail: e.message }) + '\n');
            }
          });
        });
        socket.on('error', function() { /* swallow */ });
      });

      face._server.listen(face.port, '127.0.0.1', function() {
        console.log('[GHOST-Face] Interface listening on port ' + face.port);
        console.log('[GHOST-Face] Version ' + FACE_VERSION);
        console.log('[GHOST-Face] Kernel: ' + (face.useInProcess ? 'in-process' : 'TCP ' + face.kernelHost + ':' + face.kernelPort));
      });

      // Start HTTP server for browser/dashboard access
      if (http) {
        face._httpServer = http.createServer(function(req, res) {
          face._handleHttpRequest(req, res);
        });
        face._httpServer.listen(face.port + 1, '127.0.0.1', function() {
          console.log('[GHOST-Face] HTTP dashboard on http://127.0.0.1:' + (face.port + 1) + '/dashboard');
        });
      }

      return true;
    } else {
      // In-process only mode
      console.log('[GHOST-Face] Interface started (in-process mode, no socket)');
      console.log('[GHOST-Face] Version ' + FACE_VERSION);
      return true;
    }
  };

  face.stop = function() {
    if (face._server) {
      face._server.close();
      face._server = null;
    }
    if (face._httpServer) {
      face._httpServer.close();
      face._httpServer = null;
    }
    face.started = false;
    console.log('[GHOST-Face] Interface stopped.');
  };

  // ---- Message handler (for TCP protocol) ----
  face._handleMessage = function(message) {
    if (!message || typeof message !== 'object') {
      return { error: 'invalid_message' };
    }

    var action = message.action;

    // Face-level actions
    switch (action) {
      case 'face_status':
        return {
          ok: true,
          result: {
            version: face.version,
            port: face.port,
            started: face.started,
            uptime: face.started ? Date.now() - face.startTime : 0,
            kernelMode: face.useInProcess ? 'in-process' : 'tcp',
            kernelPort: face.kernelPort,
            personas: PERSONAS
          }
        };
      case 'dashboard':
        var status = face.sendToKernelSync({ action: 'status' });
        return { ok: true, result: { status: status, text: _renderStatusDashboard(status.result || status) } };
      case 'personas':
        return { ok: true, result: { personas: PERSONAS } };
      default:
        // Proxy to kernel
        return face.sendToKernelSync(message);
    }
  };

  return face;
}


// ---------------------------------------------------------------------------
// TCP socket call helper (asynchronous)
// ---------------------------------------------------------------------------
function _socketCall(host, port, message, callback) {
  if (!net) {
    if (callback) callback(new Error('no_net'), { error: 'no_net' });
    return;
  }

  var socket = new net.Socket();
  var response = '';
  var done = false;

  socket.connect(port, host, function() {
    socket.write(JSON.stringify(message) + '\n');
  });

  socket.on('data', function(data) {
    response += data.toString();
    // Check for complete line-delimited JSON
    if (response.indexOf('\n') !== -1) {
      var lines = response.split('\n');
      var line = lines[0];
      if (line.trim().length > 0) {
        try {
          var result = JSON.parse(line);
          if (!done) {
            done = true;
            if (callback) callback(null, result);
          }
        } catch (e) {
          if (!done) {
            done = true;
            if (callback) callback(e, { error: 'parse_error', detail: e.message });
          }
        }
      }
      socket.destroy();
    }
  });

  socket.on('error', function(err) {
    if (!done) {
      done = true;
      if (callback) callback(err, { error: 'connection_error', detail: err.message });
    }
  });

  socket.setTimeout(5000, function() {
    if (!done) {
      done = true;
      socket.destroy();
      if (callback) callback(new Error('timeout'), { error: 'timeout' });
    }
  });
}


// ---------------------------------------------------------------------------
// Dashboard rendering helpers
// ---------------------------------------------------------------------------
function _renderStatusDashboard(status) {
  if (!status || status.error) {
    return _renderErrorDashboard(status);
  }

  var lines = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  GHOST v' + (status.version || '9.1.0') + ' — Sovereign Research Archive');
  lines.push('  Complex System Sanity Labs');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('  KERNEL ENGINE (Port 7767)');
  lines.push('  ─────────────────────────');
  lines.push('  Status:      ' + (status.started ? 'RUNNING' : 'STOPPED'));
  lines.push('  Uptime:      ' + _formatUptime(status.uptime || 0));
  lines.push('  Ingestions:  ' + (status.ingestionCount || 0));
  lines.push('  Iterations:  ' + (status.iteration || 0));
  lines.push('');
  lines.push('  MEMORY');
  lines.push('  ─────────────────────────');
  lines.push('  LTM Records: ' + (status.ltmSize || 0));
  lines.push('  STM Buffer:  ' + (status.stmSize || 0));
  lines.push('  Merkle Root: ' + _truncate(status.merkleRoot || '—', 32));
  lines.push('');
  lines.push('  COHERENCE & COEFFICIENT');
  lines.push('  ─────────────────────────');
  if (status.lastCoherence) {
    lines.push('  Last μ:      ' + (status.lastCoherence.mu || 0).toFixed(6));
    lines.push('  Admitted:    ' + (status.lastCoherence.admitted ? 'YES' : 'NO'));
  } else {
    lines.push('  Last μ:      — (no events yet)');
  }
  if (status.whitlockCoefficient) {
    var wc = status.whitlockCoefficient;
    lines.push('  W(n,i):      |' + wc.W.real.toFixed(4) + ' + ' + wc.W.imag.toFixed(4) + 'i| = ' + wc.W.magnitude.toFixed(4));
    lines.push('  Phase φ:     ' + wc.phaseAngle.toFixed(1) + '° (' + wc.phaseLabel + ')');
  }
  lines.push('  Threshold:   μ ≥ ' + (status.coherenceThreshold || 0.9995));
  lines.push('  Domains:     ' + (status.domains ? status.domains.length : 8) + ' (CC v3.0)');
  lines.push('  Laws:        ' + (status.lawsCount || 17));
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

function _renderErrorDashboard(err) {
  var msg = (err && err.error) ? err.error : 'unknown_error';
  var detail = (err && err.detail) ? err.detail : '';
  return [
    '═══════════════════════════════════════════════════════════════',
    '  GHOST-Face — ERROR',
    '═══════════════════════════════════════════════════════════════',
    '',
    '  Error: ' + msg,
    detail ? '  Detail: ' + detail : '',
    '',
    '  The kernel engine may not be running on port 7767.',
    '  Start it with: node ghost_kernel.js',
    '',
    '═══════════════════════════════════════════════════════════════'
  ].join('\n');
}

function _renderObservations(observations) {
  if (!observations || observations.length === 0) {
    return [
      '  GHOSTLET OBSERVATIONS',
      '  ─────────────────────────',
      '  (no observations yet)',
      ''
    ].join('\n');
  }

  var lines = [];
  lines.push('  GHOSTLET OBSERVATIONS (last ' + Math.min(5, observations.length) + ' of ' + observations.length + ')');
  lines.push('  ─────────────────────────');
  var recent = observations.slice(-5).reverse();
  recent.forEach(function(obs, idx) {
    lines.push('  [' + (idx + 1) + '] n=' + obs.n + ' i=' + obs.i + ' | μ=' + (obs.coherence ? obs.coherence.mu.toFixed(4) : '—') + ' | LTM=' + obs.ltmSize + ' | ' + obs.phase);
  });
  lines.push('');
  return lines.join('\n');
}

function _wrapDashboardHTML(text) {
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>GHOST v9.1.0 — Sovereign Research Archive</title>',
    '<style>',
    '  body { background: #0a0a0a; color: #00ff88; font-family: "Courier New", monospace; padding: 20px; }',
    '  pre { white-space: pre-wrap; word-wrap: break-word; line-height: 1.4; font-size: 13px; }',
    '  h1 { color: #00ff88; font-size: 16px; }',
    '  .footer { margin-top: 20px; color: #555; font-size: 11px; }',
    '  a { color: #00aaff; }',
    '</style>',
    '</head><body>',
    '<pre>' + _escapeHTML(text) + '</pre>',
    '<div class="footer">',
    '  <p>API endpoints: ',
    '<a href="/api/status">/api/status</a> · ',
    '<a href="/api/query">/api/query</a> · ',
    '<a href="/api/observe">/api/observe</a> · ',
    '<a href="/api/laws">/api/laws</a> · ',
    '<a href="/api/personas">/api/personas</a> · ',
    '<a href="/api/verify">/api/verify</a>',
    '</p>',
    '<p>GHOST v9.1.0 — Complex System Sanity Labs — Zero vendor, zero cloud, on-device</p>',
    '</div>',
    '</body></html>'
  ].join('\n');
}


// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function _parseQuery(qs) {
  var params = {};
  if (!qs) return params;
  qs.split('&').forEach(function(pair) {
    var parts = pair.split('=');
    params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
  });
  return params;
}

function _readBody(req, callback) {
  var body = '';
  req.on('data', function(chunk) { body += chunk.toString(); });
  req.on('end', function() { callback(body); });
}

function _sendJSON(res, data, status) {
  var statusCode = status || 200;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function _escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _truncate(str, len) {
  if (!str || str.length <= len) return str;
  return str.substring(0, len) + '...';
}

function _formatUptime(ms) {
  var seconds = Math.floor(ms / 1000);
  var hours = Math.floor(seconds / 3600);
  var minutes = Math.floor((seconds % 3600) / 60);
  var secs = seconds % 60;
  return hours + 'h ' + minutes + 'm ' + secs + 's';
}


// ---------------------------------------------------------------------------
// CLI entry point — when run directly, starts both face and kernel
// ---------------------------------------------------------------------------
function _cliMain() {
  var kernelModule = null;
  try {
    kernelModule = require('./ghost_kernel.js');
  } catch (e) {
    console.error('[GHOST-Face] Cannot load ghost_kernel.js: ' + e.message);
    console.error('[GHOST-Face] Running face-only mode (expects kernel on port 7767)');
  }

  var face = createFace({ kernel: kernelModule ? kernelModule.createKernel() : null });

  // If we have the kernel, start it first
  if (face.kernel) {
    face.kernel.start();
  }

  face.start();

  // Handle graceful shutdown
  process.on('SIGINT', function() {
    console.log('\n[GHOST-Face] Shutting down...');
    face.stop();
    if (face.kernel) {
      face.kernel.stop();
    }
    process.exit(0);
  });

  process.on('SIGTERM', function() {
    face.stop();
    if (face.kernel) {
      face.kernel.stop();
    }
    process.exit(0);
  });
}


// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
var GHOSTFace = {
  version: FACE_VERSION,
  createFace: createFace,
  PERSONAS: PERSONAS,
  constants: {
    FACE_VERSION: FACE_VERSION,
    FACE_PORT: FACE_PORT,
    KERNEL_PORT: KERNEL_PORT
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GHOSTFace;
}

// CLI entry point
if (typeof require !== 'undefined' && require.main === module) {
  _cliMain();
}
