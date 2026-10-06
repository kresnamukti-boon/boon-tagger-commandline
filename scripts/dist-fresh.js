// Is a built file up to date? Decided by CONTENT, never by file times: rebuild in memory and compare.
// (File times lie after a git clone or checkout: every file gets "now", so an mtime check reports "stale"
// even when a rebuild would be byte-identical.) Writes nothing.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const norm = (text) => String(text).replace(/\r\n/g, '\n'); // a checkout with CRLF line endings is the same content

// { fresh, reason } for one built file. `build` returns what the file should contain.
function builtFileFresh({ file, build, hint }) {
  if (!fs.existsSync(file)) return { fresh: false, reason: `${path.relative(ROOT, file)} is missing: ${hint}` };
  let expected;
  try { expected = build(); } catch (err) { return { fresh: false, reason: `could not rebuild ${path.relative(ROOT, file)} in memory: ${err.message}` }; }
  if (norm(fs.readFileSync(file, 'utf8')) !== norm(expected)) {
    return { fresh: false, reason: `${path.relative(ROOT, file)} does not match what its sources build to: ${hint}` };
  }
  return { fresh: true, reason: '' };
}

function ductFresh() {
  const { buildDist } = require('./build-dist.js');
  return builtFileFresh({
    file: path.join(ROOT, 'dist', 'rw_cmdline.js'), build: () => buildDist().source,
    hint: 'run `bash build_loader.sh` first.',
  });
}

function pipeFresh() {
  const { buildPipeDist } = require('./build-pipe-dist.js');
  const { buildPipeLoader } = require('./build-pipe-loader.js');
  const dist = builtFileFresh({
    file: path.join(ROOT, 'dist', 'rw_pipe_cmdline.js'), build: () => buildPipeDist().source,
    hint: 'run `bash build_pipe_loader.sh` first.',
  });
  if (!dist.fresh) return dist;
  return builtFileFresh({
    file: path.join(ROOT, 'console_loader_pipe.js'), build: () => buildPipeLoader(buildPipeDist().source),
    hint: 'run `bash build_pipe_loader.sh` first.',
  });
}

module.exports = { builtFileFresh, ductFresh, pipeFresh, norm };
