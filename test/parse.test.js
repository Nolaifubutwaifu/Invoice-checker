import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLineItem } from '../src/parse.js';

/** Compact view of the components a description expands to. */
const shape = (description) =>
  parseLineItem(description).components.map(
    (c) => `${c.product} (${c.priced ? 'priced' : 'bundled'})`,
  );

test('a complete set becomes a bin row and a lid row of the same colour', () => {
  const r = parseLineItem('240L bin purple complete');
  assert.equal(r.size, '240L');
  assert.equal(r.kind, 'complete');
  assert.equal(r.soldAs, 'Complete set');
  assert.deepEqual(shape('240L bin purple complete'), [
    '240L Bin Purple (priced)',
    '240L Lid Purple (bundled)',
  ]);
  assert.deepEqual(r.review, []);
});

test('bin and lid colours written separately become two rows', () => {
  const r = parseLineItem('240L Wheelie Bin Dark Green/Light Blue Lid');
  assert.equal(r.kind, 'bin+lid');
  assert.equal(r.soldAs, 'Bin + lid');
  assert.deepEqual(shape('240L Wheelie Bin Dark Green/Light Blue Lid'), [
    '240L Bin Dark Green (priced)',
    '240L Lid Light Blue (bundled)',
  ]);
  assert.deepEqual(r.review, []);
});

test('lid on its own is a single row', () => {
  const r = parseLineItem('Red 240L Vermin lid');
  assert.equal(r.size, '240L');
  assert.equal(r.kind, 'lid');
  assert.equal(r.variant, 'Vermin');
  assert.deepEqual(shape('Red 240L Vermin lid'), ['240L Vermin Lid Red (priced)']);
});

test('bin on its own is a single row', () => {
  const r = parseLineItem('660L Bin Green');
  assert.equal(r.kind, 'bin');
  assert.equal(r.soldAs, 'Bin only');
  assert.deepEqual(shape('660L Bin Green'), ['660L Bin Green (priced)']);
});

test('only one component of a bundled line carries the money', () => {
  const priced = parseLineItem('240L bin purple complete').components.filter((c) => c.priced);
  assert.equal(priced.length, 1, 'exactly one component should be priced');
  assert.equal(priced[0].component, 'Bin');
});

test('colour assignment is case insensitive', () => {
  const r = parseLineItem('1100L bin black/yellow lid');
  assert.equal(r.binColour, 'Black');
  assert.equal(r.lidColour, 'Yellow');
});

test('two-word colours are not truncated to the base colour', () => {
  assert.equal(parseLineItem('240L bin dark blue complete').binColour, 'Dark Blue');
  assert.equal(parseLineItem('240L bin lime green complete').binColour, 'Lime Green');
});

test('American spelling is normalised to grey', () => {
  assert.equal(parseLineItem('240L bin gray complete').binColour, 'Grey');
});

test.describe('lines that are not bin or lid sales', () => {
  const notProducts = [
    '1100L Lid Pins',
    '1100L Drain plugs',
    '80L HD Wheels',
    '80L Axel',
    'Freight',
    'Pickup',
    '240L Bin Wheels',
    'Bin lid hinges',
  ];

  for (const description of notProducts) {
    test(`skips "${description}"`, () => {
      assert.equal(parseLineItem(description), null);
    });
  }
});

test('an accessory bundled with a bin does not disqualify the line', () => {
  const r = parseLineItem('240L Bin Green Complete with Lock');
  assert.notEqual(r, null);
  assert.equal(r.binColour, 'Green');
  assert.equal(r.kind, 'complete');
});

test('a missing size is flagged for review rather than dropped', () => {
  const r = parseLineItem('Wheelie bin blue complete');
  assert.equal(r.size, '');
  assert.equal(r.binColour, 'Blue');
  assert.ok(r.review.includes('no size found'));
});

test('a missing colour is flagged for review', () => {
  const r = parseLineItem('240L bin complete');
  assert.equal(r.size, '240L');
  assert.ok(r.review.includes('no colour found'));
});

test('empty and non-product input returns null', () => {
  assert.equal(parseLineItem(''), null);
  assert.equal(parseLineItem(null), null);
  assert.equal(parseLineItem('Notes'), null);
});

test('litre spelled out is still recognised as a size', () => {
  assert.equal(parseLineItem('240 Litre bin red complete').size, '240L');
});
