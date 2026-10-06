// Unit tests for src/core/pipe-log-core.js (the bar's in-memory action log).
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendLog, makeLogEntry, parseRevision, formatLog } from '../src/core/pipe-log-core.js';
import { PIPE_LOG_MAX } from '../src/pipe/pipe-tables.js';

test('PIPE_LOG_MAX is 50', () => assert.equal(PIPE_LOG_MAX, 50));

test('appendLog: keeps only the newest `max`, in order, and never mutates its input', () => {
  const base = [1, 2, 3];
  const out = appendLog(base, 4, 3);
  assert.deepEqual(out, [2, 3, 4]);
  assert.deepEqual(base, [1, 2, 3], 'input untouched');
  assert.deepEqual(appendLog(undefined, 'a', 5), ['a']);
  assert.deepEqual(appendLog([], 'a', 0), ['a'], 'a nonsense cap keeps at least the newest entry');
  assert.deepEqual(appendLog([], 'a', NaN), ['a']);
  let log = [];
  for (let i = 0; i < 60; i++) log = appendLog(log, i, PIPE_LOG_MAX);
  assert.equal(log.length, 50);
  assert.deepEqual([log[0], log[49]], [10, 59]);
});

test('makeLogEntry: time, kind, what, hint, tool, revision before; after starts empty', () => {
  const e = makeLogEntry({ at: Date.UTC(2026, 9, 6, 9, 0, 0), what: 'clicked Finish (fixture)', kind: 'finish', hint: 'Finish inserts this fitting.', tool: 'fixture', revBefore: 13 });
  assert.deepEqual(e, {
    at: Date.UTC(2026, 9, 6, 9, 0, 0), time: '2026-10-06T09:00:00.000Z', kind: 'finish', what: 'clicked Finish (fixture)',
    hint: 'Finish inserts this fitting.', tool: 'fixture', revBefore: 13, revAfter: null,
  });
  const bare = makeLogEntry({ at: 0 });
  assert.deepEqual([bare.kind, bare.what, bare.hint, bare.tool, bare.revBefore], ['', '', '', null, null]);
  assert.equal(makeLogEntry({ at: 0, revBefore: NaN }).revBefore, null);
});

test('parseRevision: "R14", 14, and unreadable', () => {
  assert.equal(parseRevision('R14'), 14);
  assert.equal(parseRevision(' R4 '), 4);
  assert.equal(parseRevision(15), 15);
  assert.equal(parseRevision(NaN), null);
  assert.equal(parseRevision('Synced'), null);
  assert.equal(parseRevision(undefined), null);
});

test('formatLog: one short line per entry, "?" while revision-after is unknown', () => {
  const a = makeLogEntry({ at: 0, what: 'tool route', kind: 'tool', hint: '', tool: 'select', revBefore: 4 });
  const lines = formatLog([a, { ...a, revAfter: 5 }]);
  assert.match(lines[0], /tool route {2}\[R4 -> \?\]/);
  assert.match(lines[1], /\[R4 -> R5\]/);
  assert.deepEqual(formatLog(undefined), []);
});
