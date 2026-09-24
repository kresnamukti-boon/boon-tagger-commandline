// Unit tests for the pure, DOM-free modules under src/core/ — run directly
// against those ES modules (`node --test test/`), not against the built
// dist/rw_cmdline.js the way verify_cmdline.js does. Complements, never
// replaces, verify_cmdline.js: that harness is still this project's only
// safety net for anything DOM/host-shaped (see CLAUDE.md's "Build / verify
// commands"). This file starts empty — the restructure plan's P2 adds the
// first real module (src/core/command-line-core.js) and its tests here.
import test from 'node:test';
import assert from 'node:assert/strict';

test('placeholder — replaced once src/core/ has its first module', () => {
  assert.equal(1 + 1, 2);
});
