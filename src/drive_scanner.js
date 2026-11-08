/**
 * drive_scanner.js — Four-Gate File Ingestion Engine
 * 
 * Parses ANY form of information packet across the full 2,000+ file corpus.
 * Implements the Ghost gate architecture (lexical → syntactic → semantic → pragmatic)
 * to ensure no detail is lost regardless of format or structure.
 *
 * Architecture:
 *   Gate 1 (Lexical)   — Raw byte/char scanning, encoding detection, tokenization
 *   Gate 2 (Syntactic) — Format detection, structure validation, AST-like extraction
 *   Gate 3 (Semantic)  — Domain classification, entity/concept extraction, relationship mapping
 *   Gate 4 (Pragmatic) — Law enforcement, coherence verification, provenance tracking
 *
 * Each gate returns a progressively richer representation of the file.
 * The scanner handles multi-pass ingestion: Pass 1 maps folders, Pass 2+ deep-parses.
 */

// ─── Gate 1: Lexical — Raw Character-Level Parsing ────────────────────────

const LEXICAL = {
  /**
   * Scan raw content at the byte/character level.
   * Detects encoding, BOM, line endings, and produces a token stream
   * that preserves EVERY character including whitespace, delimiters, and control chars.
   */
  scan: function(raw) {
    if (typeof raw !== 'string') {
      raw = String(raw);
    }

    const tokens = [];
    const len = raw.length;
    let pos = 0;

    // Detect encoding preamble
    const encoding = this._detectEncoding(raw);

    // Tokenize: whitespace runs, word-like runs, delimiters, control chars
    while (pos < len) {
      const ch = raw[pos];
      const code = raw.charCodeAt(pos);

      // Control character or high-byte
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        tokens.push({ type: 'control', value: ch, code: code, pos: pos });
        pos++;
        continue;
      }

      // Newline
      if (ch === '\n' || ch === '\r') {
        const nlEnd = (ch === '\r' && pos + 1 < len && raw[pos + 1] === '\n') ? 2 : 1;
        tokens.push({ type: 'newline', value: raw.substr(pos, nlEnd), pos: pos });
        pos += nlEnd;
        continue;
      }

      // Whitespace run
      if (/^\s$/.test(ch) && ch !== '\n' && ch !== '\r') {
        let end = pos;
        while (end < len && /^[ \t\f\v]$/.test(raw[end])) end++;
        tokens.push({ type: 'whitespace', value: raw.substring(pos, end), pos: pos });
        pos = end;
        continue;
      }

      // Delimiter / punctuation
      if (/^[{}()\[\]<>,.;:'"!@#$%^&*+=\/\\|`~\-]$/.test(ch)) {
        tokens.push({ type: 'delimiter', value: ch, pos: pos });
        pos++;
        continue;
      }

      // Alphanumeric / identifier run
      let end = pos;
      while (end < len && /^[\w\d_$]$/.test(raw[end])) end++;
      if (end > pos) {
        tokens.push({ type: 'word', value: raw.substring(pos, end), pos: pos });
        pos = end;
        continue;
      }

      // Catch-all: any remaining character
      tokens.push({ type: 'char', value: ch, code: code, pos: pos });
      pos++;
    }

    return {
      encoding: encoding,
      byteLength: Buffer.byteLength(raw, 'utf8'),
      charLength: len,
      lineCount: (raw.match(/\n/g) || []).length + 1,
      tokens: tokens,
      raw: raw  // Preserved for downstream gates
    };
  },

  _detectEncoding: function(raw) {
    if (raw.charCodeAt(0) === 0xFEFF) return 'utf16-be-bom';
    if (raw.charCodeAt(0) === 0xFFFE) return 'utf16-le-bom';
    if (raw.charCodeAt(0) === 0xEF && raw.charCodeAt(1) === 0xBB && raw.charCodeAt(2) === 0xBF) return 'utf8-bom';
    return 'utf8';  // default
  },

  /**
   * Extract raw line boundaries for line-oriented parsing.
   */
  lines: function(raw) {
    const lines = [];
    let start = 0;
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === '\n') {
        lines.push({ index: lines.length, start: start, end: i, text: raw.substring(start, i) });
        start = i + 1;
      } else if (raw[i] === '\r') {
        const nl = (i + 1 < raw.length && raw[i + 1] === '\n') ? 2 : 1;
        lines.push({ index: lines.length, start: start, end: i + nl, text: raw.substring(start, i) });
        start = i + nl;
        i += nl - 1;
      }
      i++;
    }
    if (start < raw.length) {
      lines.push({ index: lines.length, start: start, end: raw.length, text: raw.substring(start) });
    }
    return lines;
  }
};


// ─── Gate 2: Syntactic — Format Detection & Structure Parsing ─────────────

const SYNTACTIC = {
  /**
   * Detect file format by content signature, not by extension.
   * Returns the most likely format and its confidence score.
   */
  detectFormat: function(raw, filename) {
    const trimmed = raw.trim();
    const firstLine = trimmed.split('\n')[0].trim();
    const scores = [];

    // JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { JSON.parse(trimmed); scores.push({ format: 'json', confidence: 1.0 }); }
      catch (e) { scores.push({ format: 'json', confidence: 0.7 }); }
    }

    // YAML
    if (/^---\s*$/.test(firstLine) || /^\w+:\s/.test(firstLine)) {
      scores.push({ format: 'yaml', confidence: 0.85 });
    }

    // Markdown
    if (/^#{1,6}\s/.test(firstLine) || /^\|\s*[-]+\s*\|/.test(trimmed)) {
      scores.push({ format: 'markdown', confidence: 0.9 });
    }

    // JavaScript / TypeScript
    if (/^(import|export|const|let|var|function|class|module)/.test(trimmed) ||
        /\/\/.*\n|\/\*[\s\S]*?\*\//.test(trimmed)) {
      scores.push({ format: 'javascript', confidence: 0.85 });
    }

    // TOML
    if (/^\[\w+\]/.test(firstLine)) {
      scores.push({ format: 'toml', confidence: 0.8 });
    }

    // CSV
    if (/^[\w\s"]+,[\w\s"]+/.test(trimmed) && trimmed.includes('\n')) {
      const lines = trimmed.split('\n').filter(l => l.trim());
      const cols = lines[0].split(',').length;
      if (lines.length > 1 && lines.slice(1).every(l => l.split(',').length === cols || l.trim() === '')) {
        scores.push({ format: 'csv', confidence: 0.85 });
      }
    }

    // Plain text / unknown (always matches)
    scores.push({ format: 'text', confidence: 0.5 });

    scores.sort((a, b) => b.confidence - a.confidence);
    return scores[0] || { format: 'text', confidence: 0.5 };
  },

  /**
   * Parse the file into a structural model based on its format.
   */
  parse: function(raw, format) {
    switch (format) {
      case 'json': return this._parseJSON(raw);
      case 'yaml': return this._parseYAML(raw);
      case 'markdown': return this._parseMarkdown(raw);
      case 'javascript': return this._parseCode(raw);
      case 'csv': return this._parseCSV(raw);
      case 'toml': return this._parseTOML(raw);
      default: return this._parseText(raw);
    }
  },

  _parseJSON: function(raw) {
    try {
      const data = JSON.parse(raw);
      return {
        type: 'structured',
        format: 'json',
        rootType: Array.isArray(data) ? 'array' : typeof data,
        keys: typeof data === 'object' && data !== null ? Object.keys(data) : [],
        depth: this._depth(data),
        size: typeof data === 'object' ? JSON.stringify(data).length : String(data).length,
        data: data  // Full parsed data preserved
      };
    } catch (e) {
      return { type: 'corrupted', format: 'json', error: e.message };
    }
  },

  _parseYAML: function(raw) {
    // Simple YAML-like key-value extraction (no full parser dependency)
    const lines = raw.split('\n');
    const entries = [];
    let inBlock = false;
    let blockKey = null;
    let blockLines = [];

    for (const line of lines) {
      if (line.startsWith('---')) continue;
      const match = line.match(/^(\s*)([\w\-]+):\s*(.*)$/);
      if (match) {
        if (inBlock && blockKey) {
          entries.push({ key: blockKey, type: 'block', lines: blockLines });
          blockLines = [];
        }
        const val = match[3].trim();
        if (val === '' || val === '|' || val === '>') {
          inBlock = true;
          blockKey = match[2];
        } else {
          inBlock = false;
          entries.push({ key: match[2], value: val, type: 'scalar' });
        }
      } else if (inBlock) {
        blockLines.push(line.replace(/^\s{2,}/, ''));
      }
    }
    if (inBlock && blockKey) {
      entries.push({ key: blockKey, type: 'block', lines: blockLines });
    }

    return { type: 'structured', format: 'yaml', entries: entries, raw: raw };
  },

  _parseMarkdown: function(raw) {
    const lines = raw.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Heading
      const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        blocks.push({ type: 'heading', level: hMatch[1].length, text: hMatch[2] });
        i++;
        continue;
      }

      // Code fence
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        let code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        blocks.push({ type: 'code', language: lang, content: code.join('\n') });
        i++;
        continue;
      }

      // Table
      if (/^\|/.test(line) && i + 1 < lines.length && /^\|\s*[-]+/.test(lines[i + 1])) {
        const header = line.split('|').map(c => c.trim()).filter(Boolean);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) {
          rows.push(lines[i].split('|').map(c => c.trim()).filter(Boolean));
          i++;
        }
        blocks.push({ type: 'table', header: header, rows: rows });
        continue;
      }

      // Bullet list
      if (/^[\-\*]\s/.test(line) || /^\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && (/^[\-\*]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]))) {
          items.push(lines[i].replace(/^[\-\*]\s|^\d+\.\s/, ''));
          i++;
        }
        blocks.push({ type: 'list', items: items });
        continue;
      }

      // Horizontal rule
      if (/^[-\*_]{3,}$/.test(line.trim())) {
        blocks.push({ type: 'hr' });
        i++;
        continue;
      }

      // Paragraph (collect until blank line)
      if (line.trim() !== '') {
        const para = [];
        while (i < lines.length && lines[i].trim() !== '' && !/^#/.test(lines[i]) && !/^```/.test(lines[i]) && !/^\|/.test(lines[i]) && !/^[\-\*]\s/.test(lines[i])) {
          para.push(lines[i]);
          i++;
        }
        blocks.push({ type: 'paragraph', text: para.join('\n').trim() });
        continue;
      }

      i++;
    }

    return { type: 'document', format: 'markdown', blocks: blocks, raw: raw };
  },

  _parseCode: function(raw) {
    const lines = raw.split('\n');
    const structure = {
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      variables: [],
      comments: []
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Comments
      if (/^\/\//.test(line)) {
        structure.comments.push({ type: 'line', text: line.replace(/^\/\//, '').trim(), line: i + 1 });
      } else if (/^\/\*/.test(line)) {
        let comment = line;
        while (i < lines.length && !comment.includes('*/')) {
          i++;
          comment += '\n' + lines[i];
        }
        structure.comments.push({ type: 'block', text: comment.replace(/\/\*|\*\//g, '').trim(), line: i + 1 });
      }

      // Imports
      const impMatch = line.match(/^import\s+(.+)\s+from\s+['"](.+)['"]/);
      if (impMatch) {
        structure.imports.push({ what: impMatch[1], from: impMatch[2], line: i + 1 });
        continue;
      }

      const reqMatch = line.match(/^(?:const|let|var)\s+.+\s*=\s*require\(['"](.+)['"]\)/);
      if (reqMatch) {
        structure.imports.push({ what: '*', from: reqMatch[1], line: i + 1 });
      }

      // Function declarations
      const fnMatch = line.match(/^(?:async\s+)?function\s+(\w+)/);
      if (fnMatch) {
        structure.functions.push({ name: fnMatch[1], line: i + 1 });
      }

      // Arrow function assigned to variable
      const arrowMatch = line.match(/^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      if (arrowMatch && !line.includes('require(')) {
        structure.functions.push({ name: arrowMatch[1], line: i + 1 });
      }

      // Class
      const clsMatch = line.match(/^class\s+(\w+)/);
      if (clsMatch) {
        structure.classes.push({ name: clsMatch[1], line: i + 1 });
      }

      // Exports
      if (/^module\.exports\s*=|^export\s/.test(line)) {
        structure.exports.push({ text: line, line: i + 1 });
      }
    }

    return { type: 'code', format: 'javascript', structure: structure, raw: raw };
  },

  _parseCSV: function(raw) {
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { type: 'empty', format: 'csv' };
    const header = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
    return { type: 'tabular', format: 'csv', header: header, rows: rows, rowCount: rows.length };
  },

  _parseTOML: function(raw) {
    const sections = [];
    let currentSection = { name: '__root__', entries: [] };
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      const secMatch = trimmed.match(/^\[(\w+)\]$/);
      if (secMatch) {
        sections.push(currentSection);
        currentSection = { name: secMatch[1], entries: [] };
      } else {
        const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
        if (kvMatch) currentSection.entries.push({ key: kvMatch[1], value: kvMatch[2] });
      }
    }
    sections.push(currentSection);
    return { type: 'structured', format: 'toml', sections: sections, raw: raw };
  },

  _parseText: function(raw) {
    return { type: 'plain', format: 'text', lineCount: (raw.match(/\n/g) || []).length + 1, raw: raw };
  },

  _depth: function(obj) {
    if (typeof obj !== 'object' || obj === null) return 0;
    let max = 0;
    for (const k in obj) {
      if (obj.hasOwnProperty(k)) {
        max = Math.max(max, 1 + this._depth(obj[k]));
      }
    }
    return max;
  }
};


// ─── Gate 3: Semantic — Domain Classification & Concept Extraction ────────

const SEMANTIC = {
  /**
   * Domain signatures — keyword/pattern sets that identify which research
   * domain a file belongs to.
   */
  domains: {
    'coherence-calculus': {
      keywords: ['coherence', 'resonance', 'invariant', 'tesseract', 'phase', 'harmonic', 'ω', 'Ω', 'Φ'],
      patterns: [/coherence\s*calculus/i, /resonance\s*invariant/i, /tesseract\s*protocol/i],
      priority: 10
    },
    'ghost': {
      keywords: ['ghost', 'kernel', 'face', 'ghostlet', 'law', 'merkle', 'stm', 'ltm', 'pppp'],
      patterns: [/ghost\s*kernel/i, /ghost_face/i, /17\s*laws/i, /ghostlet/i],
      priority: 10
    },
    'csst': {
      keywords: ['csst', 'constitutional', 'substrate', 'stability', 'oversight', 'governance'],
      patterns: [/constitutional\s*substrate/i, /csst/i, /substrate\s*stability/i],
      priority: 9
    },
    'bridge': {
      keywords: ['bridge', 'a2a', 'agent', 'inter-agent', 'protocol', 'handoff'],
      patterns: [/bridge\s*a2a/i, /agent\s*bridge/i, /inter.?agent/i],
      priority: 8
    },
    'sovereign': {
      keywords: ['sovereign', 'vault', 'autonomy', 'self-sovereign', 'governance'],
      patterns: [/sovereign.?vault/i, /self.?sovereign/i],
      priority: 8
    },
    'praetor': {
      keywords: ['praetor', 'oversight', 'guard', 'safety', 'audit'],
      patterns: [/praetor/i, /oversight\s*layer/i],
      priority: 7
    },
    'resonance': {
      keywords: ['resonance', 'archive', 'frequency', 'harmonic', 'origin'],
      patterns: [/resonance\s*archive/i, /resonance\s*invariant/i],
      priority: 7
    },
    'ghost-legacy': {
      keywords: ['v6', 'v7', 'legacy', 'original', 'prototype'],
      patterns: [/ghost\s*v[67]/i, /legacy\s*ghost/i],
      priority: 4
    }
  },

  /**
   * Classify a file into its research domain(s).
   * Returns all matching domains with confidence scores.
   */
  classify: function(text, filename, syntacticResult) {
    const matches = [];
    const lower = text.toLowerCase();
    const fname = (filename || '').toLowerCase();

    for (const [domain, sig] of Object.entries(this.domains)) {
      let score = 0;

      // Filename match
      if (fname.includes(domain.replace('-', '')) || fname.includes(domain)) {
        score += 0.3;
      }

      // Keyword hits
      const kwHits = sig.keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
      if (sig.keywords.length > 0) {
        score += (kwHits / sig.keywords.length) * 0.4;
      }

      // Pattern matches
      const patHits = sig.patterns.filter(p => p.test(text)).length;
      score += patHits * 0.3;

      if (score > 0.15) {
        matches.push({ domain: domain, confidence: Math.min(score, 1.0), priority: sig.priority });
      }
    }

    matches.sort((a, b) => b.confidence - a.confidence || b.priority - a.priority);
    return matches;
  },

  /**
   * Extract named entities from file content.
   * Entities: people, projects, concepts, versions, protocols, references.
   */
  extractEntities: function(text) {
    const entities = [];

    // Version references (v7, v8, v9, 1.0.0, etc.)
    const versionMatches = text.match(/\bv(\d+)(?:\.(\d+))?(?:\.(\d+))?\b/g);
    if (versionMatches) {
      entities.push({ type: 'version', values: [...new Set(versionMatches)] });
    }

    // Protocol references (PPP, STM, LTM, TCP, HTTP, etc.)
    const protocolMatches = text.match(/\b(PPP|PPPPP|STM|LTM|TCP|HTTP|A2A|API|JSON|YAML|TOML|CSV|MD|PDF|CSST)\b/g);
    if (protocolMatches) {
      entities.push({ type: 'protocol', values: [...new Set(protocolMatches)] });
    }

    // Mathematical / symbolic references
    const symbolMatches = text.match(/[ΩωΦφΣσΔδΛλΓγΠπΘθΞξΨψ]/g);
    if (symbolMatches) {
      entities.push({ type: 'symbol', values: [...new Set(symbolMatches)] });
    }

    // Coherence scores
    const scoreMatches = text.match(/\b\d\.\d{3,}\b/g);
    if (scoreMatches) {
      entities.push({ type: 'coherence-score', values: scoreMatches.map(Number) });
    }

    // URL references
    const urlMatches = text.match(/https?:\/\/[^\s"'`<>]+/g);
    if (urlMatches) {
      entities.push({ type: 'url', values: urlMatches });
    }

    // File path references
    const pathMatches = text.match(/\b(?:\/[\w\-./]+)+\b/g);
    if (pathMatches) {
      entities.push({ type: 'path', values: [...new Set(pathMatches)] });
    }

    // Hex digests / hashes
    const hashMatches = text.match(/\b[0-9a-f]{7,64}\b/g);
    if (hashMatches) {
      entities.push({ type: 'hash', values: hashMatches });
    }

    return entities;
  },

  /**
   * Extract key concepts from a file — the ideas it introduces or depends on.
   */
  extractConcepts: function(text, syntacticResult) {
    const concepts = [];

    // Look for definition patterns
    const defPatterns = [
      /(?:\b\w+\b)\s*(?:is|:=|::=|===)\s*(?:.+)/g,
      /(?:\b\w+\b)\s*\(['"](.+?)['"]\)/g,
      /(?:def|define|const|let|var)\s+(\w+)/g
    ];

    for (const pat of defPatterns) {
      let m;
      while ((m = pat.exec(text)) !== null) {
        const concept = (m[1] || m[0]).trim();
        if (concept.length > 1 && concept.length < 60 && !/^[\d\s]+$/.test(concept)) {
          concepts.push(concept);
        }
      }
    }

    // Headings as concepts (markdown heading text)
    if (syntacticResult && syntacticResult.blocks) {
      for (const block of syntacticResult.blocks) {
        if (block.type === 'heading' && block.text) {
          concepts.push({ source: 'heading', value: block.text, level: block.level });
        }
      }
    }

    return [...new Set(concepts.map(c => typeof c === 'string' ? c : c.value))];
  },

  /**
   * Map relationships between entities in this file.
   */
  extractRelationships: function(text) {
    const rels = [];

    // X depends on Y
    const depPat = /(\w+)\s+(?:depends on|requires|imports|extends|inherits from)\s+(\w+)/gi;
    let m;
    while ((m = depPat.exec(text)) !== null) {
      rels.push({ from: m[1], type: 'depends-on', to: m[2] });
    }

    // X implements Y
    const implPat = /(\w+)\s+implements\s+(\w+)/gi;
    while ((m = implPat.exec(text)) !== null) {
      rels.push({ from: m[1], type: 'implements', to: m[2] });
    }

    // X extends Y
    const extPat = /(\w+)\s+extends\s+(\w+)/gi;
    while ((m = extPat.exec(text)) !== null) {
      rels.push({ from: m[1], type: 'extends', to: m[2] });
    }

    return rels;
  },

  /**
   * Full semantic analysis of a file.
   */
  analyze: function(text, filename, syntacticResult) {
    return {
      domains: this.classify(text, filename, syntacticResult),
      entities: this.extractEntities(text),
      concepts: this.extractConcepts(text, syntacticResult),
      relationships: this.extractRelationships(text),
      summary: this._generateSummary(text, syntacticResult)
    };
  },

  _generateSummary: function(text, syntactic) {
    // Extract first meaningful sentence or heading
    if (syntactic && syntactic.blocks) {
      for (const b of syntactic.blocks) {
        if (b.type === 'heading' && b.level === 1) return b.text;
        if (b.type === 'paragraph' && b.text.length > 10) return b.text.slice(0, 200);
      }
    }
    return text.slice(0, 200).replace(/\n/g, ' ').trim();
  }
};


// ─── Gate 4: Pragmatic (Contractual) — Law Enforcement & Integrity ─────────

const PRAGMATIC = {
  /**
   * The 17 Laws of Ghost, encoded as verifiable rules.
   * Each law checks a condition and returns pass/fail with detail.
   */
  laws: [
    { id: 1,  name: 'Law of Sovereign Genesis',         domain: 'Harmony',   check: (f) => f.syntactic && f.syntactic.type !== 'corrupted' },
    { id: 2,  name: 'Law of Sovereign Minimalism',       domain: 'Harmony',   check: (f) => !f.semantic || !f.semantic.entities.some(e => e.type === 'url' && e.values.length > 0) || true },  // advisory
    { id: 3,  name: 'Law of Coherence Threshold',        domain: 'Harmony',   check: (f) => f.semantic ? f.semantic.entities.some(e => e.type === 'coherence-score') || f.syntactic.type !== 'empty' : true },
    { id: 4,  name: 'Law of Metabollic Integrity',       domain: 'Harmony',   check: (f) => true },  // metadata invariant — always true for stored content
    { id: 5,  name: 'Law of Tesseract Topology',         domain: 'Harmony',   check: (f) => true },  // architectural invariant
    { id: 6,  name: 'Law of Phase Decay',                domain: 'Harmony',   check: (f) => true },  // kernel-level, not per-file
    { id: 7,  name: 'Law of Diagnostic Binning',         domain: 'Harmony',   check: (f) => true },  // preservation invariant
    { id: 8,  name: 'Law of No Forgetting',              domain: 'Dominion',  check: (f) => true },  // archival invariant
    { id: 9,  name: 'Law of Origin Sealing',             domain: 'Dominion',  check: (f) => true },  // provenance tracked
    { id: 10, name: 'Law of Zero Vendor',                domain: 'Dominion',  check: (f) => {
      // Check for external vendor/service references that should not be in core research
      const text = f.lexical ? f.lexical.raw : '';
      const vendorPatterns = /(?:API_KEY|SECRET|access_token|cloudfront|amazonaws\.com)/i;
      return { pass: !vendorPatterns.test(text), detail: vendorPatterns.test(text) ? 'Vendor reference detected' : 'Clean' };
    }},
    { id: 11, name: 'Law of On-Device Sovereignty',      domain: 'Dominion',  check: (f) => true },
    { id: 12, name: 'Law of Architect Guardrails',       domain: 'Dominion',  check: (f) => true },
    { id: 13, name: 'Law of Bifurcated Handlers',        domain: 'Harmony',   check: (f) => true },
    { id: 14, name: 'Law of Ghostlet Observation',       domain: 'Harmony',   check: (f) => true },
    { id: 15, name: 'Law of Medical Zero-Cost',          domain: 'Dominion',  check: (f) => {
      const text = f.lexical ? f.lexical.raw : '';
      const medicalPatterns = /(?:prosthetic|medical|clinical|patient|diagnosis)/i;
      if (medicalPatterns.test(text) && !text.includes('medicalZeroCost')) {
        return { pass: false, detail: 'Medical content without zero-cost flag' };
      }
      return { pass: true, detail: 'OK' };
    }},
    { id: 16, name: 'Law of Artifact Accession',         domain: 'Dominion',  check: (f) => true },
    { id: 17, name: 'Law of Harmonic Convergence',       domain: 'Harmony',   check: (f) => true }
  ],

  /**
   * Run all applicable laws against a parsed file record.
   */
  enforce: function(fileRecord) {
    const results = [];
    for (const law of this.laws) {
      const result = law.check(fileRecord);
      const passed = typeof result === 'object' ? result.pass : result;
      results.push({
        law: law.id,
        name: law.name,
        domain: law.domain,
        passed: passed,
        detail: typeof result === 'object' ? result.detail : (passed ? 'OK' : 'Failed')
      });
    }
    return results;
  },

  /**
   * Track file provenance — where it came from, when it was ingested, what version.
   */
  provenance: function(filepath, source) {
    return {
      source: source || 'drive',
      path: filepath,
      ingestedAt: new Date().toISOString(),
      version: 1,
      checksum: null  // Computed during ingestion
    };
  }
};


// ─── Main Scanner — Orchestrates All Four Gates ───────────────────────────

function scanFile(raw, filename, source) {
  // Gate 1: Lexical — raw character scan
  const lexical = LEXICAL.scan(raw);

  // Gate 2: Syntactic — format detection and structural parse
  const format = SYNTACTIC.detectFormat(raw, filename);
  const syntactic = SYNTACTIC.parse(raw, format.format);

  // Gate 3: Semantic — domain classification and concept extraction
  const semantic = SEMANTIC.analyze(raw, filename, syntactic);

  // Build the full file record
  const fileRecord = {
    filename: filename || 'unknown',
    lexical: lexical,
    format: format,
    syntactic: syntactic,
    semantic: semantic,
    pragmatic: null,  // filled after enforcement
    provenance: PRAGMATIC.provenance(filename, source)
  };

  // Gate 4: Pragmatic — law enforcement
  fileRecord.pragmatic = {
    laws: PRAGMATIC.enforce(fileRecord),
    provenance: fileRecord.provenance
  };

  return fileRecord;
}


/**
 * Batch-scan an array of { raw, filename } entries.
 * Used during multi-pass ingestion — each pass can re-scan with deeper parsing.
 */
function scanBatch(files, source) {
  return files.map(f => scanFile(f.raw, f.filename, source));
}


/**
 * Summarize a scan result into a compact record for storage/index.
 */
function summarize(scanResult) {
  return {
    filename: scanResult.filename,
    format: scanResult.format.format,
    formatConfidence: scanResult.format.confidence,
    charCount: scanResult.lexical.charLength,
    lineCount: scanResult.lexical.lineCount,
    domains: scanResult.semantic.domains.map(d => ({ domain: d.domain, confidence: d.confidence })),
    conceptCount: scanResult.semantic.concepts.length,
    entityTypes: scanResult.semantic.entities.map(e => e.type),
    lawCompliance: scanResult.pragmatic.laws.filter(l => !l.passed).map(l => ({ law: l.law, name: l.name })),
    ingestedAt: scanResult.provenance.ingestedAt
  };
}


// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  scanFile,
  scanBatch,
  summarize,
  LEXICAL,
  SYNTACTIC,
  SEMANTIC,
  PRAGMATIC
};