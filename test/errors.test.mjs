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

import { isMissingAssets } from '../src/lib/errors.js';

test('a 401 consent error is not "Assets missing"', () => {
  const consent = Object.assign(new Error('Authentication Required'), { name: 'NEEDS_AUTHENTICATION_ERR', status: 401 });
  assert.throws(() => isMissingAssets(consent), (e) => e === consent);
});

test('403 and 404 from the workspace endpoint mean Assets is missing', () => {
  assert.equal(isMissingAssets(Object.assign(new Error('x'), { status: 404 })), true);
  assert.equal(isMissingAssets(Object.assign(new Error('x'), { status: 403 })), true);
  assert.equal(isMissingAssets(Object.assign(new Error('x'), { status: 500 })), false);
});
