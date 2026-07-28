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
  assert.deepEqual(shape('240L bin purple complete'), [
    '240L Bin Purple (priced)',
    '240L Lid Purple (bundled)',
  ]);
  assert.deepEqual(r.review, []);
});

test('bin and lid colours written separately become two rows', () => {
  const r = parseLineItem('240L Wheelie Bin Dark Green/Light Blue Lid');
  assert.equal(r.kind, 'bin+lid');
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

test.describe('every colour in the product catalog', () => {
  // The full colour list from the inventory-app catalog. Six of these used to
  // collapse to their base word — "Council Green" came back as "Green" — which
  // silently invented products that do not exist.
  const catalogColours = [
    'Black', 'Council Green', 'Dark Green', 'Dark Grey', 'Grass Green',
    'Light Blue', 'Light Grey', 'Lime Green', 'Mud Green', 'Orange', 'Purple',
    'Red', 'Red (AJ Bush)', 'Royal Blue', 'Sky Blue', 'Ugly Purple', 'Ugly Red',
    'White', 'Yellow',
  ];

  for (const colour of catalogColours) {
    test(`reads "${colour}" whole`, () => {
      const r = parseLineItem(`240L bin ${colour} complete`);
      assert.equal(r.binColour, colour);
      assert.equal(r.lidColour, colour);
      assert.deepEqual(r.review, [], 'a catalog colour should never be flagged');
    });

    test(`reads "${colour}" written in lower case`, () => {
      assert.equal(parseLineItem(`240L bin ${colour.toLowerCase()} complete`).binColour, colour);
    });
  }
});

test('a qualified colour beats the bare colour inside it', () => {
  // The whole point of the fix: longest match wins.
  assert.equal(parseLineItem('240L bin council green complete').binColour, 'Council Green');
  assert.equal(parseLineItem('240L bin green complete').binColour, 'Green');
});

test('a colour outside the catalog is recorded but flagged', () => {
  const r = parseLineItem('240L bin teal complete');
  assert.equal(r.binColour, 'Teal');
  assert.ok(
    r.review.some((m) => m.includes('not in the product catalog')),
    'expected an off-catalog colour to be flagged',
  );
});

test('punctuation in a colour name is optional', () => {
  assert.equal(parseLineItem('240L bin Red (AJ Bush) complete').binColour, 'Red (AJ Bush)');
  assert.equal(parseLineItem('240L bin Red AJ Bush complete').binColour, 'Red (AJ Bush)');
});

test('a colour name is not matched inside a longer word', () => {
  assert.equal(parseLineItem('240L bin Greenway complete').binColour, '');
});

test('the variant survives a colour containing punctuation', () => {
  const r = parseLineItem('240L Vermin lid Red (AJ Bush)');
  assert.equal(r.lidColour, 'Red (AJ Bush)');
  assert.equal(r.variant, 'Vermin');
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
