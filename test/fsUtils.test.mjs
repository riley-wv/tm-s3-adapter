import test from 'node:test';
import assert from 'node:assert/strict';

import { safeJoin } from '../src/shared/fsUtils.mjs';

test('safeJoin resolves file under base directory', () => {
  const path = safeJoin('/tmp/base', 'nested/file.txt');
  assert.equal(path, '/tmp/base/nested/file.txt');
});

test('safeJoin rejects path traversal', () => {
  assert.throws(() => safeJoin('/tmp/base', '../etc/passwd'), /Invalid path/);
});
