import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLineItem } from '../src/parse.js';

test('bin and lid the same colour, written as "complete"', () => {
  const r = parseLineItem('240L bin purple complete');
  assert.equal(r.size, '240L');
  assert.equal(r.kind, 'complete');
  assert.equal(r.binColour, 'Purple');
  assert.equal(r.lidColour, 'Purple');
  assert.equal(r.product, '240L Bin Purple Complete');
  assert.deepEqual(r.review, []);
});

test('bin and lid colours written separately', () => {
  const r = parseLineItem('240L Wheelie Bin Dark Green/Light Blue Lid');
  assert.equal(r.size, '240L');
  assert.equal(r.kind, 'bin+lid');
  assert.equal(r.binColour, 'Dark Green');
  assert.equal(r.lidColour, 'Light Blue');
  assert.deepEqual(r.review, []);
});

test('lid on its own, with the colour written before the size', () => {
  const r = parseLineItem('Red 240L Vermin lid');
  assert.equal(r.size, '240L');
  assert.equal(r.kind, 'lid');
  assert.equal(r.binColour, '');
  assert.equal(r.lidColour, 'Red');
  assert.equal(r.variant, 'Vermin');
  assert.equal(r.product, '240L Red Vermin Lid');
});

test('bin on its own', () => {
  const r = parseLineItem('660L Bin Green');
  assert.equal(r.kind, 'bin');
  assert.equal(r.binColour, 'Green');
  assert.equal(r.lidColour, '');
  assert.equal(r.product, '660L Bin Green');
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
