import test from 'node:test';
import assert from 'node:assert/strict';
import { resultFromError } from '../src/lib/errors.js';

test('ordinary errors become a message result', () => {
  assert.deepEqual(resultFromError(new Error('Choose a project')), { ok: false, message: 'Choose a project' });
});

test('the consent error is re-thrown so Forge can show "Allow access"', () => {
  const consent = Object.assign(new Error('Authentication Required'), { name: 'NEEDS_AUTHENTICATION_ERR' });
  assert.throws(() => resultFromError(consent), (e) => e === consent);
});
