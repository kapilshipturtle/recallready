import test from 'node:test';
import assert from 'node:assert/strict';
import { textToAdf, docFromBlocks } from '../src/lib/adf.js';

test('plain text lines become paragraphs, blank lines dropped', () => {
  const doc = textToAdf('First line\n\nSecond line');
  assert.equal(doc.type, 'doc');
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.content.map((p) => p.content[0].text), ['First line', 'Second line']);
});

test('blocks support headings, links and bullet lists', () => {
  const doc = docFromBlocks([
    { heading: 'What is affected' },
    { text: 'Source: ', link: { text: 'FDA H-1', href: 'https://example.com/r' } },
    { bullets: ['Lot 26I01A', 'Lot 26J10A'] },
  ]);
  assert.equal(doc.content[0].type, 'heading');
  assert.equal(doc.content[1].content[1].marks[0].attrs.href, 'https://example.com/r');
  assert.equal(doc.content[2].type, 'bulletList');
  assert.equal(doc.content[2].content.length, 2);
});
